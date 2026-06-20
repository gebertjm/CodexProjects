import 'package:flutter/material.dart';

import '../shared/widgets/app_scaffold.dart';
import 'combat_controller.dart';
import 'combat_models.dart';
import 'combat_repository.dart';

class CombatScreen extends StatefulWidget {
  const CombatScreen({
    required this.repository,
    required this.onBack,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final CombatRepository repository;
  final VoidCallback onBack;
  final Future<void> Function() onSignOut;
  final ValueChanged<String> navigate;

  @override
  State<CombatScreen> createState() => _CombatScreenState();
}

class _CombatScreenState extends State<CombatScreen> {
  late final CombatController _controller;

  @override
  void initState() {
    super.initState();
    _controller = CombatController(repository: widget.repository)..load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Combat',
      actions: [
        IconButton(
          tooltip: 'Refresh combat',
          onPressed: () => _controller.refresh(),
          icon: const Icon(Icons.refresh),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign'),
          child: const Text('Campaign'),
        ),
        TextButton(
          onPressed: () => widget.onSignOut(),
          child: const Text('Sign out'),
        ),
      ],
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final view = _controller.view;
          if (view == null && _controller.loading) {
            return const _CombatLoadingState();
          }
          if (view == null) {
            return _CombatUnavailableState(
              message: _controller.errorMessage ??
                  'Combat is not available for this character right now.',
              onRetry: _controller.refresh,
              onBack: widget.onBack,
            );
          }
          return CombatScreenBody(
            controller: _controller,
            view: view,
            onBack: widget.onBack,
          );
        },
      ),
    );
  }
}

class CombatScreenBody extends StatelessWidget {
  const CombatScreenBody({
    required this.controller,
    required this.view,
    required this.onBack,
    super.key,
  });

  final CombatController controller;
  final CombatView view;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final panels = <Widget>[
      _CombatOverviewCard(view: view),
      if (controller.errorMessage?.isNotEmpty == true)
        _InlineAlert(message: controller.errorMessage!),
      if (view.recovery != null)
        _RecoveryPanel(controller: controller, view: view),
      if (view.isReaction) _ReactionPanel(controller: controller, view: view),
      if (view.isAutomatic)
        _AutomaticPlaybackPanel(controller: controller, view: view),
      if (view.isResolution)
        _EncounterResolutionPanel(controller: controller, view: view),
      if (!view.isRecovery) _LatestCombatResultCard(view: view),
      _InitiativeCard(view: view),
      _ResourcesAndPositionCard(view: view),
      _ParticipantsCard(view: view),
      if (view.canUseOrdinaryControls)
        _DecisionPanel(controller: controller, view: view),
      if (view.canUseOrdinaryControls)
        _EndTurnPanel(controller: controller, view: view),
      if (view.focus?.isPresent == true)
        _CombatFocusPanel(controller: controller, focus: view.focus!),
      _CombatLogPanel(view: view),
      OutlinedButton.icon(
        onPressed: onBack,
        icon: const Icon(Icons.arrow_back),
        label: const Text('Back to Campaign'),
      ),
    ];

    return RefreshIndicator(
      onRefresh: controller.refresh,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final panel in panels) ...[
              panel,
              const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }
}

class _CombatLoadingState extends StatelessWidget {
  const _CombatLoadingState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Loading the current combat state...'),
        ],
      ),
    );
  }
}

class _CombatUnavailableState extends StatelessWidget {
  const _CombatUnavailableState({
    required this.message,
    required this.onRetry,
    required this.onBack,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Combat unavailable',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_safe(message, 'Combat is not available right now.')),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(onPressed: onRetry, child: const Text('Try again')),
              OutlinedButton(
                onPressed: onBack,
                child: const Text('Back to Campaign'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CombatOverviewCard extends StatelessWidget {
  const _CombatOverviewCard({required this.view});

  final CombatView view;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      label: 'Combat overview',
      child: InfoCard(
        title: _safe(view.encounterTitle, 'Combat Encounter'),
        action: Chip(label: Text(_statusLabel(view.combatStatus))),
        child: LayoutBuilder(
          builder: (context, constraints) {
            return Wrap(
              spacing: 20,
              runSpacing: 12,
              children: [
                _FactPill(label: 'Round', value: view.round.toString()),
                if (view.currentActor != null)
                  _FactPill(
                    label: 'Current turn',
                    value: _safe(view.currentActor!.displayName, 'Unknown'),
                  ),
                if (_safe(view.currentZone).isNotEmpty)
                  _FactPill(label: 'Position', value: _safe(view.currentZone)),
                if (_safe(view.nextStep).isNotEmpty)
                  SizedBox(
                    width: constraints.maxWidth > 720
                        ? constraints.maxWidth * 0.45
                        : constraints.maxWidth,
                    child: Text(
                      _safe(view.nextStep),
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InlineAlert extends StatelessWidget {
  const _InlineAlert({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Card(
      color: colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          _safe(message, 'Something changed. Refresh combat and try again.'),
          style: TextStyle(color: colorScheme.onErrorContainer),
        ),
      ),
    );
  }
}

class _LatestCombatResultCard extends StatelessWidget {
  const _LatestCombatResultCard({required this.view});

  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final result = view.latestResult;
    final latestEvent =
        view.latestEvents.isNotEmpty ? view.latestEvents.first : null;
    if (result == null && latestEvent == null) {
      return const InfoCard(
        title: 'Latest Result',
        child: Text('No combat result has resolved yet.'),
      );
    }
    return InfoCard(
      title: 'Latest Result',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (result != null) ...[
            Text(
              _safe(result.title, 'Combat result'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(_safe(result.summary, 'Combat result recorded.')),
            _TextList(title: 'Consequences', values: result.consequences),
            _TextList(title: 'Progress', values: result.progress),
            _TextList(title: 'Visible Rolls', values: result.visibleRolls),
          ] else if (latestEvent != null)
            Text(_safe(latestEvent.summary, 'Combat event recorded.')),
        ],
      ),
    );
  }
}

class _InitiativeCard extends StatelessWidget {
  const _InitiativeCard({required this.view});

  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final entries = view.initiative;
    return InfoCard(
      title: 'Initiative',
      child: entries.isEmpty
          ? const Text('Initiative order is not visible yet.')
          : Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in entries)
                  Chip(
                    avatar: entry.current ? const Icon(Icons.play_arrow) : null,
                    label: Text(_safe(entry.displayName, 'Participant')),
                  ),
              ],
            ),
    );
  }
}

class _ResourcesAndPositionCard extends StatelessWidget {
  const _ResourcesAndPositionCard({required this.view});

  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final movement = view.movement;
    return InfoCard(
      title: 'Resources and Position',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (movement != null)
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                _FactPill(
                    label: 'Movement left', value: '${movement.remaining} ft'),
                _FactPill(
                    label: 'Movement spent', value: '${movement.spent} ft'),
                if (movement.dashAdded > 0)
                  _FactPill(
                      label: 'Dash added', value: '${movement.dashAdded} ft'),
              ],
            )
          else
            const Text('Movement details are not visible yet.'),
          const SizedBox(height: 12),
          if (view.resources.isEmpty)
            const Text('No visible limited resources are active.')
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final resource in view.resources)
                  Chip(
                    label: Text([
                      _safe(resource.label, 'Resource'),
                      _safe(resource.valueLabel),
                    ].where((entry) => entry.isNotEmpty).join(': ')),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _ParticipantsCard extends StatelessWidget {
  const _ParticipantsCard({required this.view});

  final CombatView view;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Combatants',
      child: view.participants.isEmpty
          ? const Text('No visible combatants are currently shown.')
          : Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final participant in view.participants)
                  ConstrainedBox(
                    constraints:
                        const BoxConstraints(minWidth: 220, maxWidth: 320),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _safe(participant.displayName, 'Participant'),
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            if (participant.isPlayer &&
                                participant.hitPoints != null)
                              Text(participant.hitPoints!.label)
                            else
                              Text(_safe(participant.stateLabel, 'visible')),
                            if (_safe(participant.zone).isNotEmpty)
                              Text('Zone: ${_safe(participant.zone)}'),
                            if (_safe(participant.cover).isNotEmpty)
                              Text('Cover: ${_safe(participant.cover)}'),
                            if (participant.conditions.isNotEmpty)
                              Text(
                                'Conditions: ${participant.conditions.map(_safe).where((entry) => entry.isNotEmpty).join(', ')}',
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _DecisionPanel extends StatefulWidget {
  const _DecisionPanel({
    required this.controller,
    required this.view,
  });

  final CombatController controller;
  final CombatView view;

  @override
  State<_DecisionPanel> createState() => _DecisionPanelState();
}

class _DecisionPanelState extends State<_DecisionPanel> {
  CombatActionOption? _selectedAction;
  CombatMovementDestination? _selectedDestination;
  final Set<String> _selectedTargetIds = {};
  bool _confirmAllyRisk = false;
  bool _nonlethalIntent = false;

  @override
  void didUpdateWidget(covariant _DecisionPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.controller.selectedIntent == null) {
      _selectedAction = null;
      _selectedDestination = null;
      _selectedTargetIds.clear();
      _confirmAllyRisk = false;
      _nonlethalIntent = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final view = widget.view;
    return Semantics(
      label: 'Combat decisions',
      child: InfoCard(
        title: 'Choose Your Combat Decision',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DecisionCategoryChips(categories: view.decisionCategories),
            const SizedBox(height: 16),
            if (view.movementDestinations.isNotEmpty) ...[
              Text('Move', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final destination in view.movementDestinations)
                    ChoiceChip(
                      label: Text(_safe(destination.label, 'Move')),
                      selected: _selectedDestination?.destinationZoneId ==
                          destination.destinationZoneId,
                      onSelected: (_) => _selectDestination(destination),
                    ),
                ],
              ),
              const SizedBox(height: 16),
            ],
            if (view.availableActions.isNotEmpty) ...[
              Text('Actions', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final action in view.availableActions)
                    ChoiceChip(
                      label: Text(_safe(action.label, 'Action')),
                      selected: _selectedAction?.actionId == action.actionId,
                      onSelected: action.available
                          ? (_) => _selectAction(action)
                          : null,
                    ),
                ],
              ),
              if (_selectedAction != null) ...[
                const SizedBox(height: 12),
                _TargetPicker(
                  action: _selectedAction!,
                  selectedTargetIds: _selectedTargetIds,
                  onChanged: _selectTarget,
                ),
                if (_selectedAction!.requiresAllyConfirmation)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _confirmAllyRisk,
                    onChanged: (value) {
                      setState(() => _confirmAllyRisk = value ?? false);
                      _publishActionIntent();
                    },
                    title: const Text(
                        'I understand this may affect an ally or non-hostile target.'),
                  ),
                if (_selectedAction!.supportsNonlethalIntent)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _nonlethalIntent,
                    onChanged: (value) {
                      setState(() => _nonlethalIntent = value ?? false);
                      _publishActionIntent();
                    },
                    title: const Text(
                        'Use nonlethal intent if this resolves the target.'),
                  ),
              ],
              const SizedBox(height: 16),
            ],
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: _waitAvailable(view)
                      ? () => widget.controller.selectIntent(
                            const CombatOperationIntent(operationType: 'wait'),
                          )
                      : null,
                  icon: const Icon(Icons.hourglass_empty),
                  label: const Text('Wait'),
                ),
                OutlinedButton.icon(
                  onPressed: widget.controller.selectedIntent == null
                      ? null
                      : widget.controller.clearSelection,
                  icon: const Icon(Icons.close),
                  label: const Text('Clear'),
                ),
              ],
            ),
            if (widget.controller.selectedIntent != null) ...[
              const SizedBox(height: 16),
              _SelectedIntentSummary(intent: widget.controller.selectedIntent!),
              const SizedBox(height: 12),
              _PreviewSubmitControls(controller: widget.controller),
            ],
          ],
        ),
      ),
    );
  }

  void _selectDestination(CombatMovementDestination destination) {
    setState(() {
      _selectedDestination = destination;
      _selectedAction = null;
      _selectedTargetIds.clear();
    });
    widget.controller.selectIntent(CombatOperationIntent(
      operationType: 'movement',
      destinationZoneId: destination.destinationZoneId,
      selectedTransitionIds: [
        if (_safe(destination.transitionId).isNotEmpty)
          destination.transitionId!,
      ],
    ));
  }

  void _selectAction(CombatActionOption action) {
    setState(() {
      _selectedAction = action;
      _selectedDestination = null;
      _selectedTargetIds.clear();
      _confirmAllyRisk = false;
      _nonlethalIntent = false;
    });
    _publishActionIntent();
  }

  void _selectTarget(String targetId, bool selected) {
    final action = _selectedAction;
    if (action == null) return;
    setState(() {
      final maxTargets = action.maxTargets ?? 1;
      if (maxTargets <= 1) {
        _selectedTargetIds
          ..clear()
          ..add(targetId);
      } else if (selected) {
        _selectedTargetIds.add(targetId);
      } else {
        _selectedTargetIds.remove(targetId);
      }
    });
    _publishActionIntent();
  }

  void _publishActionIntent() {
    final action = _selectedAction;
    if (action == null) return;
    widget.controller.selectIntent(CombatOperationIntent(
      operationType: _operationForTiming(action.timingCategory),
      actionId: action.actionId,
      targetIds: _selectedTargetIds.toList(),
      confirmAllyRisk: _confirmAllyRisk,
      nonlethalIntent: _nonlethalIntent,
    ));
  }
}

class _TargetPicker extends StatelessWidget {
  const _TargetPicker({
    required this.action,
    required this.selectedTargetIds,
    required this.onChanged,
  });

  final CombatActionOption action;
  final Set<String> selectedTargetIds;
  final void Function(String targetId, bool selected) onChanged;

  @override
  Widget build(BuildContext context) {
    if (action.targetCandidates.isEmpty) {
      return const Text('This action does not need a target selection here.');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Targets', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final target in action.targetCandidates)
              FilterChip(
                label: Text(_safe(target.label, 'Target')),
                selected: selectedTargetIds.contains(target.targetId),
                onSelected: (selected) => onChanged(target.targetId, selected),
              ),
          ],
        ),
      ],
    );
  }
}

class _SelectedIntentSummary extends StatelessWidget {
  const _SelectedIntentSummary({required this.intent});

  final CombatOperationIntent intent;

  @override
  Widget build(BuildContext context) {
    final parts = [
      humanizeCombatText(intent.operationType),
      if (_safe(intent.actionId).isNotEmpty) _safe(intent.actionId),
      if (_safe(intent.destinationZoneId).isNotEmpty)
        'to ${_safe(intent.destinationZoneId)}',
      if (intent.targetIds.isNotEmpty)
        'targets ${intent.targetIds.map(_safe).join(', ')}',
    ].where((entry) => entry.isNotEmpty).join(' · ');
    return Text('Selected: $parts');
  }
}

class _PreviewSubmitControls extends StatelessWidget {
  const _PreviewSubmitControls({required this.controller});

  final CombatController controller;

  @override
  Widget build(BuildContext context) {
    final preview = controller.preview;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: controller.previewing || controller.submitting
                  ? null
                  : controller.previewSelected,
              icon: controller.previewing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.search),
              label: const Text('Preview'),
            ),
            FilledButton.icon(
              onPressed: controller.submitting || preview == null
                  ? null
                  : controller.submitSelected,
              icon: controller.submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check),
              label: const Text('Commit'),
            ),
          ],
        ),
        if (preview != null) ...[
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Preview: ${_safe(preview.operationName, humanizeCombatText(preview.operationCategory))}',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  if (_safe(preview.summary).isNotEmpty)
                    Text(_safe(preview.summary)),
                  _TextList(title: 'Costs', values: preview.costs),
                  _TextList(title: 'Risks', values: preview.risks),
                  if (preview.confirmation?.message?.isNotEmpty == true)
                    Text(_safe(preview.confirmation!.message)),
                  const SizedBox(height: 4),
                  const Text(
                      'Preview is not final. Commit resolves the choice.'),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _EndTurnPanel extends StatelessWidget {
  const _EndTurnPanel({
    required this.controller,
    required this.view,
  });

  final CombatController controller;
  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final confirmation = view.endTurnConfirmation;
    final available = _categoryAvailable(view, 'end_turn');
    return InfoCard(
      title: 'End Turn',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (confirmation?.required == true) ...[
            Text(_safe(
              confirmation!.message,
              'You still have meaningful options. End your turn anyway?',
            )),
            _TextList(
              title: 'Would forfeit',
              values: confirmation.meaningfulForfeitures,
            ),
            const SizedBox(height: 8),
          ] else
            const Text(
                'End your turn when you are finished with combat choices.'),
          FilledButton.icon(
            onPressed: available && !controller.submitting
                ? () => controller.submitEndTurn(
                      confirm: confirmation?.required == true,
                    )
                : null,
            icon: const Icon(Icons.flag),
            label: Text(confirmation?.required == true
                ? 'Confirm End Turn'
                : 'End Turn'),
          ),
        ],
      ),
    );
  }
}

class _ReactionPanel extends StatelessWidget {
  const _ReactionPanel({
    required this.controller,
    required this.view,
  });

  final CombatController controller;
  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final reaction = view.reaction;
    if (reaction == null) return const SizedBox.shrink();
    return Semantics(
      label: 'Reaction required',
      child: InfoCard(
        title: 'Reaction Required',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_safe(
              reaction.triggerSummary,
              'A combat event gives you a reaction choice.',
            )),
            if (_safe(reaction.timeoutBehavior).isNotEmpty)
              Text('If you do not respond: ${_safe(reaction.timeoutBehavior)}'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final option in reaction.options)
                  FilledButton(
                    onPressed: controller.submitting
                        ? null
                        : () => controller.submitReaction(option.reactionId),
                    child: Text(_safe(option.label, 'Use Reaction')),
                  ),
                OutlinedButton(
                  onPressed:
                      controller.submitting ? null : controller.declineReaction,
                  child: Text(_safe(reaction.declineLabel, 'Decline')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AutomaticPlaybackPanel extends StatelessWidget {
  const _AutomaticPlaybackPanel({
    required this.controller,
    required this.view,
  });

  final CombatController controller;
  final CombatView view;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Combat Is Resolving',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('The server is resolving automatic combat events.'),
          if (view.latestEvents.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final event in view.latestEvents.take(3))
              _BulletText(_safe(event.summary, 'Combat event recorded.')),
          ],
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed:
                controller.playbackSkipped ? null : controller.skipPlayback,
            icon: const Icon(Icons.fast_forward),
            label: Text(controller.playbackSkipped
                ? 'Playback skipped'
                : 'Skip animation'),
          ),
        ],
      ),
    );
  }
}

class _CombatFocusPanel extends StatefulWidget {
  const _CombatFocusPanel({
    required this.controller,
    required this.focus,
  });

  final CombatController controller;
  final CombatFocusState focus;

  @override
  State<_CombatFocusPanel> createState() => _CombatFocusPanelState();
}

class _CombatFocusPanelState extends State<_CombatFocusPanel> {
  final _textController = TextEditingController();

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Combat Focus',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_safe(widget.focus.currentAnswer).isNotEmpty)
            Text(_safe(widget.focus.currentAnswer)),
          if (widget.focus.suggestions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final suggestion in widget.focus.suggestions)
                  OutlinedButton(
                    onPressed: widget.controller.submitting
                        ? null
                        : () => widget.controller.askFocus(suggestion.label),
                    child: Text(_safe(suggestion.label, 'Ask')),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _textController,
            decoration: const InputDecoration(
              labelText: 'Ask what your character can tell from here',
              border: OutlineInputBorder(),
            ),
            minLines: 1,
            maxLines: 3,
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: widget.controller.submitting
                ? null
                : () => widget.controller.askFocus(_textController.text),
            child: const Text('Ask Combat Focus'),
          ),
        ],
      ),
    );
  }
}

class _EncounterResolutionPanel extends StatelessWidget {
  const _EncounterResolutionPanel({
    required this.controller,
    required this.view,
  });

  final CombatController controller;
  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final resolution = view.resolution;
    if (resolution == null) return const SizedBox.shrink();
    final rewards = resolution.rewards;
    return InfoCard(
      title: 'Encounter Review',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_safe(resolution.aftermathTitle).isNotEmpty)
            Text(
              _safe(resolution.aftermathTitle),
              style: Theme.of(context).textTheme.titleMedium,
            ),
          if (_safe(resolution.summary).isNotEmpty)
            Text(_safe(resolution.summary)),
          if (rewards != null) ...[
            const SizedBox(height: 12),
            Text('Rewards', style: Theme.of(context).textTheme.titleSmall),
            if (rewards.experiencePointsAwarded > 0)
              _BulletText('${rewards.experiencePointsAwarded} XP awarded'),
            for (final item in rewards.items) _BulletText(_safe(item)),
            if (rewards.pendingAdvancement)
              _BulletText(
                rewards.targetLevel == null
                    ? 'Advancement is ready.'
                    : 'Advancement to level ${rewards.targetLevel} is ready.',
              ),
          ],
          if (resolution.choices.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final choice in resolution.choices)
                  FilledButton(
                    onPressed: controller.submitting
                        ? null
                        : () => controller.resolveEncounterChoice(
                              choice.choiceId,
                            ),
                    child: Text(_safe(choice.label, 'Resolve')),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed:
                controller.submitting ? null : controller.continueAdventure,
            icon: const Icon(Icons.travel_explore),
            label: const Text('Continue Adventure'),
          ),
        ],
      ),
    );
  }
}

class _RecoveryPanel extends StatelessWidget {
  const _RecoveryPanel({
    required this.controller,
    required this.view,
  });

  final CombatController controller;
  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final recovery = view.recovery;
    if (recovery == null) return const SizedBox.shrink();
    return InfoCard(
      title: 'Recovery Needed',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_safe(
            recovery.message,
            'Combat needs a safe refresh before more choices are available.',
          )),
          const SizedBox(height: 8),
          _BulletText(recovery.refreshSafe
              ? 'Refreshing is safe.'
              : 'Refresh is not marked safe yet.'),
          _BulletText(recovery.retrySafe
              ? 'Retry may be safe after refresh.'
              : 'Do not retry this choice until combat is refreshed.'),
          if (recovery.repairRequired)
            const _BulletText('A GM or developer review may be needed.'),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: controller.refresh,
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh Combat'),
          ),
        ],
      ),
    );
  }
}

class _CombatLogPanel extends StatelessWidget {
  const _CombatLogPanel({required this.view});

  final CombatView view;

  @override
  Widget build(BuildContext context) {
    final reviewLog = view.resolution?.review?.log ?? const <CombatLogGroup>[];
    return InfoCard(
      title: 'Combat Log',
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: const Text('Review visible combat events'),
        childrenPadding: EdgeInsets.zero,
        children: [
          if (view.latestEvents.isEmpty && reviewLog.isEmpty)
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('No visible events are available yet.'),
            ),
          for (final event in view.latestEvents) _LogEventRow(event: event),
          for (final group in reviewLog) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Round ${group.round ?? '-'} ${_safe(group.turn)}',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
            ),
            for (final event in group.events) _LogEventRow(event: event),
          ],
        ],
      ),
    );
  }
}

class _LogEventRow extends StatelessWidget {
  const _LogEventRow({required this.event});

  final CombatEvent event;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: _BulletText(
          _safe(
            event.summary,
            [
              _safe(event.actor),
              _safe(event.actionLabel),
              _safe(event.target),
            ].where((entry) => entry.isNotEmpty).join(' '),
          ),
        ),
      ),
    );
  }
}

class _DecisionCategoryChips extends StatelessWidget {
  const _DecisionCategoryChips({required this.categories});

  final List<CombatDecisionCategory> categories;

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) {
      return const Text('The server has not exposed combat choices yet.');
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final category in categories)
          Chip(
            label: Text(
              [
                _safe(category.label, 'Choice'),
                _safe(category.status),
              ].where((entry) => entry.isNotEmpty).join(': '),
            ),
          ),
      ],
    );
  }
}

class _TextList extends StatelessWidget {
  const _TextList({
    required this.title,
    required this.values,
  });

  final String title;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    final safeValues =
        values.map(_safe).where((entry) => entry.isNotEmpty).toList();
    if (safeValues.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          for (final value in safeValues) _BulletText(value),
        ],
      ),
    );
  }
}

class _FactPill extends StatelessWidget {
  const _FactPill({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Chip(label: Text('$label: ${_safe(value, 'Unknown')}'));
  }
}

class _BulletText extends StatelessWidget {
  const _BulletText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final safeText = _safe(text);
    if (safeText.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('•  '),
          Expanded(child: Text(safeText)),
        ],
      ),
    );
  }
}

String _safe(String? value, [String fallback = '']) {
  return playerSafeCombatText(value, fallback);
}

String _statusLabel(String? value) {
  final safe = _safe(value);
  return safe.isEmpty ? 'Combat' : humanizeCombatText(safe);
}

String _operationForTiming(String timingCategory) {
  final lower = timingCategory.toLowerCase();
  if (lower.contains('bonus')) return 'bonus_action';
  if (lower.contains('object') || lower.contains('interaction')) {
    return 'object_interaction';
  }
  return 'action';
}

bool _waitAvailable(CombatView view) {
  return _categoryAvailable(view, 'wait') || _categoryAvailable(view, 'action');
}

bool _categoryAvailable(CombatView view, String category) {
  final normalized = category.toLowerCase();
  return view.decisionCategories.any(
      (entry) => entry.category.toLowerCase() == normalized && entry.available);
}
