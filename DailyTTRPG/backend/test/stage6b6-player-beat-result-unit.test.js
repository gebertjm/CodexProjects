import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlayerBeatResultDraft } from '../src/services/playerBeatResultService.js';

test('player beat result draft turns a resolved scene interaction into scene feed content', () => {
  const draft = buildPlayerBeatResultDraft({
    campaignId: 1,
    worldInstanceId: 2,
    characterId: 3,
    window: {
      id: 4,
      scene_id: 5,
      window_type: 'exploration',
    },
    submission: {
      id: 6,
      raw_text: 'I inspect the caravan wreckage.',
      resolved_verb: 'investigate',
      target_label: 'broken wagon',
    },
    resolved: {
      action: {
        action_type: 'scene_interaction',
        action_key: 'inspect_wreckage',
      },
      result: {
        scene_id: 5,
        result: {
          result_summary: 'You confirm the caravan was attacked from the treeline.',
        },
        check: {
          was_success: true,
          difficulty_class: 13,
        },
        applied_effects: {
          knowledge: [
            {
              knowledge_key: 'attack_from_treeline',
              title: 'Attack from the treeline',
              summary: 'The attack came from the trees, not the road.',
              status: 'known',
              confidence: 'confirmed',
            },
          ],
          objectives: [
            {
              objective_id: 'investigate_caravan',
              title: 'Learn what happened to the caravan',
              progress_text: 'You learned the attack began from the treeline.',
            },
          ],
        },
      },
    },
    sceneContext: {
      scene_id: 5,
      location_id: 7,
    },
    provenanceEvents: [{ id: 99 }],
  });

  assert.equal(draft.scene_type, 'exploration');
  assert.equal(draft.result_kind, 'exploration_result');
  assert.equal(draft.summary, 'You confirm the caravan was attacked from the treeline.');
  assert.equal(draft.submitted_action_summary, 'I inspect the caravan wreckage.');
  assert.equal(draft.interpreted_action_summary, 'Investigate -> broken wagon');
  assert.deepEqual(
    draft.knowledge_gained.map((entry) => entry.knowledge_id),
    ['attack_from_treeline']
  );
  assert.equal(draft.objective_updates[0].progress_text, 'You learned the attack began from the treeline.');
  assert.equal(draft.safe_mechanics[0].text, 'The visible check succeeded.');
  assert.deepEqual(draft.provenance.event_ids, ['99']);
  assert.equal(JSON.stringify(draft.safe_mechanics).includes('13'), false);
});

test('player beat result draft falls back safely for no-action beat advance', () => {
  const draft = buildPlayerBeatResultDraft({
    campaignId: 1,
    characterId: 3,
    window: {
      id: 4,
      scene_id: 5,
      window_type: 'exploration',
    },
    submission: null,
    resolved: {
      action: {
        action_type: 'wait',
      },
      result: {
        narrative_text: 'You wait and let the current moment breathe.',
        result_summary: 'No state change was applied.',
      },
    },
    sceneContext: {
      scene_id: 5,
    },
  });

  assert.equal(draft.summary, 'You wait and let the current moment breathe.');
  assert.equal(
    draft.submitted_action_summary,
    'No action was submitted before the beat advanced.'
  );
  assert.equal(draft.provenance.action_type, 'wait');
});

test('player beat result draft infers dialogue and combat modes', () => {
  const dialogue = buildPlayerBeatResultDraft({
    campaignId: 1,
    characterId: 3,
    window: { id: 4, dialogue_session_id: 8, window_type: 'dialogue_choice' },
    resolved: { action: { action_type: 'talk_to_npc' }, result: { summary: 'She answers quietly.' } },
  });
  const combat = buildPlayerBeatResultDraft({
    campaignId: 1,
    characterId: 3,
    window: { id: 5, combat_id: 9, window_type: 'combat_turn' },
    resolved: { action: { action_type: 'combat_action' }, result: { narrative_text: 'Your blow lands.' } },
  });

  assert.equal(dialogue.scene_type, 'dialogue');
  assert.equal(dialogue.result_kind, 'dialogue_result');
  assert.equal(combat.scene_type, 'combat');
  assert.equal(combat.result_kind, 'combat_result');
});
