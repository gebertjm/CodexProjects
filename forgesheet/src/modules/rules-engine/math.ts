export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);

export const proficiencyBonusByLevel = (level: number) =>
  Math.floor((Math.max(level, 1) - 1) / 4) + 2;
