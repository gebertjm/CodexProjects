import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../campaign/greyvale_endpoint_card.dart';
import '../shared/widgets/app_scaffold.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({
    required this.dashboardApi,
    required this.user,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final PlayerDashboardApi dashboardApi;
  final User user;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  late Future<PlayerDashboard> _dashboard;
  bool _startingAdventure = false;

  @override
  void initState() {
    super.initState();
    _dashboard = widget.dashboardApi.getDashboard();
  }

  void _reload() {
    setState(() {
      _dashboard = widget.dashboardApi.getDashboard();
    });
  }

  Future<void> _showStartAdventureIntro(PlayerDashboard dashboard) async {
    final intro = dashboard.starterAdventure;
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
      await _beginAdventure(dashboard.activeCharacter?.characterId);
    }
  }

  Future<void> _beginAdventure(String? characterId) async {
    if (_startingAdventure) {
      return;
    }

    setState(() => _startingAdventure = true);
    try {
      final result =
          await widget.dashboardApi.startAdventure(characterId: characterId);
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Adventure started.')),
      );
      widget.navigate(result.route);
    } catch (error) {
      if (!mounted) {
        return;
      }
      final message = error is ApiException
          ? error.message
          : 'Could not start the adventure right now.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
      _reload();
    } finally {
      if (mounted) {
        setState(() => _startingAdventure = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'DailyTTRPG',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh',
        ),
        TextButton(
          onPressed: widget.onSignOut,
          child: const Text('Sign out'),
        ),
      ],
      child: FutureBuilder<PlayerDashboard>(
        future: _dashboard,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _ErrorState(
              message:
                  'We couldn’t load your player dashboard. Try refreshing, or sign out and back in if the problem continues.',
              onRetry: _reload,
            );
          }

          final dashboard = snapshot.requireData;
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Player Dashboard',
                    style: Theme.of(context).textTheme.displaySmall),
                const SizedBox(height: 8),
                const Text(
                    'Your home for characters, campaigns, and the next story beat.'),
                const SizedBox(height: 20),
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    _DashboardTile(
                        child: _AccountCard(dashboard.account, widget.user)),
                    _DashboardTile(
                      child: _ActiveCharacterCard(
                        character: dashboard.activeCharacter,
                        canResumeDraft: dashboard.nextActions.canResumeDraft,
                        onCreate: () =>
                            widget.navigate('/play/create-character'),
                        onManage: () => widget.navigate(
                            dashboard.nextActions.manageCharactersRoute),
                        onView: dashboard.activeCharacter == null
                            ? null
                            : () => widget.navigate(
                                '/play/characters/${dashboard.activeCharacter!.characterId}'),
                      ),
                    ),
                    _DashboardTile(
                      child: _AdventureCard(
                        dashboard: dashboard,
                        isStarting: _startingAdventure,
                        onStart: dashboard.nextActions.canStartAdventure
                            ? () => _showStartAdventureIntro(dashboard)
                            : null,
                        onContinue: dashboard.nextActions.canContinueAdventure
                            ? () => widget.navigate(
                                dashboard.nextActions.continueRoute ??
                                    '/play/campaign')
                            : null,
                        onScene: dashboard.nextActions.canContinueAdventure
                            ? () => widget.navigate(
                                dashboard.currentAdventure.sceneRoute ??
                                    '/play/campaign/scene')
                            : null,
                        onHistory: () =>
                            widget.navigate('/play/campaign/history'),
                        onKnowledge: () =>
                            widget.navigate('/play/campaign/knowledge'),
                      ),
                    ),
                    _DashboardTile(
                      child: _CharacterSummaryCard(
                        count: dashboard.charactersSummary.count,
                        onOpen: () => widget
                            .navigate(dashboard.charactersSummary.manageRoute),
                      ),
                    ),
                    _DashboardTile(
                      child: _SettingsCard(
                        smsMode: dashboard.account.smsMode,
                        smsEnabled: dashboard.account.smsEnabled,
                        onOpen: () => widget.navigate('/play/settings'),
                      ),
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

class _AccountCard extends StatelessWidget {
  const _AccountCard(this.account, this.user);

  final AccountSummary account;
  final User user;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Account',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(account.displayName),
          Text(account.email ?? user.email ?? 'No email on file'),
          const SizedBox(height: 8),
          Text('Backend account: ${account.accountId}'),
        ],
      ),
    );
  }
}

class _ActiveCharacterCard extends StatelessWidget {
  const _ActiveCharacterCard({
    required this.character,
    required this.canResumeDraft,
    required this.onCreate,
    required this.onManage,
    this.onView,
  });

  final CharacterSummary? character;
  final bool canResumeDraft;
  final VoidCallback onCreate;
  final VoidCallback onManage;
  final VoidCallback? onView;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Active Character',
      action: TextButton(
          onPressed: onCreate,
          child: Text(canResumeDraft ? 'Resume Draft' : 'Create')),
      child: character == null
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(canResumeDraft
                    ? 'Resume your saved character draft to begin.'
                    : 'Create your first character to begin.'),
                const SizedBox(height: 12),
                FilledButton(
                    onPressed: onCreate,
                    child: Text(
                        canResumeDraft ? 'Resume Draft' : 'Create Character')),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(character!.name,
                    style: Theme.of(context).textTheme.titleMedium),
                Text(
                    'Level ${character!.level} ${character!.species ?? ''} ${character!.characterClass ?? ''}'),
                Text('Status: ${character!.status}'),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (onView != null)
                      OutlinedButton(
                          onPressed: onView,
                          child: const Text('View Character')),
                    OutlinedButton(
                        onPressed: onManage,
                        child: const Text('Manage Characters')),
                  ],
                ),
              ],
            ),
    );
  }
}

class _AdventureCard extends StatelessWidget {
  const _AdventureCard({
    required this.dashboard,
    required this.isStarting,
    this.onStart,
    this.onContinue,
    this.onScene,
    this.onHistory,
    this.onKnowledge,
  });

  final PlayerDashboard dashboard;
  final bool isStarting;
  final VoidCallback? onStart;
  final VoidCallback? onContinue;
  final VoidCallback? onScene;
  final VoidCallback? onHistory;
  final VoidCallback? onKnowledge;

  @override
  Widget build(BuildContext context) {
    final adventure = dashboard.currentAdventure;
    if (dashboard.activeCharacter == null) {
      return InfoCard(
        title: 'Adventure',
        child: const Text(
            'Create or select an active character before starting an adventure.'),
      );
    }

    if (!adventure.hasActiveCampaign) {
      return InfoCard(
        title: 'Ready For Adventure',
        action: onStart == null
            ? null
            : TextButton(
                onPressed: isStarting ? null : onStart,
                child: Text(isStarting ? 'Starting...' : 'Start'),
              ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Starter campaign: ${dashboard.starterAdventure.campaignName}'),
            Text(dashboard.starterAdventure.introText),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: isStarting ? null : onStart,
              child: Text(isStarting ? 'Starting...' : 'Start Greyvale'),
            ),
          ],
        ),
      );
    }

    final endpoint = adventure.sliceEndpoint;
    if (endpoint?.isEndpointReached == true) {
      return GreyvaleEndpointCard(
        endpoint: endpoint!,
        onOpenScene: onScene,
        onOpenHistory: onHistory,
        onOpenKnowledge: onKnowledge,
      );
    }

    return InfoCard(
      title: 'Current Adventure',
      action: TextButton(onPressed: onContinue, child: const Text('Continue')),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(adventure.campaignName ?? 'Adventure',
              style: Theme.of(context).textTheme.titleMedium),
          Text(adventure.worldName ?? adventure.worldId ?? 'Unknown world'),
          Text(adventure.currentLocationName ?? 'No location set'),
          Text(adventure.currentSceneTitle ?? 'No scene set'),
          if (adventure.currentObjectiveTitle != null)
            Text('Focus: ${adventure.currentObjectiveTitle}'),
          const SizedBox(height: 8),
          _ActionStatusPill(adventure.actionStatus),
          if (adventure.environment?.summary != null)
            Text('Environment: ${adventure.environment!.summary}'),
          if (adventure.visibleNpcPreview.isNotEmpty)
            Text(
                'Nearby: ${adventure.visibleNpcPreview.map((npc) => npc.displayName).join(', ')}'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                  onPressed: onContinue,
                  child: const Text('Continue Adventure')),
              OutlinedButton(
                onPressed: onScene,
                child: const Text('View Scene'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CharacterSummaryCard extends StatelessWidget {
  const _CharacterSummaryCard({required this.count, required this.onOpen});

  final int count;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Characters',
      action: TextButton(onPressed: onOpen, child: const Text('View')),
      child: Text(count == 0
          ? 'No characters yet.'
          : '$count character${count == 1 ? '' : 's'} ready.'),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({
    required this.smsMode,
    required this.smsEnabled,
    required this.onOpen,
  });

  final String smsMode;
  final bool smsEnabled;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Settings',
      action: TextButton(onPressed: onOpen, child: const Text('Manage')),
      child: Text(
        smsEnabled
            ? 'SMS mode: $smsMode'
            : 'SMS mode: Disabled. Phone number is optional and not required for web play.',
      ),
    );
  }
}

class _ActionStatusPill extends StatelessWidget {
  const _ActionStatusPill(this.status);

  final DashboardActionStatus status;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Chip(
        label: Text(status.label),
      ),
    );
  }
}

class _DashboardTile extends StatelessWidget {
  const _DashboardTile({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: MediaQuery.of(context).size.width < 720 ? double.infinity : 520,
      child: child,
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: 'Could not load dashboard',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}
