export const dialogueFocusCommitTableNames = Object.freeze([
  'dnd5e_dialogue_transcript',
  'dnd5e_completed_dialogue_record',
  'dnd5e_dialogue_turn',
  'dnd5e_dialogue_clarifying_question_record',
  'dnd5e_dialogue_social_move_record',
  'dnd5e_dialogue_generic_fallback_usage',
  'dnd5e_dialogue_relationship_state_definition',
  'dnd5e_dialogue_npc_relationship_state',
  'dnd5e_dialogue_scene_state',
  'dnd5e_dialogue_relationship_audit_record',
  'dnd5e_dialogue_annotation_correction_chain',
  'dnd5e_dialogue_annotation_lifecycle_record',
  'dnd5e_dialogue_correction_lifecycle_record',
  'dnd5e_dialogue_search_index',
]);

export const selectCompletedDialogueRecordsCompactQuery = `
  SELECT
    completed.id,
    completed.campaign_id,
    completed.world_instance_id,
    completed.character_id,
    completed.dialogue_session_id,
    completed.dialogue_scene_key,
    completed.exit_mode,
    completed.exit_id,
    completed.transition_ref_json,
    completed.compact_summary,
    completed.canonical_outputs_json,
    completed.knowledge_links_json,
    completed.history_event_links_json,
    completed.relationship_summary_links_json,
    completed.transcript_id,
    completed.visibility_scope,
    completed.started_at,
    completed.completed_at,
    completed.created_at,
    completed.updated_at
  FROM dnd5e_completed_dialogue_record completed
  WHERE completed.campaign_id = $1
    AND completed.character_id = $2
    AND completed.visibility_scope = 'player'
  ORDER BY completed.completed_at DESC NULLS LAST, completed.id DESC
  LIMIT $3;
`;

export const selectDialogueTranscriptTurnsQuery = `
  SELECT
    turn.id,
    turn.transcript_id,
    turn.turn_index,
    turn.turn_type,
    turn.speaker_type,
    turn.speaker_id,
    turn.speaker_label,
    turn.player_facing_content_json,
    turn.source_interaction_id,
    turn.beat_id,
    turn.action_id,
    turn.visibility_scope,
    turn.created_at
  FROM dnd5e_dialogue_turn turn
  WHERE turn.transcript_id = $1
    AND turn.visibility_scope = 'player'
  ORDER BY turn.turn_index ASC, turn.id ASC;
`;
