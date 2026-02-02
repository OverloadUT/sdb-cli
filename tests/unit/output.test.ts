/**
 * Unit tests for output utilities
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatRecordTable, formatIdsOutput, formatCount, formatSchemaHuman } from '../../src/lib/output.js';

describe('formatRecordTable', () => {
  test('formats empty array', () => {
    const result = formatRecordTable([]);
    assert.strictEqual(result, 'No records found.');
  });

  test('formats single record', () => {
    const records = [
      { _id: 'ABC123', _created: '', _updated: '', title: 'Test' }
    ];
    const result = formatRecordTable(records);
    assert.ok(result.includes('ABC123'));
    assert.ok(result.includes('title'));
    assert.ok(result.includes('Test'));
  });

  test('formats multiple records', () => {
    const records = [
      { _id: '1', _created: '', _updated: '', title: 'First' },
      { _id: '2', _created: '', _updated: '', title: 'Second' },
    ];
    const result = formatRecordTable(records);
    assert.ok(result.includes('1'));
    assert.ok(result.includes('2'));
    assert.ok(result.includes('First'));
    assert.ok(result.includes('Second'));
  });

  test('handles arrays in fields', () => {
    const records = [
      { _id: '1', _created: '', _updated: '', tags: ['a', 'b', 'c'] }
    ];
    const result = formatRecordTable(records);
    assert.ok(result.includes('a, b, c'));
  });
});

describe('formatIdsOutput', () => {
  test('formats empty array', () => {
    const result = formatIdsOutput([]);
    assert.strictEqual(result, '');
  });

  test('formats single id', () => {
    const records = [{ _id: 'ABC123', _created: '', _updated: '' }];
    const result = formatIdsOutput(records);
    assert.strictEqual(result, 'ABC123');
  });

  test('formats multiple ids', () => {
    const records = [
      { _id: 'A', _created: '', _updated: '' },
      { _id: 'B', _created: '', _updated: '' },
      { _id: 'C', _created: '', _updated: '' },
    ];
    const result = formatIdsOutput(records);
    assert.strictEqual(result, 'A\nB\nC');
  });
});

describe('formatCount', () => {
  test('formats count without filter', () => {
    const result = formatCount(42);
    assert.strictEqual(result, '42 record(s)');
  });

  test('formats count with filter', () => {
    const result = formatCount(10, '.status == "pending"');
    assert.strictEqual(result, '10 record(s) matching filter');
  });

  test('formats zero count', () => {
    const result = formatCount(0);
    assert.strictEqual(result, '0 record(s)');
  });
});

describe('formatSchemaHuman', () => {
  test('formats schema with properties', () => {
    const schema = {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Task title' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
      },
    };
    const result = formatSchemaHuman(schema);
    assert.ok(result.includes('title'));
    assert.ok(result.includes('priority'));
    assert.ok(result.includes('string'));
    assert.ok(result.includes('low | normal | high'));
    assert.ok(result.includes('* = required'));
  });

  test('handles empty schema', () => {
    const result = formatSchemaHuman({});
    assert.strictEqual(result, '');
  });
});
