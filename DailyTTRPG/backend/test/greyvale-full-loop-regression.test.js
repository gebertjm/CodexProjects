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

const elinSceneId = 'greyvale_elin_memory_dialogue';
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
  return `greyvale_full_loop_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Greyvale Full Loop ${label}`,
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
      name: `Loop ${label.replaceAll('_', ' ').slice(0, 24)}`,
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

async function loadDialogue(player, dialogueSceneId) {
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${dialogueSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, dialogueSceneId);
  assertPlayerSafePayload(loaded.body, `${dialogueSceneId} current dialogue`);
  return loaded;
}

async function askQuestion(player, dialogueSceneId, questionId, extra = {}) {
  const result = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: dialogueSceneId,
      question_id: questionId,
      ...extra,
    }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assertPlayerSafePayload(result.body, `${dialogueSceneId} CQ ${questionId}`);
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
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assertPlayerSafePayload(result.body, `${dialogueSceneId} CSM ${moveId}`);
  return result;
}

async function exitDialogue(player, dialogueSceneId, exitId, lifecycleContext = null) {
  const result = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: dialogueSceneId,
      exit_id: exitId,
      ...(lifecycleContext ? { lifecycle_context: lifecycleContext } : {}),
    }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.completed_dialogue_record?.completed_dialogue_record_id);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} exit ${exitId}`);
  return result;
}

async function assertKnowledgeIncludes(player, knowledgeId) {
  const knowledge = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledge.response.status, 200);
  assert.match(JSON.stringify(knowledge.body), new RegExp(knowledgeId));
  assertPlayerSafePayload(knowledge.body, `knowledge journal ${knowledgeId}`);
  return knowledge;
}

async function assertDialogueSearchFinds(player, queryText, expectedTitlePattern) {
  const search = await request(`/api/play/dialogue/search?q=${encodeURIComponent(queryText)}`, {
    headers: player.headers,
  });
  assert.equal(search.response.status, 200);
  assert.match(JSON.stringify(search.body), expectedTitlePattern);
  assertPlayerSafePayload(search.body, `dialogue search ${queryText}`);
  return search;
}

async function assertDialogueDebug(player, dialogueSceneId, expectedTextPattern = null) {
  const debug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${dialogueSceneId}`, {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.status, 'ok');
  assert.equal(debug.body.scene_state.dialogue_scene_id, dialogueSceneId);
  assert.ok(debug.body.scene_state.raw_runtime_state);
  assert.ok(Array.isArray(debug.body.audit_timeline.records));
  if (expectedTextPattern) {
    assert.match(JSON.stringify(debug.body), expectedTextPattern);
  }
  return debug;
}

test('Stage 6B.13.6 inn cluster smoke covers exploration, Tomas, Elin, outputs, and debug', async () => {
  const player = await createReadyPlayer('inn_cluster');
  await grantDebugCapability(player);

  const current = await request('/api/play/current-scene?include_mechanics=true', {
    headers: player.headers,
  });
  assert.equal(current.response.status, 200);
  assert.equal(current.body.scene.key, 'broken-caravan-site');
  assertPlayerSafePayload(current.body, 'inn cluster current scene');

  const focus = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: availableCloserLook(current.body).interaction_id,
      scene_id: current.body.scene.scene_id,
    }),
  });
  assert.equal(focus.response.status, 200);
  assertPlayerSafePayload(focus.body, 'inn cluster Free Focus');

  const preview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(committedFollowupInput(current.body)),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.status, 'resolved');
  assertPlayerSafePayload(preview.body, 'inn cluster action preview');

  const submit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      ...committedFollowupInput(current.body),
      lifecycle_context: preview.body.lifecycle_context,
    }),
  });
  assert.equal(submit.response.status, 200);
  assert.equal(submit.body.status, 'submitted');
  assertPlayerSafePayload(submit.body, 'inn cluster action submit');

  const advanced = await request('/api/dev/advance-beat', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({}),
  });
  assert.equal(advanced.response.status, 200);
  assert.equal(advanced.body.status, 'advanced');
  assertPlayerSafePayload(advanced.body.current_scene, 'inn cluster advanced current scene');

  const explorationDebug = await request('/api/dev/exploration-mechanics', {
    headers: player.headers,
  });
  assert.equal(explorationDebug.response.status, 200);
  assert.ok(explorationDebug.body.exploration_mechanics_debug.result_bands.length >= 1);
  assert.ok(explorationDebug.body.exploration_mechanics_debug.visibility_boundaries);

  await loadDialogue(player, tomasSceneId);
  const pattern = await askQuestion(player, tomasSceneId, 'clarify_bandit_pattern');
  assert.ok(pattern.body.clarifying_question_result.result.knowledge_grants_applied.includes('innkeeper_tracks_road_patterns'));
  const tomasMove = await submitMove(
    player,
    tomasSceneId,
    'move_compare_caravan_pattern',
    'I compare the broken caravan evidence against his road pattern.',
    { forced_outcome: 'success' }
  );
  const tomasExit = await exitDialogue(player, tomasSceneId, 'exit_return_to_common_room', tomasMove.body.lifecycle_context);
  await assertKnowledgeIncludes(player, 'innkeeper_tracks_road_patterns');
  await assertDialogueDebug(player, tomasSceneId, /move_compare_caravan_pattern/);

  await loadDialogue(player, elinSceneId);
  const sash = await askQuestion(player, elinSceneId, 'clarify_torn_sash');
  assert.ok(sash.body.clarifying_question_result.result.knowledge_grants_applied.includes('elin_sash_has_roadward_knot'));
  const elinMove = await submitMove(
    player,
    elinSceneId,
    'move_press_shrine_warning',
    'I press gently for what Elin remembers about the shrine warning.',
    { forced_outcome: 'success' }
  );
  assert.ok(elinMove.body.social_move_result.knowledge_grants_applied.includes('shrine_bell_stopped_attack'));
  await exitDialogue(player, elinSceneId, 'exit_return_to_common_room', elinMove.body.lifecycle_context);
  await assertKnowledgeIncludes(player, 'elin_sash_has_roadward_knot');
  await assertKnowledgeIncludes(player, 'shrine_bell_stopped_attack');
  await assertDialogueSearchFinds(player, 'Tomas', /Tomas/i);
  await assertDialogueSearchFinds(player, 'Elin', /Elin/i);
  await assertDialogueDebug(player, elinSceneId, /move_press_shrine_warning/);

  const archive = await request(
    `/api/play/dialogue/archive/${tomasExit.body.completed_dialogue_record.completed_dialogue_record_id}`,
    { headers: player.headers }
  );
  assert.equal(archive.response.status, 200);
  assertPlayerSafePayload(archive.body, 'inn cluster archive');
});

test('Stage 6B.13.6 village cluster smoke covers Mara, Lysa, Garren, route outputs, and partial clues', async () => {
  const player = await createReadyPlayer('village_cluster');
  await grantDebugCapability(player);

  await loadDialogue(player, maraSceneId);
  const mara = await askQuestion(player, maraSceneId, 'clarify_mara_bandit_explanation');
  assert.ok(mara.body.clarifying_question_result.result.knowledge_grants_applied.includes('dunmere_wants_simple_answer'));
  await exitDialogue(player, maraSceneId, 'exit_return_to_dunmere_village', mara.body.lifecycle_context);

  await loadDialogue(player, lysaSceneId);
  const lysa = await askQuestion(player, lysaSceneId, 'clarify_lysa_hidden_truth');
  assert.ok(lysa.body.clarifying_question_result.result.knowledge_grants_applied.includes('village_blames_hunter_and_road'));
  await exitDialogue(player, lysaSceneId, 'exit_return_to_dunmere_village', lysa.body.lifecycle_context);

  await loadDialogue(player, garrenSceneId);
  const sighting = await askQuestion(player, garrenSceneId, 'clarify_garren_old_path_sighting');
  assert.ok(sighting.body.clarifying_question_result.result.knowledge_grants_applied.includes('garren_knows_old_paths'));
  const route = await submitMove(
    player,
    garrenSceneId,
    'move_ask_safest_way_to_approach_shrine',
    'I ask Garren for the safest way to approach the shrine.',
    { forced_outcome: 'success', continue_as_committed_social_move: true }
  );
  assert.ok(route.body.social_move_result.knowledge_grants_applied.includes('tracks_converge_on_shrine'));
  await exitDialogue(player, garrenSceneId, 'exit_follow_old_path_lead', route.body.lifecycle_context);

  const journal = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(journal.response.status, 200);
  const journalText = JSON.stringify(journal.body);
  assert.match(journalText, /dunmere_wants_simple_answer/);
  assert.match(journalText, /village_blames_hunter_and_road/);
  assert.match(journalText, /tracks_converge_on_shrine/);
  assert.equal(journalText.toLowerCase().includes('confirmed truth'), false);
  assert.equal(journalText.toLowerCase().includes('final mystery'), false);
  assertPlayerSafePayload(journal.body, 'village cluster knowledge journal');

  await assertDialogueSearchFinds(player, 'Garren', /Garren/i);
  await assertDialogueDebug(player, maraSceneId, /dunmere_wants_simple_answer/);
  await assertDialogueDebug(player, lysaSceneId, /village_blames_hunter_and_road/);
  await assertDialogueDebug(player, garrenSceneId, /tracks_converge_on_shrine/);
});

test('Stage 6B.13.6 shrine cluster smoke covers Rusk instability, combat_pending, archive, and GM/dev routing', async () => {
  const player = await createReadyPlayer('shrine_cluster');
  await grantDebugCapability(player);

  await loadDialogue(player, ruskSceneId);
  const hears = await askQuestion(player, ruskSceneId, 'clarify_rusk_what_he_hears');
  assert.ok(hears.body.clarifying_question_result.result.knowledge_grants_applied.includes('bandits_not_fully_self_directed'));

  const keepTalking = await submitMove(
    player,
    ruskSceneId,
    'move_keep_rusk_talking',
    'I keep Rusk talking while his control wavers.',
    { forced_outcome: 'success' }
  );
  assert.ok(keepTalking.body.social_move_result.knowledge_grants_applied.includes('bandits_not_fully_self_directed'));

  const deeper = await submitMove(
    player,
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
  assert.ok(deeper.body.social_move_result.knowledge_grants_applied.includes('hollow_reaches_shrine_above'));
  assertPlayerSafePayload(deeper.body, 'Rusk deeper source result');

  const exited = await exitDialogue(player, ruskSceneId, 'exit_rusk_combat_pending', deeper.body.lifecycle_context);
  assert.match(JSON.stringify(exited.body), /combat/i);
  assertPlayerSafePayload(exited.body, 'Rusk combat-pending exit');

  await assertKnowledgeIncludes(player, 'bandits_not_fully_self_directed');
  await assertKnowledgeIncludes(player, 'shrine_depth_unlocked');
  await assertDialogueSearchFinds(player, 'Rusk', /Rusk/i);

  const debug = await assertDialogueDebug(player, ruskSceneId, /future_supported_until_surface_threat_resolved/);
  const debugText = JSON.stringify(debug.body);
  assert.match(debugText, /combat_pending/);
  assert.match(debugText, /shrine_depth_unlocked/);
  assert.match(debugText, /hollow_reaches_shrine_above/);

  const archive = await request(
    `/api/play/dialogue/archive/${exited.body.completed_dialogue_record.completed_dialogue_record_id}`,
    { headers: player.headers }
  );
  assert.equal(archive.response.status, 200);
  assertPlayerSafePayload(archive.body, 'Rusk archive');
});
