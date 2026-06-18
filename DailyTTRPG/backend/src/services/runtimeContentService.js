import {
  actThroughPlayState,
  getPlayState,
} from './adventureRuntimeService.js';
import { listDynamicOpportunities } from './dynamicContentService.js';
import { createHttpError } from '../utils/httpError.js';

const runtimeModes = new Set(['minimal', 'player', 'full']);

const baselineThreadPriority = {
  combat: 120,
  event: 105,
  dialogue: 100,
  waiting: 90,
  transition: 60,
  exploration: 40,
};

const modeThreadMap = {
  combat: 'combat',
  waiting: 'combat',
  dialogue: 'dialogue',
  event: 'event',
  transition: 'transition',
  exploration: 'exploration',
};

const categoryThreadMap = {
  combat: 'combat',
  dialogue: 'dialogue',
  event: 'event',
  movement: 'exploration',
  interaction: 'exploration',
  meta: 'system',
};

function normalizePositiveInteger(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function normalizeRuntimeMode(value, fallback = 'player') {
  const normalized = String(value ?? fallback).trim().toLowerCase() || fallback;

  if (normalized === 'gm' || normalized === 'debug') {
    return 'full';
  }

  if (!runtimeModes.has(normalized)) {
    throw createHttpError('mode must be minimal, player, or full', 400);
  }

  return normalized;
}

function compactAction(action) {
  if (!action) {
    return null;
  }

  return {
    key: action.key,
    action_type: action.action_type,
    label: action.label,
    description: action.description ?? null,
    category: action.category,
    payload: action.payload ?? {},
  };
}

function summarizeScene(sceneState) {
  const scene = sceneState?.current_scene ?? null;

  if (!scene) {
    return {
      current_scene: null,
      available_starting_scenes: sceneState?.available_starting_scenes ?? [],
      narrative_text: 'Choose a starting scene to begin the adventure.',
      visible_entities: [],
      interactions: [],
      transitions: [],
    };
  }

  return {
    current_scene: {
      id: scene.id,
      key: scene.key,
      name: scene.name,
      summary: scene.summary,
      description: scene.description,
      entry_text: scene.entry_text,
      location: scene.location,
    },
    narrative_text: scene.entry_text ?? scene.summary ?? scene.description ?? scene.name,
    visible_entities: (scene.npcs ?? [])
      .filter((npc) => npc.availability?.is_available)
      .map((npc) => ({
        id: npc.id,
        key: npc.key,
        name: npc.name,
        disposition: npc.disposition,
        role: npc.role,
        presence_text: npc.presence_text,
      })),
    interactions: (scene.interactions ?? [])
      .filter((interaction) => interaction.availability?.is_available)
      .map((interaction) => ({
        id: interaction.id,
        key: interaction.interaction_key,
        label: interaction.label,
        description: interaction.description,
      })),
    transitions: (scene.transitions ?? [])
      .filter((transition) => transition.availability?.is_available)
      .map((transition) => ({
        id: transition.id,
        key: transition.transition_key,
        label: transition.label,
        description: transition.description,
        to_scene: transition.to_scene,
        is_default_path: transition.is_default_path,
        recommendation: transition.recommendation ?? null,
      })),
    recent_history: scene.recent_history ?? [],
  };
}

function buildThreadCandidate({
  thread_type,
  thread_id = null,
  label,
  status,
  priority,
  mode,
  source = {},
  reason,
  is_sticky = false,
  is_urgent = false,
}) {
  return {
    thread_type,
    thread_id,
    label,
    status,
    priority,
    mode,
    source,
    reason,
    is_sticky,
    is_urgent,
  };
}

function selectActiveThread(playState) {
  const mode = playState.play_state?.current_mode ?? 'exploration';
  const currentThreadType = modeThreadMap[mode] ?? 'exploration';
  const actionWindow = playState.action_window ?? null;
  const continuity = playState.continuity ?? [];
  const context = playState.context ?? {};
  const candidates = [];

  if (context.combat?.status === 'active') {
    candidates.push(
      buildThreadCandidate({
        thread_type: 'combat',
        thread_id: context.combat.id,
        label:
          mode === 'waiting'
            ? 'Combat is advancing around you'
            : 'Combat encounter',
        status: mode === 'waiting' ? 'waiting' : 'active',
        priority: baselineThreadPriority.combat + (currentThreadType === 'combat' ? 15 : 0),
        mode,
        source: {
          combat_id: context.combat.id,
          current_participant: context.combat.current_participant ?? null,
        },
        reason:
          mode === 'waiting'
            ? 'Combat is active, but another participant currently has focus.'
            : 'Active combat takes runtime priority.',
        is_sticky: currentThreadType === 'combat',
        is_urgent: true,
      })
    );
  }

  if (context.event?.status === 'active') {
    candidates.push(
      buildThreadCandidate({
        thread_type: 'event',
        thread_id: context.event.id,
        label: context.event.template?.name ?? 'Active event',
        status: 'active',
        priority: baselineThreadPriority.event + (currentThreadType === 'event' ? 15 : 0),
        mode,
        source: {
          event_id: context.event.id,
          prompt_text: context.event.prompt_text,
        },
        reason: 'An active event is waiting for a choice.',
        is_sticky: currentThreadType === 'event',
        is_urgent: actionWindow?.event_instance_id === context.event.id,
      })
    );
  }

  if (context.dialogue?.status === 'active') {
    candidates.push(
      buildThreadCandidate({
        thread_type: 'dialogue',
        thread_id: context.dialogue.id,
        label: context.dialogue.dialogue?.name ?? 'Active dialogue',
        status: 'active',
        priority: baselineThreadPriority.dialogue + (currentThreadType === 'dialogue' ? 15 : 0),
        mode,
        source: {
          dialogue_session_id: context.dialogue.id,
          npc: context.dialogue.npc ?? null,
          current_node: context.dialogue.current_node ?? null,
        },
        reason: 'Dialogue remains embedded in the current scene and keeps focus while active.',
        is_sticky: currentThreadType === 'dialogue',
        is_urgent: actionWindow?.dialogue_session_id === context.dialogue.id,
      })
    );
  }

  if (playState.play_state?.current_scene_id) {
    candidates.push(
      buildThreadCandidate({
        thread_type: 'exploration',
        thread_id: playState.play_state.current_scene_id,
        label: playState.context?.scene?.current_scene?.name ?? 'Scene exploration',
        status: 'available',
        priority: baselineThreadPriority.exploration + (currentThreadType === 'exploration' ? 12 : 0),
        mode,
        source: {
          scene_id: playState.play_state.current_scene_id,
        },
        reason: 'The current scene is the runtime foundation.',
        is_sticky: currentThreadType === 'exploration',
      })
    );
  } else {
    candidates.push(
      buildThreadCandidate({
        thread_type: 'transition',
        label: 'Choose a starting scene',
        status: 'available',
        priority: baselineThreadPriority.transition + (currentThreadType === 'transition' ? 12 : 0),
        mode,
        source: {},
        reason: 'No current scene is set yet.',
        is_sticky: currentThreadType === 'transition',
      })
    );
  }

  const sorted = [...candidates].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.label.localeCompare(right.label);
  });
  const primary = sorted[0] ?? null;

  return {
    primary,
    secondary: sorted.slice(1),
    candidates: sorted,
    continuity: {
      model: 'sticky_by_default_with_priority_interrupts',
      current_mode: mode,
      current_thread_type: currentThreadType,
      persisted_threads: continuity,
      selection_reason: primary?.reason ?? null,
      contextual_overrides: sorted
        .filter((candidate) => candidate.is_urgent || candidate.thread_type === 'combat')
        .map((candidate) => ({
          thread_type: candidate.thread_type,
          thread_id: candidate.thread_id,
          reason: candidate.reason,
        })),
    },
  };
}

function inferThreadType(action) {
  if (action.source?.type === 'combat') {
    return 'combat';
  }

  if (action.source?.type === 'dialogue') {
    return 'dialogue';
  }

  if (action.source?.type === 'event') {
    return 'event';
  }

  return categoryThreadMap[action.category] ?? 'exploration';
}

function inferUrgency(action, activeThread) {
  if (action.category === 'combat') {
    return 'urgent';
  }

  if (activeThread?.thread_type === inferThreadType(action)) {
    return activeThread.is_urgent ? 'urgent' : 'foreground';
  }

  if (action.mode_relevance === 'primary') {
    return 'foreground';
  }

  return 'contextual';
}

function classifyOpportunity(action, activeThread, actionWindow) {
  const threadType = inferThreadType(action);
  const basePriority = Number(action.priority ?? 0);
  let relevanceScore = basePriority;
  const reasons = [];
  const isRedundantDialogueEntry =
    activeThread?.thread_type === 'dialogue' &&
    action.action_type === 'talk_to_npc' &&
    action.source?.key &&
    activeThread.source?.npc?.key === action.source.key;
  const isRedundantCombatEntry =
    activeThread?.thread_type === 'combat' && action.action_type === 'start_combat';

  if (action.mode_relevance === 'primary') {
    relevanceScore += 20;
    reasons.push('mode_primary');
  }

  if (
    activeThread?.thread_type === threadType &&
    !isRedundantDialogueEntry &&
    !isRedundantCombatEntry
  ) {
    relevanceScore += 18;
    reasons.push('active_thread_match');
  }

  if (isRedundantDialogueEntry) {
    relevanceScore -= 30;
    reasons.push('already_in_dialogue');
  }

  if (isRedundantCombatEntry) {
    relevanceScore -= 40;
    reasons.push('already_in_combat');
  }

  if (actionWindow?.suggested_action_key === action.key) {
    relevanceScore += 12;
    reasons.push('action_window_suggested');
  }

  if (action.category === 'combat') {
    relevanceScore += 10;
    reasons.push('combat_pressure');
  }

  if (action.action_type === 'wait') {
    relevanceScore -= 8;
    reasons.push('system_fallback');
  }

  return {
    thread_type: threadType,
    urgency: inferUrgency(action, activeThread),
    relevance_score: relevanceScore,
    curation_reasons: reasons,
  };
}

function shapeOpportunity(action, activeThread, actionWindow) {
  const classification = classifyOpportunity(action, activeThread, actionWindow);

  return {
    ...action,
    classification,
  };
}

function curateOpportunities(actions, activeThread, actionWindow, mode) {
  const shaped = actions
    .map((action) => shapeOpportunity(action, activeThread, actionWindow))
    .sort((left, right) => {
      if (left.classification.relevance_score !== right.classification.relevance_score) {
        return right.classification.relevance_score - left.classification.relevance_score;
      }

      return left.label.localeCompare(right.label);
    });
  const primaryLimit = mode === 'minimal' ? 4 : mode === 'player' ? 6 : 12;
  const secondaryLimit = mode === 'minimal' ? 2 : mode === 'player' ? 6 : 20;
  let primary = shaped.filter((action) => {
    if (
      action.classification.curation_reasons.includes('already_in_dialogue') ||
      action.classification.curation_reasons.includes('already_in_combat')
    ) {
      return false;
    }

    if (
      activeThread?.thread_type === action.classification.thread_type &&
      !action.classification.curation_reasons.includes('already_in_dialogue')
    ) {
      return true;
    }

    return action.mode_relevance === 'primary' || action.classification.urgency === 'urgent';
  });

  if (primary.length === 0) {
    primary = shaped.slice(0, Math.min(primaryLimit, shaped.length));
  } else {
    primary = primary.slice(0, primaryLimit);
  }

  const primaryKeys = new Set(primary.map((action) => action.key));
  const secondary = shaped
    .filter((action) => !primaryKeys.has(action.key))
    .slice(0, secondaryLimit);
  const system = shaped.filter((action) => action.category === 'meta' || action.action_type === 'wait');

  return {
    primary,
    secondary,
    system,
    all: shaped,
  };
}

function summarizeDynamicHooks(dynamicOpportunities, mode) {
  const availableHooks = dynamicOpportunities?.hooks?.available ?? [];
  const blockedHooks = dynamicOpportunities?.hooks?.blocked ?? [];

  return {
    available: availableHooks.map((hook) => ({
      id: hook.id,
      key: hook.hook_key,
      hook_point: hook.hook_point,
      label: hook.label,
      feedback: hook.feedback,
      priority: hook.priority,
    })),
    blocked: mode === 'full'
      ? blockedHooks.map((hook) => ({
          id: hook.id,
          key: hook.hook_key,
          hook_point: hook.hook_point,
          label: hook.label,
          unmet_requirements: hook.availability?.unmet_requirements ?? [],
        }))
      : undefined,
    reevaluation: dynamicOpportunities?.reevaluation ?? null,
  };
}

function buildObjectiveSlice(playState) {
  const adventureState = playState.context?.adventure_state ?? {};
  const currentObjective =
    playState.current_objective ??
    playState.play_state?.current_objective ??
    adventureState.current_objective ??
    null;
  const quests = playState.quests ?? adventureState.quests ?? [];
  const activeQuests = quests.filter((quest) => quest.status === 'active');

  return {
    current: currentObjective,
    active_quests: activeQuests.slice(0, 3).map((quest) => ({
      quest_id: quest.quest_id,
      quest_key: quest.quest_key,
      title: quest.title,
      status: quest.status,
      objectives: (quest.objectives ?? [])
        .filter((objective) => ['active', 'completed'].includes(objective.status))
        .slice(0, 4),
    })),
    recent_progress: playState.recent_result ?? adventureState.recent_result ?? null,
    surfacing_policy:
      currentObjective || activeQuests.length > 0
        ? 'show_current_and_recent_changes'
        : 'quiet_until_relevant',
  };
}

function buildDefaultAction(playState, curated, activeThread) {
  const actionWindow = playState.action_window ?? null;
  const defaultPolicy = playState.default_action_policy ?? null;
  const allActions = curated.all ?? [];
  const suggestedAction =
    allActions.find((action) => action.key === actionWindow?.suggested_action_key) ??
    curated.primary[0] ??
    null;
  const combatContextAction =
    activeThread?.primary?.thread_type === 'combat'
      ? allActions.find((action) =>
          playState.play_state?.current_mode === 'waiting'
            ? action.action_type === 'resolve_ai_turn'
            : action.action_type === 'end_turn'
        )
      : null;
  const policyAction = allActions.find(
    (action) => action.action_type === actionWindow?.default_action_type
  );
  const fallbackAction =
    combatContextAction ??
    policyAction ??
    allActions.find((action) => action.action_type === 'wait') ??
    suggestedAction ??
    null;

  return {
    model: 'user_preference_later_context_window_now_system_fallback',
    action_window: actionWindow,
    default_action_policy: defaultPolicy,
    suggested_action: compactAction(suggestedAction),
    selected_default: fallbackAction
      ? {
          ...compactAction(fallbackAction),
          reason: combatContextAction
            ? 'context_aware_combat_default'
            : policyAction
            ? 'matched_action_window_default_type'
            : fallbackAction.action_type === 'wait'
              ? 'system_wait_fallback'
              : 'best_available_context_action',
        }
      : {
          key: null,
          action_type: actionWindow?.default_action_type ?? defaultPolicy?.default_action_type ?? 'wait',
          label: 'Wait',
          description: 'No concrete action is currently available, so the runtime falls back to waiting.',
          category: 'meta',
          payload: actionWindow?.default_action_payload_json ?? defaultPolicy?.default_action_payload_json ?? {},
          reason: 'no_available_action_object',
        },
  };
}

function summarizeAdvancement(playState, mode) {
  const advancement = playState.advancement ?? null;
  const runtimeState = playState.play_state ?? {};
  const levelUpAvailable = advancement?.level_up_available ?? runtimeState.level_up_available ?? false;
  const pendingLevelCount = advancement?.pending_level_count ?? runtimeState.pending_level_count ?? 0;
  const canStartNow =
    advancement?.safe_moment?.can_start_now ?? runtimeState.can_start_level_up_now ?? true;
  const whyDeferred =
    advancement?.safe_moment?.reason ?? runtimeState.level_up_deferred_reason ?? null;
  const activeSession =
    advancement?.active_level_up_session ??
    (runtimeState.active_level_up_session_id
      ? { id: runtimeState.active_level_up_session_id }
      : null);

  const summary = {
    level_up_available: levelUpAvailable,
    pending_level_count: pendingLevelCount,
    can_start_level_up_now: canStartNow,
    why_deferred: whyDeferred,
    active_level_up_session_id: activeSession?.id ?? null,
  };

  if (mode !== 'minimal') {
    summary.active_level_up_session = activeSession;
  }

  if (mode === 'full') {
    summary.full_status = advancement;
  }

  return summary;
}

function buildPresentation(core) {
  const sceneName = core.scene.current_scene?.name ?? 'the threshold';
  const thread = core.active_thread.primary;
  const objectiveText = core.objectives.current?.title
    ? `Objective: ${core.objectives.current.title}.`
    : null;
  const advancementText = core.advancement?.level_up_available
    ? core.advancement.can_start_level_up_now
      ? 'Level up is available.'
      : `Level up is available after ${core.advancement.why_deferred ?? 'the current thread resolves'}.`
    : null;
  const actionLabels = core.opportunities.primary.slice(0, 3).map((action) => action.label);
  const recentSummary = core.objectives.recent_progress?.summary ?? core.recent_changes?.summary ?? null;
  const conciseParts = [
    core.context_summary || `You are in ${sceneName}.`,
    objectiveText,
    advancementText,
    recentSummary,
    actionLabels.length > 0 ? `Options: ${actionLabels.join('; ')}.` : null,
  ].filter(Boolean);

  return {
    concise: {
      narrative_text: conciseParts.join(' '),
      active_thread: thread
        ? {
            type: thread.thread_type,
            label: thread.label,
          }
        : null,
      actions: core.opportunities.primary.slice(0, 4).map(compactAction),
    },
    app: {
      headline: thread?.label ?? sceneName,
      scene_name: sceneName,
      body: core.scene.narrative_text,
      active_thread: thread,
      primary_actions: core.opportunities.primary.map(compactAction),
      secondary_actions: core.opportunities.secondary.map(compactAction),
      current_objective: core.objectives.current,
      suggestion: core.suggestion,
      advancement: core.advancement,
    },
    debug: {
      thread_candidates: core.active_thread.candidates,
      opportunity_count: core.opportunities.all.length,
      dynamic_hook_count: core.dynamic_content.available.length,
      curation_model: 'score_by_priority_active_thread_mode_window',
    },
  };
}

function buildCoreRuntime({
  campaignId,
  characterId,
  mode,
  playState,
  dynamicOpportunities,
}) {
  const scene = summarizeScene(playState.context?.scene);
  const activeThread = selectActiveThread(playState);
  const curated = curateOpportunities(
    playState.all_opportunities ?? playState.available_actions ?? [],
    activeThread.primary,
    playState.action_window ?? null,
    mode
  );
  const objectives = buildObjectiveSlice(playState);
  const defaultAction = buildDefaultAction(playState, curated, activeThread);
  const dynamicContent = summarizeDynamicHooks(dynamicOpportunities, mode);
  const advancement = summarizeAdvancement(playState, mode);
  const core = {
    identity: playState.identity,
    runtime_state: {
      campaign_id: campaignId,
      character_id: characterId,
      current_mode: playState.play_state?.current_mode ?? null,
      current_scene_id: playState.play_state?.current_scene_id ?? null,
      active_dialogue_session_id: playState.play_state?.active_dialogue_session_id ?? null,
      active_combat_id: playState.play_state?.active_combat_id ?? null,
      active_event_id: playState.play_state?.active_event_id ?? null,
      pending_action_window_id: playState.play_state?.pending_action_window_id ?? null,
      last_significant_update_at: playState.play_state?.last_significant_update_at ?? null,
      level_up_available: playState.play_state?.level_up_available ?? advancement.level_up_available,
      pending_level_count: playState.play_state?.pending_level_count ?? advancement.pending_level_count,
      can_start_level_up_now:
        playState.play_state?.can_start_level_up_now ?? advancement.can_start_level_up_now,
      level_up_deferred_reason:
        playState.play_state?.level_up_deferred_reason ?? advancement.why_deferred,
      active_level_up_session_id:
        playState.play_state?.active_level_up_session_id ?? advancement.active_level_up_session_id,
    },
    context_summary: playState.context_summary,
    scene,
    active_thread: activeThread,
    opportunities: {
      primary: curated.primary,
      secondary: curated.secondary,
      system: curated.system,
      all: curated.all,
    },
    objectives,
    continuity: activeThread.continuity,
    default_action: defaultAction,
    dynamic_content: dynamicContent,
    advancement,
    recent_changes: objectives.recent_progress,
    suggestion: playState.suggestion,
    source_layers: {
      scene: 'Stage 4A/5A narrative scene state',
      play_state: 'Stage 4E playable runtime',
      dynamic_content: 'Stage 5D hook reevaluation',
      progression: 'Stage 4D adventure progression',
    },
  };

  return {
    ...core,
    presentation: buildPresentation(core),
  };
}

function shapeMinimalRuntime(core) {
  return {
    identity: core.identity,
    runtime_state: core.runtime_state,
    context_summary: core.context_summary,
    scene: {
      current_scene: core.scene.current_scene
        ? {
            id: core.scene.current_scene.id,
            key: core.scene.current_scene.key,
            name: core.scene.current_scene.name,
            summary: core.scene.current_scene.summary,
          }
        : null,
    },
    active_thread: core.active_thread.primary
      ? {
          thread_type: core.active_thread.primary.thread_type,
          thread_id: core.active_thread.primary.thread_id,
          label: core.active_thread.primary.label,
          status: core.active_thread.primary.status,
        }
      : null,
    current_objective: core.objectives.current,
    advancement: core.advancement,
    opportunities: {
      primary: core.opportunities.primary.slice(0, 4).map(compactAction),
    },
    default_action: {
      selected_default: compactAction(core.default_action.selected_default),
      action_window: core.default_action.action_window
        ? {
            id: core.default_action.action_window.id,
            window_type: core.default_action.action_window.window_type,
            expires_at: core.default_action.action_window.expires_at,
          }
        : null,
    },
    presentation: {
      concise: core.presentation.concise,
    },
  };
}

function shapePlayerRuntime(core) {
  return {
    identity: core.identity,
    runtime_state: core.runtime_state,
    context_summary: core.context_summary,
    scene: core.scene,
    active_thread: {
      primary: core.active_thread.primary,
      secondary: core.active_thread.secondary,
    },
    opportunities: {
      primary: core.opportunities.primary,
      secondary: core.opportunities.secondary,
      system: core.opportunities.system,
    },
    objectives: core.objectives,
    advancement: core.advancement,
    continuity: core.continuity,
    action_window: core.default_action.action_window,
    default_action: core.default_action,
    dynamic_content: {
      available: core.dynamic_content.available,
      reevaluation: core.dynamic_content.reevaluation,
    },
    recent_changes: core.recent_changes,
    suggestion: core.suggestion,
    presentation: {
      concise: core.presentation.concise,
      app: core.presentation.app,
    },
  };
}

function shapeFullRuntime(core, playState, dynamicOpportunities) {
  return {
    ...core,
    debug: {
      presentation: core.presentation.debug,
      full_play_state: playState,
      dynamic_opportunities: dynamicOpportunities,
    },
  };
}

export async function getRuntimeContent(campaignId, characterId, options = {}) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const mode = normalizeRuntimeMode(options.mode);
  const [playState, dynamicOpportunities] = await Promise.all([
    getPlayState(normalizedCampaignId, normalizedCharacterId, 'full'),
    listDynamicOpportunities(normalizedCampaignId, normalizedCharacterId, { mode: 'full' }),
  ]);
  const core = buildCoreRuntime({
    campaignId: normalizedCampaignId,
    characterId: normalizedCharacterId,
    mode,
    playState,
    dynamicOpportunities,
  });

  switch (mode) {
    case 'minimal':
      return shapeMinimalRuntime(core);
    case 'player':
      return shapePlayerRuntime(core);
    case 'full':
      return shapeFullRuntime(core, playState, dynamicOpportunities);
    default:
      throw createHttpError('mode must be minimal, player, or full', 400);
  }
}

export async function listRuntimeContentOpportunities(campaignId, characterId, options = {}) {
  const runtime = await getRuntimeContent(campaignId, characterId, options);

  return {
    identity: runtime.identity,
    runtime_state: runtime.runtime_state,
    active_thread: runtime.active_thread,
    opportunities: runtime.opportunities,
    default_action: runtime.default_action,
    suggestion: runtime.suggestion ?? null,
  };
}

export async function getRuntimeContentContext(campaignId, characterId, options = {}) {
  const runtime = await getRuntimeContent(campaignId, characterId, options);

  return {
    identity: runtime.identity,
    runtime_state: runtime.runtime_state,
    context_summary: runtime.context_summary,
    scene: runtime.scene,
    active_thread: runtime.active_thread,
    objectives: runtime.objectives ?? {
      current: runtime.current_objective ?? null,
    },
    presentation: runtime.presentation,
  };
}

export async function actThroughRuntimeContent(campaignId, characterId, rawInput = {}, options = {}) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const mode = normalizeRuntimeMode(options.mode ?? rawInput.mode);
  const actionResult = await actThroughPlayState(
    normalizedCampaignId,
    normalizedCharacterId,
    rawInput,
    mode
  );
  const runtime = await getRuntimeContent(normalizedCampaignId, normalizedCharacterId, { mode });

  return {
    action: actionResult.action,
    result: actionResult.result,
    dynamic_content: actionResult.dynamic_content,
    runtime,
  };
}
