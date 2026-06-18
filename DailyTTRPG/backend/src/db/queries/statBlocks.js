export const selectStatBlocksQuery = `
  SELECT
    stat_block.id,
    stat_block.name,
    stat_block.size,
    stat_block.creature_type,
    stat_block.alignment,
    stat_block.armor_class,
    stat_block.hit_point_max,
    stat_block.hit_dice_text,
    stat_block.speed_walk,
    stat_block.speed_fly,
    stat_block.speed_swim,
    stat_block.speed_climb,
    stat_block.proficiency_bonus,
    stat_block.challenge_rating,
    stat_block.xp_value,
    stat_block.passive_perception,
    stat_block.source,
    stat_block.notes,
    stat_block.created_at,
    stat_block.updated_at,
    npc.id AS npc_id,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.role AS npc_role,
    monster.id AS monster_id,
    monster.key AS monster_key,
    monster.name AS monster_name,
    COALESCE(action_counts.action_count, 0) AS action_count,
    COALESCE(trait_counts.trait_count, 0) AS trait_count
  FROM dnd5e_stat_block stat_block
  LEFT JOIN dnd5e_npc npc ON npc.stat_block_id = stat_block.id
  LEFT JOIN dnd5e_monster monster ON monster.stat_block_id = stat_block.id
  LEFT JOIN (
    SELECT stat_block_id, COUNT(*)::INTEGER AS action_count
    FROM dnd5e_stat_block_action
    GROUP BY stat_block_id
  ) action_counts ON action_counts.stat_block_id = stat_block.id
  LEFT JOIN (
    SELECT stat_block_id, COUNT(*)::INTEGER AS trait_count
    FROM dnd5e_stat_block_trait
    GROUP BY stat_block_id
  ) trait_counts ON trait_counts.stat_block_id = stat_block.id
  ORDER BY stat_block.name ASC, stat_block.id ASC;
`;

export const selectStatBlockByIdQuery = `
  SELECT
    stat_block.id,
    stat_block.name,
    stat_block.size,
    stat_block.creature_type,
    stat_block.alignment,
    stat_block.armor_class,
    stat_block.hit_point_max,
    stat_block.hit_dice_text,
    stat_block.speed_walk,
    stat_block.speed_fly,
    stat_block.speed_swim,
    stat_block.speed_climb,
    stat_block.proficiency_bonus,
    stat_block.challenge_rating,
    stat_block.xp_value,
    stat_block.passive_perception,
    stat_block.source,
    stat_block.notes,
    stat_block.created_at,
    stat_block.updated_at,
    npc.id AS npc_id,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.role AS npc_role,
    monster.id AS monster_id,
    monster.key AS monster_key,
    monster.name AS monster_name
  FROM dnd5e_stat_block stat_block
  LEFT JOIN dnd5e_npc npc ON npc.stat_block_id = stat_block.id
  LEFT JOIN dnd5e_monster monster ON monster.stat_block_id = stat_block.id
  WHERE stat_block.id = $1;
`;

export const selectStatBlockAbilitiesQuery = `
  SELECT
    ability.id,
    ability.stat_block_id,
    ability.ability,
    ability.score,
    ability_score_type.name AS ability_name
  FROM dnd5e_stat_block_ability ability
  JOIN dnd5e_ability_score_type ability_score_type
    ON ability_score_type.code = ability.ability
  WHERE ability.stat_block_id = $1
  ORDER BY CASE ability.ability
    WHEN 'STR' THEN 1
    WHEN 'DEX' THEN 2
    WHEN 'CON' THEN 3
    WHEN 'INT' THEN 4
    WHEN 'WIS' THEN 5
    WHEN 'CHA' THEN 6
    ELSE 99
  END;
`;

export const selectStatBlockSkillsQuery = `
  SELECT
    skill_row.id,
    skill_row.stat_block_id,
    skill_row.skill,
    skill_row.is_proficient,
    skill_row.modifier,
    skill.name AS skill_name,
    ability_score_type.code AS ability_code,
    ability_score_type.name AS ability_name
  FROM dnd5e_stat_block_skill skill_row
  JOIN dnd5e_skill skill ON skill.slug = skill_row.skill
  JOIN dnd5e_ability_score_type ability_score_type ON ability_score_type.id = skill.ability_score_type_id
  WHERE skill_row.stat_block_id = $1
  ORDER BY skill.name ASC, skill_row.id ASC;
`;

export const selectStatBlockSensesQuery = `
  SELECT
    sense.id,
    sense.stat_block_id,
    sense.sense_type,
    sense.range_feet,
    sense_type.name AS sense_name
  FROM dnd5e_stat_block_sense sense
  JOIN dnd5e_sense_type sense_type ON sense_type.slug = sense.sense_type
  WHERE sense.stat_block_id = $1
  ORDER BY sense.range_feet DESC, sense.id ASC;
`;

export const selectStatBlockResistancesQuery = `
  SELECT
    resistance.id,
    resistance.stat_block_id,
    resistance.resistance_type,
    resistance.damage_type,
    resistance.notes,
    damage_type.name AS damage_type_name
  FROM dnd5e_stat_block_resistance resistance
  LEFT JOIN dnd5e_damage_type damage_type ON damage_type.slug = resistance.damage_type
  WHERE resistance.stat_block_id = $1
  ORDER BY resistance.resistance_type ASC, resistance.damage_type ASC NULLS LAST, resistance.id ASC;
`;

export const selectStatBlockActionsQuery = `
  SELECT
    stat_block_action.id AS stat_block_action_id,
    stat_block_action.stat_block_id,
    stat_block_action.display_order,
    action.id,
    action.name,
    action.action_type,
    action.description,
    action.requires_attack_roll,
    action.range_type,
    action.range_normal,
    action.range_max,
    action.saving_throw_ability,
    action.saving_throw_dc,
    action.created_at,
    action.updated_at
  FROM dnd5e_stat_block_action stat_block_action
  JOIN dnd5e_action action ON action.id = stat_block_action.action_id
  WHERE stat_block_action.stat_block_id = $1
  ORDER BY stat_block_action.display_order ASC, action.name ASC, action.id ASC;
`;

export const selectActionByIdQuery = `
  SELECT
    action.id,
    action.name,
    action.action_type,
    action.description,
    action.requires_attack_roll,
    action.range_type,
    action.range_normal,
    action.range_max,
    action.saving_throw_ability,
    action.saving_throw_dc,
    action.created_at,
    action.updated_at
  FROM dnd5e_action action
  WHERE action.id = $1;
`;

export const selectActionDamagesByActionIdsQuery = `
  SELECT
    damage.id,
    damage.action_id,
    damage.dice_count,
    damage.dice_size,
    damage.modifier,
    damage.damage_type,
    damage.damage_text,
    damage_type.name AS damage_type_name
  FROM dnd5e_action_damage damage
  JOIN dnd5e_damage_type damage_type ON damage_type.slug = damage.damage_type
  WHERE damage.action_id = ANY($1::bigint[])
  ORDER BY damage.id ASC;
`;

export const selectActionRequirementsByActionIdsQuery = `
  SELECT
    requirement.id,
    requirement.action_id,
    requirement.requirement_type,
    requirement.value,
    requirement.notes
  FROM dnd5e_action_requirement requirement
  WHERE requirement.action_id = ANY($1::bigint[])
  ORDER BY requirement.id ASC;
`;

export const selectActionEffectsByActionIdsQuery = `
  SELECT
    effect.id,
    effect.action_id,
    effect.effect_type,
    effect.value,
    effect.condition,
    effect.notes
  FROM dnd5e_action_effect effect
  WHERE effect.action_id = ANY($1::bigint[])
  ORDER BY effect.id ASC;
`;

export const selectStatBlockTraitsQuery = `
  SELECT
    stat_block_trait.id AS stat_block_trait_id,
    stat_block_trait.stat_block_id,
    trait.id,
    trait.name,
    trait.description
  FROM dnd5e_stat_block_trait stat_block_trait
  JOIN dnd5e_trait trait ON trait.id = stat_block_trait.trait_id
  WHERE stat_block_trait.stat_block_id = $1
  ORDER BY trait.name ASC, trait.id ASC;
`;

export const selectTraitEffectsByTraitIdsQuery = `
  SELECT
    effect.id,
    effect.trait_id,
    effect.effect_type,
    effect.value,
    effect.condition,
    effect.notes
  FROM dnd5e_trait_effect effect
  WHERE effect.trait_id = ANY($1::bigint[])
  ORDER BY effect.id ASC;
`;
