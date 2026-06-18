import 'package:dailyttrpg_player_app/api/models.dart';
import 'package:dailyttrpg_player_app/campaign/dialogue_debug_workspace_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

DialogueDebugWorkspace _workspaceFixture() {
  return const DialogueDebugWorkspace(
    status: 'ok',
    checkedAt: '2026-05-22T12:00:00Z',
    sceneState: {
      'dialogue_scene_id': 'dialogue_elin_memory_focus_commit',
      'dialogue_scene_state_id': '91',
      'status': 'active',
      'participants': [
        {'participant_id': 'npc:elin_harrow', 'label': 'the shaken woman'},
      ],
      'entry_source': {'mode': 'resume_or_start'},
      'current_surface_ref': 'surface_elin_guarded',
      'committed_social_move_count': 1,
      'soft_target_max': 3,
      'fallback_usage': {'used_count': 0, 'exhausted': false},
      'transition': {},
    },
    availability: DialogueDebugAvailability(
      clarifyingQuestions: [
        DialogueDebugInteraction(
          interactionId: 'clarify_first_memory',
          label: 'What do you remember first?',
          status: 'available',
        ),
        DialogueDebugInteraction(
          interactionId: 'clarify_hidden',
          label: 'Hidden question',
          status: 'hidden',
          failedRequirements: ['hidden_by_visibility'],
        ),
      ],
      committedSocialMoves: [
        DialogueDebugInteraction(
          interactionId: 'move_listen_without_pressing',
          label: 'Listen without pressing',
          status: 'available',
        ),
        DialogueDebugInteraction(
          interactionId: 'move_locked',
          label: 'Locked move',
          status: 'locked',
          failedRequirements: ['relationship_read_failed'],
        ),
      ],
      exits: [
        DialogueDebugInteraction(
          interactionId: 'exit_return_to_inn',
          label: 'Let the conversation rest',
          status: 'available',
        ),
      ],
    ),
    previewMapping: {
      'status': 'resolved',
      'submitted_text': 'I listen without pressing.',
      'matched_authored_move_id': 'move_listen_without_pressing',
      'mapping_source': 'selected_id',
      'confidence': 1.0,
      'social_move_type': 'listen',
      'target_participant': 'npc:elin_harrow',
      'check': {'hidden_dc': 14},
    },
    relationshipState: DialogueDebugRelationshipState(
      definitions: [
        {'field_name': 'trust', 'ownership_default': 'persistent_npc_state'},
      ],
      persistentNpcState: [
        {
          'field_name': 'trust',
          'scope': 'persistent_npc_state',
          'value_json': 1
        },
      ],
      sceneLocalState: [
        {
          'field_name': 'pressure',
          'scope': 'dialogue_scene_state',
          'value_json': 0
        },
      ],
      recentReads: [
        DialogueDebugAuditRecord(
          auditRecordId: 'read-1',
          auditType: 'availability_check',
          fieldName: 'trust',
          scope: 'persistent_npc_state',
          summary: 'trust availability check',
          status: 'hidden',
        ),
      ],
      recentWrites: [
        DialogueDebugAuditRecord(
          auditRecordId: 'write-1',
          auditType: 'write',
          interactionId: 'move_listen_without_pressing',
          fieldName: 'trust',
          scope: 'persistent_npc_state',
          summary: 'trust write',
          status: 'player_perceived',
        ),
      ],
    ),
    transcript: DialogueDebugTranscript(
      turns: [
        DialogueDebugTranscriptTurn(
          turnId: '1',
          turnIndex: 0,
          turnType: 'npc_surface',
          speakerLabel: 'the shaken woman',
          sourceInteractionId: 'surface_elin_guarded',
          visibilityScope: 'player',
          playerFacingContent: {'text': 'She watches the fire.'},
        ),
        DialogueDebugTranscriptTurn(
          turnId: '2',
          turnIndex: 1,
          turnType: 'system_summary',
          visibilityScope: 'gm_dev',
          playerFacingContent: {'text': 'GM-only transcript note.'},
          gmDevContentRef: {'debug': true},
        ),
      ],
    ),
    annotationCorrectionChains: {
      'note':
          'Full annotation/correction chain history is visible to GM/dev review.',
      'chains': [
        {
          'chain_id': '44',
          'target_type': 'completed_dialogue_record',
          'target_id': '77',
          'chain_type': 'mixed',
          'current_player_facing_understanding': {
            'text': 'Updated understanding: Elin remembers the wheel crack.',
          },
          'annotation_records': [
            {
              'record_kind': 'annotation',
              'record_id': '101',
              'record_type': 'suggestion',
              'review_status': 'pending_review',
              'lifecycle_status': 'draft',
              'original_text': 'Pending internal suggestion.',
            },
            {
              'record_kind': 'annotation',
              'record_id': '102',
              'record_type': 'replacement',
              'review_status': 'approved_with_edits',
              'lifecycle_status': 'active',
              'approved_or_active_text':
                  'Updated understanding: Elin remembers the wheel crack.',
            },
          ],
          'correction_records': [
            {
              'record_kind': 'correction',
              'record_id': '201',
              'record_type': 'generated_correction',
              'review_status': 'rejected',
              'lifecycle_status': 'inactive',
              'rejection_reason': 'Not material.',
              'original_text': 'Rejected correction.',
            },
          ],
        },
      ],
    },
    auditTimeline: [
      DialogueDebugAuditRecord(
        auditRecordId: 'event-1',
        auditType: 'relationship_write',
        eventId: 'relationship_audit:1',
        eventType: 'relationship_write',
        interactionId: 'move_listen_without_pressing',
        fieldName: 'trust',
        status: 'player_perceived',
        summary: 'trust write',
      ),
      DialogueDebugAuditRecord(
        auditRecordId: 'event-2',
        auditType: 'committed_social_move_result',
        eventId: 'social_move:1',
        eventType: 'committed_social_move_result',
        interactionId: 'move_listen_without_pressing',
        status: 'resolved',
        summary: 'Her breathing steadies.',
      ),
    ],
    validation: DialogueDebugValidation(
      warnings: [
        DialogueDebugIssue(
          code: 'scene_json_unavailable',
          message: 'Scene JSON unavailable.',
        ),
      ],
      debugNotices: [
        DialogueDebugIssue(
          code: 'test_notice',
          message: 'Debug notice.',
        ),
      ],
    ),
    testPaths: DialogueDebugTestPaths(
      note: 'Dialogue path harness is available.',
      availableModes: ['happy_path', 'validation_only'],
      checks: [
        DialogueDebugTestCheck(
          checkId: 'has_reachable_exit',
          label: 'At least one authored exit is present',
          status: 'pass',
        ),
      ],
    ),
  );
}

void main() {
  testWidgets('DialogueDebugWorkspace renders required GM/dev panels',
      (tester) async {
    await tester.pumpWidget(_wrap(DialogueDebugWorkspaceView(
      workspace: _workspaceFixture(),
    )));

    expect(find.text('Scene State'), findsOneWidget);
    expect(find.text('Availability'), findsOneWidget);
    expect(find.text('Preview Mapping'), findsOneWidget);
    expect(find.text('Relationship / Social State'), findsOneWidget);
    expect(find.text('Transcript'), findsOneWidget);
    expect(find.text('Annotation / Correction Chains'), findsOneWidget);
    expect(find.text('Audit Timeline'), findsOneWidget);
    expect(find.text('Validation'), findsOneWidget);
    expect(find.text('Test Paths'), findsOneWidget);
    expect(find.textContaining('Hidden DC'), findsOneWidget);
    expect(find.textContaining('Confidence'), findsOneWidget);
    expect(find.text('Hard Errors (0)'), findsOneWidget);
    expect(find.textContaining('pending_review'), findsOneWidget);
    expect(find.textContaining('approved_with_edits'), findsOneWidget);
    expect(find.textContaining('Updated understanding'), findsWidgets);
    expect(find.text('Run Simulation'), findsOneWidget);
    expect(find.text('happy path'), findsOneWidget);
  });

  testWidgets('Availability selection links selected interaction to preview',
      (tester) async {
    String? selectedInteractionId;
    await tester.pumpWidget(_wrap(StatefulBuilder(
      builder: (context, setState) {
        return DialogueDebugWorkspaceView(
          workspace: _workspaceFixture(),
          selectedInteractionId: selectedInteractionId,
          onSelectInteraction: (interactionId) {
            setState(() => selectedInteractionId = interactionId);
          },
        );
      },
    )));

    await tester.tap(find.textContaining('Listen without pressing').first);
    await tester.pumpAndSettle();

    expect(selectedInteractionId, 'move_listen_without_pressing');
    expect(
      find.text('Selected context: move_listen_without_pressing'),
      findsOneWidget,
    );
  });

  testWidgets('Transcript panel can filter to player-facing turns',
      (tester) async {
    await tester.pumpWidget(_wrap(TranscriptPanel(
      transcript: _workspaceFixture().transcript,
    )));

    expect(find.text('She watches the fire.'), findsOneWidget);
    expect(find.text('GM-only transcript note.'), findsOneWidget);

    await tester.tap(find.text('Player-facing only'));
    await tester.pumpAndSettle();

    expect(find.text('She watches the fire.'), findsOneWidget);
    expect(find.text('GM-only transcript note.'), findsNothing);
  });

  testWidgets('TestPathsPanel can run and display simulation results',
      (tester) async {
    await tester.pumpWidget(_wrap(TestPathsPanel(
      testPaths: _workspaceFixture().testPaths,
      onRunPathTest: (mode) async => {
        'status': 'passed',
        'path_mode': mode,
        'final_status': 'exited',
        'steps': [
          {
            'step_id': 'enter',
            'type': 'enter_dialogue',
            'status': 'pass',
            'relationship_diffs': [],
            'transcript_effects': {
              'new_turns': [],
            },
          },
          {
            'step_id': 'submit',
            'type': 'submit_committed_social_move',
            'status': 'pass',
            'relationship_diffs': [
              {'field_name': 'trust'}
            ],
            'transcript_effects': {
              'new_turns': [
                {'turn_type': 'social_move_result'}
              ],
            },
          },
        ],
        'findings': {
          'hard_errors': [],
          'warnings': [],
          'debug_notices': [],
        },
      },
    )));

    await tester.tap(find.text('Run Simulation'));
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.textContaining('Status: passed'), findsOneWidget);
    expect(find.textContaining('Final: exited'), findsOneWidget);
    expect(find.textContaining('submit · submit_committed_social_move'),
        findsOneWidget);
    expect(find.textContaining('relationship diffs: 1'), findsOneWidget);
    expect(find.text('Export JSON'), findsOneWidget);
  });
}
