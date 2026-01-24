import * as fs from 'node:fs';
import * as babel from '@babel/core';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { flattenExportStar } from './flattenExportStar';
import { ResolvedModuleDefinition } from './getExportDefinitionFromReExport';
import { parseTypescriptFile } from './parseUtils';

/**
 * Groups resolved exports by their import path
 */
function groupExportsByPath(exports: ResolvedModuleDefinition[]): Map<string, ResolvedModuleDefinition[]> {
  const exportsByPath = new Map<string, ResolvedModuleDefinition[]>();
  for (const exp of exports) {
    const existing = exportsByPath.get(exp.importPath) || [];
    existing.push(exp);
    exportsByPath.set(exp.importPath, existing);
  }
  return exportsByPath;
}

/**
 * Creates export named declaration AST nodes from grouped exports
 */
function createExportStatements(exportsByPath: Map<string, ResolvedModuleDefinition[]>): t.ExportNamedDeclaration[] {
  const statements: t.ExportNamedDeclaration[] = [];

  for (const [importPath, exps] of exportsByPath) {
    const specifiers = exps.map((e) => {
      const local = t.identifier(e.importedName);
      const exported = t.identifier(e.exportedName);
      const specifier = t.exportSpecifier(local, exported);

      // Set exportKind to 'type' for type-only exports
      if (e.typeOnly) {
        specifier.exportKind = 'type';
      }

      return specifier;
    });

    const exportDecl = t.exportNamedDeclaration(null, specifiers, t.stringLiteral(importPath));

    statements.push(exportDecl);
  }

  return statements;
}

/**
 * Deduplicates exports by exportedName.
 * When there are multiple exports with the same name, value exports (typeOnly: false)
 * take precedence over type-only exports (typeOnly: true), because a value export
 * can be used as both a value and a type (via typeof).
 */
function deduplicateExports(exports: ResolvedModuleDefinition[]): ResolvedModuleDefinition[] {
  const exportsByName = new Map<string, ResolvedModuleDefinition>();

  for (const exp of exports) {
    const existing = exportsByName.get(exp.exportedName);
    if (!existing) {
      // First occurrence of this export name
      exportsByName.set(exp.exportedName, exp);
    } else if (existing.typeOnly && !exp.typeOnly) {
      // Replace type-only export with value export (value takes precedence)
      exportsByName.set(exp.exportedName, exp);
    }
    // Otherwise keep the existing export (either both are same typeOnly, or existing is value and new is type)
  }

  return Array.from(exportsByName.values());
}

/**
 * Fixes any issues in the referenced barrel file.
 * @param absoluteFilePath - the absolute path of the barrel file to fix
 */
export function fixIssuesInBarrelFile(absoluteFilePath: string) {
  const ast = parseTypescriptFile(absoluteFilePath);

  // Collect all export star declarations and their flattened exports
  const exportStarPaths: babel.NodePath<t.ExportAllDeclaration>[] = [];
  const allFlattenedExports: ResolvedModuleDefinition[] = [];

  traverse(ast, {
    ExportAllDeclaration(path) {
      const importPath = path.node.source.value;

      // Check if this is `export type *` (type-only export star)
      const isExportTypeStar = path.node.exportKind === 'type';

      // Flatten the export * into named exports
      const flattened = flattenExportStar(absoluteFilePath, importPath, isExportTypeStar);

      exportStarPaths.push(path);
      allFlattenedExports.push(...flattened);
    },
  });

  if (exportStarPaths.length === 0) {
    return;
  }

  // Deduplicate exports across all export stars
  const deduplicated = deduplicateExports(allFlattenedExports);

  // Group by import path
  const grouped = groupExportsByPath(deduplicated);

  // Create replacement export statements
  const newStatements = createExportStatements(grouped);

  // Replace the first export star with all the new statements
  exportStarPaths[0].replaceWithMultiple(newStatements);

  // Remove the remaining export stars
  for (let i = 1; i < exportStarPaths.length; i++) {
    exportStarPaths[i].remove();
  }

  // Generate code from modified AST
  const output = generate(ast, {
    retainLines: false,
    comments: true,
  });

  fs.writeFileSync(absoluteFilePath, output.code, 'utf8');
}
