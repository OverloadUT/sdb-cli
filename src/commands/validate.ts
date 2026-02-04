/**
 * SDB - Validate command
 * Validate all records against the schema
 */

import { ValidateOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadSchema, loadRecords } from '../lib/fs.js';
import { compileSchemaValidator, validateWithValidator } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess, formatValidationResults } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

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
  const validate = compileSchemaValidator(schema);
  const records = loadRecords(paths).filter(r => !r._deleted);

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

    const result = validateWithValidator(userData, validate);
    
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
  if (!allValid) {
    outputError(
      errors.schemaValidationFailed(issues, {
        total: records.length,
        valid: validCount,
        invalid: issues.length,
        databasePath: paths.folder,
        schemaPath: paths.schemaFile,
      })
    );
  }

  const response: SuccessResponse = {
    success: true,
    action: 'validated',
    data: {
      total: records.length,
      valid: validCount,
      invalid: 0,
      issues: undefined,
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
}
