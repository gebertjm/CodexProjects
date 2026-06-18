import { createSafeInteractionError } from './errors.js';
import { normalizeVisibilityScope, VISIBILITY_SCOPES } from './visibility.js';

export const PLAYER_HIDDEN_FIELD_KEYS = Object.freeze([
  'hiddenDc',
  'hidden_dc',
  'dcHidden',
  'rawRoll',
  'raw_roll',
  'rollTotal',
  'totalResult',
  'total_result',
  'modifierBreakdown',
  'modifier_breakdown',
  'resultBand',
  'result_band',
  'resultBands',
  'result_bands',
  'selectedResultBand',
  'selected_result_band',
  'selectedResultBandId',
  'selected_result_band_id',
  'branchId',
  'branch_id',
  'hiddenRequirements',
  'hidden_requirements',
  'failedRequirementIds',
  'failed_requirement_ids',
  'exactFailedRequirements',
  'exact_failed_requirements',
  'gmNotes',
  'gm_notes',
  'gmDevMessage',
  'gm_dev_message',
  'gmDevReason',
  'gm_dev_reason',
  'gmDevDetails',
  'gm_dev_details',
  'debug',
  'debugSummary',
  'debug_summary',
  'debugEnvelope',
  'debug_envelope',
  'diagnostics',
  'internal',
  'internalCause',
  'internal_cause',
  'stack',
  'stackTrace',
  'stack_trace',
  'stateReads',
  'state_reads',
  'stateWrites',
  'state_writes',
  'rawRelationshipState',
  'raw_relationship_state',
  'relationshipMeters',
  'relationship_meters',
  'relationshipAudit',
  'relationship_audit',
  'relationshipAuditLinks',
  'relationship_audit_links',
  'rawSocialState',
  'raw_social_state',
  'socialMeters',
  'social_meters',
  'environmentDebug',
  'environment_debug',
  'environmentModifierInternals',
  'environment_modifier_internals',
  'npcScheduleDebug',
  'npc_schedule_debug',
  'previewConfidence',
  'preview_confidence',
  'routingConfidence',
  'routing_confidence',
  'previewMapping',
  'preview_mapping',
  'pathHarness',
  'path_harness',
  'expectedPath',
  'expected_path',
  'validationWarnings',
  'validation_warnings',
  'debugNotices',
  'debug_notices',
  'instrumentation',
  'futureSupportedInternal',
  'future_supported_internal',
  'futureSupportedReason',
  'future_supported_reason',
  'gmDevRouting',
  'gm_dev_routing',
  'combatRouting',
  'combat_routing',
  'hiddenClueMetadata',
  'hidden_clue_metadata',
  'finalMystery',
  'final_mystery',
  'gmOnlyTruth',
  'gm_only_truth',
  'annotationCorrectionInternal',
  'annotation_correction_internal',
  'gmDevContentRef',
  'gm_dev_content_ref',
  'gmDevContentRefJson',
  'gm_dev_content_ref_json',
  'rawRuntimeState',
  'raw_runtime_state',
]);

export const PLAYER_HIDDEN_VALUE_PATTERNS = Object.freeze([
  { id: 'hidden_dc', pattern: /\bhidden_dc\b/i },
  { id: 'raw_roll', pattern: /\braw_roll\b/i },
  { id: 'total_result', pattern: /\btotal_result\b/i },
  { id: 'modifier_breakdown', pattern: /\bmodifier_breakdown\b/i },
  { id: 'selected_result_band', pattern: /\bselected_result_band\b/i },
  { id: 'branch_id', pattern: /\bbranch_id\b/i },
  { id: 'hidden_requirements', pattern: /\bhidden_requirements\b/i },
  { id: 'exact_failed_requirements', pattern: /\bexact_failed_requirements\b/i },
  { id: 'gm_notes', pattern: /\bgm_notes\b/i },
  { id: 'debug_envelope', pattern: /\bdebug_envelope\b/i },
  { id: 'debug_summary', pattern: /\bdebug_summary\b/i },
  { id: 'internal_cause', pattern: /\binternal_cause\b/i },
  { id: 'state_reads', pattern: /\bstate_reads\b/i },
  { id: 'state_writes', pattern: /\bstate_writes\b/i },
  { id: 'relationship_audit', pattern: /\brelationship_audit\b/i },
  { id: 'preview_confidence', pattern: /\bpreview_confidence\b/i },
  { id: 'routing_confidence', pattern: /\brouting_confidence\b/i },
  { id: 'preview_mapping', pattern: /\bpreview_mapping\b/i },
  { id: 'path_harness', pattern: /\bpath_harness\b/i },
  { id: 'expected_path', pattern: /\bexpected_path\b/i },
  { id: 'validation_warnings', pattern: /\bvalidation_warnings\b/i },
  { id: 'debug_notices', pattern: /\bdebug_notices\b/i },
  { id: 'future_supported_internal', pattern: /\bfuture_supported_internal\b/i },
  { id: 'combat_routing', pattern: /\bcombat_routing\b/i },
  { id: 'hidden_clue_metadata', pattern: /\bhidden_clue_metadata\b/i },
  { id: 'final_mystery', pattern: /\bfinal_mystery\b/i },
  { id: 'gm_only_truth', pattern: /\bgm_only_truth\b/i },
  { id: 'annotation_correction_internal', pattern: /\bannotation_correction_internal\b/i },
  { id: 'gm_dev_content_ref', pattern: /\bgm_dev_content_ref\b/i },
  { id: 'raw_runtime_state', pattern: /\braw_runtime_state\b/i },
  { id: 'database_constraint', pattern: /\bduplicate key\b|\bconstraint\b/i },
  { id: 'stack_trace', pattern: /\bstack trace\b|\bat .+\(.+:\d+:\d+\)/i },
]);

const hiddenKeySet = new Set(PLAYER_HIDDEN_FIELD_KEYS.map(normalizeFieldKey));

function normalizeFieldKey(value) {
  return String(value ?? '').replaceAll(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pathFor(parent, key) {
  if (!parent) {
    return String(key);
  }
  return String(key).match(/^\d+$/) ? `${parent}[${key}]` : `${parent}.${key}`;
}

function allowlistSet(options = {}) {
  return new Set(normalizeArray(options.allowlist_paths ?? options.allowlistPaths));
}

function isAllowlisted(path, options = {}) {
  const allowlist = allowlistSet(options);
  return allowlist.has(path);
}

function isHiddenKey(key, options = {}) {
  const normalized = normalizeFieldKey(key);
  const extraHidden = normalizeArray(options.extra_hidden_keys ?? options.extraHiddenKeys).map(normalizeFieldKey);
  return hiddenKeySet.has(normalized) || extraHidden.includes(normalized);
}

function patternsFor(options = {}) {
  return [
    ...PLAYER_HIDDEN_VALUE_PATTERNS,
    ...normalizeArray(options.extra_value_patterns ?? options.extraValuePatterns),
  ];
}

export function scanForPlayerHiddenData(value, options = {}) {
  const violations = [];
  const scanStrings = options.scan_strings !== false && options.scanStrings !== false;
  const seen = new WeakSet();

  function visit(current, path = '$') {
    if (isAllowlisted(path, options)) {
      return;
    }

    if (current && typeof current === 'object') {
      if (seen.has(current)) {
        return;
      }
      seen.add(current);

      if (Array.isArray(current)) {
        current.forEach((entry, index) => visit(entry, pathFor(path, index)));
        return;
      }

      for (const [key, nested] of Object.entries(current)) {
        const nestedPath = pathFor(path, key);
        if (!isAllowlisted(nestedPath, options) && isHiddenKey(key, options)) {
          violations.push({
            path: nestedPath,
            kind: 'field',
            term: key,
            message: `Player payload contains hidden/internal field ${key} at ${nestedPath}`,
          });
          continue;
        }
        visit(nested, nestedPath);
      }
      return;
    }

    if (scanStrings && typeof current === 'string') {
      for (const entry of patternsFor(options)) {
        if (entry?.pattern?.test?.(current)) {
          violations.push({
            path,
            kind: 'value',
            term: entry.id ?? String(entry.pattern),
            message: `Player payload contains hidden/internal value pattern ${entry.id ?? entry.pattern} at ${path}`,
          });
        }
      }
    }
  }

  visit(value);
  return violations;
}

export function assertNoPlayerHiddenData(value, options = {}) {
  const violations = scanForPlayerHiddenData(value, options);
  if (violations.length > 0) {
    const error = new Error(
      `Player payload leaked hidden/internal data: ${violations
        .slice(0, 5)
        .map((violation) => violation.message)
        .join('; ')}`
    );
    error.violations = violations;
    throw error;
  }
  return true;
}

function cloneForPlayer(value, options = {}, path = '$', seen = new WeakMap()) {
  if (isAllowlisted(path, options)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => cloneForPlayer(entry, options, pathFor(path, index), seen));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }

  const projected = {};
  seen.set(value, projected);

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = pathFor(path, key);
    if (!isAllowlisted(nestedPath, options) && isHiddenKey(key, options)) {
      continue;
    }
    projected[key] = cloneForPlayer(nested, options, nestedPath, seen);
  }

  return projected;
}

function cloneDeep(value, seen = new WeakMap()) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDeep(entry, seen));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  const cloned = {};
  seen.set(value, cloned);
  for (const [key, nested] of Object.entries(value)) {
    cloned[key] = cloneDeep(nested, seen);
  }
  return cloned;
}

export function toPlayerSafeError(error = {}, options = {}) {
  const safeError = createSafeInteractionError({
    code: error.code,
    player_safe_message:
      error.player_safe_message ??
      error.playerSafeMessage ??
      options.player_safe_message ??
      options.playerSafeMessage ??
      (options.allow_message_as_player_safe === true || options.allowMessageAsPlayerSafe === true
        ? error.message
        : null),
    retryable: error.retryable,
    recovery_action: error.recovery_action ?? error.recoveryAction,
  });
  return {
    code: safeError.code,
    player_safe_message: safeError.player_safe_message,
    retryable: safeError.retryable,
    recovery_action: safeError.recovery_action,
    ...(options.current_state_hint || options.currentStateHint
      ? { current_state_hint: options.current_state_hint ?? options.currentStateHint }
      : {}),
  };
}

export function toGmDevErrorDetails(error = {}, options = {}) {
  const base = createSafeInteractionError(error);
  return {
    ...base,
    internal_cause: normalizeObject(error.internal_cause ?? error.internalCause),
    validation_details: normalizeObject(error.validation_details ?? error.validationDetails),
    debug_envelope: normalizeObject(error.debug_envelope ?? error.debugEnvelope),
    source: normalizeObject(options.source),
    stack: options.include_stack === true || options.includeStack === true ? error.stack ?? null : null,
  };
}

export function stripInternalFields(payload = {}, options = {}) {
  return cloneForPlayer(payload, options);
}

export function projectForPlayer(payload = {}, options = {}) {
  if (payload?.error || payload?.internal_cause || payload?.internalCause || payload?.stack) {
    const projected = cloneForPlayer(payload, options);
    if (payload.error && typeof payload.error === 'object') {
      projected.error = toPlayerSafeError(payload.error);
    }
    return projected;
  }
  return cloneForPlayer(payload, options);
}

export function projectForGmDev(payload = {}, options = {}) {
  return {
    ...cloneDeep(payload),
    ...(options.include_visibility_metadata === false && options.includeVisibilityMetadata === false
      ? {}
      : {
          visibility_projection: {
            visibility_scope: VISIBILITY_SCOPES.GM_DEV,
            preserves_debug: true,
            projected_at: options.projected_at ?? options.projectedAt ?? null,
          },
        }),
  };
}

export function projectForTestHarness(payload = {}, options = {}) {
  return {
    payload: cloneDeep(payload),
    player_hidden_data_violations: scanForPlayerHiddenData(payload, options),
  };
}

export function projectForVisibilityScope(payload = {}, options = {}) {
  const scope = normalizeVisibilityScope(options.visibility_scope ?? options.visibilityScope, VISIBILITY_SCOPES.PLAYER);
  const adapted = applyDomainVisibilityAdapter(payload, {
    ...options,
    visibility_scope: scope,
  });

  if (scope === VISIBILITY_SCOPES.PLAYER) {
    return projectForPlayer(adapted, options);
  }
  if (scope === VISIBILITY_SCOPES.GM_DEV || scope === VISIBILITY_SCOPES.SYSTEM_INTERNAL) {
    return projectForGmDev(adapted, options);
  }
  if (scope === VISIBILITY_SCOPES.TEST_HARNESS) {
    return projectForTestHarness(adapted, options);
  }
  return projectForPlayer(adapted, options);
}

export function buildVisibilityProjection(payload = {}, options = {}) {
  const scope = normalizeVisibilityScope(options.visibility_scope ?? options.visibilityScope, VISIBILITY_SCOPES.PLAYER);
  const projected_payload = projectForVisibilityScope(payload, { ...options, visibility_scope: scope });
  return {
    visibility_scope: scope,
    projected_payload,
    player_hidden_data_violations:
      scope === VISIBILITY_SCOPES.PLAYER ? scanForPlayerHiddenData(projected_payload, options) : [],
  };
}

export function applyDomainVisibilityAdapter(payload = {}, options = {}) {
  const adapter = options.adapter ?? options.domain_adapter ?? options.domainAdapter ?? null;
  if (!adapter) {
    return payload;
  }
  const scope = normalizeVisibilityScope(options.visibility_scope ?? options.visibilityScope, VISIBILITY_SCOPES.PLAYER);
  if (typeof adapter === 'function') {
    return adapter(payload, { ...options, visibility_scope: scope });
  }
  if (scope === VISIBILITY_SCOPES.PLAYER && typeof adapter.projectForPlayer === 'function') {
    return adapter.projectForPlayer(payload, options);
  }
  if (scope === VISIBILITY_SCOPES.GM_DEV && typeof adapter.projectForGmDev === 'function') {
    return adapter.projectForGmDev(payload, options);
  }
  if (scope === VISIBILITY_SCOPES.TEST_HARNESS && typeof adapter.projectForTestHarness === 'function') {
    return adapter.projectForTestHarness(payload, options);
  }
  if (typeof adapter.project === 'function') {
    return adapter.project(payload, { ...options, visibility_scope: scope });
  }
  return payload;
}

export function commonSafeResponse(payload = {}, options = {}) {
  const scope = normalizeVisibilityScope(options.visibility_scope ?? options.visibilityScope, VISIBILITY_SCOPES.PLAYER);
  return {
    visibility_scope: scope,
    body: projectForVisibilityScope(payload, { ...options, visibility_scope: scope }),
  };
}
