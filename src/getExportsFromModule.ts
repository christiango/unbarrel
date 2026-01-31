import * as babel from '@babel/core';
import traverse from '@babel/traverse';
import { parseTypescriptFile } from './parseUtils';

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
      // Only process top-level exports, not exports nested inside namespaces
      if (!path.parentPath?.isProgram()) return;

      if ('declaration' in path.node && path.node.declaration) {
        if (path.node.declaration.type === 'VariableDeclaration') {
          for (const declarator of path.node.declaration.declarations) {
            const names = babel.types.isPatternLike(declarator.id) ? getIdentifiersFromPattern(declarator.id) : [];

            for (const name of names) {
              results.definitions.push({
                type: 'namedExport',
                name,
                typeOnly: false,
              });
            }
          }
        } else {
          const name = getNameFromDeclaration(path.node.declaration);
          results.definitions.push({
            type: 'namedExport',
            name,
            typeOnly: isTypeOnlyDeclaration(path.node.declaration),
          });
        }
      } else if (path.node.specifiers) {
        if (path.node.specifiers.length > 0) {
          for (const specifier of path.node.specifiers) {
            if (specifier.type === 'ExportSpecifier' && specifier.exported.type === 'Identifier') {
              if ('source' in path.node && path.node.source) {
                // Check if this is a default re-export: export { default } from "./module"
                if (specifier.local.name === 'default' && specifier.exported.name === 'default') {
                  results.reExports.push({
                    type: 'defaultExport',
                    exportedName: 'default',
                    importPath: path.node.source.value,
                    typeOnly: specifier.exportKind === 'type' || path.node.exportKind === 'type',
                  });
                } else {
                  results.reExports.push({
                    type: 'namedExport',
                    importedName: specifier.local.name,
                    exportedName: specifier.exported.name,
                    importPath: path.node.source.value,
                    typeOnly: specifier.exportKind === 'type' || path.node.exportKind === 'type',
                  });
                }
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
      // Only process top-level exports, not exports nested inside namespaces
      if (!path.parentPath?.isProgram()) return;

      if (path.node.declaration) {
        // If the declaration is an identifier, it might be a re-export of an imported value
        // e.g., import foo from './foo'; export default foo;
        if (path.node.declaration.type === 'Identifier') {
          exportsToFindInSecondPass.set(path.node.declaration.name, {
            importedName: path.node.declaration.name,
            exportedName: 'default',
            typeOnly: false,
          });
        } else {
          results.definitions.push({
            type: 'defaultExport',
            typeOnly: isTypeOnlyDeclaration(path.node.declaration),
          });
        }
      }
    },
    ExportAllDeclaration(path) {
      // Only process top-level exports, not exports nested inside namespaces
      if (!path.parentPath?.isProgram()) return;

      if ('source' in path.node && path.node.source) {
        results.reExports.push({
          type: 'exportAll',
          importPath: path.node.source.value,
        });
      }
    },
    // Handle CommonJS exports: exports.name = value
    ExpressionStatement(path) {
      const expr = path.node.expression;
      if (expr.type !== 'AssignmentExpression' || expr.operator !== '=') {
        return;
      }

      const left = expr.left;
      if (left.type !== 'MemberExpression') {
        return;
      }

      // Handle: exports.name = value
      if (left.object.type === 'Identifier' && left.object.name === 'exports' && left.property.type === 'Identifier') {
        results.definitions.push({
          type: 'namedExport',
          name: left.property.name,
          typeOnly: false,
        });
        return;
      }

      // Handle: module.exports = { ... }
      if (
        left.object.type === 'Identifier' &&
        left.object.name === 'module' &&
        left.property.type === 'Identifier' &&
        left.property.name === 'exports'
      ) {
        if (expr.right.type === 'ObjectExpression') {
          for (const prop of expr.right.properties) {
            if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
              results.definitions.push({
                type: 'namedExport',
                name: prop.key.name,
                typeOnly: false,
              });
            } else if (prop.type === 'ObjectMethod' && prop.key.type === 'Identifier') {
              results.definitions.push({
                type: 'namedExport',
                name: prop.key.name,
                typeOnly: false,
              });
            }
          }
        }
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
          path.parentPath?.isProgram() && // Only consider top level declarations
          path.node.type !== 'ImportDeclaration' &&
          path.node.type !== 'ExportNamedDeclaration' &&
          path.node.type !== 'ExportDefaultDeclaration' &&
          path.node.type !== 'ExportAllDeclaration'
        ) {
          if (path.node.type === 'VariableDeclaration') {
            for (const declarator of path.node.declarations) {
              const names = getIdentifiersFromPattern(declarator.id);
              for (const name of names) {
                const candidateExportMatch = exportsToFindInSecondPass.get(name);
                if (candidateExportMatch) {
                  // Check if this is a default export (export default localVar)
                  if (candidateExportMatch.exportedName === 'default') {
                    results.definitions.push({
                      type: 'defaultExport',
                      typeOnly: candidateExportMatch.typeOnly || isTypeOnlyDeclaration(path.node),
                    });
                  } else {
                    results.definitions.push({
                      type: 'namedExport',
                      name: candidateExportMatch.exportedName,
                      typeOnly: candidateExportMatch.typeOnly || isTypeOnlyDeclaration(path.node),
                    });
                  }

                  exportsToFindInSecondPass.delete(name);
                }
              }
            }
          } else {
            const name = getNameFromDeclaration(path.node);
            const candidateExportMatch = exportsToFindInSecondPass.get(name);
            if (candidateExportMatch) {
              // Check if this is a default export (export default localVar)
              if (candidateExportMatch.exportedName === 'default') {
                results.definitions.push({
                  type: 'defaultExport',
                  typeOnly: candidateExportMatch.typeOnly || isTypeOnlyDeclaration(path.node),
                });
              } else {
                results.definitions.push({
                  type: 'namedExport',
                  name: candidateExportMatch.exportedName,
                  typeOnly: candidateExportMatch.typeOnly || isTypeOnlyDeclaration(path.node),
                });
              }

              exportsToFindInSecondPass.delete(name);
            }
          }
        }
      },
    });

    // Handle the case where export default X (or export { X }) references a named export from this module
    // e.g., export const Foo = ...; export default Foo;
    for (const [localName, exportInfo] of exportsToFindInSecondPass) {
      const matchingNamedExport = results.definitions.find(
        (def) => def.type === 'namedExport' && def.name === localName
      );
      if (matchingNamedExport) {
        // The export references a named export already defined in this file
        if (exportInfo.exportedName === 'default') {
          results.definitions.push({
            type: 'defaultExport',
            typeOnly: exportInfo.typeOnly || matchingNamedExport.typeOnly,
          });
        } else {
          results.definitions.push({
            type: 'namedExport',
            name: exportInfo.exportedName,
            typeOnly: exportInfo.typeOnly || matchingNamedExport.typeOnly,
          });
        }
        exportsToFindInSecondPass.delete(localName);
      }
    }
  }

  if (exportsToFindInSecondPass.size !== 0) {
    throw new Error(`Could not find source for exports: ${[...exportsToFindInSecondPass.keys()].join(',')}`);
  }

  return results;
}

function getImportedNameFromSpecifier(specifier: babel.types.ImportSpecifier) {
  return specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
}

function getIdentifiersFromPattern(pattern: babel.types.LVal | babel.types.PatternLike): string[] {
  switch (pattern.type) {
    case 'Identifier':
      return [pattern.name];
    case 'ObjectPattern':
      return pattern.properties.flatMap((property) => {
        if (property.type === 'ObjectProperty') {
          if (property.value.type === 'Identifier') {
            return [property.value.name];
          }

          if (babel.types.isPatternLike(property.value)) {
            return getIdentifiersFromPattern(property.value);
          }

          return [];
        }

        if (property.type === 'RestElement') {
          return getIdentifiersFromPattern(property.argument);
        }

        return [];
      });
    case 'ArrayPattern':
      return pattern.elements.flatMap((element) => {
        if (!element) {
          return [];
        }

        if (element.type === 'Identifier') {
          return [element.name];
        }

        if (element && babel.types.isPatternLike(element)) {
          return getIdentifiersFromPattern(element);
        }

        return [];
      });
    case 'AssignmentPattern':
      return getIdentifiersFromPattern(pattern.left);
    case 'RestElement':
      return getIdentifiersFromPattern(pattern.argument);
    default:
      return [];
  }
}

function isTypeOnlyDeclaration(declaration: babel.types.Declaration | babel.types.Expression): boolean {
  return (
    declaration.type === 'TSTypeAliasDeclaration' ||
    declaration.type === 'TSInterfaceDeclaration' ||
    declaration.type === 'TSModuleDeclaration'
  );
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

  if (declaration.type === 'TSModuleDeclaration') {
    if (declaration.id.type === 'Identifier') {
      return declaration.id.name;
    }
    // For string literal module declarations like `declare module "foo"`, use the string value
    return declaration.id.value;
  }

  throw new Error(`getNameFromDeclaration currently does not support declaration type: ${declaration.type}`);
}
