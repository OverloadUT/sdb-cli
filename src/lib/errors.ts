/**
 * SDB - Error handling utilities
 */

import { ErrorCode, ErrorResponse, ExitCode } from '../types.js';

let debugMode = false;

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

export class SdbError extends Error {
  public readonly code: ErrorCode;
  public readonly suggestion: string;
  public readonly context: { [key: string]: unknown };
  public readonly exitCode: ExitCode;

  constructor(
    code: ErrorCode,
    message: string,
    suggestion: string,
    context: { [key: string]: unknown } = {},
    exitCode: ExitCode = ExitCode.GENERAL_ERROR
  ) {
    super(message);
    this.name = 'SdbError';
    this.code = code;
    this.suggestion = suggestion;
    this.context = context;
    this.exitCode = exitCode;
  }

  toResponse(): ErrorResponse {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        suggestion: this.suggestion,
        context: this.context,
      },
    };

    if (debugMode && this.stack) {
      response.error.stack = this.stack;
    }

    return response;
  }
}

export function outputError(error: SdbError): never {
  console.error(JSON.stringify(error.toResponse(), null, 2));
  process.exit(error.exitCode);
}

export function outputUnexpectedError(err: unknown): never {
  // If it's already an SdbError, use its exit code and response
  if (err instanceof SdbError) {
    console.error(JSON.stringify(err.toResponse(), null, 2));
    process.exit(err.exitCode);
  }
  
  const error = new SdbError(
    ErrorCode.OPERATION_FAILED,
    err instanceof Error ? err.message : String(err),
    'Check the error details and try again',
    {},
    ExitCode.GENERAL_ERROR
  );

  if (debugMode && err instanceof Error && err.stack) {
    error.stack = err.stack;
  }

  console.error(JSON.stringify(error.toResponse(), null, 2));
  process.exit(ExitCode.GENERAL_ERROR);
}

// Common error factories
export const errors = {
  missingRequiredOption: (option: string, command: string): SdbError =>
    new SdbError(
      ErrorCode.MISSING_REQUIRED_OPTION,
      `Missing required option: ${option}`,
      `Run 'sdb ${command} --help' for usage`,
      { command, missingOption: option },
      ExitCode.INVALID_USAGE
    ),

  invalidInput: (message: string, context: { [key: string]: unknown } = {}): SdbError =>
    new SdbError(
      ErrorCode.INVALID_INPUT,
      message,
      'Check the input format and try again',
      context,
      ExitCode.INVALID_USAGE
    ),

  resourceNotFound: (type: string, id: string, path?: string): SdbError =>
    new SdbError(
      ErrorCode.RESOURCE_NOT_FOUND,
      `${type} '${id}' not found`,
      path ? `Check if the path exists: ${path}` : 'Verify the ID and try again',
      { type, id, path },
      ExitCode.NOT_FOUND
    ),

  recordsNotFound: (ids: string[], path?: string): SdbError =>
    new SdbError(
      ErrorCode.RESOURCE_NOT_FOUND,
      `Records not found: ${ids.join(', ')}`,
      path ? `Check if the path exists: ${path}` : 'Verify the IDs and try again',
      { ids, path },
      ExitCode.NOT_FOUND
    ),

  resourceExists: (type: string, id: string, path: string): SdbError =>
    new SdbError(
      ErrorCode.RESOURCE_EXISTS,
      `${type} '${id}' already exists`,
      'Use --force to overwrite, or choose a different ID',
      { type, id, path },
      ExitCode.GENERAL_ERROR
    ),

  schemaValidationFailed: (errors: unknown[], context: { [key: string]: unknown } = {}): SdbError =>
    new SdbError(
      ErrorCode.SCHEMA_VALIDATION_FAILED,
      'Schema validation failed',
      'Check the data against the schema and correct any issues',
      { validationErrors: errors, ...context },
      ExitCode.INVALID_USAGE
    ),

  lockFailed: (path: string, existingLock?: { [key: string]: unknown }): SdbError =>
    new SdbError(
      ErrorCode.LOCK_FAILED,
      'Failed to acquire database lock',
      'Another process may be writing. Wait and try again, or remove stale lock',
      { path, existingLock },
      ExitCode.GENERAL_ERROR
    ),

  databaseNotInitialized: (folder: string): SdbError =>
    new SdbError(
      ErrorCode.DATABASE_NOT_INITIALIZED,
      `Database not initialized at '${folder}'`,
      `Run 'sdb init ${folder} --schema <schema-file>' to initialize`,
      { folder },
      ExitCode.NOT_FOUND
    ),

  safetyCheckFailed: (operation: string, resource: string, command: string): SdbError =>
    new SdbError(
      ErrorCode.SAFETY_CHECK_FAILED,
      'Destructive operation requires --force flag',
      `Run with --force to confirm ${operation}`,
      { operation, resource, command },
      ExitCode.PERMISSION_DENIED
    ),

  invalidFilter: (filter: string, error: string): SdbError =>
    new SdbError(
      ErrorCode.INVALID_FILTER,
      `Invalid filter expression: ${error}`,
      'Check filter syntax. Use simple expressions like .field == "value"',
      { filter, parseError: error },
      ExitCode.INVALID_USAGE
    ),

  operationFailed: (operation: string, message: string, context: { [key: string]: unknown } = {}): SdbError =>
    new SdbError(
      ErrorCode.OPERATION_FAILED,
      message,
      `Check permissions and try again`,
      { operation, ...context },
      ExitCode.GENERAL_ERROR
    ),
};
