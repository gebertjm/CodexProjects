import 'package:dailyttrpg_player_app/api/api_client.dart';
import 'package:dailyttrpg_player_app/api/models.dart';
import 'package:dailyttrpg_player_app/campaign/campaign_preview_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(home: child);
}

AccountSummary _account() {
  return const AccountSummary(
    accountId: 'account-1',
    firebaseUid: 'firebase-1',
    email: 'player@example.com',
    displayName: 'Player',
    photoUrl: null,
    smsEnabled: false,
    smsMode: 'disabled',
  );
}

CharacterSummary _character() {
  return const CharacterSummary(
    characterId: 'character-1',
    name: 'Aric',
    level: 1,
    species: 'Human',
    characterClass: 'Fighter',
    status: 'active',
    isActive: true,
  );
}

StarterAdventureIntro _starter() {
  return const StarterAdventureIntro(
    id: 'default_starter_adventure',
    worldId: 'greyvale',
    worldName: 'Greyvale',
    campaignPackageId: 'shadows_grey_road',
    campaignName: 'Shadows on the Grey Road',
    introTitle: 'Start Greyvale',
    introText:
        'Your first adventure begins in Greyvale, a rain-worn borderland where caravans have gone missing along the old road.',
    beginLabel: 'Begin Greyvale',
    cancelLabel: 'Cancel',
    routeAfterStart: '/play/campaign/scene',
    configured: true,
  );
}

CurrentAdventureDashboard _readyAdventure() {
  return const CurrentAdventureDashboard(
    hasActiveCampaign: false,
    actionStatus: DashboardActionStatus(
      state: 'ready_to_start',
      label: 'Ready to start',
      description: 'Your active character is ready for a starter adventure.',
    ),
  );
}

CurrentAdventureDashboard _activeAdventure() {
  return const CurrentAdventureDashboard(
    hasActiveCampaign: true,
    campaignInstanceId: 'campaign-1',
    worldId: 'greyvale',
    worldName: 'Greyvale',
    campaignPackageId: 'shadows_grey_road',
    campaignName: 'Shadows on the Grey Road',
    currentLocationName: 'Broken Caravan',
    currentSceneTitle: 'The Broken Caravan',
    currentObjectiveTitle: 'Witness the Aftermath',
    sceneRoute: '/play/campaign/scene',
    actionStatus: DashboardActionStatus(
      state: 'action_needed',
      label: 'Action needed',
      description: 'Your character can act now.',
      actionWindowId: 'window-1',
      canSubmit: true,
    ),
  );
}

CurrentAdventureDashboard _endpointAdventure() {
  return const CurrentAdventureDashboard(
    hasActiveCampaign: true,
    campaignInstanceId: 'campaign-1',
    worldId: 'greyvale',
    worldName: 'Greyvale',
    campaignPackageId: 'shadows_grey_road',
    campaignName: 'Shadows on the Grey Road',
    currentLocationName: 'Shrine Ruins',
    currentSceneTitle: 'Shrine Ruins',
    currentObjectiveTitle: 'Confront the shrine threat',
    sceneRoute: '/play/campaign/scene',
    actionStatus: DashboardActionStatus(
      state: 'slice_endpoint_reached',
      label: 'Slice endpoint reached',
      description:
          'You have reached the end of the current Greyvale playable slice.',
      canSubmit: false,
    ),
    sliceEndpoint: GreyvaleSliceEndpointStatus(
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
  );
}

CurrentAdventureDashboard _noCharacterAdventure() {
  return const CurrentAdventureDashboard(
    hasActiveCampaign: false,
    actionStatus: DashboardActionStatus(
      state: 'no_active_character',
      label: 'No active character',
      description: 'Create or select a character to begin.',
    ),
  );
}

PlayerDashboard _dashboard({
  CharacterSummary? activeCharacter,
  CurrentAdventureDashboard? currentAdventure,
}) {
  final adventure = currentAdventure ?? _readyAdventure();
  return PlayerDashboard(
    account: _account(),
    activeCharacter: activeCharacter,
    charactersSummary: const CharactersDashboardSummary(
        count: 1, manageRoute: '/play/characters'),
    starterAdventure: _starter(),
    currentAdventure: adventure,
    nextActions: DashboardNextActions(
      canCreateCharacter: activeCharacter == null,
      canResumeDraft: false,
      canStartAdventure:
          activeCharacter != null && adventure.hasActiveCampaign == false,
      canContinueAdventure: adventure.hasActiveCampaign,
      createCharacterRoute: '/play/create-character',
      resumeDraftRoute: null,
      continueRoute: adventure.hasActiveCampaign ? '/play/campaign' : null,
      manageCharactersRoute: '/play/characters',
    ),
  );
}

CurrentSceneView _initialScene() {
  return CurrentSceneView(
    state: 'active',
    activeCharacter: _character(),
    campaign: const CurrentSceneCampaign(
      campaignInstanceId: 'campaign-1',
      campaignName: 'Shadows on the Grey Road',
      worldName: 'Greyvale',
    ),
    scene: const CurrentSceneSummary(
      sceneId: 'broken-caravan-site',
      title: 'The Broken Caravan',
      locationName: 'Broken Caravan',
      description: 'A caravan leans broken in the mud.',
    ),
    objective: const SceneObjective(
      objectiveId: 'witness-the-aftermath',
      title: 'Witness the Aftermath',
      status: 'active',
    ),
    visibleAffordances: const [
      SceneAffordance(
        affordanceId: 'broken-caravan',
        label: 'broken caravan',
        type: 'object',
        description: 'The wagon can be inspected.',
        actions: ['inspect'],
      ),
    ],
    visibleNpcs: const [],
    knownRelevantNpcs: const [],
    knownFacts: const [],
    sceneStateSummary: const [],
    actionStatus: const DashboardActionStatus(
      state: 'action_needed',
      label: 'Action needed',
      description: 'Your character can act now.',
      actionWindowId: 'window-1',
      canSubmit: true,
    ),
  );
}

class _FakeDashboardApi implements PlayerDashboardApi {
  _FakeDashboardApi({
    required this.initialAdventure,
    required this.dashboard,
  });

  CurrentAdventureDashboard initialAdventure;
  PlayerDashboard dashboard;
  bool started = false;

  @override
  Future<CurrentAdventureDashboard> getCurrentAdventure() async {
    return started ? _activeAdventure() : initialAdventure;
  }

  @override
  Future<StarterAdventureIntro> getStarterAdventure() async => _starter();

  @override
  Future<StartAdventureResult> startAdventure({String? characterId}) async {
    started = true;
    return StartAdventureResult(
      dashboard: _dashboard(
        activeCharacter: _character(),
        currentAdventure: _activeAdventure(),
      ),
      currentAdventure: _activeAdventure(),
      currentScene: _initialScene(),
      route: '/play/campaign/scene',
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets(
      'Stage 6B.15.1 campaign preview starts Greyvale and opens the scene route',
      (tester) async {
    final routes = <String>[];
    final api = _FakeDashboardApi(
      initialAdventure: _readyAdventure(),
      dashboard: _dashboard(activeCharacter: _character()),
    );

    await tester.pumpWidget(_wrap(CampaignPreviewPage(
      dashboardApi: api,
      onBack: () {},
      onSignOut: () async {},
      navigate: routes.add,
    )));
    await tester.pumpAndSettle();

    expect(find.text('No Active Adventure'), findsOneWidget);
    expect(find.text('Start Greyvale'), findsOneWidget);

    await tester.tap(find.text('Start Greyvale'));
    await tester.pumpAndSettle();
    expect(find.text('Start Greyvale'), findsWidgets);
    expect(find.text('Begin Greyvale'), findsOneWidget);

    await tester.tap(find.text('Begin Greyvale'));
    await tester.pumpAndSettle();

    expect(api.started, true);
    expect(routes, contains('/play/campaign/scene'));
  });

  testWidgets('Stage 6B.15.1 campaign preview shows active-character recovery',
      (tester) async {
    final routes = <String>[];
    final api = _FakeDashboardApi(
      initialAdventure: _noCharacterAdventure(),
      dashboard: _dashboard(activeCharacter: null),
    );

    await tester.pumpWidget(_wrap(CampaignPreviewPage(
      dashboardApi: api,
      onBack: () {},
      onSignOut: () async {},
      navigate: routes.add,
    )));
    await tester.pumpAndSettle();

    expect(find.text('Choose A Character'), findsOneWidget);
    expect(
      find.text(
          'Create or select an active character before starting Greyvale.'),
      findsOneWidget,
    );
    expect(find.text('Start Greyvale'), findsNothing);

    await tester.tap(find.text('Create Character'));
    await tester.pumpAndSettle();

    expect(routes, contains('/play/create-character'));
  });

  testWidgets('Stage 6B.15.6 campaign preview shows endpoint review state',
      (tester) async {
    final routes = <String>[];
    final api = _FakeDashboardApi(
      initialAdventure: _endpointAdventure(),
      dashboard: _dashboard(
        activeCharacter: _character(),
        currentAdventure: _endpointAdventure(),
      ),
    );

    await tester.pumpWidget(_wrap(CampaignPreviewPage(
      dashboardApi: api,
      onBack: () {},
      onSignOut: () async {},
      navigate: routes.add,
    )));
    await tester.pumpAndSettle();

    expect(find.text('Greyvale slice endpoint reached'), findsOneWidget);
    expect(find.text('The shrine confrontation is ready.'), findsOneWidget);
    expect(find.textContaining('Review your journal'), findsOneWidget);
    expect(find.text('Review Current Scene'), findsWidgets);
    expect(find.textContaining('combat_pending'), findsNothing);
    expect(find.textContaining('future_supported'), findsNothing);

    final reviewButton = find.text('Review Current Scene').first;
    await tester.ensureVisible(reviewButton);
    await tester.pumpAndSettle();
    await tester.tap(reviewButton);
    await tester.pumpAndSettle();

    expect(routes, contains('/play/campaign/scene'));
  });
}
