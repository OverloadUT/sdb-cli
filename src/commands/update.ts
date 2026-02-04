/**
 * SDB - Update command
 * Update fields on an existing record
 */

import { UpdateOptions, SuccessResponse, SdbRecord } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadSchema, loadRecords, loadDeletedRecords, writeRecords, withLock } from '../lib/fs.js';
import { compileSchemaValidator, validateWithValidator, validateId, parseFieldArgs } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function updateCommand(
  folder: string,
  ids: string[] | string,
  fieldArgs: string[],
  options: UpdateOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  const idList = Array.isArray(ids) ? ids : [ids];
  if (idList.length === 0) {
    outputError(errors.invalidInput('At least one ID is required', {}));
  }

  // Validate IDs
  idList.forEach(validateId);

  // Parse field arguments
  const updates = parseFieldArgs(fieldArgs);

  if (Object.keys(updates).length === 0) {
    outputError(errors.invalidInput('No fields to update provided', { ids: idList }));
  }

  // Load schema
  const schema = loadSchema(paths) as Record<string, unknown>;
  const validator = compileSchemaValidator(schema);

  if (options.dryRun) {
    // Load records and find target
    const deletedRecords = loadDeletedRecords(paths);
    const deletedIds = new Set(deletedRecords.map(r => r._id));
    const allRecords = loadRecords(paths);
    const legacyDeleted = allRecords.filter(r => r._deleted).map(r => r._id);

    const records = allRecords.filter(r => !r._deleted);

    const missingIds: string[] = [];
    const deletedList: string[] = [];
    const updatedRecords: SdbRecord[] = [];
    const now = new Date().toISOString();

    for (const id of idList) {
      if (deletedIds.has(id) || legacyDeleted.includes(id)) {
        deletedList.push(id);
        continue;
      }

      const existingRecord = records.find(r => r._id === id);
      if (!existingRecord) {
        missingIds.push(id);
        continue;
      }

      const updatedRecord = {
        ...existingRecord,
        ...updates,
        _id: existingRecord._id,
        _created: existingRecord._created,
        _updated: now,
      };

      const userData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updatedRecord)) {
        if (!key.startsWith('_')) {
          userData[key] = value;
        }
      }

      const validation = validateWithValidator(userData, validator);
      if (!validation.valid) {
        outputError(errors.schemaValidationFailed(validation.errors || [], { 
          data: userData,
          record: id 
        }));
      }

      updatedRecords.push(updatedRecord);
    }

    if (deletedList.length > 0) {
      outputError(errors.invalidInput('Cannot update deleted record(s)', { ids: deletedList }));
    }
    if (missingIds.length > 0) {
      outputError(errors.recordsNotFound(missingIds, paths.dataFile));
    }

    const response: SuccessResponse = {
      success: true,
      dryRun: true,
      action: 'would-update',
      resource: {
        type: 'record',
        path: paths.dataFile,
      },
      data: idList.length === 1 ? updatedRecords[0] : updatedRecords,
      metadata: {
        changes: updates,
        ids: idList,
      },
    };

    if (options.human) {
      if (idList.length === 1) {
        outputHumanSuccess(`[dry-run] Would update record ${idList[0]}`);
      } else {
        outputHumanSuccess(`[dry-run] Would update ${idList.length} record(s)`);
      }
    } else {
      outputSuccess(response);
    }
    return;
  }

  let updatedRecords: SdbRecord[] = [];

  // Execute with lock
  await withLock(paths, 'update', () => {
    const deletedRecords = loadDeletedRecords(paths);
    const deletedIds = new Set(deletedRecords.map(r => r._id));
    const allRecords = loadRecords(paths);
    const legacyDeleted = allRecords.filter(r => r._deleted).map(r => r._id);

    const currentRecords = allRecords.filter(r => !r._deleted);

    const missingIds: string[] = [];
    const deletedList: string[] = [];
    const updatedMap = new Map<string, SdbRecord>();
    const now = new Date().toISOString();

    for (const id of idList) {
      if (deletedIds.has(id) || legacyDeleted.includes(id)) {
        deletedList.push(id);
        continue;
      }

      const existingRecord = currentRecords.find(r => r._id === id);
      if (!existingRecord) {
        missingIds.push(id);
        continue;
      }

      const nextRecord: SdbRecord = {
        ...existingRecord,
        ...updates,
        _id: existingRecord._id,
        _created: existingRecord._created,
        _updated: now,
      };

      const userData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(nextRecord)) {
        if (!key.startsWith('_')) {
          userData[key] = value;
        }
      }

      const validation = validateWithValidator(userData, validator);
      if (!validation.valid) {
        throw errors.schemaValidationFailed(validation.errors || [], { 
          data: userData,
          record: id 
        });
      }

      updatedMap.set(id, nextRecord);
    }

    if (deletedList.length > 0) {
      throw errors.invalidInput('Cannot update deleted record(s)', { ids: deletedList });
    }
    if (missingIds.length > 0) {
      throw errors.recordsNotFound(missingIds, paths.dataFile);
    }

    const nextRecords = currentRecords.map(record => updatedMap.get(record._id) || record);
    updatedRecords = idList.map(id => updatedMap.get(id) as SdbRecord);
    writeRecords(paths, nextRecords);
  });

  const response: SuccessResponse = {
    success: true,
    action: 'updated',
    resource: {
      type: 'record',
      path: paths.dataFile,
    },
    data: idList.length === 1 ? updatedRecords[0] : updatedRecords,
    metadata: {
      changes: updates,
      ids: idList,
    },
  };

  if (options.human) {
    if (idList.length === 1) {
      outputHumanSuccess(`✓ Updated record ${idList[0]}`);
    } else {
      outputHumanSuccess(`✓ Updated ${idList.length} record(s)`);
    }
  } else {
    outputSuccess(response);
  }
}
