import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { getExportDefinitionFromReExport } from './getExportDefinitionFromReExport';

describe('getExportDefinitionForReExport', () => {
  afterEach(() => {
    mock.restore();
  });

  it('handles the case where it is re-exporting from the module it is defined in', () => {
    mock({
      '/index.ts': 'export { test1 } from "./test";',
      '/test.ts': 'export const test1 = 1;',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(
      getExportDefinitionFromReExport('/index.ts', {
        type: 'namedExport',
        importedName: 'test1',
        exportedName: 'test1',
        importPath: './test',
        typeOnly: false,
      }),
      { type: 'resolvedModuleDefinition', importPath: './test', importedName: 'test1', exportedName: 'test1' }
    );
  });

  it('handles the case where there are multiple layers of re-exports', () => {
    mock({
      '/index.ts': 'export { test1 } from "./nested1";',
      '/nested1': {
        'index.ts': 'export { test1 } from "./nested2";',
        nested2: {
          'index.ts': 'export { test1 } from "./test";',
          'test.ts': 'export const test1 = 1;',
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(
      getExportDefinitionFromReExport('/index.ts', {
        type: 'namedExport',
        importedName: 'test1',
        exportedName: 'test1',
        importPath: './nested1',
        typeOnly: false,
      }),
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested1/nested2/test',
        importedName: 'test1',
        exportedName: 'test1',
      }
    );
  });
});
