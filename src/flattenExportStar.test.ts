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

  it('correctly resolves named re-exports from subdirectory files without duplicating path segments', () => {
    // This test reproduces a bug where flattening export * through a barrel file
    // that has named re-exports from subdirectory files would produce duplicated
    // path segments like "./componentEditableUtils/componentEditableUtils/Utils"
    // instead of "./utilities/componentEditableUtils/Utils"
    mock({
      '/index.ts': `export * from './utilities';`,
      '/utilities/index.ts': `
        export const utilityFunction = () => {};
        export { type Parser, getParser } from './componentEditableUtils/Utils';
      `,
      '/utilities/componentEditableUtils/Utils.ts': `
        export type Parser = { parse(): void };
        export function getParser() { return null; }
      `,
      './node_modules': mock.load('node_modules'),
    });

    const result = flattenExportStar('/index.ts', './utilities');

    // The paths should be correct relative to /index.ts
    assert.deepStrictEqual(result, [
      {
        type: 'resolvedModuleDefinition',
        importedName: 'utilityFunction',
        exportedName: 'utilityFunction',
        importPath: './utilities',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'Parser',
        exportedName: 'Parser',
        importPath: './utilities/componentEditableUtils/Utils',
        typeOnly: true,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'getParser',
        exportedName: 'getParser',
        importPath: './utilities/componentEditableUtils/Utils',
        typeOnly: false,
      },
    ]);
  });

  it('skips export * from external packages', () => {
    // External packages like 'react' or '@foo/bar' cannot be enumerated,
    // so export * from them should be skipped rather than causing an error.
    // The module being flattened (./barrel) has both local exports and external export *.
    mock({
      '/index.ts': `export * from './barrel';`,
      '/barrel.ts': `
        export const localExport = 1;
        export * from 'external-package';
      `,
      './node_modules': mock.load('node_modules'),
    });

    // Should only include the local export, not crash trying to resolve external-package
    assert.deepStrictEqual(flattenExportStar('/index.ts', './barrel'), [
      {
        type: 'resolvedModuleDefinition',
        importedName: 'localExport',
        exportedName: 'localExport',
        importPath: './barrel',
        typeOnly: false,
      },
    ]);
  });

  it('keeps external package paths as-is for named re-exports', () => {
    // When a barrel file re-exports from an external package via named export,
    // the import path should be kept as the external package name, not resolved.
    mock({
      '/index.ts': `
        export * from './barrel';
      `,
      '/barrel.ts': `
        export { useState } from 'react';
        export const localThing = 1;
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(flattenExportStar('/index.ts', './barrel'), [
      {
        type: 'resolvedModuleDefinition',
        importedName: 'localThing',
        exportedName: 'localThing',
        importPath: './barrel',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'useState',
        exportedName: 'useState',
        importPath: 'react',
        typeOnly: false,
      },
    ]);
  });
});
