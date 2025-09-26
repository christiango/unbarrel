import traverse from '@babel/traverse';
import { parseTypescriptFile } from './astUtils';
import { getExportsFromModule } from './getExportsFromModule';
import * as babel from '@babel/core';
import { resolveModulePath } from './resolveModulePath';
import { resolve, dirname } from 'node:path';
import * as fs from 'node:fs';

/**
 * Finds all export star statements in a given file and resolves them to instead use named exports
 * @param absoluteFilePath The absolute path to the file to process
 */
export function fixExportStar(absoluteFilePath: string): void {
  const ast = parseTypescriptFile(absoluteFilePath);

  let hasChanges = false;

  traverse(ast, {
    ExportAllDeclaration(path) {
      const importPath = path.node.source.value;

      const namedExportStatements: babel.types.ExportNamedDeclaration[] = [];

      const exports = getExportsFromModule(resolveModulePath(resolve(dirname(absoluteFilePath), importPath)));

      const specifiers = exports.definitions.map((exportToConsider) => {
        if (exportToConsider.type === 'defaultExport') {
          throw new Error(`Unexpected default export when resolving export * from ${importPath}`);
        }
        const specifier = babel.types.exportSpecifier(
          babel.types.identifier(exportToConsider.name),
          babel.types.identifier(exportToConsider.name)
        );

        if (exportToConsider.typeOnly) {
          specifier.exportKind = 'type';
        }

        return specifier;
      });

      namedExportStatements.push(
        babel.types.exportNamedDeclaration(undefined, specifiers, babel.types.stringLiteral(importPath))
      );

      if (exports.reExports.length > 0) {
        throw new Error('Re-exports not supported yet');
      }

      path.replaceWithMultiple(namedExportStatements);
      hasChanges = true;
    },
  });

  if (hasChanges) {
    const result = babel.transformFromAstSync(ast, undefined, {
      generatorOpts: {
        jsescOption: {
          quotes: 'single',
        },
      },
    });

    if (!result || !result.code) {
      throw new Error(`Failed to transform AST for file: ${absoluteFilePath}`);
    }

    // Write the modified AST back to the file
    fs.writeFileSync(absoluteFilePath, result.code, 'utf-8');
  }
}
