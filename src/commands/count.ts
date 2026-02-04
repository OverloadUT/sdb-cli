/**
 * SDB - Count command
 * Count records matching an optional filter
 */

import { CountOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadRecords, loadDeletedRecords } from '../lib/fs.js';
import { filterRecords } from '../lib/filter.js';
import { outputSuccess, outputHumanSuccess, formatCount } from '../lib/output.js';

export async function countCommand(
  folder: string,
  options: CountOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  const allActiveRecords = loadRecords(paths);
  const legacyDeleted = allActiveRecords.filter(r => r._deleted);
  let records = allActiveRecords.filter(r => !r._deleted);

  if (options.includeDeleted) {
    const deletedRecords = loadDeletedRecords(paths);
    const activeIds = new Set(records.map(r => r._id));
    const uniqueDeleted = deletedRecords.filter(r => !activeIds.has(r._id));
    const legacyUnique = legacyDeleted.filter(r => !activeIds.has(r._id));
    records = records.concat(uniqueDeleted, legacyUnique);
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
