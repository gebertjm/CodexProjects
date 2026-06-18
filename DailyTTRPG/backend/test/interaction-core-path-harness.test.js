import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRANSITION_TARGET_TYPES,
  createDialogueOutputBundle,
  createExplorationOutputBundle,
} from '../src/services/interactionCore/index.js';
import {
  assertActionWindowOpen,
  assertArchiveSearchEntry,
  assertArchiveSearchState,
  assertCombatPendingPlayerHidden,
  assertCompletedRecord,
  assertCurrentScene,
  assertDialogueActive,
  assertDialogueExited,
  assertDuplicateSubmitHandled,
  assertEndedInteractionRejected,
  assertForcedCheckApplied,
  assertFutureSupportedHiddenFromPlayer,
  assertGmDevOutputProvenance,
  assertGmDevPayloadIncludesChecks,
  assertGmDevPayloadIncludesDebug,
  assertGmDevPayloadIncludesStateWrites,
  assertHistoryOutput,
  assertHistoryState,
  assertInquiryDidNotConsumeCommitSlot,
  assertInquiryDidNotWriteCommittedAction,
  assertInquiryGmDevDebugAvailable,
  assertInquiryOutputBundle,
  assertInquiryResultPlayerSafe,
  assertKnowledgeOutput,
  assertKnowledgeState,
  assertLatestDevelopment,
  assertLifecycleDiagnostic,
  assertNextActionWindowReady,
  assertNoHiddenDataLeak,
  assertObjectiveOutput,
  assertObjectiveState,
  assertOutputNotDuplicated,
  assertPlayerOutputBundleSafe,
  assertPlayerPayloadSafe,
  assertPreviewDidNotCommit,
  assertPreviewGmDevDebugAvailable,
  assertPreviewPlayerSafe,
  assertPreviewShowsAvailability,
  assertRelationshipOrSocialWrite,
  assertResolutionGmDevDebugAvailable,
  assertResolutionNextState,
  assertResolutionOutputBundle,
  assertResolutionPlayerSafe,
  assertSafeRecoveryMessage,
  assertSceneTransitionedTo,
  assertStalePreviewRejected,
  assertStaleSubmitRejected,
  assertStateWrite,
  assertSubmitCommittedExactlyOnce,
  assertTranscriptOutput,
  assertTransitionOutput,
  assertUnauthorizedCannotAccessGmDev,
  assertUnavailableActionRejected,
  assertWrongCampaignRejected,
  assertWrongCharacterRejected,
  buildDialogueInteractionContext,
  buildExplorationInteractionContext,
  createInteractionTestCampaign,
  createInteractionTestCharacter,
  enterDialogueScene,
  enterExplorationScene,
  getCurrentGmDevReadModel,
  getCurrentPlayerReadModel,
  loadGreyvaleRegressionContent,
  loadInteractionTestContent,
  normalizeExpectedPathStepsForSharedAssertions,
  previewCommittedInteraction,
  readDialogueExpectedPath,
  requireContentId,
  requireDialogueId,
  requireExpectedPath,
  requireNpcId,
  requireSceneId,
  restoreCheckBehavior,
  runNonCommittingInquiry,
  setActiveInteractionCharacter,
  submitAndResolveCommittedInteraction,
  submitCommittedInteraction,
  withForcedCheckFailure,
  withForcedCheckSuccess,
  withForcedResultBand,
} from './interaction-core/sharedPathHarness.js';

test('6B.14.5 shared content helpers load Greyvale fixtures while expected path files remain dialogue-specific', () => {
  const content = loadInteractionTestContent();
  const greyvale = loadGreyvaleRegressionContent();

  assert.equal(content.dialogue_scenes.length, 6);
  assert.equal(content.dialogue_expected_paths.length, 6);
  assert.equal(greyvale.greyvale_world_package_root.endsWith('content\\worlds\\greyvale') || greyvale.greyvale_world_package_root.endsWith('content/worlds/greyvale'), true);

  const tomas = requireDialogueId(content, 'greyvale_tomas_roadside_worries_dialogue');
  const garren = requireSceneId(content, 'greyvale_garren_path_knowledge_dialogue');
  const ruskNpc = requireNpcId(content, 'rusk-bandit');
  const tomasPath = requireExpectedPath(content, 'greyvale_tomas_roadside_worries_dialogue', 'happy_path');
  const ruskPath = requireExpectedPath(content, 'greyvale_rusk_at_the_shrine_dialogue', 'combat_transition_path');
  const explicitRuskSteps = normalizeExpectedPathStepsForSharedAssertions(ruskPath.expected_path);
  const dialoguePath = readDialogueExpectedPath(tomasPath.fixture.content, 'happy_path');

  assert.equal(tomas.content.title.includes('Tomas'), true);
  assert.equal(garren.content.id, 'greyvale_garren_path_knowledge_dialogue');
  assert.equal(ruskNpc.content.title.includes('Rusk'), true);
  assert.equal(dialoguePath.expected_final_status, 'exited');
  assert.ok(explicitRuskSteps.length > 0);
  assert.equal(explicitRuskSteps.some((step) => step.step_type === 'submit_committed_social_move'), true);
  assert.equal(requireContentId(content, 'greyvale_lysa_grief_suspicion_dialogue').content.title.includes('Lysa'), true);
});

test('6B.14.5 shared context helpers represent exploration and dialogue without changing domain names', () => {
  const campaign = createInteractionTestCampaign({ currentSceneId: 'grey-road-inn' });
  const character = createInteractionTestCharacter({ characterId: 'pc-1' });
  const activeCampaign = setActiveInteractionCharacter(campaign, character);
  const explorationState = enterExplorationScene({ campaign: activeCampaign, character });
  const dialogueState = enterDialogueScene({
    campaign: activeCampaign,
    character,
    activeDialogueId: 'greyvale_tomas_roadside_worries_dialogue',
  });

  assert.equal(buildExplorationInteractionContext({ campaign: activeCampaign, character }).interaction_domain, 'exploration');
  assert.equal(buildDialogueInteractionContext({ campaign: activeCampaign, character }).interaction_domain, 'dialogue');
  assertCurrentScene(getCurrentPlayerReadModel(explorationState), 'grey-road-inn');
  assertActionWindowOpen(getCurrentPlayerReadModel(explorationState));
  assertDialogueActive(getCurrentPlayerReadModel(dialogueState), 'greyvale_tomas_roadside_worries_dialogue');
  assertNoHiddenDataLeak(getCurrentPlayerReadModel(dialogueState));
  assert.equal(getCurrentGmDevReadModel(dialogueState).visibility_projection.visibility_scope, 'gm_dev');
});

test('6B.14.5 non-committing inquiry and committed preview helpers share lifecycle assertions', () => {
  const freeFocus = runNonCommittingInquiry({
    context: buildExplorationInteractionContext(),
    outputBundle: createExplorationOutputBundle({
      knowledgeOutputs: [{ knowledgeId: 'greyvale.caravan_irregularity', title: 'Caravan Irregularity', summary: 'The caravan scene is wrong.' }],
    }),
  });
  const clarifyingQuestion = runNonCommittingInquiry({
    context: buildDialogueInteractionContext({ activeDialogueId: 'greyvale_tomas_roadside_worries_dialogue' }),
    playerResult: { text: 'Tomas answers without spending the conversation beat.' },
  });
  const preview = previewCommittedInteraction({
    context: buildDialogueInteractionContext({ activeDialogueId: 'greyvale_tomas_roadside_worries_dialogue' }),
    playerPreview: 'This spends the conversation beat if submitted.',
  });

  assertInquiryDidNotConsumeCommitSlot(freeFocus);
  assertInquiryDidNotWriteCommittedAction(freeFocus);
  assertInquiryResultPlayerSafe(clarifyingQuestion);
  assertInquiryGmDevDebugAvailable(clarifyingQuestion);
  assertInquiryOutputBundle(freeFocus, { knowledgeId: 'greyvale.caravan_irregularity' });
  assertPreviewDidNotCommit(preview);
  assertPreviewPlayerSafe(preview);
  assertPreviewGmDevDebugAvailable(preview);
  assertPreviewShowsAvailability(preview);
  assertGmDevPayloadIncludesChecks({
    debug: {
      checks: [{ hidden_dc: 13 }],
    },
  });
});

test('6B.14.5 submit resolution output and next-state assertions work for exploration and dialogue', () => {
  const explorationBundle = createExplorationOutputBundle({
    knowledgeOutputs: [{ knowledgeId: 'greyvale.pattern_of_attacks', title: 'Pattern', summary: 'The road trouble follows a pattern.' }],
    objectiveOutputs: [{ objectiveId: 'gather-local-insight', title: 'Gather local insight', status: 'active', progress: 1, summary: 'A local lead advances the search.' }],
    historyOutputs: [{ eventId: 'history:tomas', text: 'Tomas shared a road pattern.' }],
    latestDevelopmentOutput: { latestDevelopmentId: 'latest:tomas', text: 'A road pattern stands out.' },
    stateWrites: [{ stateKey: 'greyvale.pattern_seen', operation: 'set', value: true, playerSummary: 'You know the road pattern.' }],
    transitionOutputs: [{ status: 'live', targetType: TRANSITION_TARGET_TYPES.SCENE, targetId: 'grey-road-inn', playerLabel: 'Return to the inn' }],
    archiveSearchOutputs: [{ archiveEntryId: 'archive:tomas', title: 'Tomas', summary: 'A road pattern lead.' }],
    provenance: { sourceContentId: 'greyvale_tomas_roadside_worries_dialogue' },
  });
  const dialogueBundle = createDialogueOutputBundle({
    relationshipOrSocialWrites: [{ participantId: 'elin-harrow', key: 'trust', delta: 1, playerPerceptionSummary: 'Elin steadies herself.' }],
    completedRecordOutputs: [{ recordId: 'completed:elin', interactionDomain: 'dialogue', title: 'Elin and the Hearth', summary: 'Elin shared a memory.' }],
    transcriptOutputs: [{ transcriptId: 'transcript:elin:1', dialogueId: 'greyvale_elin_memory_dialogue', text: 'Elin remembers the first sound.' }],
    provenance: { sourceContentId: 'greyvale_elin_memory_dialogue' },
  });
  const submitted = submitCommittedInteraction({ context: buildExplorationInteractionContext(), idempotencyKey: 'submit-1' });
  const { resolution } = submitAndResolveCommittedInteraction({
    context: buildExplorationInteractionContext(),
    outputBundle: explorationBundle,
    nextState: { interaction_domain: 'exploration', status: 'active', action_window_id: 'window-2', current_scene_id: 'grey-road-inn' },
  });

  assertSubmitCommittedExactlyOnce(submitted);
  assertResolutionOutputBundle(resolution, { knowledgeId: 'greyvale.pattern_of_attacks', objectiveId: 'gather-local-insight' });
  assertResolutionNextState(resolution, { status: 'active' });
  assertResolutionPlayerSafe(resolution);
  assertResolutionGmDevDebugAvailable(resolution);
  assertNextActionWindowReady(resolution);
  assertSceneTransitionedTo({ next_state: { current_scene_id: 'grey-road-inn' } }, 'grey-road-inn');
  assertDialogueExited({ status: 'exited' });

  assertKnowledgeOutput(explorationBundle, 'greyvale.pattern_of_attacks');
  assertObjectiveOutput(explorationBundle, 'gather-local-insight');
  assertHistoryOutput(explorationBundle, 'history:tomas');
  assertLatestDevelopment(explorationBundle, 'road pattern');
  assertStateWrite(explorationBundle, 'greyvale.pattern_seen');
  assertTransitionOutput(explorationBundle, { targetType: 'scene', targetId: 'grey-road-inn' });
  assertArchiveSearchEntry(explorationBundle, 'archive:tomas');
  assertRelationshipOrSocialWrite(dialogueBundle, 'elin-harrow', 'trust');
  assertCompletedRecord(dialogueBundle, 'completed:elin');
  assertTranscriptOutput(dialogueBundle, 'transcript:elin:1');
  assertOutputNotDuplicated(explorationBundle.knowledge_outputs, 'knowledge_id');
  assertPlayerOutputBundleSafe(explorationBundle);
  assertGmDevOutputProvenance(explorationBundle, { sourceContentId: 'greyvale_tomas_roadside_worries_dialogue' });
  assertGmDevPayloadIncludesDebug({ debug: { output_provenance: explorationBundle.knowledge_outputs[0].provenance } });
  assertGmDevPayloadIncludesStateWrites({ state_writes: explorationBundle.state_writes });
});

test('6B.14.5 forced checks and stale duplicate lifecycle assertions are reusable', async () => {
  await withForcedCheckSuccess(async (forced) => {
    assertForcedCheckApplied(forced, { forcedOutcome: 'success', forcedResultBand: 'success' });
  });
  await withForcedCheckFailure(async (forced) => {
    assertForcedCheckApplied(forced, { forcedOutcome: 'failure', forcedResultBand: 'failure' });
  });
  await withForcedResultBand('strong_success', async (forced) => {
    assertForcedCheckApplied(forced, { forcedResultBand: 'strong_success' });
  });
  assert.deepEqual(restoreCheckBehavior(), { restored: true });

  const stalePreview = assertStalePreviewRejected();
  const staleSubmit = assertStaleSubmitRejected();
  const duplicate = assertDuplicateSubmitHandled();
  const ended = assertEndedInteractionRejected();
  const unavailable = assertUnavailableActionRejected();
  const wrongCharacter = assertWrongCharacterRejected();
  const wrongCampaign = assertWrongCampaignRejected();

  for (const result of [stalePreview, staleSubmit, duplicate, ended, unavailable, wrongCharacter, wrongCampaign]) {
    assertSafeRecoveryMessage(result);
    assertLifecycleDiagnostic(result);
  }
});

test('6B.14.5 shared visibility and state assertions cover player safe and GM/dev-only boundaries', () => {
  const ruskBundle = createDialogueOutputBundle({
    knowledgeOutputs: [{ knowledgeId: 'greyvale.bandit_instability', title: 'Bandit Instability', summary: 'Rusk seems altered by the shrine.' }],
    transitionOutputs: [
      {
        status: 'future_supported',
        targetType: 'combat_pending',
        targetId: 'rusk-shrine-confrontation',
        playerLabel: 'Brace for violence',
        futureSupportedReason: 'Combat handoff is not live.',
        gmDevRouting: { combat_routing: 'encounter:rusk' },
      },
    ],
    provenance: { sourceContentId: 'greyvale_rusk_at_the_shrine_dialogue' },
  });

  assertPlayerPayloadSafe({ result: 'Safe text.' });
  assertFutureSupportedHiddenFromPlayer(ruskBundle);
  assertCombatPendingPlayerHidden(ruskBundle);
  assertUnauthorizedCannotAccessGmDev({ status: 403 });
  assertKnowledgeState({ knowledge: [{ knowledge_id: 'greyvale.bandit_instability' }] }, 'greyvale.bandit_instability');
  assertObjectiveState({ objectives: [{ objective_id: 'resolve-the-threat', status: 'active' }] }, 'resolve-the-threat', 'active');
  assertHistoryState({ history: [{ event_id: 'history:rusk' }] }, 'history:rusk');
  assertArchiveSearchState({ archive_search_outputs: [{ archive_entry_id: 'archive:rusk' }] }, 'archive:rusk');
});
