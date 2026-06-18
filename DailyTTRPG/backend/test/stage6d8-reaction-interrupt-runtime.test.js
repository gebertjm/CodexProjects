import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_EFFECT_TYPES,
  COMBAT_RESOURCE_CATEGORIES,
  COMBAT_TARGET_POLICIES,
} from '../src/engine/combat/actionEffectResourceFramework.js';
import {
  CONDITION_IDS,
  createConditionInstance,
} from '../src/engine/combat/conditionStateLifecycle.js';
import {
  CREATURE_SIZE_CATEGORIES,
  PROXIMITY_STATES,
  createSpatialRelationship,
} from '../src/engine/combat/spatialMovement.js';
import {
  CONTINUATION_STATUSES,
  REACTION_NESTING_POLICIES,
  REACTION_NEXT_DECISION_KINDS,
  REACTION_PREFERENCE_VALUES,
  REACTION_QUEUE_PHASES,
  REACTION_TIMING_POINTS,
  REACTION_TRIGGER_STATUSES,
  REACTION_TRIGGER_TYPES,
  REACTION_TYPES,
  REACTION_WINDOW_STATUSES,
  applyReactionTimeoutDecline,
  assertNoReactionPlayerHiddenData,
  buildReactionGmDevTrace,
  buildReactionPlayerReadModel,
  collectEligibleReactions,
  createNestedReactionExceptionRegistry,
  createOpportunityAttackTriggerFromMovement,
  createReactionDefinition,
  createReactionQueue,
  createReactionResourceState,
  createReactionTrigger,
  declineReaction,
  enterReactionRecoveryNeeded,
  evaluateReactionPreference,
  openPlayerReactionWindow,
  previewReaction,
  processNestedReactionTrigger,
  processReactionTrigger,
  projectReactionForGmDev,
  projectReactionForPlayer,
  refreshReactionResourceAtTurnStart,
  resolveDeterministicReactions,
  resumeParentResolution,
  submitReaction,
} from '../src/engine/combat/reactionInterruptRuntime.js';
import {
  DND5E_2014_RULESET,
  PLAYER_TURN_STATUSES,
  openPlayerCombatTurn,
} from '../src/engine/combat/playerTurnRuntime.js';
import {
  COMBAT_RESOLUTION_STATUSES,
} from '../src/services/interactionCore/combatAdapterContract.js';

function relationship(a, b, proximity = PROXIMITY_STATES.ENGAGED) {
  return createSpatialRelationship({
    participant_a_id: a,
    participant_b_id: b,
    proximity,
  });
}

function actor(overrides = {}) {
  const relationships = [
    relationship('pc-1', 'enemy-1'),
    relationship('pc-1', 'ally-1'),
  ];
  return {
    participant_id: 'pc-1',
    display_name: 'Avery',
    faction: 'player',
    control_mode: 'player',
    player_controlled: true,
    is_player_character: true,
    current_zone_id: 'road',
    size: CREATURE_SIZE_CATEGORIES.MEDIUM,
    speed: 30,
    armor_class: 13,
    current_hit_points: 20,
    max_hit_points: 20,
    temporary_hit_points: 0,
    active: true,
    defeated: false,
    relationships,
    ...overrides,
  };
}

function enemy(overrides = {}) {
  const id = overrides.participant_id ?? 'enemy-1';
  const relationships = [
    relationship('pc-1', id),
  ];
  return {
    participant_id: id,
    display_name: overrides.display_name ?? 'Training Bandit',
    faction: 'enemy',
    control_mode: 'ai',
    current_zone_id: 'road',
    size: CREATURE_SIZE_CATEGORIES.MEDIUM,
    speed: 30,
    armor_class: 12,
    current_hit_points: 12,
    max_hit_points: 12,
    temporary_hit_points: 0,
    active: true,
    defeated: false,
    can_perceive_target: true,
    relationships,
    ...overrides,
  };
}

function ally(overrides = {}) {
  return {
    participant_id: 'ally-1',
    display_name: 'Lantern Guard',
    faction: 'player',
    control_mode: 'ai',
    current_zone_id: 'road',
    size: CREATURE_SIZE_CATEGORIES.MEDIUM,
    speed: 30,
    armor_class: 13,
    current_hit_points: 10,
    max_hit_points: 10,
    temporary_hit_points: 0,
    active: true,
    defeated: false,
    can_perceive_target: true,
    ...overrides,
  };
}

function condition(type, target = 'enemy-1', overrides = {}) {
  return createConditionInstance({
    condition_type: type,
    target_participant_id: target,
    source_participant_id: 'pc-1',
    duration: { duration_type: 'rounds', duration_value: 1, remaining_rounds: 1 },
    ...overrides,
  });
}

function reactionAttackAction(overrides = {}) {
  return {
    action_id: overrides.action_id ?? 'opportunity-strike',
    player_label: overrides.player_label ?? 'Opportunity Strike',
    ruleset: DND5E_2014_RULESET,
    timing_category: COMBAT_ACTION_TIMING_CATEGORIES.REACTION,
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
    authored_metadata: {
      attack_kind: 'melee',
      ...(overrides.authored_metadata ?? {}),
    },
    action_level_costs: overrides.action_level_costs ?? [],
    effect_steps: overrides.effect_steps ?? [
      { step_id: 'attack', order: 1, effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        depends_on_step_id: 'attack',
        requires_outcome: { was_hit: true },
        params: {
          linked_attack_step_id: 'attack',
          components: [{ damage_type: 'slashing', dice_count: 1, dice_size: 6, flat_modifier: 2 }],
        },
      },
    ],
    ...overrides,
  };
}

function reactionDefinition(overrides = {}) {
  return createReactionDefinition({
    reaction_id: overrides.reaction_id ?? 'opportunity-strike',
    reaction_type: overrides.reaction_type ?? REACTION_TYPES.OPPORTUNITY_ATTACK,
    player_name: overrides.player_name ?? 'Opportunity Strike',
    trigger_type: overrides.trigger_type ?? REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK,
    timing_point: overrides.timing_point ?? REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH,
    action_definition: overrides.action_definition ?? reactionAttackAction(overrides.action_overrides),
    authored_priority: overrides.authored_priority ?? 10,
    deterministic_phase: overrides.deterministic_phase,
    player_visible: overrides.player_visible,
    actor_eligibility: overrides.actor_eligibility,
    additional_resource_costs: overrides.additional_resource_costs,
    reach_requirement: overrides.reach_requirement,
    preference_key: overrides.preference_key ?? 'opportunity_attack',
    timeout_behavior: overrides.timeout_behavior,
    nesting_policy: overrides.nesting_policy,
    player_safe_description: overrides.player_safe_description ?? 'Strike as the opponent leaves reach.',
  });
}

function baseState(overrides = {}) {
  return {
    combat: {
      combat_id: 'combat-6d8',
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 1,
      initiative_position: 1,
      current_participant_id: 'pc-1',
      encounter_title: 'Neutral Reaction Test',
      ...(overrides.combat ?? {}),
    },
    current_participant_id: overrides.current_participant_id ?? 'pc-1',
    participants: overrides.participants ?? [actor(), enemy(), ally()],
    actions: overrides.actions ?? [reactionAttackAction()],
    resources: overrides.resources ?? [
      {
        resource_id: 'guard-token',
        label: 'Guard Token',
        category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE,
        owner_ref: 'enemy-1',
        current: 1,
        maximum: 1,
      },
    ],
    conditions: overrides.conditions ?? [],
    reaction_definitions: overrides.reaction_definitions ?? [reactionDefinition()],
    reaction_resources: overrides.reaction_resources ?? {},
    reaction_preferences: overrides.reaction_preferences ?? {},
    ...(overrides.rest ?? {}),
  };
}

function opened(overrides = {}) {
  return openPlayerCombatTurn(baseState(overrides)).state;
}

function opportunityTrigger(state, overrides = {}) {
  return createReactionTrigger({
    trigger_type: REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK,
    timing_point: REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH,
    combat_id: state.combat.combat_id,
    parent_turn_id: state.parent_turn.parent_turn_id,
    parent_sub_resolution_id: 'move-sub-1',
    triggering_actor_id: overrides.triggering_actor_id ?? 'pc-1',
    triggering_event: 'voluntary_movement_leaves_reach',
    source_state_version: state.parent_turn.current_state_version,
    position_state: {
      before_proximity: overrides.before_proximity ?? PROXIMITY_STATES.ENGAGED,
      after_proximity: overrides.after_proximity ?? PROXIMITY_STATES.NEARBY,
    },
    potential_reactors: overrides.potential_reactors ?? ['enemy-1'],
    player_visible_summary: 'Movement may draw a reaction.',
    continuation_id: overrides.continuation_id ?? 'continuation:test',
    mandatory_effects: overrides.mandatory_effects,
  });
}

function openEnemyReactionWindow(input = {}) {
  const state = input.state ?? opened(input.overrides);
  const trigger = opportunityTrigger(state, input.trigger_overrides);
  state.reaction_triggers ??= {};
  state.reaction_queues ??= {};
  state.reaction_triggers[trigger.trigger_id] = trigger;
  const collection = collectEligibleReactions({ state, trigger });
  const queue = createReactionQueue({ trigger, legal_reactions: collection.legal_reactions });
  state.reaction_queues[queue.queue_id] = queue;
  return openPlayerReactionWindow({
    state,
    trigger,
    legal_reactions: collection.legal_reactions,
    participant_id: input.participant_id ?? 'enemy-1',
  });
}

test('6D.8 defines explicit reaction contracts, resources, preferences, and safe authoring validation', () => {
  const definition = reactionDefinition();
  assert.equal(definition.ruleset_id, 'dnd5e-2014');
  assert.equal(definition.rules_version, '2014');
  assert.equal(definition.trigger_type, REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK);
  assert.equal(definition.timing_point, REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH);
  assert.equal(definition.action_definition.timing_category, COMBAT_ACTION_TIMING_CATEGORIES.REACTION);

  assert.throws(
    () => createReactionDefinition({
      ...definition,
      trigger_predicate: () => true,
    }),
    /Executable reaction authoring/
  );

  const resource = createReactionResourceState({ participant_id: 'pc-1', reaction_available: false });
  assert.equal(resource.reaction_status, 'spent');

  const refreshed = refreshReactionResourceAtTurnStart({ state: opened(), participant_id: 'pc-1', turn_id: 'turn-2' });
  assert.equal(refreshed.reaction_resource.reaction_status, 'available');
  assert.equal(refreshed.initiative_advanced, false);

  assert.equal(evaluateReactionPreference({ preferences: {}, participant_id: 'pc-1', preference_key: 'x' }).preference_value, REACTION_PREFERENCE_VALUES.ASK);
});

test('6D.8 opportunity attack triggers pause the parent turn and suppress invalid movement triggers', () => {
  const state = opened();
  const triggered = createOpportunityAttackTriggerFromMovement({
    state,
    mover_participant_id: 'pc-1',
    parent_sub_resolution_id: 'move-sub-1',
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
    potential_reactors: [enemy()],
    destination_zone_id: 'ditch',
  });
  assert.equal(triggered.status, REACTION_TRIGGER_STATUSES.DETECTED);
  assert.equal(triggered.state.parent_turn.status, PLAYER_TURN_STATUSES.PAUSED_FOR_REACTION);
  assert.equal(triggered.continuation.continuation_status, CONTINUATION_STATUSES.PAUSED);
  assert.equal(triggered.gm_dev_trace.paused_before_departure, true);

  for (const suppressed of [
    { forced_movement: true },
    { disengage_protected: true },
    { entering_reach_only: true },
    { before_proximity: PROXIMITY_STATES.NEARBY, after_proximity: PROXIMITY_STATES.ENGAGED },
  ]) {
    const result = createOpportunityAttackTriggerFromMovement({
      state: opened(),
      mover_participant_id: 'pc-1',
      before_proximity: suppressed.before_proximity ?? PROXIMITY_STATES.ENGAGED,
      after_proximity: suppressed.after_proximity ?? PROXIMITY_STATES.NEARBY,
      potential_reactors: [enemy()],
      ...suppressed,
    });
    assert.equal(result.status, 'no_trigger');
  }
});

test('6D.8 eligibility collection separates legal, rejected, player, deterministic, and GM/dev reasons', () => {
  const state = opened({
    participants: [
      actor(),
      enemy(),
      enemy({ participant_id: 'enemy-spent', display_name: 'Spent Bandit' }),
      enemy({ participant_id: 'enemy-blind', display_name: 'Blinded Bandit', can_perceive_target: false }),
      enemy({ participant_id: 'enemy-ranged', display_name: 'Ranged Bandit' }),
      ally(),
    ],
    reaction_resources: {
      'enemy-spent': createReactionResourceState({ participant_id: 'enemy-spent', reaction_available: false }),
    },
    reaction_definitions: [
      reactionDefinition(),
      reactionDefinition({
        reaction_id: 'ranged-reaction',
        player_name: 'Ranged Reaction',
        action_definition: reactionAttackAction({
          action_id: 'ranged-reaction',
          player_label: 'Ranged Reaction',
          authored_metadata: { attack_kind: 'ranged' },
        }),
      }),
      reactionDefinition({
        reaction_id: 'multiattack-reaction',
        player_name: 'Multiattack Reaction',
        action_definition: reactionAttackAction({
          action_id: 'multiattack-reaction',
          player_label: 'Multiattack Reaction',
          authored_metadata: { multiattack: true },
        }),
      }),
    ],
  });
  const trigger = opportunityTrigger(state, { potential_reactors: ['enemy-1', 'enemy-spent', 'enemy-blind', 'enemy-ranged', 'ally-1'] });
  const collection = collectEligibleReactions({ state, trigger });

  assert.equal(collection.legal_reactions.some((entry) => entry.reactor_participant_id === 'enemy-1'), true);
  assert.equal(collection.deterministic_reactions.some((entry) => entry.reactor_participant_id === 'enemy-1'), true);
  assert.equal(collection.player_reactions.length, 0);
  assert.equal(collection.rejected_candidates.some((entry) => entry.participant_id === 'enemy-spent' && entry.reasons.includes('reaction_already_spent')), true);
  assert.equal(collection.rejected_candidates.some((entry) => entry.participant_id === 'enemy-blind' && entry.reasons.includes('unable_to_perceive')), true);
  assert.equal(collection.rejected_candidates.some((entry) => entry.reaction_id === 'ranged-reaction' && entry.reasons.includes('ranged_attack_not_legal_for_opportunity_attack')), true);
  assert.equal(collection.rejected_candidates.some((entry) => entry.reaction_id === 'multiattack-reaction' && entry.reasons.includes('multiattack_not_legal_for_opportunity_attack')), true);
  assert.equal(collection.rejected_candidates.some((entry) => entry.participant_id === 'ally-1' && entry.reasons.includes('nonhostile_reactor')), true);
  assert.equal(collection.gm_dev_trace.legal_count > 0, true);
});

test('6D.8 queue ordering is deterministic and opens only one player reaction window', () => {
  const state = opened({
    participants: [actor(), enemy({ participant_id: 'enemy-1', control_mode: 'player', player_controlled: true }), enemy({ participant_id: 'enemy-2' })],
    reaction_definitions: [
      reactionDefinition({ reaction_id: 'slow-reaction', player_name: 'Slow Reaction', authored_priority: 20 }),
      reactionDefinition({ reaction_id: 'fast-reaction', player_name: 'Fast Reaction', authored_priority: 5 }),
    ],
  });
  const trigger = opportunityTrigger(state, {
    potential_reactors: ['enemy-1', 'enemy-2'],
    mandatory_effects: [{ effect_id: 'mandatory-before-reactions' }],
  });
  state.reaction_triggers ??= {};
  state.reaction_queues ??= {};
  state.reaction_triggers[trigger.trigger_id] = trigger;
  const collection = collectEligibleReactions({ state, trigger });
  const queue = createReactionQueue({ trigger, legal_reactions: collection.legal_reactions });
  assert.deepEqual(queue.entries.map((entry) => entry.phase), [
    REACTION_QUEUE_PHASES.MANDATORY,
    REACTION_QUEUE_PHASES.PLAYER,
    REACTION_QUEUE_PHASES.PLAYER,
    REACTION_QUEUE_PHASES.ENEMY,
    REACTION_QUEUE_PHASES.ENEMY,
    REACTION_QUEUE_PHASES.RESUME_PARENT,
  ]);
  assert.equal(queue.entries[1].reaction.reaction_id, 'fast-reaction');

  state.reaction_queues[queue.queue_id] = queue;
  const openedWindow = openPlayerReactionWindow({
    state,
    trigger,
    legal_reactions: collection.player_reactions,
    participant_id: 'enemy-1',
  });
  assert.equal(openedWindow.status, REACTION_WINDOW_STATUSES.OPEN);
  assert.equal(openedWindow.read_model.legal_reaction_options.length, 2);
  assertNoReactionPlayerHiddenData(openedWindow.read_model);

  const overlapping = openPlayerReactionWindow({
    state: openedWindow.state,
    trigger,
    legal_reactions: collection.player_reactions,
    participant_id: 'enemy-1',
  });
  assert.equal(overlapping.status, REACTION_WINDOW_STATUSES.RECOVERY_NEEDED);
  assert.equal(overlapping.gm_dev_trace.reason, 'overlapping_player_reaction_window_blocked');
});

test('6D.8 reaction preview is non-mutating and submit spends the reaction once with read model refresh', () => {
  const openedWindow = openEnemyReactionWindow();
  const beforeVersion = openedWindow.state.parent_turn.current_state_version;
  const beforeHp = openedWindow.state.participants.find((entry) => entry.participant_id === 'pc-1').current_hit_points;

  const preview = previewReaction({
    state: openedWindow.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    reaction_id: 'opportunity-strike',
  });
  assert.equal(preview.mutates_state, false);
  assert.equal(preview.rolls_generated, false);
  assert.equal(preview.source_state_version, beforeVersion);
  assert.equal(openedWindow.state.participants.find((entry) => entry.participant_id === 'pc-1').current_hit_points, beforeHp);

  const submitted = submitReaction({
    state: openedWindow.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    reaction_id: 'opportunity-strike',
    source_state_version: beforeVersion,
    idempotency_key: 'reaction-submit-1',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [4] },
  });

  assert.equal(submitted.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(submitted.committed, true);
  assert.equal(submitted.state.reaction_resources['enemy-1'].reaction_status, 'spent');
  assert.equal(submitted.state.parent_turn.status, PLAYER_TURN_STATUSES.OPEN);
  assert.equal(submitted.next_decision.next_decision_kind, REACTION_NEXT_DECISION_KINDS.RESUME_PARENT);
  assert.notEqual(submitted.resulting_state_version, beforeVersion);
  assert.equal(submitted.state.participants.find((entry) => entry.participant_id === 'pc-1').current_hit_points, beforeHp - 6);
  assert.equal(submitted.state.parent_turn.sub_resolutions.at(-1).timing_category, 'reaction');
  assertNoReactionPlayerHiddenData(submitted.read_model);
});

test('6D.8 duplicate, conflicting idempotency, stale, unavailable, decline, and timeout paths mutate safely', () => {
  let openedWindow = openEnemyReactionWindow();
  const first = submitReaction({
    state: openedWindow.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    reaction_id: 'opportunity-strike',
    source_state_version: openedWindow.reaction_window.source_state_version,
    idempotency_key: 'reaction-dup',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [4] },
  });
  const hpAfterFirst = first.state.participants.find((entry) => entry.participant_id === 'pc-1').current_hit_points;
  const duplicate = submitReaction({
    state: first.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    reaction_id: 'opportunity-strike',
    source_state_version: openedWindow.reaction_window.source_state_version,
    idempotency_key: 'reaction-dup',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 20, damage: [6] },
  });
  assert.equal(duplicate.status, COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED);
  assert.equal(duplicate.duplicate_of_sub_resolution_id, first.sub_resolution_id);
  assert.equal(first.state.participants.find((entry) => entry.participant_id === 'pc-1').current_hit_points, hpAfterFirst);

  const conflict = submitReaction({
    state: first.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    reaction_id: 'different-reaction',
    source_state_version: openedWindow.reaction_window.source_state_version,
    idempotency_key: 'reaction-dup',
  });
  assert.equal(conflict.status, 'idempotency_conflict');
  assert.equal(conflict.committed, false);

  openedWindow = openEnemyReactionWindow();
  const stale = submitReaction({
    state: openedWindow.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    reaction_id: 'opportunity-strike',
    source_state_version: 'old-version',
    idempotency_key: 'reaction-stale',
    roll_overrides: { attack: 20, damage: [6] },
  });
  assert.equal(stale.status, COMBAT_RESOLUTION_STATUSES.STALE);
  assert.equal(stale.committed, false);
  assert.equal(stale.state.reaction_resources['enemy-1'].reaction_status, 'available');

  const unavailable = submitReaction({
    state: openedWindow.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    reaction_id: 'not-real',
    source_state_version: openedWindow.reaction_window.source_state_version,
    idempotency_key: 'reaction-unavailable',
  });
  assert.equal(unavailable.status, COMBAT_RESOLUTION_STATUSES.UNAVAILABLE);

  openedWindow = openEnemyReactionWindow();
  const declined = declineReaction({
    state: openedWindow.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    idempotency_key: 'reaction-decline',
  });
  assert.equal(declined.status, 'declined');
  assert.equal(declined.state.reaction_resources['enemy-1'].reaction_status, 'available');
  assert.equal(declined.next_decision.next_decision_kind, REACTION_NEXT_DECISION_KINDS.RESUME_PARENT);

  openedWindow = openEnemyReactionWindow();
  const timedOut = applyReactionTimeoutDecline({
    state: openedWindow.state,
    reaction_window_id: openedWindow.reaction_window.reaction_window_id,
    idempotency_key: 'reaction-timeout',
  });
  assert.equal(timedOut.status, 'timed_out_declined');
  assert.equal(timedOut.state.reaction_resources['enemy-1'].reaction_status, 'available');
});

test('6D.8 automatic preferences use, decline, and ambiguous fallback stay deterministic', () => {
  let state = opened({
    participants: [actor(), enemy({ participant_id: 'enemy-1', control_mode: 'player', player_controlled: true })],
    reaction_preferences: {
      'enemy-1': {
        opportunity_attack: REACTION_PREFERENCE_VALUES.AUTOMATIC_DECLINE,
      },
    },
  });
  let trigger = opportunityTrigger(state, { potential_reactors: ['enemy-1'] });
  const declined = processReactionTrigger({ state, trigger });
  assert.equal(declined.status, 'declined');
  assert.equal(declined.state.active_reaction_window_id, null);
  assert.equal(declined.state.reaction_resources['enemy-1'].reaction_status, 'available');

  state = opened({
    participants: [actor(), enemy({ participant_id: 'enemy-1', control_mode: 'player', player_controlled: true })],
    reaction_preferences: {
      'enemy-1': {
        opportunity_attack: REACTION_PREFERENCE_VALUES.AUTOMATIC_USE_WHEN_LEGAL,
      },
    },
  });
  trigger = opportunityTrigger(state, { potential_reactors: ['enemy-1'] });
  const used = processReactionTrigger({
    state,
    trigger,
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [4] },
  });
  assert.equal(used.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(used.state.reaction_resources['enemy-1'].reaction_status, 'spent');

  state = opened({
    participants: [actor(), enemy({ participant_id: 'enemy-1', control_mode: 'player', player_controlled: true })],
    reaction_preferences: {
      'enemy-1': {
        opportunity_attack: REACTION_PREFERENCE_VALUES.AUTOMATIC_USE_WHEN_LEGAL,
      },
    },
    reaction_definitions: [
      reactionDefinition({ reaction_id: 'first-reaction', player_name: 'First Reaction', authored_priority: 10 }),
      reactionDefinition({
        reaction_id: 'second-reaction',
        player_name: 'Second Reaction',
        authored_priority: 10,
        action_definition: reactionAttackAction({ action_id: 'second-reaction', player_label: 'Second Reaction', action_level_costs: [{ resource_id: 'guard-token', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, amount: 1 }] }),
      }),
    ],
  });
  trigger = opportunityTrigger(state, { potential_reactors: ['enemy-1'] });
  const ask = processReactionTrigger({ state, trigger });
  assert.equal(ask.status, REACTION_WINDOW_STATUSES.OPEN);
  assert.equal(ask.reaction_window.applied_preference, REACTION_PREFERENCE_VALUES.AUTOMATIC_USE_WHEN_LEGAL);
  assert.equal(ask.read_model.legal_reaction_options.length, 2);
});

test('6D.8 deterministic non-player reactions revalidate, resolve in order, and then resume parent', () => {
  const state = opened({
    participants: [actor(), enemy({ participant_id: 'enemy-1', initiative_position: 20 }), enemy({ participant_id: 'enemy-2', initiative_position: 5 })],
    reaction_definitions: [
      reactionDefinition({ reaction_id: 'late-reaction', authored_priority: 20 }),
      reactionDefinition({ reaction_id: 'early-reaction', authored_priority: 5 }),
    ],
  });
  const trigger = opportunityTrigger(state, { potential_reactors: ['enemy-1', 'enemy-2'] });
  const resolved = resolveDeterministicReactions({
    state,
    trigger,
    roll_overrides: {
      'early-reaction': { attack: 18, damage: [1] },
      'late-reaction': { attack: 18, damage: [1] },
    },
    generation_origin: 'deterministic_test_override',
  });
  assert.equal(resolved.status, 'deterministic_reactions_resolved');
  assert.deepEqual(resolved.resolved_reactions.map((entry) => entry.reaction_id), ['early-reaction', 'early-reaction']);
  assert.equal(resolved.next_decision.next_decision_kind, REACTION_NEXT_DECISION_KINDS.RESUME_PARENT);
  assert.equal(resolved.state.parent_turn.status, PLAYER_TURN_STATUSES.OPEN);

  const invalidated = resolveDeterministicReactions({
    state: opened({
      participants: [actor({ defeated: true, current_hit_points: 0 }), enemy()],
    }),
    trigger: opportunityTrigger(opened(), { potential_reactors: ['enemy-1'] }),
  });
  assert.equal(invalidated.skipped_reactions.some((entry) => entry.reasons.includes('target_invalid')), true);
});

test('6D.8 parent continuation resumes without replay and terminates when reaction consequences defeat the actor', () => {
  let state = opened();
  const trigger = createOpportunityAttackTriggerFromMovement({
    state,
    mover_participant_id: 'pc-1',
    parent_sub_resolution_id: 'move-sub-1',
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
    potential_reactors: [enemy()],
  });
  const resumed = resumeParentResolution({ state: trigger.state, continuation_id: trigger.continuation.continuation_id });
  assert.equal(resumed.status, 'parent_resumed');
  assert.equal(resumed.next_decision.requires_continue_click, false);
  assert.equal(resumed.gm_dev_trace.prior_work_repeated, false);
  assert.equal(resumed.continuation.continuation_status, CONTINUATION_STATUSES.RESUMED);

  state = trigger.state;
  state.participants = state.participants.map((participant) =>
    participant.participant_id === 'pc-1'
      ? { ...participant, current_hit_points: 0, defeated: true }
      : participant
  );
  const terminated = resumeParentResolution({ state, continuation_id: trigger.continuation.continuation_id });
  assert.equal(terminated.status, 'parent_terminated');
  assert.equal(terminated.next_decision.next_decision_kind, REACTION_NEXT_DECISION_KINDS.PARENT_TERMINATED);
  assert.equal(terminated.state.parent_turn.status, PLAYER_TURN_STATUSES.CLOSED);
});

test('6D.8 nested reactions are rejected by default and allowed only for registered exceptions', () => {
  const rejected = processNestedReactionTrigger({
    outer_reaction_type: REACTION_TYPES.OPPORTUNITY_ATTACK,
    inner_reaction_type: REACTION_TYPES.DEFENSIVE,
    depth: 1,
  });
  assert.equal(rejected.status, 'nested_reaction_rejected');
  assert.equal(rejected.player_window_opened, false);

  const registry = createNestedReactionExceptionRegistry({
    max_depth: 1,
    enabled_exceptions: [{ outer_reaction_type: REACTION_TYPES.OPPORTUNITY_ATTACK, inner_reaction_type: REACTION_TYPES.DEFENSIVE }],
  });
  const allowed = processNestedReactionTrigger({
    registry,
    outer_reaction_type: REACTION_TYPES.OPPORTUNITY_ATTACK,
    inner_reaction_type: REACTION_TYPES.DEFENSIVE,
    depth: 1,
  });
  assert.equal(allowed.status, 'nested_reaction_exception_allowed');

  const tooDeep = processNestedReactionTrigger({
    registry,
    outer_reaction_type: REACTION_TYPES.OPPORTUNITY_ATTACK,
    inner_reaction_type: REACTION_TYPES.DEFENSIVE,
    depth: 2,
  });
  assert.equal(tooDeep.gm_dev_trace.reason, 'maximum_depth_exceeded');
});

test('6D.8 recovery-needed freezes ordinary reaction controls and preserves GM/dev diagnostics', () => {
  const recovery = enterReactionRecoveryNeeded({
    state: opened(),
    failed_step: 'after_reaction_roll_before_parent_resume',
    completed_facts: ['reaction_resource_spent', 'attack_roll_generated'],
    retry_safe: false,
  });
  assert.equal(recovery.status, COMBAT_RESOLUTION_STATUSES.RECOVERY_NEEDED);
  assert.equal(recovery.state.parent_turn.status, PLAYER_TURN_STATUSES.RECOVERY_NEEDED);
  assert.equal(recovery.read_model.reaction_state, 'recovery_needed');
  assert.equal(recovery.retry_safe, false);
  assert.deepEqual(recovery.gm_dev_trace.completed_facts_preserved, ['reaction_resource_spent', 'attack_roll_generated']);
  assertNoReactionPlayerHiddenData(recovery.read_model);
});

test('6D.8 player projection strips internals while GM/dev projection and trace retain them', () => {
  const openedWindow = openEnemyReactionWindow();
  const payload = {
    read_model: openedWindow.read_model,
    state: openedWindow.state,
    gm_dev_trace: {
      action_window_id: openedWindow.reaction_window.action_window_id,
      source_state_version: openedWindow.reaction_window.source_state_version,
      mutation_plan: [{ op: 'test' }],
      trace: { continuation_id: openedWindow.reaction_window.continuation_id },
    },
  };
  const player = projectReactionForPlayer(payload);
  const gm = projectReactionForGmDev(payload);
  const serializedPlayer = JSON.stringify(player);
  assert.equal(serializedPlayer.includes('gm_dev'), false);
  assert.equal(serializedPlayer.includes('mutation_plan'), false);
  assert.equal(serializedPlayer.includes('source_state_version'), false);
  assert.equal(serializedPlayer.includes('continuation_id'), false);
  assertNoReactionPlayerHiddenData(player);

  assert.equal(gm.gm_dev_trace.source_state_version, openedWindow.reaction_window.source_state_version);
  const trace = buildReactionGmDevTrace({ request: 'submit_reaction', payload });
  assert.equal(trace.trace_kind, 'combat_reaction_interrupt_runtime');

  const readModel = buildReactionPlayerReadModel({ state: openedWindow.state });
  assert.equal(readModel.reaction_state, 'waiting_for_player');
  assertNoReactionPlayerHiddenData(readModel);
});
