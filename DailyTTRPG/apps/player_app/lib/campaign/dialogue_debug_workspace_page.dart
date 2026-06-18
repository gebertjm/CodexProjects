import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

typedef DialoguePathTestRunner = Future<Map<String, dynamic>> Function(
    String mode);

class DialogueDebugWorkspacePage extends StatefulWidget {
  const DialogueDebugWorkspacePage({
    required this.dashboardApi,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final PlayerDashboardApi dashboardApi;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<DialogueDebugWorkspacePage> createState() =>
      _DialogueDebugWorkspacePageState();
}

class _DialogueDebugWorkspacePageState
    extends State<DialogueDebugWorkspacePage> {
  late Future<DialogueDebugWorkspace> _workspace;
  String? _selectedInteractionId;
  String? _selectedFieldName;
  String? _selectedTurnId;
  String? _selectedAuditId;

  @override
  void initState() {
    super.initState();
    _workspace = widget.dashboardApi.getDialogueDebugWorkspace();
  }

  void _reload() {
    setState(() {
      _workspace = widget.dashboardApi.getDialogueDebugWorkspace();
    });
  }

  void _selectInteraction(String? interactionId) {
    setState(() => _selectedInteractionId = interactionId);
  }

  void _selectField(String? fieldName) {
    setState(() => _selectedFieldName = fieldName);
  }

  void _selectTurn(String? turnId) {
    setState(() => _selectedTurnId = turnId);
  }

  void _selectAudit(String? auditId) {
    setState(() => _selectedAuditId = auditId);
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Dialogue Debug Workspace',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Reload dialogue debug data',
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/dialogue'),
          child: const Text('Dialogue'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/scene'),
          child: const Text('Scene'),
        ),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<DialogueDebugWorkspace>(
        future: _workspace,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _DebugUnavailableCard(
              onRetry: _reload,
              onBack: () => widget.navigate('/play/campaign/dialogue'),
            );
          }

          final workspace = snapshot.requireData;
          return DialogueDebugWorkspaceView(
            workspace: workspace,
            runPathTest: (mode) {
              final sceneId =
                  workspace.sceneState['dialogue_scene_id']?.toString();
              return widget.dashboardApi.runDialoguePathTest(
                dialogueSceneId: sceneId ?? '',
                mode: mode,
              );
            },
            selectedInteractionId: _selectedInteractionId,
            selectedFieldName: _selectedFieldName,
            selectedTurnId: _selectedTurnId,
            selectedAuditId: _selectedAuditId,
            onSelectInteraction: _selectInteraction,
            onSelectField: _selectField,
            onSelectTurn: _selectTurn,
            onSelectAudit: _selectAudit,
          );
        },
      ),
    );
  }
}

class DialogueDebugWorkspaceView extends StatelessWidget {
  const DialogueDebugWorkspaceView({
    required this.workspace,
    this.selectedInteractionId,
    this.selectedFieldName,
    this.selectedTurnId,
    this.selectedAuditId,
    this.onSelectInteraction,
    this.onSelectField,
    this.onSelectTurn,
    this.onSelectAudit,
    this.runPathTest,
    super.key,
  });

  final DialogueDebugWorkspace workspace;
  final String? selectedInteractionId;
  final String? selectedFieldName;
  final String? selectedTurnId;
  final String? selectedAuditId;
  final ValueChanged<String?>? onSelectInteraction;
  final ValueChanged<String?>? onSelectField;
  final ValueChanged<String?>? onSelectTurn;
  final ValueChanged<String?>? onSelectAudit;
  final DialoguePathTestRunner? runPathTest;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SceneStatePanel(workspace: workspace),
          const SizedBox(height: 12),
          AvailabilityPanel(
            availability: workspace.availability,
            selectedInteractionId: selectedInteractionId,
            onSelectInteraction: onSelectInteraction,
          ),
          const SizedBox(height: 12),
          PreviewMappingPanel(
            previewMapping: workspace.previewMapping,
            selectedInteractionId: selectedInteractionId,
          ),
          const SizedBox(height: 12),
          RelationshipStatePanel(
            relationshipState: workspace.relationshipState,
            selectedFieldName: selectedFieldName,
            onSelectField: onSelectField,
            onSelectAudit: onSelectAudit,
          ),
          const SizedBox(height: 12),
          TranscriptPanel(
            transcript: workspace.transcript,
            selectedTurnId: selectedTurnId,
            selectedInteractionId: selectedInteractionId,
            onSelectTurn: onSelectTurn,
            onSelectInteraction: onSelectInteraction,
          ),
          const SizedBox(height: 12),
          AnnotationCorrectionChainPanel(
            data: workspace.annotationCorrectionChains,
          ),
          const SizedBox(height: 12),
          AuditTimelinePanel(
            records: workspace.auditTimeline,
            selectedAuditId: selectedAuditId,
            selectedInteractionId: selectedInteractionId,
            selectedFieldName: selectedFieldName,
            onSelectAudit: onSelectAudit,
            onSelectInteraction: onSelectInteraction,
            onSelectField: onSelectField,
          ),
          const SizedBox(height: 12),
          ValidationPanel(
            validation: workspace.validation,
            onSelectInteraction: onSelectInteraction,
            onSelectField: onSelectField,
          ),
          const SizedBox(height: 12),
          TestPathsPanel(
            testPaths: workspace.testPaths,
            onRunPathTest: runPathTest,
          ),
        ],
      ),
    );
  }
}

class SceneStatePanel extends StatelessWidget {
  const SceneStatePanel({required this.workspace, super.key});

  final DialogueDebugWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    final state = workspace.sceneState;
    return InfoCard(
      title: 'Scene State',
      action: Chip(label: Text(workspace.status.toUpperCase())),
      child: Wrap(
        spacing: 18,
        runSpacing: 12,
        children: [
          _Fact(label: 'Scene', value: _value(state['dialogue_scene_id'])),
          _Fact(
              label: 'State ID',
              value: _value(state['dialogue_scene_state_id'])),
          _Fact(label: 'Status', value: _value(state['status'])),
          _Fact(
              label: 'Participants',
              value: '${_list(state['participants']).length}'),
          _Fact(
              label: 'Entry Source',
              value: _value(_map(state['entry_source'])['mode'])),
          _Fact(label: 'Surface', value: _value(state['current_surface_ref'])),
          _Fact(
            label: 'Social Moves',
            value:
                '${_value(state['committed_social_move_count'])} / ${_value(state['soft_target_max'])}',
          ),
          _Fact(
            label: 'Fallback',
            value: _map(state['fallback_usage'])['exhausted'] == true
                ? 'Exhausted'
                : 'Available/unused',
          ),
          _Fact(
            label: 'Transition',
            value: _map(state['transition']).isEmpty
                ? 'None'
                : _map(state['transition']).toString(),
          ),
        ],
      ),
    );
  }
}

class AvailabilityPanel extends StatelessWidget {
  const AvailabilityPanel({
    required this.availability,
    this.selectedInteractionId,
    this.onSelectInteraction,
    super.key,
  });

  final DialogueDebugAvailability availability;
  final String? selectedInteractionId;
  final ValueChanged<String?>? onSelectInteraction;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Availability',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _InteractionGroup(
            title: 'Clarifying Questions',
            interactions: availability.clarifyingQuestions,
            selectedInteractionId: selectedInteractionId,
            onSelectInteraction: onSelectInteraction,
          ),
          const SizedBox(height: 12),
          _InteractionGroup(
            title: 'Committed Social Moves',
            interactions: availability.committedSocialMoves,
            selectedInteractionId: selectedInteractionId,
            onSelectInteraction: onSelectInteraction,
          ),
          const SizedBox(height: 12),
          _InteractionGroup(
            title: 'Exits',
            interactions: availability.exits,
            selectedInteractionId: selectedInteractionId,
            onSelectInteraction: onSelectInteraction,
          ),
        ],
      ),
    );
  }
}

class PreviewMappingPanel extends StatelessWidget {
  const PreviewMappingPanel({
    required this.previewMapping,
    this.selectedInteractionId,
    super.key,
  });

  final Map<String, dynamic> previewMapping;
  final String? selectedInteractionId;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Preview Mapping',
      child: previewMapping.isEmpty || previewMapping['status'] == 'none'
          ? const Text(
              'No committed social move preview/submission has been recorded yet.')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _OptionalLine(
                    label: 'Submitted',
                    value: _value(previewMapping['submitted_text'])),
                _OptionalLine(
                    label: 'Matched move',
                    value: _value(previewMapping['matched_authored_move_id'])),
                _OptionalLine(
                    label: 'Mapping source',
                    value: _value(previewMapping['mapping_source'])),
                _OptionalLine(
                    label: 'Confidence',
                    value: _value(previewMapping['confidence'])),
                _OptionalLine(
                    label: 'Social type',
                    value: _value(previewMapping['social_move_type'])),
                _OptionalLine(
                    label: 'Target',
                    value: _value(previewMapping['target_participant'])),
                _OptionalLine(
                  label: 'Hidden DC',
                  value: _value(_map(previewMapping['check'])['hidden_dc']),
                ),
                _OptionalLine(
                  label: 'Selected context',
                  value: selectedInteractionId,
                ),
                const SizedBox(height: 8),
                Text(
                  'Debug-only mapping fields are intentionally isolated from the player preview.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
    );
  }
}

class RelationshipStatePanel extends StatelessWidget {
  const RelationshipStatePanel({
    required this.relationshipState,
    this.selectedFieldName,
    this.onSelectField,
    this.onSelectAudit,
    super.key,
  });

  final DialogueDebugRelationshipState relationshipState;
  final String? selectedFieldName;
  final ValueChanged<String?>? onSelectField;
  final ValueChanged<String?>? onSelectAudit;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Relationship / Social State',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Definitions', style: Theme.of(context).textTheme.titleSmall),
          _MapChipWrap(
            maps: relationshipState.definitions,
            labelKey: 'field_name',
            selectedValue: selectedFieldName,
            onSelect: onSelectField,
          ),
          const SizedBox(height: 10),
          Text('Persistent NPC State',
              style: Theme.of(context).textTheme.titleSmall),
          _StateRows(
            rows: relationshipState.persistentNpcState,
            selectedFieldName: selectedFieldName,
            onSelectField: onSelectField,
          ),
          const SizedBox(height: 10),
          Text('Dialogue Scene-Local State',
              style: Theme.of(context).textTheme.titleSmall),
          _StateRows(
            rows: relationshipState.sceneLocalState,
            selectedFieldName: selectedFieldName,
            onSelectField: onSelectField,
          ),
          const SizedBox(height: 10),
          Text('Recent Reads/Writes',
              style: Theme.of(context).textTheme.titleSmall),
          _AuditList(
            records: [
              ...relationshipState.recentReads.take(4),
              ...relationshipState.recentWrites.take(4),
            ],
            onSelectAudit: onSelectAudit,
            onSelectField: onSelectField,
          ),
        ],
      ),
    );
  }
}

class TranscriptPanel extends StatefulWidget {
  const TranscriptPanel({
    required this.transcript,
    this.selectedTurnId,
    this.selectedInteractionId,
    this.onSelectTurn,
    this.onSelectInteraction,
    super.key,
  });

  final DialogueDebugTranscript transcript;
  final String? selectedTurnId;
  final String? selectedInteractionId;
  final ValueChanged<String?>? onSelectTurn;
  final ValueChanged<String?>? onSelectInteraction;

  @override
  State<TranscriptPanel> createState() => _TranscriptPanelState();
}

class _TranscriptPanelState extends State<TranscriptPanel> {
  bool _playerFacingOnly = false;

  @override
  Widget build(BuildContext context) {
    final turns = _playerFacingOnly
        ? widget.transcript.turns
            .where((turn) => turn.visibilityScope == 'player')
            .toList()
        : widget.transcript.turns;
    return InfoCard(
      title: 'Transcript',
      action: FilterChip(
        label: const Text('Player-facing only'),
        selected: _playerFacingOnly,
        onSelected: (value) => setState(() => _playerFacingOnly = value),
      ),
      child: turns.isEmpty
          ? const Text('No transcript turns are recorded yet.')
          : Column(
              children: [
                for (final turn in turns)
                  _TranscriptTurnTile(
                    turn: turn,
                    selected: widget.selectedTurnId == turn.turnId,
                    onSelectTurn: widget.onSelectTurn,
                    onSelectInteraction: widget.onSelectInteraction,
                  ),
              ],
            ),
    );
  }
}

class AnnotationCorrectionChainPanel extends StatelessWidget {
  const AnnotationCorrectionChainPanel({required this.data, super.key});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final chains = _list(data['chains']);
    return InfoCard(
      title: 'Annotation / Correction Chains',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(data['note']?.toString() ??
              'Full lifecycle chains are visible to GM/dev users only.'),
          const SizedBox(height: 8),
          if (chains.isEmpty)
            const Text('No annotation/correction chains are linked yet.')
          else
            for (final chain in chains.whereType<Map<String, dynamic>>())
              _LifecycleChainTile(chain: chain),
        ],
      ),
    );
  }
}

class _LifecycleChainTile extends StatelessWidget {
  const _LifecycleChainTile({required this.chain});

  final Map<String, dynamic> chain;

  @override
  Widget build(BuildContext context) {
    final annotations = _list(chain['annotation_records']);
    final corrections = _list(chain['correction_records']);
    final current = _map(chain['current_player_facing_understanding']);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${_value(chain['chain_type'])}: ${_value(chain['target_type'])} ${_value(chain['target_id'])}',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            if (current.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                  'Current player-facing understanding: ${_value(current['text'])}'),
            ],
            if (chain['changed_understanding_note'] != null) ...[
              const SizedBox(height: 6),
              Text(_value(chain['changed_understanding_note'])),
            ],
            const SizedBox(height: 8),
            if (annotations.isNotEmpty) ...[
              Text('Annotations',
                  style: Theme.of(context).textTheme.labelLarge),
              for (final record
                  in annotations.whereType<Map<String, dynamic>>())
                _LifecycleRecordLine(record: record),
            ],
            if (corrections.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Corrections',
                  style: Theme.of(context).textTheme.labelLarge),
              for (final record
                  in corrections.whereType<Map<String, dynamic>>())
                _LifecycleRecordLine(record: record),
            ],
          ],
        ),
      ),
    );
  }
}

class _LifecycleRecordLine extends StatelessWidget {
  const _LifecycleRecordLine({required this.record});

  final Map<String, dynamic> record;

  @override
  Widget build(BuildContext context) {
    final text =
        _value(record['approved_or_active_text'] ?? record['original_text']);
    final reason = _value(
      record['rejection_reason'] ??
          record['suppression_scope'] ??
          record['retraction_reason'],
    );
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${_value(record['record_kind'])} ${_value(record['record_id'])} · '
            '${_value(record['review_status'])} · ${_value(record['lifecycle_status'])}',
          ),
          if (text != 'None') Text(text),
          if (reason != 'None') Text('Reason/scope: $reason'),
        ],
      ),
    );
  }
}

class AuditTimelinePanel extends StatelessWidget {
  const AuditTimelinePanel({
    required this.records,
    this.selectedAuditId,
    this.selectedInteractionId,
    this.selectedFieldName,
    this.onSelectAudit,
    this.onSelectInteraction,
    this.onSelectField,
    super.key,
  });

  final List<DialogueDebugAuditRecord> records;
  final String? selectedAuditId;
  final String? selectedInteractionId;
  final String? selectedFieldName;
  final ValueChanged<String?>? onSelectAudit;
  final ValueChanged<String?>? onSelectInteraction;
  final ValueChanged<String?>? onSelectField;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Audit Timeline',
      child: records.isEmpty
          ? const Text('No dialogue audit events are recorded yet.')
          : Column(
              children: [
                for (final record in records)
                  _AuditRecordTile(
                    record: record,
                    selected: selectedAuditId == record.auditRecordId ||
                        selectedInteractionId == record.interactionId ||
                        selectedFieldName == record.fieldName,
                    onSelectAudit: onSelectAudit,
                    onSelectInteraction: onSelectInteraction,
                    onSelectField: onSelectField,
                  ),
              ],
            ),
    );
  }
}

class ValidationPanel extends StatelessWidget {
  const ValidationPanel({
    required this.validation,
    this.onSelectInteraction,
    this.onSelectField,
    super.key,
  });

  final DialogueDebugValidation validation;
  final ValueChanged<String?>? onSelectInteraction;
  final ValueChanged<String?>? onSelectField;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Validation',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ValidationGroup(title: 'Hard Errors', issues: validation.hardErrors),
          _ValidationGroup(title: 'Warnings', issues: validation.warnings),
          _ValidationGroup(
            title: 'Debug Notices',
            issues: validation.debugNotices,
          ),
        ],
      ),
    );
  }
}

class TestPathsPanel extends StatefulWidget {
  const TestPathsPanel({
    required this.testPaths,
    this.onRunPathTest,
    super.key,
  });

  final DialogueDebugTestPaths testPaths;
  final DialoguePathTestRunner? onRunPathTest;

  @override
  State<TestPathsPanel> createState() => _TestPathsPanelState();
}

class _TestPathsPanelState extends State<TestPathsPanel> {
  String? _selectedMode;
  Future<Map<String, dynamic>>? _run;

  List<String> get _modes => widget.testPaths.availableModes.isEmpty
      ? const ['happy_path', 'validation_only']
      : widget.testPaths.availableModes;

  String get _mode => _selectedMode ?? _modes.first;

  void _runSelectedMode() {
    final runner = widget.onRunPathTest;
    if (runner == null) {
      return;
    }
    setState(() {
      _selectedMode = _mode;
      _run = runner(_mode);
    });
  }

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Test Paths',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.testPaths.note ??
              'Full path simulation and forced-outcome testing is available for GM/dev users.'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              DropdownButton<String>(
                value: _mode,
                items: [
                  for (final mode in _modes)
                    DropdownMenuItem(
                      value: mode,
                      child: Text(mode.replaceAll('_', ' ')),
                    ),
                ],
                onChanged: (value) => setState(() => _selectedMode = value),
              ),
              FilledButton(
                onPressed:
                    widget.onRunPathTest == null ? null : _runSelectedMode,
                child: const Text('Run Simulation'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final check in widget.testPaths.checks)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(check.label),
              trailing: Chip(label: Text(check.status)),
            ),
          if (_run != null) ...[
            const Divider(),
            FutureBuilder<Map<String, dynamic>>(
              future: _run,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const LinearProgressIndicator();
                }
                if (snapshot.hasError) {
                  return Text('Simulation failed: ${snapshot.error}');
                }
                return _PathTestRunResult(data: snapshot.requireData);
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _PathTestRunResult extends StatelessWidget {
  const _PathTestRunResult({required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final steps = _list(data['steps']);
    final findings = _map(data['findings']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            Chip(label: Text('Status: ${_value(data['status'])}')),
            Chip(label: Text('Mode: ${_value(data['path_mode'])}')),
            Chip(label: Text('Final: ${_value(data['final_status'])}')),
          ],
        ),
        const SizedBox(height: 8),
        Text('Ordered Steps', style: Theme.of(context).textTheme.titleSmall),
        for (final step in steps.whereType<Map<String, dynamic>>())
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text('${_value(step['step_id'])} · ${_value(step['type'])}'),
            subtitle: Text(
              'status: ${_value(step['status'])} · '
              'relationship diffs: ${_list(step['relationship_diffs']).length} · '
              'new turns: ${_list(_map(step['transcript_effects'])['new_turns']).length}',
            ),
          ),
        const SizedBox(height: 8),
        Text('Findings', style: Theme.of(context).textTheme.titleSmall),
        Text(
          'Hard errors: ${_list(findings['hard_errors']).length} · '
          'Warnings: ${_list(findings['warnings']).length} · '
          'Debug notices: ${_list(findings['debug_notices']).length}',
        ),
        const SizedBox(height: 8),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: const Text('Export JSON'),
          children: [
            SelectableText(
              const JsonEncoder.withIndent('  ').convert(data),
            ),
          ],
        ),
      ],
    );
  }
}

class _InteractionGroup extends StatelessWidget {
  const _InteractionGroup({
    required this.title,
    required this.interactions,
    this.selectedInteractionId,
    this.onSelectInteraction,
  });

  final String title;
  final List<DialogueDebugInteraction> interactions;
  final String? selectedInteractionId;
  final ValueChanged<String?>? onSelectInteraction;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        if (interactions.isEmpty)
          const Text('None authored or recorded.')
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final interaction in interactions)
                FilterChip(
                  label: Text('${interaction.label} · ${interaction.status}'),
                  selected: selectedInteractionId == interaction.interactionId,
                  onSelected: (_) =>
                      onSelectInteraction?.call(interaction.interactionId),
                ),
            ],
          ),
      ],
    );
  }
}

class _MapChipWrap extends StatelessWidget {
  const _MapChipWrap({
    required this.maps,
    required this.labelKey,
    this.selectedValue,
    this.onSelect,
  });

  final List<Map<String, dynamic>> maps;
  final String labelKey;
  final String? selectedValue;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    if (maps.isEmpty) {
      return const Text('None recorded.');
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final row in maps)
          FilterChip(
            label: Text(_value(row[labelKey])),
            selected: selectedValue == _value(row[labelKey]),
            onSelected: (_) => onSelect?.call(_value(row[labelKey])),
          ),
      ],
    );
  }
}

class _StateRows extends StatelessWidget {
  const _StateRows({
    required this.rows,
    this.selectedFieldName,
    this.onSelectField,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedFieldName;
  final ValueChanged<String?>? onSelectField;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const Text('None recorded.');
    }
    return Column(
      children: [
        for (final row in rows.take(8))
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            selected: selectedFieldName == _value(row['field_name']),
            title: Text(_value(row['field_name'])),
            subtitle: Text('Scope: ${_value(row['scope'])}'),
            trailing: Text(_value(row['value_json'])),
            onTap: () => onSelectField?.call(_value(row['field_name'])),
          ),
      ],
    );
  }
}

class _AuditList extends StatelessWidget {
  const _AuditList({
    required this.records,
    this.onSelectAudit,
    this.onSelectField,
  });

  final List<DialogueDebugAuditRecord> records;
  final ValueChanged<String?>? onSelectAudit;
  final ValueChanged<String?>? onSelectField;

  @override
  Widget build(BuildContext context) {
    if (records.isEmpty) {
      return const Text('No recent reads/writes.');
    }
    return Column(
      children: [
        for (final record in records)
          _AuditRecordTile(
            record: record,
            selected: false,
            onSelectAudit: onSelectAudit,
            onSelectField: onSelectField,
          ),
      ],
    );
  }
}

class _AuditRecordTile extends StatelessWidget {
  const _AuditRecordTile({
    required this.record,
    required this.selected,
    this.onSelectAudit,
    this.onSelectInteraction,
    this.onSelectField,
  });

  final DialogueDebugAuditRecord record;
  final bool selected;
  final ValueChanged<String?>? onSelectAudit;
  final ValueChanged<String?>? onSelectInteraction;
  final ValueChanged<String?>? onSelectField;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      selected: selected,
      title: Text(record.summary ?? record.auditType),
      subtitle: Text([
        record.eventType ?? record.auditType,
        if (record.interactionId != null) record.interactionId!,
        if (record.fieldName != null) record.fieldName!,
      ].join(' · ')),
      trailing: Text(record.status ?? ''),
      onTap: () {
        onSelectAudit?.call(record.auditRecordId);
        if (record.interactionId != null) {
          onSelectInteraction?.call(record.interactionId);
        }
        if (record.fieldName != null) {
          onSelectField?.call(record.fieldName);
        }
      },
    );
  }
}

class _TranscriptTurnTile extends StatelessWidget {
  const _TranscriptTurnTile({
    required this.turn,
    required this.selected,
    this.onSelectTurn,
    this.onSelectInteraction,
  });

  final DialogueDebugTranscriptTurn turn;
  final bool selected;
  final ValueChanged<String?>? onSelectTurn;
  final ValueChanged<String?>? onSelectInteraction;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      selected: selected,
      title: Text('${turn.turnIndex}. ${turn.turnType}'),
      subtitle: Text(turn.displayText.isEmpty
          ? 'Source: ${turn.sourceInteractionId ?? 'none'}'
          : turn.displayText),
      trailing: Text(turn.visibilityScope ?? ''),
      onTap: () {
        onSelectTurn?.call(turn.turnId);
        if (turn.sourceInteractionId != null) {
          onSelectInteraction?.call(turn.sourceInteractionId);
        }
      },
    );
  }
}

class _ValidationGroup extends StatelessWidget {
  const _ValidationGroup({required this.title, required this.issues});

  final String title;
  final List<DialogueDebugIssue> issues;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$title (${issues.length})',
              style: Theme.of(context).textTheme.titleSmall),
          if (issues.isEmpty)
            const Text('None.')
          else
            for (final issue in issues.take(8))
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(issue.code),
                subtitle: Text(issue.message),
              ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 140),
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
    if (value == null || value!.trim().isEmpty || value == 'null') {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text('$label: $value'),
    );
  }
}

class _DebugUnavailableCard extends StatelessWidget {
  const _DebugUnavailableCard({
    required this.onRetry,
    required this.onBack,
  });

  final VoidCallback onRetry;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: 'Dialogue debug unavailable',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This account is not authorized for GM/dev dialogue tooling, or no dialogue state could be inspected.',
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                FilledButton(onPressed: onBack, child: const Text('Dialogue')),
                OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

Map<String, dynamic> _map(dynamic value) {
  return value is Map<String, dynamic> ? value : const <String, dynamic>{};
}

List<dynamic> _list(dynamic value) {
  return value is List ? value : const [];
}

String _value(dynamic value) {
  if (value == null) {
    return 'None';
  }
  if (value is String && value.trim().isEmpty) {
    return 'None';
  }
  return value.toString();
}
