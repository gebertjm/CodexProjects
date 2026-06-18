import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { grantKnowledge } from '../src/services/characterKnowledgeService.js';
import { getCharacterSceneView } from '../src/services/characterSceneViewService.js';
import { assembleEnvironmentDescription } from '../src/services/environmentDescriptionService.js';
import { selectEnvironmentFlavorEntries } from '../src/services/environmentFlavorSelector.js';
import { validateEnvironmentContext } from '../src/services/environmentContext.js';
import { listEnvironmentModifiers } from '../src/services/environmentModifierService.js';
import { ensureEnvironmentSchema } from '../src/services/environmentSchema.js';
import {
  advanceTime,
  clearEnvironmentOverride,
  getEffectiveEnvironment,
  maybeTransitionWeather,
  setEnvironmentOverride,
} from '../src/services/environmentStateService.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { resolveResultBand } from '../src/services/resultBandService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureEnvironmentSchema();
  await importContentPackage(path.resolve(process.cwd(), '../content/worlds/greyvale'));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function firebaseToken(payload) {
  return `test-firebase:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

function authHeader(payload) {
  return {
    Authorization: `Bearer ${firebaseToken(payload)}`,
  };
}

async function createPlayableAccount(uidPrefix) {
  const uid = `${uidPrefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const me = await request('/api/me', {
    headers: authHeader({
      uid,
      email: `${uid}@example.com`,
      name: uidPrefix,
    }),
  });

  assert.equal(me.response.status, 200);
  return {
    uid,
    accountId: Number(me.body.account.account_id),
    headers: authHeader({ uid, email: `${uid}@example.com`, name: uidPrefix }),
  };
}

async function lookupGreyvaleIds(sceneKey = 'broken-caravan-site') {
  const result = await query(
    `
      SELECT
        (SELECT id FROM dnd5e_world WHERE slug = 'greyvale' LIMIT 1) AS world_id,
        (SELECT id FROM dnd5e_race WHERE slug = 'human' LIMIT 1) AS race_id,
        (SELECT id FROM dnd5e_class WHERE slug = 'fighter' LIMIT 1) AS class_id,
        (SELECT id FROM dnd5e_background LIMIT 1) AS background_id,
        (SELECT id FROM dnd5e_scene WHERE key = $1 LIMIT 1) AS scene_id,
        (SELECT location_id FROM dnd5e_scene WHERE key = $1 LIMIT 1) AS location_id,
        (SELECT id FROM dnd5e_region WHERE key = 'greyvale-lowlands' LIMIT 1) AS region_id,
        (SELECT id FROM dnd5e_scene_interaction WHERE interaction_key = 'inspect-broken-caravan' LIMIT 1) AS interaction_id
    `,
    [sceneKey]
  );

  const ids = result.rows[0];
  for (const [key, value] of Object.entries(ids)) {
    assert.ok(value, `${key} should exist`);
  }
  return ids;
}

async function createCharacter({ accountId, worldId, name }) {
  const ids = await lookupGreyvaleIds();
  const result = await query(
    `
      INSERT INTO dnd5e_character (
        account_id,
        world_id,
        name,
        race_id,
        class_id,
        background_id,
        level,
        status,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, 'active', TRUE)
      RETURNING id
    `,
    [accountId, worldId, name, ids.race_id, ids.class_id, ids.background_id]
  );
  const characterId = Number(result.rows[0].id);
  await query('UPDATE account SET active_character_id = $2 WHERE id = $1', [accountId, characterId]);
  return characterId;
}

async function createCampaignAtScene(sceneKey = 'broken-caravan-site') {
  const ids = await lookupGreyvaleIds(sceneKey);
  const account = await createPlayableAccount('stage5j2_actor');
  const worldInstance = await query(
    `
      INSERT INTO dnd5e_world_instance (
        world_id,
        instance_key,
        content_package_id,
        content_package_version,
        status,
        metadata_json
      )
      VALUES ($1, $2, 'greyvale', '1.0.0', 'active', '{"test": true}'::jsonb)
      RETURNING id
    `,
    [ids.world_id, `stage5j2-world-${Date.now()}-${Math.random().toString(36).slice(2)}`]
  );
  const worldInstanceId = Number(worldInstance.rows[0].id);
  const characterId = await createCharacter({
    accountId: account.accountId,
    worldId: ids.world_id,
    name: 'Weather Aric',
  });
  const campaign = await query(
    `
      INSERT INTO dnd5e_campaign (
        world_id,
        world_instance_id,
        name,
        slug,
        campaign_type,
        status,
        created_by_account_id,
        is_active
      )
      VALUES ($1, $2, 'Stage 5J2 Environment', $3, 'party', 'active', $4, TRUE)
      RETURNING id
    `,
    [
      ids.world_id,
      worldInstanceId,
      `stage-5j2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      account.accountId,
    ]
  );
  const campaignId = Number(campaign.rows[0].id);

  await query(
    `
      INSERT INTO dnd5e_campaign_character (
        campaign_id,
        character_id,
        joined_by_account_id,
        is_active,
        membership_status,
        is_active_context,
        joined_at,
        current_scene_id
      )
      VALUES ($1, $2, $3, TRUE, 'active', TRUE, NOW(), $4)
    `,
    [campaignId, characterId, account.accountId, ids.scene_id]
  );

  return {
    ...ids,
    account,
    campaignId,
    worldInstanceId,
    characterId,
  };
}

test('Stage 5J.2 schema, content import, and EnvironmentContext validation are present', async () => {
  const tables = await query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [
      [
        'dnd5e_environment_state',
        'dnd5e_environment_flavor',
        'dnd5e_environment_flavor_usage',
        'dnd5e_environment_modifier',
      ],
    ]
  );
  assert.equal(tables.rowCount, 4);

  const content = await query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM dnd5e_environment_flavor WHERE flavor_key LIKE 'grey_road_inn_%') AS inn_flavor_count,
        (SELECT COUNT(*)::int FROM dnd5e_environment_modifier WHERE modifier_key IN ('heavy_rain_survival_tracking', 'fog_perception_distance')) AS modifier_count
    `
  );
  assert.ok(content.rows[0].inn_flavor_count >= 4);
  assert.equal(content.rows[0].modifier_count, 2);

  assert.equal(validateEnvironmentContext({ weather: 'rain', time_of_day: 'evening' }).ok, true);
  assert.equal(validateEnvironmentContext({ weather: 'laser_sleet' }).ok, false);
});

test('Stage 5J.2 environment state persists, inherits by scope, advances time, and logs events', async () => {
  const fixture = await createCampaignAtScene('grey-road-inn');
  await setEnvironmentOverride({
    worldInstanceId: fixture.worldInstanceId,
    scopeType: 'world',
    scopeId: fixture.worldInstanceId,
    values: {
      weather: 'rain',
      time_of_day: 'afternoon',
      season: 'autumn',
      location_environment: 'road',
      mood_or_tone: 'uneasy',
    },
    source: 'test',
    campaignId: fixture.campaignId,
  });
  await setEnvironmentOverride({
    worldInstanceId: fixture.worldInstanceId,
    scopeType: 'location',
    scopeId: fixture.location_id,
    values: {
      location_environment: 'inn',
      mood_or_tone: 'quiet',
      light_level: 'firelit',
    },
    source: 'test',
    campaignId: fixture.campaignId,
  });
  await setEnvironmentOverride({
    worldInstanceId: fixture.worldInstanceId,
    scopeType: 'scene',
    scopeId: fixture.scene_id,
    values: {
      mood_or_tone: 'tense',
    },
    source: 'test',
    campaignId: fixture.campaignId,
  });

  const effective = await getEffectiveEnvironment({
    worldInstanceId: fixture.worldInstanceId,
    locationId: fixture.location_id,
    sceneId: fixture.scene_id,
  });
  assert.equal(effective.context.weather, 'rain');
  assert.equal(effective.context.location_environment, 'inn');
  assert.equal(effective.context.mood_or_tone, 'tense');
  assert.equal(effective.source_breakdown.mood_or_tone.scope_type, 'scene');

  await clearEnvironmentOverride({
    worldInstanceId: fixture.worldInstanceId,
    scopeType: 'scene',
    scopeId: fixture.scene_id,
    campaignId: fixture.campaignId,
  });
  const afterClear = await getEffectiveEnvironment({
    worldInstanceId: fixture.worldInstanceId,
    locationId: fixture.location_id,
    sceneId: fixture.scene_id,
  });
  assert.equal(afterClear.context.mood_or_tone, 'quiet');

  const time = await advanceTime({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
  });
  assert.equal(time.time_of_day, 'evening');
  assert.equal(time.day_count, 0);

  const transition = await maybeTransitionWeather({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
  });
  assert.equal(transition.changed, false);
  assert.equal(transition.reason, 'no_transition_table');

  const events = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_world_event
      WHERE world_instance_id = $1
        AND event_type = ANY($2::text[])
    `,
    [
      fixture.worldInstanceId,
      ['environment_override_set', 'environment_override_cleared', 'time_advanced'],
    ]
  );
  assert.ok(events.rows[0].count >= 5);
});

test('Stage 5J.2 flavor selector filters by environment, knowledge, and recent-use cooldown', async () => {
  const fixture = await createCampaignAtScene('grey-road-inn');
  const environment = {
    weather: 'rain',
    time_of_day: 'evening',
    season: 'autumn',
    light_level: 'firelit',
    temperature_band: 'cool',
    precipitation: 'rain',
    wind: 'light',
    visibility: 'dim',
    terrain_or_biome: 'lowlands',
    location_environment: 'inn',
    mood_or_tone: 'quiet',
  };

  const first = await selectEnvironmentFlavorEntries({
    environment,
    slots: ['weather_overlay'],
    locationTags: ['grey_road_inn', 'inn', 'interior'],
    sceneTags: ['grey_road_inn'],
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
    mode: 'deterministic',
    recordUsage: true,
  });
  assert.equal(first.selections[0].flavor_key, 'grey_road_inn_rain_evening_weather_001');

  const second = await selectEnvironmentFlavorEntries({
    environment,
    slots: ['weather_overlay'],
    locationTags: ['grey_road_inn', 'inn', 'interior'],
    sceneTags: ['grey_road_inn'],
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
    mode: 'deterministic',
    recordUsage: false,
  });
  assert.equal(second.selections[0].flavor_key, 'grey_road_inn_rain_evening_weather_002');

  const hiddenKnowledgeOverlay = await selectEnvironmentFlavorEntries({
    environment: { ...environment, location_environment: 'road' },
    slots: ['character_knowledge_overlay'],
    locationTags: ['broken_caravan_site', 'road'],
    sceneTags: ['broken_caravan_site'],
    worldInstanceId: fixture.worldInstanceId,
    knownFacts: [],
    mode: 'deterministic',
  });
  assert.equal(hiddenKnowledgeOverlay.selections.length, 0);

  const knownKnowledgeOverlay = await selectEnvironmentFlavorEntries({
    environment: { ...environment, location_environment: 'road' },
    slots: ['character_knowledge_overlay'],
    locationTags: ['broken_caravan_site', 'road'],
    sceneTags: ['broken_caravan_site'],
    worldInstanceId: fixture.worldInstanceId,
    knownFacts: ['caravan_irregularity'],
    mode: 'deterministic',
  });
  assert.equal(knownKnowledgeOverlay.selections[0].flavor_key, 'broken_caravan_irregularity_known_001');
});

test('Stage 5J.2 description assembler creates authored rich descriptions without leaking hidden truth', async () => {
  const fixture = await createCampaignAtScene('broken-caravan-site');
  await setEnvironmentOverride({
    worldInstanceId: fixture.worldInstanceId,
    scopeType: 'world',
    scopeId: fixture.worldInstanceId,
    values: {
      weather: 'fog',
      time_of_day: 'morning',
      season: 'autumn',
      location_environment: 'road',
      mood_or_tone: 'uneasy',
      visibility: 'obscured',
      light_level: 'dim',
    },
    source: 'test',
    campaignId: fixture.campaignId,
  });

  const sceneRow = await query('SELECT * FROM dnd5e_scene WHERE id = $1', [fixture.scene_id]);
  const assembled = await assembleEnvironmentDescription({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterId,
    scene: sceneRow.rows[0],
    includeDebug: true,
    recordUsage: false,
    selectionMode: 'deterministic',
  });

  assert.match(assembled.description, /Fog hangs low over the broken caravan/i);
  assert.match(assembled.description, /broken caravan beside the Grey Road/i);
  assert.equal(/whispering presence/i.test(assembled.description), false);
  assert.ok(assembled.components.some((component) => component.slot === 'weather_overlay'));

  await grantKnowledge({
    characterId: fixture.characterId,
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    knowledgeId: 'caravan_irregularity',
  });
  const knownDescription = await assembleEnvironmentDescription({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterId,
    scene: sceneRow.rows[0],
    includeDebug: true,
    recordUsage: false,
    selectionMode: 'deterministic',
  });
  assert.match(knownDescription.description, /untouched cargo/i);
});

test('Stage 5J.2 current-scene API returns environment-enhanced scene view and inspectable mechanics', async () => {
  const fixture = await createCampaignAtScene('grey-road-inn');
  await setEnvironmentOverride({
    worldInstanceId: fixture.worldInstanceId,
    scopeType: 'world',
    scopeId: fixture.worldInstanceId,
    values: {
      weather: 'heavy_rain',
      time_of_day: 'evening',
      season: 'autumn',
      location_environment: 'inn',
      mood_or_tone: 'quiet',
      visibility: 'dim',
      light_level: 'firelit',
    },
    source: 'test',
    campaignId: fixture.campaignId,
  });

  const directView = await getCharacterSceneView({
    accountId: fixture.account.accountId,
    includeDebug: true,
    includeMechanics: true,
  });
  assert.equal(directView.state, 'active');
  assert.equal(directView.environment.weather, 'heavy_rain');
  assert.match(directView.scene.description, /Rain (?:taps steadily against the inn windows|beads on the small panes)/i);
  assert.ok(directView.mechanical_details.environment_modifiers.some((modifier) => modifier.modifier_key === 'heavy_rain_survival_tracking'));
  assert.ok(directView.debug.description_components.some((component) => component.slot === 'weather_overlay'));

  const apiView = await request('/api/play/current-scene?include_debug=true&include_mechanics=true', {
    headers: fixture.account.headers,
  });
  assert.equal(apiView.response.status, 200);
  assert.equal(apiView.body.environment.weather, 'heavy_rain');
  assert.match(apiView.body.scene.description, /Rain (?:taps steadily against the inn windows|beads on the small panes)/i);
  assert.ok(apiView.body.mechanical_details.environment_modifiers.some((modifier) => modifier.reason.includes('Heavy rain')));
  assert.equal(JSON.stringify(apiView.body).includes('Whispering Presence'), false);
});

test('Stage 5J.2 environmental modifiers are explicit, contextual, and can feed result-band resolution', async () => {
  const heavyRain = {
    weather: 'heavy_rain',
    time_of_day: 'evening',
    season: 'autumn',
    light_level: 'dim',
    temperature_band: 'cool',
    precipitation: 'rain',
    wind: 'moderate',
    visibility: 'obscured',
    terrain_or_biome: 'lowlands',
    location_environment: 'road',
    mood_or_tone: 'uneasy',
  };

  const trackingModifiers = await listEnvironmentModifiers({
    environment: heavyRain,
    checkType: 'skill',
    skill: 'survival',
    context: 'tracking',
  });
  assert.equal(trackingModifiers.some((modifier) => modifier.modifier === -2), true);
  assert.equal(trackingModifiers[0].reason.includes('Heavy rain'), true);

  const unrelated = await listEnvironmentModifiers({
    environment: heavyRain,
    checkType: 'skill',
    skill: 'stealth',
    context: 'hiding',
  });
  assert.equal(unrelated.some((modifier) => modifier.modifier_key === 'heavy_rain_survival_tracking'), false);

  const interaction = await query(
    `
      SELECT *
      FROM dnd5e_scene_interaction
      WHERE interaction_key = 'inspect-broken-caravan'
      LIMIT 1
    `
  );
  const resolved = resolveResultBand({
    interaction: {
      ...interaction.rows[0],
      environment_modifiers: trackingModifiers,
    },
    checkTotal: 11,
  });
  assert.equal(resolved.base_check_total, 11);
  assert.equal(resolved.check_total, 9);
  assert.equal(resolved.band, 'failure');
  assert.ok(resolved.mechanical_details.environment_modifiers.some((modifier) => modifier.modifier === -2));
});
