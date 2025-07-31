import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mock from 'mock-fs';
import { getExportsFromModule } from './getExportsFromModule';

describe('getExportsFromModule tests', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns no exports for an empty file', async () => {
    mock({
      './index.ts': 'export {} from "./test";',
      './test.ts': '',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(await getExportsFromModule('./index.ts', '.'), { definitions: [], reExports: [] });
  });

  it('returns no exports for a file with an empty export', async () => {
    mock({
      './index.ts': 'export {} from "./test";',
      './test.ts': 'export {} from "./test";',
      './node_modules': mock.load('node_modules'),
    });

    assert.deepEqual(await getExportsFromModule('./index.ts', '.'), { definitions: [], reExports: [] });
  });
});
