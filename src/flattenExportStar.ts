import path from 'node:path';
import { getExportsFromModule } from './getExportsFromModule';
import {
  convertAbsolutePathToRelativeImportPath,
  getAbsolutePathOfImport,
  isInternalModule,
  stripExtension,
} from './importUtils';
import { getExportDefinitionFromReExport, ResolvedModuleDefinition } from './getExportDefinitionFromReExport';
import { getAllExportDefinitionsReachableFromModule } from './getAllExportDefinitionsReachableFromModule';

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

  for (const reExport of moduleExports.reExports) {
    if (reExport.type === 'exportAll') {
      // Skip export * from external packages - we can't enumerate their exports
      if (!isInternalModule(reExport.importPath)) {
        continue;
      }
      const reachableExports = getAllExportDefinitionsReachableFromModule(
        getAbsolutePathOfImport(importAbsolutePath, reExport.importPath),
        absolutePathOfBarrelFile
      );
      result.push(...reachableExports.map((exp) => ({ ...exp, typeOnly: exp.typeOnly })));
    } else {
      const resolved = getExportDefinitionFromReExport(importAbsolutePath, reExport);
      // If the resolved import path is external, keep it as-is
      if (!isInternalModule(resolved.importPath)) {
        result.push(resolved);
      } else {
        // Fix up the import path to be relative to the root barrel file, not the intermediate module.
        const sourceAbsolutePath = getAbsolutePathOfImport(importAbsolutePath, resolved.importPath);
        const fixedImportPath = stripExtension(
          convertAbsolutePathToRelativeImportPath(sourceAbsolutePath, path.dirname(absolutePathOfBarrelFile))
        );
        result.push({ ...resolved, importPath: fixedImportPath, typeOnly: resolved.typeOnly });
      }
    }
  }

  return result;
}
