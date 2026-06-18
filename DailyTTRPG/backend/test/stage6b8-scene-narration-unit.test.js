import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActionComposerModel,
  buildSceneReference,
  composeSceneNarration,
} from '../src/services/sceneNarrationComposer.js';
import { mapAffordanceForCharacterPerspective } from '../src/services/characterSceneViewService.js';

const scene = {
  scene_id: 'scene-1',
  key: 'broken-caravan-site',
  title: 'The Broken Caravan',
  summary: 'A wrecked caravan blocks the Grey Road.',
  description: 'A broken caravan sits beside the road.',
};

const environment = {
  weather: 'rain',
  time_of_day: 'evening',
  season: 'autumn',
  mood_or_tone: 'uneasy',
  summary: 'Evening · Rain · Autumn · Uneasy',
};

const visibleNpcs = [
  {
    npc_id: 'elira',
    display_name: 'a shaken woman',
    activity_text: 'sits near the wagon and keeps watching the treeline.',
  },
];

const visibleAffordances = [
  {
    affordance_id: 'caravan_wreck',
    label: 'broken caravan',
    type: 'object',
    description: 'The wagon frame is split and muddy.',
    actions: ['observe', 'investigate'],
  },
  {
    affordance_id: 'road_to_inn',
    label: 'the road toward Dunmere',
    type: 'place',
    description: 'The road continues toward the nearest shelter.',
    actions: ['move'],
  },
];

test('scene narration composes safe prose from filtered scene ingredients', () => {
  const narration = composeSceneNarration({
    scene,
    campaign: { campaign_instance_id: 'camp-1' },
    environment,
    visibleNpcs,
    visibleAffordances,
    objective: { title: 'learn what happened to the caravan' },
    sceneResultFeed: { latest_result: null },
    now: new Date('2026-05-14T15:00:00Z'),
  });

  assert.equal(narration.voice, 'second_person_present');
  assert.equal(narration.mode, 'full');
  assert.ok(narration.paragraphs.length >= 4);
  assert.match(narration.paragraphs.map((entry) => entry.text).join(' '), /You stand/);
  assert.match(narration.paragraphs.map((entry) => entry.text).join(' '), /shaken woman/);
  assert.doesNotMatch(
    narration.paragraphs.map((entry) => entry.text).join(' '),
    /secret|cult|GM|debug/i
  );
});

test('scene narration reflects latest result without replacing the result card', () => {
  const narration = composeSceneNarration({
    scene,
    campaign: { campaign_instance_id: 'camp-1' },
    environment,
    visibleNpcs,
    visibleAffordances,
    sceneResultFeed: {
      latest_result: {
        beat_number: 2,
        summary: 'You find that the attack began from the treeline.',
      },
    },
    now: new Date('2026-05-14T15:00:00Z'),
  });

  assert.equal(narration.mode, 'refreshed');
  assert.ok(
    narration.paragraphs.some((entry) =>
      entry.text.includes('attack began from the treeline')
    )
  );
});

test('scene reference and action composer expose targets without verbs', () => {
  const reference = buildSceneReference({ visibleNpcs, visibleAffordances });
  const composer = buildActionComposerModel(reference);

  assert.deepEqual(reference.people_nearby.map((entry) => entry.label), ['a shaken woman']);
  assert.deepEqual(reference.visible_paths.map((entry) => entry.label), [
    'the road toward Dunmere',
  ]);
  assert.ok(reference.action_targets.some((entry) => entry.label === 'broken caravan'));
  assert.equal(reference.action_targets.some((entry) => 'actions' in entry), false);
  assert.equal(composer.target_chips.some((entry) => 'actions' in entry), false);
});

test('seeded narration is stable for identical state and can vary by beat', () => {
  const first = composeSceneNarration({
    scene,
    campaign: { campaign_instance_id: 'camp-1' },
    environment,
    visibleNpcs,
    visibleAffordances,
    sceneResultFeed: { latest_result: { beat_number: 1, summary: 'The road darkens.' } },
    now: new Date('2026-05-14T15:00:00Z'),
  });
  const second = composeSceneNarration({
    scene,
    campaign: { campaign_instance_id: 'camp-1' },
    environment,
    visibleNpcs,
    visibleAffordances,
    sceneResultFeed: { latest_result: { beat_number: 1, summary: 'The road darkens.' } },
    now: new Date('2026-05-14T15:00:00Z'),
  });
  const nextBeat = composeSceneNarration({
    scene,
    campaign: { campaign_instance_id: 'camp-1' },
    environment,
    visibleNpcs,
    visibleAffordances,
    sceneResultFeed: { latest_result: { beat_number: 2, summary: 'The road darkens.' } },
    now: new Date('2026-05-14T15:00:00Z'),
  });

  assert.deepEqual(first.paragraphs, second.paragraphs);
  assert.ok(nextBeat.paragraphs.length > 0);
});

test('scene narration normalizes complete NPC prose without doubled labels or punctuation', () => {
  const narration = composeSceneNarration({
    scene: {
      scene_id: 'scene-inn',
      key: 'grey-road-inn',
      title: 'The Grey Road Inn',
      description: 'You enter the inn.',
    },
    campaign: { campaign_instance_id: 'camp-1' },
    environment: {
      summary: 'Afternoon · Clear · Autumn · Uneasy',
    },
    visibleNpcs: [
      {
        npc_id: 'elin-harrow',
        display_name: 'a shaken woman',
        activity_text:
          'A shaken woman sits near the hearth, both hands tight around a torn caravan sash.',
      },
      {
        npc_id: 'tomas-rell',
        display_name: 'the innkeeper',
        activity_text: 'The innkeeper moves between tables, keeping one eye on the door.',
      },
    ],
    visibleAffordances: [],
    sceneResultFeed: { latest_result: null },
    now: new Date('2026-05-14T15:00:00Z'),
  });

  const text = narration.paragraphs.map((entry) => entry.text).join(' ');
  assert.doesNotMatch(text, /a shaken woman a shaken woman/i);
  assert.doesNotMatch(text, /the innkeeper the innkeeper/i);
  assert.doesNotMatch(text, /\.\./);
  assert.match(text, /a shaken woman sits near the hearth/i);
});

test('scene narration does not reintroduce NPCs already named by authored scene prose', () => {
  const narration = composeSceneNarration({
    scene: {
      scene_id: 'scene-inn-repeat',
      key: 'grey-road-inn-repeat',
      title: 'The Grey Road Inn',
      narration: {
        version: 1,
        base: [
          'The innkeeper watches the road-facing windows while a shaken woman grips a torn sash near the hearth.',
        ],
        sensory: ['Rain ticks softly against the panes.'],
        opportunity_variants: {
          subtle: [
            "The woman near the hearth and the innkeeper's habits both press against the room's silence.",
            'Every account here seems to stop just before the part that matters.',
          ],
        },
      },
    },
    campaign: { campaign_instance_id: 'camp-repeat-1' },
    environment: {},
    visibleNpcs: [
      {
        npc_id: 'tomas-rell',
        display_name: 'the innkeeper',
        activity_text: 'The innkeeper moves between tables, keeping one eye on the door.',
      },
      {
        npc_id: 'elin-harrow',
        display_name: 'a shaken woman',
        activity_text:
          'A shaken woman sits near the hearth, both hands tight around a torn caravan sash.',
      },
    ],
    npcIdentityIndex: [
      {
        npc_id: 'tomas-rell',
        display_name: 'the innkeeper',
        match_terms: ['the innkeeper', 'innkeeper', 'Tomas Rell', 'Tomas'],
      },
      {
        npc_id: 'elin-harrow',
        display_name: 'a shaken woman',
        match_terms: ['a shaken woman', 'shaken woman', 'woman near the hearth', 'survivor'],
      },
    ],
    visibleAffordances: [
      {
        affordance_id: 'low_voiced_travelers',
        label: 'low-voiced travelers',
        type: 'other',
      },
    ],
    sceneResultFeed: { latest_result: null },
    now: new Date('2026-05-14T15:00:00Z'),
  });

  const text = narration.paragraphs.map((entry) => entry.text).join(' ');
  assert.equal(narration.paragraphs.some((entry) => entry.kind === 'presence'), false);
  assert.equal((text.match(/innkeeper/gi) ?? []).length, 1);
  assert.equal((text.match(/shaken woman|woman near the hearth/gi) ?? []).length, 1);
  assert.doesNotMatch(text, /innkeeper's habits/i);
});

test('scene narration does not repeat NPCs from activity prose in focus or opportunity hints', () => {
  const narration = composeSceneNarration({
    scene: {
      scene_id: 'scene-inn-opportunity',
      key: 'grey-road-inn-opportunity',
      title: 'The Grey Road Inn',
      narration: {
        version: 1,
        base: ['The common room holds its breath under smoke-dark rafters.'],
        sensory: ['The hearth smells of peat smoke and damp wool.'],
        opportunity_variants: {
          subtle: [
            "The woman near the hearth and the innkeeper's watchful habits both deserve attention.",
            'Every account here seems to stop just before the part that matters.',
          ],
        },
      },
    },
    campaign: { campaign_instance_id: 'camp-repeat-2' },
    environment: {},
    visibleNpcs: [
      {
        npc_id: 'tomas-rell',
        display_name: 'the innkeeper',
        activity_text: 'The innkeeper moves between tables, keeping one eye on the door.',
      },
      {
        npc_id: 'elin-harrow',
        display_name: 'a shaken woman',
        activity_text:
          'A shaken woman sits near the hearth, both hands tight around a torn caravan sash.',
      },
    ],
    npcIdentityIndex: [
      {
        npc_id: 'tomas-rell',
        display_name: 'the innkeeper',
        match_terms: ['the innkeeper', 'innkeeper', 'Tomas Rell', 'Tomas'],
      },
      {
        npc_id: 'elin-harrow',
        display_name: 'a shaken woman',
        match_terms: ['a shaken woman', 'shaken woman', 'woman near the hearth', 'survivor'],
      },
    ],
    visibleAffordances: [
      {
        affordance_id: 'the_innkeeper_focus',
        label: "innkeeper's habits",
        type: 'other',
      },
      {
        affordance_id: 'room_pressure',
        label: 'room pressure',
        type: 'other',
      },
    ],
    sceneResultFeed: { latest_result: null },
    now: new Date('2026-05-14T15:00:00Z'),
  });

  const text = narration.paragraphs.map((entry) => entry.text).join(' ');
  assert.match(text, /the innkeeper moves between tables/i);
  assert.match(text, /a shaken woman sits near the hearth/i);
  assert.equal((text.match(/innkeeper/gi) ?? []).length, 1);
  assert.equal((text.match(/a shaken woman|woman near the hearth/gi) ?? []).length, 1);
  assert.doesNotMatch(text, /watchful habits/i);
});

test('scene narration allows repeated NPC mentions only when content opts in', () => {
  const narration = composeSceneNarration({
    scene: {
      scene_id: 'scene-inn-explicit-repeat',
      key: 'grey-road-inn-explicit-repeat',
      title: 'The Grey Road Inn',
      narration: {
        version: 1,
        base: ['The innkeeper watches the road-facing windows.'],
        sensory: ['Rain ticks softly against the panes.'],
        opportunity_variants: {
          subtle: ["The innkeeper's watchful habits keep pulling the room back toward the road."],
        },
        composition_notes: {
          allow_repeated_npc_mentions: true,
        },
      },
    },
    campaign: { campaign_instance_id: 'camp-repeat-3' },
    environment: {},
    visibleNpcs: [
      {
        npc_id: 'tomas-rell',
        display_name: 'the innkeeper',
        activity_text: 'The innkeeper moves between tables, keeping one eye on the door.',
      },
    ],
    npcIdentityIndex: [
      {
        npc_id: 'tomas-rell',
        display_name: 'the innkeeper',
        match_terms: ['the innkeeper', 'innkeeper', 'Tomas Rell', 'Tomas'],
      },
    ],
    visibleAffordances: [],
    sceneResultFeed: { latest_result: null },
    now: new Date('2026-05-14T15:00:00Z'),
  });

  const text = narration.paragraphs.map((entry) => entry.text).join(' ');
  assert.ok((text.match(/innkeeper/gi) ?? []).length >= 3);
});

test('runtime action opportunities map to character-safe target labels before reference rendering', () => {
  const visibleNpcsForReference = [
    {
      npc_id: 'tomas-rell',
      display_name: 'the innkeeper',
      activity_text: 'The innkeeper moves between tables.',
    },
  ];

  const safeNpcAffordance = mapAffordanceForCharacterPerspective(
    {
      affordance_id: 'talk_to_npc:tomas-rell',
      label: 'Talk to Tomas Rell',
      action_type: 'talk_to_npc',
      actions: ['talk_to_npc'],
      available_actions: [{ verb: 'talk_to_npc', action_key: 'talk_to_npc:tomas-rell' }],
      metadata: {
        payload: { npc_key: 'tomas-rell' },
        source: { type: 'npc', key: 'tomas-rell' },
      },
      state: 'available',
    },
    visibleNpcsForReference
  );
  const safePathAffordance = mapAffordanceForCharacterPerspective(
    {
      affordance_id: 'move_scene:continue-to-dunmere',
      label: 'Continue to Dunmere',
      action_type: 'move_scene',
      actions: ['move_scene'],
      available_actions: [{ verb: 'move_scene', action_key: 'move_scene:continue-to-dunmere' }],
      state: 'available',
    },
    visibleNpcsForReference
  );

  assert.equal(safeNpcAffordance.label, 'the innkeeper');
  assert.equal(safeNpcAffordance.type, 'npc');
  assert.deepEqual(safeNpcAffordance.aliases, ['the innkeeper']);
  assert.equal(JSON.stringify(safeNpcAffordance).includes('Tomas Rell'), false);
  assert.equal(safePathAffordance.label, 'Dunmere');
  assert.equal(safePathAffordance.type, 'exit');

  const reference = buildSceneReference({
    visibleNpcs: visibleNpcsForReference,
    visibleAffordances: [safeNpcAffordance, safePathAffordance],
  });
  const labels = JSON.stringify(reference);

  assert.equal(labels.includes('Talk to'), false);
  assert.equal(labels.includes('Tomas Rell'), false);
  assert.deepEqual(reference.visible_paths.map((entry) => entry.label), ['Dunmere']);
  assert.equal(
    reference.action_targets.filter((entry) => entry.label === 'the innkeeper').length,
    1
  );
});

test('scene reference preserves player-safe dialogue entry ids for visible NPCs', () => {
  const visibleNpcsForReference = [
    {
      npc_id: 'tomas-rell',
      display_name: 'the innkeeper',
      activity_text: 'The innkeeper watches the road talk gather.',
      dialogue_scene_id: 'greyvale_tomas_roadside_worries_dialogue',
      dialogue_title: "Tomas Rell and the Road's Pattern",
    },
  ];
  const safeNpcAffordance = mapAffordanceForCharacterPerspective(
    {
      affordance_id: 'npc:tomas-rell',
      label: 'Tomas Rell',
      type: 'npc',
      actions: ['observe', 'talk'],
      available_actions: [
        {
          verb: 'talk',
          action_key: 'npc:tomas-rell:talk',
          dialogue_scene_id: 'greyvale_tomas_roadside_worries_dialogue',
        },
      ],
      dialogue_scene_id: 'greyvale_tomas_roadside_worries_dialogue',
      dialogue_title: "Tomas Rell and the Road's Pattern",
      state: 'available',
    },
    visibleNpcsForReference
  );

  const reference = buildSceneReference({
    visibleNpcs: visibleNpcsForReference,
    visibleAffordances: [safeNpcAffordance],
  });

  assert.equal(reference.people_nearby[0].label, 'the innkeeper');
  assert.equal(
    reference.people_nearby[0].dialogue_scene_id,
    'greyvale_tomas_roadside_worries_dialogue'
  );
  assert.equal(
    reference.action_targets[0].dialogue_scene_id,
    'greyvale_tomas_roadside_worries_dialogue'
  );
});

test('runtime NPC opportunities without perspective data do not fall back to true names', () => {
  const safeNpcAffordance = mapAffordanceForCharacterPerspective(
    {
      affordance_id: 'talk_to_npc:secret-agent',
      label: 'Talk to Lady Mirabel Voss',
      description: 'Lady Mirabel Voss watches the room from behind a fan.',
      action_type: 'talk_to_npc',
      actions: ['talk_to_npc'],
      available_actions: [{ verb: 'talk_to_npc', action_key: 'talk_to_npc:secret-agent' }],
      metadata: {
        payload: { npc_key: 'secret-agent' },
        source: { type: 'npc', key: 'secret-agent' },
      },
      state: 'available',
    },
    []
  );

  assert.equal(safeNpcAffordance.label, 'someone nearby');
  assert.equal(safeNpcAffordance.description, null);
  assert.equal(JSON.stringify(safeNpcAffordance).includes('Mirabel'), false);
});

test('NPC aliases and public role labels normalize to the current unknown label consistently', () => {
  const visibleNpcsForReference = [
    {
      npc_id: 'elin-harrow',
      display_name: 'a shaken woman',
      activity_text: 'A shaken woman sits near the hearth.',
    },
  ];
  const npcIdentityIndex = [
    {
      npc_id: 'elin-harrow',
      display_name: 'a shaken woman',
      true_name_known: false,
      match_terms: [
        'a shaken woman',
        'the survivor',
        'survivor',
        'Elin Harrow',
        'Elira',
        'woman by the hearth',
      ],
    },
  ];

  const transitionAffordance = mapAffordanceForCharacterPerspective(
    {
      affordance_id: 'move_scene:speak-with-elin',
      label: 'Speak with the survivor',
      description: 'Step away from the common room and speak with the shaken survivor.',
      action_type: 'move_scene',
      actions: ['move_scene'],
      available_actions: [{ verb: 'move_scene', action_key: 'move_scene:speak-with-elin' }],
      state: 'available',
    },
    visibleNpcsForReference,
    npcIdentityIndex
  );
  const trueNameAffordance = mapAffordanceForCharacterPerspective(
    {
      affordance_id: 'talk_to_npc:elin-harrow',
      label: 'Talk to Elin Harrow',
      action_type: 'talk_to_npc',
      actions: ['talk_to_npc'],
      available_actions: [{ verb: 'talk_to_npc', action_key: 'talk_to_npc:elin-harrow' }],
      metadata: { payload: { npc_key: 'elin-harrow' } },
      state: 'available',
    },
    visibleNpcsForReference,
    npcIdentityIndex
  );

  assert.equal(transitionAffordance.label, 'a shaken woman');
  assert.equal(transitionAffordance.type, 'npc');
  assert.equal(transitionAffordance.description, 'A shaken woman sits near the hearth.');
  assert.equal(trueNameAffordance.label, 'a shaken woman');
  assert.equal(JSON.stringify([transitionAffordance, trueNameAffordance]).includes('survivor'), false);
  assert.equal(JSON.stringify([transitionAffordance, trueNameAffordance]).includes('Elin'), false);

  const reference = buildSceneReference({
    visibleNpcs: visibleNpcsForReference,
    visibleAffordances: [transitionAffordance, trueNameAffordance],
  });
  const composer = buildActionComposerModel(reference);
  assert.equal(
    reference.action_targets.filter((entry) => entry.label === 'a shaken woman').length,
    1
  );
  assert.deepEqual(composer.target_chips.map((entry) => entry.label), ['a shaken woman']);
});

test('known NPC identity normalizes aliases to the known display name', () => {
  const visibleNpcsForReference = [
    {
      npc_id: 'elin-harrow',
      display_name: 'Elin Harrow',
      activity_text: 'Elin Harrow sits near the hearth.',
    },
  ];
  const npcIdentityIndex = [
    {
      npc_id: 'elin-harrow',
      display_name: 'Elin Harrow',
      true_name_known: true,
      match_terms: ['a shaken woman', 'the survivor', 'Elin Harrow', 'Elira'],
    },
  ];

  const transitionAffordance = mapAffordanceForCharacterPerspective(
    {
      affordance_id: 'move_scene:speak-with-elin',
      label: 'Speak with the survivor',
      action_type: 'move_scene',
      actions: ['move_scene'],
      available_actions: [{ verb: 'move_scene', action_key: 'move_scene:speak-with-elin' }],
      state: 'available',
    },
    visibleNpcsForReference,
    npcIdentityIndex
  );

  assert.equal(transitionAffordance.label, 'Elin Harrow');
  assert.equal(transitionAffordance.type, 'npc');
});
