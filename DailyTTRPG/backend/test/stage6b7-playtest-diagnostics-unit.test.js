import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlaytestDiagnosticsReport,
  isAllowedPlaytestRepairAction,
} from '../src/services/playtestDiagnosticsService.js';

const baseAccount = { account_id: 1, display_name: 'Tester' };
const baseCharacter = { character_id: 2, character_name: 'Mira' };
const baseCampaign = {
  campaign_id: 3,
  campaign_name: 'Shadows on the Grey Road',
  campaign_status: 'active',
  world_instance_id: 4,
};
const baseScene = { scene_id: 5, scene_name: 'The Broken Caravan' };
const baseObjective = { objective_id: 6, objective_title: 'Witness the Aftermath' };

test('playtest diagnostics reports ok for a healthy active loop state', () => {
  const checkedAt = new Date('2026-05-14T15:00:00Z');
  const report = buildPlaytestDiagnosticsReport({
    checkedAt,
    account: baseAccount,
    character: baseCharacter,
    campaign: baseCampaign,
    currentScene: baseScene,
    currentObjective: baseObjective,
    windows: [
      {
        id: 10,
        campaign_id: 3,
        character_id: 2,
        status: 'open',
        beat_number: 2,
        opens_at: '2026-05-14T14:00:00Z',
        expires_at: '2026-05-15T14:00:00Z',
      },
    ],
    latestBeatResult: {
      id: 9,
      beat_number: 1,
      summary: 'You confirm the caravan was attacked from the treeline.',
    },
    sceneFeed: {
      recent_entries: [{ beat_result_id: '9' }],
    },
    knowledgeCount: 2,
    historyEntries: 1,
  });

  assert.equal(report.status, 'ok');
  assert.equal(report.summary.current_action_window_open_for_player, true);
  assert.equal(report.summary.latest_result_id, '9');
  assert.equal(report.errors.length, 0);
});

test('playtest diagnostics detects duplicate and future-locked action windows', () => {
  const checkedAt = new Date('2026-05-14T15:00:00Z');
  const report = buildPlaytestDiagnosticsReport({
    checkedAt,
    account: baseAccount,
    character: baseCharacter,
    campaign: baseCampaign,
    currentScene: baseScene,
    currentObjective: baseObjective,
    windows: [
      {
        id: 12,
        status: 'open',
        opens_at: '2026-05-14T18:00:00Z',
        expires_at: '2026-05-15T18:00:00Z',
      },
      {
        id: 11,
        status: 'open',
        opens_at: '2026-05-14T14:00:00Z',
        expires_at: '2026-05-15T14:00:00Z',
      },
    ],
  });

  assert.equal(report.status, 'error');
  assert.ok(report.errors.some((entry) => entry.code === 'duplicate_active_action_windows'));
  assert.ok(report.errors.some((entry) => entry.code === 'future_locked_current_action_window'));
});

test('playtest diagnostics recommends safe next-window repair after resolved beat', () => {
  const report = buildPlaytestDiagnosticsReport({
    checkedAt: new Date('2026-05-14T15:00:00Z'),
    account: baseAccount,
    character: baseCharacter,
    campaign: baseCampaign,
    currentScene: baseScene,
    currentObjective: baseObjective,
    windows: [
      {
        id: 10,
        status: 'resolved',
        beat_number: 1,
        opens_at: '2026-05-14T14:00:00Z',
        expires_at: '2026-05-15T14:00:00Z',
        resolved_at: '2026-05-14T14:30:00Z',
      },
    ],
    latestBeatResult: {
      id: 11,
      beat_number: 1,
      summary: 'The scene changes.',
    },
    sceneFeed: {
      recent_entries: [{ beat_result_id: '11' }],
    },
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warnings.some((entry) => entry.code === 'resolved_beat_without_next_action_window'));
  assert.ok(
    report.available_repair_actions.some(
      (entry) => entry.repair_action === 'create_missing_next_action_window'
    )
  );
});

test('playtest diagnostics detects missing latest scene feed entry', () => {
  const report = buildPlaytestDiagnosticsReport({
    checkedAt: new Date('2026-05-14T15:00:00Z'),
    account: baseAccount,
    character: baseCharacter,
    campaign: baseCampaign,
    currentScene: baseScene,
    currentObjective: baseObjective,
    windows: [
      {
        id: 12,
        status: 'open',
        opens_at: '2026-05-14T14:00:00Z',
        expires_at: '2026-05-15T14:00:00Z',
      },
    ],
    latestBeatResult: {
      id: 11,
      beat_number: 1,
      summary: 'A result exists.',
    },
    sceneFeed: {
      recent_entries: [],
    },
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warnings.some((entry) => entry.code === 'missing_latest_scene_feed_entry'));
  assert.ok(isAllowedPlaytestRepairAction('rebuild_scene_result_feed'));
  assert.equal(isAllowedPlaytestRepairAction('rerun_latest_beat_resolution'), false);
});

test('playtest diagnostics does not flag cross-scene latest results as missing from current feed', () => {
  const report = buildPlaytestDiagnosticsReport({
    checkedAt: new Date('2026-05-14T15:00:00Z'),
    account: baseAccount,
    character: baseCharacter,
    campaign: baseCampaign,
    currentScene: baseScene,
    currentObjective: baseObjective,
    windows: [
      {
        id: 12,
        status: 'open',
        opens_at: '2026-05-14T14:00:00Z',
        expires_at: '2026-05-15T14:00:00Z',
      },
    ],
    latestBeatResult: {
      id: 11,
      beat_number: 1,
      scene_id: '99',
      summary: 'A dialogue or transition result exists elsewhere.',
    },
    sceneFeed: {
      scene_id: '5',
      recent_entries: [],
    },
  });

  assert.equal(report.status, 'ok');
  assert.equal(
    report.warnings.some((entry) => entry.code === 'missing_latest_scene_feed_entry'),
    false
  );
});
