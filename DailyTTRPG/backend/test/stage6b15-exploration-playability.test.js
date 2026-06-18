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
  return `stage6b15_exploration_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B15 Exploration ${label}`,
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
      name: `Explorer ${label.replaceAll('_', ' ').slice(0, 24)}`,
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
  'debug_summary',
  'state_reads',
  'state_writes',
  'raw_relationship',
  'preview_confidence',
  'routing_confidence',
  'preview_mapping',
  'path_harness',
  'future_supported',
  'combat_routing',
  'hidden_clue_metadata',
  'final_mystery',
  'duplicate key',
  'constraint',
  'stackTrace',
  'stack_trace',
];

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload);
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term), false, `${label} leaked ${term}`);
  }
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
    assert.equal(ids.has(expectedId), true, `${label} missing dialogue entry ${expectedId}`);
  }
}

function actionReference(action = {}) {
  return {
    actionKey: action.action_key ?? action.key ?? null,
    interactionId: action.interaction_id ?? action.interaction_key ?? null,
    transitionId: action.transition_id ?? action.transition_key ?? null,
    verb: action.verb ?? action.action ?? action.action_type ?? null,
  };
}

function findAffordanceWithAction(scenePayload, matcher, label) {
  const affordance = (scenePayload.visible_affordances ?? []).find((candidate) =>
    (candidate.available_actions ?? []).some((action) => matcher(actionReference(action)))
  );
  assert.ok(affordance, `${label} action should be visible in the player read model`);
  return affordance;
}

function findTransitionAffordance(scenePayload, transitionKey, label) {
  return findAffordanceWithAction(
    scenePayload,
    (action) => action.transitionId === transitionKey || action.actionKey === `move_scene:${transitionKey}`,
    label
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

function findInteractionAffordance(scenePayload, interactionKey, label) {
  return findAffordanceWithAction(
    scenePayload,
    (action) => action.interactionId === interactionKey || action.actionKey === `scene_interaction:${interactionKey}`,
    label
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
  return { preview: preview.body, submit: submit.body };
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
  const affordance = findTransitionAffordance(scenePayload, transitionKey, transitionKey);
  await previewAndSubmitTarget(player, scenePayload, affordance, rawText);
  return advanceBeat(player, transitionKey);
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

test('Stage 6B.15.2 Greyvale exploration route is playable from web start to shrine approach', async () => {
  const player = await createReadyPlayer('route');
  await grantDebugCapability(player);

  let scene = player.started.current_scene;
  assert.equal(scene.scene.key, 'broken-caravan-site');
  assert.equal(scene.current_objective.key, 'witness-the-aftermath');
  assert.equal(scene.action_status.state, 'action_needed');
  assert.ok(scene.scene_narration?.paragraphs?.length >= 2);
  assert.ok((scene.scene_reference?.closer_looks ?? []).some((look) => look.interaction_id === 'focus_broken_axle'));
  assert.deepEqual([...allDialogueSceneIds(scene)], [], 'Broken Caravan should not expose conversation entries');
  const roadToInn = (scene.visible_affordances ?? []).find((entry) => entry.affordance_id === 'road_to_inn');
  assert.ok(roadToInn, 'Broken Caravan should expose the road to the inn as a path');
  assert.equal(roadToInn.dialogue_scene_id, null, 'road to the inn must not be decorated as dialogue');
  assert.equal(
    (roadToInn.available_actions ?? []).some((action) => action.dialogue_scene_id),
    false,
    'road to the inn actions must not carry dialogue metadata'
  );
  assertPlayerSafePayload(scene, 'started current scene');

  const focus = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: 'focus_broken_axle',
      scene_id: scene.scene.scene_id,
    }),
  });
  assert.equal(focus.response.status, 200, JSON.stringify(focus.body));
  assert.equal(focus.body.free_focus_result?.interaction_id, 'focus_broken_axle');
  assert.equal(focus.body.free_focus_result?.is_viewed, true);
  assertPlayerSafePayload(focus.body, 'Broken Caravan Free Focus');
  assert.equal(await actionSubmissionCount(scene.action_status.action_window_id, player.characterId), 0);

  const inspect = findInteractionAffordance(scene, 'inspect-broken-caravan', 'inspect broken caravan');
  const firstWindowId = scene.action_status.action_window_id;
  await previewAndSubmitTarget(player, scene, inspect, 'I inspect the broken caravan.', {
    selected_verb: 'investigate',
    continue_free_focus_interaction_id: 'focus_broken_axle',
  });
  assert.equal(await actionSubmissionCount(firstWindowId, player.characterId), 1);
  scene = await advanceBeat(player, 'inspect broken caravan');
  assert.equal(scene.scene.key, 'broken-caravan-site');
  assert.notEqual(scene.action_status.action_window_id, firstWindowId);
  assert.equal(await playerBeatResultCount(firstWindowId, player.characterId), 1);
  assert.ok(
    scene.recent_summary?.latest_beat || scene.scene_result_feed?.latest_result,
    'Broken Caravan action should surface a player-facing latest result or recent summary'
  );

  const knowledgeAfterCaravan = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledgeAfterCaravan.response.status, 200);
  if (Number(knowledgeAfterCaravan.body.known_count ?? 0) > 0) {
    assert.match(
      JSON.stringify(knowledgeAfterCaravan.body),
      /clue_caravan_irregularity|Caravan Irregularity|interaction:inspect-broken-caravan/i
    );
  }
  assertPlayerSafePayload(knowledgeAfterCaravan.body, 'knowledge after caravan');

  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'leave-broken-caravan-for-inn',
    'I head to the Grey Road Inn.'
  );
  assert.equal(scene.scene.key, 'grey-road-inn');
  assertDialogueEntries(
    scene,
    [dialogueSceneIds.tomas, dialogueSceneIds.elin],
    'Grey Road Inn exploration scene'
  );
  assert.ok(hasTransitionAffordance(scene, 'continue-to-dunmere'), 'Inn should expose Continue to Dunmere');

  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'continue-to-dunmere',
    'I continue to Dunmere.'
  );
  assert.equal(scene.scene.key, 'dunmere-village');
  assertDialogueEntries(
    scene,
    [dialogueSceneIds.mara, dialogueSceneIds.lysa, dialogueSceneIds.garren],
    'Dunmere exploration scene'
  );
  assert.ok(hasTransitionAffordance(scene, 'follow-the-old-path'), 'Dunmere should expose the old path');

  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'follow-the-old-path',
    'I take the old forest path.'
  );
  assert.equal(scene.scene.key, 'old-forest-path');
  assert.ok(
    !hasTransitionAffordance(scene, 'follow-the-tracks-to-the-shrine'),
    'Shrine route should stay unavailable until the route is known'
  );
  assert.ok(
    findInteractionAffordance(scene, 'track-the-old-path', 'track the old path'),
    'Old path should expose the tracking action that unlocks the shrine route'
  );

  const forcedTrack = await actThroughPlayState(
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
  assert.match(JSON.stringify(forcedTrack), /track-the-old-path|Shrine Activity|shrine_path_known/i);
  assert.equal(await characterFlagValue(player, 'shrine_path_known'), true);

  scene = await currentScene(player);
  assert.equal(scene.scene.key, 'old-forest-path');
  assert.ok(
    hasTransitionAffordance(scene, 'follow-the-tracks-to-the-shrine'),
    'Shrine route should appear after the route knowledge flag is set'
  );
  const knowledgeAfterPath = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledgeAfterPath.response.status, 200);
  assertPlayerSafePayload(knowledgeAfterPath.body, 'knowledge after old path');

  scene = await submitTransitionAndAdvance(
    player,
    scene,
    'follow-the-tracks-to-the-shrine',
    'I follow the signs toward the shrine.'
  );
  assert.equal(scene.scene.key, 'shrine-ruins');
  assertDialogueEntries(scene, [dialogueSceneIds.rusk], 'Shrine approach scene');
  assert.ok((scene.scene_reference?.closer_looks ?? []).some((look) => look.interaction_id === 'focus_shrine_markings'));

  const debug = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.status, 'ok');
  assert.equal(debug.body.exploration_mechanics_debug.scene_state.scene_slug, 'shrine-ruins');
  assert.ok(debug.body.exploration_mechanics_debug.transitions.length >= 1);

  const resumed = await currentScene(player, '?include_mechanics=true');
  assert.equal(resumed.scene.key, 'shrine-ruins');
  assert.equal(resumed.action_status.state, 'action_needed');
  assertDialogueEntries(resumed, [dialogueSceneIds.rusk], 'resumed shrine scene');
});
