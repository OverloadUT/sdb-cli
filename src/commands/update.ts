/**
 * SDB - Update command
 * Update fields on an existing record
 */

import { UpdateOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadSchema, loadRecords, writeRecords, withLock } from '../lib/fs.js';
import { validateAgainstSchema, validateId, parseFieldArgs } from '../lib/validation.js';
import { outputSuccess, outputHumanSuccess } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

export async function updateCommand(
  folder: string,
  id: string,
  fieldArgs: string[],
  options: UpdateOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  // Validate ID
  validateId(id);

  // Parse field arguments
  const updates = parseFieldArgs(fieldArgs);

  if (Object.keys(updates).length === 0) {
    outputError(errors.invalidInput('No fields to update provided', { id }));
  }

  // Load schema
  const schema = loadSchema(paths) as Record<string, unknown>;

  // Load records and find target
  const records = loadRecords(paths);
  const index = records.findIndex(r => r._id === id);

  if (index === -1) {
    outputError(errors.resourceNotFound('Record', id, paths.dataFile));
  }

  const existingRecord = records[index];

  // Check if record is deleted
  if (existingRecord._deleted) {
    outputError(errors.invalidInput('Cannot update deleted record', { 
      id, 
      deletedAt: existingRecord._deleted,
      suggestion: 'Restore the record first or use --force to update anyway' 
    }));
  }

  // Merge updates
  const now = new Date().toISOString();
  const updatedRecord = {
    ...existingRecord,
    ...updates,
    _id: existingRecord._id, // Preserve original ID
    _created: existingRecord._created, // Preserve original creation time
    _updated: now, // Update timestamp
  };

  // Extract user data for validation (exclude reserved fields)
  const userData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updatedRecord)) {
    if (!key.startsWith('_')) {
      userData[key] = value;
    }
  }

  // Validate against schema
  const validation = validateAgainstSchema(userData, schema);
  if (!validation.valid) {
    outputError(errors.schemaValidationFailed(validation.errors || [], { 
      data: userData,
      record: id 
    }));
  }

  if (options.dryRun) {
    const response: SuccessResponse = {
      success: true,
      dryRun: true,
      action: 'would-update',
      resource: {
        type: 'record',
        id,
        path: paths.dataFile,
      },
      data: updatedRecord,
      metadata: {
        changes: updates,
        previousValues: Object.fromEntries(
          Object.keys(updates).map(k => [k, existingRecord[k]])
        ),
      },
    };

    if (options.human) {
      outputHumanSuccess(`[dry-run] Would update record ${id}`);
    } else {
      outputSuccess(response);
    }
    return;
  }

  // Execute with lock
  await withLock(paths, 'update', () => {
    const currentRecords = loadRecords(paths);
    const currentIndex = currentRecords.findIndex(r => r._id === id);
    
    if (currentIndex === -1) {
      throw errors.resourceNotFound('Record', id, paths.dataFile);
    }
    
    currentRecords[currentIndex] = updatedRecord;
    writeRecords(paths, currentRecords);
  });

  const response: SuccessResponse = {
    success: true,
    action: 'updated',
    resource: {
      type: 'record',
      id,
      path: paths.dataFile,
    },
    data: updatedRecord,
    metadata: {
      changes: updates,
    },
  };

  if (options.human) {
    outputHumanSuccess(`✓ Updated record ${id}`);
  } else {
    outputSuccess(response);
  }
}
