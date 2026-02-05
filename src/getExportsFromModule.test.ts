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
      '/defaultDefinedElsewhere.ts': `
      const myValue = 42;
      export default myValue;
      `,
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

    assert.deepEqual(getExportsFromModule('/defaultDefinedElsewhere.ts'), {
      definitions: [
        {
          type: 'defaultExport',
          typeOnly: false,
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

  it('handles type only re-exports', () => {
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

  it('returns definitions from export statements referencing things defined in the current module', () => {
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

  it('handles re-exports from barrel files', () => {
    mock({
      '/test.ts': `export { reExport1 } from './nested'`,
      '/nested': {
        'index.ts': `export const reExport1 = 1;`,
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), {
      definitions: [],
      reExports: [
        {
          type: 'namedExport',
          importedName: 'reExport1',
          exportedName: 'reExport1',
          importPath: './nested',
          typeOnly: false,
        },
      ],
    });
  });

  it('throws an error when it cannot find a reference to an export', () => {
    mock({
      '/test.ts': `
      
      function myFunction() {}

      export { myValue, myFunction };
    `,
      './node_modules': mock.load('node_modules'),
    });

    assert.throws(() => getExportsFromModule('/does-not-exist'), `Could not find source for exports: myFunction`);
  });

  it('is able to handle complex exports', () => {
    mock({
      '/test.ts': `
      
      function createComplexObject() {
        return {
          foo: 42,
          bar: 13,
          baz: { deep: 'value' },
          qux: 'default',
          alias: 'renamed',
          nestedArray: ['first', 'skip', 'third', 'rest1', 'rest2'],
          nestedObject: {
            nested: {
              value: 'nestedValue',
            },
          },
        };
      }

      function createArray() {
        return ['alpha', 'beta', 'gamma', 'delta'];
      }

      const {
        foo,
        baz: { deep },
        qux = 'fallback',
        alias: aliasValue,
        nestedArray: [firstNested, ...restNested],
        ...restObj
      } = createComplexObject();

      const [firstItem, , thirdItem, ...restItems] = createArray();

      const {
        nestedObject: {
          nested: { value: nestedValue },
        },
      } = createComplexObject();

      export { foo, deep, qux, aliasValue, restObj, firstNested, restNested, firstItem, thirdItem, restItems, nestedValue };
    `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'foo',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'deep',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'qux',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'aliasValue',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'firstNested',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'restNested',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'restObj',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'firstItem',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'thirdItem',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'restItems',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'nestedValue',
        },
      ],
      reExports: [],
    });
  });

  it('correctly classifies default re-exports', () => {
    mock({
      '/test': {
        'index.ts': `
        import  { default as import1 } from "./test";
        export default import1;
        `,
        'index2.ts': `export { default } from "./test";`,
        'test.ts': 'export default test;',
      },
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/test/index.ts'), {
      definitions: [],
      reExports: [
        {
          type: 'defaultExport',
          exportedName: 'default',
          importPath: './test',
          typeOnly: false,
        },
      ],
    });

    assert.deepEqual(getExportsFromModule('/test/index2.ts'), {
      definitions: [],
      reExports: [
        {
          type: 'defaultExport',
          exportedName: 'default',
          importPath: './test',
          typeOnly: false,
        },
      ],
    });
  });

  it('handles CommonJS exports using exports.name = value', () => {
    mock({
      '/buildUtils.js': `
function isProductionBuild() {
  return process.env.NODE_ENV === 'production';
}

function getBuildFlavorParam() {
  return isProductionBuild() ? 'release' : 'debug';
}

function getRepoRoot() {
  return process.cwd();
}

exports.isProductionBuild = isProductionBuild;
exports.getBuildFlavorParam = getBuildFlavorParam;
exports.getRepoRoot = getRepoRoot;
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/buildUtils.js'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'isProductionBuild',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'getBuildFlavorParam',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'getRepoRoot',
        },
      ],
      reExports: [],
    });
  });

  it('handles CommonJS module.exports = { ... } pattern', () => {
    mock({
      '/utils.js': `
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

    assert.deepEqual(getExportsFromModule('/utils.js'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'add',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'subtract',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'multiply',
        },
      ],
      reExports: [],
    });
  });

  it('handles CommonJS module.exports with shorthand method syntax', () => {
    mock({
      '/mathUtils.js': `
module.exports = {
  add(a, b) {
    return a + b;
  },
  subtract(a, b) {
    return a - b;
  }
};
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/mathUtils.js'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'add',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'subtract',
        },
      ],
      reExports: [],
    });
  });

  it('ignores exports nested inside namespace declarations in d.ts files', () => {
    mock({
      '/types.d.ts': `
declare namespace MyNamespace {
  export interface Config {
    value: string;
  }
  export function helper(): void;
  export const VERSION: string;
}

export { MyNamespace };
      `,
      './node_modules': mock.load('node_modules'),
    });

    // The exports inside the namespace (Config, helper, VERSION) should NOT be included
    // Only the top-level export of MyNamespace itself should be included
    assert.deepEqual(getExportsFromModule('/types.d.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'MyNamespace',
        },
      ],
      reExports: [],
    });
  });

  it('handles exported namespace declarations as type-only', () => {
    mock({
      '/types.d.ts': `
export declare namespace Utils {
  interface Options {
    debug: boolean;
  }
  function format(value: string): string;
}
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/types.d.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'Utils',
        },
      ],
      reExports: [],
    });
  });

  it('handles declare module with string literal name', () => {
    mock({
      '/ambient.d.ts': `
declare module "my-module" {
  export interface Config {
    value: string;
  }
  export function init(): void;
}

export declare namespace LocalNamespace {
  const value: number;
}
      `,
      './node_modules': mock.load('node_modules'),
    });

    // The declare module "my-module" is an ambient module declaration, not a top-level export
    // Only the exported LocalNamespace should be included
    assert.deepEqual(getExportsFromModule('/ambient.d.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'LocalNamespace',
        },
      ],
      reExports: [],
    });
  });

  it('handles d.ts file with mixed top-level and nested exports', () => {
    mock({
      '/mixed.d.ts': `
export interface TopLevelInterface {
  prop: string;
}

export type TopLevelType = string | number;

export declare namespace NestedStuff {
  export interface NestedInterface {
    nested: boolean;
  }
  export type NestedType = string;
  export function nestedFn(): void;
}

export declare function topLevelFunction(): void;
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/mixed.d.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'TopLevelInterface',
        },
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'TopLevelType',
        },
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'NestedStuff',
        },
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'topLevelFunction',
        },
      ],
      reExports: [],
    });
  });

  it('ignores default exports nested inside namespaces', () => {
    mock({
      '/namespace-default.d.ts': `
declare namespace MyLib {
  export default function main(): void;
}

export { MyLib };
      `,
      './node_modules': mock.load('node_modules'),
    });

    // The default export inside the namespace should NOT be included
    assert.deepEqual(getExportsFromModule('/namespace-default.d.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'MyLib',
        },
      ],
      reExports: [],
    });
  });

  it('ignores export * nested inside namespaces', () => {
    mock({
      '/namespace-reexport.d.ts': `
declare namespace MyLib {
  export * from './internal';
}

export { MyLib };
      `,
      './node_modules': mock.load('node_modules'),
    });

    // The export * inside the namespace should NOT be included
    assert.deepEqual(getExportsFromModule('/namespace-reexport.d.ts'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: true,
          name: 'MyLib',
        },
      ],
      reExports: [],
    });
  });

  it('handles export default of a named export', () => {
    // Pattern: export const MyComponent = ...; export default MyComponent;
    mock({
      '/Component.tsx': `
export const AudioPlaybackControl = (props: any) => {
  return null;
};

export default AudioPlaybackControl;
      `,
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(getExportsFromModule('/Component.tsx'), {
      definitions: [
        {
          type: 'namedExport',
          typeOnly: false,
          name: 'AudioPlaybackControl',
        },
        {
          type: 'defaultExport',
          typeOnly: false,
        },
      ],
      reExports: [],
    });
  });

  describe('Asset import handling', () => {
    it('returns empty exports for SVG asset files', () => {
      mock({
        '/icon.svg': '<svg></svg>',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getExportsFromModule('/icon.svg'), { definitions: [], reExports: [] });
    });

    it('returns empty exports for CSS asset files', () => {
      mock({
        '/styles.css': 'body { color: red; }',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getExportsFromModule('/styles.css'), { definitions: [], reExports: [] });
    });

    it('returns empty exports for JSON asset files', () => {
      mock({
        '/data.json': '{"key": "value"}',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getExportsFromModule('/data.json'), { definitions: [], reExports: [] });
    });

    it('returns empty exports for PNG image files', () => {
      mock({
        '/image.png': 'PNG_BINARY_DATA',
        './node_modules': mock.load('node_modules'),
      });

      assert.deepEqual(getExportsFromModule('/image.png'), { definitions: [], reExports: [] });
    });

    it('handles modules that re-export asset files', () => {
      mock({
        '/utils.ts': 'export { clipchampIcon } from "./clipchamp.svg";',
        '/clipchamp.svg': '<svg></svg>',
        './node_modules': mock.load('node_modules'),
      });

      const exports = getExportsFromModule('/utils.ts');
      assert.deepEqual(exports, {
        definitions: [],
        reExports: [
          {
            type: 'namedExport',
            importedName: 'clipchampIcon',
            exportedName: 'clipchampIcon',
            importPath: './clipchamp.svg',
            typeOnly: false,
          },
        ],
      });
    });

    it('handles default exports of asset files', () => {
      mock({
        '/utils.ts': 'export { default as icon } from "./icon.svg";',
        '/icon.svg': '<svg></svg>',
        './node_modules': mock.load('node_modules'),
      });

      const exports = getExportsFromModule('/utils.ts');
      assert.deepEqual(exports, {
        definitions: [],
        reExports: [
          {
            type: 'namedExport',
            importedName: 'default',
            exportedName: 'icon',
            importPath: './icon.svg',
            typeOnly: false,
          },
        ],
      });
    });

    it('handles barrel files with direct asset imports', () => {
      mock({
        '/barrel.ts': `
          export { clipchampIcon } from "./assets/clipchamp.svg";
          export { styles } from "./styles/main.css";
          export { config } from "./config.json";
        `,
        '/assets/clipchamp.svg': '<svg></svg>',
        '/styles/main.css': 'body { color: red; }',
        '/config.json': '{"name": "app"}',
        './node_modules': mock.load('node_modules'),
      });

      const exports = getExportsFromModule('/barrel.ts');
      assert.deepEqual(exports, {
        definitions: [],
        reExports: [
          {
            type: 'namedExport',
            importedName: 'clipchampIcon',
            exportedName: 'clipchampIcon',
            importPath: './assets/clipchamp.svg',
            typeOnly: false,
          },
          {
            type: 'namedExport',
            importedName: 'styles',
            exportedName: 'styles',
            importPath: './styles/main.css',
            typeOnly: false,
          },
          {
            type: 'namedExport',
            importedName: 'config',
            exportedName: 'config',
            importPath: './config.json',
            typeOnly: false,
          },
        ],
      });
    });

    it('handles asset file re-exported through multiple layers', () => {
      mock({
        '/index.ts': 'export { icon } from "./layer1";\n',
        '/layer1.ts': 'export { icon } from "./layer2";\n',
        '/layer2.ts': 'export { clipchampIcon as icon } from "./icon.svg";\n',
        '/icon.svg': '<svg></svg>',
        './node_modules': mock.load('node_modules'),
      });

      const exports = getExportsFromModule('/index.ts');
      assert.deepEqual(exports, {
        definitions: [],
        reExports: [
          {
            type: 'namedExport',
            importedName: 'icon',
            exportedName: 'icon',
            importPath: './layer1',
            typeOnly: false,
          },
        ],
      });
    });

    it('handles mix of code and asset exports in a single module', () => {
      mock({
        '/utils.ts': `
          export const helper = () => {};
          export { icon } from "./icon.svg";
          export function process() {}
        `,
        '/icon.svg': '<svg></svg>',
        './node_modules': mock.load('node_modules'),
      });

      const exports = getExportsFromModule('/utils.ts');
      assert.strictEqual(exports.definitions.length, 2); // helper and process
      assert.strictEqual(exports.reExports.length, 1); // icon from SVG
    });

    it('handles asset files in nested directories', () => {
      mock({
        '/barrel.ts': 'export { icon } from "./assets/icons/brand/logo.svg";\n',
        '/assets/icons/brand/logo.svg': '<svg></svg>',
        './node_modules': mock.load('node_modules'),
      });

      const exports = getExportsFromModule('/barrel.ts');
      assert.strictEqual(exports.reExports[0].importPath, './assets/icons/brand/logo.svg');
    });

    it('handles asset file with complex export patterns', () => {
      mock({
        '/barrel.ts': `
          export { default as icon } from "./icon.svg";
          export { clipchampIcon } from "./clipchamp.svg";
          export * from "./code";
        `,
        '/icon.svg': '<svg></svg>',
        '/clipchamp.svg': '<svg></svg>',
        '/code.ts': 'export const helper = () => {};',
        './node_modules': mock.load('node_modules'),
      });

      const exports = getExportsFromModule('/barrel.ts');
      // Should have 2 asset re-exports and 1 export *
      assert(exports.reExports.some((e) => e.type === 'namedExport' && e.exportedName === 'icon'));
      assert(exports.reExports.some((e) => e.type === 'namedExport' && e.exportedName === 'clipchampIcon'));
      assert(exports.reExports.some((e) => e.type === 'exportAll'));
    });
  });
});
