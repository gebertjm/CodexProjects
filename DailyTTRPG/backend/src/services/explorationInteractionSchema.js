import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../config/db.js';
import { ensurePlayerBeatResultSchema } from './playerBeatResultService.js';

let explorationInteractionSchemaReady = false;

export async function ensureExplorationInteractionSchema() {
  if (explorationInteractionSchemaReady) {
    return;
  }

  await ensurePlayerBeatResultSchema();

  const currentFile = fileURLToPath(import.meta.url);
  const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../db/init/032-stage-6b9-exploration-interactions.sql'
  );
  const sql = await fs.readFile(migrationPath, 'utf8');
  await query(sql);
  explorationInteractionSchemaReady = true;
}

export function resetExplorationInteractionSchemaForTests() {
  explorationInteractionSchemaReady = false;
}
