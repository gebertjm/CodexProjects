import { INTERACTION_DOMAINS as CONTENT_INTERACTION_DOMAINS } from './primitiveTypes.js';
import { VISIBILITY_SCOPES, normalizeVisibilityScope } from './visibility.js';

export const SHARED_INTERACTION_DOMAINS = Object.freeze({
  EXPLORATION: 'exploration',
  DIALOGUE: 'dialogue',
  NAVIGATION: 'navigation',
  COMBAT: 'combat',
});

export const INTERACTION_DOMAIN_VALUES = Object.freeze(Object.values(SHARED_INTERACTION_DOMAINS));

export const CONTENT_DOMAIN_TO_SHARED_DOMAIN = Object.freeze({
  [CONTENT_INTERACTION_DOMAINS.EXPLORATION]: SHARED_INTERACTION_DOMAINS.EXPLORATION,
  [CONTENT_INTERACTION_DOMAINS.DIALOGUE]: SHARED_INTERACTION_DOMAINS.DIALOGUE,
});

export const INTERACTION_OPTION_KINDS = Object.freeze({
  SURFACE: 'surface',
  PASSIVE_CONTEXT: 'passive_context',
  NON_COMMITTING_INQUIRY: 'non_committing_inquiry',
  COMMITTED_ACTION: 'committed_action',
  EXIT_OR_TRANSITION: 'exit_or_transition',
  SYSTEM_RESULT: 'system_result',
});

export const INTERACTION_OPTION_KIND_VALUES = Object.freeze(Object.values(INTERACTION_OPTION_KINDS));

export const AVAILABILITY_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  HIDDEN: 'hidden',
  LOCKED: 'locked',
  COMPLETED: 'completed',
  EXHAUSTED: 'exhausted',
  FUTURE_SUPPORTED: 'future_supported',
});

export const AVAILABILITY_STATUS_VALUES = Object.freeze(Object.values(AVAILABILITY_STATUSES));

export const CHECK_MODES = Object.freeze({
  NONE: 'none',
  STANDARD: 'standard',
  ADVANTAGE: 'advantage',
  DISADVANTAGE: 'disadvantage',
  PASSIVE: 'passive',
  NARRATIVE_ONLY: 'narrative_only',
});

export const DC_VISIBILITIES = Object.freeze({
  VISIBLE: 'visible',
  HIDDEN: 'hidden',
  SUCCESS_ONLY: 'success_only',
  NARRATIVE_ONLY: 'narrative_only',
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
    if (value === null || value === undefined) {
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

/**
 * @typedef {'exploration'|'dialogue'|'navigation'|'combat'} InteractionDomain
 * Neutral internal domain name. Content-facing values such as `surface_focus_commit`
 * are normalized through `CONTENT_DOMAIN_TO_SHARED_DOMAIN`.
 */

/**
 * @typedef {'surface'|'passive_context'|'non_committing_inquiry'|'committed_action'|'exit_or_transition'|'system_result'} InteractionOptionKind
 */

/**
 * @typedef {object} InteractionContext
 * @property {InteractionDomain} interaction_domain
 * @property {string|null} campaign_id
 * @property {string|null} adventure_id
 * @property {string|null} character_id
 * @property {string|null} actor_id
 * @property {string|null} user_id
 * @property {string|null} current_scene_id
 * @property {string|null} current_location_id
 * @property {string|null} active_dialogue_id
 * @property {string|null} interaction_state_version
 * @property {string|null} action_window_id
 * @property {string|null} turn_id
 * @property {string|null} beat_id
 * @property {string|null} source_content_id
 * @property {string|null} source_content_type
 * @property {string|null} request_id
 * @property {string|null} correlation_id
 * @property {import('./visibility.js').VisibilityScope} visibility_scope
 * @property {object} domain_context
 */

export function normalizeSharedInteractionDomain(value) {
  const normalized = normalizedKey(value);
  if (INTERACTION_DOMAIN_VALUES.includes(normalized)) {
    return normalized;
  }
  return CONTENT_DOMAIN_TO_SHARED_DOMAIN[normalized] ?? null;
}

export function isSharedInteractionDomain(value) {
  return normalizeSharedInteractionDomain(value) !== null;
}

export function isInteractionOptionKind(value) {
  return INTERACTION_OPTION_KIND_VALUES.includes(normalizedKey(value));
}

export function isAvailabilityStatus(value) {
  return AVAILABILITY_STATUS_VALUES.includes(normalizedKey(value));
}

export function normalizeAvailabilityStatus(value, fallback = AVAILABILITY_STATUSES.UNAVAILABLE) {
  const normalized = normalizedKey(value);
  return isAvailabilityStatus(normalized) ? normalized : fallback;
}

export function createInteractionContext(input = {}) {
  const rawDomain =
    input.interaction_domain ?? input.interactionDomain ?? input.domain ?? input.interactionDomainKey;
  const interactionDomain = normalizeSharedInteractionDomain(rawDomain);
  if (!interactionDomain) {
    throw new Error('InteractionContext requires a valid interaction domain');
  }

  return {
    interaction_domain: interactionDomain,
    campaign_id: optionalId(input.campaign_id, input.campaignId),
    adventure_id: optionalId(input.adventure_id, input.adventureId),
    character_id: optionalId(input.character_id, input.characterId),
    actor_id: optionalId(input.actor_id, input.actorId),
    user_id: optionalId(input.user_id, input.userId, input.account_id, input.accountId),
    current_scene_id: optionalId(input.current_scene_id, input.currentSceneId, input.scene_id),
    current_location_id: optionalId(input.current_location_id, input.currentLocationId, input.location_id),
    active_dialogue_id: optionalId(input.active_dialogue_id, input.activeDialogueId, input.dialogue_scene_id),
    interaction_state_version: optionalId(
      input.interaction_state_version,
      input.interactionStateVersion,
      input.context_version,
      input.contextVersion
    ),
    action_window_id: optionalId(input.action_window_id, input.actionWindowId),
    turn_id: optionalId(input.turn_id, input.turnId),
    beat_id: optionalId(input.beat_id, input.beatId),
    source_content_id: optionalId(input.source_content_id, input.sourceContentId),
    source_content_type: optionalText(input.source_content_type, input.sourceContentType),
    request_id: optionalId(input.request_id, input.requestId),
    correlation_id: optionalId(input.correlation_id, input.correlationId),
    visibility_scope: normalizeVisibilityScope(input.visibility_scope ?? input.visibilityScope, VISIBILITY_SCOPES.SYSTEM_INTERNAL),
    domain_context: normalizeObject(input.domain_context ?? input.domainContext),
  };
}

export function createAvailability(input = {}) {
  const status = normalizeAvailabilityStatus(input.status, AVAILABILITY_STATUSES.UNAVAILABLE);
  return {
    status,
    available: status === AVAILABILITY_STATUSES.AVAILABLE,
    player_reason: optionalText(input.player_reason, input.playerReason),
    gm_dev_reason: optionalText(input.gm_dev_reason, input.gmDevReason, input.debug_reason),
    requirements: normalizeArray(input.requirements),
    visibility_scope: normalizeVisibilityScope(input.visibility_scope ?? input.visibilityScope, VISIBILITY_SCOPES.SYSTEM_INTERNAL),
    metadata: normalizeObject(input.metadata),
  };
}

export function createRequirementResult(input = {}) {
  return {
    requirement_id: optionalId(input.requirement_id, input.requirementId, input.id),
    requirement_kind: optionalText(input.requirement_kind, input.requirementKind, input.kind),
    status: normalizeAvailabilityStatus(input.status, AVAILABILITY_STATUSES.UNAVAILABLE),
    player_reason: optionalText(input.player_reason, input.playerReason),
    gm_dev_reason: optionalText(input.gm_dev_reason, input.gmDevReason, input.debug_reason),
    source: normalizeObject(input.source),
    metadata: normalizeObject(input.metadata),
  };
}

export function createCheckMetadata(input = {}) {
  return {
    check_kind: optionalText(input.check_kind, input.checkKind, input.kind, input.mode),
    mode: optionalText(input.mode) ?? CHECK_MODES.NONE,
    ability: optionalText(input.ability),
    skill: optionalText(input.skill),
    tool: optionalText(input.tool),
    dc: Number.isFinite(Number(input.dc)) ? Number(input.dc) : null,
    dc_visibility: optionalText(input.dc_visibility, input.dcVisibility) ?? DC_VISIBILITIES.HIDDEN,
    advantage: normalizeBoolean(input.advantage, false),
    disadvantage: normalizeBoolean(input.disadvantage, false),
    passive: normalizeBoolean(input.passive, false),
    player_visible_policy: optionalText(input.player_visible_policy, input.playerVisiblePolicy),
    result_band_ids: normalizeArray(input.result_band_ids ?? input.resultBandIds).map(String),
    modifiers: normalizeArray(input.modifiers),
    source_ids: normalizeArray(input.source_ids ?? input.sourceIds).map(String),
    domain_metadata: normalizeObject(input.domain_metadata ?? input.domainMetadata),
  };
}

export function createInteractionOption(input = {}) {
  const interactionDomain = normalizeSharedInteractionDomain(
    input.interaction_domain ?? input.interactionDomain ?? input.domain
  );
  if (!interactionDomain) {
    throw new Error('InteractionOption requires a valid interaction domain');
  }

  const optionKind = normalizedKey(input.option_kind ?? input.optionKind ?? input.kind);
  if (!isInteractionOptionKind(optionKind)) {
    throw new Error('InteractionOption requires a valid option kind');
  }

  return {
    option_id: optionalId(input.option_id, input.optionId, input.id),
    option_kind: optionKind,
    interaction_domain: interactionDomain,
    domain_kind: optionalText(input.domain_kind, input.domainKind),
    label: optionalText(input.label, input.title, input.name),
    title: optionalText(input.title, input.label, input.name),
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary),
    availability: createAvailability(input.availability ?? { status: AVAILABILITY_STATUSES.AVAILABLE }),
    requirements: normalizeArray(input.requirements),
    check_metadata: input.check_metadata || input.checkMetadata ? createCheckMetadata(input.check_metadata ?? input.checkMetadata) : null,
    consumes_commit_slot:
      input.consumes_commit_slot !== undefined || input.consumesCommitSlot !== undefined
        ? normalizeBoolean(input.consumes_commit_slot ?? input.consumesCommitSlot, false)
        : optionKind === INTERACTION_OPTION_KINDS.COMMITTED_ACTION,
    output_preview: normalizeObject(input.output_preview ?? input.outputPreview),
    visibility_metadata: normalizeObject(input.visibility_metadata ?? input.visibilityMetadata),
    debug_metadata: normalizeObject(input.debug_metadata ?? input.debugMetadata),
    domain_payload: normalizeObject(input.domain_payload ?? input.domainPayload),
  };
}

export function createPreviewRequest(input = {}) {
  return {
    context: createInteractionContext(input.context ?? input.interaction_context ?? input.interactionContext ?? input),
    option_id: optionalId(input.option_id, input.optionId),
    freeform_text: optionalText(input.freeform_text, input.freeformText, input.raw_text, input.rawText),
    domain_payload: normalizeObject(input.domain_payload ?? input.domainPayload),
    preview_id: optionalId(input.preview_id, input.previewId),
    context_version: optionalId(input.context_version, input.contextVersion),
    request_id: optionalId(input.request_id, input.requestId),
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
  };
}

export function createPreviewResult(input = {}) {
  const context = input.context || input.interaction_context ? createInteractionContext(input.context ?? input.interaction_context) : null;
  return {
    interaction_domain: normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain ?? context?.interaction_domain),
    context,
    option_id: optionalId(input.option_id, input.optionId),
    matched_option_id: optionalId(input.matched_option_id, input.matchedOptionId),
    availability: createAvailability(input.availability ?? { status: AVAILABILITY_STATUSES.AVAILABLE }),
    player_preview: optionalText(input.player_preview, input.playerPreview),
    check_summary: normalizeObject(input.check_summary ?? input.checkSummary),
    output_preview: normalizeObject(input.output_preview ?? input.outputPreview),
    consumes_commit_slot: normalizeBoolean(input.consumes_commit_slot ?? input.consumesCommitSlot, false),
    stale_state_metadata: normalizeObject(input.stale_state_metadata ?? input.staleStateMetadata),
    visibility_metadata: normalizeObject(input.visibility_metadata ?? input.visibilityMetadata),
    debug_envelope: normalizeObject(input.debug_envelope ?? input.debugEnvelope),
    domain_result: normalizeObject(input.domain_result ?? input.domainResult),
  };
}

export function createSubmitRequest(input = {}) {
  return {
    context: createInteractionContext(input.context ?? input.interaction_context ?? input.interactionContext ?? input),
    option_id: optionalId(input.option_id, input.optionId),
    freeform_text: optionalText(input.freeform_text, input.freeformText, input.raw_text, input.rawText),
    preview_id: optionalId(input.preview_id, input.previewId),
    context_version: optionalId(input.context_version, input.contextVersion),
    idempotency_key: optionalId(input.idempotency_key, input.idempotencyKey),
    request_id: optionalId(input.request_id, input.requestId),
    domain_payload: normalizeObject(input.domain_payload ?? input.domainPayload),
  };
}

export function createSubmitResult(input = {}) {
  return {
    interaction_domain: normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain),
    status: optionalText(input.status) ?? 'accepted',
    committed_action_id: optionalId(input.committed_action_id, input.committedActionId),
    committed_move_id: optionalId(input.committed_move_id, input.committedMoveId),
    resolution_id: optionalId(input.resolution_id, input.resolutionId),
    player_status: optionalText(input.player_status, input.playerStatus),
    player_message: optionalText(input.player_message, input.playerMessage),
    next_state_summary: normalizeObject(input.next_state_summary ?? input.nextStateSummary),
    debug_envelope: normalizeObject(input.debug_envelope ?? input.debugEnvelope),
    domain_result: normalizeObject(input.domain_result ?? input.domainResult),
  };
}

export function createInteractionResolutionResult(input = {}) {
  const context = input.context || input.interaction_context ? createInteractionContext(input.context ?? input.interaction_context) : null;
  return {
    interaction_domain: normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain ?? context?.interaction_domain),
    resolution_id: optionalId(input.resolution_id, input.resolutionId),
    context,
    status: optionalText(input.status) ?? 'resolved',
    player_result: normalizeObject(input.player_result ?? input.playerResult),
    output_bundle: normalizeObject(input.output_bundle ?? input.outputBundle),
    next_state: normalizeObject(input.next_state ?? input.nextState),
    visibility_metadata: normalizeObject(input.visibility_metadata ?? input.visibilityMetadata),
    debug_envelope: normalizeObject(input.debug_envelope ?? input.debugEnvelope),
    domain_result: normalizeObject(input.domain_result ?? input.domainResult),
    errors: normalizeArray(input.errors),
  };
}

export function mapExplorationKindToInteractionOptionKind(kind) {
  const normalized = normalizedKey(kind);
  if (['surface', 'automatic_observation', 'automatic_observations'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.SURFACE;
  }
  if (['passive_context', 'passive_discovery', 'passive_discoveries'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.PASSIVE_CONTEXT;
  }
  if (['free_focus', 'closer_look', 'focus'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY;
  }
  if (['beat_action', 'committed_action', 'action'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.COMMITTED_ACTION;
  }
  if (['transition', 'transitions', 'exit', 'exploration_transition', 'scene_transition'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.EXIT_OR_TRANSITION;
  }
  return null;
}

export function mapDialogueKindToInteractionOptionKind(kind) {
  const normalized = normalizedKey(kind);
  if (['surface', 'conversation_surface'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.SURFACE;
  }
  if (['passive_context', 'passive_social_insight', 'passive_social_insights'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.PASSIVE_CONTEXT;
  }
  if (['clarifying_question', 'clarifying_questions', 'cq'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY;
  }
  if (['committed_social_move', 'committed_social_moves', 'csm'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.COMMITTED_ACTION;
  }
  if (['dialogue_exit', 'dialogue_exits', 'exit', 'transition'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.EXIT_OR_TRANSITION;
  }
  if (['completed_dialogue_record', 'transcript', 'summary'].includes(normalized)) {
    return INTERACTION_OPTION_KINDS.SYSTEM_RESULT;
  }
  return null;
}

export function isCommittedInteractionOption(optionOrKind) {
  const kind =
    typeof optionOrKind === 'string'
      ? optionOrKind
      : optionOrKind?.option_kind ?? optionOrKind?.optionKind;
  return normalizedKey(kind) === INTERACTION_OPTION_KINDS.COMMITTED_ACTION;
}

export function isNonCommittingInquiryOption(optionOrKind) {
  const kind =
    typeof optionOrKind === 'string'
      ? optionOrKind
      : optionOrKind?.option_kind ?? optionOrKind?.optionKind;
  return normalizedKey(kind) === INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY;
}
