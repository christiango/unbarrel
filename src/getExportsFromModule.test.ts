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

    assert.deepEqual(getExportsFromModule('/', './test.ts'), { definitions: [], reExports: [] });
  });

  it('returns no exports for a file with an empty export', () => {
    mock({
      '/test': {
        'index.ts': 'export {} from "./test";',
        'test.ts': 'export {};',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test', './index.ts'), { definitions: [], reExports: [] });
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

    assert.deepEqual(getExportsFromModule('/', './test.ts'), {
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

    assert.deepEqual(getExportsFromModule('/', './defaultFunction.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: false,
        },
      ],
      reExports: [],
    });

    assert.deepEqual(getExportsFromModule('/', './defaultClass.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: false,
        },
      ],
      reExports: [],
    });

    assert.deepEqual(getExportsFromModule('/', './defaultValue.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: false,
        },
      ],
      reExports: [],
    });

    assert.deepEqual(getExportsFromModule('/', './defaultInterface.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: true,
        },
      ],
      reExports: [],
    });
  });
});
