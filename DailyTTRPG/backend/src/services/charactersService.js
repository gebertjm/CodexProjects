import { query, withTransaction } from '../config/db.js';
import {
  insertCharacterQuery,
  selectCharacterByIdQuery,
  selectAnyActiveCharacterForAccountQuery,
  selectCharacterSummaryByIdQuery,
} from '../db/queries/characters.js';
import {
  insertCampaignCharacterQuery,
  insertCampaignLocationStatesForCampaignQuery,
  insertCampaignQuery,
  insertCampaignSceneStatesForCampaignQuery,
} from '../db/queries/events.js';
import { createHttpError } from '../utils/httpError.js';
import { getDefaultWorldId } from './worldContentService.js';

const lookupTables = {
  race_id: 'dnd5e_race',
  subrace_id: 'dnd5e_subrace',
  class_id: 'dnd5e_class',
  subclass_id: 'dnd5e_subclass',
  background_id: 'dnd5e_background',
  alignment_id: 'dnd5e_alignment',
};

async function validateCharacterLookupsWithExecutor(input, executor) {
  for (const [fieldName, tableName] of Object.entries(lookupTables)) {
    if (input[fieldName] !== null && input[fieldName] !== undefined) {
      const result = await executor.query(`SELECT id FROM ${tableName} WHERE id = $1`, [input[fieldName]]);

      if (result.rowCount === 0) {
        throw createHttpError(`Invalid ${fieldName}`, 400);
      }
    }
  }
}

function mapCharacterRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    account_id: row.account_id,
    world_id: row.world_id,
    world:
      row.world_id !== undefined
        ? {
            id: row.world_id,
            name: row.world_name,
            slug: row.world_slug,
          }
        : undefined,
    name: row.name,
    ruleset_version: row.ruleset_version,
    level: row.level,
    experience_points: row.experience_points,
    pending_level_count: row.pending_level_count ?? 0,
    level_up_available: row.level_up_available ?? false,
    last_level_up_available_at: row.last_level_up_available_at ?? null,
    strength: row.strength,
    dexterity: row.dexterity,
    constitution: row.constitution,
    intelligence: row.intelligence,
    wisdom: row.wisdom,
    charisma: row.charisma,
    max_hit_points: row.max_hit_points,
    current_hit_points: row.current_hit_points,
    temporary_hit_points: row.temporary_hit_points,
    armor_class: row.armor_class,
    speed: row.speed,
    proficiency_bonus: row.proficiency_bonus,
    inspiration: row.inspiration,
    personality_traits: row.personality_traits,
    ideals: row.ideals,
    bonds: row.bonds,
    flaws: row.flaws,
    backstory: row.backstory,
    notes: row.notes,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    race: row.race_id ? { id: row.race_id, name: row.race_name, slug: row.race_slug } : null,
    subrace: row.subrace_id ? { id: row.subrace_id, name: row.subrace_name, slug: row.subrace_slug } : null,
    class: row.class_id ? { id: row.class_id, name: row.class_name, slug: row.class_slug } : null,
    subclass: row.subclass_id ? { id: row.subclass_id, name: row.subclass_name, slug: row.subclass_slug } : null,
    background: row.background_id
      ? { id: row.background_id, name: row.background_name, slug: row.background_slug }
      : null,
    alignment: row.alignment_id
      ? {
          id: row.alignment_id,
          name: row.alignment_name,
          abbreviation: row.alignment_abbreviation,
        }
      : null,
  };
}

export async function createCharacter(input) {
  try {
    return await withTransaction(async (client) => {
      const accountResult = await client.query(
        `
          SELECT id, active_character_id
          FROM account
          WHERE id = $1
          FOR UPDATE
        `,
        [input.account_id]
      );

      const account = accountResult.rows[0];

      if (!account) {
        throw createHttpError('Account not found', 404);
      }

      await validateCharacterLookupsWithExecutor(input, client);

      const worldId = input.world_id ?? (await getDefaultWorldId(client));
      const worldResult = await client.query('SELECT id FROM dnd5e_world WHERE id = $1', [worldId]);

      if (worldResult.rowCount === 0) {
        throw createHttpError('Invalid world_id', 400);
      }

      const activeCharacterResult = await client.query(selectAnyActiveCharacterForAccountQuery, [input.account_id]);
      const hasActiveCharacter = activeCharacterResult.rowCount > 0;
      const shouldActivateCharacter = !account.active_character_id && !hasActiveCharacter;

      const result = await client.query(insertCharacterQuery, [
        input.account_id,
        worldId,
        input.name,
        input.race_id,
        input.subrace_id,
        input.class_id,
        input.subclass_id,
        input.background_id,
        input.alignment_id,
        input.level,
        input.experience_points,
        input.strength,
        input.dexterity,
        input.constitution,
        input.intelligence,
        input.wisdom,
        input.charisma,
        input.max_hit_points,
        input.current_hit_points,
        input.temporary_hit_points,
        input.armor_class,
        input.speed,
        input.proficiency_bonus,
        input.personality_traits,
        input.ideals,
        input.bonds,
        input.flaws,
        input.backstory,
        input.notes,
        shouldActivateCharacter,
      ]);

      const createdCharacter = result.rows[0];

      const soloCampaignResult = await client.query(insertCampaignQuery, [
        worldId,
        `${createdCharacter.name} Solo Free-Roam`,
        `solo-character-${createdCharacter.id}`,
        'solo',
        'active',
        'Default solo campaign for fallback free-roam play.',
        input.account_id,
        true,
      ]);
      const soloCampaignId = Number(soloCampaignResult.rows[0].id);
      await client.query(insertCampaignLocationStatesForCampaignQuery, [soloCampaignId]);
      await client.query(insertCampaignSceneStatesForCampaignQuery, [soloCampaignId]);
      await client.query(insertCampaignCharacterQuery, [
        soloCampaignId,
        createdCharacter.id,
        input.account_id,
        true,
        'active',
        true,
        true,
      ]);

      if (shouldActivateCharacter) {
        await client.query(
          `
            UPDATE account
            SET
              active_character_id = $2,
              updated_at = NOW()
            WHERE id = $1
          `,
          [input.account_id, createdCharacter.id]
        );
      }

      const fullCharacterResult = await client.query(selectCharacterByIdQuery, [createdCharacter.id]);
      return mapCharacterRow(fullCharacterResult.rows[0] || null);
    });
  } catch (error) {
    if (error.code === '23503') {
      throw createHttpError('Invalid referenced record in character payload', 400);
    }

    if (error.code === '23514') {
      throw createHttpError('Character payload failed a database validation rule', 400);
    }

    if (error.code === '23505') {
      throw createHttpError('Only one active character is allowed per account', 409);
    }

    throw error;
  }
}

export async function getCharacterById(characterId) {
  const result = await query(selectCharacterByIdQuery, [characterId]);
  return mapCharacterRow(result.rows[0] || null);
}

export async function inactivateCharacter(characterId) {
  return withTransaction(async (client) => {
    const summaryResult = await client.query(selectCharacterSummaryByIdQuery, [characterId]);
    const character = summaryResult.rows[0];

    if (!character) {
      throw createHttpError('Character not found', 404);
    }

    await client.query(
      `
        UPDATE dnd5e_character
        SET
          is_active = FALSE,
          updated_at = NOW()
        WHERE id = $1
      `,
      [characterId]
    );

    await client.query(
      `
        UPDATE account
        SET
          active_character_id = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND active_character_id = $2
      `,
      [character.account_id, characterId]
    );

    const result = await client.query(selectCharacterByIdQuery, [characterId]);
    return mapCharacterRow(result.rows[0] || null);
  });
}
