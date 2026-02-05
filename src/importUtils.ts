import path from 'node:path';
import { resolveModulePath } from './resolveModulePath';

/**
 * Strips the file extension from a path.
 * @param filePath The path to strip the extension from
 */
export function stripExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
}

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

/**
 * Checks if a file path represents an asset file (non-code file).
 * Asset files include images, stylesheets, data files, and other static resources.
 * @param filePath The file path to check
 * @returns true if the file is an asset file, false if it's a code file
 */
export function isAssetFile(filePath: string): boolean {
  const assetExtensions = [
    // Images
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.bmp',
    // Styles
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.styl',
    // Data
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.csv',
    // Fonts
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.eot',
    // Media
    '.mp3',
    '.mp4',
    '.webm',
    '.ogg',
    '.wav',
    '.mov',
    // Other
    '.pdf',
    '.txt',
    '.md',
  ];

  const ext = path.extname(filePath).toLowerCase();
  return assetExtensions.includes(ext);
}

/**
 * Given a path to a module and an import within the module, get the absolute path of that import module
 * @param absolutePathOfModule - the absolute path of the module with the import
 * @param importPath - the path of the import to convert into an absolute path
 */
export function getAbsolutePathOfImport(absolutePathOfModule: string, importPath: string): string {
  const directoryPath = path.dirname(absolutePathOfModule);
  const importAbsolutePath = path.resolve(directoryPath, importPath);
  return resolveModulePath(importAbsolutePath);
}
