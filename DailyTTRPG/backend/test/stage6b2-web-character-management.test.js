import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { grantKnowledge } from '../src/services/characterKnowledgeService.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';
import { getCampaignWorldInstance } from '../src/services/worldStateService.js';

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
  return `stage6b2_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B2 ${label}`,
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

async function createSubmittedProgressionWindow(characterId) {
  const campaignResult = await query(
    `
      SELECT campaign.id AS campaign_id, campaign.world_id, membership.current_scene_id
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      WHERE membership.character_id = $1
        AND membership.is_active = TRUE
        AND membership.membership_status = 'active'
      ORDER BY membership.id DESC
      LIMIT 1
    `,
    [characterId]
  );
  assert.equal(campaignResult.rowCount, 1);
  const campaign = campaignResult.rows[0];
  const windowResult = await query(
    `
      INSERT INTO dnd5e_progression_window (
        world_id,
        campaign_id,
        scene_id,
        window_key,
        scope_type,
        status,
        prompt_text,
        threshold_at
      )
      VALUES ($1, $2, $3, $4, 'solo', 'open', 'Choose your next move.', NOW() + INTERVAL '1 hour')
      RETURNING id
    `,
    [
      campaign.world_id,
      campaign.campaign_id,
      campaign.current_scene_id,
      `stage6b2_pending_${characterId}_${Date.now()}`,
    ]
  );
  const windowId = Number(windowResult.rows[0].id);
  await query(
    `
      INSERT INTO dnd5e_progression_window_participant (
        progression_window_id,
        campaign_id,
        character_id,
        participant_status,
        responded_at
      )
      VALUES ($1, $2, $3, 'responded', NOW())
    `,
    [windowId, campaign.campaign_id, characterId]
  );
  await query(
    `
      INSERT INTO dnd5e_progression_window_response (
        progression_window_id,
        character_id,
        actor_account_id,
        response_key,
        response_payload_json,
        response_summary
      )
      VALUES ($1, $2, NULL, 'inspect', '{}'::jsonb, 'Inspect the caravan')
    `,
    [windowId, characterId]
  );
  return windowId;
}

test('Stage 6B.2 character list requires auth, returns only owned characters, and includes pending/adventure status', async () => {
  const missing = await request('/api/play/characters');
  assert.equal(missing.response.status, 401);

  const player = await createPlayer('list_owner');
  const other = await createPlayer('list_other');
  const first = await createQuickCharacter(player, 'Lista');
  await createQuickCharacter(player, 'Listb', 'clever_rogue');
  await createQuickCharacter(other, 'Othera');

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  const windowId = await createSubmittedProgressionWindow(Number(first.character_id));

  const listed = await request('/api/play/characters', { headers: player.headers });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.characters.length, 2);
  assert.ok(listed.body.characters.every((character) => character.name !== 'Othera'));
  assert.equal(listed.body.active_character_id, first.character_id);

  const active = listed.body.characters.find((character) => character.character_id === first.character_id);
  assert.equal(active.is_active_character, true);
  assert.equal(active.current_campaign.world_slug, 'greyvale');
  assert.equal(active.pending_action.has_pending_unresolved_action, true);
  assert.equal(active.pending_action.progression_window_id, String(windowId));
});

test('Stage 6B.2 practical character sheet is owned, real, and knowledge-safe', async () => {
  const player = await createPlayer('sheet_owner');
  const other = await createPlayer('sheet_other');
  const character = await createQuickCharacter(player, 'Sheeta', 'clever_rogue');
  const otherCharacter = await createQuickCharacter(other, 'Other Sheet');

  const forbidden = await request(`/api/play/characters/${otherCharacter.character_id}`, { headers: player.headers });
  assert.equal(forbidden.response.status, 404);

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);

  const campaignResult = await query(
    `
      SELECT campaign.id AS campaign_id, campaign.world_instance_id
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      WHERE membership.character_id = $1
      LIMIT 1
    `,
    [Number(character.character_id)]
  );
  assert.equal(campaignResult.rowCount, 1);
  const worldInstance = await getCampaignWorldInstance(Number(campaignResult.rows[0].campaign_id));

  await grantKnowledge({
    characterId: Number(character.character_id),
    campaignId: Number(campaignResult.rows[0].campaign_id),
    worldInstanceId: worldInstance.id,
    knowledgeId: 'stage6b2_private_clue',
    fallback: {
      type: 'clue',
      title: 'A private clue',
      summary: 'Only Sheeta knows the caravan clue.',
    },
  });

  const sheet = await request(`/api/play/characters/${character.character_id}`, { headers: player.headers });
  assert.equal(sheet.response.status, 200);
  assert.equal(sheet.body.character.name, 'Sheeta');
  assert.equal(sheet.body.ability_scores.dex.score > 0, true);
  assert.equal(sheet.body.combat.armor_class > 0, true);
  assert.ok(Array.isArray(sheet.body.features));
  assert.ok(Array.isArray(sheet.body.proficiencies.skills));
  assert.ok(Array.isArray(sheet.body.equipment.items));
  assert.equal(sheet.body.spells.is_spellcaster, false);
  assert.equal(sheet.body.current_adventure.world_slug, 'greyvale');
  assert.equal(sheet.body.knowledge_preview.known_clue_count, 1);
  assert.match(sheet.body.knowledge_preview.recent_known_facts[0].text, /Only Sheeta/);
  assert.equal(sheet.body.limitations.full_detailed_sheet_deferred_to, '6B.2D');
  assert.equal(sheet.body.limitations.full_knowledge_history_deferred_to, '6B.6');
});

test('Stage 6B.2 active switching is explicit and preserves pending action/campaign state', async () => {
  const player = await createPlayer('switch');
  const first = await createQuickCharacter(player, 'Switcha');
  const second = await createQuickCharacter(player, 'Switchb', 'clever_rogue');

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  const windowId = await createSubmittedProgressionWindow(Number(first.character_id));

  const switched = await request('/api/play/active-character', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({ character_id: second.character_id }),
  });
  assert.equal(switched.response.status, 200);
  assert.equal(switched.body.active_character_id, second.character_id);
  assert.equal(switched.body.previous_active_character_id, first.character_id);
  assert.equal(switched.body.previous_active_pending_action.had_pending_unresolved_action, true);
  assert.equal(switched.body.previous_active_pending_action.action_window_id, String(windowId));

  const accountAfter = await query('SELECT active_character_id FROM account WHERE id = $1', [player.accountId]);
  assert.equal(String(accountAfter.rows[0].active_character_id), second.character_id);

  const pendingStillExists = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_progression_window_response
      WHERE progression_window_id = $1
        AND character_id = $2
    `,
    [windowId, Number(first.character_id)]
  );
  assert.equal(pendingStillExists.rows[0].count, 1);

  const memberships = await query(
    'SELECT COUNT(*)::int AS count FROM dnd5e_campaign_character WHERE character_id = $1',
    [Number(first.character_id)]
  );
  assert.equal(memberships.rows[0].count, 1);
});
