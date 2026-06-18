import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureActionComposerSchema } from '../src/services/actionComposerSchema.js';
import { ensureExplorationInteractionSchema } from '../src/services/explorationInteractionSchema.js';
import {
  explorationCheckDebugFields,
  explorationResultBandDebugFields,
} from '../src/services/explorationMechanicsDebugReadModel.js';
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
  return `greyvale_exploration_regression_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Greyvale Regression ${label}`,
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
      name: `Greyvale ${label.replaceAll('_', ' ')}`,
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

async function loadDebug(player) {
  const loaded = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.status, 'ok');
  return loaded.body.exploration_mechanics_debug;
}

function availableCloserLook(scenePayload, preferredId = null) {
  const closerLooks = scenePayload.scene_reference?.closer_looks ?? [];
  return (
    closerLooks.find((item) => preferredId && item.interaction_id === preferredId && item.is_available === true) ??
    closerLooks.find((item) => item.is_available === true)
  );
}

function committedFollowupInput(scenePayload) {
  const closerLook = availableCloserLook(scenePayload, 'focus_broken_axle');
  assert.ok(closerLook, 'Greyvale Broken Caravan should expose an available Closer Look');
  return {
    raw_text: `Inspect ${closerLook.label}`,
    selected_verb: 'investigate',
    continue_free_focus_interaction_id: closerLook.interaction_id,
  };
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

function collectForbiddenPaths(value, currentPath = []) {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectForbiddenPaths(entry, [...currentPath, String(index)]));
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const pathParts = [...currentPath, key];
    const own = forbiddenPlayerKeys.has(key) ? [pathParts.join('.')] : [];
    return [...own, ...collectForbiddenPaths(entry, pathParts)];
  });
}

function assertPlayerPayloadHasNoDebugInternals(payload, label) {
  const keyLeaks = collectForbiddenPaths(payload);
  assert.deepEqual(keyLeaks, [], `${label} leaked debug keys: ${keyLeaks.join(', ')}`);

  const text = JSON.stringify(payload);
  const termLeaks = forbiddenPlayerTerms.filter((term) => text.includes(term));
  assert.deepEqual(termLeaks, [], `${label} leaked debug terms: ${termLeaks.join(', ')}`);
}

function assertShapeFields(entry, fields, label) {
  for (const field of fields) {
    assert.ok(Object.hasOwn(entry, field), `${label} missing ${field}`);
  }
}

function assertGreyvaleDebugRichness(debug) {
  assert.equal(debug.scene_state.scene_slug, 'broken-caravan-site');
  assert.ok(debug.surface_context.base_authored_scene_description);
  assert.match(
    JSON.stringify(debug.surface_context).toLowerCase(),
    /caravan|grey road/,
    'surface context should identify the Broken Caravan / Grey Road scene'
  );
  assert.ok(Number(debug.scene_state.current_available_affordances_count) >= 1);
  assert.ok(debug.surface_context.free_focus_count >= 1);

  const passiveIds = new Set(debug.passive_discoveries.map((entry) => entry.id));
  assert.ok(passiveIds.has('notice_deep_tracks'));
  assert.ok(passiveIds.has('notice_attack_not_looting'));

  const freeFocusIds = new Set(debug.free_focus_items.map((entry) => entry.id));
  assert.ok(freeFocusIds.has('focus_broken_axle'));
  assert.ok(freeFocusIds.has('focus_scattered_cargo'));
  assert.ok(freeFocusIds.has('focus_roadside_mud'));

  const beatActionIds = new Set(
    debug.beat_action_options.map((entry) => entry.authored_action_id ?? entry.interaction_id)
  );
  assert.ok(debug.beat_action_options.length >= 1);
  assert.ok(beatActionIds.has('inspect-broken-caravan'));
  assert.ok(beatActionIds.has('examine-roadside-tracks'));
  assert.ok(beatActionIds.has('check-for-survivors'));

  assert.ok(debug.check_details.length >= 1);
  for (const detail of debug.check_details) {
    assertShapeFields(detail, explorationCheckDebugFields, 'check detail');
  }
  assert.ok(
    debug.check_details.some(
      (detail) => detail.source_type === 'free_focus' && detail.source_id === 'focus_broken_axle' && detail.dc === 13
    )
  );
  assert.ok(
    debug.check_details.some(
      (detail) => detail.source_type === 'beat_action' && detail.source_id === 'inspect-broken-caravan'
    )
  );
  assert.ok(
    debug.check_details.some(
      (detail) => detail.source_type === 'free_focus' && detail.source_id === 'focus_scattered_cargo' &&
        detail.requires_check === false && detail.check_kind === 'no_check'
    )
  );

  assert.ok(debug.result_bands.length >= 1);
  for (const band of debug.result_bands) {
    assertShapeFields(band, explorationResultBandDebugFields, 'result band');
  }
  assert.ok(debug.result_bands.some((band) => band.source_id === 'focus_broken_axle' && band.classification === 'success'));
  assert.ok(debug.result_bands.some((band) => band.source_type === 'scene_interaction' && band.classification === 'success'));
  assert.ok(debug.result_bands.some((band) => band.source_id === 'focus_scattered_cargo' && band.classification === 'no_check'));
  assert.ok(
    debug.result_bands.some((band) => (band.state_mutations ?? []).length >= 1),
    'Greyvale authored result bands should expose state mutation summaries where inspectable'
  );
  assert.ok(
    debug.result_bands.some((band) => (band.knowledge_grants ?? []).length >= 1),
    'Greyvale authored result bands should expose knowledge grant summaries where inspectable'
  );

  assert.ok(debug.environment_modifiers.length >= 1);
  assert.ok(Array.isArray(debug.npc_presence));
  assert.ok(Array.isArray(debug.state_reads));
  assert.ok(Array.isArray(debug.state_writes));
  assert.ok(Array.isArray(debug.knowledge_outputs));
  assert.ok(Array.isArray(debug.history_outputs));
  assert.ok(Array.isArray(debug.transitions));
  assert.ok(debug.transitions.some((transition) => transition.target_scene_key || transition.target_scene_id));
  assert.ok(Array.isArray(debug.audit_timeline));
  assert.ok(debug.audit_timeline.length >= 1);
  assert.ok(Array.isArray(debug.validation.hard_errors));
  assert.ok(Array.isArray(debug.validation.warnings));
  assert.ok(Array.isArray(debug.validation.debug_notices));
  assert.equal(debug.visibility_boundaries.includes_hidden_dc, true);
  assert.equal(debug.visibility_boundaries.includes_result_band_internals, true);
  assert.equal(debug.visibility_boundaries.includes_environment_debug, true);
  assert.equal(debug.visibility_boundaries.includes_audit_timeline, true);
  assert.equal(debug.visibility_boundaries.player_endpoint_exclusion_confirmed, true);
}

test('Stage 6B.11.6 Greyvale Broken Caravan debug payload is rich and explainable', async () => {
  const player = await createReadyPlayer('debug_richness');
  await grantDebugCapability(player);

  const debug = await loadDebug(player);
  assertGreyvaleDebugRichness(debug);
});

test('Stage 6B.11.6 Greyvale player-facing endpoints remain clean while debug endpoint stays rich', async () => {
  const player = await createReadyPlayer('player_boundary');
  const current = await request('/api/play/current-scene?include_mechanics=true', {
    headers: player.headers,
  });
  assert.equal(current.response.status, 200);
  assert.equal(current.body.scene.key, 'broken-caravan-site');

  const overlapPreview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      raw_text: 'Inspect the broken axle.',
      selected_verb: 'inspect',
    }),
  });
  assert.equal(overlapPreview.response.status, 200);
  assert.equal(overlapPreview.body.status, 'free_focus_overlap');
  assert.deepEqual(overlapPreview.body.free_focus_overlap.options, [
    'open_closer_look',
    'continue_as_beat_action',
    'edit_action',
  ]);
  assertPlayerPayloadHasNoDebugInternals(overlapPreview.body, 'Greyvale overlap preview');

  const resolvedPreview = await request('/api/play/action/preview', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(committedFollowupInput(current.body)),
  });
  assert.equal(resolvedPreview.response.status, 200);
  assert.equal(resolvedPreview.body.status, 'resolved');
  assertPlayerPayloadHasNoDebugInternals(resolvedPreview.body, 'Greyvale resolved preview');

  const focus = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: availableCloserLook(current.body).interaction_id,
      scene_id: current.body.scene.scene_id,
    }),
  });
  assert.equal(focus.response.status, 200);
  assertPlayerPayloadHasNoDebugInternals(focus.body, 'Greyvale Free Focus result');

  const endpoints = [
    ['current scene', current],
    ['overlap preview', overlapPreview],
    ['resolved preview', resolvedPreview],
    ['free focus result', focus],
    ['campaign history', await request('/api/play/campaign/history', { headers: player.headers })],
    ['campaign knowledge', await request('/api/play/campaign/knowledge', { headers: player.headers })],
    ['character sheet', await request(`/api/play/characters/${player.characterId}`, { headers: player.headers })],
  ];

  for (const [label, loaded] of endpoints) {
    assert.equal(loaded.response.status, 200, `${label} should load`);
    assertPlayerPayloadHasNoDebugInternals(loaded.body, label);
  }

  await grantDebugCapability(player);
  const debug = await loadDebug(player);
  assertGreyvaleDebugRichness(debug);
});

test('Stage 6B.11.6 Greyvale result resolution is explainable without player-facing leaks', async () => {
  const player = await createReadyPlayer('resolution');
  await grantDebugCapability(player);

  const current = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(current.response.status, 200);

  const submit = await request('/api/play/action/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify(committedFollowupInput(current.body)),
  });
  assert.equal(submit.response.status, 200);
  assertPlayerPayloadHasNoDebugInternals(submit.body, 'Greyvale action submit');

  const submittedDebug = await loadDebug(player);
  assert.ok(submittedDebug.submitted_action);
  assert.ok(submittedDebug.preview_mapping);
  assert.ok(submittedDebug.preview_mapping.raw_player_text);

  const advanced = await request('/api/dev/advance-beat', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({}),
  });
  assert.equal(advanced.response.status, 200);
  assert.equal(advanced.body.status, 'advanced');
  assertPlayerPayloadHasNoDebugInternals(advanced.body.current_scene, 'Greyvale advanced current scene');

  const debug = await loadDebug(player);
  assert.ok(debug.result_bands.some((band) => band.selected === true));
  assert.ok(Array.isArray(debug.state_writes));
  assert.ok(Array.isArray(debug.knowledge_outputs));
  assert.ok(debug.history_outputs.length >= 1);
  assert.ok(
    debug.audit_timeline.some((event) =>
      ['beat_action_submitted', 'result_band_selected', 'knowledge_granted', 'state_write'].includes(event.event_type)
    )
  );

  const currentAfter = await request('/api/play/current-scene?include_mechanics=true', {
    headers: player.headers,
  });
  assert.equal(currentAfter.response.status, 200);
  assertPlayerPayloadHasNoDebugInternals(currentAfter.body, 'Greyvale current scene after resolution');

  const history = await request('/api/play/campaign/history', { headers: player.headers });
  assert.equal(history.response.status, 200);
  assertPlayerPayloadHasNoDebugInternals(history.body, 'Greyvale history after resolution');

  const knowledge = await request('/api/play/campaign/knowledge', { headers: player.headers });
  assert.equal(knowledge.response.status, 200);
  assertPlayerPayloadHasNoDebugInternals(knowledge.body, 'Greyvale knowledge after resolution');
});

test('Stage 6B.11.6 Greyvale mechanics permission boundary blocks non-GM/dev access', async () => {
  const missing = await request('/api/dev/exploration-mechanics');
  assert.equal(missing.response.status, 401);

  const player = await createReadyPlayer('permission_player');
  const other = await createReadyPlayer('permission_other');
  const otherCurrent = await request('/api/play/current-scene', { headers: other.headers });
  assert.equal(otherCurrent.response.status, 200);

  const denied = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(denied.response.status, 403);
  assertPlayerPayloadHasNoDebugInternals(denied.body, 'Greyvale debug denial');

  const deniedWithParams = await request(
    `/api/dev/exploration-mechanics?character_id=${other.characterId}&campaign_instance_id=${otherCurrent.body.campaign_instance_id}`,
    { headers: player.headers }
  );
  assert.equal(deniedWithParams.response.status, 403);
  assertPlayerPayloadHasNoDebugInternals(deniedWithParams.body, 'Greyvale debug denial with alternate params');

  await grantDebugCapability(player);
  const allowed = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.body.status, 'ok');
  assert.ok(allowed.body.exploration_mechanics_debug.visibility_boundaries);
});
