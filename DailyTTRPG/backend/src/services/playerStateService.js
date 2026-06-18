import { query, withTransaction } from '../config/db.js';

let webAuthSchemaReady = false;

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function displayNameFromFirebase(firebaseUser) {
  return (
    normalizeOptionalString(firebaseUser.name) ??
    normalizeOptionalString(firebaseUser.email)?.split('@')[0] ??
    'DailyTTRPG Player'
  );
}

function mapAccount(row) {
  if (!row) {
    return null;
  }

  return {
    account_id: String(row.id),
    firebase_uid: row.firebase_uid,
    email: row.email,
    display_name: row.display_name,
    photo_url: row.photo_url,
    sms_enabled: Boolean(row.sms_enabled),
    sms_mode: row.sms_mode ?? 'disabled',
    capabilities: {
      can_advance_beats: row.can_advance_beats === true,
    },
    active_character_id: row.active_character_id ? String(row.active_character_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
    last_seen_at: row.last_seen_at,
  };
}

function mapCharacter(row) {
  if (!row) {
    return null;
  }

  return {
    character_id: String(row.id),
    name: row.name,
    level: Number(row.level ?? 1),
    class: row.class_name,
    species: row.race_name,
    race: row.race_name,
    status: row.status ?? (row.is_active ? 'active' : 'retired'),
    is_active: Boolean(row.is_active),
    is_current_active: Boolean(row.is_current_active),
    created_at: row.created_at,
  };
}

function mapCampaign(row) {
  if (!row) {
    return null;
  }

  const currentObjective = row.objective_id
    ? {
        objective_id: String(row.objective_id),
        key: row.objective_key,
        title: row.objective_title,
        status: row.objective_status,
      }
    : null;

  return {
    campaign_instance_id: String(row.campaign_id),
    membership_id: String(row.membership_id),
    world_id: row.world_id ? String(row.world_id) : null,
    world_name: row.world_name,
    world_slug: row.world_slug,
    campaign_name: row.campaign_name,
    campaign_slug: row.campaign_slug,
    campaign_type: row.campaign_type,
    campaign_status: row.campaign_status,
    current_location: row.location_id
      ? {
          location_id: String(row.location_id),
          key: row.location_key,
          name: row.location_name,
        }
      : null,
    current_scene: row.scene_id
      ? {
          scene_id: String(row.scene_id),
          key: row.scene_key,
          name: row.scene_name,
          summary: row.scene_summary,
        }
      : null,
    current_objective: currentObjective,
    action_required: row.membership_status === 'active' && row.scene_id !== null,
    active_action_window_status: null,
  };
}

export async function ensureWebAuthSchema() {
  if (webAuthSchemaReady) {
    return;
  }

  await query(`
    ALTER TABLE account
      ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(160),
      ADD COLUMN IF NOT EXISTS photo_url TEXT,
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS onboarding_state VARCHAR(80) NOT NULL DEFAULT 'awaiting_start',
      ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS sms_mode VARCHAR(40) NOT NULL DEFAULT 'disabled',
      ADD COLUMN IF NOT EXISTS can_advance_beats BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_firebase_uid_unique
      ON account(firebase_uid)
      WHERE firebase_uid IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_account_last_seen_at
      ON account(last_seen_at);

    ALTER TABLE account
      DROP CONSTRAINT IF EXISTS account_sms_mode_check;

    ALTER TABLE account
      ADD CONSTRAINT account_sms_mode_check CHECK (
        sms_mode IN ('disabled', 'alerts_only', 'fallback_input', 'full')
      );

    ALTER TABLE account
      DROP CONSTRAINT IF EXISTS account_onboarding_state_check;

    ALTER TABLE account
      ADD CONSTRAINT account_onboarding_state_check CHECK (
        onboarding_state IN (
          'unknown_phone',
          'awaiting_start',
          'onboarding_intro',
          'creating_character',
          'character_created',
          'assigning_campaign',
          'campaign_ready',
          'intro_started',
          'active_play'
        )
      );

    ALTER TABLE account
      DROP CONSTRAINT IF EXISTS account_contact_check;

    ALTER TABLE account
      ADD CONSTRAINT account_contact_check CHECK (
        email IS NOT NULL OR phone_number IS NOT NULL OR firebase_uid IS NOT NULL
      );
  `);

  webAuthSchemaReady = true;
}

async function selectAccountByFirebaseUid(firebaseUid, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        id,
        firebase_uid,
        email,
        display_name,
        photo_url,
        active_character_id,
        sms_enabled,
        sms_mode,
        can_advance_beats,
        created_at,
        updated_at,
        last_login_at,
        last_seen_at
      FROM account
      WHERE firebase_uid = $1
    `,
    [firebaseUid]
  );

  return result.rows[0] ?? null;
}

async function upsertFirebaseAccount(firebaseUser) {
  await ensureWebAuthSchema();

  return withTransaction(async (client) => {
    const firebaseUid = String(firebaseUser.uid);
    const existing = await selectAccountByFirebaseUid(firebaseUid, client);

    if (existing) {
      const updated = await client.query(
        `
          UPDATE account
          SET
            email = COALESCE($2, email),
            display_name = COALESCE($3, display_name),
            photo_url = COALESCE($4, photo_url),
            sms_enabled = FALSE,
            sms_mode = 'disabled',
            last_login_at = NOW(),
            last_seen_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            firebase_uid,
            email,
            display_name,
            photo_url,
            active_character_id,
            sms_enabled,
            sms_mode,
            can_advance_beats,
            created_at,
            updated_at,
            last_login_at,
            last_seen_at
        `,
        [
          existing.id,
          normalizeOptionalString(firebaseUser.email)?.toLowerCase(),
          displayNameFromFirebase(firebaseUser),
          normalizeOptionalString(firebaseUser.picture),
        ]
      );
      return updated.rows[0];
    }

    const inserted = await client.query(
      `
        INSERT INTO account (
          firebase_uid,
          email,
          display_name,
          photo_url,
          preferred_channel,
          sms_enabled,
          sms_mode,
          onboarding_state,
          last_login_at,
          last_seen_at
        )
        VALUES ($1, $2, $3, $4, 'email', FALSE, 'disabled', 'active_play', NOW(), NOW())
        ON CONFLICT (firebase_uid)
          WHERE firebase_uid IS NOT NULL
        DO UPDATE SET
          email = COALESCE(EXCLUDED.email, account.email),
          display_name = COALESCE(EXCLUDED.display_name, account.display_name),
          photo_url = COALESCE(EXCLUDED.photo_url, account.photo_url),
          sms_enabled = FALSE,
          sms_mode = 'disabled',
          last_login_at = NOW(),
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING
          id,
          firebase_uid,
          email,
          display_name,
          photo_url,
          active_character_id,
          sms_enabled,
          sms_mode,
          can_advance_beats,
          created_at,
          updated_at,
          last_login_at,
          last_seen_at
      `,
      [
        firebaseUid,
        normalizeOptionalString(firebaseUser.email)?.toLowerCase(),
        displayNameFromFirebase(firebaseUser),
        normalizeOptionalString(firebaseUser.picture),
      ]
    );

    return inserted.rows[0];
  });
}

async function listCharacters(accountId) {
  const result = await query(
    `
      SELECT
        character.id,
        character.name,
        character.level,
        character.status,
        character.is_active,
        character.created_at,
        race.name AS race_name,
        class.name AS class_name,
        account.active_character_id = character.id AS is_current_active
      FROM dnd5e_character character
      JOIN account ON account.id = character.account_id
      LEFT JOIN dnd5e_race race ON race.id = character.race_id
      LEFT JOIN dnd5e_class class ON class.id = character.class_id
      WHERE character.account_id = $1
      ORDER BY
        account.active_character_id = character.id DESC,
        character.created_at DESC,
        character.id DESC
    `,
    [accountId]
  );

  return result.rows.map(mapCharacter);
}

async function getCurrentCampaign(characterId) {
  if (!numericId(characterId)) {
    return null;
  }

  const result = await query(
    `
      SELECT
        membership.id AS membership_id,
        membership.campaign_id,
        membership.membership_status,
        membership.current_scene_id AS scene_id,
        campaign.world_id,
        campaign.name AS campaign_name,
        campaign.slug AS campaign_slug,
        campaign.campaign_type,
        campaign.status AS campaign_status,
        world.name AS world_name,
        world.slug AS world_slug,
        scene.key AS scene_key,
        scene.name AS scene_name,
        scene.summary AS scene_summary,
        location.id AS location_id,
        location.key AS location_key,
        location.name AS location_name,
        active_objective.objective_id,
        active_objective.objective_key,
        active_objective.objective_title,
        active_objective.status AS objective_status
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      JOIN dnd5e_world world ON world.id = campaign.world_id
      LEFT JOIN dnd5e_scene scene ON scene.id = membership.current_scene_id
      LEFT JOIN dnd5e_location location ON location.id = scene.location_id
      LEFT JOIN LATERAL (
        SELECT
          objective_state.status,
          objective.id AS objective_id,
          objective.key AS objective_key,
          objective.title AS objective_title
        FROM dnd5e_character_objective objective_state
        JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
        JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
        WHERE quest_state.campaign_id = membership.campaign_id
          AND quest_state.character_id = membership.character_id
          AND objective_state.status = 'active'
        ORDER BY objective.sort_order ASC, objective.id ASC
        LIMIT 1
      ) active_objective ON TRUE
      WHERE membership.character_id = $1
        AND membership.is_active = TRUE
        AND membership.membership_status = 'active'
      ORDER BY
        membership.is_active_context DESC,
        membership.is_default_solo_campaign DESC,
        membership.joined_at DESC NULLS LAST,
        membership.id DESC
      LIMIT 1
    `,
    [characterId]
  );

  return mapCampaign(result.rows[0] ?? null);
}

export async function getOrCreatePlayerState(firebaseUser) {
  await ensureWebAuthSchema();

  const accountRow = await upsertFirebaseAccount(firebaseUser);
  const characters = await listCharacters(accountRow.id);
  const activeCharacter =
    characters.find((character) => character.character_id === String(accountRow.active_character_id)) ??
    characters.find((character) => character.is_current_active) ??
    null;
  const currentCampaign = activeCharacter
    ? await getCurrentCampaign(activeCharacter.character_id)
    : null;

  return {
    account: mapAccount(accountRow),
    active_character: activeCharacter,
    characters,
    current_campaign: currentCampaign,
    action_required: Boolean(currentCampaign?.action_required),
  };
}

export async function getPlayerStateForAccount(accountId) {
  await ensureWebAuthSchema();

  const result = await query(
    `
      SELECT
        id,
        firebase_uid,
        email,
        display_name,
        photo_url,
        active_character_id,
        sms_enabled,
        sms_mode,
        can_advance_beats,
        created_at,
        updated_at,
        last_login_at,
        last_seen_at
      FROM account
      WHERE id = $1
    `,
    [accountId]
  );
  const accountRow = result.rows[0];

  if (!accountRow) {
    return null;
  }

  const characters = await listCharacters(accountId);
  const activeCharacter =
    characters.find((character) => character.character_id === String(accountRow.active_character_id)) ??
    characters.find((character) => character.is_current_active) ??
    null;
  const currentCampaign = activeCharacter
    ? await getCurrentCampaign(activeCharacter.character_id)
    : null;

  return {
    account: mapAccount(accountRow),
    active_character: activeCharacter,
    characters,
    current_campaign: currentCampaign,
    action_required: Boolean(currentCampaign?.action_required),
  };
}
