import * as babel from '@babel/core';
import * as fs from 'node:fs';

/** Parses a typescript file into an AST using babel */
export function parseTypescriptFile(absoluteFilePath: string): babel.ParseResult {
  const fileContents = fs.readFileSync(absoluteFilePath, 'utf-8');
  const ast = babel.parse(fileContents, {
    sourceType: 'module',
    presets: [['@babel/preset-typescript', { isTSX: absoluteFilePath.endsWith('.tsx'), allExtensions: true }]],
  });
  if (!ast) {
    throw new Error(`Failed to parse file: ${absoluteFilePath}`);
  }

  return ast;
}
