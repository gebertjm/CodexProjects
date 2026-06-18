import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'apps', 'player_app', 'build', 'web');
const destination = path.join(root, 'frontend', 'play');

if (!existsSync(source)) {
  throw new Error(`Missing Flutter web build output: ${source}`);
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });

console.log(`Copied Flutter web app from ${source} to ${destination}`);
