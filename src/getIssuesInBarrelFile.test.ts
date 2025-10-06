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
});
