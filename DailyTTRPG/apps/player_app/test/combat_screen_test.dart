import 'package:dailyttrpg_player_app/combat/combat_models.dart';
import 'package:dailyttrpg_player_app/combat/combat_repository.dart';
import 'package:dailyttrpg_player_app/combat/combat_screen.dart';
import 'package:flutter/material.dart';
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
      reason: 'Rendered combat UI leaked "$fragment".',
    );
  }
}

CombatView _activeView({CombatResultBundle? latestResult}) {
  return CombatView(
    encounterTitle: 'Rusk at the Shrine',
    combatStatus: 'active',
    round: 1,
    currentActor: const CombatParticipant(
      participantId: 'player-1',
      displayName: 'Aric',
      isActor: true,
      isPlayer: true,
      hitPoints: CombatHitPoints(current: 11, maximum: 14),
    ),
    currentZone: 'Shrine Threshold',
    participants: const [
      CombatParticipant(
        participantId: 'player-1',
        displayName: 'Aric',
        isActor: true,
        isPlayer: true,
        hitPoints: CombatHitPoints(current: 11, maximum: 14),
        zone: 'Shrine Threshold',
      ),
      CombatParticipant(
        participantId: 'rusk',
        displayName: 'Rusk',
        faction: 'enemy',
        healthBand: 'bloodied',
        hitPoints: CombatHitPoints(current: 7, maximum: 20),
        zone: 'Shrine Dais',
      ),
    ],
    initiative: const [
      CombatInitiativeEntry(
        participantId: 'player-1',
        displayName: 'Aric',
        current: true,
      ),
      CombatInitiativeEntry(participantId: 'rusk', displayName: 'Rusk'),
    ],
    resources: const [
      CombatResource(
        resourceId: 'second_wind',
        label: 'Second Wind',
        current: 1,
        maximum: 1,
      ),
    ],
    movement: const CombatMovement(base: 30, spent: 0, remaining: 30),
    decisionCategories: const [
      CombatDecisionCategory(
        category: 'move',
        status: 'available',
        available: true,
        meaningful: true,
      ),
      CombatDecisionCategory(
        category: 'action',
        status: 'available',
        available: true,
        meaningful: true,
      ),
      CombatDecisionCategory(
        category: 'end_turn',
        status: 'available',
        available: true,
      ),
    ],
    availableActions: const [
      CombatActionOption(
        actionId: 'longsword',
        label: 'Longsword',
        timingCategory: 'action',
        available: true,
        targetCandidates: [
          CombatTargetCandidate(targetId: 'rusk', label: 'Rusk'),
        ],
      ),
      CombatActionOption(
        actionId: 'second_wind',
        label: 'Second Wind',
        timingCategory: 'bonus_action',
        available: true,
      ),
    ],
    movementDestinations: const [
      CombatMovementDestination(
        destinationZoneId: 'shrine_dais',
        label: 'Shrine Dais',
        risk: 'May draw a reaction',
      ),
    ],
    focus: const CombatFocusState(
      status: 'available',
      suggestions: [
        CombatFocusSuggestion(
          templateId: 'best_target',
          label: 'Who is the best target?',
        ),
      ],
    ),
    endTurnConfirmation: const CombatEndTurnConfirmation(
      required: true,
      message: 'You can still move or act. End your turn anyway?',
      meaningfulForfeitures: ['action', 'movement'],
    ),
    latestResult: latestResult,
    nextStep: 'Choose a combat option or end your turn.',
  );
}

CombatView _reactionView() {
  return CombatView(
    encounterTitle: 'Rusk at the Shrine',
    combatStatus: 'active',
    round: 1,
    participants: const [],
    initiative: const [],
    resources: const [],
    decisionCategories: const [],
    availableActions: const [],
    movementDestinations: const [],
    reaction: const CombatReactionState(
      reactionState: 'waiting_for_player',
      triggerSummary: 'Rusk leaves your reach.',
      options: [
        CombatReactionOption(
          reactionId: 'opportunity_attack',
          label: 'Opportunity Attack',
        ),
      ],
      declineLabel: 'Let him move',
    ),
  );
}

CombatView _resolutionView() {
  return CombatView(
    encounterTitle: 'Rusk at the Shrine',
    combatStatus: 'complete',
    round: 3,
    participants: const [],
    initiative: const [],
    resources: const [],
    decisionCategories: const [],
    availableActions: const [],
    movementDestinations: const [],
    resolution: const CombatResolutionState(
      status: 'complete',
      aftermathTitle: 'Shrine Ruins Aftermath',
      summary: 'The shrine grows quiet.',
      rewards: CombatRewards(
        experiencePointsAwarded: 50,
        pendingAdvancement: true,
        targetLevel: 2,
      ),
      review: CombatReview(
        title: 'Combat Review',
        summary: 'You survived the confrontation.',
      ),
    ),
  );
}

CombatView _recoveryView() {
  return CombatView(
    encounterTitle: 'Rusk at the Shrine',
    combatStatus: 'recovery_needed',
    round: 1,
    participants: const [],
    initiative: const [],
    resources: const [],
    decisionCategories: const [],
    availableActions: const [],
    movementDestinations: const [],
    recovery: const CombatRecoveryState(
      message: 'Combat needs a safe refresh before more choices are available.',
      refreshSafe: true,
      retrySafe: false,
      repairRequired: true,
    ),
  );
}

class _FakeCombatRepository implements CombatRepository {
  _FakeCombatRepository(this.current);

  CombatView current;
  CombatOperationIntent? previewedIntent;
  CombatOperationIntent? submittedIntent;
  String? submittedReactionId;
  bool declinedReaction = false;
  String? focusQuestion;
  bool continued = false;

  @override
  Future<CombatView> loadCurrentCombat() async => current;

  @override
  Future<CombatPreview> previewOperation(CombatOperationIntent intent) async {
    previewedIntent = intent;
    return const CombatPreview(
      status: 'preview',
      operationCategory: 'action',
      operationName: 'Longsword',
      summary: 'You can strike Rusk from here.',
      sourceStateVersion: 'state-1',
      previewIdentity: 'preview-1',
      costs: ['action'],
      risks: ['Rusk may stay dangerous.'],
    );
  }

  @override
  Future<CombatSubmitResult> submitOperation(
    CombatOperationIntent intent, {
    required String idempotencyKey,
    String? sourceStateVersion,
    String? previewIdentity,
  }) async {
    submittedIntent = intent;
    current = _activeView(
      latestResult: const CombatResultBundle(
        operationName: 'Longsword',
        result: 'Rusk staggers back.',
        consequences: ['Your action is spent.'],
      ),
    );
    return CombatSubmitResult(
      status: 'committed',
      result: current.latestResult,
      currentView: current,
    );
  }

  @override
  Future<CombatSubmitResult> submitReaction({
    required String reactionId,
    required String idempotencyKey,
  }) async {
    submittedReactionId = reactionId;
    current = _activeView();
    return CombatSubmitResult(status: 'committed', currentView: current);
  }

  @override
  Future<CombatSubmitResult> declineReaction({
    required String idempotencyKey,
  }) async {
    declinedReaction = true;
    current = _activeView();
    return CombatSubmitResult(status: 'committed', currentView: current);
  }

  @override
  Future<CombatSubmitResult> askCombatFocus(String question) async {
    focusQuestion = question;
    return CombatSubmitResult(status: 'answered', currentView: current);
  }

  @override
  Future<CombatSubmitResult> resolveEncounterChoice({
    required String choiceId,
    required String idempotencyKey,
  }) async {
    return CombatSubmitResult(status: 'resolved', currentView: current);
  }

  @override
  Future<CombatSubmitResult> continueAdventure() async {
    continued = true;
    return CombatSubmitResult(status: 'continued', currentView: current);
  }
}

Widget _screen(_FakeCombatRepository repository) {
  return MaterialApp(
    home: CombatScreen(
      repository: repository,
      onBack: () {},
      onSignOut: () async {},
      navigate: (_) {},
    ),
  );
}

void main() {
  testWidgets('combat screen renders turn state and commits a previewed action',
      (tester) async {
    final repository = _FakeCombatRepository(_activeView());
    await tester.pumpWidget(_screen(repository));
    await tester.pumpAndSettle();

    expect(find.text('Rusk at the Shrine'), findsWidgets);
    expect(find.text('Initiative'), findsOneWidget);
    expect(find.text('Resources and Position'), findsOneWidget);
    expect(find.text('Combatants'), findsOneWidget);
    expect(find.text('Choose Your Combat Decision'), findsOneWidget);
    expect(find.text('Longsword'), findsOneWidget);
    expect(find.text('Shrine Dais'), findsOneWidget);
    expect(find.text('7/20 HP'), findsNothing);

    await tester.ensureVisible(find.text('Longsword'));
    await tester.tap(find.text('Longsword'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rusk').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();

    expect(repository.previewedIntent?.actionId, 'longsword');
    expect(find.textContaining('Preview: Longsword'), findsOneWidget);
    expect(find.text('Preview is not final. Commit resolves the choice.'),
        findsOneWidget);

    await tester.tap(find.text('Commit'));
    await tester.pumpAndSettle();

    expect(repository.submittedIntent?.targetIds, ['rusk']);
    expect(find.text('Rusk staggers back.'), findsOneWidget);
    expect(find.text('Your action is spent.'), findsOneWidget);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('reaction view hides ordinary controls and offers decline',
      (tester) async {
    final repository = _FakeCombatRepository(_reactionView());
    await tester.pumpWidget(_screen(repository));
    await tester.pumpAndSettle();

    expect(find.text('Reaction Required'), findsOneWidget);
    expect(find.text('Opportunity Attack'), findsOneWidget);
    expect(find.text('Let him move'), findsOneWidget);
    expect(find.text('Choose Your Combat Decision'), findsNothing);
    expect(find.text('End Turn'), findsNothing);

    await tester.tap(find.text('Let him move'));
    await tester.pumpAndSettle();
    expect(repository.declinedReaction, true);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('resolution view renders review and rewards without controls',
      (tester) async {
    final repository = _FakeCombatRepository(_resolutionView());
    await tester.pumpWidget(_screen(repository));
    await tester.pumpAndSettle();

    expect(find.text('Encounter Review'), findsOneWidget);
    expect(find.text('Shrine Ruins Aftermath'), findsOneWidget);
    expect(find.text('50 XP awarded'), findsOneWidget);
    expect(find.text('Advancement to level 2 is ready.'), findsOneWidget);
    expect(find.text('Continue Adventure'), findsOneWidget);
    expect(find.text('Choose Your Combat Decision'), findsNothing);
    _expectRenderedPlayerSafe(tester);
  });

  testWidgets('recovery view removes normal controls and offers refresh',
      (tester) async {
    final repository = _FakeCombatRepository(_recoveryView());
    await tester.pumpWidget(_screen(repository));
    await tester.pumpAndSettle();

    expect(find.text('Recovery Needed'), findsWidgets);
    expect(find.textContaining('safe refresh'), findsWidgets);
    expect(find.text('Refresh Combat'), findsOneWidget);
    expect(find.text('Choose Your Combat Decision'), findsNothing);
    expect(find.text('End Turn'), findsNothing);
    _expectRenderedPlayerSafe(tester);
  });
}
