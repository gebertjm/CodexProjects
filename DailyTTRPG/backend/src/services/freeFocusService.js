import { query, withTransaction } from '../config/db.js';
import { resolveNarrativeSkillCheck } from '../engine/narrative/narrativeEngine.js';
import { createHttpError } from '../utils/httpError.js';
import { getCharacterRules } from './characterRulesService.js';
import { grantKnowledge } from './characterKnowledgeService.js';
import { ensureExplorationInteractionSchema } from './explorationInteractionSchema.js';
import { recordGameplayHistory } from './gameplayHistoryService.js';
import { recordCampaignLog } from './narrativeStateService.js';
import { getSceneContentOverlay } from './sceneContentOverlayService.js';
import { setSceneState } from './worldStateService.js';

const checkVisibilities = new Set(['visible', 'hidden', 'success_only', 'narrative_only']);
const checkResolutions = new Set(['standard', 'advantage', 'take_20', 'passive', 'hidden', 'gm_roll']);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function slugText(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function titleCase(value) {
  return cleanText(value)
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeCheckVisibility(value, fallback) {
  const normalized = cleanText(value).toLowerCase();
  return checkVisibilities.has(normalized) ? normalized : fallback;
}

function normalizeCheckResolution(value, fallback = 'standard') {
  const normalized = cleanText(value).toLowerCase();
  return checkResolutions.has(normalized) ? normalized : fallback;
}

function sceneStateVersion(sceneState) {
  const state = normalizeObject(sceneState?.state_json ?? sceneState);
  return cleanText(state.version ?? state.scene_state_version ?? sceneState?.updated_at) || 'default';
}

function targetStateVersion(definition) {
  return cleanText(definition.target_state_version ?? definition.targetStateVersion) || 'default';
}

function definitionVersion(definition) {
  const parsed = Number(definition.interaction_version ?? definition.version ?? 1);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function interactionId(definition, fallbackPrefix) {
  return cleanText(
    definition.interaction_id ??
      definition.interactionId ??
      definition.id ??
      `${fallbackPrefix}_${slugText(definition.label ?? definition.target_id ?? 'scene')}`
  );
}

function targetId(definition) {
  return cleanText(definition.target_id ?? definition.targetId ?? definition.affordance_id);
}

function labelForDefinition(definition, fallback = 'Closer look') {
  return cleanText(definition.label ?? definition.target_label ?? definition.title) || fallback;
}

export function getExplorationInteractionDefinitions(overlayOrScene = {}) {
  const metadata = normalizeObject(overlayOrScene.metadata ?? overlayOrScene.metadata_json);
  return {
    interaction_model:
      cleanText(overlayOrScene.interaction_model ?? metadata.interaction_model) ||
      'surface_focus_commit',
    automatic_observations: normalizeArray(
      overlayOrScene.automatic_observations ?? metadata.automatic_observations
    ),
    passive_discoveries: normalizeArray(
      overlayOrScene.passive_discoveries ?? metadata.passive_discoveries
    ),
    free_focus: normalizeArray(overlayOrScene.free_focus ?? metadata.free_focus),
    beat_actions: normalizeArray(overlayOrScene.beat_actions ?? metadata.beat_actions),
  };
}

function knownKnowledgeKeys(knownFacts = []) {
  return new Set(
    normalizeArray(knownFacts)
      .map((fact) => cleanText(fact.knowledge_id ?? fact.knowledge_key))
      .filter(Boolean)
  );
}

function visibleTargetIds(sceneReference = {}, visibleAffordances = []) {
  const ids = new Set();
  for (const target of normalizeArray(sceneReference.action_targets)) {
    if (target.id) {
      ids.add(cleanText(target.id));
      ids.add(cleanText(target.id).replace(/^npc:/, ''));
    }
  }
  for (const affordance of normalizeArray(visibleAffordances)) {
    if (affordance.affordance_id ?? affordance.affordanceId) {
      ids.add(cleanText(affordance.affordance_id ?? affordance.affordanceId));
    }
  }
  return ids;
}

function requirementMet(requirement, { knownFacts = [], sceneState = {} } = {}) {
  const key = cleanText(requirement);
  if (!key) {
    return true;
  }
  if (knownKnowledgeKeys(knownFacts).has(key)) {
    return true;
  }
  const state = normalizeObject(sceneState?.state_json ?? sceneState);
  return Boolean(state[key]);
}

function definitionIsVisible(definition, context = {}) {
  const visibility = normalizeObject(definition.visibility);
  if (visibility.hidden === true || definition.hidden === true) {
    return false;
  }

  const required = normalizeArray(
    visibility.requires ?? definition.requires ?? definition.requires_knowledge
  );
  if (required.some((requirement) => !requirementMet(requirement, context))) {
    return false;
  }

  const blocked = normalizeArray(visibility.forbidden ?? definition.forbidden);
  if (blocked.some((requirement) => requirementMet(requirement, context))) {
    return false;
  }

  const target = targetId(definition);
  if (!target || visibility.always_visible === true) {
    return true;
  }

  return visibleTargetIds(context.sceneReference, context.visibleAffordances).has(target);
}

function checkDefinition(definition) {
  const check = normalizeObject(definition.check);
  if (Object.keys(check).length === 0 && !definition.requires_check) {
    return null;
  }
  return {
    ...check,
    mode: cleanText(check.mode ?? definition.check_mode ?? 'standard'),
    skill: cleanText(check.skill ?? definition.skill),
    ability: cleanText(check.ability ?? definition.ability),
    dc: Number(check.dc ?? check.difficulty_class ?? definition.dc ?? definition.difficulty_class),
    visibility: normalizeCheckVisibility(
      check.visibility ?? definition.check_visibility,
      definition.resolution_mode === 'passive_discovery' ? 'success_only' : 'visible'
    ),
  };
}

function skillDefinition(check) {
  const skillSlug = cleanText(check?.skill).toLowerCase().replaceAll('_', '-');
  const dc = Number(check?.dc);
  if (!skillSlug || !Number.isFinite(dc)) {
    throw createHttpError('This exploration check is missing skill or DC metadata', 409);
  }
  return {
    skill: {
      slug: skillSlug,
      name: titleCase(skillSlug),
    },
    difficulty_class: dc,
  };
}

function resolveCheck({ definition, characterRules, rollOverride = null }) {
  const check = checkDefinition(definition);
  if (!check) {
    return null;
  }

  const mode = normalizeCheckResolution(
    check.mode === 'active' ? 'standard' : check.mode,
    'standard'
  );
  const baseDefinition = skillDefinition(check);

  if (mode === 'passive') {
    const result = resolveNarrativeSkillCheck(baseDefinition, characterRules, { roll: 10 });
    return { ...result, check_mode: 'passive', check_visibility: check.visibility };
  }

  if (mode === 'take_20') {
    const result = resolveNarrativeSkillCheck(baseDefinition, characterRules, { roll: 20 });
    return { ...result, check_mode: 'take_20', check_visibility: check.visibility };
  }

  if (mode === 'advantage') {
    const firstRoll = Array.isArray(rollOverride) ? rollOverride[0] : null;
    const secondRoll = Array.isArray(rollOverride) ? rollOverride[1] : null;
    const first = resolveNarrativeSkillCheck(baseDefinition, characterRules, { roll: firstRoll });
    const second = resolveNarrativeSkillCheck(baseDefinition, characterRules, { roll: secondRoll });
    const best = first.total_value >= second.total_value ? first : second;
    return {
      ...best,
      check_mode: 'advantage',
      check_visibility: check.visibility,
      roll_options: [first.roll_value, second.roll_value],
    };
  }

  const result = resolveNarrativeSkillCheck(baseDefinition, characterRules, {
    roll: Array.isArray(rollOverride) ? rollOverride[0] : rollOverride,
  });
  return {
    ...result,
    check_mode: mode === 'hidden' || mode === 'gm_roll' ? mode : 'standard',
    check_visibility: check.visibility,
  };
}

function outcomeFor(definition, checkResult) {
  if (!checkResult) {
    const result = normalizeObject(definition.result);
    return {
      wasSuccess: true,
      narration:
        cleanText(result.narration ?? definition.narration) ||
        'Nothing more stands out right now.',
      summary: cleanText(result.summary ?? definition.summary) || null,
      knowledgeGrants: normalizeArray(result.knowledge_grants ?? definition.knowledge_grants),
      stateChanges: normalizeArray(result.state_changes ?? definition.state_changes),
    };
  }

  const wasSuccess = checkResult.was_success === true;
  const branch = normalizeObject(wasSuccess ? definition.on_success : definition.on_failure);
  return {
    wasSuccess,
    narration:
      cleanText(branch.narration) ||
      (wasSuccess
        ? 'You notice the clearest detail available here.'
        : 'You do not learn anything more from a closer look.'),
    summary: cleanText(branch.summary) || null,
    knowledgeGrants: normalizeArray(branch.knowledge_grants),
    stateChanges: normalizeArray(branch.state_changes),
  };
}

function checkOutcomeLabel(checkResult) {
  return checkResult?.was_success === true ? 'success' : 'failure';
}

function mechanicsLabel(checkResult, visibility) {
  if (!checkResult) {
    return null;
  }
  if (visibility === 'hidden' || visibility === 'narrative_only') {
    return null;
  }
  if (visibility === 'success_only' && checkResult.was_success !== true) {
    return null;
  }
  const prefix =
    checkResult.check_mode === 'passive'
      ? `Passive ${checkResult.skill?.name ?? titleCase(checkResult.skill?.slug)}`
      : `${checkResult.skill?.name ?? titleCase(checkResult.skill?.slug)} check`;
  return `${prefix}: ${checkOutcomeLabel(checkResult)}`;
}

function publicCheckResult(checkResult, visibility) {
  if (!checkResult || visibility === 'hidden') {
    return {};
  }
  if (visibility === 'success_only' && checkResult.was_success !== true) {
    return { check_visibility: visibility, visible: false };
  }
  return {
    skill: checkResult.skill,
    check_mode: checkResult.check_mode,
    check_visibility: visibility,
    outcome: checkOutcomeLabel(checkResult),
    visible: visibility !== 'hidden',
  };
}

function mapStoredResult(row, definition = null, currentSceneStateVersion = null) {
  if (!row) {
    return null;
  }

  const visibility = normalizeCheckVisibility(row.check_visibility, 'visible');
  const checkResult = normalizeObject(row.check_result_json);
  const effectiveStatus =
    currentSceneStateVersion &&
    row.scene_state_version !== currentSceneStateVersion &&
    row.status === 'current_viewed'
      ? 'stale_viewed'
      : row.status;

  return {
    interaction_result_id: String(row.id),
    interaction_id: row.interaction_id,
    target_id: row.target_id,
    label: definition ? labelForDefinition(definition) : row.interaction_id,
    status: effectiveStatus,
    is_viewed: true,
    is_stale: effectiveStatus === 'stale_viewed',
    is_expired: effectiveStatus === 'expired',
    mechanics_label: mechanicsLabel(checkResult, visibility),
    narration: row.result_narration,
    summary: row.result_summary,
    check: publicCheckResult(checkResult, visibility),
    check_visibility: visibility,
    knowledge_grants_applied: row.knowledge_grants_applied_json ?? [],
    canonical_event_id: row.canonical_event_id ? String(row.canonical_event_id) : null,
    resolved_at: row.resolved_at,
  };
}

function safeCheckPreview(definition, fallbackVisibility = 'visible') {
  const check = checkDefinition(definition);
  if (!check) {
    return { has_check: false, label: null, visibility: fallbackVisibility };
  }
  const visibility = normalizeCheckVisibility(check.visibility, fallbackVisibility);
  if (visibility === 'hidden') {
    return { has_check: true, label: null, visibility };
  }
  return {
    has_check: true,
    label: check.skill ? `${titleCase(check.skill)} check` : 'Check',
    visibility,
  };
}

function expirationMatches(definition, sceneState) {
  const rules = normalizeArray(definition.expires_when);
  if (rules.length === 0) {
    return false;
  }
  const state = normalizeObject(sceneState?.state_json ?? sceneState);
  return rules.some((rule) => {
    const key = cleanText(rule.state ?? rule.key ?? rule.field);
    if (!key) {
      return false;
    }
    const actual = key.split('.').reduce((value, part) => normalizeObject(value)[part], state);
    if (rule.operator === 'gte') {
      return String(actual) >= String(rule.value);
    }
    if (rule.operator === 'eq' || !rule.operator) {
      return actual === rule.value;
    }
    return false;
  });
}

async function listLatestResultsByInteraction({
  campaignId,
  characterId,
  sceneId,
  resolutionMode,
  interactionIds,
}) {
  if (interactionIds.length === 0) {
    return new Map();
  }
  await ensureExplorationInteractionSchema();
  const result = await query(
    `
      SELECT DISTINCT ON (interaction_id) *
      FROM dnd5e_character_exploration_interaction_result
      WHERE campaign_id = $1
        AND character_id = $2
        AND scene_id = $3
        AND resolution_mode = $4
        AND interaction_id = ANY($5::text[])
      ORDER BY interaction_id, resolved_at DESC, id DESC
    `,
    [campaignId, characterId, sceneId, resolutionMode, interactionIds]
  );
  return new Map(result.rows.map((row) => [row.interaction_id, row]));
}

function sortCloserLookCards(cards) {
  const groupRank = (card) => {
    if (card.status === 'unopened' && card.is_available) {
      return card.objective_relevant ? 0 : 1;
    }
    if (card.status === 'stale_viewed') {
      return 2;
    }
    if (card.status === 'current_viewed') {
      return 3;
    }
    return 4;
  };

  return cards.sort((left, right) => {
    const leftGroup = groupRank(left);
    const rightGroup = groupRank(right);
    if (leftGroup !== rightGroup) {
      return leftGroup - rightGroup;
    }
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    return left.label.localeCompare(right.label);
  });
}

export async function listCloserLooksForScene({
  campaignId,
  characterId,
  sceneId,
  sceneState,
  definitions,
  knownFacts = [],
  sceneReference = {},
  visibleAffordances = [],
  actionStatus = {},
}) {
  const freeFocus = normalizeArray(definitions?.free_focus);
  const visibleDefinitions = freeFocus
    .map((definition) => ({
      ...definition,
      resolution_mode: 'free_focus',
      interaction_id: interactionId(definition, 'focus'),
    }))
    .filter((definition) =>
      definitionIsVisible(definition, { knownFacts, sceneState, sceneReference, visibleAffordances })
    );
  const currentVersion = sceneStateVersion(sceneState);
  const latestRows = await listLatestResultsByInteraction({
    campaignId,
    characterId,
    sceneId,
    resolutionMode: 'free_focus',
    interactionIds: visibleDefinitions.map((definition) => definition.interaction_id),
  });
  const hasSubmittedAction = actionStatus?.state === 'action_submitted';

  const cards = visibleDefinitions.map((definition) => {
    const row = latestRows.get(definition.interaction_id) ?? null;
    const viewed = Boolean(row);
    const expired = expirationMatches(definition, sceneState);
    const mapped = row ? mapStoredResult(row, definition, currentVersion) : null;
    const status = expired
      ? 'expired'
      : mapped?.status ?? 'unopened';
    const available = !expired && (!hasSubmittedAction || viewed);
    return {
      interaction_id: definition.interaction_id,
      target_id: targetId(definition) || null,
      label: labelForDefinition(definition),
      status,
      priority: Number(definition.priority ?? 0),
      objective_relevant: definition.objective_relevant === true,
      is_available: available,
      is_viewed: viewed,
      is_stale: status === 'stale_viewed',
      is_expired: expired,
      unavailable_reason: available
        ? null
        : hasSubmittedAction && !viewed
          ? 'Withdraw your submitted action to look closer.'
          : 'This closer look is not available right now.',
      result: mapped
        ? {
            mechanics_label: mapped.mechanics_label,
            narration: mapped.narration,
            summary: mapped.summary,
            check: mapped.check,
            knowledge_grants_applied: mapped.knowledge_grants_applied,
            resolved_at: mapped.resolved_at,
          }
        : null,
      check_preview: safeCheckPreview(definition, 'visible'),
      committed_followup: {
        enabled: definition.committed_followup?.enabled !== false,
        check_resolution: normalizeCheckResolution(
          definition.committed_followup?.check_resolution,
          'advantage'
        ),
        beat_action_type: cleanText(definition.committed_followup?.beat_action_type) || null,
      },
      aliases: normalizeArray(definition.aliases).map(cleanText).filter(Boolean),
    };
  });

  return sortCloserLookCards(cards);
}

async function createCanonicalEventIfNeeded({
  campaignId,
  worldInstanceId,
  characterId,
  sceneId,
  accountId,
  definition,
  resolutionMode,
  outcome,
  checkResult,
  executor,
}) {
  if (outcome.knowledgeGrants.length === 0 && outcome.stateChanges.length === 0) {
    return null;
  }

  const label = labelForDefinition(definition);
  const interactionKey = interactionId(definition, resolutionMode);
  const eventPayload = {
    event_type: resolutionMode,
    interaction_id: interactionKey,
    target_id: targetId(definition) || null,
    label,
    outcome: checkResult ? checkOutcomeLabel(checkResult) : 'observed',
    knowledge_grants: outcome.knowledgeGrants,
    state_changes: outcome.stateChanges,
  };

  let worldEvent = null;
  if (worldInstanceId) {
    const worldEventResult = await executor.query(
      `
        INSERT INTO dnd5e_world_event (
          world_instance_id,
          campaign_id,
          actor_character_id,
          event_type,
          scene_id,
          location_id,
          interaction_id,
          event_payload_json,
          state_changes_json,
          knowledge_granted_json,
          created_by_kind,
          created_by_account_id,
          metadata_json
        )
        VALUES ($1, $2, $3, 'interaction_resolved', $4, NULL, NULL, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb)
        RETURNING *
      `,
      [
        worldInstanceId,
        campaignId,
        characterId,
        sceneId ?? null,
        JSON.stringify(eventPayload),
        JSON.stringify(outcome.stateChanges),
        JSON.stringify(
          outcome.knowledgeGrants
            .map((grant) =>
              cleanText(typeof grant === 'string' ? grant : grant.knowledge_id ?? grant.knowledge_key)
            )
            .filter(Boolean)
        ),
        accountId ? 'user' : 'system',
        accountId ?? null,
        JSON.stringify({
          source_resolution_mode: resolutionMode,
          source_interaction_id: interactionKey,
          source: 'surface_focus_commit',
        }),
      ]
    );
    worldEvent = worldEventResult.rows[0] ?? null;
  }

  const campaignLogEvent = await recordCampaignLog(
    {
      campaign_id: campaignId,
      character_id: characterId,
      actor_account_id: accountId ?? null,
      log_type:
        resolutionMode === 'free_focus'
          ? outcome.stateChanges.length > 0
            ? 'free_focus_state_change'
            : 'free_focus_discovery'
          : resolutionMode,
      message:
        resolutionMode === 'free_focus'
          ? `Closer look resolved: ${label}.`
          : `${titleCase(resolutionMode)} resolved: ${label}.`,
      data_json: {
        ...eventPayload,
        world_event_id: worldEvent?.id ? String(worldEvent.id) : null,
      },
    },
    executor
  );

  await recordGameplayHistory(
    {
      character_id: characterId,
      actor_account_id: accountId ?? null,
      source_type: 'narrative',
      source_entity_id: campaignLogEvent.id,
      action_key: `${resolutionMode}:${interactionKey}`,
      summary: outcome.summary || outcome.narration,
      input_json: {
        interaction_id: interactionKey,
        target_id: targetId(definition) || null,
      },
      result_json: {
        narration: outcome.narration,
        knowledge_grants: outcome.knowledgeGrants,
        state_changes: outcome.stateChanges,
        world_event_id: worldEvent?.id ? String(worldEvent.id) : null,
      },
    },
    executor
  );

  return { campaignLogEvent, worldEvent };
}

async function applyKnowledgeGrants({
  characterId,
  worldInstanceId,
  campaignId,
  sourceEventId,
  grants,
  definition,
  executor,
}) {
  const applied = [];
  for (const grant of grants) {
    const knowledgeId = cleanText(typeof grant === 'string' ? grant : grant.knowledge_id ?? grant.knowledge_key);
    if (!knowledgeId) {
      continue;
    }
    const knowledge = await grantKnowledge(
      {
        characterId,
        worldInstanceId,
        campaignId,
        knowledgeId,
        sourceEventId,
        confidence: typeof grant === 'object' ? grant.confidence ?? 'observed' : 'observed',
        status: typeof grant === 'object' ? grant.status ?? 'known' : 'known',
        metadata: {
          source_interaction_id: interactionId(definition, definition.resolution_mode),
          source_resolution_mode: definition.resolution_mode,
          target_id: targetId(definition) || null,
          ...(typeof grant === 'object' ? normalizeObject(grant.metadata) : {}),
        },
        fallback: typeof grant === 'object' ? grant : {},
      },
      executor
    );
    applied.push(knowledge.knowledge_id);
  }
  return applied;
}

async function applyStateChanges({
  worldInstanceId,
  campaignId,
  sceneId,
  characterId,
  sourceEventId,
  changes,
  executor,
}) {
  const applied = [];
  const scenePatch = {};

  for (const change of changes) {
    const normalized = normalizeObject(change);
    const targetType = cleanText(normalized.target_type ?? normalized.targetType ?? 'scene');
    const field = cleanText(normalized.field ?? normalized.state_key ?? normalized.key);
    if (targetType !== 'scene' || !field) {
      continue;
    }
    scenePatch[field] = normalized.value;
    applied.push({ target_type: 'scene', field, value: normalized.value });
  }

  if (Object.keys(scenePatch).length > 0) {
    await setSceneState(
      {
        worldInstanceId,
        campaignId,
        sceneId,
        patch: {
          ...scenePatch,
          last_surface_focus_commit_event_id: sourceEventId ? String(sourceEventId) : null,
          last_surface_focus_commit_character_id: String(characterId),
        },
      },
      executor
    );
  }

  return applied;
}

async function persistExplorationResult({
  campaignId,
  worldInstanceId,
  characterId,
  sceneId,
  accountId = null,
  sceneState,
  definition,
  resolutionMode,
  characterRules,
  rollOverride = null,
  executor,
}) {
  const normalizedDefinition = {
    ...definition,
    resolution_mode: resolutionMode,
    interaction_id: interactionId(definition, resolutionMode),
  };
  const currentSceneStateVersion = sceneStateVersion(sceneState);
  const currentTargetStateVersion = targetStateVersion(definition);

  const existing = await executor.query(
    `
      SELECT *
      FROM dnd5e_character_exploration_interaction_result
      WHERE campaign_id = $1
        AND character_id = $2
        AND scene_id = $3
        AND interaction_id = $4
        AND resolution_mode = $5
        AND scene_state_version = $6
        AND target_state_version = $7
      FOR UPDATE
    `,
    [
      campaignId,
      characterId,
      sceneId,
      normalizedDefinition.interaction_id,
      resolutionMode,
      currentSceneStateVersion,
      currentTargetStateVersion,
    ]
  );
  if (existing.rows[0]) {
    return mapStoredResult(existing.rows[0], normalizedDefinition, currentSceneStateVersion);
  }

  const checkResult = resolveCheck({
    definition: normalizedDefinition,
    characterRules,
    rollOverride,
  });
  const visibility = normalizeCheckVisibility(
    checkResult?.check_visibility ?? checkDefinition(normalizedDefinition)?.visibility,
    resolutionMode === 'passive_discovery' ? 'success_only' : 'visible'
  );
  const outcome = outcomeFor(normalizedDefinition, checkResult);

  const event = await createCanonicalEventIfNeeded({
    campaignId,
    worldInstanceId,
    characterId,
    sceneId,
    accountId,
    definition: normalizedDefinition,
    resolutionMode,
    outcome,
    checkResult,
    executor,
  });
  const sourceCampaignLogId = event?.campaignLogEvent?.id ?? null;
  const sourceWorldEventId = event?.worldEvent?.id ?? null;
  const knowledgeApplied = await applyKnowledgeGrants({
    characterId,
    worldInstanceId,
    campaignId,
    sourceEventId: sourceWorldEventId,
    grants: outcome.knowledgeGrants,
    definition: normalizedDefinition,
    executor,
  });
  const stateApplied = await applyStateChanges({
    worldInstanceId,
    campaignId,
    sceneId,
    characterId,
    sourceEventId: sourceWorldEventId,
    changes: outcome.stateChanges,
    executor,
  });

  const result = await executor.query(
    `
      INSERT INTO dnd5e_character_exploration_interaction_result (
        campaign_id,
        world_instance_id,
        character_id,
        scene_id,
        target_id,
        interaction_id,
        interaction_version,
        resolution_mode,
        scene_state_version,
        target_state_version,
        status,
        check_result_json,
        check_visibility,
        result_narration,
        result_summary,
        knowledge_grants_applied_json,
        state_changes_applied_json,
        canonical_event_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12::jsonb, $13, $14, $15,
        $16::jsonb, $17::jsonb, $18
      )
      RETURNING *
    `,
    [
      campaignId,
      worldInstanceId,
      characterId,
      sceneId,
      targetId(normalizedDefinition) || null,
      normalizedDefinition.interaction_id,
      definitionVersion(normalizedDefinition),
      resolutionMode,
      currentSceneStateVersion,
      currentTargetStateVersion,
      'current_viewed',
      JSON.stringify(checkResult ?? {}),
      visibility,
      outcome.narration,
      outcome.summary,
      JSON.stringify(knowledgeApplied),
      JSON.stringify(stateApplied),
      sourceCampaignLogId,
    ]
  );

  return mapStoredResult(result.rows[0], normalizedDefinition, currentSceneStateVersion);
}

function visibleSurfaceParagraph(definition) {
  const text = cleanText(definition.narration ?? definition.text ?? definition.summary);
  return text ? { kind: 'automatic_observation', text } : null;
}

function visiblePassiveParagraph(result, definition) {
  if (!result?.narration) {
    return null;
  }
  const visibility = normalizeCheckVisibility(result.check_visibility, 'success_only');
  const check = normalizeObject(result.check);
  if (visibility === 'hidden') {
    return null;
  }
  if (visibility === 'success_only' && check.visible === false) {
    return null;
  }
  return {
    kind: 'passive_discovery',
    text: result.narration,
  };
}

export async function resolveSurfaceInteractionsForNarration({
  campaignId,
  worldInstanceId,
  characterId,
  sceneId,
  sceneState,
  definitions,
  knownFacts = [],
  sceneReference = {},
  visibleAffordances = [],
}) {
  await ensureExplorationInteractionSchema();
  const characterRules = await getCharacterRules(characterId);
  const automatic = [];
  const passive = [];

  await withTransaction(async (client) => {
    for (const definition of normalizeArray(definitions?.automatic_observations)) {
      if (!definitionIsVisible(definition, { knownFacts, sceneState, sceneReference, visibleAffordances })) {
        continue;
      }
      const paragraph = visibleSurfaceParagraph(definition);
      if (paragraph) {
        automatic.push(paragraph);
      }
      const grants = normalizeArray(definition.knowledge_grants);
      const stateChanges = normalizeArray(definition.state_changes);
      if (grants.length > 0 || stateChanges.length > 0) {
        await persistExplorationResult({
          campaignId,
          worldInstanceId,
          characterId,
          sceneId,
          sceneState,
          definition,
          resolutionMode: 'automatic_observation',
          characterRules,
          executor: client,
        });
      }
    }

    for (const definition of normalizeArray(definitions?.passive_discoveries)) {
      if (!definitionIsVisible(definition, { knownFacts, sceneState, sceneReference, visibleAffordances })) {
        continue;
      }
      const result = await persistExplorationResult({
        campaignId,
        worldInstanceId,
        characterId,
        sceneId,
        sceneState,
        definition,
        resolutionMode: 'passive_discovery',
        characterRules,
        executor: client,
      });
      const paragraph = visiblePassiveParagraph(result, definition);
      if (paragraph) {
        passive.push(paragraph);
      }
    }
  });

  return {
    automatic_observations: automatic,
    passive_discoveries: passive,
  };
}

export async function resolveFreeFocusForAccount(accountId, input = {}) {
  await ensureExplorationInteractionSchema();
  const { getCharacterSceneView } = await import('./characterSceneViewService.js');
  const sceneView = await getCharacterSceneView({
    accountId,
    includeDebug: false,
    includeMechanics: true,
  });

  if (sceneView.state !== 'active' || !sceneView.scene) {
    throw createHttpError('No active scene is available right now.', 409);
  }

  const requestedSceneId = cleanText(input.scene_id ?? input.sceneId);
  if (requestedSceneId && requestedSceneId !== cleanText(sceneView.scene.sceneId ?? sceneView.scene.scene_id)) {
    throw createHttpError('That closer look is not available in the current scene.', 409);
  }

  const overlay = await getSceneContentOverlay(sceneView.scene);
  const definitions = getExplorationInteractionDefinitions({
    ...overlay,
    ...normalizeObject(sceneView.scene?.metadata),
  });
  const requestedInteractionId = cleanText(input.interaction_id ?? input.interactionId);
  const definition = normalizeArray(definitions.free_focus)
    .map((entry) => ({ ...entry, interaction_id: interactionId(entry, 'focus') }))
    .find((entry) => entry.interaction_id === requestedInteractionId);

  if (!definition) {
    throw createHttpError('That closer look is not available here.', 404);
  }

  const card = (sceneView.scene_reference?.closer_looks ?? []).find(
    (entry) => entry.interaction_id === requestedInteractionId
  );
  if (!card || card.is_available !== true) {
    throw createHttpError(
      card?.unavailable_reason ?? 'That closer look is not available right now.',
      409
    );
  }

  const characterRules = await getCharacterRules(Number(sceneView.character_id));
  const result = await withTransaction(async (client) =>
    persistExplorationResult({
      campaignId: Number(sceneView.campaign_instance_id),
      worldInstanceId: Number(sceneView.world_instance_id),
      characterId: Number(sceneView.character_id),
      sceneId: Number(sceneView.scene.scene_id),
      accountId,
      sceneState: sceneView.scene?.state ?? {},
      definition,
      resolutionMode: 'free_focus',
      characterRules,
      executor: client,
    })
  );

  return {
    free_focus_result: result,
    action_window_context_version: Date.now(),
    full_scene_narration_recomposed: false,
  };
}

export function findFreeFocusOverlap({ rawText, selectedAffordanceId, preview, closerLooks = [] }) {
  const text = cleanText(rawText).toLowerCase();
  const shallow = /\b(look|inspect|examine|check|study|search|focus|observe|investigate)\b/.test(text);
  if (!shallow && !selectedAffordanceId) {
    return null;
  }

  const candidate = preview?.status === 'resolved' ? preview.candidate : null;
  const candidateTarget = cleanText(candidate?.target_affordance_id);
  const candidateLabel = cleanText(candidate?.target_label).toLowerCase();
  const selected = cleanText(selectedAffordanceId);

  const overlap = normalizeArray(closerLooks).find((card) => {
    if (
      card.is_available !== true ||
      card.is_expired === true ||
      card.committed_followup?.enabled === false
    ) {
      return false;
    }
    const ids = [card.interaction_id, card.target_id].map(cleanText).filter(Boolean);
    if ((candidateTarget && ids.includes(candidateTarget)) || (selected && ids.includes(selected))) {
      return true;
    }
    const labels = [card.label, ...(card.aliases ?? [])].map((entry) => cleanText(entry).toLowerCase());
    return labels.some((label) => label && (candidateLabel === label || text.includes(label)));
  });

  if (!overlap) {
    return null;
  }

  const resolution = normalizeCheckResolution(overlap.committed_followup?.check_resolution, 'advantage');
  const resolutionText =
    resolution === 'take_20'
      ? 'letting your character take enough time to resolve it thoroughly'
      : resolution === 'standard'
        ? 'giving a standard check'
        : 'giving advantage on the check';

  return {
    interaction_id: overlap.interaction_id,
    target_id: overlap.target_id,
    label: overlap.label,
    is_viewed: overlap.is_viewed === true,
    check_resolution: resolution,
    message: `${overlap.label} has a Closer Look available${overlap.is_viewed === true ? ' and can still become your committed action' : ''}.\n\nOpening it does not spend your beat. If you continue as your beat action, your character will spend more time and attention on it, ${resolutionText}.`,
    options: ['open_closer_look', 'continue_as_beat_action', 'edit_action'],
  };
}
