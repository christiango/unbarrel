import * as fs from 'node:fs';
import * as babel from '@babel/core';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { flattenExportStar } from './flattenExportStar';
import { getExportDefinitionFromReExport } from './getExportDefinitionFromReExport';
import { parseTypescriptFile } from './parseUtils';
import { isBarrelFileReference } from './getIssuesInBarrelFile';
import { hasIgnoreComment } from './ignoreComment';
import { isInternalModule } from './importUtils';

/** After all the processing has been done */
function cleanupExportsInAST(ast: babel.types.File) {
  // Map to the first export statement with a given path
  const pathToExportMap = new Map<string, babel.NodePath<t.ExportNamedDeclaration>>();

  traverse(ast, {
    ExportNamedDeclaration(path) {
      if (path.node.source) {
        if (path.node.specifiers.length === 0) {
          // If there are no specifiers left, remove the export statement
          path.remove();
          return;
        }

        const existingExportForPath = pathToExportMap.get(path.node.source.value);
        if (existingExportForPath) {
          // If we have seen the same path already, merge the specifiers and remove the current one
          const specifiersSet = new Map<string, t.ExportSpecifier>();

          for (const specifier of existingExportForPath.node.specifiers) {
            if (specifier.type === 'ExportSpecifier' && specifier.exported.type === 'Identifier') {
              specifiersSet.set(specifier.exported.name, specifier);
            }
          }

          // If the existing export statement is an export type {} statement, let's switch it to export { type foo } style statements for better merging
          if (existingExportForPath.node.exportKind === 'type') {
            existingExportForPath.node.exportKind = 'value';
            for (const specifier of existingExportForPath.node.specifiers) {
              if (specifier.type === 'ExportSpecifier') {
                specifier.exportKind = 'type';
              }
            }
          }

          // If the current export statement is also an export type {} statement, switch it to export { type foo } style
          if (path.node.exportKind === 'type') {
            path.node.exportKind = 'value';
            for (const specifier of path.node.specifiers) {
              if (specifier.type === 'ExportSpecifier') {
                specifier.exportKind = 'type';
              }
            }
          }

          for (const specifier of path.node.specifiers) {
            if (specifier.type === 'ExportSpecifier' && specifier.exported.type === 'Identifier') {
              const exportedName = specifier.exported.name;

              const existingSpecifier = specifiersSet.get(exportedName);
              if (!existingSpecifier) {
                specifiersSet.set(exportedName, specifier);
                existingExportForPath.node.specifiers.push(specifier);
              } else {
                // If we've seen the specifier already, we need to make sure that if it was a type only export and this one is a value export we upgrade to a value export
                if (existingSpecifier.exportKind === 'type' && specifier.exportKind !== 'type') {
                  existingSpecifier.exportKind = 'value';
                }
              }
            }
          }
          path.remove();
        } else {
          pathToExportMap.set(path.node.source.value, path);
        }
      }
    },
  });
}

export interface EnabledFixes {
  /** Flatten `export *` statements into explicit named exports. */
  flattenExportStar?: boolean;
  /** Resolve re-exports that reference other barrel files to point directly to their true source modules. */
  fixBarrelReferences?: boolean;
}

export interface FixIssuesInBarrelFileOptions {
  /**
   * Specifies which fixes to apply. If not set, all fixes are enabled.
   * When set, only the fixes explicitly set to `true` will run.
   */
  enabledFixes?: EnabledFixes;
}

/**
 * Fixes any issues in the specified barrel file.
 * This includes flattening `export *` statements into explicit named exports
 * and resolving exports that reference other barrel files to point directly
 * to their true source modules. The file is modified in place.
 * @param absoluteFilePath - the absolute path of the barrel file to fix
 * @param options - optional configuration for the fix behavior
 */
export function fixIssuesInBarrelFile(absoluteFilePath: string, options: FixIssuesInBarrelFileOptions = {}) {
  const allFixesEnabled = options.enabledFixes === undefined;
  const shouldFlattenExportStar = allFixesEnabled || options.enabledFixes?.flattenExportStar === true;
  const shouldFixBarrelReferences = allFixesEnabled || options.enabledFixes?.fixBarrelReferences === true;
  const ast = parseTypescriptFile(absoluteFilePath);

  let astModified = false;

  // Pass 1: Flatten export * statements into explicit named exports, using the original import path.
  // The barrel reference fix in Pass 2 will then resolve any of those that point through barrel files.
  if (shouldFlattenExportStar) {
    traverse(ast, {
      ExportAllDeclaration(path) {
        if (hasIgnoreComment(path.node)) return;
        if (!isInternalModule(path.node.source.value)) return;

        const flattened = flattenExportStar(absoluteFilePath, path.node.source.value);
        const isTypeOnlyExportStar = path.node.exportKind === 'type';
        const exportNamedDeclarations: t.ExportNamedDeclaration[] = [];

        for (const resolvedModuleDefinition of flattened) {
          const specifier = t.exportSpecifier(
            t.identifier(resolvedModuleDefinition.importedName),
            t.identifier(resolvedModuleDefinition.exportedName)
          );

          // For export type * statements, mark all generated specifiers as type-only
          if (resolvedModuleDefinition.typeOnly || isTypeOnlyExportStar) {
            specifier.exportKind = 'type';
          }

          exportNamedDeclarations.push(
            t.exportNamedDeclaration(null, [specifier], t.stringLiteral(resolvedModuleDefinition.importPath))
          );
        }

        path.replaceWithMultiple(exportNamedDeclarations);
        astModified = true;
      },
    });
  }

  // Pass 2: Fix barrel file references in all ExportNamedDeclaration nodes. A second traversal is
  // used so that nodes generated by Pass 1 (which are now in the AST) are included.
  if (shouldFixBarrelReferences) {
    const namedExportPaths: babel.NodePath<t.ExportNamedDeclaration>[] = [];

    traverse(ast, {
      ExportNamedDeclaration(path) {
        if (!path.node.source) return;
        if (hasIgnoreComment(path.node)) return;
        namedExportPaths.push(path);
      },
    });

    for (const nodePath of namedExportPaths) {
      const sourcePath = nodePath.node.source!.value;
      if (!isInternalModule(sourcePath)) continue;

      for (const specifier of nodePath.node.specifiers) {
        if (specifier.type === 'ExportSpecifier' && specifier.exported.type === 'Identifier') {
          const exportedName = specifier.exported.name;
          const importedName = specifier.local.name;

          // If this export points to another barrel file, replace it with a direct reference to the true source module
          if (isBarrelFileReference(absoluteFilePath, sourcePath, importedName)) {
            const typeOnly = specifier.exportKind === 'type' || nodePath.node.exportKind === 'type';
            const resolvedExport = getExportDefinitionFromReExport(absoluteFilePath, {
              type: importedName === 'default' ? 'defaultExport' : 'namedExport',
              importedName,
              exportedName,
              importPath: sourcePath,
              typeOnly,
            });

            // Add a new export statement pointing directly to the true source module
            const newSpecifier = t.exportSpecifier(
              t.identifier(resolvedExport.importedName),
              t.identifier(resolvedExport.exportedName)
            );

            // Preserve the type-only flag
            if (resolvedExport.typeOnly) {
              newSpecifier.exportKind = 'type';
            }

            nodePath.insertAfter(
              t.exportNamedDeclaration(null, [newSpecifier], t.stringLiteral(resolvedExport.importPath))
            );

            // Remove the specifier from the original export statement
            nodePath.node.specifiers = nodePath.node.specifiers.filter((s) => s !== specifier);

            astModified = true;
          }
        }
      }
    }
  }

  // Write output if any changes were made
  if (astModified) {
    cleanupExportsInAST(ast);
    const output = generate(ast, { retainLines: false, comments: true });
    fs.writeFileSync(absoluteFilePath, output.code, 'utf8');
  }
}
