import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureDialogueFocusCommitPersistenceSchema } from '../src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import {
  clearDialogueFocusCommitSceneRegistryForTests,
  getDialogueFocusCommitEntryForNpc,
  registerDialogueFocusCommitSceneForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';
import {
  cloneFixture,
  dialogueSceneFixture,
  validMinimalDialogueScene,
} from './fixtures/dialogue-focus-commit-fixtures.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
  await ensureWebCharacterCreationSchema();
  await ensureDialogueFocusCommitPersistenceSchema();
  await importContentPackage(path.resolve(process.cwd(), '../content/worlds/greyvale'));
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
  return `dialogue_runtime_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Dialogue Runtime ${label}`,
  });
  const me = await request('/api/me', { headers });
  assert.equal(me.response.status, 200);
  return { uid, headers, accountId: Number(me.body.account.account_id) };
}

async function createQuickCharacter(player, name, archetypeId = 'stalwart_fighter') {
  const created = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      name,
      archetype_id: archetypeId,
    }),
  });
  assert.equal(created.response.status, 201);
  return created.body.character;
}

async function createReadyPlayer(label) {
  const player = await createPlayer(label);
  await createQuickCharacter(player, `Dialogue ${label.replaceAll('_', ' ')}`);
  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  return player;
}

function sceneQuery(sceneId = 'dialogue_elin_memory_focus_commit') {
  return `dialogue_scene_id=${encodeURIComponent(sceneId)}`;
}

function assertPlayerSafePayload(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('preview_debug_json'), false);
  assert.equal(text.includes('matched_move_confidence'), false);
  assert.equal(text.includes('difficulty_class'), false);
  assert.equal(text.includes('gm_dev'), false);
}

test('Build 4 dialogue scene loads as player-facing state', async () => {
  const player = await createReadyPlayer('load');
  const loaded = await request(`/api/play/dialogue/current?${sceneQuery()}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(loaded.body.dialogue_scene.dialogue_scene_id, 'dialogue_elin_memory_focus_commit');
  assert.equal(loaded.body.conversation_surface.paragraphs.length, 2);
  assert.equal(loaded.body.conversation_surface.paragraphs[0].text.includes('shaken woman'), true);
  assert.equal(loaded.body.dialogue_scene_state.committed_social_move_count, 0);
  assert.ok(loaded.body.clarifying_questions.length >= 2);
  assert.ok(loaded.body.committed_social_moves.length >= 2);
  assert.ok(loaded.body.dialogue_exits.length >= 1);
  assertPlayerSafePayload(loaded.body);
});

test('Greyvale bundled Focus/Commit scenes load without test-only registration', async () => {
  clearDialogueFocusCommitSceneRegistryForTests();
  const player = await createReadyPlayer('bundled_greyvale');
  const loaded = await request(
    `/api/play/dialogue/current?${sceneQuery('greyvale_tomas_roadside_worries_dialogue')}`,
    { headers: player.headers }
  );

  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'active');
  assert.equal(
    loaded.body.dialogue_scene.dialogue_scene_id,
    'greyvale_tomas_roadside_worries_dialogue'
  );
  assert.equal(loaded.body.dialogue_scene.title, "Tomas Rell and the Road's Pattern");
  assert.ok(loaded.body.clarifying_questions.length >= 1);
  assert.ok(loaded.body.committed_social_moves.length >= 1);
  assert.ok(loaded.body.dialogue_exits.length >= 1);
  assertPlayerSafePayload(loaded.body);
});

test('Greyvale NPC dialogue lookup accepts player-safe aliases', () => {
  clearDialogueFocusCommitSceneRegistryForTests();
  const tomasEntry = getDialogueFocusCommitEntryForNpc('tomas');
  assert.equal(
    tomasEntry?.dialogue_scene_id,
    'greyvale_tomas_roadside_worries_dialogue'
  );
});

test('Build 4 invalid dialogue scene returns structured validation failure', async () => {
  const invalid = cloneFixture(validMinimalDialogueScene);
  invalid.id = 'dialogue_invalid_runtime';
  delete invalid.conversation_surface;
  registerDialogueFocusCommitSceneForTests(invalid);
  const player = await createReadyPlayer('invalid');
  const loaded = await request(`/api/play/dialogue/current?${sceneQuery('dialogue_invalid_runtime')}`, {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.state, 'invalid_dialogue_scene');
  assert.equal(loaded.body.validation.ok, false);
  assert.ok(loaded.body.validation.hard_errors.some((error) => error.code === 'missing_conversation_surface'));
});

test('Build 4 Clarifying Questions resolve without spending a dialogue beat and can reopen', async () => {
  const player = await createReadyPlayer('clarify');
  const first = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      question_id: 'clarify_first_memory',
    }),
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.status, 'resolved');
  assert.equal(first.body.clarifying_question_result.status, 'asked');
  assert.match(first.body.clarifying_question_result.result.text, /wheel cracking/i);
  assert.equal(first.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 0);

  const reopened = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      question_id: 'clarify_first_memory',
    }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.status, 'already_resolved');
  assert.match(reopened.body.clarifying_question_result.result.text, /wheel cracking/i);
});

test('Build 4 checked Clarifying Question failure persists and does not reroll immediately', async () => {
  const player = await createReadyPlayer('clarify_fail');
  const failed = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      question_id: 'clarify_bandit_reaction',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(failed.response.status, 200);
  assert.equal(failed.body.clarifying_question_result.status, 'failed');
  assert.equal(failed.body.clarifying_question_result.result.check_result.outcome, 'failure');

  const second = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      question_id: 'clarify_bandit_reaction',
      forced_outcome: 'success',
    }),
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.status, 'already_resolved');
  assert.equal(second.body.clarifying_question_result.status, 'failed');
  assert.equal(second.body.clarifying_question_result.result.check_result.outcome, 'failure');
});

test('Build 4 authored Clarifying Question unlocks another interaction', async () => {
  const scene = dialogueSceneFixture({
    id: 'dialogue_unlock_runtime',
    slug: 'dialogue-unlock-runtime',
  });
  scene.clarifying_questions[0].result.unlocks = ['clarify_followup'];
  scene.clarifying_questions.push({
    question_id: 'clarify_followup',
    label: 'What did the bell sound like?',
    target_id: 'npc:elin_harrow',
    locked_by_default: true,
    requires_check: false,
    result: {
      text: 'She says the bell sounded cracked, not holy.',
    },
  });
  registerDialogueFocusCommitSceneForTests(scene);
  const player = await createReadyPlayer('unlock');
  const resolved = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_unlock_runtime',
      question_id: 'clarify_first_memory',
    }),
  });
  assert.equal(resolved.response.status, 200);
  const followup = resolved.body.current_dialogue.clarifying_questions.find(
    (question) => question.question_id === 'clarify_followup'
  );
  assert.ok(followup);
  assert.equal(followup.status, 'available');
  assert.equal(followup.is_available, true);
});

test('Build 4 committed social move preview is player-safe and confirms beat spend', async () => {
  const player = await createReadyPlayer('preview');
  const preview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      move_id: 'move_press_shrine_gently',
      submitted_text: 'I press gently about the shrine.',
    }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.status, 'preview');
  assert.equal(preview.body.preview.spends_dialogue_beat, true);
  assert.equal(preview.body.preview.requires_check, true);
  assert.equal(preview.body.preview.check_preview.label, 'Persuasion check');
  assert.equal(preview.body.preview.check_preview.dc_visible, false);
  assertPlayerSafePayload(preview.body);
});

test('Build 4 committed social moves resolve no-check and checked branches', async () => {
  const noCheckPlayer = await createReadyPlayer('submit_no_check');
  const noCheck = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: noCheckPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      move_id: 'move_listen_without_pressing',
      submitted_text: 'I listen without pressing.',
    }),
  });
  assert.equal(noCheck.response.status, 200);
  assert.equal(noCheck.body.status, 'resolved');
  assert.match(noCheck.body.social_move_result.result_text, /breathing steadies/i);
  assert.equal(noCheck.body.current_dialogue.dialogue_scene_state.committed_social_move_count, 1);
  const lockedQuestion = noCheck.body.current_dialogue.clarifying_questions.find(
    (question) => question.question_id === 'clarify_first_memory'
  );
  assert.equal(lockedQuestion.status, 'locked');

  const checkedPlayer = await createReadyPlayer('submit_checked');
  const checked = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: checkedPlayer.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      move_id: 'move_press_shrine_gently',
      submitted_text: 'I gently ask about the old shrine.',
      forced_outcome: 'success',
    }),
  });
  assert.equal(checked.response.status, 200);
  assert.equal(checked.body.social_move_result.branch, 'success');
  assert.match(checked.body.social_move_result.result_text, /shrine bell/i);
  assert.equal(checked.body.social_move_result.check_result.outcome, 'success');
  assert.equal(checked.body.social_move_result.knowledge_grants_applied.includes('shrine_bell_stopped_attack'), true);
});

test('Build 4 preview detects authored Clarifying Question overlap', async () => {
  const player = await createReadyPlayer('overlap');
  const preview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      submitted_text: 'I ask what do you remember first?',
    }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.status, 'clarifying_question_overlap');
  assert.equal(preview.body.overlap.question_id, 'clarify_first_memory');
  assert.deepEqual(preview.body.options, [
    'ask_clarifying_question',
    'continue_as_committed_social_move',
    'edit_action',
  ]);
});

test('Build 4 generic fallback is tracked and exhausts according to authored limit', async () => {
  const player = await createReadyPlayer('fallback');
  const first = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      submitted_text: 'I ask something unrelated about the weather.',
    }),
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.social_move_result.generic_fallback_id, 'default');
  assert.equal(first.body.current_dialogue.dialogue_scene_state.fallback_usage.used_count, 1);
  assert.equal(first.body.current_dialogue.dialogue_scene_state.fallback_usage.exhausted, true);

  const secondPreview = await request('/api/play/dialogue/social-move/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      submitted_text: 'I ask one more unrelated thing.',
    }),
  });
  assert.equal(secondPreview.response.status, 200);
  assert.equal(secondPreview.body.status, 'revise');
  assert.match(secondPreview.body.message, /fallback.*exhausted/i);
});

test('Build 4 dialogue exit resolves only through authored explicit transition', async () => {
  const player = await createReadyPlayer('exit');
  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      exit_id: 'exit_return_to_inn',
    }),
  });
  assert.equal(exited.response.status, 200);
  assert.equal(exited.body.status, 'exited');
  assert.equal(exited.body.transition.target_type, 'exploration');
  assert.equal(exited.body.transition.target_id, 'grey_road_inn_common_room');
  assert.equal(exited.body.current_dialogue.state, 'exited');
});
