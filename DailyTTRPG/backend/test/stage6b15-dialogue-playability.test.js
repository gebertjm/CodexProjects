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
  return `stage6b15_dialogue_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B15 Dialogue ${label}`,
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
      name: `Talker ${label.replaceAll('_', ' ').slice(0, 24)}`,
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
  'future_supported',
  'combat_routing',
  'hidden_clue_metadata',
  'gm_dev_content_ref',
  'raw_runtime_state',
  'truth_label',
  'final_mystery',
  'database constraint',
  'duplicate key',
  'stackTrace',
  'stack_trace',
];

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload);
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term), false, `${label} leaked ${term}`);
  }
}

function actionReference(action) {
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

function hasTransitionAffordance(scenePayload, transitionKey) {
  return (scenePayload.visible_affordances ?? []).some((candidate) =>
    (candidate.available_actions ?? []).some((action) => {
      const reference = actionReference(action);
      return reference.transitionId === transitionKey || reference.actionKey === `move_scene:${transitionKey}`;
    })
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
  assert.equal(preview.body.action_window_id, scenePayload.action_status.action_window_id);
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
  assert.ok(loaded.body.conversation_surface?.paragraphs?.length >= 1, `${dialogueSceneId} should have surface text`);
  assert.ok(loaded.body.clarifying_questions?.length >= 1, `${dialogueSceneId} should expose CQs`);
  assert.ok(loaded.body.committed_social_moves?.length >= 1, `${dialogueSceneId} should expose CSMs`);
  assert.ok(loaded.body.dialogue_exits?.length >= 1, `${dialogueSceneId} should expose exits`);
  assertPlayerSafePayload(loaded.body, `${dialogueSceneId} current dialogue`);
  return loaded.body;
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

async function completedRecordCount(player, dialogueSceneId) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_completed_dialogue_record
      WHERE character_id = $1
        AND dialogue_scene_key = $2
    `,
    [player.characterId, dialogueSceneId]
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
  assert.equal(result.body.current_dialogue.dialogue_scene_state.committed_social_move_count, beforeMoves);
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
  assert.equal(result.body.preview.move_id, moveId);
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
  assert.equal(result.body.lifecycle_context.committed_social_move_count, beforeMoves + 1);
  assert.equal(await socialMoveCount(player, dialogueSceneId), beforeMoves + 1);
  assertPlayerSafePayload(result.body, `${dialogueSceneId} submit ${moveId}`);
  return result.body;
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

async function assertKnowledgeIncludes(player, knowledgeId) {
  const knowledge = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledge.response.status, 200);
  assert.match(JSON.stringify(knowledge.body), new RegExp(knowledgeId));
  assertPlayerSafePayload(knowledge.body, `knowledge journal ${knowledgeId}`);
}

async function assertDialogueSearchFinds(player, queryText, expectedPattern) {
  const search = await request(`/api/play/dialogue/search?q=${encodeURIComponent(queryText)}`, {
    headers: player.headers,
  });
  assert.equal(search.response.status, 200);
  assert.match(JSON.stringify(search.body), expectedPattern);
  assertPlayerSafePayload(search.body, `dialogue search ${queryText}`);
}

async function assertArchiveRecordSafe(player, recordId, expectedPattern) {
  const archive = await request(`/api/play/dialogue/archive/${recordId}`, { headers: player.headers });
  assert.equal(archive.response.status, 200);
  assert.match(JSON.stringify(archive.body), expectedPattern);
  assert.ok((archive.body.record?.transcript_turns ?? []).length >= 1);
  assertPlayerSafePayload(archive.body, `archive record ${recordId}`);
}

async function assertDialogueDebug(player, dialogueSceneId, expectedPattern = null) {
  const debug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${dialogueSceneId}`, {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.status, 'ok');
  assert.equal(debug.body.scene_state.dialogue_scene_id, dialogueSceneId);
  assert.ok(debug.body.scene_state.raw_runtime_state);
  assert.ok(Array.isArray(debug.body.audit_timeline.records));
  if (expectedPattern) {
    assert.match(JSON.stringify(debug.body), expectedPattern);
  }
  return debug.body;
}

test('Stage 6B.15.3 Greyvale dialogue route is playable from inn to Rusk handoff', async () => {
  const player = await createReadyPlayer('canonical_route');
  await grantDebugCapability(player);

  let scene = player.started.current_scene;
  assert.equal(scene.scene.key, 'broken-caravan-site');
  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'leave-broken-caravan-for-inn',
    'I head to the Grey Road Inn.'
  );
  assert.equal(scene.scene.key, 'grey-road-inn');
  assertDialogueEntries(scene, [dialogueSceneIds.tomas, dialogueSceneIds.elin], 'Grey Road Inn');

  await loadDialogue(player, dialogueSceneIds.tomas);
  const tomasQuestion = await askQuestion(player, dialogueSceneIds.tomas, 'clarify_bandit_pattern');
  assert.ok(
    tomasQuestion.clarifying_question_result.result.knowledge_grants_applied.includes(
      'innkeeper_tracks_road_patterns'
    )
  );
  const tomasPreview = await previewMove(
    player,
    dialogueSceneIds.tomas,
    'move_compare_caravan_pattern',
    'I compare the broken caravan evidence against his road pattern.',
    tomasQuestion.lifecycle_context
  );
  const tomasMove = await submitMove(
    player,
    dialogueSceneIds.tomas,
    'move_compare_caravan_pattern',
    'I compare the broken caravan evidence against his road pattern.',
    tomasPreview.lifecycle_context,
    { forced_outcome: 'success' }
  );
  const tomasExit = await exitDialogue(
    player,
    dialogueSceneIds.tomas,
    'exit_return_to_common_room',
    tomasMove.lifecycle_context
  );
  await assertKnowledgeIncludes(player, 'innkeeper_tracks_road_patterns');
  await assertArchiveRecordSafe(
    player,
    tomasExit.completed_dialogue_record.completed_dialogue_record_id,
    /Tomas|road/i
  );
  await assertDialogueSearchFinds(player, 'Tomas', /Tomas/i);
  await assertDialogueDebug(player, dialogueSceneIds.tomas, /move_compare_caravan_pattern/);

  scene = await currentScene(player);
  assert.equal(scene.scene.key, 'grey-road-inn');
  assertDialogueEntries(scene, [dialogueSceneIds.elin], 'Grey Road Inn after Tomas');

  await loadDialogue(player, dialogueSceneIds.elin);
  const elinQuestion = await askQuestion(player, dialogueSceneIds.elin, 'clarify_torn_sash');
  assert.ok(
    elinQuestion.clarifying_question_result.result.knowledge_grants_applied.includes(
      'elin_sash_has_roadward_knot'
    )
  );
  const elinPreview = await previewMove(
    player,
    dialogueSceneIds.elin,
    'move_press_shrine_warning',
    'I press gently for what Elin remembers about the shrine warning.',
    elinQuestion.lifecycle_context
  );
  const elinMove = await submitMove(
    player,
    dialogueSceneIds.elin,
    'move_press_shrine_warning',
    'I press gently for what Elin remembers about the shrine warning.',
    elinPreview.lifecycle_context,
    { forced_outcome: 'success' }
  );
  assert.ok(elinMove.social_move_result.knowledge_grants_applied.includes('shrine_bell_stopped_attack'));
  const elinExit = await exitDialogue(
    player,
    dialogueSceneIds.elin,
    'exit_return_to_common_room',
    elinMove.lifecycle_context
  );
  await assertKnowledgeIncludes(player, 'elin_sash_has_roadward_knot');
  await assertKnowledgeIncludes(player, 'shrine_bell_stopped_attack');
  await assertArchiveRecordSafe(
    player,
    elinExit.completed_dialogue_record.completed_dialogue_record_id,
    /Elin|shrine|memory/i
  );
  await assertDialogueSearchFinds(player, 'Elin', /Elin/i);
  await assertDialogueDebug(player, dialogueSceneIds.elin, /move_press_shrine_warning/);

  scene = await currentScene(player);
  scene = await submitTransitionAndAdvance(player, scene, 'continue-to-dunmere', 'I continue to Dunmere.');
  assert.equal(scene.scene.key, 'dunmere-village');
  assertDialogueEntries(
    scene,
    [dialogueSceneIds.mara, dialogueSceneIds.lysa, dialogueSceneIds.garren],
    'Dunmere village'
  );

  await loadDialogue(player, dialogueSceneIds.mara);
  const maraQuestion = await askQuestion(player, dialogueSceneIds.mara, 'clarify_mara_bandit_explanation');
  assert.ok(
    maraQuestion.clarifying_question_result.result.knowledge_grants_applied.includes(
      'dunmere_wants_simple_answer'
    )
  );
  const maraPreview = await previewMove(
    player,
    dialogueSceneIds.mara,
    'move_report_broken_caravan',
    'I report what I saw at the broken caravan.',
    maraQuestion.lifecycle_context
  );
  const maraMove = await submitMove(
    player,
    dialogueSceneIds.mara,
    'move_report_broken_caravan',
    'I report what I saw at the broken caravan.',
    maraPreview.lifecycle_context,
    { forced_outcome: 'success' }
  );
  await exitDialogue(player, dialogueSceneIds.mara, 'exit_return_to_dunmere_village', maraMove.lifecycle_context);
  await assertKnowledgeIncludes(player, 'dunmere_wants_simple_answer');

  await loadDialogue(player, dialogueSceneIds.lysa);
  const lysaQuestion = await askQuestion(player, dialogueSceneIds.lysa, 'clarify_lysa_hidden_truth');
  assert.ok(
    lysaQuestion.clarifying_question_result.result.knowledge_grants_applied.includes(
      'village_blames_hunter_and_road'
    )
  );
  const lysaPreview = await previewMove(
    player,
    dialogueSceneIds.lysa,
    'move_ground_lysa_suspicion',
    'I try to ground Lysa’s suspicion in what she actually saw.',
    lysaQuestion.lifecycle_context
  );
  const lysaMove = await submitMove(
    player,
    dialogueSceneIds.lysa,
    'move_ground_lysa_suspicion',
    'I try to ground Lysa’s suspicion in what she actually saw.',
    lysaPreview.lifecycle_context,
    { forced_outcome: 'success' }
  );
  await exitDialogue(player, dialogueSceneIds.lysa, 'exit_return_to_dunmere_village', lysaMove.lifecycle_context);
  await assertKnowledgeIncludes(player, 'village_blames_hunter_and_road');

  await loadDialogue(player, dialogueSceneIds.garren);
  const garrenQuestion = await askQuestion(player, dialogueSceneIds.garren, 'clarify_garren_old_path_sighting');
  assert.ok(
    garrenQuestion.clarifying_question_result.result.knowledge_grants_applied.includes(
      'garren_knows_old_paths'
    )
  );
  const garrenPreview = await previewMove(
    player,
    dialogueSceneIds.garren,
    'move_ask_safest_way_to_approach_shrine',
    'I ask Garren for the safest way to approach the shrine.',
    garrenQuestion.lifecycle_context,
    { continue_as_committed_social_move: true }
  );
  const garrenMove = await submitMove(
    player,
    dialogueSceneIds.garren,
    'move_ask_safest_way_to_approach_shrine',
    'I ask Garren for the safest way to approach the shrine.',
    garrenPreview.lifecycle_context,
    { forced_outcome: 'success', continue_as_committed_social_move: true }
  );
  assert.ok(garrenMove.social_move_result.knowledge_grants_applied.includes('tracks_converge_on_shrine'));
  assert.equal(await characterFlagValue(player, 'shrine_path_known'), true);
  await exitDialogue(player, dialogueSceneIds.garren, 'exit_return_to_dunmere_village', garrenMove.lifecycle_context);
  await assertKnowledgeIncludes(player, 'tracks_converge_on_shrine');
  await assertDialogueSearchFinds(player, 'Garren', /Garren/i);
  await assertDialogueDebug(player, dialogueSceneIds.garren, /tracks_converge_on_shrine/);

  const journal = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(journal.response.status, 200);
  const journalText = JSON.stringify(journal.body).toLowerCase();
  assert.equal(journalText.includes('confirmed truth'), false);
  assert.equal(journalText.includes('final mystery'), false);
  assert.equal(journalText.includes('whispering presence'), false);
  assertPlayerSafePayload(journal.body, 'village dialogue journal');

  scene = await currentScene(player);
  assert.equal(scene.scene.key, 'dunmere-village');
  scene = await submitTransitionAndAdvance(player, scene, 'follow-the-old-path', 'I take the old forest path.');
  assert.equal(scene.scene.key, 'old-forest-path');
  assert.ok(
    hasTransitionAffordance(scene, 'follow-the-tracks-to-the-shrine'),
    'Garren route knowledge should reveal the shrine transition from the old path'
  );
  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'follow-the-tracks-to-the-shrine',
    'I follow the signs toward the shrine.'
  );
  assert.equal(scene.scene.key, 'shrine-ruins');
  assertDialogueEntries(scene, [dialogueSceneIds.rusk], 'Shrine ruins');

  await loadDialogue(player, dialogueSceneIds.rusk);
  const ruskQuestion = await askQuestion(player, dialogueSceneIds.rusk, 'clarify_rusk_what_he_hears');
  assert.ok(
    ruskQuestion.clarifying_question_result.result.knowledge_grants_applied.includes(
      'bandits_not_fully_self_directed'
    )
  );
  const ruskPreview = await previewMove(
    player,
    dialogueSceneIds.rusk,
    'move_keep_rusk_talking',
    'I keep Rusk talking while his control wavers.',
    ruskQuestion.lifecycle_context
  );
  const ruskMove = await submitMove(
    player,
    dialogueSceneIds.rusk,
    'move_keep_rusk_talking',
    'I keep Rusk talking while his control wavers.',
    ruskPreview.lifecycle_context,
    { forced_outcome: 'success' }
  );
  assert.ok(ruskMove.social_move_result.knowledge_grants_applied.includes('bandits_not_fully_self_directed'));
  const ruskExit = await exitDialogue(
    player,
    dialogueSceneIds.rusk,
    'exit_rusk_combat_pending',
    ruskMove.lifecycle_context
  );
  assert.match(JSON.stringify(ruskExit), /combat/i);
  assertPlayerSafePayload(ruskExit, 'Rusk exit payload');
  await assertKnowledgeIncludes(player, 'bandits_not_fully_self_directed');
  await assertArchiveRecordSafe(
    player,
    ruskExit.completed_dialogue_record.completed_dialogue_record_id,
    /Rusk|shrine|combat/i
  );
  await assertDialogueSearchFinds(player, 'Rusk', /Rusk/i);
  const ruskDebug = await assertDialogueDebug(player, dialogueSceneIds.rusk, /combat_pending/);
  assert.match(JSON.stringify(ruskDebug), /future_supported_until_surface_threat_resolved|combat_pending/);

  const resumed = await currentScene(player, '?include_mechanics=true');
  assert.equal(resumed.scene.key, 'shrine-ruins');
  assert.equal(resumed.action_status.state, 'action_needed');
  assertPlayerSafePayload(resumed, 'post-Rusk current scene');
});
