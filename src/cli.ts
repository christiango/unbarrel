#!/usr/bin/env node

import { Command } from 'commander';
import { unbarrel } from './unbarrel';
import * as path from 'path';

const program = new Command();

program.name('barrel-file-utils').description('Utilities for working with barrel files').version('1.0.0');

program
  .command('unbarrel')
  .description('Convert the first export * statement to export {} in a barrel file')
  .argument('<rootBarrelFile>', 'Path to the root barrel file to process')
  .action(async (rootBarrelFile: string) => {
    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(rootBarrelFile);

      console.log(`Processing barrel file: ${absolutePath}`);

      await unbarrel(absolutePath);

      console.log('✅ Successfully ran unbarrel on the specified file');
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
