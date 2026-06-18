import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const acceptanceFixturePath = path.resolve(
  repoRoot,
  'content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json'
);

const dialogueSceneIds = {
  tomas: 'greyvale_tomas_roadside_worries_dialogue',
  elin: 'greyvale_elin_memory_dialogue',
  mara: 'greyvale_mara_dunmere_pressure_dialogue',
  lysa: 'greyvale_lysa_grief_suspicion_dialogue',
  garren: 'greyvale_garren_path_knowledge_dialogue',
  rusk: 'greyvale_rusk_at_the_shrine_dialogue',
};

const requiredKnowledge = [
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
  'target_encounter_id',
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
  return `greyvale_acceptance_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function acceptanceFixture() {
  return JSON.parse(fs.readFileSync(acceptanceFixturePath, 'utf8'));
}

function canonicalPathFixture() {
  const fixture = acceptanceFixture();
  const canonical = fixture.paths.find((entry) => entry.name === 'canonical_happy_path');
  assert.ok(canonical, 'canonical_happy_path exists in acceptance fixture');
  return canonical;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Greyvale Acceptance ${label}`,
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
      name: `Accept ${label.replaceAll('_', ' ').slice(0, 24)}`,
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

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload).toLowerCase();
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term.toLowerCase()), false, `${label} leaked ${term}`);
  }
}

function assertSafeLifecycleError(result, messagePattern) {
  assert.ok([400, 409, 422].includes(result.response.status), JSON.stringify(result.body));
  assert.match(result.body.error?.message ?? result.body.message ?? '', messagePattern);
  assertPlayerSafePayload(result.body, 'safe lifecycle error');
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

function findInteractionAffordance(scenePayload, interactionId, label) {
  return findAffordanceWithAction(
    scenePayload,
    (action) => action.interactionId === interactionId || action.actionKey === `scene_interaction:${interactionId}`,
    label
  );
}

function findTransitionAffordance(scenePayload, transitionKey) {
  return findAffordanceWithAction(
    scenePayload,
    (action) => action.transitionId === transitionKey || action.actionKey === `move_scene:${transitionKey}`,
    transitionKey
  );
}

function allDialogueSceneIds(scenePayload) {
  const ids = new Set();
  for (const collection of [
    scenePayload.scene_reference?.people_nearby ?? [],
    scenePayload.scene_reference?.action_targets ?? [],
    scenePayload.visible_affordances ?? [],
    scenePayload.visible_npcs ?? [],
  ]) {
    for (const entry of collection) {
      const id = entry.dialogue_scene_id ?? entry.dialogueSceneId;
      if (id) {
        ids.add(id);
      }
      for (const action of entry.available_actions ?? []) {
        if (action.dialogue_scene_id) {
          ids.add(action.dialogue_scene_id);
        }
      }
    }
  }
  return ids;
}

function assertDialogueEntries(scenePayload, expectedIds, label) {
  const ids = allDialogueSceneIds(scenePayload);
  for (const expectedId of expectedIds) {
    assert.ok(ids.has(expectedId), `${label} should expose ${expectedId}`);
  }
}

async function currentScene(player, queryString = '') {
  const loaded = await request(`/api/play/current-scene${queryString}`, { headers: player.headers });
  assert.equal(loaded.response.status, 200, JSON.stringify(loaded.body));
  assertPlayerSafePayload(loaded.body, `current scene ${queryString}`);
  return loaded.body;
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

async function characterFlagValue(player, flagKey) {
  const result = await query(
    `
      SELECT flag_value_json
      FROM dnd5e_character_flag
      WHERE character_id = $1
        AND flag_key = $2
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [player.characterId, flagKey]
  );
  return result.rows[0]?.flag_value_json ?? null;
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

async function assertKnowledgeOnce(player, knowledgeKey) {
  assert.equal(await knowledgeRowCount(player, knowledgeKey), 1, `${knowledgeKey} should appear once`);
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

async function previewAction(player, affordance, rawText, extraInput = {}) {
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
  return preview.body;
}

async function submitAction(player, affordance, rawText, lifecycleContext, extraInput = {}) {
  const submit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: rawText,
      selected_affordance_id: affordance.affordance_id,
      lifecycle_context: lifecycleContext,
      ...extraInput,
    }),
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.status, 'submitted');
  assertPlayerSafePayload(submit.body, `submit ${affordance.label}`);
  return submit.body;
}

async function previewAndSubmitTarget(player, affordance, rawText, extraInput = {}) {
  const preview = await previewAction(player, affordance, rawText, extraInput);
  return submitAction(player, affordance, rawText, preview.lifecycle_context, extraInput);
}

async function advanceBeat(player, label, input = {}) {
  await clearRecentAdvanceThrottle(player);
  const advanced = await request('/api/dev/advance-beat', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(input),
  });
  assert.equal(advanced.response.status, 200, `${label}: ${JSON.stringify(advanced.body)}`);
  assert.equal(advanced.body.status, 'advanced');
  assertPlayerSafePayload(advanced.body.current_scene, `${label} advanced scene`);
  return advanced.body.current_scene;
}

async function submitTransitionAndAdvance(player, scenePayload, transitionKey, rawText) {
  const affordance = findTransitionAffordance(scenePayload, transitionKey);
  await previewAndSubmitTarget(player, affordance, rawText);
  return advanceBeat(player, transitionKey);
}

async function loadDialogue(player, dialogueSceneId) {
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${dialogueSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200, JSON.stringify(loaded.body));
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, dialogueSceneId);
  assert.equal(loaded.body.state, 'active');
  assert.ok(loaded.body.conversation_surface?.paragraphs?.length >= 1);
  assert.ok(loaded.body.clarifying_questions?.length >= 1);
  assert.ok(loaded.body.committed_social_moves?.length >= 1);
  assert.ok(loaded.body.dialogue_exits?.length >= 1);
  assertPlayerSafePayload(loaded.body, `${dialogueSceneId} current dialogue`);
  return loaded.body;
}

async function askQuestion(player, dialogueSceneId, questionId, extra = {}) {
  const beforeMoves = await socialMoveCount(player, dialogueSceneId);
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
  assert.equal(await socialMoveCount(player, dialogueSceneId), beforeMoves);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} CQ ${questionId}`);
  return result.body;
}

async function previewMove(player, dialogueSceneId, moveId, submittedText, lifecycleContext = null, extra = {}) {
  const beforeMoves = await socialMoveCount(player, dialogueSceneId);
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
  assert.equal(Object.hasOwn(result.body.preview, 'confidence'), false);
  assert.equal(await socialMoveCount(player, dialogueSceneId), beforeMoves);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} preview ${moveId}`);
  return result.body;
}

async function submitMove(player, dialogueSceneId, moveId, submittedText, lifecycleContext, extra = {}) {
  const beforeMoves = await socialMoveCount(player, dialogueSceneId);
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
  assert.equal(await socialMoveCount(player, dialogueSceneId), beforeMoves + 1);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} submit ${moveId}`);
  return result.body;
}

async function runSocialMove(player, dialogueSceneId, moveId, text, lifecycleContext, extra = {}) {
  const preview = await previewMove(player, dialogueSceneId, moveId, text, lifecycleContext, extra);
  return submitMove(player, dialogueSceneId, moveId, text, preview.lifecycle_context, extra);
}

async function exitDialogue(player, dialogueSceneId, exitId, lifecycleContext = null) {
  const beforeRecords = await completedRecordCount(player, dialogueSceneId);
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
  assert.equal(await completedRecordCount(player, dialogueSceneId), beforeRecords + 1);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} exit ${exitId}`);
  return result.body;
}

async function assertArchiveSearchFinds(player, queryText, expectedPattern) {
  const search = await request(`/api/play/dialogue/search?q=${encodeURIComponent(queryText)}`, {
    headers: player.headers,
  });
  assert.equal(search.response.status, 200);
  assert.ok(search.body.results.length >= 1, `search should find ${queryText}`);
  assert.match(JSON.stringify(search.body), expectedPattern);
  assertPlayerSafePayload(search.body, `dialogue search ${queryText}`);
}

async function runDialoguePath(player, config) {
  const loaded = await loadDialogue(player, config.dialogueSceneId);
  const question = config.questionId
    ? await askQuestion(player, config.dialogueSceneId, config.questionId, config.questionExtra ?? {})
    : loaded;
  let latest = question;
  for (const move of config.moves ?? []) {
    latest = await runSocialMove(
      player,
      config.dialogueSceneId,
      move.moveId,
      move.text,
      latest.lifecycle_context,
      move.extra ?? {}
    );
  }
  return exitDialogue(player, config.dialogueSceneId, config.exitId, latest.lifecycle_context);
}

function assertAcceptanceFixtureShape() {
  const fixture = acceptanceFixture();
  assert.equal(fixture.fixture_id, 'greyvale_6b15_vertical_slice_acceptance');
  assert.equal(fixture.expected_final_status, 'endpoint_reached');
  assert.equal(fixture.expected_endpoint.gm_dev_handoff_kind, 'combat_pending');
  assert.ok(
    fixture.preview_consistency_assertions.includes('previews_are_non_mutating'),
    'acceptance fixture should require non-mutating previews'
  );
  assert.ok(
    fixture.preview_consistency_assertions.includes('exploration_preview_expectations_align_with_resolution_outputs'),
    'acceptance fixture should require exploration preview/result alignment'
  );
  assert.ok(
    fixture.preview_consistency_assertions.includes('dialogue_preview_expectations_align_with_resolution_outputs'),
    'acceptance fixture should require dialogue preview/result alignment'
  );
  assert.ok(
    fixture.outcome_quality_assertions.includes('committed_results_include_attempt_result_and_next_when_relevant'),
    'acceptance fixture should require committed result section quality'
  );
  assert.ok(
    fixture.outcome_quality_assertions.includes('failure_partial_or_unavailable_results_include_safe_complication_or_recovery'),
    'acceptance fixture should require safe failure/partial/recovery framing'
  );
  assert.ok(
    fixture.outcome_quality_assertions.includes('player_result_bundles_hide_raw_output_writes_and_gm_dev_diagnostics'),
    'acceptance fixture should require player-safe result bundles'
  );
  assert.ok(
    fixture.mutation_safety_assertions.includes('committed_mutations_follow_canonical_write_group_order'),
    'acceptance fixture should require canonical mutation ordering'
  );
  assert.ok(
    fixture.mutation_safety_assertions.includes('duplicate_submits_do_not_duplicate_outputs_or_action_windows'),
    'acceptance fixture should require duplicate submit safety'
  );
  assert.ok(
    fixture.mutation_safety_assertions.includes('stale_submits_are_rejected_without_mutation'),
    'acceptance fixture should require stale submit safety'
  );
  assert.ok(
    fixture.mutation_safety_assertions.includes('player_payloads_hide_mutation_plan_dedupe_and_transaction_internals'),
    'acceptance fixture should require mutation internals to stay player-hidden'
  );
  assert.ok(
    fixture.transition_orchestration_assertions.includes('scene_transitions_open_exploration_action_windows'),
    'acceptance fixture should require scene transitions to open exploration windows'
  );
  assert.ok(
    fixture.transition_orchestration_assertions.includes('dialogue_exits_return_to_exploration_action_windows'),
    'acceptance fixture should require dialogue exits to return to exploration windows'
  );
  assert.ok(
    fixture.transition_orchestration_assertions.includes('endpoint_future_supported_is_review_only'),
    'acceptance fixture should require endpoint/future-supported review-only behavior'
  );
  assert.ok(
    fixture.transition_orchestration_assertions.includes('player_payloads_hide_internal_transition_and_next_beat_routing'),
    'acceptance fixture should require transition/next-beat internals to stay player-hidden'
  );
  assert.ok(
    fixture.read_model_refresh_assertions.includes('committed_result_bundle_aligns_with_refreshed_read_model'),
    'acceptance fixture should require result/read model alignment'
  );
  assert.ok(
    fixture.read_model_refresh_assertions.includes('read_model_refresh_occurs_after_mutation_and_next_beat_selection'),
    'acceptance fixture should require post-mutation read model refresh'
  );
  assert.ok(
    fixture.read_model_refresh_assertions.includes('endpoint_read_model_is_review_only_and_player_safe'),
    'acceptance fixture should require endpoint read model safety'
  );
  assert.ok(
    fixture.read_model_refresh_assertions.includes('player_payloads_hide_read_model_refresh_internals'),
    'acceptance fixture should require read model refresh internals to stay player-hidden'
  );
  assert.ok(
    fixture.resolution_trace_assertions.includes('canonical_exploration_beats_have_gm_dev_resolution_trace'),
    'acceptance fixture should require exploration resolution traces'
  );
  assert.ok(
    fixture.resolution_trace_assertions.includes('canonical_dialogue_beats_have_gm_dev_resolution_trace'),
    'acceptance fixture should require dialogue resolution traces'
  );
  assert.ok(
    fixture.resolution_trace_assertions.includes('rusk_endpoint_has_future_supported_resolution_trace'),
    'acceptance fixture should require Rusk endpoint traceability'
  );
  assert.ok(
    fixture.resolution_trace_assertions.includes('player_payloads_hide_resolution_trace_and_gm_dev_diagnostics'),
    'acceptance fixture should require traces to stay player-hidden'
  );
  const canonical = canonicalPathFixture();
  assert.deepEqual(
    canonical.steps.map((step) => step.id),
    [
      'start_greyvale',
      'free_focus_broken_axle',
      'inspect_broken_caravan',
      'to_grey_road_inn',
      'tomas_pattern',
      'elin_memory',
      'to_dunmere',
      'mara_assumption',
      'lysa_suspicion',
      'garren_shrine_route',
      'to_old_forest_path',
      'track_old_path',
      'to_shrine_ruins',
      'rusk_confrontation',
      'endpoint_review',
    ]
  );
  const inspectStep = canonical.steps.find((step) => step.id === 'inspect_broken_caravan');
  const innTransitionStep = canonical.steps.find((step) => step.id === 'to_grey_road_inn');
  const tomasStep = canonical.steps.find((step) => step.id === 'tomas_pattern');
  const elinStep = canonical.steps.find((step) => step.id === 'elin_memory');
  const oldPathTransitionStep = canonical.steps.find((step) => step.id === 'to_old_forest_path');
  const ruskStep = canonical.steps.find((step) => step.id === 'rusk_confrontation');
  const endpointStep = canonical.steps.find((step) => step.id === 'endpoint_review');
  const startStep = canonical.steps.find((step) => step.id === 'start_greyvale');
  assert.deepEqual(inspectStep.preview_expectations, ['discovery']);
  assert.equal(startStep.expected_read_model_state, 'exploration_active');
  assert.equal(startStep.expected_active_state_summary, 'exploration_active');
  assert.deepEqual(inspectStep.expected_result_bundle_sections, [
    'attempted_action',
    'result',
    'discoveries',
    'progress',
    'next',
  ]);
  assert.deepEqual(inspectStep.expected_mutation_write_groups, [
    'objective_writes',
    'knowledge_writes',
    'history_latest_development_writes',
    'action_window_close_open_writes',
    'read_model_refresh_hook',
  ]);
  assert.equal(inspectStep.duplicate_submit_expected, 'safe_no_duplicate_outputs');
  assert.equal(inspectStep.stale_submit_expected, 'safe_no_mutation_recovery');
  assert.equal(inspectStep.expected_transition_decision, 'stay_in_current_scene');
  assert.equal(inspectStep.expected_next_beat_decision, 'open_exploration_action_window');
  assert.equal(inspectStep.expected_read_model_state, 'exploration_active');
  assert.ok(inspectStep.expected_trace_sections.includes('mutation_plan'));
  assert.ok(inspectStep.expected_trace_sections.includes('projection_comparison'));
  assert.deepEqual(inspectStep.expected_read_model_contains.knowledge, ['clue_caravan_irregularity']);
  assert.deepEqual(inspectStep.expected_read_model_contains.objectives, [
    'witness-the-aftermath',
    'gather-local-insight',
  ]);
  assert.equal(innTransitionStep.expected_transition_decision, 'scene_transition');
  assert.equal(innTransitionStep.expected_next_beat_decision, 'open_exploration_action_window');
  assert.equal(innTransitionStep.expected_read_model_contains.scene_key, 'grey-road-inn');
  assert.ok(tomasStep.preview_expectations.includes('social_consequence'));
  assert.ok(tomasStep.expected_result_bundle_sections.includes('consequences'));
  assert.ok(tomasStep.expected_mutation_write_groups.includes('completed_record_transcript_archive_search_writes'));
  assert.equal(tomasStep.duplicate_submit_expected, 'safe_no_duplicate_completed_record');
  assert.equal(tomasStep.expected_transition_decision, 'return_to_exploration');
  assert.equal(tomasStep.expected_next_beat_decision, 'open_exploration_action_window');
  assert.equal(tomasStep.expected_read_model_state, 'exploration_active');
  assert.ok(tomasStep.expected_trace_sections.includes('relationship_social_writes'));
  assert.ok(tomasStep.expected_trace_sections.includes('completed_record_transcript_archive_search'));
  assert.deepEqual(tomasStep.expected_read_model_contains.completed_records, [
    'greyvale_tomas_roadside_worries_dialogue',
  ]);
  assert.equal(elinStep.expected_transition_decision, 'return_to_exploration');
  assert.deepEqual(elinStep.expected_read_model_contains.knowledge, [
    'elin_sash_has_roadward_knot',
    'shrine_bell_stopped_attack',
  ]);
  assert.equal(oldPathTransitionStep.expected_transition_decision, 'scene_transition');
  assert.equal(oldPathTransitionStep.expected_next_beat_decision, 'open_exploration_action_window');
  assert.equal(oldPathTransitionStep.expected_read_model_contains.scene_key, 'old-forest-path');
  assert.ok(ruskStep.preview_expectations.includes('endpoint'));
  assert.ok(ruskStep.expected_result_bundle_sections.includes('complications'));
  assert.ok(ruskStep.expected_mutation_write_groups.includes('transition_endpoint_writes'));
  assert.equal(ruskStep.endpoint_idempotency_expected, 'status_and_outputs_set_once');
  assert.equal(ruskStep.expected_transition_decision, 'future_supported');
  assert.equal(ruskStep.expected_next_beat_decision, 'future_supported_review_only');
  assert.equal(ruskStep.expected_read_model_state, 'endpoint_review');
  assert.ok(ruskStep.expected_trace_sections.includes('transition_endpoint_writes'));
  assert.ok(ruskStep.expected_trace_sections.includes('projection_comparison'));
  assert.deepEqual(ruskStep.expected_read_model_contains.objectives, ['uncover-the-truth', 'resolve-the-threat']);
  assert.equal(endpointStep.expected_next_beat_decision, 'endpoint_review_only');
  assert.equal(endpointStep.expected_read_model_state, 'endpoint_review');
  assert.equal(endpointStep.expected_active_state_summary, 'endpoint_review');
  return canonical;
}

test('Stage 6B.15.8 acceptance fixture defines the official semantic route', () => {
  assertAcceptanceFixtureShape();
});

test('Stage 6B.15.8 canonical web-route acceptance reaches the player-safe Rusk endpoint', async () => {
  const canonical = assertAcceptanceFixtureShape();
  const executedSteps = [];
  const player = await createReadyPlayer('canonical');
  await grantDebugCapability(player);

  let scene = player.started.current_scene;
  executedSteps.push('start_greyvale');
  assert.equal(scene.scene.key, 'broken-caravan-site');
  assert.equal(scene.current_objective.key, 'witness-the-aftermath');
  assert.equal(scene.action_status.state, 'action_needed');
  assertPlayerSafePayload(player.started, 'start response');

  const resumedAfterStart = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(resumedAfterStart.response.status, 200);
  assert.equal(resumedAfterStart.body.assignment.result_type, 'resumed_existing_campaign');
  assert.equal(resumedAfterStart.body.current_scene.scene.key, 'broken-caravan-site');
  assertPlayerSafePayload(resumedAfterStart.body, 'resume after start');

  const focus = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: 'focus_broken_axle',
      scene_id: scene.scene.scene_id,
    }),
  });
  executedSteps.push('free_focus_broken_axle');
  assert.equal(focus.response.status, 200, JSON.stringify(focus.body));
  assert.equal(focus.body.free_focus_result?.interaction_id, 'focus_broken_axle');
  assert.equal(await actionSubmissionCount(scene.action_status.action_window_id, player.characterId), 0);
  assertPlayerSafePayload(focus.body, 'free focus');

  const inspect = findInteractionAffordance(scene, 'inspect-broken-caravan', 'inspect broken caravan');
  const firstWindowId = scene.action_status.action_window_id;
  const inspectPreview = await previewAction(player, inspect, 'I inspect the broken caravan.', {
    selected_verb: 'investigate',
    continue_free_focus_interaction_id: 'focus_broken_axle',
  });
  assert.equal(await actionSubmissionCount(firstWindowId, player.characterId), 0);
  assert.equal(await knowledgeRowCount(player, 'clue_caravan_irregularity'), 0);
  await submitAction(player, inspect, 'I inspect the broken caravan.', inspectPreview.lifecycle_context, {
    selected_verb: 'investigate',
    continue_free_focus_interaction_id: 'focus_broken_axle',
  });
  const duplicateInspect = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: 'I inspect the broken caravan.',
      selected_affordance_id: inspect.affordance_id,
      lifecycle_context: inspectPreview.lifecycle_context,
      selected_verb: 'investigate',
      continue_free_focus_interaction_id: 'focus_broken_axle',
    }),
  });
  assertSafeLifecycleError(duplicateInspect, /moment has changed/i);
  assert.equal(await actionSubmissionCount(firstWindowId, player.characterId), 1);
  scene = await advanceBeat(player, 'inspect broken caravan', { roll: 20 });
  executedSteps.push('inspect_broken_caravan');
  assert.equal(await playerBeatResultCount(firstWindowId, player.characterId), 1);
  assert.notEqual(scene.action_status.action_window_id, firstWindowId);
  await assertObjective(player, 'witness-the-aftermath', 'completed', 1);
  await assertObjective(player, 'gather-local-insight', 'active', 0);
  await assertKnowledgeOnce(player, 'clue_caravan_irregularity');

  const staleOldWindowSubmit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: 'I inspect the broken caravan.',
      selected_affordance_id: inspect.affordance_id,
      lifecycle_context: inspectPreview.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(staleOldWindowSubmit, /moment has changed/i);

  scene = await submitTransitionAndAdvance(player, scene, 'leave-broken-caravan-for-inn', 'I head to the Grey Road Inn.');
  executedSteps.push('to_grey_road_inn');
  assert.equal(scene.scene.key, 'grey-road-inn');
  assertDialogueEntries(scene, [dialogueSceneIds.tomas, dialogueSceneIds.elin], 'Grey Road Inn');

  const tomasLoaded = await loadDialogue(player, dialogueSceneIds.tomas);
  const tomasQuestion = await askQuestion(player, dialogueSceneIds.tomas, 'clarify_bandit_pattern');
  const tomasPreview = await previewMove(
    player,
    dialogueSceneIds.tomas,
    'move_compare_caravan_pattern',
    'I compare the broken caravan evidence against his road pattern.',
    tomasQuestion.lifecycle_context
  );
  assert.equal(await socialMoveCount(player, dialogueSceneIds.tomas), 0);
  const tomasMove = await submitMove(
    player,
    dialogueSceneIds.tomas,
    'move_compare_caravan_pattern',
    'I compare the broken caravan evidence against his road pattern.',
    tomasPreview.lifecycle_context,
    { forced_outcome: 'success' }
  );
  const duplicateTomasMove = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: dialogueSceneIds.tomas,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence against his road pattern.',
      forced_outcome: 'success',
      lifecycle_context: tomasPreview.lifecycle_context,
    }),
  });
  assertSafeLifecycleError(duplicateTomasMove, /moment has changed/i);
  await exitDialogue(player, dialogueSceneIds.tomas, 'exit_return_to_common_room', tomasMove.lifecycle_context);
  executedSteps.push('tomas_pattern');
  assert.equal(tomasLoaded.dialogue_scene.dialogue_scene_id, dialogueSceneIds.tomas);
  await assertObjective(player, 'gather-local-insight', 'active', 1);
  await assertKnowledgeOnce(player, 'innkeeper_tracks_road_patterns');

  await runDialoguePath(player, {
    dialogueSceneId: dialogueSceneIds.elin,
    questionId: 'clarify_torn_sash',
    moves: [
      {
        moveId: 'move_press_shrine_warning',
        text: 'I press gently for what Elin remembers about the shrine warning.',
        extra: { forced_outcome: 'success' },
      },
    ],
    exitId: 'exit_return_to_common_room',
  });
  executedSteps.push('elin_memory');
  await assertKnowledgeOnce(player, 'elin_sash_has_roadward_knot');
  await assertKnowledgeOnce(player, 'shrine_bell_stopped_attack');

  scene = await currentScene(player);
  scene = await submitTransitionAndAdvance(player, scene, 'continue-to-dunmere', 'I continue to Dunmere.');
  executedSteps.push('to_dunmere');
  assert.equal(scene.scene.key, 'dunmere-village');
  assertDialogueEntries(
    scene,
    [dialogueSceneIds.mara, dialogueSceneIds.lysa, dialogueSceneIds.garren],
    'Dunmere'
  );

  await runDialoguePath(player, {
    dialogueSceneId: dialogueSceneIds.mara,
    questionId: 'clarify_mara_bandit_explanation',
    moves: [
      {
        moveId: 'move_report_broken_caravan',
        text: 'I report what I saw at the broken caravan.',
        extra: { forced_outcome: 'success' },
      },
    ],
    exitId: 'exit_return_to_dunmere_village',
  });
  executedSteps.push('mara_assumption');
  await assertKnowledgeOnce(player, 'dunmere_wants_simple_answer');

  await runDialoguePath(player, {
    dialogueSceneId: dialogueSceneIds.lysa,
    questionId: 'clarify_lysa_hidden_truth',
    moves: [
      {
        moveId: 'move_ground_lysa_suspicion',
        text: 'I try to ground Lysa suspicion in what she actually saw.',
        extra: { forced_outcome: 'success' },
      },
    ],
    exitId: 'exit_return_to_dunmere_village',
  });
  executedSteps.push('lysa_suspicion');
  await assertKnowledgeOnce(player, 'village_blames_hunter_and_road');

  await runDialoguePath(player, {
    dialogueSceneId: dialogueSceneIds.garren,
    questionId: 'clarify_garren_old_path_sighting',
    moves: [
      {
        moveId: 'move_ask_safest_way_to_approach_shrine',
        text: 'I ask Garren for the safest way to approach the shrine.',
        extra: { forced_outcome: 'success', continue_as_committed_social_move: true },
      },
    ],
    exitId: 'exit_return_to_dunmere_village',
  });
  executedSteps.push('garren_shrine_route');
  await assertObjective(player, 'gather-local-insight', 'completed', 2);
  await assertObjective(player, 'follow-the-leads', 'active', 0);
  await assertKnowledgeOnce(player, 'garren_knows_old_paths');
  await assertKnowledgeOnce(player, 'old_path_still_used');
  await assertKnowledgeOnce(player, 'tracks_converge_on_shrine');

  scene = await currentScene(player);
  scene = await submitTransitionAndAdvance(player, scene, 'follow-the-old-path', 'I take the old forest path.');
  executedSteps.push('to_old_forest_path');
  assert.equal(scene.scene.key, 'old-forest-path');

  const track = findInteractionAffordance(scene, 'track-the-old-path', 'track old path');
  assert.ok(track);
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
  executedSteps.push('track_old_path');
  assert.equal(await characterFlagValue(player, 'shrine_path_known'), true);
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
  executedSteps.push('to_shrine_ruins');
  assert.equal(scene.scene.key, 'shrine-ruins');
  assertDialogueEntries(scene, [dialogueSceneIds.rusk], 'Shrine ruins');

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
  assert.ok(ruskExitIds.includes('exit_rusk_confrontation'));
  await exitDialogue(player, dialogueSceneIds.rusk, 'exit_rusk_confrontation', ruskDeeperMove.lifecycle_context);
  executedSteps.push('rusk_confrontation');
  await assertObjective(player, 'uncover-the-truth', 'completed', 1);
  await assertObjective(player, 'resolve-the-threat', 'active', 0);
  await assertKnowledgeOnce(player, 'bandits_not_fully_self_directed');
  await assertKnowledgeOnce(player, 'shrine_depth_unlocked');
  await assertKnowledgeOnce(player, 'hollow_reaches_shrine_above');

  const finalScene = await currentScene(player, '?include_mechanics=true');
  executedSteps.push('endpoint_review');
  assert.equal(finalScene.scene.key, 'shrine-ruins');
  assert.equal(finalScene.action_status.state, 'slice_endpoint_reached');
  assert.equal(finalScene.action_status.can_submit, false);
  assert.equal(finalScene.slice_endpoint.state, 'endpoint_reached');
  assert.match(finalScene.slice_endpoint.message, /end of the current Greyvale playable slice/i);
  assertPlayerSafePayload(finalScene, 'endpoint current scene');

  const endpointPreview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({ raw_text: 'I force the shrine confrontation.' }),
  });
  assert.equal(endpointPreview.response.status, 200, JSON.stringify(endpointPreview.body));
  assert.equal(endpointPreview.body.status, 'invalid');
  assert.match(endpointPreview.body.message, /end of the current Greyvale playable slice/i);
  assertPlayerSafePayload(endpointPreview.body, 'endpoint blocked preview');

  const endpointSubmit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({ raw_text: 'I force the shrine confrontation.' }),
  });
  assert.equal(endpointSubmit.response.status, 409);
  assert.match(endpointSubmit.body.error?.message ?? '', /end of the current Greyvale playable slice/i);
  assertPlayerSafePayload(endpointSubmit.body, 'endpoint blocked submit');

  const knowledge = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledge.response.status, 200);
  assert.equal(knowledge.body.current_objective.key, 'resolve-the-threat');
  for (const knowledgeKey of requiredKnowledge) {
    assert.match(JSON.stringify(knowledge.body), new RegExp(knowledgeKey), `journal should include ${knowledgeKey}`);
  }
  assertPlayerSafePayload(knowledge.body, 'knowledge journal');

  const history = await request('/api/play/campaign/history', { headers: player.headers });
  assert.equal(history.response.status, 200);
  assert.equal(history.body.state, 'active');
  assertTimelineOrdered(history.body.timeline);
  assertPlayerSafePayload(history.body, 'campaign history');
  const dialogueHistory = history.body.timeline.filter((entry) => entry.type === 'dialogue_completed');
  assert.equal(dialogueHistory.length, 6);

  const archive = await request('/api/play/dialogue/archive', { headers: player.headers });
  assert.equal(archive.response.status, 200);
  assert.equal(archive.body.records.length, 6);
  assertPlayerSafePayload(archive.body, 'dialogue archive');
  assert.equal(await completedRecordCount(player), 6);
  for (const dialogueSceneId of Object.values(dialogueSceneIds)) {
    assert.equal(await completedRecordCount(player, dialogueSceneId), 1, `${dialogueSceneId} completed once`);
  }
  for (const searchTerm of ['Tomas', 'Elin', 'Mara', 'Lysa', 'Garren', 'Rusk']) {
    await assertArchiveSearchFinds(player, searchTerm, new RegExp(searchTerm, 'i'));
  }

  const inspector = await request('/api/dev/greyvale-slice-inspector', { headers: player.headers });
  assert.equal(inspector.response.status, 200, JSON.stringify(inspector.body));
  assert.equal(inspector.body.slice_status.state, 'endpoint_reached');
  assert.equal(inspector.body.rusk_endpoint.gm_dev_handoff_debug.handoff_kind, 'combat_pending');
  assert.equal(
    inspector.body.rusk_endpoint.gm_dev_handoff_debug.future_supported_status,
    'future_supported_until_combat_system'
  );
  assert.equal(inspector.body.rusk_endpoint.gm_dev_handoff_debug.target_encounter_id, 'shrine-rusk-confrontation');
  assert.equal(inspector.body.player_vs_gm_visibility_comparison.player_projection_safe, true);
  assert.deepEqual(inspector.body.player_vs_gm_visibility_comparison.player_hidden_data_violations, []);
  assertPlayerSafePayload(inspector.body.current_scene.player_projection, 'inspector current scene player projection');
  assertPlayerSafePayload(inspector.body.memory_and_outputs.player_projection, 'inspector memory player projection');
  assertPlayerSafePayload(inspector.body.rusk_endpoint.player_projection, 'inspector endpoint player projection');

  const countsBeforeResume = {
    completedRecords: await completedRecordCount(player),
    knowledge: Object.fromEntries(
      await Promise.all(requiredKnowledge.map(async (key) => [key, await knowledgeRowCount(player, key)]))
    ),
  };
  const resumed = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.body.assignment.result_type, 'resumed_existing_campaign');
  assert.equal(resumed.body.current_scene.scene.key, 'shrine-ruins');
  assert.equal(resumed.body.current_scene.action_status.state, 'slice_endpoint_reached');
  assert.equal(resumed.body.current_scene.slice_endpoint.state, 'endpoint_reached');
  assertPlayerSafePayload(resumed.body, 'endpoint resume');
  assert.equal(await completedRecordCount(player), countsBeforeResume.completedRecords);
  for (const [knowledgeKey, count] of Object.entries(countsBeforeResume.knowledge)) {
    assert.equal(await knowledgeRowCount(player, knowledgeKey), count, `${knowledgeKey} stable after endpoint resume`);
  }

  assert.deepEqual(
    executedSteps,
    canonical.steps.map((step) => step.id),
    'executed route should match acceptance fixture step IDs'
  );
});

test('Stage 6B.15.8 alternate village order remains safe and resumable', async () => {
  const player = await createReadyPlayer('alternate_village');

  const lysa = await askQuestion(player, dialogueSceneIds.lysa, 'clarify_lysa_hidden_truth');
  await exitDialogue(player, dialogueSceneIds.lysa, 'exit_return_to_dunmere_village', lysa.lifecycle_context);
  await assertKnowledgeOnce(player, 'village_blames_hunter_and_road');

  const sceneAfterLysa = await currentScene(player);
  assert.equal(sceneAfterLysa.state, 'active');
  assert.equal(sceneAfterLysa.action_status.state, 'action_needed');

  const mara = await askQuestion(player, dialogueSceneIds.mara, 'clarify_mara_bandit_explanation');
  await exitDialogue(player, dialogueSceneIds.mara, 'exit_return_to_dunmere_village', mara.lifecycle_context);
  await assertKnowledgeOnce(player, 'dunmere_wants_simple_answer');
  assert.equal(await completedRecordCount(player, dialogueSceneIds.lysa), 1);
  assert.equal(await completedRecordCount(player, dialogueSceneIds.mara), 1);

  const knowledge = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledge.response.status, 200);
  assert.equal(JSON.stringify(knowledge.body).toLowerCase().includes('final mystery'), false);
  assertPlayerSafePayload(knowledge.body, 'alternate route knowledge');

  const current = await currentScene(player);
  assert.equal(current.state, 'active');
  assert.ok(current.action_window?.is_open_for_player, 'alternate route should remain playable after dialogue exits');
});

test('Stage 6B.15.8 normal players cannot access the GM/dev slice inspector', async () => {
  const player = await createReadyPlayer('inspector_denied');
  const denied = await request('/api/dev/greyvale-slice-inspector', { headers: player.headers });
  assert.equal(denied.response.status, 403);
  assert.match(denied.body.error?.message ?? '', /not authorized|not allowed|permission|gm|dev/i);
  assertPlayerSafePayload(denied.body, 'unauthorized inspector denial');
});
