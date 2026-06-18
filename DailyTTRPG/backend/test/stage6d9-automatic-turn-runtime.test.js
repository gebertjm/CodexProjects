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
  createZoneTransition,
} from '../src/engine/combat/spatialMovement.js';
import {
  AUTOMATIC_CONTROL_MODES,
  AUTOMATIC_NEXT_DECISION_KINDS,
  RESOURCE_CONSERVATION_RULES,
  TACTICAL_CONDITION_TYPES,
  TACTICAL_OPERATION_CATEGORIES,
  TACTICAL_POSITIONING_SELECTORS,
  TACTICAL_PROFILE_SCOPES,
  TACTICAL_TARGET_SELECTORS,
  assertNoAutomaticPlayerHiddenData,
  buildAutomaticGmDevTrace,
  buildAutomaticTurnReadModel,
  createConservativeDefaultTacticalProfile,
  createTacticalProfile,
  evaluateResourceConservation,
  evaluateRetreatDecision,
  evaluateSurrenderDecision,
  evaluateTargetPreferences,
  executeAutomaticOperation,
  openAutomaticCombatTurn,
  orchestrateAutomaticTurns,
  projectAutomaticForGmDev,
  projectAutomaticForPlayer,
  resolveEffectiveTacticalProfile,
  selectDeterministicOperation,
} from '../src/engine/combat/automaticTurnRuntime.js';
import {
  DND5E_2014_RULESET,
  PLAYER_TURN_STATUSES,
  openPlayerCombatTurn,
} from '../src/engine/combat/playerTurnRuntime.js';
import {
  REACTION_PREFERENCE_VALUES,
  REACTION_TIMING_POINTS,
  REACTION_TRIGGER_TYPES,
  REACTION_TYPES,
  createReactionDefinition,
  createReactionResourceState,
} from '../src/engine/combat/reactionInterruptRuntime.js';
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

function participant(overrides = {}) {
  const id = overrides.participant_id ?? 'enemy-1';
  return {
    participant_id: id,
    display_name: overrides.display_name ?? id,
    faction: overrides.faction ?? 'enemy',
    control_mode: overrides.control_mode ?? AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY,
    current_zone_id: overrides.current_zone_id ?? 'road',
    size: CREATURE_SIZE_CATEGORIES.MEDIUM,
    speed: 30,
    speed_walk: 30,
    armor_class: overrides.armor_class ?? 12,
    current_hit_points: overrides.current_hit_points ?? 12,
    max_hit_points: overrides.max_hit_points ?? 12,
    temporary_hit_points: 0,
    active: overrides.active ?? true,
    defeated: overrides.defeated ?? false,
    can_be_perceived: overrides.can_be_perceived ?? true,
    hidden: overrides.hidden ?? false,
    turn_order: overrides.turn_order,
    initiative_position: overrides.initiative_position,
    relationships: overrides.relationships ?? [],
    ...overrides,
  };
}

function pc(overrides = {}) {
  return participant({
    participant_id: 'pc-1',
    display_name: 'Avery',
    faction: 'player',
    control_mode: AUTOMATIC_CONTROL_MODES.PLAYER,
    player_controlled: true,
    is_player_character: true,
    armor_class: 13,
    current_hit_points: 20,
    max_hit_points: 20,
    ...overrides,
  });
}

function enemy(overrides = {}) {
  return participant({
    participant_id: 'enemy-1',
    display_name: 'Training Bandit',
    faction: 'enemy',
    control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY,
    ...overrides,
  });
}

function ally(overrides = {}) {
  return participant({
    participant_id: 'ally-1',
    display_name: 'Lantern Guard',
    faction: 'player',
    control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ALLY,
    current_hit_points: 10,
    max_hit_points: 10,
    ...overrides,
  });
}

function scripted(overrides = {}) {
  return participant({
    participant_id: 'scripted-1',
    display_name: 'Clockwork Ward',
    faction: 'neutral',
    control_mode: AUTOMATIC_CONTROL_MODES.SCRIPTED,
    ...overrides,
  });
}

function action(action_id, timing_category = COMBAT_ACTION_TIMING_CATEGORIES.ACTION, overrides = {}) {
  return {
    action_id,
    player_label: overrides.player_label ?? action_id.replace(/-/g, ' '),
    ruleset: DND5E_2014_RULESET,
    timing_category,
    target_policy: overrides.target_policy ?? COMBAT_TARGET_POLICIES.NO_TARGET,
    action_level_costs: overrides.action_level_costs ?? [],
    authored_metadata: overrides.authored_metadata ?? {},
    effect_steps: overrides.effect_steps ?? [
      {
        step_id: 'marker',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER,
        player_summary: `${overrides.player_label ?? action_id} resolves.`,
      },
    ],
  };
}

function strikeAction(overrides = {}) {
  return action('basic-strike', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
    player_label: 'Basic Strike',
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
    effect_steps: [
      { step_id: 'attack', order: 1, effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        depends_on_step_id: 'attack',
        requires_outcome: { was_hit: true },
        params: {
          linked_attack_step_id: 'attack',
          components: [{ damage_type: 'slashing', dice_count: 1, dice_size: 6, flat_modifier: 1 }],
        },
      },
    ],
    ...overrides,
  });
}

function actions() {
  return [
    strikeAction(),
    action('special-rush', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
      player_label: 'Special Rush',
      target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
      action_level_costs: [{ resource_id: 'rush-use', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, amount: 1 }],
    }),
    action('bonus-guard', COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION, {
      player_label: 'Bonus Guard',
      target_policy: COMBAT_TARGET_POLICIES.SELF,
    }),
    action('signal-lantern', COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, {
      player_label: 'Signal Lantern',
      target_policy: COMBAT_TARGET_POLICIES.SELF,
    }),
    action('dodge', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
      player_label: 'Dodge',
      target_policy: COMBAT_TARGET_POLICIES.SELF,
      authored_metadata: { runtime_effect: 'dodge' },
    }),
  ];
}

function reactionAction(overrides = {}) {
  return {
    action_id: 'opportunity-strike',
    player_label: 'Opportunity Strike',
    ruleset: DND5E_2014_RULESET,
    timing_category: COMBAT_ACTION_TIMING_CATEGORIES.REACTION,
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
    authored_metadata: { attack_kind: 'melee' },
    effect_steps: [
      { step_id: 'attack', order: 1, effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        depends_on_step_id: 'attack',
        requires_outcome: { was_hit: true },
        params: {
          linked_attack_step_id: 'attack',
          components: [{ damage_type: 'slashing', dice_count: 1, dice_size: 4, flat_modifier: 1 }],
        },
      },
    ],
    ...overrides,
  };
}

function reactionDefinition(overrides = {}) {
  return createReactionDefinition({
    reaction_id: 'opportunity-strike',
    reaction_type: REACTION_TYPES.OPPORTUNITY_ATTACK,
    player_name: 'Opportunity Strike',
    trigger_type: REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK,
    timing_point: REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH,
    action_definition: reactionAction(),
    authored_priority: 10,
    preference_key: 'opportunity_attack',
    player_safe_description: 'Strike as the opponent leaves reach.',
    ...overrides,
  });
}

function tacticalProfile(overrides = {}) {
  return createTacticalProfile({
    profile_id: 'bandit-profile',
    scope: TACTICAL_PROFILE_SCOPES.PARTICIPANT,
    applies_to: { participant_id: 'enemy-1' },
    action_priorities: [
      {
        rule_id: 'use-basic-strike',
        order: 10,
        action_id: 'basic-strike',
        action_category: TACTICAL_OPERATION_CATEGORIES.ACTION,
        use_conditions: [{ type: TACTICAL_CONDITION_TYPES.ACTION_LEGAL }],
        target_selector: { selector: TACTICAL_TARGET_SELECTORS.ENGAGED_HOSTILE },
      },
      {
        rule_id: 'move-toward-hostile',
        order: 20,
        action_category: TACTICAL_OPERATION_CATEGORIES.MOVEMENT,
        target_selector: { selector: TACTICAL_TARGET_SELECTORS.NEAREST_VISIBLE_HOSTILE },
        positioning_requirement: { selector: TACTICAL_POSITIONING_SELECTORS.MOVE_TOWARD_TARGET, avoid_opportunity_risk: true },
      },
    ],
    safe_fallback: { fallback_id: 'fallback-dodge-wait-end', order: ['dodge', 'wait', 'end_turn'] },
    ...overrides,
  });
}

function baseState(overrides = {}) {
  const pcEnemy = relationship('pc-1', 'enemy-1', overrides.pc_enemy_proximity ?? PROXIMITY_STATES.ENGAGED);
  const pcAlly = relationship('pc-1', 'ally-1', PROXIMITY_STATES.NEARBY);
  const enemyTwo = relationship('pc-1', 'enemy-2', PROXIMITY_STATES.NEARBY);
  const participants = overrides.participants ?? [
    pc({ relationships: [pcEnemy, pcAlly, enemyTwo], turn_order: 3 }),
    enemy({ relationships: [pcEnemy], turn_order: 1 }),
    ally({ relationships: [pcAlly], turn_order: 2 }),
  ];
  return {
    combat: {
      combat_id: 'combat-6d9',
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 1,
      initiative_position: 1,
      current_participant_id: overrides.current_participant_id ?? 'enemy-1',
      encounter_title: 'Neutral Automatic Encounter',
      scripted_phase: overrides.scripted_phase,
      ...(overrides.combat ?? {}),
    },
    current_participant_id: overrides.current_participant_id ?? 'enemy-1',
    participants,
    actions: overrides.actions ?? actions(),
    resources: overrides.resources ?? [
      { resource_id: 'rush-use', label: 'Rush Use', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, owner_ref: 'enemy-1', current: 1, maximum: 1 },
    ],
    conditions: overrides.conditions ?? [],
    spatial: {
      participants: overrides.spatial?.participants ?? participants.map((entry) => ({
        participant_id: entry.participant_id,
        current_zone_id: entry.current_zone_id ?? 'road',
        size: CREATURE_SIZE_CATEGORIES.MEDIUM,
        speed: 30,
        relationships: entry.relationships ?? [],
      })),
      zones: overrides.spatial?.zones ?? [{ zone_id: 'road' }, { zone_id: 'shrine' }, { zone_id: 'ditch' }, { zone_id: 'exit' }],
      transitions: overrides.spatial?.transitions ?? [
        createZoneTransition({ transition_id: 'road-to-shrine', source_zone_id: 'road', destination_zone_id: 'shrine', base_cost: 10 }),
        createZoneTransition({ transition_id: 'road-to-ditch', source_zone_id: 'road', destination_zone_id: 'ditch', base_cost: 10, known_risks: ['opportunity_attack'], provokes_opportunity_attack: true }),
        createZoneTransition({ transition_id: 'road-to-exit', source_zone_id: 'road', destination_zone_id: 'exit', base_cost: 15, retreat_route_id: 'visible-exit' }),
      ],
    },
    faction_relationships: overrides.faction_relationships ?? [
      { faction_a: 'enemy', faction_b: 'player', relationship: 'hostile' },
      { faction_a: 'player', faction_b: 'enemy', relationship: 'hostile' },
      { faction_a: 'neutral', faction_b: 'player', relationship: 'neutral' },
    ],
    encounter_flags: overrides.encounter_flags ?? {},
    tactical_profiles: overrides.tactical_profiles ?? [tacticalProfile()],
    reaction_definitions: overrides.reaction_definitions ?? [reactionDefinition()],
    reaction_resources: overrides.reaction_resources ?? {
      'pc-1': createReactionResourceState({ participant_id: 'pc-1', reaction_available: true }),
    },
    reaction_preferences: overrides.reaction_preferences ?? {},
    ...(overrides.rest ?? {}),
  };
}

function opened(overrides = {}) {
  return openAutomaticCombatTurn(baseState(overrides)).state;
}

test('6D.9 tactical profiles are declarative, ruleset-aware, and resolve by precedence with provenance', () => {
  assert.throws(() => createTacticalProfile({ profile_id: 'bad', action_priorities: [{ use: () => true }] }), /Executable tactical profile/);
  const defaultProfile = createConservativeDefaultTacticalProfile();
  assert.equal(defaultProfile.ruleset_id, 'dnd5e-2014');
  assert.equal(defaultProfile.resource_conservation_rules.some((rule) => rule.rule === RESOURCE_CONSERVATION_RULES.NEVER_USE), true);

  const state = baseState({
    tactical_profiles: [
      createTacticalProfile({
        profile_id: 'faction-profile',
        scope: TACTICAL_PROFILE_SCOPES.FACTION,
        applies_to: { faction: 'enemy' },
        action_priorities: [{ rule_id: 'faction-wait', order: 10, action_category: TACTICAL_OPERATION_CATEGORIES.WAIT }],
      }),
      tacticalProfile({ profile_id: 'participant-profile' }),
      createTacticalProfile({
        profile_id: 'override-profile',
        scope: TACTICAL_PROFILE_SCOPES.ENCOUNTER_SCRIPTED_OVERRIDE,
        applies_to: { participant_id: 'enemy-1' },
        scripted_overrides: [{ override_id: 'scripted-strike', active: true, action_id: 'basic-strike', target_id: 'pc-1' }],
      }),
    ],
  });
  const resolved = resolveEffectiveTacticalProfile({ state, actor: state.participants.find((entry) => entry.participant_id === 'enemy-1') });
  assert.equal(resolved.effective_profile.field_provenance.action_priorities.profile_id, 'participant-profile');
  assert.equal(resolved.effective_profile.field_provenance.scripted_overrides.profile_id, 'override-profile');
  assert.equal(resolved.selected_profiles.faction, 'faction-profile');
});

test('6D.9 target selection is faction-aware, stable, and does not use hidden participants', () => {
  const state = baseState({
    participants: [
      pc({ participant_id: 'pc-2', display_name: 'Hidden Avery', hidden: true }),
      pc({ participant_id: 'pc-1', display_name: 'Avery' }),
      enemy(),
      participant({ participant_id: 'neutral-1', faction: 'neutral', display_name: 'Bystander' }),
    ],
  });
  const openedState = openAutomaticCombatTurn(state).state;
  const selected = evaluateTargetPreferences({
    context: undefined,
    state: openedState,
    target_selector: { selector: TACTICAL_TARGET_SELECTORS.NEAREST_VISIBLE_HOSTILE },
  });
  assert.equal(selected.target_id, 'pc-1');
  assert.equal(selected.considered_target_ids.includes('pc-2'), false);
  assert.equal(selected.considered_target_ids.includes('neutral-1'), false);
});

test('6D.9 resource conservation blocks limited resources unless authored rules permit them', () => {
  const state = opened();
  const blocked = evaluateResourceConservation({ state, action_id: 'special-rush', profile: tacticalProfile() });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'limited_resource_requires_authored_permission');

  const permittedProfile = tacticalProfile({
    resource_conservation_rules: [{ rule: RESOURCE_CONSERVATION_RULES.ALLOW_SPEND, resource_id: 'rush-use' }],
  });
  const allowed = evaluateResourceConservation({ state, action_id: 'special-rush', profile: permittedProfile });
  assert.equal(allowed.allowed, true);

  const preserve = evaluateResourceConservation({
    state,
    action_id: 'special-rush',
    profile: tacticalProfile({
      resource_conservation_rules: [{ rule: RESOURCE_CONSERVATION_RULES.PRESERVE_FINAL_USE, resource_id: 'rush-use' }],
    }),
  });
  assert.equal(preserve.allowed, false);
  assert.equal(preserve.reason, 'preserve_final_use_rule');
});

test('6D.9 ordered priorities, scripted overrides, and fallback selection are deterministic', () => {
  let state = opened();
  let selection = selectDeterministicOperation({ state });
  assert.equal(selection.operation.action_id, 'basic-strike');
  assert.equal(selection.operation.target_id, 'pc-1');

  state = opened({
    scripted_phase: 'alarm',
    tactical_profiles: [
      tacticalProfile({
        scripted_overrides: [{ override_id: 'alarm-signal', phase_id: 'alarm', action_id: 'signal-lantern', target_id: 'enemy-1' }],
      }),
    ],
  });
  selection = selectDeterministicOperation({ state });
  assert.equal(selection.operation.selection_reason, 'scripted_override');
  assert.equal(selection.operation.action_id, 'signal-lantern');

  state = opened({
    actions: [action('dodge', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, { player_label: 'Dodge', target_policy: COMBAT_TARGET_POLICIES.SELF, authored_metadata: { runtime_effect: 'dodge' } })],
    tactical_profiles: [createConservativeDefaultTacticalProfile()],
  });
  selection = selectDeterministicOperation({ state });
  assert.equal(selection.operation.fallback, true);
  assert.equal(selection.operation.action_id, 'dodge');
});

test('6D.9 retreat and surrender require explicit thresholds and narrative permission', () => {
  const profile = tacticalProfile({
    retreat_thresholds: [{ threshold_id: 'low-hp-retreat', hit_point_percent_at_or_below: 0.35 }],
    surrender_thresholds: [{ threshold_id: 'low-hp-surrender', hit_point_percent_at_or_below: 0.25, requires_permission_flag: 'bandit_can_surrender' }],
  });
  let state = opened({
    participants: [pc(), enemy({ current_hit_points: 3, max_hit_points: 12 })],
    tactical_profiles: [profile],
  });
  let retreat = evaluateRetreatDecision({ state, profile });
  assert.equal(retreat.status, 'retreat_selected');
  assert.equal(retreat.operation.destination_zone_id, 'exit');
  let surrender = evaluateSurrenderDecision({ state, profile });
  assert.equal(surrender.status, 'surrender_not_permitted');

  state = opened({
    participants: [pc(), enemy({ current_hit_points: 2, max_hit_points: 12 })],
    tactical_profiles: [profile],
    encounter_flags: { bandit_can_surrender: true },
  });
  surrender = evaluateSurrenderDecision({ state, profile });
  assert.equal(surrender.status, 'surrender_intent_selected');
  assert.equal(surrender.operation.operation_category, TACTICAL_OPERATION_CATEGORIES.SURRENDER_INTENT);
});

test('6D.9 automatic turn opening supports enemy ally and scripted modes but stops for players', () => {
  let openedTurn = openAutomaticCombatTurn(baseState());
  assert.equal(openedTurn.status, 'opened');
  assert.equal(openedTurn.state.parent_turn.actor_participant_id, 'enemy-1');
  assert.equal(openedTurn.state.parent_turn.status, PLAYER_TURN_STATUSES.OPEN);
  assert.equal(openedTurn.gm_dev_trace.start_of_turn_hooks.includes('reaction_refresh'), true);

  openedTurn = openAutomaticCombatTurn(baseState({ current_participant_id: 'ally-1' }));
  assert.equal(openedTurn.status, 'opened');
  assert.equal(openedTurn.state.parent_turn.actor_participant_id, 'ally-1');

  openedTurn = openAutomaticCombatTurn(baseState({ current_participant_id: 'scripted-1', participants: [pc(), scripted({ turn_order: 1 }), enemy({ turn_order: 2 })] }));
  assert.equal(openedTurn.status, 'opened');
  assert.equal(openedTurn.state.parent_turn.actor_participant_id, 'scripted-1');

  const playerStop = openAutomaticCombatTurn(baseState({ current_participant_id: 'pc-1' }));
  assert.equal(playerStop.status, 'player_or_gm_turn_required');
  assert.equal(playerStop.next_decision.next_decision_kind, AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED);
});

test('6D.9 automatic operations use the incremental turn runtime and remain duplicate and stale safe', () => {
  let state = opened();
  const first = executeAutomaticOperation({
    state,
    operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.ACTION, action_id: 'basic-strike', target_id: 'pc-1' },
    idempotency_key: 'auto-strike',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [4] },
  });
  assert.equal(first.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(first.state.parent_turn.action_spent, true);
  const hpAfter = first.state.participants.find((entry) => entry.participant_id === 'pc-1').current_hit_points;

  const duplicate = executeAutomaticOperation({
    state: first.state,
    operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.ACTION, action_id: 'basic-strike', target_id: 'pc-1' },
    idempotency_key: 'auto-strike',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 20, damage: [6] },
  });
  assert.equal(duplicate.status, COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED);
  assert.equal(first.state.participants.find((entry) => entry.participant_id === 'pc-1').current_hit_points, hpAfter);

  state = opened();
  const stale = executeAutomaticOperation({
    state,
    operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.ACTION, action_id: 'basic-strike', target_id: 'pc-1', source_state_version: 'old-version' },
    idempotency_key: 'auto-stale',
    roll_overrides: { attack: 20, damage: [6] },
  });
  assert.equal(stale.status, COMBAT_RESOLUTION_STATUSES.STALE);
  assert.equal(stale.committed, false);
  assert.equal(stale.state.parent_turn.action_spent, false);
});

test('6D.9 movement bonus object Wait and End Turn operations preserve turn semantics', () => {
  let state = opened({ pc_enemy_proximity: PROXIMITY_STATES.NEARBY });
  const moved = executeAutomaticOperation({
    state,
    operation: {
      operation_category: TACTICAL_OPERATION_CATEGORIES.MOVEMENT,
      destination_zone_id: 'shrine',
      selected_transition_ids: ['road-to-shrine'],
    },
  });
  assert.equal(moved.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(moved.state.parent_turn.movement_spent, 10);
  assert.equal(moved.state.parent_turn.action_spent, false);
  state = moved.state;

  const bonus = executeAutomaticOperation({
    state,
    operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.BONUS_ACTION, action_id: 'bonus-guard', target_id: 'enemy-1' },
  });
  assert.equal(bonus.state.parent_turn.bonus_action_spent, true);
  state = bonus.state;

  const object = executeAutomaticOperation({
    state,
    operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.OBJECT_INTERACTION, action_id: 'signal-lantern', target_id: 'enemy-1' },
  });
  assert.equal(object.state.parent_turn.object_interaction_spent, true);
  state = object.state;

  const waited = executeAutomaticOperation({ state, operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.WAIT } });
  assert.equal(waited.state.parent_turn.action_spent, true);
  state = waited.state;

  const ended = executeAutomaticOperation({ state, operation: { operation_category: TACTICAL_OPERATION_CATEGORIES.END_TURN } });
  assert.equal(ended.state.parent_turn.status, PLAYER_TURN_STATUSES.CLOSED);
  assert.equal(ended.next_decision.requires_continue_click, false);
});

test('6D.9 automatic movement pauses for player reactions and can resume without a Continue click', () => {
  const state = opened({
    reaction_preferences: { 'pc-1': { opportunity_attack: REACTION_PREFERENCE_VALUES.ASK } },
  });
  const result = executeAutomaticOperation({
    state,
    operation: {
      operation_category: TACTICAL_OPERATION_CATEGORIES.MOVEMENT,
      destination_zone_id: 'ditch',
      selected_transition_ids: ['road-to-ditch'],
      before_proximity: PROXIMITY_STATES.ENGAGED,
      after_proximity: PROXIMITY_STATES.NEARBY,
    },
    potential_reactors: [pc()],
  });
  assert.equal(result.next_decision.next_decision_kind, AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED);
  assert.equal(result.next_decision.requires_continue_click, false);
  assert.equal(result.state.active_reaction_window_id !== null, true);
  assert.equal(result.player_safe_events.some((event) => event.event_type === 'reaction_interrupt'), true);
});

test('6D.9 automatic orchestration chains enemy and ally turns until the player turn', () => {
  const result = orchestrateAutomaticTurns({
    state: baseState({
      participants: [
        pc({ turn_order: 3 }),
        enemy({ participant_id: 'enemy-1', turn_order: 1 }),
        ally({ participant_id: 'ally-1', turn_order: 2 }),
      ],
      tactical_profiles: [
        tacticalProfile({ profile_id: 'enemy-profile', applies_to: { participant_id: 'enemy-1' } }),
        createTacticalProfile({
          profile_id: 'ally-profile',
          scope: TACTICAL_PROFILE_SCOPES.PARTICIPANT,
          applies_to: { participant_id: 'ally-1' },
          action_priorities: [{
            rule_id: 'ally-protects-player',
            order: 10,
            action_id: 'basic-strike',
            action_category: TACTICAL_OPERATION_CATEGORIES.ACTION,
            use_conditions: [{ type: TACTICAL_CONDITION_TYPES.ACTION_LEGAL }],
            target_selector: { selector: TACTICAL_TARGET_SELECTORS.PROTECT_ALLY_ENGAGED_WITH_HOSTILE },
          }],
          safe_fallback: { fallback_id: 'ally-fallback', order: ['dodge', 'wait', 'end_turn'] },
        }),
      ],
    }),
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 3, damage: [1] },
  });
  assert.equal(result.next_decision.next_decision_kind, AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED);
  assert.equal(result.next_decision.requires_continue_click, false);
  assert.equal(result.state.combat.current_participant_id, 'pc-1');
  assert.equal(result.player_safe_events.some((event) => event.actor.participant_id === 'ally-1'), true);
  assert.equal(JSON.stringify(result).includes('choose ally action'), false);
});

test('6D.9 loop guards and recovery freeze automatic controls without replaying facts', () => {
  const result = orchestrateAutomaticTurns({
    state: baseState({
      tactical_profiles: [createTacticalProfile({
        profile_id: 'loop-profile',
        scope: TACTICAL_PROFILE_SCOPES.PARTICIPANT,
        applies_to: { participant_id: 'enemy-1' },
        action_priorities: [{ rule_id: 'wait-forever', order: 1, action_category: TACTICAL_OPERATION_CATEGORIES.WAIT }],
        safe_fallback: { fallback_id: 'wait-loop', order: ['wait'] },
      })],
    }),
    max_operations: 1,
  });
  assert.equal(result.status, COMBAT_RESOLUTION_STATUSES.RECOVERY_NEEDED);
  assert.equal(result.next_decision.next_decision_kind, AUTOMATIC_NEXT_DECISION_KINDS.RECOVERY_NEEDED);
  assert.equal(result.retry_safe, false);
  assertNoAutomaticPlayerHiddenData(result.player_safe_events);
});

test('6D.9 player-safe event and read-model projections strip tactical internals while GM/dev retains them', () => {
  const result = orchestrateAutomaticTurns({
    state: baseState(),
    max_automatic_turns: 1,
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 18, damage: [2] },
  });
  const player = projectAutomaticForPlayer(result);
  const gm = projectAutomaticForGmDev(result);
  const readModel = buildAutomaticTurnReadModel({ state: result.state });
  assertNoAutomaticPlayerHiddenData(player);
  assertNoAutomaticPlayerHiddenData(readModel);
  assert.equal(JSON.stringify(player).includes('tactical_profile'), false);
  assert.equal(JSON.stringify(player).includes('armor_class'), false);
  assert.equal(JSON.stringify(player).includes('gm_dev'), false);
  assert.equal(gm.gm_dev_trace.trace_kind, 'combat_automatic_turn_runtime');
  const trace = buildAutomaticGmDevTrace({ selected_profile: 'bandit-profile', priorities_considered: ['use-basic-strike'] });
  assert.equal(trace.trace_kind, 'combat_automatic_turn_runtime');
});

test('6D.9 player-controlled combat turns still use the 6D.7 player runtime and are not automated', () => {
  const state = baseState({ current_participant_id: 'pc-1' });
  const chain = orchestrateAutomaticTurns({ state });
  assert.equal(chain.next_decision.next_decision_kind, AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED);
  const playerTurn = openPlayerCombatTurn(state);
  assert.equal(playerTurn.status, 'opened');
  assert.equal(playerTurn.state.parent_turn.actor_participant_id, 'pc-1');
});
