/**
 * SDB - List command
 * List records from a database with optional filtering
 */

import { ListOptions, SuccessResponse, SdbRecord } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadRecords, loadDeletedRecords } from '../lib/fs.js';
import { filterRecords } from '../lib/filter.js';
import { applyLimit, normalizeSortField, normalizeSortOrder, parseLimit, sortRecords, filterRecordsByTime } from '../lib/records.js';
import { parseDurationMs } from '../lib/time.js';
import { outputSuccess, outputHumanSuccess, formatRecordTable, formatIdsOutput } from '../lib/output.js';

export async function listCommand(
  folder: string,
  options: ListOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  const allActiveRecords = loadRecords(paths);
  const legacyDeleted = allActiveRecords.filter(r => r._deleted);
  let records = allActiveRecords.filter(r => !r._deleted);

  const nowMs = Date.now();
  const createdWithinMs = options.createdWithin ? parseDurationMs(options.createdWithin) : undefined;
  const updatedWithinMs = options.updatedWithin ? parseDurationMs(options.updatedWithin) : undefined;
  const deletedWithinMs = options.deletedWithin ? parseDurationMs(options.deletedWithin) : undefined;

  // Apply filter if provided
  if (options.filter) {
    records = filterRecords(records, options.filter);
  }

  // Apply time filters to active records
  if (createdWithinMs !== undefined) {
    records = filterRecordsByTime(records, '_created', createdWithinMs, nowMs);
  }
  if (updatedWithinMs !== undefined) {
    records = filterRecordsByTime(records, '_updated', updatedWithinMs, nowMs);
  }

  if (options.includeDeleted) {
    let deletedRecords = loadDeletedRecords(paths);
    const activeIds = new Set(records.map(r => r._id));
    const uniqueDeleted = deletedRecords.filter(r => !activeIds.has(r._id));
    const legacyUnique = legacyDeleted.filter(r => !activeIds.has(r._id));

    deletedRecords = uniqueDeleted.concat(legacyUnique);

    if (options.filter) {
      deletedRecords = filterRecords(deletedRecords, options.filter);
    }
    if (createdWithinMs !== undefined) {
      deletedRecords = filterRecordsByTime(deletedRecords, '_created', createdWithinMs, nowMs);
    }
    if (updatedWithinMs !== undefined) {
      deletedRecords = filterRecordsByTime(deletedRecords, '_updated', updatedWithinMs, nowMs);
    }
    if (deletedWithinMs !== undefined) {
      deletedRecords = filterRecordsByTime(deletedRecords, '_deleted', deletedWithinMs, nowMs);
    }

    records = records.concat(deletedRecords);
  }

  // Apply sorting if requested
  const sortField = normalizeSortField(options.sort);
  const sortOrder = normalizeSortOrder(options.order);
  if (sortField) {
    records = sortRecords(records, sortField, sortOrder);
  }

  // Apply limit if requested
  const limit = parseLimit(options.limit !== undefined ? String(options.limit) : undefined);
  records = applyLimit(records, limit);

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
          sort: sortField,
          order: sortOrder,
          limit: limit ?? null,
          createdWithin: options.createdWithin || null,
          updatedWithin: options.updatedWithin || null,
          deletedWithin: options.deletedWithin || null,
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
      includeDeleted: options.includeDeleted || false,
      sort: sortField,
      order: sortOrder,
      limit: limit ?? null,
      createdWithin: options.createdWithin || null,
      updatedWithin: options.updatedWithin || null,
      deletedWithin: options.deletedWithin || null,
    },
  };
  outputSuccess(response);
}
