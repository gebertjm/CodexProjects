import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { validateDialogueFocusCommitScene } from '../src/content/dialogueFocusCommitValidation.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureDialogueFocusCommitPersistenceSchema } from '../src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import {
  clearDialogueFocusCommitSceneRegistryForTests,
  registerDialogueFocusCommitSceneForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';
import {
  cloneGreyvaleFixture,
  greyvaleDialogueFocusCommitScenes,
  greyvaleElinMemoryDialogueScene,
  greyvaleElinMemoryExpectedPaths,
  greyvaleGarrenPathKnowledgeDialogueScene,
  greyvaleGarrenPathKnowledgeExpectedPaths,
  greyvaleLysaGriefSuspicionDialogueScene,
  greyvaleLysaGriefSuspicionExpectedPaths,
  greyvaleMaraDunmerePressureDialogueScene,
  greyvaleMaraDunmerePressureExpectedPaths,
  greyvaleRuskAtShrineDialogueScene,
  greyvaleRuskAtShrineExpectedPaths,
  greyvaleTomasRoadsideWorriesDialogueScene,
  greyvaleTomasRoadsideWorriesExpectedPaths,
} from './fixtures/greyvale-dialogue-fixtures.js';

const sceneId = 'greyvale_elin_memory_dialogue';
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
  return `greyvale_dialogue_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Greyvale Dialogue ${label}`,
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
      name: `GV ${label.replaceAll('_', ' ').slice(0, 24)}`,
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
  assert.equal(text.includes('matched_move_confidence'), false);
  assert.equal(text.includes('relationship_audit'), false);
  assert.equal(text.includes('old_value_json'), false);
  assert.equal(text.includes('new_value_json'), false);
  assert.equal(text.includes('preview_confidence'), false);
  assert.equal(text.includes('secret_requirement'), false);
  assert.equal(text.includes('gm_dev_content_ref'), false);
}

async function playGreyvaleDialogueToExit(player, { askSash = true } = {}) {
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${sceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);

  if (askSash) {
    const sash = await request('/api/play/dialogue/clarifying-question/resolve', {
      method: 'POST',
      headers: player.headers,
      body: JSON.stringify({
        dialogue_scene_id: sceneId,
        question_id: 'clarify_torn_sash',
      }),
    });
    assert.equal(sash.response.status, 200);
    assert.equal(sash.body.status, 'resolved');
  }

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      move_id: 'move_press_shrine_warning',
      submitted_text: 'I press gently about the shrine bell.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);

  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      exit_id: 'exit_return_to_common_room',
    }),
  });
  assert.equal(exited.response.status, 200);
  assert.ok(exited.body.completed_dialogue_record?.completed_dialogue_record_id);
  return {
    completedRecordId: exited.body.completed_dialogue_record.completed_dialogue_record_id,
    loaded,
    submitted,
    exited,
  };
}

test('Build 11 Greyvale Focus/Commit fixture validates with expected warnings only', () => {
  const fixtureDir = path.resolve(repoRoot, 'content/dialogue_focus_commit/greyvale');
  const fixtureFiles = fs
    .readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith('.scene.json'));
  assert.ok(fixtureFiles.includes('elin-memory-focus-commit.scene.json'));
  assert.ok(fixtureFiles.includes('tomas-roadside-worries-focus-commit.scene.json'));
  assert.ok(fixtureFiles.includes('mara-dunmere-pressure-focus-commit.scene.json'));
  assert.ok(fixtureFiles.includes('lysa-grief-and-suspicion-focus-commit.scene.json'));
  assert.ok(fixtureFiles.includes('garren-path-knowledge-focus-commit.scene.json'));
  assert.ok(fixtureFiles.includes('rusk-at-the-shrine-focus-commit.scene.json'));

  for (const fileName of fixtureFiles) {
    const scene = JSON.parse(fs.readFileSync(path.join(fixtureDir, fileName), 'utf8'));
    const validation = validateDialogueFocusCommitScene(scene, { profile: 'playtest_ready' });
    assert.deepEqual(validation.hard_errors, [], `${fileName} should have no hard validation errors`);
  }

  const validation = validateDialogueFocusCommitScene(greyvaleElinMemoryDialogueScene, {
    profile: 'playtest_ready',
  });
  assert.equal(validation.ok, true);
  assert.ok(validation.warnings.some((warning) => warning.code === 'generic_fallback_enabled'));
  assert.equal(greyvaleElinMemoryExpectedPaths.paths.length, 7);

  const tomasValidation = validateDialogueFocusCommitScene(greyvaleTomasRoadsideWorriesDialogueScene, {
    profile: 'playtest_ready',
  });
  assert.equal(tomasValidation.ok, true);
  assert.deepEqual(tomasValidation.hard_errors, []);
  assert.ok(tomasValidation.warnings.some((warning) => warning.code === 'generic_fallback_enabled'));
  assert.equal(greyvaleTomasRoadsideWorriesExpectedPaths.paths.length, 7);

  const maraValidation = validateDialogueFocusCommitScene(greyvaleMaraDunmerePressureDialogueScene, {
    profile: 'playtest_ready',
  });
  assert.equal(maraValidation.ok, true);
  assert.deepEqual(maraValidation.hard_errors, []);
  assert.ok(maraValidation.warnings.some((warning) => warning.code === 'generic_fallback_enabled'));
  assert.equal(greyvaleMaraDunmerePressureExpectedPaths.paths.length, 6);

  const lysaValidation = validateDialogueFocusCommitScene(greyvaleLysaGriefSuspicionDialogueScene, {
    profile: 'playtest_ready',
  });
  assert.equal(lysaValidation.ok, true);
  assert.deepEqual(lysaValidation.hard_errors, []);
  assert.ok(lysaValidation.warnings.some((warning) => warning.code === 'generic_fallback_enabled'));
  assert.equal(greyvaleLysaGriefSuspicionExpectedPaths.paths.length, 6);

  const garrenValidation = validateDialogueFocusCommitScene(greyvaleGarrenPathKnowledgeDialogueScene, {
    profile: 'playtest_ready',
  });
  assert.equal(garrenValidation.ok, true);
  assert.deepEqual(garrenValidation.hard_errors, []);
  assert.ok(garrenValidation.warnings.some((warning) => warning.code === 'generic_fallback_enabled'));
  assert.equal(greyvaleGarrenPathKnowledgeExpectedPaths.paths.length, 7);

  const ruskValidation = validateDialogueFocusCommitScene(greyvaleRuskAtShrineDialogueScene, {
    profile: 'playtest_ready',
  });
  assert.equal(ruskValidation.ok, true);
  assert.deepEqual(ruskValidation.hard_errors, []);
  assert.ok(ruskValidation.warnings.some((warning) => warning.code === 'generic_fallback_enabled'));
  assert.equal(greyvaleRuskAtShrineExpectedPaths.paths.length, 8);
});

test('Build 11 Greyvale dialogue loads, resolves Clarifying Questions, and preserves player-safe visibility', async () => {
  const player = await createReadyPlayer('load_clarify');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${sceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, sceneId);
  assert.match(loaded.body.conversation_surface.paragraphs[0].text, /Elin Harrow sits close/i);
  assert.ok(loaded.body.passive_social_insight.some((insight) => insight.insight_id === 'insight_elin_shrine_bell_avoidance'));
  assert.ok(loaded.body.clarifying_questions.some((question) => question.question_id === 'clarify_torn_sash'));
  assert.ok(loaded.body.committed_social_moves.some((move) => move.move_id === 'move_press_shrine_warning'));
  assertPlayerSafePayload(loaded.body);

  const noCheck = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      question_id: 'clarify_torn_sash',
    }),
  });
  assert.equal(noCheck.response.status, 200);
  assert.equal(noCheck.body.status, 'resolved');
  assert.match(noCheck.body.clarifying_question_result.result.text, /roadward knot/i);
  assert.equal(noCheck.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assert.ok(
    noCheck.body.current_dialogue.clarifying_questions.some(
      (question) => question.question_id === 'clarify_roadward_knot' && question.status === 'available'
    )
  );
  assert.ok(noCheck.body.clarifying_question_result.result.knowledge_grants_applied.includes('elin_sash_has_roadward_knot'));
  assertPlayerSafePayload(noCheck.body);

  const failed = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      question_id: 'clarify_read_her_fear',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failed.response.status, 200);
  assert.equal(failed.body.clarifying_question_result.status, 'failed');
  assert.equal(failed.body.clarifying_question_result.result.check_result.outcome, 'failure');

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      question_id: 'clarify_read_her_fear',
      forced_outcome: 'success',
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.equal(reopened.body.clarifying_question_result.status, 'failed');
});

test('Build 12.2 Tomas dialogue loads, resolves Clarifying Questions, and preserves player-safe visibility', async () => {
  const player = await createReadyPlayer('tomas_load_clarify');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, tomasSceneId);
  assert.match(loaded.body.conversation_surface.paragraphs[0].text, /Tomas Rell keeps polishing/i);
  assert.ok(loaded.body.passive_social_insight.some((insight) => insight.insight_id === 'insight_tomas_fears_bad_rumor'));
  assert.ok(loaded.body.clarifying_questions.some((question) => question.question_id === 'clarify_bandit_pattern'));
  assert.ok(loaded.body.committed_social_moves.some((move) => move.move_id === 'move_reassure_tomas'));
  assertPlayerSafePayload(loaded.body);

  const pattern = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_bandit_pattern',
    }),
  });
  assert.equal(pattern.response.status, 200);
  assert.equal(pattern.body.status, 'resolved');
  assert.match(pattern.body.clarifying_question_result.result.text, /Bandits take what they can|ordinary banditry|ordinary bandit/i);
  assert.equal(pattern.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assert.ok(pattern.body.clarifying_question_result.result.knowledge_grants_applied.includes('innkeeper_tracks_road_patterns'));
  assertPlayerSafePayload(pattern.body);

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
  assert.ok(survivor.body.clarifying_question_result.result.knowledge_grants_applied.includes('woman_near_hearth_survived_road_attack'));
  assert.ok(survivor.body.clarifying_question_result.result.knowledge_grants_applied.includes('knows_elin_name'));
  assert.match(survivor.body.clarifying_question_result.result.text, /Elin Harrow/i);
  assertPlayerSafePayload(survivor.body);

  const failedRead = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_read_what_tomas_avoids',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failedRead.response.status, 200);
  assert.equal(failedRead.body.clarifying_question_result.status, 'failed');

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      question_id: 'clarify_read_what_tomas_avoids',
      forced_outcome: 'success',
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.equal(reopened.body.clarifying_question_result.status, 'failed');
});

test('Stage 6B.12.3 Mara dialogue loads, resolves Clarifying Questions, and preserves player-safe visibility', async () => {
  const player = await createReadyPlayer('mara_load_clarify');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${maraSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, maraSceneId);
  assert.match(loaded.body.conversation_surface.paragraphs[0].text, /Mara Vellin stands/i);
  assert.ok(loaded.body.passive_social_insight.some((insight) => insight.insight_id === 'insight_mara_chooses_actionable_answer'));
  assert.ok(loaded.body.clarifying_questions.some((question) => question.question_id === 'clarify_mara_bandit_explanation'));
  assert.ok(loaded.body.committed_social_moves.some((move) => move.move_id === 'move_report_broken_caravan'));
  assertPlayerSafePayload(loaded.body);

  const assumption = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      question_id: 'clarify_mara_bandit_explanation',
    }),
  });
  assert.equal(assumption.response.status, 200);
  assert.equal(assumption.body.status, 'resolved');
  assert.match(assumption.body.clarifying_question_result.result.text, /bandits can be found/i);
  assert.equal(assumption.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assert.ok(assumption.body.clarifying_question_result.result.knowledge_grants_applied.includes('dunmere_wants_simple_answer'));
  assertPlayerSafePayload(assumption.body);

  const failedRead = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      question_id: 'clarify_read_mara_certainty',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failedRead.response.status, 200);
  assert.equal(failedRead.body.clarifying_question_result.status, 'failed');

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      question_id: 'clarify_read_mara_certainty',
      forced_outcome: 'success',
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.equal(reopened.body.clarifying_question_result.status, 'failed');
});

test('Stage 6B.12.3 Lysa dialogue loads, resolves Clarifying Questions, and preserves player-safe visibility', async () => {
  const player = await createReadyPlayer('lysa_load_clarify');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${lysaSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, lysaSceneId);
  assert.match(loaded.body.conversation_surface.paragraphs[0].text, /Lysa Fen watches/i);
  assert.ok(loaded.body.passive_social_insight.some((insight) => insight.insight_id === 'insight_lysa_grief_shapes_certainty'));
  assert.ok(loaded.body.clarifying_questions.some((question) => question.question_id === 'clarify_lysa_hidden_truth'));
  assert.ok(loaded.body.committed_social_moves.some((move) => move.move_id === 'move_ground_lysa_suspicion'));
  assertPlayerSafePayload(loaded.body);

  const suspicion = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      question_id: 'clarify_lysa_hidden_truth',
    }),
  });
  assert.equal(suspicion.response.status, 200);
  assert.equal(suspicion.body.status, 'resolved');
  assert.match(suspicion.body.clarifying_question_result.result.text, /bandits too quickly/i);
  assert.equal(suspicion.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assert.ok(suspicion.body.clarifying_question_result.result.knowledge_grants_applied.includes('village_blames_hunter_and_road'));
  assertPlayerSafePayload(suspicion.body);

  const failedRead = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      question_id: 'clarify_read_lysa_grief_from_evidence',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failedRead.response.status, 200);
  assert.equal(failedRead.body.clarifying_question_result.status, 'failed');

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      question_id: 'clarify_read_lysa_grief_from_evidence',
      forced_outcome: 'success',
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.equal(reopened.body.clarifying_question_result.status, 'failed');
});

test('Build 11 Greyvale previews cover overlap warnings, no-check moves, checked branches, fallback, and exits', async () => {
  const player = await createReadyPlayer('preview_submit');
  const overlap = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      submitted_text: 'I ask what do you remember first?',
    }),
  });
  assert.equal(overlap.response.status, 200);
  assert.equal(overlap.body.status, 'clarifying_question_overlap');
  assert.equal(overlap.body.overlap.question_id, 'clarify_sound_first');
  assert.deepEqual(overlap.body.options, [
    'ask_clarifying_question',
    'continue_as_committed_social_move',
    'edit_action',
  ]);

  const continued = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      submitted_text: 'I ask what do you remember first?',
      continue_as_committed_social_move: true,
    }),
  });
  assert.equal(continued.response.status, 200);
  assert.equal(continued.body.status, 'preview');
  assert.equal(continued.body.preview.move_id, 'move_follow_first_sound_deeper');
  assert.equal(continued.body.preview.check_preview.label, 'Persuasion check');
  assert.equal(continued.body.preview.spends_dialogue_beat, true);

  const noCheckPreview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      move_id: 'move_reassure_elin',
      submitted_text: 'I reassure Elin she can stop.',
    }),
  });
  assert.equal(noCheckPreview.response.status, 200);
  assert.equal(noCheckPreview.body.preview.requires_check, false);
  assert.equal(noCheckPreview.body.preview.spends_dialogue_beat, true);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      move_id: 'move_press_shrine_warning',
      submitted_text: 'I press gently about the shrine bell.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.social_move_result.branch, 'success');
  assert.match(submitted.body.social_move_result.result_text, /bell rang once/i);
  assert.ok(submitted.body.social_move_result.knowledge_grants_applied.includes('shrine_bell_stopped_attack'));
  assert.equal(submitted.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  assertPlayerSafePayload(submitted.body);

  const fallbackPlayer = await createReadyPlayer('fallback');
  const fallback = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      submitted_text: 'I ask about the miller and a missing goat.',
    }),
  });
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.social_move_result.generic_fallback_id, 'default');
  assert.equal(fallback.body.current_dialogue.dialogue_scene_state.fallback_usage.used_count, 1);
  assert.equal(fallback.body.current_dialogue.dialogue_scene_state.fallback_usage.exhausted, true);

  const exhausted = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      submitted_text: 'I ask another unauthored thing.',
    }),
  });
  assert.equal(exhausted.response.status, 200);
  assert.equal(exhausted.body.status, 'revise');
  assert.match(exhausted.body.message, /fallback.*exhausted/i);

  const failedFallbackPlayer = await createReadyPlayer('fallback_failure');
  const failedFallback = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: failedFallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      submitted_text: 'I ask about a lantern no one mentioned.',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failedFallback.response.status, 200);
  assert.equal(failedFallback.body.social_move_result.generic_fallback_id, 'default');
  assert.equal(failedFallback.body.social_move_result.branch, 'failure');
  assert.equal(failedFallback.body.current_dialogue.dialogue_scene_state.fallback_usage.failed_count, 1);

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: sceneId,
      exit_id: 'exit_follow_hollow_path',
    }),
  });
  assert.equal(exit.response.status, 200);
  assert.deepEqual(exit.body.transition, {
    target_type: 'exploration',
    target_id: 'grey_road_inn_hollow_path',
  });
});

test('Build 12.2 Tomas previews, submits, fallback, exits, and archive remain player-safe', async () => {
  const player = await createReadyPlayer('tomas_preview_submit');
  const preview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence against his road pattern.',
    }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.preview.move_id, 'move_compare_caravan_pattern');
  assert.equal(preview.body.preview.check_preview.label, 'Persuasion check');
  assert.equal(preview.body.preview.check_preview.dc_visible, false);
  assert.equal(preview.body.preview.spends_dialogue_beat, true);
  assertPlayerSafePayload(preview.body);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_compare_caravan_pattern',
      submitted_text: 'I compare the broken caravan evidence against his road pattern.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.social_move_result.branch, 'success');
  assert.ok(submitted.body.social_move_result.knowledge_grants_applied.includes('innkeeper_tracks_road_patterns'));
  assert.equal(submitted.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  assertPlayerSafePayload(submitted.body);

  const lead = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      exit_id: 'exit_follow_elin_lead',
    }),
  });
  assert.equal(lead.response.status, 200);
  assert.deepEqual(lead.body.transition, {
    target_type: 'exploration',
    target_id: 'elin-memory-fragments',
  });
  assert.ok(lead.body.completed_dialogue_record?.completed_dialogue_record_id);
  assert.match(lead.body.completed_dialogue_record.compact_summary, /Tomas compared the Grey Road attacks/i);
  assertPlayerSafePayload(lead.body);

  const archive = await request(
    `/api/play/dialogue/archive/${lead.body.completed_dialogue_record.completed_dialogue_record_id}`,
    { headers: player.headers }
  );
  assert.equal(archive.response.status, 200);
  assert.match(archive.body.record.compact_summary, /ordinary banditry/i);
  assert.equal(JSON.stringify(archive.body).includes('caution'), false);
  assertPlayerSafePayload(archive.body);

  const fallbackPlayer = await createReadyPlayer('tomas_fallback');
  const fallback = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      submitted_text: 'I ask Tomas about the miller and a missing goat.',
    }),
  });
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.social_move_result.generic_fallback_id, 'default');
  assert.deepEqual(fallback.body.social_move_result.knowledge_grants_applied, []);
  assert.equal(fallback.body.current_dialogue.dialogue_scene_state.fallback_usage.exhausted, true);
  assertPlayerSafePayload(fallback.body);

  const exhausted = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      submitted_text: 'I ask another unauthored road rumor.',
    }),
  });
  assert.equal(exhausted.response.status, 200);
  assert.equal(exhausted.body.status, 'revise');
  assert.match(exhausted.body.message, /fallback.*exhausted/i);
});

test('Stage 6B.12.3 Mara previews, submits, fallback, exits, and archive remain player-safe', async () => {
  const player = await createReadyPlayer('mara_preview_submit');
  const preview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      move_id: 'move_suggest_deeper_pattern',
      submitted_text: 'I suggest the pattern is deeper than banditry.',
    }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.preview.move_id, 'move_suggest_deeper_pattern');
  assert.equal(preview.body.preview.check_preview.label, 'Persuasion check');
  assert.equal(preview.body.preview.check_preview.dc_visible, false);
  assert.equal(preview.body.preview.spends_dialogue_beat, true);
  assertPlayerSafePayload(preview.body);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      move_id: 'move_suggest_deeper_pattern',
      submitted_text: 'I suggest the pattern is deeper than banditry.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.social_move_result.branch, 'success');
  assert.ok(submitted.body.social_move_result.knowledge_grants_applied.includes('dunmere_wants_simple_answer'));
  assert.equal(submitted.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  assertPlayerSafePayload(submitted.body);

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      exit_id: 'exit_return_to_dunmere_village',
    }),
  });
  assert.equal(exit.response.status, 200);
  assert.deepEqual(exit.body.transition, {
    target_type: 'exploration',
    target_id: 'dunmere-village',
  });
  assert.ok(exit.body.completed_dialogue_record?.completed_dialogue_record_id);
  assert.match(exit.body.completed_dialogue_record.compact_summary, /Mara Vellin pressed for proof/i);
  assertPlayerSafePayload(exit.body);

  const archive = await request(
    `/api/play/dialogue/archive/${exit.body.completed_dialogue_record.completed_dialogue_record_id}`,
    { headers: player.headers }
  );
  assert.equal(archive.response.status, 200);
  assert.match(archive.body.record.compact_summary, /bandit explanation/i);
  assert.equal(JSON.stringify(archive.body).includes('"pressure":'), false);
  assertPlayerSafePayload(archive.body);

  const fallbackPlayer = await createReadyPlayer('mara_fallback');
  const fallback = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: maraSceneId,
      submitted_text: 'I ask Mara about a mayoral seal nobody mentioned.',
    }),
  });
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.social_move_result.generic_fallback_id, 'default');
  assert.deepEqual(fallback.body.social_move_result.knowledge_grants_applied, []);
  assert.equal(fallback.body.current_dialogue.dialogue_scene_state.fallback_usage.exhausted, true);
  assertPlayerSafePayload(fallback.body);
});

test('Stage 6B.12.3 Lysa previews, submits, fallback, exits, and archive remain player-safe', async () => {
  const player = await createReadyPlayer('lysa_preview_submit');
  const preview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      move_id: 'move_ground_lysa_suspicion',
      submitted_text: 'I gently separate grief from evidence.',
    }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.preview.move_id, 'move_ground_lysa_suspicion');
  assert.equal(preview.body.preview.check_preview.label, 'Persuasion check');
  assert.equal(preview.body.preview.check_preview.dc_visible, false);
  assert.equal(preview.body.preview.spends_dialogue_beat, true);
  assertPlayerSafePayload(preview.body);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      move_id: 'move_ground_lysa_suspicion',
      submitted_text: 'I gently separate grief from evidence.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.social_move_result.branch, 'success');
  assert.ok(submitted.body.social_move_result.knowledge_grants_applied.includes('village_blames_hunter_and_road'));
  assert.equal(submitted.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  assertPlayerSafePayload(submitted.body);

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      exit_id: 'exit_return_to_dunmere_village',
    }),
  });
  assert.equal(exit.response.status, 200);
  assert.deepEqual(exit.body.transition, {
    target_type: 'exploration',
    target_id: 'dunmere-village',
  });
  assert.ok(exit.body.completed_dialogue_record?.completed_dialogue_record_id);
  assert.match(exit.body.completed_dialogue_record.compact_summary, /Lysa Fen tied Dunmere's fear/i);
  assertPlayerSafePayload(exit.body);

  const archive = await request(
    `/api/play/dialogue/archive/${exit.body.completed_dialogue_record.completed_dialogue_record_id}`,
    { headers: player.headers }
  );
  assert.equal(archive.response.status, 200);
  assert.match(archive.body.record.compact_summary, /suspicion remains pressure rather than proof/i);
  assert.equal(JSON.stringify(archive.body).includes('suspicion":'), false);
  assertPlayerSafePayload(archive.body);

  const fallbackPlayer = await createReadyPlayer('lysa_fallback');
  const fallback = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: lysaSceneId,
      submitted_text: 'I ask Lysa about a hidden magistrate nobody mentioned.',
    }),
  });
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.social_move_result.generic_fallback_id, 'default');
  assert.deepEqual(fallback.body.social_move_result.knowledge_grants_applied, []);
  assert.equal(fallback.body.current_dialogue.dialogue_scene_state.fallback_usage.exhausted, true);
  assertPlayerSafePayload(fallback.body);
});

test('Stage 6B.12.4 Garren dialogue loads, resolves route knowledge, and preserves player-safe visibility', async () => {
  const player = await createReadyPlayer('garren_load_route');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${garrenSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, garrenSceneId);
  assert.match(loaded.body.conversation_surface.paragraphs[0].text, /Garren Holt keeps his back/i);
  assert.ok(
    loaded.body.passive_social_insight.some(
      (insight) => insight.insight_id === 'insight_garren_defensive_not_guilty'
    )
  );
  assert.ok(
    loaded.body.clarifying_questions.some(
      (question) => question.question_id === 'clarify_garren_old_path_sighting'
    )
  );
  assert.ok(
    loaded.body.committed_social_moves.some(
      (move) => move.move_id === 'move_press_for_whole_trail'
    )
  );
  assertPlayerSafePayload(loaded.body);

  const sighting = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      question_id: 'clarify_garren_old_path_sighting',
    }),
  });
  assert.equal(sighting.response.status, 200);
  assert.equal(sighting.body.status, 'resolved');
  assert.match(sighting.body.clarifying_question_result.result.text, /Too many boots/i);
  assert.equal(sighting.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assert.ok(sighting.body.clarifying_question_result.result.knowledge_grants_applied.includes('garren_knows_old_paths'));
  assert.ok(sighting.body.clarifying_question_result.result.knowledge_grants_applied.includes('old_path_still_used'));
  assertPlayerSafePayload(sighting.body);

  const failedRead = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      question_id: 'clarify_read_garren_warning',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failedRead.response.status, 200);
  assert.equal(failedRead.body.clarifying_question_result.status, 'failed');

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      question_id: 'clarify_read_garren_warning',
      forced_outcome: 'success',
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.equal(reopened.body.clarifying_question_result.status, 'failed');

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
  assert.equal(respectful.body.social_move_result.branch, 'no_check');
  assert.ok(respectful.body.social_move_result.knowledge_grants_applied.includes('tracks_converge_on_shrine'));
  assert.equal(respectful.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  assertPlayerSafePayload(respectful.body);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      move_id: 'move_press_for_whole_trail',
      submitted_text: 'I ask for the whole trail while keeping him out of village blame.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.social_move_result.branch, 'success');
  assert.ok(submitted.body.social_move_result.knowledge_grants_applied.includes('tracks_converge_on_shrine'));
  assert.equal(submitted.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 2);
  assertPlayerSafePayload(submitted.body);

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      exit_id: 'exit_follow_old_path_lead',
    }),
  });
  assert.equal(exit.response.status, 200);
  assert.deepEqual(exit.body.transition, {
    target_type: 'exploration',
    target_id: 'old-forest-path',
  });
  assert.ok(exit.body.completed_dialogue_record?.completed_dialogue_record_id);
  assert.match(exit.body.completed_dialogue_record.compact_summary, /Garren Holt warned/i);
  assertPlayerSafePayload(exit.body);

  const archive = await request(
    `/api/play/dialogue/archive/${exit.body.completed_dialogue_record.completed_dialogue_record_id}`,
    { headers: player.headers }
  );
  assert.equal(archive.response.status, 200);
  assert.match(archive.body.record.compact_summary, /old paths have become too busy/i);
  assert.equal(JSON.stringify(archive.body).includes('guardedness":'), false);
  assertPlayerSafePayload(archive.body);

  const fallbackPlayer = await createReadyPlayer('garren_fallback');
  const fallback = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: garrenSceneId,
      submitted_text: 'I ask Garren about a lost mule on the ridge.',
    }),
  });
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.social_move_result.generic_fallback_id, 'default');
  assert.deepEqual(fallback.body.social_move_result.knowledge_grants_applied, []);
  assert.equal(fallback.body.current_dialogue.dialogue_scene_state.fallback_usage.exhausted, true);
  assertPlayerSafePayload(fallback.body);
});

test('Stage 6B.12.5 Rusk dialogue loads, resolves shrine instability, and preserves player-safe visibility', async () => {
  const player = await createReadyPlayer('rusk_load_instability');
  const loaded = await request(`/api/play/dialogue/current?dialogue_scene_id=${ruskSceneId}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, ruskSceneId);
  assert.match(loaded.body.conversation_surface.paragraphs[0].text, /Rusk stands among the broken shrine stones/i);
  assert.ok(
    loaded.body.passive_social_insight.some(
      (insight) => insight.insight_id === 'insight_rusk_anger_not_fully_self_directed'
    )
  );
  assert.ok(
    loaded.body.clarifying_questions.some(
      (question) => question.question_id === 'clarify_rusk_what_he_hears'
    )
  );
  assert.ok(
    loaded.body.committed_social_moves.some(
      (move) => move.move_id === 'move_push_rusk_to_name_source' && move.status === 'locked'
    )
  );
  assertPlayerSafePayload(loaded.body);

  const hears = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      question_id: 'clarify_rusk_what_he_hears',
    }),
  });
  assert.equal(hears.response.status, 200);
  assert.equal(hears.body.status, 'resolved');
  assert.match(hears.body.clarifying_question_result.result.text, /world getting simpler/i);
  assert.equal(hears.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);
  assert.ok(
    hears.body.clarifying_question_result.result.knowledge_grants_applied.includes(
      'bandits_not_fully_self_directed'
    )
  );
  assert.ok(
    hears.body.current_dialogue.committed_social_moves.some(
      (move) => move.move_id === 'move_push_rusk_to_name_source' && move.status === 'available'
    )
  );
  assertPlayerSafePayload(hears.body);

  const failedRead = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      question_id: 'clarify_read_rusk_control_fracture',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failedRead.response.status, 200);
  assert.equal(failedRead.body.clarifying_question_result.status, 'failed');

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      question_id: 'clarify_read_rusk_control_fracture',
      forced_outcome: 'success',
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.equal(reopened.body.clarifying_question_result.status, 'failed');

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
  assert.equal(keepTalking.body.social_move_result.branch, 'success');
  assert.ok(
    keepTalking.body.social_move_result.knowledge_grants_applied.includes(
      'bandits_not_fully_self_directed'
    )
  );
  assert.equal(keepTalking.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  assertPlayerSafePayload(keepTalking.body);

  const source = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      move_id: 'move_push_rusk_to_name_source',
      submitted_text: 'I push Rusk to name what is below the shrine.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(source.response.status, 200);
  assert.equal(source.body.social_move_result.branch, 'success');
  assert.ok(source.body.social_move_result.knowledge_grants_applied.includes('shrine_depth_unlocked'));
  assert.ok(source.body.social_move_result.knowledge_grants_applied.includes('hollow_reaches_shrine_above'));
  assert.equal(source.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 2);
  assertPlayerSafePayload(source.body);

  const exit = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      exit_id: 'exit_rusk_combat_pending',
    }),
  });
  assert.equal(exit.response.status, 200);
  assert.deepEqual(exit.body.transition, {
    target_type: 'exploration',
    target_id: 'shrine-ruins',
  });
  assert.ok(exit.body.completed_dialogue_record?.completed_dialogue_record_id);
  assert.match(exit.body.completed_dialogue_record.compact_summary, /Rusk at the shrine revealed/i);
  assertPlayerSafePayload(exit.body);

  const archive = await request(
    `/api/play/dialogue/archive/${exit.body.completed_dialogue_record.completed_dialogue_record_id}`,
    { headers: player.headers }
  );
  assert.equal(archive.response.status, 200);
  assert.match(archive.body.record.compact_summary, /could not make Rusk safe/i);
  assert.equal(JSON.stringify(archive.body).includes('instability":'), false);
  assertPlayerSafePayload(archive.body);

  const fallbackPlayer = await createReadyPlayer('rusk_fallback');
  const fallback = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: fallbackPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: ruskSceneId,
      submitted_text: 'I ask Rusk about a lost wagon key near the stones.',
    }),
  });
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.body.social_move_result.generic_fallback_id, 'default');
  assert.deepEqual(fallback.body.social_move_result.knowledge_grants_applied, []);
  assert.equal(fallback.body.current_dialogue.dialogue_scene_state.fallback_usage.exhausted, true);
  assertPlayerSafePayload(fallback.body);
});

test('Build 11 Greyvale completion, archive, search, and lifecycle remain player-safe', async () => {
  const player = await createReadyPlayer('archive_lifecycle');
  await grantDebugCapability(player);
  const { completedRecordId } = await playGreyvaleDialogueToExit(player);

  const archive = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(archive.response.status, 200);
  assert.match(archive.body.record.compact_summary, /Elin shared memory fragments/i);
  assert.ok(archive.body.record.transcript_turns.some((turn) => turn.turn_type === 'clarifying_answer'));
  assert.ok(archive.body.record.transcript_turns.some((turn) => turn.turn_type === 'social_move_result'));
  assertPlayerSafePayload(archive.body);

  const search = await request('/api/play/dialogue/search?q=shrine%20bell', {
    headers: player.headers,
  });
  assert.equal(search.response.status, 200);
  assert.ok(search.body.results.some((result) => result.completed_dialogue_record_id === String(completedRecordId)));
  assertPlayerSafePayload(search.body);

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

  const pending = await request('/api/dev/dialogue-lifecycle/annotation', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      chain_id: chain.body.chain.chain_id,
      record_type: 'suggestion',
      review_status: 'pending_review',
      lifecycle_status: 'draft',
      original_text: 'Greyvale pending note should stay hidden.',
      source_event_links: [{ source_type: 'completed_dialogue_summary' }],
      affected_surfaces: ['completed_dialogue_archive'],
    }),
  });
  assert.equal(pending.response.status, 201);

  const hiddenArchive = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.equal(JSON.stringify(hiddenArchive.body).includes('Greyvale pending note'), false);

  const approved = await request('/api/dev/dialogue-lifecycle/review', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      record_kind: 'annotation',
      record_id: pending.body.record.record_id,
      action: 'approve_with_edits',
      edited_text: 'Greyvale note: Elin linked the attack memory to the shrine bell without naming a culprit.',
      player_facing: true,
    }),
  });
  assert.equal(approved.response.status, 200);

  const visibleArchive = await request(`/api/play/dialogue/archive/${completedRecordId}`, {
    headers: player.headers,
  });
  assert.match(JSON.stringify(visibleArchive.body), /Greyvale note: Elin linked/);
  assert.equal(visibleArchive.body.record.compact_summary, archive.body.record.compact_summary);
  assertPlayerSafePayload(visibleArchive.body);

  const unsafe = await request('/api/dev/dialogue-lifecycle/correction', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      chain_id: chain.body.chain.chain_id,
      record_type: 'generated_correction',
      review_status: 'generated',
      lifecycle_status: 'draft',
      original_text: 'Unsafe generated correction.',
      source_event_links: [{ source_type: 'relationship_audit' }],
    }),
  });
  assert.equal(unsafe.response.status, 400);
});

test('Build 11 Greyvale GM/dev workspace exposes diagnostics only through authorized path', async () => {
  const denied = await createReadyPlayer('debug_denied');
  const deniedResponse = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${sceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedResponse.response.status, 403);

  const player = await createReadyPlayer('debug_allowed');
  await grantDebugCapability(player);
  await playGreyvaleDialogueToExit(player);

  const debug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${sceneId}`, {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.status, 'ok');
  assert.equal(debug.body.scene_state.dialogue_scene_id, sceneId);
  assert.ok(debug.body.availability.clarifying_questions.length >= 4);
  assert.ok(debug.body.availability.committed_social_moves.length >= 5);
  assert.ok(debug.body.availability.exits.length >= 3);
  assert.ok(debug.body.preview_mapping.hidden_dc !== undefined || debug.body.preview_mapping.check);
  assert.ok(debug.body.relationship_state.persistent_npc_state.length >= 3);
  assert.ok(debug.body.relationship_state.scene_local_state.length >= 4);
  assert.ok(debug.body.relationship_state.recent_writes.length >= 1);
  assert.ok(debug.body.transcript.turns.length >= 4);
  assert.ok(debug.body.annotation_correction_chains.chains.length >= 0);
  assert.ok(debug.body.audit_timeline.records.some((record) => record.event_type === 'committed_social_move_result'));
  assert.equal(debug.body.validation.hard_errors.length, 0);
  assert.ok(debug.body.test_paths.available_modes.includes('happy_path'));

  const playerFacing = await request(`/api/play/dialogue/current?dialogue_scene_id=${sceneId}`, {
    headers: player.headers,
  });
  assert.equal(playerFacing.response.status, 200);
  assertPlayerSafePayload(playerFacing.body);
});

test('Build 12.2 Tomas GM/dev workspace exposes conversion diagnostics only through authorized path', async () => {
  const denied = await createReadyPlayer('tomas_debug_denied');
  const deniedResponse = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${tomasSceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedResponse.response.status, 403);

  const player = await createReadyPlayer('tomas_debug_allowed');
  await grantDebugCapability(player);
  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: tomasSceneId,
      move_id: 'move_press_for_survivor',
      submitted_text: 'I press him for the specific survivor.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(submitted.response.status, 200);

  const debug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.scene_state.dialogue_scene_id, tomasSceneId);
  assert.ok(debug.body.availability.clarifying_questions.length >= 5);
  assert.ok(debug.body.availability.committed_social_moves.length >= 5);
  assert.ok(debug.body.availability.exits.length >= 3);
  assert.ok(debug.body.relationship_state.persistent_npc_state.length >= 3);
  assert.ok(debug.body.relationship_state.scene_local_state.length >= 4);
  assert.ok(debug.body.relationship_state.recent_writes.length >= 1);
  assert.ok(debug.body.audit_timeline.records.some((record) => record.event_type === 'committed_social_move_result'));
  assert.equal(debug.body.validation.hard_errors.length, 0);
  assert.ok(debug.body.test_paths.available_modes.includes('happy_path'));

  const playerFacing = await request(`/api/play/dialogue/current?dialogue_scene_id=${tomasSceneId}`, {
    headers: player.headers,
  });
  assert.equal(playerFacing.response.status, 200);
  assertPlayerSafePayload(playerFacing.body);
});

test('Stage 6B.12.5 Mara, Lysa, Garren, and Rusk GM/dev workspace exposes diagnostics only through authorized path', async () => {
  const denied = await createReadyPlayer('mara_lysa_garren_rusk_debug_denied');
  const deniedMara = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${maraSceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedMara.response.status, 403);
  const deniedLysa = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${lysaSceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedLysa.response.status, 403);
  const deniedGarren = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${garrenSceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedGarren.response.status, 403);
  const deniedRusk = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${ruskSceneId}`, {
    headers: denied.headers,
  });
  assert.equal(deniedRusk.response.status, 403);

  for (const [label, dialogueSceneId, moveId, submittedText] of [
    ['mara', maraSceneId, 'move_suggest_deeper_pattern', 'I suggest the pattern is deeper than banditry.'],
    ['lysa', lysaSceneId, 'move_ground_lysa_suspicion', 'I gently separate grief from evidence.'],
    ['garren', garrenSceneId, 'move_show_respect_for_caution', "I show respect for Garren's caution."],
    ['rusk', ruskSceneId, 'move_keep_rusk_talking', 'I keep Rusk talking while he is still listening.'],
  ]) {
    const player = await createReadyPlayer(`${label}_debug_allowed`);
    await grantDebugCapability(player);
    const submitted = await request('/api/play/dialogue/social-move/submit', {
      method: 'POST',
      headers: player.headers,
      body: JSON.stringify({
        dialogue_scene_id: dialogueSceneId,
        move_id: moveId,
        submitted_text: submittedText,
        forced_outcome: 'success',
      }),
    });
    assert.equal(submitted.response.status, 200);

    const debug = await request(`/api/dev/dialogue-debug?dialogue_scene_id=${dialogueSceneId}`, {
      headers: player.headers,
    });
    assert.equal(debug.response.status, 200);
    assert.equal(debug.body.scene_state.dialogue_scene_id, dialogueSceneId);
    assert.ok(debug.body.availability.clarifying_questions.length >= 5);
    assert.ok(debug.body.availability.committed_social_moves.length >= 5);
    assert.ok(debug.body.availability.exits.length >= 3);
    assert.ok(debug.body.relationship_state.persistent_npc_state.length >= 3);
    assert.ok(debug.body.relationship_state.scene_local_state.length >= 4);
    assert.ok(debug.body.relationship_state.recent_writes.length >= 1, `${label} debug should include recent relationship writes`);
    assert.ok(debug.body.audit_timeline.records.some((record) => record.event_type === 'committed_social_move_result'));
    assert.equal(debug.body.validation.hard_errors.length, 0);
    assert.ok(debug.body.test_paths.available_modes.includes('happy_path'));

    const playerFacing = await request(`/api/play/dialogue/current?dialogue_scene_id=${dialogueSceneId}`, {
      headers: player.headers,
    });
    assert.equal(playerFacing.response.status, 200);
    assertPlayerSafePayload(playerFacing.body);
  }
});

test('Build 11 Greyvale path harness named paths run against authored fixture', async () => {
  for (const pathSpec of greyvaleElinMemoryExpectedPaths.paths) {
    const player = await createReadyPlayer(`path_${pathSpec.name}`);
    await grantDebugCapability(player);
    const result = await request('/api/dev/dialogue-path-test/run', {
      method: 'POST',
      headers: player.headers,
      body: JSON.stringify({
        dialogue_scene_id: sceneId,
        mode: pathSpec.mode,
        allow_active_runtime_mutation: pathSpec.mode !== 'validation_only',
      }),
    });
    assert.equal(result.response.status, 200, `${pathSpec.name} should run`);
    assert.notEqual(result.body.status, 'failed', `${pathSpec.name} should not fail`);
    assert.equal(result.body.validation.hard_errors.length, 0, `${pathSpec.name} should have no hard validation errors`);
    assert.equal(result.body.findings.hard_errors.length, 0, `${pathSpec.name} should have no hard findings`);
    assert.equal(result.body.used_real_runtime_services, true);
    assertPlayerSafePayload(result.body.steps.map((step) => step.player_facing_snapshot));
    if (pathSpec.expected_final_status) {
      assert.equal(result.body.final_status, pathSpec.expected_final_status, `${pathSpec.name} final status`);
    }
    if (pathSpec.name === 'relationship_state_edge_case') {
      assert.ok(
        result.body.steps.some((step) => step.relationship_diffs.length > 0),
        'relationship path should report relationship diffs'
      );
    }
    if (pathSpec.name === 'fallback_path') {
      assert.match(JSON.stringify(result.body.steps), /generic_fallback_preview|fallback.*exhausted/i);
    }
  }
});

test('Build 12.2 Tomas path harness named paths run against converted fixture', async () => {
  for (const pathSpec of greyvaleTomasRoadsideWorriesExpectedPaths.paths) {
    const player = await createReadyPlayer(`tomas_path_${pathSpec.name}`);
    await grantDebugCapability(player);
    const result = await request('/api/dev/dialogue-path-test/run', {
      method: 'POST',
      headers: player.headers,
      body: JSON.stringify({
        dialogue_scene_id: tomasSceneId,
        mode: pathSpec.mode,
        allow_active_runtime_mutation: pathSpec.mode !== 'validation_only',
      }),
    });
    assert.equal(result.response.status, 200, `${pathSpec.name} should run`);
    assert.notEqual(result.body.status, 'failed', `${pathSpec.name} should not fail`);
    assert.equal(result.body.validation.hard_errors.length, 0, `${pathSpec.name} should have no hard validation errors`);
    assert.equal(result.body.findings.hard_errors.length, 0, `${pathSpec.name} should have no hard findings`);
    assert.equal(result.body.used_real_runtime_services, true);
    assertPlayerSafePayload(result.body.steps.map((step) => step.player_facing_snapshot));
    if (pathSpec.expected_final_status) {
      assert.equal(result.body.final_status, pathSpec.expected_final_status, `${pathSpec.name} final status`);
    }
    if (pathSpec.name === 'fallback_path') {
      assert.match(JSON.stringify(result.body.steps), /generic_fallback_preview|fallback.*exhausted/i);
    }
    if (pathSpec.name === 'relationship_state_path') {
      assert.ok(
        result.body.steps.some((step) => step.relationship_diffs.length > 0),
        'relationship path should report relationship diffs'
      );
    }
  }
});

test('Stage 6B.12.5 Mara, Lysa, Garren, and Rusk path harness named paths run against converted fixtures', async () => {
  for (const [label, dialogueSceneId, expectedPaths] of [
    ['mara', maraSceneId, greyvaleMaraDunmerePressureExpectedPaths],
    ['lysa', lysaSceneId, greyvaleLysaGriefSuspicionExpectedPaths],
    ['garren', garrenSceneId, greyvaleGarrenPathKnowledgeExpectedPaths],
    ['rusk', ruskSceneId, greyvaleRuskAtShrineExpectedPaths],
  ]) {
    for (const pathSpec of expectedPaths.paths) {
      const player = await createReadyPlayer(`${label}_path_${pathSpec.name}`);
      await grantDebugCapability(player);
      const result = await request('/api/dev/dialogue-path-test/run', {
        method: 'POST',
        headers: player.headers,
        body: JSON.stringify({
          dialogue_scene_id: dialogueSceneId,
          mode: pathSpec.mode,
          steps: pathSpec.steps,
          allow_active_runtime_mutation: pathSpec.mode !== 'validation_only',
        }),
      });
      assert.equal(result.response.status, 200, `${label} ${pathSpec.name} should run`);
      assert.notEqual(result.body.status, 'failed', `${label} ${pathSpec.name} should not fail`);
      assert.equal(result.body.validation.hard_errors.length, 0, `${label} ${pathSpec.name} should have no hard validation errors`);
      assert.equal(result.body.findings.hard_errors.length, 0, `${label} ${pathSpec.name} should have no hard findings`);
      assert.equal(result.body.used_real_runtime_services, true);
      assertPlayerSafePayload(result.body.steps.map((step) => step.player_facing_snapshot));
      if (pathSpec.expected_final_status) {
        assert.equal(result.body.final_status, pathSpec.expected_final_status, `${label} ${pathSpec.name} final status`);
      }
      if (pathSpec.name === 'fallback_path') {
        assert.match(JSON.stringify(result.body.steps), /generic_fallback_preview|fallback.*exhausted/i);
      }
      if (pathSpec.name === 'relationship_state_path' || pathSpec.name === 'instability_state_path') {
        assert.ok(
          result.body.steps.some((step) => step.relationship_diffs.length > 0),
          `${label} relationship/instability path should report relationship diffs`
        );
      }
    }
  }
});

test('Build 11 generated-summary variant stays conservative and safe', async () => {
  const scene = cloneGreyvaleFixture(greyvaleElinMemoryDialogueScene);
  scene.id = 'greyvale_elin_memory_generated_summary';
  scene.slug = 'greyvale-elin-memory-generated-summary';
  delete scene.summary_behavior.player_summary_template;
  scene.summary_behavior.mode = 'conservative_generated';
  scene.completed_dialogue_record.summary_sources = [
    {
      source_id: 'player_transcript_only',
      visibility: 'player_visible',
    },
  ];
  registerDialogueFocusCommitSceneForTests(scene);

  const player = await createReadyPlayer('generated_summary');
  const loaded = await request('/api/play/dialogue/current?dialogue_scene_id=greyvale_elin_memory_generated_summary', {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);

  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'greyvale_elin_memory_generated_summary',
      move_id: 'move_reassure_elin',
      submitted_text: 'I reassure Elin she can stop.',
    }),
  });
  assert.equal(submitted.response.status, 200);

  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'greyvale_elin_memory_generated_summary',
      exit_id: 'exit_return_to_common_room',
    }),
  });
  assert.equal(exited.response.status, 200);
  const recordId = exited.body.completed_dialogue_record.completed_dialogue_record_id;

  const archive = await request(`/api/play/dialogue/archive/${recordId}`, {
    headers: player.headers,
  });
  assert.equal(archive.response.status, 200);
  assert.match(archive.body.record.compact_summary, /Elin steadies|You leave Elin/i);
  assertPlayerSafePayload(archive.body);
});
