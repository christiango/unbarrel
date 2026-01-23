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

  it('does not modify files without export * (barrel file references are not fixed)', () => {
    mock({
      '/index.ts': `
      export { test } from "./test";
      export { barrelFileExport, anotherBarrelFileExport } from "./barrelFileReference";
      `,
      '/test.ts': 'export const test = 1;',
      '/barrelFileReference/index.ts': `
      export { barrelFileExport } from "./barrelFileReference";
      export { anotherBarrelFileExport } from "./anotherBarrelFileReference";
        `,
      '/barrelFileReference/barrelFileReference.ts': `
      export const barrelFileExport = 12;
      `,
      '/barrelFileReference/anotherBarrelFileReference.ts': `
      export const anotherBarrelFileExport = 34;
      `,

      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // File should remain unchanged since there's no export * to fix
    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `
      export { test } from "./test";
      export { barrelFileExport, anotherBarrelFileExport } from "./barrelFileReference";
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
      '/index.ts': 'export * from "./test";',
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
      'export { test } from "./test";\nexport { barrelFileReference } from "./barrelFileReference";'
    );
  });

  it('preserves function definitions, comments, and other non-export-star statements', () => {
    mock({
      '/index.ts': `// This is a comment that should be preserved
export function myFunction() {
  return 42;
}

/** JSDoc comment */
export * from "./test";

export const myConst = 123;`,
      '/test.ts': `
      export const test = 1;
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `// This is a comment that should be preserved
export function myFunction() {
  return 42;
}

/** JSDoc comment */
export { test } from "./test";
export const myConst = 123;`
    );
  });

  it('groups multiple exports from the same path into a single export statement', () => {
    mock({
      '/index.ts': 'export * from "./utils";',
      '/utils.ts': `
export const foo = 1;
export const bar = 2;
export type FooType = string;
export interface BarInterface { value: number }
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // All exports from the same path should be grouped into a single export statement
    // Type exports should have the 'type' specifier
    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      'export { foo, bar, type FooType, type BarInterface } from "./utils";'
    );
  });

  it('groups multiple export stars pointing to the same underlying module without duplicates', () => {
    mock({
      '/index.ts': `export * from "./a";
export * from "./b";`,
      '/a.ts': `
export { shared, type SharedType } from "./shared";
export const aOnly = 1;
      `,
      '/b.ts': `
export { shared, type SharedType } from "./shared";
export const bOnly = 2;
      `,
      '/shared.ts': `
export const shared = "shared value";
export type SharedType = string;
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    const result = fs.readFileSync('/index.ts', 'utf8');

    // Deduplication should result in:
    // - aOnly from ./a
    // - shared, type SharedType from ./shared (deduplicated - only appears once even though both a and b re-export from shared)
    // - bOnly from ./b
    assert.strictEqual(
      result,
      'export { aOnly } from "./a";\nexport { shared, type SharedType } from "./shared";\nexport { bOnly } from "./b";'
    );
  });
});
