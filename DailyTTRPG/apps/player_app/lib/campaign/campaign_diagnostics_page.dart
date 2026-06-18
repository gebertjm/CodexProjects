import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

class CampaignDiagnosticsPage extends StatefulWidget {
  const CampaignDiagnosticsPage({
    required this.dashboardApi,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final PlayerDashboardApi dashboardApi;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<CampaignDiagnosticsPage> createState() =>
      _CampaignDiagnosticsPageState();
}

class _CampaignDiagnosticsPageState extends State<CampaignDiagnosticsPage> {
  late Future<PlaytestDiagnostics> _diagnostics;
  String? _repairingAction;
  String? _lastRepairMessage;

  @override
  void initState() {
    super.initState();
    _diagnostics = widget.dashboardApi.getPlaytestDiagnostics();
  }

  void _reload() {
    setState(() {
      _diagnostics = widget.dashboardApi.getPlaytestDiagnostics();
    });
  }

  Future<void> _runRepair(PlaytestRepairAction action) async {
    if (_repairingAction != null) {
      return;
    }

    setState(() {
      _repairingAction = action.repairAction;
      _lastRepairMessage = null;
    });

    try {
      final result = await widget.dashboardApi.runPlaytestRepair(
        repairAction: action.repairAction,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _lastRepairMessage = result.message;
        if (result.diagnosticsAfter != null) {
          _diagnostics = Future.value(result.diagnosticsAfter);
        } else {
          _diagnostics = widget.dashboardApi.getPlaytestDiagnostics();
        }
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.message)),
      );
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not run that repair.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _repairingAction = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Campaign Diagnostics',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Rerun diagnostics',
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/scene'),
          child: const Text('Scene'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/dev/dialogue-debug'),
          child: const Text('Dialogue Debug'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/dev/exploration-mechanics'),
          child: const Text('Exploration Mechanics'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign'),
          child: const Text('Overview'),
        ),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<PlaytestDiagnostics>(
        future: _diagnostics,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _DiagnosticsStateCard(
              title: 'Diagnostics unavailable',
              message:
                  'This account is not authorized for campaign diagnostics, or the campaign could not be checked.',
              primaryLabel: 'Back to Scene',
              onPrimary: () => widget.navigate('/play/campaign/scene'),
              onRetry: _reload,
            );
          }

          final diagnostics = snapshot.requireData;
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _DiagnosticsSummaryCard(diagnostics: diagnostics),
                if (_lastRepairMessage != null) ...[
                  const SizedBox(height: 12),
                  InfoCard(
                    title: 'Last Repair',
                    child: Text(_lastRepairMessage!),
                  ),
                ],
                const SizedBox(height: 12),
                _DiagnosticsIssuesCard(diagnostics: diagnostics),
                const SizedBox(height: 12),
                _RepairActionsCard(
                  actions: diagnostics.availableRepairActions,
                  repairingAction: _repairingAction,
                  onRunRepair: _runRepair,
                ),
                const SizedBox(height: 12),
                _TechnicalDetailsCard(diagnostics: diagnostics),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton(
                      onPressed: _reload,
                      child: const Text('Rerun Check'),
                    ),
                    OutlinedButton(
                      onPressed: () => widget.navigate('/play/campaign/scene'),
                      child: const Text('Current Scene'),
                    ),
                    OutlinedButton(
                      onPressed: () =>
                          widget.navigate('/play/dev/dialogue-debug'),
                      child: const Text('Dialogue Debug'),
                    ),
                    OutlinedButton(
                      onPressed: () =>
                          widget.navigate('/play/dev/exploration-mechanics'),
                      child: const Text('Exploration Mechanics'),
                    ),
                    OutlinedButton(
                      onPressed: () => widget.navigate('/play/campaign'),
                      child: const Text('Campaign Overview'),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DiagnosticsSummaryCard extends StatelessWidget {
  const _DiagnosticsSummaryCard({required this.diagnostics});

  final PlaytestDiagnostics diagnostics;

  @override
  Widget build(BuildContext context) {
    final summary = diagnostics.summary;
    return InfoCard(
      title: 'Loop Health',
      action: Chip(
        label: Text(diagnostics.status.toUpperCase()),
        backgroundColor: _diagnosticStatusColor(context, diagnostics.status),
      ),
      child: Wrap(
        spacing: 18,
        runSpacing: 12,
        children: [
          _DiagnosticFact(
            label: 'Campaign',
            value: summary.campaignName ??
                diagnostics.campaignInstanceId ??
                'None',
          ),
          _DiagnosticFact(
            label: 'Character',
            value: summary.characterName ?? summary.characterId ?? 'None',
          ),
          _DiagnosticFact(
            label: 'Beat',
            value: summary.beatNumber?.toString() ?? 'Unknown',
          ),
          _DiagnosticFact(
            label: 'Scene',
            value: summary.currentSceneName ?? summary.currentSceneId ?? 'None',
          ),
          _DiagnosticFact(
            label: 'Window',
            value: _humanize(summary.currentActionWindowState ?? 'none'),
          ),
          _DiagnosticFact(
            label: 'Open to Player',
            value: summary.currentActionWindowOpenForPlayer ? 'Yes' : 'No',
          ),
          _DiagnosticFact(
            label: 'Latest Result',
            value: summary.latestResultId ?? 'None',
          ),
          _DiagnosticFact(
            label: 'Knowledge',
            value: summary.knowledgeCount.toString(),
          ),
          _DiagnosticFact(
            label: 'History',
            value: summary.historyEntries.toString(),
          ),
        ],
      ),
    );
  }
}

class _DiagnosticsIssuesCard extends StatelessWidget {
  const _DiagnosticsIssuesCard({required this.diagnostics});

  final PlaytestDiagnostics diagnostics;

  @override
  Widget build(BuildContext context) {
    final issues = [...diagnostics.errors, ...diagnostics.warnings];
    return InfoCard(
      title: 'Warnings & Errors',
      child: issues.isEmpty
          ? const Text('No loop consistency problems were detected.')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final issue in issues)
                  _IssuePanel(
                    issue: issue,
                    severity: diagnostics.errors.contains(issue)
                        ? 'error'
                        : 'warning',
                  ),
              ],
            ),
    );
  }
}

class _IssuePanel extends StatelessWidget {
  const _IssuePanel({required this.issue, required this.severity});

  final PlaytestDiagnosticIssue issue;
  final String severity;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Theme.of(context).dividerColor),
        color: severity == 'error'
            ? Theme.of(context)
                .colorScheme
                .errorContainer
                .withValues(alpha: .35)
            : Theme.of(context)
                .colorScheme
                .tertiaryContainer
                .withValues(alpha: .35),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_humanize(issue.code),
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(issue.message),
          if (issue.repairAction != null) ...[
            const SizedBox(height: 4),
            Text('Suggested repair: ${_humanize(issue.repairAction!)}'),
          ],
        ],
      ),
    );
  }
}

class _RepairActionsCard extends StatelessWidget {
  const _RepairActionsCard({
    required this.actions,
    required this.repairingAction,
    required this.onRunRepair,
  });

  final List<PlaytestRepairAction> actions;
  final String? repairingAction;
  final ValueChanged<PlaytestRepairAction> onRunRepair;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Low-Risk Repairs',
      child: actions.isEmpty
          ? const Text('No low-risk repairs are available for this state.')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'These actions rebuild safe read models or create a missing next action window only when the backend proves it is safe.',
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final action in actions)
                      OutlinedButton.icon(
                        onPressed: repairingAction == null
                            ? () => onRunRepair(action)
                            : null,
                        icon: repairingAction == action.repairAction
                            ? const SizedBox(
                                height: 16,
                                width: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.build),
                        label: Text(
                          repairingAction == action.repairAction
                              ? 'Running ${action.label}...'
                              : action.label,
                        ),
                      ),
                  ],
                ),
              ],
            ),
    );
  }
}

class _TechnicalDetailsCard extends StatelessWidget {
  const _TechnicalDetailsCard({required this.diagnostics});

  final PlaytestDiagnostics diagnostics;

  @override
  Widget build(BuildContext context) {
    final summary = diagnostics.summary;
    return Card(
      child: ExpansionTile(
        title: const Text('Technical Details'),
        subtitle: const Text('Dev-only IDs and timing details.'),
        childrenPadding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        children: [
          _OptionalLine(label: 'Checked at', value: diagnostics.checkedAt),
          _OptionalLine(
              label: 'Campaign ID', value: diagnostics.campaignInstanceId),
          _OptionalLine(label: 'Account ID', value: summary.accountId),
          _OptionalLine(label: 'Character ID', value: summary.characterId),
          _OptionalLine(label: 'Scene ID', value: summary.currentSceneId),
          _OptionalLine(
              label: 'Window ID', value: summary.currentActionWindowId),
          _OptionalLine(
              label: 'Window opens',
              value: summary.currentActionWindowOpensAt == null
                  ? null
                  : _formatLocalDateTime(summary.currentActionWindowOpensAt!)),
          _OptionalLine(
              label: 'Window closes',
              value: summary.currentActionWindowClosesAt == null
                  ? null
                  : _formatLocalDateTime(summary.currentActionWindowClosesAt!)),
          _OptionalLine(
              label: 'Submitted action status',
              value: summary.submittedActionStatus),
          _OptionalLine(
              label: 'Latest result summary',
              value: summary.latestResultSummary),
          _OptionalLine(
              label: 'Active window count',
              value: summary.activeActionWindowCount.toString()),
          _OptionalLine(
              label: 'Open window count',
              value: summary.openActionWindowCount.toString()),
          _OptionalLine(
              label: 'Scene feed entries',
              value: summary.sceneFeedEntryCount.toString()),
        ],
      ),
    );
  }
}

class _DiagnosticsStateCard extends StatelessWidget {
  const _DiagnosticsStateCard({
    required this.title,
    required this.message,
    required this.primaryLabel,
    required this.onPrimary,
    required this.onRetry,
  });

  final String title;
  final String message;
  final String primaryLabel;
  final VoidCallback onPrimary;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: title,
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
                FilledButton(onPressed: onPrimary, child: Text(primaryLabel)),
                OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ),
          ],
        ),
      ),
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
      constraints: const BoxConstraints(minWidth: 130),
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

class _OptionalLine extends StatelessWidget {
  const _OptionalLine({required this.label, required this.value});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    if (value == null || value!.trim().isEmpty) {
      return const SizedBox.shrink();
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: Text('$label: $value'),
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

Color? _diagnosticStatusColor(BuildContext context, String? status) {
  final colorScheme = Theme.of(context).colorScheme;
  return switch (status) {
    'ok' => colorScheme.primaryContainer,
    'warning' => colorScheme.tertiaryContainer,
    'error' => colorScheme.errorContainer,
    _ => null,
  };
}

String _formatLocalDateTime(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return value;
  }
  final local = parsed.toLocal();
  final hour = local.hour > 12
      ? local.hour - 12
      : local.hour == 0
          ? 12
          : local.hour;
  final minute = local.minute.toString().padLeft(2, '0');
  final suffix = local.hour >= 12 ? 'PM' : 'AM';
  return '${local.month}/${local.day}/${local.year} $hour:$minute $suffix';
}
