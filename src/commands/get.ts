/**
 * SDB - Get command
 * Get a single record by ID
 */

import { GetOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadRecords } from '../lib/fs.js';
import { validateId } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess, formatRecordTable } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function getCommand(
  folder: string,
  id: string,
  options: GetOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  // Validate ID
  validateId(id);

  // Load and find record
  const records = loadRecords(paths);
  const record = records.find(r => r._id === id);

  if (!record) {
    outputError(errors.resourceNotFound('Record', id, paths.dataFile));
  }

  // Check if soft deleted
  if (record._deleted) {
    const response: SuccessResponse = {
      success: true,
      action: 'retrieved',
      data: record,
      metadata: {
        deleted: true,
        deletedAt: record._deleted,
      },
    };

    if (options.human) {
      outputHumanSuccess(`[deleted] ${formatRecordTable([record])}`);
    } else {
      outputSuccess(response);
    }
    return;
  }

  const response: SuccessResponse = {
    success: true,
    action: 'retrieved',
    data: record,
  };

  if (options.human) {
    outputHumanSuccess(formatRecordTable([record]));
  } else {
    outputSuccess(response);
  }
}
