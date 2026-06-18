import { COMMAND_TYPES } from './commandTypes.js';
import { castSpellCommand } from './handlers/castSpellCommand.js';
import { equipItemCommand } from './handlers/equipItemCommand.js';
import { moveItemCommand } from './handlers/moveItemCommand.js';
import { unequipItemCommand } from './handlers/unequipItemCommand.js';
import { useItemCommand } from './handlers/useItemCommand.js';

const commandRegistry = new Map([
  [COMMAND_TYPES.CAST_SPELL, castSpellCommand],
  [COMMAND_TYPES.USE_ITEM, useItemCommand],
  [COMMAND_TYPES.MOVE_ITEM, moveItemCommand],
  [COMMAND_TYPES.EQUIP_ITEM, equipItemCommand],
  [COMMAND_TYPES.UNEQUIP_ITEM, unequipItemCommand],
]);

export function getCommandHandler(commandType) {
  return commandRegistry.get(commandType) || null;
}

export function listRegisteredCommandTypes() {
  return Array.from(commandRegistry.keys()).sort();
}
