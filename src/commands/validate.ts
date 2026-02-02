/**
 * SDB - Validate command
 * Validate all records against the schema
 */

import { ValidateOptions, SuccessResponse, ExitCode } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadSchema, loadRecords } from '../lib/fs.js';
import { validateAgainstSchema } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess, formatValidationResults } from '../lib/output.js';

interface ValidationIssue {
  id: string;
  errors: string[];
}

export async function validateCommand(
  folder: string,
  options: ValidateOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  const schema = loadSchema(paths) as object;
  const records = loadRecords(paths);

  const issues: ValidationIssue[] = [];
  let validCount = 0;

  for (const record of records) {
    // Extract user data (exclude reserved fields)
    const userData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!key.startsWith('_')) {
        userData[key] = value;
      }
    }

    const result = validateAgainstSchema(userData, schema);
    
    if (result.valid) {
      validCount++;
    } else {
      issues.push({
        id: record._id,
        errors: result.errors || ['Unknown validation error'],
      });
    }
  }

  const allValid = issues.length === 0;
  const response: SuccessResponse = {
    success: true,
    action: 'validated',
    data: {
      total: records.length,
      valid: validCount,
      invalid: issues.length,
      issues: allValid ? undefined : issues,
    },
    metadata: {
      databasePath: paths.folder,
      schemaPath: paths.schemaFile,
    },
  };

  if (options.human) {
    outputHumanSuccess(formatValidationResults(records.length, validCount, issues));
  } else {
    outputSuccess(response);
  }

  // Exit with error code if there are validation issues
  if (!allValid) {
    process.exit(ExitCode.GENERAL_ERROR);
  }
}
