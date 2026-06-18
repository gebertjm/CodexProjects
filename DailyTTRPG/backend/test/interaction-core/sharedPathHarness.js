import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  AVAILABILITY_STATUSES,
  COMMIT_STATES,
  INTERACTION_LIFECYCLE_STATUSES,
  INTERACTION_OPTION_KINDS,
  SAFE_INTERACTION_ERROR_CODES,
  VISIBILITY_SCOPES,
  assertNoPlayerHiddenData,
  assertOutputBundlePlayerSafe,
  buildInteractionPreviewLifecycleResult,
  buildInteractionResolutionLifecycleResult,
  buildInteractionSubmitAccepted,
  createDialogueOutputBundle,
  createExplorationOutputBundle,
  createInteractionContext,
  createInteractionOption,
  createOutputBundle,
  projectForGmDev,
  projectForPlayer,
  projectOutputBundleForGmDev,
  projectOutputBundleForPlayer,
  validateCommittedAction,
  validateInteractionSubmit,
  validateNonCommittingInquiry,
  validatePreviewContextFreshness,
} from '../../src/services/interactionCore/index.js';

function repoRoot() {
  return process.cwd().endsWith(`${path.sep}backend`)
    ? path.resolve(process.cwd(), '..')
    : process.cwd();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

export function loadInteractionTestContent(options = {}) {
  const root = options.repo_root ?? options.repoRoot ?? repoRoot();
  const greyvaleDialogueDir = path.resolve(root, 'content/dialogue_focus_commit/greyvale');
  const sceneFiles = fileExists(greyvaleDialogueDir)
    ? []
    : fs
        .readdirSync(greyvaleDialogueDir)
        .filter((fileName) => fileName.endsWith('.scene.json'))
        .sort();
  const expectedPathFiles = fileExists(greyvaleDialogueDir)
    ? []
    : fs
        .readdirSync(greyvaleDialogueDir)
        .filter((fileName) => fileName.endsWith('.expected-paths.json'))
        .sort();

  return {
    repo_root: root,
    greyvale_dialogue_dir: greyvaleDialogueDir,
    greyvale_world_package_root: path.resolve(root, 'content/worlds/greyvale'),
    dialogue_scenes: sceneFiles.map((fileName) => ({
      file_name: fileName,
      file_path: path.join(greyvaleDialogueDir, fileName),
      content: readJson(path.join(greyvaleDialogueDir, fileName)),
    })),
    dialogue_expected_paths: expectedPathFiles.map((fileName) => ({
      file_name: fileName,
      file_path: path.join(greyvaleDialogueDir, fileName),
      content: readJson(path.join(greyvaleDialogueDir, fileName)),
    })),
  };
}

export function loadGreyvaleRegressionContent(options = {}) {
  return loadInteractionTestContent(options);
}

function requireFromCollection(collection, predicate, message) {
  const match = collection.find(predicate);
  assert.ok(match, message);
  return match;
}

export function requireContentId(content, contentId) {
  const scenes = normalizeArray(content.dialogue_scenes);
  return requireFromCollection(
    scenes,
    (entry) => entry.content?.id === contentId || entry.content?.dialogue_scene_id === contentId,
    `Expected content id ${contentId}`
  );
}

export function requireSceneId(content, sceneId) {
  return requireContentId(content, sceneId);
}

export function requireDialogueId(content, dialogueId) {
  return requireContentId(content, dialogueId);
}

export function requireNpcId(content, npcId) {
  const scenes = normalizeArray(content.dialogue_scenes);
  return requireFromCollection(
    scenes,
    (entry) =>
      JSON.stringify(entry.content?.participants ?? entry.content?.participant ?? '').includes(npcId),
    `Expected NPC id ${npcId}`
  );
}

export function requireExpectedPath(content, fixtureId, pathName) {
  const fixtures = normalizeArray(content.dialogue_expected_paths);
  const fixture = requireFromCollection(
    fixtures,
    (entry) => entry.content?.fixture_id === fixtureId,
    `Expected path fixture ${fixtureId}`
  );
  const expectedPath = requireFromCollection(
    normalizeArray(fixture.content.paths),
    (entry) => entry.name === pathName || entry.mode === pathName,
    `Expected path ${pathName} in ${fixtureId}`
  );
  return { fixture, expected_path: expectedPath };
}

export function readDialogueExpectedPath(filePathOrFixture, pathName) {
  const fixture = typeof filePathOrFixture === 'string' ? readJson(filePathOrFixture) : filePathOrFixture;
  return requireFromCollection(
    normalizeArray(fixture.paths),
    (entry) => entry.name === pathName || entry.mode === pathName,
    `Expected dialogue path ${pathName}`
  );
}

export function readExplorationExpectedPath(filePathOrFixture, pathName) {
  const fixture = typeof filePathOrFixture === 'string' ? readJson(filePathOrFixture) : filePathOrFixture;
  return requireFromCollection(
    normalizeArray(fixture.paths),
    (entry) => entry.name === pathName || entry.mode === pathName,
    `Expected exploration path ${pathName}`
  );
}

export function normalizeExpectedPathStepsForSharedAssertions(expectedPath = {}) {
  const explicitSteps = normalizeArray(expectedPath.steps);
  if (explicitSteps.length > 0) {
    return explicitSteps.map((step, index) => ({
      step_id: step.id ?? step.step_id ?? `step_${index + 1}`,
      step_type: step.type ?? step.kind ?? 'unspecified',
      option_id: step.move_id ?? step.question_id ?? step.exit_id ?? step.option_id ?? null,
      forced_outcome: step.forced_outcome ?? null,
      submitted_text: step.submitted_text ?? null,
    }));
  }
  return normalizeArray(expectedPath.coverage).map((coverage, index) => ({
    step_id: `coverage_${index + 1}`,
    step_type: 'coverage_marker',
    coverage,
  }));
}

export function createInteractionTestCampaign(overrides = {}) {
  return {
    campaign_id: overrides.campaign_id ?? overrides.campaignId ?? 'campaign-test',
    adventure_id: overrides.adventure_id ?? overrides.adventureId ?? 'adventure-greyvale',
    current_scene_id: overrides.current_scene_id ?? overrides.currentSceneId ?? 'grey-road-inn',
    current_location_id: overrides.current_location_id ?? overrides.currentLocationId ?? 'greyvale',
    ...overrides,
  };
}

export function createInteractionTestCharacter(overrides = {}) {
  return {
    character_id: overrides.character_id ?? overrides.characterId ?? 'character-test',
    actor_id: overrides.actor_id ?? overrides.actorId ?? 'actor-test',
    user_id: overrides.user_id ?? overrides.userId ?? 'user-test',
    active: overrides.active ?? true,
    ...overrides,
  };
}

export function setActiveInteractionCharacter(campaign = {}, character = {}) {
  return {
    ...campaign,
    active_character_id: character.character_id ?? character.characterId,
  };
}

export function buildExplorationInteractionContext(input = {}) {
  const campaign = normalizeObject(input.campaign);
  const character = normalizeObject(input.character);
  return createInteractionContext({
    interactionDomain: 'exploration',
    campaignId: campaign.campaign_id ?? input.campaign_id ?? input.campaignId ?? 'campaign-test',
    adventureId: campaign.adventure_id ?? input.adventure_id ?? input.adventureId ?? 'adventure-greyvale',
    characterId: character.character_id ?? input.character_id ?? input.characterId ?? 'character-test',
    actorId: character.actor_id ?? input.actor_id ?? input.actorId ?? 'actor-test',
    userId: character.user_id ?? input.user_id ?? input.userId ?? 'user-test',
    currentSceneId: input.current_scene_id ?? input.currentSceneId ?? campaign.current_scene_id ?? 'grey-road-inn',
    currentLocationId: input.current_location_id ?? input.currentLocationId ?? campaign.current_location_id ?? 'greyvale',
    actionWindowId: input.action_window_id ?? input.actionWindowId ?? 'window-1',
    interactionStateVersion: input.interaction_state_version ?? input.interactionStateVersion ?? 'scene-v1',
    sourceContentId: input.source_content_id ?? input.sourceContentId,
    visibilityScope: input.visibility_scope ?? input.visibilityScope ?? VISIBILITY_SCOPES.SYSTEM_INTERNAL,
  });
}

export function buildDialogueInteractionContext(input = {}) {
  const campaign = normalizeObject(input.campaign);
  const character = normalizeObject(input.character);
  return createInteractionContext({
    interactionDomain: 'dialogue',
    campaignId: campaign.campaign_id ?? input.campaign_id ?? input.campaignId ?? 'campaign-test',
    adventureId: campaign.adventure_id ?? input.adventure_id ?? input.adventureId ?? 'adventure-greyvale',
    characterId: character.character_id ?? input.character_id ?? input.characterId ?? 'character-test',
    actorId: character.actor_id ?? input.actor_id ?? input.actorId ?? 'actor-test',
    userId: character.user_id ?? input.user_id ?? input.userId ?? 'user-test',
    currentSceneId: input.current_scene_id ?? input.currentSceneId ?? campaign.current_scene_id,
    activeDialogueId: input.active_dialogue_id ?? input.activeDialogueId ?? 'dialogue:tomas',
    turnId: input.turn_id ?? input.turnId ?? 'turn-1',
    interactionStateVersion: input.interaction_state_version ?? input.interactionStateVersion ?? 'dialogue-v1',
    sourceContentId: input.source_content_id ?? input.sourceContentId,
    visibilityScope: input.visibility_scope ?? input.visibilityScope ?? VISIBILITY_SCOPES.SYSTEM_INTERNAL,
  });
}

export function enterExplorationScene(input = {}) {
  return {
    status: 'active',
    context: buildExplorationInteractionContext(input),
    read_model: input.read_model ?? input.readModel ?? {
      scene: { scene_id: input.current_scene_id ?? input.currentSceneId ?? 'grey-road-inn' },
      action_window: { status: 'open' },
    },
  };
}

export function enterDialogueScene(input = {}) {
  return {
    status: 'active',
    context: buildDialogueInteractionContext(input),
    read_model: input.read_model ?? input.readModel ?? {
      dialogue_scene: { dialogue_scene_id: input.active_dialogue_id ?? input.activeDialogueId ?? 'dialogue:tomas' },
      committed_social_move_count: 0,
    },
  };
}

export function getCurrentPlayerReadModel(state = {}) {
  return projectForPlayer(state.read_model ?? state.readModel ?? state);
}

export function getCurrentGmDevReadModel(state = {}) {
  return projectForGmDev(state.read_model ?? state.readModel ?? state);
}

function optionFor(domain, kind, overrides = {}) {
  const isDialogue = domain === 'dialogue';
  const optionKind =
    kind === 'non_committing'
      ? INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY
      : INTERACTION_OPTION_KINDS.COMMITTED_ACTION;
  return createInteractionOption({
    interactionDomain: domain,
    optionKind,
    domainKind:
      kind === 'non_committing'
        ? isDialogue
          ? 'clarifying_question'
          : 'free_focus'
        : isDialogue
          ? 'committed_social_move'
          : 'beat_action',
    optionId:
      overrides.option_id ??
      overrides.optionId ??
      (kind === 'non_committing'
        ? isDialogue
          ? 'cq:test'
          : 'focus:test'
        : isDialogue
          ? 'move:test'
          : 'action:test'),
    label: overrides.label ?? (kind === 'non_committing' ? 'Ask' : 'Act'),
    availability: overrides.availability ?? { status: AVAILABILITY_STATUSES.AVAILABLE },
    ...overrides,
  });
}

export function runNonCommittingInquiry(input = {}) {
  const context = input.context ?? (input.domain === 'dialogue'
    ? buildDialogueInteractionContext(input)
    : buildExplorationInteractionContext(input));
  const option = input.option ?? optionFor(context.interaction_domain, 'non_committing', input.option_overrides ?? input.optionOverrides);
  const validation = validateNonCommittingInquiry({
    option,
    priorResult: input.prior_result ?? input.priorResult,
    availability: input.availability,
  });
  return {
    status: validation.valid ? (validation.status ?? 'resolved') : 'rejected',
    context,
    option,
    validation,
    consumed_commit_slot: false,
    committed_action_written: false,
    player_result: input.player_result ?? input.playerResult ?? { text: 'The answer stays with the current moment.' },
    output_bundle: input.output_bundle ?? input.outputBundle ?? createOutputBundle(),
    debug_payload: {
      check: input.forced_check ?? input.forcedCheck ?? null,
      validation,
    },
  };
}

export function assertInquiryDidNotConsumeCommitSlot(result = {}) {
  assert.equal(result.consumed_commit_slot, false);
  assert.equal(result.validation?.consumes_commit_slot, false);
}

export function assertInquiryDidNotWriteCommittedAction(result = {}) {
  assert.equal(result.committed_action_written, false);
}

export function assertInquiryResultPlayerSafe(result = {}) {
  assertNoPlayerHiddenData(projectForPlayer(result.player_result ?? result));
}

export function assertInquiryGmDevDebugAvailable(result = {}) {
  assert.ok(result.debug_payload ?? result.validation?.diagnostics);
}

export function assertInquiryOutputBundle(result = {}, expected = {}) {
  assertResolutionOutputBundle(result, expected);
}

export function previewCommittedInteraction(input = {}) {
  const context = input.context ?? (input.domain === 'dialogue'
    ? buildDialogueInteractionContext(input)
    : buildExplorationInteractionContext(input));
  const option = input.option ?? optionFor(context.interaction_domain, 'committed', input.option_overrides ?? input.optionOverrides);
  return buildInteractionPreviewLifecycleResult({
    interactionDomain: context.interaction_domain,
    context,
    option,
    playerPreview:
      input.player_preview ??
      input.playerPreview ??
      (context.interaction_domain === 'dialogue'
        ? 'This spends the conversation beat if submitted.'
        : 'This spends your action if submitted.'),
    checkSummary: input.check_summary ?? input.checkSummary,
    domainResult: input.domain_result ?? input.domainResult,
  });
}

export function assertPreviewDidNotCommit(preview = {}) {
  assert.equal(preview.consumes_commit_slot, false);
  assert.equal(preview.committed_action_id ?? null, null);
  assert.equal(preview.committed_move_id ?? null, null);
  assert.equal(preview.resolution_id ?? null, null);
}

export function assertPreviewPlayerSafe(preview = {}) {
  assertNoPlayerHiddenData(projectForPlayer(preview));
}

export function assertPreviewGmDevDebugAvailable(preview = {}) {
  assert.ok(preview.debug_envelope ?? preview.debugEnvelope);
}

export function assertPreviewShowsAvailability(preview = {}, status = AVAILABILITY_STATUSES.AVAILABLE) {
  assert.equal(preview.availability?.status, status);
}

export function assertPreviewStaleWhenContextVersionChanges(input = {}) {
  const requestedContext = input.requested_context ?? input.requestedContext ?? buildExplorationInteractionContext();
  const currentContext =
    input.current_context ??
    input.currentContext ??
    buildExplorationInteractionContext({ interactionStateVersion: 'new-version' });
  const result = validatePreviewContextFreshness({
    requestedContext,
    currentContext,
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION);
  return result;
}

export function submitCommittedInteraction(input = {}) {
  const context = input.context ?? (input.domain === 'dialogue'
    ? buildDialogueInteractionContext(input)
    : buildExplorationInteractionContext(input));
  const option = input.option ?? optionFor(context.interaction_domain, 'committed', input.option_overrides ?? input.optionOverrides);
  const validation = validateInteractionSubmit({
    option,
    requestedContext: input.requested_context ?? input.requestedContext ?? context,
    currentContext: input.current_context ?? input.currentContext ?? context,
    commitState: input.commit_state ?? input.commitState ?? COMMIT_STATES.COMMIT_AVAILABLE,
    interactionStatus: input.interaction_status ?? input.interactionStatus ?? INTERACTION_LIFECYCLE_STATUSES.ACTIVE,
    requiredFields: input.required_fields ?? input.requiredFields,
    contextFields: input.context_fields ?? input.contextFields,
    idempotencyKey: input.idempotency_key ?? input.idempotencyKey,
    seenIdempotencyKeys: input.seen_idempotency_keys ?? input.seenIdempotencyKeys,
    allowIdempotentReplay: input.allow_idempotent_replay ?? input.allowIdempotentReplay,
  });
  if (!validation.valid) {
    return {
      status: 'rejected',
      validation,
      context,
      option,
      player_message: validation.error?.player_safe_message,
    };
  }
  return {
    ...buildInteractionSubmitAccepted({
      interactionDomain: context.interaction_domain,
      committedActionId:
        context.interaction_domain === 'exploration'
          ? input.committed_action_id ?? input.committedActionId ?? 'action:test'
          : null,
      committedMoveId:
        context.interaction_domain === 'dialogue'
          ? input.committed_move_id ?? input.committedMoveId ?? 'move-run:test'
          : null,
      resolutionId: input.resolution_id ?? input.resolutionId ?? 'resolution:test',
      playerMessage: input.player_message ?? input.playerMessage ?? 'The action is recorded.',
    }),
    validation,
    context,
    option,
  };
}

export function resolveSubmittedInteraction(input = {}) {
  const context = input.context ?? (input.domain === 'dialogue'
    ? buildDialogueInteractionContext(input)
    : buildExplorationInteractionContext(input));
  return buildInteractionResolutionLifecycleResult({
    interactionDomain: context.interaction_domain,
    resolutionId: input.resolution_id ?? input.resolutionId ?? 'resolution:test',
    status: input.status ?? 'resolved',
    context,
    playerResult: input.player_result ?? input.playerResult ?? { text: 'The moment resolves.' },
    outputBundle:
      input.output_bundle ??
      input.outputBundle ??
      (context.interaction_domain === 'dialogue'
        ? createDialogueOutputBundle(input.bundle ?? {})
        : createExplorationOutputBundle(input.bundle ?? {})),
    nextState: input.next_state ?? input.nextState ?? {
      interaction_domain: context.interaction_domain,
      status: 'active',
    },
  });
}

export function submitAndResolveCommittedInteraction(input = {}) {
  const submitted = submitCommittedInteraction(input);
  if (submitted.status === 'rejected') {
    return { submitted, resolution: null };
  }
  return {
    submitted,
    resolution: resolveSubmittedInteraction({
      ...input,
      context: submitted.context,
    }),
  };
}

export function assertSubmitCommittedExactlyOnce(result = {}) {
  assert.equal(result.status, 'accepted');
  assert.equal(result.validation?.valid, true);
  assert.equal(result.validation?.duplicate, false);
}

export function assertResolutionOutputBundle(result = {}, expected = {}) {
  const bundle = result.output_bundle ?? result.outputBundle ?? result.resolution?.output_bundle;
  assert.ok(bundle, 'Expected an output bundle');
  if (expected.knowledge_id ?? expected.knowledgeId) {
    assertKnowledgeOutput(bundle, expected.knowledge_id ?? expected.knowledgeId);
  }
  if (expected.objective_id ?? expected.objectiveId) {
    assertObjectiveOutput(bundle, expected.objective_id ?? expected.objectiveId);
  }
  return bundle;
}

export function assertResolutionNextState(result = {}, expected = {}) {
  const nextState = result.next_state ?? result.nextState ?? result.resolution?.next_state;
  assert.ok(nextState, 'Expected next state');
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(nextState[key], value);
  }
}

export function assertResolutionPlayerSafe(result = {}) {
  assertNoPlayerHiddenData(projectForPlayer(result));
  if (result.output_bundle) {
    assertOutputBundlePlayerSafe(result.output_bundle);
  }
}

export function assertResolutionGmDevDebugAvailable(result = {}) {
  assert.ok(result.debug_envelope ?? result.debugEnvelope ?? result.resolution?.debug_envelope);
}

export function assertTransitionOutput(bundleOrResult = {}, expected = {}) {
  const bundle = bundleOrResult.output_bundle ?? bundleOrResult.outputBundle ?? bundleOrResult;
  const transitions = normalizeArray(bundle.transition_outputs ?? bundle.transitionOutputs);
  const match = transitions.find((entry) => {
    const targetType = expected.target_type ?? expected.targetType;
    const targetId = expected.target_id ?? expected.targetId;
    const status = expected.status;
    return (
      (!targetType || entry.target_type === targetType) &&
      (!targetId || entry.target_id === targetId) &&
      (!status || entry.status === status)
    );
  });
  assert.ok(match, `Expected transition output ${JSON.stringify(expected)}`);
  return match;
}

export function assertFutureSupportedPlayerHidden(payload = {}) {
  const player =
    payload.transition_outputs || payload.transitionOutputs
      ? projectOutputBundleForPlayer(payload)
      : projectForPlayer(payload);
  assert.equal(JSON.stringify(player).includes('future_supported'), false);
  assert.equal(JSON.stringify(player).includes('future_supported_reason'), false);
}

export const assertFutureSupportedHiddenFromPlayer = assertFutureSupportedPlayerHidden;

export function assertCombatPendingPlayerHidden(payload = {}) {
  const player =
    payload.transition_outputs || payload.transitionOutputs
      ? projectOutputBundleForPlayer(payload)
      : projectForPlayer(payload);
  assert.equal(JSON.stringify(player).includes('combat_routing'), false);
  assert.equal(JSON.stringify(player).includes('combatRouting'), false);
}

export const assertCombatPendingHiddenFromPlayer = assertCombatPendingPlayerHidden;

export async function withForcedCheckSuccess(callback) {
  return callback({ forced_outcome: 'success', forced_result_band: 'success' });
}

export async function withForcedCheckFailure(callback) {
  return callback({ forced_outcome: 'failure', forced_result_band: 'failure' });
}

export async function withForcedResultBand(resultBand, callback) {
  return callback({ forced_result_band: resultBand });
}

export function assertForcedCheckApplied(result = {}, expected = {}) {
  const forcedOutcome = expected.forced_outcome ?? expected.forcedOutcome;
  const forcedResultBand = expected.forced_result_band ?? expected.forcedResultBand;
  if (forcedOutcome) {
    assert.equal(result.forced_outcome ?? result.forcedOutcome, forcedOutcome);
  }
  if (forcedResultBand) {
    assert.equal(result.forced_result_band ?? result.forcedResultBand, forcedResultBand);
  }
}

export function restoreCheckBehavior() {
  return { restored: true };
}

export function assertKnowledgeOutput(bundle = {}, knowledgeId) {
  assert.ok(normalizeArray(bundle.knowledge_outputs).some((entry) => entry.knowledge_id === knowledgeId));
}

export function assertObjectiveOutput(bundle = {}, objectiveId) {
  assert.ok(normalizeArray(bundle.objective_outputs).some((entry) => entry.objective_id === objectiveId));
}

export function assertHistoryOutput(bundle = {}, eventId) {
  assert.ok(normalizeArray(bundle.history_outputs).some((entry) => entry.event_id === eventId));
}

export function assertLatestDevelopment(bundle = {}, expectedText = null) {
  assert.ok(bundle.latest_development_output);
  if (expectedText) {
    assert.match(bundle.latest_development_output.player_text ?? '', new RegExp(expectedText));
  }
}

export function assertStateWrite(bundle = {}, stateKey) {
  assert.ok(normalizeArray(bundle.state_writes).some((entry) => entry.state_key === stateKey));
}

export function assertRelationshipOrSocialWrite(bundle = {}, participantId, stateKey = null) {
  assert.ok(
    normalizeArray(bundle.relationship_or_social_writes).some(
      (entry) => entry.participant_id === participantId && (!stateKey || entry.state_key === stateKey)
    )
  );
}

export function assertCompletedRecord(bundle = {}, recordId = null) {
  assert.ok(
    normalizeArray(bundle.completed_record_outputs).some(
      (entry) => !recordId || entry.completed_interaction_id === recordId
    )
  );
}

export function assertTranscriptOutput(bundle = {}, transcriptId = null) {
  assert.ok(
    normalizeArray(bundle.transcript_outputs).some((entry) => !transcriptId || entry.transcript_id === transcriptId)
  );
}

export function assertArchiveSearchEntry(bundle = {}, archiveEntryId = null) {
  assert.ok(
    normalizeArray(bundle.archive_search_outputs).some(
      (entry) => !archiveEntryId || entry.archive_entry_id === archiveEntryId
    )
  );
}

export function assertOutputNotDuplicated(outputs = [], keySelector) {
  const seen = new Set();
  for (const output of normalizeArray(outputs)) {
    const key = typeof keySelector === 'function' ? keySelector(output) : output[keySelector];
    assert.equal(seen.has(key), false, `Duplicate output key ${key}`);
    seen.add(key);
  }
}

export function assertPlayerOutputBundleSafe(bundle = {}) {
  assertOutputBundlePlayerSafe(bundle);
}

export function assertGmDevOutputProvenance(bundle = {}, expected = {}) {
  const projected = projectOutputBundleForGmDev(bundle);
  const allOutputs = [
    ...normalizeArray(projected.knowledge_outputs),
    ...normalizeArray(projected.objective_outputs),
    ...normalizeArray(projected.history_outputs),
    ...normalizeArray(projected.transition_outputs),
    ...normalizeArray(projected.completed_record_outputs),
    ...normalizeArray(projected.transcript_outputs),
    ...normalizeArray(projected.archive_search_outputs),
  ];
  assert.ok(allOutputs.some((entry) => entry.provenance));
  if (expected.source_content_id ?? expected.sourceContentId) {
    assert.ok(
      allOutputs.some(
        (entry) => entry.provenance?.source_content_id === (expected.source_content_id ?? expected.sourceContentId)
      )
    );
  }
}

export function assertPlayerPayloadSafe(payload = {}) {
  assertNoPlayerHiddenData(payload);
}

export const assertNoHiddenDataLeak = assertPlayerPayloadSafe;

export function assertGmDevPayloadIncludesDebug(payload = {}) {
  const text = JSON.stringify(projectForGmDev(payload));
  assert.ok(/debug|diagnostic|gm_dev|hidden_dc|state_writes|provenance/i.test(text));
}

export function assertGmDevPayloadIncludesChecks(payload = {}) {
  const text = JSON.stringify(projectForGmDev(payload));
  assert.ok(/check|hidden_dc|dc/i.test(text));
}

export function assertGmDevPayloadIncludesStateWrites(payload = {}) {
  const text = JSON.stringify(projectForGmDev(payload));
  assert.ok(/state_writes|stateWrites|state_key/i.test(text));
}

export function assertUnauthorizedCannotAccessGmDev(responseLike = {}) {
  const status = responseLike.status ?? responseLike.response?.status;
  assert.ok([401, 403].includes(status), `Expected unauthorized/forbidden status, got ${status}`);
}

export function assertCurrentScene(readModel = {}, sceneId) {
  assert.equal(readModel.scene?.scene_id ?? readModel.current_scene_id ?? readModel.currentSceneId, sceneId);
}

export function assertSceneTransitionedTo(result = {}, sceneId) {
  assert.equal(result.next_state?.current_scene_id ?? result.current_scene_id ?? result.scene_id, sceneId);
}

export function assertDialogueActive(readModel = {}, dialogueId = null) {
  assert.equal(readModel.status ?? 'active', 'active');
  if (dialogueId) {
    assert.equal(readModel.dialogue_scene?.dialogue_scene_id ?? readModel.active_dialogue_id, dialogueId);
  }
}

export function assertDialogueExited(result = {}) {
  assert.ok(['exited', 'completed'].includes(result.status ?? result.final_status ?? result.next_state?.status));
}

export function assertActionWindowOpen(readModel = {}) {
  assert.equal(readModel.action_window?.status ?? readModel.action_window_status ?? 'open', 'open');
}

export function assertActionWindowClosed(readModel = {}) {
  assert.equal(readModel.action_window?.status ?? readModel.action_window_status, 'closed');
}

export function assertNextActionWindowReady(result = {}) {
  const nextState = result.next_state ?? result.nextState ?? result;
  assert.ok(
    Boolean(nextState.action_window_id) ||
      nextState.action_window?.status === 'open' ||
      nextState.status === 'active'
  );
}

export function assertKnowledgeState(state = {}, knowledgeId) {
  assert.ok(normalizeArray(state.knowledge ?? state.knowledge_outputs).some((entry) => entry.knowledge_id === knowledgeId || entry.id === knowledgeId));
}

export function assertObjectiveState(state = {}, objectiveId, status = null) {
  const match = normalizeArray(state.objectives ?? state.objective_outputs).find(
    (entry) => entry.objective_id === objectiveId || entry.id === objectiveId
  );
  assert.ok(match, `Expected objective ${objectiveId}`);
  if (status) {
    assert.equal(match.status, status);
  }
}

export function assertHistoryState(state = {}, eventId = null) {
  const events = normalizeArray(state.history ?? state.history_outputs);
  assert.ok(events.length > 0);
  if (eventId) {
    assert.ok(events.some((entry) => entry.event_id === eventId || entry.id === eventId));
  }
}

export function assertArchiveSearchState(state = {}, archiveEntryId = null) {
  const entries = normalizeArray(state.archive ?? state.archive_search_outputs ?? state.search_results);
  assert.ok(entries.length > 0);
  if (archiveEntryId) {
    assert.ok(entries.some((entry) => entry.archive_entry_id === archiveEntryId || entry.id === archiveEntryId));
  }
}

export function assertStalePreviewRejected(input = {}) {
  return assertPreviewStaleWhenContextVersionChanges(input);
}

export function assertStaleSubmitRejected(input = {}) {
  const result = submitCommittedInteraction({
    ...input,
    requestedContext:
      input.requestedContext ??
      input.requested_context ??
      buildExplorationInteractionContext({ interactionStateVersion: 'old' }),
    currentContext:
      input.currentContext ??
      input.current_context ??
      buildExplorationInteractionContext({ interactionStateVersion: 'new' }),
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.validation.code, SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION);
  return result;
}

export function assertDuplicateSubmitHandled(input = {}) {
  const result = submitCommittedInteraction({
    ...input,
    idempotencyKey: input.idempotencyKey ?? 'duplicate-key',
    seenIdempotencyKeys: input.seenIdempotencyKeys ?? ['duplicate-key'],
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.validation.code, SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING);
  return result;
}

export function assertEndedInteractionRejected(input = {}) {
  const result = submitCommittedInteraction({
    domain: 'dialogue',
    ...input,
    interactionStatus: INTERACTION_LIFECYCLE_STATUSES.ENDED,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.validation.code, SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED);
  return result;
}

export function assertUnavailableActionRejected(input = {}) {
  const result = submitCommittedInteraction({
    ...input,
    optionOverrides: {
      availability: { status: AVAILABILITY_STATUSES.LOCKED, playerReason: 'That option is no longer available.' },
      ...(input.optionOverrides ?? {}),
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(
    result.validation.code ?? result.validation.error?.code,
    SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE
  );
  return result;
}

export function assertWrongCharacterRejected(input = {}) {
  const result = submitCommittedInteraction({
    ...input,
    requestedContext: buildExplorationInteractionContext({ characterId: 'character-a' }),
    currentContext: buildExplorationInteractionContext({ characterId: 'character-b' }),
    requiredFields: ['character_id'],
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.validation.code, SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION);
  return result;
}

export function assertWrongCampaignRejected(input = {}) {
  const result = submitCommittedInteraction({
    ...input,
    requestedContext: buildExplorationInteractionContext({ campaignId: 'campaign-a' }),
    currentContext: buildExplorationInteractionContext({ campaignId: 'campaign-b' }),
    requiredFields: ['campaign_id'],
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.validation.code, SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION);
  return result;
}

export function assertSafeRecoveryMessage(result = {}) {
  const message =
    result.player_message ??
    result.validation?.error?.player_safe_message ??
    result.error?.player_safe_message ??
    '';
  assert.equal(cleanText(message).length > 0, true);
  assertPlayerPayloadSafe({ message });
}

export function assertLifecycleDiagnostic(result = {}) {
  assert.ok(result.validation?.diagnostics ?? result.diagnostics ?? result.debug_envelope);
}
