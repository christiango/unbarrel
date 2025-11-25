import { getExportsFromModule, ModuleDefaultReExport, ModuleNamedReExport } from './getExportsFromModule';
import { convertToESMImportPath, getAbsolutePathOfImport } from './importUtils';
import path from 'node:path';

/** Points to the corresponding definition of an entity that was re-export from a module. */
export interface ResolvedModuleDefinition {
  type: 'resolvedModuleDefinition';
  /** The path of the definition of this import relative to the location where it was re-exported */
  importPath: string;
  /** The name that was used as the export name in the module that defined this entity */
  importedName: string;
  /** The name of the export in the module where the re-export takes place. This won't match importedName if the re-export renames the module */
  exportedName: string;
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
  const importAbsolutePath = getAbsolutePathOfImport(absolutePathOfModule, reExportToResolve.importPath);
  const exportsInModule = getExportsFromModule(importAbsolutePath);

  for (const definition of exportsInModule.definitions) {
    if (definition.type === 'namedExport') {
      if (reExportToResolve.type === 'namedExport' && definition.name === reExportToResolve.importedName) {
        return {
          type: 'resolvedModuleDefinition',
          importPath: reExportToResolve.importPath,
          importedName: definition.name,
          exportedName: reExportToResolve.exportedName,
        };
      }
    } else if (definition.type === 'defaultExport') {
      if (reExportToResolve.type === 'namedExport' && reExportToResolve.importedName === 'default') {
        return {
          type: 'resolvedModuleDefinition',
          importPath: reExportToResolve.importPath,
          importedName: 'default',
          exportedName: reExportToResolve.exportedName,
        };
      }
    }
  }

  for (const reExport of exportsInModule.reExports) {
    if (reExport.type === 'namedExport') {
      if (reExportToResolve.type === 'namedExport' && reExport.exportedName === reExportToResolve.importedName) {
        const matchingDefinition = getExportDefinitionFromReExport(importAbsolutePath, reExport);

        // Fix up the import path to be relative to the original module and handle any renames
        return {
          ...matchingDefinition,
          importPath: convertToESMImportPath(path.join(reExportToResolve.importPath, matchingDefinition.importPath)),
          exportedName: reExportToResolve.exportedName,
        };
      }
    } else if (reExport.type === 'defaultExport') {
      if (
        reExportToResolve.type === 'defaultExport' ||
        (reExportToResolve.type === 'namedExport' && reExportToResolve.importedName === 'default')
      ) {
        const matchingDefinition = getExportDefinitionFromReExport(importAbsolutePath, reExport);

        // Fix up the import path to be relative to the original module and handle any renames
        return {
          ...matchingDefinition,
          importPath: convertToESMImportPath(path.join(reExportToResolve.importPath, matchingDefinition.importPath)),
          exportedName: reExportToResolve.exportedName,
        };
      }
    } else if (reExport.type === 'exportAll') {
      throw new Error('Need to handle exportAll still');
    }
  }

  throw new Error(`Could not resolve re-export ${reExportToResolve.exportedName} from ${absolutePathOfModule}`);
}
