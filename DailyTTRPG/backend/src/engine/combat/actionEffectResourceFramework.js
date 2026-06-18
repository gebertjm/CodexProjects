import {
  DND5E_2014_RULESET,
  ROLL_CATEGORIES,
  ROLL_GENERATION_ORIGINS,
  SAVE_SUCCESS_POLICIES,
  applyDamageToHitPoints,
  applySavingThrowSuccessPolicy,
  resolveAbilityCheck,
  resolveAttackRoll,
  resolveContestedAbilityCheck,
  resolveDamage,
  resolveRulesetIdentity,
  resolveSavingThrow,
} from './rulesResolution.js';

export { DND5E_2014_RULESET, ROLL_GENERATION_ORIGINS, SAVE_SUCCESS_POLICIES };

export const COMBAT_ACTION_TIMING_CATEGORIES = Object.freeze({
  ACTION: 'action',
  BONUS_ACTION: 'bonus_action',
  REACTION: 'reaction',
  FREE_INTERACTION: 'free_interaction',
  OBJECT_INTERACTION: 'object_interaction',
  END_TURN: 'end_turn',
});

export const COMBAT_TARGET_POLICIES = Object.freeze({
  SELF: 'self',
  NO_TARGET: 'no_target',
  ONE_CREATURE: 'one_creature',
  ONE_ALLY: 'one_ally',
  ONE_ENEMY: 'one_enemy',
  ONE_SELECTED_CREATURE: 'one_selected_creature',
  SELECTED_TARGETS_UP_TO_LIMIT: 'selected_targets_up_to_limit',
  AUTHORED_TARGET_GROUP: 'authored_target_group',
  AUTHORED_FACTION_FILTER: 'authored_faction_filter',
});

export const COMBAT_EFFECT_TYPES = Object.freeze({
  ATTACK_ROLL: 'attack_roll',
  SAVING_THROW: 'saving_throw',
  ABILITY_CHECK: 'ability_check',
  CONTESTED_ABILITY_CHECK: 'contested_ability_check',
  DIRECT_DAMAGE: 'direct_damage',
  HEALING: 'healing',
  TEMPORARY_HIT_POINTS: 'temporary_hit_points',
  APPLY_CONDITION: 'apply_condition',
  REMOVE_CONDITION: 'remove_condition',
  RESOURCE_SPEND: 'resource_spend',
  RESOURCE_RESTORE: 'resource_restore',
  CONCENTRATION_START: 'concentration_start',
  CONCENTRATION_END: 'concentration_end',
  STATE_MARKER: 'state_marker',
});

export const COMBAT_ACTION_RESULT_STATUSES = Object.freeze({
  RESOLVED: 'resolved',
  PARTIALLY_RESOLVED: 'partially_resolved',
  PLAYER_DECISION_REQUIRED: 'player_decision_required',
  INTERRUPTED: 'interrupted',
  ACTOR_INVALID: 'actor_invalid',
  TARGET_INVALID: 'target_invalid',
  UNAVAILABLE: 'unavailable',
  STALE: 'stale',
  DUPLICATE_HANDLED: 'duplicate_handled',
  RECOVERY_NEEDED: 'recovery_needed',
});

export const COMBAT_RESOURCE_CATEGORIES = Object.freeze({
  PER_COMBAT_USE: 'per_combat_use',
  SHORT_REST_USE: 'short_rest_use',
  LONG_REST_USE: 'long_rest_use',
  CHARGE: 'charge',
  POOL: 'pool',
  TIERED_POOL: 'tiered_pool',
  COOLDOWN: 'cooldown',
  RECHARGE: 'recharge',
});

export const COMBAT_RESOURCE_REFRESH_TRIGGERS = Object.freeze({
  PER_COMBAT: 'per_combat',
  SHORT_REST: 'short_rest',
  LONG_REST: 'long_rest',
  EXPLICIT_CHARGE_RESTORE: 'explicit_charge_restore',
  COOLDOWN_TICK: 'cooldown_tick',
  RECHARGE_ROLL: 'recharge_roll',
});

export const COMBAT_DURATION_KINDS = Object.freeze({
  INSTANTANEOUS: 'instantaneous',
  UNTIL_START_OF_ACTOR_NEXT_TURN: 'until_start_of_actor_next_turn',
  UNTIL_END_OF_ACTOR_NEXT_TURN: 'until_end_of_actor_next_turn',
  UNTIL_START_OF_TARGET_NEXT_TURN: 'until_start_of_target_next_turn',
  UNTIL_END_OF_TARGET_NEXT_TURN: 'until_end_of_target_next_turn',
  FIXED_ROUNDS: 'fixed_rounds',
  FIXED_TIME: 'fixed_time',
  UNTIL_CONCENTRATION_ENDS: 'until_concentration_ends',
  UNTIL_COMBAT_ENDS: 'until_combat_ends',
  UNTIL_DISCHARGED: 'until_discharged',
  UNTIL_AUTHORED_TRIGGER: 'until_authored_trigger',
  PERMANENT_UNTIL_REMOVED: 'permanent_until_removed',
  EXPLICIT_EXPIRATION_RULE: 'explicit_expiration_rule',
});

export const COMBAT_RESOURCE_SPEND_STATUSES = Object.freeze({
  SPENT: 'spent',
  NOT_SPENT: 'not_spent',
  INSUFFICIENT: 'insufficient',
  WRONG_OWNER: 'wrong_owner',
  WRONG_TIER: 'wrong_tier',
  COOLDOWN_UNAVAILABLE: 'cooldown_unavailable',
  ALREADY_SPENT_FOR_RESOLUTION: 'already_spent_for_resolution',
  RESTORED: 'restored',
  PLAYER_DECISION_REQUIRED: 'player_decision_required',
});

export const TEMPORARY_HIT_POINT_POLICIES = Object.freeze({
  TAKE_HIGHER: 'take_higher',
  TAKE_NEW: 'take_new',
  KEEP_CURRENT: 'keep_current',
  PLAYER_DECISION_REQUIRED: 'player_decision_required',
});

const PLAYER_PROHIBITED_KEYS = Object.freeze([
  'armor_class',
  'target_armor_class',
  'difficulty_class',
  'hidden_dc',
  'raw_roll',
  'roll_record',
  'roll_override',
  'roll_overrides',
  'gm_dev_trace',
  'trace',
  'mutation_instructions',
  'mutation_plan',
  'resource_state_after',
  'idempotency_key',
  'source_state_version',
  'defense_profile',
  'internal_label',
  'source_path',
  'handler',
  'script',
  'code',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(value).toLowerCase();
}

function cleanKey(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return cleanText(String(value));
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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function frameworkError(message, code = 'COMBAT_ACTION_FRAMEWORK_VALIDATION_FAILED') {
  const error = new Error(message);
  error.code = code;
  error.player_safe_message = 'That combat option cannot be resolved yet.';
  return error;
}

function assertNoExecutableAuthoring(value, path = 'definition') {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'function') {
      throw frameworkError(`Combat action authoring cannot include executable functions at ${path}.`, 'EXECUTABLE_AUTHORING_NOT_ALLOWED');
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (typeof nested === 'function' || ['handler', 'script', 'code', 'eval'].includes(normalized)) {
      throw frameworkError(`Combat action authoring cannot include executable code at ${path}.${key}.`, 'EXECUTABLE_AUTHORING_NOT_ALLOWED');
    }
    if (nested && typeof nested === 'object') {
      assertNoExecutableAuthoring(nested, `${path}.${key}`);
    }
  }
}

function normalizeEnum(value, allowedValues, fallback, label) {
  const normalized = normalizedKey(value);
  if (!normalized) {
    return fallback;
  }
  if (!allowedValues.includes(normalized)) {
    throw frameworkError(`Unsupported ${label} "${value}".`, `UNSUPPORTED_${label.toUpperCase()}`);
  }
  return normalized;
}

function normalizeDuration(input = {}) {
  const source = input && typeof input === 'object' ? input : { duration_kind: input };
  const kind = normalizeEnum(
    source.duration_kind ?? source.durationKind ?? source.kind,
    Object.values(COMBAT_DURATION_KINDS),
    COMBAT_DURATION_KINDS.INSTANTANEOUS,
    'duration_kind'
  );

  return {
    duration_kind: kind,
    round_count: source.round_count ?? source.roundCount ?? null,
    time_expression: cleanText(source.time_expression ?? source.timeExpression) || null,
    expires_on: cleanText(source.expires_on ?? source.expiresOn) || null,
    concentration_required: Boolean(source.concentration_required ?? source.concentrationRequired),
    authored_expiration: cleanText(source.authored_expiration ?? source.authoredExpiration) || null,
  };
}

function normalizeCost(cost = {}, index = 0) {
  const source = cost && typeof cost === 'object' ? cost : {};
  const category = normalizeEnum(
    source.category ?? source.resource_category ?? source.resourceCategory,
    Object.values(COMBAT_RESOURCE_CATEGORIES),
    COMBAT_RESOURCE_CATEGORIES.POOL,
    'resource_category'
  );

  return {
    cost_id: cleanText(source.cost_id ?? source.costId) || `cost:${index + 1}`,
    resource_id: cleanText(source.resource_id ?? source.resourceId),
    owner_ref: cloneSerializable(source.owner_ref ?? source.ownerRef ?? null),
    category,
    amount: Math.max(toInteger(source.amount, 1), 0),
    tier: source.tier ?? source.selected_tier ?? source.selectedTier ?? null,
    visible_label: cleanText(source.visible_label ?? source.visibleLabel) || null,
    spend_timing: cleanText(source.spend_timing ?? source.spendTiming) || 'when_reached',
  };
}

function normalizeResourceCosts(costs = []) {
  return asArray(costs).map((cost, index) => normalizeCost(cost, index));
}

export function createCombatEffectStep(input = {}, index = 0) {
  assertNoExecutableAuthoring(input, `effect_steps.${index}`);
  const source = input && typeof input === 'object' ? input : {};
  const effectType = normalizeEnum(
    source.effect_type ?? source.effectType ?? source.type,
    Object.values(COMBAT_EFFECT_TYPES),
    null,
    'effect_type'
  );
  if (!effectType) {
    throw frameworkError('Combat effect steps require an effect type.', 'COMBAT_EFFECT_TYPE_REQUIRED');
  }

  return {
    step_id: cleanText(source.step_id ?? source.stepId) || `step:${index + 1}`,
    order: toInteger(source.order, index + 1),
    effect_type: effectType,
    params: cloneSerializable(source.params ?? {}),
    resource_costs: normalizeResourceCosts(source.resource_costs ?? source.resourceCosts ?? []),
    duration: normalizeDuration(source.duration ?? { duration_kind: COMBAT_DURATION_KINDS.INSTANTANEOUS }),
    depends_on_step_id: cleanText(source.depends_on_step_id ?? source.dependsOnStepId) || null,
    requires_outcome: cloneSerializable(source.requires_outcome ?? source.requiresOutcome ?? null),
    on_dependency_unmet: cleanText(source.on_dependency_unmet ?? source.onDependencyUnmet) || 'skip_step',
    on_failure: cleanText(source.on_failure ?? source.onFailure) || 'continue',
    player_label: cleanText(source.player_label ?? source.playerLabel) || null,
    player_summary: cleanText(source.player_summary ?? source.playerSummary) || null,
    gm_dev_notes: cloneSerializable(source.gm_dev_notes ?? source.gmDevNotes ?? null),
  };
}

export function createCombatActionDefinition(input = {}) {
  assertNoExecutableAuthoring(input, 'combat_action');
  const source = input && typeof input === 'object' ? input : {};
  const ruleset = resolveRulesetIdentity(source.ruleset ?? DND5E_2014_RULESET);
  const actionId = cleanText(source.action_id ?? source.actionId ?? source.id);
  if (!actionId) {
    throw frameworkError('Combat actions require a stable action id.', 'COMBAT_ACTION_ID_REQUIRED');
  }

  const effectSteps = asArray(source.effect_steps ?? source.effectSteps)
    .map((step, index) => createCombatEffectStep(step, index))
    .sort((a, b) => a.order - b.order);
  const stepIds = new Set();
  for (const step of effectSteps) {
    if (stepIds.has(step.step_id)) {
      throw frameworkError(`Duplicate combat effect step id "${step.step_id}".`, 'DUPLICATE_EFFECT_STEP_ID');
    }
    stepIds.add(step.step_id);
  }

  return {
    contract_version: '6D.4',
    action_id: actionId,
    legacy_action_id: source.legacy_action_id ?? source.legacyActionId ?? null,
    action_name: cleanText(source.action_name ?? source.actionName ?? source.name) || actionId,
    player_label: cleanText(source.player_label ?? source.playerLabel ?? source.name) || actionId,
    description: cleanText(source.description) || null,
    ruleset,
    timing_category: normalizeEnum(
      source.timing_category ?? source.timingCategory ?? source.action_type ?? source.actionType,
      Object.values(COMBAT_ACTION_TIMING_CATEGORIES),
      COMBAT_ACTION_TIMING_CATEGORIES.ACTION,
      'timing_category'
    ),
    target_policy: normalizeEnum(
      source.target_policy ?? source.targetPolicy,
      Object.values(COMBAT_TARGET_POLICIES),
      COMBAT_TARGET_POLICIES.ONE_CREATURE,
      'target_policy'
    ),
    target_count: Math.max(toInteger(source.target_count ?? source.targetCount, 1), 0),
    action_level_costs: normalizeResourceCosts(source.action_level_costs ?? source.actionLevelCosts ?? source.resource_costs ?? []),
    action_economy_cost: cloneSerializable(source.action_economy_cost ?? source.actionEconomyCost ?? null),
    concentration: cloneSerializable(source.concentration ?? null),
    effect_steps: effectSteps,
    authored_metadata: cloneSerializable(source.authored_metadata ?? source.authoredMetadata ?? {}),
  };
}

export function normalizeLegacyStatBlockAction(input = {}, options = {}) {
  const actionId = input.id ?? input.action_id ?? input.name;
  const range = input.range && typeof input.range === 'object' ? input.range : {};
  const targetPolicy = range.type === 'self'
    ? COMBAT_TARGET_POLICIES.SELF
    : COMBAT_TARGET_POLICIES.ONE_CREATURE;
  const effectSteps = [];

  if (input.requires_attack_roll) {
    effectSteps.push({
      step_id: 'legacy_attack_roll',
      order: 1,
      effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL,
      params: {
        modifiers: [],
        player_summary: 'Make the attack roll.',
      },
    });
  }

  if (input.saving_throw && typeof input.saving_throw === 'object') {
    effectSteps.push({
      step_id: 'legacy_saving_throw',
      order: effectSteps.length + 1,
      effect_type: COMBAT_EFFECT_TYPES.SAVING_THROW,
      params: {
        ability: input.saving_throw.ability,
        difficulty_class: input.saving_throw.dc,
        success_policy: input.saving_throw.success_policy ?? SAVE_SUCCESS_POLICIES.HALF_DAMAGE_ON_SUCCESS,
      },
    });
  }

  if (input.damage) {
    effectSteps.push({
      step_id: 'legacy_damage',
      order: effectSteps.length + 1,
      effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
      depends_on_step_id: input.requires_attack_roll ? 'legacy_attack_roll' : null,
      requires_outcome: input.requires_attack_roll ? { was_hit: true } : null,
      params: {
        components: asArray(input.damage).map((damage, index) => ({
          damage_type: damage.type ?? damage.damage_type ?? 'bludgeoning',
          dice_count: damage.dice_count ?? damage.diceCount ?? 0,
          dice_size: damage.dice_size ?? damage.diceSize ?? 0,
          flat_modifier: damage.flat_modifier ?? damage.flatModifier ?? damage.bonus ?? 0,
          source_ref: `legacy_damage:${index + 1}`,
        })),
        linked_attack_step_id: input.requires_attack_roll ? 'legacy_attack_roll' : null,
        linked_save_step_id: input.saving_throw ? 'legacy_saving_throw' : null,
      },
    });
  }

  if (effectSteps.length === 0 && asArray(input.effects).length > 0) {
    effectSteps.push({
      step_id: 'legacy_state_marker',
      order: 1,
      effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER,
      params: {
        marker_id: `legacy_effect:${actionId}`,
        marker_value: input.effects,
      },
    });
  }

  if (effectSteps.length === 0) {
    throw frameworkError('Legacy stat block action does not contain a supported Stage 6D.4 effect.', 'UNSUPPORTED_LEGACY_ACTION');
  }

  return createCombatActionDefinition({
    action_id: `legacy-action:${actionId}`,
    legacy_action_id: actionId,
    action_name: input.name ?? `Legacy action ${actionId}`,
    player_label: input.name ?? `Legacy action ${actionId}`,
    description: input.description,
    ruleset: options.ruleset ?? DND5E_2014_RULESET,
    timing_category: COMBAT_ACTION_TIMING_CATEGORIES.ACTION,
    target_policy: targetPolicy,
    effect_steps: effectSteps,
    authored_metadata: {
      source: 'legacy_stat_block_action',
      legacy_requirements: cloneSerializable(input.requirements ?? null),
      legacy_effects: cloneSerializable(input.effects ?? null),
    },
  });
}

function ownerMatches(resourceOwner, expectedOwner) {
  if (!expectedOwner || !resourceOwner) {
    return true;
  }
  const left = typeof resourceOwner === 'object' ? (resourceOwner.id ?? resourceOwner.owner_id ?? resourceOwner.ref) : resourceOwner;
  const right = typeof expectedOwner === 'object' ? (expectedOwner.id ?? expectedOwner.owner_id ?? expectedOwner.ref) : expectedOwner;
  return cleanText(left) === cleanText(right);
}

export function createCombatResourceState(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const category = normalizeEnum(
    source.category ?? source.resource_category ?? source.resourceCategory,
    Object.values(COMBAT_RESOURCE_CATEGORIES),
    COMBAT_RESOURCE_CATEGORIES.POOL,
    'resource_category'
  );
  const maximum = Math.max(toInteger(source.maximum ?? source.max ?? source.uses_max ?? source.usesMax ?? source.charges_max ?? source.chargesMax, 0), 0);
  const current = Math.max(toInteger(source.current ?? source.uses_remaining ?? source.usesRemaining ?? source.charges_current ?? source.chargesCurrent, maximum), 0);

  const tiers = {};
  const rawTiers = source.tiers && typeof source.tiers === 'object' ? source.tiers : {};
  for (const [tier, value] of Object.entries(rawTiers)) {
    const tierSource = value && typeof value === 'object' ? value : { current: value, maximum: value };
    const tierMax = Math.max(toInteger(tierSource.maximum ?? tierSource.max, tierSource.current ?? 0), 0);
    tiers[tier] = {
      current: Math.max(toInteger(tierSource.current, tierMax), 0),
      maximum: tierMax,
    };
  }

  return {
    resource_id: cleanText(source.resource_id ?? source.resourceId ?? source.id),
    owner_ref: cloneSerializable(source.owner_ref ?? source.ownerRef ?? null),
    category,
    current,
    maximum,
    tiers,
    cooldown: cloneSerializable(source.cooldown ?? { status: 'ready', remaining_rounds: 0 }),
    recharge: cloneSerializable(source.recharge ?? null),
    refresh_triggers: asArray(source.refresh_triggers ?? source.refreshTriggers ?? source.refresh?.triggers),
    spent_resolution_ids: asArray(source.spent_resolution_ids ?? source.spentResolutionIds),
    visible_label: cleanText(source.visible_label ?? source.visibleLabel) || null,
  };
}

function normalizeResourceCollection(resources = []) {
  const entries = Array.isArray(resources) ? resources : Object.values(resources ?? {});
  const map = new Map();
  for (const resource of entries) {
    const normalized = createCombatResourceState(resource);
    map.set(normalized.resource_id, normalized);
  }
  return map;
}

function resourceCollectionToArray(resourceMap) {
  return [...resourceMap.values()].map((resource) => cloneSerializable(resource));
}

export function validateCombatResourceCost(costInput = {}, resourceInput = [], context = {}) {
  const cost = normalizeCost(costInput);
  const resources = normalizeResourceCollection(resourceInput);
  const resource = resources.get(cost.resource_id);
  if (!resource) {
    return {
      status: COMBAT_RESOURCE_SPEND_STATUSES.INSUFFICIENT,
      cost,
      player_safe_message: 'That resource is not available right now.',
    };
  }
  if (!ownerMatches(resource.owner_ref, cost.owner_ref ?? context.owner_ref ?? context.ownerRef)) {
    return {
      status: COMBAT_RESOURCE_SPEND_STATUSES.WRONG_OWNER,
      cost,
      resource_id: resource.resource_id,
      player_safe_message: 'That resource belongs to someone else.',
    };
  }
  if (asArray(resource.spent_resolution_ids).includes(context.committed_resolution_id ?? context.committedResolutionId)) {
    return {
      status: COMBAT_RESOURCE_SPEND_STATUSES.ALREADY_SPENT_FOR_RESOLUTION,
      cost,
      resource_id: resource.resource_id,
      player_safe_message: 'That cost has already been handled.',
    };
  }

  if (resource.category === COMBAT_RESOURCE_CATEGORIES.COOLDOWN && resource.cooldown?.status === 'cooling_down') {
    return {
      status: COMBAT_RESOURCE_SPEND_STATUSES.COOLDOWN_UNAVAILABLE,
      cost,
      resource_id: resource.resource_id,
      player_safe_message: 'That option is still recharging.',
    };
  }

  if (resource.category === COMBAT_RESOURCE_CATEGORIES.TIERED_POOL) {
    const tier = cleanKey(cost.tier);
    const tierState = resource.tiers[tier];
    if (!tier || !tierState) {
      return {
        status: COMBAT_RESOURCE_SPEND_STATUSES.WRONG_TIER,
        cost,
        resource_id: resource.resource_id,
        player_safe_message: 'That resource tier is not available.',
      };
    }
    if (tierState.current < cost.amount) {
      return {
        status: COMBAT_RESOURCE_SPEND_STATUSES.INSUFFICIENT,
        cost,
        resource_id: resource.resource_id,
        player_safe_message: 'That resource tier is spent.',
      };
    }
    return {
      status: COMBAT_RESOURCE_SPEND_STATUSES.NOT_SPENT,
      cost,
      resource_id: resource.resource_id,
      available: true,
    };
  }

  if (resource.current < cost.amount) {
    return {
      status: COMBAT_RESOURCE_SPEND_STATUSES.INSUFFICIENT,
      cost,
      resource_id: resource.resource_id,
      player_safe_message: 'That resource is spent.',
    };
  }

  return {
    status: COMBAT_RESOURCE_SPEND_STATUSES.NOT_SPENT,
    cost,
    resource_id: resource.resource_id,
    available: true,
  };
}

export function spendCombatResourceCosts(input = {}) {
  const costs = normalizeResourceCosts(input.costs ?? input.resource_costs ?? input.resourceCosts);
  const resources = normalizeResourceCollection(input.resources ?? input.resource_states ?? input.resourceStates);
  const committedResolutionId = cleanText(input.committed_resolution_id ?? input.committedResolutionId);
  const ownerRef = input.owner_ref ?? input.ownerRef ?? null;
  const spends = [];

  for (const cost of costs) {
    const validation = validateCombatResourceCost(cost, resourceCollectionToArray(resources), {
      committed_resolution_id: committedResolutionId,
      owner_ref: ownerRef,
    });
    if (validation.status !== COMBAT_RESOURCE_SPEND_STATUSES.NOT_SPENT) {
      spends.push(validation);
      if (validation.status !== COMBAT_RESOURCE_SPEND_STATUSES.ALREADY_SPENT_FOR_RESOLUTION) {
        return {
          success: false,
          status: validation.status,
          spends,
          resources_after: resourceCollectionToArray(resources),
          player_safe_message: validation.player_safe_message,
        };
      }
      continue;
    }

    const resource = resources.get(cost.resource_id);
    if (resource.category === COMBAT_RESOURCE_CATEGORIES.TIERED_POOL) {
      const tier = cleanKey(cost.tier);
      resource.tiers[tier].current = Math.max(resource.tiers[tier].current - cost.amount, 0);
    } else if (resource.category === COMBAT_RESOURCE_CATEGORIES.COOLDOWN) {
      resource.cooldown = {
        status: 'cooling_down',
        remaining_rounds: Math.max(toInteger(resource.cooldown?.remaining_rounds ?? resource.cooldown?.remainingRounds, 1), 1),
      };
    } else {
      resource.current = Math.max(resource.current - cost.amount, 0);
    }
    if (committedResolutionId) {
      resource.spent_resolution_ids = [...new Set([...asArray(resource.spent_resolution_ids), committedResolutionId])];
    }
    spends.push({
      status: COMBAT_RESOURCE_SPEND_STATUSES.SPENT,
      cost,
      resource_id: resource.resource_id,
      amount: cost.amount,
      tier: cost.tier ?? null,
    });
  }

  return {
    success: true,
    status: COMBAT_RESOURCE_SPEND_STATUSES.SPENT,
    spends,
    resources_after: resourceCollectionToArray(resources),
  };
}

export function restoreCombatResources(input = {}) {
  const trigger = normalizeEnum(
    input.refresh_trigger ?? input.refreshTrigger,
    Object.values(COMBAT_RESOURCE_REFRESH_TRIGGERS),
    COMBAT_RESOURCE_REFRESH_TRIGGERS.LONG_REST,
    'refresh_trigger'
  );
  const resources = normalizeResourceCollection(input.resources ?? input.resource_states ?? input.resourceStates);
  const rechargeRoll = input.recharge_roll ?? input.rechargeRoll ?? null;

  for (const resource of resources.values()) {
    const triggers = asArray(resource.refresh_triggers);
    if (
      (resource.category === COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE && trigger === COMBAT_RESOURCE_REFRESH_TRIGGERS.PER_COMBAT) ||
      (resource.category === COMBAT_RESOURCE_CATEGORIES.SHORT_REST_USE && [COMBAT_RESOURCE_REFRESH_TRIGGERS.SHORT_REST, COMBAT_RESOURCE_REFRESH_TRIGGERS.LONG_REST].includes(trigger)) ||
      (resource.category === COMBAT_RESOURCE_CATEGORIES.LONG_REST_USE && trigger === COMBAT_RESOURCE_REFRESH_TRIGGERS.LONG_REST) ||
      (resource.category === COMBAT_RESOURCE_CATEGORIES.POOL && (triggers.includes(trigger) || trigger === COMBAT_RESOURCE_REFRESH_TRIGGERS.LONG_REST)) ||
      (resource.category === COMBAT_RESOURCE_CATEGORIES.CHARGE && trigger === COMBAT_RESOURCE_REFRESH_TRIGGERS.EXPLICIT_CHARGE_RESTORE)
    ) {
      resource.current = resource.maximum;
      resource.spent_resolution_ids = [];
    }
    if (resource.category === COMBAT_RESOURCE_CATEGORIES.TIERED_POOL && (triggers.includes(trigger) || trigger === COMBAT_RESOURCE_REFRESH_TRIGGERS.LONG_REST)) {
      for (const tier of Object.values(resource.tiers)) {
        tier.current = tier.maximum;
      }
      resource.spent_resolution_ids = [];
    }
    if (resource.category === COMBAT_RESOURCE_CATEGORIES.COOLDOWN && trigger === COMBAT_RESOURCE_REFRESH_TRIGGERS.COOLDOWN_TICK) {
      const remaining = Math.max(toInteger(resource.cooldown?.remaining_rounds ?? resource.cooldown?.remainingRounds, 0) - 1, 0);
      resource.cooldown = {
        status: remaining > 0 ? 'cooling_down' : 'ready',
        remaining_rounds: remaining,
      };
    }
    if (resource.category === COMBAT_RESOURCE_CATEGORIES.RECHARGE && trigger === COMBAT_RESOURCE_REFRESH_TRIGGERS.RECHARGE_ROLL) {
      const threshold = toInteger(resource.recharge?.minimum_roll ?? resource.recharge?.minimumRoll, 6);
      if (toInteger(rechargeRoll, 0) >= threshold) {
        resource.current = resource.maximum;
        resource.spent_resolution_ids = [];
      }
    }
  }

  return resourceCollectionToArray(resources);
}

function validateTargetPolicy(action, actor, target) {
  if (action.target_policy === COMBAT_TARGET_POLICIES.NO_TARGET) {
    return { valid: true, target: null };
  }
  if (action.target_policy === COMBAT_TARGET_POLICIES.SELF) {
    return { valid: true, target: target ?? actor };
  }
  if (!target) {
    return {
      valid: false,
      status: COMBAT_ACTION_RESULT_STATUSES.TARGET_INVALID,
      player_safe_message: 'Choose a valid target first.',
    };
  }
  return { valid: true, target };
}

function isActorValid(actor = {}) {
  return actor && actor.participant_id && actor.defeated !== true && actor.unconscious !== true && actor.removed !== true;
}

function isTargetValid(target = {}) {
  return !target || (target.defeated !== true && target.removed !== true);
}

function dependencyMet(step, resultsByStepId) {
  if (!step.depends_on_step_id) {
    return true;
  }
  const prior = resultsByStepId.get(step.depends_on_step_id);
  if (!prior || prior.status === 'skipped') {
    return false;
  }
  if (!step.requires_outcome) {
    return prior.status === 'resolved';
  }
  return Object.entries(step.requires_outcome).every(([key, value]) => prior[key] === value || prior.result?.[key] === value);
}

function rollDice({ dice_count = 0, dice_size = 0, flat_modifier = 0, roll_overrides = [], generation_origin, random = Math.random, roll_category = ROLL_CATEGORIES.HEALING_DICE }) {
  const count = Math.max(toInteger(dice_count), 0);
  const size = Math.max(toInteger(dice_size), 0);
  const overrides = asArray(roll_overrides);
  if (overrides.length > 0 && ![
    ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE,
    ROLL_GENERATION_ORIGINS.AUTHORIZED_DEVELOPER_OVERRIDE,
  ].includes(generation_origin)) {
    throw frameworkError('Roll overrides require deterministic test or authorized GM/developer origin.', 'ROLL_OVERRIDE_NOT_AUTHORIZED');
  }
  const rolls = [];
  for (let index = 0; index < count; index += 1) {
    const override = overrides[index];
    if (override !== undefined && override !== null) {
      const value = toInteger(override);
      if (value < 1 || value > size) {
        throw frameworkError(`d${size} override must be an integer from 1 to ${size}.`, 'INVALID_ROLL_OVERRIDE');
      }
      rolls.push(value);
    } else {
      rolls.push(Math.floor(random() * size) + 1);
    }
  }
  return {
    roll_category,
    dice_expression: count > 0 ? `${count}d${size}` : '0',
    dice_rolls: rolls,
    flat_modifier: toInteger(flat_modifier),
    total: Math.max(rolls.reduce((sum, value) => sum + value, 0) + toInteger(flat_modifier), 0),
    generation_origin: generation_origin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM,
  };
}

export function previewCombatActionResolution(input = {}) {
  const action = createCombatActionDefinition(input.action ?? input.action_definition ?? input.actionDefinition);
  const resources = input.resources ?? input.resource_states ?? input.resourceStates ?? [];
  const actor = input.actor ?? {};
  const targetValidation = validateTargetPolicy(action, actor, input.target ?? null);
  const actionCostValidations = action.action_level_costs.map((cost) => validateCombatResourceCost(cost, resources, {
    owner_ref: actor.participant_id ?? actor.id,
  }));
  const unavailable = !targetValidation.valid || actionCostValidations.some((entry) => !entry.available && entry.status !== COMBAT_RESOURCE_SPEND_STATUSES.ALREADY_SPENT_FOR_RESOLUTION);

  return {
    contract_version: '6D.4',
    operation_type: 'combat_action_preview',
    mutates_state: false,
    rolls_generated: false,
    action_id: action.action_id,
    action_label: action.player_label,
    timing_category: action.timing_category,
    target_policy: action.target_policy,
    target_required: ![COMBAT_TARGET_POLICIES.NO_TARGET, COMBAT_TARGET_POLICIES.SELF].includes(action.target_policy),
    source_state_version: cleanText(input.source_state_version ?? input.sourceStateVersion) || null,
    preview_identity: cleanText(input.preview_identity ?? input.previewIdentity) || `preview:${action.action_id}`,
    current_legality: unavailable ? 'unavailable' : 'available',
    safe_unavailable_reason: unavailable
      ? (targetValidation.player_safe_message ?? actionCostValidations.find((entry) => entry.player_safe_message)?.player_safe_message ?? 'That option is not available right now.')
      : null,
    visible_resource_costs: action.action_level_costs.map((cost) => ({
      resource_id: cost.resource_id,
      amount: cost.amount,
      tier: cost.tier ?? null,
      visible_label: cost.visible_label,
    })),
    effect_preview: action.effect_steps.map((step) => ({
      step_id: step.step_id,
      effect_type: step.effect_type,
      player_label: step.player_label,
      player_summary: step.player_summary,
      duration: step.duration.duration_kind,
    })),
    known_target_context: targetValidation.valid && targetValidation.target
      ? {
          target_id: targetValidation.target.participant_id ?? targetValidation.target.id,
          display_name: targetValidation.target.display_name ?? targetValidation.target.name ?? null,
          faction: targetValidation.target.faction ?? null,
        }
      : null,
    player_safe_summary: {
      attempted_action: action.player_label,
      expectation: unavailable ? 'Resolve the current issue before using this option.' : 'This preview will not spend resources or roll dice.',
    },
  };
}

function visibleParticipantRef(participant = {}) {
  return {
    participant_id: participant.participant_id ?? participant.id ?? null,
    display_name: participant.display_name ?? participant.name ?? null,
    faction: participant.faction ?? null,
  };
}

function hiddenParticipantStats(participant = {}) {
  return {
    armor_class: participant.armor_class ?? participant.ac ?? null,
    current_hit_points: participant.current_hit_points ?? participant.currentHitPoints ?? participant.current_hp ?? participant.currentHp ?? null,
    max_hit_points: participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp ?? participant.maxHp ?? null,
    temporary_hit_points: participant.temporary_hit_points ?? participant.temporaryHitPoints ?? participant.temporary_hp ?? participant.temporaryHp ?? 0,
    defense_profile: cloneSerializable(participant.defense_profile ?? participant.defenseProfile ?? {}),
  };
}

function currentHp(participant = {}) {
  return toInteger(participant.current_hit_points ?? participant.currentHitPoints ?? participant.current_hp ?? participant.currentHp, 0);
}

function maxHp(participant = {}) {
  return toInteger(participant.max_hit_points ?? participant.maxHitPoints ?? participant.max_hp ?? participant.maxHp, currentHp(participant));
}

function tempHp(participant = {}) {
  return toInteger(participant.temporary_hit_points ?? participant.temporaryHitPoints ?? participant.temporary_hp ?? participant.temporaryHp, 0);
}

function resolveStep(step, state, input) {
  const { action, actor, target, resources, committedResolutionId, resultsByStepId } = state;
  const params = step.params ?? {};
  const generationOrigin = input.generation_origin ?? input.generationOrigin ?? ROLL_GENERATION_ORIGINS.SERVER_RANDOM;
  const rollOverrides = input.roll_overrides?.[step.step_id] ?? input.rollOverrides?.[step.step_id] ?? params.roll_overrides ?? params.rollOverrides ?? null;

  if (!dependencyMet(step, resultsByStepId)) {
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'skipped',
      player_summary: 'That part did not apply.',
    };
  }

  if (step.resource_costs.length > 0) {
    const spend = spendCombatResourceCosts({
      costs: step.resource_costs,
      resources: resourceCollectionToArray(resources),
      committed_resolution_id: committedResolutionId,
      owner_ref: actor.participant_id ?? actor.id,
    });
    for (const resource of spend.resources_after) {
      resources.set(resource.resource_id, createCombatResourceState(resource));
    }
    if (!spend.success) {
      return {
        step_id: step.step_id,
        effect_type: step.effect_type,
        status: 'unavailable',
        player_summary: spend.player_safe_message,
        spend,
      };
    }
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.ATTACK_ROLL) {
    const result = resolveAttackRoll({
      ruleset: action.ruleset,
      target_armor_class: target?.armor_class ?? target?.ac,
      modifiers: params.modifiers ?? [],
      advantage_sources: params.advantage_sources ?? params.advantageSources ?? [],
      disadvantage_sources: params.disadvantage_sources ?? params.disadvantageSources ?? [],
      roll_override: rollOverrides,
      generation_origin: generationOrigin,
      actor_ref: visibleParticipantRef(actor),
      target_ref: visibleParticipantRef(target),
    });
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result,
      was_hit: result.was_hit,
      was_miss: result.was_miss,
      is_critical_hit: result.is_critical_hit,
      player_summary: result.was_hit ? 'The attack connects.' : 'The attack misses.',
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.SAVING_THROW) {
    const result = resolveSavingThrow({
      ruleset: action.ruleset,
      ability: params.ability,
      difficulty_class: params.difficulty_class ?? params.difficultyClass,
      modifiers: params.modifiers ?? target?.saving_throw_modifiers?.[normalizedKey(params.ability)] ?? [],
      advantage_sources: params.advantage_sources ?? [],
      disadvantage_sources: params.disadvantage_sources ?? [],
      roll_override: rollOverrides,
      generation_origin: generationOrigin,
      actor_ref: visibleParticipantRef(target),
    });
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result,
      success: result.success,
      failure: result.failure,
      success_policy: params.success_policy ?? params.successPolicy ?? SAVE_SUCCESS_POLICIES.NO_EFFECT_ON_SUCCESS,
      player_summary: result.success ? 'The save succeeds.' : 'The save fails.',
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.ABILITY_CHECK) {
    const result = resolveAbilityCheck({
      ruleset: action.ruleset,
      ability: params.ability,
      skill: params.skill,
      difficulty_class: params.difficulty_class ?? params.difficultyClass,
      modifiers: params.modifiers ?? [],
      roll_override: rollOverrides,
      generation_origin: generationOrigin,
      actor_ref: visibleParticipantRef(actor),
    });
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result,
      success: result.success,
      failure: result.failure,
      player_summary: result.success ? 'The check succeeds.' : 'The check falls short.',
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.CONTESTED_ABILITY_CHECK) {
    const result = resolveContestedAbilityCheck({
      ruleset: action.ruleset,
      actor_check: params.actor_check ?? params.actorCheck ?? {},
      opponent_check: params.opponent_check ?? params.opponentCheck ?? {},
      actor_roll_override: rollOverrides?.actor,
      opponent_roll_override: rollOverrides?.opponent,
      generation_origin: generationOrigin,
    });
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result,
      contest_outcome: result.contest_outcome,
      player_summary: result.contest_outcome === 'actor_wins' ? 'The contest goes your way.' : 'The contest does not go your way.',
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.DIRECT_DAMAGE) {
    const linkedAttack = params.linked_attack_step_id ? resultsByStepId.get(params.linked_attack_step_id) : null;
    const linkedSave = params.linked_save_step_id ? resultsByStepId.get(params.linked_save_step_id) : null;
    if (linkedAttack && !linkedAttack.was_hit) {
      return {
        step_id: step.step_id,
        effect_type: step.effect_type,
        status: 'skipped',
        player_summary: 'No damage is dealt.',
      };
    }
    const damage = resolveDamage({
      ruleset: action.ruleset,
      components: params.components ?? [],
      defense_profile: target?.defense_profile ?? target?.defenseProfile ?? {},
      is_critical_hit: linkedAttack?.is_critical_hit ?? params.is_critical_hit ?? false,
      roll_overrides: rollOverrides,
      generation_origin: generationOrigin,
      random: input.random,
    });
    const adjusted = linkedSave
      ? applySavingThrowSuccessPolicy({
          save_result: linkedSave.result,
          damage_amount: damage.total_damage,
          success_policy: linkedSave.success_policy,
        })
      : { applied_amount: damage.total_damage, success_policy: null };
    const hp = applyDamageToHitPoints({
      damage_total: adjusted.applied_amount,
      current_hit_points: currentHp(target),
      max_hit_points: maxHp(target),
      temporary_hit_points: tempHp(target),
    });
    state.targetState = {
      ...state.targetState,
      current_hit_points: hp.after.current_hit_points,
      max_hit_points: hp.after.max_hit_points,
      temporary_hit_points: hp.after.temporary_hit_points,
    };
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result: { damage, saving_throw_adjustment: adjusted, hit_point_application: hp },
      mutation_instruction: {
        instruction_type: 'apply_hit_point_damage',
        target: visibleParticipantRef(target),
        damage_total: adjusted.applied_amount,
        after: hp.after,
      },
      player_summary: `${adjusted.applied_amount} damage is applied.`,
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.HEALING) {
    const roll = rollDice({
      dice_count: params.dice_count ?? params.diceCount ?? 0,
      dice_size: params.dice_size ?? params.diceSize ?? 0,
      flat_modifier: params.flat_modifier ?? params.flatModifier ?? params.amount ?? 0,
      roll_overrides: rollOverrides,
      generation_origin: generationOrigin,
      random: input.random,
      roll_category: ROLL_CATEGORIES.HEALING_DICE,
    });
    const before = currentHp(target ?? actor);
    const maximum = maxHp(target ?? actor);
    const after = Math.min(before + roll.total, maximum);
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result: {
        healing_total: roll.total,
        before,
        after,
        max_hit_points: maximum,
        excess_healing_discarded: Math.max(before + roll.total - maximum, 0),
        roll,
      },
      mutation_instruction: {
        instruction_type: 'apply_healing',
        target: visibleParticipantRef(target ?? actor),
        healing_total: roll.total,
        after: {
          current_hit_points: after,
          max_hit_points: maximum,
        },
      },
      player_summary: `${after - before} hit points are restored.`,
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.TEMPORARY_HIT_POINTS) {
    const amount = params.amount !== undefined
      ? Math.max(toInteger(params.amount), 0)
      : rollDice({
          dice_count: params.dice_count ?? 0,
          dice_size: params.dice_size ?? 0,
          flat_modifier: params.flat_modifier ?? 0,
          roll_overrides: rollOverrides,
          generation_origin: generationOrigin,
          random: input.random,
        }).total;
    const before = tempHp(target ?? actor);
    const policy = normalizedKey(params.policy) || TEMPORARY_HIT_POINT_POLICIES.TAKE_HIGHER;
    if (policy === TEMPORARY_HIT_POINT_POLICIES.PLAYER_DECISION_REQUIRED && amount !== before) {
      return {
        step_id: step.step_id,
        effect_type: step.effect_type,
        status: COMBAT_ACTION_RESULT_STATUSES.PLAYER_DECISION_REQUIRED,
        amount,
        current_temporary_hit_points: before,
        player_summary: 'Choose whether to replace your current temporary hit points.',
      };
    }
    const after = policy === TEMPORARY_HIT_POINT_POLICIES.TAKE_NEW
      ? amount
      : policy === TEMPORARY_HIT_POINT_POLICIES.KEEP_CURRENT
        ? before
        : Math.max(before, amount);
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result: { before, amount, after, policy },
      mutation_instruction: {
        instruction_type: 'set_temporary_hit_points',
        target: visibleParticipantRef(target ?? actor),
        temporary_hit_points: after,
      },
      player_summary: `${after} temporary hit points are now in effect.`,
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.APPLY_CONDITION) {
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result: {
        condition_id: cleanText(params.condition_id ?? params.conditionId ?? params.condition),
        duration: step.duration,
        stacking_policy: cleanText(params.stacking_policy ?? params.stackingPolicy) || 'replace_same_source',
      },
      mutation_instruction: {
        instruction_type: 'apply_condition_instruction',
        target: visibleParticipantRef(target),
        condition_id: cleanText(params.condition_id ?? params.conditionId ?? params.condition),
        duration: step.duration,
      },
      player_summary: cleanText(params.player_summary ?? step.player_summary) || 'A condition may apply.',
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.REMOVE_CONDITION) {
    const conditionId = cleanText(params.condition_id ?? params.conditionId ?? params.condition);
    const conditions = asArray((target ?? actor).conditions);
    const found = conditions.some((condition) => cleanText(condition.id ?? condition.condition_id ?? condition.conditionId ?? condition.type) === conditionId);
    if (!found && !params.allow_missing) {
      return {
        step_id: step.step_id,
        effect_type: step.effect_type,
        status: 'unavailable',
        player_summary: 'That condition is not present.',
      };
    }
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result: { condition_id: conditionId, found },
      mutation_instruction: {
        instruction_type: 'remove_condition_instruction',
        target: visibleParticipantRef(target ?? actor),
        condition_id: conditionId,
      },
      player_summary: 'The condition is removed.',
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.RESOURCE_SPEND) {
    const spend = spendCombatResourceCosts({
      costs: params.costs ?? params.resource_costs ?? [],
      resources: resourceCollectionToArray(resources),
      committed_resolution_id: committedResolutionId,
      owner_ref: actor.participant_id ?? actor.id,
    });
    for (const resource of spend.resources_after) {
      resources.set(resource.resource_id, createCombatResourceState(resource));
    }
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: spend.success ? 'resolved' : 'unavailable',
      result: spend,
      player_summary: spend.success ? 'A resource is spent.' : spend.player_safe_message,
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.RESOURCE_RESTORE) {
    const restored = restoreCombatResources({
      resources: resourceCollectionToArray(resources),
      refresh_trigger: params.refresh_trigger ?? COMBAT_RESOURCE_REFRESH_TRIGGERS.EXPLICIT_CHARGE_RESTORE,
      recharge_roll: params.recharge_roll,
    });
    for (const resource of restored) {
      resources.set(resource.resource_id, createCombatResourceState(resource));
    }
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result: { resources_after: restored },
      player_summary: 'A resource is restored.',
    };
  }

  if (step.effect_type === COMBAT_EFFECT_TYPES.CONCENTRATION_START || step.effect_type === COMBAT_EFFECT_TYPES.CONCENTRATION_END) {
    return {
      step_id: step.step_id,
      effect_type: step.effect_type,
      status: 'resolved',
      result: cloneSerializable(params),
      mutation_instruction: {
        instruction_type: step.effect_type,
        actor: visibleParticipantRef(actor),
        target: visibleParticipantRef(target ?? actor),
      },
      player_summary: step.effect_type === COMBAT_EFFECT_TYPES.CONCENTRATION_START
        ? 'Concentration begins.'
        : 'Concentration ends.',
    };
  }

  return {
    step_id: step.step_id,
    effect_type: step.effect_type,
    status: 'resolved',
    result: cloneSerializable(params),
    mutation_instruction: {
      instruction_type: 'record_authored_state_marker',
      marker_id: cleanText(params.marker_id ?? params.markerId ?? step.step_id),
      marker_value: cloneSerializable(params.marker_value ?? params.markerValue ?? true),
    },
    player_summary: cleanText(params.player_summary ?? step.player_summary) || 'The state marker is recorded.',
  };
}

function createPlayerResultBundleFromSteps(action, status, steps) {
  const discoveries = steps
    .filter((step) => [COMBAT_EFFECT_TYPES.SAVING_THROW, COMBAT_EFFECT_TYPES.ABILITY_CHECK, COMBAT_EFFECT_TYPES.CONTESTED_ABILITY_CHECK].includes(step.effect_type))
    .map((step) => step.player_summary)
    .filter(Boolean);
  const progress = steps
    .filter((step) => step.mutation_instruction)
    .map((step) => step.player_summary)
    .filter(Boolean);
  const complications = steps
    .filter((step) => ['skipped', 'unavailable', COMBAT_ACTION_RESULT_STATUSES.PLAYER_DECISION_REQUIRED].includes(step.status))
    .map((step) => step.player_summary)
    .filter(Boolean);

  return {
    bundle_version: '6D.4',
    result: {
      title: action.player_label,
      summary: steps.find((step) => step.status === 'resolved')?.player_summary ?? 'The combat option resolves.',
    },
    consequences: progress,
    discoveries,
    progress,
    complications,
    next: status === COMBAT_ACTION_RESULT_STATUSES.RESOLVED
      ? ['Continue the current combat turn.']
      : ['Review the current combat state before continuing.'],
    status,
  };
}

export function resolveCombatAction(input = {}) {
  if (input.existing_action_result) {
    return {
      ...cloneSerializable(input.existing_action_result),
      status: COMBAT_ACTION_RESULT_STATUSES.DUPLICATE_HANDLED,
      duplicate_of_resolution_id: input.existing_action_result.committed_resolution_id,
    };
  }

  const action = createCombatActionDefinition(input.action ?? input.action_definition ?? input.actionDefinition);
  const actor = input.actor ?? {};
  const targetValidation = validateTargetPolicy(action, actor, input.target ?? null);
  const target = targetValidation.target ?? null;
  const committedResolutionId = cleanText(input.committed_resolution_id ?? input.committedResolutionId) || `resolution:${action.action_id}`;

  if (!isActorValid(actor)) {
    return {
      status: COMBAT_ACTION_RESULT_STATUSES.ACTOR_INVALID,
      committed_resolution_id: committedResolutionId,
      player_safe_message: 'That combatant cannot act right now.',
      player_result_bundle: {
        status: COMBAT_ACTION_RESULT_STATUSES.ACTOR_INVALID,
        recovery: ['Choose a current valid combat option.'],
      },
    };
  }

  if (!targetValidation.valid || !isTargetValid(target)) {
    return {
      status: COMBAT_ACTION_RESULT_STATUSES.TARGET_INVALID,
      committed_resolution_id: committedResolutionId,
      player_safe_message: targetValidation.player_safe_message ?? 'That target is no longer valid.',
      player_result_bundle: {
        status: COMBAT_ACTION_RESULT_STATUSES.TARGET_INVALID,
        recovery: ['Choose a current valid target.'],
      },
    };
  }

  const resources = normalizeResourceCollection(input.resources ?? input.resource_states ?? input.resourceStates);
  const actionSpend = spendCombatResourceCosts({
    costs: action.action_level_costs,
    resources: resourceCollectionToArray(resources),
    committed_resolution_id: committedResolutionId,
    owner_ref: actor.participant_id ?? actor.id,
  });
  for (const resource of actionSpend.resources_after) {
    resources.set(resource.resource_id, createCombatResourceState(resource));
  }
  if (!actionSpend.success && action.action_level_costs.length > 0) {
    return {
      status: COMBAT_ACTION_RESULT_STATUSES.UNAVAILABLE,
      committed_resolution_id: committedResolutionId,
      action_id: action.action_id,
      player_safe_message: actionSpend.player_safe_message,
      resource_spends: actionSpend.spends,
      resources_after: actionSpend.resources_after,
      player_result_bundle: {
        status: COMBAT_ACTION_RESULT_STATUSES.UNAVAILABLE,
        recovery: [actionSpend.player_safe_message],
      },
      gm_dev_trace: {
        trace_kind: 'combat_action_resolution',
        failure_step: 'action_level_cost_validation',
        resource_spends: actionSpend.spends,
      },
    };
  }

  const resultsByStepId = new Map();
  const orderedSteps = [];
  const mutationInstructions = [];
  const state = {
    action,
    actor,
    target,
    targetState: hiddenParticipantStats(target ?? {}),
    resources,
    committedResolutionId,
    resultsByStepId,
  };

  try {
    for (const step of action.effect_steps) {
      if (!isActorValid(actor)) {
        orderedSteps.push({
          step_id: step.step_id,
          effect_type: step.effect_type,
          status: COMBAT_ACTION_RESULT_STATUSES.ACTOR_INVALID,
          player_summary: 'The actor can no longer continue this action.',
        });
        break;
      }
      if (target && !isTargetValid({ ...target, ...state.targetState })) {
        orderedSteps.push({
          step_id: step.step_id,
          effect_type: step.effect_type,
          status: COMBAT_ACTION_RESULT_STATUSES.TARGET_INVALID,
          player_summary: 'The target can no longer be affected.',
        });
        break;
      }
      const stepResult = resolveStep(step, state, input);
      orderedSteps.push(stepResult);
      resultsByStepId.set(step.step_id, stepResult);
      if (stepResult.mutation_instruction) {
        mutationInstructions.push(stepResult.mutation_instruction);
      }
      if ([COMBAT_ACTION_RESULT_STATUSES.PLAYER_DECISION_REQUIRED, 'unavailable'].includes(stepResult.status)) {
        break;
      }
    }
  } catch (error) {
    return {
      status: COMBAT_ACTION_RESULT_STATUSES.RECOVERY_NEEDED,
      committed_resolution_id: committedResolutionId,
      action_id: action.action_id,
      player_safe_message: 'That combat action needs review before it can continue.',
      player_result_bundle: {
        status: COMBAT_ACTION_RESULT_STATUSES.RECOVERY_NEEDED,
        recovery: ['Refresh the combat state or ask the GM to review this action.'],
      },
      gm_dev_trace: {
        trace_kind: 'combat_action_resolution',
        recovery_needed: true,
        error_code: error.code ?? 'COMBAT_ACTION_RESOLUTION_ERROR',
        error_message: error.message,
      },
    };
  }

  const blocking = orderedSteps.find((step) => [
    COMBAT_ACTION_RESULT_STATUSES.PLAYER_DECISION_REQUIRED,
    'unavailable',
    COMBAT_ACTION_RESULT_STATUSES.ACTOR_INVALID,
    COMBAT_ACTION_RESULT_STATUSES.TARGET_INVALID,
  ].includes(step.status));
  const status = blocking
    ? (blocking.status === 'unavailable' ? COMBAT_ACTION_RESULT_STATUSES.UNAVAILABLE : blocking.status)
    : COMBAT_ACTION_RESULT_STATUSES.RESOLVED;
  const resourcesAfter = resourceCollectionToArray(resources);
  const playerResultBundle = createPlayerResultBundleFromSteps(action, status, orderedSteps);

  return {
    contract_version: '6D.4',
    operation_type: 'combat_action_resolution',
    status,
    committed_resolution_id: committedResolutionId,
    action_id: action.action_id,
    ruleset: action.ruleset,
    actor: visibleParticipantRef(actor),
    target: visibleParticipantRef(target ?? actor),
    resource_spends: actionSpend.spends,
    resources_after: resourcesAfter,
    ordered_steps: orderedSteps,
    mutation_instructions: mutationInstructions,
    player_result_bundle: playerResultBundle,
    player_safe_summary: {
      attempted_action: action.player_label,
      result: playerResultBundle.result.summary,
      next: playerResultBundle.next[0],
    },
    gm_dev_trace: {
      trace_kind: 'combat_action_resolution',
      committed_resolution_id: committedResolutionId,
      selected_authored_action: action.action_id,
      selected_effect_steps: action.effect_steps.map((step) => ({ step_id: step.step_id, effect_type: step.effect_type, order: step.order })),
      action_level_costs: action.action_level_costs,
      resource_spends: actionSpend.spends,
      mutation_instructions: mutationInstructions,
      hidden_target_stats_before: hiddenParticipantStats(target ?? {}),
      resources_after: resourcesAfter,
    },
  };
}

export function projectCombatActionResultForPlayer(result = {}) {
  const steps = asArray(result.ordered_steps).map((step) => ({
    step_id: step.step_id,
    effect_type: step.effect_type,
    status: step.status,
    player_summary: step.player_summary,
    was_hit: step.was_hit ?? undefined,
    success: step.success ?? undefined,
  }));
  const projected = {
    contract_version: result.contract_version ?? '6D.4',
    operation_type: result.operation_type,
    status: result.status,
    action_id: result.action_id,
    actor: result.actor,
    target: result.target,
    ordered_steps: steps,
    player_result_bundle: cloneSerializable(result.player_result_bundle),
    player_safe_summary: cloneSerializable(result.player_safe_summary),
    player_safe_message: result.player_safe_message ?? null,
  };
  assertNoCombatActionPlayerHiddenData(projected);
  return projected;
}

export function buildCombatActionGmDevTrace(result = {}) {
  return {
    contract_version: '6D.4',
    trace_kind: 'combat_action_effect_resource_resolution',
    status: result.status,
    committed_resolution_id: result.committed_resolution_id,
    action_id: result.action_id,
    ordered_steps: cloneSerializable(result.ordered_steps ?? []),
    mutation_instructions: cloneSerializable(result.mutation_instructions ?? []),
    resource_spends: cloneSerializable(result.resource_spends ?? []),
    resources_after: cloneSerializable(result.resources_after ?? []),
    gm_dev_trace: cloneSerializable(result.gm_dev_trace ?? null),
  };
}

export function assertNoCombatActionPlayerHiddenData(payload = {}) {
  const serialized = JSON.stringify(payload);
  for (const key of PLAYER_PROHIBITED_KEYS) {
    if (serialized.includes(key)) {
      throw frameworkError(`Player combat action payload contains prohibited key "${key}".`, 'COMBAT_ACTION_PLAYER_VISIBILITY_LEAK');
    }
  }
  return true;
}
