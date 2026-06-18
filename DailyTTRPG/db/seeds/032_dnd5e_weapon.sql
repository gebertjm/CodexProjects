DO $$
BEGIN
  IF EXISTS (
    WITH data(item_slug) AS (
      VALUES
        ('club'), ('dagger'), ('greatclub'), ('handaxe'), ('javelin'), ('light-hammer'),
        ('mace'), ('quarterstaff'), ('sickle'), ('spear'), ('light-crossbow'), ('dart'),
        ('shortbow'), ('sling'), ('battleaxe'), ('flail'), ('glaive'), ('greataxe'),
        ('greatsword'), ('halberd'), ('lance'), ('longsword'), ('maul'), ('morningstar'),
        ('pike'), ('rapier'), ('scimitar'), ('shortsword'), ('trident'), ('war-pick'),
        ('warhammer'), ('whip')
    )
    SELECT 1
    FROM data d
    LEFT JOIN dnd5e_item i ON i.slug = d.item_slug
    WHERE i.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing item reference while seeding dnd5e_weapon';
  END IF;
END $$;

WITH data(item_slug, weapon_category, damage_dice, damage_type, properties_text, range_normal, range_long) AS (
  VALUES
    ('club', 'Simple Melee', '1d4', 'Bludgeoning', 'Light', NULL, NULL),
    ('dagger', 'Simple Melee', '1d4', 'Piercing', 'Finesse, light, thrown', 20, 60),
    ('greatclub', 'Simple Melee', '1d8', 'Bludgeoning', 'Two-handed', NULL, NULL),
    ('handaxe', 'Simple Melee', '1d6', 'Slashing', 'Light, thrown', 20, 60),
    ('javelin', 'Simple Melee', '1d6', 'Piercing', 'Thrown', 30, 120),
    ('light-hammer', 'Simple Melee', '1d4', 'Bludgeoning', 'Light, thrown', 20, 60),
    ('mace', 'Simple Melee', '1d6', 'Bludgeoning', NULL, NULL, NULL),
    ('quarterstaff', 'Simple Melee', '1d6', 'Bludgeoning', 'Versatile (1d8)', NULL, NULL),
    ('sickle', 'Simple Melee', '1d4', 'Slashing', 'Light', NULL, NULL),
    ('spear', 'Simple Melee', '1d6', 'Piercing', 'Thrown, versatile (1d8)', 20, 60),
    ('light-crossbow', 'Simple Ranged', '1d8', 'Piercing', 'Ammunition, loading, two-handed', 80, 320),
    ('dart', 'Simple Ranged', '1d4', 'Piercing', 'Finesse, thrown', 20, 60),
    ('shortbow', 'Simple Ranged', '1d6', 'Piercing', 'Ammunition, two-handed', 80, 320),
    ('sling', 'Simple Ranged', '1d4', 'Bludgeoning', 'Ammunition', 30, 120),
    ('battleaxe', 'Martial Melee', '1d8', 'Slashing', 'Versatile (1d10)', NULL, NULL),
    ('flail', 'Martial Melee', '1d8', 'Bludgeoning', NULL, NULL, NULL),
    ('glaive', 'Martial Melee', '1d10', 'Slashing', 'Heavy, reach, two-handed', NULL, NULL),
    ('greataxe', 'Martial Melee', '1d12', 'Slashing', 'Heavy, two-handed', NULL, NULL),
    ('greatsword', 'Martial Melee', '2d6', 'Slashing', 'Heavy, two-handed', NULL, NULL),
    ('halberd', 'Martial Melee', '1d10', 'Slashing', 'Heavy, reach, two-handed', NULL, NULL),
    ('lance', 'Martial Melee', '1d12', 'Piercing', 'Reach, special', NULL, NULL),
    ('longsword', 'Martial Melee', '1d8', 'Slashing', 'Versatile (1d10)', NULL, NULL),
    ('maul', 'Martial Melee', '2d6', 'Bludgeoning', 'Heavy, two-handed', NULL, NULL),
    ('morningstar', 'Martial Melee', '1d8', 'Piercing', NULL, NULL, NULL),
    ('pike', 'Martial Melee', '1d10', 'Piercing', 'Heavy, reach, two-handed', NULL, NULL),
    ('rapier', 'Martial Melee', '1d8', 'Piercing', 'Finesse', NULL, NULL),
    ('scimitar', 'Martial Melee', '1d6', 'Slashing', 'Finesse, light', NULL, NULL),
    ('shortsword', 'Martial Melee', '1d6', 'Piercing', 'Finesse, light', NULL, NULL),
    ('trident', 'Martial Melee', '1d6', 'Piercing', 'Thrown, versatile (1d8)', 20, 60),
    ('war-pick', 'Martial Melee', '1d8', 'Piercing', NULL, NULL, NULL),
    ('warhammer', 'Martial Melee', '1d8', 'Bludgeoning', 'Versatile (1d10)', NULL, NULL),
    ('whip', 'Martial Melee', '1d4', 'Slashing', 'Finesse, reach', NULL, NULL)
)
INSERT INTO dnd5e_weapon (item_id, weapon_category, damage_dice, damage_type, properties_text, range_normal, range_long)
SELECT i.id, d.weapon_category, d.damage_dice, d.damage_type, d.properties_text, d.range_normal, d.range_long
FROM data d
JOIN dnd5e_item i ON i.slug = d.item_slug
ON CONFLICT (item_id) DO UPDATE
SET
  weapon_category = EXCLUDED.weapon_category,
  damage_dice = EXCLUDED.damage_dice,
  damage_type = EXCLUDED.damage_type,
  properties_text = EXCLUDED.properties_text,
  range_normal = EXCLUDED.range_normal,
  range_long = EXCLUDED.range_long;
