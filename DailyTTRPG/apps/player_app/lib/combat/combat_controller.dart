import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import 'combat_models.dart';
import 'combat_repository.dart';

class CombatController extends ChangeNotifier {
  CombatController({required CombatRepository repository})
      : _repository = repository;

  final CombatRepository _repository;
  int _requestSequence = 0;
  int _idempotencyCounter = 0;
  String? _lastSubmitKey;

  CombatView? view;
  CombatPreview? preview;
  CombatResultBundle? latestSubmittedResult;
  CombatOperationIntent? selectedIntent;
  String? errorMessage;
  bool loading = false;
  bool previewing = false;
  bool submitting = false;
  bool playbackSkipped = false;

  Future<void> load() async {
    final ticket = ++_requestSequence;
    loading = true;
    errorMessage = null;
    notifyListeners();
    try {
      final loaded = await _repository.loadCurrentCombat();
      if (!_isLatest(ticket)) return;
      _applyAuthoritativeView(loaded);
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      errorMessage = error.message;
    } catch (_) {
      if (!_isLatest(ticket)) return;
      errorMessage = 'DailyTTRPG could not load combat right now.';
    } finally {
      if (_isLatest(ticket)) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> refresh() => load();

  void selectIntent(CombatOperationIntent intent) {
    selectedIntent = intent;
    preview = null;
    latestSubmittedResult = null;
    errorMessage = null;
    _lastSubmitKey = null;
    notifyListeners();
  }

  void clearSelection() {
    selectedIntent = null;
    preview = null;
    errorMessage = null;
    _lastSubmitKey = null;
    notifyListeners();
  }

  Future<void> previewSelected() async {
    final intent = selectedIntent;
    if (intent == null || previewing || submitting) return;
    final ticket = ++_requestSequence;
    previewing = true;
    errorMessage = null;
    notifyListeners();
    try {
      final response = await _repository.previewOperation(intent);
      if (!_isLatest(ticket)) return;
      preview = response;
      if (response.currentState != null) {
        _applyAuthoritativeView(response.currentState!);
      }
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      preview = null;
      errorMessage = error.message;
      if (error.shouldRefreshCurrentState) {
        previewing = false;
        notifyListeners();
        await load();
        return;
      }
    } catch (_) {
      if (!_isLatest(ticket)) return;
      preview = null;
      errorMessage = 'Could not preview that combat choice right now.';
    } finally {
      if (_isLatest(ticket)) {
        previewing = false;
        notifyListeners();
      }
    }
  }

  Future<void> submitSelected() async {
    final intent = selectedIntent;
    if (intent == null || submitting) return;
    final ticket = ++_requestSequence;
    submitting = true;
    errorMessage = null;
    _lastSubmitKey ??= _newIdempotencyKey(intent.operationType);
    notifyListeners();
    try {
      final response = await _repository.submitOperation(
        intent,
        idempotencyKey: _lastSubmitKey!,
        sourceStateVersion: preview?.sourceStateVersion,
        previewIdentity: preview?.previewIdentity,
      );
      if (!_isLatest(ticket)) return;
      _applySubmitResult(response);
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      errorMessage = error.message;
      if (error.shouldRefreshCurrentState) {
        submitting = false;
        notifyListeners();
        await load();
        return;
      }
    } catch (_) {
      if (!_isLatest(ticket)) return;
      errorMessage = 'Could not submit that combat choice right now.';
    } finally {
      if (_isLatest(ticket)) {
        submitting = false;
        notifyListeners();
      }
    }
  }

  Future<void> submitEndTurn({bool confirm = false}) async {
    selectIntent(CombatOperationIntent(
      operationType: 'end_turn',
      confirmEndTurn: confirm,
    ));
    await previewSelected();
    await submitSelected();
  }

  Future<void> submitReaction(String reactionId) async {
    if (submitting) return;
    final ticket = ++_requestSequence;
    submitting = true;
    errorMessage = null;
    notifyListeners();
    try {
      final response = await _repository.submitReaction(
        reactionId: reactionId,
        idempotencyKey: _newIdempotencyKey('reaction'),
      );
      if (!_isLatest(ticket)) return;
      _applySubmitResult(response);
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      errorMessage = error.message;
    } catch (_) {
      if (!_isLatest(ticket)) return;
      errorMessage = 'Could not submit that reaction right now.';
    } finally {
      if (_isLatest(ticket)) {
        submitting = false;
        notifyListeners();
      }
    }
  }

  Future<void> declineReaction() async {
    if (submitting) return;
    final ticket = ++_requestSequence;
    submitting = true;
    errorMessage = null;
    notifyListeners();
    try {
      final response = await _repository.declineReaction(
        idempotencyKey: _newIdempotencyKey('decline_reaction'),
      );
      if (!_isLatest(ticket)) return;
      _applySubmitResult(response);
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      errorMessage = error.message;
    } catch (_) {
      if (!_isLatest(ticket)) return;
      errorMessage = 'Could not decline that reaction right now.';
    } finally {
      if (_isLatest(ticket)) {
        submitting = false;
        notifyListeners();
      }
    }
  }

  Future<void> askFocus(String question) async {
    final trimmed = question.trim();
    if (trimmed.isEmpty || submitting) return;
    final ticket = ++_requestSequence;
    submitting = true;
    errorMessage = null;
    notifyListeners();
    try {
      final response = await _repository.askCombatFocus(trimmed);
      if (!_isLatest(ticket)) return;
      _applySubmitResult(response);
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      errorMessage = error.message;
    } catch (_) {
      if (!_isLatest(ticket)) return;
      errorMessage = 'Could not ask Combat Focus right now.';
    } finally {
      if (_isLatest(ticket)) {
        submitting = false;
        notifyListeners();
      }
    }
  }

  Future<void> resolveEncounterChoice(String choiceId) async {
    if (submitting) return;
    final ticket = ++_requestSequence;
    submitting = true;
    errorMessage = null;
    notifyListeners();
    try {
      final response = await _repository.resolveEncounterChoice(
        choiceId: choiceId,
        idempotencyKey: _newIdempotencyKey('resolution'),
      );
      if (!_isLatest(ticket)) return;
      _applySubmitResult(response);
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      errorMessage = error.message;
    } catch (_) {
      if (!_isLatest(ticket)) return;
      errorMessage = 'Could not resolve the encounter choice right now.';
    } finally {
      if (_isLatest(ticket)) {
        submitting = false;
        notifyListeners();
      }
    }
  }

  Future<void> continueAdventure() async {
    if (submitting) return;
    final ticket = ++_requestSequence;
    submitting = true;
    errorMessage = null;
    notifyListeners();
    try {
      final response = await _repository.continueAdventure();
      if (!_isLatest(ticket)) return;
      _applySubmitResult(response);
    } on ApiException catch (error) {
      if (!_isLatest(ticket)) return;
      errorMessage = error.message;
    } catch (_) {
      if (!_isLatest(ticket)) return;
      errorMessage = 'Could not continue the adventure right now.';
    } finally {
      if (_isLatest(ticket)) {
        submitting = false;
        notifyListeners();
      }
    }
  }

  void skipPlayback() {
    playbackSkipped = true;
    notifyListeners();
  }

  bool _isLatest(int ticket) => ticket == _requestSequence;

  String _newIdempotencyKey(String operation) {
    _idempotencyCounter += 1;
    return 'flutter:$operation:${DateTime.now().microsecondsSinceEpoch}:$_idempotencyCounter';
  }

  void _applyAuthoritativeView(CombatView nextView) {
    view = nextView;
    preview = null;
    selectedIntent = null;
    errorMessage = null;
    if (nextView.latestResult != null) {
      latestSubmittedResult = nextView.latestResult;
    }
  }

  void _applySubmitResult(CombatSubmitResult response) {
    latestSubmittedResult = response.result ?? latestSubmittedResult;
    if (response.currentView != null) {
      _applyAuthoritativeView(response.currentView!);
    }
    if (response.stale) {
      preview = null;
      selectedIntent = null;
      errorMessage = response.message ??
          'That combat choice changed. Review the current state and preview again.';
    } else {
      preview = null;
      selectedIntent = null;
      errorMessage = response.message?.isNotEmpty == true
          ? response.message
          : response.duplicateHandled
              ? 'That combat choice was already handled. The current state is shown.'
              : null;
    }
    _lastSubmitKey = null;
  }
}
