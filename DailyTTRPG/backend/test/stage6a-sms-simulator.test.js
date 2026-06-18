import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import app from '../src/app.js';
import {
  advanceSmsNextBeat,
  advanceSmsTimeBeat,
  closeSmsActionWindow,
  renderAndStoreOutbound,
  resolveSmsCombatBeat,
  resolveSmsThreshold,
  triggerSmsCatchup,
  triggerSmsCombatPrompt,
  triggerSmsHpRollResult,
  triggerSmsLevelAvailable,
  triggerSmsLevelComplete,
  triggerSmsSpellChoice,
} from '../src/sms/smsConversationService.js';
import { advanceSmsSimulatorBeatCycle } from '../src/sms/smsSimulatorBeatCycleService.js';
import { handleSmsInbound } from '../src/sms/smsInboundService.js';
import { getSmsSimulatorAccessState } from '../src/sms/smsSimulatorAccess.js';
import {
  appendSmsMessage,
  createSmsSimulatorSession,
  getSmsSimulatorSession,
  listSmsMessages,
  listSmsSimulatorSessions,
  resetSmsMessageStoreForTests,
  updateSmsSimulatorSession,
} from '../src/sms/smsMessageStore.js';
import {
  resetSmsOnboardingForPhone,
} from '../src/sms/smsOnboardingService.js';

let server;
let baseUrl;
let phoneCounter = 7100;

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

function createReadySession(overrides = {}) {
  return createSmsSimulatorSession({
    phone_number: '+15550000001',
    user_id: 'test_user_1',
    active_sms_character_id: 'char_test_1',
    active_sms_character_name: 'Rowan',
    campaign_id: 'shadows_grey_road',
    ...overrides,
  });
}

function nextPhone() {
  phoneCounter += 1;
  return `+1555071${String(phoneCounter).slice(-4)}`;
}

async function createOnboardingSession() {
  const phone = nextPhone();
  await resetSmsOnboardingForPhone(phone);
  return createSmsSimulatorSession({
    phone_number: phone,
    user_id: `sms_simulator_real_${phoneCounter}`,
    active_sms_character_id: null,
    active_sms_character_name: 'Adventurer',
    campaign_id: null,
    state: {
      active_thread: 'onboarding',
      onboarding_state: 'awaiting_start',
    },
  });
}

async function completeQuickCharacter(session, name = 'Aric') {
  await handleSmsInbound({ session_id: session.session_id, message: 'hello' });
  await handleSmsInbound({ session_id: session.session_id, message: 'START' });
  await handleSmsInbound({ session_id: session.session_id, message: 'continue' });
  await handleSmsInbound({ session_id: session.session_id, message: '1' });
  await handleSmsInbound({ session_id: session.session_id, message: name });
  await handleSmsInbound({ session_id: session.session_id, message: 'Human' });
  await handleSmsInbound({ session_id: session.session_id, message: 'Fighter' });
  await handleSmsInbound({ session_id: session.session_id, message: '1' });
  return getSmsSimulatorSession(session.session_id);
}

function outboundMessages(sessionId) {
  return listSmsMessages(sessionId).filter((message) => message.direction === 'outbound');
}

function assertOutboundIsTemplated(sessionId) {
  for (const message of outboundMessages(sessionId)) {
    assert.ok(message.template_id, 'outbound message has a template_id');
    assert.equal(message.transport, 'simulator');
    assert.doesNotMatch(message.rendered_text, /\bdebug\b|\binternal\b|\bcampaign_id\b|\bcharacter_id\b/i);
  }
}

function attachManualActionWindow(sessions, responses = []) {
  const window = {
    window_id: `test_window_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
    status: 'open',
    threshold_reached: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expected_participants: sessions.map((session) => ({
      session_id: session.session_id,
      user_id: session.user_id,
      character_id: session.active_sms_character_id,
      display_name: session.active_sms_character_name,
    })),
    responses,
    pending_participants: sessions
      .filter((session) => !responses.some((response) => response.session_id === session.session_id))
      .map((session) => session.session_id),
    default_actions_applied: [],
    summary: 'Manual test action window.',
  };

  for (const session of sessions) {
    const response = responses.find((entry) => entry.session_id === session.session_id);
    updateSmsSimulatorSession(session.session_id, {
      state: {
        action_window: window,
        current_options: [
          { key: 'test:inspect', label: 'Inspect the caravan', payload: {} },
          { key: 'test:search', label: 'Search for survivors', payload: {} },
        ],
        current_player_submitted: Boolean(response),
        submitted_action_summary: response?.response_summary ?? null,
        submitted_at: response?.submitted_at ?? null,
      },
    });
  }

  return window;
}

test('Stage 6A simulator stores sessions, logs inbound/outbound messages, and polls in order', () => {
  const session = createReadySession();

  assert.equal(listSmsSimulatorSessions().length, 1);
  appendSmsMessage({
    session_id: session.session_id,
    direction: 'inbound',
    raw_text: '1',
    rendered_text: '1',
    status: 'received',
  });
  renderAndStoreOutbound(session, 'input.invalid', {
    retry_instruction: 'Reply with a number or a short action.',
  });

  const messages = listSmsMessages(session.session_id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].direction, 'inbound');
  assert.equal(messages[1].template_id, 'input.invalid');
  assert.equal(listSmsMessages(session.session_id, { afterMessageId: messages[0].message_id }).length, 1);
  assertOutboundIsTemplated(session.session_id);
});

test('Stage 6A simulator API creates sessions, rejects bad inbound, and routes inbound through shared service', async () => {
  const phone = nextPhone();
  await resetSmsOnboardingForPhone(phone);
  const created = await request('/api/dev/sms-simulator/session', {
    method: 'POST',
    body: JSON.stringify({
      phone_number: phone,
      user_id: 'test_user_api',
      active_sms_character_id: null,
      active_sms_character_name: 'Adventurer',
      campaign_id: null,
    }),
  });

  assert.equal(created.response.status, 200);
  assert.equal(created.body.initial_message, null);

  const sessionId = created.body.session.session_id;
  const missingSession = await request('/api/dev/sms-simulator/inbound', {
    method: 'POST',
    body: JSON.stringify({ message: '1' }),
  });
  assert.equal(missingSession.response.status, 400);

  const emptyMessage = await request('/api/dev/sms-simulator/inbound', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, message: '' }),
  });
  assert.equal(emptyMessage.response.status, 400);

  const inbound = await request('/api/dev/sms-simulator/inbound', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, message: 'hello' }),
  });
  assert.equal(inbound.response.status, 200);
  assert.equal(inbound.body.outbound_message.template_id, 'onboarding.welcome');

  const polled = await request(`/api/dev/sms-simulator/messages/${sessionId}`);
  assert.equal(
    polled.body.messages.filter((message) => message.direction === 'outbound').length,
    1,
    'first shared-pipeline response is stored once'
  );
  assertOutboundIsTemplated(sessionId);
});

test('Stage 6A simulator access is local by default and protected/disabled in production config', () => {
  assert.deepEqual(
    getSmsSimulatorAccessState({
      NODE_ENV: 'development',
      ENABLE_SMS_SIMULATOR: true,
      SMS_SIMULATOR_DEV_PASSWORD: null,
    }),
    {
      enabled: true,
      production: false,
      protected: false,
      ready: true,
    }
  );

  assert.equal(
    getSmsSimulatorAccessState({
      NODE_ENV: 'production',
      ENABLE_SMS_SIMULATOR: false,
      SMS_SIMULATOR_DEV_PASSWORD: null,
    }).enabled,
    false
  );

  assert.equal(
    getSmsSimulatorAccessState({
      NODE_ENV: 'production',
      ENABLE_SMS_SIMULATOR: true,
      SMS_SIMULATOR_DEV_PASSWORD: 'secret',
    }).protected,
    true
  );
});

test('Stage 6A SMS pipeline handles numeric replies, text, HELP, STATUS, LEVEL, and identity edges', async () => {
  const session = await createOnboardingSession();
  await completeQuickCharacter(session, 'Sera');

  const firstAction = await handleSmsInbound({ session_id: session.session_id, message: '2' });
  assert.equal(firstAction.outbound_message, null);
  assert.equal(firstAction.suppressed, true);
  assert.equal(getSmsSimulatorSession(session.session_id).state.last_response_policy_decision.outcome, 'valid_first_action_recorded_silently');
  assert.equal((await handleSmsInbound({ session_id: session.session_id, message: '2' })).outbound_message.template_id, 'input.action_already_set_web_app');
  const secondDuplicate = await handleSmsInbound({ session_id: session.session_id, message: '3' });
  assert.equal(secondDuplicate.outbound_message, null);
  assert.equal(secondDuplicate.suppressed, true);
  assert.equal((await handleSmsInbound({ session_id: session.session_id, message: '9' })).outbound_message.template_id, 'input.no_match');
  assert.equal((await handleSmsInbound({ session_id: session.session_id, message: 'HELP' })).outbound_message.template_id, 'sms.help');
  assert.equal((await handleSmsInbound({ session_id: session.session_id, message: 'STATUS' })).outbound_message.template_id, 'command.status_with_app_link');
  assert.equal((await handleSmsInbound({ session_id: session.session_id, message: 'LEVEL' })).outbound_message.template_id, 'command.level');

  const onboardingSession = await createOnboardingSession();
  assert.equal(
    (await handleSmsInbound({ session_id: onboardingSession.session_id, message: 'STATUS' })).outbound_message.template_id,
    'onboarding.welcome'
  );

  assertOutboundIsTemplated(session.session_id);
});

test('Stage 6A async and party thresholds wait before defaults and apply defaults only at resolution', async () => {
  const playerOne = createReadySession({
    phone_number: '+15550000021',
    user_id: 'player_1',
    active_sms_character_id: 'char_1',
    active_sms_character_name: 'Rowan',
  });
  const playerTwo = createReadySession({
    phone_number: '+15550000022',
    user_id: 'player_2',
    active_sms_character_id: 'char_2',
    active_sms_character_name: 'Mira',
  });

  attachManualActionWindow([playerOne, playerTwo], [
    {
      session_id: playerOne.session_id,
      character_id: playerOne.active_sms_character_id,
      response_key: 'test:inspect',
      response_summary: 'Inspect the caravan',
      submitted_at: new Date().toISOString(),
      submitted_action_payload: {
        key: 'test:inspect',
        label: 'Inspect the caravan',
        payload: {},
      },
      submission_source: 'sms',
      sms_submission_locked: true,
      can_modify_in_web: true,
      duplicate_attempt_count: 0,
      duplicate_guidance_sent_at: null,
      resolved_at: null,
    },
  ]);

  let playerTwoState = getSmsSimulatorSession(playerTwo.session_id);
  assert.equal(playerTwoState.state.action_window.status, 'open');
  assert.equal(playerTwoState.state.default_actions_applied.length, 0);

  assert.equal(advanceSmsTimeBeat(playerOne).message.template_id, 'async.reminder');
  const threshold = closeSmsActionWindow(getSmsSimulatorSession(playerOne.session_id));
  assert.equal(threshold.message.template_id, 'async.threshold_reached');

  playerTwoState = getSmsSimulatorSession(playerTwo.session_id);
  assert.equal(playerTwoState.state.default_actions_applied.length, 0, 'close does not apply defaults');

  const resolved = resolveSmsThreshold(getSmsSimulatorSession(playerOne.session_id));
  assert.equal(resolved.window.status, 'closed');
  playerTwoState = getSmsSimulatorSession(playerTwo.session_id);
  assert.equal(playerTwoState.state.default_actions_applied.length, 1);
  assert.ok(outboundMessages(playerTwo.session_id).some((message) => message.template_id === 'async.default_applied'));
  assert.ok(outboundMessages(playerTwo.session_id).some((message) => message.template_id === 'party.missed_participation'));
  assert.ok(outboundMessages(playerOne.session_id).some((message) => message.template_id === 'async.beat_resolved'));
  assertOutboundIsTemplated(playerOne.session_id);
  assertOutboundIsTemplated(playerTwo.session_id);
});

test('Stage 6A.4.5 advance-next-beat resolves party beat and preserves submitted action', async () => {
  const playerOne = createReadySession({
    phone_number: '+15550000041',
    user_id: 'cycle_player_1',
    active_sms_character_id: 'cycle_char_1',
    active_sms_character_name: 'Rowan',
  });
  const playerTwo = createReadySession({
    phone_number: '+15550000042',
    user_id: 'cycle_player_2',
    active_sms_character_id: 'cycle_char_2',
    active_sms_character_name: 'Mira',
  });

  attachManualActionWindow([playerOne, playerTwo], [
    {
      session_id: playerOne.session_id,
      character_id: playerOne.active_sms_character_id,
      response_key: 'test:inspect',
      response_summary: 'Inspect the caravan',
      submitted_at: new Date().toISOString(),
      submitted_action_payload: {
        key: 'test:inspect',
        label: 'Inspect the caravan',
        payload: {},
      },
      submission_source: 'sms',
      sms_submission_locked: true,
      can_modify_in_web: true,
      duplicate_attempt_count: 0,
      duplicate_guidance_sent_at: null,
      resolved_at: null,
    },
  ]);
  const originalSummary = getSmsSimulatorSession(playerOne.session_id).state.submitted_action_summary;
  assert.equal(getSmsSimulatorSession(playerOne.session_id).state.submitted_action_summary, originalSummary);

  const advanced = await advanceSmsSimulatorBeatCycle(getSmsSimulatorSession(playerOne.session_id));
  assert.equal(advanced.success, true);
  assert.equal(advanced.applied_defaults, true);
  assert.ok(advanced.previous_action_window_id);
  assert.ok(outboundMessages(playerOne.session_id).some((message) => message.template_id === 'sms.error_fallback'));
  assert.equal(advanced.reason_if_no_prompt, 'non_persistent_simulator_context');
  assert.ok(outboundMessages(playerTwo.session_id).some((message) => message.template_id === 'async.default_applied'));
  assert.equal(getSmsSimulatorSession(playerTwo.session_id).state.default_actions_applied.length, 1);
});


test('Stage 6A simulator catch-up, combat, and level-up flows render through registered templates', async () => {
  const session = createReadySession();

  assert.equal(triggerSmsCatchup(session).message.template_id, 'catchup.summary');
  assert.equal(triggerSmsCombatPrompt(getSmsSimulatorSession(session.session_id)).message.template_id, 'combat.prompt');
  const combatResolved = resolveSmsCombatBeat(getSmsSimulatorSession(session.session_id));
  assert.equal(combatResolved.result.message.template_id, 'combat.result');
  assert.equal(combatResolved.end.message.template_id, 'combat.end');

  assert.equal(triggerSmsLevelAvailable(getSmsSimulatorSession(session.session_id)).message.template_id, 'level.available');
  assert.equal(
    renderAndStoreOutbound(getSmsSimulatorSession(session.session_id), 'level.start', {
      target_level: 2,
    }).message.template_id,
    'level.start'
  );
  assert.equal(
    renderAndStoreOutbound(getSmsSimulatorSession(session.session_id), 'level.hp_choice', {
      fixed_hp: 6,
      hit_die: 'd8',
    }).message.template_id,
    'level.hp_choice'
  );
  assert.equal(triggerSmsHpRollResult(getSmsSimulatorSession(session.session_id)).message.template_id, 'level.hp_roll_result');
  assert.equal(triggerSmsSpellChoice(getSmsSimulatorSession(session.session_id)).message.template_id, 'level.spell_choice');
  assert.equal(
    renderAndStoreOutbound(getSmsSimulatorSession(session.session_id), 'level.invalid_choice', {
      choice_hint: 'Reply FIXED or ROLL.',
    }).message.template_id,
    'level.invalid_choice'
  );
  assert.equal(triggerSmsLevelComplete(getSmsSimulatorSession(session.session_id)).message.template_id, 'level.complete');
  assertOutboundIsTemplated(session.session_id);
});

test('Stage 6A simulator debug payload is separate from player-facing thread', async () => {
  const session = await createOnboardingSession();
  await completeQuickCharacter(session, 'Debugra');
  await handleSmsInbound({ session_id: session.session_id, message: '1' });

  const debug = await request(`/api/dev/sms-simulator/debug/${session.session_id}`);
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.session_id, session.session_id);
  assert.ok(debug.body.last_inbound_payload);
  assert.equal(debug.body.last_response_policy_decision.outcome, 'valid_first_action_recorded_silently');
  assert.equal(debug.body.current_player_submitted, true);
  assert.equal(debug.body.last_outbound_sent, false);

  const thread = await request(`/api/dev/sms-simulator/messages/${session.session_id}`);
  const renderedThread = thread.body.messages.map((message) => message.rendered_text ?? message.raw_text).join('\n');
  assert.doesNotMatch(renderedThread, /last_inbound_payload|selected_opportunity_id|active_action_window_id/);
});

test('Stage 6A browser simulator route assets include session setup, polling, debug toggle, and dev controls', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, '../..');
  const html = fs.readFileSync(
    path.join(repoRoot, 'frontend/dev/sms-simulator/index.html'),
    'utf8'
  );
  const js = fs.readFileSync(
    path.join(repoRoot, 'frontend/dev/sms-simulator/sms-simulator.js'),
    'utf8'
  );
  const firebase = fs.readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8');

  assert.match(html, /DailyTTRPG SMS Simulator/);
  assert.match(html, /Show Debug/);
  assert.match(html, /Advance to Next Beat/);
  assert.match(html, /data-control="advance-next-beat"/);
  assert.match(html, /Advanced controls may leave the simulator in an intermediate state/);
  assert.match(html, /Real new-phone onboarding test/);
  assert.match(html, /Refresh Real Runtime Prompt/);
  assert.match(html, /data-control="verify-persistence"/);
  assert.match(html, /data-control="resolve-threshold"/);
  assert.doesNotMatch(html, /Advance Time Beat/);
  assert.match(html, /data-control="combat-prompt"/);
  assert.match(html, /data-control="level-available"/);
  assert.match(js, /setInterval/);
  assert.match(js, /\/api\/dev\/sms-simulator/);
  assert.match(js, /message\.direction === 'outbound'/);
  assert.match(firebase, /"dev\/\*\*"/);
});

test('Stage 6A.4.5 advance-next-beat resolves immediately and creates next SMS output', async () => {
  const session = await createOnboardingSession();
  await completeQuickCharacter(session, 'Enginea');
  const inbound = await handleSmsInbound({ session_id: session.session_id, message: '1' });
  assert.equal(inbound.outbound_message, null);

  const beforeAdvance = outboundMessages(session.session_id).length;
  const advanced = await advanceSmsNextBeat(getSmsSimulatorSession(session.session_id));
  assert.equal(advanced.success, true);
  assert.equal(advanced.resolved_previous_beat, true);
  assert.equal(advanced.idempotency_status, 'advanced');
  assert.equal(advanced.created_result_message, true);
  assert.ok(advanced.messages_created.length >= 1);
  assert.deepEqual(advanced.new_message_ids, advanced.messages_created.map((message) => message.message_id));
  assert.ok(advanced.previous_action_window_id);
  assert.ok(advanced.next_action_window_id);
  assert.ok(outboundMessages(session.session_id).length > beforeAdvance);
  assert.ok(
    outboundMessages(session.session_id).some((message) =>
      ['gameplay.followup', 'gameplay.result', 'gameplay.exploration_narrative'].includes(message.template_id)
    )
  );
  const rendered = outboundMessages(session.session_id).map((message) => message.rendered_text).join('\n');
  assert.match(rendered, /wreckage|caravan|struggle|looting|attacked/i);
  assert.doesNotMatch(rendered, /Action resolved|story moves forward|carries the story forward/i);
  assert.equal(advanced.debug.runtime_called, true);

  const afterFirstAdvanceCount = outboundMessages(session.session_id).length;
  const repeated = await advanceSmsSimulatorBeatCycle(getSmsSimulatorSession(session.session_id));
  assert.equal(repeated.idempotency_status, 'already_resolved');
  assert.equal(repeated.new_message_ids.length, 0);
  assert.equal(outboundMessages(session.session_id).length, afterFirstAdvanceCount);

  const viaApi = await request('/api/dev/sms-simulator/advance-next-beat', {
    method: 'POST',
    body: JSON.stringify({ session_id: session.session_id }),
  });
  assert.equal(viaApi.response.status, 200);
  assert.ok(viaApi.body.debug);
  assert.equal(viaApi.body.debug.idempotency_status, 'already_resolved');
  assert.ok(viaApi.body.debug.simulator_state);

  const persisted = await request(`/api/dev/sms-simulator/persistence/${session.session_id}`);
  assert.equal(persisted.response.status, 200);
  assert.equal(persisted.body.account.exists, true);
  assert.equal(persisted.body.active_character.exists, true);
  assert.equal(persisted.body.dnd5e_character.exists, true);
  assert.equal(persisted.body.campaign_instance.exists, true);
  assert.equal(persisted.body.campaign_membership.exists, true);
  assert.ok(persisted.body.runtime_state.scene_id);
});

test('Stage 6A.4.5 beat cycle applies defaults without real time and reports no-prompt cases', async () => {
  const session = createReadySession({
    phone_number: '+15550000031',
    user_id: 'default_user',
    active_sms_character_id: 'char_default',
  });
  attachManualActionWindow([session], []);

  const beforeAdvance = outboundMessages(session.session_id).length;
  const advanced = await advanceSmsSimulatorBeatCycle(getSmsSimulatorSession(session.session_id));
  assert.equal(advanced.success, true);
  assert.equal(advanced.resolved_previous_beat, true);
  assert.equal(advanced.applied_defaults, true);
  assert.ok(advanced.new_message_ids.length >= 1);
  assert.ok(outboundMessages(session.session_id).length > beforeAdvance);
  assert.ok(outboundMessages(session.session_id).some((message) => message.template_id === 'async.default_applied'));

  const emptySession = createReadySession({
    phone_number: '+15550000032',
    user_id: 'empty_user',
    active_sms_character_id: 'char_empty',
    state: {
      current_options: [],
      action_window: null,
    },
  });
  const noPrompt = await advanceSmsSimulatorBeatCycle(emptySession);
  assert.equal(noPrompt.success, true);
  assert.equal(noPrompt.resolved_previous_beat, false);
  assert.equal(noPrompt.created_next_prompt, false);
  assert.equal(noPrompt.reason_if_no_prompt, 'no_active_action_window');
  assert.deepEqual(noPrompt.new_message_ids, []);
});
