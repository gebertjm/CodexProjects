import { query } from '../config/db.js';
import { ensureEnvironmentSchema } from './environmentSchema.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function intersects(left = [], right = []) {
  const rightSet = new Set(asArray(right));
  return asArray(left).some((value) => rightSet.has(value));
}

function allKnown(required = [], known = []) {
  const knownSet = new Set(asArray(known));
  return asArray(required).every((value) => knownSet.has(value));
}

function noneKnown(excluded = [], known = []) {
  const knownSet = new Set(asArray(known));
  return asArray(excluded).every((value) => !knownSet.has(value));
}

function matchesList(values, actual) {
  const list = asArray(values);
  return list.length === 0 || list.includes(actual);
}

function stableHash(value) {
  const text = String(value ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizeRow(row) {
  return {
    id: Number(row.id),
    flavor_id: String(row.id),
    flavor_key: row.flavor_key,
    slot: row.slot,
    text: row.text,
    tags: asArray(row.tags_json),
    valid_weather: asArray(row.valid_weather_json),
    valid_time_of_day: asArray(row.valid_time_of_day_json),
    valid_season: asArray(row.valid_season_json),
    valid_location_tags: asArray(row.valid_location_tags_json),
    valid_scene_tags: asArray(row.valid_scene_tags_json),
    valid_biome: asArray(row.valid_biome_json),
    valid_location_environment: asArray(row.valid_location_environment_json),
    tone_or_mood: asArray(row.tone_or_mood_json),
    priority: Number(row.priority ?? 0),
    weight: Number(row.weight ?? 1),
    reuse_cooldown: Number(row.reuse_cooldown ?? 0),
    exclusions: asArray(row.exclusions_json),
    requires_known_facts: asArray(row.requires_known_facts_json),
    excludes_known_facts: asArray(row.excludes_known_facts_json),
    requires_world_flags: asArray(row.requires_world_flags_json),
    excludes_world_flags: asArray(row.excludes_world_flags_json),
    max_once_per_scene: Boolean(row.max_once_per_scene),
    metadata: row.metadata_json ?? {},
  };
}

function filterFlavor(flavor, context) {
  const reasons = [];
  const { environment, locationTags, sceneTags, knownFacts, worldFlags } = context;

  if (!matchesList(flavor.valid_weather, environment.weather)) {
    return { ok: false, reason: 'weather_mismatch' };
  }
  reasons.push('weather_match_or_unrestricted');

  if (!matchesList(flavor.valid_time_of_day, environment.time_of_day)) {
    return { ok: false, reason: 'time_mismatch' };
  }
  reasons.push('time_match_or_unrestricted');

  if (!matchesList(flavor.valid_season, environment.season)) {
    return { ok: false, reason: 'season_mismatch' };
  }

  if (!matchesList(flavor.valid_location_environment, environment.location_environment)) {
    return { ok: false, reason: 'location_environment_mismatch' };
  }

  if (!matchesList(flavor.valid_biome, environment.terrain_or_biome)) {
    return { ok: false, reason: 'biome_mismatch' };
  }

  if (flavor.tone_or_mood.length > 0 && !flavor.tone_or_mood.includes(environment.mood_or_tone)) {
    return { ok: false, reason: 'mood_mismatch' };
  }

  if (flavor.valid_location_tags.length > 0 && !intersects(flavor.valid_location_tags, locationTags)) {
    return { ok: false, reason: 'location_tags_mismatch' };
  }

  if (flavor.valid_scene_tags.length > 0 && !intersects(flavor.valid_scene_tags, sceneTags)) {
    return { ok: false, reason: 'scene_tags_mismatch' };
  }

  if (!allKnown(flavor.requires_known_facts, knownFacts)) {
    return { ok: false, reason: 'missing_required_character_knowledge' };
  }

  if (!noneKnown(flavor.excludes_known_facts, knownFacts)) {
    return { ok: false, reason: 'excluded_character_knowledge_present' };
  }

  if (!allKnown(flavor.requires_world_flags, worldFlags)) {
    return { ok: false, reason: 'missing_required_world_flag' };
  }

  if (!noneKnown(flavor.excludes_world_flags, worldFlags)) {
    return { ok: false, reason: 'excluded_world_flag_present' };
  }

  return {
    ok: true,
    reason: reasons.join(','),
  };
}

async function loadRecentUsage({ worldInstanceId, slot, maxCooldown, sceneId, executor }) {
  if (maxCooldown <= 0) {
    return [];
  }

  const result = await executor.query(
    `
      SELECT flavor_key, scene_id
      FROM dnd5e_environment_flavor_usage
      WHERE world_instance_id = $1
        AND used_slot = $2
      ORDER BY used_at DESC, id DESC
      LIMIT $3
    `,
    [worldInstanceId, slot, maxCooldown]
  );

  return result.rows.map((row) => ({
    flavor_key: row.flavor_key,
    same_scene: sceneId !== null && row.scene_id !== null && Number(row.scene_id) === Number(sceneId),
  }));
}

function chooseFlavor(candidates, { mode, seed, slot }) {
  const sorted = [...candidates].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    if (left.weight !== right.weight) {
      return right.weight - left.weight;
    }

    return left.flavor_key.localeCompare(right.flavor_key);
  });

  if (sorted.length === 0) {
    return null;
  }

  if (mode === 'deterministic') {
    return sorted[0];
  }

  const total = sorted.reduce((sum, flavor) => sum + flavor.weight, 0);
  const random =
    mode === 'seeded'
      ? (stableHash(`${seed ?? 'seed'}:${slot}`) % 100000) / 100000
      : Math.random();
  let threshold = random * total;

  for (const flavor of sorted) {
    threshold -= flavor.weight;
    if (threshold <= 0) {
      return flavor;
    }
  }

  return sorted[sorted.length - 1];
}

export async function selectEnvironmentFlavorEntries(
  {
    environment,
    slots = [],
    locationTags = [],
    sceneTags = [],
    knownFacts = [],
    worldFlags = [],
    worldInstanceId,
    campaignId = null,
    characterId = null,
    sceneId = null,
    locationId = null,
    mode = process.env.NODE_ENV === 'test' ? 'deterministic' : 'weighted_random',
    seed = null,
    recordUsage = false,
  },
  executor = { query }
) {
  await ensureEnvironmentSchema();

  if (!worldInstanceId) {
    return {
      selections: [],
      debug: {
        reason: 'missing_world_instance_id',
      },
    };
  }

  const uniqueSlots = [...new Set(slots.filter(Boolean))];
  if (uniqueSlots.length === 0) {
    return { selections: [], debug: { reason: 'no_slots_requested' } };
  }

  const rows = await executor.query(
    `
      SELECT *
      FROM dnd5e_environment_flavor
      WHERE is_active = TRUE
        AND slot = ANY($1::text[])
      ORDER BY slot ASC, priority DESC, flavor_key ASC
    `,
    [uniqueSlots]
  );
  const flavors = rows.rows.map(normalizeRow);
  const selections = [];
  const debug = {
    slots: {},
    mode,
  };

  for (const slot of uniqueSlots) {
    const slotFlavors = flavors.filter((flavor) => flavor.slot === slot);
    const maxCooldown = Math.max(0, ...slotFlavors.map((flavor) => flavor.reuse_cooldown));
    const recentUsage = await loadRecentUsage({
      worldInstanceId,
      slot,
      maxCooldown,
      sceneId,
      executor,
    });
    const recentKeys = new Set(recentUsage.map((usage) => usage.flavor_key));
    const sameSceneKeys = new Set(
      recentUsage.filter((usage) => usage.same_scene).map((usage) => usage.flavor_key)
    );
    const filtered = [];
    const rejected = [];

    for (const flavor of slotFlavors) {
      const contextResult = filterFlavor(flavor, {
        environment,
        locationTags,
        sceneTags,
        knownFacts,
        worldFlags,
      });

      if (!contextResult.ok) {
        rejected.push({ flavor_key: flavor.flavor_key, reason: contextResult.reason });
        continue;
      }

      if (flavor.max_once_per_scene && sameSceneKeys.has(flavor.flavor_key)) {
        rejected.push({ flavor_key: flavor.flavor_key, reason: 'max_once_per_scene_used' });
        continue;
      }

      if (flavor.reuse_cooldown > 0 && recentKeys.has(flavor.flavor_key)) {
        rejected.push({ flavor_key: flavor.flavor_key, reason: 'reuse_cooldown' });
        continue;
      }

      filtered.push({
        ...flavor,
        selection_reason: contextResult.reason,
      });
    }

    const candidates = filtered.length > 0
      ? filtered
      : slotFlavors
          .map((flavor) => {
            const contextResult = filterFlavor(flavor, {
              environment,
              locationTags,
              sceneTags,
              knownFacts,
              worldFlags,
            });
            return contextResult.ok ? { ...flavor, selection_reason: 'cooldown_fallback' } : null;
          })
          .filter(Boolean);
    const selected = chooseFlavor(candidates, { mode, seed, slot });

    debug.slots[slot] = {
      candidate_count: candidates.length,
      rejected,
      selected_flavor_key: selected?.flavor_key ?? null,
    };

    if (!selected) {
      continue;
    }

    selections.push({
      slot,
      flavor_id: selected.flavor_id,
      flavor_key: selected.flavor_key,
      text: selected.text,
      tags: selected.tags,
      reason: selected.selection_reason,
    });

    if (recordUsage) {
      await recordEnvironmentFlavorUsage(
        {
          flavorId: selected.id,
          flavorKey: selected.flavor_key,
          worldInstanceId,
          campaignId,
          characterId,
          sceneId,
          locationId,
          slot,
          metadata: {
            mode,
            reason: selected.selection_reason,
          },
        },
        executor
      );
    }
  }

  return {
    selections,
    debug,
  };
}

export async function recordEnvironmentFlavorUsage(
  {
    flavorId,
    flavorKey,
    worldInstanceId,
    campaignId = null,
    characterId = null,
    sceneId = null,
    locationId = null,
    slot,
    metadata = {},
  },
  executor = { query }
) {
  await ensureEnvironmentSchema();

  const result = await executor.query(
    `
      INSERT INTO dnd5e_environment_flavor_usage (
        flavor_id,
        flavor_key,
        world_instance_id,
        campaign_id,
        character_id,
        scene_id,
        location_id,
        used_slot,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *
    `,
    [
      flavorId,
      flavorKey,
      worldInstanceId,
      campaignId,
      characterId,
      sceneId,
      locationId,
      slot,
      JSON.stringify(metadata ?? {}),
    ]
  );

  return result.rows[0];
}
