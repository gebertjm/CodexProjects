import {
  SHARED_INTERACTION_DOMAINS,
  createInteractionContext,
} from './contracts.js';
import {
  RECOVERY_ACTIONS,
  SAFE_INTERACTION_ERROR_CODES,
  createSafeInteractionError,
} from './errors.js';
import {
  NEXT_BEAT_DECISION_KINDS,
  PLAYER_READ_MODEL_STATES,
  RECOVERY_NEEDED_KINDS,
  TRANSITION_DECISION_KINDS,
  createNextBeatDecision,
  createPlayerResultBundle,
  createResolutionAdapterContract,
  createResolutionTraceEnvelope,
  createTransitionDecision,
} from './resolutionPipeline.js';
import {
  VISIBILITY_SCOPES,
  normalizeVisibilityScope,
} from './visibility.js';
import {
  assertNoPlayerHiddenData,
  projectForGmDev,
  projectForPlayer,
} from './visibilityBoundary.js';

export const COMBAT_RULESET_SYSTEMS = Object.freeze({
  DND5E: 'dnd5e',
});

export const COMBAT_RULESET_VERSIONS = Object.freeze({
  DND5E_2014: '2014',
});

export const DEFAULT_COMBAT_RULESET = Object.freeze({
  ruleset_id: 'dnd5e-2014',
  system: COMBAT_RULESET_SYSTEMS.DND5E,
  system_label: 'Dungeons & Dragons Fifth Edition',
  rules_version: COMBAT_RULESET_VERSIONS.DND5E_2014,
});

export const COMBAT_DECISION_TYPES = Object.freeze({
  MOVEMENT: 'movement',
  ACTION: 'action',
  BONUS_ACTION: 'bonus_action',
  OBJECT_INTERACTION: 'object_interaction',
  END_TURN: 'end_turn',
  REACTION: 'reaction',
  DECLINE_REACTION: 'decline_reaction',
  RESUME_INTERRUPTED_RESOLUTION: 'resume_interrupted_resolution',
});

export const COMBAT_TIMING_CATEGORIES = Object.freeze({
  MOVEMENT: 'movement',
  ACTION: 'action',
  BONUS_ACTION: 'bonus_action',
  OBJECT_INTERACTION: 'object_interaction',
  END_TURN: 'end_turn',
  REACTION: 'reaction',
  INTERRUPT: 'interrupt',
  AUTOMATIC: 'automatic',
  CONTINUATION: 'continuation',
});

export const COMBAT_SUBMIT_OPERATION_TYPES = Object.freeze({
  ACTION: 'combat_action',
  MOVEMENT: 'combat_movement',
  END_TURN: 'combat_end_turn',
  REACTION: 'combat_reaction',
  DECLINE_REACTION: 'combat_decline_reaction',
});

export const COMBAT_SUBMIT_OUTCOMES = Object.freeze({
  COMMITTED: 'committed',
  DUPLICATE_HANDLED: 'duplicate_handled',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  REACTION_REQUIRED: 'reaction_required',
  NEXT_PLAYER_DECISION: 'next_player_decision',
  AUTOMATIC_CONTINUATION: 'automatic_continuation',
  ENCOUNTER_RESOLVED: 'encounter_resolved',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const COMBAT_RESOLUTION_STATUSES = Object.freeze({
  PENDING: 'pending',
  PREVIEWED: 'previewed',
  COMMITTED: 'committed',
  RESOLVED: 'resolved',
  DUPLICATE_HANDLED: 'duplicate_handled',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const COMBAT_TRANSITION_DECISION_KINDS = Object.freeze({
  REMAIN_IN_CURRENT_PLAYER_TURN: 'remain_in_current_player_turn',
  OPEN_INCREMENTAL_PLAYER_DECISION: 'open_incremental_player_decision',
  OPEN_REACTION_INTERRUPT: 'open_reaction_interrupt',
  RESUME_INTERRUPTED_RESOLUTION: 'resume_interrupted_resolution',
  BEGIN_AUTOMATIC_ALLIED_TURN: 'begin_automatic_allied_turn',
  BEGIN_AUTOMATIC_ENEMY_TURN: 'begin_automatic_enemy_turn',
  BEGIN_SCRIPTED_ORCHESTRATION: 'begin_scripted_orchestration',
  OPEN_NEXT_PLAYER_TURN: 'open_next_player_turn',
  ENTER_ENCOUNTER_RESOLUTION: 'enter_encounter_resolution',
  ENTER_ENDPOINT_REVIEW: 'enter_endpoint_review',
  ENTER_UNAVAILABLE: 'enter_unavailable',
  ENTER_RECOVERY_NEEDED: 'enter_recovery_needed',
});

export const COMBAT_NEXT_BEAT_DECISION_KINDS = Object.freeze({
  KEEP_PARENT_TURN_OPEN: 'keep_parent_turn_open',
  OPEN_MOVEMENT_DECISION: 'open_movement_decision',
  OPEN_ACTION_DECISION: 'open_action_decision',
  OPEN_BONUS_ACTION_DECISION: 'open_bonus_action_decision',
  OPEN_OBJECT_INTERACTION_DECISION: 'open_object_interaction_decision',
  OPEN_REACTION_INTERRUPT: 'open_reaction_interrupt',
  RESUME_INTERRUPTED_RESOLUTION: 'resume_interrupted_resolution',
  RESOLVE_AUTOMATIC_ALLY_OR_ENEMY: 'resolve_automatic_ally_or_enemy',
  OPEN_NEXT_PLAYER_TURN: 'open_next_player_turn',
  ENDPOINT_REVIEW_ONLY: 'endpoint_review_only',
  UNAVAILABLE_NO_STATE_CHANGE: 'unavailable_no_state_change',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const RUSK_COMBAT_ENTRY = Object.freeze({
  source_boundary: 'greyvale_rusk_dialogue_endpoint',
  source_scene_id: 'shrine-ruins',
  encounter_template_id: 'shrine-rusk-confrontation',
  default_variant_id: 'solo',
  canonical_setup_reference: 'greyvale.rusk.shrine_combat_start',
});

export const RUSK_COMBAT_EXIT_OUTCOMES = Object.freeze({
  PLAYER_VICTORY: 'player_victory',
  RUSK_DEFEAT_LETHAL: 'rusk_defeat_lethal',
  RUSK_DEFEAT_NONLETHAL: 'rusk_defeat_nonlethal',
  RUSK_UNCONSCIOUS: 'rusk_unconscious',
  RUSK_CAPTURED: 'rusk_captured',
  RUSK_SURRENDER: 'rusk_surrender',
  PLAYER_RETREAT: 'player_retreat',
  PLAYER_SURRENDER: 'player_surrender',
  FAIL_FORWARD_PLAYER_DEFEAT: 'fail_forward_player_defeat',
  UNUSUAL_AUTHORED_RESOLUTION: 'unusual_authored_resolution',
});

export const RUSK_SHRINE_AFTERMATH_STATE = Object.freeze({
  scene_id: 'shrine-ruins',
  state_id: 'shrine_ruins_aftermath',
  state_kind: 'shared_aftermath',
});

export const COMBAT_PERSISTENCE_SUPPORT_STATUSES = Object.freeze({
  DIRECTLY_SUPPORTED: 'directly_supported',
  DERIVABLE: 'derivable',
  RESPONSE_SCOPED: 'temporarily_response_scoped',
  POTENTIALLY_DEFICIENT_UNPROVEN: 'potentially_deficient_but_unproven',
});

export const COMBAT_PERSISTENCE_POSTURE = Object.freeze([
  {
    concept: 'combat_id',
    existing_structure: 'dnd5e_combat.id',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.DIRECTLY_SUPPORTED,
  },
  {
    concept: 'participant_state',
    existing_structure: 'dnd5e_combat_participant',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.DIRECTLY_SUPPORTED,
  },
  {
    concept: 'committed_sub_resolution_evidence',
    existing_structure: 'dnd5e_combat_action_log',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.DERIVABLE,
  },
  {
    concept: 'parent_turn_id',
    existing_structure: 'combat_id + round_number + current_turn_index + actor participant',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.DERIVABLE,
  },
  {
    concept: 'sub_resolution_id',
    existing_structure: 'combat action log id or response-scoped contract id before persistence',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.DERIVABLE,
  },
  {
    concept: 'interrupt_parent_id',
    existing_structure: 'not yet persisted as a first-class relation',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.RESPONSE_SCOPED,
  },
  {
    concept: 'idempotency_key',
    existing_structure: 'action window/request context plus logs; no dedicated column',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.POTENTIALLY_DEFICIENT_UNPROVEN,
  },
  {
    concept: 'recovery_needed_marker',
    existing_structure: 'result/read-model envelope and logs; no dedicated combat state',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.POTENTIALLY_DEFICIENT_UNPROVEN,
  },
  {
    concept: 'gm_dev_trace',
    existing_structure: 'Stage 6C generated trace envelope plus combat logs/provenance',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.RESPONSE_SCOPED,
  },
  {
    concept: 'rusk_aftermath_outputs',
    existing_structure: 'existing progression/history/objective tables and combat_end hook',
    support_status: COMBAT_PERSISTENCE_SUPPORT_STATUSES.DIRECTLY_SUPPORTED,
  },
]);

export const COMBAT_ADAPTER_REQUIRED_OPERATIONS = Object.freeze([
  'buildCombatInteractionContext',
  'previewCombatAction',
  'previewCombatMovement',
  'submitCombatAction',
  'submitCombatMovement',
  'submitCombatEndTurn',
  'submitCombatReaction',
  'declineCombatReaction',
  'resumeCombatInteraction',
  'buildCombatPlayerResultBundle',
  'buildCombatPlayerReadModel',
  'buildCombatGmDevTrace',
  'projectCombatForPlayer',
  'projectCombatForGmDev',
]);

export const COMBAT_PLAYER_PROHIBITED_FIELD_KEYS = Object.freeze([
  'exact_enemy_hit_points',
  'exactEnemyHitPoints',
  'enemy_current_hp',
  'enemyCurrentHp',
  'enemy_max_hp',
  'enemyMaxHp',
  'armor_class',
  'armorClass',
  'enemy_armor_class',
  'enemyArmorClass',
  'saving_throw_modifiers',
  'savingThrowModifiers',
  'hidden_dc',
  'hiddenDc',
  'raw_current_turn_index',
  'rawCurrentTurnIndex',
  'current_turn_index',
  'currentTurnIndex',
  'control_mode',
  'controlMode',
  'raw_result_data',
  'rawResultData',
  'result_json',
  'resultJson',
  'mutation_plan',
  'mutationPlan',
  'idempotency_key',
  'idempotencyKey',
  'action_window_internal',
  'actionWindowInternal',
  'internal_routing',
  'internalRouting',
  'trace',
  'gm_dev_trace',
  'gmDevTrace',
  'source_path',
  'sourcePath',
  'test_metadata',
  'testMetadata',
  'hidden_participants',
  'hiddenParticipants',
  'unrevealed_resources',
  'unrevealedResources',
]);

const combatTransitionStage6CMap = Object.freeze({
  [COMBAT_TRANSITION_DECISION_KINDS.REMAIN_IN_CURRENT_PLAYER_TURN]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.OPEN_INCREMENTAL_PLAYER_DECISION]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.OPEN_REACTION_INTERRUPT]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.RESUME_INTERRUPTED_RESOLUTION]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.BEGIN_AUTOMATIC_ALLIED_TURN]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.BEGIN_AUTOMATIC_ENEMY_TURN]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.BEGIN_SCRIPTED_ORCHESTRATION]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.OPEN_NEXT_PLAYER_TURN]:
    TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
  [COMBAT_TRANSITION_DECISION_KINDS.ENTER_ENCOUNTER_RESOLUTION]:
    TRANSITION_DECISION_KINDS.ENDPOINT,
  [COMBAT_TRANSITION_DECISION_KINDS.ENTER_ENDPOINT_REVIEW]:
    TRANSITION_DECISION_KINDS.ENDPOINT,
  [COMBAT_TRANSITION_DECISION_KINDS.ENTER_UNAVAILABLE]:
    TRANSITION_DECISION_KINDS.UNAVAILABLE,
  [COMBAT_TRANSITION_DECISION_KINDS.ENTER_RECOVERY_NEEDED]:
    TRANSITION_DECISION_KINDS.RECOVERY_NEEDED,
});

const combatNextBeatStage6CMap = Object.freeze({
  [COMBAT_NEXT_BEAT_DECISION_KINDS.KEEP_PARENT_TURN_OPEN]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_MOVEMENT_DECISION]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_ACTION_DECISION]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_BONUS_ACTION_DECISION]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_OBJECT_INTERACTION_DECISION]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_REACTION_INTERRUPT]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.RESUME_INTERRUPTED_RESOLUTION]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.RESOLVE_AUTOMATIC_ALLY_OR_ENEMY]:
    NEXT_BEAT_DECISION_KINDS.NO_ACTION_WINDOW,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_NEXT_PLAYER_TURN]:
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY]:
    NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_NO_STATE_CHANGE]:
    NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
  [COMBAT_NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED]:
    NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED,
});

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(value).toLowerCase();
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionalText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function optionalId(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = cleanText(String(value));
    if (text) {
      return text;
    }
  }
  return null;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

function normalizeEnumValue(value, values, fallback) {
  const normalized = normalizedKey(value);
  return values.includes(normalized) ? normalized : fallback;
}

function normalizeNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function healthBand(participant = {}) {
  if (participant.is_defeated || participant.isDefeated || Number(participant.current_hp ?? participant.currentHp) <= 0) {
    return 'defeated';
  }
  const current = normalizeNumber(participant.current_hp ?? participant.currentHp);
  const max = normalizeNumber(participant.max_hp ?? participant.maxHp);
  if (current === null || max === null || max <= 0) {
    return 'unknown';
  }
  const ratio = current / max;
  if (ratio >= 0.75) {
    return 'steady';
  }
  if (ratio >= 0.4) {
    return 'wounded';
  }
  return 'badly_wounded';
}

function normalizeCombatDecisionType(value, fallback = COMBAT_DECISION_TYPES.ACTION) {
  return normalizeEnumValue(value, Object.values(COMBAT_DECISION_TYPES), fallback);
}

function normalizeCombatTimingCategory(value, fallback = COMBAT_TIMING_CATEGORIES.ACTION) {
  return normalizeEnumValue(value, Object.values(COMBAT_TIMING_CATEGORIES), fallback);
}

function normalizeCombatSubmitOperationType(value, fallback = COMBAT_SUBMIT_OPERATION_TYPES.ACTION) {
  return normalizeEnumValue(value, Object.values(COMBAT_SUBMIT_OPERATION_TYPES), fallback);
}

function normalizeCombatSubmitOutcome(value, fallback = COMBAT_SUBMIT_OUTCOMES.COMMITTED) {
  return normalizeEnumValue(value, Object.values(COMBAT_SUBMIT_OUTCOMES), fallback);
}

function normalizeCombatResolutionStatus(value, fallback = COMBAT_RESOLUTION_STATUSES.PENDING) {
  return normalizeEnumValue(value, Object.values(COMBAT_RESOLUTION_STATUSES), fallback);
}

function normalizeCombatTransitionKind(value, fallback = COMBAT_TRANSITION_DECISION_KINDS.REMAIN_IN_CURRENT_PLAYER_TURN) {
  return normalizeEnumValue(value, Object.values(COMBAT_TRANSITION_DECISION_KINDS), fallback);
}

function normalizeCombatNextBeatKind(value, fallback = COMBAT_NEXT_BEAT_DECISION_KINDS.KEEP_PARENT_TURN_OPEN) {
  return normalizeEnumValue(value, Object.values(COMBAT_NEXT_BEAT_DECISION_KINDS), fallback);
}

export function createCombatRulesetIdentity(input = {}) {
  const system = normalizedKey(input.system ?? input.ruleset_system ?? input.rulesetSystem ?? DEFAULT_COMBAT_RULESET.system);
  const rulesVersion = cleanText(input.rules_version ?? input.rulesVersion ?? input.version ?? DEFAULT_COMBAT_RULESET.rules_version);
  const supported =
    system === DEFAULT_COMBAT_RULESET.system &&
    rulesVersion === DEFAULT_COMBAT_RULESET.rules_version;
  return {
    ruleset_id: optionalId(input.ruleset_id, input.rulesetId) ?? `${system || DEFAULT_COMBAT_RULESET.system}-${rulesVersion || DEFAULT_COMBAT_RULESET.rules_version}`,
    system: system || DEFAULT_COMBAT_RULESET.system,
    system_label:
      optionalText(input.system_label, input.systemLabel) ??
      (system === COMBAT_RULESET_SYSTEMS.DND5E
        ? DEFAULT_COMBAT_RULESET.system_label
        : 'Unsupported combat ruleset'),
    rules_version: rulesVersion || DEFAULT_COMBAT_RULESET.rules_version,
    supported,
    validation_status: supported ? 'supported' : 'reserved_for_future_ruleset',
  };
}

export function createCombatInteractionContext(input = {}) {
  const ruleset = createCombatRulesetIdentity(input.ruleset ?? input.ruleset_identity ?? input.rulesetIdentity ?? input);
  const base = createInteractionContext({
    ...input,
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    visibility_scope: input.visibility_scope ?? input.visibilityScope ?? VISIBILITY_SCOPES.SYSTEM_INTERNAL,
  });

  return {
    ...base,
    ruleset,
    ruleset_id: ruleset.ruleset_id,
    rules_version: ruleset.rules_version,
    combat_id: optionalId(input.combat_id, input.combatId),
    encounter_id: optionalId(input.encounter_id, input.encounterId),
    actor_participant_id: optionalId(input.actor_participant_id, input.actorParticipantId, input.participant_id),
    current_parent_turn_id: optionalId(input.current_parent_turn_id, input.currentParentTurnId, input.parent_turn_id),
    current_action_window_id: optionalId(
      input.current_action_window_id,
      input.currentActionWindowId,
      input.action_window_id,
      input.actionWindowId
    ),
    current_state_version: optionalId(
      input.current_state_version,
      input.currentStateVersion,
      input.interaction_state_version,
      input.context_version
    ),
    visible_participants: normalizeArray(input.visible_participants ?? input.visibleParticipants),
    current_player_decision_type: normalizeCombatDecisionType(
      input.current_player_decision_type ?? input.currentPlayerDecisionType,
      COMBAT_DECISION_TYPES.ACTION
    ),
    timing_category: normalizeCombatTimingCategory(
      input.timing_category ?? input.timingCategory,
      COMBAT_TIMING_CATEGORIES.ACTION
    ),
    authorized_projection_mode: normalizeVisibilityScope(
      input.authorized_projection_mode ??
        input.authorizedProjectionMode ??
        input.visibility_scope ??
        input.visibilityScope,
      VISIBILITY_SCOPES.SYSTEM_INTERNAL
    ),
    recovery_status: optionalText(input.recovery_status, input.recoveryStatus),
    rusk_handoff_metadata: normalizeObject(input.rusk_handoff_metadata ?? input.ruskHandoffMetadata),
  };
}

export function createCombatSubResolution(input = {}, options = {}) {
  const ruleset = createCombatRulesetIdentity(input.ruleset ?? input.ruleset_identity ?? input.rulesetIdentity ?? input);
  const transitionDecision = createCombatTransitionDecision(
    input.transition_decision ?? input.transitionDecision ?? {}
  );
  const nextBeatDecision = createCombatNextBeatDecision(
    input.next_beat_decision ?? input.nextBeatDecision ?? {}
  );

  return {
    combat_id: optionalId(input.combat_id, input.combatId),
    parent_turn_id: optionalId(input.parent_turn_id, input.parentTurnId),
    sub_resolution_id: optionalId(input.sub_resolution_id, input.subResolutionId, input.resolution_id),
    sub_resolution_order: normalizePositiveInteger(
      input.sub_resolution_order ?? input.subResolutionOrder,
      options.defaultOrder ?? null
    ),
    interrupt_parent_id: optionalId(input.interrupt_parent_id, input.interruptParentId),
    continuation_id: optionalId(input.continuation_id, input.continuationId),
    action_window_id: optionalId(input.action_window_id, input.actionWindowId),
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    source_state_version: optionalId(input.source_state_version, input.sourceStateVersion),
    ruleset,
    ruleset_id: ruleset.ruleset_id,
    rules_version: ruleset.rules_version,
    actor_participant_id: optionalId(input.actor_participant_id, input.actorParticipantId),
    timing_category: normalizeCombatTimingCategory(input.timing_category ?? input.timingCategory),
    decision_type: normalizeCombatDecisionType(input.decision_type ?? input.decisionType),
    resolution_status: normalizeCombatResolutionStatus(input.resolution_status ?? input.resolutionStatus),
    result_bundle: input.result_bundle || input.resultBundle
      ? createPlayerResultBundle(input.result_bundle ?? input.resultBundle)
      : null,
    transition_decision: transitionDecision,
    next_beat_decision: nextBeatDecision,
    continuation_point: normalizeObject(input.continuation_point ?? input.continuationPoint),
    gm_dev_metadata: normalizeObject(input.gm_dev_metadata ?? input.gmDevMetadata),
  };
}

export function createCombatParentTurn(input = {}) {
  const subResolutions = normalizeArray(input.sub_resolutions ?? input.subResolutions).map((entry, index) =>
    createCombatSubResolution(
      {
        combat_id: input.combat_id ?? input.combatId,
        parent_turn_id: input.parent_turn_id ?? input.parentTurnId,
        ruleset: input.ruleset ?? input.rulesetIdentity,
        actor_participant_id: input.actor_participant_id ?? input.actorParticipantId,
        ...entry,
      },
      { defaultOrder: index + 1 }
    )
  );

  return {
    combat_id: optionalId(input.combat_id, input.combatId),
    parent_turn_id: optionalId(input.parent_turn_id, input.parentTurnId),
    round_number: normalizePositiveInteger(input.round_number ?? input.roundNumber),
    initiative_position: normalizePositiveInteger(input.initiative_position ?? input.initiativePosition),
    actor_participant_id: optionalId(input.actor_participant_id, input.actorParticipantId),
    action_window_id: optionalId(input.action_window_id, input.actionWindowId),
    source_state_version: optionalId(input.source_state_version, input.sourceStateVersion),
    ruleset: createCombatRulesetIdentity(input.ruleset ?? input.rulesetIdentity ?? input),
    sub_resolutions: subResolutions,
    interrupt_stack: normalizeArray(input.interrupt_stack ?? input.interruptStack),
    end_turn_resolution_id: optionalId(input.end_turn_resolution_id, input.endTurnResolutionId),
    status: optionalText(input.status) ?? 'open',
  };
}

export function createCombatReactionInterrupt(input = {}) {
  return createCombatSubResolution({
    ...input,
    timing_category: COMBAT_TIMING_CATEGORIES.REACTION,
    decision_type: COMBAT_DECISION_TYPES.REACTION,
    resolution_status: input.resolution_status ?? input.resolutionStatus ?? COMBAT_RESOLUTION_STATUSES.PENDING,
    gm_dev_metadata: {
      ...normalizeObject(input.gm_dev_metadata ?? input.gmDevMetadata),
      consumes_reaction_resource: true,
      replaces_parent_turn: false,
    },
  });
}

export function createCombatPreviewContract(input = {}) {
  return {
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    preview_id: optionalId(input.preview_id, input.previewId),
    preview_identity: {
      preview_id: optionalId(input.preview_id, input.previewId),
      combat_id: optionalId(input.combat_id, input.combatId),
      parent_turn_id: optionalId(input.parent_turn_id, input.parentTurnId),
      action_window_id: optionalId(input.action_window_id, input.actionWindowId),
      source_state_version: optionalId(input.source_state_version, input.sourceStateVersion),
      selected_action_id: optionalId(input.selected_action_id, input.selectedActionId, input.action_id),
      selected_target_id: optionalId(input.selected_target_id, input.selectedTargetId, input.target_id),
      selected_destination_id: optionalId(input.selected_destination_id, input.selectedDestinationId, input.destination_id),
    },
    ruleset: createCombatRulesetIdentity(input.ruleset ?? input.rulesetIdentity ?? input),
    selected_action: normalizeObject(input.selected_action ?? input.selectedAction),
    selected_movement: normalizeObject(input.selected_movement ?? input.selectedMovement),
    selected_target_id: optionalId(input.selected_target_id, input.selectedTargetId, input.target_id),
    selected_destination_id: optionalId(input.selected_destination_id, input.selectedDestinationId, input.destination_id),
    action_economy_cost: optionalText(input.action_economy_cost, input.actionEconomyCost),
    movement_cost: normalizeNumber(input.movement_cost ?? input.movementCost),
    visible_resource_cost: normalizeObject(input.visible_resource_cost ?? input.visibleResourceCost),
    legality: optionalText(input.legality) ?? 'unknown',
    is_available: input.is_available === undefined && input.isAvailable === undefined
      ? null
      : normalizeBoolean(input.is_available ?? input.isAvailable, false),
    safe_unavailable_reason: optionalText(input.safe_unavailable_reason, input.safeUnavailableReason),
    visible_targets: normalizeArray(input.visible_targets ?? input.visibleTargets),
    target_inclusion_policy: optionalText(input.target_inclusion_policy, input.targetInclusionPolicy),
    known_ally_or_non_hostile_exposure: normalizeObject(
      input.known_ally_or_non_hostile_exposure ?? input.knownAllyOrNonHostileExposure
    ),
    known_range: optionalText(input.known_range, input.knownRange),
    known_proximity: optionalText(input.known_proximity, input.knownProximity),
    known_cover: optionalText(input.known_cover, input.knownCover),
    known_engagement_effects: normalizeArray(input.known_engagement_effects ?? input.knownEngagementEffects),
    known_opportunity_attack_risk: optionalText(
      input.known_opportunity_attack_risk,
      input.knownOpportunityAttackRisk
    ),
    known_advantage_or_disadvantage: optionalText(
      input.known_advantage_or_disadvantage,
      input.knownAdvantageOrDisadvantage
    ),
    roll_type: optionalText(input.roll_type, input.rollType),
    known_damage_or_effect_types: normalizeArray(
      input.known_damage_or_effect_types ?? input.knownDamageOrEffectTypes
    ).map(String),
    visible_concentration_consequences: optionalText(
      input.visible_concentration_consequences,
      input.visibleConcentrationConsequences
    ),
    visible_terrain_or_hazard_effects: normalizeArray(
      input.visible_terrain_or_hazard_effects ?? input.visibleTerrainOrHazardEffects
    ),
    source_state_version: optionalId(input.source_state_version, input.sourceStateVersion),
    mutates_state: false,
  };
}

export function assertCombatPreviewIsNonMutating(previewLike = {}) {
  const preview = normalizeObject(previewLike);
  const violations = [];
  const forbiddenKeys = [
    'final_rolls',
    'finalRolls',
    'attack_roll',
    'attackRoll',
    'damage_rolls',
    'damageRolls',
    'mutation_plan',
    'mutationPlan',
    'output_bundle',
    'outputBundle',
    'gm_dev_trace',
    'gmDevTrace',
    'hidden_dc',
    'hiddenDc',
  ];
  const serialized = JSON.stringify(preview);
  for (const key of forbiddenKeys) {
    const keyPattern = new RegExp(`"${key}"\\s*:`);
    if (Object.prototype.hasOwnProperty.call(preview, key) || keyPattern.test(serialized)) {
      violations.push(key);
    }
  }
  if (preview.mutates_state === true || preview.mutatesState === true) {
    violations.push('mutates_state');
  }
  if (violations.length > 0) {
    const error = new Error(`Combat preview contains committed or hidden data: ${violations.join(', ')}`);
    error.violations = violations;
    throw error;
  }
  return true;
}

export function createCombatSubmitEnvelope(input = {}) {
  return {
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    operation_type: normalizeCombatSubmitOperationType(input.operation_type ?? input.operationType),
    combat_id: optionalId(input.combat_id, input.combatId),
    parent_turn_id: optionalId(input.parent_turn_id, input.parentTurnId),
    preview_id: optionalId(input.preview_id, input.previewId),
    source_state_version: optionalId(input.source_state_version, input.sourceStateVersion),
    selected_action_id: optionalId(input.selected_action_id, input.selectedActionId, input.action_id),
    selected_movement: normalizeObject(input.selected_movement ?? input.selectedMovement),
    selected_target_id: optionalId(input.selected_target_id, input.selectedTargetId, input.target_id),
    selected_destination_id: optionalId(input.selected_destination_id, input.selectedDestinationId, input.destination_id),
    selected_resource_tier: optionalText(input.selected_resource_tier, input.selectedResourceTier),
    ally_risk_confirmed: normalizeBoolean(input.ally_risk_confirmed ?? input.allyRiskConfirmed, false),
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    actor_context: {
      user_id: optionalId(input.user_id, input.userId, input.actor_context?.user_id, input.actorContext?.userId),
      character_id: optionalId(
        input.character_id,
        input.characterId,
        input.actor_context?.character_id,
        input.actorContext?.characterId
      ),
      actor_participant_id: optionalId(
        input.actor_participant_id,
        input.actorParticipantId,
        input.actor_context?.actor_participant_id,
        input.actorContext?.actorParticipantId
      ),
    },
    authorization_context: normalizeObject(input.authorization_context ?? input.authorizationContext),
    expected_outcome: normalizeCombatSubmitOutcome(input.expected_outcome ?? input.expectedOutcome),
    mutates_state: false,
  };
}

export function createCombatTransitionDecision(input = {}) {
  const combatKind = normalizeCombatTransitionKind(input.combat_kind ?? input.combatKind ?? input.kind);
  return {
    combat_transition_kind: combatKind,
    stage6c_transition_decision: createTransitionDecision({
      kind: combatTransitionStage6CMap[combatKind],
      status: input.status,
      target_type: input.target_type ?? input.targetType,
      target_id: input.target_id ?? input.targetId,
      player_label: input.player_label ?? input.playerLabel,
      player_summary: input.player_summary ?? input.playerSummary,
      safe_status_label: input.safe_status_label ?? input.safeStatusLabel,
      source_interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
      gm_dev_routing: input.gm_dev_routing ?? input.gmDevRouting,
      adapter_proposal: {
        combat_transition_kind: combatKind,
        ...normalizeObject(input.adapter_proposal ?? input.adapterProposal),
      },
      warnings: input.warnings,
    }),
  };
}

export function createCombatNextBeatDecision(input = {}) {
  const combatKind = normalizeCombatNextBeatKind(input.combat_kind ?? input.combatKind ?? input.kind);
  return {
    combat_next_beat_kind: combatKind,
    stage6c_next_beat_decision: createNextBeatDecision({
      kind: combatNextBeatStage6CMap[combatKind],
      action_window_id: input.action_window_id ?? input.actionWindowId,
      action_window_kind: input.action_window_kind ?? input.actionWindowKind,
      endpoint_status: input.endpoint_status ?? input.endpointStatus,
      player_label: input.player_label ?? input.playerLabel,
      player_summary: input.player_summary ?? input.playerSummary,
      review_only: input.review_only ?? input.reviewOnly,
      opens_action_window: input.opens_action_window ?? input.opensActionWindow,
      closes_action_window: input.closes_action_window ?? input.closesActionWindow,
      recovery_needed: combatKind === COMBAT_NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED,
      gm_dev_details: {
        combat_next_beat_kind: combatKind,
        ...normalizeObject(input.gm_dev_details ?? input.gmDevDetails),
      },
      warnings: input.warnings,
    }),
  };
}

function isPlayerParticipant(participant = {}, activeCharacterId = null) {
  const characterId = optionalId(activeCharacterId);
  return (
    participant.is_player_character === true ||
    participant.isPlayerCharacter === true ||
    (characterId && participant.entity_type === 'character' && optionalId(participant.entity_id, participant.entityId) === characterId)
  );
}

function isAllyParticipant(participant = {}, activeCharacterId = null) {
  return isPlayerParticipant(participant, activeCharacterId) || normalizedKey(participant.faction) === 'player';
}

function projectParticipantForPlayer(participant = {}, activeCharacterId = null) {
  const player = isPlayerParticipant(participant, activeCharacterId);
  const ally = isAllyParticipant(participant, activeCharacterId);
  const base = {
    participant_id: optionalId(participant.participant_id, participant.participantId, participant.id),
    display_name: optionalText(participant.display_name, participant.displayName, participant.name),
    relation: player ? 'player' : ally ? 'ally' : 'enemy',
    faction_label: ally ? 'ally' : 'opponent',
    is_current_turn: normalizeBoolean(participant.is_current_turn ?? participant.isCurrentTurn, false),
    is_defeated: normalizeBoolean(participant.is_defeated ?? participant.isDefeated, false),
    visible_conditions: normalizeArray(participant.visible_conditions ?? participant.visibleConditions).map(String),
  };
  if (player) {
    return {
      ...base,
      current_hit_points: normalizeNumber(participant.current_hit_points ?? participant.currentHitPoints ?? participant.current_hp ?? participant.currentHp, 0),
      max_hit_points: normalizeNumber(participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp ?? participant.maxHp, 0),
      temporary_hit_points: normalizeNumber(
        participant.temporary_hit_points ?? participant.temporaryHitPoints ?? participant.temporary_hp ?? participant.temporaryHp,
        0
      ),
      visible_resources: normalizeArray(participant.visible_resources ?? participant.visibleResources),
    };
  }
  return {
    ...base,
    health_band: optionalText(participant.health_band, participant.healthBand) ?? healthBand(participant),
  };
}

export function createCombatPlayerProjection(input = {}) {
  const activeCharacterId = optionalId(input.active_character_id, input.activeCharacterId, input.character_id, input.characterId);
  const participants = normalizeArray(input.participants ?? input.visible_participants ?? input.visibleParticipants);
  const projectedParticipants = participants.map((participant) => projectParticipantForPlayer(participant, activeCharacterId));
  const player = projectedParticipants.find((participant) => participant.relation === 'player') ?? null;

  const projection = {
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    ruleset: createCombatRulesetIdentity(input.ruleset ?? input.rulesetIdentity ?? input),
    combat_status: {
      state: optionalText(input.status, input.combat_status?.state, input.combatStatus?.state) ?? PLAYER_READ_MODEL_STATES.UNKNOWN,
      label: optionalText(input.status_label, input.statusLabel, input.combat_status?.label, input.combatStatus?.label),
    },
    encounter: {
      encounter_id: optionalId(input.encounter_id, input.encounterId),
      title: optionalText(input.encounter_title, input.encounterTitle, input.title),
    },
    round_label: optionalText(input.round_label, input.roundLabel),
    turn_label: optionalText(input.turn_label, input.turnLabel),
    initiative_order: projectedParticipants.map((participant) => ({
      participant_id: participant.participant_id,
      display_name: participant.display_name,
      relation: participant.relation,
      is_current_turn: participant.is_current_turn,
      is_defeated: participant.is_defeated,
    })),
    player,
    allies: projectedParticipants.filter((participant) => participant.relation === 'ally'),
    enemies: projectedParticipants.filter((participant) => participant.relation === 'enemy'),
    named_zones: normalizeArray(input.named_zones ?? input.namedZones),
    relative_proximity: normalizeObject(input.relative_proximity ?? input.relativeProximity),
    visible_cover: normalizeObject(input.visible_cover ?? input.visibleCover),
    movement_remaining: normalizeNumber(input.movement_remaining ?? input.movementRemaining),
    action_economy: normalizeObject(input.action_economy ?? input.actionEconomy),
    available_actions: normalizeArray(input.available_actions ?? input.availableActions),
    legal_targets: normalizeArray(input.legal_targets ?? input.legalTargets),
    reaction_prompt: normalizeObject(input.reaction_prompt ?? input.reactionPrompt),
    combat_focus: normalizeObject(input.combat_focus ?? input.combatFocus),
    latest_player_result: input.latest_player_result || input.latestPlayerResult
      ? createPlayerResultBundle(input.latest_player_result ?? input.latestPlayerResult)
      : null,
    messages: normalizeArray(input.messages).map(String),
    encounter_outcome: normalizeObject(input.encounter_outcome ?? input.encounterOutcome),
    next_step: optionalText(input.next_step, input.nextStep),
  };

  const safe = projectForPlayer(projection, {
    extra_hidden_keys: COMBAT_PLAYER_PROHIBITED_FIELD_KEYS,
    extraHiddenKeys: COMBAT_PLAYER_PROHIBITED_FIELD_KEYS,
  });
  assertNoCombatPlayerHiddenData(safe);
  return safe;
}

export function createCombatGmDevProjection(input = {}) {
  return projectForGmDev({
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    ruleset: createCombatRulesetIdentity(input.ruleset ?? input.rulesetIdentity ?? input),
    exact_combat_state: normalizeObject(input.exact_combat_state ?? input.exactCombatState ?? input.combat_state ?? input.combatState),
    participants: normalizeArray(input.participants),
    factions: normalizeObject(input.factions),
    control_modes: normalizeObject(input.control_modes ?? input.controlModes),
    exact_resources: normalizeObject(input.exact_resources ?? input.exactResources),
    action_window_state: normalizeObject(input.action_window_state ?? input.actionWindowState),
    parent_turns: normalizeArray(input.parent_turns ?? input.parentTurns).map(createCombatParentTurn),
    roll_inputs_and_results: normalizeObject(input.roll_inputs_and_results ?? input.rollInputsAndResults),
    action_and_effect_metadata: normalizeObject(input.action_and_effect_metadata ?? input.actionAndEffectMetadata),
    validation: normalizeObject(input.validation),
    stale_duplicate_idempotency_result: normalizeObject(
      input.stale_duplicate_idempotency_result ?? input.staleDuplicateIdempotencyResult
    ),
    mutation_plan: normalizeObject(input.mutation_plan ?? input.mutationPlan),
    write_results: normalizeObject(input.write_results ?? input.writeResults),
    transition_decision: input.transition_decision || input.transitionDecision
      ? createCombatTransitionDecision(input.transition_decision ?? input.transitionDecision)
      : null,
    next_beat_decision: input.next_beat_decision || input.nextBeatDecision
      ? createCombatNextBeatDecision(input.next_beat_decision ?? input.nextBeatDecision)
      : null,
    projection_stripping: normalizeObject(input.projection_stripping ?? input.projectionStripping),
    recovery_diagnostics: normalizeObject(input.recovery_diagnostics ?? input.recoveryDiagnostics),
    rusk_handoff_metadata: normalizeObject(input.rusk_handoff_metadata ?? input.ruskHandoffMetadata),
    rusk_outcome_metadata: normalizeObject(input.rusk_outcome_metadata ?? input.ruskOutcomeMetadata),
  });
}

export function assertNoCombatPlayerHiddenData(payload = {}) {
  return assertNoPlayerHiddenData(payload, {
    extra_hidden_keys: COMBAT_PLAYER_PROHIBITED_FIELD_KEYS,
    extraHiddenKeys: COMBAT_PLAYER_PROHIBITED_FIELD_KEYS,
    extra_value_patterns: [
      { id: 'combat_pending', pattern: /\bcombat_pending\b/i },
      { id: 'future_supported', pattern: /\bfuture_supported\b/i },
      { id: 'raw_control_mode', pattern: /\bcontrol_mode\b/i },
    ],
    extraValuePatterns: [
      { id: 'combat_pending', pattern: /\bcombat_pending\b/i },
      { id: 'future_supported', pattern: /\bfuture_supported\b/i },
      { id: 'raw_control_mode', pattern: /\bcontrol_mode\b/i },
    ],
  });
}

export function projectCombatForPlayer(input = {}) {
  return createCombatPlayerProjection(input);
}

export function projectCombatForGmDev(input = {}) {
  return createCombatGmDevProjection(input);
}

export function buildCombatPlayerResultBundle(input = {}) {
  return createPlayerResultBundle(input);
}

export function buildCombatPlayerReadModel(input = {}) {
  return createCombatPlayerProjection(input);
}

export function buildCombatGmDevTrace(input = {}) {
  return createCombatGmDevTrace(input);
}

export function createCombatGmDevTrace(input = {}) {
  return createResolutionTraceEnvelope({
    ...input,
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    active_state_summary: {
      combat_id: optionalId(input.combat_id, input.combatId),
      encounter_id: optionalId(input.encounter_id, input.encounterId),
      actor_participant_id: optionalId(input.actor_participant_id, input.actorParticipantId),
      parent_turn_id: optionalId(input.parent_turn_id, input.parentTurnId),
      action_window_id: optionalId(input.action_window_id, input.actionWindowId),
      ...normalizeObject(input.active_state_summary ?? input.activeStateSummary),
    },
    selected_option_kind: optionalText(input.selected_option_kind, input.selectedOptionKind) ?? 'combat_sub_resolution',
    validation_result: normalizeObject(input.validation_result ?? input.validationResult),
    stale_duplicate_idempotency_result: normalizeObject(
      input.stale_duplicate_idempotency_result ?? input.staleDuplicateIdempotencyResult
    ),
    player_result_bundle: input.player_result_bundle ?? input.playerResultBundle ?? {
      status: { state: 'combat_trace', label: 'Combat trace generated' },
    },
    visibility_filtering_notes: [
      'combat_player_projection_strips_exact_enemy_hit_points',
      'combat_player_projection_strips_exact_enemy_armor_class',
      'combat_player_projection_strips_trace_and_mutation_details',
      ...normalizeArray(input.visibility_filtering_notes ?? input.visibilityFilteringNotes),
    ],
  });
}

export function createRuskCombatEntryContract(input = {}) {
  return {
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    entry_boundary: RUSK_COMBAT_ENTRY.source_boundary,
    campaign_id: optionalId(input.campaign_id, input.campaignId),
    active_character_id: optionalId(input.active_character_id, input.activeCharacterId, input.character_id, input.characterId),
    source_scene_id: optionalId(input.source_scene_id, input.sourceSceneId) ?? RUSK_COMBAT_ENTRY.source_scene_id,
    source_endpoint_id: optionalId(input.source_endpoint_id, input.sourceEndpointId) ?? 'rusk_combat_pending_endpoint',
    prior_dialogue_id: optionalId(input.prior_dialogue_id, input.priorDialogueId),
    prior_narrative_state: normalizeObject(input.prior_narrative_state ?? input.priorNarrativeState),
    encounter_template_id:
      optionalId(input.encounter_template_id, input.encounterTemplateId, input.encounter_id, input.encounterId) ??
      RUSK_COMBAT_ENTRY.encounter_template_id,
    selected_variant_id:
      optionalId(input.selected_variant_id, input.selectedVariantId, input.variant_id, input.variantId) ??
      RUSK_COMBAT_ENTRY.default_variant_id,
    ruleset: createCombatRulesetIdentity(input.ruleset ?? input.rulesetIdentity ?? input),
    canonical_combat_start_setup_reference:
      optionalId(input.canonical_combat_start_setup_reference, input.canonicalCombatStartSetupReference) ??
      RUSK_COMBAT_ENTRY.canonical_setup_reference,
    idempotent_behavior: optionalText(input.idempotent_behavior, input.idempotentBehavior) ?? 'create_or_resume_existing_rusk_combat',
    player_safe_combat_start_result: input.player_safe_combat_start_result || input.playerSafeCombatStartResult
      ? createPlayerResultBundle(input.player_safe_combat_start_result ?? input.playerSafeCombatStartResult)
      : createPlayerResultBundle({
          status: { state: 'combat_ready', label: 'Confrontation ready' },
          next: { label: 'Enter combat when support is live.' },
        }),
    gm_dev_handoff_metadata: normalizeObject(input.gm_dev_handoff_metadata ?? input.gmDevHandoffMetadata),
    active_in_stage_6d1: false,
  };
}

export function normalizeRuskCombatExitOutcome(value) {
  return normalizeEnumValue(value, Object.values(RUSK_COMBAT_EXIT_OUTCOMES), RUSK_COMBAT_EXIT_OUTCOMES.UNUSUAL_AUTHORED_RESOLUTION);
}

export function createRuskCombatExitContract(input = {}) {
  const outcomeId = normalizeRuskCombatExitOutcome(input.outcome_id ?? input.outcomeId ?? input.outcome);
  return {
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    outcome_id: outcomeId,
    combat_id: optionalId(input.combat_id, input.combatId),
    participant_states: normalizeArray(input.participant_states ?? input.participantStates),
    persistent_conditions: normalizeArray(input.persistent_conditions ?? input.persistentConditions),
    valid_concentration: normalizeObject(input.valid_concentration ?? input.validConcentration),
    remaining_resources: normalizeObject(input.remaining_resources ?? input.remainingResources),
    objective_outputs: normalizeArray(input.objective_outputs ?? input.objectiveOutputs),
    knowledge_outputs: normalizeArray(input.knowledge_outputs ?? input.knowledgeOutputs),
    history_outputs: normalizeArray(input.history_outputs ?? input.historyOutputs),
    latest_development: normalizeObject(input.latest_development ?? input.latestDevelopment),
    experience_points: normalizeNumber(input.experience_points ?? input.experiencePoints, 0),
    advancement_readiness: normalizeObject(input.advancement_readiness ?? input.advancementReadiness),
    post_combat_hook_identity:
      optionalId(input.post_combat_hook_identity, input.postCombatHookIdentity) ??
      'grey-road-shrine-combat-resolution',
    deduplication_identity: optionalId(input.deduplication_identity, input.deduplicationIdentity) ??
      `rusk-combat-exit:${outcomeId}`,
    return_scene_or_aftermath_state: {
      ...RUSK_SHRINE_AFTERMATH_STATE,
      ...normalizeObject(input.return_scene_or_aftermath_state ?? input.returnSceneOrAftermathState),
    },
    player_summary: optionalText(input.player_summary, input.playerSummary),
    gm_dev_provenance: normalizeObject(input.gm_dev_provenance ?? input.gmDevProvenance),
    mutates_state_in_stage_6d1: false,
  };
}

export function getCombatPersistencePosture() {
  return COMBAT_PERSISTENCE_POSTURE.map((entry) => ({ ...entry }));
}

export function createUnsupportedCombatOperationResult(operationName, input = {}) {
  const error = createSafeInteractionError({
    code: SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED,
    player_safe_message: 'Combat support is not available from this action yet.',
    gm_dev_message: `Combat adapter operation ${operationName} is contract-only in Stage 6D.1.`,
    internal_cause: {
      operation_name: operationName,
      stage: '6D.1',
      live_behavior_changed: false,
    },
    recovery_action: RECOVERY_ACTIONS.RETURN_TO_CURRENT_SCENE,
  });
  const playerResultBundle = createPlayerResultBundle({
    recovery: {
      message: error.player_safe_message,
      retryable: true,
      recovery_action: RECOVERY_ACTIONS.RETURN_TO_CURRENT_SCENE,
    },
    status: {
      state: 'unavailable',
      label: 'Combat unavailable',
      is_recovery_needed: false,
    },
  });
  return {
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    operation_name: operationName,
    status: 'unsupported_not_implemented',
    supported: false,
    mutates_state: false,
    player_result_bundle: playerResultBundle,
    error,
    gm_dev_trace: createCombatGmDevTrace({
      request_kind: 'commit',
      request_id: input.request_id ?? input.requestId,
      validation_result: { supported: false, operation_name: operationName },
      player_result_bundle: playerResultBundle,
      recovery_needed_status: {
        recovery_kind: RECOVERY_NEEDED_KINDS.UNAVAILABLE_OPTION,
        failed_lifecycle_step: operationName,
        retry_safe: true,
      },
    }),
  };
}

function unsupportedOperation(operationName) {
  return (input = {}) => createUnsupportedCombatOperationResult(operationName, input);
}

export function createCombatAdapterContract(adapter = {}) {
  const base = createResolutionAdapterContract({
    interaction_domain: SHARED_INTERACTION_DOMAINS.COMBAT,
    name: adapter.name ?? 'combat_resolution_adapter_contract',
    version: adapter.version ?? '6D.1-contract',
  });
  return {
    ...base,
    ruleset: createCombatRulesetIdentity(adapter.ruleset ?? adapter.rulesetIdentity ?? {}),
    buildCombatInteractionContext:
      adapter.buildCombatInteractionContext ?? ((input = {}) => createCombatInteractionContext(input)),
    previewCombatAction: adapter.previewCombatAction ?? unsupportedOperation('previewCombatAction'),
    previewCombatMovement: adapter.previewCombatMovement ?? unsupportedOperation('previewCombatMovement'),
    submitCombatAction: adapter.submitCombatAction ?? unsupportedOperation('submitCombatAction'),
    submitCombatMovement: adapter.submitCombatMovement ?? unsupportedOperation('submitCombatMovement'),
    submitCombatEndTurn: adapter.submitCombatEndTurn ?? unsupportedOperation('submitCombatEndTurn'),
    submitCombatReaction: adapter.submitCombatReaction ?? unsupportedOperation('submitCombatReaction'),
    declineCombatReaction: adapter.declineCombatReaction ?? unsupportedOperation('declineCombatReaction'),
    resumeCombatInteraction: adapter.resumeCombatInteraction ?? unsupportedOperation('resumeCombatInteraction'),
    buildCombatPlayerResultBundle:
      adapter.buildCombatPlayerResultBundle ?? ((input = {}) => buildCombatPlayerResultBundle(input)),
    buildCombatPlayerReadModel:
      adapter.buildCombatPlayerReadModel ?? ((input = {}) => buildCombatPlayerReadModel(input)),
    buildCombatGmDevTrace:
      adapter.buildCombatGmDevTrace ?? ((input = {}) => buildCombatGmDevTrace(input)),
    projectCombatForPlayer:
      adapter.projectCombatForPlayer ?? ((input = {}) => projectCombatForPlayer(input)),
    projectCombatForGmDev:
      adapter.projectCombatForGmDev ?? ((input = {}) => projectCombatForGmDev(input)),
    live_behavior_enabled: false,
  };
}

export function assertCombatAdapterContract(adapter = {}) {
  const normalized = createCombatAdapterContract(adapter);
  const missing = COMBAT_ADAPTER_REQUIRED_OPERATIONS.filter(
    (operation) => typeof normalized[operation] !== 'function'
  );
  if (missing.length > 0) {
    const error = new Error(`Combat adapter contract missing required operations: ${missing.join(', ')}`);
    error.missing_operations = missing;
    throw error;
  }
  return true;
}
