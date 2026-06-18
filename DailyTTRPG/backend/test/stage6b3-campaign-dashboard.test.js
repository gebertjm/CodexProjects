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
  return `stage6b3_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B3 ${label}`,
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

async function activeMembershipCount(characterId) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      WHERE membership.character_id = $1
        AND membership.is_active = TRUE
        AND membership.membership_status = 'active'
        AND campaign.is_active = TRUE
    `,
    [Number(characterId)]
  );
  return result.rows[0].count;
}

test('Stage 6B.3 dashboard endpoints require auth and show the no-character state', async () => {
  const missingDashboard = await request('/api/play/dashboard');
  assert.equal(missingDashboard.response.status, 401);

  const missingAdventure = await request('/api/play/current-adventure');
  assert.equal(missingAdventure.response.status, 401);

  const player = await createPlayer('empty');
  const dashboard = await request('/api/play/dashboard', { headers: player.headers });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.account.display_name, 'Stage 6B3 empty');
  assert.equal(dashboard.body.active_character, null);
  assert.equal(dashboard.body.characters_summary.count, 0);
  assert.equal(dashboard.body.next_actions.can_create_character, true);
  assert.equal(dashboard.body.next_actions.can_start_adventure, false);
  assert.equal(dashboard.body.current_adventure.has_active_campaign, false);
  assert.equal(dashboard.body.current_adventure.action_status.state, 'no_active_character');
  assert.equal(dashboard.body.account.sms_enabled, false);
});

test('Stage 6B.3 starter config is backend-provided and dashboard waits for Begin Adventure', async () => {
  const player = await createPlayer('starter');
  const character = await createQuickCharacter(player, 'Dashra');

  const starter = await request('/api/play/starter-adventure', { headers: player.headers });
  assert.equal(starter.response.status, 200);
  assert.equal(starter.body.starter_adventure.world_id, 'greyvale');
  assert.equal(starter.body.starter_adventure.campaign_package_id, 'shadows_grey_road');
  assert.equal(starter.body.starter_adventure.campaign_name, 'Shadows on the Grey Road');
  assert.equal(starter.body.starter_adventure.route_after_start, '/play/campaign/scene');
  assert.match(starter.body.starter_adventure.intro_text, /Greyvale/i);

  const dashboard = await request('/api/play/dashboard', { headers: player.headers });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.active_character.character_id, character.character_id);
  assert.equal(dashboard.body.current_adventure.has_active_campaign, false);
  assert.equal(dashboard.body.current_adventure.action_status.state, 'ready_to_start');
  assert.equal(dashboard.body.next_actions.can_start_adventure, true);

  const membershipsBeforeBegin = await activeMembershipCount(character.character_id);
  assert.equal(membershipsBeforeBegin, 0);
});

test('Stage 6B.3 Begin Adventure starts the configured campaign idempotently and returns real preview data', async () => {
  const player = await createPlayer('begin');
  const character = await createQuickCharacter(player, 'Beginra');

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  assert.ok(['assigned_new_campaign', 'resumed_existing_campaign'].includes(started.body.assignment.result_type));
  assert.equal(started.body.route, '/play/campaign/scene');
  assert.equal(started.body.current_adventure.has_active_campaign, true);
  assert.equal(started.body.current_adventure.world_id, 'greyvale');
  assert.equal(started.body.current_adventure.campaign_package_id, 'shadows_grey_road');
  assert.match(started.body.current_adventure.current_location_name, /Broken Caravan/i);
  assert.ok(started.body.current_adventure.current_scene_title);
  assert.ok(started.body.current_adventure.current_objective?.title);
  assert.ok(started.body.current_adventure.action_status.state);
  assert.ok(Array.isArray(started.body.current_adventure.visible_npc_preview));
  assert.equal(started.body.current_scene.state, 'active');
  assert.equal(started.body.current_scene.scene.key, 'broken-caravan-site');
  assert.ok(started.body.current_scene.action_window?.action_window_id);

  const countAfterStart = await activeMembershipCount(character.character_id);
  assert.equal(countAfterStart, 1);

  const repeated = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.assignment.result_type, 'resumed_existing_campaign');
  const countAfterRepeatedStart = await activeMembershipCount(character.character_id);
  assert.equal(countAfterRepeatedStart, 1);

  const preview = await request('/api/play/current-adventure', { headers: player.headers });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.current_adventure.has_active_campaign, true);
  assert.equal(preview.body.current_adventure.preview_route, '/play/campaign');
  assert.equal(preview.body.current_adventure.full_scene_view_deferred_to, '6B.4');
  assert.ok(preview.body.current_adventure.environment === null || preview.body.current_adventure.environment.summary !== undefined);
  assert.ok(Array.isArray(preview.body.current_adventure.visible_npc_preview));
});

test('Stage 6B.3 Start Adventure rejects missing, draft, inactive, or unowned character state safely', async () => {
  const player = await createPlayer('safe');
  const other = await createPlayer('other');
  const otherCharacter = await createQuickCharacter(other, 'Otherbegin');

  const noCharacter = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(noCharacter.response.status, 409);

  const unowned = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({ character_id: otherCharacter.character_id }),
  });
  assert.equal(unowned.response.status, 409);

  const draft = await request('/api/play/character-creation/draft', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      current_step: 'review',
      draft: { name: 'Draft Only', archetype_id: 'stalwart_fighter' },
    }),
  });
  assert.equal(draft.response.status, 201);

  const dashboard = await request('/api/play/dashboard', { headers: player.headers });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.next_actions.can_resume_draft, true);
  assert.equal(dashboard.body.next_actions.can_start_adventure, false);
});
