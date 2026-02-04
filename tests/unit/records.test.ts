/**
 * Unit tests for record helpers
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { sortRecords, normalizeSortField, normalizeSortOrder, parseLimit, filterRecordsByTime } from '../../src/lib/records.js';

describe('normalizeSortField', () => {
  test('maps aliases', () => {
    assert.strictEqual(normalizeSortField('created'), '_created');
    assert.strictEqual(normalizeSortField('updated'), '_updated');
    assert.strictEqual(normalizeSortField('id'), '_id');
  });
});

describe('normalizeSortOrder', () => {
  test('defaults to asc', () => {
    assert.strictEqual(normalizeSortOrder(undefined), 'asc');
  });

  test('accepts asc/desc', () => {
    assert.strictEqual(normalizeSortOrder('asc'), 'asc');
    assert.strictEqual(normalizeSortOrder('desc'), 'desc');
  });
});

describe('parseLimit', () => {
  test('parses integer', () => {
    assert.strictEqual(parseLimit('10'), 10);
  });

  test('allows zero', () => {
    assert.strictEqual(parseLimit('0'), 0);
  });

  test('rejects invalid', () => {
    assert.throws(() => parseLimit('-1'), /Invalid limit/);
    assert.throws(() => parseLimit('abc'), /Invalid limit/);
  });
});

describe('sortRecords', () => {
  test('sorts by field asc', () => {
    const records = [
      { _id: '1', _created: '', _updated: '', title: 'B' },
      { _id: '2', _created: '', _updated: '', title: 'A' },
    ];
    const result = sortRecords(records, 'title', 'asc');
    assert.strictEqual(result[0].title, 'A');
  });

  test('sorts by field desc', () => {
    const records = [
      { _id: '1', _created: '', _updated: '', title: 'B' },
      { _id: '2', _created: '', _updated: '', title: 'A' },
    ];
    const result = sortRecords(records, 'title', 'desc');
    assert.strictEqual(result[0].title, 'B');
  });
});

describe('filterRecordsByTime', () => {
  test('filters by created within', () => {
    const now = Date.now();
    const recent = new Date(now - 1000).toISOString();
    const old = new Date(now - 10 * 60 * 1000).toISOString();
    const records = [
      { _id: '1', _created: recent, _updated: '' },
      { _id: '2', _created: old, _updated: '' },
    ];
    const result = filterRecordsByTime(records as any, '_created', 5 * 60 * 1000, now);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]._id, '1');
  });
});
