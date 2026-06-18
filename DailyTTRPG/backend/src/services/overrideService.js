import { query, withTransaction } from '../config/db.js';
import { selectCharacterClassesQuery, selectCharacterForReadQuery } from '../db/queries/characterComposition.js';
import {
  selectActiveCharacterOverridesByCategoryQuery,
  selectCharacterByIdQuery,
  selectCharacterItemOwnerQuery,
  selectCharacterOverridesQuery,
  selectMatchingActiveOverridesQuery,
  selectOverrideByIdQuery,
  insertOverrideQuery,
  updateOverrideQuery,
} from '../db/queries/overrides.js';
import { selectSpellSlotStateQuery } from '../db/queries/spells.js';
import { createHttpError } from '../utils/httpError.js';
import { computeSpellSlotPools } from '../utils/spellcastingRules.js';

const overrideDefinitions = {
  bypass_feat_prerequisite: {
    operation_type: 'allow',
    allowed_target_scopes: ['character'],
    value_mode: 'optional',
  },
  grant_illegal_spell: {
    operation_type: 'allow',
    allowed_target_scopes: ['character'],
    value_mode: 'optional',
  },
  bypass_spell_preparation_limit: {
    operation_type: 'allow',
    allowed_target_scopes: ['character'],
    value_mode: 'optional',
  },
  adjust_spell_slots: {
    operation_type: 'adjust',
    allowed_target_scopes: ['character'],
    value_mode: 'required',
  },
  override_inventory_item_uses: {
    operation_type: 'replace',
    allowed_target_scopes: ['character_item'],
    value_mode: 'required',
  },
};

function mapOverrideRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    target_scope: row.target_scope,
    target_entity_id: row.target_entity_id !== null ? Number(row.target_entity_id) : null,
    override_category: row.override_category,
    subject_key: row.subject_key,
    operation_type: row.operation_type,
    value_json: row.value_json ?? null,
    reason: row.reason,
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    actor_label: row.actor_label,
    actor: row.actor_account_id
      ? {
          account_id: Number(row.actor_account_id),
          display_name: row.actor_display_name,
        }
      : null,
    is_active: row.is_active,
    deactivated_at: row.deactivated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeSubjectKey(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeActorLabel(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function assertValueObject(valueJson, label) {
  if (valueJson === null || valueJson === undefined || typeof valueJson !== 'object' || Array.isArray(valueJson)) {
    throw createHttpError(`${label} must be a JSON object`, 400);
  }
}

async function requireCharacter(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterByIdQuery, [characterId]);
  const character = result.rows[0] || null;

  if (!character) {
    throw createHttpError('Character not found', 404);
  }

  return character;
}

async function assertTargetBelongsToCharacter(characterId, targetScope, targetEntityId, executor) {
  if (targetScope === 'character') {
    if (targetEntityId !== null && targetEntityId !== characterId) {
      throw createHttpError('Character-scoped overrides must target the same character or use a null target_entity_id', 400);
    }
    return;
  }

  if (targetScope === 'character_item') {
    if (!targetEntityId) {
      throw createHttpError('character_item overrides require target_entity_id', 400);
    }

    const result = await executor.query(selectCharacterItemOwnerQuery, [targetEntityId]);
    const item = result.rows[0] || null;

    if (!item || Number(item.character_id) !== characterId) {
      throw createHttpError('target_entity_id must belong to the same character', 400);
    }
    return;
  }

  throw createHttpError('Unsupported target_scope', 400);
}

async function getCharacterClassEntries(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterClassesQuery, [characterId]);
  return result.rows.map((row) => ({
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
      ? {
          id: Number(row.subclass_id),
          name: row.subclass_name,
          slug: row.subclass_slug,
        }
      : null,
  }));
}

async function validateSpellSlotAdjustment(characterId, valueJson, executor) {
  assertValueObject(valueJson, 'value_json');

  const slotPool = normalizeSubjectKey(valueJson.slot_pool) || 'standard';
  const slotLevel = Number(valueJson.slot_level);
  const delta = Number(valueJson.delta);

  if (!['standard', 'pact_magic'].includes(slotPool)) {
    throw createHttpError('adjust_spell_slots value_json.slot_pool must be standard or pact_magic', 400);
  }

  if (!Number.isInteger(slotLevel) || slotLevel < 1 || slotLevel > 9) {
    throw createHttpError('adjust_spell_slots value_json.slot_level must be an integer from 1 to 9', 400);
  }

  if (!Number.isInteger(delta) || delta === 0) {
    throw createHttpError('adjust_spell_slots value_json.delta must be a non-zero integer', 400);
  }

  const classEntries = await getCharacterClassEntries(characterId, executor);
  const pools = computeSpellSlotPools(classEntries);
  const basePool = pools.find((entry) => entry.slot_pool === slotPool) || null;
  const baseTotal = Number(basePool?.slots?.[slotLevel] ?? 0);

  if (baseTotal + delta < 0) {
    throw createHttpError('adjust_spell_slots cannot reduce effective total slots below zero', 400);
  }

  const slotStateResult = await executor.query(selectSpellSlotStateQuery, [characterId]);
  const currentState = slotStateResult.rows.find(
    (row) => row.slot_pool === slotPool && Number(row.slot_level) === slotLevel
  );
  const used = currentState ? Number(currentState.slots_used) : 0;

  if (baseTotal + delta < used) {
    throw createHttpError('adjust_spell_slots cannot reduce effective total slots below currently used slots', 400);
  }
}

function validateInventoryUsesOverride(valueJson) {
  assertValueObject(valueJson, 'value_json');

  const currentUses = Number(valueJson.current_uses);
  const maxUses = Number(valueJson.max_uses);

  if (!Number.isInteger(currentUses) || currentUses < 0) {
    throw createHttpError('override_inventory_item_uses value_json.current_uses must be a non-negative integer', 400);
  }

  if (!Number.isInteger(maxUses) || maxUses < 0) {
    throw createHttpError('override_inventory_item_uses value_json.max_uses must be a non-negative integer', 400);
  }

  if (currentUses > maxUses) {
    throw createHttpError('override_inventory_item_uses current_uses cannot exceed max_uses', 400);
  }
}

async function validateOverridePayload(characterId, input, executor) {
  const definition = overrideDefinitions[input.override_category];

  if (!definition) {
    throw createHttpError('Unsupported override_category', 400);
  }

  if (input.operation_type !== definition.operation_type) {
    throw createHttpError(
      `${input.override_category} requires operation_type ${definition.operation_type}`,
      400
    );
  }

  if (!definition.allowed_target_scopes.includes(input.target_scope)) {
    throw createHttpError(
      `${input.override_category} does not support target_scope ${input.target_scope}`,
      400
    );
  }

  if (!input.reason || String(input.reason).trim() === '') {
    throw createHttpError('reason is required', 400);
  }

  if (!input.actor_account_id && !normalizeActorLabel(input.actor_label)) {
    throw createHttpError('Either actor_account_id or actor_label is required', 400);
  }

  await assertTargetBelongsToCharacter(characterId, input.target_scope, input.target_entity_id, executor);

  if (input.override_category === 'adjust_spell_slots') {
    await validateSpellSlotAdjustment(characterId, input.value_json, executor);
  }

  if (input.override_category === 'override_inventory_item_uses') {
    validateInventoryUsesOverride(input.value_json);
  }

  if (definition.value_mode === 'required' && !input.value_json) {
    throw createHttpError(`${input.override_category} requires value_json`, 400);
  }
}

export async function listCharacterOverrides(characterId) {
  await requireCharacter(characterId);
  const result = await query(selectCharacterOverridesQuery, [characterId]);
  return result.rows.map(mapOverrideRow);
}

export async function getOverrideById(overrideId, executor = { query }) {
  const result = await executor.query(selectOverrideByIdQuery, [overrideId]);
  return result.rowCount > 0 ? mapOverrideRow(result.rows[0]) : null;
}

export async function createCharacterOverride(characterId, input) {
  return withTransaction(async (client) => {
    await requireCharacter(characterId, client);

    const payload = {
      target_scope: input.target_scope,
      target_entity_id: input.target_entity_id ?? null,
      override_category: input.override_category,
      subject_key: normalizeSubjectKey(input.subject_key),
      operation_type: input.operation_type,
      value_json: input.value_json ?? null,
      reason: String(input.reason).trim(),
      actor_account_id: input.actor_account_id ?? null,
      actor_label: normalizeActorLabel(input.actor_label),
      is_active: input.is_active ?? true,
    };

    await validateOverridePayload(characterId, payload, client);

    const insertResult = await client.query(insertOverrideQuery, [
      characterId,
      payload.target_scope,
      payload.target_entity_id,
      payload.override_category,
      payload.subject_key,
      payload.operation_type,
      payload.value_json ? JSON.stringify(payload.value_json) : null,
      payload.reason,
      payload.actor_account_id,
      payload.actor_label,
      payload.is_active,
    ]);

    return getOverrideById(insertResult.rows[0].id, client);
  });
}

export async function updateOverride(overrideId, input) {
  return withTransaction(async (client) => {
    const existing = await getOverrideById(overrideId, client);

    if (!existing) {
      throw createHttpError('Override not found', 404);
    }

    const payload = {
      target_scope: existing.target_scope,
      target_entity_id: existing.target_entity_id,
      override_category: existing.override_category,
      subject_key: existing.subject_key,
      operation_type: existing.operation_type,
      value_json: input.value_json !== undefined ? input.value_json : existing.value_json,
      reason: input.reason !== undefined ? String(input.reason).trim() : existing.reason,
      actor_account_id:
        input.actor_account_id !== undefined ? input.actor_account_id : existing.actor_account_id,
      actor_label:
        input.actor_label !== undefined ? normalizeActorLabel(input.actor_label) : existing.actor_label,
      is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
    };

    await validateOverridePayload(existing.character_id, payload, client);

    await client.query(updateOverrideQuery, [
      overrideId,
      payload.value_json ? JSON.stringify(payload.value_json) : null,
      payload.reason,
      payload.actor_account_id,
      payload.actor_label,
      payload.is_active,
    ]);

    return getOverrideById(overrideId, client);
  });
}

export async function findApplicableOverride(
  characterId,
  { override_category, target_scope = 'character', target_entity_id = null, subject_keys = [] },
  executor = { query }
) {
  const filteredSubjectKeys = [...new Set(subject_keys.filter((value) => value !== null && value !== undefined))].map(
    (value) => String(value)
  );
  const result = await executor.query(selectMatchingActiveOverridesQuery, [
    characterId,
    override_category,
    target_scope,
    target_entity_id,
    filteredSubjectKeys.length > 0 ? filteredSubjectKeys : null,
  ]);

  return result.rowCount > 0 ? mapOverrideRow(result.rows[0]) : null;
}

export async function getCharacterSpellSlotOverrideAdjustments(characterId, executor = { query }) {
  const result = await executor.query(selectMatchingActiveOverridesQuery, [
    characterId,
    'adjust_spell_slots',
    'character',
    null,
    null,
  ]);

  const adjustments = new Map();

  for (const row of result.rows.map(mapOverrideRow)) {
    const slotPool = row.value_json?.slot_pool || 'standard';
    const slotLevel = Number(row.value_json?.slot_level);
    const delta = Number(row.value_json?.delta ?? 0);
    const key = `${slotPool}:${slotLevel}`;
    const existing = adjustments.get(key) || {
      slot_pool: slotPool,
      slot_level: slotLevel,
      adjustment: 0,
      override_ids: [],
      overrides: [],
    };

    existing.adjustment += delta;
    existing.override_ids.push(row.id);
    existing.overrides.push(row);
    adjustments.set(key, existing);
  }

  return adjustments;
}

export async function getCharacterItemUseOverride(characterId, characterItemId, executor = { query }) {
  return findApplicableOverride(
    characterId,
    {
      override_category: 'override_inventory_item_uses',
      target_scope: 'character_item',
      target_entity_id: characterItemId,
      subject_keys: ['uses'],
    },
    executor
  );
}

export async function getCharacterInventoryItemUseOverrides(characterId, executor = { query }) {
  const result = await executor.query(selectActiveCharacterOverridesByCategoryQuery, [
    characterId,
    'override_inventory_item_uses',
  ]);

  return new Map(
    result.rows
      .map(mapOverrideRow)
      .filter((override) => override.target_scope === 'character_item' && override.target_entity_id !== null)
      .map((override) => [override.target_entity_id, override])
  );
}
