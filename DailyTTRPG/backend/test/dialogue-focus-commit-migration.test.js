import assert from 'node:assert/strict';
import test from 'node:test';

import { query } from '../src/config/db.js';
import {
  ensureDialogueFocusCommitPersistenceSchema,
  resetDialogueFocusCommitPersistenceSchemaForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import {
  dialogueFocusCommitTableNames,
  selectCompletedDialogueRecordsCompactQuery,
  selectDialogueTranscriptTurnsQuery,
} from '../src/db/queries/dialogueFocusCommit.js';

test.before(async () => {
  await ensureDialogueFocusCommitPersistenceSchema();
});

async function columnsFor(tableName) {
  const result = await query(
    `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position;
    `,
    [tableName]
  );

  return new Set(result.rows.map((row) => row.column_name));
}

async function constraintDefinitions(tableNames) {
  const result = await query(
    `
      SELECT
        conname,
        conrelid::regclass::text AS table_name,
        confrelid::regclass::text AS referenced_table,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid::regclass::text = ANY($1::text[])
      ORDER BY conrelid::regclass::text, conname;
    `,
    [tableNames]
  );

  return result.rows;
}

async function indexNamesFor(tableName) {
  const result = await query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
      ORDER BY indexname;
    `,
    [tableName]
  );

  return new Set(result.rows.map((row) => row.indexname));
}

function assertHasColumns(columnSet, expectedColumns) {
  for (const column of expectedColumns) {
    assert.equal(columnSet.has(column), true, `Expected column ${column}`);
  }
}

test('Build 3 dialogue persistence migration creates all planned tables', async () => {
  const result = await query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name;
    `,
    [dialogueFocusCommitTableNames]
  );

  const actualTables = new Set(result.rows.map((row) => row.table_name));
  for (const tableName of dialogueFocusCommitTableNames) {
    assert.equal(actualTables.has(tableName), true, `Expected table ${tableName}`);
  }
});

test('Build 3 completed dialogue records remain compact and queryable', async () => {
  const columns = await columnsFor('dnd5e_completed_dialogue_record');

  assertHasColumns(columns, [
    'id',
    'campaign_id',
    'world_instance_id',
    'character_id',
    'dialogue_scene_key',
    'participants_json',
    'entry_source_json',
    'exit_mode',
    'exit_id',
    'transition_ref_json',
    'compact_summary',
    'canonical_outputs_json',
    'knowledge_links_json',
    'history_event_links_json',
    'relationship_summary_links_json',
    'transcript_id',
    'annotation_chain_ids_json',
    'correction_chain_ids_json',
    'visibility_scope',
    'completed_at',
  ]);

  assert.doesNotMatch(selectCompletedDialogueRecordsCompactQuery, /\bJOIN\b/i);
  assert.match(selectCompletedDialogueRecordsCompactQuery, /compact_summary/);
  assert.match(selectCompletedDialogueRecordsCompactQuery, /visibility_scope = 'player'/);
});

test('Build 3 transcript and turn tables separate player-facing content from GM/dev content', async () => {
  const transcriptColumns = await columnsFor('dnd5e_dialogue_transcript');
  const turnColumns = await columnsFor('dnd5e_dialogue_turn');

  assertHasColumns(transcriptColumns, [
    'campaign_id',
    'world_instance_id',
    'character_id',
    'dialogue_session_id',
    'participants_json',
    'visibility_scope',
    'status',
  ]);
  assertHasColumns(turnColumns, [
    'transcript_id',
    'turn_index',
    'turn_type',
    'speaker_type',
    'speaker_id',
    'speaker_label',
    'player_facing_content_json',
    'gm_dev_content_ref_json',
    'source_interaction_id',
    'beat_id',
    'action_id',
    'visibility_scope',
  ]);

  assert.match(selectDialogueTranscriptTurnsQuery, /player_facing_content_json/);
  assert.doesNotMatch(selectDialogueTranscriptTurnsQuery, /gm_dev_content_ref_json/);
  assert.match(selectDialogueTranscriptTurnsQuery, /visibility_scope = 'player'/);
});

test('Build 3 clarifying question and social move records store status, checks, outputs, and visibility', async () => {
  const clarifyingColumns = await columnsFor('dnd5e_dialogue_clarifying_question_record');
  const moveColumns = await columnsFor('dnd5e_dialogue_social_move_record');

  assertHasColumns(clarifyingColumns, [
    'clarifying_question_id',
    'status',
    'persisted_result_json',
    'check_result_json',
    'check_visibility',
    'unlocked_by_json',
    'canonical_output_links_json',
    'knowledge_links_json',
    'retry_state_json',
    'asked_at',
    'attempted_at',
  ]);
  assertHasColumns(moveColumns, [
    'committed_social_move_id',
    'social_move_type',
    'social_tags_json',
    'tone_metadata_json',
    'submitted_text',
    'preview_metadata_json',
    'preview_debug_json',
    'matched_move_confidence',
    'requires_check',
    'check_result_json',
    'check_visibility',
    'result_branch',
    'result_text',
    'latest_development',
    'canonical_output_links_json',
    'knowledge_links_json',
    'relationship_audit_links_json',
    'exit_transition_ref_json',
    'visibility_scope',
  ]);
});

test('Build 3 relationship persistence distinguishes durable NPC state from scene-local posture', async () => {
  const definitionColumns = await columnsFor('dnd5e_dialogue_relationship_state_definition');
  const persistentColumns = await columnsFor('dnd5e_dialogue_npc_relationship_state');
  const sceneStateColumns = await columnsFor('dnd5e_dialogue_scene_state');

  assertHasColumns(definitionColumns, [
    'field_name',
    'ownership_default',
    'ladder_values_json',
    'default_value_json',
    'visibility_policy_json',
    'allowed_write_scopes_json',
    'shorthand_behavior',
  ]);
  assertHasColumns(persistentColumns, [
    'npc_id',
    'field_definition_id',
    'field_name',
    'value_json',
    'source_record_type',
    'source_record_id',
    'last_audit_record_id',
    'last_changed_at',
  ]);
  assertHasColumns(sceneStateColumns, [
    'dialogue_scene_key',
    'participant_id',
    'field_definition_id',
    'field_name',
    'value_json',
    'scope',
    'expires_at',
    'decay_metadata_json',
    'cleared_by_event_id',
  ]);

  const constraints = await constraintDefinitions([
    'dnd5e_dialogue_relationship_state_definition',
    'dnd5e_dialogue_relationship_audit_record',
    'dnd5e_dialogue_scene_state',
  ]);
  const definitions = constraints.map((row) => row.definition).join('\n');

  assert.match(definitions, /persistent_npc_state/);
  assert.match(definitions, /dialogue_scene_state/);
  assert.match(definitions, /dialogue_local/);
  assert.match(definitions, /temporary/);
  assert.match(definitions, /decaying/);
  assert.match(definitions, /cleared_by_event/);
});

test('Build 3 audit and lifecycle tables preserve source links and hidden/player-facing boundaries', async () => {
  const auditColumns = await columnsFor('dnd5e_dialogue_relationship_audit_record');
  const chainColumns = await columnsFor('dnd5e_dialogue_annotation_correction_chain');
  const annotationColumns = await columnsFor('dnd5e_dialogue_annotation_lifecycle_record');
  const correctionColumns = await columnsFor('dnd5e_dialogue_correction_lifecycle_record');

  assertHasColumns(auditColumns, [
    'source_scene_id',
    'source_interaction_id',
    'source_result_branch',
    'audit_type',
    'field_definition_id',
    'field_name',
    'scope',
    'old_value_json',
    'new_value_json',
    'reason',
    'player_facing_status',
    'related_social_move_record_id',
    'related_clarifying_question_record_id',
  ]);
  assertHasColumns(chainColumns, [
    'target_type',
    'target_id',
    'chain_type',
    'current_active_record_id',
  ]);
  assertHasColumns(annotationColumns, [
    'review_status',
    'lifecycle_status',
    'original_text',
    'approved_or_active_text',
    'reviewer_id',
    'rejection_reason',
    'suppression_scope',
    'retraction_reason',
    'replacement_record_id',
    'source_event_links_json',
    'source_dialogue_record_links_json',
    'affected_surfaces_json',
    'player_facing',
  ]);
  assertHasColumns(correctionColumns, [
    'annotation_record_id',
    'review_status',
    'lifecycle_status',
    'original_text',
    'approved_or_active_text',
    'reviewer_id',
    'rejection_reason',
    'suppression_scope',
    'retraction_reason',
    'replacement_record_id',
    'source_event_links_json',
    'source_dialogue_record_links_json',
    'affected_surfaces_json',
    'player_facing',
  ]);

  const constraints = await constraintDefinitions([
    'dnd5e_dialogue_annotation_lifecycle_record',
    'dnd5e_dialogue_correction_lifecycle_record',
  ]);
  const definitions = constraints.map((row) => row.definition).join('\n');

  assert.match(definitions, /rejected/);
  assert.match(definitions, /suppressed/);
  assert.match(definitions, /retracted/);
  assert.match(definitions, /superseded/);
});

test('Build 3 search index stores separate player-facing and GM/dev searchable text', async () => {
  const columns = await columnsFor('dnd5e_dialogue_search_index');

  assertHasColumns(columns, [
    'campaign_id',
    'transcript_id',
    'dialogue_record_id',
    'searchable_type',
    'searchable_id',
    'player_facing_text',
    'gm_dev_text',
    'topics_json',
    'npc_ids_json',
    'knowledge_entry_ids_json',
    'relationship_field_refs_json',
    'visibility_scope',
  ]);
});

test('Build 3 key foreign keys, uniqueness constraints, and indexes exist', async () => {
  const constraints = await constraintDefinitions(dialogueFocusCommitTableNames);
  const foreignKeys = constraints.filter((row) => row.referenced_table);
  const fkPairs = new Set(
    foreignKeys.map((row) => `${row.table_name}->${row.referenced_table}`)
  );

  assert.equal(
    fkPairs.has('dnd5e_completed_dialogue_record->dnd5e_dialogue_transcript'),
    true
  );
  assert.equal(fkPairs.has('dnd5e_dialogue_turn->dnd5e_dialogue_transcript'), true);
  assert.equal(
    fkPairs.has('dnd5e_dialogue_relationship_audit_record->dnd5e_dialogue_social_move_record'),
    true
  );
  assert.equal(
    fkPairs.has(
      'dnd5e_dialogue_relationship_audit_record->dnd5e_dialogue_clarifying_question_record'
    ),
    true
  );
  assert.equal(
    fkPairs.has('dnd5e_dialogue_annotation_lifecycle_record->dnd5e_dialogue_annotation_correction_chain'),
    true
  );
  assert.equal(
    fkPairs.has('dnd5e_dialogue_correction_lifecycle_record->dnd5e_dialogue_annotation_correction_chain'),
    true
  );

  const completedIndexes = await indexNamesFor('dnd5e_completed_dialogue_record');
  const turnIndexes = await indexNamesFor('dnd5e_dialogue_turn');
  const clarifyingIndexes = await indexNamesFor('dnd5e_dialogue_clarifying_question_record');
  const socialIndexes = await indexNamesFor('dnd5e_dialogue_social_move_record');
  const fallbackIndexes = await indexNamesFor('dnd5e_dialogue_generic_fallback_usage');
  const searchIndexes = await indexNamesFor('dnd5e_dialogue_search_index');

  assert.equal(completedIndexes.has('idx_dnd5e_completed_dialogue_record_history'), true);
  assert.equal(turnIndexes.has('idx_dnd5e_dialogue_turn_transcript_index'), true);
  assert.equal(clarifyingIndexes.has('idx_dnd5e_clarifying_question_once'), true);
  assert.equal(socialIndexes.has('idx_dnd5e_social_move_action_window_unique'), true);
  assert.equal(fallbackIndexes.has('idx_dnd5e_fallback_usage_scene_policy'), true);
  assert.equal(searchIndexes.has('idx_dnd5e_dialogue_search_unique_visibility'), true);
});

test('Build 3 dialogue persistence migration can be safely re-applied', async () => {
  resetDialogueFocusCommitPersistenceSchemaForTests();
  await ensureDialogueFocusCommitPersistenceSchema();
  resetDialogueFocusCommitPersistenceSchemaForTests();
  await ensureDialogueFocusCommitPersistenceSchema();

  const result = await query('SELECT COUNT(*)::int AS count FROM dnd5e_dialogue_transcript;');
  assert.equal(typeof result.rows[0].count, 'number');
});
