import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  RUSK_ENCOUNTER_IDS,
  RUSK_OUTCOME_IDS,
  RUSK_PARTICIPANT_IDS,
  createOrResumeCanonicalRuskCombat,
  evaluateCanonicalRuskCompletion,
  openCanonicalRuskPlayerTurn,
  submitCanonicalRuskPlayerStrike,
} from '../src/engine/combat/canonicalRuskEncounter.js';
import {
  COMBAT_OPERATION_TYPES,
  enterCombatRecoveryNeeded,
} from '../src/engine/combat/combatPersistenceRuntime.js';
import {
  resolveEncounterAftermath,
} from '../src/engine/combat/encounterResolutionRuntime.js';
import {
  COMBAT_INSPECTION_EXACTNESS,
  COMBAT_INSPECTION_STATUS,
  COMBAT_VISIBILITY_DECISION_KINDS,
  COMBAT_VISIBILITY_REASON_CODES,
  assertNoCombatInspectorPlayerLeak,
  authorizeCombatInspectorRequest,
  buildCombatVisibilityDecisionReport,
  inspectCombatTraceAndVisibility,
  projectCombatInspectorForPlayer,
  searchCombatTraceInspection,
  selectCombatInspectorViewer,
  validateCombatInspectorProjectionSafety,
} from '../src/engine/combat/combatTraceVisibilityInspector.js';

const repoRoot = join(import.meta.dirname, '..', '..');

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

function ruskEncounterContent() {
  return readJson('content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json')
    .find((entry) => entry.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER);
}

function ruskDialogueContent() {
  return readJson('content/dialogue/greyvale/rusk-at-the-shrine.json');
}

function ruskHookContent() {
  return readJson('content/campaigns/shadows_grey_road/hooks/grey-road-shrine-combat-resolution.json');
}

function launch(overrides = {}) {
  return createOrResumeCanonicalRuskCombat({
    encounter: ruskEncounterContent(),
    dialogue: ruskDialogueContent(),
    hook: ruskHookContent(),
    campaign_id: 'campaign-greyvale',
    active_character_id: 'character-greyvale',
    character_name: 'Avery',
    ...overrides,
  }).state;
}

function participant(state, id) {
  return state.participants.find((entry) => entry.participant_id === id);
}

function setHp(state, participantId, hp) {
  state.participants = state.participants.map((entry) =>
    entry.participant_id === participantId
      ? { ...entry, current_hit_points: hp, defeated: hp <= 0 }
      : entry
  );
}

function prepareOutcome(outcomeId) {
  const state = launch();
  state.character_progression = {
    character_id: 'character-greyvale',
    level: 1,
    experience_points: 0,
    pending_level_count: 0,
    level_up_available: false,
  };
  if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL) {
    setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 0);
  } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL) {
    setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 0);
    state.last_player_nonlethal_declared = true;
  } else if (outcomeId === RUSK_OUTCOME_IDS.RUSK_SURRENDER) {
    setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 5);
    state.automatic_surrender_intent = { actor_participant_id: RUSK_PARTICIPANT_IDS.RUSK };
  } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_RETREAT) {
    state.player_retreat_declared = true;
    state.spatial.participants = state.spatial.participants.map((entry) =>
      entry.participant_id === RUSK_PARTICIPANT_IDS.PLAYER
        ? { ...entry, current_zone_id: 'grey-road-retreat' }
        : entry
    );
  } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD) {
    setHp(state, RUSK_PARTICIPANT_IDS.PLAYER, 0);
  }
  const completion = evaluateCanonicalRuskCompletion({ state, outcome_id: outcomeId });
  assert.equal(completion.status, 'completion_handoff_ready');
  return state;
}

function developer() {
  return {
    account_id: 'dev-account',
    role: 'developer',
    can_inspect_combat: true,
  };
}

function gm() {
  return {
    account_id: 'gm-account',
    role: 'campaign_gm',
    authorized_campaign_ids: ['campaign-greyvale', 'shadows_grey_road'],
  };
}

test('6D.15 authorization is strict and validates campaign-scoped GM access', () => {
  const state = launch();
  const player = authorizeCombatInspectorRequest({
    state,
    requester: { account_id: 'player-account', role: 'player' },
  });
  assert.equal(player.authorized, false);
  assert.equal(player.status, COMBAT_INSPECTION_STATUS.UNAUTHORIZED);

  const dev = authorizeCombatInspectorRequest({ state, requester: developer() });
  assert.equal(dev.authorized, true);
  assert.equal(dev.role, 'developer');

  const allowedGm = authorizeCombatInspectorRequest({ state, requester: gm() });
  assert.equal(allowedGm.authorized, true);
  assert.equal(allowedGm.role, 'campaign_gm');

  const otherCampaignGm = authorizeCombatInspectorRequest({
    state,
    requester: { account_id: 'gm-other', role: 'campaign_gm', authorized_campaign_ids: ['other-campaign'] },
  });
  assert.equal(otherCampaignGm.authorized, false);
});

test('6D.15 selected viewer must be a combat member and does not impersonate a session', () => {
  const state = launch();
  const viewer = selectCombatInspectorViewer({
    state,
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
  });
  assert.equal(viewer.valid, true);
  assert.equal(viewer.participant_id, RUSK_PARTICIPANT_IDS.PLAYER);
  assert.equal(viewer.validation.view_as_player_only, true);
  assert.equal(viewer.validation.action_submission_allowed, false);

  const invalid = selectCombatInspectorViewer({
    state,
    viewer_participant_id: 'not-in-this-combat',
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.status, COMBAT_INSPECTION_STATUS.INVALID_VIEWER);
});

test('6D.15 current Rusk inspection is read-only, audited, and uses production player projection', () => {
  let state = launch();
  state = openCanonicalRuskPlayerTurn({ state }).state;
  setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 8);
  const strike = submitCanonicalRuskPlayerStrike({
    state,
    idempotency_key: 'inspectable-strike',
    roll_overrides: { attack: 18, damage: [2] },
  });
  state = strike.state;
  const before = JSON.stringify(state);
  const audits = [];

  const inspection = inspectCombatTraceAndVisibility({
    state,
    requester: developer(),
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
    audit_sink: (record) => audits.push(record),
    search_query: 'rusk',
  });

  assert.equal(inspection.status, COMBAT_INSPECTION_STATUS.OK);
  assert.equal(JSON.stringify(state), before, 'inspector must not mutate combat state');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].audit_kind, 'combat_hidden_state_inspection');
  assert.equal(inspection.production_player_projection.projector_id, 'projectCanonicalRuskForPlayer');
  assert.equal(inspection.production_player_projection.projection.participants.find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.RUSK).hit_points, null);
  assert.equal(inspection.gm_dev_projection.authoritative.participants.find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.RUSK).armor_class, 14);
  assert.equal(inspection.projection_comparison.semantic_parity.uses_production_projector, true);
  assert.equal(inspection.search_and_filtering.match_count > 0, true);
  assert.equal(inspection.trace_inspection.calculations.length > 0, true);
});

test('6D.15 visibility decisions explain transformed hit points, redacted AC, and GM-only operations', () => {
  const state = launch();
  const report = buildCombatVisibilityDecisionReport({
    state,
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
  });

  assert.equal(report.status, 'ok');
  assert.ok(report.decisions.some((entry) =>
    entry.participant_id === RUSK_PARTICIPANT_IDS.RUSK &&
    entry.fact_type === 'hit_points' &&
    entry.decision === COMBAT_VISIBILITY_DECISION_KINDS.TRANSFORMED &&
    entry.reason_code === COMBAT_VISIBILITY_REASON_CODES.NARRATIVE_APPROXIMATION
  ));
  assert.ok(report.decisions.some((entry) =>
    entry.participant_id === RUSK_PARTICIPANT_IDS.RUSK &&
    entry.fact_type === 'armor_class' &&
    entry.decision === COMBAT_VISIBILITY_DECISION_KINDS.REDACTED &&
    entry.reason_code === COMBAT_VISIBILITY_REASON_CODES.HIDDEN_STATISTIC
  ));
  assert.ok(report.decisions.some((entry) =>
    entry.fact_type === 'operation_record' &&
    entry.reason_code === COMBAT_VISIBILITY_REASON_CODES.GM_DEV_ONLY
  ));
});

test('6D.15 leak and over-redaction validation catches unsafe or incomplete player projections', () => {
  const state = launch();
  const viewer = selectCombatInspectorViewer({ state, viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER });
  const unsafe = validateCombatInspectorProjectionSafety({
    state,
    viewer,
    player_projection: {
      participants: [
        {
          participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
          hit_points: { current: 20, maximum: 20 },
        },
        {
          participant_id: RUSK_PARTICIPANT_IDS.RUSK,
          hit_points: { current: participant(state, RUSK_PARTICIPANT_IDS.RUSK).current_hit_points },
          armor_class: 14,
        },
      ],
    },
  });
  assert.equal(unsafe.player_projection_safe, false);
  assert.ok(unsafe.hidden_information_leaks.some((entry) => entry.code === 'exact_non_viewer_hit_points_visible'));

  const overRedacted = validateCombatInspectorProjectionSafety({
    state,
    viewer,
    player_projection: {
      participants: [{
        participant_id: RUSK_PARTICIPANT_IDS.RUSK,
        health_band: 'steady',
      }],
    },
  });
  assert.ok(overRedacted.over_redaction_findings.some((entry) => entry.code === 'viewer_participant_missing'));
});

test('6D.15 historical operation inspection uses durable snapshots and does not rerun combat logic', () => {
  let state = launch();
  state = openCanonicalRuskPlayerTurn({ state }).state;
  const strike = submitCanonicalRuskPlayerStrike({
    state,
    idempotency_key: 'history-strike',
    roll_overrides: { attack: 18, damage: [2] },
  });
  state = strike.state;
  const operationId = state.combat_persistence.operation_order.find((id) =>
    state.combat_persistence.operations[id].operation_type === COMBAT_OPERATION_TYPES.PARTICIPANT_ENTRY
  );

  const inspection = inspectCombatTraceAndVisibility({
    state,
    requester: developer(),
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
    historical_point: { operation_id: operationId },
  });

  assert.equal(inspection.status, COMBAT_INSPECTION_STATUS.OK);
  assert.equal(inspection.historical_reconstruction.exactness, COMBAT_INSPECTION_EXACTNESS.HISTORICAL_EXACT);
  assert.equal(inspection.historical_reconstruction.no_reroll, true);
  assert.equal(inspection.historical_reconstruction.no_mutation, true);

  const missing = inspectCombatTraceAndVisibility({
    state,
    requester: developer(),
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
    historical_point: { operation_id: 'missing-op' },
  });
  assert.equal(missing.historical_reconstruction.exactness, COMBAT_INSPECTION_EXACTNESS.UNAVAILABLE);
  assert.match(missing.historical_reconstruction.notes.join(' '), /no_historical_guessing/);
});

test('6D.15 reaction, tactical, Combat Focus, persistence, recovery, and repair boundaries are inspectable', () => {
  const state = launch();
  enterCombatRecoveryNeeded({
    state,
    operation_id: state.combat_persistence.operation_order[0],
    reason: 'stage6d15-test-recovery',
    completed_facts: ['roll_persisted'],
  });

  const inspection = inspectCombatTraceAndVisibility({
    state,
    requester: developer(),
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
  });

  assert.equal(inspection.trace_inspection.persistence_and_recovery.recovery.status, 'found');
  assert.equal(inspection.navigation.repair_links.length, 1);
  assert.equal(inspection.navigation.repair_links[0].repair_requires_stage6d12_authorization, true);
  assert.equal(inspection.navigation.repair_links[0].inspector_applies_repair, false);
  assert.ok(inspection.trace_inspection.reactions_and_continuations);
  assert.ok(inspection.trace_inspection.tactical_decisions);
  assert.ok(inspection.trace_inspection.combat_focus);
});

test('6D.15 search and filtering can navigate operation, event, calculation, and encounter-resolution traces', () => {
  const result = resolveEncounterAftermath({
    state: prepareOutcome(RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL),
    idempotency_key: 'stage6d15-resolution-search',
  });
  const inspection = inspectCombatTraceAndVisibility({
    state: result.state,
    requester: developer(),
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
  });
  const rewardSearch = searchCombatTraceInspection({
    inspection: inspection.trace_inspection,
    query: 'reward',
    kinds: ['encounter_resolution'],
  });
  assert.equal(rewardSearch.match_count, 1);
  assert.equal(inspection.trace_inspection.encounter_resolution_and_rewards.rewards.experience_awarded, 150);
  assert.equal(inspection.production_player_projection.projector_id, 'projectEncounterResolutionForPlayer');
  assert.equal(inspection.diagnostics.player_projection_safety.player_projection_safe, true);
});

test('6D.15 canonical Rusk inspection covers all five aftermath outcomes without player leaks', () => {
  for (const outcomeId of [
    RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
    RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
    RUSK_OUTCOME_IDS.RUSK_SURRENDER,
    RUSK_OUTCOME_IDS.PLAYER_RETREAT,
    RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
  ]) {
    const result = resolveEncounterAftermath({
      state: prepareOutcome(outcomeId),
      idempotency_key: `stage6d15-${outcomeId}`,
    });
    const inspection = inspectCombatTraceAndVisibility({
      state: result.state,
      requester: gm(),
      viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
    });
    assert.equal(inspection.status, COMBAT_INSPECTION_STATUS.OK);
    assert.equal(inspection.trace_inspection.encounter_resolution_and_rewards.handoff.outcome_id, outcomeId);
    assert.equal(inspection.trace_inspection.encounter_resolution_and_rewards.rewards.experience_awarded, 150);
    assert.equal(inspection.production_player_projection.projection.rewards.experience_points_awarded, 150);
    assert.equal(inspection.projection_comparison.player_projection_safe, true);
    assertNoCombatInspectorPlayerLeak(inspection.production_player_projection.projection);
  }
});

test('6D.15 ordinary player projection cannot access inspector data', () => {
  const state = launch();
  const unauthorized = inspectCombatTraceAndVisibility({
    state,
    requester: { account_id: 'ordinary-player', role: 'player' },
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
  });
  assert.equal(unauthorized.status, COMBAT_INSPECTION_STATUS.UNAUTHORIZED);
  assert.equal(JSON.stringify(unauthorized).includes('armor_class'), false);
  assert.equal(JSON.stringify(unauthorized).includes('operation_fingerprint'), false);

  const playerProjection = projectCombatInspectorForPlayer();
  assert.equal(playerProjection.inspector_available_to_player, false);
  assertNoCombatInspectorPlayerLeak(playerProjection);
});
