import { createHttpError } from '../../utils/httpError.js';

const skillAbilityMap = {
  athletics: 'strength',
  acrobatics: 'dexterity',
  'sleight-of-hand': 'dexterity',
  stealth: 'dexterity',
  arcana: 'intelligence',
  history: 'intelligence',
  investigation: 'intelligence',
  nature: 'intelligence',
  religion: 'intelligence',
  'animal-handling': 'wisdom',
  insight: 'wisdom',
  medicine: 'wisdom',
  perception: 'wisdom',
  survival: 'wisdom',
  deception: 'charisma',
  intimidation: 'charisma',
  performance: 'charisma',
  persuasion: 'charisma',
};

const proficiencyPriority = {
  none: 0,
  half_proficient: 1,
  proficient: 2,
  expertise: 3,
};

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value) {
  return normalizeArray(value)
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
}

function jsonValuesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeStatuses(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  }

  const single = String(value ?? '').trim();
  return single ? [single] : [];
}

function evaluateFlagRequirements(expectedFlags, actualFlags, labelPrefix) {
  const reasons = [];

  for (const [flagKey, expectedValue] of Object.entries(normalizeObject(expectedFlags))) {
    const actualValue = actualFlags.get(flagKey);

    if (actualValue === undefined) {
      reasons.push(`${labelPrefix} flag "${flagKey}" is missing`);
      continue;
    }

    if (!jsonValuesMatch(actualValue, expectedValue)) {
      reasons.push(`${labelPrefix} flag "${flagKey}" does not match the required value`);
    }
  }

  return reasons;
}

function evaluateForbiddenFlagRequirements(forbiddenFlags, actualFlags, labelPrefix) {
  const reasons = [];

  for (const [flagKey, forbiddenValue] of Object.entries(normalizeObject(forbiddenFlags))) {
    const actualValue = actualFlags.get(flagKey);

    if (actualValue === undefined) {
      continue;
    }

    if (jsonValuesMatch(actualValue, forbiddenValue)) {
      reasons.push(`${labelPrefix} flag "${flagKey}" has a blocked value`);
    }
  }

  return reasons;
}

function evaluateQuestRequirements(requiredQuestStates, questMap) {
  const reasons = [];

  for (const requirement of normalizeArray(requiredQuestStates)) {
    const questKey = String(requirement?.quest_key ?? '').trim();
    const expectedStatuses = normalizeStatuses(requirement?.statuses ?? requirement?.status);

    if (!questKey || expectedStatuses.length === 0) {
      continue;
    }

    const quest = questMap.get(questKey);

    if (!quest) {
      reasons.push(`Quest "${questKey}" is not available`);
      continue;
    }

    if (!expectedStatuses.includes(quest.status)) {
      reasons.push(`Quest "${questKey}" is not in an allowed state`);
    }
  }

  return reasons;
}

function evaluateObjectiveRequirements(requiredObjectiveStates, objectiveMap) {
  const reasons = [];

  for (const requirement of normalizeArray(requiredObjectiveStates)) {
    const questKey = String(requirement?.quest_key ?? '').trim();
    const objectiveKey = String(requirement?.objective_key ?? '').trim();
    const expectedStatuses = normalizeStatuses(requirement?.statuses ?? requirement?.status);

    if (!questKey || !objectiveKey || expectedStatuses.length === 0) {
      continue;
    }

    const objective = objectiveMap.get(`${questKey}:${objectiveKey}`);

    if (!objective) {
      reasons.push(`Objective "${objectiveKey}" for quest "${questKey}" is not available`);
      continue;
    }

    if (!expectedStatuses.includes(objective.status)) {
      reasons.push(`Objective "${objectiveKey}" for quest "${questKey}" is not in an allowed state`);
    }
  }

  return reasons;
}

export function evaluateNarrativeConditions(conditions, context) {
  const normalizedConditions = normalizeObject(conditions);
  const reasons = [];
  const requiredAlignments = normalizeStringArray(
    normalizedConditions.required_alignment_abbreviations
  );
  const requiredCampaignTypes = normalizeStringArray(
    normalizedConditions.required_campaign_types
  );

  if (requiredAlignments.length > 0) {
    const alignment = String(context.alignment_abbreviation ?? '').trim();

    if (!alignment || !requiredAlignments.includes(alignment)) {
      reasons.push('Character alignment does not meet this requirement');
    }
  }

  if (requiredCampaignTypes.length > 0) {
    const campaignType = String(context.campaign_type ?? '').trim();

    if (!campaignType || !requiredCampaignTypes.includes(campaignType)) {
      reasons.push('Campaign type does not meet this requirement');
    }
  }

  reasons.push(
    ...evaluateFlagRequirements(
      normalizedConditions.required_campaign_flags,
      context.campaign_flags,
      'Campaign'
    )
  );
  reasons.push(
    ...evaluateForbiddenFlagRequirements(
      normalizedConditions.forbidden_campaign_flags,
      context.campaign_flags,
      'Campaign'
    )
  );
  reasons.push(
    ...evaluateFlagRequirements(
      normalizedConditions.required_character_flags,
      context.character_flags,
      'Character'
    )
  );
  reasons.push(
    ...evaluateForbiddenFlagRequirements(
      normalizedConditions.forbidden_character_flags,
      context.character_flags,
      'Character'
    )
  );
  reasons.push(
    ...evaluateQuestRequirements(normalizedConditions.required_quest_states, context.quest_map)
  );
  reasons.push(
    ...evaluateObjectiveRequirements(
      normalizedConditions.required_objective_states,
      context.objective_map
    )
  );

  return {
    is_available: reasons.length === 0,
    unmet_requirements: reasons,
  };
}

export function evaluateNarrativeRecommendation(recommendation, alignmentAbbreviation) {
  const normalizedRecommendation = normalizeObject(recommendation);
  const preferredAlignments = normalizeStringArray(
    normalizedRecommendation.preferred_alignment_abbreviations
  );
  const alignment = String(alignmentAbbreviation ?? '').trim();

  return {
    preferred_alignment_abbreviations: preferredAlignments,
    is_recommended_for_alignment:
      preferredAlignments.length === 0 ? null : preferredAlignments.includes(alignment),
  };
}

function getSkillProficiencyType(characterRules, skillSlug) {
  const effective = [];

  for (const feature of characterRules?.features?.mechanical ?? []) {
    for (const proficiency of feature.effects?.skill_proficiencies ?? []) {
      if (proficiency.skill?.slug === skillSlug) {
        effective.push(proficiency.proficiency_type);
      }
    }
  }

  return effective.reduce((best, current) => {
    const normalizedCurrent = proficiencyPriority[current] !== undefined ? current : 'none';
    return proficiencyPriority[normalizedCurrent] > proficiencyPriority[best]
      ? normalizedCurrent
      : best;
  }, 'none');
}

function getSkillModifierContribution(proficiencyType, proficiencyBonus) {
  switch (proficiencyType) {
    case 'expertise':
      return proficiencyBonus * 2;
    case 'proficient':
      return proficiencyBonus;
    case 'half_proficient':
      return Math.floor(proficiencyBonus / 2);
    default:
      return 0;
  }
}

function readRollValue(value) {
  if (value === undefined || value === null || value === '') {
    return Math.floor(Math.random() * 20) + 1;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw createHttpError('roll must be an integer from 1 to 20', 400);
  }

  return parsed;
}

export function resolveSceneInteractionSkillCheck(interaction, characterRules, input = {}) {
  return resolveNarrativeSkillCheck(
    {
      skill: interaction.skill,
      difficulty_class: interaction.difficulty_class,
    },
    characterRules,
    input
  );
}

export function resolveNarrativeSkillCheck(definition, characterRules, input = {}) {
  const skillSlug = definition.skill?.slug;
  const difficultyClass = Number(definition.difficulty_class);
  const abilityKey = skillAbilityMap[skillSlug];

  if (!skillSlug || !abilityKey) {
    throw createHttpError('This skill check is missing skill metadata', 409);
  }

  const abilityData = characterRules?.abilities?.[abilityKey];

  if (!abilityData || abilityData.modifier === null || abilityData.modifier === undefined) {
    throw createHttpError(
      'Character rules are incomplete for this skill check because the relevant ability modifier is missing',
      409
    );
  }

  const proficiencyBonus = Number(
    characterRules?.proficiency?.derived_bonus ?? characterRules?.proficiency?.bonus ?? 0
  );
  const proficiencyType = getSkillProficiencyType(characterRules, skillSlug);
  const proficiencyContribution = getSkillModifierContribution(
    proficiencyType,
    proficiencyBonus
  );
  const skillModifier = Number(abilityData.modifier) + proficiencyContribution;
  const rollValue = readRollValue(input.roll);
  const totalValue = rollValue + skillModifier;

  return {
    skill: definition.skill,
    difficulty_class: difficultyClass,
    roll_value: rollValue,
    ability_key: abilityKey,
    ability_modifier: Number(abilityData.modifier),
    proficiency_bonus: proficiencyBonus,
    proficiency_type: proficiencyType,
    skill_modifier: skillModifier,
    total_value: totalValue,
    was_success: totalValue >= difficultyClass,
  };
}
