/**
 * SDB - Count command
 * Count records matching an optional filter
 */

import { CountOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadRecords } from '../lib/fs.js';
import { filterRecords } from '../lib/filter.js';
import { outputSuccess, outputHumanSuccess, formatCount } from '../lib/output.js';

export async function countCommand(
  folder: string,
  options: CountOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  // Load all records
  let records = loadRecords(paths);

  // Filter out deleted records unless explicitly requested
  if (!options.includeDeleted) {
    records = records.filter(r => !r._deleted);
  }

  // Apply filter if provided
  if (options.filter) {
    records = filterRecords(records, options.filter);
  }

  const count = records.length;

  const response: SuccessResponse = {
    success: true,
    action: 'counted',
    data: { count },
    metadata: {
      filter: options.filter || null,
      includeDeleted: options.includeDeleted || false,
    },
  };

  if (options.human) {
    outputHumanSuccess(formatCount(count, options.filter));
  } else {
    outputSuccess(response);
  }
}
