import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTESTED_CHECK_OUTCOMES,
  DAMAGE_TYPES_2014,
  DND5E_2014_RULESET,
  D20_ROLL_MODES,
  ROLL_CATEGORIES,
  ROLL_GENERATION_ORIGINS,
  SAVE_SUCCESS_POLICIES,
  abilityModifierFromScore,
  applyDamageToHitPoints,
  applySavingThrowSuccessPolicy,
  assertNoRulesPlayerHiddenData,
  generateD20Roll,
  normalizeDamageType,
  projectRulesResultForPlayer,
  resolveAbilityCheck,
  resolveAttackRoll,
  resolveContestedAbilityCheck,
  resolveDamage,
  resolveRulesProvider,
  resolveRulesetIdentity,
  resolveSavingThrow,
} from '../src/engine/combat/rulesResolution.js';

const testOrigin = ROLL_GENERATION_ORIGINS.DETERMINISTIC_TEST_OVERRIDE;

function modifier(sourceType, value, visibility = 'player_safe') {
  return {
    source_id: sourceType,
    source_type: sourceType,
    player_label: visibility === 'player_safe' ? sourceType : null,
    internal_label: sourceType,
    visibility,
    value,
  };
}

test('6D.3 rules provider requires explicit dnd5e 2014 identity and preserves legacy ability modifier behavior', () => {
  const ruleset = resolveRulesetIdentity(DND5E_2014_RULESET);
  assert.equal(ruleset.system, 'dnd5e');
  assert.equal(ruleset.rules_version, '2014');

  const provider = resolveRulesProvider({ system: 'dnd5e', rules_version: '2014' });
  assert.equal(provider.ruleset.ruleset_id, 'dnd5e-2014');
  assert.equal(typeof provider.resolveAttackRoll, 'function');

  assert.throws(
    () => resolveRulesProvider({ system: 'dnd5e', rules_version: '2024' }),
    /Unsupported combat ruleset/
  );
  assert.throws(
    () => resolveRulesProvider({ system: 'dnd5e' }),
    /requires an explicit ruleset/
  );

  assert.equal(abilityModifierFromScore(8), -1);
  assert.equal(abilityModifierFromScore(16), 3);
});

test('6D.3 authoritative d20 rolls support live server dice deterministic overrides reuse and immutable records', () => {
  const live = generateD20Roll({
    ruleset: DND5E_2014_RULESET,
    roll_category: ROLL_CATEGORIES.INITIATIVE,
    random: () => 0.99,
  });
  assert.equal(live.raw_die_results[0], 20);
  assert.equal(live.generation_origin, ROLL_GENERATION_ORIGINS.SERVER_RANDOM);

  const deterministic = generateD20Roll({
    ruleset: DND5E_2014_RULESET,
    roll_category: ROLL_CATEGORIES.ATTACK,
    roll_id: 'roll:test:attack',
    roll_override: 13,
    generation_origin: testOrigin,
    modifiers: [modifier('ability_modifier', 4), modifier('proficiency_bonus', 2)],
  });
  assert.equal(deterministic.final_total, 19);
  assert.equal(deterministic.generation_origin, testOrigin);
  assert.equal(Object.isFrozen(deterministic), true);
  assert.equal(Object.isFrozen(deterministic.raw_die_results), true);
  assert.throws(() => {
    deterministic.raw_die_results.push(20);
  }, /object is not extensible|Cannot add property/);

  let randomCalls = 0;
  const reused = generateD20Roll({
    ruleset: DND5E_2014_RULESET,
    existing_roll_record: deterministic,
    random: () => {
      randomCalls += 1;
      return 0;
    },
  });
  assert.equal(reused.generation_origin, ROLL_GENERATION_ORIGINS.REUSED_ROLL_RECORD);
  assert.equal(reused.reused_from_roll_id, 'roll:test:attack');
  assert.equal(reused.final_total, 19);
  assert.equal(randomCalls, 0);

  assert.throws(
    () =>
      generateD20Roll({
        ruleset: DND5E_2014_RULESET,
        roll_override: 20,
      }),
    /Roll overrides require/
  );
});

test('6D.3 advantage and disadvantage follow 2014 cancellation and modifier timing rules', () => {
  const advantage = generateD20Roll({
    ruleset: DND5E_2014_RULESET,
    roll_override: [4, 17],
    generation_origin: testOrigin,
    advantage_sources: ['flanking', 'help'],
    modifiers: [modifier('ability_modifier', 5)],
  });
  assert.equal(advantage.effective_roll_mode, D20_ROLL_MODES.ADVANTAGE);
  assert.deepEqual(advantage.raw_die_results, [4, 17]);
  assert.deepEqual(advantage.selected_die_results, [17]);
  assert.deepEqual(advantage.discarded_die_results, [4]);
  assert.equal(advantage.final_total, 22);
  assert.equal(advantage.advantage_sources.length, 2);

  const disadvantage = generateD20Roll({
    ruleset: DND5E_2014_RULESET,
    roll_override: [4, 17],
    generation_origin: testOrigin,
    disadvantage_sources: ['long_range', 'fog'],
  });
  assert.equal(disadvantage.effective_roll_mode, D20_ROLL_MODES.DISADVANTAGE);
  assert.deepEqual(disadvantage.selected_die_results, [4]);
  assert.deepEqual(disadvantage.discarded_die_results, [17]);

  const canceled = generateD20Roll({
    ruleset: DND5E_2014_RULESET,
    roll_override: 9,
    generation_origin: testOrigin,
    advantage_sources: ['help'],
    disadvantage_sources: ['poisoned'],
    modifiers: [modifier('cover', -2)],
  });
  assert.equal(canceled.effective_roll_mode, D20_ROLL_MODES.NORMAL);
  assert.equal(canceled.roll_mode_canceled, true);
  assert.deepEqual(canceled.raw_die_results, [9]);
  assert.deepEqual(canceled.advantage_sources, ['help']);
  assert.deepEqual(canceled.disadvantage_sources, ['poisoned']);
  assert.equal(canceled.final_total, 7);
});

test('6D.3 attack rolls handle AC comparison natural one natural twenty cover advantage disadvantage and safe projection', () => {
  const equalAc = resolveAttackRoll({
    ruleset: DND5E_2014_RULESET,
    target_armor_class: 18,
    roll_override: 13,
    generation_origin: testOrigin,
    modifiers: [modifier('ability_modifier', 3), modifier('proficiency_bonus', 2)],
  });
  assert.equal(equalAc.final_total, 18);
  assert.equal(equalAc.was_hit, true);
  assert.equal(equalAc.is_critical_hit, false);

  const coverMiss = resolveAttackRoll({
    ruleset: DND5E_2014_RULESET,
    target_armor_class: 18,
    roll_override: 14,
    generation_origin: testOrigin,
    modifiers: [modifier('ability_modifier', 5), modifier('cover', -2)],
  });
  assert.equal(coverMiss.final_total, 17);
  assert.equal(coverMiss.was_miss, true);

  const naturalOne = resolveAttackRoll({
    ruleset: DND5E_2014_RULESET,
    target_armor_class: 1,
    roll_override: 1,
    generation_origin: testOrigin,
    modifiers: [modifier('huge_bonus', 99)],
  });
  assert.equal(naturalOne.was_hit, false);
  assert.equal(naturalOne.automatic_result, 'natural_one_automatic_miss');

  const naturalTwenty = resolveAttackRoll({
    ruleset: DND5E_2014_RULESET,
    target_armor_class: 99,
    roll_override: 20,
    generation_origin: testOrigin,
    modifiers: [modifier('penalty', -5)],
  });
  assert.equal(naturalTwenty.was_hit, true);
  assert.equal(naturalTwenty.is_critical_hit, true);

  const advantage = resolveAttackRoll({
    ruleset: DND5E_2014_RULESET,
    target_armor_class: 16,
    roll_override: [3, 15],
    generation_origin: testOrigin,
    advantage_sources: ['help'],
  });
  assert.equal(advantage.was_hit, false);
  assert.equal(advantage.roll_record.effective_roll_mode, D20_ROLL_MODES.ADVANTAGE);

  const reused = resolveAttackRoll({
    ruleset: DND5E_2014_RULESET,
    target_armor_class: 16,
    existing_roll_record: equalAc.roll_record,
  });
  assert.equal(reused.final_total, 18);
  assert.equal(reused.roll_record.generation_origin, ROLL_GENERATION_ORIGINS.REUSED_ROLL_RECORD);

  const player = projectRulesResultForPlayer(naturalTwenty);
  const playerText = JSON.stringify(player);
  assert.equal(player.player_summary.critical_hit, true);
  assert.equal(playerText.includes('target_armor_class'), false);
  assert.equal(playerText.includes('armor_class'), false);
});

test('6D.3 saving throws compare against DC without natural auto outcomes and apply success policies', () => {
  const equalDc = resolveSavingThrow({
    ruleset: DND5E_2014_RULESET,
    ability: 'DEX',
    difficulty_class: 13,
    roll_override: 9,
    generation_origin: testOrigin,
    modifiers: [modifier('dexterity_save', 4)],
  });
  assert.equal(equalDc.success, true);

  const naturalOneStillSucceeds = resolveSavingThrow({
    ruleset: DND5E_2014_RULESET,
    ability: 'CON',
    difficulty_class: 11,
    roll_override: 1,
    generation_origin: testOrigin,
    modifiers: [modifier('constitution_save', 10)],
  });
  assert.equal(naturalOneStillSucceeds.success, true);

  const naturalTwentyStillFails = resolveSavingThrow({
    ruleset: DND5E_2014_RULESET,
    ability: 'WIS',
    difficulty_class: 25,
    roll_override: 20,
    generation_origin: testOrigin,
    modifiers: [modifier('wisdom_save', 0)],
  });
  assert.equal(naturalTwentyStillFails.failure, true);

  const disadvantage = resolveSavingThrow({
    ruleset: DND5E_2014_RULESET,
    ability: 'DEX',
    difficulty_class: 10,
    roll_override: [18, 5],
    generation_origin: testOrigin,
    disadvantage_sources: ['restrained'],
    modifiers: [modifier('dexterity_save', 4)],
  });
  assert.equal(disadvantage.success, false);

  assert.equal(
    applySavingThrowSuccessPolicy({
      save_result: equalDc,
      amount: 11,
      success_policy: SAVE_SUCCESS_POLICIES.HALF_DAMAGE_ON_SUCCESS,
    }).applied_amount,
    5
  );
  assert.equal(
    applySavingThrowSuccessPolicy({
      save_result: equalDc,
      amount: 11,
      success_policy: SAVE_SUCCESS_POLICIES.NO_EFFECT_ON_SUCCESS,
    }).applied_amount,
    0
  );
  assert.equal(
    applySavingThrowSuccessPolicy({
      save_result: naturalTwentyStillFails,
      amount: 11,
      success_policy: SAVE_SUCCESS_POLICIES.FULL_EFFECT_ON_FAILURE,
    }).applied_amount,
    11
  );

  const playerText = JSON.stringify(projectRulesResultForPlayer(equalDc));
  assert.equal(playerText.includes('difficulty_class'), false);
});

test('6D.3 ability checks support DC and open checks without natural auto outcomes', () => {
  const dcCheck = resolveAbilityCheck({
    ruleset: DND5E_2014_RULESET,
    ability: 'STR',
    difficulty_class: 15,
    roll_override: 12,
    generation_origin: testOrigin,
    modifiers: [modifier('strength_modifier', 3)],
  });
  assert.equal(dcCheck.success, true);

  const openCheck = resolveAbilityCheck({
    ruleset: DND5E_2014_RULESET,
    ability: 'INT',
    roll_override: 14,
    generation_origin: testOrigin,
    modifiers: [modifier('intelligence_modifier', 2)],
  });
  assert.equal(openCheck.final_total, 16);
  assert.equal(openCheck.success, null);

  const naturalOneSucceeds = resolveAbilityCheck({
    ruleset: DND5E_2014_RULESET,
    ability: 'CHA',
    difficulty_class: 10,
    roll_override: 1,
    generation_origin: testOrigin,
    modifiers: [modifier('expertise', 12)],
  });
  assert.equal(naturalOneSucceeds.success, true);

  const naturalTwentyFails = resolveAbilityCheck({
    ruleset: DND5E_2014_RULESET,
    ability: 'WIS',
    difficulty_class: 25,
    roll_override: 20,
    generation_origin: testOrigin,
    modifiers: [modifier('wisdom_modifier', 0)],
  });
  assert.equal(naturalTwentyFails.failure, true);
  assert.equal(dcCheck.roll_record.modifiers[0].source_type, 'strength_modifier');
});

test('6D.3 contested checks compare resolved totals and preserve status quo on ties', () => {
  const actorWins = resolveContestedAbilityCheck({
    ruleset: DND5E_2014_RULESET,
    actor_check: {
      ability: 'STR',
      roll_override: [7, 18],
      generation_origin: testOrigin,
      advantage_sources: ['leverage'],
      modifiers: [modifier('strength_modifier', 3)],
    },
    opponent_check: {
      ability: 'DEX',
      roll_override: [16, 2],
      generation_origin: testOrigin,
      disadvantage_sources: ['off_balance'],
      modifiers: [modifier('dexterity_modifier', 4)],
    },
  });
  assert.equal(actorWins.outcome, CONTESTED_CHECK_OUTCOMES.ACTOR_WINS);
  assert.equal(actorWins.actor_check.final_total, 21);
  assert.equal(actorWins.opponent_check.final_total, 6);

  const opponentWins = resolveContestedAbilityCheck({
    ruleset: DND5E_2014_RULESET,
    actor_check: { ability: 'STR', roll_override: 8, generation_origin: testOrigin },
    opponent_check: { ability: 'DEX', roll_override: 12, generation_origin: testOrigin },
  });
  assert.equal(opponentWins.outcome, CONTESTED_CHECK_OUTCOMES.OPPONENT_WINS);

  const tie = resolveContestedAbilityCheck({
    ruleset: DND5E_2014_RULESET,
    actor_check: { ability: 'STR', roll_override: 10, generation_origin: testOrigin },
    opponent_check: { ability: 'DEX', roll_override: 10, generation_origin: testOrigin },
  });
  assert.equal(tie.outcome, CONTESTED_CHECK_OUTCOMES.TIE_STATUS_QUO);
});

test('6D.3 damage type validation supports standard 2014 types and rejects unknown or healing', () => {
  for (const damageType of DAMAGE_TYPES_2014) {
    assert.equal(normalizeDamageType(damageType, DND5E_2014_RULESET), damageType);
  }
  assert.equal(normalizeDamageType(' Fire ', DND5E_2014_RULESET), 'fire');
  assert.throws(() => normalizeDamageType('void', DND5E_2014_RULESET), /Unsupported damage type/);
  assert.throws(() => normalizeDamageType('healing', DND5E_2014_RULESET), /Healing is not a damage type/);
});

test('6D.3 critical damage doubles eligible dice only and preserves typed ordered components', () => {
  const damage = resolveDamage({
    ruleset: DND5E_2014_RULESET,
    is_critical_hit: true,
    generation_origin: testOrigin,
    roll_overrides: [[5, 7], [2, 3], [4]],
    components: [
      {
        component_id: 'blade',
        damage_type: 'slashing',
        dice_count: 1,
        dice_size: 8,
        flat_modifier: 3,
        critical_eligible: true,
      },
      {
        component_id: 'flame',
        damage_type: 'fire',
        dice_count: 1,
        dice_size: 6,
        critical_eligible: true,
      },
      {
        component_id: 'venom',
        damage_type: 'poison',
        dice_count: 1,
        dice_size: 4,
        critical_eligible: false,
      },
    ],
  });

  assert.equal(damage.total_damage, 24);
  assert.deepEqual(damage.damage_types, ['slashing', 'fire', 'poison']);
  assert.deepEqual(
    damage.components.map((entry) => ({
      id: entry.component_id,
      dice: entry.critical_expansion.effective_dice_count,
      total: entry.post_defense_subtotal,
    })),
    [
      { id: 'blade', dice: 2, total: 15 },
      { id: 'flame', dice: 2, total: 5 },
      { id: 'venom', dice: 1, total: 4 },
    ]
  );
});

test('6D.3 resistance vulnerability immunity apply per component with correct stacking and rounding', () => {
  const damage = resolveDamage({
    ruleset: DND5E_2014_RULESET,
    defense_profile: {
      resistances: [
        { damage_type: 'slashing', source_id: 'armor' },
        { damage_type: 'slashing', source_id: 'ward' },
      ],
      vulnerabilities: ['slashing', 'fire'],
      immunities: ['fire'],
    },
    components: [
      { damage_type: 'slashing', flat_modifier: 5 },
      { damage_type: 'fire', flat_modifier: 6 },
      { damage_type: 'thunder', flat_modifier: 3 },
    ],
  });

  assert.equal(damage.total_damage, 7);
  assert.equal(damage.components[0].post_defense_subtotal, 4);
  assert.deepEqual(
    damage.components[0].defense_applications.map((entry) => ({
      defense: entry.defense,
      before: entry.before,
      after: entry.after,
      sourceCount: entry.sources.length,
    })),
    [
      { defense: 'resistance', before: 5, after: 2, sourceCount: 2 },
      { defense: 'vulnerability', before: 2, after: 4, sourceCount: 1 },
    ]
  );
  assert.equal(damage.components[1].post_defense_subtotal, 0);
  assert.equal(damage.components[1].defense_applications[0].defense, 'immunity');
  assert.equal(damage.components[2].post_defense_subtotal, 3);
});

test('6D.3 temporary and current hit point application distinguishes one instance from separate hits', () => {
  const oneInstance = applyDamageToHitPoints({
    damage_total: 9,
    current_hit_points: 10,
    max_hit_points: 12,
    temporary_hit_points: 4,
  });
  assert.equal(oneInstance.temporary_hit_points_absorbed, 4);
  assert.equal(oneInstance.damage_taken_after_temporary_hit_points, 5);
  assert.equal(oneInstance.after.current_hit_points, 5);
  assert.equal(oneInstance.after.temporary_hit_points, 0);
  assert.equal(oneInstance.reached_zero_hit_points, false);

  const fullyAbsorbed = applyDamageToHitPoints({
    damage_total: 3,
    current_hit_points: 10,
    temporary_hit_points: 4,
  });
  assert.equal(fullyAbsorbed.after.current_hit_points, 10);
  assert.equal(fullyAbsorbed.after.temporary_hit_points, 1);

  const firstHit = applyDamageToHitPoints({
    damage_total: 4,
    current_hit_points: 6,
    temporary_hit_points: 2,
  });
  const secondHit = applyDamageToHitPoints({
    damage_total: 5,
    current_hit_points: firstHit.after.current_hit_points,
    temporary_hit_points: firstHit.after.temporary_hit_points,
  });
  assert.equal(firstHit.after.current_hit_points, 4);
  assert.equal(secondHit.after.current_hit_points, 0);
  assert.equal(secondHit.reached_zero_hit_points, true);
});

test('6D.3 traces reconstruct calculations while player-safe summaries exclude hidden internals', () => {
  const attack = resolveAttackRoll({
    ruleset: DND5E_2014_RULESET,
    target_armor_class: 17,
    roll_override: [3, 19],
    generation_origin: testOrigin,
    advantage_sources: ['help'],
    modifiers: [modifier('ability_modifier', 4), modifier('hidden_blessing', 1, 'gm_dev')],
  });
  assert.equal(attack.trace.roll_record.raw_die_results[1], 19);
  assert.equal(attack.trace.roll_record.modifier_total, 5);
  assert.equal(attack.trace.target_armor_class, 17);
  assert.equal(attack.trace.outcome.was_hit, true);

  const damage = resolveDamage({
    ruleset: DND5E_2014_RULESET,
    is_critical_hit: true,
    generation_origin: testOrigin,
    roll_overrides: [[6, 1]],
    defense_profile: { resistances: ['cold'] },
    components: [{ damage_type: 'cold', dice_count: 1, dice_size: 6, flat_modifier: 1 }],
  });
  assert.equal(damage.trace.damage_components[0].critical_expansion.doubled_for_critical, true);
  assert.equal(damage.trace.damage_components[0].defense_applications[0].rounding, 'round_down');

  const hp = applyDamageToHitPoints({
    damage_total: damage.total_damage,
    current_hit_points: 5,
    temporary_hit_points: 2,
  });
  assert.equal(hp.trace.hit_point_application.before.temporary_hit_points, 2);

  const projected = projectRulesResultForPlayer(attack);
  const projectedText = JSON.stringify(projected);
  assert.equal(projected.player_summary.final_total, 24);
  assert.equal(projectedText.includes('target_armor_class'), false);
  assert.equal(projectedText.includes('trace'), false);
  assert.equal(projectedText.includes('roll_record'), false);
  assert.throws(
    () => assertNoRulesPlayerHiddenData({ player_summary: { target_armor_class: 17 } }),
    /hidden\/internal data/
  );
});
