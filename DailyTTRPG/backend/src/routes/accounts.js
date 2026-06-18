import { Router } from 'express';
import {
  createAccount,
  getAccountById,
  listCharactersForAccount,
  requireAccount,
  setActiveCharacterForAccount,
} from '../services/accountsService.js';
import { createHttpError } from '../utils/httpError.js';
import { normalizePhoneNumber } from '../utils/phone.js';

const router = Router();

function parseIdParam(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function cleanOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalTimestamp(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(`${label} must be a valid date-time string`, 400);
  }

  return parsed.toISOString();
}

function parsePreferredChannel(value) {
  const channel = cleanOptionalString(value)?.toLowerCase() || 'sms';

  if (!['sms', 'email'].includes(channel)) {
    throw createHttpError('preferred_channel must be either sms or email', 400);
  }

  return channel;
}

router.post('/', async (req, res, next) => {
  try {
    const displayName = cleanOptionalString(req.body.display_name);
    const email = cleanOptionalString(req.body.email)?.toLowerCase() || null;
    const phoneNumber = cleanOptionalString(req.body.phone_number);
    const firstName = cleanOptionalString(req.body.first_name);
    const lastName = cleanOptionalString(req.body.last_name);
    const phoneNumberVerifiedAt = parseOptionalTimestamp(
      req.body.phone_number_verified_at,
      'phone_number_verified_at'
    );
    const smsOptInAt = parseOptionalTimestamp(req.body.sms_opt_in_at, 'sms_opt_in_at');
    const smsOptOutAt = parseOptionalTimestamp(req.body.sms_opt_out_at, 'sms_opt_out_at');
    const preferredChannel = parsePreferredChannel(req.body.preferred_channel);

    if (!displayName) {
      throw createHttpError('display_name is required', 400);
    }

    if (!phoneNumber) {
      throw createHttpError('phone_number is required', 400);
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    const account = await createAccount({
      display_name: displayName,
      email,
      phone_number: phoneNumber,
      phone_number_normalized: normalizedPhoneNumber,
      first_name: firstName,
      last_name: lastName,
      phone_number_verified_at: phoneNumberVerifiedAt,
      sms_opt_in_at: smsOptInAt,
      sms_opt_out_at: smsOptOutAt,
      preferred_channel: preferredChannel,
    });

    res.status(201).json({
      data: account,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const accountId = parseIdParam(req.params.id, 'Account id');
    const account = await getAccountById(accountId);

    if (!account) {
      throw createHttpError('Account not found', 404);
    }

    res.json({
      data: account,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/characters', async (req, res, next) => {
  try {
    const accountId = parseIdParam(req.params.id, 'Account id');
    await requireAccount(accountId);
    const characters = await listCharactersForAccount(accountId);

    res.json({
      data: characters,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/active-character', async (req, res, next) => {
  try {
    const accountId = parseIdParam(req.params.id, 'Account id');
    const characterId = parseIdParam(req.body.character_id, 'character_id');
    const account = await setActiveCharacterForAccount(accountId, characterId);

    res.json({
      data: account,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
