import { createHttpError } from '../utils/httpError.js';

const CREATION_STATE = 'creating_character';
const CHARACTER_CREATED_STATE = 'character_created';

const startKeywords = new Set(['START', 'YES', 'BEGIN']);
const confirmKeywords = new Set(['1', 'YES', 'CONFIRM', 'CREATE']);
const editKeywords = new Set(['2', 'EDIT', 'CHANGE']);
const restartKeywords = new Set(['3', 'RESTART', 'START OVER', 'RESET']);
const noKeywords = new Set(['2', 'NO', 'BACK']);

const modeOptions = [
  { key: 'quick', label: 'Quick start - fastest, smart defaults', aliases: ['quick start', 'quick'] },
  { key: 'guided', label: 'Guided - more choices', aliases: ['guided', 'moderate'] },
];

const raceOptions = [
  { key: 'human', label: 'Human - adaptable', slug: 'human', aliases: ['human'] },
  { key: 'elf', label: 'Elf - graceful', slug: 'elf', aliases: ['elf'] },
  { key: 'dwarf', label: 'Dwarf - hardy', slug: 'dwarf', aliases: ['dwarf'] },
  { key: 'more', label: 'More', action: 'more' },
];

const raceMorePages = [
  [
    { key: 'halfling', label: 'Halfling - brave', slug: 'halfling', aliases: ['halfling'] },
    { key: 'dragonborn', label: 'Dragonborn - proud', slug: 'dragonborn', aliases: ['dragonborn'] },
    { key: 'gnome', label: 'Gnome - curious', slug: 'gnome', aliases: ['gnome'] },
    { key: 'more', label: 'More', action: 'more' },
  ],
  [
    { key: 'half-elf', label: 'Half-Elf - versatile', slug: 'half-elf', aliases: ['half elf', 'half-elf'] },
    { key: 'half-orc', label: 'Half-Orc - forceful', slug: 'half-orc', aliases: ['half orc', 'half-orc'] },
    { key: 'tiefling', label: 'Tiefling - uncanny', slug: 'tiefling', aliases: ['tiefling'] },
    { key: 'back', label: 'Back', action: 'back' },
  ],
];

const classPages = [
  [
    { key: 'fighter', label: 'Fighter - steady', slug: 'fighter', aliases: ['fighter', 'warrior'] },
    { key: 'rogue', label: 'Rogue - precise', slug: 'rogue', aliases: ['rogue', 'thief'] },
    { key: 'cleric', label: 'Cleric - devoted', slug: 'cleric', aliases: ['cleric', 'priest'] },
    { key: 'more', label: 'More', action: 'more' },
  ],
  [
    { key: 'wizard', label: 'Wizard - careful', slug: 'wizard', aliases: ['wizard', 'mage', 'magic user'] },
    { key: 'ranger', label: 'Ranger - watchful', slug: 'ranger', aliases: ['ranger', 'hunter'] },
    { key: 'paladin', label: 'Paladin - sworn', slug: 'paladin', aliases: ['paladin'] },
    { key: 'more', label: 'More', action: 'more' },
  ],
  [
    { key: 'warlock', label: 'Warlock - pact-bound', slug: 'warlock', aliases: ['warlock'] },
    { key: 'other', label: 'Other', action: 'other', aliases: ['other'] },
    { key: 'back', label: 'Back', action: 'back' },
  ],
];

const extraClassAliases = new Map([
  ['barbarian', 'barbarian'],
  ['bard', 'bard'],
  ['druid', 'druid'],
  ['monk', 'monk'],
  ['sorcerer', 'sorcerer'],
  ['sorc', 'sorcerer'],
  ['mage', 'wizard'],
  ['priest', 'cleric'],
  ['thief', 'rogue'],
  ['warrior', 'fighter'],
  ['hunter', 'ranger'],
]);

export const ClassRegistry = Object.freeze({
  core_slugs: ['fighter', 'rogue', 'cleric', 'wizard', 'ranger', 'paladin', 'warlock'],
  paged_options: classPages.map((page) => page.map((option) => ({ ...option }))),
  aliases: Object.fromEntries(extraClassAliases),
});

export function resolveClassAlias(text, visibleOptions = []) {
  return resolveClassInput(text, visibleOptions);
}

const attributePages = [
  [
    { key: 'strong_durable', label: 'Strong and durable' },
    { key: 'quick_precise', label: 'Quick and precise' },
    { key: 'wise_resilient', label: 'Wise and resilient' },
    { key: 'more', label: 'More', action: 'more' },
  ],
  [
    { key: 'intelligent_careful', label: 'Intelligent and careful' },
    { key: 'balanced', label: 'Balanced' },
    { key: 'back', label: 'Back', action: 'back' },
  ],
];

const backgroundPages = [
  [
    { key: 'wanderer', label: 'Wanderer - roadwise', slug: 'folk-hero', aliases: ['wanderer'] },
    { key: 'guard', label: 'Guard - vigilant', slug: 'soldier', aliases: ['guard'] },
    { key: 'scholar', label: 'Scholar - learned', slug: 'sage', aliases: ['scholar'] },
    { key: 'more', label: 'More', action: 'more' },
  ],
  [
    { key: 'acolyte', label: 'Acolyte - faithful', slug: 'acolyte', aliases: ['acolyte'] },
    { key: 'outlander', label: 'Outlander - self-reliant', slug: 'folk-hero', aliases: ['outlander'] },
    { key: 'artisan', label: 'Artisan - practical', slug: 'folk-hero', aliases: ['artisan'] },
    { key: 'back', label: 'Back', action: 'back' },
  ],
];

const traitOptions = [
  { key: 'brave', label: 'Brave' },
  { key: 'cautious', label: 'Cautious' },
  { key: 'curious', label: 'Curious' },
  { key: 'wry', label: 'Wry' },
];

const defaultBackgroundByClass = {
  fighter: backgroundPages[0][1],
  rogue: backgroundPages[0][0],
  cleric: backgroundPages[1][0],
  wizard: backgroundPages[0][2],
  ranger: backgroundPages[0][0],
  paladin: backgroundPages[0][1],
  warlock: backgroundPages[0][2],
};

const defaultTraitByClass = {
  fighter: traitOptions[0],
  rogue: traitOptions[2],
  cleric: traitOptions[1],
  wizard: traitOptions[2],
  ranger: traitOptions[1],
  paladin: traitOptions[0],
  warlock: traitOptions[3],
};

const classAttributeProfiles = {
  fighter: 'strong_durable',
  rogue: 'quick_precise',
  cleric: 'wise_resilient',
  wizard: 'intelligent_careful',
  ranger: 'quick_precise',
  paladin: 'strong_durable',
  warlock: 'balanced',
  barbarian: 'strong_durable',
  bard: 'balanced',
  druid: 'wise_resilient',
  monk: 'quick_precise',
  sorcerer: 'balanced',
};

const defaultSpellSlugsByClass = {
  cleric: ['light', 'sacred-flame', 'cure-wounds'],
  wizard: ['fire-bolt', 'mage-hand', 'magic-missile', 'shield'],
  warlock: ['eldritch-blast', 'minor-illusion'],
  bard: ['vicious-mockery', 'minor-illusion', 'healing-word'],
  druid: ['druidcraft', 'produce-flame', 'cure-wounds'],
  sorcerer: ['fire-bolt', 'mage-hand', 'magic-missile', 'shield'],
};

const attributeAssignments = {
  strong_durable: {
    label: 'Strong and durable',
    scores: { strength: 15, constitution: 14, dexterity: 13, wisdom: 12, intelligence: 10, charisma: 8 },
  },
  quick_precise: {
    label: 'Quick and precise',
    scores: { dexterity: 15, wisdom: 14, constitution: 13, intelligence: 12, charisma: 10, strength: 8 },
  },
  wise_resilient: {
    label: 'Wise and resilient',
    scores: { wisdom: 15, constitution: 14, strength: 13, dexterity: 12, charisma: 10, intelligence: 8 },
  },
  intelligent_careful: {
    label: 'Intelligent and careful',
    scores: { intelligence: 15, constitution: 14, dexterity: 13, wisdom: 12, charisma: 10, strength: 8 },
  },
  balanced: {
    label: 'Balanced',
    scores: { dexterity: 15, charisma: 14, constitution: 13, wisdom: 12, intelligence: 10, strength: 8 },
  },
};

const raceAbilityBonuses = {
  human: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
  elf: { dexterity: 2 },
  dwarf: { constitution: 2 },
  halfling: { dexterity: 2 },
  dragonborn: { strength: 2, charisma: 1 },
  gnome: { intelligence: 2 },
  'half-elf': { charisma: 2, dexterity: 1, constitution: 1 },
  'half-orc': { strength: 2, constitution: 1 },
  tiefling: { charisma: 2, intelligence: 1 },
};

const subraceAbilityBonuses = {
  'hill-dwarf': { wisdom: 1 },
  'mountain-dwarf': { strength: 2 },
  'high-elf': { intelligence: 1 },
  'wood-elf': { wisdom: 1 },
  'forest-gnome': { dexterity: 1 },
  'rock-gnome': { constitution: 1 },
  'lightfoot-halfling': { charisma: 1 },
  'stout-halfling': { constitution: 1 },
};

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeSlug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function optionLabels(options) {
  return options.map((option) => option.label);
}

function safeCharacterName(text) {
  const cleaned = normalizeText(text).replace(/\s+/g, ' ');

  if (!/^[A-Za-z][A-Za-z '\-]{1,39}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function resolveOption(text, options) {
  const normalized = normalizeText(text);
  const slug = normalizeSlug(normalized);

  if (/^\d+$/.test(normalized)) {
    return options[Number(normalized) - 1] ?? null;
  }

  return (
    options.find((option) => {
      const values = [option.key, option.slug, option.label, ...(option.aliases ?? [])];
      return values.some((value) => normalizeSlug(value) === slug);
    }) ?? null
  );
}

function getCreation(account) {
  const metadata = normalizeObject(account.sms_onboarding_metadata);
  const existing = normalizeObject(metadata.character_creation);

  return {
    mode: existing.mode ?? null,
    step: existing.step ?? account.onboarding_substate ?? 'mode',
    class_page: existing.class_page ?? 0,
    race_more_page: existing.race_more_page ?? 0,
    attribute_page: existing.attribute_page ?? 0,
    background_page: existing.background_page ?? 0,
    edit_page: existing.edit_page ?? 0,
    return_to_confirm: Boolean(existing.return_to_confirm),
    pending_class: existing.pending_class ?? null,
    draft: normalizeObject(existing.draft),
    defaults_applied: normalizeObject(existing.defaults_applied),
  };
}

function setCreationStep(creation, step, patch = {}) {
  return {
    ...creation,
    ...patch,
    step,
  };
}

async function persistCreation(account, creation, helpers, executor, extraUpdates = {}) {
  const nextMetadata = {
    ...normalizeObject(account.sms_onboarding_metadata),
    character_creation: creation,
    resume_pending: false,
  };

  await helpers.updateAccountOnboarding(
    account.id,
    {
      onboarding_state: CREATION_STATE,
      onboarding_substate: creation.step,
      sms_onboarding_metadata: nextMetadata,
      ...extraUpdates,
    },
    executor
  );

  if (account.sms_onboarding_draft_character_id) {
    await executor.query(
      `
        UPDATE dnd5e_character
        SET draft_metadata_json = $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
          AND account_id = $3
      `,
      [
        account.sms_onboarding_draft_character_id,
        JSON.stringify({ character_creation: creation }),
        account.id,
      ]
    );
  }
}

async function accountAfter(account, helpers, executor) {
  return helpers.accountAfter(account, executor);
}

function syncAndRender(account, session, templateId, variables, helpers) {
  const synced = helpers.syncSession(session, account);
  const outbound = helpers.renderOutbound(synced, templateId, variables);
  return {
    handled: true,
    account,
    ...outbound,
  };
}

async function getDefaultWorldId(executor) {
  const result = await executor.query(
    `
      SELECT id
      FROM dnd5e_world
      ORDER BY id
      LIMIT 1
    `
  );

  if (!result.rows[0]) {
    throw createHttpError('No world exists for SMS character creation', 409);
  }

  return Number(result.rows[0].id);
}

async function createOrUpdateDraft(account, creation, helpers, executor) {
  const draft = creation.draft;

  if (!draft.name) {
    return account.sms_onboarding_draft_character_id ?? null;
  }

  if (!account.sms_onboarding_draft_character_id) {
    const worldId = await getDefaultWorldId(executor);
    const result = await executor.query(
      `
        INSERT INTO dnd5e_character (
          account_id,
          world_id,
          name,
          status,
          created_via_sms,
          is_active,
          draft_metadata_json
        )
        VALUES ($1, $2, $3, 'draft', TRUE, FALSE, $4::jsonb)
        RETURNING id
      `,
      [account.id, worldId, draft.name, JSON.stringify({ character_creation: creation })]
    );

    return Number(result.rows[0].id);
  }

  await executor.query(
    `
      UPDATE dnd5e_character
      SET name = $2,
          draft_metadata_json = $3::jsonb,
          updated_at = NOW()
      WHERE id = $1
        AND account_id = $4
        AND status = 'draft'
    `,
    [
      account.sms_onboarding_draft_character_id,
      draft.name,
      JSON.stringify({ character_creation: creation }),
      account.id,
    ]
  );

  return account.sms_onboarding_draft_character_id;
}

async function fetchLookupBySlug(tableName, slug, executor) {
  const result = await executor.query(
    `
      SELECT *
      FROM ${tableName}
      WHERE slug = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] ?? null;
}

async function fetchClassBySlug(slug, executor) {
  return fetchLookupBySlug('dnd5e_class', slug, executor);
}

async function fetchRaceBySlug(slug, executor) {
  return fetchLookupBySlug('dnd5e_race', slug, executor);
}

async function fetchBackgroundBySlug(slug, executor) {
  return fetchLookupBySlug('dnd5e_background', slug, executor);
}

async function fetchSubracesForRace(raceId, executor) {
  const result = await executor.query(
    `
      SELECT id, name, slug, description
      FROM dnd5e_subrace
      WHERE race_id = $1
        AND is_active = TRUE
      ORDER BY name ASC
    `,
    [raceId]
  );

  return result.rows.map((row) => ({
    key: row.slug,
    slug: row.slug,
    id: Number(row.id),
    name: row.name,
    label: `${row.name} - ${subraceDescriptor(row.slug)}`,
  }));
}

function subraceDescriptor(slug) {
  const descriptors = {
    'hill-dwarf': 'resilient',
    'mountain-dwarf': 'martial',
    'high-elf': 'scholarly',
    'wood-elf': 'swift',
    'forest-gnome': 'subtle',
    'rock-gnome': 'practical',
    'lightfoot-halfling': 'sociable',
    'stout-halfling': 'sturdy',
  };

  return descriptors[slug] ?? 'distinctive';
}

function allRaceSelections() {
  return [...raceOptions, ...raceMorePages.flat()].filter((option) => option.slug);
}

function allClassSelections() {
  return [...classPages.flat()].filter((option) => option.slug);
}

function allBackgroundSelections() {
  return [...backgroundPages.flat()].filter((option) => option.slug);
}

function resolveRaceInput(text, visibleOptions = []) {
  const visible = resolveOption(text, visibleOptions);

  if (visible) {
    return visible;
  }

  if (normalizeSlug(text) === 'other') {
    return { key: 'more', action: 'more' };
  }

  return resolveOption(text, allRaceSelections());
}

function resolveClassInput(text, visibleOptions = []) {
  const visible = resolveOption(text, visibleOptions);

  if (visible) {
    return visible;
  }

  const slug = normalizeSlug(text);
  const direct = resolveOption(text, allClassSelections());

  if (direct) {
    return direct;
  }

  const mapped = extraClassAliases.get(slug);

  if (mapped) {
    return { key: mapped, slug: mapped, aliases: [text] };
  }

  if (slug === 'other') {
    return { key: 'other', action: 'other' };
  }

  return null;
}

function resolveBackgroundInput(text, visibleOptions = []) {
  return resolveOption(text, visibleOptions) ?? resolveOption(text, allBackgroundSelections());
}

async function resolveRaceSelection(selection, executor) {
  const race = await fetchRaceBySlug(selection.slug, executor);

  if (!race) {
    return null;
  }

  return {
    id: Number(race.id),
    slug: race.slug,
    name: race.name,
    selected_label: selection.label?.split(' - ')[0] ?? race.name,
    base_speed: race.base_speed ? Number(race.base_speed) : 30,
  };
}

async function resolveClassSelection(selection, executor) {
  const classRow = await fetchClassBySlug(selection.slug, executor);

  if (!classRow) {
    return null;
  }

  return {
    id: Number(classRow.id),
    slug: classRow.slug,
    name: classRow.name,
    hit_die: Number(classRow.hit_die),
    selected_label: selection.label?.split(' - ')[0] ?? classRow.name,
  };
}

async function resolveBackgroundSelection(selection, executor) {
  const background = await fetchBackgroundBySlug(selection.slug, executor);

  if (!background) {
    return null;
  }

  return {
    id: Number(background.id),
    slug: background.slug,
    name: background.name,
    selected_label: selection.label?.split(' - ')[0] ?? background.name,
  };
}

function applyAbilityBonuses(scores, raceSlug, subraceSlug) {
  const next = { ...scores };

  for (const [ability, value] of Object.entries(raceAbilityBonuses[raceSlug] ?? {})) {
    next[ability] = (next[ability] ?? 10) + value;
  }

  for (const [ability, value] of Object.entries(subraceAbilityBonuses[subraceSlug] ?? {})) {
    next[ability] = (next[ability] ?? 10) + value;
  }

  return next;
}

function computeAttributes(creation, profileKey) {
  const profile = attributeAssignments[profileKey] ?? attributeAssignments.balanced;
  return {
    profile_key: profileKey,
    profile_label: profile.label,
    scores: applyAbilityBonuses(
      profile.scores,
      creation.draft.race?.slug,
      creation.draft.subrace?.slug
    ),
  };
}

function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

function summarizeCharacter(creation) {
  const draft = creation.draft;
  const pieces = [
    `Name: ${draft.name ?? 'Unknown'}.`,
    `Species: ${draft.subrace?.name ?? draft.race?.selected_label ?? draft.race?.name ?? 'Unknown'}.`,
    `Class: ${draft.class?.name ?? 'Unknown'}.`,
    `Background: ${draft.background?.selected_label ?? draft.background?.name ?? 'Wanderer'}.`,
    `Trait: ${draft.trait?.label ?? 'Curious'}.`,
  ];

  return pieces.join(' ');
}

function getLastStepLabel(account) {
  const substate = account.onboarding_substate ?? getCreation(account).step ?? 'mode';
  const labels = {
    mode: 'choose creation mode',
    name: 'choose a name',
    race: 'choose a species',
    race_more: 'choose a species',
    subrace: 'choose a lineage',
    class: 'choose a class',
    class_other: 'enter a class',
    class_other_confirm: 'confirm a class',
    attribute: 'choose strengths',
    background: 'choose a background',
    trait: 'choose a trait',
    confirm: 'confirm your character',
    edit: 'choose what to edit',
  };

  return labels[substate] ?? 'continue character creation';
}

export function getSmsCharacterCreationNextStepText(account) {
  return `Continue to ${getLastStepLabel(account)}.`;
}

async function renderModeSelect(account, session, helpers) {
  return syncAndRender(account, session, 'character.mode_select', {
    options: optionLabels(modeOptions),
  }, helpers);
}

async function renderRacePrompt(account, session, helpers, creation) {
  return syncAndRender(account, session, 'character.race_prompt', {
    prompt_text: 'Choose a species.',
    options: optionLabels(raceOptions),
  }, helpers);
}

async function renderRaceMore(account, session, helpers, creation) {
  const page = creation.race_more_page ?? 0;
  return syncAndRender(account, session, 'character.race_more', {
    prompt_text: page === 0 ? 'More species.' : 'More species, final page.',
    options: optionLabels(raceMorePages[page] ?? raceMorePages[0]),
  }, helpers);
}

async function renderClassPrompt(account, session, helpers, creation, promptText = 'Choose a class.') {
  const page = creation.class_page ?? 0;
  return syncAndRender(account, session, 'character.class_prompt', {
    prompt_text: promptText,
    options: optionLabels(classPages[page] ?? classPages[0]),
  }, helpers);
}

async function renderAttributePrompt(account, session, helpers, creation) {
  const page = creation.attribute_page ?? 0;
  return syncAndRender(account, session, 'character.attribute_prompt', {
    options: optionLabels(attributePages[page] ?? attributePages[0]),
  }, helpers);
}

async function renderBackgroundPrompt(account, session, helpers, creation) {
  const page = creation.background_page ?? 0;
  return syncAndRender(account, session, 'character.background_prompt', {
    options: optionLabels(backgroundPages[page] ?? backgroundPages[0]),
  }, helpers);
}

async function renderConfirm(account, session, helpers, creation) {
  return syncAndRender(account, session, 'character.confirm_summary', {
    character_summary: summarizeCharacter(creation),
    options: ['Confirm', 'Edit', 'Start over'],
  }, helpers);
}

async function renderEditPrompt(account, session, helpers, creation) {
  const page = creation.edit_page ?? 0;
  const options = page === 0
    ? ['Name', 'Species', 'Class', 'More']
    : ['Background', 'Trait', 'Start over', 'Back'];
  return syncAndRender(account, session, 'character.edit_prompt', { options }, helpers);
}

async function startOrUpdateDraft(account, creation, helpers, executor) {
  const draftId = await createOrUpdateDraft(account, creation, helpers, executor);
  await persistCreation(account, creation, helpers, executor, {
    sms_onboarding_draft_character_id: draftId ?? account.sms_onboarding_draft_character_id,
  });
}

export async function startSmsCharacterCreation(account, session, helpers, executor) {
  const creation = setCreationStep(getCreation(account), 'mode', {
    mode: null,
    draft: {},
    return_to_confirm: false,
    class_page: 0,
    race_more_page: 0,
    attribute_page: 0,
    background_page: 0,
    edit_page: 0,
  });

  await persistCreation(account, creation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);
  return renderModeSelect(updatedAccount, session, helpers);
}

export async function restartSmsCharacterCreation(account, helpers, executor) {
  if (account.sms_onboarding_draft_character_id) {
    await executor.query(
      `
        UPDATE dnd5e_character
        SET status = 'retired',
            is_active = FALSE,
            updated_at = NOW()
        WHERE id = $1
          AND account_id = $2
          AND status = 'draft'
      `,
      [account.sms_onboarding_draft_character_id, account.id]
    );
  }

  const creation = {
    mode: null,
    step: 'mode',
    draft: {},
    defaults_applied: {},
    class_page: 0,
    race_more_page: 0,
    attribute_page: 0,
    background_page: 0,
    edit_page: 0,
    return_to_confirm: false,
  };

  await persistCreation(account, creation, helpers, executor, {
    sms_onboarding_draft_character_id: null,
  });
}

async function setRaceAndAdvance(account, session, helpers, executor, creation, selection) {
  const race = await resolveRaceSelection(selection, executor);

  if (!race) {
    return syncAndRender(account, session, 'character.unrecognized_race', {
      race_hint: 'Reply with a listed number or species name.',
    }, helpers);
  }

  let nextCreation = setCreationStep(creation, 'subrace', {
    race_more_page: 0,
    draft: {
      ...creation.draft,
      race,
      subrace: null,
    },
  });

  await persistCreation(account, nextCreation, helpers, executor);
  let updatedAccount = await accountAfter(account, helpers, executor);
  const subraces = await fetchSubracesForRace(race.id, executor);

  if (subraces.length > 0) {
    return syncAndRender(updatedAccount, session, 'character.subrace_prompt', {
      race_name: race.name,
      options: optionLabels(subraces),
    }, helpers);
  }

  nextCreation = setCreationStep(nextCreation, creation.return_to_confirm ? 'confirm' : 'class', {
    draft: {
      ...nextCreation.draft,
      subrace: null,
    },
  });
  await persistCreation(updatedAccount, nextCreation, helpers, executor);
  updatedAccount = await accountAfter(updatedAccount, helpers, executor);

  if (creation.return_to_confirm) {
    return renderConfirm(updatedAccount, session, helpers, nextCreation);
  }

  return renderClassPrompt(updatedAccount, session, helpers, nextCreation);
}

async function setClassAndAdvance(account, session, helpers, executor, creation, selection) {
  const classRecord = await resolveClassSelection(selection, executor);

  if (!classRecord) {
    return syncAndRender(account, session, 'character.unrecognized_class', {
      class_hint: 'Try Fighter, Rogue, Cleric, Wizard, Ranger, Paladin, Warlock, or Other.',
    }, helpers);
  }

  let nextCreation = {
    ...creation,
    class_page: 0,
    pending_class: null,
    draft: {
      ...creation.draft,
      class: classRecord,
    },
  };

  const shouldConfirmNow = creation.return_to_confirm;

  if (creation.mode === 'quick') {
    const profileKey = classAttributeProfiles[classRecord.slug] ?? 'balanced';
    const backgroundSelection = defaultBackgroundByClass[classRecord.slug] ?? backgroundPages[0][0];
    const background = await resolveBackgroundSelection(backgroundSelection, executor);
    nextCreation = {
      ...nextCreation,
      draft: {
        ...nextCreation.draft,
        attribute_profile: profileKey,
        attributes: computeAttributes(nextCreation, profileKey),
        background,
        trait: defaultTraitByClass[classRecord.slug] ?? traitOptions[2],
      },
      defaults_applied: {
        background: background?.selected_label ?? background?.name ?? 'Wanderer',
        trait: (defaultTraitByClass[classRecord.slug] ?? traitOptions[2]).label,
        equipment: defaultEquipmentForClass(classRecord.slug),
        spells: defaultSpellSlugsByClass[classRecord.slug] ?? [],
      },
    };
  }

  nextCreation = setCreationStep(nextCreation, shouldConfirmNow || creation.mode === 'quick' ? 'confirm' : 'attribute');
  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);

  if (shouldConfirmNow || creation.mode === 'quick') {
    return renderConfirm(updatedAccount, session, helpers, nextCreation);
  }

  return renderAttributePrompt(updatedAccount, session, helpers, nextCreation);
}

function defaultEquipmentForClass(classSlug) {
  const equipment = {
    fighter: ['chain-mail', 'shield', 'longsword'],
    rogue: ['leather-armor', 'dagger', 'shortbow'],
    cleric: ['scale-mail', 'mace', 'shield'],
    wizard: ['quarterstaff', 'dagger'],
    ranger: ['leather-armor', 'shortbow', 'shortsword'],
    paladin: ['chain-mail', 'shield', 'longsword'],
    warlock: ['leather-armor', 'dagger', 'quarterstaff'],
  };

  return equipment[classSlug] ?? ['dagger', 'leather-armor'];
}

async function finalizeCreation(account, session, helpers, executor) {
  const creation = getCreation(account);
  const draft = creation.draft;
  const draftId = account.sms_onboarding_draft_character_id;

  if (account.active_character_id && !draftId) {
    const outbound = helpers.renderOutbound(session, 'character.created', {
      character_name: account.active_character_name ?? 'Your character',
    });
    return {
      handled: true,
      account,
      ...outbound,
    };
  }

  if (!draftId || !draft.name || !draft.race?.id || !draft.class?.id || !draft.background?.id) {
    return syncAndRender(account, session, 'character.invalid_choice', {
      choice_hint: 'Some choices are missing. Reply EDIT or START OVER.',
    }, helpers);
  }

  const attributes = draft.attributes ?? computeAttributes(creation, draft.attribute_profile ?? 'balanced');
  const scores = attributes.scores;
  const maxHitPoints = Math.max(1, Number(draft.class.hit_die ?? 8) + abilityModifier(scores.constitution));
  const armorClass = 10 + abilityModifier(scores.dexterity);
  const speed = draft.race.base_speed ?? 30;
  const notes = [
    'Created through SMS character creation.',
    `Default equipment: ${(creation.defaults_applied?.equipment ?? defaultEquipmentForClass(draft.class.slug)).join(', ')}.`,
    `Default spells: ${(creation.defaults_applied?.spells ?? defaultSpellSlugsByClass[draft.class.slug] ?? []).join(', ') || 'none'}.`,
  ].join(' ');

  await executor.query(
    `
      UPDATE dnd5e_character
      SET name = $2,
          race_id = $3,
          subrace_id = $4,
          class_id = $5,
          background_id = $6,
          level = 1,
          experience_points = 0,
          strength = $7,
          dexterity = $8,
          constitution = $9,
          intelligence = $10,
          wisdom = $11,
          charisma = $12,
          max_hit_points = $13,
          current_hit_points = $13,
          temporary_hit_points = 0,
          armor_class = $14,
          speed = $15,
          proficiency_bonus = 2,
          personality_traits = $16,
          notes = $17,
          status = 'active',
          created_via_sms = TRUE,
          is_active = TRUE,
          draft_metadata_json = $18::jsonb,
          updated_at = NOW()
      WHERE id = $1
        AND account_id = $19
        AND status = 'draft'
    `,
    [
      draftId,
      draft.name,
      draft.race.id,
      draft.subrace?.id ?? null,
      draft.class.id,
      draft.background.id,
      scores.strength,
      scores.dexterity,
      scores.constitution,
      scores.intelligence,
      scores.wisdom,
      scores.charisma,
      maxHitPoints,
      armorClass,
      speed,
      draft.trait?.label ?? 'Curious',
      notes,
      JSON.stringify({ character_creation: { ...creation, completed_at: new Date().toISOString() } }),
      account.id,
    ]
  );

  await executor.query(
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
    [draftId, draft.class.id]
  );

  await applyDefaultEquipment(draftId, draft.class.slug, executor);
  await applyDefaultSpells(draftId, draft.class, executor);

  await helpers.updateAccountOnboarding(
    account.id,
    {
      onboarding_state: CHARACTER_CREATED_STATE,
      onboarding_substate: null,
      active_character_id: draftId,
      sms_onboarding_draft_character_id: null,
      sms_onboarding_metadata: {
        ...normalizeObject(account.sms_onboarding_metadata),
        character_creation: {
          ...creation,
          step: 'completed',
          completed_at: new Date().toISOString(),
        },
        resume_pending: false,
      },
    },
    executor
  );

  const updatedAccount = await accountAfter(account, helpers, executor);
  return syncAndRender(updatedAccount, session, 'character.created', {
    character_name: updatedAccount.active_character_name ?? draft.name,
  }, helpers);
}

async function applyDefaultEquipment(characterId, classSlug, executor) {
  const itemSlugs = defaultEquipmentForClass(classSlug);

  await executor.query(
    `
      WITH selected_items AS (
        SELECT id, slug
        FROM dnd5e_item
        WHERE slug = ANY($2::text[])
      )
      INSERT INTO dnd5e_character_item (
        character_id,
        item_id,
        quantity,
        is_equipped,
        is_attuned,
        notes
      )
      SELECT
        $1,
        selected_items.id,
        1,
        TRUE,
        FALSE,
        'Default equipment from SMS character creation.'
      FROM selected_items
      WHERE NOT EXISTS (
        SELECT 1
        FROM dnd5e_character_item existing
        WHERE existing.character_id = $1
          AND existing.item_id = selected_items.id
      )
    `,
    [characterId, itemSlugs]
  );
}

async function applyDefaultSpells(characterId, classRecord, executor) {
  const spellSlugs = defaultSpellSlugsByClass[classRecord.slug] ?? [];

  if (spellSlugs.length === 0) {
    return;
  }

  await executor.query(
    `
      WITH selected_spells AS (
        SELECT id, slug, level
        FROM dnd5e_spell
        WHERE slug = ANY($3::text[])
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
        'sms_character_creation',
        $2,
        TRUE,
        CASE WHEN selected_spells.level > 0 AND $4 IN ('cleric', 'druid') THEN TRUE ELSE FALSE END,
        FALSE,
        'Default spell from SMS character creation.'
      FROM selected_spells
      ON CONFLICT (character_id, spell_id) DO NOTHING
    `,
    [characterId, classRecord.id, spellSlugs, classRecord.slug]
  );
}

async function handleMode(account, text, session, helpers, executor, creation) {
  const selected = resolveOption(text, modeOptions);

  if (!selected) {
    return syncAndRender(account, session, 'character.invalid_choice', {
      choice_hint: 'Reply 1 for Quick start or 2 for Guided.',
    }, helpers);
  }

  const nextCreation = setCreationStep(creation, 'name', {
    mode: selected.key,
    draft: {},
    return_to_confirm: false,
  });
  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);
  return syncAndRender(updatedAccount, session, 'character.name_prompt', {
    name_hint: 'Reply with a short name.',
  }, helpers);
}

async function handleName(account, text, session, helpers, executor, creation) {
  const characterName = safeCharacterName(text);

  if (!characterName) {
    return syncAndRender(account, session, 'character.name_invalid', {
      name_hint: 'Use 2-40 letters.',
    }, helpers);
  }

  const shouldReturn = creation.return_to_confirm;
  const nextCreation = setCreationStep(creation, shouldReturn ? 'confirm' : 'race', {
    draft: {
      ...creation.draft,
      name: characterName,
    },
  });

  await startOrUpdateDraft(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);

  if (shouldReturn) {
    return renderConfirm(updatedAccount, session, helpers, nextCreation);
  }

  return renderRacePrompt(updatedAccount, session, helpers, nextCreation);
}

async function handleRace(account, text, session, helpers, executor, creation) {
  const selected = resolveRaceInput(text, raceOptions);

  if (!selected) {
    return syncAndRender(account, session, 'character.unrecognized_race', {
      race_hint: 'Reply with a listed number or species name.',
    }, helpers);
  }

  if (selected.action === 'more') {
    const nextCreation = setCreationStep(creation, 'race_more', { race_more_page: 0 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderRaceMore(updatedAccount, session, helpers, nextCreation);
  }

  return setRaceAndAdvance(account, session, helpers, executor, creation, selected);
}

async function handleRaceMore(account, text, session, helpers, executor, creation) {
  const page = creation.race_more_page ?? 0;
  const visibleOptions = raceMorePages[page] ?? raceMorePages[0];
  const selected = resolveRaceInput(text, visibleOptions);

  if (!selected) {
    return syncAndRender(account, session, 'character.unrecognized_race', {
      race_hint: 'Reply with a listed number or species name.',
    }, helpers);
  }

  if (selected.action === 'more') {
    const nextPage = Math.min(page + 1, raceMorePages.length - 1);
    const nextCreation = setCreationStep(creation, 'race_more', { race_more_page: nextPage });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderRaceMore(updatedAccount, session, helpers, nextCreation);
  }

  if (selected.action === 'back') {
    const nextCreation = setCreationStep(creation, 'race', { race_more_page: 0 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderRacePrompt(updatedAccount, session, helpers, nextCreation);
  }

  return setRaceAndAdvance(account, session, helpers, executor, creation, selected);
}

async function handleSubrace(account, text, session, helpers, executor, creation) {
  const race = creation.draft.race;
  const subraces = race?.id ? await fetchSubracesForRace(race.id, executor) : [];
  const selected = resolveOption(text, subraces);

  if (!selected) {
    return syncAndRender(account, session, 'character.subrace_prompt', {
      race_name: race?.name ?? 'chosen species',
      options: optionLabels(subraces),
    }, helpers);
  }

  const subrace = {
    id: selected.id,
    slug: selected.slug,
    name: selected.name,
  };
  const nextStep = creation.return_to_confirm ? 'confirm' : 'class';
  const nextCreation = setCreationStep(creation, nextStep, {
    draft: {
      ...creation.draft,
      subrace,
    },
  });

  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);

  if (creation.return_to_confirm) {
    return renderConfirm(updatedAccount, session, helpers, nextCreation);
  }

  return renderClassPrompt(updatedAccount, session, helpers, nextCreation);
}

async function handleClass(account, text, session, helpers, executor, creation) {
  const page = creation.class_page ?? 0;
  const visibleOptions = classPages[page] ?? classPages[0];
  const selected = resolveClassInput(text, visibleOptions);

  if (!selected) {
    return syncAndRender(account, session, 'character.unrecognized_class', {
      class_hint: 'Try Fighter, Rogue, Cleric, Wizard, Ranger, Paladin, Warlock, or Other.',
    }, helpers);
  }

  if (selected.action === 'more') {
    const nextPage = Math.min(page + 1, classPages.length - 1);
    const nextCreation = setCreationStep(creation, 'class', { class_page: nextPage });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderClassPrompt(updatedAccount, session, helpers, nextCreation);
  }

  if (selected.action === 'back') {
    const nextPage = Math.max(page - 1, 0);
    const nextCreation = setCreationStep(creation, 'class', { class_page: nextPage });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderClassPrompt(updatedAccount, session, helpers, nextCreation);
  }

  if (selected.action === 'other') {
    const nextCreation = setCreationStep(creation, 'class_other');
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return syncAndRender(updatedAccount, session, 'character.class_other_prompt', {
      class_hint: 'Example: Bard, Druid, Monk, or Sorcerer.',
    }, helpers);
  }

  return setClassAndAdvance(account, session, helpers, executor, creation, selected);
}

async function handleClassOther(account, text, session, helpers, executor, creation) {
  const selected = resolveClassInput(text, []);

  if (!selected?.slug) {
    return syncAndRender(account, session, 'character.unrecognized_class', {
      class_hint: 'Try Bard, Druid, Monk, Sorcerer, or another SRD class.',
    }, helpers);
  }

  const classRecord = await resolveClassSelection(selected, executor);

  if (!classRecord) {
    return syncAndRender(account, session, 'character.unrecognized_class', {
      class_hint: 'Try Bard, Druid, Monk, Sorcerer, or another SRD class.',
    }, helpers);
  }

  const nextCreation = setCreationStep(creation, 'class_other_confirm', {
    pending_class: classRecord,
  });
  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);

  return syncAndRender(updatedAccount, session, 'character.class_prompt', {
    prompt_text: `I matched that to ${classRecord.name}. Use it?`,
    options: ['Yes', 'No'],
  }, helpers);
}

async function handleClassOtherConfirm(account, text, session, helpers, executor, creation) {
  const upper = normalizeUpper(text);

  if (confirmKeywords.has(upper)) {
    return setClassAndAdvance(account, session, helpers, executor, creation, creation.pending_class);
  }

  if (noKeywords.has(upper)) {
    const nextCreation = setCreationStep(creation, 'class_other', { pending_class: null });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return syncAndRender(updatedAccount, session, 'character.class_other_prompt', {
      class_hint: 'Try another short class name.',
    }, helpers);
  }

  return syncAndRender(account, session, 'character.invalid_choice', {
    choice_hint: 'Reply 1 for Yes or 2 for No.',
  }, helpers);
}

async function handleAttribute(account, text, session, helpers, executor, creation) {
  const page = creation.attribute_page ?? 0;
  const selected = resolveOption(text, attributePages[page] ?? attributePages[0]);

  if (!selected) {
    return syncAndRender(account, session, 'character.invalid_choice', {
      choice_hint: 'Reply with a listed strength profile.',
    }, helpers);
  }

  if (selected.action === 'more') {
    const nextCreation = setCreationStep(creation, 'attribute', { attribute_page: 1 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderAttributePrompt(updatedAccount, session, helpers, nextCreation);
  }

  if (selected.action === 'back') {
    const nextCreation = setCreationStep(creation, 'attribute', { attribute_page: 0 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderAttributePrompt(updatedAccount, session, helpers, nextCreation);
  }

  const nextStep = creation.return_to_confirm ? 'confirm' : 'background';
  const nextCreation = setCreationStep(creation, nextStep, {
    attribute_page: 0,
    draft: {
      ...creation.draft,
      attribute_profile: selected.key,
      attributes: computeAttributes(creation, selected.key),
    },
  });

  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);

  if (creation.return_to_confirm) {
    return renderConfirm(updatedAccount, session, helpers, nextCreation);
  }

  return renderBackgroundPrompt(updatedAccount, session, helpers, nextCreation);
}

async function handleBackground(account, text, session, helpers, executor, creation) {
  const page = creation.background_page ?? 0;
  const selected = resolveBackgroundInput(text, backgroundPages[page] ?? backgroundPages[0]);

  if (!selected) {
    return syncAndRender(account, session, 'character.invalid_choice', {
      choice_hint: 'Reply with a listed background.',
    }, helpers);
  }

  if (selected.action === 'more') {
    const nextCreation = setCreationStep(creation, 'background', { background_page: 1 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderBackgroundPrompt(updatedAccount, session, helpers, nextCreation);
  }

  if (selected.action === 'back') {
    const nextCreation = setCreationStep(creation, 'background', { background_page: 0 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderBackgroundPrompt(updatedAccount, session, helpers, nextCreation);
  }

  const background = await resolveBackgroundSelection(selected, executor);

  if (!background) {
    return syncAndRender(account, session, 'character.invalid_choice', {
      choice_hint: 'That background is unavailable. Reply with a listed option.',
    }, helpers);
  }

  const nextStep = creation.return_to_confirm ? 'confirm' : 'trait';
  const nextCreation = setCreationStep(creation, nextStep, {
    background_page: 0,
    draft: {
      ...creation.draft,
      background,
    },
  });

  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);

  if (creation.return_to_confirm) {
    return renderConfirm(updatedAccount, session, helpers, nextCreation);
  }

  return syncAndRender(updatedAccount, session, 'character.trait_prompt', {
    options: optionLabels(traitOptions),
  }, helpers);
}

async function handleTrait(account, text, session, helpers, executor, creation) {
  const selected = resolveOption(text, traitOptions);

  if (!selected) {
    return syncAndRender(account, session, 'character.invalid_choice', {
      choice_hint: 'Reply with a listed trait.',
    }, helpers);
  }

  const nextCreation = setCreationStep(creation, 'confirm', {
    draft: {
      ...creation.draft,
      trait: selected,
    },
  });

  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);
  return renderConfirm(updatedAccount, session, helpers, nextCreation);
}

async function handleConfirm(account, text, session, helpers, executor, creation) {
  const upper = normalizeUpper(text);

  if (confirmKeywords.has(upper)) {
    return finalizeCreation(account, session, helpers, executor);
  }

  if (editKeywords.has(upper)) {
    const nextCreation = setCreationStep(creation, 'edit', {
      edit_page: 0,
      return_to_confirm: true,
    });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderEditPrompt(updatedAccount, session, helpers, nextCreation);
  }

  if (restartKeywords.has(upper)) {
    await restartSmsCharacterCreation(account, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderModeSelect(updatedAccount, session, helpers);
  }

  return syncAndRender(account, session, 'character.invalid_choice', {
    choice_hint: 'Reply 1 to Confirm, 2 to Edit, or 3 to Start over.',
  }, helpers);
}

async function handleEdit(account, text, session, helpers, executor, creation) {
  const page = creation.edit_page ?? 0;
  const options = page === 0
    ? [
        { key: 'name', label: 'Name', step: 'name' },
        { key: 'species', label: 'Species', step: 'race' },
        { key: 'class', label: 'Class', step: 'class' },
        { key: 'more', label: 'More', action: 'more' },
      ]
    : [
        { key: 'background', label: 'Background', step: 'background' },
        { key: 'trait', label: 'Trait', step: 'trait' },
        { key: 'restart', label: 'Start over', action: 'restart' },
        { key: 'back', label: 'Back', action: 'back' },
      ];
  const selected = resolveOption(text, options);

  if (!selected) {
    return syncAndRender(account, session, 'character.invalid_choice', {
      choice_hint: 'Reply with a listed edit option.',
    }, helpers);
  }

  if (selected.action === 'more') {
    const nextCreation = setCreationStep(creation, 'edit', { edit_page: 1 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderEditPrompt(updatedAccount, session, helpers, nextCreation);
  }

  if (selected.action === 'back') {
    const nextCreation = setCreationStep(creation, 'edit', { edit_page: 0 });
    await persistCreation(account, nextCreation, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderEditPrompt(updatedAccount, session, helpers, nextCreation);
  }

  if (selected.action === 'restart') {
    await restartSmsCharacterCreation(account, helpers, executor);
    const updatedAccount = await accountAfter(account, helpers, executor);
    return renderModeSelect(updatedAccount, session, helpers);
  }

  const nextCreation = setCreationStep(creation, selected.step, {
    return_to_confirm: true,
    edit_page: 0,
    class_page: selected.step === 'class' ? 0 : creation.class_page,
    race_more_page: selected.step === 'race' ? 0 : creation.race_more_page,
  });
  await persistCreation(account, nextCreation, helpers, executor);
  const updatedAccount = await accountAfter(account, helpers, executor);

  switch (selected.step) {
    case 'name':
      return syncAndRender(updatedAccount, session, 'character.name_prompt', {
        name_hint: 'Reply with the new name.',
      }, helpers);
    case 'race':
      return renderRacePrompt(updatedAccount, session, helpers, nextCreation);
    case 'class':
      return renderClassPrompt(updatedAccount, session, helpers, nextCreation);
    case 'background':
      return renderBackgroundPrompt(updatedAccount, session, helpers, nextCreation);
    case 'trait':
      return syncAndRender(updatedAccount, session, 'character.trait_prompt', {
        options: optionLabels(traitOptions),
      }, helpers);
    default:
      return renderEditPrompt(updatedAccount, session, helpers, nextCreation);
  }
}

export async function handleSmsCharacterCreation({
  account,
  text,
  session,
  helpers,
  executor,
} = {}) {
  const normalizedText = normalizeText(text);
  const upper = normalizeUpper(normalizedText);
  const creation = getCreation(account);
  const step = account.onboarding_substate ?? creation.step ?? 'mode';

  if (startKeywords.has(upper) && step !== 'mode') {
    return syncAndRender(account, session, 'character.creation_resume', {
      last_step: getLastStepLabel(account),
      resume_hint: 'Reply with a listed choice to continue.',
    }, helpers);
  }

  switch (step) {
    case 'mode':
      return handleMode(account, normalizedText, session, helpers, executor, creation);
    case 'name':
      return handleName(account, normalizedText, session, helpers, executor, creation);
    case 'race':
      return handleRace(account, normalizedText, session, helpers, executor, creation);
    case 'race_more':
      return handleRaceMore(account, normalizedText, session, helpers, executor, creation);
    case 'subrace':
      return handleSubrace(account, normalizedText, session, helpers, executor, creation);
    case 'class':
      return handleClass(account, normalizedText, session, helpers, executor, creation);
    case 'class_other':
      return handleClassOther(account, normalizedText, session, helpers, executor, creation);
    case 'class_other_confirm':
      return handleClassOtherConfirm(account, normalizedText, session, helpers, executor, creation);
    case 'attribute':
      return handleAttribute(account, normalizedText, session, helpers, executor, creation);
    case 'background':
      return handleBackground(account, normalizedText, session, helpers, executor, creation);
    case 'trait':
      return handleTrait(account, normalizedText, session, helpers, executor, creation);
    case 'confirm':
      return handleConfirm(account, normalizedText, session, helpers, executor, creation);
    case 'edit':
      return handleEdit(account, normalizedText, session, helpers, executor, creation);
    default: {
      const nextCreation = setCreationStep(creation, 'mode');
      await persistCreation(account, nextCreation, helpers, executor);
      const updatedAccount = await accountAfter(account, helpers, executor);
      return renderModeSelect(updatedAccount, session, helpers);
    }
  }
}
