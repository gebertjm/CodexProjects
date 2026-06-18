import 'package:dailyttrpg_player_app/api/models.dart';
import 'package:dailyttrpg_player_app/campaign/campaign_scene_page.dart';
import 'package:dailyttrpg_player_app/campaign/exploration_mechanics_inspector_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

ExplorationMechanicsDebugWorkspace _greyvaleBrokenCaravanWorkspace() {
  return ExplorationMechanicsDebugWorkspace.fromJson({
    'status': 'ok',
    'checked_at': '2026-05-25T12:00:00Z',
    'context': {
      'campaign_instance_id': 'greyvale-campaign-1',
      'character_id': 'greyvale-character-1',
      'scene_id': 'broken-caravan-site',
    },
    'exploration_mechanics_debug': {
      'scene_state': {
        'campaign_id': 'greyvale-campaign-1',
        'world_instance_id': 'greyvale-world-1',
        'character_id': 'greyvale-character-1',
        'location_id': 'broken-caravan-site',
        'scene_id': 'broken-caravan-site',
        'scene_slug': 'broken-caravan-site',
        'current_beat_id': 'beat-1',
        'current_action_window_id': 'window-1',
        'action_window_status': 'open',
        'current_objective': 'Witness the aftermath',
        'current_available_affordances_count': 4,
        'current_exits_transitions_count': 1,
        'visible_npc_count': 0,
        'known_relevant_absent_npc_count': 1,
        'hidden_affordance_count': 1,
      },
      'surface_context': {
        'base_authored_scene_description':
            'A broken caravan lies half in the roadside mud.',
        'overlay_scene_key': 'broken-caravan-site',
        'interaction_model': 'surface_focus_commit',
        'passive_discovery_count': 2,
        'free_focus_count': 4,
        'time_weather_season_light_inputs': {
          'weather': 'mist',
          'time_of_day': 'evening',
          'season': 'autumn',
          'light': 'dim',
        },
        'selected_weighted_flavor_references': [
          {'flavor_key': 'grey_road_mist', 'text_summary': 'Mist clings low.'},
        ],
        'hidden_vs_player_visible_surface_differences': {
          'gm_note': 'Passive discovery failures remain silent.',
        },
      },
      'passive_discoveries': [
        {
          'id': 'notice_deep_tracks',
          'label': 'Deep tracks leave the road',
          'visibility_state': 'success_only',
          'check_type': 'perception',
          'dc': 13,
          'result_band': 'success',
        },
      ],
      'free_focus_items': [
        {
          'id': 'focus_broken_axle',
          'title': 'broken axle',
          'status': 'available',
          'check_requirement': 'requires_check',
          'check_type': 'investigation',
          'skill': 'investigation',
          'dc': 13,
          'dc_visibility_policy': 'gm_only',
          'repeat_policy': 'persist_result_no_reroll',
          'retry_policy': 'no_immediate_retry_by_default',
          'knowledge_outputs': [
            {'knowledge_id': 'caravan_axle_was_sabotaged'},
          ],
        },
        {
          'id': 'focus_scattered_cargo',
          'title': 'scattered cargo',
          'status': 'available',
          'check_requirement': 'no_check',
          'check_type': 'no_check',
        },
      ],
      'beat_action_options': [
        {
          'authored_action_id': 'inspect-broken-caravan',
          'affordance_id': 'caravan_wreck',
          'verb_action_type': 'investigate',
          'availability_state': 'available',
          'visibility_status': 'authored',
          'check_requirement': 'requires_check',
          'check_type': 'investigation',
          'skill': 'investigation',
          'dc': 10,
          'possible_transitions': [
            {'target_scene_key': 'grey-road-inn'},
          ],
        },
      ],
      'submitted_action': {
        'submitted_action_id': 'submission-1',
        'raw_player_text': 'Inspect the broken axle.',
        'resolved_action_type': 'investigate',
      },
      'preview_mapping': {
        'raw_player_text': 'Inspect the broken axle.',
        'normalized_text': 'inspect the broken axle',
        'selected_verb': 'inspect',
        'selected_affordance': 'caravan_wreck',
        'matched_authored_interaction': 'inspect-broken-caravan',
        'mapping_source': 'affordance_match',
        'overlap_with_free_focus': {
          'interaction_id': 'focus_broken_axle',
          'followup_resolution_mode': 'advantage',
        },
        'mechanical_preview': {'spends_beat': true},
        'hidden_debug_preview_fields': {'candidate_count': 2},
      },
      'check_details': [
        {
          'check_id': 'free_focus:focus_broken_axle:investigation',
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'source_label': 'broken axle',
          'requires_check': true,
          'check_kind': 'skill_check',
          'ability': 'intelligence',
          'skill': 'investigation',
          'dc': 13,
          'dc_visibility': 'gm_only',
          'roll_mode': 'standard',
          'raw_roll': null,
          'total_result': null,
          'result_band': null,
          'gm_debug_summary':
              'Authored Closer Look check; roll not recorded yet.',
          'instrumentation_status': 'partial',
        },
        {
          'check_id': 'free_focus:focus_scattered_cargo:no_check',
          'source_type': 'free_focus',
          'source_id': 'focus_scattered_cargo',
          'source_label': 'scattered cargo',
          'requires_check': false,
          'check_kind': 'no_check',
          'dc': null,
          'raw_roll': null,
          'total_result': null,
          'instrumentation_status': 'not_applicable',
        },
      ],
      'result_bands': [
        {
          'source_type': 'free_focus',
          'source_id': 'focus_broken_axle',
          'band_id': 'success',
          'band_label': 'Success',
          'classification': 'success',
          'selected': false,
          'player_facing_text': 'The split is too clean for road damage.',
          'knowledge_grants': [
            {'knowledge_id': 'caravan_axle_was_sabotaged'},
          ],
          'instrumentation_status': 'partial',
        },
        {
          'source_type': 'scene_interaction',
          'source_id': 'inspect-broken-caravan',
          'band_id': 'success',
          'band_label': 'Success',
          'classification': 'success',
          'selected': true,
          'state_mutations': [
            {
              'target_id': 'caravan_wreck',
              'field': 'state',
              'value': 'resolved'
            },
          ],
          'knowledge_grants': [
            {'knowledge_id': 'caravan_irregularity'},
          ],
          'instrumentation_status': 'partial',
        },
      ],
      'environment_modifiers': [
        {
          'weather': 'mist',
          'time_of_day': 'evening',
          'season': 'autumn',
          'visibility_light': 'dim',
          'mood_tone': 'uneasy',
          'active_environment_modifiers': [
            {'skill': 'perception', 'modifier': -1, 'reason': 'low mist'},
          ],
          'mechanical_effects': [
            {'skill': 'perception', 'modifier': -1, 'reason': 'low mist'},
          ],
          'affected_checks': [
            {'skill': 'perception', 'modifier': -1},
          ],
          'affected_scene_surface_sections': [
            {'flavor_id': 'grey_road_mist', 'text_summary': 'Mist clings low.'},
          ],
          'flavor_source_id': ['grey_road_mist'],
          'flavor_seed': 'not_recorded',
          'flavor_reuse_cooldown_status': 'not_recorded',
          'instrumentation_status': 'partial',
        },
      ],
      'npc_presence': [
        {
          'npc_id': 'elin-harrow',
          'canonical_name': 'Elin Harrow',
          'player_visible_label': 'a shaken woman',
          'identity_visibility': 'masked',
          'is_present': false,
          'is_absent': true,
          'is_known_to_character': false,
          'is_relevant_absent_npc': true,
          'authored_schedule_id': 'grey-road-inn-evening',
          'current_schedule_block': 'evening',
          'resolved_presence_status': 'absent',
          'absence_reason': 'at the Grey Road Inn',
          'hidden_vs_player_visible_npc_details': {
            'canonical_name': 'Elin Harrow',
            'player_visible_label': 'a shaken woman',
          },
          'instrumentation_status': 'partial',
        },
      ],
      'state_reads': [
        {
          'read_id': 'beat_action:inspect-broken-caravan:visibility',
          'source_type': 'beat_action',
          'source_id': 'inspect-broken-caravan',
          'scope': 'affordance',
          'key_or_path': 'caravan_wreck.state',
          'read_kind': 'authored_dependency',
          'affects': ['availability'],
          'hidden_debug': true,
          'instrumentation_status': 'partial',
        },
      ],
      'state_writes': [
        {
          'write_id': 'result-band:inspect-broken-caravan:state:0',
          'source_type': 'scene_interaction',
          'source_id': 'inspect-broken-caravan',
          'scope': 'affordance',
          'key_or_path': 'caravan_wreck.state',
          'old_value': null,
          'new_value': 'resolved',
          'write_kind': 'authored_output',
          'source_result_band_id': 'success',
          'hidden_debug': true,
          'instrumentation_status': 'partial',
        },
      ],
      'knowledge_outputs': [
        {
          'output_id': 'knowledge:caravan_irregularity',
          'knowledge_id': 'caravan_irregularity',
          'output_type': 'clue',
          'confidence_or_status': 'confirmed',
          'source_type': 'scene_interaction',
          'source_id': 'inspect-broken-caravan',
          'player_facing': true,
          'hidden_debug': false,
          'player_visible_summary': 'The caravan attack was irregular.',
          'instrumentation_status': 'partial',
        },
      ],
      'history_outputs': [
        {
          'output_id': 'scene_result_feed:latest_development',
          'event_type': 'latest_development',
          'source_type': 'latest_development',
          'summary': 'The wreck tells an uneven story.',
          'player_visible_text': 'The wreck tells an uneven story.',
          'gm_debug_text': 'Latest development is player-facing.',
          'player_facing': true,
          'canonical': false,
          'instrumentation_status': 'partial',
        },
      ],
      'transitions': [
        {
          'transition_id': 'leave-broken-caravan-for-inn',
          'transition_type': 'scene_exit',
          'source_scene_id': 'broken-caravan-site',
          'target_scene_key': 'grey-road-inn',
          'availability_status': 'available',
          'player_facing': true,
          'hidden_debug': false,
          'instrumentation_status': 'available',
        },
      ],
      'audit_timeline': [
        {
          'audit_id': 'preview:submission-1',
          'timestamp': '2026-05-25T12:00:00Z',
          'event_type': 'beat_action_previewed',
          'summary': 'Inspect the broken axle.',
          'source_type': 'beat_action',
          'source_id': 'inspect-broken-caravan',
          'action_id': 'submission-1',
          'player_facing': false,
          'hidden_debug': true,
          'linked_debug_sections': ['preview_mapping', 'check_details'],
          'instrumentation_status': 'partial',
        },
      ],
      'validation': {
        'hard_errors': [],
        'warnings': [],
        'debug_notices': [
          {
            'code': 'runtime_state_reads_not_logged',
            'message':
                'Authored dependencies are shown when exact reads are not recorded.',
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
        'notes': ['Broken Caravan regression payload.'],
      },
    },
  });
}

void main() {
  testWidgets('Greyvale normal player scene does not expose inspector entry',
      (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorEntryPoint(
      canInspect: false,
      onOpen: () {},
    )));

    expect(find.text('Exploration Mechanics'), findsNothing);
  });

  testWidgets('Greyvale GM/dev inspector renders all regression sections',
      (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorView(
      workspace: _greyvaleBrokenCaravanWorkspace(),
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

    expect(find.textContaining('broken-caravan-site'), findsWidgets);
    expect(find.textContaining('Deep tracks leave the road'), findsWidgets);
    expect(find.textContaining('focus_broken_axle'), findsWidgets);
    expect(find.textContaining('inspect-broken-caravan'), findsWidgets);
    expect(find.textContaining('grey_road_mist'), findsWidgets);
    expect(find.textContaining('Elin Harrow'), findsWidgets);
    expect(find.textContaining('caravan_wreck.state'), findsWidgets);
    expect(find.textContaining('caravan_irregularity'), findsWidgets);
    expect(find.textContaining('leave-broken-caravan-for-inn'), findsWidgets);
    expect(
        find.textContaining('runtime_state_reads_not_logged'), findsOneWidget);
    expect(find.textContaining('Includes hidden dc: true'), findsOneWidget);
  });

  testWidgets('Greyvale Free Focus selection links inspector context',
      (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorView(
      workspace: _greyvaleBrokenCaravanWorkspace(),
    )));

    await tester.ensureVisible(find.textContaining('broken axle').first);
    await tester.tap(find.textContaining('broken axle').first);
    await tester.pumpAndSettle();

    expect(find.text('focus_broken_axle'), findsWidgets);
    expect(find.text('Clear linked selection'), findsOneWidget);
    expect(find.textContaining('Selected panel'), findsOneWidget);
  });
}
