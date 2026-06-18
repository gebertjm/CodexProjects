import { listSmsTemplates } from '../sms/smsTemplateRegistry.js';
import { renderSmsTemplate } from '../sms/smsOutboundFormatter.js';

const defaultBrandVariables = {
  brand_name: 'DailyTTRPG',
  support_email: 'dailyttrpg@gmail.com',
};

const simulatorStateTemplateMap = {
  adventure_prompt: 'gameplay.adventure_prompt',
  async_waiting: 'async.response_received_waiting',
  combat_prompt: 'combat.prompt',
  level_available: 'level.available',
  level_start: 'level.start',
  catchup: 'catchup.summary',
};

function normalizeInboundText(value) {
  return String(value ?? '').trim();
}

function renderThreadMessage(templateId, variables, { includeDebug = false } = {}) {
  const rendered = renderSmsTemplate(templateId, {
    ...defaultBrandVariables,
    ...variables,
  });

  return {
    template_id: rendered.template_id,
    category: rendered.category,
    thread_message: rendered.message,
    warnings: rendered.warnings,
    ...(includeDebug
      ? {
          debug: {
            metadata: rendered.metadata,
            variables_used: Object.keys(variables ?? {}).sort(),
          },
        }
      : {}),
  };
}

export function listSmsSimulatorTemplates() {
  return listSmsTemplates().map((template) => ({
    template_id: template.template_id,
    category: template.category,
    description: template.description,
    required_variables: template.required_variables,
    optional_variables: template.optional_variables,
    example_output: template.example_output,
  }));
}

export function renderSimulatorOutbound(templateId, variables = {}, options = {}) {
  return renderThreadMessage(templateId, variables, options);
}

export function renderSimulatorState(state, variables = {}, options = {}) {
  const templateId = simulatorStateTemplateMap[state];

  if (!templateId) {
    return renderThreadMessage('input.no_match', {
      available_hint: 'Reply HELP for supported commands.',
    }, options);
  }

  return renderThreadMessage(templateId, variables, options);
}

export function simulateSmsInboundReply(input, context = {}) {
  const text = normalizeInboundText(input);
  const upper = text.toUpperCase();
  const expectedOptions = Array.isArray(context.expected_options) ? context.expected_options : [];

  if (upper === 'HELP') {
    return renderThreadMessage('sms.help', {});
  }

  if (upper === 'STOP') {
    return renderThreadMessage('sms.stop_confirmation', {});
  }

  if (upper === 'STATUS') {
    return renderThreadMessage('command.status', {
      current_context: context.current_context ?? 'Adventure in progress.',
      objective_line: context.objective_line ?? '',
      pending_line: context.pending_line ?? '',
    });
  }

  if (upper === 'LEVEL') {
    return renderThreadMessage('level.available', {
      level_summary: context.level_summary ?? 'The choice can wait until a safe pause.',
    });
  }

  if (/^\d+$/.test(text)) {
    const selectedIndex = Number(text) - 1;

    if (selectedIndex >= 0 && selectedIndex < expectedOptions.length) {
      const selected = expectedOptions[selectedIndex];
      const label =
        typeof selected === 'string'
          ? selected
          : selected?.label ?? selected?.text ?? selected?.title ?? 'your choice';

      const rendered = renderThreadMessage('system.silent_action_recorded', {
        silent_note: `valid action recorded: ${label}.`,
      });
      return {
        ...rendered,
        thread_message: null,
        no_outbound: true,
      };
    }

    return renderThreadMessage('input.no_match', {
      available_hint: 'Reply with one of the listed numbers.',
    });
  }

  if (text.length > 0 && context.allow_free_text === true) {
    return renderThreadMessage('input.free_text_received', {
      action_summary: text,
    });
  }

  return renderThreadMessage('input.invalid', {
    retry_instruction: 'Reply with a number or a short action.',
  });
}
