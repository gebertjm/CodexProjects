import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let overlayCache = null;

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

async function listJsonFiles(directory) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function addUniquePath(paths, candidate) {
  const cleaned = cleanText(candidate);
  if (!cleaned) {
    return;
  }
  const resolved = path.resolve(cleaned);
  if (!paths.includes(resolved)) {
    paths.push(resolved);
  }
}

function sceneRootCandidates(currentFile) {
  const roots = [];
  const explicitSceneRoot = cleanText(process.env.CONTENT_SCENE_ROOT);
  const explicitContentRoot = cleanText(process.env.CONTENT_ROOT);

  addUniquePath(roots, explicitSceneRoot);
  if (explicitContentRoot) {
    const resolvedContentRoot = path.resolve(explicitContentRoot);
    addUniquePath(
      roots,
      path.basename(resolvedContentRoot) === 'scenes'
        ? resolvedContentRoot
        : path.join(resolvedContentRoot, 'scenes')
    );
  }

  addUniquePath(roots, '/content/scenes');
  addUniquePath(roots, path.resolve(path.dirname(currentFile), '../../../content/scenes'));
  addUniquePath(roots, path.resolve(process.cwd(), 'content/scenes'));
  addUniquePath(roots, path.resolve(process.cwd(), '../content/scenes'));

  return roots;
}

async function loadSceneContentOverlays() {
  if (overlayCache) {
    return overlayCache;
  }

  const currentFile = fileURLToPath(import.meta.url);
  const files = [];
  for (const sceneRoot of sceneRootCandidates(currentFile)) {
    files.push(...(await listJsonFiles(sceneRoot)));
  }
  const byKey = new Map();

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      continue;
    }

    const records = Array.isArray(parsed) ? parsed : [parsed];
    for (const record of records) {
      if (!record || typeof record !== 'object') {
        continue;
      }
      const key = cleanText(record.slug ?? record.key ?? record.scene_slug ?? record.scene_id);
      if (!key) {
        continue;
      }
      byKey.set(key, record);
    }
  }

  overlayCache = byKey;
  return overlayCache;
}

export async function getSceneContentOverlay(scene) {
  const key = cleanText(scene?.key ?? scene?.slug ?? scene?.scene_key);
  if (!key) {
    return null;
  }
  const overlays = await loadSceneContentOverlays();
  return overlays.get(key) ?? null;
}

export function resetSceneContentOverlayCacheForTests() {
  overlayCache = null;
}
