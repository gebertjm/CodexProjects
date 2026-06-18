import { query } from '../config/db.js';
import {
  actionVerbFromText,
  normalizeActionText,
  resolveActionVerb,
} from './smsActionVerbRegistry.js';

let schemaReady = false;

const REPEAT_POLICIES = new Set(['once', 'repeat_with_new_context', 'repeatable', 'depleted_visible']);
const EXHAUSTIBLE_ACTION_TYPES = new Set(['scene_interaction']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function wordsFrom(value) {
  return normalizeActionText(value)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !['the', 'a', 'an', 'to', 'with', 'for', 'of'].includes(word));
}

function slugTokens(value) {
  return wordsFrom(String(value ?? '').replace(/[:_-]+/g, ' '));
}

function expandedTargetAliases(values = []) {
  const tokens = new Set(values.flatMap(wordsFrom));
  const aliases = [];

  if (tokens.has('caravan')) {
    aliases.push('wagon', 'cart', 'caravan wagon');
  }

  if (tokens.has('tracks') || tokens.has('track')) {
    aliases.push('trail', 'footprints', 'tracks');
  }

  if (tokens.has('innkeeper')) {
    aliases.push('keeper', 'proprietor', 'barkeep');
  }

  if (tokens.has('survivors') || tokens.has('survivor')) {
    aliases.push('travelers', 'missing travelers', 'people');
  }

  return aliases;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function stripLeadingActionWords(label) {
  return String(label ?? '')
    .replace(/^(inspect|examine|study|check|search|look for|read|track|follow|speak with|talk to|ask|question|head to|continue to|return to|move to|go to|take|enter|leave|use|open)\s+/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
}

function inferVerb(action) {
  const label = normalizeActionText(action.label);

  if (action.action_type === 'talk_to_npc') {
    return 'talk';
  }

  if (action.action_type === 'move_scene' || action.action_type === 'enter_scene') {
    if (/\b(track|tracks|trail|follow|signs)\b/.test(label)) {
      return 'track';
    }

    return 'move';
  }

  if (action.action_type === 'wait') {
    return 'wait';
  }

  if (/\b(search|survivors|find|look for)\b/.test(label)) {
    return 'search';
  }

  if (/\b(track|tracks|trail|follow)\b/.test(label)) {
    return 'track';
  }

  if (/\b(look|watch|observe|scan)\b/.test(label)) {
    return 'observe';
  }

  if (/\b(help|assist|aid)\b/.test(label)) {
    return 'help';
  }

  if (/\b(use|open|activate|apply)\b/.test(label)) {
    return 'use';
  }

  return 'investigate';
}

function tagsForAction(action, verb) {
  if (action.action_type === 'talk_to_npc') {
    return ['person'];
  }

  if (action.action_type === 'move_scene' || action.action_type === 'enter_scene') {
    return verb === 'track' ? ['trail', 'exit', 'place'] : ['exit', 'place'];
  }

  if (verb === 'track') {
    return ['trail', 'clue'];
  }

  if (verb === 'search') {
    return ['scene', 'object', 'clue'];
  }

  if (verb === 'wait') {
    return ['scene'];
  }

  return ['object', 'scene', 'clue'];
}

function repeatPolicyForAction(action) {
  if (action.action_type === 'wait') {
    return 'repeatable';
  }

  if (action.action_type === 'talk_to_npc') {
    return 'repeat_with_new_context';
  }

  if (action.action_type === 'move_scene' || action.action_type === 'enter_scene') {
    return 'repeatable';
  }

  return 'once';
}

export async function ensureSmsExplorationSchema() {
  if (schemaReady) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS dnd5e_scene_affordance (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
      affordance_key VARCHAR(160) NOT NULL,
      label TEXT NOT NULL,
      aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (scene_id, affordance_key),
      CONSTRAINT dnd5e_scene_affordance_key_present_check CHECK (btrim(affordance_key) <> ''),
      CONSTRAINT dnd5e_scene_affordance_label_present_check CHECK (btrim(label) <> '')
    );

    CREATE TABLE IF NOT EXISTS dnd5e_scene_affordance_action (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      affordance_id BIGINT NOT NULL REFERENCES dnd5e_scene_affordance(id) ON DELETE CASCADE,
      verb VARCHAR(80) NOT NULL,
      action_key VARCHAR(180) NOT NULL,
      interaction_id BIGINT REFERENCES dnd5e_scene_interaction(id) ON DELETE SET NULL,
      transition_id BIGINT REFERENCES dnd5e_scene_transition(id) ON DELETE SET NULL,
      repeat_policy VARCHAR(80) NOT NULL DEFAULT 'once',
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (affordance_id, verb, action_key),
      CONSTRAINT dnd5e_scene_affordance_action_verb_present_check CHECK (btrim(verb) <> ''),
      CONSTRAINT dnd5e_scene_affordance_action_key_present_check CHECK (btrim(action_key) <> ''),
      CONSTRAINT dnd5e_scene_affordance_action_repeat_check CHECK (
        repeat_policy IN ('once', 'repeat_with_new_context', 'repeatable', 'depleted_visible')
      )
    );

    CREATE TABLE IF NOT EXISTS dnd5e_scene_affordance_state (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
      character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
      scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
      affordance_key VARCHAR(180) NOT NULL,
      action_key VARCHAR(180),
      state VARCHAR(80) NOT NULL DEFAULT 'available',
      times_used INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      resolved_by_character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
      revealed_at TIMESTAMPTZ,
      source_type VARCHAR(80),
      source_key VARCHAR(180),
      context_version INTEGER NOT NULL DEFAULT 1,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (campaign_id, character_id, scene_id, affordance_key, action_key),
      CONSTRAINT dnd5e_scene_affordance_state_key_present_check CHECK (btrim(affordance_key) <> ''),
      CONSTRAINT dnd5e_scene_affordance_state_status_check CHECK (
        state IN ('available', 'hidden', 'locked', 'resolved', 'depleted', 'transformed')
      )
    );

    CREATE TABLE IF NOT EXISTS dnd5e_sms_intent_resolution_log (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
      character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
      account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
      scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
      session_id TEXT,
      user_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      available_affordance_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      available_verbs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      resolver_status VARCHAR(80) NOT NULL,
      candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      chosen_candidate_json JSONB,
      confidence NUMERIC,
      clarification_needed BOOLEAN NOT NULL DEFAULT FALSE,
      external_ai_used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT dnd5e_sms_intent_resolution_log_status_check CHECK (
        resolver_status IN ('resolved', 'ambiguous', 'invalid', 'out_of_scope')
      )
    );
  `);

  schemaReady = true;
}

export function validateAffordanceDefinition(definition = {}) {
  const errors = [];

  if (!definition.id && !definition.affordance_key) {
    errors.push('affordance id is required');
  }

  for (const action of normalizeArray(definition.available_actions)) {
    if (!resolveActionVerb(action.verb)) {
      errors.push(`invalid action verb: ${action.verb}`);
    }

    if (action.repeat_policy && !REPEAT_POLICIES.has(action.repeat_policy)) {
      errors.push(`invalid repeat policy: ${action.repeat_policy}`);
    }

    if (!action.interaction_id && !action.transition_id && !action.action_key) {
      errors.push('affordance action must reference an interaction, transition, or action key');
    }
  }

  for (const key of normalizeArray(definition.adds_affordances)) {
    if (!key) {
      errors.push('adds_affordances entries must be non-empty');
    }
  }

  for (const key of normalizeArray(definition.removes_affordances)) {
    if (!key) {
      errors.push('removes_affordances entries must be non-empty');
    }
  }

  const publicText = [
    definition.label,
    ...normalizeArray(definition.aliases),
  ].join(' ').toLowerCase();

  if (/whispering presence|hidden influence|bandit conspiracy/.test(publicText)) {
    errors.push('hidden truth must not appear in public affordance labels or aliases');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function affordanceFromRuntimeAction(action) {
  const verb = inferVerb(action);
  const targetLabel = stripLeadingActionWords(action.label) || action.label || 'the scene';
  const sourceKey = action.source?.key ?? action.payload?.interaction_key ?? action.payload?.transition_key ?? action.key;
  const affordanceKey = `${action.source?.type ?? action.action_type}:${sourceKey}`;
  const baseAliasValues = [
    targetLabel,
    action.label,
    action.source?.name,
    action.source?.key,
    action.payload?.interaction_key,
    action.payload?.transition_key,
  ];
  const aliases = unique([
    ...baseAliasValues,
    ...expandedTargetAliases(baseAliasValues),
    ...slugTokens(action.key),
    ...slugTokens(action.label),
  ]);

  return {
    affordance_id: affordanceKey,
    affordance_key: affordanceKey,
    label: targetLabel,
    aliases,
    tags: tagsForAction(action, verb),
    state: 'available',
    available_actions: [
      {
        verb,
        action_key: action.key,
        interaction_id: action.payload?.interaction_id ?? null,
        transition_id: action.payload?.transition_id ?? null,
        repeat_policy: repeatPolicyForAction(action),
        runtime_action: action,
      },
    ],
    runtime_action: action,
    repeat_policy: repeatPolicyForAction(action),
  };
}

export async function loadAffordanceState({ campaignId, characterId, sceneId }) {
  await ensureSmsExplorationSchema();

  if (!numericId(campaignId) || !numericId(characterId)) {
    return new Map();
  }

  const result = await query(
    `
      SELECT affordance_key, action_key, state, times_used, last_used_at, context_version
      FROM dnd5e_scene_affordance_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND ($3::bigint IS NULL OR scene_id = $3)
    `,
    [campaignId, characterId, numericId(sceneId)]
  );

  return new Map(
    result.rows.map((row) => [
      `${row.affordance_key}|${row.action_key ?? ''}`,
      {
        ...row,
        times_used: Number(row.times_used ?? 0),
      },
    ])
  );
}

export async function buildActiveAffordancesFromActions({
  campaignId,
  characterId,
  sceneId,
  actions = [],
} = {}) {
  const state = await loadAffordanceState({ campaignId, characterId, sceneId });
  const affordances = [];

  for (const action of normalizeArray(actions)) {
    const affordance = affordanceFromRuntimeAction(action);
    const actionState = state.get(`${affordance.affordance_key}|${action.key}`);
    const affordanceState = state.get(`${affordance.affordance_key}|`);
    const resolvedState = actionState ?? affordanceState;
    const actionConfig = affordance.available_actions[0];

    if (
      resolvedState?.state === 'resolved' &&
      actionConfig.repeat_policy === 'once'
    ) {
      affordance.state = 'resolved';
      continue;
    }

    if (resolvedState?.state === 'hidden' || resolvedState?.state === 'locked') {
      affordance.state = resolvedState.state;
      continue;
    }

    affordances.push({
      ...affordance,
      state: resolvedState?.state ?? 'available',
      times_used: resolvedState?.times_used ?? 0,
    });
  }

  return affordances;
}

export async function filterRuntimeActionsForSms({
  campaignId,
  characterId,
  sceneId,
  actions = [],
} = {}) {
  const affordances = await buildActiveAffordancesFromActions({
    campaignId,
    characterId,
    sceneId,
    actions,
  });
  const activeKeys = new Set(
    affordances.flatMap((affordance) =>
      affordance.available_actions.map((action) => action.action_key)
    )
  );

  return {
    actions: normalizeArray(actions).filter((action) => activeKeys.has(action.key)),
    affordances,
  };
}

export async function markAffordanceActionUsed({
  campaignId,
  characterId,
  sceneId,
  action,
  affordance = null,
  sourceType = 'sms_runtime_action',
} = {}) {
  await ensureSmsExplorationSchema();

  if (!numericId(campaignId) || !numericId(characterId) || !action?.key) {
    return null;
  }

  const resolvedAffordance = affordance ?? affordanceFromRuntimeAction(action);
  const actionConfig = resolvedAffordance.available_actions?.[0] ?? {};
  const repeatPolicy = actionConfig.repeat_policy ?? repeatPolicyForAction(action);
  const nextState = repeatPolicy === 'once' && EXHAUSTIBLE_ACTION_TYPES.has(action.action_type)
    ? 'resolved'
    : 'available';
  const metadata = {
    repeat_policy: repeatPolicy,
    action_type: action.action_type,
    label: action.label,
    tags: resolvedAffordance.tags,
  };

  const result = await query(
    `
      INSERT INTO dnd5e_scene_affordance_state (
        campaign_id,
        character_id,
        scene_id,
        affordance_key,
        action_key,
        state,
        times_used,
        last_used_at,
        resolved_by_character_id,
        revealed_at,
        source_type,
        source_key,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), $2, NOW(), $7, $8, $9::jsonb)
      ON CONFLICT (campaign_id, character_id, scene_id, affordance_key, action_key)
      DO UPDATE SET
        state = EXCLUDED.state,
        times_used = dnd5e_scene_affordance_state.times_used + 1,
        last_used_at = NOW(),
        resolved_by_character_id = EXCLUDED.resolved_by_character_id,
        source_type = EXCLUDED.source_type,
        source_key = EXCLUDED.source_key,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = NOW()
      RETURNING *
    `,
    [
      campaignId,
      characterId,
      numericId(sceneId),
      resolvedAffordance.affordance_key,
      action.key,
      nextState,
      sourceType,
      action.key,
      JSON.stringify(metadata),
    ]
  );

  return result.rows[0] ?? null;
}

export async function logSmsIntentResolution({
  session = null,
  userText,
  normalizedText,
  sceneId = null,
  availableAffordances = [],
  status,
  candidates = [],
  chosenCandidate = null,
  confidence = null,
  clarificationNeeded = false,
} = {}) {
  await ensureSmsExplorationSchema();

  const campaignId = numericId(session?.campaign_id);
  const characterId = numericId(session?.active_sms_character_id);
  const accountId = numericId(session?.account_id ?? session?.state?.account_id);

  await query(
    `
      INSERT INTO dnd5e_sms_intent_resolution_log (
        campaign_id,
        character_id,
        account_id,
        scene_id,
        session_id,
        user_text,
        normalized_text,
        available_affordance_ids_json,
        available_verbs_json,
        resolver_status,
        candidates_json,
        chosen_candidate_json,
        confidence,
        clarification_needed,
        external_ai_used
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12::jsonb, $13, $14, FALSE)
    `,
    [
      campaignId,
      characterId,
      accountId,
      numericId(sceneId),
      session?.session_id ?? null,
      String(userText ?? ''),
      normalizedText,
      JSON.stringify(availableAffordances.map((affordance) => affordance.affordance_key)),
      JSON.stringify(unique(availableAffordances.flatMap((affordance) =>
        affordance.available_actions.map((action) => action.verb)
      ))),
      status,
      JSON.stringify(candidates.map(compactCandidate)),
      chosenCandidate ? JSON.stringify(compactCandidate(chosenCandidate)) : null,
      confidence,
      clarificationNeeded,
    ]
  );
}

export function compactCandidate(candidate) {
  return {
    verb: candidate.verb,
    target_affordance_id: candidate.target_affordance_id,
    interaction_id: candidate.interaction_id ?? null,
    transition_id: candidate.transition_id ?? null,
    action_key: candidate.action?.key ?? candidate.action_key ?? null,
    label: candidate.label,
    confidence: candidate.confidence,
    reason: candidate.reason,
  };
}
