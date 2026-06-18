import { query } from '../config/db.js';
import { getExistingContentMaps } from './contentRepository.js';

function addError(errors, message) {
  errors.push(message);
}

function addWarning(warnings, message) {
  warnings.push(message);
}

function setOf(records, field = 'slug') {
  return new Set(records.map((record) => record[field]).filter(Boolean));
}

function hasReference(slug, packageSet, existingMap) {
  return packageSet.has(slug) || existingMap.has(slug);
}

function requireReference(errors, label, slug, packageSet, existingMap, sourceFile) {
  if (!slug) {
    return;
  }

  if (!hasReference(slug, packageSet, existingMap)) {
    addError(errors, `${sourceFile} references missing ${label} "${slug}"`);
  }
}

function requireQuestObjectiveReference(errors, questKey, objectiveKey, packageQuestMap, existingQuestMap, sourceFile) {
  if (!questKey || !objectiveKey) {
    return;
  }

  if (packageQuestMap.has(questKey)) {
    const quest = packageQuestMap.get(questKey);
    const objectiveExists = (quest.objectives ?? []).some((objective) => objective.slug === objectiveKey);

    if (!objectiveExists) {
      addError(errors, `${sourceFile} references missing objective "${questKey}:${objectiveKey}"`);
    }

    return;
  }

  if (!existingQuestMap.has(questKey)) {
    addError(errors, `${sourceFile} references missing quest "${questKey}"`);
  }
}

function validateConditionReferences(errors, conditions, refs, sourceFile) {
  const condition = conditions && typeof conditions === 'object' && !Array.isArray(conditions)
    ? conditions
    : {};

  for (const questState of condition.required_quest_states ?? []) {
    requireReference(
      errors,
      'quest',
      questState.quest_key,
      refs.packageSets.quests,
      refs.existing.quests,
      sourceFile
    );
  }

  for (const objectiveState of condition.required_objective_states ?? []) {
    requireQuestObjectiveReference(
      errors,
      objectiveState.quest_key,
      objectiveState.objective_key,
      refs.packageQuestMap,
      refs.existing.quests,
      sourceFile
    );
  }

  for (const sceneState of condition.required_scene_states ?? []) {
    requireReference(
      errors,
      'scene',
      sceneState.scene_slug,
      refs.packageSets.scenes,
      refs.existing.scenes,
      sourceFile
    );
  }

  for (const locationState of condition.required_location_states ?? []) {
    requireReference(
      errors,
      'location',
      locationState.location_slug,
      refs.packageSets.locations,
      refs.existing.locations,
      sourceFile
    );
  }

  for (const entityState of condition.required_entity_states ?? []) {
    requireReference(
      errors,
      'world entity',
      entityState.entity_slug,
      refs.packageSets.worldEntities,
      refs.existing.worldEntities,
      sourceFile
    );
  }
}

function validateEffectReferences(errors, effects, refs, sourceFile) {
  const effect = effects && typeof effects === 'object' && !Array.isArray(effects)
    ? effects
    : {};

  for (const questEffect of effect.quests ?? []) {
    requireReference(
      errors,
      'quest',
      questEffect.quest_key,
      refs.packageSets.quests,
      refs.existing.quests,
      sourceFile
    );
  }

  for (const objectiveEffect of effect.objectives ?? []) {
    requireQuestObjectiveReference(
      errors,
      objectiveEffect.quest_key,
      objectiveEffect.objective_key,
      refs.packageQuestMap,
      refs.existing.quests,
      sourceFile
    );
  }

  for (const npcState of effect.npc_states ?? []) {
    requireReference(
      errors,
      'NPC template',
      npcState.npc_key,
      refs.packageSets.npcTemplates,
      refs.existing.npcTemplates,
      sourceFile
    );
  }

  for (const reward of effect.rewards ?? []) {
    if (reward.reward_type === 'scene_unlock') {
      requireReference(
        errors,
        'scene',
        reward.value?.scene_key,
        refs.packageSets.scenes,
        refs.existing.scenes,
        sourceFile
      );
    }

    if (reward.reward_type === 'npc_disposition') {
      requireReference(
        errors,
        'NPC template',
        reward.value?.npc_key,
        refs.packageSets.npcTemplates,
        refs.existing.npcTemplates,
        sourceFile
      );
    }
  }

  for (const worldChange of effect.world_changes ?? []) {
    requireReference(
      errors,
      'region',
      worldChange.region_slug,
      refs.packageSets.regions,
      refs.existing.regions,
      sourceFile
    );
    requireReference(
      errors,
      'location',
      worldChange.location_slug,
      refs.packageSets.locations,
      refs.existing.locations,
      sourceFile
    );
    requireReference(
      errors,
      'scene',
      worldChange.scene_slug,
      refs.packageSets.scenes,
      refs.existing.scenes,
      sourceFile
    );
    requireReference(
      errors,
      'world entity',
      worldChange.entity_slug,
      refs.packageSets.worldEntities,
      refs.existing.worldEntities,
      sourceFile
    );
  }
}

export async function resolveContentReferences(validatedPackage, executor = { query }) {
  const errors = [...validatedPackage.errors];
  const warnings = [...validatedPackage.warnings];

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings,
      existing: null,
    };
  }

  const sections = validatedPackage.sections;
  const world = sections.world[0];
  const existing = await getExistingContentMaps(executor, world.slug);

  const packageSets = {
    campaigns: setOf(sections.campaigns),
    regionTemplates: setOf(sections.regionTemplates),
    locationTemplates: setOf(sections.locationTemplates),
    sceneTemplates: setOf(sections.sceneTemplates),
    regions: setOf(sections.regions),
    locations: setOf(sections.locations),
    scenes: setOf(sections.scenes),
    sceneTransitions: setOf(sections.sceneTransitions),
    npcTemplates: setOf(sections.npcTemplates),
    worldEntities: setOf(sections.worldEntities),
    encounterTemplates: setOf(sections.encounterTemplates),
    knowledgeDefinitions: setOf(sections.knowledgeDefinitions, 'knowledge_id'),
    environmentFlavorEntries: setOf(sections.environmentFlavorEntries, 'id'),
    environmentModifiers: setOf(sections.environmentModifiers, 'id'),
    sceneAffordances: setOf(sections.sceneAffordances, 'affordance_id'),
    quests: setOf(sections.quests),
    interactions: setOf(sections.interactions),
    dialogues: setOf(sections.dialogues),
    eventTemplates: setOf(sections.eventTemplates),
    contentHooks: setOf(sections.contentHooks),
  };
  const locationsBySlug = new Map(sections.locations.map((location) => [location.slug, location]));
  const scenesBySlug = new Map(sections.scenes.map((scene) => [scene.slug, scene]));
  const packageQuestMap = new Map(sections.quests.map((quest) => [quest.slug, quest]));
  const refs = {
    packageSets,
    packageQuestMap,
    existing,
  };

  for (const record of sections.locationTemplates) {
    requireReference(
      errors,
      'region template',
      record.region_template_slug,
      packageSets.regionTemplates,
      existing.regionTemplates,
      record.__source_file
    );
  }

  for (const record of sections.sceneTemplates) {
    requireReference(
      errors,
      'location template',
      record.location_template_slug,
      packageSets.locationTemplates,
      existing.locationTemplates,
      record.__source_file
    );
    validateConditionReferences(errors, record.entry_conditions, refs, record.__source_file);
  }

  for (const record of sections.regions) {
    requireReference(
      errors,
      'region template',
      record.template_slug,
      packageSets.regionTemplates,
      existing.regionTemplates,
      record.__source_file
    );
  }

  for (const record of sections.locations) {
    requireReference(
      errors,
      'region',
      record.region_slug,
      packageSets.regions,
      existing.regions,
      record.__source_file
    );
    requireReference(
      errors,
      'location template',
      record.template_slug,
      packageSets.locationTemplates,
      existing.locationTemplates,
      record.__source_file
    );
  }

  for (const record of sections.scenes) {
    requireReference(
      errors,
      'location',
      record.location_slug,
      packageSets.locations,
      existing.locations,
      record.__source_file
    );
    requireReference(
      errors,
      'scene template',
      record.template_slug,
      packageSets.sceneTemplates,
      existing.sceneTemplates,
      record.__source_file
    );
    validateConditionReferences(errors, record.entry_conditions, refs, record.__source_file);
  }

  for (const record of sections.sceneTransitions) {
    requireReference(
      errors,
      'from scene',
      record.from_scene_slug,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );
    requireReference(
      errors,
      'to scene',
      record.to_scene_slug,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );
    validateConditionReferences(errors, record.conditions, refs, record.__source_file);
  }

  for (const record of sections.npcTemplates) {
    requireReference(
      errors,
      'default location',
      record.default_location_id,
      packageSets.locations,
      existing.locations,
      record.__source_file
    );
    requireReference(
      errors,
      'default scene',
      record.default_scene_id,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );

    if (record.default_scene_id && record.default_location_id) {
      const scene = scenesBySlug.get(record.default_scene_id);
      if (scene && scene.location_slug !== record.default_location_id) {
        addError(
          errors,
          `${record.__source_file} default_scene_id "${record.default_scene_id}" does not belong to default_location_id "${record.default_location_id}"`
        );
      }
    }

    for (const knowledgeId of [
      record.identity?.knowledge_id_for_true_name,
      ...(record.identity?.known_if_character_has_knowledge ?? []),
    ].filter(Boolean)) {
      requireReference(
        errors,
        'knowledge definition',
        knowledgeId,
        packageSets.knowledgeDefinitions,
        existing.knowledgeDefinitions,
        record.__source_file
      );
    }

    for (const entry of record.schedule ?? []) {
      requireReference(
        errors,
        'schedule location',
        entry.location_id,
        packageSets.locations,
        existing.locations,
        record.__source_file
      );
      requireReference(
        errors,
        'schedule scene',
        entry.scene_id,
        packageSets.scenes,
        existing.scenes,
        record.__source_file
      );

      if (entry.scene_id && entry.location_id) {
        const scene = scenesBySlug.get(entry.scene_id);
        if (scene && scene.location_slug !== entry.location_id) {
          addError(
            errors,
            `${record.__source_file} schedule scene "${entry.scene_id}" does not belong to location "${entry.location_id}"`
          );
        }
      }
    }
  }

  for (const record of sections.worldEntities) {
    const templateSet =
      record.entity_type === 'npc' ? packageSets.npcTemplates : new Set();
    const templateMap =
      record.entity_type === 'npc' ? existing.npcTemplates : existing.monsterTemplates;

    requireReference(
      errors,
      `${record.entity_type} template`,
      record.template_slug,
      templateSet,
      templateMap,
      record.__source_file
    );
    requireReference(
      errors,
      'region',
      record.current_region_slug,
      packageSets.regions,
      existing.regions,
      record.__source_file
    );
    requireReference(
      errors,
      'location',
      record.current_location_slug,
      packageSets.locations,
      existing.locations,
      record.__source_file
    );
    requireReference(
      errors,
      'scene',
      record.current_scene_slug,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );

    if (record.current_scene_slug && record.current_location_slug) {
      const scene = scenesBySlug.get(record.current_scene_slug);

      if (scene && scene.location_slug !== record.current_location_slug) {
        addError(
          errors,
          `${record.__source_file} places entity in scene "${record.current_scene_slug}" but location "${record.current_location_slug}" does not match that scene`
        );
      }
    }
  }

  for (const record of sections.interactions) {
    requireReference(
      errors,
      'scene',
      record.scene_slug,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );
    requireReference(
      errors,
      'NPC template',
      record.npc_template_slug,
      packageSets.npcTemplates,
      existing.npcTemplates,
      record.__source_file
    );

    if (!existing.skills.has(record.skill_slug)) {
      addError(errors, `${record.__source_file} references missing skill "${record.skill_slug}"`);
    }

    validateConditionReferences(errors, record.availability_conditions, refs, record.__source_file);
    validateEffectReferences(errors, record.success_effects, refs, record.__source_file);
    validateEffectReferences(errors, record.failure_effects, refs, record.__source_file);

    for (const knowledgeId of (record.result_bands ?? []).flatMap((band) => band.knowledge_grants ?? [])) {
      requireReference(
        errors,
        'knowledge definition',
        knowledgeId,
        packageSets.knowledgeDefinitions,
        existing.knowledgeDefinitions,
        record.__source_file
      );
    }

    for (const change of (record.result_bands ?? []).flatMap((band) => band.state_changes ?? [])) {
      if (change.target_type === 'affordance') {
        requireReference(
          errors,
          'scene affordance',
          change.target_id,
          packageSets.sceneAffordances,
          existing.sceneAffordances,
          record.__source_file
        );
      }

      if (change.target_type === 'scene') {
        requireReference(
          errors,
          'scene',
          change.target_id,
          packageSets.scenes,
          existing.scenes,
          record.__source_file
        );
      }

      if (change.target_type === 'location') {
        requireReference(
          errors,
          'location',
          change.target_id,
          packageSets.locations,
          existing.locations,
          record.__source_file
        );
      }

      if (change.target_type === 'entity') {
        requireReference(
          errors,
          'world entity',
          change.target_id,
          packageSets.worldEntities,
          existing.worldEntities,
          record.__source_file
        );
      }
    }
  }

  for (const record of sections.environmentFlavorEntries) {
    for (const knowledgeId of record.requires_known_facts ?? []) {
      requireReference(
        errors,
        'knowledge definition',
        knowledgeId,
        packageSets.knowledgeDefinitions,
        existing.knowledgeDefinitions,
        record.__source_file
      );
    }

    for (const knowledgeId of record.excludes_known_facts ?? []) {
      requireReference(
        errors,
        'knowledge definition',
        knowledgeId,
        packageSets.knowledgeDefinitions,
        existing.knowledgeDefinitions,
        record.__source_file
      );
    }
  }

  for (const record of sections.environmentModifiers) {
    if (record.skill && !existing.skills.has(record.skill)) {
      addError(errors, `${record.__source_file} references missing skill "${record.skill}"`);
    }
  }

  for (const record of sections.sceneAffordances) {
    requireReference(
      errors,
      'scene',
      record.scene_slug,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );

    for (const affordanceAction of record.available_actions ?? []) {
      requireReference(
        errors,
        'scene interaction',
        affordanceAction.interaction_id,
        packageSets.interactions ?? setOf(sections.interactions),
        existing.interactions ?? new Map(),
        record.__source_file
      );
      requireReference(
        errors,
        'scene transition',
        affordanceAction.transition_id,
        packageSets.sceneTransitions ?? setOf(sections.sceneTransitions),
        existing.sceneTransitions ?? new Map(),
        record.__source_file
      );
    }

    for (const revealedKnowledge of record.reveals ?? []) {
      requireReference(
        errors,
        'knowledge definition',
        revealedKnowledge,
        packageSets.knowledgeDefinitions,
        existing.knowledgeDefinitions,
        record.__source_file
      );
    }

    for (const added of record.adds_affordances ?? []) {
      requireReference(
        errors,
        'scene affordance',
        added,
        packageSets.sceneAffordances,
        existing.sceneAffordances,
        record.__source_file
      );
    }

    for (const removed of record.removes_affordances ?? []) {
      requireReference(
        errors,
        'scene affordance',
        removed,
        packageSets.sceneAffordances,
        existing.sceneAffordances,
        record.__source_file
      );
    }
  }

  for (const record of sections.encounterTemplates) {
    requireReference(
      errors,
      'campaign',
      record.campaign_slug,
      packageSets.campaigns,
      existing.campaigns,
      record.__source_file
    );
    requireReference(
      errors,
      'scene',
      record.scene_slug,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );

    for (const variant of record.variants ?? []) {
      for (const enemy of variant.enemies ?? []) {
        const enemySlug = enemy.entity_slug ?? enemy.entity_or_template_id ?? enemy.template_slug;

        if (!enemySlug) {
          continue;
        }

        const entityType = enemy.entity_type ?? null;
        let isValid = false;

        if (entityType === 'world_entity') {
          isValid = hasReference(enemySlug, packageSets.worldEntities, existing.worldEntities);
        } else if (entityType === 'monster' || entityType === 'monster_template') {
          isValid = hasReference(enemySlug, new Set(), existing.monsterTemplates);
        } else if (entityType === 'npc' || entityType === 'npc_template') {
          isValid = hasReference(enemySlug, packageSets.npcTemplates, existing.npcTemplates);
        } else {
          isValid =
            hasReference(enemySlug, packageSets.worldEntities, existing.worldEntities) ||
            hasReference(enemySlug, packageSets.npcTemplates, existing.npcTemplates) ||
            hasReference(enemySlug, new Set(), existing.monsterTemplates);
        }

        if (!isValid) {
          addError(
            errors,
            `${record.__source_file} encounter "${record.slug}" variant "${variant.variant_id}" references missing enemy "${enemySlug}"`
          );
        }
      }
    }
  }

  for (const record of sections.quests) {
    validateConditionReferences(errors, record.availability_conditions, refs, record.__source_file);

    for (const objective of record.objectives) {
      validateConditionReferences(
        errors,
        objective.activation_conditions,
        refs,
        `${record.__source_file} objective "${objective.slug}"`
      );
      validateConditionReferences(
        errors,
        objective.completion_conditions,
        refs,
        `${record.__source_file} objective "${objective.slug}"`
      );
      validateConditionReferences(
        errors,
        objective.failure_conditions,
        refs,
        `${record.__source_file} objective "${objective.slug}"`
      );
    }
  }

  for (const dialogue of sections.dialogues) {
    requireReference(
      errors,
      'scene',
      dialogue.scene_slug,
      packageSets.scenes,
      existing.scenes,
      dialogue.__source_file
    );
    requireReference(
      errors,
      'NPC template',
      dialogue.npc_template_slug,
      packageSets.npcTemplates,
      existing.npcTemplates,
      dialogue.__source_file
    );
    validateConditionReferences(errors, dialogue.availability_conditions, refs, dialogue.__source_file);

    const nodeSlugs = new Set(dialogue.nodes.map((node) => node.slug).filter(Boolean));

    for (const node of dialogue.nodes) {
      const nodeSource = `${dialogue.__source_file} node "${node.slug}"`;

      requireReference(
        errors,
        'speaker NPC template',
        node.speaker_npc_template_slug,
        packageSets.npcTemplates,
        existing.npcTemplates,
        nodeSource
      );
      validateConditionReferences(errors, node.availability_conditions, refs, nodeSource);
      validateEffectReferences(errors, node.entry_effects, refs, nodeSource);

      for (const option of node.options) {
        const optionSource = `${nodeSource} option "${option.slug}"`;

        if (option.check_mode !== 'none' && !existing.skills.has(option.skill_slug)) {
          addError(errors, `${optionSource} references missing skill "${option.skill_slug}"`);
        }

        validateConditionReferences(errors, option.availability_conditions, refs, optionSource);

        for (const outcome of option.outcomes) {
          const outcomeSource = `${optionSource} outcome "${outcome.slug}"`;

          if (outcome.next_node_slug && !nodeSlugs.has(outcome.next_node_slug)) {
            addError(
              errors,
              `${outcomeSource} references missing dialogue node "${outcome.next_node_slug}"`
            );
          }

          validateConditionReferences(errors, outcome.conditions, refs, outcomeSource);
          validateEffectReferences(errors, outcome.effects, refs, outcomeSource);
        }
      }
    }
  }

  for (const eventTemplate of sections.eventTemplates) {
    for (const option of eventTemplate.options ?? []) {
      if (option.resolution_kind === 'apply_effects') {
        validateEffectReferences(
          errors,
          option.resolution_payload,
          refs,
          `${eventTemplate.__source_file} option "${option.slug}"`
        );
      }
    }
  }

  for (const hook of sections.contentHooks) {
    requireReference(
      errors,
      'campaign',
      hook.campaign_slug,
      packageSets.campaigns,
      existing.campaigns,
      hook.__source_file
    );
    requireReference(
      errors,
      'scene',
      hook.scene_slug,
      packageSets.scenes,
      existing.scenes,
      hook.__source_file
    );
    requireReference(
      errors,
      'NPC template',
      hook.npc_template_slug,
      packageSets.npcTemplates,
      existing.npcTemplates,
      hook.__source_file
    );
    requireReference(
      errors,
      'world entity',
      hook.entity_slug,
      packageSets.worldEntities,
      existing.worldEntities,
      hook.__source_file
    );

    validateConditionReferences(errors, hook.conditions, refs, hook.__source_file);
    validateEffectReferences(errors, hook.effects, refs, hook.__source_file);

    for (const trigger of hook.event_triggers ?? []) {
      requireReference(
        errors,
        'event template',
        trigger.event_template_key,
        packageSets.eventTemplates,
        existing.eventTemplates,
        `${hook.__source_file} event trigger`
      );
      validateConditionReferences(
        errors,
        trigger.conditions,
        refs,
        `${hook.__source_file} event trigger "${trigger.event_template_key}"`
      );
    }
  }

  for (const record of sections.campaignLocationStates) {
    requireReference(
      errors,
      'campaign',
      record.campaign_slug,
      packageSets.campaigns,
      existing.campaigns,
      record.__source_file
    );
    requireReference(
      errors,
      'location',
      record.location_slug,
      packageSets.locations,
      existing.locations,
      record.__source_file
    );
  }

  for (const record of sections.campaignSceneStates) {
    requireReference(
      errors,
      'campaign',
      record.campaign_slug,
      packageSets.campaigns,
      existing.campaigns,
      record.__source_file
    );
    requireReference(
      errors,
      'scene',
      record.scene_slug,
      packageSets.scenes,
      existing.scenes,
      record.__source_file
    );
  }

  for (const scene of sections.scenes) {
    const location = locationsBySlug.get(scene.location_slug);

    if (!location && !existing.locations.has(scene.location_slug)) {
      addWarning(warnings, `${scene.__source_file} references a DB-existing location; hierarchy validation is limited before import`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    existing,
  };
}
