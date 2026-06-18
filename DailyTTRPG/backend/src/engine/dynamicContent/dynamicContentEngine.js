import { evaluateNarrativeConditions } from '../narrative/narrativeEngine.js';

export const STANDARD_HOOK_POINTS = [
  'scene_enter',
  'scene_exit',
  'dialogue_node_enter',
  'dialogue_option_select',
  'interaction_attempt',
  'interaction_success',
  'interaction_failure',
  'combat_start',
  'combat_end',
  'objective_start',
  'objective_complete',
  'time_beat',
  'event_triggered',
  'event_resolved',
];

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function jsonValuesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function knowledgeKey(entry) {
  const type = normalizeString(entry?.knowledge_type);
  const key = normalizeString(entry?.knowledge_key);
  return type && key ? `${type}:${key}` : null;
}

function hasKnowledge(knowledgeSet, entry) {
  const key = knowledgeKey(entry);
  return key ? knowledgeSet.has(key) : false;
}

function compareValue(actualValue, expectedValue, operator = 'equals') {
  switch (operator) {
    case 'present':
      return actualValue !== undefined && actualValue !== null;
    case 'absent':
      return actualValue === undefined || actualValue === null;
    case 'not_equals':
      return !jsonValuesMatch(actualValue, expectedValue);
    case 'equals':
    default:
      return jsonValuesMatch(actualValue, expectedValue);
  }
}

function readScopedField(record, field) {
  const normalizedField = normalizeString(field);

  if (!normalizedField) {
    return record ? true : null;
  }

  if (!record) {
    return null;
  }

  if (normalizedField.includes('.')) {
    return normalizedField
      .split('.')
      .reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), record);
  }

  return record[normalizedField];
}

function evaluateCampaignTypes(conditions, context) {
  const requiredTypes = normalizeArray(conditions.required_campaign_types)
    .map(normalizeString)
    .filter(Boolean);

  if (requiredTypes.length === 0) {
    return [];
  }

  const campaignType = normalizeString(context.campaign_type);
  return campaignType && requiredTypes.includes(campaignType)
    ? []
    : ['Campaign type does not meet this requirement'];
}

function evaluateKnowledgeRequirements(conditions, context) {
  const reasons = [];
  const knowledgeSet = context.knowledge_set ?? new Set();

  for (const required of normalizeArray(conditions.required_knowledge)) {
    if (!hasKnowledge(knowledgeSet, required)) {
      reasons.push(`Knowledge "${required.knowledge_type}:${required.knowledge_key}" is not known`);
    }
  }

  for (const forbidden of normalizeArray(conditions.forbidden_knowledge)) {
    if (hasKnowledge(knowledgeSet, forbidden)) {
      reasons.push(`Knowledge "${forbidden.knowledge_type}:${forbidden.knowledge_key}" is hidden or blocked`);
    }
  }

  return reasons;
}

function evaluateSceneStateRequirements(conditions, context) {
  const reasons = [];
  const sceneBySlug = context.scene_state_map ?? new Map();
  const currentScene = context.current_scene ?? null;

  for (const requirement of normalizeArray(conditions.required_scene_states)) {
    const sceneSlug = normalizeString(requirement.scene_slug);
    const sceneState =
      (sceneSlug && sceneBySlug.get(sceneSlug)) ??
      (sceneSlug && currentScene?.key === sceneSlug
        ? {
            ...currentScene,
            is_current: true,
          }
        : null);
    const actualValue = readScopedField(sceneState, requirement.field ?? 'is_current');

    if (!compareValue(actualValue, requirement.value ?? true, requirement.operator ?? 'equals')) {
      reasons.push(`Scene "${sceneSlug}" does not meet this state requirement`);
    }
  }

  return reasons;
}

function evaluateLocationStateRequirements(conditions, context) {
  const reasons = [];
  const locationBySlug = context.location_state_map ?? new Map();
  const currentLocation = context.current_scene?.location ?? null;

  for (const requirement of normalizeArray(conditions.required_location_states)) {
    const locationSlug = normalizeString(requirement.location_slug);
    const locationState =
      (locationSlug && locationBySlug.get(locationSlug)) ??
      (locationSlug && currentLocation?.key === locationSlug
        ? {
            ...currentLocation,
            is_current: true,
          }
        : null);
    const actualValue = readScopedField(locationState, requirement.field ?? 'is_current');

    if (!compareValue(actualValue, requirement.value ?? true, requirement.operator ?? 'equals')) {
      reasons.push(`Location "${locationSlug}" does not meet this state requirement`);
    }
  }

  return reasons;
}

function evaluateEntityStateRequirements(conditions, context) {
  const reasons = [];
  const entityMap = context.entity_state_map ?? new Map();

  for (const requirement of normalizeArray(conditions.required_entity_states)) {
    const entitySlug = normalizeString(requirement.entity_slug);
    const entity = entitySlug ? entityMap.get(entitySlug) : null;
    const actualValue = readScopedField(entity, requirement.field ?? 'status');

    if (!compareValue(actualValue, requirement.value ?? 'active', requirement.operator ?? 'equals')) {
      reasons.push(`Entity "${entitySlug}" does not meet this state requirement`);
    }
  }

  return reasons;
}

export function evaluateDynamicConditions(conditions, context) {
  const normalizedConditions = normalizeObject(conditions);
  const base = evaluateNarrativeConditions(normalizedConditions, context);
  const reasons = [
    ...(base.unmet_requirements ?? []),
    ...evaluateCampaignTypes(normalizedConditions, context),
    ...evaluateKnowledgeRequirements(normalizedConditions, context),
    ...evaluateSceneStateRequirements(normalizedConditions, context),
    ...evaluateLocationStateRequirements(normalizedConditions, context),
    ...evaluateEntityStateRequirements(normalizedConditions, context),
  ];

  return {
    is_available: reasons.length === 0,
    unmet_requirements: reasons,
  };
}

export function isEmptyEffectPayload(effectPayload) {
  const normalized = normalizeObject(effectPayload);
  return Object.keys(normalized).length === 0;
}

export function shapeHookFeedback(hook, { visibility = 'player' } = {}) {
  const feedback = normalizeObject(hook.feedback_json);
  const text = normalizeObject(feedback.text);
  const sms = normalizeString(feedback.sms ?? text.sms ?? text.short ?? text.summary);
  const narrative = normalizeString(feedback.summary ?? text.summary ?? text.full ?? hook.description);
  const debug = {
    hook_id: hook.id,
    hook_key: hook.hook_key,
    hook_point: hook.hook_point,
    scope_type: hook.scope_type,
    scope_key: hook.scope_key,
    priority: hook.priority,
  };

  if (visibility === 'minimal') {
    return {
      concise: sms ?? narrative ?? hook.label,
      narrative: sms ?? narrative ?? hook.label,
    };
  }

  if (visibility === 'full') {
    return {
      concise: sms ?? hook.label,
      narrative: narrative ?? sms ?? hook.label,
      debug,
    };
  }

  return {
    concise: sms ?? hook.label,
    narrative: narrative ?? sms ?? hook.label,
  };
}

export function summarizeReevaluation({ hooks = [], sceneState = null }) {
  const currentScene = sceneState?.current_scene ?? null;

  return {
    hook_count: hooks.length,
    executed_hook_count: hooks.filter((hook) => hook.was_executed).length,
    skipped_hook_count: hooks.filter((hook) => !hook.was_executed).length,
    scene: currentScene
      ? {
          id: currentScene.id,
          key: currentScene.key,
          name: currentScene.name,
          visible_interactions: (currentScene.interactions ?? []).filter(
            (interaction) => interaction.availability?.is_available
          ).length,
          visible_transitions: (currentScene.transitions ?? []).filter(
            (transition) => transition.availability?.is_available
          ).length,
          visible_npcs: (currentScene.npcs ?? []).filter((npc) => npc.availability?.is_available).length,
        }
      : null,
  };
}
