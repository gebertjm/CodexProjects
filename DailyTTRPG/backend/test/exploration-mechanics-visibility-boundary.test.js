import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureActionComposerSchema } from '../src/services/actionComposerSchema.js';
import { ensureExplorationInteractionSchema } from '../src/services/explorationInteractionSchema.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensurePlayerBeatResultSchema } from '../src/services/playerBeatResultService.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
  await ensureWebCharacterCreationSchema();
  await ensureActionComposerSchema();
  await ensureExplorationInteractionSchema();
  await ensurePlayerBeatResultSchema();
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
  return `exploration_boundary_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Exploration Boundary ${label}`,
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
      name: `Boundary ${label.replaceAll('_', ' ')}`,
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
    characterId: created.body.character.character_id,
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

const forbiddenPlayerKeys = new Set([
  'hidden_dc',
  'raw_roll',
  'total_result',
  'final_modifier',
  'base_modifier',
  'feature_bonus',
  'modifier_breakdown',
  'advantage_sources',
  'disadvantage_sources',
  'result_band',
  'result_bands',
  'selected_result_band',
  'branch_id',
  'gm_debug_summary',
  'gm_notes',
  'instrumentation_status',
  'debug_confidence',
  'debug_mapping',
  'matched_move_confidence',
  'preview_confidence',
  'hidden_requirements',
  'failed_hidden_requirements',
  'raw_state_reads',
  'state_reads',
  'raw_state_writes',
  'state_writes',
  'state_changes_applied',
  'hidden_environment_details',
  'environment_debug',
  'npc_schedule_debug',
  'hidden_npc_identity',
  'canonical_npc_name_when_hidden',
  'hidden_knowledge_outputs',
  'hidden_history_outputs',
  'hidden_transition_requirements',
  'audit_timeline',
  'debug_notices',
  'visibility_boundaries',
  'check_details',
]);

const forbiddenPlayerTerms = [
  'exploration_mechanics_debug',
  'visibility_boundaries',
  'audit_timeline',
  'instrumentation_status',
  'gm_debug_summary',
  'gm_notes',
  'linked_debug_sections',
  'hidden_transition_requirements',
  'hidden_npc_identity',
  'npc_schedule_debug',
  'hidden_environment_details',
  'debug_notices',
  'check_details',
  'result_bands',
  'state_changes_applied',
];

function collectForbiddenPaths(value, forbiddenKeys = forbiddenPlayerKeys, currentPath = []) {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectForbiddenPaths(entry, forbiddenKeys, [...currentPath, String(index)])
    );
  }
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    const pathParts = [...currentPath, key];
    const own = forbiddenKeys.has(key) ? [pathParts.join('.')] : [];
    return [...own, ...collectForbiddenPaths(entry, forbiddenKeys, pathParts)];
  });
}

function assertPlayerPayloadHasNoDebugInternals(payload, label) {
  const keyLeaks = collectForbiddenPaths(payload);
  assert.deepEqual(keyLeaks, [], `${label} leaked debug keys: ${keyLeaks.join(', ')}`);

  const text = JSON.stringify(payload);
  const termLeaks = forbiddenPlayerTerms.filter((term) => text.includes(term));
  assert.deepEqual(termLeaks, [], `${label} leaked debug terms: ${termLeaks.join(', ')}`);
}

function assertNoCandidateConfidence(payload, label) {
  const confidencePaths = [];
  function visit(value, currentPath = []) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...currentPath, String(index)]));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      const pathParts = [...currentPath, key];
      if (key === 'confidence' && currentPath.at(-1) === 'candidate') {
        confidencePaths.push(pathParts.join('.'));
      }
      visit(entry, pathParts);
    }
  }
  visit(payload);
  assert.deepEqual(confidencePaths, [], `${label} leaked preview candidate confidence`);
}

function availableCloserLook(scenePayload) {
  return (scenePayload.scene_reference?.closer_looks ?? []).find((item) => item.is_available === true);
}

function committedFollowupInput(scenePayload) {
  const closerLook = availableCloserLook(scenePayload);
  assert.ok(closerLook, 'Greyvale smoke scene should expose an available Closer Look');
  return {
    raw_text: `Inspect ${closerLook.label}`,
    selected_verb: 'investigate',
    continue_free_focus_interaction_id: closerLook.interaction_id,
  };
}

test('Stage 6B.11.5 player-facing exploration endpoints exclude GM/dev mechanics internals', async () => {
  const player = await createReadyPlayer('player_endpoints');
  const current = await request('/api/play/current-scene?include_mechanics=true', {
    headers: player.headers,
  });
  assert.equal(current.response.status, 200);

  const preview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(committedFollowupInput(current.body)),
  });
  assert.equal(preview.response.status, 200);

  const closerLook = availableCloserLook(current.body);
  const focus = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: closerLook.interaction_id,
      scene_id: current.body.scene.scene_id,
    }),
  });
  assert.equal(focus.response.status, 200);

  const submit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(committedFollowupInput(current.body)),
  });
  assert.equal(submit.response.status, 200);

  const endpoints = [
    ['dashboard', await request('/api/play/dashboard', { headers: player.headers })],
    ['current adventure', await request('/api/play/current-adventure', { headers: player.headers })],
    ['current scene', current],
    ['action preview', preview],
    ['free focus resolve', focus],
    ['action submit', submit],
    ['campaign history', await request('/api/play/campaign/history', { headers: player.headers })],
    ['campaign knowledge', await request('/api/play/campaign/knowledge', { headers: player.headers })],
    [
      'character sheet',
      await request(`/api/play/characters/${player.characterId}`, { headers: player.headers }),
    ],
  ];

  for (const [label, loaded] of endpoints) {
    assert.equal(loaded.response.status, 200, `${label} should load`);
    assertPlayerPayloadHasNoDebugInternals(loaded.body, label);
    assertNoCandidateConfidence(loaded.body, label);
  }
});

test('Stage 6B.11.5 action preview hides resolver confidence and debug mapping', async () => {
  const player = await createReadyPlayer('preview_boundary');
  const current = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(current.response.status, 200);

  const preview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(committedFollowupInput(current.body)),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.status, 'resolved');
  assert.ok(preview.body.candidate, 'committed follow-up preview should return a candidate');
  assert.equal(Object.hasOwn(preview.body.candidate, 'confidence'), false);
  assert.equal(Object.hasOwn(preview.body, 'preview_mapping'), false);
  assertPlayerPayloadHasNoDebugInternals(preview.body, 'action preview');
});

test('Stage 6B.11.5 GM/dev mechanics endpoint is a positive-control debug path', async () => {
  const player = await createReadyPlayer('gm_positive');
  const denied = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(denied.response.status, 403);

  await grantDebugCapability(player);
  const loaded = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.status, 'ok');

  const debug = loaded.body.exploration_mechanics_debug;
  assert.ok(debug);
  assert.ok(debug.visibility_boundaries);
  assert.equal(debug.visibility_boundaries.includes_hidden_dc, true);
  assert.equal(debug.visibility_boundaries.includes_audit_timeline, true);
  assert.ok(Array.isArray(debug.check_details));
  assert.ok(Array.isArray(debug.result_bands));
  assert.ok(Array.isArray(debug.state_reads));
  assert.ok(Array.isArray(debug.state_writes));
  assert.ok(Array.isArray(debug.audit_timeline));
  assert.ok(Object.hasOwn(debug, 'preview_mapping'));
});

test('Stage 6B.11.5 debug route rejects unauthenticated, normal, and alternate-param player access', async () => {
  const missing = await request('/api/dev/exploration-mechanics');
  assert.equal(missing.response.status, 401);

  const player = await createReadyPlayer('alternate_params');
  const other = await createReadyPlayer('other_campaign');
  const otherCurrent = await request('/api/play/current-scene', { headers: other.headers });
  assert.equal(otherCurrent.response.status, 200);

  const denied = await request(
    `/api/dev/exploration-mechanics?character_id=${other.characterId}&campaign_instance_id=${otherCurrent.body.campaign_instance_id}`,
    { headers: player.headers }
  );
  assert.equal(denied.response.status, 403);
  assertPlayerPayloadHasNoDebugInternals(denied.body, 'debug denial error');
});
