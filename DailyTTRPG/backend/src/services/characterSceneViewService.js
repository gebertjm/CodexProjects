import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { listKnowledgeForCharacter } from './characterKnowledgeService.js';
import { assembleEnvironmentDescription } from './environmentDescriptionService.js';
import { ensureLivingWorldSchema } from './livingWorldSchema.js';
import { listNpcPresenceForScene } from './npcPresenceService.js';
import { listSceneResultFeed } from './playerBeatResultService.js';
import { getRuntimeContent } from './runtimeContentService.js';
import { ensureActionComposerSchema } from './actionComposerSchema.js';
import { ensureExplorationInteractionSchema } from './explorationInteractionSchema.js';
import {
  getExplorationInteractionDefinitions,
  listCloserLooksForScene,
  resolveSurfaceInteractionsForNarration,
} from './freeFocusService.js';
import { getSceneContentOverlay } from './sceneContentOverlayService.js';
import {
  getCampaignWorldInstance,
  getSceneState,
  listAvailableAffordances,
} from './worldStateService.js';
import {
  getSubmissionForActionWindow,
  getWebActionRuntimeConfig,
} from './webActionSubmissionService.js';
import { isActionWindowOpenForPlayer } from './beatWindowTimingService.js';
import {
  buildActionComposerModel,
  buildSceneReference,
  composeSceneNarration,
} from './sceneNarrationComposer.js';
import { getDialogueFocusCommitEntryForNpc } from './dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import {
  buildGreyvaleSliceEndpointActionStatus,
  getGreyvaleSliceEndpointState,
} from './greyvaleSliceEndpointService.js';

function compact(values) {
  return values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function titleCase(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim() !== '')?.trim() ?? null;
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function compactUnique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = cleanText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(text);
  }
  return output;
}

function primaryActionType(affordance) {
  const available = affordance.available_actions ?? [];
  const firstAction = available.find(Boolean);
  return cleanText(
    affordance.action_type ??
      firstAction?.verb ??
      firstAction?.action_type ??
      affordance.actions?.[0] ??
      ''
  );
}

function stripActionPrefix(label, actionType = '') {
  const text = cleanText(label);
  if (!text) {
    return text;
  }

  const patterns = [
    /^(?:talk|speak|converse|chat)\s+(?:to|with)\s+/i,
    /^(?:ask|question|interview|approach)\s+/i,
    /^(?:continue|head|go|travel|move|walk|return)\s+(?:back\s+)?(?:to|toward|towards|into|onto|along)\s+/i,
    /^(?:enter|leave for|take the road to)\s+/i,
    /^(?:inspect|examine|investigate|search|check|study|follow|look at|look over)\s+(?:the|a|an)?\s*/i,
  ];

  const actionSpecificPatterns = {
    talk_to_npc: [/^(?:talk|speak|converse|chat)\s+(?:to|with)\s+/i],
    move_scene: [
      /^(?:continue|head|go|travel|move|walk|return)\s+(?:back\s+)?(?:to|toward|towards|into|onto|along)\s+/i,
      /^(?:enter|leave for|take the road to)\s+/i,
    ],
    enter_scene: [/^(?:enter|start at|begin at)\s+/i],
  };

  const candidates = [...(actionSpecificPatterns[actionType] ?? []), ...patterns];
  for (const pattern of candidates) {
    const stripped = text.replace(pattern, '').trim();
    if (stripped && stripped !== text) {
      return stripped;
    }
  }

  return text;
}

function normalizeIdentityPhrase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\b(?:a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedId(value) {
  return cleanText(value).toLowerCase();
}

function npcIdentityMatchForLabel(label, npcIdentityIndex = []) {
  const normalizedLabel = normalizeIdentityPhrase(label);
  if (!normalizedLabel) {
    return null;
  }

  return (
    (npcIdentityIndex ?? []).find((entry) =>
      (entry.match_terms ?? []).some((term) => {
        const normalizedTerm = normalizeIdentityPhrase(term);
        return normalizedTerm && normalizedTerm === normalizedLabel;
      })
    ) ?? null
  );
}

function visibleNpcForAffordance(affordance, visibleNpcs = []) {
  const id = cleanText(affordance.affordance_id ?? affordance.affordance_key);
  const candidates = compactUnique([
    affordance.npc_id,
    affordance.npcId,
    affordance.payload?.npc_key,
    affordance.payload?.npc_id,
    affordance.source?.key,
    affordance.source?.npc_key,
    affordance.runtime_source?.key,
    affordance.runtime_source?.npc_key,
    affordance.metadata?.payload?.npc_key,
    affordance.metadata?.payload?.npc_id,
    affordance.metadata?.source?.key,
    affordance.metadata?.source?.npc_key,
    id.startsWith('npc:') ? id.slice('npc:'.length) : null,
    id.startsWith('talk_to_npc:') ? id.slice('talk_to_npc:'.length) : null,
    id.startsWith('start_combat:') ? id.slice('start_combat:'.length) : null,
  ]).map(normalizedId);

  if (candidates.length === 0) {
    return null;
  }

  return (
    visibleNpcs.find((npc) =>
      candidates.includes(normalizedId(npc.npc_id ?? npc.npcId ?? npc.key))
    ) ?? null
  );
}

function characterSafeAffordanceLabel(affordance, visibleNpcs = [], npcIdentityIndex = []) {
  const actionType = primaryActionType(affordance);
  const npc = visibleNpcForAffordance(affordance, visibleNpcs);
  if (npc) {
    return cleanText(npc.display_name ?? npc.displayName);
  }

  const strippedLabel = stripActionPrefix(affordance.label, actionType);
  const identityMatch = npcIdentityMatchForLabel(strippedLabel, npcIdentityIndex);
  if (identityMatch) {
    return cleanText(identityMatch.display_name);
  }

  const metadataLabel = firstText(
    affordance.metadata?.reference_label,
    affordance.metadata?.target_label,
    affordance.metadata?.public_label
  );
  if (metadataLabel) {
    return metadataLabel;
  }

  if (['talk_to_npc', 'start_combat'].includes(actionType)) {
    return actionType === 'start_combat' ? 'a hostile figure' : 'someone nearby';
  }

  return strippedLabel;
}

function characterSafeAffordanceDescription(affordance, visibleNpcs = [], npcIdentityIndex = []) {
  const npc = visibleNpcForAffordance(affordance, visibleNpcs);
  if (npc) {
    return firstText(npc.activity_text, npc.activityText, npc.activity);
  }

  const identityMatch = npcIdentityMatchForLabel(
    stripActionPrefix(affordance.label, primaryActionType(affordance)),
    npcIdentityIndex
  );
  if (identityMatch) {
    const matchedNpc = visibleNpcs.find(
      (entry) => normalizedId(entry.npc_id ?? entry.npcId) === normalizedId(identityMatch.npc_id)
    );
    return firstText(matchedNpc?.activity_text, matchedNpc?.activityText, matchedNpc?.activity);
  }

  if (['talk_to_npc', 'start_combat'].includes(primaryActionType(affordance))) {
    return null;
  }

  return affordanceDescription(affordance, visibleNpcs);
}

function inferAffordanceTypeForPerspective(affordance, visibleNpcs = [], npcIdentityIndex = []) {
  const baseType = inferAffordanceType(affordance);
  if (baseType === 'npc') {
    return baseType;
  }

  const strippedLabel = stripActionPrefix(affordance.label, primaryActionType(affordance));
  return npcIdentityMatchForLabel(strippedLabel, npcIdentityIndex) ? 'npc' : baseType;
}

function inferAffordanceType(affordance) {
  if (affordance.type) {
    return affordance.type;
  }

  const actionType = primaryActionType(affordance);
  if (['talk_to_npc', 'start_combat'].includes(actionType)) {
    return 'npc';
  }
  if (['move_scene', 'enter_scene'].includes(actionType)) {
    return 'exit';
  }

  const tags = new Set((affordance.tags ?? []).map((tag) => String(tag).toLowerCase()));
  const metadataType = affordance.metadata?.type ?? affordance.metadata?.category ?? null;
  if (metadataType) {
    return String(metadataType);
  }

  if (affordance.source === 'npc_presence' || tags.has('npc') || tags.has('person')) {
    return 'npc';
  }
  if (tags.has('clue') || tags.has('evidence')) {
    return 'clue';
  }
  if (tags.has('exit') || tags.has('place') || tags.has('location')) {
    return 'place';
  }
  if (tags.has('hazard') || tags.has('danger')) {
    return 'hazard';
  }
  if (tags.has('object') || tags.has('searchable') || tags.has('investigatable')) {
    return 'object';
  }

  return 'other';
}

function environmentSummary(environment) {
  if (!environment) {
    return null;
  }

  const parts = compact([
    environment.time_of_day ? titleCase(environment.time_of_day) : null,
    environment.weather ? titleCase(environment.weather) : null,
    environment.season ? titleCase(environment.season) : null,
    environment.mood_or_tone ? titleCase(environment.mood_or_tone) : null,
  ]);

  return {
    ...environment,
    summary: parts.length > 0 ? parts.join(' · ') : null,
  };
}

function mapScene(runtime, sceneStateRow, environmentDescription = null) {
  const scene = runtime?.scene?.current_scene ?? runtime?.current_scene ?? null;
  if (!scene) {
    return null;
  }

  const location = scene.location ?? null;

  return {
    scene_id: String(scene.id),
    key: scene.key,
    title: scene.name,
    name: scene.name,
    location_id: location?.id ? String(location.id) : null,
    location_key: location?.key ?? null,
    location_name: location?.name ?? null,
    summary: scene.summary ?? null,
    narration: scene.narration ?? scene.metadata?.narration ?? null,
    description:
      environmentDescription?.description ??
      scene.entry_text ??
      scene.description ??
      scene.summary ??
      runtime?.presentation?.app ??
      runtime?.presentation?.concise ??
      null,
    state: sceneStateRow?.state_json ?? {},
  };
}

function mapObjective(runtime) {
  const objective =
    runtime?.current_objective ??
    runtime?.objectives?.current ??
    runtime?.runtime_state?.current_objective ??
    null;

  if (!objective) {
    return null;
  }

  return {
    objective_id: objective.objective_id ? String(objective.objective_id) : null,
    key: objective.key ?? objective.objective_key ?? null,
    title: objective.title ?? objective.objective_title ?? null,
    status: objective.status ?? null,
  };
}

function mapObjectiveWithKnownProgress(runtime, knownFacts = []) {
  const objective = mapObjective(runtime);
  if (!objective) {
    return null;
  }

  return {
    ...objective,
    known_progress: knownFacts.slice(0, 5).map((fact) => ({
      knowledge_id: fact.knowledge_id,
      type: fact.type,
      text: fact.text ?? fact.public_label,
      confidence: fact.confidence ?? null,
    })),
  };
}

export function mapActionWindow(runtime) {
  const window =
    runtime?.runtime_state?.action_window ??
    runtime?.action_window ??
    runtime?.default_action?.action_window ??
    runtime?.debug?.full_play_state?.action_window ??
    runtime?.play_state?.action_window ??
    null;

  if (!window) {
    return null;
  }

  return {
    action_window_id: window.id ? String(window.id) : null,
    status: window.status ?? null,
    submitted_action: window.submitted_action ?? null,
    submitted_action_interpretation:
      window.submitted_action_interpretation ?? window.interpreted_action ?? null,
    opens_at: window.opens_at ?? null,
    expires_at: window.expires_at ?? null,
    closes_at: window.closes_at ?? window.expires_at ?? null,
    is_open_for_player: isActionWindowOpenForPlayer(window),
  };
}

function mapSubmittedAction(submission) {
  if (!submission) {
    return null;
  }

  if (typeof submission === 'string') {
    return {
      text: submission,
      raw_text: submission,
      editable: false,
    };
  }

  return {
    text: submission.text ?? submission.raw_text ?? null,
    raw_text: submission.raw_text ?? submission.text ?? null,
    verb: submission.verb ?? null,
    target_label: submission.target_label ?? null,
    target_affordance_id: submission.target_affordance_id ?? null,
    target_type: submission.target_type ?? null,
    submitted_at: submission.submitted_at ?? null,
    updated_at: submission.updated_at ?? null,
    editable: submission.editable === true,
    version: submission.version ?? null,
  };
}

function mapActionStatus(runtime, webSubmission = null, runtimeConfig = null) {
  const window = mapActionWindow(runtime);
  const requiresPreview = runtimeConfig?.requires_preview_before_submit !== false;
  const oneActionPolicy = runtimeConfig?.one_action_policy ?? 'hybrid_primary';
  const editingAllowed = runtimeConfig?.allow_action_editing === true;
  const windowOpenForPlayer = window ? isActionWindowOpenForPlayer(window) : false;
  if (!window) {
    return {
      state: 'waiting_for_next_beat',
      label: 'Waiting for next beat',
      description: 'The adventure is active, but no action window is currently open.',
      action_window_id: null,
      submitted_action: null,
      closes_at: null,
      can_submit: false,
      can_edit: false,
      requires_preview_before_submit: requiresPreview,
      one_action_policy: oneActionPolicy,
    };
  }

  const submittedAction = mapSubmittedAction(
    webSubmission
      ? {
          ...webSubmission,
          editable: editingAllowed && windowOpenForPlayer,
        }
      : window.submitted_action
  );

  if (submittedAction?.text) {
    return {
      state: 'action_submitted',
      label: 'Action submitted',
      description: submittedAction.editable === true
        ? 'Action submitted. You may edit it until the next beat begins.'
        : 'Action locked. The next beat is being resolved.',
      action_window_id: window.action_window_id,
      submitted_action: submittedAction,
      submitted_action_interpretation:
        window.submitted_action_interpretation ??
        (submittedAction.verb
          ? {
              verb: submittedAction.verb,
              target_label: submittedAction.target_label,
              target_affordance_id: submittedAction.target_affordance_id,
            }
          : null),
      closes_at: window.closes_at,
      can_submit: false,
      can_edit: submittedAction.editable === true,
      requires_preview_before_submit: requiresPreview,
      one_action_policy: oneActionPolicy,
    };
  }

  if (windowOpenForPlayer) {
    return {
      state: 'action_needed',
      label: 'Action needed',
      description: 'Action window open. Submit your action before the next beat.',
      action_window_id: window.action_window_id,
      submitted_action: null,
      closes_at: window.closes_at,
      can_submit: true,
      can_edit: false,
      requires_preview_before_submit: requiresPreview,
      one_action_policy: oneActionPolicy,
    };
  }

  return {
    state: 'waiting_for_next_beat',
    label: ['closing', 'closed', 'resolving'].includes(String(window.status ?? '').toLowerCase())
      ? 'Action locked'
      : 'Waiting for next beat',
    description: ['closing', 'closed', 'resolving'].includes(String(window.status ?? '').toLowerCase())
      ? 'Action locked. The next beat is being resolved.'
      : 'The adventure is active, but no action is needed right now.',
    action_window_id: window.action_window_id,
    submitted_action: window.submitted_action,
    closes_at: window.closes_at,
    can_submit: false,
    can_edit: false,
    requires_preview_before_submit: requiresPreview,
    one_action_policy: oneActionPolicy,
  };
}

function mapRecentSummary(runtime) {
  const recent =
    runtime?.recent_changes ??
    runtime?.objectives?.recent_progress ??
    runtime?.presentation?.concise?.recent_summary ??
    null;

  const results = Array.isArray(recent?.results)
    ? recent.results
        .map((entry) => {
          const text = firstText(entry?.summary, entry?.text, entry?.description);
          return text
            ? {
                text,
                summary: text,
                created_at: entry?.created_at ?? null,
                source_type: entry?.source_type ?? null,
                action_key: entry?.action_key ?? null,
                scene_id:
                  entry?.scene_id !== undefined && entry?.scene_id !== null
                    ? String(entry.scene_id)
                    : null,
              }
            : null;
        })
        .filter(Boolean)
    : [];

  const latestBeat = firstText(
    results[0]?.text,
    recent?.summary,
    recent?.text,
    recent?.description,
    runtime?.context_summary
  );

  return latestBeat
    ? {
        latest_beat: latestBeat,
        results:
          results.length > 0
            ? results
            : [
                {
                  text: latestBeat,
                  summary: latestBeat,
                  created_at: recent?.created_at ?? null,
                  source_type: recent?.source_type ?? null,
                  action_key: recent?.action_key ?? null,
                  scene_id:
                    recent?.scene_id !== undefined && recent?.scene_id !== null
                      ? String(recent.scene_id)
                      : null,
                },
              ],
      }
    : null;
}

function runtimeOpportunityAffordances(runtime) {
  const rawOpportunities = Array.isArray(runtime?.opportunities)
    ? runtime.opportunities
    : runtime?.opportunities?.primary ?? runtime?.opportunities?.all ?? [];

  return rawOpportunities
    .filter((opportunity) => opportunity && opportunity.action_type)
    .slice(0, 8)
    .map((opportunity) => ({
      affordance_id: opportunity.key,
      label: opportunity.label,
      action_type: opportunity.action_type,
      category: opportunity.category ?? null,
      tags: ['runtime_opportunity'],
      actions: [playerVerbForRuntimeAction(opportunity.action_type)],
      available_actions: [
        {
          verb: playerVerbForRuntimeAction(opportunity.action_type),
          action_key: opportunity.key,
          repeat_policy: opportunity.repeat_policy ?? null,
          interaction_id: opportunity.payload?.interaction_id ?? opportunity.payload?.interaction_key ?? null,
          transition_id: opportunity.payload?.transition_id ?? opportunity.payload?.transition_key ?? null,
          transition_key: opportunity.payload?.transition_key ?? null,
        },
      ],
      state: opportunity.blocked ? 'locked' : 'available',
      source: 'runtime_compatibility_bridge',
      payload: opportunity.payload ?? {},
      runtime_source: opportunity.source ?? {},
      metadata: {
        action_type: opportunity.action_type,
        category: opportunity.category ?? null,
        payload: opportunity.payload ?? {},
        source: opportunity.source ?? {},
      },
    }))
    .filter((affordance) => affordance.state === 'available');
}

function playerVerbForRuntimeAction(actionType) {
  switch (cleanText(actionType)) {
    case 'move_scene':
    case 'enter_scene':
      return 'move';
    case 'talk_to_npc':
      return 'talk';
    case 'scene_interaction':
      return 'investigate';
    default:
      return cleanText(actionType) || 'act';
  }
}

function actionReferenceKey(action = {}) {
  const transitionId = cleanText(action.transition_key ?? action.transition_id);
  if (transitionId) {
    return `transition:${transitionId}`;
  }
  const interactionId = cleanText(action.interaction_id ?? action.interaction_key);
  if (interactionId) {
    return `interaction:${interactionId}`;
  }
  const actionKey = cleanText(action.action_key ?? action.key);
  if (actionKey) {
    return `action:${actionKey}`;
  }
  return null;
}

function actionReferenceKeysForAffordances(affordances = []) {
  const keys = new Set();
  for (const affordance of affordances ?? []) {
    for (const action of affordance.available_actions ?? affordance.actions ?? []) {
      const detail = typeof action === 'string' ? { verb: action } : action;
      const key = actionReferenceKey(detail);
      if (key) {
        keys.add(key);
      }
    }
  }
  return keys;
}

function mergeRuntimeOpportunitiesWithAuthoredAffordances(authoredAffordances = [], runtimeAffordances = []) {
  const authoredKeys = actionReferenceKeysForAffordances(authoredAffordances);
  const filteredRuntime = (runtimeAffordances ?? []).filter((affordance) => {
    const actionKeys = actionReferenceKeysForAffordances([affordance]);
    if (actionKeys.size === 0) {
      return true;
    }
    return [...actionKeys].every((key) => !authoredKeys.has(key));
  });
  return mergeAffordances(authoredAffordances, filteredRuntime);
}

function mergeAffordances(...groups) {
  const merged = [];
  const seen = new Set();

  for (const group of groups) {
    for (const affordance of group ?? []) {
      const key =
        affordance.affordance_id ??
        affordance.affordance_key ??
        `${affordance.source ?? 'unknown'}:${affordance.label}`;
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(affordance);
    }
  }

  return merged;
}

function dialogueEntryForNpcKey(npcKey) {
  const entry = getDialogueFocusCommitEntryForNpc(npcKey);
  return entry?.dialogue_scene_id
    ? {
        dialogue_scene_id: entry.dialogue_scene_id,
        dialogue_scene_slug: entry.dialogue_scene_slug ?? null,
      }
    : null;
}

function explicitNpcReferenceCandidatesForAffordance(affordance) {
  const id = cleanText(affordance?.affordance_id ?? affordance?.affordance_key);
  return compactUnique([
    affordance?.npc_id,
    affordance?.npcId,
    affordance?.npc_key,
    affordance?.npcKey,
    affordance?.metadata?.npc_id,
    affordance?.metadata?.npcId,
    affordance?.metadata?.npc_key,
    affordance?.metadata?.npcKey,
    affordance?.payload?.npc_key,
    affordance?.payload?.npc_id,
    affordance?.source?.type === 'npc' ? affordance?.source?.key : null,
    affordance?.source?.npc_key,
    affordance?.runtime_source?.type === 'npc' ? affordance?.runtime_source?.key : null,
    affordance?.runtime_source?.npc_key,
    affordance?.metadata?.payload?.npc_key,
    affordance?.metadata?.payload?.npc_id,
    affordance?.metadata?.source?.type === 'npc' ? affordance?.metadata?.source?.key : null,
    affordance?.metadata?.source?.npc_key,
    id.startsWith('npc:') ? id.slice('npc:'.length) : null,
    id.startsWith('talk_to_npc:') ? id.slice('talk_to_npc:'.length) : null,
  ]);
}

function isNpcDialogueAffordanceCandidate(affordance) {
  const explicitType = cleanText(affordance?.type).toLowerCase();
  const actionType = primaryActionType(affordance);
  const tags = new Set((affordance?.tags ?? []).map((tag) => cleanText(tag).toLowerCase()));
  return (
    explicitType === 'npc' ||
    explicitType === 'person' ||
    tags.has('npc') ||
    tags.has('person') ||
    tags.has('conversation') ||
    tags.has('dialogue') ||
    ['talk_to_npc', 'start_combat'].includes(actionType)
  );
}

function dialogueEntryForAffordance(affordance, npcIdentityIndex = []) {
  const directCandidates = explicitNpcReferenceCandidatesForAffordance(affordance);
  for (const candidate of directCandidates) {
    const entry = dialogueEntryForNpcKey(candidate);
    if (entry) {
      return entry;
    }
  }

  if (!isNpcDialogueAffordanceCandidate(affordance)) {
    return null;
  }

  const identityCandidates = compactUnique([
    affordance?.label,
    ...(affordance?.aliases ?? []),
  ])
    .map((term) => npcIdentityMatchForLabel(term, npcIdentityIndex)?.npc_id)
    .filter(Boolean);
  for (const candidate of identityCandidates) {
    const entry = dialogueEntryForNpcKey(candidate);
    if (entry) {
      return entry;
    }
  }

  const aliasCandidates = compactUnique([
    affordance?.label,
    ...(affordance?.aliases ?? []),
  ]);
  for (const candidate of aliasCandidates) {
    const entry = dialogueEntryForNpcKey(candidate);
    if (entry) {
      return entry;
    }
  }

  return null;
}

function decorateNpcWithDialogueEntry(npc) {
  const entry = dialogueEntryForNpcKey(npc?.npc_id);
  if (!entry) {
    return npc;
  }
  return {
    ...npc,
    ...entry,
    available_actions: compactUnique([...(npc.available_actions ?? npc.actions ?? []), 'talk']),
    actions: compactUnique([...(npc.actions ?? npc.available_actions ?? []), 'talk']),
  };
}

function decorateAffordanceWithDialogueEntry(affordance, npcIdentityIndex = []) {
  const entry = dialogueEntryForAffordance(affordance, npcIdentityIndex);
  if (!entry) {
    return affordance;
  }
  const availableActions = normalizeArray(affordance.available_actions ?? affordance.actions).map((action) =>
    typeof action === 'string'
      ? {
          verb: action,
          dialogue_scene_id: action === 'talk' ? entry.dialogue_scene_id : null,
        }
      : {
          ...action,
          dialogue_scene_id:
            cleanText(action.verb ?? action.action ?? action.action_type) === 'talk'
              ? entry.dialogue_scene_id
              : action.dialogue_scene_id ?? null,
        }
  );
  if (!availableActions.some((action) => cleanText(action.verb ?? action.action) === 'talk')) {
    availableActions.push({
      verb: 'talk',
      repeat_policy: 'repeatable',
      interaction_id: null,
      transition_id: null,
      dialogue_scene_id: entry.dialogue_scene_id,
    });
  }
  return {
    ...affordance,
    ...entry,
    actions: compactUnique([...(affordance.actions ?? []), 'talk']),
    available_actions: availableActions,
  };
}

async function resolveActiveCharacter(accountId, explicitCharacterId, executor) {
  if (explicitCharacterId) {
    const result = await executor.query(
      `
        SELECT
          character.id,
          character.name,
          character.account_id,
          character.level,
          character.status,
          race.name AS race_name,
          class.name AS class_name
        FROM dnd5e_character character
        LEFT JOIN dnd5e_race race ON race.id = character.race_id
        LEFT JOIN dnd5e_class class ON class.id = character.class_id
        WHERE character.id = $1
          AND character.account_id = $2
          AND character.is_active = TRUE
      `,
      [explicitCharacterId, accountId]
    );
    return result.rows[0] ?? null;
  }

  const result = await executor.query(
    `
      SELECT
        character.id,
        character.name,
        character.account_id,
        character.level,
        character.status,
        race.name AS race_name,
        class.name AS class_name
      FROM account
      JOIN dnd5e_character character ON character.id = account.active_character_id
      LEFT JOIN dnd5e_race race ON race.id = character.race_id
      LEFT JOIN dnd5e_class class ON class.id = character.class_id
      WHERE account.id = $1
        AND character.account_id = account.id
        AND character.is_active = TRUE
      LIMIT 1
    `,
    [accountId]
  );
  return result.rows[0] ?? null;
}

async function resolveActiveCampaign(characterId, explicitCampaignId, executor) {
  const result = await executor.query(
    `
      SELECT
        membership.id AS membership_id,
        membership.campaign_id,
        membership.current_scene_id,
        membership.membership_status,
        campaign.world_id,
        campaign.world_instance_id,
        campaign.name AS campaign_name,
        campaign.slug AS campaign_slug,
        world.slug AS world_slug,
        world.name AS world_name
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      JOIN dnd5e_world world ON world.id = campaign.world_id
      WHERE membership.character_id = $1
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
        AND ($2::bigint IS NULL OR membership.campaign_id = $2)
      ORDER BY membership.is_active_context DESC, membership.is_default_solo_campaign DESC, membership.joined_at DESC NULLS LAST, membership.id DESC
      LIMIT 1
    `,
    [characterId, explicitCampaignId ?? null]
  );

  return result.rows[0] ?? null;
}

async function loadActiveObjective(campaignId, characterId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        objective_state.status,
        objective.id AS objective_id,
        objective.key AS objective_key,
        objective.title AS objective_title
      FROM dnd5e_character_objective objective_state
      JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
      JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
      WHERE quest_state.campaign_id = $1
        AND quest_state.character_id = $2
        AND objective_state.status = 'active'
      ORDER BY objective.sort_order ASC, objective.id ASC
      LIMIT 1
    `,
    [campaignId, characterId]
  );

  return result.rows[0] ?? null;
}

function mapActiveCharacter(character) {
  return {
    character_id: String(character.id),
    name: character.name,
    level: Number(character.level ?? 1),
    species: character.race_name ?? null,
    race: character.race_name ?? null,
    class: character.class_name ?? null,
    status: character.status ?? 'active',
  };
}

function mapCampaign(campaign, worldInstance) {
  return {
    campaign_instance_id: String(campaign.campaign_id),
    campaign_id: String(campaign.campaign_id),
    membership_id: String(campaign.membership_id),
    campaign_name: campaign.campaign_name,
    name: campaign.campaign_name,
    slug: campaign.campaign_slug,
    campaign_slug: campaign.campaign_slug,
    world_instance_id: String(worldInstance.id),
    world_id: campaign.world_slug ?? String(campaign.world_id),
    world_name: campaign.world_name,
  };
}

function summarizeSceneState(knownFacts = []) {
  return knownFacts.slice(0, 4).map((fact) => ({
    label: fact.public_label ?? titleCase(fact.knowledge_id),
    text: fact.text ?? fact.public_label,
  }));
}

function affordanceDescription(affordance, visibleNpcs = []) {
  if (affordance.description) {
    return affordance.description;
  }

  if (affordance.metadata?.description) {
    return affordance.metadata.description;
  }

  if (affordance.metadata?.summary) {
    return affordance.metadata.summary;
  }

  const npcId = affordance.npc_id ?? String(affordance.affordance_id ?? '').replace(/^npc:/, '');
  const npc = visibleNpcs.find((entry) => entry.npc_id === npcId);
  return npc?.activity_text ?? npc?.activity ?? null;
}

export function mapAffordanceForCharacterPerspective(
  affordance,
  visibleNpcs = [],
  npcIdentityIndex = []
) {
  const safeLabel = characterSafeAffordanceLabel(affordance, visibleNpcs, npcIdentityIndex);
  const type = inferAffordanceTypeForPerspective(affordance, visibleNpcs, npcIdentityIndex);
  const safeAliases =
    type === 'npc'
      ? compactUnique([safeLabel])
      : compactUnique([
          safeLabel,
          ...(affordance.aliases ?? []).map((alias) =>
            stripActionPrefix(alias, primaryActionType(affordance))
          ),
        ]);

  return {
    affordance_id: affordance.affordance_id ?? affordance.affordance_key,
    label: safeLabel,
    type,
    description: characterSafeAffordanceDescription(
      affordance,
      visibleNpcs,
      npcIdentityIndex
    ),
    narration: affordance.narration ?? null,
    priority: affordance.priority ?? affordance.metadata?.priority ?? null,
    tags: affordance.tags ?? [],
    actions: affordance.actions ?? [],
    aliases: safeAliases,
    available_actions: (affordance.available_actions ?? affordance.actions ?? []).map((action) =>
      typeof action === 'string'
        ? { verb: action }
        : {
            verb: action.verb ?? action.action ?? action.action_type ?? null,
            action_key: action.action_key ?? action.key ?? null,
            repeat_policy: action.repeat_policy ?? null,
            interaction_id: action.interaction_id ?? action.interaction_key ?? null,
            transition_id: action.transition_id ?? action.transition_key ?? null,
            dialogue_scene_id: action.dialogue_scene_id ?? null,
            dialogue_title: action.dialogue_title ?? null,
          }
    ),
    dialogue_scene_id: affordance.dialogue_scene_id ?? null,
    dialogue_title: affordance.dialogue_title ?? null,
    state: affordance.state,
    source: affordance.source ?? 'authored_content',
  };
}

async function getAccountCapabilities(accountId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT COALESCE(can_advance_beats, FALSE) AS can_advance_beats
      FROM account
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );

  return {
    can_advance_beats: result.rows[0]?.can_advance_beats === true,
  };
}

async function getCurrentDialogueRuntimeStatus(campaignId, characterId, executor = { query }) {
  if (!campaignId || !characterId) {
    return null;
  }

  const tableCheck = await executor.query(
    "SELECT to_regclass('public.dnd5e_dialogue_scene_state') AS table_name"
  );
  if (!tableCheck.rows[0]?.table_name) {
    return null;
  }

  const result = await executor.query(
    `
      SELECT id, dialogue_scene_key, value_json, updated_at
      FROM dnd5e_dialogue_scene_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND field_name = '__runtime_state__'
        AND scope = 'dialogue_scene_state'
        AND value_json->>'status' IN ('active', 'exited')
      ORDER BY
        CASE WHEN value_json->>'status' = 'active' THEN 0 ELSE 1 END,
        updated_at DESC,
        id DESC
      LIMIT 1
    `,
    [campaignId, characterId]
  );
  const row = result.rows[0] ?? null;
  if (!row) {
    return null;
  }
  const runtime = row.value_json ?? {};
  const status = runtime.status === 'exited' ? 'exited' : 'active';
  return {
    dialogue_scene_state_id: String(row.id),
    dialogue_scene_id: row.dialogue_scene_key,
    title: runtime.dialogue_scene_title ?? row.dialogue_scene_key,
    status,
    is_active: status === 'active',
    same_beat_reentry_available: status === 'exited',
  };
}

function decorateNpcPresenceForDialogue(npcPresence) {
  return {
    ...npcPresence,
    visible_npcs: (npcPresence.visible_npcs ?? []).map(decorateNpcWithDialogueEntry),
    npc_affordances: (npcPresence.npc_affordances ?? []).map((affordance) =>
      decorateAffordanceWithDialogueEntry(affordance, npcPresence.npc_identity_index ?? [])
    ),
  };
}

export async function getCharacterSceneView({
  accountId,
  characterId = null,
  campaignInstanceId = null,
  includeDebug = false,
  includeMechanics = false,
}) {
  await ensureLivingWorldSchema();
  await ensureActionComposerSchema();
  await ensureExplorationInteractionSchema();

  const capabilities = await getAccountCapabilities(accountId);
  const character = await resolveActiveCharacter(accountId, characterId, { query });
  if (!character) {
    return {
      state: 'no_active_character',
      capabilities,
      active_character: null,
      campaign: null,
      current_campaign: null,
      scene: null,
      visible_affordances: [],
      known_facts: [],
      objective: null,
      current_objective: null,
      action_status: {
        state: 'no_active_character',
        label: 'No active character',
        description: 'Create or select a character before opening a scene.',
      },
      action_window: null,
    };
  }

  const campaign = await resolveActiveCampaign(character.id, campaignInstanceId, { query });
  if (!campaign) {
    return {
      state: 'no_active_campaign',
      capabilities,
      active_character: {
        character_id: String(character.id),
        name: character.name,
      },
      campaign: null,
      current_campaign: null,
      scene: null,
      visible_affordances: [],
      known_facts: [],
      objective: null,
      current_objective: null,
      action_status: {
        state: 'no_active_campaign',
        label: 'No active adventure',
        description: 'Start or continue an adventure before opening the rich scene view.',
      },
      action_window: null,
    };
  }

  const worldInstance = await getCampaignWorldInstance(campaign.campaign_id);
  const runtime = await getRuntimeContent(campaign.campaign_id, character.id, {
    mode: includeDebug ? 'full' : 'player',
  });
  const activeObjective = await loadActiveObjective(campaign.campaign_id, character.id);
  const runtimeView = {
    ...(runtime ?? {}),
    current_objective: runtime?.current_objective ?? activeObjective,
  };
  const scene = runtimeView?.scene?.current_scene ?? runtimeView?.current_scene ?? null;
  const sceneLocationId =
    scene?.location_id ??
    scene?.location?.id ??
    scene?.location?.location_id ??
    null;
  const sceneState = scene
    ? await getSceneState({
        worldInstanceId: worldInstance.id,
        campaignId: null,
        sceneId: scene.id,
      })
    : null;
  const authoredAffordances = scene
    ? await listAvailableAffordances({
        worldInstanceId: worldInstance.id,
        campaignId: null,
        sceneId: scene.id,
      })
    : [];
  const knownFacts = await listKnowledgeForCharacter({
    characterId: character.id,
    worldInstanceId: worldInstance.id,
  });
  const environmentDescription = scene
    ? await assembleEnvironmentDescription({
        worldInstanceId: worldInstance.id,
        campaignId: campaign.campaign_id,
        characterId: character.id,
        scene,
        sceneState,
        knownFacts,
        includeDebug,
        includeMechanics,
        recordUsage: false,
        selectionMode: includeDebug ? 'deterministic' : undefined,
      })
    : null;
  const npcPresence = scene
    ? await listNpcPresenceForScene({
        worldInstanceId: worldInstance.id,
        campaignId: campaign.campaign_id,
        characterId: character.id,
        sceneId: scene.id,
        locationId: sceneLocationId,
        environment: environmentDescription?.environment ?? null,
        knownFacts,
        includeDebug,
      })
    : {
        visible_npcs: [],
        known_relevant_npcs: [],
        npc_affordances: [],
      };
  const dialogueAwareNpcPresence = decorateNpcPresenceForDialogue(npcPresence);
  const contentAffordances = mergeRuntimeOpportunitiesWithAuthoredAffordances(
    authoredAffordances,
    runtimeOpportunityAffordances(runtimeView)
  );
  const visibleAffordances = mergeAffordances(
    contentAffordances.map((affordance) =>
      decorateAffordanceWithDialogueEntry(affordance, npcPresence.npc_identity_index ?? [])
    ),
    dialogueAwareNpcPresence.npc_affordances
  );
  const mappedScene = mapScene(runtimeView, sceneState, environmentDescription);
  const sceneOverlay = mappedScene ? await getSceneContentOverlay(mappedScene) : null;
  const sceneForNarration = mappedScene
    ? {
        ...mappedScene,
        narration: mappedScene.narration ?? sceneOverlay?.narration ?? null,
      }
    : null;
  const explorationDefinitions = getExplorationInteractionDefinitions(sceneOverlay ?? {});
  const mappedCampaign = mapCampaign(campaign, worldInstance);
  const mappedObjective = mapObjectiveWithKnownProgress(runtimeView, knownFacts);
  const mappedActionWindow = mapActionWindow(runtimeView);
  const sceneResultFeed = mappedScene?.scene_id
    ? await listSceneResultFeed({
        campaignId: campaign.campaign_id,
        characterId: character.id,
        sceneId: mappedScene.scene_id,
        limit: 5,
      })
    : {
        scene_id: null,
        scene_type: 'exploration',
        latest_result: null,
        recent_entries: [],
        max_entries: 5,
      };
  const runtimeConfig = await getWebActionRuntimeConfig(campaign.campaign_id);
  const webSubmission = mappedActionWindow?.action_window_id
    ? await getSubmissionForActionWindow(mappedActionWindow.action_window_id, character.id)
    : null;
  const mappedActionStatus = mapActionStatus(runtimeView, webSubmission, runtimeConfig);
  const greyvaleSliceEndpoint = await getGreyvaleSliceEndpointState({
    campaignId: campaign.campaign_id,
    characterId: character.id,
    worldSlug: campaign.world_slug,
    campaignSlug: campaign.campaign_slug,
    sceneKey: mappedScene?.key ?? null,
    objectiveKey: mappedObjective?.key ?? null,
  });
  const playerSliceEndpoint = greyvaleSliceEndpoint?.player ?? null;
  const viewActionStatus = playerSliceEndpoint
    ? buildGreyvaleSliceEndpointActionStatus(mappedActionStatus, playerSliceEndpoint)
    : mappedActionStatus;
  const activeDialogue = await getCurrentDialogueRuntimeStatus(
    campaign.campaign_id,
    character.id
  );
  if (activeDialogue?.status === 'exited') {
    activeDialogue.same_beat_reentry_available = viewActionStatus.state === 'action_needed';
  }
  const mappedEnvironment = environmentSummary(environmentDescription?.environment ?? null);
  const mappedVisibleAffordances = visibleAffordances.map((affordance) =>
    mapAffordanceForCharacterPerspective(
      affordance,
      dialogueAwareNpcPresence.visible_npcs ?? [],
      npcPresence.npc_identity_index ?? []
    )
  );
  const mappedKnownFacts = knownFacts.map((fact) => ({
    knowledge_id: fact.knowledge_id,
    type: fact.type,
    text: fact.text,
    public_label: fact.public_label,
    confidence: fact.confidence,
  }));
  const mappedSceneStateSummary = summarizeSceneState(knownFacts);
  const mappedRecentSummary = mapRecentSummary(runtimeView);
  const baseSceneReference = buildSceneReference({
    visibleNpcs: dialogueAwareNpcPresence.visible_npcs ?? [],
    visibleAffordances: mappedVisibleAffordances,
  });
  const surfaceNarration = mappedScene
    ? await resolveSurfaceInteractionsForNarration({
        campaignId: campaign.campaign_id,
        worldInstanceId: worldInstance.id,
        characterId: character.id,
        sceneId: mappedScene.scene_id,
        sceneState,
        definitions: explorationDefinitions,
        knownFacts,
        sceneReference: baseSceneReference,
        visibleAffordances: mappedVisibleAffordances,
      })
    : {
        automatic_observations: [],
        passive_discoveries: [],
      };
  const closerLooks = mappedScene
    ? await listCloserLooksForScene({
        campaignId: campaign.campaign_id,
        characterId: character.id,
        sceneId: mappedScene.scene_id,
        sceneState,
        definitions: explorationDefinitions,
        knownFacts,
        sceneReference: baseSceneReference,
        visibleAffordances: mappedVisibleAffordances,
        actionStatus: viewActionStatus,
      })
    : [];
  const sceneReference = {
    ...baseSceneReference,
    closer_looks: closerLooks,
  };
  const sceneNarration = composeSceneNarration({
    scene: sceneForNarration,
    campaign: mappedCampaign,
    environment: mappedEnvironment,
    visibleNpcs: dialogueAwareNpcPresence.visible_npcs ?? [],
    visibleAffordances: mappedVisibleAffordances,
    npcIdentityIndex: npcPresence.npc_identity_index ?? [],
    objective: mappedObjective,
    sceneResultFeed,
    automaticObservations: surfaceNarration.automatic_observations,
    passiveDiscoveries: surfaceNarration.passive_discoveries,
  });
  const actionComposer = buildActionComposerModel(sceneReference);

  const view = {
    state: 'active',
    character_id: String(character.id),
    capabilities,
    world_instance_id: String(worldInstance.id),
    campaign_instance_id: String(campaign.campaign_id),
    active_character: mapActiveCharacter(character),
    campaign: mappedCampaign,
    current_campaign: mappedCampaign,
    scene: mappedScene,
    scene_narration: sceneNarration,
    scene_reference: sceneReference,
    action_composer: actionComposer,
    environment: mappedEnvironment,
    visible_npcs: dialogueAwareNpcPresence.visible_npcs ?? [],
    known_relevant_npcs: npcPresence.known_relevant_npcs ?? [],
    visible_affordances: mappedVisibleAffordances,
    known_facts: mappedKnownFacts,
    objective: mappedObjective,
    current_objective: mappedObjective,
    scene_state_summary: mappedSceneStateSummary,
    action_status: viewActionStatus,
    active_dialogue: activeDialogue,
    action_window: mappedActionWindow
      ? {
          ...mappedActionWindow,
          submitted_action: viewActionStatus.submitted_action,
        }
      : null,
    recent_summary: mappedRecentSummary,
    slice_endpoint: playerSliceEndpoint,
    scene_result_feed: sceneResultFeed,
  };

  if (includeMechanics && environmentDescription?.mechanical_details) {
    view.mechanical_details = {
      ...environmentDescription.mechanical_details,
      action_window: mappedActionWindow
        ? {
            status: mappedActionWindow.status,
            closes_at: mappedActionWindow.closes_at,
            has_submitted_action: Boolean(viewActionStatus.submitted_action),
            allow_action_editing: runtimeConfig.allow_action_editing === true,
            requires_preview_before_submit:
              runtimeConfig.requires_preview_before_submit !== false,
          }
        : null,
      safe_character_context: {
        level: Number(character.level ?? 1),
        class: character.class_name ?? null,
      },
    };
  }

  if (includeDebug) {
    view.debug = {
      runtime_state: runtime?.runtime_state ?? null,
      scene_state: sceneState?.state_json ?? {},
      authored_affordance_count: authoredAffordances.length,
      knowledge_count: knownFacts.length,
      environment_source_breakdown: environmentDescription?.source_breakdown ?? {},
      description_components: environmentDescription?.components ?? [],
      environment_description_debug: environmentDescription?.debug ?? null,
      npc_presence: npcPresence.debug ?? null,
      npc_presence_all: (npcPresence.all_presence ?? []).filter(
        (presence) => presence.visibility === 'visible'
      ),
      slice_endpoint: greyvaleSliceEndpoint?.debug ?? null,
    };
  }

  return view;
}

export async function assertCharacterOwnedByAccount(accountId, characterId) {
  const result = await query(
    'SELECT id FROM dnd5e_character WHERE id = $1 AND account_id = $2 LIMIT 1',
    [characterId, accountId]
  );

  if (result.rowCount === 0) {
    throw createHttpError('Character not found for account', 404);
  }
}
