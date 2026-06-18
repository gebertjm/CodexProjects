export const INTERACTION_DOMAINS = Object.freeze({
  EXPLORATION: 'surface_focus_commit',
  DIALOGUE: 'dialogue_focus_commit',
});

export const INTERACTION_PRIMITIVES = Object.freeze({
  SURFACE: 'surface',
  PASSIVE_CONTEXT: 'passive_context',
  FREE_FOCUS: 'free_focus',
  COMMITTED_ACTION: 'committed_action',
  PREVIEW: 'preview',
  RESOLUTION: 'resolution',
  STATE_CHANGES: 'state_changes',
  OUTPUTS: 'outputs',
  TRANSITIONS: 'transitions',
});

export const INTERACTION_PRIMITIVE_ORDER = Object.freeze([
  INTERACTION_PRIMITIVES.SURFACE,
  INTERACTION_PRIMITIVES.PASSIVE_CONTEXT,
  INTERACTION_PRIMITIVES.FREE_FOCUS,
  INTERACTION_PRIMITIVES.COMMITTED_ACTION,
  INTERACTION_PRIMITIVES.PREVIEW,
  INTERACTION_PRIMITIVES.RESOLUTION,
  INTERACTION_PRIMITIVES.STATE_CHANGES,
  INTERACTION_PRIMITIVES.OUTPUTS,
  INTERACTION_PRIMITIVES.TRANSITIONS,
]);

export const CHECK_VISIBILITIES = Object.freeze([
  'visible',
  'hidden',
  'success_only',
  'narrative_only',
]);

export const COMMITTED_CHECK_RESOLUTIONS = Object.freeze([
  'standard',
  'advantage',
  'take_20',
]);

export function isInteractionPrimitive(value) {
  return INTERACTION_PRIMITIVE_ORDER.includes(value);
}

export function isInteractionDomain(value) {
  return Object.values(INTERACTION_DOMAINS).includes(value);
}

/**
 * @typedef {object} SharedInteractionPrimitive
 * @property {string} primitive_type Shared primitive, such as `free_focus`.
 * @property {string} domain Domain adapter, such as `dialogue_focus_commit`.
 * @property {string} domain_collection Domain source collection, such as `clarifying_questions`.
 * @property {string} domain_type Domain item name, such as `clarifying_question`.
 * @property {string} source_field Original content field used by the adapter.
 * @property {string} interaction_id Stable adapter-level ID.
 * @property {string|null} target_id Optional target reference.
 * @property {string|null} label Optional player/dev label.
 * @property {object} definition Original content definition, kept for future runtime stages.
 */

/**
 * @typedef {object} SharedPreviewResult
 * @property {string} domain Adapter domain.
 * @property {string} status Preview status.
 * @property {SharedInteractionPrimitive|null} matched_primitive Matched committed action if resolved.
 * @property {Array<object>} warnings Blocking or non-blocking preview warnings.
 */

/**
 * @typedef {object} SharedResolutionResult
 * @property {string} domain Adapter domain.
 * @property {string} status Resolution status.
 * @property {Array<object>} state_changes Explicit state writes with provenance.
 * @property {Array<object>} outputs Player-facing and canonical outputs.
 * @property {Array<object>} transitions Domain exits or scene/runtime transitions.
 */
