import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

class DialogueScenePage extends StatefulWidget {
  const DialogueScenePage({
    required this.dialogueApi,
    required this.dashboardApi,
    required this.onBack,
    required this.onSignOut,
    required this.navigate,
    this.dialogueSceneId,
    this.allowReentry = false,
    super.key,
  });

  final DialogueApi dialogueApi;
  final PlayerDashboardApi dashboardApi;
  final VoidCallback onBack;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;
  final String? dialogueSceneId;
  final bool allowReentry;

  @override
  State<DialogueScenePage> createState() => _DialogueScenePageState();
}

class _DialogueScenePageState extends State<DialogueScenePage> {
  late Future<DialogueSceneView> _dialogue;

  @override
  void initState() {
    super.initState();
    _dialogue = _loadDialogue();
  }

  Future<DialogueSceneView> _loadDialogue() {
    return widget.dialogueApi.getCurrentDialogue(
      dialogueSceneId: widget.dialogueSceneId,
      allowReentry: widget.allowReentry,
    );
  }

  void _reload() {
    setState(() {
      _dialogue = _loadDialogue();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Conversation',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh conversation',
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/scene'),
          child: const Text('Scene'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign'),
          child: const Text('Campaign'),
        ),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<DialogueSceneView>(
        future: _dialogue,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _DialogueRecovery(
              message:
                  'We couldn’t load the conversation. Try refreshing, or return to the scene.',
              onRetry: _reload,
              onScene: () => widget.navigate('/play/campaign/scene'),
              onCampaign: () => widget.navigate('/play/campaign'),
            );
          }

          final dialogue = snapshot.requireData;
          if (!dialogue.isActive && !dialogue.isExited) {
            return _DialogueRecovery(
              message: dialogue.message ??
                  'No active dialogue is available yet. Return to the scene and try again.',
              onRetry: _reload,
              onScene: () => widget.navigate('/play/campaign/scene'),
              onCampaign: () => widget.navigate('/play/campaign'),
            );
          }

          return DialogueSceneViewBody(
            initialDialogue: dialogue,
            dialogueApi: widget.dialogueApi,
            dashboardApi: widget.dashboardApi,
            onScene: () => widget.navigate('/play/campaign/scene'),
          );
        },
      ),
    );
  }
}

class _DialogueRecovery extends StatelessWidget {
  const _DialogueRecovery({
    required this.message,
    required this.onRetry,
    required this.onScene,
    required this.onCampaign,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onScene;
  final VoidCallback onCampaign;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Conversation unavailable',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(onPressed: onRetry, child: const Text('Try Again')),
              OutlinedButton(
                onPressed: onScene,
                child: const Text('Reload Scene'),
              ),
              TextButton(
                onPressed: onCampaign,
                child: const Text('Back to Campaign Overview'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class DialogueSceneViewBody extends StatefulWidget {
  const DialogueSceneViewBody({
    required this.initialDialogue,
    required this.dialogueApi,
    required this.dashboardApi,
    required this.onScene,
    super.key,
  });

  final DialogueSceneView initialDialogue;
  final DialogueApi dialogueApi;
  final PlayerDashboardApi dashboardApi;
  final VoidCallback onScene;

  @override
  State<DialogueSceneViewBody> createState() => _DialogueSceneViewBodyState();
}

class _DialogueSceneViewBodyState extends State<DialogueSceneViewBody> {
  late DialogueSceneView _dialogue;
  CompletedDialogueRecord? _completedRecord;
  DialogueCurrentTranscript? _activeTranscript;
  bool _loadingArchive = false;
  bool _advancingBeat = false;

  @override
  void initState() {
    super.initState();
    _dialogue = widget.initialDialogue;
  }

  @override
  void didUpdateWidget(covariant DialogueSceneViewBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialDialogue != widget.initialDialogue) {
      _dialogue = widget.initialDialogue;
      _completedRecord = null;
      _activeTranscript = null;
    }
  }

  void _applyDialogue(DialogueSceneView? dialogue) {
    if (dialogue == null) {
      return;
    }
    setState(() {
      _dialogue = dialogue;
    });
  }

  Future<void> _loadCompletedRecord() async {
    final recordId = _dialogue.dialogueSceneState?.completedDialogueRecordId;
    if (recordId == null || recordId.isEmpty || _loadingArchive) {
      return;
    }
    setState(() => _loadingArchive = true);
    try {
      final response = await widget.dialogueApi.getArchiveRecord(recordId);
      if (mounted) {
        setState(() {
          _completedRecord = response.record;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message)),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loadingArchive = false);
      }
    }
  }

  Future<void> _loadActiveTranscript() async {
    if (_loadingArchive) {
      return;
    }
    setState(() => _loadingArchive = true);
    try {
      final response = await widget.dialogueApi.getCurrentTranscript(
        dialogueSceneId: _dialogue.dialogueSceneId,
      );
      if (mounted) {
        setState(() {
          _activeTranscript = response.transcript;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message)),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loadingArchive = false);
      }
    }
  }

  Future<void> _advanceBeat() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Advance this beat?'),
        content: const Text(
          'Dev/GM only: this resolves the submitted beat and refreshes the current conversation or scene.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Advance Beat'),
          ),
        ],
      ),
    );

    if (confirmed != true || _advancingBeat) {
      return;
    }

    setState(() {
      _advancingBeat = true;
    });

    try {
      final result = await widget.dashboardApi.advanceBeat(
        campaignInstanceId: _dialogue.campaign?.campaignInstanceId,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Beat advanced.')),
        );
        final activeDialogue = result.currentScene?.activeDialogue;
        if (activeDialogue?.isActive == true &&
            activeDialogue!.dialogueSceneId.trim().isNotEmpty) {
          final refreshed = await widget.dialogueApi.getCurrentDialogue(
            dialogueSceneId: activeDialogue.dialogueSceneId,
          );
          if (mounted) {
            _applyDialogue(refreshed);
          }
        } else {
          widget.onScene();
        }
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Could not advance the beat right now.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _advancingBeat = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final latest = _dialogue.latestDevelopment;
    final dialogueLifecycle = _dialogue.dialogueSceneState?.lifecycleContext;
    final dialogueIsActive = _dialogue.isActive && !_dialogue.isExited;
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ConversationSurfaceCard(
            key: const Key('dialogue_surface'),
            dialogue: _dialogue,
          ),
          if (latest != null && latest.displayText.trim().isNotEmpty) ...[
            const SizedBox(height: 14),
            LatestDialogueDevelopmentCard(development: latest),
          ],
          if (_dialogue.passiveSocialInsight.isNotEmpty) ...[
            const SizedBox(height: 12),
            PassiveSocialInsightNote(
              insights: _dialogue.passiveSocialInsight,
            ),
          ],
          if (dialogueIsActive) ...[
            const SizedBox(height: 16),
            ClarifyingQuestionList(
              questions: _dialogue.clarifyingQuestions,
              onResolve: (question) async {
                final response =
                    await widget.dialogueApi.resolveClarifyingQuestion(
                  dialogueSceneId: _dialogue.dialogueSceneId,
                  questionId: question.questionId,
                  lifecycleContext: dialogueLifecycle,
                );
                _applyDialogue(response.currentDialogue);
                return response.result;
              },
            ),
            const SizedBox(height: 16),
            CommittedSocialMoveComposer(
              dialogue: _dialogue,
              onPreview: ({
                required submittedText,
                moveId,
                continueAsCommittedSocialMove = false,
                lifecycleContext,
              }) {
                return widget.dialogueApi.previewSocialMove(
                  dialogueSceneId: _dialogue.dialogueSceneId,
                  submittedText: submittedText,
                  moveId: moveId,
                  continueAsCommittedSocialMove: continueAsCommittedSocialMove,
                  lifecycleContext: lifecycleContext ?? dialogueLifecycle,
                );
              },
              onSubmit: ({
                required submittedText,
                moveId,
                continueAsCommittedSocialMove = false,
                lifecycleContext,
              }) async {
                final response = await widget.dialogueApi.submitSocialMove(
                  dialogueSceneId: _dialogue.dialogueSceneId,
                  submittedText: submittedText,
                  moveId: moveId,
                  continueAsCommittedSocialMove: continueAsCommittedSocialMove,
                  lifecycleContext: lifecycleContext ?? dialogueLifecycle,
                );
                _applyDialogue(response.currentDialogue);
                return response;
              },
              onAskClarifyingQuestion: (questionId) async {
                final question = _dialogue.clarifyingQuestions.firstWhere(
                  (candidate) => candidate.questionId == questionId,
                  orElse: () => DialogueClarifyingQuestion(
                    questionId: questionId,
                    label: 'Clarifying Question',
                    status: 'available',
                    isAvailable: true,
                    isAsked: false,
                  ),
                );
                final response =
                    await widget.dialogueApi.resolveClarifyingQuestion(
                  dialogueSceneId: _dialogue.dialogueSceneId,
                  questionId: question.questionId,
                  lifecycleContext: dialogueLifecycle,
                );
                _applyDialogue(response.currentDialogue);
                return response.result;
              },
            ),
            const SizedBox(height: 16),
            DialogueExitPanel(
              exits: _dialogue.dialogueExits,
              onResolveExit: (exit) async {
                final response = await widget.dialogueApi.resolveExit(
                  dialogueSceneId: _dialogue.dialogueSceneId,
                  exitId: exit.exitId,
                  lifecycleContext: dialogueLifecycle,
                );
                _applyDialogue(response.currentDialogue);
                if (response.completedDialogueRecord != null) {
                  setState(() {
                    _completedRecord = response.completedDialogueRecord;
                  });
                }
                return response;
              },
            ),
          ] else ...[
            const SizedBox(height: 16),
            DialogueCompletedStateCard(
              completedRecord: _completedRecord,
              onScene: widget.onScene,
              onLoadCompletedRecord: _loadCompletedRecord,
              loadingArchive: _loadingArchive,
              hasCompletedRecord:
                  _dialogue.dialogueSceneState?.completedDialogueRecordId !=
                      null,
            ),
          ],
          const SizedBox(height: 16),
          DialogueTranscriptArchive(
            dialogue: _dialogue,
            completedRecord: _completedRecord,
            activeTranscript: _activeTranscript,
            loading: _loadingArchive,
            onLoadCompletedRecord: _loadCompletedRecord,
            onLoadActiveTranscript: _loadActiveTranscript,
          ),
          const SizedBox(height: 16),
          if (_dialogue.capabilities.canAdvanceBeats) ...[
            InfoCard(
              title: 'Dev Tools',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  FilledButton.icon(
                    onPressed: _advancingBeat ? null : _advanceBeat,
                    icon: _advancingBeat
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.skip_next),
                    label:
                        Text(_advancingBeat ? 'Advancing...' : 'Advance Beat'),
                  ),
                  const Text(
                    'GM/dev only: resolve the current submitted beat from inside the conversation view.',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: widget.onScene,
              icon: const Icon(Icons.arrow_back),
              label: const Text('Back to Scene'),
            ),
          ),
        ],
      ),
    );
  }
}

class DialogueCompletedStateCard extends StatelessWidget {
  const DialogueCompletedStateCard({
    required this.completedRecord,
    required this.onScene,
    required this.onLoadCompletedRecord,
    required this.loadingArchive,
    required this.hasCompletedRecord,
    super.key,
  });

  final CompletedDialogueRecord? completedRecord;
  final VoidCallback onScene;
  final Future<void> Function() onLoadCompletedRecord;
  final bool loadingArchive;
  final bool hasCompletedRecord;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      key: const Key('dialogue_completed_state'),
      title: 'Conversation Complete',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(completedRecord?.compactSummary ??
              'This conversation has ended. Return to the current scene, or open the Transcript / Archive panel for the player-facing record.'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: onScene,
                icon: const Icon(Icons.arrow_back),
                label: const Text('Return to Current Scene'),
              ),
              if (hasCompletedRecord && completedRecord == null)
                OutlinedButton.icon(
                  onPressed: loadingArchive ? null : onLoadCompletedRecord,
                  icon: loadingArchive
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.library_books),
                  label: Text(
                    loadingArchive ? 'Loading Record...' : 'Load Summary',
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class ConversationSurfaceCard extends StatelessWidget {
  const ConversationSurfaceCard({required this.dialogue, super.key});

  final DialogueSceneView dialogue;

  @override
  Widget build(BuildContext context) {
    final title = dialogue.dialogueScene?.title ?? 'Conversation';
    final participants = dialogue.participants
        .where((participant) => participant.label.trim().isNotEmpty)
        .map((participant) => participant.label)
        .join(' · ');
    final paragraphs = dialogue.conversationSurface.paragraphs;
    return InfoCard(
      title: title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (participants.isNotEmpty) ...[
            Text(
              participants,
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 12),
          ],
          if (paragraphs.isEmpty)
            const Text('The conversation hangs in a quiet pause.')
          else
            for (final paragraph in paragraphs) ...[
              Text(
                paragraph.text,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 12),
            ],
          if (dialogue.dialogueSceneState != null) ...[
            const SizedBox(height: 4),
            Text(
              'Committed moves: ${dialogue.dialogueSceneState!.committedSocialMoveCount}/${dialogue.dialogueSceneState!.softTargetMax}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class LatestDialogueDevelopmentCard extends StatelessWidget {
  const LatestDialogueDevelopmentCard({required this.development, super.key});

  final DialogueLatestDevelopment development;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Latest Development',
      child: Text(development.displayText),
    );
  }
}

class PassiveSocialInsightNote extends StatelessWidget {
  const PassiveSocialInsightNote({required this.insights, super.key});

  final List<PassiveSocialInsight> insights;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Passive Social Insight',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            for (final insight in insights)
              Text(insight.label ??
                  'Something about the conversation stands out.'),
          ],
        ),
      ),
    );
  }
}

class ClarifyingQuestionList extends StatefulWidget {
  const ClarifyingQuestionList({
    required this.questions,
    required this.onResolve,
    super.key,
  });

  final List<DialogueClarifyingQuestion> questions;
  final Future<DialogueClarifyingQuestion> Function(
    DialogueClarifyingQuestion question,
  ) onResolve;

  @override
  State<ClarifyingQuestionList> createState() => _ClarifyingQuestionListState();
}

class _ClarifyingQuestionListState extends State<ClarifyingQuestionList> {
  final Map<String, DialogueClarifyingQuestion> _localResults = {};
  String? _resolvingQuestionId;
  String? _error;

  DialogueClarifyingQuestion _merged(DialogueClarifyingQuestion question) {
    return _localResults[question.questionId] ?? question;
  }

  Future<void> _resolve(DialogueClarifyingQuestion question) async {
    final current = _merged(question);
    if (current.isAsked ||
        !current.isAvailable ||
        _resolvingQuestionId != null) {
      return;
    }
    setState(() {
      _resolvingQuestionId = question.questionId;
      _error = null;
    });
    try {
      final result = await widget.onResolve(question);
      if (mounted) {
        setState(() {
          _localResults[result.questionId] = result;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = error.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not ask that right now.');
      }
    } finally {
      if (mounted) {
        setState(() => _resolvingQuestionId = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final visibleQuestions = widget.questions
        .where((question) =>
            question.isAvailable || question.isAsked || question.isLocked)
        .toList();
    return InfoCard(
      key: const Key('dialogue_clarifying_questions'),
      title: 'Clarifying Questions',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (visibleQuestions.isEmpty)
            const Text('No immediate clarifying questions are available.')
          else
            for (final question in visibleQuestions)
              ClarifyingQuestionCard(
                question: _merged(question),
                resolving: _resolvingQuestionId == question.questionId,
                onResolve: () => _resolve(question),
              ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

class ClarifyingQuestionCard extends StatelessWidget {
  const ClarifyingQuestionCard({
    required this.question,
    required this.resolving,
    required this.onResolve,
    super.key,
  });

  final DialogueClarifyingQuestion question;
  final bool resolving;
  final VoidCallback onResolve;

  @override
  Widget build(BuildContext context) {
    final check = question.checkPreview;
    final result = question.result;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ExpansionTile(
        enabled: question.isAsked || question.isAvailable,
        onExpansionChanged: (expanded) {
          if (expanded && !question.isAsked && question.isAvailable) {
            onResolve();
          }
        },
        title: Text(question.label),
        subtitle: Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            if (question.isAsked)
              const Chip(label: Text('asked'))
            else if (question.isLocked)
              const Chip(label: Text('locked'))
            else
              const Chip(label: Text('available')),
            if (check?.hasCheck == true && check?.label != null)
              Chip(label: Text(check!.label!)),
          ],
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          if (resolving)
            const Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: CircularProgressIndicator(),
              ),
            ),
          if (check?.hasCheck == true && check?.dcVisible == false)
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Exact DC hidden.'),
            ),
          if (result != null && result.hasVisibleResult) ...[
            if (result.mechanicsLabel != null) Text(result.mechanicsLabel!),
            if (result.text.trim().isNotEmpty) Text(result.text),
            if (result.relationshipUpdates.isNotEmpty)
              for (final update in result.relationshipUpdates) Text(update),
          ] else if (!question.isAsked && question.isAvailable)
            const Align(
              alignment: Alignment.centerLeft,
              child:
                  Text('Open to ask. This does not spend the dialogue beat.'),
            ),
        ],
      ),
    );
  }
}

typedef PreviewSocialMove = Future<DialogueSocialMovePreviewResponse> Function({
  required String submittedText,
  String? moveId,
  bool continueAsCommittedSocialMove,
  DialogueLifecycleContext? lifecycleContext,
});

typedef SubmitSocialMove = Future<DialogueSocialMoveSubmitResponse> Function({
  required String submittedText,
  String? moveId,
  bool continueAsCommittedSocialMove,
  DialogueLifecycleContext? lifecycleContext,
});

class CommittedSocialMoveComposer extends StatefulWidget {
  const CommittedSocialMoveComposer({
    required this.dialogue,
    required this.onPreview,
    required this.onSubmit,
    required this.onAskClarifyingQuestion,
    super.key,
  });

  final DialogueSceneView dialogue;
  final PreviewSocialMove onPreview;
  final SubmitSocialMove onSubmit;
  final Future<DialogueClarifyingQuestion> Function(String questionId)
      onAskClarifyingQuestion;

  @override
  State<CommittedSocialMoveComposer> createState() =>
      _CommittedSocialMoveComposerState();
}

class _CommittedSocialMoveComposerState
    extends State<CommittedSocialMoveComposer> {
  late final TextEditingController _controller;
  String? _selectedMoveId;
  DialogueSocialMovePreviewResponse? _preview;
  String? _error;
  bool _continueAsCommittedSocialMove = false;
  bool _previewing = false;
  bool _submitting = false;
  bool _draftStale = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _canPreview =>
      !_previewing &&
      !_submitting &&
      (_controller.text.trim().isNotEmpty || _selectedMoveId != null);

  Future<void> _previewMove({bool continueAsCommitted = false}) async {
    if (!_canPreview && !continueAsCommitted) {
      return;
    }
    setState(() {
      _previewing = true;
      _error = null;
      if (continueAsCommitted) {
        _continueAsCommittedSocialMove = true;
      }
    });
    try {
      final response = await widget.onPreview(
        submittedText: _controller.text,
        moveId: _selectedMoveId,
        continueAsCommittedSocialMove: continueAsCommitted,
        lifecycleContext: widget.dialogue.dialogueSceneState?.lifecycleContext,
      );
      if (mounted) {
        setState(() {
          _preview = response;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          if (error.shouldInvalidatePreview) {
            _preview = null;
            _draftStale = true;
          }
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not preview that move right now.');
      }
    } finally {
      if (mounted) {
        setState(() => _previewing = false);
      }
    }
  }

  Future<void> _submitMove() async {
    if (_submitting) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.onSubmit(
        submittedText: _controller.text,
        moveId: _selectedMoveId,
        continueAsCommittedSocialMove: _continueAsCommittedSocialMove,
        lifecycleContext: _preview?.lifecycleContext ??
            widget.dialogue.dialogueSceneState?.lifecycleContext,
      );
      if (mounted) {
        setState(() {
          _preview = null;
          _controller.clear();
          _selectedMoveId = null;
          _continueAsCommittedSocialMove = false;
          _draftStale = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Social move submitted.')),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          if (error.shouldInvalidatePreview) {
            _preview = null;
            _draftStale = true;
          }
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not submit that move right now.');
      }
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _askOverlapQuestion(String questionId) async {
    setState(() {
      _previewing = true;
      _error = null;
    });
    try {
      final result = await widget.onAskClarifyingQuestion(questionId);
      if (mounted) {
        setState(() {
          _preview = null;
          _continueAsCommittedSocialMove = false;
          _draftStale = result.result?.hasVisibleResult ?? false;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          if (error.shouldInvalidatePreview) {
            _preview = null;
            _draftStale = true;
          }
        });
      }
    } finally {
      if (mounted) {
        setState(() => _previewing = false);
      }
    }
  }

  void _selectMove(DialogueCommittedSocialMove move) {
    setState(() {
      _selectedMoveId = move.moveId;
      _continueAsCommittedSocialMove = false;
      if (_controller.text.trim().isEmpty) {
        _controller.text = move.label;
        _controller.selection = TextSelection.fromPosition(
          TextPosition(offset: _controller.text.length),
        );
      }
      _preview = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final activeMoves = widget.dialogue.committedSocialMoves
        .where((move) => move.isAvailable || move.status == 'locked')
        .toList();
    final disabled = widget.dialogue.isExited;
    return InfoCard(
      key: const Key('dialogue_social_move_composer'),
      title: 'Committed Social Move',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Choose one meaningful social commitment. Preview it before spending the dialogue beat.',
          ),
          const SizedBox(height: 12),
          if (activeMoves.isNotEmpty) ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final move in activeMoves)
                  ChoiceChip(
                    label: Text(move.label),
                    selected: _selectedMoveId == move.moveId,
                    onSelected: disabled || !move.isAvailable
                        ? null
                        : (_) => _selectMove(move),
                  ),
              ],
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _controller,
            enabled: !disabled,
            minLines: 2,
            maxLines: 5,
            decoration: const InputDecoration(
              labelText: 'What do you say or do?',
              hintText: 'I press gently about what she remembers.',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) {
              setState(() {
                _preview = null;
                _error = null;
                _continueAsCommittedSocialMove = false;
                _draftStale = false;
              });
            },
          ),
          if (_draftStale) ...[
            const SizedBox(height: 8),
            Text(
              'Draft may be outdated after the clarifying answer. Review before submitting.',
              style: TextStyle(color: Theme.of(context).colorScheme.primary),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: disabled || !_canPreview ? null : () => _previewMove(),
            icon: _previewing
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.rate_review),
            label: Text(_previewing ? 'Previewing...' : 'Preview Social Move'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          if (_preview != null) ...[
            const SizedBox(height: 16),
            SocialMovePreviewPanel(
              preview: _preview!,
              submitting: _submitting,
              onAskClarifyingQuestion: _askOverlapQuestion,
              onContinueAsCommittedMove: () =>
                  _previewMove(continueAsCommitted: true),
              onEdit: () => setState(() {
                _preview = null;
                _continueAsCommittedSocialMove = false;
              }),
              onSubmit: _submitMove,
            ),
          ],
        ],
      ),
    );
  }
}

class SocialMovePreviewPanel extends StatelessWidget {
  const SocialMovePreviewPanel({
    required this.preview,
    required this.submitting,
    required this.onAskClarifyingQuestion,
    required this.onContinueAsCommittedMove,
    required this.onEdit,
    required this.onSubmit,
    super.key,
  });

  final DialogueSocialMovePreviewResponse preview;
  final bool submitting;
  final Future<void> Function(String questionId) onAskClarifyingQuestion;
  final Future<void> Function() onContinueAsCommittedMove;
  final VoidCallback onEdit;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context) {
    final previewData = preview.preview;
    return Container(
      key: const Key('dialogue_social_move_preview'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Preview', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (preview.isOverlap && preview.overlap != null) ...[
            Text(preview.message ??
                '${preview.overlap!.label} is available as a Clarifying Question.'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton(
                  onPressed: () =>
                      onAskClarifyingQuestion(preview.overlap!.questionId),
                  child: const Text('Ask Clarifying Question'),
                ),
                OutlinedButton(
                  onPressed: onContinueAsCommittedMove,
                  child: const Text('Continue as Committed Social Move'),
                ),
                TextButton(onPressed: onEdit, child: const Text('Edit Action')),
              ],
            ),
          ] else if (previewData != null) ...[
            Text(previewData.interpretation),
            const SizedBox(height: 8),
            Text(previewData.spendsDialogueBeat
                ? 'This spends the dialogue beat.'
                : 'This does not spend the dialogue beat.'),
            const SizedBox(height: 8),
            if (previewData.requiresCheck)
              Text(previewData.checkPreview?.label ?? 'Check required.')
            else
              const Text('Requires: no check.'),
            if (previewData.checkPreview?.dcVisible == false)
              const Text('Exact DC hidden.'),
            if (previewData.assistance.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final note in previewData.assistance)
                Text(note.label == null
                    ? note.text
                    : '${note.label}: ${note.text}'),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: submitting ? null : onSubmit,
                  icon: submitting
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(submitting ? 'Submitting...' : 'Submit Move'),
                ),
                OutlinedButton(onPressed: onEdit, child: const Text('Edit')),
              ],
            ),
          ] else ...[
            Text(preview.message ??
                'Choose an authored move, ask a Clarifying Question, use an exit, or edit your action.'),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: onEdit, child: const Text('Edit')),
          ],
        ],
      ),
    );
  }
}

class DialogueExitPanel extends StatefulWidget {
  const DialogueExitPanel({
    required this.exits,
    required this.onResolveExit,
    super.key,
  });

  final List<DialogueExit> exits;
  final Future<DialogueExitResolveResponse> Function(DialogueExit exit)
      onResolveExit;

  @override
  State<DialogueExitPanel> createState() => _DialogueExitPanelState();
}

class _DialogueExitPanelState extends State<DialogueExitPanel> {
  String? _resolvingExitId;
  DialogueExitResolveResponse? _result;
  String? _error;

  Future<void> _resolve(DialogueExit exit) async {
    if (_resolvingExitId != null || !exit.isAvailable) {
      return;
    }
    setState(() {
      _resolvingExitId = exit.exitId;
      _error = null;
    });
    try {
      final result = await widget.onResolveExit(exit);
      if (mounted) {
        setState(() => _result = result);
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = error.message);
      }
    } finally {
      if (mounted) {
        setState(() => _resolvingExitId = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      key: const Key('dialogue_exits'),
      title: 'Exits',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.exits.isEmpty)
            const Text('No authored exits are available right now.')
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final exit in widget.exits)
                  OutlinedButton(
                    onPressed: exit.isAvailable ? () => _resolve(exit) : null,
                    child: Text(_resolvingExitId == exit.exitId
                        ? 'Resolving...'
                        : exit.label),
                  ),
              ],
            ),
          if (_result?.exitResult['text'] != null) ...[
            const SizedBox(height: 12),
            Text(_result!.exitResult['text'].toString()),
          ],
          if (_result?.completedDialogueRecord?.compactSummary != null) ...[
            const SizedBox(height: 8),
            Text(_result!.completedDialogueRecord!.compactSummary!),
          ],
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ],
      ),
    );
  }
}

class DialogueTranscriptArchive extends StatelessWidget {
  const DialogueTranscriptArchive({
    required this.dialogue,
    required this.completedRecord,
    required this.activeTranscript,
    required this.loading,
    required this.onLoadCompletedRecord,
    required this.onLoadActiveTranscript,
    super.key,
  });

  final DialogueSceneView dialogue;
  final CompletedDialogueRecord? completedRecord;
  final DialogueCurrentTranscript? activeTranscript;
  final bool loading;
  final Future<void> Function() onLoadCompletedRecord;
  final Future<void> Function() onLoadActiveTranscript;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('dialogue_transcript_archive'),
      child: ExpansionTile(
        title: const Text('Transcript / Archive'),
        subtitle: const Text('Player-facing record, collapsed by default'),
        onExpansionChanged: (expanded) {
          if (!expanded) {
            return;
          }
          if (completedRecord == null &&
              dialogue.dialogueSceneState?.completedDialogueRecordId != null) {
            onLoadCompletedRecord();
          } else if (activeTranscript == null && !dialogue.isExited) {
            onLoadActiveTranscript();
          }
        },
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          if (loading)
            const Align(
              alignment: Alignment.centerLeft,
              child: CircularProgressIndicator(),
            )
          else if (completedRecord != null) ...[
            if (completedRecord!.compactSummary != null)
              Text(completedRecord!.compactSummary!),
            const SizedBox(height: 12),
            if (completedRecord!.transcriptTurns.isEmpty)
              const Text('No transcript turns are available yet.')
            else
              for (final turn in completedRecord!.transcriptTurns)
                if (turn.displayText.trim().isNotEmpty)
                  ListTile(
                    dense: true,
                    title: Text(turn.displayText),
                    subtitle: Text(
                      [
                        if (turn.speakerLabel != null) turn.speakerLabel,
                        _humanizeUiText(turn.turnType),
                      ].whereType<String>().join(' · '),
                    ),
                  ),
          ] else if (activeTranscript != null) ...[
            if (activeTranscript!.turns.isEmpty)
              const Text('No transcript turns are available yet.')
            else
              for (final turn in activeTranscript!.turns)
                if (turn.displayText.trim().isNotEmpty)
                  ListTile(
                    dense: true,
                    title: Text(turn.displayText),
                    subtitle: Text(
                      [
                        if (turn.speakerLabel != null) turn.speakerLabel,
                        _humanizeUiText(turn.turnType),
                      ].whereType<String>().join(' · '),
                    ),
                  ),
          ] else if (dialogue.isExited)
            const Text('The completed record is available after refresh.')
          else
            const Text(
              'Open this panel to load the current player-facing transcript.',
            ),
        ],
      ),
    );
  }
}

String _humanizeUiText(String value) {
  return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .split(' ')
      .where((word) => word.trim().isNotEmpty)
      .map((word) => word[0].toUpperCase() + word.substring(1))
      .join(' ');
}
