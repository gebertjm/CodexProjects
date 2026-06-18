import 'package:flutter_test/flutter_test.dart';
import 'package:dailyttrpg_player_app/api/models.dart';

void main() {
  test('PlayerState parses empty account state', () {
    final state = PlayerState.fromJson({
      'account': {
        'account_id': '1',
        'firebase_uid': 'uid-1',
        'email': 'player@example.com',
        'display_name': 'Player',
        'sms_enabled': false,
        'sms_mode': 'disabled',
      },
      'characters': [],
      'active_character': null,
      'current_campaign': null,
      'action_required': false,
    });

    expect(state.account.smsEnabled, false);
    expect(state.account.smsMode, 'disabled');
    expect(state.characters, isEmpty);
    expect(state.activeCharacter, isNull);
    expect(state.currentCampaign, isNull);
  });

  test('PlayerState parses active character and campaign summary', () {
    final state = PlayerState.fromJson({
      'account': {
        'account_id': '1',
        'firebase_uid': 'uid-1',
        'display_name': 'Player',
        'sms_enabled': false,
        'sms_mode': 'disabled',
      },
      'characters': [
        {
          'character_id': '7',
          'name': 'Aric',
          'level': 2,
          'class': 'Fighter',
          'species': 'Human',
          'status': 'active',
          'is_current_active': true,
        }
      ],
      'active_character': {
        'character_id': '7',
        'name': 'Aric',
        'level': 2,
        'class': 'Fighter',
        'species': 'Human',
        'status': 'active',
        'is_current_active': true,
      },
      'current_campaign': {
        'campaign_instance_id': '3',
        'campaign_name': 'Shadows on the Grey Road',
        'world_name': 'Greyvale',
        'current_location': {'name': 'Broken Caravan Site'},
        'current_scene': {'name': 'The Broken Caravan'},
        'current_objective': {'title': 'Witness the Aftermath'},
        'action_required': true,
      },
      'action_required': true,
    });

    expect(state.activeCharacter?.name, 'Aric');
    expect(state.currentCampaign?.currentSceneName, 'The Broken Caravan');
    expect(state.actionRequired, true);
  });

  test('CharacterCreationOptions parses web creation choices', () {
    final options = CharacterCreationOptions.fromJson({
      'creation_modes': [
        {'id': 'quick_start', 'label': 'Quick Start'},
        {'id': 'guided', 'label': 'Guided'},
        {'id': 'detailed', 'label': 'Detailed'},
      ],
      'archetypes': [
        {'id': 'stalwart_fighter', 'label': 'Stalwart Fighter'},
      ],
      'species': [
        {
          'id': '1',
          'slug': 'elf',
          'label': 'Elf',
          'subraces': [
            {'id': '11', 'slug': 'wood-elf', 'label': 'Wood Elf'},
          ],
        },
      ],
      'classes': [
        {
          'id': '5',
          'slug': 'fighter',
          'label': 'Fighter',
          'supported_in_creation': true
        },
      ],
      'attribute_presets': [
        {'id': 'strong_durable', 'label': 'Strong and durable'},
      ],
      'backgrounds': [
        {'id': '3', 'slug': 'soldier', 'label': 'Soldier'},
      ],
      'traits': [
        {'id': 'brave', 'label': 'Brave'},
      ],
      'standard_array': [15, 14, 13, 12, 10, 8],
      'defaults_policy': {'equipment': 'recommended_defaults'},
    });

    expect(options.modes.map((mode) => mode.id), contains('detailed'));
    expect(options.species.single.subraces.single.label, 'Wood Elf');
    expect(options.standardArray, [15, 14, 13, 12, 10, 8]);
  });

  test('CreatedCharacterResult parses next actions', () {
    final result = CreatedCharacterResult.fromJson({
      'character': {
        'character_id': '9',
        'name': 'Mira',
        'level': 1,
        'class': 'Wizard',
        'species': 'Elf',
        'status': 'active',
        'is_active_character': true,
      },
      'active_character_changed': true,
      'next_actions': {
        'can_start_adventure': true,
        'can_set_active': false,
      },
    });

    expect(result.character.isActive, true);
    expect(result.canStartAdventure, true);
    expect(result.canSetActive, false);
  });

  test('CharacterListResult parses campaign and pending action state', () {
    final result = CharacterListResult.fromJson({
      'active_character_id': '12',
      'characters': [
        {
          'character_id': '12',
          'name': 'Mira',
          'level': 1,
          'species': 'Human',
          'subrace': null,
          'class': 'Rogue',
          'background': 'Wanderer',
          'trait': 'Curious',
          'status': 'active',
          'is_active_character': true,
          'current_campaign': {
            'campaign_instance_id': '44',
            'campaign_name': 'Shadows on the Grey Road',
            'world_slug': 'greyvale',
            'current_location_label': 'Grey Road Inn',
            'current_objective': {
              'title': 'Learn what happened to the caravan',
            },
            'action_required': true,
          },
          'pending_action': {
            'has_pending_unresolved_action': true,
            'action_required': false,
            'status': 'action_submitted',
            'progression_window_id': '99',
            'response_summary': 'Inspect the wagon',
          },
        },
      ],
    });

    expect(result.activeCharacterId, '12');
    expect(result.characters.single.currentCampaign?.worldName, 'greyvale');
    expect(result.characters.single.pendingAction?.label, 'Action submitted');
  });

  test('CharacterSheet parses practical sheet sections safely', () {
    final sheet = CharacterSheet.fromJson({
      'character': {
        'character_id': '12',
        'name': 'Mira',
        'level': 1,
        'species': 'Human',
        'subrace': 'Variant Human',
        'class': 'Rogue',
        'background': 'Wanderer',
        'trait': 'Curious',
        'status': 'active',
        'is_active_character': true,
      },
      'ability_scores': {
        'dex': {
          'label': 'Dexterity',
          'score': 16,
          'modifier': 3,
          'save_proficient': true
        },
      },
      'combat': {
        'armor_class': 14,
        'hit_points': {'current': 9, 'max': 9, 'temporary': 0},
        'initiative': 3,
        'speed': 30,
        'proficiency_bonus': 2,
        'passive_perception': 13,
      },
      'features': [
        {
          'id': 'sneak_attack',
          'name': 'Sneak Attack',
          'source_label': 'Rogue',
          'summary': 'Deal extra damage when conditions are right.',
        },
      ],
      'proficiencies': {
        'skills': ['Stealth'],
        'saving_throws': ['Dexterity'],
        'weapons': [],
        'armor': [],
        'tools': [],
        'languages': ['Common'],
      },
      'equipment': {
        'summary': 'Leather armor, shortsword',
        'items': [
          {'name': 'Leather armor'},
        ],
        'equipped': [
          {'name': 'Leather armor'},
        ],
        'defaults_applied': true,
      },
      'spells': {'is_spellcaster': false, 'cantrips': [], 'level_1_spells': []},
      'knowledge_preview': {
        'known_clue_count': 1,
        'recent_known_facts': [
          {'text': 'The caravan attack does not look like simple robbery.'},
        ],
      },
      'pending_action': {'status': 'none', 'action_required': false},
      'limitations': {
        'full_detailed_sheet_deferred_to': '6B.2D',
        'full_knowledge_history_deferred_to': '6B.6',
      },
    });

    expect(sheet.character.subrace, 'Variant Human');
    expect(sheet.abilityScores['dex']?.formattedModifier, '+3');
    expect(sheet.combat.armorClass, 14);
    expect(sheet.features.single.name, 'Sneak Attack');
    expect(sheet.equipment.defaultsApplied, true);
    expect(sheet.knowledgePreview.knownClueCount, 1);
  });

  test('ActiveCharacterSwitchResult parses pending-action warning', () {
    final result = ActiveCharacterSwitchResult.fromJson({
      'active_character_id': '22',
      'previous_active_character_id': '12',
      'switched': true,
      'previous_active_pending_action': {
        'had_pending_unresolved_action': true,
        'character_name': 'Mira',
      },
    });

    expect(result.activeCharacterId, '22');
    expect(result.previousHadPendingAction, true);
    expect(result.previousCharacterName, 'Mira');
  });

  test('PlayerDashboard parses starter adventure and current campaign preview',
      () {
    final dashboard = PlayerDashboard.fromJson({
      'account': {
        'account_id': '1',
        'firebase_uid': 'uid-1',
        'display_name': 'Player',
        'sms_enabled': false,
        'sms_mode': 'disabled',
      },
      'active_character': {
        'character_id': '7',
        'name': 'Aric',
        'level': 1,
        'species': 'Human',
        'class': 'Fighter',
        'status': 'active',
      },
      'characters_summary': {'count': 1, 'manage_route': '/play/characters'},
      'starter_adventure': {
        'id': 'default_starter_adventure',
        'world_id': 'greyvale',
        'world_name': 'Greyvale',
        'campaign_package_id': 'shadows_grey_road',
        'campaign_name': 'Shadows on the Grey Road',
        'intro_title': 'Start Greyvale',
        'intro_text': 'Your first adventure begins in Greyvale.',
        'begin_label': 'Begin Greyvale',
        'cancel_label': 'Cancel',
        'route_after_start': '/play/campaign/scene',
      },
      'current_adventure': {
        'has_active_campaign': true,
        'campaign_instance_id': '44',
        'world_id': 'greyvale',
        'world_name': 'Greyvale',
        'campaign_package_id': 'shadows_grey_road',
        'campaign_name': 'Shadows on the Grey Road',
        'current_location_name': 'Grey Road Inn',
        'current_scene_title': 'The Grey Road Inn',
        'current_objective': {'title': 'Learn what happened'},
        'environment': {
          'weather': 'rain',
          'time_of_day': 'evening',
          'season': 'autumn',
          'summary': 'Evening · Rain · Autumn',
        },
        'visible_npc_preview': [
          {'npc_id': 'npc_tomas', 'display_name': 'the innkeeper'},
        ],
        'action_status': {
          'state': 'slice_endpoint_reached',
          'label': 'Slice endpoint reached',
          'description':
              'You have reached the end of the current Greyvale playable slice.',
        },
        'slice_endpoint': {
          'is_endpoint_reached': true,
          'state': 'endpoint_reached',
          'label': 'Greyvale slice endpoint reached',
          'headline': 'The shrine confrontation is ready.',
          'message':
              'You have reached the end of the current Greyvale playable slice.',
          'latest_development':
              'Rusk has forced the shrine threat into a confrontation.',
          'current_status':
              'The current Greyvale slice is ready to continue when combat support is enabled.',
          'next_step':
              'Review your journal, campaign history, and completed conversations.',
          'recovery_action': 'review_progress',
        },
        'preview_route': '/play/campaign',
        'scene_route': '/play/campaign/scene',
        'full_scene_view_deferred_to': '6B.4',
      },
      'next_actions': {
        'can_create_character': false,
        'can_resume_draft': false,
        'can_start_adventure': false,
        'can_continue_adventure': true,
        'continue_route': '/play/campaign',
        'manage_characters_route': '/play/characters',
      },
    });

    expect(dashboard.activeCharacter?.name, 'Aric');
    expect(dashboard.starterAdventure.campaignName, 'Shadows on the Grey Road');
    expect(dashboard.starterAdventure.introTitle, 'Start Greyvale');
    expect(dashboard.starterAdventure.routeAfterStart, '/play/campaign/scene');
    expect(dashboard.currentAdventure.hasActiveCampaign, true);
    expect(dashboard.currentAdventure.environment?.summary,
        'Evening · Rain · Autumn');
    expect(dashboard.currentAdventure.visibleNpcPreview.single.displayName,
        'the innkeeper');
    expect(dashboard.currentAdventure.sliceEndpoint?.isEndpointReached, true);
    expect(dashboard.currentAdventure.sliceEndpoint?.headline,
        'The shrine confrontation is ready.');
    expect(dashboard.currentAdventure.actionStatus.state,
        'slice_endpoint_reached');
    expect(dashboard.currentAdventure.sceneRoute, '/play/campaign/scene');
    expect(dashboard.nextActions.canContinueAdventure, true);
  });

  test('CurrentSceneView parses rich scene contract safely', () {
    final scene = CurrentSceneView.fromJson({
      'state': 'active',
      'active_character': {
        'character_id': '7',
        'name': 'Aric',
        'level': 1,
        'species': 'Human',
        'class': 'Fighter',
        'status': 'active',
      },
      'campaign': {
        'campaign_instance_id': '44',
        'campaign_name': 'Shadows on the Grey Road',
        'world_id': 'greyvale',
        'world_name': 'Greyvale',
      },
      'scene': {
        'scene_id': '4',
        'title': 'The Broken Caravan',
        'location_name': 'Broken Caravan',
        'description': 'Rain beads on broken wagon spokes.',
      },
      'environment': {
        'weather': 'rain',
        'time_of_day': 'evening',
        'season': 'autumn',
        'summary': 'Evening · Rain · Autumn',
      },
      'objective': {
        'objective_id': '3',
        'title': 'Witness the aftermath',
        'status': 'active',
        'known_progress': [
          {
            'knowledge_id': 'caravan_irregularity',
            'type': 'clue',
            'text': 'The attack does not look like simple robbery.',
          },
        ],
      },
      'visible_npcs': [
        {
          'npc_id': 'tomas-rell',
          'display_name': 'the innkeeper',
          'activity_text': 'He watches the road.',
          'availability': 'available',
          'dialogue_scene_id': 'greyvale_tomas_roadside_worries_dialogue',
          'dialogue_title': "Tomas Rell and the Road's Pattern",
          'actions': ['observe', 'talk'],
        },
      ],
      'known_relevant_npcs': [],
      'visible_affordances': [
        {
          'affordance_id': 'caravan_wreck',
          'label': 'broken caravan',
          'type': 'object',
          'description': 'A wagon leans in the mud.',
          'actions': ['observe', 'investigate'],
          'state': 'available',
        },
      ],
      'scene_reference': {
        'people_nearby': [
          {
            'id': 'npc:tomas-rell',
            'type': 'npc',
            'label': 'the innkeeper',
            'description': 'He watches the road.',
            'dialogue_scene_id': 'greyvale_tomas_roadside_worries_dialogue',
            'dialogue_title': "Tomas Rell and the Road's Pattern",
          },
        ],
      },
      'known_facts': [
        {
          'knowledge_id': 'caravan_irregularity',
          'type': 'clue',
          'text': 'The attack does not look like simple robbery.',
        },
      ],
      'scene_state_summary': [
        {
          'label': 'Caravan evidence',
          'text': 'You have learned something is wrong here.',
        },
      ],
      'action_status': {
        'state': 'slice_endpoint_reached',
        'label': 'Slice endpoint reached',
        'description':
            'You have reached the end of the current Greyvale playable slice.',
      },
      'slice_endpoint': {
        'is_endpoint_reached': true,
        'state': 'endpoint_reached',
        'label': 'Greyvale slice endpoint reached',
        'headline': 'The shrine confrontation is ready.',
        'message':
            'You have reached the end of the current Greyvale playable slice.',
        'latest_development':
            'Rusk has forced the shrine threat into a confrontation.',
        'current_status':
            'The current Greyvale slice is ready to continue when combat support is enabled.',
        'next_step':
            'Review your journal, campaign history, and completed conversations.',
        'recovery_action': 'review_progress',
      },
      'recent_summary': {
        'latest_beat': 'You found signs of a staged attack.',
        'results': [
          {
            'text': 'You found signs of a staged attack.',
            'created_at': '2026-05-08T02:00:00.000Z',
            'scene_id': 'scene_caravan',
          },
          {
            'text': 'The caravan was attacked earlier.',
            'created_at': '2026-05-08T01:00:00.000Z',
            'scene_id': 'scene_caravan',
          },
        ],
      },
      'scene_result_feed': {
        'scene_id': '4',
        'scene_type': 'exploration',
        'latest_result': {
          'beat_result_id': 'br-2',
          'title': 'Latest development',
          'summary': 'You confirm the attack came from the treeline.',
          'narration': 'You confirm the attack came from the treeline.',
          'scene_type': 'exploration',
          'kind': 'exploration_result',
          'submitted_action_summary': 'I inspect the tracks.',
          'interpreted_action_summary': 'Investigate -> fresh tracks',
          'dialogue_scene_id': 'greyvale_tomas_roadside_worries_dialogue',
          'visible_changes': [
            {'text': 'Fresh tracks lead away from the road.'},
          ],
          'knowledge_gained': [
            {'text': 'The attackers came from the trees.'},
          ],
          'objective_updates': [
            {'progress_text': 'You learned where the attack began.'},
          ],
          'mechanical_details': {
            'visible_by_default': false,
            'entries': [
              {'text': 'The visible check succeeded.'},
            ],
          },
          'is_latest': true,
          'highlight': true,
        },
        'recent_entries': [
          {
            'beat_result_id': 'br-2',
            'title': 'Latest development',
            'summary': 'You confirm the attack came from the treeline.',
            'narration': 'You confirm the attack came from the treeline.',
            'scene_type': 'exploration',
            'kind': 'exploration_result',
            'is_latest': true,
          },
        ],
      },
      'mechanical_details': {
        'environment_modifiers': [
          {
            'environment_key': 'rain',
            'skill': 'survival',
            'context': 'tracking',
            'modifier': -2,
            'reason': 'Rain softens the road.',
          },
        ],
        'action_window': {'status': 'open'},
        'safe_character_context': {'level': 1, 'class': 'Fighter'},
      },
    });

    expect(scene.hasActiveCampaign, true);
    expect(scene.scene?.description, 'Rain beads on broken wagon spokes.');
    expect(scene.environment?.summary, 'Evening · Rain · Autumn');
    expect(scene.sceneResultFeed?.latestResult?.dialogueSceneId,
        'greyvale_tomas_roadside_worries_dialogue');
    expect(scene.objective?.knownProgress.single.knowledgeId,
        'caravan_irregularity');
    expect(scene.visibleNpcs.single.actions, contains('talk'));
    expect(scene.visibleNpcs.single.dialogueSceneId,
        'greyvale_tomas_roadside_worries_dialogue');
    expect(scene.sceneReference?.peopleNearby.single.dialogueSceneId,
        'greyvale_tomas_roadside_worries_dialogue');
    expect(scene.sceneReference?.peopleNearby.single.hasDialogueEntry, true);
    expect(scene.visibleAffordances.single.type, 'object');
    expect(scene.actionStatus.state, 'slice_endpoint_reached');
    expect(scene.sliceEndpoint?.isEndpointReached, true);
    expect(scene.sliceEndpoint?.nextStep,
        'Review your journal, campaign history, and completed conversations.');
    expect(
        scene.recentSummary?.latestBeat, 'You found signs of a staged attack.');
    expect(scene.recentSummary?.results.length, 2);
    expect(scene.recentSummary?.results.last.text,
        'The caravan was attacked earlier.');
    expect(scene.sceneResultFeed?.latestResult?.highlight, true);
    expect(scene.sceneResultFeed?.latestResult?.knowledgeGained.single,
        'The attackers came from the trees.');
    expect(scene.mechanicalDetails?.environmentModifiers.single.modifier, -2);
  });

  test('DashboardActionStatus parses submitted web action details', () {
    final status = DashboardActionStatus.fromJson({
      'state': 'action_submitted',
      'label': 'Action submitted',
      'description': 'Waiting for the next story beat.',
      'action_window_id': '88',
      'can_edit': true,
      'requires_preview_before_submit': true,
      'one_action_policy': 'hybrid_primary',
      'submitted_action': {
        'text': 'I ask the shaken woman what happened.',
        'verb': 'talk',
        'target_label': 'a shaken woman',
        'target_affordance_id': 'npc:npc_elira_survivor',
        'editable': true,
        'version': 2,
      },
    });

    expect(status.state, 'action_submitted');
    expect(status.submittedAction, 'I ask the shaken woman what happened.');
    expect(status.submittedActionDetails?.summary, 'Talk -> a shaken woman');
    expect(status.canEdit, true);
    expect(status.requiresPreviewBeforeSubmit, true);
  });

  test('ActionPreviewResponse parses resolved and clarification responses', () {
    final resolved = ActionPreviewResponse.fromJson({
      'status': 'resolved',
      'candidate': {
        'verb': 'talk',
        'target_affordance_id': 'npc:npc_elira_survivor',
        'target_label': 'a shaken woman',
        'target_type': 'npc',
      },
      'validation': {'can_submit': true},
    });

    expect(resolved.isResolved, true);
    expect(resolved.candidate?.label, 'Talk -> a shaken woman');

    final clarification = ActionPreviewResponse.fromJson({
      'status': 'needs_clarification',
      'message': 'Who do you want to talk to?',
      'options': [
        {
          'label': 'talk the innkeeper',
          'verb': 'talk',
          'target_affordance_id': 'npc:npc_innkeeper_tomas',
          'target_label': 'the innkeeper',
        },
      ],
      'validation': {'can_submit': false},
    });

    expect(clarification.needsChoice, true);
    expect(clarification.options.single.targetLabel, 'the innkeeper');
  });

  test('CampaignHistory parses player-facing beat timeline', () {
    final history = CampaignHistory.fromJson({
      'state': 'active',
      'campaign': {
        'campaign_instance_id': '44',
        'campaign_name': 'Shadows on the Grey Road',
        'world_name': 'Greyvale',
      },
      'active_character': {
        'character_id': '7',
        'name': 'Aric',
        'level': 1,
      },
      'timeline': [
        {
          'id': 'br-2',
          'type': 'beat_result',
          'title': 'Latest development',
          'summary': 'You confirm the attack came from the treeline.',
          'scene_title': 'The Broken Caravan',
          'location_name': 'Grey Road',
          'submitted_action_summary': 'I inspect the tracks.',
          'major_discoveries': [
            {'text': 'The attackers came from the trees.'},
          ],
          'mechanical_details': {
            'entries': [
              {'text': 'The visible check succeeded.'},
            ],
          },
        },
      ],
    });

    expect(history.campaign?.campaignName, 'Shadows on the Grey Road');
    expect(history.timeline.single.sceneTitle, 'The Broken Caravan');
    expect(history.timeline.single.majorDiscoveries.single,
        'The attackers came from the trees.');
  });

  test('KnowledgeJournal parses practical character knowledge sections', () {
    final journal = KnowledgeJournal.fromJson({
      'state': 'active',
      'known_count': 2,
      'current_objective': {
        'objective_id': 'obj-1',
        'title': 'Learn what happened to the caravan',
        'status': 'active',
      },
      'sections': {
        'clues': [
          {
            'knowledge_id': 'attack_from_treeline',
            'title': 'Attack from the treeline',
            'text': 'The attack came from the trees.',
            'status': 'known',
            'confidence': 'confirmed',
            'source': {'label': 'Latest development'},
          },
        ],
        'rumors': [
          {
            'knowledge_id': 'old_shrine_rumor',
            'title': 'Old shrine rumor',
            'text': 'Someone mentioned an old shrine.',
            'confidence': 'rumor',
          },
        ],
      },
    });

    expect(journal.knownCount, 2);
    expect(
        journal.currentObjective?.title, 'Learn what happened to the caravan');
    expect(journal.sections.clues.single.title, 'Attack from the treeline');
    expect(journal.sections.clues.single.sourceLabel, 'Latest development');
    expect(journal.sections.rumors.single.confidence, 'rumor');
  });

  test('PlaytestDiagnostics parses summary, issues, and repairs', () {
    final diagnostics = PlaytestDiagnostics.fromJson({
      'status': 'warning',
      'campaign_instance_id': '44',
      'checked_at': '2026-05-14T12:00:00.000Z',
      'summary': {
        'campaign_name': 'Shadows on the Grey Road',
        'character_name': 'Aric',
        'beat_number': 3,
        'current_scene_name': 'The Broken Caravan',
        'current_action_window_state': 'open',
        'current_action_window_open_for_player': true,
        'latest_result_id': 'br-3',
        'knowledge_count': 4,
        'history_entries': 3,
        'active_action_window_count': 1,
        'open_action_window_count': 1,
      },
      'warnings': [
        {
          'code': 'missing_latest_scene_feed_entry',
          'message': 'Latest result is missing from scene feed.',
          'repair_action': 'rebuild_scene_result_feed',
        }
      ],
      'errors': [],
      'available_repair_actions': [
        {
          'repair_action': 'rebuild_scene_result_feed',
          'label': 'Rebuild Scene Result Feed',
          'risk': 'low',
        }
      ],
    });

    expect(diagnostics.status, 'warning');
    expect(diagnostics.summary.campaignName, 'Shadows on the Grey Road');
    expect(diagnostics.summary.currentActionWindowOpenForPlayer, true);
    expect(diagnostics.problemCount, 1);
    expect(
        diagnostics.warnings.single.repairAction, 'rebuild_scene_result_feed');
    expect(diagnostics.availableRepairActions.single.label,
        'Rebuild Scene Result Feed');

    final repairResult = PlaytestRepairResult.fromJson({
      'repair_action': 'rebuild_scene_result_feed',
      'status': 'success',
      'message': 'Scene result feed verified.',
      'diagnostics_after': {'status': 'ok', 'summary': {}},
    });

    expect(repairResult.status, 'success');
    expect(repairResult.diagnosticsAfter?.status, 'ok');
  });

  test('CurrentSceneView parses narrative scene composition fields', () {
    final scene = CurrentSceneView.fromJson({
      'state': 'active',
      'scene': {
        'scene_id': 'scene-1',
        'title': 'The Broken Caravan',
        'description': 'Legacy fallback.',
      },
      'action_status': {'state': 'action_needed', 'label': 'Action needed'},
      'visible_npcs': [],
      'known_relevant_npcs': [],
      'visible_affordances': [],
      'known_facts': [],
      'scene_state_summary': [],
      'scene_narration': {
        'mode': 'full',
        'voice': 'second_person_present',
        'title': 'The Broken Caravan',
        'paragraphs': [
          {
            'kind': 'setting',
            'text': 'You stand beside the broken caravan.',
          },
          {
            'kind': 'opportunity',
            'text': 'The mud and wreckage each suggest a line of inquiry.',
          },
        ],
      },
      'scene_reference': {
        'people_nearby': [
          {'id': 'npc:elira', 'type': 'npc', 'label': 'a shaken woman'}
        ],
        'notable_things': [
          {'id': 'caravan_wreck', 'type': 'object', 'label': 'broken caravan'}
        ],
        'visible_paths': [
          {'id': 'road_to_inn', 'type': 'place', 'label': 'road to inn'}
        ],
        'action_targets': [
          {'id': 'caravan_wreck', 'type': 'object', 'label': 'broken caravan'}
        ],
        'closer_looks': [
          {
            'interaction_id': 'focus_caravan_wreck',
            'target_id': 'caravan_wreck',
            'label': 'Broken caravan',
            'status': 'current_viewed',
            'is_available': true,
            'is_viewed': true,
            'check_preview': {
              'has_check': true,
              'label': 'Investigation check',
              'visibility': 'visible',
            },
            'result': {
              'mechanics_label': 'Investigation check: success',
              'narration': 'The axle was split deliberately.',
              'summary': 'The axle looks sabotaged.',
              'knowledge_grants_applied': ['caravan_axle_was_sabotaged'],
              'resolved_at': '2026-05-18T12:00:00.000Z',
            },
          },
        ],
      },
      'action_composer': {
        'target_chips': [
          {
            'id': 'caravan_wreck',
            'type': 'object',
            'label': 'broken caravan',
            'insert_text': 'broken caravan',
            'free_focus_state': 'current_viewed',
            'known_context': ['The axle looks sabotaged.'],
          }
        ],
      },
    });

    expect(scene.sceneNarration?.paragraphs.length, 2);
    expect(scene.sceneReference?.peopleNearby.single.label, 'a shaken woman');
    expect(scene.sceneReference?.actionTargets.single.label, 'broken caravan');
    expect(scene.sceneReference?.closerLooks.single.status, 'current_viewed');
    expect(scene.sceneReference?.closerLooks.single.result?.mechanicsLabel,
        'Investigation check: success');
    expect(scene.actionComposer?.targetChips.single.label, 'broken caravan');
    expect(scene.actionComposer?.targetChips.single.freeFocusState,
        'current_viewed');
    expect(scene.actionComposer?.targetChips.single.knownContext.single,
        'The axle looks sabotaged.');
  });

  test('ActionPreviewResponse parses Free Focus overlap warnings', () {
    final preview = ActionPreviewResponse.fromJson({
      'status': 'free_focus_overlap',
      'message': 'Muddy tracks has a Closer Look available.',
      'free_focus_overlap': {
        'interaction_id': 'focus_muddy_tracks',
        'target_id': 'muddy_tracks',
        'label': 'Muddy tracks',
        'check_resolution': 'advantage',
        'message':
            'Opening it does not spend your beat. Continuing gives advantage.',
      },
      'validation': {'can_submit': false},
    });

    expect(preview.hasFreeFocusOverlap, true);
    expect(preview.canSubmit, false);
    expect(preview.freeFocusOverlap?.interactionId, 'focus_muddy_tracks');
    expect(preview.freeFocusOverlap?.checkResolution, 'advantage');
  });

  test('FreeFocusResolveResponse parses persisted closer-look results', () {
    final response = FreeFocusResolveResponse.fromJson({
      'free_focus_result': {
        'interaction_id': 'focus_muddy_tracks',
        'status': 'current_viewed',
        'mechanics_label': 'Survival check: failure',
        'narration':
            'The mud is too churned to read clearly, but tracks lead away.',
        'summary': 'Tracks lead away from the road.',
        'knowledge_grants_applied': [],
      },
      'action_window_context_version': '5',
      'full_scene_narration_recomposed': false,
    });

    expect(response.result.mechanicsLabel, 'Survival check: failure');
    expect(response.result.hasNewInformation, false);
    expect(response.actionWindowContextVersion, '5');
  });

  test('DialogueSceneView parses player-facing dialogue runtime state', () {
    final dialogue = DialogueSceneView.fromJson({
      'state': 'active',
      'active_character': {'character_id': '7', 'name': 'Aric'},
      'campaign': {
        'campaign_instance_id': '44',
        'campaign_name': 'Shadows on the Grey Road',
      },
      'dialogue_scene': {
        'dialogue_scene_id': 'dialogue_elin_memory_focus_commit',
        'title': 'A Memory By The Hearth',
        'scene_type': 'dialogue',
        'interaction_domain': 'dialogue_focus_commit',
      },
      'dialogue_scene_state': {
        'dialogue_scene_state_id': '101',
        'transcript_id': '202',
        'status': 'active',
        'committed_social_move_count': 1,
        'soft_target_max': 3,
      },
      'participants': [
        {
          'participant_id': 'npc:elin_harrow',
          'label': 'a shaken woman',
          'unknown_label': 'a shaken woman',
        }
      ],
      'conversation_surface': {
        'surface_id': 'surface_hearth',
        'paragraphs': [
          {'kind': 'surface', 'text': 'She watches the fire instead of you.'}
        ],
      },
      'latest_development': {
        'type': 'committed_social_move',
        'summary': 'Her breathing steadies.',
      },
      'passive_social_insight': [
        {
          'insight_id': 'insight_hands',
          'label': 'Her hands tighten when the shrine is mentioned.',
          'visibility': 'narrative_only',
        }
      ],
      'clarifying_questions': [
        {
          'question_id': 'clarify_first_memory',
          'label': 'What do you remember first?',
          'status': 'available',
          'is_available': true,
          'is_asked': false,
          'check_preview': {
            'has_check': true,
            'label': 'Insight check',
            'dc_visible': false,
          },
        }
      ],
      'committed_social_moves': [
        {
          'move_id': 'move_press_gently',
          'label': 'Press gently',
          'social_move_type': 'press',
          'status': 'available',
          'is_available': true,
          'spends_dialogue_beat': true,
          'requires_check': true,
          'check_preview': {
            'has_check': true,
            'label': 'Persuasion check',
            'dc_visible': false,
          },
        }
      ],
      'dialogue_exits': [
        {
          'exit_id': 'exit_return_to_inn',
          'label': 'Return to the common room',
          'status': 'available',
          'is_available': true,
          'transition': {'target_type': 'exploration', 'target_id': 'inn'},
        }
      ],
    });

    expect(dialogue.isActive, true);
    expect(dialogue.dialogueScene?.title, 'A Memory By The Hearth');
    expect(dialogue.participants.single.label, 'a shaken woman');
    expect(dialogue.conversationSurface.paragraphs.single.text,
        'She watches the fire instead of you.');
    expect(dialogue.latestDevelopment?.displayText, 'Her breathing steadies.');
    expect(dialogue.passiveSocialInsight.single.visibility, 'narrative_only');
    expect(dialogue.clarifyingQuestions.single.checkPreview?.label,
        'Insight check');
    expect(dialogue.committedSocialMoves.single.checkPreview?.dcVisible, false);
    expect(
        dialogue.dialogueExits.single.transition['target_type'], 'exploration');
  });

  test('Dialogue preview, submit, exit, and archive models parse safely', () {
    final overlap = DialogueSocialMovePreviewResponse.fromJson({
      'status': 'clarifying_question_overlap',
      'message': 'That is available as a Clarifying Question.',
      'overlap': {
        'question_id': 'clarify_first_memory',
        'label': 'What do you remember first?',
      },
      'options': [
        'ask_clarifying_question',
        'continue_as_committed_social_move',
        'edit_action',
      ],
    });
    expect(overlap.isOverlap, true);
    expect(overlap.overlap?.questionId, 'clarify_first_memory');

    final preview = DialogueSocialMovePreviewResponse.fromJson({
      'status': 'preview',
      'preview': {
        'interpretation': 'You press gently about the shrine.',
        'spends_dialogue_beat': true,
        'requires_check': false,
        'assistance': [
          {'label': 'Known context', 'text': 'She fears the treeline.'}
        ],
      },
    });
    expect(preview.isPreview, true);
    expect(preview.preview?.requiresCheck, false);
    expect(preview.preview?.assistance.single.text, 'She fears the treeline.');

    final submitted = DialogueSocialMoveSubmitResponse.fromJson({
      'status': 'resolved',
      'social_move_result': {
        'result_text': 'She steadies enough to answer.',
        'mechanics_label': 'Persuasion check: success',
      },
      'current_dialogue': {'state': 'active'},
    });
    expect(submitted.result?.text, 'She steadies enough to answer.');
    expect(submitted.currentDialogue?.state, 'active');

    final exited = DialogueExitResolveResponse.fromJson({
      'status': 'exited',
      'dialogue_exit_result': {'text': 'You return to the common room.'},
      'completed_dialogue_record': {
        'completed_dialogue_record_id': '55',
        'transcript_id': '44',
        'compact_summary': 'Elin shared what she remembered.',
      },
    });
    expect(exited.completedDialogueRecord?.compactSummary,
        'Elin shared what she remembered.');

    final archive = DialogueArchiveRecordResponse.fromJson({
      'record': {
        'completed_dialogue_record_id': '55',
        'compact_summary': 'Elin shared what she remembered.',
        'transcript_turns': [
          {
            'turn_id': '1',
            'turn_index': 1,
            'turn_type': 'clarifying_answer',
            'speaker': {'label': 'a shaken woman'},
            'content': {'text': 'The wheel cracked first.'},
          }
        ],
      },
    });
    expect(archive.record.transcriptTurns.single.displayText,
        'The wheel cracked first.');

    final activeTranscript = DialogueCurrentTranscriptResponse.fromJson({
      'transcript': {
        'transcript_id': '44',
        'dialogue_scene_id': 'dialogue_elin_memory_focus_commit',
        'status': 'active',
        'turns': [
          {
            'turn_id': '1',
            'turn_index': 1,
            'turn_type': 'npc_surface',
            'speaker': {'label': 'a shaken woman'},
            'content': {'text': 'She watches the fire instead of you.'},
          }
        ],
      },
    });
    expect(activeTranscript.transcript?.turns.single.speakerLabel,
        'a shaken woman');
  });
}
