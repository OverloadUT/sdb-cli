# SDB - Spectra Database

**A lightweight JSONL-based database CLI for agent operational data.**

SDB provides reliable CRUD operations with schema validation, collision protection via lock files, and human-readable storage format. Designed for AI agents that need to store structured operational data.

## Installation

```bash
# From the sdb directory
npm install
npm run build
npm link

# Verify installation
sdb --help
```

## Quick Start

```bash
# Show version
sdb --version

# Show help
sdb --help

# Initialize a database
sdb init ~/data/todos --schema ./todo-schema.json

# Add a record
sdb add ~/data/todos --title "Buy milk" --priority high

# List records
sdb list ~/data/todos

# Get a specific record
sdb get ~/data/todos 01HQ3VXYZ123

# Update a record
sdb update ~/data/todos 01HQ3VXYZ123 --status done

# Delete a record (soft delete)
sdb delete ~/data/todos 01HQ3VXYZ123 --force

# Count records
sdb count ~/data/todos --filter '.status == "pending"'
```

## Commands

### `sdb init <folder> --schema <path>`

Initialize a new database folder with a JSON Schema.

```bash
sdb init ~/data/todos --schema ./todo-schema.json
sdb init ~/data/todos --schema ./schema.json --force  # Overwrite existing
sdb init ~/data/todos --schema ./schema.json --dry-run
```

**Output:**
```json
{
  "success": true,
  "action": "initialized",
  "resource": {
    "type": "database",
    "path": "/Users/me/data/todos"
  }
}
```

### `sdb add <folder> [--field value ...]`

Add a new record to the database. Returns the generated `_id`.

```bash
sdb add ~/data/todos --title "Buy milk" --priority high
sdb add ~/data/todos --title "Review PR" --tags '["work","urgent"]'
sdb add ~/data/todos --title "Test" --dry-run
```

**Output:**
```json
{
  "success": true,
  "action": "created",
  "resource": {
    "type": "record",
    "id": "01HQ3VXYZ123ABC",
    "path": "/Users/me/data/todos/data.jsonl"
  },
  "data": {
    "_id": "01HQ3VXYZ123ABC",
    "_created": "2026-01-31T17:00:00.000Z",
    "_updated": "2026-01-31T17:00:00.000Z",
    "title": "Buy milk",
    "priority": "high"
  }
}
```

### `sdb list <folder> [options]`

List records from the database.

```bash
sdb list ~/data/todos
sdb list ~/data/todos --filter '.status == "pending"'
sdb list ~/data/todos --filter '.priority == "high" and .status != "done"'
sdb list ~/data/todos --format ids
sdb list ~/data/todos --include-deleted
sdb list ~/data/todos --human
```

**Options:**
- `--filter <expression>` - jq-like filter expression
- `--format <format>` - Output format: `json` (default), `table`, `ids`
- `--include-deleted` - Include soft-deleted records
- `--human` - Human-readable table output

### `sdb get <folder> <id>`

Get a single record by ID.

```bash
sdb get ~/data/todos 01HQ3VXYZ123ABC
sdb get ~/data/todos 01HQ3VXYZ123ABC --human
```

### `sdb update <folder> <id> [--field value ...]`

Update fields on an existing record.

```bash
sdb update ~/data/todos 01HQ3VXYZ123ABC --status done
sdb update ~/data/todos 01HQ3VXYZ123ABC --priority low --due 2026-02-01
sdb update ~/data/todos 01HQ3VXYZ123ABC --status done --dry-run
```

### `sdb delete <folder> <id> [options]`

Soft delete (or hard delete) a record. Requires `--force` flag.

```bash
sdb delete ~/data/todos 01HQ3VXYZ123ABC --force          # Soft delete
sdb delete ~/data/todos 01HQ3VXYZ123ABC --hard --force   # Permanent delete
sdb delete ~/data/todos 01HQ3VXYZ123ABC --force --dry-run
```

**Options:**
- `--force` - Required for destructive operations
- `--hard` - Permanently remove instead of soft delete
- `--dry-run` - Show what would happen

### `sdb count <folder> [options]`

Count records matching an optional filter.

```bash
sdb count ~/data/todos
sdb count ~/data/todos --filter '.status == "done"'
sdb count ~/data/todos --include-deleted
sdb count ~/data/todos --human
```

### `sdb schema <folder>`

Display the schema for a database.

```bash
sdb schema ~/data/todos
sdb schema ~/data/todos --human
```

### `sdb validate <folder>`

Validate all records against the schema.

```bash
sdb validate ~/data/todos
sdb validate ~/data/todos --human
```

**Output:**
```json
{
  "success": true,
  "action": "validated",
  "data": {
    "total": 100,
    "valid": 98,
    "invalid": 2,
    "issues": [
      {
        "id": "01HQ3VXYZ123ABC",
        "errors": ["/priority: must be equal to one of the allowed values"]
      }
    ]
  }
}
```

## Filter Expressions

SDB supports a subset of jq-like filter syntax:

```bash
# Equality
--filter '.status == "pending"'
--filter '.priority == "high"'

# Inequality
--filter '.status != "done"'

# Numeric comparisons
--filter '.count > 10'
--filter '.age >= 18'

# Boolean combinations
--filter '.status == "pending" and .priority == "high"'
--filter '.status == "done" or .status == "cancelled"'

# Array contains
--filter '.tags | contains("urgent")'

# With select() wrapper (optional)
--filter 'select(.status == "pending")'
```

## Schema Format

SDB uses standard JSON Schema format:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["title", "status"],
  "properties": {
    "title": {
      "type": "string",
      "description": "Task description"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "normal", "high", "urgent"],
      "default": "normal"
    },
    "status": {
      "type": "string",
      "enum": ["pending", "in-progress", "done", "cancelled"],
      "default": "pending"
    },
    "due": {
      "type": "string",
      "format": "date",
      "description": "Due date (YYYY-MM-DD)"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

## Reserved Fields

SDB automatically manages these fields:

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Unique identifier (ULID) |
| `_created` | ISO 8601 | Record creation timestamp |
| `_updated` | ISO 8601 | Last modification timestamp |
| `_deleted` | ISO 8601 | Soft delete timestamp (optional) |

You cannot set or modify reserved fields directly.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (operation failed) |
| 2 | Invalid usage (missing arguments, validation failed) |
| 3 | Permission denied or safety check failed |
| 4 | Resource not found |

## Error Codes

| Code | Description |
|------|-------------|
| `MISSING_REQUIRED_OPTION` | Required flag not provided |
| `INVALID_INPUT` | Input validation failed |
| `RESOURCE_NOT_FOUND` | Requested resource doesn't exist |
| `RESOURCE_EXISTS` | Resource already exists |
| `PERMISSION_DENIED` | Permission denied |
| `OPERATION_FAILED` | Operation failed |
| `SAFETY_CHECK_FAILED` | Destructive operation requires --force |
| `SCHEMA_VALIDATION_FAILED` | Data doesn't match schema |
| `LOCK_FAILED` | Could not acquire database lock |
| `INVALID_FILTER` | Filter expression is invalid |
| `DATABASE_NOT_INITIALIZED` | Database folder not initialized |

## Error Output Format

All errors are structured JSON to stderr:

```json
{
  "success": false,
  "error": {
    "code": "SCHEMA_VALIDATION_FAILED",
    "message": "Schema validation failed",
    "suggestion": "Check the data against the schema and correct any issues",
    "context": {
      "validationErrors": ["/priority: must be equal to one of the allowed values"],
      "data": { "title": "Test", "priority": "invalid" }
    }
  }
}
```

Use `--debug` to include stack traces:

```bash
sdb add ~/data/todos --title "Test" --debug
```

## Lock File Protocol

SDB uses lock files to prevent concurrent write corruption:

1. Before write: Create `.sdb.lock` in database folder
2. If lock exists and is >30 seconds old: Remove stale lock
3. If lock exists and is fresh: Wait briefly, then fail
4. Perform write operation atomically (temp file + rename)
5. Release lock

Lock file contents for debugging:
```json
{"pid": 12345, "timestamp": "2026-01-31T17:00:00Z", "operation": "update"}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Link for local development
npm link
```

## Examples

### Initialize a todo database

```bash
# Create schema file
cat > todo-schema.json << 'EOF'
{
  "type": "object",
  "required": ["title"],
  "properties": {
    "title": { "type": "string" },
    "priority": { "type": "string", "enum": ["low", "normal", "high"], "default": "normal" },
    "status": { "type": "string", "enum": ["pending", "done"], "default": "pending" },
    "due": { "type": "string", "format": "date" }
  }
}
EOF

# Initialize database
sdb init ./todos --schema todo-schema.json
```

### Add and manage tasks

```bash
# Add tasks
sdb add ./todos --title "Buy groceries" --priority high
sdb add ./todos --title "Write report" --due 2026-02-01

# List pending tasks
sdb list ./todos --filter '.status == "pending"'

# Mark task as done
ID=$(sdb list ./todos --format ids | head -1)
sdb update ./todos $ID --status done

# Count completed
sdb count ./todos --filter '.status == "done"' --human
```

### Dry-run mode

```bash
# See what would happen without executing
sdb add ./todos --title "Test" --dry-run
sdb delete ./todos ABC123 --force --dry-run
```

### Human-readable output

```bash
sdb list ./todos --human
sdb schema ./todos --human
sdb count ./todos --human
```

## License

Internal Spectra tool. Not for distribution.
