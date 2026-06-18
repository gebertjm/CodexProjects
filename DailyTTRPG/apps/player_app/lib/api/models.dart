class AccountCapabilities {
  const AccountCapabilities({this.canAdvanceBeats = false});

  factory AccountCapabilities.fromJson(Map<String, dynamic> json) {
    return AccountCapabilities(
      canAdvanceBeats: json['can_advance_beats'] == true,
    );
  }

  final bool canAdvanceBeats;
}

class AccountSummary {
  const AccountSummary({
    required this.accountId,
    required this.firebaseUid,
    required this.email,
    required this.displayName,
    required this.photoUrl,
    required this.smsEnabled,
    required this.smsMode,
    this.capabilities = const AccountCapabilities(),
  });

  factory AccountSummary.fromJson(Map<String, dynamic> json) {
    return AccountSummary(
      accountId: json['account_id']?.toString() ?? '',
      firebaseUid: json['firebase_uid']?.toString() ?? '',
      email: json['email']?.toString(),
      displayName: json['display_name']?.toString() ?? 'Player',
      photoUrl: json['photo_url']?.toString(),
      smsEnabled: json['sms_enabled'] == true,
      smsMode: json['sms_mode']?.toString() ?? 'disabled',
      capabilities: json['capabilities'] is Map<String, dynamic>
          ? AccountCapabilities.fromJson(
              json['capabilities'] as Map<String, dynamic>)
          : const AccountCapabilities(),
    );
  }

  final String accountId;
  final String firebaseUid;
  final String? email;
  final String displayName;
  final String? photoUrl;
  final bool smsEnabled;
  final String smsMode;
  final AccountCapabilities capabilities;
}

class CharacterSummary {
  const CharacterSummary({
    required this.characterId,
    required this.name,
    required this.level,
    required this.characterClass,
    required this.species,
    required this.status,
    required this.isActive,
    this.subrace,
    this.background,
    this.trait,
    this.currentCampaign,
    this.pendingAction,
  });

  factory CharacterSummary.fromJson(Map<String, dynamic> json) {
    return CharacterSummary(
      characterId: json['character_id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unnamed',
      level: json['level'] is num ? (json['level'] as num).toInt() : 1,
      characterClass: json['class']?.toString(),
      species: json['species']?.toString() ?? json['race']?.toString(),
      subrace: json['subrace']?.toString(),
      status: json['status']?.toString() ?? 'unknown',
      isActive: json['is_active'] == true ||
          json['is_current_active'] == true ||
          json['is_active_character'] == true,
      background: json['background']?.toString(),
      trait: json['trait']?.toString(),
      currentCampaign: json['current_campaign'] is Map<String, dynamic>
          ? CampaignSummary.fromJson(
              json['current_campaign'] as Map<String, dynamic>)
          : null,
      pendingAction: json['pending_action'] is Map<String, dynamic>
          ? PendingActionStatus.fromJson(
              json['pending_action'] as Map<String, dynamic>)
          : null,
    );
  }

  final String characterId;
  final String name;
  final int level;
  final String? characterClass;
  final String? species;
  final String? subrace;
  final String status;
  final bool isActive;
  final String? background;
  final String? trait;
  final CampaignSummary? currentCampaign;
  final PendingActionStatus? pendingAction;
}

class PendingActionStatus {
  const PendingActionStatus({
    required this.hasPendingUnresolvedAction,
    required this.actionRequired,
    required this.status,
    this.actionWindowId,
    this.progressionWindowId,
    this.promptText,
    this.responseSummary,
  });

  factory PendingActionStatus.fromJson(Map<String, dynamic> json) {
    return PendingActionStatus(
      hasPendingUnresolvedAction: json['has_pending_unresolved_action'] == true,
      actionRequired: json['action_required'] == true,
      status: json['status']?.toString() ?? 'none',
      actionWindowId: json['action_window_id']?.toString(),
      progressionWindowId: json['progression_window_id']?.toString(),
      promptText: json['prompt_text']?.toString(),
      responseSummary: json['response_summary']?.toString(),
    );
  }

  final bool hasPendingUnresolvedAction;
  final bool actionRequired;
  final String status;
  final String? actionWindowId;
  final String? progressionWindowId;
  final String? promptText;
  final String? responseSummary;

  String get label {
    if (hasPendingUnresolvedAction) {
      return 'Action submitted';
    }
    if (actionRequired) {
      return 'Action needed';
    }
    return 'No current action';
  }
}

class CharacterCreationChoice {
  const CharacterCreationChoice({
    required this.id,
    required this.label,
    this.slug,
    this.description,
    this.extra = const {},
  });

  factory CharacterCreationChoice.fromJson(Map<String, dynamic> json) {
    return CharacterCreationChoice(
      id: json['id']?.toString() ?? json['slug']?.toString() ?? '',
      label: json['label']?.toString() ?? json['name']?.toString() ?? 'Option',
      slug: json['slug']?.toString(),
      description: json['description']?.toString(),
      extra: json,
    );
  }

  final String id;
  final String label;
  final String? slug;
  final String? description;
  final Map<String, dynamic> extra;
}

class SpeciesOption extends CharacterCreationChoice {
  SpeciesOption({
    required super.id,
    required super.label,
    super.slug,
    super.description,
    required this.subraces,
    super.extra = const {},
  });

  factory SpeciesOption.fromJson(Map<String, dynamic> json) {
    final subraces = json['subraces'];
    return SpeciesOption(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Species',
      slug: json['slug']?.toString(),
      description: json['description']?.toString(),
      subraces: subraces is List
          ? subraces
              .whereType<Map<String, dynamic>>()
              .map(CharacterCreationChoice.fromJson)
              .toList()
          : const [],
      extra: json,
    );
  }

  final List<CharacterCreationChoice> subraces;
}

class CharacterCreationOptions {
  const CharacterCreationOptions({
    required this.modes,
    required this.archetypes,
    required this.species,
    required this.classes,
    required this.attributePresets,
    required this.backgrounds,
    required this.traits,
    required this.standardArray,
    required this.defaultsPolicy,
  });

  factory CharacterCreationOptions.fromJson(Map<String, dynamic> json) {
    List<CharacterCreationChoice> choices(String key) {
      final value = json[key];
      return value is List
          ? value
              .whereType<Map<String, dynamic>>()
              .map(CharacterCreationChoice.fromJson)
              .toList()
          : const [];
    }

    final speciesJson = json['species'];
    final standardArrayJson = json['standard_array'];
    return CharacterCreationOptions(
      modes: choices('creation_modes'),
      archetypes: choices('archetypes'),
      species: speciesJson is List
          ? speciesJson
              .whereType<Map<String, dynamic>>()
              .map(SpeciesOption.fromJson)
              .toList()
          : const [],
      classes: choices('classes'),
      attributePresets: choices('attribute_presets'),
      backgrounds: choices('backgrounds'),
      traits: choices('traits'),
      standardArray: standardArrayJson is List
          ? standardArrayJson
              .whereType<num>()
              .map((value) => value.toInt())
              .toList()
          : const [15, 14, 13, 12, 10, 8],
      defaultsPolicy: json['defaults_policy'] is Map<String, dynamic>
          ? json['defaults_policy'] as Map<String, dynamic>
          : const {},
    );
  }

  final List<CharacterCreationChoice> modes;
  final List<CharacterCreationChoice> archetypes;
  final List<SpeciesOption> species;
  final List<CharacterCreationChoice> classes;
  final List<CharacterCreationChoice> attributePresets;
  final List<CharacterCreationChoice> backgrounds;
  final List<CharacterCreationChoice> traits;
  final List<int> standardArray;
  final Map<String, dynamic> defaultsPolicy;
}

class CharacterCreationDraft {
  const CharacterCreationDraft({
    required this.draftId,
    required this.mode,
    required this.currentStep,
    required this.status,
    required this.draft,
  });

  factory CharacterCreationDraft.fromJson(Map<String, dynamic> json) {
    return CharacterCreationDraft(
      draftId: json['draft_id']?.toString() ?? '',
      mode: json['mode']?.toString(),
      currentStep: json['current_step']?.toString() ?? 'mode',
      status: json['status']?.toString() ?? 'active',
      draft: json['draft'] is Map<String, dynamic>
          ? json['draft'] as Map<String, dynamic>
          : const {},
    );
  }

  final String draftId;
  final String? mode;
  final String currentStep;
  final String status;
  final Map<String, dynamic> draft;
}

class CreatedCharacterResult {
  const CreatedCharacterResult({
    required this.character,
    required this.activeCharacterChanged,
    required this.nextActions,
  });

  factory CreatedCharacterResult.fromJson(Map<String, dynamic> json) {
    final nextActions = json['next_actions'];
    return CreatedCharacterResult(
      character:
          CharacterSummary.fromJson(json['character'] as Map<String, dynamic>),
      activeCharacterChanged: json['active_character_changed'] == true,
      nextActions: nextActions is Map<String, dynamic> ? nextActions : const {},
    );
  }

  final CharacterSummary character;
  final bool activeCharacterChanged;
  final Map<String, dynamic> nextActions;

  bool get canStartAdventure => nextActions['can_start_adventure'] == true;
  bool get canSetActive => nextActions['can_set_active'] == true;
}

class CampaignSummary {
  const CampaignSummary({
    required this.campaignInstanceId,
    required this.campaignName,
    required this.worldName,
    required this.currentLocationName,
    required this.currentSceneName,
    required this.currentObjectiveTitle,
    required this.actionRequired,
  });

  factory CampaignSummary.fromJson(Map<String, dynamic> json) {
    final currentLocation = json['current_location'];
    final currentScene = json['current_scene'];
    final currentObjective = json['current_objective'];

    return CampaignSummary(
      campaignInstanceId: json['campaign_instance_id']?.toString() ?? '',
      campaignName: json['campaign_name']?.toString() ?? 'Adventure',
      worldName:
          json['world_name']?.toString() ?? json['world_slug']?.toString(),
      currentLocationName: json['current_location_label']?.toString() ??
          (currentLocation is Map ? currentLocation['name']?.toString() : null),
      currentSceneName:
          currentScene is Map ? currentScene['name']?.toString() : null,
      currentObjectiveTitle: json['current_objective'] is String
          ? json['current_objective']?.toString()
          : (currentObjective is Map
              ? currentObjective['title']?.toString()
              : null),
      actionRequired: json['action_required'] == true,
    );
  }

  final String campaignInstanceId;
  final String campaignName;
  final String? worldName;
  final String? currentLocationName;
  final String? currentSceneName;
  final String? currentObjectiveTitle;
  final bool actionRequired;
}

class StarterAdventureIntro {
  const StarterAdventureIntro({
    required this.id,
    required this.worldId,
    required this.worldName,
    required this.campaignPackageId,
    required this.campaignName,
    required this.introTitle,
    required this.introText,
    required this.beginLabel,
    required this.cancelLabel,
    required this.routeAfterStart,
    required this.configured,
  });

  factory StarterAdventureIntro.fromJson(Map<String, dynamic> json) {
    return StarterAdventureIntro(
      id: json['id']?.toString() ?? 'default_starter_adventure',
      worldId: json['world_id']?.toString() ?? '',
      worldName: json['world_name']?.toString() ?? 'Greyvale',
      campaignPackageId: json['campaign_package_id']?.toString() ?? '',
      campaignName:
          json['campaign_name']?.toString() ?? 'Shadows on the Grey Road',
      introTitle: json['intro_title']?.toString() ?? 'Start Adventure',
      introText: json['intro_text']?.toString() ?? '',
      beginLabel: json['begin_label']?.toString() ?? 'Begin Adventure',
      cancelLabel: json['cancel_label']?.toString() ?? 'Cancel',
      routeAfterStart:
          json['route_after_start']?.toString() ?? '/play/campaign',
      configured: json['configured'] != false,
    );
  }

  final String id;
  final String worldId;
  final String worldName;
  final String campaignPackageId;
  final String campaignName;
  final String introTitle;
  final String introText;
  final String beginLabel;
  final String cancelLabel;
  final String routeAfterStart;
  final bool configured;
}

class SubmittedSceneAction {
  const SubmittedSceneAction({
    required this.text,
    this.verb,
    this.targetLabel,
    this.targetAffordanceId,
    this.targetType,
    this.submittedAt,
    this.updatedAt,
    this.editable = false,
    this.version,
  });

  factory SubmittedSceneAction.fromJson(Map<String, dynamic> json) {
    return SubmittedSceneAction(
      text: json['text']?.toString() ?? json['raw_text']?.toString() ?? '',
      verb: json['verb']?.toString(),
      targetLabel: json['target_label']?.toString(),
      targetAffordanceId: json['target_affordance_id']?.toString(),
      targetType: json['target_type']?.toString(),
      submittedAt: json['submitted_at']?.toString(),
      updatedAt: json['updated_at']?.toString(),
      editable: json['editable'] == true,
      version: json['version'] is num ? (json['version'] as num).toInt() : null,
    );
  }

  final String text;
  final String? verb;
  final String? targetLabel;
  final String? targetAffordanceId;
  final String? targetType;
  final String? submittedAt;
  final String? updatedAt;
  final bool editable;
  final int? version;

  String get summary {
    if (verb != null && targetLabel != null) {
      return '${_humanizeModelText(verb!)} -> $targetLabel';
    }
    return text;
  }
}

class DashboardActionStatus {
  const DashboardActionStatus({
    required this.state,
    required this.label,
    required this.description,
    this.actionWindowId,
    this.submittedAction,
    this.submittedActionDetails,
    this.closesAt,
    this.canSubmit = false,
    this.canEdit = false,
    this.requiresPreviewBeforeSubmit = true,
    this.oneActionPolicy,
  });

  factory DashboardActionStatus.fromJson(Map<String, dynamic> json) {
    final submitted = json['submitted_action'];
    final submittedDetails = submitted is Map<String, dynamic>
        ? SubmittedSceneAction.fromJson(submitted)
        : null;
    return DashboardActionStatus(
      state: json['state']?.toString() ?? 'unknown',
      label: json['label']?.toString() ?? 'Unknown',
      description: json['description']?.toString() ?? '',
      actionWindowId: json['action_window_id']?.toString(),
      submittedAction: submittedDetails?.text ?? submitted?.toString(),
      submittedActionDetails: submittedDetails,
      closesAt: json['closes_at']?.toString(),
      canSubmit: json['can_submit'] == true,
      canEdit: json['can_edit'] == true || submittedDetails?.editable == true,
      requiresPreviewBeforeSubmit:
          json['requires_preview_before_submit'] != false,
      oneActionPolicy: json['one_action_policy']?.toString(),
    );
  }

  final String state;
  final String label;
  final String description;
  final String? actionWindowId;
  final String? submittedAction;
  final SubmittedSceneAction? submittedActionDetails;
  final String? closesAt;
  final bool canSubmit;
  final bool canEdit;
  final bool requiresPreviewBeforeSubmit;
  final String? oneActionPolicy;
}

class GreyvaleSliceEndpointStatus {
  const GreyvaleSliceEndpointStatus({
    required this.isEndpointReached,
    required this.state,
    required this.label,
    this.headline,
    this.message,
    this.latestDevelopment,
    this.currentStatus,
    this.nextStep,
    this.recoveryAction,
    this.currentSceneKey,
    this.currentObjectiveKey,
  });

  factory GreyvaleSliceEndpointStatus.fromJson(Map<String, dynamic> json) {
    return GreyvaleSliceEndpointStatus(
      isEndpointReached: json['is_endpoint_reached'] == true,
      state: json['state']?.toString() ?? 'unknown',
      label: json['label']?.toString() ?? 'Greyvale slice endpoint reached',
      headline: json['headline']?.toString(),
      message: json['message']?.toString(),
      latestDevelopment: json['latest_development']?.toString(),
      currentStatus: json['current_status']?.toString(),
      nextStep: json['next_step']?.toString(),
      recoveryAction: json['recovery_action']?.toString(),
      currentSceneKey: json['current_scene_key']?.toString(),
      currentObjectiveKey: json['current_objective_key']?.toString(),
    );
  }

  final bool isEndpointReached;
  final String state;
  final String label;
  final String? headline;
  final String? message;
  final String? latestDevelopment;
  final String? currentStatus;
  final String? nextStep;
  final String? recoveryAction;
  final String? currentSceneKey;
  final String? currentObjectiveKey;
}

class AdventureEnvironmentSummary {
  const AdventureEnvironmentSummary({
    this.weather,
    this.timeOfDay,
    this.season,
    this.lightLevel,
    this.visibility,
    this.moodOrTone,
    this.locationEnvironment,
    this.summary,
  });

  factory AdventureEnvironmentSummary.fromJson(Map<String, dynamic> json) {
    return AdventureEnvironmentSummary(
      weather: json['weather']?.toString(),
      timeOfDay: json['time_of_day']?.toString(),
      season: json['season']?.toString(),
      lightLevel: json['light_level']?.toString(),
      visibility: json['visibility']?.toString(),
      moodOrTone: json['mood_or_tone']?.toString(),
      locationEnvironment: json['location_environment']?.toString(),
      summary: json['summary']?.toString(),
    );
  }

  final String? weather;
  final String? timeOfDay;
  final String? season;
  final String? lightLevel;
  final String? visibility;
  final String? moodOrTone;
  final String? locationEnvironment;
  final String? summary;
}

class NpcPreviewSummary {
  const NpcPreviewSummary({
    required this.npcId,
    required this.displayName,
    this.activity,
    this.availability,
  });

  factory NpcPreviewSummary.fromJson(Map<String, dynamic> json) {
    return NpcPreviewSummary(
      npcId: json['npc_id']?.toString() ?? '',
      displayName: json['display_name']?.toString() ?? 'Someone nearby',
      activity: json['activity']?.toString(),
      availability: json['availability']?.toString(),
    );
  }

  final String npcId;
  final String displayName;
  final String? activity;
  final String? availability;
}

class CurrentAdventureDashboard {
  const CurrentAdventureDashboard({
    required this.hasActiveCampaign,
    required this.actionStatus,
    this.campaignInstanceId,
    this.worldInstanceId,
    this.worldId,
    this.worldName,
    this.campaignPackageId,
    this.campaignName,
    this.currentLocationName,
    this.currentSceneTitle,
    this.currentObjectiveTitle,
    this.environment,
    this.visibleNpcPreview = const [],
    this.additionalVisibleNpcCount = 0,
    this.sliceEndpoint,
    this.previewRoute,
    this.sceneRoute,
    this.fullSceneViewDeferredTo,
  });

  factory CurrentAdventureDashboard.fromJson(Map<String, dynamic> json) {
    final npcs = json['visible_npc_preview'];
    final objective = json['current_objective'];
    return CurrentAdventureDashboard(
      hasActiveCampaign: json['has_active_campaign'] == true,
      campaignInstanceId: json['campaign_instance_id']?.toString(),
      worldInstanceId: json['world_instance_id']?.toString(),
      worldId: json['world_id']?.toString(),
      worldName: json['world_name']?.toString(),
      campaignPackageId: json['campaign_package_id']?.toString(),
      campaignName: json['campaign_name']?.toString(),
      currentLocationName: json['current_location_name']?.toString(),
      currentSceneTitle: json['current_scene_title']?.toString(),
      currentObjectiveTitle: objective is Map
          ? objective['title']?.toString()
          : json['current_objective']?.toString(),
      environment: json['environment'] is Map<String, dynamic>
          ? AdventureEnvironmentSummary.fromJson(
              json['environment'] as Map<String, dynamic>)
          : null,
      visibleNpcPreview: npcs is List
          ? npcs
              .whereType<Map<String, dynamic>>()
              .map(NpcPreviewSummary.fromJson)
              .toList()
          : const [],
      additionalVisibleNpcCount: json['additional_visible_npc_count'] is num
          ? (json['additional_visible_npc_count'] as num).toInt()
          : 0,
      sliceEndpoint: json['slice_endpoint'] is Map<String, dynamic>
          ? GreyvaleSliceEndpointStatus.fromJson(
              json['slice_endpoint'] as Map<String, dynamic>)
          : null,
      actionStatus: DashboardActionStatus.fromJson(
        json['action_status'] is Map<String, dynamic>
            ? json['action_status'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      previewRoute: json['preview_route']?.toString(),
      sceneRoute: json['scene_route']?.toString(),
      fullSceneViewDeferredTo: json['full_scene_view_deferred_to']?.toString(),
    );
  }

  final bool hasActiveCampaign;
  final String? campaignInstanceId;
  final String? worldInstanceId;
  final String? worldId;
  final String? worldName;
  final String? campaignPackageId;
  final String? campaignName;
  final String? currentLocationName;
  final String? currentSceneTitle;
  final String? currentObjectiveTitle;
  final AdventureEnvironmentSummary? environment;
  final List<NpcPreviewSummary> visibleNpcPreview;
  final int additionalVisibleNpcCount;
  final GreyvaleSliceEndpointStatus? sliceEndpoint;
  final DashboardActionStatus actionStatus;
  final String? previewRoute;
  final String? sceneRoute;
  final String? fullSceneViewDeferredTo;
}

class DashboardNextActions {
  const DashboardNextActions({
    required this.canCreateCharacter,
    required this.canResumeDraft,
    required this.canStartAdventure,
    required this.canContinueAdventure,
    required this.createCharacterRoute,
    required this.resumeDraftRoute,
    required this.continueRoute,
    required this.manageCharactersRoute,
  });

  factory DashboardNextActions.fromJson(Map<String, dynamic> json) {
    return DashboardNextActions(
      canCreateCharacter: json['can_create_character'] == true,
      canResumeDraft: json['can_resume_draft'] == true,
      canStartAdventure: json['can_start_adventure'] == true,
      canContinueAdventure: json['can_continue_adventure'] == true,
      createCharacterRoute: json['create_character_route']?.toString() ??
          '/play/create-character',
      resumeDraftRoute: json['resume_draft_route']?.toString(),
      continueRoute: json['continue_route']?.toString(),
      manageCharactersRoute:
          json['manage_characters_route']?.toString() ?? '/play/characters',
    );
  }

  final bool canCreateCharacter;
  final bool canResumeDraft;
  final bool canStartAdventure;
  final bool canContinueAdventure;
  final String createCharacterRoute;
  final String? resumeDraftRoute;
  final String? continueRoute;
  final String manageCharactersRoute;
}

class CharactersDashboardSummary {
  const CharactersDashboardSummary({
    required this.count,
    required this.manageRoute,
  });

  factory CharactersDashboardSummary.fromJson(Map<String, dynamic> json) {
    return CharactersDashboardSummary(
      count: json['count'] is num ? (json['count'] as num).toInt() : 0,
      manageRoute: json['manage_route']?.toString() ?? '/play/characters',
    );
  }

  final int count;
  final String manageRoute;
}

class PlayerDashboard {
  const PlayerDashboard({
    required this.account,
    required this.activeCharacter,
    required this.charactersSummary,
    required this.currentAdventure,
    required this.starterAdventure,
    required this.nextActions,
  });

  factory PlayerDashboard.fromJson(Map<String, dynamic> json) {
    return PlayerDashboard(
      account: AccountSummary.fromJson(
        json['account'] is Map<String, dynamic>
            ? json['account'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      activeCharacter: json['active_character'] is Map<String, dynamic>
          ? CharacterSummary.fromJson(
              json['active_character'] as Map<String, dynamic>)
          : null,
      charactersSummary: CharactersDashboardSummary.fromJson(
        json['characters_summary'] is Map<String, dynamic>
            ? json['characters_summary'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      currentAdventure: CurrentAdventureDashboard.fromJson(
        json['current_adventure'] is Map<String, dynamic>
            ? json['current_adventure'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      starterAdventure: StarterAdventureIntro.fromJson(
        json['starter_adventure'] is Map<String, dynamic>
            ? json['starter_adventure'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      nextActions: DashboardNextActions.fromJson(
        json['next_actions'] is Map<String, dynamic>
            ? json['next_actions'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
    );
  }

  final AccountSummary account;
  final CharacterSummary? activeCharacter;
  final CharactersDashboardSummary charactersSummary;
  final CurrentAdventureDashboard currentAdventure;
  final StarterAdventureIntro starterAdventure;
  final DashboardNextActions nextActions;
}

class StartAdventureResult {
  const StartAdventureResult({
    required this.dashboard,
    required this.currentAdventure,
    required this.route,
    this.currentScene,
  });

  factory StartAdventureResult.fromJson(Map<String, dynamic> json) {
    return StartAdventureResult(
      dashboard: PlayerDashboard.fromJson(
        json['dashboard'] is Map<String, dynamic>
            ? json['dashboard'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      currentAdventure: CurrentAdventureDashboard.fromJson(
        json['current_adventure'] is Map<String, dynamic>
            ? json['current_adventure'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      currentScene: json['current_scene'] is Map<String, dynamic>
          ? CurrentSceneView.fromJson(
              json['current_scene'] as Map<String, dynamic>)
          : null,
      route: json['route']?.toString() ?? '/play/campaign/scene',
    );
  }

  final PlayerDashboard dashboard;
  final CurrentAdventureDashboard currentAdventure;
  final String route;
  final CurrentSceneView? currentScene;
}

String _humanizeModelText(String value) {
  final words = value.replaceAll('_', ' ').replaceAll('-', ' ').split(' ');
  return words
      .where((word) => word.trim().isNotEmpty)
      .map((word) => word[0].toUpperCase() + word.substring(1))
      .join(' ');
}

class CurrentSceneCampaign {
  const CurrentSceneCampaign({
    this.campaignInstanceId,
    this.campaignName,
    this.worldInstanceId,
    this.worldId,
    this.worldName,
  });

  factory CurrentSceneCampaign.fromJson(Map<String, dynamic> json) {
    return CurrentSceneCampaign(
      campaignInstanceId: json['campaign_instance_id']?.toString(),
      campaignName:
          json['campaign_name']?.toString() ?? json['name']?.toString(),
      worldInstanceId: json['world_instance_id']?.toString(),
      worldId: json['world_id']?.toString(),
      worldName: json['world_name']?.toString(),
    );
  }

  final String? campaignInstanceId;
  final String? campaignName;
  final String? worldInstanceId;
  final String? worldId;
  final String? worldName;
}

class CurrentSceneSummary {
  const CurrentSceneSummary({
    this.sceneId,
    this.key,
    this.title,
    this.locationId,
    this.locationKey,
    this.locationName,
    this.summary,
    this.description,
  });

  factory CurrentSceneSummary.fromJson(Map<String, dynamic> json) {
    return CurrentSceneSummary(
      sceneId: json['scene_id']?.toString(),
      key: json['key']?.toString(),
      title: json['title']?.toString() ?? json['name']?.toString() ?? 'Scene',
      locationId: json['location_id']?.toString(),
      locationKey: json['location_key']?.toString(),
      locationName: json['location_name']?.toString(),
      summary: json['summary']?.toString(),
      description: json['description']?.toString(),
    );
  }

  final String? sceneId;
  final String? key;
  final String? title;
  final String? locationId;
  final String? locationKey;
  final String? locationName;
  final String? summary;
  final String? description;
}

class SceneKnownFact {
  const SceneKnownFact({
    required this.knowledgeId,
    required this.text,
    this.type,
    this.publicLabel,
    this.confidence,
  });

  factory SceneKnownFact.fromJson(Map<String, dynamic> json) {
    final label = json['public_label']?.toString();
    return SceneKnownFact(
      knowledgeId: json['knowledge_id']?.toString() ?? '',
      type: json['type']?.toString(),
      text: json['text']?.toString() ?? label ?? '',
      publicLabel: label,
      confidence: json['confidence']?.toString(),
    );
  }

  final String knowledgeId;
  final String text;
  final String? type;
  final String? publicLabel;
  final String? confidence;
}

class SceneObjective {
  const SceneObjective({
    this.objectiveId,
    this.key,
    this.title,
    this.status,
    this.knownProgress = const [],
  });

  factory SceneObjective.fromJson(Map<String, dynamic> json) {
    final progress = json['known_progress'];
    return SceneObjective(
      objectiveId: json['objective_id']?.toString(),
      key: json['key']?.toString(),
      title: json['title']?.toString(),
      status: json['status']?.toString(),
      knownProgress: progress is List
          ? progress
              .whereType<Map<String, dynamic>>()
              .map(SceneKnownFact.fromJson)
              .where((fact) => fact.text.isNotEmpty)
              .toList()
          : const [],
    );
  }

  final String? objectiveId;
  final String? key;
  final String? title;
  final String? status;
  final List<SceneKnownFact> knownProgress;
}

class SceneNpc {
  const SceneNpc({
    required this.npcId,
    required this.displayName,
    required this.actions,
    this.trueNameKnown = false,
    this.activity,
    this.activityText,
    this.availability,
    this.visibility,
    this.presence,
    this.lastKnownLocationLabel,
    this.relevance,
    this.dialogueSceneId,
    this.dialogueTitle,
  });

  factory SceneNpc.fromJson(Map<String, dynamic> json) {
    return SceneNpc(
      npcId: json['npc_id']?.toString() ?? '',
      displayName: json['display_name']?.toString() ?? 'Someone nearby',
      trueNameKnown: json['true_name_known'] == true,
      activity: json['activity']?.toString(),
      activityText: json['activity_text']?.toString(),
      availability: json['availability']?.toString(),
      visibility: json['visibility']?.toString(),
      presence: json['presence']?.toString(),
      lastKnownLocationLabel: json['last_known_location_label']?.toString(),
      relevance: json['relevance']?.toString(),
      dialogueSceneId: json['dialogue_scene_id']?.toString(),
      dialogueTitle: json['dialogue_title']?.toString(),
      actions: json['actions'] is List
          ? (json['actions'] as List).map((entry) => entry.toString()).toList()
          : json['available_actions'] is List
              ? (json['available_actions'] as List)
                  .map((entry) => entry.toString())
                  .toList()
              : const [],
    );
  }

  final String npcId;
  final String displayName;
  final bool trueNameKnown;
  final String? activity;
  final String? activityText;
  final String? availability;
  final String? visibility;
  final String? presence;
  final String? lastKnownLocationLabel;
  final String? relevance;
  final String? dialogueSceneId;
  final String? dialogueTitle;
  final List<String> actions;
}

class SceneAffordance {
  const SceneAffordance({
    required this.affordanceId,
    required this.label,
    required this.type,
    required this.actions,
    this.description,
    this.state,
    this.tags = const [],
    this.aliases = const [],
    this.dialogueSceneId,
    this.dialogueTitle,
  });

  factory SceneAffordance.fromJson(Map<String, dynamic> json) {
    return SceneAffordance(
      affordanceId: json['affordance_id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Something nearby',
      type: json['type']?.toString() ?? 'other',
      description: json['description']?.toString(),
      state: json['state']?.toString(),
      tags: json['tags'] is List
          ? (json['tags'] as List).map((entry) => entry.toString()).toList()
          : const [],
      aliases: json['aliases'] is List
          ? (json['aliases'] as List).map((entry) => entry.toString()).toList()
          : const [],
      dialogueSceneId: json['dialogue_scene_id']?.toString(),
      dialogueTitle: json['dialogue_title']?.toString(),
      actions: json['actions'] is List
          ? (json['actions'] as List).map((entry) => entry.toString()).toList()
          : const [],
    );
  }

  final String affordanceId;
  final String label;
  final String type;
  final String? description;
  final String? state;
  final List<String> tags;
  final List<String> aliases;
  final String? dialogueSceneId;
  final String? dialogueTitle;
  final List<String> actions;
}

class SceneStateSummaryEntry {
  const SceneStateSummaryEntry({
    required this.label,
    required this.text,
  });

  factory SceneStateSummaryEntry.fromJson(Map<String, dynamic> json) {
    return SceneStateSummaryEntry(
      label: json['label']?.toString() ?? 'Known detail',
      text: json['text']?.toString() ?? '',
    );
  }

  final String label;
  final String text;
}

class SceneBeatResult {
  const SceneBeatResult({
    required this.text,
    this.createdAt,
    this.sourceType,
    this.actionKey,
    this.sceneId,
  });

  factory SceneBeatResult.fromJson(Map<String, dynamic> json) {
    return SceneBeatResult(
      text: json['text']?.toString() ??
          json['summary']?.toString() ??
          json['description']?.toString() ??
          '',
      createdAt: json['created_at']?.toString(),
      sourceType: json['source_type']?.toString(),
      actionKey: json['action_key']?.toString(),
      sceneId: json['scene_id']?.toString(),
    );
  }

  final String text;
  final String? createdAt;
  final String? sourceType;
  final String? actionKey;
  final String? sceneId;
}

class SceneResultEntry {
  const SceneResultEntry({
    required this.beatResultId,
    required this.title,
    required this.summary,
    required this.narration,
    required this.sceneType,
    required this.kind,
    required this.visibleChanges,
    required this.knowledgeGained,
    required this.objectiveUpdates,
    required this.safeMechanics,
    this.submittedActionSummary,
    this.interpretedActionSummary,
    this.dialogueSceneId,
    this.dialogueTitle,
    this.resolvedAt,
    this.isLatest = false,
    this.highlight = false,
  });

  factory SceneResultEntry.fromJson(Map<String, dynamic> json) {
    String? textValue(dynamic value) {
      final text = value?.toString().trim();
      return text == null || text.isEmpty ? null : text;
    }

    String? mapTextValue(dynamic value, String key) {
      if (value is! Map<String, dynamic>) {
        return null;
      }
      return textValue(value[key]);
    }

    List<String> textList(String key) {
      final value = json[key];
      if (value is! List) {
        return const [];
      }
      return value
          .whereType<Map<String, dynamic>>()
          .map((entry) =>
              entry['text']?.toString() ??
              entry['progress_text']?.toString() ??
              entry['summary']?.toString() ??
              '')
          .where((entry) => entry.trim().isNotEmpty)
          .toList();
    }

    final mechanics = json['mechanical_details'];
    final mechanicEntries = mechanics is Map<String, dynamic>
        ? mechanics['entries']
        : json['safe_mechanics'];
    final dialogue = json['dialogue'];
    final provenance = json['provenance'];
    return SceneResultEntry(
      beatResultId:
          json['beat_result_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Latest development',
      summary:
          json['summary']?.toString() ?? json['narration']?.toString() ?? '',
      narration:
          json['narration']?.toString() ?? json['summary']?.toString() ?? '',
      sceneType: json['scene_type']?.toString() ?? 'exploration',
      kind: json['kind']?.toString() ??
          json['result_kind']?.toString() ??
          'exploration_result',
      submittedActionSummary: json['submitted_action_summary']?.toString(),
      interpretedActionSummary: json['interpreted_action_summary']?.toString(),
      dialogueSceneId: textValue(json['dialogue_scene_id']) ??
          textValue(json['dialogueSceneId']) ??
          mapTextValue(dialogue, 'dialogue_scene_id') ??
          mapTextValue(dialogue, 'dialogueSceneId') ??
          mapTextValue(provenance, 'dialogue_scene_id') ??
          mapTextValue(provenance, 'dialogueSceneId'),
      dialogueTitle: textValue(json['dialogue_title']) ??
          textValue(json['dialogueTitle']) ??
          mapTextValue(dialogue, 'dialogue_title') ??
          mapTextValue(dialogue, 'dialogueTitle') ??
          mapTextValue(provenance, 'dialogue_title') ??
          mapTextValue(provenance, 'dialogueTitle'),
      visibleChanges: textList('visible_changes'),
      knowledgeGained: textList('knowledge_gained'),
      objectiveUpdates: textList('objective_updates'),
      safeMechanics: mechanicEntries is List
          ? mechanicEntries
              .whereType<Map<String, dynamic>>()
              .map((entry) =>
                  entry['text']?.toString() ?? entry['label']?.toString() ?? '')
              .where((entry) => entry.trim().isNotEmpty)
              .toList()
          : const [],
      resolvedAt: json['resolved_at']?.toString(),
      isLatest: json['is_latest'] == true,
      highlight: json['highlight'] == true,
    );
  }

  final String beatResultId;
  final String title;
  final String summary;
  final String narration;
  final String sceneType;
  final String kind;
  final String? submittedActionSummary;
  final String? interpretedActionSummary;
  final String? dialogueSceneId;
  final String? dialogueTitle;
  final List<String> visibleChanges;
  final List<String> knowledgeGained;
  final List<String> objectiveUpdates;
  final List<String> safeMechanics;
  final String? resolvedAt;
  final bool isLatest;
  final bool highlight;

  String get text => narration.trim().isNotEmpty ? narration : summary;
}

class SceneResultFeed {
  const SceneResultFeed({
    required this.sceneType,
    required this.recentEntries,
    this.sceneId,
    this.latestResult,
    this.displayMode,
    this.maxEntries = 5,
  });

  factory SceneResultFeed.fromJson(Map<String, dynamic> json) {
    final entries = json['recent_entries'] is List
        ? (json['recent_entries'] as List)
            .whereType<Map<String, dynamic>>()
            .map(SceneResultEntry.fromJson)
            .where((entry) => entry.text.trim().isNotEmpty)
            .toList()
        : <SceneResultEntry>[];
    final latest = json['latest_result'] is Map<String, dynamic>
        ? SceneResultEntry.fromJson(
            json['latest_result'] as Map<String, dynamic>)
        : entries.isNotEmpty
            ? entries.first
            : null;
    return SceneResultFeed(
      sceneId: json['scene_id']?.toString(),
      sceneType:
          json['scene_type']?.toString() ?? latest?.sceneType ?? 'exploration',
      displayMode: json['result_display_mode']?.toString(),
      latestResult: latest,
      recentEntries: entries,
      maxEntries:
          json['max_entries'] is num ? (json['max_entries'] as num).toInt() : 5,
    );
  }

  final String? sceneId;
  final String sceneType;
  final String? displayMode;
  final SceneResultEntry? latestResult;
  final List<SceneResultEntry> recentEntries;
  final int maxEntries;
}

class SceneRecentSummary {
  const SceneRecentSummary({
    this.latestBeat,
    this.results = const [],
  });

  factory SceneRecentSummary.fromJson(Map<String, dynamic> json) {
    final parsedResults = json['results'] is List
        ? (json['results'] as List)
            .whereType<Map<String, dynamic>>()
            .map(SceneBeatResult.fromJson)
            .where((result) => result.text.trim().isNotEmpty)
            .toList()
        : <SceneBeatResult>[];
    final latestBeat = json['latest_beat']?.toString() ??
        (parsedResults.isNotEmpty ? parsedResults.first.text : null);
    final results = parsedResults.isNotEmpty
        ? parsedResults
        : latestBeat == null || latestBeat.trim().isEmpty
            ? const <SceneBeatResult>[]
            : [SceneBeatResult(text: latestBeat)];

    return SceneRecentSummary(latestBeat: latestBeat, results: results);
  }

  final String? latestBeat;
  final List<SceneBeatResult> results;
}

class SceneMechanicalEffect {
  const SceneMechanicalEffect({
    this.label,
    this.reason,
    this.mechanical,
    this.narrativeHint,
    this.modifier,
    this.skill,
    this.context,
  });

  factory SceneMechanicalEffect.fromJson(Map<String, dynamic> json) {
    final skill = json['skill']?.toString();
    final context = json['context']?.toString();
    final modifier = json['modifier'];
    return SceneMechanicalEffect(
      label: json['label']?.toString() ??
          json['environment_key']?.toString() ??
          'Environment',
      reason: json['reason']?.toString(),
      narrativeHint: json['narrative_hint']?.toString(),
      modifier: modifier is num ? modifier.toInt() : null,
      skill: skill,
      context: context,
      mechanical: json['mechanical']?.toString() ??
          (modifier is num
              ? '${skill ?? 'Check'}${context == null ? '' : ' $context'}: ${modifier > 0 ? '+' : ''}${modifier.toInt()}'
              : null),
    );
  }

  final String? label;
  final String? reason;
  final String? mechanical;
  final String? narrativeHint;
  final int? modifier;
  final String? skill;
  final String? context;
}

class SceneMechanicalDetails {
  const SceneMechanicalDetails({
    required this.environmentModifiers,
    required this.safeCharacterContext,
    this.actionWindow,
  });

  factory SceneMechanicalDetails.fromJson(Map<String, dynamic> json) {
    final modifiers = json['environment_modifiers'];
    return SceneMechanicalDetails(
      environmentModifiers: modifiers is List
          ? modifiers
              .whereType<Map<String, dynamic>>()
              .map(SceneMechanicalEffect.fromJson)
              .toList()
          : const [],
      actionWindow: json['action_window'] is Map<String, dynamic>
          ? json['action_window'] as Map<String, dynamic>
          : null,
      safeCharacterContext:
          json['safe_character_context'] is Map<String, dynamic>
              ? json['safe_character_context'] as Map<String, dynamic>
              : const {},
    );
  }

  final List<SceneMechanicalEffect> environmentModifiers;
  final Map<String, dynamic>? actionWindow;
  final Map<String, dynamic> safeCharacterContext;
}

class SceneNarrationParagraph {
  const SceneNarrationParagraph({
    required this.kind,
    required this.text,
  });

  factory SceneNarrationParagraph.fromJson(Map<String, dynamic> json) {
    return SceneNarrationParagraph(
      kind: json['kind']?.toString() ?? 'narration',
      text: json['text']?.toString() ?? '',
    );
  }

  final String kind;
  final String text;
}

class SceneNarration {
  const SceneNarration({
    required this.mode,
    required this.voice,
    required this.title,
    required this.paragraphs,
    this.summary,
    this.fullCurrentNarrationAvailable = false,
    this.fullCurrentParagraphs = const [],
  });

  factory SceneNarration.fromJson(Map<String, dynamic> json) {
    List<SceneNarrationParagraph> paragraphsFrom(dynamic value) {
      return value is List
          ? value
              .whereType<Map<String, dynamic>>()
              .map(SceneNarrationParagraph.fromJson)
              .where((paragraph) => paragraph.text.trim().isNotEmpty)
              .toList()
          : const <SceneNarrationParagraph>[];
    }

    final full = json['full_current_narration'];
    return SceneNarration(
      mode: json['mode']?.toString() ?? 'full',
      voice: json['voice']?.toString() ?? 'second_person_present',
      title: json['title']?.toString() ?? 'Current Scene',
      summary: json['summary']?.toString(),
      paragraphs: paragraphsFrom(json['paragraphs']),
      fullCurrentNarrationAvailable:
          json['full_current_narration_available'] == true,
      fullCurrentParagraphs: full is Map<String, dynamic>
          ? paragraphsFrom(full['paragraphs'])
          : const <SceneNarrationParagraph>[],
    );
  }

  final String mode;
  final String voice;
  final String title;
  final String? summary;
  final List<SceneNarrationParagraph> paragraphs;
  final bool fullCurrentNarrationAvailable;
  final List<SceneNarrationParagraph> fullCurrentParagraphs;
}

class SceneReferenceEntry {
  const SceneReferenceEntry({
    required this.id,
    required this.type,
    required this.label,
    this.description,
    this.dialogueSceneId,
    this.dialogueTitle,
  });

  factory SceneReferenceEntry.fromJson(Map<String, dynamic> json) {
    return SceneReferenceEntry(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'target',
      label: json['label']?.toString() ?? '',
      description: json['description']?.toString(),
      dialogueSceneId: json['dialogue_scene_id']?.toString(),
      dialogueTitle: json['dialogue_title']?.toString(),
    );
  }

  final String id;
  final String type;
  final String label;
  final String? description;
  final String? dialogueSceneId;
  final String? dialogueTitle;

  bool get hasDialogueEntry =>
      dialogueSceneId != null && dialogueSceneId!.trim().isNotEmpty;
}

class FreeFocusCheckPreview {
  const FreeFocusCheckPreview({
    required this.hasCheck,
    this.label,
    this.visibility,
  });

  factory FreeFocusCheckPreview.fromJson(Map<String, dynamic> json) {
    return FreeFocusCheckPreview(
      hasCheck: json['has_check'] == true,
      label: json['label']?.toString(),
      visibility: json['visibility']?.toString(),
    );
  }

  final bool hasCheck;
  final String? label;
  final String? visibility;
}

class FreeFocusResult {
  const FreeFocusResult({
    this.mechanicsLabel,
    this.narration,
    this.summary,
    this.knowledgeGrantsApplied = const [],
    this.resolvedAt,
  });

  factory FreeFocusResult.fromJson(Map<String, dynamic> json) {
    return FreeFocusResult(
      mechanicsLabel: json['mechanics_label']?.toString(),
      narration: json['narration']?.toString(),
      summary: json['summary']?.toString(),
      knowledgeGrantsApplied: json['knowledge_grants_applied'] is List
          ? (json['knowledge_grants_applied'] as List)
              .map((entry) => entry.toString())
              .toList()
          : const [],
      resolvedAt: json['resolved_at']?.toString(),
    );
  }

  final String? mechanicsLabel;
  final String? narration;
  final String? summary;
  final List<String> knowledgeGrantsApplied;
  final String? resolvedAt;

  bool get hasNewInformation => knowledgeGrantsApplied.isNotEmpty;
}

class SceneReferenceCloserLook {
  const SceneReferenceCloserLook({
    required this.interactionId,
    required this.label,
    this.targetId,
    this.status = 'unopened',
    this.priority = 0,
    this.isAvailable = true,
    this.isViewed = false,
    this.isStale = false,
    this.isExpired = false,
    this.unavailableReason,
    this.result,
    this.checkPreview,
  });

  factory SceneReferenceCloserLook.fromJson(Map<String, dynamic> json) {
    final result = json['result'];
    final preview = json['check_preview'];
    return SceneReferenceCloserLook(
      interactionId: json['interaction_id']?.toString() ?? '',
      targetId: json['target_id']?.toString(),
      label: json['label']?.toString() ?? 'Closer look',
      status: json['status']?.toString() ?? 'unopened',
      priority: json['priority'] is num ? (json['priority'] as num).toInt() : 0,
      isAvailable: json['is_available'] != false,
      isViewed: json['is_viewed'] == true,
      isStale: json['is_stale'] == true,
      isExpired: json['is_expired'] == true,
      unavailableReason: json['unavailable_reason']?.toString(),
      result: result is Map<String, dynamic>
          ? FreeFocusResult.fromJson(result)
          : null,
      checkPreview: preview is Map<String, dynamic>
          ? FreeFocusCheckPreview.fromJson(preview)
          : null,
    );
  }

  final String interactionId;
  final String? targetId;
  final String label;
  final String status;
  final int priority;
  final bool isAvailable;
  final bool isViewed;
  final bool isStale;
  final bool isExpired;
  final String? unavailableReason;
  final FreeFocusResult? result;
  final FreeFocusCheckPreview? checkPreview;
}

class SceneReference {
  const SceneReference({
    this.peopleNearby = const [],
    this.notableThings = const [],
    this.visiblePaths = const [],
    this.actionTargets = const [],
    this.closerLooks = const [],
  });

  factory SceneReference.fromJson(Map<String, dynamic> json) {
    List<SceneReferenceEntry> entries(String key) {
      final value = json[key];
      return value is List
          ? value
              .whereType<Map<String, dynamic>>()
              .map(SceneReferenceEntry.fromJson)
              .where((entry) => entry.id.isNotEmpty && entry.label.isNotEmpty)
              .toList()
          : const <SceneReferenceEntry>[];
    }

    return SceneReference(
      peopleNearby: entries('people_nearby'),
      notableThings: entries('notable_things'),
      visiblePaths: entries('visible_paths'),
      actionTargets: entries('action_targets'),
      closerLooks: json['closer_looks'] is List
          ? (json['closer_looks'] as List)
              .whereType<Map<String, dynamic>>()
              .map(SceneReferenceCloserLook.fromJson)
              .where((entry) =>
                  entry.interactionId.isNotEmpty && entry.label.isNotEmpty)
              .toList()
          : const <SceneReferenceCloserLook>[],
    );
  }

  final List<SceneReferenceEntry> peopleNearby;
  final List<SceneReferenceEntry> notableThings;
  final List<SceneReferenceEntry> visiblePaths;
  final List<SceneReferenceEntry> actionTargets;
  final List<SceneReferenceCloserLook> closerLooks;

  bool get isEmpty =>
      peopleNearby.isEmpty &&
      notableThings.isEmpty &&
      visiblePaths.isEmpty &&
      actionTargets.isEmpty &&
      closerLooks.isEmpty;
}

class ActionTargetChip {
  const ActionTargetChip({
    required this.id,
    required this.type,
    required this.label,
    required this.insertText,
    this.freeFocusState,
    this.knownContext = const [],
  });

  factory ActionTargetChip.fromJson(Map<String, dynamic> json) {
    final label = json['label']?.toString() ?? '';
    return ActionTargetChip(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'target',
      label: label,
      insertText: json['insert_text']?.toString() ?? label,
      freeFocusState: json['free_focus_state']?.toString(),
      knownContext: json['known_context'] is List
          ? (json['known_context'] as List)
              .map((entry) => entry.toString())
              .toList()
          : const [],
    );
  }

  final String id;
  final String type;
  final String label;
  final String insertText;
  final String? freeFocusState;
  final List<String> knownContext;
}

class SceneActionComposer {
  const SceneActionComposer({this.targetChips = const []});

  factory SceneActionComposer.fromJson(Map<String, dynamic> json) {
    final chips = json['target_chips'];
    return SceneActionComposer(
      targetChips: chips is List
          ? chips
              .whereType<Map<String, dynamic>>()
              .map(ActionTargetChip.fromJson)
              .where((chip) => chip.id.isNotEmpty && chip.label.isNotEmpty)
              .toList()
          : const <ActionTargetChip>[],
    );
  }

  final List<ActionTargetChip> targetChips;
}

class ActiveDialogueSummary {
  const ActiveDialogueSummary({
    required this.dialogueSceneId,
    required this.status,
    this.dialogueSceneStateId,
    this.title,
    this.sameBeatReentryAvailable = false,
  });

  factory ActiveDialogueSummary.fromJson(Map<String, dynamic> json) {
    return ActiveDialogueSummary(
      dialogueSceneId: json['dialogue_scene_id']?.toString() ?? '',
      dialogueSceneStateId: json['dialogue_scene_state_id']?.toString(),
      title: json['title']?.toString(),
      status: json['status']?.toString() ?? 'active',
      sameBeatReentryAvailable: json['same_beat_reentry_available'] == true,
    );
  }

  final String dialogueSceneId;
  final String? dialogueSceneStateId;
  final String? title;
  final String status;
  final bool sameBeatReentryAvailable;

  bool get isActive => status == 'active';
  bool get isExited => status == 'exited';
}

class CurrentSceneView {
  const CurrentSceneView({
    required this.state,
    required this.visibleNpcs,
    required this.knownRelevantNpcs,
    required this.visibleAffordances,
    required this.knownFacts,
    required this.sceneStateSummary,
    required this.actionStatus,
    this.capabilities = const AccountCapabilities(),
    this.activeCharacter,
    this.campaign,
    this.scene,
    this.environment,
    this.objective,
    this.recentSummary,
    this.sceneResultFeed,
    this.mechanicalDetails,
    this.sceneNarration,
    this.sceneReference,
    this.actionComposer,
    this.sliceEndpoint,
    this.activeDialogue,
  });

  factory CurrentSceneView.fromJson(Map<String, dynamic> json) {
    List<T> listOf<T>(
      String key,
      T Function(Map<String, dynamic>) mapper,
    ) {
      final value = json[key];
      return value is List
          ? value.whereType<Map<String, dynamic>>().map(mapper).toList()
          : <T>[];
    }

    return CurrentSceneView(
      state: json['state']?.toString() ?? 'unknown',
      capabilities: json['capabilities'] is Map<String, dynamic>
          ? AccountCapabilities.fromJson(
              json['capabilities'] as Map<String, dynamic>)
          : const AccountCapabilities(),
      activeCharacter: json['active_character'] is Map<String, dynamic>
          ? CharacterSummary.fromJson(
              json['active_character'] as Map<String, dynamic>)
          : null,
      campaign: json['campaign'] is Map<String, dynamic>
          ? CurrentSceneCampaign.fromJson(
              json['campaign'] as Map<String, dynamic>)
          : json['current_campaign'] is Map<String, dynamic>
              ? CurrentSceneCampaign.fromJson(
                  json['current_campaign'] as Map<String, dynamic>)
              : null,
      scene: json['scene'] is Map<String, dynamic>
          ? CurrentSceneSummary.fromJson(json['scene'] as Map<String, dynamic>)
          : null,
      environment: json['environment'] is Map<String, dynamic>
          ? AdventureEnvironmentSummary.fromJson(
              json['environment'] as Map<String, dynamic>)
          : null,
      objective: json['objective'] is Map<String, dynamic>
          ? SceneObjective.fromJson(json['objective'] as Map<String, dynamic>)
          : json['current_objective'] is Map<String, dynamic>
              ? SceneObjective.fromJson(
                  json['current_objective'] as Map<String, dynamic>)
              : null,
      visibleNpcs: listOf('visible_npcs', SceneNpc.fromJson),
      knownRelevantNpcs: listOf('known_relevant_npcs', SceneNpc.fromJson),
      visibleAffordances:
          listOf('visible_affordances', SceneAffordance.fromJson),
      knownFacts: listOf('known_facts', SceneKnownFact.fromJson)
          .where((fact) => fact.text.isNotEmpty)
          .toList(),
      sceneStateSummary:
          listOf('scene_state_summary', SceneStateSummaryEntry.fromJson)
              .where((entry) => entry.text.isNotEmpty)
              .toList(),
      actionStatus: DashboardActionStatus.fromJson(
        json['action_status'] is Map<String, dynamic>
            ? json['action_status'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      recentSummary: json['recent_summary'] is Map<String, dynamic>
          ? SceneRecentSummary.fromJson(
              json['recent_summary'] as Map<String, dynamic>)
          : null,
      sceneResultFeed: json['scene_result_feed'] is Map<String, dynamic>
          ? SceneResultFeed.fromJson(
              json['scene_result_feed'] as Map<String, dynamic>)
          : null,
      mechanicalDetails: json['mechanical_details'] is Map<String, dynamic>
          ? SceneMechanicalDetails.fromJson(
              json['mechanical_details'] as Map<String, dynamic>)
          : null,
      sceneNarration: json['scene_narration'] is Map<String, dynamic>
          ? SceneNarration.fromJson(
              json['scene_narration'] as Map<String, dynamic>)
          : null,
      sceneReference: json['scene_reference'] is Map<String, dynamic>
          ? SceneReference.fromJson(
              json['scene_reference'] as Map<String, dynamic>)
          : null,
      actionComposer: json['action_composer'] is Map<String, dynamic>
          ? SceneActionComposer.fromJson(
              json['action_composer'] as Map<String, dynamic>)
          : null,
      sliceEndpoint: json['slice_endpoint'] is Map<String, dynamic>
          ? GreyvaleSliceEndpointStatus.fromJson(
              json['slice_endpoint'] as Map<String, dynamic>)
          : null,
      activeDialogue: json['active_dialogue'] is Map<String, dynamic>
          ? ActiveDialogueSummary.fromJson(
              json['active_dialogue'] as Map<String, dynamic>)
          : null,
    );
  }

  final String state;
  final AccountCapabilities capabilities;
  final CharacterSummary? activeCharacter;
  final CurrentSceneCampaign? campaign;
  final CurrentSceneSummary? scene;
  final AdventureEnvironmentSummary? environment;
  final SceneObjective? objective;
  final List<SceneNpc> visibleNpcs;
  final List<SceneNpc> knownRelevantNpcs;
  final List<SceneAffordance> visibleAffordances;
  final List<SceneKnownFact> knownFacts;
  final List<SceneStateSummaryEntry> sceneStateSummary;
  final DashboardActionStatus actionStatus;
  final SceneRecentSummary? recentSummary;
  final SceneResultFeed? sceneResultFeed;
  final SceneMechanicalDetails? mechanicalDetails;
  final SceneNarration? sceneNarration;
  final SceneReference? sceneReference;
  final SceneActionComposer? actionComposer;
  final GreyvaleSliceEndpointStatus? sliceEndpoint;
  final ActiveDialogueSummary? activeDialogue;

  bool get hasActiveCampaign => state == 'active';
  bool get shouldReturnToCampaignOverview =>
      state == 'no_active_campaign' || state == 'no_active_character';
}

class AdvanceBeatResult {
  const AdvanceBeatResult({
    required this.status,
    required this.actionStatus,
    this.currentScene,
    this.previousActionWindowId,
    this.route,
  });

  factory AdvanceBeatResult.fromJson(Map<String, dynamic> json) {
    final currentScene = json['current_scene'];
    return AdvanceBeatResult(
      status: json['status']?.toString() ?? 'advanced',
      previousActionWindowId: json['previous_action_window_id']?.toString(),
      route: json['route']?.toString(),
      actionStatus: DashboardActionStatus.fromJson(
        json['action_status'] is Map<String, dynamic>
            ? json['action_status'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      currentScene: currentScene is Map<String, dynamic>
          ? CurrentSceneView.fromJson(currentScene)
          : null,
    );
  }

  final String status;
  final String? previousActionWindowId;
  final String? route;
  final DashboardActionStatus actionStatus;
  final CurrentSceneView? currentScene;
}

class PlaytestDiagnosticIssue {
  const PlaytestDiagnosticIssue({
    required this.code,
    required this.message,
    this.repairAction,
  });

  factory PlaytestDiagnosticIssue.fromJson(Map<String, dynamic> json) {
    return PlaytestDiagnosticIssue(
      code: json['code']?.toString() ?? 'unknown',
      message: json['message']?.toString() ?? 'Diagnostic issue detected.',
      repairAction: json['repair_action']?.toString(),
    );
  }

  final String code;
  final String message;
  final String? repairAction;
}

class PlaytestRepairAction {
  const PlaytestRepairAction({
    required this.repairAction,
    required this.label,
    required this.risk,
  });

  factory PlaytestRepairAction.fromJson(Map<String, dynamic> json) {
    final repairAction = json['repair_action']?.toString() ?? '';
    return PlaytestRepairAction(
      repairAction: repairAction,
      label: json['label']?.toString() ?? _humanizeModelText(repairAction),
      risk: json['risk']?.toString() ?? 'low',
    );
  }

  final String repairAction;
  final String label;
  final String risk;
}

class PlaytestDiagnosticSummary {
  const PlaytestDiagnosticSummary({
    this.accountId,
    this.characterId,
    this.characterName,
    this.campaignName,
    this.beatNumber,
    this.currentSceneId,
    this.currentSceneName,
    this.currentObjectiveTitle,
    this.currentActionWindowId,
    this.currentActionWindowState,
    this.currentActionWindowOpenForPlayer = false,
    this.currentActionWindowOpensAt,
    this.currentActionWindowClosesAt,
    this.submittedActionStatus,
    this.latestResultId,
    this.latestResultSummary,
    this.sceneFeedEntryCount = 0,
    this.knowledgeCount = 0,
    this.historyEntries = 0,
    this.activeActionWindowCount = 0,
    this.openActionWindowCount = 0,
  });

  factory PlaytestDiagnosticSummary.fromJson(Map<String, dynamic> json) {
    int? optionalInt(String key) =>
        json[key] is num ? (json[key] as num).toInt() : null;
    int intValue(String key) => optionalInt(key) ?? 0;

    return PlaytestDiagnosticSummary(
      accountId: json['account_id']?.toString(),
      characterId: json['character_id']?.toString(),
      characterName: json['character_name']?.toString(),
      campaignName: json['campaign_name']?.toString(),
      beatNumber: optionalInt('beat_number'),
      currentSceneId: json['current_scene_id']?.toString(),
      currentSceneName: json['current_scene_name']?.toString(),
      currentObjectiveTitle: json['current_objective_title']?.toString(),
      currentActionWindowId: json['current_action_window_id']?.toString(),
      currentActionWindowState: json['current_action_window_state']?.toString(),
      currentActionWindowOpenForPlayer:
          json['current_action_window_open_for_player'] == true,
      currentActionWindowOpensAt:
          json['current_action_window_opens_at']?.toString(),
      currentActionWindowClosesAt:
          json['current_action_window_closes_at']?.toString(),
      submittedActionStatus: json['submitted_action_status']?.toString(),
      latestResultId: json['latest_result_id']?.toString(),
      latestResultSummary: json['latest_result_summary']?.toString(),
      sceneFeedEntryCount: intValue('scene_feed_entry_count'),
      knowledgeCount: intValue('knowledge_count'),
      historyEntries: intValue('history_entries'),
      activeActionWindowCount: intValue('active_action_window_count'),
      openActionWindowCount: intValue('open_action_window_count'),
    );
  }

  final String? accountId;
  final String? characterId;
  final String? characterName;
  final String? campaignName;
  final int? beatNumber;
  final String? currentSceneId;
  final String? currentSceneName;
  final String? currentObjectiveTitle;
  final String? currentActionWindowId;
  final String? currentActionWindowState;
  final bool currentActionWindowOpenForPlayer;
  final String? currentActionWindowOpensAt;
  final String? currentActionWindowClosesAt;
  final String? submittedActionStatus;
  final String? latestResultId;
  final String? latestResultSummary;
  final int sceneFeedEntryCount;
  final int knowledgeCount;
  final int historyEntries;
  final int activeActionWindowCount;
  final int openActionWindowCount;
}

class PlaytestDiagnostics {
  const PlaytestDiagnostics({
    required this.status,
    required this.summary,
    required this.warnings,
    required this.errors,
    required this.availableRepairActions,
    this.campaignInstanceId,
    this.checkedAt,
  });

  factory PlaytestDiagnostics.fromJson(Map<String, dynamic> json) {
    List<T> listOf<T>(
      String key,
      T Function(Map<String, dynamic>) mapper,
    ) {
      final value = json[key];
      return value is List
          ? value.whereType<Map<String, dynamic>>().map(mapper).toList()
          : <T>[];
    }

    return PlaytestDiagnostics(
      status: json['status']?.toString() ?? 'unknown',
      campaignInstanceId: json['campaign_instance_id']?.toString(),
      checkedAt: json['checked_at']?.toString(),
      summary: PlaytestDiagnosticSummary.fromJson(
        json['summary'] is Map<String, dynamic>
            ? json['summary'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      warnings: listOf('warnings', PlaytestDiagnosticIssue.fromJson),
      errors: listOf('errors', PlaytestDiagnosticIssue.fromJson),
      availableRepairActions:
          listOf('available_repair_actions', PlaytestRepairAction.fromJson)
              .where((action) => action.repairAction.isNotEmpty)
              .toList(),
    );
  }

  final String status;
  final String? campaignInstanceId;
  final String? checkedAt;
  final PlaytestDiagnosticSummary summary;
  final List<PlaytestDiagnosticIssue> warnings;
  final List<PlaytestDiagnosticIssue> errors;
  final List<PlaytestRepairAction> availableRepairActions;

  bool get hasProblems => warnings.isNotEmpty || errors.isNotEmpty;
  int get problemCount => warnings.length + errors.length;
}

class PlaytestRepairResult {
  const PlaytestRepairResult({
    required this.repairAction,
    required this.status,
    required this.message,
    this.diagnosticsAfter,
  });

  factory PlaytestRepairResult.fromJson(Map<String, dynamic> json) {
    return PlaytestRepairResult(
      repairAction: json['repair_action']?.toString() ?? '',
      status: json['status']?.toString() ?? 'unknown',
      message: json['message']?.toString() ?? 'Repair completed.',
      diagnosticsAfter: json['diagnostics_after'] is Map<String, dynamic>
          ? PlaytestDiagnostics.fromJson(
              json['diagnostics_after'] as Map<String, dynamic>)
          : null,
    );
  }

  final String repairAction;
  final String status;
  final String message;
  final PlaytestDiagnostics? diagnosticsAfter;
}

class ActionCandidate {
  const ActionCandidate({
    required this.verb,
    required this.targetAffordanceId,
    required this.targetLabel,
    this.targetType,
    this.interactionId,
  });

  factory ActionCandidate.fromJson(Map<String, dynamic> json) {
    return ActionCandidate(
      verb: json['verb']?.toString() ?? '',
      targetAffordanceId: json['target_affordance_id']?.toString() ?? '',
      targetLabel: json['target_label']?.toString() ?? 'the selected target',
      targetType: json['target_type']?.toString(),
      interactionId: json['interaction_id']?.toString(),
    );
  }

  final String verb;
  final String targetAffordanceId;
  final String targetLabel;
  final String? targetType;
  final String? interactionId;

  String get label => '${_humanizeModelText(verb)} -> $targetLabel';
}

class ActionClarificationOption {
  const ActionClarificationOption({
    required this.label,
    required this.verb,
    required this.targetAffordanceId,
    this.targetLabel,
    this.targetType,
  });

  factory ActionClarificationOption.fromJson(Map<String, dynamic> json) {
    return ActionClarificationOption(
      label: json['label']?.toString() ?? 'Choose this action',
      verb: json['verb']?.toString() ?? '',
      targetAffordanceId: json['target_affordance_id']?.toString() ?? '',
      targetLabel: json['target_label']?.toString(),
      targetType: json['target_type']?.toString(),
    );
  }

  final String label;
  final String verb;
  final String targetAffordanceId;
  final String? targetLabel;
  final String? targetType;
}

class ActionPreviewFreeFocusOverlap {
  const ActionPreviewFreeFocusOverlap({
    required this.interactionId,
    required this.label,
    required this.message,
    this.targetId,
    this.checkResolution,
  });

  factory ActionPreviewFreeFocusOverlap.fromJson(Map<String, dynamic> json) {
    return ActionPreviewFreeFocusOverlap(
      interactionId: json['interaction_id']?.toString() ?? '',
      targetId: json['target_id']?.toString(),
      label: json['label']?.toString() ?? 'Closer look',
      message: json['message']?.toString() ??
          'This target has a Closer Look available before you spend your beat.',
      checkResolution: json['check_resolution']?.toString(),
    );
  }

  final String interactionId;
  final String? targetId;
  final String label;
  final String message;
  final String? checkResolution;
}

class ActionLifecycleContext {
  const ActionLifecycleContext({
    this.actionWindowId,
    this.submissionVersion,
  });

  factory ActionLifecycleContext.fromJson(Map<String, dynamic> json) {
    return ActionLifecycleContext(
      actionWindowId: json['action_window_id']?.toString(),
      submissionVersion: json['submission_version'] is num
          ? (json['submission_version'] as num).toInt()
          : null,
    );
  }

  final String? actionWindowId;
  final int? submissionVersion;

  Map<String, dynamic> toJson() {
    return {
      if (actionWindowId != null) 'action_window_id': actionWindowId,
      if (submissionVersion != null) 'submission_version': submissionVersion,
    };
  }

  bool get isNotEmpty => actionWindowId != null || submissionVersion != null;
}

class ActionPreviewResponse {
  const ActionPreviewResponse({
    required this.status,
    this.message,
    this.candidate,
    this.freeFocusOverlap,
    this.options = const [],
    this.detectedActions = const [],
    this.suggestions = const [],
    this.actionWindowId,
    this.lifecycleContext,
    this.canSubmit = false,
    this.existingSubmission,
  });

  factory ActionPreviewResponse.fromJson(Map<String, dynamic> json) {
    List<ActionClarificationOption> optionList(String key) {
      final value = json[key];
      return value is List
          ? value
              .whereType<Map<String, dynamic>>()
              .map(ActionClarificationOption.fromJson)
              .toList()
          : const [];
    }

    final validation = json['validation'];
    final candidate = json['candidate'];
    final existing = json['existing_submission'];
    final overlap = json['free_focus_overlap'];
    final lifecycle = json['lifecycle_context'];
    return ActionPreviewResponse(
      status: json['status']?.toString() ?? 'invalid',
      message: json['message']?.toString(),
      candidate: candidate is Map<String, dynamic>
          ? ActionCandidate.fromJson(candidate)
          : null,
      freeFocusOverlap: overlap is Map<String, dynamic>
          ? ActionPreviewFreeFocusOverlap.fromJson(overlap)
          : null,
      options: optionList('options'),
      detectedActions: optionList('detected_actions'),
      suggestions: json['suggestions'] is List
          ? (json['suggestions'] as List)
              .map((entry) => entry.toString())
              .toList()
          : const [],
      actionWindowId: json['action_window_id']?.toString(),
      lifecycleContext: lifecycle is Map<String, dynamic>
          ? ActionLifecycleContext.fromJson(lifecycle)
          : null,
      canSubmit: validation is Map<String, dynamic>
          ? validation['can_submit'] == true
          : json['can_submit'] == true,
      existingSubmission: existing is Map<String, dynamic>
          ? SubmittedSceneAction.fromJson(existing)
          : null,
    );
  }

  final String status;
  final String? message;
  final ActionCandidate? candidate;
  final ActionPreviewFreeFocusOverlap? freeFocusOverlap;
  final List<ActionClarificationOption> options;
  final List<ActionClarificationOption> detectedActions;
  final List<String> suggestions;
  final String? actionWindowId;
  final ActionLifecycleContext? lifecycleContext;
  final bool canSubmit;
  final SubmittedSceneAction? existingSubmission;

  bool get isResolved => status == 'resolved' && candidate != null && canSubmit;
  bool get hasFreeFocusOverlap =>
      status == 'free_focus_overlap' && freeFocusOverlap != null;
  bool get needsChoice =>
      status == 'needs_clarification' || status == 'multi_action_clarification';
}

class FreeFocusResolveResponse {
  const FreeFocusResolveResponse({
    required this.result,
    this.actionWindowContextVersion,
    this.fullSceneNarrationRecomposed = false,
  });

  factory FreeFocusResolveResponse.fromJson(Map<String, dynamic> json) {
    final result = json['free_focus_result'];
    return FreeFocusResolveResponse(
      result: result is Map<String, dynamic>
          ? FreeFocusResult.fromJson(result)
          : const FreeFocusResult(),
      actionWindowContextVersion:
          json['action_window_context_version']?.toString(),
      fullSceneNarrationRecomposed:
          json['full_scene_narration_recomposed'] == true,
    );
  }

  final FreeFocusResult result;
  final String? actionWindowContextVersion;
  final bool fullSceneNarrationRecomposed;
}

class ActionSubmitResponse {
  const ActionSubmitResponse({
    required this.status,
    required this.actionStatus,
    this.currentScene,
    this.submission,
  });

  factory ActionSubmitResponse.fromJson(Map<String, dynamic> json) {
    final currentScene = json['current_scene'];
    final submission = json['submission'];
    return ActionSubmitResponse(
      status: json['status']?.toString() ?? 'submitted',
      actionStatus: DashboardActionStatus.fromJson(
        json['action_status'] is Map<String, dynamic>
            ? json['action_status'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      currentScene: currentScene is Map<String, dynamic>
          ? CurrentSceneView.fromJson(currentScene)
          : null,
      submission: submission is Map<String, dynamic>
          ? SubmittedSceneAction.fromJson(submission)
          : null,
    );
  }

  final String status;
  final DashboardActionStatus actionStatus;
  final CurrentSceneView? currentScene;
  final SubmittedSceneAction? submission;
}

Map<String, dynamic> _modelMap(dynamic value) {
  return value is Map<String, dynamic> ? value : const <String, dynamic>{};
}

List<String> _modelStringList(dynamic value) {
  return value is List ? value.map((entry) => entry.toString()).toList() : [];
}

List<T> _modelObjectList<T>(
  dynamic value,
  T Function(Map<String, dynamic>) mapper,
) {
  return value is List
      ? value.whereType<Map<String, dynamic>>().map(mapper).toList()
      : <T>[];
}

List<Map<String, dynamic>> _modelMapList(dynamic value) {
  return _modelObjectList(value, (entry) => entry);
}

class DialogueCheckPreview {
  const DialogueCheckPreview({
    required this.hasCheck,
    this.label,
    this.visibility,
    this.dcVisible = false,
  });

  factory DialogueCheckPreview.fromJson(Map<String, dynamic> json) {
    return DialogueCheckPreview(
      hasCheck: json['has_check'] == true,
      label: json['label']?.toString(),
      visibility: json['visibility']?.toString(),
      dcVisible: json['dc_visible'] == true,
    );
  }

  final bool hasCheck;
  final String? label;
  final String? visibility;
  final bool dcVisible;
}

class DialogueCheckResult {
  const DialogueCheckResult({
    this.outcome,
    this.label,
    this.visibility,
  });

  factory DialogueCheckResult.fromJson(Map<String, dynamic> json) {
    return DialogueCheckResult(
      outcome: json['outcome']?.toString(),
      label: json['label']?.toString(),
      visibility: json['visibility']?.toString(),
    );
  }

  final String? outcome;
  final String? label;
  final String? visibility;
}

class DialogueTextResult {
  const DialogueTextResult({
    required this.text,
    this.summary,
    this.mechanicsLabel,
    this.checkResult,
    this.knowledgeGrantsApplied = const [],
    this.relationshipUpdates = const [],
  });

  factory DialogueTextResult.fromJson(Map<String, dynamic> json) {
    return DialogueTextResult(
      text: json['text']?.toString() ??
          json['result_text']?.toString() ??
          json['summary']?.toString() ??
          '',
      summary: json['summary']?.toString(),
      mechanicsLabel: json['mechanics_label']?.toString(),
      checkResult: json['check_result'] is Map<String, dynamic>
          ? DialogueCheckResult.fromJson(
              json['check_result'] as Map<String, dynamic>)
          : null,
      knowledgeGrantsApplied:
          _modelStringList(json['knowledge_grants_applied']),
      relationshipUpdates: _modelStringList(json['relationship_updates']),
    );
  }

  final String text;
  final String? summary;
  final String? mechanicsLabel;
  final DialogueCheckResult? checkResult;
  final List<String> knowledgeGrantsApplied;
  final List<String> relationshipUpdates;

  bool get hasVisibleResult =>
      text.trim().isNotEmpty ||
      (summary?.trim().isNotEmpty ?? false) ||
      (mechanicsLabel?.trim().isNotEmpty ?? false);
}

class DialogueLatestDevelopment {
  const DialogueLatestDevelopment({
    this.type,
    this.text,
    this.summary,
    this.resolvedAt,
  });

  factory DialogueLatestDevelopment.fromJson(Map<String, dynamic> json) {
    return DialogueLatestDevelopment(
      type: json['type']?.toString(),
      text: json['text']?.toString() ?? json['result_text']?.toString(),
      summary: json['summary']?.toString(),
      resolvedAt: json['resolved_at']?.toString(),
    );
  }

  final String? type;
  final String? text;
  final String? summary;
  final String? resolvedAt;

  String get displayText => summary ?? text ?? '';
}

class DialogueSceneInfo {
  const DialogueSceneInfo({
    required this.dialogueSceneId,
    this.title,
    this.sceneType,
    this.interactionDomain,
  });

  factory DialogueSceneInfo.fromJson(Map<String, dynamic> json) {
    return DialogueSceneInfo(
      dialogueSceneId:
          json['dialogue_scene_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? json['name']?.toString(),
      sceneType: json['scene_type']?.toString(),
      interactionDomain: json['interaction_domain']?.toString(),
    );
  }

  final String dialogueSceneId;
  final String? title;
  final String? sceneType;
  final String? interactionDomain;
}

class DialogueSceneState {
  const DialogueSceneState({
    this.dialogueSceneStateId,
    this.transcriptId,
    this.completedDialogueRecordId,
    this.status,
    this.committedSocialMoveCount = 0,
    this.softTargetMax = 3,
    this.exitResult = const {},
    this.transition = const {},
  });

  factory DialogueSceneState.fromJson(Map<String, dynamic> json) {
    return DialogueSceneState(
      dialogueSceneStateId: json['dialogue_scene_state_id']?.toString(),
      transcriptId: json['transcript_id']?.toString(),
      completedDialogueRecordId:
          json['completed_dialogue_record_id']?.toString(),
      status: json['status']?.toString(),
      committedSocialMoveCount: json['committed_social_move_count'] is num
          ? (json['committed_social_move_count'] as num).toInt()
          : 0,
      softTargetMax: json['soft_target_max'] is num
          ? (json['soft_target_max'] as num).toInt()
          : 3,
      exitResult: _modelMap(json['exit_result']),
      transition: _modelMap(json['transition']),
    );
  }

  final String? dialogueSceneStateId;
  final String? transcriptId;
  final String? completedDialogueRecordId;
  final String? status;
  final int committedSocialMoveCount;
  final int softTargetMax;
  final Map<String, dynamic> exitResult;
  final Map<String, dynamic> transition;

  bool get isExited => status == 'exited';

  DialogueLifecycleContext get lifecycleContext => DialogueLifecycleContext(
        dialogueSceneStateId: dialogueSceneStateId,
        committedSocialMoveCount: committedSocialMoveCount,
      );
}

class DialogueParticipant {
  const DialogueParticipant({
    required this.participantId,
    required this.label,
    this.unknownLabel,
    this.knownLabel,
  });

  factory DialogueParticipant.fromJson(Map<String, dynamic> json) {
    return DialogueParticipant(
      participantId:
          json['participant_id']?.toString() ?? json['id']?.toString() ?? '',
      label: json['label']?.toString() ??
          json['unknown_label']?.toString() ??
          'Someone',
      unknownLabel: json['unknown_label']?.toString(),
      knownLabel: json['known_label']?.toString(),
    );
  }

  final String participantId;
  final String label;
  final String? unknownLabel;
  final String? knownLabel;
}

class DialogueSurfaceParagraph {
  const DialogueSurfaceParagraph({required this.kind, required this.text});

  factory DialogueSurfaceParagraph.fromJson(Map<String, dynamic> json) {
    return DialogueSurfaceParagraph(
      kind: json['kind']?.toString() ?? 'surface',
      text: json['text']?.toString() ?? '',
    );
  }

  final String kind;
  final String text;
}

class ConversationSurface {
  const ConversationSurface({
    this.surfaceId,
    this.paragraphs = const [],
  });

  factory ConversationSurface.fromJson(Map<String, dynamic> json) {
    return ConversationSurface(
      surfaceId: json['surface_id']?.toString(),
      paragraphs: _modelObjectList(
              json['paragraphs'], DialogueSurfaceParagraph.fromJson)
          .where((paragraph) => paragraph.text.trim().isNotEmpty)
          .toList(),
    );
  }

  final String? surfaceId;
  final List<DialogueSurfaceParagraph> paragraphs;
}

class PassiveSocialInsight {
  const PassiveSocialInsight({
    required this.insightId,
    this.label,
    this.targetId,
    this.visibility,
  });

  factory PassiveSocialInsight.fromJson(Map<String, dynamic> json) {
    return PassiveSocialInsight(
      insightId: json['insight_id']?.toString() ?? json['id']?.toString() ?? '',
      label: json['label']?.toString(),
      targetId: json['target_id']?.toString(),
      visibility: json['visibility']?.toString(),
    );
  }

  final String insightId;
  final String? label;
  final String? targetId;
  final String? visibility;
}

class DialogueClarifyingQuestion {
  const DialogueClarifyingQuestion({
    required this.questionId,
    required this.label,
    required this.status,
    required this.isAvailable,
    required this.isAsked,
    this.targetId,
    this.checkPreview,
    this.result,
  });

  factory DialogueClarifyingQuestion.fromJson(Map<String, dynamic> json) {
    final result = json['result'];
    return DialogueClarifyingQuestion(
      questionId:
          json['question_id']?.toString() ?? json['id']?.toString() ?? '',
      label: json['label']?.toString() ??
          json['prompt']?.toString() ??
          'Clarifying question',
      targetId: json['target_id']?.toString(),
      status: json['status']?.toString() ?? 'available',
      isAvailable: json['is_available'] == true,
      isAsked: json['is_asked'] == true,
      checkPreview: json['check_preview'] is Map<String, dynamic>
          ? DialogueCheckPreview.fromJson(
              json['check_preview'] as Map<String, dynamic>)
          : null,
      result: result is Map<String, dynamic>
          ? DialogueTextResult.fromJson(result)
          : null,
    );
  }

  final String questionId;
  final String label;
  final String? targetId;
  final String status;
  final bool isAvailable;
  final bool isAsked;
  final DialogueCheckPreview? checkPreview;
  final DialogueTextResult? result;

  bool get isLocked => status == 'locked';
  bool get hasResult => result?.hasVisibleResult ?? false;
}

class DialogueCommittedSocialMove {
  const DialogueCommittedSocialMove({
    required this.moveId,
    required this.label,
    required this.status,
    required this.isAvailable,
    required this.spendsDialogueBeat,
    required this.requiresCheck,
    this.socialMoveType,
    this.socialTags = const [],
    this.tone,
    this.targetId,
    this.checkPreview,
  });

  factory DialogueCommittedSocialMove.fromJson(Map<String, dynamic> json) {
    return DialogueCommittedSocialMove(
      moveId: json['move_id']?.toString() ?? json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Social move',
      socialMoveType: json['social_move_type']?.toString(),
      socialTags: _modelStringList(json['social_tags']),
      tone: json['tone']?.toString(),
      targetId: json['target_id']?.toString(),
      status: json['status']?.toString() ?? 'available',
      isAvailable: json['is_available'] == true,
      spendsDialogueBeat: json['spends_dialogue_beat'] != false,
      requiresCheck: json['requires_check'] == true,
      checkPreview: json['check_preview'] is Map<String, dynamic>
          ? DialogueCheckPreview.fromJson(
              json['check_preview'] as Map<String, dynamic>)
          : null,
    );
  }

  final String moveId;
  final String label;
  final String? socialMoveType;
  final List<String> socialTags;
  final String? tone;
  final String? targetId;
  final String status;
  final bool isAvailable;
  final bool spendsDialogueBeat;
  final bool requiresCheck;
  final DialogueCheckPreview? checkPreview;
}

class DialogueExit {
  const DialogueExit({
    required this.exitId,
    required this.label,
    required this.status,
    required this.isAvailable,
    this.exitType,
    this.transition = const {},
  });

  factory DialogueExit.fromJson(Map<String, dynamic> json) {
    return DialogueExit(
      exitId: json['exit_id']?.toString() ?? json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Leave conversation',
      exitType: json['exit_type']?.toString(),
      status: json['status']?.toString() ?? 'available',
      isAvailable: json['is_available'] == true,
      transition: _modelMap(json['transition']),
    );
  }

  final String exitId;
  final String label;
  final String? exitType;
  final String status;
  final bool isAvailable;
  final Map<String, dynamic> transition;
}

class DialogueSceneView {
  const DialogueSceneView({
    required this.state,
    this.capabilities = const AccountCapabilities(),
    this.activeCharacter,
    this.campaign,
    this.dialogueScene,
    this.dialogueSceneState,
    this.participants = const [],
    this.conversationSurface = const ConversationSurface(),
    this.latestDevelopment,
    this.passiveSocialInsight = const [],
    this.clarifyingQuestions = const [],
    this.committedSocialMoves = const [],
    this.dialogueExits = const [],
    this.message,
  });

  factory DialogueSceneView.fromJson(Map<String, dynamic> json) {
    final latest = json['latest_development'];
    return DialogueSceneView(
      state: json['state']?.toString() ?? 'unknown',
      capabilities: json['capabilities'] is Map<String, dynamic>
          ? AccountCapabilities.fromJson(
              json['capabilities'] as Map<String, dynamic>)
          : const AccountCapabilities(),
      activeCharacter: json['active_character'] is Map<String, dynamic>
          ? CharacterSummary.fromJson(
              json['active_character'] as Map<String, dynamic>)
          : null,
      campaign: json['campaign'] is Map<String, dynamic>
          ? CurrentSceneCampaign.fromJson(
              json['campaign'] as Map<String, dynamic>)
          : null,
      dialogueScene: json['dialogue_scene'] is Map<String, dynamic>
          ? DialogueSceneInfo.fromJson(
              json['dialogue_scene'] as Map<String, dynamic>)
          : null,
      dialogueSceneState: json['dialogue_scene_state'] is Map<String, dynamic>
          ? DialogueSceneState.fromJson(
              json['dialogue_scene_state'] as Map<String, dynamic>)
          : null,
      participants:
          _modelObjectList(json['participants'], DialogueParticipant.fromJson),
      conversationSurface: json['conversation_surface'] is Map<String, dynamic>
          ? ConversationSurface.fromJson(
              json['conversation_surface'] as Map<String, dynamic>)
          : const ConversationSurface(),
      latestDevelopment: latest is Map<String, dynamic>
          ? DialogueLatestDevelopment.fromJson(latest)
          : null,
      passiveSocialInsight: _modelObjectList(
          json['passive_social_insight'], PassiveSocialInsight.fromJson),
      clarifyingQuestions: _modelObjectList(
          json['clarifying_questions'], DialogueClarifyingQuestion.fromJson),
      committedSocialMoves: _modelObjectList(
          json['committed_social_moves'], DialogueCommittedSocialMove.fromJson),
      dialogueExits:
          _modelObjectList(json['dialogue_exits'], DialogueExit.fromJson),
      message: json['message']?.toString(),
    );
  }

  final String state;
  final AccountCapabilities capabilities;
  final CharacterSummary? activeCharacter;
  final CurrentSceneCampaign? campaign;
  final DialogueSceneInfo? dialogueScene;
  final DialogueSceneState? dialogueSceneState;
  final List<DialogueParticipant> participants;
  final ConversationSurface conversationSurface;
  final DialogueLatestDevelopment? latestDevelopment;
  final List<PassiveSocialInsight> passiveSocialInsight;
  final List<DialogueClarifyingQuestion> clarifyingQuestions;
  final List<DialogueCommittedSocialMove> committedSocialMoves;
  final List<DialogueExit> dialogueExits;
  final String? message;

  bool get isActive => state == 'active';
  bool get isExited =>
      state == 'exited' || (dialogueSceneState?.isExited ?? false);
  String? get dialogueSceneId => dialogueScene?.dialogueSceneId;
}

class DialogueClarifyingQuestionResolveResponse {
  const DialogueClarifyingQuestionResolveResponse({
    required this.status,
    required this.result,
    this.currentDialogue,
  });

  factory DialogueClarifyingQuestionResolveResponse.fromJson(
      Map<String, dynamic> json) {
    final result = json['clarifying_question_result'];
    final current = json['current_dialogue'];
    return DialogueClarifyingQuestionResolveResponse(
      status: json['status']?.toString() ?? 'resolved',
      result: result is Map<String, dynamic>
          ? DialogueClarifyingQuestion.fromJson(result)
          : const DialogueClarifyingQuestion(
              questionId: '',
              label: 'Clarifying question',
              status: 'asked',
              isAvailable: false,
              isAsked: true,
            ),
      currentDialogue: current is Map<String, dynamic>
          ? DialogueSceneView.fromJson(current)
          : null,
    );
  }

  final String status;
  final DialogueClarifyingQuestion result;
  final DialogueSceneView? currentDialogue;
}

class DialogueAssistanceNote {
  const DialogueAssistanceNote({required this.text, this.label});

  factory DialogueAssistanceNote.fromJson(Map<String, dynamic> json) {
    return DialogueAssistanceNote(
      text: json['text']?.toString() ??
          json['description']?.toString() ??
          json['label']?.toString() ??
          '',
      label: json['label']?.toString(),
    );
  }

  final String text;
  final String? label;
}

class DialogueSocialMovePreview {
  const DialogueSocialMovePreview({
    required this.interpretation,
    required this.spendsDialogueBeat,
    required this.requiresCheck,
    this.moveId,
    this.genericFallbackId,
    this.socialMoveType,
    this.submittedText,
    this.checkPreview,
    this.assistance = const [],
  });

  factory DialogueSocialMovePreview.fromJson(Map<String, dynamic> json) {
    return DialogueSocialMovePreview(
      interpretation: json['interpretation']?.toString() ??
          json['message']?.toString() ??
          'Preview ready.',
      moveId: json['move_id']?.toString(),
      genericFallbackId: json['generic_fallback_id']?.toString(),
      socialMoveType: json['social_move_type']?.toString(),
      submittedText: json['submitted_text']?.toString(),
      spendsDialogueBeat: json['spends_dialogue_beat'] != false,
      requiresCheck: json['requires_check'] == true,
      checkPreview: json['check_preview'] is Map<String, dynamic>
          ? DialogueCheckPreview.fromJson(
              json['check_preview'] as Map<String, dynamic>)
          : null,
      assistance:
          _modelObjectList(json['assistance'], DialogueAssistanceNote.fromJson)
              .where((note) => note.text.trim().isNotEmpty)
              .toList(),
    );
  }

  final String interpretation;
  final String? moveId;
  final String? genericFallbackId;
  final String? socialMoveType;
  final String? submittedText;
  final bool spendsDialogueBeat;
  final bool requiresCheck;
  final DialogueCheckPreview? checkPreview;
  final List<DialogueAssistanceNote> assistance;
}

class DialogueLifecycleContext {
  const DialogueLifecycleContext({
    this.dialogueSceneStateId,
    this.committedSocialMoveCount,
  });

  factory DialogueLifecycleContext.fromJson(Map<String, dynamic> json) {
    return DialogueLifecycleContext(
      dialogueSceneStateId: json['dialogue_scene_state_id']?.toString(),
      committedSocialMoveCount: json['committed_social_move_count'] is num
          ? (json['committed_social_move_count'] as num).toInt()
          : null,
    );
  }

  final String? dialogueSceneStateId;
  final int? committedSocialMoveCount;

  Map<String, dynamic> toJson() {
    return {
      if (dialogueSceneStateId != null)
        'dialogue_scene_state_id': dialogueSceneStateId,
      if (committedSocialMoveCount != null)
        'committed_social_move_count': committedSocialMoveCount,
    };
  }

  bool get isNotEmpty =>
      dialogueSceneStateId != null || committedSocialMoveCount != null;
}

class DialogueSocialMoveOverlap {
  const DialogueSocialMoveOverlap({
    required this.questionId,
    required this.label,
  });

  factory DialogueSocialMoveOverlap.fromJson(Map<String, dynamic> json) {
    return DialogueSocialMoveOverlap(
      questionId: json['question_id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Clarifying Question',
    );
  }

  final String questionId;
  final String label;
}

class DialogueSocialMovePreviewResponse {
  const DialogueSocialMovePreviewResponse({
    required this.status,
    this.message,
    this.preview,
    this.overlap,
    this.options = const [],
    this.currentDialogue,
    this.lifecycleContext,
  });

  factory DialogueSocialMovePreviewResponse.fromJson(
      Map<String, dynamic> json) {
    final preview = json['preview'];
    final overlap = json['overlap'];
    final current = json['current_dialogue'];
    final lifecycle = json['lifecycle_context'];
    return DialogueSocialMovePreviewResponse(
      status: json['status']?.toString() ?? 'revise',
      message: json['message']?.toString(),
      preview: preview is Map<String, dynamic>
          ? DialogueSocialMovePreview.fromJson(preview)
          : null,
      overlap: overlap is Map<String, dynamic>
          ? DialogueSocialMoveOverlap.fromJson(overlap)
          : null,
      options: _modelStringList(json['options']),
      currentDialogue: current is Map<String, dynamic>
          ? DialogueSceneView.fromJson(current)
          : null,
      lifecycleContext: lifecycle is Map<String, dynamic>
          ? DialogueLifecycleContext.fromJson(lifecycle)
          : null,
    );
  }

  final String status;
  final String? message;
  final DialogueSocialMovePreview? preview;
  final DialogueSocialMoveOverlap? overlap;
  final List<String> options;
  final DialogueSceneView? currentDialogue;
  final DialogueLifecycleContext? lifecycleContext;

  bool get isPreview =>
      status == 'preview' || status == 'generic_fallback_preview';
  bool get isOverlap =>
      status == 'clarifying_question_overlap' && overlap != null;
  bool get isRevise => status == 'revise';
}

class DialogueSocialMoveSubmitResponse {
  const DialogueSocialMoveSubmitResponse({
    required this.status,
    this.result,
    this.currentDialogue,
  });

  factory DialogueSocialMoveSubmitResponse.fromJson(Map<String, dynamic> json) {
    final result = json['social_move_result'];
    final current = json['current_dialogue'];
    return DialogueSocialMoveSubmitResponse(
      status: json['status']?.toString() ?? 'resolved',
      result: result is Map<String, dynamic>
          ? DialogueTextResult.fromJson(result)
          : null,
      currentDialogue: current is Map<String, dynamic>
          ? DialogueSceneView.fromJson(current)
          : null,
    );
  }

  final String status;
  final DialogueTextResult? result;
  final DialogueSceneView? currentDialogue;
}

class DialogueExitResolveResponse {
  const DialogueExitResolveResponse({
    required this.status,
    this.exitResult = const {},
    this.transition = const {},
    this.completedDialogueRecord,
    this.relationshipUpdates = const [],
    this.currentDialogue,
  });

  factory DialogueExitResolveResponse.fromJson(Map<String, dynamic> json) {
    final completed = json['completed_dialogue_record'];
    final current = json['current_dialogue'];
    return DialogueExitResolveResponse(
      status: json['status']?.toString() ?? 'exited',
      exitResult: _modelMap(json['dialogue_exit_result']),
      transition: _modelMap(json['transition']),
      completedDialogueRecord: completed is Map<String, dynamic>
          ? CompletedDialogueRecord.fromJson(completed)
          : null,
      relationshipUpdates: _modelStringList(json['relationship_updates']),
      currentDialogue: current is Map<String, dynamic>
          ? DialogueSceneView.fromJson(current)
          : null,
    );
  }

  final String status;
  final Map<String, dynamic> exitResult;
  final Map<String, dynamic> transition;
  final CompletedDialogueRecord? completedDialogueRecord;
  final List<String> relationshipUpdates;
  final DialogueSceneView? currentDialogue;
}

class DialogueTranscriptTurn {
  const DialogueTranscriptTurn({
    required this.turnId,
    required this.turnIndex,
    required this.turnType,
    this.speakerLabel,
    this.content = const {},
    this.createdAt,
  });

  factory DialogueTranscriptTurn.fromJson(Map<String, dynamic> json) {
    final speaker = json['speaker'];
    return DialogueTranscriptTurn(
      turnId: json['turn_id']?.toString() ?? '',
      turnIndex:
          json['turn_index'] is num ? (json['turn_index'] as num).toInt() : 0,
      turnType: json['turn_type']?.toString() ?? 'turn',
      speakerLabel:
          speaker is Map<String, dynamic> ? speaker['label']?.toString() : null,
      content: _modelMap(json['content']),
      createdAt: json['created_at']?.toString(),
    );
  }

  final String turnId;
  final int turnIndex;
  final String turnType;
  final String? speakerLabel;
  final Map<String, dynamic> content;
  final String? createdAt;

  String get displayText =>
      content['summary']?.toString() ??
      content['text']?.toString() ??
      content['result_text']?.toString() ??
      '';
}

class CompletedDialogueRecord {
  const CompletedDialogueRecord({
    required this.completedDialogueRecordId,
    this.dialogueSceneId,
    this.transcriptId,
    this.compactSummary,
    this.exitMode,
    this.exitId,
    this.transition = const {},
    this.participants = const [],
    this.knowledgeLinks = const [],
    this.relationshipSummaryLinks = const [],
    this.metadata = const {},
    this.completedAt,
    this.transcriptTurns = const [],
  });

  factory CompletedDialogueRecord.fromJson(Map<String, dynamic> json) {
    return CompletedDialogueRecord(
      completedDialogueRecordId:
          json['completed_dialogue_record_id']?.toString() ??
              json['id']?.toString() ??
              '',
      dialogueSceneId: json['dialogue_scene_id']?.toString(),
      transcriptId: json['transcript_id']?.toString(),
      compactSummary: json['compact_summary']?.toString(),
      exitMode: json['exit_mode']?.toString(),
      exitId: json['exit_id']?.toString(),
      transition: _modelMap(json['transition']),
      participants:
          _modelObjectList(json['participants'], DialogueParticipant.fromJson),
      knowledgeLinks: _modelStringList(json['knowledge_links']),
      relationshipSummaryLinks:
          _modelStringList(json['relationship_summary_links']),
      metadata: _modelMap(json['metadata']),
      completedAt: json['completed_at']?.toString(),
      transcriptTurns: _modelObjectList(
          json['transcript_turns'], DialogueTranscriptTurn.fromJson),
    );
  }

  final String completedDialogueRecordId;
  final String? dialogueSceneId;
  final String? transcriptId;
  final String? compactSummary;
  final String? exitMode;
  final String? exitId;
  final Map<String, dynamic> transition;
  final List<DialogueParticipant> participants;
  final List<String> knowledgeLinks;
  final List<String> relationshipSummaryLinks;
  final Map<String, dynamic> metadata;
  final String? completedAt;
  final List<DialogueTranscriptTurn> transcriptTurns;
}

class DialogueCurrentTranscript {
  const DialogueCurrentTranscript({
    this.transcriptId,
    this.dialogueSceneId,
    this.status,
    this.completedDialogueRecordId,
    this.turns = const [],
  });

  factory DialogueCurrentTranscript.fromJson(Map<String, dynamic> json) {
    return DialogueCurrentTranscript(
      transcriptId: json['transcript_id']?.toString(),
      dialogueSceneId: json['dialogue_scene_id']?.toString(),
      status: json['status']?.toString(),
      completedDialogueRecordId:
          json['completed_dialogue_record_id']?.toString(),
      turns: _modelObjectList(json['turns'], DialogueTranscriptTurn.fromJson),
    );
  }

  final String? transcriptId;
  final String? dialogueSceneId;
  final String? status;
  final String? completedDialogueRecordId;
  final List<DialogueTranscriptTurn> turns;
}

class DialogueCurrentTranscriptResponse {
  const DialogueCurrentTranscriptResponse({this.transcript});

  factory DialogueCurrentTranscriptResponse.fromJson(
      Map<String, dynamic> json) {
    return DialogueCurrentTranscriptResponse(
      transcript: json['transcript'] is Map<String, dynamic>
          ? DialogueCurrentTranscript.fromJson(
              json['transcript'] as Map<String, dynamic>)
          : null,
    );
  }

  final DialogueCurrentTranscript? transcript;
}

class DialogueArchiveList {
  const DialogueArchiveList({this.records = const []});

  factory DialogueArchiveList.fromJson(Map<String, dynamic> json) {
    return DialogueArchiveList(
      records:
          _modelObjectList(json['records'], CompletedDialogueRecord.fromJson),
    );
  }

  final List<CompletedDialogueRecord> records;
}

class DialogueArchiveRecordResponse {
  const DialogueArchiveRecordResponse({required this.record});

  factory DialogueArchiveRecordResponse.fromJson(Map<String, dynamic> json) {
    return DialogueArchiveRecordResponse(
      record: json['record'] is Map<String, dynamic>
          ? CompletedDialogueRecord.fromJson(
              json['record'] as Map<String, dynamic>)
          : const CompletedDialogueRecord(completedDialogueRecordId: ''),
    );
  }

  final CompletedDialogueRecord record;
}

class DialogueArchiveSearchResult {
  const DialogueArchiveSearchResult({
    required this.searchResultId,
    required this.completedDialogueRecordId,
    this.transcriptId,
    this.dialogueSceneId,
    this.compactSummary,
    this.matchedText,
    this.topics = const [],
    this.completedAt,
  });

  factory DialogueArchiveSearchResult.fromJson(Map<String, dynamic> json) {
    return DialogueArchiveSearchResult(
      searchResultId: json['search_result_id']?.toString() ?? '',
      completedDialogueRecordId:
          json['completed_dialogue_record_id']?.toString() ?? '',
      transcriptId: json['transcript_id']?.toString(),
      dialogueSceneId: json['dialogue_scene_id']?.toString(),
      compactSummary: json['compact_summary']?.toString(),
      matchedText: json['matched_text']?.toString(),
      topics: _modelStringList(json['topics']),
      completedAt: json['completed_at']?.toString(),
    );
  }

  final String searchResultId;
  final String completedDialogueRecordId;
  final String? transcriptId;
  final String? dialogueSceneId;
  final String? compactSummary;
  final String? matchedText;
  final List<String> topics;
  final String? completedAt;
}

class DialogueArchiveSearchResults {
  const DialogueArchiveSearchResults({this.results = const []});

  factory DialogueArchiveSearchResults.fromJson(Map<String, dynamic> json) {
    return DialogueArchiveSearchResults(
      results: _modelObjectList(
          json['results'], DialogueArchiveSearchResult.fromJson),
    );
  }

  final List<DialogueArchiveSearchResult> results;
}

class DialogueDebugIssue {
  const DialogueDebugIssue({
    required this.code,
    required this.message,
    this.severity,
    this.sourcePath,
    this.relatedId,
  });

  factory DialogueDebugIssue.fromJson(Map<String, dynamic> json) {
    return DialogueDebugIssue(
      code: json['code']?.toString() ?? json['id']?.toString() ?? 'notice',
      message: json['message']?.toString() ??
          json['description']?.toString() ??
          json.toString(),
      severity: json['severity']?.toString(),
      sourcePath: json['source_path']?.toString() ?? json['path']?.toString(),
      relatedId: json['related_id']?.toString() ??
          json['interaction_id']?.toString() ??
          json['field_name']?.toString(),
    );
  }

  final String code;
  final String message;
  final String? severity;
  final String? sourcePath;
  final String? relatedId;
}

class DialogueDebugValidation {
  const DialogueDebugValidation({
    this.hardErrors = const [],
    this.warnings = const [],
    this.debugNotices = const [],
  });

  factory DialogueDebugValidation.fromJson(Map<String, dynamic> json) {
    return DialogueDebugValidation(
      hardErrors:
          _modelObjectList(json['hard_errors'], DialogueDebugIssue.fromJson),
      warnings: _modelObjectList(json['warnings'], DialogueDebugIssue.fromJson),
      debugNotices:
          _modelObjectList(json['debug_notices'], DialogueDebugIssue.fromJson),
    );
  }

  final List<DialogueDebugIssue> hardErrors;
  final List<DialogueDebugIssue> warnings;
  final List<DialogueDebugIssue> debugNotices;
}

class DialogueDebugInteraction {
  const DialogueDebugInteraction({
    required this.interactionId,
    required this.label,
    required this.status,
    this.targetId,
    this.sourcePath,
    this.failedRequirements = const [],
    this.details = const {},
  });

  factory DialogueDebugInteraction.fromJson(Map<String, dynamic> json) {
    return DialogueDebugInteraction(
      interactionId: json['interaction_id']?.toString() ??
          json['id']?.toString() ??
          json['question_id']?.toString() ??
          json['move_id']?.toString() ??
          json['exit_id']?.toString() ??
          '',
      label: json['label']?.toString() ?? 'Interaction',
      status: json['status']?.toString() ?? 'unknown',
      targetId: json['target_id']?.toString(),
      sourcePath: json['source_path']?.toString(),
      failedRequirements: _modelStringList(json['failed_requirements']),
      details: Map<String, dynamic>.from(json),
    );
  }

  final String interactionId;
  final String label;
  final String status;
  final String? targetId;
  final String? sourcePath;
  final List<String> failedRequirements;
  final Map<String, dynamic> details;
}

class DialogueDebugAvailability {
  const DialogueDebugAvailability({
    this.clarifyingQuestions = const [],
    this.committedSocialMoves = const [],
    this.exits = const [],
  });

  factory DialogueDebugAvailability.fromJson(Map<String, dynamic> json) {
    return DialogueDebugAvailability(
      clarifyingQuestions: _modelObjectList(
          json['clarifying_questions'], DialogueDebugInteraction.fromJson),
      committedSocialMoves: _modelObjectList(
          json['committed_social_moves'], DialogueDebugInteraction.fromJson),
      exits: _modelObjectList(json['exits'], DialogueDebugInteraction.fromJson),
    );
  }

  final List<DialogueDebugInteraction> clarifyingQuestions;
  final List<DialogueDebugInteraction> committedSocialMoves;
  final List<DialogueDebugInteraction> exits;
}

class DialogueDebugAuditRecord {
  const DialogueDebugAuditRecord({
    required this.auditRecordId,
    required this.auditType,
    this.eventId,
    this.eventType,
    this.interactionId,
    this.fieldName,
    this.scope,
    this.status,
    this.summary,
    this.createdAt,
    this.raw = const {},
  });

  factory DialogueDebugAuditRecord.fromJson(Map<String, dynamic> json) {
    return DialogueDebugAuditRecord(
      auditRecordId: json['audit_record_id']?.toString() ??
          json['event_id']?.toString() ??
          json['id']?.toString() ??
          '',
      auditType: json['audit_type']?.toString() ??
          json['event_type']?.toString() ??
          'event',
      eventId: json['event_id']?.toString(),
      eventType: json['event_type']?.toString(),
      interactionId: json['source_interaction_id']?.toString() ??
          json['interaction_id']?.toString(),
      fieldName: json['field_name']?.toString(),
      scope: json['scope']?.toString(),
      status: json['player_facing_status']?.toString() ??
          json['status']?.toString(),
      summary: json['summary']?.toString() ?? json['reason']?.toString(),
      createdAt: json['created_at']?.toString(),
      raw: Map<String, dynamic>.from(json),
    );
  }

  final String auditRecordId;
  final String auditType;
  final String? eventId;
  final String? eventType;
  final String? interactionId;
  final String? fieldName;
  final String? scope;
  final String? status;
  final String? summary;
  final String? createdAt;
  final Map<String, dynamic> raw;
}

class DialogueDebugRelationshipState {
  const DialogueDebugRelationshipState({
    this.definitions = const [],
    this.persistentNpcState = const [],
    this.sceneLocalState = const [],
    this.recentReads = const [],
    this.recentWrites = const [],
    this.auditRecords = const [],
  });

  factory DialogueDebugRelationshipState.fromJson(Map<String, dynamic> json) {
    return DialogueDebugRelationshipState(
      definitions: _modelObjectList(json['definitions'], (entry) => entry),
      persistentNpcState:
          _modelObjectList(json['persistent_npc_state'], (entry) => entry),
      sceneLocalState:
          _modelObjectList(json['scene_local_state'], (entry) => entry),
      recentReads: _modelObjectList(
          json['recent_reads'], DialogueDebugAuditRecord.fromJson),
      recentWrites: _modelObjectList(
          json['recent_writes'], DialogueDebugAuditRecord.fromJson),
      auditRecords: _modelObjectList(
          json['audit_records'], DialogueDebugAuditRecord.fromJson),
    );
  }

  final List<Map<String, dynamic>> definitions;
  final List<Map<String, dynamic>> persistentNpcState;
  final List<Map<String, dynamic>> sceneLocalState;
  final List<DialogueDebugAuditRecord> recentReads;
  final List<DialogueDebugAuditRecord> recentWrites;
  final List<DialogueDebugAuditRecord> auditRecords;
}

class DialogueDebugTranscript {
  const DialogueDebugTranscript({
    this.transcript = const {},
    this.turns = const [],
    this.filters = const [],
  });

  factory DialogueDebugTranscript.fromJson(Map<String, dynamic> json) {
    return DialogueDebugTranscript(
      transcript: _modelMap(json['transcript']),
      turns:
          _modelObjectList(json['turns'], DialogueDebugTranscriptTurn.fromJson),
      filters: _modelStringList(json['filters']),
    );
  }

  final Map<String, dynamic> transcript;
  final List<DialogueDebugTranscriptTurn> turns;
  final List<String> filters;
}

class DialogueDebugTranscriptTurn {
  const DialogueDebugTranscriptTurn({
    required this.turnId,
    required this.turnIndex,
    required this.turnType,
    this.speakerLabel,
    this.sourceInteractionId,
    this.visibilityScope,
    this.playerFacingContent = const {},
    this.gmDevContentRef = const {},
    this.createdAt,
  });

  factory DialogueDebugTranscriptTurn.fromJson(Map<String, dynamic> json) {
    final speaker = _modelMap(json['speaker']);
    return DialogueDebugTranscriptTurn(
      turnId: json['turn_id']?.toString() ?? '',
      turnIndex:
          json['turn_index'] is num ? (json['turn_index'] as num).toInt() : 0,
      turnType: json['turn_type']?.toString() ?? 'turn',
      speakerLabel: speaker['label']?.toString(),
      sourceInteractionId: json['source_interaction_id']?.toString(),
      visibilityScope: json['visibility_scope']?.toString(),
      playerFacingContent: _modelMap(json['player_facing_content']),
      gmDevContentRef: _modelMap(json['gm_dev_content_ref']),
      createdAt: json['created_at']?.toString(),
    );
  }

  final String turnId;
  final int turnIndex;
  final String turnType;
  final String? speakerLabel;
  final String? sourceInteractionId;
  final String? visibilityScope;
  final Map<String, dynamic> playerFacingContent;
  final Map<String, dynamic> gmDevContentRef;
  final String? createdAt;

  String get displayText =>
      playerFacingContent['summary']?.toString() ??
      playerFacingContent['text']?.toString() ??
      playerFacingContent['result_text']?.toString() ??
      '';
}

class DialogueDebugTestCheck {
  const DialogueDebugTestCheck({
    required this.checkId,
    required this.label,
    required this.status,
  });

  factory DialogueDebugTestCheck.fromJson(Map<String, dynamic> json) {
    return DialogueDebugTestCheck(
      checkId: json['check_id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Check',
      status: json['status']?.toString() ?? 'unknown',
    );
  }

  final String checkId;
  final String label;
  final String status;
}

class DialogueDebugTestPaths {
  const DialogueDebugTestPaths({
    this.note,
    this.runEndpoint,
    this.availableModes = const [],
    this.checks = const [],
  });

  factory DialogueDebugTestPaths.fromJson(Map<String, dynamic> json) {
    final modes = json['available_modes'];
    return DialogueDebugTestPaths(
      note: json['note']?.toString(),
      runEndpoint: json['run_endpoint']?.toString(),
      availableModes: modes is List
          ? modes.map((entry) => entry.toString()).toList()
          : const [],
      checks: _modelObjectList(json['checks'], DialogueDebugTestCheck.fromJson),
    );
  }

  final String? note;
  final String? runEndpoint;
  final List<String> availableModes;
  final List<DialogueDebugTestCheck> checks;
}

class DialogueDebugWorkspace {
  const DialogueDebugWorkspace({
    required this.status,
    this.checkedAt,
    this.context = const {},
    this.sceneState = const {},
    this.availability = const DialogueDebugAvailability(),
    this.previewMapping = const {},
    this.relationshipState = const DialogueDebugRelationshipState(),
    this.transcript = const DialogueDebugTranscript(),
    this.completedRecord = const {},
    this.annotationCorrectionChains = const {},
    this.auditTimeline = const [],
    this.validation = const DialogueDebugValidation(),
    this.testPaths = const DialogueDebugTestPaths(),
    this.message,
  });

  factory DialogueDebugWorkspace.fromJson(Map<String, dynamic> json) {
    final auditTimeline = _modelMap(json['audit_timeline']);
    return DialogueDebugWorkspace(
      status: json['status']?.toString() ?? 'unknown',
      checkedAt: json['checked_at']?.toString(),
      context: _modelMap(json['context']),
      sceneState: _modelMap(json['scene_state']),
      availability: json['availability'] is Map<String, dynamic>
          ? DialogueDebugAvailability.fromJson(
              json['availability'] as Map<String, dynamic>)
          : const DialogueDebugAvailability(),
      previewMapping: _modelMap(json['preview_mapping']),
      relationshipState: json['relationship_state'] is Map<String, dynamic>
          ? DialogueDebugRelationshipState.fromJson(
              json['relationship_state'] as Map<String, dynamic>)
          : const DialogueDebugRelationshipState(),
      transcript: json['transcript'] is Map<String, dynamic>
          ? DialogueDebugTranscript.fromJson(
              json['transcript'] as Map<String, dynamic>)
          : const DialogueDebugTranscript(),
      completedRecord: _modelMap(json['completed_record']),
      annotationCorrectionChains:
          _modelMap(json['annotation_correction_chains']),
      auditTimeline: _modelObjectList(
          auditTimeline['records'], DialogueDebugAuditRecord.fromJson),
      validation: json['validation'] is Map<String, dynamic>
          ? DialogueDebugValidation.fromJson(
              json['validation'] as Map<String, dynamic>)
          : const DialogueDebugValidation(),
      testPaths: json['test_paths'] is Map<String, dynamic>
          ? DialogueDebugTestPaths.fromJson(
              json['test_paths'] as Map<String, dynamic>)
          : const DialogueDebugTestPaths(),
      message: json['message']?.toString(),
    );
  }

  final String status;
  final String? checkedAt;
  final Map<String, dynamic> context;
  final Map<String, dynamic> sceneState;
  final DialogueDebugAvailability availability;
  final Map<String, dynamic> previewMapping;
  final DialogueDebugRelationshipState relationshipState;
  final DialogueDebugTranscript transcript;
  final Map<String, dynamic> completedRecord;
  final Map<String, dynamic> annotationCorrectionChains;
  final List<DialogueDebugAuditRecord> auditTimeline;
  final DialogueDebugValidation validation;
  final DialogueDebugTestPaths testPaths;
  final String? message;
}

class ExplorationMechanicsIssue {
  const ExplorationMechanicsIssue({
    required this.code,
    required this.message,
    this.severity,
    this.sourceType,
    this.sourceId,
    this.sourceLabel,
  });

  factory ExplorationMechanicsIssue.fromJson(Map<String, dynamic> json) {
    return ExplorationMechanicsIssue(
      code: json['code']?.toString() ?? json['id']?.toString() ?? 'notice',
      message: json['message']?.toString() ??
          json['description']?.toString() ??
          json.toString(),
      severity: json['severity']?.toString(),
      sourceType: json['source_type']?.toString(),
      sourceId: json['source_id']?.toString() ??
          json['related_id']?.toString() ??
          json['interaction_id']?.toString() ??
          json['field_name']?.toString(),
      sourceLabel: json['source_label']?.toString(),
    );
  }

  final String code;
  final String message;
  final String? severity;
  final String? sourceType;
  final String? sourceId;
  final String? sourceLabel;
}

class ExplorationMechanicsValidation {
  const ExplorationMechanicsValidation({
    this.hardErrors = const [],
    this.warnings = const [],
    this.debugNotices = const [],
  });

  factory ExplorationMechanicsValidation.fromJson(Map<String, dynamic> json) {
    return ExplorationMechanicsValidation(
      hardErrors: _modelObjectList(
          json['hard_errors'], ExplorationMechanicsIssue.fromJson),
      warnings: _modelObjectList(
          json['warnings'], ExplorationMechanicsIssue.fromJson),
      debugNotices: _modelObjectList(
          json['debug_notices'], ExplorationMechanicsIssue.fromJson),
    );
  }

  final List<ExplorationMechanicsIssue> hardErrors;
  final List<ExplorationMechanicsIssue> warnings;
  final List<ExplorationMechanicsIssue> debugNotices;
}

class ExplorationMechanicsDebugWorkspace {
  const ExplorationMechanicsDebugWorkspace({
    required this.status,
    this.checkedAt,
    this.context = const {},
    this.sceneState = const {},
    this.surfaceContext = const {},
    this.passiveDiscoveries = const [],
    this.freeFocusItems = const [],
    this.beatActionOptions = const [],
    this.submittedAction = const {},
    this.previewMapping = const {},
    this.checkDetails = const [],
    this.resultBands = const [],
    this.environmentModifiers = const [],
    this.npcPresence = const [],
    this.stateReads = const [],
    this.stateWrites = const [],
    this.knowledgeOutputs = const [],
    this.historyOutputs = const [],
    this.transitions = const [],
    this.auditTimeline = const [],
    this.validation = const ExplorationMechanicsValidation(),
    this.visibilityBoundaries = const {},
    this.rawDebugPayload = const {},
  });

  factory ExplorationMechanicsDebugWorkspace.fromJson(
      Map<String, dynamic> json) {
    final payload = _modelMap(json['exploration_mechanics_debug']);
    return ExplorationMechanicsDebugWorkspace(
      status: json['status']?.toString() ?? 'unknown',
      checkedAt: json['checked_at']?.toString(),
      context: _modelMap(json['context']),
      sceneState: _modelMap(payload['scene_state']),
      surfaceContext: _modelMap(payload['surface_context']),
      passiveDiscoveries: _modelMapList(payload['passive_discoveries']),
      freeFocusItems: _modelMapList(payload['free_focus_items']),
      beatActionOptions: _modelMapList(payload['beat_action_options']),
      submittedAction: _modelMap(payload['submitted_action']),
      previewMapping: _modelMap(payload['preview_mapping']),
      checkDetails: _modelMapList(payload['check_details']),
      resultBands: _modelMapList(payload['result_bands']),
      environmentModifiers: _modelMapList(payload['environment_modifiers']),
      npcPresence: _modelMapList(payload['npc_presence']),
      stateReads: _modelMapList(payload['state_reads']),
      stateWrites: _modelMapList(payload['state_writes']),
      knowledgeOutputs: _modelMapList(payload['knowledge_outputs']),
      historyOutputs: _modelMapList(payload['history_outputs']),
      transitions: _modelMapList(payload['transitions']),
      auditTimeline: _modelMapList(payload['audit_timeline']),
      validation: payload['validation'] is Map<String, dynamic>
          ? ExplorationMechanicsValidation.fromJson(
              payload['validation'] as Map<String, dynamic>)
          : const ExplorationMechanicsValidation(),
      visibilityBoundaries: _modelMap(payload['visibility_boundaries']),
      rawDebugPayload: payload,
    );
  }

  final String status;
  final String? checkedAt;
  final Map<String, dynamic> context;
  final Map<String, dynamic> sceneState;
  final Map<String, dynamic> surfaceContext;
  final List<Map<String, dynamic>> passiveDiscoveries;
  final List<Map<String, dynamic>> freeFocusItems;
  final List<Map<String, dynamic>> beatActionOptions;
  final Map<String, dynamic> submittedAction;
  final Map<String, dynamic> previewMapping;
  final List<Map<String, dynamic>> checkDetails;
  final List<Map<String, dynamic>> resultBands;
  final List<Map<String, dynamic>> environmentModifiers;
  final List<Map<String, dynamic>> npcPresence;
  final List<Map<String, dynamic>> stateReads;
  final List<Map<String, dynamic>> stateWrites;
  final List<Map<String, dynamic>> knowledgeOutputs;
  final List<Map<String, dynamic>> historyOutputs;
  final List<Map<String, dynamic>> transitions;
  final List<Map<String, dynamic>> auditTimeline;
  final ExplorationMechanicsValidation validation;
  final Map<String, dynamic> visibilityBoundaries;
  final Map<String, dynamic> rawDebugPayload;
}

class CharacterListResult {
  const CharacterListResult({
    required this.characters,
    required this.activeCharacterId,
  });

  factory CharacterListResult.fromJson(Map<String, dynamic> json) {
    final charactersJson = json['characters'];
    return CharacterListResult(
      characters: charactersJson is List
          ? charactersJson
              .whereType<Map<String, dynamic>>()
              .map(CharacterSummary.fromJson)
              .toList()
          : const [],
      activeCharacterId: json['active_character_id']?.toString(),
    );
  }

  final List<CharacterSummary> characters;
  final String? activeCharacterId;
}

class AbilityScoreView {
  const AbilityScoreView({
    required this.label,
    required this.score,
    required this.modifier,
    required this.saveProficient,
  });

  factory AbilityScoreView.fromJson(Map<String, dynamic> json) {
    return AbilityScoreView(
      label: json['label']?.toString() ?? 'Ability',
      score: json['score'] is num ? (json['score'] as num).toInt() : 10,
      modifier: json['modifier'] is num ? (json['modifier'] as num).toInt() : 0,
      saveProficient: json['save_proficient'] == true,
    );
  }

  final String label;
  final int score;
  final int modifier;
  final bool saveProficient;

  String get formattedModifier => modifier >= 0 ? '+$modifier' : '$modifier';
}

class CombatBasics {
  const CombatBasics({
    required this.armorClass,
    required this.currentHp,
    required this.maxHp,
    required this.temporaryHp,
    required this.initiative,
    required this.speed,
    required this.proficiencyBonus,
    required this.passivePerception,
    this.hitDice,
    this.conditions = const [],
  });

  factory CombatBasics.fromJson(Map<String, dynamic> json) {
    final hp = json['hit_points'];
    return CombatBasics(
      armorClass: json['armor_class'] is num
          ? (json['armor_class'] as num).toInt()
          : 10,
      currentHp: hp is Map && hp['current'] is num
          ? (hp['current'] as num).toInt()
          : 0,
      maxHp: hp is Map && hp['max'] is num ? (hp['max'] as num).toInt() : 0,
      temporaryHp: hp is Map && hp['temporary'] is num
          ? (hp['temporary'] as num).toInt()
          : 0,
      hitDice: json['hit_dice']?.toString(),
      initiative:
          json['initiative'] is num ? (json['initiative'] as num).toInt() : 0,
      speed: json['speed'] is num ? (json['speed'] as num).toInt() : 30,
      proficiencyBonus: json['proficiency_bonus'] is num
          ? (json['proficiency_bonus'] as num).toInt()
          : 2,
      passivePerception: json['passive_perception'] is num
          ? (json['passive_perception'] as num).toInt()
          : 10,
      conditions: json['conditions'] is List
          ? (json['conditions'] as List)
              .map((entry) => entry.toString())
              .toList()
          : const [],
    );
  }

  final int armorClass;
  final int currentHp;
  final int maxHp;
  final int temporaryHp;
  final String? hitDice;
  final int initiative;
  final int speed;
  final int proficiencyBonus;
  final int passivePerception;
  final List<String> conditions;
}

class CharacterFeatureSummary {
  const CharacterFeatureSummary({
    required this.id,
    required this.name,
    required this.sourceLabel,
    required this.summary,
  });

  factory CharacterFeatureSummary.fromJson(Map<String, dynamic> json) {
    return CharacterFeatureSummary(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Feature',
      sourceLabel: json['source_label']?.toString() ??
          json['source']?.toString() ??
          'Feature',
      summary: json['summary']?.toString() ?? json['details']?.toString() ?? '',
    );
  }

  final String id;
  final String name;
  final String sourceLabel;
  final String summary;
}

class CharacterProficiencies {
  const CharacterProficiencies({
    required this.skills,
    required this.savingThrows,
    required this.weapons,
    required this.armor,
    required this.tools,
    required this.languages,
  });

  factory CharacterProficiencies.fromJson(Map<String, dynamic> json) {
    List<String> strings(String key) => json[key] is List
        ? (json[key] as List).map((entry) => entry.toString()).toList()
        : const [];
    return CharacterProficiencies(
      skills: strings('skills'),
      savingThrows: strings('saving_throws'),
      weapons: strings('weapons'),
      armor: strings('armor'),
      tools: strings('tools'),
      languages: strings('languages'),
    );
  }

  final List<String> skills;
  final List<String> savingThrows;
  final List<String> weapons;
  final List<String> armor;
  final List<String> tools;
  final List<String> languages;
}

class EquipmentSummary {
  const EquipmentSummary({
    required this.summary,
    required this.items,
    required this.equipped,
    required this.defaultsApplied,
  });

  factory EquipmentSummary.fromJson(Map<String, dynamic> json) {
    List<String> itemNames(String key) => json[key] is List
        ? (json[key] as List)
            .whereType<Map<String, dynamic>>()
            .map((entry) => entry['name']?.toString() ?? 'Item')
            .toList()
        : const [];
    return EquipmentSummary(
      summary: json['summary']?.toString() ?? 'No equipment recorded yet.',
      items: itemNames('items'),
      equipped: itemNames('equipped'),
      defaultsApplied: json['defaults_applied'] == true,
    );
  }

  final String summary;
  final List<String> items;
  final List<String> equipped;
  final bool defaultsApplied;
}

class SpellSummary {
  const SpellSummary({
    required this.isSpellcaster,
    required this.cantrips,
    required this.levelOneSpells,
    required this.defaultsApplied,
    this.spellcastingAbility,
    this.spellSaveDc,
    this.spellAttackBonus,
  });

  factory SpellSummary.fromJson(Map<String, dynamic> json) {
    List<String> strings(String key) => json[key] is List
        ? (json[key] as List).map((entry) => entry.toString()).toList()
        : const [];
    return SpellSummary(
      isSpellcaster: json['is_spellcaster'] == true,
      spellcastingAbility: json['spellcasting_ability']?.toString(),
      spellSaveDc: json['spell_save_dc'] is num
          ? (json['spell_save_dc'] as num).toInt()
          : null,
      spellAttackBonus: json['spell_attack_bonus'] is num
          ? (json['spell_attack_bonus'] as num).toInt()
          : null,
      cantrips: strings('cantrips'),
      levelOneSpells: strings('level_1_spells'),
      defaultsApplied: json['defaults_applied'] == true,
    );
  }

  final bool isSpellcaster;
  final String? spellcastingAbility;
  final int? spellSaveDc;
  final int? spellAttackBonus;
  final List<String> cantrips;
  final List<String> levelOneSpells;
  final bool defaultsApplied;
}

class KnowledgePreview {
  const KnowledgePreview({
    required this.knownClueCount,
    required this.recentFacts,
    required this.fullKnowledgeRoute,
  });

  factory KnowledgePreview.fromJson(Map<String, dynamic> json) {
    final facts = json['recent_known_facts'];
    return KnowledgePreview(
      knownClueCount: json['known_clue_count'] is num
          ? (json['known_clue_count'] as num).toInt()
          : 0,
      recentFacts: facts is List
          ? facts
              .whereType<Map<String, dynamic>>()
              .map((entry) => entry['text']?.toString() ?? '')
              .where((entry) => entry.isNotEmpty)
              .toList()
          : const [],
      fullKnowledgeRoute: json['full_knowledge_route']?.toString() ??
          '/play/campaign/knowledge',
    );
  }

  final int knownClueCount;
  final List<String> recentFacts;
  final String fullKnowledgeRoute;
}

class CharacterSheet {
  const CharacterSheet({
    required this.character,
    required this.abilityScores,
    required this.combat,
    required this.features,
    required this.proficiencies,
    required this.equipment,
    required this.spells,
    required this.currentAdventure,
    required this.knowledgePreview,
    required this.pendingAction,
    required this.limitations,
  });

  factory CharacterSheet.fromJson(Map<String, dynamic> json) {
    final abilityJson = json['ability_scores'];
    final featureJson = json['features'];
    return CharacterSheet(
      character:
          CharacterSummary.fromJson(json['character'] as Map<String, dynamic>),
      abilityScores: abilityJson is Map<String, dynamic>
          ? abilityJson.map((key, value) => MapEntry(
                key,
                value is Map<String, dynamic>
                    ? AbilityScoreView.fromJson(value)
                    : AbilityScoreView.fromJson(const <String, dynamic>{}),
              ))
          : const <String, AbilityScoreView>{},
      combat: CombatBasics.fromJson(
        json['combat'] is Map<String, dynamic>
            ? json['combat'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      features: featureJson is List
          ? featureJson
              .whereType<Map<String, dynamic>>()
              .map(CharacterFeatureSummary.fromJson)
              .toList()
          : const [],
      proficiencies: CharacterProficiencies.fromJson(
        json['proficiencies'] is Map<String, dynamic>
            ? json['proficiencies'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      equipment: EquipmentSummary.fromJson(
        json['equipment'] is Map<String, dynamic>
            ? json['equipment'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      spells: SpellSummary.fromJson(
        json['spells'] is Map<String, dynamic>
            ? json['spells'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      currentAdventure: json['current_adventure'] is Map<String, dynamic>
          ? CampaignSummary.fromJson(
              json['current_adventure'] as Map<String, dynamic>)
          : null,
      knowledgePreview: KnowledgePreview.fromJson(
        json['knowledge_preview'] is Map<String, dynamic>
            ? json['knowledge_preview'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
      pendingAction: json['pending_action'] is Map<String, dynamic>
          ? PendingActionStatus.fromJson(
              json['pending_action'] as Map<String, dynamic>)
          : null,
      limitations: json['limitations'] is Map<String, dynamic>
          ? json['limitations'] as Map<String, dynamic>
          : const {},
    );
  }

  final CharacterSummary character;
  final Map<String, AbilityScoreView> abilityScores;
  final CombatBasics combat;
  final List<CharacterFeatureSummary> features;
  final CharacterProficiencies proficiencies;
  final EquipmentSummary equipment;
  final SpellSummary spells;
  final CampaignSummary? currentAdventure;
  final KnowledgePreview knowledgePreview;
  final PendingActionStatus? pendingAction;
  final Map<String, dynamic> limitations;
}

class ActiveCharacterSwitchResult {
  const ActiveCharacterSwitchResult({
    required this.activeCharacterId,
    required this.switched,
    required this.previousHadPendingAction,
    this.previousActiveCharacterId,
    this.previousCharacterName,
    this.playerState,
  });

  factory ActiveCharacterSwitchResult.fromJson(Map<String, dynamic> json) {
    final pending = json['previous_active_pending_action'];
    return ActiveCharacterSwitchResult(
      activeCharacterId: json['active_character_id']?.toString() ?? '',
      previousActiveCharacterId:
          json['previous_active_character_id']?.toString(),
      switched: json['switched'] == true,
      previousHadPendingAction: pending is Map<String, dynamic> &&
          pending['had_pending_unresolved_action'] == true,
      previousCharacterName: pending is Map<String, dynamic>
          ? pending['character_name']?.toString()
          : null,
      playerState: json['player_state'] is Map<String, dynamic>
          ? PlayerState.fromJson(json['player_state'] as Map<String, dynamic>)
          : null,
    );
  }

  final String activeCharacterId;
  final String? previousActiveCharacterId;
  final bool switched;
  final bool previousHadPendingAction;
  final String? previousCharacterName;
  final PlayerState? playerState;
}

class CampaignHistory {
  const CampaignHistory({
    required this.state,
    required this.timeline,
    this.campaign,
    this.activeCharacter,
  });

  factory CampaignHistory.fromJson(Map<String, dynamic> json) {
    final timeline = json['timeline'];
    return CampaignHistory(
      state: json['state']?.toString() ?? 'unknown',
      campaign: json['campaign'] is Map<String, dynamic>
          ? CurrentSceneCampaign.fromJson(
              json['campaign'] as Map<String, dynamic>)
          : null,
      activeCharacter: json['active_character'] is Map<String, dynamic>
          ? CharacterSummary.fromJson(
              json['active_character'] as Map<String, dynamic>)
          : null,
      timeline: timeline is List
          ? timeline
              .whereType<Map<String, dynamic>>()
              .map(CampaignTimelineEntry.fromJson)
              .toList()
          : const [],
    );
  }

  final String state;
  final CurrentSceneCampaign? campaign;
  final CharacterSummary? activeCharacter;
  final List<CampaignTimelineEntry> timeline;
}

class CampaignTimelineEntry {
  const CampaignTimelineEntry({
    required this.id,
    required this.type,
    required this.title,
    required this.summary,
    required this.visibleChanges,
    required this.majorDiscoveries,
    required this.objectiveUpdates,
    required this.safeMechanics,
    this.beatNumber,
    this.narration,
    this.sceneTitle,
    this.locationName,
    this.submittedActionSummary,
    this.interpretedActionSummary,
    this.resolvedAt,
  });

  factory CampaignTimelineEntry.fromJson(Map<String, dynamic> json) {
    List<String> textList(String key) {
      final value = json[key];
      if (value is! List) {
        return const [];
      }
      return value
          .whereType<Map<String, dynamic>>()
          .map((entry) =>
              entry['text']?.toString() ??
              entry['progress_text']?.toString() ??
              entry['summary']?.toString() ??
              '')
          .where((entry) => entry.trim().isNotEmpty)
          .toList();
    }

    final mechanics = json['mechanical_details'];
    final mechanicEntries = mechanics is Map<String, dynamic>
        ? mechanics['entries']
        : json['safe_mechanics'];
    return CampaignTimelineEntry(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'beat_result',
      beatNumber: json['beat_number'] is num
          ? (json['beat_number'] as num).toInt()
          : null,
      title: json['title']?.toString() ?? 'Campaign event',
      summary: json['summary']?.toString() ?? '',
      narration: json['narration']?.toString(),
      sceneTitle: json['scene_title']?.toString(),
      locationName: json['location_name']?.toString(),
      submittedActionSummary: json['submitted_action_summary']?.toString(),
      interpretedActionSummary: json['interpreted_action_summary']?.toString(),
      visibleChanges: textList('visible_changes'),
      majorDiscoveries: textList('major_discoveries'),
      objectiveUpdates: textList('objective_updates'),
      safeMechanics: mechanicEntries is List
          ? mechanicEntries
              .whereType<Map<String, dynamic>>()
              .map((entry) =>
                  entry['text']?.toString() ?? entry['label']?.toString() ?? '')
              .where((entry) => entry.trim().isNotEmpty)
              .toList()
          : const [],
      resolvedAt: json['resolved_at']?.toString(),
    );
  }

  final String id;
  final String type;
  final int? beatNumber;
  final String title;
  final String summary;
  final String? narration;
  final String? sceneTitle;
  final String? locationName;
  final String? submittedActionSummary;
  final String? interpretedActionSummary;
  final List<String> visibleChanges;
  final List<String> majorDiscoveries;
  final List<String> objectiveUpdates;
  final List<String> safeMechanics;
  final String? resolvedAt;
}

class KnowledgeJournal {
  const KnowledgeJournal({
    required this.state,
    required this.sections,
    required this.knownCount,
    this.campaign,
    this.activeCharacter,
    this.currentObjective,
  });

  factory KnowledgeJournal.fromJson(Map<String, dynamic> json) {
    return KnowledgeJournal(
      state: json['state']?.toString() ?? 'unknown',
      campaign: json['campaign'] is Map<String, dynamic>
          ? CurrentSceneCampaign.fromJson(
              json['campaign'] as Map<String, dynamic>)
          : null,
      activeCharacter: json['active_character'] is Map<String, dynamic>
          ? CharacterSummary.fromJson(
              json['active_character'] as Map<String, dynamic>)
          : null,
      knownCount:
          json['known_count'] is num ? (json['known_count'] as num).toInt() : 0,
      currentObjective: json['current_objective'] is Map<String, dynamic>
          ? SceneObjective.fromJson(
              json['current_objective'] as Map<String, dynamic>)
          : null,
      sections: KnowledgeJournalSections.fromJson(
        json['sections'] is Map<String, dynamic>
            ? json['sections'] as Map<String, dynamic>
            : const <String, dynamic>{},
      ),
    );
  }

  final String state;
  final CurrentSceneCampaign? campaign;
  final CharacterSummary? activeCharacter;
  final SceneObjective? currentObjective;
  final int knownCount;
  final KnowledgeJournalSections sections;
}

class KnowledgeJournalSections {
  const KnowledgeJournalSections({
    required this.clues,
    required this.facts,
    required this.rumors,
    required this.people,
    required this.locations,
    required this.objectiveDiscoveries,
  });

  factory KnowledgeJournalSections.fromJson(Map<String, dynamic> json) {
    List<KnowledgeJournalEntry> entries(String key) {
      final value = json[key];
      return value is List
          ? value
              .whereType<Map<String, dynamic>>()
              .map(KnowledgeJournalEntry.fromJson)
              .where((entry) => entry.text.trim().isNotEmpty)
              .toList()
          : const [];
    }

    return KnowledgeJournalSections(
      clues: entries('clues'),
      facts: entries('facts'),
      rumors: entries('rumors'),
      people: entries('people'),
      locations: entries('locations'),
      objectiveDiscoveries: entries('objective_discoveries'),
    );
  }

  final List<KnowledgeJournalEntry> clues;
  final List<KnowledgeJournalEntry> facts;
  final List<KnowledgeJournalEntry> rumors;
  final List<KnowledgeJournalEntry> people;
  final List<KnowledgeJournalEntry> locations;
  final List<KnowledgeJournalEntry> objectiveDiscoveries;

  bool get isEmpty =>
      clues.isEmpty &&
      facts.isEmpty &&
      rumors.isEmpty &&
      people.isEmpty &&
      locations.isEmpty &&
      objectiveDiscoveries.isEmpty;
}

class KnowledgeJournalEntry {
  const KnowledgeJournalEntry({
    required this.knowledgeId,
    required this.title,
    required this.text,
    this.type,
    this.status,
    this.confidence,
    this.discoveredAt,
    this.sourceLabel,
  });

  factory KnowledgeJournalEntry.fromJson(Map<String, dynamic> json) {
    final source = json['source'];
    return KnowledgeJournalEntry(
      knowledgeId: json['knowledge_id']?.toString() ??
          json['knowledge_key']?.toString() ??
          '',
      title: json['title']?.toString() ??
          json['knowledge_id']?.toString() ??
          'Known detail',
      text: json['text']?.toString() ?? '',
      type: json['type']?.toString(),
      status: json['status']?.toString(),
      confidence: json['confidence']?.toString(),
      discoveredAt:
          json['discovered_at']?.toString() ?? json['known_at']?.toString(),
      sourceLabel:
          source is Map<String, dynamic> ? source['label']?.toString() : null,
    );
  }

  final String knowledgeId;
  final String title;
  final String text;
  final String? type;
  final String? status;
  final String? confidence;
  final String? discoveredAt;
  final String? sourceLabel;
}

class PlayerState {
  const PlayerState({
    required this.account,
    required this.characters,
    required this.activeCharacter,
    required this.currentCampaign,
    required this.actionRequired,
  });

  factory PlayerState.fromJson(Map<String, dynamic> json) {
    final charactersJson = json['characters'];

    return PlayerState(
      account: AccountSummary.fromJson(json['account'] as Map<String, dynamic>),
      characters: charactersJson is List
          ? charactersJson
              .whereType<Map<String, dynamic>>()
              .map(CharacterSummary.fromJson)
              .toList()
          : const [],
      activeCharacter: json['active_character'] is Map<String, dynamic>
          ? CharacterSummary.fromJson(
              json['active_character'] as Map<String, dynamic>)
          : null,
      currentCampaign: json['current_campaign'] is Map<String, dynamic>
          ? CampaignSummary.fromJson(
              json['current_campaign'] as Map<String, dynamic>)
          : null,
      actionRequired: json['action_required'] == true,
    );
  }

  final AccountSummary account;
  final List<CharacterSummary> characters;
  final CharacterSummary? activeCharacter;
  final CampaignSummary? currentCampaign;
  final bool actionRequired;
}
