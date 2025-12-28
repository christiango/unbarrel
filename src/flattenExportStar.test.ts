import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { flattenExportStar } from './flattenExportStar';

describe('flattenExportStar tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns all exports and re-exports reachable', () => {
    mock({
      '/index.ts': 'export * from "./test";',
      '/test1.ts': `
      export const test = 1;
      export interface TestInterface{}
      export * from './test2'
      `,
      '/test2.ts': `
      export const test2 = 2;
      export * from './test3'
      `,
      '/test3.ts': `
      export const test3 = 3;
      export function fn3() {}`,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(flattenExportStar('/index.ts', './test1'), [
      {
        type: 'resolvedModuleDefinition',
        importedName: 'test',
        exportedName: 'test',
        importPath: './test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'TestInterface',
        exportedName: 'TestInterface',
        importPath: './test1',
        typeOnly: true,
      },
    ]);
  });
});
