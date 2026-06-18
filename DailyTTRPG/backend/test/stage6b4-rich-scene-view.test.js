import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import app from '../src/app.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
  await ensureWebCharacterCreationSchema();
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

function uniqueUid(label) {
  return `stage6b4_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B4 ${label}`,
  });
  const me = await request('/api/me', { headers });
  assert.equal(me.response.status, 200);
  return { uid, headers, accountId: Number(me.body.account.account_id) };
}

async function createQuickCharacter(player, name, archetypeId = 'stalwart_fighter') {
  const created = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      name,
      archetype_id: archetypeId,
    }),
  });
  assert.equal(created.response.status, 201);
  return created.body.character;
}

test('Stage 6B.4 current scene requires auth and handles empty character/campaign state safely', async () => {
  const missing = await request('/api/play/current-scene');
  assert.equal(missing.response.status, 401);

  const noCharacterPlayer = await createPlayer('empty');
  const noCharacterScene = await request('/api/play/current-scene', {
    headers: noCharacterPlayer.headers,
  });
  assert.equal(noCharacterScene.response.status, 200);
  assert.equal(noCharacterScene.body.state, 'no_active_character');
  assert.equal(noCharacterScene.body.action_status.state, 'no_active_character');
  assert.equal(noCharacterScene.body.scene, null);

  const noCampaignPlayer = await createPlayer('no_campaign');
  await createQuickCharacter(noCampaignPlayer, 'Scene Pending');
  const noCampaignScene = await request('/api/play/current-scene', {
    headers: noCampaignPlayer.headers,
  });
  assert.equal(noCampaignScene.response.status, 200);
  assert.equal(noCampaignScene.body.state, 'no_active_campaign');
  assert.equal(noCampaignScene.body.action_status.state, 'no_active_campaign');
  assert.equal(noCampaignScene.body.scene, null);
});

test('Stage 6B.4 current scene returns rich character-perspective scene data without debug leakage', async () => {
  const player = await createPlayer('active');
  await createQuickCharacter(player, 'Scene Aric');

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);

  const scene = await request('/api/play/current-scene', {
    headers: player.headers,
  });
  assert.equal(scene.response.status, 200);
  assert.equal(scene.body.state, 'active');
  assert.equal(scene.body.active_character.name, 'Scene Aric');
  assert.ok(scene.body.campaign.campaign_name);
  assert.equal(scene.body.campaign.world_id, 'greyvale');
  assert.ok(scene.body.scene.title);
  assert.ok(scene.body.scene.location_name);
  assert.match(scene.body.scene.description, /caravan|Grey Road|road/i);
  assert.ok(scene.body.environment === null || scene.body.environment.summary !== undefined);
  assert.ok(scene.body.objective?.title);
  assert.ok(scene.body.action_status?.state);
  assert.ok(Array.isArray(scene.body.visible_npcs));
  assert.ok(Array.isArray(scene.body.known_relevant_npcs));
  assert.ok(Array.isArray(scene.body.visible_affordances));
  assert.ok(scene.body.visible_affordances.some((affordance) => Array.isArray(affordance.actions)));
  assert.ok(Array.isArray(scene.body.known_facts));
  assert.ok(Array.isArray(scene.body.scene_state_summary));
  assert.equal(scene.body.debug, undefined);
  assert.equal(scene.body.mechanical_details, undefined);
  assert.equal(JSON.stringify(scene.body).includes('Whispering Presence'), false);
});

test('Stage 6B.4 current scene exposes safe mechanics only when requested', async () => {
  const player = await createPlayer('mechanics');
  await createQuickCharacter(player, 'Mechanic Mira');
  await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });

  const normal = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(normal.response.status, 200);
  assert.equal(normal.body.mechanical_details, undefined);
  assert.equal(normal.body.debug, undefined);

  const withMechanics = await request('/api/play/current-scene?include_mechanics=true', {
    headers: player.headers,
  });
  assert.equal(withMechanics.response.status, 200);
  assert.ok(withMechanics.body.mechanical_details);
  assert.ok(Array.isArray(withMechanics.body.mechanical_details.environment_modifiers));
  assert.ok(Object.hasOwn(withMechanics.body.mechanical_details, 'action_window'));
  assert.ok(Object.hasOwn(withMechanics.body.mechanical_details, 'safe_character_context'));
  assert.equal(withMechanics.body.debug, undefined);
});
