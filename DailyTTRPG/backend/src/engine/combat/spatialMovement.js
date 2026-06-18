import {
  CONDITION_CONTEXT_KINDS,
  CONDITION_IDS,
  CONDITION_LIFECYCLE_EVENTS,
  DND5E_2014_RULESET,
  applyCondition,
  evaluateConditionEffects,
  evaluateFrightenedMovement,
  evaluateProneCrawl,
  evaluateProneStanding,
  processConditionLifecycleEvent,
  removeCondition,
} from './conditionStateLifecycle.js';
import {
  ROLL_GENERATION_ORIGINS,
  resolveContestedAbilityCheck,
  resolveRulesetIdentity,
} from './rulesResolution.js';

export { DND5E_2014_RULESET, ROLL_GENERATION_ORIGINS };

export const PROXIMITY_STATES = Object.freeze({
  ENGAGED: 'engaged',
  NEARBY: 'nearby',
  DISTANT: 'distant',
  OUT_OF_REACH: 'out_of_reach',
});

export const MOVEMENT_COST_POLICIES = Object.freeze({
  NORMAL: 'normal',
  DIFFICULT: 'difficult',
  BLOCKED: 'blocked',
  SPECIAL: 'special',
});

export const COVER_CATEGORIES = Object.freeze({
  NONE: 'none',
  HALF: 'half',
  THREE_QUARTERS: 'three_quarters',
  TOTAL: 'total',
});

export const CONCEALMENT_CATEGORIES = Object.freeze({
  NONE: 'none',
  LIGHT: 'light',
  HEAVY: 'heavy',
  TOTAL_VISUAL_OBSTRUCTION: 'total_visual_obstruction',
});

export const CREATURE_SIZE_CATEGORIES = Object.freeze({
  TINY: 'tiny',
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  HUGE: 'huge',
  GARGANTUAN: 'gargantuan',
});

export const SPATIAL_OPERATION_STATUSES = Object.freeze({
  VALID: 'valid',
  PREVIEW: 'preview',
  COMMITTED: 'committed',
  UNAVAILABLE: 'unavailable',
  BLOCKED: 'blocked',
  AMBIGUOUS: 'ambiguous',
  INSUFFICIENT_CONTEXT: 'insufficient_context',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const ACTION_RANGE_KINDS = Object.freeze({
  SELF: 'self',
  ENGAGED: 'engaged',
  NEARBY: 'nearby',
  DISTANT: 'distant',
  UP_TO_PROXIMITY: 'up_to_proximity',
  SAME_ZONE: 'same_zone',
  SPECIFIED_ZONE: 'specified_zone',
  ZONE_RELATIONSHIP: 'zone_relationship',
  EXTENDED_REACH: 'extended_reach',
  VISIBLE_PARTICIPANT: 'visible_participant',
  SPECIAL: 'special',
});

const SIZE_ORDER = Object.freeze([
  CREATURE_SIZE_CATEGORIES.TINY,
  CREATURE_SIZE_CATEGORIES.SMALL,
  CREATURE_SIZE_CATEGORIES.MEDIUM,
  CREATURE_SIZE_CATEGORIES.LARGE,
  CREATURE_SIZE_CATEGORIES.HUGE,
  CREATURE_SIZE_CATEGORIES.GARGANTUAN,
]);

const PROXIMITY_RANK = Object.freeze({
  [PROXIMITY_STATES.ENGAGED]: 0,
  [PROXIMITY_STATES.NEARBY]: 1,
  [PROXIMITY_STATES.DISTANT]: 2,
  [PROXIMITY_STATES.OUT_OF_REACH]: 3,
});

const COVER_RANK = Object.freeze({
  [COVER_CATEGORIES.NONE]: 0,
  [COVER_CATEGORIES.HALF]: 1,
  [COVER_CATEGORIES.THREE_QUARTERS]: 2,
  [COVER_CATEGORIES.TOTAL]: 3,
});

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'hidden_hazard',
  'hiddenHazard',
  'hidden_reason',
  'hiddenReason',
  'hidden_route',
  'hiddenRoute',
  'gm_dev',
  'trace',
  'provenance',
  'source_path',
  'mutation_plan',
  'reaction_secret',
  'concealed_participants',
  'internal_name',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(value).toLowerCase();
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stripPlayerProhibitedFields(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stripPlayerProhibitedFields);
  }
  for (const key of Object.keys(value)) {
    const normalized = normalizedKey(key);
    if (
      normalized.includes('trace') ||
      [
        'gm_dev_trace',
        'gm_dev_provenance',
        'gmdevprovenance',
        'hidden_hazards',
        'hiddenhazards',
        'hidden_reason',
        'hiddenreason',
        'concealed_participants',
        'concealedparticipants',
        'internal_name',
        'internalname',
        'mutation_plan',
        'mutationplan',
        'source_path',
        'sourcepath',
        'trace',
        'provenance',
      ].includes(normalized)
    ) {
      delete value[key];
      continue;
    }
    stripPlayerProhibitedFields(value[key]);
  }
  return value;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function spatialError(message, code = 'COMBAT_SPATIAL_VALIDATION_FAILED') {
  const error = new Error(message);
  error.code = code;
  error.player_safe_message = 'That combat position cannot be resolved yet.';
  return error;
}

function normalizeEnum(value, allowed, fallback, label) {
  const normalized = normalizedKey(value);
  if (!normalized) {
    return fallback;
  }
  if (!allowed.includes(normalized)) {
    throw spatialError(`Unsupported ${label} "${value}".`, `UNSUPPORTED_${label.toUpperCase()}`);
  }
  return normalized;
}

function participantId(input = {}) {
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function pairKey(a, b) {
  const ids = [cleanText(a), cleanText(b)].sort();
  return `${ids[0]}::${ids[1]}`;
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function assertNoExecutableSpatialAuthoring(value, path = 'spatial') {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'function') {
      throw spatialError(`Spatial definitions cannot include executable functions at ${path}.`, 'EXECUTABLE_SPATIAL_AUTHORING_NOT_ALLOWED');
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (typeof nested === 'function' || ['handler', 'script', 'code', 'eval'].includes(normalized)) {
      throw spatialError(`Spatial definitions cannot include executable code at ${path}.${key}.`, 'EXECUTABLE_SPATIAL_AUTHORING_NOT_ALLOWED');
    }
    if (nested && typeof nested === 'object') {
      assertNoExecutableSpatialAuthoring(nested, `${path}.${key}`);
    }
  }
}

export function validateCreatureSize(size) {
  return normalizeEnum(size, Object.values(CREATURE_SIZE_CATEGORIES), null, 'creature_size');
}

export function compareCreatureSizes(left, right) {
  const leftSize = validateCreatureSize(left);
  const rightSize = validateCreatureSize(right);
  return {
    left_size: leftSize,
    right_size: rightSize,
    difference: SIZE_ORDER.indexOf(leftSize) - SIZE_ORDER.indexOf(rightSize),
  };
}

export function createZoneDefinition(input = {}) {
  assertNoExecutableSpatialAuthoring(input, 'zone');
  const zoneId = cleanText(input.zone_id ?? input.zoneId ?? input.id);
  if (!zoneId) {
    throw spatialError('Zone definitions require a zone id.', 'ZONE_ID_REQUIRED');
  }
  return {
    zone_id: zoneId,
    player_name: cleanText(input.player_name ?? input.playerName ?? input.name) || zoneId,
    internal_name: cleanText(input.internal_name ?? input.internalName ?? input.name) || zoneId,
    ruleset: resolveRulesetIdentity(input.ruleset ?? DND5E_2014_RULESET),
    encounter_id: cleanText(input.encounter_id ?? input.encounterId) || null,
    player_description: cleanText(input.player_description ?? input.playerDescription ?? input.description) || null,
    visible: input.visible === undefined ? true : Boolean(input.visible),
    terrain: cloneSerializable(input.terrain ?? {}),
    cover: normalizeEnum(input.cover, Object.values(COVER_CATEGORIES), COVER_CATEGORIES.NONE, 'cover_category'),
    concealment: normalizeEnum(input.concealment, Object.values(CONCEALMENT_CATEGORIES), CONCEALMENT_CATEGORIES.NONE, 'concealment_category'),
    elevation: cleanText(input.elevation) || 'level',
    difficult_terrain: Boolean(input.difficult_terrain ?? input.difficultTerrain),
    environmental_objects: asArray(input.environmental_objects ?? input.environmentalObjects),
    authored_hazards: asArray(input.authored_hazards ?? input.authoredHazards),
    escape_route_ids: asArray(input.escape_route_ids ?? input.escapeRouteIds),
    target_group_tags: asArray(input.target_group_tags ?? input.targetGroupTags),
    capacity: input.capacity ?? null,
    crowding: cloneSerializable(input.crowding ?? null),
    outgoing_transition_ids: asArray(input.outgoing_transition_ids ?? input.outgoingTransitionIds),
    incoming_transition_ids: asArray(input.incoming_transition_ids ?? input.incomingTransitionIds),
    authored_fallback_placement: cloneSerializable(input.authored_fallback_placement ?? input.authoredFallbackPlacement ?? null),
    gm_dev_provenance: cloneSerializable(input.gm_dev_provenance ?? input.gmDevProvenance ?? null),
  };
}

export function createZoneTransition(input = {}) {
  assertNoExecutableSpatialAuthoring(input, 'zone_transition');
  const transitionId = cleanText(input.transition_id ?? input.transitionId ?? input.id);
  if (!transitionId) {
    throw spatialError('Zone transitions require a transition id.', 'ZONE_TRANSITION_ID_REQUIRED');
  }
  return {
    transition_id: transitionId,
    source_zone_id: cleanText(input.source_zone_id ?? input.sourceZoneId),
    destination_zone_id: cleanText(input.destination_zone_id ?? input.destinationZoneId),
    bidirectional: Boolean(input.bidirectional),
    visible: input.visible === undefined ? true : Boolean(input.visible),
    movement_cost_policy: normalizeEnum(
      input.movement_cost_policy ?? input.movementCostPolicy ?? input.cost_policy ?? input.costPolicy,
      Object.values(MOVEMENT_COST_POLICIES),
      MOVEMENT_COST_POLICIES.NORMAL,
      'movement_cost_policy'
    ),
    base_cost: input.base_cost ?? input.baseCost ?? null,
    blocked: Boolean(input.blocked),
    blocked_visible_reason: cleanText(input.blocked_visible_reason ?? input.blockedVisibleReason) || null,
    hidden_reason: cleanText(input.hidden_reason ?? input.hiddenReason) || null,
    difficult_terrain: Boolean(input.difficult_terrain ?? input.difficultTerrain),
    difficult_sources: asArray(input.difficult_sources ?? input.difficultSources),
    special_cost: input.special_cost ?? input.specialCost ?? null,
    difficult_modifies_special_cost: input.difficult_modifies_special_cost ?? input.difficultModifiesSpecialCost ?? false,
    requirements: cloneSerializable(input.requirements ?? {}),
    known_hazards: asArray(input.known_hazards ?? input.knownHazards),
    hidden_hazards: asArray(input.hidden_hazards ?? input.hiddenHazards),
    cover_change: cloneSerializable(input.cover_change ?? input.coverChange ?? null),
    concealment_change: cloneSerializable(input.concealment_change ?? input.concealmentChange ?? null),
    proximity_changes: cloneSerializable(input.proximity_changes ?? input.proximityChanges ?? {}),
    position_tag_changes: cloneSerializable(input.position_tag_changes ?? input.positionTagChanges ?? {}),
    participant_size_restrictions: cloneSerializable(input.participant_size_restrictions ?? input.participantSizeRestrictions ?? null),
    retreat_route_id: cleanText(input.retreat_route_id ?? input.retreatRouteId) || null,
    priority: toInteger(input.priority, 0),
    player_description: cleanText(input.player_description ?? input.playerDescription ?? input.description) || null,
    gm_dev_provenance: cloneSerializable(input.gm_dev_provenance ?? input.gmDevProvenance ?? null),
  };
}

export function createSpatialRelationship(input = {}) {
  const a = cleanText(input.participant_a_id ?? input.participantAId ?? input.participant_a ?? input.a);
  const b = cleanText(input.participant_b_id ?? input.participantBId ?? input.participant_b ?? input.b);
  if (!a || !b || a === b) {
    throw spatialError('Spatial relationships require two distinct participants.', 'SPATIAL_RELATIONSHIP_PARTICIPANTS_REQUIRED');
  }
  return {
    relationship_id: cleanText(input.relationship_id ?? input.relationshipId) || pairKey(a, b),
    participant_a_id: a,
    participant_b_id: b,
    proximity: normalizeEnum(input.proximity, Object.values(PROXIMITY_STATES), PROXIMITY_STATES.NEARBY, 'proximity'),
    symmetric: input.symmetric === undefined ? true : Boolean(input.symmetric),
    source_state_version: cleanText(input.source_state_version ?? input.sourceStateVersion) || null,
    tags: asArray(input.tags),
  };
}

export function createParticipantSpatialState(input = {}) {
  const id = participantId(input);
  if (!id) {
    throw spatialError('Participant spatial state requires a participant id.', 'PARTICIPANT_SPATIAL_ID_REQUIRED');
  }
  return {
    participant_id: id,
    current_zone_id: cleanText(input.current_zone_id ?? input.currentZoneId ?? input.zone_id ?? input.zoneId) || null,
    relationships: asArray(input.relationships).map(createSpatialRelationship),
    cover_relationships: asArray(input.cover_relationships ?? input.coverRelationships),
    elevation: cleanText(input.elevation) || 'level',
    position_tags: asArray(input.position_tags ?? input.positionTags),
    visibility: cloneSerializable(input.visibility ?? {}),
    concealment: normalizeEnum(input.concealment, Object.values(CONCEALMENT_CATEGORIES), CONCEALMENT_CATEGORIES.NONE, 'concealment_category'),
    size: validateCreatureSize(input.size),
    normal_reach: Math.max(toInteger(input.normal_reach ?? input.normalReach, 5), 0),
    extended_reach_sources: asArray(input.extended_reach_sources ?? input.extendedReachSources),
    base_movement_budget: Math.max(toInteger(input.base_movement_budget ?? input.baseMovementBudget ?? input.speed ?? input.speed_walk ?? input.speedWalk), 0),
    current_movement_available: Math.max(toInteger(input.current_movement_available ?? input.currentMovementAvailable ?? input.movement_remaining ?? input.movementRemaining ?? input.speed ?? input.speed_walk ?? input.speedWalk), 0),
    movement_spent: Math.max(toInteger(input.movement_spent ?? input.movementSpent), 0),
    temporary_movement_modifiers: asArray(input.temporary_movement_modifiers ?? input.temporaryMovementModifiers),
    movement_restrictions: asArray(input.movement_restrictions ?? input.movementRestrictions),
    occupied_space: cloneSerializable(input.occupied_space ?? input.occupiedSpace ?? null),
    last_committed_movement_segment: cloneSerializable(input.last_committed_movement_segment ?? input.lastCommittedMovementSegment ?? null),
    source_state_version: cleanText(input.source_state_version ?? input.sourceStateVersion) || null,
    gm_dev_provenance: cloneSerializable(input.gm_dev_provenance ?? input.gmDevProvenance ?? null),
  };
}

function relationshipFor(a, b, relationships = []) {
  const key = pairKey(a, b);
  return asArray(relationships).map(createSpatialRelationship).find((relationship) => relationship.relationship_id === key || pairKey(relationship.participant_a_id, relationship.participant_b_id) === key);
}

export function resolveRelativeProximity(input = {}) {
  const a = cleanText(input.participant_a_id ?? input.participantAId ?? input.actor_id ?? input.actorId);
  const b = cleanText(input.participant_b_id ?? input.participantBId ?? input.target_id ?? input.targetId);
  const relationship = relationshipFor(a, b, input.relationships ?? input.spatial_state?.relationships ?? input.spatialState?.relationships ?? []);
  if (!relationship) {
    return {
      status: SPATIAL_OPERATION_STATUSES.INSUFFICIENT_CONTEXT,
      proximity: null,
      player_safe_summary: 'No authored proximity relationship is available.',
    };
  }
  return {
    status: SPATIAL_OPERATION_STATUSES.VALID,
    proximity: relationship.proximity,
    relationship,
  };
}

export function determineEngagement(input = {}) {
  const proximity = input.proximity ?? resolveRelativeProximity(input).proximity;
  return {
    engaged: proximity === PROXIMITY_STATES.ENGAGED,
    proximity,
  };
}

export function calculateMovementBudget(input = {}) {
  const participant = input.participant ?? input.spatial_state ?? input.spatialState ?? {};
  const base = Math.max(toInteger(input.base_movement_budget ?? input.baseMovementBudget ?? participant.base_movement_budget ?? participant.baseMovementBudget ?? participant.speed ?? participant.speed_walk ?? participant.speedWalk), 0);
  const bonuses = asArray(input.temporary_bonuses ?? input.temporaryBonuses ?? participant.temporary_movement_modifiers).reduce((sum, entry) => sum + Math.max(toInteger(entry.amount ?? entry.value ?? entry), 0), 0);
  const penalties = asArray(input.temporary_penalties ?? input.temporaryPenalties).reduce((sum, entry) => sum + Math.max(toInteger(entry.amount ?? entry.value ?? entry), 0), 0);
  const dashBudget = Math.max(toInteger(input.dash_budget ?? input.dashBudget), 0);
  const spent = Math.max(toInteger(input.movement_spent ?? input.movementSpent ?? participant.movement_spent ?? participant.movementSpent), 0);
  const conditionEffects = evaluateConditionEffects({
    participant,
    conditions: input.conditions ?? [],
    context_kind: CONDITION_CONTEXT_KINDS.MOVEMENT,
    source_visible: input.source_visible,
    movement_is_voluntary: input.movement_is_voluntary,
    current_proximity_rank: input.current_proximity_rank,
    proposed_proximity_rank: input.proposed_proximity_rank,
  });
  const restricted = conditionEffects.speed_zero || conditionEffects.movement_allowed === false || conditionEffects.movement_decision === 'illegal_willingly_approaches_fear_source';
  const total = restricted ? 0 : Math.max(base + bonuses + dashBudget - penalties, 0);
  return {
    base_movement_budget: base,
    temporary_bonuses: bonuses,
    temporary_penalties: penalties,
    dash_budget: dashBudget,
    movement_spent: spent,
    movement_remaining: Math.max(total - spent, 0),
    total_movement_available: total,
    restricted,
    restriction_sources: conditionEffects.source_conditions,
    condition_effects: cloneSerializable(conditionEffects),
  };
}

export function calculateTransitionCost(input = {}) {
  const transition = createZoneTransition(input.transition ?? input);
  if (transition.blocked || transition.movement_cost_policy === MOVEMENT_COST_POLICIES.BLOCKED) {
    return {
      status: SPATIAL_OPERATION_STATUSES.BLOCKED,
      cost: null,
      visible_reason: transition.blocked_visible_reason ?? 'That route is blocked.',
      hidden_reason: transition.hidden_reason,
      movement_spent: false,
    };
  }
  const encounterDefaultCost = input.encounter_default_cost ?? input.encounterDefaultCost ?? input.default_cost ?? input.defaultCost;
  const special = transition.movement_cost_policy === MOVEMENT_COST_POLICIES.SPECIAL;
  const base = transition.base_cost ?? encounterDefaultCost ?? (special ? transition.special_cost : null);
  if (base === null || base === undefined) {
    return {
      status: SPATIAL_OPERATION_STATUSES.INSUFFICIENT_CONTEXT,
      cost: null,
      player_safe_summary: 'This transition does not define a movement cost.',
    };
  }
  let cost = Math.max(toInteger(base), 0);
  const difficultSources = [...asArray(transition.difficult_sources), ...asArray(input.difficult_sources ?? input.difficultSources)];
  const isDifficult = transition.difficult_terrain || transition.movement_cost_policy === MOVEMENT_COST_POLICIES.DIFFICULT || difficultSources.length > 0;
  if (special) {
    if (transition.special_cost === null || transition.special_cost === undefined || Number.isNaN(Number(transition.special_cost))) {
      throw spatialError('Special movement cost must be numeric.', 'INVALID_SPECIAL_MOVEMENT_COST');
    }
    cost = Math.max(toInteger(transition.special_cost), 0);
  }
  if (isDifficult && (!special || transition.difficult_modifies_special_cost)) {
    cost *= 2;
  }
  if (input.crawling) {
    cost *= 2;
  }
  if (input.dragging) {
    cost *= 2;
  }
  return {
    status: SPATIAL_OPERATION_STATUSES.VALID,
    transition_id: transition.transition_id,
    cost,
    base_cost: Math.max(toInteger(base), 0),
    difficult_applied: isDifficult,
    difficult_sources: difficultSources,
    crawling_applied: Boolean(input.crawling),
    dragging_applied: Boolean(input.dragging),
    special_cost_applied: special,
    trace_order: ['base', special ? 'special' : null, isDifficult ? 'difficult' : null, input.crawling ? 'crawling' : null, input.dragging ? 'dragging' : null].filter(Boolean),
  };
}

export function evaluateExplicitRoute(input = {}) {
  const transitions = asArray(input.transitions).map(createZoneTransition);
  const sourceZoneId = cleanText(input.source_zone_id ?? input.sourceZoneId);
  const destinationZoneId = cleanText(input.destination_zone_id ?? input.destinationZoneId);
  const selectedTransitionIds = asArray(input.selected_transition_ids ?? input.selectedTransitionIds);
  if (selectedTransitionIds.length > 0) {
    const selected = selectedTransitionIds.map((id) => transitions.find((transition) => transition.transition_id === cleanText(id)));
    if (selected.some((transition) => !transition)) {
      return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'selected_transition_missing' };
    }
    return buildRouteFromSelected({ selected, sourceZoneId, destinationZoneId, encounterDefaultCost: input.encounter_default_cost ?? input.encounterDefaultCost });
  }
  const candidates = transitions
    .filter((transition) => transition.source_zone_id === sourceZoneId && transition.destination_zone_id === destinationZoneId && transition.visible !== false)
    .sort((a, b) => a.priority - b.priority || a.transition_id.localeCompare(b.transition_id));
  if (candidates.length === 0) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'no_authored_route' };
  }
  if (candidates.length > 1) {
    const material = new Set(candidates.map((transition) => JSON.stringify({
      cost: calculateTransitionCost({ transition, encounter_default_cost: input.encounter_default_cost ?? input.encounterDefaultCost }).cost,
      hazards: transition.known_hazards.length,
      blocked: transition.blocked,
      cover: transition.cover_change,
    })));
    if (material.size > 1) {
      return {
        status: SPATIAL_OPERATION_STATUSES.AMBIGUOUS,
        reason: 'materially_different_routes_require_selection',
        route_options: candidates.map((transition) => transition.transition_id),
      };
    }
  }
  return buildRouteFromSelected({ selected: [candidates[0]], sourceZoneId, destinationZoneId, encounterDefaultCost: input.encounter_default_cost ?? input.encounterDefaultCost });
}

function buildRouteFromSelected({ selected, sourceZoneId, destinationZoneId, encounterDefaultCost }) {
  let current = sourceZoneId;
  let totalCost = 0;
  const ordered = [];
  for (const transition of selected) {
    if (transition.source_zone_id !== current) {
      return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'directed_edge_mismatch' };
    }
    const cost = calculateTransitionCost({ transition, encounter_default_cost: encounterDefaultCost });
    if (cost.status !== SPATIAL_OPERATION_STATUSES.VALID) {
      return { status: cost.status, reason: cost.visible_reason ?? cost.player_safe_summary, transition_id: transition.transition_id };
    }
    totalCost += cost.cost;
    ordered.push({ transition, cost });
    current = transition.destination_zone_id;
  }
  if (current !== destinationZoneId) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'route_does_not_reach_destination' };
  }
  return {
    status: SPATIAL_OPERATION_STATUSES.VALID,
    ordered_transitions: ordered,
    total_cost: totalCost,
    known_hazards: ordered.flatMap((entry) => entry.transition.known_hazards),
    hidden_hazards: ordered.flatMap((entry) => entry.transition.hidden_hazards),
  };
}

export function previewMovementRoute(input = {}) {
  const route = input.route ?? evaluateExplicitRoute(input);
  const budget = calculateMovementBudget(input);
  const visibleRisks = asArray(route.known_hazards);
  return {
    status: route.status === SPATIAL_OPERATION_STATUSES.VALID && budget.movement_remaining >= route.total_cost
      ? SPATIAL_OPERATION_STATUSES.PREVIEW
      : route.status === SPATIAL_OPERATION_STATUSES.VALID
        ? SPATIAL_OPERATION_STATUSES.UNAVAILABLE
        : route.status,
    mutates_state: false,
    movement_spent: 0,
    total_cost: route.total_cost ?? null,
    movement_remaining: budget.movement_remaining,
    visible_risks: visibleRisks,
    player_safe_summary: route.status === SPATIAL_OPERATION_STATUSES.VALID
      ? 'Preview only. Movement is not spent yet.'
      : 'That route is not currently available.',
    gm_dev_trace: { route, budget, hidden_hazards: asArray(route.hidden_hazards) },
  };
}

export function commitMovementSegment(input = {}) {
  const participant = createParticipantSpatialState(input.participant ?? input.spatial_state ?? input.spatialState);
  const route = input.route ?? evaluateExplicitRoute(input);
  const budget = calculateMovementBudget({ ...input, participant });
  if (route.status !== SPATIAL_OPERATION_STATUSES.VALID) {
    return {
      status: route.status,
      participant,
      movement_spent: 0,
      player_safe_summary: 'That movement route is not available.',
      gm_dev_trace: { route, budget },
    };
  }
  if (budget.movement_remaining < route.total_cost) {
    return {
      status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE,
      participant,
      movement_spent: 0,
      player_safe_summary: 'There is not enough movement remaining.',
      gm_dev_trace: { route, budget },
    };
  }
  const last = route.ordered_transitions.at(-1).transition;
  const after = {
    ...participant,
    current_zone_id: last.destination_zone_id,
    movement_spent: participant.movement_spent + route.total_cost,
    current_movement_available: Math.max(budget.movement_remaining - route.total_cost, 0),
    last_committed_movement_segment: {
      route_transition_ids: route.ordered_transitions.map((entry) => entry.transition.transition_id),
      cost: route.total_cost,
    },
  };
  return {
    status: SPATIAL_OPERATION_STATUSES.COMMITTED,
    participant_before: participant,
    participant_after: after,
    movement_spent: route.total_cost,
    mutation_instructions: [{ instruction_type: 'update_participant_spatial_state', participant: after }],
    known_hazards: route.known_hazards,
    gm_dev_trace: { route, budget, hidden_hazards: route.hidden_hazards },
  };
}

export function resolveStandingFromProne(input = {}) {
  const participant = createParticipantSpatialState(input.participant ?? input.spatial_state ?? input.spatialState);
  const previewOnly = Boolean(input.preview_only ?? input.previewOnly);
  const standing = evaluateProneStanding({
    current_speed: participant.base_movement_budget,
    movement_remaining: participant.current_movement_available,
  });
  if (!standing.can_stand) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: standing.reason, standing_cost: standing.standing_cost, mutates_state: false };
  }
  if (previewOnly) {
    return { status: SPATIAL_OPERATION_STATUSES.PREVIEW, standing_cost: standing.standing_cost, mutates_state: false, opportunity_attack_candidates: [] };
  }
  return {
    status: SPATIAL_OPERATION_STATUSES.COMMITTED,
    standing_cost: standing.standing_cost,
    participant_after: {
      ...participant,
      current_movement_available: Math.max(participant.current_movement_available - standing.standing_cost, 0),
      movement_spent: participant.movement_spent + standing.standing_cost,
    },
    condition_removal_instruction: standing.condition_removal_instruction,
    opportunity_attack_candidates: [],
  };
}

export function resolveCrawlingMovement(input = {}) {
  const crawl = evaluateProneCrawl();
  const transitionCost = calculateTransitionCost({ ...input, crawling: true });
  return {
    ...transitionCost,
    condition_remains: crawl.condition_remains,
  };
}

export function resolveCover(input = {}) {
  const sources = asArray(input.sources ?? input.cover_sources ?? input.coverSources).map((source, index) => ({
    source_id: cleanText(source.source_id ?? source.sourceId) || `cover:${index + 1}`,
    category: normalizeEnum(source.category ?? source.cover, Object.values(COVER_CATEGORIES), COVER_CATEGORIES.NONE, 'cover_category'),
    attacker_id: cleanText(source.attacker_id ?? source.attackerId) || null,
    target_id: cleanText(source.target_id ?? source.targetId) || null,
    bypassed: Boolean(source.bypassed),
  })).filter((source) => !source.bypassed);
  const highest = sources.reduce((best, source) => (COVER_RANK[source.category] > COVER_RANK[best] ? source.category : best), COVER_CATEGORIES.NONE);
  return {
    cover_category: highest,
    armor_class_bonus: highest === COVER_CATEGORIES.HALF ? 2 : highest === COVER_CATEGORIES.THREE_QUARTERS ? 5 : 0,
    dexterity_save_bonus: highest === COVER_CATEGORIES.HALF ? 2 : highest === COVER_CATEGORIES.THREE_QUARTERS ? 5 : 0,
    direct_targeting_blocked: highest === COVER_CATEGORIES.TOTAL && !input.bypass_total_cover,
    sources,
  };
}

export function resolveConcealmentVisibility(input = {}) {
  const concealment = normalizeEnum(input.concealment, Object.values(CONCEALMENT_CATEGORIES), CONCEALMENT_CATEGORIES.NONE, 'concealment_category');
  const blinded = Boolean(input.actor_blinded ?? input.actorBlinded);
  return {
    concealment,
    cover_grants_concealment: false,
    armor_class_bonus: 0,
    sight_required_targeting_blocked: blinded || concealment === CONCEALMENT_CATEGORIES.TOTAL_VISUAL_OBSTRUCTION,
    hiding_context_available: [CONCEALMENT_CATEGORIES.HEAVY, CONCEALMENT_CATEGORIES.TOTAL_VISUAL_OBSTRUCTION].includes(concealment) || input.cover_category === COVER_CATEGORIES.HALF || input.cover_category === COVER_CATEGORIES.THREE_QUARTERS,
  };
}

export function resolveReach(input = {}) {
  const actor = input.actor ?? {};
  const target = input.target ?? {};
  const proximity = input.proximity ?? resolveRelativeProximity({
    participant_a_id: participantId(actor),
    participant_b_id: participantId(target),
    relationships: input.relationships ?? actor.relationships ?? [],
  }).proximity;
  const actionReach = input.action_reach ?? input.actionReach ?? input.action?.reach ?? null;
  const extendedSources = asArray(input.extended_reach_sources ?? actor.extended_reach_sources ?? actor.extendedReachSources);
  const hasExtended = Boolean(actionReach) || extendedSources.length > 0;
  const canReachNormal = proximity === PROXIMITY_STATES.ENGAGED;
  const canReachExtended = canReachNormal || (hasExtended && proximity === PROXIMITY_STATES.NEARBY);
  return {
    proximity,
    can_reach_with_normal_melee: canReachNormal,
    can_reach_with_selected_action: hasExtended ? canReachExtended : canReachNormal,
    reach_sources: hasExtended ? extendedSources.concat(actionReach ? [{ source_id: 'selected_action', reach: actionReach }] : []) : [],
  };
}

export function isActionInRange(input = {}) {
  const range = input.range_profile ?? input.rangeProfile ?? {};
  const rangeKind = normalizeEnum(range.kind ?? range.range_kind ?? range.rangeKind, Object.values(ACTION_RANGE_KINDS), ACTION_RANGE_KINDS.ENGAGED, 'action_range_kind');
  const actor = input.actor ?? {};
  const target = input.target ?? {};
  const proximity = input.proximity ?? resolveRelativeProximity({
    participant_a_id: participantId(actor),
    participant_b_id: participantId(target),
    relationships: input.relationships ?? actor.relationships ?? [],
  }).proximity;
  const actorZone = actor.current_zone_id ?? actor.zone_id;
  const targetZone = target.current_zone_id ?? target.zone_id;
  if (rangeKind === ACTION_RANGE_KINDS.SELF) {
    return { legal: participantId(actor) === participantId(target), reason: 'self' };
  }
  if (rangeKind === ACTION_RANGE_KINDS.SAME_ZONE) {
    return { legal: actorZone && actorZone === targetZone, reason: 'same_zone' };
  }
  if (rangeKind === ACTION_RANGE_KINDS.SPECIFIED_ZONE) {
    return { legal: targetZone === cleanText(range.zone_id ?? range.zoneId), reason: 'specified_zone' };
  }
  if (rangeKind === ACTION_RANGE_KINDS.VISIBLE_PARTICIPANT) {
    return { legal: input.target_visible !== false, reason: 'visibility' };
  }
  if (rangeKind === ACTION_RANGE_KINDS.EXTENDED_REACH) {
    const reach = resolveReach(input);
    return { legal: reach.can_reach_with_selected_action, reason: 'extended_reach', reach };
  }
  const threshold = rangeKind === ACTION_RANGE_KINDS.UP_TO_PROXIMITY
    ? normalizeEnum(range.proximity ?? range.max_proximity ?? range.maxProximity, Object.values(PROXIMITY_STATES), PROXIMITY_STATES.ENGAGED, 'proximity')
    : rangeKind;
  return {
    legal: proximity !== null && PROXIMITY_RANK[proximity] <= PROXIMITY_RANK[threshold],
    reason: 'proximity',
    proximity,
    threshold,
  };
}

export function determineThreatenedReach(input = {}) {
  const reactor = input.reactor ?? input.actor ?? {};
  const mover = input.mover ?? input.target ?? {};
  const hostile = input.hostile === undefined ? reactor.faction && mover.faction && reactor.faction !== mover.faction : Boolean(input.hostile);
  const capability = evaluateConditionEffects({
    participant: reactor,
    conditions: input.reactor_conditions ?? input.conditions ?? [],
    context_kind: CONDITION_CONTEXT_KINDS.ACTION_LEGALITY,
  });
  const reach = resolveReach({
    actor: reactor,
    target: mover,
    proximity: input.proximity,
    relationships: input.relationships,
    extended_reach_sources: input.extended_reach_sources ?? reactor.extended_reach_sources,
  });
  return {
    threatens: Boolean(hostile && capability.reaction_allowed && reach.can_reach_with_selected_action),
    hostile,
    reaction_capable: capability.reaction_allowed,
    reach,
  };
}

export function detectOpportunityAttackCandidates(input = {}) {
  if (input.forced_movement || input.disengage_protected || input.entering_reach_only) {
    return [];
  }
  const before = input.before_proximity ?? input.beforeProximity;
  const after = input.after_proximity ?? input.afterProximity;
  const leftReach = before && after && PROXIMITY_RANK[before] <= PROXIMITY_RANK[PROXIMITY_STATES.ENGAGED] && PROXIMITY_RANK[after] > PROXIMITY_RANK[PROXIMITY_STATES.ENGAGED];
  const leftExtendedReach = before === PROXIMITY_STATES.NEARBY && [PROXIMITY_STATES.DISTANT, PROXIMITY_STATES.OUT_OF_REACH].includes(after);
  if (!leftReach && !(input.extended_reach && leftExtendedReach)) {
    return [];
  }
  return asArray(input.potential_reactors ?? input.potentialReactors)
    .filter((reactor) => determineThreatenedReach({
      reactor,
      mover: input.mover,
      proximity: input.extended_reach ? PROXIMITY_STATES.NEARBY : PROXIMITY_STATES.ENGAGED,
      reactor_conditions: reactor.conditions ?? [],
      hostile: reactor.hostile_to_mover ?? (reactor.faction && input.mover?.faction && reactor.faction !== input.mover.faction),
      extended_reach_sources: reactor.extended_reach_sources,
    }).threatens)
    .map((reactor) => ({
      reactor_id: participantId(reactor),
      reaction_kind: 'opportunity_attack_candidate',
      resolved: false,
      player_visible: reactor.player_visible !== false,
    }));
}

export function validateOccupiedSpacePassage(input = {}) {
  if (!input.passes_through_occupied_space && !input.ends_in_occupied_space) {
    return { legal: true, reason: 'no_occupied_space_evaluation_required' };
  }
  const moverSize = validateCreatureSize(input.mover_size ?? input.moverSize);
  const occupantSize = validateCreatureSize(input.occupant_size ?? input.occupantSize);
  if (input.ends_in_occupied_space && !input.authored_end_overlap_allowed) {
    return { legal: false, reason: 'cannot_end_in_occupied_space' };
  }
  if (input.occupant_hostile === false && input.transition_allows_nonhostile_passage !== false) {
    return { legal: true, reason: 'nonhostile_passage_allowed' };
  }
  const difference = Math.abs(compareCreatureSizes(moverSize, occupantSize).difference);
  if (input.occupant_hostile && difference >= 2) {
    return { legal: true, reason: 'two_size_difference_hostile_passage_allowed' };
  }
  if (input.authored_exception) {
    return { legal: true, reason: 'authored_exception' };
  }
  return { legal: false, reason: 'hostile_occupied_space_blocks_passage' };
}

export function resolveForcedMovement(input = {}) {
  const participant = createParticipantSpatialState(input.participant ?? input.spatial_state ?? input.spatialState);
  const route = input.route ?? evaluateExplicitRoute(input);
  if (route.status !== SPATIAL_OPERATION_STATUSES.VALID) {
    return {
      status: route.status,
      participant_after: participant,
      movement_spent: 0,
      opportunity_attack_candidates: [],
    };
  }
  const last = route.ordered_transitions.at(-1).transition;
  const after = {
    ...participant,
    current_zone_id: last.destination_zone_id,
    current_movement_available: participant.current_movement_available,
    movement_spent: participant.movement_spent,
  };
  const grappleUpdate = input.grapple_conditions
    ? processConditionLifecycleEvent({
        event_type: input.grapple_relationship_remains_valid === false
          ? CONDITION_LIFECYCLE_EVENTS.RELATIONSHIP_INVALID
          : CONDITION_LIFECYCLE_EVENTS.CONDITION_APPLIED,
        conditions: input.grapple_conditions,
      })
    : null;
  return {
    status: SPATIAL_OPERATION_STATUSES.COMMITTED,
    participant_after: after,
    movement_spent: 0,
    opportunity_attack_candidates: [],
    known_hazards: route.known_hazards,
    hidden_hazards: route.hidden_hazards,
    grapple_update: grappleUpdate,
    gm_dev_trace: { forced_movement: true, route },
  };
}

function contestInput(actor, target, actorRoll, targetRoll, targetSkill = 'athletics', actorSkill = 'athletics') {
  return {
    ruleset: DND5E_2014_RULESET,
    actor_check: {
      ability: actorSkill === 'acrobatics' ? 'DEX' : 'STR',
      skill: actorSkill,
      modifiers: actor[`${actorSkill}_modifiers`] ?? [],
      roll_override: actorRoll,
      generation_origin: ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE,
    },
    opponent_check: {
      ability: targetSkill === 'acrobatics' ? 'DEX' : 'STR',
      skill: targetSkill,
      modifiers: target[`${targetSkill}_modifiers`] ?? [],
      roll_override: targetRoll,
      generation_origin: ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE,
    },
  };
}

export function resolveGrapple(input = {}) {
  if (!input.attack_replacement_available) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'attack_replacement_required' };
  }
  const actor = input.actor ?? {};
  const target = input.target ?? {};
  const reach = resolveReach({ actor, target, proximity: input.proximity ?? PROXIMITY_STATES.ENGAGED });
  if (!reach.can_reach_with_normal_melee) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'target_not_in_reach' };
  }
  if (compareCreatureSizes(actor.size, target.size).difference < -1) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'target_too_large' };
  }
  const targetChoice = normalizedKey(input.target_defense_choice ?? input.targetDefenseChoice) || 'athletics';
  const contest = resolveContestedAbilityCheck(contestInput(actor, target, input.actor_roll_override ?? input.actorRollOverride, input.target_roll_override ?? input.targetRollOverride, targetChoice));
  if (contest.outcome !== 'actor_wins') {
    return { status: 'failed', contest, condition_application: null, gm_dev_trace: { target_defense_choice: targetChoice } };
  }
  const conditionApplication = applyCondition({
    condition: {
      condition_type: CONDITION_IDS.GRAPPLED,
      target_participant_id: participantId(target),
      source_participant_id: participantId(actor),
      condition_instance_id: stableId(['grappled', participantId(actor), participantId(target)]),
    },
    existing_conditions: input.existing_conditions ?? [],
  });
  return {
    status: 'succeeded',
    contest,
    condition_application: conditionApplication,
    movement_result: null,
    gm_dev_trace: { target_defense_choice: targetChoice, reach },
  };
}

export function releaseGrapple(input = {}) {
  const result = removeCondition({
    existing_conditions: input.conditions ?? input.existing_conditions ?? [],
    condition_type: CONDITION_IDS.GRAPPLED,
    source_participant_id: participantId(input.grappler ?? input.actor ?? {}),
    removal_reason: 'grapple_released',
  });
  return {
    status: result.removed_instances.length > 0 ? 'released' : 'already_released',
    action_cost: 0,
    result,
  };
}

export function resolveGrappleEscape(input = {}) {
  if (!input.action_permission) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'action_permission_required' };
  }
  const actor = input.actor ?? {};
  const grappler = input.grappler ?? {};
  const escapeSkill = normalizedKey(input.escape_skill ?? input.escapeSkill) || 'athletics';
  const contest = resolveContestedAbilityCheck(contestInput(actor, grappler, input.actor_roll_override ?? input.actorRollOverride, input.grappler_roll_override ?? input.grapplerRollOverride, 'athletics', escapeSkill));
  if (contest.outcome !== 'actor_wins') {
    return { status: 'failed', contest, condition_removal: null };
  }
  return {
    status: 'escaped',
    contest,
    condition_removal: removeCondition({
      existing_conditions: input.conditions ?? [],
      condition_type: CONDITION_IDS.GRAPPLED,
      source_participant_id: participantId(grappler),
      removal_reason: 'grapple_escape',
    }),
  };
}

export function resolveDraggingMovement(input = {}) {
  const grappler = createParticipantSpatialState(input.grappler ?? input.actor ?? {});
  const target = createParticipantSpatialState(input.target ?? {});
  const sizeDifference = Math.abs(compareCreatureSizes(grappler.size, target.size).difference);
  const dragging = sizeDifference < 2;
  const route = input.route ?? evaluateExplicitRoute(input);
  if (input.target_passage_blocked) {
    return { status: SPATIAL_OPERATION_STATUSES.BLOCKED, reason: 'target_passage_blocked', movement_spent: 0 };
  }
  const cost = calculateTransitionCost({ transition: route.ordered_transitions?.[0]?.transition ?? input.transition, encounter_default_cost: input.encounter_default_cost, dragging });
  if (route.status !== SPATIAL_OPERATION_STATUSES.VALID || cost.status !== SPATIAL_OPERATION_STATUSES.VALID) {
    return { status: route.status ?? cost.status, movement_spent: 0 };
  }
  return {
    status: SPATIAL_OPERATION_STATUSES.COMMITTED,
    dragging_applied: dragging,
    movement_cost: cost.cost,
    grappler_after: { ...grappler, current_zone_id: route.ordered_transitions.at(-1).transition.destination_zone_id },
    target_after: { ...target, current_zone_id: route.ordered_transitions.at(-1).transition.destination_zone_id },
    grapple_relationship_remains: input.grapple_relationship_remains_valid !== false,
  };
}

export function resolveShove(input = {}) {
  if (!input.attack_replacement_available) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'attack_replacement_required' };
  }
  const actor = input.actor ?? {};
  const target = input.target ?? {};
  const reach = resolveReach({ actor, target, proximity: input.proximity ?? PROXIMITY_STATES.ENGAGED });
  if (!reach.can_reach_with_normal_melee) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'target_not_in_reach' };
  }
  if (compareCreatureSizes(actor.size, target.size).difference < -1) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'target_too_large' };
  }
  const targetChoice = normalizedKey(input.target_defense_choice ?? input.targetDefenseChoice) || 'athletics';
  const contest = resolveContestedAbilityCheck(contestInput(actor, target, input.actor_roll_override ?? input.actorRollOverride, input.target_roll_override ?? input.targetRollOverride, targetChoice));
  if (contest.outcome !== 'actor_wins') {
    return { status: 'failed', contest };
  }
  const shoveChoice = normalizedKey(input.shove_choice ?? input.shoveChoice) || 'prone';
  if (shoveChoice === 'prone') {
    return {
      status: 'succeeded',
      contest,
      condition_application: applyCondition({
        condition: {
          condition_type: CONDITION_IDS.PRONE,
          target_participant_id: participantId(target),
          source_participant_id: participantId(actor),
          condition_instance_id: stableId(['shove-prone', participantId(actor), participantId(target)]),
        },
        existing_conditions: input.existing_conditions ?? [],
      }),
    };
  }
  if (shoveChoice === 'push') {
    if (input.destination_proximity === undefined && input.destination_zone_id === undefined) {
      return { status: SPATIAL_OPERATION_STATUSES.AMBIGUOUS, reason: 'push_destination_required', contest };
    }
    return {
      status: 'succeeded',
      contest,
      forced_movement: {
        from_proximity: input.proximity ?? PROXIMITY_STATES.ENGAGED,
        to_proximity: input.destination_proximity ?? PROXIMITY_STATES.NEARBY,
        destination_zone_id: input.destination_zone_id ?? null,
        movement_spent: 0,
        opportunity_attack_candidates: [],
        visible_hazard_instruction: input.visible_hazard ? { hazard_id: input.visible_hazard } : null,
      },
    };
  }
  return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'unsupported_shove_choice' };
}

export function evaluateRetreatRoute(input = {}) {
  const route = input.route ?? evaluateExplicitRoute(input);
  if (route.status !== SPATIAL_OPERATION_STATUSES.VALID) {
    return { status: route.status, spatial_completion_condition_satisfied: false, combat_ended: false };
  }
  const requiredMovement = route.total_cost;
  const budget = calculateMovementBudget(input);
  return {
    status: budget.movement_remaining >= requiredMovement ? SPATIAL_OPERATION_STATUSES.VALID : SPATIAL_OPERATION_STATUSES.UNAVAILABLE,
    visible: input.visible !== false,
    hidden_from_player: input.visible === false,
    requires_movement: requiredMovement > 0,
    requires_object_or_special_action: Boolean(input.requires_object_or_special_action ?? input.requiresObjectOrSpecialAction),
    known_opportunity_attack_candidates: detectOpportunityAttackCandidates(input),
    spatial_completion_condition_satisfied: budget.movement_remaining >= requiredMovement,
    combat_ended: false,
    route,
  };
}

export function validatePlacement(input = {}) {
  const zones = new Set(asArray(input.zones).map((zone) => createZoneDefinition(zone).zone_id));
  const state = createParticipantSpatialState(input.participant ?? input.spatial_state ?? input.spatialState);
  if (state.current_zone_id && zones.size > 0 && !zones.has(state.current_zone_id)) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'invalid_zone' };
  }
  if (state.position_tags.includes('concealed') && state.concealment === CONCEALMENT_CATEGORIES.NONE) {
    return { status: SPATIAL_OPERATION_STATUSES.UNAVAILABLE, reason: 'contradictory_concealment_tag' };
  }
  return { status: SPATIAL_OPERATION_STATUSES.VALID, participant: state, initiative_inserted: false };
}

export function validateTargetLegality(input = {}) {
  const range = isActionInRange(input);
  if (!range.legal) {
    return { legal: false, reason: 'out_of_range', range };
  }
  const cover = resolveCover(input.cover ?? {});
  if (cover.direct_targeting_blocked && !input.action_bypasses_total_cover) {
    return { legal: false, reason: 'total_cover', cover };
  }
  const visibility = resolveConcealmentVisibility(input.visibility ?? {});
  if (input.sight_required && visibility.sight_required_targeting_blocked) {
    return { legal: false, reason: 'sight_required_blocked', visibility };
  }
  return { legal: true, range, cover, visibility, target_count: 1 };
}

export function projectSpatialForPlayer(payload = {}) {
  const projected = stripPlayerProhibitedFields(cloneSerializable(payload));
  assertNoSpatialPlayerHiddenData(projected);
  return projected;
}

export function buildSpatialGmDevTrace(payload = {}) {
  return {
    trace_kind: 'combat_spatial_movement',
    payload: cloneSerializable(payload),
  };
}

export function assertNoSpatialPlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const key of PLAYER_PROHIBITED_KEYS) {
    if (serialized.includes(key)) {
      throw spatialError(`Player spatial payload contains prohibited key "${key}".`, 'COMBAT_SPATIAL_PLAYER_VISIBILITY_LEAK');
    }
  }
  return true;
}
