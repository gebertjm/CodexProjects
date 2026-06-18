import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
  await ensureWebCharacterCreationSchema();
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
  return `stage6b15_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B15 ${label}`,
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

async function openActionWindowCount({ characterId, campaignId }) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_action_window
      WHERE character_id = $1
        AND campaign_id = $2
        AND status IN ('open', 'closing', 'resolving')
    `,
    [Number(characterId), Number(campaignId)]
  );
  return Number(result.rows[0]?.count ?? 0);
}

function stringify(value) {
  return JSON.stringify(value).toLowerCase();
}

function assertPlayerSafePayload(payload) {
  const text = stringify(payload);
  for (const fragment of [
    'hidden_dc',
    'raw_roll',
    'result_band',
    'branch_id',
    'gm_notes',
    'debug',
    'path_harness',
    'future_supported',
    'combat_routing',
    'stack trace',
    'duplicate key',
    'violates constraint',
  ]) {
    assert.equal(text.includes(fragment), false, `player payload leaked ${fragment}`);
  }
}

test('Stage 6B.15.1 web start lands Greyvale in the canonical playable initial scene', async () => {
  const player = await createPlayer('start');
  const character = await createQuickCharacter(player, 'Entryra');

  const starter = await request('/api/play/starter-adventure', { headers: player.headers });
  assert.equal(starter.response.status, 200);
  assert.equal(starter.body.starter_adventure.world_id, 'greyvale');
  assert.equal(starter.body.starter_adventure.campaign_package_id, 'shadows_grey_road');
  assert.equal(starter.body.starter_adventure.start_scene_key, 'broken-caravan-site');
  assert.equal(starter.body.starter_adventure.start_objective_key, 'witness-the-aftermath');
  assert.equal(starter.body.starter_adventure.route_after_start, '/play/campaign/scene');
  assert.match(starter.body.starter_adventure.intro_title, /Greyvale/i);

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  assert.equal(started.body.route, '/play/campaign/scene');
  assert.equal(started.body.assignment.result_type, 'assigned_new_campaign');
  assert.equal(started.body.current_adventure.world_id, 'greyvale');
  assert.equal(started.body.current_adventure.campaign_package_id, 'shadows_grey_road');
  assert.equal(started.body.current_adventure.current_scene_id, 'broken-caravan-site');
  assert.equal(started.body.current_adventure.current_objective.key, 'witness-the-aftermath');
  assert.equal(started.body.current_adventure.action_status.state, 'action_needed');

  const scene = started.body.current_scene;
  assert.equal(scene.state, 'active');
  assert.equal(scene.scene.key, 'broken-caravan-site');
  assert.equal(scene.current_objective.key, 'witness-the-aftermath');
  assert.equal(scene.action_status.state, 'action_needed');
  assert.ok(scene.action_window?.action_window_id, 'initial action window is present');
  assert.ok(scene.action_window?.is_open_for_player, 'initial action window is open for the player');
  assert.ok(Array.isArray(scene.visible_affordances));
  assert.ok(scene.visible_affordances.length > 0, 'initial scene exposes exploration affordances');
  assertPlayerSafePayload(started.body);

  const openWindows = await openActionWindowCount({
    characterId: character.character_id,
    campaignId: started.body.current_adventure.campaign_instance_id,
  });
  assert.equal(openWindows, 1);
});

test('Stage 6B.15.1 start is idempotent and resume preserves current scene/action state', async () => {
  const player = await createPlayer('resume');
  const character = await createQuickCharacter(player, 'Resumra');

  const first = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(first.response.status, 200);
  const campaignId = first.body.current_adventure.campaign_instance_id;
  const actionWindowId = first.body.current_scene.action_window.action_window_id;

  const repeated = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.assignment.result_type, 'resumed_existing_campaign');
  assert.equal(repeated.body.current_adventure.campaign_instance_id, campaignId);
  assert.equal(repeated.body.current_scene.scene.key, 'broken-caravan-site');
  assert.equal(repeated.body.current_scene.action_window.action_window_id, actionWindowId);

  const preview = await request('/api/play/current-adventure', { headers: player.headers });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.current_adventure.has_active_campaign, true);
  assert.equal(preview.body.current_adventure.current_scene_id, 'broken-caravan-site');
  assert.equal(preview.body.current_adventure.scene_route, '/play/campaign/scene');

  const scene = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(scene.response.status, 200);
  assert.equal(scene.body.state, 'active');
  assert.equal(scene.body.scene.key, 'broken-caravan-site');
  assert.equal(scene.body.action_window.action_window_id, actionWindowId);
  assertPlayerSafePayload(scene.body);

  const openWindows = await openActionWindowCount({
    characterId: character.character_id,
    campaignId,
  });
  assert.equal(openWindows, 1);
});

test('Stage 6B.15.1 start and resume recover safely when no active character exists', async () => {
  const player = await createPlayer('no_character');

  const dashboard = await request('/api/play/dashboard', { headers: player.headers });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.current_adventure.action_status.state, 'no_active_character');
  assert.equal(dashboard.body.next_actions.can_start_adventure, false);

  const preview = await request('/api/play/current-adventure', { headers: player.headers });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.current_adventure.action_status.state, 'no_active_character');

  const scene = await request('/api/play/current-scene', { headers: player.headers });
  assert.equal(scene.response.status, 200);
  assert.equal(scene.body.state, 'no_active_character');
  assert.match(scene.body.action_status.description, /Create or select a character/i);
  assertPlayerSafePayload(scene.body);

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 409);
  assert.match(started.body.error.message, /No active character/i);
  assertPlayerSafePayload(started.body);
});
