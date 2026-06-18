const standardSpellSlotTable = {
  0: {},
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

const pactMagicSlotTable = {
  1: { slots: 1, slot_level: 1 },
  2: { slots: 2, slot_level: 1 },
  3: { slots: 2, slot_level: 2 },
  4: { slots: 2, slot_level: 2 },
  5: { slots: 2, slot_level: 3 },
  6: { slots: 2, slot_level: 3 },
  7: { slots: 2, slot_level: 4 },
  8: { slots: 2, slot_level: 4 },
  9: { slots: 2, slot_level: 5 },
  10: { slots: 2, slot_level: 5 },
  11: { slots: 3, slot_level: 5 },
  12: { slots: 3, slot_level: 5 },
  13: { slots: 3, slot_level: 5 },
  14: { slots: 3, slot_level: 5 },
  15: { slots: 3, slot_level: 5 },
  16: { slots: 3, slot_level: 5 },
  17: { slots: 4, slot_level: 5 },
  18: { slots: 4, slot_level: 5 },
  19: { slots: 4, slot_level: 5 },
  20: { slots: 4, slot_level: 5 },
};

const spellsKnownTable = {
  bard: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 19, 20, 22, 22, 22, 22, 22],
  ranger: [0, 0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  sorcerer: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  warlock: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

const cantripsKnownTable = {
  bard: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  cleric: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  druid: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  sorcerer: [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  warlock: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  wizard: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
};

const classSpellcastingProfiles = {
  bard: { slot_pool: 'standard', progression: 'full', spell_model: 'known', casting_ability: 'charisma' },
  cleric: { slot_pool: 'standard', progression: 'full', spell_model: 'prepared', casting_ability: 'wisdom' },
  druid: { slot_pool: 'standard', progression: 'full', spell_model: 'prepared', casting_ability: 'wisdom' },
  paladin: {
    slot_pool: 'standard',
    progression: 'half',
    spell_model: 'prepared',
    casting_ability: 'charisma',
    starts_at_level: 2,
  },
  ranger: {
    slot_pool: 'standard',
    progression: 'half',
    spell_model: 'known',
    casting_ability: 'wisdom',
    starts_at_level: 2,
  },
  sorcerer: { slot_pool: 'standard', progression: 'full', spell_model: 'known', casting_ability: 'charisma' },
  warlock: { slot_pool: 'pact_magic', progression: 'pact', spell_model: 'known', casting_ability: 'charisma' },
  wizard: { slot_pool: 'standard', progression: 'full', spell_model: 'prepared', casting_ability: 'intelligence' },
};

function clampLevel(level) {
  return Math.max(0, Math.min(20, Number(level) || 0));
}

function getAbilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

function getProfileForClassSlug(classSlug) {
  return classSpellcastingProfiles[classSlug] || null;
}

function getStandardCasterContribution(classSlug, classLevel) {
  const profile = getProfileForClassSlug(classSlug);

  if (!profile || profile.slot_pool !== 'standard') {
    return 0;
  }

  if (profile.starts_at_level && classLevel < profile.starts_at_level) {
    return 0;
  }

  if (profile.progression === 'full') {
    return classLevel;
  }

  if (profile.progression === 'half') {
    return Math.floor(classLevel / 2);
  }

  if (profile.progression === 'third') {
    return Math.floor(classLevel / 3);
  }

  return 0;
}

function getMaxSpellLevelFromStandardCasterLevel(standardCasterLevel) {
  const slotRow = standardSpellSlotTable[clampLevel(standardCasterLevel)] || {};
  const levels = Object.keys(slotRow).map(Number);
  return levels.length > 0 ? Math.max(...levels) : 0;
}

function getMaxSpellLevelForClass(classSlug, classLevel) {
  const profile = getProfileForClassSlug(classSlug);

  if (!profile) {
    return 0;
  }

  if (profile.slot_pool === 'standard') {
    return getMaxSpellLevelFromStandardCasterLevel(getStandardCasterContribution(classSlug, classLevel));
  }

  if (profile.slot_pool === 'pact_magic') {
    const pactRow = pactMagicSlotTable[clampLevel(classLevel)];
    return pactRow ? pactRow.slot_level : 0;
  }

  return 0;
}

function getKnownSpellLimit(classSlug, classLevel, spellLevel) {
  const level = clampLevel(classLevel);

  if (spellLevel === 0) {
    const table = cantripsKnownTable[classSlug];
    return table ? table[level] : null;
  }

  const table = spellsKnownTable[classSlug];
  return table ? table[level] : null;
}

function getPreparedSpellLimit(character, classSlug, classLevel) {
  const level = clampLevel(classLevel);

  if (classSlug === 'cleric' || classSlug === 'druid') {
    const ability = classSlug === 'cleric' ? character.wisdom : character.wisdom;
    return Math.max(1, level + getAbilityModifier(ability));
  }

  if (classSlug === 'paladin') {
    return Math.max(1, Math.floor(level / 2) + getAbilityModifier(character.charisma));
  }

  if (classSlug === 'wizard') {
    return Math.max(1, level + getAbilityModifier(character.intelligence));
  }

  return null;
}

export function buildSpellcastingClassSummary(classEntries, character) {
  return classEntries.map((entry) => {
    const classSlug = entry.class.slug;
    const classLevel = Number(entry.class_level);
    const profile = getProfileForClassSlug(classSlug);

    if (!profile) {
      return { ...entry, spellcasting: null };
    }

    return {
      ...entry,
      spellcasting: {
        slot_pool: profile.slot_pool,
        progression: profile.progression,
        spell_model: profile.spell_model,
        casting_ability: profile.casting_ability,
        max_spell_level: getMaxSpellLevelForClass(classSlug, classLevel),
        cantrips_known_limit: getKnownSpellLimit(classSlug, classLevel, 0),
        spells_known_limit: getKnownSpellLimit(classSlug, classLevel, 1),
        prepared_spell_limit: getPreparedSpellLimit(character, classSlug, classLevel),
      },
    };
  });
}

export function computeSpellSlotPools(classEntries) {
  const standardCasterLevel = classEntries.reduce(
    (sum, entry) => sum + getStandardCasterContribution(entry.class.slug, Number(entry.class_level)),
    0
  );

  const standardSlots = standardSpellSlotTable[clampLevel(standardCasterLevel)] || {};
  const pools = [];

  if (Object.keys(standardSlots).length > 0) {
    pools.push({ slot_pool: 'standard', caster_level: standardCasterLevel, slots: standardSlots });
  }

  const warlockEntry = classEntries.find((entry) => entry.class.slug === 'warlock');

  if (warlockEntry) {
    const pactRow = pactMagicSlotTable[clampLevel(Number(warlockEntry.class_level))];
    if (pactRow) {
      pools.push({
        slot_pool: 'pact_magic',
        caster_level: Number(warlockEntry.class_level),
        slots: { [pactRow.slot_level]: pactRow.slots },
      });
    }
  }

  return pools;
}

export function getSpellcastingSummary(classEntries, character) {
  const classSummary = buildSpellcastingClassSummary(classEntries, character);
  const slotPools = computeSpellSlotPools(classEntries);
  const spellcastingClasses = classSummary.filter((entry) => entry.spellcasting !== null);

  return {
    class_spellcasting: classSummary,
    has_spellcasting: spellcastingClasses.length > 0,
    slot_pools: slotPools,
  };
}

export function getPreparedSpellLimitForClass(character, classSlug, classLevel) {
  return getPreparedSpellLimit(character, classSlug, classLevel);
}

export function getKnownSpellLimitForClass(classSlug, classLevel, spellLevel) {
  return getKnownSpellLimit(classSlug, classLevel, spellLevel);
}

export function getMaxSpellLevelForClassEntry(classEntry) {
  return getMaxSpellLevelForClass(classEntry.class.slug, Number(classEntry.class_level));
}

export function getClassSpellProfile(classSlug) {
  return getProfileForClassSlug(classSlug);
}
