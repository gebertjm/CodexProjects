import {
  COMBAT_DECISION_TYPES,
  COMBAT_NEXT_BEAT_DECISION_KINDS,
  COMBAT_RESOLUTION_STATUSES,
  COMBAT_TIMING_CATEGORIES,
  COMBAT_TRANSITION_DECISION_KINDS,
  createCombatNextBeatDecision,
  createCombatReactionInterrupt,
  createCombatRulesetIdentity,
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
import {
  CONDITION_CONTEXT_KINDS,
  evaluateConditionEffects,
} from './conditionStateLifecycle.js';
import {
  PROXIMITY_STATES,
  detectOpportunityAttackCandidates,
} from './spatialMovement.js';
import {
  DND5E_2014_RULESET,
  PLAYER_TURN_STATUSES,
} from './playerTurnRuntime.js';

export const REACTION_TYPES = Object.freeze({
  OPPORTUNITY_ATTACK: 'opportunity_attack',
  DEFENSIVE: 'defensive_reaction',
  OFFENSIVE: 'offensive_reaction',
  MOVEMENT_TRIGGERED: 'movement_triggered_reaction',
  DAMAGE_TRIGGERED: 'damage_triggered_reaction',
  SCRIPTED: 'scripted_reaction',
});

export const REACTION_TRIGGER_TYPES = Object.freeze({
  OPPORTUNITY_ATTACK: 'opportunity_attack',
  ATTACK_HITS_BEFORE_DAMAGE: 'attack_hits_before_damage',
  AFTER_DAMAGE: 'after_damage',
  BEFORE_EFFECT: 'before_effect',
  AFTER_EFFECT: 'after_effect',
  SCRIPTED: 'scripted',
});

export const REACTION_TIMING_POINTS = Object.freeze({
  BEFORE_MOVEMENT_LEAVES_THREATENED_REACH: 'before_movement_leaves_threatened_reach',
  AFTER_ATTACK_HITS_BEFORE_DAMAGE: 'after_attack_hits_before_damage',
  AFTER_DAMAGE_APPLIED: 'after_damage_applied',
  BEFORE_EFFECT_APPLIED: 'before_effect_applied',
  AFTER_EFFECT_APPLIED: 'after_effect_applied',
  BEFORE_PARENT_RESUMES: 'before_parent_resumes',
});

export const REACTION_PREFERENCE_VALUES = Object.freeze({
  ASK: 'ask',
  AUTOMATIC_USE_WHEN_LEGAL: 'automatically_use_when_legal',
  AUTOMATIC_DECLINE: 'automatically_decline',
});

export const REACTION_TRIGGER_STATUSES = Object.freeze({
  DETECTED: 'detected',
  COLLECTING_REACTIONS: 'collecting_reactions',
  WAITING_FOR_PLAYER: 'waiting_for_player',
  RESOLVING: 'resolving',
  RESOLVED: 'resolved',
  DECLINED: 'declined',
  INVALIDATED: 'invalidated',
  SUPERSEDED: 'superseded',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const REACTION_WINDOW_STATUSES = Object.freeze({
  OPEN: 'open',
  AUTOMATICALLY_RESOLVING: 'automatically_resolving',
  SUBMITTED: 'submitted',
  DECLINED: 'declined',
  TIMED_OUT: 'timed_out',
  STALE: 'stale',
  SUPERSEDED: 'superseded',
  RESOLVED: 'resolved',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const CONTINUATION_STATUSES = Object.freeze({
  PAUSED: 'paused',
  READY_TO_RESUME: 'ready_to_resume',
  RESUMED: 'resumed',
  CANCELED: 'canceled',
  TERMINATED_BY_REACTION: 'terminated_by_reaction',
  INVALIDATED: 'invalidated',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const REACTION_QUEUE_PHASES = Object.freeze({
  MANDATORY: 'mandatory',
  PLAYER: 'player',
  ALLIED: 'allied',
  ENEMY: 'enemy',
  SCRIPTED: 'scripted',
  RESUME_PARENT: 'resume_parent',
});

export const REACTION_NESTING_POLICIES = Object.freeze({
  NONE: 'none',
  REGISTERED_EXCEPTION_ONLY: 'registered_exception_only',
  DEFERRED: 'deferred',
});

export const REACTION_NEXT_DECISION_KINDS = Object.freeze({
  PLAYER_REACTION_REQUIRED: 'player_reaction_required',
  AUTOMATIC_REACTION_RESOLVED: 'automatic_reaction_resolved',
  REACTION_DECLINED: 'reaction_declined',
  RESUME_PARENT: 'resume_parent',
  PARENT_TERMINATED: 'parent_terminated',
  RECOVERY_NEEDED: 'recovery_needed',
});

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'armor_class',
  'target_armor_class',
  'difficulty_class',
  'hidden',
  'hidden_trigger_data',
  'hidden_reactions',
  'raw_roll',
  'roll_record',
  'roll_override',
  'mutation_instructions',
  'mutation_plan',
  'idempotency_key',
  'source_state_version',
  'current_state_version',
  'continuation_id',
  'continuation_point',
  'queue',
  'queue_entries',
  'gm_dev',
  'trace',
  'control_mode',
  'action_window_id',
  'state_version_internal',
  'test_override',
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

function reactionError(message, code = 'COMBAT_REACTION_ERROR') {
  const error = new Error(message);
  error.code = code;
  error.player_safe_message = 'That reaction cannot resolve yet.';
  return error;
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function participantId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function actionId(input = {}) {
  return cleanText(input.action_id ?? input.actionId ?? input.id);
}

function reactionId(input = {}) {
  return cleanText(input.reaction_id ?? input.reactionId ?? input.id);
}

function normalizeRuleset(input = DND5E_2014_RULESET) {
  const ruleset = createCombatRulesetIdentity(input);
  if (ruleset.system !== DND5E_2014_RULESET.system || ruleset.rules_version !== DND5E_2014_RULESET.rules_version) {
    throw reactionError(`Unsupported reaction ruleset ${ruleset.system}/${ruleset.rules_version}.`, 'UNSUPPORTED_REACTION_RULESET');
  }
  return ruleset;
}

function normalizeState(input = {}) {
  const state = cloneSerializable(input);
  state.combat = state.combat ?? {};
  state.combat.combat_id = cleanText(state.combat.combat_id ?? state.combat.id ?? state.combat_id) || 'combat:test';
  state.combat.status = cleanText(state.combat.status) || 'active';
  state.combat.ruleset = normalizeRuleset(state.combat.ruleset ?? state.ruleset ?? DND5E_2014_RULESET);
  state.participants = asArray(state.participants);
  state.actions = asArray(state.actions).map(createCombatActionDefinition);
  state.resources = asArray(state.resources).map(createCombatResourceState);
  state.conditions = asArray(state.conditions);
  state.parent_turn = state.parent_turn ?? {};
  state.reaction_definitions = asArray(state.reaction_definitions ?? state.reactionDefinitions).map(createReactionDefinition);
  state.reaction_resources = state.reaction_resources ?? {};
  state.reaction_preferences = state.reaction_preferences ?? {};
  state.reaction_windows = state.reaction_windows ?? {};
  state.reaction_triggers = state.reaction_triggers ?? {};
  state.reaction_queues = state.reaction_queues ?? {};
  state.continuation_points = state.continuation_points ?? {};
  state.reaction_idempotency_records = state.reaction_idempotency_records ?? {};
  state.latest_reaction_result = state.latest_reaction_result ?? null;
  return state;
}

function nextRevision(current) {
  const match = cleanText(current).match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${cleanText(current) || 'reaction-v'}1`;
  }
  return `${match[1]}${Number(match[2]) + 1}`;
}

function setReactionRevision(state) {
  const current = state.parent_turn?.current_state_version ?? state.current_state_version ?? 'reaction-v0';
  const next = nextRevision(current);
  if (state.parent_turn) {
    state.parent_turn.current_state_version = next;
  }
  state.current_state_version = next;
  return next;
}

function findParticipant(state, id) {
  return asArray(state.participants).find((entry) => participantId(entry) === cleanText(id)) ?? null;
}

function participantConditions(state, id) {
  return asArray(state.conditions).filter((condition) =>
    condition.target_participant_id === id && condition.active !== false && condition.expired !== true
  );
}

function canReact(state, participant) {
  const effects = evaluateConditionEffects({
    participant,
    conditions: participantConditions(state, participantId(participant)),
    context_kind: CONDITION_CONTEXT_KINDS.ACTION_LEGALITY,
  });
  return Boolean(effects.reaction_allowed);
}

function isPlayerControlled(participant = {}) {
  return participant.control_mode === 'player' || participant.player_controlled === true || participant.is_player_character === true || participant.faction === 'player';
}

function isHostile(a = {}, b = {}) {
  return Boolean(a.hostile_to_mover || a.hostile_to_target || (a.faction && b.faction && a.faction !== b.faction));
}

function actionById(state, id) {
  return asArray(state.actions).find((action) => action.action_id === cleanText(id)) ?? null;
}

function targetForReaction(state, trigger, reaction) {
  return findParticipant(state, reaction.target_participant_id ?? trigger.triggering_actor_id ?? trigger.triggeringActorId);
}

function reactionResourceFor(state, participantIdValue) {
  const id = cleanText(participantIdValue);
  const existing = state.reaction_resources[id];
  if (existing) {
    return existing;
  }
  const resource = createReactionResourceState({ participant_id: id, reaction_available: true });
  state.reaction_resources[id] = resource;
  return resource;
}

function operationFingerprint(input = {}) {
  return JSON.stringify({
    operation: input.operation ?? input.operation_type ?? input.operationType,
    window_id: input.reaction_window_id ?? input.reactionWindowId,
    reaction_id: input.reaction_id ?? input.reactionId,
    target_id: input.target_id ?? input.targetId,
    decline: input.decline === true,
  });
}

function idempotencyStatus(state, input) {
  const key = cleanText(input.idempotency_key ?? input.idempotencyKey);
  if (!key) {
    return { status: 'missing' };
  }
  const fingerprint = operationFingerprint(input);
  const existing = state.reaction_idempotency_records[key];
  if (!existing) {
    return { status: 'new', key, fingerprint };
  }
  if (existing.fingerprint !== fingerprint) {
    return {
      status: 'conflict',
      response: {
        status: 'idempotency_conflict',
        committed: false,
        player_safe_message: 'That reaction submission key was already used for a different choice.',
        gm_dev_trace: {
          idempotency_key: key,
          existing_fingerprint: existing.fingerprint,
          attempted_fingerprint: fingerprint,
        },
      },
    };
  }
  return {
    status: 'duplicate',
    response: {
      ...cloneSerializable(existing.response),
      status: COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED,
      duplicate_of_sub_resolution_id: existing.sub_resolution_id,
      duplicate_handled: true,
      state,
    },
  };
}

function recordIdempotency(state, idempotency, response, subResolutionId) {
  if (idempotency.status === 'new') {
    state.reaction_idempotency_records[idempotency.key] = {
      fingerprint: idempotency.fingerprint,
      sub_resolution_id: subResolutionId,
      response: cloneSerializable(response),
    };
  }
}

export function createReactionResourceState(input = {}) {
  const participant = participantId(input.participant ?? input);
  return {
    participant_id: participant,
    reaction_available: input.reaction_available ?? input.available ?? true,
    reaction_status: (input.reaction_available ?? input.available ?? true) ? 'available' : 'spent',
    refreshed_at_turn_id: cleanText(input.refreshed_at_turn_id ?? input.refreshedAtTurnId) || null,
    refreshed_at_round: input.refreshed_at_round ?? input.refreshedAtRound ?? null,
    spent_by_sub_resolution_id: cleanText(input.spent_by_sub_resolution_id ?? input.spentBySubResolutionId) || null,
    used_reaction_type: cleanText(input.used_reaction_type ?? input.usedReactionType) || null,
    current_reaction_window_id: cleanText(input.current_reaction_window_id ?? input.currentReactionWindowId) || null,
    last_reaction_result: input.last_reaction_result ?? input.lastReactionResult ?? null,
    gm_dev_provenance: input.gm_dev_provenance ?? input.gmDevProvenance ?? null,
  };
}

export function refreshReactionResourceAtTurnStart(input = {}) {
  const state = normalizeState(input.state ?? input);
  const participant = participantId(input.participant_id ?? input.participantId ?? state.parent_turn?.actor_participant_id);
  const resource = createReactionResourceState({
    participant_id: participant,
    reaction_available: true,
    refreshed_at_turn_id: input.turn_id ?? input.turnId ?? state.parent_turn?.parent_turn_id,
    refreshed_at_round: input.round_number ?? input.roundNumber ?? state.parent_turn?.round_number ?? state.combat.round_number,
    gm_dev_provenance: { lifecycle_hook: 'start_of_participant_turn' },
  });
  state.reaction_resources[participant] = resource;
  return {
    status: 'reaction_refreshed',
    state,
    reaction_resource: resource,
    initiative_advanced: false,
    gm_dev_trace: { participant_id: participant, hook: 'start_of_turn_reaction_refresh' },
  };
}

export function createReactionDefinition(input = {}) {
  const reactionType = cleanText(input.reaction_type ?? input.reactionType) || REACTION_TYPES.OPPORTUNITY_ATTACK;
  const triggerType = cleanText(input.trigger_type ?? input.triggerType) || REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK;
  const timingPoint = cleanText(input.timing_point ?? input.timingPoint);
  const nestingPolicy = cleanText(input.nesting_policy ?? input.nestingPolicy) || REACTION_NESTING_POLICIES.NONE;
  const preferenceKey = cleanText(input.preference_key ?? input.preferenceKey) || reactionType;
  const ruleset = normalizeRuleset(input.ruleset ?? input.rulesetIdentity ?? DND5E_2014_RULESET);
  const actionDefinition = createCombatActionDefinition({
    ...(input.action_definition ?? input.actionDefinition ?? input.action ?? {}),
    action_id: actionId(input.action_definition ?? input.actionDefinition ?? input.action) || cleanText(input.source_action_id ?? input.sourceActionId) || cleanText(input.reaction_id ?? input.reactionId) || 'reaction-action',
    timing_category: COMBAT_ACTION_TIMING_CATEGORIES.REACTION,
    ruleset,
  });

  if (!Object.values(REACTION_TRIGGER_TYPES).includes(triggerType)) {
    throw reactionError(`Unsupported reaction trigger type ${triggerType}.`, 'INVALID_REACTION_TRIGGER_TYPE');
  }
  if (!Object.values(REACTION_TIMING_POINTS).includes(timingPoint)) {
    throw reactionError('Reaction definition requires a supported timing point.', 'INVALID_REACTION_TIMING_POINT');
  }
  if (!Object.values(REACTION_NESTING_POLICIES).includes(nestingPolicy)) {
    throw reactionError(`Unsupported reaction nesting policy ${nestingPolicy}.`, 'INVALID_REACTION_NESTING_POLICY');
  }
  if (typeof input.trigger_predicate === 'function' || typeof input.triggerPredicate === 'function' || asArray(input.effect_steps ?? input.effectSteps).some((step) => typeof step?.handler === 'function')) {
    throw reactionError('Executable reaction authoring is not supported.', 'EXECUTABLE_REACTION_AUTHORING_REJECTED');
  }

  return {
    reaction_id: cleanText(input.reaction_id ?? input.reactionId ?? input.id) || stableId(['reaction', reactionType, actionDefinition.action_id]),
    reaction_type: reactionType,
    player_name: cleanText(input.player_name ?? input.playerName) || actionDefinition.player_label,
    internal_name: cleanText(input.internal_name ?? input.internalName) || null,
    ruleset,
    ruleset_id: ruleset.ruleset_id,
    rules_version: ruleset.rules_version,
    source_action_id: actionDefinition.action_id,
    source_kind: cleanText(input.source_kind ?? input.sourceKind) || 'authored_action',
    trigger_type: triggerType,
    trigger_predicate: input.trigger_predicate ?? input.triggerPredicate ?? null,
    actor_eligibility: input.actor_eligibility ?? input.actorEligibility ?? {},
    target_policy: cleanText(input.target_policy ?? input.targetPolicy) || actionDefinition.target_policy,
    timing_point: timingPoint,
    reaction_resource_cost: cleanText(input.reaction_resource_cost ?? input.reactionResourceCost) || 'reaction',
    additional_resource_costs: asArray(input.additional_resource_costs ?? input.additionalResourceCosts),
    reach_requirement: cleanText(input.reach_requirement ?? input.reachRequirement) || 'normal_reach',
    visibility_requirement: cleanText(input.visibility_requirement ?? input.visibilityRequirement) || 'can_perceive',
    action_definition: actionDefinition,
    ordered_effect_steps: actionDefinition.effect_steps,
    interrupt_timing: cleanText(input.interrupt_timing ?? input.interruptTiming) || 'before_triggering_event_completes',
    parent_resume_policy: cleanText(input.parent_resume_policy ?? input.parentResumePolicy) || 'resume_after_reaction',
    may_terminate_parent: Boolean(input.may_terminate_parent ?? input.mayTerminateParent),
    authored_priority: toInteger(input.authored_priority ?? input.authoredPriority, 100),
    deterministic_phase: cleanText(input.deterministic_phase ?? input.deterministicPhase) || null,
    player_visible: input.player_visible ?? input.playerVisible ?? true,
    preference_key: preferenceKey,
    timeout_behavior: cleanText(input.timeout_behavior ?? input.timeoutBehavior) || 'decline',
    nesting_policy: nestingPolicy,
    player_safe_description: cleanText(input.player_safe_description ?? input.playerSafeDescription) || `${actionDefinition.player_label} may be used as a reaction.`,
    gm_dev_provenance: input.gm_dev_provenance ?? input.gmDevProvenance ?? {},
  };
}

export function createReactionTrigger(input = {}) {
  const ruleset = normalizeRuleset(input.ruleset ?? input.rulesetIdentity ?? DND5E_2014_RULESET);
  const triggerType = cleanText(input.trigger_type ?? input.triggerType) || REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK;
  const timingPoint = cleanText(input.timing_point ?? input.timingPoint) || REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH;
  if (!Object.values(REACTION_TRIGGER_TYPES).includes(triggerType)) {
    throw reactionError(`Unsupported reaction trigger ${triggerType}.`, 'UNSUPPORTED_REACTION_TRIGGER');
  }
  if (!Object.values(REACTION_TIMING_POINTS).includes(timingPoint)) {
    throw reactionError(`Unsupported trigger timing point ${timingPoint}.`, 'UNSUPPORTED_REACTION_TIMING');
  }
  const triggerId = cleanText(input.trigger_id ?? input.triggerId) || stableId([
    'trigger',
    input.combat_id ?? input.combatId,
    input.parent_turn_id ?? input.parentTurnId,
    input.parent_sub_resolution_id ?? input.parentSubResolutionId,
    triggerType,
    timingPoint,
    input.creation_order ?? input.creationOrder ?? 1,
  ]);
  return {
    trigger_id: triggerId,
    trigger_type: triggerType,
    ruleset,
    ruleset_id: ruleset.ruleset_id,
    rules_version: ruleset.rules_version,
    combat_id: cleanText(input.combat_id ?? input.combatId),
    parent_turn_id: cleanText(input.parent_turn_id ?? input.parentTurnId),
    parent_sub_resolution_id: cleanText(input.parent_sub_resolution_id ?? input.parentSubResolutionId),
    triggering_actor_id: cleanText(input.triggering_actor_id ?? input.triggeringActorId),
    triggering_target_id: cleanText(input.triggering_target_id ?? input.triggeringTargetId) || null,
    triggering_event: cleanText(input.triggering_event ?? input.triggeringEvent) || triggerType,
    timing_point: timingPoint,
    source_state_version: cleanText(input.source_state_version ?? input.sourceStateVersion) || null,
    position_state: cloneSerializable(input.position_state ?? input.positionState ?? {}),
    visibility_state: cloneSerializable(input.visibility_state ?? input.visibilityState ?? {}),
    damage_or_attack_result: cloneSerializable(input.damage_or_attack_result ?? input.damageOrAttackResult ?? null),
    mandatory_effects: asArray(input.mandatory_effects ?? input.mandatoryEffects),
    potential_reactors: asArray(input.potential_reactors ?? input.potentialReactors),
    player_visible_summary: cleanText(input.player_visible_summary ?? input.playerVisibleSummary) || 'A reaction may be possible.',
    hidden_trigger_data: cloneSerializable(input.hidden_trigger_data ?? input.hiddenTriggerData ?? {}),
    continuation_id: cleanText(input.continuation_id ?? input.continuationId) || null,
    trigger_status: cleanText(input.trigger_status ?? input.triggerStatus) || REACTION_TRIGGER_STATUSES.DETECTED,
    creation_order: toInteger(input.creation_order ?? input.creationOrder, 1),
    resolution_order: input.resolution_order ?? input.resolutionOrder ?? null,
    gm_dev_provenance: cloneSerializable(input.gm_dev_provenance ?? input.gmDevProvenance ?? {}),
  };
}

export function createContinuationPoint(input = {}) {
  const continuationId = cleanText(input.continuation_id ?? input.continuationId) || stableId([
    'continuation',
    input.combat_id ?? input.combatId,
    input.parent_turn_id ?? input.parentTurnId,
    input.parent_sub_resolution_id ?? input.parentSubResolutionId,
    input.effect_step_index ?? input.effectStepIndex ?? input.movement_transition_index ?? input.movementTransitionIndex ?? 0,
  ]);
  return {
    continuation_id: continuationId,
    combat_id: cleanText(input.combat_id ?? input.combatId),
    parent_turn_id: cleanText(input.parent_turn_id ?? input.parentTurnId),
    parent_sub_resolution_id: cleanText(input.parent_sub_resolution_id ?? input.parentSubResolutionId),
    interrupted_operation_type: cleanText(input.interrupted_operation_type ?? input.interruptedOperationType) || 'movement',
    interrupted_action_or_movement_id: cleanText(input.interrupted_action_or_movement_id ?? input.interruptedActionOrMovementId) || null,
    effect_step_index: toInteger(input.effect_step_index ?? input.effectStepIndex, 0),
    movement_transition_index: toInteger(input.movement_transition_index ?? input.movementTransitionIndex, 0),
    state_version_at_pause: cleanText(input.state_version_at_pause ?? input.stateVersionAtPause) || null,
    committed_costs: cloneSerializable(input.committed_costs ?? input.committedCosts ?? []),
    committed_rolls: cloneSerializable(input.committed_rolls ?? input.committedRolls ?? []),
    committed_mutations: cloneSerializable(input.committed_mutations ?? input.committedMutations ?? []),
    unresolved_effect_steps: cloneSerializable(input.unresolved_effect_steps ?? input.unresolvedEffectSteps ?? []),
    unresolved_movement_transitions: cloneSerializable(input.unresolved_movement_transitions ?? input.unresolvedMovementTransitions ?? []),
    pending_target_id: cleanText(input.pending_target_id ?? input.pendingTargetId) || null,
    pending_destination_id: cleanText(input.pending_destination_id ?? input.pendingDestinationId) || null,
    pending_hazard_effects: cloneSerializable(input.pending_hazard_effects ?? input.pendingHazardEffects ?? []),
    pending_encounter_completion_checks: cloneSerializable(input.pending_encounter_completion_checks ?? input.pendingEncounterCompletionChecks ?? []),
    resume_policy: cleanText(input.resume_policy ?? input.resumePolicy) || 'resume_if_parent_still_valid',
    invalidation_policy: cleanText(input.invalidation_policy ?? input.invalidationPolicy) || 'terminate_parent_if_actor_invalid',
    continuation_status: cleanText(input.continuation_status ?? input.continuationStatus) || CONTINUATION_STATUSES.PAUSED,
    gm_dev_provenance: cloneSerializable(input.gm_dev_provenance ?? input.gmDevProvenance ?? {}),
  };
}

export function pauseParentResolution(input = {}) {
  const state = normalizeState(input.state ?? input);
  const continuation = createContinuationPoint({
    combat_id: state.combat.combat_id,
    parent_turn_id: state.parent_turn.parent_turn_id,
    parent_sub_resolution_id: input.parent_sub_resolution_id ?? input.parentSubResolutionId,
    state_version_at_pause: state.parent_turn.current_state_version,
    ...input.continuation,
  });
  state.continuation_points[continuation.continuation_id] = continuation;
  state.parent_turn.status = PLAYER_TURN_STATUSES.PAUSED_FOR_REACTION;
  state.parent_turn.paused_continuation_id = continuation.continuation_id;
  return {
    status: 'parent_resolution_paused',
    state,
    continuation,
    gm_dev_trace: {
      committed_costs: continuation.committed_costs,
      committed_rolls: continuation.committed_rolls,
      committed_mutations: continuation.committed_mutations,
      unresolved_effect_steps: continuation.unresolved_effect_steps,
      unresolved_movement_transitions: continuation.unresolved_movement_transitions,
    },
  };
}

export function evaluateReactionPreference(input = {}) {
  const preferences = input.preferences ?? input.reaction_preferences ?? {};
  const participant = cleanText(input.participant_id ?? input.participantId);
  const key = cleanText(input.preference_key ?? input.preferenceKey ?? input.reaction_type ?? input.reactionType);
  const scoped = preferences[participant] ?? preferences[String(participant)] ?? preferences;
  const raw = scoped?.[key] ?? input.default_preference ?? input.defaultPreference ?? REACTION_PREFERENCE_VALUES.ASK;
  const value = Object.values(REACTION_PREFERENCE_VALUES).includes(raw) ? raw : REACTION_PREFERENCE_VALUES.ASK;
  return {
    participant_id: participant,
    preference_key: key,
    preference_value: value,
    defaulted: raw !== value || raw === undefined || raw === null,
  };
}

function validateReactionCandidate(state, trigger, definition, reactor, options = {}) {
  const rejected = [];
  const id = participantId(reactor);
  const target = findParticipant(state, trigger.triggering_actor_id);
  const resource = reactionResourceFor(state, id);
  if (definition.trigger_type !== trigger.trigger_type) {
    rejected.push('wrong_trigger_type');
  }
  if (definition.rules_version !== trigger.rules_version) {
    rejected.push('wrong_rules_version');
  }
  if (resource.reaction_available === false) {
    rejected.push('reaction_already_spent');
  }
  if (!canReact(state, reactor)) {
    rejected.push('condition_prevents_reaction');
  }
  if (!target || target.active === false || target.defeated === true) {
    rejected.push('target_invalid');
  }
  if (definition.trigger_type === REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK) {
    const before = trigger.position_state?.before_proximity ?? trigger.position_state?.beforeProximity;
    const extended = definition.reach_requirement === 'extended_reach';
    const inReach = before === PROXIMITY_STATES.ENGAGED || (extended && before === PROXIMITY_STATES.NEARBY);
    if (!inReach) {
      rejected.push('out_of_reach');
    }
    if (!isHostile(reactor, target)) {
      rejected.push('nonhostile_reactor');
    }
    if (definition.action_definition.authored_metadata?.multiattack === true) {
      rejected.push('multiattack_not_legal_for_opportunity_attack');
    }
    if (definition.action_definition.authored_metadata?.attack_kind === 'ranged') {
      rejected.push('ranged_attack_not_legal_for_opportunity_attack');
    }
  }
  if (definition.visibility_requirement === 'can_perceive' && reactor.can_perceive_target === false) {
    rejected.push('unable_to_perceive');
  }
  if (definition.actor_eligibility?.requires_flag && reactor[definition.actor_eligibility.requires_flag] !== true) {
    rejected.push('authored_prerequisite_unmet');
  }
  for (const cost of asArray(definition.additional_resource_costs)) {
    const resourceEntry = state.resources.find((entry) => entry.resource_id === cost.resource_id && (entry.owner_ref === id || entry.owner_id === id || !entry.owner_ref));
    if (!resourceEntry || resourceEntry.current < toInteger(cost.amount, 1)) {
      rejected.push('insufficient_resource');
    }
  }
  if (options.force_reject) {
    rejected.push(options.force_reject);
  }
  return {
    valid: rejected.length === 0,
    rejected_reasons: rejected,
  };
}

function reactionOptionFrom(state, trigger, definition, reactor, phase = null) {
  const participant = participantId(reactor);
  const preference = evaluateReactionPreference({
    preferences: state.reaction_preferences,
    participant_id: participant,
    preference_key: definition.preference_key,
  });
  return {
    reaction_id: definition.reaction_id,
    reaction_type: definition.reaction_type,
    preference_key: definition.preference_key,
    player_name: definition.player_name,
    player_safe_description: definition.player_safe_description,
    reactor_participant_id: participant,
    target_participant_id: trigger.triggering_actor_id,
    trigger_id: trigger.trigger_id,
    timing_point: definition.timing_point,
    reaction_resource_cost: definition.reaction_resource_cost,
    additional_resource_costs: definition.additional_resource_costs,
    action_definition: definition.action_definition,
    authored_priority: definition.authored_priority,
    deterministic_phase: phase ?? definition.deterministic_phase,
    player_visible: definition.player_visible,
    is_player_controlled: isPlayerControlled(reactor),
    applied_preference: preference.preference_value,
  };
}

export function collectEligibleReactions(input = {}) {
  const state = normalizeState(input.state ?? input);
  const trigger = createReactionTrigger(input.trigger ?? input.reaction_trigger ?? input.reactionTrigger);
  const definitions = asArray(input.reaction_definitions ?? input.reactionDefinitions ?? state.reaction_definitions).map(createReactionDefinition);
  const reactors = asArray(input.potential_reactors ?? input.potentialReactors ?? trigger.potential_reactors)
    .map((entry) => typeof entry === 'string' ? findParticipant(state, entry) : (findParticipant(state, participantId(entry)) ?? entry))
    .filter(Boolean);
  const legal = [];
  const rejected = [];
  for (const reactor of reactors) {
    for (const definition of definitions) {
      const validation = validateReactionCandidate(state, trigger, definition, reactor);
      if (!validation.valid) {
        rejected.push({
          participant_id: participantId(reactor),
          reaction_id: definition.reaction_id,
          reasons: validation.rejected_reasons,
          hidden: definition.player_visible === false || reactor.player_visible === false,
        });
        continue;
      }
      const phase = isPlayerControlled(reactor)
        ? REACTION_QUEUE_PHASES.PLAYER
        : definition.deterministic_phase ?? (reactor.faction === 'player' ? REACTION_QUEUE_PHASES.ALLIED : REACTION_QUEUE_PHASES.ENEMY);
      legal.push(reactionOptionFrom(state, trigger, definition, reactor, phase));
    }
  }
  return {
    trigger,
    legal_reactions: legal,
    player_reactions: legal.filter((entry) => entry.is_player_controlled && entry.player_visible !== false),
    deterministic_reactions: legal.filter((entry) => !entry.is_player_controlled || entry.deterministic_phase === REACTION_QUEUE_PHASES.SCRIPTED),
    rejected_candidates: rejected,
    gm_dev_trace: {
      rejected_candidates: rejected,
      legal_count: legal.length,
    },
  };
}

function sortReactionOptions(options = []) {
  return [...asArray(options)].sort((a, b) =>
    toInteger(a.authored_priority, 100) - toInteger(b.authored_priority, 100) ||
    toInteger(a.initiative_position, 999) - toInteger(b.initiative_position, 999) ||
    cleanText(a.reaction_id).localeCompare(cleanText(b.reaction_id))
  );
}

export function createReactionQueue(input = {}) {
  const trigger = createReactionTrigger(input.trigger ?? input.reaction_trigger ?? input.reactionTrigger);
  const legal = asArray(input.legal_reactions ?? input.legalReactions);
  const mandatory = asArray(trigger.mandatory_effects).map((effect, index) => ({
    queue_entry_id: stableId(['queue', trigger.trigger_id, 'mandatory', index + 1]),
    phase: REACTION_QUEUE_PHASES.MANDATORY,
    status: 'pending',
    effect,
    order: index + 1,
  }));
  const player = sortReactionOptions(legal.filter((entry) => entry.is_player_controlled && entry.player_visible !== false)).map((entry, index) => ({
    queue_entry_id: stableId(['queue', trigger.trigger_id, 'player', index + 1]),
    phase: REACTION_QUEUE_PHASES.PLAYER,
    status: 'pending',
    reaction: entry,
    order: mandatory.length + index + 1,
  }));
  const deterministic = sortReactionOptions(legal.filter((entry) => !entry.is_player_controlled || entry.deterministic_phase === REACTION_QUEUE_PHASES.SCRIPTED)).map((entry, index) => ({
    queue_entry_id: stableId(['queue', trigger.trigger_id, entry.deterministic_phase ?? 'deterministic', index + 1]),
    phase: entry.deterministic_phase ?? (entry.is_player_controlled ? REACTION_QUEUE_PHASES.PLAYER : REACTION_QUEUE_PHASES.ENEMY),
    status: 'pending',
    reaction: entry,
    order: mandatory.length + player.length + index + 1,
  }));
  return {
    queue_id: cleanText(input.queue_id ?? input.queueId) || stableId(['reaction_queue', trigger.trigger_id]),
    trigger_id: trigger.trigger_id,
    continuation_id: trigger.continuation_id,
    status: player.length > 0 ? REACTION_TRIGGER_STATUSES.WAITING_FOR_PLAYER : REACTION_TRIGGER_STATUSES.RESOLVING,
    entries: [...mandatory, ...player, ...deterministic, {
      queue_entry_id: stableId(['queue', trigger.trigger_id, 'resume_parent']),
      phase: REACTION_QUEUE_PHASES.RESUME_PARENT,
      status: 'pending',
      order: mandatory.length + player.length + deterministic.length + 1,
    }],
    gm_dev_trace: {
      ordering: ['mandatory', 'player', 'allied_enemy_scripted', 'resume_parent'],
    },
  };
}

export function openPlayerReactionWindow(input = {}) {
  const state = normalizeState(input.state ?? input);
  if (Object.values(state.reaction_windows).some((window) => window.status === REACTION_WINDOW_STATUSES.OPEN)) {
    return {
      status: REACTION_WINDOW_STATUSES.RECOVERY_NEEDED,
      committed: false,
      player_safe_message: 'A reaction decision is already waiting.',
      state,
      gm_dev_trace: { reason: 'overlapping_player_reaction_window_blocked' },
    };
  }
  const trigger = createReactionTrigger(input.trigger ?? input.reaction_trigger ?? input.reactionTrigger);
  const options = sortReactionOptions(input.legal_reactions ?? input.legalReactions ?? input.player_reactions ?? input.playerReactions);
  const participant = cleanText(input.participant_id ?? input.participantId ?? options[0]?.reactor_participant_id);
  const preference = options[0]
    ? evaluateReactionPreference({ preferences: state.reaction_preferences, participant_id: participant, preference_key: options[0].preference_key })
    : { preference_value: REACTION_PREFERENCE_VALUES.ASK };
  const windowId = cleanText(input.reaction_window_id ?? input.reactionWindowId) || stableId(['reaction_window', trigger.trigger_id, participant || 'player']);
  const window = {
    action_window_id: windowId,
    reaction_window_id: windowId,
    trigger_id: trigger.trigger_id,
    combat_id: trigger.combat_id || state.combat.combat_id,
    parent_turn_id: trigger.parent_turn_id,
    interrupted_sub_resolution_id: trigger.parent_sub_resolution_id,
    reacting_participant_id: participant,
    trigger_summary: trigger.player_visible_summary,
    legal_reaction_options: options.map((entry) => ({
      reaction_id: entry.reaction_id,
      reaction_type: entry.reaction_type,
      player_name: entry.player_name,
      player_safe_description: entry.player_safe_description,
      visible_cost: 'reaction',
      additional_resource_costs: entry.additional_resource_costs,
      target_participant_id: entry.target_participant_id,
    })),
    decline_option: { option_id: 'decline', player_label: 'Decline' },
    reaction_resource_status: reactionResourceFor(state, participant).reaction_status,
    applied_preference: preference.preference_value,
    timeout_behavior: 'decline',
    source_state_version: state.parent_turn?.current_state_version ?? state.current_state_version ?? trigger.source_state_version,
    continuation_id: trigger.continuation_id,
    status: REACTION_WINDOW_STATUSES.OPEN,
    gm_dev_provenance: { all_option_ids: options.map((entry) => entry.reaction_id) },
  };
  state.reaction_windows[windowId] = window;
  state.active_reaction_window_id = windowId;
  state.parent_turn.status = PLAYER_TURN_STATUSES.PAUSED_FOR_REACTION;
  return {
    status: REACTION_WINDOW_STATUSES.OPEN,
    state,
    reaction_window: window,
    read_model: buildReactionPlayerReadModel({ state, reaction_window: window }),
    next_decision: { next_decision_kind: REACTION_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED },
    gm_dev_trace: { opened_window_id: windowId, option_count: options.length },
  };
}

export function previewReaction(input = {}) {
  const state = normalizeState(input.state ?? input);
  const window = state.reaction_windows[cleanText(input.reaction_window_id ?? input.reactionWindowId)] ?? input.reaction_window ?? input.reactionWindow;
  const reactionOption = asArray(window?.legal_reaction_options).find((entry) => entry.reaction_id === cleanText(input.reaction_id ?? input.reactionId));
  if (!window || !reactionOption) {
    return {
      status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE,
      mutates_state: false,
      current_legality: 'unavailable',
      safe_unavailable_reason: 'That reaction is not available.',
    };
  }
  const fullOption = findReactionOption(state, window, reactionOption.reaction_id);
  const action = fullOption?.action_definition ?? actionById(state, reactionOption.reaction_id) ?? createCombatActionDefinition({
    action_id: reactionOption.reaction_id,
    player_label: reactionOption.player_name,
    timing_category: COMBAT_ACTION_TIMING_CATEGORIES.REACTION,
    target_policy: COMBAT_TARGET_POLICIES.ONE_ENEMY,
  });
  const preview = previewCombatActionResolution({
    action,
    actor: findParticipant(state, window.reacting_participant_id),
    target: findParticipant(state, reactionOption.target_participant_id),
    resources: state.resources,
    source_state_version: window.source_state_version,
    preview_identity: stableId(['reaction_preview', window.reaction_window_id, reactionOption.reaction_id, window.source_state_version]),
  });
  return {
    ...preview,
    operation_type: 'combat_reaction_preview',
    mutates_state: false,
    reaction_id: reactionOption.reaction_id,
    reaction_name: reactionOption.player_name,
    trigger_summary: window.trigger_summary,
    reacting_participant_id: window.reacting_participant_id,
    target_participant_id: reactionOption.target_participant_id,
    consumes_reaction_on_submit: true,
    source_state_version: window.source_state_version,
  };
}

function findReactionOption(state, window, reactionIdValue) {
  const queue = Object.values(state.reaction_queues).find((entry) => entry.trigger_id === window.trigger_id);
  return queue?.entries
    ?.map((entry) => entry.reaction)
    .find((entry) => entry?.reaction_id === reactionIdValue) ?? null;
}

function applyHitPointMutation(state, instruction) {
  const targetId = participantId(instruction.target);
  state.participants = state.participants.map((participant) => {
    if (participantId(participant) !== targetId) {
      return participant;
    }
    const hp = instruction.after?.current_hit_points ?? participant.current_hit_points;
    return {
      ...participant,
      current_hit_points: hp,
      max_hit_points: instruction.after?.max_hit_points ?? participant.max_hit_points,
      temporary_hit_points: instruction.after?.temporary_hit_points ?? participant.temporary_hit_points,
      defeated: hp <= 0 || participant.defeated === true,
    };
  });
}

function applyMutationInstructions(state, instructions = []) {
  for (const instruction of asArray(instructions)) {
    if (instruction.instruction_type === 'apply_hit_point_damage') {
      applyHitPointMutation(state, instruction);
    } else {
      state.pending_reaction_mutations = asArray(state.pending_reaction_mutations).concat(instruction);
    }
  }
}

function spendReactionResource(state, participant, subResolutionId, reactionType) {
  const id = participantId(participant);
  const resource = reactionResourceFor(state, id);
  if (resource.reaction_available === false) {
    return { spent: false, reason: 'reaction_already_spent', resource };
  }
  const spent = {
    ...resource,
    reaction_available: false,
    reaction_status: 'spent',
    spent_by_sub_resolution_id: subResolutionId,
    used_reaction_type: reactionType,
  };
  state.reaction_resources[id] = spent;
  return { spent: true, resource: spent };
}

function reactionResultBundle(input = {}) {
  return {
    operation_category: 'reaction',
    operation_name: input.operation_name,
    committed: input.committed !== false,
    status: input.status ?? COMBAT_RESOLUTION_STATUSES.RESOLVED,
    result: input.result ?? null,
    consequences: asArray(input.consequences),
    visible_rolls: asArray(input.visible_rolls),
    resource_changes: asArray(input.resource_changes),
    reaction_resource: input.reaction_resource ?? null,
    parent_continuation: input.parent_continuation ?? null,
    next_decision: input.next_decision ?? REACTION_NEXT_DECISION_KINDS.RESUME_PARENT,
  };
}

function closeWindow(state, window, status) {
  window.status = status;
  state.reaction_windows[window.reaction_window_id] = window;
  if (state.active_reaction_window_id === window.reaction_window_id) {
    state.active_reaction_window_id = null;
  }
}

export function submitReaction(input = {}) {
  const state = normalizeState(input.state ?? input);
  const idempotency = idempotencyStatus(state, { ...input, operation: 'submit_reaction' });
  if (idempotency.status === 'duplicate' || idempotency.status === 'conflict') {
    return idempotency.response;
  }
  const window = state.reaction_windows[cleanText(input.reaction_window_id ?? input.reactionWindowId)];
  if (!window || window.status !== REACTION_WINDOW_STATUSES.OPEN) {
    return unavailableReactionResponse(state, 'reaction_window_not_open');
  }
  const source = cleanText(input.source_state_version ?? input.sourceStateVersion);
  if (!source || source !== window.source_state_version) {
    return staleReactionResponse(state, window, input);
  }
  const option = findReactionOption(state, window, cleanText(input.reaction_id ?? input.reactionId));
  if (!option) {
    return unavailableReactionResponse(state, 'reaction_option_not_found');
  }
  const reactor = findParticipant(state, option.reactor_participant_id);
  const target = findParticipant(state, option.target_participant_id);
  const validation = validateReactionCandidate(state, state.reaction_triggers[window.trigger_id], createReactionDefinition({
    ...option,
    reaction_id: option.reaction_id,
    action_definition: option.action_definition,
    trigger_type: state.reaction_triggers[window.trigger_id].trigger_type,
    timing_point: option.timing_point,
  }), reactor);
  if (!validation.valid) {
    return unavailableReactionResponse(state, validation.rejected_reasons[0] ?? 'reaction_invalid');
  }
  const subResolutionId = stableId(['reaction_sub', window.trigger_id, option.reaction_id, asArray(state.parent_turn.sub_resolutions).length + 1]);
  const result = resolveCombatAction({
    action: option.action_definition,
    actor: reactor,
    target,
    resources: state.resources,
    committed_resolution_id: subResolutionId,
    generation_origin: input.generation_origin ?? input.generationOrigin,
    roll_overrides: input.roll_overrides ?? input.rollOverrides,
  });
  if (![COMBAT_ACTION_RESULT_STATUSES.RESOLVED, COMBAT_ACTION_RESULT_STATUSES.PARTIALLY_RESOLVED].includes(result.status)) {
    return unavailableReactionResponse(state, result.status);
  }
  const spend = spendReactionResource(state, reactor, subResolutionId, option.reaction_type);
  if (!spend.spent) {
    return unavailableReactionResponse(state, spend.reason);
  }
  state.resources = result.resources_after ?? state.resources;
  applyMutationInstructions(state, result.mutation_instructions);
  const bundle = reactionResultBundle({
    operation_name: option.player_name,
    result: result.player_safe_summary?.result ?? `${option.player_name} resolves.`,
    visible_rolls: result.ordered_steps?.filter((step) => step.result?.player_summary).map((step) => step.result.player_summary) ?? [],
    resource_changes: result.resource_spends ?? [],
    reaction_resource: 'spent',
  });
  const sub = createCombatReactionInterrupt({
    combat_id: state.combat.combat_id,
    parent_turn_id: state.parent_turn.parent_turn_id,
    sub_resolution_id: subResolutionId,
    sub_resolution_order: asArray(state.parent_turn.sub_resolutions).length + 1,
    interrupt_parent_id: window.interrupted_sub_resolution_id,
    continuation_id: window.continuation_id,
    action_window_id: window.reaction_window_id,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey,
    source_state_version: source,
    actor_participant_id: option.reactor_participant_id,
    result_bundle: bundle,
    transition_decision: createCombatTransitionDecision({ combat_kind: COMBAT_TRANSITION_DECISION_KINDS.RESUME_INTERRUPTED_RESOLUTION }),
    next_beat_decision: createCombatNextBeatDecision({ combat_kind: COMBAT_NEXT_BEAT_DECISION_KINDS.RESUME_INTERRUPTED_RESOLUTION }),
  });
  state.parent_turn.sub_resolutions = asArray(state.parent_turn.sub_resolutions).concat(sub);
  closeWindow(state, window, REACTION_WINDOW_STATUSES.RESOLVED);
  const trigger = state.reaction_triggers[window.trigger_id];
  if (trigger) {
    trigger.trigger_status = REACTION_TRIGGER_STATUSES.RESOLVED;
    state.reaction_triggers[trigger.trigger_id] = trigger;
  }
  const resume = resumeParentResolution({ state, continuation_id: window.continuation_id });
  const newVersion = setReactionRevision(resume.state);
  const response = {
    status: COMBAT_RESOLUTION_STATUSES.RESOLVED,
    committed: true,
    sub_resolution_id: subResolutionId,
    resulting_state_version: newVersion,
    player_result_bundle: bundle,
    read_model: buildReactionPlayerReadModel({ state: resume.state }),
    next_decision: resume.next_decision,
    state: resume.state,
    gm_dev_trace: {
      reaction_resolution: projectCombatActionResultForPlayer(result),
      reaction_resource_spent: true,
      continuation_status: resume.continuation?.continuation_status,
      idempotency_key: input.idempotency_key ?? input.idempotencyKey,
    },
  };
  recordIdempotency(resume.state, idempotency, response, subResolutionId);
  return response;
}

function unavailableReactionResponse(state, reason) {
  return {
    status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE,
    committed: false,
    reason,
    player_safe_message: 'That reaction is not available right now.',
    read_model: buildReactionPlayerReadModel({ state }),
    state,
    gm_dev_trace: { reason },
  };
}

function staleReactionResponse(state, window, input = {}) {
  return {
    status: COMBAT_RESOLUTION_STATUSES.STALE,
    committed: false,
    player_safe_message: 'That reaction window changed. Review the current reaction prompt.',
    read_model: buildReactionPlayerReadModel({ state }),
    state,
    gm_dev_trace: {
      reason: 'reaction_source_state_version_mismatch',
      submitted_source_state_version: input.source_state_version ?? input.sourceStateVersion,
      current_window_source_state_version: window?.source_state_version,
    },
  };
}

export function declineReaction(input = {}) {
  const state = normalizeState(input.state ?? input);
  const idempotency = idempotencyStatus(state, { ...input, operation: 'decline_reaction', decline: true });
  if (idempotency.status === 'duplicate' || idempotency.status === 'conflict') {
    return idempotency.response;
  }
  const window = state.reaction_windows[cleanText(input.reaction_window_id ?? input.reactionWindowId)];
  if (!window || ![REACTION_WINDOW_STATUSES.OPEN, REACTION_WINDOW_STATUSES.AUTOMATICALLY_RESOLVING].includes(window.status)) {
    return unavailableReactionResponse(state, 'reaction_window_not_open');
  }
  closeWindow(state, window, input.timeout === true ? REACTION_WINDOW_STATUSES.TIMED_OUT : REACTION_WINDOW_STATUSES.DECLINED);
  const trigger = state.reaction_triggers[window.trigger_id];
  if (trigger) {
    trigger.trigger_status = REACTION_TRIGGER_STATUSES.DECLINED;
    state.reaction_triggers[trigger.trigger_id] = trigger;
  }
  const resume = resumeParentResolution({ state, continuation_id: window.continuation_id });
  const newVersion = setReactionRevision(resume.state);
  const bundle = reactionResultBundle({
    operation_name: 'Decline reaction',
    result: input.timeout === true ? 'No reaction was chosen before the timer ended.' : 'You decline to react.',
    committed: false,
    reaction_resource: 'available',
    next_decision: REACTION_NEXT_DECISION_KINDS.REACTION_DECLINED,
  });
  const response = {
    status: input.timeout === true ? 'timed_out_declined' : 'declined',
    committed: false,
    resulting_state_version: newVersion,
    player_result_bundle: bundle,
    read_model: buildReactionPlayerReadModel({ state: resume.state }),
    next_decision: resume.next_decision,
    state: resume.state,
    gm_dev_trace: { declined: true, timeout: Boolean(input.timeout), reaction_spent: false },
  };
  recordIdempotency(resume.state, idempotency, response, null);
  return response;
}

export function applyReactionTimeoutDecline(input = {}) {
  return declineReaction({ ...input, timeout: true });
}

export function resolveDeterministicReactions(input = {}) {
  let state = normalizeState(input.state ?? input);
  const trigger = createReactionTrigger(input.trigger ?? input.reaction_trigger ?? input.reactionTrigger ?? Object.values(state.reaction_triggers)[0]);
  const collection = collectEligibleReactions({
    state,
    trigger,
    reaction_definitions: input.reaction_definitions ?? state.reaction_definitions,
    potential_reactors: input.potential_reactors ?? trigger.potential_reactors,
  });
  const resolved = [];
  const skipped = collection.rejected_candidates.map((entry) => ({
    reaction_id: entry.reaction_id,
    participant_id: entry.participant_id,
    reasons: entry.reasons,
    eligibility_stage: 'initial_collection',
  }));
  for (const option of sortReactionOptions(collection.deterministic_reactions)) {
    const reactor = findParticipant(state, option.reactor_participant_id);
    const currentValidation = validateReactionCandidate(state, trigger, createReactionDefinition({
      ...option,
      reaction_id: option.reaction_id,
      action_definition: option.action_definition,
      trigger_type: trigger.trigger_type,
      timing_point: option.timing_point,
    }), reactor);
    if (!currentValidation.valid) {
      skipped.push({ reaction_id: option.reaction_id, participant_id: option.reactor_participant_id, reasons: currentValidation.rejected_reasons });
      continue;
    }
    const subResolutionId = stableId(['deterministic_reaction', trigger.trigger_id, option.reaction_id, resolved.length + 1]);
    const actionResult = resolveCombatAction({
      action: option.action_definition,
      actor: reactor,
      target: targetForReaction(state, trigger, option),
      resources: state.resources,
      committed_resolution_id: subResolutionId,
      generation_origin: input.generation_origin ?? input.generationOrigin,
      roll_overrides: input.roll_overrides?.[option.reaction_id] ?? input.rollOverrides?.[option.reaction_id],
    });
    if (![COMBAT_ACTION_RESULT_STATUSES.RESOLVED, COMBAT_ACTION_RESULT_STATUSES.PARTIALLY_RESOLVED].includes(actionResult.status)) {
      skipped.push({ reaction_id: option.reaction_id, participant_id: option.reactor_participant_id, reasons: [actionResult.status] });
      continue;
    }
    const spend = spendReactionResource(state, reactor, subResolutionId, option.reaction_type);
    if (!spend.spent) {
      skipped.push({ reaction_id: option.reaction_id, participant_id: option.reactor_participant_id, reasons: [spend.reason] });
      continue;
    }
    state.resources = actionResult.resources_after ?? state.resources;
    applyMutationInstructions(state, actionResult.mutation_instructions);
    resolved.push({ reaction_id: option.reaction_id, participant_id: option.reactor_participant_id, sub_resolution_id: subResolutionId });
  }
  const resume = resumeParentResolution({ state, continuation_id: trigger.continuation_id });
  return {
    status: 'deterministic_reactions_resolved',
    state: resume.state,
    resolved_reactions: resolved,
    skipped_reactions: skipped,
    next_decision: resume.next_decision,
    gm_dev_trace: { resolved, skipped, ordering: 'priority_then_initiative_then_reaction_id' },
  };
}

export function processReactionTrigger(input = {}) {
  let state = normalizeState(input.state ?? input);
  const trigger = createReactionTrigger(input.trigger ?? input.reaction_trigger ?? input.reactionTrigger);
  state.reaction_triggers[trigger.trigger_id] = trigger;
  const collection = collectEligibleReactions({
    state,
    trigger,
    reaction_definitions: input.reaction_definitions ?? state.reaction_definitions,
    potential_reactors: input.potential_reactors ?? trigger.potential_reactors,
  });
  const queue = createReactionQueue({ trigger, legal_reactions: collection.legal_reactions });
  state.reaction_queues[queue.queue_id] = queue;

  const playerOptions = collection.player_reactions;
  if (playerOptions.length > 0) {
    const preference = evaluateReactionPreference({
      preferences: state.reaction_preferences,
      participant_id: playerOptions[0].reactor_participant_id,
      preference_key: playerOptions[0].preference_key,
    });
    if (preference.preference_value === REACTION_PREFERENCE_VALUES.AUTOMATIC_DECLINE) {
      const opened = openPlayerReactionWindow({ state, trigger, legal_reactions: playerOptions });
      return declineReaction({
        state: opened.state,
        reaction_window_id: opened.reaction_window.reaction_window_id,
        idempotency_key: stableId(['auto_decline', opened.reaction_window.reaction_window_id]),
      });
    }
    if (preference.preference_value === REACTION_PREFERENCE_VALUES.AUTOMATIC_USE_WHEN_LEGAL) {
      const deterministic = selectAutomaticUseReaction(playerOptions);
      if (deterministic.status === 'selected') {
        const opened = openPlayerReactionWindow({ state, trigger, legal_reactions: [deterministic.reaction] });
        return submitReaction({
          state: opened.state,
          reaction_window_id: opened.reaction_window.reaction_window_id,
          reaction_id: deterministic.reaction.reaction_id,
          source_state_version: opened.reaction_window.source_state_version,
          idempotency_key: stableId(['auto_use', opened.reaction_window.reaction_window_id, deterministic.reaction.reaction_id]),
          generation_origin: input.generation_origin ?? input.generationOrigin,
          roll_overrides: input.roll_overrides ?? input.rollOverrides,
        });
      }
    }
    return openPlayerReactionWindow({ state, trigger, legal_reactions: playerOptions });
  }
  return resolveDeterministicReactions({ state, trigger, reaction_definitions: input.reaction_definitions ?? state.reaction_definitions });
}

function selectAutomaticUseReaction(options = []) {
  const sorted = sortReactionOptions(options);
  if (sorted.length <= 1) {
    return { status: 'selected', reaction: sorted[0] };
  }
  const [first, second] = sorted;
  if (first.authored_priority !== second.authored_priority) {
    return { status: 'selected', reaction: first };
  }
  const signatures = new Set(sorted.map((entry) => JSON.stringify({
    action: entry.action_definition.action_id,
    target: entry.target_participant_id,
    costs: entry.additional_resource_costs,
    effects: entry.action_definition.effect_steps.map((step) => step.effect_type),
  })));
  if (signatures.size === 1 || sorted.every((entry) => entry.allow_automatic_tie_break === true)) {
    return { status: 'selected', reaction: first };
  }
  return { status: 'ambiguous_fallback_to_ask', reason: 'materially_different_reactions_share_priority' };
}

export function createOpportunityAttackTriggerFromMovement(input = {}) {
  const state = normalizeState(input.state ?? input);
  const mover = findParticipant(state, input.mover_participant_id ?? input.moverParticipantId ?? state.parent_turn.actor_participant_id);
  const candidates = detectOpportunityAttackCandidates({
    mover,
    before_proximity: input.before_proximity ?? input.beforeProximity,
    after_proximity: input.after_proximity ?? input.afterProximity,
    forced_movement: input.forced_movement ?? input.forcedMovement,
    disengage_protected: input.disengage_protected ?? input.disengageProtected,
    entering_reach_only: input.entering_reach_only ?? input.enteringReachOnly,
    potential_reactors: input.potential_reactors ?? input.potentialReactors ?? state.participants.filter((participant) => participantId(participant) !== participantId(mover)),
    extended_reach: input.extended_reach ?? input.extendedReach,
  });
  if (candidates.length === 0) {
    return {
      status: 'no_trigger',
      candidates: [],
      player_safe_message: 'No reaction is triggered.',
      gm_dev_trace: { suppressed: Boolean(input.forced_movement ?? input.disengage_protected) },
    };
  }
  const continuation = createContinuationPoint({
    combat_id: state.combat.combat_id,
    parent_turn_id: state.parent_turn.parent_turn_id,
    parent_sub_resolution_id: input.parent_sub_resolution_id ?? input.parentSubResolutionId,
    interrupted_operation_type: 'movement',
    movement_transition_index: input.movement_transition_index ?? input.movementTransitionIndex ?? 0,
    state_version_at_pause: state.parent_turn.current_state_version,
    unresolved_movement_transitions: input.unresolved_movement_transitions ?? input.unresolvedMovementTransitions ?? [],
    pending_destination_id: input.destination_zone_id ?? input.destinationZoneId,
    gm_dev_provenance: { paused_before_departure: true },
  });
  state.continuation_points[continuation.continuation_id] = continuation;
  const trigger = createReactionTrigger({
    trigger_type: REACTION_TRIGGER_TYPES.OPPORTUNITY_ATTACK,
    timing_point: REACTION_TIMING_POINTS.BEFORE_MOVEMENT_LEAVES_THREATENED_REACH,
    combat_id: state.combat.combat_id,
    parent_turn_id: state.parent_turn.parent_turn_id,
    parent_sub_resolution_id: input.parent_sub_resolution_id ?? input.parentSubResolutionId,
    triggering_actor_id: participantId(mover),
    triggering_event: 'voluntary_movement_leaves_reach',
    source_state_version: state.parent_turn.current_state_version,
    position_state: {
      before_proximity: input.before_proximity ?? input.beforeProximity,
      after_proximity: input.after_proximity ?? input.afterProximity,
    },
    potential_reactors: candidates.map((candidate) => candidate.reactor_id),
    player_visible_summary: 'Moving away may draw an opportunity attack.',
    continuation_id: continuation.continuation_id,
  });
  state.reaction_triggers[trigger.trigger_id] = trigger;
  state.parent_turn.status = PLAYER_TURN_STATUSES.PAUSED_FOR_REACTION;
  return {
    status: REACTION_TRIGGER_STATUSES.DETECTED,
    state,
    trigger,
    continuation,
    candidates,
    gm_dev_trace: { timing_point: trigger.timing_point, paused_before_departure: true },
  };
}

export function resumeParentResolution(input = {}) {
  const state = normalizeState(input.state ?? input);
  const continuation = state.continuation_points[cleanText(input.continuation_id ?? input.continuationId)] ?? null;
  const actor = findParticipant(state, state.parent_turn.actor_participant_id);
  const invalid = !actor || actor.active === false || actor.defeated === true || !canReact({ ...state, conditions: [] }, actor) && actor.defeated === true;
  if (continuation) {
    continuation.continuation_status = invalid ? CONTINUATION_STATUSES.TERMINATED_BY_REACTION : CONTINUATION_STATUSES.RESUMED;
    state.continuation_points[continuation.continuation_id] = continuation;
  }
  state.parent_turn.status = invalid ? PLAYER_TURN_STATUSES.CLOSED : PLAYER_TURN_STATUSES.OPEN;
  return {
    status: invalid ? 'parent_terminated' : 'parent_resumed',
    state,
    continuation,
    next_decision: {
      next_decision_kind: invalid ? REACTION_NEXT_DECISION_KINDS.PARENT_TERMINATED : REACTION_NEXT_DECISION_KINDS.RESUME_PARENT,
      requires_continue_click: false,
    },
    gm_dev_trace: { parent_restart: false, prior_work_repeated: false },
  };
}

export function createNestedReactionExceptionRegistry(input = {}) {
  return {
    max_depth: toInteger(input.max_depth ?? input.maxDepth, 1),
    enabled_exceptions: asArray(input.enabled_exceptions ?? input.enabledExceptions),
  };
}

export function processNestedReactionTrigger(input = {}) {
  const registry = createNestedReactionExceptionRegistry(input.registry ?? {});
  const outer = cleanText(input.outer_reaction_type ?? input.outerReactionType);
  const inner = cleanText(input.inner_reaction_type ?? input.innerReactionType);
  const depth = toInteger(input.depth, 1);
  const allowed = registry.enabled_exceptions.some((entry) =>
    cleanText(entry.outer_reaction_type ?? entry.outerReactionType) === outer &&
    cleanText(entry.inner_reaction_type ?? entry.innerReactionType) === inner
  );
  if (!allowed || depth > registry.max_depth) {
    return {
      status: 'nested_reaction_rejected',
      player_window_opened: false,
      gm_dev_trace: {
        reason: allowed ? 'maximum_depth_exceeded' : 'unregistered_nested_reaction_exception',
        outer_reaction_type: outer,
        inner_reaction_type: inner,
        depth,
      },
    };
  }
  return {
    status: 'nested_reaction_exception_allowed',
    player_window_opened: false,
    gm_dev_trace: { outer_reaction_type: outer, inner_reaction_type: inner, depth },
  };
}

export function enterReactionRecoveryNeeded(input = {}) {
  const state = normalizeState(input.state ?? input);
  state.reaction_recovery_needed = true;
  if (state.parent_turn) {
    state.parent_turn.status = PLAYER_TURN_STATUSES.RECOVERY_NEEDED;
  }
  return {
    status: COMBAT_RESOLUTION_STATUSES.RECOVERY_NEEDED,
    state,
    player_safe_message: 'This reaction needs GM review before combat can continue.',
    read_model: buildReactionPlayerReadModel({ state }),
    retry_safe: Boolean(input.retry_safe ?? input.retrySafe),
    gm_dev_trace: {
      failed_step: input.failed_step ?? input.failedStep ?? null,
      completed_facts_preserved: asArray(input.completed_facts ?? input.completedFacts),
      continuation_frozen: true,
      queue_frozen: true,
    },
  };
}

export function buildReactionPlayerReadModel(input = {}) {
  const state = normalizeState(input.state ?? input);
  const window = input.reaction_window ?? input.reactionWindow ?? (state.active_reaction_window_id ? state.reaction_windows[state.active_reaction_window_id] : null);
  const model = {
    reaction_state: window?.status === REACTION_WINDOW_STATUSES.OPEN ? 'waiting_for_player' : state.reaction_recovery_needed ? 'recovery_needed' : 'none',
    trigger: window ? { summary: window.trigger_summary } : null,
    legal_reaction_options: window ? asArray(window.legal_reaction_options).map((option) => ({
      reaction_id: option.reaction_id,
      reaction_type: option.reaction_type,
      player_name: option.player_name,
      player_safe_description: option.player_safe_description,
      visible_cost: option.visible_cost,
      additional_resource_costs: option.additional_resource_costs,
    })) : [],
    decline_option: window ? window.decline_option : null,
    reaction_resource_status: window?.reaction_resource_status ?? null,
    applied_preference: window?.applied_preference ?? null,
    timeout_behavior: window?.timeout_behavior ?? null,
    parent_context: window ? { parent_turn_id: window.parent_turn_id, interrupted: true } : null,
    latest_event: state.latest_reaction_result?.player_safe_summary ?? null,
    recovery_needed_message: state.reaction_recovery_needed ? 'This reaction needs GM review before combat can continue.' : null,
  };
  assertNoReactionPlayerHiddenData(model);
  return model;
}

export function projectReactionForPlayer(payload = {}) {
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
      if (['state', 'gmdevtrace', 'reactionqueues', 'continuationpoints', 'reactionidempotencyrecords'].includes(normalized) || PLAYER_PROHIBITED_KEYS.some((forbidden) => normalized.includes(normalizedKey(forbidden)))) {
        delete value[key];
      } else {
        strip(value[key]);
      }
    }
    return value;
  }
  const stripped = strip(projected);
  assertNoReactionPlayerHiddenData(stripped);
  return stripped;
}

export function projectReactionForGmDev(payload = {}) {
  return cloneSerializable(payload);
}

export function buildReactionGmDevTrace(input = {}) {
  return {
    trace_kind: 'combat_reaction_interrupt_runtime',
    payload: cloneSerializable(input),
  };
}

export function assertNoReactionPlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const key of PLAYER_PROHIBITED_KEYS) {
    if (serialized.includes(key)) {
      throw reactionError(`Player reaction payload contains prohibited key "${key}".`, 'COMBAT_REACTION_VISIBILITY_LEAK');
    }
  }
  return true;
}
