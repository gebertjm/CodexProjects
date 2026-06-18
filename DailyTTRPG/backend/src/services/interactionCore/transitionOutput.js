import {
  SHARED_INTERACTION_DOMAINS,
  normalizeSharedInteractionDomain,
} from './contracts.js';
import { normalizeVisibilityScope, VISIBILITY_SCOPES } from './visibility.js';

export const TRANSITION_TARGET_TYPES = Object.freeze({
  SCENE: 'scene',
  LOCATION: 'location',
  DIALOGUE: 'dialogue',
  COMBAT: 'combat',
  COMBAT_PENDING: 'combat_pending',
  NAVIGATION: 'navigation',
  FUTURE_SUPPORTED: 'future_supported',
  NONE: 'none',
});

export const TRANSITION_STATUSES = Object.freeze({
  LIVE: 'live',
  PENDING: 'pending',
  UNAVAILABLE: 'unavailable',
  BLOCKED: 'blocked',
  FUTURE_SUPPORTED: 'future_supported',
});

export const TRANSITION_OUTPUT_STATUSES = TRANSITION_STATUSES;

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function optionalText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function targetType(value) {
  const normalized = cleanText(value).toLowerCase();
  return Object.values(TRANSITION_TARGET_TYPES).includes(normalized)
    ? normalized
    : TRANSITION_TARGET_TYPES.NONE;
}

function transitionStatus(value) {
  const normalized = cleanText(value).toLowerCase();
  return Object.values(TRANSITION_STATUSES).includes(normalized)
    ? normalized
    : TRANSITION_STATUSES.UNAVAILABLE;
}

export function isTransitionTargetType(value) {
  return Object.values(TRANSITION_TARGET_TYPES).includes(cleanText(value).toLowerCase());
}

export function isTransitionStatus(value) {
  return Object.values(TRANSITION_STATUSES).includes(cleanText(value).toLowerCase());
}

/**
 * @typedef {object} InteractionTransitionOutput
 * @property {string} status
 * @property {string} target_type
 * @property {string|null} target_id
 * @property {string|null} player_label
 * @property {string|null} player_summary
 * @property {object} gm_dev_routing
 * @property {string|null} future_supported_reason
 * @property {object} visibility_metadata
 */

export function createTransitionOutput(input = {}) {
  return {
    interaction_domain:
      normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain) ??
      SHARED_INTERACTION_DOMAINS.EXPLORATION,
    status: transitionStatus(input.status),
    target_type: targetType(input.target_type ?? input.targetType),
    target_id: optionalText(input.target_id, input.targetId, input.scene_id, input.dialogue_scene_id),
    player_label: optionalText(input.player_label, input.playerLabel, input.label),
    player_summary: optionalText(input.player_summary, input.playerSummary, input.summary),
    gm_dev_routing: normalizeObject(input.gm_dev_routing ?? input.gmDevRouting),
    future_supported_reason: optionalText(
      input.future_supported_reason,
      input.futureSupportedReason
    ),
    visibility_metadata: {
      visibility_scope: normalizeVisibilityScope(
        input.visibility_metadata?.visibility_scope ?? input.visibilityMetadata?.visibilityScope,
        VISIBILITY_SCOPES.SYSTEM_INTERNAL
      ),
      ...normalizeObject(input.visibility_metadata ?? input.visibilityMetadata),
    },
  };
}
