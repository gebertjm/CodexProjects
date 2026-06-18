import { createHttpError } from '../utils/httpError.js';
import { renderSmsTemplate } from './smsOutboundFormatter.js';
import { resolveSmsIdentity } from './smsIdentityResolver.js';
import { handleSmsOnboardingInbound } from './smsOnboardingService.js';
import {
  handleSmsConversation,
  storeInbound,
} from './smsConversationService.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export async function handleSmsInbound(input = {}) {
  const text = normalizeText(input.message ?? input.Body ?? input.body);

  if (!text) {
    throw createHttpError('message is required', 400);
  }

  const identity = resolveSmsIdentity({
    session_id: input.session_id,
    phone_number: input.phone_number ?? input.From,
  });

  if (!identity.session) {
    if (!input.session_id && (input.phone_number || input.From)) {
      const onboarding = await handleSmsOnboardingInbound({
        session: null,
        phone_number: input.phone_number ?? input.From,
        text,
        transport: input.transport ?? 'twilio',
      });

      if (onboarding.handled) {
        return {
          session: onboarding.session ?? null,
          inbound_message: null,
          outbound_message: onboarding.message,
          outbound_messages: onboarding.outbound_messages ?? (onboarding.message ? [onboarding.message] : []),
          rendered: onboarding.rendered,
          rendered_messages: onboarding.rendered_messages ?? (onboarding.rendered ? [onboarding.rendered] : []),
          account: onboarding.account,
          suppressed: onboarding.suppressed ?? false,
        };
      }

      const rendered = renderSmsTemplate('sms.unknown_number', {
        brand_name: 'DailyTTRPG',
        support_email: 'dailyttrpg@gmail.com',
      });

      return {
        session: null,
        inbound_message: null,
        outbound_message: {
          direction: 'outbound',
          transport: input.transport ?? 'simulator',
          phone_number: input.phone_number ?? input.From,
          rendered_text: rendered.message,
          template_id: rendered.template_id,
          status: 'not_sent_no_session',
          metadata: {
            category: rendered.category,
            warnings: rendered.warnings,
          },
        },
        rendered,
      };
    }

    throw createHttpError('Simulator session not found', 404);
  }

  const inbound = storeInbound(identity.session, text, {
    transport: input.transport ?? 'simulator',
    raw_payload: input.raw_payload ?? null,
  });

  const onboarding = await handleSmsOnboardingInbound({
    session: inbound.session,
    phone_number: inbound.session.phone_number,
    text,
    transport: input.transport ?? 'simulator',
  });

  if (onboarding.handled) {
    return {
      session: onboarding.session ?? inbound.session,
      inbound_message: inbound.message,
      outbound_message: onboarding.message,
      outbound_messages: onboarding.outbound_messages ?? (onboarding.message ? [onboarding.message] : []),
      rendered: onboarding.rendered,
      rendered_messages: onboarding.rendered_messages ?? (onboarding.rendered ? [onboarding.rendered] : []),
      account: onboarding.account,
      suppressed: onboarding.suppressed ?? false,
    };
  }

  const refreshedIdentity = {
    ...resolveSmsIdentity({ session_id: inbound.session.session_id }),
    session: onboarding.session ?? inbound.session,
  };
  const outbound = await handleSmsConversation(refreshedIdentity, text);

  return {
    session: outbound.session,
    inbound_message: inbound.message,
    outbound_message: outbound.message,
    outbound_messages: outbound.outbound_messages ?? (outbound.message ? [outbound.message] : []),
    rendered: outbound.rendered,
    rendered_messages: outbound.rendered_messages ?? (outbound.rendered ? [outbound.rendered] : []),
    suppressed: outbound.suppressed ?? false,
  };
}
