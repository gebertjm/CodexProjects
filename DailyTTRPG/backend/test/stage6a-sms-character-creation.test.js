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
import { ClassRegistry, resolveClassAlias } from '../src/sms/smsCharacterCreationService.js';

let server;
let baseUrl;
let phoneCounter = 300;

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
  return `+1555030${String(phoneCounter).padStart(4, '0')}`;
}

async function createCreationSession(phone = nextPhone()) {
  await resetSmsOnboardingForPhone(phone);
  return createSmsSimulatorSession({
    phone_number: phone,
    user_id: `sms_character_user_${phoneCounter}`,
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

async function beginCreation(session) {
  await inbound(session, 'hello');
  await inbound(getSmsSimulatorSession(session.session_id), 'START');
  const mode = await inbound(getSmsSimulatorSession(session.session_id), 'continue');
  assert.equal(mode.outbound_message.template_id, 'character.mode_select');
  return getSmsSimulatorSession(session.session_id);
}

async function loadCharacter(characterId) {
  const result = await query(
    `
      SELECT
        character.id,
        character.name,
        character.status,
        character.created_via_sms,
        character.is_active,
        character.level,
        character.strength,
        character.dexterity,
        character.constitution,
        character.intelligence,
        character.wisdom,
        character.charisma,
        character.max_hit_points,
        character.armor_class,
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
    [characterId]
  );

  return result.rows[0] ?? null;
}

function assertTemplatedThread(sessionId) {
  for (const message of listSmsMessages(sessionId)) {
    if (message.direction === 'outbound') {
      assert.ok(message.template_id, 'outbound message has template_id');
      assert.doesNotMatch(message.rendered_text, /\bdebug\b|\binternal\b|\bcharacter_id\b|\baccount_id\b/i);
    }
  }
}

test('Stage 6A.3 character templates exist and render safely', () => {
  const templateIds = [
    'character.mode_select',
    'character.name_prompt',
    'character.name_invalid',
    'character.race_prompt',
    'character.race_more',
    'character.subrace_prompt',
    'character.class_prompt',
    'character.class_other_prompt',
    'character.attribute_prompt',
    'character.background_prompt',
    'character.trait_prompt',
    'character.confirm_summary',
    'character.edit_prompt',
    'character.restart_confirm',
    'character.created',
    'character.creation_resume',
    'character.invalid_choice',
    'character.unrecognized_class',
    'character.unrecognized_race',
  ];

  for (const templateId of templateIds) {
    assert.ok(REQUIRED_SMS_TEMPLATE_IDS.includes(templateId), `${templateId} is required`);
  }

  const mode = renderSmsTemplate('character.mode_select', {
    options: ['Quick start - fastest, smart defaults', 'Guided - more choices'],
  });
  assert.match(mode.message, /1\) Quick start/);
  assert.throws(() => renderSmsTemplate('character.mode_select', { options: ['Only one'] }), /requires 2-2 options/);

  const confirm = renderSmsTemplate('character.confirm_summary', {
    character_summary: 'Name: Aric. Species: Human. Class: Fighter. Background: Wanderer. Trait: Brave.',
    options: ['Confirm', 'Edit', 'Start over'],
  });
  assert.doesNotMatch(confirm.message, /undefined|null|debug/i);
  assert.ok(ClassRegistry.core_slugs.includes('fighter'));
  assert.equal(resolveClassAlias('mage')?.slug, 'wizard');
});

test('Stage 6A.3 quick start creates a valid active SMS character with defaults', async () => {
  const session = await createCreationSession();
  await beginCreation(session);

  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '1')).outbound_message.template_id, 'character.name_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Aric')).outbound_message.template_id, 'character.race_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Human')).outbound_message.template_id, 'character.class_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Fighter')).outbound_message.template_id, 'character.confirm_summary');
  const finalized = await inbound(getSmsSimulatorSession(session.session_id), '1');
  assert.equal(finalized.outbound_message.template_id, 'character.created');
  assert.deepEqual(
    finalized.outbound_messages.map((message) => message.template_id),
    ['character.created', 'intro.world_entry', 'intro.first_prompt']
  );

  const account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_state, 'active_play');
  assert.ok(account.active_character_id);
  assert.ok(account.sms_onboarding_metadata.sms_campaign_assignment.campaign_instance_id);

  const character = await loadCharacter(account.active_character_id);
  assert.equal(character.name, 'Aric');
  assert.equal(character.status, 'active');
  assert.equal(character.created_via_sms, true);
  assert.equal(character.is_active, true);
  assert.equal(character.level, 1);
  assert.equal(character.race_slug, 'human');
  assert.equal(character.class_slug, 'fighter');
  assert.equal(character.background_slug, 'soldier');
  assert.ok(character.max_hit_points >= 1);
  assert.ok(character.strength > character.intelligence);

  const classRows = await query('SELECT class_level, is_primary FROM dnd5e_character_class WHERE character_id = $1', [
    account.active_character_id,
  ]);
  assert.equal(classRows.rowCount, 1);
  assert.equal(classRows.rows[0].class_level, 1);
  assert.equal(classRows.rows[0].is_primary, true);

  const itemRows = await query('SELECT COUNT(*)::int AS count FROM dnd5e_character_item WHERE character_id = $1', [
    account.active_character_id,
  ]);
  assert.ok(itemRows.rows[0].count >= 1);

  const campaignRows = await query(
    `
      SELECT campaign.world_id, campaign.slug, membership.current_scene_id
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      WHERE membership.character_id = $1
        AND membership.is_active_context = TRUE
    `,
    [account.active_character_id]
  );
  assert.equal(campaignRows.rowCount, 1);
  assert.ok(campaignRows.rows[0].slug.startsWith('sms-'));

  const knowledgeRows = await query(
    `
      SELECT knowledge_key
      FROM dnd5e_character_knowledge
      WHERE campaign_id = (
        SELECT campaign_id
        FROM dnd5e_campaign_character
        WHERE character_id = $1
          AND is_active_context = TRUE
        LIMIT 1
      )
        AND character_id = $1
        AND knowledge_type = 'lore'
    `,
    [account.active_character_id]
  );
  const knownKeys = new Set(knowledgeRows.rows.map((row) => row.knowledge_key));
  assert.ok(knownKeys.has('knows_grey_road_exists'));
  assert.ok(knownKeys.has('knows_dunmere_nearby'));
  assert.equal(knownKeys.has('clue_caravan_irregularity'), false);
  assertTemplatedThread(session.session_id);
});

test('Stage 6A.3 guided flow supports species, subrace, class, attributes, background, trait, and finalization', async () => {
  const session = await createCreationSession();
  await beginCreation(session);

  await inbound(getSmsSimulatorSession(session.session_id), '2');
  await inbound(getSmsSimulatorSession(session.session_id), 'Mira');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Elf')).outbound_message.template_id, 'character.subrace_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Wood Elf')).outbound_message.template_id, 'character.class_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Rogue')).outbound_message.template_id, 'character.attribute_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '2')).outbound_message.template_id, 'character.background_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Scholar')).outbound_message.template_id, 'character.trait_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Curious')).outbound_message.template_id, 'character.confirm_summary');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Confirm')).outbound_message.template_id, 'character.created');

  const account = await getSmsOnboardingAccountByPhone(session.phone_number);
  const character = await loadCharacter(account.active_character_id);
  assert.equal(character.name, 'Mira');
  assert.equal(character.race_slug, 'elf');
  assert.equal(character.subrace_slug, 'wood-elf');
  assert.equal(character.class_slug, 'rogue');
  assert.equal(character.background_slug, 'sage');
  assert.equal(character.personality_traits, 'Curious');
  assert.ok(character.dexterity > character.strength);
});

test('Stage 6A.3 race paging, class Other alias resolution, and spell defaults work', async () => {
  const session = await createCreationSession();
  await beginCreation(session);

  await inbound(getSmsSimulatorSession(session.session_id), '1');
  await inbound(getSmsSimulatorSession(session.session_id), 'Nim');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '4')).outbound_message.template_id, 'character.race_more');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '2')).outbound_message.template_id, 'character.class_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Other')).outbound_message.template_id, 'character.class_other_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'mage')).outbound_message.template_id, 'character.class_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '1')).outbound_message.template_id, 'character.confirm_summary');
  await inbound(getSmsSimulatorSession(session.session_id), '1');

  const account = await getSmsOnboardingAccountByPhone(session.phone_number);
  const character = await loadCharacter(account.active_character_id);
  assert.equal(character.race_slug, 'dragonborn');
  assert.equal(character.class_slug, 'wizard');

  const spellRows = await query('SELECT COUNT(*)::int AS count FROM dnd5e_character_spell WHERE character_id = $1', [
    account.active_character_id,
  ]);
  assert.ok(spellRows.rows[0].count >= 1);
});

test('Stage 6A.3 edit flow updates draft before finalization and restart retires draft safely', async () => {
  const session = await createCreationSession();
  await beginCreation(session);

  await inbound(getSmsSimulatorSession(session.session_id), '1');
  await inbound(getSmsSimulatorSession(session.session_id), 'Oldname');
  await inbound(getSmsSimulatorSession(session.session_id), 'Human');
  await inbound(getSmsSimulatorSession(session.session_id), 'Fighter');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '2')).outbound_message.template_id, 'character.edit_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '1')).outbound_message.template_id, 'character.name_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Newname')).outbound_message.template_id, 'character.confirm_summary');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '3')).outbound_message.template_id, 'character.mode_select');

  let account = await getSmsOnboardingAccountByPhone(session.phone_number);
  assert.equal(account.onboarding_substate, 'mode');
  assert.equal(account.sms_onboarding_draft_character_id, null);

  const retiredRows = await query(
    "SELECT COUNT(*)::int AS count FROM dnd5e_character WHERE account_id = $1 AND status = 'retired'",
    [account.id]
  );
  assert.ok(retiredRows.rows[0].count >= 1);

  await inbound(getSmsSimulatorSession(session.session_id), '1');
  await inbound(getSmsSimulatorSession(session.session_id), 'Fresh');
  await inbound(getSmsSimulatorSession(session.session_id), 'Human');
  await inbound(getSmsSimulatorSession(session.session_id), 'Fighter');
  await inbound(getSmsSimulatorSession(session.session_id), '1');
  account = await getSmsOnboardingAccountByPhone(session.phone_number);
  const character = await loadCharacter(account.active_character_id);
  assert.equal(character.name, 'Fresh');
});

test('Stage 6A.3 resume, START mid-flow, invalid choices, unknown class/race, HELP, and STATUS are safe', async () => {
  const session = await createCreationSession();
  await beginCreation(session);

  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'START')).outbound_message.template_id, 'character.invalid_choice');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), '1')).outbound_message.template_id, 'character.name_prompt');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'A')).outbound_message.template_id, 'character.name_invalid');
  await inbound(getSmsSimulatorSession(session.session_id), 'Toma');

  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Kender')).outbound_message.template_id, 'character.unrecognized_race');
  await inbound(getSmsSimulatorSession(session.session_id), 'Human');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'Chronomancer')).outbound_message.template_id, 'character.unrecognized_class');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'START')).outbound_message.template_id, 'character.creation_resume');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'HELP')).outbound_message.template_id, 'sms.help');
  assert.equal((await inbound(getSmsSimulatorSession(session.session_id), 'STATUS')).outbound_message.template_id, 'identity.character_required');

  const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  await setSmsOnboardingLastActiveAt(session.phone_number, oldDate);
  const resume = await inbound(getSmsSimulatorSession(session.session_id), 'Fighter');
  assert.equal(resume.outbound_message.template_id, 'onboarding.resume_confirm');
});

test('Stage 6A.3 simulator debug exposes creation step and draft data outside the player thread', async () => {
  const session = await createCreationSession();
  await beginCreation(session);
  await inbound(getSmsSimulatorSession(session.session_id), '2');
  await inbound(getSmsSimulatorSession(session.session_id), 'Debugra');

  const debug = await request(`/api/dev/sms-simulator/debug/${session.session_id}`);
  assert.equal(debug.response.status, 200);
  assert.equal(debug.body.character_creation_step, 'race');
  assert.equal(debug.body.character_creation_draft.name, 'Debugra');

  const renderedThread = listSmsMessages(session.session_id)
    .map((message) => message.rendered_text ?? message.raw_text)
    .join('\n');
  assert.doesNotMatch(renderedThread, /character_creation_draft|onboarding_state|account_id/);
});
