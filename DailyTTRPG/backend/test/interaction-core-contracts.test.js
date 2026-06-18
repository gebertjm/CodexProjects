import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AVAILABILITY_STATUSES,
  INTERACTION_OPTION_KINDS,
  RECOVERY_ACTIONS,
  SAFE_INTERACTION_ERROR_CODES,
  SHARED_INTERACTION_DOMAINS,
  TRANSITION_OUTPUT_STATUSES,
  TRANSITION_TARGET_TYPES,
  VISIBILITY_SCOPES,
  createAvailability,
  createDebugEnvelope,
  createEmptyOutputBundle,
  createExpectedDebugAssertion,
  createExpectedNextStateAssertion,
  createExpectedOutputAssertion,
  createExpectedVisibilityAssertion,
  createInteractionContext,
  createInteractionOption,
  createInteractionPathExpectation,
  createInteractionResolutionResult,
  createPreviewRequest,
  createPreviewResult,
  createSafeInteractionError,
  createSubmitRequest,
  createSubmitResult,
  createTransitionOutput,
  isCommittedInteractionOption,
  isDebugEnvelopePlayerSafe,
  isGmDevVisibilityScope,
  isNonCommittingInquiryOption,
  isPlayerVisibilityScope,
  isRecoveryAction,
  isSharedInteractionDomain,
  isTransitionStatus,
  isTransitionTargetType,
  mapDialogueKindToInteractionOptionKind,
  mapExplorationKindToInteractionOptionKind,
  normalizeRecoveryAction,
  normalizeSharedInteractionDomain,
} from '../src/services/interactionCore/index.js';

test('6B.14.1 InteractionDomain supports current domains and future placeholders', () => {
  assert.equal(SHARED_INTERACTION_DOMAINS.EXPLORATION, 'exploration');
  assert.equal(SHARED_INTERACTION_DOMAINS.DIALOGUE, 'dialogue');
  assert.equal(SHARED_INTERACTION_DOMAINS.NAVIGATION, 'navigation');
  assert.equal(SHARED_INTERACTION_DOMAINS.COMBAT, 'combat');

  assert.equal(normalizeSharedInteractionDomain('exploration'), 'exploration');
  assert.equal(normalizeSharedInteractionDomain('dialogue'), 'dialogue');
  assert.equal(normalizeSharedInteractionDomain('surface_focus_commit'), 'exploration');
  assert.equal(normalizeSharedInteractionDomain('dialogue_focus_commit'), 'dialogue');
  assert.equal(isSharedInteractionDomain('navigation'), true);
  assert.equal(isSharedInteractionDomain('combat'), true);
});

test('6B.14.1 VisibilityScope helpers distinguish player and internal scopes', () => {
  assert.equal(VISIBILITY_SCOPES.PLAYER, 'player');
  assert.equal(VISIBILITY_SCOPES.GM_DEV, 'gm_dev');
  assert.equal(VISIBILITY_SCOPES.TEST_HARNESS, 'test_harness');
  assert.equal(VISIBILITY_SCOPES.SYSTEM_INTERNAL, 'system_internal');

  assert.equal(isPlayerVisibilityScope('player'), true);
  assert.equal(isPlayerVisibilityScope('gm_dev'), false);
  assert.equal(isGmDevVisibilityScope('gm_dev'), true);
  assert.equal(isGmDevVisibilityScope('player'), false);
});

test('6B.14.1 InteractionContext stays flexible for exploration and dialogue', () => {
  const explorationContext = createInteractionContext({
    interactionDomain: 'surface_focus_commit',
    campaignId: 42,
    characterId: 'pc-1',
    currentSceneId: 'grey-road-inn',
    actionWindowId: 'window-1',
  });

  assert.equal(explorationContext.interaction_domain, 'exploration');
  assert.equal(explorationContext.campaign_id, '42');
  assert.equal(explorationContext.current_scene_id, 'grey-road-inn');
  assert.equal(explorationContext.active_dialogue_id, null);

  const dialogueContext = createInteractionContext({
    interactionDomain: 'dialogue_focus_commit',
    campaignId: 'campaign-1',
    characterId: 'pc-1',
    activeDialogueId: 'dialogue:tomas',
    turnId: 'turn-1',
    visibilityScope: 'gm_dev',
  });

  assert.equal(dialogueContext.interaction_domain, 'dialogue');
  assert.equal(dialogueContext.active_dialogue_id, 'dialogue:tomas');
  assert.equal(dialogueContext.turn_id, 'turn-1');
  assert.equal(dialogueContext.visibility_scope, 'gm_dev');
});

test('6B.14.1 domain option mapping preserves current product terms internally', () => {
  assert.equal(
    mapExplorationKindToInteractionOptionKind('free_focus'),
    INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY
  );
  assert.equal(
    mapExplorationKindToInteractionOptionKind('beat_action'),
    INTERACTION_OPTION_KINDS.COMMITTED_ACTION
  );
  assert.equal(
    mapDialogueKindToInteractionOptionKind('clarifying_question'),
    INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY
  );
  assert.equal(
    mapDialogueKindToInteractionOptionKind('committed_social_move'),
    INTERACTION_OPTION_KINDS.COMMITTED_ACTION
  );
  assert.equal(mapDialogueKindToInteractionOptionKind('dialogue_exit'), 'exit_or_transition');
});

test('6B.14.1 InteractionOption defaults commit-slot semantics safely', () => {
  const freeFocus = createInteractionOption({
    interactionDomain: 'exploration',
    optionKind: 'non_committing_inquiry',
    domainKind: 'free_focus',
    label: 'Look closer at the hearth',
  });

  assert.equal(freeFocus.consumes_commit_slot, false);
  assert.equal(isNonCommittingInquiryOption(freeFocus), true);

  const committedSocialMove = createInteractionOption({
    interactionDomain: 'dialogue',
    optionKind: 'committed_action',
    domainKind: 'committed_social_move',
    label: 'Ask Tomas what he knows',
    checkMetadata: {
      mode: 'standard',
      ability: 'charisma',
      skill: 'persuasion',
      dc: 13,
      dcVisibility: 'hidden',
    },
  });

  assert.equal(committedSocialMove.consumes_commit_slot, true);
  assert.equal(isCommittedInteractionOption(committedSocialMove), true);
  assert.equal(committedSocialMove.check_metadata.dc, 13);
  assert.equal(committedSocialMove.check_metadata.dc_visibility, 'hidden');
});

test('6B.14.1 availability and preview/submit contracts normalize current context', () => {
  const availability = createAvailability({
    status: AVAILABILITY_STATUSES.LOCKED,
    playerReason: 'You need a better opening.',
    gmDevReason: 'trust < 2',
  });

  assert.equal(availability.available, false);
  assert.equal(availability.status, 'locked');
  assert.equal(availability.player_reason, 'You need a better opening.');
  assert.equal(availability.gm_dev_reason, 'trust < 2');

  const previewRequest = createPreviewRequest({
    context: { interactionDomain: 'dialogue', activeDialogueId: 'dialogue:elin' },
    optionId: 'move:gentle-question',
    previewId: 'preview-1',
  });
  const previewResult = createPreviewResult({
    context: previewRequest.context,
    matchedOptionId: previewRequest.option_id,
    playerPreview: 'This spends the conversation beat.',
    consumesCommitSlot: true,
  });
  const submitRequest = createSubmitRequest({
    context: previewRequest.context,
    optionId: previewRequest.option_id,
    previewId: previewRequest.preview_id,
    idempotencyKey: 'same-click',
  });
  const submitResult = createSubmitResult({
    interactionDomain: 'dialogue',
    status: 'accepted',
    committedMoveId: 'move-run-1',
    playerMessage: 'Elin answers carefully.',
  });

  assert.equal(previewResult.interaction_domain, 'dialogue');
  assert.equal(previewResult.consumes_commit_slot, true);
  assert.equal(submitRequest.idempotency_key, 'same-click');
  assert.equal(submitResult.committed_move_id, 'move-run-1');
});

test('6B.14.1 output bundles and resolution results cover dialogue and future optional outputs', () => {
  const outputBundle = createEmptyOutputBundle({
    playerResult: { text: 'Tomas lowers his voice.' },
    knowledgeOutputs: [{ knowledge_id: 'greyvale.pattern_of_attacks' }],
    completedRecordOutputs: [{ record_id: 'completed:tomas' }],
    conditionOutputs: [{ condition_id: 'future-combat-slot' }],
  });

  assert.deepEqual(outputBundle.player_result, { text: 'Tomas lowers his voice.' });
  assert.equal(outputBundle.knowledge_outputs.length, 1);
  assert.equal(outputBundle.completed_record_outputs.length, 1);
  assert.equal(outputBundle.condition_outputs.length, 1);
  assert.deepEqual(outputBundle.damage_outputs, []);

  const resolution = createInteractionResolutionResult({
    interactionDomain: 'dialogue',
    resolutionId: 'resolution-1',
    status: 'resolved',
    playerResult: outputBundle.player_result,
    outputBundle,
    nextState: { kind: 'dialogue_continues' },
  });

  assert.equal(resolution.interaction_domain, 'dialogue');
  assert.equal(resolution.output_bundle.knowledge_outputs[0].knowledge_id, 'greyvale.pattern_of_attacks');
});

test('6B.14.1 transition output models live and future-supported handoffs without implementing them', () => {
  assert.equal(TRANSITION_OUTPUT_STATUSES.LIVE, 'live');
  assert.equal(TRANSITION_OUTPUT_STATUSES.PENDING, 'pending');
  assert.equal(isTransitionStatus('future_supported'), true);
  assert.equal(isTransitionTargetType('navigation'), true);

  const liveTransition = createTransitionOutput({
    interactionDomain: 'exploration',
    status: 'live',
    targetType: TRANSITION_TARGET_TYPES.SCENE,
    targetId: 'scene:dunmere',
    playerLabel: 'Return to Dunmere',
  });
  const futureSupported = createTransitionOutput({
    interactionDomain: 'dialogue',
    status: 'future_supported',
    targetType: TRANSITION_TARGET_TYPES.COMBAT_PENDING,
    playerLabel: 'Brace for violence',
    futureSupportedReason: 'Combat handoff is represented as pending state in 6B.13.',
    gmDevRouting: { encounter_id: 'rusk-shrine-confrontation' },
  });

  assert.equal(liveTransition.status, 'live');
  assert.equal(liveTransition.target_id, 'scene:dunmere');
  assert.equal(futureSupported.status, 'future_supported');
  assert.equal(futureSupported.target_type, 'combat_pending');
  assert.equal(futureSupported.future_supported_reason.includes('Combat handoff'), true);
});

test('6B.14.1 debug envelope is GM/dev/internal and not player safe by default', () => {
  const debugEnvelope = createDebugEnvelope({
    interactionDomain: 'dialogue',
    sourceContentId: 'greyvale-tomas-road-dialogue',
    checks: [{ dc: 13, dc_visibility: 'hidden' }],
    selectedBranch: { branch_id: 'success' },
  });

  assert.equal(debugEnvelope.visibility_scope, 'gm_dev');
  assert.equal(debugEnvelope.player_safe, false);
  assert.equal(isDebugEnvelopePlayerSafe(debugEnvelope), false);
  assert.equal(debugEnvelope.checks[0].dc, 13);
});

test('6B.14.1 safe interaction errors expose player-safe messages and recovery actions', () => {
  assert.equal(isRecoveryAction('refresh_current_scene'), true);
  assert.equal(isRecoveryAction('dev_only'), true);
  assert.equal(normalizeRecoveryAction('not-real'), RECOVERY_ACTIONS.REFRESH_CURRENT_SCENE);

  const staleError = createSafeInteractionError({
    code: SAFE_INTERACTION_ERROR_CODES.STALE_PREVIEW,
    gmDevMessage: 'preview version 2 != state version 3',
    internalCause: { preview_version: 2, state_version: 3 },
  });

  assert.equal(staleError.code, 'STALE_PREVIEW');
  assert.equal(staleError.recovery_action, 'refresh_current_scene');
  assert.equal(staleError.player_safe_message.includes('preview'), true);
  assert.equal(staleError.gm_dev_message.includes('version'), true);
  assert.equal(staleError.internal_cause.state_version, 3);
});

test('6B.14.1 path expectation primitives represent exploration and dialogue examples', () => {
  const path = createInteractionPathExpectation({
    id: 'tomas-happy-path',
    interactionDomain: 'dialogue_focus_commit',
    description: 'Ask Tomas for the road pattern.',
    steps: [
      { kind: 'load_context', expected: { active_dialogue_id: 'dialogue:tomas' } },
      {
        kind: 'run_non_committing_inquiry',
        optionKind: 'non_committing_inquiry',
        optionId: 'cq:road-pattern',
      },
      {
        kind: 'preview_committed_action',
        optionKind: 'committed_action',
        optionId: 'move:ask-without-accusing',
      },
    ],
    expectedOutputs: [
      createExpectedOutputAssertion({
        outputKind: 'knowledge',
        outputId: 'greyvale.pattern_of_attacks',
      }),
    ],
    expectedVisibility: [
      createExpectedVisibilityAssertion({
        surface: 'dialogue_result',
        forbiddenTerms: ['hidden_dc', 'branch_id'],
      }),
    ],
    expectedNextState: createExpectedNextStateAssertion({
      interactionDomain: 'exploration',
      expectedOptionKind: 'committed_action',
    }),
    expectedDebug: [
      createExpectedDebugAssertion({
        requiredSections: ['checks', 'output_provenance'],
      }),
    ],
  });

  assert.equal(path.interaction_domain, 'dialogue');
  assert.equal(path.steps.length, 3);
  assert.equal(path.expected_outputs[0].output_id, 'greyvale.pattern_of_attacks');
  assert.equal(path.expected_visibility[0].scope, 'player');
  assert.equal(path.expected_next_state.interaction_domain, 'exploration');
  assert.deepEqual(path.expected_debug[0].required_sections, ['checks', 'output_provenance']);
});
