import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { previewEncounter } from '../src/services/encounterService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function encounterRow(overrides = {}) {
  return {
    id: 300,
    world_id: 44,
    world_slug: 'greyvale',
    campaign_id: null,
    campaign_slug: null,
    scene_id: 12,
    scene_slug: 'shrine-ruins',
    slug: 'shrine-rusk-confrontation',
    name: 'Rusk at the Shrine',
    encounter_type: 'story',
    difficulty_intent: 'hard',
    scaling_enabled: true,
    story_fixed_by_default: true,
    explicit_story_scaling: true,
    allowed_scaling_methods_json: ['variant_selection', 'enemy_count'],
    disallowed_scaling_methods_json: ['stat_tweak', 'large_stat_scaling'],
    party_size_min: 1,
    party_size_max: 4,
    level_min: 1,
    level_max: 3,
    async_beat_min: 4,
    async_beat_max: 6,
    base_variant: 'solo',
    variants_json: [
      {
        variant_id: 'solo',
        party_size_range: { min: 1, max: 1 },
        level_range: { min: 1, max: 3 },
        enemies: [
          {
            entity_slug: 'rusk-bandit',
            entity_type: 'npc_template',
            count: 1,
            min_count: 1,
            max_count: 1,
            base_power: 1.4,
            action_economy_weight: 1,
            scalable: false,
          },
        ],
      },
      {
        variant_id: 'full-party',
        party_size_range: { min: 4, max: 4 },
        level_range: { min: 1, max: 3 },
        enemies: [
          {
            entity_slug: 'rusk-bandit',
            entity_type: 'npc_template',
            count: 1,
            min_count: 1,
            max_count: 1,
            base_power: 1.4,
            action_economy_weight: 1,
            scalable: false,
          },
          {
            entity_slug: 'bandit-lackey',
            entity_type: 'npc_template',
            count: 2,
            min_count: 1,
            max_count: 2,
            base_power: 0.5,
            action_economy_weight: 0.75,
            scalable: true,
          },
        ],
      },
    ],
    resolution_paths_json: ['combat', 'intimidation', 'negotiation', 'escape', 'fail_forward'],
    reward_value_json: {
      xp: 150,
      grant_on_resolution: true,
      equivalent_across_paths: true,
    },
    fail_forward: true,
    metadata_json: { solo_guidance: 'Do not add lackeys for solo play.' },
    is_active: true,
    created_at: '2026-06-16T00:00:00.000Z',
    updated_at: '2026-06-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeEncounterExecutor({ characterRows }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM dnd5e_campaign context_campaign')) {
        return { rows: [encounterRow()] };
      }
      if (sql.includes('FROM dnd5e_character character')) {
        return { rows: characterRows };
      }
      if (sql.includes('FROM dnd5e_npc npc')) {
        return {
          rows: [
            {
              entity_type: 'npc',
              entity_id: 22,
              entity_slug: params[0],
              name: params[0] === 'rusk-bandit' ? 'Rusk' : 'Bandit Lackey',
              stat_block_id: params[0] === 'rusk-bandit' ? 7 : 8,
              stat_block_name: params[0] === 'rusk-bandit' ? 'Rusk Bandit' : 'Bandit Lackey',
              challenge_rating: params[0] === 'rusk-bandit' ? 0.25 : 0.125,
              xp_value: params[0] === 'rusk-bandit' ? 50 : 25,
              hit_point_max: params[0] === 'rusk-bandit' ? 18 : 9,
              armor_class: params[0] === 'rusk-bandit' ? 14 : 12,
            },
          ],
        };
      }
      if (sql.includes('FROM dnd5e_world_entity') || sql.includes('FROM dnd5e_monster')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected encounter query: ${sql}`);
    },
  };
}

test('6D.2 encounter preview selects the authored solo-safe Rusk variant deterministically', async () => {
  const executor = makeEncounterExecutor({
    characterRows: [
      {
        id: 9,
        name: 'Avery',
        level: 2,
        pending_level_count: 0,
        level_up_available: false,
        is_active: true,
      },
    ],
  });

  const preview = await previewEncounter(
    'shrine-rusk-confrontation',
    { campaign_id: 7, character_id: 9 },
    executor
  );

  assert.equal(preview.encounter.slug, 'shrine-rusk-confrontation');
  assert.equal(preview.party_strength.context, 'solo');
  assert.equal(preview.party_strength.solo_context, true);
  assert.equal(preview.selected_variant.variant_id, 'solo');
  assert.deepEqual(preview.final_enemies.map((enemy) => enemy.entity_slug), ['rusk-bandit']);
  assert.equal(preview.final_enemies[0].count, 1);
  assert.equal(preview.reward_plan.reward_value.xp, 150);
  assert.equal(preview.reward_plan.equivalent_across_paths, true);
  assert.ok(preview.scaling_actions.some((action) => action.method === 'variant_selection'));
});

test('6D.2 Rusk legacy assets define encounter, hook, dialogue endpoint, and reward paths without activating combat', () => {
  const encounterPath = path.join(
    repoRoot,
    'content',
    'campaigns',
    'shadows_grey_road',
    'encounters',
    'grey-road-encounters.json'
  );
  const hookPath = path.join(
    repoRoot,
    'content',
    'campaigns',
    'shadows_grey_road',
    'hooks',
    'grey-road-shrine-combat-resolution.json'
  );
  const dialoguePath = path.join(
    repoRoot,
    'content',
    'dialogue',
    'greyvale',
    'rusk-at-the-shrine.json'
  );

  const encounters = JSON.parse(fs.readFileSync(encounterPath, 'utf8'));
  const hook = JSON.parse(fs.readFileSync(hookPath, 'utf8'));
  const dialogue = JSON.parse(fs.readFileSync(dialoguePath, 'utf8'));
  const rusk = encounters.find((entry) => entry.encounter_id === 'shrine-rusk-confrontation');

  assert.ok(rusk);
  assert.equal(rusk.base_variant, 'solo');
  assert.deepEqual(rusk.resolution_paths, [
    'combat',
    'intimidation',
    'negotiation',
    'escape',
    'fail_forward',
  ]);
  assert.equal(rusk.reward_value.equivalent_across_paths, true);
  assert.ok(rusk.variants.some((variant) => variant.variant_id === 'solo'));
  assert.equal(hook.hook_point, 'combat_end');
  assert.equal(hook.scene_slug, 'shrine-ruins');
  assert.equal(hook.effects.character_flags.surface_threat_resolved, true);
  assert.equal(dialogue.slug, 'rusk-at-the-shrine');
  assert.ok(
    dialogue.nodes.some((node) => node.slug === 'rusk-fight' && node.is_terminal === true),
    'Rusk dialogue currently stops at a terminal combat-ready node rather than starting combat'
  );
});
