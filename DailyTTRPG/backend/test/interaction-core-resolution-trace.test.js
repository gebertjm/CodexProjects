import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MUTATION_APPLICATION_STATUSES,
  MUTATION_IDEMPOTENCY_STATUSES,
  NEXT_BEAT_DECISION_KINDS,
  RECOVERY_NEEDED_KINDS,
  RESOLUTION_TRACE_CHECKPOINTS,
  RESOLUTION_TRACE_INSPECTION_STATUSES,
  RESOLUTION_TRACE_STORAGE_STRATEGIES,
  assertNoPlayerHiddenData,
  compareResolutionPlayerGmDevProjections,
  createCommittedResolutionResponse,
  createCommitResolutionRequest,
  createMutationPlan,
  createOutcomeQualityResultBundle,
  createReadModelRefreshHook,
  createRecoveryNeededEnvelope,
  createResolutionProvenanceInspector,
  createResolutionTraceAccessDecision,
  createResolutionTraceEnvelope,
  createResolutionTraceLifecycle,
  createTransitionOrchestrationDecision,
  projectResolutionResponseForGmDev,
  projectResolutionResponseForPlayer,
  projectResolutionTraceForPlayer,
  selectNextBeatDecision,
  serializeResolutionTraceForGmDev,
} from '../src/services/interactionCore/index.js';

function text(value) {
  return JSON.stringify(value);
}

function richTraceInput(overrides = {}) {
  const request = createCommitResolutionRequest({
    interactionDomain: 'exploration',
    requestId: 'request-caravan-1',
    correlationId: 'correlation-caravan-1',
    userId: 'account-1',
    characterId: 'character-1',
    campaignId: 'campaign-1',
    actionWindowId: 'window-1',
    sourceSceneId: 'broken-caravan-site',
    selectedOptionId: 'inspect-broken-caravan',
    selectedOptionKind: 'committed_action',
  });
  const outputBundle = {
    knowledgeOutputs: [
      {
        knowledgeId: 'clue_caravan_irregularity',
        title: 'Caravan Irregularity',
        summary: 'The wreck does not look like a simple robbery.',
      },
    ],
    objectiveOutputs: [
      {
        objectiveId: 'witness-the-aftermath',
        title: 'Witness the Aftermath',
        status: 'completed',
        summary: 'You found the first sign that the road attacks are stranger than they look.',
      },
    ],
    historyOutputs: [
      {
        historyId: 'history-caravan',
        text: 'You inspected the broken caravan.',
      },
    ],
  };
  const playerResultBundle = createOutcomeQualityResultBundle({
    attemptedAction: { label: 'Inspect the broken caravan' },
    result: { text: 'The wreck tells a careful story.' },
    outputBundle,
    next: { label: 'Continue toward the Grey Road Inn' },
  });
  const transitionDecision = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    sourceSceneId: 'broken-caravan-site',
  });
  const nextBeatDecision = selectNextBeatDecision({ transitionDecision });
  const readModelRefreshHook = createReadModelRefreshHook({
    timing: 'after_next_beat',
    targets: ['scene', 'objectives', 'knowledge'],
  });

  return {
    traceId: 'trace-caravan-1',
    request,
    authorizationResult: { status: 'authorized', capability: 'can_advance_beats' },
    activeStateSummary: { state: 'exploration_active', scene_key: 'broken-caravan-site' },
    validationResult: { status: 'valid' },
    staleDuplicateIdempotencyResult: { status: MUTATION_IDEMPOTENCY_STATUSES.CURRENT },
    selectedOutcome: { outcome_id: 'inspect_caravan_success', branch_id: 'gm-success-branch' },
    authoredSource: { source_content_id: 'inspect-broken-caravan', source_content_type: 'exploration_interaction' },
    previewConsistencyDiagnostics: { alignment_status: 'aligned' },
    checkMetadata: [{ check_id: 'caravan-check', hidden_dc: 12, raw_roll: 17 }],
    outputBundle,
    playerResultBundle,
    mutationPlan: createMutationPlan({
      writeGroups: [
        {
          group: 'knowledge_writes',
          operations: [
            {
              operationKind: 'grant_knowledge',
              targetId: 'clue_caravan_irregularity',
              dedupeKey: 'knowledge:clue_caravan_irregularity',
            },
          ],
        },
      ],
    }),
    mutationResult: {
      status: MUTATION_APPLICATION_STATUSES.APPLIED,
      applied_write_groups: ['knowledge_writes', 'objective_writes'],
    },
    transactionBoundary: { status: 'committed', transaction_id: 'tx-caravan-1' },
    actionWindowLifecycleDecision: { closed_window_id: 'window-1', opened_window_kind: 'exploration' },
    transitionDecision,
    nextBeatDecision,
    readModelRefreshHook,
    readModelRefreshTarget: 'current_player_read_model',
    readModel: {
      scene: { key: 'broken-caravan-site', title: 'Broken Caravan' },
      currentObjective: { key: 'witness-the-aftermath', title: 'Witness the Aftermath', status: 'completed' },
      knownFacts: [{ knowledge_key: 'clue_caravan_irregularity', title: 'Caravan Irregularity' }],
      visibleAffordances: [{ label: 'Continue toward the Grey Road Inn' }],
    },
    playerProjectionSummary: { safe_sections: ['result', 'discoveries', 'progress', 'next'] },
    gmDevProjection: { includes_trace: true, includes_hidden_checks: true },
    visibilityFilteringNotes: ['player projection stripped hidden check metadata'],
    responseStatus: 'resolved',
    timestamps: { response_returned_at: '2026-06-12T12:00:00.000Z' },
    ...overrides,
  };
}

test('6C.7 trace envelope captures lifecycle, diagnostics, and non-persistent storage strategy', () => {
  const trace = createResolutionTraceEnvelope(richTraceInput());
  const lifecycle = createResolutionTraceLifecycle(trace);

  assert.equal(trace.trace_schema_version, '6C.7-generated-resolution-trace');
  assert.equal(trace.trace_storage_strategy.strategy, RESOLUTION_TRACE_STORAGE_STRATEGIES.GENERATED_IN_MEMORY);
  assert.equal(trace.trace_storage_strategy.schema_migration_required, false);
  assert.ok(trace.trace_collection_points.includes(RESOLUTION_TRACE_CHECKPOINTS.REQUEST_RECEIVED));
  assert.equal(trace.authorization_result.status, 'authorized');
  assert.equal(trace.output_bundle.knowledge_outputs[0].knowledge_id, 'clue_caravan_irregularity');
  assert.deepEqual(trace.mutation_safety_diagnostics.write_group_order, ['knowledge_writes']);
  assert.equal(trace.transition_orchestration_diagnostics.alignment_status, 'aligned');
  assert.equal(trace.result_read_model_alignment_diagnostics.alignment_status, 'aligned');
  assert.equal(lifecycle.lifecycle_status, RESOLUTION_TRACE_INSPECTION_STATUSES.TRACEABLE);
  assert.ok(lifecycle.captured.includes(RESOLUTION_TRACE_CHECKPOINTS.MUTATION_PLAN_APPLIED));
  assert.ok(lifecycle.captured.includes(RESOLUTION_TRACE_CHECKPOINTS.READ_MODEL_REFRESHED));
});

test('6C.7 provenance inspector summarizes output mutation transition next-beat and projection comparison', () => {
  const trace = createResolutionTraceEnvelope(richTraceInput());
  const inspector = createResolutionProvenanceInspector({ trace, canAdvanceBeats: true, accountId: 'account-1' });

  assert.equal(inspector.inspector_kind, 'beat_resolution_provenance_inspector');
  assert.equal(inspector.access_decision.authorized, true);
  assert.equal(inspector.access_decision.required_capability, 'can_advance_beats');
  assert.equal(inspector.trace_storage.persistence_enabled, false);
  assert.equal(inspector.lifecycle.lifecycle_status, RESOLUTION_TRACE_INSPECTION_STATUSES.TRACEABLE);
  assert.equal(inspector.provenance_summary.output_reference_counts.knowledge_outputs, 1);
  assert.ok(inspector.provenance_summary.mutation_write_groups.includes('knowledge_writes'));
  assert.equal(inspector.provenance_summary.transition_decision_kind, 'stay_in_current_scene');
  assert.equal(inspector.provenance_summary.next_beat_decision_kind, 'open_exploration_action_window');
  assert.equal(inspector.player_vs_gm_projection_comparison.player_projection_safe, true);
  assert.equal(inspector.player_vs_gm_projection_comparison.gm_dev_trace_present, true);
  assert.equal(inspector.player_trace_projection, null);
});

test('6C.7 trace access decision follows GM/dev debug capability semantics', () => {
  const denied = createResolutionTraceAccessDecision({ accountId: 'account-1' });
  const allowedByCapability = createResolutionTraceAccessDecision({
    accountId: 'account-1',
    canAdvanceBeats: true,
  });
  const allowedByRole = createResolutionTraceAccessDecision({
    accountId: 'account-2',
    role: 'dev',
  });

  assert.equal(denied.authorized, false);
  assert.equal(denied.denied_reason, 'gm_dev_trace_requires_authorized_debug_capability');
  assert.equal(allowedByCapability.authorized, true);
  assert.equal(allowedByCapability.denied_reason, null);
  assert.equal(allowedByRole.authorized, true);
});

test('6C.7 player-vs-GM comparison keeps traces and hidden mechanics out of player responses', () => {
  const trace = createResolutionTraceEnvelope(richTraceInput());
  const response = createCommittedResolutionResponse({
    interactionDomain: 'exploration',
    requestId: 'request-caravan-1',
    playerResultBundle: trace.player_result_bundle,
    outputBundle: trace.output_bundle,
    transitionDecision: trace.transition_decision,
    nextBeatDecision: trace.next_beat_decision,
    readModelRefreshHook: trace.read_model_refresh_diagnostics.read_model_refresh_hook,
    gmDevTrace: trace,
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const comparison = compareResolutionPlayerGmDevProjections(response);

  assert.equal(comparison.comparison_status, RESOLUTION_TRACE_INSPECTION_STATUSES.PLAYER_SAFE);
  assert.equal(comparison.player_projection_safe, true);
  assert.equal(comparison.gm_dev_trace_present, true);
  assert.equal(gmDev.gm_dev_trace.selected_outcome.branch_id, 'gm-success-branch');
  assert.equal(text(player).includes('gm_dev_trace'), false);
  assert.equal(text(player).includes('branch_id'), false);
  assert.equal(text(player).includes('hidden_dc'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.7 endpoint future-supported handoff remains GM/dev traceable and player-hidden', () => {
  const transitionDecision = createTransitionOrchestrationDecision({
    interactionDomain: 'dialogue',
    outputBundle: {
      transitionOutputs: [
        {
          status: 'future_supported',
          targetType: 'combat_pending',
          targetId: 'shrine-rusk-confrontation',
          playerLabel: 'Hold at the shrine',
          playerSummary: 'You have reached the current playable endpoint.',
          gmDevRouting: { combatRouting: 'shrine-rusk-confrontation' },
        },
      ],
    },
  });
  const nextBeatDecision = selectNextBeatDecision({ transitionDecision });
  const playerResultBundle = createOutcomeQualityResultBundle({
    result: { text: 'Rusk falters as the shrine pressure crests.' },
    complications: [{ label: 'Current endpoint', text: 'You can review what you learned.' }],
    status: { state: 'awaiting_support', label: 'Awaiting support', isEndpoint: true },
  });
  const trace = createResolutionTraceEnvelope(
    richTraceInput({
      interactionDomain: 'dialogue',
      sourceDialogueId: 'greyvale_rusk_at_the_shrine_dialogue',
      selectedOptionId: 'move_push_rusk_to_name_source',
      selectedOptionKind: 'committed_social_move',
      selectedOutcome: { outcome_id: 'rusk_endpoint', branch_id: 'rusk-hard-success' },
      outputBundle: {
        transitionOutputs: [
          {
            status: 'future_supported',
            targetType: 'combat_pending',
            targetId: 'shrine-rusk-confrontation',
            playerLabel: 'Hold at the shrine',
            gmDevRouting: { combatRouting: 'shrine-rusk-confrontation' },
          },
        ],
      },
      playerResultBundle,
      transitionDecision,
      nextBeatDecision,
      readModel: {
        endpoint: {
          state: 'awaiting_support',
          label: 'Current playable slice endpoint reached',
          review_only: true,
        },
        actionStatus: { state: 'slice_endpoint_reached', label: 'Endpoint reached' },
      },
    })
  );
  const response = createCommittedResolutionResponse({
    interactionDomain: 'dialogue',
    playerResultBundle,
    outputBundle: trace.output_bundle,
    transitionDecision,
    nextBeatDecision,
    gmDevTrace: trace,
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);

  assert.equal(gmDev.gm_dev_trace.transition_decision.target_type, 'combat_pending');
  assert.equal(gmDev.gm_dev_trace.next_beat_decision.kind, NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY);
  assert.equal(text(player).includes('combat_pending'), false);
  assert.equal(text(player).includes('future_supported'), false);
  assert.equal(text(player).includes('shrine-rusk-confrontation'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.7 recovery stale duplicate and unavailable cases carry repair diagnostics for GM/dev only', () => {
  const recovery = createRecoveryNeededEnvelope({
    recoveryKind: RECOVERY_NEEDED_KINDS.STALE_REQUEST,
    message: 'The scene changed. Refresh and choose again.',
    failedLifecycleStep: 'stale_duplicate_checked',
    partialWritesKnown: ['none'],
    recommendedGmDevRepairAction: 'inspect_current_action_window',
    diagnostics: { stale_version: 'window-1:v1', current_version: 'window-1:v2' },
  });
  const trace = createResolutionTraceEnvelope(
    richTraceInput({
      staleDuplicateIdempotencyResult: {
        status: MUTATION_IDEMPOTENCY_STATUSES.STALE,
        duplicate: false,
        mutates_state: false,
      },
      mutationPlan: null,
      mutationResult: { status: 'stale_rejected', applied_write_groups: [] },
      recoveryNeeded: recovery,
      playerResultBundle: {
        recovery: {
          message: 'The scene changed. Refresh and choose again.',
          recoveryAction: 'refresh_current_scene',
        },
        status: { state: 'recovery_needed', label: 'Recovery needed', isRecoveryNeeded: true },
      },
      readModel: {
        actionStatus: { state: 'recovery_needed', label: 'Refresh needed' },
      },
    })
  );
  const lifecycle = createResolutionTraceLifecycle(trace);
  const inspector = createResolutionProvenanceInspector({ trace });

  assert.equal(trace.recovery_needed.recovery_kind, RECOVERY_NEEDED_KINDS.STALE_REQUEST);
  assert.equal(trace.recovery_needed.recommended_gm_dev_repair_action, 'inspect_current_action_window');
  assert.ok(lifecycle.captured.includes(RESOLUTION_TRACE_CHECKPOINTS.RECOVERY_NEEDED_TRIGGERED));
  assert.equal(inspector.diagnostics.recovery_needed.failed_lifecycle_step, 'stale_duplicate_checked');
  assert.equal(inspector.player_vs_gm_projection_comparison.player_projection_safe, true);
  assert.equal(text(projectResolutionTraceForPlayer(trace)), 'null');
});

test('6C.7 GM/dev trace serialization redacts secrets without removing authorization results', () => {
  const serialized = serializeResolutionTraceForGmDev({
    ...richTraceInput(),
    authorizationResult: { status: 'authorized', capability: 'can_advance_beats' },
    activeStateSummary: {
      auth_header: 'Bearer secret-token',
      api_key: 'secret-api-key',
      note: 'safe diagnostic',
    },
  });
  const serializedText = text(serialized);

  assert.equal(serialized.authorization_result.status, 'authorized');
  assert.equal(serialized.active_state_summary.auth_header, '[redacted]');
  assert.equal(serialized.active_state_summary.api_key, '[redacted]');
  assert.equal(serialized.active_state_summary.note, 'safe diagnostic');
  assert.equal(serializedText.includes('secret-token'), false);
  assert.equal(serializedText.includes('secret-api-key'), false);
  assert.equal(serialized.visibility_projection.preserves_debug, true);
});
