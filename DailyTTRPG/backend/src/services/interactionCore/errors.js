export const SAFE_INTERACTION_ERROR_CODES = Object.freeze({
  STALE_INTERACTION: 'STALE_INTERACTION',
  STALE_PREVIEW: 'STALE_PREVIEW',
  ACTION_ALREADY_RESOLVING: 'ACTION_ALREADY_RESOLVING',
  ACTION_UNAVAILABLE: 'ACTION_UNAVAILABLE',
  INTERACTION_ENDED: 'INTERACTION_ENDED',
  ACTIVE_CHARACTER_REQUIRED: 'ACTIVE_CHARACTER_REQUIRED',
  CURRENT_SCENE_CHANGED: 'CURRENT_SCENE_CHANGED',
  TRANSITION_UNAVAILABLE: 'TRANSITION_UNAVAILABLE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export const SAFE_INTERACTION_ERROR_CODE_VALUES = Object.freeze(
  Object.values(SAFE_INTERACTION_ERROR_CODES)
);

export const RECOVERY_ACTIONS = Object.freeze({
  REFRESH_CURRENT_SCENE: 'refresh_current_scene',
  RETURN_TO_CURRENT_SCENE: 'return_to_current_scene',
  CHOOSE_ANOTHER_ACTION: 'choose_another_action',
  SIGN_IN: 'sign_in',
  SELECT_ACTIVE_CHARACTER: 'select_active_character',
  CONTACT_SUPPORT: 'contact_support',
  DEV_ONLY: 'dev_only',
  CONTACT_SUPPORT_DEV_ONLY: 'contact_support_dev_only',
});

export const RECOVERY_ACTION_VALUES = Object.freeze(Object.values(RECOVERY_ACTIONS));

export const DEFAULT_PLAYER_SAFE_MESSAGES = Object.freeze({
  [SAFE_INTERACTION_ERROR_CODES.STALE_INTERACTION]:
    'That moment has changed. Review the current scene and choose your next action.',
  [SAFE_INTERACTION_ERROR_CODES.STALE_PREVIEW]:
    'That preview is no longer current. Review the scene and preview your action again.',
  [SAFE_INTERACTION_ERROR_CODES.ACTION_ALREADY_RESOLVING]:
    'That action is already being resolved.',
  [SAFE_INTERACTION_ERROR_CODES.ACTION_UNAVAILABLE]: 'That option is no longer available.',
  [SAFE_INTERACTION_ERROR_CODES.INTERACTION_ENDED]:
    'This conversation has ended. Return to the current scene.',
  [SAFE_INTERACTION_ERROR_CODES.ACTIVE_CHARACTER_REQUIRED]:
    'Select an active character before continuing.',
  [SAFE_INTERACTION_ERROR_CODES.CURRENT_SCENE_CHANGED]:
    'The scene has changed. Review the current scene and choose your next action.',
  [SAFE_INTERACTION_ERROR_CODES.TRANSITION_UNAVAILABLE]:
    'That path is not available right now.',
  [SAFE_INTERACTION_ERROR_CODES.UNAUTHORIZED]: 'Sign in to continue.',
  [SAFE_INTERACTION_ERROR_CODES.FORBIDDEN]: 'That action is not available to you.',
  [SAFE_INTERACTION_ERROR_CODES.NOT_FOUND]: 'That interaction could not be found.',
  [SAFE_INTERACTION_ERROR_CODES.VALIDATION_FAILED]:
    'Review the current options and try again.',
  [SAFE_INTERACTION_ERROR_CODES.INTERNAL_ERROR]:
    'Something went wrong. Refresh the current scene and try again.',
});

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function isSafeInteractionErrorCode(value) {
  return SAFE_INTERACTION_ERROR_CODE_VALUES.includes(cleanText(value).toUpperCase());
}

export function isRecoveryAction(value) {
  return RECOVERY_ACTION_VALUES.includes(cleanText(value));
}

export function normalizeRecoveryAction(value, fallback = RECOVERY_ACTIONS.REFRESH_CURRENT_SCENE) {
  const normalized = cleanText(value);
  return isRecoveryAction(normalized) ? normalized : fallback;
}

export function createSafeInteractionError(input = {}) {
  const code = cleanText(input.code).toUpperCase();
  const safeCode = isSafeInteractionErrorCode(code)
    ? code
    : SAFE_INTERACTION_ERROR_CODES.INTERNAL_ERROR;
  return {
    code: safeCode,
    player_safe_message:
      cleanText(input.player_safe_message ?? input.playerSafeMessage) ||
      DEFAULT_PLAYER_SAFE_MESSAGES[safeCode],
    gm_dev_message: cleanText(input.gm_dev_message ?? input.gmDevMessage) || null,
    internal_cause: normalizeObject(input.internal_cause ?? input.internalCause),
    retryable: input.retryable === undefined ? true : Boolean(input.retryable),
    recovery_action: normalizeRecoveryAction(input.recovery_action ?? input.recoveryAction),
  };
}
