import { query, withTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { renderSmsTemplate } from './smsOutboundFormatter.js';
import { renderAndStoreOutbound } from './smsConversationService.js';
import {
  assignSmsCampaignForAccount,
  syncCampaignSessionState,
} from './smsCampaignAssignmentService.js';
import { updateSmsSimulatorSession } from './smsMessageStore.js';
import {
  getSmsCharacterCreationNextStepText,
  handleSmsCharacterCreation,
  restartSmsCharacterCreation,
  startSmsCharacterCreation,
} from './smsCharacterCreationService.js';

export const SMS_ONBOARDING_STATES = Object.freeze({
  UNKNOWN_PHONE: 'unknown_phone',
  AWAITING_START: 'awaiting_start',
  ONBOARDING_INTRO: 'onboarding_intro',
  CREATING_CHARACTER: 'creating_character',
  CHARACTER_CREATED: 'character_created',
  ASSIGNING_CAMPAIGN: 'assigning_campaign',
  CAMPAIGN_READY: 'campaign_ready',
  INTRO_STARTED: 'intro_started',
  ACTIVE_PLAY: 'active_play',
});

const startKeywords = new Set(['START', 'YES', 'BEGIN']);
const restartKeywords = new Set(['2', 'RESTART', 'START OVER', 'RESET']);
const continueKeywords = new Set(['1', 'YES', 'CONTINUE']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createPhoneDisplayName(phoneNumber) {
  const digits = String(phoneNumber ?? '').replace(/\D/g, '');
  const lastFour = digits.slice(-4) || 'SMS';
  return `SMS Player ${lastFour}`;
}

function mapAccount(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    phone_number: row.phone_number,
    phone_number_normalized: row.phone_number_normalized,
    display_name: row.display_name,
    sms_opt_in_at: row.sms_opt_in_at,
    sms_opt_out_at: row.sms_opt_out_at,
    active_character_id: row.active_character_id !== null ? Number(row.active_character_id) : null,
    onboarding_state: row.onboarding_state,
    onboarding_substate: row.onboarding_substate,
    last_active_at: row.last_active_at,
    sms_onboarding_draft_character_id:
      row.sms_onboarding_draft_character_id !== null
        ? Number(row.sms_onboarding_draft_character_id)
        : null,
    sms_onboarding_metadata: row.sms_onboarding_metadata ?? {},
    active_character_name: row.active_character_name ?? null,
    active_character_status: row.active_character_status ?? null,
    draft_character_name: row.draft_character_name ?? null,
    draft_character_status: row.draft_character_status ?? null,
  };
}

function accountSelectSql({ forUpdate = false } = {}) {
  return `
    SELECT
      account.id,
      account.phone_number,
      account.phone_number_normalized,
      account.display_name,
      account.sms_opt_in_at,
      account.sms_opt_out_at,
      account.active_character_id,
      account.onboarding_state,
      account.onboarding_substate,
      account.last_active_at,
      account.sms_onboarding_draft_character_id,
      account.sms_onboarding_metadata,
      active_character.name AS active_character_name,
      active_character.status AS active_character_status,
      draft_character.name AS draft_character_name,
      draft_character.status AS draft_character_status
    FROM account
    LEFT JOIN dnd5e_character active_character
      ON active_character.id = account.active_character_id
    LEFT JOIN dnd5e_character draft_character
      ON draft_character.id = account.sms_onboarding_draft_character_id
    WHERE account.phone_number_normalized = $1
    ${forUpdate ? 'FOR UPDATE OF account' : ''}
  `;
}

async function loadAccountByPhone(phoneNumber, executor = { query }, { forUpdate = false } = {}) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const result = await executor.query(accountSelectSql({ forUpdate }), [normalized]);
  return mapAccount(result.rows[0] ?? null);
}

async function createAccountForPhone(phoneNumber, executor = { query }) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const result = await executor.query(
    `
      INSERT INTO account (
        phone_number,
        phone_number_normalized,
        display_name,
        preferred_channel,
        onboarding_state,
        onboarding_substate,
        last_active_at
      )
      VALUES ($1, $2, $3, 'sms', 'awaiting_start', NULL, NOW())
      ON CONFLICT (phone_number_normalized)
        WHERE phone_number_normalized IS NOT NULL
      DO UPDATE SET
        last_active_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `,
    [phoneNumber, normalized, createPhoneDisplayName(phoneNumber)]
  );

  return loadAccountByPhone(phoneNumber, executor, { forUpdate: true });
}

async function updateAccountOnboarding(accountId, updates = {}, executor = { query }) {
  const fields = [];
  const values = [];

  function setField(column, value) {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  }

  if ('onboarding_state' in updates) {
    setField('onboarding_state', updates.onboarding_state);
  }

  if ('onboarding_substate' in updates) {
    setField('onboarding_substate', updates.onboarding_substate);
  }

  if ('sms_opt_in_at' in updates) {
    setField('sms_opt_in_at', updates.sms_opt_in_at);
  }

  if ('sms_opt_out_at' in updates) {
    setField('sms_opt_out_at', updates.sms_opt_out_at);
  }

  if ('active_character_id' in updates) {
    setField('active_character_id', updates.active_character_id);
  }

  if ('sms_onboarding_draft_character_id' in updates) {
    setField('sms_onboarding_draft_character_id', updates.sms_onboarding_draft_character_id);
  }

  if ('sms_onboarding_metadata' in updates) {
    setField('sms_onboarding_metadata', JSON.stringify(updates.sms_onboarding_metadata));
  }

  setField('last_active_at', updates.last_active_at ?? nowIso());

  values.push(accountId);
  await executor.query(
    `
      UPDATE account
      SET ${fields.join(', ')},
          updated_at = NOW()
      WHERE id = $${values.length}
    `,
    values
  );
}

async function updateLastActive(accountId, executor = { query }) {
  await executor.query(
    `
      UPDATE account
      SET last_active_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [accountId]
  );
}

function sessionSyncForAccount(account) {
  const characterCreation = normalizeObject(account.sms_onboarding_metadata?.character_creation);

  return {
    account_id: String(account.id),
    user_id: String(account.id),
    active_sms_character_id: account.active_character_id
      ? String(account.active_character_id)
      : null,
    active_sms_character_name: account.active_character_name ?? 'Adventurer',
    character_status: account.active_character_status ?? 'active',
    state: {
      account_id: String(account.id),
      onboarding_state: account.onboarding_state,
      onboarding_substate: account.onboarding_substate,
      onboarding_resume_pending: Boolean(account.sms_onboarding_metadata?.resume_pending),
      onboarding_draft_character_id: account.sms_onboarding_draft_character_id,
      onboarding_draft_name: account.draft_character_name,
      character_creation_step: characterCreation.step ?? account.onboarding_substate ?? null,
      character_creation_draft: normalizeObject(characterCreation.draft),
      sms_opted_out: Boolean(account.sms_opt_out_at),
    },
  };
}

function syncSession(session, account) {
  if (!session || !account) {
    return session;
  }

  return updateSmsSimulatorSession(session.session_id, sessionSyncForAccount(account));
}

function renderPhoneOnly(templateId, variables = {}, metadata = {}) {
  const rendered = renderSmsTemplate(templateId, {
    brand_name: 'DailyTTRPG',
    support_email: 'dailyttrpg@gmail.com',
    ...variables,
  });

  return {
    rendered,
    message: {
      direction: 'outbound',
      transport: metadata.transport ?? 'sms',
      phone_number: metadata.phone_number ?? null,
      rendered_text: rendered.message,
      template_id: rendered.template_id,
      status: 'rendered_no_session',
      metadata: {
        category: rendered.category,
        warnings: rendered.warnings,
        ...metadata,
      },
    },
    session: null,
  };
}

function renderOutbound(session, templateId, variables = {}, metadata = {}) {
  if (session) {
    return renderAndStoreOutbound(session, templateId, variables, {
      onboarding: true,
      ...metadata,
    });
  }

  return renderPhoneOnly(templateId, variables, metadata);
}

function shouldPromptResume(account, text) {
  const metadata = normalizeObject(account.sms_onboarding_metadata);

  if (metadata.resume_pending) {
    return false;
  }

  if (account.onboarding_state !== SMS_ONBOARDING_STATES.CREATING_CHARACTER) {
    return false;
  }

  if (!account.last_active_at) {
    return false;
  }

  if (startKeywords.has(normalizeUpper(text))) {
    return false;
  }

  const elapsedMs = Date.now() - new Date(account.last_active_at).getTime();
  const thresholdMs = env.SMS_ONBOARDING_RESUME_HOURS * 60 * 60 * 1000;
  return elapsedMs > thresholdMs;
}

function nextStepText(account) {
  if (account.onboarding_state === SMS_ONBOARDING_STATES.CREATING_CHARACTER) {
    return getSmsCharacterCreationNextStepText(account);
  }

  const substate = account.onboarding_substate ?? 'mode';

  switch (substate) {
    case 'mode':
      return 'Choose quick start or guided character creation.';
    case 'name':
      return 'Continue with your character name.';
    case 'class':
      return 'Continue with your class choice.';
    case 'species':
      return 'Continue with your species choice.';
    case 'background':
      return 'Continue with your background choice.';
    case 'confirm':
      return 'Review and confirm your character.';
    default:
      return 'Continue character creation.';
  }
}

async function loadOrCreateAccount(phoneNumber, executor = { query }) {
  const existing = await loadAccountByPhone(phoneNumber, executor, { forUpdate: true });

  if (existing) {
    return {
      account: existing,
      created: false,
    };
  }

  return {
    account: await createAccountForPhone(phoneNumber, executor),
    created: true,
  };
}

async function accountAfter(account, executor = { query }) {
  return loadAccountByPhone(account.phone_number, executor, { forUpdate: false });
}

const onboardingHelpers = {
  renderOutbound,
  syncSession,
  accountAfter,
  updateAccountOnboarding,
};

function renderCampaignFailure(session, assignment, transport, phoneNumber) {
  if (assignment?.result_type === 'character_dead') {
    return renderOutbound(session, 'campaign.character_dead', {
      character_name: assignment.character_name ?? 'Your character',
    }, {
      transport,
      phone_number: phoneNumber,
      assignment_result_type: assignment.result_type,
    });
  }

  if (assignment?.reason === 'missing_default_campaign_references') {
    return renderOutbound(session, 'campaign.no_available_campaign', {}, {
      transport,
      phone_number: phoneNumber,
      assignment_result_type: assignment?.result_type,
      assignment_failure_reason: assignment?.reason,
    });
  }

  return renderOutbound(session, 'campaign.assignment_failed', {}, {
    transport,
    phone_number: phoneNumber,
    assignment_result_type: assignment?.result_type ?? 'assignment_failed',
    assignment_failure_reason: assignment?.reason ?? 'unknown',
  });
}

function renderCampaignIntroSequence(session, assignment, transport, phoneNumber) {
  const syncedCampaignSession = syncCampaignSessionState(session, assignment, assignment.prompt);

  if (assignment.result_type === 'resumed_existing_campaign') {
    const resumed = renderOutbound(syncedCampaignSession, 'campaign.resume_existing', {
      resume_summary: 'Welcome back. Your Greyvale adventure continues. Reply STATUS for the latest.',
    }, {
      transport,
      phone_number: phoneNumber,
      assignment_result_type: assignment.result_type,
    });

    return {
      first: resumed,
      messages: [resumed.message],
      rendered: [resumed.rendered],
      session: resumed.session,
    };
  }

  const intro = renderOutbound(syncedCampaignSession, 'intro.world_entry', {
    world_intro:
      'Your story begins in Greyvale, on the old road near Dunmere. Evening settles over the lowlands, and the air feels too still.',
  }, {
    transport,
    phone_number: phoneNumber,
    assignment_result_type: assignment.result_type,
  });
  const prompt = renderOutbound(intro.session, 'intro.first_prompt', {
    scene_prompt: assignment.prompt?.scene_description ??
      'Ahead, a caravan leans broken in the mud. No voices. No horses.',
    options: assignment.prompt?.options ?? [
      'Inspect the caravan',
      'Search for survivors',
      'Examine the tracks',
      'Continue to the inn',
    ],
  }, {
    transport,
    phone_number: phoneNumber,
    assignment_result_type: assignment.result_type,
  });

  return {
    first: intro,
    messages: [intro.message, prompt.message],
    rendered: [intro.rendered, prompt.rendered],
    session: prompt.session,
  };
}

async function assignAndRenderCampaignIntro({
  account,
  session,
  transport,
  phoneNumber,
  executor,
  includePriorOutbound = null,
} = {}) {
  const assignment = await assignSmsCampaignForAccount({
    account,
    characterId: account.active_character_id,
    executor,
  });

  if (!['assigned_new_campaign', 'resumed_existing_campaign'].includes(assignment.result_type)) {
    const failure = renderCampaignFailure(session, assignment, transport, phoneNumber);
    const latestAccount = await accountAfter(account, executor);
    return {
      handled: true,
      account: latestAccount ?? account,
      assignment,
      session: failure.session,
      message: includePriorOutbound?.message ?? failure.message,
      outbound_message: includePriorOutbound?.message ?? failure.message,
      rendered: includePriorOutbound?.rendered ?? failure.rendered,
      outbound_messages: includePriorOutbound
        ? [includePriorOutbound.message, failure.message]
        : [failure.message],
      rendered_messages: includePriorOutbound
        ? [includePriorOutbound.rendered, failure.rendered]
        : [failure.rendered],
    };
  }

  const intro = renderCampaignIntroSequence(session, assignment, transport, phoneNumber);
  const latestAccount = await accountAfter(account, executor);
  const outboundMessages = includePriorOutbound
    ? [includePriorOutbound.message, ...intro.messages]
    : intro.messages;
  const renderedMessages = includePriorOutbound
    ? [includePriorOutbound.rendered, ...intro.rendered]
    : intro.rendered;

  return {
    handled: true,
    account: latestAccount ?? account,
    assignment,
    session: intro.session,
    message: includePriorOutbound?.message ?? intro.first.message,
    outbound_message: includePriorOutbound?.message ?? intro.first.message,
    rendered: includePriorOutbound?.rendered ?? intro.first.rendered,
    outbound_messages: outboundMessages,
    rendered_messages: renderedMessages,
  };
}

export async function getSmsOnboardingAccountByPhone(phoneNumber) {
  return loadAccountByPhone(phoneNumber);
}

export async function resetSmsOnboardingForPhone(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  await withTransaction(async (client) => {
    const accountResult = await client.query(
      'SELECT id FROM account WHERE phone_number_normalized = $1',
      [normalized]
    );

    for (const account of accountResult.rows) {
      await client.query(
        `
          DELETE FROM dnd5e_campaign campaign
          WHERE campaign.created_by_account_id = $1
            AND campaign.slug LIKE 'sms-%'
        `,
        [account.id]
      );
    }

    await client.query('DELETE FROM account WHERE phone_number_normalized = $1', [normalized]);
  });
}

export async function setSmsOnboardingLastActiveAt(phoneNumber, lastActiveAt) {
  const normalized = normalizePhoneNumber(phoneNumber);
  await query(
    `
      UPDATE account
      SET last_active_at = $2,
          updated_at = NOW()
      WHERE phone_number_normalized = $1
    `,
    [normalized, lastActiveAt]
  );
}

export async function handleSmsOnboardingInbound({
  session = null,
  phone_number,
  text,
  transport = 'simulator',
} = {}) {
  const phoneNumber = phone_number ?? session?.phone_number;

  if (!phoneNumber) {
    return {
      handled: false,
    };
  }

  return withTransaction(async (client) => {
    const normalizedText = normalizeText(text);
    const upper = normalizeUpper(normalizedText);
    const { account, created } = await loadOrCreateAccount(phoneNumber, client);
    let syncedSession = syncSession(session, account);

    if (upper === 'HELP') {
      await updateLastActive(account.id, client);
      const outbound = renderOutbound(syncedSession, 'sms.help');
      return {
        handled: true,
        account,
        ...outbound,
      };
    }

    if (upper === 'STOP') {
      await updateAccountOnboarding(
        account.id,
        {
          onboarding_state: SMS_ONBOARDING_STATES.AWAITING_START,
          onboarding_substate: null,
          sms_opt_out_at: nowIso(),
          sms_onboarding_metadata: {
            ...(account.sms_onboarding_metadata ?? {}),
            stopped_at: nowIso(),
            resume_pending: false,
          },
        },
        client
      );
      const stoppedAccount = await accountAfter(account, client);
      syncedSession = syncSession(syncedSession, stoppedAccount);
      const outbound = renderOutbound(syncedSession, 'sms.stop_confirmation');
      return {
        handled: true,
        account: stoppedAccount,
        ...outbound,
      };
    }

    if (account.sms_opt_out_at && !startKeywords.has(upper)) {
      await updateLastActive(account.id, client);
      return {
        handled: true,
        account,
        session: syncedSession,
        message: null,
        outbound_message: null,
        rendered: null,
        suppressed: true,
        reason: 'sms_opted_out',
      };
    }

    if (created) {
      const outbound = renderOutbound(syncedSession, 'onboarding.welcome', {
        brand_name: 'DailyTTRPG',
      }, {
        transport,
        phone_number: phoneNumber,
      });
      return {
        handled: true,
        account,
        ...outbound,
      };
    }

    if (shouldPromptResume(account, normalizedText)) {
      const metadata = {
        ...(account.sms_onboarding_metadata ?? {}),
        resume_pending: true,
        resume_state: account.onboarding_state,
        resume_substate: account.onboarding_substate,
      };
      await updateAccountOnboarding(
        account.id,
        {
          sms_onboarding_metadata: metadata,
        },
        client
      );
      const updatedAccount = await accountAfter(account, client);
      syncedSession = syncSession(syncedSession, updatedAccount);
      const outbound = renderOutbound(syncedSession, 'onboarding.resume_confirm', {
        resume_context: 'You were creating a character. Continue?',
        options: ['Yes', 'Start over'],
      });

      return {
        handled: true,
        account: updatedAccount,
        ...outbound,
      };
    }

    if (account.sms_onboarding_metadata?.resume_pending) {
      if (restartKeywords.has(upper)) {
        await restartSmsCharacterCreation(account, onboardingHelpers, client);
        const updatedAccount = await accountAfter(account, client);
        syncedSession = syncSession(syncedSession, updatedAccount);
        const outbound = renderOutbound(syncedSession, 'character.mode_select', {
          options: ['Quick start - fastest, smart defaults', 'Guided - more choices'],
        });
        return {
          handled: true,
          account: updatedAccount,
          ...outbound,
        };
      }

      if (!continueKeywords.has(upper)) {
        const outbound = renderOutbound(syncedSession, 'onboarding.resume_confirm', {
          resume_context: 'You were creating a character. Continue?',
          options: ['Yes', 'Start over'],
        });
        return {
          handled: true,
          account,
          ...outbound,
        };
      }

      await updateAccountOnboarding(
        account.id,
        {
          sms_onboarding_metadata: {
            ...(account.sms_onboarding_metadata ?? {}),
            resume_pending: false,
          },
        },
        client
      );
      const updatedAccount = await accountAfter(account, client);
      syncedSession = syncSession(syncedSession, updatedAccount);
      const outbound = renderOutbound(syncedSession, 'character.creation_resume', {
        last_step: getSmsCharacterCreationNextStepText(updatedAccount).replace(/^Continue to /, ''),
        resume_hint: 'Reply with a listed choice to continue.',
      });
      return {
        handled: true,
        account: updatedAccount,
        ...outbound,
      };
    }

    if (account.onboarding_state === SMS_ONBOARDING_STATES.AWAITING_START) {
      if (!startKeywords.has(upper)) {
        await updateLastActive(account.id, client);
        const outbound = renderOutbound(syncedSession, 'onboarding.prompt_start');
        return {
          handled: true,
          account,
          ...outbound,
        };
      }

      await updateAccountOnboarding(
        account.id,
        {
          onboarding_state: SMS_ONBOARDING_STATES.ONBOARDING_INTRO,
          onboarding_substate: null,
          sms_opt_in_at: account.sms_opt_in_at ?? nowIso(),
          sms_opt_out_at: null,
          sms_onboarding_metadata: {
            ...(account.sms_onboarding_metadata ?? {}),
            started_at: nowIso(),
            resume_pending: false,
          },
        },
        client
      );
      const updatedAccount = await accountAfter(account, client);
      syncedSession = syncSession(syncedSession, updatedAccount);
      const outbound = renderOutbound(syncedSession, 'onboarding.intro');
      return {
        handled: true,
        account: updatedAccount,
        ...outbound,
      };
    }

    if (account.onboarding_state === SMS_ONBOARDING_STATES.ONBOARDING_INTRO) {
      if (upper === 'STATUS') {
        const outbound = renderOutbound(syncedSession, 'identity.character_required', {
          reason: 'Create a character before checking adventure status.',
        });
        return {
          handled: true,
          account,
          ...outbound,
        };
      }

      return startSmsCharacterCreation(account, syncedSession, onboardingHelpers, client);
    }

    if (account.onboarding_state === SMS_ONBOARDING_STATES.CREATING_CHARACTER) {
      if (upper === 'STATUS') {
        const outbound = renderOutbound(syncedSession, 'identity.character_required', {
          reason: 'Finish character creation before checking adventure status.',
        });
        return {
          handled: true,
          account,
          ...outbound,
        };
      }

      const creationResult = await handleSmsCharacterCreation({
        account,
        text: normalizedText,
        session: syncedSession,
        helpers: onboardingHelpers,
        executor: client,
      });

      const updatedAccount = await accountAfter(account, client);

      if (
        creationResult?.message?.template_id === 'character.created' &&
        updatedAccount?.onboarding_state === SMS_ONBOARDING_STATES.CHARACTER_CREATED
      ) {
        return assignAndRenderCampaignIntro({
          account: updatedAccount,
          session: creationResult.session ?? syncedSession,
          transport,
          phoneNumber,
          executor: client,
          includePriorOutbound: creationResult,
        });
      }

      return creationResult;
    }

    if (account.onboarding_state === SMS_ONBOARDING_STATES.CHARACTER_CREATED) {
      const updatedAccount = await accountAfter(account, client);
      syncedSession = syncSession(syncedSession, updatedAccount);
      return assignAndRenderCampaignIntro({
        account: updatedAccount,
        session: syncedSession,
        transport,
        phoneNumber,
        executor: client,
      });
    }

    if (account.onboarding_state === SMS_ONBOARDING_STATES.ACTIVE_PLAY) {
      await updateLastActive(account.id, client);
      const activeAccount = (await accountAfter(account, client)) ?? account;
      let playableSession = syncSession(syncedSession, activeAccount);
      const hasLiveCampaignContext =
        Boolean(playableSession?.campaign_id) &&
        (
          normalizeArray(playableSession.state?.current_options).length > 0 ||
          Boolean(playableSession.state?.action_window) ||
          playableSession.state?.intro_fast_path_active === true ||
          playableSession.state?.normal_sms_pacing_active === true
        );

      if (activeAccount.active_character_id && !hasLiveCampaignContext) {
        const assignment = await assignSmsCampaignForAccount({
          account: activeAccount,
          characterId: activeAccount.active_character_id,
          executor: client,
        });

        if (['assigned_new_campaign', 'resumed_existing_campaign'].includes(assignment.result_type)) {
          playableSession = syncCampaignSessionState(playableSession, assignment, assignment.prompt);
          return {
            handled: false,
            account: (await accountAfter(activeAccount, client)) ?? activeAccount,
            session: playableSession,
          };
        }

        return {
          handled: true,
          account: activeAccount,
          ...renderCampaignFailure(playableSession, assignment, transport, phoneNumber),
        };
      }

      return {
        handled: false,
        account: activeAccount,
        session: playableSession,
      };
    }

    await updateLastActive(account.id, client);
    const outbound = renderOutbound(syncedSession, 'onboarding.resume_continue', {
      next_step: 'Reply STATUS to continue.',
    });
    return {
      handled: true,
      account,
      ...outbound,
    };
  });
}
