import { createHttpError } from './httpError.js';

export function normalizePhoneNumber(value) {
  if (value === undefined || value === null) {
    throw createHttpError('phone_number is required', 400);
  }

  const rawValue = String(value).trim();

  if (!rawValue) {
    throw createHttpError('phone_number is required', 400);
  }

  const digitsOnly = rawValue.replace(/\D/g, '');

  if (!digitsOnly) {
    throw createHttpError('phone_number must contain digits', 400);
  }

  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }

  throw createHttpError('phone_number must normalize to a valid 10-15 digit value', 400);
}
