import {
  evaluateNarrativeConditions,
  resolveNarrativeSkillCheck,
} from '../narrative/narrativeEngine.js';

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function valuesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function evaluateSessionFlagRequirements(expectedFlags, actualFlags, labelPrefix) {
  const reasons = [];

  for (const [flagKey, expectedValue] of Object.entries(normalizeObject(expectedFlags))) {
    const actualValue = actualFlags.get(flagKey);

    if (actualValue === undefined) {
      reasons.push(`${labelPrefix} "${flagKey}" is missing`);
      continue;
    }

    if (!valuesMatch(actualValue, expectedValue)) {
      reasons.push(`${labelPrefix} "${flagKey}" does not match the required value`);
    }
  }

  return reasons;
}

function evaluateForbiddenSessionFlags(forbiddenFlags, actualFlags, labelPrefix) {
  const reasons = [];

  for (const [flagKey, forbiddenValue] of Object.entries(normalizeObject(forbiddenFlags))) {
    const actualValue = actualFlags.get(flagKey);

    if (actualValue !== undefined && valuesMatch(actualValue, forbiddenValue)) {
      reasons.push(`${labelPrefix} "${flagKey}" has a blocked value`);
    }
  }

  return reasons;
}

function evaluateVisitedNodeConditions(conditionKeys, visitedNodeKeys, isForbidden = false) {
  const reasons = [];

  for (const nodeKey of normalizeArray(conditionKeys)
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)) {
    const isVisited = visitedNodeKeys.has(nodeKey);

    if (!isForbidden && !isVisited) {
      reasons.push(`Required dialogue node "${nodeKey}" has not been visited`);
    }

    if (isForbidden && isVisited) {
      reasons.push(`Dialogue node "${nodeKey}" has already been visited`);
    }
  }

  return reasons;
}

function evaluateChoiceHistoryConditions(conditionKeys, chosenOptionKeys, isForbidden = false) {
  const reasons = [];

  for (const optionKey of normalizeArray(conditionKeys)
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)) {
    const hasBeenChosen = chosenOptionKeys.has(optionKey);

    if (!isForbidden && !hasBeenChosen) {
      reasons.push(`Required dialogue option "${optionKey}" has not been chosen`);
    }

    if (isForbidden && hasBeenChosen) {
      reasons.push(`Dialogue option "${optionKey}" has already been chosen`);
    }
  }

  return reasons;
}

function evaluateSkillOutcomeConditions(conditions, checkResult) {
  const normalizedConditions = normalizeObject(conditions);
  const reasons = [];

  if (!checkResult) {
    if (
      normalizedConditions.requires_success !== undefined ||
      normalizedConditions.requires_failure !== undefined ||
      normalizedConditions.minimum_margin !== undefined ||
      normalizedConditions.maximum_margin !== undefined ||
      normalizedConditions.minimum_total !== undefined ||
      normalizedConditions.maximum_total !== undefined ||
      normalizedConditions.minimum_roll !== undefined ||
      normalizedConditions.maximum_roll !== undefined
    ) {
      reasons.push('This outcome requires a skill check result');
    }

    return reasons;
  }

  const margin = Number(checkResult.total_value) - Number(checkResult.difficulty_class);

  if (normalizedConditions.requires_success === true && !checkResult.was_success) {
    reasons.push('This outcome requires a successful skill check');
  }

  if (normalizedConditions.requires_failure === true && checkResult.was_success) {
    reasons.push('This outcome requires a failed skill check');
  }

  if (
    normalizedConditions.minimum_margin !== undefined &&
    margin < Number(normalizedConditions.minimum_margin)
  ) {
    reasons.push('Skill check margin is below the required threshold');
  }

  if (
    normalizedConditions.maximum_margin !== undefined &&
    margin > Number(normalizedConditions.maximum_margin)
  ) {
    reasons.push('Skill check margin exceeds the allowed threshold');
  }

  if (
    normalizedConditions.minimum_total !== undefined &&
    Number(checkResult.total_value) < Number(normalizedConditions.minimum_total)
  ) {
    reasons.push('Skill check total is below the required threshold');
  }

  if (
    normalizedConditions.maximum_total !== undefined &&
    Number(checkResult.total_value) > Number(normalizedConditions.maximum_total)
  ) {
    reasons.push('Skill check total exceeds the allowed threshold');
  }

  if (
    normalizedConditions.minimum_roll !== undefined &&
    Number(checkResult.roll_value) < Number(normalizedConditions.minimum_roll)
  ) {
    reasons.push('Skill check roll is below the required threshold');
  }

  if (
    normalizedConditions.maximum_roll !== undefined &&
    Number(checkResult.roll_value) > Number(normalizedConditions.maximum_roll)
  ) {
    reasons.push('Skill check roll exceeds the allowed threshold');
  }

  return reasons;
}

export function evaluateDialogueConditions(conditions, context, checkResult = null) {
  const base = evaluateNarrativeConditions(conditions, context);
  const normalizedConditions = normalizeObject(conditions);
  const reasons = [...base.unmet_requirements];
  const sessionFlags = context.session_flags ?? new Map();
  const visitedNodeKeys = context.visited_node_keys ?? new Set();
  const chosenOptionKeys = context.chosen_option_keys ?? new Set();

  reasons.push(
    ...evaluateSessionFlagRequirements(
      normalizedConditions.required_session_flags,
      sessionFlags,
      'Session flag'
    )
  );
  reasons.push(
    ...evaluateForbiddenSessionFlags(
      normalizedConditions.forbidden_session_flags,
      sessionFlags,
      'Session flag'
    )
  );
  reasons.push(
    ...evaluateVisitedNodeConditions(
      normalizedConditions.required_visited_node_keys,
      visitedNodeKeys,
      false
    )
  );
  reasons.push(
    ...evaluateVisitedNodeConditions(
      normalizedConditions.forbidden_visited_node_keys,
      visitedNodeKeys,
      true
    )
  );
  reasons.push(
    ...evaluateChoiceHistoryConditions(
      normalizedConditions.required_choice_keys,
      chosenOptionKeys,
      false
    )
  );
  reasons.push(
    ...evaluateChoiceHistoryConditions(
      normalizedConditions.forbidden_choice_keys,
      chosenOptionKeys,
      true
    )
  );
  reasons.push(...evaluateSkillOutcomeConditions(normalizedConditions, checkResult));

  return {
    is_available: reasons.length === 0,
    unmet_requirements: reasons,
  };
}

export function resolveDialogueOptionSkillCheck(option, characterRules, input = {}) {
  if (!option.skill) {
    return null;
  }

  const check = resolveNarrativeSkillCheck(
    {
      skill: option.skill,
      difficulty_class: option.difficulty_class,
    },
    characterRules,
    input
  );

  return {
    ...check,
    check_mode: option.check_mode,
    check_visibility: option.check_visibility,
    margin_value: Number(check.total_value) - Number(check.difficulty_class),
  };
}

export function appendUniqueString(list, value) {
  const normalizedValue = String(value ?? '').trim();

  if (!normalizedValue) {
    return list;
  }

  if (list.includes(normalizedValue)) {
    return list;
  }

  return [...list, normalizedValue];
}
