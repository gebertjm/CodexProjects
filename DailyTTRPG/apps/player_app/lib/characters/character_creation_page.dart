import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

const _abilities = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma'
];
const _abilityLabels = {
  'strength': 'STR',
  'dexterity': 'DEX',
  'constitution': 'CON',
  'intelligence': 'INT',
  'wisdom': 'WIS',
  'charisma': 'CHA',
};

class CharacterCreationPage extends StatefulWidget {
  const CharacterCreationPage({
    required this.characterCreationApi,
    required this.characterManagementApi,
    required this.onBack,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final CharacterCreationApi characterCreationApi;
  final CharacterManagementApi characterManagementApi;
  final VoidCallback onBack;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<CharacterCreationPage> createState() => _CharacterCreationPageState();
}

class _CharacterCreationPageState extends State<CharacterCreationPage> {
  late Future<_CreationBootstrap> _bootstrap;
  final TextEditingController _nameController = TextEditingController();

  CharacterCreationOptions? _options;
  String? _draftId;
  String? _mode;
  String? _archetypeId;
  String? _speciesId;
  String? _subraceId;
  String? _classId;
  String? _attributePresetId;
  String? _backgroundId;
  String? _traitId;
  bool _defaultsAcknowledged = false;
  int _stepIndex = 0;
  bool _saving = false;
  String? _error;
  CreatedCharacterResult? _created;
  final Map<String, int?> _abilityScores = {
    for (final ability in _abilities) ability: null,
  };

  @override
  void initState() {
    super.initState();
    _bootstrap = _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<_CreationBootstrap> _load() async {
    final options = await widget.characterCreationApi.getOptions();
    final draft = await widget.characterCreationApi.getDraft();
    _options = options;
    if (draft != null) {
      _hydrateDraft(draft);
    }
    return _CreationBootstrap(options: options, draft: draft);
  }

  void _hydrateDraft(CharacterCreationDraft draft) {
    _draftId = draft.draftId;
    _mode = draft.mode ?? draft.draft['mode']?.toString();
    _nameController.text = draft.draft['name']?.toString() ?? '';
    _archetypeId = draft.draft['archetype_id']?.toString();
    _speciesId = draft.draft['species_id']?.toString() ??
        draft.draft['race_id']?.toString();
    _subraceId = draft.draft['subrace_id']?.toString();
    _classId = draft.draft['class_id']?.toString();
    _attributePresetId = draft.draft['attribute_preset_id']?.toString();
    _backgroundId = draft.draft['background_id']?.toString();
    _traitId = draft.draft['trait_id']?.toString();
    _defaultsAcknowledged = draft.draft['defaults_acknowledged'] == true;
    final scores = draft.draft['ability_scores'];
    if (scores is Map<String, dynamic>) {
      for (final ability in _abilities) {
        final score = scores[ability];
        _abilityScores[ability] = score is num ? score.toInt() : null;
      }
    }
    _stepIndex = _stepsFor(_mode).indexOf(draft.currentStep);
    if (_stepIndex < 0) {
      _stepIndex = 0;
    }
  }

  List<String> _stepsFor(String? mode) {
    return switch (mode) {
      'quick_start' => const ['name', 'archetype', 'review'],
      'guided' => const [
          'name',
          'species',
          'subrace',
          'class',
          'attributes',
          'background',
          'trait',
          'defaults',
          'review',
        ],
      'detailed' => const [
          'name',
          'species',
          'subrace',
          'class',
          'standard_array',
          'background',
          'trait',
          'defaults',
          'review',
        ],
      _ => const ['mode'],
    };
  }

  String get _currentStep {
    final steps = _stepsFor(_mode);
    final index = _stepIndex.clamp(0, steps.length - 1).toInt();
    return steps[index];
  }

  SpeciesOption? get _selectedSpecies {
    final options = _options;
    if (options == null || _speciesId == null) {
      return null;
    }
    for (final species in options.species) {
      if (species.id == _speciesId) {
        return species;
      }
    }
    return null;
  }

  Map<String, dynamic> _draftPayload({String? step}) {
    return {
      'mode': _mode,
      'current_step': step ?? _currentStep,
      'draft': {
        'mode': _mode,
        'name': _nameController.text.trim(),
        'archetype_id': _archetypeId,
        'species_id': _speciesId,
        'race_id': _speciesId,
        'subrace_id': _subraceId,
        'class_id': _classId,
        'attribute_preset_id': _attributePresetId,
        'background_id': _backgroundId,
        'trait_id': _traitId,
        'ability_scores':
            _abilityScores.map((key, value) => MapEntry(key, value)),
        'defaults_acknowledged': _defaultsAcknowledged,
      },
    };
  }

  Map<String, dynamic> _finalPayload() {
    final payload = Map<String, dynamic>.from(
        _draftPayload(step: 'review')['draft'] as Map<String, dynamic>);
    payload.removeWhere((_, value) => value == null || value == '');
    return {
      if (_draftId != null) 'draft_id': _draftId,
      ...payload,
    };
  }

  Future<void> _persist({String? step}) async {
    if (_mode == null) {
      return;
    }
    final payload = _draftPayload(step: step);
    final draft = _draftId == null
        ? await widget.characterCreationApi.saveDraft(payload)
        : await widget.characterCreationApi.patchDraft(_draftId!, payload);
    _draftId = draft.draftId;
  }

  String? _validateCurrentStep() {
    final step = _currentStep;
    if (step == 'name' && _nameController.text.trim().length < 2) {
      return 'Choose a character name with at least two characters.';
    }
    if (step == 'archetype' && _archetypeId == null) {
      return 'Choose a Quick Start archetype.';
    }
    if (step == 'species' && _speciesId == null) {
      return 'Choose a species before choosing a class.';
    }
    if (step == 'subrace' &&
        (_selectedSpecies?.subraces.isNotEmpty ?? false) &&
        _subraceId == null) {
      return 'Choose a lineage for this species.';
    }
    if (step == 'class' && _classId == null) {
      return 'Choose a class.';
    }
    if (step == 'attributes' && _attributePresetId == null) {
      return 'Choose an attribute style.';
    }
    if (step == 'standard_array' &&
        _abilityScores.values.any((value) => value == null)) {
      return 'Assign every Standard Array score before continuing.';
    }
    if (step == 'background' && _backgroundId == null) {
      return 'Choose a background.';
    }
    if (step == 'trait' && _traitId == null) {
      return 'Choose a trait.';
    }
    if (step == 'defaults' && !_defaultsAcknowledged) {
      return 'Acknowledge the recommended defaults for this MVP.';
    }
    return null;
  }

  Future<void> _next() async {
    final validation = _validateCurrentStep();
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final steps = _stepsFor(_mode);
      final nextIndex = (_stepIndex + 1).clamp(0, steps.length - 1).toInt();
      await _persist(step: steps[nextIndex]);
      setState(() => _stepIndex = nextIndex);
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  void _backStep() {
    if (_stepIndex == 0) {
      setState(() => _mode = null);
      return;
    }
    setState(() => _stepIndex -= 1);
  }

  Future<void> _startMode(String mode) async {
    setState(() {
      _mode = mode;
      _stepIndex = 0;
      _error = null;
    });
    await _persist(step: 'name');
  }

  Future<void> _startOver() async {
    final draftId = _draftId;
    if (draftId != null) {
      await widget.characterCreationApi.abandonDraft(draftId);
    }
    setState(() {
      _draftId = null;
      _mode = null;
      _stepIndex = 0;
      _created = null;
      _error = null;
      _nameController.clear();
      _archetypeId = null;
      _speciesId = null;
      _subraceId = null;
      _classId = null;
      _attributePresetId = null;
      _backgroundId = null;
      _traitId = null;
      _defaultsAcknowledged = false;
      for (final ability in _abilities) {
        _abilityScores[ability] = null;
      }
    });
  }

  Future<void> _create() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final result =
          await widget.characterCreationApi.createCharacter(_finalPayload());
      setState(() => _created = result);
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _startAdventure() async {
    widget.navigate('/play');
  }

  Future<bool> _confirmActiveSwitchIfNeeded(CharacterSummary target) async {
    final result = await widget.characterManagementApi.getCharacters();
    final currentActive =
        _firstOrNull(result.characters.where((entry) => entry.isActive));
    if (currentActive == null ||
        currentActive.characterId == target.characterId ||
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

  Future<void> _setCreatedCharacterActive() async {
    final result = _created;
    if (result == null) {
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final confirmed = await _confirmActiveSwitchIfNeeded(result.character);
      if (!confirmed) {
        return;
      }

      await widget.characterManagementApi
          .setActiveCharacter(result.character.characterId);
      widget.navigate('/play');
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Create Character',
      actions: [
        TextButton(onPressed: widget.onBack, child: const Text('Dashboard')),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<_CreationBootstrap>(
        future: _bootstrap,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorCard(
                message: snapshot.error.toString(),
                onRetry: () {
                  setState(() => _bootstrap = _load());
                });
          }
          if (_created != null) {
            return _successView();
          }
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Build a hero for a living campaign.',
                    style: Theme.of(context).textTheme.displaySmall),
                const SizedBox(height: 8),
                const Text(
                    'Web creation uses your Firebase-backed account. No phone number or SMS setup is required.'),
                const SizedBox(height: 20),
                if (_error != null) _ErrorBanner(_error!),
                if (_mode == null) _modeSelection() else _stepCard(),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _modeSelection() {
    final options = _options!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_draftId != null)
          InfoCard(
            title: 'Resume Draft',
            action: TextButton(
              onPressed: () => setState(() => _mode ??= 'quick_start'),
              child: const Text('Resume'),
            ),
            child: const Text(
                'A saved character draft is available on this account.'),
          ),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: options.modes.map((mode) {
            final isDetailed = mode.id == 'detailed';
            return SizedBox(
              width: MediaQuery.of(context).size.width < 720
                  ? double.infinity
                  : 340,
              child: InfoCard(
                title: mode.label,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(mode.description ?? ''),
                    if (isDetailed) ...const [
                      SizedBox(height: 8),
                      Text(
                          'Standard Array is ready now. Skills, equipment, spells, and feature choices use recommended defaults.'),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _saving ? null : () => _startMode(mode.id),
                      child: Text(mode.id == 'quick_start'
                          ? 'Start Quick'
                          : mode.id == 'guided'
                              ? 'Start Guided'
                              : 'Start Detailed'),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _stepCard() {
    return InfoCard(
      title: _stepTitle(_currentStep),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _stepBody(),
          const SizedBox(height: 20),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              OutlinedButton(
                  onPressed: _saving ? null : _backStep,
                  child: const Text('Back')),
              TextButton(
                  onPressed: _saving ? null : _startOver,
                  child: const Text('Start Over')),
              if (_currentStep == 'review')
                FilledButton(
                  onPressed: _saving ? null : _create,
                  child: Text(_saving ? 'Creating...' : 'Create Character'),
                )
              else
                FilledButton(
                  onPressed: _saving ? null : _next,
                  child: Text(_saving ? 'Saving...' : 'Next'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  String _stepTitle(String step) {
    return switch (step) {
      'name' => 'Name',
      'archetype' => 'Choose Archetype',
      'species' => 'Choose Species',
      'subrace' => 'Choose Lineage',
      'class' => 'Choose Class',
      'attributes' => 'Choose Attribute Style',
      'standard_array' => 'Assign Standard Array',
      'background' => 'Choose Background',
      'trait' => 'Choose Trait',
      'defaults' => 'Recommended Defaults',
      'review' => 'Review Character',
      _ => 'Create Character',
    };
  }

  Widget _stepBody() {
    final options = _options!;
    return switch (_currentStep) {
      'name' => _nameStep(),
      'archetype' => _choiceList(
          choices: options.archetypes,
          selectedId: _archetypeId,
          onChanged: (value) => setState(() => _archetypeId = value),
        ),
      'species' => _choiceList(
          choices: options.species,
          selectedId: _speciesId,
          onChanged: (value) => setState(() {
            _speciesId = value;
            _subraceId = null;
          }),
        ),
      'subrace' => _subraceStep(),
      'class' => _choiceList(
          choices: options.classes
              .where((entry) => entry.extra['supported_in_creation'] == true)
              .toList(),
          selectedId: _classId,
          onChanged: (value) => setState(() {
            _classId = value;
            _attributePresetId ??= _recommendedPresetForClass(value);
          }),
        ),
      'attributes' => _choiceList(
          choices: options.attributePresets,
          selectedId: _attributePresetId,
          onChanged: (value) => setState(() => _attributePresetId = value),
        ),
      'standard_array' => _standardArrayStep(),
      'background' => _choiceList(
          choices: options.backgrounds,
          selectedId: _backgroundId,
          onChanged: (value) => setState(() => _backgroundId = value),
        ),
      'trait' => _choiceList(
          choices: options.traits,
          selectedId: _traitId,
          onChanged: (value) => setState(() => _traitId = value),
        ),
      'defaults' => _defaultsStep(),
      'review' => _reviewStep(),
      _ => const SizedBox.shrink(),
    };
  }

  Widget _nameStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
            'Give your character a name. Backend validation is authoritative, so keep it readable and campaign-safe.'),
        const SizedBox(height: 12),
        TextField(
          controller: _nameController,
          decoration: const InputDecoration(
            labelText: 'Character name',
            border: OutlineInputBorder(),
          ),
        ),
      ],
    );
  }

  Widget _choiceList({
    required List<CharacterCreationChoice> choices,
    required String? selectedId,
    required ValueChanged<String> onChanged,
  }) {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: choices.map((choice) {
        final selected = selectedId == choice.id;
        return SizedBox(
          width:
              MediaQuery.of(context).size.width < 720 ? double.infinity : 320,
          child: ChoiceChip(
            selected: selected,
            label: SizedBox(
              width: 260,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(choice.label,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  if (choice.description != null)
                    Text(choice.description!,
                        maxLines: 3, overflow: TextOverflow.ellipsis),
                  if (choice.extra['mechanical_summary'] != null)
                    Text(choice.extra['mechanical_summary'].toString(),
                        style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            onSelected: (_) => onChanged(choice.id),
          ),
        );
      }).toList(),
    );
  }

  Widget _subraceStep() {
    final species = _selectedSpecies;
    if (species == null) {
      return const Text('Choose a species first.');
    }
    if (species.subraces.isEmpty) {
      return Text(
          '${species.label} has no required lineage choice in this MVP. Continue when ready.');
    }
    return _choiceList(
      choices: species.subraces,
      selectedId: _subraceId,
      onChanged: (value) => setState(() => _subraceId = value),
    );
  }

  Widget _standardArrayStep() {
    Set<int> usedByOthers(String ability) {
      return _abilityScores.entries
          .where((entry) => entry.key != ability)
          .map((entry) => entry.value)
          .whereType<int>()
          .toSet();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
            'Assign each Standard Array value exactly once. Full point-buy and rolled stats are planned for 6B.1D.'),
        const SizedBox(height: 12),
        ..._abilities.map((ability) {
          final current = _abilityScores[ability];
          final unavailable = usedByOthers(ability);
          final values = _options!.standardArray
              .where(
                  (score) => !unavailable.contains(score) || score == current)
              .toList();
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: DropdownButtonFormField<int>(
              initialValue: current,
              decoration: InputDecoration(
                labelText: _abilityLabels[ability],
                border: const OutlineInputBorder(),
              ),
              items: values
                  .map((score) => DropdownMenuItem(
                      value: score, child: Text(score.toString())))
                  .toList(),
              onChanged: (value) =>
                  setState(() => _abilityScores[ability] = value),
            ),
          );
        }),
      ],
    );
  }

  Widget _defaultsStep() {
    return CheckboxListTile(
      value: _defaultsAcknowledged,
      onChanged: (value) =>
          setState(() => _defaultsAcknowledged = value == true),
      title: const Text('Use recommended MVP defaults'),
      subtitle: const Text(
        'Detailed creation is being expanded. For this version, skill proficiencies, equipment, languages, spells, and class-specific feature choices use recommended defaults. Full granular choices are planned for 6B.1D.',
      ),
    );
  }

  Widget _reviewStep() {
    final selectedClass = _labelFor(_options!.classes, _classId);
    final selectedSpecies = _labelFor(_options!.species, _speciesId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ReviewLine(label: 'Name', value: _nameController.text.trim()),
        _ReviewLine(label: 'Mode', value: _mode ?? 'Unknown'),
        if (_archetypeId != null)
          _ReviewLine(
              label: 'Archetype',
              value: _labelFor(_options!.archetypes, _archetypeId)),
        _ReviewLine(label: 'Species', value: selectedSpecies),
        if (_subraceId != null)
          _ReviewLine(
              label: 'Lineage',
              value: _labelFor(_selectedSpecies?.subraces ?? [], _subraceId)),
        _ReviewLine(label: 'Class', value: selectedClass),
        _ReviewLine(
            label: 'Attributes',
            value: _mode == 'detailed'
                ? _abilityScores.toString()
                : _labelFor(_options!.attributePresets, _attributePresetId)),
        _ReviewLine(
            label: 'Background',
            value: _labelFor(_options!.backgrounds, _backgroundId)),
        _ReviewLine(
            label: 'Trait', value: _labelFor(_options!.traits, _traitId)),
        const Divider(height: 28),
        const Text(
            'Defaults used: recommended skills, languages, equipment, and spells where needed.'),
      ],
    );
  }

  String _labelFor(List<CharacterCreationChoice> choices, String? id) {
    if (id == null) {
      return 'Not selected';
    }
    for (final choice in choices) {
      if (choice.id == id) {
        return choice.label;
      }
    }
    return id;
  }

  String? _recommendedPresetForClass(String? classId) {
    String? slug;
    for (final entry
        in _options?.classes ?? const <CharacterCreationChoice>[]) {
      if (entry.id == classId) {
        slug = entry.slug;
        break;
      }
    }
    return switch (slug) {
      'barbarian' || 'fighter' || 'paladin' => 'strong_durable',
      'rogue' || 'ranger' || 'monk' => 'quick_precise',
      'cleric' || 'druid' => 'wise_resilient',
      'wizard' => 'intelligent_careful',
      'bard' || 'sorcerer' || 'warlock' => 'charismatic_bold',
      _ => 'balanced',
    };
  }

  Widget _successView() {
    final result = _created!;
    return Center(
      child: InfoCard(
        title: result.activeCharacterChanged
            ? 'Character created and set active'
            : 'Character created',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${result.character.name} is ready to play.'),
            Text(
                'Level ${result.character.level} ${result.character.species ?? ''} ${result.character.characterClass ?? ''}'),
            if (_error != null) ...[
              const SizedBox(height: 12),
              _ErrorBanner(_error!),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                if (result.canStartAdventure)
                  FilledButton(
                    onPressed: _saving ? null : _startAdventure,
                    child: const Text('Go to Start Adventure'),
                  ),
                if (result.canSetActive)
                  FilledButton.tonal(
                    onPressed: _saving ? null : _setCreatedCharacterActive,
                    child: const Text('Set as Active Character'),
                  ),
                OutlinedButton(
                    onPressed: () => widget.navigate('/play'),
                    child: const Text('Dashboard')),
                TextButton(
                    onPressed: _startOver, child: const Text('Create Another')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CreationBootstrap {
  const _CreationBootstrap({required this.options, required this.draft});

  final CharacterCreationOptions options;
  final CharacterCreationDraft? draft;
}

class _ReviewLine extends StatelessWidget {
  const _ReviewLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text('$label: $value'),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Text(message),
      ),
    );
  }
}

T? _firstOrNull<T>(Iterable<T> values) {
  for (final value in values) {
    return value;
  }
  return null;
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: 'Could not load character creation',
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
