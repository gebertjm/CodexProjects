function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateAbilityModifier(score) {
  const numericScore = toNumberOrNull(score);

  if (numericScore === null) {
    return 0;
  }

  return Math.floor((numericScore - 10) / 2);
}

export function rollD20(override = undefined) {
  if (override !== undefined) {
    const parsed = Number(override);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
      throw new Error('d20 override must be an integer from 1 to 20');
    }

    return parsed;
  }

  return Math.floor(Math.random() * 20) + 1;
}

function normalizeDiceOverridesForEntry(overrides, entryIndex, damageEntry) {
  if (!Array.isArray(overrides)) {
    return null;
  }

  if (Array.isArray(overrides[entryIndex])) {
    return overrides[entryIndex];
  }

  if (entryIndex === 0 && overrides.every((value) => Number.isInteger(Number(value)))) {
    return overrides;
  }

  if (damageEntry.dice_count === 1 && overrides[entryIndex] !== undefined) {
    return [overrides[entryIndex]];
  }

  return null;
}

function rollDie(dieSize, override = undefined) {
  if (override !== undefined) {
    const parsed = Number(override);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > dieSize) {
      throw new Error(`d${dieSize} override must be an integer from 1 to ${dieSize}`);
    }

    return parsed;
  }

  return Math.floor(Math.random() * dieSize) + 1;
}

export function rollDamageEntry(damageEntry, overrides = undefined) {
  const rolls = [];

  for (let index = 0; index < Number(damageEntry.dice_count); index += 1) {
    rolls.push(rollDie(Number(damageEntry.dice_size), Array.isArray(overrides) ? overrides[index] : undefined));
  }

  const baseRollTotal = rolls.reduce((sum, value) => sum + value, 0);
  const modifier = Number(damageEntry.modifier ?? 0);

  return {
    rolls,
    base_roll_total: baseRollTotal,
    modifier,
    total: baseRollTotal + modifier,
  };
}

function extractStaticAttackBonus(action) {
  const effect = (action.effects ?? []).find((entry) => entry.effect_type === 'attack_bonus');
  return Number(effect?.value?.bonus ?? 0);
}

function extractDynamicAttackBonus(action, actor) {
  const effect = (action.effects ?? []).find(
    (entry) => entry.effect_type === 'attack_ability_modifier'
  );

  if (!effect) {
    return 0;
  }

  const abilityCode = String(effect.value?.ability ?? '').trim().toUpperCase();
  const abilityScore = actor.abilities?.[abilityCode] ?? null;
  let bonus = calculateAbilityModifier(abilityScore);

  if (effect.value?.add_proficiency) {
    bonus += Number(actor.proficiency_bonus ?? 0);
  }

  return bonus;
}

function extractDamageAbilityModifier(action, actor) {
  const effect = (action.effects ?? []).find(
    (entry) => entry.effect_type === 'damage_ability_modifier'
  );

  if (!effect) {
    return 0;
  }

  const abilityCode = String(effect.value?.ability ?? '').trim().toUpperCase();
  const abilityScore = actor.abilities?.[abilityCode] ?? null;
  return calculateAbilityModifier(abilityScore);
}

function applyDamageToHitPoints(target, totalDamage) {
  const tempHpBefore = Number(target.temporary_hp ?? 0);
  const currentHpBefore = Number(target.current_hp ?? 0);
  const absorbedByTempHp = Math.min(tempHpBefore, totalDamage);
  const remainingDamage = Math.max(totalDamage - absorbedByTempHp, 0);
  const tempHpAfter = Math.max(tempHpBefore - totalDamage, 0);
  const currentHpAfter = Math.max(currentHpBefore - remainingDamage, 0);

  return {
    current_hp_before: currentHpBefore,
    temporary_hp_before: tempHpBefore,
    absorbed_by_temporary_hp: absorbedByTempHp,
    applied_to_hit_points: remainingDamage,
    current_hp_after: currentHpAfter,
    temporary_hp_after: tempHpAfter,
    is_defeated: currentHpAfter <= 0,
  };
}

export function buildInitiativeOrder(participants, initiativeOverrides = []) {
  const overrideMap = new Map();

  for (const entry of initiativeOverrides ?? []) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const key = entry.participant_id
      ? `participant:${Number(entry.participant_id)}`
      : entry.entity_type && entry.entity_id
        ? `${entry.entity_type}:${Number(entry.entity_id)}`
        : null;

    if (key) {
      overrideMap.set(key, entry.roll);
    }
  }

  const enriched = participants.map((participant) => {
    const overrideKey = `participant:${participant.id}`;
    const fallbackKey = `${participant.entity_type}:${participant.entity_id}`;
    const roll = rollD20(
      overrideMap.has(overrideKey) ? overrideMap.get(overrideKey) : overrideMap.get(fallbackKey)
    );
    const dexterityModifier = calculateAbilityModifier(participant.abilities?.DEX ?? null);
    const initiative = roll + dexterityModifier;

    return {
      ...participant,
      initiative_roll: roll,
      dexterity_modifier: dexterityModifier,
      initiative,
    };
  });

  enriched.sort((left, right) => {
    if (right.initiative !== left.initiative) {
      return right.initiative - left.initiative;
    }

    if (right.dexterity_modifier !== left.dexterity_modifier) {
      return right.dexterity_modifier - left.dexterity_modifier;
    }

    return left.id - right.id;
  });

  return enriched.map((participant, index) => ({
    ...participant,
    turn_order: index + 1,
  }));
}

export function resolveAttackAction({
  actor,
  target,
  action,
  attackRollOverride,
  damageRollOverrides,
}) {
  const attackRoll = rollD20(attackRollOverride);
  const attackModifier = extractStaticAttackBonus(action) + extractDynamicAttackBonus(action, actor);
  const attackTotal = attackRoll + attackModifier;
  const targetArmorClass = Number(target.armor_class);
  const isCriticalHit = attackRoll === 20;
  const isAutomaticMiss = attackRoll === 1;
  const wasHit = isCriticalHit ? true : isAutomaticMiss ? false : attackTotal >= targetArmorClass;

  let totalDamage = 0;
  let hpResult = {
    current_hp_before: Number(target.current_hp ?? 0),
    temporary_hp_before: Number(target.temporary_hp ?? 0),
    absorbed_by_temporary_hp: 0,
    applied_to_hit_points: 0,
    current_hp_after: Number(target.current_hp ?? 0),
    temporary_hp_after: Number(target.temporary_hp ?? 0),
    is_defeated: Boolean(target.is_defeated),
  };

  const damageDetails = [];

  if (wasHit) {
    const dynamicDamageModifier = extractDamageAbilityModifier(action, actor);

    for (let index = 0; index < (action.damage ?? []).length; index += 1) {
      const damageEntry = action.damage[index];
      const entryOverrides = normalizeDiceOverridesForEntry(
        damageRollOverrides,
        index,
        damageEntry
      );
      const rolled = rollDamageEntry(damageEntry, entryOverrides);
      const dynamicBonus = index === 0 ? dynamicDamageModifier : 0;
      const entryTotal = Math.max(rolled.total + dynamicBonus, 0);

      damageDetails.push({
        damage_type: damageEntry.damage_type,
        damage_text: damageEntry.damage_text,
        dice_count: Number(damageEntry.dice_count),
        dice_size: Number(damageEntry.dice_size),
        static_modifier: Number(damageEntry.modifier ?? 0),
        dynamic_modifier: dynamicBonus,
        rolls: rolled.rolls,
        total: entryTotal,
      });

      totalDamage += entryTotal;
    }

    hpResult = applyDamageToHitPoints(target, totalDamage);
  }

  const narrativeText = wasHit
    ? `${actor.display_name} uses ${action.name} against ${target.display_name} and hits for ${totalDamage} damage.`
    : `${actor.display_name} uses ${action.name} against ${target.display_name} but misses.`;
  const resultSummary = wasHit
    ? `${action.name} hits for ${totalDamage} damage`
    : `${action.name} misses`;

  return {
    attack: {
      action_id: Number(action.id),
      action_name: action.name,
      attack_roll: attackRoll,
      attack_modifier: attackModifier,
      attack_total: attackTotal,
      target_armor_class: targetArmorClass,
      is_critical_hit: isCriticalHit,
      is_automatic_miss: isAutomaticMiss,
      was_hit: wasHit,
    },
    damage: {
      total_damage: totalDamage,
      entries: damageDetails,
    },
    target_state: hpResult,
    narrative_text: narrativeText,
    result_summary: resultSummary,
  };
}

export function selectAiAction({ actor, participants, availableActions }) {
  const target = participants.find(
    (participant) =>
      participant.id !== actor.id &&
      participant.faction !== actor.faction &&
      participant.is_active &&
      !participant.is_defeated
  );

  if (!target) {
    return {
      action: null,
      target: null,
      reason: 'no_valid_target',
    };
  }

  const action =
    availableActions.find((entry) => entry.requires_attack_roll) ??
    availableActions[0] ??
    null;

  if (!action) {
    return {
      action: null,
      target,
      reason: 'no_valid_action',
    };
  }

  return {
    action,
    target,
    reason: 'basic_attack',
  };
}
