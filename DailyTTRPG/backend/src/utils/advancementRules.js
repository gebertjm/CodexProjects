const defaultThresholds = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
  6: 14000,
  7: 23000,
  8: 34000,
  9: 48000,
  10: 64000,
  11: 85000,
  12: 100000,
  13: 120000,
  14: 140000,
  15: 165000,
  16: 195000,
  17: 225000,
  18: 265000,
  19: 305000,
  20: 355000,
};

export const advancementModes = new Set(['milestone', 'event_weighted_xp', 'gm_controlled']);

export const advancementEventKinds = new Set([
  'xp_grant',
  'level_grant',
  'level_up_started',
  'level_up_deferred',
  'level_up_completed',
  'hp_roll',
]);

export const levelUpSessionStatuses = new Set([
  'started',
  'awaiting_choice',
  'validating',
  'ready_to_finalize',
  'completed',
  'deferred',
  'canceled',
]);

export function getDefaultAdvancementConfig() {
  return {
    xp_weights: {
      objective: 100,
      quest: 300,
      combat: 50,
      discovery: 75,
      dialogue: 25,
      encounter: 50,
      system: 25,
      gm: 100,
    },
    catch_up_enabled: true,
    soft_sync_enabled: true,
    catch_up_multiplier_per_level_gap: 0.25,
    catch_up_multiplier_cap: 1.75,
  };
}

export function getDefaultXpThresholds() {
  return { ...defaultThresholds };
}

export function getXpThresholdForLevel(level, thresholdTable = defaultThresholds) {
  const numericLevel = Number(level);

  if (!Number.isInteger(numericLevel) || numericLevel < 1) {
    return null;
  }

  return Number(thresholdTable[numericLevel] ?? null);
}

export function getHighestEligibleLevel(totalXp, thresholdTable = defaultThresholds) {
  const normalizedXp = Math.max(0, Number(totalXp) || 0);
  let highestLevel = 1;

  for (const level of Object.keys(thresholdTable).map(Number).sort((left, right) => left - right)) {
    if (normalizedXp >= Number(thresholdTable[level])) {
      highestLevel = level;
    }
  }

  return highestLevel;
}

export function computePendingLevelsFromXp(totalXp, currentLevel, existingPendingLevelCount = 0, thresholdTable = defaultThresholds) {
  const highestEligibleLevel = getHighestEligibleLevel(totalXp, thresholdTable);
  const alreadyAccountedLevel = Number(currentLevel) + Number(existingPendingLevelCount);

  return Math.max(0, highestEligibleLevel - alreadyAccountedLevel);
}

export function calculateProficiencyBonus(totalLevel) {
  const normalizedLevel = Number(totalLevel);

  if (!Number.isInteger(normalizedLevel) || normalizedLevel < 1) {
    return null;
  }

  return Math.floor((normalizedLevel - 1) / 4) + 2;
}

export function calculateAbilityModifier(score) {
  const normalizedScore = Number(score);

  if (!Number.isInteger(normalizedScore)) {
    return 0;
  }

  return Math.floor((normalizedScore - 10) / 2);
}

export function calculateFixedHitPointGain(hitDie, constitutionScore) {
  const normalizedHitDie = Number(hitDie);

  if (!Number.isInteger(normalizedHitDie) || normalizedHitDie < 1) {
    return null;
  }

  return Math.max(1, Math.floor(normalizedHitDie / 2) + 1 + calculateAbilityModifier(constitutionScore));
}

export function normalizeAdvancementMode(mode, fallback = 'event_weighted_xp') {
  const normalized = String(mode ?? fallback).trim() || fallback;

  if (!advancementModes.has(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeAdvancementConfig(config) {
  const defaults = getDefaultAdvancementConfig();
  const xpWeights = {
    ...defaults.xp_weights,
    ...(config?.xp_weights ?? {}),
  };

  return {
    xp_weights: xpWeights,
    catch_up_enabled:
      config?.catch_up_enabled === undefined
        ? defaults.catch_up_enabled
        : Boolean(config.catch_up_enabled),
    soft_sync_enabled:
      config?.soft_sync_enabled === undefined
        ? defaults.soft_sync_enabled
        : Boolean(config.soft_sync_enabled),
    catch_up_multiplier_per_level_gap: Number(
      config?.catch_up_multiplier_per_level_gap ?? defaults.catch_up_multiplier_per_level_gap
    ),
    catch_up_multiplier_cap: Number(
      config?.catch_up_multiplier_cap ?? defaults.catch_up_multiplier_cap
    ),
  };
}

export function calculateCatchUpMultiplier(levelGap, config) {
  const normalizedGap = Math.max(0, Number(levelGap) || 0);
  const normalizedConfig = normalizeAdvancementConfig(config);
  const multiplier = 1 + normalizedGap * normalizedConfig.catch_up_multiplier_per_level_gap;

  return Math.max(1, Math.min(multiplier, normalizedConfig.catch_up_multiplier_cap));
}
