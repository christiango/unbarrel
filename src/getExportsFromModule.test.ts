import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';
import { getExportsFromModule } from './getExportsFromModule';

describe('getExportsFromModule tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns no exports for an empty file', () => {
    mock({
      '/index.ts': 'export {} from "./test";',
      '/test.ts': '',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), { definitions: [], reExports: [] });
  });

  it('returns no exports for a file with an empty export', () => {
    mock({
      '/test': {
        'index.ts': 'export {} from "./test";',
        'test.ts': 'export {};',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test/index.ts'), { definitions: [], reExports: [] });
  });

  it('returns all the exports defined in a file', () => {
    mock({
      '/index.ts': 'export {} from "./test";',
      '/test.ts': `
      export const myValue = 42;
      
      export function myFunction() {}
      
      export class MyClass {}
      
      export type MyType = string;
      
      export interface MyInterface {
        prop: string;
      }

      export enum MyEnum {
        A = 'A',
        B = 'B',
      }
    `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'myValue',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'myFunction',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'MyClass',
        },
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'MyType',
        },
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'MyInterface',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'MyEnum',
        },
      ],
      reExports: [],
    });
  });

  it('returns all the default exports defined in a file', () => {
    mock({
      '/defaultFunction.ts': 'export default function fn() {};',
      '/defaultClass.ts': 'export default class MyClass {}',
      '/defaultValue.ts': 'export default 42;',
      '/defaultInterface.ts': 'export default interface MyInterface {}',

      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/defaultFunction.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: false,
        },
      ],
      reExports: [],
    });

    assert.deepEqual(getExportsFromModule('/defaultClass.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: false,
        },
      ],
      reExports: [],
    });

    assert.deepEqual(getExportsFromModule('/defaultValue.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: false,
        },
      ],
      reExports: [],
    });

    assert.deepEqual(getExportsFromModule('/defaultInterface.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: true,
        },
      ],
      reExports: [],
    });
  });

  it('handles re-exports', () => {
    mock({
      '/test.ts': `
      export * from './math/add';

      export { divide, divideByTwo, divideBy3 as divideByThree } from './math/divide';

      export { multiply as times } from './math/multiply';

      export { default as subtract } from './math/subtract';
      
      export { createRoot } from 'react-dom/client';

      export * from 'react';
    `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), {
      definitions: [],
      reExports: [
        {
          type: 'exportAll',
          importPath: './math/add',
        },
        {
          type: 'namedExport',
          importedName: 'divide',
          exportedName: 'divide',
          importPath: './math/divide',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'divideByTwo',
          exportedName: 'divideByTwo',
          importPath: './math/divide',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'divideBy3',
          exportedName: 'divideByThree',
          importPath: './math/divide',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'multiply',
          exportedName: 'times',
          importPath: './math/multiply',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'default',
          exportedName: 'subtract',
          importPath: './math/subtract',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'createRoot',
          exportedName: 'createRoot',
          importPath: 'react-dom/client',
          typeOnly: false,
        },
        { type: 'exportAll', importPath: 'react' },
      ],
    });
  });

  it('handles type only re=exports', () => {
    mock({
      '/test.ts': `
      export type { add, addThree } from './math/add';
      export { type divide, type divideBy2 as divideByTwo } from './math/divide';
    `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), {
      definitions: [],
      reExports: [
        {
          type: 'namedExport',
          importedName: 'add',
          exportedName: 'add',
          importPath: './math/add',
          typeOnly: true,
        },
        {
          type: 'namedExport',
          importedName: 'addThree',
          exportedName: 'addThree',
          importPath: './math/add',
          typeOnly: true,
        },
        {
          type: 'namedExport',
          importedName: 'divide',
          exportedName: 'divide',
          importPath: './math/divide',
          typeOnly: true,
        },
        {
          type: 'namedExport',
          importedName: 'divideBy2',
          exportedName: 'divideByTwo',
          importPath: './math/divide',
          typeOnly: true,
        },
      ],
    });
  });
  it('handles re-exports using import and export', () => {
    mock({
      '/test.ts': `
      import { createRoot, useEffect as renamedUseEffect } from 'react';
      import { subtract, subtract2 as subtractTwo } from './math/subtract'
      import { type divide, type divideBy2 as divideByTwo } from './math/divide';
      import type { add } from './math/add'
      import { default as multiply } from './math/multiply';
      import double from './math/double';

      export { createRoot, renamedUseEffect };
      export { subtract, subtractTwo as renamedSubtractTwo, divide, type divideByTwo, add, multiply, double };
    `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), {
      definitions: [],
      reExports: [
        {
          type: 'namedExport',
          importedName: 'createRoot',
          exportedName: 'createRoot',
          importPath: 'react',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'useEffect',
          exportedName: 'renamedUseEffect',
          importPath: 'react',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'subtract',
          exportedName: 'subtract',
          importPath: './math/subtract',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'subtract2',
          exportedName: 'renamedSubtractTwo',
          importPath: './math/subtract',
          typeOnly: false,
        },
        {
          type: 'namedExport',
          importedName: 'divide',
          exportedName: 'divide',
          importPath: './math/divide',
          typeOnly: true,
        },
        {
          type: 'namedExport',
          importedName: 'divideBy2',
          exportedName: 'divideByTwo',
          importPath: './math/divide',
          typeOnly: true,
        },
        {
          type: 'namedExport',
          importedName: 'add',
          exportedName: 'add',
          importPath: './math/add',
          typeOnly: true,
        },
        {
          type: 'defaultExport',
          exportedName: 'multiply',
          importPath: './math/multiply',
          typeOnly: false,
        },
        {
          type: 'defaultExport',
          exportedName: 'double',
          importPath: './math/double',
          typeOnly: false,
        },
      ],
    });
  });

  it('returns definitions from export statements referencing things defined in the current module ', () => {
    mock({
      '/index.ts': 'export {} from "./test";',
      '/test.ts': `
      const myValue = 42;
      
      function myFunction() {}
      
      class MyClass {}
      
      type MyType = string;
      
      interface MyInterface {
        prop: string;
      }

      enum MyEnum {
        A = 'A',
        B = 'B',
      }

      const fn = () => {}

      export { myValue, myFunction, MyClass, type MyType, MyInterface, MyEnum, fn as renamedFn };
    `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'myValue',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'myFunction',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'MyClass',
        },
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'MyType',
        },
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'MyInterface',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'MyEnum',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'renamedFn',
        },
      ],
      reExports: [],
    });
  });
});
