import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../../config/db.js';
import { ensureExplorationInteractionSchema } from '../explorationInteractionSchema.js';

let dialogueFocusCommitPersistenceSchemaReady = false;

export async function ensureDialogueFocusCommitPersistenceSchema() {
  if (dialogueFocusCommitPersistenceSchemaReady) {
    return;
  }

  await ensureExplorationInteractionSchema();

  const currentFile = fileURLToPath(import.meta.url);
  const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../../db/init/033-stage-dialogue-focus-commit-persistence.sql'
  );
  const sql = await fs.readFile(migrationPath, 'utf8');
  await query(sql);
  dialogueFocusCommitPersistenceSchemaReady = true;
}

export function resetDialogueFocusCommitPersistenceSchemaForTests() {
  dialogueFocusCommitPersistenceSchemaReady = false;
}
