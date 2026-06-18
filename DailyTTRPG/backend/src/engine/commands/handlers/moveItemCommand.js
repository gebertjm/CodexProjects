import { listCharacterItems, updateCharacterItem } from '../../../services/inventoryService.js';
import { createHttpError } from '../../../utils/httpError.js';
import {
  readOptionalNullablePositiveInteger,
  readRequiredPositiveInteger,
} from '../helpers.js';

function findInventoryItem(inventory, characterItemId) {
  return inventory.items.find((entry) => Number(entry.id) === characterItemId) || null;
}

export const moveItemCommand = {
  type: 'move_item',
  async execute({ command }) {
    const characterItemId = readRequiredPositiveInteger(
      command.payload.characterItemId,
      'payload.characterItemId'
    );
    const parentCharacterItemId = readOptionalNullablePositiveInteger(
      command.payload.parentCharacterItemId,
      'payload.parentCharacterItemId'
    );
    const inventoryBefore = await listCharacterItems(command.characterId);
    const item = findInventoryItem(inventoryBefore, characterItemId);

    if (!item) {
      throw createHttpError('Character item not found', 404);
    }

    const updatedInventory = await updateCharacterItem(command.characterId, characterItemId, {
      parent_character_item_id: parentCharacterItemId,
    });
    const updatedItem = findInventoryItem(updatedInventory, characterItemId);

    return {
      effects: {
        item_move: {
          character_item_id: characterItemId,
          from_parent_character_item_id: item.parent_character_item_id,
          to_parent_character_item_id: updatedItem?.parent_character_item_id ?? parentCharacterItemId,
        },
        inventory: updatedInventory,
      },
    };
  },
};
