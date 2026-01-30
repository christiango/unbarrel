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

  it('fixes barrel file references even without export *', () => {
    mock({
      '/index.ts': `export { test } from "./test";
export { barrelFileExport, anotherBarrelFileExport } from "./barrelFileReference";`,
      '/test.ts': 'export const test = 1;',
      '/barrelFileReference/index.ts': `
      export { barrelFileExport } from "./barrelFileReference";
      export { anotherBarrelFileExport } from "./anotherBarrelFileExport";
        `,
      '/barrelFileReference/barrelFileReference.ts': `
      export const barrelFileExport = 12;
      `,
      '/barrelFileReference/anotherBarrelFileExport.ts': `
      export const anotherBarrelFileExport = 34;
      `,

      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { test } from "./test";
export { anotherBarrelFileExport } from "./barrelFileReference/anotherBarrelFileExport";
export { barrelFileExport } from "./barrelFileReference/barrelFileReference";`
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

  it('prefers value exports over type exports when both have the same name', () => {
    mock({
      '/index.ts': 'export * from "./snackbar";',
      '/snackbar.ts': `
const SnackbarEvents = {
  Add: 'ADD',
  Remove: 'REMOVE'
} as const;
export type SnackbarEvents = (typeof SnackbarEvents)[keyof typeof SnackbarEvents];

export { SnackbarEvents };
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // SnackbarEvents should NOT be marked as type-only since it's also exported as a value
    // Value exports take precedence over type exports with the same name
    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), 'export { SnackbarEvents } from "./snackbar";');
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

  it('does not duplicate exports that already exist as explicit named exports', () => {
    mock({
      '/index.ts': `export { type MyProps, MyComponent } from "./component";
export * from "./component";`,
      '/component.ts': `
export interface MyProps { value: number }
export const MyComponent = () => null;
export function myFunction() { return 1; }
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    const result = fs.readFileSync('/index.ts', 'utf8');

    // MyProps should only appear once, not duplicated
    // The explicit type export should be preserved, and export * should only add MyComponent
    assert.strictEqual(result, `export { type MyProps, MyComponent, myFunction } from "./component";`);
  });

  it('fixes barrel file references alongside export * without duplicating', () => {
    mock({
      '/index.ts': `export { foo } from "./barrel";
export * from "./other";`,
      '/barrel/index.ts': `export { foo } from "./source";`,
      '/barrel/source.ts': `export const foo = 1;`,
      '/other.ts': `
export const bar = 2;
export const baz = 3;
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // The barrel file reference should be resolved to its true source
    // The export * should be flattened
    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { foo } from "./barrel/source";
export { bar, baz } from "./other";`
    );
  });

  it('does not duplicate when export * and barrel file reference resolve to the same name', () => {
    mock({
      '/index.ts': `export { foo } from "./barrel";
export * from "./a";`,
      '/barrel/index.ts': `export { foo } from "../a";`,
      '/a.ts': `
export const foo = 2;
export const bar = 3;
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // foo appears in both the barrel file reference and export *
    // The explicit barrel file reference should be resolved to its true source
    // The export * should skip foo since it's already exported explicitly
    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), `export { foo, bar } from "./a";`);
  });

  it('upgrades existing type export to value export when export star has value', () => {
    mock({
      '/index.ts': `export type { Events } from "./events";
export * from "./events";`,
      '/events.ts': `
const Events = { Add: 'ADD', Remove: 'REMOVE' } as const;
export type Events = (typeof Events)[keyof typeof Events];
export { Events };
export const handleEvent = () => {};
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // Events should be exported as a value (not type-only) since the module exports it as a value
    // The original type-only export should be upgraded to a value export
    // handleEvent should also be exported, no duplicate exports
    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), 'export { Events, handleEvent } from "./events";');
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

    // Should preserve the renamed exports from each module
    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { originalName as renamedExport, unchanged } from "./source";
export { default as MyComponent } from "./component";
export { type OriginalType as RenamedType } from "./types";`
    );
  });

  it('fixes barrel file references by pointing to the true source', () => {
    mock({
      '/index.ts': `export { barrelFileExport, anotherBarrelFileExport } from "./barrelFileReference";`,
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

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { anotherBarrelFileExport } from "./barrelFileReference/anotherBarrelFileReference";
export { barrelFileExport } from "./barrelFileReference/barrelFileReference";`
    );
  });

  it('fixes barrel file references while preserving direct exports', () => {
    mock({
      '/index.ts': `export { test } from "./test";
export { barrelFileExport } from "./barrel";`,
      '/test.ts': 'export const test = 1;',
      '/barrel/index.ts': `export { barrelFileExport } from "./source";`,
      '/barrel/source.ts': `export const barrelFileExport = 12;`,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { test } from "./test";
export { barrelFileExport } from "./barrel/source";`
    );
  });

  it('preserves renamed exports when fixing barrel file references', () => {
    mock({
      '/index.ts': `export { foo as bar } from "./barrel";`,
      '/barrel/index.ts': `export { foo } from "./source";`,
      '/barrel/source.ts': `export const foo = 1;`,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), `export { foo as bar } from "./barrel/source";`);
  });

  it('preserves type-only exports when fixing barrel file references', () => {
    mock({
      '/index.ts': `export { type MyType } from "./barrel";`,
      '/barrel/index.ts': `export { type MyType } from "./types";`,
      '/barrel/types.ts': `export type MyType = string;`,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), `export { type MyType } from "./barrel/types";`);
  });

  it('groups resolved barrel file references by their true source path', () => {
    mock({
      '/index.ts': `export { foo, bar } from "./barrel";`,
      '/barrel/index.ts': `
export { foo } from "./shared";
export { bar } from "./shared";
      `,
      '/barrel/shared.ts': `
export const foo = 1;
export const bar = 2;
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), `export { bar, foo } from "./barrel/shared";`);
  });

  it('preserves type exports when merging type-only and value exports from same source', () => {
    mock({
      '/index.ts': `export type { TypeA, TypeB } from "./barrel";
export * from "./barrel";
export type { TypeF } from "./typeF";`,
      '/barrel.ts': `
export type TypeA = string;
export type TypeB = number;
export const ValueC = 42;
      `,
      '/typeF.ts': `export type TypeF = boolean;`,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // Should merge into a single statement with explicit type markers on type-only exports
    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { type TypeA, type TypeB, ValueC } from "./barrel";
export type { TypeF } from "./typeF";`
    );
  });

  it('fixes nested barrel files with relative imports in subdirectories', () => {
    // This test reproduces a bug where export * from "./subdir" with subdir/index.ts
    // containing relative imports like "./foo" would incorrectly resolve "./foo"
    // relative to the root barrel file instead of relative to the subdir/index.ts
    mock({
      '/src/index.ts': `export * from "./complianceAndSecurity";`,
      '/src/complianceAndSecurity/index.ts': `
export { mergeLicenseFiles, licenseJsonToHTML } from "./licenseJsonToHTML";
export type { License } from "./licenseJsonToHTML";
      `,
      '/src/complianceAndSecurity/licenseJsonToHTML.ts': `
export function mergeLicenseFiles() { return []; }
export function licenseJsonToHTML() { return ""; }
export type License = { name: string };
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/src/index.ts');

    // The exports should be resolved correctly relative to complianceAndSecurity/index.ts
    // not relative to src/index.ts
    assert.strictEqual(
      fs.readFileSync('/src/index.ts', 'utf8'),
      `export { mergeLicenseFiles, licenseJsonToHTML, type License } from "./complianceAndSecurity/licenseJsonToHTML";`
    );
  });

  it('handles export * pointing to a CommonJS module using exports.name pattern', () => {
    mock({
      '/index.ts': `export * from "./cjsUtils";`,
      '/cjsUtils.js': `
function isProductionBuild() {
  return process.env.NODE_ENV === 'production';
}

function getBuildFlavor() {
  return isProductionBuild() ? 'release' : 'debug';
}

exports.isProductionBuild = isProductionBuild;
exports.getBuildFlavor = getBuildFlavor;
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { isProductionBuild, getBuildFlavor } from "./cjsUtils";`
    );
  });

  it('handles export * pointing to a CommonJS module using module.exports pattern', () => {
    mock({
      '/index.ts': `export * from "./mathUtils";`,
      '/mathUtils.js': `
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = {
  add,
  subtract,
  multiply: function(a, b) { return a * b; }
};
      `,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    assert.strictEqual(fs.readFileSync('/index.ts', 'utf8'), `export { add, subtract, multiply } from "./mathUtils";`);
  });

  it('fixes barrel file references through a file (not directory) by using the file directory for path resolution', () => {
    // This test reproduces a bug where re-exporting through a file (not a directory barrel)
    // would produce incorrect paths like "./DataTypeIconType/view/DataTypeIcons"
    // instead of "./view/DataTypeIcons"
    mock({
      '/index.ts': `export type { DataTypeIconType } from './DataTypeIconType';`,
      '/DataTypeIconType.ts': `export type { DataTypeIconType } from './view/DataTypeIcons';`,
      '/view/DataTypeIcons.tsx': `export type DataTypeIconType = 'icon1' | 'icon2';`,
      './node_modules': mock.load('node_modules'),
    });

    fixIssuesInBarrelFile('/index.ts');

    // The path should be resolved to ./view/DataTypeIcons, not ./DataTypeIconType/view/DataTypeIcons
    assert.strictEqual(
      fs.readFileSync('/index.ts', 'utf8'),
      `export { type DataTypeIconType } from "./view/DataTypeIcons";`
    );
  });
});
