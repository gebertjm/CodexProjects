export const selectCharacterMovementContextQuery = `
  SELECT
    ch.id AS character_id,
    ch.speed AS stored_character_speed,
    race.id AS race_id,
    race.name AS race_name,
    race.slug AS race_slug,
    race.size AS race_size,
    race.base_speed AS race_base_speed,
    race.source AS race_source
  FROM dnd5e_character ch
  LEFT JOIN dnd5e_race race ON race.id = ch.race_id
  WHERE ch.id = $1;
`;

export const selectFeatureAbilityModifierEffectsQuery = `
  SELECT
    fam.feature_id,
    ability.code AS ability_code,
    ability.name AS ability_name,
    fam.modifier_value,
    fam.modifier_type,
    fam.notes
  FROM dnd5e_feature_ability_modifier fam
  JOIN dnd5e_ability_score_type ability ON ability.id = fam.ability_score_type_id
  WHERE fam.feature_id = ANY($1::bigint[])
  ORDER BY fam.feature_id ASC, ability.code ASC, fam.id ASC;
`;

export const selectFeatureSkillProficiencyEffectsQuery = `
  SELECT
    fsp.feature_id,
    skill.id AS skill_id,
    skill.name AS skill_name,
    skill.slug AS skill_slug,
    fsp.proficiency_type,
    fsp.notes
  FROM dnd5e_feature_skill_proficiency fsp
  JOIN dnd5e_skill skill ON skill.id = fsp.skill_id
  WHERE fsp.feature_id = ANY($1::bigint[])
  ORDER BY fsp.feature_id ASC, skill.name ASC, fsp.id ASC;
`;

export const selectFeatureLanguageGrantEffectsQuery = `
  SELECT
    flg.feature_id,
    language.id AS language_id,
    language.name AS language_name,
    language.slug AS language_slug,
    language.script,
    language.is_exotic,
    language.source AS language_source,
    flg.notes
  FROM dnd5e_feature_language_grant flg
  JOIN dnd5e_language language ON language.id = flg.language_id
  WHERE flg.feature_id = ANY($1::bigint[])
  ORDER BY flg.feature_id ASC, language.name ASC, flg.id ASC;
`;

export const selectFeatureSpellGrantEffectsQuery = `
  SELECT
    fsg.feature_id,
    spell.id AS spell_id,
    spell.name AS spell_name,
    spell.slug AS spell_slug,
    spell.level AS spell_level,
    spell.school AS spell_school,
    spell.source AS spell_source,
    fsg.grant_type,
    fsg.granted_at_level,
    fsg.notes
  FROM dnd5e_feature_spell_grant fsg
  JOIN dnd5e_spell spell ON spell.id = fsg.spell_id
  WHERE fsg.feature_id = ANY($1::bigint[])
  ORDER BY fsg.feature_id ASC, spell.level ASC, spell.name ASC, fsg.id ASC;
`;

export const selectFeatureSpeedModifierEffectsQuery = `
  SELECT
    fsm.feature_id,
    fsm.speed_type,
    fsm.modifier_value,
    fsm.operation_type,
    fsm.notes
  FROM dnd5e_feature_speed_modifier fsm
  WHERE fsm.feature_id = ANY($1::bigint[])
  ORDER BY fsm.feature_id ASC, fsm.speed_type ASC, fsm.id ASC;
`;

export const selectFeatureSenseGrantEffectsQuery = `
  SELECT
    fsg.feature_id,
    fsg.sense_type,
    fsg.range_feet,
    fsg.notes
  FROM dnd5e_feature_sense_grant fsg
  WHERE fsg.feature_id = ANY($1::bigint[])
  ORDER BY fsg.feature_id ASC, fsg.sense_type ASC, fsg.id ASC;
`;

export const selectFeatureResistanceEffectsQuery = `
  SELECT
    fr.feature_id,
    fr.resistance_type,
    fr.damage_type,
    fr.notes
  FROM dnd5e_feature_resistance fr
  WHERE fr.feature_id = ANY($1::bigint[])
  ORDER BY fr.feature_id ASC, fr.resistance_type ASC, fr.damage_type ASC, fr.id ASC;
`;
