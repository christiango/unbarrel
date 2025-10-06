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
    // Only consider internal modules (relative paths)
    else if (isInternalModule(reExportToVisit.importPath)) {
      const potentialBarrelFilePath = resolveModulePath(
        path.resolve(path.dirname(absoluteFilePath), reExportToVisit.importPath)
      );
      const exportsFromPotentialBarrel = getExportsFromModule(potentialBarrelFilePath);

      const matchingExport = exportsFromPotentialBarrel.definitions.find(
        (definition) => definition.type === 'namedExport' && definition.name === reExportToVisit.exportedName
      );

      // If we couldn't find a matching named export in the other file that defines the export, it likely is a barrel file reference
      if (!matchingExport) {
        const matchingReExport = exportsFromPotentialBarrel.reExports.find(
          (reExport) => reExport.type === 'namedExport' && reExport.exportedName === reExportToVisit.exportedName
        );

        // If it's a re-export from an external package, we don't consider it a barrel file reference
        if (matchingReExport && isInternalModule(matchingReExport.importPath)) {
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
  }

  return result;
}
