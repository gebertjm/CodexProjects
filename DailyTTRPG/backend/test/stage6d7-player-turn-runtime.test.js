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
  COVER_CATEGORIES,
  CREATURE_SIZE_CATEGORIES,
  PROXIMITY_STATES,
  createSpatialRelationship,
  createZoneTransition,
} from '../src/engine/combat/spatialMovement.js';
import {
  DND5E_2014_RULESET,
  PLAYER_TURN_OPERATION_CATEGORIES,
  PLAYER_TURN_STATUSES,
  TURN_DECISION_CATEGORY_STATUSES,
  TURN_NEXT_DECISION_KINDS,
  applyMissedTurnDefault,
  assertNoPlayerTurnHiddenData,
  buildCurrentTurnContext,
  closeTurnAutomatically,
  enterRecoveryNeeded,
  listCurrentLegalDecisionCategories,
  openPlayerCombatTurn,
  previewAction,
  previewBonusAction,
  previewCrawling,
  previewEndTurn,
  previewMovement,
  previewObjectInteraction,
  previewStanding,
  projectPlayerTurnForPlayer,
  refreshCurrentTurnReadModel,
  resumeCurrentPlayerTurn,
  submitAction,
  submitBonusAction,
  submitCrawling,
  submitEndTurn,
  submitMovement,
  submitObjectInteraction,
  submitStanding,
  submitWait,
} from '../src/engine/combat/playerTurnRuntime.js';

function actor(overrides = {}) {
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
    speed_walk: 30,
    current_hit_points: 20,
    max_hit_points: 20,
    temporary_hit_points: 0,
    active: true,
    defeated: false,
    ...overrides,
  };
}

function enemy(overrides = {}) {
  return {
    participant_id: 'enemy-1',
    display_name: 'Training Bandit',
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

function action(action_id, timing_category = COMBAT_ACTION_TIMING_CATEGORIES.ACTION, overrides = {}) {
  return {
    action_id,
    player_label: overrides.player_label ?? action_id.replace(/-/g, ' '),
    ruleset: DND5E_2014_RULESET,
    timing_category,
    target_policy: overrides.target_policy ?? COMBAT_TARGET_POLICIES.NO_TARGET,
    action_level_costs: overrides.action_level_costs ?? [],
    authored_metadata: overrides.authored_metadata ?? {},
    concentration: overrides.concentration ?? null,
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
  return action('test-strike', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
    player_label: 'Test Strike',
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
          components: [{ damage_type: 'slashing', dice_count: 1, dice_size: 6, flat_modifier: 2 }],
        },
      },
    ],
    ...overrides,
  });
}

function baseActions() {
  return [
    strikeAction(),
    action('bonus-spark', COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION, { player_label: 'Bonus Spark' }),
    action('draw-potion', COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, { player_label: 'Draw Potion' }),
    action('dash', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, { player_label: 'Dash', authored_metadata: { runtime_effect: 'dash' } }),
    action('bonus-dash', COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION, { player_label: 'Quick Dash', authored_metadata: { runtime_effect: 'dash' } }),
    action('disengage', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, { player_label: 'Disengage', authored_metadata: { runtime_effect: 'disengage' } }),
    action('dodge', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, { player_label: 'Dodge', authored_metadata: { runtime_effect: 'dodge' } }),
    action('limited-strike', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
      player_label: 'Limited Strike',
      target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
      action_level_costs: [{ resource_id: 'limited-use', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, amount: 1 }],
    }),
    action('focus-spell', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
      player_label: 'Focus Spell',
      concentration: { label: 'Focus Spell' },
    }),
  ];
}

function baseState(overrides = {}) {
  const relationships = [
    createSpatialRelationship({ participant_a_id: 'pc-1', participant_b_id: 'enemy-1', proximity: PROXIMITY_STATES.ENGAGED }),
  ];
  return {
    combat: {
      combat_id: 'combat-6d7',
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 1,
      initiative_position: 1,
      current_participant_id: 'pc-1',
      encounter_title: 'Neutral Test Encounter',
      ...(overrides.combat ?? {}),
    },
    current_participant_id: overrides.current_participant_id ?? 'pc-1',
    participants: overrides.participants ?? [actor({ relationships }), enemy({ relationships })],
    actions: overrides.actions ?? baseActions(),
    resources: overrides.resources ?? [
      { resource_id: 'limited-use', label: 'Limited Use', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, owner_ref: 'pc-1', current: 1, maximum: 1 },
      { resource_id: 'spent-use', label: 'Spent Use', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, owner_ref: 'pc-1', current: 0, maximum: 1 },
    ],
    conditions: overrides.conditions ?? [],
    spatial: {
      participants: overrides.spatial?.participants ?? [
        {
          participant_id: 'pc-1',
          current_zone_id: 'road',
          size: CREATURE_SIZE_CATEGORIES.MEDIUM,
          speed: 30,
          relationships,
          cover_relationships: [{ source_id: 'cart', category: COVER_CATEGORIES.HALF }],
        },
      ],
      zones: overrides.spatial?.zones ?? [{ zone_id: 'road' }, { zone_id: 'ditch' }, { zone_id: 'cover' }],
      transitions: overrides.spatial?.transitions ?? [
        createZoneTransition({ transition_id: 'road-to-ditch', source_zone_id: 'road', destination_zone_id: 'ditch', base_cost: 10, known_hazards: ['loose stones'] }),
        createZoneTransition({ transition_id: 'road-to-cover', source_zone_id: 'road', destination_zone_id: 'cover', base_cost: 15, player_description: 'Move to cover' }),
        createZoneTransition({ transition_id: 'ditch-to-road', source_zone_id: 'ditch', destination_zone_id: 'road', base_cost: 10 }),
        createZoneTransition({ transition_id: 'blocked', source_zone_id: 'road', destination_zone_id: 'blocked', base_cost: 10, blocked: true }),
      ],
    },
    ...(overrides.rest ?? {}),
  };
}

function opened(overrides = {}) {
  return openPlayerCombatTurn(baseState(overrides)).state;
}

test('6D.7 opens and resumes one player parent turn with rules scope and read model', () => {
  const openedTurn = openPlayerCombatTurn(baseState());
  assert.equal(openedTurn.status, 'opened');
  assert.equal(openedTurn.state.parent_turn.status, PLAYER_TURN_STATUSES.OPEN);
  assert.equal(openedTurn.state.parent_turn.actor_participant_id, 'pc-1');
  assert.equal(openedTurn.state.parent_turn.action_spent, false);
  assert.equal(openedTurn.state.parent_turn.bonus_action_spent, false);
  assert.equal(openedTurn.state.parent_turn.object_interaction_spent, false);
  assert.equal(openedTurn.state.parent_turn.base_movement, 30);
  assert.equal(openedTurn.read_model.legal_decision_categories.some((category) => category.category === 'end_turn' && category.available), true);
  assert.equal(openedTurn.gm_dev_trace.context.current_state_version, openedTurn.state.parent_turn.current_state_version);

  const resumed = resumeCurrentPlayerTurn(openedTurn.state);
  assert.equal(resumed.status, 'resumed');
  assert.equal(resumed.state.parent_turn.parent_turn_id, openedTurn.state.parent_turn.parent_turn_id);

  assert.throws(() => openPlayerCombatTurn(baseState({ combat: { status: 'complete' } })), /inactive combat/);
  assert.throws(() => openPlayerCombatTurn(baseState({ current_participant_id: 'enemy-1' })), /unknown actor|non-current actor/);
  assert.throws(() => openPlayerCombatTurn(baseState({ participants: [actor({ participant_id: 'pc-1', control_mode: 'ai', player_controlled: false, is_player_character: false, faction: 'neutral' }), enemy()] })), /non-player/);
  assert.throws(() => openPlayerCombatTurn(baseState({ combat: { ruleset: { system: 'dnd5e', rules_version: '2024' } } })), /Unsupported combat ruleset/);
});

test('6D.7 decision categories track movement action bonus object wait and end turn independently', () => {
  const state = opened();
  let categories = listCurrentLegalDecisionCategories(state);
  assert.equal(categories.find((entry) => entry.category === 'move').status, TURN_DECISION_CATEGORY_STATUSES.AVAILABLE);
  assert.equal(categories.find((entry) => entry.category === 'action').status, TURN_DECISION_CATEGORY_STATUSES.AVAILABLE);
  assert.equal(categories.find((entry) => entry.category === 'bonus_action').status, TURN_DECISION_CATEGORY_STATUSES.AVAILABLE);
  assert.equal(categories.find((entry) => entry.category === 'object_interaction').status, TURN_DECISION_CATEGORY_STATUSES.AVAILABLE);
  assert.equal(categories.find((entry) => entry.category === 'wait').status, TURN_DECISION_CATEGORY_STATUSES.AVAILABLE);

  const waited = submitWait({ state, source_state_version: state.parent_turn.current_state_version, idempotency_key: 'wait-1' }).state;
  categories = listCurrentLegalDecisionCategories(waited);
  assert.equal(categories.find((entry) => entry.category === 'action').status, TURN_DECISION_CATEGORY_STATUSES.SPENT);
  assert.equal(categories.find((entry) => entry.category === 'bonus_action').status, TURN_DECISION_CATEGORY_STATUSES.AVAILABLE);
  assert.equal(categories.find((entry) => entry.category === 'move').status, TURN_DECISION_CATEGORY_STATUSES.AVAILABLE);
});

test('6D.7 previews are non-mutating and disclose source versions costs risks and confirmation', () => {
  const state = opened({ conditions: [condition(CONDITION_IDS.PRONE)] });
  const originalVersion = state.parent_turn.current_state_version;
  const movement = previewMovement({ state, destination_zone_id: 'ditch', before_proximity: PROXIMITY_STATES.ENGAGED, after_proximity: PROXIMITY_STATES.NEARBY });
  assert.equal(movement.mutates_state, false);
  assert.equal(movement.source_state_version, originalVersion);
  assert.equal(movement.total_cost, 10);
  assert.equal(movement.known_opportunity_attack_risk, 'possible_reaction');
  assert.equal(state.parent_turn.current_state_version, originalVersion);

  const actionPreview = previewAction({ state, action_id: 'test-strike', target_id: 'enemy-1' });
  assert.equal(actionPreview.rolls_generated, false);
  assert.equal(actionPreview.visible_resource_costs.length, 0);
  assert.equal(actionPreview.source_state_version, originalVersion);

  const bonusPreview = previewBonusAction({ state, action_id: 'bonus-spark', target_id: 'pc-1' });
  assert.equal(bonusPreview.operation_category, PLAYER_TURN_OPERATION_CATEGORIES.BONUS_ACTION);

  const objectPreview = previewObjectInteraction({ state, action_id: 'draw-potion', target_id: 'pc-1' });
  assert.equal(objectPreview.operation_category, PLAYER_TURN_OPERATION_CATEGORIES.OBJECT_INTERACTION);

  const standingPreview = previewStanding({ state });
  assert.equal(standingPreview.mutates_state, false);
  assert.equal(standingPreview.standing_cost, 15);

  const endPreview = previewEndTurn(state);
  assert.equal(endPreview.mutates_state, false);
  assert.equal(endPreview.confirmation.required, true);
  assert.deepEqual(endPreview.confirmation.meaningful_forfeitures.sort(), ['action', 'bonus_action', 'move', 'object_interaction'].sort());
});

test('6D.7 commits movement before and after action while refreshing versions and read models', () => {
  let state = opened();
  const firstMove = submitMovement({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'move-1',
    destination_zone_id: 'ditch',
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
  });
  assert.equal(firstMove.status, 'resolved');
  assert.equal(firstMove.player_result_bundle.movement.spent, 10);
  assert.equal(firstMove.next_decision.next_decision_kind, TURN_NEXT_DECISION_KINDS.REACTION_REQUIRED);
  assert.notEqual(firstMove.resulting_state_version, firstMove.source_state_version);
  state = firstMove.state;

  const strike = submitAction({
    state,
    action_id: 'test-strike',
    target_id: 'enemy-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'strike-1',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 15, damage: [4] },
  });
  assert.equal(strike.status, 'resolved');
  assert.equal(strike.state.parent_turn.action_spent, true);
  assert.equal(strike.state.parent_turn.bonus_action_spent, false);
  assert.equal(strike.state.parent_turn.object_interaction_spent, false);
  assert.equal(strike.state.parent_turn.movement_spent, 10);
  assert.equal(strike.read_model.visible_participants.find((entry) => entry.participant_id === 'enemy-1').health_band, 'standing');
  state = strike.state;

  const secondMove = submitMovement({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'move-2',
    destination_zone_id: 'road',
    selected_transition_ids: ['ditch-to-road'],
  });
  assert.equal(secondMove.status, 'resolved');
  assert.equal(secondMove.state.parent_turn.movement_spent, 20);
  assert.equal(secondMove.state.parent_turn.action_spent, true);
  assert.equal(secondMove.read_model.movement.movement_remaining, 10);
});

test('6D.7 action bonus action object interaction and Wait preserve the correct remaining slots', () => {
  let state = opened();
  const bonus = submitBonusAction({
    state,
    action_id: 'bonus-spark',
    target_id: 'pc-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'bonus-1',
  });
  assert.equal(bonus.state.parent_turn.bonus_action_spent, true);
  assert.equal(bonus.state.parent_turn.action_spent, false);
  state = bonus.state;

  const object = submitObjectInteraction({
    state,
    action_id: 'draw-potion',
    target_id: 'pc-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'object-1',
  });
  assert.equal(object.state.parent_turn.object_interaction_spent, true);
  assert.equal(object.state.parent_turn.action_spent, false);
  state = object.state;

  const objectActionState = opened({ actions: baseActions().concat(action('pull-lever', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, { player_label: 'Pull Lever' })) });
  const actionCostObject = submitObjectInteraction({
    state: objectActionState,
    action_id: 'pull-lever',
    target_id: 'pc-1',
    source_state_version: objectActionState.parent_turn.current_state_version,
    idempotency_key: 'object-action-cost',
  });
  assert.equal(actionCostObject.status, 'resolved');
  assert.equal(actionCostObject.state.parent_turn.action_spent, true);
  assert.equal(actionCostObject.state.parent_turn.object_interaction_spent, false);

  const wait = submitWait({ state, source_state_version: state.parent_turn.current_state_version, idempotency_key: 'wait-2' });
  assert.equal(wait.state.parent_turn.action_spent, true);
  assert.equal(wait.state.parent_turn.bonus_action_spent, true);
  assert.equal(wait.state.parent_turn.object_interaction_spent, true);
  assert.equal(wait.state.parent_turn.status, PLAYER_TURN_STATUSES.OPEN);
  assert.equal(wait.player_result_bundle.consequences.includes('No readied trigger is created.'), true);
});

test('6D.7 crawling spends prone movement cost and leaves normal action economy available', () => {
  const state = opened({ conditions: [condition(CONDITION_IDS.PRONE)] });
  const preview = previewCrawling({ state, destination_zone_id: 'ditch' });
  assert.equal(preview.mutates_state, false);
  assert.equal(preview.total_cost, 20);
  assert.equal(preview.condition_remains, true);

  const crawled = submitCrawling({
    state,
    destination_zone_id: 'ditch',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'crawl-1',
  });
  assert.equal(crawled.status, 'resolved');
  assert.equal(crawled.player_result_bundle.operation_category, PLAYER_TURN_OPERATION_CATEGORIES.CRAWL_MOVEMENT);
  assert.equal(crawled.state.parent_turn.movement_spent, 20);
  assert.equal(crawled.state.conditions.some((entry) => entry.condition_type === CONDITION_IDS.PRONE && entry.active !== false), true);
  assert.equal(crawled.state.parent_turn.action_spent, false);
  assert.equal(crawled.state.parent_turn.bonus_action_spent, false);
});

test('6D.7 stale previews reject safely before spending slots resources movement or rolls', () => {
  const state = opened();
  const stale = submitAction({
    state,
    action_id: 'test-strike',
    target_id: 'enemy-1',
    source_state_version: 'older-version',
    idempotency_key: 'stale-strike',
    roll_overrides: { attack: 20, damage: [6] },
  });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.committed, false);
  assert.equal(state.parent_turn.action_spent, false);
  assert.equal(state.participants.find((entry) => entry.participant_id === 'enemy-1').current_hit_points, 12);

  const staleMove = submitMovement({
    state,
    source_state_version: 'older-version',
    idempotency_key: 'stale-move',
    destination_zone_id: 'ditch',
  });
  assert.equal(staleMove.status, 'stale');
  assert.equal(staleMove.committed, false);
  assert.equal(state.parent_turn.movement_spent, 0);
});

test('6D.7 duplicate submits reuse sub-resolution identity and conflicting keys mutate nothing', () => {
  let state = opened();
  const first = submitAction({
    state,
    action_id: 'test-strike',
    target_id: 'enemy-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'same-key',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 15, damage: [4] },
  });
  state = first.state;
  const hpAfterFirst = state.participants.find((entry) => entry.participant_id === 'enemy-1').current_hit_points;
  const duplicate = submitAction({
    state,
    action_id: 'test-strike',
    target_id: 'enemy-1',
    source_state_version: first.source_state_version,
    idempotency_key: 'same-key',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 1, damage: [1] },
  });
  assert.equal(duplicate.status, 'duplicate_handled');
  assert.equal(duplicate.duplicate_of_sub_resolution_id, first.sub_resolution_id);
  assert.equal(state.participants.find((entry) => entry.participant_id === 'enemy-1').current_hit_points, hpAfterFirst);

  const conflict = submitAction({
    state,
    action_id: 'dash',
    target_id: 'pc-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'same-key',
  });
  assert.equal(conflict.status, 'idempotency_conflict');
  assert.equal(conflict.committed, false);
  assert.equal(state.parent_turn.dash_added_movement, 0);
});

test('6D.7 Dash Disengage and Dodge integrate with turn resources without ending the turn', () => {
  let state = opened();
  const dash = submitAction({
    state,
    action_id: 'dash',
    target_id: 'pc-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'dash-1',
  });
  assert.equal(dash.state.parent_turn.action_spent, true);
  assert.equal(dash.state.parent_turn.dash_added_movement, 30);
  assert.equal(dash.read_model.movement.movement_remaining, 60);
  assert.equal(dash.state.parent_turn.status, PLAYER_TURN_STATUSES.OPEN);

  state = opened();
  const disengage = submitAction({
    state,
    action_id: 'disengage',
    target_id: 'pc-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'disengage-1',
  });
  state = disengage.state;
  assert.equal(state.turn_effects.some((effect) => effect.effect_id === 'disengage'), true);
  const move = submitMovement({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'move-disengaged',
    destination_zone_id: 'ditch',
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
  });
  assert.equal(move.player_result_bundle.known_reaction_trigger, null);

  state = opened();
  const dodge = submitAction({
    state,
    action_id: 'dodge',
    target_id: 'pc-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'dodge-1',
  });
  assert.equal(dodge.state.turn_effects.some((effect) => effect.effect_id === 'dodge'), true);
  assert.equal(dodge.state.parent_turn.status, PLAYER_TURN_STATUSES.OPEN);
  assert.equal(dodge.state.parent_turn.bonus_action_spent, false);
});

test('6D.7 standing removes Prone and preserves action economy while End Turn confirmation is meaningful only', () => {
  let state = opened({ conditions: [condition(CONDITION_IDS.PRONE)] });
  const standing = submitStanding({ state, source_state_version: state.parent_turn.current_state_version, idempotency_key: 'stand-1' });
  assert.equal(standing.state.conditions.some((entry) => entry.condition_type === CONDITION_IDS.PRONE && entry.active !== false), false);
  assert.equal(standing.state.parent_turn.movement_spent, 15);
  assert.equal(standing.state.parent_turn.action_spent, false);
  state = standing.state;

  let endPreview = previewEndTurn(state);
  assert.equal(endPreview.confirmation.required, true);
  assert.equal(endPreview.confirmation.meaningful_forfeitures.includes('move'), true);

  const noConfirm = submitEndTurn({ state, source_state_version: state.parent_turn.current_state_version, idempotency_key: 'end-needs-confirm' });
  assert.equal(noConfirm.status, 'confirmation_required');

  const ended = submitEndTurn({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'end-confirmed',
    confirm_end_turn: true,
  });
  assert.equal(ended.state.parent_turn.status, PLAYER_TURN_STATUSES.CLOSED);
  assert.equal(ended.state.action_window.status, 'closed');
  assert.equal(ended.next_decision.next_decision_kind, TURN_NEXT_DECISION_KINDS.TURN_CLOSED);

  const further = submitAction({
    state: ended.state,
    action_id: 'test-strike',
    target_id: 'enemy-1',
    source_state_version: ended.state.parent_turn.current_state_version,
    idempotency_key: 'after-end',
  });
  assert.equal(further.status, 'unavailable');
});

test('6D.7 missed turn defaults Dodge then End Turn and falls back safely when Dodge is illegal', () => {
  const state = opened();
  const result = applyMissedTurnDefault({ state, timeout_provenance: 'test-scheduler' });
  assert.equal(result.status, 'missed_turn_default_applied');
  assert.equal(result.default_actions[0].default_action, 'dodge');
  assert.equal(result.state.parent_turn.status, PLAYER_TURN_STATUSES.CLOSED);
  assert.equal(result.state.parent_turn.movement_spent, 30);
  assert.equal(result.gm_dev_trace.dodge_legal, true);

  const incapacitated = opened({ conditions: [condition(CONDITION_IDS.INCAPACITATED)] });
  const fallback = applyMissedTurnDefault({ state: incapacitated });
  assert.equal(fallback.default_actions[0].default_action, 'no_action');
  assert.equal(fallback.state.parent_turn.status, PLAYER_TURN_STATUSES.CLOSED);
  assert.equal(fallback.gm_dev_trace.dodge_legal, false);
});

test('6D.7 automatic closure and recovery-needed remove ordinary controls without using missed-turn default', () => {
  let state = opened({ conditions: [condition(CONDITION_IDS.UNCONSCIOUS)] });
  const closed = closeTurnAutomatically({ state, reason: 'unconscious' });
  assert.equal(closed.state.parent_turn.status, PLAYER_TURN_STATUSES.CLOSED);
  assert.equal(closed.state.parent_turn.turn_close_reason, 'unconscious');
  assert.equal(JSON.stringify(closed).includes('missed_turn_timeout'), false);

  state = opened();
  const recovery = enterRecoveryNeeded({
    state,
    reason: 'partial_action_failure',
    failed_step: 'after_roll_before_all_effects',
    completed_facts: ['action_slot_committed', 'attack_roll_generated'],
  });
  assert.equal(recovery.state.parent_turn.status, PLAYER_TURN_STATUSES.RECOVERY_NEEDED);
  assert.equal(recovery.read_model.legal_decision_categories.every((category) => category.status === TURN_DECISION_CATEGORY_STATUSES.RECOVERY_NEEDED), true);
  assert.equal(recovery.gm_dev_trace.completed_facts_preserved.length, 2);
});

test('6D.7 read models and player projections hide internal turn state while GM/dev context keeps it', () => {
  const state = opened();
  const actionResult = submitAction({
    state,
    action_id: 'test-strike',
    target_id: 'enemy-1',
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: 'visibility-action',
    generation_origin: 'deterministic_test_override',
    roll_overrides: { attack: 15, damage: [4] },
  });
  const readModel = refreshCurrentTurnReadModel({ state: actionResult.state });
  assertNoPlayerTurnHiddenData(readModel);
  assert.equal(JSON.stringify(readModel).includes('armor_class'), false);
  assert.equal(JSON.stringify(readModel).includes('source_state_version'), false);
  assert.equal(JSON.stringify(readModel).includes('idempotency_key'), false);

  const projected = projectPlayerTurnForPlayer(actionResult);
  assert.equal(JSON.stringify(projected).includes('gm_dev'), false);
  assert.equal(JSON.stringify(projected).includes('idempotency_key'), false);

  const context = buildCurrentTurnContext(actionResult.state);
  assert.equal(context.gm_dev_trace.action_window.action_window_id, actionResult.state.parent_turn.action_window_id);
  assert.equal(context.gm_dev_trace.sub_resolution_count, 1);
});
