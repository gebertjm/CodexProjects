import {
  CAMPAIGN_TYPES,
  CHECK_VISIBILITIES,
  DIALOGUE_CHECK_MODES,
  DISPOSITIONS,
  EVENT_RESOLUTION_KINDS,
  KNOWLEDGE_TYPES,
  OBJECTIVE_STATUSES,
  QUEST_STATUSES,
  REWARD_TYPES,
} from './contentTypes.js';

const slugPattern = /^[a-z0-9][a-z0-9_-]{1,119}$/;
const conditionKeys = new Set([
  'required_alignment_abbreviations',
  'required_campaign_types',
  'required_campaign_flags',
  'forbidden_campaign_flags',
  'required_character_flags',
  'forbidden_character_flags',
  'required_session_flags',
  'forbidden_session_flags',
  'required_quest_states',
  'required_objective_states',
  'required_scene_states',
  'required_location_states',
  'required_entity_states',
  'required_knowledge',
  'forbidden_knowledge',
  'required_visited_node_keys',
  'forbidden_visited_node_keys',
  'required_choice_keys',
  'forbidden_choice_keys',
  'requires_success',
  'requires_failure',
  'minimum_margin',
  'maximum_margin',
  'minimum_total',
  'maximum_total',
  'minimum_roll',
  'maximum_roll',
]);
const effectKeys = new Set([
  'campaign_flags',
  'campaign_flag_categories',
  'campaign_flag_metadata',
  'campaign_flag_titles',
  'campaign_flag_summaries',
  'character_flags',
  'character_flag_categories',
  'character_flag_metadata',
  'npc_states',
  'quests',
  'objectives',
  'rewards',
  'xp',
  'reward_reason',
  'knowledge_entries',
  'world_changes',
  'source_knowledge_title',
  'source_knowledge_summary',
  'session_flags',
]);
const textLayerKeys = new Set([
  'title',
  'short',
  'summary',
  'full',
  'entry',
  'sms',
  'recap',
  'success',
  'failure',
  'gm_notes',
  'variants',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(ctx, path, message) {
  ctx.errors.push(`${path} ${message}`);
}

function isSlug(value) {
  return typeof value === 'string' && slugPattern.test(value);
}

function requireSlug(ctx, value, path) {
  if (!isSlug(value)) {
    addError(ctx, path, 'must be a slug using lowercase letters, numbers, hyphens, or underscores');
  }
}

function requireString(ctx, value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    addError(ctx, path, 'must be a non-empty string');
  }
}

function requireObject(ctx, value, path) {
  if (!isPlainObject(value)) {
    addError(ctx, path, 'must be a JSON object');
    return false;
  }

  return true;
}

function requireArray(ctx, value, path) {
  if (!Array.isArray(value)) {
    addError(ctx, path, 'must be an array');
    return false;
  }

  return true;
}

function validateStringArray(ctx, value, path) {
  if (!requireArray(ctx, value, path)) {
    return;
  }

  value.forEach((entry, index) => requireString(ctx, entry, `${path}[${index}]`));
}

function validateInteger(ctx, value, path) {
  if (!Number.isInteger(value)) {
    addError(ctx, path, 'must be an integer');
  }
}

function validateFlagMap(ctx, value, path) {
  if (!requireObject(ctx, value, path)) {
    return;
  }

  for (const flagKey of Object.keys(value)) {
    requireSlug(ctx, flagKey, `${path}.${flagKey}`);
  }
}

function validateQuestStateConditions(ctx, value, path) {
  if (!requireArray(ctx, value, path)) {
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (!requireObject(ctx, entry, entryPath)) {
      return;
    }

    requireSlug(ctx, entry.quest_key, `${entryPath}.quest_key`);
    const statuses = entry.statuses ?? (entry.status ? [entry.status] : null);

    if (!statuses) {
      addError(ctx, `${entryPath}.statuses`, 'is required');
      return;
    }

    validateStringArray(ctx, statuses, `${entryPath}.statuses`);
    statuses.forEach((status, statusIndex) => {
      if (!QUEST_STATUSES.includes(status)) {
        addError(
          ctx,
          `${entryPath}.statuses[${statusIndex}]`,
          `must be one of: ${QUEST_STATUSES.join(', ')}`
        );
      }
    });
  });
}

function validateObjectiveStateConditions(ctx, value, path) {
  if (!requireArray(ctx, value, path)) {
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (!requireObject(ctx, entry, entryPath)) {
      return;
    }

    requireSlug(ctx, entry.quest_key, `${entryPath}.quest_key`);
    requireSlug(ctx, entry.objective_key, `${entryPath}.objective_key`);
    const statuses = entry.statuses ?? (entry.status ? [entry.status] : null);

    if (!statuses) {
      addError(ctx, `${entryPath}.statuses`, 'is required');
      return;
    }

    validateStringArray(ctx, statuses, `${entryPath}.statuses`);
    statuses.forEach((status, statusIndex) => {
      if (!OBJECTIVE_STATUSES.includes(status)) {
        addError(
          ctx,
          `${entryPath}.statuses[${statusIndex}]`,
          `must be one of: ${OBJECTIVE_STATUSES.join(', ')}`
        );
      }
    });
  });
}

function validateScopedStateConditions(ctx, value, path, keyName) {
  if (!requireArray(ctx, value, path)) {
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (!requireObject(ctx, entry, entryPath)) {
      return;
    }

    requireSlug(ctx, entry[keyName], `${entryPath}.${keyName}`);

    if (entry.field !== undefined) {
      requireString(ctx, entry.field, `${entryPath}.field`);
    }

    if (entry.operator !== undefined && !['equals', 'not_equals', 'present', 'absent'].includes(entry.operator)) {
      addError(ctx, `${entryPath}.operator`, 'must be one of: equals, not_equals, present, absent');
    }
  });
}

function validateKnowledgeConditions(ctx, value, path) {
  if (!requireArray(ctx, value, path)) {
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (!requireObject(ctx, entry, entryPath)) {
      return;
    }

    if (!KNOWLEDGE_TYPES.includes(entry.knowledge_type)) {
      addError(ctx, `${entryPath}.knowledge_type`, `must be one of: ${KNOWLEDGE_TYPES.join(', ')}`);
    }

    requireString(ctx, entry.knowledge_key, `${entryPath}.knowledge_key`);
  });
}

function validateCheckConditionFields(ctx, condition, path) {
  for (const booleanKey of ['requires_success', 'requires_failure']) {
    if (condition[booleanKey] !== undefined && typeof condition[booleanKey] !== 'boolean') {
      addError(ctx, `${path}.${booleanKey}`, 'must be a boolean');
    }
  }

  for (const integerKey of [
    'minimum_margin',
    'maximum_margin',
    'minimum_total',
    'maximum_total',
    'minimum_roll',
    'maximum_roll',
  ]) {
    if (condition[integerKey] !== undefined) {
      validateInteger(ctx, condition[integerKey], `${path}.${integerKey}`);
    }
  }
}

export function validateConditionBlock(ctx, value, path, { allowDialogueExtensions = false } = {}) {
  if (value === undefined || value === null) {
    return {};
  }

  if (!requireObject(ctx, value, path)) {
    return {};
  }

  for (const key of Object.keys(value)) {
    if (!conditionKeys.has(key)) {
      addError(ctx, `${path}.${key}`, 'is not a supported condition key');
    }
  }

  if (value.required_alignment_abbreviations !== undefined) {
    validateStringArray(ctx, value.required_alignment_abbreviations, `${path}.required_alignment_abbreviations`);
  }

  if (value.required_campaign_types !== undefined) {
    validateStringArray(ctx, value.required_campaign_types, `${path}.required_campaign_types`);
    value.required_campaign_types.forEach((entry, index) => {
      if (!CAMPAIGN_TYPES.includes(entry)) {
        addError(ctx, `${path}.required_campaign_types[${index}]`, `must be one of: ${CAMPAIGN_TYPES.join(', ')}`);
      }
    });
  }

  for (const key of [
    'required_campaign_flags',
    'forbidden_campaign_flags',
    'required_character_flags',
    'forbidden_character_flags',
  ]) {
    if (value[key] !== undefined) {
      validateFlagMap(ctx, value[key], `${path}.${key}`);
    }
  }

  validateQuestStateConditions(ctx, value.required_quest_states ?? [], `${path}.required_quest_states`);
  validateObjectiveStateConditions(
    ctx,
    value.required_objective_states ?? [],
    `${path}.required_objective_states`
  );
  validateScopedStateConditions(ctx, value.required_scene_states ?? [], `${path}.required_scene_states`, 'scene_slug');
  validateScopedStateConditions(
    ctx,
    value.required_location_states ?? [],
    `${path}.required_location_states`,
    'location_slug'
  );
  validateScopedStateConditions(
    ctx,
    value.required_entity_states ?? [],
    `${path}.required_entity_states`,
    'entity_slug'
  );
  validateKnowledgeConditions(ctx, value.required_knowledge ?? [], `${path}.required_knowledge`);
  validateKnowledgeConditions(ctx, value.forbidden_knowledge ?? [], `${path}.forbidden_knowledge`);

  if (allowDialogueExtensions) {
    for (const key of ['required_session_flags', 'forbidden_session_flags']) {
      if (value[key] !== undefined) {
        validateFlagMap(ctx, value[key], `${path}.${key}`);
      }
    }

    for (const key of [
      'required_visited_node_keys',
      'forbidden_visited_node_keys',
      'required_choice_keys',
      'forbidden_choice_keys',
    ]) {
      if (value[key] !== undefined) {
        validateStringArray(ctx, value[key], `${path}.${key}`);
      }
    }

    validateCheckConditionFields(ctx, value, path);
  } else {
    for (const key of [
      'required_session_flags',
      'forbidden_session_flags',
      'required_visited_node_keys',
      'forbidden_visited_node_keys',
      'required_choice_keys',
      'forbidden_choice_keys',
      'requires_success',
      'requires_failure',
      'minimum_margin',
      'maximum_margin',
      'minimum_total',
      'maximum_total',
      'minimum_roll',
      'maximum_roll',
    ]) {
      if (value[key] !== undefined) {
        addError(ctx, `${path}.${key}`, 'is only supported in dialogue node/option/outcome conditions');
      }
    }
  }

  return value;
}

function validateRewardDefinition(ctx, reward, path) {
  if (!requireObject(ctx, reward, path)) {
    return;
  }

  if (!REWARD_TYPES.includes(reward.reward_type)) {
    addError(ctx, `${path}.reward_type`, `must be one of: ${REWARD_TYPES.join(', ')}`);
  }

  if (!requireObject(ctx, reward.value ?? {}, `${path}.value`)) {
    return;
  }

  if (reward.metadata_json !== undefined && !isPlainObject(reward.metadata_json)) {
    addError(ctx, `${path}.metadata_json`, 'must be a JSON object');
  }

  switch (reward.reward_type) {
    case 'xp':
      if (!Number.isInteger(reward.value.amount) || reward.value.amount < 1) {
        addError(ctx, `${path}.value.amount`, 'must be an integer >= 1');
      }
      break;
    case 'level_grant':
      if (
        reward.value.level_count !== undefined &&
        (!Number.isInteger(reward.value.level_count) || reward.value.level_count < 1)
      ) {
        addError(ctx, `${path}.value.level_count`, 'must be an integer >= 1');
      }
      if (
        reward.value.target_level !== undefined &&
        (!Number.isInteger(reward.value.target_level) || reward.value.target_level < 1)
      ) {
        addError(ctx, `${path}.value.target_level`, 'must be an integer >= 1');
      }
      if (
        reward.value.level_count === undefined &&
        reward.value.target_level === undefined
      ) {
        addError(ctx, `${path}.value`, 'must include level_count or target_level');
      }
      break;
    case 'item':
      if (!reward.value.item_slug && !reward.value.item_id) {
        addError(ctx, `${path}.value`, 'must include item_slug or item_id');
      }
      if (reward.value.item_slug !== undefined) {
        requireSlug(ctx, reward.value.item_slug, `${path}.value.item_slug`);
      }
      if (reward.value.quantity !== undefined && (!Number.isInteger(reward.value.quantity) || reward.value.quantity < 1)) {
        addError(ctx, `${path}.value.quantity`, 'must be an integer >= 1');
      }
      break;
    case 'campaign_flag':
    case 'character_flag':
      requireSlug(ctx, reward.value.flag_key, `${path}.value.flag_key`);
      break;
    case 'scene_unlock':
      if (reward.value.scene_key !== undefined) {
        requireSlug(ctx, reward.value.scene_key, `${path}.value.scene_key`);
      }
      break;
    case 'npc_disposition':
      requireSlug(ctx, reward.value.npc_key, `${path}.value.npc_key`);
      if (!DISPOSITIONS.includes(reward.value.disposition)) {
        addError(ctx, `${path}.value.disposition`, `must be one of: ${DISPOSITIONS.join(', ')}`);
      }
      break;
    case 'knowledge':
      if (!KNOWLEDGE_TYPES.includes(reward.value.knowledge_type)) {
        addError(ctx, `${path}.value.knowledge_type`, `must be one of: ${KNOWLEDGE_TYPES.join(', ')}`);
      }
      requireString(ctx, reward.value.knowledge_key, `${path}.value.knowledge_key`);
      requireString(ctx, reward.value.title, `${path}.value.title`);
      break;
    default:
      break;
  }
}

function validateWorldChangeDefinition(ctx, change, path) {
  if (!requireObject(ctx, change, path)) {
    return;
  }

  if (change.change_key !== undefined) {
    requireString(ctx, change.change_key, `${path}.change_key`);
  }

  requireString(ctx, change.change_type, `${path}.change_type`);

  if (
    typeof change.propagation_scope !== 'string' ||
    !['campaign_local', 'regional', 'global'].includes(change.propagation_scope)
  ) {
    addError(ctx, `${path}.propagation_scope`, 'must be one of: campaign_local, regional, global');
  }

  requireString(ctx, change.title, `${path}.title`);

  if (change.summary !== undefined) {
    requireString(ctx, change.summary, `${path}.summary`);
  }

  if (change.narrative_text !== undefined) {
    requireString(ctx, change.narrative_text, `${path}.narrative_text`);
  }

  for (const slugField of ['region_slug', 'location_slug', 'scene_slug', 'entity_slug']) {
    if (change[slugField] !== undefined) {
      requireSlug(ctx, change[slugField], `${path}.${slugField}`);
    }
  }

  for (const objectField of ['payload', 'truth_delta', 'knowledge_policy']) {
    if (change[objectField] !== undefined && !isPlainObject(change[objectField])) {
      addError(ctx, `${path}.${objectField}`, 'must be a JSON object');
    }
  }
}

export function validateEffectBlock(ctx, value, path, { allowSessionEffects = false } = {}) {
  if (value === undefined || value === null) {
    return {};
  }

  if (!requireObject(ctx, value, path)) {
    return {};
  }

  for (const key of Object.keys(value)) {
    if (!effectKeys.has(key)) {
      addError(ctx, `${path}.${key}`, 'is not a supported effect key');
    }
  }

  for (const key of [
    'campaign_flags',
    'campaign_flag_categories',
    'campaign_flag_metadata',
    'campaign_flag_titles',
    'campaign_flag_summaries',
    'character_flags',
    'character_flag_categories',
    'character_flag_metadata',
  ]) {
    if (value[key] !== undefined && !isPlainObject(value[key])) {
      addError(ctx, `${path}.${key}`, 'must be a JSON object');
    }
  }

  if (value.xp !== undefined && (!Number.isInteger(value.xp) || value.xp < 1)) {
    addError(ctx, `${path}.xp`, 'must be an integer >= 1');
  }

  if (value.npc_states !== undefined) {
    if (requireArray(ctx, value.npc_states, `${path}.npc_states`)) {
      value.npc_states.forEach((entry, index) => {
        const entryPath = `${path}.npc_states[${index}]`;
        if (!requireObject(ctx, entry, entryPath)) {
          return;
        }
        requireSlug(ctx, entry.npc_key, `${entryPath}.npc_key`);
        if (!DISPOSITIONS.includes(entry.disposition)) {
          addError(ctx, `${entryPath}.disposition`, `must be one of: ${DISPOSITIONS.join(', ')}`);
        }
      });
    }
  }

  if (value.quests !== undefined) {
    if (requireArray(ctx, value.quests, `${path}.quests`)) {
      value.quests.forEach((entry, index) => {
        const entryPath = `${path}.quests[${index}]`;
        if (!requireObject(ctx, entry, entryPath)) {
          return;
        }
        requireSlug(ctx, entry.quest_key, `${entryPath}.quest_key`);
        if (!QUEST_STATUSES.includes(entry.status)) {
          addError(ctx, `${entryPath}.status`, `must be one of: ${QUEST_STATUSES.join(', ')}`);
        }
      });
    }
  }

  if (value.objectives !== undefined) {
    if (requireArray(ctx, value.objectives, `${path}.objectives`)) {
      value.objectives.forEach((entry, index) => {
        const entryPath = `${path}.objectives[${index}]`;
        if (!requireObject(ctx, entry, entryPath)) {
          return;
        }
        requireSlug(ctx, entry.quest_key, `${entryPath}.quest_key`);
        requireSlug(ctx, entry.objective_key, `${entryPath}.objective_key`);
        if (!OBJECTIVE_STATUSES.includes(entry.status)) {
          addError(ctx, `${entryPath}.status`, `must be one of: ${OBJECTIVE_STATUSES.join(', ')}`);
        }
        if (entry.progress_count !== undefined && (!Number.isInteger(entry.progress_count) || entry.progress_count < 0)) {
          addError(ctx, `${entryPath}.progress_count`, 'must be an integer >= 0');
        }
      });
    }
  }

  if (value.rewards !== undefined) {
    if (requireArray(ctx, value.rewards, `${path}.rewards`)) {
      value.rewards.forEach((reward, index) => validateRewardDefinition(ctx, reward, `${path}.rewards[${index}]`));
    }
  }

  if (value.knowledge_entries !== undefined) {
    if (requireArray(ctx, value.knowledge_entries, `${path}.knowledge_entries`)) {
      value.knowledge_entries.forEach((entry, index) => {
        const entryPath = `${path}.knowledge_entries[${index}]`;
        if (!requireObject(ctx, entry, entryPath)) {
          return;
        }
        if (!KNOWLEDGE_TYPES.includes(entry.knowledge_type)) {
          addError(ctx, `${entryPath}.knowledge_type`, `must be one of: ${KNOWLEDGE_TYPES.join(', ')}`);
        }
        requireString(ctx, entry.knowledge_key, `${entryPath}.knowledge_key`);
        requireString(ctx, entry.title, `${entryPath}.title`);
      });
    }
  }

  if (value.world_changes !== undefined) {
    if (requireArray(ctx, value.world_changes, `${path}.world_changes`)) {
      value.world_changes.forEach((entry, index) =>
        validateWorldChangeDefinition(ctx, entry, `${path}.world_changes[${index}]`)
      );
    }
  }

  if (value.session_flags !== undefined) {
    if (!allowSessionEffects) {
      addError(ctx, `${path}.session_flags`, 'is only supported on dialogue node/outcome effects');
    } else {
      validateFlagMap(ctx, value.session_flags, `${path}.session_flags`);
    }
  }

  return value;
}

export function validateTextLayers(ctx, value, path) {
  if (value === undefined || value === null) {
    return {};
  }

  if (!requireObject(ctx, value, path)) {
    return {};
  }

  for (const key of Object.keys(value)) {
    if (!textLayerKeys.has(key)) {
      addError(ctx, `${path}.${key}`, 'is not a supported text layer key');
    }
  }

  for (const key of textLayerKeys) {
    if (key === 'variants') {
      continue;
    }

    if (value[key] !== undefined && typeof value[key] !== 'string') {
      addError(ctx, `${path}.${key}`, 'must be a string');
    }
  }

  if (value.variants !== undefined) {
    if (requireArray(ctx, value.variants, `${path}.variants`)) {
      value.variants.forEach((variant, index) => {
        const variantPath = `${path}.variants[${index}]`;
        if (!requireObject(ctx, variant, variantPath)) {
          return;
        }
        requireString(ctx, variant.text, `${variantPath}.text`);
        validateConditionBlock(ctx, variant.conditions ?? {}, `${variantPath}.conditions`);
      });
    }
  }

  return value;
}

export function textLayerValue(textLayers, ...keys) {
  for (const key of keys) {
    const value = textLayers?.[key];

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

export function validateDialogueCheck(ctx, value, path) {
  const mode = value.check_mode ?? 'none';

  if (!DIALOGUE_CHECK_MODES.includes(mode)) {
    addError(ctx, `${path}.check_mode`, `must be one of: ${DIALOGUE_CHECK_MODES.join(', ')}`);
  }

  if (!CHECK_VISIBILITIES.includes(value.check_visibility ?? 'visible')) {
    addError(ctx, `${path}.check_visibility`, `must be one of: ${CHECK_VISIBILITIES.join(', ')}`);
  }

  if (mode === 'none') {
    if (value.skill_slug !== null && value.skill_slug !== undefined) {
      addError(ctx, `${path}.skill_slug`, 'must be omitted when check_mode is none');
    }

    if (value.difficulty_class !== null && value.difficulty_class !== undefined) {
      addError(ctx, path, 'cannot include skill_slug or difficulty_class when check_mode is none');
    }
    return;
  }

  requireSlug(ctx, value.skill_slug, `${path}.skill_slug`);

  if (!Number.isInteger(value.difficulty_class) || value.difficulty_class < 1) {
    addError(ctx, `${path}.difficulty_class`, 'must be an integer >= 1');
  }
}

export function validateEventResolutionKind(ctx, value, path) {
  if (!EVENT_RESOLUTION_KINDS.includes(value)) {
    addError(ctx, path, `must be one of: ${EVENT_RESOLUTION_KINDS.join(', ')}`);
  }
}
