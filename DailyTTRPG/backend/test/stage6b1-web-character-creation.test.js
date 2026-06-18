import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
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
  return `stage6b1_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Stage 6B1 ${label}`,
  });
  const me = await request('/api/me', { headers });
  assert.equal(me.response.status, 200);
  return { uid, headers, accountId: Number(me.body.account.account_id) };
}

test('Stage 6B.1 character creation options require auth and expose supported MVP choices', async () => {
  const missing = await request('/api/play/character-creation/options');
  assert.equal(missing.response.status, 401);

  const player = await createPlayer('options');
  const options = await request('/api/play/character-creation/options', {
    headers: player.headers,
  });
  assert.equal(options.response.status, 200);
  assert.deepEqual(
    options.body.creation_modes.map((mode) => mode.id),
    ['quick_start', 'guided', 'detailed']
  );
  assert.ok(options.body.species.some((entry) => entry.slug === 'human'));
  assert.ok(options.body.classes.some((entry) => entry.slug === 'fighter' && entry.supported_in_creation === true));
  assert.ok(options.body.backgrounds.some((entry) => entry.slug === 'soldier'));
  assert.ok(options.body.traits.some((entry) => entry.id === 'brave'));
  assert.deepEqual(options.body.standard_array, [15, 14, 13, 12, 10, 8]);
  assert.ok(options.body.archetypes.every((entry) => entry.class_id && entry.species_id));
  assert.equal(options.body.defaults_policy.equipment, 'recommended_defaults');
});

test('Stage 6B.1 draft persistence is account-owned, resumable, and not an active character', async () => {
  const player = await createPlayer('draft_owner');
  const other = await createPlayer('draft_other');

  const created = await request('/api/play/character-creation/draft', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'guided',
      current_step: 'name',
      draft: {
        mode: 'guided',
        name: 'Drafta',
      },
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.draft.mode, 'guided');
  assert.equal(created.body.draft.draft.name, 'Drafta');

  const draftId = created.body.draft.draft_id;
  const patched = await request(`/api/play/character-creation/draft/${draftId}`, {
    method: 'PATCH',
    headers: player.headers,
    body: JSON.stringify({
      current_step: 'species',
      draft: {
        species_slug: 'human',
      },
    }),
  });
  assert.equal(patched.response.status, 200);
  assert.equal(patched.body.draft.current_step, 'species');
  assert.equal(patched.body.draft.draft.name, 'Drafta');
  assert.equal(patched.body.draft.draft.species_slug, 'human');

  const resumed = await request('/api/play/character-creation/draft', { headers: player.headers });
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.body.draft.draft_id, draftId);

  const otherPatch = await request(`/api/play/character-creation/draft/${draftId}`, {
    method: 'PATCH',
    headers: other.headers,
    body: JSON.stringify({ draft: { name: 'Nope' } }),
  });
  assert.equal(otherPatch.response.status, 404);

  const activeCharacters = await query(
    'SELECT COUNT(*)::int AS count FROM dnd5e_character WHERE account_id = $1',
    [player.accountId]
  );
  assert.equal(activeCharacters.rows[0].count, 0);

  const abandoned = await request(`/api/play/character-creation/draft/${draftId}`, {
    method: 'DELETE',
    headers: player.headers,
  });
  assert.equal(abandoned.response.status, 200);
  assert.equal(abandoned.body.draft.status, 'abandoned');
});

test('Stage 6B.1 Quick Start creates a real first active dnd5e_character without phone or campaign assignment', async () => {
  const player = await createPlayer('quick');
  const created = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      name: 'Webrick',
      archetype_id: 'stalwart_fighter',
    }),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.character.name, 'Webrick');
  assert.equal(created.body.character.status, 'active');
  assert.equal(created.body.character.is_active_character, true);
  assert.equal(created.body.active_character_changed, true);
  assert.equal(created.body.next_actions.can_start_adventure, true);

  const characterId = Number(created.body.character.character_id);
  const persisted = await query(
    `
      SELECT
        account.phone_number,
        account.active_character_id,
        character.status,
        character.created_via_web,
        character.created_via_sms,
        character.is_active,
        class.slug AS class_slug,
        race.slug AS race_slug
      FROM dnd5e_character character
      JOIN account ON account.id = character.account_id
      JOIN dnd5e_class class ON class.id = character.class_id
      JOIN dnd5e_race race ON race.id = character.race_id
      WHERE character.id = $1
        AND character.account_id = $2
    `,
    [characterId, player.accountId]
  );
  assert.equal(persisted.rowCount, 1);
  assert.equal(String(persisted.rows[0].active_character_id), String(characterId));
  assert.equal(persisted.rows[0].phone_number, null);
  assert.equal(persisted.rows[0].status, 'active');
  assert.equal(persisted.rows[0].created_via_web, true);
  assert.equal(persisted.rows[0].created_via_sms, false);
  assert.equal(persisted.rows[0].is_active, true);
  assert.equal(persisted.rows[0].class_slug, 'fighter');
  assert.equal(persisted.rows[0].race_slug, 'human');

  const classRows = await query('SELECT class_level, is_primary FROM dnd5e_character_class WHERE character_id = $1', [
    characterId,
  ]);
  assert.equal(classRows.rowCount, 1);
  assert.equal(Number(classRows.rows[0].class_level), 1);
  assert.equal(classRows.rows[0].is_primary, true);

  const itemRows = await query('SELECT COUNT(*)::int AS count FROM dnd5e_character_item WHERE character_id = $1', [
    characterId,
  ]);
  assert.ok(itemRows.rows[0].count > 0);

  const campaignRows = await query(
    'SELECT COUNT(*)::int AS count FROM dnd5e_campaign_character WHERE character_id = $1',
    [characterId]
  );
  assert.equal(campaignRows.rows[0].count, 0);
});

test('Stage 6B.1 Guided and Detailed creation validate choices and do not overwrite an existing active character', async () => {
  const player = await createPlayer('multi');
  const first = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      name: 'Firsta',
      archetype_id: 'stalwart_fighter',
    }),
  });
  assert.equal(first.response.status, 201);
  const firstId = first.body.character.character_id;

  const invalidDetailed = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'detailed',
      name: 'Brokena',
      species_slug: 'human',
      class_slug: 'fighter',
      background_slug: 'soldier',
      trait_id: 'brave',
      ability_scores: {
        strength: 15,
        dexterity: 15,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
    }),
  });
  assert.equal(invalidDetailed.response.status, 400);
  assert.match(invalidDetailed.body.error.message, /Standard Array/i);

  const guided = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'guided',
      name: 'Guidara',
      species_slug: 'human',
      class_slug: 'rogue',
      attribute_preset_id: 'quick_precise',
      background_slug: 'criminal',
      trait_id: 'curious',
    }),
  });
  assert.equal(guided.response.status, 201);
  assert.equal(guided.body.character.is_active_character, false);
  assert.equal(guided.body.active_character_changed, false);
  assert.equal(guided.body.next_actions.can_set_active, true);

  const detailed = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'detailed',
      name: 'Detaila',
      species_slug: 'human',
      class_slug: 'wizard',
      background_slug: 'sage',
      trait_id: 'cautious',
      ability_scores: {
        strength: 8,
        dexterity: 14,
        constitution: 13,
        intelligence: 15,
        wisdom: 12,
        charisma: 10,
      },
    }),
  });
  assert.equal(detailed.response.status, 201);
  assert.equal(detailed.body.character.is_active_character, false);
  assert.equal(detailed.body.character.ability_scores.intelligence, 16);

  const accountAfter = await query('SELECT active_character_id FROM account WHERE id = $1', [player.accountId]);
  assert.equal(String(accountAfter.rows[0].active_character_id), String(firstId));

  const spellRows = await query('SELECT COUNT(*)::int AS count FROM dnd5e_character_spell WHERE character_id = $1', [
    Number(detailed.body.character.character_id),
  ]);
  assert.ok(spellRows.rows[0].count > 0);

  const setActive = await request(`/api/play/characters/${detailed.body.character.character_id}/set-active`, {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(setActive.response.status, 200);
  assert.equal(setActive.body.active_character.character_id, detailed.body.character.character_id);
});

test('Stage 6B.1 completed draft marks completed and Start Adventure uses configurable starter assignment', async () => {
  const player = await createPlayer('draft_complete');
  const draft = await request('/api/play/character-creation/draft', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      mode: 'quick_start',
      current_step: 'review',
      draft: {
        mode: 'quick_start',
        name: 'Adventra',
        archetype_id: 'stalwart_fighter',
      },
    }),
  });
  assert.equal(draft.response.status, 201);

  const created = await request('/api/play/characters', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      draft_id: draft.body.draft.draft_id,
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.next_actions.can_start_adventure, true);

  const draftRows = await query('SELECT status, completed_at FROM dnd5e_character_creation_draft WHERE id = $1', [
    Number(draft.body.draft.draft_id),
  ]);
  assert.equal(draftRows.rows[0].status, 'completed');
  assert.ok(draftRows.rows[0].completed_at);

  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  assert.ok(['assigned_new_campaign', 'resumed_existing_campaign'].includes(started.body.assignment.result_type));
  assert.equal(started.body.player_state.current_campaign.world_slug, 'greyvale');

  const repeated = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.assignment.result_type, 'resumed_existing_campaign');
});
