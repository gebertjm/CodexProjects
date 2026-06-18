import '../api/api_client.dart';
import 'combat_models.dart';

abstract class CombatRepository {
  Future<CombatView> loadCurrentCombat();

  Future<CombatPreview> previewOperation(CombatOperationIntent intent);

  Future<CombatSubmitResult> submitOperation(
    CombatOperationIntent intent, {
    required String idempotencyKey,
    String? sourceStateVersion,
    String? previewIdentity,
  });

  Future<CombatSubmitResult> submitReaction({
    required String reactionId,
    required String idempotencyKey,
  });

  Future<CombatSubmitResult> declineReaction({
    required String idempotencyKey,
  });

  Future<CombatSubmitResult> askCombatFocus(String question);

  Future<CombatSubmitResult> resolveEncounterChoice({
    required String choiceId,
    required String idempotencyKey,
  });

  Future<CombatSubmitResult> continueAdventure();
}

class CombatHttpRepository implements CombatRepository {
  const CombatHttpRepository(this._client);

  final ApiClient _client;

  @override
  Future<CombatView> loadCurrentCombat() async {
    final json = await _client.getJson('/api/play/combat/current');
    return CombatView.fromJson(json);
  }

  @override
  Future<CombatPreview> previewOperation(CombatOperationIntent intent) async {
    final json = await _client.postJson(
      '/api/play/combat/preview',
      body: intent.toJson(),
    );
    return CombatPreview.fromJson(json);
  }

  @override
  Future<CombatSubmitResult> submitOperation(
    CombatOperationIntent intent, {
    required String idempotencyKey,
    String? sourceStateVersion,
    String? previewIdentity,
  }) async {
    final json = await _client.postJson(
      '/api/play/combat/submit',
      body: intent.toJson(
        idempotencyKey: idempotencyKey,
        sourceStateVersion: sourceStateVersion,
        previewIdentity: previewIdentity,
      ),
    );
    return CombatSubmitResult.fromJson(json);
  }

  @override
  Future<CombatSubmitResult> submitReaction({
    required String reactionId,
    required String idempotencyKey,
  }) async {
    final json = await _client.postJson(
      '/api/play/combat/reaction/submit',
      body: {
        'reaction_id': reactionId,
        'idempotency_key': idempotencyKey,
      },
    );
    return CombatSubmitResult.fromJson(json);
  }

  @override
  Future<CombatSubmitResult> declineReaction({
    required String idempotencyKey,
  }) async {
    final json = await _client.postJson(
      '/api/play/combat/reaction/decline',
      body: {'idempotency_key': idempotencyKey},
    );
    return CombatSubmitResult.fromJson(json);
  }

  @override
  Future<CombatSubmitResult> askCombatFocus(String question) async {
    final json = await _client.postJson(
      '/api/play/combat/focus',
      body: {'question': question},
    );
    return CombatSubmitResult.fromJson(json);
  }

  @override
  Future<CombatSubmitResult> resolveEncounterChoice({
    required String choiceId,
    required String idempotencyKey,
  }) async {
    final json = await _client.postJson(
      '/api/play/combat/resolution',
      body: {
        'choice_id': choiceId,
        'idempotency_key': idempotencyKey,
      },
    );
    return CombatSubmitResult.fromJson(json);
  }

  @override
  Future<CombatSubmitResult> continueAdventure() async {
    final json = await _client.postJson('/api/play/combat/continue');
    return CombatSubmitResult.fromJson(json);
  }
}
