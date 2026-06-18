import { query } from '../config/db.js';
import { SMS_INTERACTION_BUDGET_CONFIG } from './smsCampaignConfig.js';
import { updateSmsSimulatorSession } from './smsMessageStore.js';

const EXEMPT_COMMANDS = new Set(['HELP', 'STOP']);
const NON_SUBSTANTIVE_COMMANDS = new Set(['STATUS', 'RECAP', 'SUMMARY', 'OBJECTIVE']);
const NON_SUBSTANTIVE_PHRASES = [
  'where am i',
  "where i'm",
  'what is happening',
  "what's happening",
  'whats happening',
  'what do i know',
  'help me remember',
  'what is going on',
  "what's going on",
  'where are we',
  'current objective',
];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function localDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function activeActionTextExpected(session) {
  if (!session?.state) {
    return false;
  }

  return session.state.allow_free_text === true && session.state.action_window?.status === 'open';
}

export function classifySmsInteraction(text, session = null) {
  const normalized = normalizeText(text);
  const upper = normalizeUpper(normalized);
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return 'substantive';
  }

  if (EXEMPT_COMMANDS.has(upper)) {
    return 'exempt';
  }

  if (/^\d+$/.test(normalized)) {
    return 'substantive';
  }

  if (NON_SUBSTANTIVE_COMMANDS.has(upper)) {
    return 'non_substantive';
  }

  if (activeActionTextExpected(session)) {
    return 'substantive';
  }

  if (NON_SUBSTANTIVE_PHRASES.some((phrase) => lower.includes(phrase))) {
    return 'non_substantive';
  }

  return 'substantive';
}

async function loadBudgetMetadata(accountId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT sms_onboarding_metadata
      FROM account
      WHERE id = $1
    `,
    [accountId]
  );

  return normalizeObject(result.rows[0]?.sms_onboarding_metadata);
}

async function persistBudgetMetadata(accountId, metadata, executor = { query }) {
  await executor.query(
    `
      UPDATE account
      SET sms_onboarding_metadata = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `,
    [accountId, JSON.stringify(metadata)]
  );
}

export async function applySmsInteractionBudget({
  accountId,
  text,
  session = null,
  now = new Date(),
  executor = { query },
} = {}) {
  const classification = classifySmsInteraction(text, session);

  if (classification !== 'non_substantive') {
    return {
      classification,
      policy: 'allow',
      count: null,
      date: localDateKey(now),
      app_link: SMS_INTERACTION_BUDGET_CONFIG.sms_app_link,
    };
  }

  if (!accountId) {
    return {
      classification,
      policy: 'full_answer_with_app_link',
      count: 1,
      date: localDateKey(now),
      app_link: SMS_INTERACTION_BUDGET_CONFIG.sms_app_link,
      reason: 'no_account_budget_context',
    };
  }

  const metadata = await loadBudgetMetadata(accountId, executor);
  const date = localDateKey(now);
  const budget = normalizeObject(metadata.sms_interaction_budget);
  const daily = budget.date === date ? normalizeObject(budget) : { date, non_substantive_count: 0 };
  const nextCount = Number(daily.non_substantive_count ?? 0) + 1;
  const fullLimit = SMS_INTERACTION_BUDGET_CONFIG.daily_non_substantive_full_response_limit;
  const linkLimit = SMS_INTERACTION_BUDGET_CONFIG.daily_non_substantive_link_only_limit;
  const policy =
    nextCount <= fullLimit
      ? 'full_answer_with_app_link'
      : nextCount <= fullLimit + linkLimit
        ? 'app_link_only'
        : 'silent_ignore';
  const nextBudget = {
    ...daily,
    date,
    non_substantive_count: nextCount,
    last_non_substantive_at: now.toISOString(),
    last_policy: policy,
  };

  await persistBudgetMetadata(
    accountId,
    {
      ...metadata,
      sms_interaction_budget: nextBudget,
    },
    executor
  );

  return {
    classification,
    policy,
    count: nextCount,
    date,
    app_link: SMS_INTERACTION_BUDGET_CONFIG.sms_app_link,
  };
}

export function syncSmsBudgetDebug(session, decision) {
  if (!session?.session_id || !decision) {
    return session;
  }

  return updateSmsSimulatorSession(session.session_id, {
    state: {
      non_substantive_sms_count: decision.count,
      non_substantive_budget_date: decision.date,
      budget_decision: decision.policy,
      sms_interaction_classification: decision.classification,
    },
  });
}
