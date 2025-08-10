import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { resolveModulePath } from './resolveModulePath';

describe('resolveModulePath tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('resolves a .ts file when given a path without extension', () => {
    mock({
      '/test.ts': 'export const x = 1;',
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/test'), '/test.ts');
  });

  it('resolves index.ts inside a directory path', () => {
    mock({
      '/dir': {
        'index.ts': 'export const y = 2;',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/dir'), '/dir/index.ts');
  });

  it('prefers index.ts over index.js when both exist', () => {
    mock({
      '/dir': {
        'index.ts': 'export const y = 2;',
        'index.js': 'module.exports = { y: 2 };',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/dir'), '/dir/index.ts');
  });

  it('falls back to index.js when only JS index exists', () => {
    mock({
      '/dir': {
        'index.js': 'module.exports = { y: 2 };',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/dir'), '/dir/index.js');
  });

  it('throws when the path cannot be resolved', () => {
    mock({
      './node_modules': mock.load('node_modules'),
    });

    assert.throws(() => resolveModulePath('/does-not-exist'), /Could not resolve module: \/does-not-exist/);
  });
});
