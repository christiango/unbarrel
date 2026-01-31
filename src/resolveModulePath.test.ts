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

  it('resolves a .d.ts file when given a path without extension', () => {
    mock({
      '/types.d.ts': 'export type Foo = string;',
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/types'), '/types.d.ts');
  });

  it('prefers .ts over .d.ts when both exist', () => {
    mock({
      '/module.ts': 'export const x = 1;',
      '/module.d.ts': 'export type X = number;',
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/module'), '/module.ts');
  });

  it('resolves index.d.ts inside a directory path', () => {
    mock({
      '/types-dir': {
        'index.d.ts': 'export type Bar = number;',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/types-dir'), '/types-dir/index.d.ts');
  });

  it('prefers index.ts over index.d.ts when both exist', () => {
    mock({
      '/dir': {
        'index.ts': 'export const y = 2;',
        'index.d.ts': 'export type Y = number;',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/dir'), '/dir/index.ts');
  });

  it('throws when the path cannot be resolved', () => {
    mock({
      './node_modules': mock.load('node_modules'),
    });

    assert.throws(() => resolveModulePath('/does-not-exist'), /Could not resolve module: \/does-not-exist/);
  });

  it('resolves a .ts file when import path has .js extension (ESM pattern)', () => {
    // TypeScript/ESM allows importing with .js extension even when source is .ts
    // e.g., import { foo } from './module.js' where the actual file is module.ts
    mock({
      '/src/utils.ts': 'export function helper() { return 1; }',
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/src/utils.js'), '/src/utils.ts');
  });

  it('resolves a .tsx file when import path has .jsx extension', () => {
    mock({
      '/src/Component.tsx': 'export const Component = () => null;',
      './node_modules': mock.load('node_modules'),
    });

    assert.equal(resolveModulePath('/src/Component.jsx'), '/src/Component.tsx');
  });

  it('prefers actual .js file over .ts when .js extension is specified and both exist', () => {
    mock({
      '/src/module.js': 'module.exports = { x: 1 };',
      '/src/module.ts': 'export const x = 1;',
      './node_modules': mock.load('node_modules'),
    });

    // If the .js file actually exists, use it
    assert.equal(resolveModulePath('/src/module.js'), '/src/module.js');
  });
});
