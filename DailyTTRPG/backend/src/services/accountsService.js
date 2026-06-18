import { query, withTransaction } from '../config/db.js';
import {
  insertAccountQuery,
  selectAccountByIdQuery,
  selectAccountByIdForUpdateQuery,
  selectAccountCharactersQuery,
  updateAccountActiveCharacterQuery,
} from '../db/queries/accounts.js';
import { createHttpError } from '../utils/httpError.js';
import { serializeAccount } from '../utils/serializers.js';

export async function createAccount(input) {
  try {
    const result = await query(insertAccountQuery, [
      input.email,
      input.phone_number,
      input.phone_number_normalized,
      input.display_name,
      input.first_name,
      input.last_name,
      input.phone_number_verified_at,
      input.sms_opt_in_at,
      input.sms_opt_out_at,
      input.preferred_channel,
    ]);

    return serializeAccount(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      throw createHttpError('An account with that email or phone number already exists', 409);
    }

    if (error.code === '23514') {
      throw createHttpError('An account must include at least one contact field', 400);
    }

    throw error;
  }
}

export async function getAccountById(accountId) {
  const result = await query(selectAccountByIdQuery, [accountId]);
  return serializeAccount(result.rows[0] || null);
}

async function getAccountByIdForUpdate(accountId, executor) {
  const result = await executor.query(selectAccountByIdForUpdateQuery, [accountId]);
  return serializeAccount(result.rows[0] || null);
}

export async function requireAccount(accountId) {
  const account = await getAccountById(accountId);

  if (!account) {
    throw createHttpError('Account not found', 404);
  }

  return account;
}

export async function listCharactersForAccount(accountId) {
  const result = await query(selectAccountCharactersQuery, [accountId]);
  return result.rows;
}

export async function setActiveCharacterForAccount(accountId, characterId) {
  return withTransaction(async (client) => {
    const account = await getAccountByIdForUpdate(accountId, client);

    if (!account) {
      throw createHttpError('Account not found', 404);
    }

    const characterResult = await client.query(
      `
        SELECT id, account_id, is_active
        FROM dnd5e_character
        WHERE id = $1
        FOR UPDATE
      `,
      [characterId]
    );

    const character = characterResult.rows[0];

    if (!character) {
      throw createHttpError('Character not found', 404);
    }

    if (Number(character.account_id) !== accountId) {
      throw createHttpError('Character does not belong to that account', 400);
    }

    await client.query(
      `
        UPDATE dnd5e_character
        SET
          is_active = FALSE,
          updated_at = NOW()
        WHERE account_id = $1
      `,
      [accountId]
    );

    await client.query(
      `
        UPDATE dnd5e_character
        SET
          is_active = TRUE,
          updated_at = NOW()
        WHERE id = $1
      `,
      [characterId]
    );

    const updatedAccount = await client.query(updateAccountActiveCharacterQuery, [accountId, characterId]);
    return serializeAccount(updatedAccount.rows[0]);
  });
}
