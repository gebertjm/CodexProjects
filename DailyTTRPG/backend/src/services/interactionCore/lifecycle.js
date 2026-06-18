import {
  AVAILABILITY_STATUSES,
  INTERACTION_OPTION_KINDS,
  createAvailability,
  createInteractionResolutionResult,
  createPreviewResult,
  createSubmitResult,
  isCommittedInteractionOption,
  isNonCommittingInquiryOption,
  normalizeSharedInteractionDomain,
} from './contracts.js';
import { createDebugEnvelope } from './debugEnvelope.js';
import {
  RECOVERY_ACTIONS,
  SAFE_INTERACTION_ERROR_CODES,
  createSafeInteractionError,
} from './errors.js';
import { createEmptyOutputBundle, isOutputBundle } from './outputBundle.js';

export const INTERACTION_LIFECYCLE_STATUSES = Object.freeze({
  NOT_STARTED: 'not_started',
  PREVIEWED: 'previewed',
  SUBMITTED: 'submitted',
  RESOLVING: 'resolving',
  RESOLVED: 'resolved',
  COMPLETED: 'completed',
  ENDED: 'ended',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  BLOCKED: 'blocked',
  FUTURE_SUPPORTED: 'future_supported',
});

export const COMMIT_STATES = Object.freeze({
  NO_COMMIT: 'no_commit',
  COMMIT_AVAILABLE: 'commit_available',
  COMMIT_PENDING: 'commit_pending',
  COMMIT_RESOLVED: 'commit_resolved',
  COMMIT_BLOCKED: 'commit_blocked',
  COMMIT_CONSUMED: 'commit_consumed',
});

export const INTERACTION_RESOLUTION_STATUSES = Object.freeze({
  PENDING: 'pending',
  RESOLVED: 'resolved',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXITED: 'exited',
  TRANSITIONED: 'transitioned',
  FUTURE_SUPPORTED: 'future_supported',
});

export const STALE_CONTEXT_FIELDS = Object.freeze([
  'campaign_id',
  'adventure_id',
  'character_id',
  'actor_id',
  'user_id',
  'current_scene_id',
  'current_location_id',
  'active_dialogue_id',
  'interaction_state_version',
  'action_window_id',
  'turn_id',
  'beat_id',
]);

const lifecycleStatusValues = Object.values(INTERACTION_LIFECYCLE_STATUSES);
const commitStateValues = Object.values(COMMIT_STATES);
const resolutionStatusValues = Object.values(INTERACTION_RESOLUTION_STATUSES);

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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getContextField(context, field) {
  const source = normalizeObject(context);
  const camel = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  const aliases = {
    interaction_domain: ['interactionDomain', 'domain'],
    campaign_id: ['campaignId'],
    adventure_id: ['adventureId'],
    character_id: ['characterId'],
    actor_id: ['actorId'],
    user_id: ['userId', 'account_id', 'accountId'],
    current_scene_id: ['currentSceneId', 'scene_id', 'sceneId'],
    current_location_id: ['currentLocationId', 'location_id', 'locationId'],
    active_dialogue_id: ['activeDialogueId', 'dialogue_scene_id', 'dialogueSceneId'],
    interaction_state_version: ['interactionStateVersion', 'context_version', 'contextVersion'],
    action_window_id: ['actionWindowId'],
    turn_id: ['turnId'],
    beat_id: ['beatId'],
  };
  const keys = [field, camel, ...(aliases[field] ?? [])];
  for (const key of keys) {
    if (hasOwn(source, key)) {
      return optionalId(source[key]);
    }
  }
  return null;
}

function normalizeStatus(value, values, fallback) {
  const normalized = normalizedKey(value);
  return values.includes(normalized) ? normalized : fallback;
}

function optionKind(option) {
  return normalizedKey(option?.option_kind ?? option?.optionKind ?? option?.kind);
}

function optionConsumesCommitSlot(option) {
  if (option?.consumes_commit_slot !== undefined) {
    return Boolean(option.consumes_commit_slot);
  }
  if (option?.consumesCommitSlot !== undefined) {
    return Boolean(option.consumesCommitSlot);
  }
  return isCommittedInteractionOption(option);
}

function lifecycleDomain(...values) {
  for (const value of values) {
    const domain =
      normalizeSharedInteractionDomain(value?.interaction_domain ?? value?.interactionDomain ?? value?.domain ?? value);
    if (domain) {
      return domain;
    }
  }
  return null;
}

function lifecycleError(code, input = {}) {
  return createSafeInteractionError({
    code,
    player_safe_message: input.player_safe_message ?? input.playerSafeMessage,
    gm_dev_message: input.gm_dev_message ?? input.gmDevMessage,
    internal_cause: input.internal_cause ?? input.internalCause,
    retryable: input.retryable,
    recovery_action: input.recovery_action ?? input.recoveryAction,
  });
}

function invalidLifecycleResult({ code, playerSafeMessage, gmDevMessage, internalCause, diagnostics }) {
  const error = lifecycleError(code, {
    player_safe_message: playerSafeMessage,
    gm_dev_message: gmDevMessage,
    internal_cause: internalCause,
  });
  return {
    valid: false,
    status: 'invalid',
    code: error.code,
    player_message: error.player_safe_message,
    error,
    diagnostics,
  };
}

export function normalizeInteractionLifecycleStatus(
  value,
  fallback = INTERACTION_LIFECYCLE_STATUSES.NOT_STARTED
) {
  return normalizeStatus(value, lifecycleStatusValues, fallback);
}

export function normalizeCommitState(value, fallback = COMMIT_STATES.COMMIT_AVAILABLE) {
  return normalizeStatus(value, commitStateValues, fallback);
}

export function normalizeInteractionResolutionStatus(
  value,
  fallback = INTERACTION_RESOLUTION_STATUSES.RESOLVED
) {
  return normalizeStatus(value, resolutionStatusValues, fallback);
}

export function isEndedLifecycleStatus(value) {
  const status = normalizeInteractionLifecycleStatus(value, null);
  return [INTERACTION_LIFECYCLE_STATUSES.COMPLETED, INTERACTION_LIFECYCLE_STATUSES.ENDED].includes(status);
}

export function createLifecycleDiagnostics(input = {}) {
  const requestedContext = normalizeObject(input.requested_context ?? input.requestedContext);
  const currentContext = normalizeObject(input.current_context ?? input.currentContext);
  const interactionDomain =
    lifecycleDomain(input.interaction_domain, requestedContext, currentContext) ?? undefined;

  return createDebugEnvelope({
    interactionDomain,
    sourceContentId: input.source_content_id ?? input.sourceContentId,
    actorContext: normalizeObject(input.actor_context ?? input.actorContext),
    availability: normalizeObject(input.availability),
    requirements: normalizeArray(input.requirements),
    staleOrDuplicateDiagnostics: normalizeObject(
      input.stale_or_duplicate_diagnostics ?? input.staleOrDuplicateDiagnostics
    ),
    validationMessages: normalizeArray(input.validation_messages ?? input.validationMessages),
    domainDebug: {
      lifecycle_diagnostics: {
        requested_context: requestedContext,
        current_context: currentContext,
        context_comparison: normalizeArray(input.context_comparison ?? input.contextComparison),
        stale_reason: cleanText(input.stale_reason ?? input.staleReason) || null,
        duplicate_status: cleanText(input.duplicate_status ?? input.duplicateStatus) || null,
        availability_result: normalizeObject(input.availability_result ?? input.availabilityResult),
        failed_requirements: normalizeArray(input.failed_requirements ?? input.failedRequirements),
        commit_state: cleanText(input.commit_state ?? input.commitState) || null,
        interaction_status: cleanText(input.interaction_status ?? input.interactionStatus) || null,
        next_state: normalizeObject(input.next_state ?? input.nextState),
        safe_error_code: cleanText(input.safe_error_code ?? input.safeErrorCode) || null,
        notes: normalizeArray(input.notes).map(String),
      },
      ...normalizeObject(input.domain_debug ?? input.domainDebug),
    },
  });
}

export function validateCurrentInteractionContext(input = {}) {
  const requestedContext = normalizeObject(input.requested_context ?? input.requestedContext);
  const currentContext = normalizeObject(input.current_context ?? input.currentContext);
  const expectedDomain =
    normalizeSharedInteractionDomain(input.expected_domain ?? input.expectedDomain) ??
    lifecycleDomain(currentContext);
  const requestedDomain = lifecycleDomain(requestedContext);
  const currentDomain = lifecycleDomain(currentContext);
  const allowEnded = input.allow_ended === true || input.allowEnded === true;
  const currentStatus = normalizeInteractionLifecycleStatus(
    input.current_status ?? input.currentStatus,
    INTERACTION_LIFECYCLE_STATUSES.NOT_STARTED
  );
  const fields = normalizeArray(input.fields).length > 0 ? normalizeArray(input.fields) : STALE_CONTEXT_FIELDS;
  const comparison = [];

  if (!allowEnded && isEndedLifecycleStatus(currentStatus)) {
    const diagnostics = createLifecycleDiagnostics({
      requestedContext,
      currentContext,
      interactionStatus: currentStatus,
      staleReason: 'interaction_ended',
      safeErrorCode: SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED,
    });
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED,
      gmDevMessage: `Interaction status is ${currentStatus}.`,
      internalCause: { current_status: currentStatus },
      diagnostics,
    });
  }

  if (expectedDomain && requestedDomain && requestedDomain !== expectedDomain) {
    comparison.push({
      field: 'interaction_domain',
      requested: requestedDomain,
      current: expectedDomain,
      valid: false,
      reason: 'wrong_domain',
    });
  }

  if (currentDomain && requestedDomain && currentDomain !== requestedDomain) {
    comparison.push({
      field: 'interaction_domain',
      requested: requestedDomain,
      current: currentDomain,
      valid: false,
      reason: 'domain_mismatch',
    });
  }

  for (const field of fields) {
    const requested = getContextField(requestedContext, field);
    const current = getContextField(currentContext, field);
    const requireField = normalizeArray(input.required_fields ?? input.requiredFields).includes(field);
    if (!requested && !requireField) {
      continue;
    }
    const valid = requested !== null && current !== null && requested === current;
    comparison.push({
      field,
      requested,
      current,
      valid,
      reason: valid ? null : requested === null ? 'missing_requested_value' : 'context_mismatch',
    });
  }

  const failed = comparison.filter((entry) => entry.valid === false);
  if (failed.length > 0) {
    const userFailure = failed.find((entry) => entry.field === 'user_id');
    const code = userFailure
      ? SAFE_INTERACTION_ERROR_CODES.FORBIDDEN
      : SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION;
    const diagnostics = createLifecycleDiagnostics({
      requestedContext,
      currentContext,
      contextComparison: comparison,
      staleReason: failed.map((entry) => `${entry.field}:${entry.reason}`).join(','),
      safeErrorCode: code,
    });
    return invalidLifecycleResult({
      code,
      gmDevMessage: `Context mismatch: ${failed.map((entry) => entry.field).join(', ')}`,
      internalCause: { failed_context_checks: failed },
      diagnostics,
    });
  }

  return {
    valid: true,
    status: 'valid',
    code: null,
    player_message: null,
    error: null,
    checks: comparison,
    diagnostics: createLifecycleDiagnostics({
      requestedContext,
      currentContext,
      contextComparison: comparison,
      interactionStatus: currentStatus,
    }),
  };
}

export function validateInteractionAvailability(input = {}) {
  const option = normalizeObject(input.option);
  const availability = createAvailability(
    input.availability ?? option.availability ?? { status: AVAILABILITY_STATUSES.AVAILABLE }
  );
  const failedRequirements = normalizeArray(
    input.failed_requirements ?? input.failedRequirements ?? availability.requirements
  ).filter((requirement) => {
    const status = normalizedKey(requirement?.status ?? AVAILABILITY_STATUSES.AVAILABLE);
    return status && status !== AVAILABILITY_STATUSES.AVAILABLE;
  });
  const diagnostics = createLifecycleDiagnostics({
    interactionDomain: option.interaction_domain ?? option.interactionDomain,
    availability,
    availabilityResult: availability,
    failedRequirements,
    safeErrorCode: availability.available ? null : SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE,
  });

  if (availability.available) {
    return {
      valid: true,
      available: true,
      status: availability.status,
      player_message: null,
      failed_requirements: [],
      error: null,
      diagnostics,
    };
  }

  const code =
    availability.status === AVAILABILITY_STATUSES.FUTURE_SUPPORTED
      ? SAFE_INTERACTION_ERROR_CODES.TRANSITION_UNAVAILABLE
      : SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE;
  const error = lifecycleError(code, {
    player_safe_message: availability.player_reason,
    gm_dev_message: availability.gm_dev_reason ?? `Availability status: ${availability.status}`,
    internal_cause: {
      availability_status: availability.status,
      failed_requirements: failedRequirements,
    },
    recovery_action:
      availability.status === AVAILABILITY_STATUSES.HIDDEN
        ? RECOVERY_ACTIONS.CHOOSE_ANOTHER_ACTION
        : RECOVERY_ACTIONS.REFRESH_CURRENT_SCENE,
  });

  return {
    valid: false,
    available: false,
    status: availability.status,
    player_message: error.player_safe_message,
    failed_requirements: failedRequirements,
    error,
    diagnostics,
  };
}

export function validateNonCommittingInquiry(input = {}) {
  const option = normalizeObject(input.option);
  const availabilityResult = validateInteractionAvailability({
    option,
    availability: input.availability ?? option.availability,
    failedRequirements: input.failed_requirements ?? input.failedRequirements,
  });
  const kind = optionKind(option);
  const consumesCommitSlot = optionConsumesCommitSlot(option);
  const priorResult = input.prior_result ?? input.priorResult ?? null;
  const allowReopen = input.allow_reopen !== false && input.allowReopen !== false;

  if (kind !== INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY) {
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED,
      gmDevMessage: `Expected non_committing_inquiry but received ${kind || 'unknown'}.`,
      internalCause: { option_kind: kind },
      diagnostics: createLifecycleDiagnostics({
        interactionDomain: option.interaction_domain ?? option.interactionDomain,
        commitState: COMMIT_STATES.NO_COMMIT,
        safeErrorCode: SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED,
      }),
    });
  }

  if (consumesCommitSlot) {
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED,
      gmDevMessage: 'Non-committing inquiry attempted to consume the commit slot.',
      internalCause: { consumes_commit_slot: true },
      diagnostics: createLifecycleDiagnostics({
        interactionDomain: option.interaction_domain ?? option.interactionDomain,
        commitState: COMMIT_STATES.COMMIT_CONSUMED,
        safeErrorCode: SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED,
      }),
    });
  }

  if (!availabilityResult.valid) {
    return {
      ...availabilityResult,
      consumes_commit_slot: false,
      inquiry_state: availabilityResult.status,
    };
  }

  if (priorResult && allowReopen) {
    return {
      valid: true,
      status: 'already_resolved',
      inquiry_state: 'reopen_existing',
      consumes_commit_slot: false,
      prior_result: priorResult,
      error: null,
      diagnostics: createLifecycleDiagnostics({
        interactionDomain: option.interaction_domain ?? option.interactionDomain,
        commitState: COMMIT_STATES.NO_COMMIT,
        notes: ['prior_result_reopened'],
      }),
    };
  }

  return {
    valid: true,
    status: 'available',
    inquiry_state: 'available',
    consumes_commit_slot: false,
    prior_result: null,
    error: null,
    diagnostics: createLifecycleDiagnostics({
      interactionDomain: option.interaction_domain ?? option.interactionDomain,
      commitState: COMMIT_STATES.NO_COMMIT,
    }),
  };
}

export function validateCommittedAction(input = {}) {
  const option = normalizeObject(input.option);
  const interactionStatus = normalizeInteractionLifecycleStatus(
    input.interaction_status ?? input.interactionStatus,
    INTERACTION_LIFECYCLE_STATUSES.NOT_STARTED
  );
  const commitState = normalizeCommitState(
    input.commit_state ?? input.commitState,
    COMMIT_STATES.COMMIT_AVAILABLE
  );
  const kind = optionKind(option);
  const consumesCommitSlot = optionConsumesCommitSlot(option);

  if (isEndedLifecycleStatus(interactionStatus)) {
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED,
      gmDevMessage: `Interaction status is ${interactionStatus}.`,
      internalCause: { interaction_status: interactionStatus },
      diagnostics: createLifecycleDiagnostics({
        interactionDomain: option.interaction_domain ?? option.interactionDomain,
        commitState,
        interactionStatus,
        safeErrorCode: SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED,
      }),
    });
  }

  if (kind !== INTERACTION_OPTION_KINDS.COMMITTED_ACTION || !consumesCommitSlot) {
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED,
      gmDevMessage: 'Committed action helper received a non-committing option.',
      internalCause: { option_kind: kind, consumes_commit_slot: consumesCommitSlot },
      diagnostics: createLifecycleDiagnostics({
        interactionDomain: option.interaction_domain ?? option.interactionDomain,
        commitState,
        interactionStatus,
        safeErrorCode: SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED,
      }),
    });
  }

  if (commitState === COMMIT_STATES.COMMIT_PENDING) {
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING,
      gmDevMessage: 'A committed action is already pending.',
      internalCause: { commit_state: commitState },
      diagnostics: createLifecycleDiagnostics({
        interactionDomain: option.interaction_domain ?? option.interactionDomain,
        commitState,
        interactionStatus,
        duplicateStatus: 'commit_pending',
        safeErrorCode: SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING,
      }),
    });
  }

  if ([COMMIT_STATES.COMMIT_BLOCKED, COMMIT_STATES.COMMIT_CONSUMED].includes(commitState)) {
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE,
      gmDevMessage: `Commit slot is ${commitState}.`,
      internalCause: { commit_state: commitState },
      diagnostics: createLifecycleDiagnostics({
        interactionDomain: option.interaction_domain ?? option.interactionDomain,
        commitState,
        interactionStatus,
        safeErrorCode: SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE,
      }),
    });
  }

  if (input.requested_context || input.requestedContext || input.current_context || input.currentContext) {
    const contextResult = validateCurrentInteractionContext({
      requestedContext: input.requested_context ?? input.requestedContext,
      currentContext: input.current_context ?? input.currentContext,
      currentStatus: interactionStatus,
      expectedDomain: option.interaction_domain ?? option.interactionDomain,
      fields: input.context_fields ?? input.contextFields,
      requiredFields: input.required_fields ?? input.requiredFields,
    });
    if (!contextResult.valid) {
      return contextResult;
    }
  }

  const availabilityResult = validateInteractionAvailability({
    option,
    availability: input.availability ?? option.availability,
    failedRequirements: input.failed_requirements ?? input.failedRequirements,
  });
  if (!availabilityResult.valid) {
    return availabilityResult;
  }

  return {
    valid: true,
    status: 'available',
    commit_state: commitState,
    consumes_commit_slot: true,
    error: null,
    diagnostics: createLifecycleDiagnostics({
      interactionDomain: option.interaction_domain ?? option.interactionDomain,
      commitState,
      interactionStatus,
    }),
  };
}

export function assertPreviewHasNoCommittedEffects(previewLike = {}) {
  const preview = normalizeObject(previewLike);
  const outputBundle = normalizeObject(preview.output_bundle ?? preview.outputBundle);
  const violations = [];

  if (preview.consumes_commit_slot === true || preview.consumesCommitSlot === true) {
    violations.push('preview_consumes_commit_slot');
  }
  if (preview.committed_action_id || preview.committed_move_id || preview.resolution_id) {
    violations.push('preview_created_committed_identifier');
  }
  if (isOutputBundle(outputBundle)) {
    const hasCommittedOutputs =
      outputBundle.player_result !== null ||
      outputBundle.latest_development_output !== null ||
      Object.entries(outputBundle).some(([key, value]) => key.endsWith('_outputs') && Array.isArray(value) && value.length > 0) ||
      normalizeArray(outputBundle.state_writes).length > 0 ||
      normalizeArray(outputBundle.relationship_or_social_writes).length > 0;
    if (hasCommittedOutputs) {
      violations.push('preview_contains_output_bundle_effects');
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    diagnostics: createLifecycleDiagnostics({
      staleOrDuplicateDiagnostics: { preview_effect_violations: violations },
      safeErrorCode: violations.length > 0 ? SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED : null,
    }),
  };
}

export function validatePreviewContextFreshness(input = {}) {
  return validateCurrentInteractionContext(input);
}

export function buildInteractionPreviewLifecycleResult(input = {}) {
  const option = normalizeObject(input.option);
  const debugEnvelope =
    input.debug_envelope ??
    input.debugEnvelope ??
    createLifecycleDiagnostics({
      interactionDomain: input.interaction_domain ?? input.interactionDomain ?? option.interaction_domain,
      requestedContext: input.context,
      availability: input.availability,
      notes: ['preview_does_not_commit'],
    });

  return createPreviewResult({
    interaction_domain: input.interaction_domain ?? input.interactionDomain ?? option.interaction_domain,
    context: input.context,
    option_id: input.option_id ?? input.optionId ?? option.option_id,
    matched_option_id: input.matched_option_id ?? input.matchedOptionId,
    availability: input.availability ?? option.availability,
    player_preview: input.player_preview ?? input.playerPreview,
    check_summary: input.check_summary ?? input.checkSummary,
    output_preview: input.output_preview ?? input.outputPreview,
    consumes_commit_slot: false,
    stale_state_metadata: input.stale_state_metadata ?? input.staleStateMetadata,
    visibility_metadata: input.visibility_metadata ?? input.visibilityMetadata,
    debug_envelope: debugEnvelope,
    domain_result: input.domain_result ?? input.domainResult,
  });
}

export function normalizeIdempotencyKey(value) {
  return optionalId(value);
}

export function validateInteractionSubmit(input = {}) {
  const idempotencyKey = normalizeIdempotencyKey(
    input.idempotency_key ?? input.idempotencyKey ?? input.request?.idempotency_key
  );
  const seen = input.seen_idempotency_keys ?? input.seenIdempotencyKeys;
  const seenKeys = seen instanceof Set ? seen : new Set(normalizeArray(seen).map(normalizeIdempotencyKey).filter(Boolean));
  const allowReplay = input.allow_idempotent_replay === true || input.allowIdempotentReplay === true;

  if (idempotencyKey && seenKeys.has(idempotencyKey)) {
    const diagnostics = createLifecycleDiagnostics({
      interactionDomain: input.interaction_domain ?? input.interactionDomain,
      duplicateStatus: allowReplay ? 'idempotent_replay' : 'duplicate_rejected',
      safeErrorCode: allowReplay ? null : SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING,
      staleOrDuplicateDiagnostics: { idempotency_key: idempotencyKey },
    });
    if (allowReplay) {
      return {
        valid: true,
        status: 'idempotent_replay',
        idempotency_key: idempotencyKey,
        duplicate: true,
        error: null,
        diagnostics,
      };
    }
    return invalidLifecycleResult({
      code: SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING,
      gmDevMessage: 'Duplicate idempotency key was rejected.',
      internalCause: { idempotency_key: idempotencyKey },
      diagnostics,
    });
  }

  const committed = validateCommittedAction({
    option: input.option,
    availability: input.availability,
    commitState: input.commit_state ?? input.commitState,
    interactionStatus: input.interaction_status ?? input.interactionStatus,
    requestedContext: input.requested_context ?? input.requestedContext,
    currentContext: input.current_context ?? input.currentContext,
    contextFields: input.context_fields ?? input.contextFields,
    requiredFields: input.required_fields ?? input.requiredFields,
  });
  if (!committed.valid) {
    return committed;
  }

  return {
    valid: true,
    status: 'accepted',
    idempotency_key: idempotencyKey,
    duplicate: false,
    error: null,
    diagnostics: createLifecycleDiagnostics({
      interactionDomain: input.interaction_domain ?? input.interactionDomain ?? input.option?.interaction_domain,
      commitState: committed.commit_state,
      duplicateStatus: 'not_duplicate',
    }),
  };
}

export function buildInteractionSubmitAccepted(input = {}) {
  return createSubmitResult({
    interaction_domain: input.interaction_domain ?? input.interactionDomain,
    status: input.status ?? 'accepted',
    committed_action_id: input.committed_action_id ?? input.committedActionId,
    committed_move_id: input.committed_move_id ?? input.committedMoveId,
    resolution_id: input.resolution_id ?? input.resolutionId,
    player_status: input.player_status ?? input.playerStatus ?? 'accepted',
    player_message: input.player_message ?? input.playerMessage,
    next_state_summary: input.next_state_summary ?? input.nextStateSummary,
    debug_envelope: input.debug_envelope ?? input.debugEnvelope,
    domain_result: input.domain_result ?? input.domainResult,
  });
}

export function buildInteractionSubmitRejected(input = {}) {
  const error =
    input.error ??
    lifecycleError(input.code ?? SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE, {
      player_safe_message: input.player_safe_message ?? input.playerSafeMessage,
      gm_dev_message: input.gm_dev_message ?? input.gmDevMessage,
      internal_cause: input.internal_cause ?? input.internalCause,
      recovery_action: input.recovery_action ?? input.recoveryAction,
    });
  return {
    interaction_domain: normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain),
    status: 'rejected',
    player_status: 'rejected',
    player_message: error.player_safe_message,
    error,
    debug_envelope:
      input.debug_envelope ??
      input.debugEnvelope ??
      createLifecycleDiagnostics({
        interactionDomain: input.interaction_domain ?? input.interactionDomain,
        safeErrorCode: error.code,
        staleOrDuplicateDiagnostics: { error_code: error.code },
      }),
  };
}

export function buildInteractionResolutionLifecycleResult(input = {}) {
  const outputBundle = isOutputBundle(input.output_bundle ?? input.outputBundle)
    ? input.output_bundle ?? input.outputBundle
    : createEmptyOutputBundle(input.output_bundle ?? input.outputBundle);
  return createInteractionResolutionResult({
    interaction_domain: input.interaction_domain ?? input.interactionDomain,
    resolution_id: input.resolution_id ?? input.resolutionId,
    context: input.context,
    status: normalizeInteractionResolutionStatus(input.status),
    player_result: input.player_result ?? input.playerResult,
    output_bundle: outputBundle,
    next_state: input.next_state ?? input.nextState,
    visibility_metadata: input.visibility_metadata ?? input.visibilityMetadata,
    debug_envelope:
      input.debug_envelope ??
      input.debugEnvelope ??
      createLifecycleDiagnostics({
        interactionDomain: input.interaction_domain ?? input.interactionDomain,
        nextState: input.next_state ?? input.nextState,
        notes: ['resolution_result_built'],
      }),
    domain_result: input.domain_result ?? input.domainResult,
    errors: input.errors,
  });
}

export function attachOutputBundle(resolutionResult, outputBundle = {}) {
  return {
    ...normalizeObject(resolutionResult),
    output_bundle: isOutputBundle(outputBundle) ? outputBundle : createEmptyOutputBundle(outputBundle),
  };
}

export function attachNextState(resolutionResult, nextState = {}) {
  return {
    ...normalizeObject(resolutionResult),
    next_state: normalizeObject(nextState),
  };
}

export function attachLifecycleDebug(resolutionResult, debugEnvelope = {}) {
  return {
    ...normalizeObject(resolutionResult),
    debug_envelope: normalizeObject(debugEnvelope),
  };
}

export function markResolutionStatus(
  resolutionResult,
  status = INTERACTION_RESOLUTION_STATUSES.RESOLVED
) {
  return {
    ...normalizeObject(resolutionResult),
    status: normalizeInteractionResolutionStatus(status),
  };
}

export function createLifecycleSafeError(code, input = {}) {
  return lifecycleError(code, input);
}

export function projectSafeInteractionErrorForPlayer(error = {}) {
  const safeError = createSafeInteractionError(error);
  return {
    code: safeError.code,
    message: safeError.player_safe_message,
    retryable: safeError.retryable,
    recovery_action: safeError.recovery_action,
  };
}

export function projectLifecyclePayloadForPlayer(payload = {}) {
  if (Array.isArray(payload)) {
    return payload.map(projectLifecyclePayloadForPlayer);
  }
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  const stripped = {};
  const hiddenKeys = new Set([
    'debug_envelope',
    'debugEnvelope',
    'diagnostics',
    'gm_dev_message',
    'gmDevMessage',
    'internal_cause',
    'internalCause',
    'failed_requirements',
    'failedRequirements',
    'domain_debug',
    'domainDebug',
    'stale_state_metadata',
    'staleStateMetadata',
  ]);
  for (const [key, value] of Object.entries(payload)) {
    if (hiddenKeys.has(key)) {
      continue;
    }
    stripped[key] = projectLifecyclePayloadForPlayer(value);
  }
  return stripped;
}
