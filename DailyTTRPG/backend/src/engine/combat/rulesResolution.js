import {
  COMBAT_RULESET_SYSTEMS,
  COMBAT_RULESET_VERSIONS,
  DEFAULT_COMBAT_RULESET,
} from '../../services/interactionCore/combatAdapterContract.js';
import { calculateAbilityModifier } from './combatEngine.js';

export const DND5E_2014_RULESET = Object.freeze({
  ruleset_id: DEFAULT_COMBAT_RULESET.ruleset_id,
  system: COMBAT_RULESET_SYSTEMS.DND5E,
  rules_version: COMBAT_RULESET_VERSIONS.DND5E_2014,
});

export const ROLL_CATEGORIES = Object.freeze({
  INITIATIVE: 'initiative',
  ATTACK: 'attack',
  SAVING_THROW: 'saving_throw',
  ABILITY_CHECK: 'ability_check',
  CONTESTED_ABILITY_CHECK: 'contested_ability_check',
  CONCENTRATION_SAVING_THROW: 'concentration_saving_throw',
  DEATH_SAVING_THROW: 'death_saving_throw',
  DAMAGE: 'damage',
  HEALING_DICE: 'healing_dice',
  RECHARGE: 'recharge',
});

export const D20_ROLL_MODES = Object.freeze({
  NORMAL: 'normal',
  ADVANTAGE: 'advantage',
  DISADVANTAGE: 'disadvantage',
});

export const ROLL_GENERATION_ORIGINS = Object.freeze({
  SERVER_RANDOM: 'server_random',
  DETERMINISTIC_TEST_OVERRIDE: 'deterministic_test_override',
  AUTHORIZED_DEVELOPER_OVERRIDE: 'authorized_developer_override',
  REUSED_ROLL_RECORD: 'reused_roll_record',
});

export const DAMAGE_TYPES_2014 = Object.freeze([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

export const SAVE_SUCCESS_POLICIES = Object.freeze({
  FULL_EFFECT_ON_FAILURE: 'full_effect_on_failure',
  HALF_DAMAGE_ON_SUCCESS: 'half_damage_on_success',
  NO_EFFECT_ON_SUCCESS: 'no_effect_on_success',
});

export const CONTESTED_CHECK_OUTCOMES = Object.freeze({
  ACTOR_WINS: 'actor_wins',
  OPPONENT_WINS: 'opponent_wins',
  TIE_STATUS_QUO: 'tie_status_quo',
});

const PLAYER_PROHIBITED_RULES_KEYS = Object.freeze([
  'target_armor_class',
  'targetArmorClass',
  'difficulty_class',
  'difficultyClass',
  'hidden_dc',
  'hiddenDc',
  'gm_dev_detail',
  'gmDevDetail',
  'trace',
  'calculation_trace',
  'calculationTrace',
  'roll_record',
  'rollRecord',
  'roll_override',
  'rollOverride',
  'override_controls',
  'overrideControls',
  'defense_profile',
  'defenseProfile',
  'mutation_plan',
  'mutationPlan',
  'database_writes',
  'databaseWrites',
  'source_path',
  'sourcePath',
]);

let generatedRollSequence = 0;

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizedKey(value) {
  return cleanText(value).toLowerCase();
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

function rulesError(message, code = 'COMBAT_RULES_VALIDATION_FAILED') {
  const error = new Error(message);
  error.code = code;
  error.player_safe_message = 'That combat calculation cannot be resolved yet.';
  return error;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function nextRollId(category) {
  generatedRollSequence += 1;
  return `roll:${category}:${generatedRollSequence}`;
}

function normalizeRulesetIdentity(input = {}, options = {}) {
  const source = input.ruleset ?? input.ruleset_identity ?? input.rulesetIdentity ?? input;
  const system = normalizedKey(source.system ?? source.ruleset_system ?? source.rulesetSystem);
  const rulesVersion = cleanText(source.rules_version ?? source.rulesVersion ?? source.version);
  const requireExplicit = options.requireExplicit ?? true;

  if (requireExplicit && (!system || !rulesVersion)) {
    throw rulesError('Combat rules resolution requires an explicit ruleset system and rules version.', 'COMBAT_RULESET_REQUIRED');
  }

  const normalized = {
    ruleset_id: cleanText(source.ruleset_id ?? source.rulesetId) || `${system}-${rulesVersion}`,
    system,
    rules_version: rulesVersion,
  };

  if (
    normalized.system !== COMBAT_RULESET_SYSTEMS.DND5E ||
    normalized.rules_version !== COMBAT_RULESET_VERSIONS.DND5E_2014
  ) {
    throw rulesError(
      `Unsupported combat ruleset ${normalized.system || '(missing)'}/${normalized.rules_version || '(missing)'}.`,
      'UNSUPPORTED_COMBAT_RULESET'
    );
  }

  return normalized;
}

function normalizeModifier(modifier, index = 0) {
  if (typeof modifier === 'number') {
    return {
      source_id: `modifier:${index + 1}`,
      source_type: 'untyped',
      player_label: null,
      internal_label: null,
      value: modifier,
      visibility: 'player_safe',
      source_entity: null,
      effect_ref: null,
    };
  }

  const source = modifier && typeof modifier === 'object' ? modifier : {};
  return {
    source_id: cleanText(source.source_id ?? source.sourceId) || `modifier:${index + 1}`,
    source_type: cleanText(source.source_type ?? source.sourceType) || 'untyped',
    player_label: cleanText(source.player_label ?? source.playerLabel) || null,
    internal_label: cleanText(source.internal_label ?? source.internalLabel) || null,
    value: toNumber(source.value ?? source.modifier ?? source.bonus, 0),
    visibility: cleanText(source.visibility) || 'player_safe',
    source_entity: cloneSerializable(source.source_entity ?? source.sourceEntity ?? null),
    effect_ref: cloneSerializable(source.effect_ref ?? source.effectRef ?? null),
  };
}

function normalizeModifiers(modifiers = []) {
  return normalizeArray(modifiers).map((modifier, index) => normalizeModifier(modifier, index));
}

function sumModifiers(modifiers = []) {
  return normalizeModifiers(modifiers).reduce((sum, modifier) => sum + modifier.value, 0);
}

function normalizeRollOrigin(origin) {
  const normalized = normalizedKey(origin);
  return Object.values(ROLL_GENERATION_ORIGINS).includes(normalized)
    ? normalized
    : ROLL_GENERATION_ORIGINS.SERVER_RANDOM;
}

function validateRollOverrideAllowed(override, origin) {
  if (override === undefined || override === null) {
    return;
  }

  if (
    origin !== ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE &&
    origin !== ROLL_GENERATION_ORIGINS.AUTHORIZED_DEVELOPER_OVERRIDE
  ) {
    throw rulesError(
      'Roll overrides require deterministic test or authorized GM/developer origin.',
      'ROLL_OVERRIDE_NOT_AUTHORIZED'
    );
  }
}

function normalizeRollOverrides(override) {
  if (override === undefined || override === null) {
    return [];
  }
  return Array.isArray(override) ? override : [override];
}

function rollDie({ dieSize, override, random = Math.random }) {
  const size = toInteger(dieSize);
  if (size < 2) {
    throw rulesError(`Invalid die size d${dieSize}.`, 'INVALID_DIE_SIZE');
  }

  if (override !== undefined && override !== null) {
    const value = toInteger(override);
    if (value < 1 || value > size) {
      throw rulesError(`d${size} override must be an integer from 1 to ${size}.`, 'INVALID_ROLL_OVERRIDE');
    }
    return value;
  }

  return Math.floor(random() * size) + 1;
}

function buildRollRecord({
  ruleset,
  rollId,
  rollCategory,
  diceExpression,
  diceDefinition,
  rawDieResults,
  selectedDieResults,
  discardedDieResults = [],
  advantageSources = [],
  disadvantageSources = [],
  effectiveRollMode = D20_ROLL_MODES.NORMAL,
  rollModeCanceled = false,
  modifiers = [],
  naturalDieResult = null,
  finalTotal,
  context = {},
  generationOrigin,
  reusedFromRollId = null,
  originalGenerationOrigin = null,
}) {
  const normalizedModifiers = normalizeModifiers(modifiers);
  const record = {
    roll_id: cleanText(rollId) || nextRollId(rollCategory),
    ruleset_id: ruleset.ruleset_id,
    rules_version: ruleset.rules_version,
    roll_category: rollCategory,
    dice_expression: diceExpression,
    dice_definition: cloneSerializable(diceDefinition),
    raw_die_results: rawDieResults.map(Number),
    selected_die_results: selectedDieResults.map(Number),
    discarded_die_results: discardedDieResults.map(Number),
    advantage_sources: normalizeArray(advantageSources).map(String),
    disadvantage_sources: normalizeArray(disadvantageSources).map(String),
    effective_roll_mode: effectiveRollMode,
    roll_mode_canceled: Boolean(rollModeCanceled),
    modifiers: normalizedModifiers,
    modifier_total: normalizedModifiers.reduce((sum, modifier) => sum + modifier.value, 0),
    natural_die_result: naturalDieResult === null ? null : Number(naturalDieResult),
    final_total: Number(finalTotal),
    actor_ref: cloneSerializable(context.actor_ref ?? context.actorRef ?? null),
    target_ref: cloneSerializable(context.target_ref ?? context.targetRef ?? null),
    source_ref: cloneSerializable(context.source_ref ?? context.sourceRef ?? null),
    effect_step_ref: cloneSerializable(context.effect_step_ref ?? context.effectStepRef ?? null),
    parent_resolution_ref: cloneSerializable(context.parent_resolution_ref ?? context.parentResolutionRef ?? null),
    roll_sequence: context.roll_sequence ?? context.rollSequence ?? null,
    generation_origin: generationOrigin,
    reused_from_roll_id: reusedFromRollId,
    original_generation_origin: originalGenerationOrigin,
    finalized: true,
  };

  return deepFreeze(record);
}

function normalizeExistingRollRecord(existingRollRecord, ruleset) {
  if (!existingRollRecord || typeof existingRollRecord !== 'object') {
    return null;
  }

  if (existingRollRecord.finalized === false) {
    throw rulesError('Cannot reuse an unfinished roll record.', 'ROLL_RECORD_NOT_FINALIZED');
  }

  const recordRuleset = {
    ruleset_id: cleanText(existingRollRecord.ruleset_id) || ruleset.ruleset_id,
    system: ruleset.system,
    rules_version: cleanText(existingRollRecord.rules_version) || ruleset.rules_version,
  };
  if (recordRuleset.rules_version !== ruleset.rules_version) {
    throw rulesError('Existing roll record rules version does not match the requested ruleset.', 'ROLL_RECORD_RULESET_MISMATCH');
  }

  return buildRollRecord({
    ruleset,
    rollId: cleanText(existingRollRecord.roll_id) || nextRollId(existingRollRecord.roll_category ?? ROLL_CATEGORIES.ATTACK),
    rollCategory: existingRollRecord.roll_category ?? ROLL_CATEGORIES.ATTACK,
    diceExpression: existingRollRecord.dice_expression,
    diceDefinition: existingRollRecord.dice_definition,
    rawDieResults: normalizeArray(existingRollRecord.raw_die_results),
    selectedDieResults: normalizeArray(existingRollRecord.selected_die_results),
    discardedDieResults: normalizeArray(existingRollRecord.discarded_die_results),
    advantageSources: normalizeArray(existingRollRecord.advantage_sources),
    disadvantageSources: normalizeArray(existingRollRecord.disadvantage_sources),
    effectiveRollMode: existingRollRecord.effective_roll_mode ?? D20_ROLL_MODES.NORMAL,
    rollModeCanceled: Boolean(existingRollRecord.roll_mode_canceled),
    modifiers: normalizeArray(existingRollRecord.modifiers),
    naturalDieResult: existingRollRecord.natural_die_result ?? null,
    finalTotal: existingRollRecord.final_total,
    context: {
      actor_ref: existingRollRecord.actor_ref,
      target_ref: existingRollRecord.target_ref,
      source_ref: existingRollRecord.source_ref,
      effect_step_ref: existingRollRecord.effect_step_ref,
      parent_resolution_ref: existingRollRecord.parent_resolution_ref,
      roll_sequence: existingRollRecord.roll_sequence,
    },
    generationOrigin: ROLL_GENERATION_ORIGINS.REUSED_ROLL_RECORD,
    reusedFromRollId: existingRollRecord.roll_id ?? null,
    originalGenerationOrigin: existingRollRecord.generation_origin ?? null,
  });
}

function determineD20Mode(advantageSources = [], disadvantageSources = []) {
  const advantage = normalizeArray(advantageSources).filter(Boolean);
  const disadvantage = normalizeArray(disadvantageSources).filter(Boolean);

  if (advantage.length > 0 && disadvantage.length > 0) {
    return {
      effectiveRollMode: D20_ROLL_MODES.NORMAL,
      rollModeCanceled: true,
      diceCount: 1,
      advantageSources: advantage,
      disadvantageSources: disadvantage,
    };
  }

  if (advantage.length > 0) {
    return {
      effectiveRollMode: D20_ROLL_MODES.ADVANTAGE,
      rollModeCanceled: false,
      diceCount: 2,
      advantageSources: advantage,
      disadvantageSources: disadvantage,
    };
  }

  if (disadvantage.length > 0) {
    return {
      effectiveRollMode: D20_ROLL_MODES.DISADVANTAGE,
      rollModeCanceled: false,
      diceCount: 2,
      advantageSources: advantage,
      disadvantageSources: disadvantage,
    };
  }

  return {
    effectiveRollMode: D20_ROLL_MODES.NORMAL,
    rollModeCanceled: false,
    diceCount: 1,
    advantageSources: advantage,
    disadvantageSources: disadvantage,
  };
}

export function resolveRulesetIdentity(input = {}) {
  return normalizeRulesetIdentity(input, { requireExplicit: true });
}

export function generateD20Roll(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  const reused = normalizeExistingRollRecord(input.existing_roll_record ?? input.existingRollRecord, ruleset);
  if (reused) {
    return reused;
  }

  const origin = normalizeRollOrigin(input.generation_origin ?? input.generationOrigin);
  validateRollOverrideAllowed(input.roll_override ?? input.rollOverride, origin);

  const modifiers = normalizeModifiers(input.modifiers);
  const modifierTotal = sumModifiers(modifiers);
  const mode = determineD20Mode(input.advantage_sources ?? input.advantageSources, input.disadvantage_sources ?? input.disadvantageSources);
  const overrides = normalizeRollOverrides(input.roll_override ?? input.rollOverride);
  const rawResults = [];

  for (let index = 0; index < mode.diceCount; index += 1) {
    rawResults.push(rollDie({
      dieSize: 20,
      override: overrides[index],
      random: input.random ?? Math.random,
    }));
  }

  let selected = rawResults[0];
  let selectedIndex = 0;
  if (mode.effectiveRollMode === D20_ROLL_MODES.ADVANTAGE) {
    selected = Math.max(...rawResults);
    selectedIndex = rawResults.findIndex((value) => value === selected);
  }
  if (mode.effectiveRollMode === D20_ROLL_MODES.DISADVANTAGE) {
    selected = Math.min(...rawResults);
    selectedIndex = rawResults.findIndex((value) => value === selected);
  }

  const discarded = rawResults.filter((value, index) => index !== selectedIndex);
  return buildRollRecord({
    ruleset,
    rollId: input.roll_id ?? input.rollId,
    rollCategory: input.roll_category ?? input.rollCategory ?? ROLL_CATEGORIES.ATTACK,
    diceExpression: mode.diceCount === 1 ? '1d20' : '2d20',
    diceDefinition: { dice_count: mode.diceCount, dice_size: 20 },
    rawDieResults: rawResults,
    selectedDieResults: [selected],
    discardedDieResults: discarded,
    advantageSources: mode.advantageSources,
    disadvantageSources: mode.disadvantageSources,
    effectiveRollMode: mode.effectiveRollMode,
    rollModeCanceled: mode.rollModeCanceled,
    modifiers,
    naturalDieResult: selected,
    finalTotal: selected + modifierTotal,
    context: input.context ?? {},
    generationOrigin: origin,
  });
}

export function resolveAttackRoll(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  const modifiers = normalizeModifiers(input.modifiers);
  const rollRecord = generateD20Roll({
    ruleset,
    roll_id: input.roll_id ?? input.rollId,
    roll_category: ROLL_CATEGORIES.ATTACK,
    modifiers,
    advantage_sources: input.advantage_sources ?? input.advantageSources,
    disadvantage_sources: input.disadvantage_sources ?? input.disadvantageSources,
    roll_override: input.roll_override ?? input.rollOverride,
    generation_origin: input.generation_origin ?? input.generationOrigin,
    existing_roll_record: input.existing_roll_record ?? input.existingRollRecord,
    random: input.random,
    context: {
      actor_ref: input.actor_ref ?? input.actorRef ?? input.actor,
      target_ref: input.target_ref ?? input.targetRef ?? input.target,
      source_ref: input.source_action_ref ?? input.sourceActionRef ?? input.source_action ?? input.sourceAction,
      parent_resolution_ref: input.parent_resolution_ref ?? input.parentResolutionRef,
    },
  });

  const targetArmorClass = toNumber(input.target_armor_class ?? input.targetArmorClass);
  const natural = rollRecord.natural_die_result;
  const isNaturalOne = natural === 1;
  const isNaturalTwenty = natural === 20;
  const isCriticalHit = isNaturalTwenty;
  const wasHit = isNaturalTwenty ? true : isNaturalOne ? false : rollRecord.final_total >= targetArmorClass;
  const automaticResult = isNaturalTwenty ? 'natural_twenty_critical_hit' : isNaturalOne ? 'natural_one_automatic_miss' : null;

  const result = {
    ruleset,
    operation_type: 'attack_roll',
    roll_record: rollRecord,
    final_total: rollRecord.final_total,
    target_armor_class: targetArmorClass,
    was_hit: wasHit,
    was_miss: !wasHit,
    is_critical_hit: isCriticalHit,
    automatic_result: automaticResult,
    applied_modifiers: rollRecord.modifiers,
    player_summary: {
      roll_type: 'attack',
      final_total: rollRecord.final_total,
      effective_roll_mode: rollRecord.effective_roll_mode,
      hit: wasHit,
      miss: !wasHit,
      critical_hit: isCriticalHit,
      automatic_result: automaticResult,
    },
    gm_dev_detail: {
      target_armor_class: targetArmorClass,
      natural_die_result: natural,
      modifier_total: rollRecord.modifier_total,
      applied_modifiers: rollRecord.modifiers,
    },
  };

  result.trace = buildTrace(result);
  return result;
}

export function resolveSavingThrow(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  const modifiers = normalizeModifiers(input.modifiers);
  const rollRecord = generateD20Roll({
    ruleset,
    roll_id: input.roll_id ?? input.rollId,
    roll_category: input.roll_category ?? input.rollCategory ?? ROLL_CATEGORIES.SAVING_THROW,
    modifiers,
    advantage_sources: input.advantage_sources ?? input.advantageSources,
    disadvantage_sources: input.disadvantage_sources ?? input.disadvantageSources,
    roll_override: input.roll_override ?? input.rollOverride,
    generation_origin: input.generation_origin ?? input.generationOrigin,
    existing_roll_record: input.existing_roll_record ?? input.existingRollRecord,
    random: input.random,
    context: {
      actor_ref: input.actor_ref ?? input.actorRef ?? input.actor,
      source_ref: input.source_ref ?? input.sourceRef,
      parent_resolution_ref: input.parent_resolution_ref ?? input.parentResolutionRef,
    },
  });
  const difficultyClass = toNumber(input.difficulty_class ?? input.difficultyClass);
  const success = rollRecord.final_total >= difficultyClass;

  const result = {
    ruleset,
    operation_type: 'saving_throw',
    ability: cleanText(input.ability).toUpperCase(),
    roll_record: rollRecord,
    final_total: rollRecord.final_total,
    difficulty_class: difficultyClass,
    success,
    failure: !success,
    applied_modifiers: rollRecord.modifiers,
    player_summary: {
      roll_type: 'saving_throw',
      ability: cleanText(input.ability).toUpperCase(),
      final_total: rollRecord.final_total,
      effective_roll_mode: rollRecord.effective_roll_mode,
      success,
      failure: !success,
    },
    gm_dev_detail: {
      difficulty_class: difficultyClass,
      natural_die_result: rollRecord.natural_die_result,
      modifier_total: rollRecord.modifier_total,
      applied_modifiers: rollRecord.modifiers,
    },
  };

  result.trace = buildTrace(result);
  return result;
}

export function applySavingThrowSuccessPolicy(input = {}) {
  const saveResult = input.save_result ?? input.saveResult;
  const success = Boolean(saveResult?.success ?? input.success);
  const amount = Math.max(toNumber(input.amount ?? input.damage_amount ?? input.damageAmount), 0);
  const policy = normalizedKey(input.success_policy ?? input.successPolicy);
  if (!Object.values(SAVE_SUCCESS_POLICIES).includes(policy)) {
    throw rulesError(`Unsupported saving throw success policy ${policy}.`, 'UNSUPPORTED_SAVE_POLICY');
  }

  let appliedAmount = amount;
  if (success && policy === SAVE_SUCCESS_POLICIES.HALF_DAMAGE_ON_SUCCESS) {
    appliedAmount = Math.floor(amount / 2);
  } else if (success) {
    appliedAmount = 0;
  }

  return {
    operation_type: 'saving_throw_success_policy',
    policy,
    save_success: success,
    original_amount: amount,
    applied_amount: appliedAmount,
    prevented_amount: amount - appliedAmount,
    rounding: success && policy === SAVE_SUCCESS_POLICIES.HALF_DAMAGE_ON_SUCCESS ? 'round_down' : null,
    trace: {
      policy,
      save_success: success,
      original_amount: amount,
      applied_amount: appliedAmount,
    },
    player_summary: {
      amount_applied: appliedAmount,
      amount_prevented: amount - appliedAmount,
    },
  };
}

export function resolveAbilityCheck(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  const modifiers = normalizeModifiers(input.modifiers);
  const rollRecord = generateD20Roll({
    ruleset,
    roll_id: input.roll_id ?? input.rollId,
    roll_category: input.roll_category ?? input.rollCategory ?? ROLL_CATEGORIES.ABILITY_CHECK,
    modifiers,
    advantage_sources: input.advantage_sources ?? input.advantageSources,
    disadvantage_sources: input.disadvantage_sources ?? input.disadvantageSources,
    roll_override: input.roll_override ?? input.rollOverride,
    generation_origin: input.generation_origin ?? input.generationOrigin,
    existing_roll_record: input.existing_roll_record ?? input.existingRollRecord,
    random: input.random,
    context: {
      actor_ref: input.actor_ref ?? input.actorRef ?? input.actor,
      source_ref: input.source_ref ?? input.sourceRef,
      parent_resolution_ref: input.parent_resolution_ref ?? input.parentResolutionRef,
    },
  });
  const hasDifficultyClass = input.difficulty_class !== undefined || input.difficultyClass !== undefined;
  const difficultyClass = hasDifficultyClass ? toNumber(input.difficulty_class ?? input.difficultyClass) : null;
  const success = hasDifficultyClass ? rollRecord.final_total >= difficultyClass : null;

  const result = {
    ruleset,
    operation_type: 'ability_check',
    ability: cleanText(input.ability).toUpperCase(),
    roll_record: rollRecord,
    final_total: rollRecord.final_total,
    difficulty_class: difficultyClass,
    success,
    failure: success === null ? null : !success,
    applied_modifiers: rollRecord.modifiers,
    player_summary: {
      roll_type: 'ability_check',
      ability: cleanText(input.ability).toUpperCase(),
      final_total: rollRecord.final_total,
      effective_roll_mode: rollRecord.effective_roll_mode,
      success,
      failure: success === null ? null : !success,
    },
    gm_dev_detail: {
      difficulty_class: difficultyClass,
      natural_die_result: rollRecord.natural_die_result,
      modifier_total: rollRecord.modifier_total,
      applied_modifiers: rollRecord.modifiers,
    },
  };

  result.trace = buildTrace(result);
  return result;
}

export function resolveContestedAbilityCheck(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  const actorCheck =
    input.actor_check_result ??
    input.actorCheckResult ??
    resolveAbilityCheck({
      ...input.actor_check,
      ...input.actorCheck,
      ruleset,
      roll_category: ROLL_CATEGORIES.CONTESTED_ABILITY_CHECK,
    });
  const opponentCheck =
    input.opponent_check_result ??
    input.opponentCheckResult ??
    resolveAbilityCheck({
      ...input.opponent_check,
      ...input.opponentCheck,
      ruleset,
      roll_category: ROLL_CATEGORIES.CONTESTED_ABILITY_CHECK,
    });

  let outcome = CONTESTED_CHECK_OUTCOMES.TIE_STATUS_QUO;
  if (actorCheck.final_total > opponentCheck.final_total) {
    outcome = CONTESTED_CHECK_OUTCOMES.ACTOR_WINS;
  } else if (opponentCheck.final_total > actorCheck.final_total) {
    outcome = CONTESTED_CHECK_OUTCOMES.OPPONENT_WINS;
  }

  return {
    ruleset,
    operation_type: 'contested_ability_check',
    actor_check: actorCheck,
    opponent_check: opponentCheck,
    outcome,
    winner: outcome === CONTESTED_CHECK_OUTCOMES.ACTOR_WINS ? 'actor' : outcome === CONTESTED_CHECK_OUTCOMES.OPPONENT_WINS ? 'opponent' : null,
    loser: outcome === CONTESTED_CHECK_OUTCOMES.ACTOR_WINS ? 'opponent' : outcome === CONTESTED_CHECK_OUTCOMES.OPPONENT_WINS ? 'actor' : null,
    player_summary: {
      roll_type: 'contested_ability_check',
      actor_total: actorCheck.final_total,
      opponent_total: opponentCheck.final_total,
      outcome,
    },
    trace: {
      operation_type: 'contested_ability_check',
      actor_total: actorCheck.final_total,
      opponent_total: opponentCheck.final_total,
      outcome,
      actor_trace: actorCheck.trace,
      opponent_trace: opponentCheck.trace,
    },
  };
}

export function normalizeDamageType(input, rulesetInput = DND5E_2014_RULESET) {
  normalizeRulesetIdentity(rulesetInput, { requireExplicit: true });
  const damageType = normalizedKey(input);
  if (damageType === 'healing') {
    throw rulesError('Healing is not a damage type.', 'HEALING_IS_NOT_DAMAGE');
  }
  if (!DAMAGE_TYPES_2014.includes(damageType)) {
    throw rulesError(`Unsupported damage type ${input}.`, 'UNSUPPORTED_DAMAGE_TYPE');
  }
  return damageType;
}

function normalizeDamageComponent(component = {}, index = 0, ruleset = DND5E_2014_RULESET) {
  const dice = component.dice && typeof component.dice === 'object' ? component.dice : {};
  const diceCount = toInteger(component.dice_count ?? component.diceCount ?? dice.count ?? dice.dice_count ?? dice.diceCount, 0);
  const diceSize = toInteger(component.dice_size ?? component.diceSize ?? dice.size ?? dice.dice_size ?? dice.diceSize, 0);
  const flatModifier = toNumber(component.flat_modifier ?? component.flatModifier ?? component.modifier ?? 0);
  const modifiers = normalizeModifiers(component.modifiers ?? []);
  const criticalEligible = component.critical_eligible ?? component.criticalEligible;
  return {
    component_id: cleanText(component.component_id ?? component.componentId) || `component:${index + 1}`,
    component_order: index + 1,
    damage_type: normalizeDamageType(component.damage_type ?? component.damageType, ruleset),
    dice_count: diceCount,
    dice_size: diceSize,
    flat_modifier: flatModifier,
    modifiers,
    modifier_total: modifiers.reduce((sum, modifier) => sum + modifier.value, 0),
    critical_eligible: criticalEligible === undefined ? diceCount > 0 : Boolean(criticalEligible),
    source_ref: cloneSerializable(component.source_ref ?? component.sourceRef ?? null),
    effect_step_ref: cloneSerializable(component.effect_step_ref ?? component.effectStepRef ?? null),
  };
}

function normalizeComponentOverrides(rollOverrides, index) {
  if (!Array.isArray(rollOverrides)) {
    return [];
  }

  if (Array.isArray(rollOverrides[index])) {
    return rollOverrides[index];
  }

  if (index === 0 && rollOverrides.every((value) => Number.isInteger(Number(value)))) {
    return rollOverrides;
  }

  return [];
}

function normalizeDefenseEntries(value, ruleset) {
  const entries = normalizeArray(value);
  const map = new Map();
  for (const entry of entries) {
    const damageType = normalizeDamageType(
      typeof entry === 'string' ? entry : entry.damage_type ?? entry.damageType ?? entry.type,
      ruleset
    );
    if (!map.has(damageType)) {
      map.set(damageType, []);
    }
    map.get(damageType).push(
      typeof entry === 'string'
        ? { damage_type: damageType, source_id: damageType, label: damageType }
        : {
            damage_type: damageType,
            source_id: cleanText(entry.source_id ?? entry.sourceId) || damageType,
            label: cleanText(entry.label ?? entry.name) || damageType,
            source_ref: cloneSerializable(entry.source_ref ?? entry.sourceRef ?? null),
          }
    );
  }
  return map;
}

function normalizeDefenseProfile(profile = {}, ruleset) {
  return {
    immunities: normalizeDefenseEntries(profile.immunities ?? profile.damage_immunities ?? profile.damageImmunities, ruleset),
    resistances: normalizeDefenseEntries(profile.resistances ?? profile.damage_resistances ?? profile.damageResistances, ruleset),
    vulnerabilities: normalizeDefenseEntries(profile.vulnerabilities ?? profile.damage_vulnerabilities ?? profile.damageVulnerabilities, ruleset),
  };
}

function applyDefensesToComponent(component, defenseProfile) {
  let current = Math.max(component.pre_defense_subtotal, 0);
  const applications = [];
  const type = component.damage_type;

  if (defenseProfile.immunities.has(type)) {
    applications.push({
      defense: 'immunity',
      damage_type: type,
      before: current,
      after: 0,
      sources: defenseProfile.immunities.get(type),
    });
    return {
      ...component,
      defense_applications: applications,
      post_defense_subtotal: 0,
    };
  }

  if (defenseProfile.resistances.has(type)) {
    const before = current;
    current = Math.floor(current / 2);
    applications.push({
      defense: 'resistance',
      damage_type: type,
      before,
      after: current,
      rounding: 'round_down',
      sources: defenseProfile.resistances.get(type),
    });
  }

  if (defenseProfile.vulnerabilities.has(type)) {
    const before = current;
    current *= 2;
    applications.push({
      defense: 'vulnerability',
      damage_type: type,
      before,
      after: current,
      sources: defenseProfile.vulnerabilities.get(type),
    });
  }

  return {
    ...component,
    defense_applications: applications,
    post_defense_subtotal: current,
  };
}

export function resolveDamage(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  const origin = normalizeRollOrigin(input.generation_origin ?? input.generationOrigin);
  validateRollOverrideAllowed(input.roll_overrides ?? input.rollOverrides, origin);

  const defenseProfile = normalizeDefenseProfile(input.defense_profile ?? input.defenseProfile ?? {}, ruleset);
  const components = normalizeArray(input.components).map((entry, index) => {
    const normalized = normalizeDamageComponent(entry, index, ruleset);
    const doublesDice = Boolean(input.is_critical_hit ?? input.isCriticalHit) && normalized.critical_eligible;
    const effectiveDiceCount = doublesDice ? normalized.dice_count * 2 : normalized.dice_count;
    const overrides = normalizeComponentOverrides(input.roll_overrides ?? input.rollOverrides, index);
    const rolls = [];

    for (let rollIndex = 0; rollIndex < effectiveDiceCount; rollIndex += 1) {
      rolls.push(rollDie({
        dieSize: normalized.dice_size,
        override: overrides[rollIndex],
        random: input.random ?? Math.random,
      }));
    }

    const rollRecord = effectiveDiceCount > 0
      ? buildRollRecord({
          ruleset,
          rollId: cleanText(entry.roll_id ?? entry.rollId) || `${cleanText(input.roll_id ?? input.rollId) || 'damage'}:${index + 1}`,
          rollCategory: ROLL_CATEGORIES.DAMAGE,
          diceExpression: `${effectiveDiceCount}d${normalized.dice_size}`,
          diceDefinition: { dice_count: effectiveDiceCount, dice_size: normalized.dice_size },
          rawDieResults: rolls,
          selectedDieResults: rolls,
          discardedDieResults: [],
          modifiers: [],
          naturalDieResult: null,
          finalTotal: rolls.reduce((sum, value) => sum + value, 0),
          context: {
            source_ref: normalized.source_ref,
            effect_step_ref: normalized.effect_step_ref,
            roll_sequence: index + 1,
          },
          generationOrigin: origin,
        })
      : null;

    const diceTotal = rolls.reduce((sum, value) => sum + value, 0);
    const preDefenseSubtotal = Math.max(diceTotal + normalized.flat_modifier + normalized.modifier_total, 0);
    return applyDefensesToComponent({
      ...normalized,
      dice_rolls: rolls,
      roll_record: rollRecord,
      dice_total: diceTotal,
      critical_expansion: {
        original_dice_count: normalized.dice_count,
        dice_size: normalized.dice_size,
        effective_dice_count: effectiveDiceCount,
        doubled_for_critical: doublesDice,
      },
      pre_defense_subtotal: preDefenseSubtotal,
    }, defenseProfile);
  });

  const totalDamage = components.reduce((sum, component) => sum + component.post_defense_subtotal, 0);
  const damageTypes = [...new Set(components.map((component) => component.damage_type))];
  const result = {
    ruleset,
    operation_type: 'damage_resolution',
    is_critical_hit: Boolean(input.is_critical_hit ?? input.isCriticalHit),
    components,
    total_damage: totalDamage,
    damage_types: damageTypes,
    player_summary: {
      damage_total: totalDamage,
      damage_types: damageTypes,
      resisted_damage_types: components
        .filter((component) => component.defense_applications.some((entry) => entry.defense === 'resistance'))
        .map((component) => component.damage_type),
      vulnerable_damage_types: components
        .filter((component) => component.defense_applications.some((entry) => entry.defense === 'vulnerability'))
        .map((component) => component.damage_type),
      immune_damage_types: components
        .filter((component) => component.defense_applications.some((entry) => entry.defense === 'immunity'))
        .map((component) => component.damage_type),
    },
  };

  result.trace = buildTrace(result);
  return result;
}

export function applyDamageToHitPoints(input = {}) {
  const damageTotal = Math.max(toNumber(input.damage_total ?? input.damageTotal), 0);
  const currentBefore = Math.max(toNumber(input.current_hit_points ?? input.currentHitPoints ?? input.current_hp ?? input.currentHp), 0);
  const temporaryBefore = Math.max(toNumber(input.temporary_hit_points ?? input.temporaryHitPoints ?? input.temporary_hp ?? input.temporaryHp), 0);
  const maxHitPoints = Math.max(toNumber(input.max_hit_points ?? input.maxHitPoints ?? input.max_hp ?? input.maxHp, currentBefore), 0);
  const absorbedByTemporary = Math.min(temporaryBefore, damageTotal);
  const damageAfterTemporary = Math.max(damageTotal - absorbedByTemporary, 0);
  const temporaryAfter = Math.max(temporaryBefore - damageTotal, 0);
  const currentAfter = Math.max(currentBefore - damageAfterTemporary, 0);

  const result = {
    operation_type: 'hit_point_damage_application',
    damage_total: damageTotal,
    before: {
      current_hit_points: currentBefore,
      max_hit_points: maxHitPoints,
      temporary_hit_points: temporaryBefore,
    },
    temporary_hit_points_absorbed: absorbedByTemporary,
    damage_taken_after_temporary_hit_points: damageAfterTemporary,
    current_hit_points_lost: currentBefore - currentAfter,
    after: {
      current_hit_points: currentAfter,
      max_hit_points: maxHitPoints,
      temporary_hit_points: temporaryAfter,
    },
    reached_zero_hit_points: currentBefore > 0 && currentAfter <= 0,
    is_defeated: currentAfter <= 0,
  };

  result.trace = buildTrace(result);
  result.player_summary = {
    damage_total: damageTotal,
    temporary_hit_points_absorbed: absorbedByTemporary,
    damage_taken_after_temporary_hit_points: damageAfterTemporary,
    current_hit_points: currentAfter,
    reached_zero_hit_points: result.reached_zero_hit_points,
  };
  return result;
}

function buildTrace(result) {
  return {
    ruleset: cloneSerializable(result.ruleset ?? null),
    operation_type: result.operation_type,
    roll_record: cloneSerializable(result.roll_record ?? null),
    roll_records: cloneSerializable(
      result.components
        ? result.components.map((component) => component.roll_record).filter(Boolean)
        : result.roll_record
          ? [result.roll_record]
          : []
    ),
    final_total: result.final_total ?? result.total_damage ?? result.damage_total ?? null,
    target_armor_class: result.target_armor_class ?? null,
    difficulty_class: result.difficulty_class ?? null,
    outcome: {
      was_hit: result.was_hit ?? null,
      success: result.success ?? null,
      critical_hit: result.is_critical_hit ?? null,
    },
    damage_components: cloneSerializable(result.components ?? []),
    hit_point_application: result.before
      ? {
          before: result.before,
          after: result.after,
          temporary_hit_points_absorbed: result.temporary_hit_points_absorbed,
          damage_taken_after_temporary_hit_points: result.damage_taken_after_temporary_hit_points,
        }
      : null,
  };
}

export function projectRulesResultForPlayer(result = {}) {
  const projection = {
    ruleset: result.ruleset
      ? {
          ruleset_id: result.ruleset.ruleset_id,
          system: result.ruleset.system,
          rules_version: result.ruleset.rules_version,
        }
      : null,
    operation_type: result.operation_type,
    player_summary: cloneSerializable(result.player_summary ?? {}),
  };
  assertNoRulesPlayerHiddenData(projection);
  return projection;
}

export function assertNoRulesPlayerHiddenData(payload = {}) {
  const text = JSON.stringify(payload);
  for (const key of PLAYER_PROHIBITED_RULES_KEYS) {
    if (text.includes(`"${key}"`)) {
      throw rulesError(`Player rules projection contains hidden/internal data key ${key}.`, 'PLAYER_RULES_PROJECTION_LEAK');
    }
  }
  const valuePatterns = [
    /\btarget_armor_class\b/i,
    /\bdifficulty_class\b/i,
    /\boverride_controls\b/i,
    /\bmutation_plan\b/i,
    /\bsource_path\b/i,
  ];
  for (const pattern of valuePatterns) {
    if (pattern.test(text)) {
      throw rulesError('Player rules projection contains hidden/internal data.', 'PLAYER_RULES_PROJECTION_LEAK');
    }
  }
  return true;
}

export function createDnd5e2014RulesProvider(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  return {
    ruleset,
    generateD20Roll: (params = {}) => generateD20Roll({ ...params, ruleset }),
    resolveAttackRoll: (params = {}) => resolveAttackRoll({ ...params, ruleset }),
    resolveSavingThrow: (params = {}) => resolveSavingThrow({ ...params, ruleset }),
    applySavingThrowSuccessPolicy,
    resolveAbilityCheck: (params = {}) => resolveAbilityCheck({ ...params, ruleset }),
    resolveContestedAbilityCheck: (params = {}) => resolveContestedAbilityCheck({ ...params, ruleset }),
    normalizeDamageType: (damageType) => normalizeDamageType(damageType, ruleset),
    resolveDamage: (params = {}) => resolveDamage({ ...params, ruleset }),
    applyDamageToHitPoints,
    projectRulesResultForPlayer,
  };
}

export function resolveRulesProvider(input = {}) {
  const ruleset = normalizeRulesetIdentity(input.ruleset ?? input, { requireExplicit: true });
  return createDnd5e2014RulesProvider({ ruleset });
}

export function abilityModifierFromScore(score) {
  return calculateAbilityModifier(score);
}
