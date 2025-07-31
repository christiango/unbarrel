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
          typeOnly: false,
          name: 'myValue',
        },
        {
          typeOnly: false,
          name: 'myFunction',
        },
        {
          typeOnly: false,
          name: 'MyClass',
        },
        {
          typeOnly: true,
          name: 'MyType',
        },
        {
          typeOnly: true,
          name: 'MyInterface',
        },
        {
          typeOnly: false,
          name: 'MyEnum',
        },
      ],
      reExports: [],
    });
  });
});
