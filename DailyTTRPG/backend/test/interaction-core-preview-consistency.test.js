import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTERACTION_OPTION_KINDS,
  PREVIEW_ALIGNMENT_STATUSES,
  PREVIEW_EXPECTATION_KINDS,
  RECOVERY_NEEDED_KINDS,
  RESOLUTION_OUTCOME_MARKER_KINDS,
  RESOLUTION_REQUEST_KINDS,
  RESOLUTION_RESPONSE_KINDS,
  TRANSITION_DECISION_KINDS,
  assertNoPlayerHiddenData,
  assertPreviewResponseNonMutating,
  comparePreviewExpectationsToResolution,
  createCommitResolutionRequest,
  createCommittedResolutionResponse,
  createPreviewAlignmentMarkers,
  createPreviewConsistencyDiagnostics,
  createPreviewConsistencyTrace,
  createPreviewExpectationMarker,
  createPreviewResolutionRequest,
  createPreviewResolutionResponse,
  createResolutionOutcomeMarker,
  createResolutionResponse,
  projectResolutionResponseForGmDev,
  projectResolutionResponseForPlayer,
  validateCommitAgainstPreviewContext,
  validatePreviewRequestConsistency,
} from '../src/services/interactionCore/index.js';

function explorationPreviewRequest(overrides = {}) {
  return createPreviewResolutionRequest({
    interactionDomain: 'exploration',
    userId: 'user-1',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    adventureId: 'greyvale',
    actionWindowId: 'window-1',
    sourceSceneId: 'broken-caravan-site',
    selectedOptionId: 'inspect-broken-caravan',
    selectedOptionKind: INTERACTION_OPTION_KINDS.COMMITTED_ACTION,
    domainOptionKind: 'beat_action',
    contextVersion: 'window-v1',
    ...overrides,
  });
}

function dialoguePreviewRequest(overrides = {}) {
  return createPreviewResolutionRequest({
    interactionDomain: 'dialogue',
    userId: 'user-1',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    sourceDialogueId: 'greyvale_tomas_roadside_worries_dialogue',
    selectedOptionId: 'move_compare_caravan_pattern',
    selectedOptionKind: INTERACTION_OPTION_KINDS.COMMITTED_ACTION,
    domainOptionKind: 'committed_social_move',
    contextVersion: 'dialogue-v1',
    ...overrides,
  });
}

test('6C.2 preview request consistency validates current action window, domain, source, option, and version markers', () => {
  const request = explorationPreviewRequest();
  const result = validatePreviewRequestConsistency({
    request,
    activeState: {
      interactionDomain: 'exploration',
      actionWindowId: 'window-1',
      currentSceneId: 'broken-caravan-site',
      contextVersion: 'window-v1',
      actionWindowState: 'open',
    },
    option: {
      optionId: 'inspect-broken-caravan',
      availability: { status: 'available', available: true },
    },
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, PREVIEW_ALIGNMENT_STATUSES.ALIGNED);
  assert.equal(result.preview_alignment_markers.selected_option_id, 'inspect-broken-caravan');
  assert.equal(result.preview_alignment_markers.preview_token.includes('inspect-broken-caravan'), true);
  assert.equal(result.diagnostics.preview_validation_result.valid, true);
});

test('6C.2 preview request consistency rejects commit-shaped, closed, stale, or mismatched preview contexts safely', () => {
  const commitRequest = createCommitResolutionRequest({
    ...explorationPreviewRequest(),
    requestKind: RESOLUTION_REQUEST_KINDS.COMMIT,
  });
  const wrongKind = validatePreviewRequestConsistency({
    request: commitRequest,
    activeState: {
      interactionDomain: 'exploration',
      actionWindowId: 'window-1',
      currentSceneId: 'broken-caravan-site',
      contextVersion: 'window-v1',
      actionWindowState: 'open',
    },
    option: { optionId: 'inspect-broken-caravan' },
  });
  const stale = validatePreviewRequestConsistency({
    request: explorationPreviewRequest(),
    activeState: {
      interactionDomain: 'exploration',
      actionWindowId: 'window-2',
      currentSceneId: 'grey-road-inn',
      contextVersion: 'window-v2',
      actionWindowState: 'resolved',
    },
    option: { optionId: 'inspect-broken-caravan' },
  });
  const player = projectResolutionResponseForPlayer(stale.response);

  assert.equal(wrongKind.valid, false);
  assert.equal(wrongKind.mismatches.some((entry) => entry.field === 'request_kind'), true);
  assert.equal(stale.valid, false);
  assert.equal(stale.status, PREVIEW_ALIGNMENT_STATUSES.STALE);
  assert.equal(stale.response.response_kind, RESOLUTION_RESPONSE_KINDS.RECOVERY);
  assert.equal(player.recovery.recovery_kind, 'safe_recovery');
  assert.match(player.recovery.player_safe_message, /preview is no longer current/i);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.2 preview response non-mutation assertions reject output, mutation, transition, next beat, and refresh hooks', () => {
  const preview = createPreviewResolutionResponse({
    interactionDomain: 'exploration',
    preview: { text: 'You can inspect the caravan before committing.' },
    playerResultBundle: {
      result: { text: 'Preview only.' },
      status: { state: 'preview_ready', label: 'Preview' },
    },
  });
  const mutating = createResolutionResponse({
    interactionDomain: 'exploration',
    responseKind: 'preview_response',
    preview: { text: 'Bad preview.' },
    outputBundle: {
      knowledgeOutputs: [{ knowledgeId: 'clue_caravan_irregularity' }],
    },
    mutationPlan: {
      writeGroups: [{ group: 'knowledge_writes', operations: [{ knowledge_id: 'clue_caravan_irregularity' }] }],
    },
    transitionDecision: { kind: TRANSITION_DECISION_KINDS.SCENE_TRANSITION, targetType: 'scene' },
    nextBeatDecision: { kind: 'open_exploration_action_window' },
    readModelRefreshHook: { targets: ['scene'] },
  });

  assert.doesNotThrow(() => assertPreviewResponseNonMutating(preview));
  assert.throws(() => assertPreviewResponseNonMutating(mutating), /Preview response is mutating/);
});

test('6C.2 preview/commit alignment markers validate commit against preview and current state', () => {
  const previewRequest = dialoguePreviewRequest();
  const markers = createPreviewAlignmentMarkers({
    request: previewRequest,
    contentVersion: 'tomas-content-v1',
    availabilitySnapshotId: 'available-v1',
  });
  const validCommit = validateCommitAgainstPreviewContext({
    commitRequest: createCommitResolutionRequest({
      ...previewRequest,
      requestKind: 'commit',
      idempotencyKey: 'commit-1',
    }),
    previewAlignmentMarkers: markers,
    currentAlignmentMarkers: markers,
  });
  const staleCommit = validateCommitAgainstPreviewContext({
    commitRequest: createCommitResolutionRequest({
      ...previewRequest,
      requestKind: 'commit',
      selected_option_id: 'move_reassure_tomas',
      idempotencyKey: 'commit-2',
    }),
    previewAlignmentMarkers: markers,
    currentAlignmentMarkers: {
      ...markers,
      context_version: 'dialogue-v2',
    },
  });
  const player = projectResolutionResponseForPlayer(staleCommit.response);

  assert.equal(validCommit.valid, true);
  assert.equal(validCommit.status, PREVIEW_ALIGNMENT_STATUSES.ALIGNED);
  assert.equal(staleCommit.valid, false);
  assert.equal(staleCommit.mismatches.some((entry) => entry.field === 'selected_option_id'), true);
  assert.equal(staleCommit.mismatches.some((entry) => entry.field === 'current.context_version'), true);
  assert.match(player.recovery.player_safe_message, /preview is no longer current/i);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.2 semantic expectation mapping aligns preview markers with resolution output markers without exact prose', () => {
  const clueExpectation = createPreviewExpectationMarker({
    kind: PREVIEW_EXPECTATION_KINDS.DISCOVERY,
    sourceOptionId: 'inspect-broken-caravan',
    possibleOutcomeKinds: [RESOLUTION_OUTCOME_MARKER_KINDS.KNOWLEDGE],
    playerSummary: 'This may reveal what is wrong with the caravan.',
  });
  const routeExpectation = createPreviewExpectationMarker({
    kind: PREVIEW_EXPECTATION_KINDS.TRANSITION,
    sourceOptionId: 'follow-the-old-path',
    possibleOutcomeKinds: [RESOLUTION_OUTCOME_MARKER_KINDS.TRANSITION],
    uncertainty: 'depends_on_current_state',
    playerSummary: 'This may move you closer to the shrine.',
  });
  const clueOutcome = createResolutionOutcomeMarker({
    kind: RESOLUTION_OUTCOME_MARKER_KINDS.KNOWLEDGE,
    outputId: 'clue_caravan_irregularity',
    sourceOptionId: 'inspect-broken-caravan',
  });
  const routeOutcome = createResolutionOutcomeMarker({
    kind: RESOLUTION_OUTCOME_MARKER_KINDS.TRANSITION,
    outputId: 'old-forest-path',
    sourceOptionId: 'follow-the-old-path',
  });
  const aligned = comparePreviewExpectationsToResolution({
    previewExpectations: [clueExpectation, routeExpectation],
    resolutionMarkers: [clueOutcome, routeOutcome],
  });
  const mismatched = comparePreviewExpectationsToResolution({
    previewExpectations: [
      createPreviewExpectationMarker({
        kind: PREVIEW_EXPECTATION_KINDS.SOCIAL_CONSEQUENCE,
        uncertainty: 'deterministic',
      }),
    ],
    resolutionMarkers: [clueOutcome],
  });

  assert.equal(aligned.aligned, true);
  assert.equal(aligned.status, PREVIEW_ALIGNMENT_STATUSES.ALIGNED);
  assert.equal(aligned.matched_expectations.length, 2);
  assert.equal(mismatched.aligned, false);
  assert.equal(mismatched.status, PREVIEW_ALIGNMENT_STATUSES.MISMATCHED);
});

test('6C.2 unavailable or locked preview returns safe player response and GM/dev diagnostics', () => {
  const result = validatePreviewRequestConsistency({
    request: explorationPreviewRequest({
      selectedOptionId: 'follow-the-tracks-to-the-shrine',
    }),
    activeState: {
      interactionDomain: 'exploration',
      actionWindowId: 'window-1',
      currentSceneId: 'broken-caravan-site',
      contextVersion: 'window-v1',
      actionWindowState: 'open',
    },
    option: {
      optionId: 'follow-the-tracks-to-the-shrine',
      availability: {
        status: 'locked',
        available: false,
        playerReason: 'That path is not clear yet.',
        requirements: [{ id: 'hidden_requirements:shrine_path_known', status: 'locked' }],
      },
    },
  });
  const player = projectResolutionResponseForPlayer(result.response);
  const gmDev = projectResolutionResponseForGmDev(result.response);
  const playerText = JSON.stringify(player);

  assert.equal(result.valid, false);
  assert.equal(result.status, PREVIEW_ALIGNMENT_STATUSES.UNAVAILABLE);
  assert.equal(player.player_result_bundle.recovery.message, 'That path is not clear yet.');
  assert.equal(playerText.includes('hidden_requirements'), false);
  assert.equal(gmDev.gm_dev_trace.validation_result.availability_status, 'locked');
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.2 duplicate previews are stable and non-mutating while duplicate commits use stale diagnostics shape', () => {
  const request = explorationPreviewRequest();
  const first = createPreviewAlignmentMarkers({ request });
  const second = createPreviewAlignmentMarkers({ request });
  const firstPreview = createPreviewResolutionResponse({
    interactionDomain: 'exploration',
    preview: {
      text: 'Inspecting the wreck may reveal a useful clue.',
      alignmentMarkers: first,
      expectationMarkers: [
        createPreviewExpectationMarker({
          kind: PREVIEW_EXPECTATION_KINDS.DISCOVERY,
          possibleOutcomeKinds: [RESOLUTION_OUTCOME_MARKER_KINDS.KNOWLEDGE],
          gmDevDetails: { possible_branch_ids: ['success', 'partial'] },
        }),
      ],
    },
  });
  const secondPreview = createPreviewResolutionResponse({
    interactionDomain: 'exploration',
    preview: {
      text: 'Inspecting the wreck may reveal a useful clue.',
      alignmentMarkers: second,
    },
  });

  assert.deepEqual(first, second);
  assert.doesNotThrow(() => assertPreviewResponseNonMutating(firstPreview));
  assert.doesNotThrow(() => assertPreviewResponseNonMutating(secondPreview));
  assert.equal(JSON.stringify(projectResolutionResponseForPlayer(firstPreview)).includes('possible_branch_ids'), false);
});

test('6C.2 GM/dev diagnostics explain preview/result alignment while player projection omits diagnostics', () => {
  const request = dialoguePreviewRequest({
    selectedOptionId: 'move_push_rusk_to_name_source',
    sourceDialogueId: 'greyvale_rusk_at_the_shrine_dialogue',
  });
  const markers = createPreviewAlignmentMarkers({
    request,
    contentVersion: 'rusk-content-v1',
  });
  const expectations = [
    createPreviewExpectationMarker({
      kind: PREVIEW_EXPECTATION_KINDS.ENDPOINT,
      sourceOptionId: 'move_push_rusk_to_name_source',
      possibleOutcomeKinds: [RESOLUTION_OUTCOME_MARKER_KINDS.ENDPOINT, RESOLUTION_OUTCOME_MARKER_KINDS.TRANSITION],
      playerSummary: 'This may escalate the confrontation.',
      gmDevDetails: { possible_handoff: 'combat_pending', branch_id: 'hard_success' },
    }),
  ];
  const outcomes = [
    createResolutionOutcomeMarker({
      kind: RESOLUTION_OUTCOME_MARKER_KINDS.ENDPOINT,
      sourceOptionId: 'move_push_rusk_to_name_source',
      selectedOutcomeId: 'hard_success',
      gmDevDetails: { combatRouting: 'encounter:rusk' },
    }),
  ];
  const alignment = comparePreviewExpectationsToResolution({
    previewExpectations: expectations,
    resolutionMarkers: outcomes,
  });
  const trace = createPreviewConsistencyTrace({
    traceId: 'trace-rusk-preview',
    request,
    previewConsistency: alignment,
    previewExpectationMarkers: expectations,
    resolutionOutcomeMarkers: outcomes,
    transitionDecision: {
      kind: 'future_supported',
      targetType: 'combat_pending',
      targetId: 'encounter:rusk',
      gmDevRouting: { combatRouting: 'encounter:rusk' },
    },
    playerResultBundle: {
      result: { text: 'The confrontation reaches the edge of the playable slice.' },
      status: { state: 'awaiting_support', label: 'Awaiting support', isEndpoint: true },
    },
  });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'dialogue',
    gmDevTrace: trace,
    playerResultBundle: trace.player_result_bundle,
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const playerText = JSON.stringify(player);

  assert.equal(alignment.aligned, true);
  assert.equal(gmDev.gm_dev_trace.validation_result.preview_consistency.status, PREVIEW_ALIGNMENT_STATUSES.ALIGNED);
  assert.equal(gmDev.gm_dev_trace.transition_decision.target_type, 'combat_pending');
  assert.equal(playerText.includes('combat_pending'), false);
  assert.equal(playerText.includes('branch_id'), false);
  assert.equal(playerText.includes('gm_dev_trace'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});
