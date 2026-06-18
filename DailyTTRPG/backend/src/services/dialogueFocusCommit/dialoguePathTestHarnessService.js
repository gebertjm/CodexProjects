import { query } from '../../config/db.js';
import { validateDialogueFocusCommitScene } from '../../content/dialogueFocusCommitValidation.js';
import { createHttpError } from '../../utils/httpError.js';
import {
  createAnnotationCorrectionChainForAccount,
  createAnnotationLifecycleRecordForAccount,
  createCorrectionLifecycleRecordForAccount,
  reviewAnnotationCorrectionRecordForAccount,
} from './dialogueAnnotationCorrectionService.js';
import { getPlayerDialogueArchiveRecordForAccount } from './dialogueArchiveService.js';
import { ensureDialogueFocusCommitPersistenceSchema } from './dialogueFocusCommitPersistenceSchema.js';
import {
  getDialogueFocusCommitStateForAccount,
  getRegisteredDialogueFocusCommitSceneForDebug,
  previewCommittedSocialMoveForAccount,
  resolveClarifyingQuestionForAccount,
  resolveDialogueExitForAccount,
  submitCommittedSocialMoveForAccount,
} from './dialogueFocusCommitRuntimeService.js';
import { getDialogueDebugWorkspaceForAccount } from './dialogueDebugWorkspaceService.js';

const builtInModes = Object.freeze([
  'happy_path',
  'failure_path',
  'fallback_path',
  'minimal_interaction_path',
  'max_clarifying_question_path',
  'relationship_state_edge_case',
  'exit_transition_path',
  'validation_only',
  'all_authored_branches_smoke',
]);

const debugLeakPatterns = Object.freeze([
  'preview_mapping',
  'matched_move_confidence',
  'raw_runtime_state',
  'old_value_json',
  'new_value_json',
  'relationship_audit',
  'gm_dev_content_ref',
  'secret_requirement',
  'preview_confidence',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function idText(value) {
  return value === undefined || value === null ? null : String(value);
}

function itemId(item, keys) {
  for (const key of keys) {
    const value = cleanText(item?.[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function questionId(question) {
  return itemId(question, ['question_id', 'id', 'slug', 'key', 'interaction_id']);
}

function moveId(move) {
  return itemId(move, ['move_id', 'id', 'slug', 'key', 'interaction_id']);
}

function exitId(exit) {
  return itemId(exit, ['exit_id', 'id', 'slug', 'key', 'interaction_id']);
}

function sceneKey(scene) {
  return itemId(scene, ['id', 'slug', 'key', 'dialogue_scene_id']);
}

function textFrom(value) {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  const object = normalizeObject(value);
  return cleanText(
    object.text ??
      object.narration ??
      object.npc_response ??
      object.result_summary ??
      object.summary ??
      object.description ??
      object.label
  );
}

function addFinding(findings, severity, code, message, details = {}) {
  findings[severity].push({
    code,
    message,
    ...details,
  });
}

async function requireHarnessCapability(accountId, executor) {
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
    throw createHttpError('This account is not authorized to run dialogue path tests.', 403);
  }
}

function playerSnapshotFromState(state) {
  const sceneState = normalizeObject(state.dialogue_scene_state);
  return {
    state: state.state,
    dialogue_scene_id: state.dialogue_scene?.dialogue_scene_id ?? null,
    dialogue_scene_state_id: sceneState.dialogue_scene_state_id ?? null,
    transcript_id: sceneState.transcript_id ?? null,
    completed_dialogue_record_id: sceneState.completed_dialogue_record_id ?? null,
    committed_social_move_count: Number(sceneState.committed_social_move_count ?? 0),
    fallback_usage: normalizeObject(sceneState.fallback_usage),
    exit_result: sceneState.exit_result ?? null,
    transition: sceneState.transition ?? null,
    latest_development: state.latest_development ?? null,
    passive_social_insight: normalizeArray(state.passive_social_insight).map((insight) => ({
      insight_id: insight.insight_id,
      label: insight.label,
      visibility: insight.visibility,
    })),
    clarifying_questions: normalizeArray(state.clarifying_questions).map((question) => ({
      question_id: question.question_id,
      label: question.label,
      status: question.status,
      is_available: question.is_available === true,
      is_asked: question.is_asked === true,
      result_summary: question.result?.summary ?? question.result?.text ?? null,
    })),
    committed_social_moves: normalizeArray(state.committed_social_moves).map((move) => ({
      move_id: move.move_id,
      label: move.label,
      status: move.status,
      is_available: move.is_available === true,
      requires_check: move.requires_check === true,
      social_move_type: move.social_move_type,
      tone: move.tone,
    })),
    dialogue_exits: normalizeArray(state.dialogue_exits).map((exit) => ({
      exit_id: exit.exit_id,
      label: exit.label,
      status: exit.status,
      is_available: exit.is_available === true,
      transition: exit.transition ?? null,
    })),
  };
}

function relationshipRows(debugSnapshot) {
  const relationship = normalizeObject(debugSnapshot?.relationship_state);
  return [
    ...normalizeArray(relationship.persistent_npc_state).map((row) => ({
      layer: 'persistent_npc_state',
      key: `${row.npc_id ?? row.participant_id ?? 'npc'}:${row.field_name}`,
      value: row.value_json,
      row,
    })),
    ...normalizeArray(relationship.scene_local_state).map((row) => ({
      layer: row.scope ?? 'dialogue_scene_state',
      key: `${row.npc_id ?? row.participant_id ?? 'scene'}:${row.field_name}`,
      value: row.value_json,
      row,
    })),
  ];
}

function relationshipDiff(beforeDebug, afterDebug) {
  const before = new Map(relationshipRows(beforeDebug).map((entry) => [`${entry.layer}:${entry.key}`, entry]));
  const after = new Map(relationshipRows(afterDebug).map((entry) => [`${entry.layer}:${entry.key}`, entry]));
  const diffs = [];
  for (const [key, afterEntry] of after.entries()) {
    const beforeEntry = before.get(key);
    if (!beforeEntry || JSON.stringify(beforeEntry.value) !== JSON.stringify(afterEntry.value)) {
      diffs.push({
        key,
        layer: afterEntry.layer,
        field_name: afterEntry.row.field_name,
        npc_id: idText(afterEntry.row.npc_id),
        old_value: beforeEntry?.value ?? null,
        new_value: afterEntry.value,
        source: afterEntry.row.source_record_ref_json ?? null,
      });
    }
  }
  return diffs;
}

function transcriptEffects(beforeDebug, afterDebug) {
  const beforeTurns = normalizeArray(beforeDebug?.transcript?.turns);
  const afterTurns = normalizeArray(afterDebug?.transcript?.turns);
  const beforeIds = new Set(beforeTurns.map((turn) => idText(turn.turn_id ?? turn.id)));
  const newTurns = afterTurns.filter((turn) => !beforeIds.has(idText(turn.turn_id ?? turn.id)));
  return {
    before_turn_count: beforeTurns.length,
    after_turn_count: afterTurns.length,
    new_turns: newTurns.map((turn) => ({
      turn_id: idText(turn.turn_id ?? turn.id),
      turn_type: turn.turn_type,
      source_interaction_id: turn.source_interaction_id,
      summary: textFrom(turn.player_facing_content ?? turn.player_facing_content_json) || turn.turn_type,
      visibility_scope: turn.visibility_scope,
    })),
  };
}

function completedRecordEffects(beforeDebug, afterDebug) {
  const beforeRecord = normalizeObject(beforeDebug?.completed_record);
  const afterRecord = normalizeObject(afterDebug?.completed_record);
  if (!afterRecord.id && !afterRecord.completed_dialogue_record_id) {
    return null;
  }
  return {
    created: !beforeRecord.id && !beforeRecord.completed_dialogue_record_id,
    completed_dialogue_record_id: idText(afterRecord.id ?? afterRecord.completed_dialogue_record_id),
    compact_summary: afterRecord.compact_summary ?? null,
    transcript_id: idText(afterRecord.transcript_id),
  };
}

function checkPlayerFacingLeak(snapshot, findings, path) {
  const text = JSON.stringify(snapshot);
  for (const pattern of debugLeakPatterns) {
    if (text.includes(pattern)) {
      addFinding(findings, 'hard_errors', 'player_facing_debug_leak', `Player-facing snapshot contains debug-only field "${pattern}"`, {
        path,
      });
    }
  }
}

async function captureSnapshot(accountId, sceneId, { includeDebug = true, label = 'snapshot' } = {}) {
  const playerState = await getDialogueFocusCommitStateForAccount(accountId, { dialogue_scene_id: sceneId });
  const playerFacing = playerSnapshotFromState(playerState);
  const debug = includeDebug
    ? await getDialogueDebugWorkspaceForAccount(accountId, { dialogue_scene_id: sceneId }).catch((error) => ({
        status: 'debug_unavailable',
        message: error.message,
      }))
    : null;
  return {
    label,
    player_facing: playerFacing,
    gm_dev: debug,
  };
}

function availableQuestion(snapshot, preferredId = null) {
  const questions = normalizeArray(snapshot?.player_facing?.clarifying_questions);
  if (preferredId) {
    return questions.find((question) => question.question_id === preferredId) ?? null;
  }
  return questions.find((question) => question.is_available === true) ?? null;
}

function availableMove(snapshot, preferredId = null, { checked = null, noCheck = null } = {}) {
  const moves = normalizeArray(snapshot?.player_facing?.committed_social_moves);
  if (preferredId) {
    return moves.find((move) => move.move_id === preferredId) ?? null;
  }
  return (
    moves.find(
      (move) =>
        move.is_available === true &&
        (checked === null || move.requires_check === checked) &&
        (noCheck === null || move.requires_check !== noCheck)
    ) ??
    moves.find((move) => move.is_available === true) ??
    null
  );
}

function availableExit(snapshot, preferredId = null) {
  const exits = normalizeArray(snapshot?.player_facing?.dialogue_exits);
  if (preferredId) {
    return exits.find((exit) => exit.exit_id === preferredId) ?? null;
  }
  return exits.find((exit) => exit.is_available === true) ?? null;
}

function checkedQuestionId(scene) {
  return questionId(normalizeArray(scene.clarifying_questions).find((question) => question.requires_check === true) ?? {});
}

function checkedMoveId(scene) {
  return moveId(normalizeArray(scene.committed_social_moves).find((move) => move.requires_check === true) ?? {});
}

function noCheckMoveId(scene) {
  return moveId(normalizeArray(scene.committed_social_moves).find((move) => move.requires_check !== true) ?? {});
}

function firstExitId(scene) {
  return exitId(normalizeArray(scene.dialogue_exits ?? scene.exits).find(Boolean) ?? {});
}

function builtInPlan(mode, scene) {
  const firstQuestion = questionId(normalizeArray(scene.clarifying_questions).find(Boolean) ?? {});
  const firstMove = noCheckMoveId(scene) || moveId(normalizeArray(scene.committed_social_moves).find(Boolean) ?? {});
  const checkedQuestion = checkedQuestionId(scene);
  const checkedMove = checkedMoveId(scene);
  const exit = firstExitId(scene);
  switch (mode) {
    case 'validation_only':
      return [{ id: 'validate_scene', type: 'validation_only' }];
    case 'minimal_interaction_path':
      return [
        { id: 'enter', type: 'enter_dialogue' },
        ...(exit ? [{ id: 'exit', type: 'resolve_exit', exit_id: exit }] : []),
      ];
    case 'failure_path':
      return [
        { id: 'enter', type: 'enter_dialogue' },
        ...(checkedQuestion
          ? [{ id: 'checked_question_failure', type: 'ask_clarifying_question', question_id: checkedQuestion, forced_outcome: 'failure' }]
          : []),
        ...(checkedMove
          ? [
              { id: 'checked_move_preview', type: 'preview_committed_social_move', move_id: checkedMove, submitted_text: 'I press carefully for the truth.' },
              { id: 'checked_move_failure', type: 'submit_committed_social_move', move_id: checkedMove, submitted_text: 'I press carefully for the truth.', forced_outcome: 'failure' },
            ]
          : []),
        ...(exit ? [{ id: 'exit', type: 'resolve_exit', exit_id: exit }] : []),
      ];
    case 'fallback_path':
      return [
        { id: 'enter', type: 'enter_dialogue' },
        { id: 'fallback_preview', type: 'preview_committed_social_move', submitted_text: 'I ask about something not authored in this scene.' },
        { id: 'fallback_submit', type: 'use_generic_fallback', submitted_text: 'I ask about something not authored in this scene.' },
        { id: 'fallback_exhaustion_check', type: 'preview_committed_social_move', submitted_text: 'I ask another unauthored question.' },
      ];
    case 'max_clarifying_question_path':
      return [
        { id: 'enter', type: 'enter_dialogue' },
        { id: 'ask_all', type: 'ask_all_clarifying_questions' },
        ...(exit ? [{ id: 'exit', type: 'resolve_exit', exit_id: exit }] : []),
      ];
    case 'relationship_state_edge_case':
      return [
        { id: 'enter', type: 'enter_dialogue' },
        ...(checkedMove
          ? [{ id: 'relationship_move', type: 'submit_committed_social_move', move_id: checkedMove, submitted_text: 'I press gently about the shrine.', forced_outcome: 'success' }]
          : firstMove
            ? [{ id: 'relationship_move', type: 'submit_committed_social_move', move_id: firstMove, submitted_text: 'I listen without pressing.' }]
            : []),
        ...(exit ? [{ id: 'exit', type: 'resolve_exit', exit_id: exit }] : []),
      ];
    case 'exit_transition_path':
      return [
        { id: 'enter', type: 'enter_dialogue' },
        ...(exit ? [{ id: 'exit', type: 'resolve_exit', exit_id: exit }] : []),
      ];
    case 'all_authored_branches_smoke':
      return [
        { id: 'enter', type: 'enter_dialogue' },
        { id: 'preview_all_moves', type: 'preview_all_committed_social_moves' },
      ];
    case 'happy_path':
    default:
      return [
        { id: 'enter', type: 'enter_dialogue' },
        ...(firstQuestion ? [{ id: 'first_question', type: 'ask_clarifying_question', question_id: firstQuestion }] : []),
        ...(firstMove
          ? [
              { id: 'move_preview', type: 'preview_committed_social_move', move_id: firstMove, submitted_text: 'I listen without pressing.' },
              { id: 'move_submit', type: 'submit_committed_social_move', move_id: firstMove, submitted_text: 'I listen without pressing.', forced_outcome: 'success' },
            ]
          : []),
        ...(exit ? [{ id: 'exit', type: 'resolve_exit', exit_id: exit }] : []),
      ];
  }
}

function normalizePlan(input, scene) {
  const mode = cleanText(input.mode ?? input.test_mode ?? input.path_mode ?? 'happy_path') || 'happy_path';
  const steps = normalizeArray(input.steps).length > 0 ? normalizeArray(input.steps) : builtInPlan(mode, scene);
  return {
    mode,
    path_name: cleanText(input.path_name ?? input.name) || mode,
    steps: steps.map((step, index) => ({
      id: cleanText(step.id) || `step_${index + 1}`,
      type: cleanText(step.type),
      ...step,
    })),
  };
}

function stepInput(step, sceneId) {
  return {
    dialogue_scene_id: sceneId,
    question_id: step.question_id ?? step.interaction_id,
    move_id: step.move_id ?? step.interaction_id,
    exit_id: step.exit_id ?? step.interaction_id,
    submitted_text: step.submitted_text ?? step.text ?? step.raw_text,
    raw_text: step.raw_text ?? step.submitted_text ?? step.text,
    forced_outcome: step.forced_outcome,
    roll: step.roll,
    tone: step.tone,
    continue_as_committed_social_move: step.continue_as_committed_social_move === true,
  };
}

async function runLifecycleProbe(accountId, completedRecordId) {
  if (!completedRecordId) {
    return { skipped: true, reason: 'No completed dialogue record is available for lifecycle probe.' };
  }
  const chain = await createAnnotationCorrectionChainForAccount(accountId, {
    target_type: 'completed_dialogue_record',
    target_id: completedRecordId,
    chain_type: 'mixed',
  });
  const annotation = await createAnnotationLifecycleRecordForAccount(accountId, {
    chain_id: chain.chain.chain_id,
    record_type: 'suggestion',
    review_status: 'pending_review',
    lifecycle_status: 'draft',
    original_text: 'Harness pending note should stay GM/dev-only.',
    source_event_links: [{ source_type: 'completed_dialogue_summary' }],
    affected_surfaces: ['completed_dialogue_archive'],
  });
  const hiddenArchive = await getPlayerDialogueArchiveRecordForAccount(accountId, completedRecordId);
  const approved = await reviewAnnotationCorrectionRecordForAccount(accountId, {
    record_kind: 'annotation',
    record_id: annotation.record.record_id,
    action: 'approve_with_edits',
    edited_text: 'Harness approved note: the completed dialogue record gained a safe annotation.',
    player_facing: true,
  });
  const visibleArchive = await getPlayerDialogueArchiveRecordForAccount(accountId, completedRecordId);
  const rejectedCorrection = await createCorrectionLifecycleRecordForAccount(accountId, {
    chain_id: chain.chain.chain_id,
    record_type: 'generated_correction',
    review_status: 'generated',
    lifecycle_status: 'draft',
    original_text: 'Harness generated correction remains review-only.',
    source_event_links: [{ source_type: 'player_facing_transcript_turn' }],
  });
  await reviewAnnotationCorrectionRecordForAccount(accountId, {
    record_kind: 'correction',
    record_id: rejectedCorrection.record.record_id,
    action: 'reject',
    rejection_reason: 'Harness rejected non-material correction.',
  });
  return {
    chain_id: chain.chain.chain_id,
    pending_hidden_from_player:
      JSON.stringify(hiddenArchive).includes('Harness pending note should stay GM/dev-only.') === false,
    approved_visible_to_player:
      JSON.stringify(visibleArchive).includes('Harness approved note') === true,
    approved_record_id: approved.record.record_id,
    rejected_correction_id: rejectedCorrection.record.record_id,
  };
}

async function executeStep({ accountId, sceneId, scene, step, before, findings }) {
  const beforeSnapshot = before ?? (await captureSnapshot(accountId, sceneId, { label: `${step.id}:before` }));
  let result = null;
  let status = 'pass';
  let skippedReason = null;
  try {
    switch (step.type) {
      case 'validation_only': {
        const validation = validateDialogueFocusCommitScene(scene, {
          profile: scene.validation_metadata?.profile ?? 'playtest_ready',
        });
        result = { validation };
        break;
      }
      case 'enter_dialogue': {
        result = await getDialogueFocusCommitStateForAccount(accountId, { dialogue_scene_id: sceneId });
        break;
      }
      case 'ask_clarifying_question': {
        const question =
          availableQuestion(beforeSnapshot, cleanText(step.question_id ?? step.interaction_id)) ??
          availableQuestion(beforeSnapshot);
        if (!question) {
          status = 'skipped';
          skippedReason = 'No available Clarifying Question matched this step.';
          break;
        }
        result = await resolveClarifyingQuestionForAccount(accountId, {
          ...stepInput(step, sceneId),
          question_id: question.question_id,
        });
        break;
      }
      case 'ask_all_clarifying_questions': {
        const asked = [];
        let current = beforeSnapshot;
        for (let i = 0; i < 20; i += 1) {
          const question = availableQuestion(current);
          if (!question) {
            break;
          }
          const response = await resolveClarifyingQuestionForAccount(accountId, {
            dialogue_scene_id: sceneId,
            question_id: question.question_id,
            forced_outcome: step.forced_outcome,
          });
          asked.push({
            question_id: question.question_id,
            status: response.status,
            result: response.clarifying_question_result,
          });
          current = await captureSnapshot(accountId, sceneId, { label: `${step.id}:loop_${i + 1}` });
        }
        result = { asked };
        break;
      }
      case 'preview_committed_social_move': {
        const requestedMoveId = cleanText(step.move_id ?? step.interaction_id);
        const move = requestedMoveId ? availableMove(beforeSnapshot, requestedMoveId) : null;
        result = await previewCommittedSocialMoveForAccount(accountId, {
          ...stepInput(step, sceneId),
          move_id: move?.move_id ?? step.move_id,
        });
        break;
      }
      case 'preview_all_committed_social_moves': {
        const previews = [];
        for (const move of normalizeArray(beforeSnapshot.player_facing.committed_social_moves).filter((item) => item.is_available)) {
          previews.push(
            await previewCommittedSocialMoveForAccount(accountId, {
              dialogue_scene_id: sceneId,
              move_id: move.move_id,
              submitted_text: move.label,
            })
          );
        }
        result = { previews };
        break;
      }
      case 'submit_committed_social_move': {
        const requestedMoveId = cleanText(step.move_id ?? step.interaction_id);
        const move = requestedMoveId
          ? availableMove(beforeSnapshot, requestedMoveId, {
              checked: step.prefer_checked === true ? true : null,
            })
          : null;
        if (!move && !step.submitted_text) {
          status = 'skipped';
          skippedReason = 'No available Committed Social Move matched this step.';
          break;
        }
        result = await submitCommittedSocialMoveForAccount(accountId, {
          ...stepInput(step, sceneId),
          move_id: move?.move_id ?? step.move_id,
        });
        break;
      }
      case 'use_generic_fallback': {
        result = await submitCommittedSocialMoveForAccount(accountId, {
          dialogue_scene_id: sceneId,
          submitted_text: cleanText(step.submitted_text) || 'I ask an unauthored fallback question.',
          forced_outcome: step.forced_outcome,
        });
        break;
      }
      case 'resolve_exit': {
        const exit = availableExit(beforeSnapshot, cleanText(step.exit_id ?? step.interaction_id)) ?? availableExit(beforeSnapshot);
        if (!exit) {
          status = 'skipped';
          skippedReason = 'No available authored Dialogue Exit matched this step.';
          break;
        }
        result = await resolveDialogueExitForAccount(accountId, {
          ...stepInput(step, sceneId),
          exit_id: exit.exit_id,
        });
        break;
      }
      case 'simulate_lifecycle_probe': {
        const completedRecordId = beforeSnapshot.player_facing.completed_dialogue_record_id;
        result = await runLifecycleProbe(accountId, completedRecordId);
        break;
      }
      case 'assert_state':
      case 'assert_availability':
      case 'assert_visibility':
      case 'assert_transition':
      case 'finalize_dialogue':
      case 'force_check_outcome':
      case 'apply_tone_variant': {
        result = {
          note: `${step.type} is represented by adjacent runtime steps in this MVP harness.`,
          requested: step,
        };
        break;
      }
      default:
        status = step.continue_on_warning === true ? 'warning' : 'skipped';
        skippedReason = `Unsupported simulation step type: ${step.type}`;
    }
  } catch (error) {
    status = step.continue_on_warning === true ? 'warning' : 'fail';
    result = {
      error: error.message,
      status_code: error.statusCode ?? 500,
    };
  }

  const afterSnapshot = await captureSnapshot(accountId, sceneId, { label: `${step.id}:after` });
  const relationship_diffs = relationshipDiff(beforeSnapshot.gm_dev, afterSnapshot.gm_dev);
  const transcript_effects = transcriptEffects(beforeSnapshot.gm_dev, afterSnapshot.gm_dev);
  const completed_record_effect = completedRecordEffects(beforeSnapshot.gm_dev, afterSnapshot.gm_dev);
  checkPlayerFacingLeak(afterSnapshot.player_facing, findings, `steps.${step.id}.player_facing`);
  if (step.type === 'ask_clarifying_question' && result?.current_dialogue) {
    const beforeCount = Number(beforeSnapshot.player_facing.committed_social_move_count ?? 0);
    const afterCount = Number(afterSnapshot.player_facing.committed_social_move_count ?? 0);
    if (afterCount !== beforeCount) {
      addFinding(findings, 'hard_errors', 'clarifying_question_spent_beat', 'Clarifying Question changed committed social move count.', {
        step_id: step.id,
      });
    }
  }
  return {
    step_id: step.id,
    type: step.type,
    status,
    skipped_reason: skippedReason,
    result: safeClone(result),
    player_facing_snapshot: afterSnapshot.player_facing,
    gm_dev_snapshot: {
      status: afterSnapshot.gm_dev?.status,
      scene_state: afterSnapshot.gm_dev?.scene_state,
      preview_mapping: afterSnapshot.gm_dev?.preview_mapping,
      validation: afterSnapshot.gm_dev?.validation,
    },
    relationship_diffs,
    transcript_effects,
    completed_record_effect,
    after: afterSnapshot,
  };
}

function reachabilityFindings({ scene, validation, finalSnapshot, findings }) {
  if (normalizeArray(validation.hard_errors).length > 0) {
    addFinding(findings, 'hard_errors', 'hard_validation_errors', 'Dialogue scene has hard validation errors.', {
      count: validation.hard_errors.length,
    });
  }
  if (normalizeArray(scene.dialogue_exits ?? scene.exits).length === 0) {
    addFinding(findings, 'warnings', 'no_reachable_exit', 'No authored Dialogue Exit is present.');
  }
  if (normalizeArray(scene.committed_social_moves).length === 0 && normalizeArray(scene.dialogue_exits ?? scene.exits).length === 0) {
    addFinding(findings, 'hard_errors', 'dialogue_stuck_state', 'No authored committed moves or exits are available.');
  }
  const finalState = finalSnapshot?.player_facing;
  if (
    finalState?.state === 'active' &&
    normalizeArray(finalState.committed_social_moves).every((move) => move.is_available !== true) &&
    normalizeArray(finalState.dialogue_exits).every((exit) => exit.is_available !== true)
  ) {
    addFinding(findings, 'warnings', 'active_state_without_options', 'Final active state has no available committed moves or exits.');
  }
}

export function dialoguePathTestModes() {
  return builtInModes.map((mode) => ({
    mode,
    label: mode.replaceAll('_', ' '),
  }));
}

export async function runDialoguePathTestForAccount(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  await requireHarnessCapability(accountId, executor);
  const sceneId = cleanText(input.dialogue_scene_id ?? input.dialogueSceneId ?? input.scene_key);
  if (!sceneId) {
    throw createHttpError('dialogue_scene_id is required for dialogue path tests', 400);
  }
  const scene = getRegisteredDialogueFocusCommitSceneForDebug({ dialogue_scene_id: sceneId });
  if (!scene) {
    throw createHttpError('Dialogue scene is not registered for path testing', 404);
  }
  const validation = validateDialogueFocusCommitScene(scene, {
    profile: scene.validation_metadata?.profile ?? 'playtest_ready',
  });
  const plan = normalizePlan(input, scene);
  const findings = {
    hard_errors: [],
    warnings: [],
    debug_notices: [],
  };
  if (input.allow_active_runtime_mutation !== true && plan.mode !== 'validation_only') {
    addFinding(
      findings,
      'warnings',
      'active_runtime_mutation_required',
      'This harness run uses real dialogue runtime services and mutates the current GM/dev test context. Pass allow_active_runtime_mutation=true to acknowledge this explicitly.'
    );
    throw createHttpError('Dialogue path tests mutate the active test context; set allow_active_runtime_mutation=true.', 409);
  }

  const testRunId = `dialogue_path_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const steps = [];
  let snapshot = plan.mode === 'validation_only'
    ? null
    : await captureSnapshot(accountId, sceneId, { label: 'initial' });
  if (snapshot) {
    checkPlayerFacingLeak(snapshot.player_facing, findings, 'initial.player_facing');
  }

  if (plan.mode === 'validation_only') {
    steps.push({
      step_id: 'validate_scene',
      type: 'validation_only',
      status: validation.ok ? 'pass' : 'fail',
      result: { validation },
      player_facing_snapshot: null,
      gm_dev_snapshot: null,
      relationship_diffs: [],
      transcript_effects: { before_turn_count: 0, after_turn_count: 0, new_turns: [] },
      completed_record_effect: null,
    });
  } else {
    for (const step of plan.steps) {
      const executed = await executeStep({
        accountId,
        sceneId,
        scene,
        step,
        before: snapshot,
        findings,
      });
      steps.push({
        step_id: executed.step_id,
        type: executed.type,
        status: executed.status,
        skipped_reason: executed.skipped_reason,
        result: executed.result,
        player_facing_snapshot: executed.player_facing_snapshot,
        gm_dev_snapshot: executed.gm_dev_snapshot,
        relationship_diffs: executed.relationship_diffs,
        transcript_effects: executed.transcript_effects,
        completed_record_effect: executed.completed_record_effect,
      });
      snapshot = executed.after;
      if (executed.status === 'fail' && step.continue_on_warning !== true) {
        break;
      }
    }
  }

  reachabilityFindings({ scene, validation, finalSnapshot: snapshot, findings });
  const failedStep = steps.find((step) => step.status === 'fail');
  const status =
    normalizeArray(findings.hard_errors).length > 0 || failedStep
      ? 'failed'
      : normalizeArray(findings.warnings).length > 0
        ? 'warning'
        : 'passed';
  return {
    test_run_id: testRunId,
    status,
    path_mode: plan.mode,
    path_name: plan.path_name,
    dialogue_scene_id: sceneKey(scene),
    built_in_modes: dialoguePathTestModes(),
    used_real_runtime_services: true,
    mutates_active_context: plan.mode !== 'validation_only',
    validation,
    steps,
    final_status: snapshot?.player_facing?.state ?? (validation.ok ? 'validated' : 'invalid'),
    final_transition:
      snapshot?.player_facing?.transition ??
      snapshot?.player_facing?.dialogue_exits?.find((exit) => exit.status === 'resolved')?.transition ??
      null,
    findings,
  };
}
