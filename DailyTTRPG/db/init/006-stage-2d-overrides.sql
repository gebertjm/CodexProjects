CREATE TABLE IF NOT EXISTS dnd5e_override (
  id bigint primary key generated always as identity,
  character_id bigint not null references dnd5e_character(id) on delete cascade,
  target_scope varchar(50) not null,
  target_entity_id bigint,
  override_category varchar(100) not null,
  subject_key varchar(150),
  operation_type varchar(50) not null,
  value_json jsonb,
  reason text not null,
  actor_account_id bigint references account(id) on delete set null,
  actor_label varchar(100),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dnd5e_override_target_scope_check check (
    target_scope in ('character', 'character_item')
  ),
  constraint dnd5e_override_category_check check (
    override_category in (
      'bypass_feat_prerequisite',
      'grant_illegal_spell',
      'bypass_spell_preparation_limit',
      'adjust_spell_slots',
      'override_inventory_item_uses'
    )
  ),
  constraint dnd5e_override_operation_type_check check (
    operation_type in ('allow', 'adjust', 'replace')
  ),
  constraint dnd5e_override_actor_presence_check check (
    actor_account_id is not null or actor_label is not null
  ),
  constraint dnd5e_override_reason_present_check check (
    btrim(reason) <> ''
  ),
  constraint dnd5e_override_deactivation_consistency_check check (
    (is_active = true and deactivated_at is null)
    or (is_active = false)
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_override_character_id
  ON dnd5e_override(character_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_override_active_lookup
  ON dnd5e_override(character_id, override_category, target_scope, is_active);

CREATE INDEX IF NOT EXISTS idx_dnd5e_override_target_lookup
  ON dnd5e_override(target_scope, target_entity_id);
