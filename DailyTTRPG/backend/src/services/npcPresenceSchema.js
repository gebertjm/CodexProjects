import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../config/db.js';
import { ensureEnvironmentSchema } from './environmentSchema.js';

let npcPresenceSchemaReady = false;

export async function ensureNpcPresenceSchema() {
  if (npcPresenceSchemaReady) {
    return;
  }

  await ensureEnvironmentSchema();

  const currentFile = fileURLToPath(import.meta.url);
  const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../db/init/028-stage-5j3-npc-schedules-presence.sql'
  );
  const sql = await fs.readFile(migrationPath, 'utf8');

  await query(sql);
  npcPresenceSchemaReady = true;
}

export function resetNpcPresenceSchemaForTests() {
  npcPresenceSchemaReady = false;
}
