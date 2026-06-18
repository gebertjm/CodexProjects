import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { ensureActionComposerSchema } from './actionComposerSchema.js';
import { listKnowledgeForCharacter } from './characterKnowledgeService.js';

let playerBeatResultSchemaReady = false;

export async function ensurePlayerBeatResultSchema() {
  if (playerBeatResultSchemaReady) {
    return;
  }

  await ensureActionComposerSchema();

  const currentFile = fileURLToPath(import.meta.url);
  const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../../db/init/031-stage-6b6-player-beat-results.sql'
  );
  const sql = await fs.readFile(migrationPath, 'utf8');
  await query(sql);
  playerBeatResultSchemaReady = true;
}

export function resetPlayerBeatResultSchemaForTests() {
  playerBeatResultSchemaReady = false;
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonEmptyText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function firstText(...values) {
  for (const value of values) {
    const text = nonEmptyText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function titleCase(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summarizeSubmittedAction(submission) {
  const rawText = firstText(submission?.raw_text, submission?.response_payload_json?.raw_text);
  if (rawText) {
    return rawText;
  }
  return 'No action was submitted before the beat advanced.';
}

function summarizeInterpretedAction(submission, resolved) {
  const verb = firstText(submission?.resolved_verb, resolved?.action?.action_type);
  const target = firstText(submission?.target_label, submission?.response_payload_json?.target_label);
  if (verb && target) {
    return `${titleCase(verb)} -> ${target}`;
  }
  if (verb) {
    return titleCase(verb);
  }
  return null;
}

function resultRoot(resolved) {
  return resolved?.result ?? {};
}

function nestedResult(resolved) {
  const root = resultRoot(resolved);
  return root?.result && typeof root.result === 'object' ? root.result : {};
}

function extractNarration(resolved) {
  const root = resultRoot(resolved);
  const nested = nestedResult(resolved);
  return firstText(
    root.narrative_text,
    root.result_summary,
    root.summary,
    root.outcome_summary,
    nested.result_summary,
    nested.summary,
    nested.narrative_text,
    resolved?.play_state?.recent_result?.summary,
    resolved?.play_state?.recent_result?.text
  );
}

function inferSceneType(window, resolved) {
  const actionType = String(resolved?.action?.action_type ?? '').toLowerCase();
  const windowType = String(window?.window_type ?? '').toLowerCase();

  if (window?.combat_id || actionType.includes('combat') || windowType.includes('combat')) {
    return 'combat';
  }
  if (
    window?.dialogue_session_id ||
    actionType.includes('dialogue') ||
    actionType === 'talk_to_npc' ||
    windowType.includes('dialogue')
  ) {
    return 'dialogue';
  }
  return 'exploration';
}

function resultKind(sceneType) {
  return `${sceneType === 'unknown' ? 'exploration' : sceneType}_result`;
}

function titleForResult(sceneType, submission, summary) {
  if (sceneType === 'combat') {
    return 'Latest action';
  }
  if (sceneType === 'dialogue') {
    const target = firstText(submission?.target_label, submission?.response_payload_json?.target_label);
    return target ? `Exchange with ${target}` : 'Latest exchange';
  }

  if (/wait/i.test(summary ?? '')) {
    return 'The moment settles';
  }
  return 'Latest development';
}

function visibleChangesFromResolved(resolved) {
  const root = resultRoot(resolved);
  const applied = root.applied_effects ?? root.applied_effects_json ?? nestedResult(resolved).applied_effects_json ?? {};
  const changes = [];

  for (const knowledge of asArray(applied.knowledge)) {
    const text = firstText(knowledge.summary, knowledge.text, knowledge.title);
    if (text) {
      changes.push({ type: 'knowledge_gained', text });
    }
  }

  for (const change of asArray(applied.world_changes)) {
    const text = firstText(change.summary, change.text, change.label, change.change_type);
    if (text) {
      changes.push({ type: 'world_change', text });
    }
  }

  for (const unlock of asArray(applied.scene_unlocks)) {
    const text = firstText(unlock.summary, unlock.label, unlock.scene_name);
    if (text) {
      changes.push({ type: 'scene_unlock', text });
    }
  }

  return changes;
}

function knowledgeFromResolved(resolved) {
  const root = resultRoot(resolved);
  const applied = root.applied_effects ?? root.applied_effects_json ?? nestedResult(resolved).applied_effects_json ?? {};
  return asArray(applied.knowledge)
    .map((knowledge) => {
      const text = firstText(knowledge.summary, knowledge.text, knowledge.title);
      if (!text) {
        return null;
      }
      return {
        knowledge_id: firstText(knowledge.knowledge_key, knowledge.knowledge_id),
        title: firstText(knowledge.title, knowledge.public_label, knowledge.knowledge_key),
        text,
        status: firstText(knowledge.status) ?? 'known',
        confidence: firstText(knowledge.confidence) ?? null,
      };
    })
    .filter(Boolean);
}

function objectiveUpdatesFromResolved(resolved) {
  const root = resultRoot(resolved);
  const applied = root.applied_effects ?? root.applied_effects_json ?? nestedResult(resolved).applied_effects_json ?? {};
  const updates = [];

  for (const objective of asArray(applied.objectives)) {
    const progressText = firstText(objective.progress_text, objective.summary, objective.title);
    if (progressText) {
      updates.push({
        objective_id: objective.objective_id ? String(objective.objective_id) : null,
        title: firstText(objective.title, objective.objective_key),
        status: firstText(objective.status),
        progress_text: progressText,
      });
    }
  }

  for (const quest of asArray(applied.quests)) {
    const progressText = firstText(quest.progress_text, quest.summary, quest.name, quest.title);
    if (progressText) {
      updates.push({
        objective_id: quest.objective_id ? String(quest.objective_id) : null,
        title: firstText(quest.name, quest.title, quest.quest_key),
        status: firstText(quest.status),
        progress_text: progressText,
      });
    }
  }

  return updates;
}

function safeMechanicsFromResolved(resolved) {
  const root = resultRoot(resolved);
  const nested = nestedResult(resolved);
  const check = root.check ?? nested.check ?? null;
  const entries = [...asArray(root.safe_mechanics), ...asArray(nested.safe_mechanics)];

  if (check) {
    entries.push({
      label: 'Check',
      text: check.was_success === true ? 'The visible check succeeded.' : 'The visible check did not succeed.',
      outcome: check.was_success === true ? 'success' : 'failure',
    });
  }

  const combat = root.combat ?? nested.combat ?? null;
  if (combat?.status) {
    entries.push({
      label: 'Combat',
      text: `Combat is ${titleCase(combat.status)}.`,
    });
  }

  return entries;
}

export function buildPlayerBeatResultDraft({
  campaignId,
  worldInstanceId = null,
  characterId,
  window,
  submission = null,
  resolved = null,
  sceneContext = {},
  provenanceEvents = [],
}) {
  const summary = extractNarration(resolved) ?? 'The scene shifts in response to the beat.';
  const sceneType = inferSceneType(window, resolved);
  const knowledgeGained = knowledgeFromResolved(resolved);
  const objectiveUpdates = objectiveUpdatesFromResolved(resolved);
  const safeMechanics = safeMechanicsFromResolved(resolved);
  const visibleChanges = [
    ...visibleChangesFromResolved(resolved),
    ...knowledgeGained.map((entry) => ({ type: 'knowledge_gained', text: entry.text })),
    ...objectiveUpdates.map((entry) => ({ type: 'objective_update', text: entry.progress_text })),
  ];

  return {
    campaign_id: numericId(campaignId),
    world_instance_id: numericId(worldInstanceId),
    character_id: numericId(characterId),
    action_window_id: numericId(window?.id),
    submitted_action_id: numericId(submission?.id),
    scene_id: numericId(window?.scene_id) ?? numericId(sceneContext.scene_id),
    location_id: numericId(sceneContext.location_id),
    scene_type: sceneType,
    beat_number: numericId(window?.beat_number),
    result_kind: resultKind(sceneType),
    title: titleForResult(sceneType, submission, summary),
    summary,
    narration: summary,
    submitted_action_summary: summarizeSubmittedAction(submission),
    interpreted_action_summary: summarizeInterpretedAction(submission, resolved),
    visible_changes: visibleChanges,
    knowledge_gained: knowledgeGained,
    objective_updates: objectiveUpdates,
    safe_mechanics: safeMechanics,
    provenance: {
      event_ids: provenanceEvents
        .map((event) => event?.id ?? event?.event_id)
        .filter((eventId) => eventId !== null && eventId !== undefined)
        .map(String),
      action_window_id: window?.id ? String(window.id) : null,
      submitted_action_id: submission?.id ? String(submission.id) : null,
      action_type: resolved?.action?.action_type ?? null,
      action_key: resolved?.action?.action_key ?? null,
      dialogue_scene_id:
        resolved?.result?.dialogue?.dialogue_scene_id ??
        resolved?.action?.dialogue_scene_id ??
        submission?.response_payload_json?.dialogue_scene_id ??
        null,
      dialogue_title:
        resolved?.result?.dialogue?.dialogue_title ??
        resolved?.action?.dialogue_title ??
        submission?.response_payload_json?.dialogue_title ??
        null,
      source: 'beat_resolution',
    },
  };
}

function mapBeatResultRow(row) {
  if (!row) {
    return null;
  }

  return {
    beat_result_id: String(row.id),
    beat_number: row.beat_number !== null && row.beat_number !== undefined ? Number(row.beat_number) : null,
    campaign_instance_id: String(row.campaign_id),
    campaign_id: String(row.campaign_id),
    world_instance_id: row.world_instance_id ? String(row.world_instance_id) : null,
    character_id: String(row.character_id),
    action_window_id: String(row.action_window_id),
    submitted_action_id: row.submitted_action_id ? String(row.submitted_action_id) : null,
    scene_id: row.scene_id ? String(row.scene_id) : null,
    location_id: row.location_id ? String(row.location_id) : null,
    scene_type: row.scene_type ?? 'exploration',
    kind: row.result_kind ?? 'exploration_result',
    title: row.title,
    summary: row.summary,
    narration: row.narration,
    submitted_action_summary: row.submitted_action_summary,
    interpreted_action_summary: row.interpreted_action_summary,
    visible_changes: row.visible_changes_json ?? [],
    knowledge_gained: row.knowledge_gained_json ?? [],
    objective_updates: row.objective_updates_json ?? [],
    mechanical_details: {
      visible_by_default: false,
      entries: row.safe_mechanics_json ?? [],
    },
    safe_mechanics: row.safe_mechanics_json ?? [],
    provenance: row.provenance_json ?? {},
    resolved_at: row.resolved_at,
    created_at: row.created_at,
  };
}

async function loadSceneContext({ campaignId, characterId, sceneId }, executor) {
  const result = await executor.query(
    `
      SELECT
        campaign.world_instance_id,
        COALESCE($3::bigint, membership.current_scene_id) AS scene_id,
        scene.location_id,
        scene.name AS scene_title,
        location.name AS location_name
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      LEFT JOIN dnd5e_scene scene ON scene.id = COALESCE($3::bigint, membership.current_scene_id)
      LEFT JOIN dnd5e_location location ON location.id = scene.location_id
      WHERE membership.campaign_id = $1
        AND membership.character_id = $2
      LIMIT 1
    `,
    [campaignId, characterId, sceneId ?? null]
  );
  return result.rows[0] ?? {};
}

export async function recordPlayerBeatResult(
  {
    campaignId,
    characterId,
    window,
    submission = null,
    resolved = null,
    provenanceEvents = [],
  },
  executor = { query }
) {
  await ensurePlayerBeatResultSchema();

  const normalizedCampaignId = numericId(campaignId);
  const normalizedCharacterId = numericId(characterId);
  const normalizedWindowId = numericId(window?.id);
  if (!normalizedCampaignId || !normalizedCharacterId || !normalizedWindowId) {
    throw createHttpError('campaignId, characterId, and action window are required for beat results', 400);
  }

  const sceneContext = await loadSceneContext({
    campaignId: normalizedCampaignId,
    characterId: normalizedCharacterId,
    sceneId: numericId(window?.scene_id),
  }, executor);
  const draft = buildPlayerBeatResultDraft({
    campaignId: normalizedCampaignId,
    worldInstanceId: sceneContext.world_instance_id,
    characterId: normalizedCharacterId,
    window,
    submission,
    resolved,
    sceneContext,
    provenanceEvents,
  });

  const result = await executor.query(
    `
      INSERT INTO dnd5e_player_beat_result (
        campaign_id,
        world_instance_id,
        character_id,
        action_window_id,
        submitted_action_id,
        scene_id,
        location_id,
        scene_type,
        beat_number,
        result_kind,
        title,
        summary,
        narration,
        submitted_action_summary,
        interpreted_action_summary,
        visible_changes_json,
        knowledge_gained_json,
        objective_updates_json,
        safe_mechanics_json,
        provenance_json,
        resolved_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb,
        NOW()
      )
      ON CONFLICT (action_window_id, character_id)
      DO UPDATE SET
        world_instance_id = EXCLUDED.world_instance_id,
        submitted_action_id = EXCLUDED.submitted_action_id,
        scene_id = EXCLUDED.scene_id,
        location_id = EXCLUDED.location_id,
        scene_type = EXCLUDED.scene_type,
        beat_number = EXCLUDED.beat_number,
        result_kind = EXCLUDED.result_kind,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        narration = EXCLUDED.narration,
        submitted_action_summary = EXCLUDED.submitted_action_summary,
        interpreted_action_summary = EXCLUDED.interpreted_action_summary,
        visible_changes_json = EXCLUDED.visible_changes_json,
        knowledge_gained_json = EXCLUDED.knowledge_gained_json,
        objective_updates_json = EXCLUDED.objective_updates_json,
        safe_mechanics_json = EXCLUDED.safe_mechanics_json,
        provenance_json = dnd5e_player_beat_result.provenance_json || EXCLUDED.provenance_json,
        resolved_at = COALESCE(dnd5e_player_beat_result.resolved_at, EXCLUDED.resolved_at),
        updated_at = NOW()
      RETURNING *
    `,
    [
      draft.campaign_id,
      draft.world_instance_id,
      draft.character_id,
      draft.action_window_id,
      draft.submitted_action_id,
      draft.scene_id,
      draft.location_id,
      draft.scene_type,
      draft.beat_number,
      draft.result_kind,
      draft.title,
      draft.summary,
      draft.narration,
      draft.submitted_action_summary,
      draft.interpreted_action_summary,
      json(draft.visible_changes, []),
      json(draft.knowledge_gained, []),
      json(draft.objective_updates, []),
      json(draft.safe_mechanics, []),
      json(draft.provenance, {}),
    ]
  );

  return mapBeatResultRow(result.rows[0]);
}

export async function listSceneResultFeed(
  { campaignId, characterId, sceneId, limit = 5 },
  executor = { query }
) {
  await ensurePlayerBeatResultSchema();
  const normalizedSceneId = numericId(sceneId);
  if (!normalizedSceneId) {
    return {
      scene_id: null,
      scene_type: 'exploration',
      latest_result: null,
      recent_entries: [],
      max_entries: limit,
    };
  }

  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_player_beat_result
      WHERE campaign_id = $1
        AND character_id = $2
        AND scene_id = $3
      ORDER BY resolved_at DESC, id DESC
      LIMIT $4
    `,
    [campaignId, characterId, normalizedSceneId, limit]
  );
  const entries = result.rows.map(mapBeatResultRow).map((entry, index) => ({
    ...entry,
    is_latest: index === 0,
    highlight: index === 0,
  }));

  return {
    scene_id: String(normalizedSceneId),
    scene_type: entries[0]?.scene_type ?? 'exploration',
    result_display_mode:
      entries[0]?.scene_type === 'combat'
        ? 'combat_summary'
        : entries[0]?.scene_type === 'dialogue'
          ? 'dialogue_continuity'
          : 'exploration_continuity',
    latest_result: entries[0] ?? null,
    recent_entries: entries,
    max_entries: limit,
  };
}

async function resolveActiveAdventureForAccount(accountId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        character.id AS character_id,
        character.name AS character_name,
        character.level,
        race.name AS race_name,
        class.name AS class_name,
        membership.campaign_id,
        campaign.name AS campaign_name,
        campaign.world_instance_id,
        world.slug AS world_id,
        world.name AS world_name,
        active_objective.objective_id,
        active_objective.objective_key,
        active_objective.objective_title,
        active_objective.objective_status
      FROM account
      JOIN dnd5e_character character ON character.id = account.active_character_id
      JOIN dnd5e_campaign_character membership ON membership.character_id = character.id
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      JOIN dnd5e_world world ON world.id = campaign.world_id
      LEFT JOIN dnd5e_race race ON race.id = character.race_id
      LEFT JOIN dnd5e_class class ON class.id = character.class_id
      LEFT JOIN LATERAL (
        SELECT
          objective.id AS objective_id,
          objective.key AS objective_key,
          objective.title AS objective_title,
          objective_state.status AS objective_status
        FROM dnd5e_character_objective objective_state
        JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
        JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
        WHERE quest_state.campaign_id = membership.campaign_id
          AND quest_state.character_id = membership.character_id
          AND objective_state.status = 'active'
        ORDER BY objective.sort_order ASC, objective.id ASC
        LIMIT 1
      ) active_objective ON TRUE
      WHERE account.id = $1
        AND character.account_id = account.id
        AND character.is_active = TRUE
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
      ORDER BY membership.is_active_context DESC, membership.is_default_solo_campaign DESC, membership.joined_at DESC NULLS LAST, membership.id DESC
      LIMIT 1
    `,
    [accountId]
  );
  return result.rows[0] ?? null;
}

function mapCurrentObjective(adventure) {
  if (!adventure?.objective_id) {
    return null;
  }

  return {
    objective_id: String(adventure.objective_id),
    key: adventure.objective_key ?? null,
    title: adventure.objective_title ?? null,
    status: adventure.objective_status ?? null,
  };
}

function mapTimelineEntry(row) {
  const mapped = mapBeatResultRow(row);
  return {
    id: mapped.beat_result_id,
    type: 'beat_result',
    beat_number: mapped.beat_number,
    title: mapped.title,
    summary: mapped.summary,
    narration: mapped.narration,
    scene_id: mapped.scene_id,
    scene_title: row.scene_title ?? null,
    location_id: mapped.location_id,
    location_name: row.location_name ?? null,
    submitted_action_summary: mapped.submitted_action_summary,
    interpreted_action_summary: mapped.interpreted_action_summary,
    objective_updates: mapped.objective_updates,
    major_discoveries: mapped.knowledge_gained,
    visible_changes: mapped.visible_changes,
    mechanical_details: mapped.mechanical_details,
    resolved_at: mapped.resolved_at,
  };
}

function mapNarrativeHistoryEntry(row) {
  const actionKey = String(row.action_key ?? '');
  const type = actionKey.startsWith('free_focus:')
    ? 'closer_look'
    : actionKey.startsWith('passive_discovery:')
      ? 'passive_discovery'
      : actionKey.startsWith('automatic_observation:')
        ? 'automatic_observation'
        : 'major_event';
  const title = type === 'closer_look'
    ? 'Closer Look'
    : type === 'passive_discovery'
      ? 'Passive Discovery'
      : type === 'automatic_observation'
        ? 'Observation'
        : 'Known Event';
  return {
    id: `history_${row.id}`,
    type,
    title,
    summary: row.summary,
    narration: row.result_json?.narration ?? row.summary,
    submitted_action_summary: null,
    interpreted_action_summary: null,
    objective_updates: [],
    major_discoveries: row.result_json?.knowledge_grants ?? [],
    visible_changes: [],
    mechanical_details: { visible_by_default: false, entries: [] },
    resolved_at: row.created_at,
    occurred_at: row.created_at,
    action_key: row.action_key,
  };
}

function participantLabel(participant = {}) {
  return firstText(
    participant.known_label,
    participant.label,
    participant.unknown_label,
    participant.participant_id,
    participant.npc_key
  );
}

function mapCompletedDialogueHistoryEntry(row) {
  const participants = asArray(row.participants_json)
    .map(participantLabel)
    .filter(Boolean);
  const title = participants.length > 0
    ? `Conversation with ${participants.join(', ')}`
    : 'Completed conversation';

  return {
    id: `dialogue_${row.id}`,
    type: 'dialogue_completed',
    title,
    summary: row.compact_summary,
    narration: row.compact_summary,
    scene_id: row.scene_id ? String(row.scene_id) : null,
    scene_title: row.scene_title ?? null,
    location_id: null,
    location_name: null,
    submitted_action_summary: null,
    interpreted_action_summary: null,
    objective_updates: [],
    major_discoveries: asArray(row.knowledge_links_json),
    visible_changes: [],
    mechanical_details: { visible_by_default: false, entries: [] },
    completed_dialogue_record_id: String(row.id),
    transcript_id: row.transcript_id ? String(row.transcript_id) : null,
    dialogue_scene_id: row.dialogue_scene_key,
    completed_at: row.completed_at,
    resolved_at: row.completed_at,
    occurred_at: row.completed_at,
  };
}

export async function getCampaignHistoryForAccount(accountId, { limit = 50 } = {}) {
  await ensurePlayerBeatResultSchema();
  const adventure = await resolveActiveAdventureForAccount(accountId);
  if (!adventure) {
    return {
      state: 'no_active_campaign',
      campaign: null,
      active_character: null,
      timeline: [],
    };
  }

  const result = await query(
    `
      SELECT
        beat_result.*,
        scene.name AS scene_title,
        location.name AS location_name
      FROM dnd5e_player_beat_result beat_result
      LEFT JOIN dnd5e_scene scene ON scene.id = beat_result.scene_id
      LEFT JOIN dnd5e_location location ON location.id = beat_result.location_id
      WHERE beat_result.campaign_id = $1
        AND beat_result.character_id = $2
      ORDER BY beat_result.resolved_at DESC, beat_result.id DESC
      LIMIT $3
    `,
    [adventure.campaign_id, adventure.character_id, limit]
  );

  const historyResult = await query(
    `
      SELECT *
      FROM dnd5e_gameplay_history
      WHERE character_id = $1
        AND source_type = 'narrative'
        AND (
          action_key LIKE 'free_focus:%'
          OR action_key LIKE 'passive_discovery:%'
          OR action_key LIKE 'automatic_observation:%'
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [adventure.character_id, limit]
  );
  const dialogueResult = await query(
    `
      SELECT
        record.*,
        scene.name AS scene_title
      FROM dnd5e_completed_dialogue_record record
      LEFT JOIN dnd5e_scene scene ON scene.id = record.scene_id
      WHERE record.campaign_id = $1
        AND record.character_id = $2
        AND record.visibility_scope = 'player'
      ORDER BY record.completed_at DESC, record.id DESC
      LIMIT $3
    `,
    [adventure.campaign_id, adventure.character_id, limit]
  );
  const timeline = [
    ...result.rows.map(mapTimelineEntry),
    ...historyResult.rows.map(mapNarrativeHistoryEntry),
    ...dialogueResult.rows.map(mapCompletedDialogueHistoryEntry),
  ]
    .sort((left, right) => {
      const leftTime = new Date(left.resolved_at ?? left.occurred_at ?? 0).getTime();
      const rightTime = new Date(right.resolved_at ?? right.occurred_at ?? 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, limit);

  return {
    state: 'active',
    campaign: {
      campaign_instance_id: String(adventure.campaign_id),
      campaign_id: String(adventure.campaign_id),
      campaign_name: adventure.campaign_name,
      world_instance_id: adventure.world_instance_id ? String(adventure.world_instance_id) : null,
      world_id: adventure.world_id,
      world_name: adventure.world_name,
    },
    active_character: {
      character_id: String(adventure.character_id),
      name: adventure.character_name,
      level: Number(adventure.level ?? 1),
      species: adventure.race_name ?? null,
      class: adventure.class_name ?? null,
    },
    timeline,
  };
}

function mapKnowledgeJournalEntry(knowledge, beatResultBySourceEvent = new Map()) {
  const sourceBeat = knowledge.source_event_id
    ? beatResultBySourceEvent.get(String(knowledge.source_event_id))
    : null;
  return {
    knowledge_id: knowledge.knowledge_id,
    knowledge_key: knowledge.knowledge_key,
    type: knowledge.type,
    title: knowledge.title ?? knowledge.public_label ?? knowledge.knowledge_id,
    text: knowledge.text ?? knowledge.summary ?? knowledge.public_label ?? '',
    status: knowledge.status,
    confidence: knowledge.confidence,
    discovered_at: knowledge.known_at,
    tags: knowledge.tags ?? [],
    source: sourceBeat
      ? {
          beat_result_id: sourceBeat.beat_result_id,
          label: sourceBeat.title,
        }
      : knowledge.source_event_id
        ? {
            event_id: knowledge.source_event_id,
            label: 'Learned during play',
          }
        : null,
    related: {
      objective_id: knowledge.metadata?.objective_id ?? null,
      npc_id: knowledge.metadata?.npc_id ?? knowledge.metadata?.entity_id ?? null,
      location_id: knowledge.metadata?.location_id ?? null,
    },
  };
}

function buildBeatResultByEventId(rows) {
  const map = new Map();
  for (const row of rows) {
    const mapped = mapBeatResultRow(row);
    for (const eventId of asArray(row.provenance_json?.event_ids)) {
      map.set(String(eventId), mapped);
    }
  }
  return map;
}

function sectionKnowledge(entries, beatResultBySourceEvent = new Map()) {
  const sections = {
    clues: [],
    facts: [],
    rumors: [],
    people: [],
    locations: [],
    objective_discoveries: [],
  };

  for (const entry of entries) {
    const type = String(entry.type ?? '').toLowerCase();
    const confidence = String(entry.confidence ?? '').toLowerCase();
    const tags = new Set((entry.tags ?? []).map((tag) => String(tag).toLowerCase()));
    const metadata = entry.metadata ?? {};
    const mapped = mapKnowledgeJournalEntry(entry, beatResultBySourceEvent);

    if (type === 'rumor' || confidence.includes('rumor') || confidence.includes('uncertain')) {
      sections.rumors.push(mapped);
    } else if (type === 'clue') {
      sections.clues.push(mapped);
    } else if (type === 'entity_knowledge' || metadata.entity_type === 'npc' || metadata.npc_id) {
      sections.people.push(mapped);
    } else if (type === 'location_knowledge' || metadata.location_id) {
      sections.locations.push(mapped);
    } else {
      sections.facts.push(mapped);
    }

    if (metadata.objective_id || tags.has('objective')) {
      sections.objective_discoveries.push(mapped);
    }
  }

  return sections;
}

export async function getCampaignKnowledgeForAccount(accountId) {
  await ensurePlayerBeatResultSchema();
  const adventure = await resolveActiveAdventureForAccount(accountId);
  if (!adventure) {
    return {
      state: 'no_active_campaign',
      campaign: null,
      active_character: null,
      current_objective: null,
      sections: sectionKnowledge([]),
    };
  }

  const knowledge = adventure.world_instance_id
    ? await listKnowledgeForCharacter({
        characterId: adventure.character_id,
        worldInstanceId: adventure.world_instance_id,
        campaignId: adventure.campaign_id,
      })
    : [];
  const beatResult = await query(
    `
      SELECT *
      FROM dnd5e_player_beat_result
      WHERE campaign_id = $1
        AND character_id = $2
        AND jsonb_typeof(provenance_json->'event_ids') = 'array'
      ORDER BY resolved_at DESC, id DESC
      LIMIT 100
    `,
    [adventure.campaign_id, adventure.character_id]
  );
  const sections = sectionKnowledge(knowledge, buildBeatResultByEventId(beatResult.rows));

  return {
    state: 'active',
    campaign: {
      campaign_instance_id: String(adventure.campaign_id),
      campaign_id: String(adventure.campaign_id),
      campaign_name: adventure.campaign_name,
      world_instance_id: adventure.world_instance_id ? String(adventure.world_instance_id) : null,
      world_id: adventure.world_id,
      world_name: adventure.world_name,
    },
    active_character: {
      character_id: String(adventure.character_id),
      name: adventure.character_name,
      level: Number(adventure.level ?? 1),
      species: adventure.race_name ?? null,
      class: adventure.class_name ?? null,
    },
    current_objective: mapCurrentObjective(adventure),
    known_count: knowledge.length,
    sections,
  };
}
