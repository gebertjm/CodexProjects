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
const maraSceneId = 'greyvale_mara_dunmere_pressure_dialogue';
const lysaSceneId = 'greyvale_lysa_grief_suspicion_dialogue';
const garrenSceneId = 'greyvale_garren_path_knowledge_dialogue';
const ruskSceneId = 'greyvale_rusk_at_the_shrine_dialogue';
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
  return `gm_dev_visibility_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `GM Dev Visibility ${label}`,
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
      name: `Vis ${label.replaceAll('_', ' ').slice(0, 24)}`,
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
  'exploration_mechanics_debug',
  'visibility_boundaries',
  'hidden_dc',
  'raw_roll',
  'total_result',
  'modifier_breakdown',
  'result_bands',
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
  'expected_path',
  'debug_notices',
  'future_supported',
  'combat_routing',
  'hidden_clue_metadata',
  'gm_dev_content_ref',
  'raw_runtime_state',
  'truth_label',
  'final_mystery',
  'database constraint',
  'duplicate key',
  'stack',
];

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload);
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term), false, `${label} leaked ${term}`);
  }
}

function assertExplorationDebugPayload(debug) {
  for (const section of [
    'scene_state',
    'surface_context',
    'passive_discoveries',
    'free_focus_items',
    'beat_action_options',
    'submitted_action',
    'preview_mapping',
    'check_details',
    'result_bands',
    'environment_modifiers',
    'npc_presence',
    'state_reads',
    'state_writes',
    'knowledge_outputs',
    'history_outputs',
    'transitions',
    'audit_timeline',
    'validation',
    'visibility_boundaries',
  ]) {
    assert.ok(Object.hasOwn(debug, section), `missing exploration debug section ${section}`);
  }
  assert.equal(debug.visibility_boundaries.includes_hidden_dc, true);
  assert.equal(debug.visibility_boundaries.includes_result_band_internals, true);
  assert.equal(debug.visibility_boundaries.includes_environment_debug, true);
  assert.equal(debug.visibility_boundaries.player_endpoint_exclusion_confirmed, true);
}

function assertDialogueDebugPayload(debug, sceneId) {
  assert.equal(debug.status, 'ok');
  assert.equal(debug.scene_state.dialogue_scene_id, sceneId);
  assert.ok(debug.scene_state.raw_runtime_state);
  assert.ok(Array.isArray(debug.availability.clarifying_questions));
  assert.ok(Array.isArray(debug.availability.committed_social_moves));
  assert.ok(Array.isArray(debug.availability.exits));
  assert.ok(Object.hasOwn(debug, 'preview_mapping'));
  assert.ok(Object.hasOwn(debug, 'relationship_state'));
  assert.ok(Object.hasOwn(debug.relationship_state, 'persistent_npc_state'));
  assert.ok(Object.hasOwn(debug.relationship_state, 'scene_local_state'));
  assert.ok(Object.hasOwn(debug, 'transcript'));
  assert.ok(Object.hasOwn(debug, 'audit_timeline'));
  assert.ok(Object.hasOwn(debug, 'validation'));
  assert.ok(Object.hasOwn(debug, 'test_paths'));
}

async function askQuestion(player, dialogueSceneId, questionId) {
  const result = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: dialogueSceneId,
      question_id: questionId,
    }),
  });
  assert.equal(result.response.status, 200);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} CQ result`);
  return result;
}

async function submitMove(player, dialogueSceneId, moveId, submittedText, extra = {}) {
  const result = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: dialogueSceneId,
      move_id: moveId,
      submitted_text: submittedText,
      ...extra,
    }),
  });
  assert.equal(result.response.status, 200);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} CSM result`);
  return result;
}

test('Stage 6B.13.5 player routes ignore debug query params and GM/dev routes stay guarded', async () => {
  const player = await createReadyPlayer('normal_boundary');

  const unauthenticatedDebug = await request('/api/dev/exploration-mechanics');
  assert.equal(unauthenticatedDebug.response.status, 401);
  assertPlayerSafePayload(unauthenticatedDebug.body, 'unauthenticated debug denial');

  const scene = await request('/api/play/current-scene?include_debug=true&include_mechanics=true', {
    headers: player.headers,
  });
  assert.equal(scene.response.status, 200);
  assert.equal(scene.body.debug, undefined);
  assert.ok(scene.body.mechanical_details);
  assertPlayerSafePayload(scene.body, 'normal player current scene with debug query');

  const deniedExploration = await request('/api/dev/exploration-mechanics', {
    headers: player.headers,
  });
  assert.equal(deniedExploration.response.status, 403);
  assertPlayerSafePayload(deniedExploration.body, 'normal player exploration debug denial');

  const deniedDialogue = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(deniedDialogue.response.status, 403);
  assertPlayerSafePayload(deniedDialogue.body, 'normal player dialogue debug denial');

  const deniedDiagnostics = await request('/api/dev/playtest-diagnostics', {
    headers: player.headers,
  });
  assert.equal(deniedDiagnostics.response.status, 403);
  assertPlayerSafePayload(deniedDiagnostics.body, 'normal player playtest diagnostics denial');
});

test('Stage 6B.13.5 authorized GM/dev sees exploration mechanics while player payloads stay clean', async () => {
  const gm = await createReadyPlayer('exploration_gm');
  await grantDebugCapability(gm);

  const playerScene = await request('/api/play/current-scene?include_mechanics=true', {
    headers: gm.headers,
  });
  assert.equal(playerScene.response.status, 200);
  assert.equal(playerScene.body.debug, undefined);
  assertPlayerSafePayload(playerScene.body, 'GM player-facing current scene without debug query');

  const debugScene = await request('/api/play/current-scene?include_debug=true&include_mechanics=true', {
    headers: gm.headers,
  });
  assert.equal(debugScene.response.status, 200);
  assert.ok(debugScene.body.debug);
  assert.ok(debugScene.body.debug.npc_presence);
  assert.ok(debugScene.body.mechanical_details);

  const inspector = await request('/api/dev/exploration-mechanics', {
    headers: gm.headers,
  });
  assert.equal(inspector.response.status, 200);
  assert.equal(inspector.body.status, 'ok');
  assertExplorationDebugPayload(inspector.body.exploration_mechanics_debug);

  const other = await createReadyPlayer('other_scope');
  const otherScene = await request('/api/play/current-scene', { headers: other.headers });
  assert.equal(otherScene.response.status, 200);
  const crossScope = await request(
    `/api/dev/exploration-mechanics?campaign_instance_id=${otherScene.body.campaign_instance_id}`,
    { headers: gm.headers }
  );
  assert.equal(crossScope.response.status, 200);
  assert.notEqual(crossScope.body.status, 'ok');
  assert.equal(
    JSON.stringify(crossScope.body).includes(String(other.characterId)),
    false,
    'cross-scope debug response must not expose another character id'
  );
});

test('Stage 6B.13.5 GM/dev can inspect inn village and route dialogue mechanics without player leaks', async () => {
  const gm = await createReadyPlayer('dialogue_gm');
  await grantDebugCapability(gm);

  const tomas = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: gm.headers,
  });
  assert.equal(tomas.response.status, 200);
  assertPlayerSafePayload(tomas.body, 'Tomas current dialogue');
  await askQuestion(gm, tomasSceneId, 'clarify_bandit_pattern');
  await submitMove(
    gm,
    tomasSceneId,
    'move_compare_caravan_pattern',
    'I compare the caravan evidence with Tomas and the road pattern.'
  );
  const tomasDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${tomasSceneId}`, {
    headers: gm.headers,
  });
  assert.equal(tomasDebug.response.status, 200);
  assertDialogueDebugPayload(tomasDebug.body, tomasSceneId);
  assert.equal(tomasDebug.body.preview_mapping.matched_authored_move_id, 'move_compare_caravan_pattern');
  assert.ok(tomasDebug.body.relationship_state.recent_writes.length >= 1);

  await askQuestion(gm, maraSceneId, 'clarify_mara_bandit_explanation');
  await askQuestion(gm, lysaSceneId, 'clarify_lysa_hidden_truth');
  const maraDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${maraSceneId}`, {
    headers: gm.headers,
  });
  const lysaDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${lysaSceneId}`, {
    headers: gm.headers,
  });
  assert.equal(maraDebug.response.status, 200);
  assert.equal(lysaDebug.response.status, 200);
  assertDialogueDebugPayload(maraDebug.body, maraSceneId);
  assertDialogueDebugPayload(lysaDebug.body, lysaSceneId);

  const garren = await request(`/api/play/dialogue/social-move/preview`, {
    method: 'POST',
    headers: gm.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      move_id: 'move_press_for_whole_trail',
      submitted_text: 'I ask Garren for the whole trail before earning his trust.',
    }),
  });
  assert.equal(garren.response.status, 200);
  assertPlayerSafePayload(garren.body, 'Garren gated move preview');
  const garrenDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${garrenSceneId}`, {
    headers: gm.headers,
  });
  assert.equal(garrenDebug.response.status, 200);
  assertDialogueDebugPayload(garrenDebug.body, garrenSceneId);
  assert.ok(
    garrenDebug.body.availability.committed_social_moves.some(
      (move) => move.interaction_id === 'move_press_for_whole_trail' && move.requires_check === true
    )
  );
});

test('Stage 6B.13.5 Rusk combat and hollow routing are player-safe and GM/dev inspectable', async () => {
  const gm = await createReadyPlayer('rusk_visibility');
  await grantDebugCapability(gm);

  const keepTalking = await submitMove(
    gm,
    ruskSceneId,
    'move_keep_rusk_talking',
    'I keep Rusk talking while his control wavers.',
    { forced_outcome: 'success' }
  );
  const deeper = await submitMove(
    gm,
    ruskSceneId,
    'move_push_rusk_to_name_source',
    'I push Rusk to name the source beneath the shrine.',
    {
      forced_outcome: 'success',
      continue_as_committed_social_move: true,
      lifecycle_context: keepTalking.body.lifecycle_context,
    }
  );
  assert.ok(deeper.body.social_move_result.knowledge_grants_applied.includes('shrine_depth_unlocked'));
  assertPlayerSafePayload(deeper.body, 'Rusk deeper-source player result');

  const ruskDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${ruskSceneId}`, {
    headers: gm.headers,
  });
  assert.equal(ruskDebug.response.status, 200);
  assertDialogueDebugPayload(ruskDebug.body, ruskSceneId);
  const debugText = JSON.stringify(ruskDebug.body);
  assert.ok(debugText.includes('combat_pending'));
  assert.ok(debugText.includes('future_supported_until_surface_threat_resolved'));
  assert.ok(debugText.includes('shrine_depth_unlocked'));
});

test('Stage 6B.13.5 archive search and player outputs remain scoped while GM/dev provenance is available', async () => {
  const gm = await createReadyPlayer('archive_scope');
  const other = await createReadyPlayer('archive_other');
  await grantDebugCapability(gm);

  const submitted = await submitMove(
    gm,
    maraSceneId,
    'move_report_broken_caravan',
    'I report the broken caravan clearly.'
  );
  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: gm.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      exit_id: 'exit_return_to_dunmere_village',
      lifecycle_context: submitted.body.lifecycle_context,
    }),
  });
  assert.equal(exited.response.status, 200);
  const recordId = exited.body.completed_dialogue_record.completed_dialogue_record_id;
  assert.ok(recordId);
  assertPlayerSafePayload(exited.body, 'Mara dialogue exit');

  const archive = await request(`/api/play/dialogue/archive/${recordId}`, {
    headers: gm.headers,
  });
  assert.equal(archive.response.status, 200);
  assertPlayerSafePayload(archive.body, 'player archive detail');

  const search = await request('/api/play/dialogue/search?q=bandit', {
    headers: gm.headers,
  });
  assert.equal(search.response.status, 200);
  assert.equal(
    search.body.results.some((result) => result.completed_dialogue_record_id === String(recordId)),
    true
  );
  assertPlayerSafePayload(search.body, 'player archive search');

  const otherArchive = await request(`/api/play/dialogue/archive/${recordId}`, {
    headers: other.headers,
  });
  assert.equal(otherArchive.response.status, 404);
  assertPlayerSafePayload(otherArchive.body, 'foreign archive denial');

  const maraDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${maraSceneId}`, {
    headers: gm.headers,
  });
  assert.equal(maraDebug.response.status, 200);
  assertDialogueDebugPayload(maraDebug.body, maraSceneId);
  assert.equal(String(maraDebug.body.completed_record.id), String(recordId));
  assert.ok(maraDebug.body.audit_timeline.records.some((record) => record.event_type === 'dialogue_exit'));
});
