import { query, withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { DEFAULT_CONTENT_LOAD_ORDER } from './contentTypes.js';
import { discoverContentPackage } from './packageDiscovery.js';
import { validateContentPackage } from './contentValidation.js';
import { resolveContentReferences } from './referenceResolver.js';
import { ensureNpcPresenceSchema } from '../services/npcPresenceSchema.js';
import {
  detectUpsertAction,
  upsertCampaign,
  upsertCampaignLocationState,
  upsertCampaignSceneState,
  upsertContentHook,
  upsertDialogue,
  upsertDialogueNode,
  upsertDialogueOption,
  upsertDialogueOutcome,
  upsertEncounterTemplate,
  upsertEnvironmentFlavorEntry,
  upsertEnvironmentModifier,
  upsertEventTemplate,
  upsertEventTemplateOption,
  upsertLocation,
  upsertLocationTemplate,
  upsertKnowledgeDefinition,
  upsertNpcTemplate,
  upsertQuest,
  upsertQuestObjective,
  upsertRegion,
  upsertRegionTemplate,
  upsertScene,
  upsertSceneAffordance,
  upsertSceneInteraction,
  upsertSceneTransition,
  upsertSceneTemplate,
  upsertWorld,
  upsertWorldEntity,
  syncSceneNpcPresence,
} from './contentRepository.js';

function emptyReport({ packagePath, manifest, loadOrder, filesProcessed, dryRun }) {
  return {
    package_path: packagePath,
    dry_run: dryRun,
    manifest: {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      load_order: loadOrder,
      include_sections: manifest.include_sections,
      exclude_sections: manifest.exclude_sections,
    },
    files_processed: filesProcessed,
    summary: {
      files: filesProcessed.length,
      creates: 0,
      updates: 0,
      skipped: 0,
      warnings: 0,
      errors: 0,
    },
    sections: {},
    warnings: [],
    errors: [],
  };
}

function ensureSection(report, section) {
  if (!report.sections[section]) {
    report.sections[section] = {
      creates: 0,
      updates: 0,
      skipped: 0,
      records: [],
    };
  }

  return report.sections[section];
}

function recordAction(report, section, action, slug, message = null) {
  const bucket = ensureSection(report, section);
  bucket[action === 'update' ? 'updates' : action === 'skip' ? 'skipped' : 'creates'] += 1;

  if (action === 'update') {
    report.summary.updates += 1;
  } else if (action === 'skip') {
    report.summary.skipped += 1;
  } else {
    report.summary.creates += 1;
  }

  bucket.records.push({
    slug,
    action,
    message,
  });
}

function attachValidation(report, validation, references) {
  report.warnings.push(...validation.warnings, ...(references?.warnings ?? []));
  report.errors.push(...validation.errors, ...(references?.errors ?? []));
  report.summary.warnings = report.warnings.length;
  report.summary.errors = report.errors.length;
}

function orderedSections(loadOrder) {
  return [
    'world',
    ...loadOrder.filter((section) => section !== 'world'),
    ...DEFAULT_CONTENT_LOAD_ORDER.filter((section) => section !== 'world' && !loadOrder.includes(section)),
  ].filter((section, index, all) => all.indexOf(section) === index);
}

function cloneExistingMaps(existing) {
  return {
    worldId: existing.worldId,
    regionTemplates: new Map(existing.regionTemplates),
    locationTemplates: new Map(existing.locationTemplates),
    sceneTemplates: new Map(existing.sceneTemplates),
    campaigns: new Map(existing.campaigns),
    regions: new Map(existing.regions),
    locations: new Map(existing.locations),
    scenes: new Map(existing.scenes),
    sceneTransitions: new Map(existing.sceneTransitions ?? []),
    npcTemplates: new Map(existing.npcTemplates),
    monsterTemplates: new Map(existing.monsterTemplates),
    quests: new Map(existing.quests),
    interactions: new Map(existing.interactions ?? []),
    knowledgeDefinitions: new Map(existing.knowledgeDefinitions ?? []),
    environmentFlavorEntries: new Map(existing.environmentFlavorEntries ?? []),
    environmentModifiers: new Map(existing.environmentModifiers ?? []),
    sceneAffordances: new Map(existing.sceneAffordances ?? []),
    skills: new Map(existing.skills),
    eventTemplates: new Map(existing.eventTemplates),
    worldEntities: new Map(existing.worldEntities),
    contentHooks: new Map(existing.contentHooks),
    encounterTemplates: new Map(existing.encounterTemplates ?? []),
  };
}

function requiredMapId(map, slug, label) {
  const value = map.get(slug);

  if (!value) {
    throw createHttpError(`Unable to resolve ${label} "${slug}" during import`, 400);
  }

  return value;
}

async function planWithExisting(report, section, records, actionSelector) {
  for (const record of records) {
    const action = await actionSelector(record);
    recordAction(report, section, action, record.slug ?? `${record.campaign_slug}:${record.scene_slug ?? record.location_slug}`);
  }
}

async function buildDryRunPlan(validatedPackage, references, report) {
  const sections = validatedPackage.sections;
  const existing = references.existing;
  const maps = cloneExistingMaps(existing);
  const world = sections.world[0];

  recordAction(report, 'world', existing.worldId ? 'update' : 'create', world.slug);
  maps.worldId = existing.worldId ?? -1;

  for (const section of orderedSections(validatedPackage.loadOrder)) {
    if (section === 'world') {
      continue;
    }

    switch (section) {
      case 'regionTemplates':
        await planWithExisting(report, section, sections.regionTemplates, async (record) =>
          maps.regionTemplates.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'locationTemplates':
        await planWithExisting(report, section, sections.locationTemplates, async (record) =>
          maps.locationTemplates.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'sceneTemplates':
        await planWithExisting(report, section, sections.sceneTemplates, async (record) =>
          maps.sceneTemplates.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'campaigns':
        await planWithExisting(report, section, sections.campaigns, async (record) =>
          maps.campaigns.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'regions':
        await planWithExisting(report, section, sections.regions, async (record) =>
          maps.regions.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'locations':
        await planWithExisting(report, section, sections.locations, async (record) =>
          maps.locations.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'scenes':
        await planWithExisting(report, section, sections.scenes, async (record) =>
          maps.scenes.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'sceneTransitions':
        await planWithExisting(report, section, sections.sceneTransitions, async (record) => {
          if (!existing.worldId || !maps.scenes.has(record.from_scene_slug)) {
            return 'create';
          }

          return detectUpsertAction(
            { query },
            'dnd5e_scene_transition',
            'from_scene_id = $1 AND transition_key = $2',
            [maps.scenes.get(record.from_scene_slug), record.slug]
          );
        });
        break;
      case 'npcTemplates':
        await planWithExisting(report, section, sections.npcTemplates, async (record) =>
          maps.npcTemplates.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'worldEntities':
        await planWithExisting(report, section, sections.worldEntities, async (record) =>
          maps.worldEntities.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'encounterTemplates':
        await planWithExisting(report, section, sections.encounterTemplates, async (record) =>
          maps.encounterTemplates.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'knowledgeDefinitions':
        await planWithExisting(report, section, sections.knowledgeDefinitions, async (record) =>
          maps.knowledgeDefinitions.has(record.knowledge_id) ? 'update' : 'create'
        );
        break;
      case 'environmentFlavorEntries':
        await planWithExisting(report, section, sections.environmentFlavorEntries, async (record) =>
          maps.environmentFlavorEntries.has(record.id) ? 'update' : 'create'
        );
        break;
      case 'environmentModifiers':
        await planWithExisting(report, section, sections.environmentModifiers, async (record) =>
          maps.environmentModifiers.has(record.id) ? 'update' : 'create'
        );
        break;
      case 'sceneAffordances':
        await planWithExisting(report, section, sections.sceneAffordances, async (record) =>
          maps.sceneAffordances.has(record.affordance_id) ? 'update' : 'create'
        );
        break;
      case 'quests':
        await planWithExisting(report, section, sections.quests, async (record) =>
          maps.quests.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'interactions':
        await planWithExisting(report, section, sections.interactions, async (record) => {
          if (!existing.worldId || !maps.scenes.has(record.scene_slug)) {
            return 'create';
          }

          const sceneId = maps.scenes.get(record.scene_slug);
          return detectUpsertAction(
            { query },
            'dnd5e_scene_interaction',
            'scene_id = $1 AND interaction_key = $2',
            [sceneId, record.slug]
          );
        });
        break;
      case 'dialogues':
        await planWithExisting(report, section, sections.dialogues, async (record) =>
          detectUpsertAction({ query }, 'dnd5e_dialogue', 'dialogue_key = $1', [record.slug])
        );
        break;
      case 'eventTemplates':
        await planWithExisting(report, section, sections.eventTemplates, async (record) =>
          maps.eventTemplates.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'contentHooks':
        await planWithExisting(report, section, sections.contentHooks, async (record) =>
          maps.contentHooks.has(record.slug) ? 'update' : 'create'
        );
        break;
      case 'campaignLocationStates':
        await planWithExisting(report, section, sections.campaignLocationStates, async (record) => {
          if (!existing.worldId || !maps.campaigns.has(record.campaign_slug) || !maps.locations.has(record.location_slug)) {
            return 'create';
          }

          return detectUpsertAction(
            { query },
            'dnd5e_campaign_location_state',
            'campaign_id = $1 AND location_id = $2',
            [maps.campaigns.get(record.campaign_slug), maps.locations.get(record.location_slug)]
          );
        });
        break;
      case 'campaignSceneStates':
        await planWithExisting(report, section, sections.campaignSceneStates, async (record) => {
          if (!existing.worldId || !maps.campaigns.has(record.campaign_slug) || !maps.scenes.has(record.scene_slug)) {
            return 'create';
          }

          return detectUpsertAction(
            { query },
            'dnd5e_campaign_scene_state',
            'campaign_id = $1 AND scene_id = $2',
            [maps.campaigns.get(record.campaign_slug), maps.scenes.get(record.scene_slug)]
          );
        });
        break;
      default:
        break;
    }
  }

  return report;
}

async function importContent(validatedPackage, references, report) {
  const sections = validatedPackage.sections;
  const maps = cloneExistingMaps(references.existing);
  const world = sections.world[0];

  await withTransaction(async (client) => {
    const worldAction = maps.worldId ? 'update' : 'create';
    maps.worldId = await upsertWorld(client, world);
    recordAction(report, 'world', worldAction, world.slug);

    for (const section of orderedSections(validatedPackage.loadOrder)) {
      if (section === 'world') {
        continue;
      }

      switch (section) {
        case 'regionTemplates':
          for (const record of sections.regionTemplates) {
            const action = maps.regionTemplates.has(record.slug) ? 'update' : 'create';
            const id = await upsertRegionTemplate(client, record);
            maps.regionTemplates.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'locationTemplates':
          for (const record of sections.locationTemplates) {
            const action = maps.locationTemplates.has(record.slug) ? 'update' : 'create';
            const regionTemplateId = record.region_template_slug
              ? requiredMapId(maps.regionTemplates, record.region_template_slug, 'region template')
              : null;
            const id = await upsertLocationTemplate(client, record, regionTemplateId);
            maps.locationTemplates.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'sceneTemplates':
          for (const record of sections.sceneTemplates) {
            const action = maps.sceneTemplates.has(record.slug) ? 'update' : 'create';
            const locationTemplateId = record.location_template_slug
              ? requiredMapId(maps.locationTemplates, record.location_template_slug, 'location template')
              : null;
            const id = await upsertSceneTemplate(client, record, locationTemplateId);
            maps.sceneTemplates.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'campaigns':
          for (const record of sections.campaigns) {
            const action = maps.campaigns.has(record.slug) ? 'update' : 'create';
            const id = await upsertCampaign(client, record, maps.worldId);
            maps.campaigns.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'regions':
          for (const record of sections.regions) {
            const action = maps.regions.has(record.slug) ? 'update' : 'create';
            const templateId = record.template_slug
              ? requiredMapId(maps.regionTemplates, record.template_slug, 'region template')
              : null;
            const id = await upsertRegion(client, record, maps.worldId, templateId);
            maps.regions.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'locations':
          for (const record of sections.locations) {
            const action = maps.locations.has(record.slug) ? 'update' : 'create';
            const regionId = requiredMapId(maps.regions, record.region_slug, 'region');
            const templateId = record.template_slug
              ? requiredMapId(maps.locationTemplates, record.template_slug, 'location template')
              : null;
            const id = await upsertLocation(client, record, maps.worldId, regionId, templateId);
            maps.locations.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'scenes':
          for (const record of sections.scenes) {
            const action = maps.scenes.has(record.slug) ? 'update' : 'create';
            const locationId = requiredMapId(maps.locations, record.location_slug, 'location');
            const templateId = record.template_slug
              ? requiredMapId(maps.sceneTemplates, record.template_slug, 'scene template')
              : null;
            const id = await upsertScene(client, record, maps.worldId, locationId, templateId);
            maps.scenes.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'sceneTransitions':
          for (const record of sections.sceneTransitions) {
            const fromSceneId = requiredMapId(maps.scenes, record.from_scene_slug, 'from scene');
            const toSceneId = requiredMapId(maps.scenes, record.to_scene_slug, 'to scene');
            const action = await detectUpsertAction(
              client,
              'dnd5e_scene_transition',
              'from_scene_id = $1 AND transition_key = $2',
              [fromSceneId, record.slug]
            );
            const id = await upsertSceneTransition(client, record, { fromSceneId, toSceneId });
            maps.sceneTransitions.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'npcTemplates':
          for (const record of sections.npcTemplates) {
            const action = maps.npcTemplates.has(record.slug) ? 'update' : 'create';
            const id = await upsertNpcTemplate(client, record);
            maps.npcTemplates.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'worldEntities':
          for (const record of sections.worldEntities) {
            const action = maps.worldEntities.has(record.slug) ? 'update' : 'create';
            const npcTemplateId =
              record.entity_type === 'npc'
                ? requiredMapId(maps.npcTemplates, record.template_slug, 'NPC template')
                : null;
            const monsterTemplateId =
              record.entity_type === 'monster'
                ? requiredMapId(maps.monsterTemplates, record.template_slug, 'monster template')
                : null;
            const regionId = record.current_region_slug
              ? requiredMapId(maps.regions, record.current_region_slug, 'region')
              : null;
            const locationId = record.current_location_slug
              ? requiredMapId(maps.locations, record.current_location_slug, 'location')
              : null;
            const sceneId = record.current_scene_slug
              ? requiredMapId(maps.scenes, record.current_scene_slug, 'scene')
              : null;
            const id = await upsertWorldEntity(client, record, {
              worldId: maps.worldId,
              npcTemplateId,
              monsterTemplateId,
              regionId,
              locationId,
              sceneId,
            });
            maps.worldEntities.set(record.slug, id);

            if (record.entity_type === 'npc' && record.sync_scene_presence && sceneId) {
              await syncSceneNpcPresence(client, record, sceneId, npcTemplateId, id);
            }

            recordAction(report, section, action, record.slug);
          }
          break;
        case 'encounterTemplates':
          for (const record of sections.encounterTemplates) {
            const action = maps.encounterTemplates.has(record.slug) ? 'update' : 'create';
            const campaignId = record.campaign_slug
              ? requiredMapId(maps.campaigns, record.campaign_slug, 'campaign')
              : null;
            const sceneId = record.scene_slug
              ? requiredMapId(maps.scenes, record.scene_slug, 'scene')
              : null;
            const id = await upsertEncounterTemplate(client, record, {
              worldId: maps.worldId,
              campaignId,
              sceneId,
            });
            maps.encounterTemplates.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'knowledgeDefinitions':
          for (const record of sections.knowledgeDefinitions) {
            const action = maps.knowledgeDefinitions.has(record.knowledge_id) ? 'update' : 'create';
            const id = await upsertKnowledgeDefinition(client, record, {
              name: validatedPackage.manifest?.name,
              version: validatedPackage.manifest?.version,
            });
            maps.knowledgeDefinitions.set(record.knowledge_id, id);
            recordAction(report, section, action, record.knowledge_id);
          }
          break;
        case 'environmentFlavorEntries':
          for (const record of sections.environmentFlavorEntries) {
            const action = maps.environmentFlavorEntries.has(record.id) ? 'update' : 'create';
            const id = await upsertEnvironmentFlavorEntry(client, record);
            maps.environmentFlavorEntries.set(record.id, id);
            recordAction(report, section, action, record.id);
          }
          break;
        case 'environmentModifiers':
          for (const record of sections.environmentModifiers) {
            const action = maps.environmentModifiers.has(record.id) ? 'update' : 'create';
            const id = await upsertEnvironmentModifier(client, record);
            maps.environmentModifiers.set(record.id, id);
            recordAction(report, section, action, record.id);
          }
          break;
        case 'sceneAffordances':
          for (const record of sections.sceneAffordances) {
            const action = maps.sceneAffordances.has(record.affordance_id) ? 'update' : 'create';
            const sceneId = requiredMapId(maps.scenes, record.scene_slug, 'scene');
            const interactionIds = new Map();
            const transitionIds = new Map();

            for (const affordanceAction of record.available_actions ?? []) {
              if (affordanceAction.interaction_id) {
                const interaction = await client.query(
                  `
                    SELECT interaction.id
                    FROM dnd5e_scene_interaction interaction
                    WHERE interaction.scene_id = $1
                      AND interaction.interaction_key = $2
                    LIMIT 1
                  `,
                  [sceneId, affordanceAction.interaction_id]
                );
                if (interaction.rows[0]?.id) {
                  interactionIds.set(affordanceAction.interaction_id, Number(interaction.rows[0].id));
                }
              }

              if (affordanceAction.transition_id) {
                const transition = await client.query(
                  `
                    SELECT transition.id
                    FROM dnd5e_scene_transition transition
                    WHERE transition.from_scene_id = $1
                      AND transition.transition_key = $2
                    LIMIT 1
                  `,
                  [sceneId, affordanceAction.transition_id]
                );
                if (transition.rows[0]?.id) {
                  transitionIds.set(affordanceAction.transition_id, Number(transition.rows[0].id));
                }
              }
            }

            const id = await upsertSceneAffordance(client, record, {
              sceneId,
              interactionIds,
              transitionIds,
            });
            maps.sceneAffordances.set(record.affordance_id, id);
            recordAction(report, section, action, record.affordance_id);
          }
          break;
        case 'quests':
          for (const record of sections.quests) {
            const action = maps.quests.has(record.slug) ? 'update' : 'create';
            const questId = await upsertQuest(client, record);
            maps.quests.set(record.slug, questId);

            for (const objective of record.objectives) {
              await upsertQuestObjective(client, objective, questId);
            }

            recordAction(
              report,
              section,
              action,
              record.slug,
              `${record.objectives.length} objective(s)`
            );
          }
          break;
        case 'interactions':
          for (const record of sections.interactions) {
            const sceneId = requiredMapId(maps.scenes, record.scene_slug, 'scene');
            const action = await detectUpsertAction(
              client,
              'dnd5e_scene_interaction',
              'scene_id = $1 AND interaction_key = $2',
              [sceneId, record.slug]
            );
            const npcId = record.npc_template_slug
              ? requiredMapId(maps.npcTemplates, record.npc_template_slug, 'NPC template')
              : null;
            const skillId = requiredMapId(maps.skills, record.skill_slug, 'skill');
            const id = await upsertSceneInteraction(client, record, { sceneId, npcId, skillId });
            maps.interactions.set(record.slug, id);
            recordAction(report, section, action, record.slug);
          }
          break;
        case 'dialogues':
          for (const record of sections.dialogues) {
            const action = await detectUpsertAction(
              client,
              'dnd5e_dialogue',
              'dialogue_key = $1',
              [record.slug]
            );
            const sceneId = record.scene_slug
              ? requiredMapId(maps.scenes, record.scene_slug, 'scene')
              : null;
            const npcId = record.npc_template_slug
              ? requiredMapId(maps.npcTemplates, record.npc_template_slug, 'NPC template')
              : null;
            const dialogueId = await upsertDialogue(client, record, { sceneId, npcId });
            const nodeIds = new Map();

            for (const node of record.nodes) {
              const speakerNpcId = node.speaker_npc_template_slug
                ? requiredMapId(maps.npcTemplates, node.speaker_npc_template_slug, 'speaker NPC template')
                : npcId;
              const nodeId = await upsertDialogueNode(client, node, {
                dialogueId,
                speakerNpcId: node.speaker_type === 'npc' ? speakerNpcId : null,
              });
              nodeIds.set(node.slug, nodeId);
            }

            for (const node of record.nodes) {
              const nodeId = requiredMapId(nodeIds, node.slug, 'dialogue node');

              for (const option of node.options) {
                const skillId =
                  option.check_mode === 'none'
                    ? null
                    : requiredMapId(maps.skills, option.skill_slug, 'skill');
                const optionId = await upsertDialogueOption(client, option, { nodeId, skillId });

                for (const outcome of option.outcomes) {
                  const nextNodeId = outcome.next_node_slug
                    ? requiredMapId(nodeIds, outcome.next_node_slug, 'next dialogue node')
                    : null;
                  await upsertDialogueOutcome(client, outcome, { optionId, nextNodeId });
                }
              }
            }

            const optionCount = record.nodes.reduce(
              (sum, node) => sum + node.options.length,
              0
            );
            const outcomeCount = record.nodes.reduce(
              (sum, node) =>
                sum + node.options.reduce((optionSum, option) => optionSum + option.outcomes.length, 0),
              0
            );
            recordAction(
              report,
              section,
              action,
              record.slug,
              `${record.nodes.length} node(s), ${optionCount} option(s), ${outcomeCount} outcome(s)`
            );
          }
          break;
        case 'eventTemplates':
          for (const record of sections.eventTemplates) {
            const action = maps.eventTemplates.has(record.slug) ? 'update' : 'create';
            const templateId = await upsertEventTemplate(client, record);
            maps.eventTemplates.set(record.slug, templateId);

            for (const option of record.options) {
              await upsertEventTemplateOption(client, option, templateId);
            }

            recordAction(
              report,
              section,
              action,
              record.slug,
              `${record.options.length} option(s)`
            );
          }
          break;
        case 'contentHooks':
          for (const record of sections.contentHooks) {
            const action = maps.contentHooks.has(record.slug) ? 'update' : 'create';
            const campaignId = record.campaign_slug
              ? requiredMapId(maps.campaigns, record.campaign_slug, 'campaign')
              : null;
            const sceneId = record.scene_slug
              ? requiredMapId(maps.scenes, record.scene_slug, 'scene')
              : null;
            const npcId = record.npc_template_slug
              ? requiredMapId(maps.npcTemplates, record.npc_template_slug, 'NPC template')
              : null;
            const id = await upsertContentHook(client, record, {
              worldId: maps.worldId,
              campaignId,
              sceneId,
              npcId,
            });
            maps.contentHooks.set(record.slug, id);
            recordAction(
              report,
              section,
              action,
              record.slug,
              `${record.hook_point} hook`
            );
          }
          break;
        case 'campaignLocationStates':
          for (const record of sections.campaignLocationStates) {
            const campaignId = requiredMapId(maps.campaigns, record.campaign_slug, 'campaign');
            const locationId = requiredMapId(maps.locations, record.location_slug, 'location');
            const action = await detectUpsertAction(
              client,
              'dnd5e_campaign_location_state',
              'campaign_id = $1 AND location_id = $2',
              [campaignId, locationId]
            );
            await upsertCampaignLocationState(client, record, { campaignId, locationId });
            recordAction(report, section, action, `${record.campaign_slug}:${record.location_slug}`);
          }
          break;
        case 'campaignSceneStates':
          for (const record of sections.campaignSceneStates) {
            const campaignId = requiredMapId(maps.campaigns, record.campaign_slug, 'campaign');
            const sceneId = requiredMapId(maps.scenes, record.scene_slug, 'scene');
            const action = await detectUpsertAction(
              client,
              'dnd5e_campaign_scene_state',
              'campaign_id = $1 AND scene_id = $2',
              [campaignId, sceneId]
            );
            await upsertCampaignSceneState(client, record, { campaignId, sceneId });
            recordAction(report, section, action, `${record.campaign_slug}:${record.scene_slug}`);
          }
          break;
        default:
          break;
      }
    }
  });

  return report;
}

export async function loadAndValidateContentPackage(packagePath) {
  await ensureNpcPresenceSchema();

  const discovered = await discoverContentPackage(packagePath);
  const validation = validateContentPackage(discovered);
  const references = validation.ok
    ? await resolveContentReferences(validation)
    : { ok: false, errors: [], warnings: [], existing: null };
  const report = emptyReport({
    packagePath: discovered.packagePath,
    manifest: discovered.manifest,
    loadOrder: discovered.loadOrder,
    filesProcessed: discovered.filesProcessed,
    dryRun: true,
  });

  attachValidation(report, validation, references);

  return {
    ok: validation.ok && references.ok,
    report,
    package: validation,
    references,
  };
}

export async function importContentPackage(packagePath, { dryRun = false } = {}) {
  await ensureNpcPresenceSchema();

  const validationResult = await loadAndValidateContentPackage(packagePath);
  const report = {
    ...validationResult.report,
    dry_run: dryRun,
  };

  if (!validationResult.ok) {
    return {
      ok: false,
      report,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      report: await buildDryRunPlan(validationResult.package, validationResult.references, report),
    };
  }

  try {
    return {
      ok: true,
      report: await importContent(validationResult.package, validationResult.references, report),
    };
  } catch (error) {
    report.errors.push(error.message);
    report.summary.errors = report.errors.length;

    return {
      ok: false,
      report,
    };
  }
}
