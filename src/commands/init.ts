/**
 * SDB - Init command
 * Initialize a new database folder with a schema
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { InitOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, initializeDatabase, isDatabaseInitialized } from '../lib/fs.js';
import { validateSchemaFile, validateFolderPath } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function initCommand(
  folder: string,
  options: InitOptions
): Promise<void> {
  // Validate folder path
  validateFolderPath(folder);

  const paths = getDatabasePaths(folder);

  // Check if already initialized
  if (isDatabaseInitialized(paths) && !options.force) {
    outputError(errors.resourceExists('Database', folder, paths.schemaFile));
  }

  // Load and validate schema file
  const schemaPath = resolve(options.schema);
  if (!existsSync(schemaPath)) {
    outputError(errors.resourceNotFound('Schema file', options.schema, schemaPath));
  }

  let schema: unknown;
  try {
    const content = readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(content);
  } catch (err) {
    outputError(errors.invalidInput(`Failed to parse schema file: ${(err as Error).message}`, {
      path: schemaPath,
    }));
  }

  // Validate schema structure
  validateSchemaFile(schema);

  if (options.dryRun) {
    const response: SuccessResponse = {
      success: true,
      dryRun: true,
      action: 'would-initialize',
      resource: {
        type: 'database',
        path: paths.folder,
      },
      data: schema,
      operations: [
        { type: 'mkdir', path: paths.folder },
        { type: 'write', path: paths.schemaFile, sizeBytes: JSON.stringify(schema, null, 2).length },
        { type: 'write', path: paths.dataFile, sizeBytes: 0 },
        { type: 'write', path: paths.deletedFile, sizeBytes: 0 },
      ],
    };

    if (options.human) {
      outputHumanSuccess(`[dry-run] Would initialize database at ${folder}`);
    } else {
      outputSuccess(response);
    }
    return;
  }

  // Initialize the database
  initializeDatabase(paths, schema as object, options.force);

  const response: SuccessResponse = {
    success: true,
    action: 'initialized',
    resource: {
      type: 'database',
      path: paths.folder,
    },
    metadata: {
      schemaFile: paths.schemaFile,
      dataFile: paths.dataFile,
      fromSchema: schemaPath,
    },
  };

  if (options.human) {
    outputHumanSuccess(`✓ Initialized database at ${folder}`);
  } else {
    outputSuccess(response);
  }
}
