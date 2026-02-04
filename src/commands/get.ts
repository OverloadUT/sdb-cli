/**
 * SDB - Get command
 * Get a single record by ID
 */

import { GetOptions, SuccessResponse, SdbRecord } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadRecords, loadDeletedRecords } from '../lib/fs.js';
import { validateId } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess, formatRecordTable } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function getCommand(
  folder: string,
  ids: string[] | string,
  options: GetOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  const idList = Array.isArray(ids) ? ids : [ids];
  if (idList.length === 0) {
    outputError(errors.invalidInput('At least one ID is required', {}));
  }

  // Validate IDs
  idList.forEach(validateId);

  const allActiveRecords = loadRecords(paths);
  const legacyDeleted = allActiveRecords.filter(r => r._deleted);
  const records = allActiveRecords.filter(r => !r._deleted);
  const deletedRecords = loadDeletedRecords(paths);

  const deletedById = new Map<string, SdbRecord>();
  for (const record of deletedRecords) {
    deletedById.set(record._id, record);
  }
  for (const record of legacyDeleted) {
    if (!deletedById.has(record._id)) {
      deletedById.set(record._id, record);
    }
  }

  const activeById = new Map<string, SdbRecord>();
  for (const record of records) {
    activeById.set(record._id, record);
  }

  const results: SdbRecord[] = [];
  const deletedIds: string[] = [];
  const missingIds: string[] = [];

  for (const id of idList) {
    const active = activeById.get(id);
    if (active) {
      results.push(active);
      continue;
    }
    const deleted = deletedById.get(id);
    if (deleted) {
      results.push(deleted);
      deletedIds.push(id);
      continue;
    }
    missingIds.push(id);
  }

  if (missingIds.length > 0) {
    outputError(errors.recordsNotFound(missingIds, paths.dataFile));
  }

  if (idList.length === 1) {
    const record = results[0];
    if (deletedIds.length > 0) {
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
    return;
  }

  const response: SuccessResponse = {
    success: true,
    action: 'retrieved',
    data: results,
    metadata: {
      count: results.length,
      deletedIds,
    },
  };

  if (options.human) {
    outputHumanSuccess(formatRecordTable(results));
  } else {
    outputSuccess(response);
  }
}
