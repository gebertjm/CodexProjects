import { env } from '../config/env.js';
import { createHttpError } from '../utils/httpError.js';
import { getFirebaseAuth } from './firebaseAdmin.js';

function decodeTestToken(token) {
  if (!env.ALLOW_TEST_FIREBASE_AUTH || !token.startsWith('test-firebase:')) {
    return null;
  }

  const encoded = token.slice('test-firebase:'.length);
  const json = Buffer.from(encoded, 'base64url').toString('utf8');
  const payload = JSON.parse(json);

  if (!payload.uid || String(payload.uid).trim() === '') {
    throw createHttpError('Test Firebase token must include uid', 401);
  }

  return {
    uid: String(payload.uid),
    email: payload.email ? String(payload.email).toLowerCase() : null,
    name: payload.name ? String(payload.name) : null,
    picture: payload.picture ? String(payload.picture) : null,
    email_verified: Boolean(payload.email_verified),
    firebase: {
      sign_in_provider: payload.provider ?? 'test',
    },
  };
}

export function extractBearerToken(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw createHttpError('Missing bearer token', 401);
  }

  return token;
}

export async function verifyFirebaseBearerToken(req) {
  const token = extractBearerToken(req);
  const testDecoded = decodeTestToken(token);

  if (testDecoded) {
    return testDecoded;
  }

  const auth = getFirebaseAuth();

  if (!auth) {
    throw createHttpError('Firebase Admin credentials are not configured', 503);
  }

  try {
    return await auth.verifyIdToken(token);
  } catch (_error) {
    throw createHttpError('Invalid Firebase token', 401);
  }
}

export async function requireFirebaseAuth(req, _res, next) {
  try {
    req.firebaseUser = await verifyFirebaseBearerToken(req);
    next();
  } catch (error) {
    next(error);
  }
}

