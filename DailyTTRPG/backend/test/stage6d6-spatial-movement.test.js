import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_RANGE_KINDS,
  CONCEALMENT_CATEGORIES,
  COVER_CATEGORIES,
  CREATURE_SIZE_CATEGORIES,
  DND5E_2014_RULESET,
  MOVEMENT_COST_POLICIES,
  PROXIMITY_STATES,
  SPATIAL_OPERATION_STATUSES,
  assertNoSpatialPlayerHiddenData,
  buildSpatialGmDevTrace,
  calculateMovementBudget,
  calculateTransitionCost,
  commitMovementSegment,
  compareCreatureSizes,
  createParticipantSpatialState,
  createSpatialRelationship,
  createZoneDefinition,
  createZoneTransition,
  detectOpportunityAttackCandidates,
  determineEngagement,
  determineThreatenedReach,
  evaluateExplicitRoute,
  evaluateRetreatRoute,
  isActionInRange,
  previewMovementRoute,
  projectSpatialForPlayer,
  releaseGrapple,
  resolveConcealmentVisibility,
  resolveCover,
  resolveCrawlingMovement,
  resolveDraggingMovement,
  resolveForcedMovement,
  resolveGrapple,
  resolveGrappleEscape,
  resolveReach,
  resolveRelativeProximity,
  resolveShove,
  resolveStandingFromProne,
  validateOccupiedSpacePassage,
  validatePlacement,
  validateTargetLegality,
} from '../src/engine/combat/spatialMovement.js';
import {
  CONDITION_IDS,
  createConditionInstance,
} from '../src/engine/combat/conditionStateLifecycle.js';

function participant(overrides = {}) {
  return {
    participant_id: 'pc-1',
    display_name: 'Avery',
    faction: 'player',
    current_zone_id: 'road',
    size: CREATURE_SIZE_CATEGORIES.MEDIUM,
    speed: 30,
    speed_walk: 30,
    normal_reach: 5,
    athletics_modifiers: [],
    acrobatics_modifiers: [],
    ...overrides,
  };
}

function enemy(overrides = {}) {
  return participant({
    participant_id: 'enemy-1',
    display_name: 'Rusk',
    faction: 'enemy',
    current_zone_id: 'road',
    ...overrides,
  });
}

function relationship(a, b, proximity) {
  return createSpatialRelationship({
    participant_a_id: a,
    participant_b_id: b,
    proximity,
  });
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

function route(overrides = {}) {
  return {
    source_zone_id: 'road',
    destination_zone_id: 'ditch',
    transitions: [
      createZoneTransition({
        transition_id: 'road-to-ditch',
        source_zone_id: 'road',
        destination_zone_id: 'ditch',
        base_cost: 10,
        known_hazards: ['loose_stones'],
        hidden_hazards: ['buried_snare'],
        ...overrides,
      }),
    ],
  };
}

test('6D.6 spatial relationships are pairwise and do not infer engagement from shared zones', () => {
  const relationships = [
    relationship('pc-1', 'enemy-1', PROXIMITY_STATES.ENGAGED),
    relationship('pc-1', 'ally-1', PROXIMITY_STATES.NEARBY),
    relationship('enemy-1', 'ally-1', PROXIMITY_STATES.DISTANT),
  ];

  assert.deepEqual(Object.values(PROXIMITY_STATES), ['engaged', 'nearby', 'distant', 'out_of_reach']);
  assert.equal(resolveRelativeProximity({ participant_a_id: 'pc-1', participant_b_id: 'enemy-1', relationships }).proximity, PROXIMITY_STATES.ENGAGED);
  assert.equal(resolveRelativeProximity({ participant_a_id: 'pc-1', participant_b_id: 'ally-1', relationships }).proximity, PROXIMITY_STATES.NEARBY);
  assert.equal(resolveRelativeProximity({ participant_a_id: 'pc-1', participant_b_id: 'unknown-1', relationships }).status, SPATIAL_OPERATION_STATUSES.INSUFFICIENT_CONTEXT);
  assert.equal(determineEngagement({ participant_a_id: 'pc-1', participant_b_id: 'enemy-1', relationships }).engaged, true);

  const sameZoneWithoutRelationship = resolveRelativeProximity({
    participant_a_id: 'pc-1',
    participant_b_id: 'enemy-2',
    relationships: [],
  });
  assert.equal(sameZoneWithoutRelationship.status, SPATIAL_OPERATION_STATUSES.INSUFFICIENT_CONTEXT);
});

test('6D.6 zones and movement routes require explicit authored transitions', () => {
  const road = createZoneDefinition({ zone_id: 'road', player_name: 'Grey Road', cover: COVER_CATEGORIES.HALF });
  assert.equal(road.ruleset.system, DND5E_2014_RULESET.system);
  assert.equal(road.ruleset.rules_version, DND5E_2014_RULESET.rules_version);

  const direct = evaluateExplicitRoute(route());
  assert.equal(direct.status, SPATIAL_OPERATION_STATUSES.VALID);
  assert.equal(direct.total_cost, 10);
  assert.deepEqual(direct.known_hazards, ['loose_stones']);
  assert.deepEqual(direct.hidden_hazards, ['buried_snare']);

  const missing = evaluateExplicitRoute({ source_zone_id: 'road', destination_zone_id: 'shrine', transitions: route().transitions });
  assert.equal(missing.status, SPATIAL_OPERATION_STATUSES.UNAVAILABLE);
  assert.equal(missing.reason, 'no_authored_route');

  const ambiguous = evaluateExplicitRoute({
    source_zone_id: 'road',
    destination_zone_id: 'ditch',
    transitions: [
      createZoneTransition({ transition_id: 'short', source_zone_id: 'road', destination_zone_id: 'ditch', base_cost: 5 }),
      createZoneTransition({ transition_id: 'muddy', source_zone_id: 'road', destination_zone_id: 'ditch', base_cost: 10, known_hazards: ['mud'] }),
    ],
  });
  assert.equal(ambiguous.status, SPATIAL_OPERATION_STATUSES.AMBIGUOUS);
});

test('6D.6 movement budgets use 5e 2014 movement hooks without turn orchestration', () => {
  const budget = calculateMovementBudget({
    participant: participant({ movement_spent: 10 }),
    dash_budget: 30,
    temporary_bonuses: [{ amount: 5 }],
    temporary_penalties: [{ amount: 5 }],
  });
  assert.equal(budget.total_movement_available, 60);
  assert.equal(budget.movement_remaining, 50);

  const grappled = calculateMovementBudget({
    participant: participant(),
    conditions: [condition(CONDITION_IDS.GRAPPLED)],
  });
  assert.equal(grappled.restricted, true);
  assert.equal(grappled.movement_remaining, 0);

  const frightened = calculateMovementBudget({
    participant: participant(),
    conditions: [condition(CONDITION_IDS.FRIGHTENED)],
    source_visible: true,
    movement_is_voluntary: true,
    current_proximity_rank: 2,
    proposed_proximity_rank: 1,
  });
  assert.equal(frightened.restricted, true);
});

test('6D.6 movement costs support normal difficult blocked special crawling and dragging policies', () => {
  assert.equal(calculateTransitionCost({ transition: route().transitions[0] }).cost, 10);

  const difficult = calculateTransitionCost({
    transition: createZoneTransition({
      transition_id: 'mud',
      source_zone_id: 'road',
      destination_zone_id: 'ditch',
      base_cost: 10,
      difficult_terrain: true,
    }),
  });
  assert.equal(difficult.cost, 20);
  assert.equal(difficult.difficult_applied, true);

  const blocked = calculateTransitionCost({
    transition: createZoneTransition({
      transition_id: 'blocked',
      source_zone_id: 'road',
      destination_zone_id: 'ditch',
      base_cost: 10,
      movement_cost_policy: MOVEMENT_COST_POLICIES.BLOCKED,
      hidden_reason: 'gm_only_barricade_state',
    }),
  });
  assert.equal(blocked.status, SPATIAL_OPERATION_STATUSES.BLOCKED);
  assert.equal(blocked.movement_spent, false);

  const specialCrawlDrag = calculateTransitionCost({
    transition: createZoneTransition({
      transition_id: 'climb',
      source_zone_id: 'road',
      destination_zone_id: 'ledge',
      movement_cost_policy: MOVEMENT_COST_POLICIES.SPECIAL,
      special_cost: 5,
      difficult_modifies_special_cost: true,
      difficult_terrain: true,
    }),
    crawling: true,
    dragging: true,
  });
  assert.equal(specialCrawlDrag.cost, 40);
  assert.deepEqual(specialCrawlDrag.trace_order, ['base', 'special', 'difficult', 'crawling', 'dragging']);
});

test('6D.6 preview is non-mutating and commit spends movement exactly once', () => {
  const input = {
    ...route(),
    participant: participant({ movement_spent: 0 }),
  };
  const preview = previewMovementRoute(input);
  assert.equal(preview.status, SPATIAL_OPERATION_STATUSES.PREVIEW);
  assert.equal(preview.mutates_state, false);
  assert.equal(preview.movement_spent, 0);

  const committed = commitMovementSegment(input);
  assert.equal(committed.status, SPATIAL_OPERATION_STATUSES.COMMITTED);
  assert.equal(committed.participant_after.current_zone_id, 'ditch');
  assert.equal(committed.participant_after.movement_spent, 10);
  assert.equal(committed.mutation_instructions[0].instruction_type, 'update_participant_spatial_state');

  const insufficient = commitMovementSegment({
    ...route({ base_cost: 40 }),
    participant: participant({ movement_spent: 0 }),
  });
  assert.equal(insufficient.status, SPATIAL_OPERATION_STATUSES.UNAVAILABLE);
  assert.equal(insufficient.movement_spent, 0);
});

test('6D.6 standing from prone and crawling spend movement without opening reaction resolution', () => {
  const prone = condition(CONDITION_IDS.PRONE);
  const standingPreview = resolveStandingFromProne({
    participant: participant(),
    conditions: [prone],
    preview_only: true,
  });
  assert.equal(standingPreview.status, SPATIAL_OPERATION_STATUSES.PREVIEW);
  assert.equal(standingPreview.mutates_state, false);
  assert.equal(standingPreview.standing_cost, 15);

  const standing = resolveStandingFromProne({
    participant: participant(),
    conditions: [prone],
  });
  assert.equal(standing.status, SPATIAL_OPERATION_STATUSES.COMMITTED);
  assert.equal(standing.standing_cost, 15);
  assert.equal(standing.participant_after.movement_spent, 15);
  assert.equal(standing.opportunity_attack_candidates.length, 0);

  const crawling = resolveCrawlingMovement({ transition: route().transitions[0] });
  assert.equal(crawling.cost, 20);
  assert.equal(crawling.condition_remains, true);
});

test('6D.6 cover and concealment are attacker-relative and remain separate mechanics', () => {
  const cover = resolveCover({
    sources: [
      { source_id: 'crate', category: COVER_CATEGORIES.HALF, attacker_id: 'enemy-1', target_id: 'pc-1' },
      { source_id: 'wall', category: COVER_CATEGORIES.THREE_QUARTERS, attacker_id: 'archer-1', target_id: 'pc-1' },
    ],
  });
  assert.equal(cover.cover_category, COVER_CATEGORIES.THREE_QUARTERS);
  assert.equal(cover.armor_class_bonus, 5);
  assert.equal(cover.dexterity_save_bonus, 5);

  const total = resolveCover({ sources: [{ category: COVER_CATEGORIES.TOTAL }] });
  assert.equal(total.direct_targeting_blocked, true);
  assert.equal(resolveCover({ sources: [{ category: COVER_CATEGORIES.TOTAL }], bypass_total_cover: true }).direct_targeting_blocked, false);

  const concealment = resolveConcealmentVisibility({ concealment: CONCEALMENT_CATEGORIES.HEAVY });
  assert.equal(concealment.armor_class_bonus, 0);
  assert.equal(concealment.hiding_context_available, true);
  assert.equal(resolveConcealmentVisibility({ concealment: CONCEALMENT_CATEGORIES.TOTAL_VISUAL_OBSTRUCTION }).sight_required_targeting_blocked, true);
  assert.equal(resolveConcealmentVisibility({ actor_blinded: true }).sight_required_targeting_blocked, true);
});

test('6D.6 reach range target legality and opportunity attack candidates are detected without resolving reactions', () => {
  const pc = participant({ relationships: [relationship('pc-1', 'enemy-1', PROXIMITY_STATES.ENGAGED)] });
  const rusk = enemy();
  assert.equal(resolveReach({ actor: pc, target: rusk }).can_reach_with_normal_melee, true);
  assert.equal(isActionInRange({ actor: pc, target: rusk, range_profile: { kind: ACTION_RANGE_KINDS.ENGAGED } }).legal, true);
  assert.equal(isActionInRange({ actor: pc, target: rusk, proximity: PROXIMITY_STATES.NEARBY, range_profile: { kind: ACTION_RANGE_KINDS.ENGAGED } }).legal, false);
  assert.equal(resolveReach({ actor: { ...pc, extended_reach_sources: [{ source_id: 'glaive', reach: 10 }] }, target: rusk, proximity: PROXIMITY_STATES.NEARBY }).can_reach_with_selected_action, true);

  const threatened = determineThreatenedReach({
    reactor: enemy({ extended_reach_sources: [{ source_id: 'polearm', reach: 10 }] }),
    mover: pc,
    proximity: PROXIMITY_STATES.NEARBY,
  });
  assert.equal(threatened.threatens, true);

  const candidates = detectOpportunityAttackCandidates({
    mover: pc,
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
    potential_reactors: [rusk],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].resolved, false);
  assert.deepEqual(detectOpportunityAttackCandidates({ forced_movement: true, before_proximity: PROXIMITY_STATES.ENGAGED, after_proximity: PROXIMITY_STATES.NEARBY, potential_reactors: [rusk] }), []);
  assert.deepEqual(detectOpportunityAttackCandidates({ disengage_protected: true, before_proximity: PROXIMITY_STATES.ENGAGED, after_proximity: PROXIMITY_STATES.NEARBY, potential_reactors: [rusk] }), []);

  const legal = validateTargetLegality({
    actor: pc,
    target: rusk,
    range_profile: { kind: ACTION_RANGE_KINDS.ENGAGED },
    cover: { sources: [] },
    visibility: { concealment: CONCEALMENT_CATEGORIES.NONE },
    sight_required: true,
  });
  assert.equal(legal.legal, true);
  assert.equal(validateTargetLegality({ actor: pc, target: rusk, range_profile: { kind: ACTION_RANGE_KINDS.ENGAGED }, cover: { sources: [{ category: COVER_CATEGORIES.TOTAL }] } }).reason, 'total_cover');
});

test('6D.6 creature size occupied spaces and placement are validated without grid coordinates', () => {
  assert.equal(compareCreatureSizes(CREATURE_SIZE_CATEGORIES.MEDIUM, CREATURE_SIZE_CATEGORIES.HUGE).difference, -2);
  assert.equal(validateOccupiedSpacePassage({ passes_through_occupied_space: true, occupant_hostile: false, mover_size: CREATURE_SIZE_CATEGORIES.MEDIUM, occupant_size: CREATURE_SIZE_CATEGORIES.MEDIUM }).legal, true);
  assert.equal(validateOccupiedSpacePassage({ passes_through_occupied_space: true, occupant_hostile: true, mover_size: CREATURE_SIZE_CATEGORIES.MEDIUM, occupant_size: CREATURE_SIZE_CATEGORIES.HUGE }).legal, true);
  assert.equal(validateOccupiedSpacePassage({ passes_through_occupied_space: true, occupant_hostile: true, mover_size: CREATURE_SIZE_CATEGORIES.MEDIUM, occupant_size: CREATURE_SIZE_CATEGORIES.MEDIUM }).legal, false);
  assert.equal(validateOccupiedSpacePassage({ ends_in_occupied_space: true, authored_end_overlap_allowed: false, mover_size: CREATURE_SIZE_CATEGORIES.SMALL, occupant_size: CREATURE_SIZE_CATEGORIES.SMALL }).legal, false);

  const placement = validatePlacement({
    zones: [createZoneDefinition({ zone_id: 'road' })],
    participant: participant({ current_zone_id: 'road' }),
  });
  assert.equal(placement.status, SPATIAL_OPERATION_STATUSES.VALID);
  assert.equal(validatePlacement({ zones: [createZoneDefinition({ zone_id: 'road' })], participant: participant({ current_zone_id: 'shrine' }) }).reason, 'invalid_zone');
  assert.equal(validatePlacement({ zones: [createZoneDefinition({ zone_id: 'road' })], participant: participant({ position_tags: ['concealed'], concealment: CONCEALMENT_CATEGORIES.NONE }) }).reason, 'contradictory_concealment_tag');
});

test('6D.6 forced movement spends no movement and does not trigger ordinary opportunity attacks', () => {
  const forced = resolveForcedMovement({
    ...route(),
    participant: participant(),
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
  });
  assert.equal(forced.status, SPATIAL_OPERATION_STATUSES.COMMITTED);
  assert.equal(forced.movement_spent, 0);
  assert.equal(forced.participant_after.current_zone_id, 'ditch');
  assert.equal(forced.opportunity_attack_candidates.length, 0);
});

test('6D.6 grapple release escape dragging and shove follow 5e 2014 spatial contracts', () => {
  const pc = participant({ athletics_modifiers: [{ modifier_id: 'str', value: 2 }] });
  const rusk = enemy({ athletics_modifiers: [{ modifier_id: 'str', value: 1 }] });

  const grapple = resolveGrapple({
    actor: pc,
    target: rusk,
    attack_replacement_available: true,
    proximity: PROXIMITY_STATES.ENGAGED,
    actor_roll_override: 15,
    target_roll_override: 5,
  });
  assert.equal(grapple.status, 'succeeded');
  assert.equal(grapple.condition_application.effective_conditions.some((entry) => entry.condition_type === CONDITION_IDS.GRAPPLED), true);
  assert.equal(grapple.movement_result, null);
  assert.equal(resolveGrapple({ actor: pc, target: enemy({ size: CREATURE_SIZE_CATEGORIES.HUGE }), attack_replacement_available: true, actor_roll_override: 20, target_roll_override: 1 }).reason, 'target_too_large');

  const grappled = condition(CONDITION_IDS.GRAPPLED, { target_participant_id: 'enemy-1', source_participant_id: 'pc-1' });
  const escape = resolveGrappleEscape({
    actor: rusk,
    grappler: pc,
    action_permission: true,
    escape_skill: 'acrobatics',
    actor_roll_override: 18,
    grappler_roll_override: 5,
    conditions: [grappled],
  });
  assert.equal(escape.status, 'escaped');
  assert.equal(escape.contest.actor_check.ability, 'DEX');
  assert.equal(escape.condition_removal.remaining_conditions.length, 0);

  const released = releaseGrapple({ actor: pc, conditions: [grappled] });
  assert.equal(released.status, 'released');
  assert.equal(released.action_cost, 0);

  const dragging = resolveDraggingMovement({
    ...route(),
    grappler: pc,
    target: rusk,
    grapple_relationship_remains_valid: true,
  });
  assert.equal(dragging.status, SPATIAL_OPERATION_STATUSES.COMMITTED);
  assert.equal(dragging.dragging_applied, true);
  assert.equal(dragging.grappler_after.current_zone_id, 'ditch');
  assert.equal(dragging.target_after.current_zone_id, 'ditch');

  const shoveProne = resolveShove({
    actor: pc,
    target: rusk,
    attack_replacement_available: true,
    proximity: PROXIMITY_STATES.ENGAGED,
    actor_roll_override: 16,
    target_roll_override: 3,
    shove_choice: 'prone',
  });
  assert.equal(shoveProne.status, 'succeeded');
  assert.equal(shoveProne.condition_application.effective_conditions.some((entry) => entry.condition_type === CONDITION_IDS.PRONE), true);

  const ambiguousPush = resolveShove({
    actor: pc,
    target: rusk,
    attack_replacement_available: true,
    proximity: PROXIMITY_STATES.ENGAGED,
    actor_roll_override: 16,
    target_roll_override: 3,
    shove_choice: 'push',
  });
  assert.equal(ambiguousPush.status, SPATIAL_OPERATION_STATUSES.AMBIGUOUS);

  const push = resolveShove({
    actor: pc,
    target: rusk,
    attack_replacement_available: true,
    proximity: PROXIMITY_STATES.ENGAGED,
    actor_roll_override: 16,
    target_roll_override: 3,
    shove_choice: 'push',
    destination_proximity: PROXIMITY_STATES.NEARBY,
  });
  assert.equal(push.status, 'succeeded');
  assert.equal(push.forced_movement.movement_spent, 0);
  assert.deepEqual(push.forced_movement.opportunity_attack_candidates, []);
});

test('6D.6 retreat routes evaluate spatial completion without ending combat', () => {
  const retreat = evaluateRetreatRoute({
    ...route({ retreat_route_id: 'grey-road-retreat' }),
    participant: participant(),
    before_proximity: PROXIMITY_STATES.ENGAGED,
    after_proximity: PROXIMITY_STATES.NEARBY,
    potential_reactors: [enemy()],
    mover: participant(),
  });
  assert.equal(retreat.status, SPATIAL_OPERATION_STATUSES.VALID);
  assert.equal(retreat.spatial_completion_condition_satisfied, true);
  assert.equal(retreat.combat_ended, false);
  assert.equal(retreat.known_opportunity_attack_candidates.length, 1);
});

test('6D.6 player projection strips hidden spatial diagnostics while GM/dev trace retains them', () => {
  const gmPayload = {
    participant: createParticipantSpatialState({
      ...participant({ gm_dev_provenance: { source_path: 'content/secret.json' } }),
    }),
    route: evaluateExplicitRoute(route()),
    hidden_reason: 'secret door state',
    gm_dev_trace: { mutation_plan: ['update hidden field'] },
  };
  const player = projectSpatialForPlayer(gmPayload);
  assertNoSpatialPlayerHiddenData(player);
  assert.equal(JSON.stringify(player).includes('secret'), false);
  assert.equal(JSON.stringify(player).includes('source_path'), false);

  const trace = buildSpatialGmDevTrace(gmPayload);
  assert.equal(trace.trace_kind, 'combat_spatial_movement');
  assert.equal(trace.payload.hidden_reason, 'secret door state');
  assert.equal(trace.payload.gm_dev_trace.mutation_plan[0], 'update hidden field');
});
