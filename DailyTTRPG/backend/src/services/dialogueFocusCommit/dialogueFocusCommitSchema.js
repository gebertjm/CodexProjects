import { CHECK_VISIBILITIES } from '../interactionCore/primitiveTypes.js';
import {
  DIALOGUE_DOMAIN_COLLECTIONS,
  DIALOGUE_DOMAIN_TYPES,
  DIALOGUE_FOCUS_COMMIT_DOMAIN,
} from './dialogueFocusCommitTypes.js';

export const DIALOGUE_SCENE_MODELS = Object.freeze([
  DIALOGUE_FOCUS_COMMIT_DOMAIN,
  'focus_commit',
]);

export const DIALOGUE_SCENE_TYPES = Object.freeze([
  'dialogue',
  'conversation',
]);

export const DIALOGUE_CHECK_VISIBILITIES = CHECK_VISIBILITIES;

export const DIALOGUE_CHECK_MODES = Object.freeze([
  'standard',
  'advantage',
  'take_20',
  'passive',
  'hidden',
  'gm_roll',
  'narrative_only',
]);

export const SOCIAL_MOVE_TYPES = Object.freeze([
  'ask',
  'reassure',
  'press',
  'challenge',
  'deceive',
  'persuade',
  'intimidate',
  'listen',
  'confide',
  'bargain',
  'apologize',
  'comfort',
  'provoke',
  'withdraw',
  'custom',
]);

export const RELATIONSHIP_STATE_SCOPES = Object.freeze([
  'persistent_npc_state',
  'dialogue_scene_state',
  'dialogue_local',
  'temporary',
  'decaying',
  'cleared_by_event',
]);

export const RELATIONSHIP_FIELD_TYPES = Object.freeze([
  'number',
  'boolean',
  'enum',
  'ladder',
  'text',
  'tag_set',
]);

export const RELATIONSHIP_WRITE_OPERATIONS = Object.freeze([
  'set',
  'increment',
  'decrement',
  'append',
  'remove',
  'clear',
]);

export const RELATIONSHIP_VISIBILITIES = Object.freeze([
  'gm_only',
  'player_visible',
  'player_perceived',
  'gm_and_player_perceived',
]);

export const DIALOGUE_EXIT_TYPES = Object.freeze([
  'free',
  'risky',
  'gated',
  'beat_action',
  'unavailable',
  'resolved',
  'transition',
]);

export const DIALOGUE_TRANSITION_TARGET_TYPES = Object.freeze([
  'exploration',
  'combat',
  'travel',
  'investigation',
  'downtime',
  'dialogue',
  'cutscene',
  'result_scene',
  'campaign_end',
  'quest_end',
  'scene',
]);

export const ANNOTATION_REVIEW_STATUSES = Object.freeze([
  'suggested',
  'pending_review',
  'approved',
  'approved_with_edits',
  'rejected',
  'suppressed',
]);

export const ANNOTATION_LIFECYCLE_STATUSES = Object.freeze([
  'draft',
  'active',
  'inactive',
  'archived',
  'superseded',
  'retracted',
]);

export const CORRECTION_REVIEW_STATUSES = Object.freeze([
  'generated',
  'pending_review',
  'approved',
  'approved_with_edits',
  'rejected',
  'suppressed',
]);

export const CORRECTION_LIFECYCLE_STATUSES = Object.freeze([
  'draft',
  'active',
  'inactive',
  'archived',
  'superseded',
  'retracted',
]);

export const PLAYER_SAFE_SOURCE_VISIBILITIES = Object.freeze([
  'player_visible',
  'player_safe',
  'public',
  'character_known',
  'character_perceived',
]);

export const DIALOGUE_SCHEMA_COLLECTIONS = Object.freeze({
  ...DIALOGUE_DOMAIN_COLLECTIONS,
  PARTICIPANTS: 'participants',
  GENERIC_FALLBACK: 'generic_fallback',
  RELATIONSHIP_STATE_DEFINITIONS: 'relationship_state_definitions',
  COMPLETED_DIALOGUE_RECORD: DIALOGUE_DOMAIN_COLLECTIONS.COMPLETED_DIALOGUE_RECORD,
  TRANSCRIPT_TURNS: 'transcript_turns',
  ANNOTATION_CHAINS: 'annotation_chains',
  CORRECTION_CHAINS: 'correction_chains',
});

export const DIALOGUE_SCHEMA_TYPES = Object.freeze({
  ...DIALOGUE_DOMAIN_TYPES,
  DIALOGUE_SCENE: 'dialogue_scene',
  PARTICIPANT: 'participant',
  GENERIC_FALLBACK: 'generic_fallback',
  RELATIONSHIP_STATE_DEFINITION: 'relationship_state_definition',
  TRANSCRIPT_TURN: 'transcript_turn',
  ANNOTATION_CHAIN: 'annotation_chain',
  CORRECTION_CHAIN: 'correction_chain',
});
