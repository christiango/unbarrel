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
  });
});
