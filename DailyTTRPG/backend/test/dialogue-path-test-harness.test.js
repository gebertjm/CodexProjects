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
  return `dialogue_harness_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Dialogue Harness ${label}`,
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
      name: `Dialogue Harness ${label.replaceAll('_', ' ')}`,
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
  assert.equal(text.includes('raw_runtime_state'), false);
  assert.equal(text.includes('preview_mapping'), false);
  assert.equal(text.includes('old_value_json'), false);
  assert.equal(text.includes('new_value_json'), false);
  assert.equal(text.includes('relationship_audit'), false);
  assert.equal(text.includes('preview_confidence'), false);
}

test('Build 10 path harness rejects normal player accounts', async () => {
  const player = await createReadyPlayer('denied');
  const denied = await request('/api/dev/dialogue-path-test/run', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      mode: 'validation_only',
    }),
  });
  assert.equal(denied.response.status, 403);
});

test('Build 10 validation-only mode reports validation without active mutation acknowledgement', async () => {
  const player = await createReadyPlayer('validation');
  await grantDebugCapability(player);
  const result = await request('/api/dev/dialogue-path-test/run', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      mode: 'validation_only',
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, 'passed');
  assert.equal(result.body.final_status, 'validated');
  assert.ok(result.body.built_in_modes.some((mode) => mode.mode === 'happy_path'));
  assert.equal(result.body.mutates_active_context, false);
});

test('Build 10 happy path uses real runtime services and reports transcript, relationship, completion, and lifecycle effects', async () => {
  const player = await createReadyPlayer('happy');
  await grantDebugCapability(player);
  const result = await request('/api/dev/dialogue-path-test/run', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      path_name: 'custom happy with lifecycle',
      allow_active_runtime_mutation: true,
      steps: [
        { id: 'enter', type: 'enter_dialogue' },
        {
          id: 'ask',
          type: 'ask_clarifying_question',
          question_id: 'clarify_first_memory',
        },
        {
          id: 'preview',
          type: 'preview_committed_social_move',
          move_id: 'move_listen_without_pressing',
          submitted_text: 'I listen without pressing.',
        },
        {
          id: 'submit',
          type: 'submit_committed_social_move',
          move_id: 'move_listen_without_pressing',
          submitted_text: 'I listen without pressing.',
        },
        { id: 'exit', type: 'resolve_exit', exit_id: 'exit_return_to_inn' },
        { id: 'lifecycle', type: 'simulate_lifecycle_probe' },
      ],
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, 'passed');
  assert.equal(result.body.used_real_runtime_services, true);
  assert.equal(result.body.mutates_active_context, true);
  assert.equal(result.body.final_status, 'exited');
  assert.deepEqual(result.body.final_transition, {
    target_type: 'exploration',
    target_id: 'grey_road_inn_common_room',
  });

  const askStep = result.body.steps.find((step) => step.step_id === 'ask');
  assert.equal(askStep.status, 'pass');
  assert.equal(askStep.player_facing_snapshot.committed_social_move_count, 0);

  const submitStep = result.body.steps.find((step) => step.step_id === 'submit');
  assert.equal(submitStep.status, 'pass');
  assert.ok(submitStep.relationship_diffs.length >= 1);
  assert.ok(submitStep.transcript_effects.new_turns.some((turn) => turn.turn_type === 'social_move_result'));

  const exitStep = result.body.steps.find((step) => step.step_id === 'exit');
  assert.equal(exitStep.status, 'pass');
  assert.ok(exitStep.completed_record_effect.created);
  assert.equal(exitStep.completed_record_effect.compact_summary, 'Elin shared what she could remember without exposing hidden-only notes.');

  const lifecycleStep = result.body.steps.find((step) => step.step_id === 'lifecycle');
  assert.equal(lifecycleStep.result.pending_hidden_from_player, true);
  assert.equal(lifecycleStep.result.approved_visible_to_player, true);
  assertPlayerSafePayload(result.body.steps.map((step) => step.player_facing_snapshot));
});

test('Build 10 forced failure and fallback modes exercise authored branches deterministically', async () => {
  const failurePlayer = await createReadyPlayer('failure');
  await grantDebugCapability(failurePlayer);
  const failure = await request('/api/dev/dialogue-path-test/run', {
    method: 'POST',
    headers: failurePlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      mode: 'failure_path',
      allow_active_runtime_mutation: true,
    }),
  });
  assert.equal(failure.response.status, 200);
  assert.equal(failure.body.status, 'passed');
  assert.match(JSON.stringify(failure.body.steps), /Elin withdraws from the question|She closes down/);
  assert.ok(
    failure.body.steps.some((step) =>
      JSON.stringify(step.result).includes('"outcome":"failure"') ||
      JSON.stringify(step.result).includes('"branch":"failure"')
    )
  );

  const fallbackPlayer = await createReadyPlayer('fallback');
  await grantDebugCapability(fallbackPlayer);
  const fallback = await request('/api/dev/dialogue-path-test/run', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      mode: 'fallback_path',
      allow_active_runtime_mutation: true,
    }),
  });
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.status, 'passed');
  assert.match(JSON.stringify(fallback.body.steps), /generic_fallback_preview|authored fallback.*exhausted/i);
  assertPlayerSafePayload(fallback.body.steps.map((step) => step.player_facing_snapshot));
});

test('Build 10 active mutation must be acknowledged for runtime path modes', async () => {
  const player = await createReadyPlayer('ack');
  await grantDebugCapability(player);
  const result = await request('/api/dev/dialogue-path-test/run', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      mode: 'happy_path',
    }),
  });
  assert.equal(result.response.status, 409);
});
