/**
 * SDB - Schema command
 * Display the schema for a database
 */

import { SchemaOptions, SuccessResponse } from '../types.js';
import { getDatabasePaths, ensureDatabaseExists, loadSchema } from '../lib/fs.js';
import { outputSuccess, outputHumanSuccess, formatSchemaHuman } from '../lib/output.js';

export async function schemaCommand(
  folder: string,
  options: SchemaOptions
): Promise<void> {
  const paths = getDatabasePaths(folder);
  ensureDatabaseExists(paths);

  const schema = loadSchema(paths);

  const response: SuccessResponse = {
    success: true,
    action: 'retrieved',
    resource: {
      type: 'schema',
      path: paths.schemaFile,
    },
    data: schema,
  };

  if (options.human) {
    outputHumanSuccess(formatSchemaHuman(schema));
  } else {
    outputSuccess(response);
  }
}
