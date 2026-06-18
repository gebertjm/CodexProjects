DO $$
BEGIN
  IF EXISTS (
    WITH data(item_slug) AS (
      VALUES
        ('padded-armor'), ('leather-armor'), ('studded-leather-armor'), ('hide-armor'),
        ('chain-shirt'), ('scale-mail'), ('breastplate'), ('half-plate'), ('ring-mail'),
        ('chain-mail'), ('splint-armor'), ('plate-armor'), ('shield')
    )
    SELECT 1
    FROM data d
    LEFT JOIN dnd5e_item i ON i.slug = d.item_slug
    WHERE i.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing item reference while seeding dnd5e_armor';
  END IF;
END $$;

WITH data(item_slug, armor_category, armor_class_base, dex_bonus_rule, strength_requirement, stealth_disadvantage) AS (
  VALUES
    ('padded-armor', 'Light', 11, 'full', NULL, TRUE),
    ('leather-armor', 'Light', 11, 'full', NULL, FALSE),
    ('studded-leather-armor', 'Light', 12, 'full', NULL, FALSE),
    ('hide-armor', 'Medium', 12, 'max_2', NULL, FALSE),
    ('chain-shirt', 'Medium', 13, 'max_2', NULL, FALSE),
    ('scale-mail', 'Medium', 14, 'max_2', NULL, TRUE),
    ('breastplate', 'Medium', 14, 'max_2', NULL, FALSE),
    ('half-plate', 'Medium', 15, 'max_2', NULL, TRUE),
    ('ring-mail', 'Heavy', 14, 'none', NULL, TRUE),
    ('chain-mail', 'Heavy', 16, 'none', 13, TRUE),
    ('splint-armor', 'Heavy', 17, 'none', 15, TRUE),
    ('plate-armor', 'Heavy', 18, 'none', 15, TRUE),
    ('shield', 'Shield', 2, 'shield_bonus', NULL, FALSE)
)
INSERT INTO dnd5e_armor (item_id, armor_category, armor_class_base, dex_bonus_rule, strength_requirement, stealth_disadvantage)
SELECT i.id, d.armor_category, d.armor_class_base, d.dex_bonus_rule, d.strength_requirement, d.stealth_disadvantage
FROM data d
JOIN dnd5e_item i ON i.slug = d.item_slug
ON CONFLICT (item_id) DO UPDATE
SET
  armor_category = EXCLUDED.armor_category,
  armor_class_base = EXCLUDED.armor_class_base,
  dex_bonus_rule = EXCLUDED.dex_bonus_rule,
  strength_requirement = EXCLUDED.strength_requirement,
  stealth_disadvantage = EXCLUDED.stealth_disadvantage;
