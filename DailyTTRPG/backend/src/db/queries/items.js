export const selectItemsQuery = `
  SELECT
    item.id,
    item.name,
    item.slug,
    item.item_type,
    item.rarity,
    item.weight,
    item.value_cp,
    item.description,
    item.source,
    item.is_active,
    weapon.weapon_category,
    weapon.damage_dice,
    weapon.damage_type,
    weapon.properties_text,
    weapon.range_normal,
    weapon.range_long,
    armor.armor_category,
    armor.armor_class_base,
    armor.dex_bonus_rule,
    armor.strength_requirement,
    armor.stealth_disadvantage
  FROM dnd5e_item item
  LEFT JOIN dnd5e_weapon weapon ON weapon.item_id = item.id
  LEFT JOIN dnd5e_armor armor ON armor.item_id = item.id
  ORDER BY item.name ASC;
`;

export const selectItemByIdQuery = `
  SELECT
    item.id,
    item.name,
    item.slug,
    item.item_type,
    item.rarity,
    item.weight,
    item.value_cp,
    item.description,
    item.source,
    item.is_active,
    weapon.weapon_category,
    weapon.damage_dice,
    weapon.damage_type,
    weapon.properties_text,
    weapon.range_normal,
    weapon.range_long,
    armor.armor_category,
    armor.armor_class_base,
    armor.dex_bonus_rule,
    armor.strength_requirement,
    armor.stealth_disadvantage
  FROM dnd5e_item item
  LEFT JOIN dnd5e_weapon weapon ON weapon.item_id = item.id
  LEFT JOIN dnd5e_armor armor ON armor.item_id = item.id
  WHERE item.id = $1;
`;

export const selectItemBySlugQuery = `
  SELECT
    item.id,
    item.name,
    item.slug,
    item.item_type,
    item.rarity,
    item.weight,
    item.value_cp,
    item.description,
    item.source,
    item.is_active,
    weapon.weapon_category,
    weapon.damage_dice,
    weapon.damage_type,
    weapon.properties_text,
    weapon.range_normal,
    weapon.range_long,
    armor.armor_category,
    armor.armor_class_base,
    armor.dex_bonus_rule,
    armor.strength_requirement,
    armor.stealth_disadvantage
  FROM dnd5e_item item
  LEFT JOIN dnd5e_weapon weapon ON weapon.item_id = item.id
  LEFT JOIN dnd5e_armor armor ON armor.item_id = item.id
  WHERE item.slug = $1;
`;

export const selectCharacterItemsQuery = `
  SELECT
    ci.id,
    ci.character_id,
    ci.item_id,
    ci.parent_character_item_id,
    ci.quantity,
    ci.is_equipped,
    ci.is_attuned,
    ci.current_uses,
    ci.max_uses,
    ci.notes,
    ci.created_at,
    ci.updated_at,
    item.name AS item_name,
    item.slug AS item_slug,
    item.item_type,
    item.rarity,
    item.weight,
    item.value_cp,
    item.description,
    item.source,
    item.is_active AS item_is_active,
    weapon.weapon_category,
    weapon.damage_dice,
    weapon.damage_type,
    weapon.properties_text,
    weapon.range_normal,
    weapon.range_long,
    armor.armor_category,
    armor.armor_class_base,
    armor.dex_bonus_rule,
    armor.strength_requirement,
    armor.stealth_disadvantage,
    parent_item.name AS parent_item_name,
    parent_item.slug AS parent_item_slug
  FROM dnd5e_character_item ci
  JOIN dnd5e_item item ON item.id = ci.item_id
  LEFT JOIN dnd5e_weapon weapon ON weapon.item_id = item.id
  LEFT JOIN dnd5e_armor armor ON armor.item_id = item.id
  LEFT JOIN dnd5e_character_item parent_ci ON parent_ci.id = ci.parent_character_item_id
  LEFT JOIN dnd5e_item parent_item ON parent_item.id = parent_ci.item_id
  WHERE ci.character_id = $1
  ORDER BY ci.created_at ASC, ci.id ASC;
`;

export const selectCharacterItemByIdForUpdateQuery = `
  SELECT
    ci.id,
    ci.character_id,
    ci.item_id,
    ci.parent_character_item_id,
    ci.quantity,
    ci.is_equipped,
    ci.is_attuned,
    ci.current_uses,
    ci.max_uses,
    ci.notes,
    ci.created_at,
    ci.updated_at,
    item.name AS item_name,
    item.slug AS item_slug,
    item.item_type,
    item.rarity,
    item.weight,
    item.value_cp,
    item.description,
    item.source,
    item.is_active AS item_is_active,
    weapon.weapon_category,
    weapon.damage_dice,
    weapon.damage_type,
    weapon.properties_text,
    weapon.range_normal,
    weapon.range_long,
    armor.armor_category,
    armor.armor_class_base,
    armor.dex_bonus_rule,
    armor.strength_requirement,
    armor.stealth_disadvantage
  FROM dnd5e_character_item ci
  JOIN dnd5e_item item ON item.id = ci.item_id
  LEFT JOIN dnd5e_weapon weapon ON weapon.item_id = item.id
  LEFT JOIN dnd5e_armor armor ON armor.item_id = item.id
  WHERE ci.id = $1;
`;

export const selectCharacterItemForReadQuery = `
  SELECT
    ci.id,
    ci.character_id,
    ci.item_id,
    ci.parent_character_item_id,
    ci.quantity,
    ci.is_equipped,
    ci.is_attuned,
    ci.current_uses,
    ci.max_uses,
    ci.notes,
    ci.created_at,
    ci.updated_at,
    item.name AS item_name,
    item.slug AS item_slug,
    item.item_type,
    item.rarity,
    item.weight,
    item.value_cp,
    item.description,
    item.source,
    item.is_active AS item_is_active,
    weapon.weapon_category,
    weapon.damage_dice,
    weapon.damage_type,
    weapon.properties_text,
    weapon.range_normal,
    weapon.range_long,
    armor.armor_category,
    armor.armor_class_base,
    armor.dex_bonus_rule,
    armor.strength_requirement,
    armor.stealth_disadvantage
  FROM dnd5e_character_item ci
  JOIN dnd5e_item item ON item.id = ci.item_id
  LEFT JOIN dnd5e_weapon weapon ON weapon.item_id = item.id
  LEFT JOIN dnd5e_armor armor ON armor.item_id = item.id
  WHERE ci.id = $1;
`;

export const insertCharacterItemQuery = `
  INSERT INTO dnd5e_character_item (
    character_id,
    item_id,
    parent_character_item_id,
    quantity,
    is_equipped,
    is_attuned,
    current_uses,
    max_uses,
    notes
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  RETURNING id;
`;

export const updateCharacterItemQuery = `
  UPDATE dnd5e_character_item
  SET
    parent_character_item_id = $2,
    quantity = $3,
    is_equipped = $4,
    is_attuned = $5,
    current_uses = $6,
    max_uses = $7,
    notes = $8,
    updated_at = NOW()
  WHERE id = $1;
`;

export const selectCharacterCurrencyQuery = `
  SELECT
    id,
    character_id,
    cp,
    sp,
    ep,
    gp,
    pp,
    created_at,
    updated_at
  FROM dnd5e_character_currency
  WHERE character_id = $1;
`;

export const selectCharacterCurrencyForUpdateQuery = `
  SELECT
    id,
    character_id,
    cp,
    sp,
    ep,
    gp,
    pp,
    created_at,
    updated_at
  FROM dnd5e_character_currency
  WHERE character_id = $1
  FOR UPDATE;
`;

export const insertCharacterCurrencyQuery = `
  INSERT INTO dnd5e_character_currency (
    character_id,
    cp,
    sp,
    ep,
    gp,
    pp
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING id;
`;

export const updateCharacterCurrencyQuery = `
  UPDATE dnd5e_character_currency
  SET
    cp = $2,
    sp = $3,
    ep = $4,
    gp = $5,
    pp = $6,
    updated_at = NOW()
  WHERE character_id = $1;
`;
