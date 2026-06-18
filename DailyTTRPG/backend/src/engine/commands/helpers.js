import { createHttpError } from '../../utils/httpError.js';

export function readRequiredPositiveInteger(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

export function readOptionalNullablePositiveInteger(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return readRequiredPositiveInteger(value, label);
}

export function readRequiredPayloadObject(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    throw createHttpError('payload must be a JSON object', 400);
  }

  return value;
}

export function readOptionalPositiveInteger(value, label, defaultValue = null) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return readRequiredPositiveInteger(value, label);
}

export function readRequiredCommandType(value) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw createHttpError('type is required', 400);
  }

  return normalized;
}
