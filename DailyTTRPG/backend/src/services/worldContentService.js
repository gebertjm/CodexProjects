import { query } from '../config/db.js';
import {
  selectCharacterCampaignsQuery,
  selectDefaultWorldQuery,
  selectLocationByIdQuery,
  selectLocationCampaignStatesQuery,
  selectLocationScenesQuery,
  selectSceneByIdQuery,
  selectSceneCampaignStatesQuery,
  selectSceneWorldEntitiesQuery,
  selectWorldByIdQuery,
  selectWorldCampaignsQuery,
  selectWorldEntitiesQuery,
  selectWorldRegionsQuery,
  selectWorldsQuery,
} from '../db/queries/worldContent.js';
import { createHttpError } from '../utils/httpError.js';

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapWorldRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
    theme_tags: row.theme_tags_json ?? [],
    status: row.status,
    counts: {
      campaigns: row.campaign_count !== undefined ? Number(row.campaign_count) : undefined,
      regions: row.region_count !== undefined ? Number(row.region_count) : undefined,
      locations: row.location_count !== undefined ? Number(row.location_count) : undefined,
      scenes: row.scene_count !== undefined ? Number(row.scene_count) : undefined,
      entities: row.entity_count !== undefined ? Number(row.entity_count) : undefined,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCampaignRow(row) {
  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    world: {
      id: Number(row.world_id),
      name: row.world_name,
      slug: row.world_slug,
    },
    name: row.name,
    slug: row.slug,
    campaign_type: row.campaign_type,
    status: row.status,
    description: row.description,
    created_by_account_id: numberOrNull(row.created_by_account_id),
    created_by:
      row.created_by_account_id !== null && row.created_by_account_id !== undefined
        ? {
            account_id: Number(row.created_by_account_id),
            display_name: row.created_by_display_name,
          }
        : null,
    is_active: row.is_active,
    member_count: row.member_count !== undefined ? Number(row.member_count) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCharacterCampaignRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    joined_by_account_id: numberOrNull(row.joined_by_account_id),
    joined_by:
      row.joined_by_account_id !== null && row.joined_by_account_id !== undefined
        ? {
            account_id: Number(row.joined_by_account_id),
            display_name: row.joined_by_display_name,
          }
        : null,
    is_active: row.is_active,
    membership_status: row.membership_status,
    is_active_context: row.is_active_context,
    is_default_solo_campaign: row.is_default_solo_campaign,
    joined_at: row.joined_at,
    left_at: row.left_at,
    current_scene:
      row.current_scene_id !== null
        ? {
            id: Number(row.current_scene_id),
            key: row.current_scene_key,
            name: row.current_scene_name,
            entered_at: row.current_scene_entered_at,
          }
        : null,
    character: {
      id: Number(row.character_id),
      name: row.character_name,
      is_active: row.character_is_active,
      world_id: Number(row.character_world_id),
    },
    campaign: {
      id: Number(row.campaign_id),
      name: row.campaign_name,
      slug: row.campaign_slug,
      campaign_type: row.campaign_type,
      status: row.campaign_status,
      is_active: row.campaign_is_active,
      world_id: Number(row.campaign_world_id),
    },
    world: {
      id: Number(row.campaign_world_id),
      name: row.world_name,
      slug: row.world_slug,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCampaignOverlayRow(row) {
  return {
    id: Number(row.id),
    campaign: {
      id: Number(row.campaign_id),
      name: row.campaign_name,
      slug: row.campaign_slug,
      campaign_type: row.campaign_type,
    },
    is_discovered: row.is_discovered,
    is_available: row.is_available,
    overlay: row.overlay_json ?? {},
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapWorldEntityRow(row) {
  const template =
    row.entity_type === 'npc'
      ? {
          id: numberOrNull(row.npc_template_id),
          key: row.npc_key,
          name: row.npc_name,
          npc_type: row.npc_type,
          role: row.npc_role,
        }
      : {
          id: numberOrNull(row.monster_template_id),
          key: row.monster_key,
          name: row.monster_name,
        };

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    entity_key: row.entity_key,
    entity_type: row.entity_type,
    template,
    placement: {
      region:
        row.current_region_id !== null
          ? {
              id: Number(row.current_region_id),
              key: row.current_region_key,
              name: row.current_region_name,
            }
          : null,
      location:
        row.current_location_id !== null
          ? {
              id: Number(row.current_location_id),
              key: row.current_location_key,
              name: row.current_location_name,
            }
          : null,
      scene:
        row.current_scene_id !== null
          ? {
              id: Number(row.current_scene_id),
              key: row.current_scene_key,
              name: row.current_scene_name,
            }
          : null,
    },
    status: row.status,
    disposition: row.disposition,
    faction: row.faction,
    state: row.state_json ?? {},
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildRegionHierarchy(rows) {
  const regionsById = new Map();

  for (const row of rows) {
    const regionId = Number(row.region_id);

    if (!regionsById.has(regionId)) {
      regionsById.set(regionId, {
        id: regionId,
        world_id: Number(row.world_id),
        key: row.region_key,
        name: row.region_name,
        description: row.region_description,
        is_active: row.region_is_active,
        template:
          row.region_template_id !== null
            ? {
                id: Number(row.region_template_id),
                key: row.region_template_key,
              }
            : null,
        locations: [],
      });
    }

    if (row.location_id === null) {
      continue;
    }

    const region = regionsById.get(regionId);
    let location = region.locations.find((entry) => entry.id === Number(row.location_id));

    if (!location) {
      location = {
        id: Number(row.location_id),
        key: row.location_key,
        name: row.location_name,
        description: row.location_description,
        is_active: row.location_is_active,
        template:
          row.location_template_id !== null
            ? {
                id: Number(row.location_template_id),
                key: row.location_template_key,
              }
            : null,
        scenes: [],
      };
      region.locations.push(location);
    }

    if (row.scene_id !== null) {
      location.scenes.push({
        id: Number(row.scene_id),
        key: row.scene_key,
        name: row.scene_name,
        summary: row.scene_summary,
        is_starting_scene: row.is_starting_scene,
        is_active: row.scene_is_active,
        template:
          row.scene_template_id !== null
            ? {
                id: Number(row.scene_template_id),
                key: row.scene_template_key,
              }
            : null,
      });
    }
  }

  return Array.from(regionsById.values());
}

function mapLocationRow(row, scenes, overlays) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    key: row.key,
    name: row.name,
    description: row.description,
    legacy_region_name: row.legacy_region_name,
    is_active: row.is_active,
    world: {
      id: Number(row.world_id),
      name: row.world_name,
      slug: row.world_slug,
    },
    region: {
      id: Number(row.region_id),
      key: row.region_key,
      name: row.region_name,
    },
    template:
      row.template_id !== null
        ? {
            id: Number(row.template_id),
            key: row.template_key,
            name: row.template_name,
          }
        : null,
    scenes: scenes.map((scene) => ({
      id: Number(scene.id),
      key: scene.key,
      name: scene.name,
      summary: scene.summary,
      is_starting_scene: scene.is_starting_scene,
      is_active: scene.is_active,
      template:
        scene.template_id !== null
          ? {
              id: Number(scene.template_id),
              key: scene.template_key,
            }
          : null,
      created_at: scene.created_at,
      updated_at: scene.updated_at,
    })),
    campaign_overlays: overlays.map(mapCampaignOverlayRow),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSceneRow(row, overlays, entities) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    key: row.key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    entry_text: row.entry_text,
    is_starting_scene: row.is_starting_scene,
    entry_conditions: row.entry_conditions_json ?? {},
    is_active: row.is_active,
    world: {
      id: Number(row.world_id),
      name: row.world_name,
      slug: row.world_slug,
    },
    region: {
      id: Number(row.region_id),
      key: row.region_key,
      name: row.region_name,
    },
    location: {
      id: Number(row.location_id),
      key: row.location_key,
      name: row.location_name,
    },
    template:
      row.template_id !== null
        ? {
            id: Number(row.template_id),
            key: row.template_key,
            name: row.template_name,
          }
        : null,
    campaign_overlays: overlays.map(mapCampaignOverlayRow),
    present_world_entities: entities.map(mapWorldEntityRow),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getDefaultWorldId(executor = { query }) {
  const result = await executor.query(selectDefaultWorldQuery);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Default world is not configured', 500);
  }

  return Number(row.id);
}

export async function listWorlds() {
  const result = await query(selectWorldsQuery);
  return result.rows.map(mapWorldRow);
}

export async function getWorldById(worldId) {
  const result = await query(selectWorldByIdQuery, [worldId]);
  return mapWorldRow(result.rows[0] || null);
}

export async function listWorldCampaigns(worldId) {
  const world = await getWorldById(worldId);

  if (!world) {
    throw createHttpError('World not found', 404);
  }

  const result = await query(selectWorldCampaignsQuery, [worldId]);
  return {
    world,
    campaigns: result.rows.map(mapCampaignRow),
  };
}

export async function listCharacterCampaigns(characterId) {
  const result = await query(selectCharacterCampaignsQuery, [characterId]);

  if (result.rows.length === 0) {
    throw createHttpError('Character not found or has no campaign memberships', 404);
  }

  return {
    character: {
      id: Number(result.rows[0].character_id),
      name: result.rows[0].character_name,
      is_active: result.rows[0].character_is_active,
      world_id: Number(result.rows[0].character_world_id),
    },
    world: {
      id: Number(result.rows[0].character_world_id),
      name: result.rows[0].world_name,
      slug: result.rows[0].world_slug,
    },
    memberships: result.rows.map(mapCharacterCampaignRow),
  };
}

export async function listWorldRegions(worldId) {
  const world = await getWorldById(worldId);

  if (!world) {
    throw createHttpError('World not found', 404);
  }

  const result = await query(selectWorldRegionsQuery, [worldId]);

  return {
    world,
    regions: buildRegionHierarchy(result.rows),
  };
}

export async function getLocationById(locationId) {
  const [locationResult, scenesResult, overlaysResult] = await Promise.all([
    query(selectLocationByIdQuery, [locationId]),
    query(selectLocationScenesQuery, [locationId]),
    query(selectLocationCampaignStatesQuery, [locationId]),
  ]);

  return mapLocationRow(
    locationResult.rows[0] || null,
    scenesResult.rows,
    overlaysResult.rows
  );
}

export async function getSceneById(sceneId) {
  const [sceneResult, overlaysResult, entitiesResult] = await Promise.all([
    query(selectSceneByIdQuery, [sceneId]),
    query(selectSceneCampaignStatesQuery, [sceneId]),
    query(selectSceneWorldEntitiesQuery, [sceneId]),
  ]);

  return mapSceneRow(sceneResult.rows[0] || null, overlaysResult.rows, entitiesResult.rows);
}

export async function listWorldEntities(worldId) {
  const world = await getWorldById(worldId);

  if (!world) {
    throw createHttpError('World not found', 404);
  }

  const result = await query(selectWorldEntitiesQuery, [worldId]);

  return {
    world,
    entities: result.rows.map(mapWorldEntityRow),
  };
}
