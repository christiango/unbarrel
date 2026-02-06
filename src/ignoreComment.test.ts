import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as t from '@babel/types';

import { hasIgnoreComment } from './ignoreComment';

describe('hasIgnoreComment', () => {
  it('returns true when node has unbarrel-ignore-next-line line comment', () => {
    const node = t.exportAllDeclaration(t.stringLiteral('./test'));
    node.leadingComments = [{ type: 'CommentLine', value: ' unbarrel-ignore-next-line' } as t.Comment];
    assert.strictEqual(hasIgnoreComment(node), true);
  });

  it('returns true when node has unbarrel-ignore-next-line block comment', () => {
    const node = t.exportAllDeclaration(t.stringLiteral('./test'));
    node.leadingComments = [{ type: 'CommentBlock', value: ' unbarrel-ignore-next-line ' } as t.Comment];
    assert.strictEqual(hasIgnoreComment(node), true);
  });

  it('returns false when node has no comments', () => {
    const node = t.exportAllDeclaration(t.stringLiteral('./test'));
    assert.strictEqual(hasIgnoreComment(node), false);
  });

  it('returns false when node has unrelated comments', () => {
    const node = t.exportAllDeclaration(t.stringLiteral('./test'));
    node.leadingComments = [{ type: 'CommentLine', value: ' some other comment' } as t.Comment];
    assert.strictEqual(hasIgnoreComment(node), false);
  });

  it('handles comment with no extra spaces', () => {
    const node = t.exportAllDeclaration(t.stringLiteral('./test'));
    node.leadingComments = [{ type: 'CommentLine', value: 'unbarrel-ignore-next-line' } as t.Comment];
    assert.strictEqual(hasIgnoreComment(node), true);
  });

  it('returns true when comment has trailing text after directive', () => {
    const node = t.exportAllDeclaration(t.stringLiteral('./test'));
    node.leadingComments = [
      { type: 'CommentLine', value: ' unbarrel-ignore-next-line -- TODO: Fix this' } as t.Comment,
    ];
    assert.strictEqual(hasIgnoreComment(node), true);
  });

  it('returns false when directive is a substring of another word', () => {
    const node = t.exportAllDeclaration(t.stringLiteral('./test'));
    node.leadingComments = [
      { type: 'CommentLine', value: ' unbarrel-ignore-next-line-extra' } as t.Comment,
    ];
    assert.strictEqual(hasIgnoreComment(node), false);
  });
});
