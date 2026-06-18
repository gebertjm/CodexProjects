BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_transcript (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  dialogue_id BIGINT REFERENCES dnd5e_dialogue(id) ON DELETE SET NULL,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  scene_state_id BIGINT REFERENCES dnd5e_world_scene_state(id) ON DELETE SET NULL,
  dialogue_scene_key VARCHAR(220) NOT NULL,
  participants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_scope VARCHAR(40) NOT NULL DEFAULT 'player',
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_dialogue_transcript_key_check CHECK (btrim(dialogue_scene_key) <> ''),
  CONSTRAINT dnd5e_dialogue_transcript_visibility_check CHECK (
    visibility_scope IN ('player', 'gm_dev', 'debug', 'mixed')
  ),
  CONSTRAINT dnd5e_dialogue_transcript_status_check CHECK (
    status IN ('active', 'completed', 'cancelled', 'archived')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_completed_dialogue_record (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  dialogue_id BIGINT REFERENCES dnd5e_dialogue(id) ON DELETE SET NULL,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  dialogue_scene_key VARCHAR(220) NOT NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  scene_state_id BIGINT REFERENCES dnd5e_world_scene_state(id) ON DELETE SET NULL,
  transcript_id BIGINT REFERENCES dnd5e_dialogue_transcript(id) ON DELETE SET NULL,
  participants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_source_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_beat_id BIGINT REFERENCES dnd5e_action_window(id) ON DELETE SET NULL,
  end_beat_id BIGINT REFERENCES dnd5e_action_window(id) ON DELETE SET NULL,
  start_turn_id BIGINT,
  end_turn_id BIGINT,
  exit_mode VARCHAR(80),
  exit_id VARCHAR(220),
  transition_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  compact_summary TEXT NOT NULL,
  canonical_outputs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  history_event_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  relationship_summary_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  annotation_chain_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correction_chain_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_scope VARCHAR(40) NOT NULL DEFAULT 'player',
  player_facing_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_completed_dialogue_record_key_check CHECK (btrim(dialogue_scene_key) <> ''),
  CONSTRAINT dnd5e_completed_dialogue_record_summary_check CHECK (btrim(compact_summary) <> ''),
  CONSTRAINT dnd5e_completed_dialogue_record_visibility_check CHECK (
    visibility_scope IN ('player', 'gm_dev', 'debug')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_turn (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  transcript_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_transcript(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  turn_type VARCHAR(80) NOT NULL,
  speaker_type VARCHAR(80),
  speaker_id VARCHAR(220),
  speaker_label TEXT,
  player_facing_content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  gm_dev_content_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_interaction_id VARCHAR(220),
  beat_id BIGINT REFERENCES dnd5e_action_window(id) ON DELETE SET NULL,
  action_id BIGINT REFERENCES dnd5e_web_action_submission(id) ON DELETE SET NULL,
  visibility_scope VARCHAR(40) NOT NULL DEFAULT 'player',
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_dialogue_turn_index_check CHECK (turn_index >= 0),
  CONSTRAINT dnd5e_dialogue_turn_type_check CHECK (
    turn_type IN (
      'npc_surface',
      'player_submission',
      'clarifying_question',
      'clarifying_answer',
      'committed_social_move',
      'social_move_result',
      'exit',
      'system_summary',
      'annotation',
      'correction'
    )
  ),
  CONSTRAINT dnd5e_dialogue_turn_visibility_check CHECK (
    visibility_scope IN ('player', 'gm_dev', 'debug')
  )
);

ALTER TABLE dnd5e_completed_dialogue_record
  DROP CONSTRAINT IF EXISTS dnd5e_completed_dialogue_record_start_turn_fk;
ALTER TABLE dnd5e_completed_dialogue_record
  ADD CONSTRAINT dnd5e_completed_dialogue_record_start_turn_fk
  FOREIGN KEY (start_turn_id) REFERENCES dnd5e_dialogue_turn(id) ON DELETE SET NULL;

ALTER TABLE dnd5e_completed_dialogue_record
  DROP CONSTRAINT IF EXISTS dnd5e_completed_dialogue_record_end_turn_fk;
ALTER TABLE dnd5e_completed_dialogue_record
  ADD CONSTRAINT dnd5e_completed_dialogue_record_end_turn_fk
  FOREIGN KEY (end_turn_id) REFERENCES dnd5e_dialogue_turn(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_clarifying_question_record (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  dialogue_scene_state_id BIGINT,
  dialogue_scene_key VARCHAR(220) NOT NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  clarifying_question_id VARCHAR(220) NOT NULL,
  target_id VARCHAR(220),
  status VARCHAR(40) NOT NULL DEFAULT 'available',
  persisted_result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_visibility VARCHAR(40) NOT NULL DEFAULT 'visible',
  asked_at TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  unlocked_by_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  canonical_output_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  retry_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  transcript_turn_id BIGINT REFERENCES dnd5e_dialogue_turn(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_clarifying_question_scene_key_check CHECK (btrim(dialogue_scene_key) <> ''),
  CONSTRAINT dnd5e_clarifying_question_id_check CHECK (btrim(clarifying_question_id) <> ''),
  CONSTRAINT dnd5e_clarifying_question_status_check CHECK (
    status IN ('available', 'hidden', 'locked', 'asked', 'attempted', 'failed', 'succeeded')
  ),
  CONSTRAINT dnd5e_clarifying_question_visibility_check CHECK (
    check_visibility IN ('visible', 'hidden', 'success_only', 'narrative_only')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_social_move_record (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  dialogue_scene_state_id BIGINT,
  action_window_id BIGINT REFERENCES dnd5e_action_window(id) ON DELETE SET NULL,
  dialogue_scene_key VARCHAR(220) NOT NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  committed_social_move_id VARCHAR(220),
  generic_fallback_id VARCHAR(220),
  social_move_type VARCHAR(80) NOT NULL,
  social_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  tone_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_text TEXT,
  preview_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_debug_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_move_confidence NUMERIC(5,4),
  requires_check BOOLEAN NOT NULL DEFAULT FALSE,
  check_result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_visibility VARCHAR(40) NOT NULL DEFAULT 'visible',
  result_branch VARCHAR(120),
  result_text TEXT,
  latest_development TEXT,
  consumed_beat_id BIGINT REFERENCES dnd5e_action_window(id) ON DELETE SET NULL,
  canonical_output_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  relationship_audit_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  exit_transition_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  transcript_turn_id BIGINT REFERENCES dnd5e_dialogue_turn(id) ON DELETE SET NULL,
  visibility_scope VARCHAR(40) NOT NULL DEFAULT 'player',
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_social_move_scene_key_check CHECK (btrim(dialogue_scene_key) <> ''),
  CONSTRAINT dnd5e_social_move_type_check CHECK (btrim(social_move_type) <> ''),
  CONSTRAINT dnd5e_social_move_check_visibility_check CHECK (
    check_visibility IN ('visible', 'hidden', 'success_only', 'narrative_only')
  ),
  CONSTRAINT dnd5e_social_move_visibility_scope_check CHECK (
    visibility_scope IN ('player', 'gm_dev', 'debug')
  ),
  CONSTRAINT dnd5e_social_move_status_check CHECK (
    status IN ('previewed', 'submitted', 'resolved', 'failed', 'cancelled')
  ),
  CONSTRAINT dnd5e_social_move_confidence_check CHECK (
    matched_move_confidence IS NULL OR (matched_move_confidence >= 0 AND matched_move_confidence <= 1)
  ),
  CONSTRAINT dnd5e_social_move_authored_or_fallback_check CHECK (
    committed_social_move_id IS NOT NULL OR generic_fallback_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_generic_fallback_usage (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  dialogue_scene_state_id BIGINT,
  dialogue_scene_key VARCHAR(220) NOT NULL,
  fallback_policy_id VARCHAR(220) NOT NULL DEFAULT 'default',
  used_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  exhausted BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_social_move_record_id BIGINT REFERENCES dnd5e_dialogue_social_move_record(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_fallback_usage_counts_check CHECK (used_count >= 0 AND failed_count >= 0),
  CONSTRAINT dnd5e_fallback_usage_key_check CHECK (btrim(dialogue_scene_key) <> ''),
  CONSTRAINT dnd5e_fallback_policy_id_check CHECK (btrim(fallback_policy_id) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_relationship_state_definition (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE CASCADE,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  field_name VARCHAR(120) NOT NULL,
  ownership_default VARCHAR(80) NOT NULL,
  value_type VARCHAR(40) NOT NULL,
  ladder_values_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_value_json JSONB NOT NULL DEFAULT 'null'::jsonb,
  visibility_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  allowed_write_scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  shorthand_behavior VARCHAR(40) NOT NULL DEFAULT 'explicit_only',
  override_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  migration_mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_relationship_definition_field_check CHECK (btrim(field_name) <> ''),
  CONSTRAINT dnd5e_relationship_definition_ownership_check CHECK (
    ownership_default IN ('persistent_npc_state', 'dialogue_scene_state', 'custom', 'explicit')
  ),
  CONSTRAINT dnd5e_relationship_definition_value_type_check CHECK (
    value_type IN ('number', 'boolean', 'enum', 'ladder', 'text', 'tag_set', 'json')
  ),
  CONSTRAINT dnd5e_relationship_definition_shorthand_check CHECK (
    shorthand_behavior IN ('explicit_only', 'allow_unambiguous', 'disabled')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_npc_relationship_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  npc_id BIGINT NOT NULL REFERENCES dnd5e_npc(id) ON DELETE CASCADE,
  field_definition_id BIGINT REFERENCES dnd5e_dialogue_relationship_state_definition(id) ON DELETE RESTRICT,
  field_name VARCHAR(120) NOT NULL,
  value_json JSONB NOT NULL DEFAULT 'null'::jsonb,
  source_record_type VARCHAR(80),
  source_record_id BIGINT,
  last_audit_record_id BIGINT,
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_npc_relationship_state_field_check CHECK (btrim(field_name) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_scene_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  dialogue_scene_key VARCHAR(220) NOT NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  participant_id VARCHAR(220),
  field_definition_id BIGINT REFERENCES dnd5e_dialogue_relationship_state_definition(id) ON DELETE RESTRICT,
  field_name VARCHAR(120) NOT NULL,
  value_json JSONB NOT NULL DEFAULT 'null'::jsonb,
  scope VARCHAR(80) NOT NULL,
  expires_at TIMESTAMPTZ,
  decay_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cleared_by_event_id BIGINT REFERENCES dnd5e_campaign_log(id) ON DELETE SET NULL,
  source_record_type VARCHAR(80),
  source_record_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_dialogue_scene_state_key_check CHECK (btrim(dialogue_scene_key) <> ''),
  CONSTRAINT dnd5e_dialogue_scene_state_field_check CHECK (btrim(field_name) <> ''),
  CONSTRAINT dnd5e_dialogue_scene_state_scope_check CHECK (
    scope IN ('dialogue_scene_state', 'dialogue_local', 'temporary', 'decaying', 'cleared_by_event')
  )
);

ALTER TABLE dnd5e_dialogue_clarifying_question_record
  DROP CONSTRAINT IF EXISTS dnd5e_clarifying_question_scene_state_fk;
ALTER TABLE dnd5e_dialogue_clarifying_question_record
  ADD CONSTRAINT dnd5e_clarifying_question_scene_state_fk
  FOREIGN KEY (dialogue_scene_state_id) REFERENCES dnd5e_dialogue_scene_state(id) ON DELETE SET NULL;

ALTER TABLE dnd5e_dialogue_social_move_record
  DROP CONSTRAINT IF EXISTS dnd5e_social_move_scene_state_fk;
ALTER TABLE dnd5e_dialogue_social_move_record
  ADD CONSTRAINT dnd5e_social_move_scene_state_fk
  FOREIGN KEY (dialogue_scene_state_id) REFERENCES dnd5e_dialogue_scene_state(id) ON DELETE SET NULL;

ALTER TABLE dnd5e_dialogue_generic_fallback_usage
  DROP CONSTRAINT IF EXISTS dnd5e_fallback_usage_scene_state_fk;
ALTER TABLE dnd5e_dialogue_generic_fallback_usage
  ADD CONSTRAINT dnd5e_fallback_usage_scene_state_fk
  FOREIGN KEY (dialogue_scene_state_id) REFERENCES dnd5e_dialogue_scene_state(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_relationship_audit_record (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  dialogue_scene_state_id BIGINT REFERENCES dnd5e_dialogue_scene_state(id) ON DELETE SET NULL,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  participant_id VARCHAR(220),
  source_scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  source_interaction_id VARCHAR(220),
  source_result_branch VARCHAR(120),
  audit_type VARCHAR(80) NOT NULL,
  field_definition_id BIGINT REFERENCES dnd5e_dialogue_relationship_state_definition(id) ON DELETE SET NULL,
  field_name VARCHAR(120) NOT NULL,
  scope VARCHAR(80) NOT NULL,
  old_value_json JSONB,
  new_value_json JSONB,
  reason TEXT,
  player_facing_status VARCHAR(80) NOT NULL DEFAULT 'hidden',
  related_social_move_record_id BIGINT REFERENCES dnd5e_dialogue_social_move_record(id) ON DELETE SET NULL,
  related_clarifying_question_record_id BIGINT REFERENCES dnd5e_dialogue_clarifying_question_record(id) ON DELETE SET NULL,
  related_exit_id VARCHAR(220),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_relationship_audit_type_check CHECK (
    audit_type IN (
      'read',
      'write',
      'shorthand_resolution',
      'availability_check',
      'override_mapping',
      'validation'
    )
  ),
  CONSTRAINT dnd5e_relationship_audit_field_check CHECK (btrim(field_name) <> ''),
  CONSTRAINT dnd5e_relationship_audit_scope_check CHECK (
    scope IN (
      'persistent_npc_state',
      'dialogue_scene_state',
      'dialogue_local',
      'temporary',
      'decaying',
      'cleared_by_event'
    )
  ),
  CONSTRAINT dnd5e_relationship_audit_player_status_check CHECK (
    player_facing_status IN ('hidden', 'player_visible', 'player_perceived', 'canonical_history')
  )
);

ALTER TABLE dnd5e_dialogue_npc_relationship_state
  DROP CONSTRAINT IF EXISTS dnd5e_npc_relationship_state_last_audit_fk;
ALTER TABLE dnd5e_dialogue_npc_relationship_state
  ADD CONSTRAINT dnd5e_npc_relationship_state_last_audit_fk
  FOREIGN KEY (last_audit_record_id) REFERENCES dnd5e_dialogue_relationship_audit_record(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_annotation_correction_chain (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  target_type VARCHAR(80) NOT NULL,
  target_id VARCHAR(220) NOT NULL,
  chain_type VARCHAR(40) NOT NULL,
  current_active_record_id BIGINT,
  created_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_annotation_chain_target_type_check CHECK (
    target_type IN (
      'completed_dialogue_record',
      'npc',
      'clue_topic',
      'knowledge_entry',
      'campaign_recap',
      'affected_surface'
    )
  ),
  CONSTRAINT dnd5e_annotation_chain_type_check CHECK (
    chain_type IN ('annotation', 'correction', 'mixed')
  ),
  CONSTRAINT dnd5e_annotation_chain_target_check CHECK (btrim(target_id) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_annotation_lifecycle_record (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  chain_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_annotation_correction_chain(id) ON DELETE CASCADE,
  record_type VARCHAR(80) NOT NULL DEFAULT 'annotation',
  review_status VARCHAR(80) NOT NULL DEFAULT 'suggested',
  lifecycle_status VARCHAR(80) NOT NULL DEFAULT 'draft',
  original_text TEXT,
  approved_or_active_text TEXT,
  reviewer_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  review_timestamp TIMESTAMPTZ,
  rejection_reason TEXT,
  suppression_scope VARCHAR(120),
  retraction_reason TEXT,
  replacement_record_id BIGINT,
  source_event_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_dialogue_record_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_surfaces_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_facing BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_annotation_lifecycle_record_type_check CHECK (
    record_type IN ('annotation', 'suggestion', 'edit', 'rejection', 'suppression', 'retraction', 'replacement')
  ),
  CONSTRAINT dnd5e_annotation_review_status_check CHECK (
    review_status IN ('suggested', 'pending_review', 'approved', 'approved_with_edits', 'rejected', 'suppressed')
  ),
  CONSTRAINT dnd5e_annotation_lifecycle_status_check CHECK (
    lifecycle_status IN ('draft', 'active', 'inactive', 'archived', 'superseded', 'retracted')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_correction_lifecycle_record (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  chain_id BIGINT NOT NULL REFERENCES dnd5e_dialogue_annotation_correction_chain(id) ON DELETE CASCADE,
  annotation_record_id BIGINT REFERENCES dnd5e_dialogue_annotation_lifecycle_record(id) ON DELETE SET NULL,
  record_type VARCHAR(80) NOT NULL DEFAULT 'correction',
  review_status VARCHAR(80) NOT NULL DEFAULT 'generated',
  lifecycle_status VARCHAR(80) NOT NULL DEFAULT 'draft',
  original_text TEXT,
  approved_or_active_text TEXT,
  reviewer_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  review_timestamp TIMESTAMPTZ,
  rejection_reason TEXT,
  suppression_scope VARCHAR(120),
  retraction_reason TEXT,
  replacement_record_id BIGINT,
  source_event_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_dialogue_record_links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_surfaces_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_facing BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_correction_lifecycle_record_type_check CHECK (
    record_type IN ('correction', 'generated_correction', 'edit', 'rejection', 'suppression', 'retraction', 'replacement')
  ),
  CONSTRAINT dnd5e_correction_review_status_check CHECK (
    review_status IN ('generated', 'pending_review', 'approved', 'approved_with_edits', 'rejected', 'suppressed')
  ),
  CONSTRAINT dnd5e_correction_lifecycle_status_check CHECK (
    lifecycle_status IN ('draft', 'active', 'inactive', 'archived', 'superseded', 'retracted')
  )
);

ALTER TABLE dnd5e_dialogue_annotation_lifecycle_record
  DROP CONSTRAINT IF EXISTS dnd5e_annotation_lifecycle_replacement_fk;
ALTER TABLE dnd5e_dialogue_annotation_lifecycle_record
  ADD CONSTRAINT dnd5e_annotation_lifecycle_replacement_fk
  FOREIGN KEY (replacement_record_id) REFERENCES dnd5e_dialogue_annotation_lifecycle_record(id) ON DELETE SET NULL;

ALTER TABLE dnd5e_dialogue_correction_lifecycle_record
  DROP CONSTRAINT IF EXISTS dnd5e_correction_lifecycle_replacement_fk;
ALTER TABLE dnd5e_dialogue_correction_lifecycle_record
  ADD CONSTRAINT dnd5e_correction_lifecycle_replacement_fk
  FOREIGN KEY (replacement_record_id) REFERENCES dnd5e_dialogue_correction_lifecycle_record(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dnd5e_dialogue_search_index (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  dialogue_record_id BIGINT REFERENCES dnd5e_completed_dialogue_record(id) ON DELETE CASCADE,
  transcript_id BIGINT REFERENCES dnd5e_dialogue_transcript(id) ON DELETE CASCADE,
  searchable_type VARCHAR(80) NOT NULL,
  searchable_id BIGINT NOT NULL,
  player_facing_text TEXT,
  gm_dev_text TEXT,
  topics_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  npc_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_entry_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  relationship_field_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_scope VARCHAR(40) NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_dialogue_search_type_check CHECK (btrim(searchable_type) <> ''),
  CONSTRAINT dnd5e_dialogue_search_visibility_check CHECK (
    visibility_scope IN ('player', 'gm_dev', 'debug')
  ),
  CONSTRAINT dnd5e_dialogue_search_player_text_check CHECK (
    visibility_scope <> 'player' OR player_facing_text IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_dialogue_transcript_session_unique
  ON dnd5e_dialogue_transcript(dialogue_session_id)
  WHERE dialogue_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_transcript_campaign_character_status
  ON dnd5e_dialogue_transcript(campaign_id, character_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_transcript_scene
  ON dnd5e_dialogue_transcript(campaign_id, dialogue_scene_key, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_completed_dialogue_record_session_unique
  ON dnd5e_completed_dialogue_record(dialogue_session_id)
  WHERE dialogue_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_completed_dialogue_record_history
  ON dnd5e_completed_dialogue_record(campaign_id, character_id, completed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_completed_dialogue_record_scene
  ON dnd5e_completed_dialogue_record(campaign_id, dialogue_scene_key, completed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_dialogue_turn_transcript_index
  ON dnd5e_dialogue_turn(transcript_id, turn_index);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_turn_campaign_recent
  ON dnd5e_dialogue_turn(campaign_id, character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_turn_source
  ON dnd5e_dialogue_turn(source_interaction_id, created_at DESC)
  WHERE source_interaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_clarifying_question_once
  ON dnd5e_dialogue_clarifying_question_record(
    campaign_id,
    character_id,
    dialogue_scene_key,
    clarifying_question_id,
    COALESCE(dialogue_session_id, 0)
  );

CREATE INDEX IF NOT EXISTS idx_dnd5e_clarifying_question_session
  ON dnd5e_dialogue_clarifying_question_record(dialogue_session_id, updated_at DESC)
  WHERE dialogue_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_clarifying_question_status
  ON dnd5e_dialogue_clarifying_question_record(campaign_id, character_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_social_move_action_window_unique
  ON dnd5e_dialogue_social_move_record(action_window_id)
  WHERE action_window_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_social_move_campaign_recent
  ON dnd5e_dialogue_social_move_record(campaign_id, character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_social_move_session_recent
  ON dnd5e_dialogue_social_move_record(dialogue_session_id, created_at DESC)
  WHERE dialogue_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_fallback_usage_scene_policy
  ON dnd5e_dialogue_generic_fallback_usage(
    campaign_id,
    character_id,
    dialogue_scene_key,
    fallback_policy_id,
    COALESCE(dialogue_session_id, 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_relationship_definition_scope
  ON dnd5e_dialogue_relationship_state_definition(
    COALESCE(world_id, 0),
    COALESCE(campaign_id, 0),
    COALESCE(npc_id, 0),
    COALESCE(scene_id, 0),
    ownership_default,
    field_name
  );

CREATE INDEX IF NOT EXISTS idx_dnd5e_relationship_definition_field
  ON dnd5e_dialogue_relationship_state_definition(field_name, ownership_default)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_npc_relationship_state_current
  ON dnd5e_dialogue_npc_relationship_state(
    campaign_id,
    COALESCE(character_id, 0),
    npc_id,
    field_name
  );

CREATE INDEX IF NOT EXISTS idx_dnd5e_npc_relationship_state_npc_field
  ON dnd5e_dialogue_npc_relationship_state(npc_id, field_name, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_dialogue_scene_state_current
  ON dnd5e_dialogue_scene_state(
    campaign_id,
    character_id,
    dialogue_scene_key,
    COALESCE(dialogue_session_id, 0),
    COALESCE(npc_id, 0),
    COALESCE(participant_id, ''),
    field_name,
    scope
  );

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_scene_state_expiry
  ON dnd5e_dialogue_scene_state(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_relationship_audit_campaign_recent
  ON dnd5e_dialogue_relationship_audit_record(campaign_id, character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_relationship_audit_source
  ON dnd5e_dialogue_relationship_audit_record(source_interaction_id, created_at DESC)
  WHERE source_interaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_relationship_audit_field_scope
  ON dnd5e_dialogue_relationship_audit_record(field_name, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_annotation_chain_target
  ON dnd5e_dialogue_annotation_correction_chain(target_type, target_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_annotation_lifecycle_chain
  ON dnd5e_dialogue_annotation_lifecycle_record(chain_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_annotation_lifecycle_status
  ON dnd5e_dialogue_annotation_lifecycle_record(review_status, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_dnd5e_correction_lifecycle_chain
  ON dnd5e_dialogue_correction_lifecycle_record(chain_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_correction_lifecycle_status
  ON dnd5e_dialogue_correction_lifecycle_record(review_status, lifecycle_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_dialogue_search_unique_visibility
  ON dnd5e_dialogue_search_index(searchable_type, searchable_id, visibility_scope);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_search_campaign_recent
  ON dnd5e_dialogue_search_index(campaign_id, character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_dialogue_search_topics_gin
  ON dnd5e_dialogue_search_index USING GIN (topics_json);

COMMIT;
