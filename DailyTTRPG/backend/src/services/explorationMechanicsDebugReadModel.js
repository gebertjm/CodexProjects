import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { ensureActionComposerSchema } from './actionComposerSchema.js';
import { getCharacterSceneView } from './characterSceneViewService.js';
import { ensureExplorationInteractionSchema } from './explorationInteractionSchema.js';
import { getExplorationInteractionDefinitions } from './freeFocusService.js';
import { ensurePlayerBeatResultSchema } from './playerBeatResultService.js';
import { getSceneContentOverlay } from './sceneContentOverlayService.js';

const notRecorded = 'not_recorded';
const futureSupported = 'future_supported';
const notAvailable = 'not_available';
const notApplicable = 'not_applicable';
const instrumentationStatuses = new Set([
  'available',
  'partial',
  notRecorded,
  notApplicable,
  futureSupported,
]);

export const explorationCheckDebugFields = [
  'check_id',
  'source_type',
  'source_id',
  'source_label',
  'requires_check',
  'check_kind',
  'ability',
  'skill',
  'tool',
  'dc',
  'dc_visibility',
  'dc_player_visible',
  'roll_mode',
  'passive_score_used',
  'base_modifier',
  'proficiency_bonus',
  'feature_bonus',
  'environment_modifiers',
  'state_modifiers',
  'item_modifiers',
  'advantage_sources',
  'disadvantage_sources',
  'assistance_sources',
  'final_modifier',
  'raw_roll',
  'total_result',
  'result_band',
  'branch_id',
  'outcome_classification',
  'player_visible_summary',
  'gm_debug_summary',
  'instrumentation_status',
];

export const explorationResultBandDebugFields = [
  'source_type',
  'source_id',
  'band_id',
  'band_label',
  'classification',
  'threshold',
  'dc_range',
  'selected',
  'selection_reason',
  'player_facing_text',
  'gm_notes',
  'state_mutations',
  'knowledge_grants',
  'history_events',
  'objective_updates',
  'transition_rules',
  'validation_status',
  'instrumentation_status',
];

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function idText(value) {
  return value === undefined || value === null ? null : String(value);
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugText(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function titleCase(value) {
  return cleanText(value)
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function textFrom(value) {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  const object = normalizeObject(value);
  return cleanText(
    object.text ??
      object.narration ??
      object.description ??
      object.summary ??
      object.result_summary ??
      object.label ??
      object.title
  );
}

function toJsonSafe(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]));
  }
  return value;
}

function definitionId(definition, fallbackPrefix = 'interaction') {
  return cleanText(
    definition?.interaction_id ??
      definition?.interactionId ??
      definition?.id ??
      definition?.key ??
      definition?.slug ??
      `${fallbackPrefix}_${slugText(definition?.label ?? definition?.target_id ?? 'scene')}`
  );
}

function targetId(definition) {
  return cleanText(
    definition?.target_id ??
      definition?.targetId ??
      definition?.affordance_id ??
      definition?.target_affordance_id
  );
}

function labelForDefinition(definition, fallback = 'Interaction') {
  return cleanText(definition?.label ?? definition?.target_label ?? definition?.title ?? definition?.name) || fallback;
}

function visibilityObject(definition) {
  return normalizeObject(definition?.visibility ?? definition?.availability ?? definition?.requirements);
}

function authoredRequirements(definition) {
  const visibility = visibilityObject(definition);
  return {
    requires: normalizeArray(visibility.requires ?? definition?.requires ?? definition?.requires_knowledge),
    forbidden: normalizeArray(visibility.forbidden ?? definition?.forbidden),
    hidden: definition?.hidden === true || visibility.hidden === true,
    always_visible: visibility.always_visible === true,
  };
}

function checkDefinition(definition, fallbackVisibility = 'visible') {
  const check = normalizeObject(definition?.check);
  if (Object.keys(check).length === 0 && definition?.requires_check !== true) {
    return null;
  }
  const skill = cleanText(check.skill ?? definition?.skill);
  const ability = cleanText(check.ability ?? definition?.ability);
  const dc = numberOrNull(check.dc ?? check.difficulty_class ?? definition?.dc ?? definition?.difficulty_class);
  return {
    requires_check: true,
    check_kind: cleanText(check.kind ?? check.check_kind ?? definition?.check_kind) || 'skill_check',
    mode: cleanText(check.mode ?? definition?.check_mode) || 'standard',
    ability: ability || null,
    skill: skill || null,
    tool: cleanText(check.tool ?? definition?.tool) || null,
    dc,
    dc_visibility: cleanText(check.dc_visibility ?? definition?.dc_visibility) || 'gm_only',
    check_visibility: cleanText(check.visibility ?? definition?.check_visibility) || fallbackVisibility,
    assistance: textFrom(check.assistance ?? definition?.assistance),
    raw: Object.keys(check).length > 0 ? check : null,
  };
}

function normalizeClassification(value, fallback = 'unknown') {
  const normalized = cleanText(value).toLowerCase();
  if (['success', 'partial', 'failure', 'no_check', 'fallback', 'unknown'].includes(normalized)) {
    return normalized;
  }
  if (['fail', 'failed'].includes(normalized)) {
    return 'failure';
  }
  if (['succeed', 'succeeded'].includes(normalized)) {
    return 'success';
  }
  return fallback;
}

function thresholdForBand(band) {
  return (
    band?.threshold ??
    band?.min_total ??
    band?.minimum_total ??
    band?.dc ??
    band?.difficulty_class ??
    band?.range ??
    null
  );
}

function dcRangeForBand(band) {
  return band?.dc_range ?? band?.range ?? band?.threshold_range ?? null;
}

function dcPlayerVisible(check) {
  const visibility = cleanText(check?.dc_visibility).toLowerCase();
  return visibility === 'visible' || check?.show_dc === true || check?.dc_player_visible === true;
}

function resultBandCore({
  band = {},
  bandId,
  classification,
  fallbackLabel,
  instrumentationStatus = 'partial',
}) {
  const resolvedBandId = cleanText(bandId ?? band.id ?? band.band_id ?? band.key) || 'band';
  const playerText = textFrom(band);
  const gmNotes = textFrom(band.gm_notes ?? band.debug_notes ?? band.gm_dev_notes);
  return {
    band_id: resolvedBandId,
    band_label: cleanText(band.label ?? band.title ?? fallbackLabel) || titleCase(resolvedBandId),
    classification: normalizeClassification(classification ?? band.classification ?? band.result ?? band.band),
    threshold: thresholdForBand(band),
    dc_range: dcRangeForBand(band),
    player_facing_text: playerText || null,
    player_facing_text_summary: playerText || null,
    gm_notes: gmNotes || null,
    gm_dev_notes: gmNotes || null,
    validation_status: 'ok',
    instrumentation_status: instrumentationStatuses.has(instrumentationStatus)
      ? instrumentationStatus
      : 'partial',
    raw: band,
  };
}

function resultBranches(definition) {
  const branches = [];
  const noCheck = normalizeObject(definition?.result);
  if (Object.keys(noCheck).length > 0 || cleanText(definition?.narration)) {
    branches.push(resultBandCore({
      band: noCheck,
      bandId: cleanText(noCheck.id ?? noCheck.branch_id) || 'no_check',
      classification: 'no_check',
      fallbackLabel: 'No check',
      instrumentationStatus: 'partial',
    }));
  }

  const success = normalizeObject(definition?.on_success);
  if (Object.keys(success).length > 0) {
    branches.push(resultBandCore({
      band: success,
      bandId: cleanText(success.id ?? success.branch_id) || 'success',
      classification: 'success',
      fallbackLabel: 'Success',
      instrumentationStatus: 'partial',
    }));
  }

  const partial = normalizeObject(definition?.on_partial ?? definition?.partial);
  if (Object.keys(partial).length > 0) {
    branches.push(resultBandCore({
      band: partial,
      bandId: cleanText(partial.id ?? partial.branch_id) || 'partial',
      classification: 'partial',
      fallbackLabel: 'Partial',
      instrumentationStatus: 'partial',
    }));
  }

  const failure = normalizeObject(definition?.on_failure);
  if (Object.keys(failure).length > 0) {
    branches.push(resultBandCore({
      band: failure,
      bandId: cleanText(failure.id ?? failure.branch_id) || 'failure',
      classification: 'failure',
      fallbackLabel: 'Failure',
      instrumentationStatus: 'partial',
    }));
  }

  for (const band of normalizeArray(definition?.result_bands ?? definition?.resultBands)) {
    branches.push(resultBandCore({
      band,
      bandId: cleanText(band.id ?? band.band_id ?? band.key) || 'band',
      classification: band.classification ?? band.result ?? band.band,
      fallbackLabel: 'Result band',
      instrumentationStatus: 'partial',
    }));
  }

  return branches;
}

function dbResultBands(row) {
  const bands = normalizeArray(row?.result_bands_json ?? row?.result_bands);
  return bands.map((band) =>
    resultBandCore({
      band,
      bandId: cleanText(band.id ?? band.band_id ?? band.key) || 'band',
      classification: band.classification ?? band.result ?? band.band,
      fallbackLabel: row?.label ?? 'Scene interaction result band',
      instrumentationStatus: 'partial',
    })
  );
}

function indexByInteraction(rows) {
  const byInteraction = new Map();
  for (const row of rows) {
    const interactionId = cleanText(row.interaction_id);
    if (!interactionId) {
      continue;
    }
    if (!byInteraction.has(interactionId)) {
      byInteraction.set(interactionId, []);
    }
    byInteraction.get(interactionId).push(row);
  }
  return byInteraction;
}

function latestRow(rows) {
  return normalizeArray(rows)[0] ?? null;
}

function checkOutcomeFromRow(row) {
  const check = normalizeObject(row?.check_result_json);
  if (!row || Object.keys(check).length === 0) {
    return null;
  }
  const total = numberOrNull(check.total_value ?? check.total_result ?? check.check_total);
  const roll = numberOrNull(check.roll_value ?? check.raw_roll);
  return {
    was_success: check.was_success === true,
    result_status: check.was_success === true ? 'succeeded' : 'failed',
    check_mode: cleanText(check.check_mode ?? check.mode) || null,
    check_visibility: cleanText(row.check_visibility ?? check.check_visibility) || null,
    raw_roll: roll,
    total_result: total,
    skill: cleanText(check.skill?.slug ?? check.skill_slug ?? check.skill) || null,
    ability: cleanText(check.ability_key ?? check.ability) || null,
    skill_modifier: numberOrNull(check.skill_modifier),
    ability_modifier: numberOrNull(check.ability_modifier),
    proficiency_bonus: numberOrNull(check.proficiency_bonus),
    raw: check,
  };
}

function checkDetailFromDefinition({
  sourceType,
  sourceId,
  definition,
  row = null,
  fallbackVisibility = 'visible',
}) {
  const check = checkDefinition(definition, fallbackVisibility);
  const outcome = checkOutcomeFromRow(row);
  const sourceLabel = labelForDefinition(definition, titleCase(sourceType));
  if (!check && !outcome) {
    return {
      check_id: `${sourceType}:${sourceId}:no_check`,
      source_type: sourceType,
      source_id: sourceId,
      source_label: sourceLabel,
      requires_check: false,
      check_kind: 'no_check',
      ability: null,
      skill: null,
      tool: null,
      dc: null,
      dc_visibility: null,
      dc_player_visible: false,
      roll_mode: null,
      passive_score_used: null,
      base_modifier: null,
      proficiency_bonus: null,
      feature_bonus: null,
      environment_modifiers: [],
      state_modifiers: [],
      item_modifiers: [],
      advantage_sources: [],
      disadvantage_sources: [],
      assistance_sources: [],
      final_modifier: null,
      raw_roll: null,
      total_result: null,
      result_band: 'no_check',
      branch_id: null,
      outcome_classification: 'no_check',
      player_visible_summary: null,
      gm_debug_summary: 'This authored source does not require a check.',
      instrumentation_status: notApplicable,
    };
  }

  const status = outcome
    ? 'available'
    : check
      ? 'partial'
      : notRecorded;
  const assistance = cleanText(check?.assistance);
  return {
    check_id: `${sourceType}:${sourceId}:${check?.skill ?? outcome?.skill ?? 'check'}`,
    source_type: sourceType,
    source_id: sourceId,
    source_label: sourceLabel,
    requires_check: true,
    check_kind: check?.check_kind ?? 'skill_check',
    ability: check?.ability ?? outcome?.ability ?? null,
    skill: check?.skill ?? outcome?.skill ?? null,
    tool: check?.tool ?? null,
    dc: check?.dc ?? null,
    dc_visibility: check?.dc_visibility ?? 'gm_only',
    dc_player_visible: dcPlayerVisible(check),
    roll_mode: check?.mode ?? outcome?.check_mode ?? null,
    passive_score_used: outcome?.check_mode === 'passive' ? outcome.total_result : null,
    base_modifier: outcome?.skill_modifier ?? null,
    proficiency_bonus: outcome?.proficiency_bonus ?? null,
    feature_bonus: null,
    environment_modifiers: [],
    state_modifiers: [],
    item_modifiers: [],
    advantage_sources: [],
    disadvantage_sources: [],
    assistance_sources: assistance ? [{ source_type: 'authored_assistance', label: assistance }] : [],
    final_modifier: outcome?.skill_modifier ?? null,
    raw_roll: outcome?.raw_roll ?? null,
    total_result: outcome?.total_result ?? null,
    result_band: row?.status ?? outcome?.result_status ?? null,
    branch_id: outcome?.was_success === true ? 'on_success' : outcome ? 'on_failure' : null,
    outcome_classification: outcome?.was_success === true ? 'success' : outcome ? 'failure' : null,
    player_visible_summary:
      check?.check_visibility === 'hidden'
        ? null
        : cleanText(
            outcome
              ? `${titleCase(check?.skill ?? outcome.skill ?? 'Check')}: ${outcome.result_status}`
              : `${titleCase(check?.skill ?? 'Check')} check`
          ),
    gm_debug_summary: outcome
      ? `${titleCase(check?.skill ?? outcome.skill ?? 'Check')} ${outcome.result_status}; total ${
          outcome.total_result ?? 'not recorded'
        } vs DC ${check?.dc ?? 'not authored'}`
      : `${titleCase(check?.skill ?? 'Check')} check is authored; roll/result instrumentation has not been recorded yet.`,
    instrumentation_status: status,
  };
}

function outputsFromResultBranch(branch) {
  const object = normalizeObject(branch);
  return {
    knowledge_grants: normalizeArray(object.knowledge_grants ?? object.knowledge ?? object.knowledge_outputs),
    history_events: normalizeArray(object.history_events ?? object.history_outputs ?? object.canonical_events),
    state_changes: normalizeArray(object.state_changes ?? object.state_writes),
    objective_updates: normalizeArray(object.objective_updates ?? object.objectives),
    transitions: normalizeArray(object.transitions ?? object.transition_rules),
  };
}

function outputSummaryFromBand(band) {
  const outputs = outputsFromResultBranch(band.raw ?? band);
  return {
    state_mutations: outputs.state_changes,
    knowledge_grants: outputs.knowledge_grants,
    history_events: outputs.history_events,
    objective_updates: outputs.objective_updates,
    transition_rules: outputs.transitions,
    state_mutations_summary: outputs.state_changes,
    knowledge_grants_summary: outputs.knowledge_grants,
    history_events_summary: outputs.history_events,
    objective_updates_summary: outputs.objective_updates,
    transition_rules_summary: outputs.transitions,
  };
}

function instrumentationStatus(value, fallback = 'partial') {
  const status = cleanText(value);
  return instrumentationStatuses.has(status) ? status : fallback;
}

function fieldPath(value) {
  return cleanText(value?.key ?? value?.path ?? value?.state_key ?? value?.field ?? value?.id ?? value);
}

function inferDependencyScope(value) {
  const text = cleanText(value).toLowerCase();
  if (text.includes('knowledge') || text.includes('fact') || text.includes('clue')) {
    return 'character_knowledge';
  }
  if (text.includes('objective')) {
    return 'objective';
  }
  if (text.includes('npc')) {
    return 'npc';
  }
  if (text.includes('location')) {
    return 'location';
  }
  if (text.includes('environment') || text.includes('weather') || text.includes('light')) {
    return 'environment';
  }
  if (text.includes('affordance')) {
    return 'affordance';
  }
  if (text.includes('campaign')) {
    return 'campaign';
  }
  if (text.includes('world')) {
    return 'world';
  }
  return 'scene';
}

function affectsForSourceType(sourceType) {
  if (sourceType === 'passive_discovery') {
    return ['visibility', 'scene_surface'];
  }
  if (sourceType === 'free_focus') {
    return ['visibility', 'availability', 'check', 'output'];
  }
  if (sourceType === 'beat_action') {
    return ['availability', 'check', 'result_band', 'transition', 'output'];
  }
  return ['availability'];
}

function relatedIdsForSourceType(sourceType, sourceId) {
  return {
    related_free_focus_id: sourceType === 'free_focus' ? sourceId : null,
    related_beat_action_id: sourceType === 'beat_action' ? sourceId : null,
    related_result_band_id: null,
    related_transition_id: null,
  };
}

function isPlayerFacing(value) {
  if (value === true) {
    return true;
  }
  const text = cleanText(value).toLowerCase();
  return ['player_facing', 'canonical', 'visible', 'available_if_conditions_met', 'knowledge_grant_authored'].some(
    (token) => text.includes(token)
  );
}

function isHiddenDebug(value) {
  if (value === true) {
    return true;
  }
  const text = cleanText(value).toLowerCase();
  return ['hidden', 'debug', 'gm_dev', 'not_player_facing'].some((token) => text.includes(token));
}

function mapDefinitionsToStateReads(definitions, sourceType) {
  return normalizeArray(definitions).flatMap((definition) => {
    const requirements = authoredRequirements(definition);
    const sourceId = definitionId(definition, sourceType);
    const reads = [];
    for (const [index, requirement] of requirements.requires.entries()) {
      const keyOrPath = fieldPath(requirement);
      reads.push({
        read_id: `${sourceType}:${sourceId}:requires:${index}`,
        source_type: sourceType,
        source_id: sourceId,
        scope: inferDependencyScope(keyOrPath),
        key_or_path: keyOrPath,
        key_path: keyOrPath,
        expected_value_or_condition: requirement,
        actual_value: null,
        read_kind: 'authored_dependency',
        read_type: 'authored_dependency',
        value: null,
        audit_record_id: null,
        affects: affectsForSourceType(sourceType),
        player_facing: false,
        hidden_debug: true,
        player_facing_status: 'not_player_facing',
        hidden_debug_status: requirements.hidden ? 'hidden_requirement' : 'authored_requirement',
        ...relatedIdsForSourceType(sourceType, sourceId),
        instrumentation_status: 'partial',
      });
    }
    for (const [index, requirement] of requirements.forbidden.entries()) {
      const keyOrPath = fieldPath(requirement);
      reads.push({
        read_id: `${sourceType}:${sourceId}:forbidden:${index}`,
        source_type: sourceType,
        source_id: sourceId,
        scope: inferDependencyScope(keyOrPath),
        key_or_path: keyOrPath,
        key_path: keyOrPath,
        expected_value_or_condition: { forbidden: requirement },
        actual_value: null,
        read_kind: 'authored_dependency',
        read_type: 'authored_forbidden_dependency',
        value: null,
        audit_record_id: null,
        affects: affectsForSourceType(sourceType),
        player_facing: false,
        hidden_debug: true,
        player_facing_status: 'not_player_facing',
        hidden_debug_status: requirements.hidden ? 'hidden_requirement' : 'authored_requirement',
        ...relatedIdsForSourceType(sourceType, sourceId),
        instrumentation_status: 'partial',
      });
    }
    return reads.filter((read) => read.key_or_path);
  });
}

async function requireExplorationMechanicsDebugCapability(accountId, executor) {
  const result = await executor.query(
    `
      SELECT COALESCE(can_advance_beats, FALSE) AS can_advance_beats
      FROM account
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );
  if (result.rows[0]?.can_advance_beats !== true) {
    throw createHttpError('This account is not authorized to view exploration mechanics data.', 403);
  }
}

async function safeRows(executor, sql, params, debugNotices, code) {
  try {
    const result = await executor.query(sql, params);
    return result.rows ?? [];
  } catch (error) {
    debugNotices.push({
      code,
      message: 'Optional exploration mechanics data could not be loaded.',
      detail: cleanText(error.message),
    });
    return [];
  }
}

async function loadSceneInteractions(sceneId, executor, debugNotices) {
  if (!sceneId) {
    return [];
  }
  return safeRows(
    executor,
    `
      SELECT interaction.*, skill.slug AS skill_slug, skill.name AS skill_name
      FROM dnd5e_scene_interaction interaction
      LEFT JOIN dnd5e_skill skill ON skill.id = interaction.skill_id
      WHERE interaction.scene_id = $1
        AND interaction.is_active = TRUE
      ORDER BY interaction.sort_order ASC NULLS LAST, interaction.id ASC
    `,
    [sceneId],
    debugNotices,
    'scene_interaction_query_unavailable'
  );
}

async function loadSceneTransitions(sceneId, executor, debugNotices) {
  if (!sceneId) {
    return [];
  }
  return safeRows(
    executor,
    `
      SELECT transition.*, target.key AS target_scene_key, target.name AS target_scene_name
      FROM dnd5e_scene_transition transition
      LEFT JOIN dnd5e_scene target ON target.id = transition.to_scene_id
      WHERE transition.from_scene_id = $1
      ORDER BY transition.sort_order ASC NULLS LAST, transition.id ASC
    `,
    [sceneId],
    debugNotices,
    'scene_transition_query_unavailable'
  );
}

async function loadExplorationResultRows({ campaignId, worldInstanceId, characterId, sceneId }, executor, debugNotices) {
  if (!campaignId || !characterId || !sceneId) {
    return [];
  }
  return safeRows(
    executor,
    `
      SELECT *
      FROM dnd5e_character_exploration_interaction_result
      WHERE campaign_id = $1
        AND character_id = $2
        AND scene_id = $3
        AND ($4::bigint IS NULL OR world_instance_id = $4)
      ORDER BY resolved_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    `,
    [campaignId, characterId, sceneId, worldInstanceId],
    debugNotices,
    'exploration_result_query_unavailable'
  );
}

async function loadSubmittedAction(actionWindowId, characterId, executor, debugNotices) {
  if (!actionWindowId || !characterId) {
    return null;
  }
  const rows = await safeRows(
    executor,
    `
      SELECT *
      FROM dnd5e_web_action_submission
      WHERE action_window_id = $1
        AND character_id = $2
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [actionWindowId, characterId],
    debugNotices,
    'web_action_submission_query_unavailable'
  );
  return rows[0] ?? null;
}

async function loadBeatResults({ campaignId, characterId, sceneId }, executor, debugNotices) {
  if (!campaignId || !characterId) {
    return [];
  }
  return safeRows(
    executor,
    `
      SELECT *
      FROM dnd5e_player_beat_result
      WHERE campaign_id = $1
        AND character_id = $2
        AND ($3::bigint IS NULL OR scene_id = $3)
      ORDER BY resolved_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
      LIMIT 10
    `,
    [campaignId, characterId, sceneId],
    debugNotices,
    'player_beat_result_query_unavailable'
  );
}

function emptySections(debugNotices = []) {
  return {
    scene_state: null,
    surface_context: null,
    passive_discoveries: [],
    free_focus_items: [],
    beat_action_options: [],
    submitted_action: null,
    preview_mapping: null,
    check_details: [],
    result_bands: [],
    environment_modifiers: [],
    npc_presence: [],
    state_reads: [],
    state_writes: [],
    knowledge_outputs: [],
    history_outputs: [],
    transitions: [],
    audit_timeline: [],
    validation: {
      hard_errors: [],
      warnings: [],
      debug_notices: debugNotices,
    },
    visibility_boundaries: {
      includes_hidden_dc: true,
      includes_debug_mapping: true,
      includes_check_debug_breakdown: true,
      includes_modifier_breakdown: true,
      includes_raw_state_reads: true,
      includes_raw_state_writes: true,
      includes_raw_state_outputs: true,
      includes_hidden_requirements: true,
      includes_hidden_npc_schedule_data: false,
      includes_audit_records: true,
      includes_result_band_internals: true,
      includes_environment_debug: true,
      includes_hidden_environment_details: true,
      includes_npc_schedule_debug: false,
      includes_hidden_npc_identity: false,
      includes_state_dependencies: true,
      includes_hidden_knowledge_outputs: true,
      includes_history_output_internals: true,
      includes_hidden_transition_requirements: true,
      includes_audit_timeline: true,
      player_endpoint_exclusion_confirmed: true,
      player_dc_policy: 'Hidden DCs remain GM/dev-only unless content explicitly authors a player-visible DC.',
      player_roll_policy: 'Raw rolls and modifier breakdowns are not returned by normal player scene endpoints.',
      player_result_band_policy:
        'Authored result band internals, thresholds, GM notes, and instrumentation status are GM/dev-only.',
      notes: [
        'This payload is available only through the GM/dev endpoint and is not merged into player-facing scene read models.',
      ],
    },
  };
}

function mapSceneState(view, sceneRows, transitionRows) {
  const actionWindow = view.action_window ?? null;
  const actionStatus = view.action_status ?? {};
  const debug = normalizeObject(view.debug);
  const npcPresenceDebug = normalizeObject(debug.npc_presence);
  return {
    world_instance_id: idText(view.world_instance_id),
    campaign_id: idText(view.campaign_instance_id ?? view.campaign?.campaign_id),
    character_id: idText(view.character_id ?? view.active_character?.character_id),
    location_id: idText(view.scene?.location_id),
    scene_id: idText(view.scene?.scene_id ?? view.scene?.id),
    scene_slug: cleanText(view.scene?.key ?? view.scene?.slug),
    scene_instance_id: idText(view.scene_state_summary?.scene_instance_id) ?? idText(view.scene?.scene_instance_id),
    current_beat_id: idText(actionWindow?.beat_id ?? actionWindow?.current_beat_id),
    current_action_window_id: idText(actionWindow?.action_window_id ?? actionStatus.action_window_id),
    action_window_status: cleanText(actionWindow?.status ?? actionStatus.state) || null,
    current_objective: view.current_objective ?? view.objective ?? null,
    current_scene_surface_reference: {
      scene_narration_status: cleanText(view.scene_narration?.status) || 'assembled',
      has_scene_narration: Boolean(view.scene_narration),
    },
    latest_result_reference: view.scene_result_feed?.latest_development ?? view.recent_summary ?? null,
    current_available_affordances_count: normalizeArray(view.visible_affordances).length,
    current_exits_transitions_count: transitionRows.length,
    environment_context_reference: view.environment ?? null,
    visible_npc_count: normalizeArray(view.visible_npcs).length,
    known_relevant_absent_npc_count: normalizeArray(view.known_relevant_npcs).length,
    hidden_scene_state_keys: Object.keys(normalizeObject(debug.scene_state)),
    hidden_affordance_count: Math.max(Number(debug.authored_affordance_count ?? sceneRows.length) - normalizeArray(view.visible_affordances).length, 0),
    unmet_requirement_summaries: [],
    unavailable_exit_count: transitionRows.filter((row) => row.is_active === false).length,
    debug_state_flags: debug.scene_state ?? {},
    runtime_selection_reason: debug.runtime_state?.selection_reason ?? null,
  };
}

function mapSurfaceContext(view, definitions, overlay) {
  const debug = normalizeObject(view.debug);
  const sourceBreakdown = normalizeObject(debug.environment_source_breakdown);
  return {
    base_authored_scene_description: view.scene?.description ?? null,
    overlay_scene_key: cleanText(overlay?.key ?? overlay?.slug ?? overlay?.scene_id) || null,
    interaction_model: definitions.interaction_model,
    automatic_observations: normalizeArray(definitions.automatic_observations).map((definition) => ({
      id: definitionId(definition, 'automatic_observation'),
      label: labelForDefinition(definition, 'Automatic observation'),
      text_summary: textFrom(definition),
      grants_knowledge: normalizeArray(definition.knowledge_grants).length > 0,
      emits_canonical_event: definition.emit_canonical_event === true || normalizeArray(definition.history_events).length > 0,
    })),
    passive_discovery_count: normalizeArray(definitions.passive_discoveries).length,
    free_focus_count: normalizeArray(definitions.free_focus).length,
    environment_overlays_applied: sourceBreakdown.overlays ?? sourceBreakdown.environment_overlays ?? [],
    selected_weighted_flavor_references: normalizeArray(debug.description_components).map((component) => ({
      key: component.key ?? component.id ?? null,
      source: component.source ?? component.type ?? null,
      text_summary: textFrom(component),
    })),
    reuse_cooldown_information: debug.environment_description_debug?.reuse_cooldown ?? notRecorded,
    time_weather_season_light_inputs: {
      time_of_day: view.environment?.time_of_day ?? null,
      weather: view.environment?.weather ?? null,
      season: view.environment?.season ?? null,
      light: view.environment?.light ?? view.environment?.visibility ?? null,
    },
    npc_presence_contributions: normalizeArray(view.visible_npcs).map((npc) => ({
      npc_id: idText(npc.npc_id ?? npc.id),
      name: npc.name ?? npc.display_name ?? null,
      contribution: npc.scene_contribution ?? npc.presence_note ?? null,
    })),
    character_knowledge_filter_summary: {
      known_fact_count: normalizeArray(view.known_facts).length,
      knowledge_count_debug: debug.knowledge_count ?? null,
    },
    state_based_description_variants: debug.description_components ?? [],
    hidden_vs_player_visible_surface_differences: debug.environment_description_debug ?? notRecorded,
  };
}

function mapPassiveDiscoveries(definitions, rowsByInteraction) {
  return normalizeArray(definitions).map((definition) => {
    const id = definitionId(definition, 'passive_discovery');
    const row = latestRow(rowsByInteraction.get(id));
    const check = checkDefinition({ ...definition, resolution_mode: 'passive_discovery' }, 'success_only');
    const outcome = checkOutcomeFromRow(row);
    return {
      id,
      label: labelForDefinition(definition, 'Passive discovery'),
      visibility_state: definition.hidden === true ? 'hidden' : row && outcome?.was_success ? 'visible_success' : 'success_only_or_hidden',
      requirement_status: row ? 'persisted' : 'not_recorded_or_not_yet_evaluated',
      check_requirement: check ? 'requires_check' : 'no_check',
      check_type: check?.skill ?? check?.check_kind ?? null,
      passive_score_source: outcome?.check_mode === 'passive' ? 'persisted_check_result' : notRecorded,
      dc: check?.dc ?? null,
      result_band: row?.status ?? outcome?.result_status ?? null,
      outcome_status: outcome?.result_status ?? (row ? row.status : notRecorded),
      persisted_result_state: row
        ? {
            result_id: idText(row.id),
            status: row.status,
            resolved_at: toJsonSafe(row.resolved_at),
            result_summary: row.result_summary,
            result_narration: row.result_narration,
          }
        : null,
      emitted_knowledge_outputs: row?.knowledge_grants_applied_json ?? [],
      emitted_history_outputs: row?.canonical_event_id ? [{ canonical_event_id: idText(row.canonical_event_id) }] : [],
      emitted_state_outputs: row?.state_changes_applied_json ?? [],
      why_visible_or_hidden:
        row && outcome?.was_success
          ? 'A persisted passive discovery result succeeded.'
          : 'Success-only or hidden passive discoveries are not player-visible unless succeeded.',
    };
  });
}

function mapFreeFocusItems(definitions, closerLooks, rowsByInteraction) {
  const closerLookById = new Map(
    normalizeArray(closerLooks).map((item) => [cleanText(item.interaction_id ?? item.id), item])
  );
  return normalizeArray(definitions).map((definition) => {
    const id = definitionId(definition, 'free_focus');
    const card = closerLookById.get(id) ?? null;
    const row = latestRow(rowsByInteraction.get(id));
    const check = checkDefinition(definition, 'visible');
    const outcome = checkOutcomeFromRow(row);
    const requirements = authoredRequirements(definition);
    const status = row
      ? outcome?.result_status ?? row.status ?? 'viewed'
      : card?.status ?? (requirements.hidden ? 'hidden' : 'available');
    return {
      id,
      title: labelForDefinition(definition, 'Closer look'),
      status,
      unlock_requirements: requirements.requires,
      failed_requirements: card?.disabled_reason ? [card.disabled_reason] : [],
      state_knowledge_requirements: requirements,
      repeat_policy: definition.repeat_policy ?? definition.repeat ?? 'persist_result_no_reroll',
      retry_policy: definition.retry_policy ?? definition.retry ?? 'no_immediate_retry_by_default',
      check_requirement: check ? 'requires_check' : 'no_check',
      check_type: check?.skill ?? check?.check_kind ?? null,
      ability: check?.ability ?? null,
      skill: check?.skill ?? null,
      tool: check?.tool ?? null,
      dc: check?.dc ?? null,
      dc_visibility_policy: check?.dc_visibility ?? 'gm_only',
      check_visibility_policy: check?.check_visibility ?? 'visible',
      assistance_text: check?.assistance || null,
      known_modifiers: {
        environment: [],
        state: [],
        item: [],
        instrumentation_status: futureSupported,
      },
      result_bands_summary: resultBranches(definition).map((band) => ({
        ...band,
        ...outputSummaryFromBand(band),
      })),
      selected_branch_result: row
        ? {
            status: row.status,
            branch_id: outcome?.was_success === true ? 'success' : outcome ? 'failure' : row.status,
          }
        : null,
      persisted_result: row
        ? {
            result_id: idText(row.id),
            result_narration: row.result_narration,
            result_summary: row.result_summary,
            resolved_at: toJsonSafe(row.resolved_at),
            check_result: toJsonSafe(row.check_result_json),
          }
        : null,
      knowledge_outputs: row?.knowledge_grants_applied_json ?? [],
      history_outputs: row?.canonical_event_id ? [{ canonical_event_id: idText(row.canonical_event_id) }] : [],
      state_writes: row?.state_changes_applied_json ?? [],
      related_audit_event_records: row ? [{ type: 'exploration_interaction_result', id: idText(row.id) }] : [],
    };
  });
}

function visibleAffordanceIds(view) {
  const ids = new Set();
  for (const affordance of normalizeArray(view.visible_affordances)) {
    for (const value of [
      affordance.affordance_id,
      affordance.affordanceId,
      affordance.id,
      affordance.key,
      affordance.target_affordance_id,
    ]) {
      const text = cleanText(value);
      if (text) {
        ids.add(text);
      }
    }
  }
  for (const target of normalizeArray(view.scene_reference?.action_targets)) {
    const text = cleanText(target.id ?? target.key);
    if (text) {
      ids.add(text);
      ids.add(text.replace(/^npc:/, ''));
    }
  }
  return ids;
}

function mapBeatActionOptions(definitions, sceneInteractions, view) {
  const visibleIds = visibleAffordanceIds(view);
  const authored = normalizeArray(definitions).map((definition) => {
    const id = definitionId(definition, 'beat_action');
    const check = checkDefinition(definition, 'visible');
    const target = targetId(definition);
    return {
      authored_action_id: id,
      affordance_id: target || null,
      label: labelForDefinition(definition, 'Beat action'),
      verb_action_type: cleanText(definition.beat_action_type ?? definition.action_type ?? definition.verb) || null,
      target_ids: normalizeArray(definition.targets ?? definition.target_ids).map(idText).filter(Boolean),
      availability_state: !target || visibleIds.has(target) ? 'available_or_authored' : 'authored_not_currently_visible',
      visibility_status: definition.hidden === true ? 'hidden' : 'authored',
      failed_requirements: [],
      check_requirement: check ? 'requires_check' : 'no_check',
      check_type: check?.skill ?? check?.check_kind ?? null,
      ability: check?.ability ?? null,
      skill: check?.skill ?? null,
      tool: check?.tool ?? null,
      dc: check?.dc ?? null,
      result_bands_summary: resultBranches(definition).map((band) => ({
        ...band,
        ...outputSummaryFromBand(band),
      })),
      possible_transitions: normalizeArray(definition.transitions ?? definition.exits),
      state_knowledge_requirements: authoredRequirements(definition),
      environment_npc_modifiers: {
        environment: [],
        npc_presence: [],
        instrumentation_status: futureSupported,
      },
      source: 'scene_content_overlay',
    };
  });

  const dbInteractions = sceneInteractions.map((row) => {
    const bands = dbResultBands(row);
    const id = cleanText(row.interaction_key ?? row.key ?? row.id);
    return {
      authored_action_id: idText(row.id),
      interaction_key: id || null,
      affordance_id: cleanText(row.target_affordance_key ?? row.target_id) || null,
      label: row.label,
      verb_action_type: cleanText(row.verb ?? row.interaction_type) || null,
      target_ids: [row.target_affordance_key, row.npc_id].map(idText).filter(Boolean),
      availability_state:
        visibleIds.has(cleanText(row.target_affordance_key)) || visibleIds.has(id) ? 'available' : 'authored_or_hidden',
      visibility_status: row.is_active === false ? 'unavailable' : 'authored',
      failed_requirements: [],
      check_requirement: row.skill_id || row.difficulty_class ? 'requires_check' : 'no_check',
      check_type: cleanText(row.skill_slug ?? row.skill_name) || null,
      ability: null,
      skill: cleanText(row.skill_slug ?? row.skill_name) || null,
      tool: null,
      dc: numberOrNull(row.difficulty_class),
      result_bands_summary: bands.map((band) => ({
        ...band,
        ...outputSummaryFromBand(band),
      })),
      possible_transitions: [],
      state_knowledge_requirements: {
        availability_conditions: row.availability_conditions_json ?? {},
      },
      environment_npc_modifiers: {
        environment: [],
        npc_presence: [],
        instrumentation_status: futureSupported,
      },
      source: 'dnd5e_scene_interaction',
    };
  });

  return [...authored, ...dbInteractions];
}

function mapSubmittedAction(view, submissionRow, beatRows) {
  const actionStatus = view.action_status ?? {};
  const submitted = actionStatus.submitted_action ?? null;
  if (!submitted && !submissionRow) {
    return null;
  }
  const latestResult = beatRows[0] ?? null;
  return {
    submitted_action_id: idText(submissionRow?.id ?? submitted?.submission_id),
    raw_player_text: submissionRow?.raw_text ?? submitted?.raw_text ?? submitted?.text ?? null,
    selected_affordance: submissionRow?.target_affordance_id ?? submitted?.target_affordance_id ?? null,
    selected_verb: submissionRow?.resolved_verb ?? submitted?.verb ?? null,
    selected_target: submissionRow?.target_label ?? submitted?.target_label ?? null,
    resolved_action_type: submissionRow?.response_payload_json?.action_key ?? submissionRow?.response_key ?? null,
    preview_status: submissionRow?.status ?? actionStatus.state ?? null,
    submission_status: submissionRow?.status ?? actionStatus.state ?? null,
    editability_status: actionStatus.can_edit === true ? 'editable' : 'not_editable',
    action_window_status: view.action_window?.status ?? actionStatus.state ?? null,
    spends_beat: true,
    resolution_status: latestResult ? 'resolved_or_latest_result_available' : 'pending_or_not_resolved',
    linked_result_id: idText(latestResult?.id),
    latest_result_reference: latestResult
      ? {
          result_id: idText(latestResult.id),
          title: latestResult.title,
          summary: latestResult.summary,
          resolved_at: toJsonSafe(latestResult.resolved_at ?? latestResult.created_at),
        }
      : null,
  };
}

function mapPreviewMapping(submissionRow) {
  if (!submissionRow) {
    return {
      status: notRecorded,
      message: 'No submitted or previewed beat action is recorded for the current action window.',
    };
  }
  const payload = normalizeObject(submissionRow.response_payload_json);
  const committedFollowup = normalizeObject(payload.committed_followup);
  const mappingSource = payload.interaction_id
    ? 'selected_id'
    : payload.target_affordance_id
      ? 'target_match'
      : payload.action_key
        ? 'deterministic_resolver'
        : 'fallback_or_no_match';
  return {
    raw_player_text: submissionRow.raw_text,
    normalized_text: cleanText(submissionRow.raw_text).toLowerCase() || null,
    selected_verb: submissionRow.resolved_verb,
    selected_target: submissionRow.target_label,
    selected_affordance: submissionRow.target_affordance_id,
    matched_authored_interaction: payload.interaction_id ?? submissionRow.interaction_id ?? null,
    mapping_source: mappingSource,
    ambiguity_candidates: [],
    multi_action_candidates: [],
    invalid_action_reasons: [],
    overlap_with_free_focus: committedFollowup.free_focus_interaction_id
      ? {
          interaction_id: committedFollowup.free_focus_interaction_id,
          followup_resolution_mode: committedFollowup.resolution_mode ?? 'advantage',
        }
      : null,
    preview_text: submissionRow.response_key ?? null,
    mechanical_preview: {
      spends_beat: true,
      one_action_policy: payload.one_action_policy ?? null,
      committed_followup: Object.keys(committedFollowup).length > 0 ? committedFollowup : null,
    },
    player_facing_preview_fields: {
      text: submissionRow.raw_text,
      target_label: submissionRow.target_label,
      verb: submissionRow.resolved_verb,
    },
    hidden_debug_preview_fields: {
      response_payload: payload,
      response_key: submissionRow.response_key,
    },
  };
}

function mapCheckDetails({ definitions, rowsByInteraction, sceneInteractions }) {
  const details = [];
  for (const definition of normalizeArray(definitions.passive_discoveries)) {
    const id = definitionId(definition, 'passive_discovery');
    details.push(
      checkDetailFromDefinition({
        sourceType: 'passive_discovery',
        sourceId: id,
        definition: { ...definition, resolution_mode: 'passive_discovery' },
        row: latestRow(rowsByInteraction.get(id)),
        fallbackVisibility: 'success_only',
      })
    );
  }
  for (const definition of normalizeArray(definitions.free_focus)) {
    const id = definitionId(definition, 'free_focus');
    details.push(
      checkDetailFromDefinition({
        sourceType: 'free_focus',
        sourceId: id,
        definition,
        row: latestRow(rowsByInteraction.get(id)),
        fallbackVisibility: 'visible',
      })
    );
  }
  for (const definition of normalizeArray(definitions.beat_actions)) {
    const id = definitionId(definition, 'beat_action');
    details.push(
      checkDetailFromDefinition({
        sourceType: 'beat_action',
        sourceId: id,
        definition,
        fallbackVisibility: 'visible',
      })
    );
  }
  for (const row of sceneInteractions) {
    const id = idText(row.id);
    const requiresCheck = Boolean(row.skill_id || row.difficulty_class);
    details.push({
      check_id: `scene_interaction:${id}:${row.skill_slug ?? row.skill_name ?? 'check'}`,
      source_type: 'scene_interaction',
      source_id: id,
      source_label: row.label ?? row.interaction_key ?? id,
      requires_check: requiresCheck,
      check_kind: requiresCheck ? 'skill_check' : 'no_check',
      ability: null,
      skill: cleanText(row.skill_slug ?? row.skill_name) || null,
      tool: null,
      dc: numberOrNull(row.difficulty_class),
      dc_visibility: row.difficulty_class ? 'gm_only' : null,
      dc_player_visible: false,
      roll_mode: requiresCheck ? 'standard' : null,
      passive_score_used: null,
      base_modifier: null,
      proficiency_bonus: null,
      feature_bonus: null,
      environment_modifiers: [],
      state_modifiers: [],
      item_modifiers: [],
      advantage_sources: [],
      disadvantage_sources: [],
      assistance_sources: [],
      final_modifier: null,
      raw_roll: null,
      total_result: null,
      result_band: requiresCheck ? null : 'no_check',
      branch_id: null,
      outcome_classification: requiresCheck ? null : 'no_check',
      player_visible_summary: row.skill_id ? `${titleCase(row.skill_slug ?? row.skill_name)} check` : null,
      gm_debug_summary: row.skill_id
        ? `${titleCase(row.skill_slug ?? row.skill_name)} check is authored; current action roll data is recorded during beat resolution.`
        : 'This authored scene interaction does not require a check.',
      instrumentation_status: requiresCheck ? 'partial' : notApplicable,
    });
  }
  return details;
}

function mapResultBands({ definitions, sceneInteractions, rowsByInteraction }) {
  const bands = [];
  const addDefinitionBands = (sourceType, definition, fallbackPrefix) => {
    const sourceId = definitionId(definition, fallbackPrefix);
    const row = latestRow(rowsByInteraction.get(sourceId));
    const outcome = checkOutcomeFromRow(row);
    for (const band of resultBranches(definition)) {
      const selected = row
        ? row.status === band.classification ||
          (outcome?.was_success === true && band.classification === 'success') ||
          (outcome?.was_success === false && band.classification === 'failure') ||
          (!outcome && band.classification === 'no_check')
        : false;
      bands.push({
        source_type: sourceType,
        source_id: sourceId,
        selected,
        selection_reason: selected ? 'persisted_exploration_interaction_result' : null,
        ...band,
        instrumentation_status: row ? 'available' : band.instrumentation_status,
        ...outputSummaryFromBand(band),
      });
    }
  };
  for (const definition of normalizeArray(definitions.passive_discoveries)) {
    addDefinitionBands('passive_discovery', definition, 'passive_discovery');
  }
  for (const definition of normalizeArray(definitions.free_focus)) {
    addDefinitionBands('free_focus', definition, 'free_focus');
  }
  for (const definition of normalizeArray(definitions.beat_actions)) {
    addDefinitionBands('beat_action', definition, 'beat_action');
  }
  for (const row of sceneInteractions) {
    for (const band of dbResultBands(row)) {
      bands.push({
        source_type: 'scene_interaction',
        source_id: idText(row.id),
        selected: false,
        selection_reason: null,
        ...band,
        instrumentation_status: band.instrumentation_status,
        ...outputSummaryFromBand(band),
      });
    }
  }
  return bands;
}

function environmentAffectedChecks(modifiers) {
  return normalizeArray(modifiers)
    .filter((modifier) => modifier.check_type || modifier.skill || modifier.context)
    .map((modifier) => ({
      check_type: modifier.check_type ?? null,
      skill: modifier.skill ?? null,
      context: modifier.context ?? null,
      modifier: modifier.modifier ?? null,
      reason: modifier.reason ?? null,
    }));
}

function mapEnvironmentModifiers(view) {
  const environment = normalizeObject(view.environment);
  const mechanical = normalizeObject(view.mechanical_details);
  const modifiers = normalizeArray(mechanical.environment_modifiers ?? mechanical.modifiers);
  const components = normalizeArray(view.debug?.description_components);
  const descriptionDebug = normalizeObject(view.debug?.environment_description_debug);
  const flavorSelection = normalizeObject(descriptionDebug.flavor_selection);
  if (Object.keys(environment).length === 0 && modifiers.length === 0 && components.length === 0) {
    return [];
  }
  const affectedChecks = environmentAffectedChecks(modifiers);
  const flavorIds = components
    .map((component) => cleanText(component.flavor_id ?? component.flavor_key ?? component.key ?? component.id))
    .filter(Boolean);
  return [
    {
      weather: environment.weather ?? null,
      time_of_day: environment.time_of_day ?? null,
      season: environment.season ?? null,
      visibility_light: environment.light ?? environment.light_level ?? environment.visibility ?? null,
      temperature: environment.temperature ?? environment.temperature_band ?? null,
      wind: environment.wind ?? null,
      precipitation: environment.precipitation ?? null,
      mood_tone: environment.mood ?? environment.tone ?? environment.mood_tone ?? null,
      active_environment_modifiers: modifiers,
      mechanical_effects: modifiers.length > 0 ? modifiers : notApplicable,
      affected_checks: affectedChecks,
      affected_actions: normalizeArray(mechanical.affected_actions),
      affected_affordances: normalizeArray(mechanical.affected_affordances),
      affected_scene_surface_sections: components.map((component) => ({
        slot: component.slot ?? component.section ?? null,
        source: component.source ?? component.type ?? null,
        flavor_id: component.flavor_id ?? component.flavor_key ?? component.key ?? null,
        text_summary: textFrom(component),
      })),
      affected_checks_actions: affectedChecks,
      narrative_flavor_selected: components,
      flavor_source_id: flavorIds.length > 0 ? flavorIds : null,
      flavor_weight: flavorSelection.weight ?? flavorSelection.selected_weight ?? notRecorded,
      flavor_seed: flavorSelection.seed ?? descriptionDebug.seed ?? notRecorded,
      flavor_reuse_cooldown_status:
        descriptionDebug.reuse_cooldown ?? flavorSelection.reuse_cooldown ?? flavorSelection.cooldown ?? notRecorded,
      reuse_cooldown_information: descriptionDebug.reuse_cooldown ?? notRecorded,
      hidden_vs_player_visible_environment_details: Object.keys(descriptionDebug).length > 0 ? descriptionDebug : notRecorded,
      hidden_vs_player_visible_environmental_details: Object.keys(descriptionDebug).length > 0 ? descriptionDebug : notRecorded,
      instrumentation_status:
        modifiers.length > 0
          ? 'partial'
          : components.length > 0
            ? 'partial'
            : notApplicable,
    },
  ];
}

function npcAffordancesFor(view, npcId) {
  if (!npcId) {
    return [];
  }
  return normalizeArray(view.visible_affordances)
    .filter((affordance) =>
      affordance.npc_id === npcId ||
      affordance.source === 'npc_presence' && cleanText(affordance.affordance_id).endsWith(npcId)
    )
    .map((affordance) => ({
      affordance_id: affordance.affordance_id ?? affordance.id ?? null,
      label: affordance.label ?? null,
      state: affordance.state ?? affordance.availability ?? null,
      actions: affordance.actions ?? affordance.available_actions ?? [],
    }));
}

function mapNpcPresence(view) {
  const visible = normalizeArray(view.visible_npcs).map((npc) => ({ ...npc, debug_origin: 'visible' }));
  const knownAbsent = normalizeArray(view.known_relevant_npcs).map((npc) => ({ ...npc, debug_origin: 'known_relevant_absent' }));
  const debugPresence = normalizeArray(view.debug?.npc_presence_all).map((npc) => ({ ...npc, debug_origin: 'debug_presence' }));
  const byKey = new Map();
  for (const npc of [...visible, ...knownAbsent, ...debugPresence]) {
    const debug = normalizeObject(npc.debug);
    const npcId = idText(npc.npc_id ?? npc.id);
    const key = npcId ?? cleanText(npc.display_name ?? npc.name ?? debug.true_name);
    if (!key || byKey.has(key)) {
      continue;
    }
    const presence = cleanText(npc.presence ?? npc.status ?? npc.presence_status);
    const visibility = cleanText(npc.identity_visibility ?? npc.visibility);
    const isAbsent = npc.debug_origin === 'known_relevant_absent' || ['absent', 'dead', 'hidden', 'not_visible'].includes(presence);
    const affordances = npcAffordancesFor(view, npcId);
    const canonicalName = debug.true_name ?? npc.true_name ?? npc.name ?? npc.display_name ?? null;
    const playerVisibleLabel = npc.display_name ?? npc.name ?? canonicalName;
    byKey.set(key, {
      npc_id: npcId,
      canonical_name: canonicalName,
      player_visible_label: playerVisibleLabel,
      display_name: playerVisibleLabel,
      hidden_label_rules: visibility || null,
      identity_visibility: visibility || (npc.true_name_known === false ? 'masked' : 'visible'),
      is_present: presence === 'present',
      is_absent: isAbsent,
      is_known_to_character: npc.true_name_known === true || npc.debug_origin !== 'debug_presence',
      is_relevant_absent_npc: npc.debug_origin === 'known_relevant_absent',
      authored_schedule_id: npc.schedule_id ?? npc.schedule_key ?? debug.schedule_source ?? null,
      current_schedule_block: npc.routine_block ?? npc.schedule_block ?? debug.schedule_source ?? notRecorded,
      routine_label: npc.activity_text ?? npc.activity ?? npc.routine_label ?? null,
      current_resolved_presence: presence || null,
      resolved_presence_status: presence || null,
      routine_block: npc.routine_block ?? npc.schedule_block ?? debug.schedule_source ?? null,
      absence_reason: npc.absence_reason ?? (isAbsent ? npc.relevance ?? 'not present in the active scene' : null),
      event_override: npc.event_override ?? null,
      state_override: npc.state_override ?? debug.state ?? null,
      location_override: npc.location_id ?? null,
      event_state_override: npc.override_reason ?? npc.state_override ?? debug.state ?? null,
      visibility_reason: debug.label_source ?? npc.visibility_reason ?? null,
      known_relevant_absent_npc_status: npc.debug_origin === 'known_relevant_absent' ? 'known_relevant_absent' : null,
      npc_derived_affordances: affordances,
      affected_scene_surface_sections: npc.scene_contribution ? [{ text_summary: npc.scene_contribution }] : [],
      affected_free_focus_items: [],
      affected_beat_actions: affordances.flatMap((affordance) => normalizeArray(affordance.actions)),
      affected_checks: [],
      hidden_vs_player_visible_npc_details: debug.true_name && debug.true_name !== playerVisibleLabel
        ? { canonical_name: debug.true_name, player_visible_label: playerVisibleLabel, label_source: debug.label_source }
        : null,
      npc_influence_on_checks_actions_surface:
        affordances.length > 0 || npc.scene_contribution
          ? { affordance_count: affordances.length, scene_contribution: npc.scene_contribution ?? null }
          : futureSupported,
      instrumentation_status: debug.schedule_source || affordances.length > 0 ? 'partial' : 'partial',
    });
  }
  return [...byKey.values()];
}

function mapStateWrites(rows) {
  return rows.flatMap((row) =>
    normalizeArray(row.state_changes_applied_json).map((change, index) => {
      const sourceId = idText(row.interaction_id);
      const playerFacingStatus = row.canonical_event_id ? 'canonical_or_player_facing_if_event_visible' : 'local_debug_only';
      return {
        write_id: `exploration_result:${row.id}:state_write:${index}`,
        scope: cleanText(change.scope ?? change.target_scope ?? change.type) || 'scene',
        key_or_path: fieldPath(change) || null,
        key_path: fieldPath(change) || null,
        old_value: change.old_value ?? null,
        new_value: change.value ?? change.new_value ?? change.set ?? null,
        write_kind: 'runtime_write',
        source_type: row.resolution_mode,
        source_id: sourceId,
        source_result_band_id: row.status ?? null,
        source_action_id: row.resolution_mode === 'beat_action' ? sourceId : null,
        source_free_focus_id: row.resolution_mode === 'free_focus' ? sourceId : null,
        source_beat_id: null,
        result_band: row.status,
        audit_event_id: idText(row.canonical_event_id ?? row.id),
        audit_event_record_id: idText(row.canonical_event_id ?? row.id),
        player_facing: isPlayerFacing(playerFacingStatus),
        hidden_debug: true,
        player_facing_status: playerFacingStatus,
        hidden_debug_status: 'gm_dev_debug',
        emitted_to_result_feed: Boolean(row.result_summary ?? row.result_narration),
        emitted_to_history: Boolean(row.canonical_event_id),
        emitted_to_knowledge_journal: false,
        instrumentation_status: change.old_value === undefined ? 'partial' : 'available',
        index,
      };
    })
  );
}

function knowledgeOutputType(grant) {
  if (grant.clue_id) {
    return 'clue';
  }
  if (grant.fact_id || grant.knowledge_id || grant.knowledge_key) {
    return 'fact';
  }
  if (grant.rumor_id || cleanText(grant.status).toLowerCase() === 'rumor') {
    return 'rumor';
  }
  if (grant.npc_id) {
    return 'npc_known';
  }
  if (grant.location_id) {
    return 'location_known';
  }
  if (grant.objective_id) {
    return 'objective_known';
  }
  if (grant.journal_entry_id) {
    return 'journal_entry';
  }
  return 'other';
}

function mapKnowledgeOutputs(rows) {
  return rows.flatMap((row) =>
    normalizeArray(row.knowledge_grants_applied_json).map((grant, index) => {
      const knowledgeId = cleanText(grant.knowledge_id ?? grant.knowledge_key ?? grant.id) || null;
      const playerFacingStatus = grant.hidden === true ? 'not_player_facing_hidden_knowledge' : 'knowledge_grant_authored';
      return {
        output_id: `exploration_result:${row.id}:knowledge:${index}`,
        knowledge_id: knowledgeId,
        knowledge_grant_id: knowledgeId,
        clue_id: cleanText(grant.clue_id) || null,
        fact_id: cleanText(grant.fact_id ?? grant.knowledge_key) || null,
        rumor_id: cleanText(grant.rumor_id) || null,
        clue_fact_id: cleanText(grant.fact_id ?? grant.clue_id ?? grant.knowledge_key) || null,
        output_type: knowledgeOutputType(grant),
        confidence_or_status: cleanText(grant.status ?? grant.confidence) || 'confirmed',
        rumor_vs_confirmed_status: cleanText(grant.status ?? grant.confidence) || null,
        character_id: idText(row.character_id),
        party_id: null,
        campaign_id: idText(row.campaign_id),
        source_type: row.resolution_mode,
        source_id: row.interaction_id,
        source_result_band_id: row.status ?? null,
        source_action_id: row.resolution_mode === 'beat_action' ? row.interaction_id : null,
        source_free_focus_id: row.resolution_mode === 'free_focus' ? row.interaction_id : null,
        source_beat_id: null,
        provenance_event_id: idText(row.canonical_event_id ?? row.id),
        campaign_history_event_id: row.canonical_event_id ? idText(row.canonical_event_id) : null,
        timeline_entry_id: null,
        objective_update_id: null,
        player_facing: grant.hidden !== true,
        hidden_debug: grant.hidden === true,
        player_facing_status: playerFacingStatus,
        hidden_gm_dev_only_status: grant.hidden === true ? 'hidden' : null,
        shown_in_scene_result: Boolean(row.result_summary ?? row.result_narration),
        shown_in_knowledge_journal: grant.hidden !== true,
        shown_in_campaign_history: Boolean(row.canonical_event_id),
        player_visible_summary: grant.hidden === true ? null : textFrom(grant) || knowledgeId,
        gm_debug_summary: textFrom(grant) || knowledgeId,
        provenance_source_reference: {
          exploration_result_id: idText(row.id),
          index,
        },
        instrumentation_status: idText(row.id) ? 'partial' : notRecorded,
        raw: grant,
      };
    })
  );
}

function mapHistoryOutputs(rows, beatRows, view) {
  const fromFocus = rows
    .filter((row) => row.canonical_event_id)
    .map((row) => ({
      output_id: `exploration_result:${row.id}:history`,
      event_id: idText(row.canonical_event_id),
      campaign_history_event_id: idText(row.canonical_event_id),
      event_type: row.resolution_mode === 'free_focus' ? 'free_focus_canonical_event' : 'exploration_canonical_event',
      timeline_entry_id: null,
      journal_entry_id: null,
      result_feed_entry_id: idText(row.id),
      objective_update_id: null,
      source_type: row.resolution_mode,
      source_id: row.interaction_id,
      source_result_band_id: row.status ?? null,
      source_action_id: row.resolution_mode === 'beat_action' ? row.interaction_id : null,
      source_free_focus_id: row.resolution_mode === 'free_focus' ? row.interaction_id : null,
      source_beat_id: null,
      player_facing: true,
      hidden_debug: false,
      player_facing_status: 'canonical_event_emitted',
      hidden_gm_dev_only_status: null,
      canonical: true,
      summary: row.result_summary,
      player_visible_text: row.result_summary ?? row.result_narration ?? null,
      gm_debug_text: row.result_summary ?? row.result_narration ?? null,
      provenance_source_reference: { exploration_result_id: idText(row.id) },
      instrumentation_status: 'partial',
    }));
  const fromBeat = beatRows.map((row) => ({
    output_id: `player_beat_result:${row.id}:history`,
    event_id: idText(row.history_event_id ?? row.id),
    campaign_history_event_id: idText(row.history_event_id ?? row.id),
    event_type: row.event_type ?? 'beat_result',
    timeline_entry_id: idText(row.timeline_entry_id),
    journal_entry_id: idText(row.journal_entry_id),
    result_feed_entry_id: idText(row.id),
    objective_update_id: idText(row.objective_update_id),
    source_type: 'beat_action',
    source_id: idText(row.action_window_id ?? row.submission_id),
    source_result_band_id: row.result_band_id ?? row.result_band ?? null,
    source_action_id: idText(row.submission_id ?? row.action_window_id),
    source_free_focus_id: null,
    source_beat_id: idText(row.beat_id),
    player_facing: true,
    hidden_debug: false,
    player_facing_status: 'beat_result_player_facing',
    hidden_gm_dev_only_status: null,
    canonical: row.canonical === true || Boolean(row.history_event_id),
    summary: row.summary ?? row.result_summary ?? row.title,
    player_visible_text: row.summary ?? row.result_summary ?? row.title ?? null,
    gm_debug_text: row.summary ?? row.result_summary ?? row.title ?? null,
    provenance_source_reference: { player_beat_result_id: idText(row.id) },
    instrumentation_status: 'partial',
  }));
  const latest = view.scene_result_feed?.latest_development
    ? [
        {
          output_id: 'scene_result_feed:latest_development',
          event_id: null,
          campaign_history_event_id: null,
          event_type: 'latest_development',
          timeline_entry_id: null,
          journal_entry_id: null,
          result_feed_entry_id: idText(view.scene_result_feed.latest_development.id),
          objective_update_id: null,
          source_type: 'latest_development',
          source_id: null,
          source_result_band_id: null,
          source_action_id: null,
          source_free_focus_id: null,
          source_beat_id: null,
          player_facing: true,
          hidden_debug: false,
          player_facing_status: 'player_facing_result_feed',
          hidden_gm_dev_only_status: null,
          canonical: false,
          summary: view.scene_result_feed.latest_development.summary ?? view.scene_result_feed.latest_development.text,
          player_visible_text:
            view.scene_result_feed.latest_development.summary ?? view.scene_result_feed.latest_development.text ?? null,
          gm_debug_text:
            view.scene_result_feed.latest_development.summary ?? view.scene_result_feed.latest_development.text ?? null,
          provenance_source_reference: { scene_result_feed: 'latest_development' },
          instrumentation_status: 'partial',
        },
      ]
    : [];
  return [...fromFocus, ...fromBeat, ...latest];
}

function transitionAvailability(row) {
  if (row.is_active === false) {
    return 'unavailable';
  }
  const conditions = normalizeObject(row.conditions_json);
  return Object.keys(conditions).length > 0 ? 'locked' : 'available';
}

function dependencyArrayFromConditions(conditions, keys) {
  const object = normalizeObject(conditions);
  return keys.flatMap((key) => normalizeArray(object[key]));
}

function mapTransitions(transitionRows) {
  return transitionRows.map((row) => {
    const conditions = normalizeObject(row.conditions_json);
    const availabilityStatus = transitionAvailability(row);
    return {
      transition_id: idText(row.id),
      transition_key: row.transition_key ?? null,
      label: row.label,
      transition_type: cleanText(row.transition_type ?? row.type) || 'scene_exit',
      source_scene_id: idText(row.from_scene_id ?? row.scene_id),
      target_scene_id: idText(row.to_scene_id),
      target_scene_key: row.target_scene_key ?? null,
      target_scene_name: row.target_scene_name ?? null,
      target_location_id: idText(row.to_location_id ?? row.target_location_id),
      target_campaign_state: row.target_campaign_state_json ?? row.campaign_state_json ?? null,
      availability_status: availabilityStatus,
      visibility_status: availabilityStatus,
      requirements: conditions,
      failed_requirements: [],
      state_dependencies: dependencyArrayFromConditions(conditions, ['state', 'state_requirements', 'requires_state']),
      knowledge_dependencies: dependencyArrayFromConditions(conditions, ['knowledge', 'knowledge_requirements', 'requires_knowledge']),
      npc_dependencies: dependencyArrayFromConditions(conditions, ['npc', 'npc_requirements', 'requires_npc']),
      environment_dependencies: dependencyArrayFromConditions(conditions, [
        'environment',
        'environment_requirements',
        'requires_environment',
      ]),
      selected_by_action_id: null,
      selected_by_result_band_id: null,
      resolved_transition: false,
      explicit_transition_target_status: row.to_scene_id ? 'explicit' : 'missing_target',
      player_facing: row.is_active !== false,
      hidden_debug: Object.keys(conditions).length > 0,
      player_facing_status: row.is_active === false ? 'not_player_facing' : 'available_if_conditions_met',
      gm_dev_only_debug_status: 'gm_dev_authored_transition',
      transition_reason: row.reason ?? row.description ?? null,
      raw_conditions: conditions,
      instrumentation_status: Object.keys(conditions).length > 0 ? 'partial' : 'available',
    };
  });
}

function linkedDebugSections(...sections) {
  return sections.filter(Boolean);
}

function auditRecord({
  id,
  timestamp = null,
  eventType,
  sourceType = null,
  sourceId = null,
  summary = null,
  payloadSummary = null,
  playerFacing = false,
  hiddenDebug = true,
  linkedSections = [],
  instrumentationStatus = 'partial',
  extra = {},
}) {
  return {
    audit_id: id,
    event_id: id,
    timestamp: toJsonSafe(timestamp),
    occurred_at: toJsonSafe(timestamp),
    event_type: eventType,
    source_type: sourceType,
    source_id: sourceId,
    beat_id: extra.beat_id ?? null,
    action_window_id: extra.action_window_id ?? null,
    action_id: extra.action_id ?? null,
    free_focus_id: extra.free_focus_id ?? null,
    result_band_id: extra.result_band_id ?? null,
    scene_id: extra.scene_id ?? null,
    npc_id: extra.npc_id ?? null,
    state_scope: extra.state_scope ?? null,
    output_id: extra.output_id ?? null,
    player_facing: playerFacing,
    hidden_debug: hiddenDebug,
    player_facing_status: playerFacing ? 'player_facing' : 'gm_dev_only',
    summary,
    payload_summary: payloadSummary ?? summary,
    linked_debug_sections: linkedSections,
    related_records: extra.related_records ?? [],
    instrumentation_status: instrumentationStatus,
  };
}

function mapAuditTimeline({
  rows,
  submissionRow,
  beatRows,
  view,
  environmentModifiers = [],
  npcPresence = [],
  stateReads = [],
  stateWrites = [],
  knowledgeOutputs = [],
  historyOutputs = [],
  transitions = [],
}) {
  const records = [];
  for (const row of rows) {
    records.push(auditRecord({
      id: `exploration_result:${row.id}`,
      eventType:
        row.resolution_mode === 'free_focus'
          ? 'free_focus_resolved'
          : row.resolution_mode === 'passive_discovery'
            ? 'passive_discovery_evaluated'
            : row.resolution_mode === 'automatic_observation'
              ? 'automatic_observation_recorded'
              : 'exploration_interaction_result',
      timestamp: row.resolved_at ?? row.created_at,
      sourceType: row.resolution_mode,
      sourceId: row.interaction_id,
      summary: row.result_summary ?? row.result_narration,
      playerFacing: Boolean(row.canonical_event_id),
      hiddenDebug: !row.canonical_event_id,
      linkedSections: linkedDebugSections('check_details', 'result_bands', 'state_writes', 'knowledge_outputs', 'history_outputs'),
      instrumentationStatus: 'partial',
      extra: {
        free_focus_id: row.resolution_mode === 'free_focus' ? row.interaction_id : null,
        result_band_id: row.status ?? null,
        scene_id: idText(row.scene_id),
        related_records: [{ type: 'dnd5e_character_exploration_interaction_result', id: idText(row.id) }],
      },
    }));
  }
  if (submissionRow) {
    records.push(auditRecord({
      id: `web_action_submission:${submissionRow.id}`,
      eventType: 'beat_action_submitted',
      timestamp: submissionRow.updated_at ?? submissionRow.created_at,
      sourceType: 'beat_action',
      sourceId: idText(submissionRow.interaction_id ?? submissionRow.target_affordance_id),
      summary: submissionRow.raw_text,
      playerFacing: true,
      hiddenDebug: false,
      linkedSections: linkedDebugSections('submitted_action', 'preview_mapping', 'beat_action_options'),
      instrumentationStatus: 'partial',
      extra: {
        action_window_id: idText(submissionRow.action_window_id),
        action_id: idText(submissionRow.id),
        related_records: [{ type: 'dnd5e_web_action_submission', id: idText(submissionRow.id) }],
      },
    }));
  }
  for (const row of beatRows) {
    records.push(auditRecord({
      id: `player_beat_result:${row.id}`,
      eventType: 'result_band_selected',
      timestamp: row.resolved_at ?? row.created_at,
      sourceType: 'beat_action_result',
      sourceId: idText(row.action_window_id ?? row.submission_id),
      summary: row.summary ?? row.title,
      playerFacing: true,
      hiddenDebug: false,
      linkedSections: linkedDebugSections('result_bands', 'history_outputs'),
      instrumentationStatus: 'partial',
      extra: {
        beat_id: idText(row.beat_id),
        action_window_id: idText(row.action_window_id),
        action_id: idText(row.submission_id),
        output_id: `player_beat_result:${row.id}:history`,
        related_records: [{ type: 'dnd5e_player_beat_result', id: idText(row.id) }],
      },
    }));
  }
  if (view.action_window) {
    records.push(auditRecord({
      id: `action_window:${view.action_window.action_window_id}`,
      eventType: 'next_beat_opened',
      timestamp: view.action_window.opens_at ?? null,
      sourceType: 'action_window',
      sourceId: idText(view.action_window.action_window_id),
      summary: `Action window status: ${view.action_window.status ?? 'unknown'}`,
      playerFacing: true,
      hiddenDebug: false,
      linkedSections: linkedDebugSections('scene_state', 'submitted_action'),
      instrumentationStatus: 'partial',
      extra: {
        action_window_id: idText(view.action_window.action_window_id),
        related_records: [{ type: 'dnd5e_action_window', id: idText(view.action_window.action_window_id) }],
      },
    }));
  }
  for (const [index, environment] of environmentModifiers.entries()) {
    records.push(auditRecord({
      id: `environment:${index}`,
      eventType: environment.active_environment_modifiers?.length > 0
        ? 'environment_modifier_applied'
        : 'environment_overlay_selected',
      sourceType: 'environment',
      sourceId: cleanText(environment.weather ?? environment.time_of_day ?? index),
      summary: environment.active_environment_modifiers?.length > 0
        ? `${environment.active_environment_modifiers.length} environment modifier(s) available for inspection.`
        : 'Environment context is available for surface/debug inspection.',
      payloadSummary: {
        weather: environment.weather,
        time_of_day: environment.time_of_day,
        modifier_count: normalizeArray(environment.active_environment_modifiers).length,
      },
      linkedSections: linkedDebugSections('environment_modifiers', 'surface_context', 'check_details'),
      instrumentationStatus: environment.instrumentation_status,
    }));
  }
  for (const npc of npcPresence) {
    records.push(auditRecord({
      id: `npc_presence:${npc.npc_id ?? slugText(npc.player_visible_label ?? 'npc')}`,
      eventType: 'npc_presence_resolved',
      sourceType: 'npc_presence',
      sourceId: npc.npc_id,
      summary: `${npc.player_visible_label ?? npc.canonical_name ?? 'NPC'} presence: ${npc.resolved_presence_status ?? 'unknown'}`,
      payloadSummary: {
        is_present: npc.is_present,
        is_absent: npc.is_absent,
        identity_visibility: npc.identity_visibility,
      },
      linkedSections: linkedDebugSections('npc_presence', 'surface_context', 'beat_action_options'),
      instrumentationStatus: npc.instrumentation_status,
      extra: { npc_id: npc.npc_id },
    }));
  }
  for (const read of stateReads) {
    records.push(auditRecord({
      id: read.read_id ?? `state_read:${read.source_type}:${read.source_id}:${read.key_or_path}`,
      eventType: read.read_kind === 'runtime_read' ? 'state_read' : 'state_dependency_checked',
      sourceType: read.source_type,
      sourceId: read.source_id,
      summary: `${read.scope ?? 'state'} dependency: ${read.key_or_path ?? read.key_path}`,
      payloadSummary: { expected: read.expected_value_or_condition, actual: read.actual_value },
      playerFacing: read.player_facing === true,
      hiddenDebug: read.hidden_debug !== false,
      linkedSections: linkedDebugSections('state_reads', read.related_free_focus_id ? 'free_focus_items' : null, read.related_beat_action_id ? 'beat_action_options' : null),
      instrumentationStatus: read.instrumentation_status,
      extra: {
        free_focus_id: read.related_free_focus_id,
        action_id: read.related_beat_action_id,
        result_band_id: read.related_result_band_id,
        state_scope: read.scope,
      },
    }));
  }
  for (const write of stateWrites) {
    records.push(auditRecord({
      id: write.write_id,
      eventType: 'state_write',
      sourceType: write.source_type,
      sourceId: write.source_id,
      summary: `${write.scope ?? 'state'} write: ${write.key_or_path ?? write.key_path}`,
      payloadSummary: { old_value: write.old_value, new_value: write.new_value },
      playerFacing: write.player_facing === true,
      hiddenDebug: write.hidden_debug !== false,
      linkedSections: linkedDebugSections('state_writes', 'result_bands'),
      instrumentationStatus: write.instrumentation_status,
      extra: {
        beat_id: write.source_beat_id,
        action_id: write.source_action_id,
        free_focus_id: write.source_free_focus_id,
        result_band_id: write.source_result_band_id,
        state_scope: write.scope,
        output_id: write.write_id,
      },
    }));
  }
  for (const output of knowledgeOutputs) {
    records.push(auditRecord({
      id: output.output_id,
      eventType: 'knowledge_granted',
      sourceType: output.source_type,
      sourceId: output.source_id,
      summary: output.player_visible_summary ?? output.gm_debug_summary ?? output.knowledge_id ?? 'Knowledge output',
      playerFacing: output.player_facing === true,
      hiddenDebug: output.hidden_debug === true,
      linkedSections: linkedDebugSections('knowledge_outputs', 'history_outputs'),
      instrumentationStatus: output.instrumentation_status,
      extra: {
        action_id: output.source_action_id,
        free_focus_id: output.source_free_focus_id,
        result_band_id: output.source_result_band_id,
        output_id: output.output_id,
      },
    }));
  }
  for (const output of historyOutputs) {
    records.push(auditRecord({
      id: output.output_id,
      eventType: output.event_type ?? 'history_event_emitted',
      sourceType: output.source_type,
      sourceId: output.source_id,
      summary: output.summary ?? output.player_visible_text ?? 'History output',
      playerFacing: output.player_facing === true,
      hiddenDebug: output.hidden_debug === true,
      linkedSections: linkedDebugSections('history_outputs', 'audit_timeline'),
      instrumentationStatus: output.instrumentation_status,
      extra: {
        beat_id: output.source_beat_id,
        action_id: output.source_action_id,
        free_focus_id: output.source_free_focus_id,
        result_band_id: output.source_result_band_id,
        output_id: output.output_id,
      },
    }));
  }
  for (const transition of transitions) {
    records.push(auditRecord({
      id: `transition:${transition.transition_id ?? transition.transition_key}`,
      eventType: transition.availability_status === 'selected' ? 'transition_selected' : 'transition_available',
      sourceType: 'transition',
      sourceId: transition.transition_id ?? transition.transition_key,
      summary: `${transition.label ?? transition.transition_key ?? 'Transition'}: ${transition.availability_status}`,
      playerFacing: transition.player_facing === true,
      hiddenDebug: transition.hidden_debug === true,
      linkedSections: linkedDebugSections('transitions', 'state_reads'),
      instrumentationStatus: transition.instrumentation_status,
      extra: {
        scene_id: transition.source_scene_id,
        result_band_id: transition.selected_by_result_band_id,
      },
    }));
  }
  return records
    .filter((record) => record.timestamp || record.event_type === 'next_beat_opened' || record.instrumentation_status)
    .sort((left, right) => cleanText(left.timestamp ?? '9999').localeCompare(cleanText(right.timestamp ?? '9999')));
}

function validationIssue(severity, code, message, source = {}) {
  return {
    severity,
    code,
    message,
    source_type: source.source_type ?? null,
    source_id: source.source_id ?? null,
    source_label: source.source_label ?? null,
  };
}

function checkHasConflictingNoCheckFields(definition) {
  return definition?.requires_check === false && Boolean(
    definition.check ||
      definition.skill ||
      definition.dc ||
      definition.difficulty_class ||
      definition.ability ||
      definition.tool
  );
}

function validateDefinitionMechanics(definitions, sourceType, fallbackPrefix, issues) {
  for (const definition of normalizeArray(definitions)) {
    const sourceId = definitionId(definition, fallbackPrefix);
    const source = {
      source_type: sourceType,
      source_id: sourceId,
      source_label: labelForDefinition(definition, sourceId),
    };
    const check = checkDefinition(definition, sourceType === 'passive_discovery' ? 'success_only' : 'visible');
    const bands = resultBranches(definition);
    const hasSuccess = bands.some((band) => band.classification === 'success');
    const hasFailure = bands.some((band) => band.classification === 'failure');
    const hasNoCheck = bands.some((band) => band.classification === 'no_check');

    if (check && !Number.isFinite(check.dc)) {
      issues.hard_errors.push(
        validationIssue(
          'hard_error',
          'check_missing_dc',
          'Checked exploration content requires a DC or threshold for GM/dev inspection.',
          source
        )
      );
    }

    if (check && !hasFailure) {
      issues.warnings.push(
        validationIssue(
          'warning',
          `${sourceType}_checked_no_failure_band`,
          'Checked exploration content has no authored failure band/result branch.',
          source
        )
      );
    }

    if (check && !hasSuccess) {
      issues.warnings.push(
        validationIssue(
          'warning',
          `${sourceType}_checked_no_success_band`,
          'Checked exploration content has no authored success band/result branch.',
          source
        )
      );
    }

    if (check && !definition.check?.dc_visibility && !definition.dc_visibility) {
      issues.warnings.push(
        validationIssue(
          'warning',
          'dc_visibility_defaulted',
          'DC visibility is not explicitly authored; GM/dev read model defaults it to gm_only.',
          source
        )
      );
    }

    if (!check && !hasNoCheck && sourceType !== 'passive_discovery') {
      issues.warnings.push(
        validationIssue(
          'warning',
          'no_check_missing_authored_result',
          'No-check exploration content lacks an explicit deterministic authored result band.',
          source
        )
      );
    }

    if (checkHasConflictingNoCheckFields(definition)) {
      issues.warnings.push(
        validationIssue(
          'warning',
          'no_check_conflicting_check_fields',
          'This interaction declares requires_check false but also includes check/DC metadata.',
          source
        )
      );
    }

    for (const band of bands) {
      for (const transition of normalizeArray(band.transition_rules ?? band.transition_rules_summary)) {
        if (!transition?.target_scene_id && !transition?.target_scene_key && !transition?.scene_key) {
          issues.hard_errors.push(
            validationIssue(
              'hard_error',
              'result_band_transition_missing_target',
              'Result band transition output is missing an explicit target scene.',
              source
            )
          );
        }
      }
      for (const grant of normalizeArray(band.knowledge_grants ?? band.knowledge_grants_summary)) {
        if (!grant?.knowledge_id && !grant?.knowledge_key && !grant?.id) {
          issues.warnings.push(
            validationIssue(
              'warning',
              'result_band_knowledge_grant_missing_id',
              'Result band knowledge output is missing a knowledge id/key.',
              source
            )
          );
        }
      }
    }
  }
}

function validateSceneInteractionMechanics(sceneInteractions, issues) {
  for (const row of sceneInteractions) {
    const source = {
      source_type: 'scene_interaction',
      source_id: idText(row.id),
      source_label: row.label ?? row.interaction_key ?? idText(row.id),
    };
    const requiresCheck = Boolean(row.skill_id || row.skill_slug || row.skill_name || row.difficulty_class);
    const bands = dbResultBands(row);
    if (requiresCheck && !Number.isFinite(numberOrNull(row.difficulty_class))) {
      issues.hard_errors.push(
        validationIssue(
          'hard_error',
          'scene_interaction_check_missing_dc',
          'Checked scene interaction is missing a difficulty_class/DC.',
          source
        )
      );
    }
    if (requiresCheck && !bands.some((band) => band.classification === 'failure')) {
      issues.warnings.push(
        validationIssue(
          'warning',
          'scene_interaction_checked_no_failure_band',
          'Checked scene interaction has no authored failure result band.',
          source
        )
      );
    }
    if (requiresCheck && !bands.some((band) => band.classification === 'success')) {
      issues.warnings.push(
        validationIssue(
          'warning',
          'scene_interaction_checked_no_success_band',
          'Checked scene interaction has no authored success result band.',
          source
        )
      );
    }
    if (!requiresCheck && bands.length === 0 && !cleanText(row.success_text) && !cleanText(row.failure_text)) {
      issues.warnings.push(
        validationIssue(
          'warning',
          'scene_interaction_no_check_ambiguous_result',
          'No-check scene interaction lacks authored result text or result bands.',
          source
        )
      );
    }
  }
}

function validateInstrumentation(checkDetails, resultBands, stateReads, debugNotices, issues) {
  if (checkDetails.some((detail) => detail.requires_check && detail.raw_roll === null)) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'raw_roll_not_recorded',
        'Some authored checks have no persisted raw roll yet; unresolved checks are reported without fabricated rolls.'
      )
    );
  }
  if (checkDetails.some((detail) => detail.requires_check && normalizeArray(detail.environment_modifiers).length === 0)) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'modifier_breakdown_partial',
        'Per-check environment/state/item modifier breakdowns are not fully recorded for all exploration checks yet.'
      )
    );
  }
  if (stateReads.some((read) => read.read_type === 'authored_dependency')) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'state_reads_authored_dependency_only',
        'Some state read records are authored dependency summaries rather than exact runtime read audit rows.'
      )
    );
  }
  if (resultBands.some((band) => band.selected === false && band.instrumentation_status === 'partial')) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'result_band_selection_partial',
        'Authored result bands are inspectable, but selected historical beat-action bands may not be recorded yet.'
      )
    );
  }
  issues.debug_notices.push(...debugNotices.map((notice) => ({ severity: 'debug_notice', ...notice })));
}

function validateAuditAggregation({
  environmentModifiers = [],
  npcPresence = [],
  stateReads = [],
  stateWrites = [],
  knowledgeOutputs = [],
  historyOutputs = [],
  transitions = [],
  auditTimeline = [],
}, issues) {
  if (environmentModifiers.some((environment) =>
    normalizeArray(environment.active_environment_modifiers).some((modifier) =>
      modifier.check_type && !['skill_check', 'ability_check', 'saving_throw', 'passive_check'].includes(cleanText(modifier.check_type))
    )
  )) {
    issues.warnings.push(
      validationIssue(
        'warning',
        'environment_modifier_unknown_check_type',
        'One or more environment modifiers reference a check/action type outside the current known exploration check taxonomy.'
      )
    );
  }

  if (environmentModifiers.some((environment) => environment.flavor_seed === notRecorded)) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'environment_flavor_seed_not_recorded',
        'Environment flavor selection seed/cooldown data is not fully recorded for this scene view.'
      )
    );
  }

  if (npcPresence.some((npc) => !npc.npc_id && !npc.canonical_name && !npc.player_visible_label)) {
    issues.warnings.push(
      validationIssue(
        'warning',
        'npc_presence_missing_reference',
        'An NPC presence entry could not be tied to an NPC id or label.'
      )
    );
  }

  if (npcPresence.some((npc) => npc.current_schedule_block === notRecorded || npc.instrumentation_status === 'partial')) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'npc_schedule_internals_partial',
        'NPC schedule internals are partially available; current resolved presence is shown where recorded.'
      )
    );
  }

  if (stateReads.some((read) => read.read_kind === 'authored_dependency' || read.read_type === 'authored_dependency')) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'runtime_state_reads_not_logged',
        'Some state reads are authored dependency summaries because exact runtime read audit rows are not recorded yet.'
      )
    );
  }

  if (stateWrites.some((write) => !write.key_or_path && !write.key_path)) {
    issues.hard_errors.push(
      validationIssue(
        'hard_error',
        'state_write_missing_target',
        'A state write is missing a target key/path.'
      )
    );
  }

  if (stateWrites.some((write) => write.old_value === null || write.old_value === undefined)) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'state_write_old_value_not_recorded',
        'At least one state write lacks an old_value; the read model does not reconstruct old state after the fact.'
      )
    );
  }

  if (knowledgeOutputs.some((output) => !output.knowledge_id && !output.clue_id && !output.fact_id && !output.rumor_id)) {
    issues.warnings.push(
      validationIssue(
        'warning',
        'knowledge_output_missing_reference',
        'A knowledge output lacks a knowledge/clue/fact/rumor id that can be linked in the inspector.'
      )
    );
  }

  if (knowledgeOutputs.some((output) => !output.provenance_event_id)) {
    issues.warnings.push(
      validationIssue(
        'warning',
        'knowledge_output_provenance_not_recorded',
        'A knowledge output lacks a persisted provenance event id.'
      )
    );
  }

  if (historyOutputs.some((output) => !output.source_action_id && !output.source_free_focus_id && !output.source_result_band_id && output.source_type !== 'latest_development')) {
    issues.warnings.push(
      validationIssue(
        'warning',
        'history_output_source_link_partial',
        'A history/result-feed output is not fully linked to a source action, Free Focus item, or result band.'
      )
    );
  }

  if (transitions.some((transition) => transition.explicit_transition_target_status === 'missing_target')) {
    issues.hard_errors.push(
      validationIssue(
        'hard_error',
        'transition_target_missing',
        'An authored exploration transition is missing an explicit target scene.'
      )
    );
  }

  if (transitions.some((transition) =>
    Object.keys(normalizeObject(transition.requirements)).length > 0 &&
    normalizeArray(transition.failed_requirements).length === 0 &&
    transition.availability_status !== 'available'
  )) {
    issues.warnings.push(
      validationIssue(
        'warning',
        'transition_requirements_without_failed_explanation',
        'A locked/conditional transition has requirements but no concrete failed-requirement explanation is recorded.'
      )
    );
  }

  if (auditTimeline.some((event) => event.instrumentation_status === 'partial')) {
    issues.debug_notices.push(
      validationIssue(
        'debug_notice',
        'audit_timeline_partial',
        'The audit timeline is normalized from available records and authored dependencies; it is not yet a complete runtime trace.'
      )
    );
  }
}

function validation({
  definitions,
  sceneInteractions,
  checkDetails,
  resultBands,
  stateReads,
  stateWrites = [],
  environmentModifiers = [],
  npcPresence = [],
  knowledgeOutputs = [],
  historyOutputs = [],
  transitions = [],
  auditTimeline = [],
  debugNotices,
}) {
  const issues = {
    hard_errors: [],
    warnings: [],
    debug_notices: [],
  };

  validateDefinitionMechanics(definitions.passive_discoveries, 'passive_discovery', 'passive_discovery', issues);
  validateDefinitionMechanics(definitions.free_focus, 'free_focus', 'free_focus', issues);
  validateDefinitionMechanics(definitions.beat_actions, 'beat_action', 'beat_action', issues);
  validateSceneInteractionMechanics(sceneInteractions, issues);
  validateInstrumentation(checkDetails, resultBands, stateReads, debugNotices, issues);
  validateAuditAggregation({
    environmentModifiers,
    npcPresence,
    stateReads,
    stateWrites,
    knowledgeOutputs,
    historyOutputs,
    transitions,
    auditTimeline,
  }, issues);

  return {
    hard_errors: issues.hard_errors,
    warnings: issues.warnings,
    debug_notices: [
      {
        severity: 'debug_notice',
        code: 'exploration_mechanics_audit_validation_partial',
        message:
          'Stage 6B.11.3 validates environment/NPC/state/output audit explainability from available records; deeper exact runtime tracing remains future-supported.',
      },
      ...issues.debug_notices,
    ],
  };
}

export async function getExplorationMechanicsDebugReadModelForAccount(
  accountId,
  input = {},
  executor = { query }
) {
  await requireExplorationMechanicsDebugCapability(accountId, executor);
  await ensureActionComposerSchema();
  await ensureExplorationInteractionSchema();
  await ensurePlayerBeatResultSchema();

  const debugNotices = [];
  const sceneView = await getCharacterSceneView({
    accountId,
    characterId: input.character_id,
    campaignInstanceId: input.campaign_instance_id ?? input.campaign_id,
    includeDebug: true,
    includeMechanics: true,
  });

  if (sceneView.state !== 'active' || !sceneView.scene) {
    const sections = emptySections([
      {
        code: 'active_exploration_scene_unavailable',
        message: 'No active exploration scene was available for this account/character/campaign context.',
      },
    ]);
    return {
      status: sceneView.state ?? 'unavailable',
      checked_at: new Date().toISOString(),
      exploration_mechanics_debug: sections,
    };
  }

  const sceneId = Number(sceneView.scene.scene_id ?? sceneView.scene.id);
  const campaignId = Number(sceneView.campaign_instance_id ?? sceneView.campaign?.campaign_id);
  const characterId = Number(sceneView.character_id ?? sceneView.active_character?.character_id);
  const worldInstanceId = Number(sceneView.world_instance_id);
  const overlay = await getSceneContentOverlay(sceneView.scene);
  const definitions = getExplorationInteractionDefinitions({
    ...(overlay ?? {}),
    metadata: {
      ...normalizeObject(sceneView.scene?.metadata),
      ...normalizeObject(overlay?.metadata),
    },
  });

  const [sceneInteractions, transitionRows, resultRows, beatRows] = await Promise.all([
    loadSceneInteractions(sceneId, executor, debugNotices),
    loadSceneTransitions(sceneId, executor, debugNotices),
    loadExplorationResultRows(
      {
        campaignId,
        worldInstanceId: Number.isInteger(worldInstanceId) ? worldInstanceId : null,
        characterId,
        sceneId,
      },
      executor,
      debugNotices
    ),
    loadBeatResults({ campaignId, characterId, sceneId }, executor, debugNotices),
  ]);
  const submissionRow = await loadSubmittedAction(
    sceneView.action_window?.action_window_id ?? sceneView.action_status?.action_window_id,
    characterId,
    executor,
    debugNotices
  );
  const rowsByInteraction = indexByInteraction(resultRows);

  const stateReads = [
    ...mapDefinitionsToStateReads(definitions.passive_discoveries, 'passive_discovery'),
    ...mapDefinitionsToStateReads(definitions.free_focus, 'free_focus'),
    ...mapDefinitionsToStateReads(definitions.beat_actions, 'beat_action'),
  ];
  const stateWrites = mapStateWrites(resultRows);
  const checkDetails = mapCheckDetails({ definitions, rowsByInteraction, sceneInteractions });
  const resultBands = mapResultBands({ definitions, sceneInteractions, rowsByInteraction });
  const environmentModifiers = mapEnvironmentModifiers(sceneView);
  const npcPresence = mapNpcPresence(sceneView);
  const knowledgeOutputs = mapKnowledgeOutputs(resultRows);
  const historyOutputs = mapHistoryOutputs(resultRows, beatRows, sceneView);
  const transitions = mapTransitions(transitionRows);
  const auditTimeline = mapAuditTimeline({
    rows: resultRows,
    submissionRow,
    beatRows,
    view: sceneView,
    environmentModifiers,
    npcPresence,
    stateReads,
    stateWrites,
    knowledgeOutputs,
    historyOutputs,
    transitions,
  });
  const sections = {
    scene_state: mapSceneState(sceneView, sceneInteractions, transitionRows),
    surface_context: mapSurfaceContext(sceneView, definitions, overlay),
    passive_discoveries: mapPassiveDiscoveries(definitions.passive_discoveries, rowsByInteraction),
    free_focus_items: mapFreeFocusItems(
      definitions.free_focus,
      sceneView.scene_reference?.closer_looks,
      rowsByInteraction
    ),
    beat_action_options: mapBeatActionOptions(definitions.beat_actions, sceneInteractions, sceneView),
    submitted_action: mapSubmittedAction(sceneView, submissionRow, beatRows),
    preview_mapping: mapPreviewMapping(submissionRow),
    check_details: checkDetails,
    result_bands: resultBands,
    environment_modifiers: environmentModifiers,
    npc_presence: npcPresence,
    state_reads: stateReads,
    state_writes: stateWrites,
    knowledge_outputs: knowledgeOutputs,
    history_outputs: historyOutputs,
    transitions,
    audit_timeline: auditTimeline,
    validation: validation({
      definitions,
      sceneInteractions,
      checkDetails,
      resultBands,
      stateReads,
      stateWrites,
      environmentModifiers,
      npcPresence,
      knowledgeOutputs,
      historyOutputs,
      transitions,
      auditTimeline,
      debugNotices,
    }),
    visibility_boundaries: {
      includes_hidden_dc: true,
      includes_debug_mapping: true,
      includes_check_debug_breakdown: true,
      includes_modifier_breakdown: true,
      includes_raw_state_reads: true,
      includes_raw_state_writes: true,
      includes_raw_state_outputs: true,
      includes_hidden_requirements: true,
      includes_hidden_npc_schedule_data: Boolean(sceneView.debug?.npc_presence),
      includes_audit_records: true,
      includes_result_band_internals: true,
      includes_environment_debug: true,
      includes_hidden_environment_details: Boolean(sceneView.debug?.environment_description_debug),
      includes_npc_schedule_debug: Boolean(sceneView.debug?.npc_presence),
      includes_hidden_npc_identity: npcPresence.some((npc) => npc.hidden_vs_player_visible_npc_details),
      includes_state_dependencies: true,
      includes_hidden_knowledge_outputs: knowledgeOutputs.some((output) => output.hidden_debug === true),
      includes_history_output_internals: true,
      includes_hidden_transition_requirements: transitions.some((transition) => transition.hidden_debug === true),
      includes_audit_timeline: true,
      player_endpoint_exclusion_confirmed: true,
      player_dc_policy: 'Hidden DCs remain GM/dev-only unless content explicitly authors a player-visible DC.',
      player_roll_policy: 'Raw rolls and modifier breakdowns are not returned by normal player scene endpoints.',
      player_result_band_policy:
        'Authored result band internals, thresholds, GM notes, and instrumentation status are GM/dev-only.',
      notes: [
        'This GM/dev payload is intentionally separate from /api/play/current-scene.',
        'Unavailable roll/modifier instrumentation is marked partial/not_recorded/future_supported rather than reconstructed.',
        'Environment, NPC, state, output, transition, and audit sections aggregate available records and authored dependencies without mutating runtime state.',
      ],
    },
  };

  return {
    status: 'ok',
    checked_at: new Date().toISOString(),
    context: {
      account_id: idText(accountId),
      campaign_instance_id: idText(campaignId),
      character_id: idText(characterId),
      scene_id: idText(sceneId),
      selected_id: cleanText(input.selected_id ?? input.selected_interaction_id ?? input.selected_action_id) || null,
    },
    exploration_mechanics_debug: toJsonSafe(sections),
  };
}

export const __private__ = {
  requireExplorationMechanicsDebugCapability,
  checkDefinition,
  resultBranches,
  validation,
};
