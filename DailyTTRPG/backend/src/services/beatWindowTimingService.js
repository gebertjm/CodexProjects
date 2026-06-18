const resolutionModes = new Set(['scheduled', 'manual', 'immediate_solo']);
const actionWindowPolicies = new Set([
  'open_until_resolution',
  'fixed_window',
  'open_until_submitted',
  'gm_controlled',
  'immediate_on_submit',
]);

export const defaultWebRuntimeConfig = Object.freeze({
  resolution_mode: 'scheduled',
  beat_interval_minutes: 1440,
  daily_resolution_time_local: null,
  timezone: 'UTC',
  action_window_policy: 'open_until_resolution',
  allow_action_editing: true,
  manual_advance_enabled: true,
  requires_preview_before_submit: true,
  one_action_policy: 'hybrid_primary',
  ai_resolver_enabled: false,
  immediate_resolution_enabled: false,
});

function finitePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDailyTime(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const match = String(value).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function validTimeZone(value) {
  const zone = String(value ?? '').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return zone;
  } catch (_error) {
    return 'UTC';
  }
}

export function normalizeWebRuntimeConfig(value = {}) {
  const configured = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const resolutionMode = String(configured.resolution_mode ?? defaultWebRuntimeConfig.resolution_mode);
  const policy = String(configured.action_window_policy ?? defaultWebRuntimeConfig.action_window_policy);
  const beatInterval = finitePositiveNumber(configured.beat_interval_minutes);

  return {
    ...defaultWebRuntimeConfig,
    ...configured,
    resolution_mode: resolutionModes.has(resolutionMode)
      ? resolutionMode
      : defaultWebRuntimeConfig.resolution_mode,
    action_window_policy: actionWindowPolicies.has(policy)
      ? policy
      : defaultWebRuntimeConfig.action_window_policy,
    beat_interval_minutes:
      beatInterval === null ? defaultWebRuntimeConfig.beat_interval_minutes : beatInterval,
    daily_resolution_time_local: normalizeDailyTime(configured.daily_resolution_time_local),
    timezone: validTimeZone(configured.timezone),
    allow_action_editing: configured.allow_action_editing !== false,
    manual_advance_enabled: configured.manual_advance_enabled !== false,
    requires_preview_before_submit: configured.requires_preview_before_submit !== false,
    ai_resolver_enabled: false,
    immediate_resolution_enabled: false,
  };
}

function parseDate(value, label = 'timestamp') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return date;
}

function timeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = timeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function zonedLocalTimeToUtc({ year, month, day, hour, minute, timeZone }) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let index = 0; index < 3; index += 1) {
    const offset = timeZoneOffsetMs(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
  }

  return new Date(utcMs);
}

function nextDailyResolution(promptDate, dailyTime, timeZone) {
  const [hour, minute] = dailyTime.split(':').map(Number);
  const local = timeZoneParts(promptDate, timeZone);
  let candidate = zonedLocalTimeToUtc({
    year: Number(local.year),
    month: Number(local.month),
    day: Number(local.day),
    hour,
    minute,
    timeZone,
  });

  if (candidate.getTime() <= promptDate.getTime()) {
    candidate = zonedLocalTimeToUtc({
      year: Number(local.year),
      month: Number(local.month),
      day: Number(local.day) + 1,
      hour,
      minute,
      timeZone,
    });
  }

  return candidate;
}

export function calculateActionWindowCloseAt({
  promptAvailableAt,
  runtimeConfig = {},
  defaultActionPolicy = {},
}) {
  const promptDate = parseDate(promptAvailableAt, 'promptAvailableAt');
  const config = normalizeWebRuntimeConfig(runtimeConfig);

  if (config.resolution_mode === 'manual' || config.action_window_policy === 'gm_controlled') {
    return null;
  }

  if (config.daily_resolution_time_local) {
    return nextDailyResolution(
      promptDate,
      config.daily_resolution_time_local,
      config.timezone
    ).toISOString();
  }

  if (config.action_window_policy === 'fixed_window') {
    const seconds = finitePositiveNumber(defaultActionPolicy.response_timeout_seconds);
    const fixedSeconds = seconds === null ? config.beat_interval_minutes * 60 : seconds;
    return new Date(promptDate.getTime() + fixedSeconds * 1000).toISOString();
  }

  return new Date(promptDate.getTime() + config.beat_interval_minutes * 60 * 1000).toISOString();
}

export function isActionWindowOpenForPlayer(window, now = new Date()) {
  if (!window || String(window.status ?? '').toLowerCase() !== 'open') {
    return false;
  }

  const nowDate = parseDate(now, 'now');
  const opensAt = window.opens_at ? parseDate(window.opens_at, 'opens_at') : null;
  const closesAt = window.closes_at ?? window.expires_at ?? null;

  if (opensAt && nowDate.getTime() < opensAt.getTime()) {
    return false;
  }

  if (closesAt && nowDate.getTime() >= parseDate(closesAt, 'closes_at').getTime()) {
    return false;
  }

  return true;
}
