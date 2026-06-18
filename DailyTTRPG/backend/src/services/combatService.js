import { query, withTransaction } from '../config/db.js';
import { insertCampaignLogQuery } from '../db/queries/narrative.js';
import {
  insertCombatActionLogQuery,
  insertCombatParticipantQuery,
  insertCombatQuery,
  selectActionIdByNameQuery,
  selectCampaignByIdForCombatQuery,
  selectCampaignCharacterMembershipForCombatQuery,
  selectCharacterCombatSourceQuery,
  selectCombatActionLogsByCombatQuery,
  selectCombatByIdForUpdateQuery,
  selectCombatByIdQuery,
  selectCombatConditionsByCombatQuery,
  selectCombatParticipantByIdForUpdateQuery,
  selectCombatParticipantsByCombatForUpdateQuery,
  selectCombatParticipantsByCombatQuery,
  selectEventByIdForCombatQuery,
  selectMonsterCombatSourceQuery,
  selectNpcCombatSourceQuery,
  selectSceneByIdForCombatQuery,
  selectSceneNpcPresenceQuery,
  updateCharacterHitPointStateQuery,
  updateCombatParticipantInitiativeQuery,
  updateCombatParticipantStateQuery,
  updateCombatStateQuery,
  upsertCampaignNpcCombatStateQuery,
} from '../db/queries/combat.js';
import { selectActiveCombatByCampaignAndCharacterQuery } from '../db/queries/adventureRuntime.js';
import {
  buildInitiativeOrder,
  resolveAttackAction,
  selectAiAction,
} from '../engine/combat/combatEngine.js';
import { getActionById, listStatBlockActions } from './statBlockService.js';
import { recordGameplayHistory } from './gameplayHistoryService.js';
import { createHttpError } from '../utils/httpError.js';
import { applyAdventureOutcome } from './adventureProgressionService.js';
import { executeContentHooks } from './dynamicContentService.js';

const allowedEntityTypes = new Set(['character', 'npc', 'monster']);
const allowedControlModes = new Set(['manual', 'ai', 'system']);
const allowedVisibilityModes = new Set(['narrative', 'debug']);

function normalizeTrimmedText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizePositiveInteger(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function normalizeOptionalPositiveInteger(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return normalizePositiveInteger(value, label);
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

  throw createHttpError('Boolean options must be true or false', 400);
}

function normalizeOptionalD20Roll(value, label) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw createHttpError(`${label} must be an integer from 1 to 20`, 400);
  }

  return parsed;
}

function calculateDerivedProficiencyBonus(level) {
  if (!Number.isInteger(Number(level)) || Number(level) < 1) {
    return 2;
  }

  return Math.floor((Number(level) - 1) / 4) + 2;
}

function deriveCharacterArmorClass(row) {
  const storedArmorClass = Number(row.armor_class);

  if (Number.isInteger(storedArmorClass) && storedArmorClass > 0) {
    return storedArmorClass;
  }

  const dexterityScore = Number(row.dexterity);
  const dexterityModifier = calculateDerivedAbilityModifier(dexterityScore);

  return Math.max(10 + dexterityModifier, 1);
}

function calculateDerivedAbilityModifier(score) {
  if (!Number.isInteger(Number(score))) {
    return 0;
  }

  return Math.floor((Number(score) - 10) / 2);
}

function deriveCharacterHitPointState(row) {
  const rawMaxHitPoints = row.max_hit_points;
  const rawCurrentHitPoints = row.current_hit_points;
  const storedMaxHitPoints =
    rawMaxHitPoints === null || rawMaxHitPoints === undefined ? null : Number(rawMaxHitPoints);
  const storedCurrentHitPoints =
    rawCurrentHitPoints === null || rawCurrentHitPoints === undefined
      ? null
      : Number(rawCurrentHitPoints);

  const maxHitPoints =
    Number.isInteger(storedMaxHitPoints) && storedMaxHitPoints > 0 ? storedMaxHitPoints : null;
  const currentHitPoints =
    Number.isInteger(storedCurrentHitPoints) && storedCurrentHitPoints >= 0
      ? storedCurrentHitPoints
      : null;

  if (maxHitPoints === null && currentHitPoints === null) {
    throw createHttpError(
      'Character needs hit points before entering combat. Set max_hit_points and current_hit_points first.',
      409
    );
  }

  const resolvedMaxHitPoints = maxHitPoints ?? Math.max(currentHitPoints, 1);
  const resolvedCurrentHitPoints = Math.min(
    currentHitPoints ?? resolvedMaxHitPoints,
    resolvedMaxHitPoints
  );

  return {
    max_hit_points: resolvedMaxHitPoints,
    current_hit_points: resolvedCurrentHitPoints,
  };
}

function mapCombatRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    campaign:
      row.campaign_id !== null
        ? {
            id: Number(row.campaign_id),
            name: row.campaign_name,
          }
        : null,
    scene:
      row.scene_id !== null
        ? {
            id: Number(row.scene_id),
            key: row.scene_key,
            name: row.scene_name,
          }
        : null,
    event:
      row.event_id !== null
        ? {
            id: Number(row.event_id),
            prompt_text: row.event_prompt_text,
            template_key: row.event_template_key,
            template_name: row.event_template_name,
          }
        : null,
    status: row.status,
    round_number: Number(row.round_number),
    current_turn_index: Number(row.current_turn_index),
    current_participant_id: row.current_participant_id !== null ? Number(row.current_participant_id) : null,
    current_participant_name: row.current_participant_name ?? null,
    visibility_mode: row.visibility_mode,
    auto_advance_turns: row.auto_advance_turns,
    created_by_account_id:
      row.created_by_account_id !== null ? Number(row.created_by_account_id) : null,
    outcome_faction: row.outcome_faction,
    outcome_summary: row.outcome_summary,
    result_json: row.result_json ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
  };
}

function mapParticipantRow(row) {
  const hasHydratedStatBlock = row.stat_block_name !== undefined;

  return {
    id: Number(row.id),
    combat_id: Number(row.combat_id),
    entity_type: row.entity_type,
    entity_id: Number(row.entity_id),
    stat_block_id: row.stat_block_id !== null ? Number(row.stat_block_id) : null,
    display_name: row.display_name,
    initiative: row.initiative !== null ? Number(row.initiative) : null,
    turn_order: row.turn_order !== null ? Number(row.turn_order) : null,
    current_hp: Number(row.current_hp),
    max_hp: Number(row.max_hp),
    temporary_hp: Number(row.temporary_hp),
    armor_class: Number(row.armor_class),
    faction: row.faction,
    control_mode: row.control_mode,
    is_active: row.is_active,
    is_defeated: row.is_defeated,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner:
      row.entity_type === 'monster'
        ? {
            type: 'monster',
            key: row.monster_key,
            name: row.monster_name,
          }
        : row.entity_type === 'npc'
          ? {
              type: 'npc',
              key: row.npc_key,
              name: row.npc_name,
            }
          : {
              type: 'character',
              key: null,
              name: row.character_name,
            },
    stat_block:
      row.stat_block_id !== null && hasHydratedStatBlock
        ? {
            id: Number(row.stat_block_id),
            name: row.stat_block_name,
            challenge_rating:
              row.challenge_rating != null ? Number(row.challenge_rating) : null,
            xp_value: row.xp_value != null ? Number(row.xp_value) : null,
          }
        : null,
  };
}

function mapCombatActionLogRow(row) {
  return {
    id: Number(row.id),
    combat_id: Number(row.combat_id),
    participant_id: Number(row.participant_id),
    participant_name: row.participant_name,
    action_id: row.action_id !== null ? Number(row.action_id) : null,
    action_name: row.action_name,
    command_type: row.command_type,
    round_number: Number(row.round_number),
    turn_index: Number(row.turn_index),
    target_metadata_json: row.target_metadata_json ?? {},
    result_summary: row.result_summary,
    narrative_text: row.narrative_text,
    mechanical_detail_json: row.mechanical_detail_json ?? null,
    created_at: row.created_at,
  };
}

function mapCombatConditionRow(row) {
  return {
    id: Number(row.id),
    combat_participant_id: Number(row.combat_participant_id),
    condition_type: row.condition_type,
    source: row.source,
    duration_type: row.duration_type,
    duration_value: row.duration_value !== null ? Number(row.duration_value) : null,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function normalizeParticipantInput(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw createHttpError('Each combat participant must be a JSON object', 400);
  }

  const entityType = normalizeTrimmedText(entry.entity_type);

  if (!allowedEntityTypes.has(entityType)) {
    throw createHttpError('participant.entity_type must be character, npc, or monster', 400);
  }

  const controlMode = normalizeTrimmedText(entry.control_mode);

  if (controlMode !== null && !allowedControlModes.has(controlMode)) {
    throw createHttpError('participant.control_mode must be manual, ai, or system', 400);
  }

  return {
    entity_type: entityType,
    entity_id: normalizePositiveInteger(entry.entity_id, 'participant.entity_id'),
    faction: normalizeTrimmedText(entry.faction),
    control_mode: controlMode,
    notes: normalizeTrimmedText(entry.notes),
  };
}

function normalizeInitiativeOverrides(input) {
  if (input === undefined || input === null) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw createHttpError('initiative_overrides must be an array', 400);
  }

  return input.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw createHttpError('initiative_overrides entries must be JSON objects', 400);
    }

    const roll = Number(entry.roll);

    if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
      throw createHttpError('initiative_overrides.roll must be an integer from 1 to 20', 400);
    }

    return {
      participant_id:
        entry.participant_id !== undefined && entry.participant_id !== null
          ? normalizePositiveInteger(entry.participant_id, 'initiative_overrides.participant_id')
          : null,
      entity_type: entry.entity_type ? normalizeTrimmedText(entry.entity_type) : null,
      entity_id:
        entry.entity_id !== undefined && entry.entity_id !== null
          ? normalizePositiveInteger(entry.entity_id, 'initiative_overrides.entity_id')
          : null,
      roll,
    };
  });
}

function normalizeTargetParticipantIds(input) {
  if (Array.isArray(input.target_participant_ids)) {
    return input.target_participant_ids.map((value) =>
      normalizePositiveInteger(value, 'target_participant_ids')
    );
  }

  if (input.target_participant_id !== undefined && input.target_participant_id !== null) {
    return [normalizePositiveInteger(input.target_participant_id, 'target_participant_id')];
  }

  return [];
}

function normalizeDamageRolls(input) {
  if (input.damage_rolls === undefined) {
    return undefined;
  }

  if (!Array.isArray(input.damage_rolls)) {
    throw createHttpError('damage_rolls must be an array', 400);
  }

  return input.damage_rolls;
}

async function recordCampaignCombatLog(entry, executor) {
  if (!entry.campaign_id) {
    return null;
  }

  const result = await executor.query(insertCampaignLogQuery, [
    entry.campaign_id,
    entry.character_id ?? null,
    entry.actor_account_id ?? null,
    entry.log_type,
    entry.message,
    JSON.stringify(entry.data_json ?? {}),
  ]);

  return result.rows[0] ?? null;
}

async function getCampaignOrThrow(campaignId, executor = { query }) {
  const result = await executor.query(selectCampaignByIdForCombatQuery, [campaignId]);
  const campaign = result.rows[0] || null;

  if (!campaign) {
    throw createHttpError('Campaign not found', 404);
  }

  if (!campaign.is_active) {
    throw createHttpError('This campaign is inactive', 409);
  }

  return campaign;
}

async function getSceneOrThrow(sceneId, executor = { query }) {
  const result = await executor.query(selectSceneByIdForCombatQuery, [sceneId]);
  const scene = result.rows[0] || null;

  if (!scene) {
    throw createHttpError('Scene not found', 404);
  }

  if (!scene.is_active) {
    throw createHttpError('That scene is inactive', 409);
  }

  return {
    id: Number(scene.id),
    key: scene.key,
    name: scene.name,
    summary: scene.summary,
  };
}

async function getEventOrThrow(eventId, executor = { query }) {
  const result = await executor.query(selectEventByIdForCombatQuery, [eventId]);
  const eventRow = result.rows[0] || null;

  if (!eventRow) {
    throw createHttpError('Event not found', 404);
  }

  return {
    id: Number(eventRow.id),
    campaign_id: Number(eventRow.campaign_id),
    character_id: Number(eventRow.character_id),
    status: eventRow.status,
    prompt_text: eventRow.prompt_text,
    template: {
      id: Number(eventRow.template_id),
      key: eventRow.template_key,
      name: eventRow.template_name,
      event_type: eventRow.event_type,
    },
  };
}

async function getCampaignCharacterMembership(campaignId, characterId, executor = { query }) {
  const result = await executor.query(selectCampaignCharacterMembershipForCombatQuery, [
    campaignId,
    characterId,
  ]);
  const row = result.rows[0] || null;

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    is_active: row.is_active,
    current_scene_id: row.current_scene_id !== null ? Number(row.current_scene_id) : null,
    current_scene_entered_at: row.current_scene_entered_at,
    character_name: row.character_name,
    account_id: Number(row.account_id),
    character_is_active: row.character_is_active,
    account_is_active: row.account_is_active,
  };
}

async function loadCharacterParticipantSource(campaignId, sceneId, input, executor) {
  const membership = await getCampaignCharacterMembership(campaignId, input.entity_id, executor);

  if (!membership) {
    throw createHttpError('Character is not a member of this campaign', 404);
  }

  if (!membership.is_active) {
    throw createHttpError('That campaign membership is inactive', 409);
  }

  if (!membership.account_is_active) {
    throw createHttpError('Character account is inactive', 400);
  }

  if (!membership.character_is_active) {
    throw createHttpError('Inactive characters cannot enter combat', 409);
  }

  if (sceneId !== null && membership.current_scene_id !== sceneId) {
    throw createHttpError('Character is not currently in that scene', 409);
  }

  const result = await executor.query(selectCharacterCombatSourceQuery, [input.entity_id]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Character not found', 404);
  }

  const hitPointState = deriveCharacterHitPointState(row);

  return {
    entity_type: 'character',
    entity_id: Number(row.id),
    stat_block_id: null,
    display_name: row.name,
    current_hp: hitPointState.current_hit_points,
    max_hp: hitPointState.max_hit_points,
    temporary_hp: Number(row.temporary_hit_points ?? 0),
    armor_class: deriveCharacterArmorClass(row),
    abilities: {
      STR: Number(row.strength),
      DEX: Number(row.dexterity),
      CON: Number(row.constitution),
      INT: Number(row.intelligence),
      WIS: Number(row.wisdom),
      CHA: Number(row.charisma),
    },
    proficiency_bonus:
      row.proficiency_bonus !== null
        ? Number(row.proficiency_bonus)
        : calculateDerivedProficiencyBonus(Number(row.level)),
    faction: input.faction ?? 'player',
    control_mode: input.control_mode ?? 'manual',
    notes: input.notes,
  };
}

async function loadNpcParticipantSource(campaignId, sceneId, input, executor) {
  const result = await executor.query(selectNpcCombatSourceQuery, [input.entity_id, campaignId]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('NPC not found', 404);
  }

  if (!row.is_active) {
    throw createHttpError('That NPC is inactive', 409);
  }

  if (row.stat_block_id === null) {
    throw createHttpError('That NPC does not have a combat stat block', 409);
  }

  if (sceneId !== null) {
    const presenceResult = await executor.query(selectSceneNpcPresenceQuery, [
      sceneId,
      input.entity_id,
      campaignId,
    ]);

    if (!presenceResult.rows[0]) {
      throw createHttpError('That NPC is not currently present in the combat scene', 409);
    }
  }

  return {
    entity_type: 'npc',
    entity_id: Number(row.id),
    stat_block_id: Number(row.stat_block_id),
    display_name: row.name,
    current_hp: Number(row.current_hit_points),
    max_hp: Number(row.hit_point_max),
    temporary_hp: 0,
    armor_class: Number(row.armor_class),
    abilities: {
      STR: Number(row.strength),
      DEX: Number(row.dexterity),
      CON: Number(row.constitution),
      INT: Number(row.intelligence),
      WIS: Number(row.wisdom),
      CHA: Number(row.charisma),
    },
    proficiency_bonus: Number(row.proficiency_bonus),
    faction: input.faction ?? 'enemy',
    control_mode: input.control_mode ?? 'ai',
    notes: input.notes,
  };
}

async function loadMonsterParticipantSource(input, executor) {
  const result = await executor.query(selectMonsterCombatSourceQuery, [input.entity_id]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Monster not found', 404);
  }

  if (!row.is_active) {
    throw createHttpError('That monster is inactive', 409);
  }

  return {
    entity_type: 'monster',
    entity_id: Number(row.id),
    stat_block_id: Number(row.stat_block_id),
    display_name: row.name,
    current_hp: Number(row.hit_point_max),
    max_hp: Number(row.hit_point_max),
    temporary_hp: 0,
    armor_class: Number(row.armor_class),
    abilities: {
      STR: Number(row.strength),
      DEX: Number(row.dexterity),
      CON: Number(row.constitution),
      INT: Number(row.intelligence),
      WIS: Number(row.wisdom),
      CHA: Number(row.charisma),
    },
    proficiency_bonus: Number(row.proficiency_bonus),
    faction: input.faction ?? 'enemy',
    control_mode: input.control_mode ?? 'ai',
    notes: input.notes,
  };
}

async function loadCombatParticipantSource(campaignId, sceneId, input, executor) {
  switch (input.entity_type) {
    case 'character':
      return loadCharacterParticipantSource(campaignId, sceneId, input, executor);
    case 'npc':
      return loadNpcParticipantSource(campaignId, sceneId, input, executor);
    case 'monster':
      return loadMonsterParticipantSource(input, executor);
    default:
      throw createHttpError('Unsupported combat participant entity_type', 400);
  }
}

async function loadRuntimeActorStats(participant, combat, executor) {
  if (participant.entity_type === 'character') {
    const result = await executor.query(selectCharacterCombatSourceQuery, [participant.entity_id]);
    const row = result.rows[0] || null;

    if (!row) {
      throw createHttpError('Character not found', 404);
    }

    return {
      display_name: participant.display_name,
      proficiency_bonus:
        row.proficiency_bonus !== null
          ? Number(row.proficiency_bonus)
          : calculateDerivedProficiencyBonus(Number(row.level)),
      abilities: {
        STR: Number(row.strength),
        DEX: Number(row.dexterity),
        CON: Number(row.constitution),
        INT: Number(row.intelligence),
        WIS: Number(row.wisdom),
        CHA: Number(row.charisma),
      },
    };
  }

  if (participant.entity_type === 'npc') {
    const result = await executor.query(selectNpcCombatSourceQuery, [
      participant.entity_id,
      combat.campaign?.id ?? null,
    ]);
    const row = result.rows[0] || null;

    if (!row) {
      throw createHttpError('NPC not found', 404);
    }

    return {
      display_name: participant.display_name,
      proficiency_bonus: Number(row.proficiency_bonus),
      abilities: {
        STR: Number(row.strength),
        DEX: Number(row.dexterity),
        CON: Number(row.constitution),
        INT: Number(row.intelligence),
        WIS: Number(row.wisdom),
        CHA: Number(row.charisma),
      },
    };
  }

  const result = await executor.query(selectMonsterCombatSourceQuery, [participant.entity_id]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Monster not found', 404);
  }

  return {
    display_name: participant.display_name,
    proficiency_bonus: Number(row.proficiency_bonus),
    abilities: {
      STR: Number(row.strength),
      DEX: Number(row.dexterity),
      CON: Number(row.constitution),
      INT: Number(row.intelligence),
      WIS: Number(row.wisdom),
      CHA: Number(row.charisma),
    },
  };
}

async function getCharacterBasicStrikeAction(executor) {
  const result = await executor.query(selectActionIdByNameQuery, ['Character Basic Strike']);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Character Basic Strike action is missing', 500);
  }

  return getActionById(Number(row.id), executor);
}

async function buildAvailableActionsForParticipant(participant, executor, cached = {}) {
  if (participant.entity_type === 'character') {
    if (!cached.characterBasicStrike) {
      cached.characterBasicStrike = await getCharacterBasicStrikeAction(executor);
    }

    return cached.characterBasicStrike ? [cached.characterBasicStrike] : [];
  }

  if (!participant.stat_block_id) {
    return [];
  }

  if (!cached.statBlockActions) {
    cached.statBlockActions = new Map();
  }

  if (!cached.statBlockActions.has(participant.stat_block_id)) {
    cached.statBlockActions.set(
      participant.stat_block_id,
      await listStatBlockActions(participant.stat_block_id, executor)
    );
  }

  return cached.statBlockActions.get(participant.stat_block_id) ?? [];
}

async function decorateParticipantsWithActions(participants, executor) {
  const cache = {};
  const decorated = [];

  for (const participant of participants) {
    decorated.push({
      ...participant,
      available_actions: await buildAvailableActionsForParticipant(participant, executor, cache),
    });
  }

  return decorated;
}

async function getCombatByIdInternal(combatId, executor = { query }) {
  const combatResult = await executor.query(selectCombatByIdQuery, [combatId]);
  const combat = mapCombatRow(combatResult.rows[0] || null);

  if (!combat) {
    return null;
  }

  const participantsResult = await executor.query(selectCombatParticipantsByCombatQuery, [combatId]);
  const logsResult = await executor.query(selectCombatActionLogsByCombatQuery, [combatId]);
  const conditionsResult = await executor.query(selectCombatConditionsByCombatQuery, [combatId]);

  const participants = await decorateParticipantsWithActions(
    participantsResult.rows.map(mapParticipantRow),
    executor
  );

  return {
    ...combat,
    participants,
    current_participant:
      combat.current_participant_id !== null
        ? participants.find((participant) => participant.id === combat.current_participant_id) ?? null
        : null,
    action_log: logsResult.rows.map(mapCombatActionLogRow),
    conditions: conditionsResult.rows.map(mapCombatConditionRow),
  };
}

async function getCombatForUpdateOrThrow(combatId, executor) {
  const result = await executor.query(selectCombatByIdForUpdateQuery, [combatId]);
  const combat = mapCombatRow(result.rows[0] || null);

  if (!combat) {
    throw createHttpError('Combat not found', 404);
  }

  return combat;
}

async function listCombatParticipantsForUpdate(combatId, executor) {
  const result = await executor.query(selectCombatParticipantsByCombatForUpdateQuery, [combatId]);
  return result.rows.map(mapParticipantRow);
}

function assertCanStartCombat(combat, participants) {
  if (combat.status !== 'pending') {
    throw createHttpError('Combat has already started', 409);
  }

  if (participants.length < 2) {
    throw createHttpError('Combat requires at least two participants', 409);
  }

  if (determineRemainingFactions(participants).length < 2) {
    throw createHttpError('Combat needs at least two active opposing factions to start', 409);
  }
}

function assertCombatActive(combat) {
  if (combat.status !== 'active') {
    throw createHttpError(`Combat is ${combat.status} and cannot accept turn actions`, 409);
  }
}

function findParticipantOrThrow(participants, participantId, label = 'participant') {
  const participant = participants.find((entry) => entry.id === participantId);

  if (!participant) {
    throw createHttpError(`${label} not found in this combat`, 404);
  }

  return participant;
}

function ensureCurrentTurnParticipant(combat, participants, requestedParticipantId = null) {
  if (combat.current_participant_id === null) {
    throw createHttpError('Combat does not currently have an active turn', 409);
  }

  const currentParticipant = findParticipantOrThrow(
    participants,
    combat.current_participant_id,
    'Current combat participant'
  );

  if (requestedParticipantId !== null && currentParticipant.id !== requestedParticipantId) {
    throw createHttpError('It is not that participant’s turn', 409);
  }

  if (!currentParticipant.is_active || currentParticipant.is_defeated) {
    throw createHttpError('The current participant cannot act', 409);
  }

  return currentParticipant;
}

function determineRemainingFactions(participants) {
  return [...new Set(
    participants
      .filter((participant) => participant.is_active && !participant.is_defeated)
      .map((participant) => participant.faction)
  )];
}

function computeNextTurnState(combat, participants) {
  const ordered = [...participants]
    .filter((participant) => participant.is_active && !participant.is_defeated)
    .sort((left, right) => {
      if (left.turn_order !== right.turn_order) {
        return Number(left.turn_order) - Number(right.turn_order);
      }

      return left.id - right.id;
    });

  if (ordered.length === 0) {
    return null;
  }

  const currentIndex = ordered.findIndex(
    (participant) => participant.id === combat.current_participant_id
  );

  if (currentIndex === -1) {
    return {
      round_number: Math.max(Number(combat.round_number), 1),
      current_turn_index: 0,
      current_participant_id: ordered[0].id,
      current_participant: ordered[0],
    };
  }

  const nextIndex = currentIndex + 1;

  if (nextIndex >= ordered.length) {
    return {
      round_number: Number(combat.round_number) + 1,
      current_turn_index: 0,
      current_participant_id: ordered[0].id,
      current_participant: ordered[0],
    };
  }

  return {
    round_number: Number(combat.round_number),
    current_turn_index: nextIndex,
    current_participant_id: ordered[nextIndex].id,
    current_participant: ordered[nextIndex],
  };
}

async function writeCombatState(
  combatId,
  {
    status,
    round_number,
    current_turn_index,
    current_participant_id,
    outcome_faction = null,
    outcome_summary = null,
    result_json = null,
    resolved_at = null,
  },
  executor
) {
  const result = await executor.query(updateCombatStateQuery, [
    combatId,
    status,
    round_number,
    current_turn_index,
    current_participant_id,
    outcome_faction,
    outcome_summary,
    result_json === null ? null : JSON.stringify(result_json),
    resolved_at,
  ]);

  return mapCombatRow(result.rows[0] || null);
}

async function persistCombatParticipantState(participant, executor) {
  await executor.query(updateCombatParticipantStateQuery, [
    participant.id,
    participant.current_hp,
    participant.temporary_hp,
    participant.is_defeated,
    participant.is_active,
  ]);

  const refreshed = await executor.query(selectCombatParticipantByIdForUpdateQuery, [participant.id]);
  return mapParticipantRow(refreshed.rows[0]);
}

async function applyCombatOutcomeToWorld(combat, participants, actorAccountId, executor) {
  const refreshedParticipants = await listCombatParticipantsForUpdate(combat.id, executor);
  const persistedTargets = [];

  for (const participant of refreshedParticipants) {
    if (participant.entity_type === 'character') {
      const updated = await executor.query(updateCharacterHitPointStateQuery, [
        participant.entity_id,
        participant.current_hp,
        participant.temporary_hp,
      ]);

      persistedTargets.push({
        participant_id: participant.id,
        entity_type: participant.entity_type,
        entity_id: participant.entity_id,
        persisted_state: updated.rows[0] ?? null,
      });
      continue;
    }

    if (participant.entity_type === 'npc' && combat.campaign?.id !== null) {
      const updated = await executor.query(upsertCampaignNpcCombatStateQuery, [
        combat.campaign.id,
        participant.entity_id,
        participant.current_hp,
      ]);

      persistedTargets.push({
        participant_id: participant.id,
        entity_type: participant.entity_type,
        entity_id: participant.entity_id,
        persisted_state: updated.rows[0] ?? null,
      });
    }
  }

  const remainingFactions = determineRemainingFactions(refreshedParticipants);
  const winningFaction = remainingFactions.length === 1 ? remainingFactions[0] : null;
  const defeatedParticipants = refreshedParticipants.filter((participant) => participant.is_defeated);
  const defeatedXpTotal = defeatedParticipants.reduce(
    (sum, participant) => {
      const xpValue = Number(participant.stat_block?.xp_value ?? 0);
      return sum + (Number.isFinite(xpValue) ? xpValue : 0);
    },
    0
  );
  const xpGrants = [];

  if (winningFaction !== null && defeatedXpTotal > 0) {
    const recipients = refreshedParticipants.filter(
      (participant) =>
        participant.entity_type === 'character' &&
        participant.faction === winningFaction &&
        participant.is_active
    );

    for (const participant of recipients) {
      const applied = await applyAdventureOutcome(
        {
          campaignId: combat.campaign?.id,
          characterId: participant.entity_id,
          effectPayload: {
            rewards: [
              {
                reward_type: 'xp',
                value: {
                  amount: defeatedXpTotal,
                },
                metadata_json: {
                  reason: `Combat ${combat.id}`,
                },
              },
            ],
          },
          actorAccountId: actorAccountId ?? null,
          sourceType: 'combat',
          sourceEntityId: combat.id,
          sourceKey: `combat:${combat.id}`,
        },
        executor
      );

      xpGrants.push({
        participant_id: participant.id,
        character_id: participant.entity_id,
        amount: defeatedXpTotal,
        progression: applied.progression,
        reward_applications: applied.rewards,
      });
    }
  }

  return {
    winning_faction: winningFaction,
    defeated_participant_ids: defeatedParticipants.map((participant) => participant.id),
    defeated_xp_total: defeatedXpTotal,
    xp_grants: xpGrants,
    persisted_targets: persistedTargets,
    participants: refreshedParticipants.map((participant) => ({
      id: participant.id,
      entity_type: participant.entity_type,
      entity_id: participant.entity_id,
      display_name: participant.display_name,
      faction: participant.faction,
      current_hp: participant.current_hp,
      max_hp: participant.max_hp,
      temporary_hp: participant.temporary_hp,
      is_defeated: participant.is_defeated,
    })),
  };
}

async function resolveCombatIfFinished(combat, participants, actorAccountId, executor) {
  const remainingFactions = determineRemainingFactions(participants);

  if (remainingFactions.length > 1) {
    return {
      did_resolve: false,
      combat: null,
    };
  }

  const outcomeResult = await applyCombatOutcomeToWorld(combat, participants, actorAccountId, executor);
  const winningFaction = outcomeResult.winning_faction;
  const outcomeSummary =
    winningFaction !== null
      ? `${winningFaction} wins combat ${combat.id}.`
      : `Combat ${combat.id} ends with no surviving faction.`;

  await writeCombatState(
    combat.id,
    {
      status: 'resolved',
      round_number: combat.round_number,
      current_turn_index: combat.current_turn_index,
      current_participant_id: null,
      outcome_faction: winningFaction,
      outcome_summary: outcomeSummary,
      result_json: outcomeResult,
      resolved_at: new Date().toISOString(),
    },
    executor
  );

  await recordCampaignCombatLog(
    {
      campaign_id: combat.campaign?.id ?? null,
      character_id: null,
      actor_account_id: actorAccountId ?? null,
      log_type: 'combat_resolved',
      message: outcomeSummary,
      data_json: {
        combat_id: combat.id,
        winning_faction: winningFaction,
        result: outcomeResult,
      },
    },
    executor
  );

  for (const participant of participants.filter((entry) => entry.entity_type === 'character')) {
    const xpGrant =
      outcomeResult.xp_grants.find((entry) => entry.character_id === participant.entity_id)?.amount ?? 0;

    await recordGameplayHistory(
      {
        character_id: participant.entity_id,
        actor_account_id: actorAccountId ?? null,
        source_type: 'combat',
        source_entity_id: combat.id,
        action_key: 'combat_resolved',
        summary: `${participant.display_name} ${participant.faction === winningFaction ? 'survives' : 'falls in'} combat ${combat.id}.`,
        input_json: {
          combat_id: combat.id,
        },
        result_json: {
          combat_id: combat.id,
          winning_faction: winningFaction,
          participant_id: participant.id,
          participant_current_hp: participant.current_hp,
          participant_is_defeated: participant.is_defeated,
          xp_granted: xpGrant,
        },
        xp_delta: xpGrant,
      },
      executor
    );
  }

  return {
    did_resolve: true,
    combat: await getCombatByIdInternal(combat.id, executor),
  };
}

async function advanceCombatTurnInternal(combat, participants, actorAccountId, executor, reason = 'manual_end_turn') {
  const resolution = await resolveCombatIfFinished(combat, participants, actorAccountId, executor);

  if (resolution.did_resolve) {
    return resolution.combat;
  }

  const nextTurn = computeNextTurnState(combat, participants);

  if (!nextTurn) {
    const fallbackResolution = await resolveCombatIfFinished(combat, participants, actorAccountId, executor);
    return fallbackResolution.combat;
  }

  await writeCombatState(
    combat.id,
    {
      status: 'active',
      round_number: nextTurn.round_number,
      current_turn_index: nextTurn.current_turn_index,
      current_participant_id: nextTurn.current_participant_id,
      outcome_faction: combat.outcome_faction,
      outcome_summary: combat.outcome_summary,
      result_json: combat.result_json,
      resolved_at: combat.resolved_at,
    },
    executor
  );

  await recordCampaignCombatLog(
    {
      campaign_id: combat.campaign?.id ?? null,
      character_id: nextTurn.current_participant.entity_type === 'character' ? nextTurn.current_participant.entity_id : null,
      actor_account_id: actorAccountId ?? null,
      log_type: 'combat_turn_advanced',
      message: `Round ${nextTurn.round_number}, ${nextTurn.current_participant.display_name}'s turn.`,
      data_json: {
        combat_id: combat.id,
        reason,
        current_turn_index: nextTurn.current_turn_index,
        current_participant_id: nextTurn.current_participant_id,
        round_number: nextTurn.round_number,
      },
    },
    executor
  );

  return getCombatByIdInternal(combat.id, executor);
}

function assertCombatParticipantListValid(participants) {
  if (!Array.isArray(participants) || participants.length < 2) {
    throw createHttpError('Combat creation requires at least two participants', 400);
  }

  const factions = new Set(participants.map((participant) => participant.faction));

  if (factions.size < 2) {
    throw createHttpError('Combat requires at least two opposing factions', 400);
  }
}

function buildTargetMetadata(targets) {
  return {
    targets: targets.map((target) => ({
      participant_id: target.id,
      entity_type: target.entity_type,
      entity_id: target.entity_id,
      display_name: target.display_name,
      faction: target.faction,
    })),
  };
}

async function executeCombatLifecycleHooks(combat, actorAccountId, hookPoint) {
  if (!combat?.campaign?.id || !combat?.id) {
    return combat;
  }

  const characterIds = Array.from(
    new Set(
      (combat.participants ?? [])
        .filter((participant) => participant.entity_type === 'character')
        .map((participant) => Number(participant.entity_id))
        .filter((characterId) => Number.isInteger(characterId) && characterId > 0)
    )
  );

  if (characterIds.length === 0) {
    return combat;
  }

  for (const characterId of characterIds) {
    await executeContentHooks({
      campaignId: combat.campaign.id,
      characterId,
      hookPoint,
      actorAccountId,
      source: {
        type: 'combat',
        combat_id: combat.id,
        hook_point: hookPoint,
      },
      mode: 'player',
    });
  }

  return getCombatByIdInternal(combat.id);
}

async function getParticipantActionForCombat(participant, actionId, executor) {
  const availableActions = await buildAvailableActionsForParticipant(participant, executor, {});
  const action = availableActions.find((entry) => Number(entry.id) === Number(actionId));

  if (!action) {
    throw createHttpError('That action is not available to this participant', 409);
  }

  return {
    action,
    availableActions,
  };
}

async function performCombatAttackInternal({
  combat,
  participants,
  actor,
  action,
  target,
  actorAccountId,
  attackRoll,
  damageRolls,
  executor,
}) {
  const actorRuntime = await loadRuntimeActorStats(actor, combat, executor);
  const resolution = resolveAttackAction({
    actor: {
      display_name: actor.display_name,
      abilities: actorRuntime.abilities,
      proficiency_bonus: actorRuntime.proficiency_bonus,
    },
    target: {
      display_name: target.display_name,
      armor_class: target.armor_class,
      current_hp: target.current_hp,
      temporary_hp: target.temporary_hp,
      is_defeated: target.is_defeated,
    },
    action,
    attackRollOverride: attackRoll,
    damageRollOverrides: damageRolls,
  });

  let updatedTarget = target;

  if (resolution.attack.was_hit) {
    updatedTarget = await persistCombatParticipantState(
      {
        ...target,
        current_hp: resolution.target_state.current_hp_after,
        temporary_hp: resolution.target_state.temporary_hp_after,
        is_defeated: resolution.target_state.is_defeated,
        is_active: !resolution.target_state.is_defeated,
      },
      executor
    );
  }

  const actionLogResult = await executor.query(insertCombatActionLogQuery, [
    combat.id,
    actor.id,
    action.id,
    'attack',
    combat.round_number,
    combat.current_turn_index,
    JSON.stringify(buildTargetMetadata([updatedTarget])),
    resolution.result_summary,
    resolution.narrative_text,
    JSON.stringify({
      attack: resolution.attack,
      damage: resolution.damage,
      target_state: resolution.target_state,
    }),
  ]);
  const actionLog = mapCombatActionLogRow(actionLogResult.rows[0]);

  await recordCampaignCombatLog(
    {
      campaign_id: combat.campaign?.id ?? null,
      character_id: actor.entity_type === 'character' ? actor.entity_id : null,
      actor_account_id: actorAccountId ?? null,
      log_type: 'combat_action',
      message: resolution.narrative_text,
      data_json: {
        combat_id: combat.id,
        participant_id: actor.id,
        target_participant_id: updatedTarget.id,
        action_id: action.id,
        mechanical_detail: {
          attack: resolution.attack,
          damage: resolution.damage,
          target_state: resolution.target_state,
        },
      },
    },
    executor
  );

  if (actor.entity_type === 'character') {
    await recordGameplayHistory(
      {
        character_id: actor.entity_id,
        actor_account_id: actorAccountId ?? null,
        source_type: 'combat',
        source_entity_id: combat.id,
        action_key: 'combat_attack',
        summary: resolution.narrative_text,
        input_json: {
          combat_id: combat.id,
          action_id: action.id,
          target_participant_id: updatedTarget.id,
          attack_roll: resolution.attack.attack_roll,
        },
        result_json: {
          combat_action_log_id: actionLog.id,
          attack: resolution.attack,
          damage: resolution.damage,
          target_state: resolution.target_state,
        },
        xp_delta: 0,
      },
      executor
    );
  }

  const refreshedParticipants = participants.map((participant) =>
    participant.id === updatedTarget.id ? updatedTarget : participant
  );
  const maybeResolved = await resolveCombatIfFinished(combat, refreshedParticipants, actorAccountId, executor);

  if (maybeResolved.did_resolve) {
    return {
      action_log: actionLog,
      resolution,
      combat: maybeResolved.combat,
    };
  }

  if (combat.auto_advance_turns) {
    const advancedCombat = await advanceCombatTurnInternal(
      combat,
      refreshedParticipants,
      actorAccountId,
      executor,
      'auto_advance_after_action'
    );

    return {
      action_log: actionLog,
      resolution,
      combat: advancedCombat,
    };
  }

  return {
    action_log: actionLog,
    resolution,
    combat: await getCombatByIdInternal(combat.id, executor),
  };
}

export async function getCombatById(combatId) {
  return getCombatByIdInternal(normalizePositiveInteger(combatId, 'combatId'));
}

export async function findActiveCombatForCharacter(campaignId, characterId, executor = { query }) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const result = await executor.query(selectActiveCombatByCampaignAndCharacterQuery, [
    normalizedCampaignId,
    normalizedCharacterId,
  ]);
  const row = result.rows[0] || null;

  if (!row) {
    return null;
  }

  return getCombatByIdInternal(Number(row.id), executor);
}

export async function createCombat(input) {
  const campaignId = normalizePositiveInteger(input.campaign_id, 'campaign_id');
  const sceneId = normalizeOptionalPositiveInteger(input.scene_id, 'scene_id');
  const eventId = normalizeOptionalPositiveInteger(input.event_id, 'event_id');
  const createdByAccountId = normalizeOptionalPositiveInteger(
    input.created_by_account_id,
    'created_by_account_id'
  );
  const visibilityMode = normalizeTrimmedText(input.visibility_mode) ?? 'narrative';
  const autoAdvanceTurns = normalizeOptionalBoolean(input.auto_advance_turns, true);

  if (!allowedVisibilityModes.has(visibilityMode)) {
    throw createHttpError('visibility_mode must be narrative or debug', 400);
  }

  const participantInputs = (input.participants ?? []).map(normalizeParticipantInput);

  try {
    return await withTransaction(async (client) => {
      await getCampaignOrThrow(campaignId, client);
      const scene = sceneId !== null ? await getSceneOrThrow(sceneId, client) : null;
      const event = eventId !== null ? await getEventOrThrow(eventId, client) : null;

      if (event && event.campaign_id !== campaignId) {
        throw createHttpError('event_id must belong to the same campaign as combat.campaign_id', 400);
      }

      const sources = [];

      for (const participantInput of participantInputs) {
        sources.push(
          await loadCombatParticipantSource(campaignId, scene?.id ?? null, participantInput, client)
        );
      }

      assertCombatParticipantListValid(sources);

      if (
        event &&
        !sources.some(
          (source) => source.entity_type === 'character' && source.entity_id === event.character_id
        )
      ) {
        throw createHttpError(
          'A combat linked to an event must include the event’s character as a participant',
          409
        );
      }

      const combatInsert = await client.query(insertCombatQuery, [
        campaignId,
        scene?.id ?? null,
        event?.id ?? null,
        'pending',
        0,
        0,
        null,
        visibilityMode,
        autoAdvanceTurns,
        createdByAccountId,
        null,
        null,
        null,
      ]);
      const combatId = Number(combatInsert.rows[0].id);

      for (const source of sources) {
        await client.query(insertCombatParticipantQuery, [
          combatId,
          source.entity_type,
          source.entity_id,
          source.stat_block_id,
          source.display_name,
          null,
          null,
          source.current_hp,
          source.max_hp,
          source.temporary_hp,
          source.armor_class,
          source.faction,
          source.control_mode,
          true,
          source.current_hp <= 0,
          source.notes,
        ]);
      }

      return getCombatByIdInternal(combatId, client);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw createHttpError('That entity is already a participant in this combat or the linked event already has an open combat', 409);
    }

    throw error;
  }
}

export async function startCombat(combatId, input = {}) {
  const normalizedCombatId = normalizePositiveInteger(combatId, 'combatId');
  const actorAccountId = normalizeOptionalPositiveInteger(input.actor_account_id, 'actor_account_id');
  const initiativeOverrides = normalizeInitiativeOverrides(input.initiative_overrides);
  const skipContentHooks = input.skip_content_hooks === true;

  const startedCombat = await withTransaction(async (client) => {
    const combat = await getCombatForUpdateOrThrow(normalizedCombatId, client);
    const participants = await listCombatParticipantsForUpdate(normalizedCombatId, client);
    assertCanStartCombat(combat, participants);

    const participantsWithAbilities = [];

    for (const participant of participants) {
      const runtime = await loadRuntimeActorStats(participant, combat, client);
      participantsWithAbilities.push({
        ...participant,
        abilities: runtime.abilities,
      });
    }
    const initiativeOrder = buildInitiativeOrder(participantsWithAbilities, initiativeOverrides);

    for (const participant of initiativeOrder) {
      await client.query(updateCombatParticipantInitiativeQuery, [
        participant.id,
        participant.initiative,
        participant.turn_order,
      ]);
    }

    const firstParticipant = initiativeOrder[0];

    await writeCombatState(
      normalizedCombatId,
      {
        status: 'active',
        round_number: 1,
        current_turn_index: 0,
        current_participant_id: firstParticipant.id,
        outcome_faction: null,
        outcome_summary: null,
        result_json: null,
        resolved_at: null,
      },
      client
    );

    await recordCampaignCombatLog(
      {
        campaign_id: combat.campaign?.id ?? null,
        character_id: firstParticipant.entity_type === 'character' ? firstParticipant.entity_id : null,
        actor_account_id: actorAccountId ?? null,
        log_type: 'combat_started',
        message: `Combat ${normalizedCombatId} begins. ${firstParticipant.display_name} acts first.`,
        data_json: {
          combat_id: normalizedCombatId,
          scene_id: combat.scene?.id ?? null,
          initiative: initiativeOrder.map((participant) => ({
            participant_id: participant.id,
            display_name: participant.display_name,
            initiative_roll: participant.initiative_roll,
            initiative: participant.initiative,
            turn_order: participant.turn_order,
          })),
        },
      },
      client
    );

    for (const participant of participants.filter((entry) => entry.entity_type === 'character')) {
      await recordGameplayHistory(
        {
          character_id: participant.entity_id,
          actor_account_id: actorAccountId ?? null,
          source_type: 'combat',
          source_entity_id: normalizedCombatId,
          action_key: 'combat_started',
          summary: `${participant.display_name} enters combat ${normalizedCombatId}.`,
          input_json: {
            combat_id: normalizedCombatId,
          },
          result_json: {
            round_number: 1,
            first_participant_id: firstParticipant.id,
            first_participant_name: firstParticipant.display_name,
          },
          xp_delta: 0,
        },
        client
      );
    }

      return getCombatByIdInternal(normalizedCombatId, client);
  });

  if (skipContentHooks) {
    return startedCombat;
  }

  return executeCombatLifecycleHooks(startedCombat, actorAccountId, 'combat_start');
}

export async function actInCombat(combatId, input) {
  const normalizedCombatId = normalizePositiveInteger(combatId, 'combatId');
  const actorAccountId = normalizeOptionalPositiveInteger(input.actor_account_id, 'actor_account_id');
  const requestedParticipantId = normalizeOptionalPositiveInteger(input.participant_id, 'participant_id');
  const actionId = normalizePositiveInteger(input.action_id, 'action_id');
  const attackRoll = normalizeOptionalD20Roll(input.attack_roll, 'attack_roll');
  const targetIds = normalizeTargetParticipantIds(input);
  const damageRolls = normalizeDamageRolls(input);
  const skipContentHooks = input.skip_content_hooks === true;

  const combatResult = await withTransaction(async (client) => {
    const combat = await getCombatForUpdateOrThrow(normalizedCombatId, client);
    assertCombatActive(combat);
    const participants = await listCombatParticipantsForUpdate(normalizedCombatId, client);
    const actor = ensureCurrentTurnParticipant(combat, participants, requestedParticipantId);

    if (actor.control_mode === 'ai') {
      throw createHttpError('Use the AI turn resolver for AI-controlled participants', 409);
    }

    const { action } = await getParticipantActionForCombat(actor, actionId, client);

    let resolvedTargets = [];

    if (action.range.type === 'self') {
      resolvedTargets = [actor];
    } else {
      if (targetIds.length === 0) {
        throw createHttpError('This combat action requires a target_participant_id', 400);
      }

      if (targetIds.length > 1) {
        throw createHttpError('Multi-target combat actions are not implemented yet', 409);
      }

      resolvedTargets = [findParticipantOrThrow(participants, targetIds[0], 'Target participant')];
    }

    const target = resolvedTargets[0];

    if (!target.is_active || target.is_defeated) {
      throw createHttpError('That target can no longer be affected', 409);
    }

    if (target.id === actor.id && action.range.type !== 'self') {
      throw createHttpError('That action cannot target the acting participant', 409);
    }

    const result = await performCombatAttackInternal({
      combat,
      participants,
      actor,
      action,
      target,
      actorAccountId,
      attackRoll,
      damageRolls,
      executor: client,
    });

    if (result.combat.status !== 'active' || result.combat.current_participant_id !== actor.id) {
      return {
        combat: result.combat,
        action_log: result.action_log,
        resolution: result.resolution,
      };
    }

    const refreshedCombat = await getCombatForUpdateOrThrow(normalizedCombatId, client);
    const refreshedParticipants = await listCombatParticipantsForUpdate(normalizedCombatId, client);
    const advancedCombat = await advanceCombatTurnInternal(
      refreshedCombat,
      refreshedParticipants,
      actorAccountId,
      client,
      'ai_turn_completed'
    );

    return {
      combat: advancedCombat,
      action_log: result.action_log,
      resolution: result.resolution,
    };
  });

  if (!skipContentHooks && combatResult.combat?.status === 'resolved') {
    combatResult.combat = await executeCombatLifecycleHooks(
      combatResult.combat,
      actorAccountId,
      'combat_end'
    );
  }

  return combatResult;
}

export async function endCombatTurn(combatId, input = {}) {
  const normalizedCombatId = normalizePositiveInteger(combatId, 'combatId');
  const actorAccountId = normalizeOptionalPositiveInteger(input.actor_account_id, 'actor_account_id');
  const requestedParticipantId = normalizeOptionalPositiveInteger(input.participant_id, 'participant_id');
  const skipContentHooks = input.skip_content_hooks === true;

  const combat = await withTransaction(async (client) => {
    const combat = await getCombatForUpdateOrThrow(normalizedCombatId, client);
    assertCombatActive(combat);
    const participants = await listCombatParticipantsForUpdate(normalizedCombatId, client);
    ensureCurrentTurnParticipant(combat, participants, requestedParticipantId);

    return advanceCombatTurnInternal(combat, participants, actorAccountId, client, 'explicit_end_turn');
  });

  if (!skipContentHooks && combat?.status === 'resolved') {
    return executeCombatLifecycleHooks(combat, actorAccountId, 'combat_end');
  }

  return combat;
}

export async function resolveCombatAiTurn(combatId, input = {}) {
  const normalizedCombatId = normalizePositiveInteger(combatId, 'combatId');
  const actorAccountId = normalizeOptionalPositiveInteger(input.actor_account_id, 'actor_account_id');
  const attackRoll = normalizeOptionalD20Roll(input.attack_roll, 'attack_roll');
  const damageRolls = normalizeDamageRolls(input);
  const skipContentHooks = input.skip_content_hooks === true;

  const combatResult = await withTransaction(async (client) => {
    const combat = await getCombatForUpdateOrThrow(normalizedCombatId, client);
    assertCombatActive(combat);
    const participants = await listCombatParticipantsForUpdate(normalizedCombatId, client);
    const actor = ensureCurrentTurnParticipant(combat, participants, null);

    if (actor.control_mode !== 'ai') {
      throw createHttpError('The current participant is not AI-controlled', 409);
    }

    const availableActions = await buildAvailableActionsForParticipant(actor, client, {});
    const choice = selectAiAction({
      actor,
      participants,
      availableActions,
    });

    if (!choice.action || !choice.target) {
      const actionLogResult = await client.query(insertCombatActionLogQuery, [
        combat.id,
        actor.id,
        null,
        'ai_skip',
        combat.round_number,
        combat.current_turn_index,
        JSON.stringify({ reason: choice.reason }),
        'No valid AI action',
        `${actor.display_name} hesitates and does nothing.`,
        JSON.stringify({ reason: choice.reason }),
      ]);
      const actionLog = mapCombatActionLogRow(actionLogResult.rows[0]);
      const advancedCombat = await advanceCombatTurnInternal(
        combat,
        participants,
        actorAccountId,
        client,
        'ai_skip'
      );

      return {
        combat: advancedCombat,
        action_log: actionLog,
        resolution: {
          narrative_text: `${actor.display_name} hesitates and does nothing.`,
          result_summary: 'AI skipped its turn',
          reason: choice.reason,
        },
      };
    }

    const result = await performCombatAttackInternal({
      combat,
      participants,
      actor,
      action: choice.action,
      target: choice.target,
      actorAccountId,
      attackRoll,
      damageRolls,
      executor: client,
    });

    if (result.combat.status !== 'active' || result.combat.current_participant_id !== actor.id) {
      return {
        combat: result.combat,
        action_log: result.action_log,
        resolution: result.resolution,
      };
    }

    const refreshedCombat = await getCombatForUpdateOrThrow(normalizedCombatId, client);
    const refreshedParticipants = await listCombatParticipantsForUpdate(normalizedCombatId, client);
    const advancedCombat = await advanceCombatTurnInternal(
      refreshedCombat,
      refreshedParticipants,
      actorAccountId,
      client,
      'ai_turn_completed'
    );

    return {
      combat: advancedCombat,
      action_log: result.action_log,
      resolution: result.resolution,
    };
  });

  if (!skipContentHooks && combatResult.combat?.status === 'resolved') {
    combatResult.combat = await executeCombatLifecycleHooks(
      combatResult.combat,
      actorAccountId,
      'combat_end'
    );
  }

  return combatResult;
}

export const __combatServiceTestables = Object.freeze({
  computeNextTurnState,
  determineRemainingFactions,
});
