import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import 'greyvale_endpoint_card.dart';
import '../shared/widgets/app_scaffold.dart';

class CampaignPreviewPage extends StatefulWidget {
  const CampaignPreviewPage({
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
  State<CampaignPreviewPage> createState() => _CampaignPreviewPageState();
}

class _CampaignPreviewPageState extends State<CampaignPreviewPage> {
  late Future<CurrentAdventureDashboard> _adventure;
  bool _startingAdventure = false;

  @override
  void initState() {
    super.initState();
    _adventure = widget.dashboardApi.getCurrentAdventure();
  }

  void _reload() {
    setState(() {
      _adventure = widget.dashboardApi.getCurrentAdventure();
    });
  }

  Future<void> _showStartAdventureIntro() async {
    final intro = await widget.dashboardApi.getStarterAdventure();
    if (!mounted) {
      return;
    }

    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(intro.introTitle),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(intro.introText),
                const SizedBox(height: 16),
                Text('Campaign: ${intro.campaignName}',
                    style: Theme.of(context).textTheme.titleMedium),
                Text('World: ${intro.worldName}'),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: Text(intro.cancelLabel),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: Text(intro.beginLabel),
              ),
            ],
          ),
        ) ??
        false;

    if (confirmed) {
      await _beginAdventure();
    }
  }

  Future<void> _beginAdventure() async {
    if (_startingAdventure) {
      return;
    }

    setState(() => _startingAdventure = true);
    try {
      final result = await widget.dashboardApi.startAdventure();
      if (!mounted) {
        return;
      }
      widget.navigate(result.route);
    } catch (error) {
      if (!mounted) {
        return;
      }
      final message = error is ApiException
          ? error.message
          : 'Could not start the adventure right now.';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) {
        setState(() => _startingAdventure = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Adventure',
      actions: [
        IconButton(
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh'),
        TextButton(onPressed: widget.onBack, child: const Text('Dashboard')),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<CurrentAdventureDashboard>(
        future: _adventure,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _PreviewError(
              message:
                  'We couldn’t load the adventure overview. Try refreshing, or return to the dashboard.',
              onRetry: _reload,
              onDashboard: widget.onBack,
            );
          }

          final adventure = snapshot.requireData;
          final endpoint = adventure.sliceEndpoint;
          if (!adventure.hasActiveCampaign) {
            return _NoAdventureState(
              actionStatus: adventure.actionStatus,
              isStarting: _startingAdventure,
              onStart: _showStartAdventureIntro,
              onCreateCharacter: () =>
                  widget.navigate('/play/create-character'),
              onDashboard: widget.onBack,
            );
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Campaign Preview',
                    style: Theme.of(context).textTheme.displaySmall),
                const SizedBox(height: 8),
                const Text(
                    'A real-state overview of the current adventure. Open the scene view for the richer character-perspective view.'),
                const SizedBox(height: 20),
                if (endpoint?.isEndpointReached == true) ...[
                  GreyvaleEndpointCard(
                    endpoint: endpoint!,
                    onOpenScene: () => widget.navigate(
                        adventure.sceneRoute ?? '/play/campaign/scene'),
                    onOpenHistory: () =>
                        widget.navigate('/play/campaign/history'),
                    onOpenKnowledge: () =>
                        widget.navigate('/play/campaign/knowledge'),
                    onCampaignOverview: widget.onBack,
                  ),
                  const SizedBox(height: 16),
                ],
                InfoCard(
                  title: adventure.campaignName ?? 'Adventure',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          'World: ${adventure.worldName ?? adventure.worldId ?? 'Unknown'}'),
                      Text(
                          'Location: ${adventure.currentLocationName ?? 'No location set'}'),
                      Text(
                          'Scene: ${adventure.currentSceneTitle ?? 'No scene set'}'),
                      if (adventure.currentObjectiveTitle != null)
                        Text('Objective: ${adventure.currentObjectiveTitle}'),
                      const SizedBox(height: 12),
                      Chip(label: Text(adventure.actionStatus.label)),
                      if (adventure.actionStatus.description.isNotEmpty)
                        Text(adventure.actionStatus.description),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    _PreviewTile(
                        child: _EnvironmentCard(adventure.environment)),
                    _PreviewTile(
                      child: _NpcPreviewCard(
                        npcs: adventure.visibleNpcPreview,
                        additionalCount: adventure.additionalVisibleNpcCount,
                      ),
                    ),
                    _PreviewTile(
                      child: InfoCard(
                        title: 'Adventure Records',
                        child: const Text(
                          'Resolved beats stay attached to the scene, while history and knowledge collect what your character has seen and learned.',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton(
                      onPressed: () => widget.navigate(
                          adventure.sceneRoute ?? '/play/campaign/scene'),
                      child: Text(endpoint?.isEndpointReached == true
                          ? 'Review Current Scene'
                          : 'View Current Scene'),
                    ),
                    OutlinedButton(
                      onPressed: () =>
                          widget.navigate('/play/campaign/history'),
                      child: const Text('History'),
                    ),
                    OutlinedButton(
                      onPressed: () =>
                          widget.navigate('/play/campaign/knowledge'),
                      child: const Text('Knowledge'),
                    ),
                    FilledButton(
                        onPressed: widget.onBack,
                        child: const Text('Back to Dashboard')),
                    OutlinedButton(
                      onPressed: () => widget.navigate('/play/characters'),
                      child: const Text('Manage Characters'),
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

class _EnvironmentCard extends StatelessWidget {
  const _EnvironmentCard(this.environment);

  final AdventureEnvironmentSummary? environment;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Environment',
      child: environment == null
          ? const Text('No environment summary is available yet.')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(environment!.summary ??
                    'Environment details are available.'),
                if (environment!.weather != null)
                  Text('Weather: ${environment!.weather}'),
                if (environment!.timeOfDay != null)
                  Text('Time: ${environment!.timeOfDay}'),
                if (environment!.season != null)
                  Text('Season: ${environment!.season}'),
                if (environment!.moodOrTone != null)
                  Text('Tone: ${environment!.moodOrTone}'),
              ],
            ),
    );
  }
}

class _NpcPreviewCard extends StatelessWidget {
  const _NpcPreviewCard({
    required this.npcs,
    required this.additionalCount,
  });

  final List<NpcPreviewSummary> npcs;
  final int additionalCount;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'People Nearby',
      child: npcs.isEmpty
          ? const Text('No visible NPCs are currently shown in this preview.')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final npc in npcs)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(npc.activity == null
                        ? npc.displayName
                        : '${npc.displayName} - ${npc.activity}'),
                  ),
                if (additionalCount > 0) Text('and $additionalCount more'),
              ],
            ),
    );
  }
}

class _NoAdventureState extends StatelessWidget {
  const _NoAdventureState({
    required this.actionStatus,
    required this.isStarting,
    required this.onStart,
    required this.onCreateCharacter,
    required this.onDashboard,
  });

  final DashboardActionStatus actionStatus;
  final bool isStarting;
  final VoidCallback onStart;
  final VoidCallback onCreateCharacter;
  final VoidCallback onDashboard;

  @override
  Widget build(BuildContext context) {
    final needsCharacter = actionStatus.state == 'no_active_character';
    return Center(
      child: InfoCard(
        title: needsCharacter ? 'Choose A Character' : 'No Active Adventure',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(needsCharacter
                ? 'Create or select an active character before starting Greyvale.'
                : 'Your active character does not have an adventure yet.'),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (needsCharacter)
                  FilledButton(
                    onPressed: onCreateCharacter,
                    child: const Text('Create Character'),
                  )
                else
                  FilledButton(
                    onPressed: isStarting ? null : onStart,
                    child: Text(isStarting ? 'Starting...' : 'Start Greyvale'),
                  ),
                OutlinedButton(
                    onPressed: onDashboard,
                    child: const Text('Back to Dashboard')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewTile extends StatelessWidget {
  const _PreviewTile({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: MediaQuery.of(context).size.width < 720 ? double.infinity : 520,
      child: child,
    );
  }
}

class _PreviewError extends StatelessWidget {
  const _PreviewError({
    required this.message,
    required this.onRetry,
    required this.onDashboard,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onDashboard;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: 'Could not load adventure',
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
                OutlinedButton(
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
