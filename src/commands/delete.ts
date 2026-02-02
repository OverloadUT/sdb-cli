/**
 * SDB - Delete command
 * Soft delete (or hard delete with --hard) a record
 */

import { DeleteOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadRecords, writeRecords, withLock } from '../lib/fs.js';
import { validateId } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function deleteCommand(
  folder: string,
  id: string,
  options: DeleteOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  // Validate ID
  validateId(id);

  // Load records and find target
  const records = loadRecords(paths);
  const index = records.findIndex(r => r._id === id);

  if (index === -1) {
    outputError(errors.resourceNotFound('Record', id, paths.dataFile));
  }

  const record = records[index];

  // Safety check - require --force for destructive operations
  if (!options.force) {
    const operation = options.hard ? 'hard delete' : 'delete';
    const cmd = `sdb delete ${folder} ${id}${options.hard ? ' --hard' : ''} --force`;
    outputError(errors.safetyCheckFailed(operation, `record ${id}`, cmd));
  }

  // Check if already deleted (for soft delete)
  if (!options.hard && record._deleted) {
    outputError(errors.invalidInput('Record is already deleted', {
      id,
      deletedAt: record._deleted,
      suggestion: 'Use --hard to permanently remove',
    }));
  }

  if (options.dryRun) {
    const action = options.hard ? 'would-hard-delete' : 'would-soft-delete';
    const response: SuccessResponse = {
      success: true,
      dryRun: true,
      action,
      resource: {
        type: 'record',
        id,
        path: paths.dataFile,
      },
      data: record,
      operations: [
        {
          type: options.hard ? 'remove' : 'update',
          path: paths.dataFile,
        },
      ],
    };

    if (options.human) {
      outputHumanSuccess(`[dry-run] Would ${options.hard ? 'hard ' : ''}delete record ${id}`);
    } else {
      outputSuccess(response);
    }
    return;
  }

  // Execute with lock
  await withLock(paths, 'delete', () => {
    const currentRecords = loadRecords(paths);
    const currentIndex = currentRecords.findIndex(r => r._id === id);
    
    if (currentIndex === -1) {
      throw errors.resourceNotFound('Record', id, paths.dataFile);
    }

    if (options.hard) {
      // Hard delete - remove from array
      currentRecords.splice(currentIndex, 1);
    } else {
      // Soft delete - set _deleted timestamp
      currentRecords[currentIndex] = {
        ...currentRecords[currentIndex],
        _deleted: new Date().toISOString(),
        _updated: new Date().toISOString(),
      };
    }
    
    writeRecords(paths, currentRecords);
  });

  const action = options.hard ? 'hard-deleted' : 'soft-deleted';
  const response: SuccessResponse = {
    success: true,
    action,
    resource: {
      type: 'record',
      id,
      path: paths.dataFile,
    },
    metadata: {
      permanent: options.hard || false,
    },
  };

  if (options.human) {
    const verb = options.hard ? 'Permanently deleted' : 'Deleted';
    outputHumanSuccess(`✓ ${verb} record ${id}`);
  } else {
    outputSuccess(response);
  }
}
