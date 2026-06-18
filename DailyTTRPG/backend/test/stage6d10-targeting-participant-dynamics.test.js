import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMBAT_EFFECT_TYPES,
  COMBAT_TARGET_POLICIES,
} from '../src/engine/combat/actionEffectResourceFramework.js';
import {
  DND5E_2014_RULESET,
  ROLL_GENERATION_ORIGINS,
  SAVE_SUCCESS_POLICIES,
} from '../src/engine/combat/rulesResolution.js';
import {
  AUTOMATIC_CONTROL_MODES,
} from '../src/engine/combat/automaticTurnRuntime.js';
import {
  ALLY_CONFIRMATION_POLICIES,
  DAMAGE_ROLL_POLICIES,
  HIDDEN_PARTICIPANT_POLICIES,
  TARGET_INCLUSION_POLICIES,
  TARGET_SET_LOCK_POLICIES,
  assertNoMultiTargetPlayerHiddenData,
  buildAuthoritativeTargetCandidates,
  buildPlayerVisibleTargetCandidates,
  buildTargetPreview,
  buildTargetingGmDevTrace,
  createTargetInclusionPolicy,
  createTargetSetLock,
  evaluateAllyInclusionConfirmation,
  processFactionChange,
  processParticipantEntry,
  processParticipantExit,
  processParticipantReEntry,
  projectMultiTargetResultForPlayer,
  projectParticipantDynamicsForPlayer,
  rebuildDynamicCombatContexts,
  reevaluateEncounterCompletion,
  resolveMultiTargetCombatAction,
  resolveMultiattack,
  validateActionTargetInclusionPolicy,
  validateSelectedTargets,
  validateTargetSetLock,
} from '../src/engine/combat/targetingParticipantDynamics.js';
import {
  COMBAT_RESOLUTION_STATUSES,
} from '../src/services/interactionCore/combatAdapterContract.js';

const origin = ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE;

function participant(overrides = {}) {
  const id = overrides.participant_id ?? 'pc-1';
  return {
    participant_id: id,
    display_name: overrides.display_name ?? id,
    faction: overrides.faction ?? 'player',
    control_mode: overrides.control_mode ?? AUTOMATIC_CONTROL_MODES.PLAYER,
    player_controlled: overrides.player_controlled ?? overrides.faction === 'player',
    is_player_character: overrides.is_player_character ?? overrides.faction === 'player',
    current_zone_id: overrides.current_zone_id ?? 'road',
    target_group_ids: overrides.target_group_ids ?? ['road-group'],
    current_hit_points: overrides.current_hit_points ?? 20,
    max_hit_points: overrides.max_hit_points ?? 20,
    temporary_hit_points: overrides.temporary_hit_points ?? 0,
    armor_class: overrides.armor_class ?? 13,
    dexterity_modifier: overrides.dexterity_modifier ?? 1,
    active: overrides.active ?? true,
    hidden: overrides.hidden ?? false,
    can_be_perceived: overrides.can_be_perceived ?? true,
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
    ...overrides,
  });
}

function ally(overrides = {}) {
  return participant({
    participant_id: 'ally-1',
    display_name: 'Lantern Guard',
    faction: 'player',
    control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ALLY,
    player_controlled: false,
    is_player_character: false,
    ...overrides,
  });
}

function enemy(id = 'enemy-1', overrides = {}) {
  return participant({
    participant_id: id,
    display_name: id,
    faction: 'enemy',
    control_mode: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY,
    player_controlled: false,
    is_player_character: false,
    armor_class: overrides.armor_class ?? 12,
    current_hit_points: overrides.current_hit_points ?? 12,
    max_hit_points: overrides.max_hit_points ?? 12,
    ...overrides,
  });
}

function neutral(overrides = {}) {
  return participant({
    participant_id: 'neutral-1',
    display_name: 'Bystander',
    faction: 'neutral',
    control_mode: AUTOMATIC_CONTROL_MODES.SCRIPTED,
    player_controlled: false,
    is_player_character: false,
    ...overrides,
  });
}

function baseState(overrides = {}) {
  const participants = overrides.participants ?? [
    pc({ initiative_total: 16, turn_order: 1, initiative_position: 1 }),
    enemy('enemy-1', { initiative_total: 12, turn_order: 2, initiative_position: 2 }),
    ally({ initiative_total: 10, turn_order: 3, initiative_position: 3 }),
  ];
  return {
    combat: {
      combat_id: 'combat-6d10',
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 2,
      initiative_position: overrides.initiative_position ?? 1,
      current_participant_id: overrides.current_participant_id ?? 'pc-1',
      encounter_title: 'Neutral Targeting Encounter',
      ...(overrides.combat ?? {}),
    },
    current_participant_id: overrides.current_participant_id ?? 'pc-1',
    participants,
    faction_relationships: overrides.faction_relationships ?? [
      { faction_a: 'player', faction_b: 'enemy', relationship: 'hostile' },
      { faction_a: 'enemy', faction_b: 'player', relationship: 'hostile' },
      { faction_a: 'player', faction_b: 'neutral', relationship: 'neutral' },
      { faction_a: 'neutral', faction_b: 'enemy', relationship: 'neutral' },
    ],
    spatial: {
      participants: participants.map((entry) => ({
        participant_id: entry.participant_id,
        current_zone_id: entry.current_zone_id ?? 'road',
      })),
      zones: [{ zone_id: 'road' }, { zone_id: 'shrine' }],
    },
    participant_revision: overrides.participant_revision ?? 'participants-v1',
    faction_revision: overrides.faction_revision ?? 'factions-v1',
    parent_turn: overrides.parent_turn ?? {
      parent_turn_id: 'turn:pc-1',
      actor_participant_id: 'pc-1',
      status: 'open',
      current_state_version: 'turn-v1',
    },
    authored_reentry_permissions: overrides.authored_reentry_permissions ?? [],
    ...(overrides.rest ?? {}),
  };
}

function policy(policy_id, overrides = {}) {
  return {
    policy_id,
    ruleset: DND5E_2014_RULESET,
    min_targets: overrides.min_targets ?? 0,
    max_targets: overrides.max_targets,
    target_group: overrides.target_group,
    visibility_required: overrides.visibility_required,
    hidden_participant_policy: overrides.hidden_participant_policy,
    ally_confirmation_policy: overrides.ally_confirmation_policy,
    actor_inclusion: overrides.actor_inclusion,
    target_set_lock_policy: overrides.target_set_lock_policy,
    authored_filter: overrides.authored_filter,
    player_safe_description: overrides.player_safe_description ?? 'Choose targets.',
  };
}

function strikeAction(overrides = {}) {
  return {
    action_id: overrides.action_id ?? 'sweeping-strike',
    action_name: overrides.action_name ?? 'Sweeping Strike',
    player_label: overrides.player_label ?? 'Sweeping Strike',
    ruleset: DND5E_2014_RULESET,
    target_policy: COMBAT_TARGET_POLICIES.SELECTED_TARGETS_UP_TO_LIMIT,
    target_inclusion_policy: policy(TARGET_INCLUSION_POLICIES.SELECTED_CREATURES_UP_TO_LIMIT, {
      min_targets: 1,
      max_targets: overrides.max_targets ?? 2,
      visibility_required: true,
      authored_filter: { relationships: ['hostile'] },
      ...overrides.target_inclusion_policy,
    }),
    effect_steps: [
      {
        step_id: 'attack',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL,
        params: { modifiers: [{ source_id: 'attack-mod', source_type: 'ability_modifier', value: 5 }] },
      },
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
    authored_metadata: overrides.authored_metadata ?? {},
  };
}

function areaAction(overrides = {}) {
  return {
    action_id: 'ember-burst',
    action_name: 'Ember Burst',
    player_label: 'Ember Burst',
    ruleset: DND5E_2014_RULESET,
    target_policy: COMBAT_TARGET_POLICIES.AUTHORED_TARGET_GROUP,
    target_inclusion_policy: policy(TARGET_INCLUSION_POLICIES.ALL_CREATURES_IN_TARGET_GROUP, {
      min_targets: 0,
      target_group: { group_type: 'zone', zone_id: 'road' },
      visibility_required: false,
      hidden_participant_policy: HIDDEN_PARTICIPANT_POLICIES.INCLUDE_AUTHORITATIVE,
      ally_confirmation_policy: ALLY_CONFIRMATION_POLICIES.VISIBLE_ALLY_OR_NON_HOSTILE,
      player_safe_description: 'Affects creatures in the chosen area.',
      ...overrides.target_inclusion_policy,
    }),
    effect_steps: [
      {
        step_id: 'save',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.SAVING_THROW,
        params: {
          ability: 'DEX',
          difficulty_class: 13,
          success_policy: SAVE_SUCCESS_POLICIES.HALF_DAMAGE_ON_SUCCESS,
        },
      },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        params: {
          linked_save_step_id: 'save',
          components: [{ damage_type: 'fire', dice_count: 2, dice_size: 6 }],
        },
      },
    ],
    authored_metadata: { damage_roll_policy: DAMAGE_ROLL_POLICIES.SHARED_FOR_TARGET_SET },
  };
}

test('6D.10 target-inclusion policies are explicit, ruleset-aware, and cover all required identifiers', () => {
  for (const policy_id of Object.values(TARGET_INCLUSION_POLICIES)) {
    const created = createTargetInclusionPolicy(policy(policy_id));
    assert.equal(created.policy_id, policy_id);
    assert.equal(created.ruleset.system, 'dnd5e');
    assert.equal(created.ruleset.rules_version, '2014');
  }

  assert.throws(
    () => validateActionTargetInclusionPolicy({ action_id: 'implicit-targeting' }),
    /must define target_inclusion_policy/
  );
  assert.throws(
    () => createTargetInclusionPolicy({ policy_id: 'not_a_policy' }),
    /explicit supported target-inclusion policy/
  );
});

test('6D.10 authoritative and player-visible target sets remain distinct for concealed area participants', () => {
  const state = baseState({
    participants: [
      pc(),
      enemy('enemy-1'),
      enemy('enemy-hidden', { hidden: true, can_be_perceived: false, current_zone_id: 'road' }),
      ally(),
      neutral(),
    ],
  });
  const action = areaAction();
  const authoritative = buildAuthoritativeTargetCandidates({ state, action, actor_id: 'pc-1' });
  assert.deepEqual(authoritative.target_ids.sort(), ['ally-1', 'enemy-1', 'enemy-hidden', 'neutral-1', 'pc-1'].sort());
  assert.deepEqual(authoritative.gm_dev_trace.concealed_candidate_ids, ['enemy-hidden']);

  const visible = buildPlayerVisibleTargetCandidates({ state, actor_id: 'pc-1', authoritative_target_set: authoritative });
  assert.deepEqual(visible.visible_candidates.map((entry) => entry.participant_id).sort(), ['ally-1', 'enemy-1', 'neutral-1', 'pc-1'].sort());
  assertNoMultiTargetPlayerHiddenData(visible);

  const preview = buildTargetPreview({ state, action, actor_id: 'pc-1' });
  assert.equal(preview.mutates_state, false);
  assert.equal(preview.rolls_generated, false);
  assert.equal(JSON.stringify(preview).includes('enemy-hidden'), false);
});

test('6D.10 selected-target validation enforces limits uniqueness legality and visible ally confirmation', () => {
  const state = baseState({ participants: [pc(), enemy('enemy-1'), enemy('enemy-2'), ally()] });
  const action = strikeAction({ max_targets: 2 });
  const authoritative = buildAuthoritativeTargetCandidates({ state, action, actor_id: 'pc-1' });
  assert.deepEqual(authoritative.target_ids.sort(), ['enemy-1', 'enemy-2'].sort());

  assert.equal(validateSelectedTargets({ authoritative_target_set: authoritative, selected_target_ids: ['enemy-1', 'enemy-1'] }).valid, false);
  assert.equal(validateSelectedTargets({ authoritative_target_set: authoritative, selected_target_ids: ['enemy-1', 'ally-1'] }).reason, 'target_not_legal');
  assert.equal(validateSelectedTargets({ authoritative_target_set: authoritative, selected_target_ids: ['enemy-1', 'enemy-2'] }).valid, true);

  const area = areaAction();
  const confirmation = evaluateAllyInclusionConfirmation({
    state,
    actor_id: 'pc-1',
    action: area,
    targets: [pc(), enemy('enemy-1'), ally(), enemy('enemy-hidden', { hidden: true, can_be_perceived: false })],
  });
  assert.equal(confirmation.required, true);
  assert.deepEqual(confirmation.visible_included.map((entry) => entry.participant_id).sort(), ['ally-1'].sort());
  assert.equal(JSON.stringify(confirmation).includes('enemy-hidden'), false);
});

test('6D.10 attack-based multi-target actions roll and apply damage separately per target by default', () => {
  const state = baseState({
    participants: [
      pc(),
      enemy('enemy-1', { armor_class: 12, current_hit_points: 10, defense_profile: { resistances: ['slashing'] } }),
      enemy('enemy-2', { armor_class: 18, current_hit_points: 10 }),
    ],
  });
  const result = resolveMultiTargetCombatAction({
    state,
    action: strikeAction({ max_targets: 2 }),
    actor_id: 'pc-1',
    selected_target_ids: ['enemy-1', 'enemy-2'],
    idempotency_key: 'sweeping-strike-1',
    source_state_version: 'turn-v1',
    generation_origin: origin,
    roll_overrides: {
      attack: { 'enemy-1': 10, 'enemy-2': 13 },
      damage: { 'enemy-1': [5], 'enemy-2': [3] },
    },
  });
  assert.equal(result.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(result.target_outcomes.length, 2);
  assert.equal(result.target_outcomes[0].attack_result.roll_record.roll_id !== result.target_outcomes[1].attack_result.roll_record.roll_id, true);
  assert.equal(result.target_outcomes.find((entry) => entry.target.participant_id === 'enemy-1').applied_damage, 3);
  assert.equal(result.target_outcomes.find((entry) => entry.target.participant_id === 'enemy-2').applied_damage, 5);

  const duplicate = resolveMultiTargetCombatAction({
    state: result.state,
    action: strikeAction({ max_targets: 2 }),
    actor_id: 'pc-1',
    selected_target_ids: ['enemy-1', 'enemy-2'],
    idempotency_key: 'sweeping-strike-1',
    generation_origin: origin,
    roll_overrides: {
      attack: { 'enemy-1': 1, 'enemy-2': 1 },
      damage: { 'enemy-1': [1], 'enemy-2': [1] },
    },
  });
  assert.equal(duplicate.status, COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED);
});

test('6D.10 save-based area effects use separate saves shared damage and per-target defenses state and concentration', () => {
  const state = baseState({
    participants: [
      pc(),
      enemy('enemy-1', { current_hit_points: 9, temporary_hit_points: 2, defense_profile: { resistances: ['fire'] } }),
      ally({ defense_profile: { immunities: ['fire'] }, current_hit_points: 8 }),
      enemy('enemy-hidden', {
        hidden: true,
        can_be_perceived: false,
        current_hit_points: 10,
        defense_profile: { vulnerabilities: ['fire'] },
      }),
    ],
    rest: {
      concentration: { concentration_id: 'enemy-focus', participant_id: 'enemy-1', active: true },
    },
  });
  const result = resolveMultiTargetCombatAction({
    state,
    action: areaAction(),
    actor_id: 'pc-1',
    confirm_ally_inclusion: true,
    generation_origin: origin,
    roll_overrides: {
      save: { 'enemy-1': 5, 'ally-1': 18, 'enemy-hidden': 4, 'pc-1': 20 },
      damage: [[4, 4]],
      concentration: { 'enemy-1': 2 },
    },
  });
  assert.equal(result.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(result.shared_damage_roll.total_before_target_defenses, 8);
  assert.equal(result.target_outcomes.find((entry) => entry.target.participant_id === 'enemy-1').applied_damage, 4);
  assert.equal(result.target_outcomes.find((entry) => entry.target.participant_id === 'ally-1').applied_damage, 0);
  assert.equal(result.target_outcomes.find((entry) => entry.target.participant_id === 'enemy-hidden').applied_damage, 16);
  assert.equal(result.target_outcomes.find((entry) => entry.target.participant_id === 'enemy-1').concentration_result.status, 'ended');

  const player = projectMultiTargetResultForPlayer(result);
  assert.equal(JSON.stringify(player).includes('enemy-hidden'), false);
  assertNoMultiTargetPlayerHiddenData(player);
  assert.equal(result.gm_dev_trace.concealed_target_ids.includes('enemy-hidden'), true);
});

test('6D.10 Multiattack resolves ordered attack steps without charging a separate action per target', () => {
  const state = baseState({ participants: [pc(), enemy('enemy-1'), enemy('enemy-2')] });
  const action = {
    ...strikeAction({ action_id: 'claw-claw', player_label: 'Claw Claw', max_targets: 2 }),
    multiattack_steps: [{ target_id: 'enemy-1' }, { target_id: 'enemy-2' }],
  };
  const result = resolveMultiattack({
    state,
    action,
    actor_id: 'pc-1',
    selected_target_ids: ['enemy-1', 'enemy-2'],
    generation_origin: origin,
    roll_overrides: {
      attack: { 'enemy-1': 12, 'enemy-2': 13 },
      damage: { 'enemy-1': [2], 'enemy-2': [3] },
    },
  });
  assert.equal(result.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.deepEqual(result.target_resolution_order, ['enemy-1', 'enemy-2']);
  assert.equal(result.attack_steps.length, 2);
});

test('6D.10 participant entry exit re-entry and initiative insertion are deterministic and idempotent', () => {
  let state = baseState({
    initiative_position: 2,
    participants: [
      pc({ initiative_total: 16, initiative_position: 1 }),
      enemy('enemy-1', { initiative_total: 12, initiative_position: 2 }),
    ],
  });
  const entry = processParticipantEntry({
    state,
    participant: enemy('reinforcement-1', { dexterity_modifier: 3, current_zone_id: 'shrine' }),
    initiative_roll_override: 10,
    generation_origin: origin,
    idempotency_key: 'entry-1',
  });
  assert.equal(entry.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(entry.initiative.total, 13);
  assert.equal(entry.initiative.first_turn_timing, 'this_round_when_position_reached');
  state = entry.state;
  const duplicate = processParticipantEntry({
    state,
    participant: enemy('reinforcement-1', { dexterity_modifier: 3 }),
    initiative_roll_override: 1,
    idempotency_key: 'entry-1',
  });
  assert.equal(duplicate.status, COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED);

  const exit = processParticipantExit({ state, participant_id: 'enemy-1', idempotency_key: 'exit-current' });
  assert.equal(exit.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  state = {
    ...exit.state,
    authored_reentry_permissions: [{ participant_id: 'enemy-1' }],
  };
  const reentry = processParticipantReEntry({ state, participant_id: 'enemy-1', idempotency_key: 'reentry-1' });
  assert.equal(reentry.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(reentry.reentry_preserved_state.initiative_reused, true);
});

test('6D.10 faction changes rebuild target legality tactics and invalidate stale target locks', () => {
  let state = baseState({ participants: [pc(), enemy('enemy-1'), neutral()] });
  const action = strikeAction();
  let targets = buildAuthoritativeTargetCandidates({ state, actor_id: 'pc-1', action });
  assert.deepEqual(targets.target_ids, ['enemy-1']);
  const lock = createTargetSetLock({
    authoritative_target_set: targets,
    selected_target_ids: ['enemy-1'],
    participant_revision: state.participant_revision,
    faction_revision: state.faction_revision,
  });

  const changed = processFactionChange({
    state,
    participant_id: 'neutral-1',
    new_faction: 'enemy',
    relationship_updates: [{ faction_a: 'player', faction_b: 'enemy', relationship: 'hostile' }],
    idempotency_key: 'faction-change-1',
  });
  state = changed.state;
  targets = buildAuthoritativeTargetCandidates({ state, actor_id: 'pc-1', action });
  assert.deepEqual(targets.target_ids.sort(), ['enemy-1', 'neutral-1'].sort());
  assert.equal(validateTargetSetLock({ state, target_set_lock: lock }).valid, false);

  const rebuilt = rebuildDynamicCombatContexts({ state, actor_id: 'pc-1', action });
  assert.equal(rebuilt.status, 'rebuilt');
  assert.equal(rebuilt.tactical_context.visible_participants.some((entry) => entry.participant_id === 'neutral-1' && entry.relation === 'hostile'), true);
});

test('6D.10 encounter-completion reevaluation returns handoff without applying aftermath', () => {
  let state = baseState({ participants: [pc(), enemy('enemy-1', { current_hit_points: 0, defeated: true })] });
  let completion = reevaluateEncounterCompletion({ state, trigger: 'final_hostile_defeated' });
  assert.equal(completion.status, 'encounter_resolution_required');
  assert.equal(completion.aftermath_applied, false);
  assert.equal(completion.next_decision.next_decision_kind, 'encounter_resolution_required');

  const entry = processParticipantEntry({
    state,
    participant: enemy('new-hostile', { dexterity_modifier: 0 }),
    initiative_roll_override: 8,
    generation_origin: origin,
  });
  completion = reevaluateEncounterCompletion({ state: entry.state, trigger: 'new_hostile_entered' });
  assert.equal(completion.status, 'active');
});

test('6D.10 projections strip player-hidden data while GM/dev trace retains exact targeting evidence', () => {
  const state = baseState({ participants: [pc(), enemy('enemy-1'), enemy('enemy-hidden', { hidden: true, can_be_perceived: false })] });
  const result = resolveMultiTargetCombatAction({
    state,
    action: areaAction(),
    actor_id: 'pc-1',
    generation_origin: origin,
    roll_overrides: { save: { 'pc-1': 20, 'enemy-1': 5, 'enemy-hidden': 5 }, damage: [[2, 2]] },
  });
  const player = projectMultiTargetResultForPlayer(result);
  assertNoMultiTargetPlayerHiddenData(player);
  assert.equal(JSON.stringify(player).includes('enemy-hidden'), false);
  assert.equal(result.gm_dev_trace.concealed_target_ids.includes('enemy-hidden'), true);

  const trace = buildTargetingGmDevTrace({
    target_policy: areaAction().target_inclusion_policy,
    authoritative_targets: result.target_resolution_order,
    visible_targets: player.player_result_bundle.consequences,
    completion_reevaluation: result.completion_reevaluation,
  });
  assert.equal(trace.trace_kind, 'combat_targeting_participant_dynamics');

  const projectedDynamics = projectParticipantDynamicsForPlayer({
    status: 'resolved',
    player_events: [processParticipantEntry({
      state,
      participant: enemy('visible-entrant', { dexterity_modifier: 0 }),
      initiative_roll_override: 11,
      generation_origin: origin,
    }).player_event],
    completion_reevaluation: result.completion_reevaluation,
  });
  assertNoMultiTargetPlayerHiddenData(projectedDynamics);
});
