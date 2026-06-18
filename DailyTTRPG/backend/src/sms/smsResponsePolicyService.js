export const SMS_RESPONSE_POLICY_OUTCOMES = Object.freeze({
  VALID_FIRST_ACTION_RECORDED_SILENTLY: 'valid_first_action_recorded_silently',
  DUPLICATE_ACTION_GUIDANCE: 'duplicate_action_guidance',
  DUPLICATE_ACTION_SILENT_IGNORE: 'duplicate_action_silent_ignore',
  INVALID_INPUT_RESPONSE: 'invalid_input_response',
  LATE_RESPONSE: 'late_response',
  NO_ACTIVE_PROMPT: 'no_active_prompt',
  HELP_RESPONSE: 'help_response',
  STOP_HANDLED: 'stop_handled',
  STATUS_BUDGETED_RESPONSE: 'status_budgeted_response',
  LEVEL_RESPONSE: 'level_response',
  SYSTEM_ERROR_RESPONSE: 'system_error_response',
  BEAT_ADVANCED: 'beat_advanced',
});

export function shouldSendActionConfirmation({ actionWindow = null, selectedOption = null } = {}) {
  return (
    actionWindow?.requires_explicit_confirmation === true ||
    selectedOption?.requires_explicit_confirmation === true
  );
}

export function buildSmsResponsePolicyDecision({
  outcome,
  sendOutbound,
  templateId = null,
  reason = null,
  metadata = {},
} = {}) {
  return {
    outcome,
    send_outbound: sendOutbound === true,
    template_id: templateId,
    reason,
    metadata,
  };
}

export function silentActionRecordedDecision(metadata = {}) {
  return buildSmsResponsePolicyDecision({
    outcome: SMS_RESPONSE_POLICY_OUTCOMES.VALID_FIRST_ACTION_RECORDED_SILENTLY,
    sendOutbound: false,
    templateId: 'system.silent_action_recorded',
    reason: 'ordinary_valid_action_recorded_without_confirmation',
    metadata,
  });
}

export function duplicateGuidanceDecision(metadata = {}) {
  return buildSmsResponsePolicyDecision({
    outcome: SMS_RESPONSE_POLICY_OUTCOMES.DUPLICATE_ACTION_GUIDANCE,
    sendOutbound: true,
    templateId: 'input.action_already_set_web_app',
    reason: 'sms_action_already_locked_for_this_beat',
    metadata,
  });
}

export function duplicateSilentIgnoreDecision(metadata = {}) {
  return buildSmsResponsePolicyDecision({
    outcome: SMS_RESPONSE_POLICY_OUTCOMES.DUPLICATE_ACTION_SILENT_IGNORE,
    sendOutbound: false,
    templateId: 'system.silent_action_recorded',
    reason: 'duplicate_guidance_already_sent_for_this_beat',
    metadata,
  });
}
