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

  it('handles the case where it is re-exporting from the module it is defined in as a default export', () => {
    mock({
      '/index.ts': 'export { default as exportedFunction } from "./test";',
      '/test.ts': 'export default function func1(){};',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(
      getExportDefinitionFromReExport('/index.ts', {
        type: 'namedExport',
        importedName: 'default',
        exportedName: 'exportedFunction',
        importPath: './test',
        typeOnly: false,
      }),
      {
        type: 'resolvedModuleDefinition',
        importPath: './test',
        importedName: 'default',
        exportedName: 'exportedFunction',
      }
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

  it('handles the case where there are multiple layers of re-exports and renames', () => {
    mock({
      '/index.ts': 'export { nested1Test as finalTest } from "./nested1";',
      '/nested1': {
        'index.ts': 'export { nested2Test as nested1Test } from "./nested2";',
        nested2: {
          'index.ts': 'export { test as nested2Test } from "./test";',
          'test.ts': `
            const internalName = 1;
            export { internalName as test };
          `,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(
      getExportDefinitionFromReExport('/index.ts', {
        type: 'namedExport',
        importedName: 'nested1Test',
        exportedName: 'finalTest',
        importPath: './nested1',
        typeOnly: false,
      }),
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested1/nested2/test',
        importedName: 'test',
        exportedName: 'finalTest',
      }
    );
  });

  it('handles the case where there are multiple layers of re-exports and renames with defaults', () => {
    mock({
      '/index.ts': 'export { default as finalTest } from "./nested1";',
      '/nested1': {
        'index.ts': `
        import { default as nested1 } from "./nested2";
        export default nested1;
        `,
        nested2: {
          'index.ts': 'export { default } from "./test";',
          'test.ts': `
            export default function internalName() {};
          `,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(
      getExportDefinitionFromReExport('/index.ts', {
        type: 'namedExport',
        importedName: 'default',
        exportedName: 'finalTest',
        importPath: './nested1',
        typeOnly: false,
      }),
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested1/nested2/test',
        importedName: 'default',
        exportedName: 'finalTest',
      }
    );
  });

  it('handles the case where there are multiple layers of export star', () => {
    mock({
      '/index.ts': 'export { finalExport } from "./nested1";',
      '/nested1': {
        'index.ts': `export * from "./nested2";`,
        nested2: {
          'index.ts': 'export * from "./test";',
          'test.ts': `
            export const finalExport = 1;
          `,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(
      getExportDefinitionFromReExport('/index.ts', {
        type: 'namedExport',
        importedName: 'finalExport',
        exportedName: 'finalExport',
        importPath: './nested1',
        typeOnly: false,
      }),
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested1/nested2/test',
        importedName: 'finalExport',
        exportedName: 'finalExport',
      }
    );
  });
});
