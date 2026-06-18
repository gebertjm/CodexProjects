import {
  COMBAT_DECISION_TYPES,
  COMBAT_NEXT_BEAT_DECISION_KINDS,
  COMBAT_RESOLUTION_STATUSES,
  COMBAT_TIMING_CATEGORIES,
  COMBAT_TRANSITION_DECISION_KINDS,
  assertNoCombatPlayerHiddenData,
  createCombatNextBeatDecision,
  createCombatParentTurn,
  createCombatRulesetIdentity,
  createCombatSubResolution,
  createCombatTransitionDecision,
} from '../../services/interactionCore/combatAdapterContract.js';
import {
  COMBAT_ACTION_RESULT_STATUSES,
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_EFFECT_TYPES,
  COMBAT_RESOURCE_CATEGORIES,
  COMBAT_TARGET_POLICIES,
  createCombatActionDefinition,
  createCombatResourceState,
  previewCombatActionResolution,
  projectCombatActionResultForPlayer,
  resolveCombatAction,
} from './actionEffectResourceFramework.js';
import { DND5E_2014_RULESET } from './rulesResolution.js';
import {
  CONDITION_CONTEXT_KINDS,
  CONDITION_IDS,
  CONDITION_LIFECYCLE_EVENTS,
  applyCondition,
  evaluateConditionEffects,
  processConditionLifecycleEvent,
  removeCondition,
} from './conditionStateLifecycle.js';
import {
  PROXIMITY_STATES,
  SPATIAL_OPERATION_STATUSES,
  commitMovementSegment,
  createParticipantSpatialState,
  detectOpportunityAttackCandidates,
  evaluateExplicitRoute,
  previewMovementRoute,
  projectSpatialForPlayer,
  resolveCrawlingMovement,
  resolveStandingFromProne,
} from './spatialMovement.js';

export { DND5E_2014_RULESET };

export const PLAYER_TURN_STATUSES = Object.freeze({
  OPEN: 'open',
  WAITING_FOR_PLAYER: 'waiting_for_player',
  RESOLVING_SUB_RESOLUTION: 'resolving_sub_resolution',
  PAUSED_FOR_REACTION: 'paused_for_reaction',
  CLOSING: 'closing',
  CLOSED: 'closed',
  SUPERSEDED: 'superseded',
  STALE: 'stale',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const PLAYER_TURN_OPERATION_CATEGORIES = Object.freeze({
  MOVEMENT: 'movement',
  STAND_FROM_PRONE: 'stand_from_prone',
  CRAWL_MOVEMENT: 'crawl_movement',
  ACTION: 'action',
  BONUS_ACTION: 'bonus_action',
  OBJECT_INTERACTION: 'object_interaction',
  WAIT: 'wait',
  END_TURN: 'end_turn',
});

export const TURN_DECISION_CATEGORY_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  SPENT: 'spent',
  UNAVAILABLE_CONDITION: 'unavailable_condition',
  UNAVAILABLE_NO_LEGAL_OPTION: 'unavailable_no_legal_option',
  UNAVAILABLE_TURN_CLOSING: 'unavailable_turn_closing',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const TURN_NEXT_DECISION_KINDS = Object.freeze({
  CONTINUE_PLAYER_TURN: 'continue_player_turn',
  CHOOSE_MOVEMENT: 'choose_movement',
  CHOOSE_ACTION: 'choose_action',
  CHOOSE_BONUS_ACTION: 'choose_bonus_action',
  CHOOSE_OBJECT_INTERACTION: 'choose_object_interaction',
  REVIEW_END_TURN: 'review_end_turn',
  REACTION_REQUIRED: 'reaction_required',
  AUTOMATIC_CONTINUATION_REQUIRED: 'automatic_continuation_required',
  ENCOUNTER_RESOLUTION_REQUIRED: 'encounter_resolution_required',
  ENDPOINT_REVIEW: 'endpoint_review',
  UNAVAILABLE: 'unavailable',
  RECOVERY_NEEDED: 'recovery_needed',
  TURN_CLOSED: 'turn_closed',
});

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'armor_class',
  'target_armor_class',
  'difficulty_class',
  'hidden',
  'raw_roll',
  'raw_result',
  'roll_record',
  'mutation_plan',
  'idempotency_key',
  'source_state_version',
  'resulting_state_version',
  'current_state_version',
  'read_model_version',
  'trace',
  'gm_dev',
  'control_mode',
  'action_window_id',
  'state_version_internal',
  'test_override',
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

function turnError(message, code = 'COMBAT_PLAYER_TURN_ERROR') {
  const error = new Error(message);
  error.code = code;
  error.player_safe_message = 'That combat turn cannot continue yet.';
  return error;
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function normalizeRuleset(input = DND5E_2014_RULESET) {
  const ruleset = createCombatRulesetIdentity(input);
  if (ruleset.system !== DND5E_2014_RULESET.system || ruleset.rules_version !== DND5E_2014_RULESET.rules_version) {
    throw turnError(`Unsupported combat ruleset ${ruleset.system}/${ruleset.rules_version}.`, 'UNSUPPORTED_COMBAT_TURN_RULESET');
  }
  return ruleset;
}

function participantId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function findParticipant(state, id) {
  return asArray(state.participants).find((entry) => participantId(entry) === cleanText(id)) ?? null;
}

function actorFor(state) {
  return findParticipant(state, state.parent_turn?.actor_participant_id ?? state.actor_participant_id ?? state.current_participant_id);
}

function resourceId(input = {}) {
  return cleanText(input.resource_id ?? input.resourceId ?? input.id);
}

function actionId(input = {}) {
  return cleanText(input.action_id ?? input.actionId ?? input.id);
}

function transitionId(input = {}) {
  return cleanText(input.transition_id ?? input.transitionId ?? input.id);
}

function operationFingerprint(input = {}) {
  return JSON.stringify({
    operation_category: input.operation_category ?? input.operationCategory,
    action_id: input.action_id ?? input.actionId,
    target_id: input.target_id ?? input.targetId,
    destination_zone_id: input.destination_zone_id ?? input.destinationZoneId,
    selected_transition_ids: input.selected_transition_ids ?? input.selectedTransitionIds,
    resource_tier: input.resource_tier ?? input.resourceTier,
    route_id: input.route_id ?? input.routeId,
  });
}

function nextRevision(current) {
  const match = cleanText(current).match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${cleanText(current) || 'turn-v'}1`;
  }
  return `${match[1]}${Number(match[2]) + 1}`;
}

function setRevision(state) {
  const next = nextRevision(state.parent_turn.current_state_version);
  state.parent_turn.current_state_version = next;
  state.read_model_version = `read:${next}`;
  return next;
}

function normalizeActionDefinitions(actions = []) {
  return asArray(actions).map(createCombatActionDefinition);
}

function normalizeResources(resources = []) {
  return asArray(resources).map(createCombatResourceState);
}

function normalizeState(input = {}) {
  const state = cloneSerializable(input);
  state.combat = state.combat ?? {};
  state.combat.combat_id = cleanText(state.combat.combat_id ?? state.combat.id ?? state.combatId ?? state.combat_id) || 'combat:test';
  state.combat.status = cleanText(state.combat.status) || 'active';
  state.combat.ruleset = normalizeRuleset(state.combat.ruleset ?? state.ruleset ?? DND5E_2014_RULESET);
  state.participants = asArray(state.participants);
  state.actions = normalizeActionDefinitions(state.actions ?? state.action_definitions ?? state.actionDefinitions);
  state.resources = normalizeResources(state.resources);
  state.conditions = asArray(state.conditions);
  state.spatial = state.spatial ?? {};
  state.spatial.participants = asArray(state.spatial.participants);
  state.spatial.zones = asArray(state.spatial.zones);
  state.spatial.transitions = asArray(state.spatial.transitions);
  state.turn_effects = asArray(state.turn_effects);
  state.committed_results = state.committed_results ?? {};
  state.idempotency_records = state.idempotency_records ?? {};
  state.action_window = state.action_window ?? {};
  return state;
}

function actorConditions(state, actorId = state.parent_turn?.actor_participant_id) {
  return asArray(state.conditions).filter((condition) => condition.target_participant_id === actorId && condition.active !== false && condition.expired !== true);
}

function actorCapabilities(state) {
  const actor = actorFor(state) ?? {};
  const effects = evaluateConditionEffects({
    participant: actor,
    conditions: actorConditions(state, participantId(actor)),
    context_kind: CONDITION_CONTEXT_KINDS.CAPABILITY,
  });
  const actionEffects = evaluateConditionEffects({
    participant: actor,
    conditions: actorConditions(state, participantId(actor)),
    context_kind: CONDITION_CONTEXT_KINDS.ACTION_LEGALITY,
  });
  const movementEffects = evaluateConditionEffects({
    participant: actor,
    conditions: actorConditions(state, participantId(actor)),
    context_kind: CONDITION_CONTEXT_KINDS.MOVEMENT,
  });
  return {
    can_act: Boolean(effects.action_allowed && actionEffects.action_allowed),
    can_bonus_action: Boolean(effects.action_allowed && actionEffects.bonus_action_allowed),
    can_react: Boolean(actionEffects.reaction_allowed),
    can_move: movementEffects.speed_zero !== true && movementEffects.movement_allowed !== false,
    condition_effects: { capability: effects, action: actionEffects, movement: movementEffects },
  };
}

function timingForCategory(category) {
  if (category === PLAYER_TURN_OPERATION_CATEGORIES.BONUS_ACTION) {
    return COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION;
  }
  if (category === PLAYER_TURN_OPERATION_CATEGORIES.OBJECT_INTERACTION) {
    return COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION;
  }
  return COMBAT_ACTION_TIMING_CATEGORIES.ACTION;
}

function availableActionsFor(state, timingCategory) {
  const actor = actorFor(state) ?? {};
  return asArray(state.actions).filter((action) => {
    if (action.timing_category !== timingCategory) {
      return false;
    }
    if (action.authored_metadata?.requires_condition && !actorConditions(state).some((condition) => condition.condition_type === action.authored_metadata.requires_condition)) {
      return false;
    }
    if (action.authored_metadata?.unsupported === true) {
      return false;
    }
    if (action.target_policy === COMBAT_TARGET_POLICIES.NO_TARGET || action.target_policy === COMBAT_TARGET_POLICIES.SELF) {
      return true;
    }
    return asArray(state.participants).some((target) => participantId(target) !== participantId(actor) && target.active !== false && target.defeated !== true);
  });
}

function movementOptions(state) {
  const actor = actorFor(state) ?? {};
  const actorSpatial = spatialForActor(state);
  const currentZone = actorSpatial?.current_zone_id ?? actor.current_zone_id ?? actor.zone_id;
  return asArray(state.spatial.transitions)
    .filter((transition) => transition.source_zone_id === currentZone && transition.visible !== false && !transition.blocked)
    .map((transition) => ({
      transition_id: transition.transition_id,
      destination_zone_id: transition.destination_zone_id,
      player_label: transition.player_description ?? `Move to ${transition.destination_zone_id}`,
    }));
}

function spatialForActor(state) {
  const actor = actorFor(state);
  const id = participantId(actor);
  const existing = asArray(state.spatial.participants).find((entry) => participantId(entry) === id);
  if (existing) {
    return existing;
  }
  if (!actor) {
    return null;
  }
  return createParticipantSpatialState({
    participant_id: id,
    current_zone_id: actor.current_zone_id ?? actor.zone_id ?? null,
    size: actor.size ?? 'medium',
    speed: actor.speed ?? actor.speed_walk ?? 30,
    relationships: actor.relationships ?? [],
  });
}

function currentMovement(state) {
  const turn = state.parent_turn ?? {};
  return {
    base_movement: toInteger(turn.base_movement),
    dash_added_movement: toInteger(turn.dash_added_movement),
    movement_spent: toInteger(turn.movement_spent),
    movement_remaining: Math.max(toInteger(turn.base_movement) + toInteger(turn.dash_added_movement) - toInteger(turn.movement_spent), 0),
  };
}

function resourceListForPlayer(resources = []) {
  return asArray(resources).map((resource) => ({
    resource_id: resource.resource_id,
    label: resource.label ?? resource.resource_id,
    current: resource.current,
    maximum: resource.maximum,
    tier: resource.tier ?? null,
  }));
}

function visibleParticipant(participant = {}, actorId = null) {
  const isActor = participantId(participant) === actorId;
  return {
    participant_id: participantId(participant),
    display_name: participant.display_name ?? participant.name ?? participantId(participant),
    faction: participant.faction ?? null,
    is_actor: isActor,
    hit_points: isActor ? {
      current: participant.current_hit_points ?? participant.currentHp ?? participant.current_hp ?? null,
      maximum: participant.max_hit_points ?? participant.maxHp ?? participant.max_hp ?? null,
      temporary: participant.temporary_hit_points ?? participant.temporaryHp ?? participant.temporary_hp ?? 0,
    } : null,
    health_band: isActor ? null : participant.health_band ?? (participant.defeated ? 'defeated' : 'standing'),
    visible_conditions: asArray(participant.visible_conditions ?? participant.conditions).map((entry) => typeof entry === 'string' ? entry : entry.condition_type).filter(Boolean),
  };
}

function decisionCategory(kind, status, details = {}) {
  return {
    category: kind,
    status,
    available: status === TURN_DECISION_CATEGORY_STATUSES.AVAILABLE,
    meaningful: Boolean(details.meaningful),
    reason: details.reason ?? null,
  };
}

export function listCurrentLegalDecisionCategories(input = {}) {
  const state = normalizeState(input);
  const turn = state.parent_turn ?? {};
  const capabilities = actorCapabilities(state);
  const movement = currentMovement(state);
  const turnUnavailable = [PLAYER_TURN_STATUSES.CLOSING, PLAYER_TURN_STATUSES.CLOSED, PLAYER_TURN_STATUSES.SUPERSEDED].includes(turn.status);
  const recovery = turn.status === PLAYER_TURN_STATUSES.RECOVERY_NEEDED;
  const actionOptions = availableActionsFor(state, COMBAT_ACTION_TIMING_CATEGORIES.ACTION);
  const bonusOptions = availableActionsFor(state, COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION);
  const objectOptions = availableActionsFor(state, COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION)
    .concat(availableActionsFor(state, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION));
  const moveOptions = movementOptions(state);
  const prone = actorConditions(state).some((condition) => condition.condition_type === CONDITION_IDS.PRONE);
  const meaningfulMovement = movement.movement_remaining > 0 && capabilities.can_move && (moveOptions.length > 0 || prone);

  if (recovery) {
    return [
      decisionCategory('move', TURN_DECISION_CATEGORY_STATUSES.RECOVERY_NEEDED),
      decisionCategory('action', TURN_DECISION_CATEGORY_STATUSES.RECOVERY_NEEDED),
      decisionCategory('bonus_action', TURN_DECISION_CATEGORY_STATUSES.RECOVERY_NEEDED),
      decisionCategory('object_interaction', TURN_DECISION_CATEGORY_STATUSES.RECOVERY_NEEDED),
      decisionCategory('wait', TURN_DECISION_CATEGORY_STATUSES.RECOVERY_NEEDED),
      decisionCategory('end_turn', TURN_DECISION_CATEGORY_STATUSES.RECOVERY_NEEDED),
    ];
  }

  if (turnUnavailable) {
    return [
      decisionCategory('move', TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_TURN_CLOSING),
      decisionCategory('action', TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_TURN_CLOSING),
      decisionCategory('bonus_action', TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_TURN_CLOSING),
      decisionCategory('object_interaction', TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_TURN_CLOSING),
      decisionCategory('wait', TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_TURN_CLOSING),
      decisionCategory('end_turn', TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_TURN_CLOSING),
    ];
  }

  return [
    decisionCategory(
      'move',
      movement.movement_remaining <= 0
        ? TURN_DECISION_CATEGORY_STATUSES.SPENT
        : !capabilities.can_move
          ? TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_CONDITION
          : meaningfulMovement
            ? TURN_DECISION_CATEGORY_STATUSES.AVAILABLE
            : TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_NO_LEGAL_OPTION,
      { meaningful: meaningfulMovement, reason: meaningfulMovement ? null : 'no_meaningful_movement' }
    ),
    decisionCategory(
      'action',
      turn.action_spent
        ? TURN_DECISION_CATEGORY_STATUSES.SPENT
        : !capabilities.can_act
          ? TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_CONDITION
          : actionOptions.length > 0 || !turn.action_spent
            ? TURN_DECISION_CATEGORY_STATUSES.AVAILABLE
            : TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_NO_LEGAL_OPTION,
      { meaningful: !turn.action_spent && capabilities.can_act && actionOptions.length > 0 }
    ),
    decisionCategory(
      'bonus_action',
      turn.bonus_action_spent
        ? TURN_DECISION_CATEGORY_STATUSES.SPENT
        : !capabilities.can_bonus_action
          ? TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_CONDITION
          : bonusOptions.length > 0
            ? TURN_DECISION_CATEGORY_STATUSES.AVAILABLE
            : TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_NO_LEGAL_OPTION,
      { meaningful: !turn.bonus_action_spent && capabilities.can_bonus_action && bonusOptions.length > 0 }
    ),
    decisionCategory(
      'object_interaction',
      turn.object_interaction_spent
        ? TURN_DECISION_CATEGORY_STATUSES.SPENT
        : !capabilities.can_act
          ? TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_CONDITION
          : objectOptions.length > 0
            ? TURN_DECISION_CATEGORY_STATUSES.AVAILABLE
            : TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_NO_LEGAL_OPTION,
      { meaningful: !turn.object_interaction_spent && capabilities.can_act && objectOptions.length > 0 }
    ),
    decisionCategory(
      'wait',
      turn.action_spent
        ? TURN_DECISION_CATEGORY_STATUSES.SPENT
        : capabilities.can_act
          ? TURN_DECISION_CATEGORY_STATUSES.AVAILABLE
          : TURN_DECISION_CATEGORY_STATUSES.UNAVAILABLE_CONDITION,
      { meaningful: !turn.action_spent && capabilities.can_act }
    ),
    decisionCategory('end_turn', TURN_DECISION_CATEGORY_STATUSES.AVAILABLE, { meaningful: true }),
  ];
}

function meaningfulEndTurnResources(state) {
  return listCurrentLegalDecisionCategories(state)
    .filter((category) => category.meaningful && ['move', 'action', 'bonus_action', 'object_interaction'].includes(category.category))
    .map((category) => category.category);
}

function nextDecisionFor(state, extra = {}) {
  const turn = state.parent_turn ?? {};
  if (turn.status === PLAYER_TURN_STATUSES.RECOVERY_NEEDED) {
    return {
      next_decision_kind: TURN_NEXT_DECISION_KINDS.RECOVERY_NEEDED,
      combat_next_beat: createCombatNextBeatDecision({ combat_kind: COMBAT_NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED }),
    };
  }
  if (turn.status === PLAYER_TURN_STATUSES.CLOSED) {
    return {
      next_decision_kind: TURN_NEXT_DECISION_KINDS.TURN_CLOSED,
      combat_next_beat: createCombatNextBeatDecision({
        combat_kind: COMBAT_NEXT_BEAT_DECISION_KINDS.RESOLVE_AUTOMATIC_ALLY_OR_ENEMY,
        player_label: 'Turn ended',
        opens_action_window: false,
      }),
    };
  }
  if (extra.reaction_required) {
    return {
      next_decision_kind: TURN_NEXT_DECISION_KINDS.REACTION_REQUIRED,
      reaction_required: true,
      continuation_id: extra.continuation_id,
      combat_next_beat: createCombatNextBeatDecision({
        combat_kind: COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_REACTION_INTERRUPT,
        player_label: 'Reaction window required',
        opens_action_window: false,
        gm_dev_details: { continuation_id: extra.continuation_id },
      }),
    };
  }
  return {
    next_decision_kind: TURN_NEXT_DECISION_KINDS.CONTINUE_PLAYER_TURN,
    combat_next_beat: createCombatNextBeatDecision({
      combat_kind: COMBAT_NEXT_BEAT_DECISION_KINDS.KEEP_PARENT_TURN_OPEN,
      player_label: 'Continue your turn',
      opens_action_window: true,
    }),
  };
}

function turnResultBundle(input = {}) {
  return {
    operation_category: input.operation_category,
    operation_name: input.operation_name,
    committed: input.committed !== false,
    status: input.status ?? COMBAT_RESOLUTION_STATUSES.RESOLVED,
    result: input.result ?? null,
    consequences: asArray(input.consequences),
    progress: asArray(input.progress),
    movement: input.movement ?? null,
    action_economy: input.action_economy ?? null,
    resource_changes: asArray(input.resource_changes),
    visible_rolls: asArray(input.visible_rolls),
    position_changes: input.position_changes ?? null,
    known_reaction_trigger: input.known_reaction_trigger ?? null,
    latest_event_summary: input.latest_event_summary ?? input.result ?? null,
    parent_turn_status: input.parent_turn_status,
    next_decision: input.next_decision,
    recovery: input.recovery ?? null,
  };
}

export function buildCurrentTurnReadModel(input = {}) {
  const state = normalizeState(input);
  const turn = state.parent_turn ?? {};
  const actor = actorFor(state) ?? {};
  const actorId = participantId(actor);
  const movement = currentMovement(state);
  const categories = listCurrentLegalDecisionCategories(state);
  const actorSpatial = spatialForActor(state);
  const latestResult = state.latest_result ? cloneSerializable(state.latest_result.player_result_bundle ?? state.latest_result) : null;
  const readModel = {
    combat_id: state.combat.combat_id,
    encounter_title: state.combat.encounter_title ?? 'Combat encounter',
    combat_status: state.combat.status,
    round: turn.round_number ?? state.combat.round_number ?? 1,
    current_actor: visibleParticipant(actor, actorId),
    visible_participants: state.participants.map((participant) => visibleParticipant(participant, actorId)),
    visible_conditions: actorConditions(state, actorId).map((condition) => condition.condition_type),
    concentration: state.concentration ? { label: state.concentration.label ?? state.concentration.effect_name ?? 'Concentrating' } : null,
    visible_player_resources: resourceListForPlayer(state.resources),
    movement,
    action_status: turn.action_spent ? 'spent' : 'available',
    bonus_action_status: turn.bonus_action_spent ? 'spent' : 'available',
    reaction_status: turn.reaction_available === false ? 'spent' : 'available',
    object_interaction_status: turn.object_interaction_spent ? 'spent' : 'available',
    current_zone: actorSpatial?.current_zone_id ?? null,
    proximity: asArray(actorSpatial?.relationships).map((relationship) => ({
      participant_a_id: relationship.participant_a_id,
      participant_b_id: relationship.participant_b_id,
      proximity: relationship.proximity,
    })),
    engagement: actorSpatial?.relationships?.some((relationship) => relationship.proximity === PROXIMITY_STATES.ENGAGED) ?? false,
    cover: actorSpatial?.cover_relationships ?? [],
    legal_decision_categories: categories,
    available_authored_actions: state.actions.map((action) => ({
      action_id: action.action_id,
      label: action.player_label,
      timing_category: action.timing_category,
      available: categories.some((category) =>
        (action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.ACTION && category.category === 'action' && category.available) ||
        (action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION && category.category === 'bonus_action' && category.available) ||
        ([COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION].includes(action.timing_category) && category.category === 'object_interaction' && category.available)
      ),
    })),
    visible_movement_destinations: movementOptions(state),
    latest_result: latestResult,
    parent_turn_status: turn.status,
    stale_message: state.stale_message ?? null,
    duplicate_message: state.duplicate_message ?? null,
    unavailable_message: state.unavailable_message ?? null,
    recovery_needed_message: turn.status === PLAYER_TURN_STATUSES.RECOVERY_NEEDED ? 'This turn needs GM review before it can continue.' : null,
    end_turn_confirmation: previewEndTurn(state).confirmation,
    next_step: turn.status === PLAYER_TURN_STATUSES.CLOSED ? 'Wait for the next combat beat.' : 'Choose a legal combat option or end your turn.',
  };
  assertNoPlayerTurnHiddenData(readModel);
  return readModel;
}

export function buildCurrentTurnContext(input = {}) {
  const state = normalizeState(input);
  const turn = state.parent_turn ?? {};
  return {
    interaction_domain: 'combat',
    ruleset: state.combat.ruleset,
    combat_id: state.combat.combat_id,
    parent_turn_id: turn.parent_turn_id,
    actor_participant_id: turn.actor_participant_id,
    action_window_id: turn.action_window_id,
    current_state_version: turn.current_state_version,
    decision_categories: listCurrentLegalDecisionCategories(state),
    gm_dev_trace: {
      action_window: cloneSerializable(state.action_window),
      sub_resolution_count: asArray(turn.sub_resolutions).length,
      committed_result_keys: Object.keys(state.committed_results ?? {}),
    },
  };
}

function playerControlled(participant = {}) {
  return participant.control_mode === 'player' || participant.player_controlled === true || participant.is_player_character === true || participant.faction === 'player';
}

function initializeTurn(input = {}) {
  const state = normalizeState(input);
  if (state.combat.status !== 'active') {
    throw turnError('Cannot open a player turn for an inactive combat.', 'COMBAT_NOT_ACTIVE');
  }
  normalizeRuleset(state.combat.ruleset);
  const actorId = cleanText(input.actor_participant_id ?? input.actorParticipantId ?? state.current_participant_id ?? state.combat.current_participant_id);
  const actor = findParticipant(state, actorId);
  if (!actor) {
    throw turnError('Cannot open player turn for an unknown actor.', 'COMBAT_TURN_ACTOR_NOT_FOUND');
  }
  if ((state.combat.current_participant_id ?? actorId) !== actorId) {
    throw turnError('Cannot open player turn for a non-current actor.', 'COMBAT_TURN_WRONG_ACTOR');
  }
  if (!playerControlled(actor)) {
    throw turnError('Cannot open player turn for a non-player controlled actor.', 'COMBAT_TURN_NON_PLAYER_ACTOR');
  }
  const existing = state.parent_turn;
  if (existing?.status && [PLAYER_TURN_STATUSES.OPEN, PLAYER_TURN_STATUSES.WAITING_FOR_PLAYER].includes(existing.status) && existing.actor_participant_id === actorId) {
    return { state, resumed: true };
  }
  const capabilities = actorCapabilities({ ...state, parent_turn: { actor_participant_id: actorId } });
  const base = toInteger(actor.speed ?? actor.speed_walk ?? actor.base_movement_budget, 30);
  const noAction = !capabilities.can_act;
  const parentTurnId = cleanText(input.parent_turn_id ?? input.parentTurnId) || stableId(['turn', state.combat.combat_id, actorId, state.combat.round_number ?? 1, state.combat.initiative_position ?? 1]);
  state.parent_turn = createCombatParentTurn({
    combat_id: state.combat.combat_id,
    parent_turn_id: parentTurnId,
    actor_participant_id: actorId,
    round_number: state.combat.round_number ?? input.round_number ?? 1,
    initiative_position: state.combat.initiative_position ?? input.initiative_position ?? 1,
    action_window_id: cleanText(input.action_window_id ?? input.actionWindowId) || stableId(['window', parentTurnId]),
    source_state_version: cleanText(input.source_state_version ?? input.sourceStateVersion) || `${parentTurnId}:v0`,
    ruleset: state.combat.ruleset,
    status: PLAYER_TURN_STATUSES.OPEN,
  });
  state.parent_turn.turn_opened_state_version = state.parent_turn.source_state_version;
  state.parent_turn.current_state_version = state.parent_turn.source_state_version;
  state.parent_turn.action_spent = noAction;
  state.parent_turn.action_unavailable_reason = noAction ? 'condition' : null;
  state.parent_turn.bonus_action_spent = noAction;
  state.parent_turn.object_interaction_spent = noAction;
  state.parent_turn.reaction_available = capabilities.can_react;
  state.parent_turn.base_movement = capabilities.can_move ? base : 0;
  state.parent_turn.dash_added_movement = 0;
  state.parent_turn.movement_spent = 0;
  state.parent_turn.sub_resolutions = [];
  state.parent_turn.timeout = cloneSerializable(input.timeout ?? { default_policy: 'dodge_then_end_turn' });
  state.action_window = {
    action_window_id: state.parent_turn.action_window_id,
    status: 'open',
    window_type: 'combat_player_turn',
  };
  state.gm_dev_trace = {
    ...(state.gm_dev_trace ?? {}),
    turn_opened: true,
    lifecycle_events: [CONDITION_LIFECYCLE_EVENTS.START_OF_TARGET_TURN],
  };
  state.read_model_version = `read:${state.parent_turn.current_state_version}`;
  return { state, resumed: false };
}

export function openPlayerCombatTurn(input = {}) {
  const { state, resumed } = initializeTurn(input);
  const readModel = buildCurrentTurnReadModel(state);
  return {
    status: resumed ? 'resumed' : 'opened',
    state,
    read_model: readModel,
    next_decision: nextDecisionFor(state),
    gm_dev_trace: {
      operation: resumed ? 'resume_player_combat_turn' : 'open_player_combat_turn',
      context: buildCurrentTurnContext(state),
    },
  };
}

export function resumeCurrentPlayerTurn(input = {}) {
  return openPlayerCombatTurn(input);
}

function staleResponse(state, input = {}) {
  const result = {
    status: COMBAT_RESOLUTION_STATUSES.STALE,
    committed: false,
    player_safe_message: 'That preview is no longer current. Review the updated combat state and preview again.',
    current_read_model: buildCurrentTurnReadModel(state),
    gm_dev_trace: {
      reason: 'source_state_version_mismatch',
      preview_source_state_version: input.source_state_version ?? input.sourceStateVersion,
      current_state_version: state.parent_turn?.current_state_version,
      detected_changes: input.detected_changes ?? input.detectedChanges ?? ['turn_state_changed'],
    },
  };
  return result;
}

function unavailableResponse(state, reason, message = 'That combat option is not available right now.') {
  return {
    status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE,
    committed: false,
    reason,
    player_safe_message: message,
    current_read_model: buildCurrentTurnReadModel(state),
    next_decision: nextDecisionFor(state),
  };
}

function idempotencyStatus(state, input) {
  const key = cleanText(input.idempotency_key ?? input.idempotencyKey);
  if (!key) {
    return { status: 'missing' };
  }
  const fingerprint = operationFingerprint(input);
  const existing = state.idempotency_records[key];
  if (!existing) {
    return { status: 'new', key, fingerprint };
  }
  if (existing.fingerprint !== fingerprint) {
    return {
      status: 'conflict',
      key,
      fingerprint,
      existing,
      response: {
        status: 'idempotency_conflict',
        committed: false,
        reason: 'idempotency_key_reused_for_different_operation',
        player_safe_message: 'That submission key was already used for a different combat choice. Review the current turn and try again.',
        current_read_model: buildCurrentTurnReadModel(state),
        gm_dev_trace: { idempotency_key: key, existing_fingerprint: existing.fingerprint, attempted_fingerprint: fingerprint },
      },
    };
  }
  return {
    status: 'duplicate',
    key,
    fingerprint,
    existing,
    response: {
      ...cloneSerializable(existing.response),
      status: COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED,
      duplicate_of_sub_resolution_id: existing.sub_resolution_id,
      duplicate_handled: true,
      state,
      current_read_model: buildCurrentTurnReadModel(state),
    },
  };
}

function validateSubmitBasis(state, input = {}) {
  if (!state.parent_turn || ![PLAYER_TURN_STATUSES.OPEN, PLAYER_TURN_STATUSES.WAITING_FOR_PLAYER].includes(state.parent_turn.status)) {
    return { valid: false, response: unavailableResponse(state, 'turn_not_open', 'This combat turn is no longer open.') };
  }
  const source = cleanText(input.source_state_version ?? input.sourceStateVersion);
  if (!source || source !== state.parent_turn.current_state_version) {
    return { valid: false, response: staleResponse(state, input) };
  }
  if (cleanText(input.action_window_id ?? input.actionWindowId) && cleanText(input.action_window_id ?? input.actionWindowId) !== state.parent_turn.action_window_id) {
    return { valid: false, response: staleResponse(state, { ...input, detected_changes: ['action_window_changed'] }) };
  }
  return { valid: true };
}

function appendSubResolution(state, input = {}) {
  const order = asArray(state.parent_turn.sub_resolutions).length + 1;
  const subResolutionId = cleanText(input.sub_resolution_id ?? input.subResolutionId) || stableId(['sub', state.parent_turn.parent_turn_id, order, input.operation_category]);
  const sub = createCombatSubResolution({
    combat_id: state.combat.combat_id,
    parent_turn_id: state.parent_turn.parent_turn_id,
    sub_resolution_id: subResolutionId,
    sub_resolution_order: order,
    actor_participant_id: state.parent_turn.actor_participant_id,
    action_window_id: state.parent_turn.action_window_id,
    idempotency_key: input.idempotency_key,
    source_state_version: input.source_state_version,
    ruleset: state.combat.ruleset,
    timing_category: input.timing_category,
    decision_type: input.decision_type,
    resolution_status: input.resolution_status ?? COMBAT_RESOLUTION_STATUSES.RESOLVED,
    result_bundle: input.result_bundle,
    transition_decision: input.transition_decision,
    next_beat_decision: input.next_beat_decision,
    continuation_id: input.continuation_id,
    gm_dev_metadata: input.gm_dev_metadata,
  });
  state.parent_turn.sub_resolutions = asArray(state.parent_turn.sub_resolutions).concat(sub);
  return sub;
}

function recordIdempotency(state, idempotency, response, subResolutionId) {
  if (idempotency.status === 'new') {
    state.idempotency_records[idempotency.key] = {
      fingerprint: idempotency.fingerprint,
      sub_resolution_id: subResolutionId,
      response: cloneSerializable(response),
    };
  }
}

function applyHitPointMutation(state, instruction) {
  const targetId = participantId(instruction.target);
  state.participants = state.participants.map((participant) => {
    if (participantId(participant) !== targetId) {
      return participant;
    }
    return {
      ...participant,
      current_hit_points: instruction.after?.current_hit_points ?? participant.current_hit_points,
      max_hit_points: instruction.after?.max_hit_points ?? participant.max_hit_points,
      temporary_hit_points: instruction.after?.temporary_hit_points ?? participant.temporary_hit_points,
      defeated: (instruction.after?.current_hit_points ?? participant.current_hit_points) <= 0 || participant.defeated === true,
    };
  });
}

function applyConditionMutation(state, instruction) {
  if (instruction.instruction_type === 'upsert_condition_instance') {
    const incoming = instruction.condition_instance;
    const existing = state.conditions.filter((condition) => condition.condition_instance_id !== incoming.condition_instance_id);
    state.conditions = existing.concat(incoming);
  }
  if (instruction.instruction_type === 'remove_condition_instance') {
    state.conditions = state.conditions.map((condition) =>
      condition.condition_instance_id === instruction.condition_instance_id
        ? { ...condition, active: false, expired: true, expiration_reason: instruction.removal_reason }
        : condition
    );
  }
}

function applyActionMutationInstructions(state, instructions = []) {
  for (const instruction of asArray(instructions)) {
    if (instruction.instruction_type === 'apply_hit_point_damage') {
      applyHitPointMutation(state, instruction);
    } else if (['upsert_condition_instance', 'remove_condition_instance'].includes(instruction.instruction_type)) {
      applyConditionMutation(state, instruction);
    } else {
      state.pending_mutation_instructions = asArray(state.pending_mutation_instructions).concat(instruction);
    }
  }
}

function consumeTimingSlot(state, timingCategory) {
  if (timingCategory === COMBAT_ACTION_TIMING_CATEGORIES.ACTION) {
    state.parent_turn.action_spent = true;
  } else if (timingCategory === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION) {
    state.parent_turn.bonus_action_spent = true;
  } else if ([COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION].includes(timingCategory)) {
    state.parent_turn.object_interaction_spent = true;
  }
}

function canSpendTimingSlot(state, timingCategory) {
  const capabilities = actorCapabilities(state);
  if (timingCategory === COMBAT_ACTION_TIMING_CATEGORIES.ACTION) {
    return !state.parent_turn.action_spent && capabilities.can_act;
  }
  if (timingCategory === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION) {
    return !state.parent_turn.bonus_action_spent && capabilities.can_bonus_action;
  }
  if ([COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION].includes(timingCategory)) {
    return !state.parent_turn.object_interaction_spent && capabilities.can_act;
  }
  return false;
}

function actionById(state, id) {
  return state.actions.find((action) => action.action_id === cleanText(id)) ?? null;
}

function targetById(state, id) {
  return cleanText(id) ? findParticipant(state, id) : null;
}

function operationPreviewIdentity(state, category, input = {}) {
  return stableId([
    'preview',
    state.parent_turn?.parent_turn_id,
    category,
    input.action_id ?? input.actionId,
    input.target_id ?? input.targetId,
    input.destination_zone_id ?? input.destinationZoneId,
    state.parent_turn?.current_state_version,
  ]);
}

function routeForTurnOperation(state, input = {}, options = {}) {
  const actorSpatial = spatialForActor(state);
  const selectedTransitionIds = asArray(input.selected_transition_ids ?? input.selectedTransitionIds);
  const route = evaluateExplicitRoute({
    source_zone_id: actorSpatial.current_zone_id,
    destination_zone_id: input.destination_zone_id ?? input.destinationZoneId,
    selected_transition_ids: selectedTransitionIds,
    transitions: state.spatial.transitions,
  });
  if (!options.crawling || route.status !== SPATIAL_OPERATION_STATUSES.VALID) {
    return route;
  }
  const ordered = route.ordered_transitions.map((entry) => {
    const cost = resolveCrawlingMovement({ transition: entry.transition });
    return { ...entry, cost };
  });
  return {
    ...route,
    ordered_transitions: ordered,
    total_cost: ordered.reduce((total, entry) => total + (entry.cost.cost ?? 0), 0),
    crawling_applied: true,
    condition_remains: true,
  };
}

export function previewAction(input = {}) {
  const state = normalizeState(input.state ?? input);
  const action = actionById(state, input.action_id ?? input.actionId);
  if (!action) {
    return unavailableResponse(state, 'action_not_found');
  }
  const preview = previewCombatActionResolution({
    action,
    actor: actorFor(state),
    target: targetById(state, input.target_id ?? input.targetId),
    resources: state.resources,
    source_state_version: state.parent_turn.current_state_version,
    preview_identity: operationPreviewIdentity(state, PLAYER_TURN_OPERATION_CATEGORIES.ACTION, input),
  });
  return {
    ...preview,
    operation_category: PLAYER_TURN_OPERATION_CATEGORIES.ACTION,
    source_state_version: state.parent_turn.current_state_version,
    action_economy_cost: action.timing_category,
    known_cover: input.known_cover ?? null,
    known_range: input.known_range ?? null,
    known_opportunity_attack_risk: null,
    concentration_warning: action.concentration ? 'Starting this may end your current concentration.' : null,
  };
}

export function previewBonusAction(input = {}) {
  const preview = previewAction(input);
  return { ...preview, operation_category: PLAYER_TURN_OPERATION_CATEGORIES.BONUS_ACTION };
}

export function previewObjectInteraction(input = {}) {
  const preview = previewAction(input);
  return { ...preview, operation_category: PLAYER_TURN_OPERATION_CATEGORIES.OBJECT_INTERACTION };
}

export function previewMovement(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actorSpatial = spatialForActor(state);
  const movement = currentMovement(state);
  const crawling = Boolean(input.crawling);
  const category = crawling ? PLAYER_TURN_OPERATION_CATEGORIES.CRAWL_MOVEMENT : PLAYER_TURN_OPERATION_CATEGORIES.MOVEMENT;
  const route = routeForTurnOperation(state, input, { crawling });
  const preview = previewMovementRoute({
    route,
    participant: {
      ...actorSpatial,
      base_movement_budget: movement.base_movement + movement.dash_added_movement,
      movement_spent: movement.movement_spent,
    },
  });
  const candidates = route.status === SPATIAL_OPERATION_STATUSES.VALID
    ? detectOpportunityAttackCandidates({
        mover: actorFor(state),
        before_proximity: input.before_proximity ?? input.beforeProximity,
        after_proximity: input.after_proximity ?? input.afterProximity,
        potential_reactors: input.potential_reactors ?? input.potentialReactors ?? state.participants.filter((participant) => participantId(participant) !== state.parent_turn.actor_participant_id),
        disengage_protected: state.turn_effects.some((effect) => effect.effect_id === 'disengage'),
      })
    : [];
  return projectSpatialForPlayer({
    ...preview,
    operation_category: category,
    preview_identity: operationPreviewIdentity(state, category, input),
    source_state_version: state.parent_turn.current_state_version,
    selected_destination_id: input.destination_zone_id ?? input.destinationZoneId,
    crawling,
    condition_remains: crawling ? true : undefined,
    known_opportunity_attack_risk: candidates.length > 0 ? 'possible_reaction' : null,
    opportunity_attack_candidates: candidates.map((candidate) => ({ reactor_id: candidate.reactor_id, reaction_kind: candidate.reaction_kind, resolved: false })),
  });
}

export function previewStanding(input = {}) {
  const state = normalizeState(input.state ?? input);
  return {
    ...resolveStandingFromProne({
      participant: spatialForActor(state),
      conditions: actorConditions(state),
      preview_only: true,
    }),
    operation_category: PLAYER_TURN_OPERATION_CATEGORIES.STAND_FROM_PRONE,
    preview_identity: operationPreviewIdentity(state, PLAYER_TURN_OPERATION_CATEGORIES.STAND_FROM_PRONE, input),
    source_state_version: state.parent_turn.current_state_version,
  };
}

export function previewCrawling(input = {}) {
  return previewMovement({ ...input, crawling: true });
}

export function previewEndTurn(input = {}) {
  const state = normalizeState(input.state ?? input);
  if (!state.parent_turn) {
    return { confirmation: { required: false, meaningful_forfeitures: [] } };
  }
  const meaningful = meaningfulEndTurnResources(state);
  return {
    operation_category: PLAYER_TURN_OPERATION_CATEGORIES.END_TURN,
    mutates_state: false,
    source_state_version: state.parent_turn.current_state_version,
    preview_identity: operationPreviewIdentity(state, PLAYER_TURN_OPERATION_CATEGORIES.END_TURN, input),
    confirmation: {
      required: meaningful.length > 0,
      meaningful_forfeitures: meaningful,
      player_safe_message: meaningful.length > 0
        ? `You still have meaningful options: ${meaningful.join(', ')}. End your turn and forfeit them?`
        : 'End your turn?',
    },
  };
}

function submitPrelude(rawState, input, category) {
  const state = normalizeState(rawState);
  const idempotency = idempotencyStatus(state, { ...input, operation_category: category });
  if (idempotency.status === 'duplicate' || idempotency.status === 'conflict') {
    return { state, done: true, response: idempotency.response, idempotency };
  }
  const basis = validateSubmitBasis(state, input);
  if (!basis.valid) {
    return { state, done: true, response: basis.response, idempotency };
  }
  return { state, done: false, idempotency };
}

function finishSubmit(state, input, category, bundleInput, subInput = {}) {
  const next = nextDecisionFor(state, subInput);
  const resultBundle = turnResultBundle({
    operation_category: category,
    parent_turn_status: state.parent_turn.status,
    next_decision: next.next_decision_kind,
    ...bundleInput,
  });
  const sub = appendSubResolution(state, {
    operation_category: category,
    source_state_version: input.source_state_version ?? input.sourceStateVersion,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey,
    timing_category: subInput.timing_category,
    decision_type: subInput.decision_type,
    result_bundle: resultBundle,
    continuation_id: subInput.continuation_id,
    next_beat_decision: next.combat_next_beat,
    transition_decision: subInput.transition_decision ?? createCombatTransitionDecision({
      combat_kind: subInput.reaction_required
        ? COMBAT_TRANSITION_DECISION_KINDS.OPEN_REACTION_INTERRUPT
        : state.parent_turn.status === PLAYER_TURN_STATUSES.CLOSED
          ? COMBAT_TRANSITION_DECISION_KINDS.BEGIN_AUTOMATIC_ENEMY_TURN
          : COMBAT_TRANSITION_DECISION_KINDS.REMAIN_IN_CURRENT_PLAYER_TURN,
    }),
  });
  state.latest_result = {
    sub_resolution_id: sub.sub_resolution_id,
    player_result_bundle: resultBundle,
  };
  const newVersion = setRevision(state);
  const response = {
    status: subInput.response_status ?? COMBAT_RESOLUTION_STATUSES.RESOLVED,
    committed: true,
    sub_resolution_id: sub.sub_resolution_id,
    source_state_version: input.source_state_version ?? input.sourceStateVersion,
    resulting_state_version: newVersion,
    player_result_bundle: resultBundle,
    read_model: buildCurrentTurnReadModel(state),
    next_decision: next,
    state,
    gm_dev_trace: {
      operation_category: category,
      sub_resolution_id: sub.sub_resolution_id,
      idempotency_key: input.idempotency_key ?? input.idempotencyKey,
      mutation_order: subInput.mutation_order ?? [],
      validation: 'committed',
      transition_decision: sub.transition_decision,
      next_beat_decision: next,
      continuation_id: subInput.continuation_id ?? null,
    },
  };
  recordIdempotency(state, subInput.idempotency ?? { status: 'missing' }, response, sub.sub_resolution_id);
  return response;
}

function submitMovementByCategory(input = {}, category = PLAYER_TURN_OPERATION_CATEGORIES.MOVEMENT, options = {}) {
  const prelude = submitPrelude(input.state ?? input, input, category);
  if (prelude.done) {
    return prelude.response;
  }
  const state = prelude.state;
  const movement = currentMovement(state);
  const actorSpatial = spatialForActor(state);
  const route = routeForTurnOperation(state, input, { crawling: options.crawling });
  const moved = commitMovementSegment({
    route,
    participant: {
      ...actorSpatial,
      base_movement_budget: movement.base_movement + movement.dash_added_movement,
      movement_spent: movement.movement_spent,
    },
  });
  if (moved.status !== SPATIAL_OPERATION_STATUSES.COMMITTED) {
    return unavailableResponse(state, moved.reason ?? moved.status, moved.player_safe_summary);
  }
  state.parent_turn.movement_spent += moved.movement_spent;
  state.spatial.participants = asArray(state.spatial.participants).filter((entry) => participantId(entry) !== state.parent_turn.actor_participant_id).concat(moved.participant_after);
  const candidates = detectOpportunityAttackCandidates({
    mover: actorFor(state),
    before_proximity: input.before_proximity ?? input.beforeProximity,
    after_proximity: input.after_proximity ?? input.afterProximity,
    potential_reactors: input.potential_reactors ?? input.potentialReactors ?? state.participants.filter((participant) => participantId(participant) !== state.parent_turn.actor_participant_id),
    disengage_protected: state.turn_effects.some((effect) => effect.effect_id === 'disengage'),
  });
  const continuationId = candidates.length > 0 ? stableId(['continuation', state.parent_turn.parent_turn_id, 'movement', asArray(state.parent_turn.sub_resolutions).length + 1]) : null;
  return finishSubmit(state, input, category, {
    operation_name: options.crawling ? 'Crawl' : 'Move',
    result: candidates.length > 0
      ? 'You move, but a reaction may interrupt the movement.'
      : options.crawling
        ? 'You crawl to a new position and remain prone.'
        : 'You move to a new position.',
    consequences: options.crawling ? ['Prone remains.'] : [],
    movement: { spent: moved.movement_spent, remaining: currentMovement(state).movement_remaining },
    position_changes: { destination_zone_id: moved.participant_after.current_zone_id },
    known_reaction_trigger: candidates.length > 0 ? { reaction_kind: 'opportunity_attack_candidate', candidates } : null,
  }, {
    idempotency: prelude.idempotency,
    timing_category: COMBAT_TIMING_CATEGORIES.MOVEMENT,
    decision_type: COMBAT_DECISION_TYPES.MOVEMENT,
    reaction_required: candidates.length > 0,
    continuation_id: continuationId,
    mutation_order: ['validate_turn', 'commit_movement_segment', 'detect_reaction_candidates', 'refresh_read_model'],
  });
}

export function submitMovement(input = {}) {
  return submitMovementByCategory(input, PLAYER_TURN_OPERATION_CATEGORIES.MOVEMENT);
}

export function submitStanding(input = {}) {
  const prelude = submitPrelude(input.state ?? input, input, PLAYER_TURN_OPERATION_CATEGORIES.STAND_FROM_PRONE);
  if (prelude.done) {
    return prelude.response;
  }
  const state = prelude.state;
  const standing = resolveStandingFromProne({ participant: spatialForActor(state), conditions: actorConditions(state) });
  if (standing.status !== SPATIAL_OPERATION_STATUSES.COMMITTED) {
    return unavailableResponse(state, standing.reason ?? standing.status, 'You cannot stand up right now.');
  }
  state.parent_turn.movement_spent += standing.standing_cost;
  const removal = removeCondition({ existing_conditions: state.conditions, condition_type: CONDITION_IDS.PRONE, removal_reason: 'stood_from_prone' });
  state.conditions = removal.remaining_conditions;
  return finishSubmit(state, input, PLAYER_TURN_OPERATION_CATEGORIES.STAND_FROM_PRONE, {
    operation_name: 'Stand',
    result: 'You stand from prone.',
    movement: { spent: standing.standing_cost, remaining: currentMovement(state).movement_remaining },
    consequences: ['Prone ends.'],
  }, {
    idempotency: prelude.idempotency,
    timing_category: COMBAT_TIMING_CATEGORIES.MOVEMENT,
    decision_type: COMBAT_DECISION_TYPES.MOVEMENT,
    mutation_order: ['validate_turn', 'spend_movement', 'remove_prone', 'refresh_read_model'],
  });
}

export function submitCrawling(input = {}) {
  return submitMovementByCategory(input, PLAYER_TURN_OPERATION_CATEGORIES.CRAWL_MOVEMENT, { crawling: true });
}

function applyRuntimeActionSideEffect(state, action, input, actionResult) {
  const runtime = normalizedKey(action.authored_metadata?.runtime_effect ?? action.authored_metadata?.turn_effect ?? action.action_id);
  const actor = actorFor(state);
  if (runtime === 'dash' || action.action_id === 'dash') {
    const speed = toInteger(actor.speed ?? actor.speed_walk ?? state.parent_turn.base_movement, state.parent_turn.base_movement);
    state.parent_turn.dash_added_movement += speed;
    return { summary: `Dash adds ${speed} movement for this turn.`, movement_added: speed };
  }
  if (runtime === 'disengage' || action.action_id === 'disengage') {
    state.turn_effects.push({ effect_id: 'disengage', source_action_id: action.action_id, expires_at: 'end_of_current_turn' });
    return { summary: 'Disengage protects your movement from ordinary opportunity attacks this turn.' };
  }
  if (runtime === 'dodge' || action.action_id === 'dodge') {
    state.turn_effects.push({ effect_id: 'dodge', source_action_id: action.action_id, expires_at: 'start_of_actor_next_turn' });
    return { summary: 'Dodge is active until the rules end it.' };
  }
  if (action.concentration) {
    state.concentration = { source_action_id: action.action_id, label: action.concentration.label ?? action.player_label };
    return { summary: 'Your concentration shifts to the new effect.' };
  }
  return { summary: actionResult.player_safe_summary?.result ?? actionResult.player_result_bundle?.result?.summary ?? `${action.player_label} resolves.` };
}

function submitActionByCategory(input = {}, category) {
  const prelude = submitPrelude(input.state ?? input, input, category);
  if (prelude.done) {
    return prelude.response;
  }
  const state = prelude.state;
  const action = actionById(state, input.action_id ?? input.actionId);
  if (!action) {
    return unavailableResponse(state, 'action_not_found');
  }
  const expectedTiming = timingForCategory(category);
  if (category === PLAYER_TURN_OPERATION_CATEGORIES.OBJECT_INTERACTION && action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.ACTION) {
    return submitActionByCategory({ ...input, state }, PLAYER_TURN_OPERATION_CATEGORIES.ACTION);
  }
  if (action.timing_category !== expectedTiming && !(category === PLAYER_TURN_OPERATION_CATEGORIES.OBJECT_INTERACTION && action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION)) {
    return unavailableResponse(state, 'wrong_timing_category');
  }
  if (!canSpendTimingSlot(state, action.timing_category)) {
    return unavailableResponse(state, 'timing_slot_unavailable');
  }
  const result = resolveCombatAction({
    action,
    actor: actorFor(state),
    target: targetById(state, input.target_id ?? input.targetId) ?? actorFor(state),
    resources: state.resources,
    committed_resolution_id: stableId(['action', state.parent_turn.parent_turn_id, action.action_id, asArray(state.parent_turn.sub_resolutions).length + 1]),
    generation_origin: input.generation_origin ?? input.generationOrigin,
    roll_overrides: input.roll_overrides ?? input.rollOverrides,
  });
  if (![COMBAT_ACTION_RESULT_STATUSES.RESOLVED, COMBAT_ACTION_RESULT_STATUSES.PARTIALLY_RESOLVED].includes(result.status)) {
    return unavailableResponse(state, result.status, result.player_safe_message ?? 'That action cannot resolve right now.');
  }
  consumeTimingSlot(state, action.timing_category);
  state.resources = result.resources_after ?? state.resources;
  applyActionMutationInstructions(state, result.mutation_instructions);
  const sideEffect = applyRuntimeActionSideEffect(state, action, input, result);
  return finishSubmit(state, input, category, {
    operation_name: action.player_label,
    result: sideEffect.summary,
    action_economy: { spent: action.timing_category },
    resource_changes: result.resource_spends ?? [],
    visible_rolls: result.ordered_steps?.filter((step) => step.result?.player_summary).map((step) => step.result.player_summary) ?? [],
    consequences: result.player_result_bundle?.consequences ?? [],
    progress: result.player_result_bundle?.progress ?? [],
  }, {
    idempotency: prelude.idempotency,
    timing_category: action.timing_category,
    decision_type: action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION
      ? COMBAT_DECISION_TYPES.BONUS_ACTION
      : [COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION].includes(action.timing_category)
        ? COMBAT_DECISION_TYPES.OBJECT_INTERACTION
        : COMBAT_DECISION_TYPES.ACTION,
    mutation_order: ['validate_turn', 'commit_action_slot', 'resolve_6d4_action', 'apply_mutations', 'refresh_read_model'],
    action_result: projectCombatActionResultForPlayer(result),
  });
}

export function submitAction(input = {}) {
  return submitActionByCategory(input, PLAYER_TURN_OPERATION_CATEGORIES.ACTION);
}

export function submitBonusAction(input = {}) {
  return submitActionByCategory(input, PLAYER_TURN_OPERATION_CATEGORIES.BONUS_ACTION);
}

export function submitObjectInteraction(input = {}) {
  return submitActionByCategory(input, PLAYER_TURN_OPERATION_CATEGORIES.OBJECT_INTERACTION);
}

export function submitWait(input = {}) {
  const prelude = submitPrelude(input.state ?? input, input, PLAYER_TURN_OPERATION_CATEGORIES.WAIT);
  if (prelude.done) {
    return prelude.response;
  }
  const state = prelude.state;
  if (state.parent_turn.action_spent || !actorCapabilities(state).can_act) {
    return unavailableResponse(state, 'wait_requires_action');
  }
  state.parent_turn.action_spent = true;
  return finishSubmit(state, input, PLAYER_TURN_OPERATION_CATEGORIES.WAIT, {
    operation_name: 'Wait',
    result: 'You wait and keep your position.',
    action_economy: { spent: COMBAT_ACTION_TIMING_CATEGORIES.ACTION },
    consequences: ['No readied trigger is created.'],
  }, {
    idempotency: prelude.idempotency,
    timing_category: COMBAT_TIMING_CATEGORIES.ACTION,
    decision_type: COMBAT_DECISION_TYPES.ACTION,
    mutation_order: ['validate_turn', 'commit_action_slot', 'record_wait', 'refresh_read_model'],
  });
}

export function submitEndTurn(input = {}) {
  const prelude = submitPrelude(input.state ?? input, input, PLAYER_TURN_OPERATION_CATEGORIES.END_TURN);
  if (prelude.done) {
    return prelude.response;
  }
  const state = prelude.state;
  const confirmation = previewEndTurn(state).confirmation;
  if (confirmation.required && input.confirm_end_turn !== true && input.confirmEndTurn !== true && input.skip_confirmation !== true) {
    return {
      status: 'confirmation_required',
      committed: false,
      confirmation,
      current_read_model: buildCurrentTurnReadModel(state),
      gm_dev_trace: { reason: 'meaningful_resources_remain', meaningful_forfeitures: confirmation.meaningful_forfeitures },
    };
  }
  const forfeited = {
    action: !state.parent_turn.action_spent,
    bonus_action: !state.parent_turn.bonus_action_spent,
    object_interaction: !state.parent_turn.object_interaction_spent,
    movement_remaining: currentMovement(state).movement_remaining,
  };
  state.parent_turn.action_spent = true;
  state.parent_turn.bonus_action_spent = true;
  state.parent_turn.object_interaction_spent = true;
  state.parent_turn.movement_spent = state.parent_turn.base_movement + state.parent_turn.dash_added_movement;
  state.parent_turn.status = PLAYER_TURN_STATUSES.CLOSED;
  state.parent_turn.turn_close_reason = input.close_reason ?? input.closeReason ?? 'player_ended_turn';
  state.action_window.status = 'closed';
  state.turn_effects = state.turn_effects.filter((effect) => effect.expires_at !== 'end_of_current_turn');
  state.conditions = processConditionLifecycleEvent({
    event_type: CONDITION_LIFECYCLE_EVENTS.END_OF_TARGET_TURN,
    conditions: state.conditions,
    participant: actorFor(state),
  }).remaining_conditions;
  return finishSubmit(state, input, PLAYER_TURN_OPERATION_CATEGORIES.END_TURN, {
    operation_name: 'End Turn',
    result: 'Your turn ends.',
    consequences: ['Unused normal-turn resources are forfeited.'],
    action_economy: { forfeited },
  }, {
    idempotency: prelude.idempotency,
    timing_category: COMBAT_TIMING_CATEGORIES.END_TURN,
    decision_type: COMBAT_DECISION_TYPES.END_TURN,
    mutation_order: ['validate_turn', 'forfeit_turn_resources', 'process_end_turn_hooks', 'close_action_window', 'handoff_automatic_continuation'],
  });
}

export function applyMissedTurnDefault(input = {}) {
  let state = normalizeState(input.state ?? input);
  const dodge = actionById(state, input.dodge_action_id ?? input.dodgeActionId ?? 'dodge');
  const applied = [];
  if (dodge && !state.parent_turn.action_spent && actorCapabilities(state).can_act) {
    const dodgeResult = submitAction({
      state,
      action_id: dodge.action_id,
      target_id: state.parent_turn.actor_participant_id,
      source_state_version: state.parent_turn.current_state_version,
      idempotency_key: cleanText(input.idempotency_key ?? input.idempotencyKey) || stableId(['timeout', state.parent_turn.parent_turn_id, 'dodge']),
    });
    state = dodgeResult.state;
    applied.push({ default_action: 'dodge', status: dodgeResult.status, sub_resolution_id: dodgeResult.sub_resolution_id });
  } else {
    applied.push({ default_action: 'no_action', status: 'dodge_illegal' });
  }
  const end = submitEndTurn({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: stableId(['timeout', state.parent_turn.parent_turn_id, 'end_turn']),
    skip_confirmation: true,
    close_reason: 'missed_turn_timeout',
  });
  return {
    status: 'missed_turn_default_applied',
    state: end.state,
    default_actions: applied.concat({ default_action: 'end_turn', status: end.status, sub_resolution_id: end.sub_resolution_id }),
    player_safe_summary: applied[0].default_action === 'dodge'
      ? 'You missed the turn timer, so Dodge was applied and your turn ended.'
      : 'You missed the turn timer, so no action was taken and your turn ended.',
    gm_dev_trace: {
      timeout_provenance: input.timeout_provenance ?? input.timeoutProvenance ?? 'scheduler',
      dodge_legal: applied[0].default_action === 'dodge',
    },
  };
}

export function closeTurnAutomatically(input = {}) {
  const state = normalizeState(input.state ?? input);
  const reason = cleanText(input.reason) || 'actor_cannot_continue';
  const categories = listCurrentLegalDecisionCategories(state);
  const meaningful = categories.some((category) => category.available && ['move', 'action', 'bonus_action', 'object_interaction', 'wait'].includes(category.category));
  const actor = actorFor(state);
  const actorUnable = actor?.defeated === true || actor?.active === false || actorConditions(state).some((condition) =>
    [CONDITION_IDS.UNCONSCIOUS, CONDITION_IDS.STUNNED, CONDITION_IDS.INCAPACITATED].includes(condition.condition_type)
  );
  if (!actorUnable && meaningful && input.force !== true) {
    return {
      status: 'not_closed',
      state,
      reason: 'meaningful_decision_remains',
      read_model: buildCurrentTurnReadModel(state),
    };
  }
  return submitEndTurn({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: stableId(['auto-close', state.parent_turn.parent_turn_id, reason]),
    skip_confirmation: true,
    close_reason: reason,
  });
}

export function enterRecoveryNeeded(input = {}) {
  const state = normalizeState(input.state ?? input);
  state.parent_turn.status = PLAYER_TURN_STATUSES.RECOVERY_NEEDED;
  state.parent_turn.recovery_reason = cleanText(input.reason) || 'resolution_incomplete';
  setRevision(state);
  return {
    status: PLAYER_TURN_STATUSES.RECOVERY_NEEDED,
    state,
    read_model: buildCurrentTurnReadModel(state),
    player_safe_message: 'This combat turn needs review before it can continue.',
    retry_safe: Boolean(input.retry_safe ?? input.retrySafe),
    gm_dev_trace: {
      failed_step: input.failed_step ?? input.failedStep ?? null,
      completed_facts_preserved: input.completed_facts ?? input.completedFacts ?? [],
      recommended_repair: input.recommended_repair ?? input.recommendedRepair ?? 'review_turn_state',
    },
  };
}

export function refreshCurrentTurnReadModel(input = {}) {
  return buildCurrentTurnReadModel(input.state ?? input);
}

export function produceNextDecision(input = {}) {
  return nextDecisionFor(normalizeState(input.state ?? input), input);
}

export function projectPlayerTurnForPlayer(payload = {}) {
  const projected = cloneSerializable(payload);
  function strip(value) {
    if (!value || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(strip);
    }
    for (const key of Object.keys(value)) {
      const normalized = normalizedKey(key);
      if (['state', 'gmdevtrace', 'idempotencyrecords'].includes(normalized) || PLAYER_PROHIBITED_KEYS.some((forbidden) => normalized.includes(normalizedKey(forbidden)))) {
        delete value[key];
      } else {
        strip(value[key]);
      }
    }
    return value;
  }
  const stripped = strip(projected);
  assertNoPlayerTurnHiddenData(stripped);
  return stripped;
}

export function buildPlayerTurnGmDevTrace(input = {}) {
  return {
    trace_kind: 'combat_player_turn_runtime',
    payload: cloneSerializable(input),
  };
}

export function assertNoPlayerTurnHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const key of PLAYER_PROHIBITED_KEYS) {
    if (serialized.includes(key)) {
      throw turnError(`Player turn payload contains prohibited key "${key}".`, 'COMBAT_PLAYER_TURN_VISIBILITY_LEAK');
    }
  }
  assertNoCombatPlayerHiddenData(payload);
  return true;
}
