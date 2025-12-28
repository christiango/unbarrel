import { getExportsFromModule } from './getExportsFromModule';
import { getAbsolutePathOfImport } from './importUtils';
import { ResolvedModuleDefinition } from './getExportDefinitionFromReExport';

/**
 * Takes an export star and gets the list of fully resolved named exports that are currently reachable by the export *
 * @param absolutePathOfBarrelFile - The absolute path of the barrel file with the export * in it
 * @param importPath - The relative path of the module that is being referenced by the export *
 */
export function flattenExportStar(absolutePathOfBarrelFile: string, importPath: string): ResolvedModuleDefinition[] {
  const result: ResolvedModuleDefinition[] = [];

  const importAbsolutePath = getAbsolutePathOfImport(absolutePathOfBarrelFile, importPath);
  const moduleExports = getExportsFromModule(importAbsolutePath);

  for (const definition of moduleExports.definitions) {
    const importName = definition.type === 'defaultExport' ? 'default' : definition.name;

    result.push({
      type: 'resolvedModuleDefinition',
      exportedName: importName,
      importedName: importName,
      importPath,
      typeOnly: definition.typeOnly,
    });
  }

  // TODO: Handle re-exports

  return result;
}
