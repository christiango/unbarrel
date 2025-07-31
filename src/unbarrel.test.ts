import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mock from 'mock-fs';
import { unbarrel } from './unbarrel';

describe('File System Operations', () => {
  afterEach(() => {
    mock.restore();
  });

  it('should leave export * from external libraries alone', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from 'react';
        export * from './ux';
        `,
        ux: {
          'index.ts': `
          export * from './client';
          export * from './server';
          `,
          'client.ts': `
          export { createRoot } from 'react-dom/client';
          `,
          'server.ts': `
          import { renderToPipeableStream } from 'react-dom/server';
          export { renderToPipeableStream };
          `,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      `export * from 'react';
export { createRoot } from 'react-dom/client';
export { renderToPipeableStream } from 'react-dom/server';`
    );
  });

  it('should handle specific re-exports from external libraries correctly', async () => {
    mock({
      '/test': {
        'index.ts': `
        export { useEffect } from './ux';
        `,
        ux: {
          'index.ts': `
          export { useState, useEffect } from 'react';
          `,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(fs.readFileSync('/test/index.ts', 'utf8'), `export { useEffect } from 'react';`);
  });

  it('Should inline declarations from another module', async () => {
    mock({
      '/test': {
        'index.ts': "export * from './add';",
        'add.ts': `
        export function add(a: number, b: number): number {
          return a + b;
        }
        export const addConst = 42;`,
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(fs.readFileSync('/test/index.ts', 'utf8'), "export { add, addConst } from './add';");
  });

  it('Should handle typescript constructs', async () => {
    mock({
      '/test': {
        'index.ts': "export * from './add';",
        'add.ts': `
        export function add(a: number, b: number): number {
          return a + b;
        }
        export interface AddInterface {
          (a: number, b: number): number;
        }
        export type AddType = (a: number, b: number) => number;
        
        export enum AddEnum {
         One = 'one',
         Two = 'two',
         Three = 'three',
        }`,
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      "export { add, type AddInterface, type AddType, AddEnum } from './add';"
    );
  });

  it('Should handle multiple levels of export *', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from './math';
        `,
        math: {
          'index.ts': `
          export * from './add';
          `,
          'add.ts': `
          export function add(a: number, b: number): number {
            return a + b;
          }
            
          export interface AddInterface {
            (a: number, b: number): number;
          }`,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      "export { add, type AddInterface } from './math/add';"
    );
  });

  it('Should handle layers of barrel files with specifiers', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from './math';
        `,
        math: {
          'index.ts': `
          export { add, type AddInterface  } from './add';
          `,
          'add.ts': `
          export function add(a: number, b: number): number {
            return a + b;
          }
            
          export interface AddInterface {
            (a: number, b: number): number;
          }`,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      "export { add, type AddInterface } from './math/add';"
    );
  });

  it('Should only capture the specifiers that are re-exported', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from './math';
        `,
        math: {
          'index.ts': `
          export { add, type AddInterface  } from './add';
          `,
          'add.ts': `
          export function add(a: number, b: number): number {
            return a + b;
          }
            
          export interface AddInterface {
            (a: number, b: number): number;
          }
            
          export function add2(input: number): number {
            return input + 2;
          }
          export interface Add2Interface {
            (input: number): number;
          }`,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      "export { add, type AddInterface } from './math/add';"
    );
  });

  it('Should handle barrel files renaming exports', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from './math';
        export { addType } from './mathTypes';
        `,
        math: {
          'index.ts': `
          export { add as renamedAdd  } from './add';
          export { fakeDivide as realDivide } from './divide';
          `,
          'add.ts': `
          export function add(a: number, b: number): number {
            return a + b;
          }
          `,
          divide: {
            'index.ts': `
            export { phonyDivide as fakeDivide } from './divide';`,
            divide: {
              'index.ts': `
              export { divide as phonyDivide } from './divide';`,
              'divide.ts': `
              export function divide(a: number, b: number): number {
                return a / b;
              }
              `,
            },
          },
        },
        mathTypes: {
          'index.ts': `
          export { addTypeBeforeRename as addType } from './addTypes';
          `,
          'addTypes.ts': `
          export type addTypeBeforeRename = (a: number, b: number) => number;
          `,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      `export { add as renamedAdd } from './math/add';
export { divide as realDivide } from './math/divide/divide/divide';
export { addTypeBeforeRename as addType } from './mathTypes/addTypes';`
    );
  });

  it('Should handle default exports', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from './math';
        `,
        math: {
          'index.ts': `
          export { default as add, addConst }from './add';
          export { fakeDivide as realDivide } from './divide';
          `,
          'add.ts': `
          export default function add(a: number, b: number): number {
            return a + b;
          }

          export const addConst = 42;
          `,
          divide: {
            'index.ts': `
            export { phonyDivide as fakeDivide } from './divide';`,
            divide: {
              'index.ts': `
              export { default as phonyDivide } from './divide';`,
              'divide.ts': `
              export default class {
                constructor(private a: number, private b: number) {}
                public divide(): number {
                  return this.a / this.b;
                }
              }
              `,
            },
          },
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      `export { default as add, addConst } from './math/add';
export { default as realDivide } from './math/divide/divide/divide';`
    );
  });

  it('Should handle handle exports with no source', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from './math';
        `,
        math: {
          'index.ts': `
          export * from './add';
          export * from './divide';
          `,
          'add.ts': `
          function add(a: number, b: number): number {
            return a + b;
          }

          export const addConst = 42;

          export { add as renamedAdd };

          `,
          divide: {
            'index.ts': `
            export * from './divide';
            `,
            divide: {
              'index.ts': `
              import { divide as phonyDivide, divideConst1, divideConst2 as secondDivideConst, thirdDivideConst, default as defaultDivideConst} from './divide';

              export { phonyDivide as realDivide, divideConst1 as firstDivideConst, secondDivideConst, thirdDivideConst, defaultDivideConst };`,
              'divide.ts': `
              export function divide(a: number, b: number): number {
                return a / b;
              }

              const divideConst1 = 100;
              const divideConst2 = 200;
              const divideConst3 = 300;
              
              const defaultConst = 8;

              export default defaultConst;

              export { divideConst1, divideConst2, divideConst3 as thirdDivideConst };
              `,
            },
          },
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      `export { addConst, renamedAdd } from './math/add';
export { divide as realDivide, divideConst1 as firstDivideConst, divideConst2 as secondDivideConst, thirdDivideConst, default as defaultDivideConst } from './math/divide/divide/divide';`
    );
  });

  it('Should handle typescript function declarations', async () => {
    mock({
      '/test': {
        'index.ts': `
        export * from './math';
        `,
        'math.ts': `
          export function increment(a:number): number;
          export function increment(a: number, b?: number | undefined): number {
            return a + (b ?? 0);
          }
        `,
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(fs.readFileSync('/test/index.ts', 'utf8'), `export { increment } from './math';`);
  });

  it('Handles the case where an export is renamed', async () => {
    mock({
      '/test': {
        'index.ts': `
        export { renamedAdd } from './math';
        `,
        math: {
          'index.ts': `
          export { renamedAdd } from './add'
          `,
          'add.ts': `
          const add = (number: a, b: number) => {
            return a + b;
          }

          export { add as renamedAdd }
          `,
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(fs.readFileSync('/test/index.ts', 'utf8'), `export { renamedAdd } from './math/add';`);
  });

  it('Handles exports that can be reached from multiple paths', async () => {
    mock({
      '/test': {
        'index.ts': `
        export { add } from './add';
        export * from './math';
        `,

        'add.ts': `
        export function add(a: number, b: number): number {
          return a + b;
        }
        `,
        'math.ts': `
        export { add } from './add';

        export function subtract(a: number, b: number): number {
          return a - b;
        }
        `,
      },

      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      `export { add } from './add';
export { subtract } from './math';`
    );
  });

  it('Handles a file with empty exports', async () => {
    mock({
      '/test': {
        'index.ts': `
        export {};
        `,
      },

      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(fs.readFileSync('/test/index.ts', 'utf8'), `export {};`);
  });

  it('Handles ../ paths in re-exports', async () => {
    mock({
      '/test': {
        'index.ts': `
         export { add } from './math';
        `,
        math: {
          'index.ts': `
          export { add } from './add';
          `,
          'add.ts': `
          import { getConst, add } from '../addFolder';
          export { add };
          `,
        },
        addFolder: {
          'index.ts': `
          export * from './addSubfolder';`,

          addSubfolder: {
            'index.ts': `
            export { add } from './addDefinition';
            `,
            'addDefinition.ts': `
            export function add(a: number, b: number): number {
              return a + b;
            }

            export function getConst(): number {
              return 42;
            }
            `,
          },
        },
      },
      './node_modules': mock.load('node_modules'),
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      `export { add } from './addFolder/addSubfolder/addDefinition';`
    );
  });

  it('Merging of type and value exports correctly', async () => {
    mock({
      '/test': {
        'index.ts': `
         export * from './math';
         export * from './ux';
         export type { renderToString } from 'react-dom/server';
        `,
        ux: {
          'index.ts': `
          export type { useState } from 'react'
          export { useEffect } from 'react';
          export { type createRoot, hydrateRoot } from 'react-dom/client';
          `,
        },
        math: {
          'index.ts': `
          export { add } from './add';
          export type { AddFunction } from './add';
          export { subtract, type SubtractFunction } from './subtract';
          `,
          'add.ts': `
          export function add(a: number, b: number): number {
            return a + b;
          }

          export type AddFunction = (a: number, b: number) => number;
          `,
          'subtract.ts': `
          export function subtract(a: number, b: number): number {
            return a - b;
          }
          export type SubtractFunction = (a: number, b: number) => number;
          `,
        },
      },
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(
      fs.readFileSync('/test/index.ts', 'utf8'),
      `export { add, type AddFunction } from './math/add';
export { subtract, type SubtractFunction } from './math/subtract';
export { type useState, useEffect } from 'react';
export { type createRoot, hydrateRoot } from 'react-dom/client';
export { type renderToString } from 'react-dom/server';`
    );
  });

  it('Handles the case where something is exported both as a type and a value', async () => {
    mock({
      '/test': {
        'index.ts': `
         export * from './math';
        `,
        math: {
          'index.ts': `
          export * from './add';
          `,
          'add.ts': `

          export type Add = (a: number, b: number) => number;
          export function Add(a: number, b: number): number {
            return a + b;
          }
          `,
        },
      },
    });

    await unbarrel('/test/index.ts');

    assert.strictEqual(fs.readFileSync('/test/index.ts', 'utf8'), `export { Add } from './math/add';`);
  });
});
