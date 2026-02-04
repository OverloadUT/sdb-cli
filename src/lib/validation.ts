/**
 * SDB - Validation utilities
 */

import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { errors } from './errors.js';

// Initialize Ajv with formats support
const ajv = new Ajv({ 
  allErrors: true, 
  strict: false,
  validateSchema: false,  // Don't auto-validate schemas on compile
});
addFormats(ajv);

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

function formatAjvErrors(errs?: ErrorObject[] | null): string[] | undefined {
  if (!errs || errs.length === 0) return undefined;
  return errs.map(err => {
    const path = err.instancePath || '';
    const message = err.message || 'Unknown error';
    return path ? `${path}: ${message}` : message;
  });
}

export function compileSchemaValidator(schema: object): ValidateFunction {
  // Remove $schema meta field if present (it's just a declaration, not for validation)
  const schemaForValidation = { ...schema } as { [key: string]: unknown };
  delete schemaForValidation['$schema'];
  return ajv.compile(schemaForValidation);
}

export function validateWithValidator(
  data: unknown,
  validate: ValidateFunction
): ValidationResult {
  const valid = validate(data);

  if (!valid) {
    return { valid: false, errors: formatAjvErrors(validate.errors) };
  }

  return { valid: true };
}

/**
 * Validate data against a JSON Schema
 */
export function validateAgainstSchema(
  data: unknown,
  schema: object
): ValidationResult {
  const validate = compileSchemaValidator(schema);
  return validateWithValidator(data, validate);
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

  const properties = schemaObj.properties as { [key: string]: unknown };
  for (const key of Object.keys(properties)) {
    if (key.startsWith('_')) {
      throw errors.invalidInput(`Schema cannot define reserved field '${key}'`, { field: key });
    }
  }

  const required = Array.isArray(schemaObj.required) ? schemaObj.required : [];
  for (const key of required) {
    if (typeof key === 'string' && key.startsWith('_')) {
      throw errors.invalidInput(`Schema cannot require reserved field '${key}'`, { field: key });
    }
  }

  // Validate schema shape using Ajv's metaschema
  const schemaForValidation = { ...schemaObj } as { [key: string]: unknown };
  delete schemaForValidation['$schema'];
  const schemaValid = ajv.validateSchema(schemaForValidation);
  if (!schemaValid) {
    throw errors.invalidInput('Schema is not a valid JSON Schema', {
      errors: formatAjvErrors(ajv.errors),
    });
  }
}

/**
 * Parse and validate field=value arguments
 */
export function parseFieldArgs(args: string[]): { [key: string]: unknown } {
  const fields: { [key: string]: unknown } = {};

  for (let i = 0; i < args.length; i++) {
    const token = args[i];

    if (!token || !token.startsWith('--')) {
      throw errors.invalidInput(`Expected --field, got '${token}'`, { position: i });
    }

    // Support --field=value form
    const eqIndex = token.indexOf('=');
    const key = eqIndex === -1 ? token : token.slice(0, eqIndex);
    const fieldName = key.slice(2);

    if (fieldName.startsWith('_')) {
      throw errors.invalidInput(`Cannot set reserved field '${fieldName}'`, { field: fieldName });
    }

    let value: string | undefined;
    if (eqIndex !== -1) {
      value = token.slice(eqIndex + 1);
    } else {
      value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw errors.invalidInput(`Missing value for field '${fieldName}'`, { field: fieldName });
      }
      i += 1;
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
