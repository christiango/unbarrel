import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';
import fs from 'node:fs';
import path from 'node:path';

import {
  isInternalModule,
  convertToESMImportPath,
  convertAbsolutePathToRelativeImportPath,
  getAbsolutePathOfImport,
  normalizeToPosixPath,
} from './importUtils';

describe('importUtils tests', () => {
  afterEach(() => {
    mock.restore();
  });

  describe('isInternalModule', () => {
    it('returns true for relative paths', () => {
      assert.equal(isInternalModule('./foo'), true);
      assert.equal(isInternalModule('../bar'), true);
      assert.equal(isInternalModule('.'), true);
      assert.equal(isInternalModule('..'), true);
    });

    it('returns false for package / builtin names', () => {
      assert.equal(isInternalModule('react'), false);
      assert.equal(isInternalModule('@scope/pkg'), false);
      assert.equal(isInternalModule('fs'), false);
    });
  });

  describe('convertToESMImportPath', () => {
    it('returns relative path unchanged when it already starts with dot', () => {
      assert.equal(convertToESMImportPath('./foo/bar'), './foo/bar');
      assert.equal(convertToESMImportPath('../foo/bar'), '../foo/bar');
    });

    it('adds ./ prefix for bare paths', () => {
      assert.equal(convertToESMImportPath('foo'), './foo');
      assert.equal(convertToESMImportPath('foo/bar/baz'), './foo/bar/baz');
    });
  });

  describe('convertAbsolutePathToRelativeImportPath', () => {
    it('converts a file directly under the baseDir', () => {
      const base = '/project/src';
      const file = '/project/src/file.ts';
      assert.equal(convertAbsolutePathToRelativeImportPath(file, base), './file.ts');
    });

    it('converts a file in a nested folder under the baseDir', () => {
      const base = '/project/src';
      const file = '/project/src/utils/helpers.ts';
      assert.equal(convertAbsolutePathToRelativeImportPath(file, base), './utils/helpers.ts');
    });
  });

  describe('getAbsolutePathOfImport tests', () => {
    it('gets the correct absolute paths of imports', () => {
      mock({
        '/project': {
          src: {
            'index.ts': `
            export { export1 } from "./test1"
            export { export2 } from "../test2"
            export { export3 } from "./nested/test3"
            export { export4 } from "./nested"
            `,
            'test1.ts': 'export const export1 = 25;',
            nested: {
              'test3.js': 'export const export3 = 3;',
              'index.ts': 'export const export4 = 4;',
            },
          },
          'test2.ts': 'export export2= 2',
        },
        './node_modules': mock.load('node_modules'),
      });

      const indexPath = normalizeToPosixPath(path.resolve('/project/src/index.ts'));
      fs.readFileSync(indexPath, 'utf-8');
      assert.equal(
        getAbsolutePathOfImport(indexPath, './test1'),
        normalizeToPosixPath(path.resolve('/project/src/test1.ts'))
      );
      assert.equal(
        getAbsolutePathOfImport(indexPath, '../test2'),
        normalizeToPosixPath(path.resolve('/project/test2.ts'))
      );
      assert.equal(
        getAbsolutePathOfImport(indexPath, './nested/test3'),
        normalizeToPosixPath(path.resolve('/project/src/nested/test3.js'))
      );
      assert.equal(
        getAbsolutePathOfImport(indexPath, './nested'),
        normalizeToPosixPath(path.resolve('/project/src/nested/index.ts'))
      );
    });
  });
});
