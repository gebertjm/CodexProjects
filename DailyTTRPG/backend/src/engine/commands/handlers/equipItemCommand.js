import { listCharacterItems, updateCharacterItem } from '../../../services/inventoryService.js';
import { createHttpError } from '../../../utils/httpError.js';
import { readRequiredPositiveInteger } from '../helpers.js';

function findInventoryItem(inventory, characterItemId) {
  return inventory.items.find((entry) => Number(entry.id) === characterItemId) || null;
}

export async function toggleItemEquipped(characterId, characterItemId, isEquipped) {
  const inventoryBefore = await listCharacterItems(characterId);
  const item = findInventoryItem(inventoryBefore, characterItemId);

  if (!item) {
    throw createHttpError('Character item not found', 404);
  }

  if (item.is_equipped === isEquipped) {
    throw createHttpError(
      isEquipped ? 'That item is already equipped' : 'That item is already unequipped',
      409
    );
  }

  const updatedInventory = await updateCharacterItem(characterId, characterItemId, {
    is_equipped: isEquipped,
  });
  const updatedItem = findInventoryItem(updatedInventory, characterItemId);

  return {
    item,
    updatedItem,
    updatedInventory,
  };
}

export const equipItemCommand = {
  type: 'equip_item',
  async execute({ command }) {
    const characterItemId = readRequiredPositiveInteger(
      command.payload.characterItemId,
      'payload.characterItemId'
    );
    const { item, updatedItem, updatedInventory } = await toggleItemEquipped(
      command.characterId,
      characterItemId,
      true
    );

    return {
      effects: {
        item_equip: {
          character_item_id: characterItemId,
          from_equipped: item.is_equipped,
          to_equipped: updatedItem?.is_equipped ?? true,
        },
        inventory: updatedInventory,
      },
    };
  },
};
