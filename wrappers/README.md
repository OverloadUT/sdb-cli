# Wrappers

Wrappers are thin, agent-safe CLIs that expose only the operations needed for a specific dataset. The goal is to keep them extremely small and predictable so agents can use them safely and consistently.

## Philosophy

- Keep wrappers tiny. Prefer simple argument pass-through over custom parsing.
- Hard-code the database path to prevent accidental writes elsewhere.
- Expose only safe commands. Avoid `init` and any destructive flags unless explicitly intended.
- Provide wrapper-specific help so agents do not see the full SDB CLI.

## Pattern

Each wrapper should:

- Map a small set of commands to `sdb` (e.g. `add`, `list`, `update`, `complete`)
- Block unsafe flags (e.g. `--hard`) unless the wrapper explicitly supports them
- Translate friendly flags to SDB flags when appropriate (e.g. `--completed` -> `--include-deleted`)

## Example: `todo-list`

- Script: `wrappers/todo-list`
- Schema: `wrappers/todo-list.schema.json`
- Fixed DB path: `~/spectra/todo`

Usage:

```bash
todo-list add --title "Buy milk" --deadline 2026-02-10
todo-list list --sort updated --order desc
todo-list list --completed
todo-list update <id...> --title "Updated title"
todo-list complete <id...>
todo-list delete <id...>
```
