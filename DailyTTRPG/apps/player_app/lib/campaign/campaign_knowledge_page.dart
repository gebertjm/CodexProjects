import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

class CampaignKnowledgePage extends StatefulWidget {
  const CampaignKnowledgePage({
    required this.dashboardApi,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final PlayerDashboardApi dashboardApi;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<CampaignKnowledgePage> createState() => _CampaignKnowledgePageState();
}

class _CampaignKnowledgePageState extends State<CampaignKnowledgePage> {
  late Future<KnowledgeJournal> _journal;

  @override
  void initState() {
    super.initState();
    _journal = widget.dashboardApi.getCampaignKnowledge();
  }

  void _reload() {
    setState(() {
      _journal = widget.dashboardApi.getCampaignKnowledge();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Knowledge',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh knowledge',
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/scene'),
          child: const Text('Scene'),
        ),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<KnowledgeJournal>(
        future: _journal,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _SimpleStateCard(
              title: 'Could not load knowledge',
              message:
                  'We couldn’t load the knowledge journal. Try refreshing, or return to the current scene.',
              onRetry: _reload,
            );
          }

          final journal = snapshot.requireData;
          if (journal.state == 'no_active_campaign') {
            return _SimpleStateCard(
              title: 'No active adventure',
              message:
                  'Start an adventure before opening the knowledge journal.',
              onRetry: () => widget.navigate('/play/campaign'),
              buttonLabel: 'Back to Adventure',
            );
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  journal.campaign?.campaignName ?? 'Knowledge Journal',
                  style: Theme.of(context).textTheme.displaySmall,
                ),
                if (journal.activeCharacter != null)
                  Text('Known by ${journal.activeCharacter!.name}'),
                const SizedBox(height: 8),
                Text(
                    '${journal.knownCount} known detail${journal.knownCount == 1 ? '' : 's'} recorded.'),
                const SizedBox(height: 16),
                if (journal.currentObjective != null) ...[
                  InfoCard(
                    title: 'Current Objective',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(journal.currentObjective!.title ??
                            journal.currentObjective!.key ??
                            'Objective'),
                        if (journal.currentObjective!.status != null) ...[
                          const SizedBox(height: 6),
                          Chip(
                            label: Text(
                                _humanize(journal.currentObjective!.status!)),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                if (journal.sections.isEmpty)
                  const InfoCard(
                    title: 'No clues recorded yet',
                    child: Text(
                      'Discoveries, rumors, people, and locations will appear here as your character learns them.',
                    ),
                  )
                else ...[
                  _KnowledgeSection(
                    title: 'Clues',
                    entries: journal.sections.clues,
                  ),
                  _KnowledgeSection(
                    title: 'Facts',
                    entries: journal.sections.facts,
                  ),
                  _KnowledgeSection(
                    title: 'Rumors and uncertain claims',
                    entries: journal.sections.rumors,
                  ),
                  _KnowledgeSection(
                    title: 'People',
                    entries: journal.sections.people,
                  ),
                  _KnowledgeSection(
                    title: 'Locations',
                    entries: journal.sections.locations,
                  ),
                  _KnowledgeSection(
                    title: 'Objective discoveries',
                    entries: journal.sections.objectiveDiscoveries,
                  ),
                ],
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton(
                      onPressed: () => widget.navigate('/play/campaign/scene'),
                      child: const Text('Current Scene'),
                    ),
                    OutlinedButton(
                      onPressed: () =>
                          widget.navigate('/play/campaign/history'),
                      child: const Text('History'),
                    ),
                    OutlinedButton(
                      onPressed: () => widget.navigate('/play/campaign'),
                      child: const Text('Overview'),
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

class _KnowledgeSection extends StatelessWidget {
  const _KnowledgeSection({
    required this.title,
    required this.entries,
  });

  final String title;
  final List<KnowledgeJournalEntry> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InfoCard(
        title: title,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final entry in entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.title,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(entry.text),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (entry.status != null)
                          Chip(label: Text(_humanize(entry.status!))),
                        if (entry.confidence != null)
                          Chip(label: Text(_humanize(entry.confidence!))),
                        if (entry.sourceLabel != null)
                          Chip(label: Text(entry.sourceLabel!)),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SimpleStateCard extends StatelessWidget {
  const _SimpleStateCard({
    required this.title,
    required this.message,
    required this.onRetry,
    this.buttonLabel = 'Try again',
  });

  final String title;
  final String message;
  final VoidCallback onRetry;
  final String buttonLabel;

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
            FilledButton(onPressed: onRetry, child: Text(buttonLabel)),
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
