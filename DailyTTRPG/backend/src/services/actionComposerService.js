import { createHttpError } from '../utils/httpError.js';
import { query } from '../config/db.js';
import { getCharacterSceneView } from './characterSceneViewService.js';
import {
  getWebActionRuntimeConfig,
  storeWebActionSubmission,
} from './webActionSubmissionService.js';
import { findFreeFocusOverlap } from './freeFocusService.js';

const maxActionTextLength = 1000;
const submitWindowStates = new Set(['action_needed', 'action_submitted']);

const verbAliases = new Map([
  ['ask', 'talk'],
  ['speak', 'talk'],
  ['talk', 'talk'],
  ['question', 'talk'],
  ['tell', 'talk'],
  ['listen', 'talk'],
  ['look', 'observe'],
  ['observe', 'observe'],
  ['watch', 'observe'],
  ['focus', 'observe'],
  ['check', 'observe'],
  ['inspect', 'investigate'],
  ['investigate', 'investigate'],
  ['search', 'investigate'],
  ['examine', 'investigate'],
  ['study', 'investigate'],
  ['follow', 'move'],
  ['go', 'move'],
  ['head', 'move'],
  ['continue', 'move'],
  ['travel', 'move'],
  ['return', 'move'],
  ['take', 'move'],
  ['move', 'move'],
  ['walk', 'move'],
  ['enter', 'move'],
  ['leave', 'move'],
  ['wait', 'wait'],
  ['rest', 'wait'],
]);

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeToken(value) {
  return normalizeText(value).toLowerCase().replaceAll(/[^a-z0-9:_ -]/g, '');
}

function normalizeVerb(value) {
  const normalized = normalizeToken(value).replaceAll(' ', '_');
  return verbAliases.get(normalized) ?? normalized;
}

function compact(values) {
  return values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function unique(values) {
  return [...new Set(compact(values).map((value) => String(value)))];
}

function normalizeActionDetail(action) {
  if (typeof action === 'string') {
    return {
      verb: normalizeVerb(action),
      action_key: null,
      interaction_id: null,
      transition_id: null,
    };
  }

  const verb = normalizeVerb(action?.verb ?? action?.action ?? action?.action_type);
  if (!verb) {
    return null;
  }

  return {
    verb,
    action_key: action.action_key ?? action.key ?? null,
    interaction_id: action.interaction_id ?? action.interaction_key ?? null,
    transition_id: action.transition_id ?? action.transition_key ?? null,
    dialogue_scene_id: action.dialogue_scene_id ?? action.dialogueSceneId ?? null,
    dialogue_title: action.dialogue_title ?? action.dialogueTitle ?? null,
  };
}

function actionDetails(affordance) {
  const rawActions =
    Array.isArray(affordance.available_actions) && affordance.available_actions.length > 0
      ? affordance.available_actions
      : affordance.actions ?? [];
  const details = rawActions.map(normalizeActionDetail).filter(Boolean);
  const seen = new Set();

  return details.filter((detail) => {
    const key = `${detail.verb}:${detail.action_key ?? ''}:${detail.interaction_id ?? ''}:${detail.transition_id ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function actionList(affordance) {
  return unique(actionDetails(affordance).map((action) => action.verb));
}

function candidateResponseKey(candidate) {
  return `web:${candidate.verb}:${String(candidate.target_affordance_id ?? 'scene')
    .replaceAll(/[^a-zA-Z0-9:_-]/g, '_')
    .slice(0, 140)}`;
}

function safeAffordances(sceneView) {
  return (sceneView.visible_affordances ?? [])
    .filter((affordance) => affordance?.affordance_id && affordance.label)
    .filter((affordance) => ['available', undefined, null].includes(affordance.state))
    .map((affordance) => {
      const actions = actionList(affordance);
      return {
        affordance_id: String(affordance.affordance_id),
        label: String(affordance.label),
        type: affordance.type ?? 'other',
        description: affordance.description ?? null,
        aliases: unique([affordance.label, ...(affordance.aliases ?? [])]),
        actions,
        action_details: actionDetails(affordance),
        dialogue_scene_id: affordance.dialogue_scene_id ?? null,
        dialogue_title: affordance.dialogue_title ?? null,
      };
    })
    .filter((affordance) => affordance.actions.length > 0);
}

function textIncludesAlias(text, affordance) {
  const haystack = normalizeToken(text);
  return affordance.aliases.some((alias) => {
    const needle = normalizeToken(alias);
    return needle.length >= 2 && haystack.includes(needle);
  });
}

function detectedVerbs(rawText, allowedVerbs = null) {
  const text = normalizeToken(rawText);
  const found = [];
  for (const [alias, verb] of verbAliases.entries()) {
    if (allowedVerbs && !allowedVerbs.has(verb)) {
      continue;
    }
    const expression = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (expression.test(text)) {
      found.push(verb);
    }
  }
  return unique(found);
}

function buildCandidate(affordance, verb, confidence = 0.8) {
  const actionDetail =
    affordance.action_details?.find((action) => action.verb === verb) ?? null;
  const candidate = {
    verb,
    target_affordance_id: affordance.affordance_id,
    target_label: affordance.label,
    target_type: affordance.type,
    interaction_id: actionDetail?.interaction_id ?? null,
    action_key: actionDetail?.action_key ?? null,
    transition_id: actionDetail?.transition_id ?? null,
    dialogue_scene_id: actionDetail?.dialogue_scene_id ?? affordance.dialogue_scene_id ?? null,
    dialogue_title: actionDetail?.dialogue_title ?? affordance.dialogue_title ?? null,
    confidence,
  };
  return {
    ...candidate,
    response_key: candidateResponseKey(candidate),
  };
}

function validation(canSubmit, reason = null) {
  return {
    can_submit: canSubmit,
    reason,
  };
}

function clarificationOption(candidate) {
  return {
    label: `${candidate.verb} ${candidate.target_label}`,
    verb: candidate.verb,
    target_affordance_id: candidate.target_affordance_id,
    target_label: candidate.target_label,
    target_type: candidate.target_type,
    action_key: candidate.action_key ?? null,
    interaction_id: candidate.interaction_id ?? null,
    transition_id: candidate.transition_id ?? null,
  };
}

function resolved(candidate, rawText) {
  return {
    status: 'resolved',
    raw_text: rawText,
    candidate,
    validation: validation(true),
    message: null,
  };
}

function playerSafeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return candidate;
  }
  const { confidence, ...safeCandidate } = candidate;
  return safeCandidate;
}

function playerSafePreview(preview) {
  if (!preview || typeof preview !== 'object') {
    return preview;
  }
  const safePreview = { ...preview };
  if (safePreview.candidate) {
    safePreview.candidate = playerSafeCandidate(safePreview.candidate);
  }
  return safePreview;
}

function sceneReferenceTarget(sceneView, targetId) {
  const normalizedTargetId = normalizeText(targetId);
  if (!normalizedTargetId) {
    return null;
  }

  return (
    (sceneView.scene_reference?.action_targets ?? []).find(
      (target) => normalizeText(target.id) === normalizedTargetId
    ) ??
    (sceneView.visible_affordances ?? []).find(
      (affordance) => normalizeText(affordance.affordance_id) === normalizedTargetId
    ) ??
    null
  );
}

function committedFollowupVerb(closerLook, fallbackCandidate = null, input = {}) {
  const explicitVerb = normalizeText(input.selected_verb ?? input.selectedVerb);
  if (explicitVerb) {
    return normalizeVerb(explicitVerb);
  }
  const beatActionType = normalizeText(closerLook.committed_followup?.beat_action_type);
  if (beatActionType) {
    return normalizeVerb(beatActionType);
  }
  if (fallbackCandidate?.verb) {
    return fallbackCandidate.verb;
  }
  return 'investigate';
}

function followupCandidateFromCloserLook({ closerLook, preview, input, sceneView }) {
  const baseCandidate = preview.status === 'resolved' ? preview.candidate : null;
  const target = sceneReferenceTarget(sceneView, closerLook.target_id);
  const candidate = {
    verb: committedFollowupVerb(closerLook, baseCandidate, input),
    target_affordance_id:
      baseCandidate?.target_affordance_id ??
      normalizeText(closerLook.target_id) ??
      normalizeText(target?.id ?? target?.affordance_id),
    target_label:
      baseCandidate?.target_label ??
      normalizeText(closerLook.label) ??
      normalizeText(target?.label) ??
      'the closer look',
    target_type: baseCandidate?.target_type ?? target?.type ?? 'free_focus_target',
    interaction_id: baseCandidate?.interaction_id ?? null,
    action_key: baseCandidate?.action_key ?? null,
    transition_id: baseCandidate?.transition_id ?? null,
    confidence: Math.max(Number(baseCandidate?.confidence ?? 0), 0.7),
  };

  return {
    ...candidate,
    response_key: baseCandidate?.response_key ?? candidateResponseKey(candidate),
  };
}

function withCommittedFollowup(preview, input = {}, sceneView = {}) {
  const interactionId = normalizeText(
    input.continue_free_focus_interaction_id ?? input.continueFreeFocusInteractionId
  );
  if (!interactionId) {
    return preview;
  }

  const closerLook = (sceneView.scene_reference?.closer_looks ?? []).find(
    (entry) => entry.interaction_id === interactionId
  );
  if (!closerLook) {
    return invalid('That closer look is not available in the current scene.');
  }

  if (closerLook.is_expired === true || closerLook.is_available !== true) {
    return invalid(closerLook.unavailable_reason ?? 'That closer look is not available right now.');
  }

  if (closerLook.committed_followup?.enabled === false) {
    return invalid('That closer look cannot be committed as a beat action from here.');
  }

  const candidate = followupCandidateFromCloserLook({
    closerLook,
    preview,
    input,
    sceneView,
  });
  const rawText = normalizeText(input.raw_text ?? input.rawText) || `${candidate.verb} ${candidate.target_label}`;

  return {
    ...resolved(candidate, rawText),
    candidate: {
      ...candidate,
      committed_followup: {
        source_interaction_id: interactionId,
        target_id: closerLook.target_id ?? null,
        target_label: closerLook.label ?? candidate.target_label,
        check_resolution: closerLook.committed_followup?.check_resolution ?? 'advantage',
        beat_action_type: closerLook.committed_followup?.beat_action_type ?? null,
      },
    },
  };
}

function invalid(message, suggestions = []) {
  return {
    status: 'invalid',
    message,
    suggestions,
    validation: validation(false, message),
  };
}

function needsClarification(message, candidates) {
  return {
    status: 'needs_clarification',
    message,
    options: candidates.map(clarificationOption),
    validation: validation(false, message),
  };
}

function multiActionClarification(candidates) {
  return {
    status: 'multi_action_clarification',
    message: 'Choose one primary action for this beat.',
    detected_actions: candidates.map(clarificationOption),
    validation: validation(false, 'Choose one primary action.'),
  };
}

function likelyMultiAction(rawText, candidates) {
  if (candidates.length < 2) {
    return false;
  }

  const text = normalizeToken(rawText);
  const hasConnector = /\b(and|then|also|after that|while)\b|,|;/.test(text);
  const distinctTargets = new Set(candidates.map((candidate) => candidate.target_affordance_id));
  const distinctVerbs = new Set(candidates.map((candidate) => candidate.verb));

  return hasConnector && (distinctTargets.size > 1 || distinctVerbs.size > 1);
}

function candidatesFromText(rawText, affordances, forcedVerb = null) {
  const allowedVerbs = new Set(affordances.flatMap((affordance) => affordance.actions));
  const verbs = forcedVerb ? [forcedVerb] : detectedVerbs(rawText, allowedVerbs);
  const matches = [];

  for (const affordance of affordances) {
    const targetMatched = textIncludesAlias(rawText, affordance);
    for (const verb of verbs) {
      if (!affordance.actions.includes(verb)) {
        continue;
      }
      if (targetMatched || forcedVerb) {
        matches.push(buildCandidate(affordance, verb, targetMatched ? 0.88 : 0.72));
      }
    }
  }

  if (matches.length === 0 && verbs.length === 1) {
    const verbTargets = affordances.filter((affordance) => affordance.actions.includes(verbs[0]));
    if (verbTargets.length === 1) {
      matches.push(buildCandidate(verbTargets[0], verbs[0], 0.66));
    }
  }

  return matches;
}

function selectedAffordanceResolution({ rawText, selectedAffordance, selectedVerb }) {
  const actions = selectedAffordance.actions;
  const verb = selectedVerb ? normalizeVerb(selectedVerb) : null;

  if (verb && !actions.includes(verb)) {
    return invalid('That action is not available for the selected target.', [
      'Choose one of the visible actions for that target.',
    ]);
  }

  if (verb) {
    return resolved(buildCandidate(selectedAffordance, verb, 0.95), rawText);
  }

  const inferredVerbs = detectedVerbs(rawText, new Set(actions));
  if (inferredVerbs.length === 1) {
    return resolved(buildCandidate(selectedAffordance, inferredVerbs[0], 0.9), rawText);
  }

  if (actions.length === 1) {
    return resolved(buildCandidate(selectedAffordance, actions[0], 0.78), rawText);
  }

  return needsClarification(
    `What do you want to do with ${selectedAffordance.label}?`,
    actions.map((action) => buildCandidate(selectedAffordance, action, 0.7))
  );
}

export function resolveActionIntent(input = {}, sceneView = {}) {
  const rawText = normalizeText(input.raw_text ?? input.rawText);
  const selectedAffordanceId = normalizeText(
    input.selected_affordance_id ?? input.selectedAffordanceId
  );
  const selectedVerb = normalizeText(input.selected_verb ?? input.selectedVerb);
  const affordances = safeAffordances(sceneView);

  if (rawText.length > maxActionTextLength) {
    return invalid(`Actions must be ${maxActionTextLength} characters or fewer.`, [
      'Describe one clear action for this beat.',
    ]);
  }

  if (!rawText && !(selectedAffordanceId && selectedVerb)) {
    return invalid('Describe one clear action for this beat.', [
      'You can type naturally or choose a visible target and action.',
    ]);
  }

  if (selectedAffordanceId) {
    const affordance = affordances.find((entry) => entry.affordance_id === selectedAffordanceId);
    if (!affordance) {
      return invalid('That target is not available from here.', [
        'Choose a visible person, object, clue, or path in the scene.',
      ]);
    }
    return selectedAffordanceResolution({
      rawText,
      selectedAffordance: affordance,
      selectedVerb,
    });
  }

  const forcedVerb = selectedVerb ? normalizeVerb(selectedVerb) : null;
  const textCandidates = candidatesFromText(rawText, affordances, forcedVerb);

  if (textCandidates.length === 0) {
    if (forcedVerb) {
      const targets = affordances
        .filter((affordance) => affordance.actions.includes(forcedVerb))
        .map((affordance) => buildCandidate(affordance, forcedVerb, 0.6));
      if (targets.length > 0) {
        return needsClarification(`What do you want to ${forcedVerb}?`, targets.slice(0, 6));
      }
    }
    const naturalVerbs = detectedVerbs(
      rawText,
      new Set(affordances.flatMap((affordance) => affordance.actions))
    );
    if (naturalVerbs.length === 1) {
      const targets = affordances
        .filter((affordance) => affordance.actions.includes(naturalVerbs[0]))
        .map((affordance) => buildCandidate(affordance, naturalVerbs[0], 0.6));
      if (targets.length > 1) {
        return needsClarification(`What do you want to ${naturalVerbs[0]}?`, targets.slice(0, 6));
      }
    }
    return invalid('That action does not seem available from here.', [
      'Choose a visible person, object, clue, or path in the scene.',
    ]);
  }

  if (likelyMultiAction(rawText, textCandidates)) {
    return multiActionClarification(textCandidates.slice(0, 6));
  }

  if (textCandidates.length === 1) {
    return resolved(textCandidates[0], rawText);
  }

  return needsClarification('Which target do you mean?', textCandidates.slice(0, 6));
}

function responseForMissingState(sceneView) {
  if (sceneView.state === 'no_active_character') {
    return invalid('Create or select a character before submitting an action.');
  }
  if (sceneView.state === 'no_active_campaign') {
    return invalid('Start an adventure before submitting an action.');
  }
  return null;
}

function ensureWindowCanAccept(sceneView) {
  if (sceneView.slice_endpoint?.is_endpoint_reached === true) {
    return {
      ok: false,
      response: invalid(
        'You have reached the end of the current Greyvale playable slice.',
        [
          sceneView.slice_endpoint.next_step ??
            'Review your journal and return when the next Greyvale systems are enabled.',
        ]
      ),
    };
  }

  const actionStatus = sceneView.action_status ?? {};
  const actionWindowId = actionStatus.action_window_id ?? sceneView.action_window?.action_window_id;
  const acceptsAction =
    actionStatus.can_submit === true ||
    (actionStatus.state === 'action_submitted' && actionStatus.can_edit === true);
  if (!actionWindowId || !submitWindowStates.has(actionStatus.state) || !acceptsAction) {
    return {
      ok: false,
      response: invalid('No open action window is available right now.'),
    };
  }

  return {
    ok: true,
    actionWindowId: Number(actionWindowId),
  };
}

function actionLifecycleContext(sceneView, actionWindowId) {
  return {
    action_window_id: String(actionWindowId),
    submission_version: Number(sceneView.action_status?.submitted_action?.version ?? 0),
  };
}

function staleActionMomentError() {
  return createHttpError('That moment has changed. Review the current scene and choose your next action.', 409);
}

function activeDialogueActionMessage() {
  return 'Finish or leave the active conversation before submitting an exploration action.';
}

async function activeDialogueConflict(sceneView) {
  const campaignId = parsePositiveInteger(sceneView.campaign_instance_id);
  const characterId = parsePositiveInteger(sceneView.character_id);
  if (!campaignId || !characterId) {
    return null;
  }

  const tableCheck = await query("SELECT to_regclass('public.dnd5e_dialogue_scene_state') AS table_name");
  if (!tableCheck.rows[0]?.table_name) {
    return null;
  }

  const result = await query(
    `
      SELECT id, dialogue_scene_key
      FROM dnd5e_dialogue_scene_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND field_name = '__runtime_state__'
        AND scope = 'dialogue_scene_state'
        AND value_json->>'status' = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [campaignId, characterId]
  );
  const row = result.rows[0] ?? null;
  return row
    ? {
        dialogue_scene_state_id: String(row.id),
        dialogue_scene_id: row.dialogue_scene_key,
      }
    : null;
}

function assertActionLifecycleContext(input, sceneView, actionWindowId) {
  const lifecycle = normalizeObject(input.lifecycle_context ?? input.lifecycleContext);
  const requestedActionWindowId = parsePositiveInteger(
    input.action_window_id ??
      input.actionWindowId ??
      lifecycle.action_window_id ??
      lifecycle.actionWindowId
  );
  if (requestedActionWindowId && requestedActionWindowId !== Number(actionWindowId)) {
    throw staleActionMomentError();
  }

  const expectedSubmissionVersion = parseNonNegativeInteger(
    input.expected_submission_version ??
      input.submission_version ??
      lifecycle.expected_submission_version ??
      lifecycle.submission_version
  );
  if (expectedSubmissionVersion !== null) {
    const currentSubmissionVersion = Number(sceneView.action_status?.submitted_action?.version ?? 0);
    if (expectedSubmissionVersion !== currentSubmissionVersion) {
      throw staleActionMomentError();
    }
  }
}

export async function previewWebAction(accountId, input = {}) {
  const sceneView = await getCharacterSceneView({
    accountId,
    includeDebug: false,
    includeMechanics: true,
  });
  const missingState = responseForMissingState(sceneView);
  if (missingState) {
    return missingState;
  }

  const dialogueConflict = await activeDialogueConflict(sceneView);
  if (dialogueConflict) {
    return invalid(activeDialogueActionMessage(), [
      'Return to the conversation and use an exit, or refresh the current scene after it ends.',
    ]);
  }

  const windowCheck = ensureWindowCanAccept(sceneView);
  if (!windowCheck.ok) {
    return windowCheck.response;
  }

  let preview = resolveActionIntent(input, sceneView);
  const continuedInteractionId = normalizeText(
    input.continue_free_focus_interaction_id ?? input.continueFreeFocusInteractionId
  );
  if (continuedInteractionId) {
    preview = withCommittedFollowup(preview, input, sceneView);
  } else {
    const overlap = findFreeFocusOverlap({
      rawText: input.raw_text ?? input.rawText,
      selectedAffordanceId: input.selected_affordance_id ?? input.selectedAffordanceId,
      preview,
      closerLooks: sceneView.scene_reference?.closer_looks ?? [],
    });
    if (overlap) {
      preview = {
        status: 'free_focus_overlap',
        message: overlap.message,
        free_focus_overlap: overlap,
        validation: validation(false, 'Open the closer look or confirm this as your beat action.'),
      };
    }
  }
  const runtimeConfig = await getWebActionRuntimeConfig(sceneView.campaign_instance_id);

  return {
    ...playerSafePreview(preview),
    action_window_id: String(windowCheck.actionWindowId),
    lifecycle_context: actionLifecycleContext(sceneView, windowCheck.actionWindowId),
    runtime_config: runtimeConfig,
    existing_submission: sceneView.action_status?.submitted_action ?? null,
  };
}

export async function submitWebAction(accountId, input = {}) {
  const sceneView = await getCharacterSceneView({
    accountId,
    includeDebug: false,
    includeMechanics: true,
  });
  const missingState = responseForMissingState(sceneView);
  if (missingState) {
    throw createHttpError(missingState.message, 409);
  }

  const dialogueConflict = await activeDialogueConflict(sceneView);
  if (dialogueConflict) {
    throw createHttpError(activeDialogueActionMessage(), 409);
  }

  const windowCheck = ensureWindowCanAccept(sceneView);
  if (!windowCheck.ok) {
    throw createHttpError(windowCheck.response.message, 409);
  }
  assertActionLifecycleContext(input, sceneView, windowCheck.actionWindowId);

  const runtimeConfig = await getWebActionRuntimeConfig(sceneView.campaign_instance_id);
  const basePreview = resolveActionIntent(input, sceneView);
  const continuedInteractionId = normalizeText(
    input.continue_free_focus_interaction_id ?? input.continueFreeFocusInteractionId
  );
  if (!continuedInteractionId) {
    const overlap = findFreeFocusOverlap({
      rawText: input.raw_text ?? input.rawText,
      selectedAffordanceId: input.selected_affordance_id ?? input.selectedAffordanceId,
      preview: basePreview,
      closerLooks: sceneView.scene_reference?.closer_looks ?? [],
    });
    if (overlap) {
      throw createHttpError('Open the available closer look or confirm this as your beat action.', 409);
    }
  }
  const preview = withCommittedFollowup(basePreview, input, sceneView);
  if (preview.status !== 'resolved' || preview.validation?.can_submit !== true) {
    throw createHttpError(preview.message ?? 'Action could not be submitted.', 400);
  }

  const stored = await storeWebActionSubmission({
    accountId,
    actionWindowId: windowCheck.actionWindowId,
    campaignId: Number(sceneView.campaign_instance_id),
    characterId: Number(sceneView.character_id),
    rawText:
      preview.raw_text ||
      normalizeText(input.raw_text ?? input.rawText) ||
      `${preview.candidate.verb} ${preview.candidate.target_label}`,
    candidate: preview.candidate,
    runtimeConfig,
  });
  const updatedScene = await getCharacterSceneView({
    accountId,
    includeDebug: false,
    includeMechanics: true,
  });

  return {
    status: stored.updated_existing ? 'updated' : 'submitted',
    action_window_id: String(windowCheck.actionWindowId),
    lifecycle_context: {
      action_window_id: String(windowCheck.actionWindowId),
      submission_version: Number(stored.submission?.version ?? 0),
    },
    submission: stored.submission,
    action_status: updatedScene.action_status,
    current_scene: updatedScene,
    runtime_config: runtimeConfig,
  };
}
