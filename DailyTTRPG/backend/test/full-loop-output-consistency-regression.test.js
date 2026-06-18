import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureActionComposerSchema } from '../src/services/actionComposerSchema.js';
import { applyAdventureOutcome } from '../src/services/adventureProgressionService.js';
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
  return `output_consistency_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Output ${label}`,
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
      name: `Output ${label.replaceAll('_', ' ').slice(0, 24)}`,
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

async function establishAftermathPrerequisite(player) {
  const { campaignId } = await campaignContextFor(player);
  await applyAdventureOutcome({
    campaignId,
    characterId: player.characterId,
    effectPayload: {
      character_flags: {
        clue_caravan_irregularity: true,
      },
      objectives: [
        {
          quest_key: 'shadows_grey_road',
          objective_key: 'witness-the-aftermath',
          status: 'completed',
          progress_count: 1,
        },
        {
          quest_key: 'shadows_grey_road',
          objective_key: 'gather-local-insight',
          status: 'active',
          progress_count: 0,
        },
      ],
    },
    actorAccountId: player.accountId,
    sourceType: 'test_setup',
    sourceKey: 'stage6b13_output_consistency_after_caravan',
  });
  assert.deepEqual(await objectiveState(player, 'witness-the-aftermath'), {
    key: 'witness-the-aftermath',
    status: 'completed',
    progress_count: 1,
  });
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
  'truth_label',
  'final_mystery',
  'stack',
  'constraint',
];

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload);
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term), false, `${label} leaked ${term}`);
  }
}

function knowledgeEntriesFromJournal(journal) {
  return Object.values(journal.sections ?? {}).flatMap((section) => (Array.isArray(section) ? section : []));
}

async function campaignContextFor(player) {
  const result = await query(
    `
      SELECT membership.campaign_id, campaign.world_instance_id
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      WHERE membership.character_id = $1
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
      ORDER BY membership.is_active_context DESC,
        membership.is_default_solo_campaign DESC,
        membership.id DESC
      LIMIT 1
    `,
    [player.characterId]
  );
  assert.ok(result.rows[0], 'player should have active campaign context');
  return {
    campaignId: Number(result.rows[0].campaign_id),
    worldInstanceId: Number(result.rows[0].world_instance_id),
  };
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

async function objectiveState(player, objectiveKey) {
  const result = await query(
    `
      SELECT objective.key, objective_state.status, objective_state.progress_count
      FROM dnd5e_character_objective objective_state
      JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
      JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
      WHERE quest_state.character_id = $1
        AND objective.key = $2
      ORDER BY objective_state.updated_at DESC, objective_state.id DESC
      LIMIT 1
    `,
    [player.characterId, objectiveKey]
  );
  const row = result.rows[0] ?? null;
  return row
    ? {
        key: row.key,
        status: row.status,
        progress_count: Number(row.progress_count ?? 0),
      }
    : null;
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

async function sceneUnlockRewardCount(player, sceneKey) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_reward_application application
      JOIN dnd5e_reward reward ON reward.id = application.reward_id
      WHERE application.character_id = $1
        AND reward.reward_type = 'scene_unlock'
        AND reward.value_json->>'scene_key' = $2
    `,
    [player.characterId, sceneKey]
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

test('Stage 6B.13.3 Tomas knowledge dedupes across CQ and CSM while objective progress applies once', async () => {
  const player = await createReadyPlayer('tomas_dedupe');
  await grantDebugCapability(player);
  await establishAftermathPrerequisite(player);

  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assertPlayerSafePayload(loaded.body, 'Tomas initial dialogue');

  const pattern = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_bandit_pattern',
    }),
  });
  assert.equal(pattern.response.status, 200);
  assert.ok(pattern.body.clarifying_question_result.result.knowledge_grants_applied.includes('innkeeper_tracks_road_patterns'));
  assert.equal(await knowledgeRowCount(player, 'innkeeper_tracks_road_patterns'), 1);
  assertPlayerSafePayload(pattern.body, 'Tomas pattern CQ');

  const move = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_reassure_tomas',
      submitted_text: 'I reassure Tomas that partial information helps.',
    }),
  });
  assert.equal(move.response.status, 200);
  assert.ok(move.body.social_move_result.knowledge_grants_applied.includes('innkeeper_tracks_road_patterns'));
  assert.equal(await knowledgeRowCount(player, 'innkeeper_tracks_road_patterns'), 1);
  assertPlayerSafePayload(move.body, 'Tomas reassurance move');

  const objective = await objectiveState(player, 'gather-local-insight');
  assert.deepEqual(objective, {
    key: 'gather-local-insight',
    status: 'active',
    progress_count: 1,
  });

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_bandit_pattern',
      lifecycle_context: move.body.lifecycle_context,
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.equal(await knowledgeRowCount(player, 'innkeeper_tracks_road_patterns'), 1);

  const journal = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(journal.response.status, 200);
  const entries = knowledgeEntriesFromJournal(journal.body).filter(
    (entry) => entry.knowledge_key === 'innkeeper_tracks_road_patterns'
  );
  assert.equal(entries.length, 1);
  assert.match(entries[0].text, /road reports|ordinary bandit/i);
  assertPlayerSafePayload(journal.body, 'Tomas knowledge journal');
});

test('Stage 6B.13.3 completed records, transcripts, archive, and search are single-write and scoped', async () => {
  const player = await createReadyPlayer('archive_scope');
  const other = await createReadyPlayer('archive_other');

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      move_id: 'move_report_broken_caravan',
      submitted_text: 'I report the broken caravan clearly.',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assertPlayerSafePayload(submitted.body, 'Mara output move');

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      exit_id: 'exit_return_to_dunmere_village',
      lifecycle_context: submitted.body.lifecycle_context,
    }),
  });
  assert.equal(exit.response.status, 200);
  const recordId = exit.body.completed_dialogue_record.completed_dialogue_record_id;
  assert.ok(recordId);
  assert.equal(await completedRecordCount(player, maraSceneId), 1);
  assertPlayerSafePayload(exit.body, 'Mara output exit');

  const duplicateExit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      exit_id: 'exit_return_to_dunmere_village',
      lifecycle_context: submitted.body.lifecycle_context,
    }),
  });
  assert.equal(duplicateExit.response.status, 409);
  assert.equal(await completedRecordCount(player, maraSceneId), 1);
  assertPlayerSafePayload(duplicateExit.body, 'duplicate exit error');

  const archive = await request(`/api/play/dialogue/archive/${recordId}`, { headers: player.headers });
  assert.equal(archive.response.status, 200);
  assert.ok(archive.body.record.transcript_turns.some((turn) => turn.turn_type === 'social_move_result'));
  assert.match(archive.body.record.compact_summary, /Mara Vellin|bandit explanation/i);
  assertPlayerSafePayload(archive.body, 'Mara archive detail');

  const search = await request('/api/play/dialogue/search?q=bandit', { headers: player.headers });
  assert.equal(search.response.status, 200);
  assert.equal(
    search.body.results.filter((result) => result.completed_dialogue_record_id === String(recordId)).length,
    1
  );
  assertPlayerSafePayload(search.body, 'Mara archive search');

  const otherArchive = await request(`/api/play/dialogue/archive/${recordId}`, { headers: other.headers });
  assert.equal(otherArchive.response.status, 404);
  assertPlayerSafePayload(otherArchive.body, 'foreign archive denial');

  const otherSearch = await request('/api/play/dialogue/search?q=bandit', { headers: other.headers });
  assert.equal(otherSearch.response.status, 200);
  assert.equal(
    otherSearch.body.results.some((result) => result.completed_dialogue_record_id === String(recordId)),
    false
  );
  assertPlayerSafePayload(otherSearch.body, 'foreign archive search');
});

test('Stage 6B.13.3 misleading and partial Greyvale clues stay player-safe instead of confirmed truth', async () => {
  const player = await createReadyPlayer('partial_clues');

  const mara = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      question_id: 'clarify_mara_bandit_explanation',
    }),
  });
  assert.equal(mara.response.status, 200);
  assertPlayerSafePayload(mara.body, 'Mara assumption CQ');

  const lysa = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      question_id: 'clarify_lysa_hidden_truth',
    }),
  });
  assert.equal(lysa.response.status, 200);
  assertPlayerSafePayload(lysa.body, 'Lysa suspicion CQ');

  const journal = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(journal.response.status, 200);
  const entries = knowledgeEntriesFromJournal(journal.body);
  const maraEntry = entries.find((entry) => entry.knowledge_key === 'dunmere_wants_simple_answer');
  const lysaEntry = entries.find((entry) => entry.knowledge_key === 'village_blames_hunter_and_road');
  assert.ok(maraEntry, 'Mara assumption should appear in player journal');
  assert.ok(lysaEntry, 'Lysa suspicion should appear in player journal');
  assert.match(maraEntry.text, /clean explanation|truth is known|fear/i);
  assert.match(lysaEntry.text, /fear|circling|Garren|road/i);

  const journalText = JSON.stringify(journal.body).toLowerCase();
  assert.equal(journalText.includes('confirmed truth'), false);
  assert.equal(journalText.includes('final mystery'), false);
  assert.equal(journalText.includes('whispering presence'), false);
  assertPlayerSafePayload(journal.body, 'partial clue journal');
});

test('Stage 6B.13.3 objective, flag, reward, history, and GM/dev provenance outputs stay coherent', async () => {
  const player = await createReadyPlayer('objective_reward_flow');
  await grantDebugCapability(player);
  await establishAftermathPrerequisite(player);
  const { campaignId } = await campaignContextFor(player);

  const mara = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      move_id: 'move_present_local_insight',
      submitted_text: 'I present the gathered local insight.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(mara.response.status, 200);
  assertPlayerSafePayload(mara.body, 'Mara objective move');
  assert.deepEqual(await objectiveState(player, 'gather-local-insight'), {
    key: 'gather-local-insight',
    status: 'completed',
    progress_count: 2,
  });
  assert.deepEqual(await objectiveState(player, 'follow-the-leads'), {
    key: 'follow-the-leads',
    status: 'active',
    progress_count: 0,
  });

  const garren = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      move_id: 'move_ask_safest_way_to_approach_shrine',
      submitted_text: 'I ask Garren for the safest way to approach the shrine.',
      forced_outcome: 'success',
      continue_as_committed_social_move: true,
    }),
  });
  assert.equal(garren.response.status, 200);
  assert.equal(garren.body.status, 'resolved', JSON.stringify(garren.body));
  assert.ok(garren.body.social_move_result.knowledge_grants_applied.includes('tracks_converge_on_shrine'));
  assert.equal(await characterFlagValue(player, 'shrine_path_known'), true);
  assert.equal(await sceneUnlockRewardCount(player, 'shrine-ruins'), 1);
  assertPlayerSafePayload(garren.body, 'Garren route output');

  const keepTalking = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      move_id: 'move_keep_rusk_talking',
      submitted_text: 'I keep Rusk talking while he is still listening.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(keepTalking.response.status, 200);
  assertPlayerSafePayload(keepTalking.body, 'Rusk keep-talking output');

  const deeper = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      move_id: 'move_push_rusk_to_name_source',
      submitted_text: 'I push Rusk to name the source under the shrine.',
      forced_outcome: 'success',
      continue_as_committed_social_move: true,
      lifecycle_context: keepTalking.body.lifecycle_context,
    }),
  });
  assert.equal(deeper.response.status, 200);
  assert.ok(deeper.body.social_move_result.knowledge_grants_applied.includes('shrine_depth_unlocked'));
  assert.ok(deeper.body.social_move_result.knowledge_grants_applied.includes('hollow_reaches_shrine_above'));
  assert.equal(await characterFlagValue(player, 'shrine_depth_unlocked'), true);
  assert.equal(await characterFlagValue(player, 'combat_pending'), true);
  assert.deepEqual(await objectiveState(player, 'uncover-the-truth'), {
    key: 'uncover-the-truth',
    status: 'completed',
    progress_count: 1,
  });
  assert.deepEqual(await objectiveState(player, 'resolve-the-threat'), {
    key: 'resolve-the-threat',
    status: 'active',
    progress_count: 0,
  });
  assert.equal(await sceneUnlockRewardCount(player, 'subterranean-hollow'), 1);
  assertPlayerSafePayload(deeper.body, 'Rusk deeper-source output');

  const history = await request('/api/play/campaign/history', { headers: player.headers });
  assert.equal(history.response.status, 200);
  assertPlayerSafePayload(history.body, 'campaign history after dialogue outputs');

  const current = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(current.response.status, 200);
  assert.equal(current.body.current_objective?.key, 'follow-the-leads');
  assertPlayerSafePayload(current.body, 'current scene after output flow');

  const objectives = await request(
    `/api/dnd5e/campaigns/${campaignId}/characters/${player.characterId}/objectives?mode=player`,
    { headers: player.headers }
  );
  assert.equal(objectives.response.status, 200);
  assertPlayerSafePayload(objectives.body, 'player objective read model');

  const debug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${ruskSceneId}`, {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  assert.ok(debug.body.completed_record === null || typeof debug.body.completed_record === 'object');
  assert.ok(debug.body.audit_timeline.records.some((record) => record.event_type === 'committed_social_move_result'));
  assert.ok(JSON.stringify(debug.body).includes('shrine_depth_unlocked'));

  const denied = await createReadyPlayer('provenance_denied');
  const deniedDebug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${ruskSceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedDebug.response.status, 403);
  assertPlayerSafePayload(deniedDebug.body, 'unauthorized output provenance denial');
});
