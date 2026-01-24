import { getExportsFromModule } from './getExportsFromModule';
import { getAbsolutePathOfImport } from './importUtils';
import { getExportDefinitionFromReExport, ResolvedModuleDefinition } from './getExportDefinitionFromReExport';
import { getAllExportDefinitionsReachableFromModule } from './getAllExportDefinitionsReachableFromModule';

/**
 * Takes an export star and gets the list of fully resolved named exports that are currently reachable by the export *
 * @param absolutePathOfBarrelFile - The absolute path of the barrel file with the export * in it
 * @param importPath - The relative path of the module that is being referenced by the export *
 * @param isExportTypeStar - If true, all exports will be marked as type-only (for `export type *` statements)
 */
export function flattenExportStar(
  absolutePathOfBarrelFile: string,
  importPath: string,
  isExportTypeStar: boolean = false
): ResolvedModuleDefinition[] {
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
      // If the export star is type-only, all exports become type-only
      typeOnly: isExportTypeStar || definition.typeOnly,
    });
  }

  for (const reExport of moduleExports.reExports) {
    if (reExport.type === 'exportAll') {
      const reachableExports = getAllExportDefinitionsReachableFromModule(
        getAbsolutePathOfImport(absolutePathOfBarrelFile, reExport.importPath),
        absolutePathOfBarrelFile
      );
      result.push(...reachableExports.map((exp) => ({ ...exp, typeOnly: isExportTypeStar || exp.typeOnly })));
    } else {
      const resolved = getExportDefinitionFromReExport(
        getAbsolutePathOfImport(absolutePathOfBarrelFile, reExport.importPath),
        reExport
      );
      result.push({ ...resolved, typeOnly: isExportTypeStar || resolved.typeOnly });
    }
  }

  return result;
}
