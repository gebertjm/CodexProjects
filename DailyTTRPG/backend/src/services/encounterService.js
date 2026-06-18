import { query, withTransaction } from '../config/db.js';
import {
  selectCampaignCharactersForEncounterStrengthQuery,
  selectCampaignWorldForEncounterQuery,
  selectCharacterForEncounterStrengthQuery,
  selectEncounterTemplateBySlugAndCampaignQuery,
  selectEncounterTemplateBySlugAndWorldQuery,
  selectMonsterPowerByKeyQuery,
  selectNpcPowerByKeyQuery,
  selectWorldEntityPowerByKeyQuery,
} from '../db/queries/encounters.js';
import { createHttpError } from '../utils/httpError.js';
import { grantCharacterExperience } from './advancementService.js';

const difficultyIntentModifiers = {
  trivial: 0.5,
  easy: 0.75,
  medium: 1,
  hard: 1.25,
  deadly: 1.5,
  tutorial: 0.6,
  avoidable: 1.25,
  story: 1,
};

const difficultyBands = [
  { label: 'trivial', max: 0.35 },
  { label: 'easy', max: 0.7 },
  { label: 'medium', max: 1.1 },
  { label: 'hard', max: 1.55 },
  { label: 'deadly', max: Infinity },
];

function normalizePositiveInteger(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function mapEncounterRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    world_slug: row.world_slug,
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    campaign_slug: row.campaign_slug,
    scene_id: row.scene_id !== null ? Number(row.scene_id) : null,
    scene_slug: row.scene_slug,
    slug: row.slug,
    name: row.name,
    encounter_type: row.encounter_type,
    difficulty_intent: row.difficulty_intent,
    scaling_enabled: row.scaling_enabled,
    story_fixed_by_default: row.story_fixed_by_default,
    explicit_story_scaling: row.explicit_story_scaling,
    allowed_scaling_methods: row.allowed_scaling_methods_json ?? [],
    disallowed_scaling_methods: row.disallowed_scaling_methods_json ?? [],
    party_size_range: {
      min: Number(row.party_size_min),
      max: Number(row.party_size_max),
    },
    level_range: {
      min: Number(row.level_min),
      max: Number(row.level_max),
    },
    async_beat_target: {
      min: Number(row.async_beat_min),
      max: Number(row.async_beat_max),
    },
    base_variant: row.base_variant,
    variants: row.variants_json ?? [],
    resolution_paths: row.resolution_paths_json ?? [],
    reward_value: row.reward_value_json ?? {},
    fail_forward: row.fail_forward,
    metadata: row.metadata_json ?? {},
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCharacterStrengthRow(row) {
  return {
    character_id: Number(row.id),
    name: row.name,
    level: Number(row.level ?? 1),
    pending_level_count: Number(row.pending_level_count ?? 0),
    level_up_available: Boolean(row.level_up_available),
  };
}

function mapEnemyPowerRow(row) {
  if (!row) {
    return null;
  }

  return {
    entity_type: row.entity_type,
    entity_id: row.entity_id !== null ? Number(row.entity_id) : null,
    entity_slug: row.entity_slug,
    name: row.name,
    stat_block_id: row.stat_block_id !== null ? Number(row.stat_block_id) : null,
    stat_block_name: row.stat_block_name,
    challenge_rating: row.challenge_rating !== null ? Number(row.challenge_rating) : null,
    xp_value: row.xp_value !== null ? Number(row.xp_value) : null,
    hit_point_max: row.hit_point_max !== null ? Number(row.hit_point_max) : null,
    armor_class: row.armor_class !== null ? Number(row.armor_class) : null,
  };
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function rangeContains(range, value) {
  if (!range) {
    return true;
  }

  return value >= Number(range.min) && value <= Number(range.max);
}

function derivePowerFromStatBlock(row) {
  if (!row) {
    return 1;
  }

  if (row.xp_value !== null && row.xp_value !== undefined) {
    return Math.max(0.5, roundOne(Number(row.xp_value) / 25));
  }

  if (row.challenge_rating !== null && row.challenge_rating !== undefined) {
    return Math.max(0.5, roundOne(Number(row.challenge_rating) * 4));
  }

  const hpComponent = row.hit_point_max ? Number(row.hit_point_max) / 12 : 1;
  const acComponent = row.armor_class ? Math.max(0, Number(row.armor_class) - 10) / 4 : 0;
  return Math.max(0.5, roundOne(hpComponent + acComponent));
}

export async function getEncounterTemplateBySlug(slug, options = {}, executor = { query }) {
  const encounterSlug = normalizeOptionalText(slug);

  if (!encounterSlug) {
    throw createHttpError('encounter slug is required', 400);
  }

  const campaignId = normalizePositiveInteger(options.campaign_id, 'campaign_id', {
    optional: true,
  });
  const worldId = normalizePositiveInteger(options.world_id, 'world_id', { optional: true });

  let result;

  if (campaignId !== null) {
    result = await executor.query(selectEncounterTemplateBySlugAndCampaignQuery, [
      campaignId,
      encounterSlug,
    ]);
  } else if (worldId !== null) {
    result = await executor.query(selectEncounterTemplateBySlugAndWorldQuery, [
      worldId,
      encounterSlug,
    ]);
  } else {
    throw createHttpError('campaign_id or world_id is required to find an encounter', 400);
  }

  const encounter = result.rows[0] ? mapEncounterRow(result.rows[0]) : null;

  if (!encounter) {
    throw createHttpError(`Encounter "${encounterSlug}" was not found`, 404);
  }

  return encounter;
}

export async function evaluatePartyStrength(input, executor = { query }) {
  const characterId = normalizePositiveInteger(input.character_id, 'character_id', {
    optional: true,
  });
  const campaignId = normalizePositiveInteger(input.campaign_id ?? input.party_id, 'campaign_id', {
    optional: true,
  });
  const useParty = input.use_party === true || input.party === true || input.party_id !== undefined;

  let rows = [];
  let context = 'solo';

  if (useParty || (!characterId && campaignId)) {
    if (!campaignId) {
      throw createHttpError('campaign_id is required for party strength', 400);
    }

    const result = await executor.query(selectCampaignCharactersForEncounterStrengthQuery, [
      campaignId,
    ]);
    rows = result.rows;
    context = 'party';
  } else {
    if (!characterId) {
      throw createHttpError('character_id or campaign_id is required for party strength', 400);
    }

    const result = await executor.query(selectCharacterForEncounterStrengthQuery, [characterId]);
    rows = result.rows;
    context = 'solo';
  }

  if (rows.length === 0) {
    throw createHttpError('No active characters were found for party strength evaluation', 404);
  }

  const characters = rows.map(mapCharacterStrengthRow);
  const levels = characters.map((character) => character.level);
  const partySize = characters.length;
  const highestLevel = Math.max(...levels);
  const lowestLevel = Math.min(...levels);
  const averageLevel = roundOne(levels.reduce((sum, level) => sum + level, 0) / partySize);
  const levelSpread = highestLevel - lowestLevel;
  const spreadPenalty = levelSpread > 1 ? (levelSpread - 1) * 0.15 : 0;
  const effectivePartyLevel = Math.max(1, roundOne(averageLevel - spreadPenalty));
  const partyPower = roundOne(partySize * effectivePartyLevel);
  const warnings = [];

  if (levelSpread > 1) {
    warnings.push(
      `Party level spread is ${levelSpread}; v1 scaling applies a small effective-level penalty and recommends soft sync.`
    );
  }

  if (partySize === 1) {
    warnings.push('Solo context detected; encounter preview will apply solo-safety checks.');
  }

  return {
    context,
    campaign_id: campaignId,
    character_id: characterId,
    solo_context: partySize === 1,
    party_size: partySize,
    average_level: averageLevel,
    highest_level: highestLevel,
    lowest_level: lowestLevel,
    level_spread: levelSpread,
    effective_party_level: effectivePartyLevel,
    party_power: partyPower,
    characters,
    warnings,
  };
}

async function lookupEnemyReference(worldId, enemy, executor) {
  const slug = enemy.entity_slug ?? enemy.entity_or_template_id ?? enemy.template_slug;
  const type = enemy.entity_type ?? null;

  if (type === 'world_entity') {
    const result = await executor.query(selectWorldEntityPowerByKeyQuery, [worldId, slug]);
    return mapEnemyPowerRow(result.rows[0]);
  }

  if (type === 'monster' || type === 'monster_template') {
    const result = await executor.query(selectMonsterPowerByKeyQuery, [slug]);
    return mapEnemyPowerRow(result.rows[0]);
  }

  if (type === 'npc' || type === 'npc_template') {
    const result = await executor.query(selectNpcPowerByKeyQuery, [slug]);
    return mapEnemyPowerRow(result.rows[0]);
  }

  const worldEntityResult = await executor.query(selectWorldEntityPowerByKeyQuery, [worldId, slug]);
  const worldEntity = mapEnemyPowerRow(worldEntityResult.rows[0]);
  if (worldEntity) {
    return worldEntity;
  }

  const npcResult = await executor.query(selectNpcPowerByKeyQuery, [slug]);
  const npc = mapEnemyPowerRow(npcResult.rows[0]);
  if (npc) {
    return npc;
  }

  const monsterResult = await executor.query(selectMonsterPowerByKeyQuery, [slug]);
  return mapEnemyPowerRow(monsterResult.rows[0]);
}

async function enrichEnemies(worldId, enemies, executor) {
  const enriched = [];

  for (const enemy of enemies) {
    const reference = await lookupEnemyReference(worldId, enemy, executor);
    const basePower = enemy.base_power ?? derivePowerFromStatBlock(reference);
    const count = Number(enemy.count ?? 1);

    enriched.push({
      ...enemy,
      reference,
      entity_slug: enemy.entity_slug ?? enemy.entity_or_template_id ?? enemy.template_slug,
      count,
      base_power: roundOne(basePower),
      total_power: roundOne(basePower * count),
      action_economy_weight: numberOr(enemy.action_economy_weight, 1),
      scalable: enemy.scalable !== false,
    });
  }

  return enriched;
}

function selectEncounterVariant(encounter, partyStrength) {
  const variants = encounter.variants ?? [];
  const partySize = partyStrength.party_size;
  const effectiveLevel = partyStrength.effective_party_level;
  const baseVariant =
    variants.find((variant) => variant.variant_id === encounter.base_variant) ?? variants[0] ?? null;
  const suitable = variants.filter(
    (variant) =>
      rangeContains(variant.party_size_range, partySize) &&
      rangeContains(variant.level_range, effectiveLevel)
  );

  if (partyStrength.solo_context) {
    const soloVariant = suitable.find(
      (variant) =>
        !variant.party_size_range ||
        (Number(variant.party_size_range.min) <= 1 && Number(variant.party_size_range.max) >= 1)
    );

    if (soloVariant) {
      return {
        variant: soloVariant,
        method: 'variant_selection',
        reason: 'Selected authored solo-safe variant.',
      };
    }
  }

  if (suitable.length > 0) {
    return {
      variant: suitable[0],
      method: 'variant_selection',
      reason: 'Selected authored variant matching party size and effective level.',
    };
  }

  return {
    variant: baseVariant,
    method: baseVariant ? 'base_variant' : 'none',
    reason: baseVariant
      ? 'No exact authored variant matched; using base variant before bounded adjustments.'
      : 'Encounter has no authored variant.',
  };
}

function calculateEncounterPower(enemies) {
  const encounterPower = roundOne(enemies.reduce((sum, enemy) => sum + enemy.total_power, 0));
  const enemyCount = enemies.reduce((sum, enemy) => sum + Number(enemy.count ?? 0), 0);
  const actionEconomy = roundOne(
    enemies.reduce(
      (sum, enemy) => sum + Number(enemy.count ?? 0) * numberOr(enemy.action_economy_weight, 1),
      0
    )
  );

  return {
    encounter_power: encounterPower,
    enemy_count: enemyCount,
    action_economy: actionEconomy,
  };
}

function assessDifficulty(encounter, partyStrength, power) {
  const intentModifier = difficultyIntentModifiers[encounter.difficulty_intent] ?? 1;
  const targetPower = Math.max(0.5, roundOne(partyStrength.party_power * intentModifier));
  const ratio = roundOne(power.encounter_power / Math.max(targetPower, 0.5));
  const rawLabel = difficultyBands.find((band) => ratio <= band.max)?.label ?? 'deadly';
  const label =
    encounter.difficulty_intent === 'story' || encounter.encounter_type === 'final'
      ? 'story'
      : rawLabel;

  return {
    party_power: partyStrength.party_power,
    encounter_power: power.encounter_power,
    target_difficulty: encounter.difficulty_intent,
    target_power: targetPower,
    difficulty_modifier: intentModifier,
    ratio,
    final_assessment: label,
  };
}

function cloneEnemy(enemy) {
  return {
    ...enemy,
    reference: enemy.reference ? { ...enemy.reference } : null,
  };
}

function adjustEnemyCounts(encounter, enemies, partyStrength, difficulty) {
  if (!encounter.allowed_scaling_methods.includes('enemy_count')) {
    return {
      enemies,
      adjustments: [],
      difficulty,
    };
  }

  const adjusted = enemies.map(cloneEnemy);
  const adjustments = [];
  let currentPower = calculateEncounterPower(adjusted);
  let currentDifficulty = assessDifficulty(encounter, partyStrength, currentPower);

  if (partyStrength.solo_context) {
    for (const enemy of adjusted) {
      const minCount = Number(enemy.min_count ?? 0);
      if (enemy.count > 1 && minCount <= 1) {
        const before = enemy.count;
        enemy.count = 1;
        enemy.total_power = roundOne(enemy.base_power * enemy.count);
        adjustments.push({
          method: 'enemy_count',
          enemy_slug: enemy.entity_slug,
          from: before,
          to: enemy.count,
          reason: 'Solo safety reduces many-vs-one pressure.',
        });
      }
    }
  }

  currentPower = calculateEncounterPower(adjusted);
  currentDifficulty = assessDifficulty(encounter, partyStrength, currentPower);

  if (currentDifficulty.ratio < 0.7 && !partyStrength.solo_context) {
    const candidate = adjusted.find(
      (enemy) => enemy.scalable && Number(enemy.count) < Number(enemy.max_count ?? enemy.count)
    );

    if (candidate) {
      const before = candidate.count;
      candidate.count += 1;
      candidate.total_power = roundOne(candidate.base_power * candidate.count);
      adjustments.push({
        method: 'enemy_count',
        enemy_slug: candidate.entity_slug,
        from: before,
        to: candidate.count,
        reason: 'Bounded count increase keeps the encounter near intended pressure.',
      });
    }
  }

  currentPower = calculateEncounterPower(adjusted);
  currentDifficulty = assessDifficulty(encounter, partyStrength, currentPower);

  if (currentDifficulty.ratio > 1.55) {
    const candidate = [...adjusted]
      .reverse()
      .find((enemy) => enemy.scalable && Number(enemy.count) > Number(enemy.min_count ?? 0));

    if (candidate) {
      const before = candidate.count;
      candidate.count -= 1;
      candidate.total_power = roundOne(candidate.base_power * candidate.count);
      adjustments.push({
        method: 'enemy_count',
        enemy_slug: candidate.entity_slug,
        from: before,
        to: candidate.count,
        reason: 'Bounded count reduction keeps the encounter from exceeding authored pressure.',
      });
    }
  }

  return {
    enemies: adjusted.filter((enemy) => enemy.count > 0),
    adjustments,
    difficulty: assessDifficulty(encounter, partyStrength, calculateEncounterPower(adjusted)),
  };
}

function applyBoundedStatTweak(encounter, enemies, partyStrength, difficulty) {
  if (
    !encounter.allowed_scaling_methods.includes('stat_tweak') ||
    encounter.disallowed_scaling_methods.includes('large_stat_scaling')
  ) {
    return {
      enemies,
      stat_tweaks: [],
      difficulty,
    };
  }

  const ratio = difficulty.ratio;
  if (ratio >= 0.75 && ratio <= 1.45) {
    return {
      enemies,
      stat_tweaks: [],
      difficulty,
    };
  }

  const maxPercent = Math.min(0.2, numberOr(encounter.metadata?.stat_tweak_bounds?.max_percent, 0.1));
  const tweakPercent = ratio < 0.75 ? maxPercent : -maxPercent;
  const tweakedEnemies = enemies.map((enemy) => ({
    ...enemy,
    stat_tweak: {
      hp_percent: tweakPercent,
      bounded: true,
      reason: 'Last-resort bounded stat tweak after variant/count scaling.',
    },
    total_power: roundOne(enemy.total_power * (1 + tweakPercent)),
  }));

  const power = calculateEncounterPower(tweakedEnemies);

  return {
    enemies: tweakedEnemies,
    stat_tweaks: [
      {
        method: 'stat_tweak',
        percent: tweakPercent,
        reason: 'Applied only because authored methods still missed target range.',
      },
    ],
    difficulty: assessDifficulty(encounter, partyStrength, power),
  };
}

function evaluateSoloSafety(encounter, enemies, partyStrength) {
  const warnings = [];
  const resolutionPaths = encounter.resolution_paths ?? [];
  const enemyCount = enemies.reduce((sum, enemy) => sum + Number(enemy.count ?? 0), 0);
  const hasSafePath =
    encounter.fail_forward ||
    resolutionPaths.some((path) =>
      ['escape', 'negotiation', 'stealth', 'avoidance', 'fail_forward'].includes(path)
    );

  if (!partyStrength.solo_context) {
    return warnings;
  }

  if (enemyCount > 1 && encounter.metadata?.allow_many_vs_one !== true) {
    warnings.push('Solo context has multiple enemies; prefer a solo variant or explicit safe path.');
  }

  if (!hasSafePath) {
    warnings.push('Solo context has no authored escape, negotiation, stealth, avoidance, or fail-forward path.');
  }

  if (encounter.difficulty_intent === 'hard' || encounter.difficulty_intent === 'deadly') {
    warnings.push('Solo hard/deadly encounter should be treated as high risk and surfaced with fallback options.');
  }

  return warnings;
}

function estimateAsyncBeats(encounter, partyStrength, power) {
  if (encounter.difficulty_intent === 'story' || encounter.encounter_type === 'final') {
    return {
      expected_beat_range: encounter.async_beat_target,
      estimated_beats: encounter.async_beat_target.max,
      notes: ['Story/final encounter uses authored beat target rather than pure power pacing.'],
      warnings: [],
    };
  }

  const powerRatio = power.encounter_power / Math.max(partyStrength.party_power, 0.5);
  const actionEconomyPenalty = Math.max(0, power.action_economy - partyStrength.party_size) * 0.5;
  const estimatedBeats = Math.max(1, Math.ceil(powerRatio * 2 + actionEconomyPenalty));
  const warnings = [];

  if (estimatedBeats > encounter.async_beat_target.max) {
    warnings.push(
      `Estimated ${estimatedBeats} beats exceeds authored target max ${encounter.async_beat_target.max}.`
    );
  }

  if (power.enemy_count > partyStrength.party_size + 1) {
    warnings.push('Enemy count may create slow async action economy.');
  }

  return {
    expected_beat_range: encounter.async_beat_target,
    estimated_beats: estimatedBeats,
    notes: [],
    warnings,
  };
}

export async function previewEncounter(encounterSlug, input = {}, executor = { query }) {
  const encounter = await getEncounterTemplateBySlug(encounterSlug, input, executor);
  const partyStrength = await evaluatePartyStrength(input, executor);
  const warnings = [...partyStrength.warnings];

  if (!rangeContains(encounter.party_size_range, partyStrength.party_size)) {
    warnings.push(
      `Party size ${partyStrength.party_size} is outside authored range ${encounter.party_size_range.min}-${encounter.party_size_range.max}.`
    );
  }

  if (!rangeContains(encounter.level_range, partyStrength.effective_party_level)) {
    warnings.push(
      `Effective level ${partyStrength.effective_party_level} is outside authored range ${encounter.level_range.min}-${encounter.level_range.max}.`
    );
  }

  const variantSelection = selectEncounterVariant(encounter, partyStrength);
  const selectedVariant = variantSelection.variant;

  if (!selectedVariant) {
    throw createHttpError(`Encounter "${encounter.slug}" has no usable variant`, 400);
  }

  const baseEnemies = await enrichEnemies(encounter.world_id, selectedVariant.enemies ?? [], executor);
  let power = calculateEncounterPower(baseEnemies);
  let difficulty = assessDifficulty(encounter, partyStrength, power);
  const scalingActions = [];

  if (variantSelection.method === 'variant_selection') {
    scalingActions.push({
      method: 'variant_selection',
      variant_id: selectedVariant.variant_id,
      reason: variantSelection.reason,
    });
  }

  let finalEnemies = baseEnemies;

  const canScale =
    encounter.scaling_enabled &&
    (!encounter.story_fixed_by_default || encounter.explicit_story_scaling);

  if (!canScale) {
    if (encounter.story_fixed_by_default) {
      warnings.push('Story-fixed encounter did not apply runtime scaling.');
    }
  } else {
    const countResult = adjustEnemyCounts(encounter, finalEnemies, partyStrength, difficulty);
    finalEnemies = countResult.enemies;
    difficulty = countResult.difficulty;
    scalingActions.push(...countResult.adjustments);

    const statResult = applyBoundedStatTweak(encounter, finalEnemies, partyStrength, difficulty);
    finalEnemies = statResult.enemies;
    difficulty = statResult.difficulty;
    scalingActions.push(...statResult.stat_tweaks);
  }

  power = calculateEncounterPower(finalEnemies);
  difficulty = assessDifficulty(encounter, partyStrength, power);
  const beatEstimate = estimateAsyncBeats(encounter, partyStrength, power);
  const soloWarnings = evaluateSoloSafety(encounter, finalEnemies, partyStrength);
  warnings.push(...soloWarnings, ...beatEstimate.warnings);

  if (difficulty.ratio > 1.55 && encounter.difficulty_intent !== 'story') {
    warnings.push('Final encounter pressure remains above intended v1 band.');
  }

  if (
    difficulty.ratio < 0.35 &&
    !['tutorial', 'story'].includes(encounter.difficulty_intent) &&
    encounter.encounter_type !== 'final'
  ) {
    warnings.push('Final encounter pressure remains below intended v1 band; authored variants may need tuning.');
  }

  return {
    encounter,
    party_strength: partyStrength,
    selected_variant: {
      variant_id: selectedVariant.variant_id,
      reason: variantSelection.reason,
    },
    final_enemies: finalEnemies,
    power,
    difficulty,
    scaling_actions: scalingActions,
    solo_safety: {
      solo_context: partyStrength.solo_context,
      warnings: soloWarnings,
    },
    async_beat_validation: beatEstimate,
    reward_plan: {
      reward_value: encounter.reward_value,
      resolution_paths: encounter.resolution_paths,
      equivalent_across_paths: encounter.reward_value?.equivalent_across_paths === true,
    },
    warnings,
  };
}

export async function resolveEncounter(encounterSlug, input = {}) {
  return withTransaction(async (client) => {
    const campaignId = normalizePositiveInteger(input.campaign_id, 'campaign_id');
    const characterId = normalizePositiveInteger(input.character_id, 'character_id');
    const resolutionPath = normalizeOptionalText(input.resolution_path ?? input.path);
    const encounter = await getEncounterTemplateBySlug(
      encounterSlug,
      { campaign_id: campaignId },
      client
    );

    if (!resolutionPath) {
      throw createHttpError('resolution_path is required', 400);
    }

    if (!encounter.resolution_paths.includes(resolutionPath)) {
      throw createHttpError(
        `resolution_path must be one of: ${encounter.resolution_paths.join(', ')}`,
        400
      );
    }

    const rewardValue = encounter.reward_value ?? {};
    const grantOnResolution = rewardValue.grant_on_resolution !== false;
    const xp = Number(rewardValue.xp ?? 0);
    let rewardResult = null;

    if (grantOnResolution && xp > 0) {
      rewardResult = await grantCharacterExperience(
        characterId,
        {
          campaign_id: campaignId,
          amount: xp,
          source_type: 'encounter',
          source_entity_id: encounter.id,
          actor_account_id: input.actor_account_id ?? null,
          dedupe_key: `encounter:${encounter.id}:campaign:${campaignId}:character:${characterId}:reward`,
          action_key: 'resolve_encounter',
          reason:
            normalizeOptionalText(input.reason) ??
            `${encounter.name} resolved via ${resolutionPath}`,
          summary:
            normalizeOptionalText(input.summary) ??
            `${encounter.name} resolved via ${resolutionPath}; equivalent encounter reward applied.`,
          metadata_json: {
            encounter_id: encounter.slug,
            encounter_template_id: encounter.id,
            resolution_path: resolutionPath,
            equivalent_across_paths: rewardValue.equivalent_across_paths === true,
          },
        },
        client
      );
    }

    return {
      encounter: {
        id: encounter.id,
        slug: encounter.slug,
        name: encounter.name,
      },
      campaign_id: campaignId,
      character_id: characterId,
      resolution_path: resolutionPath,
      reward_applied: rewardResult !== null && rewardResult.was_duplicate !== true,
      duplicate_reward: rewardResult?.was_duplicate === true,
      reward: rewardResult,
    };
  });
}

export async function getCampaignPartyStrength(campaignId) {
  return evaluatePartyStrength({
    campaign_id: campaignId,
    use_party: true,
  });
}

export async function getCharacterEncounterStrength(characterId, campaignId = null) {
  return evaluatePartyStrength({
    character_id: characterId,
    campaign_id: campaignId,
    use_party: false,
  });
}
