import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { pool, query } from '../src/config/db.js';
import { CONTENT_SECTION_KEYS } from '../src/content/contentTypes.js';
import { importContentPackage } from '../src/content/contentImporter.js';
import { validateContentPackage } from '../src/content/contentValidation.js';
import { createAccount } from '../src/services/accountsService.js';
import { setCampaignAdvancementConfig } from '../src/services/advancementService.js';
import { createCharacter } from '../src/services/charactersService.js';
import { addCharacterToCampaign, createCampaign } from '../src/services/eventService.js';
import {
  evaluatePartyStrength,
  previewEncounter,
  resolveEncounter,
} from '../src/services/encounterService.js';

after(async () => {
  await pool.end();
});

let fixturePromise = null;

function uniqueKey(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySections(overrides = {}) {
  return Object.fromEntries(CONTENT_SECTION_KEYS.map((section) => [section, overrides[section] ?? []]));
}

function baseEncounter(overrides = {}) {
  return {
    encounter_id: 'test-balanced-encounter',
    name: 'Test Balanced Encounter',
    encounter_type: 'minor',
    difficulty_intent: 'medium',
    scaling_enabled: true,
    story_fixed_by_default: false,
    allowed_scaling_methods: ['variant_selection', 'enemy_count'],
    disallowed_scaling_methods: ['stat_tweak', 'large_stat_scaling'],
    party_size_range: { min: 1, max: 4 },
    level_range: { min: 1, max: 3 },
    async_beat_target: { min: 2, max: 4 },
    base_variant: 'solo',
    variants: [
      {
        variant_id: 'solo',
        party_size_range: { min: 1, max: 1 },
        level_range: { min: 1, max: 3 },
        enemies: [
          {
            entity_slug: 'rusk-bandit',
            entity_type: 'npc_template',
            count: 1,
            min_count: 0,
            max_count: 1,
            base_power: 1,
          },
        ],
      },
    ],
    resolution_paths: ['combat', 'negotiation'],
    reward_value: {
      xp: 50,
      grant_on_resolution: true,
      equivalent_across_paths: true,
    },
    fail_forward: true,
    ...overrides,
  };
}

function validateEncounterRecord(record) {
  return validateContentPackage({
    packagePath: 'unit-test',
    manifest: {},
    loadOrder: ['world', 'encounterTemplates'],
    filesProcessed: ['encounters/test.json'],
    sections: emptySections({
      world: [
        {
          slug: 'test-world',
          name: 'Test World',
          status: 'active',
        },
      ],
      encounterTemplates: [record],
    }),
  });
}

async function selectSingleValue(queryText, params, label) {
  const result = await query(queryText, params);
  const row = result.rows[0] || null;

  if (!row) {
    throw new Error(`Missing required fixture row: ${label}`);
  }

  return row;
}

async function createFixtureCharacter(worldId, suffix, index, level = 1) {
  const fighterClass = await selectSingleValue(
    `SELECT id FROM dnd5e_class WHERE slug = 'fighter'`,
    [],
    'fighter class'
  );
  const account = await createAccount({
    email: `${suffix}-${index}@example.test`,
    display_name: `Stage5I Tester ${index} ${suffix}`,
    preferred_channel: 'email',
  });
  const character = await createCharacter({
    account_id: account.id,
    world_id: worldId,
    name: `Stage5I Tester ${index}`,
    race_id: null,
    subrace_id: null,
    class_id: Number(fighterClass.id),
    subclass_id: null,
    background_id: null,
    alignment_id: null,
    level,
    experience_points: 0,
    strength: 14,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    max_hit_points: 12,
    current_hit_points: 12,
    temporary_hit_points: 0,
    armor_class: 15,
    speed: 30,
    proficiency_bonus: 2,
    personality_traits: null,
    ideals: null,
    bonds: null,
    flaws: null,
    backstory: null,
    notes: 'Stage 5I automated encounter fixture',
  });

  return {
    account_id: account.id,
    character_id: character.id,
  };
}

async function createFixture() {
  const suffix = uniqueKey('stage5i');
  const contentPath = path.resolve(process.cwd(), '../content/worlds/greyvale');
  const dryRun = await importContentPackage(contentPath, { dryRun: true });
  assert.equal(dryRun.ok, true);
  assert.ok(dryRun.report.sections.encounterTemplates.records.length >= 4);

  const imported = await importContentPackage(contentPath);
  assert.equal(imported.ok, true);

  const world = await selectSingleValue(
    `SELECT id FROM dnd5e_world WHERE slug = 'greyvale' ORDER BY id ASC LIMIT 1`,
    [],
    'greyvale world'
  );
  const owner = await createAccount({
    email: `${suffix}-owner@example.test`,
    display_name: `Stage5I Owner ${suffix}`,
    preferred_channel: 'email',
  });
  const campaign = await createCampaign({
    world_id: Number(world.id),
    created_by_account_id: owner.id,
    name: `Stage5I Encounter Party ${suffix}`,
    slug: `stage5i-encounter-party-${suffix}`,
    campaign_type: 'party',
    status: 'active',
    description: 'Stage 5I automated encounter scaling party.',
  });
  await setCampaignAdvancementConfig(campaign.campaign.id, {
    advancement_mode: 'event_weighted_xp',
    advancement_config: {
      xp_weights: {
        objective: 100,
        quest: 300,
        combat: 50,
        discovery: 75,
        dialogue: 25,
        encounter: 50,
        system: 25,
        gm: 100,
      },
      catch_up_enabled: false,
      soft_sync_enabled: true,
    },
  });

  const characters = [];
  for (let index = 1; index <= 4; index += 1) {
    const character = await createFixtureCharacter(Number(world.id), suffix, index, index === 3 ? 4 : 1);
    characters.push(character);
    await addCharacterToCampaign(Number(campaign.campaign.id), {
      character_id: character.character_id,
      joined_by_account_id: character.account_id,
      is_active_context: index === 1,
    });
  }

  return {
    suffix,
    world_id: Number(world.id),
    campaign_id: Number(campaign.campaign.id),
    characters,
  };
}

async function getFixture() {
  if (!fixturePromise) {
    fixturePromise = createFixture();
  }

  return fixturePromise;
}

test('Stage 5I encounter scaling and balance integration', { concurrency: false }, async (t) => {
  const fixture = await getFixture();

  await t.test('encounter template validation catches required balance contracts', async () => {
    assert.equal(validateEncounterRecord(baseEncounter()).ok, true);

    assert.equal(validateEncounterRecord(baseEncounter({ encounter_id: undefined })).ok, false);
    assert.equal(validateEncounterRecord(baseEncounter({ difficulty_intent: undefined })).ok, false);
    assert.equal(validateEncounterRecord(baseEncounter({ difficulty_intent: 'impossible' })).ok, false);
    assert.equal(validateEncounterRecord(baseEncounter({ async_beat_target: { min: 5, max: 2 } })).ok, false);
    assert.equal(validateEncounterRecord(baseEncounter({ allowed_scaling_methods: ['wizardry'] })).ok, false);
    assert.equal(
      validateEncounterRecord(
        baseEncounter({
          scaling_enabled: true,
          allowed_scaling_methods: [],
        })
      ).ok,
      false
    );
    assert.equal(validateEncounterRecord(baseEncounter({ party_size_range: { min: 4, max: 1 } })).ok, false);
    assert.equal(validateEncounterRecord(baseEncounter({ level_range: { min: 3, max: 1 } })).ok, false);
    assert.equal(validateEncounterRecord(baseEncounter({ reward_value: undefined })).ok, false);
    assert.equal(validateEncounterRecord(baseEncounter({ resolution_paths: [] })).ok, false);
    assert.equal(
      validateEncounterRecord(
        baseEncounter({
          story_fixed_by_default: true,
          encounter_type: 'story',
          scaling_enabled: true,
          explicit_story_scaling: false,
        })
      ).ok,
      false
    );
    assert.equal(
      validateEncounterRecord(
        baseEncounter({
          reward_value: {
            xp: 50,
            grant_on_resolution: true,
            equivalent_across_paths: false,
          },
        })
      ).ok,
      false
    );
  });

  await t.test('party strength handles solo, party, mixed levels, and warnings deterministically', async () => {
    const solo = await evaluatePartyStrength({
      character_id: fixture.characters[0].character_id,
      campaign_id: fixture.campaign_id,
    });
    assert.equal(solo.party_size, 1);
    assert.equal(solo.average_level, 1);
    assert.equal(solo.party_power, 1);
    assert.equal(solo.solo_context, true);
    assert.ok(solo.warnings.some((warning) => /solo/i.test(warning)));

    const party = await evaluatePartyStrength({
      campaign_id: fixture.campaign_id,
      use_party: true,
      party: true,
    });
    assert.ok(party.party_size >= 4);
    assert.equal(party.highest_level, 4);
    assert.equal(party.lowest_level, 1);
    assert.ok(party.level_spread >= 3);
    assert.ok(party.warnings.some((warning) => /level spread/i.test(warning)));

    const partyAgain = await evaluatePartyStrength({
      campaign_id: fixture.campaign_id,
      use_party: true,
      party: true,
    });
    assert.equal(partyAgain.party_power, party.party_power);

    await assert.rejects(
      () => evaluatePartyStrength({ character_id: 999999999 }),
      /No active characters|not found/i
    );
  });

  await t.test('scaling engine preserves story intent, prefers variants, protects solo, and validates beats', async () => {
    const soloRusk = await previewEncounter('shrine-rusk-confrontation', {
      campaign_id: fixture.campaign_id,
      character_id: fixture.characters[0].character_id,
    });
    assert.equal(soloRusk.selected_variant.variant_id, 'solo');
    assert.equal(soloRusk.final_enemies.length, 1);
    assert.equal(soloRusk.final_enemies[0].entity_slug, 'rusk-bandit');
    assert.equal(soloRusk.solo_safety.solo_context, true);
    assert.equal(soloRusk.async_beat_validation.expected_beat_range.max, 6);
    assert.ok(soloRusk.scaling_actions.some((entry) => entry.method === 'variant_selection'));

    const partyRusk = await previewEncounter('shrine-rusk-confrontation', {
      campaign_id: fixture.campaign_id,
      use_party: true,
      party: true,
    });
    assert.ok(['small-party', 'full-party'].includes(partyRusk.selected_variant.variant_id));
    assert.ok(partyRusk.final_enemies.some((enemy) => enemy.entity_slug === 'bandit-lackey'));
    assert.ok(partyRusk.difficulty.party_power > soloRusk.difficulty.party_power);

    const caravan = await previewEncounter('broken-caravan-site', {
      campaign_id: fixture.campaign_id,
      character_id: fixture.characters[0].character_id,
    });
    assert.equal(caravan.encounter.scaling_enabled, false);
    assert.equal(caravan.difficulty.final_assessment, 'trivial');

    const presence = await previewEncounter('subterranean-hollow-presence', {
      campaign_id: fixture.campaign_id,
      character_id: fixture.characters[0].character_id,
    });
    assert.equal(presence.encounter.encounter_type, 'final');
    assert.equal(presence.difficulty.final_assessment, 'story');
    assert.ok(presence.warnings.some((warning) => /Story-fixed/i.test(warning)));
  });

  await t.test('equivalent encounter rewards route through advancement and dedupe by encounter', async () => {
    const before = await query(
      `SELECT experience_points FROM dnd5e_character WHERE id = $1`,
      [fixture.characters[0].character_id]
    );
    const resolved = await resolveEncounter('shrine-rusk-confrontation', {
      campaign_id: fixture.campaign_id,
      character_id: fixture.characters[0].character_id,
      resolution_path: 'negotiation',
      reason: 'Stage 5I test negotiation resolution',
    });
    assert.equal(resolved.resolution_path, 'negotiation');
    assert.equal(resolved.reward_applied, true);
    assert.equal(resolved.reward.advancement_event.source_type, 'encounter');
    assert.equal(resolved.reward.advancement_event.metadata_json.encounter_id, 'shrine-rusk-confrontation');
    assert.equal(resolved.reward.advancement_event.metadata_json.resolution_path, 'negotiation');

    const after = await query(
      `SELECT experience_points FROM dnd5e_character WHERE id = $1`,
      [fixture.characters[0].character_id]
    );
    assert.equal(Number(after.rows[0].experience_points), Number(before.rows[0].experience_points) + 150);

    const duplicate = await resolveEncounter('shrine-rusk-confrontation', {
      campaign_id: fixture.campaign_id,
      character_id: fixture.characters[0].character_id,
      resolution_path: 'combat',
      reason: 'Stage 5I duplicate combat resolution should not double-pay',
    });
    assert.equal(duplicate.duplicate_reward, true);

    const forest = await resolveEncounter('forest-path-tension', {
      campaign_id: fixture.campaign_id,
      character_id: fixture.characters[1].character_id,
      resolution_path: 'avoidance',
      reason: 'Stage 5I non-combat avoidance resolution',
    });
    assert.equal(forest.reward.amount_granted, 50);

    await assert.rejects(
      () =>
        resolveEncounter('shrine-rusk-confrontation', {
          campaign_id: fixture.campaign_id,
          character_id: fixture.characters[1].character_id,
          resolution_path: 'dance_off',
        }),
      /resolution_path must be one of/
    );
  });
});
