const abilityDefinitions = [
  { key: 'strength', code: 'STR', label: 'Strength' },
  { key: 'dexterity', code: 'DEX', label: 'Dexterity' },
  { key: 'constitution', code: 'CON', label: 'Constitution' },
  { key: 'intelligence', code: 'INT', label: 'Intelligence' },
  { key: 'wisdom', code: 'WIS', label: 'Wisdom' },
  { key: 'charisma', code: 'CHA', label: 'Charisma' },
];

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateAbilityModifier(score) {
  const numericScore = toNumberOrNull(score);

  if (numericScore === null) {
    return null;
  }

  return Math.floor((numericScore - 10) / 2);
}

function calculateProficiencyBonus(totalLevel) {
  if (!Number.isInteger(totalLevel) || totalLevel < 1) {
    return null;
  }

  return Math.floor((totalLevel - 1) / 4) + 2;
}

function buildOverrideSummary(overrides) {
  const active = overrides.filter((entry) => entry.is_active);
  const inactive = overrides.filter((entry) => !entry.is_active);
  const categories = [...new Set(active.map((entry) => entry.override_category))].sort();

  return {
    total_count: overrides.length,
    active_count: active.length,
    inactive_count: inactive.length,
    active_categories: categories,
  };
}

function mapFeatureMetadata(feature) {
  return {
    id: feature.id,
    name: feature.name,
    slug: feature.slug,
    feature_type: feature.feature_type,
    description: feature.description,
    source: feature.source,
  };
}

function mapGrantedBy(source) {
  return {
    source_type: source.source_type,
    source_entity_id: source.source_entity_id,
    source_entity_name: source.source_entity_name,
    granted_at_level: source.granted_at_level,
    display_order: source.display_order,
  };
}

function buildFeatureSourceIndex(derivedFeatures) {
  const byId = new Map();

  for (const feature of derivedFeatures) {
    const featureId = Number(feature.id);

    if (!byId.has(featureId)) {
      byId.set(featureId, []);
    }

    byId.get(featureId).push(feature);
  }

  return byId;
}

function mapFeatureSources(featureSourcesById, featureId) {
  return (featureSourcesById.get(featureId) || []).map((entry) => ({
    feature: mapFeatureMetadata(entry),
    granted_by: mapGrantedBy(entry.granted_by),
  }));
}

function groupByFeatureId(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const featureId = Number(row.feature_id);

    if (!grouped.has(featureId)) {
      grouped.set(featureId, []);
    }

    grouped.get(featureId).push(row);
  }

  return grouped;
}

function collectRelevantOverrides(overrides, category, subjectKeys) {
  return overrides
    .filter((entry) => {
      if (!entry.is_active || entry.override_category !== category) {
        return false;
      }

      if (!entry.subject_key) {
        return true;
      }

      return subjectKeys.includes(entry.subject_key);
    })
    .map((entry) => ({
      id: entry.id,
      category: entry.override_category,
      reason: entry.reason,
      actor_account_id: entry.actor_account_id,
      actor_label: entry.actor_label,
    }));
}

function buildAbilityView(character, abilityEffects, featureSourcesById) {
  const grouped = new Map();

  for (const effect of abilityEffects) {
    if (!grouped.has(effect.ability_code)) {
      grouped.set(effect.ability_code, []);
    }

    grouped.get(effect.ability_code).push(effect);
  }

  const abilities = {};

  for (const definition of abilityDefinitions) {
    const score = toNumberOrNull(character[definition.key]);
    const relevantEffects = (grouped.get(definition.code) || []).map((effect) => ({
      modifier_value: Number(effect.modifier_value),
      modifier_type: effect.modifier_type,
      notes: effect.notes,
      sources: mapFeatureSources(featureSourcesById, effect.feature_id),
    }));

    abilities[definition.key] = {
      label: definition.label,
      stored_score: score,
      effective_score: score,
      modifier: calculateAbilityModifier(score),
      known_feature_adjustments: relevantEffects,
    };
  }

  return abilities;
}

function buildLevelsView(character, classes) {
  const totalLevel = classes.reduce((sum, entry) => sum + Number(entry.class_level), 0);

  return {
    total_level: totalLevel,
    stored_character_level: Number(character.level),
    levels_match: Number(character.level) === totalLevel,
    class_levels: classes.map((entry) => ({
      character_class_id: entry.id,
      class_id: entry.class.id,
      class_name: entry.class.name,
      class_slug: entry.class.slug,
      subclass_id: entry.subclass?.id ?? null,
      subclass_name: entry.subclass?.name ?? null,
      class_level: Number(entry.class_level),
      is_primary: entry.is_primary,
    })),
  };
}

function applySpeedEffects(baseSpeed, speedEffects) {
  let currentSpeed = toNumberOrNull(baseSpeed);
  const unsupportedOperations = [];

  for (const effect of speedEffects) {
    const modifierValue = Number(effect.modifier_value);

    if (['increase', 'bonus', 'add'].includes(effect.operation_type)) {
      if (currentSpeed !== null) {
        currentSpeed += modifierValue;
      }
      continue;
    }

    if (['decrease', 'subtract'].includes(effect.operation_type)) {
      if (currentSpeed !== null) {
        currentSpeed -= modifierValue;
      }
      continue;
    }

    if (['set', 'replace'].includes(effect.operation_type)) {
      currentSpeed = modifierValue;
      continue;
    }

    unsupportedOperations.push(effect.operation_type);
  }

  return {
    value: currentSpeed,
    unsupported_operations: [...new Set(unsupportedOperations)].sort(),
  };
}

function buildMovementView(character, movementContext, speedEffects, featureSourcesById) {
  const walkEffects = speedEffects
    .filter((effect) => effect.speed_type === 'walk')
    .map((effect) => ({
      modifier_value: Number(effect.modifier_value),
      operation_type: effect.operation_type,
      notes: effect.notes,
      sources: mapFeatureSources(featureSourcesById, effect.feature_id),
    }));

  const raceBaseSpeed = toNumberOrNull(movementContext?.race_base_speed);
  const storedCharacterSpeed = toNumberOrNull(character.speed);
  const derivedFromRaceAndFeatures = applySpeedEffects(raceBaseSpeed, speedEffects.filter((effect) => effect.speed_type === 'walk'));
  const effectiveWalkSpeed =
    storedCharacterSpeed !== null ? storedCharacterSpeed : derivedFromRaceAndFeatures.value;
  const notes = [];

  if (storedCharacterSpeed !== null && walkEffects.length > 0) {
    notes.push('feature speed modifiers are reported separately because character.speed is already stored as the canonical walk speed');
  }

  if (storedCharacterSpeed === null && raceBaseSpeed === null && walkEffects.length > 0) {
    notes.push('speed modifiers exist, but there is no stored or racial base speed to apply them against');
  }

  if (derivedFromRaceAndFeatures.unsupported_operations.length > 0) {
    notes.push('some speed modifier operations are not fully modeled yet');
  }

  return {
    walk: {
      race_base_speed: raceBaseSpeed,
      stored_character_speed: storedCharacterSpeed,
      derived_from_race_and_features: derivedFromRaceAndFeatures.value,
      effective_speed: effectiveWalkSpeed,
      uses_stored_character_speed: storedCharacterSpeed !== null,
      modifiers: walkEffects,
      notes,
    },
    summary: {
      effective_walk_speed: effectiveWalkSpeed,
      has_speed_modifiers: walkEffects.length > 0,
    },
  };
}

function mapLanguageEntry(entry) {
  return {
    id: entry.language.id,
    name: entry.language.name,
    slug: entry.language.slug,
    script: entry.language.script,
    is_exotic: entry.language.is_exotic,
    source: entry.language.source,
    source_type: entry.source_type,
    granted_by_feature: entry.granted_by_feature ?? null,
  };
}

function buildLanguagesView(languages) {
  const manual = languages.manual.map(mapLanguageEntry);
  const derived = languages.derived.map(mapLanguageEntry);
  const effective = languages.effective.map(mapLanguageEntry);

  return {
    manual,
    derived,
    effective,
    summary: {
      effective_count: effective.length,
      manual_count: manual.length,
      derived_count: derived.length,
    },
  };
}

function buildSensesView(senseEffects, featureSourcesById) {
  const grouped = new Map();

  for (const effect of senseEffects) {
    const key = effect.sense_type;
    const sources = mapFeatureSources(featureSourcesById, effect.feature_id);

    if (!grouped.has(key)) {
      grouped.set(key, {
        sense_type: effect.sense_type,
        range_feet: effect.range_feet !== null ? Number(effect.range_feet) : null,
        notes: [],
        sources: [],
      });
    }

    const current = grouped.get(key);
    const nextRange = effect.range_feet !== null ? Number(effect.range_feet) : null;

    if (nextRange !== null) {
      current.range_feet = current.range_feet === null ? nextRange : Math.max(current.range_feet, nextRange);
    }

    if (effect.notes) {
      current.notes.push(effect.notes);
    }

    current.sources.push(...sources);
  }

  const effective = Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      notes: [...new Set(entry.notes)].sort(),
    }))
    .sort((left, right) => left.sense_type.localeCompare(right.sense_type));

  return {
    effective,
    summary: {
      sense_count: effective.length,
    },
  };
}

function buildDefensesView(resistanceEffects, featureSourcesById) {
  const grouped = new Map();

  for (const effect of resistanceEffects) {
    const key = `${effect.resistance_type}:${effect.damage_type ?? 'general'}`;
    const sources = mapFeatureSources(featureSourcesById, effect.feature_id);

    if (!grouped.has(key)) {
      grouped.set(key, {
        resistance_type: effect.resistance_type,
        damage_type: effect.damage_type,
        notes: [],
        sources: [],
      });
    }

    const current = grouped.get(key);

    if (effect.notes) {
      current.notes.push(effect.notes);
    }

    current.sources.push(...sources);
  }

  const allDefenses = Array.from(grouped.values()).map((entry) => ({
    ...entry,
    notes: [...new Set(entry.notes)].sort(),
  }));

  return {
    resistances: allDefenses
      .filter((entry) => entry.resistance_type === 'damage')
      .sort((left, right) => (left.damage_type || '').localeCompare(right.damage_type || '')),
    immunities: allDefenses
      .filter((entry) => entry.resistance_type.includes('immunity'))
      .sort((left, right) => (left.damage_type || '').localeCompare(right.damage_type || '')),
    special_defenses: allDefenses
      .filter((entry) => entry.resistance_type !== 'damage' && !entry.resistance_type.includes('immunity'))
      .sort((left, right) => left.resistance_type.localeCompare(right.resistance_type)),
  };
}

function buildMechanicalFeatureEntry(feature, effectMaps, featOverrideMap) {
  const featureId = Number(feature.id);
  const abilityModifiers = (effectMaps.abilityByFeatureId.get(featureId) || []).map((effect) => ({
    ability_code: effect.ability_code,
    ability_name: effect.ability_name,
    modifier_value: Number(effect.modifier_value),
    modifier_type: effect.modifier_type,
    notes: effect.notes,
  }));
  const skillProficiencies = (effectMaps.skillByFeatureId.get(featureId) || []).map((effect) => ({
    skill: {
      id: Number(effect.skill_id),
      name: effect.skill_name,
      slug: effect.skill_slug,
    },
    proficiency_type: effect.proficiency_type,
    notes: effect.notes,
  }));
  const languageGrants = (effectMaps.languageByFeatureId.get(featureId) || []).map((effect) => ({
    language: {
      id: Number(effect.language_id),
      name: effect.language_name,
      slug: effect.language_slug,
      script: effect.script,
      is_exotic: effect.is_exotic,
      source: effect.language_source,
    },
    notes: effect.notes,
  }));
  const spellGrants = (effectMaps.spellByFeatureId.get(featureId) || []).map((effect) => ({
    spell: {
      id: Number(effect.spell_id),
      name: effect.spell_name,
      slug: effect.spell_slug,
      level: Number(effect.spell_level),
      school: effect.spell_school,
      source: effect.spell_source,
    },
    grant_type: effect.grant_type,
    granted_at_level: effect.granted_at_level !== null ? Number(effect.granted_at_level) : null,
    notes: effect.notes,
  }));
  const speedModifiers = (effectMaps.speedByFeatureId.get(featureId) || []).map((effect) => ({
    speed_type: effect.speed_type,
    modifier_value: Number(effect.modifier_value),
    operation_type: effect.operation_type,
    notes: effect.notes,
  }));
  const senses = (effectMaps.senseByFeatureId.get(featureId) || []).map((effect) => ({
    sense_type: effect.sense_type,
    range_feet: effect.range_feet !== null ? Number(effect.range_feet) : null,
    notes: effect.notes,
  }));
  const resistances = (effectMaps.resistanceByFeatureId.get(featureId) || []).map((effect) => ({
    resistance_type: effect.resistance_type,
    damage_type: effect.damage_type,
    notes: effect.notes,
  }));

  const featOverrides =
    feature.granted_by.source_type === 'feat'
      ? featOverrideMap.get(Number(feature.granted_by.source_entity_id)) || []
      : [];

  return {
    feature: mapFeatureMetadata(feature),
    granted_by: mapGrantedBy(feature.granted_by),
    effective_state: {
      overridden: featOverrides.length > 0,
      active_overrides: featOverrides,
    },
    effects: {
      ability_modifiers: abilityModifiers,
      skill_proficiencies: skillProficiencies,
      language_grants: languageGrants,
      spell_grants: spellGrants,
      speed_modifiers: speedModifiers,
      senses,
      resistances,
    },
  };
}

function buildFeaturesView(raw, effectMaps, overrides) {
  const featOverrideMap = new Map();

  for (const featEntry of raw.feats) {
    const relevantOverrides = collectRelevantOverrides(overrides, 'bypass_feat_prerequisite', [
      featEntry.feat.slug,
      `feat:${featEntry.feat.id}`,
      `feat:${featEntry.feat.slug}`,
    ]);

    featOverrideMap.set(Number(featEntry.feat.id), relevantOverrides);
  }

  const mechanical = [];
  const descriptive = [];

  for (const feature of raw.derived_features) {
    const entry = buildMechanicalFeatureEntry(feature, effectMaps, featOverrideMap);
    const hasMechanicalEffects = Object.values(entry.effects).some((value) => value.length > 0);

    if (hasMechanicalEffects) {
      mechanical.push(entry);
      continue;
    }

    descriptive.push({
      feature: mapFeatureMetadata(feature),
      granted_by: mapGrantedBy(feature.granted_by),
      effective_state: entry.effective_state,
    });
  }

  return {
    mechanical,
    descriptive,
    summary: {
      total_count: raw.derived_features.length,
      mechanical_count: mechanical.length,
      descriptive_count: descriptive.length,
    },
  };
}

function buildMechanicalReadiness(raw, levels, proficiency, movement) {
  const notes = [...new Set(raw.readiness?.issues ?? [])];

  if (!levels.levels_match) {
    notes.push('stored character level does not match summed class levels');
  }

  if (proficiency.derived_bonus !== null && proficiency.stored_character_bonus === null) {
    notes.push('proficiency bonus is not stored on the character record; using the derived 5e value');
  }

  if (
    proficiency.derived_bonus !== null &&
    proficiency.stored_character_bonus !== null &&
    proficiency.stored_character_bonus !== proficiency.derived_bonus
  ) {
    notes.push('stored proficiency bonus does not match the derived 5e value');
  }

  if (movement.walk.effective_speed === null) {
    notes.push('effective walk speed cannot be derived yet');
  }

  return {
    is_mechanically_complete: notes.length === 0,
    notes,
  };
}

function buildRulesSummary(levels, proficiency, movement, languages, senses, defenses, features, overrides) {
  return {
    total_level: levels.total_level,
    proficiency_bonus: proficiency.derived_bonus,
    effective_walk_speed: movement.summary.effective_walk_speed,
    effective_language_count: languages.summary.effective_count,
    sense_count: senses.summary.sense_count,
    resistance_count: defenses.resistances.length,
    mechanical_feature_count: features.summary.mechanical_count,
    active_override_count: overrides.active_count,
  };
}

export function deriveCharacterRules(raw, context) {
  const featureSourcesById = buildFeatureSourceIndex(raw.derived_features);
  const levels = buildLevelsView(raw, raw.classes);
  const proficiency = {
    derived_bonus: calculateProficiencyBonus(levels.total_level),
    stored_character_bonus:
      raw.proficiency_bonus !== null && raw.proficiency_bonus !== undefined
        ? Number(raw.proficiency_bonus)
        : null,
  };
  const abilities = buildAbilityView(raw, context.abilityEffects, featureSourcesById);
  const movement = buildMovementView(raw, context.movementContext, context.speedEffects, featureSourcesById);
  const languages = buildLanguagesView(raw.languages);
  const senses = buildSensesView(context.senseEffects, featureSourcesById);
  const defenses = buildDefensesView(context.resistanceEffects, featureSourcesById);
  const features = buildFeaturesView(
    raw,
    {
      abilityByFeatureId: groupByFeatureId(context.abilityEffects),
      skillByFeatureId: groupByFeatureId(context.skillEffects),
      languageByFeatureId: groupByFeatureId(context.languageGrantEffects),
      spellByFeatureId: groupByFeatureId(context.spellGrantEffects),
      speedByFeatureId: groupByFeatureId(context.speedEffects),
      senseByFeatureId: groupByFeatureId(context.senseEffects),
      resistanceByFeatureId: groupByFeatureId(context.resistanceEffects),
    },
    raw.overrides ?? []
  );
  const overrideSummary = buildOverrideSummary(raw.overrides ?? []);
  const readiness = buildMechanicalReadiness(raw, levels, proficiency, movement);

  return {
    identity: {
      id: raw.id,
      account_id: raw.account_id,
      name: raw.name,
      is_active: raw.is_active,
    },
    levels,
    abilities,
    proficiency: {
      ...proficiency,
      matches_stored:
        proficiency.stored_character_bonus === null || proficiency.derived_bonus === null
          ? null
          : proficiency.stored_character_bonus === proficiency.derived_bonus,
    },
    movement,
    languages,
    senses: senses.effective,
    defenses,
    features,
    overrides: {
      summary: overrideSummary,
    },
    readiness,
    summary: buildRulesSummary(levels, proficiency, movement, languages, senses, defenses, features, overrideSummary),
  };
}
