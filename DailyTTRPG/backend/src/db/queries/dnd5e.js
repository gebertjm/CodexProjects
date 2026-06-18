export const selectRacesQuery = `
  SELECT
    id,
    name,
    slug,
    size,
    base_speed,
    source,
    is_active
  FROM dnd5e_race
  ORDER BY name ASC;
`;

export const selectClassesQuery = `
  SELECT
    id,
    name,
    slug,
    hit_die,
    primary_ability_text,
    source,
    is_active
  FROM dnd5e_class
  ORDER BY name ASC;
`;

export const selectLanguagesQuery = `
  SELECT
    id,
    name,
    slug,
    script,
    is_exotic,
    source,
    is_active
  FROM dnd5e_language
  ORDER BY name ASC;
`;

export const selectFeatsQuery = `
  SELECT
    id,
    name,
    slug,
    prerequisites_text,
    source,
    is_active
  FROM dnd5e_feat
  ORDER BY name ASC;
`;
