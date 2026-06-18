import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { listKnowledgeForCharacter } from '../src/services/characterKnowledgeService.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { resolveResultBand } from '../src/services/resultBandService.js';
import { getCharacterSceneView } from '../src/services/characterSceneViewService.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { applyInteractionResultMutation } from '../src/services/worldStateMutationService.js';
import {
  getCampaignWorldInstance,
  listAvailableAffordances,
} from '../src/services/worldStateService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
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

async function lookupGreyvaleIds() {
  const result = await query(
    `
      SELECT
        (SELECT id FROM dnd5e_world WHERE slug = 'greyvale' LIMIT 1) AS world_id,
        (SELECT id FROM dnd5e_race WHERE slug = 'human' LIMIT 1) AS race_id,
        (SELECT id FROM dnd5e_class WHERE slug = 'fighter' LIMIT 1) AS class_id,
        (SELECT id FROM dnd5e_background LIMIT 1) AS background_id,
        (SELECT id FROM dnd5e_scene WHERE key = 'broken-caravan-site' LIMIT 1) AS scene_id,
        (SELECT location_id FROM dnd5e_scene WHERE key = 'broken-caravan-site' LIMIT 1) AS location_id,
        (SELECT id FROM dnd5e_scene_interaction WHERE interaction_key = 'inspect-broken-caravan' LIMIT 1) AS interaction_id
    `
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

async function createCampaignWithCharacters() {
  const ids = await lookupGreyvaleIds();
  const accountA = await createPlayableAccount('stage5j_actor');
  const accountB = await createPlayableAccount('stage5j_observer');
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
    [ids.world_id, `stage5j-world-${Date.now()}-${Math.random().toString(36).slice(2)}`]
  );
  const worldInstanceId = Number(worldInstance.rows[0].id);
  const characterAId = await createCharacter({
    accountId: accountA.accountId,
    worldId: ids.world_id,
    name: 'Knowledge Aric',
  });
  const characterBId = await createCharacter({
    accountId: accountB.accountId,
    worldId: ids.world_id,
    name: 'Observer Bera',
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
      VALUES ($1, $2, 'Stage 5J Living World', $3, 'party', 'active', $4, TRUE)
      RETURNING id
    `,
    [
      ids.world_id,
      worldInstanceId,
      `stage-5j-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      accountA.accountId,
    ]
  );
  const campaignId = Number(campaign.rows[0].id);

  for (const [characterId, accountId, isActiveContext] of [
    [characterAId, accountA.accountId, true],
    [characterBId, accountB.accountId, true],
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
        VALUES ($1, $2, $3, TRUE, 'active', $4, NOW(), $5)
      `,
      [campaignId, characterId, accountId, isActiveContext, ids.scene_id]
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

test('Stage 5J.1 schema and Greyvale authored proof content are present', async () => {
  const tables = await query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [
      [
        'dnd5e_world_instance',
        'dnd5e_world_entity_state',
        'dnd5e_world_location_state',
        'dnd5e_world_scene_state',
        'dnd5e_world_scene_affordance_state',
        'dnd5e_character_knowledge',
        'dnd5e_world_event',
      ],
    ]
  );
  assert.equal(tables.rowCount, 7);

  const content = await query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM dnd5e_knowledge_definition WHERE knowledge_key IN ('caravan_irregularity', 'attack_staged')) AS knowledge_count,
        (SELECT COUNT(*)::int FROM dnd5e_scene_affordance WHERE affordance_key IN ('caravan_wreck', 'strange_tracks')) AS affordance_count,
        (SELECT jsonb_array_length(result_bands_json) FROM dnd5e_scene_interaction WHERE interaction_key = 'inspect-broken-caravan' LIMIT 1) AS band_count
    `
  );
  assert.equal(content.rows[0].knowledge_count, 2);
  assert.equal(content.rows[0].affordance_count, 2);
  assert.equal(content.rows[0].band_count >= 3, true);
});

test('Stage 5J.1 result bands drive state mutation, character knowledge, and event logging', async () => {
  const fixture = await createCampaignWithCharacters();
  const interaction = await query(
    `
      SELECT *
      FROM dnd5e_scene_interaction
      WHERE id = $1
    `,
    [fixture.interaction_id]
  );
  const resultBand = resolveResultBand({
    interaction: interaction.rows[0],
    checkTotal: 18,
  });

  assert.equal(resultBand.band, 'great_success');
  assert.match(resultBand.text, /staged/i);

  const mutation = await applyInteractionResultMutation({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
    interactionId: fixture.interaction_id,
    interactionKey: 'inspect-broken-caravan',
    resultBand,
    checkTotal: 18,
    createdByKind: 'user',
    createdByAccountId: fixture.accountA.accountId,
  });

  assert.equal(mutation.events_created.length, 1);
  assert.ok(mutation.knowledge_granted.includes('caravan_irregularity'));
  assert.ok(mutation.knowledge_granted.includes('attack_staged'));
  assert.ok(mutation.affordance_updates.some((update) => update.target_id === 'caravan_wreck' && update.to === 'resolved'));
  assert.ok(mutation.affordance_updates.some((update) => update.target_id === 'strange_tracks' && update.to === 'available'));

  const actorKnowledge = await listKnowledgeForCharacter({
    characterId: fixture.characterAId,
    worldInstanceId: fixture.worldInstanceId,
  });
  assert.ok(actorKnowledge.some((entry) => entry.knowledge_id === 'attack_staged'));

  const observerKnowledge = await listKnowledgeForCharacter({
    characterId: fixture.characterBId,
    worldInstanceId: fixture.worldInstanceId,
  });
  assert.equal(observerKnowledge.some((entry) => entry.knowledge_id === 'attack_staged'), false);

  const availableAffordances = await listAvailableAffordances({
    worldInstanceId: fixture.worldInstanceId,
    sceneId: fixture.scene_id,
  });
  assert.equal(availableAffordances.some((affordance) => affordance.affordance_id === 'caravan_wreck'), false);
  assert.equal(availableAffordances.some((affordance) => affordance.affordance_id === 'strange_tracks'), true);

  const events = await query('SELECT * FROM dnd5e_world_event WHERE id = $1', [mutation.event_id]);
  assert.equal(events.rowCount, 1);
  assert.equal(events.rows[0].event_type, 'interaction_resolved');
  assert.equal(Number(events.rows[0].actor_character_id), fixture.characterAId);
  assert.ok(events.rows[0].knowledge_granted_json.includes('attack_staged'));
});

test('Stage 5J.1 character scene views are assembled by the backend and hide unknown truth', async () => {
  const fixture = await createCampaignWithCharacters();
  const interaction = await query('SELECT * FROM dnd5e_scene_interaction WHERE id = $1', [
    fixture.interaction_id,
  ]);
  const resultBand = resolveResultBand({ interaction: interaction.rows[0], checkTotal: 18 });

  await applyInteractionResultMutation({
    worldInstanceId: fixture.worldInstanceId,
    campaignId: fixture.campaignId,
    characterId: fixture.characterAId,
    sceneId: fixture.scene_id,
    locationId: fixture.location_id,
    interactionId: fixture.interaction_id,
    interactionKey: 'inspect-broken-caravan',
    resultBand,
    checkTotal: 18,
    createdByAccountId: fixture.accountA.accountId,
  });

  const actorView = await getCharacterSceneView({
    accountId: fixture.accountA.accountId,
    includeDebug: true,
  });
  assert.equal(actorView.state, 'active');
  assert.equal(actorView.scene.key, 'broken-caravan-site');
  assert.ok(actorView.known_facts.some((fact) => fact.knowledge_id === 'attack_staged'));
  assert.equal(actorView.visible_affordances.some((affordance) => affordance.affordance_id === 'caravan_wreck'), false);
  assert.equal(actorView.visible_affordances.some((affordance) => affordance.affordance_id === 'strange_tracks'), true);

  const observerView = await getCharacterSceneView({
    accountId: fixture.accountB.accountId,
    includeDebug: true,
  });
  assert.equal(observerView.state, 'active');
  assert.equal(observerView.visible_affordances.some((affordance) => affordance.affordance_id === 'strange_tracks'), true);
  assert.equal(observerView.known_facts.some((fact) => fact.knowledge_id === 'attack_staged'), false);
  assert.equal(JSON.stringify(observerView.known_facts).includes('attack_staged'), false);

  const apiView = await request('/api/play/current-scene?include_debug=true', {
    headers: fixture.accountA.headers,
  });
  assert.equal(apiView.response.status, 200);
  assert.equal(apiView.body.state, 'active');
  assert.equal(apiView.body.scene.key, 'broken-caravan-site');
  assert.ok(apiView.body.known_facts.some((fact) => fact.knowledge_id === 'attack_staged'));

  const worldInstance = await getCampaignWorldInstance(fixture.campaignId);
  assert.equal(worldInstance.world_instance_id, String(fixture.worldInstanceId));
});
