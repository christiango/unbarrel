import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { getBarrelFileReferencesInFile } from './getBarrelFileReferencesInFile';

describe('getBarrelFileReferencesInFile tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns no results when the module has no exports', () => {
    mock({
      '/index.ts': 'export {} from "./test";',
      '/test.ts': 'export const test = 1;',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getBarrelFileReferencesInFile('/index.ts'), []);
  });

  it('returns no results when the module does not reference other barrel files', () => {
    mock({
      '/index.ts': 'export { test } from "./test";',
      '/test.ts': 'export const test = 1;',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getBarrelFileReferencesInFile('/index.ts'), []);
  });

  it('returns references to other barrel files', () => {
    mock({
      '/index.ts': `
      export { test } from "./test";
      export { barrelFileReference } from "./barrelFileReference";
      export { reExportFromExternalPackage } from "react";
      `,
      '/test.ts': 'export const test = 1;',
      '/barrelFileReference/index.ts':
        'export { barrelFileReference, anotherBarrelFileReference } from "./barrelFileReference";',
      '/barrelFileReference/barrelFileReference.ts': `
      export const barrelFileReference = 12;
      export const anotherBarrelFileReference = 34;
      `,

      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getBarrelFileReferencesInFile('/index.ts'), [
      { barrelFilePath: './barrelFileReference/index.ts' },
      { barrelFilePath: 'react' },
    ]);
  });
});
