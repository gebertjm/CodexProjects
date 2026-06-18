import 'dart:convert';

import 'package:dailyttrpg_player_app/combat/combat_models.dart';
import 'package:flutter_test/flutter_test.dart';

const _hiddenFragments = [
  'gm_notes',
  'debug_envelope',
  'hidden_dc',
  'raw_roll',
  'armor_class',
  'exact_enemy_hit_points',
  'hidden_requirements',
  'failed_hidden_requirements',
  'surrender_threshold',
  'completion_predicate',
  'operation_fingerprint',
  'idempotency_key',
  'source_state_version',
  'mutation_plan',
  'internal_routing',
  'combat_pending',
  'future_supported',
  'target_encounter_id',
  'trace_id',
  'gm_trace',
];

const _outcomes = {
  'rusk_defeat_lethal': 'Rusk falls at the shrine.',
  'rusk_defeat_nonlethal': 'Rusk is subdued and left alive.',
  'rusk_surrender': 'Rusk gives up the fight.',
  'player_retreat': 'You break away from the shrine.',
  'player_defeat_fail_forward': 'You are overwhelmed but the story continues.',
};

Map<String, dynamic> _reviewPayload(String outcomeId, String summary) {
  return {
    'encounter_title': 'Rusk at the Shrine',
    'status': 'complete',
    'aftermath': {
      'state_id': 'shrine_ruins_aftermath',
      'variant_id': outcomeId,
      'title': 'Shrine Ruins Aftermath',
      'label': outcomeId,
      'summary': summary,
    },
    'rewards': {
      'experience_points_awarded': 150,
      'items': [],
      'currency': {},
      'pending_advancement': {
        'available': outcomeId == 'player_defeat_fail_forward',
        'target_level': outcomeId == 'player_defeat_fail_forward' ? 2 : null,
        'level_changed': false,
      },
    },
    'review': {
      'title': 'Shrine Ruins Aftermath',
      'summary': summary,
      'chronological_log': [
        {
          'round': 1,
          'turn': 'Player Turn',
          'events': [
            {'event_type': 'combat_start', 'summary': 'The shrine fight begins.'},
            {'event_type': 'resolution', 'summary': summary},
          ],
        },
      ],
      'calculation_details_available': true,
    },
    'participants': [
      {
        'participant_id': 'pc-1',
        'display_name': 'Avery',
        'is_player': true,
        'hit_points': {'current': 8, 'maximum': 20, 'temporary': 0},
      },
      {
        'participant_id': 'rusk-bandit',
        'display_name': 'Rusk',
        'is_player': false,
        'health_band': outcomeId == 'rusk_surrender' ? 'badly_wounded' : 'down',
      },
    ],
    'ordinary_controls_available': false,
    'combat_controls_available': false,
    'next_step': 'Review the aftermath and continue from the Shrine Ruins aftermath state.',
  };
}

Map<String, dynamic> _reactionPayload() {
  return {
    'encounter_title': 'Rusk at the Shrine',
    'combat_status': 'active',
    'round': 1,
    'reaction_state': 'waiting_for_player',
    'trigger': {'summary': 'Rusk leaves your reach.'},
    'legal_reaction_options': [
      {'reaction_id': 'greyvale-player-opportunity-strike', 'label': 'Opportunity Strike'},
    ],
    'decline_option': {'label': 'Let it pass'},
    'ordinary_controls_available': false,
  };
}

Map<String, dynamic> _recoveryPayload() {
  return {
    'encounter_title': 'Rusk at the Shrine',
    'combat_status': 'recovery_needed',
    'recovery_needed_message': 'Combat needs a safe refresh before more choices are available.',
    'ordinary_controls_available': false,
    'combat_controls_available': false,
  };
}

void _expectPlayerSafe(CombatView view) {
  final rendered = view.playerVisibleText.toLowerCase();
  final serialized = jsonEncode({
    'title': view.encounterTitle,
    'status': view.combatStatus,
    'visible_text': view.playerVisibleText,
  }).toLowerCase();
  for (final fragment in _hiddenFragments) {
    expect(rendered, isNot(contains(fragment)));
    expect(serialized, isNot(contains(fragment)));
  }
}

void main() {
  test('Rusk acceptance review payloads parse for all five canonical outcomes', () {
    for (final entry in _outcomes.entries) {
      final view = CombatView.fromJson(_reviewPayload(entry.key, entry.value));
      expect(view.encounterTitle, 'Rusk at the Shrine');
      expect(view.isResolution, true);
      expect(view.canUseOrdinaryControls, false);
      expect(view.resolution?.aftermathTitle, 'Shrine Ruins Aftermath');
      expect(view.resolution?.summary, entry.value);
      expect(view.resolution?.rewards?.experiencePointsAwarded, 150);
      expect(view.resolution?.review?.log.length, 1);
      _expectPlayerSafe(view);
    }
  });

  test('Rusk acceptance reaction and recovery payloads parse safely', () {
    final reaction = CombatView.fromJson(_reactionPayload());
    expect(reaction.isReaction, true);
    expect(reaction.canUseOrdinaryControls, false);
    expect(reaction.reaction?.options.first.label, 'Opportunity Strike');
    _expectPlayerSafe(reaction);

    final recovery = CombatView.fromJson(_recoveryPayload());
    expect(recovery.isRecovery, true);
    expect(recovery.canUseOrdinaryControls, false);
    expect(recovery.recovery?.retrySafe, false);
    _expectPlayerSafe(recovery);
  });
}

