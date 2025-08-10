import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';

import { isInternalModule, convertToESMImportPath, convertAbsolutePathToRelativeImportPath } from './importUtils';

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
});
