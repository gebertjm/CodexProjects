export const selectRulesetsQuery = `
  SELECT
    id,
    key,
    name,
    description,
    is_active,
    created_at
  FROM ruleset
  ORDER BY name ASC;
`;
