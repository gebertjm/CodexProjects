import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../config/db.js';
import { ensureLivingWorldSchema } from './livingWorldSchema.js';

let environmentSchemaReady = false;

export async function ensureEnvironmentSchema() {
  if (environmentSchemaReady) {
    return;
  }

  await ensureLivingWorldSchema();

  const currentFile = fileURLToPath(import.meta.url);
  const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../db/init/027-stage-5j2-environment-context-overlays.sql'
  );
  const sql = await fs.readFile(migrationPath, 'utf8');

  await query(sql);
  environmentSchemaReady = true;
}

export function resetEnvironmentSchemaForTests() {
  environmentSchemaReady = false;
}
