import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../shared/config/app_config.dart';
import 'models.dart';

class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.statusCode,
    this.code,
    this.recoveryAction,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final String? recoveryAction;

  bool get shouldInvalidatePreview {
    final normalized = code?.toUpperCase();
    return normalized == 'STALE_ACTION' ||
        normalized == 'STALE_PREVIEW' ||
        normalized == 'CURRENT_SCENE_CHANGED' ||
        normalized == 'ACTION_UNAVAILABLE' ||
        normalized == 'ACTION_ALREADY_RESOLVING' ||
        normalized == 'COMBAT_STATE_CHANGED' ||
        normalized == 'COMBAT_STALE_PREVIEW' ||
        normalized == 'COMBAT_ACTION_UNAVAILABLE' ||
        normalized == 'COMBAT_TURN_CLOSED' ||
        normalized == 'COMBAT_RECOVERY_NEEDED' ||
        normalized == 'REACTION_UNAVAILABLE' ||
        normalized == 'DIALOGUE_ENDED' ||
        normalized == 'CURRENT_CONVERSATION_CHANGED' ||
        normalized == 'TRANSITION_UNAVAILABLE';
  }

  bool get shouldRefreshCurrentState {
    final normalized = code?.toUpperCase();
    return shouldInvalidatePreview ||
        normalized == 'AUTH_REQUIRED' ||
        normalized == 'ACTIVE_CHARACTER_REQUIRED' ||
        normalized == 'CAMPAIGN_NOT_FOUND' ||
        normalized == 'COMBAT_NOT_FOUND';
  }

  @override
  String toString() => message;
}

String playerSafeApiErrorMessage({
  int? statusCode,
  String? code,
  String? message,
}) {
  final normalizedCode = code?.trim().toUpperCase();
  switch (normalizedCode) {
    case 'AUTH_REQUIRED':
      return 'Your session expired. Please sign in again.';
    case 'STALE_ACTION':
    case 'STALE_PREVIEW':
    case 'CURRENT_SCENE_CHANGED':
    case 'COMBAT_STATE_CHANGED':
    case 'COMBAT_STALE_PREVIEW':
      return 'That moment has changed. Review the current scene and choose your next action.';
    case 'CURRENT_CONVERSATION_CHANGED':
      return 'That moment has changed. Review the current conversation and choose your next move.';
    case 'ACTION_ALREADY_RESOLVING':
      return 'That action is already being resolved.';
    case 'DIALOGUE_ENDED':
      return 'This conversation has ended. Return to the current scene.';
    case 'ACTION_UNAVAILABLE':
    case 'COMBAT_ACTION_UNAVAILABLE':
    case 'REACTION_UNAVAILABLE':
      return 'That option is no longer available.';
    case 'COMBAT_TURN_CLOSED':
      return 'That combat turn has already ended. Review the current combat state.';
    case 'COMBAT_RECOVERY_NEEDED':
      return 'Combat needs a safe refresh before more choices are available.';
    case 'COMBAT_NOT_FOUND':
      return 'No active combat is available for this character right now.';
    case 'SLICE_ENDPOINT_REACHED':
    case 'AWAITING_FUTURE_SUPPORT':
      return 'You have reached the end of the current Greyvale playable slice. Review your progress and return when the next systems are enabled.';
    case 'ACTIVE_CHARACTER_REQUIRED':
      return 'Choose an active character before continuing.';
    case 'TRANSITION_UNAVAILABLE':
      return 'That route is not available right now. Review the current scene and choose another action.';
  }

  final trimmed = message?.trim() ?? '';
  if (trimmed.isEmpty) {
    return statusCode == 401
        ? 'Your session expired. Please sign in again.'
        : 'DailyTTRPG could not load right now.';
  }

  final lower = trimmed.toLowerCase();
  if (lower.contains('moment has changed') && lower.contains('conversation')) {
    return 'That moment has changed. Review the current conversation and choose your next move.';
  }
  if (lower.contains('moment has changed')) {
    return 'That moment has changed. Review the current scene and choose your next action.';
  }
  if (lower.contains('conversation has ended')) {
    return 'This conversation has ended. Return to the current scene.';
  }
  if (lower.contains('already being resolved')) {
    return 'That action is already being resolved.';
  }
  if (lower.contains('no active character') ||
      lower.contains('active character')) {
    return 'Choose an active character before continuing.';
  }
  if (lower.contains('not available') || lower.contains('unavailable')) {
    return 'That option is no longer available.';
  }
  if (lower.contains('slice endpoint') ||
      lower.contains('awaiting future support')) {
    return 'You have reached the end of the current Greyvale playable slice. Review your progress and return when the next systems are enabled.';
  }

  if (_looksInternal(trimmed)) {
    return 'DailyTTRPG could not complete that request. Refresh the current scene and try again.';
  }

  return trimmed;
}

String? playerSafeApiErrorCode({
  int? statusCode,
  String? code,
  String? message,
}) {
  final normalizedCode = code?.trim().toUpperCase();
  if (normalizedCode != null && normalizedCode.isNotEmpty) {
    return normalizedCode;
  }
  final lower = (message ?? '').toLowerCase();
  if (statusCode == 401) {
    return 'AUTH_REQUIRED';
  }
  if (lower.contains('conversation has ended')) {
    return 'DIALOGUE_ENDED';
  }
  if (lower.contains('moment has changed') && lower.contains('conversation')) {
    return 'CURRENT_CONVERSATION_CHANGED';
  }
  if (lower.contains('moment has changed')) {
    return 'STALE_ACTION';
  }
  if (lower.contains('already being resolved')) {
    return 'ACTION_ALREADY_RESOLVING';
  }
  if (lower.contains('active character')) {
    return 'ACTIVE_CHARACTER_REQUIRED';
  }
  if (lower.contains('not available') || lower.contains('unavailable')) {
    return 'ACTION_UNAVAILABLE';
  }
  if (lower.contains('slice endpoint') ||
      lower.contains('awaiting future support')) {
    return 'AWAITING_FUTURE_SUPPORT';
  }
  return null;
}

bool _looksInternal(String message) {
  final lower = message.toLowerCase();
  const internalFragments = [
    'stack trace',
    'constraint',
    'violates foreign key',
    'duplicate key',
    'postgres',
    'sqlstate',
    'raw roll',
    'hidden dc',
    'result_band',
    'branch_id',
    'preview_confidence',
    'debug',
    'validation hard_errors',
    'future_supported',
    'combat_pending',
    'combat routing',
    'path harness',
  ];
  return internalFragments.any(lower.contains);
}

class AuthTokenProvider {
  const AuthTokenProvider(this._auth);

  final FirebaseAuth _auth;

  Future<String> requireIdToken() async {
    final user = _auth.currentUser;

    if (user == null) {
      throw const ApiException('You need to sign in again.');
    }

    final token = await user.getIdToken();

    if (token == null || token.isEmpty) {
      throw const ApiException('Could not read your sign-in token.');
    }

    return token;
  }
}

class ApiClient {
  ApiClient({
    required AuthTokenProvider tokenProvider,
    http.Client? httpClient,
    Uri? baseUri,
  })  : _tokenProvider = tokenProvider,
        _httpClient = httpClient ?? http.Client(),
        _baseUri = baseUri ?? AppConfig.apiBaseUri();

  final AuthTokenProvider _tokenProvider;
  final http.Client _httpClient;
  final Uri _baseUri;

  Future<Map<String, dynamic>> getJson(String path) async {
    return _sendJson('GET', path);
  }

  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    return _sendJson('POST', path, body: body);
  }

  Future<Map<String, dynamic>> patchJson(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    return _sendJson('PATCH', path, body: body);
  }

  Future<Map<String, dynamic>> deleteJson(String path) async {
    return _sendJson('DELETE', path);
  }

  Future<Map<String, dynamic>> _sendJson(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final token = await _tokenProvider.requireIdToken();
    final uri = _baseUri.resolve(path);
    final headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
    final encodedBody = body == null ? null : jsonEncode(body);
    final response = switch (method) {
      'POST' =>
        await _httpClient.post(uri, headers: headers, body: encodedBody),
      'PATCH' =>
        await _httpClient.patch(uri, headers: headers, body: encodedBody),
      'DELETE' => await _httpClient.delete(uri, headers: headers),
      _ => await _httpClient.get(uri, headers: headers),
    };

    if (response.statusCode == 401) {
      throw ApiException(
        'Your session expired. Please sign in again.',
        statusCode: response.statusCode,
        code: 'AUTH_REQUIRED',
        recoveryAction: 'sign_in',
      );
    }

    if (response.statusCode == 403) {
      throw ApiException('You do not have access to that tool.',
          statusCode: response.statusCode);
    }

    final decoded =
        response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      String? message;
      String? code;
      String? recoveryAction;
      if (decoded is Map<String, dynamic>) {
        final error = decoded['error'];
        if (error is Map<String, dynamic>) {
          message = error['message']?.toString();
          code = error['code']?.toString();
          recoveryAction = error['recovery_action']?.toString();
        }
      }
      final safeCode = playerSafeApiErrorCode(
        statusCode: response.statusCode,
        code: code,
        message: message,
      );
      throw ApiException(
        playerSafeApiErrorMessage(
          statusCode: response.statusCode,
          code: safeCode,
          message: message,
        ),
        statusCode: response.statusCode,
        code: safeCode,
        recoveryAction: recoveryAction,
      );
    }

    if (decoded is! Map<String, dynamic>) {
      throw const ApiException('DailyTTRPG returned an unexpected response.');
    }

    return decoded;
  }
}

class AccountApi {
  const AccountApi(this._client);

  final ApiClient _client;

  Future<PlayerState> getPlayerState() async {
    return PlayerState.fromJson(await _client.getJson('/api/me'));
  }

  Future<List<CharacterSummary>> getCharacters() async {
    final json = await _client.getJson('/api/me/characters');
    final characters = json['characters'];
    return characters is List
        ? characters
            .whereType<Map<String, dynamic>>()
            .map(CharacterSummary.fromJson)
            .toList()
        : const [];
  }

  Future<CampaignSummary?> getCurrentCampaign() async {
    final json = await _client.getJson('/api/me/current-campaign');
    return json['current_campaign'] is Map<String, dynamic>
        ? CampaignSummary.fromJson(
            json['current_campaign'] as Map<String, dynamic>)
        : null;
  }
}

class PlayerDashboardApi {
  const PlayerDashboardApi(this._client);

  final ApiClient _client;

  Future<PlayerDashboard> getDashboard() async {
    return PlayerDashboard.fromJson(
        await _client.getJson('/api/play/dashboard'));
  }

  Future<StarterAdventureIntro> getStarterAdventure() async {
    final json = await _client.getJson('/api/play/starter-adventure');
    return StarterAdventureIntro.fromJson(
      json['starter_adventure'] is Map<String, dynamic>
          ? json['starter_adventure'] as Map<String, dynamic>
          : const <String, dynamic>{},
    );
  }

  Future<CurrentAdventureDashboard> getCurrentAdventure() async {
    final json = await _client.getJson('/api/play/current-adventure');
    return CurrentAdventureDashboard.fromJson(
      json['current_adventure'] is Map<String, dynamic>
          ? json['current_adventure'] as Map<String, dynamic>
          : const <String, dynamic>{},
    );
  }

  Future<CurrentSceneView> getCurrentScene(
      {bool includeMechanics = true}) async {
    final path = includeMechanics
        ? '/api/play/current-scene?include_mechanics=true'
        : '/api/play/current-scene';
    return CurrentSceneView.fromJson(await _client.getJson(path));
  }

  Future<CampaignHistory> getCampaignHistory() async {
    return CampaignHistory.fromJson(
      await _client.getJson('/api/play/campaign/history'),
    );
  }

  Future<KnowledgeJournal> getCampaignKnowledge() async {
    return KnowledgeJournal.fromJson(
      await _client.getJson('/api/play/campaign/knowledge'),
    );
  }

  Future<ActionPreviewResponse> previewAction({
    required String rawText,
    String? selectedVerb,
    String? selectedAffordanceId,
    String? continueFreeFocusInteractionId,
  }) async {
    return ActionPreviewResponse.fromJson(
      await _client.postJson(
        '/api/play/action/preview',
        body: {
          'raw_text': rawText,
          if (selectedVerb != null) 'selected_verb': selectedVerb,
          if (selectedAffordanceId != null)
            'selected_affordance_id': selectedAffordanceId,
          if (continueFreeFocusInteractionId != null)
            'continue_free_focus_interaction_id':
                continueFreeFocusInteractionId,
        },
      ),
    );
  }

  Future<ActionSubmitResponse> submitAction({
    required String rawText,
    String? selectedVerb,
    String? selectedAffordanceId,
    String? continueFreeFocusInteractionId,
    String? actionWindowId,
    ActionLifecycleContext? lifecycleContext,
  }) async {
    return ActionSubmitResponse.fromJson(
      await _client.postJson(
        '/api/play/action/submit',
        body: {
          'raw_text': rawText,
          if (selectedVerb != null) 'selected_verb': selectedVerb,
          if (selectedAffordanceId != null)
            'selected_affordance_id': selectedAffordanceId,
          if (continueFreeFocusInteractionId != null)
            'continue_free_focus_interaction_id':
                continueFreeFocusInteractionId,
          if (actionWindowId != null) 'action_window_id': actionWindowId,
          if (lifecycleContext?.isNotEmpty == true)
            'lifecycle_context': lifecycleContext!.toJson(),
        },
      ),
    );
  }

  Future<FreeFocusResolveResponse> resolveFreeFocus({
    required String interactionId,
    String? sceneId,
  }) async {
    return FreeFocusResolveResponse.fromJson(
      await _client.postJson(
        '/api/play/free-focus/resolve',
        body: {
          'interaction_id': interactionId,
          if (sceneId != null) 'scene_id': sceneId,
        },
      ),
    );
  }

  Future<AdvanceBeatResult> advanceBeat({String? campaignInstanceId}) async {
    return AdvanceBeatResult.fromJson(
      await _client.postJson(
        '/api/dev/advance-beat',
        body: campaignInstanceId == null
            ? const {}
            : {'campaign_instance_id': campaignInstanceId},
      ),
    );
  }

  Future<PlaytestDiagnostics> getPlaytestDiagnostics({
    String? campaignInstanceId,
  }) async {
    final path = Uri(
      path: '/api/dev/playtest-diagnostics',
      queryParameters: campaignInstanceId == null
          ? null
          : {'campaign_instance_id': campaignInstanceId},
    ).toString();
    return PlaytestDiagnostics.fromJson(await _client.getJson(path));
  }

  Future<DialogueDebugWorkspace> getDialogueDebugWorkspace({
    String? campaignInstanceId,
    String? dialogueSceneId,
    String? completedRecordId,
  }) async {
    final parameters = <String, String>{};
    if (campaignInstanceId != null && campaignInstanceId.trim().isNotEmpty) {
      parameters['campaign_instance_id'] = campaignInstanceId;
    }
    if (dialogueSceneId != null && dialogueSceneId.trim().isNotEmpty) {
      parameters['dialogue_scene_id'] = dialogueSceneId;
    }
    if (completedRecordId != null && completedRecordId.trim().isNotEmpty) {
      parameters['completed_dialogue_record_id'] = completedRecordId;
    }
    final path = Uri(
      path: '/api/dev/dialogue-debug',
      queryParameters: parameters.isEmpty ? null : parameters,
    ).toString();
    return DialogueDebugWorkspace.fromJson(await _client.getJson(path));
  }

  Future<ExplorationMechanicsDebugWorkspace> getExplorationMechanicsDebug({
    String? campaignInstanceId,
    String? characterId,
    String? sceneInstanceId,
    String? actionWindowId,
    String? selectedId,
  }) async {
    final parameters = <String, String>{};
    if (campaignInstanceId != null && campaignInstanceId.trim().isNotEmpty) {
      parameters['campaign_instance_id'] = campaignInstanceId;
    }
    if (characterId != null && characterId.trim().isNotEmpty) {
      parameters['character_id'] = characterId;
    }
    if (sceneInstanceId != null && sceneInstanceId.trim().isNotEmpty) {
      parameters['scene_instance_id'] = sceneInstanceId;
    }
    if (actionWindowId != null && actionWindowId.trim().isNotEmpty) {
      parameters['action_window_id'] = actionWindowId;
    }
    if (selectedId != null && selectedId.trim().isNotEmpty) {
      parameters['selected_id'] = selectedId;
    }
    final path = Uri(
      path: '/api/dev/exploration-mechanics',
      queryParameters: parameters.isEmpty ? null : parameters,
    ).toString();
    return ExplorationMechanicsDebugWorkspace.fromJson(
        await _client.getJson(path));
  }

  Future<Map<String, dynamic>> runDialoguePathTest({
    required String dialogueSceneId,
    required String mode,
    bool allowActiveRuntimeMutation = true,
  }) async {
    final json = await _client.postJson(
      '/api/dev/dialogue-path-test/run',
      body: {
        'dialogue_scene_id': dialogueSceneId,
        'mode': mode,
        'allow_active_runtime_mutation': allowActiveRuntimeMutation,
      },
    );
    return json;
  }

  Future<PlaytestRepairResult> runPlaytestRepair({
    required String repairAction,
    String? campaignInstanceId,
  }) async {
    return PlaytestRepairResult.fromJson(
      await _client.postJson(
        '/api/dev/playtest-repair',
        body: {
          'repair_action': repairAction,
          if (campaignInstanceId != null)
            'campaign_instance_id': campaignInstanceId,
        },
      ),
    );
  }

  Future<StartAdventureResult> startAdventure({String? characterId}) async {
    return StartAdventureResult.fromJson(
      await _client.postJson(
        '/api/play/start-adventure',
        body: characterId == null ? const {} : {'character_id': characterId},
      ),
    );
  }
}

class DialogueApi {
  const DialogueApi(this._client);

  final ApiClient _client;

  String _queryPath(String path, Map<String, String?> query) {
    final parameters = <String, String>{};
    for (final entry in query.entries) {
      final value = entry.value;
      if (value != null && value.trim().isNotEmpty) {
        parameters[entry.key] = value;
      }
    }
    if (parameters.isEmpty) {
      return path;
    }
    return Uri(path: path, queryParameters: parameters).toString();
  }

  Future<DialogueSceneView> getCurrentDialogue({
    String? dialogueSceneId,
    bool allowReentry = false,
  }) async {
    return DialogueSceneView.fromJson(
      await _client.getJson(
        _queryPath('/api/play/dialogue/current', {
          'dialogue_scene_id': dialogueSceneId,
          if (allowReentry) 'allow_reentry': 'true',
        }),
      ),
    );
  }

  Future<DialogueClarifyingQuestionResolveResponse> resolveClarifyingQuestion({
    required String questionId,
    String? dialogueSceneId,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    return DialogueClarifyingQuestionResolveResponse.fromJson(
      await _client.postJson(
        '/api/play/dialogue/clarifying-question/resolve',
        body: {
          'question_id': questionId,
          if (dialogueSceneId != null) 'dialogue_scene_id': dialogueSceneId,
          if (lifecycleContext?.isNotEmpty == true)
            'lifecycle_context': lifecycleContext!.toJson(),
        },
      ),
    );
  }

  Future<DialogueSocialMovePreviewResponse> previewSocialMove({
    required String submittedText,
    String? dialogueSceneId,
    String? moveId,
    bool continueAsCommittedSocialMove = false,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    return DialogueSocialMovePreviewResponse.fromJson(
      await _client.postJson(
        '/api/play/dialogue/social-move/preview',
        body: {
          'submitted_text': submittedText,
          if (dialogueSceneId != null) 'dialogue_scene_id': dialogueSceneId,
          if (moveId != null) 'move_id': moveId,
          if (continueAsCommittedSocialMove)
            'continue_as_committed_social_move': true,
          if (lifecycleContext?.isNotEmpty == true)
            'lifecycle_context': lifecycleContext!.toJson(),
        },
      ),
    );
  }

  Future<DialogueSocialMoveSubmitResponse> submitSocialMove({
    required String submittedText,
    String? dialogueSceneId,
    String? moveId,
    bool continueAsCommittedSocialMove = false,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    return DialogueSocialMoveSubmitResponse.fromJson(
      await _client.postJson(
        '/api/play/dialogue/social-move/submit',
        body: {
          'submitted_text': submittedText,
          if (dialogueSceneId != null) 'dialogue_scene_id': dialogueSceneId,
          if (moveId != null) 'move_id': moveId,
          if (continueAsCommittedSocialMove)
            'continue_as_committed_social_move': true,
          if (lifecycleContext?.isNotEmpty == true)
            'lifecycle_context': lifecycleContext!.toJson(),
        },
      ),
    );
  }

  Future<DialogueExitResolveResponse> resolveExit({
    required String exitId,
    String? dialogueSceneId,
    DialogueLifecycleContext? lifecycleContext,
  }) async {
    return DialogueExitResolveResponse.fromJson(
      await _client.postJson(
        '/api/play/dialogue/exit',
        body: {
          'exit_id': exitId,
          if (dialogueSceneId != null) 'dialogue_scene_id': dialogueSceneId,
          if (lifecycleContext?.isNotEmpty == true)
            'lifecycle_context': lifecycleContext!.toJson(),
        },
      ),
    );
  }

  Future<DialogueArchiveList> getArchive({int limit = 20}) async {
    return DialogueArchiveList.fromJson(
      await _client.getJson(
        _queryPath('/api/play/dialogue/archive', {
          'limit': limit.toString(),
        }),
      ),
    );
  }

  Future<DialogueCurrentTranscriptResponse> getCurrentTranscript({
    String? dialogueSceneId,
  }) async {
    return DialogueCurrentTranscriptResponse.fromJson(
      await _client.getJson(
        _queryPath('/api/play/dialogue/transcript/current', {
          'dialogue_scene_id': dialogueSceneId,
        }),
      ),
    );
  }

  Future<DialogueArchiveRecordResponse> getArchiveRecord(
      String recordId) async {
    return DialogueArchiveRecordResponse.fromJson(
      await _client.getJson('/api/play/dialogue/archive/$recordId'),
    );
  }

  Future<DialogueArchiveSearchResults> searchArchive(String query) async {
    return DialogueArchiveSearchResults.fromJson(
      await _client.getJson(
        _queryPath('/api/play/dialogue/search', {'q': query}),
      ),
    );
  }
}

class CharacterCreationApi {
  const CharacterCreationApi(this._client);

  final ApiClient _client;

  Future<CharacterCreationOptions> getOptions() async {
    return CharacterCreationOptions.fromJson(
      await _client.getJson('/api/play/character-creation/options'),
    );
  }

  Future<CharacterCreationDraft?> getDraft() async {
    final json = await _client.getJson('/api/play/character-creation/draft');
    return json['draft'] is Map<String, dynamic>
        ? CharacterCreationDraft.fromJson(json['draft'] as Map<String, dynamic>)
        : null;
  }

  Future<CharacterCreationDraft> saveDraft(Map<String, dynamic> draft) async {
    final json = await _client.postJson(
      '/api/play/character-creation/draft',
      body: draft,
    );
    return CharacterCreationDraft.fromJson(
        json['draft'] as Map<String, dynamic>);
  }

  Future<CharacterCreationDraft> patchDraft(
    String draftId,
    Map<String, dynamic> draft,
  ) async {
    final json = await _client.patchJson(
      '/api/play/character-creation/draft/$draftId',
      body: draft,
    );
    return CharacterCreationDraft.fromJson(
        json['draft'] as Map<String, dynamic>);
  }

  Future<CharacterCreationDraft> abandonDraft(String draftId) async {
    final json =
        await _client.deleteJson('/api/play/character-creation/draft/$draftId');
    return CharacterCreationDraft.fromJson(
        json['draft'] as Map<String, dynamic>);
  }

  Future<CreatedCharacterResult> createCharacter(
      Map<String, dynamic> payload) async {
    return CreatedCharacterResult.fromJson(
      await _client.postJson('/api/play/characters', body: payload),
    );
  }

  Future<PlayerState> setActiveCharacter(String characterId) async {
    return PlayerState.fromJson(
      await _client.postJson('/api/play/characters/$characterId/set-active'),
    );
  }

  Future<PlayerState> startAdventure({String? characterId}) async {
    final json = await _client.postJson(
      '/api/play/start-adventure',
      body: characterId == null ? const {} : {'character_id': characterId},
    );
    return PlayerState.fromJson(json['player_state'] as Map<String, dynamic>);
  }
}

class CharacterManagementApi {
  const CharacterManagementApi(this._client);

  final ApiClient _client;

  Future<CharacterListResult> getCharacters() async {
    return CharacterListResult.fromJson(
      await _client.getJson('/api/play/characters'),
    );
  }

  Future<CharacterSheet> getCharacterSheet(String characterId) async {
    return CharacterSheet.fromJson(
      await _client.getJson('/api/play/characters/$characterId'),
    );
  }

  Future<ActiveCharacterSwitchResult> setActiveCharacter(
      String characterId) async {
    return ActiveCharacterSwitchResult.fromJson(
      await _client.postJson(
        '/api/play/active-character',
        body: {'character_id': characterId},
      ),
    );
  }
}
