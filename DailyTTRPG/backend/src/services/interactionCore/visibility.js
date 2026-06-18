export const VISIBILITY_SCOPES = Object.freeze({
  PLAYER: 'player',
  GM_DEV: 'gm_dev',
  TEST_HARNESS: 'test_harness',
  SYSTEM_INTERNAL: 'system_internal',
});

export const VISIBILITY_SCOPE_VALUES = Object.freeze(Object.values(VISIBILITY_SCOPES));

export const PLAYER_SAFE_VISIBILITY_SCOPES = Object.freeze([VISIBILITY_SCOPES.PLAYER]);

export const INTERNAL_VISIBILITY_SCOPES = Object.freeze([
  VISIBILITY_SCOPES.GM_DEV,
  VISIBILITY_SCOPES.TEST_HARNESS,
  VISIBILITY_SCOPES.SYSTEM_INTERNAL,
]);

function cleanText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * @typedef {'player'|'gm_dev'|'test_harness'|'system_internal'} VisibilityScope
 */

export function isVisibilityScope(value) {
  return VISIBILITY_SCOPE_VALUES.includes(cleanText(value));
}

export function normalizeVisibilityScope(value, fallback = VISIBILITY_SCOPES.SYSTEM_INTERNAL) {
  const normalized = cleanText(value);
  return isVisibilityScope(normalized) ? normalized : fallback;
}

export function isPlayerVisibilityScope(value) {
  return normalizeVisibilityScope(value, null) === VISIBILITY_SCOPES.PLAYER;
}

export function isGmDevVisibilityScope(value) {
  return normalizeVisibilityScope(value, null) === VISIBILITY_SCOPES.GM_DEV;
}

export function isInternalVisibilityScope(value) {
  return INTERNAL_VISIBILITY_SCOPES.includes(normalizeVisibilityScope(value, null));
}
