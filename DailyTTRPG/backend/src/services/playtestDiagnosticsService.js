import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { getPlayState } from './adventureRuntimeService.js';
import { ensureActionComposerSchema } from './actionComposerSchema.js';
import { isActionWindowOpenForPlayer } from './beatWindowTimingService.js';
import {
  ensurePlayerBeatResultSchema,
  listSceneResultFeed,
} from './playerBeatResultService.js';

const allowedRepairActions = new Set([
  'rebuild_scene_result_feed',
  'rebuild_knowledge_journal',
  'refresh_current_scene_read_model',
  'create_missing_next_action_window',
]);

const rejectedRepairActions = new Set([
  'force_scene_transition',
  'reset_campaign',
  'delete_duplicate_windows',
  'rewrite_objective_state',
  'rerun_latest_beat_resolution',
  'edit_event_history',
]);

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isoOrNull(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rowId(value) {
  return value === undefined || value === null ? null : String(value);
}

function addUniqueRepairAction(actions, repairAction, label, risk = 'low') {
  if (actions.some((action) => action.repair_action === repairAction)) {
    return;
  }
  actions.push({
    repair_action: repairAction,
    label,
    risk,
  });
}

function issue(code, message, repairAction = null) {
  return {
    code,
    message,
    repair_action: repairAction,
  };
}

function latestWindow(windows = []) {
  return windows[0] ?? null;
}

function currentWindow(windows = [], now = new Date()) {
  return (
    windows.find((window) => isActionWindowOpenForPlayer(window, now)) ??
    windows.find((window) => ['open', 'closing', 'resolving'].includes(String(window.status ?? '').toLowerCase())) ??
    latestWindow(windows)
  );
}

function openWindowCount(windows = [], now = new Date()) {
  return windows.filter((window) => isActionWindowOpenForPlayer(window, now)).length;
}

function activeWindowCount(windows = []) {
  return windows.filter((window) =>
    ['open', 'closing', 'resolving'].includes(String(window.status ?? '').toLowerCase())
  ).length;
}

function hasFutureLockedWindow(window, now = new Date()) {
  if (!window || String(window.status ?? '').toLowerCase() !== 'open' || !window.opens_at) {
    return false;
  }

  const opensAt = new Date(window.opens_at);
  return !Number.isNaN(opensAt.getTime()) && opensAt.getTime() > now.getTime() + 60_000;
}

function isWindowExpiredOpen(window, now = new Date()) {
  if (!window || String(window.status ?? '').toLowerCase() !== 'open') {
    return false;
  }

  const closesAt = window.closes_at ?? window.expires_at ?? null;
  if (!closesAt) {
    return false;
  }

  const closeDate = new Date(closesAt);
  return !Number.isNaN(closeDate.getTime()) && closeDate.getTime() <= now.getTime();
}

function latestResultInFeed(latestResult, sceneFeed) {
  if (!latestResult || !sceneFeed) {
    return true;
  }
  const latestSceneId = String(latestResult.scene_id ?? '').trim();
  const feedSceneId = String(sceneFeed.scene_id ?? '').trim();
  if (feedSceneId && latestSceneId && latestSceneId !== feedSceneId) {
    return true;
  }
  if (feedSceneId && !latestSceneId) {
    return true;
  }
  const latestId = String(latestResult.id ?? latestResult.beat_result_id ?? '');
  return (sceneFeed.recent_entries ?? []).some(
    (entry) => String(entry.beat_result_id ?? entry.id ?? '') === latestId
  );
}

export function isAllowedPlaytestRepairAction(repairAction) {
  return allowedRepairActions.has(String(repairAction ?? ''));
}

export function buildPlaytestDiagnosticsReport({
  checkedAt = new Date(),
  account = null,
  character = null,
  campaign = null,
  currentScene = null,
  currentObjective = null,
  windows = [],
  latestBeatResult = null,
  duplicateResultGroups = [],
  sceneFeed = null,
  knowledgeCount = 0,
  historyEntries = 0,
} = {}) {
  const checkedDate = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  const safeCheckedAt = Number.isNaN(checkedDate.getTime()) ? new Date() : checkedDate;
  const warnings = [];
  const errors = [];
  const repairActions = [];
  const current = currentWindow(windows, safeCheckedAt);
  const latest = latestWindow(windows);
  const activeCount = activeWindowCount(windows);
  const currentlyOpenCount = openWindowCount(windows, safeCheckedAt);

  if (!account) {
    errors.push(issue('missing_account', 'Authenticated account could not be loaded.'));
  }

  if (!character) {
    errors.push(issue('missing_active_character', 'No active character is selected.'));
  }

  if (!campaign) {
    warnings.push(issue('missing_active_campaign', 'No active campaign is available for this character.'));
  } else if (campaign.campaign_status && campaign.campaign_status !== 'active') {
    warnings.push(issue('campaign_not_active', `Campaign is ${campaign.campaign_status}.`));
  }

  if (campaign && !campaign.world_instance_id) {
    errors.push(issue('missing_world_instance', 'Campaign does not have a world instance.'));
  }

  if (campaign && !currentScene) {
    errors.push(issue('missing_current_scene', 'Campaign membership does not reference a current scene.'));
  }

  if (campaign && !currentObjective) {
    warnings.push(issue('missing_active_objective', 'No active objective is visible for this campaign.'));
  }

  if (campaign && windows.length === 0) {
    warnings.push(
      issue(
        'missing_action_window',
        'No action window exists for the active campaign.',
        'create_missing_next_action_window'
      )
    );
    addUniqueRepairAction(
      repairActions,
      'create_missing_next_action_window',
      'Create Missing Next Action Window'
    );
  }

  if (activeCount > 1) {
    errors.push(
      issue(
        'duplicate_active_action_windows',
        'More than one open/closing/resolving action window exists for this campaign.'
      )
    );
  }

  if (currentlyOpenCount > 1) {
    errors.push(
      issue(
        'duplicate_open_action_windows',
        'More than one currently open player action window exists.'
      )
    );
  }

  if (windows.some((window) => hasFutureLockedWindow(window, safeCheckedAt))) {
    errors.push(
      issue(
        'future_locked_current_action_window',
        'An open action window is future-locked, so the player cannot act even though the database marks it open.'
      )
    );
  }

  if (windows.some((window) => isWindowExpiredOpen(window, safeCheckedAt))) {
    warnings.push(
      issue(
        'expired_open_action_window',
        'An action window is still marked open after its scheduled close time.'
      )
    );
  }

  if (current && current.submission_id && String(current.submission_character_id ?? current.character_id) !== String(character?.character_id ?? character?.id)) {
    errors.push(
      issue(
        'submission_character_mismatch',
        'Submitted action is attached to a different character than the current window.'
      )
    );
  }

  if (
    campaign &&
    latest &&
    String(latest.status ?? '').toLowerCase() === 'resolved' &&
    activeCount === 0
  ) {
    warnings.push(
      issue(
        'resolved_beat_without_next_action_window',
        'The latest beat is resolved but no next action window is open.',
        'create_missing_next_action_window'
      )
    );
    addUniqueRepairAction(
      repairActions,
      'create_missing_next_action_window',
      'Create Missing Next Action Window'
    );
  }

  if (
    latest &&
    String(latest.status ?? '').toLowerCase() === 'resolved' &&
    !latestBeatResult
  ) {
    warnings.push(
      issue(
        'resolved_beat_without_result_read_model',
        'The latest resolved beat does not have a player-facing beat result read model.'
      )
    );
  }

  for (const duplicate of duplicateResultGroups) {
    errors.push(
      issue(
        'duplicate_beat_result_read_models',
        `Action window ${duplicate.action_window_id} has ${duplicate.count} player-facing result read models.`
      )
    );
  }

  if (latestBeatResult && !latestResultInFeed(latestBeatResult, sceneFeed)) {
    warnings.push(
      issue(
        'missing_latest_scene_feed_entry',
        'Latest result exists but is not present in the current scene feed.',
        'rebuild_scene_result_feed'
      )
    );
    addUniqueRepairAction(
      repairActions,
      'rebuild_scene_result_feed',
      'Rebuild Scene Result Feed'
    );
  }

  if (latestBeatResult) {
    addUniqueRepairAction(repairActions, 'rebuild_scene_result_feed', 'Rebuild Scene Result Feed');
  }
  if (campaign) {
    addUniqueRepairAction(repairActions, 'refresh_current_scene_read_model', 'Refresh Current Scene Read Model');
    addUniqueRepairAction(repairActions, 'rebuild_knowledge_journal', 'Rebuild Knowledge Journal');
  }

  const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
  const beatNumber =
    current?.beat_number ??
    latest?.beat_number ??
    latestBeatResult?.beat_number ??
    null;

  return {
    status,
    campaign_instance_id: rowId(campaign?.campaign_id ?? campaign?.campaign_instance_id),
    checked_at: safeCheckedAt.toISOString(),
    summary: {
      account_id: rowId(account?.account_id ?? account?.id),
      character_id: rowId(character?.character_id ?? character?.id),
      character_name: character?.character_name ?? character?.name ?? null,
      campaign_name: campaign?.campaign_name ?? campaign?.name ?? null,
      beat_number: beatNumber === null || beatNumber === undefined ? null : Number(beatNumber),
      current_scene_id: rowId(currentScene?.scene_id ?? currentScene?.id),
      current_scene_name: currentScene?.scene_name ?? currentScene?.name ?? null,
      current_objective_title: currentObjective?.objective_title ?? currentObjective?.title ?? null,
      current_action_window_id: rowId(current?.id ?? current?.action_window_id),
      current_action_window_state: current?.status ?? null,
      current_action_window_open_for_player: current ? isActionWindowOpenForPlayer(current, safeCheckedAt) : false,
      current_action_window_opens_at: isoOrNull(current?.opens_at),
      current_action_window_closes_at: isoOrNull(current?.closes_at ?? current?.expires_at),
      submitted_action_status: current?.submission_status ?? null,
      latest_result_id: rowId(latestBeatResult?.id ?? latestBeatResult?.beat_result_id),
      latest_result_summary: latestBeatResult?.summary ?? null,
      scene_feed_entry_count: sceneFeed?.recent_entries?.length ?? 0,
      knowledge_count: Number(knowledgeCount ?? 0),
      history_entries: Number(historyEntries ?? 0),
      active_action_window_count: activeCount,
      open_action_window_count: currentlyOpenCount,
    },
    warnings,
    errors,
    available_repair_actions: repairActions,
  };
}

async function requireDiagnosticsCapability(accountId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT COALESCE(can_advance_beats, FALSE) AS can_advance_beats
      FROM account
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );

  if (result.rows[0]?.can_advance_beats !== true) {
    throw createHttpError('This account is not authorized to view playtest diagnostics.', 403);
  }
}

async function resolveDiagnosticCampaign(accountId, input = {}, executor = { query }) {
  const explicitCampaignId = numericId(input.campaign_instance_id ?? input.campaign_id);
  const result = await executor.query(
    `
      SELECT
        account.id AS account_id,
        account.display_name,
        character.id AS character_id,
        character.name AS character_name,
        membership.campaign_id,
        membership.current_scene_id,
        campaign.name AS campaign_name,
        campaign.status AS campaign_status,
        campaign.world_instance_id,
        world.name AS world_name,
        scene.name AS scene_name,
        scene.key AS scene_key,
        location.name AS location_name,
        active_objective.objective_id,
        active_objective.objective_title,
        active_objective.objective_status
      FROM account
      LEFT JOIN dnd5e_character character
        ON character.account_id = account.id
        AND character.is_active = TRUE
        AND (
          ($2::bigint IS NULL AND character.id = account.active_character_id)
          OR $2::bigint IS NOT NULL
        )
      LEFT JOIN dnd5e_campaign_character membership
        ON membership.character_id = character.id
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
        AND ($2::bigint IS NULL OR membership.campaign_id = $2)
      LEFT JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      LEFT JOIN dnd5e_world world ON world.id = campaign.world_id
      LEFT JOIN dnd5e_scene scene ON scene.id = membership.current_scene_id
      LEFT JOIN dnd5e_location location ON location.id = scene.location_id
      LEFT JOIN LATERAL (
        SELECT
          objective.id AS objective_id,
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
      ORDER BY
        membership.is_active_context DESC NULLS LAST,
        membership.is_default_solo_campaign DESC NULLS LAST,
        membership.joined_at DESC NULLS LAST,
        membership.id DESC NULLS LAST,
        character.id DESC NULLS LAST
      LIMIT 1
    `,
    [accountId, explicitCampaignId]
  );

  const row = result.rows[0] ?? null;
  if (!row) {
    return {
      account: null,
      character: null,
      campaign: null,
      currentScene: null,
      currentObjective: null,
    };
  }

  return {
    account: {
      account_id: Number(row.account_id),
      display_name: row.display_name,
    },
    character: row.character_id
      ? {
          character_id: Number(row.character_id),
          character_name: row.character_name,
        }
      : null,
    campaign: row.campaign_id
      ? {
          campaign_id: Number(row.campaign_id),
          campaign_name: row.campaign_name,
          campaign_status: row.campaign_status,
          world_instance_id: row.world_instance_id ? Number(row.world_instance_id) : null,
          world_name: row.world_name,
        }
      : null,
    currentScene: row.current_scene_id
      ? {
          scene_id: Number(row.current_scene_id),
          scene_name: row.scene_name,
          scene_key: row.scene_key,
          location_name: row.location_name,
        }
      : null,
    currentObjective: row.objective_id
      ? {
          objective_id: Number(row.objective_id),
          objective_title: row.objective_title,
          objective_status: row.objective_status,
        }
      : null,
  };
}

async function loadActionWindowRows(campaignId, characterId, executor = { query }) {
  if (!campaignId || !characterId) {
    return [];
  }

  const result = await executor.query(
    `
      SELECT
        window_row.*,
        submission.id AS submission_id,
        submission.status AS submission_status,
        submission.character_id AS submission_character_id,
        submission.raw_text AS submitted_action_text
      FROM dnd5e_action_window window_row
      LEFT JOIN dnd5e_web_action_submission submission
        ON submission.action_window_id = window_row.id
        AND submission.character_id = window_row.character_id
      WHERE window_row.campaign_id = $1
        AND window_row.character_id = $2
      ORDER BY window_row.updated_at DESC, window_row.id DESC
      LIMIT 20
    `,
    [campaignId, characterId]
  );

  return result.rows;
}

async function loadLatestBeatResult(campaignId, characterId, executor = { query }) {
  if (!campaignId || !characterId) {
    return null;
  }

  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_player_beat_result
      WHERE campaign_id = $1
        AND character_id = $2
      ORDER BY resolved_at DESC, id DESC
      LIMIT 1
    `,
    [campaignId, characterId]
  );

  return result.rows[0] ?? null;
}

async function loadDuplicateBeatResultGroups(campaignId, characterId, executor = { query }) {
  if (!campaignId || !characterId) {
    return [];
  }

  const result = await executor.query(
    `
      SELECT action_window_id, COUNT(*)::int AS count
      FROM dnd5e_player_beat_result
      WHERE campaign_id = $1
        AND character_id = $2
      GROUP BY action_window_id
      HAVING COUNT(*) > 1
    `,
    [campaignId, characterId]
  );

  return result.rows;
}

async function countKnowledge(campaign, character, executor = { query }) {
  if (!campaign?.world_instance_id || !character?.character_id) {
    return 0;
  }

  const result = await executor.query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_character_knowledge
      WHERE character_id = $1
        AND world_instance_id = $2
        AND status = 'known'
    `,
    [character.character_id, campaign.world_instance_id]
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function countHistory(campaign, character, executor = { query }) {
  if (!campaign?.campaign_id || !character?.character_id) {
    return 0;
  }

  const result = await executor.query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_player_beat_result
      WHERE campaign_id = $1
        AND character_id = $2
    `,
    [campaign.campaign_id, character.character_id]
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function runPlaytestDiagnosticsForAccount(accountId, input = {}) {
  await ensureActionComposerSchema();
  await ensurePlayerBeatResultSchema();
  await requireDiagnosticsCapability(accountId);

  const resolved = await resolveDiagnosticCampaign(accountId, input);
  const windows = await loadActionWindowRows(
    resolved.campaign?.campaign_id,
    resolved.character?.character_id
  );
  const latestBeatResult = await loadLatestBeatResult(
    resolved.campaign?.campaign_id,
    resolved.character?.character_id
  );
  const duplicateResultGroups = await loadDuplicateBeatResultGroups(
    resolved.campaign?.campaign_id,
    resolved.character?.character_id
  );
  const sceneFeed =
    resolved.campaign?.campaign_id && resolved.character?.character_id && resolved.currentScene?.scene_id
      ? await listSceneResultFeed({
          campaignId: resolved.campaign.campaign_id,
          characterId: resolved.character.character_id,
          sceneId: resolved.currentScene.scene_id,
          limit: 5,
        })
      : null;
  const [knowledgeCount, historyEntries] = await Promise.all([
    countKnowledge(resolved.campaign, resolved.character),
    countHistory(resolved.campaign, resolved.character),
  ]);

  return buildPlaytestDiagnosticsReport({
    account: resolved.account,
    character: resolved.character,
    campaign: resolved.campaign,
    currentScene: resolved.currentScene,
    currentObjective: resolved.currentObjective,
    windows,
    latestBeatResult,
    duplicateResultGroups,
    sceneFeed,
    knowledgeCount,
    historyEntries,
  });
}

function repairMessage(repairAction, extra = {}) {
  switch (repairAction) {
    case 'rebuild_scene_result_feed':
      return `Scene result feed is dynamic; verified against ${extra.resultCount ?? 0} persisted beat result read models.`;
    case 'rebuild_knowledge_journal':
      return `Knowledge journal is dynamic; verified against ${extra.knowledgeCount ?? 0} canonical knowledge entries.`;
    case 'refresh_current_scene_read_model':
      return 'Current scene read model is dynamic; refreshed by reloading campaign state.';
    case 'create_missing_next_action_window':
      return 'Missing next action window repair ran through the existing play-state action-window service.';
    default:
      return 'Repair completed.';
  }
}

async function countBeatResultsForCampaign(campaignId, characterId, executor = { query }) {
  if (!campaignId || !characterId) {
    return 0;
  }
  const result = await executor.query(
    `
      SELECT COUNT(*)::int AS count
      FROM dnd5e_player_beat_result
      WHERE campaign_id = $1
        AND character_id = $2
    `,
    [campaignId, characterId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function ensureMissingNextWindowSafe(campaign, character) {
  if (!campaign?.campaign_id || !character?.character_id) {
    throw createHttpError('No active campaign is available to repair.', 409);
  }

  const windows = await loadActionWindowRows(campaign.campaign_id, character.character_id);
  const activeCount = activeWindowCount(windows);
  const latest = latestWindow(windows);
  if (activeCount > 0) {
    throw createHttpError('A current action window already exists; no repair was applied.', 409);
  }
  if (!latest || String(latest.status ?? '').toLowerCase() !== 'resolved') {
    throw createHttpError('The latest beat is not resolved; creating a next window is not safe.', 409);
  }

  await getPlayState(campaign.campaign_id, character.character_id, 'player');
}

export async function runPlaytestRepairForAccount(accountId, input = {}) {
  await ensureActionComposerSchema();
  await ensurePlayerBeatResultSchema();
  await requireDiagnosticsCapability(accountId);

  const repairAction = String(input.repair_action ?? '');
  if (rejectedRepairActions.has(repairAction) || !allowedRepairActions.has(repairAction)) {
    throw createHttpError('Unsupported or unsafe playtest repair action.', 400);
  }

  const resolved = await resolveDiagnosticCampaign(accountId, input);
  let messageExtra = {};

  if (repairAction === 'create_missing_next_action_window') {
    await ensureMissingNextWindowSafe(resolved.campaign, resolved.character);
  } else if (repairAction === 'rebuild_scene_result_feed') {
    messageExtra = {
      resultCount: await countBeatResultsForCampaign(
        resolved.campaign?.campaign_id,
        resolved.character?.character_id
      ),
    };
  } else if (repairAction === 'rebuild_knowledge_journal') {
    messageExtra = {
      knowledgeCount: await countKnowledge(resolved.campaign, resolved.character),
    };
  } else if (repairAction === 'refresh_current_scene_read_model' && resolved.campaign?.campaign_id && resolved.character?.character_id) {
    await getPlayState(resolved.campaign.campaign_id, resolved.character.character_id, 'player');
  }

  const diagnosticsAfter = await runPlaytestDiagnosticsForAccount(accountId, input);
  return {
    repair_action: repairAction,
    status: 'success',
    message: repairMessage(repairAction, messageExtra),
    diagnostics_after: diagnosticsAfter,
  };
}
