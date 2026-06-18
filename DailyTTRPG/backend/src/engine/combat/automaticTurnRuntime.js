import {
  COMBAT_NEXT_BEAT_DECISION_KINDS,
  COMBAT_RESOLUTION_STATUSES,
  COMBAT_TRANSITION_DECISION_KINDS,
  createCombatNextBeatDecision,
  createCombatParentTurn,
  createCombatRulesetIdentity,
  createCombatTransitionDecision,
} from '../../services/interactionCore/combatAdapterContract.js';
import {
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_RESOURCE_CATEGORIES,
  COMBAT_TARGET_POLICIES,
  createCombatActionDefinition,
  createCombatResourceState,
} from './actionEffectResourceFramework.js';
import {
  CONDITION_CONTEXT_KINDS,
  CONDITION_LIFECYCLE_EVENTS,
  evaluateConditionEffects,
  processConditionLifecycleEvent,
} from './conditionStateLifecycle.js';
import {
  PROXIMITY_STATES,
  createParticipantSpatialState,
  evaluateExplicitRoute,
  evaluateRetreatRoute,
} from './spatialMovement.js';
import {
  DND5E_2014_RULESET,
  PLAYER_TURN_STATUSES,
  TURN_NEXT_DECISION_KINDS,
  buildCurrentTurnReadModel,
  listCurrentLegalDecisionCategories,
  submitAction,
  submitBonusAction,
  submitEndTurn,
  submitMovement,
  submitObjectInteraction,
  submitWait,
} from './playerTurnRuntime.js';
import {
  REACTION_NEXT_DECISION_KINDS,
  REACTION_PREFERENCE_VALUES,
  REACTION_TRIGGER_STATUSES,
  createOpportunityAttackTriggerFromMovement,
  processReactionTrigger,
  refreshReactionResourceAtTurnStart,
} from './reactionInterruptRuntime.js';

export const AUTOMATIC_CONTROL_MODES = Object.freeze({
  PLAYER: 'player',
  DETERMINISTIC_ENEMY: 'deterministic_enemy',
  DETERMINISTIC_ALLY: 'deterministic_ally',
  SCRIPTED: 'scripted',
  GM_DEV: 'gm_dev',
});

export const LEGACY_CONTROL_MODE_ALIASES = Object.freeze({
  ai: AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY,
  system: AUTOMATIC_CONTROL_MODES.SCRIPTED,
  manual: AUTOMATIC_CONTROL_MODES.GM_DEV,
});

export const TACTICAL_PROFILE_SCOPES = Object.freeze({
  ENCOUNTER_SCRIPTED_OVERRIDE: 'encounter_scripted_override',
  PARTICIPANT: 'participant',
  ENCOUNTER_ROLE: 'encounter_role',
  STAT_BLOCK: 'stat_block',
  FACTION: 'faction',
  CONSERVATIVE_DEFAULT: 'conservative_default',
});

export const TACTICAL_OPERATION_CATEGORIES = Object.freeze({
  MOVEMENT: 'movement',
  ACTION: 'action',
  BONUS_ACTION: 'bonus_action',
  OBJECT_INTERACTION: 'object_interaction',
  WAIT: 'wait',
  END_TURN: 'end_turn',
  RETREAT_MOVEMENT: 'retreat_movement',
  SURRENDER_INTENT: 'surrender_intent',
});

export const TACTICAL_CONDITION_TYPES = Object.freeze({
  ALWAYS: 'always',
  ACTION_LEGAL: 'action_legal',
  TIMING_AVAILABLE: 'timing_available',
  RESOURCE_AVAILABLE: 'resource_available',
  ACTOR_HEALTH_BELOW_PERCENT: 'actor_health_below_percent',
  ACTOR_HEALTH_ABOVE_PERCENT: 'actor_health_above_percent',
  TARGET_HEALTH_BAND: 'target_health_band',
  ACTOR_CONDITION_PRESENT: 'actor_condition_present',
  ACTOR_CONDITION_ABSENT: 'actor_condition_absent',
  TARGET_CONDITION_PRESENT: 'target_condition_present',
  TARGET_CONDITION_ABSENT: 'target_condition_absent',
  ACTOR_CONCENTRATING: 'actor_concentrating',
  ACTOR_NOT_CONCENTRATING: 'actor_not_concentrating',
  ACTOR_ENGAGED: 'actor_engaged',
  ACTOR_NOT_ENGAGED: 'actor_not_engaged',
  TARGET_PROXIMITY: 'target_proximity',
  TARGET_ZONE: 'target_zone',
  ACTOR_ZONE: 'actor_zone',
  TARGET_VISIBLE: 'target_visible',
  TARGET_HAS_COVER: 'target_has_cover',
  VISIBLE_HOSTILE_COUNT: 'visible_hostile_count',
  ENCOUNTER_FLAG: 'encounter_flag',
  OBJECTIVE_STATE: 'objective_state',
  PRIOR_ACTION_USED_THIS_TURN: 'prior_action_used_this_turn',
  RETREAT_ROUTE_VISIBLE: 'retreat_route_visible',
  SURRENDER_PERMISSION_ACTIVE: 'surrender_permission_active',
  SCRIPTED_PHASE_ACTIVE: 'scripted_phase_active',
});

export const TACTICAL_TARGET_SELECTORS = Object.freeze({
  SELF: 'self',
  EXPLICIT_PARTICIPANT: 'explicit_participant',
  CURRENT_SCRIPTED_TARGET: 'current_scripted_target',
  ENGAGED_HOSTILE: 'engaged_hostile',
  HOSTILE_WITHIN_ACTION_RANGE: 'hostile_within_action_range',
  NEAREST_VISIBLE_HOSTILE: 'nearest_visible_hostile',
  LOWEST_HEALTH_VISIBLE_HOSTILE: 'lowest_health_visible_hostile',
  HIGHEST_HEALTH_VISIBLE_HOSTILE: 'highest_health_visible_hostile',
  PROTECT_ALLY_ENGAGED_WITH_HOSTILE: 'protect_ally_engaged_with_hostile',
});

export const TACTICAL_POSITIONING_SELECTORS = Object.freeze({
  HOLD_POSITION: 'hold_position',
  MOVE_TOWARD_TARGET: 'move_toward_target',
  MOVE_TO_COVER: 'move_to_cover',
  MOVE_TO_RETREAT_ROUTE: 'move_to_retreat_route',
  SCRIPTED_DESTINATION: 'scripted_destination',
});

export const RESOURCE_CONSERVATION_RULES = Object.freeze({
  NEVER_USE: 'never_use',
  ALLOW_SPEND: 'allow_spend',
  PRESERVE_FINAL_USE: 'preserve_final_use',
  THRESHOLD_GATED: 'threshold_gated',
  PHASE_GATED: 'phase_gated',
  PREFER_UNLIMITED_ACTION: 'prefer_unlimited_action',
});

export const AUTOMATIC_NEXT_DECISION_KINDS = Object.freeze({
  CONTINUE_AUTOMATIC_CHAIN: 'continue_automatic_chain',
  PLAYER_TURN_REQUIRED: 'player_turn_required',
  PLAYER_REACTION_REQUIRED: 'player_reaction_required',
  REQUIRED_PLAYER_DECISION: 'required_player_decision',
  ENCOUNTER_RESOLUTION_REQUIRED: 'encounter_resolution_required',
  UNAVAILABLE: 'unavailable',
  RECOVERY_NEEDED: 'recovery_needed',
  CHAIN_COMPLETE: 'chain_complete',
});

export const AUTOMATIC_EVENT_TYPES = Object.freeze({
  TURN_STARTED: 'turn_started',
  MOVEMENT: 'movement',
  ACTION: 'action',
  BONUS_ACTION: 'bonus_action',
  OBJECT_INTERACTION: 'object_interaction',
  WAIT: 'wait',
  END_TURN: 'end_turn',
  REACTION_INTERRUPT: 'reaction_interrupt',
  RETREAT_INTENT: 'retreat_intent',
  SURRENDER_INTENT: 'surrender_intent',
  FALLBACK: 'fallback',
  RECOVERY_NEEDED: 'recovery_needed',
});

const PRECEDENCE = Object.freeze([
  TACTICAL_PROFILE_SCOPES.ENCOUNTER_SCRIPTED_OVERRIDE,
  TACTICAL_PROFILE_SCOPES.PARTICIPANT,
  TACTICAL_PROFILE_SCOPES.ENCOUNTER_ROLE,
  TACTICAL_PROFILE_SCOPES.STAT_BLOCK,
  TACTICAL_PROFILE_SCOPES.FACTION,
  TACTICAL_PROFILE_SCOPES.CONSERVATIVE_DEFAULT,
]);

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'armor_class',
  'target_armor_class',
  'difficulty_class',
  'hidden',
  'raw_roll',
  'roll_record',
  'roll_override',
  'mutation_plan',
  'idempotency_key',
  'source_state_version',
  'current_state_version',
  'profile',
  'tactical_profile',
  'priorities_considered',
  'actions_rejected',
  'targets_considered',
  'routes_considered',
  'resource_decision',
  'gm_dev',
  'trace',
  'control_mode',
  'action_window_id',
  'test_override',
  'secret',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(String(value ?? '')).toLowerCase();
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

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function automaticError(message, code = 'COMBAT_AUTOMATIC_TURN_ERROR') {
  const error = new Error(message);
  error.code = code;
  error.player_safe_message = 'Automatic combat cannot continue safely yet.';
  return error;
}

function normalizeRuleset(input = DND5E_2014_RULESET) {
  const ruleset = createCombatRulesetIdentity(input);
  if (ruleset.system !== DND5E_2014_RULESET.system || ruleset.rules_version !== DND5E_2014_RULESET.rules_version) {
    throw automaticError(`Unsupported automatic combat ruleset ${ruleset.system}/${ruleset.rules_version}.`, 'UNSUPPORTED_AUTOMATIC_RULESET');
  }
  return ruleset;
}

function participantId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function actionId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.action_id ?? input.actionId ?? input.id);
}

function conditionType(input = {}) {
  return cleanText(input.condition_type ?? input.conditionType ?? input.id);
}

function normalizeControlMode(participant = {}) {
  const explicit = cleanText(participant.control_mode ?? participant.controlMode);
  if (Object.values(AUTOMATIC_CONTROL_MODES).includes(explicit)) {
    return explicit;
  }
  if (LEGACY_CONTROL_MODE_ALIASES[explicit]) {
    return LEGACY_CONTROL_MODE_ALIASES[explicit];
  }
  if (participant.player_controlled === true || participant.is_player_character === true || participant.faction === 'player' && explicit !== 'ai') {
    return AUTOMATIC_CONTROL_MODES.PLAYER;
  }
  return AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY;
}

function isAutomaticControlMode(mode) {
  return [
    AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ENEMY,
    AUTOMATIC_CONTROL_MODES.DETERMINISTIC_ALLY,
    AUTOMATIC_CONTROL_MODES.SCRIPTED,
  ].includes(mode);
}

function findParticipant(state, id) {
  return asArray(state.participants).find((entry) => participantId(entry) === cleanText(id)) ?? null;
}

function actorFor(state) {
  return findParticipant(state, state.parent_turn?.actor_participant_id ?? state.current_participant_id ?? state.combat?.current_participant_id);
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
  state.combat.combat_id = cleanText(state.combat.combat_id ?? state.combat.id ?? state.combat_id) || 'combat:auto-test';
  state.combat.status = cleanText(state.combat.status) || 'active';
  state.combat.ruleset = normalizeRuleset(state.combat.ruleset ?? state.ruleset ?? DND5E_2014_RULESET);
  state.combat.round_number = toInteger(state.combat.round_number, 1);
  state.participants = asArray(state.participants);
  state.actions = normalizeActionDefinitions(state.actions ?? state.action_definitions ?? state.actionDefinitions);
  state.resources = normalizeResources(state.resources);
  state.conditions = asArray(state.conditions);
  state.spatial = state.spatial ?? {};
  state.spatial.participants = asArray(state.spatial.participants);
  state.spatial.zones = asArray(state.spatial.zones);
  state.spatial.transitions = asArray(state.spatial.transitions);
  state.faction_relationships = asArray(state.faction_relationships ?? state.factionRelationships);
  state.encounter_flags = state.encounter_flags ?? state.encounterFlags ?? {};
  state.objective_states = state.objective_states ?? state.objectiveStates ?? {};
  state.tactical_profiles = asArray(state.tactical_profiles ?? state.tacticalProfiles).map(createTacticalProfile);
  state.scripted_overrides = asArray(state.scripted_overrides ?? state.scriptedOverrides);
  state.automatic_events = asArray(state.automatic_events ?? state.automaticEvents);
  state.automatic_traces = asArray(state.automatic_traces ?? state.automaticTraces);
  state.automatic_idempotency_records = state.automatic_idempotency_records ?? {};
  return state;
}

function participantConditions(state, participantIdValue) {
  return asArray(state.conditions).filter((condition) =>
    condition.target_participant_id === participantIdValue && condition.active !== false && condition.expired !== true
  );
}

function actorCapabilities(state, actor = actorFor(state)) {
  const effects = evaluateConditionEffects({
    participant: actor,
    conditions: participantConditions(state, participantId(actor)),
    context_kind: CONDITION_CONTEXT_KINDS.CAPABILITY,
  });
  const actionEffects = evaluateConditionEffects({
    participant: actor,
    conditions: participantConditions(state, participantId(actor)),
    context_kind: CONDITION_CONTEXT_KINDS.ACTION_LEGALITY,
  });
  const movementEffects = evaluateConditionEffects({
    participant: actor,
    conditions: participantConditions(state, participantId(actor)),
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

function spatialForParticipant(state, participant) {
  const id = participantId(participant);
  const existing = asArray(state.spatial?.participants).find((entry) => participantId(entry) === id);
  if (existing) {
    return existing;
  }
  return createParticipantSpatialState({
    participant_id: id,
    current_zone_id: participant.current_zone_id ?? participant.zone_id ?? null,
    size: participant.size ?? 'medium',
    speed: participant.speed ?? participant.speed_walk ?? 30,
    relationships: participant.relationships ?? [],
  });
}

function relationFor(state, actor, target) {
  const actorFaction = cleanText(actor?.faction);
  const targetFaction = cleanText(target?.faction);
  const explicit = asArray(state.faction_relationships).find((entry) =>
    cleanText(entry.faction_a ?? entry.factionA) === actorFaction &&
    cleanText(entry.faction_b ?? entry.factionB) === targetFaction
  );
  if (explicit) {
    return cleanText(explicit.relationship) || (explicit.hostile === true ? 'hostile' : 'neutral');
  }
  if (!actorFaction || !targetFaction || actorFaction === targetFaction) {
    return 'allied';
  }
  if (actorFaction === 'neutral' || targetFaction === 'neutral') {
    return 'neutral';
  }
  return 'hostile';
}

function isHostile(state, actor, target) {
  return relationFor(state, actor, target) === 'hostile';
}

function isVisibleToActor(state, actor, target) {
  if (!target || target.active === false || target.defeated === true) {
    return false;
  }
  if (target.hidden === true || target.concealed_from?.includes(participantId(actor))) {
    return false;
  }
  if (target.visible_to && !asArray(target.visible_to).includes(participantId(actor))) {
    return false;
  }
  return target.can_be_perceived !== false;
}

function healthPercent(participant = {}) {
  const current = toNumber(participant.current_hit_points ?? participant.currentHp ?? participant.current_hp, null);
  const maximum = toNumber(participant.max_hit_points ?? participant.maxHp ?? participant.max_hp, null);
  if (current === null || maximum === null || maximum <= 0) {
    return null;
  }
  return current / maximum;
}

function healthBand(participant = {}) {
  if (participant.defeated === true || participant.is_defeated === true || toNumber(participant.current_hit_points ?? participant.current_hp, 1) <= 0) {
    return 'defeated';
  }
  const percent = healthPercent(participant);
  if (percent === null) {
    return cleanText(participant.health_band) || 'unknown';
  }
  if (percent >= 0.75) {
    return 'steady';
  }
  if (percent >= 0.4) {
    return 'wounded';
  }
  return 'badly_wounded';
}

function proximityBetween(state, leftId, rightId) {
  const leftSpatial = spatialForParticipant(state, findParticipant(state, leftId) ?? { participant_id: leftId });
  const relationship = asArray(leftSpatial.relationships).find((entry) =>
    [entry.participant_a_id, entry.participantAId, entry.participant_b_id, entry.participantBId].map(cleanText).includes(cleanText(rightId))
  );
  return cleanText(relationship?.proximity) || null;
}

function actionById(state, id) {
  return asArray(state.actions).find((action) => action.action_id === cleanText(id)) ?? null;
}

function targetPolicyAllows(action, target, actor, state) {
  if (!action) {
    return false;
  }
  if (action.target_policy === COMBAT_TARGET_POLICIES.NO_TARGET) {
    return true;
  }
  if (action.target_policy === COMBAT_TARGET_POLICIES.SELF) {
    return participantId(target) === participantId(actor);
  }
  if (action.target_policy === COMBAT_TARGET_POLICIES.ONE_ALLY) {
    return target && !isHostile(state, actor, target);
  }
  if (action.target_policy === COMBAT_TARGET_POLICIES.ONE_ENEMY) {
    return target && isHostile(state, actor, target);
  }
  return target !== null;
}

function timingAvailable(state, timing) {
  const turn = state.parent_turn ?? {};
  if (timing === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION) {
    return !turn.bonus_action_spent;
  }
  if ([COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION].includes(timing)) {
    return !turn.object_interaction_spent;
  }
  if (timing === COMBAT_ACTION_TIMING_CATEGORIES.REACTION) {
    return turn.reaction_available !== false;
  }
  return !turn.action_spent;
}

function actionLegal(state, action, target = null) {
  const actor = actorFor(state);
  const capabilities = actorCapabilities(state, actor);
  if (!action || !actor || action.authored_metadata?.unsupported === true) {
    return { legal: false, reason: 'missing_or_unsupported_action' };
  }
  if (action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION && !capabilities.can_bonus_action) {
    return { legal: false, reason: 'bonus_action_blocked_by_condition' };
  }
  if (action.timing_category !== COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION && !capabilities.can_act) {
    return { legal: false, reason: 'action_blocked_by_condition' };
  }
  if (!timingAvailable(state, action.timing_category)) {
    return { legal: false, reason: 'timing_spent' };
  }
  if (!targetPolicyAllows(action, target, actor, state)) {
    return { legal: false, reason: 'target_policy_failed' };
  }
  return { legal: true };
}

function currentMovementRemaining(state) {
  const turn = state.parent_turn ?? {};
  return Math.max(toInteger(turn.base_movement) + toInteger(turn.dash_added_movement) - toInteger(turn.movement_spent), 0);
}

function visibleHostiles(context) {
  return context.visible_participants.filter((participant) => participant.relation === 'hostile');
}

function visibleAllies(context) {
  return context.visible_participants.filter((participant) => participant.relation === 'allied');
}

function normalizeActionPriorityRule(input = {}, index = 0) {
  return {
    rule_id: cleanText(input.rule_id ?? input.ruleId ?? input.id) || `rule:${index + 1}`,
    order: toInteger(input.order, index + 1),
    action_id: cleanText(input.action_id ?? input.actionId) || null,
    action_category: cleanText(input.action_category ?? input.actionCategory) || TACTICAL_OPERATION_CATEGORIES.ACTION,
    use_conditions: asArray(input.use_conditions ?? input.useConditions),
    target_selector: input.target_selector ?? input.targetSelector ?? { selector: TACTICAL_TARGET_SELECTORS.NEAREST_VISIBLE_HOSTILE },
    positioning_requirement: input.positioning_requirement ?? input.positioningRequirement ?? null,
    movement_allowance: input.movement_allowance ?? input.movementAllowance ?? {},
    resource_rule: input.resource_rule ?? input.resourceRule ?? null,
    minimum_use_threshold: input.minimum_use_threshold ?? input.minimumUseThreshold ?? null,
    maximum_use_threshold: input.maximum_use_threshold ?? input.maximumUseThreshold ?? null,
    repeatable_this_turn: input.repeatable_this_turn ?? input.repeatableThisTurn ?? false,
    fallback_behavior: input.fallback_behavior ?? input.fallbackBehavior ?? null,
    player_visibility: cleanText(input.player_visibility ?? input.playerVisibility) || 'internal',
    gm_dev_provenance: input.gm_dev_provenance ?? input.gmDevProvenance ?? {},
  };
}

function normalizeThreshold(input = {}) {
  return {
    threshold_id: cleanText(input.threshold_id ?? input.thresholdId ?? input.id) || null,
    hit_point_percent_at_or_below: toNumber(input.hit_point_percent_at_or_below ?? input.hitPointPercentAtOrBelow, null),
    requires_permission_flag: cleanText(input.requires_permission_flag ?? input.requiresPermissionFlag) || null,
    route_selector: input.route_selector ?? input.routeSelector ?? null,
    outcome_kind: cleanText(input.outcome_kind ?? input.outcomeKind) || null,
    gm_dev_provenance: input.gm_dev_provenance ?? input.gmDevProvenance ?? {},
  };
}

function containsExecutable(value) {
  if (typeof value === 'function') {
    return true;
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.values(value).some(containsExecutable);
}

export function createTacticalProfile(input = {}) {
  if (containsExecutable(input)) {
    throw automaticError('Executable tactical profile authoring is not supported.', 'EXECUTABLE_TACTICAL_PROFILE_REJECTED');
  }
  const ruleset = normalizeRuleset(input.ruleset ?? DND5E_2014_RULESET);
  const scope = cleanText(input.scope) || TACTICAL_PROFILE_SCOPES.PARTICIPANT;
  if (!Object.values(TACTICAL_PROFILE_SCOPES).includes(scope)) {
    throw automaticError(`Unsupported tactical profile scope ${scope}.`, 'INVALID_TACTICAL_PROFILE_SCOPE');
  }
  return {
    profile_id: cleanText(input.profile_id ?? input.profileId ?? input.id) || `${scope}:profile`,
    profile_version: cleanText(input.profile_version ?? input.profileVersion) || '1',
    internal_name: cleanText(input.internal_name ?? input.internalName ?? input.name) || null,
    player_safe_name: cleanText(input.player_safe_name ?? input.playerSafeName) || null,
    ruleset,
    ruleset_id: ruleset.ruleset_id,
    rules_version: ruleset.rules_version,
    scope,
    applies_to: input.applies_to ?? input.appliesTo ?? {},
    action_priorities: asArray(input.action_priorities ?? input.actionPriorities)
      .map(normalizeActionPriorityRule)
      .sort((left, right) => left.order - right.order || left.rule_id.localeCompare(right.rule_id)),
    target_preferences: asArray(input.target_preferences ?? input.targetPreferences),
    positioning_preferences: asArray(input.positioning_preferences ?? input.positioningPreferences),
    retreat_thresholds: asArray(input.retreat_thresholds ?? input.retreatThresholds).map(normalizeThreshold),
    surrender_thresholds: asArray(input.surrender_thresholds ?? input.surrenderThresholds).map(normalizeThreshold),
    resource_conservation_rules: asArray(input.resource_conservation_rules ?? input.resourceConservationRules),
    scripted_overrides: asArray(input.scripted_overrides ?? input.scriptedOverrides),
    safe_fallback: input.safe_fallback ?? input.safeFallback ?? { fallback_id: 'default_dodge_wait_end', order: ['dodge', 'wait', 'end_turn'] },
    tie_break_rules: input.tie_break_rules ?? input.tieBreakRules ?? { final: 'stable_participant_id' },
    information_access_policy: input.information_access_policy ?? input.informationAccessPolicy ?? { policy_id: 'observable_only' },
    player_visibility_classification: cleanText(input.player_visibility_classification ?? input.playerVisibilityClassification) || 'internal',
    gm_dev_provenance: input.gm_dev_provenance ?? input.gmDevProvenance ?? {},
  };
}

export function createConservativeDefaultTacticalProfile(input = {}) {
  return createTacticalProfile({
    profile_id: input.profile_id ?? 'conservative-default-dnd5e-2014',
    scope: TACTICAL_PROFILE_SCOPES.CONSERVATIVE_DEFAULT,
    internal_name: 'Conservative default tactical profile',
    ruleset: input.ruleset ?? DND5E_2014_RULESET,
    action_priorities: [
      {
        rule_id: 'default-engaged-basic-attack',
        order: 10,
        action_category: TACTICAL_OPERATION_CATEGORIES.ACTION,
        action_id: input.basic_attack_action_id ?? 'basic-strike',
        use_conditions: [
          { type: TACTICAL_CONDITION_TYPES.ACTOR_ENGAGED },
          { type: TACTICAL_CONDITION_TYPES.ACTION_LEGAL },
        ],
        target_selector: { selector: TACTICAL_TARGET_SELECTORS.ENGAGED_HOSTILE },
        resource_rule: { rule: RESOURCE_CONSERVATION_RULES.PREFER_UNLIMITED_ACTION },
      },
      {
        rule_id: 'default-move-toward-visible-hostile',
        order: 20,
        action_category: TACTICAL_OPERATION_CATEGORIES.MOVEMENT,
        use_conditions: [
          { type: TACTICAL_CONDITION_TYPES.TARGET_VISIBLE },
        ],
        target_selector: { selector: TACTICAL_TARGET_SELECTORS.NEAREST_VISIBLE_HOSTILE },
        positioning_requirement: { selector: TACTICAL_POSITIONING_SELECTORS.MOVE_TOWARD_TARGET, avoid_opportunity_risk: true },
      },
    ],
    resource_conservation_rules: [
      { rule: RESOURCE_CONSERVATION_RULES.NEVER_USE, resource_category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE },
      { rule: RESOURCE_CONSERVATION_RULES.NEVER_USE, resource_category: COMBAT_RESOURCE_CATEGORIES.SHORT_REST_USE },
      { rule: RESOURCE_CONSERVATION_RULES.NEVER_USE, resource_category: COMBAT_RESOURCE_CATEGORIES.LONG_REST_USE },
    ],
    safe_fallback: { fallback_id: 'conservative-dodge-wait-end', order: ['dodge', 'wait', 'end_turn'] },
    gm_dev_provenance: { default_profile: true, avoids_limited_resources: true },
  });
}

function profileApplies(profile, actor = {}, state = {}) {
  const applies = profile.applies_to ?? {};
  if (profile.scope === TACTICAL_PROFILE_SCOPES.CONSERVATIVE_DEFAULT) {
    return true;
  }
  if (applies.participant_id && cleanText(applies.participant_id) !== participantId(actor)) {
    return false;
  }
  if (applies.faction && cleanText(applies.faction) !== cleanText(actor.faction)) {
    return false;
  }
  if (applies.control_mode && cleanText(applies.control_mode) !== normalizeControlMode(actor)) {
    return false;
  }
  if (applies.stat_block_id && cleanText(applies.stat_block_id) !== cleanText(actor.stat_block_id)) {
    return false;
  }
  if (applies.encounter_role && cleanText(applies.encounter_role) !== cleanText(actor.encounter_role)) {
    return false;
  }
  if (applies.scripted_phase && cleanText(applies.scripted_phase) !== cleanText(state.scripted_phase ?? state.combat?.scripted_phase)) {
    return false;
  }
  return true;
}

function firstProfileByScope(profiles, scope, actor, state) {
  return profiles.find((profile) => profile.scope === scope && profileApplies(profile, actor, state)) ?? null;
}

export function resolveEffectiveTacticalProfile(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state);
  const profiles = asArray(input.profiles ?? input.tactical_profiles ?? state.tactical_profiles)
    .map(createTacticalProfile)
    .concat(createConservativeDefaultTacticalProfile({ ruleset: state.combat.ruleset }));
  const selectedByScope = Object.fromEntries(PRECEDENCE.map((scope) => [scope, firstProfileByScope(profiles, scope, actor, state)]));
  const fields = [
    'action_priorities',
    'target_preferences',
    'positioning_preferences',
    'retreat_thresholds',
    'surrender_thresholds',
    'resource_conservation_rules',
    'scripted_overrides',
    'safe_fallback',
    'tie_break_rules',
    'information_access_policy',
  ];
  const effective = {
    ...createConservativeDefaultTacticalProfile({ ruleset: state.combat.ruleset }),
    profile_id: stableId(['effective', participantId(actor), state.combat.combat_id]),
    source_profile_ids: [],
    field_provenance: {},
  };
  for (const field of fields) {
    for (const scope of PRECEDENCE) {
      const profile = selectedByScope[scope];
      if (!profile) {
        continue;
      }
      const value = profile[field];
      const hasValue = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
      if (hasValue) {
        effective[field] = cloneSerializable(value);
        effective.field_provenance[field] = { scope, profile_id: profile.profile_id };
        if (!effective.source_profile_ids.includes(profile.profile_id)) {
          effective.source_profile_ids.push(profile.profile_id);
        }
        break;
      }
    }
  }
  return {
    status: 'resolved',
    effective_profile: effective,
    precedence: PRECEDENCE,
    selected_profiles: Object.fromEntries(Object.entries(selectedByScope).filter(([, profile]) => profile).map(([scope, profile]) => [scope, profile.profile_id])),
    gm_dev_trace: {
      profile_precedence: PRECEDENCE,
      field_provenance: effective.field_provenance,
      source_profile_ids: effective.source_profile_ids,
    },
  };
}

export function buildTacticalContext(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state);
  if (!actor) {
    throw automaticError('Automatic tactical context requires an actor.', 'AUTOMATIC_ACTOR_NOT_FOUND');
  }
  const actorSpatial = spatialForParticipant(state, actor);
  const visibleParticipants = state.participants
    .filter((participant) => participantId(participant) !== participantId(actor))
    .filter((participant) => isVisibleToActor(state, actor, participant))
    .map((participant) => {
      const spatial = spatialForParticipant(state, participant);
      return {
        participant_id: participantId(participant),
        display_name: participant.display_name ?? participant.name ?? participantId(participant),
        faction: participant.faction ?? null,
        relation: relationFor(state, actor, participant),
        health_band: healthBand(participant),
        current_zone_id: spatial.current_zone_id ?? participant.current_zone_id ?? null,
        proximity: proximityBetween(state, participantId(actor), participantId(participant)),
        visible_conditions: participantConditions(state, participantId(participant)).map(conditionType),
        has_cover: asArray(spatial.cover_relationships).length > 0 || Boolean(participant.has_cover),
        active: participant.active !== false,
        defeated: participant.defeated === true,
      };
    });
  return {
    state,
    actor,
    actor_id: participantId(actor),
    actor_control_mode: normalizeControlMode(actor),
    actor_faction: actor.faction ?? null,
    actor_health_percent: healthPercent(actor),
    actor_health_band: healthBand(actor),
    actor_conditions: participantConditions(state, participantId(actor)).map(conditionType),
    actor_spatial: actorSpatial,
    actor_zone_id: actorSpatial.current_zone_id ?? actor.current_zone_id ?? null,
    actor_engaged: visibleParticipants.some((participant) => participant.relation === 'hostile' && participant.proximity === PROXIMITY_STATES.ENGAGED),
    actor_capabilities: actorCapabilities(state, actor),
    visible_participants: visibleParticipants,
    actions: state.actions,
    resources: state.resources,
    movement_remaining: currentMovementRemaining(state),
    encounter_flags: state.encounter_flags,
    objective_states: state.objective_states,
    scripted_phase: cleanText(state.scripted_phase ?? state.combat?.scripted_phase),
    prior_actions_this_turn: asArray(state.parent_turn?.sub_resolutions).map((entry) => entry.result_bundle?.operation_category ?? entry.decision_type).filter(Boolean),
    information_policy: 'observable_only',
  };
}

function conditionMatches(condition, context, action = null, target = null) {
  const type = cleanText(condition.type ?? condition.condition_type ?? condition.conditionType) || TACTICAL_CONDITION_TYPES.ALWAYS;
  switch (type) {
    case TACTICAL_CONDITION_TYPES.ALWAYS:
      return { matched: true };
    case TACTICAL_CONDITION_TYPES.ACTION_LEGAL:
      return actionLegal(context.state, action, target).legal ? { matched: true } : { matched: false, reason: actionLegal(context.state, action, target).reason };
    case TACTICAL_CONDITION_TYPES.TIMING_AVAILABLE:
      return timingAvailable(context.state, action?.timing_category ?? condition.timing_category ?? condition.timingCategory) ? { matched: true } : { matched: false, reason: 'timing_unavailable' };
    case TACTICAL_CONDITION_TYPES.RESOURCE_AVAILABLE:
      return actionResourceDecision(context.state, action, { resource_rule: { rule: RESOURCE_CONSERVATION_RULES.ALLOW_SPEND } }).allowed ? { matched: true } : { matched: false, reason: 'resource_unavailable' };
    case TACTICAL_CONDITION_TYPES.ACTOR_HEALTH_BELOW_PERCENT:
      return context.actor_health_percent !== null && context.actor_health_percent <= toNumber(condition.value ?? condition.percent, 0) ? { matched: true } : { matched: false, reason: 'actor_health_threshold_not_met' };
    case TACTICAL_CONDITION_TYPES.ACTOR_HEALTH_ABOVE_PERCENT:
      return context.actor_health_percent !== null && context.actor_health_percent >= toNumber(condition.value ?? condition.percent, 0) ? { matched: true } : { matched: false, reason: 'actor_health_threshold_not_met' };
    case TACTICAL_CONDITION_TYPES.TARGET_HEALTH_BAND:
      return target && asArray(condition.values ?? condition.bands ?? condition.value).includes(healthBand(target)) ? { matched: true } : { matched: false, reason: 'target_health_band_mismatch' };
    case TACTICAL_CONDITION_TYPES.ACTOR_CONDITION_PRESENT:
      return context.actor_conditions.includes(cleanText(condition.condition_id ?? condition.conditionId ?? condition.value)) ? { matched: true } : { matched: false, reason: 'actor_condition_missing' };
    case TACTICAL_CONDITION_TYPES.ACTOR_CONDITION_ABSENT:
      return !context.actor_conditions.includes(cleanText(condition.condition_id ?? condition.conditionId ?? condition.value)) ? { matched: true } : { matched: false, reason: 'actor_condition_present' };
    case TACTICAL_CONDITION_TYPES.TARGET_CONDITION_PRESENT:
      return target && participantConditions(context.state, participantId(target)).some((entry) => conditionType(entry) === cleanText(condition.condition_id ?? condition.conditionId ?? condition.value)) ? { matched: true } : { matched: false, reason: 'target_condition_missing' };
    case TACTICAL_CONDITION_TYPES.TARGET_CONDITION_ABSENT:
      return !target || !participantConditions(context.state, participantId(target)).some((entry) => conditionType(entry) === cleanText(condition.condition_id ?? condition.conditionId ?? condition.value)) ? { matched: true } : { matched: false, reason: 'target_condition_present' };
    case TACTICAL_CONDITION_TYPES.ACTOR_CONCENTRATING:
      return context.state.concentration?.source_participant_id === context.actor_id || context.state.concentration?.participant_id === context.actor_id ? { matched: true } : { matched: false, reason: 'actor_not_concentrating' };
    case TACTICAL_CONDITION_TYPES.ACTOR_NOT_CONCENTRATING:
      return !(context.state.concentration?.source_participant_id === context.actor_id || context.state.concentration?.participant_id === context.actor_id) ? { matched: true } : { matched: false, reason: 'actor_concentrating' };
    case TACTICAL_CONDITION_TYPES.ACTOR_ENGAGED:
      return context.actor_engaged ? { matched: true } : { matched: false, reason: 'actor_not_engaged' };
    case TACTICAL_CONDITION_TYPES.ACTOR_NOT_ENGAGED:
      return !context.actor_engaged ? { matched: true } : { matched: false, reason: 'actor_engaged' };
    case TACTICAL_CONDITION_TYPES.TARGET_PROXIMITY:
      return target && cleanText(condition.value) === proximityBetween(context.state, context.actor_id, participantId(target)) ? { matched: true } : { matched: false, reason: 'target_proximity_mismatch' };
    case TACTICAL_CONDITION_TYPES.TARGET_ZONE:
      return target && cleanText(condition.value) === spatialForParticipant(context.state, target).current_zone_id ? { matched: true } : { matched: false, reason: 'target_zone_mismatch' };
    case TACTICAL_CONDITION_TYPES.ACTOR_ZONE:
      return cleanText(condition.value) === context.actor_zone_id ? { matched: true } : { matched: false, reason: 'actor_zone_mismatch' };
    case TACTICAL_CONDITION_TYPES.TARGET_VISIBLE:
      return target ? { matched: true } : { matched: false, reason: 'target_not_visible' };
    case TACTICAL_CONDITION_TYPES.TARGET_HAS_COVER:
      return target && context.visible_participants.find((entry) => entry.participant_id === participantId(target))?.has_cover === true ? { matched: true } : { matched: false, reason: 'target_cover_mismatch' };
    case TACTICAL_CONDITION_TYPES.VISIBLE_HOSTILE_COUNT:
      return visibleHostiles(context).length >= toInteger(condition.minimum ?? condition.min ?? condition.value, 1) ? { matched: true } : { matched: false, reason: 'visible_hostile_count_low' };
    case TACTICAL_CONDITION_TYPES.ENCOUNTER_FLAG:
      return Boolean(context.encounter_flags[cleanText(condition.flag_id ?? condition.flagId ?? condition.value)]) === (condition.expected === undefined ? true : Boolean(condition.expected)) ? { matched: true } : { matched: false, reason: 'encounter_flag_mismatch' };
    case TACTICAL_CONDITION_TYPES.OBJECTIVE_STATE:
      return cleanText(context.objective_states[cleanText(condition.objective_id ?? condition.objectiveId)]?.state) === cleanText(condition.state) ? { matched: true } : { matched: false, reason: 'objective_state_mismatch' };
    case TACTICAL_CONDITION_TYPES.PRIOR_ACTION_USED_THIS_TURN:
      return context.prior_actions_this_turn.includes(cleanText(condition.action_id ?? condition.actionId ?? condition.value)) ? { matched: true } : { matched: false, reason: 'prior_action_missing' };
    case TACTICAL_CONDITION_TYPES.RETREAT_ROUTE_VISIBLE:
      return findRetreatRoute(context).status === 'available' ? { matched: true } : { matched: false, reason: 'retreat_route_missing' };
    case TACTICAL_CONDITION_TYPES.SURRENDER_PERMISSION_ACTIVE:
      return Boolean(context.encounter_flags[cleanText(condition.flag_id ?? condition.flagId ?? 'surrender_permitted')]) ? { matched: true } : { matched: false, reason: 'surrender_permission_missing' };
    case TACTICAL_CONDITION_TYPES.SCRIPTED_PHASE_ACTIVE:
      return cleanText(condition.phase_id ?? condition.phaseId ?? condition.value) === context.scripted_phase ? { matched: true } : { matched: false, reason: 'scripted_phase_mismatch' };
    default:
      return { matched: false, reason: 'unsupported_condition_type' };
  }
}

function conditionsMatch(conditions, context, action = null, target = null) {
  const rejected = [];
  for (const condition of asArray(conditions)) {
    const result = conditionMatches(condition, context, action, target);
    if (!result.matched) {
      rejected.push({ condition, reason: result.reason });
    }
  }
  return rejected.length === 0 ? { matched: true } : { matched: false, rejected };
}

function actionResourceDecision(state, action, rule = {}, profile = null) {
  const costs = asArray(action?.action_level_costs);
  if (costs.length === 0) {
    return { allowed: true, reason: 'no_limited_resource_cost' };
  }
  const explicitRule = cleanText(rule.rule ?? rule.resource_rule ?? rule.resourceRule);
  const profileRules = asArray(profile?.resource_conservation_rules);
  for (const cost of costs) {
    const resource = state.resources.find((entry) => cleanText(entry.resource_id) === cleanText(cost.resource_id));
    if (!resource || toInteger(resource.current) < toInteger(cost.amount, 1)) {
      return { allowed: false, reason: 'resource_unavailable', resource_id: cleanText(cost.resource_id) };
    }
    const matching = profileRules.find((entry) =>
      (cleanText(entry.resource_id ?? entry.resourceId) && cleanText(entry.resource_id ?? entry.resourceId) === cleanText(cost.resource_id)) ||
      (cleanText(entry.resource_category ?? entry.resourceCategory) && cleanText(entry.resource_category ?? entry.resourceCategory) === cleanText(resource.category ?? cost.category))
    );
    const selectedRule = explicitRule || cleanText(matching?.rule);
    if (selectedRule === RESOURCE_CONSERVATION_RULES.NEVER_USE) {
      return { allowed: false, reason: 'resource_never_use_rule', resource_id: resource.resource_id };
    }
    if (selectedRule === RESOURCE_CONSERVATION_RULES.PRESERVE_FINAL_USE && toInteger(resource.current) - toInteger(cost.amount, 1) < 1) {
      return { allowed: false, reason: 'preserve_final_use_rule', resource_id: resource.resource_id };
    }
    if (selectedRule === RESOURCE_CONSERVATION_RULES.THRESHOLD_GATED) {
      const actor = actorFor(state);
      const threshold = toNumber(matching?.actor_hit_point_percent_at_or_below ?? rule.actor_hit_point_percent_at_or_below, 0);
      if (healthPercent(actor) === null || healthPercent(actor) > threshold) {
        return { allowed: false, reason: 'resource_threshold_not_met', resource_id: resource.resource_id };
      }
    }
    if (selectedRule === RESOURCE_CONSERVATION_RULES.PHASE_GATED) {
      const phase = cleanText(state.scripted_phase ?? state.combat?.scripted_phase);
      if (phase !== cleanText(matching?.phase_id ?? rule.phase_id)) {
        return { allowed: false, reason: 'resource_phase_not_active', resource_id: resource.resource_id };
      }
    }
    if (!selectedRule && [
      COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE,
      COMBAT_RESOURCE_CATEGORIES.SHORT_REST_USE,
      COMBAT_RESOURCE_CATEGORIES.LONG_REST_USE,
      COMBAT_RESOURCE_CATEGORIES.CHARGE,
      COMBAT_RESOURCE_CATEGORIES.COOLDOWN,
      COMBAT_RESOURCE_CATEGORIES.RECHARGE,
    ].includes(cleanText(resource.category ?? cost.category))) {
      return { allowed: false, reason: 'limited_resource_requires_authored_permission', resource_id: resource.resource_id };
    }
  }
  return { allowed: true, reason: explicitRule || 'resource_allowed' };
}

export function evaluateResourceConservation(input = {}) {
  const state = normalizeState(input.state ?? input);
  const action = input.action ? createCombatActionDefinition(input.action) : actionById(state, input.action_id ?? input.actionId);
  const profile = input.profile ? createTacticalProfile(input.profile) : resolveEffectiveTacticalProfile({ state }).effective_profile;
  return actionResourceDecision(state, action, input.rule ?? {}, profile);
}

function visibleTargetToParticipant(context, visibleTarget) {
  return findParticipant(context.state, visibleTarget?.participant_id);
}

function sortParticipantsStable(participants = []) {
  return [...participants].sort((left, right) => participantId(left).localeCompare(participantId(right)));
}

export function evaluateTargetPreferences(input = {}) {
  const context = input.context ?? buildTacticalContext(input);
  const selectorInput = input.target_selector ?? input.targetSelector ?? { selector: TACTICAL_TARGET_SELECTORS.NEAREST_VISIBLE_HOSTILE };
  const selector = cleanText(selectorInput.selector ?? selectorInput.kind ?? selectorInput);
  const hostiles = visibleHostiles(context)
    .map((entry) => visibleTargetToParticipant(context, entry))
    .filter(Boolean)
    .filter((participant) => isVisibleToActor(context.state, context.actor, participant));
  let selected = null;
  let reason = selector;
  if (selector === TACTICAL_TARGET_SELECTORS.SELF) {
    selected = context.actor;
  } else if (selector === TACTICAL_TARGET_SELECTORS.EXPLICIT_PARTICIPANT) {
    selected = findParticipant(context.state, selectorInput.participant_id ?? selectorInput.participantId);
  } else if (selector === TACTICAL_TARGET_SELECTORS.CURRENT_SCRIPTED_TARGET) {
    selected = findParticipant(context.state, context.state.scripted_target_id ?? context.state.combat?.scripted_target_id);
  } else if (selector === TACTICAL_TARGET_SELECTORS.ENGAGED_HOSTILE) {
    selected = sortParticipantsStable(hostiles).find((participant) => proximityBetween(context.state, context.actor_id, participantId(participant)) === PROXIMITY_STATES.ENGAGED) ?? null;
  } else if (selector === TACTICAL_TARGET_SELECTORS.LOWEST_HEALTH_VISIBLE_HOSTILE) {
    selected = [...hostiles].sort((left, right) => (healthPercent(left) ?? 1) - (healthPercent(right) ?? 1) || participantId(left).localeCompare(participantId(right)))[0] ?? null;
  } else if (selector === TACTICAL_TARGET_SELECTORS.HIGHEST_HEALTH_VISIBLE_HOSTILE) {
    selected = [...hostiles].sort((left, right) => (healthPercent(right) ?? 0) - (healthPercent(left) ?? 0) || participantId(left).localeCompare(participantId(right)))[0] ?? null;
  } else if (selector === TACTICAL_TARGET_SELECTORS.PROTECT_ALLY_ENGAGED_WITH_HOSTILE) {
    const allies = visibleAllies(context).map((entry) => visibleTargetToParticipant(context, entry)).filter(Boolean);
    selected = sortParticipantsStable(hostiles).find((hostile) =>
      allies.some((ally) => proximityBetween(context.state, participantId(ally), participantId(hostile)) === PROXIMITY_STATES.ENGAGED)
    ) ?? null;
  } else {
    selected = sortParticipantsStable(hostiles).find((participant) => {
      if (selector === TACTICAL_TARGET_SELECTORS.HOSTILE_WITHIN_ACTION_RANGE) {
        return true;
      }
      return true;
    }) ?? null;
    reason = selected && selector === TACTICAL_TARGET_SELECTORS.NEAREST_VISIBLE_HOSTILE ? 'stable_nearest_visible_hostile' : selector;
  }
  return {
    status: selected ? 'selected' : 'no_target',
    target: selected,
    target_id: selected ? participantId(selected) : null,
    selector,
    considered_target_ids: hostiles.map(participantId),
    reason,
  };
}

function routeToward(context, target, selector = {}) {
  if (!target) {
    return { status: 'no_target' };
  }
  const actorZone = context.actor_zone_id;
  const targetZone = spatialForParticipant(context.state, target).current_zone_id ?? target.current_zone_id;
  if (!targetZone || actorZone === targetZone) {
    return { status: 'already_positioned', destination_zone_id: actorZone, selected_transition_ids: [] };
  }
  const candidates = asArray(context.state.spatial.transitions)
    .filter((transition) => transition.source_zone_id === actorZone && transition.visible !== false && transition.blocked !== true)
    .sort((left, right) => cleanText(left.transition_id).localeCompare(cleanText(right.transition_id)));
  const direct = candidates.find((transition) => transition.destination_zone_id === targetZone) ?? candidates.find((transition) => transition.destination_zone_id === selector.destination_zone_id);
  if (!direct) {
    return { status: 'no_route' };
  }
  const risk = asArray(direct.known_risks).includes('opportunity_attack') || direct.provokes_opportunity_attack === true;
  if (risk && selector.avoid_opportunity_risk !== false) {
    return { status: 'route_rejected', reason: 'opportunity_risk_not_authored' };
  }
  const route = evaluateExplicitRoute({
    source_zone_id: actorZone,
    destination_zone_id: direct.destination_zone_id,
    selected_transition_ids: [direct.transition_id],
    transitions: context.state.spatial.transitions,
  });
  if (route.status !== 'valid') {
    return { status: 'route_rejected', reason: route.reason ?? route.status };
  }
  if (route.total_cost > context.movement_remaining) {
    return { status: 'route_rejected', reason: 'insufficient_movement' };
  }
  return {
    status: 'selected',
    destination_zone_id: direct.destination_zone_id,
    selected_transition_ids: [direct.transition_id],
    route,
    known_opportunity_risk: risk,
  };
}

export function evaluatePositioningPreferences(input = {}) {
  const context = input.context ?? buildTacticalContext(input);
  const selector = input.positioning_selector ?? input.positioningSelector ?? input.positioning_requirement ?? input.positioningRequirement ?? {};
  const kind = cleanText(selector.selector ?? selector.kind) || TACTICAL_POSITIONING_SELECTORS.HOLD_POSITION;
  if (kind === TACTICAL_POSITIONING_SELECTORS.HOLD_POSITION) {
    return { status: 'hold_position', selector: kind };
  }
  if (kind === TACTICAL_POSITIONING_SELECTORS.MOVE_TO_RETREAT_ROUTE) {
    return findRetreatRoute(context);
  }
  if (kind === TACTICAL_POSITIONING_SELECTORS.SCRIPTED_DESTINATION) {
    const route = routeToward(context, { current_zone_id: selector.destination_zone_id, participant_id: 'scripted-destination' }, selector);
    return { ...route, selector: kind };
  }
  const targetResult = input.target ? { target: input.target } : evaluateTargetPreferences({ context, target_selector: input.target_selector ?? input.targetSelector });
  return { ...routeToward(context, targetResult.target, selector), selector: kind };
}

function findRetreatRoute(context) {
  const routes = asArray(context.state.spatial.transitions)
    .filter((transition) =>
      transition.source_zone_id === context.actor_zone_id &&
      (transition.retreat_route === true || cleanText(transition.retreat_route_id) || transition.destination_zone_id === context.state.retreat_zone_id)
    )
    .sort((left, right) => cleanText(left.transition_id).localeCompare(cleanText(right.transition_id)));
  for (const transition of routes) {
    const evaluation = evaluateRetreatRoute({
      current_zone_id: context.actor_zone_id,
      retreat_zone_id: transition.destination_zone_id,
      required_movement: transition.base_cost ?? 0,
      base_movement_budget: context.movement_remaining,
      movement_spent: 0,
      route: { status: 'valid', total_cost: transition.base_cost ?? 0 },
    });
    if (evaluation.status === 'valid') {
      return {
        status: 'available',
        selector: TACTICAL_POSITIONING_SELECTORS.MOVE_TO_RETREAT_ROUTE,
        destination_zone_id: transition.destination_zone_id,
        selected_transition_ids: [transition.transition_id],
        route: transition,
      };
    }
  }
  return { status: 'unavailable', reason: 'no_visible_retreat_route' };
}

export function evaluateRetreatDecision(input = {}) {
  const context = input.context ?? buildTacticalContext(input);
  const profile = input.profile ? createTacticalProfile(input.profile) : resolveEffectiveTacticalProfile({ state: context.state, actor: context.actor }).effective_profile;
  for (const threshold of asArray(profile.retreat_thresholds)) {
    const hpMet = threshold.hit_point_percent_at_or_below !== null && context.actor_health_percent !== null && context.actor_health_percent <= threshold.hit_point_percent_at_or_below;
    if (!hpMet) {
      continue;
    }
    const route = findRetreatRoute(context);
    if (route.status === 'available') {
      return {
        status: 'retreat_selected',
        operation: {
          operation_category: TACTICAL_OPERATION_CATEGORIES.RETREAT_MOVEMENT,
          destination_zone_id: route.destination_zone_id,
          selected_transition_ids: route.selected_transition_ids,
          reason: 'retreat_threshold_met',
        },
        gm_dev_trace: { threshold, route },
      };
    }
    return { status: 'retreat_blocked', reason: route.reason, gm_dev_trace: { threshold, route } };
  }
  return { status: 'retreat_not_selected', reason: 'threshold_not_met' };
}

export function evaluateSurrenderDecision(input = {}) {
  const context = input.context ?? buildTacticalContext(input);
  const profile = input.profile ? createTacticalProfile(input.profile) : resolveEffectiveTacticalProfile({ state: context.state, actor: context.actor }).effective_profile;
  for (const threshold of asArray(profile.surrender_thresholds)) {
    const hpMet = threshold.hit_point_percent_at_or_below !== null && context.actor_health_percent !== null && context.actor_health_percent <= threshold.hit_point_percent_at_or_below;
    const permissionFlag = threshold.requires_permission_flag ?? 'surrender_permitted';
    const permitted = Boolean(context.encounter_flags[permissionFlag]);
    if (hpMet && permitted) {
      return {
        status: 'surrender_intent_selected',
        operation: {
          operation_category: TACTICAL_OPERATION_CATEGORIES.SURRENDER_INTENT,
          reason: 'threshold_and_permission_met',
          outcome_kind: threshold.outcome_kind ?? 'surrender_intent',
        },
        gm_dev_trace: { threshold, permission_flag: permissionFlag },
      };
    }
    if (hpMet && !permitted) {
      return { status: 'surrender_not_permitted', reason: 'narrative_permission_missing', gm_dev_trace: { threshold, permission_flag: permissionFlag } };
    }
  }
  return { status: 'surrender_not_selected', reason: 'threshold_not_met' };
}

function ruleAction(state, rule) {
  if (rule.action_id) {
    return actionById(state, rule.action_id);
  }
  if (rule.action_category === TACTICAL_OPERATION_CATEGORIES.WAIT) {
    return null;
  }
  if (rule.action_category === TACTICAL_OPERATION_CATEGORIES.END_TURN) {
    return null;
  }
  return asArray(state.actions)
    .filter((action) => action.timing_category === timingForOperation(rule.action_category))
    .sort((left, right) => actionId(left).localeCompare(actionId(right)))[0] ?? null;
}

function timingForOperation(category) {
  if (category === TACTICAL_OPERATION_CATEGORIES.BONUS_ACTION) {
    return COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION;
  }
  if (category === TACTICAL_OPERATION_CATEGORIES.OBJECT_INTERACTION) {
    return COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION;
  }
  return COMBAT_ACTION_TIMING_CATEGORIES.ACTION;
}

function operationFromAction(rule, action, targetResult, resourceDecision) {
  const category = action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION
    ? TACTICAL_OPERATION_CATEGORIES.BONUS_ACTION
    : [COMBAT_ACTION_TIMING_CATEGORIES.FREE_INTERACTION, COMBAT_ACTION_TIMING_CATEGORIES.OBJECT_INTERACTION].includes(action.timing_category)
      ? TACTICAL_OPERATION_CATEGORIES.OBJECT_INTERACTION
      : TACTICAL_OPERATION_CATEGORIES.ACTION;
  return {
    operation_category: category,
    action_id: action.action_id,
    target_id: targetResult.target_id,
    selected_rule_id: rule.rule_id,
    selection_reason: 'action_priority_rule',
    resource_decision: resourceDecision,
  };
}

function fallbackOperation(context, profile, rejected = []) {
  const order = asArray(profile.safe_fallback?.order ?? ['dodge', 'wait', 'end_turn']);
  for (const fallback of order) {
    const action = actionById(context.state, fallback);
    if (action) {
      const legality = actionLegal(context.state, action, action.target_policy === COMBAT_TARGET_POLICIES.SELF ? context.actor : context.actor);
      const resourceDecision = actionResourceDecision(context.state, action, { rule: RESOURCE_CONSERVATION_RULES.PREFER_UNLIMITED_ACTION }, profile);
      if (legality.legal && resourceDecision.allowed && action.action_level_costs.length === 0) {
        return {
          operation_category: action.timing_category === COMBAT_ACTION_TIMING_CATEGORIES.BONUS_ACTION ? TACTICAL_OPERATION_CATEGORIES.BONUS_ACTION : TACTICAL_OPERATION_CATEGORIES.ACTION,
          action_id: action.action_id,
          target_id: action.target_policy === COMBAT_TARGET_POLICIES.SELF ? context.actor_id : context.actor_id,
          selected_rule_id: profile.safe_fallback?.fallback_id ?? 'safe_fallback',
          selection_reason: 'safe_fallback',
          fallback: true,
        };
      }
      rejected.push({ rule_id: profile.safe_fallback?.fallback_id ?? 'safe_fallback', action_id: action.action_id, reason: legality.reason ?? resourceDecision.reason });
    } else if (fallback === 'wait' && !context.state.parent_turn?.action_spent && context.actor_capabilities.can_act) {
      return {
        operation_category: TACTICAL_OPERATION_CATEGORIES.WAIT,
        selected_rule_id: profile.safe_fallback?.fallback_id ?? 'safe_fallback',
        selection_reason: 'safe_fallback_wait',
        fallback: true,
      };
    } else if (fallback === 'end_turn') {
      return {
        operation_category: TACTICAL_OPERATION_CATEGORIES.END_TURN,
        selected_rule_id: profile.safe_fallback?.fallback_id ?? 'safe_fallback',
        selection_reason: 'safe_fallback_end_turn',
        fallback: true,
      };
    }
  }
  return {
    operation_category: TACTICAL_OPERATION_CATEGORIES.END_TURN,
    selected_rule_id: 'last_resort_end_turn',
    selection_reason: 'last_resort_no_safe_fallback',
    fallback: true,
  };
}

function scriptedOverrideOperation(context, profile) {
  const phase = context.scripted_phase;
  const overrides = asArray(profile.scripted_overrides).filter((override) =>
    override.active === true ||
    (cleanText(override.phase_id ?? override.phaseId) && cleanText(override.phase_id ?? override.phaseId) === phase)
  ).sort((left, right) => toInteger(left.order, 0) - toInteger(right.order, 0) || cleanText(left.override_id ?? left.id).localeCompare(cleanText(right.override_id ?? right.id)));
  for (const override of overrides) {
    const operation = {
      operation_category: cleanText(override.operation_category ?? override.operationCategory) || TACTICAL_OPERATION_CATEGORIES.ACTION,
      action_id: cleanText(override.action_id ?? override.actionId) || null,
      target_id: cleanText(override.target_id ?? override.targetId) || null,
      destination_zone_id: cleanText(override.destination_zone_id ?? override.destinationZoneId) || null,
      selected_transition_ids: asArray(override.selected_transition_ids ?? override.selectedTransitionIds),
      selected_rule_id: cleanText(override.override_id ?? override.id) || 'scripted_override',
      selection_reason: 'scripted_override',
      scripted_override: true,
    };
    if (operation.action_id) {
      const action = actionById(context.state, operation.action_id);
      const target = operation.target_id ? findParticipant(context.state, operation.target_id) : context.actor;
      if (!action || !actionLegal(context.state, action, target).legal) {
        continue;
      }
    }
    return operation;
  }
  return null;
}

export function selectDeterministicOperation(input = {}) {
  const context = input.context ?? buildTacticalContext(input);
  const profile = input.profile ? createTacticalProfile(input.profile) : resolveEffectiveTacticalProfile({ state: context.state, actor: context.actor }).effective_profile;
  const rejected = [];

  const surrender = evaluateSurrenderDecision({ context, profile });
  if (surrender.status === 'surrender_intent_selected') {
    return { status: 'selected', operation: surrender.operation, context, profile, gm_dev_trace: { surrender, rejected } };
  }
  const retreat = evaluateRetreatDecision({ context, profile });
  if (retreat.status === 'retreat_selected') {
    return { status: 'selected', operation: retreat.operation, context, profile, gm_dev_trace: { retreat, rejected } };
  }

  const scripted = scriptedOverrideOperation(context, profile);
  if (scripted) {
    return { status: 'selected', operation: scripted, context, profile, gm_dev_trace: { scripted_override: scripted, rejected } };
  }

  for (const rule of asArray(profile.action_priorities)) {
    if (rule.action_category === TACTICAL_OPERATION_CATEGORIES.MOVEMENT) {
      const targetResult = evaluateTargetPreferences({ context, target_selector: rule.target_selector });
      const position = evaluatePositioningPreferences({ context, target: targetResult.target, positioning_requirement: rule.positioning_requirement, target_selector: rule.target_selector });
      const conditions = conditionsMatch(rule.use_conditions, context, null, targetResult.target);
      if (!conditions.matched) {
        rejected.push({ rule_id: rule.rule_id, reason: 'conditions_failed', details: conditions.rejected });
        continue;
      }
      if (position.status === 'selected') {
        return {
          status: 'selected',
          operation: {
            operation_category: TACTICAL_OPERATION_CATEGORIES.MOVEMENT,
            destination_zone_id: position.destination_zone_id,
            selected_transition_ids: position.selected_transition_ids,
            selected_rule_id: rule.rule_id,
            selection_reason: 'positioning_priority_rule',
            target_id: targetResult.target_id,
          },
          context,
          profile,
          gm_dev_trace: { target_result: targetResult, positioning: position, rejected },
        };
      }
      rejected.push({ rule_id: rule.rule_id, reason: position.reason ?? position.status });
      continue;
    }

    const action = ruleAction(context.state, rule);
    const targetResult = evaluateTargetPreferences({ context, target_selector: rule.target_selector });
    const target = targetResult.target ?? (action?.target_policy === COMBAT_TARGET_POLICIES.SELF ? context.actor : null);
    const conditions = conditionsMatch(rule.use_conditions, context, action, target);
    if (!conditions.matched) {
      rejected.push({ rule_id: rule.rule_id, reason: 'conditions_failed', details: conditions.rejected });
      continue;
    }
    const legality = actionLegal(context.state, action, target);
    if (!legality.legal) {
      rejected.push({ rule_id: rule.rule_id, action_id: action?.action_id ?? rule.action_id, reason: legality.reason });
      continue;
    }
    const resourceDecision = actionResourceDecision(context.state, action, rule.resource_rule ?? {}, profile);
    if (!resourceDecision.allowed) {
      rejected.push({ rule_id: rule.rule_id, action_id: action.action_id, reason: resourceDecision.reason, resource_id: resourceDecision.resource_id });
      continue;
    }
    return {
      status: 'selected',
      operation: operationFromAction(rule, action, targetResult, resourceDecision),
      context,
      profile,
      gm_dev_trace: { target_result: targetResult, resource_decision: resourceDecision, rejected },
    };
  }

  const fallback = fallbackOperation(context, profile, rejected);
  return {
    status: 'selected',
    operation: fallback,
    context,
    profile,
    gm_dev_trace: { fallback, rejected, conservative_default_used: profile.field_provenance?.action_priorities?.scope === TACTICAL_PROFILE_SCOPES.CONSERVATIVE_DEFAULT },
  };
}

function nextRevision(current) {
  const match = cleanText(current).match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${cleanText(current) || 'auto-v'}1`;
  }
  return `${match[1]}${Number(match[2]) + 1}`;
}

function currentInitiativeList(state) {
  return [...state.participants]
    .filter((participant) => participant.active !== false && participant.defeated !== true)
    .sort((left, right) => {
      const orderLeft = toInteger(left.turn_order ?? left.initiative_position, 9999);
      const orderRight = toInteger(right.turn_order ?? right.initiative_position, 9999);
      return orderLeft - orderRight || participantId(left).localeCompare(participantId(right));
    });
}

export function advanceInitiativeParticipant(input = {}) {
  const state = normalizeState(input.state ?? input);
  const order = currentInitiativeList(state);
  if (order.length === 0) {
    return { status: 'encounter_resolution_required', state, next_participant: null };
  }
  const currentId = cleanText(state.combat.current_participant_id ?? state.current_participant_id) || participantId(order[0]);
  const currentIndex = Math.max(order.findIndex((entry) => participantId(entry) === currentId), 0);
  const nextIndex = (currentIndex + 1) % order.length;
  const wrapped = nextIndex <= currentIndex;
  const next = order[nextIndex];
  state.combat.current_participant_id = participantId(next);
  state.current_participant_id = participantId(next);
  state.combat.current_turn_index = nextIndex;
  state.combat.initiative_position = next.turn_order ?? next.initiative_position ?? nextIndex + 1;
  if (wrapped) {
    state.combat.round_number = toInteger(state.combat.round_number, 1) + 1;
  }
  delete state.parent_turn;
  return {
    status: 'advanced',
    state,
    next_participant: next,
    wrapped_round: wrapped,
    gm_dev_trace: { order: order.map(participantId), from: currentId, to: participantId(next), wrapped_round: wrapped },
  };
}

export function openAutomaticCombatTurn(input = {}) {
  const state = normalizeState(input.state ?? input);
  if (state.combat.status !== 'active') {
    throw automaticError('Cannot open an automatic turn for an inactive combat.', 'COMBAT_NOT_ACTIVE');
  }
  const actorId = cleanText(input.actor_participant_id ?? input.actorParticipantId ?? state.combat.current_participant_id ?? state.current_participant_id);
  const actor = findParticipant(state, actorId);
  if (!actor) {
    throw automaticError('Cannot open automatic turn for an unknown actor.', 'AUTOMATIC_ACTOR_NOT_FOUND');
  }
  const mode = normalizeControlMode(actor);
  if (!isAutomaticControlMode(mode)) {
    return {
      status: 'player_or_gm_turn_required',
      state,
      control_mode: mode,
      next_decision: automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED, { actor_participant_id: actorId }),
    };
  }
  normalizeRuleset(state.combat.ruleset);
  const capabilities = actorCapabilities(state, actor);
  const noAction = !capabilities.can_act;
  const parentTurnId = cleanText(input.parent_turn_id ?? input.parentTurnId) || stableId(['auto-turn', state.combat.combat_id, actorId, state.combat.round_number, state.combat.initiative_position ?? actor.turn_order ?? 1]);
  if (state.parent_turn?.status === PLAYER_TURN_STATUSES.OPEN && state.parent_turn.actor_participant_id === actorId) {
    return {
      status: 'resumed',
      state,
      read_model: buildAutomaticTurnReadModel({ state }),
      gm_dev_trace: { operation: 'resume_automatic_turn', control_mode: mode },
    };
  }
  state.parent_turn = createCombatParentTurn({
    combat_id: state.combat.combat_id,
    parent_turn_id: parentTurnId,
    actor_participant_id: actorId,
    round_number: state.combat.round_number,
    initiative_position: state.combat.initiative_position ?? actor.turn_order ?? 1,
    action_window_id: stableId(['auto-window', parentTurnId]),
    source_state_version: cleanText(input.source_state_version ?? input.sourceStateVersion) || `${parentTurnId}:v0`,
    ruleset: state.combat.ruleset,
    status: PLAYER_TURN_STATUSES.OPEN,
  });
  state.parent_turn.turn_opened_state_version = state.parent_turn.source_state_version;
  state.parent_turn.current_state_version = state.parent_turn.source_state_version;
  state.parent_turn.action_spent = noAction;
  state.parent_turn.bonus_action_spent = noAction;
  state.parent_turn.object_interaction_spent = noAction;
  state.parent_turn.reaction_available = capabilities.can_react;
  state.parent_turn.base_movement = capabilities.can_move ? toInteger(actor.speed ?? actor.speed_walk ?? 30, 30) : 0;
  state.parent_turn.dash_added_movement = 0;
  state.parent_turn.movement_spent = 0;
  state.parent_turn.sub_resolutions = [];
  state.action_window = {
    action_window_id: state.parent_turn.action_window_id,
    status: 'automatic',
    window_type: 'combat_automatic_turn',
  };
  state.conditions = processConditionLifecycleEvent({
    event_type: CONDITION_LIFECYCLE_EVENTS.START_OF_TARGET_TURN,
    conditions: state.conditions,
    participant: actor,
  }).remaining_conditions;
  const refreshed = refreshReactionResourceAtTurnStart({ state, participant_id: actorId, turn_id: parentTurnId });
  state.reaction_resources = refreshed.state.reaction_resources;
  const event = automaticEvent(AUTOMATIC_EVENT_TYPES.TURN_STARTED, actor, { summary: `${actor.display_name ?? actorId} takes an automatic turn.` });
  state.automatic_events.push(event);
  return {
    status: 'opened',
    state,
    read_model: buildAutomaticTurnReadModel({ state }),
    gm_dev_trace: {
      operation: 'open_automatic_turn',
      control_mode: mode,
      start_of_turn_hooks: [CONDITION_LIFECYCLE_EVENTS.START_OF_TARGET_TURN, 'reaction_refresh'],
    },
  };
}

function automaticEvent(eventType, actor, input = {}) {
  return {
    event_type: eventType,
    actor: {
      participant_id: participantId(actor),
      display_name: actor?.display_name ?? actor?.name ?? participantId(actor),
      faction: actor?.faction ?? null,
    },
    summary: cleanText(input.summary) || null,
    operation_category: input.operation_category ?? null,
    action_label: input.action_label ?? null,
    target: input.target ? {
      participant_id: participantId(input.target),
      display_name: input.target.display_name ?? input.target.name ?? participantId(input.target),
      health_band: healthBand(input.target),
    } : null,
    destination_zone_id: input.destination_zone_id ?? null,
    visible_result: input.visible_result ?? null,
    turn_group_id: input.turn_group_id ?? null,
    order: input.order ?? null,
  };
}

function automaticNextDecision(kind, details = {}) {
  const combatKind = kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED
    ? COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_NEXT_PLAYER_TURN
    : kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED
      ? COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_REACTION_INTERRUPT
      : kind === AUTOMATIC_NEXT_DECISION_KINDS.ENCOUNTER_RESOLUTION_REQUIRED
        ? COMBAT_NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY
        : kind === AUTOMATIC_NEXT_DECISION_KINDS.RECOVERY_NEEDED
          ? COMBAT_NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED
          : COMBAT_NEXT_BEAT_DECISION_KINDS.RESOLVE_AUTOMATIC_ALLY_OR_ENEMY;
  return {
    next_decision_kind: kind,
    requires_continue_click: false,
    combat_next_beat: createCombatNextBeatDecision({
      combat_kind: combatKind,
      opens_action_window: kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED || kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED,
      gm_dev_details: details,
    }),
  };
}

function idempotencyKeyFor(state, operation, suffix = '') {
  return stableId(['automatic', state.parent_turn?.parent_turn_id, asArray(state.parent_turn?.sub_resolutions).length + 1, operation.operation_category, operation.action_id, operation.target_id, operation.destination_zone_id, suffix]);
}

function executeEndTurn(state, reason = 'automatic_turn_complete') {
  return submitEndTurn({
    state,
    source_state_version: state.parent_turn.current_state_version,
    idempotency_key: stableId(['automatic-end-turn', state.parent_turn.parent_turn_id, reason]),
    skip_confirmation: true,
    close_reason: reason,
  });
}

export function executeAutomaticOperation(input = {}) {
  const state = normalizeState(input.state ?? input);
  const operation = input.operation ?? selectDeterministicOperation({ state }).operation;
  const actor = actorFor(state);
  const sourceVersion = operation.source_state_version ?? operation.sourceStateVersion ?? state.parent_turn?.current_state_version;
  let result;
  if (operation.operation_category === TACTICAL_OPERATION_CATEGORIES.MOVEMENT || operation.operation_category === TACTICAL_OPERATION_CATEGORIES.RETREAT_MOVEMENT) {
    result = submitMovement({
      state,
      destination_zone_id: operation.destination_zone_id,
      selected_transition_ids: operation.selected_transition_ids,
      source_state_version: sourceVersion,
      idempotency_key: input.idempotency_key ?? idempotencyKeyFor(state, operation),
      before_proximity: operation.before_proximity,
      after_proximity: operation.after_proximity,
      potential_reactors: input.potential_reactors ?? input.potentialReactors,
    });
  } else if (operation.operation_category === TACTICAL_OPERATION_CATEGORIES.BONUS_ACTION) {
    result = submitBonusAction({
      state,
      action_id: operation.action_id,
      target_id: operation.target_id,
      source_state_version: sourceVersion,
      idempotency_key: input.idempotency_key ?? idempotencyKeyFor(state, operation),
      generation_origin: input.generation_origin ?? input.generationOrigin,
      roll_overrides: input.roll_overrides ?? input.rollOverrides,
    });
  } else if (operation.operation_category === TACTICAL_OPERATION_CATEGORIES.OBJECT_INTERACTION) {
    result = submitObjectInteraction({
      state,
      action_id: operation.action_id,
      target_id: operation.target_id,
      source_state_version: sourceVersion,
      idempotency_key: input.idempotency_key ?? idempotencyKeyFor(state, operation),
    });
  } else if (operation.operation_category === TACTICAL_OPERATION_CATEGORIES.WAIT) {
    result = submitWait({
      state,
      source_state_version: sourceVersion,
      idempotency_key: input.idempotency_key ?? idempotencyKeyFor(state, operation),
    });
  } else if (operation.operation_category === TACTICAL_OPERATION_CATEGORIES.END_TURN) {
    result = executeEndTurn(state);
  } else if (operation.operation_category === TACTICAL_OPERATION_CATEGORIES.SURRENDER_INTENT) {
    state.automatic_surrender_intent = { actor_participant_id: participantId(actor), reason: operation.reason };
    result = {
      status: 'surrender_intent_recorded',
      committed: true,
      state,
      player_result_bundle: { result: `${actor.display_name ?? participantId(actor)} is ready to surrender.`, operation_category: TACTICAL_OPERATION_CATEGORIES.SURRENDER_INTENT },
      read_model: buildAutomaticTurnReadModel({ state }),
      next_decision: automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.CONTINUE_AUTOMATIC_CHAIN),
    };
  } else {
    result = submitAction({
      state,
      action_id: operation.action_id,
      target_id: operation.target_id,
      source_state_version: sourceVersion,
      idempotency_key: input.idempotency_key ?? idempotencyKeyFor(state, operation),
      generation_origin: input.generation_origin ?? input.generationOrigin,
      roll_overrides: input.roll_overrides ?? input.rollOverrides,
    });
  }

  if (result.status === COMBAT_RESOLUTION_STATUSES.STALE) {
    return {
      status: COMBAT_RESOLUTION_STATUSES.STALE,
      committed: false,
      state: result.state ?? state,
      next_decision: automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.CONTINUE_AUTOMATIC_CHAIN, { stale_operation: operation }),
      gm_dev_trace: { stale_operation: operation, original_trace: result.gm_dev_trace },
    };
  }
  if (result.status === COMBAT_RESOLUTION_STATUSES.UNAVAILABLE || result.status === 'idempotency_conflict') {
    return {
      status: result.status,
      committed: false,
      state: result.state ?? state,
      next_decision: automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.CONTINUE_AUTOMATIC_CHAIN, { unavailable_operation: operation }),
      gm_dev_trace: { unavailable_operation: operation, original_trace: result.gm_dev_trace },
    };
  }

  let nextDecision = result.next_decision;
  if (operation.operation_category === TACTICAL_OPERATION_CATEGORIES.END_TURN) {
    nextDecision = automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.CONTINUE_AUTOMATIC_CHAIN, { automatic_turn_closed: true });
  }
  let stateAfter = result.state ?? state;
  let reactionResult = null;
  if (result.next_decision?.next_decision_kind === TURN_NEXT_DECISION_KINDS.REACTION_REQUIRED || result.player_result_bundle?.known_reaction_trigger) {
    const trigger = createOpportunityAttackTriggerFromMovement({
      state: stateAfter,
      mover_participant_id: participantId(actor),
      parent_sub_resolution_id: result.sub_resolution_id,
      before_proximity: operation.before_proximity ?? PROXIMITY_STATES.ENGAGED,
      after_proximity: operation.after_proximity ?? PROXIMITY_STATES.NEARBY,
      destination_zone_id: operation.destination_zone_id,
      potential_reactors: input.potential_reactors ?? input.potentialReactors ?? stateAfter.participants.filter((participant) => participantId(participant) !== participantId(actor)),
    });
    if (trigger.status === REACTION_TRIGGER_STATUSES.DETECTED) {
      reactionResult = processReactionTrigger({
        state: trigger.state,
        trigger: trigger.trigger,
        generation_origin: input.generation_origin ?? input.generationOrigin,
        roll_overrides: input.reaction_roll_overrides ?? input.reactionRollOverrides,
      });
      stateAfter = reactionResult.state ?? trigger.state;
      if (reactionResult.next_decision?.next_decision_kind === REACTION_NEXT_DECISION_KINDS.RESUME_PARENT || reactionResult.status === 'deterministic_reactions_resolved') {
        nextDecision = automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.CONTINUE_AUTOMATIC_CHAIN, { reaction_resolved: true });
      } else {
        nextDecision = automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED, { trigger_id: trigger.trigger.trigger_id });
      }
    }
  }

  const eventType = operation.operation_category === TACTICAL_OPERATION_CATEGORIES.MOVEMENT || operation.operation_category === TACTICAL_OPERATION_CATEGORIES.RETREAT_MOVEMENT
    ? AUTOMATIC_EVENT_TYPES.MOVEMENT
    : operation.operation_category === TACTICAL_OPERATION_CATEGORIES.BONUS_ACTION
      ? AUTOMATIC_EVENT_TYPES.BONUS_ACTION
      : operation.operation_category === TACTICAL_OPERATION_CATEGORIES.OBJECT_INTERACTION
        ? AUTOMATIC_EVENT_TYPES.OBJECT_INTERACTION
        : operation.operation_category === TACTICAL_OPERATION_CATEGORIES.WAIT
          ? AUTOMATIC_EVENT_TYPES.WAIT
          : operation.operation_category === TACTICAL_OPERATION_CATEGORIES.END_TURN
            ? AUTOMATIC_EVENT_TYPES.END_TURN
            : operation.operation_category === TACTICAL_OPERATION_CATEGORIES.SURRENDER_INTENT
              ? AUTOMATIC_EVENT_TYPES.SURRENDER_INTENT
              : AUTOMATIC_EVENT_TYPES.ACTION;
  const target = operation.target_id ? findParticipant(stateAfter, operation.target_id) : null;
  stateAfter.automatic_events = asArray(stateAfter.automatic_events).concat(automaticEvent(eventType, actor, {
    summary: result.player_result_bundle?.latest_event_summary ?? result.player_result_bundle?.result ?? result.player_result_bundle?.operation_name ?? 'Automatic combat operation resolved.',
    operation_category: operation.operation_category,
    action_label: actionById(stateAfter, operation.action_id)?.player_label ?? operation.action_id ?? null,
    target,
    destination_zone_id: operation.destination_zone_id,
    visible_result: result.player_result_bundle?.result ?? null,
    turn_group_id: stateAfter.parent_turn?.parent_turn_id,
    order: asArray(stateAfter.automatic_events).length + 1,
  }));
  if (reactionResult && nextDecision.next_decision_kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED) {
    stateAfter.automatic_events.push(automaticEvent(AUTOMATIC_EVENT_TYPES.REACTION_INTERRUPT, actor, {
      summary: 'A reaction interrupts the automatic turn.',
      turn_group_id: stateAfter.parent_turn?.parent_turn_id,
      order: stateAfter.automatic_events.length + 1,
    }));
  }

  return {
    ...result,
    state: stateAfter,
    automatic_operation: operation,
    reaction_result: reactionResult,
    next_decision: nextDecision,
    player_safe_events: projectAutomaticEventsForPlayer(stateAfter.automatic_events),
    gm_dev_trace: {
      selected_operation: operation,
      operation_result: result.gm_dev_trace,
      reaction_result: reactionResult?.gm_dev_trace ?? null,
    },
  };
}

function remainingFactions(state) {
  return [...new Set(state.participants
    .filter((participant) => participant.active !== false && participant.defeated !== true)
    .map((participant) => cleanText(participant.faction))
    .filter(Boolean))]
    .sort();
}

function shouldStopForParticipant(participant) {
  const mode = normalizeControlMode(participant);
  return mode === AUTOMATIC_CONTROL_MODES.PLAYER || mode === AUTOMATIC_CONTROL_MODES.GM_DEV;
}

function loopSignature(state, operation) {
  return JSON.stringify({
    actor: state.parent_turn?.actor_participant_id,
    version: state.parent_turn?.current_state_version,
    operation,
  });
}

export function orchestrateAutomaticTurns(input = {}) {
  let state = normalizeState(input.state ?? input);
  const maxTurns = toInteger(input.max_automatic_turns ?? input.maxAutomaticTurns, 10);
  const maxOperations = toInteger(input.max_operations ?? input.maxOperations, 30);
  const events = [];
  const traces = [];
  const seen = new Set();
  let turnsRun = 0;
  let operationsRun = 0;

  while (turnsRun < maxTurns && operationsRun < maxOperations) {
    if (state.combat.status !== 'active') {
      return finishChain(state, events, traces, AUTOMATIC_NEXT_DECISION_KINDS.ENCOUNTER_RESOLUTION_REQUIRED, 'combat_not_active');
    }
    if (remainingFactions(state).length <= 1) {
      return finishChain(state, events, traces, AUTOMATIC_NEXT_DECISION_KINDS.ENCOUNTER_RESOLUTION_REQUIRED, 'one_faction_remaining');
    }
    const actor = findParticipant(state, state.combat.current_participant_id ?? state.current_participant_id);
    if (!actor || actor.active === false || actor.defeated === true) {
      const advanced = advanceInitiativeParticipant({ state });
      state = advanced.state;
      traces.push({ skipped_inactive_actor: actor ? participantId(actor) : null, advance: advanced.gm_dev_trace });
      continue;
    }
    if (shouldStopForParticipant(actor)) {
      return finishChain(state, events, traces, AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED, 'player_or_gm_participant');
    }

    let opened = openAutomaticCombatTurn({ state, actor_participant_id: participantId(actor) });
    state = opened.state;
    turnsRun += 1;
    events.push(...projectAutomaticEventsForPlayer([state.automatic_events.at(-1)]));
    traces.push(opened.gm_dev_trace);

    let turnDone = false;
    while (!turnDone && operationsRun < maxOperations) {
      const selection = selectDeterministicOperation({ state });
      const signature = loopSignature(state, selection.operation);
      if (seen.has(signature)) {
        return enterAutomaticRecoveryNeeded({
          state,
          reason: 'repeated_automatic_operation_detected',
          completed_facts: events,
          traces,
        });
      }
      seen.add(signature);
      const result = executeAutomaticOperation({
        state,
        operation: selection.operation,
        generation_origin: input.generation_origin ?? input.generationOrigin,
        roll_overrides: input.roll_overrides ?? input.rollOverrides,
        reaction_roll_overrides: input.reaction_roll_overrides ?? input.reactionRollOverrides,
        potential_reactors: input.potential_reactors ?? input.potentialReactors,
      });
      operationsRun += 1;
      state = result.state ?? state;
      events.push(...projectAutomaticEventsForPlayer(asArray(state.automatic_events).slice(events.length)));
      traces.push({ selection: selection.gm_dev_trace, execution: result.gm_dev_trace });

      if (result.next_decision?.next_decision_kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED) {
        return finishChain(state, events, traces, AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED, 'player_reaction_required');
      }
      if (result.status === COMBAT_RESOLUTION_STATUSES.RECOVERY_NEEDED || state.parent_turn?.status === PLAYER_TURN_STATUSES.RECOVERY_NEEDED) {
        return finishChain(state, events, traces, AUTOMATIC_NEXT_DECISION_KINDS.RECOVERY_NEEDED, 'recovery_needed');
      }
      if (selection.operation.operation_category === TACTICAL_OPERATION_CATEGORIES.END_TURN || state.parent_turn?.status === PLAYER_TURN_STATUSES.CLOSED) {
        const advanced = advanceInitiativeParticipant({ state });
        state = advanced.state;
        traces.push({ initiative_advance: advanced.gm_dev_trace });
        turnDone = true;
      }
    }
  }

  return enterAutomaticRecoveryNeeded({
    state,
    reason: operationsRun >= maxOperations ? 'automatic_operation_limit_exceeded' : 'automatic_turn_limit_exceeded',
    completed_facts: events,
    traces,
  });
}

function finishChain(state, events, traces, kind, reason) {
  return {
    status: kind === AUTOMATIC_NEXT_DECISION_KINDS.RECOVERY_NEEDED ? COMBAT_RESOLUTION_STATUSES.RECOVERY_NEEDED : 'automatic_chain_stopped',
    state,
    next_decision: automaticNextDecision(kind, { reason }),
    player_safe_events: projectAutomaticEventsForPlayer(events),
    read_model: buildAutomaticTurnReadModel({ state }),
    gm_dev_trace: {
      trace_kind: 'combat_automatic_turn_runtime',
      stop_reason: reason,
      traces,
      transition_decision: createCombatTransitionDecision({
        combat_kind: kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED
          ? COMBAT_TRANSITION_DECISION_KINDS.OPEN_REACTION_INTERRUPT
          : kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_TURN_REQUIRED
            ? COMBAT_TRANSITION_DECISION_KINDS.OPEN_NEXT_PLAYER_TURN
            : kind === AUTOMATIC_NEXT_DECISION_KINDS.RECOVERY_NEEDED
              ? COMBAT_TRANSITION_DECISION_KINDS.ENTER_RECOVERY_NEEDED
              : COMBAT_TRANSITION_DECISION_KINDS.BEGIN_AUTOMATIC_ENEMY_TURN,
      }),
    },
  };
}

export function enterAutomaticRecoveryNeeded(input = {}) {
  const state = normalizeState(input.state ?? input);
  state.automatic_recovery_needed = true;
  if (state.parent_turn) {
    state.parent_turn.status = PLAYER_TURN_STATUSES.RECOVERY_NEEDED;
  }
  const event = automaticEvent(AUTOMATIC_EVENT_TYPES.RECOVERY_NEEDED, actorFor(state), {
    summary: 'Automatic combat needs GM review before it can continue.',
    order: asArray(state.automatic_events).length + 1,
  });
  state.automatic_events.push(event);
  return {
    status: COMBAT_RESOLUTION_STATUSES.RECOVERY_NEEDED,
    state,
    player_safe_message: 'Automatic combat needs GM review before it can continue.',
    next_decision: automaticNextDecision(AUTOMATIC_NEXT_DECISION_KINDS.RECOVERY_NEEDED, { reason: input.reason }),
    player_safe_events: projectAutomaticEventsForPlayer(state.automatic_events),
    read_model: buildAutomaticTurnReadModel({ state }),
    retry_safe: Boolean(input.retry_safe ?? input.retrySafe),
    gm_dev_trace: {
      trace_kind: 'combat_automatic_turn_runtime',
      failed_step: input.failed_step ?? input.failedStep ?? input.reason ?? null,
      completed_facts_preserved: asArray(input.completed_facts ?? input.completedFacts),
      traces: asArray(input.traces),
      recommended_repair: input.recommended_repair ?? input.recommendedRepair ?? 'review_automatic_turn_state',
    },
  };
}

export function buildAutomaticTurnReadModel(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = actorFor(state);
  const model = {
    combat_id: state.combat.combat_id,
    combat_status: state.combat.status,
    round: state.combat.round_number,
    current_actor: actor ? {
      participant_id: participantId(actor),
      display_name: actor.display_name ?? actor.name ?? participantId(actor),
      faction: actor.faction ?? null,
      automatic: isAutomaticControlMode(normalizeControlMode(actor)),
    } : null,
    automatic_state: state.automatic_recovery_needed ? 'recovery_needed' : actor && isAutomaticControlMode(normalizeControlMode(actor)) ? 'automatic_turn' : 'waiting_for_player',
    latest_events: projectAutomaticEventsForPlayer(asArray(state.automatic_events).slice(-5)),
    player_reaction_required: state.active_reaction_window_id ? true : false,
    player_turn_required: actor ? shouldStopForParticipant(actor) : false,
    recovery_needed_message: state.automatic_recovery_needed ? 'Automatic combat needs GM review before it can continue.' : null,
    next_step: actor && shouldStopForParticipant(actor) ? 'Player combat choice required.' : 'Automatic combat continues until a player decision is needed.',
  };
  assertNoAutomaticPlayerHiddenData(model);
  return model;
}

export function projectAutomaticEventsForPlayer(events = []) {
  const projected = asArray(events).filter(Boolean).map((event) => ({
    event_type: event.event_type,
    actor: event.actor,
    summary: event.summary,
    operation_category: event.operation_category,
    action_label: event.action_label,
    target: event.target,
    destination_zone_id: event.destination_zone_id,
    visible_result: event.visible_result,
    turn_group_id: event.turn_group_id,
    order: event.order,
  }));
  assertNoAutomaticPlayerHiddenData(projected);
  return projected;
}

export function projectAutomaticForPlayer(payload = {}) {
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
      if (['state', 'gmdevtrace', 'automatictraces', 'automaticidempotencyrecords'].includes(normalized) || PLAYER_PROHIBITED_KEYS.some((forbidden) => normalized.includes(normalizedKey(forbidden)))) {
        delete value[key];
      } else {
        strip(value[key]);
      }
    }
    return value;
  }
  const stripped = strip(projected);
  assertNoAutomaticPlayerHiddenData(stripped);
  return stripped;
}

export function projectAutomaticForGmDev(payload = {}) {
  return cloneSerializable(payload);
}

export function buildAutomaticGmDevTrace(input = {}) {
  return {
    trace_kind: 'combat_automatic_turn_runtime',
    payload: cloneSerializable(input),
  };
}

export function assertNoAutomaticPlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const key of PLAYER_PROHIBITED_KEYS) {
    if (serialized.includes(key)) {
      throw automaticError(`Automatic combat player payload contains prohibited key "${key}".`, 'COMBAT_AUTOMATIC_VISIBILITY_LEAK');
    }
  }
  return true;
}
