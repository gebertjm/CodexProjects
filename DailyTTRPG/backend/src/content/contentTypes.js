export const DEFAULT_CONTENT_LOAD_ORDER = [
  'world',
  'regionTemplates',
  'locationTemplates',
  'sceneTemplates',
  'campaigns',
  'regions',
  'locations',
  'scenes',
  'sceneTransitions',
  'npcTemplates',
  'worldEntities',
  'encounterTemplates',
  'knowledgeDefinitions',
  'environmentFlavorEntries',
  'environmentModifiers',
  'quests',
  'interactions',
  'sceneAffordances',
  'dialogues',
  'eventTemplates',
  'contentHooks',
  'campaignLocationStates',
  'campaignSceneStates',
];

export const SECTION_DEFINITIONS = {
  world: {
    label: 'world',
    singleton: true,
    files: ['world.json'],
  },
  regionTemplates: {
    label: 'region templates',
    directory: 'templates/regions',
  },
  locationTemplates: {
    label: 'location templates',
    directory: 'templates/locations',
  },
  sceneTemplates: {
    label: 'scene templates',
    directory: 'templates/scenes',
  },
  campaigns: {
    label: 'campaigns',
    directory: 'campaigns',
  },
  regions: {
    label: 'regions',
    directory: 'regions',
  },
  locations: {
    label: 'locations',
    directory: 'locations',
  },
  scenes: {
    label: 'scenes',
    directory: 'scenes',
  },
  sceneTransitions: {
    label: 'scene transitions',
    directory: 'transitions',
  },
  npcTemplates: {
    label: 'NPC templates',
    directory: 'entity_templates/npcs',
  },
  worldEntities: {
    label: 'world entities',
    directory: 'world_entities',
  },
  encounterTemplates: {
    label: 'encounter templates',
    directory: 'encounters',
  },
  knowledgeDefinitions: {
    label: 'knowledge definitions',
    directory: 'knowledge',
  },
  environmentFlavorEntries: {
    label: 'environment flavor entries',
    directory: 'environment_flavors',
  },
  environmentModifiers: {
    label: 'environment modifiers',
    directory: 'environment_modifiers',
  },
  sceneAffordances: {
    label: 'scene affordances',
    directory: 'affordances',
  },
  quests: {
    label: 'quests',
    directory: 'quests',
  },
  interactions: {
    label: 'scene interactions',
    directory: 'interactions',
  },
  dialogues: {
    label: 'dialogue graphs',
    directory: 'dialogue',
  },
  eventTemplates: {
    label: 'event templates',
    directory: 'events',
  },
  contentHooks: {
    label: 'dynamic content hooks',
    directory: 'hooks',
  },
  campaignLocationStates: {
    label: 'campaign location overlays',
    directory: 'campaign_overlays/locations',
  },
  campaignSceneStates: {
    label: 'campaign scene overlays',
    directory: 'campaign_overlays/scenes',
  },
};

export const CONTENT_SECTION_KEYS = Object.keys(SECTION_DEFINITIONS);

export const CAMPAIGN_TYPES = ['solo', 'party', 'questline', 'world_event'];
export const CAMPAIGN_STATUSES = ['active', 'dormant', 'completed', 'archived'];
export const WORLD_STATUSES = ['active', 'archived'];
export const ENTITY_TYPES = ['npc', 'monster'];
export const ENTITY_STATUSES = [
  'active',
  'inactive',
  'hidden',
  'dead',
  'defeated',
  'removed',
  'captured',
  'fleeing',
  'hiding',
  'unconscious',
  'unavailable',
  'scene_locked',
  'archived',
];
export const DISPOSITIONS = ['friendly', 'neutral', 'hostile'];
export const NPC_AVAILABILITY_STATES = ['available', 'limited', 'unavailable'];
export const NPC_VISIBILITY_STATES = ['visible', 'hidden', 'not_visible'];
export const NPC_PRESENCE_STATES = [
  'present',
  'absent',
  'hidden',
  'unavailable',
  'dead',
  'unknown',
];
export const TRIGGER_TYPES = ['player', 'system'];
export const TRIGGER_EVENTS = ['npc_talk', 'scene_enter', 'system'];
export const DIALOGUE_CHECK_MODES = ['none', 'explicit', 'implicit'];
export const CHECK_VISIBILITIES = ['visible', 'hidden'];
export const DIALOGUE_SPEAKER_TYPES = ['npc', 'narrator', 'system'];
export const EVENT_RESOLUTION_KINDS = ['grant_currency', 'grant_item', 'no_effect', 'apply_effects'];
export const QUEST_STATUSES = ['not_started', 'available', 'active', 'completed', 'failed', 'locked'];
export const OBJECTIVE_STATUSES = ['locked', 'active', 'completed', 'failed'];
export const REWARD_TYPES = [
  'xp',
  'level_grant',
  'currency',
  'item',
  'campaign_flag',
  'character_flag',
  'scene_unlock',
  'npc_disposition',
  'knowledge',
];
export const KNOWLEDGE_TYPES = [
  'campaign_flag',
  'character_flag',
  'event',
  'dialogue',
  'interaction',
  'combat',
  'lore',
  'fact',
  'clue',
  'rumor',
  'entity_knowledge',
  'location_knowledge',
  'journal_seed',
  'scene',
  'quest',
  'objective',
  'npc',
  'world_change',
  'world_event',
];

export const AFFORDANCE_STATES = ['available', 'hidden', 'locked', 'resolved', 'depleted', 'transformed'];
export const AFFORDANCE_REPEAT_POLICIES = [
  'once',
  'repeat_with_new_context',
  'repeatable',
  'depleted_visible',
];
export const EXPLORATION_ACTION_VERBS = [
  'observe',
  'investigate',
  'search',
  'track',
  'talk',
  'move',
  'use',
  'help',
  'wait',
];
export const RESULT_BANDS = [
  'failure',
  'partial_success',
  'success',
  'great_success',
  'critical_success',
];

export const ENVIRONMENT_TIME_OF_DAY = [
  'dawn',
  'morning',
  'midday',
  'afternoon',
  'evening',
  'night',
  'late_night',
];
export const ENVIRONMENT_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const ENVIRONMENT_WEATHER = [
  'clear',
  'cloudy',
  'rain',
  'heavy_rain',
  'storm',
  'fog',
  'wind',
  'snow',
];
export const ENVIRONMENT_VISIBILITY = ['clear', 'dim', 'obscured', 'heavily_obscured'];
export const ENVIRONMENT_LIGHT_LEVELS = ['bright', 'dim', 'dark', 'magical', 'firelit', 'moonlit'];
export const ENVIRONMENT_TEMPERATURE_BANDS = [
  'freezing',
  'cold',
  'cool',
  'mild',
  'warm',
  'hot',
  'sweltering',
];
export const ENVIRONMENT_WIND = ['still', 'light', 'moderate', 'strong', 'gale'];
export const ENVIRONMENT_LOCATION_TYPES = [
  'road',
  'inn',
  'village',
  'forest',
  'shrine',
  'lowlands',
  'interior',
  'exterior',
  'cave',
  'ruin',
  'field',
  'river',
  'camp',
];
export const ENVIRONMENT_MOODS = [
  'calm',
  'uneasy',
  'tense',
  'somber',
  'watchful',
  'dangerous',
  'hopeful',
  'mysterious',
  'quiet',
];
export const ENVIRONMENT_DESCRIPTION_SLOTS = [
  'scene_base',
  'location_mood',
  'weather_overlay',
  'time_overlay',
  'season_overlay',
  'light_overlay',
  'sound_overlay',
  'smell_overlay',
  'crowd_overlay',
  'state_change_overlay',
  'character_knowledge_overlay',
];

export const ENCOUNTER_TYPES = [
  'tutorial',
  'minor',
  'major',
  'story',
  'final',
  'optional',
  'non_combat',
];

export const ENCOUNTER_DIFFICULTY_LABELS = [
  'trivial',
  'easy',
  'medium',
  'hard',
  'deadly',
  'story',
  'avoidable',
  'tutorial',
];

export const ENCOUNTER_SCALING_METHODS = [
  'variant_selection',
  'enemy_count',
  'stat_tweak',
  'reinforcement',
];

export const ENCOUNTER_DISALLOWED_SCALING_METHODS = [
  ...ENCOUNTER_SCALING_METHODS,
  'large_stat_scaling',
];

export const ENCOUNTER_RESOLUTION_PATHS = [
  'combat',
  'negotiation',
  'intimidation',
  'stealth',
  'avoidance',
  'investigation',
  'escape',
  'communication',
  'disruption',
  'fail_forward',
];

export const CONTENT_HOOK_POINTS = [
  'scene_enter',
  'scene_exit',
  'dialogue_node_enter',
  'dialogue_option_select',
  'interaction_attempt',
  'interaction_success',
  'interaction_failure',
  'combat_start',
  'combat_end',
  'objective_start',
  'objective_complete',
  'time_beat',
  'event_triggered',
  'event_resolved',
];

export const CONTENT_HOOK_SCOPE_TYPES = [
  'world',
  'campaign',
  'scene',
  'entity',
  'dialogue',
  'interaction',
  'objective',
  'event',
  'time',
];
