/**
 * SDB - Spectra Database Types
 */

// Reserved fields managed by SDB
export interface ReservedFields {
  _id: string;
  _created: string; // ISO 8601
  _updated: string; // ISO 8601
  _deleted?: string; // ISO 8601, optional (soft delete)
}

// A complete record includes reserved fields + user data
export interface SdbRecord extends ReservedFields {
  [key: string]: unknown;
}

// Lock file contents
export interface LockFile {
  pid: number;
  timestamp: string; // ISO 8601
  operation: string;
  [key: string]: unknown; // Allow passing to generic object functions
}

// Output formats
export type OutputFormat = 'json' | 'table' | 'ids';

// Success response structure
export interface SuccessResponse {
  success: true;
  action: string;
  resource?: {
    type: string;
    id?: string;
    path?: string;
  };
  data?: unknown;
  metadata?: { [key: string]: unknown };
  dryRun?: boolean;
  operations?: Array<{
    type: string;
    path: string;
    sizeBytes?: number;
  }>;
}

// Error response structure  
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    suggestion: string;
    context?: { [key: string]: unknown };
    stack?: string;
  };
}

// Error codes enum
export enum ErrorCode {
  MISSING_REQUIRED_OPTION = 'MISSING_REQUIRED_OPTION',
  INVALID_INPUT = 'INVALID_INPUT',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_EXISTS = 'RESOURCE_EXISTS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  OPERATION_FAILED = 'OPERATION_FAILED',
  SAFETY_CHECK_FAILED = 'SAFETY_CHECK_FAILED',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  LOCK_FAILED = 'LOCK_FAILED',
  INVALID_FILTER = 'INVALID_FILTER',
  DATABASE_NOT_INITIALIZED = 'DATABASE_NOT_INITIALIZED',
}

// Exit codes
export enum ExitCode {
  SUCCESS = 0,
  GENERAL_ERROR = 1,
  INVALID_USAGE = 2,
  PERMISSION_DENIED = 3,
  NOT_FOUND = 4,
}

// Command options
export interface AddOptions {
  dryRun?: boolean;
  human?: boolean;
  debug?: boolean;
  [key: string]: unknown;
}

export interface ListOptions {
  filter?: string;
  format?: OutputFormat;
  human?: boolean;
  debug?: boolean;
  includeDeleted?: boolean;
  sort?: string;
  order?: string;
  limit?: string | number;
  createdWithin?: string;
  updatedWithin?: string;
  deletedWithin?: string;
}

export interface GetOptions {
  human?: boolean;
  debug?: boolean;
}

export interface UpdateOptions {
  dryRun?: boolean;
  human?: boolean;
  debug?: boolean;
  [key: string]: unknown;
}

export interface DeleteOptions {
  hard?: boolean;
  dryRun?: boolean;
  force?: boolean;
  human?: boolean;
  debug?: boolean;
}

export interface CountOptions {
  filter?: string;
  human?: boolean;
  debug?: boolean;
  includeDeleted?: boolean;
}

export interface InitOptions {
  schema: string;
  force?: boolean;
  dryRun?: boolean;
  human?: boolean;
  debug?: boolean;
}

export interface SchemaOptions {
  human?: boolean;
  debug?: boolean;
}

export interface ValidateOptions {
  human?: boolean;
  debug?: boolean;
}

export interface GcOptions {
  age?: string;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  human?: boolean;
  debug?: boolean;
}
