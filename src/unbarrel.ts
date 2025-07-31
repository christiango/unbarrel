

/**
 * This tool will process a barrel file and make the following optimizations:
 * - Export * statements will be inlined to include the full set of exports reachable by that export *.
 * - All export statements will be updated to point at the module with the declaration, removing all references to other barrel files.
 * @param absoluteRootPath The absolute path to the root file this tool was invoked on
 */
export function unbarrel(absoluteRootPath: string) {
}