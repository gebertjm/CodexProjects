import { updateOverride, getCharacterItemUseOverride } from '../../../services/overrideService.js';
import { listCharacterItems, updateCharacterItem } from '../../../services/inventoryService.js';
import { createHttpError } from '../../../utils/httpError.js';
import { readOptionalPositiveInteger, readRequiredPositiveInteger } from '../helpers.js';

function findInventoryItem(inventory, characterItemId) {
  return inventory.items.find((entry) => Number(entry.id) === characterItemId) || null;
}

export const useItemCommand = {
  type: 'use_item',
  async execute({ command }) {
    const characterItemId = readRequiredPositiveInteger(
      command.payload.characterItemId,
      'payload.characterItemId'
    );
    const amount = readOptionalPositiveInteger(command.payload.amount, 'payload.amount', 1);
    const inventory = await listCharacterItems(command.characterId);
    const item = findInventoryItem(inventory, characterItemId);

    if (!item) {
      throw createHttpError('Character item not found', 404);
    }

    const effectiveCurrentUses = item.uses?.effective_current_uses ?? null;
    const effectiveMaxUses = item.uses?.effective_max_uses ?? null;

    if (effectiveCurrentUses !== null && effectiveMaxUses !== null) {
      if (effectiveCurrentUses < amount) {
        throw createHttpError('That item does not have enough uses remaining', 409);
      }

      const nextCurrentUses = effectiveCurrentUses - amount;
      let updatedInventory;

      if (item.uses.overridden) {
        const override = await getCharacterItemUseOverride(command.characterId, characterItemId);

        if (!override) {
          throw createHttpError('The applicable item use override could not be found', 409);
        }

        await updateOverride(override.id, {
          value_json: {
            current_uses: nextCurrentUses,
            max_uses: effectiveMaxUses,
          },
        });
        updatedInventory = await listCharacterItems(command.characterId);
      } else {
        updatedInventory = await updateCharacterItem(command.characterId, characterItemId, {
          current_uses: nextCurrentUses,
          max_uses: item.max_uses,
        });
      }

      const updatedItem = findInventoryItem(updatedInventory, characterItemId);

      return {
        effects: {
          item_use: {
            character_item_id: characterItemId,
            amount,
            mode: 'uses',
            remaining_uses: updatedItem?.uses?.effective_current_uses ?? nextCurrentUses,
            max_uses: updatedItem?.uses?.effective_max_uses ?? effectiveMaxUses,
          },
          inventory: updatedInventory,
        },
      };
    }

    if (item.quantity <= amount) {
      throw createHttpError(
        'This command cannot consume the last copy of an item yet; attach a larger stack or track uses instead',
        409
      );
    }

    const updatedInventory = await updateCharacterItem(command.characterId, characterItemId, {
      quantity: item.quantity - amount,
    });
    const updatedItem = findInventoryItem(updatedInventory, characterItemId);

    return {
      effects: {
        item_use: {
          character_item_id: characterItemId,
          amount,
          mode: 'quantity',
          remaining_quantity: updatedItem?.quantity ?? item.quantity - amount,
        },
        inventory: updatedInventory,
      },
    };
  },
};
