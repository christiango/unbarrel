import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { flattenExportStar } from './flattenExportStar';

describe('flattenExportStar tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('does nothing when the module has no exports', () => {
    mock({
      '/index.ts': 'export * from "./test";',
      '/test1.ts': `
      export const test = 1;
      export interface TestInterface{}
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(flattenExportStar('/index.ts', './test1'), [
      {
        type: 'namedExport',
        typeOnly: false,
        name: 'test',
      },
      {
        type: 'namedExport',
        typeOnly: true,
        name: 'TestInterface',
      },
    ]);
  });
});
