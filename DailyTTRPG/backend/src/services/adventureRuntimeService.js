import { query, withTransaction } from '../config/db.js';
import {
  closeActionWindowQuery,
  insertActionWindowQuery,
  selectCharacterDefaultActionPolicyQuery,
  selectOpenActionWindowByCampaignAndCharacterQuery,
} from '../db/queries/adventureRuntime.js';
import { getAdventureState } from './adventureProgressionService.js';
import {
  attemptSceneInteraction,
  enterCharacterScene,
  getCharacterScene,
  moveCharacterScene,
} from './narrativeService.js';
import { getNarrativeContext, recordCampaignLog } from './narrativeStateService.js';
import {
  attemptDialogueSkillCheck,
  cancelDialogueSession,
  chooseDialogueOption,
  getActiveDialogueSessionForCharacter,
  startDialogueSession,
} from './dialogueService.js';
import {
  actInCombat,
  createCombat,
  endCombatTurn,
  findActiveCombatForCharacter,
  resolveCombatAiTurn,
  startCombat,
} from './combatService.js';
import { chooseEventOption, findActiveEventForCharacter } from './eventService.js';
import { executeContentHooks } from './dynamicContentService.js';
import { getCharacterAdvancementStatus } from './advancementService.js';
import { calculateActionWindowCloseAt } from './beatWindowTimingService.js';
import { getWebActionRuntimeConfig } from './webActionSubmissionService.js';
import { createHttpError } from '../utils/httpError.js';

const runtimeModes = new Set(['minimal', 'player', 'full']);
const playModes = new Set([
  'exploration',
  'dialogue',
  'combat',
  'transition',
  'waiting',
  'event',
]);

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

function mapAdventureMode(runtimeMode) {
  return runtimeMode === 'full' ? 'gm' : runtimeMode;
}

function normalizePositiveInteger(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeOptionalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeOptionalBoolean(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
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

  throw createHttpError('Boolean values must be true or false', 400);
}

function normalizeOptionalRoll(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw createHttpError('roll must be an integer from 1 to 20', 400);
  }

  return parsed;
}

function normalizeDamageRolls(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw createHttpError('damage_rolls must be a JSON array', 400);
  }

  return value;
}

function mapDefaultActionPolicyRow(row, campaignId, characterId) {
  if (!row) {
    return {
      id: null,
      campaign_id: campaignId,
      character_id: characterId,
      response_timeout_seconds: 86400,
      default_action_type: 'wait',
      default_action_payload_json: {},
      is_active: true,
      notes: 'Derived runtime fallback policy.',
      is_persisted: false,
    };
  }

  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    response_timeout_seconds: Number(row.response_timeout_seconds),
    default_action_type: row.default_action_type,
    default_action_payload_json: row.default_action_payload_json ?? {},
    is_active: row.is_active,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_persisted: true,
  };
}

function mapActionWindowRow(row) {
  if (!row) {
    return null;
  }

  const expiresAt = row.expires_at ?? null;
  const isExpired = expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();

  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    scene_id: row.scene_id !== null ? Number(row.scene_id) : null,
    dialogue_session_id: row.dialogue_session_id !== null ? Number(row.dialogue_session_id) : null,
    combat_id: row.combat_id !== null ? Number(row.combat_id) : null,
    event_instance_id: row.event_instance_id !== null ? Number(row.event_instance_id) : null,
    window_type: row.window_type,
    status: row.status,
    prompt_text: row.prompt_text,
    suggested_action_key: row.suggested_action_key,
    default_action_type: row.default_action_type,
    default_action_payload_json: row.default_action_payload_json ?? {},
    opens_at: row.opens_at,
    expires_at: expiresAt,
    resolved_at: row.resolved_at,
    resolution_summary: row.resolution_summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_expired: isExpired,
  };
}

async function getDefaultActionPolicy(campaignId, characterId, executor = { query }) {
  const result = await executor.query(selectCharacterDefaultActionPolicyQuery, [
    campaignId,
    characterId,
  ]);

  return mapDefaultActionPolicyRow(result.rows[0] || null, campaignId, characterId);
}

async function getOpenActionWindow(campaignId, characterId, executor = { query }) {
  const result = await executor.query(selectOpenActionWindowByCampaignAndCharacterQuery, [
    campaignId,
    characterId,
  ]);

  return mapActionWindowRow(result.rows[0] || null);
}

function buildAction({
  key,
  action_type,
  label,
  description,
  category,
  priority,
  mode_relevance = 'secondary',
  payload = {},
  source = null,
  debug = {},
}) {
  return {
    key,
    action_type,
    label,
    description,
    category,
    priority,
    mode_relevance,
    payload,
    source,
    debug,
  };
}

function buildBlockedOpportunity({
  key,
  action_type,
  label,
  category,
  blocked_reason,
  source = null,
}) {
  return {
    key,
    action_type,
    label,
    category,
    is_available: false,
    blocked_reason,
    source,
  };
}

function pickCharacterCombatParticipant(combat, characterId) {
  return (
    combat?.participants?.find(
      (participant) =>
        participant.entity_type === 'character' && participant.entity_id === Number(characterId)
    ) ?? null
  );
}

function deriveCurrentMode({ currentScene, activeDialogue, activeCombat, characterCombatParticipant, activeEvent }) {
  if (activeCombat && activeCombat.status === 'active') {
    const currentParticipant = activeCombat.current_participant;

    if (
      currentParticipant &&
      currentParticipant.entity_type === 'character' &&
      currentParticipant.entity_id === Number(characterCombatParticipant?.entity_id) &&
      currentParticipant.control_mode !== 'ai'
    ) {
      return 'combat';
    }

    return 'waiting';
  }

  if (activeDialogue && activeDialogue.status === 'active') {
    return 'dialogue';
  }

  if (activeEvent && activeEvent.status === 'active') {
    return 'event';
  }

  if (!currentScene) {
    return 'transition';
  }

  return 'exploration';
}

function ensureKnownPlayMode(value) {
  if (!playModes.has(value)) {
    throw createHttpError(`Unknown play mode: ${value}`, 500);
  }

  return value;
}

function summarizeDialogueForPlayer(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    status: session.status,
    dialogue: {
      id: session.dialogue.id,
      key: session.dialogue.dialogue_key,
      name: session.dialogue.name,
      summary: session.dialogue.summary,
    },
    npc: session.npc,
    scene: session.scene,
    current_node: session.current_node
      ? {
          id: session.current_node.id,
          key: session.current_node.node_key,
          title: session.current_node.title,
          text_content: session.current_node.text_content,
          is_terminal: session.current_node.is_terminal,
        }
      : null,
    pending_option_id: session.pending_option_id,
  };
}

function summarizeEventForPlayer(eventInstance) {
  if (!eventInstance) {
    return null;
  }

  return {
    id: eventInstance.id,
    status: eventInstance.status,
    prompt_text: eventInstance.prompt_text,
    template: eventInstance.template,
    selected_option: eventInstance.selected_option,
    outcome_summary: eventInstance.outcome_summary,
  };
}

function summarizeCombatForPlayer(combat, characterId) {
  if (!combat) {
    return null;
  }

  const characterParticipant = pickCharacterCombatParticipant(combat, characterId);

  return {
    id: combat.id,
    status: combat.status,
    round_number: combat.round_number,
    current_turn_index: combat.current_turn_index,
    visibility_mode: combat.visibility_mode,
    auto_advance_turns: combat.auto_advance_turns,
    scene: combat.scene,
    current_participant: combat.current_participant,
    character_participant_id: characterParticipant?.id ?? null,
    participants: combat.participants.map((participant) => ({
      id: participant.id,
      display_name: participant.display_name,
      entity_type: participant.entity_type,
      entity_id: participant.entity_id,
      faction: participant.faction,
      current_hp: participant.current_hp,
      max_hp: participant.max_hp,
      temporary_hp: participant.temporary_hp,
      armor_class: participant.armor_class,
      is_active: participant.is_active,
      is_defeated: participant.is_defeated,
      control_mode: participant.control_mode,
    })),
    outcome_summary: combat.outcome_summary,
    result_json: combat.result_json,
  };
}

function buildContinuity(activeDialogue, activeCombat, currentScene, activeEvent) {
  const threads = [];

  if (activeDialogue) {
    let status = 'resumable';
    let reason = null;

    if (activeDialogue.status !== 'active') {
      status = 'terminated';
      reason = `dialogue_${activeDialogue.status}`;
    } else if (currentScene && activeDialogue.scene?.id !== null && activeDialogue.scene.id !== currentScene.id) {
      status = 'terminated';
      reason = 'scene_changed';
    } else if (activeCombat && activeCombat.status === 'active') {
      status = 'transformed';
      reason = 'combat_foregrounded';
    }

    threads.push({
      thread_type: 'dialogue',
      thread_id: activeDialogue.id,
      status,
      reason,
    });
  }

  if (activeEvent) {
    threads.push({
      thread_type: 'event',
      thread_id: activeEvent.id,
      status: activeEvent.status === 'active' ? 'resumable' : 'terminated',
      reason: activeEvent.status === 'active' ? null : `event_${activeEvent.status}`,
    });
  }

  if (activeCombat) {
    threads.push({
      thread_type: 'combat',
      thread_id: activeCombat.id,
      status: activeCombat.status === 'active' ? 'resumable' : 'terminated',
      reason: activeCombat.status === 'active' ? null : `combat_${activeCombat.status}`,
    });
  }

  return threads;
}

function buildContextSummary({ mode, currentScene, adventureState, activeDialogue, activeEvent, activeCombat }) {
  switch (mode) {
    case 'combat':
      return activeCombat?.current_participant
        ? `Combat is active in ${activeCombat.scene?.name ?? 'the current scene'}. It is ${activeCombat.current_participant.display_name}'s turn.`
        : 'Combat is active, but the turn order needs attention.';
    case 'waiting':
      return activeCombat?.current_participant
        ? `You are waiting in ${activeCombat.scene?.name ?? 'the current scene'} while ${activeCombat.current_participant.display_name} acts.`
        : 'You are waiting for the next meaningful development.';
    case 'dialogue':
      return activeDialogue?.current_node?.text_content
        ? activeDialogue.current_node.text_content
        : `You are in dialogue with ${activeDialogue?.npc?.name ?? 'someone nearby'}.`;
    case 'event':
      return activeEvent?.prompt_text ?? 'A choice is waiting for your response.';
    case 'transition':
      return 'You have not entered a scene yet. Choose a starting point to begin the adventure.';
    case 'exploration':
    default: {
      const sceneSummary =
        currentScene?.entry_text ?? currentScene?.summary ?? 'You are exploring the world.';
      const objectiveTitle = adventureState?.current_objective?.title ?? null;

      if (objectiveTitle) {
        return `${sceneSummary} Your current objective is "${objectiveTitle}".`;
      }

      return sceneSummary;
    }
  }
}

function buildPlayerSceneView(sceneState) {
  if (!sceneState.current_scene) {
    return {
      current_scene: null,
      available_starting_scenes: (sceneState.available_starting_scenes ?? []).map((scene) => ({
        id: scene.id,
        key: scene.key,
        name: scene.name,
        summary: scene.summary,
      })),
    };
  }

  const scene = sceneState.current_scene;

  return {
    current_scene: {
      id: scene.id,
      key: scene.key,
      name: scene.name,
      summary: scene.summary,
      description: scene.description,
      entry_text: scene.entry_text,
      location: scene.location,
      npcs: (scene.npcs ?? []).filter((npc) => npc.availability?.is_available),
      interactions: (scene.interactions ?? []).filter(
        (interaction) => interaction.availability?.is_available
      ),
      transitions: (scene.transitions ?? []).filter(
        (transition) => transition.availability?.is_available
      ),
      recent_history: scene.recent_history ?? [],
    },
  };
}

function buildFullSceneView(sceneState) {
  return sceneState;
}

function buildCombatActions(activeCombat, characterId, currentMode) {
  if (!activeCombat || activeCombat.status !== 'active') {
    return {
      actions: [],
      blocked: [],
    };
  }

  const currentParticipant = activeCombat.current_participant;
  const characterParticipant = pickCharacterCombatParticipant(activeCombat, characterId);

  if (!currentParticipant) {
    return {
      actions: [],
      blocked: [],
    };
  }

  if (
    currentParticipant.entity_type === 'character' &&
    currentParticipant.entity_id === Number(characterId) &&
    currentParticipant.control_mode !== 'ai'
  ) {
    const actions = [];

    for (const action of currentParticipant.available_actions ?? []) {
      if (action.range?.type === 'self') {
        actions.push(
          buildAction({
            key: `combat_action:${currentParticipant.id}:${action.id}:${currentParticipant.id}`,
            action_type: 'combat_action',
            label: action.name,
            description: action.description,
            category: 'combat',
            priority: 120,
            mode_relevance: currentMode === 'combat' ? 'primary' : 'secondary',
            payload: {
              combat_id: activeCombat.id,
              participant_id: currentParticipant.id,
              action_id: action.id,
              target_participant_id: currentParticipant.id,
            },
            source: {
              type: 'combat',
              id: activeCombat.id,
            },
            debug: {
              action,
            },
          })
        );
        continue;
      }

      const targets = activeCombat.participants.filter(
        (participant) =>
          participant.id !== currentParticipant.id &&
          participant.is_active &&
          !participant.is_defeated &&
          participant.faction !== currentParticipant.faction
      );

      for (const target of targets) {
        actions.push(
          buildAction({
            key: `combat_action:${currentParticipant.id}:${action.id}:${target.id}`,
            action_type: 'combat_action',
            label: `${action.name} -> ${target.display_name}`,
            description: action.description,
            category: 'combat',
            priority: 120,
            mode_relevance: currentMode === 'combat' ? 'primary' : 'secondary',
            payload: {
              combat_id: activeCombat.id,
              participant_id: currentParticipant.id,
              action_id: action.id,
              target_participant_id: target.id,
            },
            source: {
              type: 'combat',
              id: activeCombat.id,
            },
            debug: {
              action,
              target,
            },
          })
        );
      }
    }

    actions.push(
      buildAction({
        key: `combat_end_turn:${currentParticipant.id}`,
        action_type: 'end_turn',
        label: 'End turn',
        description: 'Advance to the next combat participant.',
        category: 'combat',
        priority: 110,
        mode_relevance: currentMode === 'combat' ? 'primary' : 'secondary',
        payload: {
          combat_id: activeCombat.id,
          participant_id: currentParticipant.id,
        },
        source: {
          type: 'combat',
          id: activeCombat.id,
        },
      })
    );

    return {
      actions,
      blocked: [],
    };
  }

  if (characterParticipant) {
    return {
      actions: [
        buildAction({
          key: `combat_resolve_ai_turn:${activeCombat.id}`,
          action_type: 'resolve_ai_turn',
          label: 'Continue combat',
          description: 'Let the current AI combatant resolve its turn.',
          category: 'combat',
          priority: 118,
          mode_relevance: currentMode === 'waiting' ? 'primary' : 'secondary',
          payload: {
            combat_id: activeCombat.id,
          },
          source: {
            type: 'combat',
            id: activeCombat.id,
          },
        }),
      ],
      blocked: [],
    };
  }

  return {
    actions: [],
    blocked: [],
  };
}

function buildDialogueActions(activeDialogue, currentMode) {
  if (!activeDialogue || activeDialogue.status !== 'active') {
    return {
      actions: [],
      blocked: [],
    };
  }

  const actions = [];
  const blocked = [];

  for (const option of activeDialogue.options ?? []) {
    if (!option.availability?.is_available) {
      blocked.push(
        buildBlockedOpportunity({
          key: `dialogue_option:${option.option_key}`,
          action_type: 'choose_dialogue_option',
          label: option.label,
          category: 'dialogue',
          blocked_reason: option.availability?.unmet_requirements ?? [],
          source: {
            type: 'dialogue',
            id: activeDialogue.id,
          },
        })
      );
      continue;
    }

    if (option.is_pending_skill_check || option.skill_check?.mode === 'explicit') {
      actions.push(
        buildAction({
          key: `dialogue_check:${option.option_key}`,
          action_type: 'attempt_dialogue_skill_check',
          label: option.label,
          description: option.description,
          category: 'dialogue',
          priority: 105,
          mode_relevance: currentMode === 'dialogue' ? 'primary' : 'secondary',
          payload: {
            session_id: activeDialogue.id,
            option_id: option.id,
            option_key: option.option_key,
          },
          source: {
            type: 'dialogue',
            id: activeDialogue.id,
          },
          debug: {
            option,
          },
        })
      );
      continue;
    }

    actions.push(
      buildAction({
        key: `dialogue_option:${option.option_key}`,
        action_type: 'choose_dialogue_option',
        label: option.label,
        description: option.description,
        category: 'dialogue',
        priority: 105,
        mode_relevance: currentMode === 'dialogue' ? 'primary' : 'secondary',
        payload: {
          session_id: activeDialogue.id,
          option_id: option.id,
          option_key: option.option_key,
        },
        source: {
          type: 'dialogue',
          id: activeDialogue.id,
        },
        debug: {
          option,
        },
      })
    );
  }

  return {
    actions,
    blocked,
  };
}

function buildEventActions(activeEvent, currentMode) {
  if (!activeEvent || activeEvent.status !== 'active') {
    return {
      actions: [],
      blocked: [],
    };
  }

  const actions = [];
  const blocked = [];

  for (const option of activeEvent.options ?? []) {
    if (!option.is_available) {
      blocked.push(
        buildBlockedOpportunity({
          key: `event_option:${option.option_key}`,
          action_type: 'choose_event_option',
          label: option.label,
          category: 'event',
          blocked_reason: ['This event option is unavailable'],
          source: {
            type: 'event',
            id: activeEvent.id,
          },
        })
      );
      continue;
    }

    actions.push(
      buildAction({
        key: `event_option:${option.option_key}`,
        action_type: 'choose_event_option',
        label: option.label,
        description: option.description,
        category: 'event',
        priority: 95,
        mode_relevance: currentMode === 'event' ? 'primary' : 'secondary',
        payload: {
          event_id: activeEvent.id,
          option_id: option.id,
          option_key: option.option_key,
        },
        source: {
          type: 'event',
          id: activeEvent.id,
        },
      })
    );
  }

  return {
    actions,
    blocked,
  };
}

function buildSceneActions(sceneState, currentMode) {
  if (!sceneState.current_scene) {
    const availableStartingScenes = sceneState.available_starting_scenes ?? [];

    return {
      actions: availableStartingScenes.map((scene) =>
        buildAction({
          key: `enter_scene:${scene.key}`,
          action_type: 'enter_scene',
          label: `Enter ${scene.name}`,
          description: scene.summary,
          category: 'movement',
          priority: 80,
          mode_relevance: currentMode === 'transition' ? 'primary' : 'secondary',
          payload: {
            scene_id: scene.id,
            scene_key: scene.key,
          },
          source: {
            type: 'scene',
            id: scene.id,
            key: scene.key,
          },
        })
      ),
      blocked: [],
    };
  }

  const scene = sceneState.current_scene;
  const actions = [];
  const blocked = [];

  for (const transition of scene.transitions ?? []) {
    if (!transition.availability?.is_available) {
      blocked.push(
        buildBlockedOpportunity({
          key: `move_scene:${transition.transition_key}`,
          action_type: 'move_scene',
          label: transition.label,
          category: 'movement',
          blocked_reason: transition.availability?.unmet_requirements ?? [],
          source: {
            type: 'scene_transition',
            id: transition.id,
            key: transition.transition_key,
          },
        })
      );
      continue;
    }

    actions.push(
      buildAction({
        key: `move_scene:${transition.transition_key}`,
        action_type: 'move_scene',
        label: transition.label,
        description: transition.description ?? transition.to_scene?.summary ?? null,
        category: 'movement',
        priority:
          transition.recommendation?.is_recommended_for_alignment === true || transition.is_default_path
            ? 70
            : 60,
        mode_relevance: currentMode === 'exploration' ? 'primary' : 'secondary',
        payload: {
          transition_id: transition.id,
          transition_key: transition.transition_key,
          scene_id: transition.to_scene?.id ?? null,
          scene_key: transition.to_scene?.key ?? null,
        },
        source: {
          type: 'scene_transition',
          id: transition.id,
          key: transition.transition_key,
          name: transition.label,
        },
        debug: {
          recommendation: transition.recommendation ?? null,
        },
      })
    );
  }

  for (const npc of scene.npcs ?? []) {
    if (!npc.availability?.is_available) {
      blocked.push(
        buildBlockedOpportunity({
          key: `talk_to_npc:${npc.key}`,
          action_type: 'talk_to_npc',
          label: `Talk to ${npc.name}`,
          category: 'dialogue',
          blocked_reason: npc.availability?.unmet_requirements ?? [],
          source: {
            type: 'npc',
            id: npc.id,
            key: npc.key,
          },
        })
      );
      continue;
    }

    actions.push(
      buildAction({
        key: `talk_to_npc:${npc.key}`,
        action_type: 'talk_to_npc',
        label: `Talk to ${npc.name}`,
        description: npc.presence_text ?? npc.description ?? null,
        category: 'dialogue',
        priority: 65,
        mode_relevance: currentMode === 'exploration' ? 'primary' : 'secondary',
        payload: {
          npc_id: npc.id,
          npc_key: npc.key,
        },
        source: {
          type: 'npc',
          id: npc.id,
          key: npc.key,
          name: npc.name,
        },
      })
    );

    if (npc.stat_block) {
      actions.push(
        buildAction({
          key: `start_combat:${npc.key}`,
          action_type: 'start_combat',
          label: `Attack ${npc.name}`,
          description: 'Escalate the current scene into combat.',
          category: 'combat',
          priority: 40,
          mode_relevance: 'secondary',
          payload: {
            npc_id: npc.id,
            npc_key: npc.key,
            visibility_mode: 'narrative',
            auto_advance_turns: false,
          },
          source: {
            type: 'npc',
            id: npc.id,
            key: npc.key,
            name: npc.name,
          },
        })
      );
    }
  }

  for (const interaction of scene.interactions ?? []) {
    if (!interaction.availability?.is_available) {
      blocked.push(
        buildBlockedOpportunity({
          key: `scene_interaction:${interaction.interaction_key}`,
          action_type: 'scene_interaction',
          label: interaction.label,
          category: 'interaction',
          blocked_reason: interaction.availability?.unmet_requirements ?? [],
          source: {
            type: 'scene_interaction',
            id: interaction.id,
            key: interaction.interaction_key,
          },
        })
      );
      continue;
    }

    actions.push(
      buildAction({
        key: `scene_interaction:${interaction.interaction_key}`,
        action_type: 'scene_interaction',
        label: interaction.label,
        description: interaction.description,
        category: 'interaction',
        priority: 68,
        mode_relevance: currentMode === 'exploration' ? 'primary' : 'secondary',
        payload: {
          interaction_id: interaction.id,
          interaction_key: interaction.interaction_key,
        },
        source: {
          type: 'scene_interaction',
          id: interaction.id,
          key: interaction.interaction_key,
        },
      })
    );
  }

  actions.push(
    buildAction({
      key: 'wait',
      action_type: 'wait',
      label: 'Wait',
      description: 'Pause and let the immediate situation develop.',
      category: 'meta',
      priority: 10,
      mode_relevance: 'secondary',
      payload: {},
      source: {
        type: 'runtime',
        id: null,
      },
    })
  );

  return {
    actions,
    blocked,
  };
}

function curateActions(actions, runtimeMode) {
  const limit = runtimeMode === 'minimal' ? 5 : runtimeMode === 'player' ? 8 : 20;

  return [...actions]
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}

function chooseSuggestion({ mode, actions }) {
  if (mode === 'combat' || mode === 'waiting' || mode === 'dialogue') {
    return null;
  }

  const movementAction = actions.find(
    (action) => action.action_type === 'move_scene' && action.priority >= 70
  );

  if (movementAction) {
    return {
      text: `${movementAction.label} seems like the clearest lead right now.`,
      action_key: movementAction.key,
    };
  }

  const interactionAction = actions.find((action) => action.action_type === 'scene_interaction');

  if (interactionAction) {
    return {
      text: `You could ${interactionAction.label.toLowerCase()}.`,
      action_key: interactionAction.key,
    };
  }

  const eventAction = actions.find((action) => action.action_type === 'choose_event_option');

  if (eventAction) {
    return {
      text: `You could respond by choosing "${eventAction.label}".`,
      action_key: eventAction.key,
    };
  }

  return null;
}

function buildDesiredActionWindow({
  campaignId,
  characterId,
  mode,
  currentScene,
  activeDialogue,
  activeCombat,
  activeEvent,
    availableActions,
    defaultActionPolicy,
    runtimeConfig,
}) {
  const suggestedAction = availableActions[0] ?? null;
  const promptAvailableAt = new Date().toISOString();
  const expiresAt = calculateActionWindowCloseAt({
    promptAvailableAt,
    runtimeConfig,
    defaultActionPolicy,
  });

  if (mode === 'combat' && activeCombat?.status === 'active') {
    return {
      campaign_id: campaignId,
      character_id: characterId,
      scene_id: currentScene?.id ?? activeCombat.scene?.id ?? null,
      dialogue_session_id: null,
      combat_id: activeCombat.id,
      event_instance_id: null,
      window_type: 'combat_turn',
      prompt_text: `It is your turn in combat ${activeCombat.id}.`,
      suggested_action_key: suggestedAction?.key ?? null,
      default_action_type:
        defaultActionPolicy.default_action_type === 'resolve_ai_turn'
          ? 'end_turn'
          : defaultActionPolicy.default_action_type,
      default_action_payload_json: defaultActionPolicy.default_action_payload_json ?? {},
      opens_at: promptAvailableAt,
      expires_at: expiresAt,
    };
  }

  if (mode === 'waiting' && activeCombat?.status === 'active') {
    return {
      campaign_id: campaignId,
      character_id: characterId,
      scene_id: currentScene?.id ?? activeCombat.scene?.id ?? null,
      dialogue_session_id: null,
      combat_id: activeCombat.id,
      event_instance_id: null,
      window_type: 'combat_wait',
      prompt_text: `Waiting for combat ${activeCombat.id} to advance.`,
      suggested_action_key: suggestedAction?.key ?? null,
      default_action_type: 'resolve_ai_turn',
      default_action_payload_json: {},
      opens_at: promptAvailableAt,
      expires_at: expiresAt,
    };
  }

  if (activeDialogue?.status === 'active') {
    return {
      campaign_id: campaignId,
      character_id: characterId,
      scene_id: currentScene?.id ?? activeDialogue.scene?.id ?? null,
      dialogue_session_id: activeDialogue.id,
      combat_id: null,
      event_instance_id: null,
      window_type: activeDialogue.pending_option_id ? 'dialogue_check' : 'dialogue_choice',
      prompt_text:
        activeDialogue.current_node?.text_content ?? `Dialogue with ${activeDialogue.npc?.name ?? 'an NPC'}.`,
      suggested_action_key: suggestedAction?.key ?? null,
      default_action_type:
        defaultActionPolicy.default_action_type === 'resolve_ai_turn'
          ? 'wait'
          : defaultActionPolicy.default_action_type,
      default_action_payload_json: defaultActionPolicy.default_action_payload_json ?? {},
      opens_at: promptAvailableAt,
      expires_at: expiresAt,
    };
  }

  if (activeEvent?.status === 'active') {
    return {
      campaign_id: campaignId,
      character_id: characterId,
      scene_id: currentScene?.id ?? null,
      dialogue_session_id: null,
      combat_id: null,
      event_instance_id: activeEvent.id,
      window_type: 'event_choice',
      prompt_text: activeEvent.prompt_text,
      suggested_action_key: suggestedAction?.key ?? null,
      default_action_type:
        defaultActionPolicy.default_action_type === 'resolve_ai_turn'
          ? 'wait'
          : defaultActionPolicy.default_action_type,
      default_action_payload_json: defaultActionPolicy.default_action_payload_json ?? {},
      opens_at: promptAvailableAt,
      expires_at: expiresAt,
    };
  }

  if (!currentScene && availableActions.some((action) => action.action_type === 'enter_scene')) {
    return {
      campaign_id: campaignId,
      character_id: characterId,
      scene_id: null,
      dialogue_session_id: null,
      combat_id: null,
      event_instance_id: null,
      window_type: 'scene_entry',
      prompt_text: 'Choose a starting scene to begin the adventure.',
      suggested_action_key: suggestedAction?.key ?? null,
      default_action_type: 'wait',
      default_action_payload_json: {},
      opens_at: promptAvailableAt,
      expires_at: expiresAt,
    };
  }

  if (currentScene) {
    return {
      campaign_id: campaignId,
      character_id: characterId,
      scene_id: currentScene.id,
      dialogue_session_id: null,
      combat_id: null,
      event_instance_id: null,
      window_type: 'exploration',
      prompt_text: `What does your character do in ${currentScene.name ?? 'the current scene'}?`,
      suggested_action_key: suggestedAction?.key ?? null,
      default_action_type:
        defaultActionPolicy.default_action_type === 'resolve_ai_turn'
          ? 'wait'
          : defaultActionPolicy.default_action_type,
      default_action_payload_json: defaultActionPolicy.default_action_payload_json ?? {},
      opens_at: promptAvailableAt,
      expires_at: expiresAt,
    };
  }

  return null;
}

function sameWindow(existing, desired) {
  if (!existing || !desired) {
    return false;
  }

  return (
    existing.scene_id === desired.scene_id &&
    existing.dialogue_session_id === desired.dialogue_session_id &&
    existing.combat_id === desired.combat_id &&
    existing.event_instance_id === desired.event_instance_id &&
    existing.window_type === desired.window_type &&
    existing.prompt_text === desired.prompt_text &&
    existing.suggested_action_key === desired.suggested_action_key &&
    existing.default_action_type === desired.default_action_type &&
    JSON.stringify(existing.default_action_payload_json ?? {}) ===
      JSON.stringify(desired.default_action_payload_json ?? {})
  );
}

async function syncActionWindow(campaignId, characterId, desiredWindow) {
  return withTransaction(async (client) => {
    const existingWindow = await getOpenActionWindow(campaignId, characterId, client);

    if (!desiredWindow) {
      if (!existingWindow) {
        return null;
      }

      await client.query(closeActionWindowQuery, [
        existingWindow.id,
        'canceled',
        'No active runtime window remains.',
      ]);
      await recordCampaignLog(
        {
          campaign_id: campaignId,
          character_id: characterId,
          actor_account_id: null,
          log_type: 'action_window_closed',
          message: 'Closed the previous action window.',
          data_json: {
            action_window_id: existingWindow.id,
            window_type: existingWindow.window_type,
            reason: 'no_active_runtime_window',
          },
        },
        client
      );

      return null;
    }

    if (!existingWindow) {
      const inserted = await client.query(insertActionWindowQuery, [
        desiredWindow.campaign_id,
        desiredWindow.character_id,
        desiredWindow.scene_id,
        desiredWindow.dialogue_session_id,
        desiredWindow.combat_id,
        desiredWindow.event_instance_id,
        desiredWindow.window_type,
        desiredWindow.prompt_text,
        desiredWindow.suggested_action_key,
        desiredWindow.default_action_type,
        JSON.stringify(desiredWindow.default_action_payload_json ?? {}),
        desiredWindow.opens_at,
        desiredWindow.expires_at,
      ]);
      const mapped = mapActionWindowRow(inserted.rows[0]);
      await recordCampaignLog(
        {
          campaign_id: campaignId,
          character_id: characterId,
          actor_account_id: null,
          log_type: 'action_window_opened',
          message: `Opened a ${mapped.window_type} action window.`,
          data_json: {
            action_window_id: mapped.id,
            suggested_action_key: mapped.suggested_action_key,
          },
        },
        client
      );

      return mapped;
    }

    if (sameWindow(existingWindow, desiredWindow)) {
      return existingWindow;
    }

    await client.query(closeActionWindowQuery, [
      existingWindow.id,
      'canceled',
      'Superseded by a new runtime context.',
    ]);
    await recordCampaignLog(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: null,
        log_type: 'action_window_closed',
        message: 'Replaced the previous action window.',
        data_json: {
          action_window_id: existingWindow.id,
          window_type: existingWindow.window_type,
          reason: 'superseded',
        },
      },
      client
    );

    const inserted = await client.query(insertActionWindowQuery, [
      desiredWindow.campaign_id,
      desiredWindow.character_id,
      desiredWindow.scene_id,
      desiredWindow.dialogue_session_id,
      desiredWindow.combat_id,
      desiredWindow.event_instance_id,
      desiredWindow.window_type,
      desiredWindow.prompt_text,
      desiredWindow.suggested_action_key,
      desiredWindow.default_action_type,
      JSON.stringify(desiredWindow.default_action_payload_json ?? {}),
      desiredWindow.opens_at,
      desiredWindow.expires_at,
      ]);
    const mapped = mapActionWindowRow(inserted.rows[0]);

    await recordCampaignLog(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: null,
        log_type: 'action_window_opened',
        message: `Opened a ${mapped.window_type} action window.`,
        data_json: {
          action_window_id: mapped.id,
          suggested_action_key: mapped.suggested_action_key,
        },
      },
      client
    );

    return mapped;
  });
}

async function loadRuntimeSnapshot(campaignId, characterId, runtimeMode = 'player') {
  const normalizedMode = normalizeRuntimeMode(runtimeMode);
  const adventureMode = mapAdventureMode(normalizedMode);

  const [
    context,
    adventureState,
    sceneState,
    rawDialogue,
    activeCombat,
      rawEvent,
      defaultPolicy,
      runtimeConfig,
      advancementStatus,
  ] =
    await Promise.all([
      getNarrativeContext(campaignId, characterId),
      getAdventureState(campaignId, characterId, adventureMode),
      getCharacterScene(campaignId, characterId),
      getActiveDialogueSessionForCharacter(campaignId, characterId),
      findActiveCombatForCharacter(campaignId, characterId),
      findActiveEventForCharacter(campaignId, characterId),
      getDefaultActionPolicy(campaignId, characterId),
      getWebActionRuntimeConfig(campaignId),
      getCharacterAdvancementStatus(characterId, {
        campaign_id: campaignId,
        limit: 10,
      }),
    ]);

  if (!context) {
    throw createHttpError('Character is not a member of this campaign', 404);
  }

  const currentScene = sceneState.current_scene ?? null;
  const continuity = buildContinuity(rawDialogue, activeCombat, currentScene, rawEvent);
  const activeDialogue =
    rawDialogue &&
    rawDialogue.status === 'active' &&
    (!currentScene || rawDialogue.scene?.id === null || rawDialogue.scene.id === currentScene.id) &&
    !(activeCombat && activeCombat.status === 'active')
      ? rawDialogue
      : null;
  const activeEvent = rawEvent && rawEvent.status === 'active' ? rawEvent : null;
  const characterCombatParticipant = pickCharacterCombatParticipant(activeCombat, characterId);
  const mode = ensureKnownPlayMode(
    deriveCurrentMode({
      currentScene,
      activeDialogue,
      activeCombat,
      characterCombatParticipant,
      activeEvent,
    })
  );

  const dialogueActions = buildDialogueActions(activeDialogue, mode);
  const combatActions = buildCombatActions(activeCombat, characterId, mode);
  const eventActions = buildEventActions(activeEvent, mode);
  const sceneActions = buildSceneActions(sceneState, mode);
  const allAvailableActions = [
    ...combatActions.actions,
    ...dialogueActions.actions,
    ...eventActions.actions,
    ...sceneActions.actions,
  ];
  const curatedActions = curateActions(allAvailableActions, normalizedMode);
  const suggestion = chooseSuggestion({
    mode,
    actions: curatedActions,
  });
  const desiredWindow = buildDesiredActionWindow({
    campaignId,
    characterId,
    mode,
    currentScene,
    activeDialogue,
    activeCombat,
    activeEvent,
    availableActions: curatedActions,
    defaultActionPolicy: defaultPolicy,
    runtimeConfig,
  });
  const actionWindow = await syncActionWindow(campaignId, characterId, desiredWindow);
  const playState = {
    current_scene_id: currentScene?.id ?? null,
    current_mode: mode,
    active_dialogue_session_id: activeDialogue?.id ?? null,
    active_combat_id: activeCombat?.id ?? null,
    active_event_id: activeEvent?.id ?? null,
    current_objective_id: adventureState.current_objective?.objective_id ?? null,
    current_objective: adventureState.current_objective ?? null,
    last_significant_update_at:
      actionWindow?.updated_at ??
      adventureState.recent_result?.created_at ??
      activeCombat?.updated_at ??
      activeDialogue?.updated_at ??
      activeEvent?.updated_at ??
      context.current_scene_entered_at ??
      null,
    pending_action_window_id: actionWindow?.id ?? null,
    level_up_available: advancementStatus?.level_up_available ?? false,
    pending_level_count: advancementStatus?.pending_level_count ?? 0,
    can_start_level_up_now: advancementStatus?.safe_moment?.can_start_now ?? true,
    level_up_deferred_reason: advancementStatus?.safe_moment?.reason ?? null,
    active_level_up_session_id: advancementStatus?.active_level_up_session?.id ?? null,
  };

  return {
    runtime_mode: normalizedMode,
    context,
    adventure_state: adventureState,
    scene_state: sceneState,
    current_scene: currentScene,
    active_dialogue: activeDialogue,
    active_combat: activeCombat,
    active_event: activeEvent,
    current_mode: mode,
    play_state: playState,
    context_summary: buildContextSummary({
      mode,
      currentScene,
      adventureState,
      activeDialogue,
      activeEvent,
      activeCombat,
    }),
    available_actions: curatedActions,
    all_available_actions: allAvailableActions,
    blocked_opportunities: [
      ...combatActions.blocked,
      ...dialogueActions.blocked,
      ...eventActions.blocked,
      ...sceneActions.blocked,
    ],
    suggestion,
    continuity,
    action_window: actionWindow,
    default_action_policy: defaultPolicy,
    advancement_status: advancementStatus,
  };
}

function buildRuntimeIdentity(snapshot) {
  return {
    campaign_id: snapshot.context.campaign_id,
    campaign_name: snapshot.context.campaign.name,
    character_id: snapshot.context.character_id,
    character_name: snapshot.context.character.name,
    alignment: snapshot.context.character.alignment,
  };
}

function buildMinimalRuntimeView(snapshot) {
  return {
    identity: buildRuntimeIdentity(snapshot),
    play_state: snapshot.play_state,
    context_summary: snapshot.context_summary,
    current_scene: snapshot.current_scene
      ? {
          id: snapshot.current_scene.id,
          key: snapshot.current_scene.key,
          name: snapshot.current_scene.name,
          summary: snapshot.current_scene.summary,
        }
      : null,
    current_objective: snapshot.adventure_state.current_objective,
    recent_result: snapshot.adventure_state.recent_result,
    advancement: snapshot.advancement_status
      ? {
          level_up_available: snapshot.advancement_status.level_up_available,
          pending_level_count: snapshot.advancement_status.pending_level_count,
          can_start_level_up_now: snapshot.advancement_status.safe_moment?.can_start_now ?? true,
          why_deferred: snapshot.advancement_status.safe_moment?.reason ?? null,
        }
      : null,
    available_actions: snapshot.available_actions.map((action) => ({
      key: action.key,
      action_type: action.action_type,
      label: action.label,
      description: action.description,
      category: action.category,
      payload: action.payload,
    })),
    suggestion: snapshot.suggestion,
  };
}

function buildPlayerRuntimeView(snapshot) {
  return {
    identity: buildRuntimeIdentity(snapshot),
    play_state: snapshot.play_state,
    context_summary: snapshot.context_summary,
    context: {
      scene: buildPlayerSceneView(snapshot.scene_state),
      dialogue: summarizeDialogueForPlayer(snapshot.active_dialogue),
      combat: summarizeCombatForPlayer(snapshot.active_combat, snapshot.context.character_id),
      event: summarizeEventForPlayer(snapshot.active_event),
    },
    quests: snapshot.adventure_state.quests ?? [],
    current_objective: snapshot.adventure_state.current_objective,
    knowledge: snapshot.adventure_state.knowledge ?? {},
    recent_result: snapshot.adventure_state.recent_result,
    advancement: snapshot.advancement_status
      ? {
          level_up_available: snapshot.advancement_status.level_up_available,
          pending_level_count: snapshot.advancement_status.pending_level_count,
          can_start_level_up_now: snapshot.advancement_status.safe_moment?.can_start_now ?? true,
          why_deferred: snapshot.advancement_status.safe_moment?.reason ?? null,
          active_level_up_session: snapshot.advancement_status.active_level_up_session,
        }
      : null,
    available_actions: snapshot.available_actions,
    suggestion: snapshot.suggestion,
    continuity: snapshot.continuity,
    action_window: snapshot.action_window,
    default_action_policy: snapshot.default_action_policy,
  };
}

function buildFullRuntimeView(snapshot) {
  return {
    identity: buildRuntimeIdentity(snapshot),
    play_state: snapshot.play_state,
    context_summary: snapshot.context_summary,
    context: {
      scene: buildFullSceneView(snapshot.scene_state),
      dialogue: snapshot.active_dialogue,
      combat: snapshot.active_combat,
      event: snapshot.active_event,
      adventure_state: snapshot.adventure_state,
    },
    available_actions: snapshot.available_actions,
    all_opportunities: snapshot.all_available_actions,
    blocked_opportunities: snapshot.blocked_opportunities,
    suggestion: snapshot.suggestion,
    continuity: snapshot.continuity,
    action_window: snapshot.action_window,
    default_action_policy: snapshot.default_action_policy,
    advancement: snapshot.advancement_status,
  };
}

export async function getPlayState(campaignId, characterId, mode = 'player') {
  const snapshot = await loadRuntimeSnapshot(
    normalizePositiveInteger(campaignId, 'campaignId'),
    normalizePositiveInteger(characterId, 'characterId'),
    mode
  );

  switch (snapshot.runtime_mode) {
    case 'minimal':
      return buildMinimalRuntimeView(snapshot);
    case 'player':
      return buildPlayerRuntimeView(snapshot);
    case 'full':
      return buildFullRuntimeView(snapshot);
    default:
      throw createHttpError('mode must be minimal, player, or full', 400);
  }
}

export async function getContextSummary(campaignId, characterId, mode = 'player') {
  const state = await getPlayState(campaignId, characterId, mode);

  return {
    identity: state.identity,
    play_state: state.play_state,
    context_summary: state.context_summary,
    current_objective: state.current_objective ?? state.play_state?.current_objective ?? null,
    recent_result: state.recent_result ?? state.context?.adventure_state?.recent_result ?? null,
    suggestion: state.suggestion ?? null,
  };
}

export async function listAvailableActions(campaignId, characterId, mode = 'player') {
  const state = await getPlayState(campaignId, characterId, mode);

  return {
    identity: state.identity,
    play_state: state.play_state,
    available_actions: state.available_actions ?? [],
    suggestion: state.suggestion ?? null,
    action_window: state.action_window ?? null,
    blocked_opportunities: mode === 'full' ? state.blocked_opportunities ?? [] : undefined,
  };
}

function findActionByKey(snapshot, actionKey) {
  const key = normalizeOptionalText(actionKey);

  if (!key) {
    return null;
  }

  return (
    snapshot.available_actions.find((action) => action.key === key) ??
    snapshot.all_available_actions.find((action) => action.key === key) ??
    null
  );
}

async function resolveMoveTargetFromScene(snapshot, input) {
  const requestedTransitionId = normalizePositiveInteger(input.transition_id, 'transition_id', {
    optional: true,
  });
  const requestedTransitionKey = normalizeOptionalText(input.transition_key);
  const requestedSceneId = normalizePositiveInteger(input.scene_id, 'scene_id', {
    optional: true,
  });
  const requestedSceneKey = normalizeOptionalText(input.scene_key);
  const transitions = snapshot.scene_state.current_scene?.transitions ?? [];

  if (requestedTransitionId !== null || requestedTransitionKey) {
    return {
      transition_id: requestedTransitionId,
      transition_key: requestedTransitionKey,
    };
  }

  if (requestedSceneId !== null || requestedSceneKey) {
    const matching = transitions.find((transition) => {
      if (!transition.availability?.is_available) {
        return false;
      }

      if (requestedSceneId !== null && transition.to_scene?.id === requestedSceneId) {
        return true;
      }

      if (requestedSceneKey && transition.to_scene?.key === requestedSceneKey) {
        return true;
      }

      return false;
    });

    if (!matching) {
      throw createHttpError('No available transition leads to that scene', 404);
    }

    return {
      transition_id: matching.id,
      transition_key: matching.transition_key,
    };
  }

  throw createHttpError(
    'move_scene requires transition_id, transition_key, scene_id, or scene_key',
    400
  );
}

async function recordThreadInterruption(campaignId, characterId, actorAccountId, threadType, threadId, reason) {
  return withTransaction(async (client) => {
    await recordCampaignLog(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: actorAccountId ?? null,
        log_type: 'thread_interrupted',
        message: `${threadType} ${threadId} was interrupted.`,
        data_json: {
          thread_type: threadType,
          thread_id: threadId,
          reason,
        },
      },
      client
    );
  });
}

function normalizeCommittedFollowup(value) {
  const followup = normalizeOptionalObject(value);
  if (!followup?.source_interaction_id) {
    return null;
  }

  return {
    source_interaction_id: normalizeOptionalText(followup.source_interaction_id),
    target_id: normalizeOptionalText(followup.target_id),
    target_label: normalizeOptionalText(followup.target_label),
    check_resolution: normalizeOptionalText(followup.check_resolution) ?? 'advantage',
    beat_action_type: normalizeOptionalText(followup.beat_action_type),
  };
}

function committedFollowupMechanicsText(checkResolution) {
  switch (normalizeOptionalText(checkResolution)) {
    case 'take_20':
      return 'The beat is spent taking enough time to resolve the closer look thoroughly.';
    case 'standard':
      return 'The beat is spent as a standard committed follow-up.';
    case 'advantage':
    default:
      return 'The beat is spent with advantage on the related follow-up.';
  }
}

function attachCommittedFollowupResult(result, input) {
  const committedFollowup = normalizeCommittedFollowup(input.committed_followup);
  if (!committedFollowup) {
    return result;
  }

  const safeMechanics = Array.isArray(result?.safe_mechanics) ? result.safe_mechanics : [];
  return {
    ...(result ?? {}),
    committed_followup: committedFollowup,
    safe_mechanics: [
      ...safeMechanics,
      {
        label: 'Committed follow-up',
        text: committedFollowupMechanicsText(committedFollowup.check_resolution),
        check_resolution: committedFollowup.check_resolution,
      },
    ],
  };
}

function resolveFreeFocusFollowup(input) {
  const committedFollowup = normalizeCommittedFollowup(input.committed_followup);
  const targetLabel =
    normalizeOptionalText(input.target_label) ??
    normalizeOptionalText(committedFollowup?.target_label) ??
    normalizeOptionalText(committedFollowup?.target_id) ??
    'that detail';
  const beatActionType =
    normalizeOptionalText(committedFollowup?.beat_action_type) ??
    normalizeOptionalText(input.verb) ??
    'investigate';

  return {
    narrative_text: `You commit the beat to ${targetLabel}, giving it more time and attention than a quick closer look would allow.`,
    result_summary: `You spend the beat following up on ${targetLabel}.`,
    outcome_summary: `Committed ${beatActionType} follow-up on ${targetLabel}.`,
  };
}

async function executePlayableAction(snapshot, input) {
  const actionType = normalizeOptionalText(input.action_type);
  const actorAccountId = normalizePositiveInteger(input.actor_account_id, 'actor_account_id', {
    optional: true,
  });
  const explicitRoll = normalizeOptionalRoll(input.roll);

  switch (actionType) {
    case 'enter_scene':
      return enterCharacterScene(snapshot.context.campaign_id, snapshot.context.character_id, {
        scene_id: normalizePositiveInteger(input.scene_id, 'scene_id', { optional: true }),
        scene_key: normalizeOptionalText(input.scene_key),
        actor_account_id: actorAccountId,
      });
    case 'move_scene': {
      const moveTarget = await resolveMoveTargetFromScene(snapshot, input);
      const result = await moveCharacterScene(
        snapshot.context.campaign_id,
        snapshot.context.character_id,
        {
          ...moveTarget,
          actor_account_id: actorAccountId,
        }
      );

      if (snapshot.active_dialogue?.status === 'active') {
        await cancelDialogueSession(snapshot.active_dialogue.id, {
          actor_account_id: actorAccountId,
          reason: 'scene_changed',
        });
        await recordThreadInterruption(
          snapshot.context.campaign_id,
          snapshot.context.character_id,
          actorAccountId,
          'dialogue',
          snapshot.active_dialogue.id,
          'scene_changed'
        );
      }

      return result;
    }
    case 'talk_to_npc':
      return startDialogueSession(snapshot.context.campaign_id, snapshot.context.character_id, {
        npc_id: normalizePositiveInteger(input.npc_id, 'npc_id', { optional: true }),
        npc_key: normalizeOptionalText(input.npc_key),
        actor_account_id: actorAccountId,
      });
    case 'choose_dialogue_option':
      return chooseDialogueOption(
        normalizePositiveInteger(input.session_id ?? snapshot.active_dialogue?.id, 'session_id'),
        {
          option_id: normalizePositiveInteger(input.option_id, 'option_id', { optional: true }),
          option_key: normalizeOptionalText(input.option_key),
          actor_account_id: actorAccountId,
        }
      );
    case 'attempt_dialogue_skill_check':
      return attemptDialogueSkillCheck(
        normalizePositiveInteger(input.session_id ?? snapshot.active_dialogue?.id, 'session_id'),
        {
          option_id: normalizePositiveInteger(input.option_id, 'option_id', { optional: true }),
          option_key: normalizeOptionalText(input.option_key),
          roll: explicitRoll,
          actor_account_id: actorAccountId,
        }
      );
    case 'scene_interaction':
      return attemptSceneInteraction(snapshot.context.campaign_id, snapshot.context.character_id, {
        interaction_id: normalizePositiveInteger(input.interaction_id, 'interaction_id', {
          optional: true,
        }),
        interaction_key: normalizeOptionalText(input.interaction_key),
        roll: explicitRoll,
        actor_account_id: actorAccountId,
      });
    case 'free_focus_followup':
      return resolveFreeFocusFollowup(input);
    case 'choose_event_option':
      return chooseEventOption(
        normalizePositiveInteger(input.event_id ?? snapshot.active_event?.id, 'event_id'),
        {
          option_id: normalizePositiveInteger(input.option_id, 'option_id', { optional: true }),
          option_key: normalizeOptionalText(input.option_key),
          actor_account_id: actorAccountId,
        }
      );
    case 'start_combat': {
      if (snapshot.active_combat && ['pending', 'active'].includes(snapshot.active_combat.status)) {
        throw createHttpError('Character already has an active combat in this campaign', 409);
      }

      const npcId = normalizePositiveInteger(input.npc_id, 'npc_id', { optional: true });
      const npcKey = normalizeOptionalText(input.npc_key);
      const targetNpc =
        snapshot.scene_state.current_scene?.npcs?.find((npc) => {
          if (!npc.availability?.is_available || !npc.stat_block) {
            return false;
          }

          if (npcId !== null && npc.id === npcId) {
            return true;
          }

          if (npcKey && npc.key === npcKey) {
            return true;
          }

          return false;
        }) ?? null;

      if (!targetNpc) {
        throw createHttpError('That NPC cannot currently be engaged in combat', 404);
      }

      const createdCombat = await createCombat({
        campaign_id: snapshot.context.campaign_id,
        scene_id: snapshot.current_scene?.id ?? null,
        event_id: normalizePositiveInteger(input.event_id, 'event_id', { optional: true }),
        visibility_mode: normalizeOptionalText(input.visibility_mode) ?? 'narrative',
        auto_advance_turns: normalizeOptionalBoolean(input.auto_advance_turns, false),
        created_by_account_id: actorAccountId,
        participants: [
          {
            entity_type: 'character',
            entity_id: snapshot.context.character_id,
            faction: 'player',
            control_mode: 'manual',
          },
          {
            entity_type: 'npc',
            entity_id: targetNpc.id,
            faction: 'enemy',
            control_mode: 'ai',
          },
        ],
      });

      const startedCombat = await startCombat(createdCombat.id, {
        actor_account_id: actorAccountId,
        initiative_overrides: Array.isArray(input.initiative_overrides)
          ? input.initiative_overrides
          : [],
        skip_content_hooks: true,
      });

      if (snapshot.active_dialogue?.status === 'active') {
        await cancelDialogueSession(snapshot.active_dialogue.id, {
          actor_account_id: actorAccountId,
          reason: 'combat_started',
        });
        await recordThreadInterruption(
          snapshot.context.campaign_id,
          snapshot.context.character_id,
          actorAccountId,
          'dialogue',
          snapshot.active_dialogue.id,
          'combat_started'
        );
      }

      return startedCombat;
    }
    case 'combat_action':
      return actInCombat(
        normalizePositiveInteger(input.combat_id ?? snapshot.active_combat?.id, 'combat_id'),
        {
          participant_id: normalizePositiveInteger(input.participant_id, 'participant_id', {
            optional: true,
          }),
          action_id: normalizePositiveInteger(input.action_id, 'action_id'),
          target_participant_id: normalizePositiveInteger(
            input.target_participant_id,
            'target_participant_id'
          ),
          attack_roll: normalizeOptionalRoll(input.attack_roll),
          damage_rolls: normalizeDamageRolls(input.damage_rolls),
          actor_account_id: actorAccountId,
          skip_content_hooks: true,
        }
      );
    case 'end_turn':
      return endCombatTurn(
        normalizePositiveInteger(input.combat_id ?? snapshot.active_combat?.id, 'combat_id'),
        {
          participant_id: normalizePositiveInteger(input.participant_id, 'participant_id', {
            optional: true,
          }),
          actor_account_id: actorAccountId,
        }
      );
    case 'resolve_ai_turn':
      return resolveCombatAiTurn(
        normalizePositiveInteger(input.combat_id ?? snapshot.active_combat?.id, 'combat_id'),
        {
          attack_roll: normalizeOptionalRoll(input.attack_roll),
          damage_rolls: normalizeDamageRolls(input.damage_rolls),
          actor_account_id: actorAccountId,
          skip_content_hooks: true,
        }
      );
    case 'wait':
      if (
        snapshot.current_mode === 'waiting' &&
        snapshot.active_combat?.status === 'active' &&
        snapshot.active_combat.current_participant?.control_mode === 'ai'
      ) {
        return resolveCombatAiTurn(snapshot.active_combat.id, {
          actor_account_id: actorAccountId,
          skip_content_hooks: true,
        });
      }

      return {
        narrative_text: 'You wait and let the current moment breathe.',
        result_summary: 'No state change was applied.',
      };
    default:
      throw createHttpError('Unsupported playable action', 400);
  }
}

function normalizeActInput(rawInput = {}) {
  return {
    action_key: normalizeOptionalText(rawInput.action_key),
    action_type: normalizeOptionalText(rawInput.action_type ?? rawInput.action),
    actor_account_id: rawInput.actor_account_id ?? null,
    scene_id: rawInput.scene_id,
    scene_key: rawInput.scene_key,
    transition_id: rawInput.transition_id,
    transition_key: rawInput.transition_key,
    npc_id: rawInput.npc_id,
    npc_key: rawInput.npc_key,
    session_id: rawInput.session_id,
    option_id: rawInput.option_id,
    option_key: rawInput.option_key,
    interaction_id: rawInput.interaction_id,
    interaction_key: rawInput.interaction_key,
    event_id: rawInput.event_id,
    combat_id: rawInput.combat_id,
    participant_id: rawInput.participant_id,
    target_participant_id: rawInput.target_participant_id,
    action_id: rawInput.action_id,
    attack_roll: rawInput.attack_roll,
    damage_rolls: rawInput.damage_rolls,
    roll: rawInput.roll,
    raw_text: rawInput.raw_text,
    verb: rawInput.verb,
    target_id: rawInput.target_id,
    target_label: rawInput.target_label,
    committed_followup: rawInput.committed_followup,
    visibility_mode: rawInput.visibility_mode,
    auto_advance_turns: rawInput.auto_advance_turns,
    initiative_overrides: rawInput.initiative_overrides,
  };
}

export function mergeResolvedActionInput(resolvedPayload = {}, normalizedInput = {}) {
  return {
    ...resolvedPayload,
    ...Object.fromEntries(
      Object.entries(normalizedInput).filter(([, value]) => value !== undefined)
    ),
  };
}

function buildDynamicHookRequestsForAction(actionType, result) {
  switch (actionType) {
    case 'enter_scene':
    case 'move_scene':
      return ['scene_enter'];
    case 'talk_to_npc':
      return ['dialogue_node_enter'];
    case 'choose_dialogue_option':
    case 'attempt_dialogue_skill_check':
      return ['dialogue_option_select'];
    case 'scene_interaction':
      return [result?.check?.was_success ? 'interaction_success' : 'interaction_failure'];
    case 'choose_event_option':
      return ['event_resolved'];
    case 'start_combat':
      return ['combat_start'];
    case 'combat_action':
    case 'resolve_ai_turn':
      return result?.combat?.status === 'resolved' || result?.status === 'resolved'
        ? ['combat_end']
        : [];
    case 'wait':
    case 'free_focus_followup':
      return ['time_beat'];
    default:
      return [];
  }
}

export async function actThroughPlayState(campaignId, characterId, rawInput = {}, mode = 'player') {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const normalizedMode = normalizeRuntimeMode(mode);
  const snapshot = await loadRuntimeSnapshot(
    normalizedCampaignId,
    normalizedCharacterId,
    normalizedMode === 'minimal' ? 'player' : normalizedMode
  );
  let normalizedInput = normalizeActInput(rawInput);

  let resolvedAction = null;

  if (normalizedInput.action_key) {
    resolvedAction = findActionByKey(snapshot, normalizedInput.action_key);

    if (!resolvedAction) {
      if (normalizeCommittedFollowup(normalizedInput.committed_followup)) {
        normalizedInput = {
          ...normalizedInput,
          action_key: null,
          action_type: 'free_focus_followup',
        };
      } else {
        throw createHttpError('That action_key is not currently available', 404);
      }
    }

    if (resolvedAction) {
      normalizedInput = {
        ...mergeResolvedActionInput(resolvedAction.payload, normalizedInput),
        action_type: resolvedAction.action_type,
        action_key: resolvedAction.key,
      };
    }
  }

  if (!normalizedInput.action_type) {
    throw createHttpError('action_type or action_key is required', 400);
  }

  const result = attachCommittedFollowupResult(
    await executePlayableAction(snapshot, normalizedInput),
    normalizedInput
  );

  await withTransaction(async (client) => {
    await recordCampaignLog(
      {
        campaign_id: normalizedCampaignId,
        character_id: normalizedCharacterId,
        actor_account_id:
          normalizedInput.actor_account_id !== null
            ? normalizePositiveInteger(normalizedInput.actor_account_id, 'actor_account_id')
            : null,
        log_type: 'play_action',
        message: `Play action ${normalizedInput.action_type} resolved.`,
        data_json: {
          action_key: normalizedInput.action_key ?? resolvedAction?.key ?? null,
          action_type: normalizedInput.action_type,
        },
      },
      client
    );
  });

  const dynamicContent = [];

  for (const hookPoint of buildDynamicHookRequestsForAction(normalizedInput.action_type, result)) {
    dynamicContent.push(
      await executeContentHooks({
        campaignId: normalizedCampaignId,
        characterId: normalizedCharacterId,
        hookPoint,
        actorAccountId:
          normalizedInput.actor_account_id !== null
            ? normalizePositiveInteger(normalizedInput.actor_account_id, 'actor_account_id')
            : null,
        source: {
          type: 'play_action',
          action_key: normalizedInput.action_key ?? resolvedAction?.key ?? null,
          action_type: normalizedInput.action_type,
        },
        mode: normalizedMode,
      })
    );
  }

  return {
    action: {
      action_key: normalizedInput.action_key ?? resolvedAction?.key ?? null,
      action_type: normalizedInput.action_type,
    },
    result,
    dynamic_content: dynamicContent,
    play_state: await getPlayState(normalizedCampaignId, normalizedCharacterId, normalizedMode),
  };
}
