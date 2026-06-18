import { query, withTransaction } from '../config/db.js';
import {
  clearPrimaryCharacterClassesQuery,
  insertCharacterClassQuery,
  insertCharacterFeatQuery,
  insertCharacterLanguageQuery,
  selectCharacterClassesQuery,
  selectCharacterFeatsQuery,
  selectCharacterForCompositionQuery,
  selectCharacterForReadQuery,
  selectCharacterLanguagesManualQuery,
  selectClassByIdQuery,
  selectDerivedFeaturesQuery,
  selectDerivedLanguageGrantsQuery,
  selectFeatByIdQuery,
  selectLanguageByIdQuery,
  selectSubclassByIdQuery,
  updateCharacterClassSummaryQuery,
} from '../db/queries/characterComposition.js';
import { createHttpError } from '../utils/httpError.js';
import { getCharacterSpellcastingData } from './spellService.js';
import { getCharacterInventoryData } from './inventoryService.js';
import { findApplicableOverride, listCharacterOverrides } from './overrideService.js';

const multiclassAbilityRequirements = {
  barbarian: [{ ability: 'strength', minimum: 13 }],
  bard: [{ ability: 'charisma', minimum: 13 }],
  cleric: [{ ability: 'wisdom', minimum: 13 }],
  druid: [{ ability: 'wisdom', minimum: 13 }],
  fighter: [
    { anyOf: ['strength', 'dexterity'], minimum: 13 },
  ],
  monk: [
    { ability: 'dexterity', minimum: 13 },
    { ability: 'wisdom', minimum: 13 },
  ],
  paladin: [
    { ability: 'strength', minimum: 13 },
    { ability: 'charisma', minimum: 13 },
  ],
  ranger: [
    { ability: 'dexterity', minimum: 13 },
    { ability: 'wisdom', minimum: 13 },
  ],
  rogue: [{ ability: 'dexterity', minimum: 13 }],
  sorcerer: [{ ability: 'charisma', minimum: 13 }],
  warlock: [{ ability: 'charisma', minimum: 13 }],
  wizard: [{ ability: 'intelligence', minimum: 13 }],
};

const featPrerequisiteValidators = {
  'war-caster': (character, classes) => {
    const hasSpellcastingClass = classes.some((entry) => {
      const classSlug = entry.class.slug;
      const classLevel = Number(entry.class_level);

      if (['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'].includes(classSlug)) {
        return classLevel >= 1;
      }

      if (['paladin', 'ranger'].includes(classSlug)) {
        return classLevel >= 2;
      }

      return false;
    });

    if (!hasSpellcastingClass) {
      throw createHttpError(
        'War Caster requires the ability to cast at least one spell, which is not yet present on this character',
        400
      );
    }

    return character;
  },
};

function mapCoreCharacterRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    account_id: row.account_id,
    world_id: row.world_id,
    world:
      row.world_id !== undefined
        ? {
            id: row.world_id,
            name: row.world_name,
            slug: row.world_slug,
          }
        : undefined,
    name: row.name,
    ruleset_version: row.ruleset_version,
    level: row.level,
    experience_points: row.experience_points,
    pending_level_count: row.pending_level_count ?? 0,
    level_up_available: row.level_up_available ?? false,
    last_level_up_available_at: row.last_level_up_available_at ?? null,
    strength: row.strength,
    dexterity: row.dexterity,
    constitution: row.constitution,
    intelligence: row.intelligence,
    wisdom: row.wisdom,
    charisma: row.charisma,
    max_hit_points: row.max_hit_points,
    current_hit_points: row.current_hit_points,
    temporary_hit_points: row.temporary_hit_points,
    armor_class: row.armor_class,
    speed: row.speed,
    proficiency_bonus: row.proficiency_bonus,
    inspiration: row.inspiration,
    personality_traits: row.personality_traits,
    ideals: row.ideals,
    bonds: row.bonds,
    flaws: row.flaws,
    backstory: row.backstory,
    notes: row.notes,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    race: row.race_id ? { id: row.race_id, name: row.race_name, slug: row.race_slug } : null,
    subrace: row.subrace_id ? { id: row.subrace_id, name: row.subrace_name, slug: row.subrace_slug } : null,
    class: row.class_id ? { id: row.class_id, name: row.class_name, slug: row.class_slug } : null,
    subclass: row.subclass_id ? { id: row.subclass_id, name: row.subclass_name, slug: row.subclass_slug } : null,
    background: row.background_id
      ? { id: row.background_id, name: row.background_name, slug: row.background_slug }
      : null,
    alignment: row.alignment_id
      ? {
          id: row.alignment_id,
          name: row.alignment_name,
          abbreviation: row.alignment_abbreviation,
        }
      : null,
  };
}

function mapCharacterClassRow(row) {
  return {
    id: row.id,
    character_id: row.character_id,
    class_level: row.class_level,
    is_primary: row.is_primary,
    class: {
      id: row.class_id,
      name: row.class_name,
      slug: row.class_slug,
      hit_die: row.hit_die,
      primary_ability_text: row.primary_ability_text,
    },
    subclass: row.subclass_id
      ? {
          id: row.subclass_id,
          name: row.subclass_name,
          slug: row.subclass_slug,
        }
      : null,
  };
}

function mapManualLanguageRow(row) {
  return {
    id: row.id,
    character_id: row.character_id,
    source_type: row.source_type,
    language: {
      id: row.language_id,
      name: row.name,
      slug: row.slug,
      script: row.script,
      is_exotic: row.is_exotic,
      source: row.source,
    },
  };
}

function mapFeatRow(row) {
  return {
    id: row.id,
    character_id: row.character_id,
    acquired_level: row.acquired_level,
    notes: row.notes,
    feat: {
      id: row.feat_id,
      name: row.name,
      slug: row.slug,
      prerequisites_text: row.prerequisites_text,
      source: row.source,
    },
  };
}

function mapDerivedFeatureRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    feature_type: row.feature_type,
    description: row.description,
    source: row.source,
    granted_by: {
      source_type: row.source_type,
      source_entity_id: row.source_entity_id,
      source_entity_name: row.source_entity_name,
      granted_at_level: row.granted_at_level,
      display_order: row.display_order,
    },
  };
}

function mapDerivedLanguageGrantRow(row) {
  return {
    source_type: 'derived',
    language: {
      id: row.language_id,
      name: row.name,
      slug: row.slug,
      script: row.script,
      is_exotic: row.is_exotic,
      source: row.source,
    },
    granted_by_feature: {
      id: row.feature_id,
      name: row.feature_name,
      slug: row.feature_slug,
    },
  };
}

function evaluateRequirement(character, requirement) {
  if (requirement.ability) {
    return Number(character[requirement.ability]) >= requirement.minimum;
  }

  if (requirement.anyOf) {
    return requirement.anyOf.some((ability) => Number(character[ability]) >= requirement.minimum);
  }

  return false;
}

function assertCharacterIsComposable(character) {
  if (!character) {
    throw createHttpError('Character not found', 404);
  }

  if (!character.account_is_active) {
    throw createHttpError('Character account is inactive', 400);
  }

  if (!character.is_active) {
    throw createHttpError('Inactive characters cannot be composed further', 400);
  }
}

function getReadiness(character, classes) {
  const issues = [];

  if (!character.is_active) {
    issues.push('character is inactive');
  }

  if (!character.race) {
    issues.push('race is missing');
  }

  if (!character.background) {
    issues.push('background is missing');
  }

  if (classes.length === 0) {
    issues.push('at least one class entry is required');
  }

  const totalClassLevels = classes.reduce((sum, entry) => sum + Number(entry.class_level), 0);

  if (classes.length > 0 && totalClassLevels !== Number(character.level)) {
    issues.push('total class levels do not yet match character level');
  }

  return {
    is_ready_for_adventure: issues.length === 0,
    issues,
  };
}

function buildLanguageCollections(manual, derived) {
  const effectiveMap = new Map();

  for (const entry of manual) {
    effectiveMap.set(entry.language.id, entry);
  }

  for (const entry of derived) {
    if (!effectiveMap.has(entry.language.id)) {
      effectiveMap.set(entry.language.id, entry);
    }
  }

  return {
    manual,
    derived,
    effective: Array.from(effectiveMap.values()).sort((left, right) =>
      left.language.name.localeCompare(right.language.name)
    ),
  };
}

async function requireCharacterForComposition(characterId, executor) {
  const result = await executor.query(selectCharacterForCompositionQuery, [characterId]);
  const character = result.rows[0] || null;
  assertCharacterIsComposable(character);
  return character;
}

async function listCharacterClassesInternal(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterClassesQuery, [characterId]);
  return result.rows.map(mapCharacterClassRow);
}

async function listCharacterManualLanguagesInternal(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterLanguagesManualQuery, [characterId]);
  return result.rows.map(mapManualLanguageRow);
}

async function listCharacterFeatsInternal(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterFeatsQuery, [characterId]);
  return result.rows.map(mapFeatRow);
}

async function listDerivedFeaturesInternal(characterId, executor = { query }) {
  const result = await executor.query(selectDerivedFeaturesQuery, [characterId]);
  return result.rows.map(mapDerivedFeatureRow);
}

async function listDerivedLanguageGrantsInternal(characterId, executor = { query }) {
  const result = await executor.query(selectDerivedLanguageGrantsQuery, [characterId]);
  return result.rows.map(mapDerivedLanguageGrantRow);
}

async function assertSubclassBelongsToClass(subclassId, classId, executor) {
  if (!subclassId) {
    return null;
  }

  const subclassResult = await executor.query(selectSubclassByIdQuery, [subclassId]);
  const subclass = subclassResult.rows[0];

  if (!subclass) {
    throw createHttpError('Invalid subclass_id', 400);
  }

  if (Number(subclass.class_id) !== classId) {
    throw createHttpError('subclass_id must belong to class_id', 400);
  }

  return subclass;
}

function assertMulticlassPrerequisites(character, classEntries) {
  if (classEntries.length <= 1) {
    return;
  }

  for (const entry of classEntries) {
    const requirements = multiclassAbilityRequirements[entry.class.slug] || [];

    for (const requirement of requirements) {
      if (!evaluateRequirement(character, requirement)) {
        throw createHttpError(
          `Character does not meet multiclass ability score prerequisites for ${entry.class.name}`,
          400
        );
      }
    }
  }
}

async function validateFeatPrerequisites(characterId, character, classes, feat, executor = { query }) {
  const validator = featPrerequisiteValidators[feat.slug];

  if (!validator) {
    return null;
  }

  try {
    validator(character, classes);
    return null;
  } catch (error) {
    const override = await findApplicableOverride(
      characterId,
      {
        override_category: 'bypass_feat_prerequisite',
        target_scope: 'character',
        target_entity_id: null,
        subject_keys: [feat.slug, `feat:${feat.id}`, `feat:${feat.slug}`],
      },
      executor
    );

    if (override) {
      return override;
    }

    throw error;
  }
}

export async function listCharacterClasses(characterId) {
  const result = await query(selectCharacterForReadQuery, [characterId]);

  if (result.rowCount === 0) {
    throw createHttpError('Character not found', 404);
  }

  return listCharacterClassesInternal(characterId);
}

export async function addCharacterClass(characterId, input) {
  try {
    return await withTransaction(async (client) => {
      const character = await requireCharacterForComposition(characterId, client);

      const classResult = await client.query(selectClassByIdQuery, [input.class_id]);
      const classRecord = classResult.rows[0];

      if (!classRecord) {
        throw createHttpError('Invalid class_id', 400);
      }

      await assertSubclassBelongsToClass(input.subclass_id, input.class_id, client);

      const existingClasses = await listCharacterClassesInternal(characterId, client);

      if (existingClasses.some((entry) => Number(entry.class.id) === input.class_id)) {
        throw createHttpError('That class has already been added to the character', 409);
      }

      const currentLevelTotal = existingClasses.reduce((sum, entry) => sum + Number(entry.class_level), 0);
      const newLevelTotal = currentLevelTotal + input.class_level;

      if (newLevelTotal > Number(character.level)) {
        throw createHttpError('Total class levels cannot exceed character level', 400);
      }

      const shouldBePrimary = existingClasses.length === 0 || input.is_primary === true;

      if (shouldBePrimary) {
        await client.query(clearPrimaryCharacterClassesQuery, [characterId]);
      }

      await client.query(insertCharacterClassQuery, [
        characterId,
        input.class_id,
        input.subclass_id,
        input.class_level,
        shouldBePrimary,
      ]);

      const updatedClasses = await listCharacterClassesInternal(characterId, client);
      assertMulticlassPrerequisites(character, updatedClasses);

      const primaryEntry = updatedClasses.find((entry) => entry.is_primary) || updatedClasses[0] || null;

      await client.query(updateCharacterClassSummaryQuery, [
        characterId,
        primaryEntry ? primaryEntry.class.id : null,
        primaryEntry?.subclass ? primaryEntry.subclass.id : null,
      ]);

      return updatedClasses;
    });
  } catch (error) {
    if (error.code === '23505') {
      throw createHttpError('That class has already been added to the character', 409);
    }

    throw error;
  }
}

export async function listCharacterLanguages(characterId) {
  const characterResult = await query(selectCharacterForReadQuery, [characterId]);

  if (characterResult.rowCount === 0) {
    throw createHttpError('Character not found', 404);
  }

  const [manual, derived] = await Promise.all([
    listCharacterManualLanguagesInternal(characterId),
    listDerivedLanguageGrantsInternal(characterId),
  ]);

  return buildLanguageCollections(manual, derived);
}

export async function addCharacterLanguage(characterId, languageId) {
  try {
    return await withTransaction(async (client) => {
      await requireCharacterForComposition(characterId, client);

      const languageResult = await client.query(selectLanguageByIdQuery, [languageId]);
      const language = languageResult.rows[0];

      if (!language) {
        throw createHttpError('Invalid language_id', 400);
      }

      const existingManualLanguages = await listCharacterManualLanguagesInternal(characterId, client);

      if (existingManualLanguages.some((entry) => Number(entry.language.id) === languageId)) {
        throw createHttpError('That language has already been added to the character', 409);
      }

      const derivedLanguages = await listDerivedLanguageGrantsInternal(characterId, client);

      if (derivedLanguages.some((entry) => Number(entry.language.id) === languageId)) {
        throw createHttpError('That language is already granted automatically by the character composition', 409);
      }

      await client.query(insertCharacterLanguageQuery, [characterId, languageId]);

      const manual = await listCharacterManualLanguagesInternal(characterId, client);
      return buildLanguageCollections(manual, derivedLanguages);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw createHttpError('That language has already been added to the character', 409);
    }

    throw error;
  }
}

export async function listCharacterFeats(characterId) {
  const characterResult = await query(selectCharacterForReadQuery, [characterId]);

  if (characterResult.rowCount === 0) {
    throw createHttpError('Character not found', 404);
  }

  return listCharacterFeatsInternal(characterId);
}

export async function addCharacterFeat(characterId, input) {
  try {
    return await withTransaction(async (client) => {
      const character = await requireCharacterForComposition(characterId, client);

      const featResult = await client.query(selectFeatByIdQuery, [input.feat_id]);
      const feat = featResult.rows[0];

      if (!feat) {
        throw createHttpError('Invalid feat_id', 400);
      }

      const existingFeats = await listCharacterFeatsInternal(characterId, client);

      if (existingFeats.some((entry) => Number(entry.feat.id) === input.feat_id)) {
        throw createHttpError('That feat has already been added to the character', 409);
      }

      const classes = await listCharacterClassesInternal(characterId, client);
      await validateFeatPrerequisites(characterId, character, classes, feat, client);

      await client.query(insertCharacterFeatQuery, [
        characterId,
        input.feat_id,
        input.acquired_level,
        input.notes,
      ]);

      return listCharacterFeatsInternal(characterId, client);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw createHttpError('That feat has already been added to the character', 409);
    }

    throw error;
  }
}

export async function getCharacterById(characterId) {
  const result = await query(selectCharacterForReadQuery, [characterId]);
  const coreCharacter = mapCoreCharacterRow(result.rows[0] || null);

  if (!coreCharacter) {
    return null;
  }

  const [classes, languages, feats, derivedFeatures, spellcasting, inventory, overrides] = await Promise.all([
    listCharacterClassesInternal(characterId),
    listCharacterLanguages(characterId),
    listCharacterFeatsInternal(characterId),
    listDerivedFeaturesInternal(characterId),
    getCharacterSpellcastingData(characterId),
    getCharacterInventoryData(characterId),
    listCharacterOverrides(characterId),
  ]);

  return {
    ...coreCharacter,
    classes,
    languages,
    feats,
    derived_features: derivedFeatures,
    spellcasting,
    inventory,
    overrides,
    readiness: getReadiness(coreCharacter, classes),
  };
}
