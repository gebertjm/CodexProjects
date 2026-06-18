import 'dart:async';

import 'package:dailyttrpg_player_app/api/api_client.dart';
import 'package:dailyttrpg_player_app/combat/combat_controller.dart';
import 'package:dailyttrpg_player_app/combat/combat_models.dart';
import 'package:dailyttrpg_player_app/combat/combat_repository.dart';
import 'package:flutter_test/flutter_test.dart';

CombatView _view(String title) {
  return CombatView(
    encounterTitle: title,
    combatStatus: 'active',
    round: 1,
    currentActor: const CombatParticipant(
      participantId: 'player-1',
      displayName: 'Aric',
      isActor: true,
      isPlayer: true,
    ),
    participants: const [],
    initiative: const [],
    resources: const [],
    decisionCategories: const [],
    availableActions: const [],
    movementDestinations: const [],
  );
}

class _FakeCombatRepository implements CombatRepository {
  final loads = <Completer<CombatView>>[];
  CombatPreview? previewResponse;
  CombatSubmitResult? submitResponse;
  CombatOperationIntent? submittedIntent;
  String? submittedIdempotencyKey;
  String? submittedSourceStateVersion;
  String? submittedPreviewIdentity;

  @override
  Future<CombatView> loadCurrentCombat() {
    final completer = Completer<CombatView>();
    loads.add(completer);
    return completer.future;
  }

  @override
  Future<CombatPreview> previewOperation(CombatOperationIntent intent) async {
    return previewResponse ??
        const CombatPreview(
          status: 'preview',
          operationCategory: 'action',
          operationName: 'Longsword',
          sourceStateVersion: 'state-1',
          previewIdentity: 'preview-1',
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
    submittedIdempotencyKey = idempotencyKey;
    submittedSourceStateVersion = sourceStateVersion;
    submittedPreviewIdentity = previewIdentity;
    return submitResponse ??
        CombatSubmitResult(
          status: 'committed',
          result: const CombatResultBundle(
            operationName: 'Longsword',
            result: 'Rusk staggers back.',
          ),
          currentView: _view('After Action'),
        );
  }

  @override
  Future<CombatSubmitResult> askCombatFocus(String question) {
    throw UnimplementedError();
  }

  @override
  Future<CombatSubmitResult> continueAdventure() {
    throw UnimplementedError();
  }

  @override
  Future<CombatSubmitResult> declineReaction({required String idempotencyKey}) {
    throw UnimplementedError();
  }

  @override
  Future<CombatSubmitResult> resolveEncounterChoice({
    required String choiceId,
    required String idempotencyKey,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<CombatSubmitResult> submitReaction({
    required String reactionId,
    required String idempotencyKey,
  }) {
    throw UnimplementedError();
  }
}

void main() {
  test('combat API errors map to safe player messages', () {
    expect(
      playerSafeApiErrorMessage(
        statusCode: 409,
        code: 'COMBAT_STALE_PREVIEW',
        message: 'source_state_version mismatch trace_id=debug',
      ),
      'That moment has changed. Review the current scene and choose your next action.',
    );
    expect(
      playerSafeApiErrorMessage(
        statusCode: 409,
        code: 'COMBAT_RECOVERY_NEEDED',
        message: 'mutation_plan failed',
      ),
      'Combat needs a safe refresh before more choices are available.',
    );
  });

  test('load ignores stale responses after a newer request wins', () async {
    final repository = _FakeCombatRepository();
    final controller = CombatController(repository: repository);

    final firstLoad = controller.load();
    final secondLoad = controller.load();
    expect(repository.loads.length, 2);

    repository.loads[1].complete(_view('New Combat'));
    await secondLoad;
    expect(controller.view?.encounterTitle, 'New Combat');

    repository.loads[0].complete(_view('Old Combat'));
    await firstLoad;
    expect(controller.view?.encounterTitle, 'New Combat');
  });

  test('submit uses preview identity, state version, and one idempotency key',
      () async {
    final repository = _FakeCombatRepository();
    final controller = CombatController(repository: repository);

    controller.selectIntent(const CombatOperationIntent(
      operationType: 'action',
      actionId: 'longsword',
      targetIds: ['rusk'],
    ));
    await controller.previewSelected();
    await controller.submitSelected();

    expect(repository.submittedIntent?.actionId, 'longsword');
    expect(repository.submittedSourceStateVersion, 'state-1');
    expect(repository.submittedPreviewIdentity, 'preview-1');
    expect(repository.submittedIdempotencyKey, startsWith('flutter:action:'));
    expect(controller.view?.encounterTitle, 'After Action');
    expect(controller.latestSubmittedResult?.summary, 'Rusk staggers back.');
    expect(controller.selectedIntent, isNull);
    expect(controller.preview, isNull);
  });
}
