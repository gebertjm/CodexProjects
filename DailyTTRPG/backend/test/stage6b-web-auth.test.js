import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
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

test('Stage 6B.0 /api/me rejects missing and invalid Firebase tokens', async () => {
  const missing = await request('/api/me');
  assert.equal(missing.response.status, 401);
  assert.match(missing.body.error.message, /bearer token/i);

  const invalid = await request('/api/me', {
    headers: {
      Authorization: `Bearer ${firebaseToken({ email: 'missing-uid@example.com' })}`,
    },
  });
  assert.equal(invalid.response.status, 401);
  assert.match(invalid.body.error.message, /uid/i);
});

test('Stage 6B.0 /api/me auto-creates a Firebase-backed account without requiring a phone number', async () => {
  const uid = `stage6b_uid_${Date.now()}`;
  const first = await request('/api/me', {
    headers: authHeader({
      uid,
      email: `${uid}@example.com`,
      name: 'Stage Sixbee',
      picture: 'https://example.com/sixbee.png',
      email_verified: true,
    }),
  });

  assert.equal(first.response.status, 200);
  assert.equal(first.body.account.firebase_uid, uid);
  assert.equal(first.body.account.email, `${uid}@example.com`);
  assert.equal(first.body.account.display_name, 'Stage Sixbee');
  assert.equal(first.body.account.photo_url, 'https://example.com/sixbee.png');
  assert.equal(first.body.account.sms_enabled, false);
  assert.equal(first.body.account.sms_mode, 'disabled');
  assert.equal(first.body.active_character, null);
  assert.deepEqual(first.body.characters, []);
  assert.equal(first.body.current_campaign, null);
  assert.equal(first.body.action_required, false);

  const accountRows = await query('SELECT id, phone_number, firebase_uid, sms_enabled, sms_mode FROM account WHERE firebase_uid = $1', [uid]);
  assert.equal(accountRows.rowCount, 1);
  assert.equal(accountRows.rows[0].phone_number, null);
  assert.equal(accountRows.rows[0].sms_enabled, false);
  assert.equal(accountRows.rows[0].sms_mode, 'disabled');

  const second = await request('/api/me', {
    headers: authHeader({
      uid,
      email: `${uid}@example.com`,
      name: 'Stage Sixbee',
    }),
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.account.account_id, first.body.account.account_id);

  const duplicateCheck = await query('SELECT COUNT(*)::int AS count FROM account WHERE firebase_uid = $1', [uid]);
  assert.equal(duplicateCheck.rows[0].count, 1);
});

test('Stage 6B.0 /api/me returns real active character and campaign summary when available', async () => {
  const uid = `stage6b_state_${Date.now()}`;
  const me = await request('/api/me', {
    headers: authHeader({
      uid,
      email: `${uid}@example.com`,
      name: 'Campaign Tester',
    }),
  });
  assert.equal(me.response.status, 200);
  const accountId = Number(me.body.account.account_id);

  const lookup = await query(
    `
      SELECT
        (SELECT id FROM dnd5e_world WHERE slug IN ('greyvale', 'daily-rpg-prime') ORDER BY slug = 'greyvale' DESC LIMIT 1) AS world_id,
        (SELECT id FROM dnd5e_race WHERE slug = 'human' LIMIT 1) AS race_id,
        (SELECT id FROM dnd5e_class WHERE slug = 'fighter' LIMIT 1) AS class_id,
        (SELECT id FROM dnd5e_background LIMIT 1) AS background_id,
        (SELECT id FROM dnd5e_scene WHERE key = 'broken-caravan-site' LIMIT 1) AS scene_id
    `
  );
  const ids = lookup.rows[0];
  assert.ok(ids.world_id);
  assert.ok(ids.race_id);
  assert.ok(ids.class_id);
  assert.ok(ids.scene_id);

  const character = await query(
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
      VALUES ($1, $2, 'Web Aric', $3, $4, $5, 2, 'active', TRUE)
      RETURNING id
    `,
    [accountId, ids.world_id, ids.race_id, ids.class_id, ids.background_id]
  );
  const characterId = Number(character.rows[0].id);

  await query('UPDATE account SET active_character_id = $2 WHERE id = $1', [accountId, characterId]);

  const campaign = await query(
    `
      INSERT INTO dnd5e_campaign (world_id, name, slug, campaign_type, status, created_by_account_id, is_active)
      VALUES ($1, 'Web Test Campaign', $2, 'solo', 'active', $3, TRUE)
      RETURNING id
    `,
    [ids.world_id, `stage-6b-web-${uid}`, accountId]
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
        is_default_solo_campaign,
        joined_at,
        current_scene_id
      )
      VALUES ($1, $2, $3, TRUE, 'active', TRUE, TRUE, NOW(), $4)
    `,
    [campaignId, characterId, accountId, ids.scene_id]
  );

  const state = await request('/api/me', {
    headers: authHeader({
      uid,
      email: `${uid}@example.com`,
      name: 'Campaign Tester',
    }),
  });

  assert.equal(state.response.status, 200);
  assert.equal(state.body.active_character.character_id, String(characterId));
  assert.equal(state.body.active_character.name, 'Web Aric');
  assert.equal(state.body.active_character.level, 2);
  assert.equal(state.body.active_character.class, 'Fighter');
  assert.equal(state.body.active_character.species, 'Human');
  assert.equal(state.body.characters.length >= 1, true);
  assert.equal(state.body.current_campaign.campaign_instance_id, String(campaignId));
  assert.equal(state.body.current_campaign.campaign_name, 'Web Test Campaign');
  assert.ok(state.body.current_campaign.current_scene.scene_id);
  assert.equal(state.body.action_required, true);
});

test('Stage 6B.0 /api/me child endpoints use the same authenticated player state', async () => {
  const uid = `stage6b_routes_${Date.now()}`;
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: 'Route Tester',
  });

  const me = await request('/api/me', { headers });
  assert.equal(me.response.status, 200);

  const characters = await request('/api/me/characters', { headers });
  assert.equal(characters.response.status, 200);
  assert.deepEqual(characters.body.characters, []);

  const active = await request('/api/me/active-character', { headers });
  assert.equal(active.response.status, 200);
  assert.equal(active.body.active_character, null);

  const campaign = await request('/api/me/current-campaign', { headers });
  assert.equal(campaign.response.status, 200);
  assert.equal(campaign.body.current_campaign, null);
  assert.equal(campaign.body.action_required, false);
});
