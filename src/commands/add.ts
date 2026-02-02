/**
 * SDB - Add command
 * Add a new record to a database
 */

import { ulid } from 'ulid';
import { AddOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadSchema, loadRecords, writeRecords, withLock, getFileSize } from '../lib/fs.js';
import { validateAgainstSchema, parseFieldArgs, applySchemaDefaults } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function addCommand(
  folder: string,
  fieldArgs: string[],
  options: AddOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  // Parse field arguments
  const userData = parseFieldArgs(fieldArgs);

  // Load schema and apply defaults
  const schema = loadSchema(paths) as Record<string, unknown>;
  const dataWithDefaults = applySchemaDefaults(userData, schema);

  // Validate against schema
  const validation = validateAgainstSchema(dataWithDefaults, schema);
  if (!validation.valid) {
    outputError(errors.schemaValidationFailed(validation.errors || [], { data: dataWithDefaults }));
  }

  // Generate reserved fields
  const now = new Date().toISOString();
  const id = ulid();
  
  const record = {
    _id: id,
    _created: now,
    _updated: now,
    ...dataWithDefaults,
  };

  if (options.dryRun) {
    const response: SuccessResponse = {
      success: true,
      dryRun: true,
      action: 'would-create',
      resource: {
        type: 'record',
        id,
        path: paths.dataFile,
      },
      data: record,
      operations: [
        {
          type: 'append',
          path: paths.dataFile,
          sizeBytes: JSON.stringify(record).length + 1,
        },
      ],
    };

    if (options.human) {
      outputHumanSuccess(`[dry-run] Would add record ${id}`);
    } else {
      outputSuccess(response);
    }
    return;
  }

  // Execute with lock
  await withLock(paths, 'add', () => {
    const records = loadRecords(paths);
    records.push(record);
    writeRecords(paths, records);
  });

  const response: SuccessResponse = {
    success: true,
    action: 'created',
    resource: {
      type: 'record',
      id,
      path: paths.dataFile,
    },
    data: record,
  };

  if (options.human) {
    outputHumanSuccess(`✓ Added record ${id}`);
  } else {
    outputSuccess(response);
  }
}
