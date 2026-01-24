import { getExportsFromModule } from './getExportsFromModule';
import path from 'node:path';
import { resolveModulePath } from './resolveModulePath';
import { convertAbsolutePathToRelativeImportPath, isInternalModule } from './importUtils';

/** Error when one of the exports of the barrel file is from another barrel file */
export interface BarrelFileReferenceError {
  type: 'barrelFileReference';

  /** The name of the export that references the barrel file */
  exportedName: string;

  /** The relative path to the barrel file that gets referenced */
  barrelFilePath: string;
}

export interface ExportAllError {
  type: 'exportAll';
  /** The name of the export that references the barrel file */
  barrelFilePath: string;
}

export type BarrelFileIssue = BarrelFileReferenceError | ExportAllError;

/**
 * Checks if a named re-export is a barrel file reference (i.e., re-exports from an intermediate barrel file
 * rather than from the module that defines the export).
 * @param absoluteFilePath - The absolute path of the module containing the re-export
 * @param importPath - The import path of the re-export (must be an internal/relative path)
 * @param importedName - The name being imported from the target module
 * @returns true if this is a barrel file reference
 */
export function isBarrelFileReference(absoluteFilePath: string, importPath: string, importedName: string): boolean {
  const targetFilePath = resolveModulePath(path.resolve(path.dirname(absoluteFilePath), importPath));
  const targetExports = getExportsFromModule(targetFilePath);

  // Check if the name exists as a definition in the target module
  const matchingExport = targetExports.definitions.find(
    (definition) => definition.type === 'namedExport' && definition.name === importedName
  );

  if (matchingExport) {
    return false;
  }

  // Check if it's a re-export from an internal module (barrel file reference)
  const matchingReExport = targetExports.reExports.find(
    (reExport) => reExport.type === 'namedExport' && reExport.exportedName === importedName
  );

  return matchingReExport !== undefined && isInternalModule(matchingReExport.importPath);
}

/**
 * Analyzes the exports of the provided file and returns any references to barrel files within the current package. External packages are not included.
 * @param absoluteFilePath The absolute path the the file we will analyze
 * @returns An array of barrel file references found in the file
 */
export function getIssuesInBarrelFile(absoluteFilePath: string): BarrelFileIssue[] {
  const result: BarrelFileIssue[] = [];

  const exports = getExportsFromModule(absoluteFilePath);

  for (const reExportToVisit of exports.reExports) {
    // An export star makes the current file a barrel file!
    if (reExportToVisit.type === 'exportAll') {
      result.push({
        type: 'exportAll',
        barrelFilePath: absoluteFilePath,
      });
    }
    // Only consider internal modules (relative paths) and named re-exports
    else if (reExportToVisit.type === 'namedExport' && isInternalModule(reExportToVisit.importPath)) {
      if (isBarrelFileReference(absoluteFilePath, reExportToVisit.importPath, reExportToVisit.importedName)) {
        const potentialBarrelFilePath = resolveModulePath(
          path.resolve(path.dirname(absoluteFilePath), reExportToVisit.importPath)
        );
        result.push({
          type: 'barrelFileReference',
          exportedName: reExportToVisit.exportedName,
          barrelFilePath: convertAbsolutePathToRelativeImportPath(
            potentialBarrelFilePath,
            path.dirname(absoluteFilePath)
          ),
        });
      }
    }
  }

  return result;
}
