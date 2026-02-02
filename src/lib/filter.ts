/**
 * SDB - Simple jq-like filter implementation
 * 
 * Supports a subset of jq syntax:
 * - select(.field == "value")
 * - select(.field != "value")
 * - select(.field == "value" and .other == "value2")
 * - select(.field == "value" or .other == "value2")
 * - select(.array | contains("item"))
 */

import { errors } from './errors.js';
import { SdbRecord } from '../types.js';

type FilterFn = (record: SdbRecord) => boolean;

/**
 * Parse a jq-like filter expression and return a filter function
 */
export function parseFilter(expression: string): FilterFn {
  const trimmed = expression.trim();

  // Empty filter matches everything
  if (!trimmed) {
    return () => true;
  }

  // Handle select() wrapper
  const selectMatch = trimmed.match(/^select\((.*)\)$/);
  if (selectMatch) {
    return parseCondition(selectMatch[1]);
  }

  // Direct condition
  return parseCondition(trimmed);
}

function parseCondition(condition: string): FilterFn {
  const trimmed = condition.trim();

  // Handle 'and' operator (lower precedence)
  const andParts = splitOnOperator(trimmed, ' and ');
  if (andParts.length > 1) {
    const filters = andParts.map(part => parseCondition(part));
    return (record) => filters.every(f => f(record));
  }

  // Handle 'or' operator (higher precedence than 'and')
  const orParts = splitOnOperator(trimmed, ' or ');
  if (orParts.length > 1) {
    const filters = orParts.map(part => parseCondition(part));
    return (record) => filters.some(f => f(record));
  }

  // Handle contains() for array membership
  const containsMatch = trimmed.match(/^\.(\w+)\s*\|\s*contains\(["'](.+?)["']\)$/);
  if (containsMatch) {
    const [, field, value] = containsMatch;
    return (record) => {
      const arr = record[field];
      return Array.isArray(arr) && arr.includes(value);
    };
  }

  // Handle comparison operators
  const comparisonMatch = trimmed.match(/^\.(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
  if (comparisonMatch) {
    const [, field, operator, valueStr] = comparisonMatch;
    const value = parseValue(valueStr);
    return createComparisonFilter(field, operator, value);
  }

  // Handle existence check: .field
  const existsMatch = trimmed.match(/^\.(\w+)$/);
  if (existsMatch) {
    const field = existsMatch[1];
    return (record) => record[field] !== undefined && record[field] !== null;
  }

  // Handle negation: not .field
  const notExistsMatch = trimmed.match(/^not\s+\.(\w+)$/);
  if (notExistsMatch) {
    const field = notExistsMatch[1];
    return (record) => record[field] === undefined || record[field] === null;
  }

  throw errors.invalidFilter(condition, 'Unrecognized filter syntax');
}

function splitOnOperator(str: string, operator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    // Track string boundaries
    if ((char === '"' || char === "'") && (i === 0 || str[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Track parentheses depth
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') depth--;
    }

    // Check for operator at top level
    if (!inString && depth === 0 && str.slice(i).startsWith(operator)) {
      parts.push(current.trim());
      current = '';
      i += operator.length - 1;
      continue;
    }

    current += char;
  }

  parts.push(current.trim());
  return parts.filter(p => p.length > 0);
}

function parseValue(valueStr: string): unknown {
  const trimmed = valueStr.trim();

  // String (quoted)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Null
  if (trimmed === 'null') return null;

  // Number
  const num = Number(trimmed);
  if (!isNaN(num)) return num;

  // Fallback: treat as string
  return trimmed;
}

function createComparisonFilter(
  field: string,
  operator: string,
  value: unknown
): FilterFn {
  return (record) => {
    const fieldValue = record[field];

    switch (operator) {
      case '==':
        return fieldValue === value;
      case '!=':
        return fieldValue !== value;
      case '>':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue > value;
      case '<':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue < value;
      case '>=':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue >= value;
      case '<=':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue <= value;
      default:
        return false;
    }
  };
}

/**
 * Apply a filter expression to records
 */
export function filterRecords(records: SdbRecord[], expression: string): SdbRecord[] {
  const filter = parseFilter(expression);
  return records.filter(filter);
}
