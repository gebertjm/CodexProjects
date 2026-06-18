import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateContentPackage } from '../src/content/contentValidation.js';
import {
  getSceneContentOverlay,
  resetSceneContentOverlayCacheForTests,
} from '../src/services/sceneContentOverlayService.js';
import {
  buildActionComposerModel,
  buildSceneReference,
  composeSceneNarration,
} from '../src/services/sceneNarrationComposer.js';
import {
  findFreeFocusOverlap,
  getExplorationInteractionDefinitions,
} from '../src/services/freeFocusService.js';
import { actionInputFromSubmission } from '../src/services/beatAdvanceService.js';
import { buildPlayerBeatResultDraft } from '../src/services/playerBeatResultService.js';
import {
  assertActionWindowOpen,
  assertCurrentScene,
  assertPlayerPayloadSafe,
  buildExplorationInteractionContext,
  enterExplorationScene,
  getCurrentPlayerReadModel,
} from './interaction-core/sharedPathHarness.js';

function baseSections(overrides = {}) {
  return {
    world: [
      {
        slug: 'test-world',
        name: 'Test World',
        status: 'active',
      },
    ],
    regionTemplates: [],
    locationTemplates: [],
    sceneTemplates: [],
    campaigns: [],
    regions: [],
    locations: [
      {
        slug: 'test-location',
        name: 'Test Location',
        region_slug: 'test-region',
      },
    ],
    scenes: [],
    sceneTransitions: [],
    npcTemplates: [],
    worldEntities: [],
    encounterTemplates: [],
    knowledgeDefinitions: [],
    environmentFlavorEntries: [],
    environmentModifiers: [],
    sceneAffordances: [],
    quests: [],
    interactions: [],
    dialogues: [],
    eventTemplates: [],
    contentHooks: [],
    campaignLocationStates: [],
    campaignSceneStates: [],
    ...overrides,
  };
}

function validateScene(scene) {
  return validateContentPackage({
    packagePath: 'unit-test',
    manifest: {},
    loadOrder: [],
    filesProcessed: [],
    sections: baseSections({ scenes: [scene] }),
  });
}

const playtestReadyNarration = {
  version: 1,
  base: ['You stand in a rain-darkened roadside scene.'],
  sensory: ['Cold rain beads on your cloak.'],
  opportunity_variants: {
    subtle: ['The mud holds more shape than the road wants to keep.'],
    soft_explicit: ['A closer look at the roadside might narrow the truth.'],
  },
};

const baseScene = {
  slug: 'roadside-scene',
  name: 'Roadside Scene',
  location_slug: 'test-location',
  description: 'Legacy fallback scene text.',
};

test('Stage 6B.9 legacy scenes still validate without Surface/Focus/Commit fields', () => {
  const result = validateScene(baseScene);

  assert.equal(result.ok, true);
  assert.equal(result.sections.scenes[0].narration_tier, 'legacy');
  assert.deepEqual(result.sections.scenes[0].free_focus, []);
});

test('Stage 6B.9 playtest-ready Free Focus requires authored reachable outcomes', () => {
  const missingFailure = validateScene({
    ...baseScene,
    narration: playtestReadyNarration,
    free_focus: [
      {
        interaction_id: 'focus_tracks',
        target_id: 'muddy_tracks',
        label: 'Muddy tracks',
        resolution_mode: 'free_focus',
        requires_check: true,
        check: { skill: 'survival', dc: 13, visibility: 'visible' },
        on_success: { narration: 'The tracks are fresh.' },
      },
    ],
  });

  assert.equal(missingFailure.ok, false);
  assert.ok(
    missingFailure.errors.some((error) =>
      error.includes('free_focus[0].on_failure.narration is required')
    )
  );

  const valid = validateScene({
    ...baseScene,
    narration: playtestReadyNarration,
    free_focus: [
      {
        interaction_id: 'focus_tracks',
        target_id: 'muddy_tracks',
        label: 'Muddy tracks',
        resolution_mode: 'free_focus',
        requires_check: true,
        check: { skill: 'survival', dc: 13, visibility: 'visible' },
        on_success: { narration: 'The tracks are fresh.' },
        on_failure: { narration: 'The obvious tracks still lead toward the trees.' },
      },
    ],
    beat_actions: [
      {
        interaction_id: 'follow_tracks',
        target_id: 'muddy_tracks',
        resolution_mode: 'beat_action',
        beat_action_type: 'track',
      },
    ],
  });

  assert.equal(valid.ok, true);
});

test('Stage 6B.9 validation rejects invalid check visibility and follow-up resolution', () => {
  const result = validateScene({
    ...baseScene,
    narration: playtestReadyNarration,
    free_focus: [
      {
        interaction_id: 'focus_axle',
        target_id: 'broken_axle',
        label: 'Broken axle',
        resolution_mode: 'free_focus',
        check: { skill: 'investigation', dc: 12, visibility: 'loudly' },
        on_success: { narration: 'The axle was cut.' },
        on_failure: { narration: 'The axle is plainly broken.' },
        committed_followup: { check_resolution: 'reroll_forever' },
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('check.visibility must be one of')));
  assert.ok(
    result.errors.some((error) =>
      error.includes('committed_followup.check_resolution must be one of')
    )
  );
});

test('Stage 6B.9 interaction definitions normalize authored Surface/Focus/Commit layers', () => {
  const definitions = getExplorationInteractionDefinitions({
    interaction_model: 'surface_focus_commit',
    automatic_observations: [{ interaction_id: 'observe_bridge' }],
    passive_discoveries: [{ interaction_id: 'notice_tracks' }],
    free_focus: [{ interaction_id: 'focus_tracks' }],
    beat_actions: [{ interaction_id: 'follow_tracks', resolution_mode: 'beat_action' }],
  });

  assert.equal(definitions.interaction_model, 'surface_focus_commit');
  assert.equal(definitions.automatic_observations.length, 1);
  assert.equal(definitions.passive_discoveries.length, 1);
  assert.equal(definitions.free_focus.length, 1);
  assert.equal(definitions.beat_actions.length, 1);
});

test('Stage 6B.9 scene overlays load from explicit production content root', async () => {
  const previousContentRoot = process.env.CONTENT_ROOT;
  const previousSceneRoot = process.env.CONTENT_SCENE_ROOT;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dailyrpg-content-root-'));
  const tempSceneRoot = path.join(tempRoot, 'scenes', 'playtest');

  try {
    fs.mkdirSync(tempSceneRoot, { recursive: true });
    fs.writeFileSync(
      path.join(tempSceneRoot, 'scene.json'),
      JSON.stringify({
        slug: 'content-root-test-scene',
        free_focus: [
          {
            interaction_id: 'focus_test_detail',
            target_id: 'test_detail',
            label: 'Test detail',
            resolution_mode: 'free_focus',
            result: { narration: 'A test detail is visible.' },
          },
        ],
      })
    );
    process.env.CONTENT_ROOT = tempRoot;
    delete process.env.CONTENT_SCENE_ROOT;
    resetSceneContentOverlayCacheForTests();

    const overlay = await getSceneContentOverlay({ key: 'content-root-test-scene' });

    assert.equal(overlay.slug, 'content-root-test-scene');
    assert.equal(overlay.free_focus.length, 1);
    assert.equal(overlay.free_focus[0].interaction_id, 'focus_test_detail');
  } finally {
    if (previousContentRoot === undefined) {
      delete process.env.CONTENT_ROOT;
    } else {
      process.env.CONTENT_ROOT = previousContentRoot;
    }
    if (previousSceneRoot === undefined) {
      delete process.env.CONTENT_SCENE_ROOT;
    } else {
      process.env.CONTENT_SCENE_ROOT = previousSceneRoot;
    }
    resetSceneContentOverlayCacheForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Stage 6B.9 upgraded scene overlays override legacy duplicate scene files', async () => {
  const previousContentRoot = process.env.CONTENT_ROOT;
  const previousSceneRoot = process.env.CONTENT_SCENE_ROOT;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dailyrpg-content-root-'));
  const tempSceneRoot = path.join(tempRoot, 'scenes', 'playtest');

  try {
    fs.mkdirSync(tempSceneRoot, { recursive: true });
    fs.writeFileSync(
      path.join(tempSceneRoot, 'legacy-scenes.json'),
      JSON.stringify({
        slug: 'duplicate-scene',
        description: 'Legacy description without closer looks.',
      })
    );
    fs.writeFileSync(
      path.join(tempSceneRoot, 'scenes.json'),
      JSON.stringify({
        slug: 'duplicate-scene',
        free_focus: [
          {
            interaction_id: 'focus_upgraded_detail',
            target_id: 'upgraded_detail',
            label: 'Upgraded detail',
            resolution_mode: 'free_focus',
            result: { narration: 'The upgraded detail is visible.' },
          },
        ],
      })
    );
    process.env.CONTENT_ROOT = tempRoot;
    delete process.env.CONTENT_SCENE_ROOT;
    resetSceneContentOverlayCacheForTests();

    const overlay = await getSceneContentOverlay({ key: 'duplicate-scene' });

    assert.equal(overlay.free_focus.length, 1);
    assert.equal(overlay.free_focus[0].interaction_id, 'focus_upgraded_detail');
  } finally {
    if (previousContentRoot === undefined) {
      delete process.env.CONTENT_ROOT;
    } else {
      process.env.CONTENT_ROOT = previousContentRoot;
    }
    if (previousSceneRoot === undefined) {
      delete process.env.CONTENT_SCENE_ROOT;
    } else {
      process.env.CONTENT_SCENE_ROOT = previousSceneRoot;
    }
    resetSceneContentOverlayCacheForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Stage 6B.9 narration includes surface and passive discoveries without menu language', () => {
  const harnessState = enterExplorationScene({ currentSceneId: 'roadside-scene' });
  const narration = composeSceneNarration({
    scene: {
      scene_id: 'scene-1',
      key: 'roadside-scene',
      title: 'Roadside Scene',
      description: 'You stand beside the road.',
    },
    campaign: { campaign_instance_id: 'camp-1' },
    environment: { summary: 'Morning · Rain · Autumn · Uneasy' },
    visibleNpcs: [],
    visibleAffordances: [
      {
        affordance_id: 'muddy_tracks',
        label: 'muddy tracks',
        type: 'object',
        state: 'available',
      },
    ],
    automaticObservations: [
      {
        kind: 'automatic_observation',
        text: 'The bridge is gone, leaving only wet stone footings.',
      },
    ],
    passiveDiscoveries: [
      {
        kind: 'passive_discovery',
        text: 'Your Passive Perception catches one deep print near the ditch.',
      },
    ],
    now: new Date('2026-05-18T12:00:00Z'),
  });
  const text = narration.paragraphs.map((paragraph) => paragraph.text).join(' ');

  assert.match(text, /bridge is gone/i);
  assert.match(text, /Passive Perception catches/i);
  assert.doesNotMatch(text, /Possible actions include|Would you like to|You can/i);
  assertPlayerPayloadSafe(narration);
  assertCurrentScene(getCurrentPlayerReadModel(harnessState), 'roadside-scene');
  assertActionWindowOpen(getCurrentPlayerReadModel(harnessState));
});

test('Stage 6B.9 scene reference exposes Closer Looks while keeping target lists verb-free', () => {
  const context = buildExplorationInteractionContext({ currentSceneId: 'roadside-scene' });
  const reference = buildSceneReference({
    visibleNpcs: [
      {
        npc_id: 'unknown-witness',
        display_name: 'a shaken woman',
        activity_text: 'sits by the hearth.',
      },
    ],
    visibleAffordances: [
      {
        affordance_id: 'muddy_tracks',
        label: 'muddy tracks',
        type: 'object',
        description: 'Fresh mud near the road.',
      },
    ],
    closerLooks: [
      {
        interaction_id: 'focus_tracks',
        target_id: 'muddy_tracks',
        label: 'Muddy tracks',
        status: 'unopened',
        is_available: true,
      },
    ],
  });
  const composer = buildActionComposerModel(reference);

  assert.equal(reference.closer_looks.length, 1);
  assert.equal(reference.closer_looks[0].label, 'Muddy tracks');
  assert.equal(reference.action_targets.some((target) => /inspect|talk to/i.test(target.label)), false);
  assert.equal(composer.target_chips.some((chip) => /inspect|talk to/i.test(chip.label)), false);
  assert.equal(context.interaction_domain, 'exploration');
});

test('Stage 6B.9 action preview overlap blocks shallow beat actions with follow-up choices', () => {
  const preview = {
    status: 'resolved',
    candidate: {
      target_affordance_id: 'muddy_tracks',
      target_label: 'muddy tracks',
    },
  };
  const overlap = findFreeFocusOverlap({
    rawText: 'I inspect the muddy tracks.',
    selectedAffordanceId: null,
    preview,
    closerLooks: [
      {
        interaction_id: 'focus_tracks',
        target_id: 'muddy_tracks',
        label: 'Muddy tracks',
        is_available: true,
        is_viewed: false,
        committed_followup: { check_resolution: 'advantage' },
      },
    ],
  });

  assert.equal(overlap.interaction_id, 'focus_tracks');
  assert.equal(overlap.check_resolution, 'advantage');
  assert.deepEqual(overlap.options, [
    'open_closer_look',
    'continue_as_beat_action',
    'edit_action',
  ]);
  assert.match(overlap.message, /does not spend your beat/i);

  const viewedOverlap = findFreeFocusOverlap({
    rawText: 'I inspect the muddy tracks again.',
    selectedAffordanceId: null,
    preview,
    closerLooks: [
      {
        interaction_id: 'focus_tracks',
        target_id: 'muddy_tracks',
        label: 'Muddy tracks',
        is_available: true,
        is_viewed: true,
        committed_followup: { check_resolution: 'advantage' },
      },
    ],
  });
  assert.equal(viewedOverlap.interaction_id, 'focus_tracks');
  assert.equal(viewedOverlap.is_viewed, true);
  assert.match(viewedOverlap.message, /committed action/i);
});

test('Stage 6B.9 action preview overlap can catch shallow Free Focus text before normal resolver succeeds', () => {
  const overlap = findFreeFocusOverlap({
    rawText: 'I focus on the woman near the hearth.',
    selectedAffordanceId: null,
    preview: {
      status: 'invalid',
      message: 'That action does not seem available from here.',
    },
    closerLooks: [
      {
        interaction_id: 'focus_woman_near_hearth',
        target_id: 'woman_near_hearth',
        label: 'woman near the hearth',
        aliases: ['shaken woman'],
        is_available: true,
        is_viewed: false,
        committed_followup: { check_resolution: 'standard', beat_action_type: 'social' },
      },
    ],
  });

  assert.equal(overlap.interaction_id, 'focus_woman_near_hearth');
  assert.equal(overlap.check_resolution, 'standard');
  assert.match(overlap.message, /standard check/i);
});

test('Stage 6B.9 committed Free Focus follow-up advances through a supported runtime action', () => {
  const actionInput = actionInputFromSubmission(
    { default_action_type: 'wait' },
    {
      response_payload_json: {
        source: 'web_action_composer',
        raw_text: 'I focus on the woman near the hearth.',
        verb: 'social',
        target_affordance_id: 'woman_near_hearth',
        target_label: 'woman near the hearth',
        committed_followup: {
          source_interaction_id: 'focus_woman_near_hearth',
          target_id: 'woman_near_hearth',
          target_label: 'woman near the hearth',
          check_resolution: 'standard',
          beat_action_type: 'social',
        },
      },
    },
    42
  );

  assert.equal(actionInput.action_type, 'free_focus_followup');
  assert.equal(actionInput.actor_account_id, 42);
  assert.equal(actionInput.committed_followup.source_interaction_id, 'focus_woman_near_hearth');
  assert.equal(actionInput.committed_followup.check_resolution, 'standard');
});

test('Stage 6B.9 committed Free Focus follow-up preserves concrete runtime actions when available', () => {
  const actionInput = actionInputFromSubmission(
    { default_action_type: 'wait' },
    {
      response_payload_json: {
        raw_text: 'I question the woman near the hearth.',
        verb: 'talk',
        target_affordance_id: 'woman_near_hearth',
        target_label: 'woman near the hearth',
        transition_id: 'speak-with-elin',
        committed_followup: {
          source_interaction_id: 'focus_woman_near_hearth',
          target_id: 'woman_near_hearth',
          target_label: 'woman near the hearth',
          check_resolution: 'advantage',
          beat_action_type: 'social',
        },
      },
    },
    42
  );

  assert.equal(actionInput.action_type, 'move_scene');
  assert.equal(actionInput.transition_key, 'speak-with-elin');
  assert.equal(actionInput.committed_followup.check_resolution, 'advantage');
});

test('Stage 6B.9 committed Free Focus follow-up mechanics remain visible in beat result read model', () => {
  const draft = buildPlayerBeatResultDraft({
    campaignId: 1,
    characterId: 2,
    window: { id: 3, scene_id: 4, beat_number: 5 },
    submission: {
      id: 6,
      raw_text: 'I focus on the woman near the hearth.',
      resolved_verb: 'social',
      target_label: 'woman near the hearth',
    },
    resolved: {
      action: { action_type: 'free_focus_followup' },
      result: {
        narrative_text: 'You commit the beat to the woman near the hearth.',
        safe_mechanics: [
          {
            label: 'Committed follow-up',
            text: 'The beat is spent as a standard committed follow-up.',
            check_resolution: 'standard',
          },
        ],
      },
    },
  });

  assert.equal(draft.summary, 'You commit the beat to the woman near the hearth.');
  assert.equal(draft.safe_mechanics[0].label, 'Committed follow-up');
  assert.equal(draft.safe_mechanics[0].check_resolution, 'standard');
});

test('Stage 6B.9 migration preserves existing campaign log types while adding exploration events', () => {
  const sql = fs.readFileSync(
    new URL('../../db/init/032-stage-6b9-exploration-interactions.sql', import.meta.url),
    'utf8'
  );
  const requiredTypes = [
    'dialogue_started',
    'dialogue_choice',
    'dialogue_ended',
    'combat_started',
    'combat_turn_advanced',
    'combat_action',
    'combat_resolved',
    'reward_applied',
    'knowledge_discovered',
    'scene_unlocked',
    'adventure_state_updated',
    'content_hook_executed',
    'world_change_recorded',
    'world_change_propagated',
    'world_entity_changed',
    'default_action_applied',
    'catchup_generated',
    'automatic_observation',
    'passive_discovery',
    'free_focus_discovery',
    'free_focus_state_change',
  ];

  for (const type of requiredTypes) {
    assert.match(sql, new RegExp(`'${type}'`), `${type} should remain allowed`);
  }
});
