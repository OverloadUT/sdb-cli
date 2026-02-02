/**
 * Unit tests for filter utilities
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseFilter, filterRecords } from '../../src/lib/filter.js';

describe('parseFilter', () => {
  test('empty filter matches all', () => {
    const filter = parseFilter('');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', name: 'test' }), true);
  });

  test('equality comparison', () => {
    const filter = parseFilter('.status == "pending"');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'pending' }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'done' }), false);
  });

  test('inequality comparison', () => {
    const filter = parseFilter('.status != "done"');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'pending' }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'done' }), false);
  });

  test('select() wrapper', () => {
    const filter = parseFilter('select(.priority == "high")');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', priority: 'high' }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', priority: 'low' }), false);
  });

  test('and operator', () => {
    const filter = parseFilter('.status == "pending" and .priority == "high"');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'pending', priority: 'high' }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'pending', priority: 'low' }), false);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'done', priority: 'high' }), false);
  });

  test('or operator', () => {
    const filter = parseFilter('.status == "pending" or .status == "in-progress"');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'pending' }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'in-progress' }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', status: 'done' }), false);
  });

  test('numeric comparison', () => {
    const filter = parseFilter('.count > 10');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', count: 15 }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', count: 5 }), false);
  });

  test('contains for arrays', () => {
    const filter = parseFilter('.tags | contains("urgent")');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', tags: ['urgent', 'work'] }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', tags: ['normal'] }), false);
  });

  test('boolean comparison', () => {
    const filter = parseFilter('.active == true');
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', active: true }), true);
    assert.strictEqual(filter({ _id: '1', _created: '', _updated: '', active: false }), false);
  });
});

describe('filterRecords', () => {
  const records = [
    { _id: '1', _created: '', _updated: '', title: 'Buy milk', status: 'pending', priority: 'high' },
    { _id: '2', _created: '', _updated: '', title: 'Review PR', status: 'done', priority: 'normal' },
    { _id: '3', _created: '', _updated: '', title: 'Write docs', status: 'pending', priority: 'normal' },
    { _id: '4', _created: '', _updated: '', title: 'Fix bug', status: 'in-progress', priority: 'high' },
  ];

  test('filters by status', () => {
    const result = filterRecords(records, '.status == "pending"');
    assert.strictEqual(result.length, 2);
    assert.ok(result.every(r => r.status === 'pending'));
  });

  test('filters by multiple conditions', () => {
    const result = filterRecords(records, '.status == "pending" and .priority == "high"');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]._id, '1');
  });

  test('empty filter returns all', () => {
    const result = filterRecords(records, '');
    assert.strictEqual(result.length, 4);
  });

  test('no matches returns empty array', () => {
    const result = filterRecords(records, '.status == "cancelled"');
    assert.strictEqual(result.length, 0);
  });
});
