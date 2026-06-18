import { query } from '../config/db.js';
import { DEFAULT_SMS_CAMPAIGN_ASSIGNMENT } from '../sms/smsCampaignConfig.js';
import { getCharacterSceneView } from './characterSceneViewService.js';
import { getPlayerStateForAccount } from './playerStateService.js';
import { getActiveCharacterCreationDraft } from './webCharacterCreationService.js';
import {
  getCharacterPendingActionStatus,
  getCurrentAdventureForCharacter,
} from './webCharacterManagementService.js';

const STARTER_INTRO = Object.freeze({
  id: 'default_starter_adventure',
  intro_title: 'Start Greyvale',
  intro_text:
    'Your first adventure begins in Greyvale, a rain-worn borderland where caravans have gone missing along the old road.',
  begin_label: 'Begin Greyvale',
  cancel_label: 'Cancel',
  route_after_start: '/play/campaign/scene',
  config_source: 'backend_default_starter_adventure',
});

function titleCase(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compact(values) {
  return values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function mapAccount(account) {
  if (!account) {
    return null;
  }

  return {
    account_id: account.account_id,
    display_name: account.display_name,
    email: account.email,
    sms_enabled: account.sms_enabled,
    sms_mode: account.sms_mode,
    capabilities: account.capabilities ?? {
      can_advance_beats: account.can_advance_beats === true,
    },
  };
}

function mapActiveCharacter(character) {
  if (!character) {
    return null;
  }

  return {
    character_id: character.character_id,
    name: character.name,
    level: character.level,
    species: character.species ?? character.race ?? null,
    class: character.class ?? character.character_class ?? null,
    status: character.status,
  };
}

function environmentSummary(environment) {
  if (!environment) {
    return null;
  }

  const summaryParts = compact([
    environment.time_of_day ? titleCase(environment.time_of_day) : null,
    environment.weather ? titleCase(environment.weather) : null,
    environment.season ? titleCase(environment.season) : null,
    environment.mood_or_tone ? titleCase(environment.mood_or_tone) : null,
  ]);

  return {
    weather: environment.weather ?? null,
    time_of_day: environment.time_of_day ?? null,
    season: environment.season ?? null,
    light_level: environment.light_level ?? null,
    visibility: environment.visibility ?? null,
    temperature_band: environment.temperature_band ?? null,
    wind: environment.wind ?? null,
    mood_or_tone: environment.mood_or_tone ?? null,
    location_environment: environment.location_environment ?? null,
    summary: summaryParts.length > 0 ? summaryParts.join(' · ') : null,
  };
}

function npcPreview(sceneView) {
  const visible = Array.isArray(sceneView?.visible_npcs) ? sceneView.visible_npcs : [];
  const preview = visible.slice(0, 4).map((npc) => ({
    npc_id: npc.npc_id,
    display_name: npc.display_name,
    activity: npc.activity ?? null,
    availability: npc.availability ?? null,
  }));

  return {
    visible_npc_preview: preview,
    additional_visible_count: Math.max(visible.length - preview.length, 0),
  };
}

function actionStatus({ activeCharacter, currentAdventure, pendingAction }) {
  if (!activeCharacter) {
    return {
      state: 'no_active_character',
      label: 'No active character',
      description: 'Create or select a character to begin.',
    };
  }

  if (!currentAdventure) {
    return {
      state: 'ready_to_start',
      label: 'Ready to start',
      description: 'Your active character is ready for a starter adventure.',
    };
  }

  if (pendingAction?.has_pending_unresolved_action) {
    return {
      state: 'action_submitted',
      label: 'Action submitted',
      description: 'Your action is waiting for the next story beat.',
      action_window_id: pendingAction.action_window_id ?? pendingAction.progression_window_id ?? null,
      submitted_action: pendingAction.response_summary ?? null,
      closes_at: null,
    };
  }

  if (pendingAction?.action_required || currentAdventure.action_required) {
    return {
      state: 'action_needed',
      label: 'Action needed',
      description: 'Your character can act now.',
      action_window_id: pendingAction?.action_window_id ?? pendingAction?.progression_window_id ?? null,
      submitted_action: null,
      closes_at: null,
    };
  }

  return {
    state: 'waiting_for_next_beat',
    label: 'Waiting for next beat',
    description: 'The adventure is active, but no action is needed right now.',
    action_window_id: null,
    submitted_action: null,
    closes_at: null,
  };
}

async function loadStarterReferenceSummary(executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        world.slug AS world_slug,
        world.name AS world_name,
        campaign.slug AS campaign_slug,
        campaign.name AS campaign_name,
        scene.key AS scene_key,
        scene.name AS scene_name,
        objective.key AS objective_key,
        objective.title AS objective_title
      FROM dnd5e_world world
      LEFT JOIN dnd5e_campaign campaign
        ON campaign.world_id = world.id
       AND campaign.slug = $2
      LEFT JOIN dnd5e_scene scene
        ON scene.world_id = world.id
       AND scene.key = $3
      LEFT JOIN dnd5e_quest quest
        ON quest.key = $4
      LEFT JOIN dnd5e_quest_objective objective
        ON objective.quest_id = quest.id
       AND objective.key = $5
      WHERE world.slug = $1
      LIMIT 1
    `,
    [
      DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.world_id,
      DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.campaign_package_id,
      DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.start_scene_slug,
      DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.quest_slug,
      DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.start_objective_slug,
    ]
  );

  return result.rows[0] ?? null;
}

export async function getStarterAdventureIntro(executor = { query }) {
  const refs = await loadStarterReferenceSummary(executor);

  return {
    ...STARTER_INTRO,
    world_id: DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.world_id,
    world_name: refs?.world_name ?? 'Greyvale',
    campaign_package_id: DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.campaign_package_id,
    campaign_name: refs?.campaign_name ?? 'Shadows on the Grey Road',
    start_scene_key: refs?.scene_key ?? DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.start_scene_slug,
    start_scene_name: refs?.scene_name ?? null,
    start_objective_key: refs?.objective_key ?? DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.start_objective_slug,
    start_objective_title: refs?.objective_title ?? null,
    configured: Boolean(refs?.world_name && refs?.campaign_name && refs?.scene_key),
  };
}

async function safeScenePreview({ accountId, activeCharacter, currentAdventure }) {
  if (!activeCharacter || !currentAdventure?.campaign_instance_id) {
    return null;
  }

  try {
    return await getCharacterSceneView({
      accountId,
      characterId: activeCharacter.character_id,
      campaignInstanceId: currentAdventure.campaign_instance_id,
      includeDebug: false,
      includeMechanics: false,
    });
  } catch (_error) {
    return null;
  }
}

function mapAdventure({ currentAdventure, sceneView, pendingAction, activeCharacter }) {
  if (!currentAdventure) {
    return null;
  }

  const environment = environmentSummary(sceneView?.environment ?? null);
  const npcs = npcPreview(sceneView);
  const sceneTitle =
    sceneView?.scene?.title ??
    sceneView?.scene?.name ??
    currentAdventure.current_scene?.name ??
    null;
  const sceneObjective = sceneView?.current_objective;
  const currentObjective =
    sceneObjective?.title || sceneObjective?.key || sceneObjective?.objective_id
      ? sceneObjective
      : currentAdventure.current_objective ?? null;
  const mappedActionStatus =
    sceneView?.slice_endpoint?.is_endpoint_reached === true && sceneView?.action_status
      ? sceneView.action_status
      : actionStatus({ activeCharacter, currentAdventure, pendingAction });

  return {
    has_active_campaign: true,
    campaign_instance_id: currentAdventure.campaign_instance_id,
    campaign_id: currentAdventure.campaign_id ?? currentAdventure.campaign_instance_id,
    world_instance_id: sceneView?.world_instance_id ?? currentAdventure.world_instance_id ?? null,
    world_id: currentAdventure.world_slug ?? currentAdventure.world_id ?? null,
    world_name: currentAdventure.world_name,
    campaign_package_id: DEFAULT_SMS_CAMPAIGN_ASSIGNMENT.campaign_package_id,
    campaign_name: currentAdventure.campaign_name,
    campaign_slug: currentAdventure.campaign_slug,
    current_location_id:
      currentAdventure.current_location?.key ??
      currentAdventure.current_location?.location_id ??
      null,
    current_location_name:
      currentAdventure.current_location?.name ??
      currentAdventure.current_location_label ??
      null,
    current_scene_id:
      currentAdventure.current_scene?.key ??
      currentAdventure.current_scene_id ??
      sceneView?.scene?.key ??
      null,
    current_scene_title: sceneTitle,
    current_objective: currentObjective,
    environment,
    visible_npc_preview: npcs.visible_npc_preview,
    additional_visible_npc_count: npcs.additional_visible_count,
    action_status: mappedActionStatus,
    slice_endpoint: sceneView?.slice_endpoint ?? null,
    recent_summary: null,
    preview_route: '/play/campaign',
    scene_route: '/play/campaign/scene',
    full_scene_view_deferred_to: '6B.4',
    action_composer_deferred_to: '6B.5',
  };
}

export async function getPlayerDashboard(accountId) {
  const [playerState, draft, starterAdventure] = await Promise.all([
    getPlayerStateForAccount(accountId),
    getActiveCharacterCreationDraft(accountId),
    getStarterAdventureIntro(),
  ]);

  const account = playerState?.account ?? null;
  const activeCharacter = playerState?.active_character ?? null;
  const characters = Array.isArray(playerState?.characters) ? playerState.characters : [];
  const currentAdventure = activeCharacter
    ? await getCurrentAdventureForCharacter(activeCharacter.character_id)
    : null;
  const pendingAction = activeCharacter
    ? await getCharacterPendingActionStatus(activeCharacter.character_id)
    : null;
  const sceneView = await safeScenePreview({
    accountId,
    activeCharacter,
    currentAdventure,
  });
  const mappedAdventure = mapAdventure({
    currentAdventure,
    sceneView,
    pendingAction,
    activeCharacter,
  });

  return {
    account: mapAccount(account),
    active_character: mapActiveCharacter(activeCharacter),
    characters_summary: {
      count: characters.length,
      manage_route: '/play/characters',
    },
    current_adventure: mappedAdventure ?? {
      has_active_campaign: false,
      action_status: actionStatus({ activeCharacter, currentAdventure: null, pendingAction: null }),
    },
    starter_adventure: starterAdventure,
    next_actions: {
      can_create_character: characters.length === 0,
      create_character_route: '/play/create-character',
      can_resume_draft: Boolean(draft),
      resume_draft_route: draft ? '/play/create-character' : null,
      can_start_adventure: Boolean(activeCharacter && !mappedAdventure),
      can_continue_adventure: Boolean(mappedAdventure),
      continue_route: mappedAdventure ? '/play/campaign' : null,
      manage_characters_route: '/play/characters',
    },
  };
}

export async function getCurrentAdventurePreview(accountId) {
  const dashboard = await getPlayerDashboard(accountId);

  return {
    account: dashboard.account,
    active_character: dashboard.active_character,
    current_adventure: dashboard.current_adventure,
    starter_adventure: dashboard.starter_adventure,
    next_actions: dashboard.next_actions,
  };
}
