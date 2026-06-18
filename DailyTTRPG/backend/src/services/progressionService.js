import {
  getCharacterAdvancementStatus,
  grantCharacterExperience as grantCharacterExperienceThroughAdvancement,
} from './advancementService.js';

function mapProgressionStatus(status) {
  if (!status) {
    return null;
  }

  return {
    character_id: Number(status.character_id),
    name: status.character_name,
    campaign_id: status.campaign_id ?? null,
    advancement_mode: status.advancement_mode,
    level: Number(status.level),
    experience_points: Number(status.experience_points),
    pending_level_count: Number(status.pending_level_count ?? 0),
    level_up_available: Boolean(status.level_up_available),
    last_level_up_available_at: status.last_level_up_available_at ?? null,
    thresholds: status.thresholds,
    safe_moment: status.safe_moment,
    active_level_up_session: status.active_level_up_session,
    party_sync: status.party_sync,
  };
}

export async function getCharacterProgression(characterId, options = {}) {
  const status = await getCharacterAdvancementStatus(characterId, options);
  return mapProgressionStatus(status);
}

export async function grantCharacterExperience(characterId, input, executor = null) {
  return grantCharacterExperienceThroughAdvancement(characterId, input, executor);
}
