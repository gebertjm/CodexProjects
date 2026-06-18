import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

class CharacterListPage extends StatefulWidget {
  const CharacterListPage({
    required this.characterManagementApi,
    required this.characterCreationApi,
    required this.onBack,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final CharacterManagementApi characterManagementApi;
  final CharacterCreationApi characterCreationApi;
  final VoidCallback onBack;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<CharacterListPage> createState() => _CharacterListPageState();
}

class _CharacterListPageState extends State<CharacterListPage> {
  late Future<CharacterListResult> _characters;

  @override
  void initState() {
    super.initState();
    _characters = widget.characterManagementApi.getCharacters();
  }

  void _reload() {
    setState(() {
      _characters = widget.characterManagementApi.getCharacters();
    });
  }

  Future<bool> _confirmSwitchIfNeeded(
      CharacterSummary? currentActive, CharacterSummary target) async {
    if (currentActive == null ||
        currentActive.characterId == target.characterId ||
        currentActive.pendingAction?.hasPendingUnresolvedAction != true) {
      return true;
    }

    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Switch active character?'),
            content: Text(
              'You have an unresolved action with ${currentActive.name}. Switching active characters will not cancel it, but you may miss updates for that character.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Switch Anyway'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _setActive(
      CharacterListResult result, CharacterSummary character) async {
    final currentActive =
        _firstOrNull(result.characters.where((entry) => entry.isActive));
    final confirmed = await _confirmSwitchIfNeeded(currentActive, character);
    if (!confirmed || !mounted) {
      return;
    }

    try {
      await widget.characterManagementApi
          .setActiveCharacter(character.characterId);
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('${character.name} is now your active character.')),
      );
      _reload();
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Characters',
      actions: [
        IconButton(
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh'),
        TextButton(onPressed: widget.onBack, child: const Text('Dashboard')),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<CharacterListResult>(
        future: _characters,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _PageError(
              title: 'Could not load characters',
              message: snapshot.error.toString(),
              onRetry: _reload,
            );
          }

          final result = snapshot.requireData;
          if (result.characters.isEmpty) {
            return _EmptyCharacters(
                onCreate: () => widget.navigate('/play/create-character'));
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('Your Characters',
                          style: Theme.of(context).textTheme.displaySmall),
                    ),
                    FilledButton.icon(
                      onPressed: () =>
                          widget.navigate('/play/create-character'),
                      icon: const Icon(Icons.add),
                      label: const Text('Create Character'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                    'Choose who you want to play, inspect a practical sheet, or continue an adventure.'),
                const SizedBox(height: 20),
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    for (final character in result.characters)
                      _CharacterCard(
                        character: character,
                        onView: () => widget.navigate(
                            '/play/characters/${character.characterId}'),
                        onSetActive: character.isActive
                            ? null
                            : () => _setActive(result, character),
                        onContinue: character.currentCampaign == null
                            ? null
                            : () => widget.navigate('/play/campaign'),
                        onStart: character.currentCampaign == null &&
                                character.isActive
                            ? () => widget.navigate('/play')
                            : null,
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

class CharacterSheetPage extends StatefulWidget {
  const CharacterSheetPage({
    required this.characterId,
    required this.characterManagementApi,
    required this.characterCreationApi,
    required this.onBack,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final String characterId;
  final CharacterManagementApi characterManagementApi;
  final CharacterCreationApi characterCreationApi;
  final VoidCallback onBack;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<CharacterSheetPage> createState() => _CharacterSheetPageState();
}

class _CharacterSheetPageState extends State<CharacterSheetPage> {
  late Future<CharacterSheet> _sheet;

  @override
  void initState() {
    super.initState();
    _sheet =
        widget.characterManagementApi.getCharacterSheet(widget.characterId);
  }

  void _reload() {
    setState(() {
      _sheet =
          widget.characterManagementApi.getCharacterSheet(widget.characterId);
    });
  }

  Future<bool> _confirmSwitchIfNeeded(CharacterSheet sheet) async {
    final result = await widget.characterManagementApi.getCharacters();
    final currentActive =
        _firstOrNull(result.characters.where((entry) => entry.isActive));
    if (currentActive == null ||
        currentActive.characterId == sheet.character.characterId ||
        currentActive.pendingAction?.hasPendingUnresolvedAction != true) {
      return true;
    }

    if (!mounted) {
      return false;
    }

    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Switch active character?'),
            content: Text(
              'You have an unresolved action with ${currentActive.name}. Switching active characters will not cancel it, but you may miss updates for that character.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Switch Anyway'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _setActive(CharacterSheet sheet) async {
    final confirmed = await _confirmSwitchIfNeeded(sheet);
    if (!confirmed || !mounted) {
      return;
    }
    try {
      await widget.characterManagementApi
          .setActiveCharacter(sheet.character.characterId);
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content:
                Text('${sheet.character.name} is now your active character.')),
      );
      _reload();
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Character Sheet',
      actions: [
        IconButton(
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh'),
        TextButton(onPressed: widget.onBack, child: const Text('Characters')),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<CharacterSheet>(
        future: _sheet,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _PageError(
              title: 'Could not load character sheet',
              message: snapshot.error.toString(),
              onRetry: _reload,
            );
          }

          final sheet = snapshot.requireData;
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _OverviewSection(
                  sheet: sheet,
                  onSetActive:
                      sheet.character.isActive ? null : () => _setActive(sheet),
                  onStart:
                      sheet.currentAdventure == null && sheet.character.isActive
                          ? () => widget.navigate('/play')
                          : null,
                  onContinue: sheet.currentAdventure == null
                      ? null
                      : () => widget.navigate('/play/campaign'),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    _SheetTile(
                        child: _AbilityScoresSection(sheet.abilityScores)),
                    _SheetTile(child: _CombatSection(sheet.combat)),
                    _SheetTile(
                        child: _ProficienciesSection(sheet.proficiencies)),
                    _SheetTile(child: _EquipmentSection(sheet.equipment)),
                    _SheetTile(child: _SpellsSection(sheet.spells)),
                    _SheetTile(
                        child: _KnowledgeSection(sheet.knowledgePreview)),
                  ],
                ),
                const SizedBox(height: 16),
                _FeaturesSection(sheet.features),
                const SizedBox(height: 16),
                _FutureManagementNotice(limitations: sheet.limitations),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _EmptyCharacters extends StatelessWidget {
  const _EmptyCharacters({required this.onCreate});

  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: 'No characters yet',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
                'Create your first character to begin a persistent DailyTTRPG adventure.'),
            const SizedBox(height: 16),
            FilledButton(
                onPressed: onCreate, child: const Text('Create Character')),
          ],
        ),
      ),
    );
  }
}

class _CharacterCard extends StatelessWidget {
  const _CharacterCard({
    required this.character,
    required this.onView,
    this.onSetActive,
    this.onContinue,
    this.onStart,
  });

  final CharacterSummary character;
  final VoidCallback onView;
  final VoidCallback? onSetActive;
  final VoidCallback? onContinue;
  final VoidCallback? onStart;

  @override
  Widget build(BuildContext context) {
    final campaign = character.currentCampaign;
    final actionLabel = character.pendingAction?.label ?? 'No current action';
    return SizedBox(
      width: MediaQuery.of(context).size.width < 720 ? double.infinity : 520,
      child: InfoCard(
        title: character.name,
        action: character.isActive ? const Chip(label: Text('Active')) : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Level ${character.level} ${character.species ?? ''} ${character.characterClass ?? ''}'),
            Text('Status: ${character.status}'),
            if (character.background != null)
              Text('Background: ${character.background}'),
            const SizedBox(height: 12),
            Text(campaign == null
                ? 'No active adventure.'
                : '${campaign.campaignName} - ${campaign.currentLocationName ?? 'No location set'}'),
            Text(actionLabel),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton(
                    onPressed: onView, child: const Text('View Character')),
                if (onSetActive != null)
                  OutlinedButton(
                      onPressed: onSetActive, child: const Text('Set Active')),
                if (onContinue != null)
                  OutlinedButton(
                      onPressed: onContinue, child: const Text('Continue')),
                if (onStart != null)
                  OutlinedButton(
                      onPressed: onStart, child: const Text('Start Adventure')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OverviewSection extends StatelessWidget {
  const _OverviewSection({
    required this.sheet,
    this.onSetActive,
    this.onStart,
    this.onContinue,
  });

  final CharacterSheet sheet;
  final VoidCallback? onSetActive;
  final VoidCallback? onStart;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    final character = sheet.character;
    final adventure = sheet.currentAdventure;
    return InfoCard(
      title: character.name,
      action: character.isActive ? const Chip(label: Text('Active')) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Level ${character.level} ${character.subrace ?? character.species ?? ''} ${character.characterClass ?? ''}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Text('Background: ${character.background ?? 'Unknown'}'),
          Text('Trait: ${character.trait ?? 'None recorded'}'),
          const SizedBox(height: 12),
          Text(adventure == null
              ? 'No active adventure yet.'
              : '${adventure.campaignName} - ${adventure.currentLocationName ?? adventure.currentSceneName ?? 'No location set'}'),
          if (adventure?.currentObjectiveTitle != null)
            Text('Focus: ${adventure!.currentObjectiveTitle}'),
          Text(sheet.pendingAction?.label ?? 'No current action'),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (onSetActive != null)
                FilledButton(
                    onPressed: onSetActive, child: const Text('Set Active')),
              if (onStart != null)
                FilledButton(
                    onPressed: onStart, child: const Text('Start Adventure')),
              if (onContinue != null)
                FilledButton(
                    onPressed: onContinue,
                    child: const Text('Continue Adventure')),
            ],
          ),
        ],
      ),
    );
  }
}

class _AbilityScoresSection extends StatelessWidget {
  const _AbilityScoresSection(this.scores);

  final Map<String, AbilityScoreView> scores;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Ability Scores',
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final entry in scores.entries)
            Chip(
              label: Text(
                '${entry.key.toUpperCase()} ${entry.value.score} (${entry.value.formattedModifier})${entry.value.saveProficient ? ' save' : ''}',
              ),
            ),
        ],
      ),
    );
  }
}

class _CombatSection extends StatelessWidget {
  const _CombatSection(this.combat);

  final CombatBasics combat;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Combat Basics',
      child: _KeyValueList(
        entries: {
          'AC': '${combat.armorClass}',
          'HP':
              '${combat.currentHp}/${combat.maxHp}${combat.temporaryHp > 0 ? ' +${combat.temporaryHp}' : ''}',
          'Hit Dice': combat.hitDice ?? 'Not recorded',
          'Initiative': combat.initiative >= 0
              ? '+${combat.initiative}'
              : '${combat.initiative}',
          'Speed': '${combat.speed} ft.',
          'Proficiency': '+${combat.proficiencyBonus}',
          'Passive Perception': '${combat.passivePerception}',
          'Conditions':
              combat.conditions.isEmpty ? 'None' : combat.conditions.join(', '),
        },
      ),
    );
  }
}

class _ProficienciesSection extends StatelessWidget {
  const _ProficienciesSection(this.proficiencies);

  final CharacterProficiencies proficiencies;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Proficiencies',
      child: _KeyValueList(
        entries: {
          'Skills': _joinOrNone(proficiencies.skills),
          'Saving Throws': _joinOrNone(proficiencies.savingThrows),
          'Languages': _joinOrNone(proficiencies.languages),
          'Weapons': _joinOrNone(proficiencies.weapons),
          'Armor': _joinOrNone(proficiencies.armor),
          'Tools': _joinOrNone(proficiencies.tools),
        },
      ),
    );
  }
}

class _EquipmentSection extends StatelessWidget {
  const _EquipmentSection(this.equipment);

  final EquipmentSummary equipment;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Equipment',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(equipment.summary),
          if (equipment.defaultsApplied)
            const Text('Recommended defaults were applied.'),
          if (equipment.equipped.isNotEmpty)
            Text('Equipped: ${equipment.equipped.join(', ')}'),
        ],
      ),
    );
  }
}

class _SpellsSection extends StatelessWidget {
  const _SpellsSection(this.spells);

  final SpellSummary spells;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Spells',
      child: spells.isSpellcaster
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Ability: ${spells.spellcastingAbility ?? 'Unknown'}'),
                Text('Save DC: ${spells.spellSaveDc ?? '-'}'),
                Text(
                    'Attack bonus: ${spells.spellAttackBonus == null ? '-' : '+${spells.spellAttackBonus}'}'),
                Text('Cantrips: ${_joinOrNone(spells.cantrips)}'),
                Text('1st level: ${_joinOrNone(spells.levelOneSpells)}'),
                if (spells.defaultsApplied)
                  const Text('Recommended spell defaults were applied.'),
              ],
            )
          : const Text('This character has no spellcasting recorded yet.'),
    );
  }
}

class _KnowledgeSection extends StatelessWidget {
  const _KnowledgeSection(this.preview);

  final KnowledgePreview preview;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Knowledge Preview',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Known clues: ${preview.knownClueCount}'),
          if (preview.recentFacts.isEmpty)
            const Text('No known facts recorded for this character yet.')
          else
            ...preview.recentFacts.map((fact) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text('- $fact'),
                )),
          const SizedBox(height: 8),
          const Text('Full journal and knowledge view coming in 6B.6.'),
        ],
      ),
    );
  }
}

class _FeaturesSection extends StatelessWidget {
  const _FeaturesSection(this.features);

  final List<CharacterFeatureSummary> features;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Features',
      child: features.isEmpty
          ? const Text('No features are recorded yet.')
          : Column(
              children: [
                for (final feature in features.take(12))
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text(feature.name),
                    subtitle: Text(feature.sourceLabel),
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(feature.summary.isEmpty
                            ? 'No description recorded.'
                            : feature.summary),
                      ),
                    ],
                  ),
              ],
            ),
    );
  }
}

class _FutureManagementNotice extends StatelessWidget {
  const _FutureManagementNotice({required this.limitations});

  final Map<String, dynamic> limitations;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Coming Later',
      child: Text(
        'Full inventory, spell, resource, rest, condition, and detailed rules management are planned for ${limitations['full_detailed_sheet_deferred_to'] ?? '6B.2D'}. Full campaign knowledge and history are planned for ${limitations['full_knowledge_history_deferred_to'] ?? '6B.6'}.',
      ),
    );
  }
}

class _SheetTile extends StatelessWidget {
  const _SheetTile({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: MediaQuery.of(context).size.width < 720 ? double.infinity : 520,
      child: child,
    );
  }
}

class _KeyValueList extends StatelessWidget {
  const _KeyValueList({required this.entries});

  final Map<String, String> entries;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final entry in entries.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text('${entry.key}: ${entry.value}'),
          ),
      ],
    );
  }
}

class _PageError extends StatelessWidget {
  const _PageError({
    required this.title,
    required this.message,
    required this.onRetry,
  });

  final String title;
  final String message;
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
            FilledButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

String _joinOrNone(List<String> values) =>
    values.isEmpty ? 'None recorded' : values.join(', ');

T? _firstOrNull<T>(Iterable<T> values) {
  for (final value in values) {
    return value;
  }
  return null;
}
