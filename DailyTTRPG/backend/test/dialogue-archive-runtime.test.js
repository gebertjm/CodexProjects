import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { query } from '../src/config/db.js';
import app from '../src/app.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { getGmDevDialogueArchiveRecord } from '../src/services/dialogueFocusCommit/dialogueArchiveService.js';
import { ensureDialogueFocusCommitPersistenceSchema } from '../src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import {
  clearDialogueFocusCommitSceneRegistryForTests,
  registerDialogueFocusCommitSceneForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';
import {
  cloneFixture,
  validMinimalDialogueScene,
} from './fixtures/dialogue-focus-commit-fixtures.js';

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
  return `dialogue_archive_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Dialogue Archive ${label}`,
  });
  const me = await request('/api/me', { headers });
  assert.equal(me.response.status, 200);
  return { uid, headers, accountId: Number(me.body.account.account_id) };
}

async function createQuickCharacter(player, name, archetypeId = 'stalwart_fighter') {
  const created = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      name,
      archetype_id: archetypeId,
    }),
  });
  assert.equal(created.response.status, 201);
  return created.body.character;
}

async function createReadyPlayer(label) {
  const player = await createPlayer(label);
  await createQuickCharacter(player, `Dialogue ${label.replaceAll('_', ' ')}`);
  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  return player;
}

async function activeCharacterId(player) {
  const result = await query('SELECT active_character_id FROM account WHERE id = $1', [player.accountId]);
  return Number(result.rows[0].active_character_id);
}

async function playDialogueToExit(player, sceneId = 'dialogue_elin_memory_focus_commit') {
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${encodeURIComponent(sceneId)}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  const transcriptId = loaded.body.dialogue_scene_state.transcript_id;
  assert.ok(transcriptId);

  const clarified = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      question_id: 'clarify_first_memory',
    }),
  });
  assert.equal(clarified.response.status, 200);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      move_id: 'move_listen_without_pressing',
      submitted_text: 'I listen without pressing.',
    }),
  });
  assert.equal(submitted.response.status, 200);

  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      exit_id: 'exit_return_to_inn',
    }),
  });
  assert.equal(exited.response.status, 200);
  assert.equal(exited.body.status, 'exited');
  assert.ok(exited.body.completed_dialogue_record?.completed_dialogue_record_id);
  return {
    transcriptId,
    completedRecordId: exited.body.completed_dialogue_record.completed_dialogue_record_id,
    exitBody: exited.body,
  };
}

function assertPlayerSafePayload(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('preview_debug_json'), false);
  assert.equal(text.includes('matched_move_confidence'), false);
  assert.equal(text.includes('old_value_json'), false);
  assert.equal(text.includes('new_value_json'), false);
  assert.equal(text.includes('secret_requirement'), false);
  assert.equal(text.includes('hidden relationship'), false);
  assert.equal(text.includes('gm_dev_content_ref_json'), false);
}

test('Build 6 transcript turns are appended for surface, Clarifying Questions, social moves, exit, and summary', async () => {
  const player = await createReadyPlayer('turns');
  const { transcriptId, completedRecordId } = await playDialogueToExit(player);
  const turns = await query(
    `
      SELECT turn_type, player_facing_content_json
      FROM dnd5e_dialogue_turn
      WHERE transcript_id = $1
      ORDER BY turn_index ASC, id ASC
    `,
    [transcriptId]
  );
  const turnTypes = turns.rows.map((turn) => turn.turn_type);
  assert.deepEqual(turnTypes, [
    'npc_surface',
    'clarifying_question',
    'clarifying_answer',
    'committed_social_move',
    'social_move_result',
    'exit',
    'system_summary',
  ]);
  assert.match(JSON.stringify(turns.rows), /wheel cracking/i);
  assert.match(JSON.stringify(turns.rows), /breathing steadies/i);
  assert.match(JSON.stringify(turns.rows), /Elin shared what she could remember/i);

  const completed = await query('SELECT transcript_id, compact_summary FROM dnd5e_completed_dialogue_record WHERE id = $1', [
    completedRecordId,
  ]);
  assert.equal(String(completed.rows[0].transcript_id), String(transcriptId));
  assert.equal(completed.rows[0].compact_summary, 'Elin shared what she could remember without exposing hidden-only notes.');
});

test('Build 6 non-canonical Clarifying Question is transcripted without campaign history spam', async () => {
  const player = await createReadyPlayer('history_boundary');
  const { transcriptId } = await playDialogueToExit(player);
  const characterId = await activeCharacterId(player);

  const transcript = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_dialogue_turn
      WHERE transcript_id = $1
        AND turn_type = 'clarifying_answer'
        AND player_facing_content_json::text ILIKE '%wheel cracking%'
    `,
    [transcriptId]
  );
  assert.equal(transcript.rows[0].count, 1);

  const history = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_gameplay_history
      WHERE character_id = $1
        AND summary ILIKE '%wheel cracking%'
    `,
    [characterId]
  );
  assert.equal(history.rows[0].count, 0);
});

test('Build 7 current dialogue transcript returns active player-facing turns', async () => {
  const player = await createReadyPlayer('active_transcript');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=dialogue_elin_memory_focus_commit`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);

  const clarified = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      question_id: 'clarify_first_memory',
    }),
  });
  assert.equal(clarified.response.status, 200);

  const transcript = await request(
    '/api/play/dialogue/transcript/current?dialogue_scene_id=dialogue_elin_memory_focus_commit',
    {
      headers: player.headers,
    }
  );
  assert.equal(transcript.response.status, 200);
  assert.equal(transcript.body.transcript.dialogue_scene_id, 'dialogue_elin_memory_focus_commit');
  const turnTypes = transcript.body.transcript.turns.map((turn) => turn.turn_type);
  assert.ok(turnTypes.includes('npc_surface'));
  assert.ok(turnTypes.includes('clarifying_answer'));
  assertPlayerSafePayload(transcript.body);
});

test('Build 6 player archive and search expose only player-facing dialogue records', async () => {
  const player = await createReadyPlayer('archive_search');
  const { completedRecordId } = await playDialogueToExit(player);

  const archive = await request('/api/play/dialogue/archive', {
    headers: player.headers,
  });
  assert.equal(archive.response.status, 200);
  assert.ok(archive.body.records.some((record) => record.completed_dialogue_record_id === String(completedRecordId)));
  assertPlayerSafePayload(archive.body);

  const record = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(record.response.status, 200);
  assert.equal(record.body.record.completed_dialogue_record_id, String(completedRecordId));
  assert.ok(record.body.record.transcript_turns.length >= 7);
  assert.ok(record.body.record.transcript_turns.some((turn) => turn.turn_type === 'clarifying_answer'));
  assertPlayerSafePayload(record.body);

  const search = await request('/api/play/dialogue/search?q=Elin%20shared', {
    headers: player.headers,
  });
  assert.equal(search.response.status, 200);
  assert.ok(search.body.results.some((result) => result.completed_dialogue_record_id === String(completedRecordId)));
  assertPlayerSafePayload(search.body);
});

test('Build 6 conservative generated summary excludes hidden/debug-only material', async () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.id = 'dialogue_generated_summary';
  scene.slug = 'dialogue-generated-summary';
  delete scene.summary_behavior;
  delete scene.completed_dialogue_record.compact_summary;
  delete scene.completed_dialogue_record.summary;
  scene.committed_social_moves[1].preview.secret_requirement = 'hidden relationship state must not appear';
  scene.committed_social_moves[1].preview.debug_route = 'preview confidence should stay hidden';
  scene.committed_social_moves[1].no_check_result.text = 'She settles enough to describe the road without naming any hidden truth.';
  registerDialogueFocusCommitSceneForTests(scene);

  const player = await createReadyPlayer('generated_summary');
  const { completedRecordId } = await playDialogueToExit(player, 'dialogue_generated_summary');
  const record = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(record.response.status, 200);
  assert.match(record.body.record.compact_summary, /describe the road/i);
  assert.equal(JSON.stringify(record.body).includes('hidden relationship state'), false);
  assert.equal(JSON.stringify(record.body).includes('preview confidence'), false);

  const row = await query(
    'SELECT player_facing_metadata_json FROM dnd5e_completed_dialogue_record WHERE id = $1',
    [completedRecordId]
  );
  assert.equal(row.rows[0].player_facing_metadata_json.summary_source, 'conservative_generated');
});

test('Build 6 completed record stores recap hooks and GM/dev boundary remains explicit', async () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.id = 'dialogue_recap_hook';
  scene.slug = 'dialogue-recap-hook';
  scene.npc_profile_recap = {
    enabled: true,
    apply_timing: 'on_dialogue_finalization',
  };
  registerDialogueFocusCommitSceneForTests(scene);

  const player = await createReadyPlayer('recap_hook');
  const { completedRecordId } = await playDialogueToExit(player, 'dialogue_recap_hook');

  const record = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(record.response.status, 200);
  assert.ok(record.body.record.metadata.npc_profile_recap_hooks.length >= 1);
  assert.equal(JSON.stringify(record.body).includes('old_value_json'), false);

  const gmDev = await getGmDevDialogueArchiveRecord(Number(completedRecordId));
  assert.equal(String(gmDev.record.id), String(completedRecordId));
  assert.ok(Array.isArray(gmDev.gm_dev.relationship_audit_links));
  assert.ok(gmDev.transcript_turns.length >= 7);
});
