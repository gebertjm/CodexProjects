import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

class CampaignHistoryPage extends StatefulWidget {
  const CampaignHistoryPage({
    required this.dashboardApi,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final PlayerDashboardApi dashboardApi;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<CampaignHistoryPage> createState() => _CampaignHistoryPageState();
}

class _CampaignHistoryPageState extends State<CampaignHistoryPage> {
  late Future<CampaignHistory> _history;

  @override
  void initState() {
    super.initState();
    _history = widget.dashboardApi.getCampaignHistory();
  }

  void _reload() {
    setState(() {
      _history = widget.dashboardApi.getCampaignHistory();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Campaign History',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh history',
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/scene'),
          child: const Text('Scene'),
        ),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<CampaignHistory>(
        future: _history,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _SimpleStateCard(
              title: 'Could not load history',
              message:
                  'We couldn’t load campaign history. Try refreshing, or return to the current scene.',
              onRetry: _reload,
            );
          }

          final history = snapshot.requireData;
          if (history.state == 'no_active_campaign') {
            return _SimpleStateCard(
              title: 'No active adventure',
              message: 'Start an adventure before opening campaign history.',
              onRetry: () => widget.navigate('/play/campaign'),
              buttonLabel: 'Back to Adventure',
            );
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  history.campaign?.campaignName ?? 'Campaign History',
                  style: Theme.of(context).textTheme.displaySmall,
                ),
                if (history.activeCharacter != null)
                  Text('Seen by ${history.activeCharacter!.name}'),
                const SizedBox(height: 16),
                if (history.timeline.isEmpty)
                  const InfoCard(
                    title: 'No resolved beats yet',
                    child: Text(
                      'Beat results will appear here after actions resolve.',
                    ),
                  )
                else
                  for (final entry in history.timeline)
                    _TimelineEntryCard(entry: entry),
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
                          widget.navigate('/play/campaign/knowledge'),
                      child: const Text('Knowledge'),
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

class _TimelineEntryCard extends StatelessWidget {
  const _TimelineEntryCard({required this.entry});

  final CampaignTimelineEntry entry;

  @override
  Widget build(BuildContext context) {
    final location = [
      entry.locationName,
      entry.sceneTitle,
    ].whereType<String>().where((value) => value.trim().isNotEmpty).join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InfoCard(
        title: entry.title,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (location.isNotEmpty) Text(location),
            if (entry.resolvedAt != null)
              Text(_formatLocalDateTime(entry.resolvedAt!)),
            const SizedBox(height: 8),
            Text(entry.summary),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: EdgeInsets.zero,
              title: const Text('Details'),
              children: [
                if (entry.submittedActionSummary != null)
                  _BulletText('Action: ${entry.submittedActionSummary}'),
                if (entry.interpretedActionSummary != null)
                  _BulletText('Interpreted: ${entry.interpretedActionSummary}'),
                if (entry.narration != null && entry.narration != entry.summary)
                  _BulletText(entry.narration!),
                for (final update in entry.objectiveUpdates)
                  _BulletText('Objective: $update'),
                for (final discovery in entry.majorDiscoveries)
                  _BulletText('Discovery: $discovery'),
                for (final change in entry.visibleChanges)
                  _BulletText('Change: $change'),
                for (final mechanic in entry.safeMechanics)
                  _BulletText('Mechanic: $mechanic'),
              ],
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
