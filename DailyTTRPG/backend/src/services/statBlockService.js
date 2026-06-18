import { query } from '../config/db.js';
import {
  selectActionByIdQuery,
  selectActionDamagesByActionIdsQuery,
  selectActionEffectsByActionIdsQuery,
  selectActionRequirementsByActionIdsQuery,
  selectStatBlockAbilitiesQuery,
  selectStatBlockActionsQuery,
  selectStatBlockByIdQuery,
  selectStatBlockResistancesQuery,
  selectStatBlockSensesQuery,
  selectStatBlockSkillsQuery,
  selectStatBlocksQuery,
  selectStatBlockTraitsQuery,
  selectTraitEffectsByTraitIdsQuery,
} from '../db/queries/statBlocks.js';

function normalizeNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapOwner(row) {
  if (row.npc_id !== null) {
    return {
      owner_type: 'npc',
      id: Number(row.npc_id),
      key: row.npc_key,
      name: row.npc_name,
      role: row.npc_role,
    };
  }

  if (row.monster_id !== null) {
    return {
      owner_type: 'monster',
      id: Number(row.monster_id),
      key: row.monster_key,
      name: row.monster_name,
      role: null,
    };
  }

  return null;
}

function mapStatBlockSummary(row) {
  return {
    id: Number(row.id),
    name: row.name,
    size: row.size,
    creature_type: row.creature_type,
    alignment: row.alignment,
    armor_class: Number(row.armor_class),
    hit_point_max: Number(row.hit_point_max),
    hit_dice_text: row.hit_dice_text,
    speed: {
      walk: Number(row.speed_walk),
      fly: Number(row.speed_fly),
      swim: Number(row.speed_swim),
      climb: Number(row.speed_climb),
    },
    proficiency_bonus: Number(row.proficiency_bonus),
    challenge_rating: normalizeNumber(row.challenge_rating),
    xp_value: normalizeNumber(row.xp_value),
    passive_perception: normalizeNumber(row.passive_perception),
    source: row.source,
    notes: row.notes,
    owner: mapOwner(row),
    action_count: Number(row.action_count ?? 0),
    trait_count: Number(row.trait_count ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapStatBlockDetail(row) {
  return {
    id: Number(row.id),
    name: row.name,
    size: row.size,
    creature_type: row.creature_type,
    alignment: row.alignment,
    armor_class: Number(row.armor_class),
    hit_point_max: Number(row.hit_point_max),
    hit_dice_text: row.hit_dice_text,
    speed: {
      walk: Number(row.speed_walk),
      fly: Number(row.speed_fly),
      swim: Number(row.speed_swim),
      climb: Number(row.speed_climb),
    },
    proficiency_bonus: Number(row.proficiency_bonus),
    challenge_rating: normalizeNumber(row.challenge_rating),
    xp_value: normalizeNumber(row.xp_value),
    passive_perception: normalizeNumber(row.passive_perception),
    source: row.source,
    notes: row.notes,
    owner: mapOwner(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapAbility(row) {
  return {
    id: Number(row.id),
    ability: row.ability,
    ability_name: row.ability_name,
    score: Number(row.score),
    modifier: Math.floor((Number(row.score) - 10) / 2),
  };
}

function mapSkill(row) {
  return {
    id: Number(row.id),
    skill: row.skill,
    skill_name: row.skill_name,
    ability: {
      code: row.ability_code,
      name: row.ability_name,
    },
    is_proficient: row.is_proficient,
    modifier: Number(row.modifier),
  };
}

function mapSense(row) {
  return {
    id: Number(row.id),
    sense_type: row.sense_type,
    sense_name: row.sense_name,
    range_feet: Number(row.range_feet),
  };
}

function mapResistance(row) {
  return {
    id: Number(row.id),
    resistance_type: row.resistance_type,
    damage_type: row.damage_type,
    damage_type_name: row.damage_type_name,
    notes: row.notes,
  };
}

function mapActionBase(row) {
  return {
    id: Number(row.id),
    name: row.name,
    action_type: row.action_type,
    description: row.description,
    requires_attack_roll: row.requires_attack_roll,
    range: {
      type: row.range_type,
      normal: normalizeNumber(row.range_normal),
      max: normalizeNumber(row.range_max),
    },
    saving_throw:
      row.saving_throw_ability !== null || row.saving_throw_dc !== null
        ? {
            ability: row.saving_throw_ability,
            dc: normalizeNumber(row.saving_throw_dc),
          }
        : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapActionDamage(row) {
  return {
    id: Number(row.id),
    dice_count: Number(row.dice_count),
    dice_size: Number(row.dice_size),
    modifier: Number(row.modifier),
    damage_type: row.damage_type,
    damage_type_name: row.damage_type_name,
    damage_text: row.damage_text,
  };
}

function mapActionRequirement(row) {
  return {
    id: Number(row.id),
    requirement_type: row.requirement_type,
    value: row.value,
    notes: row.notes,
  };
}

function mapActionEffect(row) {
  return {
    id: Number(row.id),
    effect_type: row.effect_type,
    value: row.value ?? {},
    condition: row.condition ?? {},
    notes: row.notes,
  };
}

function mapTrait(row, effects = []) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    effects,
  };
}

async function hydrateActions(baseRows, executor = { query }) {
  if (baseRows.length === 0) {
    return [];
  }

  const actionIds = baseRows.map((row) => Number(row.id));
  const damagesResult = await executor.query(selectActionDamagesByActionIdsQuery, [actionIds]);
  const requirementsResult = await executor.query(selectActionRequirementsByActionIdsQuery, [actionIds]);
  const effectsResult = await executor.query(selectActionEffectsByActionIdsQuery, [actionIds]);

  const damagesByActionId = new Map();
  for (const row of damagesResult.rows) {
    const actionId = Number(row.action_id);
    const items = damagesByActionId.get(actionId) ?? [];
    items.push(mapActionDamage(row));
    damagesByActionId.set(actionId, items);
  }

  const requirementsByActionId = new Map();
  for (const row of requirementsResult.rows) {
    const actionId = Number(row.action_id);
    const items = requirementsByActionId.get(actionId) ?? [];
    items.push(mapActionRequirement(row));
    requirementsByActionId.set(actionId, items);
  }

  const effectsByActionId = new Map();
  for (const row of effectsResult.rows) {
    const actionId = Number(row.action_id);
    const items = effectsByActionId.get(actionId) ?? [];
    items.push(mapActionEffect(row));
    effectsByActionId.set(actionId, items);
  }

  return baseRows.map((row) => ({
    ...mapActionBase(row),
    stat_block_action_id: row.stat_block_action_id ? Number(row.stat_block_action_id) : null,
    display_order: row.display_order !== undefined ? Number(row.display_order) : null,
    damage: damagesByActionId.get(Number(row.id)) ?? [],
    requirements: requirementsByActionId.get(Number(row.id)) ?? [],
    effects: effectsByActionId.get(Number(row.id)) ?? [],
  }));
}

async function hydrateTraits(baseRows, executor = { query }) {
  if (baseRows.length === 0) {
    return [];
  }

  const traitIds = baseRows.map((row) => Number(row.id));
  const effectsResult = await executor.query(selectTraitEffectsByTraitIdsQuery, [traitIds]);
  const effectsByTraitId = new Map();

  for (const row of effectsResult.rows) {
    const traitId = Number(row.trait_id);
    const items = effectsByTraitId.get(traitId) ?? [];
    items.push({
      id: Number(row.id),
      effect_type: row.effect_type,
      value: row.value ?? {},
      condition: row.condition ?? {},
      notes: row.notes,
    });
    effectsByTraitId.set(traitId, items);
  }

  return baseRows.map((row) => mapTrait(row, effectsByTraitId.get(Number(row.id)) ?? []));
}

export async function listStatBlocks(executor = { query }) {
  const result = await executor.query(selectStatBlocksQuery);
  return result.rows.map(mapStatBlockSummary);
}

export async function getStatBlockById(statBlockId, executor = { query }) {
  const baseResult = await executor.query(selectStatBlockByIdQuery, [statBlockId]);
  const row = baseResult.rows[0];

  if (!row) {
    return null;
  }

  const abilitiesResult = await executor.query(selectStatBlockAbilitiesQuery, [statBlockId]);
  const skillsResult = await executor.query(selectStatBlockSkillsQuery, [statBlockId]);
  const sensesResult = await executor.query(selectStatBlockSensesQuery, [statBlockId]);
  const resistancesResult = await executor.query(selectStatBlockResistancesQuery, [statBlockId]);
  const actionsResult = await executor.query(selectStatBlockActionsQuery, [statBlockId]);
  const traitsResult = await executor.query(selectStatBlockTraitsQuery, [statBlockId]);

  const abilities = abilitiesResult.rows.map(mapAbility);
  const skills = skillsResult.rows.map(mapSkill);
  const senses = sensesResult.rows.map(mapSense);
  const resistances = resistancesResult.rows.map(mapResistance);
  const actions = await hydrateActions(actionsResult.rows, executor);
  const traits = await hydrateTraits(traitsResult.rows, executor);

  return {
    ...mapStatBlockDetail(row),
    abilities,
    skills,
    senses,
    resistances,
    actions,
    traits,
  };
}

export async function listStatBlockActions(statBlockId, executor = { query }) {
  const result = await executor.query(selectStatBlockActionsQuery, [statBlockId]);
  return hydrateActions(result.rows, executor);
}

export async function getActionById(actionId, executor = { query }) {
  const result = await executor.query(selectActionByIdQuery, [actionId]);
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const actions = await hydrateActions([row], executor);
  return actions[0] ?? null;
}
