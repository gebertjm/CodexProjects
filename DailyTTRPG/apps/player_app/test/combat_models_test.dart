import 'package:dailyttrpg_player_app/combat/combat_models.dart';
import 'package:flutter_test/flutter_test.dart';

const _hiddenFragments = [
  'hidden_dc',
  'raw_roll',
  'branch_id',
  'hidden_requirements',
  'gm_notes',
  'state_write',
  'mutation_plan',
  'idempotency_key',
  'combat_pending',
  'future_supported',
  'target_encounter_id',
  'path_harness',
  'stack trace',
  'trace_id',
  '7/20 hp',
];

void _expectPlayerSafe(String text) {
  for (final fragment in _hiddenFragments) {
    expect(
      text,
      isNot(contains(fragment)),
      reason: 'Combat player text leaked "$fragment".',
    );
  }
}

void main() {
  test('CombatView parses current-turn state and safe visible text', () {
    final view = CombatView.fromJson({
      'encounter_title': 'Rusk at the Shrine',
      'combat_status': 'active',
      'round': 2,
      'current_actor': {
        'participant_id': 'player-1',
        'display_name': 'Aric',
        'is_actor': true,
        'is_player': true,
        'hit_points': {'current': 8, 'max': 12, 'temporary': 2},
      },
      'visible_participants': [
        {
          'participant_id': 'player-1',
          'display_name': 'Aric',
          'is_player': true,
          'hit_points': {'current': 8, 'max': 12},
        },
        {
          'participant_id': 'rusk',
          'display_name': 'Rusk',
          'health_band': 'bloodied',
          'hit_points': {'current': 7, 'max': 20},
          'armor_class': 16,
          'exact_enemy_hit_points': 7,
        },
      ],
      'visible_player_resources': [
        {
          'resource_id': 'second_wind',
          'label': 'Second Wind',
          'current': 1,
          'max': 1
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
          'action_id': 'longsword',
          'label': 'Longsword',
          'timing_category': 'action',
          'available': true,
          'target_candidates': [
            {'target_id': 'rusk', 'label': 'Rusk', 'health_band': 'bloodied'}
          ],
        }
      ],
      'latest_result': {
        'operation_name': 'Longsword',
        'result': 'Rusk staggers back.',
        'mutation_plan': 'hidden',
      },
      'gm_trace': {'trace_id': 'trace-1'},
    });

    expect(view.encounterTitle, 'Rusk at the Shrine');
    expect(view.currentActor?.displayName, 'Aric');
    expect(view.participants.last.healthBand, 'bloodied');
    expect(view.resources.single.label, 'Second Wind');
    expect(view.movement?.remaining, 20);
    expect(view.availableActions.single.targetCandidates.single.label, 'Rusk');
    expect(view.latestResult?.summary, 'Rusk staggers back.');
    _expectPlayerSafe(view.playerVisibleText);
  });

  test('CombatView parses reaction, recovery, and resolution states', () {
    final reaction = CombatView.fromJson({
      'encounter_title': 'Rusk at the Shrine',
      'combat_status': 'active',
      'reaction_state': 'waiting_for_player',
      'trigger': {'summary': 'Rusk leaves your reach.'},
      'legal_reaction_options': [
        {'reaction_id': 'opportunity_attack', 'label': 'Opportunity Attack'},
      ],
      'decline_option': {'label': 'Let him move'},
    });
    expect(reaction.isReaction, true);
    expect(reaction.canUseOrdinaryControls, false);
    expect(reaction.reaction?.options.single.label, 'Opportunity Attack');

    final recovery = CombatView.fromJson({
      'encounter_title': 'Rusk at the Shrine',
      'combat_status': 'recovery_needed',
      'recovery_needed_message': 'Combat needs a safe refresh.',
      'trace_id': 'trace-debug',
    });
    expect(recovery.isRecovery, true);
    expect(recovery.canUseOrdinaryControls, false);
    _expectPlayerSafe(recovery.playerVisibleText);

    final resolution = CombatView.fromJson({
      'encounter_title': 'Rusk at the Shrine',
      'status': 'complete',
      'aftermath': {
        'title': 'Shrine Ruins Aftermath',
        'summary': 'The shrine grows quiet.',
      },
      'rewards': {
        'experience_points_awarded': 50,
        'pending_advancement': {'available': true, 'target_level': 2},
      },
      'review': {
        'title': 'Combat Review',
        'summary': 'You survived the confrontation.',
      },
    });
    expect(resolution.isResolution, true);
    expect(resolution.resolution?.rewards?.experiencePointsAwarded, 50);
    expect(resolution.resolution?.rewards?.pendingAdvancement, true);
  });
}
