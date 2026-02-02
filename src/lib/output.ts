/**
 * SDB - Output formatting utilities
 */

import { SuccessResponse, SdbRecord } from '../types.js';

export function outputSuccess(response: SuccessResponse): void {
  console.log(JSON.stringify(response, null, 2));
}

export function outputHumanSuccess(message: string): void {
  console.log(message);
}

export function formatRecordTable(records: SdbRecord[]): string {
  if (records.length === 0) {
    return 'No records found.';
  }

  // Get all unique keys from all records (excluding reserved fields for cleaner output)
  const reservedFields = ['_id', '_created', '_updated', '_deleted'];
  const allKeys = new Set<string>();
  
  for (const record of records) {
    Object.keys(record).forEach(key => {
      if (!reservedFields.includes(key) || key === '_id') {
        allKeys.add(key);
      }
    });
  }

  // Always put _id first
  const keys = ['_id', ...Array.from(allKeys).filter(k => k !== '_id').sort()];

  // Calculate column widths
  const widths: { [key: string]: number } = {};
  for (const key of keys) {
    widths[key] = key.length;
    for (const record of records) {
      const value = formatCellValue(record[key]);
      widths[key] = Math.max(widths[key], value.length);
    }
  }

  // Build table
  const lines: string[] = [];
  
  // Header
  const header = keys.map(k => k.padEnd(widths[k])).join(' | ');
  lines.push(header);
  lines.push(keys.map(k => '-'.repeat(widths[k])).join('-+-'));

  // Rows
  for (const record of records) {
    const row = keys.map(k => formatCellValue(record[k]).padEnd(widths[k])).join(' | ');
    lines.push(row);
  }

  return lines.join('\n');
}

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatIdsOutput(records: SdbRecord[]): string {
  return records.map(r => r._id).join('\n');
}

export function formatSchemaHuman(schema: unknown): string {
  if (typeof schema !== 'object' || schema === null) {
    return 'Invalid schema';
  }

  const lines: string[] = [];
  const schemaObj = schema as { [key: string]: unknown };

  if (schemaObj.properties && typeof schemaObj.properties === 'object') {
    const properties = schemaObj.properties as { [key: string]: { [key: string]: unknown } };
    const required = Array.isArray(schemaObj.required) ? schemaObj.required : [];

    lines.push('Fields:');
    for (const [name, prop] of Object.entries(properties)) {
      const isRequired = required.includes(name);
      const type = prop.type || 'any';
      const enumValues = prop.enum ? ` (${(prop.enum as string[]).join(' | ')})` : '';
      const description = prop.description ? ` - ${prop.description}` : '';
      const requiredMarker = isRequired ? ' *' : '';
      
      lines.push(`  ${name}${requiredMarker}: ${type}${enumValues}${description}`);
    }
    
    if (required.length > 0) {
      lines.push('');
      lines.push('* = required');
    }
  }

  return lines.join('\n');
}

export function formatValidationResults(
  total: number,
  valid: number,
  issues: Array<{ id: string; errors: string[] }>
): string {
  const lines: string[] = [];
  
  lines.push(`Validation Results: ${valid}/${total} records valid`);
  
  if (issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of issues) {
      lines.push(`  ${issue.id}:`);
      for (const error of issue.errors) {
        lines.push(`    - ${error}`);
      }
    }
  }
  
  return lines.join('\n');
}

export function formatCount(count: number, filter?: string): string {
  if (filter) {
    return `${count} record(s) matching filter`;
  }
  return `${count} record(s)`;
}
