import * as fs from 'node:fs';
import * as babel from '@babel/core';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { flattenExportStar } from './flattenExportStar';
import { getExportDefinitionFromReExport, ResolvedModuleDefinition } from './getExportDefinitionFromReExport';
import { parseTypescriptFile } from './parseUtils';
import { isBarrelFileReference } from './getIssuesInBarrelFile';
import { isInternalModule } from './importUtils';

/**
 * Groups resolved exports by their import path
 */
function groupExportsByPath(exports: ResolvedModuleDefinition[]): Map<string, ResolvedModuleDefinition[]> {
  const grouped = new Map<string, ResolvedModuleDefinition[]>();
  for (const exp of exports) {
    const list = grouped.get(exp.importPath) || [];
    list.push(exp);
    grouped.set(exp.importPath, list);
  }
  return grouped;
}

/**
 * Deduplicates exports by exportedName.
 * Value exports take precedence over type-only exports.
 */
function deduplicateExports(exports: ResolvedModuleDefinition[]): ResolvedModuleDefinition[] {
  const byName = new Map<string, ResolvedModuleDefinition>();
  for (const exp of exports) {
    const existing = byName.get(exp.exportedName);
    if (!existing || (existing.typeOnly && !exp.typeOnly)) {
      byName.set(exp.exportedName, exp);
    }
  }
  return Array.from(byName.values());
}

/**
 * Creates an export specifier AST node from a resolved export
 */
function createExportSpecifier(exp: ResolvedModuleDefinition): t.ExportSpecifier {
  const specifier = t.exportSpecifier(t.identifier(exp.importedName), t.identifier(exp.exportedName));
  if (exp.typeOnly) {
    specifier.exportKind = 'type';
  }
  return specifier;
}

interface ExistingNamedExport {
  path: babel.NodePath<t.ExportNamedDeclaration>;
  sourcePath: string;
}

interface ExistingExportInfo {
  namedExport: ExistingNamedExport;
  specifierIndex: number;
  typeOnly: boolean;
}

/**
 * Fixes barrel file references by resolving exports to their true source
 */
function fixBarrelFileReferences(
  absoluteFilePath: string,
  nodesToFix: babel.NodePath<t.ExportNamedDeclaration>[],
  barrelRefNames: Set<string>
) {
  for (const nodePath of nodesToFix) {
    const sourcePath = nodePath.node.source!.value;
    const resolvedByPath = new Map<string, t.ExportSpecifier[]>();
    const unchangedSpecifiers: t.ExportSpecifier[] = [];

    for (const specifier of nodePath.node.specifiers) {
      if (specifier.type !== 'ExportSpecifier' || specifier.exported.type !== 'Identifier') {
        continue;
      }

      const exportedName = specifier.exported.name;
      const importedName = specifier.local.name;
      const typeOnly = specifier.exportKind === 'type' || nodePath.node.exportKind === 'type';

      if (!barrelRefNames.has(exportedName)) {
        unchangedSpecifiers.push(specifier);
        continue;
      }

      // Resolve this export to its true source
      const resolved = getExportDefinitionFromReExport(absoluteFilePath, {
        type: importedName === 'default' ? 'defaultExport' : 'namedExport',
        importedName,
        exportedName,
        importPath: sourcePath,
        typeOnly,
      });

      const newSpecifier = t.exportSpecifier(t.identifier(resolved.importedName), t.identifier(resolved.exportedName));
      if (resolved.typeOnly || typeOnly) {
        newSpecifier.exportKind = 'type';
      }

      const list = resolvedByPath.get(resolved.importPath) || [];
      list.push(newSpecifier);
      resolvedByPath.set(resolved.importPath, list);
    }

    // Build replacement statements
    const newStatements: t.ExportNamedDeclaration[] = [];

    if (unchangedSpecifiers.length > 0) {
      newStatements.push(t.exportNamedDeclaration(null, unchangedSpecifiers, t.stringLiteral(sourcePath)));
    }

    for (const [importPath, specifiers] of resolvedByPath) {
      newStatements.push(t.exportNamedDeclaration(null, specifiers, t.stringLiteral(importPath)));
    }

    if (newStatements.length > 0) {
      nodePath.replaceWithMultiple(newStatements);
    } else {
      nodePath.remove();
    }
  }
}

/**
 * Fixes any issues in the referenced barrel file.
 * @param absoluteFilePath - the absolute path of the barrel file to fix
 */
export function fixIssuesInBarrelFile(absoluteFilePath: string) {
  const ast = parseTypescriptFile(absoluteFilePath);

  // Collect all exports and detect issues in a single traverse pass
  const existingExportsByName = new Map<string, ExistingExportInfo>();
  const existingStatementsByPath = new Map<string, ExistingNamedExport>();
  const exportStarPaths: babel.NodePath<t.ExportAllDeclaration>[] = [];
  const allFlattenedExports: ResolvedModuleDefinition[] = [];
  const barrelRefExportsToFix: babel.NodePath<t.ExportNamedDeclaration>[] = [];
  const barrelFileRefs = new Set<string>();

  traverse(ast, {
    ExportNamedDeclaration(path) {
      if (!path.node.source) return;

      const sourcePath = path.node.source.value;
      const namedExport: ExistingNamedExport = {
        path,
        sourcePath,
      };
      existingStatementsByPath.set(namedExport.sourcePath, namedExport);

      let hasBarrelRef = false;
      path.node.specifiers.forEach((specifier, i) => {
        if (specifier.type === 'ExportSpecifier' && specifier.exported.type === 'Identifier') {
          const exportedName = specifier.exported.name;
          const importedName = specifier.local.name;

          existingExportsByName.set(exportedName, {
            namedExport,
            specifierIndex: i,
            typeOnly: specifier.exportKind === 'type' || path.node.exportKind === 'type',
          });

          // Check if this specifier is a barrel file reference
          if (isInternalModule(sourcePath) && isBarrelFileReference(absoluteFilePath, sourcePath, importedName)) {
            barrelFileRefs.add(exportedName);
            hasBarrelRef = true;
          }
        }
      });

      if (hasBarrelRef) {
        barrelRefExportsToFix.push(path);
      }
    },

    ExportAllDeclaration(path) {
      const isExportTypeStar = path.node.exportKind === 'type';
      const flattened = flattenExportStar(absoluteFilePath, path.node.source.value, isExportTypeStar);
      exportStarPaths.push(path);
      allFlattenedExports.push(...flattened);
    },
  });

  // Handle barrel file references
  if (barrelRefExportsToFix.length > 0) {
    fixBarrelFileReferences(absoluteFilePath, barrelRefExportsToFix, barrelFileRefs);
  }

  if (exportStarPaths.length === 0) {
    if (barrelRefExportsToFix.length > 0) {
      const output = generate(ast, { retainLines: false, comments: true });
      fs.writeFileSync(absoluteFilePath, output.code, 'utf8');
    }
    return;
  }

  // Deduplicate and filter exports
  const deduplicated = deduplicateExports(allFlattenedExports);
  const toRemove: ExistingExportInfo[] = [];

  const filteredExports = deduplicated.filter((exp) => {
    const existing = existingExportsByName.get(exp.exportedName);
    if (!existing) return true;

    // Upgrade type-only to value export
    if (existing.typeOnly && !exp.typeOnly) {
      toRemove.push(existing);
      return true;
    }
    return false;
  });

  // Remove specifiers being upgraded from type to value
  for (const { namedExport, specifierIndex } of toRemove) {
    const specifiers = namedExport.path.node.specifiers;
    if (specifiers.length === 1) {
      namedExport.path.remove();
      existingStatementsByPath.delete(namedExport.sourcePath);
    } else {
      specifiers.splice(specifierIndex, 1);
    }
  }

  // Group filtered exports and create/update statements
  const grouped = groupExportsByPath(filteredExports);
  const newStatements: t.ExportNamedDeclaration[] = [];

  for (const [importPath, exps] of grouped) {
    const existing = existingStatementsByPath.get(importPath);
    if (existing) {
      existing.path.node.specifiers.push(...exps.map(createExportSpecifier));
    } else {
      newStatements.push(t.exportNamedDeclaration(null, exps.map(createExportSpecifier), t.stringLiteral(importPath)));
    }
  }

  // Replace export stars
  if (newStatements.length > 0) {
    exportStarPaths[0].replaceWithMultiple(newStatements);
  } else {
    exportStarPaths[0].remove();
  }
  for (let i = 1; i < exportStarPaths.length; i++) {
    exportStarPaths[i].remove();
  }

  // Write output
  const output = generate(ast, { retainLines: false, comments: true });
  fs.writeFileSync(absoluteFilePath, output.code, 'utf8');
}
