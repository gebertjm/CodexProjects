import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_RESOURCE_CATEGORIES,
  COMBAT_TARGET_POLICIES,
} from '../src/engine/combat/actionEffectResourceFramework.js';
import {
  COMBAT_FOCUS_ANSWER_STATUSES,
  COMBAT_FOCUS_CATEGORIES,
  COMBAT_FOCUS_MATCH_STATUSES,
  COMBAT_FOCUS_TEMPLATES,
  assertNoCombatFocusPlayerHiddenData,
  buildCombatFocusContext,
  buildCombatFocusGmDevTrace,
  buildCombatFocusReadModel,
  buildPrioritizedCombatFocusSuggestions,
  collapseCombatFocusAnswersAtEndTurn,
  getCombatFocusTemplateRegistry,
  invalidateStaleCombatFocusAnswers,
  isCombatFocusAnswerValid,
  matchCombatFocusFreeText,
  projectCombatFocusForPlayer,
  resolveCombatFocusQuestion,
  resolveStructuredCombatFocusQuestion,
  reuseCombatFocusAnswer,
} from '../src/engine/combat/combatFocus.js';
import {
  CONDITION_IDS,
  createConditionInstance,
} from '../src/engine/combat/conditionStateLifecycle.js';
import {
  COVER_CATEGORIES,
  PROXIMITY_STATES,
  createSpatialRelationship,
} from '../src/engine/combat/spatialMovement.js';
import {
  TARGET_INCLUSION_POLICIES,
} from '../src/engine/combat/targetingParticipantDynamics.js';
import {
  DND5E_2014_RULESET,
} from '../src/engine/combat/rulesResolution.js';

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
    can_be_perceived: overrides.can_be_perceived ?? true,
    visible: overrides.visible ?? true,
    hidden: overrides.hidden ?? false,
    ...overrides,
  };
}

function actor(overrides = {}) {
  return participant({
    participant_id: 'pc-1',
    display_name: 'Avery',
    faction: 'player',
    control_mode: 'player',
    player_controlled: true,
    is_player_character: true,
    ...overrides,
  });
}

function enemy(id = 'goblin-1', overrides = {}) {
  return participant({
    participant_id: id,
    display_name: id === 'goblin-1' ? 'Goblin Cutter' : 'Road Archer',
    faction: 'enemy',
    control_mode: 'ai',
    player_controlled: false,
    is_player_character: false,
    current_hit_points: 12,
    max_hit_points: 12,
    armor_class: 15,
    ...overrides,
  });
}

function ally(overrides = {}) {
  return participant({
    participant_id: 'ally-1',
    display_name: 'Lantern Guard',
    faction: 'player',
    control_mode: 'ally',
    player_controlled: false,
    is_player_character: false,
    ...overrides,
  });
}

function condition(conditionType, overrides = {}) {
  return createConditionInstance({
    condition_type: conditionType,
    target_participant_id: overrides.target_participant_id ?? 'pc-1',
    source_participant_id: overrides.source_participant_id ?? 'goblin-1',
    visible: overrides.visible ?? true,
    duration: overrides.duration ?? { duration_type: 'rounds', duration_value: 1, remaining_rounds: 1 },
    ...overrides,
  });
}

function targetPolicy(overrides = {}) {
  return {
    policy_id: TARGET_INCLUSION_POLICIES.SELECTED_CREATURES_UP_TO_LIMIT,
    min_targets: 1,
    max_targets: 1,
    visibility_required: true,
    authored_filter: { relationships: ['hostile'] },
    player_safe_description: 'Choose a visible hostile target.',
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
    target_inclusion_policy: overrides.target_inclusion_policy,
    range: overrides.range,
    action_level_costs: overrides.action_level_costs ?? [],
    concentration: overrides.concentration ?? null,
    authored_metadata: overrides.authored_metadata ?? {},
    effect_steps: overrides.effect_steps ?? [],
  };
}

function strikeAction(overrides = {}) {
  return action('strike', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
    player_label: 'Strike',
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
    target_inclusion_policy: targetPolicy(),
    ...overrides,
  });
}

function focusSpell(overrides = {}) {
  return action('focus-spell', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
    player_label: 'Focus Spell',
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
    target_inclusion_policy: targetPolicy(),
    concentration: { label: 'Focus Spell' },
    action_level_costs: [{ resource_id: 'focus-use', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, amount: 1, visible_label: 'Focus Use' }],
    ...overrides,
  });
}

function areaBurst(overrides = {}) {
  return action('fire-burst', COMBAT_ACTION_TIMING_CATEGORIES.ACTION, {
    player_label: 'Fire Burst',
    target_policy: COMBAT_TARGET_POLICIES.AREA,
    target_inclusion_policy: {
      policy_id: TARGET_INCLUSION_POLICIES.ALL_CREATURES_IN_TARGET_GROUP,
      target_group: 'road-group',
      visibility_required: true,
      player_safe_description: 'Affects visible creatures in the road group.',
    },
    ...overrides,
  });
}

function baseState(overrides = {}) {
  const participants = overrides.participants ?? [
    actor(),
    enemy('goblin-1', { current_zone_id: 'road' }),
    enemy('archer-1', { current_zone_id: 'shrine-approach' }),
    enemy('hidden-stalker', { display_name: 'Unseen Stalker', hidden: true, visible: false, can_be_perceived: false }),
    ally({ current_zone_id: 'road' }),
  ];
  return {
    combat: {
      combat_id: 'combat-6d11',
      encounter_id: 'encounter-focus',
      status: 'active',
      ruleset: DND5E_2014_RULESET,
      round_number: 2,
      current_participant_id: 'pc-1',
      encounter_title: 'Neutral Focus Encounter',
    },
    current_participant_id: 'pc-1',
    parent_turn: {
      parent_turn_id: 'turn:pc-1:2',
      actor_participant_id: 'pc-1',
      status: 'open',
      current_state_version: overrides.current_state_version ?? 'turn-v1',
      action_spent: false,
      bonus_action_spent: false,
      object_interaction_spent: false,
      base_movement: 30,
      movement_spent: 10,
      movement_remaining: 20,
      ...overrides.parent_turn,
    },
    participants,
    faction_relationships: [
      { faction_a: 'player', faction_b: 'enemy', relationship: 'hostile' },
      { faction_a: 'enemy', faction_b: 'player', relationship: 'hostile' },
      { faction_a: 'player', faction_b: 'neutral', relationship: 'neutral' },
    ],
    spatial: {
      zones: [
        { zone_id: 'road', player_label: 'Grey Road', visible_cover: ['wagon cover'] },
        { zone_id: 'shrine-approach', player_label: 'Shrine Approach', visible_cover: [{ label: 'stone half cover', cover_category: COVER_CATEGORIES.HALF }] },
        { zone_id: 'escape-road', player_label: 'Escape Road' },
        { zone_id: 'blocked-ditch', player_label: 'Blocked Ditch' },
      ],
      transitions: [
        { transition_id: 'road-shrine', source_zone_id: 'road', destination_zone_id: 'shrine-approach', visible: true, base_cost: 10 },
        { transition_id: 'road-escape', source_zone_id: 'road', destination_zone_id: 'escape-road', visible: true, base_cost: 15, retreat_route: true, known_risks: ['opportunity_attack'] },
        { transition_id: 'road-ditch', source_zone_id: 'road', destination_zone_id: 'blocked-ditch', visible: true, base_cost: 5, blocked: true, blocked_visible_reason: 'The ditch is blocked.' },
      ],
      participants: [
        { participant_id: 'pc-1', current_zone_id: 'road' },
        { participant_id: 'goblin-1', current_zone_id: 'road' },
        { participant_id: 'archer-1', current_zone_id: 'shrine-approach' },
        { participant_id: 'hidden-stalker', current_zone_id: 'road', visibility: { hidden: true, can_be_perceived: false } },
        { participant_id: 'ally-1', current_zone_id: 'road' },
      ],
      relationships: [
        createSpatialRelationship({ participant_a_id: 'pc-1', participant_b_id: 'goblin-1', proximity: PROXIMITY_STATES.ENGAGED }),
        createSpatialRelationship({ participant_a_id: 'pc-1', participant_b_id: 'archer-1', proximity: PROXIMITY_STATES.NEARBY }),
      ],
      objects: [
        { object_id: 'lever-1', player_label: 'Winch Lever', zone_id: 'road', visible: true, interaction_cost: 'object_interaction' },
        { object_id: 'sealed-cache', player_label: 'Sealed Cache', zone_id: 'road', visible: false, hidden: true, interaction_cost: 'object_interaction' },
      ],
    },
    actions: [
      strikeAction(),
      focusSpell(),
      areaBurst(),
      action('quick-step', COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION, { player_label: 'Quick Step' }),
      action('use-lever', COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, { player_label: 'Use Winch Lever' }),
    ],
    resources: [{ resource_id: 'focus-use', label: 'Focus Use', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, current: 1, max: 1 }],
    conditions: [
      condition(CONDITION_IDS.PRONE, { target_participant_id: 'pc-1' }),
      condition(CONDITION_IDS.POISONED, { target_participant_id: 'goblin-1' }),
    ],
    concentration: { participant_id: 'pc-1', source_action_id: 'old-focus', label: 'Old Focus', active: true, duration_label: 'until you lose concentration' },
    reaction_resources: {
      'pc-1': { reaction_available: true, supported_reaction_types: ['opportunity_attack'] },
      'goblin-1': { reaction_available: true, supported_reaction_types: ['opportunity_attack'] },
      'archer-1': { reaction_available: true, supported_reaction_types: [] },
    },
    combat_focus_answers: [],
    ...(overrides.rest ?? {}),
  };
}

function context(overrides = {}) {
  return buildCombatFocusContext({
    state: baseState(overrides),
    actor_id: 'pc-1',
    selected_target_id: overrides.selected_target_id ?? 'goblin-1',
    selected_action_id: overrides.selected_action_id ?? 'strike',
    selected_zone_id: overrides.selected_zone_id ?? 'shrine-approach',
    selected_object_id: overrides.selected_object_id ?? 'lever-1',
  });
}

const requiredTemplateIds = [
  'enemy.can_i_reach',
  'enemy.can_reach_me',
  'enemy.am_i_engaged',
  'enemy.opportunity_attack_if_move_away',
  'enemy.within_selected_action_range',
  'enemy.cover',
  'enemy.visible_conditions',
  'enemy.legal_target_for_selected_action',
  'movement.can_move_to_zone',
  'movement.cost',
  'movement.route_risk',
  'movement.and_action_possible',
  'movement.cover_change',
  'movement.engagement_change',
  'action.can_use_now',
  'action.economy_cost',
  'action.visible_legal_targets',
  'action.affects_allies',
  'action.break_concentration',
  'action.resource_available',
  'terrain.cover_available',
  'terrain.objects_interact',
  'terrain.object_cost',
  'terrain.reachable_zones',
  'retreat.possible',
  'retreat.escape_routes',
  'retreat.requirements',
  'retreat.opportunity_risk',
  'self.condition_restrictions',
  'self.movement_remaining',
  'self.turn_resources_remaining',
  'self.concentration',
  'self.reactions_remaining',
];

function parametersFor(templateId) {
  if (templateId.startsWith('enemy.')) {
    return { enemy_participant_id: 'goblin-1', action_id: 'strike' };
  }
  if (templateId.startsWith('movement.')) {
    return { zone_id: 'shrine-approach', action_id: 'strike' };
  }
  if (templateId === 'action.break_concentration' || templateId === 'action.resource_available') {
    return { action_id: 'focus-spell' };
  }
  if (templateId.startsWith('action.')) {
    return { action_id: 'strike' };
  }
  if (templateId === 'terrain.object_cost') {
    return { object_id: 'lever-1' };
  }
  return {};
}

function assertPlayerSafe(payload) {
  assert.doesNotThrow(() => assertNoCombatFocusPlayerHiddenData(payload));
  const text = JSON.stringify(payload);
  for (const term of ['hidden-stalker', 'Unseen Stalker', 'armor_class', 'current_state_version', 'dependency_fingerprint', 'trace', 'mutation_plan']) {
    assert.equal(text.includes(term), false, `player payload leaked ${term}`);
  }
}

test('Stage 6D.11 exposes the required Combat Focus categories and guaranteed templates', () => {
  assert.deepEqual(
    Object.values(COMBAT_FOCUS_CATEGORIES).sort(),
    ['action_feasibility', 'enemy_specific', 'movement_and_positioning', 'retreat', 'self_state', 'terrain_and_objects'].sort()
  );
  assert.equal(COMBAT_FOCUS_TEMPLATES.length, 33);
  assert.deepEqual(COMBAT_FOCUS_TEMPLATES.map((entry) => entry.template_id), requiredTemplateIds);
  const registry = getCombatFocusTemplateRegistry();
  assert.equal(registry.templates.length, 33);
  assert.equal(registry.categories.length, 6);
});

test('all guaranteed structured questions resolve deterministically and remain player-safe', () => {
  const focusContext = context();
  for (const templateId of requiredTemplateIds) {
    const result = resolveStructuredCombatFocusQuestion({
      context: focusContext,
      template_id: templateId,
      parameters: parametersFor(templateId),
    });
    assert.ok([COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED, COMBAT_FOCUS_ANSWER_STATUSES.UNAVAILABLE].includes(result.status), templateId);
    assert.ok(result.player_answer?.concise_answer, templateId);
    assert.equal(result.answer.player_safe, true, templateId);
    assertPlayerSafe(result.player_answer);
    assert.ok(result.gm_dev_trace?.dependency_fingerprint, templateId);
  }
});

test('Combat Focus answers use visible state without mutating combat state or generating rolls', () => {
  const state = baseState();
  const before = JSON.stringify(state);
  const result = resolveStructuredCombatFocusQuestion({
    state,
    actor_id: 'pc-1',
    selected_target_id: 'goblin-1',
    template_id: 'enemy.can_i_reach',
    parameters: { enemy_participant_id: 'goblin-1' },
  });
  assert.equal(result.status, COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result).includes('roll_record'), false);
});

test('free-text matching supports direct matches, parameter choices, disambiguation, and unsupported questions', () => {
  const focusContext = context();
  const direct = matchCombatFocusFreeText({
    context: focusContext,
    question: 'Can I reach Goblin Cutter?',
  });
  assert.equal(direct.status, COMBAT_FOCUS_MATCH_STATUSES.MATCHED);
  assert.equal(direct.template_id, 'enemy.can_i_reach');
  assert.equal(direct.parameters.enemy_participant_id, 'goblin-1');

  const choice = matchCombatFocusFreeText({
    context: buildCombatFocusContext({ state: baseState(), actor_id: 'pc-1' }),
    question: 'Can I reach this enemy?',
  });
  assert.equal(choice.status, COMBAT_FOCUS_MATCH_STATUSES.PARAMETER_CHOICES_REQUIRED);
  assert.equal(choice.template_id, 'enemy.can_i_reach');
  assert.equal(choice.parameter_choices.enemy_participant_id.length, 2);

  const ambiguous = matchCombatFocusFreeText({
    context: focusContext,
    question: 'Does this enemy have cover, and what cover is available?',
  });
  assert.equal(ambiguous.status, COMBAT_FOCUS_MATCH_STATUSES.DISAMBIGUATION_REQUIRED);
  assert.ok(ambiguous.alternatives.length >= 2);

  const unsupported = matchCombatFocusFreeText({
    context: focusContext,
    question: 'What is the perfect winning plan?',
  });
  assert.equal(unsupported.status, COMBAT_FOCUS_MATCH_STATUSES.UNSUPPORTED);
  assert.ok(unsupported.nearest_categories.length > 0);
});

test('free-text resolution projects player-safe answers and keeps GM/dev matcher trace separate', () => {
  const result = resolveCombatFocusQuestion({
    context: context(),
    question: 'Which reactions remain available?',
  });
  assert.equal(result.status, COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED);
  assert.equal(result.answer.template_id, 'self.reactions_remaining');
  assertPlayerSafe(projectCombatFocusForPlayer(result));
  assert.ok(result.gm_dev_trace.matcher_trace);
});

test('suggestions and grouped questions are prioritized, bounded, and progressively disclosed', () => {
  const focusContext = context();
  const suggestions = buildPrioritizedCombatFocusSuggestions({ context: focusContext, limit: 5 });
  assert.ok(suggestions.suggestions.length <= 5);
  assert.equal(suggestions.suggestions[0].template_id, 'enemy.legal_target_for_selected_action');
  const collapsedEnemyGroup = suggestions.grouped_categories.find((group) => group.category_id === COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC);
  assert.equal(collapsedEnemyGroup.suggested_questions.length, 2);
  assert.ok(collapsedEnemyGroup.additional_question_count > 0);

  const expanded = buildPrioritizedCombatFocusSuggestions({
    context: focusContext,
    expanded_category_id: COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC,
  }).grouped_categories.find((group) => group.category_id === COMBAT_FOCUS_CATEGORIES.ENEMY_SPECIFIC);
  assert.equal(expanded.expanded, true);
  assert.equal(expanded.suggested_questions.length, 8);

  const readModel = buildCombatFocusReadModel({ context: focusContext, limit: 5 });
  assert.equal(readModel.status, 'available');
  assertPlayerSafe(readModel);
});

test('answer reuse remains valid for unchanged dependencies and invalidates when visible dependencies change', () => {
  const originalContext = context();
  const result = resolveStructuredCombatFocusQuestion({
    context: originalContext,
    template_id: 'self.movement_remaining',
  });
  const answer = result.answer;
  assert.equal(isCombatFocusAnswerValid({ answer, context: originalContext }).valid, true);

  const unchangedContext = context({ rest: { faction_revision: 'factions-v2' } });
  const reused = reuseCombatFocusAnswer({
    context: unchangedContext,
    template_id: 'self.movement_remaining',
    answers: [answer],
  });
  assert.equal(reused.reused, true);
  assert.equal(reused.answer.status, COMBAT_FOCUS_ANSWER_STATUSES.REUSED);

  const changedContext = context({ parent_turn: { movement_spent: 20, movement_remaining: 10 } });
  const stale = reuseCombatFocusAnswer({
    context: changedContext,
    template_id: 'self.movement_remaining',
    answers: [answer],
  });
  assert.equal(stale.reused, false);
  assert.equal(stale.reason, 'dependency_changed');

  const invalidated = invalidateStaleCombatFocusAnswers({ context: changedContext, answers: [answer] });
  assert.equal(invalidated[0].status, COMBAT_FOCUS_ANSWER_STATUSES.STALE);
  assert.equal(invalidated[0].validity.invalidation_reason, 'dependency_changed');
});

test('Combat Focus answers collapse at end turn and recovery state suppresses tactical suggestions', () => {
  const result = resolveStructuredCombatFocusQuestion({
    context: context(),
    template_id: 'self.turn_resources_remaining',
  });
  const collapsed = collapseCombatFocusAnswersAtEndTurn({
    turn_id: 'turn:pc-1:2',
    answers: [result.answer],
  });
  assert.equal(collapsed[0].status, COMBAT_FOCUS_ANSWER_STATUSES.STALE);
  assert.equal(collapsed[0].collapsed, true);

  const recoveryContext = context({ parent_turn: { status: 'recovery_needed' }, rest: { recovery_needed: true } });
  const readModel = buildCombatFocusReadModel({ context: recoveryContext });
  assert.equal(readModel.status, 'recovery_limited');
  assert.equal(readModel.suggestions[0].template_id, 'recovery.review_state');
  const unavailable = resolveStructuredCombatFocusQuestion({
    context: recoveryContext,
    template_id: 'self.movement_remaining',
  });
  assert.equal(unavailable.status, COMBAT_FOCUS_ANSWER_STATUSES.UNAVAILABLE);
  assertPlayerSafe(readModel);
});

test('GM/dev trace keeps diagnostics authorized while player projection strips internals', () => {
  const focusContext = context();
  const result = resolveStructuredCombatFocusQuestion({
    context: focusContext,
    template_id: 'action.resource_available',
    parameters: { action_id: 'focus-spell' },
  });
  const trace = buildCombatFocusGmDevTrace({
    context: focusContext,
    template: COMBAT_FOCUS_TEMPLATES.find((entry) => entry.template_id === 'action.resource_available'),
    answer: result.answer,
  });
  assert.equal(trace.trace_kind, 'combat_focus');
  assert.ok(trace.dependency_fingerprint);
  assert.ok(trace.visibility_filtering_notes.length > 0);

  const projected = projectCombatFocusForPlayer({ status: result.status, answer: result.answer });
  assert.equal(projected.answer.validity, undefined);
  assert.equal(projected.answer.gm_dev_trace, undefined);
  assertPlayerSafe(projected);
});
