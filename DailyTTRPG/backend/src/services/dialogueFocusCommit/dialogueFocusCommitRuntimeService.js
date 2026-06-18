import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, withTransaction } from '../../config/db.js';
import { validateDialogueFocusCommitScene } from '../../content/dialogueFocusCommitValidation.js';
import { resolveNarrativeSkillCheck } from '../../engine/narrative/narrativeEngine.js';
import { createHttpError } from '../../utils/httpError.js';
import { applyAdventureOutcome } from '../adventureProgressionService.js';
import { getCharacterRules } from '../characterRulesService.js';
import { grantKnowledge } from '../characterKnowledgeService.js';
import {
  appendDialogueTranscriptTurn,
  ensureDialogueTranscriptForRuntime,
  finalizeDialogueArchive,
} from './dialogueArchiveService.js';
import { ensureDialogueFocusCommitPersistenceSchema } from './dialogueFocusCommitPersistenceSchema.js';
import {
  applyRelationshipStateWrites,
  evaluateRelationshipReadConditions,
  initializeDialogueRelationshipState,
} from './dialogueRelationshipStateService.js';

const runtimeStateFieldName = '__runtime_state__';
const shallowClarifyingVerbs = /\b(ask|question|clarify|remember|watch|look|listen|tell|explain)\b/i;
const validCheckVisibilities = new Set(['visible', 'hidden', 'success_only', 'narrative_only']);

const dialogueSceneRegistry = new Map();
const bundledDialogueSceneDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../content/dialogue_focus_commit/greyvale'
);
let bundledDialogueScenesLoaded = false;

function json(value) {
  return JSON.stringify(value ?? {});
}

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

function slugText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCase(value) {
  return cleanText(value)
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function sceneKey(scene) {
  return itemId(scene, ['id', 'slug', 'key', 'dialogue_scene_id']);
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

const playerExitIdAliases = new Map([
  ['exit_rusk_combat_pending', 'exit_rusk_confrontation'],
]);
const internalExitIdAliases = new Map(
  [...playerExitIdAliases.entries()].map(([internalId, publicId]) => [publicId, internalId])
);

function exitIdForPlayer(id) {
  return playerExitIdAliases.get(cleanText(id)) ?? cleanText(id);
}

function exitIdFromPlayerInput(id) {
  return internalExitIdAliases.get(cleanText(id)) ?? cleanText(id);
}

function exitResultForPlayer(exitResult) {
  const normalized = normalizeObject(exitResult);
  if (!Object.keys(normalized).length) {
    return null;
  }
  return {
    ...normalized,
    exit_id: exitIdForPlayer(normalized.exit_id),
  };
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

function summaryFrom(value) {
  const object = normalizeObject(value);
  return cleanText(object.result_summary ?? object.summary ?? object.text ?? object.npc_response);
}

function idsFrom(items, idKeys = ['id', 'key', 'question_id', 'move_id']) {
  return normalizeArray(items)
    .map((entry) => (typeof entry === 'string' ? cleanText(entry) : itemId(entry, idKeys)))
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(normalizeArray(values).map(cleanText).filter(Boolean))];
}

function normalizeCheckVisibility(value, fallback = 'visible') {
  const normalized = cleanText(value).toLowerCase();
  return validCheckVisibilities.has(normalized) ? normalized : fallback;
}

function checkDefinition(owner, defaultVisibility = 'visible') {
  const check = normalizeObject(owner?.check);
  if (owner?.requires_check !== true && Object.keys(check).length === 0) {
    return null;
  }
  const skill = cleanText(check.skill ?? owner.skill).toLowerCase().replaceAll('_', '-');
  const ability = cleanText(check.ability ?? owner.ability).toLowerCase();
  const dc = Number(check.dc ?? check.difficulty_class ?? owner.dc ?? owner.difficulty_class);
  return {
    mode: cleanText(check.mode ?? owner.check_mode ?? 'standard').toLowerCase(),
    ability,
    skill,
    dc,
    visibility: normalizeCheckVisibility(check.visibility ?? owner.check_visibility, defaultVisibility),
  };
}

function safeCheckPreview(check) {
  if (!check) {
    return {
      has_check: false,
    };
  }
  const label = `${titleCase(check.skill)} check`;
  return {
    has_check: true,
    label: check.visibility === 'hidden' ? null : label,
    visibility: check.visibility,
    dc_visible: false,
  };
}

function publicCheckResult(checkResult) {
  if (!checkResult) {
    return null;
  }
  const visibility = checkResult.check_visibility ?? 'visible';
  if (visibility === 'hidden') {
    return null;
  }
  if (visibility === 'success_only' && checkResult.was_success !== true) {
    return null;
  }
  return {
    skill: checkResult.skill?.slug ?? checkResult.skill_slug ?? null,
    label: checkResult.mechanics_label ?? null,
    outcome: checkResult.was_success === true ? 'success' : 'failure',
    visibility,
  };
}

function mechanicsLabel(checkResult) {
  if (!checkResult) {
    return null;
  }
  const visibility = checkResult.check_visibility ?? 'visible';
  if (visibility === 'hidden' || visibility === 'narrative_only') {
    return null;
  }
  if (visibility === 'success_only' && checkResult.was_success !== true) {
    return null;
  }
  return `${titleCase(checkResult.skill?.slug ?? checkResult.skill_slug)} check: ${
    checkResult.was_success ? 'success' : 'failure'
  }`;
}

function skillDefinition(check) {
  if (!check?.skill || !Number.isFinite(check.dc)) {
    throw createHttpError('This dialogue check is missing skill or DC metadata', 409);
  }
  return {
    skill: {
      slug: check.skill,
      name: titleCase(check.skill),
    },
    difficulty_class: check.dc,
  };
}

function forcedCheckResult(check, forcedOutcome) {
  const success = cleanText(forcedOutcome).toLowerCase() === 'success';
  return {
    skill: {
      slug: check.skill,
      name: titleCase(check.skill),
    },
    skill_slug: check.skill,
    difficulty_class: check.dc,
    roll_value: success ? 20 : 1,
    total_value: success ? check.dc : Math.max(0, check.dc - 1),
    was_success: success,
    check_mode: check.mode === 'active' ? 'standard' : check.mode,
    check_visibility: check.visibility,
    forced: true,
  };
}

async function resolveCheck({ owner, context, forcedOutcome = null, rollOverride = null }) {
  const check = checkDefinition(
    owner,
    owner?.resolution_mode === 'passive_social_insight' ? 'success_only' : 'visible'
  );
  if (!check) {
    return null;
  }

  if (['success', 'failure'].includes(cleanText(forcedOutcome).toLowerCase())) {
    const result = forcedCheckResult(check, forcedOutcome);
    return {
      ...result,
      mechanics_label: mechanicsLabel(result),
    };
  }

  const characterRules = await getCharacterRules(context.characterId);
  const mode = check.mode === 'active' ? 'standard' : check.mode;
  const input =
    mode === 'passive'
      ? { roll: 10 }
      : mode === 'take_20'
        ? { roll: 20 }
        : { roll: Array.isArray(rollOverride) ? rollOverride[0] : rollOverride };
  const result = resolveNarrativeSkillCheck(skillDefinition(check), characterRules, input);
  const withMetadata = {
    ...result,
    check_mode: mode,
    check_visibility: check.visibility,
  };
  return {
    ...withMetadata,
    mechanics_label: mechanicsLabel(withMetadata),
  };
}

function outcomeFor(owner, checkResult = null) {
  if (!checkResult) {
    const branch =
      normalizeObject(owner.no_check_result).text || normalizeObject(owner.no_check_result).npc_response
        ? normalizeObject(owner.no_check_result)
        : normalizeObject(owner.result).text || normalizeObject(owner.result).npc_response
          ? normalizeObject(owner.result)
          : normalizeObject(normalizeArray(owner.variants)[0]?.result ?? normalizeArray(owner.variants)[0]);
    return {
      branch: 'no_check',
      was_success: true,
      text: textFrom(branch) || 'The exchange does not reveal anything more yet.',
      summary: summaryFrom(branch) || null,
      knowledge_grants: normalizeArray(branch.knowledge_grants ?? owner.knowledge_grants),
      objective_updates: normalizeArray(branch.objective_updates ?? owner.objective_updates),
      character_flags: branch.character_flags ?? owner.character_flags,
      campaign_flags: normalizeObject(branch.campaign_flags ?? owner.campaign_flags),
      rewards: normalizeArray(branch.rewards ?? owner.rewards),
      canonical_output_links: normalizeArray(branch.canonical_output_links ?? owner.canonical_output_links),
      state_changes: normalizeArray(branch.state_changes ?? owner.state_changes),
      relationship_writes: [
        ...normalizeArray(branch.relationship_writes ?? owner.relationship_writes),
        ...normalizeArray(branch.relationship_state_writes ?? owner.relationship_state_writes),
        ...normalizeArray(branch.social_state_writes ?? owner.social_state_writes),
      ],
      unlocks: branch.unlocks ?? owner.unlocks,
      locks: branch.locks ?? owner.locks,
      exit: branch.exit ?? branch.dialogue_exit ?? owner.exit ?? owner.dialogue_exit ?? null,
      transition: branch.transition ?? owner.transition ?? null,
    };
  }

  const branch = normalizeObject(checkResult.was_success ? owner.on_success : owner.on_failure);
  return {
    branch: checkResult.was_success ? 'success' : 'failure',
    was_success: checkResult.was_success === true,
    text:
      textFrom(branch) ||
      (checkResult.was_success
        ? 'The committed move lands as intended.'
        : 'The committed move does not land as intended.'),
    summary: summaryFrom(branch) || null,
    knowledge_grants: normalizeArray(branch.knowledge_grants ?? owner.knowledge_grants),
    objective_updates: normalizeArray(branch.objective_updates ?? owner.objective_updates),
    character_flags: branch.character_flags ?? owner.character_flags,
    campaign_flags: normalizeObject(branch.campaign_flags ?? owner.campaign_flags),
    rewards: normalizeArray(branch.rewards ?? owner.rewards),
    canonical_output_links: normalizeArray(branch.canonical_output_links ?? owner.canonical_output_links),
    state_changes: normalizeArray(branch.state_changes ?? owner.state_changes),
    relationship_writes: [
      ...normalizeArray(branch.relationship_writes ?? owner.relationship_writes),
      ...normalizeArray(branch.relationship_state_writes ?? owner.relationship_state_writes),
      ...normalizeArray(branch.social_state_writes ?? owner.social_state_writes),
    ],
    unlocks: branch.unlocks ?? owner.unlocks,
    locks: branch.locks ?? owner.locks,
    exit: branch.exit ?? branch.dialogue_exit ?? owner.exit ?? owner.dialogue_exit ?? null,
    transition: branch.transition ?? owner.transition ?? null,
  };
}

function collectUnlocks(value, scene) {
  const object = normalizeObject(value);
  const rawQuestions = [
    ...idsFrom(object.clarifying_questions, ['question_id', 'id', 'key']),
    ...idsFrom(object.questions, ['question_id', 'id', 'key']),
    ...idsFrom(object.unlock_clarifying_questions, ['question_id', 'id', 'key']),
  ];
  const rawMoves = [
    ...idsFrom(object.committed_social_moves, ['move_id', 'id', 'key']),
    ...idsFrom(object.moves, ['move_id', 'id', 'key']),
    ...idsFrom(object.unlock_committed_social_moves, ['move_id', 'id', 'key']),
  ];
  const loose = idsFrom(Array.isArray(value) ? value : object.unlocks);
  const questionIds = new Set(normalizeArray(scene.clarifying_questions).map(questionId));
  const moveIds = new Set(normalizeArray(scene.committed_social_moves).map(moveId));
  for (const id of loose) {
    if (questionIds.has(id)) {
      rawQuestions.push(id);
    }
    if (moveIds.has(id)) {
      rawMoves.push(id);
    }
  }
  return {
    clarifying_question_ids: unique(rawQuestions),
    committed_social_move_ids: unique(rawMoves),
  };
}

function collectLocks(value, scene) {
  const object = normalizeObject(value);
  const loose = idsFrom(Array.isArray(value) ? value : object.locks);
  const questionIds = new Set(normalizeArray(scene.clarifying_questions).map(questionId));
  const moveIds = new Set(normalizeArray(scene.committed_social_moves).map(moveId));
  return {
    clarifying_question_ids: unique([
      ...idsFrom(object.clarifying_questions, ['question_id', 'id', 'key']),
      ...idsFrom(object.lock_clarifying_questions, ['question_id', 'id', 'key']),
      ...loose.filter((id) => questionIds.has(id)),
    ]),
    committed_social_move_ids: unique([
      ...idsFrom(object.committed_social_moves, ['move_id', 'id', 'key']),
      ...idsFrom(object.lock_committed_social_moves, ['move_id', 'id', 'key']),
      ...loose.filter((id) => moveIds.has(id)),
    ]),
  };
}

function registerAliases(registry, scene) {
  const keys = [
    scene.id,
    scene.slug,
    scene.key,
    scene.dialogue_scene_id,
    scene.title,
    scene.name,
  ]
    .map(slugText)
    .filter(Boolean);
  for (const key of keys) {
    registry.set(key, safeClone(scene));
  }
}

function uniqueRegisteredScenes() {
  const seen = new Set();
  const scenes = [];
  for (const scene of dialogueSceneRegistry.values()) {
    const key = sceneKey(scene);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    scenes.push(scene);
  }
  return scenes;
}

function loadBundledDialogueFocusCommitScenes() {
  if (bundledDialogueScenesLoaded) {
    return;
  }
  bundledDialogueScenesLoaded = true;
  if (!fs.existsSync(bundledDialogueSceneDirectory)) {
    return;
  }
  const files = fs
    .readdirSync(bundledDialogueSceneDirectory)
    .filter((fileName) => fileName.endsWith('.scene.json'))
    .sort();
  for (const fileName of files) {
    try {
      const scene = JSON.parse(
        fs.readFileSync(path.join(bundledDialogueSceneDirectory, fileName), 'utf8')
      );
      if (sceneKey(scene)) {
        registerAliases(dialogueSceneRegistry, scene);
      }
    } catch {
      // Validation handles malformed scenes when requested; a bad bundled file
      // should not prevent the rest of the registry from loading.
    }
  }
}

function participantNpcKeys(scene) {
  return normalizeArray(scene?.participants)
    .flatMap((participant) => [
      participant?.npc_key,
      participant?.npc_id,
      participant?.npc_template_slug,
      String(participant?.participant_id ?? '').replace(/^npc:/, ''),
      participant?.known_label,
      participant?.unknown_label,
      participant?.label,
      ...normalizeArray(participant?.aliases),
    ])
    .map(cleanText)
    .filter(Boolean);
}

export function registerDialogueFocusCommitSceneForTests(scene) {
  registerAliases(dialogueSceneRegistry, scene);
}

export function clearDialogueFocusCommitSceneRegistryForTests() {
  dialogueSceneRegistry.clear();
  bundledDialogueScenesLoaded = false;
}

export function listRegisteredDialogueFocusCommitSceneKeysForTests() {
  return [...dialogueSceneRegistry.keys()].sort();
}

export function getRegisteredDialogueFocusCommitSceneForDebug(input = {}) {
  return resolveSceneFromRegistry(input);
}

export function getDialogueFocusCommitEntryForNpc(npcKey) {
  const requested = cleanText(npcKey);
  if (!requested) {
    return null;
  }
  loadBundledDialogueFocusCommitScenes();
  const requestedKey = slugText(requested);
  const scenes = uniqueRegisteredScenes();
  let scene = scenes.find((candidate) =>
    participantNpcKeys(candidate).some((key) => slugText(key) === requestedKey)
  );
  if (!scene && requestedKey.length >= 4) {
    const partialMatches = scenes.filter((candidate) =>
      participantNpcKeys(candidate).some((key) => {
        const candidateKey = slugText(key);
        return (
          candidateKey.length >= 4 &&
          (candidateKey.startsWith(requestedKey) ||
            requestedKey.startsWith(candidateKey))
        );
      })
    );
    scene = partialMatches.length === 1 ? partialMatches[0] : null;
  }
  if (!scene) {
    return null;
  }
  return {
    dialogue_scene_id: sceneKey(scene),
    dialogue_scene_slug: cleanText(scene.slug),
    dialogue_title: cleanText(scene.title ?? scene.name) || titleCase(sceneKey(scene)),
  };
}

function resolveSceneFromRegistry(input = {}) {
  const requested =
    cleanText(input.dialogue_scene_id ?? input.dialogueSceneId ?? input.scene_key ?? input.slug) ||
    cleanText(input.scene_id);
  if (!requested) {
    return null;
  }
  let scene = dialogueSceneRegistry.get(slugText(requested)) ?? null;
  if (!scene) {
    loadBundledDialogueFocusCommitScenes();
    scene = dialogueSceneRegistry.get(slugText(requested)) ?? null;
  }
  return safeClone(scene);
}

function validationFailure(scene, validation) {
  return {
    state: 'invalid_dialogue_scene',
    dialogue_scene_id: scene ? sceneKey(scene) : null,
    validation: {
      ok: false,
      hard_errors: validation.hard_errors,
      warnings: validation.warnings,
      debug_notices: validation.debug_notices,
      errors: validation.errors,
    },
  };
}

async function resolveActiveDialogueContext(accountId, executor = { query }) {
  const accountResult = await executor.query(
    `
      SELECT id, active_character_id, COALESCE(can_advance_beats, FALSE) AS can_advance_beats
      FROM account
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );
  const account = accountResult.rows[0] ?? null;
  if (!account) {
    throw createHttpError('Account not found', 404);
  }
  if (!account.active_character_id) {
    return { state: 'no_active_character', account };
  }

  const result = await executor.query(
    `
      SELECT
        character.id AS character_id,
        character.name AS character_name,
        character.level,
        character.status AS character_status,
        membership.id AS membership_id,
        membership.campaign_id,
        membership.current_scene_id,
        campaign.name AS campaign_name,
        campaign.slug AS campaign_slug,
        campaign.world_id,
        campaign.world_instance_id,
        world.slug AS world_slug,
        world.name AS world_name
      FROM dnd5e_character character
      LEFT JOIN dnd5e_campaign_character membership
        ON membership.character_id = character.id
        AND membership.membership_status = 'active'
        AND membership.is_active = TRUE
      LEFT JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      LEFT JOIN dnd5e_world world ON world.id = campaign.world_id
      WHERE character.id = $1
        AND character.account_id = $2
        AND character.is_active = TRUE
      ORDER BY membership.is_active_context DESC,
        membership.is_default_solo_campaign DESC,
        membership.joined_at DESC NULLS LAST,
        membership.id DESC
      LIMIT 1
    `,
    [account.active_character_id, accountId]
  );

  const row = result.rows[0] ?? null;
  if (!row) {
    return { state: 'no_active_character', account };
  }
  if (!row.campaign_id) {
    return {
      state: 'no_active_campaign',
      account,
      character: row,
    };
  }
  return {
    state: 'active',
    account,
    character: row,
    campaign: row,
  };
}

function initialRuntimeState(scene, context) {
  return {
    status: 'active',
    dialogue_scene_id: sceneKey(scene),
    dialogue_scene_title: cleanText(scene.title ?? scene.name),
    participants: normalizeArray(scene.participants),
    entry_source: normalizeObject(scene.entry_behavior),
    committed_social_move_count: 0,
    soft_target_max: Number(scene.soft_target_max ?? scene.committed_social_move_budget?.soft_target_max ?? 3),
    latest_development: null,
    asked_question_ids: [],
    attempted_question_ids: [],
    succeeded_question_ids: [],
    failed_question_ids: [],
    locked_question_ids: [],
    locked_move_ids: [],
    unlocked_question_ids: [],
    unlocked_move_ids: [],
    fallback_usage: {
      used_count: 0,
      failed_count: 0,
      exhausted: false,
    },
    exit_result: null,
    transition: null,
    created_for: {
      campaign_id: String(context.campaign.campaign_id),
      character_id: String(context.character.character_id),
    },
  };
}

async function getOrCreateRuntimeState({ context, scene, executor }) {
  const key = sceneKey(scene);
  const existing = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_scene_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND dialogue_scene_key = $3
        AND dialogue_session_id IS NULL
        AND npc_id IS NULL
        AND participant_id IS NULL
        AND field_name = $4
        AND scope = 'dialogue_scene_state'
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [context.campaign.campaign_id, context.character.character_id, key, runtimeStateFieldName]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const inserted = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_scene_state (
        campaign_id,
        world_instance_id,
        character_id,
        dialogue_scene_key,
        scene_id,
        field_name,
        value_json,
        scope,
        source_record_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'dialogue_scene_state', 'dialogue_focus_commit_runtime')
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.campaign.world_instance_id,
      context.character.character_id,
      key,
      context.campaign.current_scene_id ?? null,
      runtimeStateFieldName,
      json(initialRuntimeState(scene, context)),
    ]
  );
  return inserted.rows[0];
}

async function updateRuntimeState(rowId, state, executor) {
  const result = await executor.query(
    `
      UPDATE dnd5e_dialogue_scene_state
      SET value_json = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [rowId, json(state)]
  );
  return result.rows[0];
}

async function loadQuestionRecord(stateRow, id, executor) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_clarifying_question_record
      WHERE dialogue_scene_state_id = $1
        AND clarifying_question_id = $2
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [stateRow.id, id]
  );
  return result.rows[0] ?? null;
}

async function insertQuestionRecord({ context, stateRow, scene, question, status, result, checkResult }, executor) {
  const id = questionId(question);
  const inserted = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_clarifying_question_record (
        campaign_id,
        world_instance_id,
        character_id,
        dialogue_scene_state_id,
        dialogue_scene_key,
        scene_id,
        clarifying_question_id,
        target_id,
        status,
        persisted_result_json,
        check_result_json,
        check_visibility,
        asked_at,
        attempted_at,
        resolved_at,
        unlocked_by_json,
        canonical_output_links_json,
        knowledge_links_json,
        retry_state_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, NOW(), NOW(), NOW(), $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb)
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.campaign.world_instance_id,
      context.character.character_id,
      stateRow.id,
      sceneKey(scene),
      context.campaign.current_scene_id ?? null,
      id,
      cleanText(question.target_id) || null,
      status,
      json(result),
      json(checkResult ?? {}),
      checkResult?.check_visibility ?? checkDefinition(question)?.visibility ?? 'visible',
      json(result.unlocks ?? []),
      json(result.canonical_output_links ?? []),
      json(result.knowledge_links ?? []),
      json(question.retry_policy ?? {}),
    ]
  );
  return inserted.rows[0];
}

async function insertSocialMoveRecord({ context, stateRow, scene, move, submittedText, preview, result, checkResult, isFallback }, executor) {
  const inserted = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_social_move_record (
        campaign_id,
        world_instance_id,
        character_id,
        dialogue_scene_state_id,
        dialogue_scene_key,
        scene_id,
        committed_social_move_id,
        generic_fallback_id,
        social_move_type,
        social_tags_json,
        tone_metadata_json,
        submitted_text,
        preview_metadata_json,
        preview_debug_json,
        matched_move_confidence,
        requires_check,
        check_result_json,
        check_visibility,
        result_branch,
        result_text,
        latest_development,
        canonical_output_links_json,
        knowledge_links_json,
        relationship_audit_links_json,
        exit_transition_ref_json,
        visibility_scope,
        status,
        resolved_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13::jsonb, '{}'::jsonb, $14, $15, $16::jsonb, $17, $18, $19, $20, $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, 'player', 'resolved', NOW())
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.campaign.world_instance_id,
      context.character.character_id,
      stateRow.id,
      sceneKey(scene),
      context.campaign.current_scene_id ?? null,
      isFallback ? null : moveId(move),
      isFallback ? cleanText(move.fallback_policy_id ?? move.id ?? 'default') : null,
      cleanText(move.social_move_type) || 'ask',
      json(normalizeArray(move.social_tags)),
      json({ tone: cleanText(move.tone), target_id: cleanText(move.target_id) || null }),
      cleanText(submittedText) || null,
      json(preview),
      preview?.confidence ?? null,
      move.requires_check === true,
      json(checkResult ?? {}),
      checkResult?.check_visibility ?? checkDefinition(move)?.visibility ?? 'visible',
      result.branch,
      result.text,
      result.summary ?? result.text,
      json(result.canonical_output_links ?? []),
      json(result.knowledge_links ?? []),
      json(result.relationship_audit_links ?? []),
      json(result.transition ?? result.exit ?? {}),
    ]
  );
  return inserted.rows[0];
}

async function fallbackUsageRow({ context, stateRow, scene, executor }) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_generic_fallback_usage
      WHERE campaign_id = $1
        AND character_id = $2
        AND dialogue_scene_key = $3
        AND fallback_policy_id = 'default'
        AND dialogue_session_id IS NULL
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [context.campaign.campaign_id, context.character.character_id, sceneKey(scene)]
  );
  if (result.rowCount > 0) {
    return result.rows[0];
  }
  const inserted = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_generic_fallback_usage (
        campaign_id,
        character_id,
        dialogue_scene_state_id,
        dialogue_scene_key,
        fallback_policy_id
      )
      VALUES ($1, $2, $3, $4, 'default')
      RETURNING *
    `,
    [context.campaign.campaign_id, context.character.character_id, stateRow.id, sceneKey(scene)]
  );
  return inserted.rows[0];
}

async function updateFallbackUsage(row, { usedDelta = 0, failedDelta = 0, exhausted = null, socialMoveRecordId = null }, executor) {
  const result = await executor.query(
    `
      UPDATE dnd5e_dialogue_generic_fallback_usage
      SET used_count = used_count + $2,
          failed_count = failed_count + $3,
          exhausted = COALESCE($4, exhausted),
          last_used_social_move_record_id = COALESCE($5, last_used_social_move_record_id),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [row.id, usedDelta, failedDelta, exhausted, socialMoveRecordId]
  );
  return result.rows[0];
}

function mapContext(context) {
  return {
    capabilities: {
      can_advance_beats: context.account?.can_advance_beats === true,
    },
    active_character: context.character
      ? {
          character_id: String(context.character.character_id),
          name: context.character.character_name,
          level: Number(context.character.level ?? 1),
          status: context.character.character_status ?? 'active',
        }
      : null,
    campaign: context.campaign
      ? {
          campaign_id: String(context.campaign.campaign_id),
          campaign_instance_id: String(context.campaign.campaign_id),
          campaign_name: context.campaign.campaign_name,
          slug: context.campaign.campaign_slug,
          world_id: context.campaign.world_slug ?? String(context.campaign.world_id ?? ''),
          world_name: context.campaign.world_name,
          world_instance_id: context.campaign.world_instance_id
            ? String(context.campaign.world_instance_id)
            : null,
          current_scene_id: context.campaign.current_scene_id
            ? String(context.campaign.current_scene_id)
            : null,
        }
      : null,
  };
}

function surfaceForPlayer(scene) {
  const surface = normalizeObject(scene.conversation_surface);
  return {
    surface_id: itemId(surface, ['surface_id', 'id', 'slug', 'key']),
    paragraphs: normalizeArray(surface.paragraphs)
      .filter((paragraph) => normalizeObject(paragraph).source_visibility !== 'hidden_only')
      .map((paragraph) => ({
        kind: cleanText(paragraph.kind) || 'surface',
        text: textFrom(paragraph),
      }))
      .filter((paragraph) => paragraph.text),
  };
}

function participantForPlayer(participant) {
  return {
    participant_id: itemId(participant, ['participant_id', 'id', 'slug', 'key']),
    label: cleanText(participant.known_label ?? participant.unknown_label ?? participant.label),
    unknown_label: cleanText(participant.unknown_label) || null,
    known_label: cleanText(participant.known_label) || null,
  };
}

function itemIsHidden(item) {
  return item.hidden === true || normalizeObject(item.visibility).hidden === true;
}

function questionRecordMap(records) {
  return new Map(records.map((record) => [record.clarifying_question_id, record]));
}

async function loadQuestionRecords(stateRow, executor) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_clarifying_question_record
      WHERE dialogue_scene_state_id = $1
      ORDER BY updated_at DESC, id DESC
    `,
    [stateRow.id]
  );
  return result.rows;
}

function mapQuestionForPlayer(question, runtimeState, recordsById, relationshipAvailable = true) {
  const id = questionId(question);
  if (!id || itemIsHidden(question)) {
    return null;
  }
  const record = recordsById.get(id) ?? null;
  const locked =
    unique(runtimeState.locked_question_ids).includes(id) ||
    (question.locked_by_default === true && !unique(runtimeState.unlocked_question_ids).includes(id));
  const status = record?.status ?? (locked || !relationshipAvailable ? 'locked' : 'available');
  return {
    question_id: id,
    label: cleanText(question.label ?? question.prompt),
    target_id: cleanText(question.target_id) || null,
    status,
    is_available: status === 'available' && runtimeState.status === 'active',
    is_asked: Boolean(record),
    check_preview: safeCheckPreview(checkDefinition(question, 'visible')),
    result: record
      ? {
          text: textFrom(record.persisted_result_json),
          summary: summaryFrom(record.persisted_result_json) || null,
          check_result: publicCheckResult(record.check_result_json),
          mechanics_label: mechanicsLabel(record.check_result_json),
        }
      : null,
  };
}

function mapMoveForPlayer(move, runtimeState, relationshipAvailable = true) {
  const id = moveId(move);
  if (!id || itemIsHidden(move)) {
    return null;
  }
  const locked = unique(runtimeState.locked_move_ids).includes(id) || !relationshipAvailable;
  return {
    move_id: id,
    label: cleanText(move.label),
    social_move_type: cleanText(move.social_move_type),
    social_tags: normalizeArray(move.social_tags),
    tone: cleanText(move.tone) || null,
    target_id: cleanText(move.target_id) || null,
    status: locked ? 'locked' : 'available',
    is_available: !locked && runtimeState.status === 'active',
    spends_dialogue_beat: move.consumes_dialogue_beat !== false,
    requires_check: move.requires_check === true,
    check_preview: safeCheckPreview(checkDefinition(move, 'visible')),
  };
}

function mapExitForPlayer(exit, runtimeState) {
  const id = exitId(exit);
  if (!id || itemIsHidden(exit)) {
    return null;
  }
  const type = cleanText(exit.exit_type ?? exit.type);
  return {
    exit_id: exitIdForPlayer(id),
    label: cleanText(exit.label ?? exit.title) || 'Leave conversation',
    exit_type: type,
    status: runtimeState.status === 'active' ? 'available' : 'resolved',
    is_available: runtimeState.status === 'active',
    transition: normalizeObject(exit.transition).target_type
      ? {
          target_type: cleanText(exit.transition.target_type ?? exit.transition.type),
          target_id: cleanText(
            exit.transition.target_id ?? exit.transition.scene_id ?? exit.transition.dialogue_scene_id
          ),
        }
      : null,
  };
}

function passiveInsightForPlayer(scene) {
  return normalizeArray(scene.passive_social_insight ?? scene.passive_social_insights)
    .filter((insight) => !itemIsHidden(insight))
    .filter((insight) => {
      const check = checkDefinition(insight, 'success_only');
      return insight.requires_check === false || check?.visibility === 'visible' || check?.visibility === 'narrative_only';
    })
    .map((insight) => ({
      insight_id: itemId(insight, ['insight_id', 'id', 'slug', 'key', 'interaction_id']),
      label: cleanText(insight.label),
      target_id: cleanText(insight.target_id) || null,
      visibility: checkDefinition(insight, 'success_only')?.visibility ?? 'narrative_only',
    }))
    .filter((insight) => insight.insight_id);
}

async function relationshipAvailableForOwner({ context, scene, stateRow, owner, source, executor }) {
  const result = await evaluateRelationshipReadConditions({
    context,
    scene,
    stateRow,
    owner,
    source: {
      ...source,
      target_id: cleanText(owner?.target_id) || source?.target_id,
    },
    executor,
  });
  return result.available;
}

async function buildPlayerFacingState({ context, scene, stateRow, executor }) {
  const runtimeState = normalizeObject(stateRow.value_json);
  const records = await loadQuestionRecords(stateRow, executor);
  const recordsById = questionRecordMap(records);
  const questions = (
    await Promise.all(
      normalizeArray(scene.clarifying_questions).map(async (question) => {
        const id = questionId(question);
        const relationshipAvailable = await relationshipAvailableForOwner({
          context,
          scene,
          stateRow,
          owner: question,
          source: { type: 'clarifying_question', interaction_id: id },
          executor,
        });
        return mapQuestionForPlayer(question, runtimeState, recordsById, relationshipAvailable);
      })
    )
  ).filter(Boolean);
  const moves = (
    await Promise.all(
      normalizeArray(scene.committed_social_moves).map(async (move) => {
        const id = moveId(move);
        const relationshipAvailable = await relationshipAvailableForOwner({
          context,
          scene,
          stateRow,
          owner: move,
          source: { type: 'committed_social_move', interaction_id: id },
          executor,
        });
        return mapMoveForPlayer(move, runtimeState, relationshipAvailable);
      })
    )
  ).filter(Boolean);
  const exits = normalizeArray(scene.dialogue_exits ?? scene.dialogue_exit ?? scene.exits)
    .map((exit) => mapExitForPlayer(exit, runtimeState))
    .filter(Boolean);

  return {
    state: runtimeState.status === 'exited' ? 'exited' : 'active',
    ...mapContext(context),
    dialogue_scene: {
      dialogue_scene_id: sceneKey(scene),
      title: cleanText(scene.title ?? scene.name),
      scene_type: 'dialogue',
      interaction_domain: 'dialogue_focus_commit',
    },
    dialogue_scene_state: {
      dialogue_scene_state_id: String(stateRow.id),
      transcript_id: runtimeState.transcript_id ? String(runtimeState.transcript_id) : null,
      completed_dialogue_record_id: runtimeState.completed_dialogue_record_id
        ? String(runtimeState.completed_dialogue_record_id)
        : null,
      status: runtimeState.status ?? 'active',
      committed_social_move_count: Number(runtimeState.committed_social_move_count ?? 0),
      soft_target_max: Number(runtimeState.soft_target_max ?? 3),
      fallback_usage: runtimeState.fallback_usage ?? {
        used_count: 0,
        failed_count: 0,
        exhausted: false,
      },
      exit_result: exitResultForPlayer(runtimeState.exit_result),
      transition: runtimeState.transition ?? null,
    },
    participants: normalizeArray(scene.participants).map(participantForPlayer),
    conversation_surface: surfaceForPlayer(scene),
    latest_development: runtimeState.latest_development,
    passive_social_insight: passiveInsightForPlayer(scene),
    clarifying_questions: questions,
    committed_social_moves: moves,
    dialogue_exits: exits,
  };
}

async function prepareDialogueRuntime(accountId, input = {}, executor = { query }) {
  await ensureDialogueFocusCommitPersistenceSchema();
  const context = await resolveActiveDialogueContext(accountId, executor);
  if (context.state !== 'active') {
    return { context, response: { state: context.state, ...mapContext(context) } };
  }

  const scene = resolveSceneFromRegistry(input);
  if (!scene) {
    return {
      context,
      response: {
        state: 'no_active_dialogue',
        ...mapContext(context),
        message: 'No registered Dialogue Focus/Commit scene was found for this request.',
      },
    };
  }

  const validation = validateDialogueFocusCommitScene(scene, {
    profile: input.validation_profile ?? scene.validation_metadata?.profile ?? 'playtest_ready',
  });
  if (!validation.ok) {
    return {
      context,
      scene,
      validation,
      response: {
        ...validationFailure(scene, validation),
        ...mapContext(context),
      },
    };
  }

  const stateRow = await getOrCreateRuntimeState({ context, scene, executor });
  await initializeDialogueRelationshipState({ context, scene, stateRow, executor });
  const transcriptState = await ensureDialogueTranscriptForRuntime({ context, scene, stateRow, executor });
  return {
    context,
    scene,
    stateRow: transcriptState.stateRow,
    transcript: transcriptState.transcript,
  };
}

function applyUnlocksAndLocks(runtimeState, outcome, scene) {
  const unlocks = collectUnlocks(outcome.unlocks ?? [], scene);
  const locks = collectLocks(outcome.locks ?? [], scene);
  runtimeState.unlocked_question_ids = unique([
    ...normalizeArray(runtimeState.unlocked_question_ids),
    ...unlocks.clarifying_question_ids,
  ]);
  runtimeState.unlocked_move_ids = unique([
    ...normalizeArray(runtimeState.unlocked_move_ids),
    ...unlocks.committed_social_move_ids,
  ]);
  runtimeState.locked_question_ids = unique([
    ...normalizeArray(runtimeState.locked_question_ids).filter(
      (id) => !unlocks.clarifying_question_ids.includes(id)
    ),
    ...locks.clarifying_question_ids,
  ]);
  runtimeState.locked_move_ids = unique([
    ...normalizeArray(runtimeState.locked_move_ids).filter(
      (id) => !unlocks.committed_social_move_ids.includes(id)
    ),
    ...locks.committed_social_move_ids,
  ]);
}

async function applyKnowledgeGrants({ context, grants, source, executor }) {
  const applied = [];
  for (const grant of normalizeArray(grants)) {
    const knowledgeId = typeof grant === 'string' ? cleanText(grant) : cleanText(grant.knowledge_id ?? grant.key ?? grant.id);
    if (!knowledgeId) {
      continue;
    }
    const granted = await grantKnowledge(
      {
        characterId: context.character.character_id,
        worldInstanceId: context.campaign.world_instance_id,
        campaignId: context.campaign.campaign_id,
        knowledgeId,
        confidence: typeof grant === 'object' ? grant.confidence ?? 'observed' : 'observed',
        metadata: {
          source: source.type,
          interaction_id: source.interaction_id,
        },
        fallback: {
          type: 'dialogue',
          title: typeof grant === 'object' ? grant.title ?? knowledgeId : knowledgeId,
          summary: typeof grant === 'object' ? grant.summary ?? grant.text ?? knowledgeId : knowledgeId,
          source_type: 'dialogue',
        },
      },
      executor
    );
    applied.push(granted);
  }
  return applied;
}

function normalizeFlagWrites(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => cleanText(entry))
        .filter(Boolean)
        .map((entry) => [entry, true])
    );
  }
  return normalizeObject(value);
}

function normalizeDialogueRewards(value) {
  return normalizeArray(value)
    .map((reward) => {
      const object = normalizeObject(reward);
      const rewardType = cleanText(object.reward_type ?? object.type);
      if (!rewardType) {
        return null;
      }
      const rewardValue = {
        ...normalizeObject(object.value),
      };
      if (object.scene_slug && !rewardValue.scene_key) {
        rewardValue.scene_key = cleanText(object.scene_slug);
      }
      if (object.scene_key && !rewardValue.scene_key) {
        rewardValue.scene_key = cleanText(object.scene_key);
      }
      if (object.scene_id !== undefined && object.scene_id !== null && rewardValue.scene_id === undefined) {
        rewardValue.scene_id = object.scene_id;
      }
      if (object.flag_key && !rewardValue.flag_key) {
        rewardValue.flag_key = cleanText(object.flag_key);
      }
      return {
        reward_type: rewardType,
        value: rewardValue,
        metadata_json: normalizeObject(object.metadata_json ?? object.metadata),
      };
    })
    .filter(Boolean);
}

function canonicalEffectsFromOutcome(outcome) {
  return {
    objectives: normalizeArray(outcome.objective_updates),
    character_flags: normalizeFlagWrites(outcome.character_flags),
    campaign_flags: normalizeObject(outcome.campaign_flags),
    rewards: normalizeDialogueRewards(outcome.rewards),
  };
}

function hasCanonicalEffects(effects) {
  return (
    normalizeArray(effects.objectives).length > 0 ||
    Object.keys(normalizeObject(effects.character_flags)).length > 0 ||
    Object.keys(normalizeObject(effects.campaign_flags)).length > 0 ||
    normalizeArray(effects.rewards).length > 0
  );
}

function canonicalOutputLinks({ outcome, applied }) {
  return [
    ...normalizeArray(outcome.canonical_output_links),
    ...normalizeArray(applied?.objectives).map((objective) => ({
      type: 'objective_update',
      quest_key: objective.quest_key,
      objective_key: objective.objective_key,
      status: objective.status,
      progress_count: objective.progress_count,
      action: objective.action,
    })),
    ...normalizeArray(applied?.character_flags).map((flag) => ({
      type: 'character_flag',
      flag_key: flag.flag_key,
      flag_category: flag.flag_category ?? null,
    })),
    ...normalizeArray(applied?.campaign_flags).map((flag) => ({
      type: 'campaign_flag',
      flag_key: flag.flag_key,
      flag_category: flag.flag_category ?? null,
    })),
    ...normalizeArray(applied?.rewards).map((reward) => ({
      type: 'reward',
      reward_type: reward.reward?.reward_type ?? reward.reward_type,
    })),
    ...normalizeArray(applied?.scene_unlocks).map((unlock) => ({
      type: 'scene_unlock',
      scene_key: unlock.scene_key,
      scene_id: unlock.scene_id ? String(unlock.scene_id) : null,
    })),
  ].filter(Boolean);
}

async function applyCanonicalOutputEffects({ context, outcome, source, executor }) {
  const effects = canonicalEffectsFromOutcome(outcome);
  if (!hasCanonicalEffects(effects)) {
    return {
      applied: null,
      canonical_output_links: canonicalOutputLinks({ outcome, applied: null }),
    };
  }

  const applied = await applyAdventureOutcome(
    {
      campaignId: context.campaign.campaign_id,
      characterId: context.character.character_id,
      effectPayload: effects,
      actorAccountId: context.account?.id ?? null,
      sourceType: 'dialogue',
      sourceEntityId: null,
      sourceKey: `dialogue:${source.type}:${source.interaction_id}`,
    },
    executor
  );

  return {
    applied,
    canonical_output_links: canonicalOutputLinks({ outcome, applied }),
  };
}

function questionStatusFromOutcome(outcome) {
  if (outcome.branch === 'failure') {
    return 'failed';
  }
  if (outcome.branch === 'success') {
    return 'succeeded';
  }
  return 'asked';
}

function findQuestion(scene, id) {
  return normalizeArray(scene.clarifying_questions).find((question) => questionId(question) === id) ?? null;
}

function findMove(scene, id) {
  return normalizeArray(scene.committed_social_moves).find((move) => moveId(move) === id) ?? null;
}

function findExit(scene, id) {
  const normalizedId = exitIdFromPlayerInput(id);
  return normalizeArray(scene.dialogue_exits ?? scene.dialogue_exit ?? scene.exits).find((exit) => exitId(exit) === normalizedId) ?? null;
}

function questionAvailable(question, runtimeState) {
  const id = questionId(question);
  if (!id || itemIsHidden(question)) {
    return false;
  }
  if (normalizeArray(runtimeState.locked_question_ids).includes(id)) {
    return false;
  }
  if (question.locked_by_default === true && !normalizeArray(runtimeState.unlocked_question_ids).includes(id)) {
    return false;
  }
  return runtimeState.status === 'active';
}

function assertRuntimeStillActive(runtimeState) {
  if (cleanText(runtimeState.status ?? 'active') !== 'active') {
    throw createHttpError('This conversation has ended. Return to the current scene.', 409);
  }
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

function staleDialogueMomentError() {
  return createHttpError('That moment has changed. Review the current conversation and choose your next move.', 409);
}

function dialogueLifecycleContext(stateRow, runtimeState) {
  return {
    dialogue_scene_state_id: String(stateRow.id),
    committed_social_move_count: Number(runtimeState.committed_social_move_count ?? 0),
  };
}

function assertDialogueLifecycleContext(input, stateRow, runtimeState) {
  const lifecycle = normalizeObject(input.lifecycle_context ?? input.lifecycleContext);
  const requestedStateId = parsePositiveInteger(
    input.dialogue_scene_state_id ??
      input.dialogueSceneStateId ??
      lifecycle.dialogue_scene_state_id ??
      lifecycle.dialogueSceneStateId
  );
  if (requestedStateId && requestedStateId !== Number(stateRow.id)) {
    throw staleDialogueMomentError();
  }

  const expectedMoveCount = parseNonNegativeInteger(
    input.expected_committed_social_move_count ??
      input.committed_social_move_count ??
      lifecycle.expected_committed_social_move_count ??
      lifecycle.committed_social_move_count
  );
  if (expectedMoveCount !== null) {
    const currentMoveCount = Number(runtimeState.committed_social_move_count ?? 0);
    if (expectedMoveCount !== currentMoveCount) {
      throw staleDialogueMomentError();
    }
  }
}

function moveAvailable(move, runtimeState) {
  const id = moveId(move);
  if (!id || itemIsHidden(move)) {
    return false;
  }
  return runtimeState.status === 'active' && !normalizeArray(runtimeState.locked_move_ids).includes(id);
}

export async function getDialogueFocusCommitStateForAccount(accountId, input = {}) {
  if (input.allow_reentry === true || input.allow_reentry === 'true' || input.allowReentry === true) {
    return activateDialogueFocusCommitSceneForAccount(accountId, input);
  }
  const prepared = await prepareDialogueRuntime(accountId, input);
  if (prepared.response) {
    return prepared.response;
  }
  return buildPlayerFacingState({ ...prepared, executor: { query } });
}

export async function activateDialogueFocusCommitSceneForAccount(accountId, input = {}) {
  return withTransaction(async (client) => {
    const prepared = await prepareDialogueRuntime(accountId, input, client);
    if (prepared.response) {
      throw createHttpError(prepared.response.message ?? 'Dialogue scene is not available', 409);
    }

    const runtimeState = normalizeObject(prepared.stateRow.value_json);
    const entrySource = normalizeObject(input.entry_source ?? input.entrySource);
    runtimeState.status = 'active';
    runtimeState.entry_source = {
      ...normalizeObject(runtimeState.entry_source),
      ...entrySource,
    };
    if (input.allow_reentry === true || input.allow_reentry === 'true' || input.allowReentry === true) {
      runtimeState.exit_result = null;
      runtimeState.transition = null;
    }

    const stateRow = await updateRuntimeState(prepared.stateRow.id, runtimeState, client);
    return buildPlayerFacingState({
      ...prepared,
      stateRow,
      executor: client,
    });
  });
}

export async function resolveClarifyingQuestionForAccount(accountId, input = {}) {
  return withTransaction(async (client) => {
    const prepared = await prepareDialogueRuntime(accountId, input, client);
    if (prepared.response) {
      throw createHttpError(prepared.response.message ?? 'Dialogue scene is not available', 409);
    }

    const id = cleanText(input.question_id ?? input.clarifying_question_id ?? input.interaction_id);
    const question = findQuestion(prepared.scene, id);
    if (!question) {
      throw createHttpError('Clarifying Question not found', 404);
    }

    const runtimeState = normalizeObject(prepared.stateRow.value_json);
    assertRuntimeStillActive(runtimeState);
    assertDialogueLifecycleContext(input, prepared.stateRow, runtimeState);
    if (!questionAvailable(question, runtimeState)) {
      throw createHttpError('Clarifying Question is not available', 409);
    }
    const relationshipAvailability = await relationshipAvailableForOwner({
      context: prepared.context,
      scene: prepared.scene,
      stateRow: prepared.stateRow,
      owner: question,
      source: { type: 'clarifying_question', interaction_id: id },
      executor: client,
    });
    if (!relationshipAvailability) {
      throw createHttpError('Clarifying Question is not available in the current relationship state', 409);
    }

    const existing = await loadQuestionRecord(prepared.stateRow, id, client);
    if (existing) {
      const currentDialogue = await buildPlayerFacingState({
        ...prepared,
        executor: client,
      });
      return {
        status: 'already_resolved',
        lifecycle_context: dialogueLifecycleContext(prepared.stateRow, runtimeState),
        clarifying_question_result: {
          question_id: id,
          status: existing.status,
          result: {
            text: textFrom(existing.persisted_result_json),
            summary: summaryFrom(existing.persisted_result_json) || null,
            check_result: publicCheckResult(existing.check_result_json),
            mechanics_label: mechanicsLabel(existing.check_result_json),
          },
        },
        current_dialogue: currentDialogue,
      };
    }

    const checkResult = await resolveCheck({
      owner: question,
      context: {
        characterId: prepared.context.character.character_id,
      },
      forcedOutcome: input.forced_outcome,
      rollOverride: input.roll,
    });
    const outcome = outcomeFor(question, checkResult);
    const knowledge = await applyKnowledgeGrants({
      context: prepared.context,
      grants: outcome.knowledge_grants,
      source: { type: 'clarifying_question', interaction_id: id },
      executor: client,
    });
    const canonicalOutputs = await applyCanonicalOutputEffects({
      context: prepared.context,
      outcome,
      source: { type: 'clarifying_question', interaction_id: id },
      executor: client,
    });
    const relationship = await applyRelationshipStateWrites({
      context: prepared.context,
      scene: prepared.scene,
      stateRow: prepared.stateRow,
      owner: outcome,
      source: {
        type: 'clarifying_question',
        interaction_id: id,
        result_branch: outcome.branch,
        target_id: cleanText(question.target_id) || null,
      },
      executor: client,
    });
    const result = {
      question_id: id,
      text: outcome.text,
      summary: outcome.summary,
      branch: outcome.branch,
      knowledge_links: knowledge.map((entry) => entry.knowledge_id),
      canonical_output_links: canonicalOutputs.canonical_output_links,
      relationship_audit_links: relationship.audit_record_ids,
      relationship_updates: relationship.player_facing_updates,
      unlocks: outcome.unlocks ?? [],
    };
    const status = questionStatusFromOutcome(outcome);
    const questionRecord = await insertQuestionRecord(
      {
        context: prepared.context,
        stateRow: prepared.stateRow,
        scene: prepared.scene,
        question,
        status,
        result,
        checkResult,
      },
      client
    );
    await appendDialogueTranscriptTurn({
      context: prepared.context,
      transcript: prepared.transcript,
      turnType: 'clarifying_question',
      content: {
        label: cleanText(question.label ?? question.prompt),
        text: cleanText(question.label ?? question.prompt),
      },
      speaker: { type: 'player', id: String(prepared.context.character.character_id), label: prepared.context.character.character_name },
      sourceInteractionId: id,
      provenance: { question_record_id: String(questionRecord.id) },
      executor: client,
    });
    const answerTurn = await appendDialogueTranscriptTurn({
      context: prepared.context,
      transcript: prepared.transcript,
      turnType: 'clarifying_answer',
      content: {
        text: outcome.text,
        summary: outcome.summary,
        mechanics_label: mechanicsLabel(checkResult),
        check_result: publicCheckResult(checkResult),
        knowledge_links: knowledge.map((entry) => entry.knowledge_id),
        relationship_updates: relationship.player_facing_updates,
      },
      speaker: { type: 'npc', id: cleanText(question.target_id) || null, label: cleanText(question.target_id) || null },
      sourceInteractionId: id,
      provenance: { question_record_id: String(questionRecord.id), branch: outcome.branch },
      executor: client,
    });
    await client.query(
      `
        UPDATE dnd5e_dialogue_clarifying_question_record
        SET transcript_turn_id = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [questionRecord.id, answerTurn.id]
    );

    runtimeState.asked_question_ids = unique([...normalizeArray(runtimeState.asked_question_ids), id]);
    runtimeState.attempted_question_ids = unique([
      ...normalizeArray(runtimeState.attempted_question_ids),
      id,
    ]);
    if (status === 'succeeded') {
      runtimeState.succeeded_question_ids = unique([
        ...normalizeArray(runtimeState.succeeded_question_ids),
        id,
      ]);
    }
    if (status === 'failed') {
      runtimeState.failed_question_ids = unique([
        ...normalizeArray(runtimeState.failed_question_ids),
        id,
      ]);
    }
    applyUnlocksAndLocks(runtimeState, outcome, prepared.scene);
    const nextStateRow = await updateRuntimeState(prepared.stateRow.id, runtimeState, client);
    const currentDialogue = await buildPlayerFacingState({
      ...prepared,
      stateRow: nextStateRow,
      executor: client,
    });

    return {
      status: 'resolved',
      lifecycle_context: dialogueLifecycleContext(nextStateRow, runtimeState),
      clarifying_question_result: {
        question_id: id,
        status,
        result: {
          text: outcome.text,
          summary: outcome.summary,
          check_result: publicCheckResult(checkResult),
          mechanics_label: mechanicsLabel(checkResult),
          knowledge_grants_applied: knowledge.map((entry) => entry.knowledge_id),
          relationship_updates: relationship.player_facing_updates,
        },
      },
      current_dialogue: currentDialogue,
    };
  });
}

function labelAliases(item, id) {
  return unique([
    id,
    item.label,
    item.prompt,
    item.title,
    item.target_id,
    ...normalizeArray(item.aliases),
    ...normalizeArray(item.keywords),
  ]);
}

function textMatchesItem(rawText, item, id) {
  const haystack = cleanText(rawText).toLowerCase();
  if (!haystack) {
    return false;
  }
  return labelAliases(item, id).some((alias) => {
    const needle = cleanText(alias).toLowerCase();
    return needle.length >= 3 && haystack.includes(needle);
  });
}

function findOverlapQuestion(scene, runtimeState, input) {
  const rawText = cleanText(input.submitted_text ?? input.text ?? input.raw_text);
  if (!rawText || !shallowClarifyingVerbs.test(rawText)) {
    return null;
  }
  return (
    normalizeArray(scene.clarifying_questions).find((question) => {
      const id = questionId(question);
      return (
        questionAvailable(question, runtimeState) &&
        !normalizeArray(runtimeState.asked_question_ids).includes(id) &&
        textMatchesItem(rawText, question, id)
      );
    }) ?? null
  );
}

async function overlapPreviewResponse({ prepared, runtimeState, overlap, executor }) {
  const question = mapQuestionForPlayer(overlap, runtimeState, new Map());
  return {
    status: 'clarifying_question_overlap',
    message: `${question.label} is available as a Clarifying Question. Asking it does not spend your dialogue beat.`,
    lifecycle_context: dialogueLifecycleContext(prepared.stateRow, runtimeState),
    overlap: {
      question_id: question.question_id,
      label: question.label,
    },
    options: ['ask_clarifying_question', 'continue_as_committed_social_move', 'edit_action'],
    current_dialogue: await buildPlayerFacingState({
      ...prepared,
      executor,
    }),
  };
}

function findMoveForPreview(scene, input) {
  const selected = cleanText(input.move_id ?? input.committed_social_move_id ?? input.selected_move_id);
  if (selected) {
    return findMove(scene, selected);
  }
  const rawText = cleanText(input.submitted_text ?? input.text ?? input.raw_text);
  return (
    normalizeArray(scene.committed_social_moves).find((move) => textMatchesItem(rawText, move, moveId(move))) ??
    null
  );
}

function fallbackPolicy(scene) {
  const fallback = normalizeObject(scene.generic_fallback);
  if (fallback.enabled !== true) {
    return null;
  }
  return {
    ...fallback,
    fallback_policy_id: cleanText(fallback.fallback_policy_id ?? fallback.id ?? 'default'),
    social_move_type: normalizeArray(fallback.allowed_social_move_types)[0] ?? 'ask',
    requires_check: false,
    consumes_dialogue_beat: true,
    label: cleanText(fallback.label) || 'Conversation fallback',
    preview: {
      text:
        cleanText(fallback.preview?.text ?? fallback.preview) ||
        'This will spend the dialogue beat on a constrained authored fallback response.',
    },
    no_check_result: normalizeObject(fallback.success_behavior ?? fallback.result),
  };
}

function fallbackLimit(scene) {
  const fallback = normalizeObject(scene.generic_fallback);
  const parsed = Number(fallback.usage_limit ?? fallback.max_uses_per_scene ?? 1);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

async function fallbackIsAvailable({ context, stateRow, scene, executor }) {
  const policy = fallbackPolicy(scene);
  if (!policy) {
    return { available: false, policy: null, usage: null, exhausted: true };
  }
  const usage = await fallbackUsageRow({ context, stateRow, scene, executor });
  const exhausted = Boolean(usage.exhausted) || Number(usage.used_count ?? 0) >= fallbackLimit(scene);
  return {
    available: !exhausted,
    policy,
    usage,
    exhausted,
  };
}

function previewForMove(move, input, { isFallback = false } = {}) {
  const check = checkDefinition(move, 'visible');
  return {
    status: isFallback ? 'generic_fallback_preview' : 'preview',
    interpretation: textFrom(move.preview) || cleanText(move.label),
    move_id: isFallback ? null : moveId(move),
    generic_fallback_id: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : null,
    social_move_type: cleanText(move.social_move_type),
    submitted_text: cleanText(input.submitted_text ?? input.text ?? input.raw_text),
    spends_dialogue_beat: move.consumes_dialogue_beat !== false,
    requires_check: move.requires_check === true,
    check_preview: safeCheckPreview(check),
    assistance: normalizeArray(move.assistance_modifiers ?? move.assistance),
    confidence: isFallback ? 0.25 : cleanText(input.move_id ?? input.selected_move_id) ? 1 : 0.75,
  };
}

function previewForPlayer(preview) {
  const { confidence: _confidence, ...playerPreview } = preview ?? {};
  return playerPreview;
}

export async function previewCommittedSocialMoveForAccount(accountId, input = {}) {
  return withTransaction(async (client) => {
    const prepared = await prepareDialogueRuntime(accountId, input, client);
    if (prepared.response) {
      return prepared.response;
    }

    const runtimeState = normalizeObject(prepared.stateRow.value_json);
    assertRuntimeStillActive(runtimeState);
    assertDialogueLifecycleContext(input, prepared.stateRow, runtimeState);
    const overlap = findOverlapQuestion(prepared.scene, runtimeState, input);
    if (overlap && input.continue_as_committed_social_move !== true) {
      return overlapPreviewResponse({ prepared, runtimeState, overlap, executor: client });
    }

    const move = findMoveForPreview(prepared.scene, input);
    if (
      move &&
      moveAvailable(move, runtimeState) &&
      (await relationshipAvailableForOwner({
        context: prepared.context,
        scene: prepared.scene,
        stateRow: prepared.stateRow,
        owner: move,
        source: { type: 'committed_social_move', interaction_id: moveId(move) },
        executor: client,
      }))
    ) {
      const preview = previewForMove(move, input);
      return {
        status: 'preview',
        lifecycle_context: dialogueLifecycleContext(prepared.stateRow, runtimeState),
        preview: previewForPlayer(preview),
      };
    }

    const fallback = await fallbackIsAvailable({
      context: prepared.context,
      stateRow: prepared.stateRow,
      scene: prepared.scene,
      executor: client,
    });
    if (fallback.available) {
      const preview = previewForMove(fallback.policy, input, { isFallback: true });
      return {
        status: 'generic_fallback_preview',
        lifecycle_context: dialogueLifecycleContext(prepared.stateRow, runtimeState),
        preview: previewForPlayer(preview),
      };
    }

    return {
      status: 'revise',
      message:
        fallback.policy && fallback.exhausted
          ? 'The authored fallback for this dialogue is exhausted. Choose an authored move, ask a Clarifying Question, use an exit, or edit your action.'
          : 'Choose an authored social move, ask a Clarifying Question, use an exit, or edit your action.',
    };
  });
}

function lockUnaskedQuestionsAfterCommit(runtimeState, scene) {
  const asked = new Set(normalizeArray(runtimeState.asked_question_ids));
  const keepAvailable = new Set(
    normalizeArray(scene.clarifying_questions)
      .filter((question) => question.remain_available_after_commit === true || question.low_impact === true)
      .map(questionId)
  );
  const toLock = normalizeArray(scene.clarifying_questions)
    .map(questionId)
    .filter((id) => id && !asked.has(id) && !keepAvailable.has(id));
  runtimeState.locked_question_ids = unique([
    ...normalizeArray(runtimeState.locked_question_ids),
    ...toLock,
  ]);
}

async function resolveAndPersistMove({ prepared, input, move, isFallback, preview, executor }) {
  const checkResult = await resolveCheck({
    owner: move,
    context: {
      characterId: prepared.context.character.character_id,
    },
    forcedOutcome: input.forced_outcome,
    rollOverride: input.roll,
  });
  let outcome = outcomeFor(move, checkResult);
  if (isFallback && cleanText(input.forced_outcome).toLowerCase() === 'failure') {
    const failureBranch = normalizeObject(prepared.scene.generic_fallback?.failure_behavior ?? move.failure_behavior);
    outcome = {
      branch: 'failure',
      was_success: false,
      text: textFrom(failureBranch) || 'The constrained fallback attempt does not produce useful new ground.',
      summary: summaryFrom(failureBranch) || null,
      knowledge_grants: [],
      objective_updates: [],
      character_flags: {},
      campaign_flags: {},
      rewards: [],
      canonical_output_links: [],
      state_changes: [],
      relationship_writes: [],
      unlocks: null,
      locks: null,
      exit: null,
      transition: null,
    };
  }
  const knowledge = await applyKnowledgeGrants({
    context: prepared.context,
    grants: outcome.knowledge_grants,
    source: {
      type: isFallback ? 'generic_fallback_social_move' : 'committed_social_move',
      interaction_id: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : moveId(move),
    },
    executor,
  });
  const canonicalOutputs = await applyCanonicalOutputEffects({
    context: prepared.context,
    outcome,
    source: {
      type: isFallback ? 'generic_fallback_social_move' : 'committed_social_move',
      interaction_id: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : moveId(move),
    },
    executor,
  });
  const relationship = await applyRelationshipStateWrites({
    context: prepared.context,
    scene: prepared.scene,
    stateRow: prepared.stateRow,
    owner: outcome,
    source: {
      type: isFallback ? 'generic_fallback_social_move' : 'committed_social_move',
      interaction_id: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : moveId(move),
      result_branch: outcome.branch,
      target_id: cleanText(move.target_id) || null,
    },
    executor,
  });
  const result = {
    ...outcome,
    knowledge_links: knowledge.map((entry) => entry.knowledge_id),
    canonical_output_links: canonicalOutputs.canonical_output_links,
    relationship_audit_links: relationship.audit_record_ids,
  };
  const record = await insertSocialMoveRecord(
    {
      context: prepared.context,
      stateRow: prepared.stateRow,
      scene: prepared.scene,
      move,
      submittedText: input.submitted_text ?? input.text ?? input.raw_text,
      preview,
      result,
      checkResult,
      isFallback,
    },
    executor
  );
  const submitted = cleanText(input.submitted_text ?? input.text ?? input.raw_text);
  await appendDialogueTranscriptTurn({
    context: prepared.context,
    transcript: prepared.transcript,
    turnType: 'committed_social_move',
    content: {
      label: cleanText(move.label),
      text: submitted || cleanText(move.label),
      summary: preview?.interpretation,
    },
    speaker: { type: 'player', id: String(prepared.context.character.character_id), label: prepared.context.character.character_name },
    sourceInteractionId: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : moveId(move),
    provenance: { social_move_record_id: String(record.id), fallback: isFallback },
    executor,
  });
  const resultTurn = await appendDialogueTranscriptTurn({
    context: prepared.context,
    transcript: prepared.transcript,
    turnType: 'social_move_result',
    content: {
      text: outcome.text,
      summary: outcome.summary,
      result_text: outcome.text,
      mechanics_label: mechanicsLabel(checkResult),
      check_result: publicCheckResult(checkResult),
      knowledge_links: knowledge.map((entry) => entry.knowledge_id),
      relationship_updates: relationship.player_facing_updates,
    },
    speaker: { type: 'scene', id: sceneKey(prepared.scene), label: cleanText(prepared.scene.title ?? prepared.scene.name) },
    sourceInteractionId: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : moveId(move),
    provenance: { social_move_record_id: String(record.id), branch: outcome.branch },
    executor,
  });
  await executor.query(
    `
      UPDATE dnd5e_dialogue_social_move_record
      SET transcript_turn_id = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [record.id, resultTurn.id]
  );
  return { checkResult, outcome, knowledge, relationship, record };
}

export async function submitCommittedSocialMoveForAccount(accountId, input = {}) {
  return withTransaction(async (client) => {
    const prepared = await prepareDialogueRuntime(accountId, input, client);
    if (prepared.response) {
      return prepared.response;
    }

    const runtimeState = normalizeObject(prepared.stateRow.value_json);
    assertRuntimeStillActive(runtimeState);
    assertDialogueLifecycleContext(input, prepared.stateRow, runtimeState);
    const overlap = findOverlapQuestion(prepared.scene, runtimeState, input);
    if (overlap && input.continue_as_committed_social_move !== true) {
      return overlapPreviewResponse({ prepared, runtimeState, overlap, executor: client });
    }

    let move = findMoveForPreview(prepared.scene, input);
    let isFallback = false;
    let fallback = null;
    const moveRelationshipAvailable = move
      ? await relationshipAvailableForOwner({
          context: prepared.context,
          scene: prepared.scene,
          stateRow: prepared.stateRow,
          owner: move,
          source: { type: 'committed_social_move', interaction_id: moveId(move) },
          executor: client,
        })
      : false;
    if (!move || !moveAvailable(move, runtimeState) || !moveRelationshipAvailable) {
      fallback = await fallbackIsAvailable({
        context: prepared.context,
        stateRow: prepared.stateRow,
        scene: prepared.scene,
        executor: client,
      });
      if (!fallback.available) {
        return {
          status: 'revise',
          message: 'No authored committed social move matched, and the generic fallback is not available.',
        };
      }
      move = fallback.policy;
      isFallback = true;
    }

    const preview = previewForMove(move, input, { isFallback });
    const resolved = await resolveAndPersistMove({
      prepared,
      input,
      move,
      isFallback,
      preview,
      executor: client,
    });

    runtimeState.committed_social_move_count =
      Number(runtimeState.committed_social_move_count ?? 0) + 1;
    runtimeState.latest_development = {
      type: 'committed_social_move',
      move_id: isFallback ? null : moveId(move),
      generic_fallback_id: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : null,
      text: resolved.outcome.text,
      summary: resolved.outcome.summary ?? resolved.outcome.text,
      resolved_at: new Date().toISOString(),
    };
    lockUnaskedQuestionsAfterCommit(runtimeState, prepared.scene);
    applyUnlocksAndLocks(runtimeState, resolved.outcome, prepared.scene);
    if (resolved.outcome.exit || resolved.outcome.transition) {
      runtimeState.exit_result = resolved.outcome.exit ?? null;
      runtimeState.transition = resolved.outcome.transition ?? null;
    }

    if (isFallback) {
      const limit = fallbackLimit(prepared.scene);
      const updatedUsage = await updateFallbackUsage(
        fallback.usage,
        {
          usedDelta: 1,
          failedDelta: resolved.outcome.was_success === false ? 1 : 0,
          exhausted: Number(fallback.usage.used_count ?? 0) + 1 >= limit,
          socialMoveRecordId: resolved.record.id,
        },
        client
      );
      runtimeState.fallback_usage = {
        used_count: Number(updatedUsage.used_count ?? 0),
        failed_count: Number(updatedUsage.failed_count ?? 0),
        exhausted: Boolean(updatedUsage.exhausted),
      };
    }

    const nextStateRow = await updateRuntimeState(prepared.stateRow.id, runtimeState, client);
    const currentDialogue = await buildPlayerFacingState({
      ...prepared,
      stateRow: nextStateRow,
      executor: client,
    });

    return {
      status: 'resolved',
      lifecycle_context: dialogueLifecycleContext(nextStateRow, runtimeState),
      social_move_result: {
        social_move_record_id: String(resolved.record.id),
        move_id: isFallback ? null : moveId(move),
        generic_fallback_id: isFallback ? cleanText(move.fallback_policy_id ?? 'default') : null,
        result_text: resolved.outcome.text,
        latest_development: runtimeState.latest_development,
        branch: resolved.outcome.branch,
        check_result: publicCheckResult(resolved.checkResult),
        mechanics_label: mechanicsLabel(resolved.checkResult),
        knowledge_grants_applied: resolved.knowledge.map((entry) => entry.knowledge_id),
        relationship_updates: resolved.relationship.player_facing_updates,
        spends_dialogue_beat: true,
      },
      current_dialogue: currentDialogue,
    };
  });
}

export async function resolveDialogueExitForAccount(accountId, input = {}) {
  return withTransaction(async (client) => {
    const prepared = await prepareDialogueRuntime(accountId, input, client);
    if (prepared.response) {
      return prepared.response;
    }
    const id = cleanText(input.exit_id ?? input.dialogue_exit_id ?? input.transition_id);
    const exit = findExit(prepared.scene, id);
    if (!exit) {
      throw createHttpError('Dialogue exit not found', 404);
    }
    if (itemIsHidden(exit)) {
      throw createHttpError('Dialogue exit is not available', 409);
    }
    const runtimeState = normalizeObject(prepared.stateRow.value_json);
    assertRuntimeStillActive(runtimeState);
    assertDialogueLifecycleContext(input, prepared.stateRow, runtimeState);
    const transition = normalizeObject(exit.transition);
    const relationship = await applyRelationshipStateWrites({
      context: prepared.context,
      scene: prepared.scene,
      stateRow: prepared.stateRow,
      owner: exit.behavior ?? exit.result ?? exit,
      source: {
        type: 'dialogue_exit',
        interaction_id: id,
        target_id: cleanText(exit.target_id) || null,
      },
      executor: client,
    });
    runtimeState.status = 'exited';
    runtimeState.exit_result = {
      exit_id: id,
      exit_type: cleanText(exit.exit_type ?? exit.type),
      text: textFrom(exit.behavior ?? exit.result ?? exit),
      resolved_at: new Date().toISOString(),
    };
    runtimeState.transition = Object.keys(transition).length
      ? {
          target_type: cleanText(transition.target_type ?? transition.type),
          target_id: cleanText(transition.target_id ?? transition.scene_id ?? transition.dialogue_scene_id),
        }
      : null;
    await appendDialogueTranscriptTurn({
      context: prepared.context,
      transcript: prepared.transcript,
      turnType: 'exit',
      content: {
        label: cleanText(exit.label ?? exit.title),
        text: runtimeState.exit_result.text,
        summary: runtimeState.exit_result.text,
      },
      speaker: { type: 'player', id: String(prepared.context.character.character_id), label: prepared.context.character.character_name },
      sourceInteractionId: id,
      provenance: { transition: runtimeState.transition },
      executor: client,
    });
    const exitedStateRow = await updateRuntimeState(prepared.stateRow.id, runtimeState, client);
    const finalized = await finalizeDialogueArchive({
      context: prepared.context,
      scene: prepared.scene,
      stateRow: exitedStateRow,
      transcript: prepared.transcript,
      runtimeState,
      executor: client,
    });
    const nextStateRow = finalized.stateRow ?? exitedStateRow;
    return {
      status: 'exited',
      lifecycle_context: dialogueLifecycleContext(nextStateRow, runtimeState),
      dialogue_exit_result: {
        ...runtimeState.exit_result,
        exit_id: exitIdForPlayer(runtimeState.exit_result?.exit_id),
      },
      transition: runtimeState.transition,
      completed_dialogue_record: finalized.completedRecord
        ? {
            completed_dialogue_record_id: String(finalized.completedRecord.id),
            transcript_id: finalized.completedRecord.transcript_id
              ? String(finalized.completedRecord.transcript_id)
              : null,
            compact_summary: finalized.completedRecord.compact_summary,
          }
        : null,
      relationship_updates: relationship.player_facing_updates,
      current_dialogue: await buildPlayerFacingState({
        ...prepared,
        stateRow: nextStateRow,
        executor: client,
      }),
    };
  });
}
