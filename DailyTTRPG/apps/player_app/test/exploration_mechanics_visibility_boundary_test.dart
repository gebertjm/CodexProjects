import 'package:dailyttrpg_player_app/api/models.dart';
import 'package:dailyttrpg_player_app/campaign/campaign_scene_page.dart';
import 'package:dailyttrpg_player_app/campaign/exploration_mechanics_inspector_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

ExplorationMechanicsDebugWorkspace _debugWorkspaceFixture() {
  return ExplorationMechanicsDebugWorkspace.fromJson({
    'status': 'ok',
    'exploration_mechanics_debug': {
      'scene_state': {
        'scene_id': 'broken-caravan-site',
        'current_action_window_id': 'window-8',
      },
      'check_details': [
        {
          'check_id': 'beat_action:inspect-caravan',
          'source_type': 'beat_action',
          'source_id': 'inspect-caravan',
          'source_label': 'Inspect the caravan',
          'requires_check': true,
          'check_kind': 'skill_check',
          'skill': 'investigation',
          'dc': 17,
          'dc_visibility': 'gm_only',
          'raw_roll': 9,
          'total_result': 13,
          'gm_debug_summary': 'GM-only check detail.',
          'instrumentation_status': 'available',
        },
      ],
      'result_bands': [
        {
          'source_type': 'beat_action',
          'source_id': 'inspect-caravan',
          'band_id': 'failure',
          'classification': 'failure',
          'selected': true,
          'gm_notes': 'GM-only result band note.',
          'instrumentation_status': 'available',
        },
      ],
      'audit_timeline': [
        {
          'audit_id': 'audit-hidden-check',
          'event_type': 'check_evaluated',
          'summary': 'GM-only audit: hidden branch selected.',
          'hidden_debug': true,
          'instrumentation_status': 'available',
        },
      ],
      'validation': {
        'hard_errors': [],
        'warnings': [],
        'debug_notices': [
          {
            'code': 'raw_roll_debug_only',
            'message': 'Raw roll is visible only in the GM/dev inspector.',
          },
        ],
      },
      'visibility_boundaries': {
        'includes_hidden_dc': true,
        'includes_result_band_internals': true,
        'includes_audit_timeline': true,
        'player_endpoint_exclusion_confirmed': true,
        'player_dc_policy': 'Hidden DCs remain GM/dev-only.',
      },
    },
  });
}

void main() {
  testWidgets('normal player entry point is hidden', (tester) async {
    var opened = false;
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorEntryPoint(
      canInspect: false,
      onOpen: () {
        opened = true;
      },
    )));

    expect(find.text('Exploration Mechanics'), findsNothing);
    expect(opened, false);
  });

  testWidgets('authorized GM/dev entry point is visible and opens inspector',
      (tester) async {
    var opened = false;
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorEntryPoint(
      canInspect: true,
      onOpen: () {
        opened = true;
      },
    )));

    expect(find.text('Exploration Mechanics'), findsOneWidget);
    await tester.tap(find.text('Exploration Mechanics'));
    expect(opened, true);
  });

  test('player action preview model ignores backend debug confidence fields',
      () {
    final preview = ActionPreviewResponse.fromJson({
      'status': 'resolved',
      'candidate': {
        'verb': 'investigate',
        'target_affordance_id': 'caravan-wreck',
        'target_label': 'the broken caravan',
        'target_type': 'object',
        'confidence': 0.99,
      },
      'preview_mapping': {
        'debug_confidence': 0.99,
        'hidden_candidates': ['gm-only candidate'],
      },
      'validation': {'can_submit': true},
    });

    expect(preview.isResolved, true);
    expect(preview.candidate?.label, 'Investigate -> the broken caravan');
    expect(preview.message, isNull);
  });

  testWidgets('GM/dev inspector renders hidden mechanics only inside inspector',
      (tester) async {
    await tester.pumpWidget(_wrap(ExplorationMechanicsInspectorView(
      workspace: _debugWorkspaceFixture(),
    )));

    expect(
        find.textContaining('Exploration Mechanics Inspector'), findsWidgets);
    expect(find.textContaining('DC'), findsWidgets);
    expect(find.textContaining('17'), findsWidgets);
    expect(find.textContaining('GM-only result band note'), findsOneWidget);
    expect(find.textContaining('GM-only audit: hidden branch selected'),
        findsOneWidget);
    expect(find.textContaining('Includes hidden dc: true'), findsOneWidget);
    expect(find.textContaining('Player endpoint exclusion confirmed: true'),
        findsOneWidget);
  });
}
