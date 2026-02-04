# SDB (Spectra DB)

Local, file-based JSONL database CLI for AI agent workflows.

SDB keeps data in a folder on disk and exposes fast CRUD with schema validation, predictable JSON output, and safe writes.

## Install

```bash
npm install
npm run build
npm link
```

## Quick Start

```bash
sdb -v
sdb init ~/data/todos --schema ./todo-schema.json
sdb add ~/data/todos --title "Buy milk" --priority high
sdb list ~/data/todos --sort updated --order desc --limit 5
```

## Output Model

- Default output is JSON for machine parsing.
- `--human` switches to human-readable text.
- `--format table` is a human-readable alias for list output.

## Storage Layout

Each database folder contains:

- `schema.json` — JSON Schema
- `data.jsonl` — active records
- `data.deleted.jsonl` — soft-deleted records
- `.sdb.lock` — write lock

## Commands

`sdb init <folder> --schema <path>`  
Initialize a database folder.

`sdb add <folder> [--field value ...]`  
Add a record. Field arguments accept `--field value` and `--field=value`.

`sdb list <folder> [options]`  
List records with optional filtering, sorting, limits, and time windows.

Options:
- `--filter <expr>` — jq-like filter
- `--sort <field>` — `created`, `updated`, `id`, or any field
- `--order <order>` — `asc` (default) or `desc`
- `--limit <n>` — limit results
- `--created-within <duration>` — e.g. `7d`, `12h`
- `--updated-within <duration>` — e.g. `7d`, `12h`
- `--deleted-within <duration>` — requires `--include-deleted`
- `--include-deleted` — include soft-deleted records

`sdb get <folder> <id...>`  
Get one or more records by ID.

`sdb update <folder> <id...> [--field value ...]`  
Update one or more records.

`sdb delete <folder> <id...> [options]`  
Soft delete by default. Requires `--force`.

Options:
- `--hard` — permanent delete
- `--force` — required for destructive operations
- `--dry-run` — show planned actions

`sdb count <folder> [options]`  
Count records with optional filter and `--include-deleted`.

`sdb schema <folder>`  
Print the schema.

`sdb validate <folder>`  
Validate active records against the schema.

`sdb gc <folder> [options]`  
Garbage collect deleted records.

Options:
- `--age <duration>` — remove deleted records older than a duration
- `--all` — remove all deleted records
- `--force` — required for destructive operations
- `--dry-run` — show planned actions

## Filters

Supported expressions (subset of jq):

- Equality: `.status == "pending"`
- Inequality: `.status != "done"`
- Numeric: `.count > 10`
- Boolean: `.active == true`
- Logic: `.a == "x" and .b == "y"`
- Array: `.tags | contains("urgent")`
- Optional wrapper: `select(...)`

## Reserved Fields

SDB manages:
- `_id`, `_created`, `_updated`, `_deleted`

You cannot set these fields directly. Schemas cannot define or require fields starting with `_`.

## Exit Codes

- `0` success
- `1` general error
- `2` invalid usage or schema validation error
- `3` permission denied / safety check failed
- `4` resource not found

## Error Format

Errors are JSON to stderr:

```json
{
  "success": false,
  "error": {
    "code": "SCHEMA_VALIDATION_FAILED",
    "message": "Schema validation failed",
    "suggestion": "Check the data against the schema and correct any issues",
    "context": {
      "validationErrors": ["/priority: must be equal to one of the allowed values"]
    }
  }
}
```

## License

Internal Spectra tool. Not for distribution.
