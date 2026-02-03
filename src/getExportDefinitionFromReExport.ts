import { getExportsFromModule, ModuleDefaultReExport, ModuleNamedReExport } from './getExportsFromModule';
import { convertToESMImportPath, getAbsolutePathOfImport, isInternalModule } from './importUtils';
import path from 'node:path';

/**
 * Gets the base directory for path joining when resolving re-exports.
 * For directory imports (e.g., ./barrel which resolves to ./barrel/index.ts),
 * we use the import path itself. For file imports (e.g., ./DataTypeIconType
 * which resolves to ./DataTypeIconType.ts), we use the directory of the import.
 */
function getBasePathForJoin(importPath: string, resolvedAbsolutePath: string): string {
  // Check if the resolved path is an index file (directory import)
  const basename = path.basename(resolvedAbsolutePath);
  const isIndexFile = /^index\.[jt]sx?$/.test(basename);

  if (isIndexFile) {
    // Directory import - use the import path as-is
    return importPath;
  } else {
    // File import - use the directory of the import path
    return path.dirname(importPath);
  }
}

/** Points to the corresponding definition of an entity that was re-export from a module. */
export interface ResolvedModuleDefinition {
  type: 'resolvedModuleDefinition';
  /** The path of the definition of this import relative to the location where it was re-exported */
  importPath: string;
  /** The name that was used as the export name in the module that defined this entity */
  importedName: string;
  /** The name of the export in the module where the re-export takes place. This won't match importedName if the re-export renames the module */
  exportedName: string;
  /** Set to true if the export is a type only export */
  typeOnly: boolean;
}

/**
 * Resolves a named re-export to it's source definition
 * @param absolutePathOfModule - the absolute path of the module where the re-export resides
 * @param reExportToResolve - the relative path of the import for the re-export
 */
export function getExportDefinitionFromReExport(
  absolutePathOfModule: string,
  reExportToResolve: ModuleNamedReExport | ModuleDefaultReExport
): ResolvedModuleDefinition {
  // If the import path is an external package (e.g., 'react', we can't resolve it further.
  // Just return the re-export info as-is.
  if (!isInternalModule(reExportToResolve.importPath)) {
    const importedName =
      reExportToResolve.type === 'defaultExport'
        ? 'default'
        : reExportToResolve.type === 'namedExport'
        ? reExportToResolve.importedName
        : 'default';
    return {
      type: 'resolvedModuleDefinition',
      importPath: reExportToResolve.importPath,
      importedName,
      exportedName: reExportToResolve.exportedName,
      typeOnly: reExportToResolve.typeOnly,
    };
  }

  const importAbsolutePath = getAbsolutePathOfImport(absolutePathOfModule, reExportToResolve.importPath);
  const exportsInModule = getExportsFromModule(importAbsolutePath);

  // Collect all matching definitions - there may be both a value and type export with the same name
  // (e.g., const Foo = {...} as const; export type Foo = typeof Foo[...]; export { Foo };)
  let matchingDefinition: ResolvedModuleDefinition | undefined;

  for (const definition of exportsInModule.definitions) {
    if (definition.type === 'namedExport') {
      if (reExportToResolve.type === 'namedExport' && definition.name === reExportToResolve.importedName) {
        const candidate: ResolvedModuleDefinition = {
          type: 'resolvedModuleDefinition',
          importPath: reExportToResolve.importPath,
          importedName: definition.name,
          exportedName: reExportToResolve.exportedName,
          typeOnly: definition.typeOnly,
        };

        // Prefer value exports over type-only exports
        if (!matchingDefinition || (!candidate.typeOnly && matchingDefinition.typeOnly)) {
          matchingDefinition = candidate;
        }
      }
    } else if (definition.type === 'defaultExport') {
      if (
        reExportToResolve.type === 'defaultExport' ||
        (reExportToResolve.type === 'namedExport' && reExportToResolve.importedName === 'default')
      ) {
        return {
          type: 'resolvedModuleDefinition',
          importPath: reExportToResolve.importPath,
          importedName: 'default',
          exportedName: reExportToResolve.exportedName,
          typeOnly: reExportToResolve.typeOnly,
        };
      }
    }
  }

  if (matchingDefinition) {
    return matchingDefinition;
  }

  for (const reExport of exportsInModule.reExports) {
    if (reExport.type === 'namedExport') {
      if (reExportToResolve.type === 'namedExport' && reExport.exportedName === reExportToResolve.importedName) {
        const matchingDefinition = getExportDefinitionFromReExport(importAbsolutePath, reExport);

        // If the resolved import path is external, keep it as-is (don't join with local path)
        const resolvedImportPath = !isInternalModule(matchingDefinition.importPath)
          ? matchingDefinition.importPath
          : convertToESMImportPath(
              path.join(
                getBasePathForJoin(reExportToResolve.importPath, importAbsolutePath),
                matchingDefinition.importPath
              )
            );

        // Fix up the import path to be relative to the original module and handle any renames
        return {
          ...matchingDefinition,
          importPath: resolvedImportPath,
          exportedName: reExportToResolve.exportedName,
          typeOnly: matchingDefinition.typeOnly,
        };
      }
    } else if (reExport.type === 'defaultExport') {
      if (
        reExportToResolve.type === 'defaultExport' ||
        (reExportToResolve.type === 'namedExport' && reExportToResolve.importedName === 'default')
      ) {
        const matchingDefinition = getExportDefinitionFromReExport(importAbsolutePath, reExport);

        // If the resolved import path is external, keep it as-is (don't join with local path)
        const resolvedImportPath = !isInternalModule(matchingDefinition.importPath)
          ? matchingDefinition.importPath
          : convertToESMImportPath(
              path.join(
                getBasePathForJoin(reExportToResolve.importPath, importAbsolutePath),
                matchingDefinition.importPath
              )
            );

        // Fix up the import path to be relative to the original module and handle any renames
        return {
          ...matchingDefinition,
          importPath: resolvedImportPath,
          exportedName: reExportToResolve.exportedName,
          typeOnly: matchingDefinition.typeOnly,
        };
      }
    } else if (reExport.type === 'exportAll') {
      try {
        const matchingDefinition = getExportDefinitionFromReExport(importAbsolutePath, {
          ...reExportToResolve,
          importPath: reExport.importPath,
        });

        // If the resolved import path is external, keep it as-is (don't join with local path)
        const resolvedImportPath = !isInternalModule(matchingDefinition.importPath)
          ? matchingDefinition.importPath
          : convertToESMImportPath(
              path.join(
                getBasePathForJoin(reExportToResolve.importPath, importAbsolutePath),
                matchingDefinition.importPath
              )
            );

        // Fix up the import path to be relative to the original module and handle any renames
        return {
          ...matchingDefinition,
          importPath: resolvedImportPath,
          exportedName: reExportToResolve.exportedName,
          typeOnly: matchingDefinition.typeOnly,
        };
      } catch {
        // If the named export is not found through this export * path,
        // continue to the next re-export instead of throwing an error
      }
    }
  }

  throw new Error(`Could not resolve re-export ${reExportToResolve.exportedName} from ${absolutePathOfModule}`);
}
