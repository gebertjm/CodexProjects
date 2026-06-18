import 'package:dailyttrpg_player_app/api/api_client.dart';
import 'package:dailyttrpg_player_app/api/models.dart';
import 'package:dailyttrpg_player_app/campaign/campaign_history_page.dart';
import 'package:dailyttrpg_player_app/campaign/campaign_knowledge_page.dart';
import 'package:dailyttrpg_player_app/campaign/campaign_scene_page.dart';
import 'package:dailyttrpg_player_app/campaign/dialogue_scene_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

const _hiddenFragments = [
  'hidden_dc',
  'raw_roll',
  'total_result',
  'modifier_breakdown',
  'result_band',
  'branch_id',
  'hidden_requirements',
  'gm_notes',
  'debug_summary',
  'state_write',
  'relationship_meter',
  'preview_confidence',
  'routing_confidence',
  'path_harness',
  'hard_errors',
  'future_supported',
  'combat_pending',
  'combat_routing',
  'stack trace',
  'duplicate key',
  'violates constraint',
  'whispering presence',
];

String _renderedText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data ?? widget.textSpan?.toPlainText() ?? '')
      .where((text) => text.trim().isNotEmpty)
      .join('\n')
      .toLowerCase();
}

void _expectRenderedPlayerSafe(WidgetTester tester) {
  final rendered = _renderedText(tester);
  for (final fragment in _hiddenFragments) {
    expect(
      rendered,
      isNot(contains(fragment)),
      reason: 'Rendered UI leaked hidden/internal fragment "$fragment".',
    );
  }
}

CharacterSummary _character() {
  return const CharacterSummary(
    characterId: 'character-1',
    name: 'Aric',
    level: 1,
    characterClass: 'Fighter',
    species: 'Human',
    status: 'active',
    isActive: true,
  );
}

CurrentSceneView _sceneFixture({
  SceneReference? sceneReference,
  SceneResultFeed? sceneResultFeed,
  DashboardActionStatus? actionStatus,
  GreyvaleSliceEndpointStatus? sliceEndpoint,
  List<SceneAffordance>? visibleAffordances,
  ActiveDialogueSummary? activeDialogue,
}) {
  return CurrentSceneView(
    state: 'active',
    activeCharacter: _character(),
    campaign: const CurrentSceneCampaign(
      campaignInstanceId: 'campaign-1',
      campaignName: 'Shadows on the Grey Road',
      worldName: 'Greyvale',
    ),
    scene: const CurrentSceneSummary(
      sceneId: 'grey-road-inn',
      title: 'Grey Road Inn',
      locationName: 'Grey Road',
      description: 'Rain taps the inn windows while travelers lower voices.',
    ),
    objective: const SceneObjective(
      objectiveId: 'gather-local-insight',
      title: 'Gather local insight',
      status: 'active',
    ),
    visibleNpcs: const [],
    knownRelevantNpcs: const [],
    visibleAffordances: visibleAffordances ??
        const [
          SceneAffordance(
            affordanceId: 'road-pattern',
            label: 'road traffic',
            type: 'situation',
            description: 'Travelers are avoiding the old route.',
            actions: ['investigate'],
          ),
        ],
    knownFacts: const [],
    sceneStateSummary: const [],
    actionStatus: actionStatus ??
        const DashboardActionStatus(
          state: 'action_needed',
          label: 'Action needed',
          description: 'Choose one clear action.',
          actionWindowId: 'window-1',
          canSubmit: true,
        ),
    sliceEndpoint: sliceEndpoint,
    activeDialogue: activeDialogue,
    sceneNarration: const SceneNarration(
      mode: 'full',
      voice: 'second_person_present',
      title: 'Grey Road Inn',
      paragraphs: [
        SceneNarrationParagraph(
          kind: 'setting',
          text: 'You stand in the Grey Road Inn common room.',
        ),
      ],
    ),
    actionComposer: const SceneActionComposer(
      targetChips: [
        ActionTargetChip(
          id: 'road-pattern',
          type: 'situation',
          label: 'road traffic',
          insertText: 'road traffic',
        ),
      ],
    ),
    sceneReference: sceneReference,
    sceneResultFeed: sceneResultFeed,
  );
}

DialogueSceneView _dialogueFixture({bool exited = false}) {
  return DialogueSceneView(
    state: exited ? 'exited' : 'active',
    activeCharacter: _character(),
    campaign: const CurrentSceneCampaign(
      campaignInstanceId: 'campaign-1',
      campaignName: 'Shadows on the Grey Road',
    ),
    dialogueScene: const DialogueSceneInfo(
      dialogueSceneId: 'dialogue_tomas_road_pattern',
      title: 'Tomas Watches The Road',
    ),
    dialogueSceneState: DialogueSceneState(
      dialogueSceneStateId: 'dialogue-state-1',
      transcriptId: 'transcript-1',
      status: exited ? 'exited' : 'active',
      committedSocialMoveCount: 0,
      softTargetMax: 3,
      completedDialogueRecordId: exited ? 'record-1' : null,
    ),
    participants: const [
      DialogueParticipant(participantId: 'npc:tomas_rell', label: 'Tomas Rell'),
    ],
    conversationSurface: const ConversationSurface(
      paragraphs: [
        DialogueSurfaceParagraph(
          kind: 'surface',
          text: 'Tomas keeps polishing the same cup.',
        ),
      ],
    ),
    latestDevelopment: exited
        ? const DialogueLatestDevelopment(
            summary: 'Tomas gave you the safest road lead he could.',
          )
        : null,
    clarifyingQuestions: const [
      DialogueClarifyingQuestion(
        questionId: 'clarify_bandits',
        label: 'What makes this unlike bandits?',
        status: 'available',
        isAvailable: true,
        isAsked: false,
      ),
    ],
    committedSocialMoves: const [
      DialogueCommittedSocialMove(
        moveId: 'move_reassure',
        label: 'Reassure Tomas',
        status: 'available',
        isAvailable: true,
        spendsDialogueBeat: true,
        requiresCheck: false,
      ),
    ],
    dialogueExits: const [
      DialogueExit(
        exitId: 'exit_common_room',
        label: 'Return to the common room',
        status: 'available',
        isAvailable: true,
      ),
    ],
  );
}

KnowledgeJournal _knowledgeFixture() {
  return KnowledgeJournal.fromJson({
    'state': 'active',
    'known_count': 1,
    'campaign': {
      'campaign_instance_id': 'campaign-1',
      'campaign_name': 'Shadows on the Grey Road',
      'world_name': 'Greyvale',
    },
    'active_character': {'character_id': 'character-1', 'name': 'Aric'},
    'current_objective': {
      'objective_id': 'gather-local-insight',
      'title': 'Gather local insight',
      'status': 'active',
    },
    'sections': {
      'clues': [
        {
          'knowledge_id': 'innkeeper_tracks_road_patterns',
          'title': 'Pattern of Attacks',
          'text':
              'Tomas thinks the attacks do not match ordinary bandit trouble.',
          'confidence': 'partial',
          'source': {'label': 'Tomas Rell'},
        },
      ],
    },
  });
}

CampaignHistory _historyFixture() {
  return CampaignHistory.fromJson({
    'state': 'active',
    'campaign': {
      'campaign_instance_id': 'campaign-1',
      'campaign_name': 'Shadows on the Grey Road',
      'world_name': 'Greyvale',
    },
    'active_character': {'character_id': 'character-1', 'name': 'Aric'},
    'timeline': [
      {
        'id': 'history-1',
        'type': 'dialogue_result',
        'title': 'Latest development',
        'summary': 'Tomas points you toward the survivor by the hearth.',
        'scene_title': 'Grey Road Inn',
        'location_name': 'Grey Road',
        'objective_updates': [
          {'progress_text': 'Gather local insight advanced.'},
        ],
        'major_discoveries': [
          {'text': 'The road pattern feels wrong.'},
        ],
      },
    ],
  });
}

class _FakeDashboardApi implements PlayerDashboardApi {
  _FakeDashboardApi({
    CurrentSceneView? scene,
    ActionPreviewResponse? preview,
    this.submitError,
    KnowledgeJournal? knowledge,
    CampaignHistory? history,
  })  : scene = scene ?? _sceneFixture(),
        preview = preview ??
            const ActionPreviewResponse(
              status: 'resolved',
              candidate: ActionCandidate(
                verb: 'investigate',
                targetAffordanceId: 'road-pattern',
                targetLabel: 'road traffic',
              ),
              actionWindowId: 'window-1',
              lifecycleContext: ActionLifecycleContext(
                actionWindowId: 'window-1',
                submissionVersion: 0,
              ),
              canSubmit: true,
            ),
        knowledge = knowledge ?? _knowledgeFixture(),
        history = history ?? _historyFixture();

  final CurrentSceneView scene;
  final ActionPreviewResponse preview;
  final ApiException? submitError;
  final KnowledgeJournal knowledge;
  final CampaignHistory history;
  ActionLifecycleContext? submittedLifecycleContext;
  String? submittedActionWindowId;
  String? previewedRawText;
  String? previewedSelectedVerb;
  String? previewedSelectedAffordanceId;
  String? submittedRawText;
  String? submittedSelectedVerb;
  String? submittedSelectedAffordanceId;

  @override
  Future<CurrentSceneView> getCurrentScene(
      {bool includeMechanics = true}) async {
    return scene;
  }

  @override
  Future<ActionPreviewResponse> previewAction({
    required String rawText,
    String? selectedVerb,
    String? selectedAffordanceId,
    String? continueFreeFocusInteractionId,
  }) async {
    previewedRawText = rawText;
    previewedSelectedVerb = selectedVerb;
    previewedSelectedAffordanceId = selectedAffordanceId;
    return preview;
  }

  @override
  Future<ActionSubmitResponse> submitAction({
    required String rawText,
    String? selectedVerb,
    String? selectedAffordanceId,
    String? continueFreeFocusInteractionId,
    String? actionWindowId,
    ActionLifecycleContext? lifecycleContext,
  }) async {
    submittedRawText = rawText;
    submittedSelectedVerb = selectedVerb;
    submittedSelectedAffordanceId = selectedAffordanceId;
    submittedActionWindowId = actionWindowId;
    submittedLifecycleContext = lifecycleContext;
    final error = submitError;
    if (error != null) {
      throw error;
    }
    return const ActionSubmitResponse(
      status: 'submitted',
      actionStatus: DashboardActionStatus(
        state: 'action_submitted',
        label: 'Action submitted',
        description: 'Waiting for the next story beat.',
      ),
    );
  }

  @override
  Future<KnowledgeJournal> getCampaignKnowledge() async => knowledge;

  @override
  Future<CampaignHistory> getCampaignHistory() async => history;

  @override
  Future<FreeFocusResolveResponse> resolveFreeFocus({
    required String interactionId,
    String? sceneId,
  }) async {
    return const FreeFocusResolveResponse(result: FreeFocusResult());
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeDialogueApi implements DialogueApi {
  _FakeDialogueApi({
    this.submitError,
    this.completedRecord,
  });

  final ApiException? submitError;
  final CompletedDialogueRecord? completedRecord;
  DialogueLifecycleContext? previewLifecycleContext;
  DialogueLifecycleContext? submitLifecycleContext;

  @override
  Future<DialogueSocialMovePreviewResponse> previewSocialMove({
    required String submittedText,
    String? dialogueSceneId,
    String? moveId,
    bool continueAsCommittedSocialMove = false,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    previewLifecycleContext = lifecycleContext;
    return const DialogueSocialMovePreviewResponse(
      status: 'preview',
      lifecycleContext: DialogueLifecycleContext(
        dialogueSceneStateId: 'dialogue-state-1',
        committedSocialMoveCount: 0,
      ),
      preview: DialogueSocialMovePreview(
        interpretation: 'You reassure Tomas that partial information helps.',
        spendsDialogueBeat: true,
        requiresCheck: false,
      ),
    );
  }

  @override
  Future<DialogueSocialMoveSubmitResponse> submitSocialMove({
    required String submittedText,
    String? dialogueSceneId,
    String? moveId,
    bool continueAsCommittedSocialMove = false,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    submitLifecycleContext = lifecycleContext;
    final error = submitError;
    if (error != null) {
      throw error;
    }
    return DialogueSocialMoveSubmitResponse(
      status: 'resolved',
      currentDialogue: _dialogueFixture(),
    );
  }

  @override
  Future<DialogueClarifyingQuestionResolveResponse> resolveClarifyingQuestion({
    required String questionId,
    String? dialogueSceneId,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    return DialogueClarifyingQuestionResolveResponse(
      status: 'resolved',
      result: DialogueClarifyingQuestion(
        questionId: questionId,
        label: 'What makes this unlike bandits?',
        status: 'asked',
        isAvailable: false,
        isAsked: true,
        result: const DialogueTextResult(
          text: 'Tomas describes a pattern that does not fit robbery.',
        ),
      ),
      currentDialogue: _dialogueFixture(),
    );
  }

  @override
  Future<DialogueExitResolveResponse> resolveExit({
    required String exitId,
    String? dialogueSceneId,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    return DialogueExitResolveResponse(
      status: 'exited',
      exitResult: const {'text': 'You return to the common room.'},
      completedDialogueRecord: completedRecord,
      currentDialogue: _dialogueFixture(exited: true),
    );
  }

  @override
  Future<DialogueArchiveRecordResponse> getArchiveRecord(
      String recordId) async {
    return DialogueArchiveRecordResponse(
      record: completedRecord ??
          const CompletedDialogueRecord(
            completedDialogueRecordId: 'record-1',
            compactSummary: 'Tomas shared the road pattern.',
          ),
    );
  }

  @override
  Future<DialogueCurrentTranscriptResponse> getCurrentTranscript({
    String? dialogueSceneId,
  }) async {
    return const DialogueCurrentTranscriptResponse(
      transcript: DialogueCurrentTranscript(
        transcriptId: 'transcript-1',
        turns: [
          DialogueTranscriptTurn(
            turnId: 'turn-1',
            turnIndex: 1,
            turnType: 'npc_surface',
            content: {'text': 'Tomas keeps polishing the same cup.'},
          ),
        ],
      ),
    );
  }

  @override
  Future<DialogueSceneView> getCurrentDialogue(
      {String? dialogueSceneId, bool allowReentry = false}) async {
    return _dialogueFixture();
  }

  @override
  Future<DialogueArchiveList> getArchive({int limit = 20}) {
    throw UnimplementedError();
  }

  @override
  Future<DialogueArchiveSearchResults> searchArchive(String query) {
    throw UnimplementedError();
  }
}

void main() {
  test('player API error mapping removes backend/internal details', () {
    final stale = playerSafeApiErrorMessage(
      statusCode: 409,
      message: 'That moment has changed. action_window_id=12 branch_id=fail',
    );
    expect(stale,
        'That moment has changed. Review the current scene and choose your next action.');

    final internal = playerSafeApiErrorMessage(
      statusCode: 409,
      message: 'duplicate key violates constraint dnd5e_action_window_pkey',
    );
    expect(
      internal,
      'DailyTTRPG could not complete that request. Refresh the current scene and try again.',
    );

    expect(
      playerSafeApiErrorCode(
        statusCode: 409,
        message: 'This conversation has ended. Return to the current scene.',
      ),
      'DIALOGUE_ENDED',
    );
  });

  testWidgets('exploration stale preview clears old submit controls',
      (tester) async {
    final fakeApi = _FakeDashboardApi(
      submitError: const ApiException(
        'That moment has changed. Review the current scene and choose your next action.',
        statusCode: 409,
        code: 'STALE_PREVIEW',
      ),
    );

    await tester.pumpWidget(MaterialApp(
      home: CampaignScenePage(
        dashboardApi: fakeApi,
        onBack: () {},
        onSignOut: () async {},
        navigate: (_) {},
      ),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'I study the road traffic.');
    await tester.ensureVisible(find.text('road traffic'));
    await tester.tap(find.text('road traffic'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Preview Action'));
    await tester.tap(find.text('Preview Action'));
    await tester.pumpAndSettle();

    expect(find.text('Submit Action'), findsOneWidget);
    await tester.ensureVisible(find.text('Submit Action'));
    await tester.tap(find.text('Submit Action'));
    await tester.pumpAndSettle();

    expect(fakeApi.submittedActionWindowId, 'window-1');
    expect(fakeApi.submittedLifecycleContext?.actionWindowId, 'window-1');
    expect(
      find.text(
        'That moment has changed. Review the current scene and choose your next action.',
      ),
      findsOneWidget,
    );
    expect(find.text('Submit Action'), findsNothing);
    expect(find.textContaining('New scene detail revealed'), findsOneWidget);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('exploration dialogue entry submits talk as the beat action',
      (tester) async {
    String? navigatedRoute;
    final fakeApi = _FakeDashboardApi(
      scene: _sceneFixture(
        sceneReference: const SceneReference(
          peopleNearby: [
            SceneReferenceEntry(
              id: 'npc:tomas-rell',
              type: 'npc',
              label: 'Tomas Rell',
              description: 'The innkeeper watches the road talk gather.',
              dialogueSceneId: 'greyvale_tomas_roadside_worries_dialogue',
              dialogueTitle: "Tomas Rell and the Road's Pattern",
            ),
          ],
        ),
        visibleAffordances: const [
          SceneAffordance(
            affordanceId: 'npc:tomas-rell',
            label: 'Tomas Rell',
            type: 'npc',
            description: 'The innkeeper watches the road talk gather.',
            actions: ['talk'],
            dialogueSceneId: 'greyvale_tomas_roadside_worries_dialogue',
            dialogueTitle: "Tomas Rell and the Road's Pattern",
          ),
        ],
      ),
      preview: const ActionPreviewResponse(
        status: 'resolved',
        candidate: ActionCandidate(
          verb: 'talk',
          targetAffordanceId: 'npc:tomas-rell',
          targetLabel: 'Tomas Rell',
          targetType: 'npc',
        ),
        actionWindowId: 'window-1',
        lifecycleContext: ActionLifecycleContext(
          actionWindowId: 'window-1',
          submissionVersion: 0,
        ),
        canSubmit: true,
      ),
    );

    await tester.pumpWidget(MaterialApp(
      home: CampaignScenePage(
        dashboardApi: fakeApi,
        onBack: () {},
        onSignOut: () async {},
        navigate: (route) => navigatedRoute = route,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Conversations'), findsOneWidget);
    expect(
      find.textContaining('committed beat action'),
      findsOneWidget,
    );
    expect(find.textContaining('Tomas Rell'), findsWidgets);
    final talkButton = find
        .byKey(
          const Key(
              'conversation_entry_greyvale_tomas_roadside_worries_dialogue'),
        )
        .first;
    expect(talkButton, findsOneWidget);
    await tester.ensureVisible(talkButton);
    await tester.pumpAndSettle();
    await tester.tap(talkButton);
    await tester.pumpAndSettle();

    expect(navigatedRoute, isNull);
    expect(fakeApi.previewedRawText, 'Talk to Tomas Rell');
    expect(fakeApi.previewedSelectedVerb, 'talk');
    expect(fakeApi.previewedSelectedAffordanceId, 'npc:tomas-rell');
    expect(fakeApi.submittedRawText, 'Talk to Tomas Rell');
    expect(fakeApi.submittedSelectedVerb, 'talk');
    expect(fakeApi.submittedSelectedAffordanceId, 'npc:tomas-rell');
    expect(fakeApi.submittedActionWindowId, 'window-1');
    expect(
      find.textContaining('Conversation submitted for this beat'),
      findsOneWidget,
    );
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('exploration paths do not render as conversations',
      (tester) async {
    final fakeApi = _FakeDashboardApi(
      scene: _sceneFixture(
        sceneReference: const SceneReference(
          visiblePaths: [
            SceneReferenceEntry(
              id: 'road_to_inn',
              type: 'place',
              label: 'road toward the inn',
              description: 'The Grey Road continues toward witnesses.',
              dialogueSceneId: 'greyvale_tomas_roadside_worries_dialogue',
              dialogueTitle: "Tomas Rell and the Road's Pattern",
            ),
          ],
          actionTargets: [
            SceneReferenceEntry(
              id: 'road_to_inn',
              type: 'place',
              label: 'road toward the inn',
              dialogueSceneId: 'greyvale_tomas_roadside_worries_dialogue',
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(
      home: CampaignScenePage(
        dashboardApi: fakeApi,
        onBack: () {},
        onSignOut: () async {},
        navigate: (_) {},
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Conversations'), findsNothing);
    expect(find.textContaining('Talk with road toward the inn'), findsNothing);
    expect(
      find.byKey(
        const Key(
            'conversation_entry_greyvale_tomas_roadside_worries_dialogue'),
      ),
      findsNothing,
    );
    expect(
      find.byKey(
        const Key('dialogue_entry_greyvale_tomas_roadside_worries_dialogue'),
      ),
      findsNothing,
    );
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('latest dialogue exchange offers a bridge into focused dialogue',
      (tester) async {
    String? navigatedRoute;
    final fakeApi = _FakeDashboardApi(
      scene: _sceneFixture(
        sceneReference: const SceneReference(
          peopleNearby: [
            SceneReferenceEntry(
              id: 'npc:tomas-rell',
              type: 'npc',
              label: 'the innkeeper',
              description: 'He watches travelers over the rim of a cup.',
              dialogueSceneId: 'greyvale_tomas_roadside_worries_dialogue',
            ),
          ],
        ),
        sceneResultFeed: const SceneResultFeed(
          sceneId: 'grey-road-inn',
          sceneType: 'dialogue',
          latestResult: SceneResultEntry(
            beatResultId: 'beat-result-dialogue-started',
            title: 'Exchange with the innkeeper',
            summary: 'Dialogue started: Tomas and the Road.',
            narration: 'Dialogue started: Tomas and the Road.',
            sceneType: 'dialogue',
            kind: 'dialogue_result',
            submittedActionSummary: 'talk to the innkeeper',
            interpretedActionSummary: 'Talk -> the innkeeper',
            visibleChanges: [],
            knowledgeGained: [],
            objectiveUpdates: [],
            safeMechanics: [],
            isLatest: true,
          ),
          recentEntries: [],
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(
      home: CampaignScenePage(
        dashboardApi: fakeApi,
        onBack: () {},
        onSignOut: () async {},
        navigate: (route) => navigatedRoute = route,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Latest Exchange'), findsOneWidget);
    expect(find.text('Dialogue started: Tomas and the Road.'), findsOneWidget);
    final latestConversationButton = find.byKey(
      const Key(
          'latest_dialogue_entry_greyvale_tomas_roadside_worries_dialogue'),
    );
    expect(latestConversationButton, findsOneWidget);
    await tester.tap(latestConversationButton);
    await tester.pumpAndSettle();

    expect(
      navigatedRoute,
      '/play/campaign/dialogue?dialogue_scene_id=greyvale_tomas_roadside_worries_dialogue',
    );
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets(
      'Rusk endpoint scene shows review state and hides action composer',
      (tester) async {
    final fakeApi = _FakeDashboardApi(
      scene: _sceneFixture(
        actionStatus: const DashboardActionStatus(
          state: 'slice_endpoint_reached',
          label: 'Slice endpoint reached',
          description:
              'You have reached the end of the current Greyvale playable slice.',
          canSubmit: false,
          canEdit: false,
        ),
        sliceEndpoint: const GreyvaleSliceEndpointStatus(
          isEndpointReached: true,
          state: 'endpoint_reached',
          label: 'Greyvale slice endpoint reached',
          headline: 'The shrine confrontation is ready.',
          message:
              'You have reached the end of the current Greyvale playable slice.',
          latestDevelopment:
              'Rusk has forced the shrine threat into a confrontation.',
          currentStatus:
              'The current Greyvale slice is ready to continue when combat support is enabled.',
          nextStep:
              'Review your journal, campaign history, and completed conversations.',
          recoveryAction: 'review_progress',
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(
      home: CampaignScenePage(
        dashboardApi: fakeApi,
        onBack: () {},
        onSignOut: () async {},
        navigate: (_) {},
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Greyvale slice endpoint reached'), findsOneWidget);
    expect(find.text('The shrine confrontation is ready.'), findsOneWidget);
    expect(find.textContaining('end of the current Greyvale playable slice'),
        findsWidgets);
    expect(find.text('Latest Development'), findsWidgets);
    expect(find.text('Current Status'), findsOneWidget);
    expect(find.text('Next Step'), findsOneWidget);
    expect(find.textContaining('Review your journal'), findsOneWidget);
    expect(find.textContaining('What does Aric do?'), findsNothing);
    expect(find.text('Preview Action'), findsNothing);
    expect(find.text('Submit Action'), findsNothing);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('dialogue stale social move clears preview and passes lifecycle',
      (tester) async {
    final fakeApi = _FakeDialogueApi(
      submitError: const ApiException(
        'That moment has changed. Review the current conversation and choose your next move.',
        statusCode: 409,
        code: 'CURRENT_CONVERSATION_CHANGED',
      ),
    );
    await tester.pumpWidget(_wrap(CommittedSocialMoveComposer(
      dialogue: _dialogueFixture(),
      onPreview: fakeApi.previewSocialMove,
      onSubmit: fakeApi.submitSocialMove,
      onAskClarifyingQuestion: (questionId) async {
        return _dialogueFixture().clarifyingQuestions.single;
      },
    )));

    await tester.tap(find.text('Reassure Tomas'));
    await tester.pump();
    await tester.tap(find.text('Preview Social Move'));
    await tester.pumpAndSettle();
    expect(find.text('Submit Move'), findsOneWidget);

    await tester.tap(find.text('Submit Move'));
    await tester.pumpAndSettle();

    expect(fakeApi.previewLifecycleContext?.dialogueSceneStateId,
        'dialogue-state-1');
    expect(fakeApi.submitLifecycleContext?.dialogueSceneStateId,
        'dialogue-state-1');
    expect(
      find.text(
        'That moment has changed. Review the current conversation and choose your next move.',
      ),
      findsOneWidget,
    );
    expect(find.text('Submit Move'), findsNothing);
    expect(find.textContaining('Draft may be outdated'), findsOneWidget);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('completed dialogue hides active controls and offers recovery',
      (tester) async {
    await tester.pumpWidget(_wrap(DialogueSceneViewBody(
      initialDialogue: _dialogueFixture(exited: true),
      dialogueApi: _FakeDialogueApi(
        completedRecord: const CompletedDialogueRecord(
          completedDialogueRecordId: 'record-1',
          compactSummary: 'Tomas shared the road pattern.',
        ),
      ),
      dashboardApi: _FakeDashboardApi(),
      onScene: () {},
    )));
    await tester.pumpAndSettle();

    expect(find.text('Conversation Complete'), findsOneWidget);
    expect(find.text('Return to Current Scene'), findsOneWidget);
    expect(find.text('Clarifying Questions'), findsNothing);
    expect(find.text('Committed Social Move'), findsNothing);
    expect(find.text('Exits'), findsNothing);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('knowledge journal renders deduped safe Greyvale clues',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: CampaignKnowledgePage(
        dashboardApi: _FakeDashboardApi(),
        onSignOut: () async {},
        navigate: (_) {},
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Pattern of Attacks'), findsOneWidget);
    expect(find.textContaining('ordinary bandit trouble'), findsOneWidget);
    expect(find.text('Partial'), findsOneWidget);
    expect(find.text('Tomas Rell'), findsOneWidget);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('history renders safe latest development and objective updates',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: CampaignHistoryPage(
        dashboardApi: _FakeDashboardApi(),
        onSignOut: () async {},
        navigate: (_) {},
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Latest development'), findsOneWidget);
    expect(find.textContaining('survivor by the hearth'), findsOneWidget);
    await tester.tap(find.text('Details'));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Gather local insight advanced'), findsOneWidget);
    expect(find.textContaining('The road pattern feels wrong'), findsOneWidget);
    _expectRenderedPlayerSafe(tester);
  });
}
