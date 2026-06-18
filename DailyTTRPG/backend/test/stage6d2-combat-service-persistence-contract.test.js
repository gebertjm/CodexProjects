import assert from 'node:assert/strict';
import test from 'node:test';

import { findActiveCombatForCharacter } from '../src/services/combatService.js';
import {
  insertCombatActionLogQuery,
  insertCombatParticipantQuery,
  insertCombatQuery,
  selectActionIdByNameQuery,
  selectCombatActionLogsByCombatQuery,
  selectCombatConditionsByCombatQuery,
  selectCombatParticipantsByCombatQuery,
  selectCombatByIdQuery,
  updateCharacterHitPointStateQuery,
  updateCombatParticipantStateQuery,
  updateCombatStateQuery,
  upsertCampaignNpcCombatStateQuery,
} from '../src/db/queries/combat.js';
import { selectActiveCombatByCampaignAndCharacterQuery } from '../src/db/queries/adventureRuntime.js';
import {
  selectActionByIdQuery,
  selectActionDamagesByActionIdsQuery,
  selectActionEffectsByActionIdsQuery,
  selectActionRequirementsByActionIdsQuery,
  selectStatBlockActionsQuery,
} from '../src/db/queries/statBlocks.js';

function makeExecutor(responses) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const next = responses.shift();
      if (!next) {
        throw new Error(`Unexpected query: ${sql}`);
      }
      assert.equal(sql, next.sql);
      if (next.params) {
        assert.deepEqual(params, next.params);
      }
      return { rows: next.rows ?? [] };
    },
  };
}

function combatRow(overrides = {}) {
  return {
    id: 55,
    campaign_id: 7,
    campaign_name: 'Test Campaign',
    scene_id: 3,
    scene_key: 'test-scene',
    scene_name: 'Test Scene',
    event_id: null,
    event_prompt_text: null,
    event_template_key: null,
    event_template_name: null,
    status: 'active',
    round_number: 2,
    current_turn_index: 1,
    current_participant_id: 102,
    current_participant_name: 'Rusk',
    visibility_mode: 'debug',
    auto_advance_turns: true,
    created_by_account_id: 99,
    outcome_faction: null,
    outcome_summary: null,
    result_json: null,
    created_at: '2026-06-16T00:00:00.000Z',
    updated_at: '2026-06-16T00:01:00.000Z',
    resolved_at: null,
    ...overrides,
  };
}

function participantRow(overrides = {}) {
  return {
    id: 101,
    combat_id: 55,
    entity_type: 'character',
    entity_id: 9,
    stat_block_id: null,
    display_name: 'Avery',
    initiative: 15,
    turn_order: 1,
    current_hp: 8,
    max_hp: 12,
    temporary_hp: 2,
    armor_class: 15,
    faction: 'player',
    control_mode: 'manual',
    is_active: true,
    is_defeated: false,
    notes: null,
    created_at: '2026-06-16T00:00:00.000Z',
    updated_at: '2026-06-16T00:01:00.000Z',
    stat_block_name: null,
    challenge_rating: null,
    xp_value: null,
    monster_key: null,
    monster_name: null,
    npc_key: null,
    npc_name: null,
    character_name: 'Avery',
    ...overrides,
  };
}

test('6D.2 active combat lookup reloads combat participants logs and conditions through persistence queries', async () => {
  const executor = makeExecutor([
    {
      sql: selectActiveCombatByCampaignAndCharacterQuery,
      params: [7, 9],
      rows: [{ id: 55 }],
    },
    {
      sql: selectCombatByIdQuery,
      params: [55],
      rows: [combatRow()],
    },
    {
      sql: selectCombatParticipantsByCombatQuery,
      params: [55],
      rows: [
        participantRow(),
        participantRow({
          id: 102,
          entity_type: 'npc',
          entity_id: 22,
          stat_block_id: 4,
          display_name: 'Rusk',
          turn_order: 2,
          faction: 'enemy',
          control_mode: 'ai',
          current_hp: 10,
          max_hp: 18,
          temporary_hp: 0,
          armor_class: 14,
          stat_block_name: 'Bandit',
          challenge_rating: 0.125,
          xp_value: 25,
          npc_key: 'rusk-bandit',
          npc_name: 'Rusk',
          character_name: null,
        }),
      ],
    },
    {
      sql: selectCombatActionLogsByCombatQuery,
      params: [55],
      rows: [
        {
          id: 501,
          combat_id: 55,
          participant_id: 101,
          participant_name: 'Avery',
          action_id: 10,
          action_name: 'Training Strike',
          command_type: 'attack',
          round_number: 1,
          turn_index: 0,
          target_metadata_json: { targets: [{ participant_id: 102 }] },
          result_summary: 'Training Strike hits for 7 damage',
          narrative_text: 'Avery strikes Rusk.',
          mechanical_detail_json: { attack: { attack_roll: 16 } },
          created_at: '2026-06-16T00:02:00.000Z',
        },
      ],
    },
    {
      sql: selectCombatConditionsByCombatQuery,
      params: [55],
      rows: [
        {
          id: 701,
          combat_participant_id: 102,
          condition_type: 'prone',
          source: 'test',
          duration_type: 'rounds',
          duration_value: 1,
          notes: 'legacy condition row',
          created_at: '2026-06-16T00:02:30.000Z',
        },
      ],
    },
    {
      sql: selectActionIdByNameQuery,
      params: ['Character Basic Strike'],
      rows: [{ id: 900 }],
    },
    {
      sql: selectActionByIdQuery,
      params: [900],
      rows: [
        {
          id: 900,
          name: 'Character Basic Strike',
          action_type: 'attack',
          description: 'A simple weapon strike.',
          requires_attack_roll: true,
          range_type: 'melee',
          range_normal: 5,
          range_max: null,
          saving_throw_ability: null,
          saving_throw_dc: null,
          created_at: '2026-06-16T00:00:00.000Z',
          updated_at: '2026-06-16T00:00:00.000Z',
        },
      ],
    },
    {
      sql: selectActionDamagesByActionIdsQuery,
      params: [[900]],
      rows: [],
    },
    {
      sql: selectActionRequirementsByActionIdsQuery,
      params: [[900]],
      rows: [],
    },
    {
      sql: selectActionEffectsByActionIdsQuery,
      params: [[900]],
      rows: [],
    },
    {
      sql: selectStatBlockActionsQuery,
      params: [4],
      rows: [
        {
          stat_block_action_id: 901,
          display_order: 1,
          id: 901,
          name: 'Bandit Scimitar',
          action_type: 'attack',
          description: 'A curved blade attack.',
          requires_attack_roll: true,
          range_type: 'melee',
          range_normal: 5,
          range_max: null,
          saving_throw_ability: null,
          saving_throw_dc: null,
          created_at: '2026-06-16T00:00:00.000Z',
          updated_at: '2026-06-16T00:00:00.000Z',
        },
      ],
    },
    {
      sql: selectActionDamagesByActionIdsQuery,
      params: [[901]],
      rows: [],
    },
    {
      sql: selectActionRequirementsByActionIdsQuery,
      params: [[901]],
      rows: [],
    },
    {
      sql: selectActionEffectsByActionIdsQuery,
      params: [[901]],
      rows: [],
    },
  ]);

  const combat = await findActiveCombatForCharacter(7, 9, executor);

  assert.equal(combat.id, 55);
  assert.equal(combat.status, 'active');
  assert.equal(combat.current_participant.id, 102);
  assert.equal(combat.participants.length, 2);
  assert.equal(combat.participants[0].temporary_hp, 2);
  assert.equal(combat.participants[1].stat_block.xp_value, 25);
  assert.equal(combat.action_log[0].mechanical_detail_json.attack.attack_roll, 16);
  assert.equal(combat.conditions[0].condition_type, 'prone');
  assert.equal(executor.calls.length, 14);
});

test('6D.2 combat persistence queries cover creation participants turns logs HP persistence and outcome state', () => {
  const creationSql = `${insertCombatQuery}\n${insertCombatParticipantQuery}`;
  assert.match(creationSql, /INSERT INTO dnd5e_combat/);
  assert.match(creationSql, /campaign_id/);
  assert.match(creationSql, /scene_id/);
  assert.match(creationSql, /status/);
  assert.match(creationSql, /round_number/);
  assert.match(creationSql, /current_turn_index/);
  assert.match(creationSql, /current_participant_id/);
  assert.match(creationSql, /visibility_mode/);
  assert.match(creationSql, /auto_advance_turns/);
  assert.match(creationSql, /INSERT INTO dnd5e_combat_participant/);
  assert.match(creationSql, /entity_type/);
  assert.match(creationSql, /entity_id/);
  assert.match(creationSql, /faction/);
  assert.match(creationSql, /control_mode/);
  assert.match(creationSql, /temporary_hp/);
  assert.match(creationSql, /is_defeated/);

  assert.match(updateCombatStateQuery, /outcome_faction/);
  assert.match(updateCombatStateQuery, /outcome_summary/);
  assert.match(updateCombatStateQuery, /result_json/);
  assert.match(updateCombatStateQuery, /resolved_at/);
  assert.match(updateCombatParticipantStateQuery, /temporary_hp/);
  assert.match(updateCharacterHitPointStateQuery, /temporary_hit_points/);
  assert.match(upsertCampaignNpcCombatStateQuery, /dnd5e_campaign_npc_state/);

  assert.match(insertCombatActionLogQuery, /round_number/);
  assert.match(insertCombatActionLogQuery, /turn_index/);
  assert.match(insertCombatActionLogQuery, /target_metadata_json/);
  assert.match(insertCombatActionLogQuery, /mechanical_detail_json/);
  assert.match(selectCombatActionLogsByCombatQuery, /ORDER BY log\.created_at ASC, log\.id ASC/);
});
