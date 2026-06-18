import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMBAT_CHECKPOINT_KINDS,
  COMBAT_MIGRATION_DECISION_STATUSES,
  COMBAT_OPERATION_STATUSES,
  COMBAT_OPERATION_TYPES,
  COMBAT_RECOVERY_CLASSIFICATIONS,
  COMBAT_REFRESH_SAFETY,
  COMBAT_REPAIR_KINDS,
  COMBAT_RETRY_SAFETY,
  appendCombatEvent,
  applyCombatRecoveryRepair,
  assertNoCombatPersistencePlayerHiddenData,
  beginDurableCombatOperation,
  classifyIncompleteCombatOperation,
  completeDurableCombatOperation,
  ensureCombatPersistenceState,
  enterCombatRecoveryNeeded,
  evaluateCombatMigrationEvidence,
  getAuthoritativeCombatStateVersion,
  getCombatPersistenceInventory,
  inspectCombatRecoveryState,
  rebuildCombatPersistenceReadModels,
  reconstructCombatAggregate,
  reconstructLastConfirmedCombatState,
  recordCombatOperationCheckpoint,
  resumeDurableCombatOperation,
  runDurableCombatOperation,
  validateCombatPersistenceInvariants,
} from '../src/engine/combat/combatPersistenceRuntime.js';
import {
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_EFFECT_TYPES,
  COMBAT_TARGET_POLICIES,
} from '../src/engine/combat/actionEffectResourceFramework.js';
import {
  DND5E_2014_RULESET,
} from '../src/engine/combat/rulesResolution.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function participant(overrides = {}) {
  const id = overrides.participant_id ?? 'pc-1';
  return {
    participant_id: id,
    display_name: overrides.display_name ?? id,
    faction: overrides.faction ?? 'player',
    control_mode: overrides.control_mode ?? 'player',
    player_controlled: overrides.player_controlled ?? overrides.faction === 'player',
    is_player_character: overrides.is_player_character ?? overrides.faction === 'player',
    current_zone_id: overrides.current_zone_id ?? 'road',
    speed: overrides.speed ?? 30,
    current_hit_points: overrides.current_hit_points ?? 20,
    max_hit_points: overrides.max_hit_points ?? 20,
    temporary_hit_points: overrides.temporary_hit_points ?? 0,
    armor_class: overrides.armor_class ?? 13,
    active: overrides.active ?? true,
    defeated: overrides.defeated ?? false,
    initiative_position: overrides.initiative_position,
    ...overrides,
  };
}

function action(actionId, timingCategory = COMBAT_ACTION_TIMING_CATEGORIES.ACTION, overrides = {}) {
  return {
    action_id: actionId,
    player_label: overrides.player_label ?? actionId.replace(/-/g, ' '),
    ruleset: DND5E_2014_RULESET,
    timing_category: timingCategory,
    target_policy: overrides.target_policy ?? COMBAT_TARGET_POLICIES.NO_TARGET,
    action_level_costs: overrides.action_level_costs ?? [],
    effect_steps: overrides.effect_steps ?? [
      {
        step_id: 'marker',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER,
        player_summary: `${overrides.player_label ?? actionId} resolves.`,
      },
    ],
  };
}

function baseState(overrides = {}) {
  return ensureCombatPersistenceState({
    combat: {
      combat_id: 'combat-6d12',
      encounter_id: 'encounter-6d12',
      encounter_title: 'Persistence Test Encounter',
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 1,
      current_participant_id: 'pc-1',
      current_state_version: 'combat-v1',
    },
    current_state_version: 'combat-v1',
    participants: [
      participant({ participant_id: 'pc-1', display_name: 'Avery', initiative_position: 1 }),
      participant({
        participant_id: 'enemy-1',
        display_name: 'Training Bandit',
        faction: 'enemy',
        control_mode: 'ai',
        player_controlled: false,
        is_player_character: false,
        current_hit_points: 12,
        max_hit_points: 12,
        armor_class: 12,
        initiative_position: 2,
      }),
    ],
    parent_turn: {
      parent_turn_id: 'turn-1',
      combat_id: 'combat-6d12',
      actor_participant_id: 'pc-1',
      status: 'open',
      round_number: 1,
      initiative_position: 1,
      action_window_id: 'window-1',
      current_state_version: 'combat-v1',
      action_spent: false,
      bonus_action_spent: false,
      object_interaction_spent: false,
      reaction_available: true,
      movement_base: 30,
      movement_spent: 0,
      movement_remaining: 30,
      sub_resolutions: [],
    },
    action_window: { action_window_id: 'window-1', status: 'open' },
    actions: [
      action('test-strike', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, { target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY }),
      action('quick-step', COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION),
      action('open-latch', COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION),
    ],
    resources: [],
    conditions: [],
    spatial: {
      zones: [
        { zone_id: 'road', label: 'Road' },
        { zone_id: 'ditch', label: 'Ditch' },
      ],
      participant_positions: {
        'pc-1': { participant_id: 'pc-1', current_zone_id: 'road', relationships: [] },
        'enemy-1': { participant_id: 'enemy-1', current_zone_id: 'road', relationships: [] },
      },
      transitions: [
        { transition_id: 'road-to-ditch', from_zone_id: 'road', to_zone_id: 'ditch', distance_feet: 10, movement_cost: 10 },
      ],
    },
    ...overrides,
  });
}

function actionRequest(overrides = {}) {
  return {
    operation_type: COMBAT_OPERATION_TYPES.PLAYER_ACTION,
    parent_turn_id: 'turn-1',
    actor_participant_id: 'pc-1',
    action_id: 'test-strike',
    target_id: 'enemy-1',
    source_state_version: overrides.source_state_version ?? 'combat-v1',
    idempotency_key: overrides.idempotency_key ?? 'strike-key-1',
    ...overrides,
  };
}

test('Stage 6D.12 initializes a serializable persistence ledger and reconstructs after reload', () => {
  const state = baseState();

  assert.equal(getAuthoritativeCombatStateVersion(state), 'combat-v1');
  assert.deepEqual(state.combat_persistence.operation_order, []);

  appendCombatEvent({
    state,
    event_type: 'combat_test_event',
    player_safe_summary: 'A safe event was recorded.',
  });

  const reloaded = ensureCombatPersistenceState(clone(state));
  const aggregate = reconstructCombatAggregate({ state: reloaded });
  const inventory = getCombatPersistenceInventory({ state: reloaded });

  assert.equal(aggregate.combat_id, 'combat-6d12');
  assert.equal(aggregate.latest_authoritative_event.player_safe_summary, 'A safe event was recorded.');
  assert.ok(inventory.directly_serialized.includes('combat_persistence.operations'));
  assert.ok(inventory.response_scoped_risks.includes('durable_cross_process_storage_depends_on caller persisting serialized aggregate'));
});

test('resolved operations replay exact duplicates after state-version advancement without rerolling or remutating', () => {
  const state = baseState();
  const claimed = beginDurableCombatOperation({ state, ...actionRequest() });

  recordCombatOperationCheckpoint({
    state,
    operation_id: claimed.operation_id,
    checkpoint_kind: COMBAT_CHECKPOINT_KINDS.ROLL_PERSISTED,
    detail: { roll_id: 'roll-strike-1', total: 17, origin: 'deterministic_test' },
  });
  recordCombatOperationCheckpoint({
    state,
    operation_id: claimed.operation_id,
    checkpoint_kind: COMBAT_CHECKPOINT_KINDS.COST_COMMITTED,
    detail: { resource: 'action', spent: 1 },
  });
  completeDurableCombatOperation({
    state,
    operation_id: claimed.operation_id,
    result: {
      player_result: { result: 'You strike once.', progress: ['The attack is resolved.'] },
    },
    player_safe_summary: 'The attack resolved once.',
  });

  assert.equal(getAuthoritativeCombatStateVersion(state), 'combat-v2');
  const reloaded = ensureCombatPersistenceState(clone(state));
  const duplicate = beginDurableCombatOperation({ state: reloaded, ...actionRequest() });

  assert.equal(duplicate.status, COMBAT_OPERATION_STATUSES.DUPLICATE_RETURNED);
  assert.equal(duplicate.duplicate_of_operation_id, claimed.operation_id);
  assert.equal(reloaded.combat_persistence.operation_order.length, 1);
  assert.equal(reloaded.combat_persistence.operations[claimed.operation_id].committed_rolls.length, 1);
  assert.equal(reloaded.combat_persistence.operations[claimed.operation_id].committed_costs.length, 1);
});

test('same idempotency key with different operation is rejected without mutation', () => {
  const state = baseState();
  const first = beginDurableCombatOperation({ state, ...actionRequest() });
  assert.equal(first.status, COMBAT_OPERATION_STATUSES.CLAIMED);

  const conflict = beginDurableCombatOperation({
    state,
    ...actionRequest({
      action_id: 'different-strike',
      idempotency_key: 'strike-key-1',
    }),
  });

  assert.equal(conflict.status, COMBAT_OPERATION_STATUSES.CONFLICTING_IDEMPOTENCY_REJECTED);
  assert.equal(conflict.committed, false);
  assert.equal(state.combat_persistence.operation_order.length, 1);
  assert.equal(state.combat_persistence.operations[first.operation_id].checkpoints.length, 0);
});

test('stale source-state versions reject new operations but do not block exact duplicates', () => {
  const state = baseState();
  const first = runDurableCombatOperation({
    state,
    ...actionRequest(),
    execute: () => ({ player_result: { result: 'Resolved.' } }),
  });

  assert.equal(first.status, COMBAT_OPERATION_STATUSES.RESOLVED);

  const staleNew = beginDurableCombatOperation({
    state,
    ...actionRequest({ idempotency_key: 'new-stale-key', action_id: 'test-strike' }),
  });
  const exactDuplicate = beginDurableCombatOperation({ state, ...actionRequest() });

  assert.equal(staleNew.status, COMBAT_OPERATION_STATUSES.STALE_REJECTED);
  assert.equal(staleNew.committed, false);
  assert.equal(exactDuplicate.status, COMBAT_OPERATION_STATUSES.DUPLICATE_RETURNED);
});

test('failed-before-authority operations release the idempotency claim and remain safe to retry', () => {
  const state = baseState();
  const failed = runDurableCombatOperation({
    state,
    ...actionRequest({ idempotency_key: 'precommit-fail' }),
    execute: () => {
      throw new Error('validation failed before any authoritative fact');
    },
  });

  assert.equal(failed.status, COMBAT_OPERATION_STATUSES.FAILED_BEFORE_COMMIT);
  assert.equal(failed.committed, false);
  assert.equal(failed.retry_safe, COMBAT_RETRY_SAFETY.SAFE_RETRY);

  const retry = beginDurableCombatOperation({
    state,
    ...actionRequest({ idempotency_key: 'precommit-fail' }),
  });

  assert.equal(retry.status, COMBAT_OPERATION_STATUSES.CLAIMED);
  assert.equal(retry.operation_id.endsWith(':2'), true);
});

test('checkpointed interruption can resume after reload without repeating confirmed rolls', () => {
  const state = baseState();
  const paused = runDurableCombatOperation({
    state,
    ...actionRequest({ idempotency_key: 'resume-key' }),
    execute: ({ recordCheckpoint }) => {
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.ROLL_PERSISTED,
        detail: { roll_id: 'roll-resume-1', total: 14 },
      });
      const error = new Error('process interrupted after roll');
      error.pending_work = ['apply_damage'];
      throw error;
    },
  });

  assert.equal(paused.status, COMBAT_OPERATION_STATUSES.PAUSED);
  const reloaded = ensureCombatPersistenceState(clone(state));
  const operation = reloaded.combat_persistence.operations[paused.operation.operation_id];
  assert.equal(classifyIncompleteCombatOperation({ operation }).recovery_classification, COMBAT_RECOVERY_CLASSIFICATIONS.RESUMABLE_FROM_CHECKPOINT);

  const resumed = resumeDurableCombatOperation({
    state: reloaded,
    operation_id: operation.operation_id,
    resume: ({ recordCheckpoint }) => {
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.EFFECT_STEP_COMPLETED,
        detail: { effect_step_id: 'damage', target_id: 'enemy-1' },
      });
      return { player_result: { result: 'The saved attack finishes.' } };
    },
  });

  assert.equal(resumed.status, COMBAT_OPERATION_STATUSES.RESOLVED);
  assert.equal(reloaded.combat_persistence.operations[operation.operation_id].committed_rolls.length, 1);
});

test('ambiguous checkpointed failure enters recovery-needed and removes ordinary player controls', () => {
  const state = baseState();
  const recovery = runDurableCombatOperation({
    state,
    ...actionRequest({ idempotency_key: 'ambiguous-key' }),
    execute: ({ recordCheckpoint }) => {
      recordCheckpoint({
        checkpoint_kind: COMBAT_CHECKPOINT_KINDS.COST_COMMITTED,
        detail: { resource: 'action', spent: 1 },
      });
      const error = new Error('connection lost after action cost');
      error.ambiguous_commit = true;
      throw error;
    },
  });

  assert.equal(recovery.status, COMBAT_OPERATION_STATUSES.RECOVERY_NEEDED);
  assert.equal(state.recovery_needed, true);
  assert.equal(state.parent_turn.status, 'recovery_needed');
  assert.equal(recovery.read_model.ordinary_controls_available, false);
  assert.equal(recovery.refresh_safe, COMBAT_REFRESH_SAFETY.LAST_CONFIRMED_STATE_ONLY);
  assertNoCombatPersistencePlayerHiddenData(recovery.read_model);
});

test('operation-specific checkpoints for reactions, automatic turns, targets, participants, factions, focus, and completion survive reload', () => {
  const state = baseState();
  const operationTypes = [
    [COMBAT_OPERATION_TYPES.PLAYER_MOVEMENT, COMBAT_CHECKPOINT_KINDS.MOVEMENT_SEGMENT_COMMITTED],
    [COMBAT_OPERATION_TYPES.PLAYER_REACTION, COMBAT_CHECKPOINT_KINDS.REACTION_WINDOW_PERSISTED],
    [COMBAT_OPERATION_TYPES.AUTOMATIC_OPERATION, COMBAT_CHECKPOINT_KINDS.AUTOMATIC_DECISION_PERSISTED],
    [COMBAT_OPERATION_TYPES.MULTI_TARGET_ACTION, COMBAT_CHECKPOINT_KINDS.PER_TARGET_RESULT_PERSISTED],
    [COMBAT_OPERATION_TYPES.PARTICIPANT_ENTRY, COMBAT_CHECKPOINT_KINDS.PARTICIPANT_EVENT_PERSISTED],
    [COMBAT_OPERATION_TYPES.FACTION_CHANGE, COMBAT_CHECKPOINT_KINDS.FACTION_EVENT_PERSISTED],
    [COMBAT_OPERATION_TYPES.COMBAT_FOCUS_ANSWER, COMBAT_CHECKPOINT_KINDS.COMBAT_FOCUS_ANSWER_PERSISTED],
    [COMBAT_OPERATION_TYPES.ENCOUNTER_COMPLETION_HANDOFF, COMBAT_CHECKPOINT_KINDS.COMPLETION_HANDOFF_PERSISTED],
  ];

  for (const [operationType, checkpointKind] of operationTypes) {
    const claimed = beginDurableCombatOperation({
      state,
      operation_type: operationType,
      parent_turn_id: 'turn-1',
      actor_participant_id: 'pc-1',
      source_state_version: getAuthoritativeCombatStateVersion(state),
      idempotency_key: `${operationType}-key`,
      completion_handoff_id: operationType === COMBAT_OPERATION_TYPES.ENCOUNTER_COMPLETION_HANDOFF ? 'handoff-1' : undefined,
    });
    assert.equal(claimed.status, COMBAT_OPERATION_STATUSES.CLAIMED);
    recordCombatOperationCheckpoint({
      state,
      operation_id: claimed.operation_id,
      checkpoint_kind: checkpointKind,
      detail: { marker: checkpointKind },
    });
    completeDurableCombatOperation({
      state,
      operation_id: claimed.operation_id,
      result: {
        completion_handoff_id: operationType === COMBAT_OPERATION_TYPES.ENCOUNTER_COMPLETION_HANDOFF ? 'handoff-1' : undefined,
        player_result: { result: `${operationType} persisted.` },
      },
    });
  }

  const reloaded = ensureCombatPersistenceState(clone(state));
  const aggregate = reconstructCombatAggregate({ state: reloaded });
  const checkpointKinds = aggregate.operations.flatMap((operation) => operation.checkpoints.map((checkpoint) => checkpoint.checkpoint_kind));

  for (const [, checkpointKind] of operationTypes) {
    assert.ok(checkpointKinds.includes(checkpointKind));
  }
});

test('last confirmed state and read models rebuild deterministically after reload', () => {
  const state = baseState();
  const claimed = beginDurableCombatOperation({ state, ...actionRequest() });
  recordCombatOperationCheckpoint({
    state,
    operation_id: claimed.operation_id,
    checkpoint_kind: COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED,
    detail: { mutation_id: 'damage-1', target_id: 'enemy-1' },
  });
  completeDurableCombatOperation({
    state,
    operation_id: claimed.operation_id,
    result: { player_result: { result: 'Mutation persisted.' } },
  });

  const reloaded = ensureCombatPersistenceState(clone(state));
  const confirmed = reconstructLastConfirmedCombatState({ state: reloaded, operation_id: claimed.operation_id });
  const models = rebuildCombatPersistenceReadModels({ state: reloaded });

  assert.equal(confirmed.combat.combat_id, 'combat-6d12');
  assert.equal(models.player.status, 'active');
  assert.equal(models.player.state_marker, 'current');
  assert.equal(models.gm_dev.aggregate.state_version, 'combat-v2');
  assertNoCombatPersistencePlayerHiddenData(models.player);
});

test('invariant validation detects replay hazards and can mark recovery-needed', () => {
  const state = baseState({
    parent_turn_history: [
      { combat_id: 'combat-6d12', parent_turn_id: 'turn-1', actor_participant_id: 'pc-1', status: 'open' },
    ],
    concentrations: [
      { participant_id: 'pc-1', active: true },
      { participant_id: 'pc-1', active: true },
    ],
  });
  state.participants[1].initiative_position = 1;
  state.participants[0].death_saves = { successes: 4, failures: 0 };

  const first = beginDurableCombatOperation({ state, ...actionRequest({ idempotency_key: 'roll-a' }) });
  recordCombatOperationCheckpoint({
    state,
    operation_id: first.operation_id,
    checkpoint_kind: COMBAT_CHECKPOINT_KINDS.ROLL_PERSISTED,
    detail: { roll_id: 'shared-roll', total: 10 },
  });
  const second = beginDurableCombatOperation({ state, ...actionRequest({ idempotency_key: 'roll-b' }) });
  recordCombatOperationCheckpoint({
    state,
    operation_id: second.operation_id,
    checkpoint_kind: COMBAT_CHECKPOINT_KINDS.ROLL_PERSISTED,
    detail: { roll_id: 'shared-roll', total: 18 },
  });
  state.combat_persistence.events.push({ sequence: 1, event_type: 'manual-duplicate' });

  const result = validateCombatPersistenceInvariants({ state, enter_recovery: true });
  const codes = result.violations.map((violation) => violation.code);

  assert.equal(result.valid, false);
  assert.ok(codes.includes('duplicate_active_turn'));
  assert.ok(codes.includes('duplicate_initiative'));
  assert.ok(codes.includes('conflicting_roll'));
  assert.ok(codes.includes('duplicate_event_sequence'));
  assert.ok(codes.includes('double_concentration'));
  assert.ok(codes.includes('invalid_death_save_count'));
  assert.equal(state.recovery_needed, true);
});

test('GM/dev repair is permission-gated, audited, and does not add migrations', () => {
  const state = baseState();
  const recovery = enterCombatRecoveryNeeded({
    state,
    reason: 'manual test incident',
    classification: COMBAT_RECOVERY_CLASSIFICATIONS.MANUAL_REPAIR_REQUIRED,
  });
  const incidentId = recovery.incident.incident_id;

  const unauthorized = applyCombatRecoveryRepair({
    state,
    incident_id: incidentId,
    repair_kind: COMBAT_REPAIR_KINDS.MARK_INCIDENT_REPAIRED,
  });
  const repaired = applyCombatRecoveryRepair({
    state,
    incident_id: incidentId,
    repair_kind: COMBAT_REPAIR_KINDS.MARK_INCIDENT_REPAIRED,
    authorized_gm_dev: true,
    reason: 'Reviewed serialized state.',
  });

  assert.equal(unauthorized.status, 'unauthorized');
  assert.equal(repaired.status, 'repaired');
  assert.equal(state.combat_persistence.repair_audit.length, 1);
  assert.equal(inspectCombatRecoveryState({ state, incident_id: incidentId }).incident.status, 'repaired');
});

test('migration evidence gate requires reproduced deficiency and explicit owner approval', () => {
  const none = evaluateCombatMigrationEvidence({ deficiencies: [] });
  const unapproved = evaluateCombatMigrationEvidence({
    deficiencies: [
      {
        reproduced: true,
        failing_test: 'stage6d12 reload gap',
        schema_gap: 'cannot persist operation identity',
        alternatives_considered: ['serialize aggregate in existing combat record'],
        smallest_change: 'add operation ledger table',
      },
    ],
  });
  const approved = evaluateCombatMigrationEvidence({
    owner_approved: true,
    migration_added: false,
    deficiencies: [
      {
        reproduced: true,
        failing_test: 'stage6d12 reload gap',
        schema_gap: 'cannot persist operation identity',
        alternatives_considered: ['serialize aggregate in existing combat record'],
        smallest_change: 'add operation ledger table',
      },
    ],
  });

  assert.equal(none.status, COMBAT_MIGRATION_DECISION_STATUSES.NO_MIGRATION_PROVEN_NEEDED);
  assert.equal(unapproved.status, COMBAT_MIGRATION_DECISION_STATUSES.MIGRATION_REQUIRES_OWNER_APPROVAL);
  assert.equal(unapproved.migration_added, false);
  assert.equal(approved.status, COMBAT_MIGRATION_DECISION_STATUSES.MIGRATION_APPROVED_BY_EVIDENCE);
  assert.equal(approved.migration_added, false);
});
