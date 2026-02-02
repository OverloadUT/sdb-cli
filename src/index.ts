#!/usr/bin/env node

/**
 * SDB - Spectra Database
 * A lightweight JSONL-based database CLI for agent operational data.
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { setDebugMode, outputUnexpectedError } from './lib/errors.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { getCommand } from './commands/get.js';
import { updateCommand } from './commands/update.js';
import { deleteCommand } from './commands/delete.js';
import { countCommand } from './commands/count.js';
import { schemaCommand } from './commands/schema.js';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { OutputFormat } from './types.js';

// Load package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', '..', 'package.json');
let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  version = pkg.version;
} catch {
  // Use default version
}

const program = new Command();

program
  .name('sdb')
  .description('Spectra Database - JSONL-based database CLI for agent operational data')
  .version(version)
  .option('--debug', 'Include stack traces in error output');

// Global options handling
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.debug) {
    setDebugMode(true);
  }
});

// ============================================================================
// ADD command
// ============================================================================
program
  .command('add <folder>')
  .description('Add a new record to the database')
  .option('--dry-run', 'Show what would happen without executing')
  .option('--human', 'Output human-readable text instead of JSON')
  .option('--debug', 'Include stack traces in errors')
  .allowUnknownOption(true)
  .action(async (folder: string, options, command) => {
    try {
      // Extract field arguments (everything after known options)
      const fieldArgs = command.args.slice(1); // Skip folder
      await addCommand(folder, fieldArgs, {
        dryRun: options.dryRun,
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// LIST command
// ============================================================================
program
  .command('list <folder>')
  .description('List records from the database')
  .option('--filter <expression>', 'Filter expression (jq-like syntax)')
  .option('--format <format>', 'Output format: json, table, ids', 'json')
  .option('--include-deleted', 'Include soft-deleted records')
  .option('--human', 'Output human-readable table')
  .option('--debug', 'Include stack traces in errors')
  .action(async (folder: string, options) => {
    try {
      await listCommand(folder, {
        filter: options.filter,
        format: options.format as OutputFormat,
        includeDeleted: options.includeDeleted,
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// GET command
// ============================================================================
program
  .command('get <folder> <id>')
  .description('Get a single record by ID')
  .option('--human', 'Output human-readable text')
  .option('--debug', 'Include stack traces in errors')
  .action(async (folder: string, id: string, options) => {
    try {
      await getCommand(folder, id, {
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// UPDATE command
// ============================================================================
program
  .command('update <folder> <id>')
  .description('Update fields on an existing record')
  .option('--dry-run', 'Show what would happen without executing')
  .option('--human', 'Output human-readable text')
  .option('--debug', 'Include stack traces in errors')
  .allowUnknownOption(true)
  .action(async (folder: string, id: string, options, command) => {
    try {
      // Extract field arguments
      const fieldArgs = command.args.slice(2); // Skip folder and id
      await updateCommand(folder, id, fieldArgs, {
        dryRun: options.dryRun,
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// DELETE command
// ============================================================================
program
  .command('delete <folder> <id>')
  .description('Soft delete a record (or hard delete with --hard)')
  .option('--hard', 'Permanently remove the record')
  .option('--force', 'Confirm destructive operation')
  .option('--dry-run', 'Show what would happen without executing')
  .option('--human', 'Output human-readable text')
  .option('--debug', 'Include stack traces in errors')
  .action(async (folder: string, id: string, options) => {
    try {
      await deleteCommand(folder, id, {
        hard: options.hard,
        force: options.force,
        dryRun: options.dryRun,
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// COUNT command
// ============================================================================
program
  .command('count <folder>')
  .description('Count records matching an optional filter')
  .option('--filter <expression>', 'Filter expression (jq-like syntax)')
  .option('--include-deleted', 'Include soft-deleted records')
  .option('--human', 'Output human-readable text')
  .option('--debug', 'Include stack traces in errors')
  .action(async (folder: string, options) => {
    try {
      await countCommand(folder, {
        filter: options.filter,
        includeDeleted: options.includeDeleted,
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// SCHEMA command
// ============================================================================
program
  .command('schema <folder>')
  .description('Display the schema for this database')
  .option('--human', 'Output human-readable format')
  .option('--debug', 'Include stack traces in errors')
  .action(async (folder: string, options) => {
    try {
      await schemaCommand(folder, {
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// INIT command
// ============================================================================
program
  .command('init <folder>')
  .description('Initialize a new database folder with a schema')
  .requiredOption('--schema <path>', 'Path to JSON Schema file')
  .option('--force', 'Overwrite existing database')
  .option('--dry-run', 'Show what would happen without executing')
  .option('--human', 'Output human-readable text')
  .option('--debug', 'Include stack traces in errors')
  .action(async (folder: string, options) => {
    try {
      await initCommand(folder, {
        schema: options.schema,
        force: options.force,
        dryRun: options.dryRun,
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// ============================================================================
// VALIDATE command
// ============================================================================
program
  .command('validate <folder>')
  .description('Validate all records against the schema')
  .option('--human', 'Output human-readable format')
  .option('--debug', 'Include stack traces in errors')
  .action(async (folder: string, options) => {
    try {
      await validateCommand(folder, {
        human: options.human,
        debug: options.debug,
      });
    } catch (err) {
      outputUnexpectedError(err);
    }
  });

// Parse and execute
program.parse();
