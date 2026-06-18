import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureActionComposerSchema } from '../src/services/actionComposerSchema.js';
import { ensureExplorationInteractionSchema } from '../src/services/explorationInteractionSchema.js';
import {
  __private__ as explorationMechanicsPrivate,
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
  return `exploration_mechanics_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Exploration Mechanics ${label}`,
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
      name: `Exploration Mechanics ${label.replaceAll('_', ' ')}`,
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

function assertPlayerScenePayloadHasNoMechanicsDebug(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('exploration_mechanics_debug'), false);
  assert.equal(text.includes('check_details'), false);
  assert.equal(text.includes('result_bands'), false);
  assert.equal(text.includes('audit_timeline'), false);
  assert.equal(text.includes('preview_mapping'), false);
  assert.equal(text.includes('check_debug_breakdown'), false);
  assert.equal(text.includes('instrumentation_status'), false);
  assert.equal(text.includes('gm_debug_summary'), false);
  assert.equal(text.includes('gm_notes'), false);
  assert.equal(text.includes('environment_debug'), false);
  assert.equal(text.includes('hidden_environment'), false);
  assert.equal(text.includes('npc_schedule_debug'), false);
  assert.equal(text.includes('hidden_npc_identity'), false);
  assert.equal(text.includes('state_dependencies'), false);
  assert.equal(text.includes('hidden_knowledge_outputs'), false);
  assert.equal(text.includes('history_output_internals'), false);
  assert.equal(text.includes('hidden_transition_requirements'), false);
  assert.equal(text.includes('linked_debug_sections'), false);
  assert.equal(text.includes('gm_debug_text'), false);
  assert.equal(text.includes('includes_hidden_dc'), false);
  assert.equal(text.includes('raw_state_reads'), false);
  assert.equal(text.includes('raw_state_writes'), false);
  assert.equal(text.includes('hidden_npc_schedule_data'), false);
}

const requiredSections = [
  'scene_state',
  'surface_context',
  'passive_discoveries',
  'free_focus_items',
  'beat_action_options',
  'submitted_action',
  'preview_mapping',
  'check_details',
  'result_bands',
  'environment_modifiers',
  'npc_presence',
  'state_reads',
  'state_writes',
  'knowledge_outputs',
  'history_outputs',
  'transitions',
  'audit_timeline',
  'validation',
  'visibility_boundaries',
];

function assertCheckDebugShape(detail) {
  for (const field of explorationCheckDebugFields) {
    assert.ok(Object.hasOwn(detail, field), `missing check debug field ${field}`);
  }
  assert.ok(['available', 'partial', 'not_recorded', 'not_applicable', 'future_supported'].includes(
    detail.instrumentation_status
  ));
  if (detail.requires_check === false) {
    assert.equal(detail.check_kind, 'no_check');
    assert.equal(detail.dc, null);
    assert.equal(detail.raw_roll, null);
    assert.equal(detail.total_result, null);
  }
}

function assertResultBandShape(band) {
  for (const field of explorationResultBandDebugFields) {
    assert.ok(Object.hasOwn(band, field), `missing result band debug field ${field}`);
  }
  assert.ok(['success', 'partial', 'failure', 'no_check', 'fallback', 'unknown'].includes(band.classification));
  assert.equal(typeof band.selected, 'boolean');
  assert.ok(['available', 'partial', 'not_recorded', 'not_applicable', 'future_supported'].includes(
    band.instrumentation_status
  ));
}

function assertAuditAggregationShape(debug) {
  assert.ok(Array.isArray(debug.environment_modifiers));
  assert.ok(Array.isArray(debug.npc_presence));
  assert.ok(Array.isArray(debug.state_reads));
  assert.ok(Array.isArray(debug.state_writes));
  assert.ok(Array.isArray(debug.knowledge_outputs));
  assert.ok(Array.isArray(debug.history_outputs));
  assert.ok(Array.isArray(debug.transitions));
  assert.ok(Array.isArray(debug.audit_timeline));

  if (debug.environment_modifiers.length > 0) {
    const environment = debug.environment_modifiers[0];
    for (const field of [
      'weather',
      'time_of_day',
      'season',
      'visibility_light',
      'active_environment_modifiers',
      'mechanical_effects',
      'affected_checks',
      'affected_actions',
      'affected_affordances',
      'affected_scene_surface_sections',
      'narrative_flavor_selected',
      'flavor_source_id',
      'flavor_seed',
      'flavor_reuse_cooldown_status',
      'hidden_vs_player_visible_environment_details',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(environment, field), `missing environment field ${field}`);
    }
  }

  if (debug.npc_presence.length > 0) {
    const npc = debug.npc_presence[0];
    for (const field of [
      'npc_id',
      'canonical_name',
      'player_visible_label',
      'identity_visibility',
      'is_present',
      'is_absent',
      'is_known_to_character',
      'is_relevant_absent_npc',
      'authored_schedule_id',
      'current_schedule_block',
      'resolved_presence_status',
      'npc_derived_affordances',
      'affected_scene_surface_sections',
      'affected_free_focus_items',
      'affected_beat_actions',
      'affected_checks',
      'hidden_vs_player_visible_npc_details',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(npc, field), `missing npc field ${field}`);
    }
  }

  if (debug.state_reads.length > 0) {
    const read = debug.state_reads[0];
    for (const field of [
      'read_id',
      'source_type',
      'source_id',
      'scope',
      'key_or_path',
      'expected_value_or_condition',
      'actual_value',
      'read_kind',
      'affects',
      'player_facing',
      'hidden_debug',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(read, field), `missing state read field ${field}`);
    }
  }

  if (debug.state_writes.length > 0) {
    const write = debug.state_writes[0];
    for (const field of [
      'write_id',
      'source_type',
      'source_id',
      'scope',
      'key_or_path',
      'old_value',
      'new_value',
      'write_kind',
      'source_result_band_id',
      'audit_event_id',
      'player_facing',
      'hidden_debug',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(write, field), `missing state write field ${field}`);
    }
  }

  if (debug.knowledge_outputs.length > 0) {
    const output = debug.knowledge_outputs[0];
    for (const field of [
      'output_id',
      'knowledge_id',
      'clue_id',
      'fact_id',
      'rumor_id',
      'output_type',
      'confidence_or_status',
      'source_result_band_id',
      'provenance_event_id',
      'player_facing',
      'hidden_debug',
      'player_visible_summary',
      'gm_debug_summary',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(output, field), `missing knowledge output field ${field}`);
    }
  }

  if (debug.history_outputs.length > 0) {
    const output = debug.history_outputs[0];
    for (const field of [
      'output_id',
      'event_id',
      'event_type',
      'timeline_entry_id',
      'journal_entry_id',
      'result_feed_entry_id',
      'objective_update_id',
      'source_result_band_id',
      'player_facing',
      'hidden_debug',
      'canonical',
      'player_visible_text',
      'gm_debug_text',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(output, field), `missing history output field ${field}`);
    }
  }

  if (debug.transitions.length > 0) {
    const transition = debug.transitions[0];
    for (const field of [
      'transition_id',
      'transition_type',
      'source_scene_id',
      'target_scene_id',
      'target_location_id',
      'target_campaign_state',
      'availability_status',
      'requirements',
      'failed_requirements',
      'state_dependencies',
      'knowledge_dependencies',
      'npc_dependencies',
      'environment_dependencies',
      'player_facing',
      'hidden_debug',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(transition, field), `missing transition field ${field}`);
    }
  }

  if (debug.audit_timeline.length > 0) {
    const event = debug.audit_timeline[0];
    for (const field of [
      'audit_id',
      'timestamp',
      'event_type',
      'source_type',
      'source_id',
      'beat_id',
      'action_window_id',
      'action_id',
      'free_focus_id',
      'result_band_id',
      'scene_id',
      'npc_id',
      'state_scope',
      'output_id',
      'player_facing',
      'hidden_debug',
      'payload_summary',
      'linked_debug_sections',
      'instrumentation_status',
    ]) {
      assert.ok(Object.hasOwn(event, field), `missing audit event field ${field}`);
    }
  }
}

test('Stage 6B.11.1 exploration mechanics debug route requires authentication', async () => {
  const loaded = await request('/api/dev/exploration-mechanics');
  assert.equal(loaded.response.status, 401);
});

test('Stage 6B.11.1 exploration mechanics debug route rejects normal player accounts', async () => {
  const player = await createReadyPlayer('denied');
  const loaded = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(loaded.response.status, 403);
});

test('Stage 6B.11.1 exploration mechanics debug read model returns required GM/dev sections', async () => {
  const player = await createReadyPlayer('allowed');
  await grantDebugCapability(player);

  const loaded = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.status, 'ok');
  assert.ok(loaded.body.exploration_mechanics_debug);

  const debug = loaded.body.exploration_mechanics_debug;
  for (const section of requiredSections) {
    assert.ok(Object.hasOwn(debug, section), `missing debug section ${section}`);
  }

  assert.ok(debug.scene_state.campaign_id);
  assert.ok(debug.scene_state.character_id);
  assert.ok(debug.scene_state.scene_id);
  assert.ok(Array.isArray(debug.free_focus_items));
  assert.ok(Array.isArray(debug.beat_action_options));
  assert.ok(Array.isArray(debug.check_details));
  assert.ok(Array.isArray(debug.result_bands));
  assert.ok(debug.free_focus_items.length + debug.beat_action_options.length >= 1);
  assert.equal(debug.visibility_boundaries.includes_hidden_dc, true);
  assert.equal(debug.visibility_boundaries.includes_debug_mapping, true);
  assert.equal(debug.visibility_boundaries.player_endpoint_exclusion_confirmed, true);
  assert.ok(Array.isArray(debug.validation.hard_errors));
  assert.ok(Array.isArray(debug.validation.warnings));
  assert.ok(Array.isArray(debug.validation.debug_notices));

  const hasHonestInstrumentationStatus =
    debug.check_details.length === 0 ||
    debug.check_details.some((detail) =>
      ['available', 'partial', 'not_recorded', 'not_applicable', 'future_supported'].includes(
        detail.instrumentation_status
      )
    );
  assert.equal(hasHonestInstrumentationStatus, true);
});

test('Stage 6B.11.2 check_details and result_bands use future-compatible debug shapes', async () => {
  const player = await createReadyPlayer('check_shape');
  await grantDebugCapability(player);

  const loaded = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(loaded.response.status, 200);
  const debug = loaded.body.exploration_mechanics_debug;

  assert.ok(debug.check_details.length >= 1);
  assert.ok(debug.result_bands.length >= 1);
  for (const detail of debug.check_details) {
    assertCheckDebugShape(detail);
  }
  for (const band of debug.result_bands) {
    assertResultBandShape(band);
  }

  const noCheckDetail = debug.check_details.find((detail) => detail.requires_check === false);
  if (noCheckDetail) {
    assert.equal(noCheckDetail.check_kind, 'no_check');
    assert.equal(noCheckDetail.dc_player_visible, false);
  }

  const checkedDetail = debug.check_details.find((detail) => detail.requires_check === true && detail.dc !== null);
  if (checkedDetail) {
    assert.equal(checkedDetail.dc_visibility !== undefined, true);
    assert.equal(typeof checkedDetail.dc_player_visible, 'boolean');
  }

  assert.ok(
    debug.validation.debug_notices.some((notice) =>
      ['raw_roll_not_recorded', 'modifier_breakdown_partial', 'result_band_selection_partial'].includes(
        notice.code
      )
    )
  );
});

test('Stage 6B.11.3 debug read model aggregates environment NPC state output transition and audit sections', async () => {
  const player = await createReadyPlayer('audit_shape');
  await grantDebugCapability(player);

  const loaded = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(loaded.response.status, 200);
  const debug = loaded.body.exploration_mechanics_debug;

  assertAuditAggregationShape(debug);
  assert.ok(debug.environment_modifiers.length >= 1, 'Greyvale smoke scene should expose environment context');
  assert.ok(debug.audit_timeline.length >= 1, 'debug read model should include at least one normalized audit event');
  assert.equal(debug.visibility_boundaries.includes_environment_debug, true);
  assert.equal(debug.visibility_boundaries.includes_state_dependencies, true);
  assert.equal(debug.visibility_boundaries.includes_history_output_internals, true);
  assert.equal(debug.visibility_boundaries.includes_audit_timeline, true);
  assert.equal(typeof debug.visibility_boundaries.includes_hidden_transition_requirements, 'boolean');
  assert.ok(
    debug.validation.debug_notices.some((notice) =>
      [
        'environment_flavor_seed_not_recorded',
        'npc_schedule_internals_partial',
        'runtime_state_reads_not_logged',
        'audit_timeline_partial',
        'exploration_mechanics_audit_validation_partial',
      ].includes(notice.code)
    )
  );
});

test('Stage 6B.11.2 resolved Free Focus marks selected result band when persisted', async () => {
  const player = await createReadyPlayer('resolved_focus');
  await grantDebugCapability(player);

  const current = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(current.response.status, 200);
  const closerLook = (current.body.scene_reference?.closer_looks ?? []).find((item) => item.is_available === true);
  assert.ok(closerLook, 'Greyvale smoke scene should expose at least one available Closer Look');

  const resolved = await request('/api/play/free-focus/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      interaction_id: closerLook.interaction_id,
      scene_id: current.body.scene.scene_id,
    }),
  });
  assert.equal(resolved.response.status, 200);

  const loaded = await request('/api/dev/exploration-mechanics', { headers: player.headers });
  assert.equal(loaded.response.status, 200);
  const debug = loaded.body.exploration_mechanics_debug;
  const selectedBand = debug.result_bands.find(
    (band) =>
      band.source_type === 'free_focus' &&
      band.source_id === closerLook.interaction_id &&
      band.selected === true
  );
  assert.ok(selectedBand, 'resolved Free Focus should select one authored result band');
  assert.equal(selectedBand.selection_reason, 'persisted_exploration_interaction_result');
  assert.equal(selectedBand.instrumentation_status, 'available');

  const focusCheck = debug.check_details.find(
    (detail) => detail.source_type === 'free_focus' && detail.source_id === closerLook.interaction_id
  );
  assert.ok(focusCheck);
  assertCheckDebugShape(focusCheck);
});

test('Stage 6B.11.2 validation reports check/result-band mechanics issues without fabricating data', () => {
  const validation = explorationMechanicsPrivate.validation({
    definitions: {
      passive_discoveries: [],
      free_focus: [
        {
          interaction_id: 'bad_focus',
          label: 'Bad focus',
          requires_check: true,
          check: { skill: 'perception' },
          on_success: { narration: 'You notice something.' },
        },
      ],
      beat_actions: [
        {
          interaction_id: 'conflicting_no_check',
          label: 'Conflicting no check',
          requires_check: false,
          dc: 12,
        },
      ],
    },
    sceneInteractions: [],
    checkDetails: [
      {
        requires_check: true,
        raw_roll: null,
        environment_modifiers: [],
      },
    ],
    resultBands: [
      {
        selected: false,
        instrumentation_status: 'partial',
      },
    ],
    stateReads: [
      {
        read_type: 'authored_dependency',
      },
    ],
    debugNotices: [],
  });

  assert.ok(validation.hard_errors.some((issue) => issue.code === 'check_missing_dc'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'free_focus_checked_no_failure_band'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'no_check_conflicting_check_fields'));
  assert.ok(validation.debug_notices.some((issue) => issue.code === 'raw_roll_not_recorded'));
  assert.ok(validation.debug_notices.some((issue) => issue.code === 'state_reads_authored_dependency_only'));
});

test('Stage 6B.11.3 validation reports audit aggregation issues without fabricating unavailable traces', () => {
  const validation = explorationMechanicsPrivate.validation({
    definitions: {
      passive_discoveries: [],
      free_focus: [],
      beat_actions: [],
    },
    sceneInteractions: [],
    checkDetails: [],
    resultBands: [],
    stateReads: [
      {
        read_kind: 'authored_dependency',
        read_type: 'authored_dependency',
      },
    ],
    stateWrites: [
      {
        write_id: 'write_without_target',
        scope: 'scene',
        old_value: null,
        new_value: true,
      },
    ],
    environmentModifiers: [
      {
        active_environment_modifiers: [{ check_type: 'mystery_check' }],
        flavor_seed: 'not_recorded',
      },
    ],
    npcPresence: [
      {
        npc_id: null,
        canonical_name: null,
        player_visible_label: null,
        current_schedule_block: 'not_recorded',
        instrumentation_status: 'partial',
      },
    ],
    knowledgeOutputs: [
      {
        output_id: 'knowledge_without_reference',
        knowledge_id: null,
        clue_id: null,
        fact_id: null,
        rumor_id: null,
        provenance_event_id: null,
      },
    ],
    historyOutputs: [
      {
        output_id: 'history_without_source',
        source_type: 'beat_action',
      },
    ],
    transitions: [
      {
        transition_id: 'missing_target_transition',
        explicit_transition_target_status: 'missing_target',
        availability_status: 'locked',
        requirements: { requires_knowledge: ['hidden_path_known'] },
        failed_requirements: [],
      },
    ],
    auditTimeline: [
      {
        audit_id: 'partial_audit',
        instrumentation_status: 'partial',
      },
    ],
    debugNotices: [],
  });

  assert.ok(validation.hard_errors.some((issue) => issue.code === 'state_write_missing_target'));
  assert.ok(validation.hard_errors.some((issue) => issue.code === 'transition_target_missing'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'environment_modifier_unknown_check_type'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'npc_presence_missing_reference'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'knowledge_output_missing_reference'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'knowledge_output_provenance_not_recorded'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'history_output_source_link_partial'));
  assert.ok(validation.warnings.some((issue) => issue.code === 'transition_requirements_without_failed_explanation'));
  assert.ok(validation.debug_notices.some((issue) => issue.code === 'state_write_old_value_not_recorded'));
  assert.ok(validation.debug_notices.some((issue) => issue.code === 'audit_timeline_partial'));
});

test('Stage 6B.11.1 player current-scene endpoint does not expose mechanics debug internals', async () => {
  const player = await createReadyPlayer('player_boundary');
  await grantDebugCapability(player);

  const playerFacing = await request('/api/play/current-scene?include_mechanics=true', {
    headers: player.headers,
  });
  assert.equal(playerFacing.response.status, 200);
  assertPlayerScenePayloadHasNoMechanicsDebug(playerFacing.body);
});
