import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { handleSmsInbound } from '../src/sms/smsInboundService.js';
import {
  getSmsOnboardingAccountByPhone,
  resetSmsOnboardingForPhone,
  setSmsOnboardingLastActiveAt,
} from '../src/sms/smsOnboardingService.js';
import {
  createSmsSimulatorSession,
  getSmsSimulatorSession,
  listSmsMessages,
  resetSmsMessageStoreForTests,
} from '../src/sms/smsMessageStore.js';
import { renderSmsTemplate } from '../src/sms/smsOutboundFormatter.js';
import { REQUIRED_SMS_TEMPLATE_IDS } from '../src/sms/smsTemplateRegistry.js';

let server;
let baseUrl;
let phoneCounter = 100;

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
  return `+1555010${String(phoneCounter).padStart(4, '0')}`;
}

async function createOnboardingSession(phone = nextPhone()) {
  await resetSmsOnboardingForPhone(phone);
  return createSmsSimulatorSession({
    phone_number: phone,
    user_id: `sms_user_${phoneCounter}`,
    active_sms_character_id: null,
    active_sms_character_name: 'Adventurer',
    campaign_id: 'shadows_grey_road',
    state: {
      active_thread: 'onboarding',
      onboarding_state: 'awaiting_start',
    },
  });
}

async function inbound(session, message) {
  return handleSmsInbound({
    session_id: session.session_id,
    message,
  });
}

function outboundTemplates(sessionId) {
  return listSmsMessages(sessionId)
    .filter((message) => message.direction === 'outbound')
    .map((message) => message.template_id);
}

function assertTemplatedThread(sessionId) {
  for (const message of listSmsMessages(sessionId)) {
    if (message.direction === 'outbound') {
      assert.ok(message.template_id, 'outbound onboarding message has template_id');
      assert.doesNotMatch(message.rendered_text, /\bdebug\b|\binternal\b|\bonboarding_state\b|\baccount_id\b/i);
    }
  }
}

test('Stage 6A.2 onboarding templates exist, render, validate variables, and stay player-safe', () => {
  const onboardingTemplateIds = [
    'onboarding.welcome',
    'onboarding.prompt_start',
    'onboarding.resume_confirm',
    'onboarding.resume_continue',
    'onboarding.resume_restart',
    'onboarding.intro',
    'onboarding.transition_to_creation',
    'onboarding.character_name_prompt',
    'onboarding.character_class_prompt',
    'onboarding.character_species_prompt',
    'onboarding.character_background_prompt',
    'onboarding.character_confirm',
    'onboarding.character_ready',
  ];

  for (const templateId of onboardingTemplateIds) {
    assert.ok(REQUIRED_SMS_TEMPLATE_IDS.includes(templateId), `${templateId} is registered as required`);
  }

  const welcome = renderSmsTemplate('onboarding.welcome', {
    brand_name: 'DailyTTRPG',
  });
  assert.match(welcome.message, /Reply START/);
  assert.ok(welcome.message.length <= 160);
  assert.throws(() => renderSmsTemplate('onboarding.welcome', {}), /Missing required SMS template variables/);

  const resume = renderSmsTemplate('onboarding.resume_confirm', {
    resume_context: 'You were creating a character. Continue?',
    options: ['Yes', 'Start over'],
  });
  assert.match(resume.message, /1\) Yes/);
  assert.doesNotMatch(resume.message, /debug|undefined|null/i);
});

test('Stage 6A.2 new phone creates persisted account and requires START before onboarding begins', async () => {
  const session = await createOnboardingSession();
  const first = await inbound(session, 'hello');

  assert.equal(first.outbound_message.template_id, 'onboarding.welcome');
  let account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'awaiting_start');
  assert.equal(account.active_character_id, null);

  const blocked = await inbound(getSmsSimulatorSession(session.session_id), 'I want to play');
  assert.equal(blocked.outbound_message.template_id, 'onboarding.prompt_start');
  account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'awaiting_start');
  assertTemplatedThread(session.session_id);
});

test('Stage 6A.2 START opens intro, then onboarding transitions into character creation entry', async () => {
  const session = await createOnboardingSession();
  await inbound(session, 'hello');

  const started = await inbound(getSmsSimulatorSession(session.session_id), 'START');
  assert.equal(started.outbound_message.template_id, 'onboarding.intro');
  let account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'onboarding_intro');
  assert.ok(account.sms_opt_in_at);

  const creation = await inbound(getSmsSimulatorSession(session.session_id), 'continue');
  assert.equal(creation.outbound_message.template_id, 'character.mode_select');
  account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'creating_character');
  assert.equal(account.onboarding_substate, 'mode');
  assertTemplatedThread(session.session_id);
});

test('Stage 6A.2 character creation substates persist and STATUS before character uses a template', async () => {
  const session = await createOnboardingSession();
  await inbound(session, 'hello');
  await inbound(getSmsSimulatorSession(session.session_id), 'START');
  await inbound(getSmsSimulatorSession(session.session_id), 'next');

  const status = await inbound(getSmsSimulatorSession(session.session_id), 'STATUS');
  assert.equal(status.outbound_message.template_id, 'identity.character_required');

  const mode = await inbound(getSmsSimulatorSession(session.session_id), '1');
  assert.equal(mode.outbound_message.template_id, 'character.name_prompt');

  const name = await inbound(getSmsSimulatorSession(session.session_id), 'Rowan');
  assert.equal(name.outbound_message.template_id, 'character.race_prompt');
  let account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_substate, 'race');
  assert.equal(account.draft_character_name, 'Rowan');

  const raceReply = await inbound(getSmsSimulatorSession(session.session_id), '1');
  assert.equal(raceReply.outbound_message.template_id, 'character.class_prompt');
  account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_substate, 'class');
  assertTemplatedThread(session.session_id);
});

test('Stage 6A.2 long-gap smart resume confirms before consuming input and continue resumes safely', async () => {
  const session = await createOnboardingSession();
  await inbound(session, 'hello');
  await inbound(getSmsSimulatorSession(session.session_id), 'START');
  await inbound(getSmsSimulatorSession(session.session_id), 'next');
  await inbound(getSmsSimulatorSession(session.session_id), '1');
  await inbound(getSmsSimulatorSession(session.session_id), 'Mira');
  await inbound(getSmsSimulatorSession(session.session_id), 'Human');

  const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  await setSmsOnboardingLastActiveAt(session.phone_number, oldDate);

  const prompt = await inbound(getSmsSimulatorSession(session.session_id), '2');
  assert.equal(prompt.outbound_message.template_id, 'onboarding.resume_confirm');
  let account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_substate, 'class');
  assert.equal(account.sms_onboarding_metadata.resume_pending, true);

  const continued = await inbound(getSmsSimulatorSession(session.session_id), '1');
  assert.equal(continued.outbound_message.template_id, 'character.creation_resume');
  account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.sms_onboarding_metadata.resume_pending, false);
  assert.equal(account.onboarding_substate, 'class');
});

test('Stage 6A.2 restart clears draft safely and returns to character mode selection', async () => {
  const session = await createOnboardingSession();
  await inbound(session, 'hello');
  await inbound(getSmsSimulatorSession(session.session_id), 'START');
  await inbound(getSmsSimulatorSession(session.session_id), 'next');
  await inbound(getSmsSimulatorSession(session.session_id), '1');
  await inbound(getSmsSimulatorSession(session.session_id), 'Pax');
  let account = await getSmsOnboardingAccountByPhone(session.phone_number);
  const draftId = account.sms_onboarding_draft_character_id;

  await setSmsOnboardingLastActiveAt(session.phone_number, new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());
  await inbound(getSmsSimulatorSession(session.session_id), 'Fighter');
  const restarted = await inbound(getSmsSimulatorSession(session.session_id), '2');
  assert.equal(restarted.outbound_message.template_id, 'character.mode_select');

  account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'creating_character');
  assert.equal(account.onboarding_substate, 'mode');
  assert.equal(account.sms_onboarding_draft_character_id, null);

  const draft = await query('SELECT status, is_active FROM dnd5e_character WHERE id = $1', [draftId]);
  assert.equal(draft.rows[0].status, 'retired');
  assert.equal(draft.rows[0].is_active, false);
});

test('Stage 6A.2 full SMS character creation continues into active play and simulator debug exposes state', async () => {
  const session = await createOnboardingSession();
  await inbound(session, 'hello');
  await inbound(getSmsSimulatorSession(session.session_id), 'START');
  await inbound(getSmsSimulatorSession(session.session_id), 'next');
  await inbound(getSmsSimulatorSession(session.session_id), '1');
  await inbound(getSmsSimulatorSession(session.session_id), 'Lysa');
  await inbound(getSmsSimulatorSession(session.session_id), 'Human');
  const confirm = await inbound(getSmsSimulatorSession(session.session_id), 'Fighter');
  assert.equal(confirm.outbound_message.template_id, 'character.confirm_summary');

  const ready = await inbound(getSmsSimulatorSession(session.session_id), '1');
  assert.equal(ready.outbound_message.template_id, 'character.created');
  assert.deepEqual(
    ready.outbound_messages.map((message) => message.template_id),
    ['character.created', 'intro.world_entry', 'intro.first_prompt']
  );
  const account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'active_play');
  assert.ok(account.active_character_id);

  const debug = await request(`/api/dev/sms-simulator/debug/${session.session_id}`);
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.onboarding_state, 'active_play');
  assert.equal(String(debug.body.active_sms_character_id), String(account.active_character_id));
  assert.ok(debug.body.campaign_instance_id);
  assert.equal(debug.body.intro_fast_path_active, true);
});

test('Stage 6A.2 HELP works everywhere and STOP suppresses further outbound until START re-consents', async () => {
  const session = await createOnboardingSession();
  await inbound(session, 'hello');

  const help = await inbound(getSmsSimulatorSession(session.session_id), 'HELP');
  assert.equal(help.outbound_message.template_id, 'sms.help');

  await inbound(getSmsSimulatorSession(session.session_id), 'START');
  await inbound(getSmsSimulatorSession(session.session_id), 'next');
  const midHelp = await inbound(getSmsSimulatorSession(session.session_id), 'HELP');
  assert.equal(midHelp.outbound_message.template_id, 'sms.help');

  const stop = await inbound(getSmsSimulatorSession(session.session_id), 'STOP');
  assert.equal(stop.outbound_message.template_id, 'sms.stop_confirmation');
  const suppressed = await inbound(getSmsSimulatorSession(session.session_id), 'anything');
  assert.equal(suppressed.suppressed, true);
  assert.equal(suppressed.outbound_message, null);

  const restarted = await inbound(getSmsSimulatorSession(session.session_id), 'START');
  assert.equal(restarted.outbound_message.template_id, 'onboarding.intro');
});

test('Stage 6A.2 phone-only future Twilio-style inbound uses the same onboarding handler', async () => {
  const phone = nextPhone();
  await resetSmsOnboardingForPhone(phone);

  const response = await handleSmsInbound({
    phone_number: phone,
    message: 'hello',
    transport: 'twilio',
  });

  assert.equal(response.outbound_message.template_id, 'onboarding.welcome');
  assert.equal(response.session, null);
  const account = await getSmsOnboardingAccountByPhone(phone);
  assert.equal(account.onboarding_state, 'awaiting_start');
});
