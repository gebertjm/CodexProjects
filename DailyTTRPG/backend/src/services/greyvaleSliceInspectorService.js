import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { getCharacterSceneView } from './characterSceneViewService.js';
import { getDialogueDebugWorkspaceForAccount } from './dialogueFocusCommit/dialogueDebugWorkspaceService.js';
import {
  listPlayerDialogueArchiveForAccount,
  searchPlayerDialogueArchiveForAccount,
} from './dialogueFocusCommit/dialogueArchiveService.js';
import { ensureDialogueFocusCommitPersistenceSchema } from './dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import { getExplorationMechanicsDebugReadModelForAccount } from './explorationMechanicsDebugReadModel.js';
import {
  RUSK_ENDPOINT_SCENE_KEY,
  RUSK_ENDPOINT_FLAGS,
} from './greyvaleSliceEndpointService.js';
import { scanForPlayerHiddenData } from './interactionCore/visibilityBoundary.js';
import { getCampaignHistoryForAccount, getCampaignKnowledgeForAccount } from './playerBeatResultService.js';
import { getCurrentAdventurePreview, getPlayerDashboard } from './playerDashboardService.js';

const INSPECTOR_ROUTE = '/api/dev/greyvale-slice-inspector';
const GREYVALE_CANONICAL_ROUTE_STEPS = Object.freeze([
  'start_or_resume_greyvale',
  'opening_broken_caravan_exploration',
  'tomas_road_patterns_dialogue',
  'elin_survivor_memory_dialogue',
  'dunmere_village_pressure',
  'mara_or_lysa_partial_clue_dialogue',
  'garren_shrine_route_dialogue',
  'shrine_approach',
  'rusk_confrontation',
  'endpoint_awaiting_future_support',
]);

const PLAYER_INTERNAL_VALUE_PATTERNS = Object.freeze([
  { id: 'combat_pending', pattern: /\bcombat_pending\b/i },
  { id: 'future_supported', pattern: /\bfuture_supported\b/i },
  { id: 'awaiting_future_support', pattern: /\bawaiting_future_support\b/i },
  { id: 'target_encounter_id', pattern: /\btarget_encounter_id\b/i },
  { id: 'shrine_rusk_confrontation', pattern: /\bshrine-rusk-confrontation\b/i },
]);

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function idText(value) {
  return value === undefined || value === null ? null : String(value);
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

async function requireGreyvaleSliceInspectorCapability(accountId, executor = { query }) {
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
    throw createHttpError('This account is not authorized to inspect Greyvale slice data.', 403);
  }
}

async function safeRead(label, fn) {
  try {
    return {
      status: 'ok',
      value: await fn(),
      error: null,
    };
  } catch (error) {
    return {
      status: 'error',
      value: null,
      error: {
        label,
        message: error?.message ?? 'Unable to load inspector section.',
        status_code: error?.statusCode ?? null,
      },
    };
  }
}

function summarizeSceneForPlayer(sceneView) {
  if (!sceneView || sceneView.state !== 'active') {
    return {
      state: sceneView?.state ?? 'unavailable',
      action_status: sceneView?.action_status ?? null,
    };
  }

  return {
    state: sceneView.state,
    scene: sceneView.scene
      ? {
          scene_id: idText(sceneView.scene.scene_id ?? sceneView.scene.id),
          key: sceneView.scene.key ?? null,
          title: sceneView.scene.title ?? sceneView.scene.name ?? null,
          location_name: sceneView.scene.location_name ?? sceneView.scene.location?.name ?? null,
        }
      : null,
    current_objective: sceneView.current_objective
      ? {
          objective_id: idText(sceneView.current_objective.objective_id),
          key: sceneView.current_objective.key ?? null,
          title: sceneView.current_objective.title ?? null,
          status: sceneView.current_objective.status ?? null,
        }
      : null,
    action_status: sceneView.action_status ?? null,
    action_window: sceneView.action_window
      ? {
          action_window_id: idText(sceneView.action_window.action_window_id),
          status: sceneView.action_window.status ?? null,
          is_open_for_player: sceneView.action_window.is_open_for_player === true,
        }
      : null,
    dialogue_entries: unique([
      ...normalizeArray(sceneView.scene_reference?.people_nearby).map((entry) => entry.dialogue_scene_id),
      ...normalizeArray(sceneView.scene_reference?.action_targets).map((entry) => entry.dialogue_scene_id),
      ...normalizeArray(sceneView.visible_affordances).map((entry) => entry.dialogue_scene_id),
      ...normalizeArray(sceneView.visible_npcs).map((entry) => entry.dialogue_scene_id),
    ]),
    available_action_count: normalizeArray(sceneView.action_composer?.suggested_actions).length,
    closer_look_count: normalizeArray(sceneView.scene_reference?.closer_looks).length,
    latest_development: sceneView.scene_result_feed?.latest_result?.summary ?? null,
    slice_endpoint: sceneView.slice_endpoint ?? null,
  };
}

function summarizeCurrentSceneForGmDev(sceneView) {
  if (!sceneView || sceneView.state !== 'active') {
    return {
      status: sceneView?.state ?? 'unavailable',
      debug: sceneView?.debug ?? null,
    };
  }

  const debug = normalizeObject(sceneView.debug);
  return {
    status: 'active',
    scene_id: idText(sceneView.scene?.scene_id ?? sceneView.scene?.id),
    scene_key: sceneView.scene?.key ?? null,
    scene_title: sceneView.scene?.title ?? sceneView.scene?.name ?? null,
    action_window: sceneView.action_window
      ? {
          action_window_id: idText(sceneView.action_window.action_window_id),
          status: sceneView.action_window.status ?? null,
          window_type: sceneView.action_window.window_type ?? null,
          submitted_action: sceneView.action_window.submitted_action ?? null,
        }
      : null,
    debug: {
      runtime_state: debug.runtime_state ?? null,
      scene_state: debug.scene_state ?? null,
      environment_source_breakdown: debug.environment_source_breakdown ?? null,
      npc_presence: debug.npc_presence ?? null,
      npc_presence_all: debug.npc_presence_all ?? [],
      slice_endpoint: debug.slice_endpoint ?? null,
    },
  };
}

function summarizeExplorationInspection(explorationRead) {
  const value = explorationRead?.value ?? null;
  const debug = value?.exploration_mechanics_debug ?? null;
  return {
    status: value?.status ?? explorationRead?.status ?? 'unavailable',
    context: value?.context ?? null,
    mechanics_debug: debug,
    coverage: {
      has_scene_state: Boolean(debug?.scene_state),
      has_free_focus_items: Array.isArray(debug?.free_focus_items),
      has_beat_action_options: Array.isArray(debug?.beat_action_options),
      has_locked_or_hidden_requirements:
        JSON.stringify(debug?.beat_action_options ?? []).includes('hidden_requirements') ||
        JSON.stringify(debug?.transitions ?? []).includes('hidden'),
      has_check_metadata: Array.isArray(debug?.check_details),
      has_state_reads: Array.isArray(debug?.state_reads),
      has_state_writes: Array.isArray(debug?.state_writes),
      has_output_provenance:
        Array.isArray(debug?.knowledge_outputs) || Array.isArray(debug?.history_outputs),
      has_transition_routing: Array.isArray(debug?.transitions),
      has_visibility_notes: Boolean(debug?.visibility_boundaries),
    },
    error: explorationRead?.error ?? null,
  };
}

function summarizeDialogueInspection(dialogueRead) {
  const value = dialogueRead?.value ?? null;
  return {
    status: value?.status ?? dialogueRead?.status ?? 'unavailable',
    context: value?.context ?? null,
    scene_state: value?.scene_state ?? null,
    availability: value?.availability ?? null,
    preview_mapping: value?.preview_mapping ?? null,
    relationship_state: value?.relationship_state ?? null,
    transcript: value?.transcript ?? null,
    completed_record: value?.completed_record ?? null,
    annotation_correction_chains: value?.annotation_correction_chains ?? null,
    audit_timeline: value?.audit_timeline ?? null,
    validation: value?.validation ?? null,
    test_paths: value?.test_paths ?? null,
    coverage: {
      has_clarifying_questions: Array.isArray(value?.availability?.clarifying_questions),
      has_committed_social_moves: Array.isArray(value?.availability?.committed_social_moves),
      has_exits: Array.isArray(value?.availability?.exits),
      has_relationship_state: Boolean(value?.relationship_state),
      has_transcript: Boolean(value?.transcript),
      has_completed_record_status: Object.hasOwn(normalizeObject(value), 'completed_record'),
      has_test_paths: Boolean(value?.test_paths),
    },
    error: dialogueRead?.error ?? null,
  };
}

async function loadGmDevMemoryDiagnostics({ campaignId, characterId }, executor = { query }) {
  if (!campaignId || !characterId) {
    return {
      status: 'unavailable',
      reason: 'active_campaign_and_character_required',
    };
  }

  await ensureDialogueFocusCommitPersistenceSchema();

  const [
    objectiveRows,
    flagRows,
    completedRecordRows,
    searchRows,
    actionWindowRows,
  ] = await Promise.all([
    executor.query(
      `
        SELECT
          objective.key AS objective_key,
          objective.title AS objective_title,
          objective_state.status,
          objective_state.created_at,
          objective_state.completed_at,
          objective_state.updated_at
        FROM dnd5e_character_objective objective_state
        JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
        JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
        WHERE quest_state.campaign_id = $1
          AND quest_state.character_id = $2
        ORDER BY objective.sort_order ASC, objective.id ASC
      `,
      [campaignId, characterId]
    ),
    executor.query(
      `
        SELECT
          flag_key,
          flag_value_json,
          flag_category,
          metadata_json,
          source_type,
          source_entity_id,
          updated_at
        FROM dnd5e_character_flag
        WHERE campaign_id = $1
          AND character_id = $2
        ORDER BY updated_at DESC, id DESC
        LIMIT 50
      `,
      [campaignId, characterId]
    ),
    executor.query(
      `
        SELECT
          id,
          dialogue_scene_key,
          transcript_id,
          compact_summary,
          exit_id,
          visibility_scope,
          knowledge_links_json,
          relationship_summary_links_json,
          completed_at
        FROM dnd5e_completed_dialogue_record
        WHERE campaign_id = $1
          AND character_id = $2
        ORDER BY completed_at DESC, id DESC
        LIMIT 25
      `,
      [campaignId, characterId]
    ),
    executor.query(
      `
        SELECT
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE visibility_scope = 'player')::int AS player_visible_count,
          COUNT(*) FILTER (WHERE visibility_scope <> 'player')::int AS gm_dev_or_hidden_count
        FROM dnd5e_dialogue_search_index
        WHERE campaign_id = $1
          AND character_id = $2
      `,
      [campaignId, characterId]
    ),
    executor.query(
      `
        SELECT
          id,
          scene_id,
          dialogue_session_id,
          combat_id,
          event_instance_id,
          window_type,
          status,
          prompt_text,
          suggested_action_key,
          opens_at,
          closed_at,
          resolution_started_at,
          resolved_at,
          resolution_summary,
          created_at,
          updated_at
        FROM dnd5e_action_window
        WHERE campaign_id = $1
          AND character_id = $2
        ORDER BY updated_at DESC, id DESC
        LIMIT 12
      `,
      [campaignId, characterId]
    ),
  ]);

  return {
    status: 'ok',
    objective_updates: objectiveRows.rows.map((row) => ({
      objective_key: row.objective_key,
      objective_title: row.objective_title,
      status: row.status,
      created_at: row.created_at,
      completed_at: row.completed_at,
      updated_at: row.updated_at,
    })),
    character_flags: flagRows.rows,
    completed_records: completedRecordRows.rows.map((row) => ({
      completed_dialogue_record_id: idText(row.id),
      dialogue_scene_key: row.dialogue_scene_key,
      transcript_id: idText(row.transcript_id),
      compact_summary: row.compact_summary,
      exit_id: row.exit_id,
      visibility_scope: row.visibility_scope,
      knowledge_links: normalizeArray(row.knowledge_links_json),
      relationship_summary_links: normalizeArray(row.relationship_summary_links_json),
      completed_at: row.completed_at,
    })),
    archive_search: {
      search_index_count: Number(searchRows.rows[0]?.count ?? 0),
      player_visible_count: Number(searchRows.rows[0]?.player_visible_count ?? 0),
      gm_dev_or_hidden_count: Number(searchRows.rows[0]?.gm_dev_or_hidden_count ?? 0),
    },
    action_windows: actionWindowRows.rows.map((row) => ({
      action_window_id: idText(row.id),
      scene_id: idText(row.scene_id),
      dialogue_session_id: idText(row.dialogue_session_id),
      combat_id: idText(row.combat_id),
      event_instance_id: idText(row.event_instance_id),
      window_type: row.window_type,
      status: row.status,
      prompt_text: row.prompt_text,
      suggested_action_key: row.suggested_action_key,
      opens_at: row.opens_at,
      closed_at: row.closed_at,
      resolution_started_at: row.resolution_started_at,
      resolved_at: row.resolved_at,
      resolution_summary: row.resolution_summary,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    duplicate_and_stale_diagnostics: {
      open_action_window_count: actionWindowRows.rows.filter((row) => row.status === 'open').length,
      latest_window_status: actionWindowRows.rows[0]?.status ?? null,
      source: 'dnd5e_action_window plus output tables; submit-level idempotency remains in lifecycle tests.',
    },
  };
}

function endpointDebugFromScene(sceneView) {
  return sceneView?.debug?.slice_endpoint ?? null;
}

function endpointPlayerFromScene(sceneView) {
  return sceneView?.slice_endpoint ?? null;
}

function deriveSliceStatus({ dashboard, currentAdventure, sceneView, endpointPlayer }) {
  const activeCharacter = dashboard?.active_character ?? currentAdventure?.active_character ?? null;
  const adventure = currentAdventure?.current_adventure ?? dashboard?.current_adventure ?? null;
  if (!activeCharacter) {
    return {
      state: 'no_active_character',
      label: 'No active character',
    };
  }
  if (!adventure?.has_active_campaign) {
    return {
      state: 'not_started',
      label: 'Greyvale not started',
    };
  }
  if (endpointPlayer?.is_endpoint_reached) {
    return {
      state: endpointPlayer.state ?? 'endpoint_reached',
      label: endpointPlayer.label ?? 'Greyvale endpoint reached',
      endpoint_scene_key: endpointPlayer.current_scene_key ?? RUSK_ENDPOINT_SCENE_KEY,
    };
  }
  return {
    state: sceneView?.state === 'active' ? 'active' : sceneView?.state ?? 'unknown',
    label: 'Greyvale active',
    current_scene_key: sceneView?.scene?.key ?? adventure.current_scene_id ?? null,
    current_objective_key: sceneView?.current_objective?.key ?? adventure.current_objective?.key ?? null,
  };
}

function identityScope({ dashboard, currentAdventure, sceneView }) {
  const adventure = currentAdventure?.current_adventure ?? dashboard?.current_adventure ?? null;
  return {
    account_id: idText(dashboard?.account?.account_id ?? currentAdventure?.account?.account_id),
    active_character_id: idText(
      dashboard?.active_character?.character_id ?? currentAdventure?.active_character?.character_id
    ),
    active_character_name:
      dashboard?.active_character?.name ?? currentAdventure?.active_character?.name ?? null,
    campaign_id: idText(
      adventure?.campaign_instance_id ?? adventure?.campaign_id ?? sceneView?.campaign_instance_id
    ),
    campaign_name: adventure?.campaign_name ?? sceneView?.campaign?.campaign_name ?? null,
    campaign_package_id: adventure?.campaign_package_id ?? 'shadows_grey_road',
    world_id: adventure?.world_id ?? sceneView?.campaign?.world_id ?? null,
    world_name: adventure?.world_name ?? sceneView?.campaign?.world_name ?? null,
  };
}

function buildPlayerVisibilityProjection({ dashboard, currentAdventure, sceneView, history, knowledge, archive, endpointPlayer }) {
  return {
    current_adventure: currentAdventure?.current_adventure ?? dashboard?.current_adventure ?? null,
    current_scene: summarizeSceneForPlayer(sceneView),
    current_objective:
      sceneView?.current_objective ?? knowledge?.current_objective ?? currentAdventure?.current_adventure?.current_objective ?? null,
    latest_development: sceneView?.scene_result_feed?.latest_result ?? null,
    recent_history: normalizeArray(history?.timeline).slice(0, 8).map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      summary: entry.summary,
      occurred_at: entry.occurred_at ?? entry.resolved_at ?? null,
    })),
    knowledge: {
      known_count: knowledge?.known_count ?? 0,
      sections: knowledge?.sections ?? {},
    },
    dialogue_archive: {
      records: normalizeArray(archive?.records).slice(0, 8).map((record) => ({
        completed_dialogue_record_id: record.completed_dialogue_record_id,
        dialogue_scene_id: record.dialogue_scene_id,
        compact_summary: record.compact_summary,
        completed_at: record.completed_at,
      })),
    },
    endpoint: endpointPlayer,
  };
}

function buildVisibilityComparison({ playerProjection, sceneView, explorationInspection, dialogueInspection, gmDevMemory, endpointDebug }) {
  const playerViolations = scanForPlayerHiddenData(playerProjection, {
    extra_value_patterns: PLAYER_INTERNAL_VALUE_PATTERNS,
  });
  const endpointViolations = scanForPlayerHiddenData(playerProjection?.endpoint ?? {}, {
    extra_value_patterns: PLAYER_INTERNAL_VALUE_PATTERNS,
  });
  const gmDevSignals = {
    current_scene_debug: Boolean(sceneView?.debug),
    exploration_mechanics_debug: Boolean(explorationInspection?.mechanics_debug),
    dialogue_debug_workspace:
      dialogueInspection?.status === 'ok' || dialogueInspection?.status === 'no_active_dialogue',
    objective_provenance_available: Array.isArray(gmDevMemory?.objective_updates),
    output_records_available: Array.isArray(gmDevMemory?.completed_records),
    endpoint_handoff_debug: Boolean(endpointDebug),
    endpoint_handoff_kind: endpointDebug?.handoff_kind ?? null,
    endpoint_future_supported_status: endpointDebug?.future_supported_status ?? null,
  };

  return {
    player_projection_safe: playerViolations.length === 0,
    player_hidden_data_violations: playerViolations,
    player_projection_sections: Object.keys(normalizeObject(playerProjection)),
    gm_dev_projection_includes_debug: Object.values(gmDevSignals).some(Boolean),
    gm_dev_signals: gmDevSignals,
    endpoint_internals_hidden_from_player: endpointViolations.length === 0,
    endpoint_internals_visible_to_gm_dev: Boolean(
      endpointDebug?.handoff_kind || endpointDebug?.future_supported_status || endpointDebug?.target_encounter_id
    ),
    comparison_notes: [
      'Player projection is a reduced view assembled from normal player read models.',
      'GM/dev projection aggregates authorized debug read models and raw output diagnostics.',
      'Projection comparison is diagnostic only; route authorization remains enforced separately.',
    ],
  };
}

function buildPathHarnessCoverage(sliceStatus) {
  return {
    status: 'prepared_for_6B.15.8',
    canonical_route_steps: GREYVALE_CANONICAL_ROUTE_STEPS,
    current_step_hint:
      sliceStatus.state === 'endpoint_reached'
        ? 'endpoint_awaiting_future_support'
        : sliceStatus.current_scene_key === RUSK_ENDPOINT_SCENE_KEY
          ? 'rusk_confrontation'
          : sliceStatus.current_scene_key ?? sliceStatus.state,
    expected_path_files_remain_domain_specific: true,
    shared_harness_usage:
      'Stage 6B.14.5 shared assertions remain the regression harness; this inspector exposes route/debug state for those tests.',
    final_acceptance_suite_deferred_to: '6B.15.8',
  };
}

export async function getGreyvaleSliceInspectorForAccount(accountId, input = {}, executor = { query }) {
  await requireGreyvaleSliceInspectorCapability(accountId, executor);

  const dashboard = await getPlayerDashboard(accountId);
  const currentAdventure = await getCurrentAdventurePreview(accountId);
  const campaignId = Number(input.campaign_instance_id ?? currentAdventure?.current_adventure?.campaign_instance_id);
  const characterId = Number(input.character_id ?? currentAdventure?.active_character?.character_id);

  const sceneView = await getCharacterSceneView({
    accountId,
    characterId: Number.isInteger(characterId) && characterId > 0 ? characterId : null,
    campaignInstanceId: Number.isInteger(campaignId) && campaignId > 0 ? campaignId : null,
    includeDebug: true,
    includeMechanics: true,
  });

  const [historyRead, knowledgeRead, archiveRead, searchRead, explorationRead, dialogueRead, gmDevMemoryRead] =
    await Promise.all([
      safeRead('campaign_history', () => getCampaignHistoryForAccount(accountId, { limit: 25 })),
      safeRead('campaign_knowledge', () => getCampaignKnowledgeForAccount(accountId)),
      safeRead('dialogue_archive', () => listPlayerDialogueArchiveForAccount(accountId, { limit: 12 }, executor)),
      safeRead('dialogue_archive_search', () =>
        searchPlayerDialogueArchiveForAccount(accountId, { query: input.search_query ?? 'Rusk' }, executor)
      ),
      safeRead('exploration_mechanics_debug', () =>
        getExplorationMechanicsDebugReadModelForAccount(accountId, input, executor)
      ),
      safeRead('dialogue_debug_workspace', () =>
        getDialogueDebugWorkspaceForAccount(accountId, input, executor)
      ),
      safeRead('gm_dev_memory_diagnostics', () =>
        loadGmDevMemoryDiagnostics(
          {
            campaignId: Number.isInteger(campaignId) && campaignId > 0 ? campaignId : null,
            characterId: Number.isInteger(characterId) && characterId > 0 ? characterId : null,
          },
          executor
        )
      ),
    ]);

  const endpointPlayer = endpointPlayerFromScene(sceneView);
  const endpointDebug = endpointDebugFromScene(sceneView);
  const sliceStatus = deriveSliceStatus({
    dashboard,
    currentAdventure,
    sceneView,
    endpointPlayer,
  });
  const playerProjection = buildPlayerVisibilityProjection({
    dashboard,
    currentAdventure,
    sceneView,
    history: historyRead.value,
    knowledge: knowledgeRead.value,
    archive: archiveRead.value,
    endpointPlayer,
  });
  const explorationInspection = summarizeExplorationInspection(explorationRead);
  const dialogueInspection = summarizeDialogueInspection(dialogueRead);
  const gmDevMemory = gmDevMemoryRead.value ?? {
    status: gmDevMemoryRead.status,
    error: gmDevMemoryRead.error,
  };

  const visibilityComparison = buildVisibilityComparison({
    playerProjection,
    sceneView,
    explorationInspection,
    dialogueInspection,
    gmDevMemory,
    endpointDebug,
  });

  return {
    status: 'ok',
    checked_at: new Date().toISOString(),
    inspector_scope: {
      stage: '6B.15.7',
      route: INSPECTOR_ROUTE,
      purpose: 'focused_greyvale_vertical_slice_inspector',
      not_full_gm_campaign_inspector: true,
      player_payloads_are_not_changed_by_this_endpoint: true,
    },
    identity_scope: identityScope({ dashboard, currentAdventure, sceneView }),
    slice_status: sliceStatus,
    current_scene: {
      player_projection: playerProjection.current_scene,
      gm_dev_debug: summarizeCurrentSceneForGmDev(sceneView),
    },
    exploration: explorationInspection,
    dialogue: dialogueInspection,
    memory_and_outputs: {
      player_projection: {
        current_objective: playerProjection.current_objective,
        latest_development: playerProjection.latest_development,
        recent_history: playerProjection.recent_history,
        knowledge: playerProjection.knowledge,
        dialogue_archive: playerProjection.dialogue_archive,
        dialogue_search: searchRead.value ?? { results: [] },
      },
      gm_dev_diagnostics: gmDevMemory,
      load_errors: [historyRead, knowledgeRead, archiveRead, searchRead, gmDevMemoryRead]
        .filter((entry) => entry.status === 'error')
        .map((entry) => entry.error),
    },
    rusk_endpoint: {
      player_projection: endpointPlayer,
      gm_dev_handoff_debug: endpointDebug,
      required_flags: RUSK_ENDPOINT_FLAGS,
      endpoint_scene_key: RUSK_ENDPOINT_SCENE_KEY,
      visibility_notes: {
        player_hides_internal_status: true,
        gm_dev_can_inspect_handoff_kind: Boolean(endpointDebug?.handoff_kind),
        gm_dev_can_inspect_future_supported_status: Boolean(endpointDebug?.future_supported_status),
      },
    },
    player_vs_gm_visibility_comparison: visibilityComparison,
    path_harness: buildPathHarnessCoverage(sliceStatus),
    diagnostics: {
      load_errors: [explorationRead, dialogueRead]
        .filter((entry) => entry.status === 'error')
        .map((entry) => entry.error),
      warnings: visibilityComparison.player_hidden_data_violations.map((violation) => violation.message),
      notes: [
        'This endpoint is GM/dev-only and mutates no slice state.',
        'Final end-to-end acceptance coverage remains deferred to Stage 6B.15.8.',
      ],
    },
  };
}

export const greyvaleSliceInspectorInternalsForTests = {
  GREYVALE_CANONICAL_ROUTE_STEPS,
  PLAYER_INTERNAL_VALUE_PATTERNS,
  buildPlayerVisibilityProjection,
  buildVisibilityComparison,
  summarizeSceneForPlayer,
};
