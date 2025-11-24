import { ExportDefinition, getExportsFromModule } from './getExportsFromModule';
import { getAbsolutePathOfImport } from './importUtils';

/**
 * Takes an export star and gets the list of fully resolved named exports that are currently reachable by the export *
 * @param absolutePathOfBarrelFile - The absolute path of the barrel file with the export * in it
 * @param importPath - The relative path of the module that is being referenced by the export *
 */
export function flattenExportStar(absolutePathOfBarrelFile: string, importPath: string): ExportDefinition[] {
  const result: ExportDefinition[] = [];

  const importAbsolutePath = getAbsolutePathOfImport(absolutePathOfBarrelFile, importPath);
  const moduleExports = getExportsFromModule(importAbsolutePath);

  for (const definition of moduleExports.definitions) {
    result.push(definition);
  }

  return result;
}
