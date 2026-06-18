import {
  DND5E_2014_RULESET,
  ROLL_GENERATION_ORIGINS,
  resolveRulesetIdentity,
  resolveSavingThrow,
} from './rulesResolution.js';

export { DND5E_2014_RULESET, ROLL_GENERATION_ORIGINS };

export const CONDITION_SUPPORT_STATUSES = Object.freeze({
  FULLY_IMPLEMENTED: 'fully_implemented',
  DEFERRED: 'deferred',
  UNSUPPORTED: 'unsupported',
});

export const CONDITION_IDS = Object.freeze({
  PRONE: 'prone',
  GRAPPLED: 'grappled',
  RESTRAINED: 'restrained',
  POISONED: 'poisoned',
  FRIGHTENED: 'frightened',
  BLINDED: 'blinded',
  STUNNED: 'stunned',
  INCAPACITATED: 'incapacitated',
  UNCONSCIOUS: 'unconscious',
  CHARMED: 'charmed',
  DEAFENED: 'deafened',
  INVISIBLE: 'invisible',
  PARALYZED: 'paralyzed',
  PETRIFIED: 'petrified',
  EXHAUSTION: 'exhaustion',
  STABLE: 'stable',
  DEAD: 'dead',
  DEFEATED: 'defeated',
});

export const CONDITION_STACKING_POLICIES = Object.freeze({
  NO_STACKING: 'no_stacking',
  REFRESH_DURATION: 'refresh_duration',
  REPLACE_EXISTING: 'replace_existing',
  KEEP_LONGER_DURATION: 'keep_longer_duration',
  KEEP_STRONGER_AUTHORED_VALUE: 'keep_stronger_authored_value',
  ALLOW_SEPARATE_INSTANCES_BY_SOURCE: 'allow_separate_instances_by_source',
  ALLOW_MULTIPLE_INDEPENDENT: 'allow_multiple_independent',
  EXPLICIT_AUTHORED_POLICY: 'explicit_authored_policy',
});

export const CONDITION_PERSISTENCE_POLICIES = Object.freeze({
  COMBAT_SCOPED: 'combat_scoped',
  PERSISTENT: 'persistent',
  CONCENTRATION_LINKED: 'concentration_linked',
  EXPLICIT: 'explicit',
});

export const CONDITION_LIFECYCLE_EVENTS = Object.freeze({
  CONDITION_APPLIED: 'condition_applied',
  START_OF_SOURCE_TURN: 'start_of_source_turn',
  END_OF_SOURCE_TURN: 'end_of_source_turn',
  START_OF_TARGET_TURN: 'start_of_target_turn',
  END_OF_TARGET_TURN: 'end_of_target_turn',
  ROUND_ADVANCED: 'round_advanced',
  DAMAGE_TAKEN: 'damage_taken',
  HEALING_RECEIVED: 'healing_received',
  PARTICIPANT_BECAME_INCAPACITATED: 'participant_became_incapacitated',
  PARTICIPANT_BECAME_UNCONSCIOUS: 'participant_became_unconscious',
  PARTICIPANT_REGAINED_CONSCIOUSNESS: 'participant_regained_consciousness',
  SOURCE_BECAME_INCAPACITATED: 'source_became_incapacitated',
  SOURCE_LEFT_VALID_REACH: 'source_left_valid_reach',
  TARGET_LEFT_VALID_REACH: 'target_left_valid_reach',
  SOURCE_NO_LONGER_VISIBLE: 'source_no_longer_visible',
  TARGET_MOVED_CLOSER_TO_SOURCE: 'target_moved_closer_to_source',
  CONCENTRATION_ENDED: 'concentration_ended',
  COMBAT_ENDED: 'combat_ended',
  ADVENTURE_TIME_ADVANCED: 'adventure_time_advanced',
  EXPLICIT_AUTHORED_REMOVAL: 'explicit_authored_removal',
  EXPLICIT_RELEASE: 'explicit_release',
  DISCHARGED: 'discharged',
  PARTICIPANT_REMOVED_FROM_COMBAT: 'participant_removed_from_combat',
  RELATIONSHIP_INVALID: 'relationship_invalid',
});

export const CONDITION_CONTEXT_KINDS = Object.freeze({
  ACTION_LEGALITY: 'action_legality',
  ATTACK_ROLL: 'attack_roll',
  ATTACKS_AGAINST_TARGET: 'attacks_against_target',
  SAVING_THROW: 'saving_throw',
  ABILITY_CHECK: 'ability_check',
  MOVEMENT: 'movement',
  TARGETING: 'targeting',
  CAPABILITY: 'capability',
});

export const ZERO_HP_POLICIES = Object.freeze({
  ORDINARY_ENEMY: 'ordinary_enemy',
  DEATH_SAVE_ELIGIBLE: 'death_save_eligible',
  IMPORTANT_NPC_DEATH_SAVE: 'important_npc_death_save',
  PROTECTED: 'protected',
});

export const ZERO_HP_STATUSES = Object.freeze({
  NO_TRANSITION: 'no_transition',
  DEFEATED: 'defeated',
  UNCONSCIOUS_DEATH_SAVES: 'unconscious_death_saves',
  UNCONSCIOUS_STABLE: 'unconscious_stable',
  DEAD: 'dead',
  PROTECTED: 'protected',
});

export const DEATH_SAVE_STATUSES = Object.freeze({
  PENDING: 'pending',
  STABLE: 'stable',
  DEAD: 'dead',
  REVIVED: 'revived',
});

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'gm_dev',
  'trace',
  'internal_name',
  'provenance',
  'source_path',
  'hidden',
  'death_save_policy',
  'hidden_enemy_death_save',
  'mutation_plan',
  'raw_condition_record',
  'roll_override',
  'roll_record',
  'difficulty_class',
  'secret',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(value).toLowerCase();
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function lifecycleError(message, code = 'COMBAT_STATE_LIFECYCLE_VALIDATION_FAILED') {
  const error = new Error(message);
  error.code = code;
  error.player_safe_message = 'That combat state cannot be resolved yet.';
  return error;
}

function normalizeEnum(value, allowed, fallback, label) {
  const normalized = normalizedKey(value);
  if (!normalized) {
    return fallback;
  }
  if (!allowed.includes(normalized)) {
    throw lifecycleError(`Unsupported ${label} "${value}".`, `UNSUPPORTED_${label.toUpperCase()}`);
  }
  return normalized;
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function participantId(input = {}) {
  return cleanText(input.participant_id ?? input.participantId ?? input.id ?? input.target_participant_id ?? input.targetParticipantId);
}

function normalizeDuration(input = {}) {
  const source = input && typeof input === 'object' ? input : { duration_type: input };
  return {
    duration_type: cleanText(source.duration_type ?? source.durationType ?? source.type) || 'until_removed',
    duration_value: source.duration_value ?? source.durationValue ?? source.value ?? null,
    duration_unit: cleanText(source.duration_unit ?? source.durationUnit ?? source.unit) || null,
    expiration_event: cleanText(source.expiration_event ?? source.expirationEvent) || null,
    remaining_rounds: source.remaining_rounds ?? source.remainingRounds ?? null,
    expires_at: cleanText(source.expires_at ?? source.expiresAt) || null,
  };
}

function assertNoExecutableDefinition(value, path = 'condition') {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'function') {
      throw lifecycleError(`Condition definitions cannot include executable functions at ${path}.`, 'EXECUTABLE_CONDITION_AUTHORING_NOT_ALLOWED');
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (typeof nested === 'function' || ['handler', 'script', 'code', 'eval'].includes(normalized)) {
      throw lifecycleError(`Condition definitions cannot include executable code at ${path}.${key}.`, 'EXECUTABLE_CONDITION_AUTHORING_NOT_ALLOWED');
    }
    if (nested && typeof nested === 'object') {
      assertNoExecutableDefinition(nested, `${path}.${key}`);
    }
  }
}

const CONDITION_DEFINITION_FIXTURES = Object.freeze({
  [CONDITION_IDS.PRONE]: {
    name: 'Prone',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Prone affects attacks and standing movement.',
    movement_effects: { crawl_allowed: true, standing_cost: 'half_speed' },
    attack_roll_modifiers: { self_disadvantage: true },
    attacks_against_target_modifiers: { close_advantage: true, far_disadvantage: true, requires_proximity_context: true },
    stacking_policy: CONDITION_STACKING_POLICIES.NO_STACKING,
  },
  [CONDITION_IDS.GRAPPLED]: {
    name: 'Grappled',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Speed is zero while grappled.',
    movement_effects: { speed_zero: true, ignores_speed_bonuses: true },
    expiration_events: [
      CONDITION_LIFECYCLE_EVENTS.SOURCE_BECAME_INCAPACITATED,
      CONDITION_LIFECYCLE_EVENTS.EXPLICIT_RELEASE,
      CONDITION_LIFECYCLE_EVENTS.RELATIONSHIP_INVALID,
    ],
    stacking_policy: CONDITION_STACKING_POLICIES.ALLOW_SEPARATE_INSTANCES_BY_SOURCE,
  },
  [CONDITION_IDS.RESTRAINED]: {
    name: 'Restrained',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Restrained sets speed to zero and makes attacks and Dexterity saves harder.',
    movement_effects: { speed_zero: true, ignores_speed_bonuses: true },
    attack_roll_modifiers: { self_disadvantage: true },
    attacks_against_target_modifiers: { advantage: true },
    saving_throw_modifiers: { dexterity_disadvantage: true },
    stacking_policy: CONDITION_STACKING_POLICIES.NO_STACKING,
  },
  [CONDITION_IDS.POISONED]: {
    name: 'Poisoned',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Poisoned imposes disadvantage on attacks and ability checks.',
    attack_roll_modifiers: { self_disadvantage: true },
    ability_check_modifiers: { self_disadvantage: true },
    stacking_policy: CONDITION_STACKING_POLICIES.NO_STACKING,
  },
  [CONDITION_IDS.FRIGHTENED]: {
    name: 'Frightened',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Frightened limits attacks, checks, and willing movement toward the source while visible.',
    attack_roll_modifiers: { self_disadvantage_when_source_visible: true },
    ability_check_modifiers: { self_disadvantage_when_source_visible: true },
    movement_effects: { cannot_willingly_move_closer_to_source_when_visible: true },
    stacking_policy: CONDITION_STACKING_POLICIES.ALLOW_SEPARATE_INSTANCES_BY_SOURCE,
  },
  [CONDITION_IDS.BLINDED]: {
    name: 'Blinded',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Blinded prevents sight and affects attacks.',
    capability_effects: { can_see: false },
    ability_check_modifiers: { sight_required_auto_fail: true },
    attack_roll_modifiers: { self_disadvantage: true },
    attacks_against_target_modifiers: { advantage: true },
    stacking_policy: CONDITION_STACKING_POLICIES.NO_STACKING,
  },
  [CONDITION_IDS.STUNNED]: {
    name: 'Stunned',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Stunned includes incapacitation, no movement, faltering speech, and failed Strength or Dexterity saves.',
    composed_conditions: [CONDITION_IDS.INCAPACITATED],
    movement_effects: { cannot_move: true, speed_zero: true },
    speech_effects: { speech: 'faltering' },
    saving_throw_modifiers: { automatic_failure_abilities: ['STR', 'DEX'] },
    attacks_against_target_modifiers: { advantage: true },
    stacking_policy: CONDITION_STACKING_POLICIES.NO_STACKING,
  },
  [CONDITION_IDS.INCAPACITATED]: {
    name: 'Incapacitated',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Incapacitated prevents actions, bonus actions, and reactions.',
    action_restrictions: { actions: false, bonus_actions: false, reactions: false, object_action_interactions: false },
    stacking_policy: CONDITION_STACKING_POLICIES.NO_STACKING,
  },
  [CONDITION_IDS.UNCONSCIOUS]: {
    name: 'Unconscious',
    support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED,
    player_description: 'Unconscious includes incapacitation, no movement or speech, prone, failed Strength or Dexterity saves, and vulnerable close hits.',
    composed_conditions: [CONDITION_IDS.INCAPACITATED, CONDITION_IDS.PRONE],
    movement_effects: { cannot_move: true, speed_zero: true },
    speech_effects: { speech: 'none' },
    awareness_effects: { aware: false },
    saving_throw_modifiers: { automatic_failure_abilities: ['STR', 'DEX'] },
    attacks_against_target_modifiers: { advantage: true, close_hit_becomes_critical: true },
    action_restrictions: { actions: false, bonus_actions: false, reactions: false, object_action_interactions: false },
    stacking_policy: CONDITION_STACKING_POLICIES.NO_STACKING,
  },
  [CONDITION_IDS.CHARMED]: { name: 'Charmed', support_status: CONDITION_SUPPORT_STATUSES.DEFERRED },
  [CONDITION_IDS.DEAFENED]: { name: 'Deafened', support_status: CONDITION_SUPPORT_STATUSES.DEFERRED },
  [CONDITION_IDS.INVISIBLE]: { name: 'Invisible', support_status: CONDITION_SUPPORT_STATUSES.DEFERRED },
  [CONDITION_IDS.PARALYZED]: { name: 'Paralyzed', support_status: CONDITION_SUPPORT_STATUSES.DEFERRED },
  [CONDITION_IDS.PETRIFIED]: { name: 'Petrified', support_status: CONDITION_SUPPORT_STATUSES.DEFERRED },
  [CONDITION_IDS.EXHAUSTION]: { name: 'Exhaustion', support_status: CONDITION_SUPPORT_STATUSES.DEFERRED },
  [CONDITION_IDS.STABLE]: { name: 'Stable', support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED },
  [CONDITION_IDS.DEAD]: { name: 'Dead', support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED },
  [CONDITION_IDS.DEFEATED]: { name: 'Defeated', support_status: CONDITION_SUPPORT_STATUSES.FULLY_IMPLEMENTED },
});

export function createConditionDefinition(input = {}) {
  assertNoExecutableDefinition(input, 'condition_definition');
  const conditionId = normalizedKey(input.condition_id ?? input.conditionId ?? input.id);
  if (!conditionId) {
    throw lifecycleError('Condition definitions require a condition id.', 'CONDITION_ID_REQUIRED');
  }
  const base = CONDITION_DEFINITION_FIXTURES[conditionId] ?? {};
  const ruleset = resolveRulesetIdentity(input.ruleset ?? DND5E_2014_RULESET);
  return {
    condition_id: conditionId,
    player_name: cleanText(input.player_name ?? input.playerName ?? input.name ?? base.name) || conditionId,
    internal_name: cleanText(input.internal_name ?? input.internalName ?? base.name) || conditionId,
    ruleset,
    support_status: normalizeEnum(
      input.support_status ?? input.supportStatus ?? base.support_status,
      Object.values(CONDITION_SUPPORT_STATUSES),
      CONDITION_SUPPORT_STATUSES.UNSUPPORTED,
      'condition_support_status'
    ),
    movement_effects: cloneSerializable(input.movement_effects ?? input.movementEffects ?? base.movement_effects ?? {}),
    action_restrictions: cloneSerializable(input.action_restrictions ?? input.actionRestrictions ?? base.action_restrictions ?? {}),
    attack_roll_modifiers: cloneSerializable(input.attack_roll_modifiers ?? input.attackRollModifiers ?? base.attack_roll_modifiers ?? {}),
    attacks_against_target_modifiers: cloneSerializable(input.attacks_against_target_modifiers ?? input.attacksAgainstTargetModifiers ?? base.attacks_against_target_modifiers ?? {}),
    saving_throw_modifiers: cloneSerializable(input.saving_throw_modifiers ?? input.savingThrowModifiers ?? base.saving_throw_modifiers ?? {}),
    ability_check_modifiers: cloneSerializable(input.ability_check_modifiers ?? input.abilityCheckModifiers ?? base.ability_check_modifiers ?? {}),
    capability_effects: cloneSerializable(input.capability_effects ?? input.capabilityEffects ?? base.capability_effects ?? {}),
    speech_effects: cloneSerializable(input.speech_effects ?? input.speechEffects ?? base.speech_effects ?? {}),
    awareness_effects: cloneSerializable(input.awareness_effects ?? input.awarenessEffects ?? base.awareness_effects ?? {}),
    composed_conditions: asArray(input.composed_conditions ?? input.composedConditions ?? base.composed_conditions),
    expiration_events: asArray(input.expiration_events ?? input.expirationEvents ?? base.expiration_events),
    stacking_policy: normalizeEnum(
      input.stacking_policy ?? input.stackingPolicy ?? base.stacking_policy,
      Object.values(CONDITION_STACKING_POLICIES),
      CONDITION_STACKING_POLICIES.NO_STACKING,
      'condition_stacking_policy'
    ),
    default_persistence_policy: normalizeEnum(
      input.default_persistence_policy ?? input.defaultPersistencePolicy,
      Object.values(CONDITION_PERSISTENCE_POLICIES),
      CONDITION_PERSISTENCE_POLICIES.COMBAT_SCOPED,
      'condition_persistence_policy'
    ),
    player_description: cleanText(input.player_description ?? input.playerDescription ?? base.player_description) || null,
    gm_dev_provenance: cloneSerializable(input.gm_dev_provenance ?? input.gmDevProvenance ?? null),
  };
}

export function getConditionDefinition(conditionId, options = {}) {
  return createConditionDefinition({
    condition_id: conditionId,
    ruleset: options.ruleset ?? DND5E_2014_RULESET,
  });
}

export function createConditionInstance(input = {}) {
  const conditionType = normalizedKey(input.condition_type ?? input.conditionType ?? input.condition_id ?? input.conditionId);
  const definition = createConditionDefinition({
    condition_id: conditionType,
    ruleset: input.ruleset ?? DND5E_2014_RULESET,
  });
  const sourceParticipantId = cleanText(input.source_participant_id ?? input.sourceParticipantId ?? input.source?.participant_id ?? input.source?.id) || null;
  const targetParticipantId = cleanText(input.target_participant_id ?? input.targetParticipantId ?? input.target?.participant_id ?? input.target?.id);
  if (!targetParticipantId) {
    throw lifecycleError('Condition instances require a target participant.', 'CONDITION_TARGET_REQUIRED');
  }
  const committedResolutionId = cleanText(input.committed_resolution_id ?? input.committedResolutionId) || null;
  const instanceId = cleanText(input.condition_instance_id ?? input.conditionInstanceId ?? input.id) ||
    stableId(['condition', conditionType, targetParticipantId, sourceParticipantId, committedResolutionId || 'manual']);
  return {
    condition_instance_id: instanceId,
    condition_type: conditionType,
    ruleset: definition.ruleset,
    source_participant_id: sourceParticipantId,
    target_participant_id: targetParticipantId,
    applied_at: cleanText(input.applied_at ?? input.appliedAt) || null,
    duration: normalizeDuration(input.duration ?? {}),
    stacking_key: cleanText(input.stacking_key ?? input.stackingKey) || stableId([conditionType, targetParticipantId]),
    persistence_policy: normalizeEnum(
      input.persistence_policy ?? input.persistencePolicy,
      Object.values(CONDITION_PERSISTENCE_POLICIES),
      definition.default_persistence_policy,
      'condition_persistence_policy'
    ),
    concentration_id: cleanText(input.concentration_id ?? input.concentrationId) || null,
    committed_resolution_id: committedResolutionId,
    support_status: definition.support_status,
    active: input.active === undefined ? true : Boolean(input.active),
    expired: Boolean(input.expired),
    expiration_reason: cleanText(input.expiration_reason ?? input.expirationReason) || null,
    player_text: cleanText(input.player_text ?? input.playerText ?? definition.player_description) || null,
    authored_metadata: cloneSerializable(input.authored_metadata ?? input.authoredMetadata ?? {}),
    gm_dev_trace_metadata: cloneSerializable(input.gm_dev_trace_metadata ?? input.gmDevTraceMetadata ?? {}),
  };
}

function isSameEffectiveCondition(left, right, definition) {
  if (!left.active || left.expired) {
    return false;
  }
  if (left.condition_type !== right.condition_type || left.target_participant_id !== right.target_participant_id) {
    return false;
  }
  if (definition.stacking_policy === CONDITION_STACKING_POLICIES.ALLOW_SEPARATE_INSTANCES_BY_SOURCE) {
    return left.source_participant_id === right.source_participant_id;
  }
  if (definition.stacking_policy === CONDITION_STACKING_POLICIES.ALLOW_MULTIPLE_INDEPENDENT) {
    return false;
  }
  return true;
}

function durationScore(instance = {}) {
  const duration = instance.duration ?? {};
  if (duration.remaining_rounds !== null && duration.remaining_rounds !== undefined) {
    return toInteger(duration.remaining_rounds);
  }
  if (duration.duration_value !== null && duration.duration_value !== undefined) {
    return toInteger(duration.duration_value);
  }
  return Number.POSITIVE_INFINITY;
}

export function applyCondition(input = {}) {
  const existing = asArray(input.existing_conditions ?? input.existingConditions).map((condition) => createConditionInstance(condition));
  const incoming = createConditionInstance(input.condition ?? input.condition_instance ?? input.conditionInstance ?? input);
  const definition = getConditionDefinition(incoming.condition_type, { ruleset: incoming.ruleset });
  const duplicate = incoming.committed_resolution_id && existing.find((condition) => condition.committed_resolution_id === incoming.committed_resolution_id);
  if (duplicate) {
    return {
      status: 'duplicate_handled',
      applied_instance: duplicate,
      effective_conditions: existing,
      mutation_instructions: [],
      player_safe_summary: 'That condition application was already handled.',
      gm_dev_trace: { decision: 'duplicate_committed_resolution', committed_resolution_id: incoming.committed_resolution_id },
    };
  }

  const matching = existing.filter((condition) => isSameEffectiveCondition(condition, incoming, definition));
  let effective = [...existing];
  let status = 'applied';
  let replaced_instances = [];

  if (matching.length > 0) {
    if ([CONDITION_STACKING_POLICIES.NO_STACKING, CONDITION_STACKING_POLICIES.REFRESH_DURATION].includes(definition.stacking_policy)) {
      effective = existing.map((condition) => {
        if (matching.some((match) => match.condition_instance_id === condition.condition_instance_id)) {
          status = definition.stacking_policy === CONDITION_STACKING_POLICIES.REFRESH_DURATION ? 'refreshed' : 'already_present';
          return definition.stacking_policy === CONDITION_STACKING_POLICIES.REFRESH_DURATION
            ? { ...condition, duration: incoming.duration, committed_resolution_id: incoming.committed_resolution_id ?? condition.committed_resolution_id }
            : condition;
        }
        return condition;
      });
    } else if (definition.stacking_policy === CONDITION_STACKING_POLICIES.REPLACE_EXISTING) {
      replaced_instances = matching;
      effective = existing
        .filter((condition) => !matching.some((match) => match.condition_instance_id === condition.condition_instance_id))
        .concat(incoming);
      status = 'replaced';
    } else if (definition.stacking_policy === CONDITION_STACKING_POLICIES.KEEP_LONGER_DURATION) {
      const longest = matching.reduce((best, condition) => (durationScore(condition) > durationScore(best) ? condition : best), matching[0]);
      if (durationScore(incoming) > durationScore(longest)) {
        replaced_instances = matching;
        effective = existing
          .filter((condition) => !matching.some((match) => match.condition_instance_id === condition.condition_instance_id))
          .concat(incoming);
        status = 'replaced_with_longer_duration';
      } else {
        status = 'kept_existing_longer_duration';
      }
    } else {
      effective.push(incoming);
    }
  } else {
    effective.push(incoming);
  }

  return {
    status,
    applied_instance: incoming,
    replaced_instances,
    effective_conditions: effective,
    mutation_instructions: status === 'already_present' || status === 'kept_existing_longer_duration'
      ? []
      : [{ instruction_type: 'upsert_condition_instance', condition_instance: incoming, replaced_instances }],
    player_safe_summary: definition.support_status === CONDITION_SUPPORT_STATUSES.DEFERRED
      ? `${definition.player_name} is tracked, but full behavior is not active yet.`
      : `${definition.player_name} is now in effect.`,
    gm_dev_trace: {
      decision: status,
      condition_type: incoming.condition_type,
      support_status: definition.support_status,
      stacking_policy: definition.stacking_policy,
      replaced_instance_ids: replaced_instances.map((condition) => condition.condition_instance_id),
    },
  };
}

export function removeCondition(input = {}) {
  const existing = asArray(input.existing_conditions ?? input.existingConditions).map((condition) => createConditionInstance(condition));
  const conditionInstanceId = cleanText(input.condition_instance_id ?? input.conditionInstanceId);
  const conditionType = normalizedKey(input.condition_type ?? input.conditionType);
  const sourceParticipantId = cleanText(input.source_participant_id ?? input.sourceParticipantId);
  const concentrationId = cleanText(input.concentration_id ?? input.concentrationId);
  const reason = cleanText(input.removal_reason ?? input.removalReason) || 'explicit_removal';
  const removed = [];
  const remaining = [];

  for (const condition of existing) {
    const matches =
      (conditionInstanceId && condition.condition_instance_id === conditionInstanceId) ||
      (conditionType && condition.condition_type === conditionType && (!sourceParticipantId || condition.source_participant_id === sourceParticipantId)) ||
      (concentrationId && condition.concentration_id === concentrationId);
    if (matches) {
      removed.push({ ...condition, active: false, expired: true, expiration_reason: reason });
    } else {
      remaining.push(condition);
    }
  }

  return {
    status: removed.length > 0 ? 'removed' : 'not_found',
    removal_reason: reason,
    removed_instances: removed,
    remaining_conditions: remaining,
    mutation_instructions: removed.map((condition) => ({
      instruction_type: 'remove_condition_instance',
      condition_instance_id: condition.condition_instance_id,
      removal_reason: reason,
    })),
    player_safe_summary: removed.length > 0 ? 'The condition ends.' : 'No matching condition was found.',
    gm_dev_trace: {
      removal_reason: reason,
      removed_instance_ids: removed.map((condition) => condition.condition_instance_id),
      remaining_instance_ids: remaining.map((condition) => condition.condition_instance_id),
    },
  };
}

function effectiveConditionsForParticipant(conditions, participant) {
  const id = participantId(participant);
  const direct = asArray(conditions).map((condition) => createConditionInstance(condition)).filter((condition) => condition.active && !condition.expired && condition.target_participant_id === id);
  const composed = [];
  for (const condition of direct) {
    const definition = getConditionDefinition(condition.condition_type, { ruleset: condition.ruleset });
    for (const composedId of definition.composed_conditions) {
      composed.push(createConditionInstance({
        condition_type: composedId,
        target_participant_id: condition.target_participant_id,
        source_participant_id: condition.source_participant_id,
        condition_instance_id: `${condition.condition_instance_id}:composed:${composedId}`,
        duration: condition.duration,
        persistence_policy: condition.persistence_policy,
        active: true,
      }));
    }
  }
  return [...direct, ...composed];
}

function uniqueSources(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.condition_type}:${entry.source_participant_id ?? 'none'}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function evaluateConditionEffects(input = {}) {
  const contextKind = normalizeEnum(
    input.context_kind ?? input.contextKind,
    Object.values(CONDITION_CONTEXT_KINDS),
    CONDITION_CONTEXT_KINDS.CAPABILITY,
    'condition_context_kind'
  );
  const participant = input.participant ?? input.actor ?? input.target ?? {};
  const participantConditions = uniqueSources(effectiveConditionsForParticipant(input.conditions ?? [], participant));
  const result = {
    context_kind: contextKind,
    participant_id: participantId(participant),
    advantage_sources: [],
    disadvantage_sources: [],
    automatic_failure: false,
    automatic_failure_reason: null,
    action_allowed: true,
    bonus_action_allowed: true,
    reaction_allowed: true,
    movement_allowed: true,
    speed_zero: false,
    can_see: true,
    can_speak: true,
    aware: true,
    speech: 'normal',
    movement_decision: 'legal',
    critical_on_hit: false,
    dropped_items_instruction: null,
    insufficient_context: false,
    support_warnings: [],
    source_conditions: participantConditions.map((condition) => condition.condition_type),
    gm_dev_trace: [],
  };

  for (const condition of participantConditions) {
    const definition = getConditionDefinition(condition.condition_type, { ruleset: condition.ruleset });
    result.gm_dev_trace.push({ condition_type: condition.condition_type, support_status: definition.support_status });
    if (definition.support_status === CONDITION_SUPPORT_STATUSES.DEFERRED) {
      result.support_warnings.push(`${definition.player_name} behavior is deferred.`);
      continue;
    }
    if (definition.capability_effects?.can_see === false) {
      result.can_see = false;
    }
    if (definition.awareness_effects?.aware === false) {
      result.aware = false;
    }
    if (definition.speech_effects?.speech === 'none') {
      result.can_speak = false;
      result.speech = 'none';
    } else if (definition.speech_effects?.speech === 'faltering' && result.speech !== 'none') {
      result.speech = 'faltering';
    }
    if (definition.action_restrictions?.actions === false) {
      result.action_allowed = false;
      result.bonus_action_allowed = false;
    }
    if (definition.action_restrictions?.bonus_actions === false) {
      result.bonus_action_allowed = false;
    }
    if (definition.action_restrictions?.reactions === false) {
      result.reaction_allowed = false;
    }
    if (definition.movement_effects?.speed_zero || definition.movement_effects?.cannot_move) {
      result.speed_zero = true;
      if (definition.movement_effects?.cannot_move) {
        result.movement_allowed = false;
      }
    }
    if (contextKind === CONDITION_CONTEXT_KINDS.ATTACK_ROLL) {
      const sourceVisible = input.source_visible ?? input.sourceVisible;
      if (definition.attack_roll_modifiers?.self_disadvantage) {
        result.disadvantage_sources.push(condition.condition_type);
      }
      if (definition.attack_roll_modifiers?.self_disadvantage_when_source_visible) {
        if (sourceVisible === undefined) {
          result.insufficient_context = true;
        } else if (sourceVisible) {
          result.disadvantage_sources.push(condition.condition_type);
        }
      }
    }
    if (contextKind === CONDITION_CONTEXT_KINDS.ATTACKS_AGAINST_TARGET) {
      const withinFiveFeet = input.attacker_within_five_feet ?? input.attackerWithinFiveFeet;
      if (definition.attacks_against_target_modifiers?.advantage) {
        result.advantage_sources.push(condition.condition_type);
      }
      if (definition.attacks_against_target_modifiers?.close_advantage) {
        if (withinFiveFeet === undefined) {
          result.insufficient_context = true;
        } else if (withinFiveFeet) {
          result.advantage_sources.push(condition.condition_type);
        } else {
          result.disadvantage_sources.push(condition.condition_type);
        }
      }
      if (definition.attacks_against_target_modifiers?.close_hit_becomes_critical && withinFiveFeet === true) {
        result.critical_on_hit = true;
      }
    }
    if (contextKind === CONDITION_CONTEXT_KINDS.SAVING_THROW) {
      const ability = cleanText(input.ability).toUpperCase();
      if (definition.saving_throw_modifiers?.dexterity_disadvantage && ability === 'DEX') {
        result.disadvantage_sources.push(condition.condition_type);
      }
      if (asArray(definition.saving_throw_modifiers?.automatic_failure_abilities).includes(ability)) {
        result.automatic_failure = true;
        result.automatic_failure_reason = condition.condition_type;
      }
    }
    if (contextKind === CONDITION_CONTEXT_KINDS.ABILITY_CHECK) {
      const requiresSight = Boolean(input.requires_sight ?? input.requiresSight);
      const sourceVisible = input.source_visible ?? input.sourceVisible;
      if (definition.ability_check_modifiers?.self_disadvantage) {
        result.disadvantage_sources.push(condition.condition_type);
      }
      if (definition.ability_check_modifiers?.self_disadvantage_when_source_visible) {
        if (sourceVisible === undefined) {
          result.insufficient_context = true;
        } else if (sourceVisible) {
          result.disadvantage_sources.push(condition.condition_type);
        }
      }
      if (definition.ability_check_modifiers?.sight_required_auto_fail && requiresSight) {
        result.automatic_failure = true;
        result.automatic_failure_reason = condition.condition_type;
      }
    }
    if (contextKind === CONDITION_CONTEXT_KINDS.MOVEMENT && condition.condition_type === CONDITION_IDS.FRIGHTENED) {
      result.movement_decision = evaluateFrightenedMovement({
        condition,
        source_visible: input.source_visible ?? input.sourceVisible,
        movement_is_voluntary: input.movement_is_voluntary ?? input.movementIsVoluntary,
        current_proximity_rank: input.current_proximity_rank ?? input.currentProximityRank,
        proposed_proximity_rank: input.proposed_proximity_rank ?? input.proposedProximityRank,
      }).movement_decision;
      if (result.movement_decision === 'insufficient_context') {
        result.insufficient_context = true;
      }
    }
    if (condition.condition_type === CONDITION_IDS.UNCONSCIOUS) {
      result.dropped_items_instruction = {
        instruction_type: 'drop_held_items',
        participant_id: participantId(participant),
        reason: CONDITION_IDS.UNCONSCIOUS,
      };
    }
  }

  return result;
}

export function calculateProneStandingCost(input = {}) {
  const speed = Math.max(toInteger(input.current_speed ?? input.currentSpeed ?? input.speed), 0);
  return Math.floor(speed / 2);
}

export function evaluateProneStanding(input = {}) {
  const speed = Math.max(toInteger(input.current_speed ?? input.currentSpeed ?? input.speed), 0);
  const movementRemaining = Math.max(toInteger(input.movement_remaining ?? input.movementRemaining), 0);
  const cost = calculateProneStandingCost({ current_speed: speed });
  if (speed <= 0) {
    return { can_stand: false, standing_cost: cost, reason: 'speed_zero' };
  }
  if (movementRemaining < cost) {
    return { can_stand: false, standing_cost: cost, reason: 'insufficient_movement' };
  }
  return {
    can_stand: true,
    standing_cost: cost,
    condition_removal_instruction: { instruction_type: 'remove_condition_type', condition_type: CONDITION_IDS.PRONE, reason: 'stood_up' },
  };
}

export function evaluateProneCrawl() {
  return {
    can_crawl: true,
    condition_remains: true,
    player_safe_summary: 'Crawling does not end Prone.',
  };
}

export function evaluateFrightenedMovement(input = {}) {
  const sourceVisible = input.source_visible ?? input.sourceVisible;
  const voluntary = input.movement_is_voluntary ?? input.movementIsVoluntary;
  const current = input.current_proximity_rank ?? input.currentProximityRank;
  const proposed = input.proposed_proximity_rank ?? input.proposedProximityRank;
  if (sourceVisible === undefined || voluntary === undefined || current === undefined || proposed === undefined) {
    return {
      movement_decision: 'insufficient_context',
      player_safe_summary: 'More movement context is needed.',
    };
  }
  if (!sourceVisible || !voluntary) {
    return { movement_decision: 'legal', reason: !sourceVisible ? 'source_not_visible' : 'forced_movement' };
  }
  if (Number(proposed) < Number(current)) {
    return { movement_decision: 'illegal_willingly_approaches_fear_source' };
  }
  return { movement_decision: 'legal' };
}

export function processConditionLifecycleEvent(input = {}) {
  const eventType = normalizeEnum(
    input.event_type ?? input.eventType,
    Object.values(CONDITION_LIFECYCLE_EVENTS),
    null,
    'condition_lifecycle_event'
  );
  const existing = asArray(input.conditions).map((condition) => createConditionInstance(condition));
  const removed = [];
  const remaining = [];
  for (const condition of existing) {
    const definition = getConditionDefinition(condition.condition_type, { ruleset: condition.ruleset });
    let expires = false;
    let reason = null;
    if (condition.condition_type === CONDITION_IDS.GRAPPLED && [
      CONDITION_LIFECYCLE_EVENTS.SOURCE_BECAME_INCAPACITATED,
      CONDITION_LIFECYCLE_EVENTS.EXPLICIT_RELEASE,
      CONDITION_LIFECYCLE_EVENTS.RELATIONSHIP_INVALID,
    ].includes(eventType)) {
      const sourceMatches = !input.source_participant_id || condition.source_participant_id === cleanText(input.source_participant_id);
      expires = sourceMatches;
      reason = eventType;
    }
    if (eventType === CONDITION_LIFECYCLE_EVENTS.CONCENTRATION_ENDED && condition.concentration_id && condition.concentration_id === cleanText(input.concentration_id ?? input.concentrationId)) {
      expires = true;
      reason = eventType;
    }
    if (eventType === CONDITION_LIFECYCLE_EVENTS.COMBAT_ENDED && condition.persistence_policy === CONDITION_PERSISTENCE_POLICIES.COMBAT_SCOPED) {
      expires = true;
      reason = eventType;
    }
    if (definition.expiration_events.includes(eventType)) {
      expires = true;
      reason = eventType;
    }
    if (expires) {
      removed.push({ ...condition, active: false, expired: true, expiration_reason: reason });
    } else {
      remaining.push(condition);
    }
  }
  return {
    event_type: eventType,
    removed_instances: removed,
    remaining_conditions: remaining,
    mutation_instructions: removed.map((condition) => ({
      instruction_type: 'expire_condition_instance',
      condition_instance_id: condition.condition_instance_id,
      expiration_reason: condition.expiration_reason,
    })),
    gm_dev_trace: {
      event_type: eventType,
      removed_instance_ids: removed.map((condition) => condition.condition_instance_id),
    },
  };
}

export function startConcentration(input = {}) {
  const participant = input.participant ?? {};
  const participantConditions = asArray(input.conditions);
  const incapacitated = evaluateConditionEffects({
    participant,
    conditions: participantConditions,
    context_kind: CONDITION_CONTEXT_KINDS.ACTION_LEGALITY,
  });
  if (!incapacitated.action_allowed) {
    return {
      status: 'unavailable',
      player_safe_summary: 'This participant cannot begin concentration right now.',
      gm_dev_trace: { reason: 'participant_incapacitated' },
    };
  }
  const existing = input.existing_concentration ?? input.existingConcentration ?? null;
  const newState = {
    concentration_id: cleanText(input.concentration_id ?? input.concentrationId) || stableId(['concentration', participantId(participant), input.source_effect_id ?? input.sourceEffectId]),
    participant_id: participantId(participant),
    source_effect_id: cleanText(input.source_effect_id ?? input.sourceEffectId) || null,
    active: true,
    started_at: cleanText(input.started_at ?? input.startedAt) || null,
    duration: normalizeDuration(input.duration ?? {}),
    linked_condition_instance_ids: asArray(input.linked_condition_instance_ids ?? input.linkedConditionInstanceIds),
    linked_effect_ids: asArray(input.linked_effect_ids ?? input.linkedEffectIds),
  };
  return {
    status: existing?.active ? 'replaced' : 'started',
    previous_concentration: existing?.active ? { ...existing, active: false, ended_reason: 'replaced_by_new_concentration' } : null,
    concentration: newState,
    linked_effects_to_remove: existing?.active ? asArray(existing.linked_condition_instance_ids).concat(asArray(existing.linked_effect_ids)) : [],
    player_safe_summary: existing?.active ? 'Concentration shifts to the new effect.' : 'Concentration begins.',
    gm_dev_trace: {
      replacement_order: existing?.active ? ['end_previous', 'remove_previous_linked_effects', 'start_new'] : ['start_new'],
    },
  };
}

export function endConcentration(input = {}) {
  const existing = input.concentration ?? input.existing_concentration ?? input.existingConcentration ?? null;
  if (!existing || !existing.active) {
    return {
      status: 'already_inactive',
      concentration: existing ?? null,
      linked_effects_to_remove: [],
      player_safe_summary: 'No active concentration remains.',
      gm_dev_trace: { decision: 'idempotent_no_active_concentration' },
    };
  }
  const reason = cleanText(input.end_reason ?? input.endReason) || 'ended';
  return {
    status: 'ended',
    concentration: { ...existing, active: false, ended_reason: reason },
    linked_effects_to_remove: asArray(existing.linked_condition_instance_ids).concat(asArray(existing.linked_effect_ids)),
    player_safe_summary: 'Concentration ends.',
    gm_dev_trace: { end_reason: reason },
  };
}

export function processConcentrationDamage(input = {}) {
  const concentration = input.concentration ?? null;
  const damageAmount = Math.max(toInteger(input.damage_amount ?? input.damageAmount ?? input.damage_total ?? input.damageTotal), 0);
  if (!concentration || !concentration.active) {
    return { status: 'no_active_concentration', save_required: false };
  }
  if (damageAmount <= 0) {
    return { status: 'no_save_required', save_required: false, concentration };
  }
  const difficultyClass = Math.max(10, Math.floor(damageAmount / 2));
  const saveResult = resolveSavingThrow({
    ruleset: input.ruleset ?? DND5E_2014_RULESET,
    ability: 'CON',
    difficulty_class: difficultyClass,
    modifiers: input.modifiers ?? [],
    advantage_sources: input.advantage_sources ?? input.advantageSources ?? [],
    disadvantage_sources: input.disadvantage_sources ?? input.disadvantageSources ?? [],
    roll_override: input.roll_override ?? input.rollOverride,
    generation_origin: input.generation_origin ?? input.generationOrigin,
    existing_roll_record: input.existing_roll_record ?? input.existingRollRecord,
    actor_ref: { participant_id: concentration.participant_id },
  });
  if (saveResult.success) {
    return {
      status: 'concentration_maintained',
      save_required: true,
      difficulty_class: difficultyClass,
      save_result: saveResult,
      concentration,
      player_safe_summary: 'Concentration holds.',
    };
  }
  return {
    status: 'concentration_ended',
    save_required: true,
    difficulty_class: difficultyClass,
    save_result: saveResult,
    ...endConcentration({ concentration, end_reason: 'failed_concentration_save' }),
  };
}

export function processConcentrationParticipantEvent(input = {}) {
  const eventType = input.event_type ?? input.eventType;
  if ([CONDITION_LIFECYCLE_EVENTS.PARTICIPANT_BECAME_INCAPACITATED, CONDITION_LIFECYCLE_EVENTS.PARTICIPANT_BECAME_UNCONSCIOUS].includes(eventType)) {
    return endConcentration({ concentration: input.concentration, end_reason: eventType });
  }
  return { status: 'no_concentration_change', concentration: input.concentration ?? null };
}

export function evaluateConcentrationCarryForward(input = {}) {
  const concentration = input.concentration ?? null;
  if (!concentration || !concentration.active) {
    return { status: 'no_active_concentration', carry_forward: false };
  }
  const duration = concentration.duration ?? {};
  if (duration.remaining_rounds !== null && duration.remaining_rounds !== undefined && toInteger(duration.remaining_rounds) <= 0) {
    return { status: 'expired', carry_forward: false, expiration_reason: 'duration_expired' };
  }
  return {
    status: 'carry_forward',
    carry_forward: true,
    adventure_duration_seconds: duration.remaining_rounds !== null && duration.remaining_rounds !== undefined
      ? toInteger(duration.remaining_rounds) * 6
      : null,
    precise_expiration_available: duration.remaining_rounds !== null && duration.remaining_rounds !== undefined,
    linked_effect_ids: asArray(concentration.linked_effect_ids),
    linked_condition_instance_ids: asArray(concentration.linked_condition_instance_ids),
  };
}

function baseDeathSaveState(input = {}) {
  return {
    successes: Math.max(toInteger(input.successes), 0),
    failures: Math.max(toInteger(input.failures), 0),
    stable: Boolean(input.stable),
    dead: Boolean(input.dead),
    natural_recovery_at: cleanText(input.natural_recovery_at ?? input.naturalRecoveryAt) || null,
  };
}

export function evaluateZeroHitPointTransition(input = {}) {
  const participant = input.participant ?? {};
  const policy = normalizeEnum(
    input.defeat_policy ?? input.defeatPolicy ?? participant.defeat_policy ?? participant.defeatPolicy,
    Object.values(ZERO_HP_POLICIES),
    participant.faction === 'enemy' ? ZERO_HP_POLICIES.ORDINARY_ENEMY : ZERO_HP_POLICIES.DEATH_SAVE_ELIGIBLE,
    'zero_hp_policy'
  );
  const maxHitPoints = Math.max(toInteger(participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp ?? participant.maxHp), 0);
  const overkillDamage = Math.max(toInteger(input.overkill_damage ?? input.overkillDamage), 0);
  if (toInteger(participant.current_hit_points ?? participant.currentHp ?? participant.current_hp, 0) > 0 && !input.reached_zero_hit_points) {
    return { status: ZERO_HP_STATUSES.NO_TRANSITION, mutation_instructions: [] };
  }
  if (overkillDamage >= maxHitPoints && maxHitPoints > 0 && policy !== ZERO_HP_POLICIES.PROTECTED) {
    return {
      status: ZERO_HP_STATUSES.DEAD,
      conditions_to_apply: [CONDITION_IDS.DEAD],
      death_save_state: { successes: 0, failures: 3, stable: false, dead: true },
      mutation_instructions: [{ instruction_type: 'mark_participant_dead', participant_id: participantId(participant) }],
      gm_dev_trace: { policy, overkill_damage: overkillDamage, max_hit_points: maxHitPoints, massive_damage: true },
    };
  }
  if (policy === ZERO_HP_POLICIES.ORDINARY_ENEMY) {
    return {
      status: ZERO_HP_STATUSES.DEFEATED,
      conditions_to_apply: [CONDITION_IDS.DEFEATED],
      mutation_instructions: [{ instruction_type: 'mark_participant_defeated', participant_id: participantId(participant), is_active: false }],
      gm_dev_trace: { policy },
    };
  }
  if (policy === ZERO_HP_POLICIES.PROTECTED) {
    return {
      status: ZERO_HP_STATUSES.PROTECTED,
      protected_state: cleanText(input.protected_state ?? input.protectedState) || 'protected_zero_hit_points',
      mutation_instructions: [{ instruction_type: 'mark_participant_protected_zero_hp', participant_id: participantId(participant) }],
      gm_dev_trace: { policy },
    };
  }
  return {
    status: ZERO_HP_STATUSES.UNCONSCIOUS_DEATH_SAVES,
    conditions_to_apply: [CONDITION_IDS.UNCONSCIOUS, CONDITION_IDS.INCAPACITATED, CONDITION_IDS.PRONE],
    death_save_state: { successes: 0, failures: 0, stable: false, dead: false },
    concentration_end_instruction: { instruction_type: 'end_concentration', reason: 'reached_zero_hit_points' },
    mutation_instructions: [{ instruction_type: 'start_death_save_state', participant_id: participantId(participant) }],
    gm_dev_trace: { policy },
  };
}

export function resolveDeathSavingThrow(input = {}) {
  const state = baseDeathSaveState(input.death_save_state ?? input.deathSaveState);
  if (state.dead) {
    return { status: DEATH_SAVE_STATUSES.DEAD, death_save_state: state, player_safe_summary: 'No death save is rolled.' };
  }
  const saveResult = resolveSavingThrow({
    ruleset: input.ruleset ?? DND5E_2014_RULESET,
    ability: 'DEATH',
    difficulty_class: 10,
    modifiers: input.modifiers ?? [],
    advantage_sources: input.advantage_sources ?? input.advantageSources ?? [],
    disadvantage_sources: input.disadvantage_sources ?? input.disadvantageSources ?? [],
    roll_override: input.roll_override ?? input.rollOverride,
    generation_origin: input.generation_origin ?? input.generationOrigin,
    existing_roll_record: input.existing_roll_record ?? input.existingRollRecord,
  });
  const natural = saveResult.roll_record.natural_die_result;
  let next = { ...state };
  let status = DEATH_SAVE_STATUSES.PENDING;
  if (natural === 20) {
    next = { successes: 0, failures: 0, stable: false, dead: false };
    status = DEATH_SAVE_STATUSES.REVIVED;
    return {
      status,
      restored_hit_points: 1,
      death_save_state: next,
      save_result: saveResult,
      player_safe_summary: 'A natural 20 restores 1 hit point.',
    };
  }
  if (natural === 1) {
    next.failures += 2;
  } else if (saveResult.success) {
    next.successes += 1;
  } else {
    next.failures += 1;
  }
  if (next.failures >= 3) {
    next.dead = true;
    status = DEATH_SAVE_STATUSES.DEAD;
  } else if (next.successes >= 3) {
    next.stable = true;
    next.successes = 0;
    next.failures = 0;
    status = DEATH_SAVE_STATUSES.STABLE;
  }
  return {
    status,
    death_save_state: next,
    save_result: saveResult,
    player_safe_summary: status === DEATH_SAVE_STATUSES.STABLE ? 'The participant is stable.' : status === DEATH_SAVE_STATUSES.DEAD ? 'The participant dies.' : 'The death save is recorded.',
  };
}

export function applyDamageAtZeroHitPoints(input = {}) {
  const state = baseDeathSaveState(input.death_save_state ?? input.deathSaveState);
  const damageAmount = Math.max(toInteger(input.damage_amount ?? input.damageAmount), 0);
  if (state.dead) {
    return { status: DEATH_SAVE_STATUSES.DEAD, death_save_state: state, failures_added: 0 };
  }
  if (damageAmount <= 0) {
    return { status: DEATH_SAVE_STATUSES.PENDING, death_save_state: state, failures_added: 0 };
  }
  const maxHitPoints = Math.max(toInteger(input.max_hit_points ?? input.maxHitPoints), 0);
  if (maxHitPoints > 0 && damageAmount >= maxHitPoints) {
    return {
      status: DEATH_SAVE_STATUSES.DEAD,
      death_save_state: { ...state, failures: 3, stable: false, dead: true, natural_recovery_at: null },
      failures_added: 3,
      massive_damage: true,
    };
  }
  const failuresAdded = input.critical_hit || input.criticalHit ? 2 : 1;
  const next = {
    ...state,
    failures: state.failures + failuresAdded,
    stable: false,
    natural_recovery_at: null,
  };
  if (next.failures >= 3) {
    next.dead = true;
  }
  return {
    status: next.dead ? DEATH_SAVE_STATUSES.DEAD : DEATH_SAVE_STATUSES.PENDING,
    death_save_state: next,
    failures_added: failuresAdded,
    stable_removed: state.stable,
  };
}

function rollD4(input = {}) {
  const override = input.roll_override ?? input.rollOverride;
  if (override !== undefined && override !== null) {
    const value = toInteger(override);
    if (value < 1 || value > 4) {
      throw lifecycleError('d4 override must be from 1 to 4.', 'INVALID_D4_OVERRIDE');
    }
    return value;
  }
  return Math.floor((input.random ?? Math.random)() * 4) + 1;
}

export function stabilizeParticipant(input = {}) {
  const participant = input.participant ?? {};
  const recoveryHours = input.natural_recovery_hours ?? input.naturalRecoveryHours ?? rollD4(input);
  const naturalRecoveryAt = cleanText(input.natural_recovery_at ?? input.naturalRecoveryAt) || `in_${recoveryHours}_hours`;
  return {
    status: DEATH_SAVE_STATUSES.STABLE,
    participant_id: participantId(participant),
    conditions_to_apply: [CONDITION_IDS.STABLE],
    conditions_to_keep: [CONDITION_IDS.UNCONSCIOUS, CONDITION_IDS.INCAPACITATED, CONDITION_IDS.PRONE],
    death_save_state: {
      successes: 0,
      failures: 0,
      stable: true,
      dead: false,
      natural_recovery_at: naturalRecoveryAt,
    },
    natural_recovery_hours: recoveryHours,
    player_safe_summary: 'The participant is stable but remains unconscious.',
  };
}

export function advanceStableNaturalRecovery(input = {}) {
  const state = baseDeathSaveState(input.death_save_state ?? input.deathSaveState);
  const now = cleanText(input.authoritative_time ?? input.authoritativeTime);
  if (!state.stable || !state.natural_recovery_at || now !== state.natural_recovery_at) {
    return { status: 'not_due', death_save_state: state };
  }
  return {
    status: DEATH_SAVE_STATUSES.REVIVED,
    restored_hit_points: 1,
    death_save_state: { successes: 0, failures: 0, stable: false, dead: false, natural_recovery_at: null },
  };
}

export function healParticipantFromZero(input = {}) {
  const participant = input.participant ?? {};
  const healingAmount = Math.max(toInteger(input.healing_amount ?? input.healingAmount), 0);
  const state = baseDeathSaveState(input.death_save_state ?? input.deathSaveState);
  if (state.dead) {
    return { status: DEATH_SAVE_STATUSES.DEAD, participant, death_save_state: state, player_safe_summary: 'Ordinary healing cannot revive the dead.' };
  }
  if (healingAmount <= 0) {
    return { status: 'no_healing', participant, death_save_state: state };
  }
  const afterHp = Math.min(Math.max(toInteger(participant.current_hit_points ?? participant.currentHp ?? participant.current_hp, 0), 0) + healingAmount, Math.max(toInteger(participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp ?? participant.maxHp), healingAmount));
  return {
    status: DEATH_SAVE_STATUSES.REVIVED,
    participant: {
      ...participant,
      current_hit_points: afterHp,
    },
    conditions_to_remove: [CONDITION_IDS.UNCONSCIOUS, CONDITION_IDS.INCAPACITATED, CONDITION_IDS.STABLE],
    conditions_to_keep: [CONDITION_IDS.PRONE],
    death_save_state: { successes: 0, failures: 0, stable: false, dead: false, natural_recovery_at: null },
    player_safe_summary: 'Healing restores consciousness, but Prone remains until the participant stands.',
  };
}

export function applyNonlethalDefeat(input = {}) {
  const declaredBeforeDamage = Boolean(input.declared_before_damage ?? input.declaredBeforeDamage);
  const attackKind = normalizedKey(input.attack_kind ?? input.attackKind);
  const authoredException = Boolean(input.authored_exception ?? input.authoredException);
  const targetValid = input.target_valid ?? input.targetValid ?? true;
  if (!targetValid) {
    return { status: 'rejected', reason: 'invalid_target' };
  }
  if (!declaredBeforeDamage) {
    return { status: 'rejected', reason: 'intent_not_declared_before_damage' };
  }
  if (attackKind !== 'melee_weapon_attack' && !authoredException) {
    return { status: 'rejected', reason: 'not_eligible_for_default_nonlethal' };
  }
  return {
    status: ZERO_HP_STATUSES.UNCONSCIOUS_STABLE,
    conditions_to_apply: [CONDITION_IDS.UNCONSCIOUS, CONDITION_IDS.INCAPACITATED, CONDITION_IDS.PRONE, CONDITION_IDS.STABLE],
    death_save_state: { successes: 0, failures: 0, stable: true, dead: false },
    concentration_end_instruction: { instruction_type: 'end_concentration', reason: 'nonlethal_defeat' },
    player_safe_summary: 'The target falls unconscious and stable.',
  };
}

export function evaluateCombatEndPersistence(input = {}) {
  const conditions = asArray(input.conditions).map((condition) => createConditionInstance(condition));
  const persisted = [];
  const expired = [];
  for (const condition of conditions) {
    if (condition.persistence_policy === CONDITION_PERSISTENCE_POLICIES.COMBAT_SCOPED) {
      expired.push({ ...condition, active: false, expired: true, expiration_reason: CONDITION_LIFECYCLE_EVENTS.COMBAT_ENDED });
    } else {
      const duration = { ...condition.duration };
      if (duration.remaining_rounds !== null && duration.remaining_rounds !== undefined) {
        duration.remaining_seconds = toInteger(duration.remaining_rounds) * 6;
      }
      persisted.push({ ...condition, duration });
    }
  }
  const concentration = evaluateConcentrationCarryForward({ concentration: input.concentration });
  return {
    persisted_conditions: persisted,
    expired_conditions: expired,
    concentration,
    player_safe_summary: 'Combat-end condition persistence has been evaluated.',
  };
}

export function projectConditionForPlayer(condition = {}) {
  const instance = createConditionInstance(condition);
  const definition = getConditionDefinition(instance.condition_type, { ruleset: instance.ruleset });
  const projected = {
    condition_instance_id: instance.condition_instance_id,
    condition_type: instance.condition_type,
    name: definition.player_name,
    support_status: definition.support_status,
    active: instance.active,
    player_text: instance.player_text,
    duration: {
      duration_type: instance.duration.duration_type,
      duration_value: instance.duration.duration_value,
      duration_unit: instance.duration.duration_unit,
    },
  };
  assertNoCombatStatePlayerHiddenData(projected);
  return projected;
}

export function projectParticipantStateForPlayer(input = {}) {
  const participant = input.participant ?? {};
  const viewerOwnsParticipant = Boolean(input.viewer_owns_participant ?? input.viewerOwnsParticipant);
  const conditions = asArray(input.conditions).map(projectConditionForPlayer);
  const projected = {
    participant_id: participantId(participant),
    display_name: participant.display_name ?? participant.name ?? null,
    conditions,
    current_hit_points: viewerOwnsParticipant ? participant.current_hit_points ?? participant.currentHp ?? participant.current_hp ?? null : undefined,
    death_save_state: viewerOwnsParticipant ? cloneSerializable(input.death_save_state ?? input.deathSaveState ?? null) : undefined,
    zero_hit_point_status: input.zero_hit_point_status ?? input.zeroHitPointStatus ?? null,
  };
  assertNoCombatStatePlayerHiddenData(projected);
  return projected;
}

export function buildConditionGmDevTrace(input = {}) {
  return {
    trace_kind: 'condition_concentration_zero_hp_lifecycle',
    conditions: cloneSerializable(input.conditions ?? []),
    concentration: cloneSerializable(input.concentration ?? null),
    death_save_state: cloneSerializable(input.death_save_state ?? input.deathSaveState ?? null),
    zero_hp_policy: input.zero_hp_policy ?? input.zeroHpPolicy ?? null,
    decisions: cloneSerializable(input.decisions ?? []),
  };
}

export function assertNoCombatStatePlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const key of PLAYER_PROHIBITED_KEYS) {
    if (serialized.includes(key)) {
      throw lifecycleError(`Player combat state payload contains prohibited key "${key}".`, 'COMBAT_STATE_PLAYER_VISIBILITY_LEAK');
    }
  }
  return true;
}

