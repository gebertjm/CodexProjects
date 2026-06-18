import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CONTENT_SECTION_KEYS,
  DEFAULT_CONTENT_LOAD_ORDER,
  SECTION_DEFINITIONS,
} from './contentTypes.js';

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (error) {
    const wrapped = new Error(`${filePath} contains invalid JSON: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function normalizeSectionPaths(rawSectionPaths) {
  if (!rawSectionPaths || typeof rawSectionPaths !== 'object' || Array.isArray(rawSectionPaths)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawSectionPaths).map(([sectionKey, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return [
        sectionKey,
        values
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean),
      ];
    })
  );
}

function normalizeManifest(manifest) {
  const normalized = manifest && typeof manifest === 'object' && !Array.isArray(manifest)
    ? manifest
    : {};
  const includeSections = Array.isArray(normalized.include_sections)
    ? normalized.include_sections
    : null;
  const excludeSections = Array.isArray(normalized.exclude_sections)
    ? new Set(normalized.exclude_sections)
    : new Set();
  const requestedOrder = Array.isArray(normalized.load_order)
    ? normalized.load_order
    : DEFAULT_CONTENT_LOAD_ORDER;
  const loadOrder = [
    ...requestedOrder.filter((section) => CONTENT_SECTION_KEYS.includes(section)),
    ...DEFAULT_CONTENT_LOAD_ORDER.filter((section) => !requestedOrder.includes(section)),
  ].filter((section, index, all) => all.indexOf(section) === index);

  return {
    name: normalized.name ?? null,
    version: normalized.version ?? null,
    description: normalized.description ?? null,
    include_sections: includeSections,
    exclude_sections: Array.from(excludeSections),
    load_order: loadOrder,
    section_paths: normalizeSectionPaths(normalized.section_paths),
    raw: normalized,
  };
}

function shouldLoadSection(sectionKey, manifest) {
  if (manifest.include_sections && !manifest.include_sections.includes(sectionKey)) {
    return false;
  }

  return !manifest.exclude_sections.includes(sectionKey);
}

async function discoverDirectorySection(packagePath, sectionKey, definition) {
  const directoryPath = path.join(packagePath, definition.directory);

  if (!(await pathExists(directoryPath))) {
    return [];
  }

  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
  const records = [];

  for (const filePath of files) {
    const parsed = await readJsonFile(filePath);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      records.push({
        ...item,
        __source_file: path.relative(packagePath, filePath).replaceAll('\\', '/'),
        __section: sectionKey,
      });
    }
  }

  return records;
}

async function discoverSectionFromTarget(packagePath, sectionKey, targetPath) {
  const absoluteTargetPath = path.resolve(packagePath, targetPath);

  if (!(await pathExists(absoluteTargetPath))) {
    return [];
  }

  const stat = await fs.stat(absoluteTargetPath);

  if (stat.isDirectory()) {
    const entries = await fs.readdir(absoluteTargetPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(absoluteTargetPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
    const records = [];

    for (const filePath of files) {
      const parsed = await readJsonFile(filePath);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        records.push({
          ...item,
          __source_file: path.relative(packagePath, filePath).replaceAll('\\', '/'),
          __section: sectionKey,
        });
      }
    }

    return records;
  }

  if (stat.isFile() && absoluteTargetPath.endsWith('.json')) {
    const parsed = await readJsonFile(absoluteTargetPath);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items.map((item) => ({
      ...item,
      __source_file: path.relative(packagePath, absoluteTargetPath).replaceAll('\\', '/'),
      __section: sectionKey,
    }));
  }

  return [];
}

export async function discoverContentPackage(inputPath) {
  const packagePath = path.resolve(inputPath);
  const manifestPath = path.join(packagePath, 'manifest.json');
  const manifest = normalizeManifest(
    (await pathExists(manifestPath)) ? await readJsonFile(manifestPath) : {}
  );
  const sections = {};
  const files = [];

  for (const sectionKey of CONTENT_SECTION_KEYS) {
    sections[sectionKey] = [];

    if (!shouldLoadSection(sectionKey, manifest)) {
      continue;
    }

    const definition = SECTION_DEFINITIONS[sectionKey];
    const sectionTargets = manifest.section_paths?.[sectionKey] ?? [];

    if (sectionTargets.length > 0) {
      const records = [];

      for (const sectionTarget of sectionTargets) {
        records.push(...(await discoverSectionFromTarget(packagePath, sectionKey, sectionTarget)));
      }

      sections[sectionKey] = records;
      files.push(...records.map((record) => record.__source_file));
      continue;
    }

    if (definition.singleton) {
      const records = [];

      for (const fileName of definition.files) {
        const filePath = path.join(packagePath, fileName);

        if (await pathExists(filePath)) {
          records.push({
            ...(await readJsonFile(filePath)),
            __source_file: fileName,
            __section: sectionKey,
          });
          files.push(fileName);
        }
      }

      sections[sectionKey] = records;
      continue;
    }

    const records = await discoverDirectorySection(packagePath, sectionKey, definition);
    sections[sectionKey] = records;
    files.push(...records.map((record) => record.__source_file));
  }

  return {
    packagePath,
    manifest,
    loadOrder: manifest.load_order.filter((section) => shouldLoadSection(section, manifest)),
    sections,
    filesProcessed: Array.from(new Set(files)).sort(),
  };
}
