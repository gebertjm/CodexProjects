import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureActionComposerSchema } from '../src/services/actionComposerSchema.js';
import { ensureDialogueFocusCommitPersistenceSchema } from '../src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import {
  clearDialogueFocusCommitSceneRegistryForTests,
  registerDialogueFocusCommitSceneForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import { ensureExplorationInteractionSchema } from '../src/services/explorationInteractionSchema.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensurePlayerBeatResultSchema } from '../src/services/playerBeatResultService.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';
import { greyvaleDialogueFocusCommitScenes } from './fixtures/greyvale-dialogue-fixtures.js';

const tomasSceneId = 'greyvale_tomas_roadside_worries_dialogue';
const repoRoot = process.cwd().endsWith(`${path.sep}backend`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
  await ensureWebCharacterCreationSchema();
  await ensureActionComposerSchema();
  await ensureExplorationInteractionSchema();
  await ensurePlayerBeatResultSchema();
  await ensureDialogueFocusCommitPersistenceSchema();
  await importContentPackage(path.resolve(repoRoot, 'content/worlds/greyvale'));
  await query(
    `
      INSERT INTO dnd5e_npc (key, name, npc_type, disposition)
      VALUES
        ('elin-harrow', 'Elin Harrow', 'humanoid', 'neutral'),
        ('tomas-rell', 'Tomas Rell', 'humanoid', 'neutral'),
        ('mara-vellin', 'Mara Vellin', 'humanoid', 'neutral'),
        ('lysa-fen', 'Lysa Fen', 'humanoid', 'neutral'),
        ('garren-holt', 'Garren Holt', 'humanoid', 'neutral'),
        ('rusk-bandit', 'Rusk', 'humanoid', 'hostile')
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
  for (const scene of greyvaleDialogueFocusCommitScenes) {
    registerDialogueFocusCommitSceneForTests(scene);
  }
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
  return `lifecycle_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Lifecycle ${label}`,
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
      name: `Life ${label.replaceAll('_', ' ').slice(0, 24)}`,
      archetype_id: 'stalwart_fighter',
    }),
  });
  assert.equal(created.response.status, 201);
  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  return {
    ...player,
    characterId: Number(created.body.character.character_id),
  };
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

const forbiddenPlayerTerms = [
  'hidden_dc',
  'raw_roll',
  'total_result',
  'modifier_breakdown',
  'result_band',
  'selected_result_band',
  'branch_id',
  'hidden_requirements',
  'exact_failed_requirements',
  'gm_notes',
  'gm_debug_summary',
  'debug_summary',
  'state_reads',
  'state_writes',
  'raw_relationship',
  'relationship_audit',
  'old_value_json',
  'new_value_json',
  'matched_move_confidence',
  'preview_confidence',
  'routing_confidence',
  'preview_mapping',
  'path_harness',
  'debug_notices',
  'future_supported',
  'combat_routing',
  'hidden_clue_metadata',
  'gm_dev_content_ref',
  'raw_runtime_state',
  'duplicate key',
  'constraint',
  'stack',
];

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload);
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term), false, `${label} leaked ${term}`);
  }
}

function assertSafeLifecycleError(result, messagePattern = /moment has changed|conversation|not available/i) {
  assert.equal(result.response.status, 409);
  assert.match(result.body.error?.message ?? result.body.message ?? '', messagePattern);
  assertPlayerSafePayload(result.body, 'safe lifecycle error');
}

function availableCloserLook(scenePayload, preferredId = 'focus_broken_axle') {
  const closerLooks = scenePayload.scene_reference?.closer_looks ?? [];
  return (
    closerLooks.find((item) => preferredId && item.interaction_id === preferredId && item.is_available === true) ??
    closerLooks.find((item) => item.is_available === true)
  );
}

function committedFollowupInput(scenePayload) {
  const closerLook = availableCloserLook(scenePayload);
  assert.ok(closerLook, 'Greyvale scene should expose an available Closer Look');
  return {
    raw_text: `Inspect ${closerLook.label}`,
    selected_verb: 'investigate',
    continue_free_focus_interaction_id: closerLook.interaction_id,
  };
}

async function actionSubmissionCount(actionWindowId, characterId) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_web_action_submission
      WHERE action_window_id = $1
        AND character_id = $2
    `,
    [Number(actionWindowId), Number(characterId)]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function playerBeatResultCount(actionWindowId, characterId) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_player_beat_result
      WHERE action_window_id = $1
        AND character_id = $2
    `,
    [Number(actionWindowId), Number(characterId)]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function freeFocusResultCount({ campaignId, characterId, sceneId, interactionId }) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_character_exploration_interaction_result
      WHERE campaign_id = $1
        AND character_id = $2
        AND scene_id = $3
        AND interaction_id = $4
        AND resolution_mode = 'free_focus'
    `,
    [Number(campaignId), Number(characterId), Number(sceneId), interactionId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function socialMoveCount(player, dialogueSceneId) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_dialogue_social_move_record
      WHERE character_id = $1
        AND dialogue_scene_key = $2
    `,
    [player.characterId, dialogueSceneId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function runtimeStateFor(player, dialogueSceneId) {
  const result = await query(
    `
      SELECT id, value_json
      FROM dnd5e_dialogue_scene_state
      WHERE character_id = $1
        AND dialogue_scene_key = $2
        AND field_name = '__runtime_state__'
      ORDER BY id DESC
      LIMIT 1
    `,
    [player.characterId, dialogueSceneId]
  );
  return result.rows[0] ?? null;
}

test('Stage 6B.13.2 exploration preview, Free Focus, submit, duplicate, and resolution lifecycle is safe', async () => {
  const player = await createReadyPlayer('exploration_lifecycle');
  await grantDebugCapability(player);

  const current = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(current.response.status, 200);
  assert.equal(current.body.state, 'active');
  assert.equal(current.body.action_status.state, 'action_needed');
  assertPlayerSafePayload(current.body, 'initial current scene');

  const actionWindowId = current.body.action_status.action_window_id;
  const actionInput = committedFollowupInput(current.body);
  const closerLook = availableCloserLook(current.body);

  const preview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(actionInput),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.action_window_id, actionWindowId);
  assert.deepEqual(preview.body.lifecycle_context, {
    action_window_id: actionWindowId,
    submission_version: 0,
  });
  assert.equal(await actionSubmissionCount(actionWindowId, player.characterId), 0);
  assertPlayerSafePayload(preview.body, 'exploration preview');

  const focus = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: closerLook.interaction_id,
      scene_id: current.body.scene.scene_id,
    }),
  });
  assert.equal(focus.response.status, 200);
  assert.equal(await actionSubmissionCount(actionWindowId, player.characterId), 0);
  assert.equal(
    await freeFocusResultCount({
      campaignId: current.body.campaign_instance_id,
      characterId: player.characterId,
      sceneId: current.body.scene.scene_id,
      interactionId: closerLook.interaction_id,
    }),
    1
  );
  assertPlayerSafePayload(focus.body, 'free focus result');

  const reopenedFocus = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: closerLook.interaction_id,
      scene_id: current.body.scene.scene_id,
    }),
  });
  assert.equal(reopenedFocus.response.status, 200);
  assert.equal(await actionSubmissionCount(actionWindowId, player.characterId), 0);
  assert.equal(
    await freeFocusResultCount({
      campaignId: current.body.campaign_instance_id,
      characterId: player.characterId,
      sceneId: current.body.scene.scene_id,
      interactionId: closerLook.interaction_id,
    }),
    1
  );

  const submit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      ...actionInput,
      lifecycle_context: preview.body.lifecycle_context,
    }),
  });
  assert.equal(submit.response.status, 200);
  assert.equal(submit.body.status, 'submitted');
  assert.equal(submit.body.lifecycle_context.submission_version, 1);
  assert.equal(await actionSubmissionCount(actionWindowId, player.characterId), 1);
  assertPlayerSafePayload(submit.body, 'exploration submit');

  const duplicateSubmit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      ...actionInput,
      lifecycle_context: preview.body.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(duplicateSubmit, /moment has changed/i);
  assert.equal(await actionSubmissionCount(actionWindowId, player.characterId), 1);

  const debug = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(debug.response.status, 200);
  assert.ok(debug.body.exploration_mechanics_debug.submitted_action);
  assert.ok(debug.body.exploration_mechanics_debug.preview_mapping);

  const advanced = await request('/api/dev/advance-beat', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({}),
  });
  assert.equal(advanced.response.status, 200);
  assert.equal(advanced.body.status, 'advanced');
  assert.equal(await playerBeatResultCount(actionWindowId, player.characterId), 1);
  assert.notEqual(advanced.body.action_status.action_window_id, actionWindowId);
  assert.ok(['action_needed', 'action_submitted', 'waiting_for_next_beat'].includes(advanced.body.action_status.state));
  assertPlayerSafePayload(advanced.body.current_scene, 'current scene after advance');

  const staleOldWindowSubmit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      ...actionInput,
      lifecycle_context: preview.body.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(staleOldWindowSubmit, /moment has changed/i);
  assert.equal(await playerBeatResultCount(actionWindowId, player.characterId), 1);
});

test('Stage 6B.13.2 dialogue CQ, preview, submit, duplicate, and exit lifecycle is safe', async () => {
  const player = await createReadyPlayer('dialogue_lifecycle');

  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assertPlayerSafePayload(loaded.body, 'Tomas active dialogue');

  const question = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_bandit_pattern',
      lifecycle_context: {
        dialogue_scene_state_id: loaded.body.dialogue_scene_state.dialogue_scene_state_id,
        committed_social_move_count: 0,
      },
    }),
  });
  assert.equal(question.response.status, 200);
  assert.equal(question.body.status, 'resolved');
  assert.equal(await socialMoveCount(player, tomasSceneId), 0);
  assert.equal(question.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assertPlayerSafePayload(question.body, 'Tomas CQ result');

  const reopenedQuestion = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_bandit_pattern',
      lifecycle_context: question.body.lifecycle_context,
    }),
  });
  assert.equal(reopenedQuestion.response.status, 200);
  assert.equal(reopenedQuestion.body.status, 'already_resolved');
  assert.equal(await socialMoveCount(player, tomasSceneId), 0);

  const preview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence against his road pattern.',
      lifecycle_context: question.body.lifecycle_context,
    }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.lifecycle_context.committed_social_move_count, 0);
  assert.equal(Object.hasOwn(preview.body.preview, 'confidence'), false);
  assert.equal(await socialMoveCount(player, tomasSceneId), 0);
  assertPlayerSafePayload(preview.body, 'Tomas move preview');

  const submit = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence against his road pattern.',
      forced_outcome: 'success',
      lifecycle_context: preview.body.lifecycle_context,
    }),
  });
  assert.equal(submit.response.status, 200);
  assert.equal(submit.body.status, 'resolved');
  assert.equal(submit.body.lifecycle_context.committed_social_move_count, 1);
  assert.equal(await socialMoveCount(player, tomasSceneId), 1);
  assertPlayerSafePayload(submit.body, 'Tomas move submit');

  const duplicateSubmit = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence against his road pattern.',
      forced_outcome: 'success',
      lifecycle_context: preview.body.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(duplicateSubmit, /moment has changed/i);
  assert.equal(await socialMoveCount(player, tomasSceneId), 1);

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      exit_id: 'exit_return_to_common_room',
      lifecycle_context: submit.body.lifecycle_context,
    }),
  });
  assert.equal(exit.response.status, 200);
  assert.equal(exit.body.status, 'exited');
  assert.ok(exit.body.completed_dialogue_record?.completed_dialogue_record_id);
  assertPlayerSafePayload(exit.body, 'Tomas lifecycle exit');

  const state = await runtimeStateFor(player, tomasSceneId);
  assert.equal(state.value_json.status, 'exited');
  assert.equal(state.value_json.completed_dialogue_record_id, exit.body.completed_dialogue_record.completed_dialogue_record_id);
});

test('Stage 6B.13.2 stale lifecycle contexts and active dialogue conflicts are safely rejected', async () => {
  const player = await createReadyPlayer('cross_mode_policy');
  const current = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(current.response.status, 200);
  const actionInput = committedFollowupInput(current.body);
  const actionPreview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(actionInput),
  });
  assert.equal(actionPreview.response.status, 200);

  const dialogue = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(dialogue.response.status, 200);

  const blockedPreview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(actionInput),
  });
  assert.equal(blockedPreview.response.status, 200);
  assert.equal(blockedPreview.body.status, 'invalid');
  assert.match(blockedPreview.body.message, /active conversation/i);
  assertPlayerSafePayload(blockedPreview.body, 'active-dialogue preview block');

  const blockedSubmit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      ...actionInput,
      lifecycle_context: actionPreview.body.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(blockedSubmit, /active conversation/i);
  assert.equal(await actionSubmissionCount(current.body.action_status.action_window_id, player.characterId), 0);

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      exit_id: 'exit_return_to_common_room',
      lifecycle_context: {
        dialogue_scene_state_id: dialogue.body.dialogue_scene_state.dialogue_scene_state_id,
        committed_social_move_count: 0,
      },
    }),
  });
  assert.equal(exit.response.status, 200);

  const submitAfterExit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      ...actionInput,
      lifecycle_context: actionPreview.body.lifecycle_context,
    }),
  });
  assert.equal(submitAfterExit.response.status, 200);
  assert.equal(submitAfterExit.body.status, 'submitted');
  assert.equal(await actionSubmissionCount(current.body.action_status.action_window_id, player.characterId), 1);
  assertPlayerSafePayload(submitAfterExit.body, 'submit after dialogue exit');
});

test('Stage 6B.13.2 active character and campaign scoping rejects foreign lifecycle tokens', async () => {
  const playerA = await createReadyPlayer('scope_a');
  const playerB = await createReadyPlayer('scope_b');

  const currentA = await request('/api/play/current-scene', { headers: playerA.headers });
  assert.equal(currentA.response.status, 200);
  const previewA = await request('/api/play/action/preview', {
    method: 'POST',
    headers: playerA.headers,
    body: JSON.stringify(committedFollowupInput(currentA.body)),
  });
  assert.equal(previewA.response.status, 200);

  const foreignActionSubmit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: playerB.headers,
    body: JSON.stringify({
      ...committedFollowupInput(currentA.body),
      lifecycle_context: previewA.body.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(foreignActionSubmit, /moment has changed/i);
  assert.equal(await actionSubmissionCount(currentA.body.action_status.action_window_id, playerA.characterId), 0);

  const dialogueA = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: playerA.headers,
  });
  assert.equal(dialogueA.response.status, 200);
  const dialoguePreviewA = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: playerA.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_reassure_tomas',
      submitted_text: 'I reassure Tomas that partial information helps.',
      lifecycle_context: {
        dialogue_scene_state_id: dialogueA.body.dialogue_scene_state.dialogue_scene_state_id,
        committed_social_move_count: 0,
      },
    }),
  });
  assert.equal(dialoguePreviewA.response.status, 200);

  const foreignDialogueSubmit = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: playerB.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_reassure_tomas',
      submitted_text: 'I reassure Tomas that partial information helps.',
      lifecycle_context: dialoguePreviewA.body.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(foreignDialogueSubmit, /moment has changed/i);
  assert.equal(await socialMoveCount(playerA, tomasSceneId), 0);
  assert.equal(await socialMoveCount(playerB, tomasSceneId), 0);
});
