import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { query } from '../src/config/db.js';
import app from '../src/app.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { ensureDialogueFocusCommitPersistenceSchema } from '../src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js';
import {
  clearDialogueFocusCommitSceneRegistryForTests,
  registerDialogueFocusCommitSceneForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import { ensureLivingWorldSchema } from '../src/services/livingWorldSchema.js';
import { ensureWebAuthSchema } from '../src/services/playerStateService.js';
import { ensureWebCharacterCreationSchema } from '../src/services/webCharacterCreationService.js';
import {
  cloneFixture,
  validMinimalDialogueScene,
} from './fixtures/dialogue-focus-commit-fixtures.js';

let server;
let baseUrl;

test.before(async () => {
  await ensureWebAuthSchema();
  await ensureLivingWorldSchema();
  await ensureWebCharacterCreationSchema();
  await ensureDialogueFocusCommitPersistenceSchema();
  await importContentPackage(path.resolve(process.cwd(), '../content/worlds/greyvale'));
  await query(
    `
      INSERT INTO dnd5e_npc (key, name, npc_type, disposition)
      VALUES ('elin-harrow', 'Elin Harrow', 'humanoid', 'neutral')
      ON CONFLICT (key) DO NOTHING
    `
  );
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

test.beforeEach(() => {
  clearDialogueFocusCommitSceneRegistryForTests();
  registerDialogueFocusCommitSceneForTests(validMinimalDialogueScene);
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
  return `dialogue_relationship_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createPlayer(label = 'player') {
  const uid = uniqueUid(label);
  const headers = authHeader({
    uid,
    email: `${uid}@example.com`,
    name: `Dialogue Relationship ${label}`,
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

async function createReadyPlayer(label) {
  const player = await createPlayer(label);
  await createQuickCharacter(player, `Dialogue ${label.replaceAll('_', ' ')}`);
  const started = await request('/api/play/start-adventure', {
    method: 'POST',
    headers: player.headers,
  });
  assert.equal(started.response.status, 200);
  return player;
}

async function activeContext(player) {
  const result = await query(
    `
      SELECT
        account.active_character_id AS character_id,
        membership.campaign_id,
        npc.id AS npc_id
      FROM account
      JOIN dnd5e_campaign_character membership
        ON membership.character_id = account.active_character_id
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
      JOIN dnd5e_npc npc ON npc.key = 'elin-harrow'
      WHERE account.id = $1
      ORDER BY membership.is_active_context DESC,
        membership.is_default_solo_campaign DESC,
        membership.id DESC
      LIMIT 1
    `,
    [player.accountId]
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function loadTrust(ctx) {
  const result = await query(
    `
      SELECT value_json
      FROM dnd5e_dialogue_npc_relationship_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND npc_id = $3
        AND field_name = 'trust'
      ORDER BY id DESC
      LIMIT 1
    `,
    [ctx.campaign_id, ctx.character_id, ctx.npc_id]
  );
  return result.rows[0]?.value_json ?? null;
}

async function loadPressure(ctx, sceneKey = 'dialogue_elin_memory_focus_commit') {
  const result = await query(
    `
      SELECT value_json
      FROM dnd5e_dialogue_scene_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND dialogue_scene_key = $3
        AND participant_id = 'npc:elin_harrow'
        AND field_name = 'pressure'
        AND scope = 'dialogue_scene_state'
      ORDER BY id DESC
      LIMIT 1
    `,
    [ctx.campaign_id, ctx.character_id, sceneKey]
  );
  return result.rows[0]?.value_json ?? null;
}

async function relationshipAuditCount(ctx, auditType = 'write') {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_dialogue_relationship_audit_record
      WHERE campaign_id = $1
        AND character_id = $2
        AND audit_type = $3
    `,
    [ctx.campaign_id, ctx.character_id, auditType]
  );
  return Number(result.rows[0]?.count ?? 0);
}

test('Build 5 initializes persistent NPC state separately from scene-local posture', async () => {
  const player = await createReadyPlayer('init');
  const loaded = await request('/api/play/dialogue/current?dialogue_scene_id=dialogue_elin_memory_focus_commit', {
    headers: player.headers,
  });
  assert.equal(loaded.response.status, 200);

  const ctx = await activeContext(player);
  assert.equal(await loadTrust(ctx), 0);
  assert.equal(await loadPressure(ctx), 0);

  await query(
    `
      UPDATE dnd5e_dialogue_npc_relationship_state
      SET value_json = '2'::jsonb
      WHERE campaign_id = $1
        AND character_id = $2
        AND npc_id = $3
        AND field_name = 'trust'
    `,
    [ctx.campaign_id, ctx.character_id, ctx.npc_id]
  );

  const reloaded = await request('/api/play/dialogue/current?dialogue_scene_id=dialogue_elin_memory_focus_commit', {
    headers: player.headers,
  });
  assert.equal(reloaded.response.status, 200);
  assert.equal(await loadTrust(ctx), 2);
  assert.equal(await loadPressure(ctx), 0);
});

test('Build 5 committed social move applies persistent relationship write and audit safely', async () => {
  const player = await createReadyPlayer('persistent_write');
  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      move_id: 'move_listen_without_pressing',
      submitted_text: 'I listen without pressing.',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.status, 'resolved');
  assert.equal(submitted.body.social_move_result.relationship_updates.length, 1);
  assert.equal(JSON.stringify(submitted.body).includes('old_value_json'), false);
  assert.equal(JSON.stringify(submitted.body).includes('new_value_json'), false);

  const ctx = await activeContext(player);
  assert.equal(await loadTrust(ctx), 1);
  assert.ok((await relationshipAuditCount(ctx, 'write')) >= 1);
});

test('Build 5 checked social move failure applies scene-local relationship write', async () => {
  const player = await createReadyPlayer('scene_write');
  const submitted = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      move_id: 'move_press_shrine_gently',
      submitted_text: 'I press gently about the shrine.',
      forced_outcome: 'failure',
    }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.social_move_result.branch, 'failure');

  const ctx = await activeContext(player);
  assert.equal(await loadTrust(ctx), 0);
  assert.equal(await loadPressure(ctx), 1);
  assert.ok((await relationshipAuditCount(ctx, 'write')) >= 1);
});

test('Build 5 Clarifying Question and exit can apply authored relationship writes', async () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.id = 'dialogue_relationship_question_exit';
  scene.slug = 'dialogue-relationship-question-exit';
  scene.clarifying_questions[0].result.relationship_writes = [
    {
      scope: 'dialogue_scene_state',
      field: 'pressure',
      operation: 'increment',
      value: 1,
      visibility: 'gm_only',
      reason: 'The memory question raises the immediate pressure.',
    },
  ];
  scene.dialogue_exits[0].behavior.relationship_writes = [
    {
      scope: 'dialogue_scene_state',
      field: 'pressure',
      operation: 'decrement',
      value: 1,
      visibility: 'gm_only',
      reason: 'Letting the conversation rest lowers pressure.',
    },
  ];
  registerDialogueFocusCommitSceneForTests(scene);

  const player = await createReadyPlayer('question_exit');
  const clarified = await request('/api/play/dialogue/clarifying-question/resolve', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_relationship_question_exit',
      question_id: 'clarify_first_memory',
    }),
  });
  assert.equal(clarified.response.status, 200);
  const ctx = await activeContext(player);
  assert.equal(await loadPressure(ctx, 'dialogue_relationship_question_exit'), 1);

  const exited = await request('/api/play/dialogue/exit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_relationship_question_exit',
      exit_id: 'exit_return_to_inn',
    }),
  });
  assert.equal(exited.response.status, 200);
  assert.equal(await loadPressure(ctx, 'dialogue_relationship_question_exit'), 0);
});

test('Build 5 relationship reads gate move availability and update after authored writes', async () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.id = 'dialogue_relationship_gate';
  scene.slug = 'dialogue-relationship-gate';
  scene.committed_social_moves.push({
    move_id: 'move_trust_gate',
    label: 'Ask for the part she only tells trusted allies',
    social_move_type: 'ask',
    target_id: 'npc:elin_harrow',
    consumes_dialogue_beat: true,
    requires_check: false,
    preview: {
      text: 'You will spend the beat asking for the trusted part of the memory.',
    },
    relationship_reads: [
      {
        scope: 'persistent_npc_state',
        target_id: 'npc:elin_harrow',
        field: 'trust',
        operator: 'gte',
        value: 1,
      },
    ],
    no_check_result: {
      text: 'She trusts you enough to continue, but this test fixture stops there.',
    },
  });
  registerDialogueFocusCommitSceneForTests(scene);

  const player = await createReadyPlayer('gate');
  const before = await request('/api/play/dialogue/current?dialogue_scene_id=dialogue_relationship_gate', {
    headers: player.headers,
  });
  assert.equal(before.response.status, 200);
  const gatedBefore = before.body.committed_social_moves.find((move) => move.move_id === 'move_trust_gate');
  assert.equal(gatedBefore.is_available, false);
  assert.equal(gatedBefore.status, 'locked');

  const listen = await request('/api/play/dialogue/social-move/submit', {
    method: 'POST',
    headers: player.headers,
    body: JSON.stringify({
      dialogue_scene_id: 'dialogue_relationship_gate',
      move_id: 'move_listen_without_pressing',
      submitted_text: 'I listen without pressing.',
    }),
  });
  assert.equal(listen.response.status, 200);

  const after = await request('/api/play/dialogue/current?dialogue_scene_id=dialogue_relationship_gate', {
    headers: player.headers,
  });
  assert.equal(after.response.status, 200);
  const gatedAfter = after.body.committed_social_moves.find((move) => move.move_id === 'move_trust_gate');
  assert.equal(gatedAfter.is_available, true);
  assert.equal(gatedAfter.status, 'available');
});
