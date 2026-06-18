import { query } from '../config/db.js';
import { ensureEnvironmentSchema } from './environmentSchema.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function environmentKeys(environment = {}) {
  return new Set(
    [
      environment.weather,
      environment.visibility,
      environment.light_level,
      environment.time_of_day,
      environment.season,
      environment.temperature_band,
      environment.wind,
      environment.location_environment,
      environment.terrain_or_biome,
    ].filter(Boolean)
  );
}

function matchesCheck(row, { checkType = null, skill = null, context = null } = {}) {
  if (checkType && row.check_type !== checkType) {
    return false;
  }

  if (row.skill_slug && skill && row.skill_slug !== skill) {
    return false;
  }

  if (row.skill_slug && !skill) {
    return true;
  }

  if (row.context && context && row.context !== context) {
    return false;
  }

  return true;
}

export async function listEnvironmentModifiers(
  {
    environment,
    checkType = null,
    skill = null,
    context = null,
  },
  executor = { query }
) {
  await ensureEnvironmentSchema();

  const keys = [...environmentKeys(environment)];
  if (keys.length === 0) {
    return [];
  }

  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_environment_modifier
      WHERE is_active = TRUE
        AND environment_key = ANY($1::text[])
      ORDER BY environment_key ASC, check_type ASC, skill_slug ASC NULLS LAST, context ASC NULLS LAST, modifier_key ASC
    `,
    [keys]
  );

  return result.rows
    .filter((row) => matchesCheck(row, { checkType, skill, context }))
    .map((row) => ({
      modifier_id: String(row.id),
      modifier_key: row.modifier_key,
      environment_key: row.environment_key,
      check_type: row.check_type,
      skill: row.skill_slug,
      context: row.context,
      modifier: Number(row.modifier),
      reason: row.reason,
      narrative_hint: row.narrative_hint,
      conditions: row.conditions_json ?? {},
      metadata: row.metadata_json ?? {},
    }));
}

export async function buildEnvironmentMechanicalDetails({ environment }, executor = { query }) {
  const modifiers = await listEnvironmentModifiers({ environment }, executor);

  return {
    environment_modifiers: modifiers,
    summary: asArray(modifiers).map((modifier) => ({
      check_type: modifier.check_type,
      skill: modifier.skill,
      context: modifier.context,
      modifier: modifier.modifier,
      reason: modifier.reason,
    })),
  };
}
