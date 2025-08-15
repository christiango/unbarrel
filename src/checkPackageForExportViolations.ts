import fs from 'node:fs';
import path from 'node:path';

/**
 * Defines a violation of the best practice of not using export * statements
 */
export interface ExportAllViolation {
  type: 'exportAll';
  /** The path to the module that is being re-exported using export * syntax */
  importPath: string;
}

/**
 * Defines a violation of the best practice of not referencing barrel files from the package entry points
 */
export interface BarrelFileReferenceViolation {
  type: 'barrelFileReference';
  /** The path to the barrel file that is being referenced */
  barrelFilePath: string;
}

export type BarrelViolations = ExportAllViolation | BarrelFileReferenceViolation;

export interface CheckPackageForExportViolationsOptions {
  /** The path to the directory with the package.json file for the package to check */
  packagePath: string;
}

/**
 * Utility that can be used to check if a package has any violations of barrel file best practices
 * @param packagePath - The path to the directory with the package.json file for the package to check
 */
export function checkPackageForExportViolations(packagePath: string): BarrelViolations[] {
  const violations: BarrelViolations[] = [];

  const packageJson = fs.readFileSync(path.join(packagePath, 'package.json'), 'utf-8');

  if (!packageJson) {
    throw new Error(`No package.json found at ${packagePath}`);
  }

  const parsedPackageJson = JSON.parse(packageJson);

  return violations;
}
