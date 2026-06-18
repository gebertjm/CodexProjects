BEGIN;

INSERT INTO app_boot_log (boot_message)
VALUES ('DailyRPG database initialized')
ON CONFLICT DO NOTHING;

INSERT INTO ruleset (key, name, description, is_active)
VALUES ('dnd5e', 'D&D 5e', 'Dungeons & Dragons 5th Edition ruleset', TRUE)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

INSERT INTO dnd5e_ability_score_type (code, name)
VALUES
  ('STR', 'Strength'),
  ('DEX', 'Dexterity'),
  ('CON', 'Constitution'),
  ('INT', 'Intelligence'),
  ('WIS', 'Wisdom'),
  ('CHA', 'Charisma')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name;

INSERT INTO dnd5e_skill (name, slug, ability_score_type_id)
SELECT skill_data.name, skill_data.slug, ability.id
FROM (
  VALUES
    ('Acrobatics', 'acrobatics', 'DEX'),
    ('Animal Handling', 'animal-handling', 'WIS'),
    ('Arcana', 'arcana', 'INT'),
    ('Athletics', 'athletics', 'STR'),
    ('Deception', 'deception', 'CHA'),
    ('History', 'history', 'INT'),
    ('Insight', 'insight', 'WIS'),
    ('Intimidation', 'intimidation', 'CHA'),
    ('Investigation', 'investigation', 'INT'),
    ('Medicine', 'medicine', 'WIS'),
    ('Nature', 'nature', 'INT'),
    ('Perception', 'perception', 'WIS'),
    ('Performance', 'performance', 'CHA'),
    ('Persuasion', 'persuasion', 'CHA'),
    ('Religion', 'religion', 'INT'),
    ('Sleight of Hand', 'sleight-of-hand', 'DEX'),
    ('Stealth', 'stealth', 'DEX'),
    ('Survival', 'survival', 'WIS')
) AS skill_data(name, slug, ability_code)
JOIN dnd5e_ability_score_type ability ON ability.code = skill_data.ability_code
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  ability_score_type_id = EXCLUDED.ability_score_type_id;

INSERT INTO dnd5e_race (name, slug, description, size, base_speed, source)
VALUES
  ('Dragonborn', 'dragonborn', 'Proud draconic folk with forceful presence.', 'Medium', 30, 'SRD 5.1'),
  ('Dwarf', 'dwarf', 'Hardy folk shaped by stone, craft, and endurance.', 'Medium', 25, 'SRD 5.1'),
  ('Elf', 'elf', 'Graceful folk with keen senses and long memory.', 'Medium', 30, 'SRD 5.1'),
  ('Gnome', 'gnome', 'Curious folk with quick minds and bright ingenuity.', 'Small', 25, 'SRD 5.1'),
  ('Half-Elf', 'half-elf', 'Versatile folk standing between human and elven worlds.', 'Medium', 30, 'SRD 5.1'),
  ('Half-Orc', 'half-orc', 'Forceful folk marked by endurance and intensity.', 'Medium', 30, 'SRD 5.1'),
  ('Halfling', 'halfling', 'Small, brave folk with steady luck.', 'Small', 25, 'SRD 5.1'),
  ('Human', 'human', 'Adaptable folk found across many roads and cultures.', 'Medium', 30, 'SRD 5.1'),
  ('Tiefling', 'tiefling', 'Uncanny folk carrying infernal marks and resilient will.', 'Medium', 30, 'SRD 5.1')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  size = EXCLUDED.size,
  base_speed = EXCLUDED.base_speed,
  source = EXCLUDED.source,
  is_active = TRUE;

INSERT INTO dnd5e_subrace (race_id, name, slug, description, source)
SELECT race.id, subrace_data.name, subrace_data.slug, subrace_data.description, 'SRD 5.1'
FROM (
  VALUES
    ('dwarf', 'Hill Dwarf', 'hill-dwarf', 'Dwarves with deep resilience and practical wisdom.'),
    ('dwarf', 'Mountain Dwarf', 'mountain-dwarf', 'Dwarves shaped by high stone halls and martial tradition.'),
    ('elf', 'High Elf', 'high-elf', 'Elves with arcane learning and careful discipline.'),
    ('elf', 'Wood Elf', 'wood-elf', 'Elves at home under bough, rain, and trail.'),
    ('gnome', 'Forest Gnome', 'forest-gnome', 'Gnomes with quiet woodland cleverness.'),
    ('gnome', 'Rock Gnome', 'rock-gnome', 'Gnomes with craft, wit, and mechanical curiosity.'),
    ('halfling', 'Lightfoot Halfling', 'lightfoot-halfling', 'Halflings with nimble charm and quiet feet.'),
    ('halfling', 'Stout Halfling', 'stout-halfling', 'Halflings with uncommon toughness.')
) AS subrace_data(race_slug, name, slug, description)
JOIN dnd5e_race race ON race.slug = subrace_data.race_slug
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = TRUE;

INSERT INTO dnd5e_class (name, slug, description, hit_die, primary_ability_text, source)
VALUES
  ('Barbarian', 'barbarian', 'A fierce warrior of instinct, toughness, and rage.', 12, 'Strength', 'SRD 5.1'),
  ('Bard', 'bard', 'A magic-using performer whose art shapes courage and fate.', 8, 'Charisma', 'SRD 5.1'),
  ('Cleric', 'cleric', 'A divine champion who channels faith into magic and resolve.', 8, 'Wisdom', 'SRD 5.1'),
  ('Druid', 'druid', 'A keeper of old natural power and primal transformation.', 8, 'Wisdom', 'SRD 5.1'),
  ('Fighter', 'fighter', 'A trained combatant with endurance, discipline, and practical skill.', 10, 'Strength or Dexterity', 'SRD 5.1'),
  ('Monk', 'monk', 'A disciplined martial adept shaped by speed and inner focus.', 8, 'Dexterity and Wisdom', 'SRD 5.1'),
  ('Paladin', 'paladin', 'A sworn champion whose oath carries martial and divine power.', 10, 'Strength and Charisma', 'SRD 5.1'),
  ('Ranger', 'ranger', 'A watchful explorer skilled with paths, tracks, and threats.', 10, 'Dexterity and Wisdom', 'SRD 5.1'),
  ('Rogue', 'rogue', 'A precise problem-solver with stealth, nerve, and quick hands.', 8, 'Dexterity', 'SRD 5.1'),
  ('Sorcerer', 'sorcerer', 'An innate spellcaster whose magic runs in blood or soul.', 6, 'Charisma', 'SRD 5.1'),
  ('Warlock', 'warlock', 'A pact-bound spellcaster marked by dangerous bargains.', 8, 'Charisma', 'SRD 5.1'),
  ('Wizard', 'wizard', 'A studied spellcaster who turns learning into power.', 6, 'Intelligence', 'SRD 5.1')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  hit_die = EXCLUDED.hit_die,
  primary_ability_text = EXCLUDED.primary_ability_text,
  source = EXCLUDED.source,
  is_active = TRUE;

INSERT INTO dnd5e_subclass (class_id, name, slug, description, source)
SELECT class_row.id, subclass_data.name, subclass_data.slug, subclass_data.description, 'SRD 5.1'
FROM (
  VALUES
    ('cleric', 'Life Domain', 'life-domain', 'A divine domain of healing, endurance, and protection.'),
    ('fighter', 'Champion', 'champion', 'A martial archetype built around direct, reliable prowess.'),
    ('rogue', 'Thief', 'thief', 'A roguish archetype of nimble hands and quick improvisation.'),
    ('sorcerer', 'Draconic Bloodline', 'draconic-bloodline', 'A sorcerous origin carrying the echo of draconic power.'),
    ('wizard', 'School of Evocation', 'school-of-evocation', 'An arcane tradition focused on shaping raw magical force.')
) AS subclass_data(class_slug, name, slug, description)
JOIN dnd5e_class class_row ON class_row.slug = subclass_data.class_slug
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = TRUE;

INSERT INTO dnd5e_background (name, slug, description, source)
VALUES
  ('Acolyte', 'acolyte', 'You served a temple, shrine, or sacred tradition.', 'SRD 5.1'),
  ('Criminal', 'criminal', 'You learned the habits of secrecy, risk, and illicit work.', 'SRD 5.1'),
  ('Folk Hero', 'folk-hero', 'You stood up for ordinary people and know the weight of local trouble.', 'SRD 5.1'),
  ('Noble', 'noble', 'You understand rank, obligation, and the quiet pressure of status.', 'SRD 5.1'),
  ('Sage', 'sage', 'You studied lore, signs, and the patient work of understanding.', 'SRD 5.1'),
  ('Soldier', 'soldier', 'You know discipline, watches, armor, and command under pressure.', 'SRD 5.1')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = TRUE;

INSERT INTO dnd5e_item (name, slug, item_type, rarity, weight, value_cp, description, source)
VALUES
  ('Chain Mail', 'chain-mail', 'armor', 'common', 55, 7500, 'Interlocking metal rings worn as heavy armor.', 'SRD 5.1'),
  ('Dagger', 'dagger', 'weapon', 'common', 1, 200, 'A small blade useful in close quarters.', 'SRD 5.1'),
  ('Dart', 'dart', 'weapon', 'common', 0.25, 5, 'A light thrown missile.', 'SRD 5.1'),
  ('Greataxe', 'greataxe', 'weapon', 'common', 7, 3000, 'A heavy two-handed axe.', 'SRD 5.1'),
  ('Handaxe', 'handaxe', 'weapon', 'common', 2, 500, 'A compact axe that can be thrown.', 'SRD 5.1'),
  ('Hide Armor', 'hide-armor', 'armor', 'common', 12, 1000, 'Crude but serviceable armor of thick hides.', 'SRD 5.1'),
  ('Leather Armor', 'leather-armor', 'armor', 'common', 10, 1000, 'Flexible armor of shaped leather.', 'SRD 5.1'),
  ('Longsword', 'longsword', 'weapon', 'common', 3, 1500, 'A versatile martial blade.', 'SRD 5.1'),
  ('Mace', 'mace', 'weapon', 'common', 4, 500, 'A blunt weapon favored by many travelers and priests.', 'SRD 5.1'),
  ('Quarterstaff', 'quarterstaff', 'weapon', 'common', 4, 20, 'A sturdy staff suited for travel and defense.', 'SRD 5.1'),
  ('Rapier', 'rapier', 'weapon', 'common', 2, 2500, 'A slender thrusting blade.', 'SRD 5.1'),
  ('Scale Mail', 'scale-mail', 'armor', 'common', 45, 5000, 'Overlapping metal scales mounted on backing.', 'SRD 5.1'),
  ('Scimitar', 'scimitar', 'weapon', 'common', 3, 2500, 'A curved blade made for quick cuts.', 'SRD 5.1'),
  ('Shield', 'shield', 'armor', 'common', 6, 1000, 'A carried shield used to turn aside blows.', 'SRD 5.1'),
  ('Shortbow', 'shortbow', 'weapon', 'common', 2, 2500, 'A compact bow suitable for the road.', 'SRD 5.1'),
  ('Shortsword', 'shortsword', 'weapon', 'common', 2, 1000, 'A light blade for fast close work.', 'SRD 5.1'),
  ('Spear', 'spear', 'weapon', 'common', 3, 100, 'A simple thrusting weapon that can be thrown.', 'SRD 5.1')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  item_type = EXCLUDED.item_type,
  rarity = EXCLUDED.rarity,
  weight = EXCLUDED.weight,
  value_cp = EXCLUDED.value_cp,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = TRUE;

INSERT INTO dnd5e_spell (
  name,
  slug,
  level,
  school,
  casting_time,
  range_text,
  duration_text,
  components_text,
  ritual,
  concentration,
  description,
  source
)
VALUES
  ('Acid Splash', 'acid-splash', 0, 'Conjuration', '1 action', '60 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'You hurl a small bubble of acid.', 'SRD 5.1'),
  ('Blade Ward', 'blade-ward', 0, 'Abjuration', '1 action', 'Self', '1 round', 'V, S', FALSE, FALSE, 'You trace a warding sigil against weapon blows.', 'SRD 5.1'),
  ('Burning Hands', 'burning-hands', 1, 'Evocation', '1 action', 'Self', 'Instantaneous', 'V, S', FALSE, FALSE, 'A thin sheet of flames shoots from your hands.', 'SRD 5.1'),
  ('Chill Touch', 'chill-touch', 0, 'Necromancy', '1 action', '120 feet', '1 round', 'V, S', FALSE, FALSE, 'A ghostly hand clings with grave-cold force.', 'SRD 5.1'),
  ('Cure Wounds', 'cure-wounds', 1, 'Evocation', '1 action', 'Touch', 'Instantaneous', 'V, S', FALSE, FALSE, 'Healing energy restores a creature you touch.', 'SRD 5.1'),
  ('Dancing Lights', 'dancing-lights', 0, 'Evocation', '1 action', '120 feet', '1 minute', 'V, S, M', FALSE, TRUE, 'You create small hovering lights.', 'SRD 5.1'),
  ('Darkness', 'darkness', 2, 'Evocation', '1 action', '60 feet', '10 minutes', 'V, M', FALSE, TRUE, 'Magical darkness spreads from a point.', 'SRD 5.1'),
  ('Detect Magic', 'detect-magic', 1, 'Divination', '1 action', 'Self', '10 minutes', 'V, S', TRUE, TRUE, 'You sense nearby magic.', 'SRD 5.1'),
  ('Disguise Self', 'disguise-self', 1, 'Illusion', '1 action', 'Self', '1 hour', 'V, S', FALSE, FALSE, 'You make yourself look different.', 'SRD 5.1'),
  ('Dispel Magic', 'dispel-magic', 3, 'Abjuration', '1 action', '120 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'You end magic affecting a creature, object, or area.', 'SRD 5.1'),
  ('Fire Bolt', 'fire-bolt', 0, 'Evocation', '1 action', '120 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'You hurl a mote of fire.', 'SRD 5.1'),
  ('Fireball', 'fireball', 3, 'Evocation', '1 action', '150 feet', 'Instantaneous', 'V, S, M', FALSE, FALSE, 'A bright explosion blooms at a point you choose.', 'SRD 5.1'),
  ('Fly', 'fly', 3, 'Transmutation', '1 action', 'Touch', '10 minutes', 'V, S, M', FALSE, TRUE, 'A willing creature gains a flying speed.', 'SRD 5.1'),
  ('Haste', 'haste', 3, 'Transmutation', '1 action', '30 feet', '1 minute', 'V, S, M', FALSE, TRUE, 'Magic quickens a willing creature.', 'SRD 5.1'),
  ('Healing Word', 'healing-word', 1, 'Evocation', '1 bonus action', '60 feet', 'Instantaneous', 'V', FALSE, FALSE, 'A brief word restores a wounded creature.', 'SRD 5.1'),
  ('Hellish Rebuke', 'hellish-rebuke', 1, 'Evocation', '1 reaction', '60 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'A rebuke wreathes a creature in flame.', 'SRD 5.1'),
  ('Invisibility', 'invisibility', 2, 'Illusion', '1 action', 'Touch', '1 hour', 'V, S, M', FALSE, TRUE, 'A creature becomes invisible until the spell ends.', 'SRD 5.1'),
  ('Light', 'light', 0, 'Evocation', '1 action', 'Touch', '1 hour', 'V, M', FALSE, FALSE, 'An object sheds bright light.', 'SRD 5.1'),
  ('Mage Armor', 'mage-armor', 1, 'Abjuration', '1 action', 'Touch', '8 hours', 'V, S, M', FALSE, FALSE, 'Protective magic surrounds an unarmored creature.', 'SRD 5.1'),
  ('Mage Hand', 'mage-hand', 0, 'Conjuration', '1 action', '30 feet', '1 minute', 'V, S', FALSE, FALSE, 'A spectral hand appears and manipulates objects.', 'SRD 5.1'),
  ('Magic Missile', 'magic-missile', 1, 'Evocation', '1 action', '120 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'Darts of magical force strike unerringly.', 'SRD 5.1'),
  ('Mending', 'mending', 0, 'Transmutation', '1 minute', 'Touch', 'Instantaneous', 'V, S, M', FALSE, FALSE, 'You repair a single break or tear.', 'SRD 5.1'),
  ('Message', 'message', 0, 'Transmutation', '1 action', '120 feet', '1 round', 'V, S, M', FALSE, FALSE, 'You whisper a message to a distant creature.', 'SRD 5.1'),
  ('Minor Illusion', 'minor-illusion', 0, 'Illusion', '1 action', '30 feet', '1 minute', 'S, M', FALSE, FALSE, 'You create a sound or image.', 'SRD 5.1'),
  ('Poison Spray', 'poison-spray', 0, 'Conjuration', '1 action', '10 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'You puff noxious gas toward a creature.', 'SRD 5.1'),
  ('Prestidigitation', 'prestidigitation', 0, 'Transmutation', '1 action', '10 feet', 'Up to 1 hour', 'V, S', FALSE, FALSE, 'You perform a minor magical trick.', 'SRD 5.1'),
  ('Ray of Frost', 'ray-of-frost', 0, 'Evocation', '1 action', '60 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'A frigid beam slows and harms a creature.', 'SRD 5.1'),
  ('Scorching Ray', 'scorching-ray', 2, 'Evocation', '1 action', '120 feet', 'Instantaneous', 'V, S', FALSE, FALSE, 'You hurl rays of fire.', 'SRD 5.1'),
  ('Shatter', 'shatter', 2, 'Evocation', '1 action', '60 feet', 'Instantaneous', 'V, S, M', FALSE, FALSE, 'A sudden ringing noise erupts painfully.', 'SRD 5.1'),
  ('Shield', 'shield', 1, 'Abjuration', '1 reaction', 'Self', '1 round', 'V, S', FALSE, FALSE, 'An invisible barrier of magical force protects you.', 'SRD 5.1'),
  ('Shocking Grasp', 'shocking-grasp', 0, 'Evocation', '1 action', 'Touch', 'Instantaneous', 'V, S', FALSE, FALSE, 'Lightning springs from your hand.', 'SRD 5.1'),
  ('Sleep', 'sleep', 1, 'Enchantment', '1 action', '90 feet', '1 minute', 'V, S, M', FALSE, FALSE, 'Magic sends creatures into slumber.', 'SRD 5.1'),
  ('Spider Climb', 'spider-climb', 2, 'Transmutation', '1 action', 'Touch', '1 hour', 'V, S, M', FALSE, TRUE, 'A creature can move along walls and ceilings.', 'SRD 5.1'),
  ('Thaumaturgy', 'thaumaturgy', 0, 'Transmutation', '1 action', '30 feet', 'Up to 1 minute', 'V', FALSE, FALSE, 'You manifest a minor wonder.', 'SRD 5.1'),
  ('Thunderwave', 'thunderwave', 1, 'Evocation', '1 action', 'Self', 'Instantaneous', 'V, S', FALSE, FALSE, 'A wave of thunderous force sweeps outward.', 'SRD 5.1')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  school = EXCLUDED.school,
  casting_time = EXCLUDED.casting_time,
  range_text = EXCLUDED.range_text,
  duration_text = EXCLUDED.duration_text,
  components_text = EXCLUDED.components_text,
  ritual = EXCLUDED.ritual,
  concentration = EXCLUDED.concentration,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = TRUE;

COMMIT;
