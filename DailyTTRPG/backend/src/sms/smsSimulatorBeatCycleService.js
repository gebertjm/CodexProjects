import { executeSmsRuntimeAction } from './smsCampaignAssignmentService.js';
import { renderSmsTemplate } from './smsOutboundFormatter.js';
import {
  SMS_RESPONSE_POLICY_OUTCOMES,
  buildSmsResponsePolicyDecision,
} from './smsResponsePolicyService.js';
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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

function getLatestSession(session) {
  return listSmsSimulatorSessions().find((entry) => entry.session_id === session.session_id) ?? session;
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
      runtime_state_after: session.state.current_context ?? null,
      runtime_called: false,
      runtime_error: 'free_text_actions_require_real_runtime_mapping',
      reason_if_no_prompt: 'free_text_actions_require_real_runtime_mapping',
    };
  }

  if (!numericId(session.campaign_id) || !numericId(session.active_sms_character_id)) {
    return {
      session,
      runtime_state_after: session.state.current_context ?? null,
      runtime_called: false,
      runtime_error: 'non_persistent_simulator_context',
      reason_if_no_prompt: 'non_persistent_simulator_context',
    };
  }

  try {
    const result = await executeSmsRuntimeAction(session, option, {
      intro_fast_path_active: false,
      intro_fast_path_completed: true,
      normal_sms_pacing_active: true,
    });

    return {
      ...result,
      runtime_state_after: result.session.state.current_context ?? null,
      runtime_called: true,
      reason_if_no_prompt: result.result_text ? null : 'runtime_returned_empty_result_text',
    };
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
      runtime_state_after: updated.state.current_context ?? null,
      runtime_called: false,
      runtime_error: error.message,
      reason_if_no_prompt: 'runtime_action_failed',
    };
  }
}

function renderRuntimeFailure(session, reason, previousWindowId) {
  return renderAndStoreOutbound(session, 'sms.error_fallback', {}, {
    simulator_control: 'advance_next_beat',
    resolved_window_id: previousWindowId,
    runtime_failure_reason: reason,
    response_policy: buildSmsResponsePolicyDecision({
      outcome: SMS_RESPONSE_POLICY_OUTCOMES.SYSTEM_ERROR_RESPONSE,
      sendOutbound: true,
      templateId: 'sms.error_fallback',
      reason,
    }),
  });
}

function syncWindowForParticipants(nextWindow, state = {}) {
  for (const participant of normalizeArray(nextWindow.expected_participants)) {
    const participantSession = listSmsSimulatorSessions().find(
      (entry) => entry.session_id === participant.session_id
    );

    if (!participantSession) {
      continue;
    }

    const participantResponse = normalizeArray(nextWindow.responses).find(
      (response) => response.session_id === participant.session_id
    );
    updateSmsSimulatorSession(participant.session_id, {
      state: {
        action_window: nextWindow,
        current_player_submitted: Boolean(participantResponse),
        submitted_action_summary: participantResponse?.response_summary ?? null,
        submitted_at: participantResponse?.submitted_at ?? participantResponse?.received_at ?? null,
        duplicate_attempt_count: participantResponse?.duplicate_attempt_count ?? 0,
        duplicate_guidance_sent: Boolean(participantResponse?.duplicate_guidance_sent_at),
        ...state,
      },
    });
  }
}

function createNextBeatWindow(session, previousWindowId) {
  const nextWindow = createDefaultActionWindow(session, {
    summary: 'Next SMS story beat.',
    created_by: 'advance_next_beat',
    source_previous_window_id: previousWindowId ?? null,
  });

  syncWindowForParticipants(nextWindow, {
    active_thread: 'exploration',
    current_player_submitted: false,
    submitted_action_summary: null,
    submitted_at: null,
    duplicate_attempt_count: 0,
    duplicate_guidance_sent: false,
  });

  return nextWindow;
}

function renderResultOrPrompt(session, resultText, previousWindowId, debug) {
  const options = normalizeArray(session.state.current_options);

  if (options.length >= 2) {
    const nextWindow = createNextBeatWindow(session, previousWindowId);
    const latest = getLatestSession(session);
    const narrativeFirst = latest.state.prompt_mode === 'narrative_first' ||
      latest.state.include_numbered_options === false;

    if (narrativeFirst) {
      const narrativeText = [resultText, latest.state.current_context]
        .map((part) => String(part ?? '').trim())
        .filter(Boolean)
        .filter((part, index, parts) => parts.indexOf(part) === index)
        .join('\n\n');
      const guidanceLine =
        latest.state.guidance_level === 'tutorial' || latest.state.guidance_level === 'light'
          ? "\n\nReply naturally, like 'look around' or 'follow the tracks.'"
          : '';
      const result = renderAndStoreOutbound(latest, 'gameplay.exploration_narrative', {
        narrative_text: narrativeText,
        guidance_line: guidanceLine,
      }, {
        simulator_control: 'advance_next_beat',
        resolved_window_id: previousWindowId,
        action_window_id: nextWindow.window_id,
        prompt_mode: 'narrative_first',
        response_policy: buildSmsResponsePolicyDecision({
          outcome: SMS_RESPONSE_POLICY_OUTCOMES.BEAT_ADVANCED,
          sendOutbound: true,
          templateId: 'gameplay.exploration_narrative',
        }),
      });

      debug.created_result_message = true;
      debug.created_next_prompt = true;
      debug.next_action_window_id = nextWindow.window_id;
      debug.reason_if_no_prompt = null;
      return {
        outbound: result,
        nextWindow,
      };
    }

    const result = renderAndStoreOutbound(latest, 'gameplay.followup', {
      followup_text: resultText,
      options,
    }, {
      simulator_control: 'advance_next_beat',
      resolved_window_id: previousWindowId,
      action_window_id: nextWindow.window_id,
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.BEAT_ADVANCED,
        sendOutbound: true,
        templateId: 'gameplay.followup',
      }),
    });

    debug.created_result_message = true;
    debug.created_next_prompt = true;
    debug.next_action_window_id = nextWindow.window_id;
    debug.reason_if_no_prompt = null;
    return {
      outbound: result,
      nextWindow,
    };
  }

  const result = renderAndStoreOutbound(session, 'gameplay.result', {
    result_text: resultText,
    followup_line: '',
  }, {
    simulator_control: 'advance_next_beat',
    resolved_window_id: previousWindowId,
    response_policy: buildSmsResponsePolicyDecision({
      outcome: SMS_RESPONSE_POLICY_OUTCOMES.BEAT_ADVANCED,
      sendOutbound: true,
      templateId: 'gameplay.result',
    }),
  });

  debug.created_result_message = true;
  debug.created_next_prompt = false;
  debug.next_action_window_id = null;
  debug.reason_if_no_prompt = 'runtime_returned_no_next_options';
  return {
    outbound: result,
    nextWindow: null,
  };
}

function lastInboundAt(session) {
  return session.state.last_inbound_payload?.message?.created_at ?? null;
}

function isAfter(value, compareTo) {
  if (!value || !compareTo) {
    return false;
  }

  return new Date(value).getTime() > new Date(compareTo).getTime();
}

function buildNoPromptResult(session, reason, idempotencyStatus = 'no_active_action_window') {
  const completedAt = nowIso();
  const debug = {
    runtime_state_before: session.state.current_context ?? null,
    runtime_state_after: session.state.current_context ?? null,
    reason_if_no_prompt: reason,
    idempotency_status: idempotencyStatus,
    created_result_message: false,
    created_next_prompt: false,
    new_message_ids: [],
    previous_action_window_id: session.state.action_window?.window_id ?? null,
    next_action_window_id: null,
    completed_at: completedAt,
  };
  const updated = updateSmsSimulatorSession(session.session_id, {
    state: {
      last_beat_cycle_result: debug,
      last_beat_resolution_result: debug,
      previous_action_window_id: debug.previous_action_window_id,
      next_action_window_id: null,
      beat_cycle_idempotency_status: idempotencyStatus,
      beat_cycle_reason_if_no_prompt: reason,
      beat_cycle_new_message_ids: [],
      beat_cycle_created_result_message: false,
      beat_cycle_created_next_prompt: false,
      runtime_state_before_last_advance: debug.runtime_state_before,
      runtime_state_after_last_advance: debug.runtime_state_after,
    },
  });

  return {
    success: true,
    resolved_previous_beat: false,
    applied_defaults: false,
    created_result_message: false,
    created_next_prompt: false,
    new_message_ids: [],
    previous_action_window_id: debug.previous_action_window_id,
    next_action_window_id: null,
    idempotency_status: idempotencyStatus,
    reason_if_no_prompt: reason,
    session: updated,
    outbound: [],
    messages_created: [],
    debug,
  };
}

function buildAlreadyResolvedResult(session, reason = 'already_resolved') {
  const last = session.state.last_beat_cycle_result ?? {};
  const debug = {
    ...last,
    runtime_state_before: session.state.current_context ?? last.runtime_state_after ?? null,
    runtime_state_after: session.state.current_context ?? last.runtime_state_after ?? null,
    reason_if_no_prompt: reason,
    idempotency_status: 'already_resolved',
    created_result_message: false,
    created_next_prompt: false,
    new_message_ids: [],
  };
  updateSmsSimulatorSession(session.session_id, {
    state: {
      last_beat_cycle_result: debug,
      last_beat_resolution_result: debug,
      beat_cycle_idempotency_status: 'already_resolved',
      beat_cycle_reason_if_no_prompt: reason,
      beat_cycle_new_message_ids: [],
      beat_cycle_created_result_message: false,
      beat_cycle_created_next_prompt: false,
    },
  });

  return {
    success: true,
    resolved_previous_beat: false,
    applied_defaults: false,
    created_result_message: false,
    created_next_prompt: false,
    new_message_ids: [],
    previous_action_window_id: last.previous_action_window_id ?? session.state.action_window?.window_id ?? null,
    next_action_window_id: last.next_action_window_id ?? session.state.action_window?.window_id ?? null,
    idempotency_status: 'already_resolved',
    reason_if_no_prompt: reason,
    session: getLatestSession(session),
    outbound: [],
    messages_created: [],
    debug,
  };
}

function markCycleDebugForParticipants(resolvedWindow, debug) {
  for (const participant of normalizeArray(resolvedWindow.expected_participants)) {
    updateSmsSimulatorSession(participant.session_id, {
      state: {
        last_beat_cycle_result: debug,
        last_beat_resolution_result: debug,
        previous_action_window_id: debug.previous_action_window_id,
        next_action_window_id: debug.next_action_window_id,
        beat_cycle_idempotency_status: debug.idempotency_status,
        beat_cycle_reason_if_no_prompt: debug.reason_if_no_prompt,
        beat_cycle_new_message_ids: debug.new_message_ids,
        beat_cycle_created_result_message: debug.created_result_message,
        beat_cycle_created_next_prompt: debug.created_next_prompt,
        runtime_state_before_last_advance: debug.runtime_state_before,
        runtime_state_after_last_advance: debug.runtime_state_after,
      },
    });
  }
}

export async function advanceSmsSimulatorBeatCycle(session) {
  const latestSession = getLatestSession(session);
  const currentWindow = latestSession.state.action_window;
  const lastCycle = latestSession.state.last_beat_cycle_result ?? null;
  const inboundAfterLastCycle = isAfter(lastInboundAt(latestSession), lastCycle?.completed_at);

  if (
    currentWindow?.created_by === 'advance_next_beat' &&
    normalizeArray(currentWindow.responses).length === 0 &&
    lastCycle?.next_action_window_id === currentWindow.window_id &&
    !inboundAfterLastCycle
  ) {
    return buildAlreadyResolvedResult(latestSession, 'next_prompt_already_created');
  }

  if (currentWindow?.status === 'closed' || currentWindow?.beat_cycle_resolved_at) {
    return buildAlreadyResolvedResult(latestSession, 'current_window_already_resolved');
  }

  if (!currentWindow) {
    const hasSilentIntroAction =
      latestSession.state.current_player_submitted === true &&
      latestSession.state.intro_fast_path_result_text &&
      (inboundAfterLastCycle || !lastCycle);

    if (!hasSilentIntroAction) {
      return buildNoPromptResult(latestSession, 'no_active_action_window');
    }

    const debug = {
      runtime_state_before: latestSession.state.current_context ?? null,
      runtime_state_after: latestSession.state.current_context ?? null,
      reason_if_no_prompt: null,
      idempotency_status: 'advanced',
      previous_action_window_id: null,
      next_action_window_id: null,
      created_result_message: false,
      created_next_prompt: false,
      new_message_ids: [],
      completed_at: nowIso(),
    };
    const rendered = renderResultOrPrompt(
      latestSession,
      latestSession.state.intro_fast_path_result_text,
      null,
      debug
    );
    const newMessageIds = [rendered.outbound.message.message_id];
    const finalDebug = {
      ...debug,
      new_message_ids: newMessageIds,
      runtime_state_after: getLatestSession(latestSession).state.current_context ?? debug.runtime_state_after,
    };
    updateSmsSimulatorSession(latestSession.session_id, {
      state: {
        last_beat_cycle_result: finalDebug,
        last_beat_resolution_result: finalDebug,
        previous_action_window_id: null,
        next_action_window_id: finalDebug.next_action_window_id,
        beat_cycle_idempotency_status: 'advanced',
        beat_cycle_reason_if_no_prompt: finalDebug.reason_if_no_prompt,
        beat_cycle_new_message_ids: newMessageIds,
        beat_cycle_created_result_message: finalDebug.created_result_message,
        beat_cycle_created_next_prompt: finalDebug.created_next_prompt,
        runtime_state_before_last_advance: finalDebug.runtime_state_before,
        runtime_state_after_last_advance: finalDebug.runtime_state_after,
      },
    });

    return {
      success: true,
      resolved_previous_beat: true,
      applied_defaults: false,
      created_result_message: finalDebug.created_result_message,
      created_next_prompt: finalDebug.created_next_prompt,
      new_message_ids: newMessageIds,
      previous_action_window_id: null,
      next_action_window_id: finalDebug.next_action_window_id,
      idempotency_status: 'advanced',
      reason_if_no_prompt: finalDebug.reason_if_no_prompt,
      session: getLatestSession(latestSession),
      outbound: [rendered.outbound],
      messages_created: [rendered.outbound.message],
      debug: finalDebug,
    };
  }

  const responses = normalizeArray(currentWindow.responses);
  const expected = normalizeArray(currentWindow.expected_participants);
  const missing = expected.filter(
    (participant) => !responses.some((response) => response.session_id === participant.session_id)
  );
  const resolvedAt = nowIso();
  const previousWindowId = currentWindow.window_id;
  const resolvedWindow = {
    ...currentWindow,
    status: 'closed',
    threshold_reached: true,
    pending_participants: [],
    responses: responses.map((response) => ({
      ...response,
      resolved_at: response.resolved_at ?? resolvedAt,
    })),
    default_actions_applied: missing.map((participant) => ({
      session_id: participant.session_id,
      character_id: participant.character_id,
      default_action: 'kept watch and avoided direct risk',
      applied_at: resolvedAt,
    })),
    summary: 'The beat resolves and the adventure moves forward.',
    beat_cycle_resolved_at: resolvedAt,
    resolved_at: resolvedAt,
    updated_at: resolvedAt,
  };
  const runtimeStateBefore = latestSession.state.current_context ?? null;
  const outbound = [];
  let runtimeStateAfter = runtimeStateBefore;
  let nextActionWindowId = null;
  let createdResultMessage = false;
  let createdNextPrompt = false;
  let reasonIfNoPrompt = null;
  let runtimeCalled = false;

  syncWindowForParticipants(resolvedWindow, {
    default_actions_applied: resolvedWindow.default_actions_applied,
    active_thread: 'exploration',
  });

  for (const participant of expected) {
    const participantSession = getLatestSession({ session_id: participant.session_id });
    const participantResponse = resolvedWindow.responses.find(
      (response) => response.session_id === participant.session_id
    );
    const defaulted = resolvedWindow.default_actions_applied.find(
      (entry) => entry.session_id === participant.session_id
    );

    if (defaulted) {
      outbound.push(
        renderAndStoreOutbound(participantSession, 'async.default_applied', {
          default_action: defaulted.default_action,
        }, {
          simulator_control: 'advance_next_beat',
        })
      );
      outbound.push(
        renderAndStoreOutbound(getLatestSession(participantSession), 'party.missed_participation', {
          safe_default: defaulted.default_action,
        }, {
          simulator_control: 'advance_next_beat',
        })
      );
      createdResultMessage = true;
      continue;
    }

    if (!participantResponse) {
      continue;
    }

    const actionResult = await executeSubmittedActionIfPossible(participantSession, participantResponse);
    runtimeCalled = runtimeCalled || actionResult.runtime_called === true;
    runtimeStateAfter = actionResult.runtime_state_after ?? runtimeStateAfter;
    const resultText = String(actionResult.result_text ?? '').trim();

    if (!resultText) {
      const reason = actionResult.reason_if_no_prompt ?? actionResult.runtime_error ?? 'runtime_returned_empty_result_text';
      outbound.push(renderRuntimeFailure(actionResult.session, reason, previousWindowId));
      reasonIfNoPrompt = reason;
      continue;
    }

    const rendered = renderResultOrPrompt(actionResult.session, resultText, previousWindowId, {
      runtime_state_before: runtimeStateBefore,
      runtime_state_after: runtimeStateAfter,
      idempotency_status: 'advanced',
      previous_action_window_id: previousWindowId,
      next_action_window_id: null,
      created_result_message: false,
      created_next_prompt: false,
      reason_if_no_prompt: null,
      completed_at: resolvedAt,
    });
    outbound.push(rendered.outbound);
    nextActionWindowId = rendered.nextWindow?.window_id ?? nextActionWindowId;
    createdResultMessage = true;
    createdNextPrompt = createdNextPrompt || Boolean(rendered.nextWindow);
    reasonIfNoPrompt = rendered.nextWindow ? reasonIfNoPrompt : 'runtime_returned_no_next_options';
  }

  if (outbound.length === 0) {
    const fallbackSession = getLatestSession(latestSession);
    const fallback = renderAndStoreOutbound(fallbackSession, 'input.no_active_prompt', {
      app_link: defaultAppLink,
    }, {
      simulator_control: 'advance_next_beat',
      response_policy: buildSmsResponsePolicyDecision({
        outcome: SMS_RESPONSE_POLICY_OUTCOMES.NO_ACTIVE_PROMPT,
        sendOutbound: true,
        templateId: 'input.no_active_prompt',
        reason: 'beat_resolved_without_participant_output',
      }),
    });
    outbound.push(fallback);
    reasonIfNoPrompt = 'beat_resolved_without_participant_output';
  }

  const newMessageIds = outbound.map((entry) => entry.message?.message_id).filter(Boolean);
  const debug = {
    runtime_state_before: runtimeStateBefore,
    runtime_state_after: runtimeStateAfter,
    reason_if_no_prompt: reasonIfNoPrompt,
    idempotency_status: 'advanced',
    previous_action_window_id: previousWindowId,
    next_action_window_id: nextActionWindowId,
    created_result_message: createdResultMessage,
    created_next_prompt: createdNextPrompt,
    new_message_ids: newMessageIds,
    runtime_called: runtimeCalled,
    applied_defaults: resolvedWindow.default_actions_applied.length > 0,
    completed_at: resolvedAt,
  };

  markCycleDebugForParticipants(resolvedWindow, debug);

  return {
    success: true,
    resolved_previous_beat: true,
    applied_defaults: resolvedWindow.default_actions_applied.length > 0,
    created_result_message: createdResultMessage,
    created_next_prompt: createdNextPrompt,
    new_message_ids: newMessageIds,
    previous_action_window_id: previousWindowId,
    next_action_window_id: nextActionWindowId,
    idempotency_status: 'advanced',
    reason_if_no_prompt: reasonIfNoPrompt,
    session: getLatestSession(latestSession),
    window: resolvedWindow,
    outbound,
    messages_created: outbound.map((entry) => entry.message).filter(Boolean),
    debug,
  };
}
