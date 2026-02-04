/**
 * SDB - Record sorting/limiting helpers
 */

import { SdbRecord } from '../types.js';
import { errors } from './errors.js';

export type SortOrder = 'asc' | 'desc';

export function normalizeSortField(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed === 'created') return '_created';
  if (trimmed === 'updated') return '_updated';
  if (trimmed === 'deleted') return '_deleted';
  if (trimmed === 'id') return '_id';

  return trimmed;
}

export function normalizeSortOrder(input?: string): SortOrder {
  if (!input) return 'asc';
  const normalized = input.trim().toLowerCase();
  if (normalized === 'asc' || normalized === 'desc') return normalized;
  throw errors.invalidInput(`Invalid order '${input}'. Use 'asc' or 'desc'.`, { input });
}

export function parseLimit(input?: string): number | undefined {
  if (input === undefined) return undefined;
  const value = Number(input);
  if (!Number.isInteger(value) || value < 0) {
    throw errors.invalidInput(`Invalid limit '${input}'. Must be a non-negative integer.`, { input });
  }
  return value;
}

function compareValues(a: unknown, b: unknown, field: string): number {
  if (a === undefined || a === null) {
    return b === undefined || b === null ? 0 : 1;
  }
  if (b === undefined || b === null) return -1;

  if (field === '_created' || field === '_updated' || field === '_deleted') {
    const at = Date.parse(String(a));
    const bt = Date.parse(String(b));
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return at - bt;
  }

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;

  return String(a).localeCompare(String(b));
}

export function sortRecords(
  records: SdbRecord[],
  field: string,
  order: SortOrder
): SdbRecord[] {
  const dir = order === 'desc' ? -1 : 1;
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const cmp = compareValues(a.record[field], b.record[field], field);
      if (cmp !== 0) return cmp * dir;
      return a.index - b.index;
    })
    .map(item => item.record);
}

export function applyLimit(records: SdbRecord[], limit?: number): SdbRecord[] {
  if (limit === undefined) return records;
  return records.slice(0, limit);
}

export function filterRecordsByTime(
  records: SdbRecord[],
  field: string,
  withinMs: number,
  nowMs: number
): SdbRecord[] {
  const cutoff = nowMs - withinMs;
  return records.filter(record => {
    const value = record[field];
    if (!value) return false;
    const ts = Date.parse(String(value));
    if (Number.isNaN(ts)) return false;
    return ts >= cutoff;
  });
}
