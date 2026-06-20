import 'dart:convert';

import 'package:dailyttrpg_player_app/combat/combat_models.dart';
import 'package:flutter_test/flutter_test.dart';

const _hiddenFragments = [
  'gm_notes',
  'debug_envelope',
  'hidden_dc',
  'raw_roll',
  'armor_class_hidden',
  'exact_enemy_hit_points',
  'hidden_requirements',
  'failed_hidden_requirements',
  'raw_state',
  'state_write',
  'mutation_plan',
  'idempotency_key',
  'source_state_version',
  'action_window_internal',
  'internal_routing',
  'combat_pending',
  'future_supported',
  'target_encounter_id',
  'branch_id',
  'path_harness',
  'stack trace',
  'trace_id',
  'gm_trace',
];

Map<String, dynamic> _syntheticCombatState(String stateKind) {
  final base = <String, dynamic>{
    'encounter_title': 'Neutral Synthetic Encounter',
    'combat_status': stateKind == 'recovery'
        ? 'recovery_needed'
        : stateKind == 'resolution'
            ? 'complete'
            : 'active',
    'round': 1,
    'current_actor': {
      'participant_id': 'pc-1',
      'display_name': 'Avery Test',
      'is_actor': true,
      'is_player': true,
      'hit_points': {'current': 18, 'max': 20, 'temporary': 0},
    },
    'visible_participants': [
      {
        'participant_id': 'pc-1',
        'display_name': 'Avery Test',
        'is_player': true,
        'hit_points': {'current': 18, 'max': 20},
      },
      {
        'participant_id': 'enemy-1',
        'display_name': 'Training Adversary',
        'health_band': 'hurt',
      },
    ],
    'movement': {
      'base_movement': 30,
      'movement_spent': 10,
      'movement_remaining': 20,
    },
    'legal_decision_categories': [
      {'category': 'action', 'status': 'available', 'available': true},
      {'category': 'end_turn', 'status': 'available', 'available': true},
    ],
    'available_authored_actions': [
      {
        'action_id': 'synthetic-strike',
        'label': 'Synthetic Strike',
        'timing_category': 'action',
        'available': true,
        'target_candidates': [
          {
            'target_id': 'enemy-1',
            'label': 'Training Adversary',
            'health_band': 'hurt',
          },
        ],
      },
    ],
    'latest_result': {
      'operation_name': 'Synthetic Strike',
      'result': 'The strike resolves in the fixture.',
    },
    'next_step': 'Choose another combat option or end your turn.',
  };
  if (stateKind == 'reaction') {
    return {
      ...base,
      'reaction_state': 'waiting_for_player',
      'trigger': {'summary': 'Training Adversary leaves your reach.'},
      'legal_reaction_options': [
        {
          'reaction_id': 'synthetic-opportunity-strike',
          'label': 'Opportunity Strike'
        },
      ],
      'decline_option': {'label': 'Let it pass'},
      'ordinary_controls_available': false,
    };
  }
  if (stateKind == 'recovery') {
    return {
      ...base,
      'recovery_needed_message':
          'Combat needs a safe review before continuing.',
      'ordinary_controls_available': false,
      'combat_controls_available': false,
    };
  }
  if (stateKind == 'resolution') {
    return {
      ...base,
      'aftermath': {
        'title': 'Synthetic Aftermath',
        'summary': 'The neutral fixture encounter is resolved.',
      },
      'rewards': {
        'experience_points_awarded': 1,
        'pending_advancement': {'available': false},
      },
      'review': {
        'title': 'Synthetic Review',
        'summary': 'Review the fixture outcome.',
      },
      'ordinary_controls_available': false,
    };
  }
  if (stateKind == 'focus') {
    return {
      ...base,
      'focus': {
        'status': 'available',
        'suggestions': [
          {
            'template_id': 'self.movement_remaining',
            'question': 'How much movement remains?',
          },
        ],
      },
    };
  }
  return base;
}

void _expectPlayerSafe(CombatView view) {
  final visibleText = view.playerVisibleText;
  final serialized =
      jsonEncode(_syntheticCombatState('active_turn')).toLowerCase();
  for (final fragment in _hiddenFragments) {
    expect(visibleText, isNot(contains(fragment)));
    expect(serialized, isNot(contains(fragment)));
  }
}

void main() {
  test('synthetic active turn fixture parses into safe combat controls', () {
    final view = CombatView.fromJson(_syntheticCombatState('active_turn'));

    expect(view.encounterTitle, 'Neutral Synthetic Encounter');
    expect(view.currentActor?.displayName, 'Avery Test');
    expect(view.participants.last.healthBand, 'hurt');
    expect(view.availableActions.single.label, 'Synthetic Strike');
    expect(view.canUseOrdinaryControls, true);
    _expectPlayerSafe(view);
  });

  test(
      'synthetic reaction, recovery, focus, and resolution states parse safely',
      () {
    final reaction = CombatView.fromJson(_syntheticCombatState('reaction'));
    expect(reaction.isReaction, true);
    expect(reaction.canUseOrdinaryControls, false);
    expect(reaction.reaction?.options.single.label, 'Opportunity Strike');
    _expectPlayerSafe(reaction);

    final recovery = CombatView.fromJson(_syntheticCombatState('recovery'));
    expect(recovery.isRecovery, true);
    expect(recovery.canUseOrdinaryControls, false);
    _expectPlayerSafe(recovery);

    final focus = CombatView.fromJson(_syntheticCombatState('focus'));
    expect(focus.focus?.isPresent, true);
    _expectPlayerSafe(focus);

    final resolution = CombatView.fromJson(_syntheticCombatState('resolution'));
    expect(resolution.isResolution, true);
    expect(resolution.resolution?.rewards?.experiencePointsAwarded, 1);
    _expectPlayerSafe(resolution);
  });
}
