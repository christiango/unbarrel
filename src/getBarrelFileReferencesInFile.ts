import { getExportsFromModule } from './getExportsFromModule';
import path from 'node:path';
import { resolveModulePath } from './resolveModulePath';
import { convertAbsolutePathToRelativeImportPath, isInternalModule } from './importUtils';

export interface BarrelFileReference {
  /** The relative path to the barrel file that was found */
  barrelFilePath: string;
}

/**
 * Analyzes the exports of the provided file and returns any references to barrel files within the current package. External packages are not included.
 * @param absoluteFilePath The absolute path the the file we will analyze
 * @returns An array of barrel file references found in the file
 */
export function getBarrelFileReferencesInFile(absoluteFilePath: string): BarrelFileReference[] {
  const result: BarrelFileReference[] = [];

  const exports = getExportsFromModule(absoluteFilePath);

  for (const reExportToVisit of exports.reExports) {
    // Only consider internal modules (relative paths)
    if (isInternalModule(reExportToVisit.importPath)) {
      const potentialBarrelFilePath = resolveModulePath(
        path.resolve(path.dirname(absoluteFilePath), reExportToVisit.importPath)
      );
      const exportsFromPotentialBarrel = getExportsFromModule(potentialBarrelFilePath);

      if (
        exportsFromPotentialBarrel.reExports.length > 0 &&
        // Don't consider re-exports from external packages a barrel file reference
        exportsFromPotentialBarrel.reExports.filter((e) => isInternalModule(e.importPath)).length > 0
      ) {
        result.push({
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
