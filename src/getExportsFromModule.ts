import * as babel from '@babel/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import traverse from '@babel/traverse';

/** Parses a typescript file into an AST using babel */
function parseTypescriptFile(absoluteFilePath: string): babel.ParseResult {
  const fileContents = fs.readFileSync(absoluteFilePath, 'utf-8');
  const ast = babel.parse(fileContents, {
    sourceType: 'module',
    presets: [['@babel/preset-typescript', { isTSX: absoluteFilePath.endsWith('.tsx'), allExtensions: true }]],
  });
  if (!ast) {
    throw new Error(`Failed to parse file: ${absoluteFilePath}`);
  }

  return ast;
}

/** An export definition */
export interface ExportDefinition {
  /** Set to true if the import is a type only export, false if it is exported as a value */
  typeOnly: boolean;
  /** The name of the export as it is exported from the module */
  name: string;
}

/** An item re-exported by the module */
export interface ModuleReExport {
  /** The name of the export as it is imported in the module */
  importedName: string;
  /** The name of the export as it is exported from the module, it will not be the same as the imported name when the as operator is used */
  exportedName: string;
  /** The path to the module where this re-export was imported from */
  importPath: string;
}

/** All the exports in a given module */
export interface ModuleExports {
  /** The exports whose definition lives in this module  */
  definitions: ExportDefinition[];
  /** The exports whose definitions reside in another module */
  reExports: {}[];
}

/**
 * Gets all the exports from a module, including both definitions and re-exports.
 * @param absoluteRootPath - The absolute path of the root directory
 * @param modulePathRelativeToRoot - The path to the module being parsed, relative to the root path
 * @returns
 */
export function getExportsFromModule(absoluteRootPath: string, modulePathRelativeToRoot: string): ModuleExports {
  const results: ModuleExports = {
    definitions: [],
    reExports: [],
  };

  const ast = parseTypescriptFile(path.resolve(absoluteRootPath, modulePathRelativeToRoot));

  traverse(ast, {});

  return results;
}
