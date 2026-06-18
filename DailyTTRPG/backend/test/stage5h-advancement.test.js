import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { pool, query } from '../src/config/db.js';
import { createAccount } from '../src/services/accountsService.js';
import { applyAdventureOutcome } from '../src/services/adventureProgressionService.js';
import {
  chooseLevelUpHp,
  chooseLevelUpSpells,
  chooseLevelUpSubclass,
  deferLevelUp,
  finalizeLevelUp,
  getCampaignLevelSync,
  getCharacterAdvancementStatus,
  grantCharacterExperience,
  grantMilestoneLevel,
  previewLevelUp,
  setCampaignAdvancementConfig,
  startLevelUp,
} from '../src/services/advancementService.js';
import { getPlayState } from '../src/services/adventureRuntimeService.js';
import { getCharacterSheet } from '../src/services/characterSheetService.js';
import { createCharacter } from '../src/services/charactersService.js';
import { addCharacterToCampaign, createCampaign } from '../src/services/eventService.js';
import { openProgressionWindow, resolveProgressionWindow } from '../src/services/worldSimulationService.js';

after(async () => {
  await pool.end();
});

let fixturePromise = null;

function uniqueKey(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function selectSingleValue(queryText, params, label) {
  const result = await query(queryText, params);
  const row = result.rows[0] || null;

  if (!row) {
    throw new Error(`Missing required fixture row: ${label}`);
  }

  return row;
}

async function insertPrimaryClassEntry(characterId, classId, subclassId = null) {
  const result = await query(
    `
      INSERT INTO dnd5e_character_class (
        character_id,
        class_id,
        subclass_id,
        class_level,
        is_primary
      )
      VALUES ($1, $2, $3, 1, TRUE)
      RETURNING id
    `,
    [characterId, classId, subclassId]
  );

  return Number(result.rows[0].id);
}

async function seedKnownSpells(characterId, classId) {
  const cantripResult = await query(
    `
      SELECT cs.spell_id, spell.slug
      FROM dnd5e_class_spell cs
      JOIN dnd5e_spell spell ON spell.id = cs.spell_id
      WHERE cs.class_id = $1
        AND spell.level = 0
      ORDER BY spell.name ASC
      LIMIT 4
    `,
    [classId]
  );
  const leveledResult = await query(
    `
      SELECT cs.spell_id, spell.slug
      FROM dnd5e_class_spell cs
      JOIN dnd5e_spell spell ON spell.id = cs.spell_id
      WHERE cs.class_id = $1
        AND spell.level = 1
      ORDER BY spell.name ASC
      LIMIT 2
    `,
    [classId]
  );

  for (const row of [...cantripResult.rows, ...leveledResult.rows]) {
    await query(
      `
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
        VALUES ($1, $2, 'manual', $3, TRUE, FALSE, FALSE, $4)
      `,
      [characterId, Number(row.spell_id), classId, 'Stage 5H automated test seed spell']
    );
  }

  return {
    cantrips: cantripResult.rows.map((row) => row.slug),
    leveled: leveledResult.rows.map((row) => row.slug),
  };
}

async function createFixture() {
  const suffix = uniqueKey('stage5h');
  const world = await selectSingleValue(
    `SELECT id FROM dnd5e_world WHERE slug = 'greyvale' ORDER BY id ASC LIMIT 1`,
    [],
    'greyvale world'
  );
  const scene = await selectSingleValue(
    `
      SELECT scene.id
      FROM dnd5e_scene scene
      JOIN dnd5e_location location ON location.id = scene.location_id
      JOIN dnd5e_region region ON region.id = location.region_id
      WHERE region.world_id = $1
      ORDER BY scene.id ASC
      LIMIT 1
    `,
    [Number(world.id)],
    'world-local scene for runtime surface tests'
  );
  const fighterClass = await selectSingleValue(
    `SELECT id FROM dnd5e_class WHERE slug = 'fighter'`,
    [],
    'fighter class'
  );
  const fighterSubclass = await selectSingleValue(
    `SELECT id, slug FROM dnd5e_subclass WHERE class_id = $1 ORDER BY id ASC LIMIT 1`,
    [Number(fighterClass.id)],
    'fighter subclass'
  );
  const sorcererClass = await selectSingleValue(
    `SELECT id FROM dnd5e_class WHERE slug = 'sorcerer'`,
    [],
    'sorcerer class'
  );
  const draconicSubclass = await selectSingleValue(
    `SELECT id FROM dnd5e_subclass WHERE slug = 'draconic-bloodline'`,
    [],
    'draconic bloodline subclass'
  );

  const fighterAccount = await createAccount({
    email: `${suffix}-fighter@example.test`,
    display_name: `Stage5H Fighter ${suffix}`,
    preferred_channel: 'email',
  });
  const sorcererAccount = await createAccount({
    email: `${suffix}-sorcerer@example.test`,
    display_name: `Stage5H Sorcerer ${suffix}`,
    preferred_channel: 'email',
  });

  const fighter = await createCharacter({
    account_id: fighterAccount.id,
    world_id: Number(world.id),
    name: `Stage5H Fighter ${suffix}`,
    race_id: null,
    subrace_id: null,
    class_id: Number(fighterClass.id),
    subclass_id: null,
    background_id: null,
    alignment_id: null,
    level: 1,
    experience_points: 0,
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 10,
    charisma: 8,
    max_hit_points: 12,
    current_hit_points: 12,
    temporary_hit_points: 0,
    armor_class: 16,
    speed: 30,
    proficiency_bonus: 2,
    personality_traits: null,
    ideals: null,
    bonds: null,
    flaws: null,
    backstory: null,
    notes: 'Stage 5H automated test fighter',
  });
  const sorcerer = await createCharacter({
    account_id: sorcererAccount.id,
    world_id: Number(world.id),
    name: `Stage5H Sorcerer ${suffix}`,
    race_id: null,
    subrace_id: null,
    class_id: Number(sorcererClass.id),
    subclass_id: Number(draconicSubclass.id),
    background_id: null,
    alignment_id: null,
    level: 1,
    experience_points: 0,
    strength: 8,
    dexterity: 14,
    constitution: 12,
    intelligence: 10,
    wisdom: 10,
    charisma: 16,
    max_hit_points: 7,
    current_hit_points: 7,
    temporary_hit_points: 0,
    armor_class: 13,
    speed: 30,
    proficiency_bonus: 2,
    personality_traits: null,
    ideals: null,
    bonds: null,
    flaws: null,
    backstory: null,
    notes: 'Stage 5H automated test sorcerer',
  });

  const fighterClassEntryId = await insertPrimaryClassEntry(fighter.id, Number(fighterClass.id), null);
  const sorcererClassEntryId = await insertPrimaryClassEntry(
    sorcerer.id,
    Number(sorcererClass.id),
    Number(draconicSubclass.id)
  );
  const sorcererSpells = await seedKnownSpells(sorcerer.id, Number(sorcererClass.id));

  const campaign = await createCampaign({
    world_id: Number(world.id),
    created_by_account_id: fighterAccount.id,
    name: `Stage5H Party ${suffix}`,
    slug: `stage5h-party-${suffix}`,
    campaign_type: 'party',
    status: 'active',
    description: 'Stage 5H automated advancement integration campaign',
  });

  await addCharacterToCampaign(campaign.campaign.id, {
    character_id: fighter.id,
    joined_by_account_id: fighterAccount.id,
    is_active_context: true,
  });
  await addCharacterToCampaign(campaign.campaign.id, {
    character_id: sorcerer.id,
    joined_by_account_id: sorcererAccount.id,
    is_active_context: false,
  });
  await query(
    `
      UPDATE dnd5e_campaign_character
      SET
        current_scene_id = $3,
        updated_at = NOW()
      WHERE campaign_id = $1
        AND character_id = $2
    `,
    [campaign.campaign.id, fighter.id, Number(scene.id)]
  );

  await setCampaignAdvancementConfig(campaign.campaign.id, {
    advancement_mode: 'event_weighted_xp',
    advancement_config: {
      xp_weights: {
        objective: 100,
        quest: 300,
        combat: 50,
        discovery: 75,
        dialogue: 25,
        system: 25,
        gm: 100,
      },
      catch_up_enabled: true,
      soft_sync_enabled: true,
      catch_up_multiplier_per_level_gap: 0.25,
      catch_up_multiplier_cap: 1.75,
    },
  });

  return {
    suffix,
    world_id: Number(world.id),
    scene_id: Number(scene.id),
    campaign_id: campaign.campaign.id,
    fighter: {
      account_id: Number(fighterAccount.id),
      character_id: Number(fighter.id),
      class_id: Number(fighterClass.id),
      class_entry_id: fighterClassEntryId,
      subclass_id: Number(fighterSubclass.id),
    },
    sorcerer: {
      account_id: Number(sorcererAccount.id),
      character_id: Number(sorcerer.id),
      class_id: Number(sorcererClass.id),
      class_entry_id: sorcererClassEntryId,
      subclass_id: Number(draconicSubclass.id),
      starter_spells: sorcererSpells,
    },
  };
}

async function getFixture() {
  if (!fixturePromise) {
    fixturePromise = createFixture();
  }

  return fixturePromise;
}

test('Stage 5H advancement integration', { concurrency: false }, async (t) => {
  const fixture = await getFixture();

  await t.test('campaign advancement mode configuration validates and stays inspectable', async () => {
    const milestoneConfig = await setCampaignAdvancementConfig(fixture.campaign_id, {
      advancement_mode: 'milestone',
      advancement_config: {
        xp_weights: {
          objective: 125,
        },
        catch_up_enabled: false,
        soft_sync_enabled: true,
      },
    });
    assert.equal(milestoneConfig.advancement_mode, 'milestone');
    assert.equal(milestoneConfig.advancement_config.xp_weights.objective, 125);
    assert.equal(milestoneConfig.advancement_config.catch_up_enabled, false);

    const gmConfig = await setCampaignAdvancementConfig(fixture.campaign_id, {
      advancement_mode: 'gm_controlled',
      advancement_config: {
        catch_up_enabled: true,
        soft_sync_enabled: false,
      },
    });
    assert.equal(gmConfig.advancement_mode, 'gm_controlled');
    assert.equal(gmConfig.advancement_config.soft_sync_enabled, false);

    await assert.rejects(
      () =>
        setCampaignAdvancementConfig(fixture.campaign_id, {
          advancement_mode: 'not_a_mode',
        }),
      /advancement_mode must be milestone, event_weighted_xp, or gm_controlled/
    );

    const xpConfig = await setCampaignAdvancementConfig(fixture.campaign_id, {
      advancement_mode: 'event_weighted_xp',
      advancement_config: {
        xp_weights: {
          objective: 100,
          quest: 300,
          combat: 50,
          discovery: 75,
          dialogue: 25,
          system: 25,
          gm: 100,
        },
        catch_up_enabled: true,
        soft_sync_enabled: true,
        catch_up_multiplier_per_level_gap: 0.25,
        catch_up_multiplier_cap: 1.75,
      },
    });
    assert.equal(xpConfig.advancement_mode, 'event_weighted_xp');
    assert.equal(xpConfig.advancement_config.xp_weights.quest, 300);
  });

  await t.test('XP grants create pending advancement, dedupe correctly, and surface unsafe runtime deferral', async () => {
    const dedupeKey = `${fixture.suffix}-fighter-objective-1`;
    const xpGrant = await grantCharacterExperience(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
      amount: 300,
      source_type: 'objective',
      source_entity_id: 1001,
      dedupe_key: dedupeKey,
      reason: 'Stage 5H fighter objective reward',
    });

    assert.equal(xpGrant.before_experience_points, 0);
    assert.equal(xpGrant.after_experience_points, 300);
    assert.equal(xpGrant.pending_level_count, 1);
    assert.equal(xpGrant.level_up_available, true);
    assert.equal(xpGrant.advancement_event.event_kind, 'xp_grant');

    const duplicateGrant = await grantCharacterExperience(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
      amount: 300,
      source_type: 'objective',
      source_entity_id: 1001,
      dedupe_key: dedupeKey,
      reason: 'Duplicate Stage 5H fighter objective reward',
    });
    assert.equal(duplicateGrant.was_duplicate, true);
    assert.equal(duplicateGrant.after_experience_points, 300);

    const unsafeWindow = await openProgressionWindow({
      campaign_id: fixture.campaign_id,
      actor_account_id: fixture.fighter.account_id,
      window_key: `${fixture.suffix}-unsafe-window`,
      prompt_text: 'The party must commit before leveling.',
      threshold_minutes: 0,
      participants: [fixture.fighter.character_id],
      default_action_type: 'wait',
    });

    const unsafeStatus = await getCharacterAdvancementStatus(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(unsafeStatus.level_up_available, true);
    assert.equal(unsafeStatus.pending_level_count, 1);
    assert.equal(unsafeStatus.safe_moment.can_start_now, false);
    assert.match(unsafeStatus.safe_moment.reason, /progression window/i);

    const playState = await getPlayState(fixture.campaign_id, fixture.fighter.character_id, 'player');
    assert.equal(playState.advancement.level_up_available, true);
    assert.equal(playState.advancement.can_start_level_up_now, false);
    assert.match(playState.advancement.why_deferred, /progression window/i);

    await assert.rejects(
      () =>
        startLevelUp(fixture.fighter.character_id, {
          campaign_id: fixture.campaign_id,
        }),
      /progression window/
    );

    await resolveProgressionWindow(unsafeWindow.window.id, {
      summary: 'Stage 5H unsafe window resolved for level-up testing.',
    });

    const safeStatus = await getCharacterAdvancementStatus(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(safeStatus.safe_moment.can_start_now, true);
    assert.equal(safeStatus.pending_level_count, 1);
  });

  await t.test('fighter level-up uses fixed HP, finalizes atomically, and remains idempotent', async () => {
    const started = await startLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(started.resumed, false);
    assert.equal(started.level_up_session.current_step, 'hp_choice');
    assert.equal(started.level_up_session.preview.spell_selection.required, false);

    const afterHpChoice = await chooseLevelUpHp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
      method: 'fixed',
    });
    assert.equal(afterHpChoice.session_status, 'ready_to_finalize');
    assert.equal(afterHpChoice.hp_choice_method, 'fixed');
    assert.equal(afterHpChoice.validation.is_valid, true);

    const preview = await previewLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(preview.validation.is_valid, true);
    assert.equal(preview.preview.resulting_summary.level, 2);

    const finalized = await finalizeLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(finalized.already_completed, false);
    assert.equal(finalized.advancement.level, 2);
    assert.equal(finalized.advancement.pending_level_count, 0);
    assert.equal(finalized.level_up_session.session_status, 'completed');
    assert.equal(finalized.advancement_event.event_kind, 'level_up_completed');

    const finalizeAgain = await finalizeLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(finalizeAgain.already_completed, true);

    const sheet = await getCharacterSheet(fixture.fighter.character_id);
    assert.equal(sheet.character.level, 2);
    assert.equal(sheet.summary.levels_match, true);
    assert.ok(sheet.character.max_hit_points > 12);
  });

  await t.test('soft sync catch-up XP, server-side HP roll, invalid spell rejection, and spell finalization all work', async () => {
    const levelSyncBefore = await getCampaignLevelSync(fixture.campaign_id);
    assert.deepEqual(levelSyncBefore.lagging_character_ids, [fixture.sorcerer.character_id]);

    const sorcererXp = await grantCharacterExperience(fixture.sorcerer.character_id, {
      campaign_id: fixture.campaign_id,
      amount: 300,
      source_type: 'quest',
      source_entity_id: 1002,
      dedupe_key: `${fixture.suffix}-sorcerer-quest-1`,
      reason: 'Stage 5H sorcerer quest reward',
    });
    assert.equal(sorcererXp.base_amount, 300);
    assert.equal(sorcererXp.amount_granted, 375);
    assert.equal(sorcererXp.catch_up.multiplier, 1.25);
    assert.equal(sorcererXp.pending_level_count, 1);

    const started = await startLevelUp(fixture.sorcerer.character_id, {
      campaign_id: fixture.campaign_id,
    });
    const spellSelection = started.level_up_session.preview.spell_selection;
    assert.equal(spellSelection.required, true);
    assert.equal(spellSelection.required_spell_count, 1);
    assert.ok(spellSelection.full_valid_spells.length >= spellSelection.sms_curated_spells.length);

    const invalidSpellChoice = await chooseLevelUpSpells(fixture.sorcerer.character_id, {
      campaign_id: fixture.campaign_id,
      known_spell_ids: ['not-a-real-spell'],
      cantrip_spell_ids: [],
    });
    assert.equal(invalidSpellChoice.validation.is_valid, false);
    assert.ok(
      invalidSpellChoice.validation.errors.some((entry) => /invalid spell selection/i.test(entry))
    );

    const hpRolled = await chooseLevelUpHp(fixture.sorcerer.character_id, {
      campaign_id: fixture.campaign_id,
      method: 'roll',
    });
    assert.equal(hpRolled.hp_choice_method, 'roll');
    assert.ok(Number.isInteger(hpRolled.hp_roll_result));
    assert.ok(hpRolled.hp_roll_result >= 1);
    assert.ok(hpRolled.hp_roll_result <= 6);

    await assert.rejects(
      () =>
        chooseLevelUpHp(fixture.sorcerer.character_id, {
          campaign_id: fixture.campaign_id,
          method: 'roll',
        }),
      /already been made/
    );

    const chosenSpellSlug = spellSelection.full_valid_spells[0].slug;
    const afterSpellChoice = await chooseLevelUpSpells(fixture.sorcerer.character_id, {
      campaign_id: fixture.campaign_id,
      known_spell_ids: [chosenSpellSlug],
      cantrip_spell_ids: [],
    });
    assert.equal(afterSpellChoice.validation.is_valid, true);
    assert.deepEqual(afterSpellChoice.preview.spell_selection.selected_spell_ids.length, 1);

    const finalized = await finalizeLevelUp(fixture.sorcerer.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(finalized.advancement.level, 2);
    assert.equal(finalized.advancement.pending_level_count, 0);
    assert.equal(finalized.advancement.level_up_available, false);
    assert.ok(finalized.advancement.events.some((entry) => entry.event_kind === 'hp_roll'));
    assert.ok(finalized.advancement.events.some((entry) => entry.event_kind === 'level_up_completed'));

    const learnedSpellResult = await query(
      `
        SELECT spell.slug
        FROM dnd5e_character_spell character_spell
        JOIN dnd5e_spell spell ON spell.id = character_spell.spell_id
        WHERE character_spell.character_id = $1
        ORDER BY character_spell.id DESC
      `,
      [fixture.sorcerer.character_id]
    );
    assert.ok(learnedSpellResult.rows.some((row) => row.slug === chosenSpellSlug));

    const outcome = await applyAdventureOutcome({
      campaignId: fixture.campaign_id,
      characterId: fixture.sorcerer.character_id,
      sourceType: 'adventure',
      sourceKey: 'stage5h-automated-outcome',
      effectPayload: {
        rewards: [
          {
            reward_type: 'xp',
            value: {
              amount: 25,
            },
            metadata_json: {
              reason: 'Stage 5H centralized adventure reward',
            },
          },
        ],
      },
    });
    assert.ok(Array.isArray(outcome.rewards));
    assert.equal(outcome.rewards[0].reward.reward_type, 'xp');

    const postOutcomeStatus = await getCharacterAdvancementStatus(fixture.sorcerer.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(postOutcomeStatus.experience_points, 400);
    assert.ok(
      postOutcomeStatus.events.some(
        (entry) => entry.event_kind === 'xp_grant' && entry.source_type === 'adventure'
      )
    );
  });

  await t.test('milestone grants create deferred pending levels that can be resumed and finalized later', async () => {
    await setCampaignAdvancementConfig(fixture.campaign_id, {
      advancement_mode: 'milestone',
      advancement_config: {
        catch_up_enabled: true,
        soft_sync_enabled: true,
      },
    });

    const milestone = await grantMilestoneLevel(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
      level_count: 1,
      dedupe_key: `${fixture.suffix}-fighter-milestone-1`,
      reason: 'Stage 5H milestone grant',
    });
    assert.equal(milestone.granted_level_count, 1);
    assert.equal(milestone.pending_level_count, 1);
    assert.equal(milestone.level_up_available, true);

    const statusAfterGrant = await getCharacterAdvancementStatus(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(statusAfterGrant.level, 2);
    assert.equal(statusAfterGrant.pending_level_count, 1);
    assert.equal(statusAfterGrant.advancement_mode, 'milestone');

    const started = await startLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(started.level_up_session.session_status, 'awaiting_choice');

    const deferred = await deferLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
      reason: 'Pause Stage 5H milestone flow',
    });
    assert.equal(deferred.deferred, true);
    assert.equal(deferred.level_up_session.session_status, 'deferred');

    const resumed = await startLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.level_up_session.session_status, 'awaiting_choice');

    const withSubclass = await chooseLevelUpSubclass(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
      subclass_id: fixture.fighter.subclass_id,
    });
    assert.equal(withSubclass.validation.is_valid, false);

    await chooseLevelUpHp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
      method: 'fixed',
    });

    const finalized = await finalizeLevelUp(fixture.fighter.character_id, {
      campaign_id: fixture.campaign_id,
    });
    assert.equal(finalized.advancement.level, 3);
    assert.equal(finalized.advancement.pending_level_count, 0);
    assert.equal(finalized.advancement.advancement_mode, 'milestone');
  });
});
