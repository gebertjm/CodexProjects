import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { grantKnowledge } from '../src/services/characterKnowledgeService.js';
import { getCharacterSceneView } from '../src/services/characterSceneViewService.js';
import { ensureNpcPresenceSchema } from '../src/services/npcPresenceSchema.js';
import { listNpcPresenceForScene } from '../src/services/npcPresenceService.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { setEnvironmentOverride } from '../src/services/environmentStateService.js';
import { applyNpcStateMutation } from '../src/services/worldStateMutationService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureNpcPresenceSchema();
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

async function lookupGreyvaleIds(sceneKey = 'grey-road-inn') {
  const result = await query(
    `
      SELECT
        (SELECT id FROM dnd5e_world WHERE slug = 'greyvale' LIMIT 1) AS world_id,
        (SELECT id FROM dnd5e_race WHERE slug = 'human' LIMIT 1) AS race_id,
        (SELECT id FROM dnd5e_class WHERE slug = 'fighter' LIMIT 1) AS class_id,
        (SELECT id FROM dnd5e_background LIMIT 1) AS background_id,
        (SELECT id FROM dnd5e_scene WHERE key = $1 LIMIT 1) AS scene_id,
        (SELECT location_id FROM dnd5e_scene WHERE key = $1 LIMIT 1) AS location_id,
        (SELECT id FROM dnd5e_scene WHERE key = 'dunmere-village' LIMIT 1) AS dunmere_scene_id,
        (SELECT location_id FROM dnd5e_scene WHERE key = 'dunmere-village' LIMIT 1) AS dunmere_location_id,
        (SELECT id FROM dnd5e_world_entity WHERE entity_key = 'tomas-rell' LIMIT 1) AS tomas_world_entity_id
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

async function createCampaignAtScene(sceneKey = 'grey-road-inn', twoCharacters = false) {
  const ids = await lookupGreyvaleIds(sceneKey);
  const accountA = await createPlayableAccount('stage5j3_actor');
  const accountB = twoCharacters ? await createPlayableAccount('stage5j3_observer') : null;
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
    [ids.world_id, `stage5j3-world-${Date.now()}-${Math.random().toString(36).slice(2)}`]
  );
  const worldInstanceId = Number(worldInstance.rows[0].id);
  const characterAId = await createCharacter({
    accountId: accountA.accountId,
    worldId: ids.world_id,
    name: 'Presence Aric',
  });
  const characterBId = accountB
    ? await createCharacter({
        accountId: accountB.accountId,
        worldId: ids.world_id,
        name: 'Presence Bera',
      })
    : null;
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
      VALUES ($1, $2, 'Stage 5J3 NPC Presence', $3, 'party', 'active', $4, TRUE)
      RETURNING id
    `,
    [
      ids.world_id,
      worldInstanceId,
      `stage-5j3-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      accountA.accountId,
    ]
  );
  const campaignId = Number(campaign.rows[0].id);

  for (const [characterId, accountId] of [
    [characterAId, accountA.accountId],
    ...(characterBId ? [[characterBId, accountB.accountId]] : []),
  ]) {
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
      [campaignId, characterId, accountId, ids.scene_id]
    );
  }

  return {
    ...ids,
    accountA,
    accountB,
    campaignId,
    worldInstanceId,
    characterAId,
    characterBId,
  };
}

async function setTime(fixture, timeOfDay) {
  await setEnvironmentOverride({
    worldInstanceId: fixture.worldInstanceId,
    scopeType: 'world',
    scopeId: fixture.worldInstanceId,
    values: {
      weather: 'rain',
      time_of_day: timeOfDay,
      season: 'autumn',
      location_environment: 'inn',
      mood_or_tone: 'quiet',
      light_level: 'firelit',
    },
    source: 'test',
    campaignId: fixture.campaignId,
  });
}

test('Stage 5J.3 schema and Greyvale NPC schedule content are imported', async () => {
  const columns = await query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'dnd5e_npc'
        AND column_name = ANY($1::text[])
    `,
    [
      [
        'true_name',
        'public_role_label',
        'unknown_label',
        'aliases_json',
        'default_location_key',
        'default_scene_key',
        'identity_json',
        'schedule_json',
      ],
    ]
  );
  assert.equal(columns.rowCount, 8);

  const content = await query(
    `
      SELECT
        (SELECT jsonb_array_length(schedule_json) FROM dnd5e_npc WHERE key = 'tomas-rell') AS tomas_schedule_count,
        (SELECT unknown_label FROM dnd5e_npc WHERE key = 'elin-harrow') AS elin_unknown_label,
        (SELECT COUNT(*)::int FROM dnd5e_npc WHERE key = 'grey-road-travelers' AND npc_type = 'group') AS traveler_count
    `
  );
  assert.ok(content.rows[0].tomas_schedule_count >= 4);
  assert.equal(content.rows[0].elin_unknown_label, 'a shaken woman');
  assert.equal(content.rows[0].traveler_count, 1);
});

test('NPC schedules resolve by 5J.2 time block and visible NPCs become affordances', async () => {
  const fixture = await createCampaignAtScene('grey-road-inn');
  await setTime(fixture, 'evening');

  const presence = await listNpcPresenceForScene({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
    includeDebug: true,
  });

  const names = presence.visible_npcs.map((npc) => npc.display_name);
  assert.ok(names.includes('the innkeeper'));
  assert.ok(names.includes('travelers'));
  assert.ok(names.includes('a shaken woman'));
  assert.ok(
    presence.npc_affordances.some(
      (affordance) => affordance.affordance_id === 'npc:tomas-rell' && affordance.actions.includes('talk')
    )
  );

  await setTime(fixture, 'night');
  const nightPresence = await listNpcPresenceForScene({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
  });
  assert.equal(nightPresence.visible_npcs.some((npc) => npc.npc_id === 'tomas-rell'), false);
});

test('NPC identity display is character-knowledge limited', async () => {
  const fixture = await createCampaignAtScene('grey-road-inn', true);
  await setTime(fixture, 'evening');

  const before = await listNpcPresenceForScene({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
  });
  assert.ok(before.visible_npcs.some((npc) => npc.npc_id === 'elin-harrow' && npc.display_name === 'a shaken woman'));

  await grantKnowledge({
    characterId: fixture.characterAId,
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    knowledgeId: 'knows_elin_name',
  });
  const after = await listNpcPresenceForScene({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
  });
  assert.ok(after.visible_npcs.some((npc) => npc.npc_id === 'elin-harrow' && npc.display_name === 'Elin Harrow'));

  const observer = await listNpcPresenceForScene({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterBId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
  });
  assert.ok(observer.visible_npcs.some((npc) => npc.npc_id === 'elin-harrow' && npc.display_name === 'a shaken woman'));
  assert.equal(observer.visible_npcs.some((npc) => npc.display_name === 'Elin Harrow'), false);
});

test('NPC runtime state overrides schedules and creates NPC state events', async () => {
  const fixture = await createCampaignAtScene('grey-road-inn');
  await setTime(fixture, 'evening');

  await applyNpcStateMutation({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    entityKey: 'tomas-rell',
    worldEntityId: fixture.tomas_world_entity_id,
    locationId: fixture.location_id,
    sceneId: fixture.scene_id,
    status: 'dead',
    patch: {
      alive: false,
      status_known_to_characters: false,
    },
    reason: 'test death override',
  });

  const afterDeath = await listNpcPresenceForScene({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
  });
  assert.equal(afterDeath.visible_npcs.some((npc) => npc.npc_id === 'tomas-rell'), false);

  const moved = await createCampaignAtScene('grey-road-inn');
  await setTime(moved, 'evening');
  await applyNpcStateMutation({
    worldInstanceId: moved.worldInstanceId,
    campaignId: moved.campaignId,
    characterId: moved.characterAId,
    entityKey: 'tomas-rell',
    worldEntityId: moved.tomas_world_entity_id,
    locationId: moved.dunmere_location_id,
    sceneId: moved.scene_id,
    status: 'active',
    patch: {
      current_location_id: 'dunmere-village',
      current_scene_id: 'dunmere-village',
      activity_override: 'speaking with village leaders',
    },
    reason: 'test movement override',
  });

  const innPresence = await listNpcPresenceForScene({
    worldInstanceId: moved.worldInstanceId,
    campaignId: moved.campaignId,
    characterId: moved.characterAId,
    sceneId: moved.scene_id,
    locationId: moved.location_id,
  });
  assert.equal(innPresence.visible_npcs.some((npc) => npc.npc_id === 'tomas-rell'), false);

  const dunmerePresence = await listNpcPresenceForScene({
    worldInstanceId: moved.worldInstanceId,
    campaignId: moved.campaignId,
    characterId: moved.characterAId,
    sceneId: moved.dunmere_scene_id,
    locationId: moved.dunmere_location_id,
  });
  assert.ok(dunmerePresence.visible_npcs.some((npc) => npc.npc_id === 'tomas-rell'));

  const events = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_world_event
      WHERE world_instance_id = $1
        AND event_type = 'npc_state_changed'
        AND event_payload_json->>'entity_key' = 'tomas-rell'
    `,
    [moved.worldInstanceId]
  );
  assert.ok(events.rows[0].count >= 1);
});

test('Character scene view and current-scene API include NPC presence without hidden truth leakage', async () => {
  const fixture = await createCampaignAtScene('grey-road-inn');
  await setTime(fixture, 'evening');

  const directView = await getCharacterSceneView({
    accountId: fixture.accountA.accountId,
    includeDebug: true,
  });
  assert.equal(directView.state, 'active');
  assert.ok(directView.visible_npcs.some((npc) => npc.npc_id === 'tomas-rell'));
  assert.ok(directView.visible_affordances.some((affordance) => affordance.affordance_id === 'npc:tomas-rell'));
  const innkeeperAffordance = directView.visible_affordances.find(
    (affordance) => affordance.affordance_id === 'the_innkeeper'
  );
  assert.equal(
    innkeeperAffordance?.dialogue_scene_id,
    'greyvale_tomas_roadside_worries_dialogue'
  );
  assert.ok(
    directView.scene_reference?.action_targets?.some(
      (target) =>
        target.label === 'the innkeeper' &&
        target.dialogue_scene_id === 'greyvale_tomas_roadside_worries_dialogue'
    )
  );
  assert.equal(JSON.stringify(directView.visible_npcs).includes('Whispering Presence'), false);

  await query('UPDATE account SET can_advance_beats = TRUE WHERE id = $1', [
    fixture.accountA.accountId,
  ]);
  const apiView = await request('/api/play/current-scene?include_debug=true', {
    headers: fixture.accountA.headers,
  });
  assert.equal(apiView.response.status, 200);
  assert.ok(apiView.body.visible_npcs.some((npc) => npc.npc_id === 'tomas-rell'));
  assert.ok(
    apiView.body.scene_reference?.action_targets?.some(
      (target) =>
        target.label === 'the innkeeper' &&
        target.dialogue_scene_id === 'greyvale_tomas_roadside_worries_dialogue'
    )
  );
  assert.ok(apiView.body.debug.npc_presence.visible_count >= 2);
  assert.equal(JSON.stringify(apiView.body.visible_npcs).includes('Whispering Presence'), false);
});
