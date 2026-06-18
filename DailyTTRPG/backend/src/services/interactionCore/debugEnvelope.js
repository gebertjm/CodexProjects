import { normalizeSharedInteractionDomain } from './contracts.js';
import { normalizeVisibilityScope, VISIBILITY_SCOPES } from './visibility.js';

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * @typedef {object} InteractionDebugEnvelope
 * GM/dev, test-harness, and internal only. This contract must be stripped from
 * normal player-facing payloads.
 */

export function createDebugEnvelope(input = {}) {
  return {
    interaction_domain: normalizeSharedInteractionDomain(input.interaction_domain ?? input.interactionDomain),
    visibility_scope: normalizeVisibilityScope(
      input.visibility_scope ?? input.visibilityScope,
      VISIBILITY_SCOPES.GM_DEV
    ),
    player_safe: false,
    source_content_id: cleanText(input.source_content_id ?? input.sourceContentId) || null,
    source_content_path: cleanText(input.source_content_path ?? input.sourceContentPath) || null,
    actor_context: normalizeObject(input.actor_context ?? input.actorContext),
    availability: normalizeObject(input.availability),
    requirements: normalizeArray(input.requirements),
    checks: normalizeArray(input.checks),
    modifiers: normalizeArray(input.modifiers),
    result_bands: normalizeArray(input.result_bands ?? input.resultBands),
    selected_branch: normalizeObject(input.selected_branch ?? input.selectedBranch),
    state_reads: normalizeArray(input.state_reads ?? input.stateReads),
    state_writes: normalizeArray(input.state_writes ?? input.stateWrites),
    output_provenance: normalizeArray(input.output_provenance ?? input.outputProvenance),
    transition_routing: normalizeArray(input.transition_routing ?? input.transitionRouting),
    stale_or_duplicate_diagnostics: normalizeObject(
      input.stale_or_duplicate_diagnostics ?? input.staleOrDuplicateDiagnostics
    ),
    validation_messages: normalizeArray(input.validation_messages ?? input.validationMessages),
    visibility_filtering_notes: normalizeArray(
      input.visibility_filtering_notes ?? input.visibilityFilteringNotes
    ),
    domain_debug: normalizeObject(input.domain_debug ?? input.domainDebug),
  };
}

export function isDebugEnvelopePlayerSafe(envelope) {
  return envelope?.player_safe === true && envelope?.visibility_scope === VISIBILITY_SCOPES.PLAYER;
}
