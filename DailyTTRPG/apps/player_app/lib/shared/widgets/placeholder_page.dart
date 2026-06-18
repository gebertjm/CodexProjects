import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import 'app_scaffold.dart';

class PlaceholderPage extends StatelessWidget {
  const PlaceholderPage({
    required this.title,
    required this.message,
    required this.accountApi,
    required this.onBack,
    required this.onSignOut,
    super.key,
  });

  final String title;
  final String message;
  final AccountApi accountApi;
  final VoidCallback onBack;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: title,
      actions: [
        TextButton(onPressed: onBack, child: const Text('Dashboard')),
        TextButton(onPressed: onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder(
        future: accountApi.getPlayerState(),
        builder: (context, snapshot) {
          return Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 12),
                    Text(message),
                    const SizedBox(height: 20),
                    if (snapshot.connectionState != ConnectionState.done)
                      const LinearProgressIndicator()
                    else if (snapshot.hasError)
                      Text('Could not load player state: ${snapshot.error}')
                    else
                      const Text(
                          'Player state is connected. Full UI arrives in the next app stage.'),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
