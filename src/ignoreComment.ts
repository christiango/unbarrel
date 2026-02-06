import type * as t from '@babel/types';

const IGNORE_COMMENT = 'unbarrel-ignore-next-line';

/**
 * Checks if a Babel AST node has a leading `// unbarrel-ignore-next-line` comment.
 * When present, unbarrel will skip processing the export during both fix and issue detection.
 * Supports trailing text after the directive, e.g. `// unbarrel-ignore-next-line -- reason`.
 */
export function hasIgnoreComment(node: t.Node): boolean {
  if (!node.leadingComments) {
    return false;
  }
  return node.leadingComments.some((comment) => {
    const trimmed = comment.value.trim();
    return trimmed === IGNORE_COMMENT || trimmed.startsWith(IGNORE_COMMENT + ' ');
  });
}
