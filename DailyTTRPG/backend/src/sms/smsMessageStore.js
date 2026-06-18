import { normalizePhoneNumber } from '../utils/phone.js';
import { createHttpError } from '../utils/httpError.js';

const sessions = new Map();
const messages = new Map();

let sessionCounter = 1;
let messageCounter = 1;

function nowIso() {
  return new Date().toISOString();
}

function nextSessionId() {
  const value = sessionCounter;
  sessionCounter += 1;
  return `sms_sim_${String(value).padStart(4, '0')}`;
}

function nextMessageId() {
  const value = messageCounter;
  messageCounter += 1;
  return `sms_msg_${String(value).padStart(6, '0')}`;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) {
    throw createHttpError('Simulator session not found', 404);
  }

  return session;
}

function touchSession(sessionId) {
  const session = assertSession(sessionId);
  session.updated_at = nowIso();
  session.last_message_at = session.updated_at;
  sessions.set(sessionId, session);
  return session;
}

export function resetSmsMessageStoreForTests() {
  sessions.clear();
  messages.clear();
  sessionCounter = 1;
  messageCounter = 1;
}

export function createSmsSimulatorSession(input = {}) {
  const phoneNumber = normalizeOptionalString(input.phone_number) ?? `+1555000${String(sessionCounter).padStart(4, '0')}`;
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const sessionId = nextSessionId();
  const createdAt = nowIso();
  const activeCharacterId = normalizeOptionalString(input.active_sms_character_id);
  const inputState = normalizeMetadata(input.state);
  const session = {
    session_id: sessionId,
    phone_number: phoneNumber,
    phone_number_normalized: normalizedPhone,
    user_id: normalizeOptionalString(input.user_id) ?? `test_user_${sessionId}`,
    account_id: normalizeOptionalString(input.account_id),
    active_sms_character_id: activeCharacterId,
    campaign_id: normalizeOptionalString(input.campaign_id),
    active_sms_character_name: normalizeOptionalString(input.active_sms_character_name) ?? 'Adventurer',
    character_status: normalizeOptionalString(input.character_status) ?? 'active',
    verified: input.verified !== false,
    status: normalizeOptionalString(input.status) ?? 'active',
    created_at: createdAt,
    updated_at: createdAt,
    last_message_at: null,
    state: {
      current_context: 'No adventure prompt has started yet.',
      current_objective: null,
      active_thread: 'setup',
      current_scene: null,
      current_options: [],
      allow_free_text: true,
      action_window: null,
      last_inbound_payload: null,
      last_outbound_payload: null,
      last_rendered_template_id: null,
      last_backend_warnings: [],
      last_backend_errors: [],
      default_actions_applied: [],
      selected_opportunity_id: null,
      runtime_state_id: null,
      onboarding_state: activeCharacterId ? 'active_play' : 'awaiting_start',
      onboarding_substate: null,
      onboarding_resume_pending: false,
      account_id: normalizeOptionalString(input.account_id),
      ...inputState,
    },
    metadata: normalizeMetadata(input.metadata),
  };

  sessions.set(sessionId, session);
  messages.set(sessionId, []);
  return clone(session);
}

export function listSmsSimulatorSessions() {
  return Array.from(sessions.values())
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map(clone);
}

export function getSmsSimulatorSession(sessionId) {
  const session = sessions.get(sessionId);
  return session ? clone(session) : null;
}

export function getSmsSimulatorSessionByPhone(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const session = Array.from(sessions.values()).find(
    (entry) => entry.phone_number_normalized === normalizedPhone
  );
  return session ? clone(session) : null;
}

export function updateSmsSimulatorSession(sessionId, updates = {}) {
  const session = assertSession(sessionId);
  const next = {
    ...session,
    ...updates,
    state: {
      ...session.state,
      ...normalizeMetadata(updates.state),
    },
    metadata: {
      ...session.metadata,
      ...normalizeMetadata(updates.metadata),
    },
    updated_at: nowIso(),
  };

  sessions.set(sessionId, next);
  return clone(next);
}

export function appendSmsMessage(input = {}) {
  const session = touchSession(input.session_id);
  const direction = normalizeOptionalString(input.direction);

  if (!['inbound', 'outbound'].includes(direction)) {
    throw createHttpError('direction must be inbound or outbound', 400);
  }

  const message = {
    message_id: nextMessageId(),
    session_id: session.session_id,
    direction,
    transport: normalizeOptionalString(input.transport) ?? 'simulator',
    phone_number: session.phone_number,
    user_id: session.user_id,
    character_id: session.active_sms_character_id,
    raw_text: normalizeOptionalString(input.raw_text),
    rendered_text: normalizeOptionalString(input.rendered_text),
    template_id: normalizeOptionalString(input.template_id),
    status: normalizeOptionalString(input.status) ?? 'sent',
    created_at: nowIso(),
    metadata: normalizeMetadata(input.metadata),
  };

  const thread = messages.get(session.session_id) ?? [];
  thread.push(message);
  messages.set(session.session_id, thread);

  return clone(message);
}

export function listSmsMessages(sessionId, { afterMessageId = null, limit = 100 } = {}) {
  assertSession(sessionId);
  const thread = messages.get(sessionId) ?? [];
  const startIndex = afterMessageId
    ? Math.max(
        0,
        thread.findIndex((message) => message.message_id === afterMessageId) + 1
      )
    : 0;

  return thread
    .slice(startIndex, startIndex + limit)
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map(clone);
}

export function clearSmsSimulatorSession(sessionId) {
  const session = assertSession(sessionId);
  messages.set(sessionId, []);
  const resetSession = {
    ...session,
    updated_at: nowIso(),
    last_message_at: null,
    state: {
      current_context: 'No adventure prompt has started yet.',
      current_objective: null,
      active_thread: 'setup',
      current_scene: null,
      current_options: [],
      allow_free_text: true,
      action_window: null,
      last_inbound_payload: null,
      last_outbound_payload: null,
      last_rendered_template_id: null,
      last_backend_warnings: [],
      last_backend_errors: [],
      default_actions_applied: [],
      selected_opportunity_id: null,
      runtime_state_id: null,
      onboarding_state: session.active_sms_character_id ? 'active_play' : 'awaiting_start',
      onboarding_substate: null,
      onboarding_resume_pending: false,
      account_id: session.account_id ?? null,
    },
  };
  sessions.set(sessionId, resetSession);
  return clone(resetSession);
}
