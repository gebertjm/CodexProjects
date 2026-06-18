import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInitiativeOrder,
  calculateAbilityModifier,
  resolveAttackAction,
  rollD20,
  rollDamageEntry,
  selectAiAction,
} from '../src/engine/combat/combatEngine.js';
import { __combatServiceTestables } from '../src/services/combatService.js';

function actor(overrides = {}) {
  return {
    id: 1,
    display_name: 'Avery',
    faction: 'player',
    is_active: true,
    is_defeated: false,
    abilities: {
      STR: 16,
      DEX: 14,
      CON: 12,
      INT: 10,
      WIS: 10,
      CHA: 10,
    },
    proficiency_bonus: 2,
    ...overrides,
  };
}

function target(overrides = {}) {
  return {
    id: 2,
    display_name: 'Rusk',
    faction: 'enemy',
    armor_class: 13,
    current_hp: 12,
    max_hp: 12,
    temporary_hp: 0,
    is_active: true,
    is_defeated: false,
    ...overrides,
  };
}

function strikeAction(overrides = {}) {
  return {
    id: 10,
    name: 'Training Strike',
    requires_attack_roll: true,
    range: { type: 'melee' },
    effects: [
      { effect_type: 'attack_bonus', value: { bonus: 1 } },
      {
        effect_type: 'attack_ability_modifier',
        value: { ability: 'STR', add_proficiency: true },
      },
      { effect_type: 'damage_ability_modifier', value: { ability: 'STR' } },
    ],
    damage: [
      {
        damage_type: 'slashing',
        damage_text: '1d8 + 1 slashing',
        dice_count: 1,
        dice_size: 8,
        modifier: 1,
      },
    ],
    ...overrides,
  };
}

test('6D.2 combat engine verifies ability modifiers and deterministic roll overrides', () => {
  assert.equal(calculateAbilityModifier(8), -1);
  assert.equal(calculateAbilityModifier(10), 0);
  assert.equal(calculateAbilityModifier(16), 3);
  assert.equal(calculateAbilityModifier(null), 0);
  assert.equal(rollD20(20), 20);
  assert.throws(() => rollD20(21), /d20 override/);

  const damage = rollDamageEntry(
    { dice_count: 2, dice_size: 6, modifier: 3 },
    [2, 5]
  );
  assert.deepEqual(damage.rolls, [2, 5]);
  assert.equal(damage.base_roll_total, 7);
  assert.equal(damage.total, 10);
});

test('6D.2 initiative ordering uses total then Dexterity modifier then participant id', () => {
  const participants = [
    actor({ id: 3, entity_type: 'character', entity_id: 100, abilities: { DEX: 10 } }),
    actor({ id: 2, entity_type: 'npc', entity_id: 200, display_name: 'Bandit', abilities: { DEX: 16 } }),
    actor({ id: 1, entity_type: 'monster', entity_id: 300, display_name: 'Wolf', abilities: { DEX: 10 } }),
  ];

  const order = buildInitiativeOrder(participants, [
    { participant_id: 3, roll: 15 },
    { participant_id: 2, roll: 12 },
    { entity_type: 'monster', entity_id: 300, roll: 15 },
  ]);

  assert.deepEqual(
    order.map((entry) => ({
      id: entry.id,
      initiative: entry.initiative,
      dexterity_modifier: entry.dexterity_modifier,
      turn_order: entry.turn_order,
    })),
    [
      { id: 2, initiative: 15, dexterity_modifier: 3, turn_order: 1 },
      { id: 1, initiative: 15, dexterity_modifier: 0, turn_order: 2 },
      { id: 3, initiative: 15, dexterity_modifier: 0, turn_order: 3 },
    ]
  );
});

test('6D.2 attack resolution verifies hit miss natural-one and natural-twenty behavior', () => {
  const hit = resolveAttackAction({
    actor: actor(),
    target: target({ armor_class: 20 }),
    action: strikeAction(),
    attackRollOverride: 14,
    damageRollOverrides: [4],
  });
  assert.equal(hit.attack.attack_modifier, 6);
  assert.equal(hit.attack.attack_total, 20);
  assert.equal(hit.attack.was_hit, true);
  assert.equal(hit.damage.total_damage, 8);

  const miss = resolveAttackAction({
    actor: actor(),
    target: target({ armor_class: 25 }),
    action: strikeAction(),
    attackRollOverride: 10,
    damageRollOverrides: [8],
  });
  assert.equal(miss.attack.was_hit, false);
  assert.equal(miss.damage.total_damage, 0);
  assert.equal(miss.target_state.current_hp_after, 12);

  const naturalOne = resolveAttackAction({
    actor: actor(),
    target: target({ armor_class: 1 }),
    action: strikeAction(),
    attackRollOverride: 1,
    damageRollOverrides: [8],
  });
  assert.equal(naturalOne.attack.is_automatic_miss, true);
  assert.equal(naturalOne.attack.was_hit, false);

  const naturalTwenty = resolveAttackAction({
    actor: actor(),
    target: target({ armor_class: 99 }),
    action: strikeAction(),
    attackRollOverride: 20,
    damageRollOverrides: [2],
  });
  assert.equal(naturalTwenty.attack.is_critical_hit, true);
  assert.equal(naturalTwenty.attack.was_hit, true);
  assert.equal(
    naturalTwenty.damage.total_damage,
    6,
    'current legacy critical behavior guarantees hit but does not double dice'
  );
});

test('6D.2 damage applies temporary hit points first, floors HP at zero, and marks defeat', () => {
  const damaged = resolveAttackAction({
    actor: actor(),
    target: target({ current_hp: 10, temporary_hp: 3 }),
    action: strikeAction(),
    attackRollOverride: 18,
    damageRollOverrides: [3],
  });

  assert.equal(damaged.damage.total_damage, 7);
  assert.equal(damaged.target_state.absorbed_by_temporary_hp, 3);
  assert.equal(damaged.target_state.applied_to_hit_points, 4);
  assert.equal(damaged.target_state.temporary_hp_after, 0);
  assert.equal(damaged.target_state.current_hp_after, 6);
  assert.equal(damaged.target_state.is_defeated, false);

  const overkill = resolveAttackAction({
    actor: actor(),
    target: target({ current_hp: 3, temporary_hp: 0 }),
    action: strikeAction(),
    attackRollOverride: 18,
    damageRollOverrides: [8],
  });
  assert.equal(overkill.damage.total_damage, 12);
  assert.equal(overkill.target_state.current_hp_after, 0);
  assert.equal(overkill.target_state.is_defeated, true);
});

test('6D.2 damage entries preserve component types but do not apply resistance vulnerability or immunity', () => {
  const action = strikeAction({
    damage: [
      {
        damage_type: 'slashing',
        damage_text: '1d6 + 1 slashing',
        dice_count: 1,
        dice_size: 6,
        modifier: 1,
      },
      {
        damage_type: 'fire',
        damage_text: '1d4 fire',
        dice_count: 1,
        dice_size: 4,
        modifier: 0,
      },
    ],
  });

  const result = resolveAttackAction({
    actor: actor(),
    target: target({ current_hp: 20 }),
    action,
    attackRollOverride: 18,
    damageRollOverrides: [[4], [3]],
  });

  assert.equal(result.damage.total_damage, 11);
  assert.deepEqual(
    result.damage.entries.map((entry) => ({
      type: entry.damage_type,
      dynamic: entry.dynamic_modifier,
      total: entry.total,
    })),
    [
      { type: 'slashing', dynamic: 3, total: 8 },
      { type: 'fire', dynamic: 0, total: 3 },
    ]
  );
});

test('6D.2 AI action selection is deterministic first legal enemy and first attack action', () => {
  const actorEntry = actor({ id: 9, faction: 'enemy', control_mode: 'ai' });
  const playerTarget = target({ id: 1, faction: 'player', display_name: 'Avery' });
  const ally = target({ id: 8, faction: 'enemy', display_name: 'Ally' });
  const actions = [
    { id: 100, name: 'Taunt', requires_attack_roll: false },
    { id: 101, name: 'Strike', requires_attack_roll: true },
  ];

  const choice = selectAiAction({
    actor: actorEntry,
    participants: [actorEntry, ally, playerTarget],
    availableActions: actions,
  });
  assert.equal(choice.reason, 'basic_attack');
  assert.equal(choice.target.id, playerTarget.id);
  assert.equal(choice.action.id, 101);

  assert.equal(
    selectAiAction({
      actor: actorEntry,
      participants: [actorEntry, { ...playerTarget, is_defeated: true }],
      availableActions: actions,
    }).reason,
    'no_valid_target'
  );
  assert.equal(
    selectAiAction({
      actor: actorEntry,
      participants: [actorEntry, playerTarget],
      availableActions: [],
    }).reason,
    'no_valid_action'
  );
});

test('6D.2 turn advancement helper skips defeated or inactive participants and wraps rounds', () => {
  const { computeNextTurnState, determineRemainingFactions } = __combatServiceTestables;
  const participants = [
    { id: 1, display_name: 'Avery', faction: 'player', turn_order: 1, is_active: true, is_defeated: false },
    { id: 2, display_name: 'Downed bandit', faction: 'enemy', turn_order: 2, is_active: false, is_defeated: true },
    { id: 3, display_name: 'Rusk', faction: 'enemy', turn_order: 3, is_active: true, is_defeated: false },
  ];

  const next = computeNextTurnState(
    { round_number: 2, current_participant_id: 1 },
    participants
  );
  assert.equal(next.round_number, 2);
  assert.equal(next.current_turn_index, 1);
  assert.equal(next.current_participant_id, 3);

  const wrapped = computeNextTurnState(
    { round_number: 2, current_participant_id: 3 },
    participants
  );
  assert.equal(wrapped.round_number, 3);
  assert.equal(wrapped.current_turn_index, 0);
  assert.equal(wrapped.current_participant_id, 1);

  assert.deepEqual(determineRemainingFactions(participants), ['player', 'enemy']);
  assert.equal(
    computeNextTurnState(
      { round_number: 1, current_participant_id: 99 },
      participants
    ).current_participant_id,
    1
  );
});
