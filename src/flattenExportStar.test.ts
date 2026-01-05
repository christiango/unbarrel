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
      '/index.ts': `
        export * from "./test";
        export * from "./ignored";
        `,
      '/ignored.ts': `export const ignored = 1;`,
      '/test1.ts': `
      export const test = 1;
      export interface TestInterface{}
      export * from './test2'
      `,
      '/test2.ts': `
      export const test2 = 2;
      export * from './test3'
      export { test4 } from './test4';
      `,
      '/test3': {
        'index.ts': `
        export * from './test3'`,
        'test3.ts': `
      export const test3 = 3;
      export interface Interface3 {}
      export default function fn3() {}`,
      },
      '/test4.ts': `
      export const test4 = 4;
      export const anotherTest4 = 4;`,

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
      {
        type: 'resolvedModuleDefinition',
        importedName: 'test2',
        exportedName: 'test2',
        importPath: './test2',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'test3',
        exportedName: 'test3',
        importPath: './test3/test3',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'Interface3',
        exportedName: 'Interface3',
        importPath: './test3/test3',
        typeOnly: true,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'default',
        exportedName: 'default',
        importPath: './test3/test3',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'test4',
        exportedName: 'test4',
        importPath: './test4',
        typeOnly: false,
      },
    ]);
  });
});
