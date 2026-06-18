import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { actThroughPlayState } from '../src/services/adventureRuntimeService.js';
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

const repoRoot = process.cwd().endsWith(`${path.sep}backend`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

const dialogueSceneIds = {
  tomas: 'greyvale_tomas_roadside_worries_dialogue',
  elin: 'greyvale_elin_memory_dialogue',
  mara: 'greyvale_mara_dunmere_pressure_dialogue',
  lysa: 'greyvale_lysa_grief_suspicion_dialogue',
  garren: 'greyvale_garren_path_knowledge_dialogue',
  rusk: 'greyvale_rusk_at_the_shrine_dialogue',
};

const requiredMemoryKnowledge = [
  'clue_caravan_irregularity',
  'innkeeper_tracks_road_patterns',
  'elin_sash_has_roadward_knot',
  'shrine_bell_stopped_attack',
  'dunmere_wants_simple_answer',
  'village_blames_hunter_and_road',
  'garren_knows_old_paths',
  'old_path_still_used',
  'tracks_converge_on_shrine',
  'clue_shrine_activity',
  'bandits_not_fully_self_directed',
  'shrine_depth_unlocked',
  'hollow_reaches_shrine_above',
];

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
  return `stage6b15_memory_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B15 Memory ${label}`,
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
      name: `Memory ${label.replaceAll('_', ' ').slice(0, 24)}`,
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
    campaignId: Number(started.body.current_adventure.campaign_instance_id),
    started: started.body,
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

async function clearRecentAdvanceThrottle(player) {
  await query(
    `
      DELETE FROM dnd5e_campaign_log
      WHERE campaign_id = $1
        AND character_id = $2
        AND actor_account_id = $3
        AND log_type = 'play_action'
        AND data_json->>'event_type' = 'dev_beat_advanced'
    `,
    [player.campaignId, player.characterId, player.accountId]
  );
}

const forbiddenPlayerTerms = [
  'exploration_mechanics_debug',
  'visibility_boundaries',
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
  'expected_path',
  'debug_notices',
  'awaiting_future_support',
  'combat_pending',
  'future_supported',
  'combat_routing',
  'shrine-rusk-confrontation',
  'hidden_clue_metadata',
  'gm_dev_content_ref',
  'raw_runtime_state',
  'truth_label',
  'final_mystery',
  'whispering presence',
  'database constraint',
  'duplicate key',
  'stackTrace',
  'stack_trace',
];

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload).toLowerCase();
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term.toLowerCase()), false, `${label} leaked ${term}`);
  }
}

function actionReference(action = {}) {
  return {
    actionKey: action.action_key ?? action.actionKey ?? null,
    transitionId: action.transition_id ?? action.transitionId ?? null,
    interactionId: action.interaction_id ?? action.interactionId ?? null,
    dialogueSceneId: action.dialogue_scene_id ?? action.dialogueSceneId ?? null,
  };
}

function findAffordanceWithAction(scenePayload, predicate, label) {
  const affordance = (scenePayload.visible_affordances ?? []).find((candidate) =>
    (candidate.available_actions ?? []).some((action) => predicate(actionReference(action)))
  );
  assert.ok(affordance, `Expected ${label} affordance in ${scenePayload.scene?.key}`);
  return affordance;
}

function findTransitionAffordance(scenePayload, transitionKey) {
  return findAffordanceWithAction(
    scenePayload,
    (action) => action.transitionId === transitionKey || action.actionKey === `move_scene:${transitionKey}`,
    transitionKey
  );
}

async function currentScene(player, queryString = '') {
  const loaded = await request(`/api/play/current-scene${queryString}`, { headers: player.headers });
  assert.equal(loaded.response.status, 200, JSON.stringify(loaded.body));
  assertPlayerSafePayload(loaded.body, `current scene ${queryString}`);
  return loaded.body;
}

async function previewAndSubmitTarget(player, scenePayload, affordance, rawText, extraInput = {}) {
  const preview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: rawText,
      selected_affordance_id: affordance.affordance_id,
      ...extraInput,
    }),
  });
  assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.status, 'resolved');
  assertPlayerSafePayload(preview.body, `preview ${affordance.label}`);

  const submit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: rawText,
      selected_affordance_id: affordance.affordance_id,
      lifecycle_context: preview.body.lifecycle_context,
      ...extraInput,
    }),
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.status, 'submitted');
  assertPlayerSafePayload(submit.body, `submit ${affordance.label}`);
}

async function advanceBeat(player, label) {
  await clearRecentAdvanceThrottle(player);
  const advanced = await request('/api/dev/advance-beat', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({}),
  });
  assert.equal(advanced.response.status, 200, `${label}: ${JSON.stringify(advanced.body)}`);
  assert.equal(advanced.body.status, 'advanced');
  assertPlayerSafePayload(advanced.body.current_scene, `${label} advanced scene`);
  return advanced.body.current_scene;
}

async function submitTransitionAndAdvance(player, scenePayload, transitionKey, rawText) {
  const affordance = findTransitionAffordance(scenePayload, transitionKey);
  await previewAndSubmitTarget(player, scenePayload, affordance, rawText);
  return advanceBeat(player, transitionKey);
}

async function loadDialogue(player, dialogueSceneId) {
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${dialogueSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200, JSON.stringify(loaded.body));
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, dialogueSceneId);
  assert.equal(loaded.body.state, 'active');
  assertPlayerSafePayload(loaded.body, `${dialogueSceneId} current dialogue`);
  return loaded.body;
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
  assert.match(result.body.status, /resolved|already_resolved/);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} CQ ${questionId}`);
  return result.body;
}

async function previewMove(player, dialogueSceneId, moveId, submittedText, lifecycleContext = null, extra = {}) {
  const result = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: dialogueSceneId,
      move_id: moveId,
      submitted_text: submittedText,
      ...(lifecycleContext ? { lifecycle_context: lifecycleContext } : {}),
      ...extra,
    }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.status, 'preview');
  assert.equal(result.body.preview.move_id, moveId);
  assert.equal(Object.hasOwn(result.body.preview, 'confidence'), false);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} preview ${moveId}`);
  return result.body;
}

async function submitMove(player, dialogueSceneId, moveId, submittedText, lifecycleContext, extra = {}) {
  const result = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: dialogueSceneId,
      move_id: moveId,
      submitted_text: submittedText,
      ...(lifecycleContext ? { lifecycle_context: lifecycleContext } : {}),
      ...extra,
    }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.status, 'resolved');
  assertPlayerSafePayload(result.body, `${dialogueSceneId} submit ${moveId}`);
  return result.body;
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
  return result.body;
}

async function runSocialMove(player, dialogueSceneId, moveId, text, lifecycleContext, extra = {}) {
  const preview = await previewMove(player, dialogueSceneId, moveId, text, lifecycleContext, extra);
  return submitMove(player, dialogueSceneId, moveId, text, preview.lifecycle_context, extra);
}

async function objectiveState(player, objectiveKey) {
  const result = await query(
    `
      SELECT objective.key, objective.title, objective_state.status, objective_state.progress_count
      FROM dnd5e_character_objective objective_state
      JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
      JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
      WHERE quest_state.campaign_id = $1
        AND quest_state.character_id = $2
        AND objective.key = $3
      LIMIT 1
    `,
    [player.campaignId, player.characterId, objectiveKey]
  );
  return result.rows[0] ?? null;
}

async function assertObjective(player, objectiveKey, status, progressCount = null) {
  const state = await objectiveState(player, objectiveKey);
  assert.ok(state, `objective ${objectiveKey} should exist`);
  assert.equal(state.status, status, `objective ${objectiveKey} status`);
  if (progressCount !== null) {
    assert.equal(Number(state.progress_count), progressCount, `objective ${objectiveKey} progress`);
  }
}

async function knowledgeRowCount(player, knowledgeKey) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_character_knowledge
      WHERE character_id = $1
        AND knowledge_key = $2
        AND status = 'known'
    `,
    [player.characterId, knowledgeKey]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function assertKnowledgeOnce(player, knowledgeKey) {
  assert.equal(await knowledgeRowCount(player, knowledgeKey), 1, `${knowledgeKey} should appear once`);
}

async function completedRecordCount(player, dialogueSceneId = null) {
  const params = [player.campaignId, player.characterId];
  const filter = dialogueSceneId
    ? `AND dialogue_scene_key = $${params.push(dialogueSceneId)}`
    : '';
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_completed_dialogue_record
      WHERE campaign_id = $1
        AND character_id = $2
        AND visibility_scope = 'player'
        ${filter}
    `,
    params
  );
  return Number(result.rows[0]?.count ?? 0);
}

function assertTimelineOrdered(timeline) {
  for (let index = 1; index < timeline.length; index += 1) {
    const previous = new Date(
      timeline[index - 1].resolved_at ?? timeline[index - 1].occurred_at ?? timeline[index - 1].completed_at ?? 0
    ).getTime();
    const current = new Date(
      timeline[index].resolved_at ?? timeline[index].occurred_at ?? timeline[index].completed_at ?? 0
    ).getTime();
    assert.ok(previous >= current, `timeline should be descending at ${index}`);
  }
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} should not contain duplicates`);
}

test('Stage 6B.15.4 Greyvale memory and recap flow stays coherent across the canonical route', async () => {
  const player = await createReadyPlayer('canonical_memory');
  await grantDebugCapability(player);

  let scene = player.started.current_scene;
  assert.equal(scene.scene.key, 'broken-caravan-site');
  assert.equal(scene.current_objective.key, 'witness-the-aftermath');
  assertPlayerSafePayload(scene, 'initial scene');

  await actThroughPlayState(
    player.campaignId,
    player.characterId,
    {
      action_type: 'scene_interaction',
      interaction_key: 'inspect-broken-caravan',
      roll: 20,
      actor_account_id: player.accountId,
    },
    'player'
  );
  await assertObjective(player, 'witness-the-aftermath', 'completed', 1);
  await assertObjective(player, 'gather-local-insight', 'active', 0);
  await assertKnowledgeOnce(player, 'clue_caravan_irregularity');

  scene = await currentScene(player);
  assert.equal(scene.current_objective.key, 'gather-local-insight');
  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'leave-broken-caravan-for-inn',
    'I head to the Grey Road Inn.'
  );
  assert.equal(scene.scene.key, 'grey-road-inn');
  assert.ok(scene.scene_result_feed?.latest_result ?? scene.recent_summary, 'transition should surface latest context');

  await loadDialogue(player, dialogueSceneIds.tomas);
  const tomasQuestion = await askQuestion(player, dialogueSceneIds.tomas, 'clarify_bandit_pattern');
  const tomasMove = await runSocialMove(
    player,
    dialogueSceneIds.tomas,
    'move_compare_caravan_pattern',
    'I compare the broken caravan evidence against his road pattern.',
    tomasQuestion.lifecycle_context,
    { forced_outcome: 'success' }
  );
  await exitDialogue(player, dialogueSceneIds.tomas, 'exit_return_to_common_room', tomasMove.lifecycle_context);
  await assertObjective(player, 'gather-local-insight', 'active', 1);
  await assertKnowledgeOnce(player, 'innkeeper_tracks_road_patterns');

  await loadDialogue(player, dialogueSceneIds.elin);
  const elinQuestion = await askQuestion(player, dialogueSceneIds.elin, 'clarify_torn_sash');
  const elinMove = await runSocialMove(
    player,
    dialogueSceneIds.elin,
    'move_press_shrine_warning',
    'I press gently for what Elin remembers about the shrine warning.',
    elinQuestion.lifecycle_context,
    { forced_outcome: 'success' }
  );
  await exitDialogue(player, dialogueSceneIds.elin, 'exit_return_to_common_room', elinMove.lifecycle_context);
  await assertKnowledgeOnce(player, 'elin_sash_has_roadward_knot');
  await assertKnowledgeOnce(player, 'shrine_bell_stopped_attack');

  scene = await currentScene(player);
  scene = await submitTransitionAndAdvance(player, scene, 'continue-to-dunmere', 'I continue to Dunmere.');
  assert.equal(scene.scene.key, 'dunmere-village');

  await loadDialogue(player, dialogueSceneIds.mara);
  const maraQuestion = await askQuestion(player, dialogueSceneIds.mara, 'clarify_mara_bandit_explanation');
  const maraMove = await runSocialMove(
    player,
    dialogueSceneIds.mara,
    'move_report_broken_caravan',
    'I report what I saw at the broken caravan.',
    maraQuestion.lifecycle_context,
    { forced_outcome: 'success' }
  );
  await exitDialogue(player, dialogueSceneIds.mara, 'exit_return_to_dunmere_village', maraMove.lifecycle_context);
  await assertKnowledgeOnce(player, 'dunmere_wants_simple_answer');

  await loadDialogue(player, dialogueSceneIds.lysa);
  const lysaQuestion = await askQuestion(player, dialogueSceneIds.lysa, 'clarify_lysa_hidden_truth');
  const lysaMove = await runSocialMove(
    player,
    dialogueSceneIds.lysa,
    'move_ground_lysa_suspicion',
    'I try to ground Lysa suspicion in what she actually saw.',
    lysaQuestion.lifecycle_context,
    { forced_outcome: 'success' }
  );
  await exitDialogue(player, dialogueSceneIds.lysa, 'exit_return_to_dunmere_village', lysaMove.lifecycle_context);
  await assertKnowledgeOnce(player, 'village_blames_hunter_and_road');

  await loadDialogue(player, dialogueSceneIds.garren);
  const garrenQuestion = await askQuestion(player, dialogueSceneIds.garren, 'clarify_garren_old_path_sighting');
  const garrenMove = await runSocialMove(
    player,
    dialogueSceneIds.garren,
    'move_ask_safest_way_to_approach_shrine',
    'I ask Garren for the safest way to approach the shrine.',
    garrenQuestion.lifecycle_context,
    { forced_outcome: 'success', continue_as_committed_social_move: true }
  );
  await exitDialogue(player, dialogueSceneIds.garren, 'exit_return_to_dunmere_village', garrenMove.lifecycle_context);
  await assertObjective(player, 'gather-local-insight', 'completed', 2);
  await assertObjective(player, 'follow-the-leads', 'active', 0);
  await assertKnowledgeOnce(player, 'garren_knows_old_paths');
  await assertKnowledgeOnce(player, 'old_path_still_used');
  await assertKnowledgeOnce(player, 'tracks_converge_on_shrine');

  scene = await currentScene(player);
  scene = await submitTransitionAndAdvance(player, scene, 'follow-the-old-path', 'I take the old forest path.');
  assert.equal(scene.scene.key, 'old-forest-path');
  await actThroughPlayState(
    player.campaignId,
    player.characterId,
    {
      action_type: 'scene_interaction',
      interaction_key: 'track-the-old-path',
      roll: 20,
      actor_account_id: player.accountId,
    },
    'player'
  );
  await assertObjective(player, 'follow-the-leads', 'completed', 1);
  await assertObjective(player, 'uncover-the-truth', 'active', 0);
  await assertKnowledgeOnce(player, 'clue_shrine_activity');

  scene = await currentScene(player);
  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'follow-the-tracks-to-the-shrine',
    'I follow the signs toward the shrine.'
  );
  assert.equal(scene.scene.key, 'shrine-ruins');

  await loadDialogue(player, dialogueSceneIds.rusk);
  const ruskQuestion = await askQuestion(player, dialogueSceneIds.rusk, 'clarify_rusk_what_he_hears');
  const ruskFirstMove = await runSocialMove(
    player,
    dialogueSceneIds.rusk,
    'move_keep_rusk_talking',
    'I keep Rusk talking while his control wavers.',
    ruskQuestion.lifecycle_context,
    { forced_outcome: 'success' }
  );
  const ruskDeeperMove = await runSocialMove(
    player,
    dialogueSceneIds.rusk,
    'move_push_rusk_to_name_source',
    'I push Rusk to name what is beneath the shrine.',
    ruskFirstMove.lifecycle_context,
    { forced_outcome: 'success' }
  );
  const ruskReadyToExit = await loadDialogue(player, dialogueSceneIds.rusk);
  const ruskExitIds = (ruskReadyToExit.dialogue_exits ?? []).map((exit) => exit.exit_id);
  assert.equal(ruskExitIds.includes('exit_rusk_combat_pending'), false);
  assert.ok(ruskExitIds.includes('exit_rusk_confrontation'));
  const ruskExit = await exitDialogue(
    player,
    dialogueSceneIds.rusk,
    'exit_rusk_confrontation',
    ruskDeeperMove.lifecycle_context
  );
  assert.match(JSON.stringify(ruskExit), /combat/i);
  await assertObjective(player, 'uncover-the-truth', 'completed', 1);
  await assertObjective(player, 'resolve-the-threat', 'active', 0);
  await assertKnowledgeOnce(player, 'bandits_not_fully_self_directed');
  await assertKnowledgeOnce(player, 'shrine_depth_unlocked');
  await assertKnowledgeOnce(player, 'hollow_reaches_shrine_above');

  const finalScene = await currentScene(player, '?include_mechanics=true');
  assert.equal(finalScene.scene.key, 'shrine-ruins');
  assert.equal(finalScene.current_objective.key, 'resolve-the-threat');
  assert.equal(finalScene.action_status.state, 'slice_endpoint_reached');
  assert.equal(finalScene.action_status.can_submit, false);
  assert.equal(finalScene.slice_endpoint.state, 'endpoint_reached');
  assert.match(finalScene.slice_endpoint.message, /end of the current Greyvale playable slice/i);
  assert.match(finalScene.slice_endpoint.next_step, /Review your journal/i);
  assertPlayerSafePayload(finalScene, 'final current scene recap');

  const endpointPreview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: 'I force the shrine confrontation.',
    }),
  });
  assert.equal(endpointPreview.response.status, 200, JSON.stringify(endpointPreview.body));
  assert.equal(endpointPreview.body.status, 'invalid');
  assert.match(endpointPreview.body.message, /end of the current Greyvale playable slice/i);
  assertPlayerSafePayload(endpointPreview.body, 'endpoint blocked preview');

  const endpointSubmit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: 'I force the shrine confrontation.',
    }),
  });
  assert.equal(endpointSubmit.response.status, 409);
  assert.match(endpointSubmit.body.error?.message ?? endpointSubmit.body.message, /end of the current Greyvale playable slice/i);
  assertPlayerSafePayload(endpointSubmit.body, 'endpoint blocked submit');

  const knowledge = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledge.response.status, 200);
  assert.equal(knowledge.body.current_objective.key, 'resolve-the-threat');
  assert.ok(Number(knowledge.body.known_count) >= requiredMemoryKnowledge.length);
  const journalText = JSON.stringify(knowledge.body);
  for (const knowledgeKey of requiredMemoryKnowledge) {
    assert.match(journalText, new RegExp(knowledgeKey), `journal should include ${knowledgeKey}`);
  }
  assert.equal(journalText.toLowerCase().includes('confirmed truth'), false);
  assert.equal(journalText.toLowerCase().includes('whispering presence'), false);
  assertPlayerSafePayload(knowledge.body, 'knowledge journal');

  const history = await request('/api/play/campaign/history', { headers: player.headers });
  assert.equal(history.response.status, 200);
  assert.equal(history.body.state, 'active');
  assertTimelineOrdered(history.body.timeline);
  assertPlayerSafePayload(history.body, 'campaign history');
  const dialogueHistory = history.body.timeline.filter((entry) => entry.type === 'dialogue_completed');
  assert.equal(dialogueHistory.length, 6);
  assertUnique(
    dialogueHistory.map((entry) => entry.completed_dialogue_record_id),
    'dialogue history completed record ids'
  );
  assert.match(JSON.stringify(dialogueHistory), /Tomas|Elin|Mara|Lysa|Garren|Rusk/);

  const archive = await request('/api/play/dialogue/archive', { headers: player.headers });
  assert.equal(archive.response.status, 200);
  assert.equal(archive.body.records.length, 6);
  assertPlayerSafePayload(archive.body, 'dialogue archive');
  assert.equal(await completedRecordCount(player), 6);
  for (const dialogueSceneId of Object.values(dialogueSceneIds)) {
    assert.equal(await completedRecordCount(player, dialogueSceneId), 1, `${dialogueSceneId} completed once`);
  }

  for (const searchTerm of ['Tomas', 'Elin', 'Mara', 'Lysa', 'Garren', 'Rusk']) {
    const search = await request(`/api/play/dialogue/search?q=${encodeURIComponent(searchTerm)}`, {
      headers: player.headers,
    });
    assert.equal(search.response.status, 200);
    assert.ok(search.body.results.length >= 1, `search should find ${searchTerm}`);
    assertPlayerSafePayload(search.body, `search ${searchTerm}`);
  }

  const debug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${dialogueSceneIds.rusk}`, {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  assert.match(JSON.stringify(debug.body), /objective_updates|knowledge_grants|combat_pending/);

  const debugScene = await request('/api/play/current-scene?include_debug=true', { headers: player.headers });
  assert.equal(debugScene.response.status, 200);
  assert.equal(debugScene.body.debug?.slice_endpoint?.handoff_kind, 'combat_pending');
  assert.equal(debugScene.body.debug?.slice_endpoint?.future_supported_status, 'future_supported_until_combat_system');
  assert.equal(debugScene.body.debug?.slice_endpoint?.target_encounter_id, 'shrine-rusk-confrontation');

  const countsBeforeResume = {
    known: Object.fromEntries(
      await Promise.all(requiredMemoryKnowledge.map(async (key) => [key, await knowledgeRowCount(player, key)]))
    ),
    completedRecords: await completedRecordCount(player),
    historyDialogueEntries: dialogueHistory.length,
  };
  const resumed = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.body.current_scene.scene.key, 'shrine-ruins');
  assert.equal(resumed.body.current_scene.current_objective.key, 'resolve-the-threat');
  assert.equal(resumed.body.current_scene.action_status.state, 'slice_endpoint_reached');
  assert.equal(resumed.body.current_scene.slice_endpoint.state, 'endpoint_reached');
  assert.equal(resumed.body.current_adventure.slice_endpoint.state, 'endpoint_reached');
  assertPlayerSafePayload(resumed.body, 'resumed memory route');

  for (const [knowledgeKey, count] of Object.entries(countsBeforeResume.known)) {
    assert.equal(await knowledgeRowCount(player, knowledgeKey), count, `${knowledgeKey} unchanged after resume`);
  }
  assert.equal(await completedRecordCount(player), countsBeforeResume.completedRecords);
  const historyAfterResume = await request('/api/play/campaign/history', { headers: player.headers });
  assert.equal(historyAfterResume.response.status, 200);
  assert.equal(
    historyAfterResume.body.timeline.filter((entry) => entry.type === 'dialogue_completed').length,
    countsBeforeResume.historyDialogueEntries
  );
  assertPlayerSafePayload(historyAfterResume.body, 'history after resume');
});
