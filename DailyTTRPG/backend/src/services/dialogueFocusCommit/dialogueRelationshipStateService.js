import { query } from '../../config/db.js';
import { createHttpError } from '../../utils/httpError.js';

const persistentScope = 'persistent_npc_state';
const sceneStateScopes = new Set([
  'dialogue_scene_state',
  'dialogue_local',
  'temporary',
  'decaying',
  'cleared_by_event',
]);

const validScopes = new Set([persistentScope, ...sceneStateScopes]);

const playerFacingStatuses = new Set([
  'player_visible',
  'player_perceived',
  'canonical_history',
]);

const coreRelationshipFieldDefinitions = Object.freeze([
  {
    field: 'trust',
    scope: 'persistent_npc_state',
    type: 'ladder',
    values: [-2, -1, 0, 1, 2],
    default: 0,
    allowed_write_scopes: ['persistent_npc_state'],
    shorthand_behavior: 'allow_unambiguous',
    player_visibility: 'player_perceived',
    source: 'core_default',
    priority: 0,
  },
  {
    field: 'respect',
    scope: 'persistent_npc_state',
    type: 'ladder',
    values: [-2, -1, 0, 1, 2],
    default: 0,
    allowed_write_scopes: ['persistent_npc_state'],
    shorthand_behavior: 'allow_unambiguous',
    player_visibility: 'player_perceived',
    source: 'core_default',
    priority: 0,
  },
  {
    field: 'hostility',
    scope: 'persistent_npc_state',
    type: 'ladder',
    values: [-2, -1, 0, 1, 2],
    default: 0,
    allowed_write_scopes: ['persistent_npc_state'],
    shorthand_behavior: 'allow_unambiguous',
    player_visibility: 'player_perceived',
    source: 'core_default',
    priority: 0,
  },
  {
    field: 'openness',
    scope: 'dialogue_scene_state',
    type: 'number',
    default: 0,
    allowed_write_scopes: ['dialogue_scene_state', 'dialogue_local', 'temporary', 'decaying', 'cleared_by_event'],
    shorthand_behavior: 'allow_unambiguous',
    player_visibility: 'gm_only',
    source: 'core_default',
    priority: 0,
  },
  {
    field: 'fear',
    scope: 'dialogue_scene_state',
    type: 'number',
    default: 0,
    allowed_write_scopes: ['dialogue_scene_state', 'dialogue_local', 'temporary', 'decaying', 'cleared_by_event'],
    shorthand_behavior: 'allow_unambiguous',
    player_visibility: 'gm_only',
    source: 'core_default',
    priority: 0,
  },
  {
    field: 'pressure',
    scope: 'dialogue_scene_state',
    type: 'number',
    default: 0,
    allowed_write_scopes: ['dialogue_scene_state', 'dialogue_local', 'temporary', 'decaying', 'cleared_by_event'],
    shorthand_behavior: 'allow_unambiguous',
    player_visibility: 'gm_only',
    source: 'core_default',
    priority: 0,
  },
  {
    field: 'stability',
    scope: 'dialogue_scene_state',
    type: 'number',
    default: 0,
    allowed_write_scopes: ['dialogue_scene_state', 'dialogue_local', 'temporary', 'decaying', 'cleared_by_event'],
    shorthand_behavior: 'allow_unambiguous',
    player_visibility: 'gm_only',
    source: 'core_default',
    priority: 0,
  },
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

function json(value) {
  return JSON.stringify(value ?? null);
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sceneKey(scene) {
  return cleanText(scene?.id ?? scene?.slug ?? scene?.key ?? scene?.dialogue_scene_id);
}

function fieldNameFrom(value) {
  return cleanText(value?.field_name ?? value?.field ?? value?.key ?? value?.id);
}

function participantId(participant) {
  return cleanText(participant?.participant_id ?? participant?.id ?? participant?.slug ?? participant?.key);
}

function normalizeScope(value) {
  const scope = cleanText(value);
  if (scope === 'character_npc' || scope === 'npc_relationship') {
    return persistentScope;
  }
  if (scope === 'scene_local' || scope === 'dialogue_posture') {
    return 'dialogue_scene_state';
  }
  return scope;
}

function valueTypeFrom(definition) {
  return cleanText(definition.value_type ?? definition.type ?? 'number');
}

function normalizeDefinition(rawDefinition, { priority = 10, source = 'scene' } = {}) {
  const definition = normalizeObject(rawDefinition);
  const field = fieldNameFrom(definition);
  if (!field) {
    return null;
  }
  const scope = normalizeScope(definition.ownership_default ?? definition.scope ?? definition.layer);
  const type = valueTypeFrom(definition);
  const ladderValues = normalizeArray(
    definition.ladder_values_json ?? definition.ladder_values ?? definition.values
  );
  const defaultValue =
    definition.default_value_json !== undefined
      ? definition.default_value_json
      : definition.default_value !== undefined
        ? definition.default_value
        : definition.default;
  const visibilityPolicy = normalizeObject(definition.visibility_policy_json ?? definition.visibility_policy);
  const playerVisibility = cleanText(
    definition.player_visibility ??
      definition.visibility ??
      visibilityPolicy.player_visibility ??
      visibilityPolicy.default ??
      'gm_only'
  );
  const allowedWriteScopes = normalizeArray(
    definition.allowed_write_scopes_json ?? definition.allowed_write_scopes
  ).map(normalizeScope);
  return {
    ...definition,
    field,
    field_name: field,
    scope,
    ownership_default: scope,
    type,
    value_type: type,
    values: ladderValues,
    ladder_values: ladderValues,
    default: defaultValue,
    default_value: defaultValue,
    allowed_write_scopes: allowedWriteScopes.length > 0 ? allowedWriteScopes : scope ? [scope] : [],
    shorthand_behavior: cleanText(definition.shorthand_behavior ?? 'allow_unambiguous'),
    player_visibility: playerVisibility,
    source,
    priority,
  };
}

function sceneRelationshipDefinitions(scene) {
  const raw = normalizeArray(scene?.relationship_state_definitions).length > 0
    ? scene.relationship_state_definitions
    : normalizeArray(scene?.relationship_context?.definitions ?? scene?.relationship_context?.fields);
  return raw
    .map((definition) => normalizeDefinition(definition, { source: 'scene', priority: 30 }))
    .filter(Boolean);
}

function candidateNpcKeys(targetId, participant = null) {
  const values = [
    targetId,
    cleanText(targetId).replace(/^npc:/i, ''),
    participant?.npc_key,
    participant?.npc_template_slug,
    participant?.template_slug,
    participant?.slug,
    participant?.key,
  ]
    .map(cleanText)
    .filter(Boolean);

  const expanded = new Set();
  for (const value of values) {
    expanded.add(value);
    expanded.add(value.replaceAll('_', '-'));
    expanded.add(value.replaceAll('-', '_'));
  }
  return [...expanded].filter(Boolean);
}

async function resolveParticipants(scene, executor) {
  const participants = new Map();
  for (const participant of normalizeArray(scene?.participants)) {
    const id = participantId(participant);
    if (!id) {
      continue;
    }
    const explicitNpcId = toNumberOrNull(participant.npc_id);
    let npc = explicitNpcId
      ? { id: explicitNpcId, key: cleanText(participant.npc_key), name: cleanText(participant.known_label) }
      : null;

    if (!npc) {
      const keys = candidateNpcKeys(id, participant);
      if (keys.length > 0) {
        const result = await executor.query(
          `
            SELECT id, key, name
            FROM dnd5e_npc
            WHERE key = ANY($1::text[])
            ORDER BY array_position($1::text[], key), id
            LIMIT 1
          `,
          [keys]
        );
        npc = result.rows[0] ?? null;
      }
    }

    participants.set(id, {
      participant_id: id,
      target_id: id,
      npc_id: npc?.id ? Number(npc.id) : null,
      npc_key: cleanText(npc?.key),
      npc_name: cleanText(npc?.name),
      authored: participant,
    });
  }
  return participants;
}

async function loadDatabaseDefinitions({ context, participantRefs, executor }) {
  const npcIds = [...participantRefs.values()]
    .map((participant) => participant.npc_id)
    .filter((id) => Number.isFinite(Number(id)));
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_relationship_state_definition
      WHERE is_active = TRUE
        AND (campaign_id IS NULL OR campaign_id = $1)
        AND (world_id IS NULL OR world_id = $2)
        AND (scene_id IS NULL OR scene_id = $3)
        AND (npc_id IS NULL OR npc_id = ANY($4::bigint[]))
      ORDER BY
        CASE
          WHEN scene_id IS NOT NULL THEN 40
          WHEN npc_id IS NOT NULL THEN 30
          WHEN campaign_id IS NOT NULL THEN 20
          WHEN world_id IS NOT NULL THEN 10
          ELSE 5
        END DESC,
        id DESC
    `,
    [
      context.campaign?.campaign_id ?? null,
      context.campaign?.world_id ?? null,
      context.campaign?.current_scene_id ?? null,
      npcIds,
    ]
  );
  return result.rows
    .map((definition) =>
      normalizeDefinition(definition, {
        source: 'database',
        priority: definition.scene_id ? 40 : definition.npc_id ? 30 : definition.campaign_id ? 20 : 10,
      })
    )
    .filter(Boolean);
}

function definitionKey(definition) {
  return `${definition.field}:${definition.scope}`;
}

async function buildRelationshipRegistry({ context, scene, executor }) {
  const participantRefs = await resolveParticipants(scene, executor);
  const dbDefinitions = await loadDatabaseDefinitions({ context, participantRefs, executor });
  const definitions = [
    ...coreRelationshipFieldDefinitions.map((definition) =>
      normalizeDefinition(definition, { source: 'core_default', priority: 0 })
    ),
    ...dbDefinitions,
    ...sceneRelationshipDefinitions(scene),
  ].filter(Boolean);

  const byKey = new Map();
  for (const definition of definitions) {
    const key = definitionKey(definition);
    const existing = byKey.get(key);
    if (!existing || Number(definition.priority ?? 0) >= Number(existing.priority ?? 0)) {
      byKey.set(key, definition);
    }
  }

  const byField = new Map();
  for (const definition of byKey.values()) {
    const entries = byField.get(definition.field) ?? [];
    entries.push(definition);
    byField.set(definition.field, entries.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0)));
  }

  return {
    definitions: [...byKey.values()],
    byField,
    participantRefs,
  };
}

function parseShorthandRead(value) {
  const raw = cleanText(value);
  const match = raw.match(/^([A-Za-z0-9_-]+)\s*(>=|<=|>|<|==|=|!=)\s*(.+)$/);
  if (!match) {
    return null;
  }
  const [, field, rawOperator, rawValue] = match;
  const operator = rawOperator === '=' || rawOperator === '==' ? 'eq' : rawOperator === '!=' ? 'neq' : rawOperator;
  const trimmedValue = cleanText(rawValue).replace(/^['"]|['"]$/g, '');
  const numeric = Number(trimmedValue);
  return {
    field,
    operator,
    value: Number.isFinite(numeric) ? numeric : trimmedValue,
    shorthand: true,
  };
}

function normalizeRead(read, source = {}) {
  if (typeof read === 'string') {
    return parseShorthandRead(read);
  }
  const value = normalizeObject(read);
  if (Object.keys(value).length === 0) {
    return null;
  }
  return {
    ...value,
    field: fieldNameFrom(value),
    scope: normalizeScope(value.scope),
    target_id: cleanText(value.target_id ?? value.target ?? value.participant_id ?? source.target_id),
    operator: cleanText(value.operator ?? value.op),
    value: value.value,
    shorthand: value.shorthand === true || !cleanText(value.scope),
  };
}

function collectRelationshipReads(value) {
  if (typeof value === 'string') {
    return [value];
  }
  const object = normalizeObject(value);
  return [
    ...normalizeArray(object.relationship_reads),
    ...normalizeArray(object.relationship_state_reads),
    ...normalizeArray(object.social_state_reads),
    ...normalizeArray(object.availability?.relationship_reads),
    ...normalizeArray(object.availability?.relationship_state_reads),
    ...(typeof object.requires_state === 'string' ? [object.requires_state] : []),
  ];
}

function collectRelationshipWrites(value) {
  const object = normalizeObject(value);
  return [
    ...normalizeArray(object.relationship_writes),
    ...normalizeArray(object.relationship_state_writes),
    ...normalizeArray(object.social_state_writes),
    ...normalizeArray(object.state_changes),
    ...normalizeArray(object.writes),
  ];
}

function resolveDefinition(registry, readOrWrite, source = {}) {
  const field = fieldNameFrom(readOrWrite);
  if (!field) {
    throw createHttpError('Relationship/social state field is required', 409);
  }
  const definitions = registry.byField.get(field) ?? [];
  if (definitions.length === 0) {
    throw createHttpError(`Relationship/social state field "${field}" is not registered`, 409);
  }

  const explicitScope = normalizeScope(readOrWrite.scope);
  if (explicitScope) {
    const match = definitions.find((definition) => definition.scope === explicitScope);
    if (!match) {
      throw createHttpError(`Relationship/social state field "${field}" is not registered for ${explicitScope}`, 409);
    }
    return match;
  }

  const allowed = definitions.filter((definition) => definition.shorthand_behavior !== 'disabled');
  const uniqueScopes = [...new Set(allowed.map((definition) => definition.scope))];
  if (allowed.length !== 1 || uniqueScopes.length !== 1) {
    const sourceLabel = cleanText(source.interaction_id) ? ` for ${source.interaction_id}` : '';
    throw createHttpError(`Ambiguous relationship/social state shorthand "${field}"${sourceLabel}`, 409);
  }
  return allowed[0];
}

function resolveTarget({ registry, scene, targetId, source = {}, requireNpc = false }) {
  const requested = cleanText(targetId ?? source.target_id ?? source.participant_id);
  if (requested && registry.participantRefs.has(requested)) {
    const target = registry.participantRefs.get(requested);
    if (requireNpc && !target.npc_id) {
      throw createHttpError(`Persistent relationship target "${requested}" does not resolve to an NPC`, 409);
    }
    return target;
  }

  if (!requested && registry.participantRefs.size === 1) {
    const target = [...registry.participantRefs.values()][0];
    if (requireNpc && !target.npc_id) {
      throw createHttpError(`Persistent relationship target "${target.participant_id}" does not resolve to an NPC`, 409);
    }
    return target;
  }

  if (requested) {
    for (const target of registry.participantRefs.values()) {
      if (candidateNpcKeys(requested).includes(target.npc_key)) {
        return target;
      }
    }
  }

  if (requireNpc) {
    throw createHttpError('Persistent relationship write requires an NPC target', 409);
  }
  return {
    participant_id: requested || null,
    target_id: requested || null,
    npc_id: null,
    npc_key: null,
    npc_name: null,
    authored: null,
  };
}

function defaultValueFor(definition, target = null) {
  const participant = normalizeObject(target?.authored);
  const field = definition.field;
  const participantDefaults = normalizeObject(
    definition.scope === persistentScope
      ? participant.relationship_defaults ?? participant.default_relationship_state
      : participant.scene_posture_defaults ?? participant.default_scene_posture
  );
  if (Object.prototype.hasOwnProperty.call(participantDefaults, field)) {
    return participantDefaults[field];
  }
  if (definition.default !== undefined) {
    return definition.default;
  }
  if (definition.type === 'number') {
    return 0;
  }
  if (definition.type === 'boolean') {
    return false;
  }
  if (definition.type === 'tag_set') {
    return [];
  }
  return null;
}

async function readPersistentState({ context, definition, target, executor }) {
  if (!target?.npc_id) {
    return {
      row: null,
      value: defaultValueFor(definition, target),
      defaulted: true,
    };
  }
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_npc_relationship_state
      WHERE campaign_id = $1
        AND COALESCE(character_id, 0) = COALESCE($2, 0)
        AND npc_id = $3
        AND field_name = $4
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [context.campaign.campaign_id, context.character.character_id, target.npc_id, definition.field]
  );
  const row = result.rows[0] ?? null;
  return {
    row,
    value: row ? row.value_json : defaultValueFor(definition, target),
    defaulted: !row,
  };
}

async function readSceneState({ context, stateRow, definition, target, scope, executor }) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_dialogue_scene_state
      WHERE campaign_id = $1
        AND character_id = $2
        AND dialogue_scene_key = $3
        AND COALESCE(dialogue_session_id, 0) = 0
        AND COALESCE(npc_id, 0) = COALESCE($4, 0)
        AND COALESCE(participant_id, '') = COALESCE($5, '')
        AND field_name = $6
        AND scope = $7
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [
      context.campaign.campaign_id,
      context.character.character_id,
      stateRow.dialogue_scene_key,
      target?.npc_id ?? null,
      target?.participant_id ?? null,
      definition.field,
      scope,
    ]
  );
  const row = result.rows[0] ?? null;
  return {
    row,
    value: row ? row.value_json : defaultValueFor(definition, target),
    defaulted: !row,
  };
}

async function insertAuditRecord({ context, stateRow, target, definition, scope, source, auditType, oldValue, newValue, reason, playerFacingStatus, executor }) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_relationship_audit_record (
        campaign_id,
        world_instance_id,
        character_id,
        dialogue_scene_state_id,
        npc_id,
        participant_id,
        source_scene_id,
        source_interaction_id,
        source_result_branch,
        audit_type,
        field_name,
        scope,
        old_value_json,
        new_value_json,
        reason,
        player_facing_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16)
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.campaign.world_instance_id,
      context.character.character_id,
      stateRow?.id ?? null,
      target?.npc_id ?? null,
      target?.participant_id ?? null,
      context.campaign.current_scene_id ?? null,
      cleanText(source?.interaction_id) || null,
      cleanText(source?.result_branch) || null,
      auditType,
      definition.field,
      scope,
      json(oldValue),
      json(newValue),
      cleanText(reason ?? source?.reason) || null,
      playerFacingStatus,
    ]
  );
  return result.rows[0];
}

function playerFacingStatusFor(write) {
  const visibility = cleanText(write.visibility ?? write.player_facing_status);
  if (visibility === 'player_visible') {
    return 'player_visible';
  }
  if (visibility === 'player_perceived' || visibility === 'gm_and_player_perceived') {
    return 'player_perceived';
  }
  if (visibility === 'canonical_history') {
    return 'canonical_history';
  }
  return 'hidden';
}

function compareValues(actual, operator, expected) {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gte':
    case '>=':
      return Number(actual) >= Number(expected);
    case 'gt':
    case '>':
      return Number(actual) > Number(expected);
    case 'lte':
    case '<=':
      return Number(actual) <= Number(expected);
    case 'lt':
    case '<':
      return Number(actual) < Number(expected);
    case 'in':
      return normalizeArray(expected).includes(actual);
    case 'includes':
      return normalizeArray(actual).includes(expected);
    case 'exists':
      return actual !== null && actual !== undefined;
    default:
      throw createHttpError(`Unsupported relationship/social state operator "${operator}"`, 409);
  }
}

function applyWriteValue(definition, oldValue, write) {
  const operation = cleanText(write.operation);
  if (operation === 'clear') {
    return defaultValueFor(definition);
  }
  if (operation === 'set') {
    return coerceAndValidateValue(definition, write.value);
  }
  if (definition.type === 'ladder') {
    const values = normalizeArray(definition.values);
    const currentIndex = Math.max(0, values.findIndex((entry) => entry === oldValue));
    const delta = Number(write.value ?? 1);
    if (!Number.isFinite(delta)) {
      throw createHttpError(`Ladder write for "${definition.field}" requires numeric movement`, 409);
    }
    const nextIndex =
      operation === 'increment'
        ? Math.min(values.length - 1, currentIndex + Math.abs(delta))
        : operation === 'decrement'
          ? Math.max(0, currentIndex - Math.abs(delta))
          : currentIndex;
    return values[nextIndex];
  }
  if (definition.type === 'number') {
    const current = Number(oldValue ?? 0);
    const delta = Number(write.value ?? 1);
    if (!Number.isFinite(delta)) {
      throw createHttpError(`Numeric write for "${definition.field}" requires a number`, 409);
    }
    if (operation === 'increment') {
      return current + delta;
    }
    if (operation === 'decrement') {
      return current - delta;
    }
  }
  if (definition.type === 'tag_set') {
    const current = new Set(normalizeArray(oldValue));
    if (operation === 'append') {
      current.add(write.value);
      return [...current];
    }
    if (operation === 'remove') {
      current.delete(write.value);
      return [...current];
    }
  }
  throw createHttpError(`Unsupported relationship/social state write operation "${operation}" for "${definition.field}"`, 409);
}

function coerceAndValidateValue(definition, value) {
  if (definition.type === 'ladder' || definition.type === 'enum') {
    const values = normalizeArray(definition.values);
    if (values.length > 0 && !values.includes(value)) {
      throw createHttpError(`Value "${value}" is not valid for relationship/social field "${definition.field}"`, 409);
    }
    return value;
  }
  if (definition.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw createHttpError(`Relationship/social field "${definition.field}" requires a numeric value`, 409);
    }
    return number;
  }
  if (definition.type === 'boolean') {
    return Boolean(value);
  }
  if (definition.type === 'tag_set') {
    return normalizeArray(value);
  }
  return value;
}

async function upsertPersistentState({ context, definition, target, value, source, audit, executor }) {
  const existing = await readPersistentState({ context, definition, target, executor });
  if (existing.row) {
    const updated = await executor.query(
      `
        UPDATE dnd5e_dialogue_npc_relationship_state
        SET value_json = $2::jsonb,
            source_record_type = $3,
            source_record_id = $4,
            last_audit_record_id = $5,
            last_changed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        existing.row.id,
        json(value),
        cleanText(source?.type) || 'dialogue_relationship_state',
        source?.record_id ?? null,
        audit?.id ?? null,
      ]
    );
    return updated.rows[0];
  }

  const inserted = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_npc_relationship_state (
        campaign_id,
        world_instance_id,
        character_id,
        npc_id,
        field_name,
        value_json,
        source_record_type,
        source_record_id,
        last_audit_record_id
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.campaign.world_instance_id,
      context.character.character_id,
      target.npc_id,
      definition.field,
      json(value),
      cleanText(source?.type) || 'dialogue_relationship_state',
      source?.record_id ?? null,
      audit?.id ?? null,
    ]
  );
  return inserted.rows[0];
}

async function upsertSceneState({ context, stateRow, definition, target, scope, value, source, executor }) {
  const existing = await readSceneState({ context, stateRow, definition, target, scope, executor });
  if (existing.row) {
    const updated = await executor.query(
      `
        UPDATE dnd5e_dialogue_scene_state
        SET value_json = $2::jsonb,
            source_record_type = $3,
            source_record_id = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        existing.row.id,
        json(value),
        cleanText(source?.type) || 'dialogue_relationship_state',
        source?.record_id ?? null,
      ]
    );
    return updated.rows[0];
  }

  const inserted = await executor.query(
    `
      INSERT INTO dnd5e_dialogue_scene_state (
        campaign_id,
        world_instance_id,
        character_id,
        dialogue_scene_key,
        scene_id,
        npc_id,
        participant_id,
        field_name,
        value_json,
        scope,
        expires_at,
        decay_metadata_json,
        cleared_by_event_id,
        source_record_type,
        source_record_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13, $14, $15)
      RETURNING *
    `,
    [
      context.campaign.campaign_id,
      context.campaign.world_instance_id,
      context.character.character_id,
      stateRow.dialogue_scene_key,
      context.campaign.current_scene_id ?? null,
      target?.npc_id ?? null,
      target?.participant_id ?? null,
      definition.field,
      json(value),
      scope,
      source?.expires_at ?? null,
      json(source?.decay_metadata ?? {}),
      source?.cleared_by_event_id ?? null,
      cleanText(source?.type) || 'dialogue_relationship_state',
      source?.record_id ?? null,
    ]
  );
  return inserted.rows[0];
}

export async function initializeDialogueRelationshipState({ context, scene, stateRow, executor = { query } }) {
  const registry = await buildRelationshipRegistry({ context, scene, executor });
  for (const target of registry.participantRefs.values()) {
    for (const definition of registry.definitions) {
      if (!validScopes.has(definition.scope)) {
        continue;
      }
      const value = defaultValueFor(definition, target);
      if (definition.scope === persistentScope) {
        if (!target.npc_id) {
          continue;
        }
        const existing = await readPersistentState({ context, definition, target, executor });
        if (!existing.row) {
          await upsertPersistentState({
            context,
            definition,
            target,
            value,
            source: { type: 'dialogue_relationship_initialization' },
            audit: null,
            executor,
          });
        }
      } else {
        const existing = await readSceneState({
          context,
          stateRow,
          definition,
          target,
          scope: definition.scope,
          executor,
        });
        if (!existing.row) {
          await upsertSceneState({
            context,
            stateRow,
            definition,
            target,
            scope: definition.scope,
            value,
            source: { type: 'dialogue_relationship_initialization' },
            executor,
          });
        }
      }
    }
  }
  return registry;
}

export async function readRelationshipState({ context, scene, stateRow, read, source = {}, executor = { query } }) {
  const registry = await buildRelationshipRegistry({ context, scene, executor });
  const normalized = normalizeRead(read, source);
  if (!normalized) {
    throw createHttpError('Relationship/social state read is invalid', 409);
  }
  const definition = resolveDefinition(registry, normalized, source);
  const scope = normalizeScope(normalized.scope) || definition.scope;
  const target = resolveTarget({
    registry,
    scene,
    targetId: normalized.target_id,
    source,
    requireNpc: scope === persistentScope,
  });

  if (normalized.shorthand === true && !cleanText(normalized.scope)) {
    await insertAuditRecord({
      context,
      stateRow,
      target,
      definition,
      scope,
      source,
      auditType: 'shorthand_resolution',
      oldValue: null,
      newValue: { field: definition.field, scope },
      reason: 'Resolved unambiguous relationship/social state shorthand.',
      playerFacingStatus: 'hidden',
      executor,
    });
  }

  const state =
    scope === persistentScope
      ? await readPersistentState({ context, definition, target, executor })
      : await readSceneState({ context, stateRow, definition, target, scope, executor });

  await insertAuditRecord({
    context,
    stateRow,
    target,
    definition,
    scope,
    source,
    auditType: source.audit_type ?? 'read',
    oldValue: null,
    newValue: state.value,
    reason: source.reason ?? 'Relationship/social state read.',
    playerFacingStatus: 'hidden',
    executor,
  });

  return {
    field: definition.field,
    scope,
    target_id: target.participant_id,
    npc_id: target.npc_id,
    value: state.value,
    defaulted: state.defaulted,
    definition,
  };
}

export async function evaluateRelationshipReadConditions({ context, scene, stateRow, owner, source = {}, executor = { query } }) {
  const reads = collectRelationshipReads(owner);
  if (reads.length === 0) {
    return {
      available: true,
      failures: [],
      reads: [],
    };
  }
  const evaluated = [];
  const failures = [];
  for (const read of reads) {
    const normalized = normalizeRead(read, source);
    if (!normalized) {
      failures.push({ code: 'invalid_relationship_read' });
      continue;
    }
    const state = await readRelationshipState({
      context,
      scene,
      stateRow,
      read: normalized,
      source: { ...source, audit_type: 'availability_check' },
      executor,
    });
    const ok = compareValues(state.value, normalized.operator, normalized.value);
    const summary = {
      field: state.field,
      scope: state.scope,
      target_id: state.target_id,
      operator: normalized.operator,
      met: ok,
    };
    evaluated.push(summary);
    if (!ok) {
      failures.push(summary);
    }
  }
  return {
    available: failures.length === 0,
    failures,
    reads: evaluated,
  };
}

export async function applyRelationshipStateWrites({ context, scene, stateRow, owner, writes, source = {}, executor = { query } }) {
  const registry = await buildRelationshipRegistry({ context, scene, executor });
  const allWrites = [
    ...collectRelationshipWrites(owner),
    ...normalizeArray(writes),
  ].filter((write) => normalizeObject(write).field || normalizeObject(write).key);
  const applied = [];

  for (const rawWrite of allWrites) {
    const write = normalizeObject(rawWrite);
    const scope = normalizeScope(write.scope);
    if (!scope) {
      throw createHttpError('Relationship/social state write requires an explicit scope', 409);
    }
    if (!validScopes.has(scope)) {
      throw createHttpError(`Relationship/social state scope "${scope}" is not supported`, 409);
    }
    const definition = resolveDefinition(registry, { ...write, scope }, source);
    if (!definition.allowed_write_scopes.includes(scope)) {
      throw createHttpError(`Relationship/social state field "${definition.field}" cannot be written to ${scope}`, 409);
    }
    const target = resolveTarget({
      registry,
      scene,
      targetId: cleanText(write.target_id ?? write.target ?? source.target_id),
      source,
      requireNpc: scope === persistentScope,
    });
    const existing =
      scope === persistentScope
        ? await readPersistentState({ context, definition, target, executor })
        : await readSceneState({ context, stateRow, definition, target, scope, executor });
    const nextValue = applyWriteValue(definition, existing.value, write);
    const playerFacingStatus = playerFacingStatusFor(write);

    const audit = await insertAuditRecord({
      context,
      stateRow,
      target,
      definition,
      scope,
      source,
      auditType: 'write',
      oldValue: existing.value,
      newValue: nextValue,
      reason: write.reason ?? write.provenance ?? source.reason,
      playerFacingStatus,
      executor,
    });

    if (scope === persistentScope) {
      await upsertPersistentState({
        context,
        definition,
        target,
        value: nextValue,
        source,
        audit,
        executor,
      });
    } else {
      await upsertSceneState({
        context,
        stateRow,
        definition,
        target,
        scope,
        value: nextValue,
        source: {
          ...source,
          expires_at: write.expires_at,
          decay_metadata: write.decay_metadata,
          cleared_by_event_id: write.cleared_by_event_id,
        },
        executor,
      });
    }

    applied.push({
      audit_record_id: String(audit.id),
      field: definition.field,
      scope,
      target_id: target.participant_id,
      player_facing_status: playerFacingStatus,
      summary: cleanText(write.summary ?? write.player_summary ?? write.reason) || null,
      player_visible: playerFacingStatuses.has(playerFacingStatus),
    });
  }

  return {
    applied,
    audit_record_ids: applied.map((entry) => entry.audit_record_id),
    player_facing_updates: applied
      .filter((entry) => entry.player_visible)
      .map((entry) => ({
        target_id: entry.target_id,
        summary: entry.summary,
        player_facing_status: entry.player_facing_status,
      })),
  };
}

export const relationshipStateRuntimeInternalsForTests = {
  buildRelationshipRegistry,
  collectRelationshipReads,
  collectRelationshipWrites,
  parseShorthandRead,
};
