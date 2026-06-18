import { query } from '../../config/db.js';
import { createHttpError } from '../../utils/httpError.js';
import {
  getPlayerFacingLifecycleForCompletedRecord,
  listGmDevAnnotationCorrectionChainsForTarget,
} from './dialogueAnnotationCorrectionService.js';
import { ensureDialogueFocusCommitPersistenceSchema } from './dialogueFocusCommitPersistenceSchema.js';

const runtimeStateFieldName = '__runtime_state__';
const playerTurnTypes = new Set([
  'npc_surface',
  'player_submission',
  'clarifying_question',
  'clarifying_answer',
  'committed_social_move',
  'social_move_result',
  'exit',
  'system_summary',
]);
const playerInteractionIdAliases = new Map([
  ['exit_rusk_combat_pending', 'exit_rusk_confrontation'],
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function interactionIdForPlayer(id) {
  const value = cleanText(id);
  return playerInteractionIdAliases.get(value) ?? value;
}

function json(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
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

function participantForArchive(participant) {
  return {
    participant_id: itemId(participant, ['participant_id', 'id', 'slug', 'key']),
    label: cleanText(participant.known_label ?? participant.unknown_label ?? participant.label),
    unknown_label: cleanText(participant.unknown_label) || null,
    known_label: cleanText(participant.known_label) || null,
    npc_key: cleanText(participant.npc_key ?? participant.npc_template_slug ?? participant.template_slug) || null,
  };
}

function mapContext(context) {
  return {
    campaign_id: context.campaign.campaign_id,
    world_instance_id: context.campaign.world_instance_id ?? null,
    character_id: context.character.character_id,
    scene_id: context.campaign.current_scene_id ?? null,
  };
}

async function updateRuntimeStateValue(stateRow, runtimeState, executor) {
  const result = await executor.query(
    `
      UPDATE dnd5e_dialogue_scene_state
      SET value_json = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [stateRow.id, json(runtimeState)]
  );
  return result.rows[0];
}

async function loadTranscriptById(transcriptId, executor) {
  if (!transcriptId) {
    return null;
  }
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_transcript
      WHERE id = $1
      LIMIT 1
    `,
    [transcriptId]
  );
  return result.rows[0] ?? null;
}

async function findActiveTranscript({ context, scene, executor }) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_transcript
      WHERE campaign_id = $1
        AND character_id = $2
        AND dialogue_scene_key = $3
        AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [context.campaign.campaign_id, context.character.character_id, sceneKey(scene)]
  );
  return result.rows[0] ?? null;
}

async function createTranscript({ context, scene, executor }) {
  const ids = mapContext(context);
  const result = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_transcript (
        campaign_id,
        world_instance_id,
        character_id,
        scene_id,
        dialogue_scene_key,
        participants_json,
        visibility_scope,
        status,
        provenance_json
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'player', 'active', $7::jsonb)
      RETURNING *
    `,
    [
      ids.campaign_id,
      ids.world_instance_id,
      ids.character_id,
      ids.scene_id,
      sceneKey(scene),
      json(normalizeArray(scene.participants).map(participantForArchive), []),
      json({ source: 'dialogue_focus_commit_runtime' }),
    ]
  );
  return result.rows[0];
}

async function nextTurnIndex(transcriptId, executor) {
  const result = await executor.query(
    `
      SELECT COALESCE(MAX(turn_index), -1) + 1 AS next_index
      FROM dnd5e_dialogue_turn
      WHERE transcript_id = $1
    `,
    [transcriptId]
  );
  return Number(result.rows[0]?.next_index ?? 0);
}

function playerFacingContent(content = {}) {
  const object = normalizeObject(content);
  const safe = {
    text: cleanText(object.text) || null,
    summary: cleanText(object.summary) || null,
    label: cleanText(object.label) || null,
    result_text: cleanText(object.result_text) || null,
    mechanics_label: cleanText(object.mechanics_label) || null,
    check_result: normalizeObject(object.check_result),
    knowledge_links: normalizeArray(object.knowledge_links ?? object.knowledge_grants_applied),
    relationship_updates: normalizeArray(object.relationship_updates),
  };
  return Object.fromEntries(
    Object.entries(safe).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (value && typeof value === 'object') {
        return Object.keys(value).length > 0;
      }
      return Boolean(value);
    })
  );
}

export async function appendDialogueTranscriptTurn({ context, transcript, turnType, content = {}, speaker = {}, sourceInteractionId = null, visibility = 'player', provenance = {}, gmDevContentRef = {}, executor = { query } }) {
  if (!transcript?.id) {
    throw createHttpError('Dialogue transcript is required before appending a turn', 409);
  }
  if (!playerTurnTypes.has(turnType)) {
    throw createHttpError(`Unsupported dialogue transcript turn type "${turnType}"`, 409);
  }
  const safeContent = playerFacingContent(content);
  const index = await nextTurnIndex(transcript.id, executor);
  const ids = mapContext(context);
  const result = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_turn (
        transcript_id,
        campaign_id,
        character_id,
        turn_index,
        turn_type,
        speaker_type,
        speaker_id,
        speaker_label,
        player_facing_content_json,
        gm_dev_content_ref_json,
        source_interaction_id,
        visibility_scope,
        provenance_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb)
      RETURNING *
    `,
    [
      transcript.id,
      ids.campaign_id,
      ids.character_id,
      index,
      turnType,
      cleanText(speaker.type) || null,
      cleanText(speaker.id) || null,
      cleanText(speaker.label) || null,
      json(safeContent),
      json(gmDevContentRef),
      cleanText(sourceInteractionId) || null,
      visibility,
      json(provenance),
    ]
  );
  return result.rows[0];
}

function surfaceText(scene) {
  return normalizeArray(scene.conversation_surface?.paragraphs)
    .map(textFrom)
    .filter(Boolean)
    .join('\n\n');
}

export async function ensureDialogueTranscriptForRuntime({ context, scene, stateRow, executor = { query } }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const runtimeState = normalizeObject(stateRow.value_json);
  let transcript = await loadTranscriptById(runtimeState.transcript_id, executor);
  if ((!transcript || transcript.status !== 'active') && runtimeState.status === 'active') {
    transcript = await findActiveTranscript({ context, scene, executor });
  }
  if (!transcript && runtimeState.status === 'active') {
    transcript = await createTranscript({ context, scene, executor });
  }
  if (!transcript) {
    return {
      transcript: null,
      stateRow,
      runtimeState,
    };
  }

  let nextStateRow = stateRow;
  const surfaceAlreadyRecorded = runtimeState.transcript_surface_recorded === sceneKey(scene);
  runtimeState.transcript_id = String(transcript.id);

  if (!surfaceAlreadyRecorded && runtimeState.status === 'active') {
    const surfaceTurn = await appendDialogueTranscriptTurn({
      context,
      transcript,
      turnType: 'npc_surface',
      content: {
        text: surfaceText(scene),
        label: cleanText(scene.title ?? scene.name),
      },
      speaker: { type: 'scene', id: sceneKey(scene), label: cleanText(scene.title ?? scene.name) },
      sourceInteractionId: itemId(scene.conversation_surface, ['surface_id', 'id', 'slug', 'key']),
      provenance: { source: 'conversation_surface' },
      executor,
    });
    runtimeState.transcript_surface_recorded = sceneKey(scene);
    runtimeState.transcript_start_turn_id = String(surfaceTurn.id);
  }

  if (String(stateRow.value_json?.transcript_id ?? '') !== String(runtimeState.transcript_id) || !surfaceAlreadyRecorded) {
    nextStateRow = await updateRuntimeStateValue(stateRow, runtimeState, executor);
  }

  return {
    transcript,
    stateRow: nextStateRow,
    runtimeState,
  };
}

async function loadTranscriptTurns(transcriptId, { visibility = 'player', executor = { query } } = {}) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_turn
      WHERE transcript_id = $1
        AND ($2::text IS NULL OR visibility_scope = $2)
      ORDER BY turn_index ASC, id ASC
    `,
    [transcriptId, visibility]
  );
  return result.rows;
}

function turnText(turn) {
  const content = normalizeObject(turn.player_facing_content_json);
  return cleanText(content.result_text ?? content.text ?? content.summary ?? content.label);
}

function authoredCompactSummary(scene) {
  return cleanText(
    scene.completed_dialogue_record?.compact_summary ??
      scene.completed_dialogue_record?.summary ??
      scene.completed_dialogue_record_template?.compact_summary ??
      scene.summary_behavior?.completed_summary ??
      scene.summary_behavior?.player_summary_template
  );
}

function conservativeSummary({ scene, runtimeState, turns }) {
  const latest = cleanText(runtimeState.latest_development?.summary ?? runtimeState.latest_development?.text);
  if (latest) {
    return latest;
  }
  const resultTurn = [...turns].reverse().find((turn) => turn.turn_type === 'social_move_result');
  if (resultTurn && turnText(resultTurn)) {
    return turnText(resultTurn);
  }
  const exitText = cleanText(runtimeState.exit_result?.text);
  if (exitText) {
    return exitText;
  }
  return cleanText(`The conversation at ${scene.title ?? scene.name ?? sceneKey(scene)} ended without a major recorded change.`);
}

function buildCompactSummary({ scene, runtimeState, turns }) {
  const authored = authoredCompactSummary(scene);
  if (authored) {
    return {
      text: authored,
      source: 'authored',
    };
  }
  return {
    text: conservativeSummary({ scene, runtimeState, turns }),
    source: 'conservative_generated',
  };
}

function aggregateLinks({ questionRecords, socialMoveRecords }) {
  return {
    knowledge_links: [
      ...questionRecords.flatMap((record) => normalizeArray(record.knowledge_links_json)),
      ...socialMoveRecords.flatMap((record) => normalizeArray(record.knowledge_links_json)),
    ].filter(Boolean),
    canonical_outputs: [
      ...questionRecords.flatMap((record) => normalizeArray(record.canonical_output_links_json)),
      ...socialMoveRecords.flatMap((record) => normalizeArray(record.canonical_output_links_json)),
    ].filter(Boolean),
    relationship_summary_links: [
      ...questionRecords.flatMap((record) => normalizeArray(record.persisted_result_json?.relationship_audit_links)),
      ...socialMoveRecords.flatMap((record) => normalizeArray(record.relationship_audit_links_json)),
    ].filter(Boolean),
  };
}

async function loadDialogueRecordsForFinalization({ stateRow, executor }) {
  const [questions, moves] = await Promise.all([
    executor.query(
      `
        SELECT *
        FROM dnd5e_dialogue_clarifying_question_record
        WHERE dialogue_scene_state_id = $1
        ORDER BY id ASC
      `,
      [stateRow.id]
    ),
    executor.query(
      `
        SELECT *
        FROM dnd5e_dialogue_social_move_record
        WHERE dialogue_scene_state_id = $1
        ORDER BY id ASC
      `,
      [stateRow.id]
    ),
  ]);
  return {
    questionRecords: questions.rows,
    socialMoveRecords: moves.rows,
  };
}

function npcProfileRecapHooks(scene, summary) {
  const hooks = [];
  const sceneHook = normalizeObject(scene.npc_profile_recap ?? scene.profile_recap);
  if (sceneHook.enabled === true) {
    for (const participant of normalizeArray(scene.participants)) {
      hooks.push({
        participant_id: participantForArchive(participant).participant_id,
        recap_text: cleanText(sceneHook.text ?? summary.text),
        source: summary.source,
        apply_timing: cleanText(sceneHook.apply_timing ?? 'on_dialogue_finalization'),
      });
    }
  }
  return hooks.filter((hook) => hook.participant_id && hook.recap_text);
}

async function indexCompletedDialogueRecord({ context, record, transcript, turns, aggregate, executor }) {
  const text = [
    record.compact_summary,
    ...turns.map(turnText),
  ].filter(Boolean).join('\n');
  if (!text) {
    return null;
  }
  const result = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_search_index (
        campaign_id,
        character_id,
        scene_id,
        dialogue_record_id,
        transcript_id,
        searchable_type,
        searchable_id,
        player_facing_text,
        topics_json,
        npc_ids_json,
        knowledge_entry_ids_json,
        relationship_field_refs_json,
        visibility_scope
      )
      VALUES ($1, $2, $3, $4, $5, 'completed_dialogue_record', $4, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, 'player')
      ON CONFLICT (searchable_type, searchable_id, visibility_scope) DO UPDATE
      SET player_facing_text = EXCLUDED.player_facing_text,
          topics_json = EXCLUDED.topics_json,
          npc_ids_json = EXCLUDED.npc_ids_json,
          knowledge_entry_ids_json = EXCLUDED.knowledge_entry_ids_json,
          relationship_field_refs_json = EXCLUDED.relationship_field_refs_json,
          updated_at = NOW()
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.character.character_id,
      context.campaign.current_scene_id ?? null,
      record.id,
      transcript.id,
      text,
      json(aggregate.knowledge_links),
      json(normalizeArray(transcript.participants_json).map((participant) => participant.npc_key ?? participant.participant_id).filter(Boolean)),
      json(aggregate.knowledge_links),
      json(aggregate.relationship_summary_links),
    ]
  );
  return result.rows[0];
}

async function existingCompletedRecord(runtimeState, executor) {
  const id = Number(runtimeState.completed_dialogue_record_id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_completed_dialogue_record
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function finalizeDialogueArchive({ context, scene, stateRow, transcript, runtimeState, executor = { query } }) {
  const existing = await existingCompletedRecord(runtimeState, executor);
  if (existing) {
    return {
      completedRecord: existing,
      transcript,
      alreadyFinalized: true,
    };
  }

  const activeTranscript = transcript ?? await loadTranscriptById(runtimeState.transcript_id, executor);
  if (!activeTranscript) {
    throw createHttpError('Cannot finalize dialogue without a transcript', 409);
  }
  const turns = await loadTranscriptTurns(activeTranscript.id, { visibility: 'player', executor });
  const summary = buildCompactSummary({ scene, runtimeState, turns });
  const records = await loadDialogueRecordsForFinalization({ stateRow, executor });
  const aggregate = aggregateLinks(records);
  const startTurn = turns[0] ?? null;
  const endTurn = turns[turns.length - 1] ?? null;
  const recapHooks = npcProfileRecapHooks(scene, summary);

  const inserted = await executor.query(
    `
      INSERT INTO dnd5e_completed_dialogue_record (
        campaign_id,
        world_instance_id,
        character_id,
        dialogue_scene_key,
        scene_id,
        transcript_id,
        participants_json,
        entry_source_json,
        start_turn_id,
        end_turn_id,
        exit_mode,
        exit_id,
        transition_ref_json,
        compact_summary,
        canonical_outputs_json,
        knowledge_links_json,
        history_event_links_json,
        relationship_summary_links_json,
        annotation_chain_ids_json,
        correction_chain_ids_json,
        visibility_scope,
        player_facing_metadata_json,
        started_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14, $15::jsonb, $16::jsonb, '[]'::jsonb, $17::jsonb, '[]'::jsonb, '[]'::jsonb, 'player', $18::jsonb, $19)
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.campaign.world_instance_id,
      context.character.character_id,
      sceneKey(scene),
      context.campaign.current_scene_id ?? null,
      activeTranscript.id,
      json(normalizeArray(scene.participants).map(participantForArchive), []),
      json(runtimeState.entry_source ?? scene.entry_behavior ?? {}),
      startTurn?.id ?? null,
      endTurn?.id ?? null,
      cleanText(runtimeState.exit_result?.exit_type) || null,
      cleanText(runtimeState.exit_result?.exit_id) || null,
      json(runtimeState.transition ?? {}),
      summary.text,
      json(aggregate.canonical_outputs, []),
      json(aggregate.knowledge_links, []),
      json(aggregate.relationship_summary_links, []),
      json({
        summary_source: summary.source,
        npc_profile_recap_hooks: recapHooks,
      }),
      activeTranscript.started_at ?? null,
    ]
  );
  const completedRecord = inserted.rows[0];

  const summaryTurn = await appendDialogueTranscriptTurn({
    context,
    transcript: activeTranscript,
    turnType: 'system_summary',
    content: {
      text: summary.text,
      summary: summary.text,
    },
    speaker: { type: 'system', id: 'dialogue_summary', label: 'Summary' },
    sourceInteractionId: `completed_dialogue_record:${completedRecord.id}`,
    provenance: { summary_source: summary.source },
    executor,
  });

  const updatedTranscript = await executor.query(
    `
      UPDATE dnd5e_dialogue_transcript
      SET status = 'completed',
          completed_at = NOW(),
          summary_json = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      activeTranscript.id,
      json({
        compact_summary: summary.text,
        summary_source: summary.source,
        completed_dialogue_record_id: String(completedRecord.id),
      }),
    ]
  );

  await executor.query(
    `
      UPDATE dnd5e_completed_dialogue_record
      SET end_turn_id = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [completedRecord.id, summaryTurn.id]
  );

  await indexCompletedDialogueRecord({
    context,
    record: completedRecord,
    transcript: activeTranscript,
    turns: [...turns, summaryTurn],
    aggregate,
    executor,
  });

  runtimeState.completed_dialogue_record_id = String(completedRecord.id);
  runtimeState.transcript_status = 'completed';
  const nextStateRow = await updateRuntimeStateValue(stateRow, runtimeState, executor);

  return {
    completedRecord,
    transcript: updatedTranscript.rows[0],
    stateRow: nextStateRow,
    summary,
    recapHooks,
    alreadyFinalized: false,
  };
}

async function resolvePlayerContext(accountId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        account.id AS account_id,
        account.active_character_id AS character_id,
        membership.campaign_id
      FROM account
      LEFT JOIN dnd5e_campaign_character membership
        ON membership.character_id = account.active_character_id
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
      WHERE account.id = $1
      ORDER BY membership.is_active_context DESC,
        membership.is_default_solo_campaign DESC,
        membership.id DESC
      LIMIT 1
    `,
    [accountId]
  );
  const row = result.rows[0] ?? null;
  if (!row || !row.character_id) {
    throw createHttpError('Active character is required for dialogue archive access', 409);
  }
  if (!row.campaign_id) {
    throw createHttpError('Active campaign is required for dialogue archive access', 409);
  }
  return row;
}

function mapTurnForPlayer(turn) {
  return {
    turn_id: String(turn.id),
    turn_index: Number(turn.turn_index),
    turn_type: turn.turn_type,
    speaker: turn.speaker_type
      ? {
          type: turn.speaker_type,
          id: turn.speaker_id,
          label: turn.speaker_label,
        }
      : null,
    source_interaction_id: interactionIdForPlayer(turn.source_interaction_id),
    content: normalizeObject(turn.player_facing_content_json),
    created_at: turn.created_at,
  };
}

function mapCompletedRecordForPlayer(row, { includeTranscript = false, turns = [], lifecycle = null } = {}) {
  return {
    completed_dialogue_record_id: String(row.id),
    dialogue_scene_id: row.dialogue_scene_key,
    transcript_id: row.transcript_id ? String(row.transcript_id) : null,
    compact_summary: row.compact_summary,
    exit_mode: row.exit_mode,
    exit_id: interactionIdForPlayer(row.exit_id),
    transition: normalizeObject(row.transition_ref_json),
    participants: normalizeArray(row.participants_json),
    knowledge_links: normalizeArray(row.knowledge_links_json),
    relationship_summary_links: normalizeArray(row.relationship_summary_links_json),
    metadata: normalizeObject(row.player_facing_metadata_json),
    annotation_correction_chains: lifecycle?.chains ?? [],
    completed_at: row.completed_at,
    ...(includeTranscript ? { transcript_turns: turns.map(mapTurnForPlayer) } : {}),
  };
}

export async function listPlayerDialogueArchiveForAccount(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const context = await resolvePlayerContext(accountId, executor);
  const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 50);
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_completed_dialogue_record
      WHERE campaign_id = $1
        AND character_id = $2
        AND visibility_scope = 'player'
      ORDER BY completed_at DESC, id DESC
      LIMIT $3
    `,
    [context.campaign_id, context.character_id, limit]
  );
  return {
    records: result.rows.map((row) => mapCompletedRecordForPlayer(row)),
  };
}

export async function getPlayerDialogueArchiveRecordForAccount(accountId, recordId, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const context = await resolvePlayerContext(accountId, executor);
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_completed_dialogue_record
      WHERE id = $1
        AND campaign_id = $2
        AND character_id = $3
        AND visibility_scope = 'player'
      LIMIT 1
    `,
    [recordId, context.campaign_id, context.character_id]
  );
  const row = result.rows[0] ?? null;
  if (!row) {
    throw createHttpError('Dialogue archive record not found', 404);
  }
  const turns = row.transcript_id
    ? await loadTranscriptTurns(row.transcript_id, { visibility: 'player', executor })
    : [];
  const lifecycle = await getPlayerFacingLifecycleForCompletedRecord(row.id, executor);
  return {
    record: mapCompletedRecordForPlayer(row, { includeTranscript: true, turns, lifecycle }),
  };
}

export async function getPlayerCurrentDialogueTranscriptForAccount(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const context = await resolvePlayerContext(accountId, executor);
  const dialogueSceneKey = cleanText(input.dialogue_scene_id ?? input.dialogueSceneId ?? input.scene_key);
  const params = [context.campaign_id, context.character_id];
  let sceneFilter = '';
  if (dialogueSceneKey) {
    params.push(dialogueSceneKey);
    sceneFilter = `AND dialogue_scene_key = $${params.length}`;
  }
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_scene_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND field_name = '__runtime_state__'
        AND scope = 'dialogue_scene_state'
        ${sceneFilter}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    params
  );
  const stateRow = result.rows[0] ?? null;
  if (!stateRow) {
    return {
      transcript: null,
    };
  }
  const runtimeState = normalizeObject(stateRow.value_json);
  const transcriptId = runtimeState.transcript_id;
  const turns = transcriptId
    ? await loadTranscriptTurns(transcriptId, { visibility: 'player', executor })
    : [];
  return {
    transcript: {
      transcript_id: transcriptId ? String(transcriptId) : null,
      dialogue_scene_id: stateRow.dialogue_scene_key,
      status: runtimeState.status ?? 'active',
      completed_dialogue_record_id: runtimeState.completed_dialogue_record_id
        ? String(runtimeState.completed_dialogue_record_id)
        : null,
      turns: turns.map(mapTurnForPlayer),
    },
  };
}

export async function searchPlayerDialogueArchiveForAccount(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const context = await resolvePlayerContext(accountId, executor);
  const term = cleanText(input.q ?? input.query);
  if (!term) {
    return { results: [] };
  }
  const result = await executor.query(
    `
      SELECT
        search.id,
        search.dialogue_record_id,
        search.transcript_id,
        search.player_facing_text,
        search.topics_json,
        record.compact_summary,
        record.dialogue_scene_key,
        record.completed_at
      FROM dnd5e_dialogue_search_index search
      JOIN dnd5e_completed_dialogue_record record ON record.id = search.dialogue_record_id
      WHERE search.campaign_id = $1
        AND search.character_id = $2
        AND search.visibility_scope = 'player'
        AND search.player_facing_text ILIKE $3
      ORDER BY record.completed_at DESC, search.id DESC
      LIMIT 20
    `,
    [context.campaign_id, context.character_id, `%${term}%`]
  );
  return {
    results: result.rows.map((row) => ({
      search_result_id: String(row.id),
      completed_dialogue_record_id: String(row.dialogue_record_id),
      transcript_id: row.transcript_id ? String(row.transcript_id) : null,
      dialogue_scene_id: row.dialogue_scene_key,
      compact_summary: row.compact_summary,
      matched_text: row.player_facing_text,
      topics: normalizeArray(row.topics_json),
      completed_at: row.completed_at,
    })),
  };
}

export async function getGmDevDialogueArchiveRecord(recordId, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_completed_dialogue_record
      WHERE id = $1
      LIMIT 1
    `,
    [recordId]
  );
  const row = result.rows[0] ?? null;
  if (!row) {
    throw createHttpError('Dialogue archive record not found', 404);
  }
  const turns = row.transcript_id
    ? await loadTranscriptTurns(row.transcript_id, { visibility: null, executor })
    : [];
  const lifecycle = await listGmDevAnnotationCorrectionChainsForTarget(
    {
      target_id: String(row.id),
      target_type: 'completed_dialogue_record',
    },
    executor
  );
  return {
    record: row,
    transcript_turns: turns,
    gm_dev: {
      relationship_audit_links: normalizeArray(row.relationship_summary_links_json),
      annotation_chain_ids: normalizeArray(row.annotation_chain_ids_json),
      correction_chain_ids: normalizeArray(row.correction_chain_ids_json),
      annotation_correction_chains: lifecycle.chains,
    },
  };
}

export const dialogueArchiveInternalsForTests = {
  authoredCompactSummary,
  conservativeSummary,
  playerFacingContent,
};
