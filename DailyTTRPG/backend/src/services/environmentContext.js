export const ENVIRONMENT_FIELDS = [
  'weather',
  'time_of_day',
  'season',
  'light_level',
  'temperature_band',
  'precipitation',
  'wind',
  'visibility',
  'terrain_or_biome',
  'location_environment',
  'mood_or_tone',
];

export const TIME_OF_DAY_VALUES = [
  'dawn',
  'morning',
  'midday',
  'afternoon',
  'evening',
  'night',
  'late_night',
];

export const SEASON_VALUES = ['spring', 'summer', 'autumn', 'winter'];

export const WEATHER_VALUES = [
  'clear',
  'cloudy',
  'rain',
  'heavy_rain',
  'storm',
  'fog',
  'wind',
  'snow',
];

export const VISIBILITY_VALUES = ['clear', 'dim', 'obscured', 'heavily_obscured'];
export const LIGHT_LEVEL_VALUES = ['bright', 'dim', 'dark', 'magical', 'firelit', 'moonlit'];
export const TEMPERATURE_BAND_VALUES = [
  'freezing',
  'cold',
  'cool',
  'mild',
  'warm',
  'hot',
  'sweltering',
];
export const WIND_VALUES = ['still', 'light', 'moderate', 'strong', 'gale'];
export const LOCATION_ENVIRONMENT_VALUES = [
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
export const MOOD_OR_TONE_VALUES = [
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

export const ENVIRONMENT_VALUE_SETS = {
  weather: WEATHER_VALUES,
  time_of_day: TIME_OF_DAY_VALUES,
  season: SEASON_VALUES,
  light_level: LIGHT_LEVEL_VALUES,
  temperature_band: TEMPERATURE_BAND_VALUES,
  wind: WIND_VALUES,
  visibility: VISIBILITY_VALUES,
  location_environment: LOCATION_ENVIRONMENT_VALUES,
  mood_or_tone: MOOD_OR_TONE_VALUES,
};

export const DEFAULT_ENVIRONMENT_CONTEXT = {
  weather: 'clear',
  time_of_day: 'afternoon',
  season: 'autumn',
  light_level: 'bright',
  temperature_band: 'mild',
  precipitation: 'none',
  wind: 'light',
  visibility: 'clear',
  terrain_or_biome: 'lowlands',
  location_environment: 'exterior',
  mood_or_tone: 'uneasy',
  day_count: 0,
};

export const DESCRIPTION_SLOTS = [
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

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

export function normalizeEnvironmentContext(values = {}, { strict = true } = {}) {
  const context = {};
  const errors = [];

  for (const field of ENVIRONMENT_FIELDS) {
    if (isEmpty(values[field])) {
      continue;
    }

    const normalized = String(values[field]).trim();
    const allowed = ENVIRONMENT_VALUE_SETS[field];

    if (strict && allowed && !allowed.includes(normalized)) {
      errors.push(`${field} must be one of: ${allowed.join(', ')}`);
      continue;
    }

    context[field] = normalized;
  }

  if (!isEmpty(values.day_count)) {
    const parsed = Number(values.day_count);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push('day_count must be a non-negative integer');
    } else {
      context.day_count = parsed;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    context,
  };
}

export function validateEnvironmentContext(values = {}, options = {}) {
  return normalizeEnvironmentContext(values, options);
}

export function nextTimeOfDay(currentTimeOfDay) {
  const currentIndex = TIME_OF_DAY_VALUES.indexOf(currentTimeOfDay);
  const index = currentIndex >= 0 ? currentIndex : TIME_OF_DAY_VALUES.indexOf(DEFAULT_ENVIRONMENT_CONTEXT.time_of_day);
  const nextIndex = (index + 1) % TIME_OF_DAY_VALUES.length;

  return {
    time_of_day: TIME_OF_DAY_VALUES[nextIndex],
    wrapped: nextIndex <= index,
  };
}
