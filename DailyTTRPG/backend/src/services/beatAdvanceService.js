import { query, withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { ensureActionComposerSchema } from './actionComposerSchema.js';
import { actThroughPlayState, getPlayState } from './adventureRuntimeService.js';
import { getCharacterSceneView } from './characterSceneViewService.js';
import {
  activateDialogueFocusCommitSceneForAccount,
  getDialogueFocusCommitEntryForNpc,
} from './dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import { recordCampaignLog } from './narrativeStateService.js';
import {
  ensurePlayerBeatResultSchema,
  recordPlayerBeatResult,
} from './playerBeatResultService.js';

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function requireAdvanceCapability(accountId, executor = { query }) {
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
    throw createHttpError('This account is not authorized to advance beats.', 403);
  }
}

async function resolveCampaignForAdvance(accountId, input = {}, executor = { query }) {
  const explicitCampaignId = numericId(input.campaign_instance_id ?? input.campaign_id);
  const explicitCharacterId = numericId(input.character_id);
  const result = await executor.query(
    `
      SELECT
        membership.campaign_id,
        membership.character_id,
        membership.membership_status,
        campaign.status AS campaign_status
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      JOIN dnd5e_character character ON character.id = membership.character_id
      JOIN account ON account.id = character.account_id
      WHERE account.id = $1
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
        AND ($2::bigint IS NULL OR membership.campaign_id = $2)
        AND ($3::bigint IS NULL OR membership.character_id = $3)
        AND (
          $2::bigint IS NOT NULL
          OR $3::bigint IS NOT NULL
          OR account.active_character_id = membership.character_id
        )
      ORDER BY
        membership.is_active_context DESC,
        membership.is_default_solo_campaign DESC,
        membership.joined_at DESC NULLS LAST,
        membership.id DESC
      LIMIT 1
    `,
    [accountId, explicitCampaignId, explicitCharacterId]
  );

  const row = result.rows[0] ?? null;
  if (!row) {
    throw createHttpError('No active campaign was found for this account.', 404);
  }

  if (row.campaign_status !== 'active') {
    throw createHttpError('Only active campaigns can be advanced.', 409);
  }

  return {
    campaignId: Number(row.campaign_id),
    characterId: Number(row.character_id),
  };
}

function stringValue(value) {
  return value === undefined || value === null ? null : String(value);
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function withCommittedFollowup(actionInput, payload) {
  const committedFollowup = objectValue(payload.committed_followup);
  if (!committedFollowup?.source_interaction_id) {
    return actionInput;
  }

  return {
    ...actionInput,
    raw_text: stringValue(payload.raw_text),
    verb: stringValue(payload.verb),
    target_id: stringValue(committedFollowup.target_id ?? payload.target_affordance_id),
    target_label: stringValue(committedFollowup.target_label ?? payload.target_label),
    committed_followup: {
      source_interaction_id: stringValue(committedFollowup.source_interaction_id),
      target_id: stringValue(committedFollowup.target_id ?? payload.target_affordance_id),
      target_label: stringValue(committedFollowup.target_label ?? payload.target_label),
      check_resolution: stringValue(committedFollowup.check_resolution) ?? 'advantage',
      beat_action_type: stringValue(committedFollowup.beat_action_type),
    },
  };
}

function actionInputFromWindowDefault(window, actorAccountId) {
  if (window.default_action_type === 'first_available_action' && window.suggested_action_key) {
    return {
      action_key: window.suggested_action_key,
      actor_account_id: actorAccountId,
    };
  }

  return {
    action_type: ['end_turn', 'resolve_ai_turn'].includes(window.default_action_type)
      ? window.default_action_type
      : 'wait',
    actor_account_id: actorAccountId,
  };
}

export function actionInputFromSubmission(window, submission, actorAccountId) {
  if (!submission) {
    return actionInputFromWindowDefault(window, actorAccountId);
  }

  const payload = submission.response_payload_json ?? {};
  const verb = stringValue(payload.verb ?? submission.resolved_verb)?.toLowerCase();
  const targetAffordanceId = stringValue(
    payload.target_affordance_id ?? submission.target_affordance_id
  );
  const interactionId = stringValue(payload.interaction_id ?? submission.interaction_id);
  const transitionId = stringValue(payload.transition_id);
  const dialogueSceneId = stringValue(payload.dialogue_scene_id);
  const dialogueTitle = stringValue(payload.dialogue_title);
  const actionKey = stringValue(payload.action_key);
  const committedFollowup = objectValue(payload.committed_followup);

  if (interactionId) {
    const numericInteractionId = numericId(interactionId);
    return withCommittedFollowup({
      action_type: 'scene_interaction',
      interaction_id: numericInteractionId ?? undefined,
      interaction_key: numericInteractionId ? undefined : interactionId,
      actor_account_id: actorAccountId,
    }, payload);
  }

  if (transitionId) {
    const numericTransitionId = numericId(transitionId);
    return withCommittedFollowup({
      action_type: 'move_scene',
      transition_id: numericTransitionId ?? undefined,
      transition_key: numericTransitionId ? undefined : transitionId,
      actor_account_id: actorAccountId,
    }, payload);
  }

  if (targetAffordanceId?.startsWith('scene_interaction:')) {
    return withCommittedFollowup({
      action_type: 'scene_interaction',
      interaction_key: targetAffordanceId.slice('scene_interaction:'.length),
      actor_account_id: actorAccountId,
    }, payload);
  }

  if (
    actionKey &&
    !actionKey.startsWith('web:') &&
    !actionKey.startsWith('npc:') &&
    (actionKey.includes(':') || actionKey === 'wait')
  ) {
    return withCommittedFollowup({
      action_key: actionKey,
      actor_account_id: actorAccountId,
    }, payload);
  }

  if (targetAffordanceId?.startsWith('npc:') && verb === 'talk') {
    const npcKey = targetAffordanceId.slice('npc:'.length);
    const dialogueEntry = dialogueSceneId
      ? {
          dialogue_scene_id: dialogueSceneId,
          dialogue_title: dialogueTitle,
        }
      : getDialogueFocusCommitEntryForNpc(npcKey);
    if (dialogueEntry?.dialogue_scene_id) {
      return withCommittedFollowup({
        action_type: 'enter_dialogue_focus_commit',
        npc_key: npcKey,
        dialogue_scene_id: dialogueEntry.dialogue_scene_id,
        dialogue_title: dialogueEntry.dialogue_title ?? dialogueTitle,
        actor_account_id: actorAccountId,
      }, payload);
    }
    return withCommittedFollowup({
      action_type: 'talk_to_npc',
      npc_key: npcKey,
      actor_account_id: actorAccountId,
    }, payload);
  }

  if (committedFollowup?.source_interaction_id) {
    return withCommittedFollowup({
      action_type: 'free_focus_followup',
      actor_account_id: actorAccountId,
    }, payload);
  }

  if (verb === 'wait' || verb === 'observe') {
    return withCommittedFollowup({
      action_type: 'wait',
      actor_account_id: actorAccountId,
    }, payload);
  }

  throw createHttpError('Submitted action cannot be resolved by the current runtime.', 409);
}

async function beginAdvance({ accountId, campaignId, characterId }) {
  return withTransaction(async (client) => {
    const recentAdvance = await client.query(
      `
        SELECT id
        FROM dnd5e_campaign_log
        WHERE campaign_id = $1
          AND character_id = $2
          AND actor_account_id = $3
          AND log_type = 'play_action'
          AND data_json->>'event_type' = 'dev_beat_advanced'
          AND created_at > NOW() - INTERVAL '5 seconds'
        ORDER BY id DESC
        LIMIT 1
      `,
      [campaignId, characterId, accountId]
    );

    if (recentAdvance.rows.length > 0) {
      return {
        status: 'recently_advanced',
        actionInput: null,
        window: null,
        submission: null,
      };
    }

    const windowResult = await client.query(
      `
        SELECT *
        FROM dnd5e_action_window
        WHERE campaign_id = $1
          AND character_id = $2
          AND status IN ('open', 'closing', 'resolving')
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [campaignId, characterId]
    );
    const window = windowResult.rows[0] ?? null;
    if (!window) {
      throw createHttpError('No active action window is available to advance.', 409);
    }

    if (window.status === 'resolving') {
      return {
        status: 'already_resolving',
        actionInput: null,
        window,
        submission: null,
      };
    }

    const submissionResult = await client.query(
      `
        SELECT *
        FROM dnd5e_web_action_submission
        WHERE action_window_id = $1
          AND character_id = $2
        LIMIT 1
      `,
      [window.id, characterId]
    );
    const submission = submissionResult.rows[0] ?? null;
    const actionInput = actionInputFromSubmission(window, submission, accountId);

    const updatedWindow = await client.query(
      `
        UPDATE dnd5e_action_window
        SET
          status = 'resolving',
          closed_at = COALESCE(closed_at, NOW()),
          resolution_started_at = COALESCE(resolution_started_at, NOW()),
          resolution_summary = 'Manual dev/GM beat advance started.',
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [window.id]
    );

    if (submission) {
      await client.query(
        `
          UPDATE dnd5e_web_action_submission
          SET status = 'locked', updated_at = NOW()
          WHERE id = $1
        `,
        [submission.id]
      );
    }

    await recordCampaignLog(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: accountId,
        log_type: 'action_window_closed',
        message: 'Dev/GM closed the current action window for beat advancement.',
        data_json: {
          action_window_id: window.id,
          event_type: 'dev_action_window_closed',
          source: 'dev_gm_advance',
        },
      },
      client
    );

    return {
      status: 'started',
      actionInput,
      window: updatedWindow.rows[0],
      submission,
    };
  });
}

async function reopenWindowAfterFailure(windowId, error) {
  await query(
    `
      UPDATE dnd5e_action_window
      SET
        status = 'open',
        closed_at = NULL,
        resolution_started_at = NULL,
        resolution_summary = $2,
        updated_at = NOW()
      WHERE id = $1
        AND status = 'resolving'
    `,
    [windowId, `Manual beat advance failed: ${error.message}`]
  );
}

async function finalizeAdvance({ accountId, campaignId, characterId, window, submission = null, resolved }) {
  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE dnd5e_action_window
        SET
          status = 'resolved',
          resolved_at = NOW(),
          resolution_summary = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [window.id, resolved?.result?.result_summary ?? 'Beat advanced by dev/GM.']
    );

    const resolvedLog = await recordCampaignLog(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: accountId,
        log_type: 'play_action',
        message: 'Dev/GM advanced the campaign beat.',
        data_json: {
          event_type: 'dev_beat_advanced',
          resolved_action_window_id: window.id,
          action: resolved?.action ?? null,
        },
      },
      client
    );

    await recordPlayerBeatResult(
      {
        campaignId,
        characterId,
        window,
        submission,
        resolved,
        provenanceEvents: [resolvedLog],
      },
      client
    );
  });
}

async function currentSceneResponse({ accountId, campaignId, characterId, status, previousWindowId = null }) {
  const currentScene = await getCharacterSceneView({
    accountId,
    campaignInstanceId: campaignId,
    characterId,
    includeMechanics: true,
  });

  return {
    status,
    previous_action_window_id: previousWindowId ? String(previousWindowId) : null,
    current_scene: currentScene,
    action_status: currentScene.action_status,
    route:
      currentScene.active_dialogue?.status === 'active' &&
      currentScene.active_dialogue?.dialogue_scene_id
        ? `/play/campaign/dialogue?dialogue_scene_id=${encodeURIComponent(currentScene.active_dialogue.dialogue_scene_id)}`
        : '/play/campaign/scene',
  };
}

async function resolveFocusCommitDialogueEntry({
  accountId,
  campaignId,
  characterId,
  actionInput,
  window,
}) {
  const currentDialogue = await activateDialogueFocusCommitSceneForAccount(accountId, {
    dialogue_scene_id: actionInput.dialogue_scene_id,
    allow_reentry: true,
    entry_source: {
      source: 'beat_resolution',
      action_type: actionInput.action_type,
      action_window_id: window?.id ? String(window.id) : null,
      campaign_id: String(campaignId),
      character_id: String(characterId),
      npc_key: actionInput.npc_key ?? null,
    },
  });
  const title =
    actionInput.dialogue_title ||
    currentDialogue.dialogue_scene?.title ||
    'the conversation';
  return {
    action: {
      ...actionInput,
      action_type: 'enter_dialogue_focus_commit',
    },
    result: {
      summary: `Dialogue started: ${title}.`,
      narrative_text: `Dialogue started: ${title}.`,
      dialogue: {
        dialogue_scene_id: currentDialogue.dialogue_scene?.dialogue_scene_id ?? actionInput.dialogue_scene_id,
        dialogue_title: currentDialogue.dialogue_scene?.title ?? title,
        dialogue_scene_state_id: currentDialogue.dialogue_scene_state?.dialogue_scene_state_id ?? null,
      },
    },
    current_dialogue: currentDialogue,
  };
}

export async function advanceBeatForDevAccount(accountId, input = {}) {
  await ensureActionComposerSchema();
  await ensurePlayerBeatResultSchema();
  await requireAdvanceCapability(accountId);
  const { campaignId, characterId } = await resolveCampaignForAdvance(accountId, input);

  await getPlayState(campaignId, characterId, 'player');
  const transition = await beginAdvance({ accountId, campaignId, characterId });

  if (transition.status !== 'started') {
    return currentSceneResponse({
      accountId,
      campaignId,
      characterId,
      status: transition.status,
      previousWindowId: transition.window?.id ?? null,
    });
  }

  const actionInput = {
    ...transition.actionInput,
    ...(input.roll !== undefined && input.roll !== null ? { roll: input.roll } : {}),
  };

  let resolved;
  try {
    resolved =
      actionInput.action_type === 'enter_dialogue_focus_commit'
        ? await resolveFocusCommitDialogueEntry({
            accountId,
            campaignId,
            characterId,
            actionInput,
            window: transition.window,
          })
        : await actThroughPlayState(campaignId, characterId, actionInput, 'player');
  } catch (error) {
    await reopenWindowAfterFailure(transition.window.id, error);
    throw error;
  }

  await finalizeAdvance({
    accountId,
    campaignId,
    characterId,
    window: transition.window,
    submission: transition.submission,
    resolved,
  });

  await getPlayState(campaignId, characterId, 'player');

  return currentSceneResponse({
    accountId,
    campaignId,
    characterId,
    status: 'advanced',
    previousWindowId: transition.window.id,
  });
}
