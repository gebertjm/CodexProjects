import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  RUSK_ENCOUNTER_IDS,
  RUSK_OUTCOME_IDS,
} from '../src/engine/combat/canonicalRuskEncounter.js';
import {
  ENCOUNTER_RESOLUTION_STATUSES,
} from '../src/engine/combat/encounterResolutionRuntime.js';
import {
  RUSK_ACCEPTANCE_BEHAVIOR_IDS,
  RUSK_ACCEPTANCE_SCENARIO_IDS,
  RUSK_ACCEPTANCE_STAGE,
  assertRuskAcceptanceSuitePassed,
  buildRuskAcceptanceEvidenceSummary,
  buildRuskAcceptanceFlutterContractPayloads,
  buildRuskAcceptanceScenarioMatrix,
  listRuskAcceptanceScenarios,
  runRuskAcceptanceScenario,
  runRuskAcceptanceSuite,
  validateRuskAcceptanceContentBaseline,
} from '../src/engine/combat/canonicalRuskAcceptanceSuite.js';

const repoRoot = join(import.meta.dirname, '..', '..');

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

function ruskAcceptanceContent() {
  return {
    encounter: readJson('content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json')
      .find((entry) => entry.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER),
    dialogue: readJson('content/dialogue/greyvale/rusk-at-the-shrine.json'),
    hook: readJson('content/campaigns/shadows_grey_road/hooks/grey-road-shrine-combat-resolution.json'),
  };
}

function runScenario(scenarioId, overrides = {}) {
  return runRuskAcceptanceScenario({
    ...ruskAcceptanceContent(),
    scenario_id: scenarioId,
    run_id: `stage6d18-test:${scenarioId}`,
    ...overrides,
  });
}

function assertResolutionCommon(result, outcomeId) {
  assert.equal(result.status, 'passed');
  assert.equal(result.outcome_id, outcomeId);
  assert.equal(result.completion.status, 'completion_handoff_ready');
  assert.equal(result.completion.outcome_id, outcomeId);
  assert.equal(result.resolution.status, ENCOUNTER_RESOLUTION_STATUSES.COMPLETE);
  assert.equal(result.resolution.aftermath_state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
  assert.equal(result.resolution.aftermath_variant_id, outcomeId);
  assert.equal(result.resolution.xp_awarded, 150);
  assert.equal(result.resolution.ordinary_controls_available, false);
  assert.equal(result.resolution.combat_controls_available, false);
  assert.equal(result.resolution.duplicate_status, ENCOUNTER_RESOLUTION_STATUSES.DUPLICATE_RETURNED);
  assert.equal(result.resolution.rebuilt_review_status, 'built');
  assert.equal(result.resolution.exact_once.selected_final_outcome_count, 1);
  assert.equal(result.resolution.exact_once.aftermath_variant_count, 1);
  assert.equal(result.resolution.exact_once.reward_application_count, 1);
  assert.equal(result.resolution.exact_once.history_output_count, 1);
  assert.equal(result.resolution.exact_once.latest_development_count, 1);
  assert.equal(result.resolution.exact_once.review_count, 1);
  assert.equal(result.resolution.leak_count, 0);
  assert.ok(result.resolution.chronological_log_count > 0);
}

test('6D.18 canonical content baseline confirms active Rusk identities, rewards, and one shared aftermath', () => {
  const baseline = validateRuskAcceptanceContentBaseline(ruskAcceptanceContent());
  assert.equal(baseline.valid, true);
  assert.equal(baseline.canonical_identifiers.encounter_id, RUSK_ENCOUNTER_IDS.ENCOUNTER);
  assert.equal(baseline.canonical_identifiers.shrine_ruins_scene_id, RUSK_ENCOUNTER_IDS.SCENE);
  assert.equal(baseline.canonical_identifiers.dialogue_id, RUSK_ENCOUNTER_IDS.DIALOGUE);
  assert.equal(baseline.canonical_identifiers.rusk_stat_block_id, RUSK_ENCOUNTER_IDS.RUSK_STAT_BLOCK);
  assert.equal(baseline.canonical_identifiers.shared_aftermath_state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
  assert.equal(baseline.canonical_identifiers.reward_definitions.xp, 150);
  assert.deepEqual(
    [...baseline.canonical_identifiers.accepted_outcome_ids].sort(),
    [
      RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
      RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
      RUSK_OUTCOME_IDS.RUSK_SURRENDER,
      RUSK_OUTCOME_IDS.PLAYER_RETREAT,
      RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
    ].sort()
  );
});

test('6D.18 scenario registry and matrix cover every required acceptance behavior', () => {
  const scenarios = listRuskAcceptanceScenarios();
  assert.ok(scenarios.length >= 14);
  assert.ok(scenarios.every((entry) => entry.scenario_id.startsWith('rusk.acceptance.')));
  assert.ok(scenarios.every((entry) => entry.version === '1.0.0'));

  const matrix = buildRuskAcceptanceScenarioMatrix();
  assert.equal(matrix.stage, RUSK_ACCEPTANCE_STAGE);
  assert.equal(matrix.gap_count, 0);
  for (const behaviorId of Object.values(RUSK_ACCEPTANCE_BEHAVIOR_IDS)) {
    const row = matrix.rows.find((entry) => entry.behavior_id === behaviorId);
    assert.equal(row?.covered, true, `${behaviorId} should be covered`);
  }
});

test('6D.18 opening orders cover player-first, Rusk-first, initiative tie, and no-reroll reload', () => {
  const playerFirst = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.OPENING_PLAYER_FIRST);
  assert.equal(playerFirst.status, 'passed');
  assert.equal(playerFirst.initial_current_participant_id, 'pc-1');
  assert.ok(playerFirst.steps.some((entry) => entry.step === 'player_turn_opened'));

  const ruskFirst = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.OPENING_RUSK_FIRST);
  assert.equal(ruskFirst.status, 'passed');
  assert.equal(ruskFirst.initial_current_participant_id, 'rusk-bandit');
  assert.ok(ruskFirst.steps.some((entry) => entry.step === 'rusk_automatic_opening'));

  const tied = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.OPENING_INITIATIVE_TIE);
  assert.equal(tied.status, 'passed');
  assert.equal(tied.initial_current_participant_id, 'pc-1');
  assert.equal(tied.no_initiative_reroll_after_reload, true);
});

test('6D.18 all five canonical Rusk outcomes resolve to shared aftermath and exact-once review state', () => {
  const expectations = [
    [RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_LETHAL, RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL],
    [RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_NONLETHAL, RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL],
    [RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_SURRENDER, RUSK_OUTCOME_IDS.RUSK_SURRENDER],
    [RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_RETREAT, RUSK_OUTCOME_IDS.PLAYER_RETREAT],
    [RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_FAIL_FORWARD, RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD],
  ];

  for (const [scenarioId, outcomeId] of expectations) {
    assertResolutionCommon(runScenario(scenarioId), outcomeId);
  }
});

test('6D.18 outcome-specific assertions preserve surrender, retreat, nonlethal, and fail-forward distinctions', () => {
  const nonlethal = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_NONLETHAL);
  assert.equal(nonlethal.resolution.read_model.review.summary.includes('alive'), true);

  const surrender = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_SURRENDER);
  assert.ok(surrender.steps.some((entry) => entry.step === 'rusk_surrender_intent'));
  assert.equal(surrender.resolution.read_model.review.summary.includes('gives up'), true);

  const retreat = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_RETREAT);
  assert.equal(retreat.steps[0].player_zone_id, 'grey-road-retreat');
  assert.equal(retreat.resolution.read_model.objectives.find((entry) => entry.objective_id === 'resolve-the-threat').status, 'active');

  const failForward = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_FAIL_FORWARD);
  assert.equal(failForward.steps[0].player_hit_points, 0);
  assert.equal(failForward.resolution.read_model.rewards.pending_advancement.level_changed, false);
});

test('6D.18 persistence, response loss, restart reconstruction, and duplicate submit remain safe', () => {
  const result = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.PERSISTENCE_REPLAY);
  assert.equal(result.status, 'passed');
  assert.equal(result.preview_legality, 'available');
  assert.equal(result.preview_mutates_state, false);
  assert.equal(result.first_status, 'resolved');
  assert.equal(result.duplicate_status, 'duplicate_handled');
  assert.equal(result.same_rusk_hit_points_after_duplicate, true);
  assert.ok(result.reconstructed_state_version);
});

test('6D.18 reaction continuation and Combat Focus use live Rusk state without hidden-data exposure', () => {
  const reaction = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.REACTION_CONTINUATION);
  assert.equal(reaction.status, 'passed');
  assert.equal(reaction.next_decision_kind, 'player_reaction_required');
  assert.equal(reaction.active_reaction_window_id_present, true);

  const focus = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.COMBAT_FOCUS);
  assert.equal(focus.status, 'passed');
  assert.equal(focus.answer_status, 'answered');
});

test('6D.18 inspector parity and recovery freeze remain acceptance-covered', () => {
  const inspector = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.VISIBILITY_INSPECTOR);
  assert.equal(inspector.status, 'passed');
  assert.equal(inspector.inspection_status, 'ok');
  assert.equal(inspector.uses_production_projector, true);
  assert.equal(inspector.leak_count, 0);

  const recovery = runScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.RECOVERY);
  assert.equal(recovery.status, 'passed');
  assert.equal(recovery.recovery_status, 'recovery_needed');
  assert.equal(recovery.retry_safe, false);
  assert.equal(recovery.ordinary_controls_removed, true);
});

test('6D.18 Flutter contract payloads cover all canonical outcomes with player-safe review models', () => {
  const payloads = buildRuskAcceptanceFlutterContractPayloads(ruskAcceptanceContent());
  assert.equal(payloads.length, 5);
  for (const payload of payloads) {
    assert.equal(payload.aftermath.state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
    assert.equal(payload.combat_controls_available, false);
    assert.equal(payload.ordinary_controls_available, false);
    assert.equal(payload.rewards.experience_points_awarded, 150);
    assert.ok(payload.review.summary);
  }
});

test('6D.18 full canonical Rusk acceptance command runs all registered backend scenarios', () => {
  const suite = runRuskAcceptanceSuite(ruskAcceptanceContent());
  assert.equal(suite.status, 'passed');
  assert.equal(suite.scenario_count, listRuskAcceptanceScenarios().length);
  assertRuskAcceptanceSuitePassed(suite);

  const evidence = buildRuskAcceptanceEvidenceSummary(ruskAcceptanceContent());
  assert.equal(evidence.baseline.valid, true);
  assert.equal(evidence.matrix.gap_count, 0);
});
