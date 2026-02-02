/**
 * SDB - Validation utilities
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { errors } from './errors.js';

// Initialize Ajv with formats support
const ajv = new Ajv({ 
  allErrors: true, 
  strict: false,
  validateSchema: false,  // Don't validate the schema itself against metaschema
});
addFormats(ajv);

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate data against a JSON Schema
 */
export function validateAgainstSchema(
  data: unknown,
  schema: object
): ValidationResult {
  // Remove $schema meta field if present (it's just a declaration, not for validation)
  const schemaForValidation = { ...schema } as { [key: string]: unknown };
  delete schemaForValidation['$schema'];
  
  const validate = ajv.compile(schemaForValidation);
  const valid = validate(data);

  if (!valid && validate.errors) {
    return {
      valid: false,
      errors: validate.errors.map(err => {
        const path = err.instancePath || '';
        const message = err.message || 'Unknown error';
        return path ? `${path}: ${message}` : message;
      }),
    };
  }

  return { valid: true };
}

/**
 * Validate folder path is safe (no path traversal)
 */
export function validateFolderPath(path: string): void {
  if (!path || path.trim() === '') {
    throw errors.invalidInput('Folder path cannot be empty', { path });
  }

  // Check for path traversal attempts
  const normalized = path.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.includes('//')) {
    throw errors.invalidInput('Path traversal not allowed', { path });
  }

  // Check for dangerous patterns
  const dangerous = ['\0', '\n', '\r'];
  for (const char of dangerous) {
    if (path.includes(char)) {
      throw errors.invalidInput('Invalid characters in path', { path });
    }
  }
}

/**
 * Validate record ID format
 */
export function validateId(id: string): void {
  if (!id || id.trim() === '') {
    throw errors.invalidInput('ID cannot be empty', { id });
  }

  // IDs should be alphanumeric with possible underscores/hyphens
  // ULID format: 26 characters, uppercase alphanumeric
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw errors.invalidInput('ID contains invalid characters', { id });
  }

  if (id.length > 128) {
    throw errors.invalidInput('ID too long (max 128 characters)', { id, length: id.length });
  }
}

/**
 * Validate schema file is valid JSON Schema
 */
export function validateSchemaFile(schema: unknown): void {
  if (typeof schema !== 'object' || schema === null) {
    throw errors.invalidInput('Schema must be a JSON object', { type: typeof schema });
  }

  const schemaObj = schema as { [key: string]: unknown };

  // Basic JSON Schema structure validation
  if (schemaObj.type !== 'object') {
    throw errors.invalidInput("Schema must have type 'object'", { type: schemaObj.type });
  }

  if (!schemaObj.properties || typeof schemaObj.properties !== 'object') {
    throw errors.invalidInput('Schema must have properties defined', {});
  }
}

/**
 * Parse and validate field=value arguments
 */
export function parseFieldArgs(args: string[]): { [key: string]: unknown } {
  const fields: { [key: string]: unknown } = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    if (!key || !key.startsWith('--')) {
      throw errors.invalidInput(`Expected --field, got '${key}'`, { position: i });
    }

    const fieldName = key.slice(2);
    
    if (fieldName.startsWith('_')) {
      throw errors.invalidInput(`Cannot set reserved field '${fieldName}'`, { field: fieldName });
    }

    if (value === undefined) {
      throw errors.invalidInput(`Missing value for field '${fieldName}'`, { field: fieldName });
    }

    // Try to parse as JSON (for arrays, objects, numbers, booleans)
    try {
      fields[fieldName] = JSON.parse(value);
    } catch {
      // If not valid JSON, treat as string
      fields[fieldName] = value;
    }
  }

  return fields;
}

/**
 * Merge schema defaults into data
 */
export function applySchemaDefaults(
  data: { [key: string]: unknown },
  schema: { [key: string]: unknown }
): { [key: string]: unknown } {
  const result = { ...data };
  
  const properties = schema.properties as { [key: string]: { [key: string]: unknown } } | undefined;
  if (!properties) return result;

  for (const [key, prop] of Object.entries(properties)) {
    if (result[key] === undefined && prop.default !== undefined) {
      result[key] = prop.default;
    }
  }

  return result;
}
