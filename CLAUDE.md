# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm test             # Build + run all tests
npm run test:unit    # Run unit tests only (requires build first)
npm run test:integration  # Run integration tests only (requires build first)
npm link             # Install sdb CLI globally for local testing
```

Run a single test file:
```bash
node --test dist/tests/unit/filter.test.js
```

## What is SDB?

SDB (Spectra DB) is a local, file-based JSONL database CLI for AI agent workflows. It provides CRUD operations with JSON Schema validation, predictable JSON output, and safe atomic writes.

## Architecture

### Source Structure

- `src/index.ts` - CLI entry point using Commander.js, registers all commands
- `src/types.ts` - Core types: `SdbRecord`, `ErrorCode`, `ExitCode`, response interfaces, command options
- `src/commands/` - One file per command (add, get, list, update, delete, count, init, schema, validate, gc)
- `src/lib/` - Shared utilities:
  - `errors.ts` - `SdbError` class and factory functions (`errors.resourceNotFound()`, `errors.safetyCheckFailed()`, etc.)
  - `fs.ts` - Database paths, lock protocol, atomic writes, record loading/writing
  - `validation.ts` - Ajv schema validation, field argument parsing, path validation
  - `filter.ts` - jq-like filter parser supporting `==`, `!=`, `>`, `<`, `and`, `or`, `contains()`
  - `records.ts` - Sorting, limiting, and time-based filtering of records
  - `time.ts` - Duration parsing (e.g., `7d`, `12h`, `30m`)
  - `output.ts` - JSON and human-readable output formatting, table rendering

### Database Layout

Each database is a folder containing:
- `schema.json` - JSON Schema for record validation
- `data.jsonl` - Active records as JSON lines
- `data.deleted.jsonl` - Soft-deleted records
- `.sdb.lock` - Lock file during writes (2 minute stale timeout)

### Key Patterns

**Error handling**: Commands throw `SdbError` instances. The CLI catches these and outputs structured JSON to stderr with appropriate exit codes (0=success, 1=error, 2=invalid/validation, 3=permission, 4=not found).

**Reserved fields**: Records have auto-managed fields: `_id` (ULID), `_created`, `_updated`, `_deleted`. Users cannot set these directly; schemas cannot define them.

**Atomic writes**: Write operations use `withLock()` which acquires `.sdb.lock`, writes to temp file, renames atomically, then releases lock.

**Output modes**: Commands support `--human` for human-readable output vs default JSON. Responses use `SuccessResponse` or `ErrorResponse` types.

**Safety checks**: Destructive operations (delete, gc) require `--force`. Support `--dry-run` to preview changes.
