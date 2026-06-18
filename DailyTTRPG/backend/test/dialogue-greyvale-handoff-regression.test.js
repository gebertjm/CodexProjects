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
  return `greyvale_handoff_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Greyvale Handoff ${label}`,
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
      name: `Handoff ${label.replaceAll('_', ' ').slice(0, 24)}`,
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
];

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload);
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term), false, `${label} leaked ${term}`);
  }
}

function assertPreviewHidesConfidence(payload, label = 'preview') {
  assert.equal(Object.hasOwn(payload.preview ?? {}, 'confidence'), false, `${label} leaked match confidence`);
}

function assertSafeError(result, messagePattern = /conversation has ended|not available|current scene/i) {
  assert.equal(result.response.status, 409);
  assert.match(result.body.error?.message ?? '', messagePattern);
  assertPlayerSafePayload(result.body, 'safe stale-state error');
}

async function runtimeStateFor(player, dialogueSceneId) {
  const result = await query(
    `
      SELECT id, value_json
      FROM dnd5e_dialogue_scene_state
      WHERE character_id = $1
        AND dialogue_scene_key = $2
        AND field_name = '__runtime_state__'
        AND scope = 'dialogue_scene_state'
      ORDER BY id DESC
      LIMIT 1
    `,
    [player.characterId, dialogueSceneId]
  );
  return result.rows[0] ?? null;
}

async function assertRuntimeStatus(player, dialogueSceneId, expectedStatus) {
  const row = await runtimeStateFor(player, dialogueSceneId);
  assert.ok(row, `${dialogueSceneId} should have a runtime state row`);
  assert.equal(row.value_json.status, expectedStatus);
  return row.value_json;
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

async function assertKnowledgeIncludes(player, knowledgeId) {
  const knowledge = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledge.response.status, 200);
  assert.match(JSON.stringify(knowledge.body), new RegExp(knowledgeId));
  assertPlayerSafePayload(knowledge.body, `knowledge journal ${knowledgeId}`);
}

async function assertHistoryAndSceneStaySafe(player, label) {
  const current = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(current.response.status, 200, `${label} current scene should load`);
  assert.equal(current.body.state, 'active');
  assert.ok(current.body.action_status?.state, `${label} current scene should expose next action status`);
  assertPlayerSafePayload(current.body, `${label} current scene`);

  const history = await request('/api/play/campaign/history', { headers: player.headers });
  assert.equal(history.response.status, 200, `${label} history should load`);
  assertPlayerSafePayload(history.body, `${label} history`);
  return { current, history };
}

async function archiveRecord(player, recordId, expectedText) {
  const archive = await request(`/api/play/dialogue/archive/${recordId}`, { headers: player.headers });
  assert.equal(archive.response.status, 200);
  assert.match(JSON.stringify(archive.body), expectedText);
  assertPlayerSafePayload(archive.body, 'completed dialogue archive');
  return archive.body.record;
}

test('Stage 6B.13.1 Tomas exits back to exploration and can continue into Elin', async () => {
  const player = await createReadyPlayer('tomas_elin_handoff');
  const before = await assertHistoryAndSceneStaySafe(player, 'before Tomas dialogue');
  const actionStateBefore = before.current.body.action_status.state;

  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, tomasSceneId);
  assert.match(loaded.body.conversation_surface.paragraphs[0].text, /Tomas Rell/i);
  assertPlayerSafePayload(loaded.body, 'Tomas active dialogue');
  await assertRuntimeStatus(player, tomasSceneId, 'active');

  const afterOpen = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(afterOpen.response.status, 200);
  assert.equal(afterOpen.body.action_status.state, actionStateBefore);
  assertPlayerSafePayload(afterOpen.body, 'exploration after opening Tomas dialogue');

  const survivor = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_survivor_by_hearth',
    }),
  });
  assert.equal(survivor.response.status, 200);
  assert.equal(survivor.body.status, 'resolved');
  assert.ok(survivor.body.clarifying_question_result.result.knowledge_grants_applied.includes('knows_elin_name'));
  assert.equal(survivor.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assertPlayerSafePayload(survivor.body, 'Tomas survivor CQ');

  const preview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_press_for_survivor',
      submitted_text: 'I press Tomas for the specific survivor.',
    }),
  });
  assert.equal(preview.response.status, 200);
  assertPreviewHidesConfidence(preview.body, 'Tomas survivor move preview');
  assert.equal(preview.body.preview.check_preview.dc_visible, false);
  assertPlayerSafePayload(preview.body, 'Tomas survivor move preview');

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_press_for_survivor',
      submitted_text: 'I press Tomas for the specific survivor.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.social_move_result.branch, 'success');
  assert.ok(submitted.body.social_move_result.latest_development?.summary);
  assert.equal(submitted.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  assertPlayerSafePayload(submitted.body, 'Tomas survivor move result');

  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      exit_id: 'exit_follow_elin_lead',
    }),
  });
  assert.equal(exited.response.status, 200);
  assert.equal(exited.body.status, 'exited');
  assert.deepEqual(exited.body.transition, {
    target_type: 'exploration',
    target_id: 'elin-memory-fragments',
  });
  assert.ok(exited.body.completed_dialogue_record?.completed_dialogue_record_id);
  assert.equal(exited.body.current_dialogue.dialogue_scene_state.status, 'exited');
  assertPlayerSafePayload(exited.body, 'Tomas exit handoff');
  await assertRuntimeStatus(player, tomasSceneId, 'exited');

  await assertKnowledgeIncludes(player, 'knows_elin_name');
  await assertKnowledgeIncludes(player, 'woman_near_hearth_survived_road_attack');
  await assertHistoryAndSceneStaySafe(player, 'after Tomas exit');
  await archiveRecord(
    player,
    exited.body.completed_dialogue_record.completed_dialogue_record_id,
    /Tomas compared|Elin Harrow/i
  );

  const search = await request('/api/play/dialogue/search?q=Elin', { headers: player.headers });
  assert.equal(search.response.status, 200);
  assert.ok(
    search.body.results.some(
      (result) =>
        result.completed_dialogue_record_id ===
        String(exited.body.completed_dialogue_record.completed_dialogue_record_id)
    )
  );
  assertPlayerSafePayload(search.body, 'dialogue search after Tomas exit');

  const elin = await request(`/api/play/dialogue/current?dialogue_scene_id=${elinSceneId}`, {
    headers: player.headers,
  });
  assert.equal(elin.response.status, 200);
  assert.equal(elin.body.state, 'active');
  assert.equal(elin.body.dialogue_scene.dialogue_scene_id, elinSceneId);
  assertPlayerSafePayload(elin.body, 'Elin dialogue after Tomas lead');
  await assertRuntimeStatus(player, tomasSceneId, 'exited');
  await assertRuntimeStatus(player, elinSceneId, 'active');
});

test('Stage 6B.13.1 completed dialogue rejects stale handoff submissions safely', async () => {
  const player = await createReadyPlayer('stale_tomas_handoff');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);

  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      exit_id: 'exit_return_to_common_room',
    }),
  });
  assert.equal(exited.response.status, 200);
  const recordCountAfterExit = await completedRecordCount(player, tomasSceneId);
  assert.equal(recordCountAfterExit, 1);

  const staleQuestion = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_bandit_pattern',
    }),
  });
  assertSafeError(staleQuestion);

  const stalePreview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence after the conversation ended.',
    }),
  });
  assertSafeError(stalePreview);

  const staleSubmit = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence after the conversation ended.',
      forced_outcome: 'success',
    }),
  });
  assertSafeError(staleSubmit);

  const staleExit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      exit_id: 'exit_return_to_common_room',
    }),
  });
  assertSafeError(staleExit);
  assert.equal(await completedRecordCount(player, tomasSceneId), recordCountAfterExit);
  await assertRuntimeStatus(player, tomasSceneId, 'exited');
  await assertHistoryAndSceneStaySafe(player, 'after stale dialogue attempts');
});

test('Stage 6B.13.1 Dunmere dialogues can complete sequentially without stale locks', async () => {
  const player = await createReadyPlayer('dunmere_cluster');
  const mara = await request(`/api/play/dialogue/current?dialogue_scene_id=${maraSceneId}`, {
    headers: player.headers,
  });
  assert.equal(mara.response.status, 200);
  assert.equal(mara.body.state, 'active');
  assertPlayerSafePayload(mara.body, 'Mara active dialogue');

  const maraMove = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      move_id: 'move_suggest_deeper_pattern',
      submitted_text: 'I suggest the pattern is deeper than banditry.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(maraMove.response.status, 200);
  assert.ok(maraMove.body.social_move_result.knowledge_grants_applied.includes('dunmere_wants_simple_answer'));
  assertPlayerSafePayload(maraMove.body, 'Mara move result');

  const maraExit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      exit_id: 'exit_return_to_dunmere_village',
    }),
  });
  assert.equal(maraExit.response.status, 200);
  assert.deepEqual(maraExit.body.transition, {
    target_type: 'exploration',
    target_id: 'dunmere-village',
  });
  assertPlayerSafePayload(maraExit.body, 'Mara exit');
  await assertRuntimeStatus(player, maraSceneId, 'exited');

  const lysa = await request(`/api/play/dialogue/current?dialogue_scene_id=${lysaSceneId}`, {
    headers: player.headers,
  });
  assert.equal(lysa.response.status, 200);
  assert.equal(lysa.body.state, 'active');
  assert.equal(lysa.body.dialogue_scene.dialogue_scene_id, lysaSceneId);
  assertPlayerSafePayload(lysa.body, 'Lysa active after Mara exit');
  await assertRuntimeStatus(player, lysaSceneId, 'active');
  await assertRuntimeStatus(player, maraSceneId, 'exited');
  await assertKnowledgeIncludes(player, 'dunmere_wants_simple_answer');
  await assertHistoryAndSceneStaySafe(player, 'after Dunmere cluster handoff');
  await archiveRecord(
    player,
    maraExit.body.completed_dialogue_record.completed_dialogue_record_id,
    /Mara Vellin|bandit explanation/i
  );
});

test('Stage 6B.13.1 shrine route and escalation handoffs stay player-safe and GM/dev gated', async () => {
  const denied = await createReadyPlayer('debug_denied');
  const deniedDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${garrenSceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedDebug.response.status, 403);
  assertPlayerSafePayload(deniedDebug.body, 'denied GM/dev debug response');

  const player = await createReadyPlayer('route_escalation');
  await grantDebugCapability(player);

  const garrenLoaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${garrenSceneId}`, {
    headers: player.headers,
  });
  assert.equal(garrenLoaded.response.status, 200);
  assertPlayerSafePayload(garrenLoaded.body, 'Garren active dialogue');

  const sighting = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      question_id: 'clarify_garren_old_path_sighting',
    }),
  });
  assert.equal(sighting.response.status, 200);
  assert.ok(sighting.body.clarifying_question_result.result.knowledge_grants_applied.includes('garren_knows_old_paths'));
  assertPlayerSafePayload(sighting.body, 'Garren old-path CQ');

  const respectful = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      move_id: 'move_ask_what_garren_saw_without_accusation',
      submitted_text: 'I ask Garren what he actually saw without accusation.',
    }),
  });
  assert.equal(respectful.response.status, 200);
  assert.ok(respectful.body.social_move_result.knowledge_grants_applied.includes('tracks_converge_on_shrine'));
  assertPlayerSafePayload(respectful.body, 'Garren respectful route result');

  const garrenExit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      exit_id: 'exit_follow_old_path_lead',
    }),
  });
  assert.equal(garrenExit.response.status, 200);
  assert.deepEqual(garrenExit.body.transition, {
    target_type: 'exploration',
    target_id: 'old-forest-path',
  });
  assertPlayerSafePayload(garrenExit.body, 'Garren shrine route exit');
  await assertRuntimeStatus(player, garrenSceneId, 'exited');
  await assertKnowledgeIncludes(player, 'tracks_converge_on_shrine');

  const garrenDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${garrenSceneId}`, {
    headers: player.headers,
  });
  assert.equal(garrenDebug.response.status, 200);
  assert.equal(garrenDebug.body.scene_state.status, 'exited');
  assert.ok(garrenDebug.body.audit_timeline.records.some((record) => record.event_type === 'dialogue_exit'));
  assert.ok(garrenDebug.body.relationship_state.recent_writes.length >= 1);

  const ruskLoaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${ruskSceneId}`, {
    headers: player.headers,
  });
  assert.equal(ruskLoaded.response.status, 200);
  assert.equal(ruskLoaded.body.state, 'active');
  assertPlayerSafePayload(ruskLoaded.body, 'Rusk active dialogue');

  const hears = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      question_id: 'clarify_rusk_what_he_hears',
    }),
  });
  assert.equal(hears.response.status, 200);
  assert.ok(hears.body.clarifying_question_result.result.knowledge_grants_applied.includes('bandits_not_fully_self_directed'));
  assertPlayerSafePayload(hears.body, 'Rusk what-he-hears CQ');

  const hardEnd = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      move_id: 'move_end_this_now',
      submitted_text: 'I end this now before Rusk gathers himself.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(hardEnd.response.status, 200);
  assert.ok(hardEnd.body.social_move_result.latest_development?.summary);
  assertPlayerSafePayload(hardEnd.body, 'Rusk hard-ending move result');

  const ruskExit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      exit_id: 'exit_rusk_combat_pending',
    }),
  });
  assert.equal(ruskExit.response.status, 200);
  assert.deepEqual(ruskExit.body.transition, {
    target_type: 'exploration',
    target_id: 'shrine-ruins',
  });
  assertPlayerSafePayload(ruskExit.body, 'Rusk combat-pending exit');
  await assertRuntimeStatus(player, ruskSceneId, 'exited');
  await assertKnowledgeIncludes(player, 'bandits_not_fully_self_directed');
  await assertHistoryAndSceneStaySafe(player, 'after shrine escalation');

  const ruskDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${ruskSceneId}`, {
    headers: player.headers,
  });
  assert.equal(ruskDebug.response.status, 200);
  assert.equal(ruskDebug.body.scene_state.status, 'exited');
  assert.ok(ruskDebug.body.audit_timeline.records.some((record) => record.event_type === 'dialogue_exit'));
  assert.ok(ruskDebug.body.relationship_state.recent_writes.length >= 1);

  const archive = await archiveRecord(
    player,
    ruskExit.body.completed_dialogue_record.completed_dialogue_record_id,
    /Rusk at the shrine|could not make Rusk safe/i
  );
  assert.equal(JSON.stringify(archive).includes('combat_routing'), false);
});
