import { query } from '../config/db.js';
import { listKnowledgeForCharacter } from './characterKnowledgeService.js';
import { buildEnvironmentMechanicalDetails } from './environmentModifierService.js';
import { selectEnvironmentFlavorEntries } from './environmentFlavorSelector.js';
import { getEffectiveEnvironment } from './environmentStateService.js';

const DEFAULT_DESCRIPTION_SLOTS = [
  'weather_overlay',
  'time_overlay',
  'season_overlay',
  'light_overlay',
  'location_mood',
  'state_change_overlay',
  'character_knowledge_overlay',
];

function firstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim() !== '')?.trim() ?? null;
}

function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniqueTags(values = []) {
  return [...new Set(values.map(normalizeTag).filter(Boolean))];
}

function sentenceKey(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function joinDescriptionParts(parts) {
  const seen = new Set();
  const unique = [];

  for (const part of parts) {
    const text = String(part ?? '').trim();
    if (!text) {
      continue;
    }

    const key = sentenceKey(text);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(text);
  }

  return unique.join(' ');
}

async function loadSceneAndLocation(sceneId, executor) {
  if (!sceneId) {
    return { scene: null, location: null };
  }

  const result = await executor.query(
    `
      SELECT
        scene.id AS scene_id,
        scene.key AS scene_key,
        scene.name AS scene_name,
        scene.summary AS scene_summary,
        scene.description AS scene_description,
        scene.entry_text AS scene_entry_text,
        location.id AS location_id,
        location.key AS location_key,
        location.name AS location_name,
        location.description AS location_description,
        region.id AS region_id,
        region.key AS region_key,
        region.name AS region_name
      FROM dnd5e_scene scene
      LEFT JOIN dnd5e_location location ON location.id = scene.location_id
      LEFT JOIN dnd5e_region region ON region.id = location.region_id
      WHERE scene.id = $1
      LIMIT 1
    `,
    [sceneId]
  );
  const row = result.rows[0];

  if (!row) {
    return { scene: null, location: null, region: null };
  }

  return {
    scene: {
      id: Number(row.scene_id),
      key: row.scene_key,
      name: row.scene_name,
      summary: row.scene_summary,
      description: row.scene_description,
      entry_text: row.scene_entry_text,
    },
    location: row.location_id
      ? {
          id: Number(row.location_id),
          key: row.location_key,
          name: row.location_name,
          description: row.location_description,
        }
      : null,
    region: row.region_id
      ? {
          id: Number(row.region_id),
          key: row.region_key,
          name: row.region_name,
        }
      : null,
  };
}

export async function assembleEnvironmentDescription(
  {
    worldInstanceId,
    campaignId = null,
    characterId = null,
    scene,
    sceneState = null,
    knownFacts = null,
    slots = DEFAULT_DESCRIPTION_SLOTS,
    selectionMode = process.env.NODE_ENV === 'test' ? 'deterministic' : 'weighted_random',
    seed = null,
    recordUsage = true,
    includeMechanics = false,
    includeDebug = false,
  },
  executor = { query }
) {
  const loaded = await loadSceneAndLocation(scene?.id, executor);
  const effectiveEnvironment = await getEffectiveEnvironment(
    {
      worldInstanceId,
      locationId: loaded.location?.id ?? scene?.location?.id ?? null,
      sceneId: scene?.id ?? null,
      regionId: loaded.region?.id ?? null,
    },
    executor
  );
  const facts = knownFacts ??
    (characterId
      ? await listKnowledgeForCharacter({ characterId, worldInstanceId }, executor)
      : []);
  const knownFactIds = facts.map((fact) => fact.knowledge_id);
  const sceneTags = uniqueTags([
    loaded.scene?.key,
    loaded.scene?.name,
    ...(sceneState?.state_json?.tags ?? []),
    effectiveEnvironment.context.location_environment,
    effectiveEnvironment.context.mood_or_tone,
  ]);
  const locationTags = uniqueTags([
    loaded.location?.key,
    loaded.location?.name,
    loaded.region?.key,
    loaded.region?.name,
    effectiveEnvironment.context.location_environment,
    effectiveEnvironment.context.terrain_or_biome,
    effectiveEnvironment.context.mood_or_tone,
  ]);
  const flavorResult = await selectEnvironmentFlavorEntries(
    {
      environment: effectiveEnvironment.context,
      slots,
      locationTags,
      sceneTags,
      knownFacts: knownFactIds,
      worldFlags: sceneState?.state_json?.world_flags ?? [],
      worldInstanceId,
      campaignId,
      characterId,
      sceneId: scene?.id ?? null,
      locationId: loaded.location?.id ?? scene?.location?.id ?? null,
      mode: selectionMode,
      seed,
      recordUsage,
    },
    executor
  );

  const selectedBySlot = new Map(flavorResult.selections.map((entry) => [entry.slot, entry]));
  const baseDescription = firstText(
    scene?.entry_text,
    scene?.description,
    loaded.scene?.entry_text,
    loaded.scene?.description,
    loaded.scene?.summary,
    loaded.scene?.name
  );
  const orderedParts = [
    selectedBySlot.get('weather_overlay')?.text,
    selectedBySlot.get('time_overlay')?.text,
    selectedBySlot.get('season_overlay')?.text,
    selectedBySlot.get('light_overlay')?.text,
    baseDescription,
    selectedBySlot.get('location_mood')?.text,
    selectedBySlot.get('state_change_overlay')?.text,
    selectedBySlot.get('character_knowledge_overlay')?.text,
  ];
  const description = joinDescriptionParts(orderedParts);
  const mechanicalDetails = includeMechanics
    ? await buildEnvironmentMechanicalDetails({ environment: effectiveEnvironment.context }, executor)
    : undefined;
  const components = [
    ...flavorResult.selections.map((entry) => ({
      slot: entry.slot,
      flavor_id: entry.flavor_id,
      flavor_key: entry.flavor_key,
      source: 'environment_flavor',
      reason: entry.reason,
    })),
    {
      slot: 'scene_base',
      source: 'scene.description',
      flavor_key: null,
    },
  ];

  return {
    description: description || baseDescription || '',
    environment: effectiveEnvironment.context,
    source_breakdown: effectiveEnvironment.source_breakdown,
    mechanical_details: mechanicalDetails,
    components: includeDebug ? components : undefined,
    debug: includeDebug
      ? {
          flavor_selection: flavorResult.debug,
          location_tags: locationTags,
          scene_tags: sceneTags,
          selected_flavor_keys: flavorResult.selections.map((entry) => entry.flavor_key),
        }
      : undefined,
  };
}
