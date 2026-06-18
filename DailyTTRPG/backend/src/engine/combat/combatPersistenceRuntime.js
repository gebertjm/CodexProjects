import {
  DEFAULT_COMBAT_RULESET,
  createCombatRulesetIdentity,
} from '../../services/interactionCore/combatAdapterContract.js';
import {
  DND5E_2014_RULESET,
} from './rulesResolution.js';
import {
  PLAYER_TURN_STATUSES,
  refreshCurrentTurnReadModel,
} from './playerTurnRuntime.js';

export const COMBAT_OPERATION_STATUSES = Object.freeze({
  PROPOSED: 'proposed',
  CLAIMED: 'claimed',
  VALIDATING: 'validating',
  COMMITTED: 'committed',
  RESOLVING: 'resolving',
  PAUSED: 'paused',
  WAITING_FOR_REACTION: 'waiting_for_reaction',
  WAITING_FOR_PLAYER: 'waiting_for_player',
  WAITING_FOR_AUTOMATIC_CONTINUATION: 'waiting_for_automatic_continuation',
  RESOLVED: 'resolved',
  DUPLICATE_RETURNED: 'duplicate_returned',
  STALE_REJECTED: 'stale_rejected',
  CONFLICTING_IDEMPOTENCY_REJECTED: 'conflicting_idempotency_rejected',
  FAILED_BEFORE_COMMIT: 'failed_before_commit',
  RECOVERY_NEEDED: 'recovery_needed',
  REPAIRED: 'repaired',
  SUPERSEDED: 'superseded',
  CANCELED: 'canceled',
});

export const COMBAT_OPERATION_TYPES = Object.freeze({
  PLAYER_ACTION: 'player_action',
  PLAYER_MOVEMENT: 'player_movement',
  PLAYER_REACTION: 'player_reaction',
  REACTION_DECLINE: 'reaction_decline',
  AUTOMATIC_OPERATION: 'automatic_operation',
  MULTI_TARGET_ACTION: 'multi_target_action',
  PARTICIPANT_ENTRY: 'participant_entry',
  PARTICIPANT_EXIT: 'participant_exit',
  PARTICIPANT_RE_ENTRY: 'participant_re_entry',
  FACTION_CHANGE: 'faction_change',
  COMBAT_FOCUS_ANSWER: 'combat_focus_answer',
  ENCOUNTER_COMPLETION_HANDOFF: 'encounter_completion_handoff',
  END_TURN: 'end_turn',
  SCHEDULER_TIMEOUT: 'scheduler_timeout',
});

export const COMBAT_CHECKPOINT_KINDS = Object.freeze({
  INTENT_PERSISTED: 'intent_persisted',
  COST_COMMITTED: 'cost_committed',
  ROLL_PERSISTED: 'roll_persisted',
  EFFECT_STEP_COMPLETED: 'effect_step_completed',
  MOVEMENT_SEGMENT_COMMITTED: 'movement_segment_committed',
  REACTION_QUEUE_PERSISTED: 'reaction_queue_persisted',
  REACTION_WINDOW_PERSISTED: 'reaction_window_persisted',
  CONTINUATION_PERSISTED: 'continuation_persisted',
  AUTOMATIC_DECISION_PERSISTED: 'automatic_decision_persisted',
  TARGET_LOCK_PERSISTED: 'target_lock_persisted',
  PER_TARGET_RESULT_PERSISTED: 'per_target_result_persisted',
  PARTICIPANT_EVENT_PERSISTED: 'participant_event_persisted',
  FACTION_EVENT_PERSISTED: 'faction_event_persisted',
  COMBAT_FOCUS_ANSWER_PERSISTED: 'combat_focus_answer_persisted',
  COMPLETION_HANDOFF_PERSISTED: 'completion_handoff_persisted',
  MUTATION_PERSISTED: 'mutation_persisted',
  RESULT_PERSISTED: 'result_persisted',
});

export const COMBAT_RECOVERY_CLASSIFICATIONS = Object.freeze({
  FAILED_BEFORE_AUTHORITY: 'failed_before_authority',
  RESUMABLE_FROM_CHECKPOINT: 'resumable_from_checkpoint',
  AMBIGUOUS_COMMIT: 'ambiguous_commit',
  INVARIANT_VIOLATION: 'invariant_violation',
  MANUAL_REPAIR_REQUIRED: 'manual_repair_required',
});

export const COMBAT_REFRESH_SAFETY = Object.freeze({
  SAFE: 'safe',
  LAST_CONFIRMED_STATE_ONLY: 'last_confirmed_state_only',
  UNSAFE_UNTIL_REPAIR: 'unsafe_until_repair',
});

export const COMBAT_RETRY_SAFETY = Object.freeze({
  SAFE_RETRY: 'safe_retry',
  RESUME_ONLY: 'resume_only',
  UNSAFE: 'unsafe',
});

export const COMBAT_REPAIR_KINDS = Object.freeze({
  RESUME_FROM_CHECKPOINT: 'resume_from_checkpoint',
  MARK_OPERATION_RESOLVED: 'mark_operation_resolved',
  INVALIDATE_UNCOMMITTED_PROPOSAL: 'invalidate_uncommitted_proposal',
  REPAIR_DERIVED_STATE: 'repair_derived_state',
  MARK_INCIDENT_REPAIRED: 'mark_incident_repaired',
});

export const COMBAT_MIGRATION_DECISION_STATUSES = Object.freeze({
  NO_MIGRATION_PROVEN_NEEDED: 'no_migration_proven_needed',
  MIGRATION_EVIDENCE_REQUIRED: 'migration_evidence_required',
  MIGRATION_REQUIRES_OWNER_APPROVAL: 'migration_requires_owner_approval',
  MIGRATION_APPROVED_BY_EVIDENCE: 'migration_approved_by_evidence',
});

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'armor_class',
  'target_armor_class',
  'difficulty_class',
  'raw_roll',
  'roll_record',
  'mutation_plan',
  'idempotency_key',
  'source_state_version',
  'expected_state_version',
  'resulting_state_version',
  'current_state_version',
  'operation_fingerprint',
  'checkpoint',
  'checkpoint_id',
  'dependency_fingerprint',
  'trace',
  'gm_dev',
  'repair_audit',
  'control_mode',
  'hidden_participant',
  'internal',
  'test_override',
]);

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizedKey(value) {
  return cleanText(value).toLowerCase();
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function participantId(input = {}) {
  if (!input || typeof input !== 'object') return cleanText(input);
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function combatId(state = {}) {
  return cleanText(state.combat?.combat_id ?? state.combat_id ?? state.id) || 'combat';
}

function parentTurnId(state = {}, input = {}) {
  return cleanText(input.parent_turn_id ?? input.parentTurnId ?? state.parent_turn?.parent_turn_id ?? state.parent_turn_id) || null;
}

function normalizeRuleset(input = {}) {
  const raw = input.ruleset ?? input.ruleset_identity ?? input.rulesetIdentity ?? input.combat?.ruleset ?? input.combat?.ruleset_identity ?? DND5E_2014_RULESET ?? DEFAULT_COMBAT_RULESET;
  return createCombatRulesetIdentity(raw);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function nextSequence(list = [], field = 'sequence') {
  return asArray(list).reduce((max, entry) => Math.max(max, Number(entry?.[field] ?? 0)), 0) + 1;
}

function parseVersionNumber(version) {
  const match = cleanText(version).match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function normalizeState(state = {}) {
  state.combat = state.combat ?? { combat_id: state.combat_id ?? 'combat', status: 'active', ruleset: DND5E_2014_RULESET };
  state.participants = asArray(state.participants);
  state.parent_turn = state.parent_turn ?? null;
  state.current_state_version = cleanText(state.current_state_version ?? state.combat?.current_state_version ?? state.parent_turn?.current_state_version) || 'combat-v0';
  return state;
}

function snapshotAuthoritativeCombatState(state = {}) {
  const cloned = cloneSerializable(state);
  if (!cloned) return cloned;
  const persistence = cloned.combat_persistence;
  if (persistence) {
    cloned.combat_persistence = {
      schema_version: persistence.schema_version,
      current_state_version: persistence.current_state_version,
      state_version_counter: persistence.state_version_counter,
      event_sequence_counter: persistence.event_sequence_counter,
      operation_order: cloneSerializable(persistence.operation_order ?? []),
      recovery_incident_order: cloneSerializable(persistence.recovery_incident_order ?? []),
    };
  }
  return cloned;
}

export function ensureCombatPersistenceState(input = {}) {
  const state = normalizeState(input.state ?? input);
  const persistence = state.combat_persistence ?? {};
  state.combat_persistence = {
    schema_version: '6D.12-service-state',
    current_state_version: cleanText(persistence.current_state_version ?? state.current_state_version ?? state.parent_turn?.current_state_version) || 'combat-v0',
    state_version_counter: Number(persistence.state_version_counter ?? parseVersionNumber(state.current_state_version ?? state.parent_turn?.current_state_version)),
    event_sequence_counter: Number(persistence.event_sequence_counter ?? asArray(persistence.events).reduce((max, event) => Math.max(max, Number(event.sequence ?? 0)), 0)),
    operations: persistence.operations ?? {},
    operation_order: asArray(persistence.operation_order),
    idempotency_records: persistence.idempotency_records ?? {},
    events: asArray(persistence.events),
    recovery_incidents: persistence.recovery_incidents ?? {},
    recovery_incident_order: asArray(persistence.recovery_incident_order),
    repair_audit: asArray(persistence.repair_audit),
    migration_evidence: asArray(persistence.migration_evidence),
  };
  state.current_state_version = state.combat_persistence.current_state_version;
  if (state.parent_turn) {
    state.parent_turn.current_state_version = state.parent_turn.current_state_version ?? state.current_state_version;
  }
  return state;
}

export function getAuthoritativeCombatStateVersion(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  return state.combat_persistence.current_state_version;
}

export function advanceAuthoritativeCombatStateVersion(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  state.combat_persistence.state_version_counter += 1;
  const next = `combat-v${state.combat_persistence.state_version_counter}`;
  state.combat_persistence.current_state_version = next;
  state.current_state_version = next;
  if (state.parent_turn) {
    state.parent_turn.current_state_version = next;
  }
  if (state.combat) {
    state.combat.current_state_version = next;
  }
  return next;
}

export function createCombatOperationFingerprint(input = {}) {
  const request = input.request ?? input;
  return canonicalJson({
    operation_type: cleanText(input.operation_type ?? input.operationType ?? request.operation_type ?? request.operationType),
    combat_id: cleanText(input.combat_id ?? input.combatId ?? request.combat_id ?? request.combatId),
    parent_turn_id: cleanText(input.parent_turn_id ?? input.parentTurnId ?? request.parent_turn_id ?? request.parentTurnId),
    actor_participant_id: cleanText(input.actor_participant_id ?? input.actorParticipantId ?? request.actor_participant_id ?? request.actorParticipantId ?? request.actor_id),
    action_id: cleanText(input.action_id ?? input.actionId ?? request.action_id ?? request.actionId),
    target_id: cleanText(input.target_id ?? input.targetId ?? request.target_id ?? request.targetId),
    target_ids: asArray(input.target_ids ?? input.targetIds ?? request.target_ids ?? request.targetIds).map(cleanText).sort(),
    destination_zone_id: cleanText(input.destination_zone_id ?? input.destinationZoneId ?? request.destination_zone_id ?? request.destinationZoneId),
    selected_route_id: cleanText(input.selected_route_id ?? input.selectedRouteId ?? request.selected_route_id ?? request.selectedRouteId),
    selected_resource_tier: cleanText(input.selected_resource_tier ?? input.selectedResourceTier ?? request.selected_resource_tier ?? request.selectedResourceTier),
    reaction_window_id: cleanText(input.reaction_window_id ?? input.reactionWindowId ?? request.reaction_window_id ?? request.reactionWindowId),
    reaction_id: cleanText(input.reaction_id ?? input.reactionId ?? request.reaction_id ?? request.reactionId),
    automatic_decision_id: cleanText(input.automatic_decision_id ?? input.automaticDecisionId ?? request.automatic_decision_id ?? request.automaticDecisionId),
    focus_template_id: cleanText(input.template_id ?? input.templateId ?? request.template_id ?? request.templateId),
    participant_event_id: cleanText(input.participant_event_id ?? input.participantEventId ?? request.participant_event_id ?? request.participantEventId),
    faction_event_id: cleanText(input.faction_event_id ?? input.factionEventId ?? request.faction_event_id ?? request.factionEventId),
    completion_handoff_id: cleanText(input.completion_handoff_id ?? input.completionHandoffId ?? request.completion_handoff_id ?? request.completionHandoffId),
    ruleset: normalizeRuleset(input.ruleset ? input : request),
  });
}

function appendLifecycle(operation, status, detail = {}) {
  operation.lifecycle_history = asArray(operation.lifecycle_history);
  operation.lifecycle_history.push({
    sequence: operation.lifecycle_history.length + 1,
    status,
    detail: cloneSerializable(detail),
  });
  operation.lifecycle_status = status;
}

export function appendCombatEvent(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const persistence = state.combat_persistence;
  const sequence = input.sequence ? Number(input.sequence) : persistence.event_sequence_counter + 1;
  if (persistence.events.some((event) => Number(event.sequence) === sequence)) {
    throw new Error(`Duplicate combat event sequence: ${sequence}`);
  }
  if (sequence <= persistence.event_sequence_counter) {
    throw new Error(`Non-monotonic combat event sequence: ${sequence}`);
  }
  persistence.event_sequence_counter = sequence;
  const event = {
    event_id: cleanText(input.event_id ?? input.eventId) || stableId(['combat-event', combatId(state), sequence]),
    sequence,
    event_type: cleanText(input.event_type ?? input.eventType) || 'combat_event',
    combat_id: combatId(state),
    round_number: input.round_number ?? input.roundNumber ?? state.combat?.round_number ?? null,
    parent_turn_id: cleanText(input.parent_turn_id ?? input.parentTurnId ?? state.parent_turn?.parent_turn_id) || null,
    operation_id: cleanText(input.operation_id ?? input.operationId) || null,
    player_safe_summary: cleanText(input.player_safe_summary ?? input.playerSafeSummary) || null,
    detail: cloneSerializable(input.detail ?? {}),
  };
  persistence.events.push(event);
  state.latest_combat_event = event;
  return event;
}

export function beginDurableCombatOperation(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const operationType = cleanText(input.operation_type ?? input.operationType);
  if (!operationType) {
    throw new Error('Durable combat operations require operation_type.');
  }
  const ruleset = normalizeRuleset(input.ruleset ? input : state);
  if (ruleset.system !== DEFAULT_COMBAT_RULESET.system || ruleset.rules_version !== DEFAULT_COMBAT_RULESET.rules_version) {
    return {
      status: COMBAT_OPERATION_STATUSES.FAILED_BEFORE_COMMIT,
      committed: false,
      retry_safe: true,
      player_safe_message: 'That combat operation uses an unsupported rules version.',
      gm_dev_trace: { reason: 'ruleset_mismatch', ruleset },
    };
  }
  const currentVersion = getAuthoritativeCombatStateVersion(state);
  const sourceVersion = cleanText(input.source_state_version ?? input.sourceStateVersion);
  const idempotencyKey = cleanText(input.idempotency_key ?? input.idempotencyKey);
  const idempotencyScope = cleanText(input.idempotency_scope ?? input.idempotencyScope) ||
    stableId(['combat', combatId(state), parentTurnId(state, input), operationType]);
  const fingerprint = input.operation_fingerprint ?? input.operationFingerprint ?? createCombatOperationFingerprint({
    ...input,
    combat_id: combatId(state),
    parent_turn_id: parentTurnId(state, input),
  });
  const idempotencyId = idempotencyKey ? stableId([idempotencyScope, idempotencyKey]) : null;
  if (idempotencyId && state.combat_persistence.idempotency_records[idempotencyId]) {
    const existing = state.combat_persistence.idempotency_records[idempotencyId];
    const existingOperation = state.combat_persistence.operations[existing.operation_id];
    if (existing.operation_fingerprint !== fingerprint) {
      const conflict = {
        status: COMBAT_OPERATION_STATUSES.CONFLICTING_IDEMPOTENCY_REJECTED,
        committed: false,
        idempotency_status: 'conflict',
        player_safe_message: 'That combat choice changed after it was submitted. Review the current state and submit again.',
        gm_dev_trace: {
          idempotency_scope: idempotencyScope,
          operation_id: existing.operation_id,
          existing_fingerprint: existing.operation_fingerprint,
          incoming_fingerprint: fingerprint,
        },
      };
      appendCombatEvent({
        state,
        event_type: 'combat_idempotency_conflict',
        operation_id: existing.operation_id,
        player_safe_summary: 'A repeated combat request was rejected because it changed.',
        detail: conflict.gm_dev_trace,
      });
      return conflict;
    }
    if (existing.result) {
      return {
        ...cloneSerializable(existing.result),
        status: COMBAT_OPERATION_STATUSES.DUPLICATE_RETURNED,
        idempotency_status: 'duplicate',
        duplicate_of_operation_id: existing.operation_id,
      };
    }
    return {
      status: 'resume_existing_operation',
      idempotency_status: 'resume',
      operation: existingOperation,
      operation_id: existing.operation_id,
      classification: classifyIncompleteCombatOperation({ operation: existingOperation }),
    };
  }
  if (sourceVersion && sourceVersion !== currentVersion) {
    return {
      status: COMBAT_OPERATION_STATUSES.STALE_REJECTED,
      committed: false,
      stale: true,
      refresh_safe: COMBAT_REFRESH_SAFETY.SAFE,
      retry_safe: COMBAT_RETRY_SAFETY.SAFE_RETRY,
      player_safe_message: 'The combat state changed. Refresh and review the current turn before trying again.',
      gm_dev_trace: { reason: 'source_state_version_mismatch', source_state_version: sourceVersion, current_state_version: currentVersion },
    };
  }
  const operationId = cleanText(input.operation_id ?? input.operationId) ||
    stableId(['combat-op', combatId(state), idempotencyKey || operationType, state.combat_persistence.operation_order.length + 1]);
  const operation = {
    operation_id: operationId,
    operation_type: operationType,
    ruleset,
    combat_id: combatId(state),
    encounter_id: cleanText(input.encounter_id ?? input.encounterId ?? state.combat?.encounter_id) || null,
    parent_turn_id: parentTurnId(state, input),
    parent_operation_id: cleanText(input.parent_operation_id ?? input.parentOperationId) || null,
    sub_resolution_id: cleanText(input.sub_resolution_id ?? input.subResolutionId) || stableId(['sub', operationId]),
    actor_participant_id: cleanText(input.actor_participant_id ?? input.actorParticipantId ?? input.actor_id ?? input.actorId) || null,
    operation_fingerprint: fingerprint,
    idempotency_scope: idempotencyScope,
    idempotency_key: idempotencyKey || null,
    source_state_version: sourceVersion || currentVersion,
    expected_state_version: currentVersion,
    resulting_state_version: null,
    lifecycle_status: COMBAT_OPERATION_STATUSES.CLAIMED,
    current_checkpoint: null,
    committed_costs: [],
    committed_rolls: [],
    committed_mutations: [],
    ordered_result_data: [],
    pending_work: cloneSerializable(input.pending_work ?? input.pendingWork ?? []),
    checkpoints: [],
    result: null,
    player_result: null,
    gm_dev_trace: null,
    error_classification: null,
    recovery_classification: null,
    last_confirmed_state_snapshot: snapshotAuthoritativeCombatState(state),
    created_order: state.combat_persistence.operation_order.length + 1,
    updated_order: state.combat_persistence.operation_order.length + 1,
    lifecycle_history: [],
  };
  appendLifecycle(operation, COMBAT_OPERATION_STATUSES.CLAIMED, { current_state_version: currentVersion });
  state.combat_persistence.operations[operationId] = operation;
  state.combat_persistence.operation_order.push(operationId);
  if (idempotencyId) {
    state.combat_persistence.idempotency_records[idempotencyId] = {
      idempotency_id: idempotencyId,
      idempotency_scope: idempotencyScope,
      idempotency_key: idempotencyKey,
      operation_id: operationId,
      operation_fingerprint: fingerprint,
      status: 'claimed',
      result: null,
    };
  }
  appendCombatEvent({
    state,
    event_type: 'combat_operation_claimed',
    operation_id: operationId,
    parent_turn_id: operation.parent_turn_id,
    player_safe_summary: 'A combat operation was received.',
    detail: { operation_type: operationType, lifecycle_status: operation.lifecycle_status },
  });
  return {
    status: COMBAT_OPERATION_STATUSES.CLAIMED,
    idempotency_status: idempotencyKey ? 'claimed' : 'unkeyed',
    operation,
    operation_id: operationId,
  };
}

export function recordCombatOperationCheckpoint(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const operationId = cleanText(input.operation_id ?? input.operationId);
  const operation = state.combat_persistence.operations[operationId];
  if (!operation) {
    throw new Error(`Unknown combat operation: ${operationId}`);
  }
  const checkpoint = {
    checkpoint_id: cleanText(input.checkpoint_id ?? input.checkpointId) ||
      stableId(['checkpoint', operationId, operation.checkpoints.length + 1]),
    sequence: operation.checkpoints.length + 1,
    checkpoint_kind: cleanText(input.checkpoint_kind ?? input.checkpointKind) || COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED,
    confirmed: input.confirmed === undefined ? true : Boolean(input.confirmed),
    data: cloneSerializable(input.data ?? input.detail ?? {}),
    pending_work_after: cloneSerializable(input.pending_work_after ?? input.pendingWorkAfter ?? []),
  };
  operation.checkpoints.push(checkpoint);
  operation.current_checkpoint = checkpoint.checkpoint_id;
  operation.pending_work = checkpoint.pending_work_after;
  if (checkpoint.confirmed) {
    if (checkpoint.checkpoint_kind === COMBAT_CHECKPOINT_KINDS.ROLL_PERSISTED) {
      operation.committed_rolls.push(checkpoint.data);
    }
    if (checkpoint.checkpoint_kind === COMBAT_CHECKPOINT_KINDS.COST_COMMITTED) {
      operation.committed_costs.push(checkpoint.data);
    }
    if ([COMBAT_CHECKPOINT_KINDS.MUTATION_PERSISTED, COMBAT_CHECKPOINT_KINDS.EFFECT_STEP_COMPLETED, COMBAT_CHECKPOINT_KINDS.MOVEMENT_SEGMENT_COMMITTED].includes(checkpoint.checkpoint_kind)) {
      operation.committed_mutations.push(checkpoint.data);
    }
    operation.ordered_result_data.push({
      checkpoint_id: checkpoint.checkpoint_id,
      checkpoint_kind: checkpoint.checkpoint_kind,
      data: checkpoint.data,
    });
    operation.last_confirmed_state_snapshot = snapshotAuthoritativeCombatState(state);
  }
  appendLifecycle(operation, input.lifecycle_status ?? COMBAT_OPERATION_STATUSES.RESOLVING, {
    checkpoint_id: checkpoint.checkpoint_id,
    checkpoint_kind: checkpoint.checkpoint_kind,
  });
  appendCombatEvent({
    state,
    event_type: 'combat_operation_checkpoint',
    operation_id: operationId,
    parent_turn_id: operation.parent_turn_id,
    player_safe_summary: 'Combat progress was recorded.',
    detail: { checkpoint_kind: checkpoint.checkpoint_kind, confirmed: checkpoint.confirmed },
  });
  return { operation, checkpoint };
}

export function completeDurableCombatOperation(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const operationId = cleanText(input.operation_id ?? input.operationId);
  const operation = state.combat_persistence.operations[operationId];
  if (!operation) {
    throw new Error(`Unknown combat operation: ${operationId}`);
  }
  const resultingVersion = cleanText(input.resulting_state_version ?? input.resultingStateVersion) || advanceAuthoritativeCombatStateVersion(state);
  operation.resulting_state_version = resultingVersion;
  operation.result = cloneSerializable(input.result ?? {});
  operation.player_result = cloneSerializable(input.player_result ?? input.playerResult ?? projectCombatPersistenceForPlayer({ result: operation.result }).result ?? {});
  operation.gm_dev_trace = cloneSerializable(input.gm_dev_trace ?? input.gmDevTrace ?? {});
  operation.last_confirmed_state_snapshot = snapshotAuthoritativeCombatState(state);
  appendLifecycle(operation, COMBAT_OPERATION_STATUSES.RESOLVED, { resulting_state_version: resultingVersion });
  if (operation.idempotency_key) {
    const idempotencyId = stableId([operation.idempotency_scope, operation.idempotency_key]);
    state.combat_persistence.idempotency_records[idempotencyId] = {
      ...(state.combat_persistence.idempotency_records[idempotencyId] ?? {}),
      idempotency_id: idempotencyId,
      idempotency_scope: operation.idempotency_scope,
      idempotency_key: operation.idempotency_key,
      operation_id: operation.operation_id,
      operation_fingerprint: operation.operation_fingerprint,
      status: 'resolved',
      result: cloneSerializable({
        status: COMBAT_OPERATION_STATUSES.RESOLVED,
        committed: true,
        operation_id: operation.operation_id,
        resulting_state_version: resultingVersion,
        result: operation.result,
        player_result: operation.player_result,
      }),
    };
  }
  appendCombatEvent({
    state,
    event_type: 'combat_operation_resolved',
    operation_id: operationId,
    parent_turn_id: operation.parent_turn_id,
    player_safe_summary: cleanText(input.player_safe_summary ?? input.playerSafeSummary) || 'A combat operation resolved.',
    detail: { resulting_state_version: resultingVersion },
  });
  return {
    status: COMBAT_OPERATION_STATUSES.RESOLVED,
    committed: true,
    operation,
    operation_id: operationId,
    resulting_state_version: resultingVersion,
    result: operation.result,
    player_result: operation.player_result,
  };
}

export function runDurableCombatOperation(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const claimed = beginDurableCombatOperation(input);
  if (claimed.status !== COMBAT_OPERATION_STATUSES.CLAIMED) {
    return claimed;
  }
  const recordCheckpoint = (checkpoint) => recordCombatOperationCheckpoint({ state, operation_id: claimed.operation_id, ...checkpoint });
  try {
    const result = input.execute?.({ state, operation: claimed.operation, recordCheckpoint }) ?? {};
    return completeDurableCombatOperation({
      state,
      operation_id: claimed.operation_id,
      result,
      player_result: input.player_result ?? result.player_result,
      gm_dev_trace: input.gm_dev_trace ?? result.gm_dev_trace,
      player_safe_summary: result.player_safe_summary,
    });
  } catch (error) {
    const operation = state.combat_persistence.operations[claimed.operation_id];
    const classification = classifyIncompleteCombatOperation({
      operation: {
        ...operation,
        ambiguous_commit: error.ambiguous_commit === true || error.ambiguousCommit === true,
        pending_work: error.pending_work ?? operation.pending_work,
      },
      error,
    });
    if (classification.recovery_classification === COMBAT_RECOVERY_CLASSIFICATIONS.FAILED_BEFORE_AUTHORITY) {
      appendLifecycle(operation, COMBAT_OPERATION_STATUSES.FAILED_BEFORE_COMMIT, { error: cleanText(error.message) });
      if (operation.idempotency_key) {
        delete state.combat_persistence.idempotency_records[stableId([operation.idempotency_scope, operation.idempotency_key])];
      }
      return {
        status: COMBAT_OPERATION_STATUSES.FAILED_BEFORE_COMMIT,
        committed: false,
        refresh_safe: classification.refresh_safety,
        retry_safe: classification.retry_safety,
        operation,
        player_safe_message: 'That combat operation did not commit. You can refresh and try again.',
        gm_dev_trace: { error: cleanText(error.message), classification },
      };
    }
    if (classification.recovery_classification === COMBAT_RECOVERY_CLASSIFICATIONS.RESUMABLE_FROM_CHECKPOINT && error.auto_resume !== false) {
      appendLifecycle(operation, COMBAT_OPERATION_STATUSES.PAUSED, { error: cleanText(error.message), pending_work: classification.pending_work });
      return {
        status: COMBAT_OPERATION_STATUSES.PAUSED,
        committed: true,
        resume_available: true,
        operation,
        classification,
        player_safe_message: 'Combat progress was saved and can continue from the last confirmed step.',
      };
    }
    return enterCombatRecoveryNeeded({
      state,
      operation_id: claimed.operation_id,
      reason: cleanText(error.message) || 'combat_operation_interrupted',
      classification: classification.recovery_classification,
      refresh_safety: classification.refresh_safety,
      retry_safety: classification.retry_safety,
      completed_facts: operation.checkpoints.map((checkpoint) => checkpoint.checkpoint_kind),
      retry_safe: false,
      repair_required: true,
    });
  }
}

export function resumeDurableCombatOperation(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const operationId = cleanText(input.operation_id ?? input.operationId);
  const operation = state.combat_persistence.operations[operationId];
  if (!operation) {
    return { status: 'missing_operation', resumed: false };
  }
  const classification = classifyIncompleteCombatOperation({ operation });
  if (classification.recovery_classification !== COMBAT_RECOVERY_CLASSIFICATIONS.RESUMABLE_FROM_CHECKPOINT) {
    return {
      status: 'resume_not_safe',
      resumed: false,
      classification,
      player_safe_message: 'Combat cannot safely resume automatically from this point.',
    };
  }
  const recordCheckpoint = (checkpoint) => recordCombatOperationCheckpoint({ state, operation_id: operationId, ...checkpoint });
  const result = input.resume?.({ state, operation, classification, recordCheckpoint }) ?? {};
  return completeDurableCombatOperation({
    state,
    operation_id: operationId,
    result,
    player_result: result.player_result,
    gm_dev_trace: result.gm_dev_trace,
    player_safe_summary: result.player_safe_summary ?? 'Combat resumed from confirmed progress.',
  });
}

export function classifyIncompleteCombatOperation(input = {}) {
  const operation = input.operation ?? input;
  const checkpoints = asArray(operation.checkpoints);
  if (!operation || operation.lifecycle_status === COMBAT_OPERATION_STATUSES.RESOLVED) {
    return {
      recovery_classification: 'none',
      refresh_safety: COMBAT_REFRESH_SAFETY.SAFE,
      retry_safety: COMBAT_RETRY_SAFETY.UNSAFE,
      pending_work: [],
    };
  }
  if (operation.ambiguous_commit === true || operation.recovery_classification === COMBAT_RECOVERY_CLASSIFICATIONS.AMBIGUOUS_COMMIT) {
    return {
      recovery_classification: COMBAT_RECOVERY_CLASSIFICATIONS.AMBIGUOUS_COMMIT,
      refresh_safety: COMBAT_REFRESH_SAFETY.LAST_CONFIRMED_STATE_ONLY,
      retry_safety: COMBAT_RETRY_SAFETY.UNSAFE,
      pending_work: asArray(operation.pending_work),
      repair_required: true,
    };
  }
  if (checkpoints.length === 0) {
    return {
      recovery_classification: COMBAT_RECOVERY_CLASSIFICATIONS.FAILED_BEFORE_AUTHORITY,
      refresh_safety: COMBAT_REFRESH_SAFETY.SAFE,
      retry_safety: COMBAT_RETRY_SAFETY.SAFE_RETRY,
      pending_work: asArray(operation.pending_work),
      repair_required: false,
    };
  }
  return {
    recovery_classification: COMBAT_RECOVERY_CLASSIFICATIONS.RESUMABLE_FROM_CHECKPOINT,
    refresh_safety: COMBAT_REFRESH_SAFETY.LAST_CONFIRMED_STATE_ONLY,
    retry_safety: COMBAT_RETRY_SAFETY.RESUME_ONLY,
    last_checkpoint_id: checkpoints[checkpoints.length - 1].checkpoint_id,
    pending_work: asArray(operation.pending_work),
    repair_required: false,
  };
}

export function enterCombatRecoveryNeeded(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const operationId = cleanText(input.operation_id ?? input.operationId);
  const operation = operationId ? state.combat_persistence.operations[operationId] : null;
  const incidentId = cleanText(input.incident_id ?? input.incidentId) ||
    stableId(['combat-recovery', combatId(state), state.combat_persistence.recovery_incident_order.length + 1]);
  if (operation) {
    operation.recovery_classification = input.classification ?? COMBAT_RECOVERY_CLASSIFICATIONS.AMBIGUOUS_COMMIT;
    operation.error_classification = cleanText(input.reason) || 'recovery_needed';
    appendLifecycle(operation, COMBAT_OPERATION_STATUSES.RECOVERY_NEEDED, { incident_id: incidentId });
  }
  state.recovery_needed = true;
  state.combat_recovery_needed = true;
  if (state.parent_turn) {
    state.parent_turn.status = PLAYER_TURN_STATUSES.RECOVERY_NEEDED;
    state.parent_turn.recovery_reason = cleanText(input.reason) || 'combat_recovery_needed';
  }
  const incident = {
    incident_id: incidentId,
    combat_id: combatId(state),
    operation_id: operationId || null,
    classification: input.classification ?? COMBAT_RECOVERY_CLASSIFICATIONS.AMBIGUOUS_COMMIT,
    reason: cleanText(input.reason) || 'combat_recovery_needed',
    refresh_safety: input.refresh_safety ?? input.refreshSafety ?? COMBAT_REFRESH_SAFETY.LAST_CONFIRMED_STATE_ONLY,
    retry_safety: input.retry_safety ?? input.retrySafety ?? COMBAT_RETRY_SAFETY.UNSAFE,
    retry_safe: Boolean(input.retry_safe ?? false),
    repair_required: input.repair_required === undefined ? true : Boolean(input.repair_required),
    completed_facts: cloneSerializable(input.completed_facts ?? input.completedFacts ?? []),
    last_confirmed_state: operation?.last_confirmed_state_snapshot ?? snapshotAuthoritativeCombatState(state),
    status: 'open',
  };
  state.combat_persistence.recovery_incidents[incidentId] = incident;
  state.combat_persistence.recovery_incident_order.push(incidentId);
  appendCombatEvent({
    state,
    event_type: 'combat_recovery_needed',
    operation_id: operationId,
    player_safe_summary: 'Combat needs review before ordinary controls return.',
    detail: { incident_id: incidentId, classification: incident.classification },
  });
  return {
    status: COMBAT_OPERATION_STATUSES.RECOVERY_NEEDED,
    committed: false,
    recovery_needed: true,
    incident,
    read_model: buildCombatRecoveryPlayerReadModel({ state, incident }),
    gm_dev_trace: { incident, operation },
    refresh_safe: incident.refresh_safety,
    retry_safe: incident.retry_safe,
  };
}

export function inspectCombatRecoveryState(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const incidentId = cleanText(input.incident_id ?? input.incidentId) ||
    state.combat_persistence.recovery_incident_order[state.combat_persistence.recovery_incident_order.length - 1];
  const incident = state.combat_persistence.recovery_incidents[incidentId] ?? null;
  return {
    status: incident ? 'found' : 'none',
    incident,
    operation: incident?.operation_id ? state.combat_persistence.operations[incident.operation_id] : null,
    player_read_model: incident ? buildCombatRecoveryPlayerReadModel({ state, incident }) : null,
  };
}

export function buildCombatRecoveryPlayerReadModel(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const incident = input.incident ?? inspectCombatRecoveryState({ state }).incident;
  const affected = incident?.operation_id ? state.combat_persistence.operations[incident.operation_id] : null;
  const readModel = {
    combat_id: combatId(state),
    status: 'recovery_needed',
    message: 'Combat needs GM review before ordinary controls return.',
    affected_turn: affected?.parent_turn_id ?? state.parent_turn?.parent_turn_id ?? null,
    affected_operation: affected ? {
      operation_type: affected.operation_type,
      plain_label: operationPlainLabel(affected.operation_type),
    } : null,
    refresh_safety: incident?.refresh_safety ?? COMBAT_REFRESH_SAFETY.LAST_CONFIRMED_STATE_ONLY,
    retry_safety: incident?.retry_safety ?? COMBAT_RETRY_SAFETY.UNSAFE,
    waiting_for_repair: incident?.repair_required !== false,
    ordinary_controls_available: false,
    movement_controls_available: false,
    action_controls_available: false,
    reaction_controls_available: false,
    end_turn_available: false,
    confirmed_state_summary: {
      combat_status: state.combat?.status ?? null,
      round_number: state.combat?.round_number ?? null,
      current_actor: state.combat?.current_participant_id ?? state.current_participant_id ?? null,
      latest_event: state.latest_combat_event?.player_safe_summary ?? null,
    },
  };
  assertNoCombatPersistencePlayerHiddenData(readModel);
  return readModel;
}

function operationPlainLabel(operationType) {
  const label = cleanText(operationType).replace(/_/g, ' ');
  return label ? label[0].toUpperCase() + label.slice(1) : 'Combat operation';
}

export function reconstructCombatAggregate(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const operations = state.combat_persistence.operation_order.map((id) => state.combat_persistence.operations[id]).filter(Boolean);
  return {
    combat_id: combatId(state),
    ruleset: normalizeRuleset(state),
    encounter_id: state.combat?.encounter_id ?? null,
    combat_status: state.combat?.status ?? null,
    round_number: state.combat?.round_number ?? null,
    initiative_position: state.combat?.initiative_position ?? null,
    current_participant_id: state.combat?.current_participant_id ?? state.current_participant_id ?? null,
    participants: cloneSerializable(state.participants),
    faction_relationships: cloneSerializable(state.faction_relationships ?? []),
    spatial: cloneSerializable(state.spatial ?? {}),
    parent_turn: cloneSerializable(state.parent_turn ?? null),
    reaction_state: {
      queues: cloneSerializable(state.reaction_queues ?? []),
      windows: cloneSerializable(state.reaction_windows ?? []),
      resources: cloneSerializable(state.reaction_resources ?? {}),
      continuations: cloneSerializable(state.continuation_points ?? []),
    },
    automatic_state: cloneSerializable(state.automatic_orchestration ?? state.automatic_turn_state ?? null),
    target_locks: cloneSerializable(state.target_locks ?? state.target_set_locks ?? []),
    participant_events: cloneSerializable(state.participant_event_records ?? {}),
    combat_focus_answers: cloneSerializable(state.combat_focus_answers ?? []),
    encounter_completion_handoff: cloneSerializable(state.encounter_completion_handoff ?? null),
    operations,
    latest_authoritative_event: cloneSerializable(state.latest_combat_event ?? null),
    state_version: getAuthoritativeCombatStateVersion(state),
  };
}

export function reconstructLastConfirmedCombatState(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const operationId = cleanText(input.operation_id ?? input.operationId);
  const operation = operationId ? state.combat_persistence.operations[operationId] : null;
  return cloneSerializable(operation?.last_confirmed_state_snapshot ?? snapshotAuthoritativeCombatState(state));
}

export function rebuildCombatPersistenceReadModels(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  let currentTurnReadModel = null;
  try {
    currentTurnReadModel = refreshCurrentTurnReadModel({ state });
  } catch {
    currentTurnReadModel = null;
  }
  const player = state.recovery_needed || state.combat_recovery_needed
    ? buildCombatRecoveryPlayerReadModel({ state })
    : {
        combat_id: combatId(state),
        status: state.combat?.status ?? 'active',
        current_turn: currentTurnReadModel,
        latest_event: state.latest_combat_event?.player_safe_summary ?? null,
        state_marker: 'current',
      };
  assertNoCombatPersistencePlayerHiddenData(player);
  return {
    player,
    gm_dev: {
      aggregate: reconstructCombatAggregate({ state }),
      operations: cloneSerializable(state.combat_persistence.operations),
      idempotency_records: cloneSerializable(state.combat_persistence.idempotency_records),
      recovery_incidents: cloneSerializable(state.combat_persistence.recovery_incidents),
    },
  };
}

export function validateCombatPersistenceInvariants(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  const violations = [];
  const activeTurns = asArray(state.parent_turn_history).filter((turn) => ['open', 'waiting_for_player', 'paused_for_reaction'].includes(turn.status));
  if (state.parent_turn && ['open', 'waiting_for_player', 'paused_for_reaction'].includes(state.parent_turn.status)) {
    activeTurns.push(state.parent_turn);
  }
  const activeTurnKeys = new Set();
  for (const turn of activeTurns) {
    const key = stableId([turn.combat_id ?? combatId(state), turn.actor_participant_id, turn.parent_turn_id]);
    if (activeTurnKeys.has(key)) violations.push({ code: 'duplicate_active_turn', key });
    activeTurnKeys.add(key);
  }
  const initiativeSeen = new Set();
  for (const participant of asArray(state.participants)) {
    const position = participant.initiative_position ?? participant.turn_order;
    if (position !== undefined && position !== null) {
      if (initiativeSeen.has(String(position))) violations.push({ code: 'duplicate_initiative', position });
      initiativeSeen.add(String(position));
    }
  }
  const rollSeen = new Map();
  const completionSeen = new Set();
  const eventSequences = new Set();
  let previousSequence = 0;
  for (const event of asArray(state.combat_persistence.events)) {
    const sequence = Number(event.sequence ?? 0);
    if (eventSequences.has(sequence)) violations.push({ code: 'duplicate_event_sequence', sequence });
    if (sequence <= previousSequence) violations.push({ code: 'non_monotonic_event_sequence', sequence, previous_sequence: previousSequence });
    eventSequences.add(sequence);
    previousSequence = sequence;
  }
  for (const operation of Object.values(state.combat_persistence.operations)) {
    for (const roll of asArray(operation.committed_rolls)) {
      const rollId = cleanText(roll.roll_id ?? roll.rollId ?? roll.id);
      if (rollId) {
        const prior = rollSeen.get(rollId);
        if (prior && canonicalJson(prior) !== canonicalJson(roll)) violations.push({ code: 'conflicting_roll', roll_id: rollId });
        rollSeen.set(rollId, roll);
      }
    }
    const reactionSpends = asArray(operation.committed_costs).filter((cost) => cleanText(cost.resource) === 'reaction' || cleanText(cost.resource_id) === 'reaction');
    if (reactionSpends.length > 1) violations.push({ code: 'double_reaction_spend', operation_id: operation.operation_id });
    const targetOrder = asArray(operation.target_order ?? operation.result?.target_order);
    const perTarget = asArray(operation.per_target_results ?? operation.result?.per_target_results);
    if (operation.operation_type === COMBAT_OPERATION_TYPES.MULTI_TARGET_ACTION && targetOrder.length > 0 && perTarget.length > targetOrder.length) {
      violations.push({ code: 'incomplete_target_order', operation_id: operation.operation_id });
    }
    const handoffId = cleanText(operation.result?.completion_handoff_id ?? operation.completion_handoff_id);
    if (handoffId) {
      if (completionSeen.has(handoffId)) violations.push({ code: 'duplicate_completion_handoff', completion_handoff_id: handoffId });
      completionSeen.add(handoffId);
    }
    for (const continuation of asArray(operation.continuation_points ?? operation.result?.continuation_points)) {
      if (continuation.parent_operation_id && !state.combat_persistence.operations[continuation.parent_operation_id]) {
        violations.push({ code: 'missing_continuation_parent', continuation_id: continuation.continuation_id });
      }
    }
  }
  const activeConcentrations = asArray(state.concentrations ?? (state.concentration ? [state.concentration] : []))
    .filter((entry) => entry && entry.active !== false);
  const concentrationByParticipant = new Set();
  for (const concentration of activeConcentrations) {
    const id = cleanText(concentration.participant_id ?? concentration.source_participant_id);
    if (id && concentrationByParticipant.has(id)) violations.push({ code: 'double_concentration', participant_id: id });
    if (id) concentrationByParticipant.add(id);
  }
  for (const participant of asArray(state.participants)) {
    const death = participant.death_save_state ?? participant.death_saves;
    if (death) {
      const successes = Number(death.successes ?? 0);
      const failures = Number(death.failures ?? 0);
      if (successes < 0 || successes > 3 || failures < 0 || failures > 3) violations.push({ code: 'invalid_death_save_count', participant_id: participantId(participant) });
    }
  }
  if (violations.length > 0 && input.enter_recovery === true) {
    enterCombatRecoveryNeeded({
      state,
      classification: COMBAT_RECOVERY_CLASSIFICATIONS.INVARIANT_VIOLATION,
      reason: 'combat_invariant_violation',
      completed_facts: violations.map((entry) => entry.code),
      refresh_safety: COMBAT_REFRESH_SAFETY.LAST_CONFIRMED_STATE_ONLY,
      retry_safety: COMBAT_RETRY_SAFETY.UNSAFE,
    });
  }
  return { valid: violations.length === 0, violations };
}

export function applyCombatRecoveryRepair(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  if (input.authorized_gm_dev !== true && input.authorizedGmDev !== true) {
    return { status: 'unauthorized', repaired: false, player_safe_message: 'Only authorized GM tools can repair combat recovery.' };
  }
  const incidentId = cleanText(input.incident_id ?? input.incidentId) ||
    state.combat_persistence.recovery_incident_order[state.combat_persistence.recovery_incident_order.length - 1];
  const incident = state.combat_persistence.recovery_incidents[incidentId];
  if (!incident) return { status: 'missing_incident', repaired: false };
  const repairKind = cleanText(input.repair_kind ?? input.repairKind);
  const operation = incident.operation_id ? state.combat_persistence.operations[incident.operation_id] : null;
  if (!Object.values(COMBAT_REPAIR_KINDS).includes(repairKind)) {
    return { status: 'unsupported_repair', repaired: false };
  }
  if (repairKind === COMBAT_REPAIR_KINDS.MARK_OPERATION_RESOLVED && operation) {
    appendLifecycle(operation, COMBAT_OPERATION_STATUSES.REPAIRED, { repair_kind: repairKind });
    operation.result = cloneSerializable(input.result ?? operation.result ?? { repaired: true });
    operation.resulting_state_version = operation.resulting_state_version ?? getAuthoritativeCombatStateVersion(state);
  }
  if (repairKind === COMBAT_REPAIR_KINDS.INVALIDATE_UNCOMMITTED_PROPOSAL && operation) {
    appendLifecycle(operation, COMBAT_OPERATION_STATUSES.CANCELED, { repair_kind: repairKind });
  }
  if (repairKind === COMBAT_REPAIR_KINDS.REPAIR_DERIVED_STATE && input.patch && typeof input.patch === 'object') {
    state.derived_repair_marker = cloneSerializable(input.patch);
  }
  incident.status = 'repaired';
  incident.repair_kind = repairKind;
  incident.repaired_by = cleanText(input.repaired_by ?? input.repairedBy) || 'gm_dev';
  const audit = {
    repair_id: stableId(['combat-repair', combatId(state), state.combat_persistence.repair_audit.length + 1]),
    incident_id: incidentId,
    repair_kind: repairKind,
    operation_id: incident.operation_id,
    reason: cleanText(input.reason) || null,
  };
  state.combat_persistence.repair_audit.push(audit);
  state.recovery_needed = state.combat_persistence.recovery_incident_order
    .map((id) => state.combat_persistence.recovery_incidents[id])
    .some((entry) => entry.status !== 'repaired');
  state.combat_recovery_needed = state.recovery_needed;
  if (!state.recovery_needed && state.parent_turn?.status === PLAYER_TURN_STATUSES.RECOVERY_NEEDED) {
    state.parent_turn.status = PLAYER_TURN_STATUSES.OPEN;
  }
  appendCombatEvent({
    state,
    event_type: 'combat_recovery_repaired',
    operation_id: incident.operation_id,
    player_safe_summary: 'Combat recovery was reviewed.',
    detail: audit,
  });
  const invariant = validateCombatPersistenceInvariants({ state });
  return { status: 'repaired', repaired: true, incident, audit, invariant };
}

export function evaluateCombatMigrationEvidence(input = {}) {
  const deficiencies = asArray(input.deficiencies ?? input.gaps);
  const proven = deficiencies.filter((entry) =>
    entry.reproduced === true &&
    cleanText(entry.failing_test) &&
    cleanText(entry.schema_gap) &&
    asArray(entry.alternatives_considered ?? entry.alternatives).length > 0 &&
    cleanText(entry.smallest_change ?? entry.smallestMigration)
  );
  const decision = {
    status: proven.length === 0
      ? COMBAT_MIGRATION_DECISION_STATUSES.NO_MIGRATION_PROVEN_NEEDED
      : input.owner_approved === true || input.ownerApproved === true
        ? COMBAT_MIGRATION_DECISION_STATUSES.MIGRATION_APPROVED_BY_EVIDENCE
        : COMBAT_MIGRATION_DECISION_STATUSES.MIGRATION_REQUIRES_OWNER_APPROVAL,
    considered_deficiency_count: deficiencies.length,
    proven_deficiency_count: proven.length,
    migration_added: false,
    evidence_package: proven.map((entry) => ({
      failing_test: cleanText(entry.failing_test),
      schema_gap: cleanText(entry.schema_gap),
      alternatives_considered: cloneSerializable(entry.alternatives_considered ?? entry.alternatives),
      smallest_change: cleanText(entry.smallest_change ?? entry.smallestMigration),
      compatibility: cleanText(entry.compatibility) || null,
      backfill: cleanText(entry.backfill) || null,
    })),
  };
  if (decision.status === COMBAT_MIGRATION_DECISION_STATUSES.MIGRATION_APPROVED_BY_EVIDENCE) {
    decision.migration_added = Boolean(input.migration_added);
  }
  return decision;
}

export function projectCombatPersistenceForPlayer(payload = {}) {
  const projected = {
    status: payload.status ?? payload.result?.status ?? null,
    result: payload.result?.player_result ?? payload.player_result ?? payload.playerResult ?? null,
    recovery: payload.recovery ? {
      status: 'recovery_needed',
      message: payload.recovery.message ?? 'Combat needs review before ordinary controls return.',
      refresh_safety: payload.recovery.refresh_safety ?? null,
      retry_safety: payload.recovery.retry_safety ?? null,
      waiting_for_repair: payload.recovery.waiting_for_repair ?? true,
    } : null,
    read_model: payload.read_model ?? null,
  };
  assertNoCombatPersistencePlayerHiddenData(projected);
  return projected;
}

export function buildCombatPersistenceGmDevTrace(input = {}) {
  const state = input.state ? ensureCombatPersistenceState(input.state) : null;
  return {
    trace_kind: 'combat_persistence_replay_recovery',
    contract_version: '6D.12',
    combat_id: state ? combatId(state) : cleanText(input.combat_id),
    operation_id: cleanText(input.operation_id ?? input.operationId) || null,
    operation: state && input.operation_id ? cloneSerializable(state.combat_persistence.operations[input.operation_id]) : cloneSerializable(input.operation ?? null),
    idempotency_records: input.include_idempotency === true && state ? cloneSerializable(state.combat_persistence.idempotency_records) : undefined,
    recovery_incidents: input.include_recovery === true && state ? cloneSerializable(state.combat_persistence.recovery_incidents) : undefined,
    invariant_result: input.invariant_result ?? null,
    visibility_filtering_notes: [
      'player_projection_omits_operation_fingerprints_checkpoints_idempotency_and_repair_audit',
      'gm_dev_trace_retains_authoritative_replay_and_recovery_diagnostics',
      ...(input.visibility_filtering_notes ?? []),
    ],
  };
}

export function assertNoCombatPersistencePlayerHiddenData(payload = {}) {
  const text = JSON.stringify(payload);
  const leaked = PLAYER_PROHIBITED_KEYS.find((key) => text.includes(key));
  if (leaked) {
    throw new Error(`Combat persistence player payload contains internal data: ${leaked}`);
  }
  return true;
}

export function getCombatPersistenceInventory(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  return {
    directly_serialized: [
      'combat',
      'participants',
      'parent_turn',
      'conditions',
      'concentration',
      'spatial',
      'reaction_windows',
      'reaction_queues',
      'continuation_points',
      'automatic_orchestration',
      'target_locks',
      'participant_event_records',
      'combat_focus_answers',
      'encounter_completion_handoff',
      'combat_persistence.operations',
      'combat_persistence.idempotency_records',
      'combat_persistence.events',
      'combat_persistence.recovery_incidents',
    ],
    derivable: [
      'player_read_model',
      'gm_dev_read_model',
      'latest_event_summary',
      'current_focus_suggestions',
    ],
    response_scoped_risks: [
      'external_database_transaction_commit_uncertainty_without_db_adapter',
      'durable_cross_process_storage_depends_on caller persisting serialized aggregate',
    ],
    state_version: getAuthoritativeCombatStateVersion(state),
  };
}
