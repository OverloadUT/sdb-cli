/**
 * SDB - File system utilities including lock protocol
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { errors } from './errors.js';
import { LockFile, SdbRecord } from '../types.js';

const LOCK_TIMEOUT_MS = 30000; // 30 seconds
const LOCK_RETRY_MS = 100; // 100ms between retries
const LOCK_MAX_RETRIES = 3;

export interface DatabasePaths {
  folder: string;
  dataFile: string;
  schemaFile: string;
  lockFile: string;
  tempFile: string;
}

/**
 * Get all paths for a database folder
 */
export function getDatabasePaths(folder: string): DatabasePaths {
  const resolved = resolve(folder);
  return {
    folder: resolved,
    dataFile: join(resolved, 'data.jsonl'),
    schemaFile: join(resolved, 'schema.json'),
    lockFile: join(resolved, '.sdb.lock'),
    tempFile: join(resolved, 'data.jsonl.tmp'),
  };
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(paths: DatabasePaths): boolean {
  return existsSync(paths.schemaFile);
}

/**
 * Ensure database folder exists and is initialized
 */
export function ensureDatabaseExists(paths: DatabasePaths): void {
  if (!isDatabaseInitialized(paths)) {
    throw errors.databaseNotInitialized(paths.folder);
  }
}

/**
 * Load schema from database folder
 */
export function loadSchema(paths: DatabasePaths): object {
  try {
    const content = readFileSync(paths.schemaFile, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw errors.databaseNotInitialized(paths.folder);
    }
    throw errors.operationFailed('loadSchema', `Failed to load schema: ${(err as Error).message}`, {
      path: paths.schemaFile,
    });
  }
}

/**
 * Load all records from database
 */
export function loadRecords(paths: DatabasePaths): SdbRecord[] {
  if (!existsSync(paths.dataFile)) {
    return [];
  }

  try {
    const content = readFileSync(paths.dataFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
      try {
        return JSON.parse(line) as SdbRecord;
      } catch {
        throw errors.operationFailed('loadRecords', `Invalid JSON on line ${index + 1}`, {
          line: index + 1,
          content: line.slice(0, 100),
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'SdbError') {
      throw err;
    }
    throw errors.operationFailed('loadRecords', `Failed to load records: ${(err as Error).message}`, {
      path: paths.dataFile,
    });
  }
}

/**
 * Write all records to database (atomic write)
 */
export function writeRecords(paths: DatabasePaths, records: SdbRecord[]): void {
  try {
    const content = records.map(r => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
    writeFileSync(paths.tempFile, content, 'utf-8');
    renameSync(paths.tempFile, paths.dataFile);
  } catch (err) {
    // Clean up temp file if it exists
    try {
      if (existsSync(paths.tempFile)) {
        unlinkSync(paths.tempFile);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw errors.operationFailed('writeRecords', `Failed to write records: ${(err as Error).message}`, {
      path: paths.dataFile,
    });
  }
}

/**
 * Acquire lock for write operations
 */
export function acquireLock(paths: DatabasePaths, operation: string): void {
  for (let retry = 0; retry < LOCK_MAX_RETRIES; retry++) {
    // Check if lock exists
    if (existsSync(paths.lockFile)) {
      try {
        const content = readFileSync(paths.lockFile, 'utf-8');
        const lock = JSON.parse(content) as LockFile;
        const lockAge = Date.now() - new Date(lock.timestamp).getTime();

        // If lock is stale, remove it
        if (lockAge > LOCK_TIMEOUT_MS) {
          unlinkSync(paths.lockFile);
        } else {
          // Lock is fresh, wait and retry
          if (retry < LOCK_MAX_RETRIES - 1) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
            continue;
          }
          throw errors.lockFailed(paths.lockFile, lock);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'SdbError') {
          throw err;
        }
        // If we can't read the lock file, try to remove it
        try {
          unlinkSync(paths.lockFile);
        } catch {
          // Ignore
        }
      }
    }

    // Try to create lock
    try {
      const lock: LockFile = {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        operation,
      };
      writeFileSync(paths.lockFile, JSON.stringify(lock), { flag: 'wx' });
      return; // Lock acquired successfully
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        // Another process created the lock between our check and create
        if (retry < LOCK_MAX_RETRIES - 1) {
          continue;
        }
        throw errors.lockFailed(paths.lockFile);
      }
      throw errors.operationFailed('acquireLock', `Failed to create lock: ${(err as Error).message}`, {
        path: paths.lockFile,
      });
    }
  }
}

/**
 * Release lock after write operations
 */
export function releaseLock(paths: DatabasePaths): void {
  try {
    if (existsSync(paths.lockFile)) {
      unlinkSync(paths.lockFile);
    }
  } catch {
    // Ignore errors releasing lock
  }
}

/**
 * Execute a write operation with lock protection
 */
export async function withLock<T>(
  paths: DatabasePaths,
  operation: string,
  fn: () => T | Promise<T>
): Promise<T> {
  acquireLock(paths, operation);
  try {
    return await fn();
  } finally {
    releaseLock(paths);
  }
}

/**
 * Initialize a new database folder
 */
export function initializeDatabase(
  paths: DatabasePaths,
  schema: object,
  force: boolean = false
): void {
  // Create folder if it doesn't exist
  if (!existsSync(paths.folder)) {
    mkdirSync(paths.folder, { recursive: true });
  }

  // Check if already initialized
  if (existsSync(paths.schemaFile) && !force) {
    throw errors.resourceExists('Database', paths.folder, paths.schemaFile);
  }

  // Write schema
  writeFileSync(paths.schemaFile, JSON.stringify(schema, null, 2), 'utf-8');

  // Create empty data file if it doesn't exist
  if (!existsSync(paths.dataFile)) {
    writeFileSync(paths.dataFile, '', 'utf-8');
  }
}

/**
 * Get file stats if file exists
 */
export function getFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
