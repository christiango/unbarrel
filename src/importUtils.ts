import path from 'node:path';

/**
 * Normalizes any Windows style path separators into POSIX separators so the path can be used in import specifiers.
 * @param filePath The path to normalize
 */
export function normalizeToPosixPath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

/**
 * Returns true if the import path is to an internal module and false if it's an external package
 * @param importPath The path to check
 * @returns true for relative path like './foo' and false for external paths like 'react'
 */
export function isInternalModule(importPath: string): boolean {
  return importPath.startsWith('.');
}

/**
 * Converts node paths into ESM import paths, such as foo/bar into ./foo/bar
 * @param relativePath The path to convert
 * @returns The converted path, which is suitable for ESM imports
 */
export function convertToESMImportPath(relativePath: string): string {
  const normalizedPath = normalizeToPosixPath(relativePath);

  if (normalizedPath.startsWith('.')) {
    return normalizedPath;
  }

  return './' + normalizedPath;
}

/**
 * Converts an absolute path to a relative ESM import path. For example /foo/bar/baz.ts turns into ./baz.ts for baseDir /foo/bar
 * @param absolutePath The absolute path to convert into a relative path
 * @param baseDir The base directory to resolve the relative path against
 */
export function convertAbsolutePathToRelativeImportPath(absolutePath: string, baseDir: string): string {
  const relativePath = path.relative(baseDir, absolutePath);
  return convertToESMImportPath(relativePath);
}
