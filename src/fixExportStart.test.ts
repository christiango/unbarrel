import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';
import * as fs from 'node:fs';

import { fixExportStar } from './fixExportStar';

describe('fixExportStar tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('does nothing when there are no export stars', () => {
    mock({
      '/index.ts': 'export { test } from "./test";',
      '/test.ts': 'export const test = 1;',
      './node_modules': mock.load('node_modules'),
    });

    fixExportStar('/index.ts');

    assert.deepEqual(fs.readFileSync('/index.ts', 'utf-8'), 'export { test } from "./test";');
  });

  it('resolves all named exports from an export star when there are no re-exports', () => {
    mock({
      '/index.ts': `export * from "./add";
      export * from "./subtract";
      `,
      '/add.ts': `
      export function add(a: number, b: number): number {
        return a + b;
      }

      export function addThree(a: number, b: number, c: number): number {
        return a + b + c;
      }
      `,
      '/subtract.ts': `
      export function subtract(a: number, b: number): number {
        return a - b;
      }
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixExportStar('/index.ts');

    assert.deepEqual(
      fs.readFileSync('/index.ts', 'utf-8'),
      `export { add, addThree } from './add';
export { subtract } from './subtract';`
    );
  });
});
