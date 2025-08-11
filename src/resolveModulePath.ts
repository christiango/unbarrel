import fs from 'node:fs';
import path from 'node:path';

/** Given a module path, attempts to get the path to that module, accounting to the fact that the absolute path may be missing an extension or pointing to a barrel file (index.ts/js etc)
 * @param absoluteModulePath - The absolute path to the module, which may be missing an extension or pointing to a directory
 * @returns - The resolved absolute path to the module file
 */
export function resolveModulePath(absoluteModulePath: string): string {
  // Resolve the actual file path - could be a file or directory with index.ts
  let resolvedFilePath: string | undefined;
  try {
    // Try to resolve as a module first
    resolvedFilePath = require.resolve(absoluteModulePath);
  } catch {
    // If that fails, try common TypeScript extensions and index files
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

    // Try direct file with extensions
    for (const ext of extensions) {
      const filePath = absoluteModulePath + ext;
      if (fs.existsSync(filePath)) {
        resolvedFilePath = filePath;
        break;
      }
    }

    // Try index files in directory
    if (!resolvedFilePath) {
      for (const indexFile of indexFiles) {
        const filePath = path.join(absoluteModulePath, indexFile);
        if (fs.existsSync(filePath)) {
          resolvedFilePath = filePath;
          break;
        }
      }
    }
  }
  if (!resolvedFilePath) {
    throw new Error(`Could not resolve module: ${absoluteModulePath}`);
  }

  return resolvedFilePath;
}
