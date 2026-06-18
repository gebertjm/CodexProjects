import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../config/db.js';

let livingWorldSchemaReady = false;

export async function ensureLivingWorldSchema() {
  if (livingWorldSchemaReady) {
    return;
  }

  const currentFile = fileURLToPath(import.meta.url);
  const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../db/init/026-stage-5j1-living-world-state.sql'
  );
  const sql = await fs.readFile(migrationPath, 'utf8');

  await query(sql);
  livingWorldSchemaReady = true;
}

export function resetLivingWorldSchemaForTests() {
  livingWorldSchemaReady = false;
}
