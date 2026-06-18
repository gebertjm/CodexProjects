import {
  AFFORDANCE_REPEAT_POLICIES,
  AFFORDANCE_STATES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  CONTENT_HOOK_POINTS,
  CONTENT_HOOK_SCOPE_TYPES,
  DISPOSITIONS,
  DIALOGUE_SPEAKER_TYPES,
  ENCOUNTER_DIFFICULTY_LABELS,
  ENCOUNTER_DISALLOWED_SCALING_METHODS,
  ENCOUNTER_RESOLUTION_PATHS,
  ENCOUNTER_SCALING_METHODS,
  ENCOUNTER_TYPES,
  ENTITY_STATUSES,
  ENTITY_TYPES,
  ENVIRONMENT_DESCRIPTION_SLOTS,
  ENVIRONMENT_LIGHT_LEVELS,
  ENVIRONMENT_LOCATION_TYPES,
  ENVIRONMENT_MOODS,
  ENVIRONMENT_SEASONS,
  ENVIRONMENT_TEMPERATURE_BANDS,
  ENVIRONMENT_TIME_OF_DAY,
  ENVIRONMENT_VISIBILITY,
  ENVIRONMENT_WEATHER,
  ENVIRONMENT_WIND,
  EVENT_RESOLUTION_KINDS,
  EXPLORATION_ACTION_VERBS,
  KNOWLEDGE_TYPES,
  NPC_AVAILABILITY_STATES,
  NPC_VISIBILITY_STATES,
  RESULT_BANDS,
  TRIGGER_EVENTS,
  TRIGGER_TYPES,
  WORLD_STATUSES,
} from './contentTypes.js';
import {
  textLayerValue,
  validateConditionBlock,
  validateDialogueCheck,
  validateEffectBlock,
  validateEventResolutionKind,
  validateTextLayers,
} from './contentAuthoringGrammar.js';

const slugPattern = /^[a-z0-9][a-z0-9_-]{1,119}$/;
const explorationResolutionModes = [
  'automatic_observation',
  'passive_discovery',
  'free_focus',
  'beat_action',
];
const checkVisibilityValues = ['visible', 'hidden', 'success_only', 'narrative_only'];
const committedFollowupResolutions = ['advantage', 'standard', 'take_20'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createValidationContext() {
  return {
    errors: [],
    warnings: [],
  };
}

function pathFor(record, field = null) {
  const base = record.__source_file ?? record.__section ?? 'package';
  return field ? `${base}.${field}` : base;
}

function addError(ctx, message) {
  ctx.errors.push(message);
}

function requireObject(ctx, record) {
  if (!isPlainObject(record)) {
    addError(ctx, `${pathFor(record)} must be a JSON object`);
    return false;
  }

  return true;
}

function requireString(ctx, record, field) {
  const value = record[field];

  if (typeof value !== 'string' || value.trim() === '') {
    addError(ctx, `${pathFor(record, field)} is required and must be a non-empty string`);
    return null;
  }

  return value.trim();
}

function optionalString(ctx, record, field) {
  const value = record[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    addError(ctx, `${pathFor(record, field)} must be a string`);
    return null;
  }

  return value.trim() || null;
}

function optionalBoolean(ctx, record, field, fallback = null) {
  const value = record[field];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    addError(ctx, `${pathFor(record, field)} must be a boolean`);
    return fallback;
  }

  return value;
}

function optionalInteger(ctx, record, field, fallback = null, { min = null } = {}) {
  const value = record[field];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (!Number.isInteger(value) || (min !== null && value < min)) {
    addError(
      ctx,
      `${pathFor(record, field)} must be an integer${min !== null ? ` >= ${min}` : ''}`
    );
    return fallback;
  }

  return value;
}

function optionalNumber(ctx, record, field, fallback = null, { min = null, max = null } = {}) {
  const value = record[field];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    (min !== null && value < min) ||
    (max !== null && value > max)
  ) {
    const bounds = [
      min !== null ? `>= ${min}` : null,
      max !== null ? `<= ${max}` : null,
    ]
      .filter(Boolean)
      .join(' and ');
    addError(ctx, `${pathFor(record, field)} must be a number${bounds ? ` ${bounds}` : ''}`);
    return fallback;
  }

  return value;
}

function optionalObject(ctx, record, field, fallback = {}) {
  const value = record[field];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (!isPlainObject(value)) {
    addError(ctx, `${pathFor(record, field)} must be a JSON object`);
    return fallback;
  }

  return value;
}

function optionalPriority(ctx, record, field = 'priority') {
  const value = optionalInteger(ctx, record, field, 0);
  return value === null ? 0 : value;
}

function optionalConditions(ctx, record, field, options = {}) {
  return validateConditionBlock(ctx, record[field], pathFor(record, field), options);
}

function optionalEffects(ctx, record, field, options = {}) {
  return validateEffectBlock(ctx, record[field], pathFor(record, field), options);
}

function optionalText(ctx, record, field = 'text') {
  return validateTextLayers(ctx, record[field], pathFor(record, field));
}

function optionalArray(ctx, record, field, fallback = []) {
  const value = record[field];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (!Array.isArray(value)) {
    addError(ctx, `${pathFor(record, field)} must be an array`);
    return fallback;
  }

  return value;
}

function requireArray(ctx, record, field) {
  const value = record[field];

  if (!Array.isArray(value)) {
    addError(ctx, `${pathFor(record, field)} is required and must be an array`);
    return [];
  }

  return value;
}

function requireSlug(ctx, record, field = 'slug') {
  const value = requireString(ctx, record, field);

  if (value && !slugPattern.test(value)) {
    addError(
      ctx,
      `${pathFor(record, field)} must use lowercase letters, numbers, hyphens, or underscores`
    );
  }

  return value;
}

function optionalSlug(ctx, record, field) {
  const value = optionalString(ctx, record, field);

  if (value && !slugPattern.test(value)) {
    addError(
      ctx,
      `${pathFor(record, field)} must use lowercase letters, numbers, hyphens, or underscores`
    );
  }

  return value;
}

function validateSlugValue(ctx, record, field, value) {
  if (value && !slugPattern.test(value)) {
    addError(
      ctx,
      `${pathFor(record, field)} must use lowercase letters, numbers, hyphens, or underscores`
    );
  }

  return value;
}

function optionalEnum(ctx, record, field, allowed, fallback = null) {
  const value = record[field];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string' || !allowed.includes(value)) {
    addError(ctx, `${pathFor(record, field)} must be one of: ${allowed.join(', ')}`);
    return fallback;
  }

  return value;
}

function validateUnique(ctx, sectionName, records, keySelector, scopeSelector = () => 'global') {
  const seen = new Map();

  for (const record of records) {
    const key = keySelector(record);

    if (!key) {
      continue;
    }

    const scope = scopeSelector(record);
    const compound = `${scope}:${key}`;

    if (seen.has(compound)) {
      addError(
        ctx,
        `${sectionName} contains duplicate slug/key "${key}" in scope "${scope}" (${seen.get(compound)} and ${record.__source_file})`
      );
      continue;
    }

    seen.set(compound, record.__source_file);
  }
}

function hasTextArray(value) {
  return (
    Array.isArray(value) &&
    value.some((entry) => typeof entry === 'string' && entry.trim() !== '')
  );
}

function validateSceneNarration(ctx, record, tier) {
  const narration = record.narration;
  if (narration === undefined || narration === null) {
    return null;
  }
  if (!isPlainObject(narration)) {
    addError(ctx, `${pathFor(record, 'narration')} must be a JSON object`);
    return null;
  }

  if (tier === 'playtest_ready' || tier === 'published') {
    if (!hasTextArray(narration.base)) {
      addError(ctx, `${pathFor(record, 'narration')}.base must include authored prose`);
    }
    if (!hasTextArray(narration.sensory)) {
      addError(ctx, `${pathFor(record, 'narration')}.sensory must include atmosphere prose`);
    }
    const opportunities = narration.opportunity_variants;
    if (!isPlainObject(opportunities)) {
      addError(ctx, `${pathFor(record, 'narration')}.opportunity_variants is required`);
    } else {
      if (!hasTextArray(opportunities.subtle)) {
        addError(ctx, `${pathFor(record, 'narration')}.opportunity_variants.subtle is required`);
      }
      if (!hasTextArray(opportunities.soft_explicit)) {
        addError(
          ctx,
          `${pathFor(record, 'narration')}.opportunity_variants.soft_explicit is required`
        );
      }
    }
  }

  return narration;
}

function validateExplorationCheck(ctx, record, path, defaultVisibility) {
  const check = record.check;
  if (check === undefined || check === null) {
    return null;
  }
  if (!isPlainObject(check)) {
    addError(ctx, `${path}.check must be a JSON object`);
    return null;
  }

  const visibility = check.visibility ?? check.check_visibility ?? defaultVisibility;
  if (!checkVisibilityValues.includes(visibility)) {
    addError(ctx, `${path}.check.visibility must be one of: ${checkVisibilityValues.join(', ')}`);
  }

  return {
    ...check,
    visibility,
  };
}

function hasNarration(value) {
  return isPlainObject(value) && typeof value.narration === 'string' && value.narration.trim() !== '';
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateSurfaceFocusCommit(ctx, record, tier) {
  const automaticObservations = optionalArray(ctx, record, 'automatic_observations');
  const passiveDiscoveries = optionalArray(ctx, record, 'passive_discoveries');
  const freeFocus = optionalArray(ctx, record, 'free_focus');
  const beatActions = optionalArray(ctx, record, 'beat_actions');

  for (const [index, observation] of automaticObservations.entries()) {
    const path = `${pathFor(record, 'automatic_observations')}[${index}]`;
    if (!isPlainObject(observation)) {
      addError(ctx, `${path} must be a JSON object`);
      continue;
    }
    if ((observation.resolution_mode ?? 'automatic_observation') !== 'automatic_observation') {
      addError(ctx, `${path}.resolution_mode must be automatic_observation`);
    }
    if (tier !== 'legacy' && !nonEmptyString(observation.narration ?? observation.text)) {
      addError(ctx, `${path}.narration is required for playtest-ready observations`);
    }
  }

  for (const [index, discovery] of passiveDiscoveries.entries()) {
    const path = `${pathFor(record, 'passive_discoveries')}[${index}]`;
    if (!isPlainObject(discovery)) {
      addError(ctx, `${path} must be a JSON object`);
      continue;
    }
    if ((discovery.resolution_mode ?? 'passive_discovery') !== 'passive_discovery') {
      addError(ctx, `${path}.resolution_mode must be passive_discovery`);
    }
    validateExplorationCheck(ctx, discovery, path, 'success_only');
    if (tier !== 'legacy' && discovery.requires_check === true && !hasNarration(discovery.on_success)) {
      addError(ctx, `${path}.on_success.narration is required when passive success is reachable`);
    }
  }

  for (const [index, focus] of freeFocus.entries()) {
    const path = `${pathFor(record, 'free_focus')}[${index}]`;
    if (!isPlainObject(focus)) {
      addError(ctx, `${path} must be a JSON object`);
      continue;
    }
    if ((focus.resolution_mode ?? 'free_focus') !== 'free_focus') {
      addError(ctx, `${path}.resolution_mode must be free_focus`);
    }
    if (!nonEmptyString(focus.label)) {
      addError(ctx, `${path}.label is required`);
    }
    if (/\b(?:gm|debug|secret)\b/i.test(String(focus.label ?? ''))) {
      addError(ctx, `${path}.label contains unsafe player-facing text`);
    }
    const check = validateExplorationCheck(ctx, focus, path, 'visible');
    if (tier !== 'legacy') {
      if (check || focus.requires_check === true) {
        if (!hasNarration(focus.on_success)) {
          addError(ctx, `${path}.on_success.narration is required for checked Free Focus`);
        }
        if (!hasNarration(focus.on_failure)) {
          addError(ctx, `${path}.on_failure.narration is required for checked Free Focus`);
        }
      } else if (!hasNarration(focus.result) && !nonEmptyString(focus.narration)) {
        addError(ctx, `${path}.result.narration is required for no-check Free Focus`);
      }
    }
    const followup = focus.committed_followup;
    if (followup !== undefined && followup !== null) {
      if (!isPlainObject(followup)) {
        addError(ctx, `${path}.committed_followup must be a JSON object`);
      } else if (
        followup.check_resolution !== undefined &&
        !committedFollowupResolutions.includes(followup.check_resolution)
      ) {
        addError(
          ctx,
          `${path}.committed_followup.check_resolution must be one of: ${committedFollowupResolutions.join(', ')}`
        );
      }
    }
  }

  for (const [index, action] of beatActions.entries()) {
    const path = `${pathFor(record, 'beat_actions')}[${index}]`;
    if (!isPlainObject(action)) {
      addError(ctx, `${path} must be a JSON object`);
      continue;
    }
    if (action.resolution_mode !== 'beat_action') {
      addError(ctx, `${path}.resolution_mode must be beat_action`);
    }
  }

  return {
    automatic_observations: automaticObservations,
    passive_discoveries: passiveDiscoveries,
    free_focus: freeFocus,
    beat_actions: beatActions,
  };
}

function validateWorld(ctx, records) {
  if (records.length !== 1) {
    addError(ctx, 'Package must contain exactly one world.json record');
    return [];
  }

  return records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      theme_tags: optionalArray(ctx, record, 'theme_tags'),
      status: optionalEnum(ctx, record, 'status', WORLD_STATUSES, 'active'),
      text,
    };
  });
}

function validateSimpleTemplate(ctx, records, sectionName) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name') ?? textLayerValue(text, 'title'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      source: optionalString(ctx, record, 'source'),
      text,
    };
  });

  validateUnique(ctx, sectionName, normalized, (record) => record.slug);
  return normalized;
}

function validateLocationTemplates(ctx, records) {
  const normalized = validateSimpleTemplate(ctx, records, 'location templates').map((record) => ({
    ...record,
    region_template_slug: optionalSlug(ctx, record, 'region_template_slug'),
  }));
  return normalized;
}

function validateSceneTemplates(ctx, records) {
  const normalized = validateSimpleTemplate(ctx, records, 'scene templates').map((record) => ({
    ...record,
    location_template_slug: optionalSlug(ctx, record, 'location_template_slug'),
    summary: optionalString(ctx, record, 'summary') ?? textLayerValue(record.text, 'summary', 'short'),
    entry_text: optionalString(ctx, record, 'entry_text') ?? textLayerValue(record.text, 'entry', 'full'),
    entry_conditions: optionalConditions(ctx, record, 'entry_conditions'),
  }));
  return normalized;
}

function validateCampaigns(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    const status = optionalEnum(ctx, record, 'status', CAMPAIGN_STATUSES, 'active');

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      campaign_type: optionalEnum(ctx, record, 'campaign_type', CAMPAIGN_TYPES, 'party'),
      status,
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      is_active: optionalBoolean(ctx, record, 'is_active', status !== 'archived'),
      created_by_account_id: optionalInteger(ctx, record, 'created_by_account_id', null, { min: 1 }),
      text,
    };
  });

  validateUnique(ctx, 'campaigns', normalized, (record) => record.slug);
  return normalized;
}

function validateRegions(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      template_slug: optionalSlug(ctx, record, 'template_slug'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
    };
  });

  validateUnique(ctx, 'regions', normalized, (record) => record.slug);
  return normalized;
}

function validateLocations(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      region_slug: requireSlug(ctx, record, 'region_slug'),
      template_slug: optionalSlug(ctx, record, 'template_slug'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
    };
  });

  validateUnique(ctx, 'locations', normalized, (record) => record.slug);
  return normalized;
}

function validateScenes(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);
    const inferredTier = record.narration ? 'playtest_ready' : 'legacy';
    const narrationTier = optionalEnum(
      ctx,
      record,
      'narration_tier',
      ['legacy', 'playtest_ready', 'published'],
      inferredTier
    );
    const narration = validateSceneNarration(ctx, record, narrationTier);
    const explorationInteractions = validateSurfaceFocusCommit(ctx, record, narrationTier);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      location_slug: requireSlug(ctx, record, 'location_slug'),
      template_slug: optionalSlug(ctx, record, 'template_slug'),
      summary: optionalString(ctx, record, 'summary') ?? textLayerValue(text, 'summary', 'short'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      entry_text: optionalString(ctx, record, 'entry_text') ?? textLayerValue(text, 'entry', 'full'),
      is_starting_scene: optionalBoolean(ctx, record, 'is_starting_scene', false),
      entry_conditions: optionalConditions(ctx, record, 'entry_conditions'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      narration,
      narration_tier: narrationTier,
      interaction_model: optionalEnum(
        ctx,
        record,
        'interaction_model',
        ['surface_focus_commit'],
        record.interaction_model ?? null
      ),
      ...explorationInteractions,
      text,
    };
  });

  validateUnique(ctx, 'scenes', normalized, (record) => record.slug);
  return normalized;
}

function validateNpcTemplates(ctx, records) {
  function validateActionList(record, field, fallback = ['observe', 'talk']) {
    const values = optionalArray(ctx, record, field, fallback);
    const normalized = [];

    for (const value of values) {
      if (typeof value !== 'string' || !EXPLORATION_ACTION_VERBS.includes(value)) {
        addError(ctx, `${pathFor(record, field)} entries must be one of: ${EXPLORATION_ACTION_VERBS.join(', ')}`);
        continue;
      }

      normalized.push(value);
    }

    return [...new Set(normalized)];
  }

  function validateScheduleEntries(record) {
    return optionalArray(ctx, record, 'schedule').map((entry, index) => {
      const entryPath = `${pathFor(record, 'schedule')}[${index}]`;
      if (!isPlainObject(entry)) {
        addError(ctx, `${entryPath} must be a JSON object`);
        return {};
      }

      const scheduleRecord = { ...entry, __source_file: entryPath };
      const timeBlock = optionalEnum(
        ctx,
        scheduleRecord,
        'time_block',
        ENVIRONMENT_TIME_OF_DAY,
        null
      );
      const customTimeLabel = optionalSlug(ctx, scheduleRecord, 'custom_time_label');

      if (!timeBlock && !customTimeLabel) {
        addError(ctx, `${entryPath}.time_block or ${entryPath}.custom_time_label is required`);
      }

      const activityText = optionalString(ctx, scheduleRecord, 'activity_text');
      if (activityText && /\bGM[-_\s]?ONLY\b|\bDEBUG\b|whispering presence|hidden truth/i.test(activityText)) {
        addError(ctx, `${entryPath}.activity_text appears to expose GM/debug or hidden-truth content`);
      }

      return {
        ...entry,
        time_block: timeBlock,
        custom_time_label: customTimeLabel,
        location_id: requireSlug(ctx, scheduleRecord, 'location_id'),
        scene_id: optionalSlug(ctx, scheduleRecord, 'scene_id'),
        activity: optionalString(ctx, scheduleRecord, 'activity') ?? 'present',
        activity_text: activityText,
        availability: optionalEnum(
          ctx,
          scheduleRecord,
          'availability',
          NPC_AVAILABILITY_STATES,
          'available'
        ),
        visibility: optionalEnum(ctx, scheduleRecord, 'visibility', NPC_VISIBILITY_STATES, 'visible'),
        priority: optionalInteger(ctx, scheduleRecord, 'priority', 0),
        conditions: optionalObject(ctx, scheduleRecord, 'conditions'),
        tags: optionalArray(ctx, scheduleRecord, 'tags'),
        fallback: optionalBoolean(ctx, scheduleRecord, 'fallback', false),
      };
    });
  }

  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);
    const trueName = optionalString(ctx, record, 'true_name') ?? optionalString(ctx, record, 'name');
    const identity = optionalObject(ctx, record, 'identity', {});
    const defaultActions = validateActionList(record, 'default_actions', ['observe', 'talk']);
    const schedule = validateScheduleEntries(record);
    const defaultVisibility = optionalEnum(
      ctx,
      record,
      'default_visibility',
      NPC_VISIBILITY_STATES,
      'visible'
    );
    const defaultAvailability = optionalEnum(
      ctx,
      record,
      'default_availability',
      NPC_AVAILABILITY_STATES,
      'available'
    );
    const publicRoleLabel = optionalString(ctx, record, 'public_role_label') ?? optionalString(ctx, record, 'role');
    const unknownLabel =
      optionalString(ctx, record, 'unknown_label') ??
      publicRoleLabel ??
      optionalString(ctx, record, 'name');
    const npcType = optionalString(ctx, record, 'npc_type') ?? 'humanoid';

    if (defaultVisibility === 'visible' && !unknownLabel && !publicRoleLabel && npcType !== 'group') {
      addError(
        ctx,
        `${pathFor(record)} needs unknown_label or public_role_label for visible unknown NPC presentation`
      );
    }

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      npc_type: npcType,
      disposition: optionalEnum(ctx, record, 'disposition', DISPOSITIONS, 'neutral'),
      role: optionalString(ctx, record, 'role'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      true_name: trueName,
      public_role_label: publicRoleLabel,
      unknown_label: unknownLabel,
      aliases: optionalArray(ctx, record, 'aliases'),
      default_location_id: optionalSlug(ctx, record, 'default_location_id'),
      default_scene_id: optionalSlug(ctx, record, 'default_scene_id'),
      default_visibility: defaultVisibility,
      default_availability: defaultAvailability,
      default_actions: defaultActions,
      identity: {
        ...identity,
        reveal_policy:
          typeof identity.reveal_policy === 'string'
            ? identity.reveal_policy
            : 'role_until_known',
        knowledge_id_for_true_name:
          typeof identity.knowledge_id_for_true_name === 'string'
            ? identity.knowledge_id_for_true_name
            : null,
        publicly_known: typeof identity.publicly_known === 'boolean' ? identity.publicly_known : false,
        known_if_character_has_knowledge: Array.isArray(identity.known_if_character_has_knowledge)
          ? identity.known_if_character_has_knowledge
          : [],
      },
      schedule,
      metadata: optionalObject(ctx, record, 'metadata'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
    };
  });

  validateUnique(ctx, 'NPC templates', normalized, (record) => record.slug);
  return normalized;
}

function validateWorldEntities(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);

    const entityType = optionalEnum(ctx, record, 'entity_type', ENTITY_TYPES, 'npc');

    return {
      ...record,
      slug: requireSlug(ctx, record),
      entity_type: entityType,
      template_slug: requireSlug(ctx, record, 'template_slug'),
      current_region_slug: optionalSlug(ctx, record, 'current_region_slug'),
      current_location_slug: optionalSlug(ctx, record, 'current_location_slug'),
      current_scene_slug: optionalSlug(ctx, record, 'current_scene_slug'),
      status: optionalEnum(ctx, record, 'status', ENTITY_STATUSES, 'active'),
      disposition: optionalEnum(ctx, record, 'disposition', DISPOSITIONS, null),
      faction: optionalString(ctx, record, 'faction'),
      state: optionalObject(ctx, record, 'state'),
      notes: optionalString(ctx, record, 'notes'),
      sync_scene_presence: optionalBoolean(ctx, record, 'sync_scene_presence', entityType === 'npc'),
    };
  });

  validateUnique(ctx, 'world entities', normalized, (record) => record.slug);
  return normalized;
}

function validateQuests(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    const objectives = optionalArray(ctx, record, 'objectives').map((objective, index) => {
      if (!isPlainObject(objective)) {
        addError(ctx, `${pathFor(record, 'objectives')}[${index}] must be a JSON object`);
        return {};
      }
      const objectivePath = `${pathFor(record, 'objectives')}[${index}]`;
      const objectiveText = validateTextLayers(ctx, objective.text, `${objectivePath}.text`);

      return {
        ...objective,
        slug: requireSlug(ctx, objective, 'slug'),
        title: requireString(ctx, objective, 'title'),
        description: optionalString(ctx, objective, 'description') ?? textLayerValue(objectiveText, 'full', 'summary'),
        sort_order: optionalInteger(ctx, objective, 'sort_order', index),
        activation_conditions: validateConditionBlock(
          ctx,
          objective.activation_conditions,
          `${objectivePath}.activation_conditions`
        ),
        completion_conditions: validateConditionBlock(
          ctx,
          objective.completion_conditions,
          `${objectivePath}.completion_conditions`
        ),
        failure_conditions: validateConditionBlock(
          ctx,
          objective.failure_conditions,
          `${objectivePath}.failure_conditions`
        ),
        progress_target: optionalInteger(ctx, objective, 'progress_target', null, { min: 0 }),
        hard_gate: optionalBoolean(ctx, objective, 'hard_gate', false),
        text: objectiveText,
      };
    });

    validateUnique(ctx, `objectives for ${record.slug}`, objectives, (objective) => objective.slug);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      summary: optionalString(ctx, record, 'summary') ?? textLayerValue(text, 'summary', 'short'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      availability_conditions: optionalConditions(ctx, record, 'availability_conditions'),
      discovery_summary: optionalString(ctx, record, 'discovery_summary') ?? textLayerValue(text, 'recap'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
      objectives,
    };
  });

  validateUnique(ctx, 'quests', normalized, (record) => record.slug);
  return normalized;
}

function validateInteractions(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);
    const difficultyClass = optionalInteger(ctx, record, 'difficulty_class', null, { min: 1 });
    const resultBands = validateInteractionResultBands(ctx, record, 'result_bands');

    if (difficultyClass === null) {
      addError(ctx, `${pathFor(record, 'difficulty_class')} is required and must be an integer >= 1`);
    }

    return {
      ...record,
      slug: requireSlug(ctx, record),
      scene_slug: requireSlug(ctx, record, 'scene_slug'),
      npc_template_slug: optionalSlug(ctx, record, 'npc_template_slug'),
      label: requireString(ctx, record, 'label'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      interaction_type: optionalEnum(ctx, record, 'interaction_type', ['skill_check'], 'skill_check'),
      skill_slug: requireSlug(ctx, record, 'skill_slug'),
      verb: optionalEnum(ctx, record, 'verb', EXPLORATION_ACTION_VERBS, null),
      target_affordance_id: optionalSlug(ctx, record, 'target_affordance_id'),
      difficulty_class: difficultyClass,
      sort_order: optionalInteger(ctx, record, 'sort_order', 0),
      is_repeatable: optionalBoolean(ctx, record, 'is_repeatable', false),
      availability_conditions: optionalConditions(ctx, record, 'availability_conditions'),
      success_effects: optionalEffects(ctx, record, 'success_effects'),
      failure_effects: optionalEffects(ctx, record, 'failure_effects'),
      success_text: optionalString(ctx, record, 'success_text') ?? textLayerValue(text, 'success'),
      failure_text: optionalString(ctx, record, 'failure_text') ?? textLayerValue(text, 'failure'),
      result_bands: resultBands,
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
    };
  });

  validateUnique(ctx, 'interactions', normalized, (record) => record.slug, (record) => record.scene_slug);
  return normalized;
}

function validateKnowledgeDefinitions(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);

    const knowledgeId = requireSlug(ctx, record, 'knowledge_id');
    const publicLabel = requireString(ctx, record, 'public_label');
    const canonicalText = requireString(ctx, record, 'canonical_text');

    const forbiddenPublicText = /whispering presence|hidden truth|secret gm|gm-only/i;
    if (forbiddenPublicText.test(publicLabel)) {
      addError(ctx, `${pathFor(record, 'public_label')} appears to expose hidden truth`);
    }

    return {
      ...record,
      slug: knowledgeId,
      knowledge_id: knowledgeId,
      type: optionalEnum(ctx, record, 'type', KNOWLEDGE_TYPES, 'fact'),
      public_label: publicLabel,
      canonical_text: canonicalText,
      hidden_until_discovered: optionalBoolean(ctx, record, 'hidden_until_discovered', true),
      tags: optionalArray(ctx, record, 'tags'),
      metadata: optionalObject(ctx, record, 'metadata'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
    };
  });

  validateUnique(ctx, 'knowledge definitions', normalized, (record) => record.knowledge_id);
  return normalized;
}

function validateStringArrayEnum(ctx, record, field, allowed) {
  const values = optionalArray(ctx, record, field);

  for (const value of values) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      addError(ctx, `${pathFor(record, field)} entries must be one of: ${allowed.join(', ')}`);
    }
  }

  return values;
}

function validateEnvironmentFlavorEntries(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const id = requireSlug(ctx, record, 'id');
    const text = requireString(ctx, record, 'text');

    if (/\bGM[-_\s]?ONLY\b|\bDEBUG\b|whispering presence/i.test(text)) {
      addError(ctx, `${pathFor(record, 'text')} appears to expose GM/debug or hidden-truth content`);
    }

    return {
      ...record,
      slug: id,
      id,
      slot: optionalEnum(ctx, record, 'slot', ENVIRONMENT_DESCRIPTION_SLOTS, 'weather_overlay'),
      text,
      tags: optionalArray(ctx, record, 'tags'),
      valid_weather: validateStringArrayEnum(ctx, record, 'valid_weather', ENVIRONMENT_WEATHER),
      valid_time_of_day: validateStringArrayEnum(ctx, record, 'valid_time_of_day', ENVIRONMENT_TIME_OF_DAY),
      valid_season: validateStringArrayEnum(ctx, record, 'valid_season', ENVIRONMENT_SEASONS),
      valid_location_tags: optionalArray(ctx, record, 'valid_location_tags'),
      valid_scene_tags: optionalArray(ctx, record, 'valid_scene_tags'),
      valid_biome: optionalArray(ctx, record, 'valid_biome'),
      valid_location_environment: validateStringArrayEnum(
        ctx,
        record,
        'valid_location_environment',
        ENVIRONMENT_LOCATION_TYPES
      ),
      tone_or_mood: validateStringArrayEnum(ctx, record, 'tone_or_mood', ENVIRONMENT_MOODS),
      priority: optionalInteger(ctx, record, 'priority', 0),
      weight: optionalNumber(ctx, record, 'weight', 1, { min: 0.0001 }),
      reuse_cooldown: optionalInteger(ctx, record, 'reuse_cooldown', 0, { min: 0 }),
      exclusions: optionalArray(ctx, record, 'exclusions'),
      requires_known_facts: optionalArray(ctx, record, 'requires_known_facts'),
      excludes_known_facts: optionalArray(ctx, record, 'excludes_known_facts'),
      requires_world_flags: optionalArray(ctx, record, 'requires_world_flags'),
      excludes_world_flags: optionalArray(ctx, record, 'excludes_world_flags'),
      max_once_per_scene: optionalBoolean(ctx, record, 'max_once_per_scene', false),
      author_notes: optionalString(ctx, record, 'author_notes'),
      gm_notes: optionalString(ctx, record, 'gm_notes'),
      metadata: optionalObject(ctx, record, 'metadata'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
    };
  });

  validateUnique(ctx, 'environment flavor entries', normalized, (record) => record.id);
  return normalized;
}

function validateEnvironmentModifiers(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);

    return {
      ...record,
      slug: requireSlug(ctx, record, 'id'),
      id: requireSlug(ctx, record, 'id'),
      environment_id: requireSlug(ctx, record, 'environment_id'),
      check_type: optionalEnum(ctx, record, 'check_type', ['skill', 'ability', 'attack', 'save'], 'skill'),
      skill: optionalSlug(ctx, record, 'skill'),
      context: optionalSlug(ctx, record, 'context'),
      modifier: optionalInteger(ctx, record, 'modifier', 0),
      reason: requireString(ctx, record, 'reason'),
      narrative_hint: optionalString(ctx, record, 'narrative_hint'),
      conditions: optionalObject(ctx, record, 'conditions'),
      metadata: optionalObject(ctx, record, 'metadata'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
    };
  });

  validateUnique(ctx, 'environment modifiers', normalized, (record) => record.id);
  return normalized;
}

function validateSceneAffordances(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const affordanceId = requireSlug(ctx, record, 'affordance_id');
    const actions = optionalArray(ctx, record, 'available_actions').map((action, index) => {
      const actionPath = `${pathFor(record, 'available_actions')}[${index}]`;
      const normalizedAction = isPlainObject(action) ? action : {};

      if (!isPlainObject(action)) {
        addError(ctx, `${actionPath} must be an object`);
      }

      return {
        ...normalizedAction,
        verb: optionalEnum(
          ctx,
          { ...normalizedAction, __source_file: record.__source_file },
          'verb',
          EXPLORATION_ACTION_VERBS,
          'observe'
        ),
        interaction_id: optionalSlug(ctx, { ...normalizedAction, __source_file: record.__source_file }, 'interaction_id'),
        transition_id: optionalSlug(ctx, { ...normalizedAction, __source_file: record.__source_file }, 'transition_id'),
        repeat_policy: optionalEnum(
          ctx,
          { ...normalizedAction, __source_file: record.__source_file },
          'repeat_policy',
          AFFORDANCE_REPEAT_POLICIES,
          'once'
        ),
      };
    });

    if (actions.length === 0) {
      addError(ctx, `${pathFor(record, 'available_actions')} must include at least one action`);
    }

    return {
      ...record,
      slug: affordanceId,
      affordance_id: affordanceId,
      scene_slug: requireSlug(ctx, record, 'scene_slug'),
      label: requireString(ctx, record, 'label'),
      aliases: optionalArray(ctx, record, 'aliases'),
      tags: optionalArray(ctx, record, 'tags'),
      available_actions: actions,
      initial_state: optionalEnum(ctx, record, 'initial_state', AFFORDANCE_STATES, 'available'),
      prerequisites: optionalArray(ctx, record, 'prerequisites'),
      hidden_until: optionalArray(ctx, record, 'hidden_until'),
      locked_until: optionalArray(ctx, record, 'locked_until'),
      reveals: optionalArray(ctx, record, 'reveals'),
      adds_affordances: optionalArray(ctx, record, 'adds_affordances'),
      removes_affordances: optionalArray(ctx, record, 'removes_affordances'),
      metadata: optionalObject(ctx, record, 'metadata'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
    };
  });

  validateUnique(
    ctx,
    'scene affordances',
    normalized,
    (record) => record.affordance_id,
    (record) => record.scene_slug
  );
  return normalized;
}

function validateInteractionResultBands(ctx, record, field) {
  const bands = optionalArray(ctx, record, field);
  const ranges = [];

  return bands.map((band, index) => {
    const bandPath = `${pathFor(record, field)}[${index}]`;
    const source = isPlainObject(band) ? { ...band, __source_file: record.__source_file } : {};

    if (!isPlainObject(band)) {
      addError(ctx, `${bandPath} must be an object`);
    }

    const minTotal = optionalInteger(ctx, source, 'min_total', null);
    const maxTotal = optionalInteger(ctx, source, 'max_total', null);

    if (minTotal !== null && maxTotal !== null && minTotal > maxTotal) {
      addError(ctx, `${bandPath}.min_total cannot exceed max_total`);
    }

    if (minTotal !== null || maxTotal !== null) {
      ranges.push({
        index,
        min: minTotal ?? Number.NEGATIVE_INFINITY,
        max: maxTotal ?? Number.POSITIVE_INFINITY,
      });
    }

    for (const change of optionalArray(ctx, source, 'state_changes')) {
      if (!isPlainObject(change)) {
        addError(ctx, `${bandPath}.state_changes contains a non-object state change`);
        continue;
      }

      if (!['affordance', 'scene', 'location', 'entity', 'objective'].includes(change.target_type)) {
        addError(ctx, `${bandPath}.state_changes has invalid target_type "${change.target_type}"`);
      }

      if (typeof change.target_id !== 'string' || change.target_id.trim() === '') {
        addError(ctx, `${bandPath}.state_changes target_id is required`);
      }

      if (change.target_type === 'affordance' && change.field === 'state' && !AFFORDANCE_STATES.includes(change.value)) {
        addError(ctx, `${bandPath}.state_changes has invalid affordance state "${change.value}"`);
      }
    }

    for (let leftIndex = 0; leftIndex < ranges.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ranges.length; rightIndex += 1) {
        const left = ranges[leftIndex];
        const right = ranges[rightIndex];

        if (left.min <= right.max && right.min <= left.max) {
          addError(ctx, `${pathFor(record, field)}[${left.index}] overlaps [${right.index}]`);
        }
      }
    }

    return {
      ...source,
      band: optionalEnum(ctx, source, 'band', RESULT_BANDS, 'success'),
      min_total: minTotal,
      max_total: maxTotal,
      text: requireString(ctx, source, 'text'),
      knowledge_grants: optionalArray(ctx, source, 'knowledge_grants'),
      state_changes: optionalArray(ctx, source, 'state_changes'),
      objective_updates: optionalArray(ctx, source, 'objective_updates'),
      metadata: optionalObject(ctx, source, 'metadata'),
    };
  });
}

function validateSceneTransitions(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      from_scene_slug: requireSlug(ctx, record, 'from_scene_slug'),
      to_scene_slug: requireSlug(ctx, record, 'to_scene_slug'),
      label: requireString(ctx, record, 'label'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      sort_order: optionalInteger(ctx, record, 'sort_order', 0),
      is_default_path: optionalBoolean(ctx, record, 'is_default_path', false),
      recommendation: optionalObject(ctx, record, 'recommendation'),
      conditions: optionalConditions(ctx, record, 'conditions'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
    };
  });

  validateUnique(
    ctx,
    'scene transitions',
    normalized,
    (record) => record.slug,
    (record) => record.from_scene_slug
  );
  return normalized;
}

function validateDialogueOptions(ctx, node, nodePath) {
  const options = optionalArray(ctx, node, 'options');

  const normalized = options.map((option, index) => {
    const optionPath = `${nodePath}.options[${index}]`;

    if (!isPlainObject(option)) {
      addError(ctx, `${optionPath} must be a JSON object`);
      return {};
    }

    const text = validateTextLayers(ctx, option.text, `${optionPath}.text`);
    const normalizedOption = {
      ...option,
      slug: requireSlug(ctx, option, 'slug'),
      label: requireString(ctx, option, 'label') ?? textLayerValue(text, 'short', 'title'),
      description: optionalString(ctx, option, 'description') ?? textLayerValue(text, 'full', 'summary'),
      sort_order: optionalInteger(ctx, option, 'sort_order', index),
      availability_conditions: validateConditionBlock(
        ctx,
        option.availability_conditions,
        `${optionPath}.availability_conditions`,
        { allowDialogueExtensions: true }
      ),
      check_mode: option.check_mode ?? 'none',
      skill_slug: optionalSlug(ctx, option, 'skill_slug'),
      difficulty_class: optionalInteger(ctx, option, 'difficulty_class'),
      check_visibility: optionalEnum(ctx, option, 'check_visibility', ['visible', 'hidden'], 'visible'),
      is_active: optionalBoolean(ctx, option, 'is_active', true),
      text,
      outcomes: optionalArray(ctx, option, 'outcomes'),
    };

    validateDialogueCheck(ctx, normalizedOption, optionPath);

    normalizedOption.outcomes = normalizedOption.outcomes.map((outcome, outcomeIndex) => {
      const outcomePath = `${optionPath}.outcomes[${outcomeIndex}]`;

      if (!isPlainObject(outcome)) {
        addError(ctx, `${outcomePath} must be a JSON object`);
        return {};
      }

      const outcomeText = validateTextLayers(ctx, outcome.text, `${outcomePath}.text`);

      return {
        ...outcome,
        slug: requireSlug(ctx, outcome, 'slug'),
        next_node_slug: optionalSlug(ctx, outcome, 'next_node_slug'),
        label: optionalString(ctx, outcome, 'label') ?? textLayerValue(outcomeText, 'short', 'title'),
        sort_order: optionalInteger(ctx, outcome, 'sort_order', outcomeIndex),
        conditions: validateConditionBlock(ctx, outcome.conditions, `${outcomePath}.conditions`, {
          allowDialogueExtensions: true,
        }),
        effects: validateEffectBlock(ctx, outcome.effects, `${outcomePath}.effects`, {
          allowSessionEffects: true,
        }),
        result_text: optionalString(ctx, outcome, 'result_text') ?? textLayerValue(outcomeText, 'recap', 'summary'),
        is_terminal: optionalBoolean(ctx, outcome, 'is_terminal', false),
        is_active: optionalBoolean(ctx, outcome, 'is_active', true),
        text: outcomeText,
      };
    });

    validateUnique(
      ctx,
      `outcomes for ${option.slug}`,
      normalizedOption.outcomes,
      (outcome) => outcome.slug
    );

    return normalizedOption;
  });

  validateUnique(ctx, `dialogue options for ${node.slug}`, normalized, (option) => option.slug);
  return normalized;
}

function validateEventTriggers(ctx, record, field = 'event_triggers') {
  const triggers = optionalArray(ctx, record, field);

  return triggers.map((trigger, index) => {
    const triggerPath = `${pathFor(record, field)}[${index}]`;

    if (!isPlainObject(trigger)) {
      addError(ctx, `${triggerPath} must be a JSON object`);
      return {};
    }

    const eventTemplateKey = requireSlug(ctx, trigger, 'event_template_key');

    return {
      ...trigger,
      event_template_key: eventTemplateKey,
      conditions: validateConditionBlock(ctx, trigger.conditions, `${triggerPath}.conditions`),
      feedback: validateTextLayers(ctx, trigger.feedback, `${triggerPath}.feedback`),
      once_per_character: optionalBoolean(ctx, trigger, 'once_per_character', false),
    };
  });
}

function validateContentHooks(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);
    const scope = optionalObject(ctx, record, 'scope');

    return {
      ...record,
      slug: requireSlug(ctx, record),
      hook_point: optionalEnum(ctx, record, 'hook_point', CONTENT_HOOK_POINTS, null),
      scope_type: optionalEnum(ctx, record, 'scope_type', CONTENT_HOOK_SCOPE_TYPES, 'world'),
      scope,
      campaign_slug: optionalSlug(ctx, record, 'campaign_slug') ?? optionalSlug(ctx, scope, 'campaign_slug'),
      scene_slug: optionalSlug(ctx, record, 'scene_slug') ?? optionalSlug(ctx, scope, 'scene_slug'),
      npc_template_slug:
        optionalSlug(ctx, record, 'npc_template_slug') ?? optionalSlug(ctx, scope, 'npc_template_slug'),
      entity_slug: optionalSlug(ctx, record, 'entity_slug') ?? optionalSlug(ctx, scope, 'entity_slug'),
      scope_key:
        optionalString(ctx, record, 'scope_key') ??
        optionalString(ctx, scope, 'scope_key') ??
        optionalString(ctx, scope, 'dialogue_slug') ??
        optionalString(ctx, scope, 'interaction_slug') ??
        optionalString(ctx, scope, 'objective_slug') ??
        optionalString(ctx, scope, 'event_key') ??
        optionalString(ctx, scope, 'time_key'),
      label: requireString(ctx, record, 'label') ?? textLayerValue(text, 'title', 'short'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      conditions: optionalConditions(ctx, record, 'conditions'),
      effects: optionalEffects(ctx, record, 'effects'),
      event_triggers: validateEventTriggers(ctx, record),
      feedback: optionalText(ctx, record, 'feedback'),
      priority: optionalPriority(ctx, record),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
    };
  });

  for (const record of normalized) {
    if (!record.hook_point) {
      addError(ctx, `${pathFor(record, 'hook_point')} is required`);
    }

    if (record.scope_type === 'scene' && !record.scene_slug) {
      addError(ctx, `${pathFor(record, 'scene_slug')} is required when scope_type is scene`);
    }

    if (record.scope_type === 'campaign' && !record.campaign_slug) {
      addError(ctx, `${pathFor(record, 'campaign_slug')} is required when scope_type is campaign`);
    }

    if (record.scope_type === 'entity' && !record.entity_slug && !record.npc_template_slug) {
      addError(
        ctx,
        `${pathFor(record, 'entity_slug')} or ${pathFor(record, 'npc_template_slug')} is required when scope_type is entity`
      );
    }
  }

  validateUnique(ctx, 'dynamic content hooks', normalized, (record) => record.slug);
  return normalized;
}

function validateEventTemplates(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);
    const promptText =
      optionalString(ctx, record, 'prompt_text') ?? textLayerValue(text, 'entry', 'full', 'summary');
    const options = optionalArray(ctx, record, 'options').map((option, index) => {
      const optionPath = `${pathFor(record, 'options')}[${index}]`;

      if (!isPlainObject(option)) {
        addError(ctx, `${optionPath} must be a JSON object`);
        return {};
      }

      const optionText = validateTextLayers(ctx, option.text, `${optionPath}.text`);
      const resolutionKind = optionalEnum(
        ctx,
        option,
        'resolution_kind',
        EVENT_RESOLUTION_KINDS,
        'no_effect'
      );
      let resolutionPayload = optionalObject(ctx, option, 'resolution_payload', {});

      if (resolutionKind === 'apply_effects') {
        resolutionPayload = validateEffectBlock(
          ctx,
          option.resolution_payload,
          `${optionPath}.resolution_payload`
        );
      }

      validateEventResolutionKind(ctx, resolutionKind, `${optionPath}.resolution_kind`);

      return {
        ...option,
        slug: requireSlug(ctx, option, 'slug'),
        label: requireString(ctx, option, 'label') ?? textLayerValue(optionText, 'title', 'short'),
        description:
          optionalString(ctx, option, 'description') ?? textLayerValue(optionText, 'full', 'summary'),
        sort_order: optionalInteger(ctx, option, 'sort_order', index),
        resolution_kind: resolutionKind,
        resolution_payload: resolutionPayload,
        is_active: optionalBoolean(ctx, option, 'is_active', true),
        text: optionText,
      };
    });

    validateUnique(ctx, `event options for ${record.slug}`, options, (option) => option.slug);

    return {
      ...record,
      slug: requireSlug(ctx, record),
      name: requireString(ctx, record, 'name'),
      event_type: requireString(ctx, record, 'event_type'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      prompt_text: promptText,
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
      options,
    };
  });

  normalized.forEach((record) => {
    if (!record.prompt_text) {
      addError(ctx, `${pathFor(record, 'prompt_text')} is required directly or through text.entry/text.full/text.summary`);
    }
  });

  validateUnique(ctx, 'event templates', normalized, (record) => record.slug);
  return normalized;
}

function validateDialogues(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);
    const text = optionalText(ctx, record);

    const nodes = optionalArray(ctx, record, 'nodes').map((node, index) => {
      const nodePath = `${pathFor(record, 'nodes')}[${index}]`;

      if (!isPlainObject(node)) {
        addError(ctx, `${nodePath} must be a JSON object`);
        return {};
      }

      const nodeText = validateTextLayers(ctx, node.text, `${nodePath}.text`);
      const normalizedNode = {
        ...node,
        slug: requireSlug(ctx, node, 'slug'),
        title: optionalString(ctx, node, 'title') ?? textLayerValue(nodeText, 'title', 'short'),
        speaker_type: optionalEnum(ctx, node, 'speaker_type', DIALOGUE_SPEAKER_TYPES, 'npc'),
        speaker_npc_template_slug: optionalSlug(ctx, node, 'speaker_npc_template_slug'),
        text_content:
          optionalString(ctx, node, 'text_content') ??
          textLayerValue(nodeText, 'full', 'summary', 'short'),
        sort_order: optionalInteger(ctx, node, 'sort_order', index),
        is_entry_node: optionalBoolean(ctx, node, 'is_entry_node', index === 0),
        is_terminal: optionalBoolean(ctx, node, 'is_terminal', false),
        availability_conditions: validateConditionBlock(
          ctx,
          node.availability_conditions,
          `${nodePath}.availability_conditions`,
          { allowDialogueExtensions: true }
        ),
        entry_effects: validateEffectBlock(ctx, node.entry_effects, `${nodePath}.entry_effects`, {
          allowSessionEffects: true,
        }),
        text: nodeText,
      };

      if (!normalizedNode.text_content) {
        addError(ctx, `${nodePath}.text_content`, 'is required directly or through text.full/text.summary/text.short');
      }

      normalizedNode.options = validateDialogueOptions(ctx, node, nodePath);
      return normalizedNode;
    });

    validateUnique(ctx, `dialogue nodes for ${record.slug}`, nodes, (node) => node.slug);

    const entryNodes = nodes.filter((node) => node.is_entry_node);

    if (nodes.length > 0 && entryNodes.length === 0) {
      addError(ctx, `${pathFor(record, 'nodes')} must contain at least one entry node`);
    }

    return {
      ...record,
      slug: requireSlug(ctx, record),
      scene_slug: optionalSlug(ctx, record, 'scene_slug'),
      npc_template_slug: optionalSlug(ctx, record, 'npc_template_slug'),
      name: requireString(ctx, record, 'name') ?? textLayerValue(text, 'title'),
      summary: optionalString(ctx, record, 'summary') ?? textLayerValue(text, 'summary', 'short'),
      description: optionalString(ctx, record, 'description') ?? textLayerValue(text, 'full', 'summary'),
      trigger_type: optionalEnum(ctx, record, 'trigger_type', TRIGGER_TYPES, 'player'),
      trigger_event: optionalEnum(ctx, record, 'trigger_event', TRIGGER_EVENTS, 'npc_talk'),
      sort_order: optionalInteger(ctx, record, 'sort_order', 0),
      availability_conditions: optionalConditions(ctx, record, 'availability_conditions', {
        allowDialogueExtensions: true,
      }),
      is_repeatable: optionalBoolean(ctx, record, 'is_repeatable', true),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
      text,
      nodes,
    };
  });

  validateUnique(ctx, 'dialogue graphs', normalized, (record) => record.slug);
  return normalized;
}

function validateCampaignLocationStates(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);

    return {
      ...record,
      campaign_slug: requireSlug(ctx, record, 'campaign_slug'),
      location_slug: requireSlug(ctx, record, 'location_slug'),
      is_discovered: optionalBoolean(ctx, record, 'is_discovered', false),
      is_available: optionalBoolean(ctx, record, 'is_available', true),
      overlay: optionalObject(ctx, record, 'overlay'),
      notes: optionalString(ctx, record, 'notes'),
    };
  });

  validateUnique(
    ctx,
    'campaign location overlays',
    normalized,
    (record) => record.location_slug,
    (record) => record.campaign_slug
  );
  return normalized;
}

function validateEncounterRange(ctx, record, field, { required = true, min = 1 } = {}) {
  const value = record[field];

  if (value === undefined || value === null) {
    if (required) {
      addError(ctx, `${pathFor(record, field)} is required`);
    }
    return { min: null, max: null };
  }

  if (!isPlainObject(value)) {
    addError(ctx, `${pathFor(record, field)} must be an object with min and max`);
    return { min: null, max: null };
  }

  const range = {
    min: optionalInteger(ctx, value, 'min', null, { min }),
    max: optionalInteger(ctx, value, 'max', null, { min }),
  };

  if (range.min === null || range.max === null) {
    addError(ctx, `${pathFor(record, field)} must include integer min and max`);
    return range;
  }

  if (range.min > range.max) {
    addError(ctx, `${pathFor(record, field)} min cannot be greater than max`);
  }

  return range;
}

function validateEncounterMethodList(ctx, record, field, allowed, fallback = []) {
  const values = optionalArray(ctx, record, field, fallback);
  const normalized = [];

  for (const value of values) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      addError(ctx, `${pathFor(record, field)} contains invalid scaling method "${value}"`);
      continue;
    }

    normalized.push(value);
  }

  return [...new Set(normalized)];
}

function validateEncounterResolutionPaths(ctx, record) {
  const paths = requireArray(ctx, record, 'resolution_paths');
  const normalized = [];

  for (const path of paths) {
    if (typeof path !== 'string' || !ENCOUNTER_RESOLUTION_PATHS.includes(path)) {
      addError(
        ctx,
        `${pathFor(record, 'resolution_paths')} contains invalid resolution path "${path}"`
      );
      continue;
    }

    normalized.push(path);
  }

  if (normalized.length === 0) {
    addError(ctx, `${pathFor(record, 'resolution_paths')} must include at least one path`);
  }

  return [...new Set(normalized)];
}

function validateEncounterEnemy(ctx, enemy, record, variantSlug) {
  if (!requireObject(ctx, enemy)) {
    return null;
  }

  const rawReference = enemy.entity_slug ?? enemy.entity_or_template_id ?? enemy.template_slug;
  const reference =
    typeof rawReference === 'string'
      ? validateSlugValue(ctx, enemy, 'entity_slug', rawReference.trim())
      : null;

  if (!reference) {
    addError(
      ctx,
      `${pathFor(record)} variant "${variantSlug}" enemy must include entity_slug, entity_or_template_id, or template_slug`
    );
  }

  const entityType = optionalEnum(
    ctx,
    enemy,
    'entity_type',
    ['npc', 'monster', 'world_entity', 'npc_template', 'monster_template'],
    null
  );
  const count = optionalInteger(ctx, enemy, 'count', 1, { min: 1 }) ?? 1;
  const minCount = optionalInteger(ctx, enemy, 'min_count', 0, { min: 0 }) ?? 0;
  const maxCount = optionalInteger(ctx, enemy, 'max_count', count, { min: 1 }) ?? count;

  if (minCount > maxCount) {
    addError(ctx, `${pathFor(enemy, 'min_count')} cannot be greater than max_count`);
  }

  if (count < minCount || count > maxCount) {
    addError(ctx, `${pathFor(enemy, 'count')} must be inside min_count/max_count bounds`);
  }

  return {
    ...enemy,
    entity_slug: reference,
    entity_or_template_id: reference,
    entity_type: entityType,
    count,
    min_count: minCount,
    max_count: maxCount,
    base_power: optionalNumber(ctx, enemy, 'base_power', null, { min: 0 }),
    action_economy_weight: optionalNumber(ctx, enemy, 'action_economy_weight', 1, {
      min: 0,
      max: 5,
    }),
    scalable: optionalBoolean(ctx, enemy, 'scalable', true),
  };
}

function validateEncounterVariant(ctx, variant, record, encounterRange) {
  if (!requireObject(ctx, variant)) {
    return null;
  }

  const variantSlug = validateSlugValue(
    ctx,
    variant,
    'variant_id',
    requireString(ctx, variant, 'variant_id')
  );
  const partySizeRange = validateEncounterRange(ctx, variant, 'party_size_range', {
    required: false,
  });
  const levelRange = validateEncounterRange(ctx, variant, 'level_range', {
    required: false,
  });

  if (
    partySizeRange.min !== null &&
    encounterRange.party_size_range.min !== null &&
    (partySizeRange.min < encounterRange.party_size_range.min ||
      partySizeRange.max > encounterRange.party_size_range.max)
  ) {
    addError(ctx, `${pathFor(variant, 'party_size_range')} must stay within encounter bounds`);
  }

  if (
    levelRange.min !== null &&
    encounterRange.level_range.min !== null &&
    (levelRange.min < encounterRange.level_range.min || levelRange.max > encounterRange.level_range.max)
  ) {
    addError(ctx, `${pathFor(variant, 'level_range')} must stay within encounter bounds`);
  }

  const enemies = requireArray(ctx, variant, 'enemies')
    .map((enemy) => validateEncounterEnemy(ctx, enemy, record, variantSlug))
    .filter(Boolean);

  if (enemies.length === 0) {
    addError(ctx, `${pathFor(variant, 'enemies')} must include at least one enemy`);
  }

  return {
    ...variant,
    variant_id: variantSlug,
    party_size_range: partySizeRange.min === null ? null : partySizeRange,
    level_range: levelRange.min === null ? null : levelRange,
    enemies,
    notes: optionalString(ctx, variant, 'notes'),
  };
}

function validateEncounterRewardValue(ctx, record, resolutionPaths) {
  const rewardValue = optionalObject(ctx, record, 'reward_value', null);

  if (!rewardValue) {
    addError(ctx, `${pathFor(record, 'reward_value')} is required`);
    return null;
  }

  const xp = optionalInteger(ctx, rewardValue, 'xp', null, { min: 0 });
  const grantOnResolution = optionalBoolean(ctx, rewardValue, 'grant_on_resolution', true);
  const equivalentAcrossPaths = optionalBoolean(
    ctx,
    rewardValue,
    'equivalent_across_paths',
    false
  );
  const nonCombatPaths = resolutionPaths.filter((path) => path !== 'combat');

  if (xp === null) {
    addError(ctx, `${pathFor(record, 'reward_value')}.xp is required and must be >= 0`);
  }

  if (nonCombatPaths.length > 0 && grantOnResolution && !equivalentAcrossPaths) {
    addError(
      ctx,
      `${pathFor(record, 'reward_value')}.equivalent_across_paths must be true when non-combat resolution paths grant rewards`
    );
  }

  return {
    ...rewardValue,
    xp,
    grant_on_resolution: grantOnResolution,
    equivalent_across_paths: equivalentAcrossPaths,
  };
}

function validateEncounterTemplates(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);

    const encounterType = optionalEnum(
      ctx,
      record,
      'encounter_type',
      ENCOUNTER_TYPES,
      'minor'
    );
    const difficultyIntent = optionalEnum(
      ctx,
      record,
      'difficulty_intent',
      ENCOUNTER_DIFFICULTY_LABELS,
      null
    );
    if (!difficultyIntent) {
      addError(ctx, `${pathFor(record, 'difficulty_intent')} is required`);
    }

    const scalingEnabled = optionalBoolean(ctx, record, 'scaling_enabled', false);
    const storyFixedByDefault = optionalBoolean(
      ctx,
      record,
      'story_fixed_by_default',
      encounterType === 'story' || encounterType === 'final'
    );
    const explicitStoryScaling = optionalBoolean(ctx, record, 'explicit_story_scaling', false);
    const allowedScalingMethods = validateEncounterMethodList(
      ctx,
      record,
      'allowed_scaling_methods',
      ENCOUNTER_SCALING_METHODS
    );
    const disallowedScalingMethods = validateEncounterMethodList(
      ctx,
      record,
      'disallowed_scaling_methods',
      ENCOUNTER_DISALLOWED_SCALING_METHODS
    );

    if (scalingEnabled && allowedScalingMethods.length === 0) {
      addError(ctx, `${pathFor(record, 'allowed_scaling_methods')} is required when scaling is enabled`);
    }

    if (
      scalingEnabled &&
      storyFixedByDefault &&
      (encounterType === 'story' || encounterType === 'final') &&
      !explicitStoryScaling
    ) {
      addError(
        ctx,
        `${pathFor(record, 'explicit_story_scaling')} must be true to scale a story-fixed encounter`
      );
    }

    if (allowedScalingMethods.includes('stat_tweak')) {
      const bounds = optionalObject(ctx, record, 'stat_tweak_bounds', {});
      const maxPercent = optionalNumber(ctx, bounds, 'max_percent', 0.1, {
        min: 0,
        max: 0.2,
      });
      if (maxPercent > 0.2) {
        addError(ctx, `${pathFor(record, 'stat_tweak_bounds')}.max_percent must be <= 0.2`);
      }
    }

    const partySizeRange = validateEncounterRange(ctx, record, 'party_size_range');
    const levelRange = validateEncounterRange(ctx, record, 'level_range');
    const asyncBeatTarget = validateEncounterRange(ctx, record, 'async_beat_target', {
      min: 1,
    });

    if (asyncBeatTarget.max !== null && asyncBeatTarget.max > 8) {
      addError(ctx, `${pathFor(record, 'async_beat_target')} max cannot exceed 8 beats`);
    }

    if (
      encounterType === 'minor' &&
      asyncBeatTarget.max !== null &&
      asyncBeatTarget.max > 4
    ) {
      ctx.warnings.push(`${pathFor(record)} minor encounter targets more than 4 beats`);
    }

    if (
      (encounterType === 'major' || encounterType === 'story') &&
      asyncBeatTarget.max !== null &&
      asyncBeatTarget.max > 6
    ) {
      ctx.warnings.push(`${pathFor(record)} major/story encounter targets more than 6 beats`);
    }

    const rangeBundle = {
      party_size_range: partySizeRange,
      level_range: levelRange,
    };
    const variants = requireArray(ctx, record, 'variants')
      .map((variant) => validateEncounterVariant(ctx, variant, record, rangeBundle))
      .filter(Boolean);
    validateUnique(ctx, 'encounter variants', variants, (variant) => variant.variant_id, () =>
      record.slug ?? record.encounter_id
    );

    const resolutionPaths = validateEncounterResolutionPaths(ctx, record);
    const rewardValue = validateEncounterRewardValue(ctx, record, resolutionPaths);
    const soloEnabled = partySizeRange.min !== null && partySizeRange.min <= 1;

    if (soloEnabled) {
      const hasSoloVariant = variants.some(
        (variant) =>
          variant.party_size_range === null ||
          (variant.party_size_range.min <= 1 && variant.party_size_range.max >= 1)
      );
      const hasSoloSafePath =
        record.fail_forward === true ||
        resolutionPaths.some((path) =>
          ['escape', 'negotiation', 'stealth', 'avoidance', 'fail_forward'].includes(path)
        );

      if (!hasSoloVariant) {
        ctx.warnings.push(`${pathFor(record)} supports solo play but has no solo variant`);
      }

      if (!hasSoloSafePath) {
        ctx.warnings.push(`${pathFor(record)} supports solo play but has no solo-safe path`);
      }
    }

    return {
      ...record,
      slug: record.slug ? requireSlug(ctx, record) : requireSlug(ctx, record, 'encounter_id'),
      name: requireString(ctx, record, 'name'),
      encounter_type: encounterType,
      difficulty_intent: difficultyIntent,
      campaign_slug: optionalSlug(ctx, record, 'campaign_slug'),
      scene_slug: optionalSlug(ctx, record, 'scene_slug'),
      scaling_enabled: scalingEnabled,
      story_fixed_by_default: storyFixedByDefault,
      explicit_story_scaling: explicitStoryScaling,
      allowed_scaling_methods: allowedScalingMethods,
      disallowed_scaling_methods: disallowedScalingMethods,
      party_size_range: partySizeRange,
      level_range: levelRange,
      async_beat_target: asyncBeatTarget,
      base_variant: optionalSlug(ctx, record, 'base_variant'),
      variants,
      resolution_paths: resolutionPaths,
      reward_value: rewardValue,
      fail_forward: optionalBoolean(ctx, record, 'fail_forward', false),
      metadata: optionalObject(ctx, record, 'metadata'),
      is_active: optionalBoolean(ctx, record, 'is_active', true),
    };
  });

  validateUnique(ctx, 'encounter templates', normalized, (record) => record.slug);
  return normalized;
}

function validateCampaignSceneStates(ctx, records) {
  const normalized = records.map((record) => {
    requireObject(ctx, record);

    return {
      ...record,
      campaign_slug: requireSlug(ctx, record, 'campaign_slug'),
      scene_slug: requireSlug(ctx, record, 'scene_slug'),
      is_discovered: optionalBoolean(ctx, record, 'is_discovered', false),
      is_available: optionalBoolean(ctx, record, 'is_available', true),
      overlay: optionalObject(ctx, record, 'overlay'),
      notes: optionalString(ctx, record, 'notes'),
    };
  });

  validateUnique(
    ctx,
    'campaign scene overlays',
    normalized,
    (record) => record.scene_slug,
    (record) => record.campaign_slug
  );
  return normalized;
}

export function validateContentPackage(discoveredPackage) {
  const ctx = createValidationContext();
  const sections = discoveredPackage.sections;
  const normalizedSections = {
    world: validateWorld(ctx, sections.world),
    regionTemplates: validateSimpleTemplate(ctx, sections.regionTemplates, 'region templates'),
    locationTemplates: validateLocationTemplates(ctx, sections.locationTemplates),
    sceneTemplates: validateSceneTemplates(ctx, sections.sceneTemplates),
    campaigns: validateCampaigns(ctx, sections.campaigns),
    regions: validateRegions(ctx, sections.regions),
    locations: validateLocations(ctx, sections.locations),
    scenes: validateScenes(ctx, sections.scenes),
    sceneTransitions: validateSceneTransitions(ctx, sections.sceneTransitions),
    npcTemplates: validateNpcTemplates(ctx, sections.npcTemplates),
    worldEntities: validateWorldEntities(ctx, sections.worldEntities),
    encounterTemplates: validateEncounterTemplates(ctx, sections.encounterTemplates),
    knowledgeDefinitions: validateKnowledgeDefinitions(ctx, sections.knowledgeDefinitions),
    environmentFlavorEntries: validateEnvironmentFlavorEntries(ctx, sections.environmentFlavorEntries),
    environmentModifiers: validateEnvironmentModifiers(ctx, sections.environmentModifiers),
    sceneAffordances: validateSceneAffordances(ctx, sections.sceneAffordances),
    quests: validateQuests(ctx, sections.quests),
    interactions: validateInteractions(ctx, sections.interactions),
    dialogues: validateDialogues(ctx, sections.dialogues),
    eventTemplates: validateEventTemplates(ctx, sections.eventTemplates),
    contentHooks: validateContentHooks(ctx, sections.contentHooks),
    campaignLocationStates: validateCampaignLocationStates(ctx, sections.campaignLocationStates),
    campaignSceneStates: validateCampaignSceneStates(ctx, sections.campaignSceneStates),
  };

  return {
    ok: ctx.errors.length === 0,
    errors: ctx.errors,
    warnings: ctx.warnings,
    packagePath: discoveredPackage.packagePath,
    manifest: discoveredPackage.manifest,
    loadOrder: discoveredPackage.loadOrder,
    filesProcessed: discoveredPackage.filesProcessed,
    sections: normalizedSections,
  };
}
