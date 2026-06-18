import { query, withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import {
  DEFAULT_ENVIRONMENT_CONTEXT,
  ENVIRONMENT_FIELDS,
  nextTimeOfDay,
  normalizeEnvironmentContext,
} from './environmentContext.js';
import { ensureEnvironmentSchema } from './environmentSchema.js';

function json(value) {
  return JSON.stringify(value ?? {});
}

function normalizeScopeId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

function stateFields(row) {
  if (!row) {
    return {};
  }

  return Object.fromEntries(
    [...ENVIRONMENT_FIELDS, 'day_count']
      .filter((field) => row[field] !== undefined && row[field] !== null)
      .map((field) => [field, field === 'day_count' ? Number(row[field]) : row[field]])
  );
}

function mergeStateRows(rows) {
  const context = { ...DEFAULT_ENVIRONMENT_CONTEXT };
  const source_breakdown = {};

  for (const row of rows) {
    const values = stateFields(row);

    for (const [field, value] of Object.entries(values)) {
      context[field] = value;
      source_breakdown[field] = {
        scope_type: row.scope_type,
        scope_id: row.scope_id,
        source: row.source,
      };
    }
  }

  return { context, source_breakdown };
}

async function createEnvironmentEvent({
  worldInstanceId,
  campaignId = null,
  eventType,
  payload,
  createdByKind = 'system',
  createdByAccountId = null,
  executor,
}) {
  await executor.query(
    `
      INSERT INTO dnd5e_world_event (
        world_instance_id,
        campaign_id,
        event_type,
        event_payload_json,
        state_changes_json,
        knowledge_granted_json,
        created_by_kind,
        created_by_account_id,
        metadata_json
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, '[]'::jsonb, $6, $7, '{}'::jsonb)
    `,
    [
      worldInstanceId,
      campaignId,
      eventType,
      json(payload),
      json([{ target_type: 'environment', ...payload }]),
      createdByKind,
      createdByAccountId,
    ]
  );
}

export async function getEffectiveEnvironment(
  { worldInstanceId, locationId = null, sceneId = null, regionId = null },
  executor = { query }
) {
  await ensureEnvironmentSchema();

  if (!worldInstanceId) {
    throw createHttpError('worldInstanceId is required', 400);
  }

  const scopeFilters = [
    ['world', String(worldInstanceId)],
    regionId ? ['region', String(regionId)] : null,
    locationId ? ['location', String(locationId)] : null,
    sceneId ? ['scene', String(sceneId)] : null,
  ].filter(Boolean);

  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_environment_state
      WHERE world_instance_id = $1
        AND (scope_type, scope_id) IN (
          SELECT *
          FROM unnest($2::text[], $3::text[])
        )
      ORDER BY CASE scope_type
        WHEN 'world' THEN 1
        WHEN 'region' THEN 2
        WHEN 'location' THEN 3
        WHEN 'scene' THEN 4
        ELSE 5
      END ASC
    `,
    [
      worldInstanceId,
      scopeFilters.map((entry) => entry[0]),
      scopeFilters.map((entry) => entry[1]),
    ]
  );

  return {
    ...mergeStateRows(result.rows),
    rows: result.rows,
  };
}

export async function setEnvironmentOverride(
  {
    worldInstanceId,
    scopeType = 'world',
    scopeId = null,
    values = {},
    source = 'gm_override',
    reason = null,
    campaignId = null,
    createdByKind = 'system',
    createdByAccountId = null,
  },
  executor = { query }
) {
  await ensureEnvironmentSchema();

  const normalizedScopeId = normalizeScopeId(scopeId ?? (scopeType === 'world' ? worldInstanceId : null));
  if (!normalizedScopeId) {
    throw createHttpError('scopeId is required for environment override', 400);
  }

  const normalized = normalizeEnvironmentContext(values, { strict: true });
  if (!normalized.ok) {
    throw createHttpError(normalized.errors.join('; '), 400);
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        SELECT *
        FROM dnd5e_environment_state
        WHERE world_instance_id = $1
          AND scope_type = $2
          AND scope_id = $3
        LIMIT 1
      `,
      [worldInstanceId, scopeType, normalizedScopeId]
    );
    const current = existing.rows[0];
    const merged = {
      ...stateFields(current),
      ...normalized.context,
    };

    const result = await client.query(
      `
        INSERT INTO dnd5e_environment_state (
          world_instance_id,
          scope_type,
          scope_id,
          weather,
          time_of_day,
          season,
          light_level,
          temperature_band,
          precipitation,
          wind,
          visibility,
          terrain_or_biome,
          location_environment,
          mood_or_tone,
          day_count,
          state_json,
          source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)
        ON CONFLICT (world_instance_id, scope_type, scope_id) DO UPDATE
        SET
          weather = EXCLUDED.weather,
          time_of_day = EXCLUDED.time_of_day,
          season = EXCLUDED.season,
          light_level = EXCLUDED.light_level,
          temperature_band = EXCLUDED.temperature_band,
          precipitation = EXCLUDED.precipitation,
          wind = EXCLUDED.wind,
          visibility = EXCLUDED.visibility,
          terrain_or_biome = EXCLUDED.terrain_or_biome,
          location_environment = EXCLUDED.location_environment,
          mood_or_tone = EXCLUDED.mood_or_tone,
          day_count = EXCLUDED.day_count,
          state_json = EXCLUDED.state_json,
          source = EXCLUDED.source,
          updated_at = NOW()
        RETURNING *
      `,
      [
        worldInstanceId,
        scopeType,
        normalizedScopeId,
        merged.weather ?? null,
        merged.time_of_day ?? null,
        merged.season ?? null,
        merged.light_level ?? null,
        merged.temperature_band ?? null,
        merged.precipitation ?? null,
        merged.wind ?? null,
        merged.visibility ?? null,
        merged.terrain_or_biome ?? null,
        merged.location_environment ?? null,
        merged.mood_or_tone ?? null,
        merged.day_count ?? 0,
        json({ reason, values: normalized.context }),
        source,
      ]
    );

    await createEnvironmentEvent({
      worldInstanceId,
      campaignId,
      eventType: 'environment_override_set',
      payload: {
        scope_type: scopeType,
        scope_id: normalizedScopeId,
        values: normalized.context,
        reason,
      },
      createdByKind,
      createdByAccountId,
      executor: client,
    });

    return result.rows[0];
  });
}

export async function clearEnvironmentOverride(
  {
    worldInstanceId,
    scopeType = 'world',
    scopeId = null,
    reason = null,
    campaignId = null,
    createdByKind = 'system',
    createdByAccountId = null,
  },
  executor = { query }
) {
  await ensureEnvironmentSchema();
  const normalizedScopeId = normalizeScopeId(scopeId ?? (scopeType === 'world' ? worldInstanceId : null));

  if (!normalizedScopeId) {
    throw createHttpError('scopeId is required to clear environment override', 400);
  }

  return withTransaction(async (client) => {
    const result = await client.query(
      `
        DELETE FROM dnd5e_environment_state
        WHERE world_instance_id = $1
          AND scope_type = $2
          AND scope_id = $3
        RETURNING *
      `,
      [worldInstanceId, scopeType, normalizedScopeId]
    );

    await createEnvironmentEvent({
      worldInstanceId,
      campaignId,
      eventType: 'environment_override_cleared',
      payload: {
        scope_type: scopeType,
        scope_id: normalizedScopeId,
        reason,
        cleared: result.rowCount > 0,
      },
      createdByKind,
      createdByAccountId,
      executor: client,
    });

    return {
      cleared: result.rowCount > 0,
      previous: result.rows[0] ?? null,
    };
  });
}

export async function advanceTime(
  {
    worldInstanceId,
    amount = 1,
    campaignId = null,
    createdByKind = 'system',
    createdByAccountId = null,
  },
  executor = { query }
) {
  await ensureEnvironmentSchema();

  const effective = await getEffectiveEnvironment({ worldInstanceId }, executor);
  let next = {
    time_of_day: effective.context.time_of_day,
    wrapped: false,
  };
  let dayCount = Number(effective.context.day_count ?? 0);

  for (let index = 0; index < amount; index += 1) {
    next = nextTimeOfDay(next.time_of_day);
    if (next.wrapped) {
      dayCount += 1;
    }
  }

  const row = await setEnvironmentOverride(
    {
      worldInstanceId,
      scopeType: 'world',
      scopeId: worldInstanceId,
      values: {
        time_of_day: next.time_of_day,
        day_count: dayCount,
      },
      source: 'progression',
      reason: `Advanced time by ${amount} step(s).`,
      campaignId,
      createdByKind,
      createdByAccountId,
    },
    executor
  );

  await query(
    `
      INSERT INTO dnd5e_world_event (
        world_instance_id,
        campaign_id,
        event_type,
        event_payload_json,
        state_changes_json,
        knowledge_granted_json,
        created_by_kind,
        created_by_account_id,
        metadata_json
      )
      VALUES ($1, $2, 'time_advanced', $3::jsonb, $4::jsonb, '[]'::jsonb, $5, $6, '{}'::jsonb)
    `,
    [
      worldInstanceId,
      campaignId,
      json({ amount, time_of_day: next.time_of_day, day_count: dayCount }),
      json([{ target_type: 'environment', field: 'time_of_day', value: next.time_of_day }]),
      createdByKind,
      createdByAccountId,
    ]
  );

  return {
    time_of_day: next.time_of_day,
    day_count: dayCount,
    row,
  };
}

export async function maybeTransitionWeather(
  { worldInstanceId, transitionTable = null, seed = null, campaignId = null },
  executor = { query }
) {
  await ensureEnvironmentSchema();
  const effective = await getEffectiveEnvironment({ worldInstanceId }, executor);

  if (!transitionTable || typeof transitionTable !== 'object') {
    return {
      changed: false,
      weather: effective.context.weather,
      reason: 'no_transition_table',
    };
  }

  const options = transitionTable[effective.context.weather] ?? [];
  if (!Array.isArray(options) || options.length === 0) {
    return {
      changed: false,
      weather: effective.context.weather,
      reason: 'no_matching_transition',
    };
  }

  const index = seed === null ? 0 : Math.abs(Number(seed)) % options.length;
  const nextWeather = options[index]?.weather ?? options[index];

  if (!nextWeather || nextWeather === effective.context.weather) {
    return {
      changed: false,
      weather: effective.context.weather,
      reason: 'stable_transition',
    };
  }

  await setEnvironmentOverride(
    {
      worldInstanceId,
      scopeType: 'world',
      scopeId: worldInstanceId,
      values: { weather: nextWeather },
      source: 'progression',
      reason: 'Weather transition table advanced weather.',
      campaignId,
    },
    executor
  );

  await query(
    `
      INSERT INTO dnd5e_world_event (
        world_instance_id,
        campaign_id,
        event_type,
        event_payload_json,
        state_changes_json,
        knowledge_granted_json,
        metadata_json
      )
      VALUES ($1, $2, 'weather_changed', $3::jsonb, $4::jsonb, '[]'::jsonb, '{}'::jsonb)
    `,
    [
      worldInstanceId,
      campaignId,
      json({ from: effective.context.weather, to: nextWeather }),
      json([{ target_type: 'environment', field: 'weather', from: effective.context.weather, to: nextWeather }]),
    ]
  );

  return {
    changed: true,
    weather: nextWeather,
    previous_weather: effective.context.weather,
  };
}
