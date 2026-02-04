/**
 * Integration smoke tests for SDB CLI
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const execAsync = promisify(exec);

const TEST_DIR = join(process.cwd(), 'test-db');
const CLI_PATH = join(process.cwd(), 'dist', 'src', 'index.js');

const TEST_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["title"],
  "properties": {
    "title": { "type": "string" },
    "priority": { "type": "string", "enum": ["low", "normal", "high"], "default": "normal" },
    "status": { "type": "string", "enum": ["pending", "done"], "default": "pending" }
  }
};

async function runCli(args: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(`node ${CLI_PATH} ${args}`);
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
    };
  }
}

describe('SDB CLI Smoke Tests', () => {
  before(() => {
    // Create test directory and schema file
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'schema.json'), JSON.stringify(TEST_SCHEMA, null, 2));
  });

  after(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test('--help shows usage', async () => {
    const { stdout, exitCode } = await runCli('--help');
    assert.strictEqual(exitCode, 0);
    assert.ok(stdout.includes('Usage:'));
    assert.ok(stdout.includes('sdb'));
  });

  test('--version shows version', async () => {
    const { stdout, exitCode } = await runCli('--version');
    assert.strictEqual(exitCode, 0);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  test('init creates database', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    const schemaPath = join(TEST_DIR, 'schema.json');
    
    const { stdout, exitCode } = await runCli(`init ${dbPath} --schema ${schemaPath}`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'initialized');
    
    // Verify files exist
    assert.ok(existsSync(join(dbPath, 'schema.json')));
    assert.ok(existsSync(join(dbPath, 'data.jsonl')));
  });

  test('init --dry-run does not create files', async () => {
    const dbPath = join(TEST_DIR, 'db-dry');
    const schemaPath = join(TEST_DIR, 'schema.json');
    
    const { stdout, exitCode } = await runCli(`init ${dbPath} --schema ${schemaPath} --dry-run`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.action, 'would-initialize');
    
    // Verify files do NOT exist
    assert.ok(!existsSync(join(dbPath, 'schema.json')));
  });

  test('add creates record', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    const { stdout, exitCode } = await runCli(`add ${dbPath} --title "Test Task"`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'created');
    assert.ok(result.data._id);
    assert.strictEqual(result.data.title, 'Test Task');
    assert.strictEqual(result.data.priority, 'normal'); // default applied
  });

  test('add validates against schema', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    // Missing required 'title' field
    const { stderr, exitCode } = await runCli(`add ${dbPath} --priority high`);
    assert.strictEqual(exitCode, 2);
    
    const result = JSON.parse(stderr);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'SCHEMA_VALIDATION_FAILED');
  });

  test('list returns records as JSON', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    const { stdout, exitCode } = await runCli(`list ${dbPath}`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.data));
    assert.ok(result.data.length >= 1);
  });

  test('list with filter', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    // Add a high priority task
    await runCli(`add ${dbPath} --title "High Priority" --priority high`);
    
    const { stdout, exitCode } = await runCli(`list ${dbPath} --filter ".priority == \\"high\\""`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.ok(result.data.every((r: { priority: string }) => r.priority === 'high'));
  });

  test('list supports created-within filter', async () => {
    const dbPath = join(TEST_DIR, 'db-time');
    const schemaPath = join(TEST_DIR, 'schema.json');

    await runCli(`init ${dbPath} --schema ${schemaPath}`);
    await runCli(`add ${dbPath} --title "Recent"`);

    const { stdout, exitCode } = await runCli(`list ${dbPath} --created-within 1w`);
    assert.strictEqual(exitCode, 0);

    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.ok(result.data.length >= 1);
  });

  test('get retrieves single record', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    // First add a record
    const { stdout: addOutput } = await runCli(`add ${dbPath} --title "Get Test"`);
    const addResult = JSON.parse(addOutput);
    const id = addResult.data._id;
    
    // Then get it
    const { stdout, exitCode } = await runCli(`get ${dbPath} ${id}`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data._id, id);
    assert.strictEqual(result.data.title, 'Get Test');
  });

  test('get retrieves multiple records', async () => {
    const dbPath = join(TEST_DIR, 'db1');

    const { stdout: addOutput1 } = await runCli(`add ${dbPath} --title "Get Multi 1"`);
    const { stdout: addOutput2 } = await runCli(`add ${dbPath} --title "Get Multi 2"`);
    const id1 = JSON.parse(addOutput1).data._id;
    const id2 = JSON.parse(addOutput2).data._id;

    const { stdout, exitCode } = await runCli(`get ${dbPath} ${id1} ${id2}`);
    assert.strictEqual(exitCode, 0);

    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.length, 2);
  });

  test('get returns error for non-existent ID', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    const { stderr, exitCode } = await runCli(`get ${dbPath} NONEXISTENT123`);
    assert.strictEqual(exitCode, 4); // NOT_FOUND
    
    const result = JSON.parse(stderr);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'RESOURCE_NOT_FOUND');
  });

  test('update modifies record', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    // Add a record
    const { stdout: addOutput } = await runCli(`add ${dbPath} --title "Update Test" --priority normal`);
    const addResult = JSON.parse(addOutput);
    const id = addResult.data._id;
    
    // Update it
    const { stdout, exitCode } = await runCli(`update ${dbPath} ${id} --priority high`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.priority, 'high');
    assert.strictEqual(result.data.title, 'Update Test'); // unchanged
  });

  test('update modifies multiple records', async () => {
    const dbPath = join(TEST_DIR, 'db1');

    const { stdout: addOutput1 } = await runCli(`add ${dbPath} --title "Batch 1" --priority normal`);
    const { stdout: addOutput2 } = await runCli(`add ${dbPath} --title "Batch 2" --priority normal`);
    const id1 = JSON.parse(addOutput1).data._id;
    const id2 = JSON.parse(addOutput2).data._id;

    const { stdout, exitCode } = await runCli(`update ${dbPath} ${id1} ${id2} --priority high`);
    assert.strictEqual(exitCode, 0);

    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.length, 2);
    assert.ok(result.data.every((r: { priority: string }) => r.priority === 'high'));
  });

  test('delete requires --force', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    // Add a record
    const { stdout: addOutput } = await runCli(`add ${dbPath} --title "Delete Test"`);
    const addResult = JSON.parse(addOutput);
    const id = addResult.data._id;
    
    // Try to delete without --force
    const { stderr, exitCode } = await runCli(`delete ${dbPath} ${id}`);
    assert.strictEqual(exitCode, 3); // PERMISSION_DENIED
    
    const result = JSON.parse(stderr);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'SAFETY_CHECK_FAILED');
  });

  test('delete --force soft deletes', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    // Add a record
    const { stdout: addOutput } = await runCli(`add ${dbPath} --title "Soft Delete Test"`);
    const addResult = JSON.parse(addOutput);
    const id = addResult.data._id;
    
    // Delete with --force
    const { stdout, exitCode } = await runCli(`delete ${dbPath} ${id} --force`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'soft-deleted');
    
    // Record should not appear in normal list
    const { stdout: listOutput } = await runCli(`list ${dbPath}`);
    const listResult = JSON.parse(listOutput);
    const found = listResult.data.find((r: { _id: string }) => r._id === id);
    assert.strictEqual(found, undefined);
    
    // But should appear with --include-deleted
    const { stdout: listDeletedOutput } = await runCli(`list ${dbPath} --include-deleted`);
    const listDeletedResult = JSON.parse(listDeletedOutput);
    const foundDeleted = listDeletedResult.data.find((r: { _id: string }) => r._id === id);
    assert.ok(foundDeleted);
    assert.ok(foundDeleted._deleted);
  });

  test('delete --force soft deletes multiple records', async () => {
    const dbPath = join(TEST_DIR, 'db1');

    const { stdout: addOutput1 } = await runCli(`add ${dbPath} --title "Multi Delete 1"`);
    const { stdout: addOutput2 } = await runCli(`add ${dbPath} --title "Multi Delete 2"`);
    const id1 = JSON.parse(addOutput1).data._id;
    const id2 = JSON.parse(addOutput2).data._id;

    const { stdout, exitCode } = await runCli(`delete ${dbPath} ${id1} ${id2} --force`);
    assert.strictEqual(exitCode, 0);

    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);

    const { stdout: listOutput } = await runCli(`list ${dbPath}`);
    const listResult = JSON.parse(listOutput);
    const found1 = listResult.data.find((r: { _id: string }) => r._id === id1);
    const found2 = listResult.data.find((r: { _id: string }) => r._id === id2);
    assert.strictEqual(found1, undefined);
    assert.strictEqual(found2, undefined);
  });

  test('count returns record count', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    const { stdout, exitCode } = await runCli(`count ${dbPath}`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.ok(typeof result.data.count === 'number');
  });

  test('schema displays database schema', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    const { stdout, exitCode } = await runCli(`schema ${dbPath}`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.ok(result.data.properties);
    assert.ok(result.data.properties.title);
  });

  test('validate checks records against schema', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    const { stdout, exitCode } = await runCli(`validate ${dbPath}`);
    assert.strictEqual(exitCode, 0);
    
    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.ok(typeof result.data.total === 'number');
    assert.ok(typeof result.data.valid === 'number');
  });

  test('validate returns error when records are invalid', async () => {
    const dbPath = join(TEST_DIR, 'db-invalid');
    const schemaPath = join(TEST_DIR, 'schema.json');

    await runCli(`init ${dbPath} --schema ${schemaPath}`);
    const dataFile = join(dbPath, 'data.jsonl');

    const invalidRecord = {
      _id: 'INVALID',
      _created: new Date().toISOString(),
      _updated: new Date().toISOString(),
      priority: 'high',
    };
    writeFileSync(dataFile, `${JSON.stringify(invalidRecord)}\n`, { flag: 'a' });

    const { stderr, exitCode } = await runCli(`validate ${dbPath}`);
    assert.strictEqual(exitCode, 2);

    const result = JSON.parse(stderr);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'SCHEMA_VALIDATION_FAILED');
    assert.ok(Array.isArray(result.error.context.validationErrors));
  });

  test('gc removes deleted records by age', async () => {
    const dbPath = join(TEST_DIR, 'db-gc');
    const schemaPath = join(TEST_DIR, 'schema.json');

    await runCli(`init ${dbPath} --schema ${schemaPath}`);

    const { stdout: addOutput } = await runCli(`add ${dbPath} --title "GC Test"`);
    const addResult = JSON.parse(addOutput);
    const id = addResult.data._id;

    await runCli(`delete ${dbPath} ${id} --force`);

    const { stdout: gcOutput, exitCode } = await runCli(`gc ${dbPath} --age 0s --force`);
    assert.strictEqual(exitCode, 0);

    const gcResult = JSON.parse(gcOutput);
    assert.strictEqual(gcResult.success, true);
    assert.ok(gcResult.data.removed >= 1);

    const { stdout: listOutput } = await runCli(`list ${dbPath} --include-deleted`);
    const listResult = JSON.parse(listOutput);
    const found = listResult.data.find((r: { _id: string }) => r._id === id);
    assert.strictEqual(found, undefined);
  });

  test('list supports sort and limit', async () => {
    const dbPath = join(TEST_DIR, 'db-sort');
    const schemaPath = join(TEST_DIR, 'schema.json');

    await runCli(`init ${dbPath} --schema ${schemaPath}`);
    await runCli(`add ${dbPath} --title "B Item"`);
    await runCli(`add ${dbPath} --title "A Item"`);

    const { stdout, exitCode } = await runCli(`list ${dbPath} --sort title --order asc --limit 1`);
    assert.strictEqual(exitCode, 0);

    const result = JSON.parse(stdout);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.length, 1);
    assert.strictEqual(result.data[0].title, 'A Item');
  });

  test('--human flag outputs human-readable text', async () => {
    const dbPath = join(TEST_DIR, 'db1');
    
    const { stdout, exitCode } = await runCli(`count ${dbPath} --human`);
    assert.strictEqual(exitCode, 0);
    
    // Should not be JSON
    assert.throws(() => JSON.parse(stdout));
    assert.ok(stdout.includes('record'));
  });

  test('database not initialized returns proper error', async () => {
    const fakePath = join(TEST_DIR, 'nonexistent');
    
    const { stderr, exitCode } = await runCli(`list ${fakePath}`);
    assert.strictEqual(exitCode, 4);
    
    const result = JSON.parse(stderr);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'DATABASE_NOT_INITIALIZED');
  });
});
