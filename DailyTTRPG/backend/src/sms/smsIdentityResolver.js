import { createHttpError } from '../utils/httpError.js';
import {
  getSmsSimulatorSession,
  getSmsSimulatorSessionByPhone,
} from './smsMessageStore.js';

export function resolveSmsIdentity(input = {}) {
  const sessionId = input.session_id ? String(input.session_id).trim() : null;
  const phoneNumber = input.phone_number ? String(input.phone_number).trim() : null;
  const session = sessionId
    ? getSmsSimulatorSession(sessionId)
    : phoneNumber
      ? getSmsSimulatorSessionByPhone(phoneNumber)
      : null;

  if (!session) {
    return {
      status: 'unknown_session',
      session: null,
      reason: 'No simulator session matches this inbound SMS payload.',
    };
  }

  if (session.verified === false) {
    return {
      status: 'unverified_user',
      session,
      reason: 'The simulator account is not verified for SMS play.',
    };
  }

  if (!session.active_sms_character_id) {
    return {
      status: 'no_active_character',
      session,
      reason: 'No active SMS character is selected.',
    };
  }

  if (session.character_status === 'dead') {
    return {
      status: 'character_dead',
      session,
      reason: 'The active SMS character can no longer continue.',
    };
  }

  if (!session.campaign_id) {
    return {
      status: 'not_in_campaign',
      session,
      reason: 'The active SMS character is not assigned to a campaign.',
    };
  }

  return {
    status: 'resolved',
    session,
    reason: null,
  };
}

export function requireSimulatorSession(sessionId) {
  const session = getSmsSimulatorSession(sessionId);

  if (!session) {
    throw createHttpError('Simulator session not found', 404);
  }

  return session;
}
