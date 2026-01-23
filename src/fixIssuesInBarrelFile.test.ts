import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';
import fs from 'node:fs';

import { fixIssuesInBarrelFile } from './fixIssuesInBarrelFile';

describe('fixIssuesInBarrelFiletests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('does nothing when the module has no exports', () => {
    mock({
      '/index.ts': 'export {} from "./test";',
      '/test.ts': 'export const test = 1;',
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), 'export {} from "./test";');
  });

  it('does nothing when the module does not reference other barrel files', () => {
    mock({
      '/index.ts': 'export { test } from "./test";',
      '/test.ts': 'export const test = 1;',
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), 'export { test } from "./test";');
  });

  it('fixes references to other barrel files', () => {
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

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `
      export { test } from "./test";
      export { barrelFileExport } from "./barrelFileReference";
      export { anotherBarrelFileExport } from "./barrelFileReference/anotherBarrelFileReference";
      `
    );
  });

  it('does not change references to external packages', () => {
    mock({
      '/index.ts': `
      export { useEffect } from "react";
      export { createRoot } from "./createRoot";
      `,
      '/createRoot.ts': `
      export { createRoot } from "react-dom/client";`,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `
      export { useEffect } from "react";
      export { createRoot } from "./createRoot";
      `
    );
  });

  it('fixes a barrel file that has an export * in it', () => {
    mock({
      '/index.ts': `
      export * from "./test";
      `,
      '/test.ts': `
      export const test = 1;
      export { barrelFileReference } from "./barrelFileReference";
      `,
      '/barrelFileReference.ts': `export const barrelFileReference = 12`,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `
    export { test } from "./test";
    export { barrelFileReference } from "./barrelFileReference";
    `
    );
  });
});
