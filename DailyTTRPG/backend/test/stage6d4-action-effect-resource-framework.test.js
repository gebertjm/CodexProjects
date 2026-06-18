import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMBAT_ACTION_RESULT_STATUSES,
  COMBAT_ACTION_TIMING_CATEGORIES,
  COMBAT_DURATION_KINDS,
  COMBAT_EFFECT_TYPES,
  COMBAT_RESOURCE_CATEGORIES,
  COMBAT_RESOURCE_REFRESH_TRIGGERS,
  COMBAT_RESOURCE_SPEND_STATUSES,
  COMBAT_TARGET_POLICIES,
  DND5E_2014_RULESET,
  ROLL_GENERATION_ORIGINS,
  SAVE_SUCCESS_POLICIES,
  TEMPORARY_HIT_POINT_POLICIES,
  assertNoCombatActionPlayerHiddenData,
  buildCombatActionGmDevTrace,
  createCombatActionDefinition,
  createCombatResourceState,
  normalizeLegacyStatBlockAction,
  previewCombatActionResolution,
  projectCombatActionResultForPlayer,
  resolveCombatAction,
  restoreCombatResources,
  spendCombatResourceCosts,
  validateCombatResourceCost,
} from '../src/engine/combat/actionEffectResourceFramework.js';

const testOrigin = ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE;

function actor(overrides = {}) {
  return {
    participant_id: 'pc-1',
    display_name: 'Avery',
    faction: 'player',
    current_hit_points: 12,
    max_hit_points: 16,
    temporary_hit_points: 0,
    armor_class: 15,
    ...overrides,
  };
}

function target(overrides = {}) {
  return {
    participant_id: 'rusk-1',
    display_name: 'Rusk',
    faction: 'enemy',
    current_hit_points: 18,
    max_hit_points: 18,
    temporary_hit_points: 0,
    armor_class: 14,
    defense_profile: {},
    ...overrides,
  };
}

function resource(overrides = {}) {
  return createCombatResourceState({
    resource_id: 'limited-strike',
    owner_ref: 'pc-1',
    category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE,
    current: 1,
    maximum: 1,
    ...overrides,
  });
}

function testStrikeAction(overrides = {}) {
  return createCombatActionDefinition({
    action_id: 'test-strike',
    action_name: 'Test Strike',
    player_label: 'Test Strike',
    ruleset: DND5E_2014_RULESET,
    timing_category: COMBAT_ACTION_TIMING_CATEGORIES.ACTION,
    target_policy: COMBAT_TARGET_POLICIES.ONE_CREATURE,
    effect_steps: [
      {
        step_id: 'attack',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL,
        params: {
          modifiers: [{ source_id: 'attack-mod', source_type: 'ability_modifier', value: 5 }],
        },
      },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        depends_on_step_id: 'attack',
        requires_outcome: { was_hit: true },
        params: {
          linked_attack_step_id: 'attack',
          components: [
            {
              damage_type: 'slashing',
              dice_count: 1,
              dice_size: 8,
              flat_modifier: 3,
            },
          ],
        },
      },
    ],
    ...overrides,
  });
}

test('6D.4 combat action definitions require explicit dnd5e 2014 rules and reject executable authoring', () => {
  const action = testStrikeAction();
  assert.equal(action.contract_version, '6D.4');
  assert.equal(action.ruleset.system, 'dnd5e');
  assert.equal(action.ruleset.rules_version, '2014');
  assert.equal(action.effect_steps.length, 2);
  assert.equal(action.effect_steps[0].effect_type, COMBAT_EFFECT_TYPES.ATTACK_ROLL);

  assert.throws(
    () =>
      createCombatActionDefinition({
        action_id: 'unsafe',
        ruleset: DND5E_2014_RULESET,
        target_policy: COMBAT_TARGET_POLICIES.NO_TARGET,
        effect_steps: [{ effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER, params: { handler: 'eval-me' } }],
      }),
    /cannot include executable code/
  );

  assert.throws(
    () =>
      createCombatActionDefinition({
        action_id: 'future-rules',
        ruleset: { system: 'dnd5e', rules_version: '2024' },
        effect_steps: [{ effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER }],
      }),
    /Unsupported combat ruleset/
  );
});

test('6D.4 legacy stat block actions normalize into authored effect steps without exposing legacy response shape', () => {
  const action = normalizeLegacyStatBlockAction({
    id: 42,
    name: 'Spear',
    action_type: 'action',
    requires_attack_roll: true,
    range: { type: 'melee', reach: 5 },
    damage: { type: 'piercing', dice_count: 1, dice_size: 6, flat_modifier: 2 },
    requirements: { hidden: 'kept for gm/dev metadata' },
  });

  assert.equal(action.action_id, 'legacy-action:42');
  assert.equal(action.legacy_action_id, 42);
  assert.equal(action.target_policy, COMBAT_TARGET_POLICIES.ONE_CREATURE);
  assert.deepEqual(action.effect_steps.map((step) => step.effect_type), [
    COMBAT_EFFECT_TYPES.ATTACK_ROLL,
    COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
  ]);
  assert.equal(action.authored_metadata.source, 'legacy_stat_block_action');
});

test('6D.4 preview is non-mutating and never rolls spends or emits mutation data', () => {
  const preview = previewCombatActionResolution({
    action: testStrikeAction({
      action_level_costs: [{ resource_id: 'limited-strike', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE }],
    }),
    actor: actor(),
    target: target(),
    resources: [resource()],
    source_state_version: 'combat-v1',
    preview_identity: 'preview:test-strike',
  });

  assert.equal(preview.operation_type, 'combat_action_preview');
  assert.equal(preview.mutates_state, false);
  assert.equal(preview.rolls_generated, false);
  assert.equal(preview.current_legality, 'available');
  assert.equal(JSON.stringify(preview).includes('mutation_instructions'), false);
  assert.equal(JSON.stringify(preview).includes('roll_record'), false);
});

test('6D.4 committed Test Strike resolves attack then damage and delegates math to rules foundation', () => {
  const result = resolveCombatAction({
    action: testStrikeAction(),
    actor: actor(),
    target: target(),
    committed_resolution_id: 'resolution:test-strike:1',
    generation_origin: testOrigin,
    roll_overrides: {
      attack: 12,
      damage: [4],
    },
  });

  assert.equal(result.status, COMBAT_ACTION_RESULT_STATUSES.RESOLVED);
  assert.equal(result.ordered_steps[0].step_id, 'attack');
  assert.equal(result.ordered_steps[0].was_hit, true);
  assert.equal(result.ordered_steps[1].step_id, 'damage');
  assert.equal(result.ordered_steps[1].result.damage.total_damage, 7);
  assert.equal(result.mutation_instructions[0].instruction_type, 'apply_hit_point_damage');
  assert.equal(result.player_result_bundle.status, COMBAT_ACTION_RESULT_STATUSES.RESOLVED);

  const player = projectCombatActionResultForPlayer(result);
  assert.equal(player.ordered_steps.length, 2);
  assert.equal(player.ordered_steps[0].was_hit, true);
  assert.equal(assertNoCombatActionPlayerHiddenData(player), true);
  assert.equal(JSON.stringify(player).includes('armor_class'), false);
  assert.equal(JSON.stringify(player).includes('roll_record'), false);

  const trace = buildCombatActionGmDevTrace(result);
  assert.equal(trace.gm_dev_trace.hidden_target_stats_before.armor_class, 14);
  assert.equal(trace.mutation_instructions[0].instruction_type, 'apply_hit_point_damage');
});

test('6D.4 Save Burst applies save policy and damage while keeping DC out of player projection', () => {
  const action = createCombatActionDefinition({
    action_id: 'save-burst',
    action_name: 'Save Burst',
    player_label: 'Save Burst',
    ruleset: DND5E_2014_RULESET,
    target_policy: COMBAT_TARGET_POLICIES.ONE_CREATURE,
    effect_steps: [
      {
        step_id: 'save',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.SAVING_THROW,
        params: {
          ability: 'DEX',
          difficulty_class: 12,
          success_policy: SAVE_SUCCESS_POLICIES.HALF_DAMAGE_ON_SUCCESS,
          modifiers: [{ source_id: 'dex-save', source_type: 'save_modifier', value: 2 }],
        },
      },
      {
        step_id: 'damage',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        params: {
          linked_save_step_id: 'save',
          components: [{ damage_type: 'fire', dice_count: 2, dice_size: 6 }],
        },
      },
    ],
  });

  const result = resolveCombatAction({
    action,
    actor: actor(),
    target: target(),
    committed_resolution_id: 'resolution:save-burst:1',
    generation_origin: testOrigin,
    roll_overrides: {
      save: 10,
      damage: [[3, 5]],
    },
  });

  assert.equal(result.ordered_steps[0].success, true);
  assert.equal(result.ordered_steps[1].result.damage.total_damage, 8);
  assert.equal(result.ordered_steps[1].result.saving_throw_adjustment.applied_amount, 4);
  const player = projectCombatActionResultForPlayer(result);
  assert.equal(JSON.stringify(player).includes('difficulty_class'), false);
});

test('6D.4 Heal Ward Restrain Cleanse Focus and metadata actions produce ordered structural effects', () => {
  const combinedAid = createCombatActionDefinition({
    action_id: 'combined-aid',
    action_name: 'Combined Aid',
    ruleset: DND5E_2014_RULESET,
    target_policy: COMBAT_TARGET_POLICIES.SELF,
    effect_steps: [
      {
        step_id: 'heal',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.HEALING,
        params: { dice_count: 1, dice_size: 8, flat_modifier: 2 },
      },
      {
        step_id: 'ward',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.TEMPORARY_HIT_POINTS,
        params: { amount: 5, policy: TEMPORARY_HIT_POINT_POLICIES.TAKE_HIGHER },
      },
      {
        step_id: 'restrain',
        order: 3,
        effect_type: COMBAT_EFFECT_TYPES.APPLY_CONDITION,
        duration: { duration_kind: COMBAT_DURATION_KINDS.UNTIL_END_OF_TARGET_NEXT_TURN },
        params: { condition_id: 'restrained', player_summary: 'The target is restrained.' },
      },
      {
        step_id: 'cleanse',
        order: 4,
        effect_type: COMBAT_EFFECT_TYPES.REMOVE_CONDITION,
        params: { condition_id: 'frightened', allow_missing: true },
      },
      {
        step_id: 'focus',
        order: 5,
        effect_type: COMBAT_EFFECT_TYPES.CONCENTRATION_START,
        duration: { duration_kind: COMBAT_DURATION_KINDS.UNTIL_CONCENTRATION_ENDS, concentration_required: true },
        params: { concentration_id: 'focus:test' },
      },
      {
        step_id: 'marker',
        order: 6,
        effect_type: COMBAT_EFFECT_TYPES.STATE_MARKER,
        params: { marker_id: 'combined-aid-used', marker_value: true },
      },
    ],
  });

  const result = resolveCombatAction({
    action: combinedAid,
    actor: actor({ current_hit_points: 4, conditions: [{ id: 'frightened' }] }),
    committed_resolution_id: 'resolution:combined-aid:1',
    generation_origin: testOrigin,
    roll_overrides: { heal: [6] },
  });

  assert.equal(result.status, COMBAT_ACTION_RESULT_STATUSES.RESOLVED);
  assert.equal(result.ordered_steps.map((step) => step.effect_type).join(','), [
    COMBAT_EFFECT_TYPES.HEALING,
    COMBAT_EFFECT_TYPES.TEMPORARY_HIT_POINTS,
    COMBAT_EFFECT_TYPES.APPLY_CONDITION,
    COMBAT_EFFECT_TYPES.REMOVE_CONDITION,
    COMBAT_EFFECT_TYPES.CONCENTRATION_START,
    COMBAT_EFFECT_TYPES.STATE_MARKER,
  ].join(','));
  assert.equal(result.ordered_steps[0].result.healing_total, 8);
  assert.equal(result.mutation_instructions.some((instruction) => instruction.instruction_type === 'apply_condition_instruction'), true);
  assert.equal(result.mutation_instructions.some((instruction) => instruction.instruction_type === 'combat_action_resolution'), false);
});

test('6D.4 action-level costs spend once while preview failed validation and duplicate handling do not spend again', () => {
  const limitedAction = testStrikeAction({
    action_id: 'limited-ability',
    action_name: 'Limited Ability',
    action_level_costs: [{ resource_id: 'limited-strike', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, amount: 1 }],
  });

  const preview = previewCombatActionResolution({
    action: limitedAction,
    actor: actor(),
    target: target(),
    resources: [resource()],
  });
  assert.equal(preview.mutates_state, false);

  const result = resolveCombatAction({
    action: limitedAction,
    actor: actor(),
    target: target(),
    resources: [resource()],
    committed_resolution_id: 'resolution:limited:1',
    generation_origin: testOrigin,
    roll_overrides: { attack: 15, damage: [2] },
  });
  assert.equal(result.status, COMBAT_ACTION_RESULT_STATUSES.RESOLVED);
  assert.equal(result.resources_after[0].current, 0);
  assert.deepEqual(result.resources_after[0].spent_resolution_ids, ['resolution:limited:1']);

  const duplicate = resolveCombatAction({
    existing_action_result: result,
    action: limitedAction,
    actor: actor(),
    target: target(),
    resources: result.resources_after,
    committed_resolution_id: 'resolution:limited:1',
  });
  assert.equal(duplicate.status, COMBAT_ACTION_RESULT_STATUSES.DUPLICATE_HANDLED);
  assert.equal(duplicate.resources_after[0].current, 0);

  const invalidTarget = resolveCombatAction({
    action: limitedAction,
    actor: actor(),
    target: null,
    resources: [resource()],
    committed_resolution_id: 'resolution:limited:invalid',
  });
  assert.equal(invalidTarget.status, COMBAT_ACTION_RESULT_STATUSES.TARGET_INVALID);
  assert.equal(invalidTarget.resources_after, undefined);
});

test('6D.4 step-level resource cost spends only when the step is reached', () => {
  const action = createCombatActionDefinition({
    action_id: 'secondary-save',
    action_name: 'Secondary Save',
    ruleset: DND5E_2014_RULESET,
    target_policy: COMBAT_TARGET_POLICIES.ONE_CREATURE,
    effect_steps: [
      {
        step_id: 'attack',
        order: 1,
        effect_type: COMBAT_EFFECT_TYPES.ATTACK_ROLL,
        params: { modifiers: [{ source_id: 'attack-mod', source_type: 'ability_modifier', value: 0 }] },
      },
      {
        step_id: 'secondary-cost',
        order: 2,
        effect_type: COMBAT_EFFECT_TYPES.RESOURCE_SPEND,
        depends_on_step_id: 'attack',
        requires_outcome: { was_hit: true },
        params: {
          costs: [{ resource_id: 'secondary', category: COMBAT_RESOURCE_CATEGORIES.CHARGE, amount: 1 }],
        },
      },
    ],
  });
  const charge = resource({
    resource_id: 'secondary',
    category: COMBAT_RESOURCE_CATEGORIES.CHARGE,
    current: 1,
    maximum: 1,
  });

  const miss = resolveCombatAction({
    action,
    actor: actor(),
    target: target(),
    resources: [charge],
    committed_resolution_id: 'resolution:secondary:miss',
    generation_origin: testOrigin,
    roll_overrides: { attack: 5 },
  });
  assert.equal(miss.ordered_steps[1].status, 'skipped');
  assert.equal(miss.resources_after[0].current, 1);

  const hit = resolveCombatAction({
    action,
    actor: actor(),
    target: target(),
    resources: [charge],
    committed_resolution_id: 'resolution:secondary:hit',
    generation_origin: testOrigin,
    roll_overrides: { attack: 18 },
  });
  assert.equal(hit.ordered_steps[1].status, 'resolved');
  assert.equal(hit.resources_after[0].current, 0);
});

test('6D.4 resource framework represents core categories and refresh helpers', () => {
  const resources = [
    resource({ resource_id: 'per-combat', category: COMBAT_RESOURCE_CATEGORIES.PER_COMBAT_USE, current: 0, maximum: 1 }),
    resource({ resource_id: 'short-rest', category: COMBAT_RESOURCE_CATEGORIES.SHORT_REST_USE, current: 0, maximum: 2 }),
    resource({ resource_id: 'long-rest', category: COMBAT_RESOURCE_CATEGORIES.LONG_REST_USE, current: 0, maximum: 3 }),
    resource({ resource_id: 'charge', category: COMBAT_RESOURCE_CATEGORIES.CHARGE, current: 0, maximum: 4 }),
    resource({ resource_id: 'pool', category: COMBAT_RESOURCE_CATEGORIES.POOL, current: 0, maximum: 5, refresh_triggers: [COMBAT_RESOURCE_REFRESH_TRIGGERS.SHORT_REST] }),
    resource({
      resource_id: 'tiered',
      category: COMBAT_RESOURCE_CATEGORIES.TIERED_POOL,
      tiers: { 1: { current: 0, maximum: 2 }, 2: { current: 0, maximum: 1 } },
      refresh_triggers: [COMBAT_RESOURCE_REFRESH_TRIGGERS.LONG_REST],
    }),
    resource({ resource_id: 'cooldown', category: COMBAT_RESOURCE_CATEGORIES.COOLDOWN, cooldown: { status: 'cooling_down', remaining_rounds: 1 } }),
    resource({ resource_id: 'recharge', category: COMBAT_RESOURCE_CATEGORIES.RECHARGE, current: 0, maximum: 1, recharge: { minimum_roll: 5 } }),
  ];

  const shortRest = restoreCombatResources({ resources, refresh_trigger: COMBAT_RESOURCE_REFRESH_TRIGGERS.SHORT_REST });
  assert.equal(shortRest.find((entry) => entry.resource_id === 'short-rest').current, 2);
  assert.equal(shortRest.find((entry) => entry.resource_id === 'pool').current, 5);
  assert.equal(shortRest.find((entry) => entry.resource_id === 'long-rest').current, 0);

  const longRest = restoreCombatResources({ resources: shortRest, refresh_trigger: COMBAT_RESOURCE_REFRESH_TRIGGERS.LONG_REST });
  assert.equal(longRest.find((entry) => entry.resource_id === 'long-rest').current, 3);
  assert.equal(longRest.find((entry) => entry.resource_id === 'tiered').tiers[1].current, 2);

  const chargeRestored = restoreCombatResources({ resources: longRest, refresh_trigger: COMBAT_RESOURCE_REFRESH_TRIGGERS.EXPLICIT_CHARGE_RESTORE });
  assert.equal(chargeRestored.find((entry) => entry.resource_id === 'charge').current, 4);

  const cooldownTick = restoreCombatResources({ resources: chargeRestored, refresh_trigger: COMBAT_RESOURCE_REFRESH_TRIGGERS.COOLDOWN_TICK });
  assert.equal(cooldownTick.find((entry) => entry.resource_id === 'cooldown').cooldown.status, 'ready');

  const recharge = restoreCombatResources({ resources: cooldownTick, refresh_trigger: COMBAT_RESOURCE_REFRESH_TRIGGERS.RECHARGE_ROLL, recharge_roll: 5 });
  assert.equal(recharge.find((entry) => entry.resource_id === 'recharge').current, 1);
});

test('6D.4 resource validation reports wrong owner tier cooldown insufficient and idempotent spends', () => {
  const tiered = resource({
    resource_id: 'slot',
    category: COMBAT_RESOURCE_CATEGORIES.TIERED_POOL,
    owner_ref: 'pc-1',
    tiers: { 1: { current: 1, maximum: 1 } },
  });
  assert.equal(validateCombatResourceCost({ resource_id: 'slot', category: COMBAT_RESOURCE_CATEGORIES.TIERED_POOL, tier: 2 }, [tiered], { owner_ref: 'pc-1' }).status, COMBAT_RESOURCE_SPEND_STATUSES.WRONG_TIER);
  assert.equal(validateCombatResourceCost({ resource_id: 'slot', category: COMBAT_RESOURCE_CATEGORIES.TIERED_POOL, tier: 1 }, [tiered], { owner_ref: 'other' }).status, COMBAT_RESOURCE_SPEND_STATUSES.WRONG_OWNER);

  const cooldown = resource({
    resource_id: 'cool',
    category: COMBAT_RESOURCE_CATEGORIES.COOLDOWN,
    cooldown: { status: 'cooling_down', remaining_rounds: 2 },
  });
  assert.equal(validateCombatResourceCost({ resource_id: 'cool', category: COMBAT_RESOURCE_CATEGORIES.COOLDOWN }, [cooldown], { owner_ref: 'pc-1' }).status, COMBAT_RESOURCE_SPEND_STATUSES.COOLDOWN_UNAVAILABLE);

  const spent = spendCombatResourceCosts({
    costs: [{ resource_id: 'slot', category: COMBAT_RESOURCE_CATEGORIES.TIERED_POOL, tier: 1 }],
    resources: [tiered],
    owner_ref: 'pc-1',
    committed_resolution_id: 'resolution:slot:1',
  });
  assert.equal(spent.success, true);
  assert.equal(spent.resources_after[0].tiers[1].current, 0);
  assert.deepEqual(spent.resources_after[0].spent_resolution_ids, ['resolution:slot:1']);

  const duplicate = spendCombatResourceCosts({
    costs: [{ resource_id: 'slot', category: COMBAT_RESOURCE_CATEGORIES.TIERED_POOL, tier: 1 }],
    resources: spent.resources_after,
    owner_ref: 'pc-1',
    committed_resolution_id: 'resolution:slot:1',
  });
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.spends[0].status, COMBAT_RESOURCE_SPEND_STATUSES.ALREADY_SPENT_FOR_RESOLUTION);
});

test('6D.4 explicit recovery needed is safe when authored resolution data is malformed', () => {
  const malformed = createCombatActionDefinition({
    action_id: 'malformed-damage',
    action_name: 'Malformed Damage',
    ruleset: DND5E_2014_RULESET,
    target_policy: COMBAT_TARGET_POLICIES.ONE_CREATURE,
    effect_steps: [
      {
        step_id: 'damage',
        effect_type: COMBAT_EFFECT_TYPES.DIRECT_DAMAGE,
        params: {
          components: [{ damage_type: 'imaginary', dice_count: 1, dice_size: 6 }],
        },
      },
    ],
  });

  const result = resolveCombatAction({
    action: malformed,
    actor: actor(),
    target: target(),
    committed_resolution_id: 'resolution:malformed:1',
    generation_origin: testOrigin,
    roll_overrides: { damage: [3] },
  });

  assert.equal(result.status, COMBAT_ACTION_RESULT_STATUSES.RECOVERY_NEEDED);
  assert.equal(result.player_result_bundle.status, COMBAT_ACTION_RESULT_STATUSES.RECOVERY_NEEDED);
  const player = projectCombatActionResultForPlayer(result);
  assert.equal(JSON.stringify(player).includes('error_message'), false);
  assert.equal(JSON.stringify(player).includes('trace'), false);
});
