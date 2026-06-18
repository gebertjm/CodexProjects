import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import 'greyvale_endpoint_card.dart';
import '../shared/widgets/app_scaffold.dart';

String _dialogueRoute(String dialogueSceneId, {bool allowReentry = false}) {
  return Uri(
    path: '/play/campaign/dialogue',
    queryParameters: {
      'dialogue_scene_id': dialogueSceneId,
      if (allowReentry) 'allow_reentry': 'true',
    },
  ).toString();
}

String _searchText(String? value) {
  return (value ?? '').toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();
}

bool _sceneResultLooksLikeDialogue(SceneResultEntry entry) {
  final resultText = _searchText(
    [
      entry.sceneType,
      entry.kind,
      entry.title,
      entry.summary,
      entry.narration,
      entry.submittedActionSummary,
      entry.interpretedActionSummary,
    ].whereType<String>().join(' '),
  );
  return entry.sceneType == 'dialogue' ||
      entry.kind.contains('dialogue') ||
      resultText.contains('dialogue started') ||
      resultText.contains('conversation started') ||
      resultText.contains('latest exchange');
}

bool _sceneReferenceEntryLooksPerson(SceneReferenceEntry entry) {
  final type = entry.type.trim().toLowerCase();
  final id = entry.id.trim().toLowerCase();
  return type == 'npc' ||
      type == 'person' ||
      id.startsWith('npc:') ||
      id.startsWith('person:');
}

List<SceneReferenceEntry> _dialogueEntriesForSceneView(
    CurrentSceneView sceneView) {
  final entries = <SceneReferenceEntry>[];
  final seenDialogueIds = <String>{};

  void addEntry(SceneReferenceEntry entry) {
    final dialogueSceneId = entry.dialogueSceneId?.trim();
    if (dialogueSceneId == null || dialogueSceneId.isEmpty) {
      return;
    }
    if (!_sceneReferenceEntryLooksPerson(entry)) {
      return;
    }
    if (!seenDialogueIds.add(dialogueSceneId)) {
      return;
    }
    entries.add(entry);
  }

  final reference = sceneView.sceneReference;
  if (reference != null) {
    for (final entry in reference.peopleNearby) {
      addEntry(entry);
    }
    for (final entry
        in reference.actionTargets.where(_sceneReferenceEntryLooksPerson)) {
      addEntry(entry);
    }
  }

  for (final npc in sceneView.visibleNpcs) {
    addEntry(
      SceneReferenceEntry(
        id: 'npc:${npc.npcId}',
        type: 'npc',
        label: npc.displayName,
        description: npc.activityText ?? npc.activity,
        dialogueSceneId: npc.dialogueSceneId,
        dialogueTitle: npc.dialogueTitle,
      ),
    );
  }

  for (final affordance in sceneView.visibleAffordances) {
    final type = affordance.type.trim().toLowerCase();
    if (type != 'npc' && type != 'person') {
      continue;
    }
    addEntry(
      SceneReferenceEntry(
        id: affordance.affordanceId,
        type: affordance.type,
        label: affordance.label,
        description: affordance.description,
        dialogueSceneId: affordance.dialogueSceneId,
        dialogueTitle: affordance.dialogueTitle,
      ),
    );
  }

  return entries;
}

SceneReferenceEntry? _dialogueEntryById(
    String? dialogueSceneId, List<SceneReferenceEntry> entries) {
  final normalizedId = dialogueSceneId?.trim();
  if (normalizedId == null || normalizedId.isEmpty) {
    return null;
  }
  for (final entry in entries) {
    if (entry.dialogueSceneId?.trim() == normalizedId) {
      return entry;
    }
  }
  return null;
}

SceneReferenceEntry? _dialogueEntryForLatestResult(
  SceneResultEntry? latestEntry,
  List<SceneReferenceEntry> entries,
) {
  if (latestEntry == null || entries.isEmpty) {
    return null;
  }

  final explicitEntry =
      _dialogueEntryById(latestEntry.dialogueSceneId, entries);
  if (explicitEntry != null) {
    return explicitEntry;
  }

  if (!_sceneResultLooksLikeDialogue(latestEntry)) {
    return null;
  }

  final haystack = _searchText(
    [
      latestEntry.title,
      latestEntry.summary,
      latestEntry.narration,
      latestEntry.submittedActionSummary,
      latestEntry.interpretedActionSummary,
    ].whereType<String>().join(' '),
  );
  final matches = entries.where((entry) {
    final candidates = [
      entry.label,
      entry.description,
      entry.dialogueTitle,
      entry.id,
    ].whereType<String>().map(_searchText).where((text) => text.length >= 3);
    return candidates.any(haystack.contains);
  }).toList();

  if (matches.length == 1) {
    return matches.first;
  }
  return entries.length == 1 ? entries.first : null;
}

class CampaignScenePage extends StatefulWidget {
  const CampaignScenePage({
    required this.dashboardApi,
    required this.onBack,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final PlayerDashboardApi dashboardApi;
  final VoidCallback onBack;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<CampaignScenePage> createState() => _CampaignScenePageState();
}

class _CampaignScenePageState extends State<CampaignScenePage> {
  late Future<CurrentSceneView> _scene;

  @override
  void initState() {
    super.initState();
    _scene = widget.dashboardApi.getCurrentScene();
  }

  void _reload() {
    setState(() {
      _scene = widget.dashboardApi.getCurrentScene();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Current Scene',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh scene',
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign'),
          child: const Text('Campaign'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/history'),
          child: const Text('History'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/dialogue'),
          child: const Text('Dialogue'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/knowledge'),
          child: const Text('Knowledge'),
        ),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<CurrentSceneView>(
        future: _scene,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _SceneError(
              message:
                  'We couldn’t load the current scene. Try refreshing, or return to the campaign overview.',
              onRetry: _reload,
              onCampaignOverview: () => widget.navigate('/play/campaign'),
              onDashboard: () => widget.navigate('/play'),
            );
          }

          final scene = snapshot.requireData;
          if (scene.shouldReturnToCampaignOverview) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                widget.navigate('/play/campaign');
              }
            });
            return const Center(child: CircularProgressIndicator());
          }

          if (!scene.hasActiveCampaign || scene.scene == null) {
            return _SceneError(
              message:
                  'No active scene is available yet. You can return to the campaign overview and try again.',
              onRetry: _reload,
              onCampaignOverview: () => widget.navigate('/play/campaign'),
              onDashboard: () => widget.navigate('/play'),
            );
          }

          final activeDialogue = scene.activeDialogue;
          if (activeDialogue?.isActive == true &&
              activeDialogue!.dialogueSceneId.trim().isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                widget.navigate(_dialogueRoute(activeDialogue.dialogueSceneId));
              }
            });
            return const Center(child: CircularProgressIndicator());
          }

          return _RichSceneView(
            sceneView: scene,
            dashboardApi: widget.dashboardApi,
            onSceneChanged: _reload,
            onCampaignOverview: () => widget.navigate('/play/campaign'),
            onManageCharacters: () => widget.navigate('/play/characters'),
            onFullDiagnostics: () =>
                widget.navigate('/play/dev/campaign-diagnostics'),
            onOpenMechanicsInspector: () =>
                widget.navigate('/play/dev/exploration-mechanics'),
            onOpenHistory: () => widget.navigate('/play/campaign/history'),
            onOpenKnowledge: () => widget.navigate('/play/campaign/knowledge'),
            onOpenDialogue: (dialogueSceneIdOrRoute) => widget.navigate(
              dialogueSceneIdOrRoute.startsWith('/play/')
                  ? dialogueSceneIdOrRoute
                  : _dialogueRoute(dialogueSceneIdOrRoute),
            ),
          );
        },
      ),
    );
  }
}

class _RichSceneView extends StatefulWidget {
  const _RichSceneView({
    required this.sceneView,
    required this.dashboardApi,
    required this.onSceneChanged,
    required this.onCampaignOverview,
    required this.onManageCharacters,
    required this.onFullDiagnostics,
    required this.onOpenMechanicsInspector,
    required this.onOpenHistory,
    required this.onOpenKnowledge,
    required this.onOpenDialogue,
  });

  final CurrentSceneView sceneView;
  final PlayerDashboardApi dashboardApi;
  final VoidCallback onSceneChanged;
  final VoidCallback onCampaignOverview;
  final VoidCallback onManageCharacters;
  final VoidCallback onFullDiagnostics;
  final VoidCallback onOpenMechanicsInspector;
  final VoidCallback onOpenHistory;
  final VoidCallback onOpenKnowledge;
  final void Function(String dialogueSceneId) onOpenDialogue;

  @override
  State<_RichSceneView> createState() => _RichSceneViewState();
}

class _RichSceneViewState extends State<_RichSceneView> {
  bool _advancingBeat = false;
  bool _checkingDiagnostics = false;
  String? _submittingConversationId;
  PlaytestDiagnostics? _diagnostics;
  String? _diagnosticsError;

  @override
  void initState() {
    super.initState();
    if (widget.sceneView.capabilities.canAdvanceBeats) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _runDiagnostics(silent: true);
        }
      });
    }
  }

  Future<void> _runDiagnostics({bool silent = false}) async {
    if (_checkingDiagnostics) {
      return;
    }
    setState(() {
      _checkingDiagnostics = true;
      _diagnosticsError = null;
    });

    try {
      final diagnostics = await widget.dashboardApi.getPlaytestDiagnostics(
        campaignInstanceId: widget.sceneView.campaign?.campaignInstanceId,
      );
      if (mounted) {
        setState(() {
          _diagnostics = diagnostics;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _diagnosticsError = error.message;
        });
        if (!silent) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error.message)),
          );
        }
      }
    } catch (_) {
      const message = 'Could not run diagnostics right now.';
      if (mounted) {
        setState(() {
          _diagnosticsError = message;
        });
        if (!silent) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text(message)),
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() {
          _checkingDiagnostics = false;
        });
      }
    }
  }

  Future<void> _advanceBeat() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Advance this beat?'),
        content: const Text(
          'Dev/GM only: this closes the current action window, resolves the beat, and opens the next action window.',
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
      await widget.dashboardApi.advanceBeat(
        campaignInstanceId: widget.sceneView.campaign?.campaignInstanceId,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Beat advanced.')),
        );
        if (widget.sceneView.capabilities.canAdvanceBeats) {
          await _runDiagnostics(silent: true);
        }
        widget.onSceneChanged();
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

  bool _canOpenDialogueWithoutBeat(SceneReferenceEntry entry) {
    final dialogueSceneId = entry.dialogueSceneId?.trim();
    final activeDialogue = widget.sceneView.activeDialogue;
    if (dialogueSceneId == null ||
        dialogueSceneId.isEmpty ||
        activeDialogue == null ||
        activeDialogue.dialogueSceneId != dialogueSceneId) {
      return false;
    }
    return activeDialogue.isActive ||
        (activeDialogue.isExited &&
            activeDialogue.sameBeatReentryAvailable == true);
  }

  Future<void> _openOrSubmitConversation(SceneReferenceEntry entry) async {
    final dialogueSceneId = entry.dialogueSceneId?.trim();
    if (dialogueSceneId == null || dialogueSceneId.isEmpty) {
      return;
    }

    if (_canOpenDialogueWithoutBeat(entry)) {
      final reentry = widget.sceneView.activeDialogue?.isExited == true;
      widget.onOpenDialogue(
        reentry
            ? _dialogueRoute(dialogueSceneId, allowReentry: true)
            : _dialogueRoute(dialogueSceneId),
      );
      return;
    }

    if (_submittingConversationId != null) {
      return;
    }

    setState(() {
      _submittingConversationId = dialogueSceneId;
    });

    try {
      final label = entry.label.trim().isEmpty ? 'this person' : entry.label;
      final rawText = 'Talk to $label';
      final preview = await widget.dashboardApi.previewAction(
        rawText: rawText,
        selectedVerb: 'talk',
        selectedAffordanceId: entry.id,
      );
      if (!preview.isResolved) {
        final message = preview.message ??
            'That conversation is not available from the current scene.';
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(message)),
          );
        }
        return;
      }

      await widget.dashboardApi.submitAction(
        rawText: rawText,
        selectedVerb: 'talk',
        selectedAffordanceId: entry.id,
        actionWindowId: preview.actionWindowId,
        lifecycleContext: preview.lifecycleContext,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Conversation submitted for this beat. Advance the beat to enter it.',
            ),
          ),
        );
        widget.onSceneChanged();
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
            content: Text('Could not submit that conversation right now.'),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _submittingConversationId = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final feedEntries = widget.sceneView.sceneResultFeed?.recentEntries ??
        const <SceneResultEntry>[];
    final latestEntry = widget.sceneView.sceneResultFeed?.latestResult ??
        (feedEntries.isNotEmpty ? feedEntries.first : null);
    final olderEntries = feedEntries
        .where((entry) => entry.beatResultId != latestEntry?.beatResultId)
        .toList();
    final dialogueEntries = _dialogueEntriesForSceneView(widget.sceneView);
    final latestDialogueEntry =
        _dialogueEntryForLatestResult(latestEntry, dialogueEntries);
    final fallbackBeatResults = latestEntry == null
        ? _sceneBeatResults(widget.sceneView.recentSummary)
        : const <SceneBeatResult>[];
    final endpoint = widget.sceneView.sliceEndpoint;
    final endpointReached = endpoint?.isEndpointReached == true ||
        widget.sceneView.actionStatus.state == 'slice_endpoint_reached';

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SceneHeader(sceneView: widget.sceneView),
          const SizedBox(height: 16),
          _SceneNarrativeCard(sceneView: widget.sceneView),
          if (latestEntry != null) ...[
            const SizedBox(height: 16),
            _LatestSceneResult(
              entry: latestEntry,
              dialogueEntry: latestDialogueEntry,
              onOpenDialogue: widget.onOpenDialogue,
            ),
          ] else if (fallbackBeatResults.isNotEmpty) ...[
            const SizedBox(height: 16),
            _LatestBeatResult(result: fallbackBeatResults.first),
          ],
          const SizedBox(height: 12),
          _CurrentAimNote(
            objective: widget.sceneView.objective,
            status: widget.sceneView.actionStatus,
          ),
          if (endpointReached && endpoint != null) ...[
            const SizedBox(height: 16),
            GreyvaleEndpointCard(
              endpoint: endpoint,
              onOpenHistory: widget.onOpenHistory,
              onOpenKnowledge: widget.onOpenKnowledge,
              onCampaignOverview: widget.onCampaignOverview,
            ),
          ],
          if (dialogueEntries.isNotEmpty) ...[
            const SizedBox(height: 16),
            _AvailableDialoguesCard(
              entries: dialogueEntries,
              activeDialogue: widget.sceneView.activeDialogue,
              submittingDialogueSceneId: _submittingConversationId,
              onStartConversation: _openOrSubmitConversation,
            ),
          ],
          if (!endpointReached) ...[
            const SizedBox(height: 16),
            _ActionComposer(
              dashboardApi: widget.dashboardApi,
              sceneView: widget.sceneView,
              onSceneChanged: widget.onSceneChanged,
            ),
          ],
          const SizedBox(height: 16),
          _CollapsedRecentDevelopments(
            entries: olderEntries,
            fallbackResults: fallbackBeatResults.skip(1).toList(),
          ),
          const SizedBox(height: 12),
          _SceneReferenceSection(
            dashboardApi: widget.dashboardApi,
            sceneView: widget.sceneView,
            reference: widget.sceneView.sceneReference,
            fallbackNpcs: widget.sceneView.visibleNpcs,
            fallbackAffordances: widget.sceneView.visibleAffordances,
            onSceneChanged: widget.onSceneChanged,
            onStartConversation: _openOrSubmitConversation,
          ),
          const SizedBox(height: 16),
          _MechanicalDetails(details: widget.sceneView.mechanicalDetails),
          if (widget.sceneView.capabilities.canAdvanceBeats) ...[
            const SizedBox(height: 16),
            _DevDiagnosticsPanel(
              sceneView: widget.sceneView,
              diagnostics: _diagnostics,
              diagnosticsError: _diagnosticsError,
              checking: _checkingDiagnostics,
              advancingBeat: _advancingBeat,
              onRunCheck: () => _runDiagnostics(),
              onAdvanceBeat: _advanceBeat,
              onOpenFullDiagnostics: widget.onFullDiagnostics,
              onOpenMechanicsInspector: widget.onOpenMechanicsInspector,
            ),
          ],
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                onPressed: widget.onCampaignOverview,
                child: const Text('Back to Campaign Overview'),
              ),
              OutlinedButton(
                onPressed: widget.onManageCharacters,
                child: const Text('Manage Characters'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DevDiagnosticsPanel extends StatelessWidget {
  const _DevDiagnosticsPanel({
    required this.sceneView,
    required this.diagnostics,
    required this.diagnosticsError,
    required this.checking,
    required this.advancingBeat,
    required this.onRunCheck,
    required this.onAdvanceBeat,
    required this.onOpenFullDiagnostics,
    required this.onOpenMechanicsInspector,
  });

  final CurrentSceneView sceneView;
  final PlaytestDiagnostics? diagnostics;
  final String? diagnosticsError;
  final bool checking;
  final bool advancingBeat;
  final VoidCallback onRunCheck;
  final VoidCallback onAdvanceBeat;
  final VoidCallback onOpenFullDiagnostics;
  final VoidCallback onOpenMechanicsInspector;

  @override
  Widget build(BuildContext context) {
    final summary = diagnostics?.summary;
    final resultId = summary?.latestResultId ??
        sceneView.sceneResultFeed?.latestResult?.beatResultId;
    final windowState =
        summary?.currentActionWindowState ?? sceneView.actionStatus.state;
    final beatNumber = summary?.beatNumber;
    final issueCount = diagnostics?.problemCount;

    return InfoCard(
      title: 'Dev Diagnostics',
      action: Chip(
        label: Text(diagnostics?.status.toUpperCase() ?? 'NOT CHECKED'),
        backgroundColor: _diagnosticStatusColor(context, diagnostics?.status),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              _DiagnosticFact(
                label: 'Beat',
                value: beatNumber == null ? 'Unknown' : beatNumber.toString(),
              ),
              _DiagnosticFact(
                label: 'Window',
                value: _humanize(windowState),
              ),
              _DiagnosticFact(
                label: 'Latest Result',
                value: resultId == null || resultId.isEmpty ? 'None' : resultId,
              ),
              _DiagnosticFact(
                label: 'Warnings',
                value:
                    issueCount == null ? 'Not checked' : issueCount.toString(),
              ),
            ],
          ),
          if (diagnosticsError != null) ...[
            const SizedBox(height: 10),
            Text(
              diagnosticsError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          if (diagnostics != null && diagnostics!.hasProblems) ...[
            const SizedBox(height: 10),
            for (final issue
                in [...diagnostics!.errors, ...diagnostics!.warnings].take(3))
              _BulletText(issue.message),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: checking ? null : onRunCheck,
                icon: checking
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.fact_check),
                label: Text(checking ? 'Checking...' : 'Run Check'),
              ),
              FilledButton.icon(
                onPressed: advancingBeat ? null : onAdvanceBeat,
                icon: advancingBeat
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.fast_forward),
                label: Text(advancingBeat ? 'Resolving...' : 'Advance Beat'),
              ),
              TextButton.icon(
                onPressed: onOpenFullDiagnostics,
                icon: const Icon(Icons.open_in_new),
                label: const Text('Open Full Diagnostics'),
              ),
              ExplorationMechanicsInspectorEntryPoint(
                canInspect: true,
                onOpen: onOpenMechanicsInspector,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ExplorationMechanicsInspectorEntryPoint extends StatelessWidget {
  const ExplorationMechanicsInspectorEntryPoint({
    required this.canInspect,
    required this.onOpen,
    super.key,
  });

  final bool canInspect;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    if (!canInspect) {
      return const SizedBox.shrink();
    }
    return TextButton.icon(
      onPressed: onOpen,
      icon: const Icon(Icons.travel_explore),
      label: const Text('Exploration Mechanics'),
    );
  }
}

class _DiagnosticFact extends StatelessWidget {
  const _DiagnosticFact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 120),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          Text(value),
        ],
      ),
    );
  }
}

class _SceneNarrativeCard extends StatelessWidget {
  const _SceneNarrativeCard({required this.sceneView});

  final CurrentSceneView sceneView;

  @override
  Widget build(BuildContext context) {
    final scene = sceneView.scene;
    final narration = sceneView.sceneNarration;
    final paragraphs = narration?.paragraphs
            .where((paragraph) => paragraph.text.trim().isNotEmpty)
            .toList() ??
        [
          SceneNarrationParagraph(
            kind: 'setting',
            text: scene?.description ??
                scene?.summary ??
                'The scene is quiet for the moment.',
          )
        ];
    final fullParagraphs = narration?.fullCurrentParagraphs
            .where((paragraph) => paragraph.text.trim().isNotEmpty)
            .toList() ??
        const <SceneNarrationParagraph>[];
    final showFull = narration?.fullCurrentNarrationAvailable == true &&
        fullParagraphs.isNotEmpty;

    return InfoCard(
      title: 'Scene',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final paragraph in paragraphs) ...[
            Text(
              paragraph.text,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    height: 1.48,
                    letterSpacing: 0.05,
                  ),
            ),
            if (paragraph != paragraphs.last) const SizedBox(height: 14),
          ],
          if (showFull) ...[
            const SizedBox(height: 10),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: EdgeInsets.zero,
              title: const Text('Expand Full Scene Description'),
              children: [
                for (final paragraph in fullParagraphs)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      paragraph.text,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            height: 1.45,
                          ),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _LatestSceneResult extends StatelessWidget {
  const _LatestSceneResult({
    required this.entry,
    required this.onOpenDialogue,
    this.dialogueEntry,
  });

  final SceneResultEntry entry;
  final SceneReferenceEntry? dialogueEntry;
  final void Function(String dialogueSceneId) onOpenDialogue;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final dialogueSceneId = dialogueEntry?.dialogueSceneId?.trim();
    final title = switch (entry.sceneType) {
      'dialogue' => 'Latest Exchange',
      'combat' => 'Latest Action',
      _ => 'Latest Development',
    };
    final supporting = [
      if (entry.submittedActionSummary != null)
        'Action: ${entry.submittedActionSummary}',
      if (entry.interpretedActionSummary != null)
        'Interpreted as: ${entry.interpretedActionSummary}',
    ];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.primaryContainer.withValues(alpha: 0.42),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: colorScheme.primary.withValues(alpha: 0.38),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Icon(Icons.auto_awesome, color: colorScheme.primary, size: 18),
              Text(
                title,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: colorScheme.primary,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                    ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: colorScheme.surface.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: colorScheme.primary.withValues(alpha: 0.24),
                  ),
                ),
                child: Text(
                  'Just resolved',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            entry.text,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                  color: colorScheme.onPrimaryContainer,
                ),
          ),
          if (dialogueSceneId != null && dialogueSceneId.isNotEmpty) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              key: Key('latest_dialogue_entry_$dialogueSceneId'),
              onPressed: () => onOpenDialogue(dialogueSceneId),
              icon: const Icon(Icons.forum_outlined),
              label: Text('Open conversation with ${dialogueEntry!.label}'),
            ),
          ],
          if (entry.visibleChanges.isNotEmpty ||
              entry.knowledgeGained.isNotEmpty ||
              entry.objectiveUpdates.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final change in [
                  ...entry.visibleChanges,
                  ...entry.knowledgeGained,
                  ...entry.objectiveUpdates,
                ].take(4))
                  Chip(
                    label: Text(change),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
          ],
          if (supporting.isNotEmpty || entry.safeMechanics.isNotEmpty) ...[
            const SizedBox(height: 8),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: EdgeInsets.zero,
              title: const Text('Result details'),
              children: [
                for (final text in supporting) _BulletText(text),
                for (final text in entry.safeMechanics)
                  _BulletText('Mechanic: $text'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _PreviousSceneResults extends StatelessWidget {
  const _PreviousSceneResults({required this.entries});

  final List<SceneResultEntry> entries;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colorScheme.surface.withValues(alpha: 0.62),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            switch (entries.first.sceneType) {
              'dialogue' => 'Recent conversation',
              'combat' => 'Recent combat log',
              _ => 'Recent developments',
            },
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          for (final entry in entries)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('• ',
                      style: TextStyle(color: colorScheme.onSurfaceVariant)),
                  Expanded(
                    child: Text(
                      entry.text,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            height: 1.4,
                            color: colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LatestBeatResult extends StatelessWidget {
  const _LatestBeatResult({required this.result});

  final SceneBeatResult result;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.primaryContainer.withValues(alpha: 0.38),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: colorScheme.primary.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Icon(
                Icons.auto_awesome,
                color: colorScheme.primary,
                size: 18,
              ),
              Text(
                'Latest Beat Result',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: colorScheme.primary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                    ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: colorScheme.surface.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: colorScheme.primary.withValues(alpha: 0.24),
                  ),
                ),
                child: Text(
                  'Just resolved',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            result.text,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                  color: colorScheme.onPrimaryContainer,
                ),
          ),
        ],
      ),
    );
  }
}

class _PreviousBeatResults extends StatelessWidget {
  const _PreviousBeatResults({required this.results});

  final List<SceneBeatResult> results;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colorScheme.surface.withValues(alpha: 0.62),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Earlier in this scene',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          for (final result in results)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '• ',
                    style: TextStyle(color: colorScheme.onSurfaceVariant),
                  ),
                  Expanded(
                    child: Text(
                      result.text,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            height: 1.4,
                            color: colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CurrentAimNote extends StatelessWidget {
  const _CurrentAimNote({required this.objective, required this.status});

  final SceneObjective? objective;
  final DashboardActionStatus status;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final aim = objective?.title?.trim();
    final statusLabel =
        status.label.isEmpty ? _humanize(status.state) : status.label;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colorScheme.surface.withValues(alpha: 0.74),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.7),
        ),
      ),
      child: Wrap(
        spacing: 12,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            aim == null || aim.isEmpty
                ? 'Current aim: stay oriented.'
                : 'Current aim: ${lowerFirst(aim)}.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          Chip(
            label: Text(statusLabel),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _CollapsedRecentDevelopments extends StatelessWidget {
  const _CollapsedRecentDevelopments({
    required this.entries,
    required this.fallbackResults,
  });

  final List<SceneResultEntry> entries;
  final List<SceneBeatResult> fallbackResults;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty && fallbackResults.isEmpty) {
      return const SizedBox.shrink();
    }
    return InfoCard(
      title: 'Recent Developments',
      child: ExpansionTile(
        initiallyExpanded: false,
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        title: Text(
            '${entries.length + fallbackResults.length} earlier update(s)'),
        children: [
          if (entries.isNotEmpty) _PreviousSceneResults(entries: entries),
          if (fallbackResults.isNotEmpty)
            _PreviousBeatResults(results: fallbackResults),
        ],
      ),
    );
  }
}

class _AvailableDialoguesCard extends StatelessWidget {
  const _AvailableDialoguesCard({
    required this.entries,
    required this.onStartConversation,
    this.activeDialogue,
    this.submittingDialogueSceneId,
  });

  final List<SceneReferenceEntry> entries;
  final ActiveDialogueSummary? activeDialogue;
  final String? submittingDialogueSceneId;
  final Future<void> Function(SceneReferenceEntry entry) onStartConversation;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const SizedBox.shrink();
    }

    final colorScheme = Theme.of(context).colorScheme;
    return InfoCard(
      title: 'Conversations',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Talk to someone here as your committed beat action. Once that beat resolves, the conversation opens with questions, social moves, and free exits. If you just exited this conversation, you can reenter it during the same beat without spending another action.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  height: 1.4,
                  color: colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in entries)
                if (entry.dialogueSceneId?.trim().isNotEmpty == true)
                  FilledButton.icon(
                    key: Key('conversation_entry_${entry.dialogueSceneId}'),
                    onPressed: submittingDialogueSceneId == null
                        ? () => onStartConversation(entry)
                        : null,
                    icon: submittingDialogueSceneId == entry.dialogueSceneId
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.forum_outlined),
                    label: Text(
                      _conversationButtonLabel(entry, activeDialogue),
                    ),
                  ),
            ],
          ),
        ],
      ),
    );
  }
}

String _conversationButtonLabel(
  SceneReferenceEntry entry,
  ActiveDialogueSummary? activeDialogue,
) {
  final dialogueSceneId = entry.dialogueSceneId?.trim();
  if (dialogueSceneId != null &&
      dialogueSceneId.isNotEmpty &&
      activeDialogue?.dialogueSceneId == dialogueSceneId) {
    if (activeDialogue?.isActive == true) {
      return 'Return to ${entry.label}';
    }
    if (activeDialogue?.isExited == true &&
        activeDialogue?.sameBeatReentryAvailable == true) {
      return 'Reenter ${entry.label}';
    }
  }
  return 'Talk with ${entry.label}';
}

class _SceneReferenceSection extends StatefulWidget {
  const _SceneReferenceSection({
    required this.dashboardApi,
    required this.sceneView,
    required this.reference,
    required this.fallbackNpcs,
    required this.fallbackAffordances,
    required this.onSceneChanged,
    required this.onStartConversation,
  });

  final PlayerDashboardApi dashboardApi;
  final CurrentSceneView sceneView;
  final SceneReference? reference;
  final List<SceneNpc> fallbackNpcs;
  final List<SceneAffordance> fallbackAffordances;
  final VoidCallback onSceneChanged;
  final Future<void> Function(SceneReferenceEntry entry) onStartConversation;

  @override
  State<_SceneReferenceSection> createState() => _SceneReferenceSectionState();
}

class _SceneReferenceSectionState extends State<_SceneReferenceSection> {
  final Set<String> _resolvingLooks = {};
  final Map<String, FreeFocusResult> _localResults = {};

  List<SceneReferenceEntry> get _people {
    final fromReference = widget.reference?.peopleNearby ?? const [];
    if (fromReference.isNotEmpty) {
      return fromReference;
    }
    return widget.fallbackNpcs
        .map(
          (npc) => SceneReferenceEntry(
            id: 'npc:${npc.npcId}',
            type: 'npc',
            label: npc.displayName,
            description: npc.activityText ?? npc.activity,
            dialogueSceneId: npc.dialogueSceneId,
            dialogueTitle: npc.dialogueTitle,
          ),
        )
        .toList();
  }

  List<SceneReferenceEntry> get _things {
    final fromReference = widget.reference?.notableThings ?? const [];
    if (fromReference.isNotEmpty) {
      return fromReference;
    }
    return widget.fallbackAffordances
        .where((affordance) =>
            affordance.type != 'npc' && affordance.type != 'place')
        .map(
          (affordance) => SceneReferenceEntry(
            id: affordance.affordanceId,
            type: affordance.type,
            label: affordance.label,
            description: affordance.description,
            dialogueSceneId: affordance.dialogueSceneId,
            dialogueTitle: affordance.dialogueTitle,
          ),
        )
        .toList();
  }

  List<SceneReferenceEntry> get _paths {
    final fromReference = widget.reference?.visiblePaths ?? const [];
    if (fromReference.isNotEmpty) {
      return fromReference;
    }
    return widget.fallbackAffordances
        .where((affordance) => affordance.type == 'place')
        .map(
          (affordance) => SceneReferenceEntry(
            id: affordance.affordanceId,
            type: affordance.type,
            label: affordance.label,
            description: affordance.description,
            dialogueSceneId: affordance.dialogueSceneId,
            dialogueTitle: affordance.dialogueTitle,
          ),
        )
        .toList();
  }

  List<SceneReferenceEntry> get _targets {
    final fromReference = widget.reference?.actionTargets ?? const [];
    if (fromReference.isNotEmpty) {
      return fromReference;
    }
    return [..._people, ..._things, ..._paths];
  }

  List<SceneReferenceCloserLook> get _closerLooks =>
      widget.reference?.closerLooks ?? const [];

  Future<void> _resolveCloserLook(SceneReferenceCloserLook look) async {
    if (_resolvingLooks.contains(look.interactionId) ||
        look.isViewed ||
        !look.isAvailable) {
      return;
    }
    setState(() {
      _resolvingLooks.add(look.interactionId);
    });

    try {
      final response = await widget.dashboardApi.resolveFreeFocus(
        interactionId: look.interactionId,
        sceneId: widget.sceneView.scene?.sceneId,
      );
      if (mounted) {
        setState(() {
          _localResults[look.interactionId] = response.result;
        });
        if (response.result.hasNewInformation) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('New scene detail recorded.')),
          );
        }
        if (response.fullSceneNarrationRecomposed) {
          widget.onSceneChanged();
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
          const SnackBar(content: Text('Could not resolve that closer look.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _resolvingLooks.remove(look.interactionId);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _people.length +
        _things.length +
        _paths.length +
        _targets.length +
        _closerLooks.length;
    if (total == 0) {
      return const SizedBox.shrink();
    }
    return InfoCard(
      title: 'Scene Reference',
      child: ExpansionTile(
        initiallyExpanded: false,
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        title: const Text(
            'People, notable things, paths, action targets, and closer looks'),
        children: [
          _CloserLooksList(
            looks: _closerLooks,
            resolvingLooks: _resolvingLooks,
            localResults: _localResults,
            onResolve: _resolveCloserLook,
          ),
          _ReferenceList(
            title: 'People nearby',
            entries: _people,
            onStartConversation: widget.onStartConversation,
          ),
          _ReferenceList(
            title: 'Notable things',
            entries: _things,
            onStartConversation: widget.onStartConversation,
            showDialogueActions: false,
          ),
          _ReferenceList(
            title: 'Visible paths',
            entries: _paths,
            onStartConversation: widget.onStartConversation,
            showDialogueActions: false,
          ),
          _ReferenceList(
            title: 'Action targets',
            entries: _targets,
            onStartConversation: widget.onStartConversation,
            showDialogueActions: false,
          ),
        ],
      ),
    );
  }
}

class _CloserLooksList extends StatelessWidget {
  const _CloserLooksList({
    required this.looks,
    required this.resolvingLooks,
    required this.localResults,
    required this.onResolve,
  });

  final List<SceneReferenceCloserLook> looks;
  final Set<String> resolvingLooks;
  final Map<String, FreeFocusResult> localResults;
  final Future<void> Function(SceneReferenceCloserLook look) onResolve;

  @override
  Widget build(BuildContext context) {
    if (looks.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Closer Looks', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 6),
          for (final look in looks)
            _CloserLookTile(
              look: look,
              resolving: resolvingLooks.contains(look.interactionId),
              localResult: localResults[look.interactionId],
              onResolve: () => onResolve(look),
            ),
        ],
      ),
    );
  }
}

class _CloserLookTile extends StatelessWidget {
  const _CloserLookTile({
    required this.look,
    required this.resolving,
    required this.onResolve,
    this.localResult,
  });

  final SceneReferenceCloserLook look;
  final bool resolving;
  final FreeFocusResult? localResult;
  final Future<void> Function() onResolve;

  @override
  Widget build(BuildContext context) {
    final result = localResult ?? look.result;
    final statusText = look.isExpired
        ? 'expired'
        : look.isStale
            ? 'changed'
            : (look.isViewed || result != null)
                ? 'viewed'
                : 'new';
    final title = '${look.label} · $statusText';
    final unavailable = !look.isAvailable && result == null;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ExpansionTile(
        enabled: !unavailable,
        onExpansionChanged: (expanded) {
          if (expanded && result == null && look.isAvailable) {
            onResolve();
          }
        },
        title: Text(title),
        subtitle: unavailable
            ? Text(look.unavailableReason ??
                'Available before committing your action.')
            : look.checkPreview?.hasCheck == true &&
                    look.checkPreview?.label != null
                ? Text(look.checkPreview!.label!)
                : null,
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          if (resolving)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: LinearProgressIndicator(),
            )
          else if (result != null) ...[
            if (result.mechanicsLabel != null) ...[
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  result.mechanicsLabel!,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
              const SizedBox(height: 6),
            ],
            Align(
              alignment: Alignment.centerLeft,
              child: Text(result.narration ??
                  result.summary ??
                  'Nothing more stands out right now.'),
            ),
          ] else
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Open this closer look to resolve it now.'),
            ),
        ],
      ),
    );
  }
}

class _ReferenceList extends StatelessWidget {
  const _ReferenceList({
    required this.title,
    required this.entries,
    required this.onStartConversation,
    this.showDialogueActions = true,
  });

  final String title;
  final List<SceneReferenceEntry> entries;
  final Future<void> Function(SceneReferenceEntry entry) onStartConversation;
  final bool showDialogueActions;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 6),
          for (final entry in entries)
            _ReferenceEntryRow(
              entry: entry,
              onStartConversation: onStartConversation,
              showDialogueAction: showDialogueActions,
            ),
        ],
      ),
    );
  }
}

class _ReferenceEntryRow extends StatelessWidget {
  const _ReferenceEntryRow({
    required this.entry,
    required this.onStartConversation,
    required this.showDialogueAction,
  });

  final SceneReferenceEntry entry;
  final Future<void> Function(SceneReferenceEntry entry) onStartConversation;
  final bool showDialogueAction;

  @override
  Widget build(BuildContext context) {
    final text = entry.description == null || entry.description!.trim().isEmpty
        ? entry.label
        : '${entry.label} - ${entry.description}';
    final dialogueSceneId = entry.dialogueSceneId?.trim();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 4,
        children: [
          _BulletText(text),
          if (showDialogueAction &&
              _sceneReferenceEntryLooksPerson(entry) &&
              dialogueSceneId != null &&
              dialogueSceneId.isNotEmpty)
            TextButton.icon(
              key: Key('dialogue_entry_$dialogueSceneId'),
              onPressed: () => onStartConversation(entry),
              icon: const Icon(Icons.forum_outlined, size: 18),
              label: const Text('Talk'),
            ),
        ],
      ),
    );
  }
}

class _ActionComposer extends StatefulWidget {
  const _ActionComposer({
    required this.dashboardApi,
    required this.sceneView,
    required this.onSceneChanged,
  });

  final PlayerDashboardApi dashboardApi;
  final CurrentSceneView sceneView;
  final VoidCallback onSceneChanged;

  @override
  State<_ActionComposer> createState() => _ActionComposerState();
}

class _ActionComposerState extends State<_ActionComposer> {
  late final TextEditingController _controller;
  SceneAffordance? _selectedAffordance;
  String? _selectedTargetId;
  String? _selectedTargetLabel;
  String? _selectedVerb;
  String? _continueFreeFocusInteractionId;
  ActionPreviewResponse? _preview;
  String? _error;
  bool _draftStale = false;
  bool _editing = false;
  bool _previewing = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final submitted = widget.sceneView.actionStatus.submittedActionDetails;
    _controller = TextEditingController(text: submitted?.text ?? '');
    _selectedAffordance = _matchingAffordance(
      submitted?.targetAffordanceId,
    );
    _selectedTargetId = submitted?.targetAffordanceId;
    _selectedTargetLabel = submitted?.targetLabel ?? _selectedAffordance?.label;
    _selectedVerb = submitted?.verb;
  }

  @override
  void didUpdateWidget(covariant _ActionComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    final targetStillVisible = _selectedTargetId == null ||
        _targetChips.any((chip) => chip.id == _selectedTargetId);
    if (!targetStillVisible) {
      setState(() {
        _selectedAffordance = null;
        _selectedTargetId = null;
        _selectedTargetLabel = null;
        _continueFreeFocusInteractionId = null;
        _preview = null;
        _error = null;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  SceneAffordance? _matchingAffordance(String? affordanceId) {
    if (affordanceId == null) {
      return null;
    }
    for (final affordance in widget.sceneView.visibleAffordances) {
      if (affordance.affordanceId == affordanceId) {
        return affordance;
      }
    }
    return null;
  }

  bool get _canPreview {
    return !_previewing &&
        !_submitting &&
        (_controller.text.trim().isNotEmpty || _selectedTargetId != null);
  }

  Future<void> _previewAction() async {
    if (!_canPreview) {
      return;
    }
    setState(() {
      _previewing = true;
      _error = null;
      _preview = null;
    });
    try {
      final preview = await widget.dashboardApi.previewAction(
        rawText: _controller.text,
        selectedVerb: _selectedVerb,
        selectedAffordanceId: _selectedTargetId,
        continueFreeFocusInteractionId: _continueFreeFocusInteractionId,
      );
      if (mounted) {
        setState(() {
          _preview = preview;
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
        setState(() {
          _error = 'Could not preview that action right now.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _previewing = false;
        });
      }
    }
  }

  Future<void> _chooseOption(ActionClarificationOption option) async {
    setState(() {
      _selectedAffordance = _matchingAffordance(option.targetAffordanceId);
      _selectedTargetId = option.targetAffordanceId;
      _selectedTargetLabel = option.label;
      _selectedVerb = option.verb;
      _continueFreeFocusInteractionId = null;
      _preview = null;
      _error = null;
    });
    await _previewAction();
  }

  Future<void> _submitAction() async {
    final preview = _preview;
    if (preview == null || !preview.isResolved || _submitting) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.dashboardApi.submitAction(
        rawText: _controller.text,
        selectedVerb: _selectedVerb,
        selectedAffordanceId: _selectedTargetId,
        continueFreeFocusInteractionId: _continueFreeFocusInteractionId,
        actionWindowId: preview.actionWindowId,
        lifecycleContext: preview.lifecycleContext,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text(_editing ? 'Action updated.' : 'Action submitted.')),
        );
        widget.onSceneChanged();
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
        setState(() {
          _error = 'Could not submit that action right now.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  void _beginEdit() {
    final submitted = widget.sceneView.actionStatus.submittedActionDetails;
    setState(() {
      _editing = true;
      _controller.text = submitted?.text ??
          widget.sceneView.actionStatus.submittedAction ??
          '';
      _selectedAffordance = _matchingAffordance(submitted?.targetAffordanceId);
      _selectedTargetId = submitted?.targetAffordanceId;
      _selectedTargetLabel =
          submitted?.targetLabel ?? _selectedAffordance?.label;
      _selectedVerb = submitted?.verb;
      _continueFreeFocusInteractionId = null;
      _preview = null;
      _error = null;
    });
  }

  Future<void> _openCloserLookFromPreview() async {
    final overlap = _preview?.freeFocusOverlap;
    if (overlap == null) {
      return;
    }
    setState(() {
      _previewing = true;
      _error = null;
    });
    try {
      final response = await widget.dashboardApi.resolveFreeFocus(
        interactionId: overlap.interactionId,
        sceneId: widget.sceneView.scene?.sceneId,
      );
      if (mounted) {
        setState(() {
          _preview = null;
          _draftStale = response.result.hasNewInformation;
          _continueFreeFocusInteractionId = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response.result.hasNewInformation
                ? 'Closer look resolved. Review your draft with the new detail.'
                : 'Closer look resolved.'),
          ),
        );
        widget.onSceneChanged();
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
        setState(() {
          _error = 'Could not open that closer look right now.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _previewing = false;
        });
      }
    }
  }

  Future<void> _continueOverlapAsBeatAction() async {
    final overlap = _preview?.freeFocusOverlap;
    if (overlap == null) {
      return;
    }
    setState(() {
      _continueFreeFocusInteractionId = overlap.interactionId;
      _preview = null;
      _error = null;
    });
    await _previewAction();
  }

  List<ActionTargetChip> get _targetChips {
    final backendChips =
        widget.sceneView.actionComposer?.targetChips ?? const [];
    if (backendChips.isNotEmpty) {
      return backendChips;
    }
    return widget.sceneView.visibleAffordances
        .where((affordance) => affordance.label.trim().isNotEmpty)
        .map(
          (affordance) => ActionTargetChip(
            id: affordance.affordanceId,
            type: affordance.type,
            label: affordance.label,
            insertText: affordance.label,
          ),
        )
        .toList();
  }

  void _selectTarget(ActionTargetChip chip) {
    setState(() {
      _selectedTargetId = chip.id;
      _selectedTargetLabel = chip.label;
      _selectedAffordance = _matchingAffordance(chip.id);
      _continueFreeFocusInteractionId = null;
      if (_controller.text.trim().isEmpty) {
        _controller.text = 'I focus on ${chip.insertText}';
        _controller.selection = TextSelection.fromPosition(
          TextPosition(offset: _controller.text.length),
        );
      }
      _selectedVerb = null;
      _preview = null;
      _error = null;
    });
  }

  void _clearSelectedTarget() {
    setState(() {
      _selectedTargetId = null;
      _selectedTargetLabel = null;
      _selectedAffordance = null;
      _selectedVerb = null;
      _preview = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.sceneView.actionStatus;
    final submitted = status.submittedActionDetails;
    final canCompose =
        status.state == 'action_needed' || (_editing && status.canEdit);

    if (status.state == 'action_submitted' && !_editing) {
      return InfoCard(
        title: 'Submitted Action',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(submitted?.text ??
                status.submittedAction ??
                'An action has been submitted.'),
            if (submitted?.summary != null &&
                submitted!.summary != submitted.text) ...[
              const SizedBox(height: 8),
              Text('Interpreted as: ${submitted.summary}'),
            ],
            const SizedBox(height: 12),
            if (status.canEdit)
              FilledButton.icon(
                onPressed: _beginEdit,
                icon: const Icon(Icons.edit_note),
                label: const Text('Edit Action'),
              )
            else
              const Text('This action is locked for the current beat.'),
          ],
        ),
      );
    }

    if (!canCompose) {
      return InfoCard(
        title: 'Action Composer',
        child: Text(status.description.isEmpty
            ? 'No action can be submitted right now.'
            : status.description),
      );
    }

    final targetChips = _targetChips;

    return InfoCard(
      title: _editing
          ? 'Edit Action'
          : 'What does ${widget.sceneView.activeCharacter?.name ?? 'your character'} do?',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
              'Describe one clear action for this beat. You will preview it before submitting.'),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            minLines: 2,
            maxLines: 5,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: 'Natural action',
              hintText: 'I ask the shaken woman what happened to the caravan.',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) {
              setState(() {
                _preview = null;
                _error = null;
                _continueFreeFocusInteractionId = null;
                _draftStale = false;
              });
            },
          ),
          if (_draftStale) ...[
            const SizedBox(height: 8),
            Text(
              'New scene detail revealed since this draft was written. Review your action before submitting.',
              style: TextStyle(color: Theme.of(context).colorScheme.primary),
            ),
          ],
          const SizedBox(height: 8),
          if (targetChips.isNotEmpty) ...[
            Text('Optional focus',
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final chip in targetChips)
                  ChoiceChip(
                    label: Text(chip.freeFocusState == 'current_viewed'
                        ? '${chip.label} · viewed'
                        : chip.label),
                    selected: chip.id == _selectedTargetId,
                    onSelected: (_) => _selectTarget(chip),
                  ),
                if (_selectedTargetId != null)
                  InputChip(
                    label: Text('Clear ${_selectedTargetLabel ?? 'target'}'),
                    onDeleted: _clearSelectedTarget,
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: _canPreview ? _previewAction : null,
                icon: _previewing
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.manage_search),
                label: const Text('Preview Action'),
              ),
              if (_editing)
                TextButton(
                  onPressed: () {
                    setState(() {
                      _editing = false;
                      _preview = null;
                      _error = null;
                    });
                  },
                  child: const Text('Cancel Edit'),
                ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          if (_preview != null) ...[
            const SizedBox(height: 16),
            _ActionPreviewPanel(
              preview: _preview!,
              onChoose: _chooseOption,
              onOpenCloserLook: _openCloserLookFromPreview,
              onContinueAsBeatAction: _continueOverlapAsBeatAction,
              onSubmit:
                  _preview!.isResolved && !_submitting ? _submitAction : null,
              submitting: _submitting,
              onRevise: () {
                setState(() {
                  _preview = null;
                });
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _ActionPreviewPanel extends StatelessWidget {
  const _ActionPreviewPanel({
    required this.preview,
    required this.onChoose,
    required this.onOpenCloserLook,
    required this.onContinueAsBeatAction,
    required this.onSubmit,
    required this.submitting,
    required this.onRevise,
  });

  final ActionPreviewResponse preview;
  final Future<void> Function(ActionClarificationOption option) onChoose;
  final Future<void> Function() onOpenCloserLook;
  final Future<void> Function() onContinueAsBeatAction;
  final VoidCallback? onSubmit;
  final bool submitting;
  final VoidCallback onRevise;

  @override
  Widget build(BuildContext context) {
    final choices = preview.status == 'multi_action_clarification'
        ? preview.detectedActions
        : preview.options;
    return Container(
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
          if (preview.hasFreeFocusOverlap) ...[
            Text(preview.freeFocusOverlap!.message),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: onOpenCloserLook,
                  icon: const Icon(Icons.visibility),
                  label: const Text('Open Closer Look'),
                ),
                OutlinedButton(
                  onPressed: onContinueAsBeatAction,
                  child: const Text('Continue as Beat Action'),
                ),
                TextButton(
                    onPressed: onRevise, child: const Text('Edit Action')),
              ],
            ),
          ] else if (preview.isResolved && preview.candidate != null) ...[
            Text('Interpreted as: ${preview.candidate!.label}'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: onSubmit,
                  icon: submitting
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(submitting ? 'Submitting...' : 'Submit Action'),
                ),
                OutlinedButton(
                    onPressed: onRevise, child: const Text('Revise')),
              ],
            ),
          ] else ...[
            Text(preview.message ??
                'That action needs a little more direction.'),
            if (choices.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final option in choices)
                    OutlinedButton(
                      onPressed: () => onChoose(option),
                      child: Text(option.label),
                    ),
                ],
              ),
            ],
            if (preview.suggestions.isNotEmpty) ...[
              const SizedBox(height: 10),
              for (final suggestion in preview.suggestions)
                _BulletText(suggestion),
            ],
            const SizedBox(height: 10),
            OutlinedButton(onPressed: onRevise, child: const Text('Revise')),
          ],
        ],
      ),
    );
  }
}

class _SceneHeader extends StatelessWidget {
  const _SceneHeader({required this.sceneView});

  final CurrentSceneView sceneView;

  @override
  Widget build(BuildContext context) {
    final scene = sceneView.scene;
    final campaign = sceneView.campaign;
    final character = sceneView.activeCharacter;
    return InfoCard(
      title: sceneView.sceneNarration?.title ?? scene?.title ?? 'Current Scene',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            [
              if (campaign?.campaignName != null) campaign!.campaignName,
              campaign?.worldName ?? campaign?.worldId,
              scene?.locationName,
            ].whereType<String>().join(' · '),
          ),
          if (character != null) ...[
            const SizedBox(height: 8),
            Text(
              'Seen by ${character.name}${character.characterClass == null ? '' : ' the ${character.characterClass}'}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ],
      ),
    );
  }
}

class _MechanicalDetails extends StatelessWidget {
  const _MechanicalDetails({required this.details});

  final SceneMechanicalDetails? details;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        title: const Text('Mechanical Details'),
        subtitle: const Text('Safe rules context, hidden by default.'),
        childrenPadding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        children: [
          if (details == null)
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('No mechanical details are currently visible.'),
            )
          else ...[
            Align(
              alignment: Alignment.centerLeft,
              child: Text('Environment effects',
                  style: Theme.of(context).textTheme.titleMedium),
            ),
            const SizedBox(height: 8),
            if (details!.environmentModifiers.isEmpty)
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('No explicit environment modifiers apply.'),
              )
            else
              for (final effect in details!.environmentModifiers)
                _BulletText([
                  effect.mechanical,
                  effect.reason,
                  effect.narrativeHint,
                ].whereType<String>().join(' — ')),
            if (details!.actionWindow != null) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Action window: ${_humanize(details!.actionWindow!['status']?.toString() ?? 'available')}',
                ),
              ),
            ],
            if (details!.safeCharacterContext.isNotEmpty) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  [
                    if (details!.safeCharacterContext['level'] != null)
                      'Level ${details!.safeCharacterContext['level']}',
                    if (details!.safeCharacterContext['class'] != null)
                      details!.safeCharacterContext['class'].toString(),
                  ].join(' · '),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _BulletText extends StatelessWidget {
  const _BulletText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('• '),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _SceneError extends StatelessWidget {
  const _SceneError({
    required this.message,
    required this.onRetry,
    this.onCampaignOverview,
    this.onDashboard,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback? onCampaignOverview;
  final VoidCallback? onDashboard;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: 'Could not load scene',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton(
                    onPressed: onRetry, child: const Text('Try again')),
                if (onCampaignOverview != null)
                  OutlinedButton(
                    onPressed: onCampaignOverview,
                    child: const Text('Campaign Overview'),
                  ),
                if (onDashboard != null)
                  TextButton(
                    onPressed: onDashboard,
                    child: const Text('Dashboard'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _humanize(String value) {
  final words = value.replaceAll('_', ' ').replaceAll('-', ' ').split(' ');
  return words
      .where((word) => word.trim().isNotEmpty)
      .map((word) => word[0].toUpperCase() + word.substring(1))
      .join(' ');
}

String lowerFirst(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return trimmed;
  }
  return trimmed[0].toLowerCase() + trimmed.substring(1);
}

List<SceneBeatResult> _sceneBeatResults(SceneRecentSummary? recentSummary) {
  if (recentSummary == null) {
    return const [];
  }

  if (recentSummary.results.isNotEmpty) {
    return recentSummary.results
        .where((result) => result.text.trim().isNotEmpty)
        .toList();
  }

  final latestBeat = recentSummary.latestBeat?.trim();
  if (latestBeat == null || latestBeat.isEmpty) {
    return const [];
  }

  return [SceneBeatResult(text: latestBeat)];
}

Color? _diagnosticStatusColor(BuildContext context, String? status) {
  final colorScheme = Theme.of(context).colorScheme;
  return switch (status) {
    'ok' => colorScheme.primaryContainer,
    'warning' => colorScheme.tertiaryContainer,
    'error' => colorScheme.errorContainer,
    _ => null,
  };
}
