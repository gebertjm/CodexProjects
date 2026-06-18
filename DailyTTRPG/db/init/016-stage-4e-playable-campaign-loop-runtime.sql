BEGIN;

ALTER TABLE dnd5e_campaign_log
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_log_type_check;

ALTER TABLE dnd5e_campaign_log
  ADD CONSTRAINT dnd5e_campaign_log_type_check CHECK (
    log_type IN (
      'character_joined',
      'scene_entered',
      'scene_moved',
      'interaction_attempted',
      'flag_changed',
      'quest_updated',
      'objective_updated',
      'npc_state_changed',
      'dialogue_started',
      'dialogue_choice',
      'dialogue_ended',
      'combat_started',
      'combat_turn_advanced',
      'combat_action',
      'combat_resolved',
      'reward_applied',
      'knowledge_discovered',
      'scene_unlocked',
      'adventure_state_updated',
      'play_action',
      'thread_interrupted',
      'action_window_opened',
      'action_window_closed',
      'system'
    )
  );

CREATE TABLE IF NOT EXISTS dnd5e_character_default_action_policy (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  response_timeout_seconds INTEGER NOT NULL DEFAULT 86400,
  default_action_type VARCHAR(50) NOT NULL DEFAULT 'wait',
  default_action_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_character_default_action_policy_unique UNIQUE (campaign_id, character_id),
  CONSTRAINT dnd5e_character_default_action_policy_timeout_check CHECK (
    response_timeout_seconds >= 5 AND response_timeout_seconds <= 604800
  ),
  CONSTRAINT dnd5e_character_default_action_policy_type_check CHECK (
    default_action_type IN ('wait', 'end_turn', 'resolve_ai_turn', 'first_available_action')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_action_window (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  dialogue_session_id BIGINT REFERENCES dnd5e_dialogue_session(id) ON DELETE SET NULL,
  combat_id BIGINT REFERENCES dnd5e_combat(id) ON DELETE SET NULL,
  event_instance_id BIGINT REFERENCES dnd5e_event_instance(id) ON DELETE SET NULL,
  window_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  prompt_text TEXT,
  suggested_action_key VARCHAR(150),
  default_action_type VARCHAR(50),
  default_action_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  opens_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_action_window_type_check CHECK (
    window_type IN (
      'dialogue_choice',
      'dialogue_check',
      'combat_turn',
      'combat_wait',
      'event_choice',
      'scene_entry',
      'exploration'
    )
  ),
  CONSTRAINT dnd5e_action_window_status_check CHECK (
    status IN (
      'pending_prompt',
      'open',
      'closing',
      'closed',
      'resolving',
      'resolved',
      'expired',
      'canceled',
      'cancelled'
    )
  ),
  CONSTRAINT dnd5e_action_window_default_action_type_check CHECK (
    default_action_type IS NULL OR default_action_type IN (
      'wait',
      'end_turn',
      'resolve_ai_turn',
      'first_available_action'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_action_window_open_character
  ON dnd5e_action_window(campaign_id, character_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_dnd5e_action_window_character_status
  ON dnd5e_action_window(character_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_action_window_campaign_character
  ON dnd5e_action_window(campaign_id, character_id, created_at DESC, id DESC);

INSERT INTO dnd5e_character_default_action_policy (
  campaign_id,
  character_id,
  response_timeout_seconds,
  default_action_type,
  default_action_payload_json,
  notes
)
SELECT
  membership.campaign_id,
  membership.character_id,
  86400,
  'wait',
  '{}'::jsonb,
  'Auto-seeded Stage 4E default policy.'
FROM dnd5e_campaign_character membership
WHERE membership.is_active = TRUE
ON CONFLICT (campaign_id, character_id) DO NOTHING;

COMMIT;
