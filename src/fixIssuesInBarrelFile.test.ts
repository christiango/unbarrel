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

  it('handles export type * by marking all exports as type-only', () => {
    mock({
      '/index.ts': 'export type * from "./types";',
      '/types.ts': `
export type MyType = string;
export interface MyInterface { value: number }
export const myValue = 42;
export function myFunction() { return 1; }
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // All exports should be marked as type-only since the original was `export type *`
    // Even value exports like myValue and myFunction should become type exports
    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      'export { type MyType, type MyInterface, type myValue, type myFunction } from "./types";'
    );
  });

  it('handles renamed exports and default exports through intermediate barrel files', () => {
    mock({
      '/index.ts': 'export * from "./barrel";',
      '/barrel.ts': `
// Re-export with rename
export { originalName as renamedExport } from "./source";
// Re-export default as named
export { default as MyComponent } from "./component";
// Re-export type with rename
export { type OriginalType as RenamedType } from "./types";
// Regular re-export for comparison
export { unchanged } from "./source";
      `,
      '/source.ts': `
export const originalName = "original";
export const unchanged = "unchanged";
      `,
      '/component.ts': `
const Component = () => null;
export default Component;
      `,
      '/types.ts': `
export type OriginalType = { id: number };
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    const result = fs.readFileSync('/index.ts', 'utf8');

    // Should preserve the renamed exports:
    // - originalName as renamedExport from ./source
    // - default as MyComponent from ./component
    // - type OriginalType as RenamedType from ./types
    // - unchanged from ./source
    assert.ok(result.includes('originalName as renamedExport'), 'Should have renamed export');
    assert.ok(result.includes('default as MyComponent'), 'Should have default export renamed');
    assert.ok(result.includes('type OriginalType as RenamedType'), 'Should have renamed type export');
    assert.ok(result.includes('unchanged'), 'Should have unchanged export');
    assert.ok(result.includes('from "./source"'), 'Should reference source module');
    assert.ok(result.includes('from "./component"'), 'Should reference component module');
    assert.ok(result.includes('from "./types"'), 'Should reference types module');
  });
});
