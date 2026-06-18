import { pool } from '../config/db.js';
import { executeCommand } from '../engine/commands/commandExecutor.js';
import { listRegisteredCommandTypes } from '../engine/commands/commandRegistry.js';
import { getCharacterRules } from '../services/characterRulesService.js';
import { getCharacterSheet } from '../services/characterSheetService.js';
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
import { listCharacterGameplayHistory } from '../services/gameplayHistoryService.js';
import { listCharacterItems } from '../services/inventoryService.js';
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
import { listCharacterOverrides } from '../services/overrideService.js';
import { getCharacterProgression, grantCharacterExperience } from '../services/progressionService.js';
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
import {
  listSmsSimulatorTemplates,
  renderSimulatorOutbound,
  renderSimulatorState,
  simulateSmsInboundReply,
} from '../services/smsSimulatorService.js';
import { validateSmsTemplateRegistry } from '../sms/smsTemplateValidation.js';
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
  getCharacterSpellSlots,
  listCharacterSpells,
} from '../services/spellService.js';
import {
  importContentPackage,
  loadAndValidateContentPackage,
} from '../content/contentImporter.js';
import { createHttpError } from '../utils/httpError.js';

const usageText = `DailyRPG developer CLI

Usage:
  npm run cli -- <subcommand> [options]

Subcommands:
  list-worlds      Show available world instances
  show-world       Show one world summary
  show-world-state Show Stage 5G-friendly alias for current world truth
  show-world-history Show Stage 5F event-sourced world changes
  show-world-truth Show current world truth projected from world changes
  record-world-change Record a classified world change and propagation receipts
  trigger-world-beat Trigger a Stage 5F world-level time beat
  propagate-world-knowledge Reveal available delayed/rumor/proximity world knowledge
  show-character-knowledge Show character-known world changes and rumors
  show-entity-events Show persistent world entity movement/state history
  list-world-campaigns Show campaigns inside a world
  show-character-campaigns Show all campaign contexts for a character
  list-world-regions Show world -> region -> location -> scene hierarchy
  list-world-entities Show persistent world-level NPC and monster instances
  show-location    Show a world-level location with scene and overlay state
  list-campaigns   Show available campaigns
  show-campaign    Show one campaign by numeric id or slug
  create-campaign  Create a campaign scope
  add-campaign-character Add a character to a campaign
  list-event-templates Show available event templates
  list-events      Show events for a character
  create-event     Create a Stage 3C event instance
  show-event       Show a persisted event instance
  choose-event-option Resolve an active event option
  list-scenes      Show available scenes for a campaign character
  show-scene       Show the current scene state for a campaign character
  show-clues       Show discovered Stage 5G clue knowledge for a campaign character
  enter-scene      Enter a starting scene for a campaign character
  move-scene       Move through an explicit scene transition
  list-scene-npcs  Show NPCs in the current scene
  interact         Attempt a Stage 4A scene interaction
  list-dialogue-sessions Show persisted dialogue sessions for a campaign character
  talk-to-npc      Start a Stage 4B dialogue with an NPC in the current scene
  inspect-dialogue-state Show one dialogue session, including node state and choices
  choose-dialogue-option Choose a dialogue option and resolve direct or implicit outcomes
  attempt-dialogue-skill-check Resolve an explicit dialogue skill check
  list-stat-blocks Show Stage 4B.5 stat block summaries
  view-stat-block  Show one stat block with actions, traits, and defenses
  list-actions     Show structured actions for a stat block
  view-action      Show one action definition with damage and effects
  start-combat     Create and immediately start a Stage 4C combat
  show-combat      Show one persisted combat state
  list-combat-participants Show combat participants only
  take-turn        Execute one combat action for the current participant
  end-turn         Advance combat explicitly to the next participant
  resolve-ai-turn  Let the current AI participant take its turn
  show-adventure-state Show Stage 4D adventure state with minimal, player, or gm visibility
  show-objectives  Show Stage 4D objective state with visibility filtering
  show-quests      Show Stage 4D quest state with visibility filtering
  show-log         Show Stage 4D campaign log with knowledge-aware filtering
  show-play-state  Show the Stage 4E playable runtime state
  show-available-actions Show the curated Stage 4E action list
  show-context-summary Show the Stage 4E short context summary
  act             Execute one Stage 4E playable action
  show-runtime    Show the Stage 5E orchestrated live runtime
  show-opportunities Show Stage 5E primary/secondary opportunity curation
  show-context    Show Stage 5E assembled scene, thread, and presentation context
  runtime-act     Execute a playable action and return the Stage 5E runtime
  show-runtime-debug Show the full Stage 5E runtime with debug internals
  open-progression-window Open an async party/campaign progression window
  trigger-progression-window Stage 5G alias for opening an async progression window
  show-progression-window Inspect a Stage 5F progression window
  list-progression-windows List Stage 5F progression windows
  submit-window-response Submit one character response into a progression window
  resolve-progression-window Resolve a threshold-reached window and apply defaults
  simulate-default-action Resolve the most relevant threshold-reached window for one character
  show-catchup    Show character-perspective reconciliation/catch-up summary
  show-runtime-hooks Show imported Stage 5D hooks and condition results in context
  show-dynamic-opportunities Show active dynamic scene/opportunity refresh data
  execute-runtime-hook Execute one Stage 5D hook point for debugging
  trigger-time-beat Trigger a Stage 5D discrete time-beat hook pass
  list-quests      Show narrative quest and objective state
  list-flags       Show campaign and character narrative flags
  list-rewards     Show centralized reward applications for a campaign character
  list-campaign-logs Show campaign-level narrative log history
  history         Show unified gameplay history for a character
  xp              Show character progression and experience points
  show-xp         Show full Stage 5H advancement state for a character
  grant-xp        Grant experience points for testing
  grant-milestone Grant one or more pending milestone levels
  show-level-up   Inspect active or pending level-up state
  start-level-up  Start or resume a deferred level-up session
  choose-hp       Choose fixed or rolled hit points for the active level-up
  choose-subclass Choose subclass for the active level-up if required
  choose-spells   Choose cantrips or spells for the active level-up
  preview-level-up Recompute and show the current level-up preview
  finalize-level-up Finalize the active level-up atomically
  defer-level-up  Defer the current level-up session
  show-party-levels Show party soft-sync spread for a campaign
  validate-encounters Validate Stage 5I encounter templates in a content package
  preview-party-strength Preview simple v1 party strength for encounter scaling
  preview-encounter Preview Stage 5I encounter scaling for a character or party
  scale-encounter Alias for preview-encounter with scaling details
  simulate-encounter-difficulty Show encounter difficulty scoring details
  resolve-encounter Resolve an encounter by combat or non-combat path and grant equivalent rewards
  validate-sms-templates Validate the Stage 6A.0 SMS template registry
  list-sms-templates List registered Stage 6A.0 SMS templates
  render-sms-template Render one registered SMS template through the shared formatter
  render-sms-state Render a simulator SMS state through the shared formatter
  simulate-sms-reply Simulate inbound SMS input and return the outbound template response
  set-campaign-advancement Configure campaign advancement mode and weights
  set-world-advancement Configure world default advancement mode and weights
  show-sheet      Show the unified character sheet
  show-rules      Show the Stage 3A derived rules view
  list-spells     Show character spells and spell slots
  list-items      Show character inventory and summary
  show-overrides  Show active and inactive overrides for a character
  run-command     Execute a Stage 3B atomic command
  validate-content Validate a Stage 5C content package without writing to the database
  import-content  Import a Stage 5C content package transactionally
  help            Show this help

Common options:
  --character <id>   Character id
  --world <id>       World id
  --window <id>      Stage 5F progression window id
  --change-key <key> Stable world-change key
  --change-type <type> World-change type
  --scope <scope>    Propagation scope: campaign_local, regional, or global
  --channel <channel> Knowledge channel: direct, proximity, rumor, time_delay, or system
  --campaign <id>    Campaign id
  --event <id>       Event id
  --location <id>    Location id
  --option <id>      Event option id
  --option-key <key> Event option key
  --template <key>   Event template key
  --scene <id>       Scene id
  --scene-key <key>  Scene key
  --transition <id>  Transition id
  --transition-key <key> Transition key
  --interaction <id> Interaction id
  --interaction-key <key> Interaction key
  --npc <id>         NPC id
  --npc-key <key>    NPC key
  --dialogue <id>    Dialogue id
  --dialogue-key <key> Dialogue key
  --session <id>     Dialogue session id
  --stat-block <id>  Stat block id
  --action <id>      Action id
  --action-id <id>   Runtime combat action id for Stage 4E act
  --combat <id>      Combat id
  --participant <id> Combat participant id
  --target <id>      Target combat participant id
  --roll <n>         d20 roll override for skill-check interactions
  --attack-roll <n>  d20 roll override for combat attack resolution
  --damage-rolls <json> Combat damage dice overrides as a JSON array
  --participants <json> Combat participants as a JSON array
  --initiative-overrides <json> Initiative overrides as a JSON array
  --visibility <mode> Combat visibility mode: narrative or debug
  --mode <mode>      Visibility mode: minimal, player, full (runtime) or gm (adventure alias)
  --action-key <key> Runtime action key from show-available-actions
  --hook-point <key> Stage 5D hook point, such as scene_enter or time_beat
  --beat-key <key> Optional Stage 5D time beat key
  --threshold-minutes <n> Async progression threshold in minutes
  --participants <json> JSON array, used by combat or progression windows depending subcommand
  --response-key <key> Async window response key
  --summary <text> Summary text for world changes/responses
  --title <text> Title text for world changes
  --truth-delta <json> JSON object for world flags/entity updates
  --knowledge-policy <json> JSON object controlling initial knowledge propagation
  --mark-seen <true|false> Mark catch-up summary as seen
  --auto-advance <true|false> Auto-advance turns after actions
  --active-context <true|false> Mark a campaign membership as the character's active context
  --limit <n>        Result limit for list/history commands
  --offset <n>       Result offset for history commands
  --amount <n>       Positive integer amount for grant-xp
  --encounter <slug> Encounter template slug
  --party <id>       Campaign id used as party context for encounter tools
  --resolution-path <path> Encounter resolution path such as combat, negotiation, stealth, or avoidance
  --template-id <id> SMS template id for render-sms-template
  --variables <json> JSON object of SMS template variables
  --input <text>     Inbound SMS text for simulate-sms-reply
  --state <name>     Simulator state for render-sms-state
  --reason <text>    Optional reason for progression writes
  --name <text>      Name for creation commands
  --slug <text>      Optional slug for creation commands
  --campaign-type <type> Campaign type: solo, party, questline, or world_event
  --status <status> Campaign status: active, dormant, completed, or archived
  --description <text> Optional description text
  --actor <id>       Optional actor account id
  --compact          Print compact JSON instead of pretty JSON

run-command/content options:
  --type <name>      Command type
  --payload <json>   Command payload as a JSON object
  --path <path>      Content package path for validate-content/import-content
  --dry-run          Validate and report planned import writes without changing the database

Examples:
  npm run cli -- validate-content --path content/worlds/emberfall
  npm run cli -- import-content --path content/worlds/emberfall --dry-run
  npm run cli -- import-content --path content/worlds/emberfall
  npm run cli -- list-worlds
  npm run cli -- show-world --world 1
  npm run cli -- show-world-state --world greyvale
  npm run cli -- list-world-campaigns --world 1
  npm run cli -- show-campaign --id shadows_grey_road
  npm run cli -- show-character-campaigns --character 6
  npm run cli -- list-world-regions --world 1
  npm run cli -- list-world-entities --world 1
  npm run cli -- show-location --location 1
  npm run cli -- show-scene --scene 3
  npm run cli -- list-campaigns
  npm run cli -- show-scene --character 13
  npm run cli -- show-clues --character 13
  npm run cli -- create-campaign --world 1 --campaign-type party --name "Dev Campaign" --actor 9
  npm run cli -- add-campaign-character --campaign 1 --character 6 --active-context true --actor 9
  npm run cli -- list-event-templates
  npm run cli -- create-event --campaign 1 --character 6 --template roadside_cache --actor 9
  npm run cli -- show-event --event 1
  npm run cli -- choose-event-option --event 1 --option-key take_coin_purse --actor 9
  npm run cli -- list-scenes --campaign 1 --character 6
  npm run cli -- show-scene --campaign 1 --character 6
  npm run cli -- enter-scene --campaign 1 --character 6
  npm run cli -- move-scene --campaign 1 --character 6 --transition-key follow_waystone_road --actor 9
  npm run cli -- list-scene-npcs --campaign 1 --character 6
  npm run cli -- interact --campaign 1 --character 6 --interaction-key calm_rowan --roll 16 --actor 9
  npm run cli -- talk-to-npc --campaign 1 --character 6 --npc-key elder_rowan --actor 9
  npm run cli -- choose-dialogue-option --session 1 --option-key ask_whats_wrong --actor 9
  npm run cli -- attempt-dialogue-skill-check --session 1 --roll 15 --actor 9
  npm run cli -- inspect-dialogue-state --session 1
  npm run cli -- list-stat-blocks
  npm run cli -- view-stat-block --stat-block 1
  npm run cli -- list-actions --stat-block 1
  npm run cli -- view-action --action 1
  npm run cli -- start-combat --campaign 4 --scene 3 --visibility debug --auto-advance false --participants '[{"entity_type":"character","entity_id":6,"faction":"player"},{"entity_type":"monster","entity_id":1,"faction":"enemy"}]' --initiative-overrides '[{"entity_type":"character","entity_id":6,"roll":15},{"entity_type":"monster","entity_id":1,"roll":8}]'
  npm run cli -- show-combat --combat 3
  npm run cli -- take-turn --combat 3 --participant 4 --action 6 --target 5 --attack-roll 18 --damage-rolls '[4]'
  npm run cli -- end-turn --combat 3 --participant 4
  npm run cli -- resolve-ai-turn --combat 3 --attack-roll 16 --damage-rolls '[4]'
  npm run cli -- show-adventure-state --campaign 1 --character 6 --mode player
  npm run cli -- show-objectives --campaign 1 --character 6 --mode player
  npm run cli -- show-quests --campaign 1 --character 6 --mode gm
  npm run cli -- show-log --campaign 1 --character 6 --mode player --limit 10
  npm run cli -- show-play-state --campaign 1 --character 6 --mode player
  npm run cli -- show-available-actions --campaign 1 --character 6 --mode player
  npm run cli -- show-context-summary --campaign 1 --character 6 --mode minimal
  npm run cli -- act --campaign 1 --character 6 --action enter_scene --scene-key willowmere_square
  npm run cli -- act --campaign 1 --character 6 --action talk_to_npc --npc-key elder_rowan
  npm run cli -- act --campaign 1 --character 6 --action choose_dialogue_option --option-key ask_whats_wrong
  npm run cli -- show-runtime --campaign 1 --character 6 --mode player
  npm run cli -- show-opportunities --campaign 1 --character 6 --mode player
  npm run cli -- show-context --campaign 1 --character 6 --mode minimal
  npm run cli -- runtime-act --campaign 1 --character 6 --action scene_interaction --interaction-key inspect-ember-sign --roll 16 --actor 9
  npm run cli -- show-runtime-debug --campaign 1 --character 6
  npm run cli -- show-runtime-hooks --campaign 1 --character 6 --hook-point scene_enter --mode full
  npm run cli -- show-dynamic-opportunities --campaign 1 --character 6 --mode player
  npm run cli -- trigger-time-beat --campaign 1 --character 6 --beat-key evening_watch --actor 9
  npm run cli -- trigger-progression-window --campaign 33 --participants '[13,14]' --prompt "Decide what to do next." --threshold-minutes 5 --default-action wait
  npm run cli -- simulate-default-action --campaign 33 --character 14
  npm run cli -- list-quests --campaign 1 --character 6
  npm run cli -- list-flags --campaign 1 --character 6
  npm run cli -- list-rewards --campaign 1 --character 6
  npm run cli -- history --character 6 --limit 10
  npm run cli -- xp --character 6
  npm run cli -- grant-xp --character 6 --amount 50 --actor 9 --reason "Milestone validation"
  npm run cli -- validate-encounters --path content/worlds/greyvale
  npm run cli -- preview-party-strength --character 13
  npm run cli -- preview-party-strength --party 33
  npm run cli -- preview-encounter --encounter shrine-rusk-confrontation --campaign 33 --character 13
  npm run cli -- preview-encounter --encounter shrine-rusk-confrontation --party 33
  npm run cli -- simulate-encounter-difficulty --encounter shrine-rusk-confrontation --party 33
  npm run cli -- resolve-encounter --encounter shrine-rusk-confrontation --campaign 33 --character 13 --resolution-path negotiation
  npm run cli -- validate-sms-templates
  npm run cli -- list-sms-templates
  npm run cli -- render-sms-template --template-id sms.help --variables '{"brand_name":"DailyTTRPG","support_email":"dailyttrpg@gmail.com"}'
  npm run cli -- simulate-sms-reply --input HELP
  npm run cli -- show-sheet --character 6
  npm run cli -- show-rules --character 6
  npm run cli -- list-spells --character 6
  npm run cli -- list-items --character 6
  npm run cli -- run-command --type cast_spell --character 6 --actor 9 --payload '{"spellId":18,"slotLevel":1,"slotPool":"standard"}'
`;

function printJson(payload, compact = false) {
  const spacing = compact ? 0 : 2;
  process.stdout.write(`${JSON.stringify(payload, null, spacing)}\n`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0] || 'help';
  const options = {};

  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      throw createHttpError(`Unexpected argument: ${token}`, 400);
    }

    const key = token.slice(2);
    const nextValue = args[index + 1];

    if (nextValue === undefined || nextValue.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }

  return {
    subcommand,
    options,
  };
}

function readPositiveIntegerOption(options, key, label) {
  const value = options[key];
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function readOptionalPositiveIntegerOption(options, key, label) {
  if (options[key] === undefined || options[key] === true) {
    return null;
  }

  return readPositiveIntegerOption(options, key, label);
}

function readOptionalTrimmedTextOption(options, key) {
  if (options[key] === undefined || options[key] === true) {
    return null;
  }

  const value = String(options[key]).trim();
  return value === '' ? null : value;
}

function readStringArrayOption(options, key, label) {
  if (options[key] === undefined || options[key] === true) {
    return [];
  }

  return String(options[key])
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function readOptionalRollOption(options) {
  if (options.roll === undefined || options.roll === true) {
    return undefined;
  }

  const parsed = Number(options.roll);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw createHttpError('--roll must be an integer from 1 to 20', 400);
  }

  return parsed;
}

function readOptionalD20Option(options, key, label) {
  if (options[key] === undefined || options[key] === true) {
    return undefined;
  }

  const parsed = Number(options[key]);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw createHttpError(`${label} must be an integer from 1 to 20`, 400);
  }

  return parsed;
}

function readOptionalBooleanOption(options, key, label, fallback = undefined) {
  if (options[key] === undefined || options[key] === true) {
    return fallback;
  }

  if (typeof options[key] === 'boolean') {
    return options[key];
  }

  if (options[key] === 'true') {
    return true;
  }

  if (options[key] === 'false') {
    return false;
  }

  throw createHttpError(`${label} must be true or false`, 400);
}

function readAdventureModeOption(options, fallback = 'player') {
  if (options.mode === undefined || options.mode === true) {
    return fallback;
  }

  const normalized = String(options.mode).trim() || fallback;

  if (!['minimal', 'player', 'gm'].includes(normalized)) {
    throw createHttpError('--mode must be minimal, player, or gm', 400);
  }

  return normalized;
}

function readRuntimeModeOption(options, fallback = 'player') {
  if (options.mode === undefined || options.mode === true) {
    return fallback;
  }

  const normalized = String(options.mode).trim() || fallback;

  if (!['minimal', 'player', 'full', 'gm', 'debug'].includes(normalized)) {
    throw createHttpError('--mode must be minimal, player, or full', 400);
  }

  if (normalized === 'gm' || normalized === 'debug') {
    return 'full';
  }

  return normalized;
}

function readJsonArrayOption(options, key, label, fallback = undefined) {
  if (options[key] === undefined || options[key] === true) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(options[key]);

    if (!Array.isArray(parsed)) {
      throw new Error('value must be a JSON array');
    }

    return parsed;
  } catch (error) {
    throw createHttpError(`${label} must be valid JSON: ${error.message}`, 400);
  }
}

function readJsonObjectOption(options, key, label, fallback = undefined) {
  if (options[key] === undefined || options[key] === true) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(options[key]);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('value must be a JSON object');
    }

    return parsed;
  } catch (error) {
    throw createHttpError(`${label} must be valid JSON: ${error.message}`, 400);
  }
}

function readCommandPayload(options) {
  if (options.payload === undefined || options.payload === true) {
    return {};
  }

  try {
    const parsed = JSON.parse(options.payload);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('payload must be a JSON object');
    }

    return parsed;
  } catch (error) {
    throw createHttpError(`payload must be valid JSON: ${error.message}`, 400);
  }
}

function readCommandType(options) {
  const value = String(options.type ?? '').trim();

  if (!value) {
    throw createHttpError('--type is required for run-command', 400);
  }

  return value;
}

function readRequiredPathOption(options) {
  const value = String(options.path ?? '').trim();

  if (!value) {
    throw createHttpError('--path is required', 400);
  }

  return value;
}

function readOptionalNonNegativeIntegerOption(options, key, label, fallback = null) {
  if (options[key] === undefined || options[key] === true) {
    return fallback;
  }

  const parsed = Number(options[key]);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError(`${label} must be a non-negative integer`, 400);
  }

  return parsed;
}

async function resolveWorldIdBySlugOrId(identifier) {
  const trimmed = String(identifier ?? '').trim();

  if (!trimmed) {
    throw createHttpError('A world id or slug is required', 400);
  }

  const numeric = Number(trimmed);

  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }

  const worlds = await listWorlds();
  const match = worlds.find((entry) => entry.slug === trimmed || entry.name === trimmed);

  if (!match) {
    throw createHttpError(`World not found for "${trimmed}"`, 404);
  }

  return match.id;
}

async function resolveCampaignRecordBySlugOrId(identifier) {
  const trimmed = String(identifier ?? '').trim();

  if (!trimmed) {
    throw createHttpError('A campaign id or slug is required', 400);
  }

  const numeric = Number(trimmed);

  if (Number.isInteger(numeric) && numeric > 0) {
    const campaign = await getCampaignById(numeric);

    if (!campaign) {
      throw createHttpError('Campaign not found', 404);
    }

    return campaign;
  }

  const campaigns = await listCampaigns();
  const match = campaigns.find((entry) => entry.slug === trimmed || entry.name === trimmed);

  if (!match) {
    throw createHttpError(`Campaign not found for "${trimmed}"`, 404);
  }

  return getCampaignById(match.id);
}

async function resolveActiveCampaignIdForCharacter(characterId) {
  const memberships = await listCharacterCampaigns(characterId);
  const activeMembership = memberships.memberships.find(
    (entry) =>
      entry.is_active_context === true &&
      entry.is_active === true &&
      entry.membership_status === 'active'
  );

  if (!activeMembership) {
    throw createHttpError(
      'No active campaign context was found for this character. Provide --campaign explicitly.',
      404
    );
  }

  return activeMembership.campaign_id;
}

async function resolveCampaignIdFromOptions(options, characterId = null) {
  const explicitCampaignId = readOptionalPositiveIntegerOption(options, 'campaign', '--campaign');

  if (explicitCampaignId !== null) {
    return explicitCampaignId;
  }

  if (characterId === null) {
    throw createHttpError('--campaign is required', 400);
  }

  return resolveActiveCampaignIdForCharacter(characterId);
}

async function runShowSheet(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const sheet = await getCharacterSheet(characterId);

  if (!sheet) {
    throw createHttpError('Character not found', 404);
  }

  return sheet;
}

async function runShowRules(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const rules = await getCharacterRules(characterId);

  if (!rules) {
    throw createHttpError('Character not found', 404);
  }

  return rules;
}

async function runListWorlds() {
  return listWorlds();
}

async function runShowWorld(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  const world = await getWorldById(worldId);

  if (!world) {
    throw createHttpError('World not found', 404);
  }

  return world;
}

async function runShowWorldState(options) {
  const worldIdentifier =
    readOptionalTrimmedTextOption(options, 'world') ?? readOptionalTrimmedTextOption(options, 'id');
  const worldId = await resolveWorldIdBySlugOrId(worldIdentifier);

  return getWorldTruth(worldId);
}

async function runListWorldCampaigns(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  return listWorldCampaigns(worldId);
}

async function runShowCharacterCampaigns(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return listCharacterCampaigns(characterId);
}

async function runListWorldRegions(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  return listWorldRegions(worldId);
}

async function runListWorldEntities(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  return listWorldEntities(worldId);
}

async function runShowLocation(options) {
  const locationId = readPositiveIntegerOption(options, 'location', '--location');
  const location = await getLocationById(locationId);

  if (!location) {
    throw createHttpError('Location not found', 404);
  }

  return location;
}

async function runListCampaigns() {
  return listCampaigns();
}

async function runShowCampaign(options) {
  const identifier =
    readOptionalTrimmedTextOption(options, 'id') ?? readOptionalTrimmedTextOption(options, 'campaign');

  return resolveCampaignRecordBySlugOrId(identifier);
}

async function runCreateCampaign(options) {
  const name = String(options.name ?? '').trim();

  if (!name) {
    throw createHttpError('--name is required for create-campaign', 400);
  }

  return createCampaign({
    world_id: readOptionalPositiveIntegerOption(options, 'world', '--world'),
    name,
    slug: readOptionalTrimmedTextOption(options, 'slug'),
    campaign_type: readOptionalTrimmedTextOption(options, 'campaign-type'),
    status: readOptionalTrimmedTextOption(options, 'status'),
    description: options.description ? String(options.description).trim() || null : null,
    created_by_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runAddCampaignCharacter(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return addCharacterToCampaign(campaignId, {
    character_id: characterId,
    joined_by_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    is_active_context: readOptionalBooleanOption(
      options,
      'active-context',
      '--active-context',
      undefined
    ),
  });
}

async function runListEventTemplates() {
  return listEventTemplates();
}

async function runListEvents(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return {
    character_id: characterId,
    events: await listCharacterEvents(characterId),
  };
}

async function runCreateEvent(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const templateKey = String(options.template ?? '').trim();

  if (!templateKey) {
    throw createHttpError('--template is required for create-event', 400);
  }

  return createEventInstance({
    campaign_id: campaignId,
    character_id: characterId,
    template_key: templateKey,
    created_by_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runShowEvent(options) {
  const eventId = readPositiveIntegerOption(options, 'event', '--event');
  const event = await getEventById(eventId);

  if (!event) {
    throw createHttpError('Event not found', 404);
  }

  return event;
}

async function runChooseEventOption(options) {
  const eventId = readPositiveIntegerOption(options, 'event', '--event');
  const optionId = readOptionalPositiveIntegerOption(options, 'option', '--option');
  const optionKey =
    options['option-key'] !== undefined ? String(options['option-key']).trim() || null : null;

  if ((optionId === null) === (optionKey === null)) {
    throw createHttpError('Provide exactly one of --option or --option-key', 400);
  }

  return chooseEventOption(eventId, {
    option_id: optionId,
    option_key: optionKey,
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runListScenes(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return listCampaignScenes(campaignId, characterId);
}

async function runShowScene(options) {
  const sceneId = readOptionalPositiveIntegerOption(options, 'scene', '--scene');

  if (sceneId !== null && options.campaign === undefined && options.character === undefined) {
    const scene = await getWorldSceneById(sceneId);

    if (!scene) {
      throw createHttpError('Scene not found', 404);
    }

    return scene;
  }

  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const campaignId = await resolveCampaignIdFromOptions(options, characterId);

  return getCharacterScene(campaignId, characterId);
}

function detectUnderstandingState(knowledgeFlags = []) {
  const knownFlagKeys = new Set(
    knowledgeFlags
      .filter((entry) => entry && entry.flag_key)
      .filter((entry) => entry.observed_value !== false && entry.flag_value !== false)
      .map((entry) => entry.flag_key)
  );

  if (knownFlagKeys.has('understanding_full')) {
    return 'full_understanding';
  }

  if (knownFlagKeys.has('understanding_high')) {
    return 'high_understanding';
  }

  if (knownFlagKeys.has('understanding_medium')) {
    return 'medium_understanding';
  }

  if (knownFlagKeys.has('understanding_low')) {
    return 'low_understanding';
  }

  return null;
}

async function runShowClues(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const campaignId = await resolveCampaignIdFromOptions(options, characterId);
  const adventureState = await getAdventureState(campaignId, characterId, 'player');
  const discoveredLore = adventureState.knowledge?.discovered_lore ?? [];
  const characterFlags = adventureState.knowledge?.flags?.character_flags ?? [];
  const clueGroups = {
    core: [],
    reinforcing: [],
    misleading: [],
    deep: [],
    other: [],
  };

  for (const entry of discoveredLore) {
    const clueEntry = {
      knowledge_key: entry.knowledge_key,
      title: entry.title,
      summary: entry.summary,
      clue_id: entry.metadata_json?.clue_id ?? null,
      clue_tier: entry.metadata_json?.clue_tier ?? 'other',
      discovered_at: entry.created_at,
    };

    const targetGroup =
      clueEntry.clue_tier && Object.prototype.hasOwnProperty.call(clueGroups, clueEntry.clue_tier)
        ? clueEntry.clue_tier
        : 'other';
    clueGroups[targetGroup].push(clueEntry);
  }

  return {
    campaign_id: campaignId,
    character_id: characterId,
    current_objective: adventureState.current_objective,
    understanding_state: detectUnderstandingState(characterFlags),
    clue_counts: Object.fromEntries(
      Object.entries(clueGroups).map(([key, value]) => [key, value.length])
    ),
    clues: clueGroups,
  };
}

async function runEnterScene(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return enterCharacterScene(campaignId, characterId, {
    scene_id: readOptionalPositiveIntegerOption(options, 'scene', '--scene'),
    scene_key: readOptionalTrimmedTextOption(options, 'scene-key'),
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runMoveScene(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const transitionId = readOptionalPositiveIntegerOption(options, 'transition', '--transition');
  const transitionKey = readOptionalTrimmedTextOption(options, 'transition-key');

  if ((transitionId === null) === (transitionKey === null)) {
    throw createHttpError('Provide exactly one of --transition or --transition-key', 400);
  }

  return moveCharacterScene(campaignId, characterId, {
    transition_id: transitionId ?? undefined,
    transition_key: transitionKey,
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runListSceneNpcs(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return listCurrentSceneNpcs(campaignId, characterId);
}

async function runInteract(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const interactionId = readOptionalPositiveIntegerOption(options, 'interaction', '--interaction');
  const interactionKey = readOptionalTrimmedTextOption(options, 'interaction-key');

  if ((interactionId === null) === (interactionKey === null)) {
    throw createHttpError('Provide exactly one of --interaction or --interaction-key', 400);
  }

  return attemptSceneInteraction(campaignId, characterId, {
    interaction_id: interactionId ?? undefined,
    interaction_key: interactionKey,
    roll: readOptionalRollOption(options),
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runListDialogueSessions(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const limit = readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 25);
  const offset = readOptionalNonNegativeIntegerOption(options, 'offset', '--offset', 0);

  if (limit < 1 || limit > 100) {
    throw createHttpError('--limit must be an integer from 1 to 100', 400);
  }

  return listDialogueSessions(campaignId, characterId, limit, offset);
}

async function runTalkToNpc(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const npcId = readOptionalPositiveIntegerOption(options, 'npc', '--npc');
  const npcKey = readOptionalTrimmedTextOption(options, 'npc-key');
  const dialogueId = readOptionalPositiveIntegerOption(options, 'dialogue', '--dialogue');
  const dialogueKey = readOptionalTrimmedTextOption(options, 'dialogue-key');

  if (npcId === null && npcKey === null && dialogueId === null && dialogueKey === null) {
    throw createHttpError(
      'Provide one of --npc, --npc-key, --dialogue, or --dialogue-key',
      400
    );
  }

  return startDialogueSession(campaignId, characterId, {
    npc_id: npcId ?? undefined,
    npc_key: npcKey,
    dialogue_id: dialogueId ?? undefined,
    dialogue_key: dialogueKey,
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runInspectDialogueState(options) {
  const sessionId = readPositiveIntegerOption(options, 'session', '--session');
  const session = await getDialogueSession(sessionId);

  if (!session) {
    throw createHttpError('Dialogue session not found', 404);
  }

  return session;
}

async function runChooseDialogueOption(options) {
  const sessionId = readPositiveIntegerOption(options, 'session', '--session');
  const optionId = readOptionalPositiveIntegerOption(options, 'option', '--option');
  const optionKey = readOptionalTrimmedTextOption(options, 'option-key');

  if (optionId === null && optionKey === null) {
    throw createHttpError('Provide one of --option or --option-key', 400);
  }

  return chooseDialogueOption(sessionId, {
    option_id: optionId ?? undefined,
    option_key: optionKey,
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
  });
}

async function runAttemptDialogueSkillCheck(options) {
  const sessionId = readPositiveIntegerOption(options, 'session', '--session');
  const optionId = readOptionalPositiveIntegerOption(options, 'option', '--option');
  const optionKey = readOptionalTrimmedTextOption(options, 'option-key');

  return attemptDialogueSkillCheck(sessionId, {
    option_id: optionId ?? undefined,
    option_key: optionKey,
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    roll: readOptionalRollOption(options),
  });
}

async function runListStatBlocks() {
  return listStatBlocks();
}

async function runViewStatBlock(options) {
  const statBlockId = readPositiveIntegerOption(options, 'stat-block', '--stat-block');
  const statBlock = await getStatBlockById(statBlockId);

  if (!statBlock) {
    throw createHttpError('Stat block not found', 404);
  }

  return statBlock;
}

async function runListActions(options) {
  const statBlockId = readPositiveIntegerOption(options, 'stat-block', '--stat-block');
  const statBlock = await getStatBlockById(statBlockId);

  if (!statBlock) {
    throw createHttpError('Stat block not found', 404);
  }

  return {
    stat_block: {
      id: statBlock.id,
      name: statBlock.name,
      owner: statBlock.owner,
    },
    actions: await listStatBlockActions(statBlockId),
  };
}

async function runViewAction(options) {
  const actionId = readPositiveIntegerOption(options, 'action', '--action');
  const action = await getActionById(actionId);

  if (!action) {
    throw createHttpError('Action not found', 404);
  }

  return action;
}

async function runStartCombat(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const sceneId = readOptionalPositiveIntegerOption(options, 'scene', '--scene');
  const eventId = readOptionalPositiveIntegerOption(options, 'event', '--event');
  const actorAccountId = readOptionalPositiveIntegerOption(options, 'actor', '--actor');
  const participants = readJsonArrayOption(options, 'participants', '--participants');
  const initiativeOverrides = readJsonArrayOption(
    options,
    'initiative-overrides',
    '--initiative-overrides',
    []
  );
  const visibilityMode = readOptionalTrimmedTextOption(options, 'visibility') ?? 'narrative';
  const autoAdvanceTurns = readOptionalBooleanOption(
    options,
    'auto-advance',
    '--auto-advance',
    undefined
  );

  if (!participants || participants.length === 0) {
    throw createHttpError('--participants is required for start-combat', 400);
  }

  const created = await createCombat({
    campaign_id: campaignId,
    scene_id: sceneId,
    event_id: eventId,
    created_by_account_id: actorAccountId,
    visibility_mode: visibilityMode,
    auto_advance_turns: autoAdvanceTurns,
    participants,
  });

  const started = await startCombat(created.id, {
    actor_account_id: actorAccountId,
    initiative_overrides: initiativeOverrides,
  });

  return {
    created_combat_id: created.id,
    combat: started,
  };
}

async function runShowCombat(options) {
  const combatId = readPositiveIntegerOption(options, 'combat', '--combat');
  const combat = await getCombatById(combatId);

  if (!combat) {
    throw createHttpError('Combat not found', 404);
  }

  return combat;
}

async function runListCombatParticipants(options) {
  const combat = await runShowCombat(options);
  return {
    combat: {
      id: combat.id,
      status: combat.status,
      round_number: combat.round_number,
      current_turn_index: combat.current_turn_index,
      current_participant_id: combat.current_participant_id,
      current_participant_name: combat.current_participant_name,
    },
    participants: combat.participants,
  };
}

async function runTakeTurn(options) {
  const combatId = readPositiveIntegerOption(options, 'combat', '--combat');
  const participantId = readPositiveIntegerOption(options, 'participant', '--participant');
  const actionId = readPositiveIntegerOption(options, 'action', '--action');
  const targetParticipantId = readOptionalPositiveIntegerOption(options, 'target', '--target');
  const actorAccountId = readOptionalPositiveIntegerOption(options, 'actor', '--actor');
  const damageRolls = readJsonArrayOption(options, 'damage-rolls', '--damage-rolls', undefined);
  const attackRoll = readOptionalD20Option(options, 'attack-roll', '--attack-roll');

  return actInCombat(combatId, {
    actor_account_id: actorAccountId,
    participant_id: participantId,
    action_id: actionId,
    target_participant_id: targetParticipantId,
    attack_roll: attackRoll,
    damage_rolls: damageRolls,
  });
}

async function runEndTurn(options) {
  const combatId = readPositiveIntegerOption(options, 'combat', '--combat');
  const participantId = readPositiveIntegerOption(options, 'participant', '--participant');
  const actorAccountId = readOptionalPositiveIntegerOption(options, 'actor', '--actor');

  return endCombatTurn(combatId, {
    actor_account_id: actorAccountId,
    participant_id: participantId,
  });
}

async function runResolveAiTurn(options) {
  const combatId = readPositiveIntegerOption(options, 'combat', '--combat');
  const actorAccountId = readOptionalPositiveIntegerOption(options, 'actor', '--actor');
  const damageRolls = readJsonArrayOption(options, 'damage-rolls', '--damage-rolls', undefined);
  const attackRoll = readOptionalD20Option(options, 'attack-roll', '--attack-roll');

  return resolveCombatAiTurn(combatId, {
    actor_account_id: actorAccountId,
    attack_roll: attackRoll,
    damage_rolls: damageRolls,
  });
}

async function runShowAdventureState(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readAdventureModeOption(options, 'player');

  return getAdventureState(campaignId, characterId, mode);
}

async function runShowObjectives(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const campaignId = await resolveCampaignIdFromOptions(options, characterId);
  const mode = readAdventureModeOption(options, 'player');

  return listAdventureObjectives(campaignId, characterId, mode);
}

async function runShowQuests(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readAdventureModeOption(options, 'player');

  return listAdventureQuests(campaignId, characterId, mode);
}

async function runShowLog(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readOptionalPositiveIntegerOption(options, 'character', '--character');
  const limit = readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 25);
  const offset = readOptionalNonNegativeIntegerOption(options, 'offset', '--offset', 0);
  const mode = readAdventureModeOption(options, characterId === null ? 'gm' : 'player');

  if (limit < 1 || limit > 100) {
    throw createHttpError('--limit must be an integer from 1 to 100', 400);
  }

  if (characterId === null && mode !== 'gm') {
    throw createHttpError('--character is required when --mode is minimal or player', 400);
  }

  return listAdventureCampaignLog(campaignId, characterId, mode, limit, offset);
}

async function runShowPlayState(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return getPlayState(campaignId, characterId, mode);
}

async function runShowAvailableActions(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return listAvailableActions(campaignId, characterId, mode);
}

async function runShowContextSummary(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return getContextSummary(campaignId, characterId, mode);
}

async function runAct(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');
  const actionKey = readOptionalTrimmedTextOption(options, 'action-key');
  const actionType = readOptionalTrimmedTextOption(options, 'action');

  if (!actionKey && !actionType) {
    throw createHttpError('Provide --action or --action-key', 400);
  }

  return actThroughPlayState(
    campaignId,
    characterId,
    {
      action_key: actionKey,
      action_type: actionType,
      actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
      scene_id: readOptionalPositiveIntegerOption(options, 'scene', '--scene'),
      scene_key: readOptionalTrimmedTextOption(options, 'scene-key'),
      transition_id: readOptionalPositiveIntegerOption(options, 'transition', '--transition'),
      transition_key: readOptionalTrimmedTextOption(options, 'transition-key'),
      npc_id: readOptionalPositiveIntegerOption(options, 'npc', '--npc'),
      npc_key: readOptionalTrimmedTextOption(options, 'npc-key'),
      session_id: readOptionalPositiveIntegerOption(options, 'session', '--session'),
      option_id: readOptionalPositiveIntegerOption(options, 'option', '--option'),
      option_key: readOptionalTrimmedTextOption(options, 'option-key'),
      interaction_id: readOptionalPositiveIntegerOption(options, 'interaction', '--interaction'),
      interaction_key: readOptionalTrimmedTextOption(options, 'interaction-key'),
      event_id: readOptionalPositiveIntegerOption(options, 'event', '--event'),
      combat_id: readOptionalPositiveIntegerOption(options, 'combat', '--combat'),
      participant_id: readOptionalPositiveIntegerOption(options, 'participant', '--participant'),
      target_participant_id: readOptionalPositiveIntegerOption(options, 'target', '--target'),
      action_id: readOptionalPositiveIntegerOption(options, 'action-id', '--action-id'),
      attack_roll: readOptionalD20Option(options, 'attack-roll', '--attack-roll'),
      damage_rolls: readJsonArrayOption(options, 'damage-rolls', '--damage-rolls', undefined),
      roll: readOptionalRollOption(options),
      visibility_mode: readOptionalTrimmedTextOption(options, 'visibility'),
      auto_advance_turns: readOptionalBooleanOption(
        options,
        'auto-advance',
        '--auto-advance',
        undefined
      ),
      initiative_overrides: readJsonArrayOption(
        options,
        'initiative-overrides',
        '--initiative-overrides',
        undefined
      ),
    },
    mode
  );
}

function buildRuntimeActionInput(options) {
  const actionKey = readOptionalTrimmedTextOption(options, 'action-key');
  const actionType = readOptionalTrimmedTextOption(options, 'action');

  if (!actionKey && !actionType) {
    throw createHttpError('Provide --action or --action-key', 400);
  }

  return {
    action_key: actionKey,
    action_type: actionType,
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    scene_id: readOptionalPositiveIntegerOption(options, 'scene', '--scene'),
    scene_key: readOptionalTrimmedTextOption(options, 'scene-key'),
    transition_id: readOptionalPositiveIntegerOption(options, 'transition', '--transition'),
    transition_key: readOptionalTrimmedTextOption(options, 'transition-key'),
    npc_id: readOptionalPositiveIntegerOption(options, 'npc', '--npc'),
    npc_key: readOptionalTrimmedTextOption(options, 'npc-key'),
    session_id: readOptionalPositiveIntegerOption(options, 'session', '--session'),
    option_id: readOptionalPositiveIntegerOption(options, 'option', '--option'),
    option_key: readOptionalTrimmedTextOption(options, 'option-key'),
    interaction_id: readOptionalPositiveIntegerOption(options, 'interaction', '--interaction'),
    interaction_key: readOptionalTrimmedTextOption(options, 'interaction-key'),
    event_id: readOptionalPositiveIntegerOption(options, 'event', '--event'),
    combat_id: readOptionalPositiveIntegerOption(options, 'combat', '--combat'),
    participant_id: readOptionalPositiveIntegerOption(options, 'participant', '--participant'),
    target_participant_id: readOptionalPositiveIntegerOption(options, 'target', '--target'),
    action_id: readOptionalPositiveIntegerOption(options, 'action-id', '--action-id'),
    attack_roll: readOptionalD20Option(options, 'attack-roll', '--attack-roll'),
    damage_rolls: readJsonArrayOption(options, 'damage-rolls', '--damage-rolls', undefined),
    roll: readOptionalRollOption(options),
    visibility_mode: readOptionalTrimmedTextOption(options, 'visibility'),
    auto_advance_turns: readOptionalBooleanOption(
      options,
      'auto-advance',
      '--auto-advance',
      undefined
    ),
    initiative_overrides: readJsonArrayOption(
      options,
      'initiative-overrides',
      '--initiative-overrides',
      undefined
    ),
  };
}

async function runShowRuntime(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return getRuntimeContent(campaignId, characterId, { mode });
}

async function runShowRuntimeDebug(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return getRuntimeContent(campaignId, characterId, { mode: 'full' });
}

async function runShowOpportunities(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return listRuntimeContentOpportunities(campaignId, characterId, { mode });
}

async function runShowContext(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return getRuntimeContentContext(campaignId, characterId, { mode });
}

async function runRuntimeAct(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return actThroughRuntimeContent(
    campaignId,
    characterId,
    buildRuntimeActionInput(options),
    { mode }
  );
}

async function runShowRuntimeHooks(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return listRuntimeHooks(campaignId, characterId, {
    mode,
    hookPoint: readOptionalTrimmedTextOption(options, 'hook-point'),
  });
}

async function runShowDynamicOpportunities(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readRuntimeModeOption(options, 'player');

  return listDynamicOpportunities(campaignId, characterId, { mode });
}

async function runExecuteRuntimeHook(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const hookPoint = readOptionalTrimmedTextOption(options, 'hook-point');

  if (!hookPoint) {
    throw createHttpError('--hook-point is required', 400);
  }

  return executeContentHooks({
    campaignId,
    characterId,
    hookPoint,
    actorAccountId: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    source: {
      type: 'cli_debug',
      reason: readOptionalTrimmedTextOption(options, 'reason'),
    },
    mode: readRuntimeModeOption(options, 'player'),
  });
}

async function runTriggerTimeBeat(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return triggerTimeBeat(campaignId, characterId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    beat_key: readOptionalTrimmedTextOption(options, 'beat-key'),
    reason: readOptionalTrimmedTextOption(options, 'reason'),
    mode: readRuntimeModeOption(options, 'player'),
  });
}

async function runShowWorldHistory(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  const limit = readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 25);
  const offset = readOptionalNonNegativeIntegerOption(options, 'offset', '--offset', 0);

  return listWorldHistory(worldId, { limit, offset });
}

async function runShowWorldTruth(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  return getWorldTruth(worldId);
}

async function runRecordWorldChange(options) {
  return recordWorldChange({
    world_id: readOptionalPositiveIntegerOption(options, 'world', '--world'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    character_id: readOptionalPositiveIntegerOption(options, 'character', '--character'),
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    change_key: readOptionalTrimmedTextOption(options, 'change-key'),
    change_type: readOptionalTrimmedTextOption(options, 'change-type'),
    propagation_scope: readOptionalTrimmedTextOption(options, 'scope'),
    region_id: readOptionalPositiveIntegerOption(options, 'region', '--region'),
    location_id: readOptionalPositiveIntegerOption(options, 'location', '--location'),
    scene_id: readOptionalPositiveIntegerOption(options, 'scene', '--scene'),
    world_entity_id: readOptionalPositiveIntegerOption(options, 'entity', '--entity'),
    title: readOptionalTrimmedTextOption(options, 'title'),
    summary: readOptionalTrimmedTextOption(options, 'summary'),
    narrative_text: readOptionalTrimmedTextOption(options, 'narrative'),
    payload: readJsonObjectOption(options, 'payload', '--payload', {}),
    truth_delta: readJsonObjectOption(options, 'truth-delta', '--truth-delta', {}),
    knowledge_policy: readJsonObjectOption(options, 'knowledge-policy', '--knowledge-policy', {}),
  });
}

async function runTriggerWorldBeat(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');

  return triggerWorldSimulationBeat(worldId, {
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    character_id: readOptionalPositiveIntegerOption(options, 'character', '--character'),
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    beat_key: readOptionalTrimmedTextOption(options, 'beat-key'),
    change_key: readOptionalTrimmedTextOption(options, 'change-key'),
    propagation_scope: readOptionalTrimmedTextOption(options, 'scope') ?? 'global',
    title: readOptionalTrimmedTextOption(options, 'title'),
    summary: readOptionalTrimmedTextOption(options, 'summary'),
    reason: readOptionalTrimmedTextOption(options, 'reason'),
    truth_delta: readJsonObjectOption(options, 'truth-delta', '--truth-delta', {}),
    knowledge_policy: readJsonObjectOption(options, 'knowledge-policy', '--knowledge-policy', {}),
  });
}

async function runPropagateWorldKnowledge(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');

  return propagateWorldKnowledge(worldId, {
    channel: readOptionalTrimmedTextOption(options, 'channel'),
    include_hidden: readOptionalBooleanOption(options, 'include-hidden', '--include-hidden', false),
    limit: readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 50),
  });
}

async function runShowCharacterKnowledge(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return listCharacterKnowledgeInWorld(worldId, characterId, {
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
  });
}

async function runShowEntityEvents(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');

  return listWorldEntityEvolution(worldId, {
    entity_id: readOptionalPositiveIntegerOption(options, 'entity', '--entity'),
    limit: readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 25),
    offset: readOptionalNonNegativeIntegerOption(options, 'offset', '--offset', 0),
  });
}

async function runOpenProgressionWindow(options) {
  return openProgressionWindow({
    world_id: readOptionalPositiveIntegerOption(options, 'world', '--world'),
    campaign_id: readPositiveIntegerOption(options, 'campaign', '--campaign'),
    scene_id: readOptionalPositiveIntegerOption(options, 'scene', '--scene'),
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    window_key: readOptionalTrimmedTextOption(options, 'window-key'),
    scope_type: readOptionalTrimmedTextOption(options, 'scope-type'),
    prompt_text: readOptionalTrimmedTextOption(options, 'prompt'),
    threshold_minutes: readOptionalNonNegativeIntegerOption(
      options,
      'threshold-minutes',
      '--threshold-minutes',
      240
    ),
    default_action_type: readOptionalTrimmedTextOption(options, 'default-action'),
    default_action_payload: readJsonObjectOption(
      options,
      'default-action-payload',
      '--default-action-payload',
      {}
    ),
    participant_character_ids: readJsonArrayOption(options, 'participants', '--participants', undefined),
  });
}

async function runSimulateDefaultAction(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const campaignId = await resolveCampaignIdFromOptions(options, characterId);
  const requestedWindowId = readOptionalPositiveIntegerOption(options, 'window', '--window');
  let windowId = requestedWindowId;

  if (windowId === null) {
    const openWindows = await listProgressionWindows({
      campaign_id: campaignId,
      status: 'open',
      limit: 25,
      offset: 0,
    });

    const eligibleWindowBundles = [];

    for (const entry of openWindows.windows) {
      const bundle = await getProgressionWindow(entry.id);
      const participant = bundle.participants.find((row) => row.character_id === characterId);

      if (!participant || participant.participant_status !== 'expected') {
        continue;
      }

      eligibleWindowBundles.push(bundle);
    }

    eligibleWindowBundles.sort((left, right) => {
      if (left.window.threshold_reached !== right.window.threshold_reached) {
        return left.window.threshold_reached ? -1 : 1;
      }

      return new Date(right.window.created_at).getTime() - new Date(left.window.created_at).getTime();
    });

    const selected = eligibleWindowBundles[0];

    if (!selected) {
      throw createHttpError(
        'No open progression window is waiting on this character in the active campaign context',
        404
      );
    }

    windowId = selected.window.id;
  }

  const resolution = await resolveProgressionWindow(windowId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    summary:
      readOptionalTrimmedTextOption(options, 'summary') ??
      `Resolved default action flow for character ${characterId}.`,
    force: readOptionalBooleanOption(options, 'force', '--force', false),
  });
  const appliedToCharacter = (resolution.defaulted ?? []).filter(
    (entry) => entry.character_id === characterId
  );

  return {
    campaign_id: campaignId,
    character_id: characterId,
    progression_window_id: windowId,
    applied_default_actions: appliedToCharacter,
    resolution,
  };
}

async function runShowProgressionWindow(options) {
  const windowId = readPositiveIntegerOption(options, 'window', '--window');
  return getProgressionWindow(windowId);
}

async function runListProgressionWindows(options) {
  return listProgressionWindows({
    world_id: readOptionalPositiveIntegerOption(options, 'world', '--world'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    status: readOptionalTrimmedTextOption(options, 'status'),
    limit: readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 25),
    offset: readOptionalNonNegativeIntegerOption(options, 'offset', '--offset', 0),
  });
}

async function runSubmitWindowResponse(options) {
  const windowId = readPositiveIntegerOption(options, 'window', '--window');

  return submitProgressionWindowResponse(windowId, {
    character_id: readPositiveIntegerOption(options, 'character', '--character'),
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    response_key: readOptionalTrimmedTextOption(options, 'response-key'),
    response_payload: readJsonObjectOption(options, 'payload', '--payload', {}),
    response_summary: readOptionalTrimmedTextOption(options, 'summary'),
  });
}

async function runResolveProgressionWindow(options) {
  const windowId = readPositiveIntegerOption(options, 'window', '--window');

  return resolveProgressionWindow(windowId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    summary: readOptionalTrimmedTextOption(options, 'summary'),
    force: readOptionalBooleanOption(options, 'force', '--force', false),
  });
}

async function runShowCatchup(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return getCatchupSummary(campaignId, characterId, {
    limit: readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 10),
    mode: readRuntimeModeOption(options, 'minimal'),
    mark_seen: readOptionalBooleanOption(options, 'mark-seen', '--mark-seen', false),
  });
}

async function runListQuests(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const mode = readAdventureModeOption(options, 'player');

  return listAdventureQuests(campaignId, characterId, mode);
}

async function runListFlags(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return listCharacterNarrativeFlags(campaignId, characterId);
}

async function runListCampaignLogs(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readOptionalPositiveIntegerOption(options, 'character', '--character');
  const limit = readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 25);
  const offset = readOptionalNonNegativeIntegerOption(options, 'offset', '--offset', 0);
  const mode = readAdventureModeOption(options, characterId === null ? 'gm' : 'player');

  if (limit < 1 || limit > 100) {
    throw createHttpError('--limit must be an integer from 1 to 100', 400);
  }

  if (characterId === null && mode === 'gm') {
    return listCampaignLogs(campaignId, limit, offset);
  }

  if (characterId === null) {
    throw createHttpError('--character is required when --mode is minimal or player', 400);
  }

  return listAdventureCampaignLog(campaignId, characterId, mode, limit, offset);
}

async function runListRewards(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return {
    campaign_id: campaignId,
    character_id: characterId,
    items: await listCharacterRewardApplications(campaignId, characterId),
  };
}

async function runHistory(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const progression = await getCharacterProgression(characterId);

  if (!progression) {
    throw createHttpError('Character not found', 404);
  }

  const limit = readOptionalNonNegativeIntegerOption(options, 'limit', '--limit', 25);
  const offset = readOptionalNonNegativeIntegerOption(options, 'offset', '--offset', 0);

  if (limit < 1 || limit > 100) {
    throw createHttpError('--limit must be an integer from 1 to 100', 400);
  }

  return {
    character_id: characterId,
    experience_points: progression.experience_points,
    level: progression.level,
    limit,
    offset,
    items: await listCharacterGameplayHistory(characterId, limit, offset),
  };
}

async function runXp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const progression = await getCharacterProgression(characterId);

  if (!progression) {
    throw createHttpError('Character not found', 404);
  }

  return progression;
}

async function runShowXp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return getCharacterAdvancementStatus(characterId, {
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
  });
}

async function runGrantXp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const amount = readPositiveIntegerOption(options, 'amount', '--amount');
  const reason =
    options.reason !== undefined ? String(options.reason).trim() || null : null;

  return grantCharacterExperience(characterId, {
    amount,
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    reason,
    source_type: readOptionalTrimmedTextOption(options, 'source') ?? 'system',
    source_entity_id: readOptionalPositiveIntegerOption(options, 'source-entity', '--source-entity'),
    dedupe_key: readOptionalTrimmedTextOption(options, 'dedupe-key'),
    action_key: 'grant_xp',
  });
}

async function runGrantMilestone(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');

  return grantMilestoneLevel(characterId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    target_level: readOptionalPositiveIntegerOption(options, 'target-level', '--target-level'),
    level_count: readOptionalPositiveIntegerOption(options, 'level-count', '--level-count'),
    reason: readOptionalTrimmedTextOption(options, 'reason'),
    source_type: readOptionalTrimmedTextOption(options, 'source') ?? 'milestone',
    dedupe_key: readOptionalTrimmedTextOption(options, 'dedupe-key'),
  });
}

async function runShowLevelUp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return getCharacterAdvancementStatus(characterId, {
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
  });
}

async function runStartLevelUp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return startLevelUp(characterId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    target_character_class_id: readOptionalPositiveIntegerOption(
      options,
      'class-entry',
      '--class-entry'
    ),
    reason: readOptionalTrimmedTextOption(options, 'reason'),
  });
}

async function runChooseHp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const method = readOptionalTrimmedTextOption(options, 'method');

  if (!method) {
    throw createHttpError('--method is required', 400);
  }

  return chooseLevelUpHp(characterId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    method,
  });
}

async function runChooseSubclass(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return chooseLevelUpSubclass(characterId, {
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    subclass_id: readPositiveIntegerOption(options, 'subclass', '--subclass'),
  });
}

async function runChooseSpells(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return chooseLevelUpSpells(characterId, {
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    cantrip_spell_ids: readStringArrayOption(options, 'cantrips', '--cantrips'),
    known_spell_ids: readStringArrayOption(options, 'spells', '--spells'),
  });
}

async function runPreviewLevelUp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return previewLevelUp(characterId, {
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
  });
}

async function runFinalizeLevelUp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return finalizeLevelUp(characterId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    reason: readOptionalTrimmedTextOption(options, 'reason'),
  });
}

async function runDeferLevelUp(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  return deferLevelUp(characterId, {
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    reason: readOptionalTrimmedTextOption(options, 'reason'),
  });
}

async function runShowPartyLevels(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  return getCampaignLevelSync(campaignId);
}

async function runValidateEncounters(options) {
  const packagePath = readRequiredPathOption(options);
  const result = await loadAndValidateContentPackage(packagePath);
  const encounterTemplates = result.package?.sections?.encounterTemplates ?? [];
  const encounterErrors = (result.report?.errors ?? []).filter((entry) =>
    /encounter/i.test(String(entry))
  );
  const encounterWarnings = (result.report?.warnings ?? []).filter((entry) =>
    /encounter|beat|solo/i.test(String(entry))
  );

  if (!result.ok) {
    process.exitCode = 1;
  }

  return {
    ok: result.ok,
    package_path: result.report?.package_path,
    encounter_template_count: encounterTemplates.length,
    encounter_templates: encounterTemplates.map((encounter) => ({
      slug: encounter.slug,
      name: encounter.name,
      difficulty_intent: encounter.difficulty_intent,
      scaling_enabled: encounter.scaling_enabled,
      story_fixed_by_default: encounter.story_fixed_by_default,
      async_beat_target: encounter.async_beat_target,
    })),
    encounter_errors: encounterErrors,
    encounter_warnings: encounterWarnings,
    summary: result.report?.summary,
  };
}

async function runPreviewPartyStrength(options) {
  const partyCampaignId = readOptionalPositiveIntegerOption(options, 'party', '--party');

  if (partyCampaignId) {
    return evaluatePartyStrength({
      campaign_id: partyCampaignId,
      use_party: true,
      party: true,
    });
  }

  return evaluatePartyStrength({
    character_id: readPositiveIntegerOption(options, 'character', '--character'),
    campaign_id: readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    use_party: false,
  });
}

async function runPreviewEncounter(options) {
  const encounterSlug = readOptionalTrimmedTextOption(options, 'encounter');

  if (!encounterSlug) {
    throw createHttpError('--encounter is required', 400);
  }

  const partyCampaignId = readOptionalPositiveIntegerOption(options, 'party', '--party');

  return previewEncounter(encounterSlug, {
    campaign_id:
      partyCampaignId ?? readOptionalPositiveIntegerOption(options, 'campaign', '--campaign'),
    world_id: readOptionalPositiveIntegerOption(options, 'world', '--world'),
    character_id: partyCampaignId
      ? null
      : readOptionalPositiveIntegerOption(options, 'character', '--character'),
    use_party: partyCampaignId !== null,
    party: partyCampaignId !== null,
  });
}

async function runResolveEncounter(options) {
  const encounterSlug = readOptionalTrimmedTextOption(options, 'encounter');
  const resolutionPath =
    readOptionalTrimmedTextOption(options, 'resolution-path') ??
    readOptionalTrimmedTextOption(options, 'path');

  if (!encounterSlug) {
    throw createHttpError('--encounter is required', 400);
  }

  if (!resolutionPath) {
    throw createHttpError('--resolution-path is required', 400);
  }

  return resolveEncounter(encounterSlug, {
    campaign_id: readPositiveIntegerOption(options, 'campaign', '--campaign'),
    character_id: readPositiveIntegerOption(options, 'character', '--character'),
    actor_account_id: readOptionalPositiveIntegerOption(options, 'actor', '--actor'),
    resolution_path: resolutionPath,
    reason: readOptionalTrimmedTextOption(options, 'reason'),
  });
}

async function runValidateSmsTemplates() {
  const result = validateSmsTemplateRegistry();

  if (!result.ok) {
    process.exitCode = 1;
  }

  return result;
}

async function runListSmsTemplates() {
  return {
    templates: listSmsSimulatorTemplates(),
  };
}

function readSmsTemplateId(options) {
  const templateId =
    readOptionalTrimmedTextOption(options, 'template-id') ??
    readOptionalTrimmedTextOption(options, 'template');

  if (!templateId) {
    throw createHttpError('--template-id is required', 400);
  }

  return templateId;
}

async function runRenderSmsTemplate(options) {
  return renderSimulatorOutbound(
    readSmsTemplateId(options),
    readJsonObjectOption(options, 'variables', '--variables', {}),
    {
      includeDebug: readOptionalBooleanOption(options, 'debug', '--debug', false),
    }
  );
}

async function runRenderSmsState(options) {
  const state = readOptionalTrimmedTextOption(options, 'state');

  if (!state) {
    throw createHttpError('--state is required', 400);
  }

  return renderSimulatorState(
    state,
    readJsonObjectOption(options, 'variables', '--variables', {}),
    {
      includeDebug: readOptionalBooleanOption(options, 'debug', '--debug', false),
    }
  );
}

async function runSimulateSmsReply(options) {
  const input = readOptionalTrimmedTextOption(options, 'input');

  if (!input) {
    throw createHttpError('--input is required', 400);
  }

  return simulateSmsInboundReply(input, {
    expected_options: readJsonArrayOption(options, 'options', '--options', []),
    allow_free_text: readOptionalBooleanOption(
      options,
      'allow-free-text',
      '--allow-free-text',
      false
    ),
    current_context: readOptionalTrimmedTextOption(options, 'current-context'),
    objective_line: readOptionalTrimmedTextOption(options, 'objective-line'),
    pending_line: readOptionalTrimmedTextOption(options, 'pending-line'),
    level_summary: readOptionalTrimmedTextOption(options, 'level-summary'),
  });
}

async function runSetCampaignAdvancement(options) {
  const campaignId = readPositiveIntegerOption(options, 'campaign', '--campaign');
  const mode = readOptionalTrimmedTextOption(options, 'mode');

  if (!mode) {
    throw createHttpError('--mode is required', 400);
  }

  return setCampaignAdvancementConfig(campaignId, {
    advancement_mode: mode,
    advancement_config: readJsonObjectOption(options, 'config', '--config', {}),
  });
}

async function runSetWorldAdvancement(options) {
  const worldId = readPositiveIntegerOption(options, 'world', '--world');
  const mode = readOptionalTrimmedTextOption(options, 'mode');

  if (!mode) {
    throw createHttpError('--mode is required', 400);
  }

  return setWorldAdvancementConfig(worldId, {
    advancement_mode: mode,
    advancement_config: readJsonObjectOption(options, 'config', '--config', {}),
  });
}

async function runListSpells(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const [spells, slots] = await Promise.all([
    listCharacterSpells(characterId),
    getCharacterSpellSlots(characterId),
  ]);

  return {
    character_id: characterId,
    spells,
    spell_slots: slots,
  };
}

async function runListItems(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const inventory = await listCharacterItems(characterId);

  return {
    character_id: characterId,
    inventory,
  };
}

async function runShowOverrides(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const overrides = await listCharacterOverrides(characterId);

  return {
    character_id: characterId,
    overrides,
  };
}

async function runCommand(options) {
  const characterId = readPositiveIntegerOption(options, 'character', '--character');
  const actorAccountId = readOptionalPositiveIntegerOption(options, 'actor', '--actor');
  const type = readCommandType(options);
  const payload = readCommandPayload(options);

  return executeCommand({
    type,
    characterId,
    actorAccountId,
    payload,
  });
}

async function runValidateContent(options) {
  const packagePath = readRequiredPathOption(options);
  const result = await loadAndValidateContentPackage(packagePath);

  if (!result.ok) {
    process.exitCode = 1;
  }

  return {
    ok: result.ok,
    report: result.report,
  };
}

async function runImportContent(options) {
  const packagePath = readRequiredPathOption(options);
  const dryRun = options['dry-run'] === true;
  const result = await importContentPackage(packagePath, { dryRun });

  if (!result.ok) {
    process.exitCode = 1;
  }

  return result;
}

async function dispatch(subcommand, options) {
  switch (subcommand) {
    case 'list-worlds':
      return runListWorlds();
    case 'show-world':
      return runShowWorld(options);
    case 'show-world-state':
      return runShowWorldState(options);
    case 'show-world-history':
      return runShowWorldHistory(options);
    case 'show-world-truth':
      return runShowWorldTruth(options);
    case 'record-world-change':
      return runRecordWorldChange(options);
    case 'trigger-world-beat':
      return runTriggerWorldBeat(options);
    case 'propagate-world-knowledge':
      return runPropagateWorldKnowledge(options);
    case 'show-character-knowledge':
      return runShowCharacterKnowledge(options);
    case 'show-entity-events':
      return runShowEntityEvents(options);
    case 'list-world-campaigns':
      return runListWorldCampaigns(options);
    case 'show-character-campaigns':
      return runShowCharacterCampaigns(options);
    case 'list-world-regions':
      return runListWorldRegions(options);
    case 'list-world-entities':
      return runListWorldEntities(options);
    case 'show-location':
      return runShowLocation(options);
    case 'list-campaigns':
      return runListCampaigns();
    case 'show-campaign':
      return runShowCampaign(options);
    case 'create-campaign':
      return runCreateCampaign(options);
    case 'add-campaign-character':
      return runAddCampaignCharacter(options);
    case 'list-event-templates':
      return runListEventTemplates();
    case 'list-events':
      return runListEvents(options);
    case 'create-event':
      return runCreateEvent(options);
    case 'show-event':
      return runShowEvent(options);
    case 'choose-event-option':
      return runChooseEventOption(options);
    case 'list-scenes':
      return runListScenes(options);
    case 'show-scene':
      return runShowScene(options);
    case 'show-clues':
      return runShowClues(options);
    case 'enter-scene':
      return runEnterScene(options);
    case 'move-scene':
      return runMoveScene(options);
    case 'list-scene-npcs':
      return runListSceneNpcs(options);
    case 'interact':
      return runInteract(options);
    case 'list-dialogue-sessions':
      return runListDialogueSessions(options);
    case 'talk-to-npc':
      return runTalkToNpc(options);
    case 'inspect-dialogue-state':
      return runInspectDialogueState(options);
    case 'choose-dialogue-option':
      return runChooseDialogueOption(options);
    case 'attempt-dialogue-skill-check':
      return runAttemptDialogueSkillCheck(options);
    case 'list-stat-blocks':
      return runListStatBlocks();
    case 'view-stat-block':
      return runViewStatBlock(options);
    case 'list-actions':
      return runListActions(options);
    case 'view-action':
      return runViewAction(options);
    case 'start-combat':
      return runStartCombat(options);
    case 'show-combat':
      return runShowCombat(options);
    case 'list-combat-participants':
      return runListCombatParticipants(options);
    case 'take-turn':
      return runTakeTurn(options);
    case 'end-turn':
      return runEndTurn(options);
    case 'resolve-ai-turn':
      return runResolveAiTurn(options);
    case 'show-adventure-state':
      return runShowAdventureState(options);
    case 'show-objectives':
      return runShowObjectives(options);
    case 'show-quests':
      return runShowQuests(options);
    case 'show-log':
      return runShowLog(options);
    case 'show-play-state':
      return runShowPlayState(options);
    case 'show-available-actions':
      return runShowAvailableActions(options);
    case 'show-context-summary':
      return runShowContextSummary(options);
    case 'act':
      return runAct(options);
    case 'show-runtime':
      return runShowRuntime(options);
    case 'show-opportunities':
      return runShowOpportunities(options);
    case 'show-context':
      return runShowContext(options);
    case 'runtime-act':
      return runRuntimeAct(options);
    case 'show-runtime-debug':
      return runShowRuntimeDebug(options);
    case 'open-progression-window':
    case 'trigger-progression-window':
      return runOpenProgressionWindow(options);
    case 'show-progression-window':
      return runShowProgressionWindow(options);
    case 'list-progression-windows':
      return runListProgressionWindows(options);
    case 'submit-window-response':
      return runSubmitWindowResponse(options);
    case 'resolve-progression-window':
      return runResolveProgressionWindow(options);
    case 'simulate-default-action':
      return runSimulateDefaultAction(options);
    case 'show-catchup':
      return runShowCatchup(options);
    case 'show-runtime-hooks':
      return runShowRuntimeHooks(options);
    case 'show-dynamic-opportunities':
      return runShowDynamicOpportunities(options);
    case 'execute-runtime-hook':
      return runExecuteRuntimeHook(options);
    case 'trigger-time-beat':
      return runTriggerTimeBeat(options);
    case 'list-quests':
      return runListQuests(options);
    case 'list-flags':
      return runListFlags(options);
    case 'list-rewards':
      return runListRewards(options);
    case 'list-campaign-logs':
      return runListCampaignLogs(options);
    case 'history':
      return runHistory(options);
    case 'xp':
      return runXp(options);
    case 'show-xp':
      return runShowXp(options);
    case 'grant-xp':
      return runGrantXp(options);
    case 'grant-milestone':
      return runGrantMilestone(options);
    case 'show-level-up':
      return runShowLevelUp(options);
    case 'start-level-up':
      return runStartLevelUp(options);
    case 'choose-hp':
      return runChooseHp(options);
    case 'choose-subclass':
      return runChooseSubclass(options);
    case 'choose-spells':
      return runChooseSpells(options);
    case 'preview-level-up':
      return runPreviewLevelUp(options);
    case 'finalize-level-up':
      return runFinalizeLevelUp(options);
    case 'defer-level-up':
      return runDeferLevelUp(options);
    case 'show-party-levels':
      return runShowPartyLevels(options);
    case 'validate-encounters':
      return runValidateEncounters(options);
    case 'preview-party-strength':
      return runPreviewPartyStrength(options);
    case 'preview-encounter':
    case 'scale-encounter':
    case 'simulate-encounter-difficulty':
      return runPreviewEncounter(options);
    case 'resolve-encounter':
      return runResolveEncounter(options);
    case 'validate-sms-templates':
      return runValidateSmsTemplates(options);
    case 'list-sms-templates':
      return runListSmsTemplates(options);
    case 'render-sms-template':
      return runRenderSmsTemplate(options);
    case 'render-sms-state':
      return runRenderSmsState(options);
    case 'simulate-sms-reply':
      return runSimulateSmsReply(options);
    case 'set-campaign-advancement':
      return runSetCampaignAdvancement(options);
    case 'set-world-advancement':
      return runSetWorldAdvancement(options);
    case 'show-sheet':
      return runShowSheet(options);
    case 'show-rules':
      return runShowRules(options);
    case 'list-spells':
      return runListSpells(options);
    case 'list-items':
      return runListItems(options);
    case 'show-overrides':
      return runShowOverrides(options);
    case 'run-command':
      return runCommand(options);
    case 'validate-content':
      return runValidateContent(options);
    case 'import-content':
      return runImportContent(options);
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(`${usageText}\nSupported command types: ${listRegisteredCommandTypes().join(', ')}\n`);
      return null;
    default:
      throw createHttpError(`Unknown subcommand: ${subcommand}`, 400);
  }
}

async function main() {
  const { subcommand, options } = parseArgs(process.argv);
  const compact = options.compact === true;

  try {
    const data = await dispatch(subcommand, options);

    if (data !== null) {
      printJson({ data }, compact);
    }
  } catch (error) {
    const statusCode = error.statusCode ?? 1;
    printJson(
      {
        error: {
          message: error.message || 'Unknown CLI error',
          statusCode,
        },
      },
      compact
    );
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
