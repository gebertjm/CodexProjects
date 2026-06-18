import { query, withTransaction } from '../config/db.js';
import {
  completeLevelUpSessionQuery,
  insertAdvancementEventQuery,
  insertLevelUpSessionQuery,
  selectActiveCampaignContextByCharacterQuery,
  selectAdvancementEventByCharacterAndDedupeKeyQuery,
  selectAdvancementEventsByCharacterQuery,
  selectAvailableSubclassesForClassQuery,
  selectCampaignActiveCharacterLevelsQuery,
  selectCampaignAdvancementConfigQuery,
  selectCharacterAdvancementByIdForUpdateQuery,
  selectCharacterAdvancementByIdQuery,
  selectCharacterClassByIdForUpdateQuery,
  selectClassFeaturesAtLevelQuery,
  selectClassSpellsByClassIdQuery,
  selectLatestLevelUpSessionByCharacterQuery,
  selectOpenLevelUpSessionByCharacterForUpdateQuery,
  selectOpenLevelUpSessionByCharacterQuery,
  selectOpenProgressionWindowsForCharacterQuery,
  selectPrimaryCharacterClassForUpdateQuery,
  selectSubclassFeaturesAtLevelQuery,
  updateCampaignAdvancementConfigQuery,
  updateCharacterClassLevelAndSubclassQuery,
  updateCharacterClassLevelQuery,
  updateCharacterLevelingSummaryQuery,
  updateCharacterPendingAdvancementQuery,
  updateLevelUpSessionStateQuery,
  updateWorldAdvancementConfigQuery,
} from '../db/queries/advancement.js';
import { selectCharacterClassesQuery } from '../db/queries/characterComposition.js';
import {
  insertCharacterSpellQuery,
  selectCharacterManualSpellsQuery,
  selectDerivedSpellGrantsQuery,
} from '../db/queries/spells.js';
import {
  selectActiveCombatByCampaignAndCharacterQuery,
  selectActiveEventByCampaignAndCharacterQuery,
  selectOpenActionWindowByCampaignAndCharacterQuery,
} from '../db/queries/adventureRuntime.js';
import { selectActiveDialogueSessionByCampaignAndCharacterQuery } from '../db/queries/dialogue.js';
import { createHttpError } from '../utils/httpError.js';
import {
  advancementEventKinds,
  calculateAbilityModifier,
  calculateCatchUpMultiplier,
  calculateFixedHitPointGain,
  calculateProficiencyBonus,
  computePendingLevelsFromXp,
  getDefaultAdvancementConfig,
  getDefaultXpThresholds,
  getHighestEligibleLevel,
  getXpThresholdForLevel,
  normalizeAdvancementConfig,
  normalizeAdvancementMode,
} from '../utils/advancementRules.js';
import { getClassSpellProfile, getKnownSpellLimitForClass, getMaxSpellLevelForClassEntry } from '../utils/spellcastingRules.js';
import { recordGameplayHistory } from './gameplayHistoryService.js';

const openLevelUpStatuses = new Set([
  'started',
  'awaiting_choice',
  'validating',
  'ready_to_finalize',
  'deferred',
]);

const supportedGrantSources = new Set([
  'objective',
  'quest',
  'combat',
  'discovery',
  'dialogue',
  'decision',
  'encounter',
  'system',
  'gm',
  'adventure',
  'milestone',
  'level_up',
]);

function normalizePositiveInteger(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function normalizeNonNegativeInteger(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError(`${label} must be a non-negative integer`, 400);
  }

  return parsed;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw createHttpError(`${label} must be an array`, 400);
  }

  return value
    .map((entry) => normalizeOptionalText(entry))
    .filter((entry) => entry !== null);
}

function mapCharacterAdvancementRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    account_id: Number(row.account_id),
    world_id: Number(row.world_id),
    world_slug: row.world_slug,
    name: row.name,
    level: Number(row.level),
    experience_points: Number(row.experience_points),
    pending_level_count: Number(row.pending_level_count ?? 0),
    level_up_available: Boolean(row.level_up_available),
    last_level_up_available_at: row.last_level_up_available_at,
    constitution: Number(row.constitution),
    max_hit_points: row.max_hit_points !== null ? Number(row.max_hit_points) : null,
    current_hit_points: row.current_hit_points !== null ? Number(row.current_hit_points) : null,
    proficiency_bonus: row.proficiency_bonus !== null ? Number(row.proficiency_bonus) : null,
    class_id: row.class_id !== null ? Number(row.class_id) : null,
    subclass_id: row.subclass_id !== null ? Number(row.subclass_id) : null,
    is_active: Boolean(row.is_active),
    account_is_active: row.account_is_active === undefined ? undefined : Boolean(row.account_is_active),
    world_advancement_mode: row.world_advancement_mode ?? 'event_weighted_xp',
    world_advancement_config_json: row.world_advancement_config_json ?? getDefaultAdvancementConfig(),
    updated_at: row.updated_at,
  };
}

function mapCampaignContextRow(row) {
  if (!row) {
    return null;
  }

  return {
    membership_id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    is_active: Boolean(row.is_active),
    membership_status: row.membership_status,
    is_active_context: Boolean(row.is_active_context),
    is_default_solo_campaign: Boolean(row.is_default_solo_campaign),
    current_scene_id: row.current_scene_id !== null ? Number(row.current_scene_id) : null,
    world_id: Number(row.world_id),
    campaign_slug: row.campaign_slug,
    campaign_name: row.campaign_name,
    campaign_type: row.campaign_type,
    campaign_status: row.campaign_status,
    campaign_is_active: Boolean(row.campaign_is_active),
    campaign_advancement_mode: row.campaign_advancement_mode,
    campaign_advancement_config_json:
      row.campaign_advancement_config_json ?? getDefaultAdvancementConfig(),
  };
}

function mapCampaignAdvancementConfigRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    slug: row.slug,
    name: row.name,
    campaign_type: row.campaign_type,
    status: row.status,
    is_active: Boolean(row.is_active),
    advancement_mode: row.advancement_mode ?? 'event_weighted_xp',
    advancement_config_json: row.advancement_config_json ?? getDefaultAdvancementConfig(),
    world_advancement_mode: row.world_advancement_mode ?? 'event_weighted_xp',
    world_advancement_config_json:
      row.world_advancement_config_json ?? getDefaultAdvancementConfig(),
  };
}

function mapAdvancementEventRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    world_id: row.world_id !== null ? Number(row.world_id) : null,
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    level_up_session_id: row.level_up_session_id !== null ? Number(row.level_up_session_id) : null,
    event_kind: row.event_kind,
    advancement_mode: row.advancement_mode,
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    dedupe_key: row.dedupe_key,
    amount_xp: Number(row.amount_xp ?? 0),
    granted_level_count: Number(row.granted_level_count ?? 0),
    target_level: row.target_level !== null ? Number(row.target_level) : null,
    reason: row.reason,
    metadata_json: row.metadata_json ?? {},
    created_at: row.created_at,
  };
}

function mapLevelUpSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    world_id: Number(row.world_id),
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    target_character_class_id:
      row.target_character_class_id !== null ? Number(row.target_character_class_id) : null,
    advancement_mode: row.advancement_mode,
    session_status: row.session_status,
    from_level: Number(row.from_level),
    target_level: Number(row.target_level),
    current_step: row.current_step,
    required_steps_json: row.required_steps_json ?? [],
    selected_choices_json: row.selected_choices_json ?? {},
    validation_state_json: row.validation_state_json ?? {},
    preview_json: row.preview_json ?? {},
    hp_choice_method: row.hp_choice_method,
    hp_roll_result: row.hp_roll_result !== null ? Number(row.hp_roll_result) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

function mapClassEntryRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    class_id: Number(row.class_id),
    subclass_id: row.subclass_id !== null ? Number(row.subclass_id) : null,
    class_level: Number(row.class_level),
    is_primary: Boolean(row.is_primary),
    class: {
      id: Number(row.class_id),
      name: row.class_name,
      slug: row.class_slug,
      hit_die: Number(row.hit_die),
    },
    subclass:
      row.subclass_id !== null
        ? {
            id: Number(row.subclass_id),
            name: row.subclass_name,
            slug: row.subclass_slug,
          }
        : null,
  };
}

function mapClassSpellRow(row) {
  return {
    id: Number(row.id),
    class_id: Number(row.class_id),
    spell: {
      id: Number(row.spell_id),
      name: row.spell_name,
      slug: row.spell_slug,
      level: Number(row.spell_level),
      school: row.spell_school,
      casting_time: row.casting_time,
      range_text: row.range_text,
      duration_text: row.duration_text,
      components_text: row.components_text,
      ritual: Boolean(row.ritual),
      concentration: Boolean(row.concentration),
      source: row.spell_source,
      is_active: Boolean(row.is_active),
    },
    notes: row.notes,
  };
}

function mapCharacterSpellRow(row, sourceType) {
  return {
    source_type: sourceType,
    id: Number(row.id ?? row.spell_id),
    spell_source: row.spell_source ?? sourceType,
    source_class_id:
      row.source_class_id !== null && row.source_class_id !== undefined
        ? Number(row.source_class_id)
        : null,
    is_known: row.is_known === undefined ? true : Boolean(row.is_known),
    is_prepared: row.is_prepared === undefined ? false : Boolean(row.is_prepared),
    is_always_prepared:
      row.is_always_prepared === undefined ? false : Boolean(row.is_always_prepared),
    grant_type: row.grant_type ?? null,
    spell: {
      id: Number(row.spell_id),
      name: row.spell_name,
      slug: row.spell_slug,
      level: Number(row.spell_level),
      school: row.spell_school,
      ritual: Boolean(row.ritual),
      concentration: Boolean(row.concentration),
      source: row.spell_book_source ?? row.spell_source,
    },
  };
}

function mapFeatureRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    feature_type: row.feature_type,
    description: row.description,
    source: row.source,
    granted_at_level: Number(row.granted_at_level),
    display_order: Number(row.display_order ?? 0),
  };
}

function computeMedian(numbers) {
  const values = [...numbers]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return null;
  }

  const middle = Math.floor(values.length / 2);

  if (values.length % 2 === 1) {
    return values[middle];
  }

  return (values[middle - 1] + values[middle]) / 2;
}

function validateCharacterCanAdvance(character) {
  if (!character) {
    throw createHttpError('Character not found', 404);
  }

  if (!character.account_is_active) {
    throw createHttpError('Character account is inactive', 400);
  }

  if (!character.is_active) {
    throw createHttpError('Inactive characters cannot advance right now', 409);
  }
}

function validateAdvancementModeAndConfig(mode, config) {
  const normalizedMode = normalizeAdvancementMode(mode);

  if (!normalizedMode) {
    throw createHttpError(
      'advancement_mode must be milestone, event_weighted_xp, or gm_controlled',
      400
    );
  }

  const normalizedConfig = normalizeAdvancementConfig(config);

  for (const [key, value] of Object.entries(normalizedConfig.xp_weights)) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0) {
      throw createHttpError(`xp_weights.${key} must be a non-negative integer`, 400);
    }
  }

  if (Number(normalizedConfig.catch_up_multiplier_per_level_gap) < 0) {
    throw createHttpError('catch_up_multiplier_per_level_gap must be >= 0', 400);
  }

  if (Number(normalizedConfig.catch_up_multiplier_cap) < 1) {
    throw createHttpError('catch_up_multiplier_cap must be >= 1', 400);
  }

  return {
    advancement_mode: normalizedMode,
    advancement_config: normalizedConfig,
  };
}

async function getCharacterAdvancementRow(characterId, executor = { query }, { forUpdate = false } = {}) {
  const statement = forUpdate
    ? selectCharacterAdvancementByIdForUpdateQuery
    : selectCharacterAdvancementByIdQuery;
  const result = await executor.query(statement, [characterId]);
  return mapCharacterAdvancementRow(result.rows[0] || null);
}

async function getActiveCampaignContext(characterId, executor = { query }) {
  const result = await executor.query(selectActiveCampaignContextByCharacterQuery, [characterId]);
  return mapCampaignContextRow(result.rows[0] || null);
}

async function getEffectiveAdvancementContext(character, inputCampaignId, executor) {
  const explicitCampaignId = normalizePositiveInteger(inputCampaignId, 'campaign_id', {
    optional: true,
  });

  if (explicitCampaignId !== null) {
    const campaignResult = await executor.query(selectCampaignAdvancementConfigQuery, [
      explicitCampaignId,
    ]);
    const campaign = mapCampaignAdvancementConfigRow(campaignResult.rows[0] || null);

    if (!campaign) {
      throw createHttpError('Campaign not found', 404);
    }

    if (campaign.world_id !== character.world_id) {
      throw createHttpError('campaign_id must belong to the same world as the character', 400);
    }

    return {
      campaign_id: campaign.id,
      campaign_slug: campaign.slug,
      campaign_name: campaign.name,
      mode: normalizeAdvancementMode(
        campaign.advancement_mode ?? campaign.world_advancement_mode,
        character.world_advancement_mode
      ),
      config: normalizeAdvancementConfig(
        campaign.advancement_config_json ?? campaign.world_advancement_config_json
      ),
    };
  }

  const activeCampaign = await getActiveCampaignContext(character.id, executor);

  if (activeCampaign) {
    return {
      campaign_id: activeCampaign.campaign_id,
      campaign_slug: activeCampaign.campaign_slug,
      campaign_name: activeCampaign.campaign_name,
      mode: normalizeAdvancementMode(
        activeCampaign.campaign_advancement_mode ?? character.world_advancement_mode,
        character.world_advancement_mode
      ),
      config: normalizeAdvancementConfig(
        activeCampaign.campaign_advancement_config_json ?? character.world_advancement_config_json
      ),
    };
  }

  return {
    campaign_id: null,
    campaign_slug: null,
    campaign_name: null,
    mode: normalizeAdvancementMode(character.world_advancement_mode, 'event_weighted_xp'),
    config: normalizeAdvancementConfig(character.world_advancement_config_json),
  };
}

async function evaluateSafeMoment(campaignId, characterId, executor = { query }) {
  if (!campaignId) {
    return {
      can_start_now: true,
      can_finalize_now: true,
      reason: null,
      blockers: [],
    };
  }

  const openCombat = await executor.query(selectActiveCombatByCampaignAndCharacterQuery, [
    campaignId,
    characterId,
  ]);
  const openDialogue = await executor.query(selectActiveDialogueSessionByCampaignAndCharacterQuery, [
    campaignId,
    characterId,
  ]);
  const openEvent = await executor.query(selectActiveEventByCampaignAndCharacterQuery, [
    campaignId,
    characterId,
  ]);
  const openActionWindow = await executor.query(selectOpenActionWindowByCampaignAndCharacterQuery, [
    campaignId,
    characterId,
  ]);
  const openProgressionWindows = await executor.query(selectOpenProgressionWindowsForCharacterQuery, [
    campaignId,
    characterId,
  ]);

  const blockers = [];

  if (openCombat.rowCount > 0) {
    blockers.push('combat');
  }

  if (openDialogue.rowCount > 0) {
    blockers.push('dialogue');
  }

  if (openEvent.rowCount > 0) {
    blockers.push('event');
  }

  const blockingActionWindow = openActionWindow.rows.some((row) =>
    ['closing', 'resolving'].includes(row.status)
  );

  if (blockingActionWindow) {
    blockers.push('action_window');
  }

  if (openProgressionWindows.rowCount > 0) {
    blockers.push('progression_window');
  }

  return {
    can_start_now: blockers.length === 0,
    can_finalize_now: blockers.length === 0,
    reason:
      blockers.length === 0
        ? null
        : `level-up is deferred until ${blockers[0].replace(/_/g, ' ')} resolves`,
    blockers,
  };
}

async function listCharacterClassEntries(characterId, executor = { query }) {
  const result = await executor.query(selectCharacterClassesQuery, [characterId]);
  return result.rows.map(mapClassEntryRow);
}

async function resolveTargetClassEntry(characterId, targetCharacterClassId, executor) {
  const normalizedTargetId = normalizePositiveInteger(
    targetCharacterClassId,
    'target_character_class_id',
    { optional: true }
  );

  if (normalizedTargetId !== null) {
    const result = await executor.query(selectCharacterClassByIdForUpdateQuery, [normalizedTargetId]);
    const row = result.rows[0] || null;

    if (!row || Number(row.character_id) !== Number(characterId)) {
      throw createHttpError('target_character_class_id was not found on this character', 404);
    }

    return mapClassEntryRow(row);
  }

  const result = await executor.query(selectPrimaryCharacterClassForUpdateQuery, [characterId]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Character needs a class entry before leveling', 409);
  }

  return mapClassEntryRow(row);
}

async function listCharacterSpellState(characterId, executor = { query }) {
  const manualResult = await executor.query(selectCharacterManualSpellsQuery, [characterId]);
  const derivedResult = await executor.query(selectDerivedSpellGrantsQuery, [characterId]);

  const manual = manualResult.rows.map((row) => mapCharacterSpellRow(row, 'manual'));
  const derived = derivedResult.rows.map((row) => mapCharacterSpellRow(row, 'derived'));
  const effectiveMap = new Map();

  for (const entry of manual) {
    effectiveMap.set(entry.spell.id, entry);
  }

  for (const entry of derived) {
    if (!effectiveMap.has(entry.spell.id)) {
      effectiveMap.set(entry.spell.id, entry);
    }
  }

  return {
    manual,
    derived,
    effective: [...effectiveMap.values()],
  };
}

async function listClassSpellOptions(classId, executor = { query }) {
  const result = await executor.query(selectClassSpellsByClassIdQuery, [classId]);
  return result.rows.map(mapClassSpellRow);
}

function getKnownSpellStateForClass(spellState, classId) {
  const manualForClass = spellState.manual.filter((entry) => entry.source_class_id === classId);

  return {
    manual_for_class: manualForClass,
    cantrips_known: manualForClass.filter((entry) => entry.spell.level === 0).length,
    leveled_known: manualForClass.filter((entry) => entry.spell.level > 0).length,
    known_spell_ids: new Set(manualForClass.map((entry) => entry.spell.id)),
    effective_spell_ids: new Set(spellState.effective.map((entry) => entry.spell.id)),
  };
}

function resolveSelectedSpellIds(rawSelection, validSpellOptions, errors, pathLabel) {
  const selection = rawSelection ?? [];

  if (!Array.isArray(selection)) {
    errors.push(`${pathLabel} must be an array`);
    return [];
  }

  const byId = new Map(validSpellOptions.map((entry) => [entry.spell.id, entry]));
  const bySlug = new Map(validSpellOptions.map((entry) => [entry.spell.slug, entry]));
  const selected = [];
  const seen = new Set();

  for (const rawEntry of selection) {
    let spell = null;

    if (Number.isInteger(Number(rawEntry))) {
      spell = byId.get(Number(rawEntry)) ?? null;
    } else {
      const normalized = normalizeOptionalText(rawEntry);
      spell = normalized ? bySlug.get(normalized) ?? null : null;
    }

    if (!spell) {
      errors.push(`${pathLabel} contains an invalid spell selection`);
      continue;
    }

    if (seen.has(spell.spell.id)) {
      errors.push(`${pathLabel} contains duplicate spell selections`);
      continue;
    }

    seen.add(spell.spell.id);
    selected.push(spell.spell.id);
  }

  return selected;
}

async function computeSpellSelectionPlan({
  character,
  classEntry,
  targetClassLevel,
  selectedChoices,
  executor,
}) {
  const classProfile = getClassSpellProfile(classEntry.class.slug);

  if (!classProfile) {
    return {
      class_profile: null,
      required: false,
      required_cantrip_count: 0,
      required_spell_count: 0,
      full_valid_cantrips: [],
      full_valid_spells: [],
      sms_curated_cantrips: [],
      sms_curated_spells: [],
      selected_cantrip_ids: [],
      selected_spell_ids: [],
      errors: [],
    };
  }

  const classSpellOptions = await listClassSpellOptions(classEntry.class.id, executor);
  const spellState = await listCharacterSpellState(character.id, executor);
  const knownState = getKnownSpellStateForClass(spellState, classEntry.class.id);
  const maxSpellLevel = getMaxSpellLevelForClassEntry({
    ...classEntry,
    class_level: targetClassLevel,
  });
  const currentCantripLimit =
    getKnownSpellLimitForClass(classEntry.class.slug, classEntry.class_level, 0) ?? 0;
  const targetCantripLimit =
    getKnownSpellLimitForClass(classEntry.class.slug, targetClassLevel, 0) ?? currentCantripLimit;
  const currentSpellLimit =
    getKnownSpellLimitForClass(classEntry.class.slug, classEntry.class_level, 1) ?? 0;
  const targetSpellLimit =
    getKnownSpellLimitForClass(classEntry.class.slug, targetClassLevel, 1) ?? currentSpellLimit;
  const requiredCantripCount = Math.max(0, targetCantripLimit - knownState.cantrips_known);
  const requiredSpellCount = Math.max(0, targetSpellLimit - knownState.leveled_known);
  const errors = [];
  const fullValidCantrips = classSpellOptions.filter(
    (entry) =>
      entry.spell.level === 0 &&
      entry.spell.is_active &&
      !knownState.effective_spell_ids.has(entry.spell.id)
  );
  const fullValidSpells = classSpellOptions.filter(
    (entry) =>
      entry.spell.level > 0 &&
      entry.spell.level <= maxSpellLevel &&
      entry.spell.is_active &&
      !knownState.effective_spell_ids.has(entry.spell.id)
  );
  const selectedCantripIds = resolveSelectedSpellIds(
    selectedChoices?.cantrip_spell_ids ?? [],
    fullValidCantrips,
    errors,
    'cantrip_spell_ids'
  );
  const selectedSpellIds = resolveSelectedSpellIds(
    selectedChoices?.known_spell_ids ?? [],
    fullValidSpells,
    errors,
    'known_spell_ids'
  );

  if (requiredCantripCount > fullValidCantrips.length) {
    errors.push('not enough valid cantrips are available to satisfy this level-up');
  }

  if (requiredSpellCount > fullValidSpells.length) {
    errors.push('not enough valid spells are available to satisfy this level-up');
  }

  return {
    class_profile: classProfile,
    required: requiredCantripCount > 0 || requiredSpellCount > 0,
    required_cantrip_count: requiredCantripCount,
    required_spell_count: requiredSpellCount,
    full_valid_cantrips: fullValidCantrips,
    full_valid_spells: fullValidSpells,
    sms_curated_cantrips: fullValidCantrips.slice(0, 6),
    sms_curated_spells: fullValidSpells.slice(0, 6),
    selected_cantrip_ids: selectedCantripIds,
    selected_spell_ids: selectedSpellIds,
    errors,
  };
}

async function computeFeatureGains(classEntry, targetClassLevel, selectedSubclassId, executor) {
  const classFeatureResult = await executor.query(selectClassFeaturesAtLevelQuery, [
    classEntry.class.id,
    targetClassLevel,
  ]);
  const subclassFeatureResult = selectedSubclassId
    ? await executor.query(selectSubclassFeaturesAtLevelQuery, [
        selectedSubclassId,
        targetClassLevel,
      ])
    : { rows: [] };

  return {
    class_features: classFeatureResult.rows.map(mapFeatureRow),
    subclass_features: subclassFeatureResult.rows.map(mapFeatureRow),
  };
}

async function computeLevelUpPlan({
  character,
  campaignContext,
  classEntry,
  session,
  executor,
}) {
  const selectedChoices = session.selected_choices_json ?? {};
  const targetClassLevel = classEntry.class_level + 1;
  const availableSubclassResult = await executor.query(selectAvailableSubclassesForClassQuery, [
    classEntry.class.id,
  ]);
  const availableSubclasses = availableSubclassResult.rows
    .map((row) => ({
      id: Number(row.id),
      class_id: Number(row.class_id),
      name: row.name,
      slug: row.slug,
      description: row.description,
      unlock_level: Number(row.unlock_level ?? 1),
    }))
    .filter((row) => row.unlock_level <= targetClassLevel);
  const requiresSubclassChoice =
    classEntry.subclass_id === null && availableSubclasses.length > 0;
  const normalizedChosenSubclassId = normalizePositiveInteger(
    selectedChoices?.subclass_id,
    'subclass_id',
    { optional: true }
  );
  const chosenSubclass =
    normalizedChosenSubclassId !== null
      ? availableSubclasses.find((entry) => entry.id === normalizedChosenSubclassId) ?? null
      : null;
  const hpChoice = selectedChoices?.hp ?? {};
  const hpMethod = normalizeOptionalText(hpChoice.method);
  const hpRollResult =
    hpChoice.roll_result !== undefined && hpChoice.roll_result !== null
      ? normalizePositiveInteger(hpChoice.roll_result, 'hp.roll_result')
      : null;
  const hpRollApplied = hpMethod === 'roll' && hpRollResult !== null;
  const hpGain =
    hpMethod === 'fixed'
      ? calculateFixedHitPointGain(classEntry.class.hit_die, character.constitution)
      : hpRollApplied
        ? Math.max(1, hpRollResult + calculateAbilityModifier(character.constitution))
        : null;
  const spellPlan = await computeSpellSelectionPlan({
    character,
    classEntry,
    targetClassLevel,
    selectedChoices: selectedChoices?.spells ?? {},
    executor,
  });
  const featureGains = await computeFeatureGains(
    classEntry,
    targetClassLevel,
    chosenSubclass?.id ?? classEntry.subclass_id,
    executor
  );
  const errors = [...spellPlan.errors];
  const steps = [];

  if (requiresSubclassChoice) {
    const isComplete = chosenSubclass !== null;
    steps.push({
      key: 'subclass_choice',
      label: `Choose ${classEntry.class.name} subclass`,
      status: isComplete ? 'completed' : 'pending',
      required: true,
      options: availableSubclasses,
    });

    if (!isComplete) {
      errors.push('subclass choice is required before finalizing this level-up');
    }
  }

  steps.push({
    key: 'hp_choice',
    label: 'Choose hit point increase',
    status: hpGain !== null ? 'completed' : 'pending',
    required: true,
    method: hpMethod,
    fixed_gain: calculateFixedHitPointGain(classEntry.class.hit_die, character.constitution),
    roll_result: hpRollResult,
    resolved_gain: hpGain,
  });

  if (!['fixed', 'roll'].includes(hpMethod ?? '')) {
    errors.push('hit point choice is required before finalizing this level-up');
  }

  if (hpMethod === 'roll' && (hpRollResult === null || hpRollResult > classEntry.class.hit_die)) {
    errors.push('hp roll result is invalid for the chosen class hit die');
  }

  if (spellPlan.required) {
    const cantripComplete =
      spellPlan.required_cantrip_count === 0 ||
      spellPlan.selected_cantrip_ids.length === spellPlan.required_cantrip_count;
    const spellComplete =
      spellPlan.required_spell_count === 0 ||
      spellPlan.selected_spell_ids.length === spellPlan.required_spell_count;

    steps.push({
      key: 'spell_selection',
      label: 'Choose level-up spells',
      status: cantripComplete && spellComplete ? 'completed' : 'pending',
      required: true,
      required_cantrip_count: spellPlan.required_cantrip_count,
      required_spell_count: spellPlan.required_spell_count,
      selected_cantrip_ids: spellPlan.selected_cantrip_ids,
      selected_spell_ids: spellPlan.selected_spell_ids,
      sms_curated_cantrips: spellPlan.sms_curated_cantrips.map((entry) => entry.spell),
      sms_curated_spells: spellPlan.sms_curated_spells.map((entry) => entry.spell),
      full_valid_cantrips: spellPlan.full_valid_cantrips.map((entry) => entry.spell),
      full_valid_spells: spellPlan.full_valid_spells.map((entry) => entry.spell),
    });

    if (!cantripComplete) {
      errors.push(
        `select ${spellPlan.required_cantrip_count} cantrip(s) before finalizing this level-up`
      );
    }

    if (!spellComplete) {
      errors.push(
        `select ${spellPlan.required_spell_count} leveled spell(s) before finalizing this level-up`
      );
    }
  }

  const currentStep = steps.find((entry) => entry.status !== 'completed')?.key ?? 'finalize';
  const sessionStatus = errors.length === 0 ? 'ready_to_finalize' : 'awaiting_choice';

  return {
    session_status: sessionStatus,
    current_step: currentStep,
    required_steps: steps,
    validation_state: {
      is_valid: errors.length === 0,
      errors,
    },
    preview: {
      campaign_id: campaignContext?.campaign_id ?? null,
      from_level: session.from_level,
      target_level: session.target_level,
      target_character_class_id: classEntry.id,
      target_class: classEntry.class,
      target_class_level: targetClassLevel,
      chosen_subclass: chosenSubclass ?? classEntry.subclass,
      feature_gains: featureGains,
      hp: {
        method: hpMethod,
        hit_die: classEntry.class.hit_die,
        constitution_modifier: calculateAbilityModifier(character.constitution),
        fixed_gain: calculateFixedHitPointGain(classEntry.class.hit_die, character.constitution),
        roll_result: hpRollResult,
        total_gain: hpGain,
      },
      spell_selection: {
        required: spellPlan.required,
        required_cantrip_count: spellPlan.required_cantrip_count,
        required_spell_count: spellPlan.required_spell_count,
        selected_cantrip_ids: spellPlan.selected_cantrip_ids,
        selected_spell_ids: spellPlan.selected_spell_ids,
        sms_curated_cantrips: spellPlan.sms_curated_cantrips.map((entry) => entry.spell),
        sms_curated_spells: spellPlan.sms_curated_spells.map((entry) => entry.spell),
        full_valid_cantrips: spellPlan.full_valid_cantrips.map((entry) => entry.spell),
        full_valid_spells: spellPlan.full_valid_spells.map((entry) => entry.spell),
      },
      resulting_summary: {
        level: session.target_level,
        pending_level_count_after_finalize: Math.max(0, character.pending_level_count - 1),
        proficiency_bonus: calculateProficiencyBonus(session.target_level),
        max_hit_points:
          character.max_hit_points !== null && hpGain !== null
            ? Number(character.max_hit_points) + hpGain
            : character.max_hit_points,
        current_hit_points:
          character.current_hit_points !== null && hpGain !== null
            ? Number(character.current_hit_points) + hpGain
            : character.current_hit_points,
      },
    },
  };
}

async function refreshSessionState(session, character, campaignContext, classEntry, executor) {
  const plan = await computeLevelUpPlan({
    character,
    campaignContext,
    classEntry,
    session,
    executor,
  });

  const result = await executor.query(updateLevelUpSessionStateQuery, [
    session.id,
    plan.session_status,
    plan.current_step,
    JSON.stringify(plan.required_steps),
    JSON.stringify(session.selected_choices_json ?? {}),
    JSON.stringify(plan.validation_state),
    JSON.stringify(plan.preview),
    session.hp_choice_method,
    session.hp_roll_result,
  ]);

  return mapLevelUpSessionRow(result.rows[0]);
}

function buildThresholdSummary(character, mode) {
  const thresholdTable = getDefaultXpThresholds();
  const highestEligibleLevel =
    mode === 'milestone' ? character.level : getHighestEligibleLevel(character.experience_points);
  const nextThresholdLevel = Math.min(20, character.level + 1);
  const nextThresholdXp =
    mode === 'milestone' ? null : getXpThresholdForLevel(nextThresholdLevel, thresholdTable);

  return {
    threshold_table: thresholdTable,
    highest_eligible_level: highestEligibleLevel,
    current_level_threshold_xp:
      mode === 'milestone' ? null : getXpThresholdForLevel(character.level, thresholdTable),
    next_level_threshold_xp: nextThresholdXp,
    xp_to_next_level:
      mode === 'milestone' || nextThresholdXp === null
        ? null
        : Math.max(0, nextThresholdXp - character.experience_points),
  };
}

async function getLevelSyncData(campaignId, characterId, config, executor = { query }) {
  if (!campaignId) {
    return null;
  }

  const result = await executor.query(selectCampaignActiveCharacterLevelsQuery, [campaignId]);
  const rows = result.rows.map((row) => ({
    character_id: Number(row.character_id),
    name: row.name,
    level: Number(row.level),
    pending_level_count: Number(row.pending_level_count ?? 0),
    level_up_available: Boolean(row.level_up_available),
  }));

  if (rows.length === 0) {
    return null;
  }

  const levels = rows.map((entry) => entry.level);
  const highest = Math.max(...levels);
  const lowest = Math.min(...levels);
  const average = levels.reduce((sum, entry) => sum + entry, 0) / levels.length;
  const median = computeMedian(levels);
  const currentCharacter = rows.find((entry) => entry.character_id === Number(characterId)) ?? null;
  const levelGap =
    currentCharacter && median !== null ? Math.max(0, Math.ceil(median - currentCharacter.level)) : 0;

  return {
    campaign_id: campaignId,
    soft_sync_enabled: Boolean(config.soft_sync_enabled),
    catch_up_enabled: Boolean(config.catch_up_enabled),
    highest_level: highest,
    lowest_level: lowest,
    average_level: Number(average.toFixed(2)),
    median_level: median,
    level_spread: highest - lowest,
    current_character: currentCharacter,
    lagging_character_ids:
      median === null
        ? []
        : rows.filter((entry) => entry.level < median).map((entry) => entry.character_id),
    catch_up_multiplier:
      currentCharacter && config.catch_up_enabled
        ? calculateCatchUpMultiplier(levelGap, config)
        : 1,
    members: rows,
  };
}

async function insertAdvancementEvent(event, executor) {
  if (!advancementEventKinds.has(event.event_kind)) {
    throw createHttpError(`Unsupported advancement event kind: ${event.event_kind}`, 400);
  }

  const result = await executor.query(insertAdvancementEventQuery, [
    event.character_id,
    event.world_id ?? null,
    event.campaign_id ?? null,
    event.actor_account_id ?? null,
    event.level_up_session_id ?? null,
    event.event_kind,
    event.advancement_mode,
    event.source_type ?? null,
    event.source_entity_id ?? null,
    event.dedupe_key ?? null,
    event.amount_xp ?? 0,
    event.granted_level_count ?? 0,
    event.target_level ?? null,
    event.reason ?? null,
    JSON.stringify(event.metadata_json ?? {}),
  ]);

  return mapAdvancementEventRow(result.rows[0]);
}

async function createGameplayHistoryEntry(
  characterId,
  actorAccountId,
  sourceType,
  sourceEntityId,
  actionKey,
  summary,
  resultJson,
  xpDelta,
  executor
) {
  return recordGameplayHistory(
    {
      character_id: characterId,
      actor_account_id: actorAccountId ?? null,
      source_type: normalizeGameplayHistorySourceType(sourceType),
      source_entity_id: sourceEntityId ?? null,
      action_key: actionKey,
      summary,
      input_json: {},
      result_json: resultJson,
      xp_delta: xpDelta ?? 0,
    },
    executor
  );
}

const gameplayHistorySourceTypes = new Set([
  'command',
  'event',
  'progression',
  'system',
  'narrative',
  'combat',
  'adventure',
  'encounter',
]);

function normalizeGameplayHistorySourceType(sourceType) {
  const normalized = normalizeOptionalText(sourceType);
  return gameplayHistorySourceTypes.has(normalized) ? normalized : 'progression';
}

function determineBaseXpAmount(inputAmount, sourceType, config) {
  const normalizedAmount = normalizeNonNegativeInteger(inputAmount, 'amount', {
    optional: true,
  });

  if (normalizedAmount !== null) {
    return normalizedAmount;
  }

  const weight = Number(config.xp_weights?.[sourceType] ?? 0);

  if (!Number.isInteger(weight) || weight < 0) {
    throw createHttpError(
      `No XP amount or valid xp_weight exists for source_type "${sourceType}"`,
      400
    );
  }

  return weight;
}

async function grantXpInternal(characterId, input, executor) {
  const character = await getCharacterAdvancementRow(characterId, executor, { forUpdate: true });
  validateCharacterCanAdvance(character);

  const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, executor);
  const sourceType = normalizeOptionalText(input.source_type) ?? 'system';

  if (!supportedGrantSources.has(sourceType)) {
    throw createHttpError('source_type is not supported for XP grants', 400);
  }

  const reason = normalizeOptionalText(input.reason) ?? 'Experience granted';
  const dedupeKey = normalizeOptionalText(input.dedupe_key);

  if (dedupeKey) {
    const duplicateResult = await executor.query(selectAdvancementEventByCharacterAndDedupeKeyQuery, [
      character.id,
      dedupeKey,
    ]);
    const duplicate = duplicateResult.rows[0] ? mapAdvancementEventRow(duplicateResult.rows[0]) : null;

    if (duplicate) {
      return {
        character_id: character.id,
        campaign_id: context.campaign_id,
        advancement_mode: context.mode,
        was_duplicate: true,
        duplicate_event: duplicate,
        before_experience_points: character.experience_points,
        after_experience_points: character.experience_points,
        amount_granted: duplicate.amount_xp,
        pending_level_count: character.pending_level_count,
        level_up_available: character.level_up_available,
      };
    }
  }

  const baseAmount = determineBaseXpAmount(input.amount, sourceType, context.config);
  let catchUpMetadata = null;
  let finalAmount = baseAmount;

  if (
    context.mode === 'event_weighted_xp' &&
    context.campaign_id &&
    context.config.soft_sync_enabled &&
    context.config.catch_up_enabled &&
    sourceType !== 'gm'
  ) {
    const levelSync = await getLevelSyncData(context.campaign_id, character.id, context.config, executor);
    const multiplier = Number(levelSync?.catch_up_multiplier ?? 1);

    if (multiplier > 1) {
      finalAmount = Math.max(baseAmount, Math.round(baseAmount * multiplier));
      catchUpMetadata = {
        base_amount: baseAmount,
        multiplier,
        adjusted_amount: finalAmount,
        level_spread: levelSync?.level_spread ?? null,
        median_level: levelSync?.median_level ?? null,
      };
    }
  }

  const nextExperiencePoints = character.experience_points + finalAmount;
  const additionalPendingFromXp =
    context.mode === 'milestone'
      ? 0
      : computePendingLevelsFromXp(
          nextExperiencePoints,
          character.level,
          character.pending_level_count,
          getDefaultXpThresholds()
        );
  const nextPendingLevelCount = character.pending_level_count + additionalPendingFromXp;
  const levelUpAvailable = nextPendingLevelCount > 0;
  const lastAvailableAt =
    levelUpAvailable && !character.level_up_available
      ? new Date().toISOString()
      : character.last_level_up_available_at;

  const updateResult = await executor.query(updateCharacterPendingAdvancementQuery, [
    character.id,
    nextExperiencePoints,
    nextPendingLevelCount,
    levelUpAvailable,
    lastAvailableAt,
  ]);
  const updatedCharacter = mapCharacterAdvancementRow({
    ...character,
    ...updateResult.rows[0],
    account_is_active: character.account_is_active,
    world_advancement_mode: character.world_advancement_mode,
    world_advancement_config_json: character.world_advancement_config_json,
  });

  const event = await insertAdvancementEvent(
    {
      character_id: character.id,
      world_id: character.world_id,
      campaign_id: context.campaign_id,
      actor_account_id: input.actor_account_id ?? null,
      event_kind: 'xp_grant',
      advancement_mode: context.mode,
      source_type: sourceType,
      source_entity_id: input.source_entity_id ?? null,
      dedupe_key: dedupeKey,
      amount_xp: finalAmount,
      granted_level_count: additionalPendingFromXp,
      target_level:
        nextPendingLevelCount > 0 ? updatedCharacter.level + nextPendingLevelCount : null,
      reason,
      metadata_json: {
        ...(input.metadata_json && typeof input.metadata_json === 'object'
          ? input.metadata_json
          : {}),
        base_amount: baseAmount,
        catch_up: catchUpMetadata,
      },
    },
    executor
  );

  if (input.record_history !== false) {
    await createGameplayHistoryEntry(
      character.id,
      input.actor_account_id ?? null,
      sourceType,
      input.source_entity_id ?? null,
      input.action_key ?? 'grant_xp',
      input.summary ??
        `${updatedCharacter.name} gains ${finalAmount} XP${reason ? `: ${reason}` : '.'}`,
      {
        ...(input.metadata_json && typeof input.metadata_json === 'object'
          ? input.metadata_json
          : {}),
        advancement_event_id: event.id,
        advancement_mode: context.mode,
        before_experience_points: character.experience_points,
        after_experience_points: updatedCharacter.experience_points,
        pending_level_count: updatedCharacter.pending_level_count,
        level_up_available: updatedCharacter.level_up_available,
      },
      finalAmount,
      executor
    );
  }

  return {
    character_id: character.id,
    campaign_id: context.campaign_id,
    advancement_mode: context.mode,
    before_experience_points: character.experience_points,
    after_experience_points: updatedCharacter.experience_points,
    amount_granted: finalAmount,
    base_amount: baseAmount,
    catch_up: catchUpMetadata,
    level: updatedCharacter.level,
    pending_level_count: updatedCharacter.pending_level_count,
    level_up_available: updatedCharacter.level_up_available,
    last_level_up_available_at: updatedCharacter.last_level_up_available_at,
    advancement_event: event,
  };
}

async function grantMilestoneInternal(characterId, input, executor) {
  const character = await getCharacterAdvancementRow(characterId, executor, { forUpdate: true });
  validateCharacterCanAdvance(character);
  const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, executor);
  const reason = normalizeOptionalText(input.reason) ?? 'Milestone advancement granted';
  const dedupeKey = normalizeOptionalText(input.dedupe_key);

  if (dedupeKey) {
    const duplicateResult = await executor.query(selectAdvancementEventByCharacterAndDedupeKeyQuery, [
      character.id,
      dedupeKey,
    ]);
    const duplicate = duplicateResult.rows[0] ? mapAdvancementEventRow(duplicateResult.rows[0]) : null;

    if (duplicate) {
      return {
        character_id: character.id,
        campaign_id: context.campaign_id,
        advancement_mode: context.mode,
        was_duplicate: true,
        duplicate_event: duplicate,
        pending_level_count: character.pending_level_count,
        level_up_available: character.level_up_available,
      };
    }
  }

  const targetLevel = normalizePositiveInteger(input.target_level, 'target_level', {
    optional: true,
  });
  const levelCount =
    normalizePositiveInteger(input.level_count, 'level_count', { optional: true }) ??
    (targetLevel !== null
      ? Math.max(0, targetLevel - (character.level + character.pending_level_count))
      : 1);

  if (levelCount < 1) {
    throw createHttpError('milestone grant must award at least one pending level', 400);
  }

  const nextPendingLevelCount = character.pending_level_count + levelCount;
  const lastAvailableAt = character.level_up_available
    ? character.last_level_up_available_at
    : new Date().toISOString();

  const updateResult = await executor.query(updateCharacterPendingAdvancementQuery, [
    character.id,
    character.experience_points,
    nextPendingLevelCount,
    true,
    lastAvailableAt,
  ]);
  const updatedCharacter = mapCharacterAdvancementRow({
    ...character,
    ...updateResult.rows[0],
    account_is_active: character.account_is_active,
    world_advancement_mode: character.world_advancement_mode,
    world_advancement_config_json: character.world_advancement_config_json,
  });

  const event = await insertAdvancementEvent(
    {
      character_id: character.id,
      world_id: character.world_id,
      campaign_id: context.campaign_id,
      actor_account_id: input.actor_account_id ?? null,
      event_kind: 'level_grant',
      advancement_mode: context.mode,
      source_type: normalizeOptionalText(input.source_type) ?? 'milestone',
      source_entity_id: input.source_entity_id ?? null,
      dedupe_key: dedupeKey,
      amount_xp: 0,
      granted_level_count: levelCount,
      target_level: updatedCharacter.level + updatedCharacter.pending_level_count,
      reason,
      metadata_json: {
        target_level: targetLevel,
      },
    },
    executor
  );

  if (input.record_history !== false) {
    await createGameplayHistoryEntry(
      character.id,
      input.actor_account_id ?? null,
      normalizeOptionalText(input.source_type) ?? 'milestone',
      input.source_entity_id ?? null,
      input.action_key ?? 'grant_milestone',
      input.summary ??
        `${updatedCharacter.name} has ${levelCount} pending milestone level${levelCount === 1 ? '' : 's'}.`,
      {
        advancement_event_id: event.id,
        advancement_mode: context.mode,
        pending_level_count: updatedCharacter.pending_level_count,
        level_up_available: updatedCharacter.level_up_available,
      },
      0,
      executor
    );
  }

  return {
    character_id: character.id,
    campaign_id: context.campaign_id,
    advancement_mode: context.mode,
    granted_level_count: levelCount,
    pending_level_count: updatedCharacter.pending_level_count,
    level_up_available: updatedCharacter.level_up_available,
    advancement_event: event,
  };
}

async function getOpenOrLatestSession(characterId, executor = { query }) {
  const openResult = await executor.query(selectOpenLevelUpSessionByCharacterQuery, [characterId]);
  const latestResult = await executor.query(selectLatestLevelUpSessionByCharacterQuery, [characterId]);

  return {
    open_session: mapLevelUpSessionRow(openResult.rows[0] || null),
    latest_session: mapLevelUpSessionRow(latestResult.rows[0] || null),
  };
}

function buildSessionView(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    session_status: session.session_status,
    current_step: session.current_step,
    from_level: session.from_level,
    target_level: session.target_level,
    target_character_class_id: session.target_character_class_id,
    required_steps: session.required_steps_json ?? [],
    selected_choices: session.selected_choices_json ?? {},
    validation: session.validation_state_json ?? {},
    preview: session.preview_json ?? {},
    hp_choice_method: session.hp_choice_method,
    hp_roll_result: session.hp_roll_result,
    created_at: session.created_at,
    updated_at: session.updated_at,
    completed_at: session.completed_at,
  };
}

export async function getCharacterAdvancementStatus(characterId, options = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const character = await getCharacterAdvancementRow(normalizedCharacterId);

  if (!character) {
    return null;
  }

  const context = await getEffectiveAdvancementContext(character, options.campaign_id ?? null, { query });
  const safeMoment = await evaluateSafeMoment(context.campaign_id, character.id);
  const { open_session, latest_session } = await getOpenOrLatestSession(character.id);
  const eventsResult = await query(selectAdvancementEventsByCharacterQuery, [
    character.id,
    normalizePositiveInteger(options.limit ?? 20, 'limit'),
    normalizeNonNegativeInteger(options.offset ?? 0, 'offset'),
  ]);
  const levelSync = await getLevelSyncData(context.campaign_id, character.id, context.config, { query });

  return {
    character_id: character.id,
    character_name: character.name,
    campaign_id: context.campaign_id,
    campaign_slug: context.campaign_slug,
    advancement_mode: context.mode,
    advancement_config: context.config,
    level: character.level,
    experience_points: character.experience_points,
    pending_level_count: character.pending_level_count,
    level_up_available: character.level_up_available,
    last_level_up_available_at: character.last_level_up_available_at,
    thresholds: buildThresholdSummary(character, context.mode),
    safe_moment: safeMoment,
    active_level_up_session: buildSessionView(open_session),
    latest_level_up_session: buildSessionView(latest_session),
    party_sync: levelSync,
    events: eventsResult.rows.map(mapAdvancementEventRow),
  };
}

export async function setCampaignAdvancementConfig(campaignId, input) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const { advancement_mode, advancement_config } = validateAdvancementModeAndConfig(
    input.advancement_mode,
    input.advancement_config ?? input.config ?? {}
  );
  const result = await query(updateCampaignAdvancementConfigQuery, [
    normalizedCampaignId,
    advancement_mode,
    JSON.stringify(advancement_config),
  ]);
  const row = mapCampaignAdvancementConfigRow(result.rows[0] || null);

  if (!row) {
    throw createHttpError('Campaign not found', 404);
  }

  return {
    campaign_id: row.id,
    advancement_mode: row.advancement_mode,
    advancement_config: normalizeAdvancementConfig(row.advancement_config_json),
  };
}

export async function setWorldAdvancementConfig(worldId, input) {
  const normalizedWorldId = normalizePositiveInteger(worldId, 'worldId');
  const { advancement_mode, advancement_config } = validateAdvancementModeAndConfig(
    input.advancement_mode,
    input.advancement_config ?? input.config ?? {}
  );
  const result = await query(updateWorldAdvancementConfigQuery, [
    normalizedWorldId,
    advancement_mode,
    JSON.stringify(advancement_config),
  ]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('World not found', 404);
  }

  return {
    world_id: Number(row.id),
    slug: row.slug,
    name: row.name,
    advancement_mode: row.advancement_mode,
    advancement_config: normalizeAdvancementConfig(row.advancement_config_json),
    updated_at: row.updated_at,
  };
}

export async function grantCharacterExperience(characterId, input, executor = null) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  if (executor) {
    return grantXpInternal(normalizedCharacterId, input, executor);
  }

  return withTransaction((client) => grantXpInternal(normalizedCharacterId, input, client));
}

export async function grantMilestoneLevel(characterId, input, executor = null) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  if (executor) {
    return grantMilestoneInternal(normalizedCharacterId, input, executor);
  }

  return withTransaction((client) => grantMilestoneInternal(normalizedCharacterId, input, client));
}

export async function getCampaignLevelSync(campaignId) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const configResult = await query(selectCampaignAdvancementConfigQuery, [normalizedCampaignId]);
  const configRow = mapCampaignAdvancementConfigRow(configResult.rows[0] || null);

  if (!configRow) {
    throw createHttpError('Campaign not found', 404);
  }

  return getLevelSyncData(
    normalizedCampaignId,
    null,
    normalizeAdvancementConfig(
      configRow.advancement_config_json ?? configRow.world_advancement_config_json
    )
  );
}

async function requireOpenLevelUpSession(characterId, executor) {
  const sessionResult = await executor.query(selectOpenLevelUpSessionByCharacterForUpdateQuery, [
    characterId,
  ]);
  const session = mapLevelUpSessionRow(sessionResult.rows[0] || null);

  if (!session) {
    throw createHttpError('No active level-up session exists for this character', 404);
  }

  if (!openLevelUpStatuses.has(session.session_status)) {
    throw createHttpError('This level-up session is not editable', 409);
  }

  return session;
}

export async function startLevelUp(characterId, input = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  const result = await withTransaction(async (client) => {
    const character = await getCharacterAdvancementRow(normalizedCharacterId, client, {
      forUpdate: true,
    });
    validateCharacterCanAdvance(character);

    if (character.pending_level_count < 1 || !character.level_up_available) {
      throw createHttpError('No pending level-up is available for this character', 409);
    }

    const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, client);
    const safeMoment = await evaluateSafeMoment(context.campaign_id, character.id, client);

    if (!safeMoment.can_start_now) {
      throw createHttpError(safeMoment.reason ?? 'Level-up is currently deferred', 409);
    }

    const existingSessionResult = await client.query(selectOpenLevelUpSessionByCharacterForUpdateQuery, [
      character.id,
    ]);
    const existingSession = mapLevelUpSessionRow(existingSessionResult.rows[0] || null);
    const classEntry = await resolveTargetClassEntry(
      character.id,
      input.target_character_class_id ?? existingSession?.target_character_class_id ?? null,
      client
    );

    if (existingSession) {
      if (existingSession.session_status === 'deferred') {
        const resumedResult = await client.query(updateLevelUpSessionStateQuery, [
          existingSession.id,
          'started',
          existingSession.current_step,
          JSON.stringify(existingSession.required_steps_json ?? []),
          JSON.stringify(existingSession.selected_choices_json ?? {}),
          JSON.stringify(existingSession.validation_state_json ?? {}),
          JSON.stringify(existingSession.preview_json ?? {}),
          existingSession.hp_choice_method,
          existingSession.hp_roll_result,
        ]);
        const resumed = await refreshSessionState(
          mapLevelUpSessionRow(resumedResult.rows[0]),
          character,
          context,
          classEntry,
          client
        );
        return {
          resumed: true,
          campaign_id: context.campaign_id,
          level_up_session: buildSessionView(resumed),
        };
      }

      throw createHttpError('A level-up session is already in progress for this character', 409);
    }

    const insertedResult = await client.query(insertLevelUpSessionQuery, [
      character.id,
      character.world_id,
      context.campaign_id,
      classEntry.id,
      context.mode,
      'started',
      character.level,
      character.level + 1,
      'hp_choice',
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({ is_valid: false, errors: [] }),
      JSON.stringify({}),
      null,
      null,
    ]);
    const insertedSession = mapLevelUpSessionRow(insertedResult.rows[0]);
    const refreshedSession = await refreshSessionState(
      insertedSession,
      character,
      context,
      classEntry,
      client
    );

    await insertAdvancementEvent(
      {
        character_id: character.id,
        world_id: character.world_id,
        campaign_id: context.campaign_id,
        actor_account_id: input.actor_account_id ?? null,
        level_up_session_id: refreshedSession.id,
        event_kind: 'level_up_started',
        advancement_mode: context.mode,
        source_type: 'system',
        source_entity_id: refreshedSession.id,
        reason: normalizeOptionalText(input.reason) ?? 'Level-up session started',
        metadata_json: {
          from_level: refreshedSession.from_level,
          target_level: refreshedSession.target_level,
          target_character_class_id: refreshedSession.target_character_class_id,
        },
      },
      client
    );

    return {
      resumed: false,
      campaign_id: context.campaign_id,
      level_up_session: buildSessionView(refreshedSession),
    };
  });

  const advancement = await getCharacterAdvancementStatus(normalizedCharacterId, {
    campaign_id: result.campaign_id,
  });

  return {
    resumed: result.resumed,
    advancement,
    level_up_session: result.level_up_session,
  };
}

export async function deferLevelUp(characterId, input = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  return withTransaction(async (client) => {
    const character = await getCharacterAdvancementRow(normalizedCharacterId, client, {
      forUpdate: true,
    });
    validateCharacterCanAdvance(character);
    const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, client);
    const session = await requireOpenLevelUpSession(character.id, client);
    const updateResult = await client.query(updateLevelUpSessionStateQuery, [
      session.id,
      'deferred',
      session.current_step,
      JSON.stringify(session.required_steps_json ?? []),
      JSON.stringify(session.selected_choices_json ?? {}),
      JSON.stringify(session.validation_state_json ?? {}),
      JSON.stringify(session.preview_json ?? {}),
      session.hp_choice_method,
      session.hp_roll_result,
    ]);
    const deferredSession = mapLevelUpSessionRow(updateResult.rows[0]);

    await insertAdvancementEvent(
      {
        character_id: character.id,
        world_id: character.world_id,
        campaign_id: context.campaign_id,
        actor_account_id: input.actor_account_id ?? null,
        level_up_session_id: deferredSession.id,
        event_kind: 'level_up_deferred',
        advancement_mode: context.mode,
        source_type: 'system',
        source_entity_id: deferredSession.id,
        reason: normalizeOptionalText(input.reason) ?? 'Level-up deferred',
        metadata_json: {},
      },
      client
    );

    return {
      deferred: true,
      level_up_session: buildSessionView(deferredSession),
    };
  });
}

export async function chooseLevelUpHp(characterId, input = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  return withTransaction(async (client) => {
    const character = await getCharacterAdvancementRow(normalizedCharacterId, client, {
      forUpdate: true,
    });
    validateCharacterCanAdvance(character);
    const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, client);
    const session = await requireOpenLevelUpSession(character.id, client);
    const classEntry = await resolveTargetClassEntry(
      character.id,
      session.target_character_class_id,
      client
    );
    const selectedChoices = { ...(session.selected_choices_json ?? {}) };
    const existingHpChoice = selectedChoices.hp ?? null;

    if (existingHpChoice?.method) {
      throw createHttpError('Hit point choice has already been made for this session', 409);
    }

    const method = normalizeOptionalText(input.method);

    if (!['fixed', 'roll'].includes(method ?? '')) {
      throw createHttpError('method must be fixed or roll', 400);
    }

    let rollResult = null;

    if (method === 'roll') {
      rollResult = Math.floor(Math.random() * classEntry.class.hit_die) + 1;
      await insertAdvancementEvent(
        {
          character_id: character.id,
          world_id: character.world_id,
          campaign_id: context.campaign_id,
          actor_account_id: input.actor_account_id ?? null,
          level_up_session_id: session.id,
          event_kind: 'hp_roll',
          advancement_mode: context.mode,
          source_type: 'level_up',
          source_entity_id: session.id,
          reason: `Rolled hit die d${classEntry.class.hit_die} for level-up`,
          metadata_json: {
            hit_die: classEntry.class.hit_die,
            roll_result: rollResult,
          },
        },
        client
      );
    }

    selectedChoices.hp = {
      method,
      hit_die: classEntry.class.hit_die,
      roll_result: rollResult,
      gain:
        method === 'fixed'
          ? calculateFixedHitPointGain(classEntry.class.hit_die, character.constitution)
          : Math.max(1, rollResult + calculateAbilityModifier(character.constitution)),
    };

    const updateResult = await client.query(updateLevelUpSessionStateQuery, [
      session.id,
      'validating',
      session.current_step,
      JSON.stringify(session.required_steps_json ?? []),
      JSON.stringify(selectedChoices),
      JSON.stringify(session.validation_state_json ?? {}),
      JSON.stringify(session.preview_json ?? {}),
      method,
      rollResult,
    ]);

    const updatedSession = await refreshSessionState(
      mapLevelUpSessionRow(updateResult.rows[0]),
      character,
      context,
      classEntry,
      client
    );

    return buildSessionView(updatedSession);
  });
}

export async function chooseLevelUpSubclass(characterId, input = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  return withTransaction(async (client) => {
    const character = await getCharacterAdvancementRow(normalizedCharacterId, client, {
      forUpdate: true,
    });
    validateCharacterCanAdvance(character);
    const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, client);
    const session = await requireOpenLevelUpSession(character.id, client);
    const classEntry = await resolveTargetClassEntry(
      character.id,
      session.target_character_class_id,
      client
    );
    const targetClassLevel = classEntry.class_level + 1;
    const availableSubclassResult = await client.query(selectAvailableSubclassesForClassQuery, [
      classEntry.class.id,
    ]);
    const availableSubclasses = availableSubclassResult.rows
      .map((row) => ({
        id: Number(row.id),
        unlock_level: Number(row.unlock_level ?? 1),
      }))
      .filter((entry) => entry.unlock_level <= targetClassLevel);
    const subclassId = normalizePositiveInteger(input.subclass_id, 'subclass_id');

    if (!availableSubclasses.some((entry) => entry.id === subclassId)) {
      throw createHttpError('subclass_id is not valid for this level-up step', 400);
    }

    const selectedChoices = {
      ...(session.selected_choices_json ?? {}),
      subclass_id: subclassId,
    };
    const updateResult = await client.query(updateLevelUpSessionStateQuery, [
      session.id,
      'validating',
      session.current_step,
      JSON.stringify(session.required_steps_json ?? []),
      JSON.stringify(selectedChoices),
      JSON.stringify(session.validation_state_json ?? {}),
      JSON.stringify(session.preview_json ?? {}),
      session.hp_choice_method,
      session.hp_roll_result,
    ]);
    const updatedSession = await refreshSessionState(
      mapLevelUpSessionRow(updateResult.rows[0]),
      character,
      context,
      classEntry,
      client
    );

    return buildSessionView(updatedSession);
  });
}

export async function chooseLevelUpSpells(characterId, input = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  return withTransaction(async (client) => {
    const character = await getCharacterAdvancementRow(normalizedCharacterId, client, {
      forUpdate: true,
    });
    validateCharacterCanAdvance(character);
    const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, client);
    const session = await requireOpenLevelUpSession(character.id, client);
    const classEntry = await resolveTargetClassEntry(
      character.id,
      session.target_character_class_id,
      client
    );
    const selectedChoices = { ...(session.selected_choices_json ?? {}) };
    const cantripSpellIds =
      input.cantrip_spell_ids !== undefined
        ? normalizeStringArray(input.cantrip_spell_ids, 'cantrip_spell_ids')
        : selectedChoices?.spells?.cantrip_spell_ids ?? [];
    const knownSpellIds =
      input.known_spell_ids !== undefined
        ? normalizeStringArray(input.known_spell_ids, 'known_spell_ids')
        : selectedChoices?.spells?.known_spell_ids ?? [];

    selectedChoices.spells = {
      cantrip_spell_ids: cantripSpellIds,
      known_spell_ids: knownSpellIds,
    };

    const updateResult = await client.query(updateLevelUpSessionStateQuery, [
      session.id,
      'validating',
      session.current_step,
      JSON.stringify(session.required_steps_json ?? []),
      JSON.stringify(selectedChoices),
      JSON.stringify(session.validation_state_json ?? {}),
      JSON.stringify(session.preview_json ?? {}),
      session.hp_choice_method,
      session.hp_roll_result,
    ]);
    const updatedSession = await refreshSessionState(
      mapLevelUpSessionRow(updateResult.rows[0]),
      character,
      context,
      classEntry,
      client
    );

    return buildSessionView(updatedSession);
  });
}

export async function previewLevelUp(characterId, options = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  return withTransaction(async (client) => {
    const character = await getCharacterAdvancementRow(normalizedCharacterId, client, {
      forUpdate: true,
    });
    validateCharacterCanAdvance(character);
    const context = await getEffectiveAdvancementContext(character, options.campaign_id ?? null, client);
    const session = await requireOpenLevelUpSession(character.id, client);
    const classEntry = await resolveTargetClassEntry(
      character.id,
      session.target_character_class_id,
      client
    );
    const refreshedSession = await refreshSessionState(session, character, context, classEntry, client);

    return buildSessionView(refreshedSession);
  });
}

async function finalizeLevelUpInternal(character, context, session, classEntry, input, executor) {
  const safeMoment = await evaluateSafeMoment(context.campaign_id, character.id, executor);

  if (!safeMoment.can_finalize_now) {
    throw createHttpError(
      safeMoment.reason ?? 'Level-up cannot finalize during the current thread',
      409
    );
  }

  const refreshedSession = await refreshSessionState(session, character, context, classEntry, executor);

  if (!refreshedSession.validation_state_json?.is_valid) {
    throw createHttpError(
      refreshedSession.validation_state_json?.errors?.[0] ??
        'Level-up choices are incomplete or invalid',
      409
    );
  }

  const selectedChoices = refreshedSession.selected_choices_json ?? {};
  const hpChoice = selectedChoices.hp ?? {};
  const hpGain = Number(hpChoice.gain ?? 0);
  const preview = refreshedSession.preview_json ?? {};
  const spellSelection = preview.spell_selection ?? {};
  const selectedCantripIds = spellSelection.selected_cantrip_ids ?? [];
  const selectedSpellIds = spellSelection.selected_spell_ids ?? [];
  const chosenSubclassId =
    preview.chosen_subclass?.id ?? selectedChoices.subclass_id ?? classEntry.subclass_id ?? null;
  const newCharacterLevel = character.level + 1;
  const newClassLevel = classEntry.class_level + 1;
  const newPendingLevelCount = Math.max(0, character.pending_level_count - 1);
  const newLevelUpAvailable = newPendingLevelCount > 0;
  const newMaxHitPoints =
    character.max_hit_points !== null ? Number(character.max_hit_points) + hpGain : null;
  const newCurrentHitPoints =
    character.current_hit_points !== null ? Number(character.current_hit_points) + hpGain : null;
  const newProficiencyBonus = calculateProficiencyBonus(newCharacterLevel);

  if (chosenSubclassId !== null) {
    await executor.query(updateCharacterClassLevelAndSubclassQuery, [
      classEntry.id,
      newClassLevel,
      chosenSubclassId,
    ]);
  } else {
    await executor.query(updateCharacterClassLevelQuery, [classEntry.id, newClassLevel]);
  }

  for (const spellId of [...selectedCantripIds, ...selectedSpellIds]) {
    await executor.query(insertCharacterSpellQuery, [
      character.id,
      spellId,
      'level_up',
      classEntry.class.id,
      true,
      false,
      false,
      `Added during level-up to level ${newCharacterLevel}`,
    ]);
  }

  const updateResult = await executor.query(updateCharacterLevelingSummaryQuery, [
    character.id,
    newCharacterLevel,
    newPendingLevelCount,
    newLevelUpAvailable,
    newLevelUpAvailable ? character.last_level_up_available_at : null,
    classEntry.class.id,
    chosenSubclassId,
    newMaxHitPoints,
    newCurrentHitPoints,
    newProficiencyBonus,
  ]);
  const updatedCharacter = mapCharacterAdvancementRow({
    ...character,
    ...updateResult.rows[0],
    account_is_active: character.account_is_active,
    world_advancement_mode: character.world_advancement_mode,
    world_advancement_config_json: character.world_advancement_config_json,
  });

  const completedResult = await executor.query(completeLevelUpSessionQuery, [
    refreshedSession.id,
    'completed',
    'completed',
    JSON.stringify(refreshedSession.required_steps_json ?? []),
    JSON.stringify(selectedChoices),
    JSON.stringify({
      ...(refreshedSession.validation_state_json ?? {}),
      finalized: true,
    }),
    JSON.stringify({
      ...preview,
      finalized_at: new Date().toISOString(),
    }),
    refreshedSession.hp_choice_method,
    refreshedSession.hp_roll_result,
  ]);
  const completedSession = mapLevelUpSessionRow(completedResult.rows[0]);

  const event = await insertAdvancementEvent(
    {
      character_id: character.id,
      world_id: character.world_id,
      campaign_id: context.campaign_id,
      actor_account_id: input.actor_account_id ?? null,
      level_up_session_id: completedSession.id,
      event_kind: 'level_up_completed',
      advancement_mode: context.mode,
      source_type: 'level_up',
      source_entity_id: completedSession.id,
      target_level: updatedCharacter.level,
      reason: normalizeOptionalText(input.reason) ?? 'Level-up finalized',
      metadata_json: {
        hp_gain: hpGain,
        hp_choice_method: refreshedSession.hp_choice_method,
        hp_roll_result: refreshedSession.hp_roll_result,
        subclass_id: chosenSubclassId,
        granted_spell_ids: [...selectedCantripIds, ...selectedSpellIds],
      },
    },
    executor
  );

  await createGameplayHistoryEntry(
    character.id,
    input.actor_account_id ?? null,
    'level_up',
    completedSession.id,
    'finalize_level_up',
    `${character.name} reaches level ${updatedCharacter.level}.`,
    {
      advancement_event_id: event.id,
      from_level: completedSession.from_level,
      target_level: completedSession.target_level,
      hp_gain: hpGain,
      pending_level_count: updatedCharacter.pending_level_count,
      class_level: newClassLevel,
    },
    0,
    executor
  );

  return {
    character: updatedCharacter,
    level_up_session: completedSession,
    advancement_event: event,
  };
}

export async function finalizeLevelUp(characterId, input = {}) {
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');

  const result = await withTransaction(async (client) => {
    const character = await getCharacterAdvancementRow(normalizedCharacterId, client, {
      forUpdate: true,
    });
    validateCharacterCanAdvance(character);
    const context = await getEffectiveAdvancementContext(character, input.campaign_id ?? null, client);
    const sessionResult = await client.query(selectOpenLevelUpSessionByCharacterForUpdateQuery, [
      character.id,
    ]);
    const session = mapLevelUpSessionRow(sessionResult.rows[0] || null);

    if (!session) {
      const latestResult = await client.query(selectLatestLevelUpSessionByCharacterQuery, [
        character.id,
      ]);
      const latestSession = mapLevelUpSessionRow(latestResult.rows[0] || null);

      if (latestSession?.session_status === 'completed') {
        return {
          already_completed: true,
          level_up_session: buildSessionView(latestSession),
          campaign_id: context.campaign_id,
        };
      }

      throw createHttpError('No active level-up session exists for this character', 404);
    }

    const classEntry = await resolveTargetClassEntry(
      character.id,
      session.target_character_class_id,
      client
    );
    const result = await finalizeLevelUpInternal(
      character,
      context,
      session,
      classEntry,
      input,
      client
    );

    return {
      already_completed: false,
      campaign_id: context.campaign_id,
      level_up_session: buildSessionView(result.level_up_session),
      advancement_event: result.advancement_event,
    };
  });

  const advancement = await getCharacterAdvancementStatus(normalizedCharacterId, {
    campaign_id: result.campaign_id,
  });

  return {
    already_completed: result.already_completed,
    level_up_session: result.level_up_session,
    advancement_event: result.advancement_event,
    advancement,
  };
}
