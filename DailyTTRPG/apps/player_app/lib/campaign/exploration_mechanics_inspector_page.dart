import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../shared/widgets/app_scaffold.dart';

class ExplorationMechanicsInspectorPage extends StatefulWidget {
  const ExplorationMechanicsInspectorPage({
    required this.dashboardApi,
    required this.onSignOut,
    required this.navigate,
    super.key,
  });

  final PlayerDashboardApi dashboardApi;
  final Future<void> Function() onSignOut;
  final void Function(String route) navigate;

  @override
  State<ExplorationMechanicsInspectorPage> createState() =>
      _ExplorationMechanicsInspectorPageState();
}

class _ExplorationMechanicsInspectorPageState
    extends State<ExplorationMechanicsInspectorPage> {
  late Future<ExplorationMechanicsDebugWorkspace> _workspace;

  @override
  void initState() {
    super.initState();
    _workspace = widget.dashboardApi.getExplorationMechanicsDebug();
  }

  void _reload() {
    setState(() {
      _workspace = widget.dashboardApi.getExplorationMechanicsDebug();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Exploration Mechanics Inspector',
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Reload exploration mechanics data',
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/campaign/scene'),
          child: const Text('Scene'),
        ),
        TextButton(
          onPressed: () => widget.navigate('/play/dev/campaign-diagnostics'),
          child: const Text('Diagnostics'),
        ),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ],
      child: FutureBuilder<ExplorationMechanicsDebugWorkspace>(
        future: _workspace,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _InspectorUnavailableCard(
              onRetry: _reload,
              onBack: () => widget.navigate('/play/campaign/scene'),
              error: snapshot.error,
            );
          }

          return ExplorationMechanicsInspectorView(
            workspace: snapshot.requireData,
          );
        },
      ),
    );
  }
}

class ExplorationMechanicsInspectorView extends StatefulWidget {
  const ExplorationMechanicsInspectorView({
    required this.workspace,
    super.key,
  });

  final ExplorationMechanicsDebugWorkspace workspace;

  @override
  State<ExplorationMechanicsInspectorView> createState() =>
      _ExplorationMechanicsInspectorViewState();
}

class _ExplorationMechanicsInspectorViewState
    extends State<ExplorationMechanicsInspectorView> {
  String? _selectedId;
  String? _selectedPanel;

  void _select(String? id, {String? panel}) {
    setState(() {
      _selectedId = id;
      _selectedPanel = panel ?? _selectedPanel;
    });
  }

  void _selectPanel(String panel) {
    setState(() => _selectedPanel = panel);
  }

  @override
  Widget build(BuildContext context) {
    final panels = <_InspectorPanel>[
      _InspectorPanel(
        title: 'Scene State',
        child: SceneStateMechanicsPanel(workspace: widget.workspace),
      ),
      _InspectorPanel(
        title: 'Surface / Passive Discovery',
        child: SurfacePassiveDiscoveryPanel(workspace: widget.workspace),
      ),
      _InspectorPanel(
        title: 'Free Focus Mechanics',
        child: FreeFocusMechanicsPanel(
          rows: widget.workspace.freeFocusItems,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Free Focus Mechanics'),
        ),
      ),
      _InspectorPanel(
        title: 'Beat Action Mechanics',
        child: BeatActionMechanicsPanel(
          rows: widget.workspace.beatActionOptions,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Beat Action Mechanics'),
        ),
      ),
      _InspectorPanel(
        title: 'Preview Mapping',
        child: PreviewMappingMechanicsPanel(
          previewMapping: widget.workspace.previewMapping,
          selectedId: _selectedId,
        ),
      ),
      _InspectorPanel(
        title: 'Check Breakdown',
        child: CheckBreakdownPanel(
          rows: widget.workspace.checkDetails,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Check Breakdown'),
        ),
      ),
      _InspectorPanel(
        title: 'Result Bands',
        child: ResultBandsPanel(
          rows: widget.workspace.resultBands,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Result Bands'),
        ),
      ),
      _InspectorPanel(
        title: 'Environment Modifiers',
        child: EnvironmentModifiersPanel(
            rows: widget.workspace.environmentModifiers),
      ),
      _InspectorPanel(
        title: 'NPC Presence',
        child: NpcPresencePanel(
          rows: widget.workspace.npcPresence,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'NPC Presence'),
        ),
      ),
      _InspectorPanel(
        title: 'State Reads / Writes',
        child: StateReadsWritesPanel(
          reads: widget.workspace.stateReads,
          writes: widget.workspace.stateWrites,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'State Reads / Writes'),
        ),
      ),
      _InspectorPanel(
        title: 'Knowledge / History Outputs',
        child: KnowledgeHistoryOutputsPanel(
          knowledgeOutputs: widget.workspace.knowledgeOutputs,
          historyOutputs: widget.workspace.historyOutputs,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Knowledge / History Outputs'),
        ),
      ),
      _InspectorPanel(
        title: 'Transitions',
        child: TransitionsPanel(
          rows: widget.workspace.transitions,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Transitions'),
        ),
      ),
      _InspectorPanel(
        title: 'Audit Timeline',
        child: AuditTimelineMechanicsPanel(
          rows: widget.workspace.auditTimeline,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Audit Timeline'),
        ),
      ),
      _InspectorPanel(
        title: 'Validation',
        child: ExplorationValidationPanel(
          validation: widget.workspace.validation,
          selectedId: _selectedId,
          onSelect: (id) => _select(id, panel: 'Validation'),
        ),
      ),
      _InspectorPanel(
        title: 'Visibility Boundaries',
        child: VisibilityBoundariesPanel(
          boundaries: widget.workspace.visibilityBoundaries,
        ),
      ),
    ];

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _InspectorSummary(
            workspace: widget.workspace,
            selectedId: _selectedId,
            onClearSelection: () => _select(null),
          ),
          const SizedBox(height: 12),
          _PanelNavigation(
            panels: panels,
            selectedPanel: _selectedPanel,
            onSelectPanel: _selectPanel,
          ),
          const SizedBox(height: 12),
          for (final panel in panels) ...[
            _InspectorSection(
              title: panel.title,
              active: _selectedPanel == panel.title,
              child: panel.child,
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _InspectorPanel {
  const _InspectorPanel({required this.title, required this.child});

  final String title;
  final Widget child;
}

class _InspectorSummary extends StatelessWidget {
  const _InspectorSummary({
    required this.workspace,
    this.selectedId,
    this.onClearSelection,
  });

  final ExplorationMechanicsDebugWorkspace workspace;
  final String? selectedId;
  final VoidCallback? onClearSelection;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Exploration Mechanics Inspector',
      action: Chip(label: Text(workspace.status.toUpperCase())),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'GM/dev-only mechanics visibility. Normal player scene payloads do not receive these hidden checks, state traces, audit records, or result-band internals.',
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              _Fact(label: 'Checked', value: _display(workspace.checkedAt)),
              _Fact(
                label: 'Scene',
                value: _display(workspace.sceneState['scene_slug'] ??
                    workspace.sceneState['scene_id']),
              ),
              _Fact(
                label: 'Validation',
                value:
                    '${workspace.validation.hardErrors.length} hard / ${workspace.validation.warnings.length} warnings / ${workspace.validation.debugNotices.length} notices',
              ),
              _Fact(
                label: 'Selected',
                value: selectedId == null ? 'None' : selectedId!,
              ),
            ],
          ),
          if (selectedId != null) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: onClearSelection,
              icon: const Icon(Icons.clear),
              label: const Text('Clear linked selection'),
            ),
          ],
        ],
      ),
    );
  }
}

class _PanelNavigation extends StatelessWidget {
  const _PanelNavigation({
    required this.panels,
    this.selectedPanel,
    required this.onSelectPanel,
  });

  final List<_InspectorPanel> panels;
  final String? selectedPanel;
  final ValueChanged<String> onSelectPanel;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      title: 'Panels',
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final panel in panels)
            FilterChip(
              label: Text(panel.title),
              selected: selectedPanel == panel.title,
              onSelected: (_) => onSelectPanel(panel.title),
            ),
        ],
      ),
    );
  }
}

class _InspectorSection extends StatelessWidget {
  const _InspectorSection({
    required this.title,
    required this.child,
    required this.active,
  });

  final String title;
  final Widget child;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(
          color: active
              ? Theme.of(context).colorScheme.primary
              : Colors.transparent,
          width: 2,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: InfoCard(
        title: title,
        action: active ? const Chip(label: Text('Selected panel')) : null,
        child: child,
      ),
    );
  }
}

class SceneStateMechanicsPanel extends StatelessWidget {
  const SceneStateMechanicsPanel({required this.workspace, super.key});

  final ExplorationMechanicsDebugWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    final state = workspace.sceneState;
    return Wrap(
      spacing: 18,
      runSpacing: 12,
      children: [
        _Fact(label: 'Campaign', value: _display(state['campaign_id'])),
        _Fact(
            label: 'World Instance',
            value: _display(state['world_instance_id'])),
        _Fact(label: 'Character', value: _display(state['character_id'])),
        _Fact(label: 'Location', value: _display(state['location_id'])),
        _Fact(
            label: 'Scene',
            value: _display(state['scene_slug'] ?? state['scene_id'])),
        _Fact(
            label: 'Scene Instance',
            value: _display(state['scene_instance_id'])),
        _Fact(label: 'Beat', value: _display(state['current_beat_id'])),
        _Fact(
            label: 'Action Window',
            value: _display(state['current_action_window_id'])),
        _Fact(
            label: 'Window Status',
            value: _display(state['action_window_status'])),
        _Fact(
            label: 'Available Affordances',
            value: _display(state['current_available_affordances_count'])),
        _Fact(
            label: 'Transitions',
            value: _display(state['current_exits_transitions_count'])),
        _Fact(
            label: 'Visible NPCs', value: _display(state['visible_npc_count'])),
        _Fact(
            label: 'Relevant Absent NPCs',
            value: _display(state['known_relevant_absent_npc_count'])),
        _Fact(
            label: 'Hidden Affordances',
            value: _display(state['hidden_affordance_count'])),
        _Fact(
            label: 'Unavailable Exits',
            value: _display(state['unavailable_exit_count'])),
        _Fact(
            label: 'Runtime Selection',
            value: _display(state['runtime_selection_reason'])),
      ],
    );
  }
}

class SurfacePassiveDiscoveryPanel extends StatelessWidget {
  const SurfacePassiveDiscoveryPanel({required this.workspace, super.key});

  final ExplorationMechanicsDebugWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    final surface = workspace.surfaceContext;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _KeyValueGrid(values: {
          'Base description': surface['base_authored_scene_description'],
          'Overlay': surface['overlay_scene_key'],
          'Interaction model': surface['interaction_model'],
          'Passive discoveries': surface['passive_discovery_count'],
          'Free Focus count': surface['free_focus_count'],
          'Reuse/cooldown': surface['reuse_cooldown_information'],
        }),
        const SizedBox(height: 12),
        _JsonExpansion(
          title: 'Time / Weather / Season / Light',
          data: _asMap(surface['time_weather_season_light_inputs']),
        ),
        _JsonExpansion(
          title: 'Environment overlays and selected flavors',
          data: {
            'overlays': surface['environment_overlays_applied'],
            'flavors': surface['selected_weighted_flavor_references'],
          },
        ),
        _JsonExpansion(
          title: 'NPC presence contributions',
          data: {'contributions': surface['npc_presence_contributions']},
        ),
        _JsonExpansion(
          title: 'Character knowledge filter summary',
          data: _asMap(surface['character_knowledge_filter_summary']),
        ),
        const SizedBox(height: 10),
        _MapRows(
          title: 'Passive Discoveries',
          rows: workspace.passiveDiscoveries,
          idKeys: const ['id'],
          primaryKeys: const [
            'label',
            'visibility_state',
            'check_type',
            'result_band'
          ],
          emptyText:
              'No passive discoveries are authored or recorded for this scene.',
        ),
      ],
    );
  }
}

class FreeFocusMechanicsPanel extends StatelessWidget {
  const FreeFocusMechanicsPanel({
    required this.rows,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'Free Focus / Closer Look Items',
      rows: rows,
      selectedId: selectedId,
      onSelect: onSelect,
      idKeys: const ['id', 'interaction_id', 'source_id'],
      primaryKeys: const [
        'title',
        'status',
        'check_requirement',
        'check_type',
        'skill',
        'dc',
        'dc_visibility_policy',
        'repeat_policy',
        'retry_policy',
      ],
      emptyText: 'No Free Focus / Closer Look items are currently inspectable.',
    );
  }
}

class BeatActionMechanicsPanel extends StatelessWidget {
  const BeatActionMechanicsPanel({
    required this.rows,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'Beat Action / Authored Interactions',
      rows: rows,
      selectedId: selectedId,
      onSelect: onSelect,
      idKeys: const ['authored_action_id', 'interaction_key', 'source_id'],
      primaryKeys: const [
        'authored_action_id',
        'affordance_id',
        'verb_action_type',
        'availability_state',
        'visibility_status',
        'check_requirement',
        'check_type',
        'skill',
        'dc',
      ],
      emptyText: 'No Beat Action options are currently inspectable.',
    );
  }
}

class PreviewMappingMechanicsPanel extends StatelessWidget {
  const PreviewMappingMechanicsPanel({
    required this.previewMapping,
    this.selectedId,
    super.key,
  });

  final Map<String, dynamic> previewMapping;
  final String? selectedId;

  @override
  Widget build(BuildContext context) {
    if (previewMapping.isEmpty || previewMapping['status'] == 'not_recorded') {
      return const Text(
          'No submitted or previewed beat action is recorded for the current action window.');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _KeyValueGrid(values: {
          'Raw text': previewMapping['raw_player_text'],
          'Normalized': previewMapping['normalized_text'],
          'Selected verb': previewMapping['selected_verb'],
          'Selected target': previewMapping['selected_target'],
          'Selected affordance': previewMapping['selected_affordance'],
          'Matched interaction': previewMapping['matched_authored_interaction'],
          'Mapping source': previewMapping['mapping_source'],
          'Selected context': selectedId,
        }),
        _JsonExpansion(
            title: 'Overlap with Free Focus',
            data: _asMap(previewMapping['overlap_with_free_focus'])),
        _JsonExpansion(
            title: 'Mechanical preview',
            data: _asMap(previewMapping['mechanical_preview'])),
        _JsonExpansion(
            title: 'Player-facing preview fields',
            data: _asMap(previewMapping['player_facing_preview_fields'])),
        _JsonExpansion(
            title: 'Hidden debug preview fields',
            data: _asMap(previewMapping['hidden_debug_preview_fields'])),
      ],
    );
  }
}

class CheckBreakdownPanel extends StatelessWidget {
  const CheckBreakdownPanel({
    required this.rows,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'Check Details',
      rows: rows,
      selectedId: selectedId,
      onSelect: onSelect,
      idKeys: const ['check_id', 'source_id'],
      primaryKeys: const [
        'check_id',
        'source_type',
        'source_id',
        'source_label',
        'requires_check',
        'check_kind',
        'ability',
        'skill',
        'tool',
        'dc',
        'dc_visibility',
        'roll_mode',
        'raw_roll',
        'total_result',
        'result_band',
        'instrumentation_status',
      ],
      emptyText: 'No check breakdowns are currently inspectable.',
    );
  }
}

class ResultBandsPanel extends StatelessWidget {
  const ResultBandsPanel({
    required this.rows,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'Authored Result Bands',
      rows: rows,
      selectedId: selectedId,
      onSelect: onSelect,
      idKeys: const ['source_id', 'band_id'],
      primaryKeys: const [
        'source_type',
        'source_id',
        'band_id',
        'band_label',
        'classification',
        'threshold',
        'dc_range',
        'selected',
        'selection_reason',
        'player_facing_text',
        'gm_notes',
        'validation_status',
        'instrumentation_status',
      ],
      emptyText: 'No authored result bands are currently inspectable.',
    );
  }
}

class EnvironmentModifiersPanel extends StatelessWidget {
  const EnvironmentModifiersPanel({required this.rows, super.key});

  final List<Map<String, dynamic>> rows;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'Environment Context / Modifiers',
      rows: rows,
      idKeys: const ['weather', 'time_of_day', 'flavor_source_id'],
      primaryKeys: const [
        'weather',
        'time_of_day',
        'season',
        'visibility_light',
        'temperature',
        'wind',
        'precipitation',
        'mood_tone',
        'flavor_source_id',
        'flavor_weight',
        'flavor_seed',
        'flavor_reuse_cooldown_status',
        'instrumentation_status',
      ],
      emptyText: 'No environment context is currently inspectable.',
    );
  }
}

class NpcPresencePanel extends StatelessWidget {
  const NpcPresencePanel({
    required this.rows,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'NPC Presence / Schedules',
      rows: rows,
      selectedId: selectedId,
      onSelect: onSelect,
      idKeys: const ['npc_id'],
      primaryKeys: const [
        'npc_id',
        'canonical_name',
        'player_visible_label',
        'identity_visibility',
        'is_present',
        'is_absent',
        'is_known_to_character',
        'is_relevant_absent_npc',
        'authored_schedule_id',
        'current_schedule_block',
        'routine_label',
        'resolved_presence_status',
        'absence_reason',
        'visibility_reason',
        'instrumentation_status',
      ],
      emptyText: 'No NPC presence data is currently inspectable.',
    );
  }
}

class StateReadsWritesPanel extends StatelessWidget {
  const StateReadsWritesPanel({
    required this.reads,
    required this.writes,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> reads;
  final List<Map<String, dynamic>> writes;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MapRows(
          title: 'State Reads / Dependencies',
          rows: reads,
          selectedId: selectedId,
          onSelect: onSelect,
          idKeys: const [
            'read_id',
            'source_id',
            'related_free_focus_id',
            'related_beat_action_id'
          ],
          primaryKeys: const [
            'read_id',
            'source_type',
            'source_id',
            'scope',
            'key_or_path',
            'expected_value_or_condition',
            'actual_value',
            'read_kind',
            'affects',
            'player_facing',
            'hidden_debug',
            'instrumentation_status',
          ],
          emptyText: 'No state reads/dependencies are currently inspectable.',
        ),
        const SizedBox(height: 12),
        _MapRows(
          title: 'State Writes',
          rows: writes,
          selectedId: selectedId,
          onSelect: onSelect,
          idKeys: const [
            'write_id',
            'source_id',
            'source_action_id',
            'source_free_focus_id'
          ],
          primaryKeys: const [
            'write_id',
            'source_type',
            'source_id',
            'scope',
            'key_or_path',
            'old_value',
            'new_value',
            'write_kind',
            'source_result_band_id',
            'audit_event_id',
            'emitted_to_result_feed',
            'emitted_to_history',
            'emitted_to_knowledge_journal',
            'player_facing',
            'hidden_debug',
            'instrumentation_status',
          ],
          emptyText: 'No state writes are currently inspectable.',
        ),
      ],
    );
  }
}

class KnowledgeHistoryOutputsPanel extends StatelessWidget {
  const KnowledgeHistoryOutputsPanel({
    required this.knowledgeOutputs,
    required this.historyOutputs,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> knowledgeOutputs;
  final List<Map<String, dynamic>> historyOutputs;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MapRows(
          title: 'Knowledge Outputs',
          rows: knowledgeOutputs,
          selectedId: selectedId,
          onSelect: onSelect,
          idKeys: const ['output_id', 'knowledge_id', 'source_id'],
          primaryKeys: const [
            'output_id',
            'knowledge_id',
            'clue_id',
            'fact_id',
            'rumor_id',
            'output_type',
            'confidence_or_status',
            'character_id',
            'campaign_id',
            'source_type',
            'source_id',
            'source_result_band_id',
            'provenance_event_id',
            'shown_in_scene_result',
            'shown_in_knowledge_journal',
            'shown_in_campaign_history',
            'player_facing',
            'hidden_debug',
            'instrumentation_status',
          ],
          emptyText: 'No knowledge outputs are currently inspectable.',
        ),
        const SizedBox(height: 12),
        _MapRows(
          title: 'History / Result Outputs',
          rows: historyOutputs,
          selectedId: selectedId,
          onSelect: onSelect,
          idKeys: const ['output_id', 'event_id', 'source_id'],
          primaryKeys: const [
            'output_id',
            'event_id',
            'event_type',
            'timeline_entry_id',
            'journal_entry_id',
            'result_feed_entry_id',
            'objective_update_id',
            'source_type',
            'source_id',
            'source_result_band_id',
            'canonical',
            'summary',
            'player_visible_text',
            'gm_debug_text',
            'player_facing',
            'hidden_debug',
            'instrumentation_status',
          ],
          emptyText: 'No history/result outputs are currently inspectable.',
        ),
      ],
    );
  }
}

class TransitionsPanel extends StatelessWidget {
  const TransitionsPanel({
    required this.rows,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'Transitions / Exits',
      rows: rows,
      selectedId: selectedId,
      onSelect: onSelect,
      idKeys: const ['transition_id', 'transition_key'],
      primaryKeys: const [
        'transition_id',
        'transition_type',
        'source_scene_id',
        'target_scene_id',
        'target_location_id',
        'target_campaign_state',
        'availability_status',
        'failed_requirements',
        'state_dependencies',
        'knowledge_dependencies',
        'npc_dependencies',
        'environment_dependencies',
        'selected_by_action_id',
        'selected_by_result_band_id',
        'player_facing',
        'hidden_debug',
        'transition_reason',
        'instrumentation_status',
      ],
      emptyText: 'No transitions are currently inspectable.',
    );
  }
}

class AuditTimelineMechanicsPanel extends StatelessWidget {
  const AuditTimelineMechanicsPanel({
    required this.rows,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return _MapRows(
      title: 'Normalized Audit Timeline',
      rows: rows,
      selectedId: selectedId,
      onSelect: onSelect,
      idKeys: const [
        'audit_id',
        'source_id',
        'action_id',
        'free_focus_id',
        'output_id'
      ],
      primaryKeys: const [
        'timestamp',
        'event_type',
        'summary',
        'source_type',
        'source_id',
        'beat_id',
        'action_window_id',
        'action_id',
        'free_focus_id',
        'result_band_id',
        'scene_id',
        'npc_id',
        'state_scope',
        'output_id',
        'player_facing',
        'hidden_debug',
        'linked_debug_sections',
        'instrumentation_status',
      ],
      emptyText: 'No normalized audit events are currently inspectable.',
    );
  }
}

class ExplorationValidationPanel extends StatelessWidget {
  const ExplorationValidationPanel({
    required this.validation,
    this.selectedId,
    this.onSelect,
    super.key,
  });

  final ExplorationMechanicsValidation validation;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _IssueGroup(
          title: 'Hard Errors',
          issues: validation.hardErrors,
          selectedId: selectedId,
          onSelect: onSelect,
        ),
        _IssueGroup(
          title: 'Warnings',
          issues: validation.warnings,
          selectedId: selectedId,
          onSelect: onSelect,
        ),
        _IssueGroup(
          title: 'Debug Notices',
          issues: validation.debugNotices,
          selectedId: selectedId,
          onSelect: onSelect,
        ),
      ],
    );
  }
}

class VisibilityBoundariesPanel extends StatelessWidget {
  const VisibilityBoundariesPanel({required this.boundaries, super.key});

  final Map<String, dynamic> boundaries;

  @override
  Widget build(BuildContext context) {
    if (boundaries.isEmpty) {
      return const Text('Visibility boundary data is not available.');
    }
    final flags = [
      'includes_hidden_dc',
      'includes_result_band_internals',
      'includes_check_debug_breakdown',
      'includes_modifier_breakdown',
      'includes_hidden_requirements',
      'includes_environment_debug',
      'includes_hidden_environment_details',
      'includes_npc_schedule_debug',
      'includes_hidden_npc_identity',
      'includes_state_dependencies',
      'includes_raw_state_reads',
      'includes_raw_state_writes',
      'includes_hidden_knowledge_outputs',
      'includes_history_output_internals',
      'includes_hidden_transition_requirements',
      'includes_audit_timeline',
      'player_endpoint_exclusion_confirmed',
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final flag in flags)
              Chip(
                label:
                    Text('${_humanize(flag)}: ${_display(boundaries[flag])}'),
              ),
          ],
        ),
        const SizedBox(height: 10),
        _OptionalLine(
            label: 'Player DC policy', value: boundaries['player_dc_policy']),
        _OptionalLine(
            label: 'Player roll policy',
            value: boundaries['player_roll_policy']),
        _OptionalLine(
            label: 'Player result-band policy',
            value: boundaries['player_result_band_policy']),
        _JsonExpansion(title: 'Notes', data: {'notes': boundaries['notes']}),
      ],
    );
  }
}

class _MapRows extends StatelessWidget {
  const _MapRows({
    required this.title,
    required this.rows,
    required this.idKeys,
    required this.primaryKeys,
    required this.emptyText,
    this.selectedId,
    this.onSelect,
  });

  final String title;
  final List<Map<String, dynamic>> rows;
  final List<String> idKeys;
  final List<String> primaryKeys;
  final String emptyText;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return Text(emptyText);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$title (${rows.length})',
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        for (final row in rows)
          _DebugMapTile(
            row: row,
            idKeys: idKeys,
            primaryKeys: primaryKeys,
            selected: _matchesSelection(row, selectedId),
            onSelect: onSelect,
          ),
      ],
    );
  }
}

class _DebugMapTile extends StatelessWidget {
  const _DebugMapTile({
    required this.row,
    required this.idKeys,
    required this.primaryKeys,
    required this.selected,
    this.onSelect,
  });

  final Map<String, dynamic> row;
  final List<String> idKeys;
  final List<String> primaryKeys;
  final bool selected;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    final id = _firstValue(row, idKeys);
    final title = _tileTitle(row, idKeys);
    final status = _display(row['instrumentation_status'] ??
        row['status'] ??
        row['availability_status']);
    return Card(
      color: selected ? Theme.of(context).colorScheme.primaryContainer : null,
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onSelect == null ? null : () => onSelect!(id),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleSmall),
                  if (status != 'Not recorded') Chip(label: Text(status)),
                  if (row['selected'] == true)
                    const Chip(label: Text('Selected')),
                ],
              ),
              const SizedBox(height: 8),
              _KeyValueGrid(
                values: {
                  for (final key in primaryKeys) key: row[key],
                },
              ),
              _JsonExpansion(title: 'Details', data: row),
            ],
          ),
        ),
      ),
    );
  }
}

class _IssueGroup extends StatelessWidget {
  const _IssueGroup({
    required this.title,
    required this.issues,
    this.selectedId,
    this.onSelect,
  });

  final String title;
  final List<ExplorationMechanicsIssue> issues;
  final String? selectedId;
  final ValueChanged<String?>? onSelect;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$title (${issues.length})',
              style: Theme.of(context).textTheme.titleSmall),
          if (issues.isEmpty)
            const Text('None.')
          else
            for (final issue in issues)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                selected:
                    issue.sourceId != null && issue.sourceId == selectedId,
                title: Text('${issue.code} · ${issue.severity ?? 'notice'}'),
                subtitle: Text(issue.message),
                trailing: issue.sourceId == null ? null : Text(issue.sourceId!),
                onTap: issue.sourceId == null
                    ? null
                    : () => onSelect?.call(issue.sourceId),
              ),
        ],
      ),
    );
  }
}

class _KeyValueGrid extends StatelessWidget {
  const _KeyValueGrid({required this.values});

  final Map<String, dynamic> values;

  @override
  Widget build(BuildContext context) {
    final entries =
        values.entries.where((entry) => !_isEmptyValue(entry.value)).toList();
    if (entries.isEmpty) {
      return const Text('No inspectable values are recorded.');
    }
    return Wrap(
      spacing: 16,
      runSpacing: 10,
      children: [
        for (final entry in entries)
          _Fact(label: _humanize(entry.key), value: _display(entry.value)),
      ],
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
      constraints: const BoxConstraints(minWidth: 150, maxWidth: 280),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          SelectableText(value),
        ],
      ),
    );
  }
}

class _JsonExpansion extends StatelessWidget {
  const _JsonExpansion({required this.title, required this.data});

  final String title;
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return const SizedBox.shrink();
    }
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: Text(title),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SelectableText(
            const JsonEncoder.withIndent('  ').convert(data),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _OptionalLine extends StatelessWidget {
  const _OptionalLine({required this.label, required this.value});

  final String label;
  final dynamic value;

  @override
  Widget build(BuildContext context) {
    if (_isEmptyValue(value)) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text('$label: ${_display(value)}'),
    );
  }
}

class _InspectorUnavailableCard extends StatelessWidget {
  const _InspectorUnavailableCard({
    required this.onRetry,
    required this.onBack,
    this.error,
  });

  final VoidCallback onRetry;
  final VoidCallback onBack;
  final Object? error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InfoCard(
        title: 'Exploration mechanics unavailable',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This account is not authorized for GM/dev exploration mechanics, or the current scene could not be inspected.',
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(error.toString()),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                FilledButton(onPressed: onBack, child: const Text('Scene')),
                OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

Map<String, dynamic> _asMap(dynamic value) {
  return value is Map<String, dynamic> ? value : const <String, dynamic>{};
}

String? _firstValue(Map<String, dynamic> row, List<String> keys) {
  for (final key in keys) {
    final value = row[key]?.toString();
    if (value != null && value.trim().isNotEmpty && value != 'null') {
      return value;
    }
  }
  return null;
}

String _tileTitle(Map<String, dynamic> row, List<String> idKeys) {
  return _display(
    row['label'] ??
        row['title'] ??
        row['source_label'] ??
        row['band_label'] ??
        row['event_type'] ??
        _firstValue(row, idKeys) ??
        'Debug record',
  );
}

bool _matchesSelection(Map<String, dynamic> row, String? selectedId) {
  if (selectedId == null || selectedId.isEmpty) {
    return false;
  }
  for (final key in [
    'id',
    'source_id',
    'interaction_id',
    'authored_action_id',
    'check_id',
    'band_id',
    'transition_id',
    'audit_id',
    'output_id',
    'write_id',
    'read_id',
    'related_free_focus_id',
    'related_beat_action_id',
    'source_action_id',
    'source_free_focus_id',
    'selected_by_action_id',
    'selected_by_result_band_id',
  ]) {
    if (row[key]?.toString() == selectedId) {
      return true;
    }
  }
  return jsonEncode(row).contains(selectedId);
}

bool _isEmptyValue(dynamic value) {
  if (value == null) {
    return true;
  }
  if (value is String) {
    return value.trim().isEmpty || value == 'null';
  }
  if (value is Iterable) {
    return value.isEmpty;
  }
  if (value is Map) {
    return value.isEmpty;
  }
  return false;
}

String _display(dynamic value) {
  if (_isEmptyValue(value)) {
    return 'Not recorded';
  }
  if (value == 'not_recorded') {
    return 'Not recorded';
  }
  if (value == 'future_supported') {
    return 'Future supported';
  }
  if (value == 'not_applicable') {
    return 'Not applicable';
  }
  if (value is Map || value is List) {
    final encoded = jsonEncode(value);
    return encoded.length > 140 ? '${encoded.substring(0, 137)}...' : encoded;
  }
  return value.toString();
}

String _humanize(String value) {
  if (value.isEmpty) {
    return 'Value';
  }
  final text = value.replaceAll('_', ' ').replaceAll('-', ' ');
  return text.substring(0, 1).toUpperCase() + text.substring(1);
}
