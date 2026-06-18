String _text(dynamic value, [String fallback = '']) {
  final text = value?.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
  return text == null || text.isEmpty ? fallback : text;
}

const _blockedPlayerFragments = [
  'gm_notes',
  'gm/dev',
  'debug_envelope',
  'debug_summary',
  'hidden_dc',
  'hidden difficulty',
  'raw_roll',
  'raw roll',
  'armor_class_hidden',
  'exact_enemy_hit_points',
  'hidden_requirements',
  'failed_hidden_requirements',
  'raw_state',
  'state_write',
  'mutation_plan',
  'idempotency_key',
  'source_state_version',
  'action_window_internal',
  'internal_routing',
  'combat_pending',
  'future_supported',
  'target_encounter_id',
  'branch_id',
  'path_harness',
  'stack trace',
  'trace_id',
  'gm_trace',
  'source file',
  '.js:',
  '.dart:',
];

bool combatTextIsPlayerSafe(String? value) {
  final lower = _text(value).toLowerCase();
  if (lower.isEmpty) return false;
  return !_blockedPlayerFragments.any(lower.contains);
}

String playerSafeCombatText(String? value, [String fallback = '']) {
  final text = _text(value);
  if (combatTextIsPlayerSafe(text)) return text;
  final safeFallback = _text(fallback);
  return combatTextIsPlayerSafe(safeFallback) ? safeFallback : '';
}

String _playerSafeVisibleText(Iterable<String?> values) {
  return values
      .map((entry) => playerSafeCombatText(entry))
      .where((entry) => entry.isNotEmpty)
      .join('\n')
      .toLowerCase();
}

int? _int(dynamic value) => value is num ? value.toInt() : null;

bool _bool(dynamic value) => value == true;

Map<String, dynamic> _map(dynamic value) {
  return value is Map<String, dynamic> ? value : const <String, dynamic>{};
}

List<Map<String, dynamic>> _mapList(dynamic value) {
  return value is List ? value.whereType<Map<String, dynamic>>().toList() : [];
}

List<String> _stringList(dynamic value) {
  return value is List
      ? value
          .map((entry) => _text(entry))
          .where((entry) => entry.isNotEmpty)
          .toList()
      : const [];
}

String humanizeCombatText(String value) {
  return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .split(' ')
      .where((word) => word.trim().isNotEmpty)
      .map((word) => word[0].toUpperCase() + word.substring(1))
      .join(' ');
}

class CombatView {
  const CombatView({
    required this.encounterTitle,
    required this.combatStatus,
    required this.round,
    required this.participants,
    required this.initiative,
    required this.resources,
    required this.decisionCategories,
    required this.availableActions,
    required this.movementDestinations,
    this.currentActor,
    this.currentZone,
    this.movement,
    this.latestResult,
    this.latestEvents = const [],
    this.reaction,
    this.focus,
    this.resolution,
    this.recovery,
    this.endTurnConfirmation,
    this.nextStep,
    this.automaticState,
    this.ordinaryControlsAvailable = true,
    this.combatControlsAvailable = true,
  });

  factory CombatView.fromJson(Map<String, dynamic> json) {
    final root = _map(json['read_model']).isNotEmpty
        ? _map(json['read_model'])
        : _map(json['current_read_model']).isNotEmpty
            ? _map(json['current_read_model'])
            : json;
    final participantsJson = _mapList(root['visible_participants']).isNotEmpty
        ? _mapList(root['visible_participants'])
        : _mapList(root['participants']);
    final participants =
        participantsJson.map(CombatParticipant.fromJson).toList();
    final currentActor = _map(root['current_actor']).isNotEmpty
        ? CombatParticipant.fromJson(_map(root['current_actor']))
        : _findCurrentActor(participants, root['current_actor_id']);
    final initiativeJson = _mapList(root['visible_initiative']).isNotEmpty
        ? _mapList(root['visible_initiative'])
        : _mapList(root['initiative']).isNotEmpty
            ? _mapList(root['initiative'])
            : participants
                .map((participant) => {
                      'participant_id': participant.participantId,
                      'display_name': participant.displayName,
                      'faction': participant.faction,
                      'current': participant.isActor ||
                          participant.participantId ==
                              (currentActor?.participantId ?? ''),
                      'status': participant.defeated
                          ? 'defeated'
                          : participant.surrendered
                              ? 'surrendered'
                              : 'active',
                    })
                .toList();
    final latestResult = _map(root['latest_result']).isNotEmpty
        ? CombatResultBundle.fromJson(_map(root['latest_result']))
        : _map(root['result']).isNotEmpty
            ? CombatResultBundle.fromJson(_map(root['result']))
            : null;
    final reaction = CombatReactionState.fromJson(root);
    final resolution = CombatResolutionState.fromJson(root);
    final recovery = CombatRecoveryState.fromJson(root);
    return CombatView(
      encounterTitle: _text(root['encounter_title'], 'Combat Encounter'),
      combatStatus: _text(root['combat_status'] ?? root['status'], 'active'),
      round: _int(root['round']) ?? 1,
      currentActor: currentActor,
      participants: participants,
      initiative: initiativeJson.map(CombatInitiativeEntry.fromJson).toList(),
      currentZone: _text(root['current_zone'] ?? root['player_position']),
      resources: _mapList(root['visible_player_resources'])
          .map(CombatResource.fromJson)
          .toList(),
      movement: _map(root['movement']).isNotEmpty
          ? CombatMovement.fromJson(_map(root['movement']))
          : null,
      decisionCategories: _mapList(root['legal_decision_categories'])
          .map(CombatDecisionCategory.fromJson)
          .toList(),
      availableActions: _mapList(root['available_authored_actions'])
          .map(CombatActionOption.fromJson)
          .toList(),
      movementDestinations: _mapList(root['visible_movement_destinations'])
          .map(CombatMovementDestination.fromJson)
          .toList(),
      latestResult: latestResult,
      latestEvents:
          _mapList(root['latest_events']).map(CombatEvent.fromJson).toList(),
      reaction: reaction.isPresent ? reaction : null,
      focus: CombatFocusState.fromJson(root),
      resolution: resolution.isPresent ? resolution : null,
      recovery: recovery.isPresent ? recovery : null,
      endTurnConfirmation: _map(root['end_turn_confirmation']).isNotEmpty
          ? CombatEndTurnConfirmation.fromJson(
              _map(root['end_turn_confirmation']))
          : null,
      nextStep: _text(root['next_step']),
      automaticState: _text(root['automatic_state']),
      ordinaryControlsAvailable:
          root['ordinary_controls_available'] == false ? false : true,
      combatControlsAvailable:
          root['combat_controls_available'] == false ? false : true,
    );
  }

  final String encounterTitle;
  final String combatStatus;
  final int round;
  final CombatParticipant? currentActor;
  final String? currentZone;
  final List<CombatParticipant> participants;
  final List<CombatInitiativeEntry> initiative;
  final List<CombatResource> resources;
  final CombatMovement? movement;
  final List<CombatDecisionCategory> decisionCategories;
  final List<CombatActionOption> availableActions;
  final List<CombatMovementDestination> movementDestinations;
  final CombatResultBundle? latestResult;
  final List<CombatEvent> latestEvents;
  final CombatReactionState? reaction;
  final CombatFocusState? focus;
  final CombatResolutionState? resolution;
  final CombatRecoveryState? recovery;
  final CombatEndTurnConfirmation? endTurnConfirmation;
  final String? nextStep;
  final String? automaticState;
  final bool ordinaryControlsAvailable;
  final bool combatControlsAvailable;

  bool get isRecovery => recovery != null || combatStatus == 'recovery_needed';
  bool get isReaction => reaction?.isWaiting == true;
  bool get isAutomatic =>
      automaticState == 'automatic_turn' || combatStatus == 'resolving';
  bool get isResolution => resolution != null;
  bool get canUseOrdinaryControls =>
      !isRecovery &&
      !isReaction &&
      !isResolution &&
      ordinaryControlsAvailable &&
      combatControlsAvailable;

  String get playerVisibleText => _playerSafeVisibleText([
        encounterTitle,
        combatStatus,
        currentActor?.displayName,
        currentZone,
        nextStep,
        for (final entry in initiative) entry.playerVisibleText,
        for (final participant in participants) participant.playerVisibleText,
        for (final resource in resources) resource.playerVisibleText,
        movement?.playerVisibleText,
        for (final category in decisionCategories) category.playerVisibleText,
        for (final action in availableActions) action.playerVisibleText,
        for (final destination in movementDestinations)
          destination.playerVisibleText,
        latestResult?.playerVisibleText,
        for (final event in latestEvents) event.playerVisibleText,
        reaction?.playerVisibleText,
        focus?.playerVisibleText,
        resolution?.playerVisibleText,
        recovery?.playerVisibleText,
      ]);
}

CombatParticipant? _findCurrentActor(
  List<CombatParticipant> participants,
  dynamic currentActorId,
) {
  final id = _text(currentActorId);
  if (id.isNotEmpty) {
    for (final participant in participants) {
      if (participant.participantId == id) return participant;
    }
  }
  for (final participant in participants) {
    if (participant.isActor) return participant;
  }
  return null;
}

class CombatParticipant {
  const CombatParticipant({
    required this.participantId,
    required this.displayName,
    this.faction,
    this.isActor = false,
    this.isPlayer = false,
    this.hitPoints,
    this.healthBand,
    this.defeated = false,
    this.surrendered = false,
    this.conditions = const [],
    this.zone,
    this.cover,
  });

  factory CombatParticipant.fromJson(Map<String, dynamic> json) {
    return CombatParticipant(
      participantId: _text(json['participant_id'] ?? json['id']),
      displayName: _text(json['display_name'] ?? json['name'], 'Participant'),
      faction: _text(json['faction']),
      isActor: _bool(json['is_actor'] ?? json['current']),
      isPlayer: _bool(json['is_player'] ?? json['player_controlled']) ||
          _text(json['faction']).toLowerCase() == 'player',
      hitPoints: _map(json['hit_points']).isNotEmpty
          ? CombatHitPoints.fromJson(_map(json['hit_points']))
          : null,
      healthBand: _text(json['health_band']),
      defeated: _bool(json['defeated']),
      surrendered: _bool(json['surrendered']),
      conditions:
          _stringList(json['visible_conditions'] ?? json['conditions']),
      zone: _text(json['current_zone'] ?? json['current_zone_id']),
      cover: _text(json['cover']),
    );
  }

  final String participantId;
  final String displayName;
  final String? faction;
  final bool isActor;
  final bool isPlayer;
  final CombatHitPoints? hitPoints;
  final String? healthBand;
  final bool defeated;
  final bool surrendered;
  final List<String> conditions;
  final String? zone;
  final String? cover;

  String get stateLabel {
    if (defeated) return 'defeated';
    if (surrendered) return 'surrendered';
    if ((healthBand ?? '').isNotEmpty) return healthBand!;
    return 'active';
  }

  String get playerVisibleText => _playerSafeVisibleText([
        displayName,
        faction,
        stateLabel,
        if (isPlayer) hitPoints?.playerVisibleText,
        zone,
        cover,
        ...conditions,
      ]);
}

class CombatHitPoints {
  const CombatHitPoints({
    this.current,
    this.maximum,
    this.temporary = 0,
  });

  factory CombatHitPoints.fromJson(Map<String, dynamic> json) {
    return CombatHitPoints(
      current: _int(json['current']),
      maximum: _int(json['maximum'] ?? json['max']),
      temporary: _int(json['temporary']) ?? 0,
    );
  }

  final int? current;
  final int? maximum;
  final int temporary;

  String get label {
    final base = current == null || maximum == null
        ? 'HP visible'
        : '$current/$maximum HP';
    return temporary > 0 ? '$base +$temporary temp' : base;
  }

  String get playerVisibleText => label;
}

class CombatInitiativeEntry {
  const CombatInitiativeEntry({
    required this.participantId,
    required this.displayName,
    this.faction,
    this.status,
    this.current = false,
  });

  factory CombatInitiativeEntry.fromJson(Map<String, dynamic> json) {
    return CombatInitiativeEntry(
      participantId: _text(json['participant_id'] ?? json['id']),
      displayName: _text(json['display_name'] ?? json['name'], 'Participant'),
      faction: _text(json['faction']),
      status: _text(json['status']),
      current: _bool(json['current'] ?? json['is_current'] ?? json['is_actor']),
    );
  }

  final String participantId;
  final String displayName;
  final String? faction;
  final String? status;
  final bool current;

  String get playerVisibleText => _playerSafeVisibleText([
        displayName,
        faction,
        status,
        if (current) 'current',
      ]);
}

class CombatResource {
  const CombatResource({
    required this.resourceId,
    required this.label,
    this.current,
    this.maximum,
    this.tier,
  });

  factory CombatResource.fromJson(Map<String, dynamic> json) {
    return CombatResource(
      resourceId: _text(json['resource_id'] ?? json['id']),
      label: _text(json['label'] ?? json['name'], 'Resource'),
      current: _int(json['current']),
      maximum: _int(json['maximum'] ?? json['max']),
      tier: _text(json['tier']),
    );
  }

  final String resourceId;
  final String label;
  final int? current;
  final int? maximum;
  final String? tier;

  String get valueLabel {
    if (current == null || maximum == null) return tier ?? '';
    return '$current/$maximum';
  }

  String get playerVisibleText => _playerSafeVisibleText([label, valueLabel]);
}

class CombatMovement {
  const CombatMovement({
    this.base = 0,
    this.dashAdded = 0,
    this.spent = 0,
    this.remaining = 0,
  });

  factory CombatMovement.fromJson(Map<String, dynamic> json) {
    return CombatMovement(
      base: _int(json['base_movement']) ?? 0,
      dashAdded: _int(json['dash_added_movement']) ?? 0,
      spent: _int(json['movement_spent']) ?? 0,
      remaining: _int(json['movement_remaining']) ?? 0,
    );
  }

  final int base;
  final int dashAdded;
  final int spent;
  final int remaining;

  String get playerVisibleText =>
      'movement base $base spent $spent remaining $remaining';
}

class CombatDecisionCategory {
  const CombatDecisionCategory({
    required this.category,
    required this.status,
    this.available = false,
    this.meaningful = false,
    this.reason,
  });

  factory CombatDecisionCategory.fromJson(Map<String, dynamic> json) {
    return CombatDecisionCategory(
      category: _text(json['category']),
      status: _text(json['status'], 'unavailable'),
      available: _bool(json['available']),
      meaningful: _bool(json['meaningful']),
      reason: _text(json['reason']),
    );
  }

  final String category;
  final String status;
  final bool available;
  final bool meaningful;
  final String? reason;

  String get label => humanizeCombatText(category);
  String get playerVisibleText => _playerSafeVisibleText([label, status, reason]);
}

class CombatActionOption {
  const CombatActionOption({
    required this.actionId,
    required this.label,
    required this.timingCategory,
    this.available = false,
    this.targetCandidates = const [],
    this.minTargets,
    this.maxTargets,
    this.requiresAllyConfirmation = false,
    this.supportsNonlethalIntent = false,
  });

  factory CombatActionOption.fromJson(Map<String, dynamic> json) {
    return CombatActionOption(
      actionId: _text(json['action_id'] ?? json['id']),
      label: _text(json['label'] ?? json['player_label'], 'Action'),
      timingCategory: _text(json['timing_category'], 'action'),
      available: json['available'] != false,
      targetCandidates: _mapList(json['target_candidates'])
          .map(CombatTargetCandidate.fromJson)
          .toList(),
      minTargets: _int(json['min_targets'] ?? json['minimum_targets']),
      maxTargets: _int(json['max_targets'] ?? json['maximum_targets']),
      requiresAllyConfirmation:
          _bool(json['requires_ally_confirmation'] ?? json['ally_confirmation_required']),
      supportsNonlethalIntent: _bool(json['supports_nonlethal_intent']),
    );
  }

  final String actionId;
  final String label;
  final String timingCategory;
  final bool available;
  final List<CombatTargetCandidate> targetCandidates;
  final int? minTargets;
  final int? maxTargets;
  final bool requiresAllyConfirmation;
  final bool supportsNonlethalIntent;

  String get playerVisibleText => _playerSafeVisibleText([
        label,
        timingCategory,
        available ? 'available' : 'unavailable',
      ]);
}

class CombatTargetCandidate {
  const CombatTargetCandidate({
    required this.targetId,
    required this.label,
    this.faction,
    this.relation,
    this.healthBand,
  });

  factory CombatTargetCandidate.fromJson(Map<String, dynamic> json) {
    return CombatTargetCandidate(
      targetId: _text(json['target_id'] ?? json['participant_id'] ?? json['id']),
      label: _text(json['label'] ?? json['display_name'], 'Target'),
      faction: _text(json['faction']),
      relation: _text(json['relation']),
      healthBand: _text(json['health_band']),
    );
  }

  final String targetId;
  final String label;
  final String? faction;
  final String? relation;
  final String? healthBand;
}

class CombatMovementDestination {
  const CombatMovementDestination({
    required this.destinationZoneId,
    required this.label,
    this.transitionId,
    this.risk,
  });

  factory CombatMovementDestination.fromJson(Map<String, dynamic> json) {
    return CombatMovementDestination(
      destinationZoneId: _text(json['destination_zone_id'] ?? json['zone_id']),
      transitionId: _text(json['transition_id']),
      label: _text(json['player_label'] ?? json['label'], 'Move'),
      risk: _text(json['risk'] ?? json['known_opportunity_attack_risk']),
    );
  }

  final String destinationZoneId;
  final String label;
  final String? transitionId;
  final String? risk;

  String get playerVisibleText => _playerSafeVisibleText([label, risk]);
}

class CombatResultBundle {
  const CombatResultBundle({
    this.operationCategory,
    this.operationName,
    this.status,
    this.result,
    this.consequences = const [],
    this.progress = const [],
    this.visibleRolls = const [],
    this.latestEventSummary,
  });

  factory CombatResultBundle.fromJson(Map<String, dynamic> json) {
    final result = json['result'];
    return CombatResultBundle(
      operationCategory: _text(json['operation_category']),
      operationName: _text(json['operation_name']),
      status: _text(json['status']),
      result: result is Map
          ? _text(result['summary'] ?? result['text'] ?? result['label'])
          : _text(result),
      consequences: _stringList(json['consequences']),
      progress: _stringList(json['progress']),
      visibleRolls: _stringList(json['visible_rolls']),
      latestEventSummary: _text(json['latest_event_summary']),
    );
  }

  final String? operationCategory;
  final String? operationName;
  final String? status;
  final String? result;
  final List<String> consequences;
  final List<String> progress;
  final List<String> visibleRolls;
  final String? latestEventSummary;

  String get title =>
      operationName?.isNotEmpty == true ? operationName! : 'Latest Result';

  String get summary => [
        result,
        latestEventSummary,
      ].whereType<String>().firstWhere(
            (entry) => entry.trim().isNotEmpty,
            orElse: () => 'Combat result recorded.',
          );

  String get playerVisibleText => _playerSafeVisibleText([
        operationCategory,
        operationName,
        status,
        result,
        latestEventSummary,
        ...consequences,
        ...progress,
        ...visibleRolls,
      ]);
}

class CombatEvent {
  const CombatEvent({
    this.eventType,
    this.actor,
    this.summary,
    this.actionLabel,
    this.target,
    this.destinationZoneId,
    this.round,
    this.turn,
    this.order,
  });

  factory CombatEvent.fromJson(Map<String, dynamic> json) {
    return CombatEvent(
      eventType: _text(json['event_type'] ?? json['type']),
      actor: _text(json['actor']),
      summary: _text(json['summary'] ?? json['visible_result']),
      actionLabel: _text(json['action_label']),
      target: _text(json['target']),
      destinationZoneId: _text(json['destination_zone_id']),
      round: _int(json['round']),
      turn: _text(json['turn'] ?? json['turn_group_id']),
      order: _int(json['order']),
    );
  }

  final String? eventType;
  final String? actor;
  final String? summary;
  final String? actionLabel;
  final String? target;
  final String? destinationZoneId;
  final int? round;
  final String? turn;
  final int? order;

  String get playerVisibleText => _playerSafeVisibleText([
        eventType,
        actor,
        summary,
        actionLabel,
        target,
        destinationZoneId,
        round?.toString(),
        turn,
      ]);
}

class CombatReactionState {
  const CombatReactionState({
    required this.reactionState,
    this.triggerSummary,
    this.options = const [],
    this.declineLabel,
    this.timeoutBehavior,
    this.preferenceLabel,
  });

  factory CombatReactionState.fromJson(Map<String, dynamic> json) {
    final trigger = _map(json['trigger']);
    final decline = _map(json['decline_option']);
    return CombatReactionState(
      reactionState: _text(json['reaction_state']),
      triggerSummary: _text(trigger['summary'] ?? json['trigger_summary']),
      options: _mapList(json['legal_reaction_options'])
          .map(CombatReactionOption.fromJson)
          .toList(),
      declineLabel: _text(decline['label'], 'Decline'),
      timeoutBehavior: _text(json['timeout_behavior']),
      preferenceLabel: _text(json['applied_preference']),
    );
  }

  final String reactionState;
  final String? triggerSummary;
  final List<CombatReactionOption> options;
  final String? declineLabel;
  final String? timeoutBehavior;
  final String? preferenceLabel;

  bool get isPresent =>
      reactionState.isNotEmpty || triggerSummary?.isNotEmpty == true;
  bool get isWaiting => reactionState == 'waiting_for_player';

  String get playerVisibleText => _playerSafeVisibleText([
        reactionState,
        triggerSummary,
        declineLabel,
        timeoutBehavior,
        preferenceLabel,
        for (final option in options) option.playerVisibleText,
      ]);
}

class CombatReactionOption {
  const CombatReactionOption({
    required this.reactionId,
    required this.label,
    this.description,
    this.visibleCost,
  });

  factory CombatReactionOption.fromJson(Map<String, dynamic> json) {
    return CombatReactionOption(
      reactionId: _text(json['reaction_id']),
      label: _text(json['player_name'] ?? json['label'], 'Reaction'),
      description: _text(json['player_safe_description']),
      visibleCost: _text(json['visible_cost']),
    );
  }

  final String reactionId;
  final String label;
  final String? description;
  final String? visibleCost;

  String get playerVisibleText => _playerSafeVisibleText([label, description]);
}

class CombatFocusState {
  const CombatFocusState({
    this.status,
    this.suggestions = const [],
    this.groups = const [],
    this.currentAnswer,
  });

  factory CombatFocusState.fromJson(Map<String, dynamic> json) {
    final focus = _map(json['combat_focus']).isNotEmpty
        ? _map(json['combat_focus'])
        : _map(json['focus']);
    if (focus.isEmpty && json['focus_available'] != true) {
      return const CombatFocusState();
    }
    return CombatFocusState(
      status: _text(focus['status'], json['focus_available'] == true ? 'available' : ''),
      suggestions: _mapList(focus['suggestions'])
          .map((entry) => CombatFocusSuggestion(
                templateId: _text(entry['template_id'] ?? entry['id']),
                label: _text(entry['label'] ?? entry['question'], 'Question'),
                group: _text(entry['group']),
              ))
          .toList(),
      groups: _mapList(focus['groups'])
          .map((entry) => _text(entry['label'] ?? entry['group']))
          .where((entry) => entry.isNotEmpty)
          .toList(),
      currentAnswer: _text(_map(focus['current_answer'])['answer'] ??
          _map(focus['answer'])['answer'] ??
          focus['answer']),
    );
  }

  final String? status;
  final List<CombatFocusSuggestion> suggestions;
  final List<String> groups;
  final String? currentAnswer;

  bool get isPresent =>
      status?.isNotEmpty == true ||
      suggestions.isNotEmpty ||
      currentAnswer?.isNotEmpty == true;

  String get playerVisibleText => _playerSafeVisibleText([
        status,
        currentAnswer,
        ...groups,
        for (final suggestion in suggestions) suggestion.label,
      ]);
}

class CombatFocusSuggestion {
  const CombatFocusSuggestion({
    required this.templateId,
    required this.label,
    this.group,
  });

  final String templateId;
  final String label;
  final String? group;
}

class CombatResolutionState {
  const CombatResolutionState({
    this.status,
    this.summary,
    this.aftermathTitle,
    this.aftermathLabel,
    this.rewards,
    this.review,
    this.choices = const [],
    this.nextStep,
  });

  factory CombatResolutionState.fromJson(Map<String, dynamic> json) {
    final aftermath = _map(json['aftermath']);
    final outcome = _map(json['outcome']);
    final review = _map(json['review']).isNotEmpty
        ? CombatReview.fromJson(_map(json['review']))
        : null;
    final rewards =
        _map(json['rewards']).isNotEmpty ? CombatRewards.fromJson(_map(json['rewards'])) : null;
    return CombatResolutionState(
      status: _text(json['status'] ?? outcome['status']),
      summary: _text(
        aftermath['summary'] ?? outcome['summary'] ?? review?.summary,
      ),
      aftermathTitle: _text(aftermath['title']),
      aftermathLabel: _text(aftermath['label'] ?? outcome['outcome_id']),
      rewards: rewards,
      review: review,
      choices: _mapList(json['resolution_choices'])
          .map(CombatResolutionChoice.fromJson)
          .toList(),
      nextStep: _text(json['next_step']),
    );
  }

  final String? status;
  final String? summary;
  final String? aftermathTitle;
  final String? aftermathLabel;
  final CombatRewards? rewards;
  final CombatReview? review;
  final List<CombatResolutionChoice> choices;
  final String? nextStep;

  bool get isPresent =>
      status == 'complete' ||
      status == 'resolution_phase_ready' ||
      summary?.isNotEmpty == true ||
      aftermathTitle?.isNotEmpty == true ||
      review != null ||
      rewards != null ||
      choices.isNotEmpty;

  String get playerVisibleText => _playerSafeVisibleText([
        status,
        summary,
        aftermathTitle,
        aftermathLabel,
        rewards?.playerVisibleText,
        review?.playerVisibleText,
        nextStep,
        for (final choice in choices) choice.label,
      ]);
}

class CombatResolutionChoice {
  const CombatResolutionChoice({
    required this.choiceId,
    required this.label,
    this.summary,
  });

  factory CombatResolutionChoice.fromJson(Map<String, dynamic> json) {
    return CombatResolutionChoice(
      choiceId: _text(json['choice_id'] ?? json['outcome_id'] ?? json['id']),
      label: _text(json['label'], 'Resolve'),
      summary: _text(json['summary']),
    );
  }

  final String choiceId;
  final String label;
  final String? summary;
}

class CombatRewards {
  const CombatRewards({
    this.experiencePointsAwarded = 0,
    this.items = const [],
    this.pendingAdvancement = false,
    this.targetLevel,
  });

  factory CombatRewards.fromJson(Map<String, dynamic> json) {
    final pending = _map(json['pending_advancement']);
    return CombatRewards(
      experiencePointsAwarded: _int(json['experience_points_awarded']) ?? 0,
      items: _mapList(json['items'])
          .map((entry) => _text(entry['label'] ?? entry['name']))
          .where((entry) => entry.isNotEmpty)
          .toList(),
      pendingAdvancement: _bool(pending['available']),
      targetLevel: _int(pending['target_level']),
    );
  }

  final int experiencePointsAwarded;
  final List<String> items;
  final bool pendingAdvancement;
  final int? targetLevel;

  String get playerVisibleText => _playerSafeVisibleText([
        '$experiencePointsAwarded XP',
        ...items,
        if (pendingAdvancement) 'pending advancement',
        targetLevel?.toString(),
      ]);
}

class CombatReview {
  const CombatReview({
    this.title,
    this.summary,
    this.log = const [],
    this.calculationDetailsAvailable = false,
  });

  factory CombatReview.fromJson(Map<String, dynamic> json) {
    return CombatReview(
      title: _text(json['title']),
      summary: _text(json['summary']),
      log: _mapList(json['chronological_log'])
          .map(CombatLogGroup.fromJson)
          .toList(),
      calculationDetailsAvailable: _bool(json['calculation_details_available']),
    );
  }

  final String? title;
  final String? summary;
  final List<CombatLogGroup> log;
  final bool calculationDetailsAvailable;

  String get playerVisibleText => _playerSafeVisibleText([
        title,
        summary,
        for (final group in log) group.playerVisibleText,
      ]);
}

class CombatLogGroup {
  const CombatLogGroup({
    this.round,
    this.turn,
    this.events = const [],
  });

  factory CombatLogGroup.fromJson(Map<String, dynamic> json) {
    return CombatLogGroup(
      round: _int(json['round']),
      turn: _text(json['turn']),
      events: _mapList(json['events']).map(CombatEvent.fromJson).toList(),
    );
  }

  final int? round;
  final String? turn;
  final List<CombatEvent> events;

  String get playerVisibleText => _playerSafeVisibleText([
        round?.toString(),
        turn,
        for (final event in events) event.playerVisibleText,
      ]);
}

class CombatRecoveryState {
  const CombatRecoveryState({
    this.message,
    this.refreshSafe = true,
    this.retrySafe = false,
    this.repairRequired = false,
  });

  factory CombatRecoveryState.fromJson(Map<String, dynamic> json) {
    final recovery = _map(json['recovery']);
    final message = _text(
      recovery['player_safe_message'] ??
          json['recovery_needed_message'] ??
          json['player_safe_message'],
    );
    return CombatRecoveryState(
      message: message,
      refreshSafe: recovery['refresh_safe'] == false ? false : true,
      retrySafe: _bool(recovery['retry_safe'] ?? json['retry_safe']),
      repairRequired:
          _bool(recovery['repair_required'] ?? json['repair_required']) ||
              message.toLowerCase().contains('gm review'),
    );
  }

  final String? message;
  final bool refreshSafe;
  final bool retrySafe;
  final bool repairRequired;

  bool get isPresent => message?.isNotEmpty == true;

  String get playerVisibleText => _playerSafeVisibleText([
        message,
        'refresh:$refreshSafe',
        'retry:$retrySafe',
        'repair:$repairRequired',
      ]);
}

class CombatEndTurnConfirmation {
  const CombatEndTurnConfirmation({
    required this.required,
    this.message,
    this.meaningfulForfeitures = const [],
  });

  factory CombatEndTurnConfirmation.fromJson(Map<String, dynamic> json) {
    return CombatEndTurnConfirmation(
      required: _bool(json['required']),
      message: _text(json['player_safe_message'] ?? json['message']),
      meaningfulForfeitures: _stringList(json['meaningful_forfeitures']),
    );
  }

  final bool required;
  final String? message;
  final List<String> meaningfulForfeitures;
}

class CombatOperationIntent {
  const CombatOperationIntent({
    required this.operationType,
    this.actionId,
    this.destinationZoneId,
    this.selectedTransitionIds = const [],
    this.targetIds = const [],
    this.confirmAllyRisk = false,
    this.nonlethalIntent = false,
    this.confirmEndTurn = false,
    this.focusText,
    this.reactionId,
    this.resolutionChoiceId,
  });

  final String operationType;
  final String? actionId;
  final String? destinationZoneId;
  final List<String> selectedTransitionIds;
  final List<String> targetIds;
  final bool confirmAllyRisk;
  final bool nonlethalIntent;
  final bool confirmEndTurn;
  final String? focusText;
  final String? reactionId;
  final String? resolutionChoiceId;

  Map<String, dynamic> toJson({
    String? idempotencyKey,
    String? sourceStateVersion,
    String? previewIdentity,
  }) {
    return {
      'operation_type': operationType,
      if (actionId != null) 'action_id': actionId,
      if (destinationZoneId != null) 'destination_zone_id': destinationZoneId,
      if (selectedTransitionIds.isNotEmpty)
        'selected_transition_ids': selectedTransitionIds,
      if (targetIds.isNotEmpty) 'target_ids': targetIds,
      if (confirmAllyRisk) 'confirm_ally_risk': true,
      if (nonlethalIntent) 'nonlethal_intent': true,
      if (confirmEndTurn) 'confirm_end_turn': true,
      if (focusText != null) 'focus_text': focusText,
      if (reactionId != null) 'reaction_id': reactionId,
      if (resolutionChoiceId != null) 'resolution_choice_id': resolutionChoiceId,
      if (idempotencyKey != null) 'idempotency_key': idempotencyKey,
      if (sourceStateVersion != null)
        'source_state_version': sourceStateVersion,
      if (previewIdentity != null) 'preview_identity': previewIdentity,
    };
  }
}

class CombatPreview {
  const CombatPreview({
    required this.status,
    required this.operationCategory,
    this.operationName,
    this.summary,
    this.sourceStateVersion,
    this.previewIdentity,
    this.costs = const [],
    this.risks = const [],
    this.confirmation,
    this.currentState,
  });

  factory CombatPreview.fromJson(Map<String, dynamic> json) {
    return CombatPreview(
      status: _text(json['status'], 'preview'),
      operationCategory: _text(json['operation_category']),
      operationName: _text(json['operation_name'] ?? json['label']),
      summary: _text(json['summary'] ??
          json['player_safe_summary'] ??
          json['player_safe_message']),
      sourceStateVersion: _text(json['source_state_version']),
      previewIdentity: _text(json['preview_identity']),
      costs: _stringList(json['costs'] ?? json['resource_costs']),
      risks: _stringList(json['risks'] ??
          json['known_risks'] ??
          (json['known_opportunity_attack_risk'] == null
              ? null
              : [json['known_opportunity_attack_risk']])),
      confirmation: _map(json['confirmation']).isNotEmpty
          ? CombatEndTurnConfirmation.fromJson(_map(json['confirmation']))
          : null,
      currentState: _map(json['current_read_model']).isNotEmpty
          ? CombatView.fromJson(_map(json['current_read_model']))
          : null,
    );
  }

  final String status;
  final String operationCategory;
  final String? operationName;
  final String? summary;
  final String? sourceStateVersion;
  final String? previewIdentity;
  final List<String> costs;
  final List<String> risks;
  final CombatEndTurnConfirmation? confirmation;
  final CombatView? currentState;
}

class CombatSubmitResult {
  const CombatSubmitResult({
    required this.status,
    this.message,
    this.result,
    this.currentView,
    this.duplicateHandled = false,
    this.stale = false,
  });

  factory CombatSubmitResult.fromJson(Map<String, dynamic> json) {
    final viewSource = _map(json['read_model']).isNotEmpty
        ? _map(json['read_model'])
        : _map(json['current_read_model']).isNotEmpty
            ? _map(json['current_read_model'])
            : const <String, dynamic>{};
    return CombatSubmitResult(
      status: _text(json['status'], 'submitted'),
      message: _text(json['player_safe_message'] ?? json['message']),
      result: _map(json['player_result_bundle']).isNotEmpty
          ? CombatResultBundle.fromJson(_map(json['player_result_bundle']))
          : null,
      currentView: viewSource.isNotEmpty ? CombatView.fromJson(viewSource) : null,
      duplicateHandled: _bool(json['duplicate_handled'] ?? json['duplicate']),
      stale: _text(json['status']).toLowerCase() == 'stale',
    );
  }

  final String status;
  final String? message;
  final CombatResultBundle? result;
  final CombatView? currentView;
  final bool duplicateHandled;
  final bool stale;
}
