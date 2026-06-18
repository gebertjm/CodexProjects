# Dialogue Migration Plan

This document proposes database schema changes. Build 3 implemented the first persistence migration without enabling runtime dialogue behavior.

Build 3 implementation note:

- Migration file: `db/init/033-stage-dialogue-focus-commit-persistence.sql`.
- Schema bootstrap helper: `backend/src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js`.
- Query constants/table names: `backend/src/db/queries/dialogueFocusCommit.js`.
- Migration contract tests: `backend/test/dialogue-focus-commit-migration.test.js`.
- Implemented table names use the repo's `dnd5e_` prefix and mostly singular table naming, such as `dnd5e_completed_dialogue_record`, `dnd5e_dialogue_transcript`, and `dnd5e_dialogue_turn`.
- Compact completed dialogue records store annotation/correction chain references as JSON arrays for now; future builds can add link tables if query patterns demand them.
- Runtime services, migrations beyond schema persistence, player UI, GM/dev UI, and dialogue resolution remain future work.

## Migration Principles

- Add tables before runtime writes.
- Keep player-facing records separate from GM/dev/debug records.
- Preserve canonical event/state mutation provenance.
- Use uniqueness constraints to prevent rerolls, duplicate committed moves, duplicate transcript turns, and duplicate completed records.
- Store canonical timestamps in UTC.
- Prefer JSONB only for flexible read-model payloads; important query dimensions should be columns.

## Existing Tables To Preserve

Existing dialogue graph/session tables are already used by `dialogueService` and `db/queries/dialogue.js`. New tables should extend rather than immediately replace them.

Expected existing concepts:

- `dnd5e_dialogue`
- `dnd5e_dialogue_node`
- `dnd5e_dialogue_option`
- `dnd5e_dialogue_outcome`
- `dnd5e_dialogue_session`
- `dnd5e_dialogue_session_state`
- `dnd5e_dialogue_session_choice`
- `dnd5e_dialogue_session_visit`

## completed_dialogue_records

Purpose: stable player-facing completed dialogue read model.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `world_instance_id BIGINT NULL`
- `character_id BIGINT NOT NULL`
- `dialogue_id BIGINT NULL`
- `dialogue_key TEXT NOT NULL`
- `dialogue_session_id BIGINT NULL`
- `scene_id BIGINT NULL`
- `npc_id BIGINT NULL`
- `title TEXT NOT NULL`
- `summary TEXT NOT NULL`
- `outcome_summary TEXT NULL`
- `participants_json JSONB NOT NULL DEFAULT '[]'`
- `knowledge_gained_json JSONB NOT NULL DEFAULT '[]'`
- `relationship_changes_visible_json JSONB NOT NULL DEFAULT '[]'`
- `objective_updates_json JSONB NOT NULL DEFAULT '[]'`
- `safe_mechanics_json JSONB NOT NULL DEFAULT '[]'`
- `provenance_json JSONB NOT NULL DEFAULT '{}'`
- `visibility_scope TEXT NOT NULL DEFAULT 'player'`
- `started_at TIMESTAMPTZ NULL`
- `completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- `(campaign_id, character_id, completed_at DESC)`
- `(dialogue_session_id)` unique where not null
- `(dialogue_key, campaign_id, character_id)`

Visibility:

- This table is safe for normal player APIs.
- Hidden/GM fields must not be stored here except as opaque provenance references.

## dialogue_transcripts

Purpose: transcript container for active or completed dialogue.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `world_instance_id BIGINT NULL`
- `character_id BIGINT NOT NULL`
- `dialogue_id BIGINT NULL`
- `dialogue_key TEXT NOT NULL`
- `dialogue_session_id BIGINT NULL`
- `scene_id BIGINT NULL`
- `status TEXT NOT NULL`
- `visibility_scope TEXT NOT NULL DEFAULT 'player'`
- `started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `completed_at TIMESTAMPTZ NULL`
- `summary_json JSONB NOT NULL DEFAULT '{}'`
- `provenance_json JSONB NOT NULL DEFAULT '{}'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- `(campaign_id, character_id, status)`
- `(dialogue_session_id)` unique where not null
- `(dialogue_key, character_id, started_at DESC)`

## dialogue_turns

Purpose: ordered transcript turns.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `transcript_id BIGINT NOT NULL`
- `campaign_id BIGINT NOT NULL`
- `character_id BIGINT NOT NULL`
- `turn_index INTEGER NOT NULL`
- `turn_type TEXT NOT NULL`
- `speaker_type TEXT NOT NULL`
- `speaker_id TEXT NULL`
- `speaker_label TEXT NULL`
- `input_json JSONB NOT NULL DEFAULT '{}'`
- `output_json JSONB NOT NULL DEFAULT '{}'`
- `safe_mechanics_json JSONB NOT NULL DEFAULT '[]'`
- `visibility_scope TEXT NOT NULL DEFAULT 'player'`
- `source_record_type TEXT NULL`
- `source_record_id BIGINT NULL`
- `provenance_json JSONB NOT NULL DEFAULT '{}'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Constraints/indexes:

- Unique `(transcript_id, turn_index)`
- Index `(campaign_id, character_id, created_at DESC)`
- Index `(source_record_type, source_record_id)`

Visibility:

- Player API filters to player-visible rows and fields.
- GM/dev API can load debug-only rows by capability.

## clarifying_question_records

Purpose: durable non-beat question results.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `world_instance_id BIGINT NULL`
- `character_id BIGINT NOT NULL`
- `dialogue_session_id BIGINT NULL`
- `dialogue_key TEXT NOT NULL`
- `surface_id TEXT NULL`
- `question_id TEXT NOT NULL`
- `target_id TEXT NULL`
- `state_version TEXT NOT NULL DEFAULT 'default'`
- `status TEXT NOT NULL`
- `check_result_json JSONB NOT NULL DEFAULT '{}'`
- `check_visibility TEXT NOT NULL DEFAULT 'visible'`
- `result_text TEXT NOT NULL`
- `result_summary TEXT NULL`
- `knowledge_grants_applied_json JSONB NOT NULL DEFAULT '[]'`
- `state_changes_applied_json JSONB NOT NULL DEFAULT '[]'`
- `canonical_event_id BIGINT NULL`
- `transcript_turn_id BIGINT NULL`
- `resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Constraints/indexes:

- Unique `(campaign_id, character_id, dialogue_key, question_id, state_version)`
- Index `(dialogue_session_id, resolved_at DESC)`
- Index `(canonical_event_id)` where not null

Visibility:

- Hidden failures are stored here but omitted from player APIs.

## social_move_records

Purpose: committed dialogue beat/action records.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `world_instance_id BIGINT NULL`
- `character_id BIGINT NOT NULL`
- `dialogue_session_id BIGINT NULL`
- `action_window_id BIGINT NULL`
- `dialogue_key TEXT NOT NULL`
- `surface_id TEXT NULL`
- `move_id TEXT NULL`
- `generic_fallback_id TEXT NULL`
- `raw_text TEXT NULL`
- `resolved_intent TEXT NOT NULL`
- `target_id TEXT NULL`
- `status TEXT NOT NULL`
- `check_result_json JSONB NOT NULL DEFAULT '{}'`
- `check_visibility TEXT NOT NULL DEFAULT 'visible'`
- `npc_response TEXT NULL`
- `result_summary TEXT NOT NULL`
- `relationship_writes_json JSONB NOT NULL DEFAULT '[]'`
- `state_changes_applied_json JSONB NOT NULL DEFAULT '[]'`
- `knowledge_grants_applied_json JSONB NOT NULL DEFAULT '[]'`
- `canonical_event_ids_json JSONB NOT NULL DEFAULT '[]'`
- `transcript_turn_id BIGINT NULL`
- `submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `resolved_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- `(campaign_id, character_id, resolved_at DESC)`
- `(dialogue_session_id, submitted_at DESC)`
- `(action_window_id)` unique where not null

## relationship_state_definitions

Purpose: registered state fields and legal values.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `world_id BIGINT NULL`
- `campaign_id BIGINT NULL`
- `field_key TEXT NOT NULL`
- `scope TEXT NOT NULL`
- `value_type TEXT NOT NULL`
- `allowed_values_json JSONB NOT NULL DEFAULT '[]'`
- `default_value_json JSONB NOT NULL DEFAULT 'null'`
- `player_visibility TEXT NOT NULL DEFAULT 'hidden'`
- `gm_visibility TEXT NOT NULL DEFAULT 'full'`
- `description TEXT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Constraints/indexes:

- Unique `(COALESCE(world_id, 0), COALESCE(campaign_id, 0), scope, field_key)`
- Index `(scope, field_key)`

## npc_relationship_state

Purpose: current relationship/social state values.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `world_instance_id BIGINT NULL`
- `character_id BIGINT NOT NULL`
- `npc_id BIGINT NOT NULL`
- `field_key TEXT NOT NULL`
- `scope TEXT NOT NULL DEFAULT 'character_npc'`
- `value_json JSONB NOT NULL`
- `visibility TEXT NOT NULL`
- `source_record_type TEXT NULL`
- `source_record_id BIGINT NULL`
- `last_audit_record_id BIGINT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Constraints/indexes:

- Unique `(campaign_id, character_id, npc_id, scope, field_key)`
- Index `(npc_id, field_key)`
- Index `(last_audit_record_id)`

## dialogue_scene_state

Purpose: active dialogue-scene/session state versioning.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `character_id BIGINT NOT NULL`
- `dialogue_session_id BIGINT NULL`
- `dialogue_key TEXT NOT NULL`
- `surface_id TEXT NULL`
- `state_version INTEGER NOT NULL DEFAULT 1`
- `state_json JSONB NOT NULL DEFAULT '{}'`
- `current_surface_ref TEXT NULL`
- `status TEXT NOT NULL DEFAULT 'active'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- Unique `(campaign_id, character_id, dialogue_key, COALESCE(dialogue_session_id, 0))`
- Index `(status, updated_at DESC)`

## relationship_audit_records

Purpose: immutable audit of relationship/social state writes.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `world_instance_id BIGINT NULL`
- `character_id BIGINT NOT NULL`
- `npc_id BIGINT NULL`
- `field_key TEXT NOT NULL`
- `scope TEXT NOT NULL`
- `old_value_json JSONB NULL`
- `new_value_json JSONB NOT NULL`
- `operation TEXT NOT NULL`
- `visibility TEXT NOT NULL`
- `reason TEXT NOT NULL`
- `source_type TEXT NOT NULL`
- `source_id BIGINT NULL`
- `provenance_json JSONB NOT NULL DEFAULT '{}'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- `(campaign_id, character_id, created_at DESC)`
- `(npc_id, field_key, created_at DESC)`
- `(source_type, source_id)`

## annotation_correction_chains

Purpose: stable chain grouping for annotations/corrections.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `chain_key TEXT NOT NULL UNIQUE`
- `target_type TEXT NOT NULL`
- `target_key TEXT NOT NULL`
- `status TEXT NOT NULL`
- `created_by_account_id BIGINT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

## annotation_lifecycle_records

Purpose: annotation entries in a chain.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `chain_id BIGINT NOT NULL`
- `annotation_type TEXT NOT NULL`
- `severity TEXT NOT NULL`
- `visibility TEXT NOT NULL DEFAULT 'gm_dev_only'`
- `body TEXT NOT NULL`
- `source_type TEXT NULL`
- `source_id BIGINT NULL`
- `status TEXT NOT NULL`
- `created_by_account_id BIGINT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `resolved_at TIMESTAMPTZ NULL`

## correction_lifecycle_records

Purpose: corrections linked to annotations/chains.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `chain_id BIGINT NOT NULL`
- `annotation_id BIGINT NULL`
- `correction_type TEXT NOT NULL`
- `target_type TEXT NOT NULL`
- `target_key TEXT NOT NULL`
- `replacement_ref TEXT NULL`
- `patch_json JSONB NOT NULL DEFAULT '{}'`
- `status TEXT NOT NULL`
- `supersedes_correction_id BIGINT NULL`
- `reviewed_by_account_id BIGINT NULL`
- `published_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Constraints/indexes:

- Index `(chain_id, created_at DESC)`
- Index `(supersedes_correction_id)` where not null

## dialogue_search_index

Purpose: safe search/reference over completed dialogue records and transcripts.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `campaign_id BIGINT NOT NULL`
- `character_id BIGINT NOT NULL`
- `source_type TEXT NOT NULL`
- `source_id BIGINT NOT NULL`
- `visibility_scope TEXT NOT NULL`
- `title TEXT NOT NULL`
- `summary TEXT NOT NULL`
- `search_text TEXT NOT NULL`
- `tags_json JSONB NOT NULL DEFAULT '[]'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- Unique `(source_type, source_id, visibility_scope)`
- Full text index on `search_text` if using PostgreSQL FTS.
- `(campaign_id, character_id, created_at DESC)`

Visibility:

- Player index contains player-safe text only.
- GM/dev search index may be separate rows or separate table/view.

## Build 6 Actual Persistence Usage

Build 6 did not add a new migration. It uses the Build 3 dialogue persistence tables from `db/init/033-stage-dialogue-focus-commit-persistence.sql`.

Tables actively written by Build 6:

- `dnd5e_dialogue_transcript`
- `dnd5e_dialogue_turn`
- `dnd5e_completed_dialogue_record`
- `dnd5e_dialogue_search_index`

Tables linked by Build 6 when records already exist:

- `dnd5e_dialogue_scene_state`
- `dnd5e_dialogue_clarifying_question_record`
- `dnd5e_dialogue_social_move_record`
- `dnd5e_dialogue_relationship_audit`

Visibility behavior:

- Player archive reads filter completed records and transcript turns to `visibility_scope = 'player'`.
- Player search indexes only player-facing text assembled from summaries, player transcript turns, visible topics, NPC identifiers, and safe output links.
- GM/dev transcript access is intentionally backend-only for this build through an explicit service method, not a public player route.
