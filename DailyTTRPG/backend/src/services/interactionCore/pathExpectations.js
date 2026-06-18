import {
  INTERACTION_OPTION_KINDS,
  normalizeSharedInteractionDomain,
} from './contracts.js';
import { VISIBILITY_SCOPES, normalizeVisibilityScope } from './visibility.js';

export const PATH_STEP_KINDS = Object.freeze({
  LOAD_CONTEXT: 'load_context',
  RUN_NON_COMMITTING_INQUIRY: 'run_non_committing_inquiry',
  PREVIEW_COMMITTED_ACTION: 'preview_committed_action',
  SUBMIT_COMMITTED_ACTION: 'submit_committed_action',
  RESOLVE_COMMITTED_ACTION: 'resolve_committed_action',
  EXIT_OR_TRANSITION: 'exit_or_transition',
  ASSERT_OUTPUT: 'assert_output',
  ASSERT_VISIBILITY: 'assert_visibility',
  ASSERT_DEBUG: 'assert_debug',
});

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionalId(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    const text = cleanText(String(value));
    if (text) {
      return text;
    }
  }
  return null;
}

/**
 * @typedef {object} InteractionPathStep
 * @property {string} step_kind
 * @property {string|null} option_id
 * @property {string|null} option_kind
 * @property {object} input
 * @property {object} expected
 */

export function createInteractionPathStep(input = {}) {
  return {
    step_id: optionalId(input.step_id, input.stepId, input.id),
    step_kind: cleanText(input.step_kind ?? input.stepKind ?? input.kind),
    option_id: optionalId(input.option_id, input.optionId),
    option_kind: cleanText(input.option_kind ?? input.optionKind) || null,
    input: normalizeObject(input.input),
    expected: normalizeObject(input.expected),
  };
}

export function createInteractionPathExpectation(input = {}) {
  return {
    path_id: optionalId(input.path_id, input.pathId, input.id),
    interaction_domain: normalizeSharedInteractionDomain(
      input.interaction_domain ?? input.interactionDomain
    ),
    description: cleanText(input.description) || null,
    steps: normalizeArray(input.steps).map(createInteractionPathStep),
    expected_outputs: normalizeArray(input.expected_outputs ?? input.expectedOutputs),
    expected_visibility: normalizeArray(input.expected_visibility ?? input.expectedVisibility),
    expected_next_state: normalizeObject(input.expected_next_state ?? input.expectedNextState),
    expected_debug: normalizeArray(input.expected_debug ?? input.expectedDebug),
  };
}

export function createExpectedVisibilityAssertion(input = {}) {
  return {
    scope: normalizeVisibilityScope(input.scope, VISIBILITY_SCOPES.PLAYER),
    forbidden_terms: normalizeArray(input.forbidden_terms ?? input.forbiddenTerms).map(String),
    allowed_terms: normalizeArray(input.allowed_terms ?? input.allowedTerms).map(String),
    surface: cleanText(input.surface) || null,
  };
}

export function createExpectedOutputAssertion(input = {}) {
  return {
    output_kind: cleanText(input.output_kind ?? input.outputKind),
    output_id: optionalId(input.output_id, input.outputId),
    expected_status: cleanText(input.expected_status ?? input.expectedStatus) || null,
    idempotent: input.idempotent === undefined ? true : Boolean(input.idempotent),
    metadata: normalizeObject(input.metadata),
  };
}

export function createExpectedNextStateAssertion(input = {}) {
  return {
    status: cleanText(input.status) || null,
    interaction_domain: normalizeSharedInteractionDomain(
      input.interaction_domain ?? input.interactionDomain
    ),
    expected_option_kind:
      cleanText(input.expected_option_kind ?? input.expectedOptionKind) ||
      INTERACTION_OPTION_KINDS.SYSTEM_RESULT,
    metadata: normalizeObject(input.metadata),
  };
}

export function createExpectedDebugAssertion(input = {}) {
  return {
    scope: normalizeVisibilityScope(input.scope, VISIBILITY_SCOPES.GM_DEV),
    required_sections: normalizeArray(input.required_sections ?? input.requiredSections).map(String),
    expected_routing: normalizeObject(input.expected_routing ?? input.expectedRouting),
    metadata: normalizeObject(input.metadata),
  };
}
