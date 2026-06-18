import { query } from '../config/db.js';
import {
  selectCharacterMovementContextQuery,
  selectFeatureAbilityModifierEffectsQuery,
  selectFeatureLanguageGrantEffectsQuery,
  selectFeatureResistanceEffectsQuery,
  selectFeatureSenseGrantEffectsQuery,
  selectFeatureSkillProficiencyEffectsQuery,
  selectFeatureSpeedModifierEffectsQuery,
  selectFeatureSpellGrantEffectsQuery,
} from '../db/queries/derivedRules.js';
import { deriveCharacterRules } from '../engine/rules/characterRulesEngine.js';
import { getCharacterById } from './characterCompositionService.js';

function mapMovementContextRow(row) {
  if (!row) {
    return null;
  }

  return {
    character_id: Number(row.character_id),
    stored_character_speed:
      row.stored_character_speed !== null ? Number(row.stored_character_speed) : null,
    race: row.race_id
      ? {
          id: Number(row.race_id),
          name: row.race_name,
          slug: row.race_slug,
          size: row.race_size,
          base_speed: row.race_base_speed !== null ? Number(row.race_base_speed) : null,
          source: row.race_source,
        }
      : null,
    race_base_speed: row.race_base_speed !== null ? Number(row.race_base_speed) : null,
  };
}

function mapAbilityEffectRow(row) {
  return {
    feature_id: Number(row.feature_id),
    ability_code: row.ability_code,
    ability_name: row.ability_name,
    modifier_value: Number(row.modifier_value),
    modifier_type: row.modifier_type,
    notes: row.notes,
  };
}

function mapSkillEffectRow(row) {
  return {
    feature_id: Number(row.feature_id),
    skill_id: Number(row.skill_id),
    skill_name: row.skill_name,
    skill_slug: row.skill_slug,
    proficiency_type: row.proficiency_type,
    notes: row.notes,
  };
}

function mapLanguageGrantEffectRow(row) {
  return {
    feature_id: Number(row.feature_id),
    language_id: Number(row.language_id),
    language_name: row.language_name,
    language_slug: row.language_slug,
    script: row.script,
    is_exotic: row.is_exotic,
    language_source: row.language_source,
    notes: row.notes,
  };
}

function mapSpellGrantEffectRow(row) {
  return {
    feature_id: Number(row.feature_id),
    spell_id: Number(row.spell_id),
    spell_name: row.spell_name,
    spell_slug: row.spell_slug,
    spell_level: Number(row.spell_level),
    spell_school: row.spell_school,
    spell_source: row.spell_source,
    grant_type: row.grant_type,
    granted_at_level: row.granted_at_level !== null ? Number(row.granted_at_level) : null,
    notes: row.notes,
  };
}

function mapSpeedEffectRow(row) {
  return {
    feature_id: Number(row.feature_id),
    speed_type: row.speed_type,
    modifier_value: Number(row.modifier_value),
    operation_type: row.operation_type,
    notes: row.notes,
  };
}

function mapSenseEffectRow(row) {
  return {
    feature_id: Number(row.feature_id),
    sense_type: row.sense_type,
    range_feet: row.range_feet !== null ? Number(row.range_feet) : null,
    notes: row.notes,
  };
}

function mapResistanceEffectRow(row) {
  return {
    feature_id: Number(row.feature_id),
    resistance_type: row.resistance_type,
    damage_type: row.damage_type,
    notes: row.notes,
  };
}

async function listFeatureEffects(featureIds) {
  if (featureIds.length === 0) {
    return {
      abilityEffects: [],
      skillEffects: [],
      languageGrantEffects: [],
      spellGrantEffects: [],
      speedEffects: [],
      senseEffects: [],
      resistanceEffects: [],
    };
  }

  const [
    abilityResult,
    skillResult,
    languageResult,
    spellResult,
    speedResult,
    senseResult,
    resistanceResult,
  ] = await Promise.all([
    query(selectFeatureAbilityModifierEffectsQuery, [featureIds]),
    query(selectFeatureSkillProficiencyEffectsQuery, [featureIds]),
    query(selectFeatureLanguageGrantEffectsQuery, [featureIds]),
    query(selectFeatureSpellGrantEffectsQuery, [featureIds]),
    query(selectFeatureSpeedModifierEffectsQuery, [featureIds]),
    query(selectFeatureSenseGrantEffectsQuery, [featureIds]),
    query(selectFeatureResistanceEffectsQuery, [featureIds]),
  ]);

  return {
    abilityEffects: abilityResult.rows.map(mapAbilityEffectRow),
    skillEffects: skillResult.rows.map(mapSkillEffectRow),
    languageGrantEffects: languageResult.rows.map(mapLanguageGrantEffectRow),
    spellGrantEffects: spellResult.rows.map(mapSpellGrantEffectRow),
    speedEffects: speedResult.rows.map(mapSpeedEffectRow),
    senseEffects: senseResult.rows.map(mapSenseEffectRow),
    resistanceEffects: resistanceResult.rows.map(mapResistanceEffectRow),
  };
}

export async function getCharacterRules(characterId, rawCharacter = null) {
  const raw = rawCharacter ?? (await getCharacterById(characterId));

  if (!raw) {
    return null;
  }

  const featureIds = [...new Set(raw.derived_features.map((feature) => Number(feature.id)))];
  const [movementContextResult, featureEffects] = await Promise.all([
    query(selectCharacterMovementContextQuery, [raw.id]),
    listFeatureEffects(featureIds),
  ]);

  return deriveCharacterRules(raw, {
    movementContext: mapMovementContextRow(movementContextResult.rows[0] || null),
    ...featureEffects,
  });
}
