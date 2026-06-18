import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AVAILABILITY_STATUSES,
  COMMIT_STATES,
  INTERACTION_LIFECYCLE_STATUSES,
  INTERACTION_OPTION_KINDS,
  INTERACTION_RESOLUTION_STATUSES,
  RECOVERY_ACTIONS,
  SAFE_INTERACTION_ERROR_CODES,
  createEmptyOutputBundle,
  createInteractionOption,
  createLifecycleDiagnostics,
  createLifecycleSafeError,
  projectLifecyclePayloadForPlayer,
  projectSafeInteractionErrorForPlayer,
  buildInteractionPreviewLifecycleResult,
  buildInteractionResolutionLifecycleResult,
  buildInteractionSubmitAccepted,
  buildInteractionSubmitRejected,
  assertPreviewHasNoCommittedEffects,
  attachLifecycleDebug,
  attachNextState,
  attachOutputBundle,
  markResolutionStatus,
  normalizeCommitState,
  normalizeIdempotencyKey,
  normalizeInteractionLifecycleStatus,
  normalizeInteractionResolutionStatus,
  validateCommittedAction,
  validateCurrentInteractionContext,
  validateInteractionAvailability,
  validateInteractionSubmit,
  validateNonCommittingInquiry,
  validatePreviewContextFreshness,
} from '../src/services/interactionCore/index.js';

function explorationContext(overrides = {}) {
  return {
    interaction_domain: 'exploration',
    campaign_id: 'campaign-1',
    adventure_id: 'adventure-1',
    character_id: 'character-1',
    current_scene_id: 'grey-road-inn',
    action_window_id: 'window-1',
    interaction_state_version: 'scene-v1',
    ...overrides,
  };
}

function dialogueContext(overrides = {}) {
  return {
    interaction_domain: 'dialogue',
    campaign_id: 'campaign-1',
    character_id: 'character-1',
    active_dialogue_id: 'dialogue:tomas',
    turn_id: 'turn-1',
    interaction_state_version: 'dialogue-v1',
    ...overrides,
  };
}

function nonCommittingOption(domain = 'exploration', overrides = {}) {
  return createInteractionOption({
    interactionDomain: domain,
    optionKind: INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY,
    domainKind: domain === 'dialogue' ? 'clarifying_question' : 'free_focus',
    label: domain === 'dialogue' ? 'Ask a Clarifying Question' : 'Open a Closer Look',
    ...overrides,
  });
}

function committedOption(domain = 'exploration', overrides = {}) {
  return createInteractionOption({
    interactionDomain: domain,
    optionKind: INTERACTION_OPTION_KINDS.COMMITTED_ACTION,
    domainKind: domain === 'dialogue' ? 'committed_social_move' : 'beat_action',
    label: domain === 'dialogue' ? 'Make a Committed Social Move' : 'Submit a Beat Action',
    ...overrides,
  });
}

test('6B.14.2 lifecycle statuses normalize without implementing runtime behavior', () => {
  assert.equal(normalizeInteractionLifecycleStatus('previewed'), 'previewed');
  assert.equal(normalizeInteractionLifecycleStatus('bogus'), 'not_started');
  assert.equal(normalizeCommitState('commit_pending'), 'commit_pending');
  assert.equal(normalizeCommitState('bogus'), 'commit_available');
  assert.equal(normalizeInteractionResolutionStatus('transitioned'), 'transitioned');
  assert.equal(normalizeInteractionResolutionStatus('bogus'), 'resolved');

  assert.equal(INTERACTION_LIFECYCLE_STATUSES.FUTURE_SUPPORTED, 'future_supported');
  assert.equal(COMMIT_STATES.NO_COMMIT, 'no_commit');
  assert.equal(INTERACTION_RESOLUTION_STATUSES.EXITED, 'exited');
});

test('6B.14.2 current-context validation accepts valid exploration and dialogue contexts', () => {
  const exploration = validateCurrentInteractionContext({
    requestedContext: explorationContext(),
    currentContext: explorationContext(),
    expectedDomain: 'surface_focus_commit',
  });
  assert.equal(exploration.valid, true);
  assert.equal(exploration.checks.some((entry) => entry.field === 'action_window_id'), true);
  assert.equal(exploration.diagnostics.player_safe, false);

  const dialogue = validateCurrentInteractionContext({
    requestedContext: dialogueContext(),
    currentContext: dialogueContext(),
    expectedDomain: 'dialogue_focus_commit',
  });
  assert.equal(dialogue.valid, true);
  assert.equal(dialogue.checks.some((entry) => entry.field === 'active_dialogue_id'), true);
});

test('6B.14.2 current-context validation catches wrong domain, character, scene/dialogue, and stale version', () => {
  const wrongDomain = validateCurrentInteractionContext({
    requestedContext: dialogueContext(),
    currentContext: explorationContext(),
    expectedDomain: 'exploration',
  });
  assert.equal(wrongDomain.valid, false);
  assert.equal(wrongDomain.code, SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION);
  assert.equal(wrongDomain.error.internal_cause.failed_context_checks[0].field, 'interaction_domain');

  const wrongCharacter = validateCurrentInteractionContext({
    requestedContext: explorationContext({ character_id: 'character-old' }),
    currentContext: explorationContext({ character_id: 'character-current' }),
  });
  assert.equal(wrongCharacter.valid, false);
  assert.equal(wrongCharacter.code, SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION);

  const wrongDialogue = validateCurrentInteractionContext({
    requestedContext: dialogueContext({ active_dialogue_id: 'dialogue:elin' }),
    currentContext: dialogueContext({ active_dialogue_id: 'dialogue:tomas' }),
  });
  assert.equal(wrongDialogue.valid, false);
  assert.equal(
    wrongDialogue.error.internal_cause.failed_context_checks.some(
      (entry) => entry.field === 'active_dialogue_id'
    ),
    true
  );

  const staleVersion = validatePreviewContextFreshness({
    requestedContext: explorationContext({ interaction_state_version: 'scene-v1' }),
    currentContext: explorationContext({ interaction_state_version: 'scene-v2' }),
  });
  assert.equal(staleVersion.valid, false);
  assert.equal(staleVersion.error.player_safe_message.includes('moment has changed'), true);
});

test('6B.14.2 ended interactions are rejected unless explicitly allowed', () => {
  const ended = validateCurrentInteractionContext({
    requestedContext: dialogueContext(),
    currentContext: dialogueContext(),
    currentStatus: 'completed',
  });
  assert.equal(ended.valid, false);
  assert.equal(ended.code, SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED);

  const archiveRead = validateCurrentInteractionContext({
    requestedContext: dialogueContext(),
    currentContext: dialogueContext(),
    currentStatus: 'completed',
    allowEnded: true,
  });
  assert.equal(archiveRead.valid, true);
});

test('6B.14.2 availability validation keeps failed requirements GM/dev only', () => {
  const locked = validateInteractionAvailability({
    option: committedOption('dialogue'),
    availability: {
      status: AVAILABILITY_STATUSES.LOCKED,
      playerReason: 'You need a better opening.',
      gmDevReason: 'trust < 2',
      requirements: [{ id: 'trust_gate', status: 'locked', gm_dev_reason: 'trust < 2' }],
    },
  });

  assert.equal(locked.valid, false);
  assert.equal(locked.status, 'locked');
  assert.equal(locked.player_message, 'You need a better opening.');
  assert.equal(locked.failed_requirements[0].id, 'trust_gate');

  const playerProjection = projectLifecyclePayloadForPlayer(locked);
  assert.equal(JSON.stringify(playerProjection).includes('trust < 2'), false);
  assert.equal(JSON.stringify(locked.diagnostics).includes('trust_gate'), true);

  const futureSupported = validateInteractionAvailability({
    option: committedOption('dialogue'),
    availability: { status: AVAILABILITY_STATUSES.FUTURE_SUPPORTED },
  });
  assert.equal(futureSupported.code ?? futureSupported.error.code, SAFE_INTERACTION_ERROR_CODES.TRANSITION_UNAVAILABLE);
});

test('6B.14.2 non-committing inquiries cover Free Focus and Clarifying Question semantics', () => {
  const freeFocus = validateNonCommittingInquiry({
    option: nonCommittingOption('exploration'),
  });
  assert.equal(freeFocus.valid, true);
  assert.equal(freeFocus.consumes_commit_slot, false);
  assert.equal(freeFocus.inquiry_state, 'available');

  const clarifyingQuestion = validateNonCommittingInquiry({
    option: nonCommittingOption('dialogue'),
    priorResult: { text: 'Tomas has already answered this.' },
  });
  assert.equal(clarifyingQuestion.valid, true);
  assert.equal(clarifyingQuestion.status, 'already_resolved');
  assert.deepEqual(clarifyingQuestion.prior_result, { text: 'Tomas has already answered this.' });

  const brokenInquiry = validateNonCommittingInquiry({
    option: nonCommittingOption('dialogue', { consumesCommitSlot: true }),
  });
  assert.equal(brokenInquiry.valid, false);
  assert.equal(brokenInquiry.code, SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED);
  assert.equal(JSON.stringify(brokenInquiry.diagnostics).includes('commit'), true);
});

test('6B.14.2 committed action validation covers beat actions and social moves', () => {
  const beatAction = validateCommittedAction({
    option: committedOption('exploration'),
    commitState: COMMIT_STATES.COMMIT_AVAILABLE,
    requestedContext: explorationContext(),
    currentContext: explorationContext(),
  });
  assert.equal(beatAction.valid, true);
  assert.equal(beatAction.consumes_commit_slot, true);

  const socialMove = validateCommittedAction({
    option: committedOption('dialogue'),
    requestedContext: dialogueContext(),
    currentContext: dialogueContext(),
  });
  assert.equal(socialMove.valid, true);

  const pending = validateCommittedAction({
    option: committedOption('exploration'),
    commitState: COMMIT_STATES.COMMIT_PENDING,
  });
  assert.equal(pending.valid, false);
  assert.equal(pending.code, SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING);

  const ended = validateCommittedAction({
    option: committedOption('dialogue'),
    interactionStatus: INTERACTION_LIFECYCLE_STATUSES.ENDED,
  });
  assert.equal(ended.valid, false);
  assert.equal(ended.code, SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED);

  const staleWindow = validateCommittedAction({
    option: committedOption('exploration'),
    requestedContext: explorationContext({ action_window_id: 'old-window' }),
    currentContext: explorationContext({ action_window_id: 'new-window' }),
  });
  assert.equal(staleWindow.valid, false);
  assert.equal(staleWindow.code, SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION);
});

test('6B.14.2 preview helpers build non-committing preview results and detect committed effects', () => {
  const preview = buildInteractionPreviewLifecycleResult({
    interactionDomain: 'dialogue',
    context: dialogueContext(),
    option: committedOption('dialogue', { optionId: 'move:ask' }),
    playerPreview: 'This spends the conversation beat if submitted.',
    checkSummary: { label: 'Persuasion check', dc_visible: false },
  });

  assert.equal(preview.interaction_domain, 'dialogue');
  assert.equal(preview.consumes_commit_slot, false);
  assert.equal(preview.player_preview, 'This spends the conversation beat if submitted.');
  assert.equal(preview.debug_envelope.player_safe, false);
  assert.equal(assertPreviewHasNoCommittedEffects(preview).valid, true);

  const invalidPreview = assertPreviewHasNoCommittedEffects({
    consumes_commit_slot: true,
    committed_action_id: 'action-1',
    output_bundle: createEmptyOutputBundle({
      knowledgeOutputs: [{ knowledge_id: 'greyvale.pattern_of_attacks' }],
    }),
  });
  assert.equal(invalidPreview.valid, false);
  assert.deepEqual(
    invalidPreview.violations.sort(),
    [
      'preview_contains_output_bundle_effects',
      'preview_created_committed_identifier',
      'preview_consumes_commit_slot',
    ].sort()
  );
});

test('6B.14.2 submit helpers accept current submissions and reject stale, duplicate, unavailable, and ended submissions', () => {
  assert.equal(normalizeIdempotencyKey('  key-1  '), 'key-1');

  const accepted = validateInteractionSubmit({
    option: committedOption('exploration'),
    requestedContext: explorationContext(),
    currentContext: explorationContext(),
    idempotencyKey: 'submit-1',
    seenIdempotencyKeys: [],
  });
  assert.equal(accepted.valid, true);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.duplicate, false);

  const acceptedResult = buildInteractionSubmitAccepted({
    interactionDomain: 'exploration',
    committedActionId: 'action-1',
    playerMessage: 'Your action is recorded.',
  });
  assert.equal(acceptedResult.committed_action_id, 'action-1');
  assert.equal(acceptedResult.player_message, 'Your action is recorded.');

  const duplicate = validateInteractionSubmit({
    option: committedOption('exploration'),
    idempotencyKey: 'submit-1',
    seenIdempotencyKeys: ['submit-1'],
  });
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.code, SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING);

  const replay = validateInteractionSubmit({
    option: committedOption('exploration'),
    idempotencyKey: 'submit-1',
    seenIdempotencyKeys: new Set(['submit-1']),
    allowIdempotentReplay: true,
  });
  assert.equal(replay.valid, true);
  assert.equal(replay.status, 'idempotent_replay');

  const unavailable = validateInteractionSubmit({
    option: committedOption('dialogue', {
      availability: { status: AVAILABILITY_STATUSES.EXHAUSTED },
    }),
  });
  assert.equal(unavailable.valid, false);
  assert.equal(unavailable.error.code, SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE);

  const rejectedResult = buildInteractionSubmitRejected({
    interactionDomain: 'dialogue',
    code: SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED,
  });
  assert.equal(rejectedResult.status, 'rejected');
  assert.equal(rejectedResult.player_message.includes('conversation has ended'), true);
});

test('6B.14.2 resolution helpers carry output bundle, next state, future support, and internal debug', () => {
  const outputBundle = createEmptyOutputBundle({
    playerResult: { text: 'Rusk reels back from the shrine sound.' },
    knowledgeOutputs: [{ knowledge_id: 'greyvale.bandit_instability' }],
    transitionOutputs: [{ status: 'future_supported', target_type: 'combat_pending' }],
  });

  const resolution = buildInteractionResolutionLifecycleResult({
    interactionDomain: 'dialogue',
    resolutionId: 'resolution:rusk',
    status: 'future_supported',
    playerResult: outputBundle.player_result,
    outputBundle,
    nextState: { interaction_domain: 'dialogue', status: 'ended' },
  });

  assert.equal(resolution.status, 'future_supported');
  assert.equal(resolution.output_bundle.knowledge_outputs[0].knowledge_id, 'greyvale.bandit_instability');
  assert.equal(resolution.debug_envelope.player_safe, false);

  const replacedOutput = attachOutputBundle(resolution, {
    historyOutputs: [{ event_id: 'history-1' }],
  });
  assert.equal(replacedOutput.output_bundle.history_outputs.length, 1);

  const nextState = attachNextState(resolution, { status: 'completed' });
  assert.equal(nextState.next_state.status, 'completed');

  const withDebug = attachLifecycleDebug(resolution, createLifecycleDiagnostics({ notes: ['kept internal'] }));
  assert.equal(withDebug.debug_envelope.player_safe, false);

  const exited = markResolutionStatus(resolution, INTERACTION_RESOLUTION_STATUSES.EXITED);
  assert.equal(exited.status, 'exited');
});

test('6B.14.2 safe lifecycle errors project player-safe fields only', () => {
  const error = createLifecycleSafeError(SAFE_INTERACTION_ERROR_CODES.STALE_PREVIEW, {
    gmDevMessage: 'preview version 1 != current version 2',
    internalCause: { preview_version: 1, current_version: 2 },
    recoveryAction: RECOVERY_ACTIONS.REFRESH_CURRENT_SCENE,
  });

  const player = projectSafeInteractionErrorForPlayer(error);
  assert.equal(player.code, SAFE_INTERACTION_ERROR_CODES.STALE_PREVIEW);
  assert.equal(player.recovery_action, RECOVERY_ACTIONS.REFRESH_CURRENT_SCENE);
  assert.equal(JSON.stringify(player).includes('preview_version'), false);
  assert.equal(JSON.stringify(player).includes('gmDevMessage'), false);
});

test('6B.14.2 GM/dev lifecycle diagnostics keep stale and requirement details internal', () => {
  const diagnostics = createLifecycleDiagnostics({
    requestedContext: dialogueContext({ interaction_state_version: 'old' }),
    currentContext: dialogueContext({ interaction_state_version: 'new' }),
    staleReason: 'interaction_state_version:context_mismatch',
    duplicateStatus: 'duplicate_rejected',
    failedRequirements: [{ id: 'respect_gate', gm_dev_reason: 'respect < 2' }],
    commitState: COMMIT_STATES.COMMIT_PENDING,
    safeErrorCode: SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION,
  });

  assert.equal(diagnostics.visibility_scope, 'gm_dev');
  assert.equal(diagnostics.player_safe, false);
  assert.equal(
    diagnostics.domain_debug.lifecycle_diagnostics.stale_reason,
    'interaction_state_version:context_mismatch'
  );
  assert.equal(
    diagnostics.domain_debug.lifecycle_diagnostics.failed_requirements[0].id,
    'respect_gate'
  );

  const playerProjection = projectLifecyclePayloadForPlayer({
    result_text: 'That moment has changed.',
    debug_envelope: diagnostics,
    diagnostics,
    error: createLifecycleSafeError(SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION, {
      internalCause: { hidden: true },
    }),
  });
  const text = JSON.stringify(playerProjection);
  assert.equal(text.includes('respect_gate'), false);
  assert.equal(text.includes('internal_cause'), false);
  assert.equal(text.includes('debug_envelope'), false);
});
