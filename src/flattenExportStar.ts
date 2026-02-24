import { getExportsFromModule } from './getExportsFromModule';
import { getAbsolutePathOfImport, isInternalModule } from './importUtils';
import { ResolvedModuleDefinition } from './getExportDefinitionFromReExport';
import { getAllExportDefinitionsReachableFromModule } from './getAllExportDefinitionsReachableFromModule';

/**
 * Takes an export star and enumerates all named exports reachable by the export *, keeping the
 * original import path for all internal re-exports. Barrel file reference resolution (i.e. resolving
 * exports that point through intermediate barrel files to their true source) is intentionally left to
 * a separate pass so that fixIssuesInBarrelFile can handle both flattened and pre-existing named
 * exports uniformly.
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
      // Recursively collect all reachable export names, but always use the original importPath so
      // the barrel reference fix pass can later resolve them to their true source modules.
      const reachableExports = getAllExportDefinitionsReachableFromModule(
        getAbsolutePathOfImport(importAbsolutePath, reExport.importPath),
        absolutePathOfBarrelFile
      );
      result.push(
        ...reachableExports.map((exp) => ({
          ...exp,
          // Use exportedName as importedName: getAllExportDefinitionsReachableFromModule resolves
          // importedName to the name in the deepest source file, but once we override importPath
          // to the intermediate barrel the only name that barrel knows is its exported name.
          importedName: exp.exportedName,
          importPath,
        }))
      );
    } else {
      if (!isInternalModule(reExport.importPath)) {
        // External packages: preserve the package path as-is since we can't resolve further
        result.push({
          type: 'resolvedModuleDefinition',
          exportedName: reExport.exportedName,
          importedName: reExport.type === 'namedExport' ? reExport.importedName : 'default',
          importPath: reExport.importPath,
          typeOnly: reExport.typeOnly,
        });
      } else {
        // namedExport or defaultExport (`import foo from './source'; export { foo }`): use the
        // original importPath. isBarrelFileReference will flag this as a barrel reference and
        // getExportDefinitionFromReExport will resolve it to the true source in the fix pass.
        result.push({
          type: 'resolvedModuleDefinition',
          exportedName: reExport.exportedName,
          importedName: reExport.exportedName,
          importPath,
          typeOnly: reExport.typeOnly,
        });
      }
    }
  }

  return result;
}
