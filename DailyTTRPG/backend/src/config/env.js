import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const repoRootEnvPath = path.resolve(currentDirectory, '../../../.env');

if (fs.existsSync(repoRootEnvPath)) {
  dotenv.config({
    path: repoRootEnvPath,
    override: false,
  });
}

function required(name, value) {
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function numeric(name, value, fallback) {
  const resolved = value ?? fallback;
  const parsed = Number(required(name, resolved));

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }

  return parsed;
}

function boolean(name, value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Environment variable ${name} must be a boolean value such as true/false or 1/0`
  );
}

function nonEmptyOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const resolved = String(value).trim();
  return resolved === '' ? null : resolved;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const smsSimulatorExplicitlyEnabled = boolean(
  'ENABLE_SMS_SIMULATOR',
  process.env.ENABLE_SMS_SIMULATOR,
  nodeEnv !== 'production'
);
const smsOnboardingResumeHours = numeric(
  'SMS_ONBOARDING_RESUME_HOURS',
  process.env.SMS_ONBOARDING_RESUME_HOURS,
  '48'
);
const databaseUrl = process.env.DATABASE_URL;
const databaseUrlPresent = Boolean(nonEmptyOrNull(databaseUrl));
const dbSslEnabled = boolean('DB_SSL', process.env.DB_SSL, databaseUrlPresent && nodeEnv === 'production');
const dbSslRejectUnauthorized = boolean(
  'DB_SSL_REJECT_UNAUTHORIZED',
  process.env.DB_SSL_REJECT_UNAUTHORIZED,
  false
);
const dbSslConfig = dbSslEnabled
  ? {
      rejectUnauthorized: dbSslRejectUnauthorized,
    }
  : undefined;

const baseDbConfig = databaseUrlPresent
  ? {
      connectionString: databaseUrl,
    }
  : {
      host: required('DB_HOST', process.env.DB_HOST),
      port: numeric('DB_PORT', process.env.DB_PORT, '5432'),
      database: required('DB_NAME', process.env.DB_NAME),
      user: required('DB_USER', process.env.DB_USER),
      password: required('DB_PASSWORD', process.env.DB_PASSWORD),
    };

const dbConfig = dbSslConfig
  ? {
      ...baseDbConfig,
      ssl: dbSslConfig,
    }
  : baseDbConfig;

export const env = {
  NODE_ENV: nodeEnv,
  HOST: process.env.HOST || '0.0.0.0',
  PORT: numeric('PORT', process.env.PORT, '3000'),
  DATABASE_URL: databaseUrlPresent ? databaseUrl : null,
  DB_HOST: dbConfig.host || null,
  DB_PORT: dbConfig.port || null,
  DB_NAME: dbConfig.database || null,
  DB_USER: dbConfig.user || null,
  DB_PASSWORD: dbConfig.password || null,
  DB_SSL: dbSslEnabled,
  DB_SSL_REJECT_UNAUTHORIZED: dbSslRejectUnauthorized,
  ENABLE_SMS_SIMULATOR: smsSimulatorExplicitlyEnabled,
  SMS_SIMULATOR_DEV_PASSWORD: nonEmptyOrNull(process.env.SMS_SIMULATOR_DEV_PASSWORD),
  SMS_ONBOARDING_RESUME_HOURS: smsOnboardingResumeHours,
  FIREBASE_PROJECT_ID: nonEmptyOrNull(process.env.FIREBASE_PROJECT_ID),
  FIREBASE_CLIENT_EMAIL: nonEmptyOrNull(process.env.FIREBASE_CLIENT_EMAIL),
  FIREBASE_PRIVATE_KEY: nonEmptyOrNull(process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n') ?? null,
  GOOGLE_APPLICATION_CREDENTIALS: nonEmptyOrNull(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  ALLOW_TEST_FIREBASE_AUTH: boolean(
    'ALLOW_TEST_FIREBASE_AUTH',
    process.env.ALLOW_TEST_FIREBASE_AUTH,
    nodeEnv !== 'production'
  ),
  CORS_ALLOWED_ORIGINS: nonEmptyOrNull(process.env.CORS_ALLOWED_ORIGINS),
  dbConfig,
};
