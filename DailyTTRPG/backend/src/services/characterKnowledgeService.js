import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { ensureLivingWorldSchema } from './livingWorldSchema.js';

function json(value) {
  return JSON.stringify(value ?? {});
}

function mapKnowledge(row) {
  if (!row) {
    return null;
  }

  return {
    character_knowledge_id: String(row.id),
    character_id: String(row.character_id),
    campaign_id: String(row.campaign_id),
    world_instance_id: row.world_instance_id ? String(row.world_instance_id) : null,
    knowledge_definition_id: row.knowledge_definition_id
      ? String(row.knowledge_definition_id)
      : null,
    knowledge_id: row.knowledge_key,
    knowledge_key: row.knowledge_key,
    type: row.definition_type ?? row.knowledge_type,
    status: row.status ?? 'known',
    confidence: row.confidence ?? 'observed',
    public_label: row.public_label ?? row.title,
    text: row.canonical_text ?? row.summary,
    title: row.title,
    summary: row.summary,
    tags: row.tags_json ?? [],
    source_event_id: row.source_event_id ? String(row.source_event_id) : null,
    known_at: row.known_at ?? row.created_at,
    metadata: row.metadata_json ?? {},
  };
}

async function resolveCampaignIdForCharacter(characterId, executor) {
  const result = await executor.query(
    `
      SELECT campaign_id
      FROM dnd5e_campaign_character
      WHERE character_id = $1
        AND membership_status = 'active'
        AND is_active = TRUE
      ORDER BY is_active_context DESC, is_default_solo_campaign DESC, joined_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [characterId]
  );
  return result.rows[0]?.campaign_id ?? null;
}

async function getKnowledgeDefinition(knowledgeId, executor) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_knowledge_definition
      WHERE knowledge_key = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [knowledgeId]
  );
  return result.rows[0] ?? null;
}

export async function grantKnowledge(
  {
    characterId,
    worldInstanceId,
    campaignId = null,
    knowledgeId,
    sourceEventId = null,
    confidence = 'observed',
    status = 'known',
    metadata = {},
    fallback = {},
  },
  executor = { query }
) {
  await ensureLivingWorldSchema();

  if (!characterId || !worldInstanceId || !knowledgeId) {
    throw createHttpError('characterId, worldInstanceId, and knowledgeId are required', 400);
  }

  const resolvedCampaignId = campaignId ?? (await resolveCampaignIdForCharacter(characterId, executor));
  if (!resolvedCampaignId) {
    throw createHttpError('campaignId is required to grant character knowledge', 400);
  }

  const definition = await getKnowledgeDefinition(knowledgeId, executor);
  const knowledgeType = definition?.knowledge_type ?? fallback.knowledge_type ?? fallback.type ?? 'lore';
  const title = definition?.public_label ?? fallback.title ?? knowledgeId;
  const summary = definition?.canonical_text ?? fallback.summary ?? fallback.text ?? title;
  const mergedMetadata = {
    ...(definition?.metadata_json ?? {}),
    ...metadata,
  };

  const result = await executor.query(
    `
      INSERT INTO dnd5e_character_knowledge (
        campaign_id,
        character_id,
        world_instance_id,
        knowledge_definition_id,
        knowledge_type,
        knowledge_key,
        title,
        summary,
        metadata_json,
        source_type,
        source_entity_id,
        source_event_id,
        status,
        confidence,
        known_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (campaign_id, character_id, knowledge_type, knowledge_key)
      DO UPDATE SET
        world_instance_id = COALESCE(EXCLUDED.world_instance_id, dnd5e_character_knowledge.world_instance_id),
        knowledge_definition_id = COALESCE(EXCLUDED.knowledge_definition_id, dnd5e_character_knowledge.knowledge_definition_id),
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        metadata_json = dnd5e_character_knowledge.metadata_json || EXCLUDED.metadata_json,
        source_event_id = COALESCE(EXCLUDED.source_event_id, dnd5e_character_knowledge.source_event_id),
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence,
        known_at = COALESCE(dnd5e_character_knowledge.known_at, EXCLUDED.known_at),
        updated_at = NOW()
      RETURNING *
    `,
    [
      resolvedCampaignId,
      characterId,
      worldInstanceId,
      definition?.id ?? null,
      knowledgeType,
      knowledgeId,
      title,
      summary,
      json(mergedMetadata),
      sourceEventId ? 'world_event' : (fallback.source_type ?? 'living_world'),
      fallback.source_entity_id ?? null,
      sourceEventId,
      status,
      confidence,
    ]
  );

  return mapKnowledge({
    ...result.rows[0],
    definition_type: definition?.knowledge_type,
    public_label: definition?.public_label,
    canonical_text: definition?.canonical_text,
    tags_json: definition?.tags_json,
  });
}

export async function hasKnowledge({ characterId, worldInstanceId, knowledgeId }, executor = { query }) {
  await ensureLivingWorldSchema();
  const result = await executor.query(
    `
      SELECT 1
      FROM dnd5e_character_knowledge
      WHERE character_id = $1
        AND world_instance_id = $2
        AND knowledge_key = $3
        AND status = 'known'
      LIMIT 1
    `,
    [characterId, worldInstanceId, knowledgeId]
  );
  return result.rowCount > 0;
}

export async function listKnowledgeForCharacter(
  { characterId, worldInstanceId, campaignId = null, types = null },
  executor = { query }
) {
  await ensureLivingWorldSchema();
  const result = await executor.query(
    `
      SELECT
        knowledge.*,
        definition.knowledge_type AS definition_type,
        definition.public_label,
        definition.canonical_text,
        definition.tags_json
      FROM dnd5e_character_knowledge knowledge
      LEFT JOIN dnd5e_knowledge_definition definition ON definition.id = knowledge.knowledge_definition_id
      WHERE knowledge.character_id = $1
        AND (
          knowledge.world_instance_id = $2
          OR (
            $4::bigint IS NOT NULL
            AND knowledge.campaign_id = $4
            AND knowledge.world_instance_id IS NULL
          )
        )
        AND knowledge.status = 'known'
        AND (
          $3::text[] IS NULL
          OR COALESCE(definition.knowledge_type, knowledge.knowledge_type) = ANY($3::text[])
        )
      ORDER BY knowledge.known_at DESC NULLS LAST, knowledge.created_at DESC, knowledge.id DESC
    `,
    [characterId, worldInstanceId, types, campaignId]
  );

  return result.rows.map(mapKnowledge);
}

export async function listKnownClues({ characterId, worldInstanceId }, executor = { query }) {
  return listKnowledgeForCharacter({ characterId, worldInstanceId, types: ['clue', 'lore'] }, executor);
}

export async function listKnownEntityFacts(
  { characterId, worldInstanceId, entityId },
  executor = { query }
) {
  const all = await listKnowledgeForCharacter(
    { characterId, worldInstanceId, types: ['entity_knowledge'] },
    executor
  );
  return all.filter((entry) => entry.metadata?.entity_id === entityId);
}
