import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { ensureLivingWorldSchema } from './livingWorldSchema.js';

function json(value) {
  return JSON.stringify(value ?? {});
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeStateJson(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mapWorldInstance(row) {
  if (!row) {
    return null;
  }

  return {
    world_instance_id: String(row.id),
    id: Number(row.id),
    world_id: String(row.world_id),
    instance_key: row.instance_key,
    content_package_id: row.content_package_id,
    content_package_version: row.content_package_version,
    status: row.status,
    metadata: row.metadata_json ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getWorldSlug(executor, worldId) {
  const result = await executor.query('SELECT slug FROM dnd5e_world WHERE id = $1', [worldId]);
  return result.rows[0]?.slug ?? `world-${worldId}`;
}

export async function getOrCreateDefaultWorldInstance(worldId, executor = { query }) {
  await ensureLivingWorldSchema();

  const numericWorldId = asNumber(worldId);
  if (!numericWorldId) {
    throw createHttpError('worldId must be a positive integer', 400);
  }

  const slug = await getWorldSlug(executor, numericWorldId);
  const instanceKey = `${slug}-shared-default`;
  const result = await executor.query(
    `
      INSERT INTO dnd5e_world_instance (
        world_id,
        instance_key,
        content_package_id,
        content_package_version,
        status,
        metadata_json
      )
      VALUES ($1, $2, $3, '1.0.0', 'active', $4::jsonb)
      ON CONFLICT (world_id, instance_key) DO UPDATE
      SET updated_at = NOW()
      RETURNING *
    `,
    [
      numericWorldId,
      instanceKey,
      slug,
      JSON.stringify({ created_by: 'world_state_service', scope: 'shared_world_default' }),
    ]
  );

  return mapWorldInstance(result.rows[0]);
}

export async function getCampaignWorldInstance(campaignId, executor = { query }) {
  await ensureLivingWorldSchema();

  const numericCampaignId = asNumber(campaignId);
  if (!numericCampaignId) {
    throw createHttpError('campaignId must be a positive integer', 400);
  }

  const campaignResult = await executor.query(
    `
      SELECT campaign.id, campaign.world_id, campaign.world_instance_id
      FROM dnd5e_campaign campaign
      WHERE campaign.id = $1
    `,
    [numericCampaignId]
  );
  const campaign = campaignResult.rows[0];

  if (!campaign) {
    throw createHttpError('Campaign not found', 404);
  }

  if (campaign.world_instance_id) {
    const result = await executor.query('SELECT * FROM dnd5e_world_instance WHERE id = $1', [
      campaign.world_instance_id,
    ]);
    return mapWorldInstance(result.rows[0]);
  }

  const instance = await getOrCreateDefaultWorldInstance(campaign.world_id, executor);
  await executor.query('UPDATE dnd5e_campaign SET world_instance_id = $2 WHERE id = $1', [
    numericCampaignId,
    instance.id,
  ]);
  return instance;
}

export async function getWorldInstance(worldInstanceId, executor = { query }) {
  await ensureLivingWorldSchema();
  const result = await executor.query('SELECT * FROM dnd5e_world_instance WHERE id = $1', [
    worldInstanceId,
  ]);
  return mapWorldInstance(result.rows[0]);
}

export async function getSceneState({ worldInstanceId, campaignId = null, sceneId }, executor = { query }) {
  await ensureLivingWorldSchema();
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_world_scene_state
      WHERE world_instance_id = $1
        AND scene_id = $2
        AND (
          ($3::bigint IS NULL AND campaign_id IS NULL)
          OR campaign_id = $3
        )
      LIMIT 1
    `,
    [worldInstanceId, sceneId, campaignId]
  );

  return result.rows[0] ?? null;
}

export async function setSceneState(
  { worldInstanceId, campaignId = null, sceneId, patch = {} },
  executor = { query }
) {
  await ensureLivingWorldSchema();
  const current = await getSceneState({ worldInstanceId, campaignId, sceneId }, executor);
  const merged = {
    ...normalizeStateJson(current?.state_json),
    ...normalizeStateJson(patch),
  };

  if (current) {
    const result = await executor.query(
      `
        UPDATE dnd5e_world_scene_state
        SET state_json = $2::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [current.id, json(merged)]
    );
    return result.rows[0];
  }

  const result = await executor.query(
    `
      INSERT INTO dnd5e_world_scene_state (
        world_instance_id,
        campaign_id,
        scene_id,
        state_json
      )
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING *
    `,
    [worldInstanceId, campaignId, sceneId, json(merged)]
  );
  return result.rows[0];
}

export async function getLocationState({ worldInstanceId, locationId }, executor = { query }) {
  await ensureLivingWorldSchema();
  const result = await executor.query(
    'SELECT * FROM dnd5e_world_location_state WHERE world_instance_id = $1 AND location_id = $2',
    [worldInstanceId, locationId]
  );
  return result.rows[0] ?? null;
}

export async function setLocationState({ worldInstanceId, locationId, patch = {} }, executor = { query }) {
  await ensureLivingWorldSchema();
  const current = await getLocationState({ worldInstanceId, locationId }, executor);
  const merged = {
    ...normalizeStateJson(current?.state_json),
    ...normalizeStateJson(patch),
  };

  if (current) {
    const result = await executor.query(
      `
        UPDATE dnd5e_world_location_state
        SET state_json = $2::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [current.id, json(merged)]
    );
    return result.rows[0];
  }

  const result = await executor.query(
    `
      INSERT INTO dnd5e_world_location_state (world_instance_id, location_id, state_json)
      VALUES ($1, $2, $3::jsonb)
      RETURNING *
    `,
    [worldInstanceId, locationId, json(merged)]
  );
  return result.rows[0];
}

export async function getEntityState({ worldInstanceId, entityKey }, executor = { query }) {
  await ensureLivingWorldSchema();
  const result = await executor.query(
    'SELECT * FROM dnd5e_world_entity_state WHERE world_instance_id = $1 AND entity_key = $2',
    [worldInstanceId, entityKey]
  );
  return result.rows[0] ?? null;
}

export async function setEntityState(
  {
    worldInstanceId,
    entityKey,
    entityType = 'npc',
    worldEntityId = null,
    locationId = null,
    status = 'active',
    patch = {},
  },
  executor = { query }
) {
  await ensureLivingWorldSchema();
  const current = await getEntityState({ worldInstanceId, entityKey }, executor);
  const merged = {
    ...normalizeStateJson(current?.state_json),
    ...normalizeStateJson(patch),
  };

  if (current) {
    const result = await executor.query(
      `
        UPDATE dnd5e_world_entity_state
        SET
          world_entity_id = COALESCE($2, world_entity_id),
          entity_type = COALESCE($3, entity_type),
          location_id = COALESCE($4, location_id),
          status = COALESCE($5, status),
          state_json = $6::jsonb,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [current.id, worldEntityId, entityType, locationId, status, json(merged)]
    );
    return result.rows[0];
  }

  const result = await executor.query(
    `
      INSERT INTO dnd5e_world_entity_state (
        world_instance_id,
        world_entity_id,
        entity_key,
        entity_type,
        location_id,
        state_json,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING *
    `,
    [worldInstanceId, worldEntityId, entityKey, entityType, locationId, json(merged), status]
  );
  return result.rows[0];
}

export async function getAffordanceState(
  { worldInstanceId, campaignId = null, sceneId, affordanceKey, actionKey = null },
  executor = { query }
) {
  await ensureLivingWorldSchema();
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_world_scene_affordance_state
      WHERE world_instance_id = $1
        AND scene_id = $2
        AND affordance_key = $3
        AND COALESCE(action_key, '') = COALESCE($4::text, '')
        AND (
          ($5::bigint IS NULL AND campaign_id IS NULL)
          OR campaign_id = $5
        )
      LIMIT 1
    `,
    [worldInstanceId, sceneId, affordanceKey, actionKey, campaignId]
  );
  return result.rows[0] ?? null;
}

export async function setAffordanceState(
  {
    worldInstanceId,
    campaignId = null,
    sceneId,
    affordanceKey,
    actionKey = null,
    state = 'available',
    characterId = null,
    sourceEventId = null,
    patch = {},
    incrementTimesUsed = false,
  },
  executor = { query }
) {
  await ensureLivingWorldSchema();
  const current = await getAffordanceState(
    { worldInstanceId, campaignId, sceneId, affordanceKey, actionKey },
    executor
  );
  const merged = {
    ...normalizeStateJson(current?.state_json),
    ...normalizeStateJson(patch),
  };

  if (current) {
    const result = await executor.query(
      `
        UPDATE dnd5e_world_scene_affordance_state
        SET
          state = $2::varchar,
          times_used = times_used + $3,
          last_used_at = CASE WHEN $3 > 0 THEN NOW() ELSE last_used_at END,
          resolved_by_character_id = COALESCE($4, resolved_by_character_id),
          revealed_at = CASE WHEN $2::text = 'available' AND revealed_at IS NULL THEN NOW() ELSE revealed_at END,
          source_event_id = COALESCE($5, source_event_id),
          state_json = $6::jsonb,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        current.id,
        state,
        incrementTimesUsed ? 1 : 0,
        characterId,
        sourceEventId,
        json(merged),
      ]
    );
    return result.rows[0];
  }

  const result = await executor.query(
    `
      INSERT INTO dnd5e_world_scene_affordance_state (
        world_instance_id,
        campaign_id,
        scene_id,
        affordance_key,
        action_key,
        state,
        times_used,
        last_used_at,
        resolved_by_character_id,
        revealed_at,
        source_event_id,
        state_json
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::varchar,
        $7,
        CASE WHEN $7 > 0 THEN NOW() ELSE NULL END,
        $8,
        CASE WHEN $6::text = 'available' THEN NOW() ELSE NULL END,
        $9,
        $10::jsonb
      )
      RETURNING *
    `,
    [
      worldInstanceId,
      campaignId,
      sceneId,
      affordanceKey,
      actionKey,
      state,
      incrementTimesUsed ? 1 : 0,
      characterId,
      sourceEventId,
      json(merged),
    ]
  );
  return result.rows[0];
}

export async function listAvailableAffordances(
  { worldInstanceId, campaignId = null, sceneId, includeResolved = false },
  executor = { query }
) {
  await ensureLivingWorldSchema();
  const result = await executor.query(
    `
      SELECT
        affordance.id,
        affordance.affordance_key,
        affordance.label,
        affordance.aliases_json,
        affordance.tags_json,
        affordance.metadata_json,
        affordance.initial_state,
        state.state AS runtime_state,
        state.times_used,
        state.last_used_at,
        COALESCE(
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'verb', action.verb,
              'action_key', action.action_key,
              'repeat_policy', action.repeat_policy,
              'interaction_id', action.interaction_id,
              'transition_id', action.transition_id
            )
          ) FILTER (WHERE action.id IS NOT NULL),
          '[]'::jsonb
        ) AS actions_json
      FROM dnd5e_scene_affordance affordance
      LEFT JOIN dnd5e_world_scene_affordance_state state
        ON state.world_instance_id = $1
       AND state.scene_id = affordance.scene_id
       AND state.affordance_key = affordance.affordance_key
       AND state.action_key IS NULL
       AND (
          ($3::bigint IS NULL AND state.campaign_id IS NULL)
          OR state.campaign_id = $3
       )
      LEFT JOIN dnd5e_scene_affordance_action action ON action.affordance_id = affordance.id
      WHERE affordance.scene_id = $2
        AND affordance.is_active = TRUE
      GROUP BY affordance.id, state.id
      ORDER BY affordance.id ASC
    `,
    [worldInstanceId, sceneId, campaignId]
  );

  return result.rows
    .map((row) => {
      const state = row.runtime_state ?? row.initial_state ?? 'available';
      return {
        affordance_id: row.affordance_key,
        affordance_key: row.affordance_key,
        label: row.label,
        aliases: row.aliases_json ?? [],
        tags: row.tags_json ?? [],
        actions: (row.actions_json ?? []).map((action) => action.verb),
        available_actions: row.actions_json ?? [],
        state,
        times_used: Number(row.times_used ?? 0),
        metadata: row.metadata_json ?? {},
        narration: row.metadata_json?.narration ?? null,
        priority: row.metadata_json?.priority ?? null,
      };
    })
    .filter((affordance) => {
      if (includeResolved) {
        return affordance.state !== 'hidden' && affordance.state !== 'locked';
      }

      return affordance.state === 'available';
    });
}
