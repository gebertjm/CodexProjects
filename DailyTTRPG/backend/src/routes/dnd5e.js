import { Router } from 'express';
import { listRaces, listClasses, listLanguages, listFeats } from '../services/dnd5eService.js';
import {
  createCharacter,
  inactivateCharacter,
} from '../services/charactersService.js';
import {
  addCharacterClass,
  addCharacterFeat,
  addCharacterLanguage,
  getCharacterById,
  listCharacterClasses,
  listCharacterFeats,
  listCharacterLanguages,
} from '../services/characterCompositionService.js';
import {
  addCharacterSpell,
  changeCharacterSpellSlots,
  getCharacterSpellSlots,
  getSpellById,
  listCharacterSpells,
  listSpells,
  updateCharacterSpell,
} from '../services/spellService.js';
import { getCharacterSheet } from '../services/characterSheetService.js';
import { getCharacterRules } from '../services/characterRulesService.js';
import {
  addCharacterItem,
  getCharacterCurrency,
  getItemById,
  listCharacterItems,
  listItems,
  updateCharacterCurrency,
  updateCharacterItem,
} from '../services/inventoryService.js';
import {
  createCharacterOverride,
  listCharacterOverrides,
  updateOverride,
} from '../services/overrideService.js';
import { listCharacterCommandLogs } from '../services/commandLogService.js';
import { executeCommand } from '../engine/commands/commandExecutor.js';
import { listCharacterGameplayHistory } from '../services/gameplayHistoryService.js';
import {
  addCharacterToCampaign,
  chooseEventOption,
  createCampaign,
  createEventInstance,
  getCampaignById,
  getEventById,
  listCampaigns,
  listCharacterEvents,
  listEventTemplates,
} from '../services/eventService.js';
import {
  getCharacterProgression,
  grantCharacterExperience,
} from '../services/progressionService.js';
import {
  attemptSceneInteraction,
  enterCharacterScene,
  getCharacterScene,
  listCampaignLogs,
  listCampaignScenes,
  listCharacterNarrativeFlags,
  listCharacterNarrativeQuests,
  listCurrentSceneNpcs,
  moveCharacterScene,
} from '../services/narrativeService.js';
import {
  getAdventureState,
  listAdventureCampaignLog,
  listAdventureObjectives,
  listAdventureQuests,
  listCharacterRewardApplications,
} from '../services/adventureProgressionService.js';
import {
  actThroughPlayState,
  getContextSummary,
  getPlayState,
  listAvailableActions,
} from '../services/adventureRuntimeService.js';
import {
  executeContentHooks,
  listDynamicOpportunities,
  listRuntimeHooks,
  triggerTimeBeat,
} from '../services/dynamicContentService.js';
import {
  actThroughRuntimeContent,
  getRuntimeContent,
  getRuntimeContentContext,
  listRuntimeContentOpportunities,
} from '../services/runtimeContentService.js';
import {
  attemptDialogueSkillCheck,
  chooseDialogueOption,
  getDialogueSession,
  listDialogueSessions,
  startDialogueSession,
} from '../services/dialogueService.js';
import {
  getActionById,
  getStatBlockById,
  listStatBlockActions,
  listStatBlocks,
} from '../services/statBlockService.js';
import {
  actInCombat,
  createCombat,
  endCombatTurn,
  getCombatById,
  resolveCombatAiTurn,
  startCombat,
} from '../services/combatService.js';
import {
  getLocationById,
  getSceneById as getWorldSceneById,
  getWorldById,
  listCharacterCampaigns,
  listWorldCampaigns,
  listWorldEntities,
  listWorldRegions,
  listWorlds,
} from '../services/worldContentService.js';
import {
  getCatchupSummary,
  getProgressionWindow,
  getWorldTruth,
  listCharacterKnowledgeInWorld,
  listProgressionWindows,
  listWorldEntityEvolution,
  listWorldHistory,
  openProgressionWindow,
  propagateWorldKnowledge,
  recordWorldChange,
  resolveProgressionWindow,
  submitProgressionWindowResponse,
  triggerWorldBeat as triggerWorldSimulationBeat,
} from '../services/worldSimulationService.js';
import {
  chooseLevelUpHp,
  chooseLevelUpSpells,
  chooseLevelUpSubclass,
  deferLevelUp,
  finalizeLevelUp,
  getCampaignLevelSync,
  getCharacterAdvancementStatus,
  grantMilestoneLevel,
  previewLevelUp,
  setCampaignAdvancementConfig,
  setWorldAdvancementConfig,
  startLevelUp,
} from '../services/advancementService.js';
import {
  evaluatePartyStrength,
  previewEncounter,
  resolveEncounter,
} from '../services/encounterService.js';
import { createHttpError } from '../utils/httpError.js';

const router = Router();

function parsePositiveInteger(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError(`${label} must be a non-negative integer`, 400);
  }

  return parsed;
}

function parseRequiredId(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function cleanOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalBoolean(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw createHttpError(`${label} must be a boolean`, 400);
}

function parseOptionalObject(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createHttpError(`${label} must be a JSON object`, 400);
  }

  return value;
}

function parseStringArrayInput(value, label) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter((entry) => entry !== '');
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');
  }

  throw createHttpError(`${label} must be an array or comma-separated string`, 400);
}

function parseAdventureMode(value, { defaultMode = 'player' } = {}) {
  const normalized = String(value ?? defaultMode).trim() || defaultMode;

  if (!['minimal', 'player', 'gm'].includes(normalized)) {
    throw createHttpError('mode must be minimal, player, or gm', 400);
  }

  return normalized;
}

function parseRuntimeMode(value, { defaultMode = 'player' } = {}) {
  const normalized = String(value ?? defaultMode).trim() || defaultMode;

  if (!['minimal', 'player', 'full', 'gm', 'debug'].includes(normalized)) {
    throw createHttpError('mode must be minimal, player, or full', 400);
  }

  if (normalized === 'gm' || normalized === 'debug') {
    return 'full';
  }

  return normalized;
}

router.get('/races', async (_req, res, next) => {
  try {
    const races = await listRaces();

    res.json({
      data: races,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/classes', async (_req, res, next) => {
  try {
    const classes = await listClasses();

    res.json({
      data: classes,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/languages', async (_req, res, next) => {
  try {
    const languages = await listLanguages();

    res.json({
      data: languages,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/feats', async (_req, res, next) => {
  try {
    const feats = await listFeats();

    res.json({
      data: feats,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stat-blocks', async (_req, res, next) => {
  try {
    const statBlocks = await listStatBlocks();

    res.json({
      data: statBlocks,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stat-blocks/:id', async (req, res, next) => {
  try {
    const statBlockId = parseRequiredId(req.params.id, 'Stat block id');
    const statBlock = await getStatBlockById(statBlockId);

    if (!statBlock) {
      throw createHttpError('Stat block not found', 404);
    }

    res.json({
      data: statBlock,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stat-blocks/:id/actions', async (req, res, next) => {
  try {
    const statBlockId = parseRequiredId(req.params.id, 'Stat block id');
    const statBlock = await getStatBlockById(statBlockId);

    if (!statBlock) {
      throw createHttpError('Stat block not found', 404);
    }

    const actions = await listStatBlockActions(statBlockId);

    res.json({
      data: {
        stat_block: {
          id: statBlock.id,
          name: statBlock.name,
          owner: statBlock.owner,
        },
        actions,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/actions/:id', async (req, res, next) => {
  try {
    const actionId = parseRequiredId(req.params.id, 'Action id');
    const action = await getActionById(actionId);

    if (!action) {
      throw createHttpError('Action not found', 404);
    }

    res.json({
      data: action,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/spells', async (_req, res, next) => {
  try {
    const spells = await listSpells();

    res.json({
      data: spells,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/spells/:id', async (req, res, next) => {
  try {
    const spellId = parseRequiredId(req.params.id, 'Spell id');
    const spell = await getSpellById(spellId);

    if (!spell) {
      throw createHttpError('Spell not found', 404);
    }

    res.json({
      data: spell,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/items', async (_req, res, next) => {
  try {
    const items = await listItems();

    res.json({
      data: items,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/items/:id', async (req, res, next) => {
  try {
    const itemId = parseRequiredId(req.params.id, 'Item id');
    const item = await getItemById(itemId);

    if (!item) {
      throw createHttpError('Item not found', 404);
    }

    res.json({
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds', async (_req, res, next) => {
  try {
    const worlds = await listWorlds();

    res.json({
      data: worlds,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds/:id', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const world = await getWorldById(worldId);

    if (!world) {
      throw createHttpError('World not found', 404);
    }

    res.json({
      data: world,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds/:id/campaigns', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const campaigns = await listWorldCampaigns(worldId);

    res.json({
      data: campaigns,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds/:id/regions', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const regions = await listWorldRegions(worldId);

    res.json({
      data: regions,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds/:id/entities', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const entities = await listWorldEntities(worldId);

    res.json({
      data: entities,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds/:id/history', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const history = await listWorldHistory(worldId, {
      limit: req.query.limit === undefined ? 25 : parseRequiredId(req.query.limit, 'limit'),
      offset:
        req.query.offset === undefined
          ? 0
          : parsePositiveInteger(req.query.offset, 'offset'),
    });

    res.json({
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds/:id/truth', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const truth = await getWorldTruth(worldId);

    res.json({
      data: truth,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/worlds/:id/changes', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const result = await recordWorldChange({
      ...req.body,
      world_id: worldId,
    });

    res.status(201).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worlds/:id/entity-events', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const events = await listWorldEntityEvolution(worldId, {
      entity_id:
        req.query.entity_id === undefined || req.query.entity_id === ''
          ? null
          : parseRequiredId(req.query.entity_id, 'entity_id'),
      limit: req.query.limit === undefined ? 25 : parseRequiredId(req.query.limit, 'limit'),
      offset:
        req.query.offset === undefined
          ? 0
          : parsePositiveInteger(req.query.offset, 'offset'),
    });

    res.json({
      data: events,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/worlds/:id/propagate-knowledge', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const result = await propagateWorldKnowledge(worldId, {
      channel: cleanOptionalText(req.body.channel),
      include_hidden: parseOptionalBoolean(req.body.include_hidden, 'include_hidden') ?? false,
      limit: req.body.limit === undefined ? 50 : parseRequiredId(req.body.limit, 'limit'),
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/worlds/:id/beats', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const result = await triggerWorldSimulationBeat(worldId, req.body);

    res.status(201).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/locations/:id', async (req, res, next) => {
  try {
    const locationId = parseRequiredId(req.params.id, 'Location id');
    const location = await getLocationById(locationId);

    if (!location) {
      throw createHttpError('Location not found', 404);
    }

    res.json({
      data: location,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/scenes/:id', async (req, res, next) => {
  try {
    const sceneId = parseRequiredId(req.params.id, 'Scene id');
    const scene = await getWorldSceneById(sceneId);

    if (!scene) {
      throw createHttpError('Scene not found', 404);
    }

    res.json({
      data: scene,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns', async (_req, res, next) => {
  try {
    const campaigns = await listCampaigns();

    res.json({
      data: campaigns,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns', async (req, res, next) => {
  try {
    const createdByAccountId =
      req.body.created_by_account_id === undefined || req.body.created_by_account_id === null
        ? null
        : parseRequiredId(req.body.created_by_account_id, 'created_by_account_id');

    const campaign = await createCampaign({
      world_id:
        req.body.world_id === undefined || req.body.world_id === null
          ? undefined
          : parseRequiredId(req.body.world_id, 'world_id'),
      name: cleanOptionalText(req.body.name),
      slug: cleanOptionalText(req.body.slug),
      campaign_type: cleanOptionalText(req.body.campaign_type),
      status: cleanOptionalText(req.body.status),
      description: cleanOptionalText(req.body.description),
      created_by_account_id: createdByAccountId,
    });

    res.status(201).json({
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const campaign = await getCampaignById(campaignId);

    if (!campaign) {
      throw createHttpError('Campaign not found', 404);
    }

    res.json({
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const joinedByAccountId =
      req.body.joined_by_account_id === undefined || req.body.joined_by_account_id === null
        ? null
        : parseRequiredId(req.body.joined_by_account_id, 'joined_by_account_id');
    const campaign = await addCharacterToCampaign(campaignId, {
      character_id: parseRequiredId(req.body.character_id, 'character_id'),
      joined_by_account_id: joinedByAccountId,
      is_active_context: parseOptionalBoolean(req.body.is_active_context, 'is_active_context'),
    });

    res.status(201).json({
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/campaigns', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const campaigns = await listCharacterCampaigns(characterId);

    res.json({
      data: campaigns,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/scenes', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.query.character_id, 'character_id');
    const scenes = await listCampaignScenes(campaignId, characterId);

    res.json({
      data: scenes,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/logs', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const limit = req.query.limit === undefined ? 25 : parseRequiredId(req.query.limit, 'limit');
    const offset =
      req.query.offset === undefined
        ? 0
        : parsePositiveInteger(req.query.offset, 'offset');
    const characterId =
      req.query.character_id === undefined || req.query.character_id === null || req.query.character_id === ''
        ? null
        : parseRequiredId(req.query.character_id, 'character_id');
    const mode = parseAdventureMode(req.query.mode, {
      defaultMode: characterId === null ? 'gm' : 'player',
    });
    const logs =
      characterId === null && mode === 'gm'
        ? await listCampaignLogs(campaignId, limit, offset)
        : await listAdventureCampaignLog(campaignId, characterId, mode, limit, offset);

    res.json({
      data: logs,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/progression-windows', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const windows = await listProgressionWindows({
      campaign_id: campaignId,
      status: cleanOptionalText(req.query.status),
      limit: req.query.limit === undefined ? 25 : parseRequiredId(req.query.limit, 'limit'),
      offset:
        req.query.offset === undefined
          ? 0
          : parsePositiveInteger(req.query.offset, 'offset'),
    });

    res.json({
      data: windows,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/progression-windows', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const windowResult = await openProgressionWindow({
      ...req.body,
      campaign_id: campaignId,
    });

    res.status(201).json({
      data: windowResult,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/progression-windows/:id', async (req, res, next) => {
  try {
    const windowId = parseRequiredId(req.params.id, 'Progression window id');
    const windowResult = await getProgressionWindow(windowId);

    res.json({
      data: windowResult,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/progression-windows/:id/responses', async (req, res, next) => {
  try {
    const windowId = parseRequiredId(req.params.id, 'Progression window id');
    const response = await submitProgressionWindowResponse(windowId, req.body);

    res.status(201).json({
      data: response,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/progression-windows/:id/resolve', async (req, res, next) => {
  try {
    const windowId = parseRequiredId(req.params.id, 'Progression window id');
    const resolved = await resolveProgressionWindow(windowId, {
      ...req.body,
      force: req.body.force === true,
    });

    res.json({
      data: resolved,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/scene', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const sceneState = await getCharacterScene(campaignId, characterId);

    res.json({
      data: sceneState,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/adventure-state', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseAdventureMode(req.query.mode);
    const state = await getAdventureState(campaignId, characterId, mode);

    res.json({
      data: state,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/world-knowledge', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const worldId = parseRequiredId(req.query.world_id, 'world_id');
    const knowledge = await listCharacterKnowledgeInWorld(worldId, characterId, {
      campaign_id: campaignId,
    });

    res.json({
      data: knowledge,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/catchup', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const catchup = await getCatchupSummary(campaignId, characterId, {
      limit: req.query.limit === undefined ? 10 : parseRequiredId(req.query.limit, 'limit'),
      mark_seen: req.query.mark_seen === 'true',
      mode: parseRuntimeMode(req.query.mode, { defaultMode: 'minimal' }),
    });

    res.json({
      data: catchup,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/play-state', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const playState = await getPlayState(campaignId, characterId, mode);

    res.json({
      data: playState,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/runtime', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const runtime = await getRuntimeContent(campaignId, characterId, { mode });

    res.json({
      data: runtime,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/opportunities', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const opportunities = await listRuntimeContentOpportunities(campaignId, characterId, {
      mode,
    });

    res.json({
      data: opportunities,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/context', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const context = await getRuntimeContentContext(campaignId, characterId, { mode });

    res.json({
      data: context,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/runtime-debug', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const runtime = await getRuntimeContent(campaignId, characterId, { mode: 'full' });

    res.json({
      data: runtime,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/runtime-act', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.body.mode ?? req.query.mode, {
      defaultMode: 'player',
    });
    const result = await actThroughRuntimeContent(campaignId, characterId, req.body, { mode });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/available-actions', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const actions = await listAvailableActions(campaignId, characterId, mode);

    res.json({
      data: actions,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/runtime-hooks', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const hooks = await listRuntimeHooks(campaignId, characterId, {
      mode,
      hookPoint: cleanOptionalText(req.query.hook_point),
    });

    res.json({
      data: hooks,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/dynamic-opportunities', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const opportunities = await listDynamicOpportunities(campaignId, characterId, { mode });

    res.json({
      data: opportunities,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/runtime-hooks/execute', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.body.mode ?? req.query.mode, {
      defaultMode: 'player',
    });
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const result = await executeContentHooks({
      campaignId,
      characterId,
      hookPoint: cleanOptionalText(req.body.hook_point),
      actorAccountId,
      source: {
        type: 'api_debug',
        reason: cleanOptionalText(req.body.reason),
      },
      mode,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/time-beat', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.body.mode ?? req.query.mode, {
      defaultMode: 'player',
    });
    const result = await triggerTimeBeat(campaignId, characterId, {
      actor_account_id:
        req.body.actor_account_id === undefined || req.body.actor_account_id === null
          ? null
          : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
      beat_key: cleanOptionalText(req.body.beat_key),
      reason: cleanOptionalText(req.body.reason),
      mode,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/context-summary', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.query.mode);
    const summary = await getContextSummary(campaignId, characterId, mode);

    res.json({
      data: summary,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/act', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseRuntimeMode(req.body.mode ?? req.query.mode, {
      defaultMode: 'player',
    });
    const result = await actThroughPlayState(
      campaignId,
      characterId,
      {
        action_key: cleanOptionalText(req.body.action_key),
        action_type: cleanOptionalText(req.body.action_type ?? req.body.action),
        actor_account_id:
          req.body.actor_account_id === undefined || req.body.actor_account_id === null
            ? null
            : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
        scene_id:
          req.body.scene_id === undefined || req.body.scene_id === null
            ? undefined
            : parseRequiredId(req.body.scene_id, 'scene_id'),
        scene_key: cleanOptionalText(req.body.scene_key),
        transition_id:
          req.body.transition_id === undefined || req.body.transition_id === null
            ? undefined
            : parseRequiredId(req.body.transition_id, 'transition_id'),
        transition_key: cleanOptionalText(req.body.transition_key),
        npc_id:
          req.body.npc_id === undefined || req.body.npc_id === null
            ? undefined
            : parseRequiredId(req.body.npc_id, 'npc_id'),
        npc_key: cleanOptionalText(req.body.npc_key),
        session_id:
          req.body.session_id === undefined || req.body.session_id === null
            ? undefined
            : parseRequiredId(req.body.session_id, 'session_id'),
        option_id:
          req.body.option_id === undefined || req.body.option_id === null
            ? undefined
            : parseRequiredId(req.body.option_id, 'option_id'),
        option_key: cleanOptionalText(req.body.option_key),
        interaction_id:
          req.body.interaction_id === undefined || req.body.interaction_id === null
            ? undefined
            : parseRequiredId(req.body.interaction_id, 'interaction_id'),
        interaction_key: cleanOptionalText(req.body.interaction_key),
        event_id:
          req.body.event_id === undefined || req.body.event_id === null
            ? undefined
            : parseRequiredId(req.body.event_id, 'event_id'),
        combat_id:
          req.body.combat_id === undefined || req.body.combat_id === null
            ? undefined
            : parseRequiredId(req.body.combat_id, 'combat_id'),
        participant_id:
          req.body.participant_id === undefined || req.body.participant_id === null
            ? undefined
            : parseRequiredId(req.body.participant_id, 'participant_id'),
        target_participant_id:
          req.body.target_participant_id === undefined || req.body.target_participant_id === null
            ? undefined
            : parseRequiredId(req.body.target_participant_id, 'target_participant_id'),
        action_id:
          req.body.action_id === undefined || req.body.action_id === null
            ? undefined
            : parseRequiredId(req.body.action_id, 'action_id'),
        attack_roll:
          req.body.attack_roll === undefined || req.body.attack_roll === null
            ? undefined
            : parseRequiredId(req.body.attack_roll, 'attack_roll'),
        damage_rolls: req.body.damage_rolls,
        roll:
          req.body.roll === undefined || req.body.roll === null
            ? undefined
            : parseRequiredId(req.body.roll, 'roll'),
        visibility_mode: cleanOptionalText(req.body.visibility_mode),
        auto_advance_turns:
          req.body.auto_advance_turns === undefined
            ? undefined
            : parseOptionalBoolean(req.body.auto_advance_turns, 'auto_advance_turns'),
        initiative_overrides: req.body.initiative_overrides,
      },
      mode
    );

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/enter-scene', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const sceneState = await enterCharacterScene(campaignId, characterId, {
      scene_id:
        req.body.scene_id === undefined || req.body.scene_id === null
          ? undefined
          : parseRequiredId(req.body.scene_id, 'scene_id'),
      scene_key: cleanOptionalText(req.body.scene_key),
      actor_account_id: actorAccountId,
    });

    res.json({
      data: sceneState,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/move', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const sceneState = await moveCharacterScene(campaignId, characterId, {
      transition_id:
        req.body.transition_id === undefined || req.body.transition_id === null
          ? undefined
          : parseRequiredId(req.body.transition_id, 'transition_id'),
      transition_key: cleanOptionalText(req.body.transition_key),
      actor_account_id: actorAccountId,
    });

    res.json({
      data: sceneState,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/scene/npcs', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const npcs = await listCurrentSceneNpcs(campaignId, characterId);

    res.json({
      data: npcs,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/interactions/:interactionId/attempt', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const interactionId = parseRequiredId(req.params.interactionId, 'Interaction id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const result = await attemptSceneInteraction(campaignId, characterId, {
      interaction_id: interactionId,
      actor_account_id: actorAccountId,
      roll: req.body.roll,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/quests', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseAdventureMode(req.query.mode);
    const quests = await listAdventureQuests(campaignId, characterId, mode);

    res.json({
      data: quests,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/objectives', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const mode = parseAdventureMode(req.query.mode);
    const objectives = await listAdventureObjectives(campaignId, characterId, mode);

    res.json({
      data: objectives,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/flags', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const flags = await listCharacterNarrativeFlags(campaignId, characterId);

    res.json({
      data: flags,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/rewards', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const rewards = await listCharacterRewardApplications(campaignId, characterId);

    res.json({
      data: {
        campaign_id: campaignId,
        character_id: characterId,
        items: rewards,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/characters/:characterId/dialogue-sessions', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const limit = req.query.limit === undefined ? 25 : parseRequiredId(req.query.limit, 'limit');
    const offset =
      req.query.offset === undefined
        ? 0
        : parsePositiveInteger(req.query.offset, 'offset');
    const sessions = await listDialogueSessions(campaignId, characterId, limit, offset);

    res.json({
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/characters/:characterId/dialogues/start', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const characterId = parseRequiredId(req.params.characterId, 'Character id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const session = await startDialogueSession(campaignId, characterId, {
      dialogue_id:
        req.body.dialogue_id === undefined || req.body.dialogue_id === null
          ? undefined
          : parseRequiredId(req.body.dialogue_id, 'dialogue_id'),
      dialogue_key: cleanOptionalText(req.body.dialogue_key),
      npc_id:
        req.body.npc_id === undefined || req.body.npc_id === null
          ? undefined
          : parseRequiredId(req.body.npc_id, 'npc_id'),
      npc_key: cleanOptionalText(req.body.npc_key),
      actor_account_id: actorAccountId,
    });

    res.status(201).json({
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/dialogue-sessions/:id', async (req, res, next) => {
  try {
    const sessionId = parseRequiredId(req.params.id, 'Dialogue session id');
    const session = await getDialogueSession(sessionId);

    if (!session) {
      throw createHttpError('Dialogue session not found', 404);
    }

    res.json({
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue-sessions/:id/choose', async (req, res, next) => {
  try {
    const sessionId = parseRequiredId(req.params.id, 'Dialogue session id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const result = await chooseDialogueOption(sessionId, {
      option_id:
        req.body.option_id === undefined || req.body.option_id === null
          ? undefined
          : parseRequiredId(req.body.option_id, 'option_id'),
      option_key: cleanOptionalText(req.body.option_key),
      actor_account_id: actorAccountId,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/dialogue-sessions/:id/attempt-skill-check', async (req, res, next) => {
  try {
    const sessionId = parseRequiredId(req.params.id, 'Dialogue session id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const result = await attemptDialogueSkillCheck(sessionId, {
      option_id:
        req.body.option_id === undefined || req.body.option_id === null
          ? undefined
          : parseRequiredId(req.body.option_id, 'option_id'),
      option_key: cleanOptionalText(req.body.option_key),
      actor_account_id: actorAccountId,
      roll: req.body.roll,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/event-templates', async (_req, res, next) => {
  try {
    const templates = await listEventTemplates();

    res.json({
      data: templates,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/events', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const events = await listCharacterEvents(characterId);

    res.json({
      data: events,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events', async (req, res, next) => {
  try {
    const createdByAccountId =
      req.body.created_by_account_id === undefined || req.body.created_by_account_id === null
        ? null
        : parseRequiredId(req.body.created_by_account_id, 'created_by_account_id');
    const event = await createEventInstance({
      campaign_id: parseRequiredId(req.body.campaign_id, 'campaign_id'),
      character_id: parseRequiredId(req.body.character_id, 'character_id'),
      template_id:
        req.body.template_id === undefined || req.body.template_id === null
          ? null
          : parseRequiredId(req.body.template_id, 'template_id'),
      template_key:
        req.body.template_key === undefined ? null : cleanOptionalText(req.body.template_key),
      created_by_account_id: createdByAccountId,
    });

    res.status(201).json({
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:id', async (req, res, next) => {
  try {
    const eventId = parseRequiredId(req.params.id, 'Event id');
    const event = await getEventById(eventId);

    if (!event) {
      throw createHttpError('Event not found', 404);
    }

    res.json({
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:id/choose', async (req, res, next) => {
  try {
    const eventId = parseRequiredId(req.params.id, 'Event id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const event = await chooseEventOption(eventId, {
      option_id:
        req.body.option_id === undefined || req.body.option_id === null
          ? null
          : parseRequiredId(req.body.option_id, 'option_id'),
      option_key:
        req.body.option_key === undefined ? null : cleanOptionalText(req.body.option_key),
      actor_account_id: actorAccountId,
    });

    res.json({
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/overrides', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const overrides = await listCharacterOverrides(characterId);

    res.json({
      data: overrides,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/command-logs', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const character = await getCharacterById(characterId);

    if (!character) {
      throw createHttpError('Character not found', 404);
    }

    const rawLimit = req.query.limit;
    const limit =
      rawLimit === undefined
        ? 25
        : (() => {
            const parsed = Number(rawLimit);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
              throw createHttpError('limit must be an integer from 1 to 100', 400);
            }
            return parsed;
          })();
    const logs = await listCharacterCommandLogs(characterId, limit);

    res.json({
      data: logs,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/history', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const progression = await getCharacterProgression(characterId);

    if (!progression) {
      throw createHttpError('Character not found', 404);
    }

    const rawLimit = req.query.limit;
    const rawOffset = req.query.offset;
    const limit =
      rawLimit === undefined
        ? 25
        : (() => {
            const parsed = Number(rawLimit);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
              throw createHttpError('limit must be an integer from 1 to 100', 400);
            }
            return parsed;
          })();
    const offset =
      rawOffset === undefined
        ? 0
        : (() => {
            const parsed = Number(rawOffset);
            if (!Number.isInteger(parsed) || parsed < 0) {
              throw createHttpError('offset must be a non-negative integer', 400);
            }
            return parsed;
          })();

    const history = await listCharacterGameplayHistory(characterId, limit, offset);

    res.json({
      data: {
        character_id: characterId,
        limit,
        offset,
        items: history,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/progression', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const progression = await getCharacterProgression(characterId, {
      campaign_id:
        req.query.campaign_id === undefined
          ? null
          : parseRequiredId(req.query.campaign_id, 'campaign_id'),
    });

    if (!progression) {
      throw createHttpError('Character not found', 404);
    }

    res.json({
      data: progression,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/xp', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const amount = Number(req.body.amount);

    if (!Number.isInteger(amount) || amount <= 0) {
      throw createHttpError('amount must be a positive integer', 400);
    }

    const progression = await grantCharacterExperience(characterId, {
      amount,
      actor_account_id: actorAccountId,
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      reason: cleanOptionalText(req.body.reason),
      source_type: cleanOptionalText(req.body.source_type) ?? 'system',
      source_entity_id:
        req.body.source_entity_id === undefined || req.body.source_entity_id === null
          ? null
          : parseRequiredId(req.body.source_entity_id, 'source_entity_id'),
      dedupe_key: cleanOptionalText(req.body.dedupe_key),
      action_key: 'grant_xp',
    });

    res.json({
      data: progression,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/encounters/:slug/preview', async (req, res, next) => {
  try {
    const campaignId =
      req.query.campaign_id === undefined
        ? null
        : parseRequiredId(req.query.campaign_id, 'campaign_id');
    const worldId =
      req.query.world_id === undefined ? null : parseRequiredId(req.query.world_id, 'world_id');
    const characterId =
      req.query.character_id === undefined
        ? null
        : parseRequiredId(req.query.character_id, 'character_id');
    const party = parseOptionalBoolean(req.query.party, 'party') ?? false;
    const preview = await previewEncounter(req.params.slug, {
      campaign_id: campaignId,
      world_id: worldId,
      character_id: characterId,
      use_party: party,
      party,
    });

    res.json({
      data: preview,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/encounters/:slug/resolve', async (req, res, next) => {
  try {
    const resolved = await resolveEncounter(req.params.slug, {
      campaign_id: parseRequiredId(req.body.campaign_id, 'campaign_id'),
      character_id: parseRequiredId(req.body.character_id, 'character_id'),
      resolution_path: cleanOptionalText(req.body.resolution_path ?? req.body.path),
      actor_account_id:
        req.body.actor_account_id === undefined || req.body.actor_account_id === null
          ? null
          : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
      reason: cleanOptionalText(req.body.reason),
      summary: cleanOptionalText(req.body.summary),
    });

    res.json({
      data: resolved,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/party-strength', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const strength = await evaluatePartyStrength({
      campaign_id: campaignId,
      use_party: true,
      party: true,
    });

    res.json({
      data: strength,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/advancement', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const advancement = await getCharacterAdvancementStatus(characterId, {
      campaign_id:
        req.query.campaign_id === undefined
          ? null
          : parseRequiredId(req.query.campaign_id, 'campaign_id'),
      limit: req.query.limit === undefined ? 20 : parseRequiredId(req.query.limit, 'limit'),
      offset: req.query.offset === undefined ? 0 : parsePositiveInteger(req.query.offset, 'offset'),
    });

    if (!advancement) {
      throw createHttpError('Character not found', 404);
    }

    res.json({
      data: advancement,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/milestone', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const milestone = await grantMilestoneLevel(characterId, {
      actor_account_id:
        req.body.actor_account_id === undefined || req.body.actor_account_id === null
          ? null
          : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      target_level:
        req.body.target_level === undefined || req.body.target_level === null
          ? null
          : parseRequiredId(req.body.target_level, 'target_level'),
      level_count:
        req.body.level_count === undefined || req.body.level_count === null
          ? null
          : parseRequiredId(req.body.level_count, 'level_count'),
      reason: cleanOptionalText(req.body.reason),
      source_type: cleanOptionalText(req.body.source_type) ?? 'milestone',
      source_entity_id:
        req.body.source_entity_id === undefined || req.body.source_entity_id === null
          ? null
          : parseRequiredId(req.body.source_entity_id, 'source_entity_id'),
      dedupe_key: cleanOptionalText(req.body.dedupe_key),
    });

    res.json({
      data: milestone,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/level-up', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const advancement = await getCharacterAdvancementStatus(characterId, {
      campaign_id:
        req.query.campaign_id === undefined
          ? null
          : parseRequiredId(req.query.campaign_id, 'campaign_id'),
    });

    if (!advancement) {
      throw createHttpError('Character not found', 404);
    }

    res.json({
      data: {
        advancement,
        active_level_up_session: advancement.active_level_up_session,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/level-up/start', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const started = await startLevelUp(characterId, {
      actor_account_id:
        req.body.actor_account_id === undefined || req.body.actor_account_id === null
          ? null
          : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      target_character_class_id:
        req.body.target_character_class_id === undefined ||
        req.body.target_character_class_id === null
          ? null
          : parseRequiredId(req.body.target_character_class_id, 'target_character_class_id'),
      reason: cleanOptionalText(req.body.reason),
    });

    res.json({
      data: started,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/level-up/defer', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const deferred = await deferLevelUp(characterId, {
      actor_account_id:
        req.body.actor_account_id === undefined || req.body.actor_account_id === null
          ? null
          : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      reason: cleanOptionalText(req.body.reason),
    });

    res.json({
      data: deferred,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/level-up/hp', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const session = await chooseLevelUpHp(characterId, {
      actor_account_id:
        req.body.actor_account_id === undefined || req.body.actor_account_id === null
          ? null
          : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      method: cleanOptionalText(req.body.method),
    });

    res.json({
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/level-up/subclass', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const session = await chooseLevelUpSubclass(characterId, {
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      subclass_id: parseRequiredId(req.body.subclass_id, 'subclass_id'),
    });

    res.json({
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/level-up/spells', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const session = await chooseLevelUpSpells(characterId, {
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      cantrip_spell_ids: parseStringArrayInput(req.body.cantrip_spell_ids, 'cantrip_spell_ids'),
      known_spell_ids: parseStringArrayInput(req.body.known_spell_ids, 'known_spell_ids'),
    });

    res.json({
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/level-up/preview', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const preview = await previewLevelUp(characterId, {
      campaign_id:
        req.query.campaign_id === undefined
          ? null
          : parseRequiredId(req.query.campaign_id, 'campaign_id'),
    });

    res.json({
      data: preview,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/level-up/finalize', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const finalized = await finalizeLevelUp(characterId, {
      actor_account_id:
        req.body.actor_account_id === undefined || req.body.actor_account_id === null
          ? null
          : parseRequiredId(req.body.actor_account_id, 'actor_account_id'),
      campaign_id:
        req.body.campaign_id === undefined || req.body.campaign_id === null
          ? null
          : parseRequiredId(req.body.campaign_id, 'campaign_id'),
      reason: cleanOptionalText(req.body.reason),
    });

    res.json({
      data: finalized,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/level-sync', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const levelSync = await getCampaignLevelSync(campaignId);

    res.json({
      data: levelSync,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/advancement-config', async (req, res, next) => {
  try {
    const campaignId = parseRequiredId(req.params.id, 'Campaign id');
    const config = await setCampaignAdvancementConfig(campaignId, req.body);

    res.json({
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/worlds/:id/advancement-config', async (req, res, next) => {
  try {
    const worldId = parseRequiredId(req.params.id, 'World id');
    const config = await setWorldAdvancementConfig(worldId, req.body);

    res.json({
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/overrides', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? null
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const actorLabel = cleanOptionalText(req.body.actor_label);
    const override = await createCharacterOverride(characterId, {
      target_scope: cleanOptionalText(req.body.target_scope),
      target_entity_id:
        req.body.target_entity_id === undefined || req.body.target_entity_id === null
          ? null
          : parseRequiredId(req.body.target_entity_id, 'target_entity_id'),
      override_category: cleanOptionalText(req.body.override_category),
      subject_key: cleanOptionalText(req.body.subject_key),
      operation_type: cleanOptionalText(req.body.operation_type),
      value_json: parseOptionalObject(req.body.value_json, 'value_json'),
      reason: cleanOptionalText(req.body.reason),
      actor_account_id: actorAccountId,
      actor_label: actorLabel,
      is_active: parseOptionalBoolean(req.body.is_active, 'is_active') ?? true,
    });

    res.status(201).json({
      data: override,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/overrides/:id', async (req, res, next) => {
  try {
    const overrideId = parseRequiredId(req.params.id, 'Override id');
    const actorAccountId =
      req.body.actor_account_id === undefined || req.body.actor_account_id === null
        ? undefined
        : parseRequiredId(req.body.actor_account_id, 'actor_account_id');
    const override = await updateOverride(overrideId, {
      value_json: parseOptionalObject(req.body.value_json, 'value_json'),
      reason: req.body.reason !== undefined ? cleanOptionalText(req.body.reason) : undefined,
      actor_account_id: actorAccountId,
      actor_label: req.body.actor_label !== undefined ? cleanOptionalText(req.body.actor_label) : undefined,
      is_active:
        req.body.is_active !== undefined
          ? parseOptionalBoolean(req.body.is_active, 'is_active')
          : undefined,
    });

    res.json({
      data: override,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/commands/execute', async (req, res, next) => {
  try {
    const result = await executeCommand({
      type: req.body.type,
      characterId: req.body.characterId,
      actorAccountId: req.body.actorAccountId,
      payload: req.body.payload,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters', async (req, res, next) => {
  try {
    const name = cleanOptionalText(req.body.name);

    if (!name) {
      throw createHttpError('name is required', 400);
    }

    const payload = {
      account_id: parseRequiredId(req.body.account_id, 'account_id'),
      world_id:
        req.body.world_id === undefined || req.body.world_id === null
          ? undefined
          : parseRequiredId(req.body.world_id, 'world_id'),
      name,
      race_id: parsePositiveInteger(req.body.race_id, 'race_id'),
      subrace_id: parsePositiveInteger(req.body.subrace_id, 'subrace_id'),
      class_id: parsePositiveInteger(req.body.class_id, 'class_id'),
      subclass_id: parsePositiveInteger(req.body.subclass_id, 'subclass_id'),
      background_id: parsePositiveInteger(req.body.background_id, 'background_id'),
      alignment_id: parsePositiveInteger(req.body.alignment_id, 'alignment_id'),
      level: parsePositiveInteger(req.body.level ?? 1, 'level') ?? 1,
      experience_points: parsePositiveInteger(req.body.experience_points ?? 0, 'experience_points') ?? 0,
      strength: parsePositiveInteger(req.body.strength ?? 10, 'strength') ?? 10,
      dexterity: parsePositiveInteger(req.body.dexterity ?? 10, 'dexterity') ?? 10,
      constitution: parsePositiveInteger(req.body.constitution ?? 10, 'constitution') ?? 10,
      intelligence: parsePositiveInteger(req.body.intelligence ?? 10, 'intelligence') ?? 10,
      wisdom: parsePositiveInteger(req.body.wisdom ?? 10, 'wisdom') ?? 10,
      charisma: parsePositiveInteger(req.body.charisma ?? 10, 'charisma') ?? 10,
      max_hit_points: parsePositiveInteger(req.body.max_hit_points, 'max_hit_points'),
      current_hit_points: parsePositiveInteger(req.body.current_hit_points, 'current_hit_points'),
      temporary_hit_points: parsePositiveInteger(req.body.temporary_hit_points ?? 0, 'temporary_hit_points') ?? 0,
      armor_class: parsePositiveInteger(req.body.armor_class, 'armor_class'),
      speed: parsePositiveInteger(req.body.speed, 'speed'),
      proficiency_bonus: parsePositiveInteger(req.body.proficiency_bonus, 'proficiency_bonus'),
      personality_traits: cleanOptionalText(req.body.personality_traits),
      ideals: cleanOptionalText(req.body.ideals),
      bonds: cleanOptionalText(req.body.bonds),
      flaws: cleanOptionalText(req.body.flaws),
      backstory: cleanOptionalText(req.body.backstory),
      notes: cleanOptionalText(req.body.notes),
    };

    if (payload.level < 1) {
      throw createHttpError('level must be at least 1', 400);
    }

    const character = await createCharacter(payload);

    res.status(201).json({
      data: character,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/sheet', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const sheet = await getCharacterSheet(characterId);

    if (!sheet) {
      throw createHttpError('Character not found', 404);
    }

    res.json({
      data: sheet,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/rules', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const rules = await getCharacterRules(characterId);

    if (!rules) {
      throw createHttpError('Character not found', 404);
    }

    res.json({
      data: rules,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const character = await getCharacterById(characterId);

    if (!character) {
      throw createHttpError('Character not found', 404);
    }

    res.json({
      data: character,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/classes', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const classes = await listCharacterClasses(characterId);

    res.json({
      data: classes,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/classes', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const classId = parseRequiredId(req.body.class_id, 'class_id');
    const subclassId = parsePositiveInteger(req.body.subclass_id, 'subclass_id');
    const classLevel = parseRequiredId(req.body.class_level, 'class_level');
    const isPrimary = parseOptionalBoolean(req.body.is_primary, 'is_primary');

    const classes = await addCharacterClass(characterId, {
      class_id: classId,
      subclass_id: subclassId,
      class_level: classLevel,
      is_primary: isPrimary,
    });

    res.status(201).json({
      data: classes,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/languages', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const languages = await listCharacterLanguages(characterId);

    res.json({
      data: languages,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/languages', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const languageId = parseRequiredId(req.body.language_id, 'language_id');
    const languages = await addCharacterLanguage(characterId, languageId);

    res.status(201).json({
      data: languages,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/feats', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const feats = await listCharacterFeats(characterId);

    res.json({
      data: feats,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/spells', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const spells = await listCharacterSpells(characterId);

    res.json({
      data: spells,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/spells', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const spellId = parseRequiredId(req.body.spell_id, 'spell_id');
    const sourceClassId = parseRequiredId(req.body.source_class_id, 'source_class_id');
    const isKnown = parseOptionalBoolean(req.body.is_known, 'is_known') ?? true;
    const isPrepared = parseOptionalBoolean(req.body.is_prepared, 'is_prepared') ?? false;
    const notes = cleanOptionalText(req.body.notes);
    const spellSource = cleanOptionalText(req.body.spell_source) || 'manual_class';

    const spells = await addCharacterSpell(characterId, {
      spell_id: spellId,
      source_class_id: sourceClassId,
      spell_source: spellSource,
      is_known: isKnown,
      is_prepared: isPrepared,
      notes,
    });

    res.status(201).json({
      data: spells,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/characters/:id/spells/:characterSpellId', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const characterSpellId = parseRequiredId(req.params.characterSpellId, 'Character spell id');
    const isKnown = parseOptionalBoolean(req.body.is_known, 'is_known');
    const isPrepared = parseOptionalBoolean(req.body.is_prepared, 'is_prepared');
    const notes = req.body.notes !== undefined ? cleanOptionalText(req.body.notes) : undefined;

    const spells = await updateCharacterSpell(characterId, characterSpellId, {
      is_known: isKnown,
      is_prepared: isPrepared,
      notes,
    });

    res.json({
      data: spells,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/spell-slots', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const spellSlots = await getCharacterSpellSlots(characterId);

    res.json({
      data: spellSlots,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/items', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const inventory = await listCharacterItems(characterId);

    res.json({
      data: inventory,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/items', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const itemId = parseRequiredId(req.body.item_id, 'item_id');
    const quantity = parseRequiredId(req.body.quantity ?? 1, 'quantity');
    const isEquipped = parseOptionalBoolean(req.body.is_equipped, 'is_equipped') ?? false;
    const isAttuned = parseOptionalBoolean(req.body.is_attuned, 'is_attuned') ?? false;
    const parentCharacterItemId =
      req.body.parent_character_item_id === undefined
        ? null
        : req.body.parent_character_item_id === null
          ? null
          : parseRequiredId(req.body.parent_character_item_id, 'parent_character_item_id');
    const currentUses =
      req.body.current_uses === undefined || req.body.current_uses === null
        ? null
        : parsePositiveInteger(req.body.current_uses, 'current_uses');
    const maxUses =
      req.body.max_uses === undefined || req.body.max_uses === null
        ? null
        : parsePositiveInteger(req.body.max_uses, 'max_uses');
    const notes = cleanOptionalText(req.body.notes);

    const inventory = await addCharacterItem(characterId, {
      item_id: itemId,
      parent_character_item_id: parentCharacterItemId,
      quantity,
      is_equipped: isEquipped,
      is_attuned: isAttuned,
      current_uses: currentUses,
      max_uses: maxUses,
      notes,
    });

    res.status(201).json({
      data: inventory,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/characters/:id/items/:characterItemId', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const characterItemId = parseRequiredId(req.params.characterItemId, 'Character item id');
    const quantity =
      req.body.quantity === undefined ? undefined : parseRequiredId(req.body.quantity, 'quantity');
    const isEquipped =
      req.body.is_equipped === undefined
        ? undefined
        : parseOptionalBoolean(req.body.is_equipped, 'is_equipped');
    const isAttuned =
      req.body.is_attuned === undefined
        ? undefined
        : parseOptionalBoolean(req.body.is_attuned, 'is_attuned');
    const parentCharacterItemId =
      req.body.parent_character_item_id === undefined
        ? undefined
        : req.body.parent_character_item_id === null
          ? null
          : parseRequiredId(req.body.parent_character_item_id, 'parent_character_item_id');
    const currentUses =
      req.body.current_uses === undefined
        ? undefined
        : req.body.current_uses === null
          ? null
          : parsePositiveInteger(req.body.current_uses, 'current_uses');
    const maxUses =
      req.body.max_uses === undefined
        ? undefined
        : req.body.max_uses === null
          ? null
          : parsePositiveInteger(req.body.max_uses, 'max_uses');
    const notes = req.body.notes !== undefined ? cleanOptionalText(req.body.notes) : undefined;

    const inventory = await updateCharacterItem(characterId, characterItemId, {
      parent_character_item_id: parentCharacterItemId,
      quantity,
      is_equipped: isEquipped,
      is_attuned: isAttuned,
      current_uses: currentUses,
      max_uses: maxUses,
      notes,
    });

    res.json({
      data: inventory,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/characters/:id/currency', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const currency = await getCharacterCurrency(characterId);

    res.json({
      data: currency,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/characters/:id/currency', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const currency = await updateCharacterCurrency(characterId, {
      cp: req.body.cp === undefined ? undefined : parsePositiveInteger(req.body.cp, 'cp'),
      sp: req.body.sp === undefined ? undefined : parsePositiveInteger(req.body.sp, 'sp'),
      ep: req.body.ep === undefined ? undefined : parsePositiveInteger(req.body.ep, 'ep'),
      gp: req.body.gp === undefined ? undefined : parsePositiveInteger(req.body.gp, 'gp'),
      pp: req.body.pp === undefined ? undefined : parsePositiveInteger(req.body.pp, 'pp'),
    });

    res.json({
      data: currency,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/spell-slots/use', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const slotLevel = parseRequiredId(req.body.slot_level, 'slot_level');
    const amount = parseRequiredId(req.body.amount ?? 1, 'amount');
    const slotPool = cleanOptionalText(req.body.slot_pool) || 'standard';

    const spellSlots = await changeCharacterSpellSlots(characterId, {
      mode: 'use',
      slot_pool: slotPool,
      slot_level: slotLevel,
      amount,
    });

    res.json({
      data: spellSlots,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/spell-slots/restore', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const slotLevel = parseRequiredId(req.body.slot_level, 'slot_level');
    const amount = parseRequiredId(req.body.amount ?? 1, 'amount');
    const slotPool = cleanOptionalText(req.body.slot_pool) || 'standard';

    const spellSlots = await changeCharacterSpellSlots(characterId, {
      mode: 'restore',
      slot_pool: slotPool,
      slot_level: slotLevel,
      amount,
    });

    res.json({
      data: spellSlots,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/characters/:id/feats', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const featId = parseRequiredId(req.body.feat_id, 'feat_id');
    const acquiredLevel = parsePositiveInteger(req.body.acquired_level, 'acquired_level');
    const notes = cleanOptionalText(req.body.notes);

    if (acquiredLevel !== null && acquiredLevel < 1) {
      throw createHttpError('acquired_level must be at least 1', 400);
    }

    const feats = await addCharacterFeat(characterId, {
      feat_id: featId,
      acquired_level: acquiredLevel,
      notes,
    });

    res.status(201).json({
      data: feats,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/combats', async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.participants)) {
      throw createHttpError('participants must be an array', 400);
    }

    const combat = await createCombat({
      campaign_id: req.body.campaign_id,
      scene_id: req.body.scene_id,
      event_id: req.body.event_id,
      created_by_account_id: req.body.created_by_account_id,
      visibility_mode: req.body.visibility_mode,
      auto_advance_turns:
        req.body.auto_advance_turns === undefined
          ? undefined
          : parseOptionalBoolean(req.body.auto_advance_turns, 'auto_advance_turns'),
      participants: req.body.participants,
    });

    res.status(201).json({
      data: combat,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/combats/:id', async (req, res, next) => {
  try {
    const combatId = parseRequiredId(req.params.id, 'Combat id');
    const combat = await getCombatById(combatId);

    if (!combat) {
      throw createHttpError('Combat not found', 404);
    }

    res.json({
      data: combat,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/combats/:id/start', async (req, res, next) => {
  try {
    const combatId = parseRequiredId(req.params.id, 'Combat id');

    const combat = await startCombat(combatId, {
      actor_account_id: req.body.actor_account_id,
      initiative_overrides: req.body.initiative_overrides,
    });

    res.json({
      data: combat,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/combats/:id/act', async (req, res, next) => {
  try {
    const combatId = parseRequiredId(req.params.id, 'Combat id');

    if (req.body.damage_rolls !== undefined && !Array.isArray(req.body.damage_rolls)) {
      throw createHttpError('damage_rolls must be an array', 400);
    }

    if (req.body.target_participant_ids !== undefined && !Array.isArray(req.body.target_participant_ids)) {
      throw createHttpError('target_participant_ids must be an array', 400);
    }

    const result = await actInCombat(combatId, {
      actor_account_id: req.body.actor_account_id,
      participant_id: req.body.participant_id,
      action_id: req.body.action_id,
      target_participant_id: req.body.target_participant_id,
      target_participant_ids: req.body.target_participant_ids,
      attack_roll: req.body.attack_roll,
      damage_rolls: req.body.damage_rolls,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/combats/:id/end-turn', async (req, res, next) => {
  try {
    const combatId = parseRequiredId(req.params.id, 'Combat id');
    const combat = await endCombatTurn(combatId, {
      actor_account_id: req.body.actor_account_id,
      participant_id: req.body.participant_id,
    });

    res.json({
      data: combat,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/combats/:id/ai-turn', async (req, res, next) => {
  try {
    const combatId = parseRequiredId(req.params.id, 'Combat id');

    if (req.body.damage_rolls !== undefined && !Array.isArray(req.body.damage_rolls)) {
      throw createHttpError('damage_rolls must be an array', 400);
    }

    const result = await resolveCombatAiTurn(combatId, {
      actor_account_id: req.body.actor_account_id,
      attack_roll: req.body.attack_roll,
      damage_rolls: req.body.damage_rolls,
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/characters/:id/inactivate', async (req, res, next) => {
  try {
    const characterId = parseRequiredId(req.params.id, 'Character id');
    const character = await inactivateCharacter(characterId);

    res.json({
      data: character,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
