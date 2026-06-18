import { query, withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { getPlayerStateForAccount } from './playerStateService.js';
import { assignSmsCampaignTransactional } from '../sms/smsCampaignAssignmentService.js';

const CREATION_MODES = Object.freeze([
  {
    id: 'quick_start',
    label: 'Quick Start',
    description: 'Create a playable character quickly with smart defaults.',
  },
  {
    id: 'guided',
    label: 'Guided',
    description: 'Make key choices with explanations.',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: 'More control. Standard Array is available now; some advanced choices use recommended defaults.',
  },
]);

const ABILITIES = Object.freeze(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']);
const STANDARD_ARRAY = Object.freeze([15, 14, 13, 12, 10, 8]);

const TRAITS = Object.freeze([
  { id: 'brave', label: 'Brave', description: 'You step toward danger when someone needs help.' },
  { id: 'cautious', label: 'Cautious', description: 'You notice risks before committing to a course.' },
  { id: 'curious', label: 'Curious', description: 'You pull on loose threads and ask one more question.' },
  { id: 'wry', label: 'Wry', description: 'You meet trouble with a dry remark and a steady hand.' },
]);

const ATTRIBUTE_PRESETS = Object.freeze({
  strong_durable: {
    id: 'strong_durable',
    label: 'Strong and durable',
    description: 'Best for fighters, paladins, barbarians, and other front-line heroes.',
    scores: { strength: 15, constitution: 14, dexterity: 13, wisdom: 12, intelligence: 10, charisma: 8 },
  },
  quick_precise: {
    id: 'quick_precise',
    label: 'Quick and precise',
    description: 'Best for rogues, rangers, monks, and dexterous fighters.',
    scores: { dexterity: 15, wisdom: 14, constitution: 13, intelligence: 12, charisma: 10, strength: 8 },
  },
  wise_resilient: {
    id: 'wise_resilient',
    label: 'Wise and resilient',
    description: 'Best for clerics, druids, and watchful explorers.',
    scores: { wisdom: 15, constitution: 14, strength: 13, dexterity: 12, charisma: 10, intelligence: 8 },
  },
  intelligent_careful: {
    id: 'intelligent_careful',
    label: 'Intelligent and careful',
    description: 'Best for wizards, investigators, and careful planners.',
    scores: { intelligence: 15, constitution: 14, dexterity: 13, wisdom: 12, charisma: 10, strength: 8 },
  },
  charismatic_bold: {
    id: 'charismatic_bold',
    label: 'Charismatic and bold',
    description: 'Best for bards, sorcerers, warlocks, and social leaders.',
    scores: { charisma: 15, dexterity: 14, constitution: 13, wisdom: 12, strength: 10, intelligence: 8 },
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'A flexible spread for players who want a little of everything.',
    scores: { dexterity: 15, charisma: 14, constitution: 13, wisdom: 12, intelligence: 10, strength: 8 },
  },
});

const CLASS_ATTRIBUTE_PROFILE = Object.freeze({
  barbarian: 'strong_durable',
  bard: 'charismatic_bold',
  cleric: 'wise_resilient',
  druid: 'wise_resilient',
  fighter: 'strong_durable',
  monk: 'quick_precise',
  paladin: 'strong_durable',
  ranger: 'quick_precise',
  rogue: 'quick_precise',
  sorcerer: 'charismatic_bold',
  warlock: 'charismatic_bold',
  wizard: 'intelligent_careful',
});

const RACE_ABILITY_BONUSES = Object.freeze({
  human: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
  elf: { dexterity: 2 },
  dwarf: { constitution: 2 },
  halfling: { dexterity: 2 },
  dragonborn: { strength: 2, charisma: 1 },
  gnome: { intelligence: 2 },
  'half-elf': { charisma: 2, dexterity: 1, constitution: 1 },
  'half-orc': { strength: 2, constitution: 1 },
  tiefling: { charisma: 2, intelligence: 1 },
});

const SUBRACE_ABILITY_BONUSES = Object.freeze({
  'hill-dwarf': { wisdom: 1 },
  'mountain-dwarf': { strength: 2 },
  'high-elf': { intelligence: 1 },
  'wood-elf': { wisdom: 1 },
  'forest-gnome': { dexterity: 1 },
  'rock-gnome': { constitution: 1 },
  'lightfoot-halfling': { charisma: 1 },
  'stout-halfling': { constitution: 1 },
});

const DEFAULT_EQUIPMENT_BY_CLASS = Object.freeze({
  barbarian: ['greataxe', 'handaxe', 'hide-armor'],
  bard: ['rapier', 'dagger', 'leather-armor'],
  cleric: ['scale-mail', 'mace', 'shield'],
  druid: ['scimitar', 'spear', 'leather-armor'],
  fighter: ['chain-mail', 'shield', 'longsword'],
  monk: ['shortsword', 'dart'],
  paladin: ['chain-mail', 'shield', 'longsword'],
  ranger: ['leather-armor', 'shortbow', 'shortsword'],
  rogue: ['leather-armor', 'dagger', 'shortbow'],
  sorcerer: ['quarterstaff', 'dagger'],
  warlock: ['leather-armor', 'dagger', 'quarterstaff'],
  wizard: ['quarterstaff', 'dagger'],
});

const DEFAULT_SPELLS_BY_CLASS = Object.freeze({
  bard: ['minor-illusion', 'healing-word'],
  cleric: ['light', 'thaumaturgy', 'cure-wounds'],
  druid: ['detect-magic', 'cure-wounds'],
  sorcerer: ['fire-bolt', 'mage-hand', 'magic-missile', 'shield'],
  warlock: ['mage-hand', 'minor-illusion', 'hellish-rebuke'],
  wizard: ['fire-bolt', 'mage-hand', 'magic-missile', 'shield'],
});

const ARCHETYPE_DEFINITIONS = Object.freeze([
  {
    id: 'stalwart_fighter',
    label: 'Stalwart Fighter',
    description: 'A reliable front-line defender with simple, durable defaults.',
    fantasy_role: 'Front-line guardian',
    race_slug: 'human',
    class_slug: 'fighter',
    attribute_preset_id: 'strong_durable',
    background_slug: 'soldier',
    trait_id: 'brave',
    recommended_for_new_players: true,
    complexity: 'low',
    magic_use: 'none',
  },
  {
    id: 'clever_rogue',
    label: 'Clever Rogue',
    description: 'A quick scout who solves problems with precision and nerve.',
    fantasy_role: 'Scout and problem-solver',
    race_slug: 'halfling',
    subrace_slug: 'lightfoot-halfling',
    class_slug: 'rogue',
    attribute_preset_id: 'quick_precise',
    background_slug: 'criminal',
    trait_id: 'curious',
    recommended_for_new_players: true,
    complexity: 'medium',
    magic_use: 'none',
  },
  {
    id: 'devout_cleric',
    label: 'Devout Cleric',
    description: 'A resilient divine caster with healing and practical support.',
    fantasy_role: 'Healer and moral anchor',
    race_slug: 'dwarf',
    subrace_slug: 'hill-dwarf',
    class_slug: 'cleric',
    attribute_preset_id: 'wise_resilient',
    background_slug: 'acolyte',
    trait_id: 'cautious',
    recommended_for_new_players: false,
    complexity: 'medium',
    magic_use: 'divine',
  },
  {
    id: 'arcane_scholar',
    label: 'Arcane Scholar',
    description: 'A careful wizard with useful cantrips and a small spellbook.',
    fantasy_role: 'Arcane investigator',
    race_slug: 'elf',
    subrace_slug: 'high-elf',
    class_slug: 'wizard',
    attribute_preset_id: 'intelligent_careful',
    background_slug: 'sage',
    trait_id: 'curious',
    recommended_for_new_players: false,
    complexity: 'high',
    magic_use: 'arcane',
  },
  {
    id: 'wildland_ranger',
    label: 'Wildland Ranger',
    description: 'A watchful traveler comfortable with roads, ruins, and tracks.',
    fantasy_role: 'Explorer and archer',
    race_slug: 'elf',
    subrace_slug: 'wood-elf',
    class_slug: 'ranger',
    attribute_preset_id: 'quick_precise',
    background_slug: 'folk-hero',
    trait_id: 'cautious',
    recommended_for_new_players: true,
    complexity: 'medium',
    magic_use: 'later',
  },
  {
    id: 'oathbound_paladin',
    label: 'Oathbound Paladin',
    description: 'A sworn protector with heavy armor and a forceful presence.',
    fantasy_role: 'Defender and leader',
    race_slug: 'dragonborn',
    class_slug: 'paladin',
    attribute_preset_id: 'strong_durable',
    background_slug: 'noble',
    trait_id: 'brave',
    recommended_for_new_players: false,
    complexity: 'medium',
    magic_use: 'later',
  },
  {
    id: 'eldritch_warlock',
    label: 'Eldritch Warlock',
    description: 'A bold pact-bound caster with compact magical defaults.',
    fantasy_role: 'Uncanny negotiator',
    race_slug: 'tiefling',
    class_slug: 'warlock',
    attribute_preset_id: 'charismatic_bold',
    background_slug: 'sage',
    trait_id: 'wry',
    recommended_for_new_players: false,
    complexity: 'high',
    magic_use: 'pact',
  },
]);

let webCharacterCreationSchemaReady = false;

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeIdentifier(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

function cloneScores(scores) {
  return Object.fromEntries(ABILITIES.map((ability) => [ability, Number(scores[ability])]));
}

function applyAbilityBonuses(scores, raceSlug, subraceSlug) {
  const next = cloneScores(scores);
  for (const [ability, value] of Object.entries(RACE_ABILITY_BONUSES[raceSlug] ?? {})) {
    next[ability] += value;
  }
  for (const [ability, value] of Object.entries(SUBRACE_ABILITY_BONUSES[subraceSlug] ?? {})) {
    next[ability] += value;
  }
  return next;
}

function assertValidName(name) {
  const cleaned = normalizeOptionalString(name)?.replace(/\s+/g, ' ') ?? null;
  if (!cleaned || !/^[A-Za-z][A-Za-z '\-]{1,39}$/.test(cleaned)) {
    throw createHttpError('Character name must be 2-40 letters, spaces, apostrophes, or hyphens', 400);
  }
  return cleaned;
}

function traitById(traitId) {
  const normalized = normalizeIdentifier(traitId);
  return TRAITS.find((trait) => trait.id === normalized) ?? null;
}

function presetById(presetId) {
  return ATTRIBUTE_PRESETS[normalizeIdentifier(presetId)] ?? null;
}

function optionByIdOrSlug({ value, idValue, slugValue, byId, bySlug, label }) {
  const raw = value && typeof value === 'object' ? value : null;
  const directId = numericId(idValue ?? raw?.id ?? raw?.[`${label}_id`] ?? value);
  if (directId && byId.has(directId)) {
    return byId.get(directId);
  }

  const directSlug = normalizeSlug(slugValue ?? raw?.slug ?? raw?.key ?? value);
  if (directSlug && bySlug.has(directSlug)) {
    return bySlug.get(directSlug);
  }

  throw createHttpError(`Invalid ${label}`, 400);
}

function validateDetailedStandardArray(scores) {
  const input = normalizeObject(scores);
  const values = [];
  const assignment = {};

  for (const ability of ABILITIES) {
    const value = Number(input[ability]);
    if (!Number.isInteger(value)) {
      throw createHttpError(`Detailed mode requires a ${ability} score`, 400);
    }
    assignment[ability] = value;
    values.push(value);
  }

  const sorted = [...values].sort((left, right) => left - right);
  const expected = [...STANDARD_ARRAY].sort((left, right) => left - right);
  if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
    throw createHttpError('Detailed mode must assign the full Standard Array: 15, 14, 13, 12, 10, 8', 400);
  }

  return assignment;
}

function mapLookupRows(rows) {
  const byId = new Map();
  const bySlug = new Map();
  for (const row of rows) {
    const mapped = {
      ...row,
      id: Number(row.id),
      base_speed: row.base_speed !== undefined && row.base_speed !== null ? Number(row.base_speed) : null,
      hit_die: row.hit_die !== undefined && row.hit_die !== null ? Number(row.hit_die) : null,
    };
    byId.set(mapped.id, mapped);
    bySlug.set(mapped.slug, mapped);
  }
  return { rows: rows.map((row) => ({ ...row, id: Number(row.id) })), byId, bySlug };
}

async function loadCreationLookups(executor = { query }) {
  const races = await executor.query(
    `
      SELECT id, name, slug, description, size, base_speed, source, is_active
      FROM dnd5e_race
      WHERE is_active = TRUE
      ORDER BY name ASC
    `
  );
  const subraces = await executor.query(
    `
      SELECT id, race_id, name, slug, description, source, is_active
      FROM dnd5e_subrace
      WHERE is_active = TRUE
      ORDER BY name ASC
    `
  );
  const classes = await executor.query(
    `
      SELECT id, name, slug, description, hit_die, primary_ability_text, source, is_active
      FROM dnd5e_class
      WHERE is_active = TRUE
      ORDER BY name ASC
    `
  );
  const backgrounds = await executor.query(
    `
      SELECT id, name, slug, description, source, is_active
      FROM dnd5e_background
      WHERE is_active = TRUE
      ORDER BY name ASC
    `
  );

  const raceLookups = mapLookupRows(races.rows);
  const subraceLookups = mapLookupRows(subraces.rows);
  const classLookups = mapLookupRows(classes.rows);
  const backgroundLookups = mapLookupRows(backgrounds.rows);
  const subracesByRaceId = new Map();
  for (const subrace of subraceLookups.byId.values()) {
    const raceId = Number(subrace.race_id);
    if (!subracesByRaceId.has(raceId)) {
      subracesByRaceId.set(raceId, []);
    }
    subracesByRaceId.get(raceId).push(subrace);
  }

  return {
    races: raceLookups,
    subraces: subraceLookups,
    classes: classLookups,
    backgrounds: backgroundLookups,
    subracesByRaceId,
  };
}

function supportedClass(classRow) {
  return Boolean(DEFAULT_EQUIPMENT_BY_CLASS[classRow.slug] || DEFAULT_SPELLS_BY_CLASS[classRow.slug]);
}

function enrichArchetype(definition, lookups) {
  const race = lookups.races.bySlug.get(definition.race_slug);
  const subrace = definition.subrace_slug ? lookups.subraces.bySlug.get(definition.subrace_slug) : null;
  const classRow = lookups.classes.bySlug.get(definition.class_slug);
  const background = lookups.backgrounds.bySlug.get(definition.background_slug);
  const trait = traitById(definition.trait_id);

  if (!race || !classRow || !background || !trait || !supportedClass(classRow)) {
    return null;
  }

  if (definition.subrace_slug && (!subrace || Number(subrace.race_id) !== Number(race.id))) {
    return null;
  }

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    fantasy_role: definition.fantasy_role,
    species_id: String(race.id),
    species_slug: race.slug,
    species_label: race.name,
    race_id: String(race.id),
    race_slug: race.slug,
    subrace_id: subrace ? String(subrace.id) : null,
    subrace_slug: subrace?.slug ?? null,
    subrace_label: subrace?.name ?? null,
    class_id: String(classRow.id),
    class_slug: classRow.slug,
    class_label: classRow.name,
    attribute_preset_id: definition.attribute_preset_id,
    attribute_summary: ATTRIBUTE_PRESETS[definition.attribute_preset_id]?.label ?? 'Recommended',
    background_id: String(background.id),
    background_slug: background.slug,
    background_label: background.name,
    trait_id: trait.id,
    trait_label: trait.label,
    equipment_default_package: DEFAULT_EQUIPMENT_BY_CLASS[classRow.slug] ?? [],
    spell_default_package: DEFAULT_SPELLS_BY_CLASS[classRow.slug] ?? [],
    complexity: definition.complexity,
    magic_use: definition.magic_use,
    recommended_for_new_players: Boolean(definition.recommended_for_new_players),
  };
}

function serializeDraft(row) {
  if (!row) {
    return null;
  }
  return {
    draft_id: String(row.id),
    account_id: String(row.account_id),
    mode: row.mode,
    current_step: row.current_step,
    status: row.status,
    draft: row.draft_json ?? {},
    validation_errors: row.validation_errors_json ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

function summarizeCharacter(row, { activeCharacterChanged = false, defaultsApplied = {}, canStartAdventure = false } = {}) {
  return {
    character_id: String(row.id),
    name: row.name,
    level: Number(row.level ?? 1),
    species: row.subrace_name ?? row.race_name,
    race: row.race_name,
    subrace: row.subrace_name,
    class: row.class_name,
    background: row.background_name,
    trait: row.personality_traits,
    status: row.status ?? 'active',
    is_active_character: Boolean(row.is_current_active ?? row.is_active),
    ability_scores: {
      strength: Number(row.strength),
      dexterity: Number(row.dexterity),
      constitution: Number(row.constitution),
      intelligence: Number(row.intelligence),
      wisdom: Number(row.wisdom),
      charisma: Number(row.charisma),
    },
    defaults_applied: defaultsApplied,
    active_character_changed: activeCharacterChanged,
    next_actions: {
      can_start_adventure: canStartAdventure,
      can_set_active: !Boolean(row.is_current_active ?? row.is_active),
    },
  };
}

async function hasActiveCampaign(characterId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT id
      FROM dnd5e_campaign_character
      WHERE character_id = $1
        AND is_active = TRUE
        AND membership_status = 'active'
      LIMIT 1
    `,
    [characterId]
  );
  return result.rowCount > 0;
}

export async function ensureWebCharacterCreationSchema() {
  if (webCharacterCreationSchemaReady) {
    return;
  }

  await query(`
    ALTER TABLE dnd5e_character
      ADD COLUMN IF NOT EXISTS created_via_web BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS web_creation_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS dnd5e_character_creation_draft (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      account_id BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
      mode VARCHAR(40),
      current_step VARCHAR(80) NOT NULL DEFAULT 'mode',
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      validation_errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    ALTER TABLE dnd5e_character_creation_draft
      DROP CONSTRAINT IF EXISTS dnd5e_character_creation_draft_mode_check;

    ALTER TABLE dnd5e_character_creation_draft
      ADD CONSTRAINT dnd5e_character_creation_draft_mode_check CHECK (
        mode IS NULL OR mode IN ('quick_start', 'guided', 'detailed')
      );

    ALTER TABLE dnd5e_character_creation_draft
      DROP CONSTRAINT IF EXISTS dnd5e_character_creation_draft_status_check;

    ALTER TABLE dnd5e_character_creation_draft
      ADD CONSTRAINT dnd5e_character_creation_draft_status_check CHECK (
        status IN ('active', 'completed', 'abandoned')
      );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_character_creation_one_active_draft
      ON dnd5e_character_creation_draft(account_id)
      WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS idx_dnd5e_character_creation_draft_account_status
      ON dnd5e_character_creation_draft(account_id, status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_dnd5e_character_created_via_web
      ON dnd5e_character(created_via_web);
  `);

  webCharacterCreationSchemaReady = true;
}

export function resetWebCharacterCreationSchemaForTests() {
  webCharacterCreationSchemaReady = false;
}

export async function getCharacterCreationOptions() {
  await ensureWebCharacterCreationSchema();
  const lookups = await loadCreationLookups();
  const archetypes = ARCHETYPE_DEFINITIONS.map((definition) => enrichArchetype(definition, lookups)).filter(Boolean);

  return {
    creation_modes: CREATION_MODES,
    archetypes,
    species: Array.from(lookups.races.byId.values()).map((race) => ({
      id: String(race.id),
      slug: race.slug,
      label: race.name,
      description: race.description,
      mechanical_summary: `${race.size ?? 'Medium'}, speed ${race.base_speed ?? 30} ft.`,
      traits: [],
      subraces: (lookups.subracesByRaceId.get(race.id) ?? []).map((subrace) => ({
        id: String(subrace.id),
        slug: subrace.slug,
        label: subrace.name,
        description: subrace.description,
        mechanical_summary: 'Lineage defaults apply automatically in this MVP.',
      })),
      recommended_classes: [],
    })),
    classes: Array.from(lookups.classes.byId.values()).map((classRow) => ({
      id: String(classRow.id),
      slug: classRow.slug,
      label: classRow.name,
      description: classRow.description,
      primary_attributes: classRow.primary_ability_text,
      complexity: ['wizard', 'sorcerer', 'warlock', 'bard', 'druid'].includes(classRow.slug) ? 'higher' : 'moderate',
      magic_use: DEFAULT_SPELLS_BY_CLASS[classRow.slug]?.length ? 'uses recommended starter spells' : 'none at level 1',
      mechanical_summary: `Hit die d${classRow.hit_die}. ${classRow.primary_ability_text ?? 'Flexible'} focus.`,
      supported_in_creation: supportedClass(classRow),
      default_equipment_available: Boolean(DEFAULT_EQUIPMENT_BY_CLASS[classRow.slug]),
      default_spells_available: Boolean(DEFAULT_SPELLS_BY_CLASS[classRow.slug]?.length),
    })),
    attribute_presets: Object.values(ATTRIBUTE_PRESETS).map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      scores: preset.scores,
    })),
    backgrounds: Array.from(lookups.backgrounds.byId.values()).map((background) => ({
      id: String(background.id),
      slug: background.slug,
      label: background.name,
      description: background.description,
      mechanical_summary: 'Recommended background proficiencies use MVP defaults.',
      roleplay_hook: background.description,
    })),
    traits: TRAITS,
    standard_array: STANDARD_ARRAY,
    defaults_policy: {
      equipment: 'recommended_defaults',
      spells: 'recommended_defaults_where_needed',
      skills: 'recommended_defaults',
      languages: 'recommended_defaults',
      granular_choices_deferred_to: '6B.1D Full Detailed Character Builder Completion',
    },
  };
}

export async function getActiveCharacterCreationDraft(accountId) {
  await ensureWebCharacterCreationSchema();
  const result = await query(
    `
      SELECT *
      FROM dnd5e_character_creation_draft
      WHERE account_id = $1
        AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [accountId]
  );
  return serializeDraft(result.rows[0] ?? null);
}

export async function saveCharacterCreationDraft(accountId, input = {}) {
  await ensureWebCharacterCreationSchema();
  const payload = normalizeObject(input.draft ?? input);
  const mode = normalizeOptionalString(input.mode ?? payload.mode);
  const currentStep = normalizeOptionalString(input.current_step ?? payload.current_step ?? payload.step ?? 'mode');

  if (mode && !CREATION_MODES.some((entry) => entry.id === mode)) {
    throw createHttpError('Invalid character creation mode', 400);
  }

  const result = await query(
    `
      INSERT INTO dnd5e_character_creation_draft (
        account_id,
        mode,
        current_step,
        status,
        draft_json,
        validation_errors_json
      )
      VALUES ($1, $2, $3, 'active', $4::jsonb, '[]'::jsonb)
      ON CONFLICT (account_id)
        WHERE status = 'active'
      DO UPDATE SET
        mode = COALESCE(EXCLUDED.mode, dnd5e_character_creation_draft.mode),
        current_step = EXCLUDED.current_step,
        draft_json = dnd5e_character_creation_draft.draft_json || EXCLUDED.draft_json,
        validation_errors_json = '[]'::jsonb,
        updated_at = NOW()
      RETURNING *
    `,
    [accountId, mode, currentStep, json(payload)]
  );

  return serializeDraft(result.rows[0]);
}

export async function patchCharacterCreationDraft(accountId, draftId, input = {}) {
  await ensureWebCharacterCreationSchema();
  const payload = normalizeObject(input.draft ?? input);
  const mode = normalizeOptionalString(input.mode ?? payload.mode);
  const currentStep = normalizeOptionalString(input.current_step ?? payload.current_step ?? payload.step ?? 'mode');

  if (mode && !CREATION_MODES.some((entry) => entry.id === mode)) {
    throw createHttpError('Invalid character creation mode', 400);
  }

  const result = await query(
    `
      UPDATE dnd5e_character_creation_draft
      SET
        mode = COALESCE($3, mode),
        current_step = COALESCE($4, current_step),
        draft_json = draft_json || $5::jsonb,
        validation_errors_json = '[]'::jsonb,
        updated_at = NOW()
      WHERE id = $1
        AND account_id = $2
        AND status = 'active'
      RETURNING *
    `,
    [draftId, accountId, mode, currentStep, json(payload)]
  );

  if (result.rowCount === 0) {
    throw createHttpError('Character creation draft not found', 404);
  }

  return serializeDraft(result.rows[0]);
}

export async function abandonCharacterCreationDraft(accountId, draftId) {
  await ensureWebCharacterCreationSchema();
  const result = await query(
    `
      UPDATE dnd5e_character_creation_draft
      SET status = 'abandoned',
          updated_at = NOW()
      WHERE id = $1
        AND account_id = $2
        AND status = 'active'
      RETURNING *
    `,
    [draftId, accountId]
  );

  if (result.rowCount === 0) {
    throw createHttpError('Character creation draft not found', 404);
  }

  return serializeDraft(result.rows[0]);
}

function mergePayloadWithDraft(draft, payload) {
  const draftData = normalizeObject(draft?.draft);
  return {
    ...draftData,
    ...normalizeObject(payload),
  };
}

function buildValidatedCharacterPayload(payload, lookups) {
  const mode = normalizeIdentifier(payload.mode);
  if (!CREATION_MODES.some((entry) => entry.id === mode)) {
    throw createHttpError('Invalid character creation mode', 400);
  }

  let working = { ...payload };
  const name = assertValidName(working.name);

  if (mode === 'quick_start') {
    const archetypeId = normalizeIdentifier(working.archetype_id);
    const archetype = ARCHETYPE_DEFINITIONS.find((entry) => entry.id === archetypeId);
    if (!archetype) {
      throw createHttpError('Invalid archetype', 400);
    }
    working = {
      ...working,
      race_slug: archetype.race_slug,
      species_slug: archetype.race_slug,
      subrace_slug: archetype.subrace_slug ?? null,
      class_slug: archetype.class_slug,
      attribute_preset_id: archetype.attribute_preset_id,
      background_slug: archetype.background_slug,
      trait_id: archetype.trait_id,
      archetype_id: archetype.id,
    };
  }

  const race = optionByIdOrSlug({
    value: working.species ?? working.race,
    idValue: working.species_id ?? working.race_id,
    slugValue: working.species_slug ?? working.race_slug,
    byId: lookups.races.byId,
    bySlug: lookups.races.bySlug,
    label: 'species',
  });

  const subraceValue =
    working.subrace_id ?? working.subrace_slug ?? working.lineage_id ?? working.lineage_slug ?? working.subrace;
  const raceSubraces = lookups.subracesByRaceId.get(race.id) ?? [];
  let subrace = null;
  if (subraceValue !== undefined && subraceValue !== null && String(subraceValue).trim() !== '') {
    subrace = optionByIdOrSlug({
      value: subraceValue,
      idValue: working.subrace_id ?? working.lineage_id,
      slugValue: working.subrace_slug ?? working.lineage_slug,
      byId: lookups.subraces.byId,
      bySlug: lookups.subraces.bySlug,
      label: 'subrace',
    });
    if (Number(subrace.race_id) !== Number(race.id)) {
      throw createHttpError('Selected subrace does not belong to selected species', 400);
    }
  } else if (raceSubraces.length > 0 && mode !== 'quick_start') {
    throw createHttpError('Selected species requires a subrace or lineage choice', 400);
  }

  const classRow = optionByIdOrSlug({
    value: working.class,
    idValue: working.class_id,
    slugValue: working.class_slug,
    byId: lookups.classes.byId,
    bySlug: lookups.classes.bySlug,
    label: 'class',
  });
  if (!supportedClass(classRow)) {
    throw createHttpError('Selected class is not supported by the web character creation MVP', 400);
  }

  const background = optionByIdOrSlug({
    value: working.background,
    idValue: working.background_id,
    slugValue: working.background_slug,
    byId: lookups.backgrounds.byId,
    bySlug: lookups.backgrounds.bySlug,
    label: 'background',
  });

  const trait = traitById(working.trait_id ?? working.trait);
  if (!trait) {
    throw createHttpError('Invalid trait', 400);
  }

  let baseScores;
  let attributePreset = null;
  if (mode === 'detailed') {
    baseScores = validateDetailedStandardArray(working.ability_scores ?? working.attributes);
  } else {
    attributePreset = presetById(working.attribute_preset_id ?? working.attribute_profile);
    if (!attributePreset) {
      throw createHttpError('Invalid attribute preset', 400);
    }
    baseScores = cloneScores(attributePreset.scores);
  }

  const finalScores = applyAbilityBonuses(baseScores, race.slug, subrace?.slug ?? null);
  const equipmentSlugs = DEFAULT_EQUIPMENT_BY_CLASS[classRow.slug] ?? [];
  const spellSlugs = DEFAULT_SPELLS_BY_CLASS[classRow.slug] ?? [];

  return {
    mode,
    name,
    archetype_id: working.archetype_id ?? null,
    race,
    subrace,
    class: classRow,
    background,
    trait,
    attribute_preset: attributePreset,
    base_scores: baseScores,
    final_scores: finalScores,
    equipment_slugs: equipmentSlugs,
    spell_slugs: spellSlugs,
    defaults_applied: {
      equipment: equipmentSlugs,
      spells: spellSlugs,
      skills: 'recommended_defaults',
      languages: 'recommended_defaults',
      detailed_builder_limitations: mode === 'detailed'
        ? 'Skill proficiencies, equipment, languages, spells, and feature choices use recommended defaults until 6B.1D.'
        : null,
    },
  };
}

async function assertDefaultRecordsExist({ equipment_slugs: equipmentSlugs = [], spell_slugs: spellSlugs = [] }, executor) {
  if (equipmentSlugs.length > 0) {
    const equipment = await executor.query(
      `
        SELECT slug
        FROM dnd5e_item
        WHERE slug = ANY($1::text[])
          AND is_active = TRUE
      `,
      [equipmentSlugs]
    );
    const found = new Set(equipment.rows.map((row) => row.slug));
    const missing = equipmentSlugs.filter((slug) => !found.has(slug));
    if (missing.length > 0) {
      throw createHttpError(`Default equipment is unavailable: ${missing.join(', ')}`, 409);
    }
  }

  if (spellSlugs.length > 0) {
    const spells = await executor.query(
      `
        SELECT slug
        FROM dnd5e_spell
        WHERE slug = ANY($1::text[])
          AND is_active = TRUE
      `,
      [spellSlugs]
    );
    const found = new Set(spells.rows.map((row) => row.slug));
    const missing = spellSlugs.filter((slug) => !found.has(slug));
    if (missing.length > 0) {
      throw createHttpError(`Default spells are unavailable: ${missing.join(', ')}`, 409);
    }
  }
}

async function loadCreatedCharacterSummary(characterId, accountId, executor) {
  const result = await executor.query(
    `
      SELECT
        character.id,
        character.name,
        character.level,
        character.status,
        character.is_active,
        account.active_character_id = character.id AS is_current_active,
        character.strength,
        character.dexterity,
        character.constitution,
        character.intelligence,
        character.wisdom,
        character.charisma,
        character.personality_traits,
        race.name AS race_name,
        subrace.name AS subrace_name,
        class.name AS class_name,
        background.name AS background_name
      FROM dnd5e_character character
      JOIN account ON account.id = character.account_id
      LEFT JOIN dnd5e_race race ON race.id = character.race_id
      LEFT JOIN dnd5e_subrace subrace ON subrace.id = character.subrace_id
      LEFT JOIN dnd5e_class class ON class.id = character.class_id
      LEFT JOIN dnd5e_background background ON background.id = character.background_id
      WHERE character.id = $1
        AND character.account_id = $2
    `,
    [characterId, accountId]
  );
  return result.rows[0] ?? null;
}

export async function validateWebCharacterCreationPayload(accountId, payload = {}, { draftId = null } = {}) {
  await ensureWebCharacterCreationSchema();
  const draft = draftId ? await getOwnedDraft(accountId, draftId) : null;
  const lookups = await loadCreationLookups();
  return buildValidatedCharacterPayload(mergePayloadWithDraft(draft, payload), lookups);
}

async function getOwnedDraft(accountId, draftId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT *
      FROM dnd5e_character_creation_draft
      WHERE id = $1
        AND account_id = $2
      LIMIT 1
    `,
    [draftId, accountId]
  );
  const row = result.rows[0] ?? null;
  if (!row) {
    throw createHttpError('Character creation draft not found', 404);
  }
  return serializeDraft(row);
}

export async function createWebCharacter(accountId, input = {}) {
  await ensureWebCharacterCreationSchema();
  const draftId = numericId(input.draft_id);
  const finalPayload = normalizeObject(input.payload ?? input.character ?? input);

  return withTransaction(async (client) => {
    const accountResult = await client.query(
      `
        SELECT id, active_character_id
        FROM account
        WHERE id = $1
        FOR UPDATE
      `,
      [accountId]
    );
    const account = accountResult.rows[0];
    if (!account) {
      throw createHttpError('Account not found', 404);
    }

    const draft = draftId ? await getOwnedDraft(accountId, draftId, client) : null;
    if (draft && draft.status !== 'active') {
      throw createHttpError('Only active character creation drafts can be completed', 409);
    }

    const lookups = await loadCreationLookups(client);
    const validated = buildValidatedCharacterPayload(mergePayloadWithDraft(draft, finalPayload), lookups);
    await assertDefaultRecordsExist(validated, client);

    const activeCharacterResult = await client.query(
      `
        SELECT id
        FROM dnd5e_character
        WHERE account_id = $1
          AND is_active = TRUE
          AND status = 'active'
        LIMIT 1
        FOR UPDATE
      `,
      [accountId]
    );
    const shouldActivateCharacter = !account.active_character_id && activeCharacterResult.rowCount === 0;
    const worldResult = await client.query(
      `
        SELECT id
        FROM dnd5e_world
        WHERE slug IN ('greyvale', 'daily-rpg-prime')
        ORDER BY slug = 'greyvale' DESC, id ASC
        LIMIT 1
      `
    );
    if (worldResult.rowCount === 0) {
      throw createHttpError('No default world is available for character creation', 409);
    }
    const worldId = Number(worldResult.rows[0].id);

    const hitPoints = Math.max(1, Number(validated.class.hit_die ?? 8) + abilityModifier(validated.final_scores.constitution));
    const armorClass = 10 + abilityModifier(validated.final_scores.dexterity);
    const notes = [
      'Created through web character creation.',
      `Creation mode: ${validated.mode}.`,
      `Default equipment: ${validated.equipment_slugs.join(', ') || 'none'}.`,
      `Default spells: ${validated.spell_slugs.join(', ') || 'none'}.`,
    ].join(' ');

    const characterResult = await client.query(
      `
        INSERT INTO dnd5e_character (
          account_id,
          world_id,
          name,
          race_id,
          subrace_id,
          class_id,
          background_id,
          level,
          experience_points,
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
          max_hit_points,
          current_hit_points,
          temporary_hit_points,
          armor_class,
          speed,
          proficiency_bonus,
          personality_traits,
          notes,
          status,
          created_via_web,
          web_creation_metadata_json,
          is_active
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, 1, 0, $8, $9, $10, $11, $12, $13,
          $14, $14, 0, $15, $16, 2, $17, $18, 'active', TRUE, $19::jsonb, $20
        )
        RETURNING id
      `,
      [
        accountId,
        worldId,
        validated.name,
        validated.race.id,
        validated.subrace?.id ?? null,
        validated.class.id,
        validated.background.id,
        validated.final_scores.strength,
        validated.final_scores.dexterity,
        validated.final_scores.constitution,
        validated.final_scores.intelligence,
        validated.final_scores.wisdom,
        validated.final_scores.charisma,
        hitPoints,
        armorClass,
        validated.race.base_speed ?? 30,
        validated.trait.label,
        notes,
        json({
          mode: validated.mode,
          archetype_id: validated.archetype_id,
          base_scores: validated.base_scores,
          final_scores: validated.final_scores,
          defaults_applied: validated.defaults_applied,
          created_at: new Date().toISOString(),
        }),
        shouldActivateCharacter,
      ]
    );
    const characterId = Number(characterResult.rows[0].id);

    await client.query(
      `
        INSERT INTO dnd5e_character_class (
          character_id,
          class_id,
          subclass_id,
          class_level,
          is_primary
        )
        VALUES ($1, $2, NULL, 1, TRUE)
        ON CONFLICT (character_id, class_id) DO UPDATE
        SET class_level = EXCLUDED.class_level,
            is_primary = TRUE
      `,
      [characterId, validated.class.id]
    );

    if (validated.equipment_slugs.length > 0) {
      await client.query(
        `
          WITH selected_items AS (
            SELECT id
            FROM dnd5e_item
            WHERE slug = ANY($2::text[])
              AND is_active = TRUE
          )
          INSERT INTO dnd5e_character_item (
            character_id,
            item_id,
            quantity,
            is_equipped,
            is_attuned,
            notes
          )
          SELECT $1, selected_items.id, 1, TRUE, FALSE, 'Recommended default from web character creation.'
          FROM selected_items
          ON CONFLICT DO NOTHING
        `,
        [characterId, validated.equipment_slugs]
      );
    }

    if (validated.spell_slugs.length > 0) {
      await client.query(
        `
          WITH selected_spells AS (
            SELECT id, level
            FROM dnd5e_spell
            WHERE slug = ANY($3::text[])
              AND is_active = TRUE
          )
          INSERT INTO dnd5e_character_spell (
            character_id,
            spell_id,
            spell_source,
            source_class_id,
            is_known,
            is_prepared,
            is_always_prepared,
            notes
          )
          SELECT
            $1,
            selected_spells.id,
            'web_character_creation',
            $2,
            TRUE,
            CASE WHEN selected_spells.level > 0 AND $4 IN ('cleric', 'druid') THEN TRUE ELSE FALSE END,
            FALSE,
            'Recommended default from web character creation.'
          FROM selected_spells
          ON CONFLICT (character_id, spell_id) DO NOTHING
        `,
        [characterId, validated.class.id, validated.spell_slugs, validated.class.slug]
      );
    }

    if (shouldActivateCharacter) {
      await client.query(
        `
          UPDATE account
          SET active_character_id = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [accountId, characterId]
      );
    }

    if (draftId) {
      await client.query(
        `
          UPDATE dnd5e_character_creation_draft
          SET status = 'completed',
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
            AND account_id = $2
        `,
        [draftId, accountId]
      );
    }

    const row = await loadCreatedCharacterSummary(characterId, accountId, client);
    const campaignExists = await hasActiveCampaign(characterId, client);
    return {
      character: summarizeCharacter(row, {
        activeCharacterChanged: shouldActivateCharacter,
        defaultsApplied: validated.defaults_applied,
        canStartAdventure: shouldActivateCharacter && !campaignExists,
      }),
      active_character_changed: shouldActivateCharacter,
      next_actions: {
        can_start_adventure: shouldActivateCharacter && !campaignExists,
        can_set_active: !shouldActivateCharacter,
        can_view_character: true,
        can_create_another: true,
      },
    };
  });
}

export async function setActiveWebCharacter(accountId, characterId) {
  await ensureWebCharacterCreationSchema();
  await withTransaction(async (client) => {
    const accountResult = await client.query('SELECT id FROM account WHERE id = $1 FOR UPDATE', [accountId]);
    if (accountResult.rowCount === 0) {
      throw createHttpError('Account not found', 404);
    }

    const characterResult = await client.query(
      `
        SELECT id, account_id, status
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
    if (Number(character.account_id) !== Number(accountId)) {
      throw createHttpError('Character does not belong to this account', 403);
    }
    if (character.status !== 'active') {
      throw createHttpError('Only active finalized characters can become the active character', 409);
    }

    await client.query(
      `
        UPDATE dnd5e_character
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE account_id = $1
      `,
      [accountId]
    );
    await client.query(
      `
        UPDATE dnd5e_character
        SET is_active = TRUE,
            updated_at = NOW()
        WHERE id = $1
      `,
      [characterId]
    );
    await client.query(
      `
        UPDATE account
        SET active_character_id = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [accountId, characterId]
    );

  });

  return getPlayerStateForAccount(accountId);
}

export async function startWebAdventure(accountId, input = {}) {
  await ensureWebCharacterCreationSchema();
  const explicitCharacterId = numericId(input.character_id);
  const accountResult = await query(
    `
      SELECT id, active_character_id
      FROM account
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );
  const account = accountResult.rows[0];
  if (!account) {
    throw createHttpError('Account not found', 404);
  }

  const characterId = explicitCharacterId ?? numericId(account.active_character_id);
  if (!characterId) {
    throw createHttpError('No active character is available to start an adventure', 409);
  }

  if (explicitCharacterId && Number(explicitCharacterId) !== Number(account.active_character_id)) {
    throw createHttpError('Set this character active before starting an adventure', 409);
  }

  const assignment = await assignSmsCampaignTransactional({
    account: {
      id: Number(account.id),
      active_character_id: characterId,
    },
    characterId,
  });

  if (assignment.result_type === 'assignment_failed') {
    throw createHttpError(`Could not start adventure: ${assignment.reason}`, 409);
  }

  return {
    assignment,
    player_state: await getPlayerStateForAccount(accountId),
  };
}
