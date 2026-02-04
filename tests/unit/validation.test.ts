/**
 * Unit tests for validation utilities
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { validateAgainstSchema, parseFieldArgs, validateFolderPath, validateId, applySchemaDefaults, validateSchemaFile } from '../../src/lib/validation.js';
import { parseDurationMs } from '../../src/lib/time.js';

describe('validateAgainstSchema', () => {
  const testSchema = {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'normal', 'high'] },
      count: { type: 'number' },
    },
  };

  test('validates correct data', () => {
    const result = validateAgainstSchema({ title: 'Test' }, testSchema);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors, undefined);
  });

  test('validates with optional fields', () => {
    const result = validateAgainstSchema({ title: 'Test', priority: 'high' }, testSchema);
    assert.strictEqual(result.valid, true);
  });

  test('rejects missing required fields', () => {
    const result = validateAgainstSchema({}, testSchema);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors && result.errors.length > 0);
  });

  test('rejects invalid enum value', () => {
    const result = validateAgainstSchema({ title: 'Test', priority: 'invalid' }, testSchema);
    assert.strictEqual(result.valid, false);
  });

  test('rejects wrong type', () => {
    const result = validateAgainstSchema({ title: 'Test', count: 'not a number' }, testSchema);
    assert.strictEqual(result.valid, false);
  });
});

describe('parseFieldArgs', () => {
  test('parses string values', () => {
    const result = parseFieldArgs(['--title', 'Hello World']);
    assert.deepStrictEqual(result, { title: 'Hello World' });
  });

  test('parses multiple fields', () => {
    const result = parseFieldArgs(['--title', 'Test', '--priority', 'high']);
    assert.deepStrictEqual(result, { title: 'Test', priority: 'high' });
  });

  test('parses JSON number values', () => {
    const result = parseFieldArgs(['--count', '42']);
    assert.deepStrictEqual(result, { count: 42 });
  });

  test('parses negative numbers', () => {
    const result = parseFieldArgs(['--count', '-1']);
    assert.deepStrictEqual(result, { count: -1 });
  });

  test('parses JSON boolean values', () => {
    const result = parseFieldArgs(['--active', 'true']);
    assert.deepStrictEqual(result, { active: true });
  });

  test('parses JSON array values', () => {
    const result = parseFieldArgs(['--tags', '["a","b"]']);
    assert.deepStrictEqual(result, { tags: ['a', 'b'] });
  });

  test('treats non-JSON as string', () => {
    const result = parseFieldArgs(['--name', 'plain text value']);
    assert.deepStrictEqual(result, { name: 'plain text value' });
  });

  test('parses --field=value form', () => {
    const result = parseFieldArgs(['--title=Hello', '--count=5']);
    assert.deepStrictEqual(result, { title: 'Hello', count: 5 });
  });

  test('rejects reserved field names', () => {
    assert.throws(
      () => parseFieldArgs(['--_id', 'test']),
      /reserved field/
    );
  });

  test('rejects missing value', () => {
    assert.throws(
      () => parseFieldArgs(['--title']),
      /Missing value/
    );
  });
});

describe('validateFolderPath', () => {
  test('accepts valid paths', () => {
    assert.doesNotThrow(() => validateFolderPath('/home/user/data'));
    assert.doesNotThrow(() => validateFolderPath('./data'));
    assert.doesNotThrow(() => validateFolderPath('data'));
  });

  test('rejects empty paths', () => {
    assert.throws(() => validateFolderPath(''), /empty/);
    assert.throws(() => validateFolderPath('   '), /empty/);
  });

  test('rejects path traversal', () => {
    assert.throws(() => validateFolderPath('../etc'), /traversal/);
    assert.throws(() => validateFolderPath('/home/../etc'), /traversal/);
  });

  test('rejects null bytes', () => {
    assert.throws(() => validateFolderPath('/path\0/file'), /Invalid/);
  });
});

describe('validateId', () => {
  test('accepts valid IDs', () => {
    assert.doesNotThrow(() => validateId('01HQ3V123ABC'));
    assert.doesNotThrow(() => validateId('my-record-id'));
    assert.doesNotThrow(() => validateId('record_123'));
  });

  test('rejects empty IDs', () => {
    assert.throws(() => validateId(''), /empty/);
    assert.throws(() => validateId('   '), /empty/);
  });

  test('rejects invalid characters', () => {
    assert.throws(() => validateId('id with spaces'), /invalid characters/);
    assert.throws(() => validateId('id/with/slashes'), /invalid characters/);
  });
});

describe('applySchemaDefaults', () => {
  const schema = {
    properties: {
      priority: { default: 'normal' },
      status: { default: 'pending' },
      count: { type: 'number' },
    },
  };

  test('applies defaults for missing fields', () => {
    const result = applySchemaDefaults({}, schema);
    assert.strictEqual(result.priority, 'normal');
    assert.strictEqual(result.status, 'pending');
  });

  test('does not override provided values', () => {
    const result = applySchemaDefaults({ priority: 'high' }, schema);
    assert.strictEqual(result.priority, 'high');
    assert.strictEqual(result.status, 'pending');
  });

  test('preserves fields without defaults', () => {
    const result = applySchemaDefaults({ count: 42 }, schema);
    assert.strictEqual(result.count, 42);
    assert.strictEqual(result.priority, 'normal');
  });
});

describe('validateSchemaFile', () => {
  test('accepts valid schema', () => {
    assert.doesNotThrow(() => validateSchemaFile({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    }));
  });

  test('rejects reserved fields in properties', () => {
    assert.throws(
      () => validateSchemaFile({
        type: 'object',
        properties: {
          _id: { type: 'string' },
        },
      }),
      /reserved field/
    );
  });

  test('rejects reserved fields in required list', () => {
    assert.throws(
      () => validateSchemaFile({
        type: 'object',
        required: ['_created'],
        properties: {
          title: { type: 'string' },
        },
      }),
      /reserved field/
    );
  });
});

describe('parseDurationMs', () => {
  test('parses seconds', () => {
    assert.strictEqual(parseDurationMs('10s'), 10000);
  });

  test('parses minutes', () => {
    assert.strictEqual(parseDurationMs('5m'), 5 * 60 * 1000);
  });

  test('parses hours', () => {
    assert.strictEqual(parseDurationMs('2h'), 2 * 60 * 60 * 1000);
  });

  test('parses days', () => {
    assert.strictEqual(parseDurationMs('7d'), 7 * 24 * 60 * 60 * 1000);
  });

  test('parses weeks', () => {
    assert.strictEqual(parseDurationMs('1w'), 7 * 24 * 60 * 60 * 1000);
  });

  test('rejects invalid input', () => {
    assert.throws(() => parseDurationMs('10x'), /Invalid duration/);
    assert.throws(() => parseDurationMs('abc'), /Invalid duration/);
  });
});
