/**
 * SDB - Garbage collection command
 * Remove old records from the deleted file
 */

import { GcOptions, SuccessResponse, SdbRecord } from '../types.js';
import {
  getDatabasePaths,
  ensureDatabaseExists,
  loadDeletedRecords,
  writeDeletedRecords,
  withLock,
} from '../lib/fs.js';
import { parseDurationMs } from '../lib/time.js';
import { outputSuccess, outputHumanSuccess } from '../lib/output.js';
import { errors, outputError } from '../lib/errors.js';

interface GcStats {
  total: number;
  removed: number;
  remaining: number;
  skippedInvalid: number;
  cutoff?: string;
}

function computeGc(
  records: SdbRecord[],
  cutoffTimeMs: number | null
): { remaining: SdbRecord[]; stats: GcStats } {
  let removed = 0;
  let skippedInvalid = 0;
  const remaining: SdbRecord[] = [];

  for (const record of records) {
    if (cutoffTimeMs === null) {
      removed++;
      continue;
    }

    if (!record._deleted) {
      skippedInvalid++;
      remaining.push(record);
      continue;
    }

    const ts = Date.parse(record._deleted);
    if (Number.isNaN(ts)) {
      skippedInvalid++;
      remaining.push(record);
      continue;
    }

    if (ts <= cutoffTimeMs) {
      removed++;
    } else {
      remaining.push(record);
    }
  }

  return {
    remaining,
    stats: {
      total: records.length,
      removed,
      remaining: records.length - removed,
      skippedInvalid,
      cutoff: cutoffTimeMs === null ? undefined : new Date(cutoffTimeMs).toISOString(),
    },
  };
}

export async function gcCommand(folder: string, options: GcOptions): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  if (!options.force) {
    const agePart = options.age ? ` --age ${options.age}` : options.all ? ' --all' : '';
    outputError(errors.safetyCheckFailed('garbage collection', `database ${folder}`, `sdb gc ${folder}${agePart} --force`));
  }

  if (options.all && options.age) {
    outputError(errors.invalidInput('Use either --all or --age, not both', { age: options.age }));
  }

  if (!options.all && !options.age) {
    outputError(errors.invalidInput('Either --age <duration> or --all is required', {}));
  }

  const cutoffTimeMs = options.all
    ? null
    : Date.now() - parseDurationMs(options.age as string);

  const stats = await withLock(paths, 'gc', () => {
    const deletedRecords = loadDeletedRecords(paths);
    const result = computeGc(deletedRecords, cutoffTimeMs);

    if (!options.dryRun) {
      writeDeletedRecords(paths, result.remaining);
    }

    return result.stats;
  });

  const response: SuccessResponse = {
    success: true,
    action: options.dryRun ? 'would-gc' : 'gc',
    resource: {
      type: 'database',
      path: paths.folder,
    },
    data: {
      totalDeleted: stats.total,
      removed: stats.removed,
      remaining: stats.remaining,
      skippedInvalid: stats.skippedInvalid,
      cutoff: stats.cutoff || null,
      age: options.age || null,
      all: options.all || false,
    },
    dryRun: options.dryRun || false,
  };

  if (options.dryRun) {
    response.operations = [
      {
        type: 'rewrite',
        path: paths.deletedFile,
      },
    ];
  }

  if (options.human) {
    const prefix = options.dryRun ? '[dry-run] ' : '';
    const cutoff = stats.cutoff ? ` (cutoff ${stats.cutoff})` : '';
    outputHumanSuccess(
      `${prefix}Garbage collection removed ${stats.removed} record(s); ${stats.remaining} remain${cutoff}`
    );
  } else {
    outputSuccess(response);
  }
}
