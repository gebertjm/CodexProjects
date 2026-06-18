BEGIN;

ALTER TABLE dnd5e_npc
  ADD COLUMN IF NOT EXISTS true_name TEXT,
  ADD COLUMN IF NOT EXISTS public_role_label TEXT,
  ADD COLUMN IF NOT EXISTS unknown_label TEXT,
  ADD COLUMN IF NOT EXISTS aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_location_key VARCHAR(180),
  ADD COLUMN IF NOT EXISTS default_scene_key VARCHAR(180),
  ADD COLUMN IF NOT EXISTS default_visibility VARCHAR(80) NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS default_availability VARCHAR(80) NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS default_actions_json JSONB NOT NULL DEFAULT '["observe", "talk"]'::jsonb,
  ADD COLUMN IF NOT EXISTS identity_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE dnd5e_npc
SET
  true_name = COALESCE(true_name, name),
  public_role_label = COALESCE(public_role_label, NULLIF(role, '')),
  unknown_label = COALESCE(unknown_label, name),
  aliases_json = COALESCE(aliases_json, '[]'::jsonb),
  default_actions_json = COALESCE(default_actions_json, '["observe", "talk"]'::jsonb),
  identity_json = COALESCE(identity_json, '{}'::jsonb),
  schedule_json = COALESCE(schedule_json, '[]'::jsonb),
  metadata_json = COALESCE(metadata_json, '{}'::jsonb);

ALTER TABLE dnd5e_npc
  DROP CONSTRAINT IF EXISTS dnd5e_npc_default_visibility_check;

ALTER TABLE dnd5e_npc
  ADD CONSTRAINT dnd5e_npc_default_visibility_check CHECK (
    default_visibility IN ('visible', 'hidden', 'not_visible')
  );

ALTER TABLE dnd5e_npc
  DROP CONSTRAINT IF EXISTS dnd5e_npc_default_availability_check;

ALTER TABLE dnd5e_npc
  ADD CONSTRAINT dnd5e_npc_default_availability_check CHECK (
    default_availability IN ('available', 'limited', 'unavailable')
  );

ALTER TABLE dnd5e_world_entity_state
  DROP CONSTRAINT IF EXISTS dnd5e_world_entity_state_status_check;

ALTER TABLE dnd5e_world_entity_state
  ADD CONSTRAINT dnd5e_world_entity_state_status_check CHECK (
    status IN (
      'active',
      'inactive',
      'hidden',
      'dead',
      'defeated',
      'removed',
      'captured',
      'fleeing',
      'hiding',
      'unconscious',
      'unavailable',
      'scene_locked',
      'archived'
    )
  );

ALTER TABLE dnd5e_world_event
  DROP CONSTRAINT IF EXISTS dnd5e_world_event_known_type_check;

ALTER TABLE dnd5e_world_event
  ADD CONSTRAINT dnd5e_world_event_known_type_check CHECK (
    event_type IN (
      'interaction_resolved',
      'knowledge_granted',
      'scene_state_changed',
      'affordance_state_changed',
      'entity_state_changed',
      'npc_state_changed',
      'objective_updated',
      'campaign_started',
      'character_entered_scene',
      'manual_adjustment',
      'environment_changed',
      'time_advanced',
      'weather_changed',
      'environment_override_set',
      'environment_override_cleared'
    )
  );

CREATE INDEX IF NOT EXISTS idx_dnd5e_npc_schedule_active
  ON dnd5e_npc(is_active, default_scene_key, default_location_key);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_entity_state_presence
  ON dnd5e_world_entity_state(world_instance_id, entity_key, status);

COMMIT;
