import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { getAllExportDefinitionsReachableFromModule } from './getAllExportDefinitionsReachableFromModule';

describe('getAllExportDefinitionsReachableFromModule', () => {
  afterEach(() => {
    mock.restore();
  });

  it('handles exported defined within the module', () => {
    mock({
      '/test.ts': `
        export const test1 = 1;
        export interface Interface1 {}
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(getAllExportDefinitionsReachableFromModule('/test.ts'), [
      {
        type: 'resolvedModuleDefinition',
        importPath: '.',
        importedName: 'test1',
        exportedName: 'test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importPath: '.',
        importedName: 'Interface1',
        exportedName: 'Interface1',
        typeOnly: true,
      },
    ]);
  });

  it('handles named exports defined in another module', () => {
    mock({
      '/index.ts': `
        export { test1, Interface1 } from './test';
      `,
      '/test.ts': `
        export const test1 = 1;
        export interface Interface1 {}
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(getAllExportDefinitionsReachableFromModule('/index.ts'), [
      {
        type: 'resolvedModuleDefinition',
        importPath: './test',
        importedName: 'test1',
        exportedName: 'test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importPath: './test',
        importedName: 'Interface1',
        exportedName: 'Interface1',
        typeOnly: true,
      },
    ]);
  });

  it('handles export *', () => {
    mock({
      '/index.ts': `
        export * from './test';
      `,
      '/test.ts': `
        export const test1 = 1;
        export interface Interface1 {}
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(getAllExportDefinitionsReachableFromModule('/index.ts'), [
      {
        type: 'resolvedModuleDefinition',
        importPath: './test',
        importedName: 'test1',
        exportedName: 'test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importPath: './test',
        importedName: 'Interface1',
        exportedName: 'Interface1',
        typeOnly: true,
      },
    ]);
  });

  it('handles nested exports', () => {
    mock({
      '/index.ts': `
        export { test1, Interface1 } from './nested1'
        export * from './nested2'
      `,
      '/nested1': {
        'index.ts': `
        export { test1 } from './test1';
        export { Interface1 } from './anotherNested';
        `,
        anotherNested: {
          'index.ts': `export { Interface1 } from './interface1'`,
          'interface1.ts': `export interface Interface1 {}`,
        },
        'test1.ts': `export const test1 = 1;`,
      },
      '/nested2': {
        'index.ts': `
          export * from './interface2';
          export * from './anotherNested';
        `,
        anotherNested: {
          'index.ts': `export * from './nested'`,
          'nested.ts': `
            export const anotherNested2 = 2;
          `,
        },
        'interface2.ts': `
          export interface Interface2 {}
        `,
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(getAllExportDefinitionsReachableFromModule('/index.ts'), [
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested1/test1',
        importedName: 'test1',
        exportedName: 'test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested1/anotherNested/interface1',
        importedName: 'Interface1',
        exportedName: 'Interface1',
        typeOnly: true,
      },
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested2/interface2',
        importedName: 'Interface2',
        exportedName: 'Interface2',
        typeOnly: true,
      },
      {
        type: 'resolvedModuleDefinition',
        importPath: './nested2/anotherNested/nested',
        importedName: 'anotherNested2',
        exportedName: 'anotherNested2',
        typeOnly: false,
      },
    ]);
  });
});
