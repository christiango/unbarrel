import fs from 'node:fs';
import path from 'node:path';

import { normalizeToPosixPath } from './importUtils';

/** Given a module path, attempts to get the path to that module, accounting to the fact that the absolute path may be missing an extension or pointing to a barrel file (index.ts/js etc)
 * @param absoluteModulePath - The absolute path to the module, which may be missing an extension or pointing to a directory
 * @returns - The resolved absolute path to the module file
 */
export function resolveModulePath(absoluteModulePath: string): string {
  // Resolve the actual file path - could be a file or directory with index.ts
  let resolvedFilePath: string | undefined;

  // First, check if the file exists as-is (handles explicit extensions like .js, .ts, etc.)
  if (fs.existsSync(absoluteModulePath) && fs.statSync(absoluteModulePath).isFile()) {
    resolvedFilePath = absoluteModulePath;
  }

  // Handle ESM pattern: import from './module.js' where actual file is module.ts
  // TypeScript allows using .js extensions in imports even when source is .ts
  if (!resolvedFilePath) {
    const jsToTsMap: Record<string, string[]> = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };

    const ext = path.extname(absoluteModulePath);
    const replacements = jsToTsMap[ext];
    if (replacements) {
      const basePath = absoluteModulePath.slice(0, -ext.length);
      for (const replacement of replacements) {
        const filePath = basePath + replacement;
        if (fs.existsSync(filePath)) {
          resolvedFilePath = filePath;
          break;
        }
      }
    }
  }

  // Try common TypeScript extensions and index files
  if (!resolvedFilePath) {
    const extensions = ['.ts', '.tsx', '.d.ts', '.js', '.jsx'];
    const indexFiles = ['index.ts', 'index.tsx', 'index.d.ts', 'index.js', 'index.jsx'];

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

    // Try asset files if no code file was found
    if (!resolvedFilePath) {
      const assetExtensions = [
        '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
        '.css', '.scss', '.sass', '.less', '.styl',
        '.json', '.yaml', '.yml', '.toml', '.xml', '.csv',
        '.woff', '.woff2', '.ttf', '.otf', '.eot',
        '.mp3', '.mp4', '.webm', '.ogg', '.wav', '.mov',
        '.pdf', '.txt', '.md',
      ];

      for (const ext of assetExtensions) {
        const filePath = absoluteModulePath + ext;
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

  return normalizeToPosixPath(resolvedFilePath);
}
