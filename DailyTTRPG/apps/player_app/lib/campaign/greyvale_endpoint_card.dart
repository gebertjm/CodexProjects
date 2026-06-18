import 'package:flutter/material.dart';

import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

class GreyvaleEndpointCard extends StatelessWidget {
  const GreyvaleEndpointCard({
    required this.endpoint,
    this.onOpenScene,
    this.onOpenHistory,
    this.onOpenKnowledge,
    this.onCampaignOverview,
    super.key,
  });

  final GreyvaleSliceEndpointStatus endpoint;
  final VoidCallback? onOpenScene;
  final VoidCallback? onOpenHistory;
  final VoidCallback? onOpenKnowledge;
  final VoidCallback? onCampaignOverview;

  @override
  Widget build(BuildContext context) {
    final headline = endpoint.headline?.trim();
    final message = endpoint.message?.trim();
    final latestDevelopment = endpoint.latestDevelopment?.trim();
    final currentStatus = endpoint.currentStatus?.trim();
    final nextStep = endpoint.nextStep?.trim();

    return InfoCard(
      title: endpoint.label,
      action: const Chip(label: Text('Awaiting support')),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (headline != null && headline.isNotEmpty)
            Text(headline, style: Theme.of(context).textTheme.titleMedium),
          if (message != null && message.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(message),
          ],
          if (latestDevelopment != null && latestDevelopment.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Latest Development',
                style: Theme.of(context).textTheme.labelLarge),
            Text(latestDevelopment),
          ],
          if (currentStatus != null && currentStatus.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Current Status',
                style: Theme.of(context).textTheme.labelLarge),
            Text(currentStatus),
          ],
          if (nextStep != null && nextStep.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Next Step', style: Theme.of(context).textTheme.labelLarge),
            Text(nextStep),
          ],
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (onOpenScene != null)
                FilledButton(
                  onPressed: onOpenScene,
                  child: const Text('Review Current Scene'),
                ),
              if (onOpenHistory != null)
                OutlinedButton(
                  onPressed: onOpenHistory,
                  child: const Text('History'),
                ),
              if (onOpenKnowledge != null)
                OutlinedButton(
                  onPressed: onOpenKnowledge,
                  child: const Text('Knowledge'),
                ),
              if (onCampaignOverview != null)
                OutlinedButton(
                  onPressed: onCampaignOverview,
                  child: const Text('Campaign Overview'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
