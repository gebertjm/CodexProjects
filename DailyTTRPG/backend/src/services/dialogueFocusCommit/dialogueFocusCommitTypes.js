import { INTERACTION_DOMAINS, INTERACTION_PRIMITIVES } from '../interactionCore/primitiveTypes.js';

export const DIALOGUE_FOCUS_COMMIT_DOMAIN = INTERACTION_DOMAINS.DIALOGUE;

export const DIALOGUE_DOMAIN_COLLECTIONS = Object.freeze({
  CONVERSATION_SURFACE: 'conversation_surface',
  PASSIVE_SOCIAL_INSIGHT: 'passive_social_insight',
  CLARIFYING_QUESTIONS: 'clarifying_questions',
  COMMITTED_SOCIAL_MOVES: 'committed_social_moves',
  DIALOGUE_EXIT: 'dialogue_exit',
  COMPLETED_DIALOGUE_RECORD: 'completed_dialogue_record',
});

export const DIALOGUE_DOMAIN_TYPES = Object.freeze({
  CONVERSATION_SURFACE: 'conversation_surface',
  PASSIVE_SOCIAL_INSIGHT: 'passive_social_insight',
  CLARIFYING_QUESTION: 'clarifying_question',
  COMMITTED_SOCIAL_MOVE: 'committed_social_move',
  DIALOGUE_EXIT: 'dialogue_exit',
  COMPLETED_DIALOGUE_RECORD: 'completed_dialogue_record',
});

export const DIALOGUE_PRIMITIVE_MAP = Object.freeze({
  [INTERACTION_PRIMITIVES.SURFACE]: DIALOGUE_DOMAIN_COLLECTIONS.CONVERSATION_SURFACE,
  [INTERACTION_PRIMITIVES.PASSIVE_CONTEXT]: DIALOGUE_DOMAIN_COLLECTIONS.PASSIVE_SOCIAL_INSIGHT,
  [INTERACTION_PRIMITIVES.FREE_FOCUS]: DIALOGUE_DOMAIN_COLLECTIONS.CLARIFYING_QUESTIONS,
  [INTERACTION_PRIMITIVES.COMMITTED_ACTION]: DIALOGUE_DOMAIN_COLLECTIONS.COMMITTED_SOCIAL_MOVES,
  [INTERACTION_PRIMITIVES.TRANSITIONS]: DIALOGUE_DOMAIN_COLLECTIONS.DIALOGUE_EXIT,
});

export const DIALOGUE_FIELD_MAP = Object.freeze({
  [INTERACTION_PRIMITIVES.SURFACE]: Object.freeze({
    source_fields: ['conversation_surface'],
    domain_collection: DIALOGUE_DOMAIN_COLLECTIONS.CONVERSATION_SURFACE,
    domain_type: DIALOGUE_DOMAIN_TYPES.CONVERSATION_SURFACE,
    default_label: 'Conversation surface',
  }),
  [INTERACTION_PRIMITIVES.PASSIVE_CONTEXT]: Object.freeze({
    source_fields: ['passive_social_insight', 'passive_social_insights'],
    domain_collection: DIALOGUE_DOMAIN_COLLECTIONS.PASSIVE_SOCIAL_INSIGHT,
    domain_type: DIALOGUE_DOMAIN_TYPES.PASSIVE_SOCIAL_INSIGHT,
    default_label: 'Passive social insight',
  }),
  [INTERACTION_PRIMITIVES.FREE_FOCUS]: Object.freeze({
    source_fields: ['clarifying_questions'],
    domain_collection: DIALOGUE_DOMAIN_COLLECTIONS.CLARIFYING_QUESTIONS,
    domain_type: DIALOGUE_DOMAIN_TYPES.CLARIFYING_QUESTION,
    default_label: 'Clarifying question',
  }),
  [INTERACTION_PRIMITIVES.COMMITTED_ACTION]: Object.freeze({
    source_fields: ['committed_social_moves'],
    domain_collection: DIALOGUE_DOMAIN_COLLECTIONS.COMMITTED_SOCIAL_MOVES,
    domain_type: DIALOGUE_DOMAIN_TYPES.COMMITTED_SOCIAL_MOVE,
    default_label: 'Committed social move',
  }),
  [INTERACTION_PRIMITIVES.TRANSITIONS]: Object.freeze({
    source_fields: ['dialogue_exit', 'dialogue_exits', 'exits'],
    domain_collection: DIALOGUE_DOMAIN_COLLECTIONS.DIALOGUE_EXIT,
    domain_type: DIALOGUE_DOMAIN_TYPES.DIALOGUE_EXIT,
    default_label: 'Dialogue exit',
  }),
});
