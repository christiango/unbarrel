import path from 'node:path';
import { getExportDefinitionFromReExport, ResolvedModuleDefinition } from './getExportDefinitionFromReExport';
import { getExportsFromModule } from './getExportsFromModule';
import { convertToESMImportPath, getAbsolutePathOfImport, isInternalModule, stripExtension } from './importUtils';

/**
 * Resolves a named re-export to it's source definition
 * @param absolutePathOfModule - the absolute path of the module where the re-export resides
 * @param baseModulePath - the absolute path of the base module to compute relative paths from (defaults to absolutePathOfModule for external callers)
 */
export function getAllExportDefinitionsReachableFromModule(
  absolutePathOfModule: string,
  baseModulePath: string = absolutePathOfModule
): ResolvedModuleDefinition[] {
  const result: ResolvedModuleDefinition[] = [];

  const exportsInModule = getExportsFromModule(absolutePathOfModule);

  // Compute relative path from base module's directory to current module
  const baseDir = path.dirname(baseModulePath);
  const relativeImportPath =
    absolutePathOfModule === baseModulePath
      ? '.'
      : convertToESMImportPath(stripExtension(path.relative(baseDir, absolutePathOfModule)));

  for (const definition of exportsInModule.definitions) {
    const importName = definition.type === 'defaultExport' ? 'default' : definition.name;
    result.push({
      type: 'resolvedModuleDefinition',
      importedName: importName,
      exportedName: importName,
      importPath: relativeImportPath,
      typeOnly: definition.typeOnly,
    });
  }

  for (const reExport of exportsInModule.reExports) {
    if (reExport.type === 'exportAll') {
      // Skip export * from external packages - we can't enumerate their exports
      if (!isInternalModule(reExport.importPath)) {
        continue;
      }
      result.push(
        ...getAllExportDefinitionsReachableFromModule(
          getAbsolutePathOfImport(absolutePathOfModule, reExport.importPath),
          baseModulePath
        )
      );
    } else {
      const resolved = getExportDefinitionFromReExport(absolutePathOfModule, reExport);
      // If the resolved import path is external, keep it as-is
      if (!isInternalModule(resolved.importPath)) {
        result.push(resolved);
      } else {
        // Fix up the import path to be relative to the base module, not the current module
        const sourceAbsolutePath = getAbsolutePathOfImport(absolutePathOfModule, resolved.importPath);
        const fixedImportPath = convertToESMImportPath(stripExtension(path.relative(baseDir, sourceAbsolutePath)));
        result.push({ ...resolved, importPath: fixedImportPath });
      }
    }
  }

  return result;
}
