import { createInteractionDomainAdapter } from './domainAdapter.js';
import { INTERACTION_DOMAINS, INTERACTION_PRIMITIVES } from './primitiveTypes.js';

export const explorationSurfaceFocusCommitAdapter = createInteractionDomainAdapter({
  domain: INTERACTION_DOMAINS.EXPLORATION,
  domain_label: 'Exploration Surface / Focus / Commit',
  field_map: {
    [INTERACTION_PRIMITIVES.SURFACE]: {
      source_fields: ['automatic_observations'],
      domain_collection: 'automatic_observations',
      domain_type: 'automatic_observation',
      default_label: 'Observation',
    },
    [INTERACTION_PRIMITIVES.PASSIVE_CONTEXT]: {
      source_fields: ['passive_discoveries'],
      domain_collection: 'passive_discoveries',
      domain_type: 'passive_discovery',
      default_label: 'Passive discovery',
    },
    [INTERACTION_PRIMITIVES.FREE_FOCUS]: {
      source_fields: ['free_focus'],
      domain_collection: 'free_focus',
      domain_type: 'free_focus',
      default_label: 'Closer look',
    },
    [INTERACTION_PRIMITIVES.COMMITTED_ACTION]: {
      source_fields: ['beat_actions'],
      domain_collection: 'beat_actions',
      domain_type: 'beat_action',
      default_label: 'Beat action',
    },
    [INTERACTION_PRIMITIVES.TRANSITIONS]: {
      source_fields: ['transitions', 'exits', 'scene_transitions'],
      domain_collection: 'transitions',
      domain_type: 'exploration_transition',
      default_label: 'Path',
    },
  },
});

export function normalizeExplorationSurfaceFocusCommit(content = {}) {
  return explorationSurfaceFocusCommitAdapter.normalizeDefinitions(content);
}
