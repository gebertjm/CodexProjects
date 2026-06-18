import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTERACTION_DOMAINS,
  INTERACTION_PRIMITIVES,
  isInteractionDomain,
  isInteractionPrimitive,
} from '../src/services/interactionCore/primitiveTypes.js';
import { normalizeExplorationSurfaceFocusCommit } from '../src/services/interactionCore/explorationAdapter.js';
import { getExplorationInteractionDefinitions } from '../src/services/freeFocusService.js';
import {
  getDialogueFocusCommitPrimitiveMappings,
  normalizeDialogueFocusCommitScene,
} from '../src/services/dialogueFocusCommit/dialogueAdapter.js';
import {
  assertActionWindowOpen,
  assertCurrentScene,
  assertDialogueActive,
  buildDialogueInteractionContext,
  buildExplorationInteractionContext,
  enterDialogueScene,
  enterExplorationScene,
  getCurrentPlayerReadModel,
} from './interaction-core/sharedPathHarness.js';

test('Build 1 shared interaction primitives expose reusable domain names', () => {
  assert.equal(isInteractionDomain(INTERACTION_DOMAINS.EXPLORATION), true);
  assert.equal(isInteractionDomain(INTERACTION_DOMAINS.DIALOGUE), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.SURFACE), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.PASSIVE_CONTEXT), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.FREE_FOCUS), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.COMMITTED_ACTION), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.PREVIEW), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.RESOLUTION), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.STATE_CHANGES), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.OUTPUTS), true);
  assert.equal(isInteractionPrimitive(INTERACTION_PRIMITIVES.TRANSITIONS), true);
});

test('Build 1 dialogue adapter maps domain names onto shared primitives', () => {
  const mappings = getDialogueFocusCommitPrimitiveMappings();
  const context = buildDialogueInteractionContext({
    activeDialogueId: 'dialogue_elin_memory_focus_commit',
  });

  assert.equal(mappings.surface.domain_collection, 'conversation_surface');
  assert.equal(mappings.passive_context.domain_collection, 'passive_social_insight');
  assert.equal(mappings.free_focus.domain_collection, 'clarifying_questions');
  assert.equal(mappings.committed_action.domain_collection, 'committed_social_moves');
  assert.equal(mappings.transitions.domain_collection, 'dialogue_exit');
  assert.equal(context.interaction_domain, 'dialogue');
});

test('Build 1 dialogue adapter normalizes a dialogue scene without running runtime behavior', () => {
  const dialogueState = enterDialogueScene({
    activeDialogueId: 'dialogue_elin_memory_focus_commit',
  });
  const normalized = normalizeDialogueFocusCommitScene({
    interaction_model: 'dialogue_focus_commit',
    conversation_surface: {
      id: 'surface_elin_memory',
      title: 'Elin watches the hearth',
      text: 'The woman keeps her answers close.',
    },
    passive_social_insight: [
      {
        interaction_id: 'insight_elin_avoids_shrine',
        label: 'Elin avoids the shrine',
        target_id: 'npc:elin_harrow',
      },
    ],
    clarifying_questions: [
      {
        interaction_id: 'clarify_first_memory',
        label: 'What do you remember first?',
        target_id: 'npc:elin_harrow',
      },
    ],
    committed_social_moves: [
      {
        interaction_id: 'press_about_shrine_bell',
        label: 'Press about the shrine bell',
        target_id: 'npc:elin_harrow',
      },
    ],
    dialogue_exit: {
      interaction_id: 'exit_to_inn',
      label: 'Return to the common room',
    },
  });

  assert.equal(normalized.domain, 'dialogue_focus_commit');
  assert.equal(normalized.source_model, 'dialogue_focus_commit');
  assert.equal(normalized.primitives.surface[0].domain_type, 'conversation_surface');
  assert.equal(normalized.primitives.passive_context[0].domain_type, 'passive_social_insight');
  assert.equal(normalized.primitives.free_focus[0].domain_type, 'clarifying_question');
  assert.equal(normalized.primitives.committed_action[0].domain_type, 'committed_social_move');
  assert.equal(normalized.primitives.transitions[0].domain_type, 'dialogue_exit');
  assert.equal(
    normalized.by_domain_collection.clarifying_questions[0].primitive_type,
    'free_focus'
  );
  assertDialogueActive(getCurrentPlayerReadModel(dialogueState), 'dialogue_elin_memory_focus_commit');
});

test('Build 1 exploration adapter remains available for Surface/Focus/Commit content', () => {
  const explorationContext = buildExplorationInteractionContext({
    currentSceneId: 'grey-road-inn',
  });
  const explorationState = enterExplorationScene({
    currentSceneId: 'grey-road-inn',
  });
  const normalized = normalizeExplorationSurfaceFocusCommit({
    interaction_model: 'surface_focus_commit',
    automatic_observations: [{ interaction_id: 'observe_inn_room', label: 'Common room' }],
    passive_discoveries: [{ interaction_id: 'notice_quiet_room', label: 'Quiet room' }],
    free_focus: [{ interaction_id: 'focus_hearth', label: 'Hearth' }],
    beat_actions: [{ interaction_id: 'question_survivor', label: 'Question survivor' }],
    transitions: [{ interaction_id: 'leave_inn', label: 'Leave the inn' }],
  });

  assert.equal(normalized.domain, 'surface_focus_commit');
  assert.equal(normalized.primitives.surface[0].domain_type, 'automatic_observation');
  assert.equal(normalized.primitives.passive_context[0].domain_type, 'passive_discovery');
  assert.equal(normalized.primitives.free_focus[0].domain_type, 'free_focus');
  assert.equal(normalized.primitives.committed_action[0].domain_type, 'beat_action');
  assert.equal(normalized.primitives.transitions[0].domain_type, 'exploration_transition');
  assert.equal(explorationContext.interaction_domain, 'exploration');
  assertCurrentScene(getCurrentPlayerReadModel(explorationState), 'grey-road-inn');
  assertActionWindowOpen(getCurrentPlayerReadModel(explorationState));
});

test('Build 1 existing exploration definition helper keeps its current shape', () => {
  const definitions = getExplorationInteractionDefinitions({
    interaction_model: 'surface_focus_commit',
    automatic_observations: [{ interaction_id: 'observe_bridge' }],
    passive_discoveries: [{ interaction_id: 'notice_tracks' }],
    free_focus: [{ interaction_id: 'focus_tracks' }],
    beat_actions: [{ interaction_id: 'follow_tracks', resolution_mode: 'beat_action' }],
  });

  assert.deepEqual(Object.keys(definitions).sort(), [
    'automatic_observations',
    'beat_actions',
    'free_focus',
    'interaction_model',
    'passive_discoveries',
  ]);
  assert.equal(definitions.interaction_model, 'surface_focus_commit');
  assert.equal(definitions.free_focus[0].interaction_id, 'focus_tracks');
});
