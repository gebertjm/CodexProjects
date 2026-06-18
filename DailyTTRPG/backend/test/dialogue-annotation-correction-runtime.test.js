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
  return `dialogue_lifecycle_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Dialogue Lifecycle ${label}`,
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
      name: `Dialogue Lifecycle ${label.replaceAll('_', ' ')}`,
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

async function playDialogueToExit(player, sceneId = 'dialogue_elin_memory_focus_commit') {
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${encodeURIComponent(sceneId)}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);

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
  assert.ok(exited.body.completed_dialogue_record?.completed_dialogue_record_id);
  return {
    completedRecordId: exited.body.completed_dialogue_record.completed_dialogue_record_id,
  };
}

function assertPlayerSafePayload(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('pending_review'), false);
  assert.equal(text.includes('rejected'), false);
  assert.equal(text.includes('suppressed'), false);
  assert.equal(text.includes('relationship_audit'), false);
  assert.equal(text.includes('preview_confidence'), false);
  assert.equal(text.includes('raw_audit_log'), false);
}

test('Build 9 lifecycle records stay linked, reviewable, and player-safe', async () => {
  const player = await createReadyPlayer('runtime');
  await grantDebugCapability(player);
  const { completedRecordId } = await playDialogueToExit(player);

  const chain = await request('/api/dev/dialogue-lifecycle/chain', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      target_type: 'completed_dialogue_record',
      target_id: completedRecordId,
      chain_type: 'mixed',
    }),
  });
  assert.equal(chain.response.status, 201);
  const chainId = chain.body.chain.chain_id;

  const pending = await request('/api/dev/dialogue-lifecycle/annotation', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      chain_id: chainId,
      record_type: 'suggestion',
      review_status: 'pending_review',
      lifecycle_status: 'draft',
      original_text: 'This pending note should remain hidden.',
      source_event_links: [{ source_type: 'completed_dialogue_summary' }],
      affected_surfaces: ['completed_dialogue_archive'],
    }),
  });
  assert.equal(pending.response.status, 201);

  const hiddenArchive = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(hiddenArchive.response.status, 200);
  assert.equal(JSON.stringify(hiddenArchive.body).includes('pending note'), false);
  assertPlayerSafePayload(hiddenArchive.body);

  const approved = await request('/api/dev/dialogue-lifecycle/review', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      record_kind: 'annotation',
      record_id: pending.body.record.record_id,
      action: 'approve_with_edits',
      edited_text: 'Later reflection: Elin seemed certain about the sound of the wheel cracking.',
      player_facing: true,
    }),
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.record.review_status, 'approved_with_edits');

  const visibleArchive = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(visibleArchive.response.status, 200);
  assert.match(JSON.stringify(visibleArchive.body), /Later reflection: Elin seemed certain/);
  assert.equal(visibleArchive.body.record.compact_summary, 'Elin shared what she could remember without exposing hidden-only notes.');
  assertPlayerSafePayload(visibleArchive.body);

  const search = await request('/api/play/dialogue/search?q=Later%20reflection', {
    headers: player.headers,
  });
  assert.equal(search.response.status, 200);
  assert.ok(search.body.results.some((result) => result.completed_dialogue_record_id === String(completedRecordId)));

  const unsafeGenerated = await request('/api/dev/dialogue-lifecycle/correction', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      chain_id: chainId,
      record_type: 'generated_correction',
      review_status: 'generated',
      lifecycle_status: 'draft',
      original_text: 'Generated from hidden audit data.',
      source_event_links: [{ source_type: 'relationship_audit' }],
    }),
  });
  assert.equal(unsafeGenerated.response.status, 400);

  const correction = await request('/api/dev/dialogue-lifecycle/correction', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      chain_id: chainId,
      record_type: 'generated_correction',
      review_status: 'generated',
      lifecycle_status: 'draft',
      original_text: 'This generated correction should be rejected.',
      source_event_links: [{ source_type: 'player_facing_transcript_turn' }],
    }),
  });
  assert.equal(correction.response.status, 201);

  const missingScope = await request('/api/dev/dialogue-lifecycle/review', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      record_kind: 'correction',
      record_id: correction.body.record.record_id,
      action: 'suppress',
    }),
  });
  assert.equal(missingScope.response.status, 400);

  const rejected = await request('/api/dev/dialogue-lifecycle/review', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      record_kind: 'correction',
      record_id: correction.body.record.record_id,
      action: 'reject',
      rejection_reason: 'Not material to player understanding.',
    }),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.record.review_status, 'rejected');

  const replacement = await request('/api/dev/dialogue-lifecycle/review', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      record_kind: 'annotation',
      record_id: pending.body.record.record_id,
      action: 'replace',
      replacement_text: 'Updated understanding: Elin remembers the wheel crack, but not who caused it.',
      player_facing: true,
    }),
  });
  assert.equal(replacement.response.status, 200);
  assert.equal(replacement.body.replaced_record_id, pending.body.record.record_id);

  const updatedArchive = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(updatedArchive.response.status, 200);
  assert.match(JSON.stringify(updatedArchive.body), /Updated understanding: Elin remembers/);
  assert.equal(JSON.stringify(updatedArchive.body).includes('Later reflection: Elin seemed certain'), false);
  assertPlayerSafePayload(updatedArchive.body);

  const retracted = await request('/api/dev/dialogue-lifecycle/review', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      record_kind: 'annotation',
      record_id: replacement.body.record.record_id,
      action: 'retract',
      retraction_reason: 'Later canonical evidence contradicted this note.',
    }),
  });
  assert.equal(retracted.response.status, 200);
  assert.equal(retracted.body.record.lifecycle_status, 'retracted');

  const afterRetraction = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(afterRetraction.response.status, 200);
  assert.equal(JSON.stringify(afterRetraction.body).includes('Updated understanding: Elin remembers'), false);
  assertPlayerSafePayload(afterRetraction.body);

  const debug = await request('/api/dev/dialogue-debug?dialogue_scene_id=dialogue_elin_memory_focus_commit', {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  const debugText = JSON.stringify(debug.body.annotation_correction_chains);
  assert.match(debugText, /pending_review|approved_with_edits|rejected|retracted/);
  assert.match(debugText, /Not material to player understanding/);
  assert.match(debugText, /Later canonical evidence contradicted/);
});

test('Build 9 lifecycle APIs are guarded by GM/dev capability', async () => {
  const player = await createReadyPlayer('guarded');
  const { completedRecordId } = await playDialogueToExit(player);

  const denied = await request('/api/dev/dialogue-lifecycle/chain', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      target_type: 'completed_dialogue_record',
      target_id: completedRecordId,
      chain_type: 'annotation',
    }),
  });
  assert.equal(denied.response.status, 403);
});
