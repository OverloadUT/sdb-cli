/**
 * SDB - File system utilities including lock protocol
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { errors } from './errors.js';
import { LockFile, SdbRecord } from '../types.js';

const LOCK_TIMEOUT_MS = parseInt(process.env.SDB_LOCK_TIMEOUT_MS || '120000', 10); // 2 minutes
const LOCK_RETRY_MS = parseInt(process.env.SDB_LOCK_RETRY_MS || '100', 10); // 100ms between retries
const LOCK_MAX_WAIT_MS = parseInt(process.env.SDB_LOCK_WAIT_MS || String(LOCK_TIMEOUT_MS), 10);

export interface DatabasePaths {
  folder: string;
  dataFile: string;
  deletedFile: string;
  schemaFile: string;
  lockFile: string;
  tempFile: string;
  deletedTempFile: string;
}

/**
 * Get all paths for a database folder
 */
export function getDatabasePaths(folder: string): DatabasePaths {
  const resolved = resolve(folder);
  return {
    folder: resolved,
    dataFile: join(resolved, 'data.jsonl'),
    deletedFile: join(resolved, 'data.deleted.jsonl'),
    schemaFile: join(resolved, 'schema.json'),
    lockFile: join(resolved, '.sdb.lock'),
    tempFile: join(resolved, 'data.jsonl.tmp'),
    deletedTempFile: join(resolved, 'data.deleted.jsonl.tmp'),
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
function loadRecordsFromFile(
  filePath: string,
  operation: string,
  allowPartialLastLine: boolean = false
): SdbRecord[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    if (!content.trim()) {
      return [];
    }
    const lines = content.split('\n');
    const endsWithNewline = content.endsWith('\n');
    const lastIndex = lines.length - 1;

    const records: SdbRecord[] = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line || !line.trim()) {
        continue;
      }
      try {
        records.push(JSON.parse(line) as SdbRecord);
      } catch {
        if (allowPartialLastLine && index === lastIndex && !endsWithNewline) {
          // Ignore a partial trailing line from an interrupted append
          continue;
        }
        throw errors.operationFailed(operation, `Invalid JSON on line ${index + 1}`, {
          line: index + 1,
          content: line.slice(0, 100),
        });
      }
    }

    return records;
  } catch (err) {
    if (err instanceof Error && err.name === 'SdbError') {
      throw err;
    }
    throw errors.operationFailed(operation, `Failed to load records: ${(err as Error).message}`, {
      path: filePath,
    });
  }
}

/**
 * Load all records from database
 */
export function loadRecords(paths: DatabasePaths): SdbRecord[] {
  return loadRecordsFromFile(paths.dataFile, 'loadRecords', false);
}

/**
 * Load deleted records from database
 */
export function loadDeletedRecords(paths: DatabasePaths): SdbRecord[] {
  return loadRecordsFromFile(paths.deletedFile, 'loadDeletedRecords', true);
}

/**
 * Write all records to database (atomic write)
 */
function writeRecordsToFile(filePath: string, tempFile: string, records: SdbRecord[]): void {
  try {
    const content = records.map(r => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
    writeFileSync(tempFile, content, 'utf-8');
    renameSync(tempFile, filePath);
  } catch (err) {
    // Clean up temp file if it exists
    try {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw errors.operationFailed('writeRecords', `Failed to write records: ${(err as Error).message}`, {
      path: filePath,
    });
  }
}

/**
 * Write all records to database (atomic write)
 */
export function writeRecords(paths: DatabasePaths, records: SdbRecord[]): void {
  writeRecordsToFile(paths.dataFile, paths.tempFile, records);
}

/**
 * Write deleted records (atomic write)
 */
export function writeDeletedRecords(paths: DatabasePaths, records: SdbRecord[]): void {
  writeRecordsToFile(paths.deletedFile, paths.deletedTempFile, records);
}

/**
 * Append a record to deleted file
 */
export function appendDeletedRecord(paths: DatabasePaths, record: SdbRecord): void {
  try {
    const line = JSON.stringify(record) + '\n';
    writeFileSync(paths.deletedFile, line, { flag: 'a' });
  } catch (err) {
    throw errors.operationFailed('appendDeletedRecord', `Failed to append deleted record: ${(err as Error).message}`, {
      path: paths.deletedFile,
    });
  }
}

/**
 * Acquire lock for write operations
 */
export function acquireLock(paths: DatabasePaths, operation: string): void {
  const start = Date.now();
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

  while (true) {
    const waitedMs = Date.now() - start;

    // Check if lock exists
    if (existsSync(paths.lockFile)) {
      try {
        const content = readFileSync(paths.lockFile, 'utf-8');
        const lock = JSON.parse(content) as LockFile;
        const lockAge = Date.now() - new Date(lock.timestamp).getTime();

        // If lock is stale, remove it
        if (lockAge > LOCK_TIMEOUT_MS) {
          unlinkSync(paths.lockFile);
          continue;
        }

        // Lock is fresh, wait and retry
        if (waitedMs >= LOCK_MAX_WAIT_MS) {
          throw errors.lockFailed(paths.lockFile, lock);
        }
        const delay = LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS);
        Atomics.wait(waitBuffer, 0, 0, delay);
        continue;
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
        if (waitedMs >= LOCK_MAX_WAIT_MS) {
          throw errors.lockFailed(paths.lockFile);
        }
        const delay = LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS);
        Atomics.wait(waitBuffer, 0, 0, delay);
        continue;
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
        if (waitedMs >= LOCK_MAX_WAIT_MS) {
          throw errors.lockFailed(paths.lockFile);
        }
        const delay = LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS);
        Atomics.wait(waitBuffer, 0, 0, delay);
        continue;
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

  // Create empty deleted file if it doesn't exist
  if (!existsSync(paths.deletedFile)) {
    writeFileSync(paths.deletedFile, '', 'utf-8');
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
