# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds TypeScript source. The CLI entry is `src/index.ts`, command handlers live in `src/commands/`, shared helpers in `src/lib/`, and shared types in `src/types.ts`.
- `tests/` contains TypeScript tests, split into `tests/unit/` and `tests/integration/`.
- `dist/` is compiled output produced by `tsc`. Do not edit `dist/` manually; rebuild instead.
- Top-level config: `package.json` (scripts/deps) and `tsconfig.json` (TS build settings).

## Build, Test, and Development Commands
- `npm run build` — compile TypeScript to `dist/` using `tsc`.
- `npm test` — run `npm run build` plus unit and integration tests.
- `npm run test:unit` — run unit tests with Node’s test runner (`node --test dist/tests/unit/**/*.test.js`).
- `npm run test:integration` — run integration tests with Node’s test runner.
- `node dist/src/index.js --help` — run the CLI locally after a build.

## Coding Style & Naming Conventions
- TypeScript (ESM) with `strict` enabled. Target is ES2022.
- Indentation is 2 spaces; use semicolons and single quotes as seen in `src/`.
- Test files are named `*.test.ts` and live under `tests/unit/` or `tests/integration/`.
- There is no enforced formatter/linter; keep changes consistent with existing files.

## Testing Guidelines
- Tests use Node’s built-in runner (`node:test`).
- Add coverage in the same layer you change (unit vs. integration).
- No explicit coverage threshold, but new behavior should be exercised by tests.

## Commit & Pull Request Guidelines
- Git history favors short, single-line messages (e.g., “Updates”, “fix”). There is no strict convention; keep messages concise and specific.
- PRs should include a brief summary, tests run (with commands), and any behavior changes. If CLI output changes, include a before/after snippet. Link related issues when applicable.
