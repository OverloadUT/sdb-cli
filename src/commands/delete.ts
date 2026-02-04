/**
 * SDB - Delete command
 * Soft delete (or hard delete with --hard) a record
 */

import { DeleteOptions, SuccessResponse, SdbRecord } from '../types.js';
import {
  getDatabasePaths,
  ensureDatabaseExists,
  loadRecords,
  loadDeletedRecords,
  writeRecords,
  writeDeletedRecords,
  appendDeletedRecord,
  withLock,
} from '../lib/fs.js';
import { validateId } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function deleteCommand(
  folder: string,
  ids: string[] | string,
  options: DeleteOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  const idList = Array.isArray(ids) ? ids : [ids];
  if (idList.length === 0) {
    outputError(errors.invalidInput('At least one ID is required', {}));
  }

  // Validate IDs
  idList.forEach(validateId);

  // Safety check - require --force for destructive operations
  if (!options.force) {
    const operation = options.hard ? 'hard delete' : 'delete';
    const cmd = `sdb delete ${folder} ${idList.join(' ')}${options.hard ? ' --hard' : ''} --force`;
    outputError(errors.safetyCheckFailed(operation, `record(s) ${idList.join(', ')}`, cmd));
  }

  if (options.dryRun) {
    // Load records and find target
    const deletedRecords = loadDeletedRecords(paths);
    const records = loadRecords(paths);

    const missingIds: string[] = [];
    const alreadyDeleted: string[] = [];
    const recordsToDelete: SdbRecord[] = [];

    for (const id of idList) {
      const active = records.find(r => r._id === id);
      const deleted = deletedRecords.find(r => r._id === id);

      if (options.hard) {
        if (!active && !deleted) {
          missingIds.push(id);
          continue;
        }
      } else {
        if (!active && deleted) {
          alreadyDeleted.push(id);
          continue;
        }
        if (!active && !deleted) {
          missingIds.push(id);
          continue;
        }
      }

      if (active) {
        recordsToDelete.push(active);
      }
    }

    if (alreadyDeleted.length > 0) {
      outputError(errors.invalidInput('Record(s) already deleted', { ids: alreadyDeleted }));
    }
    if (missingIds.length > 0) {
      outputError(errors.recordsNotFound(missingIds, paths.dataFile));
    }

    const action = options.hard ? 'would-hard-delete' : 'would-soft-delete';
    const operations =
      options.hard
        ? [
            {
              type: 'remove',
              path: paths.dataFile,
            },
            {
              type: 'remove',
              path: paths.deletedFile,
            },
          ]
        : [
            {
              type: 'append',
              path: paths.deletedFile,
              sizeBytes: recordsToDelete.reduce(
                (sum, record) => sum + JSON.stringify({ ...record, _deleted: new Date().toISOString() }).length + 1,
                0
              ),
            },
            {
              type: 'rewrite',
              path: paths.dataFile,
            },
          ];
    const response: SuccessResponse = {
      success: true,
      dryRun: true,
      action,
      resource: {
        type: 'record',
        path: paths.dataFile,
      },
      data: idList.length === 1 ? recordsToDelete[0] : recordsToDelete,
      operations,
    };

    if (options.human) {
      if (idList.length === 1) {
        outputHumanSuccess(`[dry-run] Would ${options.hard ? 'hard ' : ''}delete record ${idList[0]}`);
      } else {
        outputHumanSuccess(`[dry-run] Would ${options.hard ? 'hard ' : ''}delete ${idList.length} record(s)`);
      }
    } else {
      outputSuccess(response);
    }
    return;
  }

  // Execute with lock
  await withLock(paths, 'delete', () => {
    const currentRecords = loadRecords(paths);
    const deletedRecords = loadDeletedRecords(paths);
    const deletedById = new Map<string, SdbRecord>();
    for (const record of deletedRecords) {
      deletedById.set(record._id, record);
    }

    if (options.hard) {
      const missingIds: string[] = [];
      const remainingActive = currentRecords.filter(r => !idList.includes(r._id));
      const remainingDeleted = deletedRecords.filter(r => !idList.includes(r._id));

      for (const id of idList) {
        const active = currentRecords.find(r => r._id === id);
        const deleted = deletedById.get(id);
        if (!active && !deleted) {
          missingIds.push(id);
        }
      }

      if (missingIds.length > 0) {
        throw errors.recordsNotFound(missingIds, paths.dataFile);
      }

      if (remainingActive.length !== currentRecords.length) {
        writeRecords(paths, remainingActive);
      }
      if (remainingDeleted.length !== deletedRecords.length) {
        writeDeletedRecords(paths, remainingDeleted);
      }
    } else {
      const missingIds: string[] = [];
      const alreadyDeleted: string[] = [];

      for (const id of idList) {
        const active = currentRecords.find(r => r._id === id);
        const deleted = deletedById.get(id);
        if (!active && deleted) {
          alreadyDeleted.push(id);
          continue;
        }
        if (!active && !deleted) {
          missingIds.push(id);
        }
      }

      if (alreadyDeleted.length > 0) {
        throw errors.invalidInput('Record(s) already deleted', { ids: alreadyDeleted });
      }
      if (missingIds.length > 0) {
        throw errors.recordsNotFound(missingIds, paths.dataFile);
      }

      const now = new Date().toISOString();
      const remainingActive = currentRecords.filter(record => {
        if (!idList.includes(record._id)) return true;
        const deleted = deletedById.get(record._id);
        if (!deleted) {
          appendDeletedRecord(paths, {
            ...record,
            _deleted: record._deleted || now,
            _updated: now,
          });
        }
        return false;
      });

      writeRecords(paths, remainingActive);
    }
  });

  const action = options.hard ? 'hard-deleted' : 'soft-deleted';
  const response: SuccessResponse = {
    success: true,
    action,
    resource: {
      type: 'record',
      path: paths.dataFile,
    },
    metadata: {
      permanent: options.hard || false,
      ids: idList,
    },
  };

  if (options.human) {
    const verb = options.hard ? 'Permanently deleted' : 'Deleted';
    if (idList.length === 1) {
      outputHumanSuccess(`✓ ${verb} record ${idList[0]}`);
    } else {
      outputHumanSuccess(`✓ ${verb} ${idList.length} record(s)`);
    }
  } else {
    outputSuccess(response);
  }
}
