import { getItemBySlug } from '../../services/inventoryService.js';
import { applyAdventureOutcome } from '../../services/adventureProgressionService.js';
import { createHttpError } from '../../utils/httpError.js';

function normalizeNonEmptyString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function readPositiveInteger(value, label, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function readNonNegativeInteger(value, label) {
  const parsed = Number(value ?? 0);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError(`${label} must be a non-negative integer`, 400);
  }

  return parsed;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createHttpError(`${label} must be a JSON object`, 400);
  }
}

function readOptionalNonNegativeInteger(value, label, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError(`${label} must be a non-negative integer`, 400);
  }

  return parsed;
}

function formatCurrencyDelta(delta) {
  const parts = [];

  for (const [key, label] of [
    ['pp', 'pp'],
    ['gp', 'gp'],
    ['ep', 'ep'],
    ['sp', 'sp'],
    ['cp', 'cp'],
  ]) {
    if (delta[key] > 0) {
      parts.push(`${delta[key]} ${label}`);
    }
  }

  return parts.join(', ');
}

function buildEventRewardPayload(option, payload) {
  const rewards = [];
  const amount = readOptionalNonNegativeInteger(payload.xp, 'resolution_payload_json.xp', 0);

  if (amount > 0) {
    rewards.push({
      reward_type: 'xp',
      value: {
        amount,
      },
      metadata_json: {
        reason: `Event option ${option.option_key}`,
      },
    });
  }

  return {
    rewards,
  };
}

function buildSelectedOptionPayload(option) {
  return {
    id: option.id,
    option_key: option.option_key,
    label: option.label,
  };
}

async function resolveGrantCurrency(eventInstance, option, executor) {
  const payload = option.resolution_payload_json ?? {};
  assertObject(payload, 'resolution_payload_json');

  const delta = {
    cp: readNonNegativeInteger(payload.cp, 'resolution_payload_json.cp'),
    sp: readNonNegativeInteger(payload.sp, 'resolution_payload_json.sp'),
    ep: readNonNegativeInteger(payload.ep, 'resolution_payload_json.ep'),
    gp: readNonNegativeInteger(payload.gp, 'resolution_payload_json.gp'),
    pp: readNonNegativeInteger(payload.pp, 'resolution_payload_json.pp'),
  };

  const totalGranted = Object.values(delta).reduce((sum, value) => sum + value, 0);

  if (totalGranted === 0) {
    throw createHttpError('grant_currency options must grant at least one currency denomination', 400);
  }

  const adventureOutcome = buildEventRewardPayload(option, payload);
  adventureOutcome.rewards.push({
    reward_type: 'currency',
    value: delta,
    metadata_json: {
      option_key: option.option_key,
    },
  });
  const applied = await applyAdventureOutcome(
    {
      campaignId: eventInstance.campaign_id,
      characterId: eventInstance.character_id,
      effectPayload: adventureOutcome,
      actorAccountId: null,
      sourceType: 'event',
      sourceEntityId: eventInstance.id,
      sourceKey: `event:${option.option_key}`,
    },
    executor
  );
  const currencyText = formatCurrencyDelta(delta);
  const xpText = applied.progression ? ` and gains ${applied.progression.amount_granted} XP` : '';

  return {
    outcome_summary: `${eventInstance.character_name} pockets ${currencyText}${xpText}.`,
    result_json: {
      resolution_kind: option.resolution_kind,
      selected_option: buildSelectedOptionPayload(option),
      granted_currency: delta,
      reward_applications: applied.rewards,
      progression: applied.progression,
    },
  };
}

async function resolveGrantItem(eventInstance, option, executor) {
  const payload = option.resolution_payload_json ?? {};
  assertObject(payload, 'resolution_payload_json');

  const itemSlug = normalizeNonEmptyString(payload.item_slug);

  if (!itemSlug) {
    throw createHttpError('grant_item options require resolution_payload_json.item_slug', 400);
  }

  const quantity = readPositiveInteger(
    payload.quantity,
    'resolution_payload_json.quantity',
    1
  );
  const notes = normalizeNonEmptyString(payload.notes);
  const itemTemplate = await getItemBySlug(itemSlug, executor);

  if (!itemTemplate) {
    throw createHttpError('grant_item option references an unknown item slug', 400);
  }

  const adventureOutcome = buildEventRewardPayload(option, payload);
  adventureOutcome.rewards.push({
    reward_type: 'item',
    value: {
      item_id: itemTemplate.id,
      item_slug: itemTemplate.slug,
      quantity,
    },
    metadata_json: {
      notes,
      option_key: option.option_key,
    },
  });
  const applied = await applyAdventureOutcome(
    {
      campaignId: eventInstance.campaign_id,
      characterId: eventInstance.character_id,
      effectPayload: adventureOutcome,
      actorAccountId: null,
      sourceType: 'event',
      sourceEntityId: eventInstance.id,
      sourceKey: `event:${option.option_key}`,
    },
    executor
  );
  const itemReward = applied.rewards.find((entry) => entry.reward.reward_type === 'item') ?? null;
  const xpText = applied.progression ? ` and gains ${applied.progression.amount_granted} XP` : '';

  return {
    outcome_summary: `${eventInstance.character_name} takes ${quantity} ${itemTemplate.name}${quantity === 1 ? '' : 's'}${xpText}.`,
    result_json: {
      resolution_kind: option.resolution_kind,
      selected_option: buildSelectedOptionPayload(option),
      granted_item: {
        item_id: itemTemplate.id,
        item_slug: itemTemplate.slug,
        item_name: itemTemplate.name,
        quantity,
        character_item_id: itemReward?.applied_value?.character_item_id ?? null,
      },
      reward_applications: applied.rewards,
      progression: applied.progression,
    },
  };
}

async function resolveNoEffect(eventInstance, option, executor) {
  const payload = option.resolution_payload_json ?? {};
  assertObject(payload, 'resolution_payload_json');
  const adventureOutcome = buildEventRewardPayload(option, payload);
  const applied =
    adventureOutcome.rewards.length > 0
      ? await applyAdventureOutcome(
          {
            campaignId: eventInstance.campaign_id,
            characterId: eventInstance.character_id,
            effectPayload: adventureOutcome,
            actorAccountId: null,
            sourceType: 'event',
            sourceEntityId: eventInstance.id,
            sourceKey: `event:${option.option_key}`,
          },
          executor
        )
      : { rewards: [], progression: null };

  return {
    outcome_summary: applied.progression
      ? `${eventInstance.character_name} gains ${applied.progression.amount_granted} XP from ${option.label}.`
      : `${eventInstance.character_name} leaves the cache untouched.`,
    result_json: {
      resolution_kind: option.resolution_kind,
      selected_option: buildSelectedOptionPayload(option),
      state_change: applied.progression ? 'xp_only' : 'none',
      reward_applications: applied.rewards,
      progression: applied.progression,
    },
  };
}

async function resolveApplyEffects(eventInstance, option, executor) {
  const payload = option.resolution_payload_json ?? {};
  assertObject(payload, 'resolution_payload_json');

  const applied = await applyAdventureOutcome(
    {
      campaignId: eventInstance.campaign_id,
      characterId: eventInstance.character_id,
      effectPayload: payload,
      actorAccountId: null,
      sourceType: 'event',
      sourceEntityId: eventInstance.id,
      sourceKey: `event:${option.option_key}`,
    },
    executor
  );

  const rewardCount = Array.isArray(applied.rewards) ? applied.rewards.length : 0;
  const worldChangeCount = Array.isArray(applied.world_changes) ? applied.world_changes.length : 0;
  const objectiveCount = Array.isArray(applied.objectives) ? applied.objectives.length : 0;
  const questCount = Array.isArray(applied.quests) ? applied.quests.length : 0;

  let outcomeSummary = `${eventInstance.character_name} chooses ${option.label}.`;

  if (worldChangeCount > 0) {
    outcomeSummary = `${eventInstance.character_name} chooses ${option.label}, and the world shifts around that choice.`;
  } else if (objectiveCount > 0 || questCount > 0) {
    outcomeSummary = `${eventInstance.character_name} chooses ${option.label}, changing the course of the investigation.`;
  } else if (rewardCount > 0 || applied.progression) {
    outcomeSummary = `${eventInstance.character_name} chooses ${option.label} and receives the consequences immediately.`;
  }

  return {
    outcome_summary: outcomeSummary,
    result_json: {
      resolution_kind: option.resolution_kind,
      selected_option: buildSelectedOptionPayload(option),
      state_change: 'applied_effects',
      rewards: applied.rewards,
      quests: applied.quests,
      objectives: applied.objectives,
      flags: applied.flags,
      knowledge: applied.knowledge,
      rewards_applied: rewardCount,
      world_changes: applied.world_changes,
      progression: applied.progression,
      scene_unlocks: applied.scene_unlocks,
      sync: applied.sync,
    },
  };
}

export async function resolveEventOption({ eventInstance, option, executor }) {
  switch (option.resolution_kind) {
    case 'grant_currency':
      return resolveGrantCurrency(eventInstance, option, executor);
    case 'grant_item':
      return resolveGrantItem(eventInstance, option, executor);
    case 'no_effect':
      return resolveNoEffect(eventInstance, option, executor);
    case 'apply_effects':
      return resolveApplyEffects(eventInstance, option, executor);
    default:
      throw createHttpError('This event option cannot be resolved yet', 409);
  }
}
