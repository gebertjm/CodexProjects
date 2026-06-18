import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../config/db.js';
import { ensureNpcPresenceSchema } from './npcPresenceSchema.js';

let actionComposerSchemaReady = false;

export async function ensureActionComposerSchema() {
  if (actionComposerSchemaReady) {
    return;
  }

  await ensureNpcPresenceSchema();

  const currentFile = fileURLToPath(import.meta.url);
  const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../db/init/029-stage-6b5-action-composer.sql'
  );
  const beatWindowMigrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../db/init/030-stage-6b5-beat-window-model.sql'
  );
  const sql = [
    await fs.readFile(migrationPath, 'utf8'),
    await fs.readFile(beatWindowMigrationPath, 'utf8'),
  ].join('\n\n');

  await query(sql);
  actionComposerSchemaReady = true;
}

export function resetActionComposerSchemaForTests() {
  actionComposerSchemaReady = false;
}
