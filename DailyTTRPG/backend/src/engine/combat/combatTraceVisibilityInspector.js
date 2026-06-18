import {
  assertNoCombatPlayerHiddenData,
} from '../../services/interactionCore/combatAdapterContract.js';
import {
  scanForPlayerHiddenData,
} from '../../services/interactionCore/visibilityBoundary.js';
import {
  RUSK_ENCOUNTER_IDS,
  RUSK_PARTICIPANT_IDS,
  buildCanonicalRuskGmDevTrace,
  projectCanonicalRuskForPlayer,
} from './canonicalRuskEncounter.js';
import {
  COMBAT_CHECKPOINT_KINDS,
  COMBAT_OPERATION_TYPES,
  ensureCombatPersistenceState,
  inspectCombatRecoveryState,
  rebuildCombatPersistenceReadModels,
  reconstructCombatAggregate,
  reconstructLastConfirmedCombatState,
  validateCombatPersistenceInvariants,
} from './combatPersistenceRuntime.js';
import {
  buildEncounterResolutionGmDevTrace,
  projectEncounterResolutionForPlayer,
} from './encounterResolutionRuntime.js';

export const COMBAT_INSPECTOR_CONTRACT_STAGE = '6D.15';

export const COMBAT_INSPECTOR_ROLES = Object.freeze({
  DEVELOPER: 'developer',
  ADMIN: 'admin',
  CAMPAIGN_GM: 'campaign_gm',
});

export const COMBAT_INSPECTION_STATUS = Object.freeze({
  OK: 'ok',
  UNAUTHORIZED: 'unauthorized',
  INVALID_VIEWER: 'invalid_viewer',
  UNAVAILABLE: 'unavailable',
});

export const COMBAT_INSPECTION_EXACTNESS = Object.freeze({
  CURRENT_EXACT: 'current_exact',
  HISTORICAL_EXACT: 'historical_exact',
  EVENT_ONLY: 'event_only',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
});

export const COMBAT_VISIBILITY_DECISION_KINDS = Object.freeze({
  VISIBLE: 'visible',
  TRANSFORMED: 'transformed',
  REDACTED: 'redacted',
  WITHHELD: 'withheld',
  OMITTED: 'omitted',
  UNAVAILABLE: 'unavailable',
});

export const COMBAT_VISIBILITY_REASON_CODES = Object.freeze({
  VIEWER_OWN_FACT: 'viewer_own_fact',
  DIRECTLY_OBSERVED: 'directly_observed',
  AUTHORED_REVEAL: 'authored_reveal',
  RULE_KNOWABLE: 'rule_knowable',
  NARRATIVE_APPROXIMATION: 'narrative_approximation',
  HIDDEN_STATISTIC: 'hidden_statistic',
  HIDDEN_PARTICIPANT: 'hidden_participant',
  UNOBSERVABLE_EVENT: 'unobservable_event',
  GM_DEV_ONLY: 'gm_dev_only',
  IRRELEVANT_TO_PLAYER_MODEL: 'irrelevant_to_player_model',
  HISTORICAL_DATA_UNAVAILABLE: 'historical_data_unavailable',
});

export const COMBAT_INSPECTOR_HIDDEN_VALUE_PATTERNS = Object.freeze([
  { id: 'combat_inspector_trace', pattern: /\bcombat_inspector\b/i },
  { id: 'operation_fingerprint', pattern: /\boperation_fingerprint\b/i },
  { id: 'checkpoint', pattern: /\bcheckpoint\b/i },
  { id: 'idempotency_key', pattern: /\bidempotency_key\b/i },
  { id: 'surrender_threshold', pattern: /\bsurrender_threshold\b/i },
  { id: 'tactical_priorities', pattern: /\btactical_priorit/i },
  { id: 'gm_dev_trace', pattern: /\bgm_dev_trace\b/i },
]);

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
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

function participantId(participant = {}) {
  if (!participant || typeof participant !== 'object') return cleanText(participant);
  return cleanText(participant.participant_id ?? participant.participantId ?? participant.id);
}

function participantHp(participant = {}) {
  const parsed = Number(participant.current_hit_points ?? participant.currentHp ?? participant.current_hp ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function participantMaxHp(participant = {}) {
  const parsed = Number(participant.max_hit_points ?? participant.maxHp ?? participant.max_hp ?? 1);
  return Math.max(Number.isFinite(parsed) ? parsed : 1, 1);
}

function campaignIdFromState(state = {}) {
  return cleanText(
    state.combat?.campaign_id ??
      state.combat?.campaignId ??
      state.campaign_id ??
      state.campaignId ??
      state.campaign_instance_id ??
      state.canonical_rusk?.definition?.campaign_slug
  );
}

function combatIdFromState(state = {}) {
  return cleanText(state.combat?.combat_id ?? state.combat_id ?? state.id) || 'combat';
}

function roleFromRequester(requester = {}, input = {}) {
  return cleanText(
    input.role ??
      requester.role ??
      requester.internal_role ??
      requester.internalRole ??
      requester.debug_role ??
      requester.debugRole
  ).toLowerCase();
}

function campaignList(requester = {}) {
  const explicit = [
    ...asArray(requester.authorized_campaign_ids ?? requester.authorizedCampaignIds),
    ...asArray(requester.gm_campaign_ids ?? requester.gmCampaignIds),
    ...asArray(requester.campaign_ids ?? requester.campaignIds),
  ].map(cleanText);
  const roleMap = requester.campaign_roles ?? requester.campaignRoles ?? {};
  for (const [campaignId, role] of Object.entries(roleMap)) {
    const normalizedRole = cleanText(role).toLowerCase();
    if (['gm', 'game_master', 'campaign_gm', 'developer', 'admin'].includes(normalizedRole)) {
      explicit.push(cleanText(campaignId));
    }
  }
  return [...new Set(explicit.filter(Boolean))];
}

function isDeveloperLike(requester = {}, role = '') {
  return (
    [COMBAT_INSPECTOR_ROLES.DEVELOPER, COMBAT_INSPECTOR_ROLES.ADMIN, 'dev', 'administrator'].includes(role) ||
    requester.can_advance_beats === true ||
    requester.canAdvanceBeats === true ||
    requester.can_inspect_combat === true ||
    requester.canInspectCombat === true ||
    requester.internal_diagnostics === true ||
    requester.internalDiagnostics === true
  );
}

function isCampaignGmLike(requester = {}, role = '', campaignId = '') {
  if (!['gm', 'game_master', COMBAT_INSPECTOR_ROLES.CAMPAIGN_GM].includes(role)) return false;
  return Boolean(campaignId && campaignList(requester).includes(cleanText(campaignId)));
}

export function authorizeCombatInspectorRequest(input = {}) {
  const state = input.state ? ensureCombatPersistenceState(cloneSerializable(input.state)) : null;
  const requester = input.requester ?? input.inspector ?? {};
  const role = roleFromRequester(requester, input);
  const campaignId = cleanText(input.campaign_id ?? input.campaignId) || (state ? campaignIdFromState(state) : '');
  const developer = isDeveloperLike(requester, role);
  const campaignGm = isCampaignGmLike(requester, role, campaignId);
  const authorized = developer || campaignGm;
  return {
    status: authorized ? 'authorized' : COMBAT_INSPECTION_STATUS.UNAUTHORIZED,
    authorized,
    role: developer
      ? (role === 'admin' || role === 'administrator' ? COMBAT_INSPECTOR_ROLES.ADMIN : COMBAT_INSPECTOR_ROLES.DEVELOPER)
      : campaignGm
        ? COMBAT_INSPECTOR_ROLES.CAMPAIGN_GM
        : role || 'none',
    inspector_id: cleanText(requester.account_id ?? requester.accountId ?? requester.id ?? input.account_id ?? input.accountId) || null,
    campaign_id: campaignId || null,
    reason: authorized
      ? 'inspector_role_authorized'
      : 'combat_inspector_requires_developer_admin_or_verified_campaign_gm',
    scope: {
      developer_policy: developer ? 'existing_internal_diagnostic_capability' : null,
      campaign_scope_checked: Boolean(campaignId),
      campaign_gm_scope: campaignGm ? 'authorized_campaign_match' : 'not_available_or_not_matched',
    },
  };
}

export function selectCombatInspectorViewer(input = {}) {
  const state = ensureCombatPersistenceState(cloneSerializable(input.state ?? input));
  const viewer = input.viewer ?? input.selected_viewer ?? input.selectedViewer ?? {};
  const requestedParticipantId = cleanText(
    input.viewer_participant_id ??
      input.viewerParticipantId ??
      viewer.participant_id ??
      viewer.participantId ??
      viewer.id
  );
  const requestedCharacterId = cleanText(
    input.active_character_id ??
      input.activeCharacterId ??
      viewer.active_character_id ??
      viewer.activeCharacterId ??
      viewer.character_id ??
      viewer.characterId
  );
  const participants = asArray(state.participants);
  const selected = requestedParticipantId
    ? participants.find((entry) => participantId(entry) === requestedParticipantId)
    : requestedCharacterId
      ? participants.find((entry) => cleanText(entry.active_character_id ?? entry.activeCharacterId) === requestedCharacterId)
      : participants.find((entry) => entry.player_controlled === true || entry.is_player_character === true) ??
        participants.find((entry) => participantId(entry) === RUSK_PARTICIPANT_IDS.PLAYER);

  if (!selected) {
    return {
      status: COMBAT_INSPECTION_STATUS.INVALID_VIEWER,
      valid: false,
      reason: 'selected_viewer_not_in_combat',
      requested_participant_id: requestedParticipantId || null,
      requested_character_id: requestedCharacterId || null,
    };
  }

  const isPlayerControlled = selected.player_controlled === true || selected.is_player_character === true;
  return {
    status: 'selected',
    valid: true,
    participant_id: participantId(selected),
    active_character_id: cleanText(selected.active_character_id ?? selected.activeCharacterId) || null,
    display_name: selected.display_name ?? selected.name ?? participantId(selected),
    faction: selected.faction ?? null,
    player_controlled: isPlayerControlled,
    validation: {
      combat_membership: true,
      player_controlled_or_character_view: isPlayerControlled || Boolean(cleanText(selected.active_character_id ?? selected.activeCharacterId)),
      view_as_player_only: true,
      session_impersonation: false,
      action_submission_allowed: false,
    },
  };
}

function buildAccessAuditRecord(input = {}) {
  const state = input.state ?? {};
  const authorization = input.authorization ?? {};
  const viewer = input.viewer ?? {};
  const historicalPoint = input.historical_point ?? input.historicalPoint ?? null;
  return {
    audit_id: stableId([
      'combat-inspection-audit',
      combatIdFromState(state),
      authorization.inspector_id ?? 'inspector',
      input.inspection_type ?? input.inspectionType ?? 'snapshot',
      historicalPoint?.operation_id ?? historicalPoint?.event_sequence ?? 'current',
    ]),
    audit_kind: 'combat_hidden_state_inspection',
    contract_stage: COMBAT_INSPECTOR_CONTRACT_STAGE,
    inspector_id: authorization.inspector_id ?? null,
    inspector_role: authorization.role ?? null,
    combat_id: combatIdFromState(state),
    campaign_id: (authorization.campaign_id ?? campaignIdFromState(state)) || null,
    encounter_id: state.combat?.encounter_id ?? null,
    selected_viewer_participant_id: viewer.participant_id ?? null,
    inspection_type: input.inspection_type ?? input.inspectionType ?? 'current_snapshot',
    hidden_state_access_classification: 'authoritative_and_player_projection_comparison',
    historical_point: historicalPoint,
    source: cleanText(input.source ?? input.tool_source ?? input.toolSource) || 'engine_helper',
    export_action: input.export === true ? 'internal_export_requested' : null,
  };
}

export function recordCombatInspectionAccess(input = {}) {
  const record = buildAccessAuditRecord(input);
  const sink = input.audit_sink ?? input.auditSink;
  if (typeof sink === 'function') {
    sink(cloneSerializable(record));
  }
  return record;
}

function snapshotForInspection(input = {}) {
  const baseState = ensureCombatPersistenceState(cloneSerializable(input.state ?? input));
  const historicalPoint = input.historical_point ?? input.historicalPoint ?? null;
  if (!historicalPoint) {
    return {
      status: 'loaded',
      exactness: COMBAT_INSPECTION_EXACTNESS.CURRENT_EXACT,
      state: baseState,
      aggregate: reconstructCombatAggregate({ state: baseState }),
      historical_point: null,
      notes: ['current_snapshot_loaded_from_supplied_authoritative_state'],
    };
  }
  const operationId = cleanText(historicalPoint.operation_id ?? historicalPoint.operationId);
  const eventSequence = historicalPoint.event_sequence ?? historicalPoint.eventSequence;
  if (operationId) {
    const operation = baseState.combat_persistence.operations[operationId];
    if (!operation?.last_confirmed_state_snapshot) {
      return {
        status: COMBAT_INSPECTION_STATUS.UNAVAILABLE,
        exactness: COMBAT_INSPECTION_EXACTNESS.UNAVAILABLE,
        state: baseState,
        aggregate: reconstructCombatAggregate({ state: baseState }),
        historical_point: historicalPoint,
        notes: ['operation_snapshot_unavailable_no_historical_guessing'],
      };
    }
    const historicalState = ensureCombatPersistenceState(reconstructLastConfirmedCombatState({
      state: baseState,
      operation_id: operationId,
    }));
    return {
      status: 'loaded',
      exactness: COMBAT_INSPECTION_EXACTNESS.HISTORICAL_EXACT,
      state: historicalState,
      aggregate: reconstructCombatAggregate({ state: historicalState }),
      historical_point: historicalPoint,
      notes: ['historical_snapshot_loaded_from_operation_last_confirmed_state_without_rerolling'],
    };
  }
  if (eventSequence !== undefined && eventSequence !== null) {
    const event = asArray(baseState.combat_persistence.events)
      .find((entry) => Number(entry.sequence) === Number(eventSequence));
    return {
      status: event ? 'loaded' : COMBAT_INSPECTION_STATUS.UNAVAILABLE,
      exactness: event ? COMBAT_INSPECTION_EXACTNESS.EVENT_ONLY : COMBAT_INSPECTION_EXACTNESS.UNAVAILABLE,
      state: baseState,
      aggregate: reconstructCombatAggregate({ state: baseState }),
      historical_point: historicalPoint,
      event: event ? cloneSerializable(event) : null,
      notes: event
        ? ['event_record_loaded_event_only_snapshot_not_claimed_exact']
        : ['event_sequence_unavailable_no_historical_guessing'],
    };
  }
  return {
    status: COMBAT_INSPECTION_STATUS.UNAVAILABLE,
    exactness: COMBAT_INSPECTION_EXACTNESS.UNAVAILABLE,
    state: baseState,
    aggregate: reconstructCombatAggregate({ state: baseState }),
    historical_point: historicalPoint,
    notes: ['unsupported_historical_point_no_snapshot_reconstructed'],
  };
}

function isEncounterResolutionState(state = {}) {
  return Boolean(state.encounter_resolution || state.post_combat_review || state.adventure_state?.current_state_id);
}

export function buildProductionCombatPlayerProjection(input = {}) {
  const state = ensureCombatPersistenceState(cloneSerializable(input.state ?? input));
  let projection;
  let projectorId;
  if (isEncounterResolutionState(state)) {
    projection = projectEncounterResolutionForPlayer({ state });
    projectorId = 'projectEncounterResolutionForPlayer';
  } else if (state.canonical_rusk || state.combat?.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER) {
    projection = projectCanonicalRuskForPlayer({ state });
    projectorId = 'projectCanonicalRuskForPlayer';
  } else {
    projection = rebuildCombatPersistenceReadModels({ state }).player;
    projectorId = 'rebuildCombatPersistenceReadModels.player';
  }
  assertNoCombatPlayerHiddenData(projection);
  return {
    projector_id: projectorId,
    projection,
    selected_viewer_participant_id: input.viewer?.participant_id ?? input.viewer_participant_id ?? null,
    hidden_data_violations: scanForPlayerHiddenData(projection, {
      extra_value_patterns: COMBAT_INSPECTOR_HIDDEN_VALUE_PATTERNS,
    }),
  };
}

export function buildCombatInspectorGmDevProjection(input = {}) {
  const state = ensureCombatPersistenceState(cloneSerializable(input.state ?? input));
  const aggregate = reconstructCombatAggregate({ state });
  const readModels = rebuildCombatPersistenceReadModels({ state });
  const invariant = validateCombatPersistenceInvariants({ state });
  return {
    projection_kind: 'combat_gm_dev_inspector_projection',
    contract_stage: COMBAT_INSPECTOR_CONTRACT_STAGE,
    authoritative: aggregate,
    gm_dev_read_model: readModels.gm_dev,
    canonical_rusk_trace: state.canonical_rusk || state.combat?.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER
      ? buildCanonicalRuskGmDevTrace({ state, phase: 'inspector' })
      : null,
    encounter_resolution_trace: isEncounterResolutionState(state)
      ? buildEncounterResolutionGmDevTrace({ state, phase: 'inspector' })
      : null,
    recovery: inspectCombatRecoveryState({ state }),
    invariant,
    rules_and_versions: {
      combat_ruleset: state.combat?.ruleset ?? aggregate.ruleset ?? null,
      encounter_template_version: state.canonical_rusk?.definition?.selected_variant?.version ?? state.encounter_template_version ?? null,
      tactical_profile_versions: asArray(state.tactical_profiles).map((entry) => ({
        profile_id: entry.profile_id,
        profile_version: entry.profile_version ?? null,
      })),
      visibility_policy_version: state.visibility_policy_version ?? '6D.player-projection-denylist',
      combat_focus_matcher_version: state.combat_focus_matcher_version ?? '6D.11-structured-template-matcher',
      outcome_definition_version: state.encounter_resolution?.definition_version ?? '6D.14-service-state',
      reward_definition_version: state.encounter_resolution?.rewards?.reward_definition_version ?? 'authored-encounter-reward-value',
    },
  };
}

function playerParticipantProjection(playerProjection = {}, participantIdValue = '') {
  return asArray(playerProjection.participants).find((entry) => participantId(entry) === participantIdValue) ?? null;
}

function playerHasParticipant(playerProjection = {}, participantIdValue = '') {
  return Boolean(playerParticipantProjection(playerProjection, participantIdValue));
}

function visibilityDecision(input = {}) {
  return {
    fact_path: input.fact_path,
    fact_type: input.fact_type,
    participant_id: input.participant_id ?? null,
    decision: input.decision,
    reason_code: input.reason_code,
    player_path: input.player_path ?? null,
    transformation: input.transformation ?? null,
    policy_id: input.policy_id ?? 'stage_6d_combat_visibility_policy',
    reveal_provenance: input.reveal_provenance ?? null,
    notes: asArray(input.notes),
  };
}

function buildParticipantVisibilityDecisions({ state, playerProjection, viewer }) {
  const decisions = [];
  for (const participant of asArray(state.participants)) {
    const id = participantId(participant);
    const isViewer = id === viewer.participant_id;
    const visible = playerHasParticipant(playerProjection, id);
    const hidden = participant.hidden === true || participant.can_be_perceived === false;
    decisions.push(visibilityDecision({
      fact_path: `participants.${id}.existence`,
      fact_type: 'participant_existence',
      participant_id: id,
      decision: hidden && !isViewer ? COMBAT_VISIBILITY_DECISION_KINDS.WITHHELD : COMBAT_VISIBILITY_DECISION_KINDS.VISIBLE,
      reason_code: hidden && !isViewer
        ? COMBAT_VISIBILITY_REASON_CODES.HIDDEN_PARTICIPANT
        : isViewer
          ? COMBAT_VISIBILITY_REASON_CODES.VIEWER_OWN_FACT
          : COMBAT_VISIBILITY_REASON_CODES.DIRECTLY_OBSERVED,
      player_path: visible ? `participants[${id}]` : null,
      reveal_provenance: visible ? 'production_player_projection' : null,
    }));
    decisions.push(visibilityDecision({
      fact_path: `participants.${id}.hit_points.current`,
      fact_type: 'hit_points',
      participant_id: id,
      decision: isViewer ? COMBAT_VISIBILITY_DECISION_KINDS.VISIBLE : COMBAT_VISIBILITY_DECISION_KINDS.TRANSFORMED,
      reason_code: isViewer
        ? COMBAT_VISIBILITY_REASON_CODES.VIEWER_OWN_FACT
        : COMBAT_VISIBILITY_REASON_CODES.NARRATIVE_APPROXIMATION,
      player_path: isViewer ? `participants[${id}].hit_points.current` : `participants[${id}].health_band`,
      transformation: isViewer ? null : 'exact_hit_points_to_health_band',
    }));
    decisions.push(visibilityDecision({
      fact_path: `participants.${id}.armor_class`,
      fact_type: 'armor_class',
      participant_id: id,
      decision: isViewer ? COMBAT_VISIBILITY_DECISION_KINDS.VISIBLE : COMBAT_VISIBILITY_DECISION_KINDS.REDACTED,
      reason_code: isViewer
        ? COMBAT_VISIBILITY_REASON_CODES.VIEWER_OWN_FACT
        : COMBAT_VISIBILITY_REASON_CODES.HIDDEN_STATISTIC,
      player_path: isViewer ? `participants[${id}].defensive_summary` : null,
    }));
    decisions.push(visibilityDecision({
      fact_path: `participants.${id}.control_mode`,
      fact_type: 'control_mode',
      participant_id: id,
      decision: COMBAT_VISIBILITY_DECISION_KINDS.WITHHELD,
      reason_code: COMBAT_VISIBILITY_REASON_CODES.GM_DEV_ONLY,
      player_path: null,
    }));
  }
  return decisions;
}

function buildEventVisibilityDecisions({ state }) {
  return asArray(state.combat_persistence?.events).flatMap((event) => [
    visibilityDecision({
      fact_path: `events.${event.sequence}.player_safe_summary`,
      fact_type: 'combat_event_summary',
      decision: event.player_safe_summary
        ? COMBAT_VISIBILITY_DECISION_KINDS.VISIBLE
        : COMBAT_VISIBILITY_DECISION_KINDS.OMITTED,
      reason_code: event.player_safe_summary
        ? COMBAT_VISIBILITY_REASON_CODES.DIRECTLY_OBSERVED
        : COMBAT_VISIBILITY_REASON_CODES.UNOBSERVABLE_EVENT,
      player_path: event.player_safe_summary ? 'latest_events/review.chronological_log' : null,
      reveal_provenance: event.player_safe_summary ? event.event_id : null,
    }),
    visibilityDecision({
      fact_path: `events.${event.sequence}.detail`,
      fact_type: 'combat_event_detail',
      decision: COMBAT_VISIBILITY_DECISION_KINDS.WITHHELD,
      reason_code: COMBAT_VISIBILITY_REASON_CODES.GM_DEV_ONLY,
      player_path: null,
    }),
  ]);
}

function buildOperationVisibilityDecisions({ state }) {
  return asArray(state.combat_persistence?.operation_order).map((operationId) =>
    visibilityDecision({
      fact_path: `operations.${operationId}`,
      fact_type: 'operation_record',
      decision: COMBAT_VISIBILITY_DECISION_KINDS.WITHHELD,
      reason_code: COMBAT_VISIBILITY_REASON_CODES.GM_DEV_ONLY,
      player_path: null,
      notes: ['operation_fingerprint_idempotency_checkpoints_and_mutations_are_internal'],
    })
  );
}

function buildRewardVisibilityDecisions({ state }) {
  if (!state.encounter_resolution?.rewards) return [];
  return [
    visibilityDecision({
      fact_path: 'encounter_resolution.rewards.experience_awarded',
      fact_type: 'reward',
      decision: COMBAT_VISIBILITY_DECISION_KINDS.VISIBLE,
      reason_code: COMBAT_VISIBILITY_REASON_CODES.AUTHORED_REVEAL,
      player_path: 'rewards.experience_points_awarded',
      reveal_provenance: state.encounter_resolution?.rewards?.reward_application_id ?? null,
    }),
    visibilityDecision({
      fact_path: 'encounter_resolution.rewards.reward_application_id',
      fact_type: 'reward_internal',
      decision: COMBAT_VISIBILITY_DECISION_KINDS.WITHHELD,
      reason_code: COMBAT_VISIBILITY_REASON_CODES.GM_DEV_ONLY,
      player_path: null,
    }),
  ];
}

export function buildCombatVisibilityDecisionReport(input = {}) {
  const state = ensureCombatPersistenceState(cloneSerializable(input.state ?? input));
  const viewer = input.viewer ?? selectCombatInspectorViewer({ state });
  const playerProjection = input.player_projection ?? input.playerProjection ?? buildProductionCombatPlayerProjection({
    state,
    viewer,
  }).projection;
  const decisions = [
    ...buildParticipantVisibilityDecisions({ state, playerProjection, viewer }),
    ...buildEventVisibilityDecisions({ state }),
    ...buildOperationVisibilityDecisions({ state }),
    ...buildRewardVisibilityDecisions({ state }),
  ];
  const summary = decisions.reduce((acc, decision) => {
    acc[decision.decision] = (acc[decision.decision] ?? 0) + 1;
    return acc;
  }, {});
  return {
    status: 'ok',
    reason_codes: COMBAT_VISIBILITY_REASON_CODES,
    decisions,
    summary,
  };
}

function hiddenEnemyHpLeaks({ state, playerProjection, viewer }) {
  const leaks = [];
  function containsExactNumber(value, target, seen = new WeakSet()) {
    if (typeof value === 'number') return value === target;
    if (!value || typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some((entry) => containsExactNumber(entry, target, seen));
    return Object.values(value).some((entry) => containsExactNumber(entry, target, seen));
  }
  for (const participant of asArray(state.participants)) {
    const id = participantId(participant);
    if (id === viewer.participant_id) continue;
    const projected = playerParticipantProjection(playerProjection, id);
    if (!projected) continue;
    if (projected.hit_points && typeof projected.hit_points === 'object') {
      leaks.push({
        code: 'exact_non_viewer_hit_points_visible',
        participant_id: id,
        path: `participants.${id}.hit_points`,
      });
    }
    const exactHp = participantHp(participant);
    if (exactHp > 0 && containsExactNumber(projected, exactHp)) {
      leaks.push({
        code: 'exact_non_viewer_hit_point_value_visible',
        participant_id: id,
      });
    }
  }
  return leaks;
}

function overRedactionFindings({ state, playerProjection, viewer }) {
  const findings = [];
  const viewerProjection = playerParticipantProjection(playerProjection, viewer.participant_id);
  const viewerState = asArray(state.participants).find((entry) => participantId(entry) === viewer.participant_id);
  if (viewerState && !viewerProjection) {
    findings.push({
      code: 'viewer_participant_missing',
      reason: 'player_projection_should_include_selected_viewer',
    });
  }
  if (viewerState && viewerProjection && !viewerProjection.hit_points && playerProjection.status !== 'recovery_needed') {
    findings.push({
      code: 'viewer_hit_points_missing',
      reason: 'player_owned_exact_hit_points_should_be_visible',
    });
  }
  for (const participant of asArray(state.participants)) {
    const id = participantId(participant);
    if (id === viewer.participant_id || participant.hidden === true || participant.can_be_perceived === false) continue;
    const projected = playerParticipantProjection(playerProjection, id);
    if (!projected) {
      findings.push({
        code: 'observable_participant_missing',
        participant_id: id,
        reason: 'directly_observed_participant_should_have_player_visible_identity',
      });
    } else if (!projected.health_band && !projected.defeated) {
      findings.push({
        code: 'observable_health_band_missing',
        participant_id: id,
        reason: 'non_viewer_visible_participant_should_have_safe_health_band_or_defeated_state',
      });
    }
  }
  return findings;
}

export function validateCombatInspectorProjectionSafety(input = {}) {
  const state = ensureCombatPersistenceState(cloneSerializable(input.state ?? input));
  const viewer = input.viewer ?? selectCombatInspectorViewer({ state });
  const playerProjection = input.player_projection ?? input.playerProjection ?? buildProductionCombatPlayerProjection({
    state,
    viewer,
  }).projection;
  const hiddenDataViolations = scanForPlayerHiddenData(playerProjection, {
    extra_value_patterns: COMBAT_INSPECTOR_HIDDEN_VALUE_PATTERNS,
  });
  const exactLeaks = hiddenEnemyHpLeaks({ state, playerProjection, viewer });
  const overRedaction = overRedactionFindings({ state, playerProjection, viewer });
  return {
    status: hiddenDataViolations.length === 0 && exactLeaks.length === 0 ? 'safe' : 'leak_detected',
    player_projection_safe: hiddenDataViolations.length === 0 && exactLeaks.length === 0,
    hidden_information_leaks: [...hiddenDataViolations, ...exactLeaks],
    over_redaction_findings: overRedaction,
    irrelevant_omissions: [
      'operation_fingerprints',
      'idempotency_records',
      'checkpoints',
      'mutation_plans',
      'gm_dev_traces',
    ],
    notes: [
      'Player projection is produced before inspection comparison.',
      'Exact non-viewer hit points and internal traces are treated as leaks.',
      'Missing viewer-owned facts and observed participant summaries are over-redaction findings.',
    ],
  };
}

function groupEventsByRoundTurn(events = []) {
  const groups = new Map();
  for (const event of asArray(events)) {
    const key = stableId([
      'round',
      event.round_number ?? 'unknown',
      'turn',
      event.parent_turn_id ?? 'none',
    ]);
    if (!groups.has(key)) {
      groups.set(key, {
        group_id: key,
        round_number: event.round_number ?? null,
        parent_turn_id: event.parent_turn_id ?? null,
        events: [],
      });
    }
    groups.get(key).events.push(cloneSerializable(event));
  }
  return [...groups.values()];
}

function inspectOperationLineage(state = {}) {
  return asArray(state.combat_persistence?.operation_order)
    .map((operationId) => state.combat_persistence.operations[operationId])
    .filter(Boolean)
    .map((operation) => ({
      operation_id: operation.operation_id,
      operation_type: operation.operation_type,
      parent_operation_id: operation.parent_operation_id ?? null,
      parent_turn_id: operation.parent_turn_id ?? null,
      sub_resolution_id: operation.sub_resolution_id ?? null,
      actor_participant_id: operation.actor_participant_id ?? null,
      lifecycle_status: operation.lifecycle_status ?? null,
      source_state_version: operation.source_state_version ?? null,
      resulting_state_version: operation.resulting_state_version ?? null,
      checkpoint_kinds: asArray(operation.checkpoints).map((entry) => entry.checkpoint_kind),
      child_operation_ids: asArray(state.combat_persistence?.operation_order)
        .map((childId) => state.combat_persistence.operations[childId])
        .filter((child) => child?.parent_operation_id === operation.operation_id)
        .map((child) => child.operation_id),
    }));
}

function inspectCalculationTraces(state = {}) {
  const durableRolls = asArray(state.combat_persistence?.operation_order)
    .map((operationId) => state.combat_persistence.operations[operationId])
    .filter(Boolean)
    .flatMap((operation) => asArray(operation.committed_rolls).map((roll) => ({
      operation_id: operation.operation_id,
      roll_id: roll.roll_id ?? roll.id ?? null,
      roll_type: roll.roll_type ?? roll.type ?? null,
      total: roll.total ?? null,
      components: cloneSerializable(roll.components ?? roll.rolls ?? []),
      ruleset: operation.ruleset ?? null,
      gm_dev_only: true,
    })));
  const latestVisibleRolls = asArray(state.latest_result?.player_result_bundle?.visible_rolls).map((roll, index) => ({
    operation_id: state.latest_result?.sub_resolution_id ?? 'latest-result',
    roll_id: stableId(['latest-visible-roll', index + 1]),
    roll_type: roll.roll_type ?? null,
    total: roll.final_total ?? null,
    components: [],
    ruleset: state.combat?.ruleset ?? null,
    gm_dev_only: false,
    evidence_classification: 'recorded_player_result_roll_summary',
  }));
  return [...durableRolls, ...latestVisibleRolls];
}

function checkpointsByKind(state = {}, checkpointKind) {
  return asArray(state.combat_persistence?.operation_order)
    .map((operationId) => state.combat_persistence.operations[operationId])
    .filter(Boolean)
    .flatMap((operation) => asArray(operation.checkpoints)
      .filter((checkpoint) => checkpoint.checkpoint_kind === checkpointKind)
      .map((checkpoint) => ({
        operation_id: operation.operation_id,
        checkpoint_id: checkpoint.checkpoint_id,
        checkpoint_kind: checkpoint.checkpoint_kind,
        data: cloneSerializable(checkpoint.data ?? {}),
      })));
}

export function buildCombatTraceInspection(input = {}) {
  const state = ensureCombatPersistenceState(cloneSerializable(input.state ?? input));
  const aggregate = reconstructCombatAggregate({ state });
  return {
    status: 'ok',
    operation_lineage: inspectOperationLineage(state),
    chronological_events: groupEventsByRoundTurn(state.combat_persistence?.events),
    calculations: inspectCalculationTraces(state),
    movement: {
      checkpoints: checkpointsByKind(state, COMBAT_CHECKPOINT_KINDS.MOVEMENT_SEGMENT_COMMITTED),
      spatial_state: cloneSerializable(aggregate.spatial),
    },
    reactions_and_continuations: {
      reaction_state: cloneSerializable(aggregate.reaction_state),
      reaction_checkpoints: checkpointsByKind(state, COMBAT_CHECKPOINT_KINDS.REACTION_QUEUE_PERSISTED),
      continuation_checkpoints: checkpointsByKind(state, COMBAT_CHECKPOINT_KINDS.CONTINUATION_PERSISTED),
    },
    tactical_decisions: {
      automatic_state: cloneSerializable(aggregate.automatic_state),
      tactical_profiles: cloneSerializable(state.tactical_profiles ?? []),
      automatic_checkpoints: checkpointsByKind(state, COMBAT_CHECKPOINT_KINDS.AUTOMATIC_DECISION_PERSISTED),
    },
    targeting_and_factions: {
      target_locks: cloneSerializable(aggregate.target_locks),
      faction_relationships: cloneSerializable(aggregate.faction_relationships),
      participant_events: cloneSerializable(aggregate.participant_events),
      faction_checkpoints: checkpointsByKind(state, COMBAT_CHECKPOINT_KINDS.FACTION_EVENT_PERSISTED),
    },
    combat_focus: {
      answers: cloneSerializable(aggregate.combat_focus_answers),
      answer_checkpoints: checkpointsByKind(state, COMBAT_CHECKPOINT_KINDS.COMBAT_FOCUS_ANSWER_PERSISTED),
    },
    persistence_and_recovery: {
      operations: cloneSerializable(state.combat_persistence.operations),
      idempotency_records: cloneSerializable(state.combat_persistence.idempotency_records),
      recovery: inspectCombatRecoveryState({ state }),
      invariant: validateCombatPersistenceInvariants({ state }),
    },
    encounter_resolution_and_rewards: {
      handoff: cloneSerializable(state.canonical_rusk_handoff ?? state.encounter_completion_handoff ?? null),
      resolution: cloneSerializable(state.encounter_resolution ?? null),
      rewards: cloneSerializable(state.encounter_resolution?.rewards ?? null),
      post_combat_review: cloneSerializable(state.post_combat_review ?? null),
      adventure_state: cloneSerializable(state.adventure_state ?? null),
    },
  };
}

export function searchCombatTraceInspection(input = {}) {
  const inspection = input.inspection ?? buildCombatTraceInspection(input);
  const query = cleanText(input.query).toLowerCase();
  const kinds = new Set(asArray(input.kinds ?? input.kind).map((entry) => cleanText(entry).toLowerCase()).filter(Boolean));
  const matches = [];
  const shouldInclude = (kind) => kinds.size === 0 || kinds.has(kind);
  const inspectValue = (kind, id, value) => {
    if (!shouldInclude(kind)) return;
    const text = JSON.stringify(value).toLowerCase();
    if (!query || text.includes(query)) {
      matches.push({ kind, id, value: cloneSerializable(value) });
    }
  };
  for (const entry of inspection.operation_lineage ?? []) inspectValue('operation', entry.operation_id, entry);
  for (const group of inspection.chronological_events ?? []) {
    for (const event of group.events) inspectValue('event', event.event_id, event);
  }
  for (const entry of inspection.calculations ?? []) inspectValue('calculation', entry.roll_id ?? entry.operation_id, entry);
  for (const entry of inspection.movement?.checkpoints ?? []) inspectValue('movement', entry.checkpoint_id, entry);
  for (const entry of inspection.reactions_and_continuations?.reaction_checkpoints ?? []) inspectValue('reaction', entry.checkpoint_id, entry);
  for (const entry of inspection.combat_focus?.answers ?? []) inspectValue('combat_focus', entry.answer_id ?? entry.template_id, entry);
  inspectValue('encounter_resolution', inspection.encounter_resolution_and_rewards?.resolution?.resolution_id ?? 'encounter_resolution', inspection.encounter_resolution_and_rewards);
  return {
    status: 'ok',
    query,
    kinds: [...kinds],
    match_count: matches.length,
    matches,
  };
}

function buildProjectionComparison({ authoritative, playerProjection, gmDevProjection, visibilityReport, safety }) {
  return {
    comparison_kind: 'authoritative_vs_player_safe',
    authoritative_fact_count: {
      participants: asArray(authoritative.participants).length,
      operations: asArray(authoritative.operations).length,
      events: asArray(gmDevProjection.gm_dev_read_model?.aggregate?.latest_authoritative_event ? [gmDevProjection.gm_dev_read_model.aggregate.latest_authoritative_event] : []).length,
    },
    player_projection_sections: Object.keys(playerProjection ?? {}),
    gm_dev_projection_sections: Object.keys(gmDevProjection ?? {}),
    visibility_decision_summary: visibilityReport.summary,
    player_projection_safe: safety.player_projection_safe,
    hidden_information_leaks: safety.hidden_information_leaks,
    over_redaction_findings: safety.over_redaction_findings,
    semantic_parity: {
      uses_production_projector: true,
      projector_parity_tested_by_stage6d15: true,
      inspector_does_not_build_player_projection_independently: true,
    },
  };
}

export function inspectCombatTraceAndVisibility(input = {}) {
  const originalState = input.state ?? input.combat_state ?? input.combatState;
  const authorization = authorizeCombatInspectorRequest({
    ...input,
    state: originalState,
  });
  if (!authorization.authorized) {
    return {
      status: COMBAT_INSPECTION_STATUS.UNAUTHORIZED,
      authorized: false,
      player_safe_message: 'This combat inspector is available only to authorized GM/developer tools.',
      authorization,
    };
  }

  const snapshot = snapshotForInspection({
    state: originalState,
    historical_point: input.historical_point ?? input.historicalPoint,
  });
  const state = snapshot.state;
  const viewer = selectCombatInspectorViewer({
    state,
    viewer: input.viewer ?? input.selected_viewer ?? input.selectedViewer,
    viewer_participant_id: input.viewer_participant_id ?? input.viewerParticipantId,
    active_character_id: input.active_character_id ?? input.activeCharacterId,
  });
  if (!viewer.valid) {
    return {
      status: COMBAT_INSPECTION_STATUS.INVALID_VIEWER,
      authorized: true,
      authorization,
      viewer,
      player_safe_message: 'Select a valid combat participant before inspecting a player perspective.',
    };
  }

  const auditRecord = recordCombatInspectionAccess({
    ...input,
    state,
    authorization,
    viewer,
    inspection_type: input.inspection_type ?? input.inspectionType ?? 'combat_trace_visibility',
  });
  const productionPlayer = buildProductionCombatPlayerProjection({ state, viewer });
  const gmDevProjection = buildCombatInspectorGmDevProjection({ state });
  const visibilityReport = buildCombatVisibilityDecisionReport({
    state,
    viewer,
    player_projection: productionPlayer.projection,
  });
  const safety = validateCombatInspectorProjectionSafety({
    state,
    viewer,
    player_projection: productionPlayer.projection,
  });
  const traceInspection = buildCombatTraceInspection({ state });
  return {
    status: COMBAT_INSPECTION_STATUS.OK,
    contract_stage: COMBAT_INSPECTOR_CONTRACT_STAGE,
    read_only: true,
    authorized: true,
    authorization,
    access_audit: auditRecord,
    selected_viewer: viewer,
    historical_reconstruction: {
      status: snapshot.status,
      exactness: snapshot.exactness,
      historical_point: snapshot.historical_point,
      event: snapshot.event ?? null,
      notes: snapshot.notes,
      no_reroll: true,
      no_tactical_rerun: true,
      no_mutation: true,
    },
    authoritative_snapshot: snapshot.aggregate,
    production_player_projection: productionPlayer,
    gm_dev_projection: gmDevProjection,
    visibility_inspection: visibilityReport,
    projection_comparison: buildProjectionComparison({
      authoritative: snapshot.aggregate,
      playerProjection: productionPlayer.projection,
      gmDevProjection,
      visibilityReport,
      safety,
    }),
    trace_inspection: traceInspection,
    search_and_filtering: searchCombatTraceInspection({
      inspection: traceInspection,
      query: input.search_query ?? input.searchQuery ?? '',
      kinds: input.search_kinds ?? input.searchKinds ?? [],
    }),
    navigation: {
      deep_links_are_internal_only: true,
      deep_link_authorization_required: true,
      current_state_version: snapshot.aggregate.state_version,
      operation_ids: traceInspection.operation_lineage.map((entry) => entry.operation_id),
      event_sequences: asArray(state.combat_persistence?.events).map((entry) => entry.sequence),
      repair_links: asArray(state.combat_persistence?.recovery_incident_order).map((incidentId) => ({
        incident_id: incidentId,
        repair_requires_stage6d12_authorization: true,
        inspector_applies_repair: false,
      })),
    },
    diagnostics: {
      player_projection_safety: safety,
      migration_added: false,
      inspector_mutates_combat_state: false,
      route_exposure: 'engine_helper_only_no_player_route',
    },
  };
}

export function projectCombatInspectorForPlayer() {
  const projection = {
    status: 'not_available',
    player_safe_message: 'Combat inspector data is not available in player views.',
    inspector_available_to_player: false,
  };
  assertNoCombatPlayerHiddenData(projection);
  return projection;
}

export function assertNoCombatInspectorPlayerLeak(payload = {}) {
  const violations = scanForPlayerHiddenData(payload, {
    extra_value_patterns: COMBAT_INSPECTOR_HIDDEN_VALUE_PATTERNS,
  });
  if (violations.length > 0) {
    const error = new Error(`Combat inspector player projection leaked hidden data: ${violations[0].message}`);
    error.violations = violations;
    throw error;
  }
  assertNoCombatPlayerHiddenData(payload);
  return true;
}
