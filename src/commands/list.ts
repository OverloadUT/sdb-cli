/**
 * SDB - List command
 * List records from a database with optional filtering
 */

import { ListOptions, SuccessResponse, SdbRecord } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadRecords } from '../lib/fs.js';
import { filterRecords } from '../lib/filter.js';
import { outputSuccess, outputHumanSuccess, formatRecordTable, formatIdsOutput } from '../lib/output.js';

export async function listCommand(
  folder: string,
  options: ListOptions
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

  // Output based on format
  if (options.format === 'ids') {
    if (options.human) {
      outputHumanSuccess(formatIdsOutput(records));
    } else {
      // For JSON, still output structured response with just IDs
      const response: SuccessResponse = {
        success: true,
        action: 'listed',
        data: records.map(r => r._id),
        metadata: {
          count: records.length,
          format: 'ids',
        },
      };
      outputSuccess(response);
    }
    return;
  }

  if (options.human || options.format === 'table') {
    outputHumanSuccess(formatRecordTable(records));
    return;
  }

  // Default: JSON output
  const response: SuccessResponse = {
    success: true,
    action: 'listed',
    data: records,
    metadata: {
      count: records.length,
      filter: options.filter || null,
    },
  };
  outputSuccess(response);
}
