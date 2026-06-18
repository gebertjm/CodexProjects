import { evaluateNarrativeConditions } from '../narrative/narrativeEngine.js';

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function hasMeaningfulConditions(value) {
  return Object.keys(normalizeObject(value)).length > 0;
}

export function buildQuestDefinitionTree(rows) {
  const questMap = new Map();

  for (const row of rows) {
    let quest = questMap.get(Number(row.quest_id));

    if (!quest) {
      quest = {
        id: Number(row.quest_id),
        key: row.quest_key,
        name: row.quest_name,
        summary: row.quest_summary,
        description: row.quest_description,
        availability_conditions_json: row.availability_conditions_json ?? {},
        discovery_summary: row.discovery_summary ?? null,
        objectives: [],
      };
      questMap.set(quest.id, quest);
    }

    if (row.objective_id !== null && row.objective_id !== undefined) {
      quest.objectives.push({
        id: Number(row.objective_id),
        key: row.objective_key,
        title: row.objective_title,
        description: row.objective_description,
        sort_order: Number(row.sort_order ?? 0),
        activation_conditions_json: row.activation_conditions_json ?? {},
        completion_conditions_json: row.completion_conditions_json ?? {},
        failure_conditions_json: row.failure_conditions_json ?? {},
        progress_target: row.progress_target !== null ? Number(row.progress_target) : null,
        hard_gate: row.hard_gate ?? false,
      });
    }
  }

  return [...questMap.values()].map((quest) => ({
    ...quest,
    objectives: quest.objectives.sort(
      (left, right) => left.sort_order - right.sort_order || left.id - right.id
    ),
  }));
}

export function buildSceneUnlockDefinitionMap(rows) {
  const sceneMap = new Map();

  for (const row of rows) {
    const sceneId = Number(row.scene_id);
    const list = sceneMap.get(sceneId) ?? [];
    list.push({
      id: Number(row.id),
      scene_id: sceneId,
      scene_key: row.scene_key,
      scene_name: row.scene_name,
      unlock_key: row.unlock_key,
      unlock_type: row.unlock_type,
      condition_data_json: row.condition_data_json ?? {},
      description: row.description,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    sceneMap.set(sceneId, list);
  }

  return sceneMap;
}

export function evaluateSceneUnlockAvailability(definitions, conditionContext) {
  const rows = Array.isArray(definitions) ? definitions : [];

  if (rows.length === 0) {
    return {
      is_unlocked: true,
      available_unlocks: [],
      blocked_unlocks: [],
    };
  }

  const evaluated = rows.map((definition) => {
    const availability = evaluateNarrativeConditions(
      definition.condition_data_json,
      conditionContext
    );

    return {
      ...definition,
      availability,
    };
  });

  return {
    is_unlocked: evaluated.some((entry) => entry.availability.is_available),
    available_unlocks: evaluated.filter((entry) => entry.availability.is_available),
    blocked_unlocks: evaluated.filter((entry) => !entry.availability.is_available),
  };
}

export function determineObjectiveState({
  questStatus,
  objectiveDefinition,
  objectiveState,
  conditionContext,
}) {
  const completionConditions = normalizeObject(objectiveDefinition.completion_conditions_json);
  const failureConditions = normalizeObject(objectiveDefinition.failure_conditions_json);
  const activationConditions = normalizeObject(objectiveDefinition.activation_conditions_json);
  const completion = evaluateNarrativeConditions(
    completionConditions,
    conditionContext
  );
  const failure = evaluateNarrativeConditions(
    failureConditions,
    conditionContext
  );
  const activation = evaluateNarrativeConditions(
    activationConditions,
    conditionContext
  );
  const currentStatus = objectiveState?.status ?? 'locked';
  let desiredStatus = currentStatus;

  if (currentStatus === 'completed') {
    desiredStatus = 'completed';
  } else if (hasMeaningfulConditions(failureConditions) && failure.is_available) {
    desiredStatus = 'failed';
  } else if (hasMeaningfulConditions(completionConditions) && completion.is_available) {
    desiredStatus = 'completed';
  } else if (questStatus === 'active' || questStatus === 'available') {
    desiredStatus = activation.is_available ? 'active' : 'locked';
  } else {
    desiredStatus = 'locked';
  }

  const currentProgress = Number(objectiveState?.progress_count ?? 0);
  const desiredProgress =
    desiredStatus === 'completed'
      ? Math.max(currentProgress, Number(objectiveDefinition.progress_target ?? 1))
      : currentProgress;

  return {
    desired_status: desiredStatus,
    desired_progress_count: desiredProgress,
    activation,
    completion,
    failure,
  };
}

export function determineQuestState({
  questDefinition,
  questState,
  objectiveEvaluations,
  availability,
}) {
  const currentStatus = questState?.status ?? null;
  const hasState = Boolean(questState);

  if (!availability.is_available && (!hasState || !['completed', 'failed'].includes(currentStatus))) {
    return {
      should_exist: false,
      desired_status: null,
    };
  }

  if (currentStatus === 'completed') {
    return {
      should_exist: true,
      desired_status: 'completed',
    };
  }

  if (currentStatus === 'failed') {
    return {
      should_exist: true,
      desired_status: 'failed',
    };
  }

  const hardGateFailure = objectiveEvaluations.some(
    (entry) => entry.definition.hard_gate && entry.evaluation.desired_status === 'failed'
  );

  if (hardGateFailure) {
    return {
      should_exist: true,
      desired_status: 'failed',
    };
  }

  const allObjectivesCompleted =
    questDefinition.objectives.length > 0 &&
    objectiveEvaluations.length === questDefinition.objectives.length &&
    objectiveEvaluations.every((entry) => entry.evaluation.desired_status === 'completed');

  if (allObjectivesCompleted) {
    return {
      should_exist: true,
      desired_status: 'completed',
    };
  }

  const hasActiveObjective = objectiveEvaluations.some((entry) =>
    ['active', 'completed', 'failed'].includes(entry.evaluation.desired_status)
  );

  return {
    should_exist: true,
    desired_status: hasActiveObjective || currentStatus === 'active' ? 'active' : 'available',
  };
}

export function buildQuestStateLookup(quests) {
  const questMap = new Map();
  const objectiveMap = new Map();

  for (const quest of quests ?? []) {
    questMap.set(quest.key, quest);

    for (const objective of quest.objectives ?? []) {
      objectiveMap.set(`${quest.key}:${objective.key}`, objective);
    }
  }

  return {
    quest_map: questMap,
    objective_map: objectiveMap,
  };
}

export function selectCurrentObjective(quests) {
  const questList = Array.isArray(quests) ? quests : [];

  for (const quest of questList) {
    if (!['active', 'available'].includes(quest.status)) {
      continue;
    }

    const objective =
      quest.objectives.find((entry) => entry.status === 'active') ??
      quest.objectives.find((entry) => entry.status === 'locked');

    if (objective) {
      return {
        quest: {
          id: quest.quest_id ?? quest.id,
          key: quest.key,
          name: quest.name,
          status: quest.status,
        },
        objective,
      };
    }
  }

  return null;
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sceneIdFromHistoryItem(item) {
  return numericId(
    item?.input_json?.scene_id ??
      item?.input_json?.current_scene_id ??
      item?.result_json?.scene_id ??
      item?.result_json?.current_scene_id ??
      item?.result_json?.scene?.id
  );
}

function transitionDestinationSceneId(item) {
  return numericId(item?.input_json?.to_scene_id ?? item?.result_json?.to_scene?.id);
}

function isSceneTransitionHistory(item) {
  return (
    item?.action_key === 'scene_move' ||
    item?.action_key === 'scene_enter' ||
    item?.input_json?.to_scene_id !== undefined ||
    item?.result_json?.to_scene?.id !== undefined
  );
}

function historyItemAppliesToScene(item, currentSceneId) {
  const normalizedCurrentSceneId = numericId(currentSceneId);
  if (!normalizedCurrentSceneId) {
    return true;
  }

  if (isSceneTransitionHistory(item)) {
    return false;
  }

  const historySceneId = sceneIdFromHistoryItem(item);
  return !historySceneId || historySceneId === normalizedCurrentSceneId;
}

function mapSceneResultHistoryItem(item) {
  const summary =
    typeof item?.summary === 'string' && item.summary.trim().length > 0
      ? item.summary.trim()
      : null;

  if (!summary) {
    return null;
  }

  return {
    history_id: item.id ?? null,
    source_type: item.source_type,
    action_key: item.action_key,
    summary,
    created_at: item.created_at,
    scene_id: sceneIdFromHistoryItem(item),
  };
}

function collectSceneResultHistory(historyItems, currentSceneId) {
  if (!Array.isArray(historyItems) || historyItems.length === 0) {
    return [];
  }

  const normalizedCurrentSceneId = numericId(currentSceneId);
  const results = [];

  for (const item of historyItems) {
    if (isSceneTransitionHistory(item)) {
      if (!normalizedCurrentSceneId || transitionDestinationSceneId(item) === normalizedCurrentSceneId) {
        break;
      }

      break;
    }

    if (!historyItemAppliesToScene(item, normalizedCurrentSceneId)) {
      continue;
    }

    const result = mapSceneResultHistoryItem(item);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

export function buildRecentResultSummary(historyItems, currentSceneId = null) {
  const results = collectSceneResultHistory(historyItems, currentSceneId);
  const latest = results[0] ?? null;

  if (!latest) {
    return null;
  }

  return {
    source_type: latest.source_type,
    action_key: latest.action_key,
    summary: latest.summary,
    created_at: latest.created_at,
    scene_id: latest.scene_id,
    results,
  };
}

export function mergeKnowledgeByType(knowledgeItems) {
  const grouped = new Map();

  for (const item of knowledgeItems ?? []) {
    const key = item.knowledge_type;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  return grouped;
}

export function normalizeRewardValue(value) {
  return normalizeObject(value);
}
