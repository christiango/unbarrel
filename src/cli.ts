#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { fixIssuesInBarrelFile } from './fixIssuesInBarrelFile';

const program = new Command();

program.name('unbarrel').description('Utilities for working with barrel files').version('0.0.0');

program
  .command('fix')
  .description('Convert all export * from ... statements in a barrel file to explicit exports')
  .argument('<barrelFile>', 'Path to the barrel file to process')
  .option('--flatten-export-star', 'Flatten export * statements into explicit named exports')
  .option('--fix-barrel-references', 'Resolve re-exports through barrel files to point to their true source')
  .action((barrelFile: string, options: { flattenExportStar?: boolean; fixBarrelReferences?: boolean }) => {
    try {
      const absolutePath = path.resolve(barrelFile);
      console.log(`Processing barrel file: ${absolutePath}`);

      const hasExplicitFixes = options.flattenExportStar || options.fixBarrelReferences;
      fixIssuesInBarrelFile(
        absolutePath,
        hasExplicitFixes
          ? {
              enabledFixes: {
                flattenExportStar: options.flattenExportStar,
                fixBarrelReferences: options.fixBarrelReferences,
              },
            }
          : {}
      );
      console.log('Successfully fixed barrel file');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
