import { query } from '../../config/db.js';
import { validateDialogueFocusCommitScene } from '../../content/dialogueFocusCommitValidation.js';
import { createHttpError } from '../../utils/httpError.js';
import { listGmDevAnnotationCorrectionChainsForTarget } from './dialogueAnnotationCorrectionService.js';
import { ensureDialogueFocusCommitPersistenceSchema } from './dialogueFocusCommitPersistenceSchema.js';
import { getRegisteredDialogueFocusCommitSceneForDebug } from './dialogueFocusCommitRuntimeService.js';

const runtimeStateFieldName = '__runtime_state__';

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

function itemId(item, keys) {
  for (const key of keys) {
    const value = cleanText(item?.[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function questionId(question) {
  return itemId(question, ['question_id', 'id', 'slug', 'key', 'interaction_id']);
}

function moveId(move) {
  return itemId(move, ['move_id', 'id', 'slug', 'key', 'interaction_id']);
}

function exitId(exit) {
  return itemId(exit, ['exit_id', 'id', 'slug', 'key', 'interaction_id']);
}

function sceneKey(scene) {
  return itemId(scene, ['id', 'slug', 'key', 'dialogue_scene_id']);
}

function textFrom(value) {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  const object = normalizeObject(value);
  return cleanText(
    object.text ??
      object.narration ??
      object.npc_response ??
      object.result_summary ??
      object.summary ??
      object.description ??
      object.label
  );
}

function itemIsHidden(item) {
  return item?.hidden === true || normalizeObject(item?.visibility).hidden === true;
}

function hasObjectKeys(value) {
  return Object.keys(normalizeObject(value)).length > 0;
}

function authoredBranchOutputs(branch) {
  const object = normalizeObject(branch);
  if (Object.keys(object).length === 0) {
    return null;
  }
  return {
    result_summary: cleanText(object.result_summary ?? object.summary) || null,
    knowledge_grants: normalizeArray(object.knowledge_grants),
    objective_updates: normalizeArray(object.objective_updates),
    rewards: normalizeArray(object.rewards),
    character_flags: normalizeArray(object.character_flags),
    relationship_writes: normalizeArray(object.relationship_writes),
    transition: hasObjectKeys(object.transition) ? normalizeObject(object.transition) : null,
    metadata: hasObjectKeys(object.metadata_json)
      ? normalizeObject(object.metadata_json)
      : hasObjectKeys(object.metadata)
        ? normalizeObject(object.metadata)
        : null,
  };
}

function toJsonSafeRow(row) {
  if (!row) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value instanceof Date) {
        return [key, value.toISOString()];
      }
      return [key, value];
    })
  );
}

function validationGroups(scene) {
  if (!scene) {
    return {
      hard_errors: [],
      warnings: [
        {
          code: 'scene_json_unavailable',
          message:
            'Authored dialogue scene JSON was not available in the runtime registry; validation is limited to persisted state.',
        },
      ],
      debug_notices: [
        {
          code: 'registry_lookup_miss',
          message:
            'Load or register the authored dialogue scene to inspect source-path validation and authored availability rules.',
        },
      ],
    };
  }
  const validation = validateDialogueFocusCommitScene(scene, {
    profile: scene.validation_metadata?.profile ?? 'playtest_ready',
  });
  return {
    hard_errors: normalizeArray(validation.hard_errors),
    warnings: normalizeArray(validation.warnings),
    debug_notices: normalizeArray(validation.debug_notices),
  };
}

async function requireDialogueDebugCapability(accountId, executor) {
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
    throw createHttpError('This account is not authorized to view dialogue debug data.', 403);
  }
}

async function resolveDebugContext(accountId, input, executor) {
  const explicitCampaignId = Number(input.campaign_instance_id ?? input.campaign_id);
  const campaignId = Number.isInteger(explicitCampaignId) && explicitCampaignId > 0 ? explicitCampaignId : null;
  const result = await executor.query(
    `
      SELECT
        account.id AS account_id,
        account.active_character_id AS character_id,
        character.name AS character_name,
        membership.campaign_id,
        membership.current_scene_id,
        campaign.name AS campaign_name,
        campaign.world_id,
        campaign.world_instance_id
      FROM account
      LEFT JOIN dnd5e_character character
        ON character.id = account.active_character_id
        AND character.account_id = account.id
        AND character.is_active = TRUE
      LEFT JOIN dnd5e_campaign_character membership
        ON membership.character_id = character.id
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
        AND ($2::bigint IS NULL OR membership.campaign_id = $2)
      LEFT JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      WHERE account.id = $1
      ORDER BY
        membership.is_active_context DESC NULLS LAST,
        membership.is_default_solo_campaign DESC NULLS LAST,
        membership.joined_at DESC NULLS LAST,
        membership.id DESC NULLS LAST
      LIMIT 1
    `,
    [accountId, campaignId]
  );
  const row = result.rows[0] ?? null;
  if (!row) {
    throw createHttpError('Account not found', 404);
  }
  if (!row.character_id) {
    return { state: 'no_active_character', account_id: idText(row.account_id) };
  }
  if (!row.campaign_id) {
    return {
      state: 'no_active_campaign',
      account_id: idText(row.account_id),
      character_id: idText(row.character_id),
      character_name: row.character_name,
    };
  }
  return {
    state: 'active',
    account_id: idText(row.account_id),
    character_id: idText(row.character_id),
    character_name: row.character_name,
    campaign_id: idText(row.campaign_id),
    campaign_name: row.campaign_name,
    current_scene_id: idText(row.current_scene_id),
    world_id: idText(row.world_id),
    world_instance_id: idText(row.world_instance_id),
  };
}

async function loadRuntimeStateRow(context, input, executor) {
  const params = [context.campaign_id, context.character_id];
  const conditions = [
    'campaign_id = $1',
    'character_id = $2',
    'field_name = $3',
    "scope = 'dialogue_scene_state'",
  ];
  params.push(runtimeStateFieldName);
  const requestedScene = cleanText(input.dialogue_scene_id ?? input.dialogueSceneId ?? input.scene_key);
  if (requestedScene) {
    params.push(requestedScene);
    conditions.push(`dialogue_scene_key = $${params.length}`);
  }
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_scene_state
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    params
  );
  return result.rows[0] ?? null;
}

async function loadRows(table, whereClause, params, executor, orderBy = 'updated_at DESC, id DESC') {
  const result = await executor.query(
    `
      SELECT *
      FROM ${table}
      WHERE ${whereClause}
      ORDER BY ${orderBy}
    `,
    params
  );
  return result.rows;
}

async function loadCompletedRecord({ runtimeState, input, context, executor }) {
  const explicitId = Number(input.record_id ?? input.completed_dialogue_record_id);
  const recordId =
    Number.isInteger(explicitId) && explicitId > 0
      ? explicitId
      : Number(runtimeState?.completed_dialogue_record_id ?? 0);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return null;
  }
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_completed_dialogue_record
      WHERE id = $1
        AND campaign_id = $2
        AND character_id = $3
      LIMIT 1
    `,
    [recordId, context.campaign_id, context.character_id]
  );
  return result.rows[0] ?? null;
}

function questionRecordMap(records) {
  return new Map(records.map((record) => [record.clarifying_question_id, record]));
}

function availabilityForQuestions(scene, runtimeState, questionRecords) {
  const byId = questionRecordMap(questionRecords);
  return normalizeArray(scene?.clarifying_questions).map((question) => {
    const id = questionId(question);
    const record = byId.get(id) ?? null;
    const locked =
      normalizeArray(runtimeState.locked_question_ids).includes(id) ||
      (question.locked_by_default === true && !normalizeArray(runtimeState.unlocked_question_ids).includes(id));
    const hidden = itemIsHidden(question);
    const status = hidden ? 'hidden' : record?.status ?? (locked ? 'locked' : 'available');
    return {
      interaction_id: id,
      label: cleanText(question.label ?? question.prompt) || id,
      target_id: cleanText(question.target_id) || null,
      status,
      visibility: hidden ? 'hidden' : cleanText(question.visibility?.mode ?? question.visibility) || 'visible',
      failed_requirements: locked && !record ? ['locked_by_runtime_state_or_authored_default'] : [],
      unlock_source: normalizeArray(record?.unlocked_by_json),
      retry_state: normalizeObject(record?.retry_state_json ?? question.retry_policy),
      check: normalizeObject(question.check),
      check_visibility: cleanText(question.check?.visibility ?? question.check_visibility) || 'visible',
      source_path: `clarifying_questions.${id}`,
      record_id: idText(record?.id),
    };
  });
}

function availabilityForMoves(scene, runtimeState) {
  return normalizeArray(scene?.committed_social_moves).map((move) => {
    const id = moveId(move);
    const hidden = itemIsHidden(move);
    const locked = normalizeArray(runtimeState.locked_move_ids).includes(id);
    return {
      interaction_id: id,
      label: cleanText(move.label) || id,
      target_id: cleanText(move.target_id) || null,
      status: hidden ? 'hidden' : locked ? 'locked' : 'available',
      failed_requirements: locked ? ['locked_by_runtime_state'] : [],
      social_move_type: cleanText(move.social_move_type) || null,
      social_tags: normalizeArray(move.social_tags),
      tone: cleanText(move.tone) || null,
      requires_check: move.requires_check === true,
      check: normalizeObject(move.check),
      availability_requirements_debug: normalizeObject(move.availability),
      authored_outputs: {
        on_success: authoredBranchOutputs(move.on_success),
        on_failure: authoredBranchOutputs(move.on_failure),
      },
      source_path: `committed_social_moves.${id}`,
    };
  });
}

function availabilityForExits(scene, runtimeState) {
  return normalizeArray(scene?.dialogue_exits ?? scene?.dialogue_exit ?? scene?.exits).map((exit) => {
    const id = exitId(exit);
    const hidden = itemIsHidden(exit);
    const transition = normalizeObject(exit.transition);
    return {
      interaction_id: id,
      label: cleanText(exit.label ?? exit.title) || id,
      status: hidden ? 'hidden' : runtimeState.status === 'active' ? 'available' : 'resolved',
      exit_mode: cleanText(exit.exit_type ?? exit.type) || 'exit',
      transition_target: transition.target_type
        ? {
            target_type: cleanText(transition.target_type ?? transition.type),
            target_id: cleanText(transition.target_id ?? transition.scene_id ?? transition.dialogue_scene_id),
          }
        : null,
      transition_debug: hasObjectKeys(transition) ? transition : null,
      failed_requirements: [],
      source_path: `dialogue_exits.${id}`,
    };
  });
}

function latestPreviewMapping(socialMoveRecords) {
  const latest = socialMoveRecords[0] ?? null;
  if (!latest) {
    return {
      status: 'none',
      message: 'No committed social move preview/submission has been recorded yet.',
    };
  }
  const preview = normalizeObject(latest.preview_metadata_json);
  return {
    status: latest.status,
    social_move_record_id: idText(latest.id),
    submitted_text: latest.submitted_text,
    selected_authored_move_id: latest.committed_social_move_id,
    matched_authored_move_id: latest.committed_social_move_id,
    generic_fallback_id: latest.generic_fallback_id,
    mapping_source: latest.generic_fallback_id
      ? 'generic_fallback'
      : latest.committed_social_move_id
        ? 'selected_or_keyword'
        : 'revise_required',
    confidence: latest.matched_move_confidence === null ? null : Number(latest.matched_move_confidence),
    social_move_type: latest.social_move_type,
    social_tags: normalizeArray(latest.social_tags_json),
    tone_metadata: normalizeObject(latest.tone_metadata_json),
    target_participant: normalizeObject(latest.tone_metadata_json).target_id ?? null,
    known_context_used: normalizeArray(preview.known_context),
    check: {
      requires_check: latest.requires_check === true,
      visibility: latest.check_visibility,
      hidden_dc: normalizeObject(latest.check_result_json).difficulty_class ?? null,
      check_type: normalizeObject(latest.check_result_json).skill?.name ?? preview.check_preview?.label ?? null,
    },
    authored_assistance: normalizeArray(preview.assistance),
    overlap_warnings: normalizeArray(preview.overlap_warnings),
    revise_prompt_reason: preview.status === 'revise' ? preview.message ?? null : null,
    fallback: {
      available: !latest.generic_fallback_id ? null : true,
      exhausted: false,
    },
    raw_preview_debug: normalizeObject(latest.preview_debug_json),
  };
}

function mapTranscriptTurns(turnRows) {
  return turnRows.map((turn) => ({
    turn_id: idText(turn.id),
    turn_index: Number(turn.turn_index),
    turn_type: turn.turn_type,
    speaker: {
      type: turn.speaker_type,
      id: turn.speaker_id,
      label: turn.speaker_label,
    },
    source_interaction_id: turn.source_interaction_id,
    beat_id: idText(turn.beat_id),
    action_id: idText(turn.action_id),
    visibility_scope: turn.visibility_scope,
    player_facing_content: normalizeObject(turn.player_facing_content_json),
    gm_dev_content_ref: normalizeObject(turn.gm_dev_content_ref_json),
    created_at: turn.created_at,
  }));
}

function auditRecordsFromRows(rows) {
  return rows.map((row) => ({
    audit_record_id: idText(row.id),
    audit_type: row.audit_type,
    source_interaction_id: row.source_interaction_id,
    source_result_branch: row.source_result_branch,
    participant_id: row.participant_id,
    npc_id: idText(row.npc_id),
    field_name: row.field_name,
    scope: row.scope,
    old_value: row.old_value_json,
    new_value: row.new_value_json,
    reason: row.reason,
    player_facing_status: row.player_facing_status,
    related_social_move_record_id: idText(row.related_social_move_record_id),
    related_clarifying_question_record_id: idText(row.related_clarifying_question_record_id),
    related_exit_id: row.related_exit_id,
    created_at: row.created_at,
  }));
}

function buildAuditTimeline({ questionRecords, socialMoveRecords, relationshipAuditRows, transcriptTurns, runtimeState }) {
  const records = [];
  for (const record of questionRecords) {
    records.push({
      event_id: `clarifying_question:${record.id}`,
      event_type: 'clarifying_question_resolution',
      interaction_id: record.clarifying_question_id,
      status: record.status,
      summary: textFrom(record.persisted_result_json) || record.status,
      created_at: record.resolved_at ?? record.updated_at ?? record.created_at,
    });
  }
  for (const record of socialMoveRecords) {
    records.push({
      event_id: `social_move:${record.id}`,
      event_type: 'committed_social_move_result',
      interaction_id: record.committed_social_move_id ?? record.generic_fallback_id,
      status: record.status,
      summary: record.latest_development ?? record.result_text ?? record.submitted_text,
      created_at: record.resolved_at ?? record.updated_at ?? record.created_at,
    });
  }
  for (const audit of relationshipAuditRows) {
    records.push({
      event_id: `relationship_audit:${audit.id}`,
      event_type: `relationship_${audit.audit_type}`,
      interaction_id: audit.source_interaction_id,
      status: audit.player_facing_status,
      summary: `${audit.field_name} ${audit.audit_type}`,
      created_at: audit.created_at,
      field_name: audit.field_name,
      scope: audit.scope,
    });
  }
  for (const turn of transcriptTurns) {
    records.push({
      event_id: `transcript_turn:${turn.id}`,
      event_type: `transcript_${turn.turn_type}`,
      interaction_id: turn.source_interaction_id,
      status: turn.visibility_scope,
      summary: textFrom(turn.player_facing_content_json) || turn.turn_type,
      created_at: turn.created_at,
    });
  }
  if (runtimeState.exit_result) {
    records.push({
      event_id: 'dialogue_exit:runtime',
      event_type: 'dialogue_exit',
      interaction_id: runtimeState.exit_result.exit_id ?? runtimeState.exit_result.id ?? null,
      status: runtimeState.status,
      summary: textFrom(runtimeState.exit_result),
      created_at: runtimeState.exit_result.resolved_at ?? null,
    });
  }
  return records
    .filter((record) => record.created_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function buildTestPaths(validation, scene, runtimeState) {
  const checks = [];
  checks.push({
    check_id: 'no_hard_validation_errors',
    label: 'No hard validation errors',
    status: normalizeArray(validation.hard_errors).length === 0 ? 'pass' : 'fail',
  });
  checks.push({
    check_id: 'has_reachable_exit',
    label: 'At least one authored exit is present',
    status: normalizeArray(scene?.dialogue_exits ?? scene?.exits).length > 0 ? 'pass' : 'unknown',
  });
  checks.push({
    check_id: 'has_decision_path',
    label: 'At least one committed move or exit is present',
    status:
      normalizeArray(scene?.committed_social_moves).length > 0 ||
      normalizeArray(scene?.dialogue_exits ?? scene?.exits).length > 0
        ? 'pass'
        : 'unknown',
  });
  checks.push({
    check_id: 'fallback_policy_sanity',
    label: 'Fallback policy state',
    status: runtimeState?.fallback_usage?.exhausted === true ? 'warning' : 'pass',
  });
  return {
    note: 'Dialogue path harness is available for GM/dev simulation. Runs use real runtime services and require explicit active-context mutation acknowledgement.',
    run_endpoint: '/api/dev/dialogue-path-test/run',
    available_modes: [
      'happy_path',
      'failure_path',
      'fallback_path',
      'minimal_interaction_path',
      'max_clarifying_question_path',
      'relationship_state_edge_case',
      'exit_transition_path',
      'validation_only',
      'all_authored_branches_smoke',
    ],
    checks,
  };
}

async function loadAnnotationCorrectionChains({ completedRecord, sceneKeyValue, executor }) {
  const targetIds = [idText(completedRecord?.id), sceneKeyValue].filter(Boolean);
  if (targetIds.length === 0) {
    return { chains: [] };
  }
  return listGmDevAnnotationCorrectionChainsForTarget({ target_ids: targetIds }, executor);
}

export async function getDialogueDebugWorkspaceForAccount(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  await requireDialogueDebugCapability(accountId, executor);
  const context = await resolveDebugContext(accountId, input, executor);
  if (context.state !== 'active') {
    return {
      status: context.state,
      checked_at: new Date().toISOString(),
      context,
      message: 'No active character/campaign context is available for dialogue debugging.',
    };
  }

  const stateRow = await loadRuntimeStateRow(context, input, executor);
  const runtimeState = normalizeObject(stateRow?.value_json);
  const requestedSceneId =
    cleanText(input.dialogue_scene_id ?? input.dialogueSceneId ?? input.scene_key) ||
    cleanText(runtimeState.dialogue_scene_id ?? stateRow?.dialogue_scene_key);
  const scene = getRegisteredDialogueFocusCommitSceneForDebug({ dialogue_scene_id: requestedSceneId });
  const validation = validationGroups(scene);
  const sceneKeyValue = cleanText(sceneKey(scene) || stateRow?.dialogue_scene_key || requestedSceneId);

  if (!stateRow) {
    return {
      status: 'no_active_dialogue',
      checked_at: new Date().toISOString(),
      context,
      validation,
      message: 'No active Dialogue Focus/Commit runtime state was found.',
    };
  }

  const questionRecords = await loadRows(
    'dnd5e_dialogue_clarifying_question_record',
    'dialogue_scene_state_id = $1',
    [stateRow.id],
    executor
  );
  const socialMoveRecords = await loadRows(
    'dnd5e_dialogue_social_move_record',
    'dialogue_scene_state_id = $1',
    [stateRow.id],
    executor
  );
  const fallbackRows = await loadRows(
    'dnd5e_dialogue_generic_fallback_usage',
    'dialogue_scene_state_id = $1',
    [stateRow.id],
    executor
  );
  const transcriptId = runtimeState.transcript_id ?? input.transcript_id ?? null;
  const transcriptRows = transcriptId
    ? await loadRows('dnd5e_dialogue_transcript', 'id = $1', [transcriptId], executor)
    : [];
  const transcriptTurns = transcriptId
    ? await loadRows(
        'dnd5e_dialogue_turn',
        'transcript_id = $1',
        [transcriptId],
        executor,
        'turn_index ASC, id ASC'
      )
    : [];
  const completedRecord = await loadCompletedRecord({ runtimeState, input, context, executor });
  const definitionRows = await loadRows(
    'dnd5e_dialogue_relationship_state_definition',
    '(campaign_id IS NULL OR campaign_id = $1) AND is_active = TRUE',
    [context.campaign_id],
    executor,
    'field_name ASC, id ASC'
  );
  const persistentRows = await loadRows(
    'dnd5e_dialogue_npc_relationship_state',
    'campaign_id = $1 AND COALESCE(character_id, 0) = COALESCE($2, 0)',
    [context.campaign_id, context.character_id],
    executor,
    'updated_at DESC, id DESC'
  );
  const sceneLocalRows = await loadRows(
    'dnd5e_dialogue_scene_state',
    'campaign_id = $1 AND character_id = $2 AND dialogue_scene_key = $3 AND field_name <> $4',
    [context.campaign_id, context.character_id, sceneKeyValue, runtimeStateFieldName],
    executor
  );
  const auditRows = await loadRows(
    'dnd5e_dialogue_relationship_audit_record',
    'campaign_id = $1 AND character_id = $2 AND ($3::bigint IS NULL OR dialogue_scene_state_id = $3)',
    [context.campaign_id, context.character_id, stateRow.id],
    executor,
    'created_at DESC, id DESC'
  );
  const chains = await loadAnnotationCorrectionChains({ completedRecord, sceneKeyValue, executor });

  const availability = {
    clarifying_questions: availabilityForQuestions(scene, runtimeState, questionRecords),
    committed_social_moves: availabilityForMoves(scene, runtimeState),
    exits: availabilityForExits(scene, runtimeState),
  };
  const auditRecords = auditRecordsFromRows(auditRows);
  const mappedTranscriptTurns = mapTranscriptTurns(transcriptTurns);

  return {
    status: normalizeArray(validation.hard_errors).length > 0 ? 'error' : 'ok',
    checked_at: new Date().toISOString(),
    context,
    scene_state: {
      dialogue_scene_id: sceneKeyValue,
      dialogue_scene_title: cleanText(scene?.title ?? scene?.name ?? runtimeState.dialogue_scene_title),
      dialogue_scene_state_id: idText(stateRow.id),
      scene_instance_id: idText(stateRow.scene_id),
      status: runtimeState.status ?? 'active',
      participants: normalizeArray(scene?.participants ?? runtimeState.participants),
      entry_source: normalizeObject(runtimeState.entry_source),
      current_surface_ref: scene?.conversation_surface?.surface_id ?? null,
      latest_development: runtimeState.latest_development ?? null,
      committed_social_move_count: Number(runtimeState.committed_social_move_count ?? 0),
      soft_target_max: Number(runtimeState.soft_target_max ?? 3),
      fallback_usage: runtimeState.fallback_usage ?? normalizeObject(fallbackRows[0]),
      current_exits: availability.exits,
      exit_result: runtimeState.exit_result ?? null,
      transition: runtimeState.transition ?? null,
      raw_runtime_state: runtimeState,
    },
    availability,
    preview_mapping: latestPreviewMapping(socialMoveRecords),
    relationship_state: {
      definitions: definitionRows.map(toJsonSafeRow),
      persistent_npc_state: persistentRows.map(toJsonSafeRow),
      scene_local_state: sceneLocalRows.map(toJsonSafeRow),
      recent_reads: auditRecords.filter((record) =>
        ['read', 'availability_check', 'shorthand_resolution'].includes(record.audit_type)
      ),
      recent_writes: auditRecords.filter((record) => record.audit_type === 'write'),
      audit_records: auditRecords,
    },
    transcript: {
      transcript: toJsonSafeRow(transcriptRows[0]),
      turns: mappedTranscriptTurns,
      filters: ['player_facing_only', 'gm_dev_visible', 'by_turn_type', 'by_interaction_id'],
    },
    completed_record: completedRecord ? toJsonSafeRow(completedRecord) : null,
    annotation_correction_chains: {
      chains: chains.chains,
      note: 'Full annotation/correction chain history is visible here for GM/dev review; player-facing archive APIs only receive approved active records.',
    },
    audit_timeline: {
      records: buildAuditTimeline({
        questionRecords,
        socialMoveRecords,
        relationshipAuditRows: auditRows,
        transcriptTurns,
        runtimeState,
      }),
    },
    validation,
    test_paths: buildTestPaths(validation, scene, runtimeState),
  };
}
