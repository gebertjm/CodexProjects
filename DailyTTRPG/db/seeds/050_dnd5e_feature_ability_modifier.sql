DELETE FROM dnd5e_feature_ability_modifier;

WITH data(feature_slug, ability_code, modifier_value, modifier_type, notes) AS (
  VALUES
    ('dwarven-hardiness', 'CON', 2, 'bonus', 'Base dwarf Constitution increase.'),
    ('hill-dwarf-wisdom', 'WIS', 1, 'bonus', 'Hill dwarf Wisdom increase.'),
    ('mountain-dwarf-strength', 'STR', 2, 'bonus', 'Mountain dwarf Strength increase.'),
    ('elven-agility', 'DEX', 2, 'bonus', 'Base elf Dexterity increase.'),
    ('high-elf-intellect', 'INT', 1, 'bonus', 'High elf Intelligence increase.'),
    ('wood-elf-wisdom', 'WIS', 1, 'bonus', 'Wood elf Wisdom increase.'),
    ('halfling-agility', 'DEX', 2, 'bonus', 'Base halfling Dexterity increase.'),
    ('lightfoot-charisma', 'CHA', 1, 'bonus', 'Lightfoot halfling Charisma increase.'),
    ('stout-constitution', 'CON', 1, 'bonus', 'Stout halfling Constitution increase.'),
    ('human-versatility', 'STR', 1, 'bonus', 'Human ability score increase.'),
    ('human-versatility', 'DEX', 1, 'bonus', 'Human ability score increase.'),
    ('human-versatility', 'CON', 1, 'bonus', 'Human ability score increase.'),
    ('human-versatility', 'INT', 1, 'bonus', 'Human ability score increase.'),
    ('human-versatility', 'WIS', 1, 'bonus', 'Human ability score increase.'),
    ('human-versatility', 'CHA', 1, 'bonus', 'Human ability score increase.'),
    ('dragonborn-ability-increase', 'STR', 2, 'bonus', 'Dragonborn Strength increase.'),
    ('dragonborn-ability-increase', 'CHA', 1, 'bonus', 'Dragonborn Charisma increase.'),
    ('gnome-intelligence', 'INT', 2, 'bonus', 'Base gnome Intelligence increase.'),
    ('forest-gnome-dexterity', 'DEX', 1, 'bonus', 'Forest gnome Dexterity increase.'),
    ('rock-gnome-constitution', 'CON', 1, 'bonus', 'Rock gnome Constitution increase.'),
    ('half-elf-charisma', 'CHA', 2, 'bonus', 'Half-elf Charisma increase.'),
    ('half-orc-might', 'STR', 2, 'bonus', 'Half-orc Strength increase.'),
    ('half-orc-might', 'CON', 1, 'bonus', 'Half-orc Constitution increase.'),
    ('tiefling-legacy', 'INT', 1, 'bonus', 'Tiefling Intelligence increase.'),
    ('tiefling-legacy', 'CHA', 2, 'bonus', 'Tiefling Charisma increase.')
)
INSERT INTO dnd5e_feature_ability_modifier (feature_id, ability_score_type_id, modifier_value, modifier_type, notes)
SELECT f.id, a.id, d.modifier_value, d.modifier_type, d.notes
FROM data d
JOIN dnd5e_feature f ON f.slug = d.feature_slug
JOIN dnd5e_ability_score_type a ON a.code = d.ability_code;
