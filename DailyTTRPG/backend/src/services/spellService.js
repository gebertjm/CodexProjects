import { query, withTransaction } from '../config/db.js';
import {
  selectCharacterClassesQuery,
  selectCharacterForCompositionQuery,
  selectCharacterForReadQuery,
} from '../db/queries/characterComposition.js';
import {
  insertCharacterSpellQuery,
  insertSpellSlotStateRowQuery,
  selectCharacterManualSpellsQuery,
  selectCharacterSpellByIdQuery,
  selectDerivedSpellGrantsQuery,
  selectSpellByIdQuery,
  selectSpellSlotStateQuery,
  selectSpellSlotStateRowForUpdateQuery,
  selectSpellsQuery,
  updateCharacterSpellQuery,
  updateSpellSlotStateRowQuery,
} from '../db/queries/spells.js';
import { selectClassSpellsByClassIdQuery } from '../db/queries/advancement.js';
import { createHttpError } from '../utils/httpError.js';
import {
  computeSpellSlotPools,
  getClassSpellProfile,
  getKnownSpellLimitForClass,
  getMaxSpellLevelForClassEntry,
  getPreparedSpellLimitForClass,
  getSpellcastingSummary,
} from '../utils/spellcastingRules.js';
import {
  findApplicableOverride,
  getCharacterSpellSlotOverrideAdjustments,
} from './overrideService.js';

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

function mapCharacterClassRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    class_level: Number(row.class_level),
    is_primary: row.is_primary,
    class: {
      id: Number(row.class_id),
      name: row.class_name,
      slug: row.class_slug,
      hit_die: row.hit_die,
      primary_ability_text: row.primary_ability_text,
    },
    subclass: row.subclass_id
      ? { id: Number(row.subclass_id), name: row.subclass_name, slug: row.subclass_slug }
      : null,
  };
}

function mapSpellRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    level: Number(row.level),
    school: row.school,
    casting_time: row.casting_time,
    range_text: row.range_text,
    duration_text: row.duration_text,
    components_text: row.components_text,
    ritual: row.ritual,
    concentration: row.concentration,
    description: row.description,
    source: row.source,
    is_active: row.is_active,
  };
}

function mapManualCharacterSpellRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    spell_source: row.spell_source,
    is_known: row.is_known,
    is_prepared: row.is_prepared,
    is_always_prepared: row.is_always_prepared,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    source_class: row.source_class_id
      ? { id: Number(row.source_class_id), name: row.source_class_name, slug: row.source_class_slug }
      : null,
    spell: {
      id: Number(row.spell_id),
      name: row.spell_name,
      slug: row.spell_slug,
      level: Number(row.spell_level),
      school: row.spell_school,
      ritual: row.ritual,
      concentration: row.concentration,
      source: row.spell_book_source,
    },
  };
}

function mapDerivedSpellRow(row) {
  return {
    source_type: 'derived',
    grant_type: row.grant_type,
    granted_at_level: row.granted_at_level !== null ? Number(row.granted_at_level) : null,
    granted_by_feature: {
      id: Number(row.feature_id),
      name: row.feature_name,
      slug: row.feature_slug,
    },
    spell: {
      id: Number(row.spell_id),
      name: row.spell_name,
      slug: row.spell_slug,
      level: Number(row.spell_level),
      school: row.spell_school,
      ritual: row.ritual,
      concentration: row.concentration,
      source: row.spell_book_source,
    },
  };
}

function mapSlotStateRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    slot_pool: row.slot_pool,
    slot_level: Number(row.slot_level),
    slots_used: Number(row.slots_used),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getCharacterForRead(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterForReadQuery, [characterId]);
  return result.rows[0] || null;
}

async function getCharacterForComposition(characterId, executor) {
  const result = await executor.query(selectCharacterForCompositionQuery, [characterId]);
  const character = result.rows[0] || null;
  assertCharacterIsComposable(character);
  return character;
}

async function listCharacterClassesInternal(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterClassesQuery, [characterId]);
  return result.rows.map(mapCharacterClassRow);
}

async function listManualCharacterSpellsInternal(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterManualSpellsQuery, [characterId]);
  return result.rows.map(mapManualCharacterSpellRow);
}

async function listDerivedCharacterSpellsInternal(characterId, executor = { query }) {
  const result = await executor.query(selectDerivedSpellGrantsQuery, [characterId]);
  return result.rows.map(mapDerivedSpellRow);
}

function buildSpellCollections(manual, derived) {
  const effectiveMap = new Map();
  for (const entry of manual) {
    effectiveMap.set(entry.spell.id, entry);
  }
  for (const entry of derived) {
    if (!effectiveMap.has(entry.spell.id)) {
      effectiveMap.set(entry.spell.id, entry);
    }
  }
  return {
    manual,
    derived,
    effective: Array.from(effectiveMap.values()).sort((left, right) => {
      const levelDelta = left.spell.level - right.spell.level;
      return levelDelta !== 0 ? levelDelta : left.spell.name.localeCompare(right.spell.name);
    }),
  };
}

function getClassEntryByClassId(classEntries, classId) {
  return classEntries.find((entry) => entry.class.id === classId) || null;
}

function countKnownSpellsForClass(manualSpells, classId, { cantripsOnly = false } = {}) {
  return manualSpells.filter((entry) => {
    if (!entry.source_class || entry.source_class.id !== classId) {
      return false;
    }

    if (cantripsOnly) {
      return entry.spell.level === 0;
    }

    return entry.spell.level > 0;
  }).length;
}

function countPreparedSpellsForClass(manualSpells, classId) {
  return manualSpells.filter((entry) => entry.source_class && entry.source_class.id === classId && entry.is_prepared && entry.spell.level > 0).length;
}

async function findIllegalSpellGrantOverride(characterId, spell, executor) {
  return findApplicableOverride(
    characterId,
    {
      override_category: 'grant_illegal_spell',
      target_scope: 'character',
      target_entity_id: null,
      subject_keys: [spell.slug, `spell:${spell.id}`, `spell:${spell.slug}`],
    },
    executor
  );
}

async function findPreparationLimitOverride(characterId, classEntry, spell, executor) {
  return findApplicableOverride(
    characterId,
    {
      override_category: 'bypass_spell_preparation_limit',
      target_scope: 'character',
      target_entity_id: null,
      subject_keys: [
        spell.slug,
        `spell:${spell.id}`,
        classEntry.class.slug,
        `class:${classEntry.class.id}`,
        `class:${classEntry.class.slug}`,
      ],
    },
    executor
  );
}

async function validatePreparationState({
  characterId,
  classEntry,
  classProfile,
  spell,
  isKnown,
  isPrepared,
  manualSpells,
  character,
  executor,
}) {
  if (spell.level === 0) {
    if (!isKnown) {
      throw createHttpError('Cantrips must be known', 400);
    }
    if (isPrepared) {
      throw createHttpError('Cantrips cannot be marked as prepared', 400);
    }
  }

  if (classProfile.spell_model === 'known' && isPrepared) {
    throw createHttpError(`Spells from ${classEntry.class.name} cannot be prepared individually`, 400);
  }

  if (classProfile.spell_model === 'prepared' && spell.level > 0) {
    const preparedLimit = getPreparedSpellLimitForClass(character, classEntry.class.slug, classEntry.class_level);
    if (isPrepared && preparedLimit !== null) {
      const currentPrepared = countPreparedSpellsForClass(manualSpells, classEntry.class.id);
      if (currentPrepared + 1 > preparedLimit) {
        const override = await findPreparationLimitOverride(characterId, classEntry, spell, executor);
        if (!override) {
          throw createHttpError(`Prepared spell limit reached for ${classEntry.class.name}`, 400);
        }
      }
    }
  }

  const knownLimit = getKnownSpellLimitForClass(classEntry.class.slug, classEntry.class_level, spell.level);
  if (knownLimit !== null) {
    const currentKnown = countKnownSpellsForClass(manualSpells, classEntry.class.id, {
      cantripsOnly: spell.level === 0,
    });
    if (currentKnown + 1 > knownLimit) {
      const targetLabel = spell.level === 0 ? 'cantrips' : `level ${spell.level} spells`;
      throw createHttpError(`Known ${targetLabel} limit reached for ${classEntry.class.name}`, 400);
    }
  }
}

async function validateSpellAgainstClassList(characterId, classEntry, spell, executor) {
  const result = await executor.query(selectClassSpellsByClassIdQuery, [classEntry.class.id]);
  const validSpellIds = new Set(result.rows.map((row) => Number(row.spell_id)));

  if (validSpellIds.has(Number(spell.id))) {
    return;
  }

  const override = await findIllegalSpellGrantOverride(characterId, spell, executor);
  if (!override) {
    throw createHttpError(`${spell.name} is not on the ${classEntry.class.name} spell list`, 400);
  }
}

function validateSpellForClassAccess(classEntry, spell) {
  const maxSpellLevel = getMaxSpellLevelForClassEntry(classEntry);
  if (spell.level > maxSpellLevel) {
    throw createHttpError(`${classEntry.class.name} level ${classEntry.class_level} cannot access level ${spell.level} spells yet`, 400);
  }
}

function buildSlotReadModel(classEntries, slotStateRows, adjustmentMap) {
  const pools = computeSpellSlotPools(classEntries);
  const stateMap = new Map(slotStateRows.map((row) => [`${row.slot_pool}:${row.slot_level}`, row]));
  const poolMap = new Map(
    pools.map((pool) => [
      pool.slot_pool,
      {
        slot_pool: pool.slot_pool,
        caster_level: pool.caster_level,
        slots: pool.slots,
      },
    ])
  );

  for (const adjustment of adjustmentMap.values()) {
    if (!poolMap.has(adjustment.slot_pool)) {
      poolMap.set(adjustment.slot_pool, {
        slot_pool: adjustment.slot_pool,
        caster_level: 0,
        slots: {},
      });
    }
  }

  return Array.from(poolMap.values()).map((pool) => {
    const slotLevels = new Set([
      ...Object.keys(pool.slots).map(Number),
      ...Array.from(adjustmentMap.values())
        .filter((entry) => entry.slot_pool === pool.slot_pool)
        .map((entry) => Number(entry.slot_level)),
    ]);

    const slots = Array.from(slotLevels)
      .sort((left, right) => left - right)
      .map((slotLevel) => {
        const baseTotal = Number(pool.slots?.[slotLevel] ?? 0);
        const adjustment = adjustmentMap.get(`${pool.slot_pool}:${slotLevel}`) || null;
        const totalSlots = Math.max(0, baseTotal + Number(adjustment?.adjustment ?? 0));
        const state = stateMap.get(`${pool.slot_pool}:${slotLevel}`);
        const used = state ? Number(state.slots_used) : 0;

        return {
          slot_level: Number(slotLevel),
          slot_pool: pool.slot_pool,
          base_total_slots: baseTotal,
          override_adjustment: Number(adjustment?.adjustment ?? 0),
          total_slots: totalSlots,
          slots_used: used,
          slots_remaining: totalSlots - used,
          overridden: adjustment !== null,
          applied_overrides: adjustment?.override_ids ?? [],
        };
      });

    return {
      slot_pool: pool.slot_pool,
      caster_level: pool.caster_level,
      slots,
    };
  });
}

async function getCharacterSpellSlotsInternal(characterId, classEntries, executor = { query }) {
  const stateResult = await executor.query(selectSpellSlotStateQuery, [characterId]);
  const adjustments = await getCharacterSpellSlotOverrideAdjustments(characterId, executor);
  return buildSlotReadModel(classEntries, stateResult.rows.map(mapSlotStateRow), adjustments);
}

function getSpellcastingEnvelope(character, classEntries, manualSpells, derivedSpells, slotReadModel) {
  return {
    summary: getSpellcastingSummary(classEntries, character),
    spells: buildSpellCollections(manualSpells, derivedSpells),
    slots: slotReadModel,
  };
}

export async function listSpells() {
  const result = await query(selectSpellsQuery);
  return result.rows.map(mapSpellRow);
}

export async function getSpellById(spellId) {
  const result = await query(selectSpellByIdQuery, [spellId]);
  return result.rowCount > 0 ? mapSpellRow(result.rows[0]) : null;
}

export async function listCharacterSpells(characterId) {
  const character = await getCharacterForRead(characterId);
  if (!character) {
    throw createHttpError('Character not found', 404);
  }
  const [manual, derived] = await Promise.all([
    listManualCharacterSpellsInternal(characterId),
    listDerivedCharacterSpellsInternal(characterId),
  ]);
  return buildSpellCollections(manual, derived);
}

export async function addCharacterSpell(characterId, input) {
  try {
    return await withTransaction(async (client) => {
      const character = await getCharacterForComposition(characterId, client);
      const classEntries = await listCharacterClassesInternal(characterId, client);
      const spellResult = await client.query(selectSpellByIdQuery, [input.spell_id]);
      const spell = spellResult.rowCount > 0 ? mapSpellRow(spellResult.rows[0]) : null;
      if (!spell) {
        throw createHttpError('Invalid spell_id', 400);
      }
      const classEntry = getClassEntryByClassId(classEntries, input.source_class_id);
      if (!classEntry) {
        throw createHttpError('source_class_id must reference a class the character actually has', 400);
      }
      const classProfile = getClassSpellProfile(classEntry.class.slug);
      if (!classProfile) {
        const override = await findIllegalSpellGrantOverride(characterId, spell, client);
        if (!override) {
          throw createHttpError(`${classEntry.class.name} is not a spellcasting class in the current Stage 2B rules`, 400);
        }
      }
      if (classProfile) {
        try {
          validateSpellForClassAccess(classEntry, spell);
        } catch (error) {
          const override = await findIllegalSpellGrantOverride(characterId, spell, client);
          if (!override) {
            throw error;
          }
        }
        await validateSpellAgainstClassList(characterId, classEntry, spell, client);
      }
      const existingManualSpells = await listManualCharacterSpellsInternal(characterId, client);
      if (existingManualSpells.some((entry) => entry.spell.id === input.spell_id)) {
        throw createHttpError('That spell has already been attached to the character', 409);
      }
      const derivedSpells = await listDerivedCharacterSpellsInternal(characterId, client);
      if (derivedSpells.some((entry) => entry.spell.id === input.spell_id)) {
        throw createHttpError('That spell is already granted automatically by the current character composition', 409);
      }
      if (classProfile) {
        await validatePreparationState({
          characterId,
          classEntry,
          classProfile,
          spell,
          isKnown: input.is_known,
          isPrepared: input.is_prepared,
          manualSpells: existingManualSpells,
          character,
          executor: client,
        });
      } else if (spell.level === 0) {
        if (!input.is_known) {
          throw createHttpError('Cantrips must be known', 400);
        }

        if (input.is_prepared) {
          throw createHttpError('Cantrips cannot be marked as prepared', 400);
        }
      }
      await client.query(insertCharacterSpellQuery, [
        characterId,
        input.spell_id,
        input.spell_source,
        input.source_class_id,
        input.is_known,
        input.is_prepared,
        false,
        input.notes,
      ]);
      return buildSpellCollections(await listManualCharacterSpellsInternal(characterId, client), derivedSpells);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw createHttpError('That spell has already been attached to the character', 409);
    }
    throw error;
  }
}

export async function updateCharacterSpell(characterId, characterSpellId, input) {
  return withTransaction(async (client) => {
    const character = await getCharacterForComposition(characterId, client);
    const classEntries = await listCharacterClassesInternal(characterId, client);
    const spellRecordResult = await client.query(selectCharacterSpellByIdQuery, [characterSpellId]);
    const spellRecord = spellRecordResult.rowCount > 0 ? mapManualCharacterSpellRow(spellRecordResult.rows[0]) : null;
    if (!spellRecord || spellRecord.character_id !== characterId) {
      throw createHttpError('Character spell not found', 404);
    }
    const classEntry = spellRecord.source_class ? getClassEntryByClassId(classEntries, spellRecord.source_class.id) : null;
    if (!classEntry) {
      throw createHttpError('The source class for this spell is no longer available on the character', 400);
    }
    const classProfile = getClassSpellProfile(classEntry.class.slug);
    if (!classProfile) {
      const override = await findIllegalSpellGrantOverride(characterId, spellRecord.spell, client);
      if (!override) {
        throw createHttpError('The source class for this spell is not spellcasting-capable in Stage 2B', 400);
      }
    } else {
      await validateSpellAgainstClassList(characterId, classEntry, spellRecord.spell, client);
    }
    const isKnown = input.is_known ?? spellRecord.is_known;
    const isPrepared = input.is_prepared ?? spellRecord.is_prepared;
    const notes = input.notes ?? spellRecord.notes;
    const manualSpells = (await listManualCharacterSpellsInternal(characterId, client)).filter((entry) => entry.id !== characterSpellId);
    if (classProfile) {
      await validatePreparationState({
        characterId,
        classEntry,
        classProfile,
        spell: spellRecord.spell,
        isKnown,
        isPrepared,
        manualSpells,
        character,
        executor: client,
      });
    }
    await client.query(updateCharacterSpellQuery, [characterSpellId, isKnown, isPrepared, notes]);
    return buildSpellCollections(await listManualCharacterSpellsInternal(characterId, client), await listDerivedCharacterSpellsInternal(characterId, client));
  });
}

export async function getCharacterSpellSlots(characterId) {
  const character = await getCharacterForRead(characterId);
  if (!character) {
    throw createHttpError('Character not found', 404);
  }
  return getCharacterSpellSlotsInternal(characterId, await listCharacterClassesInternal(characterId));
}

export async function changeCharacterSpellSlots(characterId, input) {
  return withTransaction(async (client) => {
    await getCharacterForComposition(characterId, client);
    const classEntries = await listCharacterClassesInternal(characterId, client);
    const slotReadModel = await getCharacterSpellSlotsInternal(characterId, classEntries, client);
    const targetPool = slotReadModel.find((pool) => pool.slot_pool === input.slot_pool) || null;
    if (!targetPool) {
      throw createHttpError(`Character has no ${input.slot_pool} spell slot pool`, 400);
    }
    const targetSlot = targetPool.slots.find((slot) => slot.slot_level === input.slot_level) || null;
    if (!targetSlot) {
      throw createHttpError(`Character has no ${input.slot_pool} spell slots of level ${input.slot_level}`, 400);
    }
    let nextUsed = targetSlot.slots_used;
    if (input.mode === 'use') {
      if (targetSlot.slots_remaining < input.amount) {
        throw createHttpError('Cannot use more spell slots than remain', 400);
      }
      nextUsed += input.amount;
    } else if (input.mode === 'restore') {
      if (targetSlot.slots_used < input.amount) {
        throw createHttpError('Cannot restore more spell slots than are currently used', 400);
      }
      nextUsed -= input.amount;
    } else {
      throw createHttpError('Invalid spell slot mutation mode', 400);
    }
    const stateResult = await client.query(selectSpellSlotStateRowForUpdateQuery, [
      characterId,
      input.slot_pool,
      input.slot_level,
    ]);
    if (stateResult.rowCount === 0) {
      await client.query(insertSpellSlotStateRowQuery, [characterId, input.slot_pool, input.slot_level, nextUsed]);
    } else {
      await client.query(updateSpellSlotStateRowQuery, [stateResult.rows[0].id, nextUsed]);
    }
    return getCharacterSpellSlotsInternal(characterId, classEntries, client);
  });
}

export async function getCharacterSpellcastingData(characterId) {
  const character = await getCharacterForRead(characterId);
  if (!character) {
    return null;
  }
  const [classEntries, manualSpells, derivedSpells] = await Promise.all([
    listCharacterClassesInternal(characterId),
    listManualCharacterSpellsInternal(characterId),
    listDerivedCharacterSpellsInternal(characterId),
  ]);
  return getSpellcastingEnvelope(character, classEntries, manualSpells, derivedSpells, await getCharacterSpellSlotsInternal(characterId, classEntries));
}
