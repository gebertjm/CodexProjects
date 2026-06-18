import 'package:dailyttrpg_player_app/api/models.dart';
import 'package:dailyttrpg_player_app/campaign/exploration_mechanics_inspector_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

ExplorationMechanicsDebugWorkspace _workspaceFixture() {
  return ExplorationMechanicsDebugWorkspace.fromJson({
    'status': 'ok',
    'checked_at': '2026-05-24T12:00:00Z',
    'context': {
      'campaign_instance_id': '44',
      'character_id': '12',
      'scene_id': 'broken-caravan-site',
    },
    'exploration_mechanics_debug': {
      'scene_state': {
        'campaign_id': '44',
        'world_instance_id': '7',
        'character_id': '12',
        'location_id': 'grey-road',
        'scene_id': 'broken-caravan-site',
        'scene_slug': 'broken-caravan-site',
        'current_beat_id': 'beat-3',
        'current_action_window_id': 'window-8',
        'action_window_status': 'open',
        'current_available_affordances_count': 4,
        'current_exits_transitions_count': 2,
        'visible_npc_count': 1,
        'known_relevant_absent_npc_count': 1,
        'hidden_affordance_count': 2,
      },
      'surface_context': {
        'base_authored_scene_description': 'The caravan leans in the mud.',
        'overlay_scene_key': 'greyvale-broken-caravan',
        'interaction_model': 'surface_focus_commit',
        'passive_discovery_count': 1,
        'free_focus_count': 1,
        'time_weather_season_light_inputs': {
          'weather': 'mist',
          'time_of_day': 'dusk',
          'season': 'autumn',
          'light': 'dim',
        },
        'selected_weighted_flavor_references': [
          {'flavor_key': 'grey_road_mist', 'text_summary': 'Mist curls low.'},
        ],
        'npc_presence_contributions': [
          {'npc_id': 'elin_harrow', 'contribution': 'watches the road'},
        ],
        'character_knowledge_filter_summary': {'known_fact_count': 3},
      },
      'passive_discoveries': [
        {
          'id': 'passive_caravan_drag_marks',
          'label': 'Drag marks',
          'visibility_state': 'visible_success',
          'check_type': 'perception',
          'dc': 13,
        },
      ],
      'free_focus_items': [
        {
          'id': 'focus_broken_axle',
          'title': 'Look at the axle',
          'status': 'available',
          'check_requirement': 'requires_check',
          'check_type': 'investigation',
          'skill': 'investigation',
          'dc': 12,
          'dc_visibility_policy': 'gm_only',
          'repeat_policy': 'persist_result_no_reroll',
          'retry_policy': 'no_immediate_retry_by_default',
          'knowledge_outputs': [
            {'knowledge_id': 'wheel_cracked_before_impact'},
          ],
        },
      ],
      'beat_action_options': [
        {
          'authored_action_id': 'inspect-broken-caravan',
          'affordance_id': 'caravan-wreck',
          'verb_action_type': 'inspect',
          'availability_state': 'available',
          'visibility_status': 'authored',
          'check_requirement': 'requires_check',
          'check_type': 'investigation',
          'skill': 'investigation',
          'dc': 14,
          'possible_transitions': [
            {'target_scene_key': 'grey-road-inn'},
          ],
        },
      ],
      'submitted_action': {
        'submitted_action_id': 'submit-1',
        'raw_player_text': 'Inspect the broken caravan.',
      },
      'preview_mapping': {
        'raw_player_text': 'Inspect the broken caravan.',
        'normalized_text': 'inspect the broken caravan',
        'selected_verb': 'inspect',
        'selected_affordance': 'caravan-wreck',
        'matched_authored_interaction': 'inspect-broken-caravan',
        'mapping_source': 'affordance_match',
        'overlap_with_free_focus': {
          'interaction_id': 'focus_broken_axle',
        },
        'mechanical_preview': {'spends_beat': true},
        'hidden_debug_preview_fields': {'candidate_count': 2},
      },
      'check_details': [
        {
          'check_id': 'free_focus:focus_broken_axle:investigation',
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'source_label': 'Look at the axle',
          'requires_check': true,
          'check_kind': 'skill_check',
          'ability': 'intelligence',
          'skill': 'investigation',
          'dc': 12,
          'dc_visibility': 'gm_only',
          'roll_mode': 'standard',
          'raw_roll': null,
          'total_result': null,
          'result_band': null,
          'instrumentation_status': 'partial',
        },
      ],
      'result_bands': [
        {
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'band_id': 'success',
          'band_label': 'Success',
          'classification': 'success',
          'threshold': 12,
          'selected': false,
          'player_facing_text': 'The axle snapped before impact.',
          'knowledge_grants': [
            {'knowledge_id': 'wheel_cracked_before_impact'},
          ],
          'validation_status': 'ok',
          'instrumentation_status': 'partial',
        },
      ],
      'environment_modifiers': [
        {
          'weather': 'mist',
          'time_of_day': 'dusk',
          'season': 'autumn',
          'visibility_light': 'dim',
          'mood_tone': 'uneasy',
          'active_environment_modifiers': [
            {
              'check_type': 'skill_check',
              'skill': 'perception',
              'modifier': -1
            },
          ],
          'affected_checks': [
            {'skill': 'perception', 'modifier': -1},
          ],
          'affected_scene_surface_sections': [
            {'flavor_id': 'grey_road_mist'},
          ],
          'flavor_source_id': ['grey_road_mist'],
          'flavor_seed': 'not_recorded',
          'flavor_reuse_cooldown_status': 'not_recorded',
          'instrumentation_status': 'partial',
        },
      ],
      'npc_presence': [
        {
          'npc_id': 'elin_harrow',
          'canonical_name': 'Elin Harrow',
          'player_visible_label': 'the shaken woman',
          'identity_visibility': 'masked',
          'is_present': true,
          'is_absent': false,
          'is_known_to_character': false,
          'is_relevant_absent_npc': false,
          'authored_schedule_id': 'elin_evening_road',
          'current_schedule_block': 'dusk',
          'routine_label': 'watching the road',
          'resolved_presence_status': 'present',
          'npc_derived_affordances': [
            {'affordance_id': 'npc:elin_harrow'},
          ],
          'instrumentation_status': 'partial',
        },
      ],
      'state_reads': [
        {
          'read_id': 'free_focus:focus_broken_axle:requires:0',
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'scope': 'character_knowledge',
          'key_or_path': 'has_seen_axle',
          'read_kind': 'authored_dependency',
          'affects': ['availability'],
          'hidden_debug': true,
          'instrumentation_status': 'partial',
        },
      ],
      'state_writes': [
        {
          'write_id': 'exploration_result:1:state_write:0',
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'scope': 'scene',
          'key_or_path': 'caravan.axle_inspected',
          'old_value': null,
          'new_value': true,
          'write_kind': 'runtime_write',
          'source_free_focus_id': 'focus_broken_axle',
          'source_result_band_id': 'success',
          'audit_event_id': '1',
          'emitted_to_result_feed': true,
          'emitted_to_history': false,
          'instrumentation_status': 'partial',
        },
      ],
      'knowledge_outputs': [
        {
          'output_id': 'exploration_result:1:knowledge:0',
          'knowledge_id': 'wheel_cracked_before_impact',
          'output_type': 'fact',
          'confidence_or_status': 'confirmed',
          'character_id': '12',
          'campaign_id': '44',
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'source_result_band_id': 'success',
          'provenance_event_id': '1',
          'player_facing': true,
          'hidden_debug': false,
          'player_visible_summary': 'The wheel cracked before impact.',
          'instrumentation_status': 'partial',
        },
      ],
      'history_outputs': [
        {
          'output_id': 'scene_result_feed:latest_development',
          'event_type': 'latest_development',
          'source_type': 'latest_development',
          'summary': 'The axle tells a colder story.',
          'player_visible_text': 'The axle tells a colder story.',
          'gm_debug_text': 'Latest development is player-facing.',
          'player_facing': true,
          'canonical': false,
          'instrumentation_status': 'partial',
        },
      ],
      'transitions': [
        {
          'transition_id': 'to-grey-road-inn',
          'transition_type': 'scene_exit',
          'source_scene_id': 'broken-caravan-site',
          'target_scene_id': 'grey-road-inn',
          'availability_status': 'available',
          'requirements': {},
          'failed_requirements': [],
          'player_facing': true,
          'hidden_debug': false,
          'instrumentation_status': 'available',
        },
      ],
      'audit_timeline': [
        {
          'audit_id': 'exploration_result:1',
          'timestamp': '2026-05-24T12:00:00Z',
          'event_type': 'free_focus_resolved',
          'summary': 'The axle tells a colder story.',
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'free_focus_id': 'focus_broken_axle',
          'result_band_id': 'success',
          'player_facing': true,
          'hidden_debug': false,
          'linked_debug_sections': ['free_focus_items', 'result_bands'],
          'instrumentation_status': 'partial',
        },
      ],
      'validation': {
        'hard_errors': [],
        'warnings': [
          {
            'code': 'state_write_old_value_not_recorded',
            'message': 'Old value was not recorded.',
            'source_type': 'free_focus',
            'source_id': 'focus_broken_axle',
          },
        ],
        'debug_notices': [
          {
            'code': 'audit_timeline_partial',
            'message': 'Timeline is a partial runtime trace.',
          },
        ],
      },
      'visibility_boundaries': {
        'includes_hidden_dc': true,
        'includes_result_band_internals': true,
        'includes_check_debug_breakdown': true,
        'includes_modifier_breakdown': true,
        'includes_hidden_requirements': true,
        'includes_environment_debug': true,
        'includes_hidden_environment_details': true,
        'includes_npc_schedule_debug': true,
        'includes_hidden_npc_identity': true,
        'includes_state_dependencies': true,
        'includes_raw_state_reads': true,
        'includes_raw_state_writes': true,
        'includes_hidden_knowledge_outputs': false,
        'includes_history_output_internals': true,
        'includes_hidden_transition_requirements': true,
        'includes_audit_timeline': true,
        'player_endpoint_exclusion_confirmed': true,
        'player_dc_policy': 'Hidden DCs remain GM/dev-only.',
        'player_roll_policy': 'Raw rolls stay GM/dev-only.',
        'player_result_band_policy': 'Result bands stay GM/dev-only.',
        'notes': ['GM/dev endpoint only.'],
      },
    },
  });
}

void main() {
  testWidgets('ExplorationMechanicsInspectorView renders all planned panels',
      (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorView(
      workspace: _workspaceFixture(),
    )));

    for (final label in [
      'Scene State',
      'Surface / Passive Discovery',
      'Free Focus Mechanics',
      'Beat Action Mechanics',
      'Preview Mapping',
      'Check Breakdown',
      'Result Bands',
      'Environment Modifiers',
      'NPC Presence',
      'State Reads / Writes',
      'Knowledge / History Outputs',
      'Transitions',
      'Audit Timeline',
      'Validation',
      'Visibility Boundaries',
    ]) {
      expect(find.text(label), findsWidgets);
    }

    expect(
        find.textContaining('Hidden DCs remain GM/dev-only'), findsOneWidget);
    expect(find.textContaining('the shaken woman'), findsWidgets);
    expect(
        find.textContaining('Exploration Mechanics Inspector'), findsWidgets);
  });

  testWidgets('Free Focus selection highlights linked context', (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorView(
      workspace: _workspaceFixture(),
    )));

    await tester.ensureVisible(find.textContaining('Look at the axle').first);
    await tester.tap(find.textContaining('Look at the axle').first);
    await tester.pumpAndSettle();

    expect(find.text('focus_broken_axle'), findsWidgets);
    expect(find.text('Clear linked selection'), findsOneWidget);
    expect(find.textContaining('Selected panel'), findsOneWidget);
  });

  testWidgets('Check panel renders not-recorded instrumentation honestly',
      (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorView(
      workspace: _workspaceFixture(),
    )));

    expect(find.textContaining('Raw roll'), findsWidgets);
    expect(find.textContaining('Not recorded'), findsWidgets);
    expect(find.textContaining('partial'), findsWidgets);
  });

  testWidgets('Visibility boundary panel marks debug fields GM/dev only',
      (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorView(
      workspace: _workspaceFixture(),
    )));

    expect(find.textContaining('Includes hidden dc: true'), findsOneWidget);
    expect(find.textContaining('Includes hidden npc identity: true'),
        findsOneWidget);
    expect(find.textContaining('Player endpoint exclusion confirmed: true'),
        findsOneWidget);
  });

  test('ExplorationMechanicsDebugWorkspace tolerates partial payloads', () {
    final workspace = ExplorationMechanicsDebugWorkspace.fromJson({
      'status': 'ok',
      'exploration_mechanics_debug': {
        'scene_state': {'scene_id': 'broken-caravan-site'},
        'unknown_future_section': {'safe': true},
        'check_details': [
          {
            'check_id': 'future-check',
            'instrumentation_status': 'future_supported'
          },
        ],
      },
    });

    expect(workspace.status, 'ok');
    expect(workspace.sceneState['scene_id'], 'broken-caravan-site');
    expect(workspace.checkDetails.single['check_id'], 'future-check');
    expect(workspace.freeFocusItems, isEmpty);
    expect(workspace.validation.hardErrors, isEmpty);
  });
}
