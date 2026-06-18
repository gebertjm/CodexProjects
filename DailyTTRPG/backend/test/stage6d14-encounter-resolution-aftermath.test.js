import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  RUSK_ENCOUNTER_IDS,
  RUSK_OUTCOME_IDS,
  RUSK_PARTICIPANT_IDS,
  RUSK_ZONE_IDS,
  createOrResumeCanonicalRuskCombat,
  evaluateCanonicalRuskCompletion,
} from '../src/engine/combat/canonicalRuskEncounter.js';
import {
  CONDITION_IDS,
  CONDITION_PERSISTENCE_POLICIES,
  createConditionInstance,
  startConcentration,
} from '../src/engine/combat/conditionStateLifecycle.js';
import {
  ENCOUNTER_RESOLUTION_NEXT_BEAT_KINDS,
  ENCOUNTER_RESOLUTION_STATUSES,
  assertNoEncounterResolutionPlayerHiddenData,
  buildCanonicalRuskAftermathDefinitions,
  buildEncounterResolutionDefinition,
  buildEncounterResolutionGmDevTrace,
  detectPendingAdvancement,
  enterEncounterResolutionPhase,
  projectEncounterResolutionForPlayer,
  rebuildEncounterResolutionReview,
  rejectNormalCombatInputDuringResolution,
  resolveEncounterAftermath,
  selectEncounterOutcome,
  verifyMandatoryCombatCompletion,
} from '../src/engine/combat/encounterResolutionRuntime.js';

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

function setParticipant(state, id, patch) {
  state.participants = state.participants.map((entry) =>
    entry.participant_id === id ? { ...entry, ...patch } : entry
  );
  return participant(state, id);
}

function putPlayerAtRetreat(state) {
  state.spatial.participants = state.spatial.participants.map((entry) =>
    entry.participant_id === RUSK_PARTICIPANT_IDS.PLAYER
      ? { ...entry, current_zone_id: RUSK_ZONE_IDS.RETREAT_ROAD }
      : entry
  );
  state.player_retreat_declared = true;
}

function prepareOutcome(outcomeId, overrides = {}) {
  const state = launch(overrides.launch ?? {});
  state.character_progression = {
    character_id: 'character-greyvale',
    level: overrides.level ?? 1,
    experience_points: overrides.experience_points ?? 0,
    pending_level_count: overrides.pending_level_count ?? 0,
    level_up_available: false,
  };
  if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL) {
    setParticipant(state, RUSK_PARTICIPANT_IDS.RUSK, { current_hit_points: 0, defeated: true });
  } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL) {
    setParticipant(state, RUSK_PARTICIPANT_IDS.RUSK, { current_hit_points: 0, defeated: true });
    state.last_player_nonlethal_declared = true;
  } else if (outcomeId === RUSK_OUTCOME_IDS.RUSK_SURRENDER) {
    setParticipant(state, RUSK_PARTICIPANT_IDS.RUSK, { current_hit_points: 5, defeated: false });
    state.automatic_surrender_intent = { actor_participant_id: RUSK_PARTICIPANT_IDS.RUSK };
  } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_RETREAT) {
    putPlayerAtRetreat(state);
  } else if (outcomeId === RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD) {
    setParticipant(state, RUSK_PARTICIPANT_IDS.PLAYER, { current_hit_points: 0, defeated: true });
  }
  const completion = evaluateCanonicalRuskCompletion({ state, outcome_id: outcomeId });
  assert.equal(completion.status, 'completion_handoff_ready');
  return state;
}

function resolve(outcomeId, overrides = {}) {
  const state = prepareOutcome(outcomeId, overrides);
  return resolveEncounterAftermath({ state, idempotency_key: `resolve-${outcomeId}` });
}

function assertReviewSafe(result) {
  assertNoEncounterResolutionPlayerHiddenData(result.read_model);
  const serialized = JSON.stringify(result.read_model);
  for (const forbidden of [
    'combat_pending',
    'future_supported',
    'armor_class',
    'control_mode',
    'idempotency_key',
    'checkpoint',
    'gm_dev',
    'trace',
    'hidden',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `player review leaked ${forbidden}`);
  }
}

test('6D.14 defines one shared Rusk Shrine Ruins aftermath with five canonical variants', () => {
  const definition = buildCanonicalRuskAftermathDefinitions({ encounter: ruskEncounterContent() });
  assert.equal(definition.encounter_id, RUSK_ENCOUNTER_IDS.ENCOUNTER);
  assert.equal(definition.shared_aftermath_state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
  assert.equal(definition.reward_policy.xp, 150);
  assert.equal(definition.reward_policy.equivalent_across_paths, true);
  assert.deepEqual(
    definition.variants.map((entry) => entry.outcome_id).sort(),
    [
      RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
      RUSK_OUTCOME_IDS.PLAYER_RETREAT,
      RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
      RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
      RUSK_OUTCOME_IDS.RUSK_SURRENDER,
    ].sort()
  );
  assert.ok(definition.variants.every((entry) => entry.aftermath_state_id === RUSK_ENCOUNTER_IDS.AFTERMATH_STATE));
  assert.ok(definition.variants.every((entry) => entry.reward_value.xp === 150));

  const generic = buildEncounterResolutionDefinition({
    handoff: {
      encounter_id: RUSK_ENCOUNTER_IDS.ENCOUNTER,
      shared_aftermath_state_id: RUSK_ENCOUNTER_IDS.AFTERMATH_STATE,
    },
    encounter: ruskEncounterContent(),
  });
  assert.equal(generic.contract_stage, '6D.14');
});

test('6D.14 validates handoff, locks ordinary combat input, and waits for mandatory reactions', () => {
  const state = prepareOutcome(RUSK_OUTCOME_IDS.PLAYER_RETREAT);
  state.active_reaction_window_id = 'reaction-window-1';
  state.reaction_windows = [{ reaction_window_id: 'reaction-window-1', status: 'open' }];

  const mandatory = verifyMandatoryCombatCompletion({ state });
  assert.equal(mandatory.ready, false);
  assert.equal(mandatory.status, ENCOUNTER_RESOLUTION_STATUSES.WAITING_FOR_MANDATORY_COMPLETION);

  const phase = enterEncounterResolutionPhase({ state });
  assert.equal(phase.status, ENCOUNTER_RESOLUTION_STATUSES.WAITING_FOR_MANDATORY_COMPLETION);
  assert.equal(state.normal_combat_controls_locked, true);

  const rejected = rejectNormalCombatInputDuringResolution({ state });
  assert.equal(rejected.status, ENCOUNTER_RESOLUTION_STATUSES.UNAVAILABLE);
  assert.equal(rejected.ordinary_controls_available, false);
  assertReviewSafe(rejected);
});

test('6D.14 lethal Rusk defeat finalizes participants, outputs, rewards, and review exactly once', () => {
  const result = resolve(RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL);
  assert.equal(result.status, ENCOUNTER_RESOLUTION_STATUSES.COMPLETE);
  assert.equal(result.state.combat.status, 'resolved');
  assert.equal(result.state.encounter_resolution.next_beat.next_beat_kind, ENCOUNTER_RESOLUTION_NEXT_BEAT_KINDS.AFTERMATH_REVIEW);
  assert.equal(result.state.encounter_resolution.normal_combat_controls_locked, true);
  assert.equal(participant(result.state, RUSK_PARTICIPANT_IDS.RUSK).dead, true);
  assert.equal(result.state.character_progression.experience_points, 150);
  assert.equal(result.state.character_progression.level, 1);
  assert.equal(result.state.objective_outputs.find((entry) => entry.objective_id === 'resolve-the-threat').status, 'completed');
  assert.equal(result.state.knowledge_outputs.some((entry) => entry.knowledge_id === 'rusk_surface_threat_ended_lethal'), true);
  assert.equal(result.state.latest_development_output.title, 'Shrine Ruins Aftermath');
  assert.equal(result.read_model.aftermath.state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
  assert.equal(result.read_model.ordinary_controls_available, false);
  assert.equal(result.read_model.rewards.experience_points_awarded, 150);
  assert.equal(result.read_model.review.chronological_log.length > 0, true);
  assertReviewSafe(result);

  const duplicate = resolveEncounterAftermath({ state: result.state, idempotency_key: 'resolve-again' });
  assert.equal(duplicate.status, ENCOUNTER_RESOLUTION_STATUSES.DUPLICATE_RETURNED);
  assert.equal(result.state.character_progression.experience_points, 150);
  assert.equal(result.state.history_outputs.length, 1);
  assert.equal(result.state.archive_search_outputs.length, 1);
});

test('6D.14 nonlethal Rusk subdual leaves Rusk alive, stable, and review-only', () => {
  const result = resolve(RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL);
  const rusk = participant(result.state, RUSK_PARTICIPANT_IDS.RUSK);
  assert.equal(result.status, ENCOUNTER_RESOLUTION_STATUSES.COMPLETE);
  assert.equal(rusk.current_hit_points, 0);
  assert.equal(rusk.dead, false);
  assert.equal(rusk.stable, true);
  assert.equal(rusk.conditions.some((entry) => entry.condition_type === CONDITION_IDS.STABLE), true);
  assert.equal(result.state.knowledge_outputs.some((entry) => entry.knowledge_id === 'rusk_surface_threat_ended_nonlethal'), true);
  assertReviewSafe(result);
});

test('6D.14 Rusk surrender updates NPC state without treating Rusk as dead', () => {
  const result = resolve(RUSK_OUTCOME_IDS.RUSK_SURRENDER);
  const rusk = participant(result.state, RUSK_PARTICIPANT_IDS.RUSK);
  assert.equal(result.status, ENCOUNTER_RESOLUTION_STATUSES.COMPLETE);
  assert.equal(rusk.surrendered, true);
  assert.equal(rusk.dead, undefined);
  assert.equal(rusk.defeated, false);
  assert.equal(result.state.world_state_flags.surface_threat_resolved, true);
  assert.equal(result.state.npc_state_updates.some((entry) => entry.npc_id === RUSK_PARTICIPANT_IDS.RUSK), true);
  assertReviewSafe(result);
});

test('6D.14 player retreat uses the shared aftermath but keeps surface threat unresolved', () => {
  const result = resolve(RUSK_OUTCOME_IDS.PLAYER_RETREAT);
  assert.equal(result.status, ENCOUNTER_RESOLUTION_STATUSES.COMPLETE);
  assert.equal(result.state.adventure_state.current_state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
  assert.equal(result.state.adventure_state.current_variant_id, RUSK_OUTCOME_IDS.PLAYER_RETREAT);
  assert.equal(result.state.world_state_flags.surface_threat_resolved, false);
  assert.equal(result.state.objective_outputs.find((entry) => entry.objective_id === 'resolve-the-threat').status, 'active');
  assert.equal(result.state.character_progression.experience_points, 150);
  assertReviewSafe(result);
});

test('6D.14 fail-forward player defeat records safe recovery, rewards, and no level application', () => {
  const result = resolve(RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD, { experience_points: 250 });
  const player = participant(result.state, RUSK_PARTICIPANT_IDS.PLAYER);
  assert.equal(result.status, ENCOUNTER_RESOLUTION_STATUSES.COMPLETE);
  assert.equal(player.protected_fail_forward, true);
  assert.equal(player.death_save_state.stable, true);
  assert.equal(result.state.character_progression.experience_points, 400);
  assert.equal(result.state.character_progression.level, 1);
  assert.equal(result.state.character_progression.level_up_available, true);
  assert.equal(result.read_model.rewards.pending_advancement.available, true);
  assert.equal(result.read_model.rewards.pending_advancement.target_level, 2);
  assert.equal(result.read_model.rewards.pending_advancement.level_changed, false);
  assert.equal(result.state.world_state_flags.surface_threat_resolved, false);
  assertReviewSafe(result);
});

test('6D.14 combat-end persistence expires combat-scoped effects and carries persistent conditions/concentration', () => {
  const state = prepareOutcome(RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL);
  state.conditions = [
    createConditionInstance({
      condition_type: CONDITION_IDS.POISONED,
      target_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
      condition_instance_id: 'combat-poison',
      persistence_policy: CONDITION_PERSISTENCE_POLICIES.COMBAT_SCOPED,
    }),
    createConditionInstance({
      condition_type: CONDITION_IDS.BLINDED,
      target_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
      condition_instance_id: 'persistent-blind',
      persistence_policy: CONDITION_PERSISTENCE_POLICIES.PERSISTENT,
      duration: { duration_type: 'rounds', remaining_rounds: 2 },
    }),
  ];
  state.concentration = startConcentration({
    participant: participant(state, RUSK_PARTICIPANT_IDS.PLAYER),
    concentration_id: 'carry-focus',
    duration: { duration_type: 'rounds', remaining_rounds: 2 },
  }).concentration;

  const result = resolveEncounterAftermath({ state });
  assert.equal(result.status, ENCOUNTER_RESOLUTION_STATUSES.COMPLETE);
  assert.equal(result.state.expired_combat_conditions.length, 1);
  assert.equal(
    result.state.conditions.some((entry) => entry.condition_instance_id === 'persistent-blind' && entry.duration.remaining_seconds === 12),
    true
  );
  assert.equal(result.state.adventure_concentration.carry_forward, true);
});

test('6D.14 reload and review reconstruction keep endpoint state stable and safe', () => {
  const result = resolve(RUSK_OUTCOME_IDS.RUSK_SURRENDER);
  const reloaded = JSON.parse(JSON.stringify(result.state));
  const rebuilt = rebuildEncounterResolutionReview({ state: reloaded });
  assert.equal(rebuilt.status, 'built');
  assert.equal(rebuilt.review.summary, result.state.post_combat_review.summary);

  const projected = projectEncounterResolutionForPlayer({ state: reloaded });
  assert.equal(projected.aftermath.state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
  assert.equal(projected.combat_controls_available, false);
  assertNoEncounterResolutionPlayerHiddenData(projected);

  const duplicate = resolveEncounterAftermath({ state: reloaded });
  assert.equal(duplicate.status, ENCOUNTER_RESOLUTION_STATUSES.DUPLICATE_RETURNED);
  assert.equal(reloaded.character_progression.experience_points, 150);
});

test('6D.14 mismatched terminal state enters recovery without applying rewards or aftermath', () => {
  const state = launch();
  const completion = evaluateCanonicalRuskCompletion({
    state,
    outcome_id: RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
  });
  assert.equal(completion.status, 'completion_handoff_ready');

  const selected = selectEncounterOutcome({ state });
  assert.equal(selected.status, ENCOUNTER_RESOLUTION_STATUSES.RECOVERY_NEEDED);

  const result = resolveEncounterAftermath({ state });
  assert.equal(result.status, ENCOUNTER_RESOLUTION_STATUSES.RECOVERY_NEEDED);
  assert.equal(result.state.character_progression, undefined);
  assert.equal(result.state.adventure_state, undefined);
  assert.equal(result.read_model.ordinary_controls_available, false);
  assertReviewSafe(result);
});

test('6D.14 GM/dev trace retains handoff and operation evidence while player projection strips it', () => {
  const result = resolve(RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL);
  const trace = buildEncounterResolutionGmDevTrace({ state: result.state, phase: 'test' });
  assert.equal(trace.contract_stage, '6D.14');
  assert.equal(trace.handoff.outcome_id, RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL);
  assert.equal(trace.operation_order.length >= 2, true);
  assert.equal(trace.outputs.knowledge.some((entry) => entry.knowledge_id === 'rusk_surface_threat_ended_lethal'), true);
  assert.equal(JSON.stringify(trace).includes('checkpoint'), true);

  const playerProjection = projectEncounterResolutionForPlayer({ state: result.state });
  assert.equal(JSON.stringify(playerProjection).includes('checkpoint'), false);
  assert.equal(JSON.stringify(playerProjection).includes('gm_dev'), false);
  assertNoEncounterResolutionPlayerHiddenData(playerProjection);
});

test('6D.14 pending advancement detection never applies a level choice', () => {
  const pending = detectPendingAdvancement({
    character_progression: {
      level: 1,
      experience_points: 300,
      pending_level_count: 0,
    },
  });
  assert.equal(pending.level_up_available, true);
  assert.equal(pending.target_level, 2);
  assert.equal(pending.level_changed, false);
});
