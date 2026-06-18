import { query, withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { getCharacterSheet } from './characterSheetService.js';
import { listKnowledgeForCharacter } from './characterKnowledgeService.js';
import { ensureActionComposerSchema } from './actionComposerSchema.js';
import { ensureLivingWorldSchema } from './livingWorldSchema.js';
import { getPlayerStateForAccount } from './playerStateService.js';

const abilities = [
  { key: 'strength', short: 'str', label: 'Strength' },
  { key: 'dexterity', short: 'dex', label: 'Dexterity' },
  { key: 'constitution', short: 'con', label: 'Constitution' },
  { key: 'intelligence', short: 'int', label: 'Intelligence' },
  { key: 'wisdom', short: 'wis', label: 'Wisdom' },
  { key: 'charisma', short: 'cha', label: 'Charisma' },
];

const savingThrowProficienciesByClass = {
  barbarian: ['strength', 'constitution'],
  bard: ['dexterity', 'charisma'],
  cleric: ['wisdom', 'charisma'],
  druid: ['intelligence', 'wisdom'],
  fighter: ['strength', 'constitution'],
  monk: ['strength', 'dexterity'],
  paladin: ['wisdom', 'charisma'],
  ranger: ['strength', 'dexterity'],
  rogue: ['dexterity', 'intelligence'],
  sorcerer: ['constitution', 'charisma'],
  warlock: ['wisdom', 'charisma'],
  wizard: ['intelligence', 'wisdom'],
};

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function modifier(score) {
  if (score === null || score === undefined) {
    return null;
  }
  return Math.floor((Number(score) - 10) / 2);
}

function jsonValue(value, fallback) {
  return value && typeof value === 'object' ? value : fallback;
}

function compactText(values, fallback = null) {
  const filtered = values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
  return filtered.length > 0 ? filtered.join(' ') : fallback;
}

function mapBaseCharacter(row) {
  return {
    character_id: String(row.id),
    name: row.name,
    level: Number(row.level ?? 1),
    species: row.race_name,
    race: row.race_name,
    subrace: row.subrace_name ?? null,
    class: row.class_name,
    background: row.background_name ?? null,
    trait: row.personality_traits ?? null,
    status: row.status ?? (row.is_active ? 'active' : 'inactive'),
    is_active: Boolean(row.is_active),
    is_active_character: Boolean(row.is_current_active),
    is_current_active: Boolean(row.is_current_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapAdventure(row) {
  if (!row) {
    return null;
  }

  return {
    campaign_instance_id: String(row.campaign_id),
    campaign_id: String(row.campaign_id),
    membership_id: String(row.membership_id),
    world_id: row.world_slug ?? (row.world_id ? String(row.world_id) : null),
    world_name: row.world_name,
    world_slug: row.world_slug,
    world_instance_id: row.world_instance_id ? String(row.world_instance_id) : null,
    campaign_name: row.campaign_name,
    campaign_slug: row.campaign_slug,
    current_location_label: row.location_name ?? null,
    current_location: row.location_id
      ? {
          location_id: String(row.location_id),
          key: row.location_key,
          name: row.location_name,
        }
      : null,
    current_scene_id: row.scene_id ? String(row.scene_id) : null,
    current_scene: row.scene_id
      ? {
          scene_id: String(row.scene_id),
          key: row.scene_key,
          name: row.scene_name,
          summary: row.scene_summary,
        }
      : null,
    current_objective: row.objective_id
      ? {
          objective_id: String(row.objective_id),
          key: row.objective_key,
          title: row.objective_title,
          status: row.objective_status,
        }
      : null,
    action_required: row.membership_status === 'active' && row.scene_id !== null,
  };
}

function mapPendingAction({ actionWindow = null, progressionWindow = null }) {
  const campaignId = actionWindow?.campaign_id ?? progressionWindow?.campaign_id ?? null;
  const submittedActionWindow = Boolean(actionWindow?.submission_id);
  const actionWindowOpenForPlayer =
    actionWindow?.status === 'open' &&
    (!actionWindow.opens_at || new Date(actionWindow.opens_at).getTime() <= Date.now()) &&
    (!actionWindow.expires_at || new Date(actionWindow.expires_at).getTime() > Date.now());
  const submittedProgression =
    progressionWindow &&
    (progressionWindow.response_id !== null || progressionWindow.participant_status === 'responded');
  const progressionActionRequired =
    progressionWindow &&
    !submittedProgression &&
    progressionWindow.participant_status === 'expected' &&
    ['open', 'threshold_reached'].includes(progressionWindow.status);
  const actionWindowRequired = Boolean(actionWindow && actionWindowOpenForPlayer && !submittedActionWindow);
  const relevantActionWindow = Boolean(submittedActionWindow || actionWindowRequired);
  const relevantProgressionWindow = Boolean(submittedProgression || progressionActionRequired);

  return {
    has_pending_unresolved_action: Boolean(submittedProgression || submittedActionWindow),
    action_required: Boolean(progressionActionRequired || actionWindowRequired),
    status: submittedProgression || submittedActionWindow
      ? 'action_submitted'
      : progressionActionRequired || actionWindowRequired
        ? 'action_required'
        : 'none',
    action_window_id: relevantActionWindow && actionWindow?.id ? String(actionWindow.id) : null,
    progression_window_id: relevantProgressionWindow && progressionWindow?.id ? String(progressionWindow.id) : null,
    campaign_id: campaignId ? String(campaignId) : null,
    window_type: actionWindow?.window_type ?? progressionWindow?.scope_type ?? null,
    prompt_text: actionWindow?.prompt_text ?? progressionWindow?.prompt_text ?? null,
    response_summary:
      progressionWindow?.response_summary ??
      actionWindow?.submission_raw_text ??
      actionWindow?.target_label ??
      null,
  };
}

async function getOwnedCharacterRow(accountId, characterId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        character.id,
        character.account_id,
        character.world_id,
        character.name,
        character.level,
        character.status,
        character.is_active,
        character.personality_traits,
        character.created_at,
        character.updated_at,
        character.web_creation_metadata_json,
        race.name AS race_name,
        race.slug AS race_slug,
        subrace.name AS subrace_name,
        subrace.slug AS subrace_slug,
        class.name AS class_name,
        class.slug AS class_slug,
        background.name AS background_name,
        background.slug AS background_slug,
        account.active_character_id = character.id AS is_current_active
      FROM dnd5e_character character
      JOIN account ON account.id = character.account_id
      LEFT JOIN dnd5e_race race ON race.id = character.race_id
      LEFT JOIN dnd5e_subrace subrace ON subrace.id = character.subrace_id
      LEFT JOIN dnd5e_class class ON class.id = character.class_id
      LEFT JOIN dnd5e_background background ON background.id = character.background_id
      WHERE character.id = $1
        AND character.account_id = $2
      LIMIT 1
    `,
    [characterId, accountId]
  );

  return result.rows[0] ?? null;
}

async function requireOwnedCharacter(accountId, characterId, executor = { query }) {
  const normalizedCharacterId = numericId(characterId);
  if (!normalizedCharacterId) {
    throw createHttpError('character_id must be a positive integer', 400);
  }

  const row = await getOwnedCharacterRow(accountId, normalizedCharacterId, executor);
  if (!row) {
    throw createHttpError('Character not found', 404);
  }
  return row;
}

async function listOwnedCharacterRows(accountId) {
  const result = await query(
    `
      SELECT
        character.id,
        character.account_id,
        character.world_id,
        character.name,
        character.level,
        character.status,
        character.is_active,
        character.personality_traits,
        character.created_at,
        character.updated_at,
        race.name AS race_name,
        race.slug AS race_slug,
        subrace.name AS subrace_name,
        subrace.slug AS subrace_slug,
        class.name AS class_name,
        class.slug AS class_slug,
        background.name AS background_name,
        background.slug AS background_slug,
        account.active_character_id = character.id AS is_current_active
      FROM dnd5e_character character
      JOIN account ON account.id = character.account_id
      LEFT JOIN dnd5e_race race ON race.id = character.race_id
      LEFT JOIN dnd5e_subrace subrace ON subrace.id = character.subrace_id
      LEFT JOIN dnd5e_class class ON class.id = character.class_id
      LEFT JOIN dnd5e_background background ON background.id = character.background_id
      WHERE character.account_id = $1
      ORDER BY
        account.active_character_id = character.id DESC,
        character.updated_at DESC NULLS LAST,
        character.created_at DESC,
        character.id DESC
    `,
    [accountId]
  );

  return result.rows;
}

export async function getCurrentAdventureForCharacter(characterId, executor = { query }) {
  if (!numericId(characterId)) {
    return null;
  }
  await ensureLivingWorldSchema();

  const result = await executor.query(
    `
      SELECT
        membership.id AS membership_id,
        membership.campaign_id,
        membership.membership_status,
        membership.current_scene_id AS scene_id,
        campaign.world_id,
        COALESCE(campaign.world_instance_id, default_instance.id) AS world_instance_id,
        campaign.name AS campaign_name,
        campaign.slug AS campaign_slug,
        world.name AS world_name,
        world.slug AS world_slug,
        scene.key AS scene_key,
        scene.name AS scene_name,
        scene.summary AS scene_summary,
        location.id AS location_id,
        location.key AS location_key,
        location.name AS location_name,
        active_objective.objective_id,
        active_objective.objective_key,
        active_objective.objective_title,
        active_objective.status AS objective_status
      FROM dnd5e_campaign_character membership
      JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
      JOIN dnd5e_world world ON world.id = campaign.world_id
      LEFT JOIN LATERAL (
        SELECT instance.id
        FROM dnd5e_world_instance instance
        WHERE instance.world_id = campaign.world_id
          AND instance.status = 'active'
        ORDER BY
          CASE WHEN instance.instance_key = CONCAT(world.slug, '-shared-default') THEN 0 ELSE 1 END,
          instance.id ASC
        LIMIT 1
      ) default_instance ON TRUE
      LEFT JOIN dnd5e_scene scene ON scene.id = membership.current_scene_id
      LEFT JOIN dnd5e_location location ON location.id = scene.location_id
      LEFT JOIN LATERAL (
        SELECT
          objective_state.status,
          objective.id AS objective_id,
          objective.key AS objective_key,
          objective.title AS objective_title
        FROM dnd5e_character_objective objective_state
        JOIN dnd5e_quest_objective objective ON objective.id = objective_state.objective_id
        JOIN dnd5e_character_quest quest_state ON quest_state.id = objective_state.character_quest_id
        WHERE quest_state.campaign_id = membership.campaign_id
          AND quest_state.character_id = membership.character_id
          AND objective_state.status = 'active'
        ORDER BY objective.sort_order ASC, objective.id ASC
        LIMIT 1
      ) active_objective ON TRUE
      WHERE membership.character_id = $1
        AND membership.is_active = TRUE
        AND membership.membership_status = 'active'
      ORDER BY
        membership.is_active_context DESC,
        membership.is_default_solo_campaign DESC,
        membership.joined_at DESC NULLS LAST,
        membership.id DESC
      LIMIT 1
    `,
    [characterId]
  );

  return mapAdventure(result.rows[0] ?? null);
}

export async function getCharacterPendingActionStatus(characterId, executor = { query }) {
  await ensureActionComposerSchema();
  const actionWindowResult = await executor.query(
    `
      SELECT
        window_row.id,
        window_row.campaign_id,
        window_row.character_id,
        window_row.window_type,
        window_row.status,
        window_row.prompt_text,
        window_row.opens_at,
        window_row.expires_at,
        window_row.updated_at,
        submission.id AS submission_id,
        submission.raw_text AS submission_raw_text,
        submission.target_label
      FROM dnd5e_action_window window_row
      LEFT JOIN dnd5e_web_action_submission submission
        ON submission.action_window_id = window_row.id
       AND submission.character_id = window_row.character_id
      WHERE window_row.character_id = $1
        AND window_row.status IN ('open', 'closing', 'resolving')
      ORDER BY window_row.updated_at DESC, window_row.id DESC
      LIMIT 1
    `,
    [characterId]
  );

  const progressionResult = await executor.query(
    `
      SELECT
        window_row.id,
        window_row.campaign_id,
        window_row.scope_type,
        window_row.status,
        window_row.prompt_text,
        window_row.threshold_at,
        participant.participant_status,
        participant.responded_at,
        response.id AS response_id,
        response.response_summary
      FROM dnd5e_progression_window_participant participant
      JOIN dnd5e_progression_window window_row ON window_row.id = participant.progression_window_id
      LEFT JOIN dnd5e_progression_window_response response
        ON response.progression_window_id = window_row.id
       AND response.character_id = participant.character_id
      WHERE participant.character_id = $1
        AND window_row.status IN ('open', 'threshold_reached')
      ORDER BY
        CASE WHEN response.id IS NOT NULL OR participant.participant_status = 'responded' THEN 0 ELSE 1 END,
        window_row.threshold_at ASC,
        window_row.id DESC
      LIMIT 1
    `,
    [characterId]
  );

  return mapPendingAction({
    actionWindow: actionWindowResult.rows[0] ?? null,
    progressionWindow: progressionResult.rows[0] ?? null,
  });
}

async function buildCharacterSummary(row) {
  const characterId = Number(row.id);
  const [currentCampaign, pendingAction] = await Promise.all([
    getCurrentAdventureForCharacter(characterId),
    getCharacterPendingActionStatus(characterId),
  ]);

  return {
    ...mapBaseCharacter(row),
    current_campaign: currentCampaign,
    pending_action: pendingAction,
  };
}

export async function listWebCharacters(accountId) {
  const accountResult = await query('SELECT active_character_id FROM account WHERE id = $1 LIMIT 1', [accountId]);
  if (accountResult.rowCount === 0) {
    throw createHttpError('Account not found', 404);
  }

  const rows = await listOwnedCharacterRows(accountId);
  const characters = [];
  for (const row of rows) {
    characters.push(await buildCharacterSummary(row));
  }

  return {
    characters,
    active_character_id: accountResult.rows[0].active_character_id
      ? String(accountResult.rows[0].active_character_id)
      : null,
  };
}

function buildAbilityScores(sheet) {
  const classSlug = sheet.classes.find((entry) => entry.is_primary)?.class?.slug ?? sheet.classes[0]?.class?.slug ?? null;
  const saveProficiencies = savingThrowProficienciesByClass[classSlug] ?? [];
  const rulesAbilities = sheet.derived_rules?.abilities ?? {};
  const result = {};

  for (const ability of abilities) {
    const ruleEntry = rulesAbilities[ability.key] ?? {};
    const score = Number(ruleEntry.effective_score ?? sheet.character[ability.key] ?? 10);
    result[ability.short] = {
      ability: ability.key,
      label: ability.label,
      score,
      modifier: Number(ruleEntry.modifier ?? modifier(score)),
      save_proficient: saveProficiencies.includes(ability.key),
    };
  }

  return result;
}

function collectSkillProficiencies(sheet) {
  const skills = [];
  for (const feature of sheet.derived_rules?.features?.mechanical ?? []) {
    for (const skill of feature.effects?.skill_proficiencies ?? []) {
      const name = skill.skill?.name;
      if (name) {
        skills.push(name);
      }
    }
  }
  return [...new Set(skills)].sort();
}

function buildProficiencies(sheet) {
  const classSlug = sheet.classes.find((entry) => entry.is_primary)?.class?.slug ?? sheet.classes[0]?.class?.slug ?? null;
  const saveProficiencies = savingThrowProficienciesByClass[classSlug] ?? [];
  const savingThrows = abilities
    .filter((ability) => saveProficiencies.includes(ability.key))
    .map((ability) => ability.label);

  return {
    skills: collectSkillProficiencies(sheet),
    saving_throws: savingThrows,
    weapons: [],
    armor: [],
    tools: [],
    languages: (sheet.derived_rules?.languages?.effective ?? []).map((entry) => entry.name).sort(),
  };
}

function buildCombat(sheet) {
  const abilityScores = buildAbilityScores(sheet);
  const wisdomModifier = abilityScores.wis?.modifier ?? 0;
  const proficiencyBonus =
    Number(sheet.derived_rules?.proficiency?.stored_character_bonus ?? sheet.derived_rules?.proficiency?.derived_bonus ?? sheet.character.proficiency_bonus ?? 2);

  return {
    armor_class: Number(sheet.character.armor_class ?? 10),
    hit_points: {
      current: Number(sheet.character.current_hit_points ?? 0),
      max: Number(sheet.character.max_hit_points ?? 0),
      temporary: Number(sheet.character.temporary_hit_points ?? 0),
    },
    hit_dice: sheet.classes.length > 0
      ? sheet.classes.map((entry) => `${entry.class_level}d${entry.class.hit_die ?? 8}`).join(' + ')
      : null,
    initiative: abilityScores.dex?.modifier ?? 0,
    speed: Number(sheet.derived_rules?.movement?.walk?.effective_speed ?? sheet.character.speed ?? 30),
    proficiency_bonus: proficiencyBonus,
    passive_perception: 10 + wisdomModifier,
    conditions: [],
  };
}

function buildFeatures(sheet) {
  return (sheet.derived_features ?? []).map((feature) => ({
    id: String(feature.id),
    name: feature.name,
    source: feature.granted_by?.source_type ?? feature.source ?? 'feature',
    source_label: feature.granted_by?.source_entity_name ?? feature.source ?? 'Feature',
    summary: feature.description ?? '',
    details: feature.description ?? '',
  }));
}

function buildEquipment(sheet, metadata) {
  const inventory = sheet.inventory ?? {};
  const items = inventory.items ?? [];
  const equipped = items.filter((entry) => entry.is_equipped);
  const names = items.map((entry) => entry.item?.name).filter(Boolean);

  return {
    summary: names.length > 0 ? names.slice(0, 6).join(', ') : 'No equipment recorded yet.',
    equipped: equipped.map((entry) => ({
      character_item_id: String(entry.id),
      name: entry.item?.name,
      quantity: Number(entry.quantity ?? 1),
      item_type: entry.item?.item_type ?? null,
    })),
    items: items.slice(0, 25).map((entry) => ({
      character_item_id: String(entry.id),
      name: entry.item?.name,
      quantity: Number(entry.quantity ?? 1),
      item_type: entry.item?.item_type ?? null,
      is_equipped: Boolean(entry.is_equipped),
    })),
    currency: inventory.currency ?? null,
    defaults_applied: Boolean(metadata.defaults_applied?.equipment ?? metadata.defaults_applied),
    summary_stats: inventory.summary ?? null,
  };
}

function buildSpells(sheet, metadata) {
  const spellcasting = sheet.spellcasting;
  const summary = spellcasting?.summary ?? {};
  const effectiveSpells = spellcasting?.spells?.effective ?? [];
  const classSpellcasting = summary.class_spellcasting?.find((entry) => entry.spellcasting) ?? null;
  const castingAbility = classSpellcasting?.spellcasting?.casting_ability ?? null;
  const abilityScores = buildAbilityScores(sheet);
  const abilityModifier = castingAbility ? abilityScores[castingAbility.slice(0, 3)]?.modifier : null;
  const proficiencyBonus = Number(sheet.derived_rules?.proficiency?.derived_bonus ?? sheet.character.proficiency_bonus ?? 2);

  return {
    is_spellcaster: Boolean(summary.has_spellcasting || effectiveSpells.length > 0),
    spellcasting_ability: castingAbility,
    spell_save_dc: abilityModifier === null || abilityModifier === undefined ? null : 8 + proficiencyBonus + abilityModifier,
    spell_attack_bonus: abilityModifier === null || abilityModifier === undefined ? null : proficiencyBonus + abilityModifier,
    cantrips: effectiveSpells
      .filter((entry) => Number(entry.spell?.level ?? 0) === 0)
      .map((entry) => entry.spell?.name)
      .filter(Boolean),
    level_1_spells: effectiveSpells
      .filter((entry) => Number(entry.spell?.level ?? 0) === 1)
      .map((entry) => entry.spell?.name)
      .filter(Boolean),
    spell_slots: spellcasting?.slots ?? [],
    defaults_applied: Boolean(metadata.defaults_applied?.spells ?? metadata.defaults_applied),
  };
}

async function getKnowledgePreview(characterId, currentAdventure) {
  if (!currentAdventure?.world_instance_id) {
    return {
      known_clue_count: 0,
      recent_known_facts: [],
      full_knowledge_route: '/play/campaign/knowledge',
    };
  }

  const facts = await listKnowledgeForCharacter({
    characterId,
    worldInstanceId: currentAdventure.world_instance_id,
    types: ['fact', 'clue', 'rumor', 'lore', 'entity_knowledge', 'location_knowledge'],
  });

  return {
    known_clue_count: facts.filter((entry) => ['clue', 'lore'].includes(entry.type)).length,
    recent_known_facts: facts.slice(0, 5).map((entry) => ({
      knowledge_id: entry.knowledge_id,
      type: entry.type,
      text: entry.text ?? entry.public_label ?? entry.title,
      confidence: entry.confidence,
      known_at: entry.known_at,
    })),
    full_knowledge_route: '/play/campaign/knowledge',
  };
}

export async function getWebCharacterSheet(accountId, characterId) {
  const row = await requireOwnedCharacter(accountId, characterId);
  const sheet = await getCharacterSheet(Number(row.id));
  if (!sheet) {
    throw createHttpError('Character not found', 404);
  }

  const metadata = jsonValue(row.web_creation_metadata_json, {});
  const [currentAdventure, pendingAction] = await Promise.all([
    getCurrentAdventureForCharacter(Number(row.id)),
    getCharacterPendingActionStatus(Number(row.id)),
  ]);
  const knowledgePreview = await getKnowledgePreview(Number(row.id), currentAdventure);

  return {
    character: {
      ...mapBaseCharacter(row),
      status: row.status ?? 'active',
    },
    ability_scores: buildAbilityScores(sheet),
    combat: buildCombat(sheet),
    features: buildFeatures(sheet),
    proficiencies: buildProficiencies(sheet),
    equipment: buildEquipment(sheet, metadata),
    spells: buildSpells(sheet, metadata),
    background_and_trait: {
      background: sheet.background
        ? {
            id: String(sheet.background.id),
            label: sheet.background.name,
            description: sheet.background.description ?? '',
          }
        : null,
      trait: row.personality_traits
        ? {
            id: String(row.personality_traits).toLowerCase().replaceAll(/\s+/g, '_'),
            label: row.personality_traits,
            description: row.personality_traits,
          }
        : null,
    },
    current_adventure: currentAdventure,
    knowledge_preview: knowledgePreview,
    pending_action: pendingAction,
    limitations: {
      full_inventory_management_deferred: true,
      full_spell_management_deferred: true,
      full_detailed_sheet_deferred_to: '6B.2D',
      full_knowledge_history_deferred_to: '6B.6',
    },
  };
}

export async function setActiveCharacterForWeb(accountId, characterId) {
  const normalizedCharacterId = numericId(characterId);
  if (!normalizedCharacterId) {
    throw createHttpError('character_id must be a positive integer', 400);
  }

  const previousActiveResult = await query(
    `
      SELECT active_character.id, active_character.name
      FROM account
      LEFT JOIN dnd5e_character active_character ON active_character.id = account.active_character_id
      WHERE account.id = $1
      LIMIT 1
    `,
    [accountId]
  );
  const previousActive = previousActiveResult.rows[0] ?? null;
  const previousActivePendingAction = previousActive?.id
    ? await getCharacterPendingActionStatus(Number(previousActive.id))
    : mapPendingAction({});

  await withTransaction(async (client) => {
    const accountResult = await client.query('SELECT id, active_character_id FROM account WHERE id = $1 FOR UPDATE', [
      accountId,
    ]);
    if (accountResult.rowCount === 0) {
      throw createHttpError('Account not found', 404);
    }

    const target = await requireOwnedCharacter(accountId, normalizedCharacterId, client);
    if (target.status !== 'active') {
      throw createHttpError('Only active finalized characters can become the active character', 409);
    }

    if (Number(accountResult.rows[0].active_character_id) === normalizedCharacterId) {
      return;
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
      [normalizedCharacterId]
    );
    await client.query(
      `
        UPDATE account
        SET active_character_id = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [accountId, normalizedCharacterId]
    );
  });

  return {
    active_character_id: String(normalizedCharacterId),
    previous_active_character_id: previousActive?.id ? String(previousActive.id) : null,
    switched: previousActive?.id ? Number(previousActive.id) !== normalizedCharacterId : true,
    previous_active_pending_action: {
      had_pending_unresolved_action: previousActivePendingAction.has_pending_unresolved_action,
      character_name: previousActive?.name ?? null,
      action_window_id:
        previousActivePendingAction.progression_window_id ?? previousActivePendingAction.action_window_id ?? null,
      status: previousActivePendingAction.status,
    },
    player_state: await getPlayerStateForAccount(accountId),
  };
}
