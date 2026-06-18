import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/config/db.js';
import { handleSmsInbound } from '../src/sms/smsInboundService.js';
import {
  getSmsOnboardingAccountByPhone,
  resetSmsOnboardingForPhone,
} from '../src/sms/smsOnboardingService.js';
import {
  createSmsSimulatorSession,
  getSmsSimulatorSession,
  listSmsMessages,
  resetSmsMessageStoreForTests,
} from '../src/sms/smsMessageStore.js';
import { advanceSmsNextBeat } from '../src/sms/smsConversationService.js';
import {
  DEFAULT_SMS_CAMPAIGN_ASSIGNMENT,
  SMS_CAMPAIGN_INSTANCE_STRATEGIES,
  validateSmsCampaignAssignmentShape,
} from '../src/sms/smsCampaignConfig.js';
import { validateDefaultSmsCampaignAssignment } from '../src/sms/smsCampaignAssignmentService.js';
import { REQUIRED_SMS_TEMPLATE_IDS } from '../src/sms/smsTemplateRegistry.js';

let server;
let baseUrl;
let phoneCounter = 6400;

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
  return `+1555064${String(phoneCounter).slice(-4)}`;
}

async function createFreshSession() {
  const phone = nextPhone();
  await resetSmsOnboardingForPhone(phone);
  return createSmsSimulatorSession({
    phone_number: phone,
    user_id: `sms_campaign_user_${phoneCounter}`,
    active_sms_character_id: null,
    active_sms_character_name: 'Adventurer',
    campaign_id: null,
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

async function createQuickCharacter(session, name = 'Aric') {
  await inbound(session, 'hello');
  await inbound(getSmsSimulatorSession(session.session_id), 'START');
  await inbound(getSmsSimulatorSession(session.session_id), 'continue');
  await inbound(getSmsSimulatorSession(session.session_id), '1');
  await inbound(getSmsSimulatorSession(session.session_id), name);
  await inbound(getSmsSimulatorSession(session.session_id), 'Human');
  await inbound(getSmsSimulatorSession(session.session_id), 'Fighter');
  return inbound(getSmsSimulatorSession(session.session_id), '1');
}

function outboundTemplates(sessionId) {
  return listSmsMessages(sessionId)
    .filter((message) => message.direction === 'outbound')
    .map((message) => message.template_id);
}

test('Stage 6A.4 default SMS campaign assignment config and templates validate', async () => {
  assert.equal(validateSmsCampaignAssignmentShape().ok, true);
  assert.equal(DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.world_id, 'greyvale');
  assert.equal(DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.campaign_package_id, 'shadows_grey_road');
  assert.equal(DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.start_scene_id, 'scene_broken_caravan');
  assert.equal(DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.start_scene_slug, 'broken-caravan-site');
  assert.ok(SMS_CAMPAIGN_INSTANCE_STRATEGIES.includes('solo_per_character'));
  assert.ok(SMS_CAMPAIGN_INSTANCE_STRATEGIES.includes('web_selected'));
  assert.equal(
    validateSmsCampaignAssignmentShape({
      ...DEFAULT_SMS_CAMPAIGN_ASSIGNMENT,
      instance_strategy: 'unsupported',
    }).ok,
    false
  );

  for (const templateId of [
    'campaign.assigning',
    'campaign.assigned',
    'campaign.assignment_failed',
    'campaign.no_available_campaign',
    'campaign.resume_existing',
    'campaign.completed_no_active',
    'campaign.character_dead',
    'intro.world_entry',
    'intro.first_prompt',
    'intro.objective_hint',
    'intro.already_started',
    'intro.resume',
    'command.status_with_app_link',
    'command.status_link_only',
    'system.non_substantive_ignored',
  ]) {
    assert.ok(REQUIRED_SMS_TEMPLATE_IDS.includes(templateId), `${templateId} is required`);
  }

  const validation = await validateDefaultSmsCampaignAssignment();
  assert.equal(validation.ok, true);
  assert.equal(validation.refs.world_slug, 'greyvale');
  assert.equal(validation.refs.objective_key, 'witness-the-aftermath');
});

test('Stage 6A.4 character creation assigns Greyvale campaign, state, knowledge, objective, and intro prompt', async () => {
  const session = await createFreshSession();
  const ready = await createQuickCharacter(session, 'Aric');

  assert.equal(ready.outbound_message.template_id, 'character.created');
  assert.deepEqual(
    ready.outbound_messages.map((message) => message.template_id),
    ['character.created', 'intro.world_entry', 'intro.first_prompt']
  );

  const account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'active_play');
  assert.ok(account.active_character_id);
  assert.ok(account.sms_onboarding_metadata.sms_campaign_assignment.campaign_instance_id);

  const membership = await query(
    `
      SELECT
        campaign.id AS campaign_id,
        campaign.slug AS campaign_slug,
        campaign.campaign_type,
        campaign.status AS campaign_status,
        world.slug AS world_slug,
        scene.key AS scene_key,
        location.key AS location_key,
        membership.membership_status,
        membership.is_active_context
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      JOIN dnd5e_world world ON world.id = campaign.world_id
      JOIN dnd5e_scene scene ON scene.id = membership.current_scene_id
      JOIN dnd5e_location location ON location.id = scene.location_id
      WHERE membership.character_id = $1
        AND membership.is_active_context = TRUE
    `,
    [account.active_character_id]
  );
  assert.equal(membership.rowCount, 1);
  assert.equal(membership.rows[0].world_slug, 'greyvale');
  assert.equal(membership.rows[0].campaign_type, 'questline');
  assert.equal(membership.rows[0].campaign_status, 'active');
  assert.equal(membership.rows[0].scene_key, 'broken-caravan-site');
  assert.equal(membership.rows[0].location_key, 'broken-caravan-site');
  assert.equal(membership.rows[0].membership_status, 'active');
  assert.equal(membership.rows[0].is_active_context, true);

  const objective = await query(
    `
      SELECT objective.key, objective.title, objective_state.status
      FROM dnd5e_character_objective objective_state
      JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
      JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
      WHERE quest_state.character_id = $1
        AND quest_state.campaign_id = $2
        AND objective_state.status = 'active'
      ORDER BY objective.sort_order ASC
      LIMIT 1
    `,
    [account.active_character_id, membership.rows[0].campaign_id]
  );
  assert.equal(objective.rows[0].key, 'witness-the-aftermath');

  const knowledge = await query(
    `
      SELECT knowledge_key
      FROM dnd5e_character_knowledge
      WHERE campaign_id = $1
        AND character_id = $2
        AND knowledge_type = 'lore'
    `,
    [membership.rows[0].campaign_id, account.active_character_id]
  );
  const known = new Set(knowledge.rows.map((row) => row.knowledge_key));
  assert.ok(known.has('knows_grey_road_exists'));
  assert.ok(known.has('knows_dunmere_nearby'));
  assert.ok(known.has('knows_road_is_normal_trade_route'));
  assert.ok(known.has('knows_character_is_traveling_region'));
  assert.equal(known.has('clue_caravan_irregularity'), false);
  assert.equal(known.has('whispering_presence'), false);

  const debug = await request(`/api/dev/sms-simulator/debug/${session.session_id}`);
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.onboarding_state, 'active_play');
  assert.equal(String(debug.body.campaign_instance_id), String(membership.rows[0].campaign_id));
  assert.equal(debug.body.active_scene_id !== null, true);
  assert.equal(debug.body.intro_fast_path_active, true);
  assert.equal(debug.body.normal_sms_pacing_active, false);

  for (const message of listSmsMessages(session.session_id)) {
    if (message.direction === 'outbound') {
      assert.ok(message.template_id);
      assert.doesNotMatch(message.rendered_text, /whispering|bandit|shrine|campaign_id|character_id|debug/i);
    }
  }
});

test('Stage 6A.4 repeated START resumes existing campaign without duplicating starter instances', async () => {
  const session = await createFreshSession();
  await createQuickCharacter(session, 'Mira');
  const account = await getSmsOnboardingAccountByPhone(session.phone_number);
  const before = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_campaign_character
      WHERE character_id = $1
    `,
    [account.active_character_id]
  );

  const resumed = await inbound(getSmsSimulatorSession(session.session_id), 'START');
  assert.equal(resumed.outbound_message.template_id, 'campaign.resume_existing');
  const after = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_campaign_character
      WHERE character_id = $1
    `,
    [account.active_character_id]
  );
  assert.equal(after.rows[0].count, before.rows[0].count);
});

test('Stage 6A.4 returning active-play phone rehydrates campaign context from DB', async () => {
  const firstSession = await createFreshSession();
  await createQuickCharacter(firstSession, 'Reva');
  const account = await getSmsOnboardingAccountByPhone(firstSession.phone_number);

  const resumedSession = createSmsSimulatorSession({
    phone_number: firstSession.phone_number,
    user_id: `sms_campaign_return_${phoneCounter}`,
    active_sms_character_id: null,
    active_sms_character_name: 'Adventurer',
    campaign_id: null,
    state: {
      active_thread: 'onboarding',
      onboarding_state: 'awaiting_start',
    },
  });

  const resumed = await inbound(resumedSession, 'STATUS');
  assert.equal(resumed.outbound_message.template_id, 'command.status_with_app_link');
  const current = getSmsSimulatorSession(resumedSession.session_id);
  assert.equal(String(current.active_sms_character_id), String(account.active_character_id));
  assert.ok(current.campaign_id);
  assert.ok(current.state.campaign_instance_id);
  assert.notEqual(resumed.outbound_message.template_id, 'identity.not_in_campaign');
});

test('Stage 6A.4 intro fast-path resolves first action, then normal SMS pacing takes over', async () => {
  const session = await createFreshSession();
  await createQuickCharacter(session, 'Toma');

  let current = getSmsSimulatorSession(session.session_id);
  assert.equal(current.state.intro_fast_path_active, true);
  assert.equal(current.state.normal_sms_pacing_active, false);

  const firstAction = await inbound(current, '1');
  assert.equal(firstAction.outbound_message, null);
  assert.equal(firstAction.suppressed, true);
  current = getSmsSimulatorSession(session.session_id);
  assert.equal(current.state.intro_fast_path_active, true);
  assert.equal(current.state.intro_fast_path_completed, false);
  assert.equal(current.state.normal_sms_pacing_active, false);
  assert.equal(current.state.action_window.status, 'open');
  assert.equal(current.state.current_player_submitted, true);
  assert.equal(current.state.last_response_policy_decision.outcome, 'valid_first_action_recorded_silently');

  const advanced = await advanceSmsNextBeat(current);
  assert.equal(advanced.success, true);
  assert.equal(advanced.resolved_previous_beat, true);
  assert.ok(
    outboundTemplates(session.session_id).some((templateId) =>
      ['gameplay.followup', 'gameplay.result', 'gameplay.exploration_narrative'].includes(templateId)
    )
  );

  current = getSmsSimulatorSession(session.session_id);
  assert.equal(current.state.intro_fast_path_active, false);
  assert.equal(current.state.intro_fast_path_completed, true);
  assert.equal(current.state.normal_sms_pacing_active, true);
  const secondAction = await inbound(current, '1');
  assert.equal(secondAction.outbound_message, null);
  assert.equal(secondAction.suppressed, true);
  current = getSmsSimulatorSession(session.session_id);
  assert.equal(current.state.action_window.status, 'open');
  assert.equal(current.state.default_actions_applied.length, 0);
});

test('Stage 6A.4 STATUS daily budget limits non-substantive SMS but never blocks HELP or gameplay', async () => {
  const session = await createFreshSession();
  await createQuickCharacter(session, 'Nessa');

  const first = await inbound(getSmsSimulatorSession(session.session_id), 'STATUS');
  assert.equal(first.outbound_message.template_id, 'command.status_with_app_link');
  assert.match(first.outbound_message.rendered_text, /https:\/\/dailyttrpg\.com\/play/);

  const second = await inbound(getSmsSimulatorSession(session.session_id), 'where am i');
  assert.equal(second.outbound_message.template_id, 'command.status_link_only');

  const outboundCountBeforeThird = outboundTemplates(session.session_id).length;
  const third = await inbound(getSmsSimulatorSession(session.session_id), 'what do i know');
  assert.equal(third.suppressed, true);
  assert.equal(third.outbound_message, null);
  assert.equal(outboundTemplates(session.session_id).length, outboundCountBeforeThird);

  const debug = await request(`/api/dev/sms-simulator/debug/${session.session_id}`);
  assert.equal(debug.body.non_substantive_sms_count, 3);
  assert.equal(debug.body.budget_decision, 'silent_ignore');

  const help = await inbound(getSmsSimulatorSession(session.session_id), 'HELP');
  assert.equal(help.outbound_message.template_id, 'sms.help');

  const gameplay = await inbound(getSmsSimulatorSession(session.session_id), '1');
  assert.equal(gameplay.outbound_message, null);
  assert.equal(gameplay.suppressed, true);
});
