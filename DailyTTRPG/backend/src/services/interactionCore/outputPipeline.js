import {
  INTERACTION_OPTION_KINDS,
  SHARED_INTERACTION_DOMAINS,
  normalizeSharedInteractionDomain,
} from './contracts.js';
import { createEmptyOutputBundle, OUTPUT_BUNDLE_ARRAY_FIELDS } from './outputBundle.js';
import { createTransitionOutput } from './transitionOutput.js';
import { normalizeVisibilityScope, VISIBILITY_SCOPES } from './visibility.js';
import {
  assertNoPlayerHiddenData,
  projectForGmDev,
  projectForPlayer,
} from './visibilityBoundary.js';

export const OUTPUT_KINDS = Object.freeze({
  KNOWLEDGE: 'knowledge',
  OBJECTIVE: 'objective',
  HISTORY: 'history',
  LATEST_DEVELOPMENT: 'latest_development',
  STATE_WRITE: 'state_write',
  RELATIONSHIP_OR_SOCIAL_WRITE: 'relationship_or_social_write',
  TRANSITION: 'transition',
  COMPLETED_RECORD: 'completed_record',
  TRANSCRIPT: 'transcript',
  ARCHIVE_SEARCH: 'archive_search',
  DEBUG: 'debug',
});

const OUTPUT_KIND_VALUES = Object.freeze(Object.values(OUTPUT_KINDS));

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function optionalText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function optionalId(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    const text = cleanText(String(value));
    if (text) {
      return text;
    }
  }
  return null;
}

function normalizeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeOutputKind(value, fallback = null) {
  const normalized = cleanText(value).toLowerCase();
  return OUTPUT_KIND_VALUES.includes(normalized) ? normalized : fallback;
}

function objectHasContent(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function alias(input, snake, camel) {
  return input[snake] ?? input[camel];
}

export function createOutputProvenance(input = {}) {
  const outputKind = normalizeOutputKind(
    alias(input, 'output_kind', 'outputKind'),
    alias(input, 'output_kind', 'outputKind') ? null : null
  );
  return {
    interaction_domain:
      normalizeSharedInteractionDomain(alias(input, 'interaction_domain', 'interactionDomain')) ??
      SHARED_INTERACTION_DOMAINS.EXPLORATION,
    source_content_id: optionalId(alias(input, 'source_content_id', 'sourceContentId')),
    source_content_type: optionalText(alias(input, 'source_content_type', 'sourceContentType')),
    source_content_path: optionalText(alias(input, 'source_content_path', 'sourceContentPath')),
    source_scene_id: optionalId(alias(input, 'source_scene_id', 'sourceSceneId'), input.scene_id, input.sceneId),
    source_dialogue_id: optionalId(
      alias(input, 'source_dialogue_id', 'sourceDialogueId'),
      input.dialogue_id,
      input.dialogueId
    ),
    source_option_id: optionalId(alias(input, 'source_option_id', 'sourceOptionId'), input.option_id, input.optionId),
    source_option_kind: optionalText(alias(input, 'source_option_kind', 'sourceOptionKind')),
    source_branch_id: optionalId(alias(input, 'source_branch_id', 'sourceBranchId'), input.branch_id, input.branchId),
    resolution_id: optionalId(alias(input, 'resolution_id', 'resolutionId')),
    committed_action_id: optionalId(alias(input, 'committed_action_id', 'committedActionId')),
    committed_move_id: optionalId(alias(input, 'committed_move_id', 'committedMoveId')),
    request_id: optionalId(alias(input, 'request_id', 'requestId')),
    correlation_id: optionalId(alias(input, 'correlation_id', 'correlationId')),
    actor_id: optionalId(alias(input, 'actor_id', 'actorId')),
    character_id: optionalId(alias(input, 'character_id', 'characterId')),
    campaign_id: optionalId(alias(input, 'campaign_id', 'campaignId')),
    generated_at: optionalText(alias(input, 'generated_at', 'generatedAt')),
    output_kind: outputKind,
    output_id: optionalId(alias(input, 'output_id', 'outputId')),
    dedupe_key: optionalId(alias(input, 'dedupe_key', 'dedupeKey')),
    visibility_scope: normalizeVisibilityScope(
      alias(input, 'visibility_scope', 'visibilityScope'),
      VISIBILITY_SCOPES.SYSTEM_INTERNAL
    ),
    gm_dev_notes: optionalText(alias(input, 'gm_dev_notes', 'gmDevNotes')),
  };
}

export function buildOutputDedupeKey(input = {}) {
  const explicit = optionalId(alias(input, 'dedupe_key', 'dedupeKey'));
  if (explicit) {
    return explicit;
  }
  const outputKind =
    normalizeOutputKind(alias(input, 'output_kind', 'outputKind')) ??
    normalizeOutputKind(input.kind) ??
    'output';
  const outputId = optionalId(
    alias(input, 'output_id', 'outputId'),
    input.knowledge_id,
    input.knowledgeId,
    input.objective_id,
    input.objectiveId,
    input.event_id,
    input.eventId,
    input.record_id,
    input.recordId,
    input.transcript_id,
    input.transcriptId,
    input.archive_entry_id,
    input.archiveEntryId,
    input.state_key,
    input.stateKey,
    input.target_id,
    input.targetId
  );
  const source = optionalId(input.source_content_id, input.sourceContentId, input.source_option_id, input.sourceOptionId);
  return [outputKind, outputId, source].filter(Boolean).join(':') || null;
}

function withBaseOutput(input, outputKind, outputId) {
  const provenanceInput = normalizeObject(alias(input, 'provenance', 'provenance') ?? input.source);
  const dedupeKey = optionalId(alias(input, 'dedupe_key', 'dedupeKey')) ?? buildOutputDedupeKey({
    ...input,
    output_kind: outputKind,
    output_id: outputId,
  });
  return {
    output_kind: outputKind,
    output_id: outputId,
    dedupe_key: dedupeKey,
    player_visible: input.player_visible === true || input.playerVisible === true,
    provenance: createOutputProvenance({
      ...provenanceInput,
      output_kind: outputKind,
      output_id: outputId,
      dedupe_key: dedupeKey,
    }),
    visibility_metadata: {
      visibility_scope: normalizeVisibilityScope(
        input.visibility_metadata?.visibility_scope ??
          input.visibilityMetadata?.visibilityScope ??
          alias(input, 'visibility_scope', 'visibilityScope'),
        VISIBILITY_SCOPES.SYSTEM_INTERNAL
      ),
      ...normalizeObject(alias(input, 'visibility_metadata', 'visibilityMetadata')),
    },
  };
}

export function normalizeKnowledgeOutput(input = {}) {
  const knowledgeId = optionalId(input.knowledge_id, input.knowledgeId, input.id, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.KNOWLEDGE, knowledgeId),
    knowledge_id: knowledgeId,
    title: optionalText(input.title, input.label, input.name),
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary, input.text),
    status: optionalText(input.status, input.discovered_status, input.discoveredStatus) ?? 'discovered',
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeObjectiveOutput(input = {}) {
  const objectiveId = optionalId(input.objective_id, input.objectiveId, input.id, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.OBJECTIVE, objectiveId),
    objective_id: objectiveId,
    title: optionalText(input.title, input.label, input.name),
    status: optionalText(input.status, input.objective_status, input.objectiveStatus),
    progress: input.progress ?? input.progress_count ?? input.progressCount ?? null,
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary, input.text),
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeHistoryOutput(input = {}) {
  const eventId = optionalId(input.event_id, input.eventId, input.id, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.HISTORY, eventId),
    event_id: eventId,
    event_category: optionalText(input.event_category, input.eventCategory, input.category) ?? 'interaction',
    player_text: optionalText(input.player_text, input.playerText, input.text, input.summary),
    chronology: normalizeNumber(input.chronology ?? input.sequence ?? input.sort_order ?? input.sortOrder),
    occurred_at: optionalText(input.occurred_at, input.occurredAt),
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeLatestDevelopmentOutput(input = {}) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const outputId = optionalId(input.latest_development_id, input.latestDevelopmentId, input.id, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.LATEST_DEVELOPMENT, outputId),
    latest_development_id: outputId,
    player_text: optionalText(input.player_text, input.playerText, input.text, input.summary),
    update_mode: optionalText(input.update_mode, input.updateMode, input.mode) ?? 'replace',
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeStateWriteOutput(input = {}) {
  const stateKey = optionalId(input.state_key, input.stateKey, input.key, input.flag, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.STATE_WRITE, stateKey),
    state_key: stateKey,
    operation: optionalText(input.operation, input.op) ?? 'set',
    value: input.value ?? null,
    delta: normalizeNumber(input.delta),
    player_summary: optionalText(input.player_summary, input.playerSummary),
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeRelationshipOrSocialWriteOutput(input = {}) {
  const participantId = optionalId(
    input.participant_id,
    input.participantId,
    input.npc_id,
    input.npcId,
    input.actor_id,
    input.actorId
  );
  const stateKey = optionalId(input.state_key, input.stateKey, input.key, input.field, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.RELATIONSHIP_OR_SOCIAL_WRITE, [participantId, stateKey].filter(Boolean).join(':') || null),
    participant_id: participantId,
    state_key: stateKey,
    operation: optionalText(input.operation, input.op) ?? 'set',
    value: input.value ?? null,
    delta: normalizeNumber(input.delta),
    player_perception_summary: optionalText(
      input.player_perception_summary,
      input.playerPerceptionSummary,
      input.player_summary,
      input.playerSummary
    ),
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeTransitionOutput(input = {}) {
  const transition = createTransitionOutput(input);
  const outputId = optionalId(alias(input, 'output_id', 'outputId'), transition.target_id, transition.player_label);
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.TRANSITION, outputId),
    ...transition,
    output_kind: OUTPUT_KINDS.TRANSITION,
    output_id: outputId,
  };
}

export function normalizeCompletedRecordOutput(input = {}) {
  const recordId = optionalId(
    input.completed_interaction_id,
    input.completedInteractionId,
    input.record_id,
    input.recordId,
    input.id,
    alias(input, 'output_id', 'outputId')
  );
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.COMPLETED_RECORD, recordId),
    completed_interaction_id: recordId,
    interaction_domain:
      normalizeSharedInteractionDomain(alias(input, 'interaction_domain', 'interactionDomain')) ??
      SHARED_INTERACTION_DOMAINS.DIALOGUE,
    title: optionalText(input.title, input.label, input.name),
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary, input.text),
    archive_search_metadata: normalizeObject(alias(input, 'archive_search_metadata', 'archiveSearchMetadata')),
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeTranscriptOutput(input = {}) {
  const transcriptId = optionalId(input.transcript_id, input.transcriptId, input.id, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.TRANSCRIPT, transcriptId),
    transcript_id: transcriptId,
    dialogue_id: optionalId(input.dialogue_id, input.dialogueId),
    participant_ids: normalizeArray(input.participant_ids ?? input.participantIds).map(String),
    player_text: optionalText(input.player_text, input.playerText, input.text, input.summary),
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeArchiveSearchOutput(input = {}) {
  const archiveEntryId = optionalId(
    input.archive_entry_id,
    input.archiveEntryId,
    input.search_entry_id,
    input.searchEntryId,
    input.id,
    alias(input, 'output_id', 'outputId')
  );
  return {
    ...withBaseOutput(input, OUTPUT_KINDS.ARCHIVE_SEARCH, archiveEntryId),
    archive_entry_id: archiveEntryId,
    title: optionalText(input.title, input.label, input.name),
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary, input.snippet),
    tags: normalizeArray(input.tags).map(String),
    search_index_fields: normalizeObject(alias(input, 'search_index_fields', 'searchIndexFields')),
    gm_dev_details: normalizeObject(alias(input, 'gm_dev_details', 'gmDevDetails')),
  };
}

export function normalizeDebugOutput(input = {}) {
  const debugId = optionalId(input.debug_id, input.debugId, input.id, alias(input, 'output_id', 'outputId'));
  return {
    ...withBaseOutput(
      {
        ...input,
        visibility_scope: VISIBILITY_SCOPES.GM_DEV,
      },
      OUTPUT_KINDS.DEBUG,
      debugId
    ),
    debug_id: debugId,
    message: optionalText(input.message, input.summary),
    diagnostics: normalizeObject(input.diagnostics),
    validation_warnings: normalizeArray(input.validation_warnings ?? input.validationWarnings),
    dedupe_decisions: normalizeArray(input.dedupe_decisions ?? input.dedupeDecisions),
  };
}

export function normalizeOutputBundle(input = {}) {
  const bundle = createEmptyOutputBundle(input);
  return {
    ...bundle,
    player_result:
      input.player_result ?? input.playerResult ?? bundle.player_result ?? null,
    knowledge_outputs: normalizeArray(bundle.knowledge_outputs).map(normalizeKnowledgeOutput),
    objective_outputs: normalizeArray(bundle.objective_outputs).map(normalizeObjectiveOutput),
    history_outputs: normalizeArray(bundle.history_outputs).map(normalizeHistoryOutput),
    latest_development_output: input.latest_development_output || input.latestDevelopmentOutput
      ? normalizeLatestDevelopmentOutput(input.latest_development_output ?? input.latestDevelopmentOutput)
      : null,
    state_writes: normalizeArray(bundle.state_writes).map(normalizeStateWriteOutput),
    relationship_or_social_writes: normalizeArray(bundle.relationship_or_social_writes).map(
      normalizeRelationshipOrSocialWriteOutput
    ),
    transition_outputs: normalizeArray(bundle.transition_outputs).map(normalizeTransitionOutput),
    completed_record_outputs: normalizeArray(bundle.completed_record_outputs).map(normalizeCompletedRecordOutput),
    transcript_outputs: normalizeArray(bundle.transcript_outputs).map(normalizeTranscriptOutput),
    archive_search_outputs: normalizeArray(bundle.archive_search_outputs).map(normalizeArchiveSearchOutput),
    debug_outputs: normalizeArray(bundle.debug_outputs).map(normalizeDebugOutput),
  };
}

export function createOutputBundle(input = {}) {
  return normalizeOutputBundle(input);
}

export function mergeOutputBundles(...inputBundles) {
  const bundles = inputBundles.flat().filter(Boolean).map(normalizeOutputBundle);
  const merged = createEmptyOutputBundle();
  for (const bundle of bundles) {
    if (bundle.player_result !== null && bundle.player_result !== undefined) {
      merged.player_result = bundle.player_result;
    }
    if (bundle.latest_development_output !== null && bundle.latest_development_output !== undefined) {
      merged.latest_development_output = bundle.latest_development_output;
    }
    merged.visibility_metadata = {
      ...merged.visibility_metadata,
      ...normalizeObject(bundle.visibility_metadata),
    };
    for (const field of OUTPUT_BUNDLE_ARRAY_FIELDS) {
      merged[field] = [...normalizeArray(merged[field]), ...normalizeArray(bundle[field])];
    }
  }
  return normalizeOutputBundle(merged);
}

export function attachOutputBundleProvenance(bundleLike = {}, provenanceLike = {}) {
  const bundle = normalizeOutputBundle(bundleLike);
  const baseProvenance = createOutputProvenance(provenanceLike);
  const attach = (output) => {
    const provenance = createOutputProvenance({
      ...normalizeObject(output.provenance),
      ...baseProvenance,
      output_kind: output.output_kind,
      output_id: output.output_id,
      dedupe_key: output.dedupe_key,
    });
    return {
      ...output,
      provenance,
    };
  };
  const next = {
    ...bundle,
    latest_development_output: bundle.latest_development_output
      ? attach(bundle.latest_development_output)
      : null,
  };
  for (const field of OUTPUT_BUNDLE_ARRAY_FIELDS) {
    next[field] = normalizeArray(bundle[field]).map(attach);
  }
  return next;
}

export function hasPlayerVisibleOutputs(bundleLike = {}) {
  const bundle = normalizeOutputBundle(bundleLike);
  return Boolean(
    objectHasContent(bundle.player_result) ||
      bundle.knowledge_outputs.length > 0 ||
      bundle.objective_outputs.length > 0 ||
      bundle.history_outputs.length > 0 ||
      objectHasContent(bundle.latest_development_output) ||
      bundle.transition_outputs.some((entry) => entry.player_label || entry.player_summary) ||
      bundle.completed_record_outputs.length > 0 ||
      bundle.transcript_outputs.length > 0 ||
      bundle.archive_search_outputs.length > 0 ||
      bundle.state_writes.some((entry) => entry.player_summary) ||
      bundle.relationship_or_social_writes.some((entry) => entry.player_perception_summary)
  );
}

export function hasStateChangingOutputs(bundleLike = {}) {
  const bundle = normalizeOutputBundle(bundleLike);
  return bundle.state_writes.length > 0 || bundle.relationship_or_social_writes.length > 0;
}

export function hasTransitionOutputs(bundleLike = {}) {
  return normalizeOutputBundle(bundleLike).transition_outputs.length > 0;
}

export function hasCompletedRecordOutputs(bundleLike = {}) {
  return normalizeOutputBundle(bundleLike).completed_record_outputs.length > 0;
}

export function hasDebugOutputs(bundleLike = {}) {
  return normalizeOutputBundle(bundleLike).debug_outputs.length > 0;
}

function outputDedupeKey(output) {
  return optionalId(output.dedupe_key, output.dedupeKey) ?? buildOutputDedupeKey(output);
}

export function dedupeOutputsByKey(outputs = [], options = {}) {
  const preserveRepeats =
    options.preserve_repeats === true || options.preserveRepeats === true || options.preserve === true;
  if (preserveRepeats) {
    return {
      outputs: [...normalizeArray(outputs)],
      duplicates: [],
      decisions: [],
    };
  }
  const seen = new Map();
  const deduped = [];
  const duplicates = [];
  for (const output of normalizeArray(outputs)) {
    const key = outputDedupeKey(output);
    if (!key) {
      deduped.push(output);
      continue;
    }
    if (seen.has(key)) {
      const duplicate = {
        key,
        kept_index: seen.get(key),
        duplicate_index: deduped.length + duplicates.length,
        output,
      };
      duplicates.push(duplicate);
      continue;
    }
    seen.set(key, deduped.length);
    deduped.push(output);
  }
  return {
    outputs: deduped,
    duplicates,
    decisions: duplicates.map(summarizeDedupeDecisionForGmDev),
  };
}

function detectDuplicateById(existingOutputs = [], candidate = {}, idFields = []) {
  const candidateKey =
    outputDedupeKey(candidate) ??
    optionalId(...idFields.map((field) => candidate[field]));
  if (!candidateKey) {
    return { duplicate: false, key: null, existing_output: null };
  }
  const existing = normalizeArray(existingOutputs).find((output) => {
    const existingKey = outputDedupeKey(output) ?? optionalId(...idFields.map((field) => output[field]));
    return existingKey === candidateKey;
  });
  return {
    duplicate: Boolean(existing),
    key: candidateKey,
    existing_output: existing ?? null,
  };
}

export function detectDuplicateKnowledgeGrant(existingOutputs = [], candidate = {}) {
  return detectDuplicateById(existingOutputs, normalizeKnowledgeOutput(candidate), ['knowledge_id']);
}

export function detectDuplicateObjectiveProgress(existingOutputs = [], candidate = {}) {
  return detectDuplicateById(existingOutputs, normalizeObjectiveOutput(candidate), ['objective_id']);
}

export function detectDuplicateHistoryEvent(existingOutputs = [], candidate = {}) {
  return detectDuplicateById(existingOutputs, normalizeHistoryOutput(candidate), ['event_id']);
}

export function detectDuplicateCompletedRecord(existingOutputs = [], candidate = {}) {
  return detectDuplicateById(existingOutputs, normalizeCompletedRecordOutput(candidate), [
    'completed_interaction_id',
  ]);
}

export function detectDuplicateTranscriptEntry(existingOutputs = [], candidate = {}) {
  return detectDuplicateById(existingOutputs, normalizeTranscriptOutput(candidate), ['transcript_id']);
}

export function detectDuplicateArchiveSearchEntry(existingOutputs = [], candidate = {}) {
  return detectDuplicateById(existingOutputs, normalizeArchiveSearchOutput(candidate), ['archive_entry_id']);
}

export function summarizeDedupeDecisionForGmDev(decision = {}) {
  return {
    kind: 'output_dedupe',
    dedupe_key: optionalId(decision.key, decision.dedupe_key, decision.dedupeKey),
    kept_index: Number.isFinite(Number(decision.kept_index ?? decision.keptIndex))
      ? Number(decision.kept_index ?? decision.keptIndex)
      : null,
    duplicate_index: Number.isFinite(Number(decision.duplicate_index ?? decision.duplicateIndex))
      ? Number(decision.duplicate_index ?? decision.duplicateIndex)
      : null,
    action: 'dropped_duplicate',
    visibility_scope: VISIBILITY_SCOPES.GM_DEV,
  };
}

function addIssue(collection, code, path, message, severity = 'error') {
  collection.push({ code, path, message, severity });
}

function validateRequired(output, field, path, issues, strict) {
  if (!optionalId(output[field])) {
    addIssue(
      strict ? issues.errors : issues.warnings,
      'missing_required_field',
      `${path}.${field}`,
      `Output is missing required field ${field}`,
      strict ? 'error' : 'warning'
    );
  }
}

function validatePlayerVisibleOutput(output, path, issues, strict) {
  const visibilityScope = normalizeVisibilityScope(
    output.visibility_metadata?.visibility_scope ?? output.visibility_scope,
    VISIBILITY_SCOPES.SYSTEM_INTERNAL
  );
  const playerVisible = output.player_visible === true || visibilityScope === VISIBILITY_SCOPES.PLAYER;
  if (!playerVisible) {
    return;
  }
  if (objectHasContent(output.gm_dev_details)) {
    addIssue(
      strict ? issues.errors : issues.warnings,
      'player_visible_gm_dev_details',
      `${path}.gm_dev_details`,
      'Player-visible output cannot carry GM/dev details',
      strict ? 'error' : 'warning'
    );
  }
  if (
    output.provenance?.source_branch_id ||
    output.provenance?.source_content_path ||
    output.provenance?.gm_dev_notes
  ) {
    addIssue(
      strict ? issues.errors : issues.warnings,
      'player_visible_hidden_provenance',
      `${path}.provenance`,
      'Player-visible output cannot carry hidden provenance details',
      strict ? 'error' : 'warning'
    );
  }
  try {
    assertNoPlayerHiddenData(output);
  } catch (error) {
    addIssue(
      strict ? issues.errors : issues.warnings,
      'player_visible_hidden_data',
      path,
      error.message,
      strict ? 'error' : 'warning'
    );
  }
}

export function validateOutputBundle(bundleLike = {}, options = {}) {
  const strict = options.strict !== false;
  const bundle = normalizeOutputBundle(bundleLike);
  const issues = { errors: [], warnings: [] };

  for (const [field, requiredId] of [
    ['knowledge_outputs', 'knowledge_id'],
    ['objective_outputs', 'objective_id'],
    ['history_outputs', 'event_id'],
    ['state_writes', 'state_key'],
    ['relationship_or_social_writes', 'state_key'],
    ['completed_record_outputs', 'completed_interaction_id'],
    ['transcript_outputs', 'transcript_id'],
    ['archive_search_outputs', 'archive_entry_id'],
  ]) {
    bundle[field].forEach((output, index) => {
      const path = `$.${field}[${index}]`;
      validateRequired(output, requiredId, path, issues, strict);
      validatePlayerVisibleOutput(output, path, issues, strict);
    });
  }

  bundle.relationship_or_social_writes.forEach((output, index) => {
    validateRequired(output, 'participant_id', `$.relationship_or_social_writes[${index}]`, issues, strict);
  });

  bundle.transition_outputs.forEach((output, index) => {
    const path = `$.transition_outputs[${index}]`;
    validateRequired(output, 'status', path, issues, strict);
    validateRequired(output, 'target_type', path, issues, strict);
    if (output.target_type === 'none') {
      addIssue(
        strict ? issues.errors : issues.warnings,
        'invalid_transition_target',
        `${path}.target_type`,
        'Transition output must specify a valid target type or future-supported handoff type',
        strict ? 'error' : 'warning'
      );
    }
    validatePlayerVisibleOutput(output, path, issues, strict);
  });

  if (
    normalizeVisibilityScope(bundle.visibility_metadata?.visibility_scope, VISIBILITY_SCOPES.SYSTEM_INTERNAL) ===
      VISIBILITY_SCOPES.PLAYER &&
    bundle.debug_outputs.length > 0
  ) {
    addIssue(
      strict ? issues.errors : issues.warnings,
      'debug_outputs_in_player_bundle',
      '$.debug_outputs',
      'Player-visible output bundle cannot contain debug outputs',
      strict ? 'error' : 'warning'
    );
  }

  return {
    valid: issues.errors.length === 0,
    bundle,
    errors: issues.errors,
    warnings: issues.warnings,
  };
}

export function assertOutputBundleValid(bundleLike = {}, options = {}) {
  const result = validateOutputBundle(bundleLike, { ...options, strict: options.strict !== false });
  if (!result.valid) {
    const error = new Error(
      `Output bundle failed validation: ${result.errors
        .slice(0, 5)
        .map((entry) => `${entry.path} ${entry.message}`)
        .join('; ')}`
    );
    error.validation = result;
    throw error;
  }
  return result.bundle;
}

function safeOutput(output, allowedKeys) {
  const projected = {};
  for (const key of allowedKeys) {
    if (output[key] !== undefined && output[key] !== null) {
      projected[key] = output[key];
    }
  }
  return projectForPlayer(projected);
}

export function projectOutputBundleForPlayer(bundleLike = {}, options = {}) {
  const bundle = normalizeOutputBundle(bundleLike);
  const projected = {
    player_result: bundle.player_result === null ? null : projectForPlayer(bundle.player_result ?? {}),
    knowledge_outputs: bundle.knowledge_outputs.map((output) =>
      safeOutput(output, ['output_kind', 'knowledge_id', 'title', 'player_summary', 'status'])
    ),
    objective_outputs: bundle.objective_outputs.map((output) =>
      safeOutput(output, ['output_kind', 'objective_id', 'title', 'status', 'progress', 'player_summary'])
    ),
    history_outputs: bundle.history_outputs.map((output) =>
      safeOutput(output, ['output_kind', 'event_id', 'event_category', 'player_text', 'chronology', 'occurred_at'])
    ),
    latest_development_output: bundle.latest_development_output
      ? safeOutput(bundle.latest_development_output, [
          'output_kind',
          'latest_development_id',
          'player_text',
          'update_mode',
        ])
      : null,
    transition_outputs: bundle.transition_outputs.map((output) =>
      safeOutput(output, ['output_kind', 'player_label', 'player_summary'])
    ),
    completed_record_outputs: bundle.completed_record_outputs.map((output) =>
      safeOutput(output, [
        'output_kind',
        'completed_interaction_id',
        'interaction_domain',
        'title',
        'player_summary',
      ])
    ),
    transcript_outputs: bundle.transcript_outputs.map((output) =>
      safeOutput(output, ['output_kind', 'transcript_id', 'dialogue_id', 'player_text'])
    ),
    archive_search_outputs: bundle.archive_search_outputs.map((output) =>
      safeOutput(output, ['output_kind', 'archive_entry_id', 'title', 'player_summary', 'tags'])
    ),
  };
  if (options.include_safe_state_summaries === true || options.includeSafeStateSummaries === true) {
    projected.state_summaries = bundle.state_writes
      .map((output) => output.player_summary)
      .filter(Boolean)
      .map((text) => ({ player_summary: text }));
    projected.relationship_or_social_summaries = bundle.relationship_or_social_writes
      .map((output) => output.player_perception_summary)
      .filter(Boolean)
      .map((text) => ({ player_perception_summary: text }));
  }
  return projected;
}

export function projectOutputBundleForGmDev(bundleLike = {}, options = {}) {
  return projectForGmDev(normalizeOutputBundle(bundleLike), options);
}

export function assertOutputBundlePlayerSafe(bundleLike = {}, options = {}) {
  const projected = projectOutputBundleForPlayer(bundleLike, options);
  assertNoPlayerHiddenData(projected, options);
  return true;
}

export function createExplorationOutputBundle(input = {}) {
  return attachOutputBundleProvenance(createOutputBundle(input), {
    interaction_domain: SHARED_INTERACTION_DOMAINS.EXPLORATION,
    source_option_kind: input.source_option_kind ?? input.sourceOptionKind ?? INTERACTION_OPTION_KINDS.COMMITTED_ACTION,
    ...(input.provenance ?? {}),
  });
}

export function projectExplorationOutputBundleForPlayer(bundleLike = {}, options = {}) {
  return projectOutputBundleForPlayer(bundleLike, options);
}

export function projectExplorationOutputBundleForGmDev(bundleLike = {}, options = {}) {
  return projectOutputBundleForGmDev(bundleLike, options);
}

export const explorationOutputAdapter = Object.freeze({
  createBundle: createExplorationOutputBundle,
  projectForPlayer: projectExplorationOutputBundleForPlayer,
  projectForGmDev: projectExplorationOutputBundleForGmDev,
});

export function createDialogueOutputBundle(input = {}) {
  return attachOutputBundleProvenance(createOutputBundle(input), {
    interaction_domain: SHARED_INTERACTION_DOMAINS.DIALOGUE,
    source_option_kind: input.source_option_kind ?? input.sourceOptionKind ?? INTERACTION_OPTION_KINDS.COMMITTED_ACTION,
    ...(input.provenance ?? {}),
  });
}

export function projectDialogueOutputBundleForPlayer(bundleLike = {}, options = {}) {
  return projectOutputBundleForPlayer(bundleLike, options);
}

export function projectDialogueOutputBundleForGmDev(bundleLike = {}, options = {}) {
  return projectOutputBundleForGmDev(bundleLike, options);
}

export const dialogueOutputAdapter = Object.freeze({
  createBundle: createDialogueOutputBundle,
  projectForPlayer: projectDialogueOutputBundleForPlayer,
  projectForGmDev: projectDialogueOutputBundleForGmDev,
});
