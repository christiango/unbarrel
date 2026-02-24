import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { getIssuesInBarrelFile } from './getIssuesInBarrelFile';

describe('getIssuesInBarrelFile tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns no results when the module has no exports', () => {
    mock({
      '/index.ts': 'export {} from "./test";',
      '/test.ts': 'export const test = 1;',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), []);
  });

  it('returns no results when the module does not reference other barrel files', () => {
    mock({
      '/index.ts': 'export { test } from "./test";',
      '/test.ts': 'export const test = 1;',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), []);
  });

  it('returns references to other barrel files', () => {
    mock({
      '/index.ts': `
      export { test } from "./test";
      export { barrelFileExport, anotherBarrelFileExport } from "./barrelFileReference";
      `,
      '/test.ts': 'export const test = 1;',
      '/barrelFileReference/index.ts': `
      export { barrelFileExport, anotherBarrelFileExport } from "./barrelFileReference";
      export * from "./anotherBarrelFileReference";
        `,
      '/barrelFileReference/barrelFileReference.ts': `
      export const barrelFileExport = 12;
      export const anotherBarrelFileReference = 34;
      `,
      '/barrelFileReference/anotherBarrelFileReference.ts': `
      export const anotherBarrelFileExport = 34;
      `,

      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), [
      {
        type: 'barrelFileReference',
        exportedName: 'barrelFileExport',
        barrelFilePath: './barrelFileReference/index.ts',
      },
      {
        type: 'barrelFileReference',
        exportedName: 'anotherBarrelFileExport',
        barrelFilePath: './barrelFileReference/index.ts',
      },
    ]);
  });

  it('does not return references to external packages', () => {
    mock({
      '/index.ts': `
      export { useEffect } from "react";
      export { createRoot } from "./createRoot";
      `,
      '/createRoot.ts': `
      export { createRoot } from "react-dom/client";`,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), []);
  });

  it('only looks at exports from other modules that are re-exported', () => {
    mock({
      '/index.ts': `
      export { test } from "./test";
      `,
      '/test.ts': `
      export const test = 1;
      export { barrelFileReference } from "./barrelFileReference";
      `,
      '/barrelFileReference/index.ts': `
        export { barrelFileReference, anotherBarrelFileReference } from "./barrelFileReference";
      `,

      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), []);
  });

  it('is a barrel file if it has an export * in it', () => {
    mock({
      '/index.ts': `
      export * from "./test";
      `,
      '/test.ts': `
      export const test = 1;
      export { barrelFileReference } from "./barrelFileReference";
      `,

      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), [
      {
        type: 'exportAll',
        barrelFilePath: '/index.ts',
      },
    ]);
  });

  it('detects barrel file references with renamed exports', () => {
    mock({
      '/index.ts': `export { foo as bar } from "./barrel";`,
      '/barrel/index.ts': `export { foo } from "./source";`,
      '/barrel/source.ts': `export const foo = 1;`,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), [
      {
        type: 'barrelFileReference',
        exportedName: 'bar',
        barrelFilePath: './barrel/index.ts',
      },
    ]);
  });

  it('detects barrel file references when the barrel file uses export *', () => {
    mock({
      '/index.ts': `export { ShareMode } from "./services";`,
      '/services/index.ts': `export * from "./shareService";`,
      '/services/shareService.ts': `export enum ShareMode { Read = 'READ', Write = 'WRITE' }`,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), [
      {
        type: 'barrelFileReference',
        exportedName: 'ShareMode',
        barrelFilePath: './services/index.ts',
      },
    ]);
  });

  it('detects barrel file references where the intermediate module re-exports a default import as a named export', () => {
    // `import foo from './source'; export { foo }` in the intermediate module produces a
    // defaultExport re-export. isBarrelFileReference should still flag this as an indirection.
    mock({
      '/index.ts': `export { icon } from './assets';`,
      '/assets/index.ts': `
        import icon from './icon.svg';
        export { icon };
      `,
      '/assets/icon.svg': '<svg></svg>',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getIssuesInBarrelFile('/index.ts'), [
      {
        type: 'barrelFileReference',
        exportedName: 'icon',
        barrelFilePath: './assets/index.ts',
      },
    ]);
  });

  describe('unbarrel-ignore-next-line comment', () => {
    it('skips export * with unbarrel-ignore-next-line comment during issue detection', () => {
      mock({
        '/index.ts': `// unbarrel-ignore-next-line
export * from "./test";`,
        '/test.ts': 'export const test = 1;',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getIssuesInBarrelFile('/index.ts'), []);
    });

    it('skips barrel file reference with unbarrel-ignore-next-line comment during issue detection', () => {
      mock({
        '/index.ts': `export { test } from "./test";
// unbarrel-ignore-next-line
export { barrelFileExport } from "./barrel";`,
        '/test.ts': 'export const test = 1;',
        '/barrel/index.ts': 'export { barrelFileExport } from "./source";',
        '/barrel/source.ts': 'export const barrelFileExport = 12;',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getIssuesInBarrelFile('/index.ts'), []);
    });

    it('only skips the export with unbarrel-ignore-next-line, reports other issues', () => {
      mock({
        '/index.ts': `// unbarrel-ignore-next-line
export * from "./test";
export * from "./other";`,
        '/test.ts': 'export const test = 1;',
        '/other.ts': 'export const other = 1;',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getIssuesInBarrelFile('/index.ts'), [
        {
          type: 'exportAll',
          barrelFilePath: '/index.ts',
        },
      ]);
    });

    it('works with trailing text after the directive during issue detection', () => {
      mock({
        '/index.ts': `// unbarrel-ignore-next-line -- TODO: Fix this
export * from "./test";`,
        '/test.ts': 'export const test = 1;',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getIssuesInBarrelFile('/index.ts'), []);
    });
  });
});
