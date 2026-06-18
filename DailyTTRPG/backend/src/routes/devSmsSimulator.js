import express from 'express';

import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import {
  advanceSmsNextBeat,
  advanceSmsTimeBeat,
  closeSmsActionWindow,
  resolveSmsCombatBeat,
  resolveSmsThreshold,
  seedSmsAdventurePrompt,
  triggerSmsCatchup,
  triggerSmsCombatPrompt,
  triggerSmsHpRollResult,
  triggerSmsLevelAvailable,
  triggerSmsLevelComplete,
  triggerSmsSpellChoice,
} from '../sms/smsConversationService.js';
import { DEFAULT_SMS_CAMPAIGN_ASSIGNMENT } from '../sms/smsCampaignConfig.js';
import {
  resetSmsOnboardingForPhone,
} from '../sms/smsOnboardingService.js';
import { validateDefaultSmsCampaignAssignment } from '../sms/smsCampaignAssignmentService.js';
import { assertSmsSimulatorAccess, getSmsSimulatorAccessState } from '../sms/smsSimulatorAccess.js';
import {
  createSimulatorTransportSession,
  listSimulatorTransportMessages,
  listSimulatorTransportSessions,
  receiveSimulatorInbound,
} from '../sms/simulatorTransportAdapter.js';
import { clearSmsSimulatorSession, getSmsSimulatorSession } from '../sms/smsMessageStore.js';

const router = express.Router();

function requireAccess(req, _res, next) {
  try {
    assertSmsSimulatorAccess(req);
    next();
  } catch (error) {
    next(error);
  }
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      const result = await handler(req, res);

      if (!res.headersSent) {
        res.json(result);
      }
    } catch (error) {
      next(error);
    }
  };
}

function requireSession(sessionId) {
  const session = getSmsSimulatorSession(sessionId);

  if (!session) {
    throw createHttpError('Simulator session not found', 404);
  }

  return session;
}

function sessionIdFromBody(req) {
  return req.body?.session_id ?? req.body?.sessionId;
}

function currentDebugState(session) {
  const actionWindow = session.state.action_window ?? null;

  return {
    session_id: session.session_id,
    simulated_phone: session.phone_number,
    user_id: session.user_id,
    account_id: session.account_id ?? session.state.account_id ?? null,
    onboarding_state: session.state.onboarding_state ?? null,
    onboarding_substate: session.state.onboarding_substate ?? null,
    onboarding_resume_pending: session.state.onboarding_resume_pending ?? false,
    character_creation_step:
      session.state.character_creation_step ?? session.state.onboarding_substate ?? null,
    character_creation_draft: session.state.character_creation_draft ?? null,
    active_sms_character_id: session.active_sms_character_id,
    active_sms_character_name: session.active_sms_character_name,
    character_status: session.character_status,
    campaign_id: session.campaign_id,
    campaign_instance_id: session.state.campaign_instance_id ?? session.campaign_id ?? null,
    world_id: session.state.world_id ?? null,
    active_scene_id: session.state.active_scene_id ?? null,
    active_location_id: session.state.active_location_id ?? null,
    active_objective_id: session.state.active_objective_id ?? null,
    intro_fast_path_active: session.state.intro_fast_path_active ?? false,
    intro_fast_path_completed: session.state.intro_fast_path_completed ?? false,
    normal_sms_pacing_active: session.state.normal_sms_pacing_active ?? false,
    prompt_mode: session.state.prompt_mode ?? null,
    guidance_level: session.state.guidance_level ?? null,
    include_action_hints: session.state.include_action_hints ?? null,
    include_numbered_options: session.state.include_numbered_options ?? null,
    active_affordances: session.state.active_affordances ?? [],
    clarification_state: session.state.clarification_state ?? null,
    last_intent_resolver_status: session.state.last_intent_resolver_status ?? null,
    resolved_verb: session.state.resolved_verb ?? null,
    resolved_target_affordance: session.state.resolved_target_affordance ?? null,
    resolved_interaction_id: session.state.resolved_interaction_id ?? null,
    resolved_transition_id: session.state.resolved_transition_id ?? null,
    intent_confidence: session.state.intent_confidence ?? null,
    intent_reason: session.state.intent_reason ?? null,
    non_substantive_sms_count: session.state.non_substantive_sms_count ?? null,
    budget_decision: session.state.budget_decision ?? null,
    assignment_result_type: session.state.assignment_result_type ?? null,
    current_scene_context: session.state.current_context ?? null,
    current_objective: session.state.current_objective ?? null,
    active_thread: session.state.active_thread ?? null,
    active_action_window_id: actionWindow?.window_id ?? null,
    current_beat_id: actionWindow?.window_id ?? session.state.current_beat_id ?? null,
    action_window_state: actionWindow?.status ?? null,
    current_player_submitted: session.state.current_player_submitted ?? false,
    submitted_action_summary: session.state.submitted_action_summary ?? null,
    submitted_at: session.state.submitted_at ?? null,
    duplicate_attempt_count: session.state.duplicate_attempt_count ?? 0,
    duplicate_guidance_sent: session.state.duplicate_guidance_sent ?? false,
    participants_expected: actionWindow?.expected_participants ?? [],
    responses_received: actionWindow?.responses ?? [],
    pending_participants: actionWindow?.pending_participants ?? [],
    participants_submitted: actionWindow?.responses?.map((response) => response.session_id) ?? [],
    default_actions_pending:
      actionWindow && actionWindow.threshold_reached ? actionWindow.pending_participants ?? [] : [],
    advance_next_beat_will_apply_defaults:
      Boolean(actionWindow && actionWindow.status !== 'closed' && (actionWindow.pending_participants ?? []).length > 0),
    default_actions_applied:
      actionWindow?.default_actions_applied ?? session.state.default_actions_applied ?? [],
    selected_opportunity_id: session.state.selected_opportunity_id ?? null,
    last_inbound_payload: session.state.last_inbound_payload ?? null,
    last_outbound_payload: session.state.last_outbound_payload ?? null,
    last_rendered_template_id: session.state.last_rendered_template_id ?? null,
    last_response_policy_decision: session.state.last_response_policy_decision ?? null,
    last_silent_outcome_reason: session.state.last_silent_outcome_reason ?? null,
    last_beat_resolution_result: session.state.last_beat_resolution_result ?? null,
    previous_action_window_id: session.state.previous_action_window_id ?? null,
    next_action_window_id: session.state.next_action_window_id ?? null,
    runtime_state_before_last_advancement: session.state.runtime_state_before_last_advance ?? null,
    runtime_state_after_last_advancement: session.state.runtime_state_after_last_advance ?? null,
    last_beat_cycle_result: session.state.last_beat_cycle_result ?? null,
    created_result_message: session.state.beat_cycle_created_result_message ?? false,
    created_next_prompt: session.state.beat_cycle_created_next_prompt ?? false,
    reason_if_no_prompt: session.state.beat_cycle_reason_if_no_prompt ?? null,
    last_new_message_ids: session.state.beat_cycle_new_message_ids ?? [],
    idempotency_status: session.state.beat_cycle_idempotency_status ?? null,
    next_prompt_generated: session.state.next_prompt_generated ?? false,
    last_outbound_sent: session.state.last_outbound_sent ?? false,
    runtime_state_id: session.state.runtime_state_id ?? null,
    last_backend_warnings: session.state.last_backend_warnings ?? [],
    polling_status: {
      last_message_at: session.last_message_at,
      updated_at: session.updated_at,
    },
  };
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function generatedSimulatorPhone() {
  const suffix = String(Date.now()).slice(-7);
  return `+15559${suffix}`;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

const initialKnowledgeKeys = new Set([
  'knows_grey_road_exists',
  'knows_dunmere_nearby',
  'knows_road_is_normal_trade_route',
  'knows_character_is_traveling_region',
]);

function knowledgeLeaksHiddenTruth(row) {
  const key = String(row.knowledge_key ?? '').toLowerCase();
  const metadata = row.metadata_json && typeof row.metadata_json === 'object'
    ? row.metadata_json
    : {};

  return (
    metadata.hidden_truth === true ||
    key.includes('bandit') ||
    key.includes('shrine') ||
    key.includes('whisper') ||
    key.includes('presence') ||
    key.includes('disappear')
  );
}

function latestSessionAction(session) {
  const currentWindow = session.state?.action_window ?? null;
  const response = normalizeArray(currentWindow?.responses).find(
    (entry) =>
      entry.session_id === session.session_id ||
      String(entry.character_id ?? '') === String(session.active_sms_character_id ?? '')
  );

  if (!response) {
    return null;
  }

  return {
    exists: true,
    opportunity_id: response.response_key ?? response.submitted_action_payload?.key ?? null,
    summary: response.response_summary ?? response.submitted_action_payload?.label ?? null,
    action_window_id: currentWindow?.window_id ?? null,
    submitted_at: response.submitted_at ?? response.received_at ?? null,
    resolved: Boolean(response.resolved_at),
    resolved_at: response.resolved_at ?? null,
    duplicate_attempt_count: Number(response.duplicate_attempt_count ?? 0),
  };
}

async function currentPersistenceState(session) {
  const normalizedPhone = session.phone_number ? normalizePhoneNumber(session.phone_number) : null;
  const accountId = numericId(session.account_id ?? session.state.account_id);
  const accountResult = await query(
    `
      SELECT
        id,
        phone_number,
        phone_number_normalized,
        onboarding_state,
        onboarding_substate,
        active_character_id,
        last_active_at,
        sms_onboarding_metadata
      FROM account
      WHERE ($1::bigint IS NOT NULL AND id = $1::bigint)
         OR ($2::text IS NOT NULL AND phone_number_normalized = $2::text)
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [accountId, normalizedPhone]
  );
  const account = accountResult.rows[0] ?? null;
  const characterId = numericId(account?.active_character_id ?? session.active_sms_character_id);
  const characterResult = characterId
    ? await query(
        `
          SELECT id, account_id, name, status, is_active, level, created_via_sms, world_id
          FROM dnd5e_character
          WHERE id = $1
          LIMIT 1
        `,
        [characterId]
      )
    : { rows: [] };
  const character = characterResult.rows[0] ?? null;
  const membershipResult = characterId
    ? await query(
        `
          SELECT
            membership.id AS membership_id,
            membership.campaign_id,
            membership.character_id,
            membership.current_scene_id,
            membership.membership_status,
            membership.is_active_context,
            campaign.world_id,
            world.slug AS world_slug,
            campaign.slug AS campaign_slug,
            campaign.status AS campaign_status,
            scene.key AS scene_key,
            scene.location_id,
            location.key AS location_key
          FROM dnd5e_campaign_character membership
          JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
          JOIN dnd5e_world world ON world.id = campaign.world_id
          LEFT JOIN dnd5e_scene scene ON scene.id = membership.current_scene_id
          LEFT JOIN dnd5e_location location ON location.id = scene.location_id
          WHERE membership.character_id = $1
            AND membership.is_active_context = TRUE
          ORDER BY membership.updated_at DESC, membership.id DESC
          LIMIT 1
        `,
        [characterId]
      )
    : { rows: [] };
  const membership = membershipResult.rows[0] ?? null;
  const objectiveResult = membership?.campaign_id && characterId
    ? await query(
        `
          SELECT objective.key, objective.title, objective_state.status
          FROM dnd5e_character_objective objective_state
          JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
          JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
          WHERE quest_state.campaign_id = $1
            AND quest_state.character_id = $2
            AND objective_state.status = 'active'
          ORDER BY objective.sort_order ASC, objective.id ASC
          LIMIT 1
        `,
        [membership.campaign_id, characterId]
      )
    : { rows: [] };
  const knowledgeResult = membership?.campaign_id && characterId
    ? await query(
        `
      SELECT knowledge_key
           , metadata_json
          FROM dnd5e_character_knowledge
          WHERE campaign_id = $1
            AND character_id = $2
          ORDER BY knowledge_key ASC
        `,
        [membership.campaign_id, characterId]
      )
    : { rows: [] };
  const actionWindowResult = membership?.campaign_id && characterId
    ? await query(
        `
          SELECT id, status, window_type, prompt_text, suggested_action_key, resolved_at, resolution_summary
          FROM dnd5e_action_window
          WHERE campaign_id = $1
            AND character_id = $2
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `,
        [membership.campaign_id, characterId]
      )
    : { rows: [] };
  const logResult = membership?.campaign_id && characterId
    ? await query(
        `
          SELECT id, log_type, message, data_json, created_at
          FROM dnd5e_campaign_log
          WHERE campaign_id = $1
            AND character_id = $2
            AND log_type IN ('play_action', 'progression_window_response')
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        [membership.campaign_id, characterId]
      )
    : { rows: [] };
  const affordanceStateResult = membership?.campaign_id && characterId
    ? await query(
        `
          SELECT affordance_key, action_key, state, times_used, last_used_at
          FROM dnd5e_scene_affordance_state
          WHERE campaign_id = $1
            AND character_id = $2
            AND ($3::bigint IS NULL OR scene_id = $3)
          ORDER BY updated_at DESC, id DESC
        `,
        [membership.campaign_id, characterId, membership.current_scene_id ?? null]
      ).catch(() => ({ rows: [] }))
    : { rows: [] };
  const intentLogResult = membership?.campaign_id && characterId
    ? await query(
        `
          SELECT resolver_status, confidence, clarification_needed, external_ai_used, created_at
          FROM dnd5e_sms_intent_resolution_log
          WHERE campaign_id = $1
            AND character_id = $2
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        [membership.campaign_id, characterId]
      ).catch(() => ({ rows: [] }))
    : { rows: [] };
  const messages = listSimulatorTransportMessages(session.session_id);
  const sessionAction = latestSessionAction(session);
  const latestPlayLog = logResult.rows[0] ?? null;
  const initialFactCount = knowledgeResult.rows.filter((row) =>
    initialKnowledgeKeys.has(row.knowledge_key)
  ).length;
  const hiddenTruthLeaked = knowledgeResult.rows.some(knowledgeLeaksHiddenTruth);
  const actionWindow = actionWindowResult.rows[0] ?? null;
  const runtimeState = {
    scene_id: membership?.current_scene_id ? Number(membership.current_scene_id) : null,
    scene_key: membership?.scene_key ?? null,
    location_id: membership?.location_id ? Number(membership.location_id) : null,
    location_key: membership?.location_key ?? null,
    objective_key: objectiveResult.rows[0]?.key ?? null,
    objective_title: objectiveResult.rows[0]?.title ?? null,
    action_window_id: actionWindow?.id ? Number(actionWindow.id) : null,
    action_window_status: actionWindow?.status ?? null,
    action_window_prompt: actionWindow?.prompt_text ?? null,
  };

  return {
    session: {
      exists: true,
      session_id: session.session_id,
      phone_number: session.phone_number,
      status: session.status,
    },
    account: {
      exists: Boolean(account),
      id: account?.id ? Number(account.id) : null,
      phone_number: account?.phone_number ?? null,
      onboarding_state: account?.onboarding_state ?? null,
      onboarding_substate: account?.onboarding_substate ?? null,
      active_character_id: account?.active_character_id ? Number(account.active_character_id) : null,
      last_active_at: account?.last_active_at ?? null,
    },
    phone_mapping: {
      exists: Boolean(account?.phone_number_normalized),
      phone_number_normalized: account?.phone_number_normalized ?? null,
    },
    active_character: {
      exists: Boolean(character),
      id: character?.id ? Number(character.id) : null,
      account_id: character?.account_id ? Number(character.account_id) : null,
      name: character?.name ?? null,
      status: character?.status ?? null,
      is_active: character?.is_active ?? null,
      level: character?.level ?? null,
      created_via_sms: character?.created_via_sms ?? null,
    },
    dnd5e_character: {
      exists: Boolean(character),
      id: character?.id ? Number(character.id) : null,
    },
    campaign_instance: {
      exists: Boolean(membership?.campaign_id),
      id: membership?.campaign_id ? Number(membership.campaign_id) : null,
      slug: membership?.campaign_slug ?? null,
      status: membership?.campaign_status ?? null,
      world_id: membership?.world_id ? Number(membership.world_id) : null,
      world_slug: membership?.world_slug ?? null,
    },
    campaign_membership: {
      exists: Boolean(membership),
      id: membership?.membership_id ? Number(membership.membership_id) : null,
      status: membership?.membership_status ?? null,
      is_active_context: membership?.is_active_context ?? null,
    },
    runtime_state: runtimeState,
    runtime: runtimeState,
    knowledge: {
      keys: knowledgeResult.rows.map((row) => row.knowledge_key),
      initial_facts_count: initialFactCount,
      hidden_truth_leaked: hiddenTruthLeaked,
    },
    messages: {
      inbound_count: messages.filter((message) => message.direction === 'inbound').length,
      outbound_count: messages.filter((message) => message.direction === 'outbound').length,
    },
    last_action: sessionAction ?? {
      exists: Boolean(latestPlayLog),
      opportunity_id: latestPlayLog?.data_json?.action_key ?? null,
      summary: latestPlayLog?.message ?? null,
      action_window_id: actionWindow?.id ? Number(actionWindow.id) : null,
      submitted_at: null,
      resolved: Boolean(latestPlayLog),
      resolved_at: latestPlayLog?.created_at ?? null,
      duplicate_attempt_count: session.state?.duplicate_attempt_count ?? 0,
    },
    affordance_state: {
      rows: affordanceStateResult.rows.map((row) => ({
        affordance_key: row.affordance_key,
        action_key: row.action_key,
        state: row.state,
        times_used: Number(row.times_used ?? 0),
        last_used_at: row.last_used_at,
      })),
      resolved_count: affordanceStateResult.rows.filter((row) => row.state === 'resolved').length,
    },
    intent_resolution: {
      last: intentLogResult.rows[0] ?? null,
      external_ai_used: intentLogResult.rows[0]?.external_ai_used ?? false,
    },
    campaign: {
      instance_exists: Boolean(membership?.campaign_id),
      membership_exists: Boolean(membership),
      campaign_instance_id: membership?.campaign_id ? Number(membership.campaign_id) : null,
      world_id: membership?.world_slug ?? null,
      campaign_package_id: DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.campaign_package_id,
    },
  };
}

router.get('/enabled', (_req, res) => {
  res.json(getSmsSimulatorAccessState());
});

router.use(requireAccess);

router.post(
  '/session',
  asyncRoute((req) => {
    const session = createSimulatorTransportSession({
      phone_number: req.body?.phone_number,
      user_id: req.body?.user_id,
      active_sms_character_id: req.body?.active_sms_character_id,
      active_sms_character_name: req.body?.active_sms_character_name,
      campaign_id: req.body?.campaign_id,
      verified: req.body?.verified,
      character_status: req.body?.character_status,
      state: req.body?.state,
      metadata: req.body?.metadata,
    });

    return {
      session,
      initial_message: null,
    };
  })
);

router.post(
  '/create-fresh-session',
  asyncRoute(async (req) => {
    const phoneNumber = req.body?.phone_number ?? generatedSimulatorPhone();

    await resetSmsOnboardingForPhone(phoneNumber);

    const session = createSimulatorTransportSession({
      phone_number: phoneNumber,
      user_id: req.body?.user_id ?? `sms_simulator_${Date.now()}`,
      active_sms_character_id: null,
      active_sms_character_name: 'Adventurer',
      campaign_id: null,
      verified: req.body?.verified,
      state: {
        active_thread: 'onboarding',
        onboarding_state: 'awaiting_start',
        current_context: 'SMS onboarding has not started yet.',
        current_objective: null,
        current_options: [],
        action_window: null,
      },
      metadata: {
        created_via: 'create_fresh_session',
      },
    });

    return {
      session,
      initial_message: null,
      reset_database_state: true,
    };
  })
);

router.post(
  '/reset-test-user',
  asyncRoute(async (req) => {
    const sessionId = sessionIdFromBody(req);
    const session = sessionId ? requireSession(sessionId) : null;
    const phoneNumber = req.body?.phone_number ?? session?.phone_number;

    if (!phoneNumber) {
      throw createHttpError('phone_number or session_id is required', 400);
    }

    await resetSmsOnboardingForPhone(phoneNumber);

    if (session) {
      clearSmsSimulatorSession(session.session_id);
    }

    return {
      ok: true,
      phone_number: phoneNumber,
      session_id: session?.session_id ?? null,
    };
  })
);

router.post(
  '/seed-default-content',
  asyncRoute(async () => {
    const validation = await validateDefaultSmsCampaignAssignment();

    return {
      ok: validation.ok,
      config: DEFAULT_SMS_CAMPAIGN_ASSIGNMENT,
      refs: validation.refs ?? null,
      errors: validation.errors ?? [],
    };
  })
);

router.get(
  '/sessions',
  asyncRoute(() => ({
    sessions: listSimulatorTransportSessions(),
  }))
);

router.get(
  '/messages/:session_id',
  asyncRoute((req) => ({
    messages: listSimulatorTransportMessages(req.params.session_id, {
      afterMessageId: req.query.after,
      limit: req.query.limit,
    }),
  }))
);

router.post(
  '/inbound',
  asyncRoute((req) => {
    const sessionId = sessionIdFromBody(req);

    if (!sessionId) {
      throw createHttpError('session_id is required', 400);
    }

    return receiveSimulatorInbound({
      session_id: sessionId,
      message: req.body?.message,
      transport: 'simulator',
      raw_payload: req.body,
    });
  })
);

router.post(
  '/seed-prompt',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return seedSmsAdventurePrompt(session, req.body ?? {});
  })
);

router.post(
  '/advance-next-beat',
  asyncRoute(async (req) => {
    const session = requireSession(sessionIdFromBody(req));
    const result = await advanceSmsNextBeat(session);

    return {
      ...result,
      debug: {
        ...(result.debug ?? {}),
        simulator_state: currentDebugState(requireSession(session.session_id)),
      },
    };
  })
);

router.post(
  '/advance-window',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return advanceSmsTimeBeat(session);
  })
);

router.post(
  '/close-window',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return closeSmsActionWindow(session);
  })
);

router.post(
  '/resolve-threshold',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return resolveSmsThreshold(session);
  })
);

router.post(
  '/catchup',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return triggerSmsCatchup(session);
  })
);

router.post(
  '/combat-prompt',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return triggerSmsCombatPrompt(session);
  })
);

router.post(
  '/combat-resolve',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return resolveSmsCombatBeat(session);
  })
);

router.post(
  '/level-available',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return triggerSmsLevelAvailable(session);
  })
);

router.post(
  '/level-hp-roll',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return triggerSmsHpRollResult(session);
  })
);

router.post(
  '/level-spell-choice',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return triggerSmsSpellChoice(session);
  })
);

router.post(
  '/level-complete',
  asyncRoute((req) => {
    const session = requireSession(sessionIdFromBody(req));
    return triggerSmsLevelComplete(session);
  })
);

router.post(
  '/reset-session',
  asyncRoute((req) => {
    const sessionId = sessionIdFromBody(req);

    if (!sessionId) {
      throw createHttpError('session_id is required', 400);
    }

    clearSmsSimulatorSession(sessionId);

    return {
      ok: true,
      session_id: sessionId,
    };
  })
);

router.get(
  '/debug/:session_id',
  asyncRoute(async (req) => {
    const session = requireSession(req.params.session_id);

    return {
      ...currentDebugState(session),
      persistence: await currentPersistenceState(session),
    };
  })
);

router.get(
  '/persistence/:session_id',
  asyncRoute(async (req) => {
    const session = requireSession(req.params.session_id);

    return currentPersistenceState(session);
  })
);

export default router;
