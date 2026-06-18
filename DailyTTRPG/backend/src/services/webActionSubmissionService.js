import { query, withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { ensureActionComposerSchema } from './actionComposerSchema.js';
import {
  isActionWindowOpenForPlayer,
  normalizeWebRuntimeConfig,
} from './beatWindowTimingService.js';
import { recordCampaignLog } from './narrativeStateService.js';

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function serializeSubmission(row) {
  if (!row) {
    return null;
  }

  return {
    submission_id: String(row.id),
    action_window_id: String(row.action_window_id),
    campaign_id: String(row.campaign_id),
    character_id: String(row.character_id),
    actor_account_id: row.actor_account_id ? String(row.actor_account_id) : null,
    text: row.raw_text,
    raw_text: row.raw_text,
    verb: row.resolved_verb,
    target_affordance_id: row.target_affordance_id,
    target_label: row.target_label,
    target_type: row.target_type,
    interaction_id: row.interaction_id,
    response_key: row.response_key,
    response_payload: row.response_payload_json ?? {},
    version: Number(row.version ?? 1),
    status: row.status,
    history: Array.isArray(row.submission_history_json) ? row.submission_history_json : [],
    submitted_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getWebActionRuntimeConfig(campaignId, executor = { query }) {
  await ensureActionComposerSchema();
  const result = await executor.query(
    'SELECT web_runtime_config_json FROM dnd5e_campaign WHERE id = $1 LIMIT 1',
    [campaignId]
  );
  const configured = normalizeObject(result.rows[0]?.web_runtime_config_json);

  return {
    ...normalizeWebRuntimeConfig(configured),
    ai_resolver_enabled: false,
    immediate_resolution_enabled: false,
    requires_preview_before_submit: true,
  };
}

export async function getSubmissionForActionWindow(actionWindowId, characterId, executor = { query }) {
  if (!actionWindowId || !characterId) {
    return null;
  }

  await ensureActionComposerSchema();
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_web_action_submission
      WHERE action_window_id = $1
        AND character_id = $2
      LIMIT 1
    `,
    [actionWindowId, characterId]
  );

  return serializeSubmission(result.rows[0] ?? null);
}

function buildSubmissionHistory(existing) {
  if (!existing) {
    return [];
  }

  const previousHistory = Array.isArray(existing.submission_history_json)
    ? existing.submission_history_json
    : [];

  return [
    ...previousHistory,
    {
      text: existing.raw_text,
      verb: existing.resolved_verb,
      target_affordance_id: existing.target_affordance_id,
      target_label: existing.target_label,
      target_type: existing.target_type,
      interaction_id: existing.interaction_id,
      response_key: existing.response_key,
      response_payload: existing.response_payload_json ?? {},
      version: Number(existing.version ?? 1),
      status: existing.status,
      submitted_at: existing.created_at,
      replaced_at: new Date().toISOString(),
    },
  ];
}

export async function storeWebActionSubmission({
  accountId,
  actionWindowId,
  campaignId,
  characterId,
  rawText,
  candidate,
  runtimeConfig,
}) {
  await ensureActionComposerSchema();

  return withTransaction(async (client) => {
    const windowResult = await client.query(
      `
        SELECT *
        FROM dnd5e_action_window
        WHERE id = $1
          AND campaign_id = $2
          AND character_id = $3
        FOR UPDATE
      `,
      [actionWindowId, campaignId, characterId]
    );
    const window = windowResult.rows[0] ?? null;
    if (!window) {
      throw createHttpError('Current action window was not found', 404);
    }

    if (!isActionWindowOpenForPlayer(window)) {
      throw createHttpError('This action window no longer accepts actions', 409);
    }

    const existingResult = await client.query(
      `
        SELECT *
        FROM dnd5e_web_action_submission
        WHERE action_window_id = $1
          AND character_id = $2
        FOR UPDATE
      `,
      [actionWindowId, characterId]
    );
    const existing = existingResult.rows[0] ?? null;
    const isUpdate = Boolean(existing);

    if (existing && runtimeConfig.allow_action_editing !== true) {
      throw createHttpError('Action editing is not enabled for this campaign', 409);
    }

    const responsePayload = {
      source: 'web_action_composer',
      raw_text: rawText,
      verb: candidate.verb,
      target_affordance_id: candidate.target_affordance_id,
      target_label: candidate.target_label,
      target_type: candidate.target_type,
      interaction_id: candidate.interaction_id ?? null,
      action_key: candidate.action_key ?? null,
      transition_id: candidate.transition_id ?? null,
      dialogue_scene_id: candidate.dialogue_scene_id ?? null,
      dialogue_title: candidate.dialogue_title ?? null,
      committed_followup: candidate.committed_followup ?? null,
      one_action_policy: runtimeConfig.one_action_policy,
    };
    const responseKey = candidate.response_key;
    const history = buildSubmissionHistory(existing);
    const version = existing ? Number(existing.version ?? 1) + 1 : 1;

    const storedResult = await client.query(
      `
        INSERT INTO dnd5e_web_action_submission (
          action_window_id,
          campaign_id,
          character_id,
          actor_account_id,
          raw_text,
          resolved_verb,
          target_affordance_id,
          target_label,
          target_type,
          interaction_id,
          response_key,
          response_payload_json,
          version,
          status,
          submission_history_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15::jsonb)
        ON CONFLICT (action_window_id, character_id)
        DO UPDATE SET
          actor_account_id = EXCLUDED.actor_account_id,
          raw_text = EXCLUDED.raw_text,
          resolved_verb = EXCLUDED.resolved_verb,
          target_affordance_id = EXCLUDED.target_affordance_id,
          target_label = EXCLUDED.target_label,
          target_type = EXCLUDED.target_type,
          interaction_id = EXCLUDED.interaction_id,
          response_key = EXCLUDED.response_key,
          response_payload_json = EXCLUDED.response_payload_json,
          version = EXCLUDED.version,
          status = EXCLUDED.status,
          submission_history_json = EXCLUDED.submission_history_json,
          updated_at = NOW()
        RETURNING *
      `,
      [
        actionWindowId,
        campaignId,
        characterId,
        accountId,
        rawText,
        candidate.verb,
        candidate.target_affordance_id,
        candidate.target_label,
        candidate.target_type,
        candidate.interaction_id ?? null,
        responseKey,
        JSON.stringify(responsePayload),
        version,
        isUpdate ? 'updated' : 'submitted',
        JSON.stringify(history),
      ]
    );
    const stored = serializeSubmission(storedResult.rows[0]);

    await recordCampaignLog(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: accountId,
        log_type: 'play_action',
        message: isUpdate ? 'Web action submission updated.' : 'Web action submitted.',
        data_json: {
          event_type: isUpdate ? 'action_submission_updated' : 'action_submitted',
          source: 'web_action_composer',
          action_window_id: actionWindowId,
          submission: stored,
        },
      },
      client
    );

    return {
      submission: stored,
      updated_existing: isUpdate,
    };
  });
}
