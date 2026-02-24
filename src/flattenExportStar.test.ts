import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { flattenExportStar } from './flattenExportStar';

describe('flattenExportStar tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns all exports and re-exports reachable, using the original import path for all', () => {
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

    // All exports use './test1' as the importPath - barrel reference resolution happens in a separate pass
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
        importPath: './test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'test3',
        exportedName: 'test3',
        importPath: './test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'Interface3',
        exportedName: 'Interface3',
        importPath: './test1',
        typeOnly: true,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'default',
        exportedName: 'default',
        importPath: './test1',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'test4',
        exportedName: 'test4',
        importPath: './test1',
        typeOnly: false,
      },
    ]);
  });

  it('uses the original import path for named re-exports from subdirectory files', () => {
    // Previously this test verified that path segments were correctly resolved. Now flattenExportStar
    // always uses the original import path - the barrel reference fix pass in fixIssuesInBarrelFile
    // is responsible for resolving exports through intermediate barrel files.
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

    // All exports use './utilities' as the importPath; resolution to true sources happens later
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
        importPath: './utilities',
        typeOnly: true,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'getParser',
        exportedName: 'getParser',
        importPath: './utilities',
        typeOnly: false,
      },
    ]);
  });

  it('always uses the original import path for named re-exports', () => {
    mock({
      '/index.ts': `export * from './properties';`,
      '/properties/index.ts': `
        export { alpha } from './alpha';
        export { beta } from './nested/beta';
      `,
      '/properties/alpha.ts': `export const alpha = 1;`,
      '/properties/nested/beta.ts': `export const beta = 2;`,
      './node_modules': mock.load('node_modules'),
    });

    const result = flattenExportStar('/index.ts', './properties');

    assert.deepStrictEqual(result, [
      {
        type: 'resolvedModuleDefinition',
        importedName: 'alpha',
        exportedName: 'alpha',
        importPath: './properties',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'beta',
        exportedName: 'beta',
        importPath: './properties',
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

  it('uses the exported name (not the deep source name) when flattening through nested export * with renames', () => {
    // When an intermediate barrel has `export * from './inner'` and inner has
    // `export { Badge as StatusBadge } from './Badge'`, getAllExportDefinitionsReachableFromModule
    // returns importedName='Badge'. That must be overridden to exportedName='StatusBadge' because
    // from the barrel's perspective the only name it exposes is StatusBadge.
    mock({
      '/index.ts': `export * from './components';`,
      '/components/index.ts': `export * from './icons';`,
      '/components/icons/index.ts': `
        import StarIcon from './Star.svg';
        export { StarIcon };
        export { Badge as StatusBadge } from './Badge';
      `,
      '/components/icons/Star.svg': `<svg></svg>`,
      '/components/icons/Badge.ts': `export const Badge = () => {};`,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(flattenExportStar('/index.ts', './components'), [
      {
        type: 'resolvedModuleDefinition',
        importedName: 'StatusBadge',
        exportedName: 'StatusBadge',
        importPath: './components',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'StarIcon',
        exportedName: 'StarIcon',
        importPath: './components',
        typeOnly: false,
      },
    ]);
  });

  it('treats default import re-exports as named exports using the original import path', () => {
    // When an intermediate barrel does `import foo from './source'; export { foo }`,
    // getExportsFromModule produces a defaultExport re-export with exportedName 'foo'.
    // flattenExportStar keeps the original importPath so that isBarrelFileReference can
    // detect the indirection and getExportDefinitionFromReExport can resolve it in the
    // barrel reference fix pass (e.g. to `export { default as icon } from "./assets/icon.svg"`).
    mock({
      '/index.ts': `export * from './assets';`,
      '/assets/index.ts': `
        import icon from './icon.svg';
        import photo from './photo.png';
        export { icon, photo };
      `,
      '/assets/icon.svg': '<svg></svg>',
      '/assets/photo.png': 'PNG_DATA',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepStrictEqual(flattenExportStar('/index.ts', './assets'), [
      {
        type: 'resolvedModuleDefinition',
        importedName: 'icon',
        exportedName: 'icon',
        importPath: './assets',
        typeOnly: false,
      },
      {
        type: 'resolvedModuleDefinition',
        importedName: 'photo',
        exportedName: 'photo',
        importPath: './assets',
        typeOnly: false,
      },
    ]);
  });
});
