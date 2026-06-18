DO $$
BEGIN
  IF EXISTS (
    WITH data(name, slug, ability_code) AS (
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
    )
    SELECT 1
    FROM data d
    LEFT JOIN dnd5e_ability_score_type a ON a.code = d.ability_code
    WHERE a.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing ability score type reference while seeding dnd5e_skill';
  END IF;
END $$;

WITH data(name, slug, ability_code) AS (
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
)
INSERT INTO dnd5e_skill (name, slug, ability_score_type_id)
SELECT d.name, d.slug, a.id
FROM data d
JOIN dnd5e_ability_score_type a ON a.code = d.ability_code
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  ability_score_type_id = EXCLUDED.ability_score_type_id;
