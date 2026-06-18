import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { resetSmsMessageStoreForTests } from '../src/sms/smsMessageStore.js';

let server;
let baseUrl;
let phoneCounter = 8500;

test.before(async () => {
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
  resetSmsMessageStoreForTests();
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

function nextPhone() {
  phoneCounter += 1;
  return `+1555085${String(phoneCounter).slice(-4)}`;
}

async function createFreshSession() {
  const phone = nextPhone();
  const created = await request('/api/dev/sms-simulator/create-fresh-session', {
    method: 'POST',
    body: JSON.stringify({
      phone_number: phone,
      user_id: `sms_e2e_${phoneCounter}`,
    }),
  });

  assert.equal(created.response.status, 200);
  assert.equal(created.body.reset_database_state, true);
  assert.ok(created.body.session.session_id);
  return created.body.session;
}

async function createResumeSession(phone) {
  const created = await request('/api/dev/sms-simulator/session', {
    method: 'POST',
    body: JSON.stringify({
      phone_number: phone,
      user_id: `sms_e2e_resume_${phoneCounter}`,
      active_sms_character_id: null,
      active_sms_character_name: 'Adventurer',
      campaign_id: null,
      state: {
        active_thread: 'onboarding',
        onboarding_state: 'awaiting_start',
      },
    }),
  });

  assert.equal(created.response.status, 200);
  return created.body.session;
}

async function inbound(sessionId, message) {
  const result = await request('/api/dev/sms-simulator/inbound', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      message,
    }),
  });

  assert.equal(result.response.status, 200);
  return result.body;
}

async function persistence(sessionId) {
  const result = await request(`/api/dev/sms-simulator/persistence/${sessionId}`);
  assert.equal(result.response.status, 200);
  return result.body;
}

async function messages(sessionId) {
  const result = await request(`/api/dev/sms-simulator/messages/${sessionId}`);
  assert.equal(result.response.status, 200);
  return result.body.messages ?? [];
}

async function completeQuickStart(sessionId, name = 'Aric') {
  assert.equal((await inbound(sessionId, 'hello')).outbound_message.template_id, 'onboarding.welcome');
  assert.equal((await inbound(sessionId, 'START')).outbound_message.template_id, 'onboarding.intro');
  assert.equal((await inbound(sessionId, 'continue')).outbound_message.template_id, 'character.mode_select');
  assert.equal((await inbound(sessionId, '1')).outbound_message.template_id, 'character.name_prompt');
  assert.equal((await inbound(sessionId, name)).outbound_message.template_id, 'character.race_prompt');
  assert.equal((await inbound(sessionId, 'Human')).outbound_message.template_id, 'character.class_prompt');
  assert.equal((await inbound(sessionId, 'Fighter')).outbound_message.template_id, 'character.confirm_summary');
  const created = await inbound(sessionId, '1');
  assert.equal(created.outbound_message.template_id, 'character.created');
  assert.deepEqual(
    created.outbound_messages.map((message) => message.template_id),
    ['character.created', 'intro.world_entry', 'intro.first_prompt']
  );
  return created;
}

async function completeGuided(sessionId, name = 'Mira') {
  assert.equal((await inbound(sessionId, 'hello')).outbound_message.template_id, 'onboarding.welcome');
  assert.equal((await inbound(sessionId, 'START')).outbound_message.template_id, 'onboarding.intro');
  assert.equal((await inbound(sessionId, 'continue')).outbound_message.template_id, 'character.mode_select');
  assert.equal((await inbound(sessionId, '2')).outbound_message.template_id, 'character.name_prompt');
  assert.equal((await inbound(sessionId, name)).outbound_message.template_id, 'character.race_prompt');
  assert.equal((await inbound(sessionId, 'Elf')).outbound_message.template_id, 'character.subrace_prompt');
  assert.equal((await inbound(sessionId, 'Wood Elf')).outbound_message.template_id, 'character.class_prompt');
  assert.equal((await inbound(sessionId, 'Rogue')).outbound_message.template_id, 'character.attribute_prompt');
  assert.equal((await inbound(sessionId, '2')).outbound_message.template_id, 'character.background_prompt');
  assert.equal((await inbound(sessionId, 'Scholar')).outbound_message.template_id, 'character.trait_prompt');
  assert.equal((await inbound(sessionId, 'Curious')).outbound_message.template_id, 'character.confirm_summary');
  const created = await inbound(sessionId, 'Confirm');
  assert.equal(created.outbound_message.template_id, 'character.created');
  return created;
}

function assertThreadIsTemplateRendered(thread) {
  for (const message of thread) {
    if (message.direction === 'outbound') {
      assert.ok(message.template_id, 'all outbound SMS uses a registered template');
      assert.doesNotMatch(
        message.rendered_text,
        /Action resolved|story moves forward|campaign_id|character_id|debug|whispering presence/i
      );
    }
  }
}

test('Stage 6A.5 Quick Start e2e creates persisted player state and resolves a real Greyvale beat', async () => {
  const session = await createFreshSession();

  await completeQuickStart(session.session_id, 'Aric');
  let persisted = await persistence(session.session_id);

  assert.equal(persisted.session.exists, true);
  assert.equal(persisted.account.exists, true);
  assert.equal(persisted.account.onboarding_state, 'active_play');
  assert.equal(persisted.phone_mapping.exists, true);
  assert.equal(persisted.active_character.exists, true);
  assert.equal(persisted.active_character.name, 'Aric');
  assert.equal(persisted.active_character.status, 'active');
  assert.equal(persisted.dnd5e_character.exists, true);
  assert.equal(persisted.campaign.instance_exists, true);
  assert.equal(persisted.campaign.membership_exists, true);
  assert.equal(persisted.campaign.world_id, 'greyvale');
  assert.equal(persisted.campaign.campaign_package_id, 'shadows_grey_road');
  assert.equal(persisted.runtime.scene_key, 'broken-caravan-site');
  assert.equal(persisted.runtime.location_key, 'broken-caravan-site');
  assert.equal(persisted.runtime.objective_key, 'witness-the-aftermath');
  assert.equal(persisted.knowledge.initial_facts_count, 4);
  assert.equal(persisted.knowledge.hidden_truth_leaked, false);

  const promptThread = await messages(session.session_id);
  const promptText = promptThread.map((message) => message.rendered_text ?? message.raw_text).join('\n');
  assert.match(promptText, /Ahead, a caravan leans broken/i);
  assert.match(promptText, /1\) Inspect the caravan/);
  assertThreadIsTemplateRendered(promptThread);

  const submitted = await inbound(session.session_id, '1');
  assert.equal(submitted.outbound_message, null);
  assert.equal(submitted.suppressed, true);

  persisted = await persistence(session.session_id);
  assert.equal(persisted.last_action.exists, true);
  assert.match(String(persisted.last_action.opportunity_id), /inspect-broken-caravan|scene_interaction/);

  const advanced = await request('/api/dev/sms-simulator/advance-next-beat', {
    method: 'POST',
    body: JSON.stringify({ session_id: session.session_id }),
  });
  assert.equal(advanced.response.status, 200);
  assert.equal(advanced.body.success, true);
  assert.equal(advanced.body.resolved_previous_beat, true);
  assert.equal(advanced.body.created_result_message, true);
  assert.equal(advanced.body.created_next_prompt, true);
  assert.equal(advanced.body.debug.runtime_called, true);
  assert.ok(advanced.body.new_message_ids.length >= 1);

  const advancedThread = await messages(session.session_id);
  const rendered = advancedThread.map((message) => message.rendered_text ?? message.raw_text).join('\n');
  assert.match(rendered, /cargo|struggle|robbery|looting|attacked|caravan/i);
  assert.match(rendered, /1\) /);
  assert.doesNotMatch(rendered, /Action resolved|story moves forward|carries the story forward/i);
  assertThreadIsTemplateRendered(advancedThread);

  persisted = await persistence(session.session_id);
  assert.equal(persisted.last_action.exists, true);
  assert.equal(persisted.last_action.resolved, true);
  assert.equal(persisted.messages.inbound_count >= 1, true);
  assert.equal(persisted.messages.outbound_count >= 1, true);

  const playLog = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_campaign_log
      WHERE campaign_id = $1
        AND character_id = $2
        AND log_type = 'play_action'
    `,
    [persisted.campaign.campaign_instance_id, persisted.active_character.id]
  );
  assert.equal(playLog.rows[0].count >= 1, true);
});

test('Stage 6A.5 Guided e2e persists detailed SMS-created character choices', async () => {
  const session = await createFreshSession();
  await completeGuided(session.session_id, 'Mira');
  const persisted = await persistence(session.session_id);

  const character = await query(
    `
      SELECT
        character.name,
        character.status,
        character.created_via_sms,
        character.dexterity,
        character.strength,
        character.personality_traits,
        race.slug AS race_slug,
        subrace.slug AS subrace_slug,
        class.slug AS class_slug,
        background.slug AS background_slug
      FROM dnd5e_character character
      LEFT JOIN dnd5e_race race ON race.id = character.race_id
      LEFT JOIN dnd5e_subrace subrace ON subrace.id = character.subrace_id
      LEFT JOIN dnd5e_class class ON class.id = character.class_id
      LEFT JOIN dnd5e_background background ON background.id = character.background_id
      WHERE character.id = $1
    `,
    [persisted.active_character.id]
  );

  assert.equal(character.rowCount, 1);
  assert.equal(character.rows[0].name, 'Mira');
  assert.equal(character.rows[0].status, 'active');
  assert.equal(character.rows[0].created_via_sms, true);
  assert.equal(character.rows[0].race_slug, 'elf');
  assert.equal(character.rows[0].subrace_slug, 'wood-elf');
  assert.equal(character.rows[0].class_slug, 'rogue');
  assert.equal(character.rows[0].background_slug, 'sage');
  assert.equal(character.rows[0].personality_traits, 'Curious');
  assert.equal(character.rows[0].dexterity > character.rows[0].strength, true);
  assert.equal(persisted.campaign.instance_exists, true);
  assert.equal(persisted.knowledge.hidden_truth_leaked, false);
});

test('Stage 6A.5 resume, duplicate action, STATUS budget, HELP, and idempotent beat advance remain safe', async () => {
  const session = await createFreshSession();
  await completeQuickStart(session.session_id, 'Nessa');

  const resumedSession = await createResumeSession(session.phone_number);
  const status = await inbound(resumedSession.session_id, 'STATUS');
  assert.equal(status.outbound_message.template_id, 'command.status_with_app_link');

  let persisted = await persistence(resumedSession.session_id);
  assert.equal(persisted.account.exists, true);
  assert.equal(persisted.active_character.exists, true);
  assert.equal(persisted.campaign.instance_exists, true);
  assert.notEqual(persisted.runtime.scene_id, null);

  const firstAction = await inbound(resumedSession.session_id, '1');
  assert.equal(firstAction.outbound_message, null);
  assert.equal(firstAction.suppressed, true);

  const duplicateOne = await inbound(resumedSession.session_id, '2');
  assert.equal(duplicateOne.outbound_message.template_id, 'input.action_already_set_web_app');
  const duplicateTwo = await inbound(resumedSession.session_id, '3');
  assert.equal(duplicateTwo.outbound_message, null);
  assert.equal(duplicateTwo.suppressed, true);

  persisted = await persistence(resumedSession.session_id);
  assert.equal(persisted.last_action.duplicate_attempt_count, 2);

  const advanced = await request('/api/dev/sms-simulator/advance-next-beat', {
    method: 'POST',
    body: JSON.stringify({ session_id: resumedSession.session_id }),
  });
  assert.equal(advanced.body.idempotency_status, 'advanced');

  const repeated = await request('/api/dev/sms-simulator/advance-next-beat', {
    method: 'POST',
    body: JSON.stringify({ session_id: resumedSession.session_id }),
  });
  assert.equal(repeated.body.idempotency_status, 'already_resolved');
  assert.deepEqual(repeated.body.new_message_ids, []);

  assert.equal((await inbound(resumedSession.session_id, 'OBJECTIVE')).outbound_message.template_id, 'command.status_link_only');
  const third = await inbound(resumedSession.session_id, 'RECAP');
  assert.equal(third.outbound_message, null);
  assert.equal(third.suppressed, true);
  assert.equal((await inbound(resumedSession.session_id, 'HELP')).outbound_message.template_id, 'sms.help');

  const invalid = await inbound(resumedSession.session_id, '99');
  assert.equal(invalid.outbound_message.template_id, 'input.no_match');
  assertThreadIsTemplateRendered(await messages(resumedSession.session_id));
});

test('Stage 6A.5 dev seed/reset/persistence endpoints support repeatable simulator validation', async () => {
  const seeded = await request('/api/dev/sms-simulator/seed-default-content', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(seeded.response.status, 200);
  assert.equal(seeded.body.ok, true);
  assert.equal(seeded.body.config.world_id, 'greyvale');

  const session = await createFreshSession();
  await inbound(session.session_id, 'hello');
  assert.equal((await persistence(session.session_id)).account.exists, true);

  const reset = await request('/api/dev/sms-simulator/reset-test-user', {
    method: 'POST',
    body: JSON.stringify({ session_id: session.session_id }),
  });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.ok, true);

  const afterReset = await persistence(session.session_id);
  assert.equal(afterReset.account.exists, false);
  assert.equal(afterReset.active_character.exists, false);
  assert.equal(afterReset.campaign.instance_exists, false);
});
