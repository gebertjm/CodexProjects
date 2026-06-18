import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const appDir = path.join(root, 'apps', 'player_app');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
    return null;
  }

  const index = trimmed.indexOf('=');
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value.replaceAll('\\n', '\n')] : null;
}

function loadEnvFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

loadEnvFile('.env');
loadEnvFile('.env.frontend');
loadEnvFile('.env.local');

const requiredDartDefines = [
  'FIREBASE_WEB_API_KEY',
  'FIREBASE_WEB_APP_ID',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_MESSAGING_SENDER_ID',
  'DAILY_TTRPG_API_BASE_URL',
];
const missing = requiredDartDefines.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `Missing required Flutter web build env vars: ${missing.join(', ')}.\n` +
      'Create .env.frontend from docs/firebase-web-config-sop.md, then rerun npm run build:player.'
  );
  process.exit(1);
}

const dartDefines = [
  'FIREBASE_WEB_API_KEY',
  'FIREBASE_WEB_APP_ID',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_STORAGE_BUCKET',
  'DAILY_TTRPG_API_BASE_URL',
]
  .filter((key) => process.env[key])
  .flatMap((key) => [`--dart-define=${key}=${process.env[key]}`]);

run('flutter', ['pub', 'get'], { cwd: appDir });
run('flutter', ['build', 'web', '--release', '--base-href', '/play/', ...dartDefines], {
  cwd: appDir,
});
run('node', [path.join('scripts', 'copy-player-build.mjs')], { cwd: root });
