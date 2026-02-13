import { describe, it, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CLI_PATH = path.resolve(__dirname, '../lib/cli.js');

describe('CLI integration tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbarrel-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('unbarrel fix transforms a barrel file with export * to explicit exports', () => {
    // Create a module that exports something
    const fooPath = path.join(tempDir, 'foo.ts');
    fs.writeFileSync(fooPath, 'export const hello = 1;\nexport const world = 2;');

    // Create a barrel file with export *
    const barrelPath = path.join(tempDir, 'index.ts');
    fs.writeFileSync(barrelPath, "export * from './foo';");

    // Run the CLI
    execSync(`node "${CLI_PATH}" fix "${barrelPath}"`, { encoding: 'utf-8' });

    // Verify the barrel file was transformed
    const result = fs.readFileSync(barrelPath, 'utf-8');
    assert.ok(result.includes('hello'), 'Should include hello export');
    assert.ok(result.includes('world'), 'Should include world export');
    assert.ok(!result.includes('export *'), 'Should not have export * anymore');
  });

  it('unbarrel fix exits with error for non-existent file', () => {
    const nonExistentPath = path.join(tempDir, 'does-not-exist.ts');

    assert.throws(
      () => {
        execSync(`node "${CLI_PATH}" fix "${nonExistentPath}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      },
      (error: unknown) => {
        return error instanceof Error && 'status' in error && (error as { status: number }).status !== 0;
      }
    );
  });

  it('unbarrel --help shows help text', () => {
    const output = execSync(`node "${CLI_PATH}" --help`, { encoding: 'utf-8' });

    assert.ok(output.includes('unbarrel'), 'Should show program name');
    assert.ok(output.includes('fix'), 'Should show fix command');
  });

  it('unbarrel fix --help shows fix command help', () => {
    const output = execSync(`node "${CLI_PATH}" fix --help`, { encoding: 'utf-8' });

    assert.ok(output.includes('fix'), 'Should show fix command');
    assert.ok(output.includes('barrelFile'), 'Should show barrelFile argument');
    assert.ok(output.includes('--flatten-export-star'), 'Should show --flatten-export-star option');
    assert.ok(output.includes('--fix-barrel-references'), 'Should show --fix-barrel-references option');
  });

  it('unbarrel fix --flatten-export-star only flattens export * without resolving barrel re-exports', () => {
    // Create a module that exports something
    const fooPath = path.join(tempDir, 'foo.ts');
    fs.writeFileSync(fooPath, 'export const hello = 1;\nexport const world = 2;');

    // Create a sub-barrel directory
    const subDir = path.join(tempDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'index.ts'), 'export { deep } from "./deep";');
    fs.writeFileSync(path.join(subDir, 'deep.ts'), 'export const deep = 42;');

    // Create a barrel file with export * and a barrel re-export
    const barrelPath = path.join(tempDir, 'index.ts');
    fs.writeFileSync(barrelPath, `export * from './foo';\nexport { deep } from './sub';`);

    // Run the CLI with --flatten-export-star
    execSync(`node "${CLI_PATH}" fix --flatten-export-star "${barrelPath}"`, { encoding: 'utf-8' });

    // Verify the barrel file was transformed
    const result = fs.readFileSync(barrelPath, 'utf-8');
    assert.strictEqual(
      result,
      `export { hello, world } from "./foo";\nexport { deep } from './sub';`
    );
  });

  it('unbarrel fix --fix-barrel-references only resolves barrel re-exports without flattening export *', () => {
    // Create a module that exports something
    const fooPath = path.join(tempDir, 'foo.ts');
    fs.writeFileSync(fooPath, 'export const hello = 1;\nexport const world = 2;');

    // Create a sub-barrel directory
    const subDir = path.join(tempDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'index.ts'), 'export { deep } from "./deep";');
    fs.writeFileSync(path.join(subDir, 'deep.ts'), 'export const deep = 42;');

    // Create a barrel file with export * and a barrel re-export
    const barrelPath = path.join(tempDir, 'index.ts');
    fs.writeFileSync(barrelPath, `export * from './foo';\nexport { deep } from './sub';`);

    // Run the CLI with --fix-barrel-references
    execSync(`node "${CLI_PATH}" fix --fix-barrel-references "${barrelPath}"`, { encoding: 'utf-8' });

    // Verify: export * should remain, but barrel re-export should be resolved
    const result = fs.readFileSync(barrelPath, 'utf-8');
    assert.strictEqual(
      result,
      `export * from './foo';\nexport { deep } from "./sub/deep";`
    );
  });
});
