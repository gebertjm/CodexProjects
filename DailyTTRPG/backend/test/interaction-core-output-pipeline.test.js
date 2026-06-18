import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OUTPUT_KINDS,
  SHARED_INTERACTION_DOMAINS,
  TRANSITION_TARGET_TYPES,
  assertNoPlayerHiddenData,
  assertOutputBundlePlayerSafe,
  assertOutputBundleValid,
  attachOutputBundleProvenance,
  buildOutputDedupeKey,
  createDialogueOutputBundle,
  createExplorationOutputBundle,
  createOutputBundle,
  createOutputProvenance,
  dedupeOutputsByKey,
  detectDuplicateArchiveSearchEntry,
  detectDuplicateCompletedRecord,
  detectDuplicateHistoryEvent,
  detectDuplicateKnowledgeGrant,
  detectDuplicateObjectiveProgress,
  detectDuplicateTranscriptEntry,
  dialogueOutputAdapter,
  explorationOutputAdapter,
  hasCompletedRecordOutputs,
  hasDebugOutputs,
  hasPlayerVisibleOutputs,
  hasStateChangingOutputs,
  hasTransitionOutputs,
  mergeOutputBundles,
  normalizeArchiveSearchOutput,
  normalizeCompletedRecordOutput,
  normalizeDebugOutput,
  normalizeHistoryOutput,
  normalizeKnowledgeOutput,
  normalizeLatestDevelopmentOutput,
  normalizeObjectiveOutput,
  normalizeOutputBundle,
  normalizeRelationshipOrSocialWriteOutput,
  normalizeStateWriteOutput,
  normalizeTranscriptOutput,
  normalizeTransitionOutput,
  projectDialogueOutputBundleForGmDev,
  projectDialogueOutputBundleForPlayer,
  projectExplorationOutputBundleForGmDev,
  projectExplorationOutputBundleForPlayer,
  projectOutputBundleForGmDev,
  projectOutputBundleForPlayer,
  summarizeDedupeDecisionForGmDev,
  validateOutputBundle,
} from '../src/services/interactionCore/index.js';

function greyvaleBundleInput() {
  return {
    playerResult: { text: 'Tomas lowers his voice.' },
    knowledgeOutputs: [
      {
        knowledgeId: 'greyvale.pattern_of_attacks',
        title: 'Pattern of Attacks',
        summary: 'The road trouble follows a pattern.',
      },
    ],
    objectiveOutputs: [
      {
        objectiveId: 'gather-local-insight',
        title: 'Gather local insight',
        status: 'active',
        progress: 1,
        summary: 'Tomas gave you a useful lead.',
      },
    ],
    historyOutputs: [
      {
        eventId: 'history:tomas-pattern',
        text: 'Tomas described the road pattern.',
        chronology: 10,
      },
    ],
    latestDevelopmentOutput: {
      latestDevelopmentId: 'latest:tomas-pattern',
      text: 'Tomas described a pattern in the attacks.',
    },
    stateWrites: [
      {
        stateKey: 'greyvale.pattern_seen',
        operation: 'set',
        value: true,
        playerSummary: 'You have a clearer sense of the road trouble.',
      },
    ],
    relationshipOrSocialWrites: [
      {
        participantId: 'tomas-rell',
        stateKey: 'trust',
        operation: 'increment',
        delta: 1,
        playerPerceptionSummary: 'Tomas seems a little more willing to talk.',
      },
    ],
    transitionOutputs: [
      {
        status: 'live',
        targetType: TRANSITION_TARGET_TYPES.DIALOGUE,
        targetId: 'greyvale_elin_hearth_memory_dialogue',
        playerLabel: 'Speak with Elin',
        gmDevRouting: { branch_id: 'tomas-success' },
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
    transcriptOutputs: [
      {
        transcriptId: 'transcript:tomas:1',
        dialogueId: 'greyvale_tomas_roadside_worries_dialogue',
        participantIds: ['tomas-rell'],
        text: 'Tomas lowers his voice.',
      },
    ],
    archiveSearchOutputs: [
      {
        archiveEntryId: 'archive:tomas',
        title: 'Tomas and the Road',
        summary: 'Road-pattern lead from Tomas.',
        tags: ['greyvale', 'tomas'],
      },
    ],
    debugOutputs: [
      {
        debugId: 'debug:tomas',
        message: 'Output bundle assembled from Tomas success branch.',
        diagnostics: { source_branch_id: 'success' },
      },
    ],
  };
}

test('6B.14.4 output bundle builder creates, normalizes, merges, and detects output classes', () => {
  const bundle = createOutputBundle(greyvaleBundleInput());
  const merged = mergeOutputBundles(
    bundle,
    createOutputBundle({
      knowledgeOutputs: [{ knowledgeId: 'greyvale.elin_lead', title: 'Elin Lead', summary: 'Speak with Elin.' }],
    })
  );

  assert.equal(bundle.player_result.text, 'Tomas lowers his voice.');
  assert.equal(bundle.knowledge_outputs[0].knowledge_id, 'greyvale.pattern_of_attacks');
  assert.equal(bundle.objective_outputs[0].objective_id, 'gather-local-insight');
  assert.equal(bundle.latest_development_output.player_text.includes('pattern'), true);
  assert.equal(merged.knowledge_outputs.length, 2);
  assert.equal(hasPlayerVisibleOutputs(bundle), true);
  assert.equal(hasStateChangingOutputs(bundle), true);
  assert.equal(hasTransitionOutputs(bundle), true);
  assert.equal(hasCompletedRecordOutputs(bundle), true);
  assert.equal(hasDebugOutputs(bundle), true);
});

test('6B.14.4 provenance helper attaches GM/dev source metadata without making it player-visible', () => {
  const provenance = createOutputProvenance({
    interactionDomain: 'dialogue',
    sourceContentId: 'greyvale_tomas_roadside_worries_dialogue',
    sourceContentPath: 'content/worlds/greyvale/dialogue/tomas.json',
    sourceOptionId: 'move:ask-about-road',
    sourceBranchId: 'success',
    resolutionId: 'resolution-1',
    committedMoveId: 'move-run-1',
    outputKind: OUTPUT_KINDS.KNOWLEDGE,
    outputId: 'greyvale.pattern_of_attacks',
    gmDevNotes: 'success branch grants clue',
  });
  const bundle = attachOutputBundleProvenance(
    createOutputBundle({
      knowledgeOutputs: [{ knowledgeId: 'greyvale.pattern_of_attacks', title: 'Pattern', summary: 'Road pattern.' }],
    }),
    provenance
  );
  const player = projectOutputBundleForPlayer(bundle);
  const gmDev = projectOutputBundleForGmDev(bundle);

  assert.equal(bundle.knowledge_outputs[0].provenance.source_branch_id, 'success');
  assert.equal(gmDev.knowledge_outputs[0].provenance.source_content_path.includes('greyvale'), true);
  assert.equal(JSON.stringify(player).includes('source_branch_id'), false);
  assert.equal(JSON.stringify(player).includes('source_content_path'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6B.14.4 normalization helpers cover knowledge objective history state relationship transition records transcript archive and debug', () => {
  assert.equal(normalizeKnowledgeOutput({ id: 'k1', title: 'K', summary: 'Safe.' }).knowledge_id, 'k1');
  assert.equal(normalizeObjectiveOutput({ id: 'o1', title: 'O', progress: 2 }).objective_id, 'o1');
  assert.equal(normalizeHistoryOutput({ id: 'h1', text: 'Event.' }).player_text, 'Event.');
  assert.equal(normalizeLatestDevelopmentOutput({ id: 'l1', text: 'Latest.' }).update_mode, 'replace');
  assert.equal(normalizeStateWriteOutput({ key: 'flag', operation: 'set' }).state_key, 'flag');
  assert.equal(
    normalizeRelationshipOrSocialWriteOutput({ participantId: 'elin-harrow', key: 'trust' }).participant_id,
    'elin-harrow'
  );
  assert.equal(normalizeTransitionOutput({ status: 'future_supported', targetType: 'combat_pending' }).target_type, 'combat_pending');
  assert.equal(normalizeCompletedRecordOutput({ id: 'record-1', title: 'Done' }).completed_interaction_id, 'record-1');
  assert.equal(normalizeTranscriptOutput({ id: 'turn-1', text: 'Line.' }).transcript_id, 'turn-1');
  assert.equal(normalizeArchiveSearchOutput({ id: 'archive-1', title: 'Archive' }).archive_entry_id, 'archive-1');
  assert.equal(normalizeDebugOutput({ id: 'debug-1', message: 'GM only.' }).output_kind, OUTPUT_KINDS.DEBUG);
});

test('6B.14.4 dedupe helpers dedupe configured outputs and preserve intentionally repeated history', () => {
  const first = normalizeKnowledgeOutput({
    knowledgeId: 'greyvale.pattern_of_attacks',
    title: 'Pattern',
    summary: 'Road pattern.',
  });
  const second = normalizeKnowledgeOutput({
    knowledgeId: 'greyvale.pattern_of_attacks',
    title: 'Pattern again',
    summary: 'Duplicate road pattern.',
  });
  const deduped = dedupeOutputsByKey([first, second]);
  const repeatedHistory = dedupeOutputsByKey(
    [
      normalizeHistoryOutput({ eventId: 'road-sound', text: 'A sound carries.' }),
      normalizeHistoryOutput({ eventId: 'road-sound', text: 'A sound carries again.' }),
    ],
    { preserveRepeats: true }
  );

  assert.equal(buildOutputDedupeKey(first), 'knowledge:greyvale.pattern_of_attacks');
  assert.equal(deduped.outputs.length, 1);
  assert.equal(deduped.duplicates.length, 1);
  assert.equal(summarizeDedupeDecisionForGmDev(deduped.duplicates[0]).action, 'dropped_duplicate');
  assert.equal(repeatedHistory.outputs.length, 2);
  assert.equal(detectDuplicateKnowledgeGrant([first], second).duplicate, true);
  assert.equal(detectDuplicateObjectiveProgress([normalizeObjectiveOutput({ objectiveId: 'obj' })], { objectiveId: 'obj' }).duplicate, true);
  assert.equal(detectDuplicateHistoryEvent([normalizeHistoryOutput({ eventId: 'evt' })], { eventId: 'evt' }).duplicate, true);
  assert.equal(detectDuplicateCompletedRecord([normalizeCompletedRecordOutput({ recordId: 'rec' })], { recordId: 'rec' }).duplicate, true);
  assert.equal(detectDuplicateTranscriptEntry([normalizeTranscriptOutput({ transcriptId: 'tr' })], { transcriptId: 'tr' }).duplicate, true);
  assert.equal(detectDuplicateArchiveSearchEntry([normalizeArchiveSearchOutput({ archiveEntryId: 'a' })], { archiveEntryId: 'a' }).duplicate, true);
});

test('6B.14.4 validation catches missing ids invalid transitions and player-visible hidden provenance', () => {
  const missing = validateOutputBundle({
    knowledgeOutputs: [{ title: 'No id', summary: 'Missing id.' }],
    transitionOutputs: [{ playerLabel: 'Broken target' }],
  });
  const playerVisible = validateOutputBundle({
    knowledgeOutputs: [
      {
        knowledgeId: 'k1',
        title: 'K',
        summary: 'Safe.',
        playerVisible: true,
        provenance: {
          sourceBranchId: 'hidden-success',
          sourceContentPath: 'content/secret.json',
        },
      },
    ],
  });
  const warningMode = validateOutputBundle(
    { knowledgeOutputs: [{ title: 'No id', summary: 'Missing id.' }] },
    { strict: false }
  );

  assert.equal(missing.valid, false);
  assert.equal(missing.errors.some((entry) => entry.code === 'missing_required_field'), true);
  assert.equal(missing.errors.some((entry) => entry.code === 'invalid_transition_target'), true);
  assert.equal(playerVisible.errors.some((entry) => entry.code === 'player_visible_hidden_provenance'), true);
  assert.equal(warningMode.valid, true);
  assert.equal(warningMode.warnings.length > 0, true);
  assert.throws(() => assertOutputBundleValid(missing.bundle), /failed validation/);
});

test('6B.14.4 output projection strips debug/provenance/raw writes for players and preserves them for GM/dev', () => {
  const bundle = createOutputBundle(greyvaleBundleInput());
  const player = projectOutputBundleForPlayer(bundle, { includeSafeStateSummaries: true });
  const gmDev = projectOutputBundleForGmDev(bundle);
  const playerText = JSON.stringify(player);

  assert.equal(player.knowledge_outputs[0].title, 'Pattern of Attacks');
  assert.equal(player.transition_outputs[0].player_label, 'Speak with Elin');
  assert.equal(playerText.includes('target_id'), false);
  assert.equal(playerText.includes('gmDevRouting'), false);
  assert.equal(playerText.includes('debug_outputs'), false);
  assert.equal(playerText.includes('state_writes'), false);
  assert.equal(player.state_summaries[0].player_summary.includes('road trouble'), true);
  assert.equal(gmDev.transition_outputs[0].gm_dev_routing.branch_id, 'tomas-success');
  assert.equal(gmDev.debug_outputs[0].diagnostics.source_branch_id, 'success');
  assert.doesNotThrow(() => assertOutputBundlePlayerSafe(bundle, { includeSafeStateSummaries: true }));
});

test('6B.14.4 exploration and dialogue output adapters wrap current output shapes without changing domain semantics', () => {
  const exploration = createExplorationOutputBundle({
    knowledgeOutputs: [{ knowledgeId: 'greyvale.caravan_irregularity', title: 'Caravan Clue', summary: 'The caravan scene is wrong.' }],
    transitionOutputs: [{ status: 'live', targetType: 'scene', targetId: 'grey-road-inn', playerLabel: 'Enter the inn' }],
    provenance: { sourceContentId: 'grey-road-entry', sourceSceneId: 'grey-road-entry' },
  });
  const dialogue = createDialogueOutputBundle({
    relationshipOrSocialWrites: [{ participantId: 'elin-harrow', key: 'trust', delta: 1, playerPerceptionSummary: 'Elin steadies herself.' }],
    completedRecordOutputs: [{ recordId: 'completed:elin', interactionDomain: 'dialogue', title: 'Elin and the Hearth', summary: 'Elin shared a memory.' }],
    provenance: { sourceContentId: 'greyvale_elin_hearth_memory_dialogue', sourceDialogueId: 'greyvale_elin_hearth_memory_dialogue' },
  });

  assert.equal(exploration.knowledge_outputs[0].provenance.interaction_domain, SHARED_INTERACTION_DOMAINS.EXPLORATION);
  assert.equal(dialogue.completed_record_outputs[0].provenance.interaction_domain, SHARED_INTERACTION_DOMAINS.DIALOGUE);
  assert.equal(projectExplorationOutputBundleForPlayer(exploration).transition_outputs[0].player_label, 'Enter the inn');
  assert.equal(projectDialogueOutputBundleForPlayer(dialogue).completed_record_outputs[0].title, 'Elin and the Hearth');
  assert.equal(projectExplorationOutputBundleForGmDev(exploration).knowledge_outputs[0].provenance.source_scene_id, 'grey-road-entry');
  assert.equal(
    projectDialogueOutputBundleForGmDev(dialogue).completed_record_outputs[0].provenance.source_dialogue_id,
    'greyvale_elin_hearth_memory_dialogue'
  );
  assert.equal(explorationOutputAdapter.projectForPlayer(exploration).knowledge_outputs[0].title, 'Caravan Clue');
  assert.equal(dialogueOutputAdapter.projectForGmDev(dialogue).visibility_projection.visibility_scope, 'gm_dev');
});

test('6B.14.4 Rusk future-supported combat internals stay player-hidden and GM/dev-visible', () => {
  const bundle = createDialogueOutputBundle({
    knowledgeOutputs: [
      {
        knowledgeId: 'greyvale.bandit_instability',
        title: 'Bandit Instability',
        summary: 'Rusk seems altered by the shrine.',
      },
    ],
    transitionOutputs: [
      {
        status: 'future_supported',
        targetType: 'combat_pending',
        targetId: 'rusk-shrine-confrontation',
        playerLabel: 'Brace for violence',
        futureSupportedReason: 'Combat web is not live in this stage.',
        gmDevRouting: { combatRouting: 'encounter:rusk-shrine-confrontation' },
      },
    ],
    debugOutputs: [{ debugId: 'rusk-routing', diagnostics: { future_supported_internal: true } }],
    provenance: { sourceContentId: 'greyvale_rusk_at_the_shrine_dialogue', sourceBranchId: 'hard-failure' },
  });
  const player = projectDialogueOutputBundleForPlayer(bundle);
  const gmDev = projectDialogueOutputBundleForGmDev(bundle);
  const playerText = JSON.stringify(player);

  assert.equal(player.knowledge_outputs[0].knowledge_id, 'greyvale.bandit_instability');
  assert.equal(player.transition_outputs[0].player_label, 'Brace for violence');
  assert.equal(playerText.includes('future_supported'), false);
  assert.equal(playerText.includes('combatRouting'), false);
  assert.equal(playerText.includes('rusk-shrine-confrontation'), false);
  assert.equal(gmDev.transition_outputs[0].future_supported_reason.includes('Combat web'), true);
  assert.equal(gmDev.transition_outputs[0].gm_dev_routing.combatRouting.includes('rusk'), true);
  assert.doesNotThrow(() => assertOutputBundlePlayerSafe(bundle));
});
