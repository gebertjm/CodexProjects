import { getCharacterById } from './characterCompositionService.js';
import { getCharacterRules } from './characterRulesService.js';

function buildCoreCharacter(raw) {
  return {
    id: raw.id,
    account_id: raw.account_id,
    name: raw.name,
    ruleset_version: raw.ruleset_version,
    level: raw.level,
    experience_points: raw.experience_points,
    pending_level_count: raw.pending_level_count ?? 0,
    level_up_available: raw.level_up_available ?? false,
    last_level_up_available_at: raw.last_level_up_available_at ?? null,
    strength: raw.strength,
    dexterity: raw.dexterity,
    constitution: raw.constitution,
    intelligence: raw.intelligence,
    wisdom: raw.wisdom,
    charisma: raw.charisma,
    max_hit_points: raw.max_hit_points,
    current_hit_points: raw.current_hit_points,
    temporary_hit_points: raw.temporary_hit_points,
    armor_class: raw.armor_class,
    speed: raw.speed,
    proficiency_bonus: raw.proficiency_bonus,
    inspiration: raw.inspiration,
    personality_traits: raw.personality_traits,
    ideals: raw.ideals,
    bonds: raw.bonds,
    flaws: raw.flaws,
    backstory: raw.backstory,
    notes: raw.notes,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function calculateDerivedProficiencyBonus(totalLevel) {
  if (!Number.isInteger(totalLevel) || totalLevel < 1) {
    return null;
  }

  return Math.floor((totalLevel - 1) / 4) + 2;
}

function buildOverrideSummary(overrides) {
  const active = overrides.filter((entry) => entry.is_active);
  const inactive = overrides.filter((entry) => !entry.is_active);
  const categories = [...new Set(active.map((entry) => entry.override_category))].sort();
  const domains = [...new Set(
    active.map((entry) => {
      if (entry.override_category.includes('spell')) {
        return 'spellcasting';
      }

      if (entry.override_category.includes('inventory')) {
        return 'inventory';
      }

      return 'composition';
    })
  )].sort();

  return {
    total_count: overrides.length,
    active_count: active.length,
    inactive_count: inactive.length,
    active_categories: categories,
    affected_domains: domains,
  };
}

function findRelevantOverrides(overrides, category, subjectKeys) {
  return overrides.filter((entry) => {
    if (!entry.is_active || entry.override_category !== category) {
      return false;
    }

    if (!entry.subject_key) {
      return true;
    }

    return subjectKeys.includes(entry.subject_key);
  });
}

function mapOverrideReference(override) {
  return {
    id: override.id,
    category: override.override_category,
    reason: override.reason,
    actor_account_id: override.actor_account_id,
    actor_label: override.actor_label,
  };
}

function annotateFeats(feats, overrides) {
  return feats.map((entry) => {
    const relevantOverrides = findRelevantOverrides(overrides, 'bypass_feat_prerequisite', [
      entry.feat.slug,
      `feat:${entry.feat.id}`,
      `feat:${entry.feat.slug}`,
    ]);

    return {
      ...entry,
      effective_state: {
        overridden: relevantOverrides.length > 0,
        active_overrides: relevantOverrides.map(mapOverrideReference),
      },
    };
  });
}

function annotateSpellCollection(entries, overrides) {
  return entries.map((entry) => {
    const relevantOverrides = findRelevantOverrides(overrides, 'grant_illegal_spell', [
      entry.spell.slug,
      `spell:${entry.spell.id}`,
      `spell:${entry.spell.slug}`,
    ]);

    return {
      ...entry,
      effective_state: {
        overridden: relevantOverrides.length > 0,
        active_overrides: relevantOverrides.map(mapOverrideReference),
      },
    };
  });
}

function buildSpellcastingView(spellcasting, overrides) {
  if (!spellcasting) {
    return null;
  }

  const slotOverrideCount = spellcasting.slots.reduce(
    (sum, pool) => sum + pool.slots.filter((slot) => slot.overridden).length,
    0
  );

  return {
    summary: {
      ...spellcasting.summary,
      effective_overrides: {
        slot_adjustments_active: slotOverrideCount,
      },
    },
    spells: {
      manual: annotateSpellCollection(spellcasting.spells.manual, overrides),
      derived: spellcasting.spells.derived,
      effective: annotateSpellCollection(spellcasting.spells.effective, overrides),
    },
    slots: spellcasting.slots,
  };
}

function buildInventoryView(inventory) {
  if (!inventory) {
    return null;
  }

  const overrideAffectedItems = inventory.items.filter((item) => item.uses?.overridden).length;

  return {
    items: inventory.items,
    tree: inventory.tree,
    currency: inventory.currency,
    summary: {
      ...inventory.summary,
      override_affected_items: overrideAffectedItems,
    },
  };
}

function buildReadiness(raw, totalClassLevel, derivedProficiencyBonus) {
  const notes = [...(raw.readiness?.issues ?? [])];

  if (raw.level !== totalClassLevel) {
    notes.push('stored character level does not match summed class levels');
  }

  if (raw.proficiency_bonus !== null && raw.proficiency_bonus !== undefined) {
    if (derivedProficiencyBonus !== null && Number(raw.proficiency_bonus) !== derivedProficiencyBonus) {
      notes.push('stored proficiency bonus does not match current total level');
    }
  } else {
    notes.push('proficiency bonus has not been set on the character record');
  }

  return {
    isComplete: notes.length === 0,
    notes,
  };
}

function buildSheetSummary(raw, totalClassLevel, derivedProficiencyBonus, overrideSummary, inventory, spellcasting) {
  return {
    total_class_level: totalClassLevel,
    stored_character_level: Number(raw.level),
    levels_match: Number(raw.level) === totalClassLevel,
    stored_proficiency_bonus:
      raw.proficiency_bonus !== null && raw.proficiency_bonus !== undefined
        ? Number(raw.proficiency_bonus)
        : null,
    derived_proficiency_bonus: derivedProficiencyBonus,
    active_override_count: overrideSummary.active_count,
    total_languages: raw.languages?.effective?.length ?? 0,
    total_feats: raw.feats?.length ?? 0,
    total_spells: spellcasting?.spells?.effective?.length ?? 0,
    total_inventory_items: inventory?.items?.length ?? 0,
    total_carried_weight: inventory?.summary?.total_carried_weight ?? 0,
  };
}

export async function getCharacterSheet(characterId) {
  const raw = await getCharacterById(characterId);

  if (!raw) {
    return null;
  }

  const overrides = raw.overrides ?? [];
  const totalClassLevel = raw.classes.reduce((sum, entry) => sum + Number(entry.class_level), 0);
  const derivedProficiencyBonus = calculateDerivedProficiencyBonus(totalClassLevel);
  const overrideSummary = buildOverrideSummary(overrides);
  const feats = annotateFeats(raw.feats, overrides);
  const spellcasting = buildSpellcastingView(raw.spellcasting, overrides);
  const inventory = buildInventoryView(raw.inventory);
  const derivedRules = await getCharacterRules(characterId, raw);

  return {
    character: buildCoreCharacter(raw),
    identity: {
      id: raw.id,
      account_id: raw.account_id,
      name: raw.name,
      is_active: raw.is_active,
    },
    ancestry: {
      race: raw.race,
      subrace: raw.subrace,
    },
    background: raw.background,
    alignment: raw.alignment,
    classes: raw.classes,
    languages: raw.languages,
    feats,
    derived_features: raw.derived_features,
    spellcasting,
    inventory,
    derived_rules: derivedRules,
    overrides: {
      items: overrides,
      summary: overrideSummary,
    },
    summary: buildSheetSummary(raw, totalClassLevel, derivedProficiencyBonus, overrideSummary, inventory, spellcasting),
    readiness: buildReadiness(raw, totalClassLevel, derivedProficiencyBonus),
  };
}
