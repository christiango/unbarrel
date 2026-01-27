import * as fs from 'node:fs';
import * as babel from '@babel/core';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { flattenExportStar } from './flattenExportStar';
import { getExportDefinitionFromReExport } from './getExportDefinitionFromReExport';
import { parseTypescriptFile } from './parseUtils';
import { isBarrelFileReference } from './getIssuesInBarrelFile';
import { isInternalModule } from './importUtils';

interface ExportStartStatement {
  type: 'exportStar';
  sourcePath: string;
  nodePath: babel.NodePath<t.ExportAllDeclaration>;
}

interface ExportNamedDeclarationStatement {
  type: 'exportNamedDeclaration';
  sourcePath: string;
  nodePath: babel.NodePath<t.ExportNamedDeclaration>;
}

type ExportStatement = ExportStartStatement | ExportNamedDeclarationStatement;

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
          existingExportForPath.node.specifiers.push(...path.node.specifiers);
          path.remove();
        } else {
          pathToExportMap.set(path.node.source.value, path);
        }
      }
    },
  });
}

/**
 * Fixes any issues in the specified barrel file.
 * This includes flattening `export *` statements into explicit named exports
 * and resolving exports that reference other barrel files to point directly
 * to their true source modules. The file is modified in place.
 * @param absoluteFilePath - the absolute path of the barrel file to fix
 */
export function fixIssuesInBarrelFile(absoluteFilePath: string) {
  const ast = parseTypescriptFile(absoluteFilePath);

  const exportStatements: ExportStatement[] = [];

  let astModified = false;

  traverse(ast, {
    ExportNamedDeclaration(path) {
      if (!path.node.source) return;

      const sourcePath = path.node.source.value;

      exportStatements.push({ type: 'exportNamedDeclaration', sourcePath, nodePath: path });
    },

    ExportAllDeclaration(path) {
      exportStatements.push({ type: 'exportStar', sourcePath: path.node.source.value, nodePath: path });
    },
  });

  // Now go through all export statements and perform the flattening of export star and resolving of re-exports
  for (const exportStatement of exportStatements) {
    if (exportStatement.type === 'exportStar') {
      const flattened = flattenExportStar(absoluteFilePath, exportStatement.nodePath.node.source.value);

      const exportNamedDeclarations: t.ExportNamedDeclaration[] = [];

      const isTypeOnlyExportStar = exportStatement.nodePath.node.exportKind === 'type';

      for (const resolvedModuleDefinition of flattened) {
        const specifier = t.exportSpecifier(
          t.identifier(resolvedModuleDefinition.importedName),
          t.identifier(resolvedModuleDefinition.exportedName)
        );

        // For export type star statements, make all the generated specifiers type only
        if (resolvedModuleDefinition.typeOnly || isTypeOnlyExportStar) {
          specifier.exportKind = 'type';
        }

        exportNamedDeclarations.push(
          t.exportNamedDeclaration(null, [specifier], t.stringLiteral(resolvedModuleDefinition.importPath))
        );
      }

      exportStatement.nodePath.replaceWithMultiple(exportNamedDeclarations);

      astModified = true;
    } else {
      for (const specifier of exportStatement.nodePath.node.specifiers) {
        if (specifier.type === 'ExportSpecifier' && specifier.exported.type === 'Identifier') {
          const exportedName = specifier.exported.name;
          const importedName = specifier.local.name;

          // If this export points to another barrel file, let's replace it with a direct reference to the true source module
          if (
            isInternalModule(exportStatement.sourcePath) &&
            isBarrelFileReference(absoluteFilePath, exportStatement.sourcePath, importedName)
          ) {
            const typeOnly = specifier.exportKind === 'type' || exportStatement.nodePath.node.exportKind === 'type';
            const resolvedExport = getExportDefinitionFromReExport(absoluteFilePath, {
              type: importedName === 'default' ? 'defaultExport' : 'namedExport',
              importedName,
              exportedName,
              importPath: exportStatement.sourcePath,
              typeOnly,
            });

            // Add a new export statement to the true path
            exportStatement.nodePath.insertAfter(
              t.exportNamedDeclaration(
                null,
                [
                  t.exportSpecifier(
                    t.identifier(resolvedExport.importedName),
                    t.identifier(resolvedExport.exportedName)
                  ),
                ],
                t.stringLiteral(resolvedExport.importPath)
              )
            );

            // Remove the specifier from the current export statement
            exportStatement.nodePath.node.specifiers = exportStatement.nodePath.node.specifiers.filter(
              (s) => s !== specifier
            );

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
