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
  rusk: 'greyvale_rusk_at_the_shrine_dialogue',
};

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
  'awaiting_future_support',
  'combat_pending',
  'future_supported',
  'combat_routing',
  'shrine-rusk-confrontation',
  'target_encounter_id',
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
  return `stage6b15_inspector_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B15 Inspector ${label}`,
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
      name: `Inspector ${label.replaceAll('_', ' ').slice(0, 24)}`,
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

function assertPlayerSafePayload(payload, label = 'payload') {
  const text = JSON.stringify(payload).toLowerCase();
  for (const term of forbiddenPlayerTerms) {
    assert.equal(text.includes(term.toLowerCase()), false, `${label} leaked ${term}`);
  }
}

function assertPlayerProjectionSafe(inspector, label = 'inspector player projections') {
  assert.equal(inspector.player_vs_gm_visibility_comparison.player_projection_safe, true);
  assert.deepEqual(inspector.player_vs_gm_visibility_comparison.player_hidden_data_violations, []);
  assertPlayerSafePayload(inspector.current_scene.player_projection, `${label} current scene`);
  assertPlayerSafePayload(inspector.memory_and_outputs.player_projection, `${label} memory`);
  assertPlayerSafePayload(inspector.rusk_endpoint.player_projection, `${label} endpoint`);
}

async function moveToRuskEndpointState(player) {
  const scene = await query(
    `
      SELECT scene.id
      FROM dnd5e_scene scene
      JOIN dnd5e_world world ON world.id = scene.world_id
      WHERE world.slug = 'greyvale'
        AND scene.key = 'shrine-ruins'
      LIMIT 1
    `
  );
  assert.ok(scene.rows[0]?.id, 'shrine-ruins scene exists');
  await query(
    `
      UPDATE dnd5e_campaign_character
      SET current_scene_id = $1,
          current_scene_entered_at = NOW()
      WHERE campaign_id = $2
        AND character_id = $3
    `,
    [scene.rows[0].id, player.campaignId, player.characterId]
  );

  for (const flagKey of [
    'combat_pending',
    'shrine_confrontation_ready',
    'rusk_confronted_directly',
    'shrine_depth_unlocked',
    'understanding_high',
    'surface_threat_resolved',
  ]) {
    await query(
      `
        INSERT INTO dnd5e_character_flag (
          campaign_id,
          character_id,
          flag_key,
          flag_value_json,
          flag_category,
          metadata_json,
          notes,
          source_type,
          source_entity_id
        )
        VALUES ($1, $2, $3, 'true'::jsonb, 'greyvale_endpoint', $4::jsonb, $5, 'stage6b15_inspector_test', NULL)
        ON CONFLICT (campaign_id, character_id, flag_key)
        DO UPDATE SET
          flag_value_json = EXCLUDED.flag_value_json,
          flag_category = EXCLUDED.flag_category,
          metadata_json = EXCLUDED.metadata_json,
          notes = EXCLUDED.notes,
          source_type = EXCLUDED.source_type,
          source_entity_id = EXCLUDED.source_entity_id,
          updated_at = NOW()
      `,
      [
        player.campaignId,
        player.characterId,
        flagKey,
        JSON.stringify({ stage: '6B.15.7', inspector_fixture: true }),
        'Stage 6B.15.7 endpoint inspection fixture.',
      ]
    );
  }
}

test('Stage 6B.15.7 normal players cannot access the Greyvale slice inspector', async () => {
  const player = await createReadyPlayer('denied');

  const denied = await request('/api/dev/greyvale-slice-inspector', { headers: player.headers });
  assert.equal(denied.response.status, 403);
  assert.match(denied.body.error.message, /not authorized/i);
  assertPlayerSafePayload(denied.body, 'unauthorized inspector error');
});

test('Stage 6B.15.7 authorized GM/dev inspects active slice state and player-safe projection', async () => {
  const player = await createReadyPlayer('active');
  await grantDebugCapability(player);

  const inspected = await request('/api/dev/greyvale-slice-inspector', { headers: player.headers });
  assert.equal(inspected.response.status, 200, JSON.stringify(inspected.body));
  assert.equal(inspected.body.inspector_scope.stage, '6B.15.7');
  assert.equal(inspected.body.inspector_scope.not_full_gm_campaign_inspector, true);
  assert.equal(inspected.body.identity_scope.active_character_id, String(player.characterId));
  assert.equal(inspected.body.identity_scope.campaign_id, String(player.campaignId));
  assert.equal(inspected.body.slice_status.state, 'active');
  assert.equal(inspected.body.current_scene.player_projection.scene.key, 'broken-caravan-site');

  assert.equal(inspected.body.exploration.status, 'ok');
  assert.ok(inspected.body.exploration.mechanics_debug.scene_state);
  assert.equal(inspected.body.exploration.coverage.has_beat_action_options, true);
  assert.equal(inspected.body.exploration.coverage.has_check_metadata, true);
  assert.equal(inspected.body.exploration.coverage.has_visibility_notes, true);

  assert.equal(inspected.body.memory_and_outputs.gm_dev_diagnostics.status, 'ok');
  assert.ok(Array.isArray(inspected.body.memory_and_outputs.gm_dev_diagnostics.action_windows));
  assert.equal(
    inspected.body.player_vs_gm_visibility_comparison.gm_dev_signals.exploration_mechanics_debug,
    true
  );
  assert.ok(inspected.body.path_harness.canonical_route_steps.includes('rusk_confrontation'));
  assert.equal(inspected.body.path_harness.expected_path_files_remain_domain_specific, true);
  assertPlayerProjectionSafe(inspected.body);
});

test('Stage 6B.15.7 inspector includes active dialogue diagnostics for GM/dev only', async () => {
  const player = await createReadyPlayer('dialogue');
  await grantDebugCapability(player);

  const dialogue = await request(`/api/play/dialogue/current?dialogue_scene_id=${dialogueSceneIds.tomas}`, {
    headers: player.headers,
  });
  assert.equal(dialogue.response.status, 200, JSON.stringify(dialogue.body));
  assertPlayerSafePayload(dialogue.body, 'player dialogue current');

  const inspected = await request(
    `/api/dev/greyvale-slice-inspector?dialogue_scene_id=${dialogueSceneIds.tomas}`,
    { headers: player.headers }
  );
  assert.equal(inspected.response.status, 200, JSON.stringify(inspected.body));
  assert.equal(inspected.body.dialogue.status, 'ok');
  assert.equal(inspected.body.dialogue.scene_state.dialogue_scene_id, dialogueSceneIds.tomas);
  assert.ok(Array.isArray(inspected.body.dialogue.availability.clarifying_questions));
  assert.ok(Array.isArray(inspected.body.dialogue.availability.committed_social_moves));
  assert.ok(Array.isArray(inspected.body.dialogue.availability.exits));
  assert.ok(inspected.body.dialogue.relationship_state.persistent_npc_state);
  assert.ok(inspected.body.dialogue.transcript);
  assert.ok(inspected.body.dialogue.test_paths);
  assert.equal(
    inspected.body.player_vs_gm_visibility_comparison.gm_dev_signals.dialogue_debug_workspace,
    true
  );
  assertPlayerProjectionSafe(inspected.body, 'active dialogue inspector');
});

test('Stage 6B.15.7 inspector exposes Rusk future-supported handoff to GM/dev while player projection stays safe', async () => {
  const player = await createReadyPlayer('rusk_endpoint');
  await grantDebugCapability(player);
  await moveToRuskEndpointState(player);

  const scene = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(scene.response.status, 200, JSON.stringify(scene.body));
  assert.equal(scene.body.slice_endpoint.state, 'endpoint_reached');
  assert.equal(scene.body.action_status.state, 'slice_endpoint_reached');
  assertPlayerSafePayload(scene.body, 'player endpoint scene');

  const inspected = await request('/api/dev/greyvale-slice-inspector', { headers: player.headers });
  assert.equal(inspected.response.status, 200, JSON.stringify(inspected.body));
  assert.equal(inspected.body.slice_status.state, 'endpoint_reached');
  assert.equal(inspected.body.rusk_endpoint.player_projection.state, 'endpoint_reached');
  assert.equal(inspected.body.rusk_endpoint.gm_dev_handoff_debug.handoff_kind, 'combat_pending');
  assert.equal(
    inspected.body.rusk_endpoint.gm_dev_handoff_debug.future_supported_status,
    'future_supported_until_combat_system'
  );
  assert.equal(inspected.body.rusk_endpoint.gm_dev_handoff_debug.target_encounter_id, 'shrine-rusk-confrontation');
  assert.equal(
    inspected.body.player_vs_gm_visibility_comparison.endpoint_internals_hidden_from_player,
    true
  );
  assert.equal(
    inspected.body.player_vs_gm_visibility_comparison.endpoint_internals_visible_to_gm_dev,
    true
  );
  assert.equal(
    inspected.body.player_vs_gm_visibility_comparison.gm_dev_signals.endpoint_handoff_debug,
    true
  );
  assert.ok(
    inspected.body.memory_and_outputs.gm_dev_diagnostics.character_flags.some(
      (flag) => flag.flag_key === 'combat_pending'
    )
  );
  assertPlayerProjectionSafe(inspected.body, 'endpoint inspector');
});
