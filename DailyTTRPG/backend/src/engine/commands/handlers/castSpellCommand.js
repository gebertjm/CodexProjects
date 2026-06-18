import { listCharacterSpells, changeCharacterSpellSlots } from '../../../services/spellService.js';
import { createHttpError } from '../../../utils/httpError.js';
import {
  readOptionalPositiveInteger,
  readRequiredPositiveInteger,
} from '../helpers.js';
import { getClassSpellProfile } from '../../../utils/spellcastingRules.js';

function cleanSlotPool(value) {
  if (value === undefined || value === null || value === '') {
    return 'standard';
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return 'standard';
  }

  if (!['standard', 'pact_magic'].includes(normalized)) {
    throw createHttpError('payload.slotPool must be standard or pact_magic', 400);
  }

  return normalized;
}

function findSpellEntry(spells, spellId) {
  return spells.effective.find((entry) => Number(entry.spell.id) === spellId) || null;
}

function assertManualSpellIsCastable(entry) {
  if (!entry.is_known) {
    throw createHttpError('That spell is not currently known by the character', 409);
  }

  if (entry.spell.level === 0) {
    return {
      requiresSlot: false,
      slotLevel: 0,
      sourceType: 'manual',
      sourceClass: entry.source_class,
    };
  }

  const profile = entry.source_class ? getClassSpellProfile(entry.source_class.slug) : null;

  if (profile?.spell_model === 'prepared' && !entry.is_always_prepared && !entry.is_prepared) {
    throw createHttpError('That spell is not currently prepared', 409);
  }

  return {
    requiresSlot: true,
    slotLevel: entry.spell.level,
    sourceType: 'manual',
    sourceClass: entry.source_class,
  };
}

function assertDerivedSpellIsCastable(entry) {
  if (entry.grant_type === 'at_will') {
    return {
      requiresSlot: false,
      slotLevel: 0,
      sourceType: 'derived',
      sourceFeature: entry.granted_by_feature,
    };
  }

  if (['always_prepared', 'prepared', 'known'].includes(entry.grant_type)) {
    return {
      requiresSlot: entry.spell.level > 0,
      slotLevel: entry.spell.level,
      sourceType: 'derived',
      sourceFeature: entry.granted_by_feature,
    };
  }

  throw createHttpError(
    'This derived spell grant is not yet executable through the command system',
    409
  );
}

function resolveCastability(entry) {
  if (entry.source_type === 'derived') {
    return assertDerivedSpellIsCastable(entry);
  }

  return assertManualSpellIsCastable(entry);
}

export const castSpellCommand = {
  type: 'cast_spell',
  async execute({ command }) {
    const spellId = readRequiredPositiveInteger(command.payload.spellId, 'payload.spellId');
    const requestedSlotLevel = readOptionalPositiveInteger(
      command.payload.slotLevel,
      'payload.slotLevel',
      null
    );
    const slotPool = cleanSlotPool(command.payload.slotPool);
    const spells = await listCharacterSpells(command.characterId);
    const entry = findSpellEntry(spells, spellId);

    if (!entry) {
      throw createHttpError('That spell is not attached to the character', 404);
    }

    const castability = resolveCastability(entry);
    const slotLevel = requestedSlotLevel ?? castability.slotLevel;

    if (!castability.requiresSlot) {
      if (requestedSlotLevel !== null && requestedSlotLevel !== 0) {
        throw createHttpError('This spell does not require a spell slot to cast', 400);
      }

      return {
        effects: {
          cast: {
            spell: entry.spell,
            source_type: castability.sourceType,
            source_class: castability.sourceClass ?? null,
            source_feature: castability.sourceFeature ?? null,
            consumed_slot: null,
          },
        },
      };
    }

    if (slotLevel < entry.spell.level) {
      throw createHttpError('payload.slotLevel cannot be lower than the spell level', 400);
    }

    const spellSlots = await changeCharacterSpellSlots(command.characterId, {
      mode: 'use',
      slot_pool: slotPool,
      slot_level: slotLevel,
      amount: 1,
    });

    return {
      effects: {
        cast: {
          spell: entry.spell,
          source_type: castability.sourceType,
          source_class: castability.sourceClass ?? null,
          source_feature: castability.sourceFeature ?? null,
          consumed_slot: {
            slot_pool: slotPool,
            slot_level: slotLevel,
            amount: 1,
          },
        },
        spell_slots: spellSlots,
      },
    };
  },
};
