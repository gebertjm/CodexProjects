import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeResolvedActionInput } from '../src/services/adventureRuntimeService.js';
import { resolveActionIntent } from '../src/services/actionComposerService.js';
import { actionInputFromSubmission } from '../src/services/beatAdvanceService.js';
import { mapActionWindow } from '../src/services/characterSceneViewService.js';
import {
  calculateActionWindowCloseAt,
  isActionWindowOpenForPlayer,
  normalizeWebRuntimeConfig,
} from '../src/services/beatWindowTimingService.js';

const sceneView = {
  visible_affordances: [
    {
      affordance_id: 'npc:npc_innkeeper_tomas',
      label: 'the innkeeper',
      aliases: ['innkeeper', 'tomas'],
      type: 'npc',
      state: 'available',
      actions: ['observe', 'talk'],
      dialogue_scene_id: 'greyvale_tomas_roadside_worries_dialogue',
      dialogue_title: "Tomas Rell and the Road's Pattern",
    },
    {
      affordance_id: 'npc:npc_elira_survivor',
      label: 'a shaken woman',
      aliases: ['shaken woman', 'survivor'],
      type: 'npc',
      state: 'available',
      actions: ['observe', 'talk'],
      dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
      dialogue_title: 'A Memory By The Hearth',
    },
    {
      affordance_id: 'torn_caravan_sash',
      label: 'torn caravan sash',
      aliases: ['sash', 'caravan sash'],
      type: 'object',
      state: 'available',
      actions: ['observe', 'investigate'],
      available_actions: [
        {
          verb: 'observe',
          action_key: 'scene_interaction:sash-observe',
          interaction_id: 'sash-observe',
        },
        {
          verb: 'investigate',
          action_key: 'scene_interaction:sash-investigate',
          interaction_id: 'sash-investigate',
        },
      ],
    },
  ],
};

test('Stage 6B.5 resolver resolves natural text to visible target and verb', () => {
  const preview = resolveActionIntent(
    { raw_text: 'I ask the shaken woman what happened to the caravan.' },
    sceneView
  );

  assert.equal(preview.status, 'resolved');
  assert.equal(preview.candidate.verb, 'talk');
  assert.equal(preview.candidate.target_affordance_id, 'npc:npc_elira_survivor');
  assert.equal(preview.candidate.dialogue_scene_id, 'dialogue_elin_memory_focus_commit');
  assert.equal(preview.validation.can_submit, true);
});

test('Stage 6B.5 resolver prioritizes selected affordance and verb', () => {
  const preview = resolveActionIntent(
    {
      raw_text: 'I ask what happened.',
      selected_affordance_id: 'npc:npc_innkeeper_tomas',
      selected_verb: 'talk',
    },
    sceneView
  );

  assert.equal(preview.status, 'resolved');
  assert.equal(preview.candidate.target_label, 'the innkeeper');
  assert.equal(preview.candidate.dialogue_scene_id, 'greyvale_tomas_roadside_worries_dialogue');
});

test('Stage 6B.5 resolver asks for clarification when verb has multiple visible targets', () => {
  const preview = resolveActionIntent({ raw_text: 'Talk' }, sceneView);

  assert.equal(preview.status, 'needs_clarification');
  assert.equal(preview.options.length, 2);
  assert.deepEqual(
    preview.options.map((option) => option.target_label).sort(),
    ['a shaken woman', 'the innkeeper']
  );
});

test('Stage 6B.5 resolver detects obvious multi-action input', () => {
  const preview = resolveActionIntent(
    { raw_text: 'I question the innkeeper and inspect the torn caravan sash.' },
    sceneView
  );

  assert.equal(preview.status, 'multi_action_clarification');
  assert.equal(preview.validation.can_submit, false);
});

test('Stage 6B.5 resolver rejects forged hidden or unavailable targets', () => {
  const preview = resolveActionIntent(
    {
      raw_text: 'I open the secret shrine door.',
      selected_affordance_id: 'hidden_shrine_door',
      selected_verb: 'open',
    },
    sceneView
  );

  assert.equal(preview.status, 'invalid');
  assert.equal(preview.validation.can_submit, false);
});

test('Stage 6B.5 resolver preserves authored action metadata for runtime resolution', () => {
  const preview = resolveActionIntent(
    { raw_text: 'I inspect the torn caravan sash.' },
    sceneView
  );

  assert.equal(preview.status, 'resolved');
  assert.equal(preview.candidate.verb, 'investigate');
  assert.equal(preview.candidate.action_key, 'scene_interaction:sash-investigate');
  assert.equal(preview.candidate.interaction_id, 'sash-investigate');
});

test('Stage 6B.5 beat windows use open-until-resolution async defaults', () => {
  const runtimeConfig = normalizeWebRuntimeConfig({});
  const opensAt = '2026-05-07T14:00:00.000Z';
  const closesAt = calculateActionWindowCloseAt({
    promptAvailableAt: opensAt,
    runtimeConfig,
    defaultActionPolicy: { response_timeout_seconds: 300 },
  });

  assert.equal(runtimeConfig.action_window_policy, 'open_until_resolution');
  assert.equal(closesAt, '2026-05-08T14:00:00.000Z');
  assert.notEqual(closesAt, '2026-05-07T14:05:00.000Z');
});

test('Stage 6B.5 beat windows open immediately and lock after close time', () => {
  const window = {
    status: 'open',
    opens_at: '2026-05-07T14:00:00.000Z',
    expires_at: '2026-05-08T14:00:00.000Z',
  };

  assert.equal(isActionWindowOpenForPlayer(window, '2026-05-07T14:00:00.000Z'), true);
  assert.equal(isActionWindowOpenForPlayer(window, '2026-05-08T13:59:59.000Z'), true);
  assert.equal(isActionWindowOpenForPlayer(window, '2026-05-08T14:00:00.000Z'), false);
});

test('Stage 6B.5 daily local resolution converts to UTC deterministically', () => {
  const closesAt = calculateActionWindowCloseAt({
    promptAvailableAt: '2026-05-07T14:00:00.000Z',
    runtimeConfig: {
      daily_resolution_time_local: '09:00',
      timezone: 'America/Chicago',
    },
  });

  assert.equal(closesAt, '2026-05-08T14:00:00.000Z');
});

test('Stage 6B.5 current-scene maps the runtime default action window as current', () => {
  const mapped = mapActionWindow({
    default_action: {
      action_window: {
        id: 42,
        status: 'open',
        opens_at: '2026-05-08T02:13:15.834Z',
        expires_at: '2026-05-09T02:13:15.834Z',
      },
    },
  });

  assert.equal(mapped.action_window_id, '42');
  assert.equal(mapped.status, 'open');
  assert.equal(mapped.opens_at, '2026-05-08T02:13:15.834Z');
  assert.equal(mapped.closes_at, '2026-05-09T02:13:15.834Z');
  assert.equal(
    isActionWindowOpenForPlayer(mapped, '2026-05-08T02:13:16.000Z'),
    true
  );
});

test('Stage 6B.5 runtime action_key merge preserves authored interaction payloads', () => {
  const merged = mergeResolvedActionInput(
    {
      interaction_id: 7,
      interaction_key: 'inspect-sash',
    },
    {
      action_key: 'scene_interaction:inspect-sash',
      action_type: null,
      interaction_id: undefined,
      interaction_key: undefined,
      actor_account_id: 3,
    }
  );

  assert.equal(merged.interaction_id, 7);
  assert.equal(merged.interaction_key, 'inspect-sash');
  assert.equal(merged.action_key, 'scene_interaction:inspect-sash');
  assert.equal(merged.actor_account_id, 3);
});

test('Stage 6B.5 dev beat advance converts web scene interaction submission explicitly', () => {
  const actionInput = actionInputFromSubmission(
    {
      default_action_type: 'wait',
      suggested_action_key: 'scene_interaction:check-for-survivors',
    },
    {
      resolved_verb: 'investigate',
      target_affordance_id: 'missing_travelers_signs',
      interaction_id: '5',
      response_payload_json: {
        verb: 'investigate',
        action_key: 'scene_interaction:check-for-survivors',
        target_affordance_id: 'missing_travelers_signs',
        interaction_id: 5,
      },
    },
    9
  );

  assert.deepEqual(actionInput, {
    action_type: 'scene_interaction',
    interaction_id: 5,
    interaction_key: undefined,
    actor_account_id: 9,
  });
});

test('Stage 6B.5 dev beat advance converts web talk submission to Focus/Commit dialogue entry', () => {
  const actionInput = actionInputFromSubmission(
    {
      default_action_type: 'wait',
      suggested_action_key: null,
    },
    {
      resolved_verb: 'talk',
      target_affordance_id: 'npc:npc_elira_survivor',
      response_payload_json: {
        verb: 'talk',
        target_affordance_id: 'npc:npc_elira_survivor',
        target_label: 'a shaken woman',
        target_type: 'npc',
        dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
        dialogue_title: 'A Memory By The Hearth',
      },
    },
    9
  );

  assert.deepEqual(actionInput, {
    action_type: 'enter_dialogue_focus_commit',
    npc_key: 'npc_elira_survivor',
    dialogue_scene_id: 'dialogue_elin_memory_focus_commit',
    dialogue_title: 'A Memory By The Hearth',
    actor_account_id: 9,
  });
});
