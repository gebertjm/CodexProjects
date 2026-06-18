import { query, withTransaction } from '../config/db.js';
import {
  selectCharacterForCompositionQuery,
  selectCharacterForReadQuery,
} from '../db/queries/characterComposition.js';
import {
  insertCharacterCurrencyQuery,
  insertCharacterItemQuery,
  selectCharacterCurrencyForUpdateQuery,
  selectCharacterCurrencyQuery,
  selectCharacterItemByIdForUpdateQuery,
  selectCharacterItemForReadQuery,
  selectCharacterItemsQuery,
  selectItemByIdQuery,
  selectItemBySlugQuery,
  selectItemsQuery,
  updateCharacterCurrencyQuery,
  updateCharacterItemQuery,
} from '../db/queries/items.js';
import { createHttpError } from '../utils/httpError.js';
import { getCharacterInventoryItemUseOverrides } from './overrideService.js';

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

function mapItemTemplateRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    item_type: row.item_type,
    rarity: row.rarity,
    weight: row.weight !== null ? Number(row.weight) : null,
    value_cp: row.value_cp !== null ? Number(row.value_cp) : null,
    description: row.description,
    source: row.source,
    is_active: row.is_active,
    weapon: row.weapon_category
      ? {
          weapon_category: row.weapon_category,
          damage_dice: row.damage_dice,
          damage_type: row.damage_type,
          properties_text: row.properties_text,
          range_normal: row.range_normal !== null ? Number(row.range_normal) : null,
          range_long: row.range_long !== null ? Number(row.range_long) : null,
        }
      : null,
    armor: row.armor_category
      ? {
          armor_category: row.armor_category,
          armor_class_base: row.armor_class_base !== null ? Number(row.armor_class_base) : null,
          dex_bonus_rule: row.dex_bonus_rule,
          strength_requirement:
            row.strength_requirement !== null ? Number(row.strength_requirement) : null,
          stealth_disadvantage: row.stealth_disadvantage,
        }
      : null,
  };
}

function mapCharacterItemRow(row) {
  const item = mapItemTemplateRow({
    id: row.item_id,
    name: row.item_name,
    slug: row.item_slug,
    item_type: row.item_type,
    rarity: row.rarity,
    weight: row.weight,
    value_cp: row.value_cp,
    description: row.description,
    source: row.source,
    is_active: row.item_is_active,
    weapon_category: row.weapon_category,
    damage_dice: row.damage_dice,
    damage_type: row.damage_type,
    properties_text: row.properties_text,
    range_normal: row.range_normal,
    range_long: row.range_long,
    armor_category: row.armor_category,
    armor_class_base: row.armor_class_base,
    dex_bonus_rule: row.dex_bonus_rule,
    strength_requirement: row.strength_requirement,
    stealth_disadvantage: row.stealth_disadvantage,
  });

  const quantity = Number(row.quantity);
  const unitWeight = item.weight ?? 0;

  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    parent_character_item_id:
      row.parent_character_item_id !== null ? Number(row.parent_character_item_id) : null,
    quantity,
    is_equipped: row.is_equipped,
    is_attuned: row.is_attuned,
    current_uses: row.current_uses !== null ? Number(row.current_uses) : null,
    max_uses: row.max_uses !== null ? Number(row.max_uses) : null,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    effective_weight: Number((unitWeight * quantity).toFixed(2)),
    item,
    parent_item:
      row.parent_character_item_id !== null
        ? {
            character_item_id: Number(row.parent_character_item_id),
            name: row.parent_item_name,
            slug: row.parent_item_slug,
          }
        : null,
  };
}

function mapCurrencyRow(row, characterId) {
  if (!row) {
    return {
      character_id: characterId,
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
      total_value_cp: 0,
      total_coin_count: 0,
      total_weight: 0,
    };
  }

  const cp = Number(row.cp);
  const sp = Number(row.sp);
  const ep = Number(row.ep);
  const gp = Number(row.gp);
  const pp = Number(row.pp);
  const totalCoinCount = cp + sp + ep + gp + pp;

  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    cp,
    sp,
    ep,
    gp,
    pp,
    total_value_cp: cp + sp * 10 + ep * 50 + gp * 100 + pp * 1000,
    total_coin_count: totalCoinCount,
    total_weight: Number((totalCoinCount / 50).toFixed(2)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildInventoryTree(items) {
  const nodeMap = new Map(
    items.map((item) => [
      item.id,
      {
        ...item,
        contained_items: [],
      },
    ])
  );

  const roots = [];

  for (const item of nodeMap.values()) {
    if (item.parent_character_item_id && nodeMap.has(item.parent_character_item_id)) {
      nodeMap.get(item.parent_character_item_id).contained_items.push(item);
      continue;
    }

    roots.push(item);
  }

  const sortNodes = (nodes) => {
    nodes.sort((left, right) => {
      if (left.item.name === right.item.name) {
        return left.id - right.id;
      }

      return left.item.name.localeCompare(right.item.name);
    });

    for (const node of nodes) {
      sortNodes(node.contained_items);
    }
  };

  sortNodes(roots);
  return roots;
}

function buildInventorySummary(items, currency, character) {
  const itemWeight = items.reduce((sum, item) => sum + item.effective_weight, 0);
  const equippedWeight = items
    .filter((item) => item.is_equipped)
    .reduce((sum, item) => sum + item.effective_weight, 0);
  const totalWeight = Number((itemWeight + currency.total_weight).toFixed(2));
  const strength = Number(character?.strength ?? 0);

  return {
    total_items: items.length,
    total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    total_item_weight: Number(itemWeight.toFixed(2)),
    total_currency_weight: currency.total_weight,
    total_carried_weight: totalWeight,
    equipped_weight: Number(equippedWeight.toFixed(2)),
    carrying_capacity: strength * 15,
    variant_encumbrance_thresholds: {
      encumbered_at: strength * 5,
      heavily_encumbered_at: strength * 10,
      max_push_drag_lift: strength * 30,
    },
    over_capacity: totalWeight > strength * 15,
  };
}

function applyInventoryItemUseOverrides(items, overrideMap) {
  return items.map((item) => {
    const override = overrideMap.get(item.id) || null;
    const baseCurrentUses = item.current_uses;
    const baseMaxUses = item.max_uses;
    const effectiveCurrentUses =
      override?.value_json?.current_uses !== undefined ? Number(override.value_json.current_uses) : baseCurrentUses;
    const effectiveMaxUses =
      override?.value_json?.max_uses !== undefined ? Number(override.value_json.max_uses) : baseMaxUses;

    return {
      ...item,
      uses: {
        base_current_uses: baseCurrentUses,
        base_max_uses: baseMaxUses,
        effective_current_uses: effectiveCurrentUses,
        effective_max_uses: effectiveMaxUses,
        overridden: override !== null,
        override: override
          ? {
              id: override.id,
              reason: override.reason,
              actor_account_id: override.actor_account_id,
              actor_label: override.actor_label,
            }
          : null,
      },
    };
  });
}

function assertUsesState(quantity, currentUses, maxUses) {
  if ((currentUses === null) !== (maxUses === null)) {
    throw createHttpError('current_uses and max_uses must either both be set or both be null', 400);
  }

  if (maxUses !== null && maxUses < 0) {
    throw createHttpError('max_uses must be a non-negative integer', 400);
  }

  if (currentUses !== null && currentUses < 0) {
    throw createHttpError('current_uses must be a non-negative integer', 400);
  }

  if (currentUses !== null && maxUses !== null && currentUses > maxUses) {
    throw createHttpError('current_uses cannot be greater than max_uses', 400);
  }

  if ((currentUses !== null || maxUses !== null) && quantity !== 1) {
    throw createHttpError('Item uses can only be tracked on inventory rows with quantity 1', 400);
  }
}

function assertItemStateIsValid(state) {
  if (!Number.isInteger(state.quantity) || state.quantity < 1) {
    throw createHttpError('quantity must be a positive integer', 400);
  }

  if (state.parent_character_item_id !== null && state.parent_character_item_id === state.id) {
    throw createHttpError('An item cannot be placed inside itself', 400);
  }

  if (state.is_equipped && state.parent_character_item_id !== null) {
    throw createHttpError('Equipped items cannot also be stored inside another inventory item', 400);
  }

  if (state.is_attuned && state.quantity !== 1) {
    throw createHttpError('Attuned items must use a single-item inventory row with quantity 1', 400);
  }

  assertUsesState(state.quantity, state.current_uses, state.max_uses);
}

function assertNoContainerCycle(items, itemId, nextParentId) {
  if (nextParentId === null) {
    return;
  }

  let currentParentId = nextParentId;
  const parentMap = new Map(items.map((item) => [item.id, item.parent_character_item_id]));

  while (currentParentId !== null) {
    if (currentParentId === itemId) {
      throw createHttpError('Container nesting cannot create a cycle', 400);
    }

    currentParentId = parentMap.get(currentParentId) ?? null;
  }
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

async function listCharacterItemsInternal(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterItemsQuery, [characterId]);
  return result.rows.map(mapCharacterItemRow);
}

async function getCharacterCurrencyInternal(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterCurrencyQuery, [characterId]);
  return mapCurrencyRow(result.rows[0] || null, characterId);
}

function buildInventoryReadModel(items, currency, character) {
  return {
    items,
    tree: buildInventoryTree(items),
    currency,
    summary: buildInventorySummary(items, currency, character),
  };
}

async function assertParentBelongsToCharacter(characterId, parentCharacterItemId, executor) {
  if (parentCharacterItemId === null) {
    return null;
  }

  const parentResult = await executor.query(selectCharacterItemByIdForUpdateQuery, [parentCharacterItemId]);
  const parentItem = parentResult.rows[0] ? mapCharacterItemRow(parentResult.rows[0]) : null;

  if (!parentItem || parentItem.character_id !== characterId) {
    throw createHttpError('parent_character_item_id must reference an item owned by the same character', 400);
  }

  return parentItem;
}

function buildNextCurrencyState(existingCurrency, input) {
  const nextCurrency = {
    cp: input.cp ?? existingCurrency.cp,
    sp: input.sp ?? existingCurrency.sp,
    ep: input.ep ?? existingCurrency.ep,
    gp: input.gp ?? existingCurrency.gp,
    pp: input.pp ?? existingCurrency.pp,
  };

  for (const [key, value] of Object.entries(nextCurrency)) {
    if (!Number.isInteger(value) || value < 0) {
      throw createHttpError(`${key} must be a non-negative integer`, 400);
    }
  }

  return nextCurrency;
}

async function persistCharacterCurrencyInternal(characterId, nextCurrency, executor) {
  const currencyResult = await executor.query(selectCharacterCurrencyForUpdateQuery, [characterId]);

  if (!currencyResult.rows[0]) {
    await executor.query(insertCharacterCurrencyQuery, [
      characterId,
      nextCurrency.cp,
      nextCurrency.sp,
      nextCurrency.ep,
      nextCurrency.gp,
      nextCurrency.pp,
    ]);
  } else {
    await executor.query(updateCharacterCurrencyQuery, [
      characterId,
      nextCurrency.cp,
      nextCurrency.sp,
      nextCurrency.ep,
      nextCurrency.gp,
      nextCurrency.pp,
    ]);
  }

  return mapCurrencyRow(
    (
      await executor.query(selectCharacterCurrencyQuery, [characterId])
    ).rows[0],
    characterId
  );
}

export async function listItems() {
  const result = await query(selectItemsQuery);
  return result.rows.map(mapItemTemplateRow);
}

export async function getItemById(itemId) {
  const result = await query(selectItemByIdQuery, [itemId]);
  return result.rowCount > 0 ? mapItemTemplateRow(result.rows[0]) : null;
}

export async function listCharacterItems(characterId) {
  const character = await getCharacterForRead(characterId);

  if (!character) {
    throw createHttpError('Character not found', 404);
  }

  const [items, currency, useOverrides] = await Promise.all([
    listCharacterItemsInternal(characterId),
    getCharacterCurrencyInternal(characterId),
    getCharacterInventoryItemUseOverrides(characterId),
  ]);

  return buildInventoryReadModel(applyInventoryItemUseOverrides(items, useOverrides), currency, character);
}

export async function addCharacterItem(characterId, input) {
  return withTransaction(async (client) => {
    const result = await addCharacterItemWithExecutor(characterId, input, client);
    return result.inventory;
  });
}

export async function updateCharacterItem(characterId, characterItemId, input) {
  return withTransaction(async (client) => {
    const character = await getCharacterForComposition(characterId, client);
    const itemResult = await client.query(selectCharacterItemByIdForUpdateQuery, [characterItemId]);
    const inventoryItem = itemResult.rowCount > 0 ? mapCharacterItemRow(itemResult.rows[0]) : null;

    if (!inventoryItem || inventoryItem.character_id !== characterId) {
      throw createHttpError('Character item not found', 404);
    }

    const nextState = {
      id: inventoryItem.id,
      parent_character_item_id:
        input.parent_character_item_id !== undefined
          ? input.parent_character_item_id
          : inventoryItem.parent_character_item_id,
      quantity: input.quantity ?? inventoryItem.quantity,
      is_equipped: input.is_equipped ?? inventoryItem.is_equipped,
      is_attuned: input.is_attuned ?? inventoryItem.is_attuned,
      current_uses:
        input.current_uses !== undefined ? input.current_uses : inventoryItem.current_uses,
      max_uses: input.max_uses !== undefined ? input.max_uses : inventoryItem.max_uses,
      notes: input.notes !== undefined ? input.notes : inventoryItem.notes,
    };

    assertItemStateIsValid(nextState);
    await assertParentBelongsToCharacter(characterId, nextState.parent_character_item_id, client);

    const currentItems = await listCharacterItemsInternal(characterId, client);
    const itemsForCycleCheck = currentItems.map((item) =>
      item.id === characterItemId
        ? { ...item, parent_character_item_id: nextState.parent_character_item_id }
        : item
    );
    assertNoContainerCycle(itemsForCycleCheck, characterItemId, nextState.parent_character_item_id);

    await client.query(updateCharacterItemQuery, [
      characterItemId,
      nextState.parent_character_item_id,
      nextState.quantity,
      nextState.is_equipped,
      nextState.is_attuned,
      nextState.current_uses,
      nextState.max_uses,
      nextState.notes,
    ]);

    return buildInventoryReadModel(
      await listCharacterItemsInternal(characterId, client),
      await getCharacterCurrencyInternal(characterId, client),
      character
    );
  });
}

export async function getCharacterCurrency(characterId) {
  const character = await getCharacterForRead(characterId);

  if (!character) {
    throw createHttpError('Character not found', 404);
  }

  return getCharacterCurrencyInternal(characterId);
}

export async function updateCharacterCurrency(characterId, input) {
  return withTransaction(async (client) => {
    return updateCharacterCurrencyWithExecutor(characterId, input, client);
  });
}

export async function addCharacterItemWithExecutor(characterId, input, executor) {
  const character = await getCharacterForComposition(characterId, executor);
  const itemResult = await executor.query(selectItemByIdQuery, [input.item_id]);
  const itemTemplate = itemResult.rowCount > 0 ? mapItemTemplateRow(itemResult.rows[0]) : null;

  if (!itemTemplate) {
    throw createHttpError('Invalid item_id', 400);
  }

  const state = {
    id: null,
    parent_character_item_id: input.parent_character_item_id ?? null,
    quantity: input.quantity,
    is_equipped: input.is_equipped ?? false,
    is_attuned: input.is_attuned ?? false,
    current_uses: input.current_uses ?? null,
    max_uses: input.max_uses ?? null,
  };

  assertItemStateIsValid(state);
  await assertParentBelongsToCharacter(characterId, state.parent_character_item_id, executor);

  const insertResult = await executor.query(insertCharacterItemQuery, [
    characterId,
    input.item_id,
    state.parent_character_item_id,
    state.quantity,
    state.is_equipped,
    state.is_attuned,
    state.current_uses,
    state.max_uses,
    input.notes ?? null,
  ]);

  const inventory = buildInventoryReadModel(
    await listCharacterItemsInternal(characterId, executor),
    await getCharacterCurrencyInternal(characterId, executor),
    character
  );
  const createdItemId = Number(insertResult.rows[0].id);

  return {
    inventory,
    created_item: inventory.items.find((item) => item.id === createdItemId) ?? null,
  };
}

export async function updateCharacterCurrencyWithExecutor(characterId, input, executor) {
  await getCharacterForComposition(characterId, executor);
  const existingCurrency = await getCharacterCurrencyInternal(characterId, executor);
  const nextCurrency = buildNextCurrencyState(existingCurrency, input);
  return persistCharacterCurrencyInternal(characterId, nextCurrency, executor);
}

export async function adjustCharacterCurrencyWithExecutor(characterId, deltas, executor) {
  await getCharacterForComposition(characterId, executor);
  const existingCurrency = await getCharacterCurrencyInternal(characterId, executor);
  const nextCurrency = buildNextCurrencyState(existingCurrency, {
    cp: existingCurrency.cp + (deltas.cp ?? 0),
    sp: existingCurrency.sp + (deltas.sp ?? 0),
    ep: existingCurrency.ep + (deltas.ep ?? 0),
    gp: existingCurrency.gp + (deltas.gp ?? 0),
    pp: existingCurrency.pp + (deltas.pp ?? 0),
  });
  return persistCharacterCurrencyInternal(characterId, nextCurrency, executor);
}

export async function getItemBySlug(slug, executor = { query }) {
  const result = await executor.query(selectItemBySlugQuery, [slug]);
  return result.rowCount > 0 ? mapItemTemplateRow(result.rows[0]) : null;
}

export async function getCharacterInventoryData(characterId) {
  const character = await getCharacterForRead(characterId);

  if (!character) {
    return null;
  }

  const [items, currency, useOverrides] = await Promise.all([
    listCharacterItemsInternal(characterId),
    getCharacterCurrencyInternal(characterId),
    getCharacterInventoryItemUseOverrides(characterId),
  ]);

  return buildInventoryReadModel(applyInventoryItemUseOverrides(items, useOverrides), currency, character);
}
