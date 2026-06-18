import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_SMS_TEMPLATE_IDS,
  SMS_TEMPLATE_CATEGORIES,
  getSmsTemplate,
  listSmsTemplates,
} from '../src/sms/smsTemplateRegistry.js';
import {
  SmsTemplateRenderError,
  renderSmsTemplate,
} from '../src/sms/smsOutboundFormatter.js';
import { validateSmsTemplateRegistry } from '../src/sms/smsTemplateValidation.js';
import {
  renderSimulatorOutbound,
  renderSimulatorState,
  simulateSmsInboundReply,
} from '../src/services/smsSimulatorService.js';

const categoryByPrefix = [
  ['identity.', SMS_TEMPLATE_CATEGORIES.IDENTITY],
  ['gameplay.', SMS_TEMPLATE_CATEGORIES.GAMEPLAY],
  ['input.', SMS_TEMPLATE_CATEGORIES.INPUT],
  ['async.', SMS_TEMPLATE_CATEGORIES.ASYNC],
  ['party.', SMS_TEMPLATE_CATEGORIES.PARTY],
  ['catchup.', SMS_TEMPLATE_CATEGORIES.CATCHUP],
  ['combat.', SMS_TEMPLATE_CATEGORIES.COMBAT],
  ['level.', SMS_TEMPLATE_CATEGORIES.LEVEL],
  ['onboarding.', SMS_TEMPLATE_CATEGORIES.ONBOARDING],
  ['character.', SMS_TEMPLATE_CATEGORIES.CHARACTER],
  ['campaign.', SMS_TEMPLATE_CATEGORIES.CAMPAIGN],
  ['intro.', SMS_TEMPLATE_CATEGORIES.INTRO],
  ['command.', SMS_TEMPLATE_CATEGORIES.COMMAND],
];

function expectedCategory(templateId) {
  if (templateId.startsWith('system.')) {
    return SMS_TEMPLATE_CATEGORIES.LIMITS;
  }

  if (templateId.startsWith('sms.')) {
    return SMS_TEMPLATE_CATEGORIES.SYSTEM;
  }

  const match = categoryByPrefix.find(([prefix]) => templateId.startsWith(prefix));
  return match?.[1] ?? null;
}

function withoutVariable(variables, variableName) {
  const next = { ...variables };
  delete next[variableName];
  return next;
}

function assertNoUnsafeOutput(message) {
  assert.equal(typeof message, 'string');
  assert.ok(message.length > 0);
  assert.doesNotMatch(message, /\bundefined\b/i);
  assert.doesNotMatch(message, /\bnull\b/i);
  assert.doesNotMatch(message, /\[object Object\]/i);
  assert.doesNotMatch(message, /\bdebug\b/i);
  assert.doesNotMatch(message, /\binternal_id\b/i);
  assert.doesNotMatch(message, /\bhidden_flag\b/i);
  assert.doesNotMatch(message, /\bencounter_power\b/i);
  assert.doesNotMatch(message, /\bparty_power\b/i);
}

test('Stage 6A.0 SMS registry includes and renders every required template', () => {
  const templates = listSmsTemplates();
  const templateIds = new Set(templates.map((template) => template.template_id));
  const registryValidation = validateSmsTemplateRegistry();

  assert.equal(registryValidation.ok, true);
  assert.equal(registryValidation.template_count, REQUIRED_SMS_TEMPLATE_IDS.length);
  assert.deepEqual(registryValidation.errors, []);

  for (const requiredTemplateId of REQUIRED_SMS_TEMPLATE_IDS) {
    assert.ok(templateIds.has(requiredTemplateId), `${requiredTemplateId} exists`);
  }

  for (const template of templates) {
    assert.equal(template.category, expectedCategory(template.template_id));
    assert.ok(Array.isArray(template.required_variables));
    assert.ok(template.required_variables.length > 0);
    assert.ok(template.description);
    assert.ok(template.example_output);

    const rendered = renderSmsTemplate(template.template_id, template.example_variables);
    assertNoUnsafeOutput(rendered.message);
    assert.equal(rendered.template_id, template.template_id);
    assert.equal(rendered.category, template.category);

    if (rendered.message.length > template.max_length_guidance) {
      assert.ok(
        rendered.warnings.some((warning) => warning.code === 'sms.length_guidance_exceeded')
      );
    }

    const missingVariable = template.required_variables[0];
    assert.throws(
      () => renderSmsTemplate(template.template_id, withoutVariable(template.example_variables, missingVariable)),
      SmsTemplateRenderError,
      `${template.template_id} fails clearly when ${missingVariable} is missing`
    );
  }
});

test('Stage 6A.0 SMS formatter validates template IDs, variables, options, variations, and warnings', () => {
  assert.throws(
    () => renderSmsTemplate('sms.not_registered', {}),
    /Unknown SMS template ID/
  );

  assert.throws(
    () => renderSmsTemplate('sms.help', { brand_name: 'DailyTTRPG' }),
    /Missing required SMS template variables/
  );

  const optionalOmitted = renderSmsTemplate('gameplay.result', {
    result_text: 'You find a clue in the mud.',
  });
  assert.equal(optionalOmitted.message, 'You find a clue in the mud.');

  const variation = renderSmsTemplate('gameplay.adventure_prompt', {
    scene_description: 'A dark road bends into the trees.',
    atmosphere_line: 'You sense danger nearby.',
    options: ['Inspect', 'Wait'],
  });
  assert.match(variation.message, /You sense danger nearby\./);

  assert.throws(
    () =>
      renderSmsTemplate('gameplay.adventure_prompt', {
        scene_description: 'A dark road bends into the trees.',
        atmosphere_line: 'Unreviewed generated prose.',
        options: ['Inspect', 'Wait'],
      }),
    /not allowed/
  );

  const overlong = renderSmsTemplate('gameplay.result', {
    result_text: 'A'.repeat(301),
  });
  assert.ok(overlong.warnings.some((warning) => warning.code === 'sms.length_guidance_exceeded'));
  assert.ok(overlong.warnings.some((warning) => warning.code === 'sms.length_hard_warning'));

  assert.throws(
    () =>
      renderSmsTemplate('gameplay.adventure_prompt', {
        scene_description: 'A prompt.',
        options: ['Only one'],
      }),
    /requires 2-4 options/
  );

  const twoOptions = renderSmsTemplate('gameplay.adventure_prompt', {
    scene_description: 'A prompt.',
    options: ['Look', 'Leave'],
  });
  assert.match(twoOptions.message, /1\) Look\n2\) Leave/);

  const fourOptions = renderSmsTemplate('gameplay.adventure_prompt', {
    scene_description: 'A prompt.',
    options: ['Look', 'Listen', 'Wait', 'Leave'],
  });
  assert.match(fourOptions.message, /4\) Leave/);

  assert.throws(
    () =>
      renderSmsTemplate('gameplay.adventure_prompt', {
        scene_description: 'A prompt.',
        options: ['One', 'Two', 'Three', 'Four', 'Five'],
      }),
    /requires 2-4 options/
  );

  const noRawOptionIds = renderSmsTemplate('combat.prompt', {
    combat_situation: 'Rusk advances.',
    options: [
      { id: 'internal-attack-id', label: 'Strike' },
      { id: 'internal-defend-id', label: 'Defend' },
    ],
  });
  assert.match(noRawOptionIds.message, /1\) Strike\n2\) Defend/);
  assert.doesNotMatch(noRawOptionIds.message, /internal-attack-id/);

  const systemTemplates = listSmsTemplates().filter(
    (template) => template.category === SMS_TEMPLATE_CATEGORIES.SYSTEM
  );
  assert.ok(systemTemplates.every((template) => Object.keys(template.variation_slots).length === 0));

  const ignoredDebugFields = renderSmsTemplate('input.invalid', {
    retry_instruction: 'Reply with a listed number.',
    debug_json: '{"hidden_flag":true}',
    internal_id: 'abc123',
  });
  assertNoUnsafeOutput(ignoredDebugFields.message);
  assert.doesNotMatch(ignoredDebugFields.message, /abc123/);
});

test('Stage 6A.0 SMS category behavior stays concise, compliant, and player-safe', () => {
  const help = renderSmsTemplate('sms.help', {
    brand_name: 'DailyTTRPG',
    support_email: 'dailyttrpg@gmail.com',
  });
  assert.match(help.message, /STOP/);
  assert.match(help.message, /Msg freq varies/);
  assert.match(help.message, /Msg & data rates may apply/);
  assert.match(help.message, /dailyttrpg@gmail\.com/);

  const stop = renderSmsTemplate('sms.stop_confirmation', {
    brand_name: 'DailyTTRPG',
  });
  assert.match(stop.message, /unsubscribed/);

  const unknown = renderSmsTemplate('sms.unknown_number', {
    brand_name: 'DailyTTRPG',
    support_email: 'dailyttrpg@gmail.com',
    account_email: 'private@example.com',
  });
  assert.doesNotMatch(unknown.message, /private@example\.com/);
  assert.match(unknown.message, /not linked to an account/);

  const noCharacter = renderSmsTemplate('identity.no_active_character', {
    brand_name: 'DailyTTRPG',
  });
  assert.match(noCharacter.message, /Open the DailyTTRPG app/);

  const characterDead = renderSmsTemplate('identity.character_dead', {
    character_name: 'Rowan',
  });
  assert.match(characterDead.message, /can no longer continue/);
  assert.doesNotMatch(characterDead.message, /switch/i);

  const prompt = renderSmsTemplate('gameplay.adventure_prompt', {
    scene_description: 'The inn falls quiet.',
    options: ['Ask Tomas', 'Speak with Elin', 'Leave for Dunmere'],
  });
  assert.match(prompt.message, /1\) Ask Tomas\n2\) Speak with Elin\n3\) Leave for Dunmere/);

  const invalid = renderSmsTemplate('input.invalid', {
    retry_instruction: 'Reply with a number or a short action.',
  });
  assert.match(invalid.message, /Reply with a number or a short action/);

  const alreadyResponded = renderSmsTemplate('input.already_responded', {
    waiting_context: 'Waiting for the next story beat.',
  });
  assert.match(alreadyResponded.message, /Your action is recorded/);

  const duplicateGuidance = renderSmsTemplate('input.action_already_set_web_app', {
    app_link: 'https://dailyttrpg.com/play',
  });
  assert.match(duplicateGuidance.message, /already set/);
  assert.match(duplicateGuidance.message, /https:\/\/dailyttrpg\.com\/play/);

  const late = renderSmsTemplate('input.late_response', {
    current_state: "You'll receive the next prompt when the story continues.",
  });
  assert.match(late.message, /beat has already resolved/);

  const noPrompt = renderSmsTemplate('input.no_active_prompt', {
    app_link: 'https://dailyttrpg.com/play',
  });
  assert.match(noPrompt.message, /active prompt/);

  const waiting = renderSmsTemplate('async.response_received_waiting', {
    waiting_reason: 'Waiting for the party or the next progression window.',
  });
  assert.match(waiting.message, /Action recorded/);
  assert.doesNotMatch(waiting.message, /default/i);

  const defaultAction = renderSmsTemplate('async.default_applied', {
    default_action: 'keep watch and avoid direct risk',
  });
  assert.match(defaultAction.message, /keep watch/);
  assert.doesNotMatch(defaultAction.message, /failed|punished|ignored/i);

  const missed = renderSmsTemplate('party.missed_participation', {
    safe_default: 'stayed alert and followed the group',
  });
  assert.match(missed.message, /You were away/);
  assert.doesNotMatch(missed.message, /blame|fault|failed/i);

  const catchup = renderSmsTemplate('catchup.summary', {
    summary: 'the shrine fight ended',
    player_action: 'held position',
    current_state: 'the group is deciding what the hollow means.',
  });
  assert.match(catchup.message, /the shrine fight ended/);
  assert.match(catchup.message, /held position/);
  assert.match(catchup.message, /Current:/);

  const combatPrompt = renderSmsTemplate('combat.prompt', {
    combat_situation: 'Rusk lunges from the archway.',
    options: ['Strike', 'Defend', 'Try to talk him down'],
  });
  assert.match(combatPrompt.message, /1\) Strike\n2\) Defend\n3\) Try to talk him down/);

  const levelAvailable = renderSmsTemplate('level.available', {
    level_summary: 'The choice can wait until a safe pause.',
  });
  assert.match(levelAvailable.message, /Reply LEVEL when ready/);

  const levelDeferred = renderSmsTemplate('level.deferred', {
    defer_reason: 'combat is active',
  });
  assert.match(levelDeferred.message, /safe pause/);

  const spellChoice = renderSmsTemplate('level.spell_choice', {
    spell_context: 'Choose 1 curated spell for SMS play.',
    options: ['Shield', 'Magic Missile', 'Detect Magic'],
  });
  assert.match(spellChoice.message, /curated spell/);
  assert.match(spellChoice.message, /1\) Shield/);
  assert.doesNotMatch(spellChoice.message, /full spell list/i);

  const dailyLimit = renderSmsTemplate('system.daily_limit', {
    resume_time: 'tomorrow',
  });
  assert.match(dailyLimit.message, /Daily SMS limit reached/);

  const quietHours = renderSmsTemplate('system.quiet_hours', {
    resume_time: 'after 8 AM',
  });
  assert.match(quietHours.message, /Quiet hours/);
});

test('Stage 6A.0 SMS simulator service shares formatter output and does not leak debug data', () => {
  const formatterOutput = renderSmsTemplate('combat.prompt', {
    combat_situation: 'Rusk lunges from the archway.',
    options: ['Strike', 'Defend'],
  });
  const simulatorOutput = renderSimulatorOutbound('combat.prompt', {
    combat_situation: 'Rusk lunges from the archway.',
    options: ['Strike', 'Defend'],
  });

  assert.equal(simulatorOutput.thread_message, formatterOutput.message);
  assert.equal(simulatorOutput.template_id, 'combat.prompt');
  assert.equal(simulatorOutput.debug, undefined);

  const debugOutput = renderSimulatorOutbound(
    'combat.prompt',
    {
      combat_situation: 'Rusk lunges from the archway.',
      options: ['Strike', 'Defend'],
    },
    { includeDebug: true }
  );
  assert.equal(debugOutput.thread_message, formatterOutput.message);
  assert.ok(debugOutput.debug);
  assertNoUnsafeOutput(debugOutput.thread_message);

  const numericReply = simulateSmsInboundReply('2', {
    expected_options: ['Inspect', 'Move on'],
  });
  assert.equal(numericReply.template_id, 'system.silent_action_recorded');
  assert.equal(numericReply.thread_message, null);
  assert.equal(numericReply.no_outbound, true);

  const textReply = simulateSmsInboundReply('watch the treeline', {
    allow_free_text: true,
  });
  assert.equal(textReply.template_id, 'input.free_text_received');
  assert.match(textReply.thread_message, /watch the treeline/);

  const invalidReply = simulateSmsInboundReply('???');
  assert.equal(invalidReply.template_id, 'input.invalid');

  const noMatchReply = simulateSmsInboundReply('9', {
    expected_options: ['Inspect', 'Move on'],
  });
  assert.equal(noMatchReply.template_id, 'input.no_match');

  const asyncState = renderSimulatorState('async_waiting', {
    waiting_reason: 'Waiting for the party or the next progression window.',
  });
  assert.equal(asyncState.template_id, 'async.response_received_waiting');

  const combatState = renderSimulatorState('combat_prompt', {
    combat_situation: 'Rusk lunges.',
    options: ['Strike', 'Defend'],
  });
  assert.equal(combatState.template_id, 'combat.prompt');

  const levelAvailableState = renderSimulatorState('level_available', {
    level_summary: 'The choice can wait until a safe pause.',
  });
  assert.equal(levelAvailableState.template_id, 'level.available');

  const levelStartState = renderSimulatorState('level_start', {
    target_level: 2,
  });
  assert.equal(levelStartState.template_id, 'level.start');

  const catchupState = renderSimulatorState('catchup', {
    summary: 'the shrine fight ended',
    player_action: 'held position',
    current_state: 'the group is deciding what the hollow means.',
  });
  assert.equal(catchupState.template_id, 'catchup.summary');
});
