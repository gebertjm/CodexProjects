INSERT INTO dnd5e_race (name, slug, description, size, base_speed, source, is_active)
VALUES
  ('Dragonborn', 'dragonborn', 'Proud draconic humanoids with breath weapon ancestry.', 'Medium', 30, 'SRD 5.1', TRUE),
  ('Dwarf', 'dwarf', 'Hardy folk of stone, endurance, and tradition.', 'Medium', 25, 'SRD 5.1', TRUE),
  ('Elf', 'elf', 'Graceful folk tied to magic, art, and ancient memory.', 'Medium', 30, 'SRD 5.1', TRUE),
  ('Gnome', 'gnome', 'Small folk known for curiosity, wit, and magical talent.', 'Small', 25, 'SRD 5.1', TRUE),
  ('Half-Elf', 'half-elf', 'Versatile people who bridge human and elven worlds.', 'Medium', 30, 'SRD 5.1', TRUE),
  ('Half-Orc', 'half-orc', 'Powerful survivors shaped by human and orcish heritage.', 'Medium', 30, 'SRD 5.1', TRUE),
  ('Halfling', 'halfling', 'Small, nimble folk famous for luck and courage.', 'Small', 25, 'SRD 5.1', TRUE),
  ('Human', 'human', 'Adaptable people found in every corner of the world.', 'Medium', 30, 'SRD 5.1', TRUE),
  ('Tiefling', 'tiefling', 'People marked by infernal heritage and strange gifts.', 'Medium', 30, 'SRD 5.1', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  size = EXCLUDED.size,
  base_speed = EXCLUDED.base_speed,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
