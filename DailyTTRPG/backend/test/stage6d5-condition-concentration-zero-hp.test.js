import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONDITION_CONTEXT_KINDS,
  CONDITION_IDS,
  CONDITION_LIFECYCLE_EVENTS,
  CONDITION_PERSISTENCE_POLICIES,
  CONDITION_STACKING_POLICIES,
  CONDITION_SUPPORT_STATUSES,
  DEATH_SAVE_STATUSES,
  DND5E_2014_RULESET,
  ROLL_GENERATION_ORIGINS,
  ZERO_HP_POLICIES,
  ZERO_HP_STATUSES,
  advanceStableNaturalRecovery,
  applyCondition,
  applyDamageAtZeroHitPoints,
  applyNonlethalDefeat,
  assertNoCombatStatePlayerHiddenData,
  buildConditionGmDevTrace,
  calculateProneStandingCost,
  createConditionDefinition,
  createConditionInstance,
  endConcentration,
  evaluateCombatEndPersistence,
  evaluateConcentrationCarryForward,
  evaluateConditionEffects,
  evaluateFrightenedMovement,
  evaluateProneCrawl,
  evaluateProneStanding,
  evaluateZeroHitPointTransition,
  getConditionDefinition,
  healParticipantFromZero,
  processConcentrationDamage,
  processConcentrationParticipantEvent,
  processConditionLifecycleEvent,
  projectConditionForPlayer,
  projectParticipantStateForPlayer,
  removeCondition,
  resolveDeathSavingThrow,
  stabilizeParticipant,
  startConcentration,
} from '../src/engine/combat/conditionStateLifecycle.js';

const testOrigin = ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE;

function pc(overrides = {}) {
  return {
    participant_id: 'pc-1',
    display_name: 'Avery',
    faction: 'player',
    current_hit_points: 8,
    max_hit_points: 12,
    ...overrides,
  };
}

function enemy(overrides = {}) {
  return {
    participant_id: 'enemy-1',
    display_name: 'Bandit',
    faction: 'enemy',
    current_hit_points: 5,
    max_hit_points: 10,
    ...overrides,
  };
}

function condition(type, overrides = {}) {
  return createConditionInstance({
    condition_type: type,
    target_participant_id: overrides.target_participant_id ?? 'pc-1',
    source_participant_id: overrides.source_participant_id ?? 'enemy-1',
    duration: overrides.duration ?? { duration_type: 'rounds', duration_value: 1, remaining_rounds: 1 },
    ...overrides,
  });
}

test('6D.5 condition definitions are ruleset aware fully supported or explicitly deferred', () => {
  const prone = getConditionDefinition(CONDITION_IDS.PRONE);
  assert.equal(prone.ruleset.system, 'dnd5e');
  assert.equal(prone.ruleset.rules_version, '2014');
  assert.equal(prone.support_status, CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED);
  assert.equal(prone.attack_roll_modifiers.self_disadvantage, true);

  const invisible = getConditionDefinition(CONDITION_IDS.INVISIBLE);
  assert.equal(invisible.support_status, CONDITION_SUPPORT_STATUSES.DEFERRED);

  assert.throws(
    () => createConditionDefinition({ condition_id: 'future', ruleset: { system: 'dnd5e', rules_version: '2024' } }),
    /Unsupported combat ruleset/
  );

  assert.throws(
    () => createConditionDefinition({ condition_id: 'unsafe', ruleset: DND5E_2014_RULESET, handler: 'eval' }),
    /cannot include executable code/
  );
});

test('6D.5 condition application replacement stacking removal and duplicate committed mutations are stable', () => {
  const first = condition(CONDITION_IDS.POISONED, {
    condition_instance_id: 'poison-1',
    committed_resolution_id: 'resolution:poison:1',
    duration: { duration_type: 'rounds', duration_value: 1, remaining_rounds: 1 },
  });
  const applied = applyCondition({ condition: first, existing_conditions: [] });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.effective_conditions.length, 1);

  const duplicate = applyCondition({ condition: first, existing_conditions: applied.effective_conditions });
  assert.equal(duplicate.status, 'duplicate_handled');
  assert.equal(duplicate.effective_conditions.length, 1);

  const refreshed = applyCondition({
    condition: condition(CONDITION_IDS.POISONED, {
      condition_instance_id: 'poison-2',
      committed_resolution_id: 'resolution:poison:2',
      duration: { duration_type: 'rounds', duration_value: 3, remaining_rounds: 3 },
    }),
    existing_conditions: applied.effective_conditions,
  });
  assert.equal(refreshed.status, 'already_present');
  assert.equal(refreshed.effective_conditions.length, 1);

  const grappleA = applyCondition({
    condition: condition(CONDITION_IDS.GRAPPLED, { condition_instance_id: 'grapple-a', source_participant_id: 'goblin-a' }),
    existing_conditions: [],
  });
  const grappleB = applyCondition({
    condition: condition(CONDITION_IDS.GRAPPLED, { condition_instance_id: 'grapple-b', source_participant_id: 'goblin-b' }),
    existing_conditions: grappleA.effective_conditions,
  });
  assert.equal(grappleB.effective_conditions.length, 2);

  const removed = removeCondition({
    condition_type: CONDITION_IDS.GRAPPLED,
    source_participant_id: 'goblin-a',
    removal_reason: 'explicit_release',
    existing_conditions: grappleB.effective_conditions,
  });
  assert.equal(removed.status, 'removed');
  assert.equal(removed.removed_instances.length, 1);
  assert.equal(removed.remaining_conditions.length, 1);
});

test('6D.5 Prone hooks model attack modifiers standing cost crawling and missing proximity context', () => {
  const conditions = [condition(CONDITION_IDS.PRONE)];
  const ownAttack = evaluateConditionEffects({ participant: pc(), conditions, context_kind: CONDITION_CONTEXT_KINDS.ATTACK_ROLL });
  assert.deepEqual(ownAttack.disadvantage_sources, [CONDITION_IDS.PRONE]);

  const closeAttack = evaluateConditionEffects({
    participant: pc(),
    conditions,
    context_kind: CONDITION_CONTEXT_KINDS.ATTACKS_AGAINST_TARGET,
    attacker_within_five_feet: true,
  });
  assert.deepEqual(closeAttack.advantage_sources, [CONDITION_IDS.PRONE]);

  const farAttack = evaluateConditionEffects({
    participant: pc(),
    conditions,
    context_kind: CONDITION_CONTEXT_KINDS.ATTACKS_AGAINST_TARGET,
    attacker_within_five_feet: false,
  });
  assert.deepEqual(farAttack.disadvantage_sources, [CONDITION_IDS.PRONE]);

  const missing = evaluateConditionEffects({ participant: pc(), conditions, context_kind: CONDITION_CONTEXT_KINDS.ATTACKS_AGAINST_TARGET });
  assert.equal(missing.insufficient_context, true);

  assert.equal(calculateProneStandingCost({ current_speed: 30 }), 15);
  assert.equal(evaluateProneStanding({ current_speed: 30, movement_remaining: 10 }).can_stand, false);
  assert.equal(evaluateProneStanding({ current_speed: 0, movement_remaining: 30 }).reason, 'speed_zero');
  assert.equal(evaluateProneStanding({ current_speed: 30, movement_remaining: 15 }).condition_removal_instruction.condition_type, CONDITION_IDS.PRONE);
  assert.equal(evaluateProneCrawl().condition_remains, true);
});

test('6D.5 Grappled Restrained Poisoned Frightened Blinded Stunned Incapacitated and Unconscious hooks are mechanically meaningful', () => {
  const grappled = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.GRAPPLED)], context_kind: CONDITION_CONTEXT_KINDS.MOVEMENT });
  assert.equal(grappled.speed_zero, true);
  assert.equal(grappled.disadvantage_sources.length, 0);

  const restrainedAttack = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.RESTRAINED)], context_kind: CONDITION_CONTEXT_KINDS.ATTACK_ROLL });
  assert.deepEqual(restrainedAttack.disadvantage_sources, [CONDITION_IDS.RESTRAINED]);
  const restrainedDexSave = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.RESTRAINED)], context_kind: CONDITION_CONTEXT_KINDS.SAVING_THROW, ability: 'DEX' });
  assert.deepEqual(restrainedDexSave.disadvantage_sources, [CONDITION_IDS.RESTRAINED]);
  const restrainedWisSave = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.RESTRAINED)], context_kind: CONDITION_CONTEXT_KINDS.SAVING_THROW, ability: 'WIS' });
  assert.equal(restrainedWisSave.disadvantage_sources.length, 0);

  const poisonedCheck = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.POISONED)], context_kind: CONDITION_CONTEXT_KINDS.ABILITY_CHECK });
  assert.deepEqual(poisonedCheck.disadvantage_sources, [CONDITION_IDS.POISONED]);
  const poisonedSave = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.POISONED)], context_kind: CONDITION_CONTEXT_KINDS.SAVING_THROW, ability: 'CON' });
  assert.equal(poisonedSave.disadvantage_sources.length, 0);

  const frightenedVisible = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.FRIGHTENED)], context_kind: CONDITION_CONTEXT_KINDS.ATTACK_ROLL, source_visible: true });
  assert.deepEqual(frightenedVisible.disadvantage_sources, [CONDITION_IDS.FRIGHTENED]);
  const frightenedHidden = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.FRIGHTENED)], context_kind: CONDITION_CONTEXT_KINDS.ATTACK_ROLL, source_visible: false });
  assert.equal(frightenedHidden.disadvantage_sources.length, 0);
  assert.equal(evaluateFrightenedMovement({ source_visible: true, movement_is_voluntary: true, current_proximity_rank: 3, proposed_proximity_rank: 2 }).movement_decision, 'illegal_willingly_approaches_fear_source');
  assert.equal(evaluateFrightenedMovement({ source_visible: true, movement_is_voluntary: false, current_proximity_rank: 3, proposed_proximity_rank: 2 }).movement_decision, 'legal');
  assert.equal(evaluateFrightenedMovement({ source_visible: true, movement_is_voluntary: true }).movement_decision, 'insufficient_context');

  const blindedSight = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.BLINDED)], context_kind: CONDITION_CONTEXT_KINDS.ABILITY_CHECK, requires_sight: true });
  assert.equal(blindedSight.can_see, false);
  assert.equal(blindedSight.automatic_failure, true);
  const blindedAttackAgainst = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.BLINDED)], context_kind: CONDITION_CONTEXT_KINDS.ATTACKS_AGAINST_TARGET });
  assert.deepEqual(blindedAttackAgainst.advantage_sources, [CONDITION_IDS.BLINDED]);

  const stunned = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.STUNNED)], context_kind: CONDITION_CONTEXT_KINDS.SAVING_THROW, ability: 'STR' });
  assert.equal(stunned.action_allowed, false);
  assert.equal(stunned.movement_allowed, false);
  assert.equal(stunned.speech, 'faltering');
  assert.equal(stunned.automatic_failure, true);

  const incapacitated = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.INCAPACITATED)], context_kind: CONDITION_CONTEXT_KINDS.ACTION_LEGALITY });
  assert.equal(incapacitated.action_allowed, false);
  assert.equal(incapacitated.bonus_action_allowed, false);
  assert.equal(incapacitated.reaction_allowed, false);
  assert.equal(incapacitated.speed_zero, false);

  const unconscious = evaluateConditionEffects({ participant: pc(), conditions: [condition(CONDITION_IDS.UNCONSCIOUS)], context_kind: CONDITION_CONTEXT_KINDS.ATTACKS_AGAINST_TARGET, attacker_within_five_feet: true });
  assert.equal(unconscious.action_allowed, false);
  assert.equal(unconscious.movement_allowed, false);
  assert.equal(unconscious.aware, false);
  assert.equal(unconscious.critical_on_hit, true);
  assert.equal(unconscious.dropped_items_instruction.instruction_type, 'drop_held_items');
});

test('6D.5 deferred conditions apply structurally without pretending mechanics are active', () => {
  for (const conditionId of [CONDITION_IDS.CHARMED, CONDITION_IDS.DEAFENED, CONDITION_IDS.INVISIBLE, CONDITION_IDS.PARALYZED, CONDITION_IDS.PETRIFIED, CONDITION_IDS.EXHAUSTION]) {
    const applied = applyCondition({ condition: condition(conditionId), existing_conditions: [] });
    assert.equal(applied.applied_instance.support_status, CONDITION_SUPPORT_STATUSES.DEFERRED);
    const effects = evaluateConditionEffects({ participant: pc(), conditions: applied.effective_conditions, context_kind: CONDITION_CONTEXT_KINDS.ATTACK_ROLL });
    assert.equal(effects.disadvantage_sources.length, 0);
    assert.equal(effects.support_warnings.length, 1);
  }
});

test('6D.5 lifecycle events expire grapple concentration-linked and combat-scoped conditions without turn advancement', () => {
  const grapple = condition(CONDITION_IDS.GRAPPLED, { condition_instance_id: 'grapple', source_participant_id: 'enemy-1' });
  const concentrationLinked = condition(CONDITION_IDS.RESTRAINED, { condition_instance_id: 'restrained', concentration_id: 'conc-1' });
  const combatScoped = condition(CONDITION_IDS.POISONED, { condition_instance_id: 'poisoned', persistence_policy: CONDITION_PERSISTENCE_POLICIES.COMBAT_SCOPED });

  const sourceIncap = processConditionLifecycleEvent({
    event_type: CONDITION_LIFECYCLE_EVENTS.SOURCE_BECAME_INCAPACITATED,
    source_participant_id: 'enemy-1',
    conditions: [grapple, concentrationLinked],
  });
  assert.equal(sourceIncap.removed_instances[0].condition_type, CONDITION_IDS.GRAPPLED);

  const concentrationEnded = processConditionLifecycleEvent({
    event_type: CONDITION_LIFECYCLE_EVENTS.CONCENTRATION_ENDED,
    concentration_id: 'conc-1',
    conditions: [grapple, concentrationLinked],
  });
  assert.equal(concentrationEnded.removed_instances[0].condition_type, CONDITION_IDS.RESTRAINED);

  const combatEnded = processConditionLifecycleEvent({
    event_type: CONDITION_LIFECYCLE_EVENTS.COMBAT_ENDED,
    conditions: [combatScoped],
  });
  assert.equal(combatEnded.removed_instances.length, 1);
});

test('6D.5 concentration starts replaces ends and responds to incapacitation idempotently', () => {
  const first = startConcentration({
    participant: pc(),
    concentration_id: 'conc-1',
    source_effect_id: 'spell-a',
    linked_condition_instance_ids: ['restrained-1'],
  });
  assert.equal(first.status, 'started');
  assert.equal(first.concentration.active, true);

  const second = startConcentration({
    participant: pc(),
    existing_concentration: first.concentration,
    concentration_id: 'conc-2',
    source_effect_id: 'spell-b',
    linked_condition_instance_ids: ['frightened-1'],
  });
  assert.equal(second.status, 'replaced');
  assert.deepEqual(second.linked_effects_to_remove, ['restrained-1']);

  const ended = endConcentration({ concentration: second.concentration, end_reason: 'voluntary' });
  assert.equal(ended.status, 'ended');
  assert.equal(ended.linked_effects_to_remove[0], 'frightened-1');
  assert.equal(endConcentration({ concentration: ended.concentration }).status, 'already_inactive');

  const incapable = startConcentration({
    participant: pc(),
    conditions: [condition(CONDITION_IDS.INCAPACITATED)],
    concentration_id: 'conc-fail',
  });
  assert.equal(incapable.status, 'unavailable');

  const eventEnded = processConcentrationParticipantEvent({
    event_type: CONDITION_LIFECYCLE_EVENTS.PARTICIPANT_BECAME_UNCONSCIOUS,
    concentration: second.concentration,
  });
  assert.equal(eventEnded.status, 'ended');
  assert.equal(eventEnded.concentration.ended_reason, CONDITION_LIFECYCLE_EVENTS.PARTICIPANT_BECAME_UNCONSCIOUS);
});

test('6D.5 concentration damage saves use correct DC, damage amount, roll reuse, and linked cleanup', () => {
  const concentration = startConcentration({ participant: pc(), concentration_id: 'conc-1' }).concentration;
  assert.equal(processConcentrationDamage({ concentration, damage_amount: 0 }).save_required, false);

  const dcTen = processConcentrationDamage({
    concentration,
    damage_amount: 21,
    roll_override: 12,
    generation_origin: testOrigin,
  });
  assert.equal(dcTen.difficulty_class, 10);
  assert.equal(dcTen.status, 'concentration_maintained');

  const dcEleven = processConcentrationDamage({
    concentration,
    damage_amount: 22,
    roll_override: 10,
    generation_origin: testOrigin,
  });
  assert.equal(dcEleven.difficulty_class, 11);
  assert.equal(dcEleven.status, 'ended');
  assert.equal(dcEleven.concentration.ended_reason, 'failed_concentration_save');

  const reused = processConcentrationDamage({
    concentration,
    damage_amount: 22,
    existing_roll_record: dcEleven.save_result.roll_record,
  });
  assert.equal(reused.save_result.roll_record.reused_from_roll_id, dcEleven.save_result.roll_record.roll_id);
});

test('6D.5 concentration carry-forward keeps valid effects and converts round duration without scheduler', () => {
  const concentration = startConcentration({
    participant: pc(),
    concentration_id: 'conc-carry',
    duration: { duration_type: 'rounds', remaining_rounds: 3 },
    linked_effect_ids: ['effect-a'],
  }).concentration;
  const carry = evaluateConcentrationCarryForward({ concentration });
  assert.equal(carry.status, 'carry_forward');
  assert.equal(carry.adventure_duration_seconds, 18);

  const expired = evaluateConcentrationCarryForward({ concentration: { ...concentration, duration: { duration_type: 'rounds', remaining_rounds: 0 } } });
  assert.equal(expired.carry_forward, false);
});

test('6D.5 zero-hit-point policies handle ordinary enemy defeat, death saves, protected state, concentration end, and massive damage', () => {
  const ordinary = evaluateZeroHitPointTransition({
    participant: enemy({ current_hit_points: 0 }),
    reached_zero_hit_points: true,
    defeat_policy: ZERO_HP_POLICIES.ORDINARY_ENEMY,
  });
  assert.equal(ordinary.status, ZERO_HP_STATUSES.DEFEATED);
  assert.equal(ordinary.conditions_to_apply[0], CONDITION_IDS.DEFEATED);

  const deathEligible = evaluateZeroHitPointTransition({
    participant: pc({ current_hit_points: 0 }),
    reached_zero_hit_points: true,
    defeat_policy: ZERO_HP_POLICIES.DEATH_SAVE_ELIGIBLE,
  });
  assert.equal(deathEligible.status, ZERO_HP_STATUSES.UNCONSCIOUS_DEATH_SAVES);
  assert.deepEqual(deathEligible.conditions_to_apply, [CONDITION_IDS.UNCONSCIOUS, CONDITION_IDS.INCAPACITATED, CONDITION_IDS.PRONE]);
  assert.equal(deathEligible.concentration_end_instruction.reason, 'reached_zero_hit_points');

  const protectedResult = evaluateZeroHitPointTransition({
    participant: pc({ current_hit_points: 0 }),
    reached_zero_hit_points: true,
    defeat_policy: ZERO_HP_POLICIES.PROTECTED,
  });
  assert.equal(protectedResult.status, ZERO_HP_STATUSES.PROTECTED);

  const massive = evaluateZeroHitPointTransition({
    participant: pc({ current_hit_points: 0, max_hit_points: 12 }),
    reached_zero_hit_points: true,
    overkill_damage: 12,
    defeat_policy: ZERO_HP_POLICIES.DEATH_SAVE_ELIGIBLE,
  });
  assert.equal(massive.status, ZERO_HP_STATUSES.DEAD);
});

test('6D.5 death saves implement natural one natural twenty success failure stable and death', () => {
  const success = resolveDeathSavingThrow({
    death_save_state: { successes: 0, failures: 0 },
    roll_override: 10,
    generation_origin: testOrigin,
  });
  assert.equal(success.death_save_state.successes, 1);

  const failure = resolveDeathSavingThrow({
    death_save_state: { successes: 0, failures: 0 },
    roll_override: 9,
    generation_origin: testOrigin,
  });
  assert.equal(failure.death_save_state.failures, 1);

  const natOne = resolveDeathSavingThrow({
    death_save_state: { successes: 0, failures: 0 },
    roll_override: 1,
    generation_origin: testOrigin,
  });
  assert.equal(natOne.death_save_state.failures, 2);

  const natTwenty = resolveDeathSavingThrow({
    death_save_state: { successes: 0, failures: 2 },
    roll_override: 20,
    generation_origin: testOrigin,
  });
  assert.equal(natTwenty.status, DEATH_SAVE_STATUSES.REVIVED);
  assert.equal(natTwenty.restored_hit_points, 1);

  const stable = resolveDeathSavingThrow({
    death_save_state: { successes: 2, failures: 0 },
    roll_override: 12,
    generation_origin: testOrigin,
  });
  assert.equal(stable.status, DEATH_SAVE_STATUSES.STABLE);
  assert.equal(stable.death_save_state.stable, true);

  const dead = resolveDeathSavingThrow({
    death_save_state: { successes: 0, failures: 2 },
    roll_override: 2,
    generation_origin: testOrigin,
  });
  assert.equal(dead.status, DEATH_SAVE_STATUSES.DEAD);
});

test('6D.5 damage at zero stabilization natural recovery and healing from zero follow 2014 state rules', () => {
  const oneFailure = applyDamageAtZeroHitPoints({
    death_save_state: { successes: 0, failures: 0, stable: true },
    damage_amount: 3,
  });
  assert.equal(oneFailure.failures_added, 1);
  assert.equal(oneFailure.stable_removed, true);

  const critical = applyDamageAtZeroHitPoints({
    death_save_state: { successes: 0, failures: 0 },
    damage_amount: 3,
    critical_hit: true,
  });
  assert.equal(critical.failures_added, 2);

  const massive = applyDamageAtZeroHitPoints({
    death_save_state: { successes: 0, failures: 0 },
    damage_amount: 12,
    max_hit_points: 12,
  });
  assert.equal(massive.status, DEATH_SAVE_STATUSES.DEAD);

  const stable = stabilizeParticipant({
    participant: pc({ current_hit_points: 0 }),
    roll_override: 2,
    generation_origin: testOrigin,
  });
  assert.equal(stable.death_save_state.stable, true);
  assert.equal(stable.natural_recovery_hours, 2);
  assert.equal(stable.conditions_to_keep.includes(CONDITION_IDS.UNCONSCIOUS), true);

  const recoveryNotDue = advanceStableNaturalRecovery({ death_save_state: stable.death_save_state, authoritative_time: 'later' });
  assert.equal(recoveryNotDue.status, 'not_due');
  const recovered = advanceStableNaturalRecovery({ death_save_state: stable.death_save_state, authoritative_time: stable.death_save_state.natural_recovery_at });
  assert.equal(recovered.restored_hit_points, 1);

  const healed = healParticipantFromZero({
    participant: pc({ current_hit_points: 0, max_hit_points: 12 }),
    healing_amount: 5,
    death_save_state: stable.death_save_state,
  });
  assert.equal(healed.status, DEATH_SAVE_STATUSES.REVIVED);
  assert.equal(healed.participant.current_hit_points, 5);
  assert.equal(healed.conditions_to_remove.includes(CONDITION_IDS.UNCONSCIOUS), true);
  assert.equal(healed.conditions_to_keep.includes(CONDITION_IDS.PRONE), true);
});

test('6D.5 nonlethal melee defeat is declared before damage and rejects ineligible retroactive or ranged use', () => {
  const valid = applyNonlethalDefeat({ declared_before_damage: true, attack_kind: 'melee_weapon_attack', target_valid: true });
  assert.equal(valid.status, ZERO_HP_STATUSES.UNCONSCIOUS_STABLE);
  assert.equal(valid.death_save_state.stable, true);

  assert.equal(applyNonlethalDefeat({ declared_before_damage: false, attack_kind: 'melee_weapon_attack' }).reason, 'intent_not_declared_before_damage');
  assert.equal(applyNonlethalDefeat({ declared_before_damage: true, attack_kind: 'ranged_weapon_attack' }).reason, 'not_eligible_for_default_nonlethal');
  assert.equal(applyNonlethalDefeat({ declared_before_damage: true, attack_kind: 'spell', authored_exception: true }).status, ZERO_HP_STATUSES.UNCONSCIOUS_STABLE);
});

test('6D.5 combat-end persistence expires combat scoped effects and carries persistent conditions and valid concentration', () => {
  const result = evaluateCombatEndPersistence({
    conditions: [
      condition(CONDITION_IDS.POISONED, { condition_instance_id: 'combat-poison', persistence_policy: CONDITION_PERSISTENCE_POLICIES.COMBAT_SCOPED }),
      condition(CONDITION_IDS.BLINDED, { condition_instance_id: 'persistent-blind', persistence_policy: CONDITION_PERSISTENCE_POLICIES.PERSISTENT, duration: { duration_type: 'rounds', remaining_rounds: 2 } }),
    ],
    concentration: startConcentration({ participant: pc(), concentration_id: 'conc-1', duration: { duration_type: 'rounds', remaining_rounds: 2 } }).concentration,
  });
  assert.equal(result.expired_conditions.length, 1);
  assert.equal(result.persisted_conditions.length, 1);
  assert.equal(result.persisted_conditions[0].duration.remaining_seconds, 12);
  assert.equal(result.concentration.carry_forward, true);
});

test('6D.5 player projections hide internal condition/death state while GM/dev trace preserves diagnostics', () => {
  const projectedCondition = projectConditionForPlayer(condition(CONDITION_IDS.FRIGHTENED, {
    gm_dev_trace_metadata: { hidden_fear_source: 'secret' },
  }));
  assert.equal(projectedCondition.condition_type, CONDITION_IDS.FRIGHTENED);
  assert.equal(assertNoCombatStatePlayerHiddenData(projectedCondition), true);

  const ownState = projectParticipantStateForPlayer({
    participant: pc({ current_hit_points: 0 }),
    conditions: [condition(CONDITION_IDS.UNCONSCIOUS)],
    death_save_state: { successes: 1, failures: 2 },
    viewer_owns_participant: true,
  });
  assert.equal(ownState.death_save_state.failures, 2);
  assert.equal(assertNoCombatStatePlayerHiddenData(ownState), true);

  const hiddenEnemyState = projectParticipantStateForPlayer({
    participant: enemy({ current_hit_points: 0 }),
    conditions: [condition(CONDITION_IDS.UNCONSCIOUS, { target_participant_id: 'enemy-1' })],
    death_save_state: { successes: 1, failures: 2 },
    viewer_owns_participant: false,
  });
  assert.equal(hiddenEnemyState.death_save_state, undefined);

  const trace = buildConditionGmDevTrace({
    conditions: [condition(CONDITION_IDS.UNCONSCIOUS)],
    death_save_state: { successes: 1, failures: 2 },
    decisions: [{ hidden: true, reason: 'test' }],
  });
  assert.equal(trace.death_save_state.failures, 2);
  assert.equal(trace.decisions[0].hidden, true);
});

