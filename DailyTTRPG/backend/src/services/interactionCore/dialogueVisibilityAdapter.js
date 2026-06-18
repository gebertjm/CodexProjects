import {
  projectForGmDev,
  projectForPlayer,
  projectForTestHarness,
  scanForPlayerHiddenData,
} from './visibilityBoundary.js';

export const DIALOGUE_PLAYER_HIDDEN_KEYS = Object.freeze([
  'relationship_state_reads',
  'relationship_state_writes',
  'social_state_reads',
  'social_state_writes',
  'relationship_state',
  'social_state',
  'relationship_audit_record',
  'relationship_audit_links_json',
  'relationship_summary_links_json',
  'raw_relationship_meters',
  'raw_social_meters',
  'failed_social_requirements',
  'preview_metadata_json',
  'preview_debug_json',
  'transcript_debug',
  'gm_dev_transcript_metadata',
  'gm_dev_content_ref_json',
  'annotation_correction_chain',
  'pending_annotation',
  'suppressed_correction',
]);

function projectionOptions(options = {}) {
  return {
    ...options,
    extraHiddenKeys: [
      ...DIALOGUE_PLAYER_HIDDEN_KEYS,
      ...(options.extraHiddenKeys ?? options.extra_hidden_keys ?? []),
    ],
  };
}

export function projectDialogueForPlayer(payload = {}, options = {}) {
  return projectForPlayer(payload, projectionOptions(options));
}

export function projectDialogueForGmDev(payload = {}, options = {}) {
  return projectForGmDev(payload, options);
}

export function projectDialogueForTestHarness(payload = {}, options = {}) {
  return projectForTestHarness(payload, projectionOptions(options));
}

export function assertDialoguePlayerSafe(payload = {}, options = {}) {
  const violations = scanForPlayerHiddenData(payload, projectionOptions(options));
  if (violations.length > 0) {
    const error = new Error(
      `Dialogue player payload leaked hidden/internal data: ${violations
        .slice(0, 5)
        .map((violation) => violation.message)
        .join('; ')}`
    );
    error.violations = violations;
    throw error;
  }
  return true;
}

export const dialogueVisibilityAdapter = Object.freeze({
  projectForPlayer: projectDialogueForPlayer,
  projectForGmDev: projectDialogueForGmDev,
  projectForTestHarness: projectDialogueForTestHarness,
});
