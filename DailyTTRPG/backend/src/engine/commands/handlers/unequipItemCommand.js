import { toggleItemEquipped } from './equipItemCommand.js';
import { readRequiredPositiveInteger } from '../helpers.js';

export const unequipItemCommand = {
  type: 'unequip_item',
  async execute({ command }) {
    const characterItemId = readRequiredPositiveInteger(
      command.payload.characterItemId,
      'payload.characterItemId'
    );
    const { item, updatedItem, updatedInventory } = await toggleItemEquipped(
      command.characterId,
      characterItemId,
      false
    );

    return {
      effects: {
        item_equip: {
          character_item_id: characterItemId,
          from_equipped: item.is_equipped,
          to_equipped: updatedItem?.is_equipped ?? false,
        },
        inventory: updatedInventory,
      },
    };
  },
};
