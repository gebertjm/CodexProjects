import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import {
  buildCampaignStatusText,
  executeSmsRuntimeAction,
} from './smsCampaignAssignmentService.js';
import {
  applySmsInteractionBudget,
  classifySmsInteraction,
  syncSmsBudgetDebug,
} from './smsInteractionBudgetService.js';
import { renderSmsTemplate } from './smsOutboundFormatter.js';
import {
  buildClarificationState,
  resolveSmsExplorationIntent,
} from './smsIntentResolver.js';
import {
  SMS_RESPONSE_POLICY_OUTCOMES,
  buildSmsResponsePolicyDecision,
  duplicateGuidanceDecision,
  duplicateSilentIgnoreDecision,
  shouldSendActionConfirmation,
  silentActionRecordedDecision,
} from './smsResponsePolicyService.js';
import { advanceSmsSimulatorBeatCycle } from './smsSimulatorBeatCycleService.js';
import {
  appendSmsMessage,
  listSmsSimulatorSessions,
  updateSmsSimulatorSession,
} from './smsMessageStore.js';

const defaultTemplateVariables = {
  brand_name: 'DailyTTRPG',
  support_email: 'dailyttrpg@gmail.com',
};
const defaultAppLink = 'https://dailyttrpg.com/play';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeOptionLabel(option) {
  if (typeof option === 'string') {
    return option;
  }

  return option?.label ?? option?.text ?? option?.title ?? 'your choice';
}

function optionKey(option, index) {
  if (option && typeof option === 'object') {
    return option.key ?? option.id ?? String(index + 1);
  }

  return String(index + 1);
}

function buildActionPayload(option) {
  if (option && typeof option === 'object') {
    return {
      key: option.key ?? option.id ?? null,
      label: safeOptionLabel(option),
      action_type: option.action_type ?? null,
      payload: option.payload ?? null,
    };
  }

  return {
    key: null,
    label: safeOptionLabel(option),
    action_type: null,
    payload: null,
  };
}

function optionFromActionKey(options, actionKey) {
  return normalizeArray(options).find((option) => option?.key === actionKey) ?? null;
}

function clarificationIsActive(session) {
  const clarification = session.state?.clarification_state;

  if (!clarification) {
    return false;
  }

  if (
    clarification.expires_when_window_changes &&
    clarification.action_window_id &&
    clarification.action_window_id !== session.state?.action_window?.window_id
  ) {
    return false;
  }

  return true;
}

function policyState(decision, extras = {}) {
  return {
    last_response_policy_decision: decision,
    last_silent_outcome_reason: decision?.send_outbound === false ? decision.reason : null,
    last_outbound_sent: decision?.send_outbound === true,
    ...extras,
  };
}

function buildSuppressedResult(session, decision, reason = decision?.reason) {
  return {
    session,
    message: null,
    outbound_message: null,
    rendered: null,
    outbound_messages: [],
    rendered_messages: [],
    suppressed: true,
    reason,
    response_policy: decision,
  };
}

function getLatestSession(session) {
  return listSmsSimulatorSessions().find((entry) => entry.session_id === session.session_id) ?? session;
}

function activeCampaignSessions(session) {
  return listSmsSimulatorSessions().filter(
    (entry) => entry.campaign_id && entry.campaign_id === session.campaign_id && entry.status === 'active'
  );
}

function createDefaultActionWindow(session, overrides = {}) {
  const participants = activeCampaignSessions(session);
  const expectedParticipants = participants.length > 0 ? participants : [session];

  return {
    window_id: `sim_window_${Date.now().toString(36)}`,
    status: 'open',
    threshold_reached: false,
    created_at: nowIso(),
    updated_at: nowIso(),
    expected_participants: expectedParticipants.map((entry) => ({
      session_id: entry.session_id,
      user_id: entry.user_id,
      character_id: entry.active_sms_character_id,
      display_name: entry.active_sms_character_name,
    })),
    responses: [],
    pending_participants: expectedParticipants.map((entry) => entry.session_id),
    default_actions_applied: [],
    summary: null,
    ...overrides,
  };
}

function renderAndStoreOutbound(session, templateId, variables = {}, metadata = {}) {
  const rendered = renderSmsTemplate(templateId, {
    ...defaultTemplateVariables,
    ...variables,
  });
  const message = appendSmsMessage({
    session_id: session.session_id,
    direction: 'outbound',
    raw_text: null,
    rendered_text: rendered.message,
    template_id: rendered.template_id,
    status: 'sent',
    metadata: {
      category: rendered.category,
      warnings: rendered.warnings,
      ...metadata,
    },
  });

  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      last_outbound_payload: {
        template_id: rendered.template_id,
        variables,
        message_id: message.message_id,
      },
      last_rendered_template_id: rendered.template_id,
      last_backend_warnings: rendered.warnings,
      last_outbound_sent: true,
      ...(metadata.response_policy
        ? {
            last_response_policy_decision: metadata.response_policy,
            last_silent_outcome_reason: null,
          }
        : {}),
    },
  });

  return {
    rendered,
    message,
    session: updated,
  };
}

function storeInbound(session, text, metadata = {}) {
  const message = appendSmsMessage({
    session_id: session.session_id,
    direction: 'inbound',
    raw_text: text,
    rendered_text: text,
    template_id: null,
    status: 'received',
    metadata,
  });

  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      last_inbound_payload: {
        message,
        raw_text: text,
      },
    },
  });

  return {
    message,
    session: updated,
  };
}

function updateWindowResponse(session, selectedOption, selectedIndex) {
  const currentWindow = session.state.action_window ?? createDefaultActionWindow(session);
  const existingResponse = normalizeArray(currentWindow.responses).find(
    (response) =>
      response.session_id === session.session_id ||
      (response.character_id && response.character_id === session.active_sms_character_id)
  );

  if (currentWindow.status === 'closed' || currentWindow.threshold_reached) {
    return {
      kind: 'late',
      window: currentWindow,
    };
  }

  if (existingResponse) {
    const duplicateAttemptCount = Number(existingResponse.duplicate_attempt_count ?? 0) + 1;
    const shouldSendGuidance = !existingResponse.duplicate_guidance_sent_at;
    const updatedResponse = {
      ...existingResponse,
      duplicate_attempt_count: duplicateAttemptCount,
      duplicate_guidance_sent_at: existingResponse.duplicate_guidance_sent_at ?? nowIso(),
      last_duplicate_attempt_at: nowIso(),
    };
    const nextWindow = {
      ...currentWindow,
      responses: normalizeArray(currentWindow.responses).map((response) =>
        response === existingResponse ? updatedResponse : response
      ),
      updated_at: nowIso(),
    };
    const decision = shouldSendGuidance
      ? duplicateGuidanceDecision({
          window_id: currentWindow.window_id,
          duplicate_attempt_count: duplicateAttemptCount,
        })
      : duplicateSilentIgnoreDecision({
          window_id: currentWindow.window_id,
          duplicate_attempt_count: duplicateAttemptCount,
        });

    syncWindowForParticipants(nextWindow, {
      actorSessionId: session.session_id,
      actorState: {
      last_response_policy_decision: decision,
      last_silent_outcome_reason: shouldSendGuidance ? null : decision.reason,
      last_outbound_sent: shouldSendGuidance,
      current_player_submitted: true,
      submitted_action_summary: existingResponse.response_summary,
      submitted_at: existingResponse.submitted_at ?? existingResponse.received_at,
      duplicate_attempt_count: duplicateAttemptCount,
      duplicate_guidance_sent: true,
      },
    });

    return {
      kind: shouldSendGuidance ? 'duplicate_guidance' : 'duplicate_silent_ignore',
      window: nextWindow,
      response: updatedResponse,
      decision,
    };
  }

  const actionPayload = buildActionPayload(selectedOption);
  const nextResponses = [
    ...normalizeArray(currentWindow.responses),
    {
      session_id: session.session_id,
      character_id: session.active_sms_character_id,
      response_key: optionKey(selectedOption, selectedIndex),
      response_summary: safeOptionLabel(selectedOption),
      received_at: nowIso(),
      submitted_at: nowIso(),
      submitted_action_payload: actionPayload,
      submission_source: 'sms',
      sms_submission_locked: true,
      can_modify_in_web: true,
      duplicate_guidance_sent_at: null,
      duplicate_attempt_count: 0,
      resolved_at: null,
    },
  ];
  const pendingParticipants = normalizeArray(currentWindow.expected_participants)
    .map((participant) => participant.session_id)
    .filter((sessionId) => !nextResponses.some((response) => response.session_id === sessionId));
  const nextWindow = {
    ...currentWindow,
    responses: nextResponses,
    pending_participants: pendingParticipants,
    updated_at: nowIso(),
  };
  const decision = silentActionRecordedDecision({
    window_id: nextWindow.window_id,
    response_key: optionKey(selectedOption, selectedIndex),
  });
  syncWindowForParticipants(nextWindow, {
    actorSessionId: session.session_id,
    actorState: {
    selected_opportunity_id: optionKey(selectedOption, selectedIndex),
    current_player_submitted: true,
    submitted_action_summary: safeOptionLabel(selectedOption),
    submitted_at: nextResponses[nextResponses.length - 1].submitted_at,
    duplicate_attempt_count: 0,
    duplicate_guidance_sent: false,
    ...policyState(decision),
    },
  });

  return {
    kind: 'recorded',
    window: nextWindow,
    response: nextResponses[nextResponses.length - 1],
    decision,
  };
}

function syncWindowForParticipants(nextWindow, { actorSessionId = null, actorState = {}, sharedState = {} } = {}) {
  for (const participant of normalizeArray(nextWindow.expected_participants)) {
    const participantSession = listSmsSimulatorSessions().find(
      (entry) => entry.session_id === participant.session_id
    );

    if (participantSession) {
      const participantResponse = normalizeArray(nextWindow.responses).find(
        (response) => response.session_id === participant.session_id
      );
      updateSmsSimulatorSession(participantSession.session_id, {
        state: {
          action_window: nextWindow,
          current_player_submitted: Boolean(participantResponse),
          submitted_action_summary: participantResponse?.response_summary ?? null,
          submitted_at: participantResponse?.submitted_at ?? participantResponse?.received_at ?? null,
          duplicate_attempt_count: participantResponse?.duplicate_attempt_count ?? 0,
          duplicate_guidance_sent: Boolean(participantResponse?.duplicate_guidance_sent_at),
          ...sharedState,
          ...(participant.session_id === actorSessionId ? actorState : {}),
        },
      });
    }
  }
}

function summarizeStatus(session) {
  const pendingLine = session.state.action_window?.status === 'open'
    ? ' Pending: action window open.'
    : '';
  const objectiveLine = session.state.current_objective
    ? ` Objective: ${session.state.current_objective}.`
    : '';

  return {
    current_context: session.state.current_context ?? 'Adventure in progress.',
    objective_line: objectiveLine,
    pending_line: pendingLine,
  };
}

function buildLevelResponse(session) {
  if (session.state.unsafe_level_context) {
    return {
      templateId: 'level.deferred',
      variables: {
        defer_reason: session.state.unsafe_level_context,
      },
    };
  }

  if (session.state.level_up_started) {
    return {
      templateId: 'level.hp_choice',
      variables: {
        fixed_hp: session.state.fixed_hp ?? 6,
        hit_die: session.state.hit_die ?? 'd8',
      },
    };
  }

  if (session.state.level_up_available) {
    return {
      templateId: 'level.start',
      variables: {
        target_level: session.state.target_level ?? 2,
      },
      updates: {
        level_up_started: true,
      },
    };
  }

  return {
    templateId: 'command.level',
    variables: {
      level_status: 'no level-up is available right now.',
    },
  };
}

function identityTemplateFor(identity) {
  switch (identity.status) {
    case 'unknown_session':
      return {
        templateId: 'sms.unknown_number',
        variables: {},
      };
    case 'unverified_user':
      return {
        templateId: 'sms.unverified_user',
        variables: {},
      };
    case 'no_active_character':
      return {
        templateId: 'identity.no_active_character',
        variables: {},
      };
    case 'character_dead':
      return {
        templateId: 'identity.character_dead',
        variables: {
          character_name: identity.session?.active_sms_character_name ?? 'Your character',
        },
      };
    case 'not_in_campaign':
      return {
        templateId: 'identity.not_in_campaign',
        variables: {
          character_name: identity.session?.active_sms_character_name ?? 'Your character',
        },
      };
    default:
      return null;
  }
}

export function seedSmsAdventurePrompt(session, input = {}) {
  if (!numericId(session.campaign_id) || !numericId(session.active_sms_character_id)) {
    const updated = updateSmsSimulatorSession(session.session_id, {
      state: {
        last_backend_errors: [
          ...(session.state.last_backend_errors ?? []),
          {
            message: 'Cannot seed an SMS gameplay prompt without persisted campaign and character context.',
            at: nowIso(),
            scope: 'seed_prompt_requires_real_runtime_context',
          },
        ],
      },
    });
    return renderAndStoreOutbound(updated, 'sms.error_fallback', {}, {
      simulator_control: 'seed_prompt',
      reason: 'seed_prompt_requires_real_runtime_context',
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.SYSTEM_ERROR_RESPONSE,
        sendOutbound: true,
        templateId: 'sms.error_fallback',
        reason: 'seed_prompt_requires_real_runtime_context',
      }),
    });
  }

  const options = normalizeArray(input.options).length > 0
    ? input.options
    : normalizeArray(session.state.current_options);

  if (options.length < 2) {
    return renderAndStoreOutbound(session, 'input.no_active_prompt', {
      app_link: defaultAppLink,
    }, {
      simulator_control: 'seed_prompt',
      reason: 'seed_prompt_no_runtime_options',
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.NO_ACTIVE_PROMPT,
        sendOutbound: true,
        templateId: 'input.no_active_prompt',
        reason: 'seed_prompt_no_runtime_options',
      }),
    });
  }

  const actionWindow = createDefaultActionWindow(session, input.action_window ?? {});
  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      current_context: input.scene_description ?? session.state.current_context,
      current_scene: input.current_scene ?? session.state.current_scene,
      current_objective: input.current_objective ?? session.state.current_objective,
      active_thread: 'exploration',
      current_options: options,
      allow_free_text: input.allow_free_text !== false,
      action_window: actionWindow,
      level_up_available: input.level_up_available === true,
      target_level: input.target_level ?? 2,
    },
  });

  return renderAndStoreOutbound(updated, 'gameplay.adventure_prompt', {
    scene_description: updated.state.current_context,
    atmosphere_line: input.atmosphere_line ?? 'Something feels wrong.',
    options,
  });
}

export async function handleSmsConversation(identity, text) {
  const identityTemplate = identityTemplateFor(identity);

  if (identityTemplate) {
    if (!identity.session) {
      throw createHttpError('Simulator session not found', 404);
    }

    return renderAndStoreOutbound(identity.session, identityTemplate.templateId, identityTemplate.variables, {
      identity_status: identity.status,
    });
  }

  const session = identity.session;
  const normalizedText = normalizeText(text);
  const upper = normalizedText.toUpperCase();

  if (!normalizedText) {
    return renderAndStoreOutbound(session, 'input.invalid', {
      retry_instruction: 'Reply with a number or a short action.',
    });
  }

  if (upper === 'HELP') {
    return renderAndStoreOutbound(session, 'sms.help', {}, {
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.HELP_RESPONSE,
        sendOutbound: true,
        templateId: 'sms.help',
      }),
    });
  }

  if (upper === 'STOP') {
    return renderAndStoreOutbound(session, 'sms.stop_confirmation', {}, {
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.STOP_HANDLED,
        sendOutbound: true,
        templateId: 'sms.stop_confirmation',
      }),
    });
  }

  if (upper === 'START' && session.campaign_id) {
    return renderAndStoreOutbound(session, 'campaign.resume_existing', {
      resume_summary: 'Welcome back. Your Greyvale adventure continues. Reply STATUS for the latest.',
    });
  }

  const interactionClass = classifySmsInteraction(normalizedText, session);
  const accountId = session.account_id ?? session.state?.account_id;

  if (interactionClass === 'non_substantive' && accountId) {
    const budget = await applySmsInteractionBudget({
      accountId: Number(accountId),
      text: normalizedText,
      session,
    });
    const budgetSession = syncSmsBudgetDebug(session, budget);

    if (budget.policy === 'silent_ignore') {
      return {
        session: budgetSession,
        message: null,
        outbound_message: null,
        rendered: null,
        outbound_messages: [],
        rendered_messages: [],
        suppressed: true,
        reason: 'non_substantive_budget_exceeded',
      };
    }

    if (budget.policy === 'app_link_only') {
      return renderAndStoreOutbound(budgetSession, 'command.status_link_only', {
        app_link: budget.app_link,
      }, {
        budget_decision: budget.policy,
      });
    }

    return renderAndStoreOutbound(budgetSession, 'command.status_with_app_link', {
      status_text: buildCampaignStatusText(budgetSession),
      app_link: budget.app_link,
    }, {
      budget_decision: budget.policy,
    });
  }

  if (upper === 'STATUS') {
    return renderAndStoreOutbound(session, 'command.status', summarizeStatus(session), {
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.STATUS_BUDGETED_RESPONSE,
        sendOutbound: true,
        templateId: 'command.status',
      }),
    });
  }

  if (upper === 'LEVEL') {
    const response = buildLevelResponse(session);
    const nextSession = response.updates
      ? updateSmsSimulatorSession(session.session_id, { state: response.updates })
      : session;
    return renderAndStoreOutbound(nextSession, response.templateId, response.variables, {
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.LEVEL_RESPONSE,
        sendOutbound: true,
        templateId: response.templateId,
      }),
    });
  }

  const currentWindow = session.state.action_window;

  if (currentWindow?.status === 'closed') {
    return renderAndStoreOutbound(session, 'input.late_response', {
      current_state: "You'll receive the next prompt when the story continues.",
    }, {
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.LATE_RESPONSE,
        sendOutbound: true,
        templateId: 'input.late_response',
      }),
    });
  }

  const currentOptions = normalizeArray(session.state.current_options);

  if (/^\d+$/.test(normalizedText)) {
    const selectedIndex = Number(normalizedText) - 1;
    const clarification = clarificationIsActive(session) ? session.state.clarification_state : null;
    const clarificationCandidate = clarification?.candidates?.[selectedIndex] ?? null;
    const clarificationOption = clarificationCandidate
      ? optionFromActionKey(currentOptions, clarificationCandidate.action_key)
      : null;
    const selectedOption = clarificationOption ?? currentOptions[selectedIndex];

    if (clarification && !clarificationOption) {
      return renderAndStoreOutbound(session, 'input.clarify_action', {
        clarification_question: 'Reply with one of the listed numbers.',
        options: clarification.candidates.map((candidate) => candidate.label),
      }, {
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.INVALID_INPUT_RESPONSE,
          sendOutbound: true,
          templateId: 'input.clarify_action',
          reason: 'invalid_clarification_reply',
        }),
      });
    }

    if (!selectedOption) {
      if (currentOptions.length === 0 && !currentWindow) {
        return renderAndStoreOutbound(session, 'input.no_active_prompt', {
          app_link: defaultAppLink,
        }, {
          response_policy: buildSmsResponsePolicyDecision({
            outcome: SMS_RESPONSE_POLICY_OUTCOMES.NO_ACTIVE_PROMPT,
            sendOutbound: true,
            templateId: 'input.no_active_prompt',
          }),
        });
      }

      return renderAndStoreOutbound(session, 'input.no_match', {
        available_hint: 'Reply with one of the listed numbers.',
      }, {
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.INVALID_INPUT_RESPONSE,
          sendOutbound: true,
          templateId: 'input.no_match',
        }),
      });
    }

    const response = updateWindowResponse(session, selectedOption, selectedIndex);

    if (response.kind === 'late') {
      return renderAndStoreOutbound(session, 'input.late_response', {
        current_state: "You'll receive the next prompt when the story continues.",
      }, {
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.LATE_RESPONSE,
          sendOutbound: true,
          templateId: 'input.late_response',
        }),
      });
    }

    if (response.kind === 'duplicate_guidance') {
      return renderAndStoreOutbound(getLatestSession(session), 'input.action_already_set_web_app', {
        app_link: defaultAppLink,
      }, {
        response_policy: response.decision,
      });
    }

    if (response.kind === 'duplicate_silent_ignore') {
      return buildSuppressedResult(getLatestSession(session), response.decision);
    }

    await recordSmsActionSubmission(getLatestSession(session), response.response, response.window);
    updateSmsSimulatorSession(session.session_id, {
      state: {
        clarification_state: null,
        last_intent_resolver_status: clarification ? 'resolved' : session.state.last_intent_resolver_status,
        resolved_verb: clarificationCandidate?.verb ?? session.state.resolved_verb ?? null,
        resolved_target_affordance: clarificationCandidate?.target_affordance_id ?? session.state.resolved_target_affordance ?? null,
        resolved_interaction_id: clarificationCandidate?.interaction_id ?? session.state.resolved_interaction_id ?? null,
        intent_confidence: clarificationCandidate?.confidence ?? session.state.intent_confidence ?? null,
        intent_reason: clarificationCandidate?.reason ?? session.state.intent_reason ?? null,
      },
    });

    if (shouldSendActionConfirmation({ actionWindow: response.window, selectedOption })) {
      return renderAndStoreOutbound(getLatestSession(session), 'async.response_received_waiting', {
        waiting_reason: 'Your action is held for explicit confirmation.',
      }, {
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.VALID_FIRST_ACTION_RECORDED_SILENTLY,
          sendOutbound: true,
          templateId: 'async.response_received_waiting',
          reason: 'explicit_confirmation_required',
        }),
      });
    }

    return buildSuppressedResult(getLatestSession(session), response.decision);
  }

  if (session.state.allow_free_text === true && (currentWindow || currentOptions.length > 0)) {
    const affordances = normalizeArray(session.state.active_affordances);
    const intent = await resolveSmsExplorationIntent({
      session,
      userText: normalizedText,
      sceneId: session.state.active_scene_id,
      affordances,
    });

    updateSmsSimulatorSession(session.session_id, {
      state: {
        last_intent_resolver_status: intent.status,
        intent_candidates: intent.candidates.map((candidate) => ({
          verb: candidate.verb,
          target_affordance_id: candidate.target_affordance_id,
          action_key: candidate.action_key,
          label: candidate.label,
          confidence: candidate.confidence,
          reason: candidate.reason,
        })),
        intent_confidence: intent.confidence,
        intent_reason: intent.reason,
      },
    });

    if (intent.status === 'ambiguous') {
      const clarificationState = buildClarificationState({
        sourceText: normalizedText,
        candidates: intent.clarification.candidates,
        actionWindowId: currentWindow?.window_id ?? null,
      });
      const clarifiedSession = updateSmsSimulatorSession(session.session_id, {
        state: {
          clarification_state: clarificationState,
        },
      });

      return renderAndStoreOutbound(clarifiedSession, 'input.clarify_action', {
        clarification_question: intent.clarification.question,
        options: intent.clarification.options,
      }, {
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.INVALID_INPUT_RESPONSE,
          sendOutbound: true,
          templateId: 'input.clarify_action',
          reason: 'clarification_required',
        }),
      });
    }

    if (intent.status !== 'resolved') {
      return renderAndStoreOutbound(getLatestSession(session), 'input.no_match', {
        available_hint: 'Try a short action like look around, inspect the scene, talk, or move on.',
      }, {
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.INVALID_INPUT_RESPONSE,
          sendOutbound: true,
          templateId: 'input.no_match',
          reason: 'intent_not_resolved',
        }),
      });
    }

    const resolvedOption = optionFromActionKey(currentOptions, intent.chosen_candidate.action_key);
    const selectedOption = resolvedOption ?? intent.chosen_candidate.action;
    const selectedIndex = Math.max(0, currentOptions.findIndex((option) => option?.key === selectedOption?.key));
    const response = updateWindowResponse(session, selectedOption, selectedIndex);

    if (response.kind === 'late') {
      return renderAndStoreOutbound(session, 'input.late_response', {
        current_state: "You'll receive the next prompt when the story continues.",
      }, {
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.LATE_RESPONSE,
          sendOutbound: true,
          templateId: 'input.late_response',
        }),
      });
    }

    if (response.kind === 'duplicate_guidance') {
      return renderAndStoreOutbound(getLatestSession(session), 'input.action_already_set_web_app', {
        app_link: defaultAppLink,
      }, {
        response_policy: response.decision,
      });
    }

    if (response.kind === 'duplicate_silent_ignore') {
      return buildSuppressedResult(getLatestSession(session), response.decision);
    }

    await recordSmsActionSubmission(getLatestSession(session), response.response, response.window);
    updateSmsSimulatorSession(session.session_id, {
      state: {
        clarification_state: null,
        resolved_verb: intent.chosen_candidate.verb,
        resolved_target_affordance: intent.chosen_candidate.target_affordance_id,
        resolved_interaction_id: intent.chosen_candidate.interaction_id,
        resolved_transition_id: intent.chosen_candidate.transition_id,
      },
    });

    return buildSuppressedResult(getLatestSession(session), response.decision);
  }

  if (currentOptions.length === 0 && !currentWindow) {
    return renderAndStoreOutbound(session, 'input.no_active_prompt', {
      app_link: defaultAppLink,
    }, {
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.NO_ACTIVE_PROMPT,
        sendOutbound: true,
        templateId: 'input.no_active_prompt',
      }),
    });
  }

  return renderAndStoreOutbound(session, 'input.invalid', {
    retry_instruction: 'Reply with a number or a short action.',
  }, {
    response_policy: buildSmsResponsePolicyDecision({
      outcome: SMS_RESPONSE_POLICY_OUTCOMES.INVALID_INPUT_RESPONSE,
      sendOutbound: true,
      templateId: 'input.invalid',
    }),
  });
}

export function advanceSmsTimeBeat(session) {
  return renderAndStoreOutbound(session, 'async.reminder', {
    reminder_text: 'this action window is still open.',
    deadline_line: ' Reply before threshold resolution if you want to act.',
  });
}

export function closeSmsActionWindow(session) {
  const currentWindow = session.state.action_window ?? createDefaultActionWindow(session);
  const nextWindow = {
    ...currentWindow,
    status: 'threshold_reached',
    threshold_reached: true,
    updated_at: nowIso(),
  };
  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      action_window: nextWindow,
    },
  });

  return renderAndStoreOutbound(updated, 'async.threshold_reached', {
    threshold_summary: 'The group is ready to resolve this beat.',
  });
}

export function resolveSmsThreshold(session) {
  const currentWindow = session.state.action_window ?? createDefaultActionWindow(session);

  if (!currentWindow.threshold_reached && currentWindow.status !== 'threshold_reached') {
    throw createHttpError('Action window threshold has not been reached yet', 409);
  }

  const responses = normalizeArray(currentWindow.responses);
  const expected = normalizeArray(currentWindow.expected_participants);
  const missing = expected.filter(
    (participant) => !responses.some((response) => response.session_id === participant.session_id)
  );
  const resolvedWindow = {
    ...currentWindow,
    status: 'closed',
    threshold_reached: true,
    pending_participants: [],
    default_actions_applied: missing.map((participant) => ({
      session_id: participant.session_id,
      character_id: participant.character_id,
      default_action: 'kept watch and avoided direct risk',
      applied_at: nowIso(),
    })),
    summary: 'The group moves forward after the action window closes.',
    resolved_at: nowIso(),
    responses: responses.map((response) => ({
      ...response,
      resolved_at: response.resolved_at ?? nowIso(),
    })),
    updated_at: nowIso(),
  };

  const outbound = [];

  for (const participant of expected) {
    const participantSession = listSmsSimulatorSessions().find(
      (entry) => entry.session_id === participant.session_id
    );

    if (!participantSession) {
      continue;
    }

    const defaulted = resolvedWindow.default_actions_applied.find(
      (entry) => entry.session_id === participant.session_id
    );
    const updated = updateSmsSimulatorSession(participantSession.session_id, {
      state: {
        action_window: resolvedWindow,
        default_actions_applied: resolvedWindow.default_actions_applied,
        active_thread: 'exploration',
      },
    });

    if (defaulted) {
      outbound.push(
        renderAndStoreOutbound(updated, 'async.default_applied', {
          default_action: defaulted.default_action,
        })
      );
      outbound.push(
        renderAndStoreOutbound(updated, 'party.missed_participation', {
          safe_default: defaulted.default_action,
        })
      );
    } else {
      outbound.push(
        renderAndStoreOutbound(updated, 'async.beat_resolved', {
          beat_summary: resolvedWindow.summary,
        })
      );
    }
  }

  return {
    window: resolvedWindow,
    outbound,
  };
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function recordSmsActionSubmission(session, response, window) {
  const campaignId = numericId(session?.campaign_id);
  const characterId = numericId(session?.active_sms_character_id);
  const accountId = numericId(session?.account_id ?? session?.state?.account_id);

  if (!campaignId || !characterId || !response) {
    return false;
  }

  await query(
    `
      INSERT INTO dnd5e_campaign_log (
        campaign_id,
        character_id,
        actor_account_id,
        log_type,
        message,
        data_json
      )
      VALUES ($1, $2, $3, 'progression_window_response', $4, $5::jsonb)
    `,
    [
      campaignId,
      characterId,
      accountId,
      'SMS action submitted for the current beat.',
      JSON.stringify({
        source: 'sms',
        transport: 'simulator',
        action_window_id: window?.window_id ?? null,
        response_key: response.response_key ?? response.submitted_action_payload?.key ?? null,
        response_summary: response.response_summary ?? null,
        submitted_at: response.submitted_at ?? response.received_at ?? nowIso(),
        sms_submission_locked: response.sms_submission_locked === true,
        can_modify_in_web: response.can_modify_in_web === true,
      }),
    ]
  );

  updateSmsSimulatorSession(session.session_id, {
    state: {
      sms_action_submission_persisted: true,
      sms_action_submission_persisted_at: nowIso(),
    },
  });

  return true;
}

function actionOptionFromSubmission(response) {
  const payload = response?.submitted_action_payload;

  if (payload?.key) {
    return {
      key: payload.key,
      label: payload.label ?? response.response_summary,
      action_type: payload.action_type,
      payload: payload.payload,
    };
  }

  if (response?.response_key && !String(response.response_key).startsWith('free_text:')) {
    return {
      key: response.response_key,
      label: response.response_summary,
      payload: {},
    };
  }

  return null;
}

async function executeSubmittedActionIfPossible(session, response) {
  const option = actionOptionFromSubmission(response);

  if (!option || String(option.key).startsWith('free_text:')) {
    return {
      session,
      result_text: null,
      reason_if_no_prompt: 'free_text_actions_require_real_runtime_mapping',
    };
  }

  if (!numericId(session.campaign_id) || !numericId(session.active_sms_character_id)) {
    return {
      session,
      result_text: null,
      reason_if_no_prompt: 'non_persistent_simulator_context',
    };
  }

  try {
    return await executeSmsRuntimeAction(session, option, {
      intro_fast_path_active: false,
      intro_fast_path_completed: true,
      normal_sms_pacing_active: true,
    });
  } catch (error) {
    const updated = updateSmsSimulatorSession(session.session_id, {
      state: {
        last_backend_errors: [
          ...(session.state.last_backend_errors ?? []),
          {
            message: error.message,
            at: nowIso(),
            scope: 'advance_next_beat_runtime_action',
          },
        ],
      },
    });
    return {
      session: updated,
      result_text: null,
      reason_if_no_prompt: 'runtime_action_failed',
    };
  }
}

function createNextBeatWindow(session, summary = 'Next SMS story beat.') {
  const nextWindow = createDefaultActionWindow(session, {
    summary,
  });

  syncWindowForParticipants(nextWindow, {
    sharedState: {
      action_window: nextWindow,
      active_thread: 'exploration',
      current_player_submitted: false,
      submitted_action_summary: null,
      submitted_at: null,
      duplicate_attempt_count: 0,
      duplicate_guidance_sent: false,
    },
  });

  return nextWindow;
}

function renderNextPrompt(session, followupText, metadata = {}) {
  const options = normalizeArray(session.state.current_options);

  if (options.length >= 2) {
    const window = createNextBeatWindow(session, 'Next SMS story beat.');
    const latest = getLatestSession(session);
    const result = renderAndStoreOutbound(latest, 'gameplay.followup', {
      followup_text: followupText,
      options,
    }, {
      ...metadata,
      action_window_id: window.window_id,
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.BEAT_ADVANCED,
        sendOutbound: true,
        templateId: 'gameplay.followup',
      }),
    });

    updateSmsSimulatorSession(result.session.session_id, {
      state: {
        last_beat_resolution_result: {
          result_text: followupText,
          next_prompt_generated: true,
          at: nowIso(),
        },
        next_prompt_generated: true,
      },
    });

    return result;
  }

  const result = renderAndStoreOutbound(session, 'gameplay.result', {
    result_text: followupText,
    followup_line: '',
  }, {
    ...metadata,
    response_policy: buildSmsResponsePolicyDecision({
      outcome: SMS_RESPONSE_POLICY_OUTCOMES.BEAT_ADVANCED,
      sendOutbound: true,
      templateId: 'gameplay.result',
    }),
  });

  updateSmsSimulatorSession(result.session.session_id, {
    state: {
      last_beat_resolution_result: {
        result_text: followupText,
        next_prompt_generated: false,
        at: nowIso(),
      },
      next_prompt_generated: false,
    },
  });

  return result;
}

export async function advanceSmsNextBeat(session) {
  return advanceSmsSimulatorBeatCycle(session);
}

export function triggerSmsCatchup(session) {
  return renderAndStoreOutbound(session, 'catchup.summary', {
    summary: 'the last story beat resolved',
    player_action: 'stayed with the group',
    current_state: session.state.current_context ?? 'the adventure is ready to continue.',
    next_action: ' Reply STATUS for choices.',
  });
}

export function triggerSmsCombatPrompt(session) {
  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      active_thread: 'combat',
      current_options: ['Strike', 'Defend', 'Try to talk him down'],
      action_window: createDefaultActionWindow(session, {
        summary: 'Combat beat at the shrine.',
      }),
    },
  });

  renderAndStoreOutbound(updated, 'combat.start', {
    combatant_summary: 'Rusk lunges from the archway.',
  });

  return renderAndStoreOutbound(updated, 'combat.prompt', {
    combat_situation: 'Rusk lunges from the archway.',
    options: updated.state.current_options,
  });
}

export function resolveSmsCombatBeat(session) {
  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      active_thread: 'exploration',
      current_options: ['Inspect the shrine', 'Check on the party', 'Move carefully onward'],
      action_window: null,
    },
  });

  const result = renderAndStoreOutbound(updated, 'combat.result', {
    result_text: 'You hold your ground as the clash breaks.',
    next_line: ' The immediate danger recedes.',
  });
  const end = renderAndStoreOutbound(result.session, 'combat.end', {
    end_summary: 'Combat ends. The shrine is tense, but quiet enough to act.',
  });

  return {
    result,
    end,
    session: end.session,
  };
}

export function triggerSmsLevelAvailable(session) {
  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      level_up_available: true,
      target_level: 2,
      active_thread: session.state.active_thread ?? 'exploration',
    },
  });

  return renderAndStoreOutbound(updated, 'level.available', {
    level_summary: 'The choice can wait until a safe pause.',
  });
}

export function triggerSmsHpRollResult(session) {
  return renderAndStoreOutbound(session, 'level.hp_roll_result', {
    roll_result: 'd8=5',
    hp_total: 7,
  });
}

export function triggerSmsSpellChoice(session) {
  return renderAndStoreOutbound(session, 'level.spell_choice', {
    spell_context: 'Choose 1 curated spell for SMS play.',
    options: ['Shield', 'Magic Missile', 'Detect Magic'],
  });
}

export function triggerSmsLevelComplete(session) {
  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      level_up_available: false,
      level_up_started: false,
      target_level: null,
    },
  });

  return renderAndStoreOutbound(updated, 'level.complete', {
    level_summary: 'You reach level 2. New choices are saved.',
  });
}

export { renderAndStoreOutbound, storeInbound };
