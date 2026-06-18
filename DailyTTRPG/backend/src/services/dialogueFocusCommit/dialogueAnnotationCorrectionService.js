import { query } from '../../config/db.js';
import { createHttpError } from '../../utils/httpError.js';
import {
  ANNOTATION_LIFECYCLE_STATUSES,
  ANNOTATION_REVIEW_STATUSES,
  CORRECTION_LIFECYCLE_STATUSES,
  CORRECTION_REVIEW_STATUSES,
} from './dialogueFocusCommitSchema.js';
import { ensureDialogueFocusCommitPersistenceSchema } from './dialogueFocusCommitPersistenceSchema.js';

const CHAIN_TYPES = Object.freeze(['annotation', 'correction', 'mixed']);
const TARGET_TYPES = Object.freeze([
  'completed_dialogue_record',
  'npc',
  'clue_topic',
  'knowledge_entry',
  'campaign_recap',
  'affected_surface',
]);

const ANNOTATION_RECORD_TYPES = Object.freeze([
  'annotation',
  'suggestion',
  'edit',
  'rejection',
  'suppression',
  'retraction',
  'replacement',
]);

const CORRECTION_RECORD_TYPES = Object.freeze([
  'correction',
  'generated_correction',
  'edit',
  'rejection',
  'suppression',
  'retraction',
  'replacement',
]);

const PLAYER_SAFE_SOURCE_TYPES = Object.freeze([
  'completed_dialogue_record',
  'completed_dialogue_summary',
  'player_facing_transcript_turn',
  'committed_social_move_result',
  'canonical_clarifying_question',
  'knowledge_entry',
  'campaign_history_event',
  'relationship_summary',
  'active_player_facing_annotation',
  'active_player_facing_correction',
]);

const FORBIDDEN_SOURCE_TYPES = Object.freeze([
  'relationship_audit',
  'hidden_relationship_state',
  'raw_audit_log',
  'debug_route_check',
  'secret_requirement',
  'preview_confidence',
  'hidden_availability_check',
  'gm_dev_transcript_metadata',
  'non_player_facing_flag',
  'hidden_source',
  'gm_dev_only',
]);

const APPROVED_STATUSES = Object.freeze(['approved', 'approved_with_edits']);
const PENDING_STATUSES = Object.freeze(['suggested', 'generated', 'pending_review']);

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

function json(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
}

function createdAt(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function assertAllowed(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw createHttpError(`Invalid ${fieldName}: ${value}`, 400);
  }
}

function recordTable(recordKind) {
  if (recordKind === 'annotation') {
    return 'dnd5e_dialogue_annotation_lifecycle_record';
  }
  if (recordKind === 'correction') {
    return 'dnd5e_dialogue_correction_lifecycle_record';
  }
  throw createHttpError('record_kind must be annotation or correction', 400);
}

function recordStatusValues(recordKind) {
  return recordKind === 'annotation'
    ? {
        recordTypes: ANNOTATION_RECORD_TYPES,
        reviewStatuses: ANNOTATION_REVIEW_STATUSES,
        lifecycleStatuses: ANNOTATION_LIFECYCLE_STATUSES,
        defaultRecordType: 'suggestion',
        defaultReviewStatus: 'suggested',
      }
    : {
        recordTypes: CORRECTION_RECORD_TYPES,
        reviewStatuses: CORRECTION_REVIEW_STATUSES,
        lifecycleStatuses: CORRECTION_LIFECYCLE_STATUSES,
        defaultRecordType: 'generated_correction',
        defaultReviewStatus: 'generated',
      };
}

function isActivePlayerFacing(record) {
  return (
    record?.player_facing === true &&
    record.lifecycle_status === 'active' &&
    APPROVED_STATUSES.includes(record.review_status)
  );
}

function sourceItems(input) {
  return [
    ...normalizeArray(input.source_event_links ?? input.source_event_links_json),
    ...normalizeArray(input.source_dialogue_record_links ?? input.source_dialogue_record_links_json),
    ...normalizeArray(input.sources),
  ].map((source) => (typeof source === 'string' ? { source_type: source } : normalizeObject(source)));
}

function sourceType(source) {
  return cleanText(
    source.source_type ??
      source.type ??
      source.kind ??
      source.searchable_type ??
      source.audit_type ??
      source.source
  );
}

function sourceVisibility(source) {
  return cleanText(
    source.visibility ??
      source.visibility_scope ??
      source.source_visibility ??
      source.player_facing_status
  );
}

function enforceSourceSafety(input, { generated = false, playerFacing = false } = {}) {
  const sources = sourceItems(input);
  for (const source of sources) {
    const type = sourceType(source);
    const visibility = sourceVisibility(source);
    if (
      FORBIDDEN_SOURCE_TYPES.includes(type) ||
      ['hidden_only', 'gm_dev', 'gm_only', 'debug', 'non_player_facing'].includes(visibility)
    ) {
      throw createHttpError(
        'Lifecycle records cannot use hidden, debug, audit, or GM/dev-only source material for player-facing or generated text.',
        400
      );
    }
    if ((generated || playerFacing) && type && !PLAYER_SAFE_SOURCE_TYPES.includes(type)) {
      throw createHttpError(`Generated or player-facing lifecycle source is not registered as player-safe: ${type}`, 400);
    }
  }
  const reviewStatus = cleanText(input.review_status);
  if (playerFacing && PENDING_STATUSES.includes(reviewStatus)) {
    throw createHttpError('Pending suggested/generated lifecycle records cannot be player-facing.', 400);
  }
}

async function requireDialogueLifecycleCapability(accountId, executor) {
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
    throw createHttpError('This account is not authorized to manage dialogue lifecycle records.', 403);
  }
}

async function loadChain(chainId, executor) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_annotation_correction_chain
      WHERE id = $1
      LIMIT 1
    `,
    [chainId]
  );
  return result.rows[0] ?? null;
}

async function loadLifecycleRecord(recordKind, recordId, executor) {
  const table = recordTable(recordKind);
  const result = await executor.query(
    `
      SELECT *
      FROM ${table}
      WHERE id = $1
      LIMIT 1
    `,
    [recordId]
  );
  return result.rows[0] ?? null;
}

async function supersedeOtherActiveRecords({ chainId, recordKind, recordId, executor }) {
  const annotationSkip = recordKind === 'annotation' ? Number(recordId) : -1;
  const correctionSkip = recordKind === 'correction' ? Number(recordId) : -1;
  await executor.query(
    `
      UPDATE dnd5e_dialogue_annotation_lifecycle_record
      SET lifecycle_status = 'superseded',
          player_facing = FALSE,
          updated_at = NOW()
      WHERE chain_id = $1
        AND id <> $2
        AND player_facing = TRUE
        AND lifecycle_status = 'active'
    `,
    [chainId, annotationSkip]
  );
  await executor.query(
    `
      UPDATE dnd5e_dialogue_correction_lifecycle_record
      SET lifecycle_status = 'superseded',
          player_facing = FALSE,
          updated_at = NOW()
      WHERE chain_id = $1
        AND id <> $2
        AND player_facing = TRUE
        AND lifecycle_status = 'active'
    `,
    [chainId, correctionSkip]
  );
}

async function refreshChainActivePointer({ chainId, recordKind, record, executor }) {
  if (isActivePlayerFacing(record)) {
    await supersedeOtherActiveRecords({ chainId, recordKind, recordId: record.id, executor });
    await executor.query(
      `
        UPDATE dnd5e_dialogue_annotation_correction_chain
        SET current_active_record_id = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [chainId, record.id]
    );
    return;
  }
  await executor.query(
    `
      UPDATE dnd5e_dialogue_annotation_correction_chain
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [chainId]
  );
}

function mapFullRecord(recordKind, row) {
  if (!row) {
    return null;
  }
  return {
    record_kind: recordKind,
    record_id: idText(row.id),
    chain_id: idText(row.chain_id),
    annotation_record_id: idText(row.annotation_record_id),
    record_type: row.record_type,
    review_status: row.review_status,
    lifecycle_status: row.lifecycle_status,
    original_text: row.original_text,
    approved_or_active_text: row.approved_or_active_text,
    reviewer_id: idText(row.reviewer_id),
    review_timestamp: createdAt(row.review_timestamp),
    rejection_reason: row.rejection_reason,
    suppression_scope: row.suppression_scope,
    retraction_reason: row.retraction_reason,
    replacement_record_id: idText(row.replacement_record_id),
    source_event_links: normalizeArray(row.source_event_links_json),
    source_dialogue_record_links: normalizeArray(row.source_dialogue_record_links_json),
    affected_surfaces: normalizeArray(row.affected_surfaces_json),
    player_facing: row.player_facing === true,
    created_at: createdAt(row.created_at),
    updated_at: createdAt(row.updated_at),
  };
}

function mapPlayerRecord(recordKind, row) {
  const text = cleanText(row.approved_or_active_text ?? row.original_text);
  return {
    record_kind: recordKind,
    record_type: row.record_type,
    text,
    affected_surfaces: normalizeArray(row.affected_surfaces_json),
    created_at: createdAt(row.created_at),
    updated_at: createdAt(row.updated_at),
  };
}

function chainTargetIds(input) {
  return [
    ...normalizeArray(input.target_ids ?? input.targetIds),
    input.target_id,
    input.targetId,
  ]
    .map(idText)
    .filter(Boolean);
}

async function loadRecordsForChains(chainIds, executor) {
  if (chainIds.length === 0) {
    return { annotations: [], corrections: [] };
  }
  const annotations = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_annotation_lifecycle_record
      WHERE chain_id = ANY($1::bigint[])
      ORDER BY created_at ASC, id ASC
    `,
    [chainIds]
  );
  const corrections = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_correction_lifecycle_record
      WHERE chain_id = ANY($1::bigint[])
      ORDER BY created_at ASC, id ASC
    `,
    [chainIds]
  );
  return { annotations: annotations.rows, corrections: corrections.rows };
}

function groupRowsByChain(rows) {
  const byChain = new Map();
  for (const row of rows) {
    const key = String(row.chain_id);
    if (!byChain.has(key)) {
      byChain.set(key, []);
    }
    byChain.get(key).push(row);
  }
  return byChain;
}

function currentPlayerFacingUnderstanding(records) {
  const active = records
    .filter((record) => isActivePlayerFacing(record))
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0];
  return active
    ? {
        record_kind: active.record_kind,
        record_type: active.record_type,
        text: cleanText(active.approved_or_active_text ?? active.original_text),
        updated_at: active.updated_at,
      }
    : null;
}

function compressionNote(records) {
  const visibleChanges = records.filter(
    (record) => record.player_facing === true && APPROVED_STATUSES.includes(record.review_status)
  );
  if (visibleChanges.length <= 2) {
    return null;
  }
  return 'Earlier understanding changed more than once; this archive shows the latest active version first, with the full chain retained for review.';
}

async function refreshCompletedDialogueLifecycleSearchIndex(recordId, executor) {
  const recordResult = await executor.query(
    `
      SELECT *
      FROM dnd5e_completed_dialogue_record
      WHERE id = $1
      LIMIT 1
    `,
    [recordId]
  );
  const record = recordResult.rows[0] ?? null;
  if (!record || record.visibility_scope !== 'player') {
    return null;
  }
  const turnResult = record.transcript_id
    ? await executor.query(
        `
          SELECT player_facing_content_json
          FROM dnd5e_dialogue_turn
          WHERE transcript_id = $1
            AND visibility_scope = 'player'
          ORDER BY turn_index ASC, id ASC
        `,
        [record.transcript_id]
      )
    : { rows: [] };
  const lifecycle = await listPlayerFacingAnnotationCorrectionChainsForTarget(
    {
      target_id: String(record.id),
      target_type: 'completed_dialogue_record',
    },
    executor
  );
  const textParts = [
    record.compact_summary,
    ...turnResult.rows.map((turn) => {
      const content = normalizeObject(turn.player_facing_content_json);
      return cleanText(content.text ?? content.summary ?? content.narration ?? content.result);
    }),
    ...normalizeArray(lifecycle.chains).flatMap((chain) =>
      normalizeArray(chain.active_records).map((active) => active.text)
    ),
  ].filter(Boolean);
  if (textParts.length === 0) {
    return null;
  }
  const participants = normalizeArray(record.participants_json);
  await executor.query(
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
    `,
    [
      record.campaign_id,
      record.character_id,
      record.scene_id ?? null,
      record.id,
      record.transcript_id ?? null,
      textParts.join('\n'),
      json(record.knowledge_links_json, []),
      json(participants.map((participant) => participant.npc_key ?? participant.participant_id).filter(Boolean), []),
      json(record.knowledge_links_json, []),
      json(record.relationship_summary_links_json, []),
    ]
  );
  return { refreshed: true };
}

export async function createAnnotationCorrectionChainForAccount(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  await requireDialogueLifecycleCapability(accountId, executor);
  const targetType = cleanText(input.target_type ?? input.targetType);
  const targetId = cleanText(input.target_id ?? input.targetId);
  const chainType = cleanText(input.chain_type ?? input.chainType ?? 'mixed');
  assertAllowed(targetType, TARGET_TYPES, 'target_type');
  assertAllowed(chainType, CHAIN_TYPES, 'chain_type');
  if (!targetId) {
    throw createHttpError('target_id is required for annotation/correction chains', 400);
  }
  const result = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_annotation_correction_chain (
        target_type,
        target_id,
        chain_type,
        created_by_account_id
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [targetType, targetId, chainType, accountId]
  );
  return { chain: mapAnnotationCorrectionChainForGmDev(result.rows[0], [], []) };
}

async function createLifecycleRecordForAccount(accountId, input = {}, recordKind, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  await requireDialogueLifecycleCapability(accountId, executor);
  const chainId = Number(input.chain_id ?? input.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw createHttpError('chain_id is required', 400);
  }
  const chain = await loadChain(chainId, executor);
  if (!chain) {
    throw createHttpError('Annotation/correction chain not found', 404);
  }
  const statuses = recordStatusValues(recordKind);
  const recordType = cleanText(input.record_type ?? input.recordType ?? statuses.defaultRecordType);
  const reviewStatus = cleanText(input.review_status ?? input.reviewStatus ?? statuses.defaultReviewStatus);
  const lifecycleStatus = cleanText(input.lifecycle_status ?? input.lifecycleStatus ?? 'draft');
  const playerFacing = input.player_facing === true || input.playerFacing === true;
  assertAllowed(recordType, statuses.recordTypes, 'record_type');
  assertAllowed(reviewStatus, statuses.reviewStatuses, 'review_status');
  assertAllowed(lifecycleStatus, statuses.lifecycleStatuses, 'lifecycle_status');
  if (reviewStatus === 'suppressed' || recordType === 'suppression') {
    if (!cleanText(input.suppression_scope ?? input.suppressionScope)) {
      throw createHttpError('suppression_scope is required for suppressed lifecycle records', 400);
    }
  }
  if (lifecycleStatus === 'retracted' || recordType === 'retraction') {
    if (!cleanText(input.retraction_reason ?? input.retractionReason)) {
      throw createHttpError('retraction_reason is required for retracted lifecycle records', 400);
    }
  }
  enforceSourceSafety(input, {
    generated: ['suggestion', 'generated_correction'].includes(recordType) || PENDING_STATUSES.includes(reviewStatus),
    playerFacing,
  });
  const table = recordTable(recordKind);
  const annotationRecordId = recordKind === 'correction' ? input.annotation_record_id ?? input.annotationRecordId ?? null : null;
  const result = await executor.query(
    `
      INSERT INTO ${table} (
        chain_id,
        ${recordKind === 'correction' ? 'annotation_record_id,' : ''}
        record_type,
        review_status,
        lifecycle_status,
        original_text,
        approved_or_active_text,
        reviewer_id,
        review_timestamp,
        rejection_reason,
        suppression_scope,
        retraction_reason,
        replacement_record_id,
        source_event_links_json,
        source_dialogue_record_links_json,
        affected_surfaces_json,
        player_facing
      )
      VALUES (
        $1,
        ${recordKind === 'correction' ? '$2,' : ''}
        $${recordKind === 'correction' ? 3 : 2},
        $${recordKind === 'correction' ? 4 : 3},
        $${recordKind === 'correction' ? 5 : 4},
        $${recordKind === 'correction' ? 6 : 5},
        $${recordKind === 'correction' ? 7 : 6},
        $${recordKind === 'correction' ? 8 : 7},
        CASE WHEN $${recordKind === 'correction' ? 8 : 7}::bigint IS NULL THEN NULL ELSE NOW() END,
        $${recordKind === 'correction' ? 9 : 8},
        $${recordKind === 'correction' ? 10 : 9},
        $${recordKind === 'correction' ? 11 : 10},
        $${recordKind === 'correction' ? 12 : 11},
        $${recordKind === 'correction' ? 13 : 12}::jsonb,
        $${recordKind === 'correction' ? 14 : 13}::jsonb,
        $${recordKind === 'correction' ? 15 : 14}::jsonb,
        $${recordKind === 'correction' ? 16 : 15}
      )
      RETURNING *
    `,
    recordKind === 'correction'
      ? [
          chainId,
          annotationRecordId,
          recordType,
          reviewStatus,
          lifecycleStatus,
          cleanText(input.original_text ?? input.originalText),
          cleanText(input.approved_or_active_text ?? input.approvedOrActiveText ?? input.active_text ?? input.activeText),
          input.reviewer_id ?? input.reviewerId ?? accountId,
          cleanText(input.rejection_reason ?? input.rejectionReason) || null,
          cleanText(input.suppression_scope ?? input.suppressionScope) || null,
          cleanText(input.retraction_reason ?? input.retractionReason) || null,
          input.replacement_record_id ?? input.replacementRecordId ?? null,
          json(input.source_event_links ?? input.sourceEventLinks, []),
          json(input.source_dialogue_record_links ?? input.sourceDialogueRecordLinks, []),
          json(input.affected_surfaces ?? input.affectedSurfaces, []),
          playerFacing,
        ]
      : [
          chainId,
          recordType,
          reviewStatus,
          lifecycleStatus,
          cleanText(input.original_text ?? input.originalText),
          cleanText(input.approved_or_active_text ?? input.approvedOrActiveText ?? input.active_text ?? input.activeText),
          input.reviewer_id ?? input.reviewerId ?? accountId,
          cleanText(input.rejection_reason ?? input.rejectionReason) || null,
          cleanText(input.suppression_scope ?? input.suppressionScope) || null,
          cleanText(input.retraction_reason ?? input.retractionReason) || null,
          input.replacement_record_id ?? input.replacementRecordId ?? null,
          json(input.source_event_links ?? input.sourceEventLinks, []),
          json(input.source_dialogue_record_links ?? input.sourceDialogueRecordLinks, []),
          json(input.affected_surfaces ?? input.affectedSurfaces, []),
          playerFacing,
        ]
  );
  const record = result.rows[0];
  await refreshChainActivePointer({ chainId, recordKind, record, executor });
  if (chain.target_type === 'completed_dialogue_record') {
    await refreshCompletedDialogueLifecycleSearchIndex(chain.target_id, executor);
  }
  return {
    record: mapFullRecord(recordKind, record),
  };
}

export async function createAnnotationLifecycleRecordForAccount(accountId, input = {}, executor = { query }) {
  return createLifecycleRecordForAccount(accountId, input, 'annotation', executor);
}

export async function createCorrectionLifecycleRecordForAccount(accountId, input = {}, executor = { query }) {
  return createLifecycleRecordForAccount(accountId, input, 'correction', executor);
}

function reviewPatchForAction(input, action, existing, accountId) {
  if (action === 'approve' || action === 'approve_with_edits') {
    const editedText = cleanText(input.edited_text ?? input.editedText ?? input.approved_or_active_text ?? input.approvedOrActiveText);
    if (action === 'approve_with_edits' && !editedText) {
      throw createHttpError('edited_text is required when approving with edits', 400);
    }
    const playerFacing = input.player_facing === true || input.playerFacing === true;
    return {
      review_status: action === 'approve' ? 'approved' : 'approved_with_edits',
      lifecycle_status: playerFacing ? 'active' : cleanText(input.lifecycle_status ?? input.lifecycleStatus ?? 'inactive'),
      approved_or_active_text: editedText || existing.approved_or_active_text || existing.original_text,
      reviewer_id: input.reviewer_id ?? input.reviewerId ?? accountId,
      rejection_reason: null,
      suppression_scope: existing.suppression_scope,
      retraction_reason: existing.retraction_reason,
      player_facing: playerFacing,
    };
  }
  if (action === 'reject') {
    const reason = cleanText(input.rejection_reason ?? input.rejectionReason);
    if (!reason) {
      throw createHttpError('rejection_reason is required when rejecting lifecycle records', 400);
    }
    return {
      review_status: 'rejected',
      lifecycle_status: 'inactive',
      approved_or_active_text: existing.approved_or_active_text,
      reviewer_id: input.reviewer_id ?? input.reviewerId ?? accountId,
      rejection_reason: reason,
      suppression_scope: existing.suppression_scope,
      retraction_reason: existing.retraction_reason,
      player_facing: false,
    };
  }
  if (action === 'suppress') {
    const scope = cleanText(input.suppression_scope ?? input.suppressionScope);
    if (!scope) {
      throw createHttpError('suppression_scope is required when suppressing lifecycle records', 400);
    }
    return {
      review_status: 'suppressed',
      lifecycle_status: 'inactive',
      approved_or_active_text: existing.approved_or_active_text,
      reviewer_id: input.reviewer_id ?? input.reviewerId ?? accountId,
      rejection_reason: existing.rejection_reason,
      suppression_scope: scope,
      retraction_reason: existing.retraction_reason,
      player_facing: false,
    };
  }
  if (action === 'retract') {
    const reason = cleanText(input.retraction_reason ?? input.retractionReason);
    if (!reason) {
      throw createHttpError('retraction_reason is required when retracting lifecycle records', 400);
    }
    return {
      review_status: existing.review_status,
      lifecycle_status: 'retracted',
      approved_or_active_text: existing.approved_or_active_text,
      reviewer_id: input.reviewer_id ?? input.reviewerId ?? accountId,
      rejection_reason: existing.rejection_reason,
      suppression_scope: existing.suppression_scope,
      retraction_reason: reason,
      player_facing: false,
    };
  }
  throw createHttpError(`Unsupported lifecycle review action: ${action}`, 400);
}

async function updateLifecycleRecord({ accountId, recordKind, recordId, patch, executor }) {
  const table = recordTable(recordKind);
  const result = await executor.query(
    `
      UPDATE ${table}
      SET review_status = $2,
          lifecycle_status = $3,
          approved_or_active_text = $4,
          reviewer_id = $5,
          review_timestamp = NOW(),
          rejection_reason = $6,
          suppression_scope = $7,
          retraction_reason = $8,
          player_facing = $9,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      recordId,
      patch.review_status,
      patch.lifecycle_status,
      patch.approved_or_active_text,
      patch.reviewer_id ?? accountId,
      patch.rejection_reason,
      patch.suppression_scope,
      patch.retraction_reason,
      patch.player_facing,
    ]
  );
  return result.rows[0] ?? null;
}

export async function reviewAnnotationCorrectionRecordForAccount(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  await requireDialogueLifecycleCapability(accountId, executor);
  const recordKind = cleanText(input.record_kind ?? input.recordKind);
  const recordId = Number(input.record_id ?? input.recordId);
  const action = cleanText(input.action);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw createHttpError('record_id is required', 400);
  }
  if (!['annotation', 'correction'].includes(recordKind)) {
    throw createHttpError('record_kind must be annotation or correction', 400);
  }
  const existing = await loadLifecycleRecord(recordKind, recordId, executor);
  if (!existing) {
    throw createHttpError('Lifecycle record not found', 404);
  }
  const chain = await loadChain(existing.chain_id, executor);
  if (!chain) {
    throw createHttpError('Annotation/correction chain not found', 404);
  }

  if (action === 'replace' || action === 'supersede') {
    const replacementText = cleanText(input.replacement_text ?? input.replacementText ?? input.edited_text ?? input.editedText);
    if (!replacementText) {
      throw createHttpError('replacement_text is required for replacement lifecycle records', 400);
    }
    const replacement = await createLifecycleRecordForAccount(
      accountId,
      {
        chain_id: existing.chain_id,
        annotation_record_id: recordKind === 'correction' ? existing.annotation_record_id : undefined,
        record_type: 'replacement',
        review_status: input.review_status ?? (recordKind === 'annotation' ? 'approved_with_edits' : 'approved_with_edits'),
        lifecycle_status: input.player_facing === false ? 'inactive' : 'active',
        original_text: replacementText,
        approved_or_active_text: replacementText,
        player_facing: input.player_facing !== false,
        reviewer_id: input.reviewer_id ?? input.reviewerId ?? accountId,
        source_event_links: input.source_event_links ?? existing.source_event_links_json,
        source_dialogue_record_links: input.source_dialogue_record_links ?? existing.source_dialogue_record_links_json,
        affected_surfaces: input.affected_surfaces ?? existing.affected_surfaces_json,
      },
      recordKind,
      executor
    );
    const table = recordTable(recordKind);
    await executor.query(
      `
        UPDATE ${table}
        SET lifecycle_status = $2,
            player_facing = FALSE,
            replacement_record_id = $3,
            retraction_reason = COALESCE($4, retraction_reason),
            reviewer_id = $5,
            review_timestamp = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        recordId,
        action === 'replace' ? 'superseded' : 'superseded',
        Number(replacement.record.record_id),
        cleanText(input.retraction_reason ?? input.retractionReason) || null,
        input.reviewer_id ?? input.reviewerId ?? accountId,
      ]
    );
    if (chain.target_type === 'completed_dialogue_record') {
      await refreshCompletedDialogueLifecycleSearchIndex(chain.target_id, executor);
    }
    return {
      record: replacement.record,
      replaced_record_id: String(recordId),
    };
  }

  const patch = reviewPatchForAction(input, action, existing, accountId);
  enforceSourceSafety(
    {
      ...existing,
      ...input,
      review_status: patch.review_status,
      source_event_links: existing.source_event_links_json,
      source_dialogue_record_links: existing.source_dialogue_record_links_json,
    },
    {
      generated: PENDING_STATUSES.includes(existing.review_status) || ['suggestion', 'generated_correction'].includes(existing.record_type),
      playerFacing: patch.player_facing,
    }
  );
  const record = await updateLifecycleRecord({ accountId, recordKind, recordId, patch, executor });
  await refreshChainActivePointer({ chainId: record.chain_id, recordKind, record, executor });
  if (chain.target_type === 'completed_dialogue_record') {
    await refreshCompletedDialogueLifecycleSearchIndex(chain.target_id, executor);
  }
  return {
    record: mapFullRecord(recordKind, record),
  };
}

export function mapAnnotationCorrectionChainForGmDev(chain, annotationRows = [], correctionRows = []) {
  const annotationRecords = annotationRows.map((row) => mapFullRecord('annotation', row));
  const correctionRecords = correctionRows.map((row) => mapFullRecord('correction', row));
  const allRecords = [...annotationRecords, ...correctionRecords];
  return {
    chain_id: idText(chain.id),
    target_type: chain.target_type,
    target_id: chain.target_id,
    chain_type: chain.chain_type,
    current_active_record_id: idText(chain.current_active_record_id),
    created_by_account_id: idText(chain.created_by_account_id),
    annotation_records: annotationRecords,
    correction_records: correctionRecords,
    current_player_facing_understanding: currentPlayerFacingUnderstanding(allRecords),
    changed_understanding_note: compressionNote(allRecords),
    created_at: createdAt(chain.created_at),
    updated_at: createdAt(chain.updated_at),
  };
}

export async function listGmDevAnnotationCorrectionChainsForTarget(input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const targetIds = chainTargetIds(input);
  if (targetIds.length === 0) {
    return { chains: [] };
  }
  const params = [targetIds];
  let targetTypeFilter = '';
  const targetType = cleanText(input.target_type ?? input.targetType);
  if (targetType) {
    params.push(targetType);
    targetTypeFilter = `AND target_type = $${params.length}`;
  }
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_annotation_correction_chain
      WHERE target_id = ANY($1::text[])
        ${targetTypeFilter}
      ORDER BY updated_at DESC, id DESC
      LIMIT 50
    `,
    params
  );
  const chainIds = result.rows.map((row) => Number(row.id));
  const records = await loadRecordsForChains(chainIds, executor);
  const annotationsByChain = groupRowsByChain(records.annotations);
  const correctionsByChain = groupRowsByChain(records.corrections);
  return {
    chains: result.rows.map((chain) =>
      mapAnnotationCorrectionChainForGmDev(
        chain,
        normalizeArray(annotationsByChain.get(String(chain.id))),
        normalizeArray(correctionsByChain.get(String(chain.id)))
      )
    ),
  };
}

export async function listPlayerFacingAnnotationCorrectionChainsForTarget(input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const targetIds = chainTargetIds(input);
  if (targetIds.length === 0) {
    return { chains: [] };
  }
  const params = [targetIds];
  let targetTypeFilter = '';
  const targetType = cleanText(input.target_type ?? input.targetType);
  if (targetType) {
    params.push(targetType);
    targetTypeFilter = `AND chain.target_type = $${params.length}`;
  }
  const chainResult = await executor.query(
    `
      SELECT chain.*
      FROM dnd5e_dialogue_annotation_correction_chain chain
      WHERE chain.target_id = ANY($1::text[])
        ${targetTypeFilter}
      ORDER BY chain.updated_at DESC, chain.id DESC
      LIMIT 50
    `,
    params
  );
  const chainIds = chainResult.rows.map((row) => Number(row.id));
  if (chainIds.length === 0) {
    return { chains: [] };
  }
  const annotationResult = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_annotation_lifecycle_record
      WHERE chain_id = ANY($1::bigint[])
        AND player_facing = TRUE
        AND lifecycle_status = 'active'
        AND review_status IN ('approved', 'approved_with_edits')
      ORDER BY updated_at DESC, id DESC
    `,
    [chainIds]
  );
  const correctionResult = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_correction_lifecycle_record
      WHERE chain_id = ANY($1::bigint[])
        AND player_facing = TRUE
        AND lifecycle_status = 'active'
        AND review_status IN ('approved', 'approved_with_edits')
      ORDER BY updated_at DESC, id DESC
    `,
    [chainIds]
  );
  const byChain = new Map();
  for (const row of annotationResult.rows) {
    const key = String(row.chain_id);
    if (!byChain.has(key)) {
      byChain.set(key, []);
    }
    byChain.get(key).push(mapPlayerRecord('annotation', row));
  }
  for (const row of correctionResult.rows) {
    const key = String(row.chain_id);
    if (!byChain.has(key)) {
      byChain.set(key, []);
    }
    byChain.get(key).push(mapPlayerRecord('correction', row));
  }
  return {
    chains: chainResult.rows
      .map((chain) => {
        const activeRecords = normalizeArray(byChain.get(String(chain.id)));
        if (activeRecords.length === 0) {
          return null;
        }
        return {
          chain_id: idText(chain.id),
          target_type: chain.target_type,
          target_id: chain.target_id,
          chain_type: chain.chain_type,
          active_records: activeRecords,
          current_understanding: activeRecords[0] ?? null,
        };
      })
      .filter(Boolean),
  };
}

export async function getPlayerFacingLifecycleForCompletedRecord(recordId, executor = { query }) {
  return listPlayerFacingAnnotationCorrectionChainsForTarget(
    {
      target_id: String(recordId),
      target_type: 'completed_dialogue_record',
    },
    executor
  );
}

export const dialogueAnnotationCorrectionInternalsForTests = {
  enforceSourceSafety,
  refreshCompletedDialogueLifecycleSearchIndex,
};
