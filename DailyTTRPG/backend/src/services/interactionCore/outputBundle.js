import { normalizeVisibilityScope, VISIBILITY_SCOPES } from './visibility.js';

export const OUTPUT_BUNDLE_ARRAY_FIELDS = Object.freeze([
  'knowledge_outputs',
  'objective_outputs',
  'history_outputs',
  'state_writes',
  'relationship_or_social_writes',
  'transition_outputs',
  'completed_record_outputs',
  'transcript_outputs',
  'archive_search_outputs',
  'debug_outputs',
  'resource_outputs',
  'condition_outputs',
  'damage_outputs',
  'initiative_outputs',
]);

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @typedef {object} InteractionOutputBundle
 * @property {object|null} player_result
 * @property {Array<object>} knowledge_outputs
 * @property {Array<object>} objective_outputs
 * @property {Array<object>} history_outputs
 * @property {object|null} latest_development_output
 * @property {Array<object>} state_writes
 * @property {Array<object>} relationship_or_social_writes
 * @property {Array<object>} transition_outputs
 * @property {Array<object>} completed_record_outputs
 * @property {Array<object>} transcript_outputs
 * @property {Array<object>} archive_search_outputs
 * @property {Array<object>} debug_outputs
 * @property {Array<object>} resource_outputs Future combat/navigation-compatible output slot.
 * @property {Array<object>} condition_outputs Future combat-compatible output slot.
 * @property {Array<object>} damage_outputs Future combat-compatible output slot.
 * @property {Array<object>} initiative_outputs Future combat-compatible output slot.
 * @property {object} visibility_metadata
 */

export function createEmptyOutputBundle(overrides = {}) {
  const bundle = {
    player_result: overrides.player_result ?? overrides.playerResult ?? null,
    latest_development_output:
      overrides.latest_development_output ?? overrides.latestDevelopmentOutput ?? null,
    visibility_metadata: {
      visibility_scope: normalizeVisibilityScope(
        overrides.visibility_metadata?.visibility_scope ??
          overrides.visibilityMetadata?.visibilityScope,
        VISIBILITY_SCOPES.SYSTEM_INTERNAL
      ),
      ...normalizeObject(overrides.visibility_metadata ?? overrides.visibilityMetadata),
    },
  };

  for (const field of OUTPUT_BUNDLE_ARRAY_FIELDS) {
    const camel = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    bundle[field] = normalizeArray(overrides[field] ?? overrides[camel]);
  }

  return bundle;
}

export function isOutputBundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return OUTPUT_BUNDLE_ARRAY_FIELDS.every((field) => Array.isArray(value[field]));
}
