export const DEFAULT_SMS_CAMPAIGN_ASSIGNMENT = Object.freeze({
  world_id: 'greyvale',
  campaign_package_id: 'shadows_grey_road',
  start_region_id: 'greyvale_lowlands',
  start_region_slug: 'greyvale-lowlands',
  start_location_id: 'broken_caravan_site',
  start_location_slug: 'broken-caravan-site',
  start_scene_id: 'scene_broken_caravan',
  start_scene_slug: 'broken-caravan-site',
  start_objective_id: 'investigate_caravan',
  start_objective_slug: 'witness-the-aftermath',
  quest_slug: 'shadows_grey_road',
  instance_strategy: 'solo_per_character',
  intro_fast_path: true,
});

export const SMS_CAMPAIGN_INSTANCE_STRATEGIES = Object.freeze([
  'solo_per_character',
  'invited_party',
  'shared_starter',
  'open_world_free_roam',
  'web_selected',
]);

export const SMS_APP_LINK = 'https://dailyttrpg.com/play';

export const SMS_INTERACTION_BUDGET_CONFIG = Object.freeze({
  sms_app_link: SMS_APP_LINK,
  daily_non_substantive_full_response_limit: 1,
  daily_non_substantive_link_only_limit: 1,
});

export function validateSmsCampaignAssignmentShape(config = DEFAULT_SMS_CAMPAIGN_ASSIGNMENT) {
  const errors = [];

  for (const key of [
    'world_id',
    'campaign_package_id',
    'start_region_id',
    'start_location_id',
    'start_scene_id',
    'start_objective_id',
    'instance_strategy',
  ]) {
    if (!config[key] || String(config[key]).trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  if (!SMS_CAMPAIGN_INSTANCE_STRATEGIES.includes(config.instance_strategy)) {
    errors.push(`instance_strategy "${config.instance_strategy}" is not supported`);
  }

  return {
    ok: errors.length === 0,
    errors,
    config,
  };
}
