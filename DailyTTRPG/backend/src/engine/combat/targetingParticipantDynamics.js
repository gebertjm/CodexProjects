import {
  COMBAT_EFFECT_TYPES,
  createCombatActionDefinition,
} from './actionEffectResourceFramework.js';
import {
  CONDITION_LIFECYCLE_EVENTS,
  evaluateZeroHitPointTransition,
  processConcentrationDamage,
} from './conditionStateLifecycle.js';
import {
  DND5E_2014_RULESET,
  ROLL_CATEGORIES,
  ROLL_GENERATION_ORIGINS,
  SAVE_SUCCESS_POLICIES,
  applyDamageToHitPoints,
  applySavingThrowSuccessPolicy,
  generateD20Roll,
  resolveAttackRoll,
  resolveDamage,
  resolveRulesetIdentity,
  resolveSavingThrow,
} from './rulesResolution.js';
import {
  validatePlacement,
} from './spatialMovement.js';
import {
  buildTacticalContext,
} from './automaticTurnRuntime.js';
import {
  COMBAT_NEXT_BEAT_DECISION_KINDS,
  COMBAT_RESOLUTION_STATUSES,
  createCombatNextBeatDecision,
  createCombatRulesetIdentity,
} from '../../services/interactionCore/combatAdapterContract.js';

export const TARGET_INCLUSION_POLICIES = Object.freeze({
  ENEMIES_ONLY: 'enemies_only',
  ALLIES_ONLY: 'allies_only',
  SELF_ONLY: 'self_only',
  SELF_AND_ALLIES: 'self_and_allies',
  ALL_CREATURES_IN_TARGET_GROUP: 'all_creatures_in_target_group',
  SELECTED_CREATURES_UP_TO_LIMIT: 'selected_creatures_up_to_limit',
  ALL_CREATURES_EXCEPT_ACTOR: 'all_creatures_except_actor',
  AUTHORED_FACTION_OR_FILTER_RULE: 'authored_faction_or_filter_rule',
});

export const TARGET_SELECTION_MODES = Object.freeze({
  NONE: 'none',
  AUTO_RESOLVED: 'auto_resolved',
  SELECTED_PARTICIPANTS: 'selected_participants',
  ABSTRACT_TARGET_GROUP: 'abstract_target_group',
});

export const HIDDEN_PARTICIPANT_POLICIES = Object.freeze({
  EXCLUDE: 'exclude_hidden',
  INCLUDE_AUTHORITATIVE: 'include_authoritative_when_group_matches',
});

export const ALLY_CONFIRMATION_POLICIES = Object.freeze({
  NEVER: 'never',
  VISIBLE_ALLY_OR_NON_HOSTILE: 'visible_ally_or_non_hostile',
  ANY_VISIBLE_NON_HOSTILE: 'any_visible_non_hostile',
});

export const ATTACK_ROLL_POLICIES = Object.freeze({
  SEPARATE_PER_TARGET: 'separate_per_target',
  SHARED_AUTHORED_ROLL: 'shared_authored_roll',
});

export const SAVE_ROLL_POLICIES = Object.freeze({
  SEPARATE_PER_TARGET: 'separate_per_target',
});

export const DAMAGE_ROLL_POLICIES = Object.freeze({
  SEPARATE_PER_TARGET: 'separate_per_target',
  SHARED_FOR_TARGET_SET: 'shared_for_target_set',
});

export const TARGET_SET_LOCK_POLICIES = Object.freeze({
  LOCK_AT_COMMIT: 'lock_at_commit',
  DYNAMIC_AUTHORED_REVALIDATE_EACH_TARGET: 'dynamic_authored_revalidate_each_target',
});

export const PARTICIPANT_EVENT_TYPES = Object.freeze({
  ENTRY: 'participant_entry',
  EXIT: 'participant_exit',
  RE_ENTRY: 'participant_re_entry',
  FACTION_CHANGE: 'faction_change',
});

export const ENCOUNTER_COMPLETION_KINDS = Object.freeze({
  ACTIVE: 'active',
  ENCOUNTER_RESOLUTION_REQUIRED: 'encounter_resolution_required',
  UNAVAILABLE: 'unavailable',
  RECOVERY_NEEDED: 'recovery_needed',
});

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'armor_class',
  'target_armor_class',
  'difficulty_class',
  'hidden',
  'hidden_participant',
  'hidden_target',
  'raw_roll',
  'roll_record',
  'roll_override',
  'roll_overrides',
  'mutation_plan',
  'mutation_instructions',
  'idempotency_key',
  'source_state_version',
  'current_state_version',
  'action_window_id',
  'target_filter',
  'authored_filter',
  'gm_dev',
  'trace',
  'control_mode',
  'test_override',
  'secret',
  'exact_hit_points',
]);

const POLICY_VALUES = Object.freeze(Object.values(TARGET_INCLUSION_POLICIES));

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(String(value ?? '')).toLowerCase();
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function participantId(input = {}) {
  if (!input || typeof input !== 'object') {
    return cleanText(input);
  }
  return cleanText(input.participant_id ?? input.participantId ?? input.id);
}

function factionId(input = {}) {
  return cleanText(input.faction_id ?? input.factionId ?? input.faction);
}

function actionId(input = {}) {
  return cleanText(input.action_id ?? input.actionId ?? input.id);
}

function isActiveParticipant(participant = {}) {
  return participant.active !== false &&
    participant.removed !== true &&
    participant.exited !== true &&
    participant.defeated !== true &&
    participant.inactive !== true;
}

function stateParticipants(state = {}) {
  return asArray(state.participants).map((participant) => cloneSerializable(participant));
}

function findParticipant(state = {}, id) {
  return stateParticipants(state).find((participant) => participantId(participant) === cleanText(id)) ?? null;
}

function actorFor(state = {}, actorId = null) {
  return findParticipant(state, actorId ?? state.parent_turn?.actor_participant_id ?? state.current_participant_id ?? state.actor_participant_id);
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function normalizeRuleset(input = DND5E_2014_RULESET) {
  const ruleset = createCombatRulesetIdentity(input);
  if (ruleset.system !== DND5E_2014_RULESET.system || ruleset.rules_version !== DND5E_2014_RULESET.rules_version) {
    const error = new Error(`Unsupported combat ruleset ${ruleset.system}/${ruleset.rules_version}.`);
    error.code = 'UNSUPPORTED_STAGE_6D10_RULESET';
    throw error;
  }
  return ruleset;
}

function normalizeState(input = {}) {
  const state = cloneSerializable(input);
  state.combat = state.combat ?? {};
  state.combat.combat_id = cleanText(state.combat.combat_id ?? state.combat.id ?? state.combatId ?? state.combat_id) || 'combat:test';
  state.combat.ruleset = normalizeRuleset(state.combat.ruleset ?? state.ruleset ?? DND5E_2014_RULESET);
  state.combat.round_number = toInteger(state.combat.round_number ?? state.round_number, 1);
  state.combat.initiative_position = toInteger(state.combat.initiative_position ?? state.initiative_position, 1);
  state.participants = stateParticipants(state);
  state.faction_relationships = asArray(state.faction_relationships ?? state.factionRelationships);
  state.spatial = state.spatial ?? {};
  state.spatial.participants = asArray(state.spatial.participants);
  state.spatial.zones = asArray(state.spatial.zones);
  state.spatial.transitions = asArray(state.spatial.transitions);
  state.participant_event_records = state.participant_event_records ?? {};
  state.multi_target_resolutions = state.multi_target_resolutions ?? {};
  state.faction_revision = cleanText(state.faction_revision ?? state.factionRevision) || 'factions-v1';
  state.participant_revision = cleanText(state.participant_revision ?? state.participantRevision) || 'participants-v1';
  return state;
}

function nextRevision(current) {
  const match = cleanText(current).match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${cleanText(current) || 'revision-v'}1`;
  }
  return `${match[1]}${Number(match[2]) + 1}`;
}

function relationFor(state = {}, actor = {}, target = {}) {
  const actorFaction = factionId(actor);
  const targetFaction = factionId(target);
  if (!actorFaction || !targetFaction) {
    return 'neutral';
  }
  if (actorFaction === targetFaction) {
    return 'ally';
  }
  const direct = asArray(state.faction_relationships).find((entry) =>
    cleanText(entry.faction_a ?? entry.factionA) === actorFaction &&
    cleanText(entry.faction_b ?? entry.factionB) === targetFaction
  );
  const reverse = asArray(state.faction_relationships).find((entry) =>
    cleanText(entry.faction_a ?? entry.factionA) === targetFaction &&
    cleanText(entry.faction_b ?? entry.factionB) === actorFaction
  );
  const value = normalizedKey(direct?.relationship ?? reverse?.relationship ?? direct?.status ?? reverse?.status);
  if (['hostile', 'enemy', 'enemies'].includes(value)) {
    return 'hostile';
  }
  if (['ally', 'allied', 'friendly'].includes(value)) {
    return 'ally';
  }
  return 'neutral';
}

function spatialForParticipant(state = {}, participant = {}) {
  const id = participantId(participant);
  return asArray(state.spatial?.participants).find((entry) => participantId(entry) === id) ?? participant;
}

function participantZone(state = {}, participant = {}) {
  const spatial = spatialForParticipant(state, participant);
  return cleanText(spatial.current_zone_id ?? spatial.zone_id ?? participant.current_zone_id ?? participant.zone_id);
}

function participantGroups(participant = {}) {
  return new Set(asArray(participant.target_group_ids ?? participant.targetGroupIds ?? participant.target_groups ?? participant.targetGroups));
}

function targetGroupMatches(state = {}, participant = {}, group = {}) {
  const source = group && typeof group === 'object' ? group : {};
  const type = cleanText(source.group_type ?? source.groupType ?? source.type);
  const groupId = cleanText(source.target_group_id ?? source.targetGroupId ?? source.group_id ?? source.groupId);
  if (!type && !groupId && !source.zone_id && !source.participant_ids) {
    return true;
  }
  if (type === 'zone' || source.zone_id) {
    return participantZone(state, participant) === cleanText(source.zone_id ?? source.zoneId);
  }
  if (type === 'participant_ids' || source.participant_ids) {
    return asArray(source.participant_ids ?? source.participantIds).map(cleanText).includes(participantId(participant));
  }
  if (type === 'target_group' || groupId) {
    return participantGroups(participant).has(groupId);
  }
  if (type === 'all_engaged') {
    return asArray(participant.relationships).some((entry) => cleanText(entry.proximity) === 'engaged');
  }
  return false;
}

function isVisibleToActor(state = {}, actor = {}, participant = {}) {
  if (participantId(actor) === participantId(participant)) {
    return true;
  }
  if (participant.hidden === true || participant.can_be_perceived === false || participant.visible === false) {
    return false;
  }
  const visibleTo = asArray(participant.visible_to_actor_ids ?? participant.visibleToActorIds ?? participant.visible_to);
  if (visibleTo.length > 0 && !visibleTo.map(cleanText).includes(participantId(actor))) {
    return false;
  }
  const spatial = spatialForParticipant(state, participant);
  if (spatial.visibility?.hidden === true || spatial.visibility?.can_be_perceived === false) {
    return false;
  }
  return true;
}

function healthBand(participant = {}) {
  if (participant.defeated === true || toInteger(participant.current_hit_points ?? participant.currentHitPoints ?? participant.current_hp, 0) <= 0) {
    return 'defeated';
  }
  const current = toInteger(participant.current_hit_points ?? participant.currentHitPoints ?? participant.current_hp, 0);
  const max = Math.max(toInteger(participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp, current), 1);
  const ratio = current / max;
  if (ratio <= 0.25) {
    return 'bloodied';
  }
  if (ratio <= 0.5) {
    return 'wounded';
  }
  return 'standing';
}

function visibleParticipantRef(state = {}, actor = {}, participant = {}) {
  const isActor = participantId(actor) === participantId(participant);
  return {
    participant_id: participantId(participant),
    display_name: participant.display_name ?? participant.name ?? participantId(participant),
    faction: participant.faction ?? null,
    relation: relationFor(state, actor, participant),
    is_actor: isActor,
    health_band: isActor ? null : healthBand(participant),
    current_zone_id: participantZone(state, participant) || null,
  };
}

function participantExactTrace(participant = {}) {
  return {
    participant_id: participantId(participant),
    display_name: participant.display_name ?? participant.name ?? participantId(participant),
    faction: participant.faction ?? null,
    hidden: participant.hidden === true || participant.can_be_perceived === false,
    current_hit_points: participant.current_hit_points ?? participant.currentHitPoints ?? participant.current_hp ?? null,
    max_hit_points: participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp ?? null,
    temporary_hit_points: participant.temporary_hit_points ?? participant.temporaryHitPoints ?? participant.temporary_hp ?? 0,
    armor_class: participant.armor_class ?? participant.ac ?? null,
    defense_profile: cloneSerializable(participant.defense_profile ?? participant.defenseProfile ?? {}),
    control_mode: participant.control_mode ?? null,
  };
}

function normalizeSelectionMode(policyId) {
  if ([TARGET_INCLUSION_POLICIES.SELF_ONLY, TARGET_INCLUSION_POLICIES.SELF_AND_ALLIES, TARGET_INCLUSION_POLICIES.ALL_CREATURES_EXCEPT_ACTOR].includes(policyId)) {
    return TARGET_SELECTION_MODES.AUTO_RESOLVED;
  }
  if (policyId === TARGET_INCLUSION_POLICIES.ALL_CREATURES_IN_TARGET_GROUP) {
    return TARGET_SELECTION_MODES.ABSTRACT_TARGET_GROUP;
  }
  return TARGET_SELECTION_MODES.SELECTED_PARTICIPANTS;
}

export function createTargetInclusionPolicy(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const policyId = cleanText(source.policy_id ?? source.policyId ?? source.target_inclusion_policy ?? source.targetInclusionPolicy ?? source.id);
  if (!POLICY_VALUES.includes(policyId)) {
    throw new Error(`Combat action requires an explicit supported target-inclusion policy; received "${policyId || 'missing'}".`);
  }
  const ruleset = normalizeRuleset(source.ruleset ?? DND5E_2014_RULESET);
  const minTargets = Math.max(toInteger(source.min_targets ?? source.minTargets, policyId === TARGET_INCLUSION_POLICIES.SELF_ONLY ? 1 : 0), 0);
  const maxDefault = policyId === TARGET_INCLUSION_POLICIES.SELF_ONLY ? 1 : policyId === TARGET_INCLUSION_POLICIES.SELECTED_CREATURES_UP_TO_LIMIT ? 1 : Number.MAX_SAFE_INTEGER;
  const maxTargets = Math.max(toInteger(source.max_targets ?? source.maxTargets, maxDefault), minTargets);

  return {
    contract_version: '6D.10',
    policy_id: policyId,
    ruleset,
    action_id: cleanText(source.action_id ?? source.actionId) || null,
    selection_mode: cleanText(source.selection_mode ?? source.selectionMode) || normalizeSelectionMode(policyId),
    min_targets: minTargets,
    max_targets: maxTargets,
    allow_fewer_than_max: source.allow_fewer_than_max ?? source.allowFewerThanMax ?? true,
    actor_inclusion: source.actor_inclusion ?? source.actorInclusion ?? (
      [TARGET_INCLUSION_POLICIES.SELF_ONLY, TARGET_INCLUSION_POLICIES.SELF_AND_ALLIES].includes(policyId)
        ? 'required'
        : policyId === TARGET_INCLUSION_POLICIES.ALL_CREATURES_EXCEPT_ACTOR
          ? 'excluded'
          : 'authored'
    ),
    faction_requirements: asArray(source.faction_requirements ?? source.factionRequirements),
    hostility_requirements: asArray(source.hostility_requirements ?? source.hostilityRequirements),
    target_group: cloneSerializable(source.target_group ?? source.targetGroup ?? null),
    zone_requirements: asArray(source.zone_requirements ?? source.zoneRequirements),
    visibility_required: source.visibility_required ?? source.visibilityRequired ?? (
      policyId === TARGET_INCLUSION_POLICIES.SELECTED_CREATURES_UP_TO_LIMIT ||
      policyId === TARGET_INCLUSION_POLICIES.ENEMIES_ONLY ||
      policyId === TARGET_INCLUSION_POLICIES.ALLIES_ONLY
    ),
    duplicate_target_policy: cleanText(source.duplicate_target_policy ?? source.duplicateTargetPolicy) || 'unique',
    hidden_participant_policy: cleanText(source.hidden_participant_policy ?? source.hiddenParticipantPolicy) || HIDDEN_PARTICIPANT_POLICIES.EXCLUDE,
    ally_confirmation_policy: cleanText(source.ally_confirmation_policy ?? source.allyConfirmationPolicy) || ALLY_CONFIRMATION_POLICIES.VISIBLE_ALLY_OR_NON_HOSTILE,
    target_set_lock_policy: cleanText(source.target_set_lock_policy ?? source.targetSetLockPolicy) || TARGET_SET_LOCK_POLICIES.LOCK_AT_COMMIT,
    authored_filter: cloneSerializable(source.authored_filter ?? source.authoredFilter ?? {}),
    player_safe_description: cleanText(source.player_safe_description ?? source.playerSafeDescription) || 'Choose legal targets for this combat option.',
    gm_dev_provenance: cloneSerializable(source.gm_dev_provenance ?? source.gmDevProvenance ?? {}),
  };
}

export function validateActionTargetInclusionPolicy(actionInput = {}) {
  const raw = actionInput && typeof actionInput === 'object' ? actionInput : {};
  const policySource = raw.target_inclusion_policy ?? raw.targetInclusionPolicy;
  if (!policySource) {
    throw new Error(`Combat action "${actionId(raw) || 'unknown'}" must define target_inclusion_policy for Stage 6D.10.`);
  }
  return createTargetInclusionPolicy({
    ...policySource,
    action_id: policySource.action_id ?? policySource.actionId ?? actionId(raw),
    ruleset: policySource.ruleset ?? raw.ruleset ?? DND5E_2014_RULESET,
  });
}

function normalizeActionWithPolicy(actionInput = {}) {
  const action = createCombatActionDefinition(actionInput);
  const targetPolicy = validateActionTargetInclusionPolicy(actionInput);
  return { action, target_policy: targetPolicy };
}

function policyAllowsParticipant(state, actor, participant, policy) {
  const actorId = participantId(actor);
  const targetId = participantId(participant);
  const relation = relationFor(state, actor, participant);
  const isActor = actorId === targetId;
  if (!isActiveParticipant(participant) && isActor === false) {
    return { included: false, reason: 'participant_inactive' };
  }
  if (policy.actor_inclusion === 'excluded' && isActor) {
    return { included: false, reason: 'actor_excluded' };
  }
  if (policy.actor_inclusion === 'required' && !isActor && policy.policy_id === TARGET_INCLUSION_POLICIES.SELF_ONLY) {
    return { included: false, reason: 'self_only' };
  }
  if (policy.target_group && !targetGroupMatches(state, participant, policy.target_group)) {
    return { included: false, reason: 'target_group_mismatch' };
  }
  if (policy.visibility_required && !isVisibleToActor(state, actor, participant)) {
    return { included: false, reason: 'visibility_required' };
  }
  if (asArray(policy.zone_requirements).length > 0 && !asArray(policy.zone_requirements).map(cleanText).includes(participantZone(state, participant))) {
    return { included: false, reason: 'zone_mismatch' };
  }
  if (policy.policy_id === TARGET_INCLUSION_POLICIES.ENEMIES_ONLY && relation !== 'hostile') {
    return { included: false, reason: 'not_hostile' };
  }
  if (policy.policy_id === TARGET_INCLUSION_POLICIES.ALLIES_ONLY && relation !== 'ally') {
    return { included: false, reason: 'not_ally' };
  }
  if (policy.policy_id === TARGET_INCLUSION_POLICIES.SELF_ONLY && !isActor) {
    return { included: false, reason: 'not_actor' };
  }
  if (policy.policy_id === TARGET_INCLUSION_POLICIES.SELF_AND_ALLIES && !isActor && relation !== 'ally') {
    return { included: false, reason: 'not_self_or_ally' };
  }
  if (policy.policy_id === TARGET_INCLUSION_POLICIES.ALL_CREATURES_EXCEPT_ACTOR && isActor) {
    return { included: false, reason: 'actor_excluded' };
  }
  if (policy.policy_id === TARGET_INCLUSION_POLICIES.AUTHORED_FACTION_OR_FILTER_RULE) {
    // Authored filters are handled below for every policy; the dedicated policy
    // exists for actions whose entire target definition is declarative.
  }
  const allowedFactions = asArray(policy.authored_filter.factions ?? policy.authored_filter.allowed_factions).map(cleanText);
  if (allowedFactions.length > 0 && !allowedFactions.includes(factionId(participant))) {
    return { included: false, reason: 'faction_filter_mismatch' };
  }
  const allowedRelations = asArray(policy.authored_filter.relationships ?? policy.authored_filter.relations).map(cleanText);
  if (allowedRelations.length > 0 && !allowedRelations.includes(relation)) {
    return { included: false, reason: 'relationship_filter_mismatch' };
  }
  return { included: true, relation, is_visible: isVisibleToActor(state, actor, participant) };
}

export function buildAuthoritativeTargetCandidates(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state, input.actor_id ?? input.actorId);
  if (!actor) {
    throw new Error('Authoritative target candidates require an actor.');
  }
  const policy = input.policy?.policy_id ? createTargetInclusionPolicy(input.policy) : validateActionTargetInclusionPolicy(input.action ?? {});
  const candidates = [];
  const rejected = [];
  for (const participant of stateParticipants(state)) {
    const hidden = !isVisibleToActor(state, actor, participant);
    if (hidden && policy.hidden_participant_policy !== HIDDEN_PARTICIPANT_POLICIES.INCLUDE_AUTHORITATIVE && participantId(participant) !== participantId(actor)) {
      rejected.push({ participant_id: participantId(participant), reason: 'concealed_from_authoritative_policy' });
      continue;
    }
    const allowed = policyAllowsParticipant(state, actor, participant, policy);
    if (allowed.included) {
      candidates.push({
        participant,
        participant_id: participantId(participant),
        relation: allowed.relation,
        is_actor: allowed.isActor,
        is_visible_to_actor: allowed.is_visible,
      });
    } else {
      rejected.push({ participant_id: participantId(participant), reason: allowed.reason });
    }
  }
  return {
    contract_version: '6D.10',
    status: 'built',
    policy,
    actor_id: participantId(actor),
    candidates,
    target_ids: candidates.map((entry) => entry.participant_id),
    gm_dev_trace: {
      rejected,
      authoritative_candidate_ids: candidates.map((entry) => entry.participant_id),
      concealed_candidate_ids: candidates.filter((entry) => !entry.is_visible_to_actor).map((entry) => entry.participant_id),
    },
  };
}

export function buildPlayerVisibleTargetCandidates(input = {}) {
  const authoritative = input.authoritative_target_set?.candidates
    ? input.authoritative_target_set
    : buildAuthoritativeTargetCandidates(input);
  const state = normalizeState(input.state ?? input.authoritative_target_set?.state ?? input);
  const actor = input.actor ?? actorFor(state, authoritative.actor_id);
  const visible = authoritative.candidates
    .filter((entry) => entry.is_visible_to_actor)
    .map((entry) => visibleParticipantRef(state, actor, entry.participant));
  const result = {
    contract_version: '6D.10',
    status: 'built',
    policy_id: authoritative.policy.policy_id,
    player_safe_description: authoritative.policy.player_safe_description,
    visible_candidates: visible,
    visible_target_count: visible.length,
    selection: {
      min_targets: authoritative.policy.min_targets,
      max_targets: authoritative.policy.max_targets === Number.MAX_SAFE_INTEGER ? null : authoritative.policy.max_targets,
      allow_fewer_than_max: authoritative.policy.allow_fewer_than_max,
    },
  };
  assertNoMultiTargetPlayerHiddenData(result);
  return result;
}

export function validateSelectedTargets(input = {}) {
  const authoritative = input.authoritative_target_set?.candidates
    ? input.authoritative_target_set
    : buildAuthoritativeTargetCandidates(input);
  const selectedIds = asArray(input.selected_target_ids ?? input.selectedTargetIds).map(cleanText).filter(Boolean);
  const candidateIds = new Set(authoritative.target_ids);
  const policy = authoritative.policy;
  const autoIds = policy.selection_mode === TARGET_SELECTION_MODES.SELECTED_PARTICIPANTS
    ? selectedIds
    : authoritative.target_ids;
  const uniqueIds = [...new Set(autoIds)];
  if (policy.duplicate_target_policy !== 'allow_duplicates' && uniqueIds.length !== autoIds.length) {
    return { valid: false, reason: 'duplicate_targets_not_allowed', selected_target_ids: uniqueIds };
  }
  if (uniqueIds.length < policy.min_targets) {
    return { valid: false, reason: 'too_few_targets', selected_target_ids: uniqueIds };
  }
  if (uniqueIds.length > policy.max_targets) {
    return { valid: false, reason: 'too_many_targets', selected_target_ids: uniqueIds };
  }
  const invalid = uniqueIds.filter((id) => !candidateIds.has(id));
  if (invalid.length > 0) {
    return { valid: false, reason: 'target_not_legal', invalid_target_ids: invalid, selected_target_ids: uniqueIds };
  }
  return {
    valid: true,
    selected_target_ids: uniqueIds,
    selected_targets: uniqueIds.map((id) => authoritative.candidates.find((entry) => entry.participant_id === id).participant),
  };
}

export function createTargetSetLock(input = {}) {
  const authoritative = input.authoritative_target_set?.candidates
    ? input.authoritative_target_set
    : buildAuthoritativeTargetCandidates(input);
  const selected = input.selected_target_ids || input.selectedTargetIds
    ? validateSelectedTargets({ authoritative_target_set: authoritative, selected_target_ids: input.selected_target_ids ?? input.selectedTargetIds })
    : { valid: true, selected_target_ids: authoritative.target_ids };
  if (!selected.valid) {
    return { status: 'invalid', ...selected };
  }
  return {
    contract_version: '6D.10',
    target_set_lock_id: cleanText(input.target_set_lock_id ?? input.targetSetLockId) || stableId(['target-lock', authoritative.actor_id, authoritative.policy.action_id ?? authoritative.policy.policy_id, selected.selected_target_ids.join('-')]),
    policy_id: authoritative.policy.policy_id,
    target_set_lock_policy: authoritative.policy.target_set_lock_policy,
    selected_target_ids: selected.selected_target_ids,
    source_state_version: cleanText(input.source_state_version ?? input.sourceStateVersion) || null,
    participant_revision: cleanText(input.participant_revision ?? input.participantRevision) || null,
    faction_revision: cleanText(input.faction_revision ?? input.factionRevision) || null,
    locked_at: cleanText(input.locked_at ?? input.lockedAt) || null,
  };
}

export function validateTargetSetLock(input = {}) {
  const lock = input.target_set_lock ?? input.targetSetLock;
  if (!lock) {
    return { valid: false, reason: 'target_set_lock_missing' };
  }
  const state = normalizeState(input.state ?? input);
  if (lock.target_set_lock_policy === TARGET_SET_LOCK_POLICIES.DYNAMIC_AUTHORED_REVALIDATE_EACH_TARGET) {
    return { valid: true, reason: 'dynamic_revalidation_enabled' };
  }
  if (lock.participant_revision && lock.participant_revision !== state.participant_revision) {
    return { valid: false, reason: 'participant_state_changed' };
  }
  if (lock.faction_revision && lock.faction_revision !== state.faction_revision) {
    return { valid: false, reason: 'faction_state_changed' };
  }
  return { valid: true, reason: 'target_set_lock_valid' };
}

export function evaluateAllyInclusionConfirmation(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state, input.actor_id ?? input.actorId);
  const policy = input.policy?.policy_id ? createTargetInclusionPolicy(input.policy) : validateActionTargetInclusionPolicy(input.action ?? {});
  const targets = asArray(input.targets).length > 0
    ? asArray(input.targets)
    : asArray(input.selected_target_ids ?? input.selectedTargetIds).map((id) => findParticipant(state, id)).filter(Boolean);
  if (policy.ally_confirmation_policy === ALLY_CONFIRMATION_POLICIES.NEVER) {
    return { required: false, visible_included: [] };
  }
  const visibleIncluded = targets
    .filter((target) => participantId(target) !== participantId(actor))
    .filter((target) => isVisibleToActor(state, actor, target))
    .filter((target) => {
      const relation = relationFor(state, actor, target);
      return policy.ally_confirmation_policy === ALLY_CONFIRMATION_POLICIES.ANY_VISIBLE_NON_HOSTILE
        ? relation !== 'hostile'
        : ['ally', 'neutral'].includes(relation);
    })
    .map((target) => visibleParticipantRef(state, actor, target));
  return {
    required: visibleIncluded.length > 0,
    visible_included: visibleIncluded,
    confirmation_key: visibleIncluded.length > 0
      ? stableId(['ally-confirm', policy.action_id ?? policy.policy_id, visibleIncluded.map((entry) => entry.participant_id).join('-')])
      : null,
    player_safe_message: visibleIncluded.length > 0 ? 'This option includes someone who is not hostile. Confirm before committing.' : null,
  };
}

export function buildTargetPreview(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state, input.actor_id ?? input.actorId);
  const action = input.action ?? {};
  const { action: normalizedAction, target_policy: policy } = normalizeActionWithPolicy(action);
  const authoritative = buildAuthoritativeTargetCandidates({ state, actor, policy });
  const visible = buildPlayerVisibleTargetCandidates({ state, actor, authoritative_target_set: authoritative });
  const selected = validateSelectedTargets({ authoritative_target_set: authoritative, selected_target_ids: input.selected_target_ids ?? input.selectedTargetIds });
  const selectedTargets = selected.valid ? selected.selected_targets : [];
  const confirmation = evaluateAllyInclusionConfirmation({ state, actor, policy, targets: selectedTargets });
  const preview = {
    contract_version: '6D.10',
    operation_type: 'combat_target_preview',
    mutates_state: false,
    rolls_generated: false,
    action_id: normalizedAction.action_id,
    action_label: normalizedAction.player_label,
    target_policy: {
      policy_id: policy.policy_id,
      player_safe_description: policy.player_safe_description,
      min_targets: policy.min_targets,
      max_targets: policy.max_targets === Number.MAX_SAFE_INTEGER ? null : policy.max_targets,
    },
    visible_target_group: visible.visible_candidates,
    selected_target_ids: selected.valid
      ? selected.selected_target_ids.filter((id) => visible.visible_candidates.some((entry) => entry.participant_id === id))
      : [],
    visible_ally_confirmation: confirmation.required ? {
      required: true,
      included: confirmation.visible_included,
      player_safe_message: confirmation.player_safe_message,
    } : { required: false },
    roll_policy: {
      attack: cleanText(input.attack_roll_policy ?? input.attackRollPolicy) || ATTACK_ROLL_POLICIES.SEPARATE_PER_TARGET,
      save: SAVE_ROLL_POLICIES.SEPARATE_PER_TARGET,
      damage: cleanText(input.damage_roll_policy ?? input.damageRollPolicy) || inferDamageRollPolicy(normalizedAction),
    },
    current_legality: selected.valid ? 'available' : 'unavailable',
    safe_unavailable_reason: selected.valid ? null : 'Choose legal targets for this option.',
    preview_identity: cleanText(input.preview_identity ?? input.previewIdentity) || stableId(['preview', normalizedAction.action_id, policy.policy_id]),
  };
  assertNoMultiTargetPlayerHiddenData(preview);
  return preview;
}

function inferDamageRollPolicy(action = {}) {
  if (action.authored_metadata?.damage_roll_policy) {
    return cleanText(action.authored_metadata.damage_roll_policy);
  }
  const hasSave = action.effect_steps?.some((step) => step.effect_type === COMBAT_EFFECT_TYPES.SAVING_THROW);
  return hasSave ? DAMAGE_ROLL_POLICIES.SHARED_FOR_TARGET_SET : DAMAGE_ROLL_POLICIES.SEPARATE_PER_TARGET;
}

function stepByType(action, type) {
  return asArray(action.effect_steps).find((step) => step.effect_type === type) ?? null;
}

function stepsByType(action, type) {
  return asArray(action.effect_steps).filter((step) => step.effect_type === type);
}

function overrideFor(input = {}, stepId, targetId, targetIndex) {
  const overrides = input.roll_overrides ?? input.rollOverrides ?? {};
  return overrides?.[targetId]?.[stepId] ??
    overrides?.[stepId]?.[targetId] ??
    overrides?.[stepId]?.[targetIndex] ??
    overrides?.[stepId] ??
    null;
}

function damageComponentsFor(step = {}) {
  return asArray(step.params?.components ?? step.components);
}

function damageOverridesFromResult(damage = {}) {
  return asArray(damage.components).map((component) => component.dice_rolls ?? []);
}

function applyTargetDamage({ state, target, damageAmount, damageResult, saveAdjustment, concentrationOverride, generationOrigin }) {
  const hp = applyDamageToHitPoints({
    damage_total: damageAmount,
    current_hit_points: target.current_hit_points ?? target.currentHp ?? target.current_hp,
    max_hit_points: target.max_hit_points ?? target.maxHp ?? target.max_hp,
    temporary_hit_points: target.temporary_hit_points ?? target.temporaryHp ?? target.temporary_hp,
  });
  const targetAfter = {
    ...target,
    current_hit_points: hp.after.current_hit_points,
    max_hit_points: hp.after.max_hit_points,
    temporary_hit_points: hp.after.temporary_hit_points,
  };
  const zero = evaluateZeroHitPointTransition({
    participant: targetAfter,
    reached_zero_hit_points: hp.reached_zero_hit_points,
    overkill_damage: Math.max(damageAmount - ((target.current_hit_points ?? target.current_hp ?? 0) + (target.temporary_hit_points ?? target.temporary_hp ?? 0)), 0),
  });
  if (zero.status !== 'no_transition') {
    targetAfter.defeated = ['defeated', 'dead', 'unconscious_death_saves'].includes(zero.status);
    targetAfter.zero_hit_point_status = zero.status;
  }
  const concentration = state.concentration?.participant_id === participantId(target) || state.concentration?.source_participant_id === participantId(target)
    ? state.concentration
    : asArray(state.concentrations).find((entry) => entry.participant_id === participantId(target) || entry.source_participant_id === participantId(target));
  const concentrationResult = processConcentrationDamage({
    concentration,
    damage_amount: damageAmount,
    ruleset: state.combat.ruleset,
    roll_override: concentrationOverride,
    generation_origin: generationOrigin,
  });
  return { hp, zero_hit_point_transition: zero, concentration_result: concentrationResult, target_after: targetAfter, damage: damageResult, saving_throw_adjustment: saveAdjustment };
}

function targetOrder(targets = []) {
  return [...targets].sort((left, right) => participantId(left).localeCompare(participantId(right)));
}

function resolveAttackForTarget({ action, actor, target, targetIndex, input }) {
  const attackStep = stepByType(action, COMBAT_EFFECT_TYPES.ATTACK_ROLL);
  if (!attackStep) {
    return null;
  }
  const params = attackStep.params ?? {};
  return resolveAttackRoll({
    ruleset: action.ruleset,
    target_armor_class: target.armor_class ?? target.ac,
    modifiers: params.modifiers ?? [],
    advantage_sources: params.advantage_sources ?? params.advantageSources ?? [],
    disadvantage_sources: params.disadvantage_sources ?? params.disadvantageSources ?? [],
    roll_override: overrideFor(input, attackStep.step_id, participantId(target), targetIndex),
    generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM,
    actor_ref: visibleParticipantRef(input.state, actor, actor),
    target_ref: visibleParticipantRef(input.state, actor, target),
  });
}

function resolveSaveForTarget({ action, target, targetIndex, input }) {
  const saveStep = stepByType(action, COMBAT_EFFECT_TYPES.SAVING_THROW);
  if (!saveStep) {
    return null;
  }
  const params = saveStep.params ?? {};
  return {
    step: saveStep,
    result: resolveSavingThrow({
      ruleset: action.ruleset,
      ability: params.ability,
      difficulty_class: params.difficulty_class ?? params.difficultyClass,
      modifiers: params.modifiers ?? target?.saving_throw_modifiers?.[normalizedKey(params.ability)] ?? [],
      advantage_sources: params.advantage_sources ?? [],
      disadvantage_sources: params.disadvantage_sources ?? [],
      roll_override: overrideFor(input, saveStep.step_id, participantId(target), targetIndex),
      generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM,
      actor_ref: { participant_id: participantId(target) },
    }),
    success_policy: params.success_policy ?? params.successPolicy ?? SAVE_SUCCESS_POLICIES.NO_EFFECT_ON_SUCCESS,
  };
}

function resolveDamageForTarget({ action, target, targetIndex, input, critical = false, sharedDamageRolls = null }) {
  const damageStep = stepByType(action, COMBAT_EFFECT_TYPES.DIRECT_DAMAGE);
  if (!damageStep) {
    return null;
  }
  const rollOverrides = sharedDamageRolls ?? overrideFor(input, damageStep.step_id, participantId(target), targetIndex);
  return resolveDamage({
    ruleset: action.ruleset,
    components: damageComponentsFor(damageStep),
    defense_profile: target.defense_profile ?? target.defenseProfile ?? {},
    is_critical_hit: critical,
    roll_overrides: rollOverrides,
    generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM,
    random: input.random,
  });
}

function createSharedDamageRoll(action, input = {}) {
  const damageStep = stepByType(action, COMBAT_EFFECT_TYPES.DIRECT_DAMAGE);
  if (!damageStep) {
    return null;
  }
  const damage = resolveDamage({
    ruleset: action.ruleset,
    components: damageComponentsFor(damageStep),
    defense_profile: {},
    roll_overrides: input.roll_overrides?.[damageStep.step_id] ?? input.rollOverrides?.[damageStep.step_id] ?? input.shared_damage_roll_overrides ?? input.sharedDamageRollOverrides,
    generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM,
    random: input.random,
  });
  return {
    damage,
    roll_overrides: damageOverridesFromResult(damage),
  };
}

function applyTargetMutation(state, targetAfter) {
  state.participants = state.participants.map((participant) =>
    participantId(participant) === participantId(targetAfter) ? targetAfter : participant
  );
}

function applyConditionSteps(state, action, actor, target, committedResolutionId) {
  const instructions = [];
  for (const step of stepsByType(action, COMBAT_EFFECT_TYPES.APPLY_CONDITION)) {
    instructions.push({
      instruction_type: 'apply_condition_instruction',
      target: visibleParticipantRef(state, actor, target),
      condition_id: cleanText(step.params?.condition_id ?? step.params?.conditionId ?? step.params?.condition),
      duration: cloneSerializable(step.duration),
      committed_resolution_id: committedResolutionId,
    });
  }
  return instructions;
}

function createTargetOutcomeForPlayer(state, actor, outcome) {
  const visible = isVisibleToActor(state, actor, outcome.target_after ?? outcome.target);
  if (!visible) {
    return outcome.observable_consequence
      ? {
          target_visible: false,
          observable_consequence: outcome.observable_consequence,
          status: outcome.status,
        }
      : null;
  }
  return {
    target: visibleParticipantRef(state, actor, outcome.target_after ?? outcome.target),
    status: outcome.status,
    attack: outcome.attack_result ? {
      was_hit: outcome.attack_result.was_hit,
      was_miss: outcome.attack_result.was_miss,
      critical_hit: outcome.attack_result.is_critical_hit,
      final_total: outcome.attack_result.final_total,
    } : null,
    save: outcome.save_result ? {
      success: outcome.save_result.success,
      failure: outcome.save_result.failure,
      final_total: outcome.save_result.final_total,
      ability: outcome.save_result.ability,
    } : null,
    damage: outcome.damage_application ? {
      damage_total: outcome.applied_damage,
      health_band_after: healthBand(outcome.target_after),
      temporary_hit_points_absorbed: outcome.damage_application.temporary_hit_points_absorbed,
      reached_zero_hit_points: outcome.damage_application.reached_zero_hit_points,
    } : null,
    conditions: outcome.condition_instructions?.map((entry) => ({ condition_id: entry.condition_id })) ?? [],
    concentration: outcome.concentration_result?.player_safe_summary ?? null,
  };
}

export function resolveMultiTargetCombatAction(input = {}) {
  if (input.existing_resolution) {
    return {
      ...cloneSerializable(input.existing_resolution),
      status: COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED,
      duplicate_of_resolution_id: input.existing_resolution.committed_resolution_id,
    };
  }
  let state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state, input.actor_id ?? input.actorId);
  if (!actor) {
    return { status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE, committed: false, player_safe_message: 'That combatant cannot act right now.' };
  }
  const { action, target_policy: policy } = normalizeActionWithPolicy(input.action ?? {});
  const idempotencyKey = cleanText(input.idempotency_key ?? input.idempotencyKey);
  const fingerprint = JSON.stringify({
    action_id: action.action_id,
    selected_target_ids: asArray(input.selected_target_ids ?? input.selectedTargetIds).map(cleanText).sort(),
    target_group: input.target_group ?? input.targetGroup ?? policy.target_group,
  });
  if (idempotencyKey && state.multi_target_resolutions[idempotencyKey]) {
    const existing = state.multi_target_resolutions[idempotencyKey];
    if (existing.fingerprint !== fingerprint) {
      return { status: 'idempotency_conflict', committed: false, player_safe_message: 'That combat choice has changed. Review it again.', gm_dev_trace: { conflict: true, existing_fingerprint: existing.fingerprint, incoming_fingerprint: fingerprint } };
    }
    return { ...cloneSerializable(existing.response), status: COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED };
  }
  const authoritative = buildAuthoritativeTargetCandidates({ state, actor, policy: { ...policy, target_group: input.target_group ?? input.targetGroup ?? policy.target_group } });
  const selected = validateSelectedTargets({ authoritative_target_set: authoritative, selected_target_ids: input.selected_target_ids ?? input.selectedTargetIds });
  if (!selected.valid) {
    return { status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE, committed: false, reason: selected.reason, player_safe_message: 'Choose legal targets for this option.', current_target_preview: buildTargetPreview({ state, actor, action: input.action }) };
  }
  const confirmation = evaluateAllyInclusionConfirmation({ state, actor, policy, targets: selected.selected_targets });
  if (confirmation.required && input.confirm_ally_inclusion !== true && input.confirmAllyInclusion !== true) {
    return {
      status: 'confirmation_required',
      committed: false,
      confirmation: {
        required: true,
        visible_included: confirmation.visible_included,
        player_safe_message: confirmation.player_safe_message,
      },
      current_target_preview: buildTargetPreview({ state, actor, action: input.action, selected_target_ids: selected.selected_target_ids }),
      gm_dev_trace: { reason: 'visible_ally_or_non_hostile_included' },
    };
  }
  const lock = createTargetSetLock({
    authoritative_target_set: authoritative,
    selected_target_ids: selected.selected_target_ids,
    source_state_version: input.source_state_version ?? input.sourceStateVersion,
    participant_revision: state.participant_revision,
    faction_revision: state.faction_revision,
  });
  const damagePolicy = cleanText(input.damage_roll_policy ?? input.damageRollPolicy ?? action.authored_metadata?.damage_roll_policy) || inferDamageRollPolicy(action);
  const attackPolicy = cleanText(input.attack_roll_policy ?? input.attackRollPolicy ?? action.authored_metadata?.attack_roll_policy) || ATTACK_ROLL_POLICIES.SEPARATE_PER_TARGET;
  const sharedDamage = damagePolicy === DAMAGE_ROLL_POLICIES.SHARED_FOR_TARGET_SET ? createSharedDamageRoll(action, input) : null;
  const committedResolutionId = cleanText(input.committed_resolution_id ?? input.committedResolutionId) || stableId(['multi-target', action.action_id, selected.selected_target_ids.join('-')]);
  const targetOutcomes = [];
  const targetOrderList = targetOrder(selected.selected_targets);
  for (const [index, target] of targetOrderList.entries()) {
    const attackResult = resolveAttackForTarget({ action, actor, target, targetIndex: index, input: { ...input, state } });
    if (attackResult && attackResult.was_hit === false) {
      targetOutcomes.push({
        target,
        target_after: target,
        status: 'missed',
        attack_result: attackResult,
        applied_damage: 0,
        observable_consequence: isVisibleToActor(state, actor, target) ? null : 'Something in the area reacts to the attack.',
      });
      continue;
    }
    const save = resolveSaveForTarget({ action, target, targetIndex: index, input: { ...input, state } });
    const damageResult = resolveDamageForTarget({
      action,
      target,
      targetIndex: index,
      input: { ...input, state },
      critical: attackResult?.is_critical_hit ?? false,
      sharedDamageRolls: sharedDamage?.roll_overrides ?? null,
    });
    let saveAdjustment = null;
    let appliedDamage = damageResult?.total_damage ?? 0;
    if (save?.result && damageResult) {
      saveAdjustment = applySavingThrowSuccessPolicy({
        save_result: save.result,
        damage_amount: damageResult.total_damage,
        success_policy: save.success_policy,
      });
      appliedDamage = saveAdjustment.applied_amount;
    }
    const applied = damageResult
      ? applyTargetDamage({
          state,
          target,
          damageAmount: appliedDamage,
          damageResult,
          saveAdjustment,
          concentrationOverride: overrideFor(input, 'concentration', participantId(target), index),
          generationOrigin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM,
        })
      : { target_after: target, hp: null, zero_hit_point_transition: null, concentration_result: null };
    const conditionInstructions = applyConditionSteps(state, action, actor, target, committedResolutionId);
    const targetAfter = applied.target_after;
    applyTargetMutation(state, targetAfter);
    targetOutcomes.push({
      target,
      target_after: targetAfter,
      status: attackResult?.was_hit === true || save?.result || damageResult ? 'resolved' : 'affected',
      attack_result: attackResult,
      save_result: save?.result ?? null,
      damage_result: damageResult,
      damage_application: applied.hp ?? null,
      applied_damage: appliedDamage,
      zero_hit_point_transition: applied.zero_hit_point_transition,
      concentration_result: applied.concentration_result,
      condition_instructions: conditionInstructions,
      observable_consequence: isVisibleToActor(state, actor, target) ? null : 'A concealed creature is affected in the area.',
    });
  }
  state.participant_revision = nextRevision(state.participant_revision);
  const playerTargets = targetOutcomes.map((outcome) => createTargetOutcomeForPlayer(state, actor, outcome)).filter(Boolean);
  const completion = reevaluateEncounterCompletion({ state, trigger: 'multi_target_action_completed' });
  const result = {
    contract_version: '6D.10',
    operation_type: 'multi_target_combat_resolution',
    status: COMBAT_RESOLUTION_STATUSES.RESOLVED,
    committed: true,
    committed_resolution_id: committedResolutionId,
    action_id: action.action_id,
    target_set_lock: lock,
    target_resolution_order: targetOrderList.map(participantId),
    roll_policy: {
      attack: attackPolicy,
      save: SAVE_ROLL_POLICIES.SEPARATE_PER_TARGET,
      damage: damagePolicy,
    },
    shared_damage_roll: sharedDamage ? {
      damage_types: sharedDamage.damage.damage_types,
      total_before_target_defenses: sharedDamage.damage.total_damage,
    } : null,
    target_outcomes: targetOutcomes,
    state,
    completion_reevaluation: completion,
    player_result_bundle: {
      bundle_version: '6D.10',
      status: COMBAT_RESOLUTION_STATUSES.RESOLVED,
      result: { title: action.player_label, summary: `${action.player_label} resolves against ${playerTargets.length} visible target${playerTargets.length === 1 ? '' : 's'}.` },
      consequences: playerTargets,
      next: completion.next_decision?.next_decision_kind === 'encounter_resolution_required'
        ? ['Pause for encounter resolution.']
        : ['Continue combat from the refreshed state.'],
    },
    gm_dev_trace: {
      trace_kind: 'combat_targeting_participant_dynamics',
      selected_policy: policy,
      authoritative_target_ids: authoritative.target_ids,
      concealed_target_ids: authoritative.candidates.filter((entry) => !entry.is_visible_to_actor).map((entry) => entry.participant_id),
      target_outcomes: targetOutcomes.map((outcome) => ({
        target: participantExactTrace(outcome.target_after),
        attack_result: outcome.attack_result,
        save_result: outcome.save_result,
        damage_result: outcome.damage_result,
        zero_hit_point_transition: outcome.zero_hit_point_transition,
        concentration_result: outcome.concentration_result,
      })),
      completion_reevaluation: completion,
    },
  };
  if (idempotencyKey) {
    state.multi_target_resolutions[idempotencyKey] = { fingerprint, response: cloneSerializable(result) };
  }
  assertNoMultiTargetPlayerHiddenData(projectMultiTargetResultForPlayer(result));
  return result;
}

export function resolveMultiattack(input = {}) {
  const action = input.action ?? {};
  const attacks = asArray(action.multiattack_steps ?? action.multiattackSteps ?? action.authored_metadata?.multiattack_steps);
  if (attacks.length === 0) {
    return resolveMultiTargetCombatAction(input);
  }
  let state = normalizeState(input.state ?? input);
  const results = [];
  for (const [index, step] of attacks.entries()) {
    const targetId = cleanText(step.target_id ?? step.targetId) || asArray(input.selected_target_ids ?? input.selectedTargetIds)[index] || asArray(input.selected_target_ids ?? input.selectedTargetIds)[0];
    const result = resolveMultiTargetCombatAction({
      ...input,
      state,
      selected_target_ids: [targetId],
      committed_resolution_id: stableId([input.committed_resolution_id ?? 'multiattack', index + 1, targetId]),
      idempotency_key: null,
    });
    state = result.state ?? state;
    results.push(result);
  }
  return {
    contract_version: '6D.10',
    operation_type: 'multiattack_resolution',
    status: results.every((entry) => entry.status === COMBAT_RESOLUTION_STATUSES.RESOLVED) ? COMBAT_RESOLUTION_STATUSES.RESOLVED : COMBAT_RESOLUTION_STATUSES.RECOVERY_NEEDED,
    committed: true,
    action_id: actionId(action),
    attack_steps: results,
    target_resolution_order: results.flatMap((entry) => entry.target_resolution_order),
    state,
    player_result_bundle: {
      bundle_version: '6D.10',
      status: COMBAT_RESOLUTION_STATUSES.RESOLVED,
      result: { title: action.player_label ?? 'Multiattack', summary: 'The multiattack resolves in order.' },
      consequences: results.flatMap((entry) => entry.player_result_bundle?.consequences ?? []),
      next: ['Continue combat from the refreshed state.'],
    },
    gm_dev_trace: {
      trace_kind: 'combat_multiattack_resolution',
      attack_count: results.length,
      ordered_resolution_ids: results.map((entry) => entry.committed_resolution_id),
    },
  };
}

export function projectMultiTargetResultForPlayer(result = {}) {
  const projected = {
    contract_version: result.contract_version ?? '6D.10',
    operation_type: result.operation_type,
    status: result.status,
    action_id: result.action_id,
    target_resolution_order: asArray(result.target_resolution_order).filter((id) =>
      asArray(result.player_result_bundle?.consequences).some((entry) => entry.target?.participant_id === id)
    ),
    roll_policy: result.roll_policy ? {
      attack: result.roll_policy.attack,
      save: result.roll_policy.save,
      damage: result.roll_policy.damage,
    } : null,
    player_result_bundle: cloneSerializable(result.player_result_bundle),
    completion: result.completion_reevaluation?.player_projection ?? null,
  };
  assertNoMultiTargetPlayerHiddenData(projected);
  return projected;
}

export function projectTargetingForGmDev(payload = {}) {
  return cloneSerializable({
    ...payload,
    gm_dev_trace: payload.gm_dev_trace ?? { trace_kind: 'combat_targeting_participant_dynamics' },
  });
}

export function processParticipantEntry(input = {}) {
  let state = normalizeState(input.state ?? input);
  const participant = cloneSerializable(input.participant ?? input.entering_participant ?? input.enteringParticipant);
  if (!participantId(participant)) {
    return { status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE, committed: false, reason: 'participant_required' };
  }
  const key = cleanText(input.idempotency_key ?? input.idempotencyKey);
  if (key && state.participant_event_records[key]) {
    return { ...cloneSerializable(state.participant_event_records[key].response), status: COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED };
  }
  const placement = validatePlacement({ participant, zone_id: participant.current_zone_id ?? participant.zone_id });
  if (placement.status !== 'valid') {
    return { status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE, committed: false, reason: placement.reason ?? placement.status };
  }
  const initiative = input.initiative_total !== undefined
    ? toInteger(input.initiative_total)
    : generateD20Roll({
        ruleset: state.combat.ruleset,
        roll_category: ROLL_CATEGORIES.INITIATIVE,
        roll_override: input.initiative_roll_override ?? input.initiativeRollOverride,
        generation_origin: input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM,
        modifiers: [{ source_id: 'dexterity_modifier', source_type: 'dexterity_modifier', value: toInteger(participant.dexterity_modifier ?? participant.dex_mod) }],
      }).final_total;
  const entrant = {
    ...participant,
    active: true,
    exited: false,
    initiative_total: initiative,
    dexterity_modifier: toInteger(participant.dexterity_modifier ?? participant.dex_mod),
    deterministic_tiebreaker: cleanText(participant.deterministic_tiebreaker ?? participantId(participant)),
    entry_round: state.combat.round_number,
  };
  const sorted = state.participants
    .filter((entry) => participantId(entry) !== participantId(entrant))
    .concat(entrant)
    .sort((left, right) =>
      toInteger(right.initiative_total) - toInteger(left.initiative_total) ||
      toInteger(right.dexterity_modifier ?? right.dex_mod) - toInteger(left.dexterity_modifier ?? left.dex_mod) ||
      cleanText(left.deterministic_tiebreaker ?? participantId(left)).localeCompare(cleanText(right.deterministic_tiebreaker ?? participantId(right)))
    )
    .map((entry, index) => ({ ...entry, initiative_position: index + 1, turn_order: index + 1 }));
  const inserted = sorted.find((entry) => participantId(entry) === participantId(entrant));
  const override = cleanText(input.first_turn_timing_override ?? input.firstTurnTimingOverride);
  const firstTurnTiming = override || (toInteger(inserted.initiative_position) >= toInteger(state.combat.initiative_position) ? 'this_round_when_position_reached' : 'next_round_when_position_reached');
  state.participants = sorted;
  state.participant_revision = nextRevision(state.participant_revision);
  const response = {
    contract_version: '6D.10',
    event_type: PARTICIPANT_EVENT_TYPES.ENTRY,
    status: COMBAT_RESOLUTION_STATUSES.RESOLVED,
    committed: true,
    participant_id: participantId(entrant),
    initiative: {
      total: initiative,
      dexterity_modifier: entrant.dexterity_modifier,
      position: inserted.initiative_position,
      first_turn_timing: firstTurnTiming,
    },
    state,
    player_event: isVisibleToActor(state, actorFor(state), entrant)
      ? { event_type: 'participant_entry', participant: visibleParticipantRef(state, actorFor(state), entrant), initiative_position: inserted.initiative_position }
      : null,
    gm_dev_trace: { placement, initiative_roll: input.initiative_roll_override ?? input.initiative_total ?? null, insertion_order: sorted.map(participantId) },
  };
  if (key) {
    state.participant_event_records[key] = { response: cloneSerializable(response) };
  }
  return response;
}

export function processParticipantExit(input = {}) {
  let state = normalizeState(input.state ?? input);
  const id = cleanText(input.participant_id ?? input.participantId);
  const key = cleanText(input.idempotency_key ?? input.idempotencyKey);
  if (key && state.participant_event_records[key]) {
    return { ...cloneSerializable(state.participant_event_records[key].response), status: COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED };
  }
  let currentTurnClosed = false;
  state.participants = state.participants.map((participant) => {
    if (participantId(participant) !== id) {
      return participant;
    }
    return { ...participant, active: false, exited: true, exit_reason: cleanText(input.exit_reason ?? input.exitReason) || 'authored_exit' };
  });
  if (state.parent_turn?.actor_participant_id === id) {
    state.parent_turn = { ...state.parent_turn, status: 'closed', turn_close_reason: 'participant_exit' };
    currentTurnClosed = true;
  }
  state.participant_revision = nextRevision(state.participant_revision);
  const completion = reevaluateEncounterCompletion({ state, trigger: 'participant_exit' });
  const response = {
    contract_version: '6D.10',
    event_type: PARTICIPANT_EVENT_TYPES.EXIT,
    status: COMBAT_RESOLUTION_STATUSES.RESOLVED,
    committed: true,
    participant_id: id,
    current_turn_closed: currentTurnClosed,
    state,
    completion_reevaluation: completion,
    player_event: null,
    gm_dev_trace: { exit_reason: cleanText(input.exit_reason ?? input.exitReason), current_turn_closed: currentTurnClosed },
  };
  if (key) {
    state.participant_event_records[key] = { response: cloneSerializable(response) };
  }
  return response;
}

export function processParticipantReEntry(input = {}) {
  let state = normalizeState(input.state ?? input);
  const id = cleanText(input.participant_id ?? input.participantId);
  const permission = asArray(state.authored_reentry_permissions ?? input.authored_reentry_permissions ?? input.authoredReentryPermissions)
    .some((entry) => cleanText(entry.participant_id ?? entry.participantId ?? entry) === id);
  if (!permission && input.authorized_reentry !== true && input.authorizedReentry !== true) {
    return { status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE, committed: false, reason: 'authored_reentry_permission_required', player_safe_message: 'That combatant cannot re-enter right now.' };
  }
  const existing = findParticipant(state, id);
  if (!existing) {
    return { status: COMBAT_RESOLUTION_STATUSES.UNAVAILABLE, committed: false, reason: 'participant_not_found' };
  }
  const initiativeTotal = existing.initiative_total ?? input.initiative_total;
  const entry = processParticipantEntry({
    state,
    participant: { ...existing, active: true, exited: false, initiative_total: initiativeTotal },
    initiative_total: initiativeTotal,
    first_turn_timing_override: input.first_turn_timing_override ?? input.firstTurnTimingOverride,
    idempotency_key: input.idempotency_key ?? input.idempotencyKey,
  });
  return {
    ...entry,
    event_type: PARTICIPANT_EVENT_TYPES.RE_ENTRY,
    reentry_preserved_state: {
      hit_points: existing.current_hit_points,
      temporary_hit_points: existing.temporary_hit_points ?? 0,
      resources_preserved: true,
      conditions_preserved: true,
      concentration_preserved: true,
      faction: existing.faction,
      control_mode: existing.control_mode,
      initiative_reused: initiativeTotal !== undefined && initiativeTotal !== null,
    },
  };
}

export function processFactionChange(input = {}) {
  let state = normalizeState(input.state ?? input);
  const id = cleanText(input.participant_id ?? input.participantId);
  const key = cleanText(input.idempotency_key ?? input.idempotencyKey);
  if (key && state.participant_event_records[key]) {
    return { ...cloneSerializable(state.participant_event_records[key].response), status: COMBAT_RESOLUTION_STATUSES.DUPLICATE_HANDLED };
  }
  state.participants = state.participants.map((participant) =>
    participantId(participant) === id
      ? { ...participant, faction: cleanText(input.new_faction ?? input.newFaction), faction_changed_by: cleanText(input.change_id ?? input.changeId) || 'authored_faction_change' }
      : participant
  );
  for (const update of asArray(input.relationship_updates ?? input.relationshipUpdates)) {
    const factionA = cleanText(update.faction_a ?? update.factionA);
    const factionB = cleanText(update.faction_b ?? update.factionB);
    state.faction_relationships = state.faction_relationships.filter((entry) =>
      !(cleanText(entry.faction_a ?? entry.factionA) === factionA && cleanText(entry.faction_b ?? entry.factionB) === factionB)
    ).concat({ faction_a: factionA, faction_b: factionB, relationship: cleanText(update.relationship) || 'neutral' });
  }
  state.faction_revision = nextRevision(state.faction_revision);
  const completion = reevaluateEncounterCompletion({ state, trigger: 'faction_change' });
  const response = {
    contract_version: '6D.10',
    event_type: PARTICIPANT_EVENT_TYPES.FACTION_CHANGE,
    status: COMBAT_RESOLUTION_STATUSES.RESOLVED,
    committed: true,
    participant_id: id,
    state,
    completion_reevaluation: completion,
    gm_dev_trace: { relationship_updates: cloneSerializable(input.relationship_updates ?? input.relationshipUpdates ?? []) },
  };
  if (key) {
    state.participant_event_records[key] = { response: cloneSerializable(response) };
  }
  return response;
}

export function rebuildDynamicCombatContexts(input = {}) {
  const state = normalizeState(input.state ?? input);
  const actor = input.actor ?? actorFor(state, input.actor_id ?? input.actorId);
  const action = input.action ?? null;
  const targetPreview = action ? buildTargetPreview({ state, actor, action }) : null;
  let tactical = null;
  try {
    tactical = actor ? buildTacticalContext({ state, actor }) : null;
  } catch {
    tactical = null;
  }
  return {
    contract_version: '6D.10',
    status: 'rebuilt',
    participant_revision: state.participant_revision,
    faction_revision: state.faction_revision,
    target_preview: targetPreview,
    tactical_context: tactical ? {
      actor_id: tactical.actor_id,
      visible_participants: tactical.visible_participants,
      information_policy: tactical.information_policy,
    } : null,
    reaction_hostility_rebuilt: true,
    ally_confirmation_rebuilt: Boolean(targetPreview?.visible_ally_confirmation),
  };
}

export function reevaluateEncounterCompletion(input = {}) {
  const state = normalizeState(input.state ?? input);
  const playerLike = state.participants.filter((participant) => isActiveParticipant(participant) && (participant.player_controlled === true || participant.is_player_character === true || participant.faction === 'player'));
  const activeParticipants = state.participants.filter(isActiveParticipant);
  const activeHostiles = activeParticipants.filter((participant) =>
    playerLike.some((player) => relationFor(state, player, participant) === 'hostile')
  );
  const scripted = asArray(input.scripted_completion_conditions ?? state.scripted_completion_conditions ?? state.combat.scripted_completion_conditions)
    .find((condition) => condition.satisfied === true);
  if (scripted || activeHostiles.length === 0) {
    const next = {
      next_decision_kind: 'encounter_resolution_required',
      player_safe_label: 'Combat resolution is ready.',
      reason: scripted ? cleanText(scripted.condition_id ?? scripted.id) || 'scripted_condition_satisfied' : 'no_active_hostiles',
      aftermath_applied: false,
    };
    return {
      contract_version: '6D.10',
      status: ENCOUNTER_COMPLETION_KINDS.ENCOUNTER_RESOLUTION_REQUIRED,
      trigger: cleanText(input.trigger) || 'reevaluation',
      next_decision: next,
      aftermath_applied: false,
      player_projection: { status: 'resolution_pending', player_safe_message: 'Combat resolution is ready.' },
      gm_dev_trace: { active_hostile_ids: activeHostiles.map(participantId), scripted_condition: scripted ?? null },
    };
  }
  return {
    contract_version: '6D.10',
    status: ENCOUNTER_COMPLETION_KINDS.ACTIVE,
    trigger: cleanText(input.trigger) || 'reevaluation',
    next_decision: createCombatNextBeatDecision({
      next_beat_decision_kind: COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_NEXT_PLAYER_TURN,
      player_safe_label: 'Combat continues.',
      reason: 'active_hostiles_remain',
    }),
    aftermath_applied: false,
    player_projection: { status: 'active', player_safe_message: 'Combat continues.' },
    gm_dev_trace: { active_hostile_ids: activeHostiles.map(participantId) },
  };
}

export function projectParticipantDynamicsForPlayer(payload = {}) {
  const events = asArray(payload.events ?? payload.player_events).filter(Boolean).map((event) => ({
    event_type: event.event_type,
    participant: event.participant ?? null,
    initiative_position: event.initiative_position ?? null,
    player_safe_message: event.player_safe_message ?? null,
  }));
  const projected = {
    contract_version: '6D.10',
    status: payload.status,
    events,
    completion: payload.completion_reevaluation?.player_projection ?? null,
  };
  assertNoMultiTargetPlayerHiddenData(projected);
  return projected;
}

export function buildTargetingGmDevTrace(input = {}) {
  return {
    contract_version: '6D.10',
    trace_kind: 'combat_targeting_participant_dynamics',
    target_policy: cloneSerializable(input.target_policy ?? input.policy ?? null),
    authoritative_targets: cloneSerializable(input.authoritative_targets ?? []),
    visible_targets: cloneSerializable(input.visible_targets ?? []),
    rejected_targets: cloneSerializable(input.rejected_targets ?? []),
    roll_policy: cloneSerializable(input.roll_policy ?? null),
    participant_events: cloneSerializable(input.participant_events ?? []),
    completion_reevaluation: cloneSerializable(input.completion_reevaluation ?? null),
    visibility_filtering_notes: [
      'player_preview_omits_concealed_participants',
      'player_result_omits_unobservable_target_identity',
      ...(input.visibility_filtering_notes ?? []),
    ],
  };
}

export function assertNoMultiTargetPlayerHiddenData(payload = {}) {
  const text = JSON.stringify(payload);
  const leaked = PLAYER_PROHIBITED_KEYS.find((key) => text.includes(key));
  if (leaked) {
    throw new Error(`Player combat targeting payload contains hidden/internal data: ${leaked}`);
  }
  return true;
}
