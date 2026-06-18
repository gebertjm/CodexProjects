import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMITTED_BEAT_MUTATION_ORDER,
  MUTATION_APPLICATION_STATUSES,
  MUTATION_IDEMPOTENCY_STATUSES,
  MUTATION_WRITE_GROUPS,
  NEXT_BEAT_DECISION_KINDS,
  RECOVERY_NEEDED_KINDS,
  RESOLUTION_RESPONSE_KINDS,
  assertMutationPlanOrdering,
  assertResolutionResponsePlayerSafe,
  buildCommittedBeatDedupeKey,
  createCommitResolutionRequest,
  createCommittedBeatMutationPlan,
  createCommittedResolutionResponse,
  createMutationApplicationResult,
  createMutationIdempotencyDecision,
  createMutationPlan,
  createMutationSafetyDiagnostics,
  createMutationWriteGroup,
  createReadModelRefreshHook,
  createResolutionTraceEnvelope,
  projectResolutionResponseForGmDev,
  projectResolutionResponseForPlayer,
} from '../src/services/interactionCore/index.js';

function greyvaleCommitRequest() {
  return createCommitResolutionRequest({
    interactionDomain: 'dialogue',
    userId: 'user-1',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    adventureId: 'greyvale',
    actionWindowId: 'window-1',
    sourceDialogueId: 'greyvale_tomas_roadside_worries_dialogue',
    selectedOptionId: 'move_compare_caravan_pattern',
    selectedOptionKind: 'committed_action',
    idempotencyKey: 'commit:tomas:window-1',
  });
}

function greyvaleOutputBundle() {
  return {
    knowledgeOutputs: [
      {
        knowledgeId: 'innkeeper_tracks_road_patterns',
        title: 'Pattern of Attacks',
        summary: 'Tomas describes a pattern in the road trouble.',
      },
      {
        knowledgeId: 'innkeeper_tracks_road_patterns',
        title: 'Pattern of Attacks',
        summary: 'Duplicate pattern clue should be deduped.',
      },
    ],
    objectiveOutputs: [
      {
        objectiveId: 'gather-local-insight',
        title: 'Gather local insight',
        status: 'active',
        progress: 1,
      },
    ],
    historyOutputs: [
      {
        eventId: 'history:tomas-pattern',
        text: 'Tomas described the road pattern.',
      },
    ],
    latestDevelopmentOutput: {
      latestDevelopmentId: 'latest:tomas-pattern',
      text: 'Tomas gave you a lead toward Elin.',
    },
    relationshipOrSocialWrites: [
      {
        participantId: 'tomas-rell',
        stateKey: 'trust',
        operation: 'increment',
        delta: 1,
        playerPerceptionSummary: 'Tomas seems more willing to talk.',
      },
    ],
    completedRecordOutputs: [
      {
        completedInteractionId: 'completed:tomas',
        interactionDomain: 'dialogue',
        title: 'Tomas and the Road',
        summary: 'Tomas shared a road-pattern lead.',
      },
    ],
    archiveSearchOutputs: [
      {
        archiveEntryId: 'archive:tomas-pattern',
        title: 'Tomas and the Road',
        summary: 'Road-pattern lead from Tomas.',
      },
    ],
    transitionOutputs: [
      {
        status: 'live',
        targetType: 'dialogue',
        targetId: 'greyvale_elin_memory_dialogue',
        playerLabel: 'Speak with Elin',
      },
    ],
  };
}

test('6C.4 committed beat mutation plan groups writes in canonical order and omits empty groups', () => {
  const request = greyvaleCommitRequest();
  const plan = createCommittedBeatMutationPlan({
    request,
    outputBundle: greyvaleOutputBundle(),
    actionWindowOperations: [
      {
        operationKind: 'close_consumed_action_window',
        actionWindowId: request.action_window_id,
        dedupeKey: 'action-window:close:window-1',
      },
      {
        operationKind: 'open_next_dialogue_action_window',
        dedupeKey: 'action-window:open:elin',
      },
    ],
    readModelRefreshOperations: [
      {
        operationKind: 'refresh_current_player_read_model',
        dedupeKey: 'refresh:campaign-1:pc-1',
      },
    ],
    traceOperations: [
      {
        operationKind: 'attach_gm_dev_trace_scaffold',
        dedupeKey: 'trace:commit:tomas',
      },
    ],
  });

  assert.deepEqual(
    plan.write_groups.map((group) => group.group_key),
    [
      MUTATION_WRITE_GROUPS.OBJECTIVES,
      MUTATION_WRITE_GROUPS.KNOWLEDGE,
      MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST,
      MUTATION_WRITE_GROUPS.STATE,
      MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES,
      MUTATION_WRITE_GROUPS.TRANSITION_ENDPOINT,
      MUTATION_WRITE_GROUPS.ACTION_WINDOW,
      MUTATION_WRITE_GROUPS.READ_MODEL_REFRESH,
      MUTATION_WRITE_GROUPS.TRACE_PROVENANCE,
    ]
  );
  assert.equal(plan.canonical_order[0].step, COMMITTED_BEAT_MUTATION_ORDER[0].step);
  assert.equal(
    plan.write_groups.find((group) => group.group_key === MUTATION_WRITE_GROUPS.KNOWLEDGE).operations.length,
    1
  );
  assert.equal(plan.dedupe_markers.some((marker) => marker.decision === 'dropped_duplicate'), true);
  assert.doesNotThrow(() => assertMutationPlanOrdering(plan));
});

test('6C.4 mutation write groups generate stable dedupe markers and drop duplicate operations', () => {
  const group = createMutationWriteGroup({
    group: MUTATION_WRITE_GROUPS.OBJECTIVES,
    operations: [
      {
        operationKind: 'upsert_objective',
        output: { outputKind: 'objective', objectiveId: 'gather-local-insight' },
      },
      {
        operationKind: 'upsert_objective',
        output: { outputKind: 'objective', objectiveId: 'gather-local-insight' },
      },
    ],
  });
  const key = buildCommittedBeatDedupeKey({
    campaignId: 'campaign-1',
    characterId: 'pc-1',
    actionWindowId: 'window-1',
    interactionDomain: 'exploration',
    selectedOptionId: 'inspect-broken-caravan',
    outcomeId: 'success',
    groupKey: MUTATION_WRITE_GROUPS.OBJECTIVES,
    output: { outputKind: 'objective', objectiveId: 'witness-the-aftermath' },
  });

  assert.equal(group.operations.length, 1);
  assert.equal(group.duplicate_operations.length, 1);
  assert.equal(group.dedupe_markers[0].decision, 'dropped_duplicate');
  assert.match(key, /campaign-1:pc-1:window-1:exploration/);
  assert.match(key, /objective:witness-the-aftermath/);
});

test('6C.4 duplicate and stale submit decisions are no-mutation player-safe recoveries', () => {
  const duplicate = createMutationIdempotencyDecision({
    status: MUTATION_IDEMPOTENCY_STATUSES.DUPLICATE,
    idempotencyKey: 'commit:tomas:window-1',
    message: 'That action was already handled. Review the current scene.',
  });
  const stale = createMutationIdempotencyDecision({
    status: MUTATION_IDEMPOTENCY_STATUSES.STALE,
    currentStateMarker: { action_window_id: 'window-2' },
    submittedStateMarker: { action_window_id: 'window-1' },
  });

  assert.equal(duplicate.no_mutation, true);
  assert.equal(duplicate.recovery_needed.recovery_kind, RECOVERY_NEEDED_KINDS.DUPLICATE_REQUEST);
  assert.equal(stale.no_mutation, true);
  assert.equal(stale.recovery_needed.recovery_kind, RECOVERY_NEEDED_KINDS.STALE_REQUEST);
  assert.equal(JSON.stringify(duplicate).includes('mutation_plan'), false);
});

test('6C.4 simulated mutation failure marks recovery-needed and blocks read-model refresh', () => {
  const plan = createCommittedBeatMutationPlan({
    request: greyvaleCommitRequest(),
    outputBundle: greyvaleOutputBundle(),
    readModelRefreshOperations: [{ operationKind: 'refresh_current_player_read_model', dedupeKey: 'refresh:tomas' }],
  });
  const result = createMutationApplicationResult({
    mutationPlan: plan,
    failedGroupKey: MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES,
    failedOperationDedupeKey: 'completed:record:tomas',
    failureReason: 'simulated archive write failure',
  });

  assert.equal(result.status, MUTATION_APPLICATION_STATUSES.RECOVERY_NEEDED);
  assert.equal(result.read_model_refresh_allowed, false);
  assert.deepEqual(result.applied_write_groups, [
    MUTATION_WRITE_GROUPS.OBJECTIVES,
    MUTATION_WRITE_GROUPS.KNOWLEDGE,
    MUTATION_WRITE_GROUPS.HISTORY_AND_LATEST,
    MUTATION_WRITE_GROUPS.STATE,
  ]);
  assert.equal(result.recovery_needed.recovery_kind, RECOVERY_NEEDED_KINDS.MUTATION_FAILED);
  assert.equal(result.recovery_needed.failed_lifecycle_step, MUTATION_WRITE_GROUPS.RECORDS_AND_INDEXES);
});

test('6C.4 endpoint mutation plan opens no unsupported combat action window and remains player-safe', () => {
  const request = createCommitResolutionRequest({
    interactionDomain: 'dialogue',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    actionWindowId: 'rusk-window',
    sourceDialogueId: 'greyvale_rusk_at_the_shrine_dialogue',
    selectedOptionId: 'exit_rusk_confrontation',
    selectedOptionKind: 'exit_or_transition',
  });
  const plan = createCommittedBeatMutationPlan({
    request,
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
    actionWindowOperations: [
      {
        operationKind: 'close_consumed_action_window',
        dedupeKey: 'action-window:close:rusk-window',
      },
    ],
    readModelRefreshOperations: [
      {
        operationKind: 'refresh_endpoint_review_state',
        dedupeKey: 'refresh:endpoint:rusk',
      },
    ],
    nextBeatIntent: {
      kind: NEXT_BEAT_DECISION_KINDS.ENDPOINT_REVIEW_ONLY,
      endpointStatus: 'future_supported',
    },
  });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'dialogue',
    request,
    outputBundle: plan.normalized_output_bundle,
    mutationPlan: plan,
    readModelRefreshHook: createReadModelRefreshHook({
      timing: 'after_mutation_commit',
      targets: ['endpoint', 'current_scene'],
    }),
    playerResultBundle: {
      result: { text: 'The confrontation reaches the edge of the playable slice.' },
      status: { state: 'awaiting_support', label: 'Awaiting support', isEndpoint: true },
    },
  });
  const player = projectResolutionResponseForPlayer(response);
  const playerText = JSON.stringify(player);

  assert.equal(
    plan.write_groups.find((group) => group.group_key === MUTATION_WRITE_GROUPS.ACTION_WINDOW).operations.length,
    1
  );
  assert.equal(playerText.includes('combat_pending'), false);
  assert.equal(playerText.includes('future_supported'), false);
  assert.equal(playerText.includes('shrine-rusk-confrontation'), false);
  assert.doesNotThrow(() => assertResolutionResponsePlayerSafe(response));
});

test('6C.4 GM/dev diagnostics expose mutation plan and failure details while player projection hides them', () => {
  const request = greyvaleCommitRequest();
  const plan = createCommittedBeatMutationPlan({
    request,
    outputBundle: greyvaleOutputBundle(),
    readModelRefreshOperations: [{ operationKind: 'refresh_current_player_read_model', dedupeKey: 'refresh:tomas' }],
  });
  const mutationResult = createMutationApplicationResult({ mutationPlan: plan });
  const diagnostics = createMutationSafetyDiagnostics({
    mutationPlan: plan,
    idempotencyDecision: { status: MUTATION_IDEMPOTENCY_STATUSES.CURRENT },
    mutationResult: { mutationPlan: plan },
    actionWindowLifecycleDecision: {
      close_consumed_action_window: true,
      open_next_action_window: true,
    },
    readModelRefreshTarget: {
      timing: 'after_mutation_commit',
      targets: ['dialogue', 'knowledge'],
    },
  });
  const trace = createResolutionTraceEnvelope({
    request,
    mutationPlan: plan,
    mutationResult,
    actionWindowLifecycleDecision: diagnostics.action_window_lifecycle_decision,
    readModelRefreshTarget: diagnostics.read_model_refresh_target,
    playerResultBundle: {
      result: { text: 'Tomas lowers his voice.' },
      status: { state: 'resolved', label: 'Resolved' },
    },
  });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'dialogue',
    request,
    outputBundle: greyvaleOutputBundle(),
    mutationPlan: plan,
    gmDevTrace: trace,
    playerResultBundle: trace.player_result_bundle,
  });
  const gmDev = projectResolutionResponseForGmDev(response);
  const player = projectResolutionResponseForPlayer(response);
  const playerText = JSON.stringify(player);

  assert.equal(diagnostics.write_group_order.includes(MUTATION_WRITE_GROUPS.KNOWLEDGE), true);
  assert.equal(gmDev.gm_dev_trace.mutation_safety_diagnostics.write_group_order.length > 0, true);
  assert.equal(gmDev.gm_dev_trace.mutation_safety_diagnostics.mutation_result.status, MUTATION_APPLICATION_STATUSES.APPLIED);
  assert.equal(response.response_kind, RESOLUTION_RESPONSE_KINDS.COMMITTED);
  assert.equal(playerText.includes('mutation_plan'), false);
  assert.equal(playerText.includes('dedupe_key'), false);
  assert.equal(playerText.includes('gm_dev'), false);
  assert.doesNotThrow(() => assertResolutionResponsePlayerSafe(response));
});
