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

export interface NamedExportDefinition {
  type: 'namedExport';
  /** Set to true if the import is a type only export, false if it is exported as a value */
  typeOnly: boolean;
  /** The name of the export as it is exported from the module */
  name: string;
}

export interface DefaultExportDefinition {
  type: 'defaultExport';
  /** Set to true if the import is a type only export, false if it is exported as a value */
  typeOnly: boolean;
}

/** An export definition */
export type ExportDefinition = NamedExportDefinition | DefaultExportDefinition;

/** This is set for any export * statements */
export interface ModuleReExportAll {
  type: 'exportAll';
  /** The name of the export as it is imported in the module */
  importPath: string;
}

export interface ModuleNamedReExport {
  type: 'namedExport';
  /** The name of the export as it is imported in the module */
  importedName: string;
  /** The name of the export as it is exported from the module, it will not be the same as the imported name when the as operator is used */
  exportedName: string;
  /** The path to the module where this re-export was imported from */
  importPath: string;
  /** Set to true if the import is a type only export, false if it is exported as a value */
  typeOnly: boolean;
}

export interface ModuleDefaultReExport {
  type: 'defaultExport';
  /** The name of the export as it is exported from the module, it will not be the same as the imported name when the as operator is used */
  exportedName: string;
  /** The path to the module where this re-export was imported from */
  importPath: string;
  /** Set to true if the import is a type only export, false if it is exported as a value */
  typeOnly: boolean;
}

/** An item re-exported by the module */
export type ModuleReExport = ModuleReExportAll | ModuleNamedReExport | ModuleDefaultReExport;

/** All the exports in a given module */
export interface ModuleExports {
  /** The exports whose definition lives in this module  */
  definitions: ExportDefinition[];
  /** The exports whose definitions reside in another module */
  reExports: ModuleReExport[];
}

/**
 * Gets all the exports from a module, including both definitions and re-exports.
 * @param absoluteFilePath - The absolute path of the file to analyze
 * @returns - The module exports
 */
export function getExportsFromModule(absoluteFilePath: string): ModuleExports {
  const results: ModuleExports = {
    definitions: [],
    reExports: [],
  };

  const ast = parseTypescriptFile(absoluteFilePath);

  // For statements like export { foo } with no source, we need to find them source or corresponding export statement.
  // The key here is the local name we are looking for.
  // For export { foo as bar }, the key would be foo
  // For export { foo }, the key would be foo
  const exportsToFindInSecondPass = new Map<
    string,
    { importedName: string; exportedName: string; typeOnly: boolean }
  >();

  traverse(ast, {
    ExportNamedDeclaration(path) {
      if ('declaration' in path.node && path.node.declaration) {
        const name = getNameFromDeclaration(path.node.declaration);
        results.definitions.push({
          type: 'namedExport',
          name,
          typeOnly: isTypeOnlyDeclaration(path.node.declaration),
        });
      } else if (path.node.specifiers) {
        if (path.node.specifiers.length > 0) {
          for (const specifier of path.node.specifiers) {
            if (specifier.type === 'ExportSpecifier' && specifier.exported.type === 'Identifier') {
              if ('source' in path.node && path.node.source) {
                results.reExports.push({
                  type: 'namedExport',
                  importedName: specifier.local.name,
                  exportedName: specifier.exported.name,
                  importPath: path.node.source.value,
                  typeOnly: specifier.exportKind === 'type' || path.node.exportKind === 'type',
                });
              } else {
                exportsToFindInSecondPass.set(specifier.local.name, {
                  importedName: specifier.local.name,
                  exportedName: specifier.exported.name,
                  typeOnly: specifier.exportKind === 'type' || path.node.exportKind === 'type',
                });
              }
            }
          }
        }
      }
    },
    ExportDefaultDeclaration(path) {
      if (path.node.declaration) {
        results.definitions.push({
          type: 'defaultExport',
          typeOnly: isTypeOnlyDeclaration(path.node.declaration),
        });
      }
    },
    ExportAllDeclaration(path) {
      if ('source' in path.node && path.node.source) {
        results.reExports.push({
          type: 'exportAll',
          importPath: path.node.source.value,
        });
      }
    },
  });

  if (exportsToFindInSecondPass.size > 0) {
    traverse(ast, {
      ImportDeclaration(path) {
        const importPath = path.node.source.value;

        for (const specifier of path.node.specifiers) {
          if (
            specifier.type === 'ImportDefaultSpecifier' ||
            (specifier.type === 'ImportSpecifier' && getImportedNameFromSpecifier(specifier) === 'default')
          ) {
            const exportedName = specifier.local.name;
            const candidateExportMatch = exportsToFindInSecondPass.get(exportedName);
            if (candidateExportMatch) {
              results.reExports.push({
                type: 'defaultExport',
                exportedName: candidateExportMatch.exportedName,
                importPath,
                typeOnly: candidateExportMatch.typeOnly,
              });

              exportsToFindInSecondPass.delete(exportedName);
            }
          } else if (specifier.type === 'ImportSpecifier') {
            const importedName = getImportedNameFromSpecifier(specifier);
            const exportedName = specifier.local.name;
            const candidateExportMatch = exportsToFindInSecondPass.get(exportedName);
            if (candidateExportMatch) {
              results.reExports.push({
                type: 'namedExport',
                importedName,
                exportedName: candidateExportMatch.exportedName,
                importPath,
                typeOnly:
                  candidateExportMatch.typeOnly || specifier.importKind === 'type' || path.node.importKind === 'type',
              });

              exportsToFindInSecondPass.delete(exportedName);
            }
          }
        }
      },
      Declaration(path) {
        if (
          path.node.type !== 'ImportDeclaration' &&
          path.node.type !== 'ExportNamedDeclaration' &&
          path.node.type !== 'ExportDefaultDeclaration' &&
          path.node.type !== 'ExportAllDeclaration'
        ) {
          const name = getNameFromDeclaration(path.node);
          const candidateExportMatch = exportsToFindInSecondPass.get(name);
          if (candidateExportMatch) {
            results.definitions.push({
              type: 'namedExport',
              name: candidateExportMatch.exportedName,
              typeOnly: candidateExportMatch.typeOnly || isTypeOnlyDeclaration(path.node),
            });

            exportsToFindInSecondPass.delete(name);
          }
        }
      },
    });
  }

  if (exportsToFindInSecondPass.size !== 0) {
    throw new Error(`Could not find source for exports: ${[...exportsToFindInSecondPass.keys()].join(',')}`);
  }

  return results;
}

function getImportedNameFromSpecifier(specifier: babel.types.ImportSpecifier) {
  return specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
}

function isTypeOnlyDeclaration(declaration: babel.types.Declaration | babel.types.Expression): boolean {
  return declaration.type === 'TSTypeAliasDeclaration' || declaration.type === 'TSInterfaceDeclaration';
}
/**
 * Extracts the name of a defined function, class, interface, type alias ,etc
 */
function getNameFromDeclaration(declaration: babel.types.Declaration | babel.types.Expression): string {
  if (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'ClassDeclaration' ||
    declaration.type == 'TSInterfaceDeclaration' ||
    declaration.type === 'TSTypeAliasDeclaration' ||
    declaration.type == 'TSDeclareFunction' ||
    declaration.type === 'TSEnumDeclaration'
  ) {
    if (!declaration.id) {
      throw new Error(`${declaration} without an id found, we don't support these yet`);
    }

    return declaration.id?.name;
  }

  if (declaration.type === 'VariableDeclaration') {
    if (declaration.declarations.length === 0) {
      throw new Error(`Variable declaration without any declarators found: ${declaration}`);
    }
    if (declaration.declarations.length > 1) {
      throw new Error(`Variable declaration with multiple declarators found: ${declaration}`);
    }
    if (!('name' in declaration.declarations[0].id)) {
      throw new Error(`Variable declaration without name found: ${declaration}`);
    }
    return declaration.declarations[0].id.name;
  }

  throw new Error(`getNameFromDeclaration currently does not support declaration type: ${declaration.type}`);
}
