import {
  INTERACTION_OPTION_KINDS,
  SHARED_INTERACTION_DOMAINS,
  createInteractionContext,
  normalizeSharedInteractionDomain,
} from './contracts.js';
import {
  RECOVERY_ACTIONS,
  SAFE_INTERACTION_ERROR_CODES,
  createSafeInteractionError,
} from './errors.js';
import {
  buildOutputDedupeKey,
  dedupeOutputsByKey,
  normalizeOutputBundle,
  projectOutputBundleForGmDev,
  projectOutputBundleForPlayer,
  summarizeDedupeDecisionForGmDev,
  validateOutputBundle,
} from './outputPipeline.js';
import {
  TRANSITION_OUTPUT_STATUSES,
  TRANSITION_TARGET_TYPES,
} from './transitionOutput.js';
import { VISIBILITY_SCOPES, normalizeVisibilityScope } from './visibility.js';
import {
  assertNoPlayerHiddenData,
  projectForGmDev,
  projectForPlayer,
  scanForPlayerHiddenData,
  toPlayerSafeError,
} from './visibilityBoundary.js';

export const RESOLUTION_REQUEST_KINDS = Object.freeze({
  PREVIEW: 'preview',
  COMMIT: 'commit',
});

export const RESOLUTION_RESPONSE_KINDS = Object.freeze({
  PREVIEW: 'preview_response',
  COMMITTED: 'committed_resolution',
  RECOVERY: 'recovery_response',
  UNAVAILABLE: 'unavailable_response',
  ENDPOINT: 'endpoint_response',
});

export const RESOLUTION_RESPONSE_STATUSES = Object.freeze({
  PREVIEW_READY: 'preview_ready',
  RESOLVED: 'resolved',
  RECOVERY_NEEDED: 'recovery_needed',
  UNAVAILABLE: 'unavailable',
  ENDPOINT: 'endpoint',
  FAILED: 'failed',
});

export const RESOLUTION_INTERACTION_DOMAINS = Object.freeze({
  EXPLORATION: SHARED_INTERACTION_DOMAINS.EXPLORATION,
  DIALOGUE: SHARED_INTERACTION_DOMAINS.DIALOGUE,
  COMBAT_RESERVED: SHARED_INTERACTION_DOMAINS.COMBAT,
  NAVIGATION_RESERVED: SHARED_INTERACTION_DOMAINS.NAVIGATION,
});

export const DETERMINISTIC_OUTCOME_SOURCES = Object.freeze({
  AUTHORED_CONTENT: 'authored_content',
  AUTHORED_FALLBACK: 'authored_fallback',
  PREVIOUS_RESULT: 'previous_result',
  ENDPOINT_POLICY: 'endpoint_policy',
});

export const MUTATION_WRITE_GROUPS = Object.freeze({
  OBJECTIVES: 'objective_writes',
  KNOWLEDGE: 'knowledge_writes',
  HISTORY_AND_LATEST: 'history_latest_development_writes',
  STATE: 'relationship_social_scene_dialogue_state_writes',
  RECORDS_AND_INDEXES: 'completed_record_transcript_archive_search_writes',
  TRANSITION_ENDPOINT: 'transition_endpoint_writes',
  ACTION_WINDOW: 'action_window_close_open_writes',
  READ_MODEL_REFRESH: 'read_model_refresh_hook',
  TRACE_PROVENANCE: 'trace_provenance_writes',
});

export const COMMITTED_BEAT_MUTATION_ORDER = Object.freeze([
  { order: 1, step: 'validate_current_interaction', mutates_state: false },
  { order: 2, step: 'detect_stale_duplicate_idempotency', mutates_state: false },
  { order: 3, step: 'select_deterministic_authored_outcome', mutates_state: false },
  { order: 4, step: 'build_normalized_output_bundle', mutates_state: false },
  { order: 5, step: 'build_player_result_bundle', mutates_state: false },
  { order: 6, step: 'build_mutation_plan', mutates_state: false },
  { order: 7, step: MUTATION_WRITE_GROUPS.OBJECTIVES, mutates_state: true },
  { order: 8, step: MUTATION_WRITE_GROUPS.KNOWLEDGE, mutates_state: true },
  { order: 9, step: MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST, mutates_state: true },
  { order: 10, step: MUTATION_WRITE_GROUPS.STATE, mutates_state: true },
  { order: 11, step: MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES, mutates_state: true },
  { order: 12, step: MUTATION_WRITE_GROUPS.TRANSITION_ENDPOINT, mutates_state: true },
  { order: 13, step: MUTATION_WRITE_GROUPS.ACTION_WINDOW, mutates_state: true },
  { order: 14, step: 'commit_transaction_where_supported', mutates_state: true },
  { order: 15, step: MUTATION_WRITE_GROUPS.READ_MODEL_REFRESH, mutates_state: false },
  { order: 16, step: MUTATION_WRITE_GROUPS.TRACE_PROVENANCE, mutates_state: true },
  { order: 17, step: 'apply_visibility_projection', mutates_state: false },
  { order: 18, step: 'return_player_safe_response', mutates_state: false },
]);

export const ORDERED_MUTATION_WRITE_GROUPS = Object.freeze([
  MUTATION_WRITE_GROUPS.OBJECTIVES,
  MUTATION_WRITE_GROUPS.KNOWLEDGE,
  MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST,
  MUTATION_WRITE_GROUPS.STATE,
  MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES,
  MUTATION_WRITE_GROUPS.TRANSITION_ENDPOINT,
  MUTATION_WRITE_GROUPS.ACTION_WINDOW,
  MUTATION_WRITE_GROUPS.READ_MODEL_REFRESH,
  MUTATION_WRITE_GROUPS.TRACE_PROVENANCE,
]);

export const MUTATION_PLAN_STATUSES = Object.freeze({
  PLANNED: 'planned',
  DEDUPED: 'deduped',
  APPLIED: 'applied',
  PARTIAL_FAILURE: 'partial_failure',
  RECOVERY_NEEDED: 'recovery_needed',
  SKIPPED_DUPLICATE: 'skipped_duplicate',
  STALE_REJECTED: 'stale_rejected',
});

export const MUTATION_IDEMPOTENCY_STATUSES = Object.freeze({
  CURRENT: 'current',
  DUPLICATE: 'duplicate',
  STALE: 'stale',
  ENDPOINT_REVIEW_ONLY: 'endpoint_review_only',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const MUTATION_APPLICATION_STATUSES = Object.freeze({
  APPLIED: 'applied',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const TRANSITION_DECISION_KINDS = Object.freeze({
  NO_TRANSITION: 'no_transition',
  STAY_IN_CURRENT_SCENE: 'stay_in_current_scene',
  SCENE_TRANSITION: 'scene_transition',
  MOVE_TO_SCENE: 'move_to_scene',
  ENTER_DIALOGUE: 'enter_dialogue',
  CONTINUE_DIALOGUE: 'continue_dialogue',
  EXIT_DIALOGUE: 'exit_dialogue',
  RETURN_TO_EXPLORATION: 'return_to_exploration',
  ENDPOINT: 'endpoint',
  RECOVERY_NEEDED: 'recovery_needed',
  UNAVAILABLE: 'unavailable',
  UNAVAILABLE_LOCKED: 'unavailable_locked',
  FUTURE_SUPPORTED: 'future_supported',
  FUTURE_SUPPORTED_HANDOFF: 'future_supported_handoff',
});

export const NEXT_BEAT_DECISION_KINDS = Object.freeze({
  OPEN_EXPLORATION_ACTION_WINDOW: 'open_exploration_action_window',
  OPEN_DIALOGUE_ACTION_WINDOW: 'open_dialogue_action_window',
  KEEP_EXISTING_WINDOW_IF_VALID: 'keep_existing_window_if_valid',
  ENDPOINT_REVIEW_ONLY: 'endpoint_review_only',
  RECOVERY_NEEDED: 'recovery_needed',
  NO_ACTION_WINDOW: 'no_action_window',
  CLOSE_WITHOUT_NEW_WINDOW: 'close_without_new_window',
  UNAVAILABLE_LOCKED_NO_STATE_CHANGE: 'unavailable_locked_no_state_change',
  FUTURE_SUPPORTED_HANDOFF: 'future_supported_handoff',
  FUTURE_SUPPORTED_REVIEW_ONLY: 'future_supported_review_only',
});

export const RECOVERY_NEEDED_KINDS = Object.freeze({
  MALFORMED_REQUEST: 'malformed_request',
  UNAUTHORIZED: 'unauthorized',
  MISSING_ACTION_WINDOW: 'missing_action_window',
  CLOSED_ACTION_WINDOW: 'closed_action_window',
  STALE_REQUEST: 'stale_request',
  DUPLICATE_REQUEST: 'duplicate_request',
  UNAVAILABLE_OPTION: 'unavailable_option',
  MISSING_CONTENT: 'missing_content',
  MISSING_TRANSITION_TARGET: 'missing_transition_target',
  OUTCOME_SELECTION_FAILED: 'outcome_selection_failed',
  OUTPUT_BUNDLE_INCOMPLETE: 'output_bundle_incomplete',
  MUTATION_FAILED: 'mutation_failed',
  READ_MODEL_REFRESH_FAILED: 'read_model_refresh_failed',
  NEXT_BEAT_FAILED: 'next_beat_failed',
  ENDPOINT_REVIEW_ONLY: 'endpoint_review_only',
  RECOVERY_REQUIRED: 'recovery_required',
});

export const PLAYER_RESULT_SECTION_KEYS = Object.freeze([
  'attempted_action',
  'result',
  'consequences',
  'discoveries',
  'progress',
  'complications',
  'next',
  'recovery',
  'status',
]);

export const OUTCOME_QUALITY_WARNING_CODES = Object.freeze({
  MISSING_RECOMMENDED_SECTION: 'missing_recommended_section',
  NO_PLAYER_VISIBLE_CHANGE: 'no_player_visible_change',
  RECOVERY_WITHOUT_NEXT_STEP: 'recovery_without_next_step',
});

export const OUTCOME_QUALITY_STATUSES = Object.freeze({
  COMPLETE: 'complete',
  NEEDS_REVIEW: 'needs_review',
});

export const READ_MODEL_REFRESH_TIMING = Object.freeze({
  AFTER_MUTATION_COMMIT: 'after_mutation_commit',
  AFTER_NEXT_BEAT_SELECTION: 'after_next_beat_selection',
  BEFORE_PLAYER_RESPONSE: 'before_player_response',
  RECOVERY_ONLY: 'recovery_only',
});

export const PLAYER_READ_MODEL_STATES = Object.freeze({
  EXPLORATION_ACTIVE: 'exploration_active',
  DIALOGUE_ACTIVE: 'dialogue_active',
  ENDPOINT_REVIEW: 'endpoint_review',
  AWAITING_SUPPORT: 'awaiting_support',
  UNAVAILABLE: 'unavailable',
  RECOVERY_NEEDED: 'recovery_needed',
  STALE: 'stale',
  UNKNOWN: 'unknown',
});

export const RESULT_READ_MODEL_ALIGNMENT_STATUSES = Object.freeze({
  ALIGNED: 'aligned',
  NEEDS_REVIEW: 'needs_review',
  NOT_APPLICABLE: 'not_applicable',
});

export const RESOLUTION_TRACE_STORAGE_STRATEGIES = Object.freeze({
  GENERATED_IN_MEMORY: 'generated_in_memory',
  ATTACHED_GM_DEV_RESPONSE: 'attached_gm_dev_response',
  PERSISTED_PROVENANCE_ONLY: 'persisted_provenance_only',
  PERSISTED_TRACE_RESERVED: 'persisted_trace_reserved',
});

export const RESOLUTION_TRACE_CHECKPOINTS = Object.freeze({
  REQUEST_RECEIVED: 'request_received',
  SCOPE_AUTH_RESOLVED: 'scope_auth_resolved',
  ACTIVE_STATE_LOADED: 'active_state_loaded',
  REQUEST_VALIDATED: 'request_validated',
  STALE_DUPLICATE_CHECKED: 'stale_duplicate_checked',
  OUTCOME_SELECTED: 'outcome_selected',
  OUTPUT_BUNDLE_BUILT: 'output_bundle_built',
  PLAYER_RESULT_BUNDLE_BUILT: 'player_result_bundle_built',
  MUTATION_PLAN_BUILT: 'mutation_plan_built',
  MUTATION_PLAN_APPLIED: 'mutation_plan_applied',
  TRANSITION_DECISION_MADE: 'transition_decision_made',
  NEXT_BEAT_DECISION_MADE: 'next_beat_decision_made',
  ACTION_WINDOW_LIFECYCLE_APPLIED: 'action_window_lifecycle_applied',
  READ_MODEL_REFRESHED: 'read_model_refreshed',
  VISIBILITY_PROJECTION_APPLIED: 'visibility_projection_applied',
  RESPONSE_RETURNED: 'response_returned',
  RECOVERY_NEEDED_TRIGGERED: 'recovery_needed_triggered',
});

export const RESOLUTION_TRACE_INSPECTION_STATUSES = Object.freeze({
  TRACEABLE: 'traceable',
  PARTIAL: 'partial',
  PLAYER_SAFE: 'player_safe',
  NEEDS_REVIEW: 'needs_review',
});

export const PREVIEW_CONSISTENCY_RULES = Object.freeze({
  NON_MUTATING: 'preview_must_not_mutate_state',
  SAME_AUTHORED_OPTION: 'preview_and_commit_use_same_authored_option',
  PLAYER_SAFE_UNCERTAINTY: 'preview_is_honest_without_hidden_mechanics',
  AUTHORED_DIFFERENCE_REASON: 'commit_difference_requires_authored_or_state_reason',
  GM_DEV_DIAGNOSTICS: 'gm_dev_can_inspect_preview_commit_alignment',
});

export const PREVIEW_EXPECTATION_KINDS = Object.freeze({
  DISCOVERY: 'discovery',
  PROGRESS: 'progress',
  TRANSITION: 'transition',
  SOCIAL_CONSEQUENCE: 'social_consequence',
  ENDPOINT: 'endpoint',
  RECOVERY: 'recovery',
  AVAILABILITY: 'availability',
  NO_COMMIT: 'no_commit',
});

export const RESOLUTION_OUTCOME_MARKER_KINDS = Object.freeze({
  KNOWLEDGE: 'knowledge',
  OBJECTIVE: 'objective',
  HISTORY: 'history',
  LATEST_DEVELOPMENT: 'latest_development',
  STATE_WRITE: 'state_write',
  RELATIONSHIP_OR_SOCIAL_WRITE: 'relationship_or_social_write',
  TRANSITION: 'transition',
  COMPLETED_RECORD: 'completed_record',
  ENDPOINT: 'endpoint',
  RECOVERY: 'recovery',
  NO_OUTPUT: 'no_output',
});

export const PREVIEW_ALIGNMENT_STATUSES = Object.freeze({
  ALIGNED: 'aligned',
  ALIGNED_WITH_UNCERTAINTY: 'aligned_with_uncertainty',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  MISMATCHED: 'mismatched',
  NO_EXPECTATIONS: 'no_expectations',
});

export const PREVIEW_LIFECYCLE_MAP = Object.freeze([
  { step: 'receive_request', owner: 'shared_pipeline', mutates_state: false },
  { step: 'resolve_scope_and_auth', owner: 'shared_pipeline', mutates_state: false },
  { step: 'load_active_state', owner: 'domain_adapter', mutates_state: false },
  { step: 'validate_request', owner: 'shared_pipeline_and_domain_adapter', mutates_state: false },
  { step: 'build_preview', owner: 'domain_adapter', mutates_state: false },
  { step: 'normalize_preview_response', owner: 'shared_pipeline', mutates_state: false },
  { step: 'apply_visibility_filtering', owner: 'shared_pipeline', mutates_state: false },
  { step: 'return_player_safe_preview', owner: 'shared_pipeline', mutates_state: false },
  { step: 'include_gm_dev_diagnostics_if_authorized', owner: 'shared_pipeline', mutates_state: false },
]);

export const COMMIT_LIFECYCLE_MAP = Object.freeze([
  { step: 'receive_request', owner: 'shared_pipeline', mutates_state: false },
  { step: 'resolve_scope_and_auth', owner: 'shared_pipeline', mutates_state: false },
  { step: 'load_active_state', owner: 'domain_adapter', mutates_state: false },
  { step: 'validate_request', owner: 'shared_pipeline_and_domain_adapter', mutates_state: false },
  { step: 'check_stale_duplicate_idempotency', owner: 'shared_pipeline', mutates_state: false },
  { step: 'select_deterministic_authored_outcome', owner: 'domain_adapter', mutates_state: false },
  { step: 'build_domain_outputs', owner: 'domain_adapter', mutates_state: false },
  { step: 'normalize_output_bundle', owner: 'shared_pipeline', mutates_state: false },
  { step: 'build_player_result_bundle', owner: 'shared_pipeline_and_domain_adapter', mutates_state: false },
  { step: 'build_mutation_plan', owner: 'shared_pipeline_and_domain_adapter', mutates_state: false },
  { step: 'decide_transition', owner: 'shared_pipeline_and_domain_adapter', mutates_state: false },
  { step: 'decide_next_beat', owner: 'shared_pipeline_and_domain_adapter', mutates_state: false },
  { step: 'apply_mutations_in_controlled_order', owner: 'runtime_service', mutates_state: true },
  { step: 'close_consumed_action_window', owner: 'runtime_service', mutates_state: true },
  { step: 'open_next_action_window_or_endpoint', owner: 'runtime_service', mutates_state: true },
  { step: 'refresh_player_read_model', owner: 'runtime_service', mutates_state: false },
  { step: 'record_gm_dev_resolution_trace', owner: 'runtime_service', mutates_state: true },
  { step: 'apply_visibility_projection', owner: 'shared_pipeline', mutates_state: false },
  { step: 'return_player_safe_response', owner: 'shared_pipeline', mutates_state: false },
]);

export const RECOVERY_LIFECYCLE_MAP = Object.freeze([
  { step: 'detect_malformed_stale_partial_or_interrupted_state', owner: 'shared_pipeline_or_runtime_service' },
  { step: 'classify_recovery_kind', owner: 'shared_pipeline' },
  { step: 'avoid_unsafe_mutation_unless_explicitly_safe', owner: 'runtime_service' },
  { step: 'mark_recovery_needed_if_required', owner: 'runtime_service' },
  { step: 'return_safe_player_message_and_current_state_if_available', owner: 'shared_pipeline' },
  { step: 'record_gm_dev_trace_or_diagnostic', owner: 'runtime_service' },
  { step: 'avoid_exposing_internal_details_to_player', owner: 'shared_pipeline' },
]);

export const REQUIRED_RESOLUTION_ADAPTER_METHODS = Object.freeze([
  'loadActiveState',
  'validateRequest',
  'buildPreview',
  'selectOutcome',
  'buildDomainOutputs',
  'buildDomainResultSections',
  'buildMutationPlanParts',
  'proposeTransition',
  'proposeNextBeat',
  'buildDomainTraceParts',
  'buildRecoveryProjection',
]);

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

function normalizeEnumValue(value, allowedValues, fallback) {
  const normalized = normalizedKey(value);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function alias(input, snake, camel) {
  return input[snake] ?? input[camel];
}

function normalizeRequestKind(value, fallback = RESOLUTION_REQUEST_KINDS.PREVIEW) {
  return normalizeEnumValue(value, Object.values(RESOLUTION_REQUEST_KINDS), fallback);
}

function normalizeResponseKind(value, fallback = RESOLUTION_RESPONSE_KINDS.COMMITTED) {
  return normalizeEnumValue(value, Object.values(RESOLUTION_RESPONSE_KINDS), fallback);
}

function normalizeTransitionDecisionKind(value, fallback = TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE) {
  const normalized = normalizedKey(value);
  const aliases = {
    same_scene: TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
    stay: TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
    stay_in_scene: TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
    continue_scene: TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
    scene_move: TRANSITION_DECISION_KINDS.SCENE_TRANSITION,
    move_scene: TRANSITION_DECISION_KINDS.SCENE_TRANSITION,
    move_to_scene: TRANSITION_DECISION_KINDS.SCENE_TRANSITION,
    location_transition: TRANSITION_DECISION_KINDS.SCENE_TRANSITION,
    continue_dialogue: TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE,
    remain_in_dialogue: TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE,
    dialogue_continues: TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE,
    dialogue_exit: TRANSITION_DECISION_KINDS.RETURN_TO_EXPLORATION,
    exit_to_exploration: TRANSITION_DECISION_KINDS.RETURN_TO_EXPLORATION,
    endpoint_reached: TRANSITION_DECISION_KINDS.ENDPOINT,
    awaiting_support: TRANSITION_DECISION_KINDS.ENDPOINT,
    completion: TRANSITION_DECISION_KINDS.ENDPOINT,
    locked: TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED,
    blocked: TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED,
    unavailable_locked: TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED,
    combat_pending: TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF,
    enter_combat: TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF,
    future_supported_internal: TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF,
    future_supported_handoff: TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF,
  };
  if (aliases[normalized]) {
    return aliases[normalized];
  }
  return normalizeEnumValue(value, Object.values(TRANSITION_DECISION_KINDS), fallback);
}

function normalizeNextBeatDecisionKind(value, fallback = NEXT_BEAT_DECISION_KINDS.NO_ACTION_WINDOW) {
  const normalized = normalizedKey(value);
  const aliases = {
    keep_window: NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
    keep_existing_window: NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
    reuse_action_window: NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
    endpoint: NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
    endpoint_reached: NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
    awaiting_support: NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
    close_window: NEXT_BEAT_DECISION_KINDS.CLOSE_WITHOUT_NEW_WINDOW,
    close_without_new_window: NEXT_BEAT_DECISION_KINDS.CLOSE_WITHOUT_NEW_WINDOW,
    unavailable: NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
    locked: NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
    blocked: NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
    unavailable_locked: NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
    unavailable_locked_no_state_change: NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
    combat_pending: NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY,
    future_supported: NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY,
    future_supported_internal: NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY,
    future_supported_review_only: NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY,
  };
  if (aliases[normalized]) {
    return aliases[normalized];
  }
  return normalizeEnumValue(value, Object.values(NEXT_BEAT_DECISION_KINDS), fallback);
}

function normalizeRecoveryKind(value, fallback = RECOVERY_NEEDED_KINDS.RECOVERY_REQUIRED) {
  return normalizeEnumValue(value, Object.values(RECOVERY_NEEDED_KINDS), fallback);
}

function normalizeOptionKind(value) {
  const normalized = normalizedKey(value);
  return Object.values(INTERACTION_OPTION_KINDS).includes(normalized) ? normalized : optionalText(value);
}

function normalizeSafeStatusState(value) {
  const state = normalizedKey(value);
  if (!state) {
    return null;
  }
  if (['combat_pending', 'future_supported', 'future_supported_internal', 'future_supported_handoff'].includes(state)) {
    return 'awaiting_support';
  }
  return state;
}

function normalizeTransitionTargetType(value, fallback = TRANSITION_TARGET_TYPES.NONE) {
  return normalizeEnumValue(value, Object.values(TRANSITION_TARGET_TYPES), fallback);
}

function normalizeTransitionStatus(value, fallback = TRANSITION_OUTPUT_STATUSES.PENDING) {
  return normalizeEnumValue(value, Object.values(TRANSITION_OUTPUT_STATUSES), fallback);
}

function normalizeResponseStatus(value, responseKind) {
  const fallbackByKind = {
    [RESOLUTION_RESPONSE_KINDS.PREVIEW]: RESOLUTION_RESPONSE_STATUSES.PREVIEW_READY,
    [RESOLUTION_RESPONSE_KINDS.COMMITTED]: RESOLUTION_RESPONSE_STATUSES.RESOLVED,
    [RESOLUTION_RESPONSE_KINDS.RECOVERY]: RESOLUTION_RESPONSE_STATUSES.RECOVERY_NEEDED,
    [RESOLUTION_RESPONSE_KINDS.UNAVAILABLE]: RESOLUTION_RESPONSE_STATUSES.UNAVAILABLE,
    [RESOLUTION_RESPONSE_KINDS.ENDPOINT]: RESOLUTION_RESPONSE_STATUSES.ENDPOINT,
  };
  const status = optionalText(value) ?? fallbackByKind[responseKind] ?? RESOLUTION_RESPONSE_STATUSES.RESOLVED;
  return normalizeSafeStatusState(status) ?? status;
}

function normalizeReadModelRefreshTiming(value, fallback = READ_MODEL_REFRESH_TIMING.AFTER_MUTATION_COMMIT) {
  const normalized = normalizedKey(value);
  const aliases = {
    after_commit: READ_MODEL_REFRESH_TIMING.AFTER_MUTATION_COMMIT,
    after_transaction: READ_MODEL_REFRESH_TIMING.AFTER_MUTATION_COMMIT,
    after_mutations: READ_MODEL_REFRESH_TIMING.AFTER_MUTATION_COMMIT,
    after_next_beat: READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION,
    after_transition: READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION,
    before_response: READ_MODEL_REFRESH_TIMING.BEFORE_PLAYER_RESPONSE,
    recovery: READ_MODEL_REFRESH_TIMING.RECOVERY_ONLY,
  };
  if (aliases[normalized]) {
    return aliases[normalized];
  }
  return normalizeEnumValue(value, Object.values(READ_MODEL_REFRESH_TIMING), fallback);
}

function markerSourceId(input = {}) {
  return optionalId(
    input.source_content_id,
    input.sourceContentId,
    input.source_scene_id,
    input.sourceSceneId,
    input.source_dialogue_id,
    input.sourceDialogueId
  );
}

function stablePreviewToken(parts = []) {
  const token = normalizeArray(parts)
    .map((part) => optionalText(part))
    .filter(Boolean)
    .join('|');
  return token || null;
}

function alignmentFieldsFromRequest(requestLike = {}) {
  const request = createResolutionRequest(requestLike);
  return {
    interaction_domain: request.interaction_domain,
    action_window_id: request.action_window_id,
    source_scene_id: request.source_scene_id,
    source_location_id: request.source_location_id,
    source_dialogue_id: request.source_dialogue_id,
    selected_option_id: request.selected_option_id,
    selected_option_kind: request.selected_option_kind,
    domain_option_kind: request.domain_option_kind,
    context_version: request.context_version,
  };
}

function activeStateField(activeState = {}, ...keys) {
  const source = normalizeObject(activeState);
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return null;
}

function activeStateAlignmentMarkers(activeState = {}) {
  const source = normalizeObject(activeState);
  return {
    interaction_domain: normalizeSharedInteractionDomain(
      activeStateField(source, 'interaction_domain', 'interactionDomain', 'domain')
    ),
    action_window_id: optionalId(activeStateField(source, 'action_window_id', 'actionWindowId')),
    source_scene_id: optionalId(
      activeStateField(source, 'source_scene_id', 'sourceSceneId', 'current_scene_id', 'currentSceneId', 'scene_id', 'sceneId')
    ),
    source_location_id: optionalId(
      activeStateField(source, 'source_location_id', 'sourceLocationId', 'current_location_id', 'currentLocationId', 'location_id', 'locationId')
    ),
    source_dialogue_id: optionalId(
      activeStateField(source, 'source_dialogue_id', 'sourceDialogueId', 'active_dialogue_id', 'activeDialogueId', 'dialogue_id', 'dialogueId')
    ),
    context_version: optionalId(
      activeStateField(source, 'context_version', 'contextVersion', 'interaction_state_version', 'interactionStateVersion')
    ),
    action_window_state: optionalText(
      activeStateField(source, 'action_window_state', 'actionWindowState', 'window_state', 'windowState')
    ),
    endpoint_reached: normalizeBoolean(activeStateField(source, 'endpoint_reached', 'endpointReached'), false),
  };
}

function isActionWindowOpen(state = {}) {
  const active = normalizeObject(state);
  const status = normalizedKey(
    active.action_window_state ?? active.actionWindowState ?? active.window_state ?? active.windowState
  );
  if (!status) {
    return true;
  }
  return ['open', 'action_needed', 'active', 'available'].includes(status);
}

function compareMarkerField(field, expected, actual, mismatches) {
  if (!expected || !actual) {
    return;
  }
  if (String(expected) !== String(actual)) {
    mismatches.push({
      field,
      expected: String(expected),
      actual: String(actual),
      reason: 'context_mismatch',
    });
  }
}

function expectationKindsForOutputKind(kind) {
  const normalized = normalizedKey(kind);
  if (normalized === RESOLUTION_OUTCOME_MARKER_KINDS.KNOWLEDGE) {
    return [PREVIEW_EXPECTATION_KINDS.DISCOVERY];
  }
  if (normalized === RESOLUTION_OUTCOME_MARKER_KINDS.OBJECTIVE) {
    return [PREVIEW_EXPECTATION_KINDS.PROGRESS];
  }
  if (normalized === RESOLUTION_OUTCOME_MARKER_KINDS.TRANSITION) {
    return [PREVIEW_EXPECTATION_KINDS.TRANSITION];
  }
  if (normalized === RESOLUTION_OUTCOME_MARKER_KINDS.RELATIONSHIP_OR_SOCIAL_WRITE) {
    return [PREVIEW_EXPECTATION_KINDS.SOCIAL_CONSEQUENCE];
  }
  if (normalized === RESOLUTION_OUTCOME_MARKER_KINDS.ENDPOINT) {
    return [PREVIEW_EXPECTATION_KINDS.ENDPOINT];
  }
  if (normalized === RESOLUTION_OUTCOME_MARKER_KINDS.RECOVERY) {
    return [PREVIEW_EXPECTATION_KINDS.RECOVERY];
  }
  return [normalized].filter(Boolean);
}

export const BEAT_RESOLUTION_VOCABULARY = Object.freeze({
  beat: 'One player-facing opportunity to inspect, choose, resolve, and continue inside an active interaction state.',
  interaction: 'A domain-owned playable unit such as an exploration scene or dialogue conversation.',
  interaction_domain: 'The neutral shared domain key. Current supported domains are exploration and dialogue.',
  interaction_adapter: 'A domain-specific boundary that supplies authored option, outcome, output, transition, and trace details to the shared pipeline.',
  preview_request: 'A non-mutating request that asks what a selected option would mean before commitment.',
  commit_request: 'A mutating request that commits a selected authored option for deterministic resolution.',
  action_window: 'The currently valid commitment window for the active beat or interaction.',
  active_interaction_state: 'The current runtime scene, dialogue, action-window, and version context used to validate a request.',
  deterministic_authored_outcome: 'The selected outcome from authored content and deterministic checks or policy, never generated narration.',
  output_bundle: 'The normalized collection of knowledge, objective, history, latest development, state, transition, record, transcript, archive/search, and debug outputs.',
  mutation_plan: 'The ordered pre-application plan for state writes, dedupe/idempotency markers, transition writes, action-window writes, and refresh hooks.',
  transition_decision: 'The normalized decision to stay, move, enter or exit dialogue, reach endpoint, mark recovery, or hold a future-supported handoff.',
  next_beat_decision: 'The normalized decision for the next player-playable action window, review-only state, endpoint state, or recovery state.',
  player_result_bundle: 'The deterministic player-safe summary sections returned after resolution.',
  player_projection: 'The visibility-filtered player-safe response.',
  gm_dev_projection: 'The authorized internal response with trace, routing, checks, and provenance.',
  resolution_trace: 'The GM/dev envelope describing request, validation, outcome, outputs, mutation plan, transition, next beat, and recovery details.',
  recovery_needed_envelope: 'The structured recovery classification and safe player/GM-dev diagnostic payload for malformed, stale, duplicate, partial, or interrupted resolution.',
  idempotency_key: 'The client or runtime key used to reject or replay duplicate commit attempts safely.',
  stale_request: 'A request whose context no longer matches the active interaction state.',
  duplicate_request: 'A repeated request that must not duplicate state writes or outputs.',
  endpoint_state: 'A review-only or awaiting-support state reached at the current end of supported play.',
});

export function createResolutionRequest(input = {}) {
  const rawContext = normalizeObject(input.context ?? input.interaction_context ?? input.interactionContext);
  const interactionDomain = normalizeSharedInteractionDomain(
    alias(input, 'interaction_domain', 'interactionDomain') ??
      input.domain ??
      rawContext.interaction_domain ??
      rawContext.interactionDomain ??
      rawContext.domain
  );
  if (!interactionDomain) {
    throw new Error('ResolutionRequest requires a valid interaction domain');
  }

  const context = createInteractionContext({
    ...input,
    ...rawContext,
    interaction_domain: interactionDomain,
  });

  return {
    request_kind: normalizeRequestKind(input.request_kind ?? input.requestKind ?? input.kind),
    interaction_domain: interactionDomain,
    context,
    user_id: optionalId(input.user_id, input.userId, context.user_id),
    character_id: optionalId(input.character_id, input.characterId, context.character_id),
    campaign_id: optionalId(input.campaign_id, input.campaignId, context.campaign_id),
    adventure_id: optionalId(input.adventure_id, input.adventureId, context.adventure_id),
    action_window_id: optionalId(input.action_window_id, input.actionWindowId, context.action_window_id),
    source_scene_id: optionalId(input.source_scene_id, input.sourceSceneId, context.current_scene_id),
    source_location_id: optionalId(input.source_location_id, input.sourceLocationId, context.current_location_id),
    source_dialogue_id: optionalId(input.source_dialogue_id, input.sourceDialogueId, context.active_dialogue_id),
    selected_option_id: optionalId(
      input.selected_option_id,
      input.selectedOptionId,
      input.option_id,
      input.optionId,
      input.action_id,
      input.actionId,
      input.move_id,
      input.moveId
    ),
    selected_option_kind: normalizeOptionKind(
      input.selected_option_kind ?? input.selectedOptionKind ?? input.option_kind ?? input.optionKind
    ),
    domain_option_kind: optionalText(input.domain_option_kind, input.domainOptionKind, input.domain_kind, input.domainKind),
    client_preview_token: optionalId(
      input.client_preview_token,
      input.clientPreviewToken,
      input.preview_id,
      input.previewId
    ),
    context_version: optionalId(input.context_version, input.contextVersion, context.interaction_state_version),
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    request_id: optionalId(input.request_id, input.requestId, context.request_id),
    correlation_id: optionalId(input.correlation_id, input.correlationId, context.correlation_id),
    authorization_context: normalizeObject(input.authorization_context ?? input.authorizationContext),
    gm_dev_context_requested: normalizeBoolean(
      input.gm_dev_context_requested ?? input.gmDevContextRequested ?? input.include_debug ?? input.includeDebug,
      false
    ),
    request_metadata: normalizeObject(input.request_metadata ?? input.requestMetadata ?? input.metadata),
    domain_payload: normalizeObject(input.domain_payload ?? input.domainPayload),
    visibility_scope: normalizeVisibilityScope(input.visibility_scope ?? input.visibilityScope ?? context.visibility_scope, VISIBILITY_SCOPES.SYSTEM_INTERNAL),
  };
}

export function createPreviewResolutionRequest(input = {}) {
  return createResolutionRequest({
    ...input,
    request_kind: RESOLUTION_REQUEST_KINDS.PREVIEW,
  });
}

export function createCommitResolutionRequest(input = {}) {
  return createResolutionRequest({
    ...input,
    request_kind: RESOLUTION_REQUEST_KINDS.COMMIT,
  });
}

export function buildCommittedBeatDedupeKey(input = {}) {
  const explicit = optionalId(input.dedupe_key, input.dedupeKey, input.idempotency_key, input.idempotencyKey);
  if (explicit) {
    return explicit;
  }
  const output = normalizeObject(input.output);
  const outputKey = buildOutputDedupeKey(output);
  const request = input.request ? createResolutionRequest(input.request) : normalizeObject(input.source_request ?? input.sourceRequest);
  const parts = [
    optionalId(input.campaign_id, input.campaignId, request.campaign_id),
    optionalId(input.character_id, input.characterId, request.character_id),
    optionalId(input.action_window_id, input.actionWindowId, request.action_window_id),
    normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain ?? request.interaction_domain),
    optionalId(input.source_scene_id, input.sourceSceneId, request.source_scene_id),
    optionalId(input.source_dialogue_id, input.sourceDialogueId, request.source_dialogue_id),
    optionalId(input.selected_option_id, input.selectedOptionId, request.selected_option_id),
    optionalId(input.outcome_id, input.outcomeId, input.selected_outcome?.outcome_id, input.selectedOutcome?.outcomeId),
    optionalText(input.group_key, input.groupKey, input.group, input.operation_kind, input.operationKind),
    outputKey,
  ];
  return parts.filter(Boolean).join(':') || null;
}

export function createMutationDedupeMarker(input = {}) {
  return {
    dedupe_key: optionalId(input.dedupe_key, input.dedupeKey, input.key),
    group_key: optionalText(input.group_key, input.groupKey, input.group),
    output_kind: optionalText(input.output_kind, input.outputKind),
    output_id: optionalId(input.output_id, input.outputId),
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    decision: optionalText(input.decision, input.action) ?? 'planned',
    reason: optionalText(input.reason),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

function outputIdentity(output = {}) {
  return {
    output_kind: optionalText(output.output_kind, output.outputKind, output.kind),
    output_id: optionalId(
      output.output_id,
      output.outputId,
      output.knowledge_id,
      output.knowledgeId,
      output.objective_id,
      output.objectiveId,
      output.event_id,
      output.eventId,
      output.latest_development_id,
      output.latestDevelopmentId,
      output.state_key,
      output.stateKey,
      output.participant_id,
      output.participantId,
      output.completed_interaction_id,
      output.completedInteractionId,
      output.transcript_id,
      output.transcriptId,
      output.archive_entry_id,
      output.archiveEntryId,
      output.target_id,
      output.targetId
    ),
  };
}

function createMutationOperation(input = {}, context = {}) {
  const payload = normalizeObject(input.payload ?? input.output ?? input);
  const identity = outputIdentity(payload);
  const operationKind = optionalText(input.operation_kind, input.operationKind, input.kind) ?? 'apply_output';
  const groupKey = optionalText(input.group_key, input.groupKey, context.group_key, context.groupKey);
  const dedupeKey = buildCommittedBeatDedupeKey({
    ...context,
    ...input,
    group_key: groupKey,
    operation_kind: operationKind,
    output: payload,
  });
  return {
    operation_kind: operationKind,
    group_key: groupKey,
    output_kind: optionalText(input.output_kind, input.outputKind, identity.output_kind),
    output_id: optionalId(input.output_id, input.outputId, identity.output_id),
    dedupe_key: dedupeKey,
    status: optionalText(input.status) ?? MUTATION_PLAN_STATUSES.PLANNED,
    payload,
    gm_dev_metadata: normalizeObject(input.gm_dev_metadata ?? input.gmDevMetadata),
  };
}

function dedupeMutationOperations(operations = []) {
  const seen = new Map();
  const deduped = [];
  const duplicates = [];
  for (const operation of normalizeArray(operations)) {
    const normalized = createMutationOperation(operation, { group_key: operation.group_key });
    if (!normalized.dedupe_key) {
      deduped.push(normalized);
      continue;
    }
    if (seen.has(normalized.dedupe_key)) {
      duplicates.push({
        key: normalized.dedupe_key,
        kept_index: seen.get(normalized.dedupe_key),
        duplicate_index: deduped.length + duplicates.length,
        output: normalized,
      });
      continue;
    }
    seen.set(normalized.dedupe_key, deduped.length);
    deduped.push(normalized);
  }
  return {
    operations: deduped,
    duplicates,
    decisions: duplicates.map(summarizeDedupeDecisionForGmDev),
  };
}

export function createMutationWriteGroup(input = {}) {
  const group = optionalText(input.group, input.group_key, input.groupKey, input.kind);
  const orderFallback = ORDERED_MUTATION_WRITE_GROUPS.includes(group)
    ? ORDERED_MUTATION_WRITE_GROUPS.indexOf(group) + 1
    : null;
  const rawOperations = normalizeArray(input.operations).map((operation) =>
    createMutationOperation(operation, { group_key: group })
  );
  const dedupeResult = input.preserve_duplicates === true || input.preserveDuplicates === true
    ? { operations: rawOperations, duplicates: [], decisions: [] }
    : dedupeMutationOperations(rawOperations);
  return {
    group_key: group,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : orderFallback,
    operations: dedupeResult.operations,
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    dedupe_markers: [
      ...normalizeArray(input.dedupe_markers ?? input.dedupeMarkers).map(createMutationDedupeMarker),
      ...dedupeResult.decisions.map((decision) =>
        createMutationDedupeMarker({
          ...decision,
          group_key: group,
          decision: decision.action,
          reason: 'duplicate_operation',
        })
      ),
    ],
    duplicate_operations: dedupeResult.duplicates,
    transaction_boundary_hint: optionalText(input.transaction_boundary_hint, input.transactionBoundaryHint),
    recovery_policy: optionalText(input.recovery_policy, input.recoveryPolicy) ?? 'mark_recovery_needed_on_failure',
    gm_dev_metadata: normalizeObject(input.gm_dev_metadata ?? input.gmDevMetadata),
  };
}

export function createMutationPlan(input = {}) {
  const writeGroups = normalizeArray(input.write_groups ?? input.writeGroups)
    .map(createMutationWriteGroup)
    .filter((group) => group.group_key && group.operations.length > 0);
  const sortedGroups = [...writeGroups].sort((left, right) => {
    const leftOrder = Number.isFinite(Number(left.order)) ? Number(left.order) : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(Number(right.order)) ? Number(right.order) : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
  const groupDedupeMarkers = sortedGroups.flatMap((group) => group.dedupe_markers);

  return {
    plan_id: optionalId(input.plan_id, input.planId),
    request_id: optionalId(input.request_id, input.requestId),
    interaction_domain: normalizeSharedInteractionDomain(alias(input, 'interaction_domain', 'interactionDomain')),
    source_request: normalizeObject(input.source_request ?? input.sourceRequest),
    source_active_state: normalizeObject(input.source_active_state ?? input.sourceActiveState),
    selected_outcome: normalizeObject(input.selected_outcome ?? input.selectedOutcome),
    normalized_output_bundle: input.normalized_output_bundle || input.normalizedOutputBundle
      ? normalizeOutputBundle(input.normalized_output_bundle ?? input.normalizedOutputBundle)
      : null,
    player_result_bundle_reference: normalizeObject(
      input.player_result_bundle_reference ?? input.playerResultBundleReference
    ),
    canonical_order: COMMITTED_BEAT_MUTATION_ORDER,
    write_groups: sortedGroups,
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    dedupe_markers: [
      ...normalizeArray(input.dedupe_markers ?? input.dedupeMarkers).map(createMutationDedupeMarker),
      ...groupDedupeMarkers,
    ],
    transition_intent: normalizeObject(input.transition_intent ?? input.transitionIntent),
    next_beat_intent: normalizeObject(input.next_beat_intent ?? input.nextBeatIntent),
    read_model_refresh_target: normalizeObject(input.read_model_refresh_target ?? input.readModelRefreshTarget),
    status: optionalText(input.status) ?? (groupDedupeMarkers.length > 0 ? MUTATION_PLAN_STATUSES.DEDUPED : MUTATION_PLAN_STATUSES.PLANNED),
    transaction_boundary_hint:
      optionalText(input.transaction_boundary_hint, input.transactionBoundaryHint) ?? 'prefer_single_transaction',
    recovery_on_failure:
      input.recovery_on_failure || input.recoveryOnFailure
        ? createRecoveryNeededEnvelope(input.recovery_on_failure ?? input.recoveryOnFailure)
        : null,
    expected_read_model_refresh_targets: normalizeArray(
      input.expected_read_model_refresh_targets ?? input.expectedReadModelRefreshTargets
    ).map(String),
    gm_dev_trace_metadata: normalizeObject(input.gm_dev_trace_metadata ?? input.gmDevTraceMetadata),
  };
}

function mutationOperation(output, groupKey, operationKind, context = {}) {
  return createMutationOperation({
    operation_kind: operationKind,
    group_key: groupKey,
    output,
  }, context);
}

function latestDevelopmentOperations(bundle, context) {
  return bundle.latest_development_output
    ? [mutationOperation(bundle.latest_development_output, MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST, 'replace_latest_development', context)]
    : [];
}

export function createCommittedBeatMutationPlan(input = {}) {
  const request = input.request ? createCommitResolutionRequest(input.request) : null;
  const outputBundle = normalizeOutputBundle(input.output_bundle ?? input.outputBundle ?? {});
  const context = {
    request,
    interaction_domain: input.interaction_domain ?? input.interactionDomain ?? request?.interaction_domain,
    selected_outcome: input.selected_outcome ?? input.selectedOutcome,
  };
  const writeGroups = [
    {
      group: MUTATION_WRITE_GROUPS.OBJECTIVES,
      operations: outputBundle.objective_outputs.map((output) =>
        mutationOperation(output, MUTATION_WRITE_GROUPS.OBJECTIVES, 'upsert_objective', context)
      ),
    },
    {
      group: MUTATION_WRITE_GROUPS.KNOWLEDGE,
      operations: outputBundle.knowledge_outputs.map((output) =>
        mutationOperation(output, MUTATION_WRITE_GROUPS.KNOWLEDGE, 'grant_or_update_knowledge', context)
      ),
    },
    {
      group: MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST,
      operations: [
        ...outputBundle.history_outputs.map((output) =>
          mutationOperation(output, MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST, 'append_history_event', context)
        ),
        ...latestDevelopmentOperations(outputBundle, context),
      ],
    },
    {
      group: MUTATION_WRITE_GROUPS.STATE,
      operations: [
        ...outputBundle.state_writes.map((output) =>
          mutationOperation(output, MUTATION_WRITE_GROUPS.STATE, 'apply_state_write', context)
        ),
        ...outputBundle.relationship_or_social_writes.map((output) =>
          mutationOperation(output, MUTATION_WRITE_GROUPS.STATE, 'apply_relationship_or_social_write', context)
        ),
      ],
    },
    {
      group: MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES,
      operations: [
        ...outputBundle.completed_record_outputs.map((output) =>
          mutationOperation(output, MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES, 'upsert_completed_record', context)
        ),
        ...outputBundle.transcript_outputs.map((output) =>
          mutationOperation(output, MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES, 'append_transcript', context)
        ),
        ...outputBundle.archive_search_outputs.map((output) =>
          mutationOperation(output, MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES, 'upsert_archive_search_entry', context)
        ),
      ],
    },
    {
      group: MUTATION_WRITE_GROUPS.TRANSITION_ENDPOINT,
      operations: outputBundle.transition_outputs.map((output) =>
        mutationOperation(output, MUTATION_WRITE_GROUPS.TRANSITION_ENDPOINT, 'apply_transition_or_endpoint', context)
      ),
    },
    {
      group: MUTATION_WRITE_GROUPS.ACTION_WINDOW,
      operations: normalizeArray(input.action_window_operations ?? input.actionWindowOperations).map((operation) =>
        createMutationOperation(operation, { ...context, group_key: MUTATION_WRITE_GROUPS.ACTION_WINDOW })
      ),
    },
    {
      group: MUTATION_WRITE_GROUPS.READ_MODEL_REFRESH,
      operations: normalizeArray(input.read_model_refresh_operations ?? input.readModelRefreshOperations).map((operation) =>
        createMutationOperation(operation, { ...context, group_key: MUTATION_WRITE_GROUPS.READ_MODEL_REFRESH })
      ),
    },
    {
      group: MUTATION_WRITE_GROUPS.TRACE_PROVENANCE,
      operations: normalizeArray(input.trace_operations ?? input.traceOperations).map((operation) =>
        createMutationOperation(operation, { ...context, group_key: MUTATION_WRITE_GROUPS.TRACE_PROVENANCE })
      ),
    },
    ...normalizeArray(input.write_groups ?? input.writeGroups),
  ];

  return createMutationPlan({
    ...input,
    interaction_domain: input.interaction_domain ?? input.interactionDomain ?? request?.interaction_domain,
    source_request: input.source_request ?? input.sourceRequest ?? request,
    normalized_output_bundle: outputBundle,
    write_groups: writeGroups,
    expected_read_model_refresh_targets: input.expected_read_model_refresh_targets ?? input.expectedReadModelRefreshTargets,
    recovery_on_failure: input.recovery_on_failure ?? input.recoveryOnFailure ?? {
      recovery_kind: RECOVERY_NEEDED_KINDS.MUTATION_FAILED,
      failed_lifecycle_step: 'apply_mutations_in_controlled_order',
      player_safe_message: 'Something interrupted that resolution. Refresh the current scene.',
    },
  });
}

export function assertMutationPlanOrdering(planLike = {}) {
  const plan = createMutationPlan(planLike);
  const orders = plan.write_groups.map((group) => group.order ?? Number.MAX_SAFE_INTEGER);
  const sorted = [...orders].sort((left, right) => left - right);
  assertNoPlayerHiddenData(projectForPlayer({ ok: true }));
  if (orders.some((order, index) => order !== sorted[index])) {
    const error = new Error('Mutation plan write groups are not in canonical order');
    error.write_groups = plan.write_groups;
    throw error;
  }
  const readModel = plan.write_groups.find((group) => group.group_key === MUTATION_WRITE_GROUPS.READ_MODEL_REFRESH);
  const priorMutatingGroups = plan.write_groups.filter((group) =>
    [
      MUTATION_WRITE_GROUPS.OBJECTIVES,
      MUTATION_WRITE_GROUPS.KNOWLEDGE,
      MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST,
      MUTATION_WRITE_GROUPS.STATE,
      MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES,
      MUTATION_WRITE_GROUPS.TRANSITION_ENDPOINT,
      MUTATION_WRITE_GROUPS.ACTION_WINDOW,
    ].includes(group.group_key)
  );
  if (readModel && priorMutatingGroups.some((group) => Number(group.order) > Number(readModel.order))) {
    const error = new Error('Read model refresh must happen after committed write groups');
    error.write_groups = plan.write_groups;
    throw error;
  }
  return true;
}

export function createMutationIdempotencyDecision(input = {}) {
  const status = normalizeEnumValue(
    input.status ?? input.idempotency_status ?? input.idempotencyStatus,
    Object.values(MUTATION_IDEMPOTENCY_STATUSES),
    MUTATION_IDEMPOTENCY_STATUSES.CURRENT
  );
  const noMutation = status !== MUTATION_IDEMPOTENCY_STATUSES.CURRENT;
  const recoveryKindByStatus = {
    [MUTATION_IDEMPOTENCY_STATUSES.DUPLICATE]: RECOVERY_NEEDED_KINDS.DUPLICATE_REQUEST,
    [MUTATION_IDEMPOTENCY_STATUSES.STALE]: RECOVERY_NEEDED_KINDS.STALE_REQUEST,
    [MUTATION_IDEMPOTENCY_STATUSES.ENDPOINT_REVIEW_ONLY]: RECOVERY_NEEDED_KINDS.ENDPOINT_REVIEW_ONLY,
    [MUTATION_IDEMPOTENCY_STATUSES.RECOVERY_NEEDED]: RECOVERY_NEEDED_KINDS.RECOVERY_REQUIRED,
  };
  const playerSafeMessage = optionalText(input.player_safe_message, input.playerSafeMessage, input.message) ??
    (status === MUTATION_IDEMPOTENCY_STATUSES.CURRENT
      ? 'This action is current and may be resolved.'
      : 'That moment has changed. Review the current state and continue from there.');
  return {
    status,
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    dedupe_key: optionalId(input.dedupe_key, input.dedupeKey),
    no_mutation: noMutation,
    safe_to_retry: normalizeBoolean(input.safe_to_retry ?? input.safeToRetry, status !== MUTATION_IDEMPOTENCY_STATUSES.CURRENT),
    player_safe_message: playerSafeMessage,
    recovery_needed: noMutation
      ? createRecoveryNeededEnvelope({
          recovery_kind: recoveryKindByStatus[status] ?? RECOVERY_NEEDED_KINDS.RECOVERY_REQUIRED,
          player_safe_message: playerSafeMessage,
          recovery_action: input.recovery_action ?? input.recoveryAction ?? RECOVERY_ACTIONS.REFRESH_CURRENT_SCENE,
          failed_lifecycle_step: optionalText(input.failed_lifecycle_step, input.failedLifecycleStep) ?? 'detect_stale_duplicate_idempotency',
          diagnostics: normalizeObject(input.diagnostics),
        })
      : null,
    gm_dev_diagnostics: {
      status,
      reason: optionalText(input.reason),
      current_state_marker: normalizeObject(input.current_state_marker ?? input.currentStateMarker),
      submitted_state_marker: normalizeObject(input.submitted_state_marker ?? input.submittedStateMarker),
      visibility_scope: VISIBILITY_SCOPES.GM_DEV,
    },
  };
}

export function createMutationApplicationResult(input = {}) {
  const plan = createMutationPlan(input.mutation_plan ?? input.mutationPlan ?? input.plan ?? input);
  const failedGroupKey = optionalText(input.failed_group_key, input.failedGroupKey);
  const failedOperationKey = optionalId(input.failed_operation_dedupe_key, input.failedOperationDedupeKey);
  const applied = [];
  const skipped = [];
  let failed = null;

  for (const group of plan.write_groups) {
    if (!failed && failedGroupKey && group.group_key === failedGroupKey) {
      failed = {
        group_key: group.group_key,
        operation_dedupe_key: failedOperationKey,
        reason: optionalText(input.failure_reason, input.failureReason) ?? 'simulated_write_failure',
      };
      skipped.push(...plan.write_groups.slice(plan.write_groups.indexOf(group)).map((entry) => entry.group_key));
      break;
    }
    applied.push(group.group_key);
  }

  const status = failed ? MUTATION_APPLICATION_STATUSES.RECOVERY_NEEDED : MUTATION_APPLICATION_STATUSES.APPLIED;
  return {
    status,
    plan_id: plan.plan_id,
    transaction_boundary_used:
      optionalText(input.transaction_boundary_used, input.transactionBoundaryUsed) ??
      (input.transaction_supported === false || input.transactionSupported === false ? 'not_available' : plan.transaction_boundary_hint),
    applied_write_groups: applied,
    skipped_write_groups: skipped,
    failed_write_group: failed,
    read_model_refresh_allowed: !failed,
    recovery_needed: failed
      ? createRecoveryNeededEnvelope({
          ...(plan.recovery_on_failure ?? {}),
          recovery_kind: RECOVERY_NEEDED_KINDS.MUTATION_FAILED,
          failed_lifecycle_step: failed.group_key,
          partial_writes_known: applied,
          diagnostics: {
            failed_group_key: failed.group_key,
            failed_operation_dedupe_key: failed.operation_dedupe_key,
            skipped_write_groups: skipped,
          },
        })
      : null,
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createMutationSafetyDiagnostics(input = {}) {
  const plan = input.mutation_plan || input.mutationPlan
    ? createMutationPlan(input.mutation_plan ?? input.mutationPlan)
    : null;
  const idempotency = input.idempotency_decision || input.idempotencyDecision
    ? createMutationIdempotencyDecision(input.idempotency_decision ?? input.idempotencyDecision)
    : null;
  const mutationResultInput = normalizeObject(input.mutation_result ?? input.mutationResult);
  const application = Object.keys(mutationResultInput).length > 0
    ? mutationResultInput.applied_write_groups || mutationResultInput.appliedWriteGroups
      ? mutationResultInput
      : createMutationApplicationResult({
          mutationPlan: plan ?? mutationResultInput.mutation_plan ?? mutationResultInput.mutationPlan ?? mutationResultInput,
          ...mutationResultInput,
        })
    : null;
  return {
    mutation_plan: plan,
    write_group_order: plan ? plan.write_groups.map((group) => group.group_key) : [],
    dedupe_decisions: plan ? plan.dedupe_markers : [],
    idempotency_decision: idempotency,
    transaction_boundary: optionalText(input.transaction_boundary, input.transactionBoundary, plan?.transaction_boundary_hint),
    mutation_result: application,
    action_window_lifecycle_decision: normalizeObject(
      input.action_window_lifecycle_decision ?? input.actionWindowLifecycleDecision
    ),
    read_model_refresh_target: normalizeObject(input.read_model_refresh_target ?? input.readModelRefreshTarget),
    warnings: normalizeArray(input.warnings).map(String),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createTransitionDecision(input = {}) {
  return {
    kind: normalizeTransitionDecisionKind(input.kind ?? input.transition_kind ?? input.transitionKind),
    status: normalizeTransitionStatus(input.status),
    target_type: normalizeTransitionTargetType(input.target_type ?? input.targetType),
    target_id: optionalId(input.target_id, input.targetId, input.scene_id, input.sceneId, input.dialogue_id, input.dialogueId),
    player_label: optionalText(input.player_label, input.playerLabel, input.label),
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary),
    safe_status_label: optionalText(input.safe_status_label, input.safeStatusLabel),
    gm_dev_routing: normalizeObject(input.gm_dev_routing ?? input.gmDevRouting),
    internal_routing_status: optionalText(input.internal_routing_status, input.internalRoutingStatus),
    future_supported_internal: normalizeObject(input.future_supported_internal ?? input.futureSupportedInternal),
    source_interaction_domain:
      normalizeSharedInteractionDomain(input.source_interaction_domain ?? input.sourceInteractionDomain) ?? null,
    source_scene_id: optionalId(input.source_scene_id, input.sourceSceneId),
    source_dialogue_id: optionalId(input.source_dialogue_id, input.sourceDialogueId),
    source_action_window_id: optionalId(input.source_action_window_id, input.sourceActionWindowId),
    adapter_proposal: normalizeObject(input.adapter_proposal ?? input.adapterProposal),
    output_transition: normalizeObject(input.output_transition ?? input.outputTransition),
    requires_next_beat: normalizeBoolean(input.requires_next_beat ?? input.requiresNextBeat, true),
    selected_rule: optionalText(input.selected_rule, input.selectedRule),
    warnings: normalizeArray(input.warnings).map(String),
    visibility_metadata: normalizeObject(input.visibility_metadata ?? input.visibilityMetadata),
  };
}

export function createNextBeatDecision(input = {}) {
  return {
    kind: normalizeNextBeatDecisionKind(input.kind ?? input.next_beat_kind ?? input.nextBeatKind),
    action_window_id: optionalId(input.action_window_id, input.actionWindowId),
    action_window_kind: optionalText(input.action_window_kind, input.actionWindowKind),
    scene_id: optionalId(input.scene_id, input.sceneId),
    dialogue_id: optionalId(input.dialogue_id, input.dialogueId),
    endpoint_status: normalizeSafeStatusState(input.endpoint_status ?? input.endpointStatus),
    player_label: optionalText(input.player_label, input.playerLabel, input.label),
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary),
    review_only: normalizeBoolean(input.review_only ?? input.reviewOnly, false),
    selected_rule: optionalText(input.selected_rule, input.selectedRule),
    keep_existing_window: normalizeBoolean(input.keep_existing_window ?? input.keepExistingWindow, false),
    opens_action_window: normalizeBoolean(input.opens_action_window ?? input.opensActionWindow, false),
    closes_action_window: normalizeBoolean(input.closes_action_window ?? input.closesActionWindow, false),
    recovery_needed: normalizeBoolean(input.recovery_needed ?? input.recoveryNeeded, false),
    warnings: normalizeArray(input.warnings).map(String),
    gm_dev_details: normalizeObject(input.gm_dev_details ?? input.gmDevDetails),
  };
}

function firstTransitionOutput(outputBundleLike) {
  if (!outputBundleLike) {
    return null;
  }
  const bundle = normalizeOutputBundle(outputBundleLike);
  return bundle.transition_outputs[0] ?? null;
}

function hasDecisionInput(input = {}) {
  return Object.keys(normalizeObject(input)).length > 0;
}

function kindForTransitionOutput(output = {}, interactionDomain = null) {
  const targetType = normalizeTransitionTargetType(output.target_type ?? output.targetType);
  const status = normalizeTransitionStatus(output.status);
  if (
    status === TRANSITION_OUTPUT_STATUSES.FUTURE_SUPPORTED ||
    [
      TRANSITION_TARGET_TYPES.COMBAT,
      TRANSITION_TARGET_TYPES.COMBAT_PENDING,
      TRANSITION_TARGET_TYPES.FUTURE_SUPPORTED,
    ].includes(targetType)
  ) {
    return TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED;
  }
  if ([TRANSITION_OUTPUT_STATUSES.UNAVAILABLE, TRANSITION_OUTPUT_STATUSES.BLOCKED].includes(status)) {
    return TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED;
  }
  if (targetType === TRANSITION_TARGET_TYPES.DIALOGUE) {
    return TRANSITION_DECISION_KINDS.ENTER_DIALOGUE;
  }
  if ([TRANSITION_TARGET_TYPES.SCENE, TRANSITION_TARGET_TYPES.LOCATION].includes(targetType)) {
    return TRANSITION_DECISION_KINDS.SCENE_TRANSITION;
  }
  if (interactionDomain === RESOLUTION_INTERACTION_DOMAINS.DIALOGUE) {
    return TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE;
  }
  return TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE;
}

export function createTransitionOrchestrationDecision(input = {}) {
  const request = input.request ? createResolutionRequest(input.request) : null;
  const interactionDomain =
    normalizeSharedInteractionDomain(
      input.interaction_domain ??
        input.interactionDomain ??
        request?.interaction_domain
    ) ?? null;
  const outputTransition = firstTransitionOutput(input.output_bundle ?? input.outputBundle);
  const explicitDecision = normalizeObject(input.transition_decision ?? input.transitionDecision);
  const adapterProposal = normalizeObject(
    input.adapter_transition_proposal ??
      input.adapterTransitionProposal ??
      input.transition_proposal ??
      input.transitionProposal
  );
  const proposal = hasDecisionInput(explicitDecision)
    ? explicitDecision
    : hasDecisionInput(adapterProposal)
      ? adapterProposal
      : outputTransition ?? {};
  const recoveryRequested =
    input.recovery_needed === true ||
    input.recoveryNeeded === true ||
    hasDecisionInput(input.recovery_envelope ?? input.recoveryEnvelope);
  const unavailableRequested =
    input.unavailable === true ||
    input.unavailable_locked === true ||
    input.unavailableLocked === true ||
    ['unavailable', 'locked', 'blocked'].includes(normalizedKey(input.status));

  if (recoveryRequested) {
    return createTransitionDecision({
      kind: TRANSITION_DECISION_KINDS.RECOVERY_NEEDED,
      status: TRANSITION_OUTPUT_STATUSES.BLOCKED,
      target_type: TRANSITION_TARGET_TYPES.NONE,
      player_label: input.player_label ?? input.playerLabel ?? 'Review the current state',
      player_summary: input.player_summary ?? input.playerSummary ?? 'The beat needs a safe recovery before play continues.',
      safe_status_label: 'Recovery needed',
      source_interaction_domain: interactionDomain,
      source_scene_id: input.source_scene_id ?? input.sourceSceneId ?? request?.source_scene_id,
      source_dialogue_id: input.source_dialogue_id ?? input.sourceDialogueId ?? request?.source_dialogue_id,
      source_action_window_id: input.source_action_window_id ?? input.sourceActionWindowId ?? request?.action_window_id,
      adapter_proposal: adapterProposal,
      output_transition: outputTransition ?? {},
      requires_next_beat: false,
      selected_rule: 'recovery_blocks_next_beat',
      warnings: input.warnings,
    });
  }

  if (unavailableRequested) {
    return createTransitionDecision({
      kind: TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED,
      status: TRANSITION_OUTPUT_STATUSES.UNAVAILABLE,
      target_type: TRANSITION_TARGET_TYPES.NONE,
      player_label: input.player_label ?? input.playerLabel ?? 'Choose another approach',
      player_summary: input.player_summary ?? input.playerSummary ?? 'That option is not available from the current state.',
      safe_status_label: 'Option unavailable',
      source_interaction_domain: interactionDomain,
      source_scene_id: input.source_scene_id ?? input.sourceSceneId ?? request?.source_scene_id,
      source_dialogue_id: input.source_dialogue_id ?? input.sourceDialogueId ?? request?.source_dialogue_id,
      source_action_window_id: input.source_action_window_id ?? input.sourceActionWindowId ?? request?.action_window_id,
      adapter_proposal: adapterProposal,
      output_transition: outputTransition ?? {},
      requires_next_beat: false,
      selected_rule: 'unavailable_preserves_current_state',
      warnings: input.warnings,
    });
  }

  const selectedKind = normalizeTransitionDecisionKind(
    proposal.kind ??
      proposal.transition_kind ??
      proposal.transitionKind ??
      (outputTransition ? kindForTransitionOutput(outputTransition, interactionDomain) : null),
    interactionDomain === RESOLUTION_INTERACTION_DOMAINS.DIALOGUE
      ? TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE
      : TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE
  );
  const targetType = normalizeTransitionTargetType(
    proposal.target_type ??
      proposal.targetType ??
      outputTransition?.target_type ??
      outputTransition?.targetType,
    selectedKind === TRANSITION_DECISION_KINDS.ENTER_DIALOGUE
      ? TRANSITION_TARGET_TYPES.DIALOGUE
      : selectedKind === TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED ||
          selectedKind === TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF
        ? TRANSITION_TARGET_TYPES.FUTURE_SUPPORTED
        : TRANSITION_TARGET_TYPES.NONE
  );
  const status = proposal.status ??
    outputTransition?.status ??
    (selectedKind === TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED ||
    selectedKind === TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF
      ? TRANSITION_OUTPUT_STATUSES.FUTURE_SUPPORTED
      : TRANSITION_OUTPUT_STATUSES.LIVE);

  return createTransitionDecision({
    ...proposal,
    kind: selectedKind,
    status,
    target_type: targetType,
    target_id: optionalId(
      proposal.target_id,
      proposal.targetId,
      proposal.scene_id,
      proposal.sceneId,
      proposal.dialogue_id,
      proposal.dialogueId,
      outputTransition?.target_id,
      outputTransition?.targetId
    ),
    player_label: optionalText(proposal.player_label, proposal.playerLabel, outputTransition?.player_label, input.player_label),
    player_summary: optionalText(
      proposal.player_summary,
      proposal.playerSummary,
      outputTransition?.player_summary,
      input.player_summary
    ),
    gm_dev_routing: {
      ...normalizeObject(outputTransition?.gm_dev_routing),
      ...normalizeObject(proposal.gm_dev_routing ?? proposal.gmDevRouting),
    },
    future_supported_internal: normalizeObject(
      proposal.future_supported_internal ?? proposal.futureSupportedInternal ?? outputTransition?.future_supported_internal
    ),
    source_interaction_domain: interactionDomain,
    source_scene_id: input.source_scene_id ?? input.sourceSceneId ?? request?.source_scene_id,
    source_dialogue_id: input.source_dialogue_id ?? input.sourceDialogueId ?? request?.source_dialogue_id,
    source_action_window_id: input.source_action_window_id ?? input.sourceActionWindowId ?? request?.action_window_id,
    adapter_proposal: adapterProposal,
    output_transition: outputTransition ?? {},
    requires_next_beat: ![
      TRANSITION_DECISION_KINDS.ENDPOINT,
      TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED,
      TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF,
    ].includes(selectedKind),
    selected_rule: optionalText(input.selected_rule, input.selectedRule) ?? 'adapter_or_output_transition_normalized',
    warnings: input.warnings,
  });
}

export function selectNextBeatDecision(input = {}) {
  const transition = createTransitionDecision(input.transition_decision ?? input.transitionDecision ?? {});
  const adapterProposal = normalizeObject(
    input.adapter_next_beat_proposal ??
      input.adapterNextBeatProposal ??
      input.next_beat_proposal ??
      input.nextBeatProposal
  );
  const explicit = normalizeObject(input.next_beat_decision ?? input.nextBeatDecision);
  const proposal = hasDecisionInput(explicit) ? explicit : adapterProposal;
  const sourceSceneId = optionalId(input.source_scene_id, input.sourceSceneId, transition.source_scene_id);
  const sourceDialogueId = optionalId(input.source_dialogue_id, input.sourceDialogueId, transition.source_dialogue_id);
  const targetSceneId = [TRANSITION_TARGET_TYPES.SCENE, TRANSITION_TARGET_TYPES.LOCATION].includes(transition.target_type)
    ? transition.target_id
    : sourceSceneId;
  const targetDialogueId = transition.target_type === TRANSITION_TARGET_TYPES.DIALOGUE
    ? transition.target_id
    : sourceDialogueId;
  const forcedKinds = {
    [TRANSITION_DECISION_KINDS.RECOVERY_NEEDED]: {
      kind: NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED,
      selected_rule: 'recovery_blocks_new_action_window',
      recovery_needed: true,
      player_label: 'Refresh the current state',
      player_summary: 'The beat needs a safe recovery before play continues.',
    },
    [TRANSITION_DECISION_KINDS.UNAVAILABLE]: {
      kind: NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
      selected_rule: 'unavailable_preserves_current_window',
      player_label: 'Choose another approach',
      player_summary: 'That option is not available from the current state.',
    },
    [TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED]: {
      kind: NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
      selected_rule: 'unavailable_preserves_current_window',
      player_label: 'Choose another approach',
      player_summary: 'That option is not available from the current state.',
    },
    [TRANSITION_DECISION_KINDS.ENDPOINT]: {
      kind: NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
      selected_rule: 'endpoint_is_review_only',
      endpoint_status: 'awaiting_support',
      review_only: true,
      player_label: 'Review the current state',
      player_summary: 'You have reached the current endpoint for this slice.',
    },
    [TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED]: {
      kind: NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY,
      selected_rule: 'future_supported_is_review_only',
      endpoint_status: 'awaiting_support',
      review_only: true,
      player_label: 'Review the current state',
      player_summary: 'The next unsupported system is safely held for later support.',
    },
    [TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF]: {
      kind: NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY,
      selected_rule: 'future_supported_handoff_is_review_only',
      endpoint_status: 'awaiting_support',
      review_only: true,
      player_label: 'Review the current state',
      player_summary: 'The next unsupported system is safely held for later support.',
    },
  };
  if (forcedKinds[transition.kind]) {
    return createNextBeatDecision({
      ...forcedKinds[transition.kind],
      scene_id: targetSceneId,
      dialogue_id: targetDialogueId,
      closes_action_window: true,
      gm_dev_details: {
        transition_kind: transition.kind,
        target_type: transition.target_type,
        target_id: transition.target_id,
        adapter_proposal: adapterProposal,
      },
    });
  }

  if (hasDecisionInput(proposal) && proposal.kind) {
    const proposed = createNextBeatDecision(proposal);
    return createNextBeatDecision({
      ...proposed,
      selected_rule: proposed.selected_rule ?? 'adapter_next_beat_proposal',
      scene_id: proposed.scene_id ?? targetSceneId,
      dialogue_id: proposed.dialogue_id ?? targetDialogueId,
      gm_dev_details: {
        ...proposed.gm_dev_details,
        transition_kind: transition.kind,
        adapter_proposal: adapterProposal,
      },
    });
  }

  if (
    [TRANSITION_DECISION_KINDS.ENTER_DIALOGUE, TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE].includes(transition.kind)
  ) {
    return createNextBeatDecision({
      kind: NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW,
      dialogue_id: targetDialogueId,
      action_window_kind: 'dialogue',
      opens_action_window: true,
      player_label: transition.player_label ?? 'Continue the conversation',
      player_summary: transition.player_summary ?? 'Dialogue options are available.',
      selected_rule: 'dialogue_transition_opens_dialogue_window',
      gm_dev_details: {
        transition_kind: transition.kind,
        target_dialogue_id: targetDialogueId,
        adapter_proposal: adapterProposal,
      },
    });
  }

  if (transition.kind === TRANSITION_DECISION_KINDS.NO_TRANSITION && normalizeBoolean(input.existing_window_valid, false)) {
    return createNextBeatDecision({
      kind: NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
      action_window_id: optionalId(input.action_window_id, input.actionWindowId, transition.source_action_window_id),
      scene_id: targetSceneId,
      action_window_kind: 'exploration',
      keep_existing_window: true,
      player_label: transition.player_label ?? 'Keep going',
      player_summary: transition.player_summary ?? 'The current options remain available.',
      selected_rule: 'no_transition_keeps_existing_valid_window',
    });
  }

  return createNextBeatDecision({
    kind: NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW,
    scene_id: targetSceneId,
    action_window_kind: 'exploration',
    opens_action_window: true,
    player_label: transition.player_label ?? 'Choose your next action',
    player_summary: transition.player_summary ?? 'Exploration options are available.',
    selected_rule: 'exploration_transition_opens_exploration_window',
    gm_dev_details: {
      transition_kind: transition.kind,
      target_scene_id: targetSceneId,
      adapter_proposal: adapterProposal,
    },
  });
}

export function assertTransitionResultAlignment(input = {}) {
  const transition = createTransitionDecision(input.transition_decision ?? input.transitionDecision ?? {});
  const nextBeat = createNextBeatDecision(input.next_beat_decision ?? input.nextBeatDecision ?? {});
  const errors = [];
  const nextKind = nextBeat.kind;
  const dialogueNext = [
    NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW,
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  ];
  const explorationNext = [
    NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW,
    NEXT_BEAT_DECISION_KINDS.KEEP_EXISTING_WINDOW_IF_VALID,
  ];
  const reviewNext = [
    NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
    NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF,
    NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY,
    NEXT_BEAT_DECISION_KINDS.NO_ACTION_WINDOW,
  ];
  const recoveryNext = [
    NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED,
    NEXT_BEAT_DECISION_KINDS.NO_ACTION_WINDOW,
  ];
  const unavailableNext = [
    NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE,
    NEXT_BEAT_DECISION_KINDS.NO_ACTION_WINDOW,
  ];

  if ([TRANSITION_DECISION_KINDS.ENTER_DIALOGUE, TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE].includes(transition.kind)) {
    if (!dialogueNext.includes(nextKind)) {
      errors.push(`dialogue transition ${transition.kind} must select a dialogue next beat`);
    }
  } else if (
    [
      TRANSITION_DECISION_KINDS.NO_TRANSITION,
      TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
      TRANSITION_DECISION_KINDS.SCENE_TRANSITION,
      TRANSITION_DECISION_KINDS.MOVE_TO_SCENE,
      TRANSITION_DECISION_KINDS.EXIT_DIALOGUE,
      TRANSITION_DECISION_KINDS.RETURN_TO_EXPLORATION,
    ].includes(transition.kind)
  ) {
    if (!explorationNext.includes(nextKind)) {
      errors.push(`exploration transition ${transition.kind} must select an exploration next beat`);
    }
  } else if ([TRANSITION_DECISION_KINDS.ENDPOINT, TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED, TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF].includes(transition.kind)) {
    if (!reviewNext.includes(nextKind) || nextBeat.review_only !== true) {
      errors.push(`endpoint transition ${transition.kind} must select a review-only next beat`);
    }
  } else if (transition.kind === TRANSITION_DECISION_KINDS.RECOVERY_NEEDED && !recoveryNext.includes(nextKind)) {
    errors.push('recovery transition must not open a normal action window');
  } else if ([TRANSITION_DECISION_KINDS.UNAVAILABLE, TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED].includes(transition.kind) && !unavailableNext.includes(nextKind)) {
    errors.push('unavailable transition must preserve current state without opening unsafe windows');
  }

  const playerProjection = {
    transition: projectTransitionDecisionForPlayer(transition),
    next_beat: projectNextBeatDecisionForPlayer(nextBeat),
    result: createPlayerResultBundle(input.player_result_bundle ?? input.playerResultBundle ?? {}),
  };
  assertNoPlayerHiddenData(playerProjection);
  if (errors.length > 0) {
    throw new Error(`Transition/result alignment failed: ${errors.join('; ')}`);
  }
  return true;
}

export function createTransitionOrchestrationDiagnostics(input = {}) {
  const hasTransitionInput = hasDecisionInput(input.transition_decision ?? input.transitionDecision);
  const hasNextBeatInput = hasDecisionInput(input.next_beat_decision ?? input.nextBeatDecision);
  const hasAdapterInput =
    hasDecisionInput(input.adapter_transition_proposal ?? input.adapterTransitionProposal) ||
    hasDecisionInput(input.adapter_next_beat_proposal ?? input.adapterNextBeatProposal);
  if (!hasTransitionInput && !hasNextBeatInput && !hasAdapterInput) {
    return {
      transition_decision: null,
      next_beat_decision: null,
      action_window_lifecycle_decision: normalizeObject(
        input.action_window_lifecycle_decision ?? input.actionWindowLifecycleDecision
      ),
      player_transition_projection: null,
      player_next_beat_projection: null,
      adapter_transition_proposal: {},
      adapter_next_beat_proposal: {},
      alignment_status: 'not_applicable',
      alignment_errors: [],
      warnings: normalizeArray(input.warnings).map(String),
      visibility_scope: VISIBILITY_SCOPES.GM_DEV,
    };
  }
  const transition = createTransitionDecision(input.transition_decision ?? input.transitionDecision ?? {});
  const nextBeat = createNextBeatDecision(input.next_beat_decision ?? input.nextBeatDecision ?? {});
  const alignmentErrors = [];
  try {
    assertTransitionResultAlignment({
      transitionDecision: transition,
      nextBeatDecision: nextBeat,
      playerResultBundle: input.player_result_bundle ?? input.playerResultBundle,
    });
  } catch (error) {
    alignmentErrors.push(error.message);
  }
  return {
    transition_decision: transition,
    next_beat_decision: nextBeat,
    action_window_lifecycle_decision: normalizeObject(
      input.action_window_lifecycle_decision ?? input.actionWindowLifecycleDecision
    ),
    player_transition_projection: projectTransitionDecisionForPlayer(transition),
    player_next_beat_projection: projectNextBeatDecisionForPlayer(nextBeat),
    adapter_transition_proposal: normalizeObject(
      input.adapter_transition_proposal ?? input.adapterTransitionProposal
    ),
    adapter_next_beat_proposal: normalizeObject(
      input.adapter_next_beat_proposal ?? input.adapterNextBeatProposal
    ),
    alignment_status: alignmentErrors.length === 0 ? 'aligned' : 'needs_review',
    alignment_errors: alignmentErrors,
    warnings: normalizeArray(input.warnings).map(String),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createReadModelRefreshHook(input = {}) {
  return {
    refresh_kind: optionalText(input.refresh_kind, input.refreshKind, input.kind) ?? 'current_player_read_model',
    timing: normalizeReadModelRefreshTiming(input.timing),
    targets: normalizeArray(input.targets).map(String),
    include_scene: input.include_scene === undefined ? true : normalizeBoolean(input.include_scene ?? input.includeScene, true),
    include_dialogue: normalizeBoolean(input.include_dialogue ?? input.includeDialogue, false),
    include_memory: input.include_memory === undefined ? true : normalizeBoolean(input.include_memory ?? input.includeMemory, true),
    include_endpoint: normalizeBoolean(input.include_endpoint ?? input.includeEndpoint, false),
    stale_if_refresh_fails: input.stale_if_refresh_fails === undefined
      ? true
      : normalizeBoolean(input.stale_if_refresh_fails ?? input.staleIfRefreshFails, true),
  };
}

function compactProjectedPlayerObject(input = {}) {
  const compact = {};
  for (const [key, value] of Object.entries(normalizeObject(input))) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }
    compact[key] = value;
  }
  return projectForPlayer(compact);
}

function normalizeReadModelEntry(entry = {}, allowedKeys = []) {
  const source = normalizeObject(entry);
  const safe = {};
  for (const key of allowedKeys) {
    if (source[key] !== undefined && source[key] !== null) {
      safe[key] = source[key];
    }
  }
  return compactProjectedPlayerObject(safe);
}

function normalizeReadModelEntryList(entries = [], allowedKeys = []) {
  return normalizeArray(entries)
    .map((entry) => normalizeReadModelEntry(entry, allowedKeys))
    .filter((entry) => Object.keys(entry).length > 0);
}

function normalizeReadModelScene(readModel = {}) {
  const scene = normalizeObject(readModel.scene ?? readModel.current_scene ?? readModel.currentScene);
  return compactProjectedPlayerObject({
    scene_id: optionalId(scene.scene_id, scene.sceneId, scene.id),
    key: optionalId(scene.key, scene.scene_key, scene.sceneKey),
    title: optionalText(scene.title, scene.name),
    summary: optionalText(scene.summary, scene.surface_text, scene.surfaceText, scene.description),
  });
}

function normalizeReadModelDialogue(readModel = {}) {
  const dialogue = normalizeObject(
    readModel.dialogue ??
      readModel.active_dialogue ??
      readModel.activeDialogue ??
      readModel.conversation ??
      readModel.dialogue_scene ??
      readModel.dialogueScene
  );
  return compactProjectedPlayerObject({
    dialogue_id: optionalId(dialogue.dialogue_id, dialogue.dialogueId, dialogue.dialogue_scene_id, dialogue.dialogueSceneId, dialogue.id),
    title: optionalText(dialogue.title, dialogue.name, dialogue.npc_name, dialogue.npcName),
    npc_name: optionalText(dialogue.npc_name, dialogue.npcName, dialogue.speaker_name, dialogue.speakerName),
    status: normalizeSafeStatusState(dialogue.status ?? dialogue.state),
  });
}

function normalizeReadModelEndpoint(readModel = {}) {
  const endpoint = normalizeObject(readModel.endpoint ?? readModel.slice_endpoint ?? readModel.sliceEndpoint);
  return compactProjectedPlayerObject({
    state: normalizeSafeStatusState(endpoint.state ?? endpoint.status ?? endpoint.player_state ?? endpoint.playerState),
    label: optionalText(endpoint.label, endpoint.title, endpoint.player_label, endpoint.playerLabel),
    summary: optionalText(endpoint.summary, endpoint.player_summary, endpoint.playerSummary, endpoint.description),
    review_only: normalizeBoolean(endpoint.review_only ?? endpoint.reviewOnly, false),
  });
}

function normalizeReadModelActionStatus(readModel = {}) {
  const actionStatus = normalizeObject(readModel.action_status ?? readModel.actionStatus ?? readModel.status);
  return compactProjectedPlayerObject({
    state: normalizeSafeStatusState(actionStatus.state ?? actionStatus.status),
    label: optionalText(actionStatus.label, actionStatus.title),
    description: optionalText(actionStatus.description, actionStatus.summary, actionStatus.message),
  });
}

function normalizeReadModelActionWindow(readModel = {}) {
  const actionWindow = normalizeObject(readModel.action_window ?? readModel.actionWindow);
  return compactProjectedPlayerObject({
    kind: optionalText(actionWindow.kind, actionWindow.type, actionWindow.action_window_kind, actionWindow.actionWindowKind),
    status: normalizeSafeStatusState(actionWindow.status ?? actionWindow.state),
    label: optionalText(actionWindow.label, actionWindow.title),
  });
}

function actionsFromReadModel(readModel = {}) {
  const actions = [
    ...normalizeArray(readModel.available_actions ?? readModel.availableActions),
    ...normalizeArray(readModel.available_options ?? readModel.availableOptions),
  ];
  for (const affordance of normalizeArray(readModel.visible_affordances ?? readModel.visibleAffordances)) {
    actions.push(
      normalizeReadModelEntry(affordance, ['label', 'title', 'description', 'summary', 'kind', 'status'])
    );
    for (const action of normalizeArray(affordance.available_actions ?? affordance.availableActions)) {
      actions.push(action);
    }
  }
  return actions.filter((entry) => Object.keys(normalizeObject(entry)).length > 0);
}

function normalizeReadModelActions(readModel = {}) {
  return actionsFromReadModel(readModel)
    .map((entry) =>
      normalizeReadModelEntry(entry, [
        'label',
        'title',
        'description',
        'summary',
        'kind',
        'type',
        'status',
        'unavailable_label',
        'unavailableLabel',
      ])
    )
    .filter((entry) => Object.keys(entry).length > 0);
}

function dialogueEntriesFromReadModel(readModel = {}) {
  const entries = [
    ...normalizeArray(readModel.dialogue_entries ?? readModel.dialogueEntries),
    ...normalizeArray(readModel.visible_npcs ?? readModel.visibleNpcs),
    ...normalizeArray(readModel.scene_reference?.people_nearby ?? readModel.sceneReference?.peopleNearby),
    ...normalizeArray(readModel.scene_reference?.action_targets ?? readModel.sceneReference?.actionTargets),
  ];
  for (const affordance of normalizeArray(readModel.visible_affordances ?? readModel.visibleAffordances)) {
    for (const action of normalizeArray(affordance.available_actions ?? affordance.availableActions)) {
      if (action.dialogue_scene_id || action.dialogueSceneId || action.kind === 'dialogue' || action.type === 'dialogue') {
        entries.push(action);
      }
    }
  }
  return entries.filter((entry) => Object.keys(normalizeObject(entry)).length > 0);
}

function normalizeReadModelDialogueEntries(readModel = {}) {
  return dialogueEntriesFromReadModel(readModel)
    .map((entry) =>
      normalizeReadModelEntry(entry, [
        'label',
        'title',
        'name',
        'npc_name',
        'npcName',
        'description',
        'summary',
        'status',
      ])
    )
    .filter((entry) => Object.keys(entry).length > 0);
}

function normalizeReadModelKnowledge(readModel = {}) {
  return normalizeReadModelEntryList(
    [
      ...normalizeArray(readModel.knowledge ?? readModel.knowledge_entries ?? readModel.knowledgeEntries),
      ...normalizeArray(readModel.known_facts ?? readModel.knownFacts),
      ...normalizeArray(readModel.clues),
    ],
    ['knowledge_id', 'knowledgeId', 'knowledge_key', 'knowledgeKey', 'id', 'key', 'title', 'label', 'summary', 'status']
  );
}

function normalizeReadModelObjectives(readModel = {}) {
  return normalizeReadModelEntryList(
    [
      ...normalizeArray(readModel.objectives),
      ...normalizeArray(readModel.active_objectives ?? readModel.activeObjectives),
      normalizeObject(readModel.current_objective ?? readModel.currentObjective ?? readModel.objective),
    ],
    ['objective_id', 'objectiveId', 'objective_key', 'objectiveKey', 'id', 'key', 'title', 'label', 'summary', 'status', 'progress']
  );
}

function normalizeReadModelLatestDevelopment(readModel = {}) {
  const latest = normalizeObject(readModel.latest_development ?? readModel.latestDevelopment ?? readModel.recent_summary ?? readModel.recentSummary);
  return compactProjectedPlayerObject({
    title: optionalText(latest.title, latest.label),
    text: optionalText(latest.text, latest.summary, latest.description, latest.body),
  });
}

function normalizeReadModelHistory(readModel = {}) {
  return normalizeReadModelEntryList(
    normalizeArray(readModel.recent_history ?? readModel.recentHistory ?? readModel.history),
    ['history_id', 'historyId', 'id', 'title', 'label', 'text', 'summary', 'category']
  );
}

function normalizeReadModelState(readModel = {}) {
  const explicit = normalizeSafeStatusState(
    readModel.active_state_summary?.state ??
      readModel.activeStateSummary?.state ??
      readModel.state ??
      readModel.player_state ??
      readModel.playerState
  );
  if (explicit && Object.values(PLAYER_READ_MODEL_STATES).includes(explicit)) {
    return explicit;
  }
  const endpoint = normalizeReadModelEndpoint(readModel);
  const endpointState = normalizedKey(endpoint.state);
  if (endpointState === 'awaiting_support') {
    return PLAYER_READ_MODEL_STATES.AWAITING_SUPPORT;
  }
  if (endpointState || normalizedKey(endpoint.label).includes('endpoint')) {
    return PLAYER_READ_MODEL_STATES.ENDPOINT_REVIEW;
  }
  const actionStatus = normalizeReadModelActionStatus(readModel);
  const actionState = normalizedKey(actionStatus.state);
  if (actionState.includes('endpoint')) {
    return PLAYER_READ_MODEL_STATES.ENDPOINT_REVIEW;
  }
  if (actionState.includes('recovery')) {
    return PLAYER_READ_MODEL_STATES.RECOVERY_NEEDED;
  }
  if (actionState.includes('stale')) {
    return PLAYER_READ_MODEL_STATES.STALE;
  }
  if (actionState.includes('unavailable') || actionState.includes('locked')) {
    return PLAYER_READ_MODEL_STATES.UNAVAILABLE;
  }
  const dialogue = normalizeReadModelDialogue(readModel);
  if (dialogue.dialogue_id || dialogue.title) {
    return PLAYER_READ_MODEL_STATES.DIALOGUE_ACTIVE;
  }
  const scene = normalizeReadModelScene(readModel);
  if (scene.scene_id || scene.key || scene.title) {
    return PLAYER_READ_MODEL_STATES.EXPLORATION_ACTIVE;
  }
  return PLAYER_READ_MODEL_STATES.UNKNOWN;
}

export function normalizePlayerReadModel(input = {}) {
  const readModel = normalizeObject(input.read_model ?? input.readModel ?? input);
  const normalized = compactProjectedPlayerObject({
    state: normalizeReadModelState(readModel),
    interaction_domain: normalizeSharedInteractionDomain(readModel.interaction_domain ?? readModel.interactionDomain),
    scene: normalizeReadModelScene(readModel),
    dialogue: normalizeReadModelDialogue(readModel),
    endpoint: normalizeReadModelEndpoint(readModel),
    action_status: normalizeReadModelActionStatus(readModel),
    action_window: normalizeReadModelActionWindow(readModel),
    available_actions: normalizeReadModelActions(readModel),
    dialogue_entries: normalizeReadModelDialogueEntries(readModel),
    clarifying_questions: normalizeReadModelEntryList(
      normalizeArray(readModel.clarifying_questions ?? readModel.clarifyingQuestions),
      ['question_id', 'questionId', 'id', 'label', 'title', 'text', 'summary']
    ),
    committed_moves: normalizeReadModelEntryList(
      normalizeArray(readModel.committed_social_moves ?? readModel.committedSocialMoves),
      ['move_id', 'moveId', 'id', 'label', 'title', 'text', 'summary']
    ),
    exits: normalizeReadModelEntryList(
      normalizeArray(readModel.dialogue_exits ?? readModel.dialogueExits ?? readModel.exits),
      ['exit_id', 'exitId', 'id', 'label', 'title', 'text', 'summary']
    ),
    objectives: normalizeReadModelObjectives(readModel),
    current_objective: normalizeReadModelEntry(
      readModel.current_objective ?? readModel.currentObjective ?? readModel.objective,
      ['objective_id', 'objectiveId', 'objective_key', 'objectiveKey', 'id', 'key', 'title', 'label', 'summary', 'status', 'progress']
    ),
    knowledge: normalizeReadModelKnowledge(readModel),
    latest_development: normalizeReadModelLatestDevelopment(readModel),
    recent_history: normalizeReadModelHistory(readModel),
  });
  assertNoPlayerHiddenData(normalized);
  return normalized;
}

export function createActiveStateSummary(input = {}) {
  const readModel = normalizePlayerReadModel(input.read_model ?? input.readModel ?? {});
  const playerResultBundle = createPlayerResultBundle(input.player_result_bundle ?? input.playerResultBundle ?? {});
  const nextBeat = input.next_beat_decision || input.nextBeatDecision
    ? projectNextBeatDecisionForPlayer(input.next_beat_decision ?? input.nextBeatDecision)
    : null;
  const state = normalizeSafeStatusState(input.state) ?? readModel.state ?? PLAYER_READ_MODEL_STATES.UNKNOWN;
  const latestDevelopment = normalizeObject(readModel.latest_development);
  const currentObjective = normalizeObject(readModel.current_objective);
  const scene = normalizeObject(readModel.scene);
  const dialogue = normalizeObject(readModel.dialogue);
  const endpoint = normalizeObject(readModel.endpoint);
  const firstAction = normalizeObject(readModel.available_actions?.[0]);
  const firstDialogueEntry = normalizeObject(readModel.dialogue_entries?.[0]);

  const summary = compactProjectedPlayerObject({
    state,
    interaction_domain:
      readModel.interaction_domain ??
      normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain),
    where: optionalText(dialogue.title, dialogue.npc_name, endpoint.label, scene.title, scene.summary),
    what_changed: optionalText(
      playerResultBundle.result?.summary,
      playerResultBundle.result?.text,
      latestDevelopment.text,
      latestDevelopment.summary
    ),
    current_goal: optionalText(currentObjective.title, currentObjective.label, currentObjective.summary),
    available_next_step: optionalText(
      playerResultBundle.next?.label,
      playerResultBundle.next?.text,
      nextBeat?.player_label,
      nextBeat?.player_summary,
      firstDialogueEntry.label,
      firstDialogueEntry.title,
      firstAction.label,
      firstAction.title
    ),
    status_label: optionalText(endpoint.label, readModel.action_status?.label, playerResultBundle.status?.label),
    latest_development: optionalText(latestDevelopment.text, latestDevelopment.title),
    objective_label: optionalText(currentObjective.title, currentObjective.label),
    scene_title: optionalText(scene.title),
    dialogue_title: optionalText(dialogue.title, dialogue.npc_name),
  });
  assertNoPlayerHiddenData(summary);
  return summary;
}

function collectIdsFromEntries(entries = [], keys = []) {
  const ids = new Set();
  for (const entry of normalizeArray(entries)) {
    const source = normalizeObject(entry);
    for (const key of keys) {
      const id = optionalId(source[key]);
      if (id) {
        ids.add(id);
      }
    }
  }
  return ids;
}

function readModelKnowledgeIds(readModel = {}) {
  return collectIdsFromEntries(
    [
      ...normalizeArray(readModel.knowledge ?? readModel.knowledge_entries ?? readModel.knowledgeEntries),
      ...normalizeArray(readModel.known_facts ?? readModel.knownFacts),
      ...normalizeArray(readModel.clues),
    ],
    ['knowledge_id', 'knowledgeId', 'knowledge_key', 'knowledgeKey', 'id', 'key']
  );
}

function readModelObjectiveIds(readModel = {}) {
  return collectIdsFromEntries(
    [
      ...normalizeArray(readModel.objectives),
      ...normalizeArray(readModel.active_objectives ?? readModel.activeObjectives),
      normalizeObject(readModel.current_objective ?? readModel.currentObjective ?? readModel.objective),
    ],
    ['objective_id', 'objectiveId', 'objective_key', 'objectiveKey', 'id', 'key']
  );
}

function readModelSceneIds(readModel = {}) {
  const scene = normalizeObject(readModel.scene ?? readModel.current_scene ?? readModel.currentScene);
  return new Set(
    [
      optionalId(scene.scene_id, scene.sceneId, scene.id),
      optionalId(scene.key, scene.scene_key, scene.sceneKey),
      optionalId(readModel.current_scene_id, readModel.currentSceneId, readModel.scene_id, readModel.sceneId),
    ].filter(Boolean)
  );
}

function readModelDialogueIds(readModel = {}) {
  const dialogue = normalizeObject(
    readModel.dialogue ??
      readModel.active_dialogue ??
      readModel.activeDialogue ??
      readModel.conversation ??
      readModel.dialogue_scene ??
      readModel.dialogueScene
  );
  return new Set(
    [
      optionalId(dialogue.dialogue_id, dialogue.dialogueId, dialogue.dialogue_scene_id, dialogue.dialogueSceneId, dialogue.id),
      optionalId(readModel.active_dialogue_id, readModel.activeDialogueId, readModel.dialogue_scene_id, readModel.dialogueSceneId),
    ].filter(Boolean)
  );
}

function readModelHasEndpointState(readModel = {}) {
  const normalized = normalizePlayerReadModel(readModel);
  const state = normalizedKey(normalized.state);
  const endpointState = normalizedKey(normalized.endpoint?.state);
  const actionState = normalizedKey(normalized.action_status?.state);
  return [state, endpointState, actionState].some((value) =>
    value.includes('endpoint') || value.includes('awaiting') || value.includes('slice_endpoint')
  );
}

function readModelHasRecoveryState(readModel = {}) {
  const normalized = normalizePlayerReadModel(readModel);
  const state = normalizedKey(normalized.state);
  const actionState = normalizedKey(normalized.action_status?.state);
  return [state, actionState].some((value) =>
    value.includes('recovery') || value.includes('stale') || value.includes('unavailable')
  );
}

function readModelNormalActionCount(readModel = {}) {
  return normalizeReadModelActions(readModel).length + normalizeReadModelDialogueEntries(readModel).length;
}

function addAlignmentCheck(checks, { kind, label, expected = [], actual = [], aligned = false, required = true }) {
  const expectedList = normalizeArray(expected).map(String).filter(Boolean);
  const actualList = normalizeArray(actual).map(String).filter(Boolean);
  if (!required && expectedList.length === 0) {
    return;
  }
  checks.push({
    kind,
    label,
    expected: expectedList,
    actual: actualList,
    status: aligned ? RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED : RESULT_READ_MODEL_ALIGNMENT_STATUSES.NEEDS_REVIEW,
  });
}

export function createReadModelRefreshDiagnostics(input = {}) {
  const hasHookInput =
    Boolean(input.read_model_refresh_hook ?? input.readModelRefreshHook) ||
    Boolean(input.read_model_refresh_target ?? input.readModelRefreshTarget);
  const hasRefreshContext = hasHookInput ||
    hasDecisionInput(input.transition_decision ?? input.transitionDecision) ||
    hasDecisionInput(input.next_beat_decision ?? input.nextBeatDecision) ||
    Object.keys(normalizeObject(input.mutation_result ?? input.mutationResult)).length > 0;

  if (!hasRefreshContext) {
    return {
      refresh_status: RESULT_READ_MODEL_ALIGNMENT_STATUSES.NOT_APPLICABLE,
      read_model_refresh_hook: null,
      refresh_after_mutation_commit: false,
      refresh_after_next_beat_selection: false,
      warnings: normalizeArray(input.warnings).map(String),
      visibility_scope: VISIBILITY_SCOPES.GM_DEV,
    };
  }

  const hook = createReadModelRefreshHook(input.read_model_refresh_hook ?? input.readModelRefreshHook ?? {});
  const timing = hook.timing;
  const warnings = normalizeArray(input.warnings).map(String);
  if (![READ_MODEL_REFRESH_TIMING.AFTER_MUTATION_COMMIT, READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION, READ_MODEL_REFRESH_TIMING.BEFORE_PLAYER_RESPONSE, READ_MODEL_REFRESH_TIMING.RECOVERY_ONLY].includes(timing)) {
    warnings.push(`Unexpected read model refresh timing: ${timing}`);
  }

  return {
    refresh_status: warnings.length === 0
      ? RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED
      : RESULT_READ_MODEL_ALIGNMENT_STATUSES.NEEDS_REVIEW,
    read_model_refresh_hook: hook,
    read_model_refresh_target: optionalText(input.read_model_refresh_target, input.readModelRefreshTarget),
    refresh_after_mutation_commit: [
      READ_MODEL_REFRESH_TIMING.AFTER_MUTATION_COMMIT,
      READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION,
      READ_MODEL_REFRESH_TIMING.BEFORE_PLAYER_RESPONSE,
    ].includes(timing),
    refresh_after_next_beat_selection: [
      READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION,
      READ_MODEL_REFRESH_TIMING.BEFORE_PLAYER_RESPONSE,
    ].includes(timing),
    transition_decision_kind: optionalText((input.transition_decision ?? input.transitionDecision)?.kind),
    next_beat_decision_kind: optionalText((input.next_beat_decision ?? input.nextBeatDecision)?.kind),
    mutation_result_status: optionalText((input.mutation_result ?? input.mutationResult)?.status),
    warnings,
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createResultReadModelAlignmentDiagnostics(input = {}) {
  const readModelInput = normalizeObject(input.read_model ?? input.readModel);
  const hasReadModel = Object.keys(readModelInput).length > 0;
  if (!hasReadModel) {
    return {
      alignment_status: RESULT_READ_MODEL_ALIGNMENT_STATUSES.NOT_APPLICABLE,
      checks: [],
      mismatches: [],
      active_state_summary: null,
      player_read_model_projection: null,
      visibility_scope: VISIBILITY_SCOPES.GM_DEV,
    };
  }

  const outputBundle = input.output_bundle || input.outputBundle
    ? normalizeOutputBundle(input.output_bundle ?? input.outputBundle)
    : normalizeOutputBundle({});
  const playerResultBundle = createPlayerResultBundle(
    input.player_result_bundle ??
      input.playerResultBundle ??
      createOutcomeQualityResultBundle({ ...input, output_bundle: outputBundle })
  );
  const transition = input.transition_decision || input.transitionDecision
    ? createTransitionDecision(input.transition_decision ?? input.transitionDecision)
    : null;
  const nextBeat = input.next_beat_decision || input.nextBeatDecision
    ? createNextBeatDecision(input.next_beat_decision ?? input.nextBeatDecision)
    : null;
  const readModel = normalizePlayerReadModel(readModelInput);
  const checks = [];

  const expectedKnowledge = new Set([
    ...outputBundleDiscoveries(outputBundle).map((entry) => optionalId(entry.knowledge_id)).filter(Boolean),
    ...normalizeArray(playerResultBundle.discoveries).map((entry) => optionalId(entry.knowledge_id, entry.id)).filter(Boolean),
  ]);
  if (expectedKnowledge.size > 0) {
    const actualKnowledge = readModelKnowledgeIds(readModelInput);
    addAlignmentCheck(checks, {
      kind: 'knowledge',
      label: 'Result discoveries are visible in the read model',
      expected: [...expectedKnowledge],
      actual: [...actualKnowledge],
      aligned: [...expectedKnowledge].every((id) => actualKnowledge.has(id)),
    });
  }

  const expectedObjectives = new Set([
    ...outputBundleProgress(outputBundle).map((entry) => optionalId(entry.id)).filter(Boolean),
    ...normalizeArray(playerResultBundle.progress).map((entry) => optionalId(entry.id, entry.objective_id)).filter(Boolean),
  ]);
  if (expectedObjectives.size > 0) {
    const actualObjectives = readModelObjectiveIds(readModelInput);
    addAlignmentCheck(checks, {
      kind: 'objective',
      label: 'Result objective progress is visible in the read model',
      expected: [...expectedObjectives],
      actual: [...actualObjectives],
      aligned: [...expectedObjectives].every((id) => actualObjectives.has(id)),
    });
  }

  const expectedScene = optionalId(
    nextBeat?.scene_id,
    [TRANSITION_TARGET_TYPES.SCENE, TRANSITION_TARGET_TYPES.LOCATION].includes(transition?.target_type)
      ? transition?.target_id
      : null
  );
  if (expectedScene && nextBeat?.kind !== NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY) {
    const actualScenes = readModelSceneIds(readModelInput);
    addAlignmentCheck(checks, {
      kind: 'scene',
      label: 'Next exploration beat scene is visible in the read model',
      expected: [expectedScene],
      actual: [...actualScenes],
      aligned: actualScenes.has(expectedScene),
    });
  }

  const expectedDialogue = optionalId(
    nextBeat?.dialogue_id,
    transition?.target_type === TRANSITION_TARGET_TYPES.DIALOGUE ? transition?.target_id : null
  );
  if (expectedDialogue && nextBeat?.kind === NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW) {
    const actualDialogues = readModelDialogueIds(readModelInput);
    addAlignmentCheck(checks, {
      kind: 'dialogue',
      label: 'Next dialogue beat is visible in the read model',
      expected: [expectedDialogue],
      actual: [...actualDialogues],
      aligned: actualDialogues.has(expectedDialogue),
    });
  }

  const endpointExpected = Boolean(
    playerResultBundle.status?.is_endpoint ||
      nextBeat?.review_only ||
      [
        TRANSITION_DECISION_KINDS.ENDPOINT,
        TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED,
        TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF,
      ].includes(transition?.kind)
  );
  if (endpointExpected) {
    addAlignmentCheck(checks, {
      kind: 'endpoint',
      label: 'Endpoint result is represented as review-only state in the read model',
      expected: ['endpoint_or_awaiting_support'],
      actual: [readModel.state, readModel.endpoint?.state, readModel.action_status?.state].filter(Boolean),
      aligned: readModelHasEndpointState(readModelInput) && readModelNormalActionCount(readModelInput) === 0,
    });
  }

  const recoveryExpected = Boolean(
    playerResultBundle.recovery ||
      playerResultBundle.status?.is_recovery_needed ||
      [NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED, NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE].includes(nextBeat?.kind)
  );
  if (recoveryExpected) {
    addAlignmentCheck(checks, {
      kind: 'recovery',
      label: 'Recovery or unavailable result does not expose unsafe next actions',
      expected: ['safe_recovery_state_without_normal_actions'],
      actual: [readModel.state, readModel.action_status?.state, `normal_actions:${readModelNormalActionCount(readModelInput)}`],
      aligned: readModelHasRecoveryState(readModelInput) && readModelNormalActionCount(readModelInput) === 0,
    });
  }

  const refreshDiagnostics = createReadModelRefreshDiagnostics({
    read_model_refresh_hook: input.read_model_refresh_hook ?? input.readModelRefreshHook,
    read_model_refresh_target: input.read_model_refresh_target ?? input.readModelRefreshTarget,
    transition_decision: transition,
    next_beat_decision: nextBeat,
    mutation_result: input.mutation_result ?? input.mutationResult,
  });
  if (refreshDiagnostics.refresh_status !== RESULT_READ_MODEL_ALIGNMENT_STATUSES.NOT_APPLICABLE) {
    addAlignmentCheck(checks, {
      kind: 'refresh_timing',
      label: 'Read model refresh is scheduled after committed writes or next-beat selection',
      expected: ['after_mutation_commit_or_later'],
      actual: [refreshDiagnostics.read_model_refresh_hook?.timing].filter(Boolean),
      aligned: refreshDiagnostics.refresh_after_mutation_commit,
    });
  }

  const mismatches = checks.filter((check) => check.status !== RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED);
  const activeStateSummary = createActiveStateSummary({
    read_model: readModelInput,
    player_result_bundle: playerResultBundle,
    next_beat_decision: nextBeat,
  });
  assertNoPlayerHiddenData(readModel);
  assertNoPlayerHiddenData(activeStateSummary);

  return {
    alignment_status: mismatches.length === 0
      ? RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED
      : RESULT_READ_MODEL_ALIGNMENT_STATUSES.NEEDS_REVIEW,
    checks,
    mismatches,
    active_state_summary: activeStateSummary,
    player_read_model_projection: readModel,
    read_model_refresh_diagnostics: refreshDiagnostics,
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function assertResultReadModelAligned(input = {}) {
  const diagnostics = createResultReadModelAlignmentDiagnostics(input);
  if (diagnostics.alignment_status === RESULT_READ_MODEL_ALIGNMENT_STATUSES.NEEDS_REVIEW) {
    throw new Error(
      `Result/read model alignment failed: ${diagnostics.mismatches.map((check) => check.kind).join(', ')}`
    );
  }
  return true;
}

export function createPlayerResolutionView(input = {}) {
  const playerResultBundle = createPlayerResultBundle(input.player_result_bundle ?? input.playerResultBundle ?? {});
  const readModel = normalizePlayerReadModel(input.read_model ?? input.readModel ?? {});
  const activeStateSummary = createActiveStateSummary({
    read_model: readModel,
    player_result_bundle: playerResultBundle,
    next_beat_decision: input.next_beat_decision ?? input.nextBeatDecision,
  });
  const projected = compactProjectedPlayerObject({
    player_result_bundle: playerResultBundle,
    read_model: readModel,
    active_state_summary: activeStateSummary,
    transition: input.transition_decision || input.transitionDecision
      ? projectTransitionDecisionForPlayer(input.transition_decision ?? input.transitionDecision)
      : null,
    next_beat: input.next_beat_decision || input.nextBeatDecision
      ? projectNextBeatDecisionForPlayer(input.next_beat_decision ?? input.nextBeatDecision)
      : null,
  });
  assertNoPlayerHiddenData(projected);
  return projected;
}

export function createResolutionTraceStorageStrategy(input = {}) {
  const explicit = optionalText(input.strategy, input.storage_strategy, input.storageStrategy);
  const normalized = normalizeEnumValue(
    explicit,
    Object.values(RESOLUTION_TRACE_STORAGE_STRATEGIES),
    RESOLUTION_TRACE_STORAGE_STRATEGIES.GENERATED_IN_MEMORY
  );
  return {
    strategy: normalized,
    persistence_enabled: normalized === RESOLUTION_TRACE_STORAGE_STRATEGIES.PERSISTED_TRACE_RESERVED,
    schema_migration_required: normalized === RESOLUTION_TRACE_STORAGE_STRATEGIES.PERSISTED_TRACE_RESERVED,
    schema_migration_approved: normalizeBoolean(
      input.schema_migration_approved ?? input.schemaMigrationApproved,
      false
    ),
    notes: normalizeArray(input.notes).map(String),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createResolutionTraceAccessDecision(input = {}) {
  const authorized = normalizeBoolean(input.authorized, false) ||
    normalizeBoolean(input.can_advance_beats ?? input.canAdvanceBeats, false) ||
    ['gm', 'dev', 'admin'].includes(normalizedKey(input.role));
  return {
    authorized,
    required_capability: optionalText(input.required_capability, input.requiredCapability) ?? 'can_advance_beats',
    denied_reason: authorized ? null : 'gm_dev_trace_requires_authorized_debug_capability',
    account_id: optionalId(input.account_id, input.accountId),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

function checkpointStatus(condition, details = {}) {
  return {
    status: condition ? 'captured' : 'not_available',
    details: normalizeObject(details),
  };
}

export function createResolutionTraceLifecycle(input = {}) {
  const trace = normalizeObject(input.trace ?? input.resolution_trace ?? input.resolutionTrace ?? input);
  const checkpoints = {
    [RESOLUTION_TRACE_CHECKPOINTS.REQUEST_RECEIVED]: checkpointStatus(
      Boolean(trace.request_id || trace.request || trace.selected_option_id),
      {
        request_id: optionalId(trace.request_id, trace.request?.request_id),
        request_kind: optionalText(trace.request_kind, trace.request?.request_kind),
        selected_option_id: optionalId(trace.selected_option_id, trace.request?.selected_option_id),
      }
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.SCOPE_AUTH_RESOLVED]: checkpointStatus(
      Boolean(trace.scope?.user_id || trace.scope?.character_id || trace.authorization_result),
      {
        scope: normalizeObject(trace.scope),
        authorization_result: normalizeObject(trace.authorization_result ?? trace.authorizationResult),
      }
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.ACTIVE_STATE_LOADED]: checkpointStatus(
      Boolean(trace.active_state || trace.read_model || trace.source_scene_id || trace.source_dialogue_id),
      {
        source_scene_id: optionalId(trace.source_scene_id),
        source_dialogue_id: optionalId(trace.source_dialogue_id),
        active_state_summary: normalizeObject(trace.active_state_summary ?? trace.activeStateSummary),
      }
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.REQUEST_VALIDATED]: checkpointStatus(
      Object.keys(normalizeObject(trace.validation_result)).length > 0,
      normalizeObject(trace.validation_result)
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.STALE_DUPLICATE_CHECKED]: checkpointStatus(
      Object.keys(normalizeObject(trace.stale_duplicate_idempotency_result)).length > 0,
      normalizeObject(trace.stale_duplicate_idempotency_result)
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.OUTCOME_SELECTED]: checkpointStatus(
      Object.keys(normalizeObject(trace.selected_outcome)).length > 0,
      normalizeObject(trace.selected_outcome)
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.OUTPUT_BUNDLE_BUILT]: checkpointStatus(Boolean(trace.output_bundle), {
      output_reference_counts: outputReferenceCounts(trace.output_bundle ?? {}),
      validation: normalizeObject(trace.output_bundle_validation),
    }),
    [RESOLUTION_TRACE_CHECKPOINTS.PLAYER_RESULT_BUNDLE_BUILT]: checkpointStatus(
      Object.keys(normalizeObject(trace.player_result_bundle)).length > 0,
      {
        present_sections: PLAYER_RESULT_SECTION_KEYS.filter((section) =>
          resultBundleSectionPresent(trace.player_result_bundle, section)
        ),
      }
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.MUTATION_PLAN_BUILT]: checkpointStatus(Boolean(trace.mutation_plan), {
      write_groups: normalizeArray(trace.mutation_plan?.write_groups).map((group) => group.group_key ?? group.group),
    }),
    [RESOLUTION_TRACE_CHECKPOINTS.MUTATION_PLAN_APPLIED]: checkpointStatus(
      Object.keys(normalizeObject(trace.mutation_result)).length > 0,
      normalizeObject(trace.mutation_result)
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.TRANSITION_DECISION_MADE]: checkpointStatus(Boolean(trace.transition_decision), {
      kind: trace.transition_decision?.kind,
      target_type: trace.transition_decision?.target_type,
    }),
    [RESOLUTION_TRACE_CHECKPOINTS.NEXT_BEAT_DECISION_MADE]: checkpointStatus(Boolean(trace.next_beat_decision), {
      kind: trace.next_beat_decision?.kind,
      review_only: trace.next_beat_decision?.review_only === true,
    }),
    [RESOLUTION_TRACE_CHECKPOINTS.ACTION_WINDOW_LIFECYCLE_APPLIED]: checkpointStatus(
      Boolean(trace.action_window_lifecycle_decision || trace.transition_orchestration_diagnostics?.action_window_lifecycle_decision),
      normalizeObject(
        trace.action_window_lifecycle_decision ??
          trace.transition_orchestration_diagnostics?.action_window_lifecycle_decision
      )
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.READ_MODEL_REFRESHED]: checkpointStatus(
      Boolean(
        trace.read_model_refresh_diagnostics?.refresh_status &&
          trace.read_model_refresh_diagnostics.refresh_status !== RESULT_READ_MODEL_ALIGNMENT_STATUSES.NOT_APPLICABLE
      ),
      normalizeObject(trace.read_model_refresh_diagnostics)
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.VISIBILITY_PROJECTION_APPLIED]: checkpointStatus(
      Boolean(
        trace.player_projection_summary ||
          trace.gm_dev_projection ||
          normalizeArray(trace.visibility_filtering_notes).length > 0
      ),
      {
        player_projection_summary: normalizeObject(trace.player_projection_summary),
        gm_dev_projection_summary: normalizeObject(trace.gm_dev_projection),
        visibility_filtering_notes: normalizeArray(trace.visibility_filtering_notes),
      }
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.RESPONSE_RETURNED]: checkpointStatus(
      Boolean(trace.response_status || trace.status || trace.timestamps?.response_returned_at),
      {
        response_status: optionalText(trace.response_status, trace.status),
        response_returned_at: optionalText(trace.timestamps?.response_returned_at, trace.timestamps?.responseReturnedAt),
      }
    ),
    [RESOLUTION_TRACE_CHECKPOINTS.RECOVERY_NEEDED_TRIGGERED]: checkpointStatus(Boolean(trace.recovery_needed), {
      recovery_kind: trace.recovery_needed?.recovery_kind,
      failed_lifecycle_step: trace.recovery_needed?.failed_lifecycle_step,
      retryable: trace.recovery_needed?.retryable,
    }),
  };

  for (const checkpoint of normalizeArray(input.lifecycle_checkpoints ?? input.lifecycleCheckpoints)) {
    const normalized = normalizeObject(checkpoint);
    const key = optionalText(normalized.key, normalized.checkpoint);
    if (key) {
      checkpoints[key] = {
        status: optionalText(normalized.status) ?? 'captured',
        details: normalizeObject(normalized.details),
      };
    }
  }

  const captured = Object.entries(checkpoints)
    .filter(([, value]) => value.status === 'captured')
    .map(([key]) => key);
  const missing = Object.entries(checkpoints)
    .filter(([, value]) => value.status !== 'captured')
    .map(([key]) => key);

  return {
    checkpoints,
    captured,
    missing,
    lifecycle_status: captured.length >= 8
      ? RESOLUTION_TRACE_INSPECTION_STATUSES.TRACEABLE
      : RESOLUTION_TRACE_INSPECTION_STATUSES.PARTIAL,
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

const SENSITIVE_TRACE_KEY_PATTERN = /token|password|secret|credential|authorization_header|auth_header|cookie|session|private_key|api_key/i;

function redactSensitiveTraceValue(value, seen = new WeakMap()) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveTraceValue(entry, seen));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  const redacted = {};
  seen.set(value, redacted);
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_TRACE_KEY_PATTERN.test(key)) {
      redacted[key] = '[redacted]';
      continue;
    }
    redacted[key] = redactSensitiveTraceValue(nested, seen);
  }
  return redacted;
}

export function serializeResolutionTraceForGmDev(traceLike = {}, options = {}) {
  const trace = createResolutionTraceEnvelope(traceLike);
  const serialized = {
    ...redactSensitiveTraceValue(trace),
    trace_storage: createResolutionTraceStorageStrategy(options.trace_storage ?? options.traceStorage ?? {}),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
  return projectForGmDev(serialized, options);
}

export function projectResolutionTraceForPlayer() {
  return null;
}

export function compareResolutionPlayerGmDevProjections(responseLike = {}, options = {}) {
  const playerProjection = options.player_projection ?? options.playerProjection ?? projectResolutionResponseForPlayer(responseLike);
  const gmDevProjection = options.gm_dev_projection ?? options.gmDevProjection ?? projectResolutionResponseForGmDev(responseLike);
  const playerHiddenDataViolations = scanForPlayerHiddenData(playerProjection, options);
  const playerText = JSON.stringify(playerProjection);
  const forbiddenTraceFields = [
    'gm_dev_trace',
    'mutation_plan',
    'mutation_safety_diagnostics',
    'transition_orchestration_diagnostics',
    'read_model_refresh_diagnostics',
    'result_read_model_alignment_diagnostics',
    'outcome_quality_diagnostics',
    'check_metadata',
    'selected_outcome',
    'authored_source',
    'gm_dev_projection',
  ];
  const leakedTraceFields = forbiddenTraceFields.filter((field) => playerText.includes(field));
  const gmDevText = JSON.stringify(gmDevProjection);
  const comparison = {
    comparison_status:
      playerHiddenDataViolations.length === 0 && leakedTraceFields.length === 0
        ? RESOLUTION_TRACE_INSPECTION_STATUSES.PLAYER_SAFE
        : RESOLUTION_TRACE_INSPECTION_STATUSES.NEEDS_REVIEW,
    player_projection_safe: playerHiddenDataViolations.length === 0 && leakedTraceFields.length === 0,
    player_hidden_data_violations: playerHiddenDataViolations,
    leaked_trace_fields: leakedTraceFields,
    gm_dev_trace_present: gmDevText.includes('gm_dev_trace') || Boolean(gmDevProjection.gm_dev_trace),
    gm_dev_projection_has_diagnostics:
      gmDevText.includes('mutation_safety_diagnostics') ||
      gmDevText.includes('transition_orchestration_diagnostics') ||
      gmDevText.includes('read_model_refresh_diagnostics') ||
      gmDevText.includes('outcome_quality_diagnostics'),
    player_required_fields_present: {
      response_kind: Object.hasOwn(normalizeObject(playerProjection), 'response_kind'),
      status: Object.hasOwn(normalizeObject(playerProjection), 'status'),
      player_result_bundle: Object.hasOwn(normalizeObject(playerProjection), 'player_result_bundle'),
    },
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
  if (!comparison.player_projection_safe) {
    comparison.diff_summary = [
      ...playerHiddenDataViolations.map((violation) => violation.message),
      ...leakedTraceFields.map((field) => `Player projection contains GM/dev trace field ${field}`),
    ];
  }
  return comparison;
}

export function createResolutionProvenanceInspector(input = {}) {
  const trace = createResolutionTraceEnvelope(input.trace ?? input.resolution_trace ?? input.resolutionTrace ?? input);
  const response = input.response ?? input.resolution_response ?? input.resolutionResponse ?? {
    interaction_domain: trace.interaction_domain,
    response_kind: RESOLUTION_RESPONSE_KINDS.COMMITTED,
    status: RESOLUTION_RESPONSE_STATUSES.RESOLVED,
    player_result_bundle: trace.player_result_bundle,
    output_bundle: trace.output_bundle,
    mutation_plan: trace.mutation_plan,
    transition_decision: trace.transition_decision,
    next_beat_decision: trace.next_beat_decision,
    gm_dev_trace: trace,
  };
  const lifecycle = createResolutionTraceLifecycle(trace);
  const comparison = compareResolutionPlayerGmDevProjections(response);
  const serializedTrace = serializeResolutionTraceForGmDev(trace, {
    trace_storage: input.trace_storage ?? input.traceStorage,
  });
  const outputBundle = normalizeObject(trace.output_bundle);

  return {
    inspector_kind: 'beat_resolution_provenance_inspector',
    trace_storage: createResolutionTraceStorageStrategy(input.trace_storage ?? input.traceStorage ?? {}),
    access_decision: createResolutionTraceAccessDecision(
      input.access_decision ?? input.accessDecision ?? input
    ),
    trace: serializedTrace,
    lifecycle,
    scope: trace.scope,
    request: {
      request_id: trace.request_id,
      request_kind: trace.request_kind,
      interaction_domain: trace.interaction_domain,
      source_action_window_id: trace.source_action_window_id,
      source_scene_id: trace.source_scene_id,
      source_dialogue_id: trace.source_dialogue_id,
      selected_option_id: trace.selected_option_id,
      selected_option_kind: trace.selected_option_kind,
    },
    provenance_summary: {
      output_reference_counts: outputReferenceCounts(outputBundle),
      mutation_write_groups: normalizeArray(trace.mutation_plan?.write_groups).map((group) => group.group_key ?? group.group),
      transition_decision_kind: trace.transition_decision?.kind ?? null,
      next_beat_decision_kind: trace.next_beat_decision?.kind ?? null,
      recovery_kind: trace.recovery_needed?.recovery_kind ?? null,
      result_sections: PLAYER_RESULT_SECTION_KEYS.filter((section) =>
        resultBundleSectionPresent(trace.player_result_bundle, section)
      ),
    },
    diagnostics: {
      preview_consistency: normalizeObject(trace.preview_consistency_diagnostics ?? trace.previewConsistencyDiagnostics),
      outcome_quality: trace.outcome_quality_diagnostics,
      mutation_safety: trace.mutation_safety_diagnostics,
      transition_orchestration: trace.transition_orchestration_diagnostics,
      read_model_refresh: trace.read_model_refresh_diagnostics,
      result_read_model_alignment: trace.result_read_model_alignment_diagnostics,
      recovery_needed: trace.recovery_needed,
      warnings: trace.warnings,
      errors: trace.errors,
    },
    player_vs_gm_projection_comparison: comparison,
    player_trace_projection: projectResolutionTraceForPlayer(trace),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

function normalizeResultSection(input = {}) {
  const section = normalizeObject(input);
  return projectForPlayer({
    title: optionalText(section.title),
    text: optionalText(section.text, section.body),
    summary: optionalText(section.summary),
  });
}

function normalizeAttemptedActionSection(input = {}) {
  const section = normalizeObject(input);
  return projectForPlayer({
    label: optionalText(section.label, section.title),
    text: optionalText(section.text, section.body),
    summary: optionalText(section.summary),
  });
}

function normalizeNextSection(input = {}) {
  const section = normalizeObject(input);
  return projectForPlayer({
    label: optionalText(section.label, section.title),
    text: optionalText(section.text, section.summary, section.body),
    action_hint: optionalText(section.action_hint, section.actionHint),
  });
}

function normalizePlayerList(entries = [], allowedKeys = []) {
  return normalizeArray(entries).map((entry) => {
    const source = normalizeObject(entry);
    const safe = {};
    for (const key of allowedKeys) {
      if (source[key] !== undefined && source[key] !== null) {
        safe[key] = source[key];
      }
    }
    return projectForPlayer(safe);
  });
}

export function createPlayerResultBundle(input = {}) {
  const recoveryInput = normalizeObject(input.recovery);
  const statusInput = normalizeObject(input.status);
  const bundle = {
    attempted_action: input.attempted_action || input.attemptedAction
      ? normalizeAttemptedActionSection(input.attempted_action ?? input.attemptedAction)
      : null,
    result: input.result ? normalizeResultSection(input.result) : null,
    consequences: normalizePlayerList(input.consequences, ['label', 'text', 'summary', 'severity']),
    discoveries: normalizePlayerList(input.discoveries, ['knowledge_id', 'title', 'summary', 'status']),
    progress: normalizePlayerList(input.progress, ['kind', 'id', 'label', 'status', 'summary']),
    complications: normalizePlayerList(input.complications, ['label', 'text', 'summary', 'severity', 'status']),
    next: input.next ? normalizeNextSection(input.next) : null,
    recovery: input.recovery
      ? projectForPlayer({
          message: optionalText(recoveryInput.message, recoveryInput.player_safe_message, recoveryInput.playerSafeMessage),
          retryable: recoveryInput.retryable === undefined ? true : normalizeBoolean(recoveryInput.retryable, true),
          recovery_action: optionalText(recoveryInput.recovery_action, recoveryInput.recoveryAction),
        })
      : null,
    status: input.status
      ? projectForPlayer({
          state: normalizeSafeStatusState(statusInput.state),
          label: optionalText(statusInput.label),
          is_endpoint: normalizeBoolean(statusInput.is_endpoint ?? statusInput.isEndpoint, false),
          is_recovery_needed: normalizeBoolean(statusInput.is_recovery_needed ?? statusInput.isRecoveryNeeded, false),
        })
      : null,
  };
  assertNoPlayerHiddenData(bundle);
  return bundle;
}

function outputBundleDiscoveries(bundle = {}) {
  return normalizeArray(bundle.knowledge_outputs).map((output) => ({
    knowledge_id: output.knowledge_id,
    title: output.title,
    summary: output.player_summary,
    status: output.status,
  })).filter((entry) => entry.knowledge_id || entry.title || entry.summary);
}

function outputBundleProgress(bundle = {}) {
  return normalizeArray(bundle.objective_outputs).map((output) => ({
    kind: 'objective',
    id: output.objective_id,
    label: output.title,
    status: output.status,
    summary: output.player_summary,
  })).filter((entry) => entry.id || entry.label || entry.summary || entry.status);
}

function outputBundleConsequences(bundle = {}) {
  const stateConsequences = normalizeArray(bundle.state_writes)
    .map((output) => ({
      label: optionalText(output.label) ?? 'Consequence',
      text: output.player_summary,
      severity: optionalText(output.severity),
    }))
    .filter((entry) => entry.text);
  const socialConsequences = normalizeArray(bundle.relationship_or_social_writes)
    .map((output) => ({
      label: optionalText(output.label) ?? 'Social consequence',
      text: output.player_perception_summary,
      severity: optionalText(output.severity),
    }))
    .filter((entry) => entry.text);
  return [...stateConsequences, ...socialConsequences];
}

function outputBundleComplications(bundle = {}) {
  const debugFreeComplications = normalizeArray(bundle.transition_outputs)
    .filter((output) => output.status === TRANSITION_OUTPUT_STATUSES.BLOCKED)
    .map((output) => ({
      label: optionalText(output.player_label) ?? 'Complication',
      text: output.player_summary,
      severity: 'warning',
      status: 'unresolved',
    }))
    .filter((entry) => entry.text || entry.label);
  return debugFreeComplications;
}

function nextFromResolutionContext(input = {}, bundle = {}) {
  const explicitNext = normalizeObject(input.next);
  if (Object.keys(explicitNext).length > 0) {
    return explicitNext;
  }
  const nextBeat = input.next_beat_decision || input.nextBeatDecision
    ? createNextBeatDecision(input.next_beat_decision ?? input.nextBeatDecision)
    : null;
  if (nextBeat?.player_label || nextBeat?.player_summary) {
    return {
      label: nextBeat.player_label,
      text: nextBeat.player_summary,
    };
  }
  const transition = input.transition_decision || input.transitionDecision
    ? createTransitionDecision(input.transition_decision ?? input.transitionDecision)
    : null;
  if (transition?.player_label || transition?.player_summary) {
    return {
      label: transition.player_label,
      text: transition.player_summary,
    };
  }
  const transitionOutput = normalizeArray(bundle.transition_outputs).find(
    (output) => output.player_label || output.player_summary
  );
  if (transitionOutput) {
    return {
      label: transitionOutput.player_label,
      text: transitionOutput.player_summary,
    };
  }
  return null;
}

export function createOutcomeQualityResultBundle(input = {}) {
  const outputBundle = input.output_bundle || input.outputBundle
    ? normalizeOutputBundle(input.output_bundle ?? input.outputBundle)
    : normalizeOutputBundle({});
  const authoredOutcome = normalizeObject(input.authored_outcome ?? input.authoredOutcome ?? input.selected_outcome ?? input.selectedOutcome);
  const attemptedAction = input.attempted_action ?? input.attemptedAction ?? authoredOutcome.attempted_action ?? authoredOutcome.attemptedAction;
  const result = input.result ?? authoredOutcome.result ?? authoredOutcome.player_result ?? authoredOutcome.playerResult;
  const consequences = [
    ...normalizeArray(input.consequences ?? authoredOutcome.consequences),
    ...outputBundleConsequences(outputBundle),
  ];
  const discoveries = normalizeArray(input.discoveries ?? authoredOutcome.discoveries).length > 0
    ? normalizeArray(input.discoveries ?? authoredOutcome.discoveries)
    : outputBundleDiscoveries(outputBundle);
  const progress = normalizeArray(input.progress ?? authoredOutcome.progress).length > 0
    ? normalizeArray(input.progress ?? authoredOutcome.progress)
    : outputBundleProgress(outputBundle);
  const complications = [
    ...normalizeArray(input.complications ?? authoredOutcome.complications),
    ...outputBundleComplications(outputBundle),
  ];
  const next = nextFromResolutionContext(input, outputBundle);

  return createPlayerResultBundle({
    attempted_action: attemptedAction,
    result,
    consequences,
    discoveries,
    progress,
    complications,
    next,
    recovery: input.recovery ?? authoredOutcome.recovery,
    status: input.status ?? authoredOutcome.status,
  });
}

function resultBundleSectionPresent(bundle = {}, section) {
  const value = bundle[section];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

function outputReferenceCounts(bundle = {}) {
  return {
    knowledge_outputs: normalizeArray(bundle.knowledge_outputs).length,
    objective_outputs: normalizeArray(bundle.objective_outputs).length,
    history_outputs: normalizeArray(bundle.history_outputs).length,
    latest_development_output: bundle.latest_development_output ? 1 : 0,
    state_writes: normalizeArray(bundle.state_writes).length,
    relationship_or_social_writes: normalizeArray(bundle.relationship_or_social_writes).length,
    transition_outputs: normalizeArray(bundle.transition_outputs).length,
    completed_record_outputs: normalizeArray(bundle.completed_record_outputs).length,
    archive_search_outputs: normalizeArray(bundle.archive_search_outputs).length,
  };
}

export function createOutcomeQualityDiagnostics(input = {}) {
  const outputBundle = input.output_bundle || input.outputBundle
    ? normalizeOutputBundle(input.output_bundle ?? input.outputBundle)
    : normalizeOutputBundle({});
  const playerResultBundle = createPlayerResultBundle(
    input.player_result_bundle ??
      input.playerResultBundle ??
      createOutcomeQualityResultBundle({
        ...input,
        output_bundle: outputBundle,
      })
  );
  const expectedSections = normalizeArray(input.expected_sections ?? input.expectedSections)
    .map(String)
    .filter((section) => PLAYER_RESULT_SECTION_KEYS.includes(section));
  const presentSections = PLAYER_RESULT_SECTION_KEYS.filter((section) => resultBundleSectionPresent(playerResultBundle, section));
  const missingRecommendedSections = expectedSections.filter((section) => !presentSections.includes(section));
  const warnings = missingRecommendedSections.map((section) => ({
    code: OUTCOME_QUALITY_WARNING_CODES.MISSING_RECOMMENDED_SECTION,
    section,
    message: `Recommended player result section is missing: ${section}`,
  }));
  if (presentSections.length === 0) {
    warnings.push({
      code: OUTCOME_QUALITY_WARNING_CODES.NO_PLAYER_VISIBLE_CHANGE,
      message: 'No player-visible result sections were assembled.',
    });
  }

  return {
    quality_status: warnings.length > 0 ? OUTCOME_QUALITY_STATUSES.NEEDS_REVIEW : OUTCOME_QUALITY_STATUSES.COMPLETE,
    present_sections: presentSections,
    missing_recommended_sections: missingRecommendedSections,
    warnings,
    output_references_used: outputReferenceCounts(outputBundle),
    selected_outcome: normalizeObject(input.selected_outcome ?? input.selectedOutcome),
    failure_or_partial_status: optionalText(
      input.failure_or_partial_status,
      input.failureOrPartialStatus,
      input.outcome_status,
      input.outcomeStatus
    ),
    next_step_marker: optionalText(input.next_step_marker, input.nextStepMarker),
    complication_markers: normalizeArray(input.complication_markers ?? input.complicationMarkers).map(String),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createRecoveryNeededEnvelope(input = {}) {
  const recoveryKind = normalizeRecoveryKind(input.recovery_kind ?? input.recoveryKind ?? input.kind);
  const error = createSafeInteractionError({
    code: input.code ?? codeForRecoveryKind(recoveryKind),
    player_safe_message: input.player_safe_message ?? input.playerSafeMessage ?? input.message,
    gm_dev_message: input.gm_dev_message ?? input.gmDevMessage,
    internal_cause: input.internal_cause ?? input.internalCause,
    retryable: input.retryable,
    recovery_action: input.recovery_action ?? input.recoveryAction ?? recoveryActionForRecoveryKind(recoveryKind),
  });

  return {
    recovery_kind: recoveryKind,
    code: error.code,
    player_safe_message: error.player_safe_message,
    retryable: error.retryable,
    recovery_action: error.recovery_action,
    current_safe_state: projectForPlayer(input.current_safe_state ?? input.currentSafeState ?? {}),
    gm_dev_repair_required: normalizeBoolean(input.gm_dev_repair_required ?? input.gmDevRepairRequired, false),
    failed_lifecycle_step: optionalText(input.failed_lifecycle_step, input.failedLifecycleStep),
    partial_writes_known: normalizeArray(input.partial_writes_known ?? input.partialWritesKnown),
    recommended_gm_dev_repair_action: optionalText(
      input.recommended_gm_dev_repair_action,
      input.recommendedGmDevRepairAction
    ),
    trace_id: optionalId(input.trace_id, input.traceId),
    diagnostics: normalizeObject(input.diagnostics),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

function codeForRecoveryKind(kind) {
  if ([RECOVERY_NEEDED_KINDS.UNAUTHORIZED].includes(kind)) {
    return SAFE_INTERACTION_ERROR_CODES.UNAUTHORIZED;
  }
  if ([RECOVERY_NEEDED_KINDS.STALE_REQUEST].includes(kind)) {
    return SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION;
  }
  if ([RECOVERY_NEEDED_KINDS.DUPLICATE_REQUEST].includes(kind)) {
    return SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING;
  }
  if ([RECOVERY_NEEDED_KINDS.UNAVAILABLE_OPTION].includes(kind)) {
    return SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE;
  }
  if ([RECOVERY_NEEDED_KINDS.MISSING_CONTENT, RECOVERY_NEEDED_KINDS.MISSING_TRANSITION_TARGET].includes(kind)) {
    return SAFE_INTERACTION_ERROR_CODES.NOT_FOUND;
  }
  if ([RECOVERY_NEEDED_KINDS.MALFORMED_REQUEST, RECOVERY_NEEDED_KINDS.OUTPUT_BUNDLE_INCOMPLETE].includes(kind)) {
    return SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED;
  }
  return SAFE_INTERACTION_ERROR_CODES.INTERNAL_ERROR;
}

function recoveryActionForRecoveryKind(kind) {
  if (kind === RECOVERY_NEEDED_KINDS.UNAUTHORIZED) {
    return RECOVERY_ACTIONS.SIGN_IN;
  }
  if (kind === RECOVERY_NEEDED_KINDS.UNAVAILABLE_OPTION) {
    return RECOVERY_ACTIONS.CHOOSE_ANOTHER_ACTION;
  }
  if (kind === RECOVERY_NEEDED_KINDS.RECOVERY_REQUIRED || kind === RECOVERY_NEEDED_KINDS.MUTATION_FAILED) {
    return RECOVERY_ACTIONS.CONTACT_SUPPORT_DEV_ONLY;
  }
  return RECOVERY_ACTIONS.REFRESH_CURRENT_SCENE;
}

function projectRecoveryEnvelopeForPlayer(envelopeLike = {}) {
  const envelope = createRecoveryNeededEnvelope(envelopeLike);
  const projected = {
    recovery_kind: envelope.recovery_kind === RECOVERY_NEEDED_KINDS.ENDPOINT_REVIEW_ONLY
      ? RECOVERY_NEEDED_KINDS.ENDPOINT_REVIEW_ONLY
      : 'safe_recovery',
    code: envelope.code,
    player_safe_message: envelope.player_safe_message,
    retryable: envelope.retryable,
    recovery_action: envelope.recovery_action,
    current_safe_state: envelope.current_safe_state,
  };
  assertNoPlayerHiddenData(projected);
  return projected;
}

export function createResolutionTraceEnvelope(input = {}) {
  const request = input.request ? createResolutionRequest(input.request) : null;
  const outputBundle = input.output_bundle || input.outputBundle
    ? normalizeOutputBundle(input.output_bundle ?? input.outputBundle)
    : null;

  return {
    trace_schema_version: '6C.7-generated-resolution-trace',
    trace_storage_strategy: createResolutionTraceStorageStrategy(input.trace_storage ?? input.traceStorage ?? {}),
    trace_collection_points: Object.values(RESOLUTION_TRACE_CHECKPOINTS),
    trace_id: optionalId(input.trace_id, input.traceId),
    request_id: optionalId(input.request_id, input.requestId, request?.request_id),
    correlation_id: optionalId(input.correlation_id, input.correlationId, request?.correlation_id),
    interaction_domain:
      normalizeSharedInteractionDomain(alias(input, 'interaction_domain', 'interactionDomain') ?? request?.interaction_domain),
    request_kind: normalizeRequestKind(input.request_kind ?? input.requestKind ?? request?.request_kind),
    scope: {
      user_id: optionalId(input.user_id, input.userId, request?.user_id),
      character_id: optionalId(input.character_id, input.characterId, request?.character_id),
      campaign_id: optionalId(input.campaign_id, input.campaignId, request?.campaign_id),
      adventure_id: optionalId(input.adventure_id, input.adventureId, request?.adventure_id),
    },
    source_action_window_id: optionalId(input.source_action_window_id, input.sourceActionWindowId, request?.action_window_id),
    source_scene_id: optionalId(input.source_scene_id, input.sourceSceneId, request?.source_scene_id),
    source_location_id: optionalId(input.source_location_id, input.sourceLocationId, request?.source_location_id),
    source_dialogue_id: optionalId(input.source_dialogue_id, input.sourceDialogueId, request?.source_dialogue_id),
    selected_option_id: optionalId(input.selected_option_id, input.selectedOptionId, request?.selected_option_id),
    selected_option_kind: optionalText(input.selected_option_kind, input.selectedOptionKind, request?.selected_option_kind),
    authorization_result: normalizeObject(input.authorization_result ?? input.authorizationResult),
    active_state_summary: normalizeObject(input.active_state_summary ?? input.activeStateSummary),
    validation_result: normalizeObject(input.validation_result ?? input.validationResult),
    stale_duplicate_idempotency_result: normalizeObject(
      input.stale_duplicate_idempotency_result ?? input.staleDuplicateIdempotencyResult
    ),
    selected_outcome: normalizeObject(input.selected_outcome ?? input.selectedOutcome),
    authored_source: normalizeObject(input.authored_source ?? input.authoredSource),
    preview_consistency_diagnostics: normalizeObject(
      input.preview_consistency_diagnostics ?? input.previewConsistencyDiagnostics
    ),
    check_metadata: normalizeArray(input.check_metadata ?? input.checkMetadata),
    output_bundle: outputBundle,
    output_bundle_validation: outputBundle ? validateOutputBundle(outputBundle, { strict: false }) : null,
    mutation_plan: input.mutation_plan || input.mutationPlan
      ? createMutationPlan(input.mutation_plan ?? input.mutationPlan)
      : null,
    mutation_result: normalizeObject(input.mutation_result ?? input.mutationResult),
    transaction_boundary: normalizeObject(input.transaction_boundary ?? input.transactionBoundary),
    action_window_lifecycle_decision: normalizeObject(
      input.action_window_lifecycle_decision ?? input.actionWindowLifecycleDecision
    ),
    read_model_refresh_target: optionalText(input.read_model_refresh_target, input.readModelRefreshTarget),
    mutation_safety_diagnostics: createMutationSafetyDiagnostics({
      mutation_plan: input.mutation_plan ?? input.mutationPlan,
      idempotency_decision: input.stale_duplicate_idempotency_result ?? input.staleDuplicateIdempotencyResult,
      mutation_result: input.mutation_result ?? input.mutationResult,
      transaction_boundary: input.transaction_boundary ?? input.transactionBoundary,
      action_window_lifecycle_decision: input.action_window_lifecycle_decision ?? input.actionWindowLifecycleDecision,
      read_model_refresh_target: input.read_model_refresh_target ?? input.readModelRefreshTarget,
      warnings: input.mutation_warnings ?? input.mutationWarnings,
    }),
    transition_decision: input.transition_decision || input.transitionDecision
      ? createTransitionDecision(input.transition_decision ?? input.transitionDecision)
      : null,
    next_beat_decision: input.next_beat_decision || input.nextBeatDecision
      ? createNextBeatDecision(input.next_beat_decision ?? input.nextBeatDecision)
      : null,
    transition_orchestration_diagnostics: createTransitionOrchestrationDiagnostics({
      transition_decision: input.transition_decision ?? input.transitionDecision,
      next_beat_decision: input.next_beat_decision ?? input.nextBeatDecision,
      player_result_bundle: input.player_result_bundle ?? input.playerResultBundle,
      action_window_lifecycle_decision: input.action_window_lifecycle_decision ?? input.actionWindowLifecycleDecision,
      adapter_transition_proposal: input.adapter_transition_proposal ?? input.adapterTransitionProposal,
      adapter_next_beat_proposal: input.adapter_next_beat_proposal ?? input.adapterNextBeatProposal,
      warnings: input.transition_orchestration_warnings ?? input.transitionOrchestrationWarnings,
    }),
    player_result_bundle: createPlayerResultBundle(input.player_result_bundle ?? input.playerResultBundle ?? {}),
    read_model_refresh_diagnostics:
      input.read_model_refresh_diagnostics ??
      input.readModelRefreshDiagnostics ??
      createReadModelRefreshDiagnostics({
        read_model_refresh_hook: input.read_model_refresh_hook ?? input.readModelRefreshHook,
        read_model_refresh_target: input.read_model_refresh_target ?? input.readModelRefreshTarget,
        transition_decision: input.transition_decision ?? input.transitionDecision,
        next_beat_decision: input.next_beat_decision ?? input.nextBeatDecision,
        mutation_result: input.mutation_result ?? input.mutationResult,
        warnings: input.read_model_refresh_warnings ?? input.readModelRefreshWarnings,
      }),
    result_read_model_alignment_diagnostics:
      input.result_read_model_alignment_diagnostics ??
      input.resultReadModelAlignmentDiagnostics ??
      createResultReadModelAlignmentDiagnostics({
        read_model: input.read_model ?? input.readModel,
        output_bundle: outputBundle ?? {},
        player_result_bundle: input.player_result_bundle ?? input.playerResultBundle ?? {},
        transition_decision: input.transition_decision ?? input.transitionDecision,
        next_beat_decision: input.next_beat_decision ?? input.nextBeatDecision,
        read_model_refresh_hook: input.read_model_refresh_hook ?? input.readModelRefreshHook,
        read_model_refresh_target: input.read_model_refresh_target ?? input.readModelRefreshTarget,
        mutation_result: input.mutation_result ?? input.mutationResult,
      }),
    outcome_quality_diagnostics: createOutcomeQualityDiagnostics({
      output_bundle: outputBundle ?? {},
      player_result_bundle: input.player_result_bundle ?? input.playerResultBundle ?? {},
      selected_outcome: input.selected_outcome ?? input.selectedOutcome,
      expected_sections: input.expected_sections ?? input.expectedSections,
      failure_or_partial_status: input.failure_or_partial_status ?? input.failureOrPartialStatus,
      next_step_marker: input.next_step_marker ?? input.nextStepMarker,
      complication_markers: input.complication_markers ?? input.complicationMarkers,
    }),
    player_projection_summary: normalizeObject(input.player_projection_summary ?? input.playerProjectionSummary),
    gm_dev_projection: normalizeObject(input.gm_dev_projection ?? input.gmDevProjection),
    visibility_filtering_notes: normalizeArray(input.visibility_filtering_notes ?? input.visibilityFilteringNotes),
    recovery_needed: input.recovery_needed || input.recoveryNeeded
      ? createRecoveryNeededEnvelope(input.recovery_needed ?? input.recoveryNeeded)
      : null,
    errors: normalizeArray(input.errors).map((error) => createSafeInteractionError(error)),
    warnings: normalizeArray(input.warnings).map(String),
    timestamps: normalizeObject(input.timestamps),
    durations_ms: normalizeObject(input.durations_ms ?? input.durationsMs),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createResolutionResponse(input = {}) {
  const request = input.request ? createResolutionRequest(input.request) : null;
  const responseKind = normalizeResponseKind(input.response_kind ?? input.responseKind ?? input.kind);
  const interactionDomain =
    normalizeSharedInteractionDomain(alias(input, 'interaction_domain', 'interactionDomain') ?? request?.interaction_domain) ??
    request?.interaction_domain;
  if (!interactionDomain) {
    throw new Error('ResolutionResponse requires a valid interaction domain');
  }

  const outputBundleInput = input.output_bundle ?? input.outputBundle;
  const needsDefaultOutputBundle = [
    RESOLUTION_RESPONSE_KINDS.COMMITTED,
    RESOLUTION_RESPONSE_KINDS.ENDPOINT,
  ].includes(responseKind);

  return {
    response_kind: responseKind,
    interaction_domain: interactionDomain,
    status: normalizeResponseStatus(input.status, responseKind),
    resolution_id: optionalId(input.resolution_id, input.resolutionId),
    request_id: optionalId(input.request_id, input.requestId, request?.request_id),
    correlation_id: optionalId(input.correlation_id, input.correlationId, request?.correlation_id),
    request,
    preview: normalizeObject(input.preview),
    availability: normalizeObject(input.availability),
    player_result_bundle: createPlayerResultBundle(input.player_result_bundle ?? input.playerResultBundle ?? {}),
    output_bundle: outputBundleInput
      ? normalizeOutputBundle(outputBundleInput)
      : needsDefaultOutputBundle
        ? normalizeOutputBundle({})
        : null,
    mutation_plan: input.mutation_plan || input.mutationPlan
      ? createMutationPlan(input.mutation_plan ?? input.mutationPlan)
      : null,
    transition_decision: input.transition_decision || input.transitionDecision
      ? createTransitionDecision(input.transition_decision ?? input.transitionDecision)
      : null,
    next_beat_decision: input.next_beat_decision || input.nextBeatDecision
      ? createNextBeatDecision(input.next_beat_decision ?? input.nextBeatDecision)
      : null,
    read_model_refresh_hook: input.read_model_refresh_hook || input.readModelRefreshHook
      ? createReadModelRefreshHook(input.read_model_refresh_hook ?? input.readModelRefreshHook)
      : null,
    recovery_envelope: input.recovery_envelope || input.recoveryEnvelope
      ? createRecoveryNeededEnvelope(input.recovery_envelope ?? input.recoveryEnvelope)
      : null,
    gm_dev_trace: input.gm_dev_trace || input.gmDevTrace
      ? createResolutionTraceEnvelope(input.gm_dev_trace ?? input.gmDevTrace)
      : null,
    errors: normalizeArray(input.errors).map((error) => createSafeInteractionError(error)),
    visibility_scope: normalizeVisibilityScope(input.visibility_scope ?? input.visibilityScope, VISIBILITY_SCOPES.SYSTEM_INTERNAL),
  };
}

export function createPreviewResolutionResponse(input = {}) {
  return createResolutionResponse({
    ...input,
    response_kind: RESOLUTION_RESPONSE_KINDS.PREVIEW,
    status: input.status ?? RESOLUTION_RESPONSE_STATUSES.PREVIEW_READY,
  });
}

export function createCommittedResolutionResponse(input = {}) {
  return createResolutionResponse({
    ...input,
    response_kind: RESOLUTION_RESPONSE_KINDS.COMMITTED,
    status: input.status ?? RESOLUTION_RESPONSE_STATUSES.RESOLVED,
  });
}

export function createRecoveryResolutionResponse(input = {}) {
  const recoveryEnvelope = createRecoveryNeededEnvelope(
    input.recovery_envelope ?? input.recoveryEnvelope ?? input
  );
  return createResolutionResponse({
    ...input,
    response_kind: RESOLUTION_RESPONSE_KINDS.RECOVERY,
    status: RESOLUTION_RESPONSE_STATUSES.RECOVERY_NEEDED,
    recovery_envelope: recoveryEnvelope,
    player_result_bundle: {
      ...(input.player_result_bundle ?? input.playerResultBundle ?? {}),
      recovery: {
        message: recoveryEnvelope.player_safe_message,
        retryable: recoveryEnvelope.retryable,
        recovery_action: recoveryEnvelope.recovery_action,
      },
      status: {
        state: 'recovery_needed',
        label: 'Recovery needed',
        is_recovery_needed: true,
      },
    },
  });
}

export function createUnavailableResolutionResponse(input = {}) {
  const recoveryEnvelope = createRecoveryNeededEnvelope({
    ...input,
    recovery_kind: RECOVERY_NEEDED_KINDS.UNAVAILABLE_OPTION,
    code: input.code ?? SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE,
    recovery_action: input.recovery_action ?? input.recoveryAction ?? RECOVERY_ACTIONS.CHOOSE_ANOTHER_ACTION,
  });
  return createResolutionResponse({
    ...input,
    response_kind: RESOLUTION_RESPONSE_KINDS.UNAVAILABLE,
    status: RESOLUTION_RESPONSE_STATUSES.UNAVAILABLE,
    recovery_envelope: recoveryEnvelope,
    player_result_bundle: {
      ...(input.player_result_bundle ?? input.playerResultBundle ?? {}),
      recovery: {
        message: recoveryEnvelope.player_safe_message,
        retryable: recoveryEnvelope.retryable,
        recovery_action: recoveryEnvelope.recovery_action,
      },
      status: {
        state: 'unavailable',
        label: 'Option unavailable',
      },
    },
  });
}

export function createEndpointResolutionResponse(input = {}) {
  return createResolutionResponse({
    ...input,
    response_kind: RESOLUTION_RESPONSE_KINDS.ENDPOINT,
    status: RESOLUTION_RESPONSE_STATUSES.ENDPOINT,
    player_result_bundle: {
      ...(input.player_result_bundle ?? input.playerResultBundle ?? {}),
      status: {
        state: 'awaiting_support',
        label: input.player_status_label ?? input.playerStatusLabel ?? 'Current playable slice endpoint reached',
        is_endpoint: true,
      },
    },
    next_beat_decision: input.next_beat_decision ?? input.nextBeatDecision ?? {
      kind: NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
      review_only: true,
      player_label: 'Review the current state',
    },
  });
}

export function createPreviewAlignmentMarkers(input = {}) {
  const request = input.request ? createResolutionRequest(input.request) : null;
  const activeMarkers = activeStateAlignmentMarkers(input.active_state ?? input.activeState);
  const base = request ? alignmentFieldsFromRequest(request) : {};
  const interactionDomain =
    normalizeSharedInteractionDomain(
      alias(input, 'interaction_domain', 'interactionDomain') ??
        base.interaction_domain ??
        activeMarkers.interaction_domain
    ) ?? null;
  const selectedOptionId = optionalId(
    input.selected_option_id,
    input.selectedOptionId,
    base.selected_option_id,
    input.option_id,
    input.optionId
  );
  const sourceSceneId = optionalId(input.source_scene_id, input.sourceSceneId, base.source_scene_id, activeMarkers.source_scene_id);
  const sourceDialogueId = optionalId(
    input.source_dialogue_id,
    input.sourceDialogueId,
    base.source_dialogue_id,
    activeMarkers.source_dialogue_id
  );
  const actionWindowId = optionalId(input.action_window_id, input.actionWindowId, base.action_window_id, activeMarkers.action_window_id);
  const contextVersion = optionalId(input.context_version, input.contextVersion, base.context_version, activeMarkers.context_version);
  const contentVersion = optionalId(input.content_version, input.contentVersion);
  const availabilitySnapshotId = optionalId(input.availability_snapshot_id, input.availabilitySnapshotId);
  const previewToken = optionalId(input.preview_token, input.previewToken, input.client_preview_token, input.clientPreviewToken) ??
    stablePreviewToken([
      interactionDomain,
      actionWindowId,
      sourceSceneId,
      sourceDialogueId,
      selectedOptionId,
      contextVersion,
      contentVersion,
      availabilitySnapshotId,
    ]);

  return {
    interaction_domain: interactionDomain,
    action_window_id: actionWindowId,
    source_scene_id: sourceSceneId,
    source_location_id: optionalId(input.source_location_id, input.sourceLocationId, base.source_location_id, activeMarkers.source_location_id),
    source_dialogue_id: sourceDialogueId,
    selected_option_id: selectedOptionId,
    selected_option_kind: normalizeOptionKind(
      input.selected_option_kind ?? input.selectedOptionKind ?? base.selected_option_kind
    ),
    domain_option_kind: optionalText(input.domain_option_kind, input.domainOptionKind, base.domain_option_kind),
    context_version: contextVersion,
    content_version: contentVersion,
    availability_snapshot_id: availabilitySnapshotId,
    preview_token: previewToken,
    marker_id: optionalId(input.marker_id, input.markerId) ?? previewToken,
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createPreviewExpectationMarker(input = {}) {
  const kind = normalizeEnumValue(
    input.kind ?? input.expectation_kind ?? input.expectationKind,
    Object.values(PREVIEW_EXPECTATION_KINDS),
    PREVIEW_EXPECTATION_KINDS.NO_COMMIT
  );
  return {
    marker_id: optionalId(input.marker_id, input.markerId, input.id),
    expectation_kind: kind,
    source_option_id: optionalId(input.source_option_id, input.sourceOptionId, input.option_id, input.optionId),
    source_content_id: markerSourceId(input),
    possible_outcome_kinds: normalizeArray(input.possible_outcome_kinds ?? input.possibleOutcomeKinds).map((entry) =>
      normalizedKey(entry)
    ),
    uncertainty: optionalText(input.uncertainty) ?? 'deterministic_if_state_unchanged',
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary),
    gm_dev_details: normalizeObject(input.gm_dev_details ?? input.gmDevDetails),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createResolutionOutcomeMarker(input = {}) {
  const kind = normalizeEnumValue(
    input.kind ?? input.outcome_kind ?? input.outcomeKind ?? input.output_kind ?? input.outputKind,
    Object.values(RESOLUTION_OUTCOME_MARKER_KINDS),
    RESOLUTION_OUTCOME_MARKER_KINDS.NO_OUTPUT
  );
  return {
    marker_id: optionalId(input.marker_id, input.markerId, input.id),
    outcome_kind: kind,
    output_kind: optionalText(input.output_kind, input.outputKind) ?? kind,
    output_id: optionalId(input.output_id, input.outputId, input.knowledge_id, input.knowledgeId, input.objective_id, input.objectiveId),
    source_option_id: optionalId(input.source_option_id, input.sourceOptionId, input.option_id, input.optionId),
    source_content_id: markerSourceId(input),
    selected_outcome_id: optionalId(input.selected_outcome_id, input.selectedOutcomeId, input.outcome_id, input.outcomeId),
    status: optionalText(input.status) ?? 'resolved',
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary),
    gm_dev_details: normalizeObject(input.gm_dev_details ?? input.gmDevDetails),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function assertPreviewResponseNonMutating(responseLike = {}) {
  const response = createResolutionResponse(responseLike);
  const violations = [];
  if (response.response_kind !== RESOLUTION_RESPONSE_KINDS.PREVIEW) {
    violations.push('response_is_not_preview');
  }
  if (response.output_bundle !== null) {
    violations.push('preview_contains_output_bundle');
  }
  if (response.mutation_plan !== null) {
    violations.push('preview_contains_mutation_plan');
  }
  if (response.transition_decision !== null) {
    violations.push('preview_contains_transition_decision');
  }
  if (response.next_beat_decision !== null) {
    violations.push('preview_contains_next_beat_decision');
  }
  if (response.read_model_refresh_hook !== null) {
    violations.push('preview_contains_read_model_refresh_hook');
  }
  if (response.recovery_envelope?.recovery_kind === RECOVERY_NEEDED_KINDS.ENDPOINT_REVIEW_ONLY) {
    violations.push('preview_marks_endpoint');
  }
  if (violations.length > 0) {
    const error = new Error(`Preview response is mutating or commit-shaped: ${violations.join(', ')}`);
    error.violations = violations;
    throw error;
  }
  return true;
}

export function validatePreviewRequestConsistency(input = {}) {
  const request = createResolutionRequest(input.request ?? input);
  const activeState = normalizeObject(input.active_state ?? input.activeState);
  const option = normalizeObject(input.option);
  const activeMarkers = activeStateAlignmentMarkers(activeState);
  const previewMarkers = createPreviewAlignmentMarkers({ request, activeState });
  const mismatches = [];

  if (request.request_kind !== RESOLUTION_REQUEST_KINDS.PREVIEW) {
    mismatches.push({ field: 'request_kind', expected: RESOLUTION_REQUEST_KINDS.PREVIEW, actual: request.request_kind, reason: 'wrong_request_kind' });
  }
  compareMarkerField('interaction_domain', request.interaction_domain, activeMarkers.interaction_domain, mismatches);
  compareMarkerField('action_window_id', request.action_window_id, activeMarkers.action_window_id, mismatches);
  compareMarkerField('source_scene_id', request.source_scene_id, activeMarkers.source_scene_id, mismatches);
  compareMarkerField('source_dialogue_id', request.source_dialogue_id, activeMarkers.source_dialogue_id, mismatches);
  compareMarkerField('context_version', request.context_version, activeMarkers.context_version, mismatches);

  if (activeState.endpoint_reached === true || activeState.endpointReached === true) {
    mismatches.push({ field: 'endpoint', expected: 'active_interaction', actual: 'endpoint_reached', reason: 'endpoint_review_only' });
  }
  if (!isActionWindowOpen(activeState)) {
    mismatches.push({ field: 'action_window_state', expected: 'open', actual: activeMarkers.action_window_state, reason: 'closed_action_window' });
  }
  if (input.require_option !== false && input.requireOption !== false && !option.option_id && !option.optionId && !option.id) {
    mismatches.push({ field: 'selected_option_id', expected: request.selected_option_id, actual: null, reason: 'missing_option' });
  }
  const optionId = optionalId(option.option_id, option.optionId, option.id);
  if (optionId && request.selected_option_id && optionId !== request.selected_option_id) {
    mismatches.push({ field: 'selected_option_id', expected: request.selected_option_id, actual: optionId, reason: 'option_mismatch' });
  }

  const availability = normalizeObject(input.availability ?? option.availability);
  const availabilityStatus = optionalText(availability.status) ?? (availability.available === false ? 'unavailable' : 'available');
  const unavailable = availability.available === false || ['unavailable', 'locked', 'hidden', 'blocked', 'future_supported'].includes(normalizedKey(availabilityStatus));
  const diagnostics = createPreviewConsistencyDiagnostics({
    preview_request: request,
    preview_alignment_markers: previewMarkers,
    preview_validation_result: {
      valid: mismatches.length === 0 && !unavailable,
      mismatches,
      availability_status: availabilityStatus,
    },
    hidden_requirements: normalizeArray(input.hidden_requirements ?? input.hiddenRequirements ?? availability.requirements),
  });

  if (mismatches.length > 0) {
    return {
      valid: false,
      status: PREVIEW_ALIGNMENT_STATUSES.STALE,
      preview_alignment_markers: previewMarkers,
      mismatches,
      diagnostics,
      response: createRecoveryResolutionResponse({
        interactionDomain: request.interaction_domain,
        recoveryKind: RECOVERY_NEEDED_KINDS.STALE_REQUEST,
        message: 'That preview is no longer current. Review the scene and preview your action again.',
        failedLifecycleStep: 'validate_preview_request',
        gmDevTrace: {
          interactionDomain: request.interaction_domain,
          request,
          validationResult: { mismatches },
          playerResultBundle: {
            recovery: {
              message: 'That preview is no longer current. Review the scene and preview your action again.',
            },
            status: { state: 'recovery_needed', label: 'Preview stale', isRecoveryNeeded: true },
          },
        },
      }),
    };
  }

  if (unavailable) {
    return {
      valid: false,
      status: PREVIEW_ALIGNMENT_STATUSES.UNAVAILABLE,
      preview_alignment_markers: previewMarkers,
      mismatches: [],
      diagnostics,
      response: createUnavailableResolutionResponse({
        interactionDomain: request.interaction_domain,
        message: availability.player_reason ?? availability.playerReason ?? 'That option is not available right now.',
        gmDevTrace: {
          interactionDomain: request.interaction_domain,
          request,
          validationResult: { availability_status: availabilityStatus },
          playerResultBundle: {
            recovery: {
              message: availability.player_reason ?? availability.playerReason ?? 'That option is not available right now.',
            },
            status: { state: 'unavailable', label: 'Option unavailable' },
          },
        },
      }),
    };
  }

  return {
    valid: true,
    status: PREVIEW_ALIGNMENT_STATUSES.ALIGNED,
    preview_alignment_markers: previewMarkers,
    mismatches: [],
    diagnostics,
    response: null,
  };
}

export function validateCommitAgainstPreviewContext(input = {}) {
  const commitRequest = createCommitResolutionRequest(input.commit_request ?? input.commitRequest ?? input.request ?? input);
  const previewMarkers = createPreviewAlignmentMarkers(input.preview_alignment_markers ?? input.previewAlignmentMarkers ?? {});
  const currentMarkers = input.current_alignment_markers || input.currentAlignmentMarkers
    ? createPreviewAlignmentMarkers(input.current_alignment_markers ?? input.currentAlignmentMarkers)
    : createPreviewAlignmentMarkers({
        request: commitRequest,
        activeState: input.current_active_state ?? input.currentActiveState,
      });
  const mismatches = [];

  compareMarkerField('interaction_domain', previewMarkers.interaction_domain, commitRequest.interaction_domain, mismatches);
  compareMarkerField('action_window_id', previewMarkers.action_window_id, commitRequest.action_window_id, mismatches);
  compareMarkerField('source_scene_id', previewMarkers.source_scene_id, commitRequest.source_scene_id, mismatches);
  compareMarkerField('source_dialogue_id', previewMarkers.source_dialogue_id, commitRequest.source_dialogue_id, mismatches);
  compareMarkerField('selected_option_id', previewMarkers.selected_option_id, commitRequest.selected_option_id, mismatches);
  compareMarkerField('selected_option_kind', previewMarkers.selected_option_kind, commitRequest.selected_option_kind, mismatches);
  compareMarkerField('context_version', previewMarkers.context_version, commitRequest.context_version, mismatches);

  compareMarkerField('current.action_window_id', previewMarkers.action_window_id, currentMarkers.action_window_id, mismatches);
  compareMarkerField('current.source_scene_id', previewMarkers.source_scene_id, currentMarkers.source_scene_id, mismatches);
  compareMarkerField('current.source_dialogue_id', previewMarkers.source_dialogue_id, currentMarkers.source_dialogue_id, mismatches);
  compareMarkerField('current.context_version', previewMarkers.context_version, currentMarkers.context_version, mismatches);

  const diagnostics = createPreviewConsistencyDiagnostics({
    preview_alignment_markers: previewMarkers,
    commit_request: commitRequest,
    commit_validation_result: {
      valid: mismatches.length === 0,
      mismatches,
    },
  });

  if (mismatches.length === 0) {
    return {
      valid: true,
      status: PREVIEW_ALIGNMENT_STATUSES.ALIGNED,
      mismatches: [],
      diagnostics,
      response: null,
    };
  }

  return {
    valid: false,
    status: PREVIEW_ALIGNMENT_STATUSES.STALE,
    mismatches,
    diagnostics,
    response: createRecoveryResolutionResponse({
      interactionDomain: commitRequest.interaction_domain,
      recoveryKind: RECOVERY_NEEDED_KINDS.STALE_REQUEST,
      message: 'That preview is no longer current. Review the current scene and preview your action again.',
      failedLifecycleStep: 'validate_commit_against_preview_context',
      gmDevTrace: {
        interactionDomain: commitRequest.interaction_domain,
        request: commitRequest,
        staleDuplicateIdempotencyResult: { stale: true, mismatches },
        playerResultBundle: {
          recovery: {
            message: 'That preview is no longer current. Review the current scene and preview your action again.',
          },
          status: { state: 'recovery_needed', label: 'Preview stale', isRecoveryNeeded: true },
        },
      },
    }),
  };
}

export function comparePreviewExpectationsToResolution(input = {}) {
  const expectations = normalizeArray(input.preview_expectations ?? input.previewExpectations).map(createPreviewExpectationMarker);
  const outcomes = normalizeArray(input.resolution_markers ?? input.resolutionMarkers ?? input.outcome_markers ?? input.outcomeMarkers).map(
    createResolutionOutcomeMarker
  );

  if (expectations.length === 0) {
    return {
      aligned: true,
      status: PREVIEW_ALIGNMENT_STATUSES.NO_EXPECTATIONS,
      matched_expectations: [],
      unmatched_expectations: [],
      unexpected_outcomes: outcomes,
      diagnostics: createPreviewConsistencyDiagnostics({
        preview_expectation_markers: expectations,
        resolution_outcome_markers: outcomes,
        preview_result_alignment: { status: PREVIEW_ALIGNMENT_STATUSES.NO_EXPECTATIONS },
      }),
    };
  }

  const matched = [];
  const unmatched = [];
  const matchedOutcomeIndexes = new Set();
  expectations.forEach((expectation) => {
    const possibleKinds = new Set([
      expectation.expectation_kind,
      ...normalizeArray(expectation.possible_outcome_kinds),
    ].map(normalizedKey));
    const index = outcomes.findIndex((outcome, outcomeIndex) => {
      if (matchedOutcomeIndexes.has(outcomeIndex)) {
        return false;
      }
      const outcomeKinds = [
        normalizedKey(outcome.outcome_kind),
        normalizedKey(outcome.output_kind),
        ...expectationKindsForOutputKind(outcome.outcome_kind).map(normalizedKey),
      ];
      return outcomeKinds.some((kind) => possibleKinds.has(kind));
    });
    if (index >= 0) {
      matchedOutcomeIndexes.add(index);
      matched.push({ expectation, outcome: outcomes[index] });
    } else if (expectation.uncertainty && !['deterministic', 'none'].includes(normalizedKey(expectation.uncertainty))) {
      matched.push({ expectation, outcome: null, uncertainty_applied: true });
    } else {
      unmatched.push(expectation);
    }
  });

  const unexpected = outcomes.filter((_, index) => !matchedOutcomeIndexes.has(index));
  const aligned = unmatched.length === 0;
  const status = aligned
    ? matched.some((entry) => entry.uncertainty_applied)
      ? PREVIEW_ALIGNMENT_STATUSES.ALIGNED_WITH_UNCERTAINTY
      : PREVIEW_ALIGNMENT_STATUSES.ALIGNED
    : PREVIEW_ALIGNMENT_STATUSES.MISMATCHED;

  return {
    aligned,
    status,
    matched_expectations: matched,
    unmatched_expectations: unmatched,
    unexpected_outcomes: unexpected,
    diagnostics: createPreviewConsistencyDiagnostics({
      preview_expectation_markers: expectations,
      resolution_outcome_markers: outcomes,
      preview_result_alignment: {
        status,
        matched_count: matched.length,
        unmatched_count: unmatched.length,
        unexpected_count: unexpected.length,
      },
    }),
  };
}

export function createPreviewConsistencyDiagnostics(input = {}) {
  return {
    preview_request: input.preview_request || input.previewRequest
      ? createResolutionRequest(input.preview_request ?? input.previewRequest)
      : null,
    preview_validation_result: normalizeObject(input.preview_validation_result ?? input.previewValidationResult),
    preview_alignment_markers: input.preview_alignment_markers || input.previewAlignmentMarkers
      ? createPreviewAlignmentMarkers(input.preview_alignment_markers ?? input.previewAlignmentMarkers)
      : null,
    preview_expectation_markers: normalizeArray(input.preview_expectation_markers ?? input.previewExpectationMarkers).map(
      createPreviewExpectationMarker
    ),
    commit_request: input.commit_request || input.commitRequest
      ? createResolutionRequest(input.commit_request ?? input.commitRequest)
      : null,
    commit_validation_result: normalizeObject(input.commit_validation_result ?? input.commitValidationResult),
    selected_outcome: normalizeObject(input.selected_outcome ?? input.selectedOutcome),
    resolution_outcome_markers: normalizeArray(input.resolution_outcome_markers ?? input.resolutionOutcomeMarkers).map(
      createResolutionOutcomeMarker
    ),
    preview_result_alignment: normalizeObject(input.preview_result_alignment ?? input.previewResultAlignment),
    stale_duplicate_idempotency_result: normalizeObject(
      input.stale_duplicate_idempotency_result ?? input.staleDuplicateIdempotencyResult
    ),
    hidden_requirements: normalizeArray(input.hidden_requirements ?? input.hiddenRequirements),
    check_metadata: normalizeArray(input.check_metadata ?? input.checkMetadata),
    mismatch_reason: optionalText(input.mismatch_reason, input.mismatchReason),
    recovery_reason: optionalText(input.recovery_reason, input.recoveryReason),
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

export function createPreviewConsistencyTrace(input = {}) {
  return createResolutionTraceEnvelope({
    ...input,
    validationResult: {
      ...(input.validation_result ?? input.validationResult ?? {}),
      preview_consistency: normalizeObject(input.preview_consistency ?? input.previewConsistency),
    },
    visibilityFilteringNotes: [
      ...normalizeArray(input.visibility_filtering_notes ?? input.visibilityFilteringNotes),
      'preview_alignment_markers_are_gm_dev_only',
      'player_preview_projection_omits_hidden_mechanics',
    ],
  });
}

function projectTransitionDecisionForPlayer(transitionDecision) {
  if (!transitionDecision) {
    return null;
  }
  const transition = createTransitionDecision(transitionDecision);
  return projectForPlayer({
    player_label: transition.player_label,
    player_summary: transition.player_summary,
    safe_status_label: transition.safe_status_label,
  });
}

function projectNextBeatDecisionForPlayer(nextBeatDecision) {
  if (!nextBeatDecision) {
    return null;
  }
  const nextBeat = createNextBeatDecision(nextBeatDecision);
  return projectForPlayer({
    player_label: nextBeat.player_label,
    player_summary: nextBeat.player_summary,
    endpoint_status: nextBeat.endpoint_status,
    review_only: nextBeat.review_only,
  });
}

function projectPreviewForPlayer(preview = {}) {
  const source = normalizeObject(preview);
  const safe = {
    status: optionalText(source.status),
    title: optionalText(source.title),
    message: optionalText(source.message),
    text: optionalText(source.text, source.player_text, source.playerText),
    player_preview: optionalText(source.player_preview, source.playerPreview),
    safe_risk_summary: optionalText(source.safe_risk_summary, source.safeRiskSummary),
    safe_uncertainty: optionalText(source.safe_uncertainty, source.safeUncertainty),
    availability_label: optionalText(source.availability_label, source.availabilityLabel),
    recovery_message: optionalText(source.recovery_message, source.recoveryMessage),
  };
  return projectForPlayer(
    Object.fromEntries(Object.entries(safe).filter(([, value]) => value !== null && value !== undefined))
  );
}

export function projectResolutionResponseForPlayer(responseLike = {}, options = {}) {
  const response = createResolutionResponse(responseLike);
  const projected = {
    response_kind: response.response_kind,
    interaction_domain: response.interaction_domain,
    status: normalizeSafeStatusState(response.status) ?? response.status,
    resolution_id: response.resolution_id,
    player_result_bundle: response.player_result_bundle,
    output_bundle: response.output_bundle ? projectOutputBundleForPlayer(response.output_bundle, options) : null,
    preview: response.preview ? projectPreviewForPlayer(response.preview) : null,
    availability: response.availability ? projectForPlayer(response.availability) : null,
    transition: projectTransitionDecisionForPlayer(response.transition_decision),
    next_beat: projectNextBeatDecisionForPlayer(response.next_beat_decision),
    read_model_refresh_hint: response.read_model_refresh_hook
      ? {
          refresh_kind: response.read_model_refresh_hook.refresh_kind,
          timing: response.read_model_refresh_hook.timing,
          targets: response.read_model_refresh_hook.targets,
        }
      : null,
    recovery: response.recovery_envelope ? projectRecoveryEnvelopeForPlayer(response.recovery_envelope) : null,
    errors: response.errors.map((error) => toPlayerSafeError(error)),
  };
  const safe = projectForPlayer(projected);
  assertNoPlayerHiddenData(safe);
  return safe;
}

export function projectResolutionResponseForGmDev(responseLike = {}, options = {}) {
  const response = createResolutionResponse(responseLike);
  return projectForGmDev(
    {
      ...response,
      output_bundle: response.output_bundle ? projectOutputBundleForGmDev(response.output_bundle, options) : null,
    },
    options
  );
}

export function assertResolutionResponsePlayerSafe(responseLike = {}, options = {}) {
  const playerProjection = projectResolutionResponseForPlayer(responseLike, options);
  assertNoPlayerHiddenData(playerProjection, options);
  return true;
}

export function createResolutionAdapterContract(adapter = {}) {
  const interactionDomain = normalizeSharedInteractionDomain(adapter.interaction_domain ?? adapter.interactionDomain);
  if (!interactionDomain) {
    throw new Error('Resolution adapter requires a valid interaction domain');
  }
  return {
    interaction_domain: interactionDomain,
    name: optionalText(adapter.name) ?? `${interactionDomain}_resolution_adapter`,
    version: optionalText(adapter.version) ?? 'contract-only',
    ...adapter,
    interaction_domain: interactionDomain,
  };
}

export function assertResolutionAdapterContract(adapter = {}, options = {}) {
  const normalized = createResolutionAdapterContract(adapter);
  const requiredMethods = normalizeArray(options.required_methods ?? options.requiredMethods).length > 0
    ? normalizeArray(options.required_methods ?? options.requiredMethods)
    : REQUIRED_RESOLUTION_ADAPTER_METHODS;
  const missing = requiredMethods.filter((method) => typeof normalized[method] !== 'function');
  if (missing.length > 0) {
    const error = new Error(`Resolution adapter is missing required methods: ${missing.join(', ')}`);
    error.missing_methods = missing;
    throw error;
  }
  return true;
}

export function createResolutionOrchestrationMap() {
  return {
    vocabulary: BEAT_RESOLUTION_VOCABULARY,
    interaction_domains: RESOLUTION_INTERACTION_DOMAINS,
    preview_lifecycle: PREVIEW_LIFECYCLE_MAP,
    commit_lifecycle: COMMIT_LIFECYCLE_MAP,
    recovery_lifecycle: RECOVERY_LIFECYCLE_MAP,
    mutation_write_order: ORDERED_MUTATION_WRITE_GROUPS,
    transition_decision_kinds: TRANSITION_DECISION_KINDS,
    next_beat_decision_kinds: NEXT_BEAT_DECISION_KINDS,
    transition_orchestration_rules: [
      'adapter_transition_proposal_or_output_transition_is_normalized_once',
      'recovery_or_unavailable_never_opens_a_normal_next_action_window',
      'exploration_scene_transitions_open_or_keep_exploration_action_windows',
      'dialogue_entry_or_continuation_opens_dialogue_action_windows',
      'dialogue_exit_returns_to_exploration_action_window',
      'future_supported_and_endpoint_handoffs_are_review_only_for_players',
      'player_projection_hides_target_ids_internal_routing_and_future_support_labels',
      'gm_dev_trace_records_transition_next_beat_alignment_diagnostics',
    ],
    read_model_refresh_rules: [
      'player_result_bundle_is_projected_before_player_response',
      'read_model_refresh_occurs_after_committed_writes_and_next_beat_selection',
      'discoveries_in_result_bundle_match_player_visible_knowledge',
      'progress_in_result_bundle_matches_player_visible_objectives',
      'scene_dialogue_or_endpoint_next_beat_matches_refreshed_read_model',
      'recovery_stale_duplicate_read_models_do_not_expose_unsafe_next_actions',
      'player_read_model_projection_hides_debug_mutation_transition_and_future_support_internals',
      'gm_dev_trace_records_read_model_refresh_and_alignment_diagnostics',
    ],
    gm_dev_trace_rules: [
      'resolution_trace_is_generated_or_attached_for_gm_dev_without_schema_migration',
      'trace_lifecycle_checkpoints_cover_request_validation_outcome_outputs_mutation_transition_next_beat_read_model_and_projection',
      'trace_serialization_redacts_tokens_credentials_secrets_and_auth_headers',
      'player_projection_never_includes_gm_dev_trace_or_trace_diagnostics',
      'provenance_inspector_summarizes_output_mutation_transition_next_beat_recovery_and_projection_comparison',
      'gm_dev_projection_preserves_trace_and_provenance_for_authorized_tools',
    ],
    recovery_needed_kinds: RECOVERY_NEEDED_KINDS,
    adapter_methods: REQUIRED_RESOLUTION_ADAPTER_METHODS,
  };
}
