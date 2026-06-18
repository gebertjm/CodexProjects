import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureDialogueFocusCommitPersistenceSchema } from '../src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import {
  clearDialogueFocusCommitSceneRegistryForTests,
  registerDialogueFocusCommitSceneForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';
import { validMinimalDialogueScene } from './fixtures/dialogue-focus-commit-fixtures.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
  await ensureWebCharacterCreationSchema();
  await ensureDialogueFocusCommitPersistenceSchema();
  await importContentPackage(path.resolve(process.cwd(), '../content/worlds/greyvale'));
  await query(
    `
      INSERT INTO dnd5e_npc (key, name, npc_type, disposition)
      VALUES ('elin-harrow', 'Elin Harrow', 'humanoid', 'neutral')
      ON CONFLICT (key) DO NOTHING
    `
  );
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test.beforeEach(() => {
  clearDialogueFocusCommitSceneRegistryForTests();
  registerDialogueFocusCommitSceneForTests(validMinimalDialogueScene);
});

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function firebaseToken(payload) {
  return `test-firebase:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

function authHeader(payload) {
  return {
    Authorization: `Bearer ${firebaseToken(payload)}`,
  };
}

function uniqueUid(label) {
  return `dialogue_debug_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Dialogue Debug ${label}`,
  });
  const me = await request('/api/me', { headers });
  assert.equal(me.response.status, 200);
  return { uid, headers, accountId: Number(me.body.account.account_id) };
}

async function createReadyPlayer(label) {
  const player = await createPlayer(label);
  const created = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      name: `Dialogue Debug ${label.replaceAll('_', ' ')}`,
      archetype_id: 'stalwart_fighter',
    }),
  });
  assert.equal(created.response.status, 201);
  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  return player;
}

async function grantDebugCapability(player) {
  await query(
    `
      UPDATE account
      SET can_advance_beats = TRUE
      WHERE id = $1
    `,
    [player.accountId]
  );
}

function assertPlayerSafePayload(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('preview_mapping'), false);
  assert.equal(text.includes('matched_move_confidence'), false);
  assert.equal(text.includes('old_value_json'), false);
  assert.equal(text.includes('raw_runtime_state'), false);
  assert.equal(text.includes('gm_dev_content_ref'), false);
}

test('Build 8 dialogue debug workspace rejects normal player accounts', async () => {
  const player = await createReadyPlayer('denied');
  const loaded = await request('/api/dev/dialogue-debug?dialogue_scene_id=dialogue_elin_memory_focus_commit', {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 403);
});

test('Build 8 dialogue debug workspace returns linked GM/dev panels behind capability guard', async () => {
  const player = await createReadyPlayer('allowed');
  await grantDebugCapability(player);

  const current = await request('/api/play/dialogue/current?dialogue_scene_id=dialogue_elin_memory_focus_commit', {
    headers: player.headers,
  });
  assert.equal(current.response.status, 200);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      move_id: 'move_listen_without_pressing',
      submitted_text: 'I listen without pressing.',
    }),
  });
  assert.equal(submitted.response.status, 200);

  const debug = await request('/api/dev/dialogue-debug?dialogue_scene_id=dialogue_elin_memory_focus_commit', {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.status, 'ok');
  assert.equal(debug.body.scene_state.dialogue_scene_id, 'dialogue_elin_memory_focus_commit');
  assert.ok(debug.body.availability.clarifying_questions.length >= 2);
  assert.ok(debug.body.availability.committed_social_moves.length >= 2);
  assert.ok(debug.body.availability.exits.length >= 1);
  assert.equal(debug.body.preview_mapping.matched_authored_move_id, 'move_listen_without_pressing');
  assert.equal(debug.body.preview_mapping.confidence, 1);
  assert.ok(debug.body.relationship_state.persistent_npc_state.length >= 1);
  assert.ok(debug.body.relationship_state.recent_writes.length >= 1);
  assert.ok(debug.body.transcript.turns.length >= 2);
  assert.ok(debug.body.audit_timeline.records.some((record) => record.event_type === 'committed_social_move_result'));
  assert.ok(debug.body.validation.hard_errors.length === 0);
  assert.match(debug.body.annotation_correction_chains.note, /GM\/dev review/);
  assert.match(debug.body.test_paths.note, /path harness/i);
  assert.ok(debug.body.test_paths.available_modes.includes('happy_path'));

  const playerFacing = await request('/api/play/dialogue/current?dialogue_scene_id=dialogue_elin_memory_focus_commit', {
    headers: player.headers,
  });
  assert.equal(playerFacing.response.status, 200);
  assertPlayerSafePayload(playerFacing.body);
});
