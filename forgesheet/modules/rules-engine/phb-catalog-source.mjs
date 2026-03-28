const makeFeature = (classId, level, name, effects = []) => ({
  id: `${classId}-feature-${level}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  entity_type: "feature",
  version: 1,
  name,
  status: "indexed",
  source_reference: {
    book: "PHB",
    chapter: "Classes",
    section: classId,
    page_hint: null,
  },
  summary: `Structured placeholder for ${name}.`,
  prerequisites: [],
  level_requirement: level,
  tags: [classId, "class-feature"],
  related_ids: [classId],
  mechanical_effects: effects,
  user_supplied_text: "",
  notes: "",
  verbatim_reference: "",
});

const makeEntity = ({
  id,
  entity_type,
  name,
  chapter,
  section,
  summary,
  tags = [],
  related_ids = [],
  prerequisites = [],
  mechanical_effects = [],
  level_requirement = null,
  status = "indexed",
}) => ({
  id,
  entity_type,
  version: 1,
  name,
  status,
  source_reference: {
    book: "PHB",
    chapter,
    section,
    page_hint: null,
  },
  summary,
  prerequisites,
  level_requirement,
  tags,
  related_ids,
  mechanical_effects,
  user_supplied_text: "",
  notes: "",
  verbatim_reference: "",
});

export const sections = [
  ["introduction", "Introduction concepts", "Introduction", "Account for ability scores, d20 resolution, proficiency, and advantage/disadvantage."],
  ["species", "Races and species", "Races", "Account for every playable PHB ancestry and subrace."],
  ["classes", "Classes", "Classes", "Account for every class, subclass, and feature progression."],
  ["backgrounds", "Backgrounds", "Personality and Background", "Account for skills, tools, equipment, feature, and characteristics."],
  ["equipment", "Equipment", "Equipment", "Account for weapons, armor, packs, gear, tools, mounts, and vehicles."],
  ["rules-combat", "Combat", "Combat", "Account for actions, movement, conditions, attack resolution, and damage."],
  ["rules-adventuring", "Adventuring", "Adventuring", "Account for exploration, travel, vision, resting, and environment rules."],
  ["rules-spellcasting", "Spellcasting", "Spellcasting", "Account for spellcasting rules, components, preparation, slots, and concentration."],
  ["spells", "Spell index", "Spells", "Reserve a complete structured slot for every PHB spell."],
  ["appendices", "Appendices and hooks", "Appendices", "Account for conditions, gods, planes, inspiration hooks, and future DMG/MM extension points."],
].map(([id, label, chapter, coverage_goal]) => ({ id, label, chapter, coverage_goal }));

export const coreConcepts = [
  "ability_scores",
  "ability_checks",
  "saving_throws",
  "attack_rolls",
  "difficulty_class",
  "advantage",
  "disadvantage",
  "proficiency_bonus",
  "contests",
  "passive_checks",
  "inspiration",
  "short_rest",
  "long_rest",
  "vision_and_light",
  "movement_and_position",
  "cover",
  "surprise",
  "concentration",
  "ritual_casting",
  "multiclassing_hook",
  "feats_hook",
].map((id) =>
  makeEntity({
    id: `rule-${id}`,
    entity_type: "rule",
    name: id.replace(/_/g, " "),
    chapter: "Introduction",
    section: "Core Concepts",
    summary: `Neutral placeholder for the ${id.replace(/_/g, " ")} rule.`,
    tags: ["core-rule"],
  }),
);

export const species = [
  {
    id: "dwarf",
    name: "Dwarf",
    subraces: ["hill-dwarf", "mountain-dwarf"],
    effects: [{ type: "speed", target: "walk", value: 25 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Dwarvish", value: true }],
  },
  {
    id: "elf",
    name: "Elf",
    subraces: ["high-elf", "wood-elf", "dark-elf"],
    effects: [{ type: "speed", target: "walk", value: 30 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Elvish", value: true }],
  },
  {
    id: "halfling",
    name: "Halfling",
    subraces: ["lightfoot-halfling", "stout-halfling"],
    effects: [{ type: "speed", target: "walk", value: 25 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Halfling", value: true }],
  },
  {
    id: "human",
    name: "Human",
    subraces: ["variant-human"],
    effects: [{ type: "speed", target: "walk", value: 30 }, { type: "language", target: "Common", value: true }, { type: "language_choice", target: "bonus-language", value: 1 }],
  },
  { id: "dragonborn", name: "Dragonborn", subraces: [], effects: [{ type: "speed", target: "walk", value: 30 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Draconic", value: true }] },
  { id: "gnome", name: "Gnome", subraces: ["forest-gnome", "rock-gnome"], effects: [{ type: "speed", target: "walk", value: 25 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Gnomish", value: true }] },
  { id: "half-elf", name: "Half-Elf", subraces: [], effects: [{ type: "speed", target: "walk", value: 30 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Elvish", value: true }, { type: "language_choice", target: "bonus-language", value: 1 }] },
  { id: "half-orc", name: "Half-Orc", subraces: [], effects: [{ type: "speed", target: "walk", value: 30 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Orc", value: true }] },
  { id: "tiefling", name: "Tiefling", subraces: [], effects: [{ type: "speed", target: "walk", value: 30 }, { type: "language", target: "Common", value: true }, { type: "language", target: "Infernal", value: true }] },
];

export const subraces = [
  ["hill-dwarf", "Hill Dwarf", "dwarf"],
  ["mountain-dwarf", "Mountain Dwarf", "dwarf"],
  ["high-elf", "High Elf", "elf"],
  ["wood-elf", "Wood Elf", "elf"],
  ["dark-elf", "Dark Elf (Drow)", "elf"],
  ["lightfoot-halfling", "Lightfoot Halfling", "halfling"],
  ["stout-halfling", "Stout Halfling", "halfling"],
  ["variant-human", "Variant Human", "human"],
  ["forest-gnome", "Forest Gnome", "gnome"],
  ["rock-gnome", "Rock Gnome", "gnome"],
].map(([id, name, parent]) =>
  makeEntity({
    id,
    entity_type: "subrace",
    name,
    chapter: "Races",
    section: parent,
    summary: `Placeholder for ${name}.`,
    tags: ["subrace"],
    related_ids: [parent],
  }),
);

export const classes = [
  {
    id: "barbarian",
    name: "Barbarian",
    hit_die: 12,
    resource: "rage",
    spellcasting: "none",
    subclasses: ["path-of-the-berserker", "path-of-the-totem-warrior"],
    features: {
      1: ["Rage", "Unarmored Defense"], 2: ["Reckless Attack", "Danger Sense"], 3: ["Primal Path"], 4: ["Ability Score Improvement"], 5: ["Extra Attack", "Fast Movement"], 6: ["Path feature"], 7: ["Feral Instinct"], 8: ["Ability Score Improvement"], 9: ["Brutal Critical"], 10: ["Path feature"], 11: ["Relentless Rage"], 12: ["Ability Score Improvement"], 13: ["Brutal Critical"], 14: ["Path feature"], 15: ["Persistent Rage"], 16: ["Ability Score Improvement"], 17: ["Brutal Critical"], 18: ["Indomitable Might"], 19: ["Ability Score Improvement"], 20: ["Primal Champion"],
    },
  },
  {
    id: "bard",
    name: "Bard",
    hit_die: 8,
    resource: "bardic inspiration",
    spellcasting: "full",
    subclasses: ["college-of-lore", "college-of-valor"],
    features: {
      1: ["Spellcasting", "Bardic Inspiration"], 2: ["Jack of All Trades", "Song of Rest"], 3: ["Bard College", "Expertise"], 4: ["Ability Score Improvement"], 5: ["Font of Inspiration"], 6: ["Countercharm", "College feature"], 7: [], 8: ["Ability Score Improvement"], 9: ["Song of Rest"], 10: ["Bardic Inspiration upgrade", "Expertise", "Magical Secrets"], 11: [], 12: ["Ability Score Improvement"], 13: ["Song of Rest"], 14: ["Magical Secrets", "College feature"], 15: ["Bardic Inspiration upgrade"], 16: ["Ability Score Improvement"], 17: ["Song of Rest"], 18: ["Magical Secrets"], 19: ["Ability Score Improvement"], 20: ["Superior Inspiration"],
    },
  },
  {
    id: "cleric",
    name: "Cleric",
    hit_die: 8,
    resource: "channel divinity",
    spellcasting: "full",
    subclasses: ["knowledge-domain", "life-domain", "light-domain", "nature-domain", "tempest-domain", "trickery-domain", "war-domain"],
    features: {
      1: ["Spellcasting", "Divine Domain"], 2: ["Channel Divinity"], 3: [], 4: ["Ability Score Improvement"], 5: ["Destroy Undead"], 6: ["Channel Divinity improvement", "Domain feature"], 7: [], 8: ["Ability Score Improvement", "Destroy Undead improvement", "Domain feature"], 9: [], 10: ["Divine Intervention"], 11: ["Destroy Undead improvement"], 12: ["Ability Score Improvement"], 13: ["Destroy Undead improvement"], 14: [], 15: ["Destroy Undead improvement"], 16: ["Ability Score Improvement"], 17: ["Destroy Undead improvement", "Domain feature"], 18: ["Channel Divinity improvement"], 19: ["Ability Score Improvement"], 20: ["Improved Divine Intervention"],
    },
  },
  {
    id: "druid",
    name: "Druid",
    hit_die: 8,
    resource: "wild shape",
    spellcasting: "full",
    subclasses: ["circle-of-the-land", "circle-of-the-moon"],
    features: {
      1: ["Druidic", "Spellcasting"], 2: ["Wild Shape", "Druid Circle"], 3: [], 4: ["Wild Shape improvement", "Ability Score Improvement"], 5: [], 6: ["Circle feature"], 7: [], 8: ["Wild Shape improvement", "Ability Score Improvement"], 9: [], 10: ["Circle feature"], 11: [], 12: ["Ability Score Improvement"], 13: [], 14: ["Circle feature"], 15: [], 16: ["Ability Score Improvement"], 17: [], 18: ["Timeless Body", "Beast Spells"], 19: ["Ability Score Improvement"], 20: ["Archdruid"],
    },
  },
  {
    id: "fighter",
    name: "Fighter",
    hit_die: 10,
    resource: "second wind",
    spellcasting: "subclass",
    subclasses: ["champion", "battle-master", "eldritch-knight"],
    features: {
      1: ["Fighting Style", "Second Wind"], 2: ["Action Surge"], 3: ["Martial Archetype"], 4: ["Ability Score Improvement"], 5: ["Extra Attack"], 6: ["Ability Score Improvement"], 7: ["Archetype feature"], 8: ["Ability Score Improvement"], 9: ["Indomitable"], 10: ["Archetype feature"], 11: ["Extra Attack improvement"], 12: ["Ability Score Improvement"], 13: ["Indomitable improvement"], 14: ["Ability Score Improvement"], 15: ["Archetype feature"], 16: ["Ability Score Improvement"], 17: ["Action Surge improvement", "Indomitable improvement"], 18: ["Archetype feature"], 19: ["Ability Score Improvement"], 20: ["Extra Attack improvement"],
    },
  },
  {
    id: "monk",
    name: "Monk",
    hit_die: 8,
    resource: "ki",
    spellcasting: "subclass",
    subclasses: ["way-of-the-open-hand", "way-of-shadow", "way-of-the-four-elements"],
    features: {
      1: ["Unarmored Defense", "Martial Arts"], 2: ["Ki", "Unarmored Movement"], 3: ["Monastic Tradition", "Deflect Missiles"], 4: ["Ability Score Improvement", "Slow Fall"], 5: ["Extra Attack", "Stunning Strike"], 6: ["Ki-Empowered Strikes", "Tradition feature", "Unarmored Movement improvement"], 7: ["Evasion", "Stillness of Mind"], 8: ["Ability Score Improvement"], 9: ["Unarmored Movement improvement"], 10: ["Purity of Body"], 11: ["Tradition feature"], 12: ["Ability Score Improvement"], 13: ["Tongue of the Sun and Moon"], 14: ["Diamond Soul"], 15: ["Timeless Body"], 16: ["Ability Score Improvement"], 17: ["Tradition feature"], 18: ["Empty Body"], 19: ["Ability Score Improvement"], 20: ["Perfect Self"],
    },
  },
  {
    id: "paladin",
    name: "Paladin",
    hit_die: 10,
    resource: "lay on hands",
    spellcasting: "half",
    subclasses: ["oath-of-devotion", "oath-of-the-ancients", "oath-of-vengeance"],
    features: {
      1: ["Divine Sense", "Lay on Hands"], 2: ["Fighting Style", "Spellcasting", "Divine Smite"], 3: ["Divine Health", "Sacred Oath"], 4: ["Ability Score Improvement"], 5: ["Extra Attack"], 6: ["Aura of Protection"], 7: ["Sacred Oath feature"], 8: ["Ability Score Improvement"], 9: [], 10: ["Aura of Courage"], 11: ["Improved Divine Smite"], 12: ["Ability Score Improvement"], 13: [], 14: ["Cleansing Touch"], 15: ["Sacred Oath feature"], 16: ["Ability Score Improvement"], 17: [], 18: ["Aura improvements"], 19: ["Ability Score Improvement"], 20: ["Sacred Oath feature"],
    },
  },
  {
    id: "ranger",
    name: "Ranger",
    hit_die: 10,
    resource: "favored enemy",
    spellcasting: "half",
    subclasses: ["hunter", "beast-master"],
    features: {
      1: ["Favored Enemy", "Natural Explorer"], 2: ["Fighting Style", "Spellcasting"], 3: ["Ranger Archetype", "Primeval Awareness"], 4: ["Ability Score Improvement"], 5: ["Extra Attack"], 6: ["Favored Enemy improvement", "Natural Explorer improvement"], 7: ["Archetype feature"], 8: ["Ability Score Improvement", "Land's Stride"], 9: [], 10: ["Natural Explorer improvement", "Hide in Plain Sight"], 11: ["Archetype feature"], 12: ["Ability Score Improvement"], 13: [], 14: ["Favored Enemy improvement", "Vanish"], 15: ["Archetype feature"], 16: ["Ability Score Improvement"], 17: [], 18: ["Feral Senses"], 19: ["Ability Score Improvement"], 20: ["Foe Slayer"],
    },
  },
  {
    id: "rogue",
    name: "Rogue",
    hit_die: 8,
    resource: "cunning action",
    spellcasting: "subclass",
    subclasses: ["thief", "assassin", "arcane-trickster"],
    features: {
      1: ["Expertise", "Sneak Attack", "Thieves' Cant"], 2: ["Cunning Action"], 3: ["Roguish Archetype"], 4: ["Ability Score Improvement"], 5: ["Uncanny Dodge"], 6: ["Expertise"], 7: ["Evasion"], 8: ["Ability Score Improvement"], 9: ["Archetype feature"], 10: ["Ability Score Improvement"], 11: ["Reliable Talent"], 12: ["Ability Score Improvement"], 13: ["Archetype feature"], 14: ["Blindsense"], 15: ["Slippery Mind"], 16: ["Ability Score Improvement"], 17: ["Archetype feature"], 18: ["Elusive"], 19: ["Ability Score Improvement"], 20: ["Stroke of Luck"],
    },
  },
  {
    id: "sorcerer",
    name: "Sorcerer",
    hit_die: 6,
    resource: "sorcery points",
    spellcasting: "full",
    subclasses: ["draconic-bloodline", "wild-magic"],
    features: {
      1: ["Spellcasting", "Sorcerous Origin"], 2: ["Font of Magic"], 3: ["Metamagic"], 4: ["Ability Score Improvement"], 5: [], 6: ["Origin feature"], 7: [], 8: ["Ability Score Improvement"], 9: [], 10: ["Metamagic"], 11: [], 12: ["Ability Score Improvement"], 13: [], 14: ["Origin feature"], 15: [], 16: ["Ability Score Improvement"], 17: ["Metamagic"], 18: ["Origin feature"], 19: ["Ability Score Improvement"], 20: ["Sorcerous Restoration"],
    },
  },
  {
    id: "warlock",
    name: "Warlock",
    hit_die: 8,
    resource: "pact magic",
    spellcasting: "pact",
    subclasses: ["the-archfey", "the-fiend", "the-great-old-one"],
    features: {
      1: ["Otherworldly Patron", "Pact Magic"], 2: ["Eldritch Invocations"], 3: ["Pact Boon"], 4: ["Ability Score Improvement"], 5: [], 6: ["Patron feature"], 7: [], 8: ["Ability Score Improvement"], 9: [], 10: ["Patron feature"], 11: ["Mystic Arcanum"], 12: ["Ability Score Improvement"], 13: ["Mystic Arcanum"], 14: ["Patron feature"], 15: ["Mystic Arcanum"], 16: ["Ability Score Improvement"], 17: ["Mystic Arcanum"], 18: [], 19: ["Ability Score Improvement"], 20: ["Eldritch Master"],
    },
  },
  {
    id: "wizard",
    name: "Wizard",
    hit_die: 6,
    resource: "arcane recovery",
    spellcasting: "full",
    subclasses: ["school-of-abjuration", "school-of-conjuration", "school-of-divination", "school-of-enchantment", "school-of-evocation", "school-of-illusion", "school-of-necromancy", "school-of-transmutation"],
    features: {
      1: ["Spellcasting", "Arcane Recovery"], 2: ["Arcane Tradition"], 3: [], 4: ["Ability Score Improvement"], 5: [], 6: ["Tradition feature"], 7: [], 8: ["Ability Score Improvement"], 9: [], 10: ["Tradition feature"], 11: [], 12: ["Ability Score Improvement"], 13: [], 14: ["Tradition feature"], 15: [], 16: ["Ability Score Improvement"], 17: [], 18: ["Spell Mastery"], 19: ["Ability Score Improvement"], 20: ["Signature Spells"],
    },
  },
];

export const subclasses = [
  ["path-of-the-berserker", "Path of the Berserker", "barbarian"],
  ["path-of-the-totem-warrior", "Path of the Totem Warrior", "barbarian"],
  ["college-of-lore", "College of Lore", "bard"],
  ["college-of-valor", "College of Valor", "bard"],
  ["knowledge-domain", "Knowledge Domain", "cleric"],
  ["life-domain", "Life Domain", "cleric"],
  ["light-domain", "Light Domain", "cleric"],
  ["nature-domain", "Nature Domain", "cleric"],
  ["tempest-domain", "Tempest Domain", "cleric"],
  ["trickery-domain", "Trickery Domain", "cleric"],
  ["war-domain", "War Domain", "cleric"],
  ["circle-of-the-land", "Circle of the Land", "druid"],
  ["circle-of-the-moon", "Circle of the Moon", "druid"],
  ["champion", "Champion", "fighter"],
  ["battle-master", "Battle Master", "fighter"],
  ["eldritch-knight", "Eldritch Knight", "fighter"],
  ["way-of-the-open-hand", "Way of the Open Hand", "monk"],
  ["way-of-shadow", "Way of Shadow", "monk"],
  ["way-of-the-four-elements", "Way of the Four Elements", "monk"],
  ["oath-of-devotion", "Oath of Devotion", "paladin"],
  ["oath-of-the-ancients", "Oath of the Ancients", "paladin"],
  ["oath-of-vengeance", "Oath of Vengeance", "paladin"],
  ["hunter", "Hunter", "ranger"],
  ["beast-master", "Beast Master", "ranger"],
  ["thief", "Thief", "rogue"],
  ["assassin", "Assassin", "rogue"],
  ["arcane-trickster", "Arcane Trickster", "rogue"],
  ["draconic-bloodline", "Draconic Bloodline", "sorcerer"],
  ["wild-magic", "Wild Magic", "sorcerer"],
  ["the-archfey", "The Archfey", "warlock"],
  ["the-fiend", "The Fiend", "warlock"],
  ["the-great-old-one", "The Great Old One", "warlock"],
  ["school-of-abjuration", "School of Abjuration", "wizard"],
  ["school-of-conjuration", "School of Conjuration", "wizard"],
  ["school-of-divination", "School of Divination", "wizard"],
  ["school-of-enchantment", "School of Enchantment", "wizard"],
  ["school-of-evocation", "School of Evocation", "wizard"],
  ["school-of-illusion", "School of Illusion", "wizard"],
  ["school-of-necromancy", "School of Necromancy", "wizard"],
  ["school-of-transmutation", "School of Transmutation", "wizard"],
].map(([id, name, parent]) =>
  makeEntity({
    id,
    entity_type: "subclass",
    name,
    chapter: "Classes",
    section: parent,
    summary: `Subclass placeholder for ${name}.`,
    tags: ["subclass"],
    related_ids: [parent],
  }),
);

export const backgrounds = [
  "Acolyte", "Charlatan", "Criminal", "Entertainer", "Folk Hero", "Guild Artisan", "Hermit", "Noble", "Outlander", "Sage", "Sailor", "Soldier", "Urchin",
].map((name) =>
  makeEntity({
    id: `background-${name.toLowerCase().replace(/\s+/g, "-")}`,
    entity_type: "background",
    name,
    chapter: "Personality and Background",
    section: "Backgrounds",
    summary: `Background placeholder for ${name}.`,
    tags: ["background"],
  }),
);

export const feats = [
  "Actor", "Alert", "Athlete", "Charger", "Crossbow Expert", "Defensive Duelist", "Dual Wielder", "Dungeon Delver", "Durable", "Elemental Adept", "Great Weapon Master", "Healer", "Heavily Armored", "Heavy Armor Master", "Inspiring Leader", "Keen Mind", "Lightly Armored", "Linguist", "Lucky", "Mage Slayer", "Magic Initiate", "Martial Adept", "Medium Armor Master", "Mobile", "Moderately Armored", "Mounted Combatant", "Observant", "Polearm Master", "Resilient", "Ritual Caster", "Savage Attacker", "Sentinel", "Sharpshooter", "Shield Master", "Skilled", "Skulker", "Spell Sniper", "Tavern Brawler", "Tough", "War Caster", "Weapon Master",
].map((name) =>
  makeEntity({
    id: `feat-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    entity_type: "feat",
    name,
    chapter: "Customization Options",
    section: "Feats",
    summary: `Feat placeholder for ${name}.`,
    tags: ["feat"],
  }),
);

export const equipment = {
  weapons: ["Club", "Dagger", "Greatclub", "Handaxe", "Javelin", "Light Hammer", "Mace", "Quarterstaff", "Sickle", "Spear", "Light Crossbow", "Dart", "Shortbow", "Sling", "Battleaxe", "Flail", "Glaive", "Greataxe", "Greatsword", "Halberd", "Lance", "Longsword", "Maul", "Morningstar", "Pike", "Rapier", "Scimitar", "Shortsword", "Trident", "War Pick", "Warhammer", "Whip", "Blowgun", "Hand Crossbow", "Heavy Crossbow", "Longbow", "Net"],
  armor: ["Padded", "Leather", "Studded Leather", "Hide", "Chain Shirt", "Scale Mail", "Breastplate", "Half Plate", "Ring Mail", "Chain Mail", "Splint", "Plate", "Shield"],
  packs: ["Burglar's Pack", "Diplomat's Pack", "Dungeoneer's Pack", "Entertainer's Pack", "Explorer's Pack", "Priest's Pack", "Scholar's Pack"],
  tools: ["Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools", "Dice Set", "Dragonchess Set", "Playing Card Set", "Three-Dragon Ante Set", "Bagpipes", "Drum", "Dulcimer", "Flute", "Lute", "Lyre", "Horn", "Pan Flute", "Shawm", "Viol", "Navigator's Tools", "Poisoner's Kit", "Disguise Kit", "Forgery Kit", "Herbalism Kit", "Thieves' Tools", "Vehicles (Land)", "Vehicles (Water)"],
  mounts: ["Camel", "Donkey or Mule", "Elephant", "Horse, Draft", "Horse, Riding", "Mastiff", "Pony", "Warhorse"],
  vehicles: ["Carriage", "Cart", "Chariot", "Sled", "Wagon", "Galley", "Keelboat", "Longship", "Rowboat", "Sailing Ship", "Warship"],
};

export const conditions = ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];

export const combatTopics = ["initiative", "surprise", "turn_order", "movement", "breaking_up_movement", "difficult_terrain", "being_prone", "flying_movement", "swimming", "climbing", "actions", "bonus_actions", "reactions", "melee_attacks", "ranged_attacks", "opportunity_attacks", "grappling", "shoving", "two_weapon_fighting", "cover", "healing", "dropping_to_zero_hit_points", "death_saving_throws", "mounted_combat", "underwater_combat"];

export const adventuringTopics = ["time", "travel_pace", "marching_order", "stealth_while_traveling", "noticing_threats", "foraging", "tracking", "vision", "light_sources", "food_and_water", "suffocating", "falling", "resting", "short_rest", "long_rest", "lifestyle_expenses", "social_interaction", "environmental_hazards"];

export const spellcastingTopics = ["spell_slots", "casting_at_higher_levels", "known_vs_prepared", "rituals", "concentration", "components", "material_components", "spell_attack_rolls", "saving_throw_spells", "combining_magical_effects", "schools_of_magic", "casting_time", "range", "duration", "targets", "areas_of_effect"];

export const spellPlaceholders = Array.from({ length: 361 }, (_, index) =>
  makeEntity({
    id: `phb-spell-${String(index + 1).padStart(3, "0")}`,
    entity_type: "spell",
    name: `PHB Spell Slot ${String(index + 1).padStart(3, "0")}`,
    chapter: "Spells",
    section: "Spell Descriptions",
    summary: "Placeholder slot for one PHB spell. The owner can supply canonical name and structured mechanics.",
    tags: ["spell", "placeholder"],
    related_ids: ["spellcasting-spell_slots", "spellcasting-components", "spellcasting-concentration"],
  }),
);

export const expectedCounts = {
  core_rules: coreConcepts.length,
  species: species.length,
  subraces: subraces.length,
  classes: classes.length,
  subclasses: subclasses.length,
  backgrounds: backgrounds.length,
  feats: feats.length,
  weapons: equipment.weapons.length,
  armor: equipment.armor.length,
  packs: equipment.packs.length,
  tools: equipment.tools.length,
  mounts: equipment.mounts.length,
  vehicles: equipment.vehicles.length,
  conditions: conditions.length,
  combat_topics: combatTopics.length,
  adventuring_topics: adventuringTopics.length,
  spellcasting_topics: spellcastingTopics.length,
  spells: spellPlaceholders.length,
};

export const buildEntities = () => {
  const speciesEntities = species.map((entry) =>
    makeEntity({
      id: entry.id,
      entity_type: "race",
      name: entry.name,
      chapter: "Races",
      section: "Playable Races",
      summary: `Playable ancestry placeholder for ${entry.name}.`,
      tags: ["race"],
      related_ids: entry.subraces,
      mechanical_effects: entry.effects,
    }),
  );

  const classEntities = classes.flatMap((entry) => {
    const classEntity = makeEntity({
      id: entry.id,
      entity_type: "class",
      name: entry.name,
      chapter: "Classes",
      section: "Classes",
      summary: `Class placeholder for ${entry.name}.`,
      tags: ["class", `spellcasting:${entry.spellcasting}`],
      related_ids: entry.subclasses,
      mechanical_effects: [
        { type: "hit_die", target: entry.id, value: entry.hit_die, duration: null, condition: null, scaling: null, notes: "" },
        { type: "class_resource", target: entry.resource, value: true, duration: null, condition: null, scaling: "level-based", notes: "" },
      ],
    });

    const features = Object.entries(entry.features).flatMap(([level, names]) =>
      names.map((name) => makeFeature(entry.id, Number(level), name)),
    );

    return [classEntity, ...features];
  });

  const equipmentEntities = [
    ...equipment.weapons.map((name) =>
      makeEntity({
        id: `weapon-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        entity_type: "weapon",
        name,
        chapter: "Equipment",
        section: "Weapons",
        summary: `Weapon placeholder for ${name}.`,
        tags: ["weapon"],
      }),
    ),
    ...equipment.armor.map((name) =>
      makeEntity({
        id: `armor-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        entity_type: "armor",
        name,
        chapter: "Equipment",
        section: "Armor",
        summary: `Armor placeholder for ${name}.`,
        tags: ["armor"],
      }),
    ),
    ...equipment.packs.map((name) =>
      makeEntity({
        id: `pack-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        entity_type: "pack",
        name,
        chapter: "Equipment",
        section: "Packs",
        summary: `Pack placeholder for ${name}.`,
        tags: ["pack"],
      }),
    ),
    ...equipment.tools.map((name) =>
      makeEntity({
        id: `tool-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        entity_type: "tool",
        name,
        chapter: "Equipment",
        section: "Tools",
        summary: `Tool placeholder for ${name}.`,
        tags: ["tool"],
      }),
    ),
    ...equipment.mounts.map((name) =>
      makeEntity({
        id: `mount-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        entity_type: "mount",
        name,
        chapter: "Equipment",
        section: "Mounts",
        summary: `Mount placeholder for ${name}.`,
        tags: ["mount"],
      }),
    ),
    ...equipment.vehicles.map((name) =>
      makeEntity({
        id: `vehicle-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        entity_type: "vehicle",
        name,
        chapter: "Equipment",
        section: "Vehicles",
        summary: `Vehicle placeholder for ${name}.`,
        tags: ["vehicle"],
      }),
    ),
  ];

  const conditionEntities = conditions.map((name) =>
    makeEntity({
      id: `condition-${name.toLowerCase()}`,
      entity_type: "condition",
      name,
      chapter: "Appendix",
      section: "Conditions",
      summary: `Condition placeholder for ${name}.`,
      tags: ["condition"],
    }),
  );

  const topicEntities = [
    ...combatTopics.map((topic) =>
      makeEntity({
        id: `combat-${topic}`,
        entity_type: "action",
        name: topic.replace(/_/g, " "),
        chapter: "Combat",
        section: "Combat Topics",
        summary: `Combat rule placeholder for ${topic.replace(/_/g, " ")}.`,
        tags: ["combat-topic"],
      }),
    ),
    ...adventuringTopics.map((topic) =>
      makeEntity({
        id: `adventuring-${topic}`,
        entity_type: "rule",
        name: topic.replace(/_/g, " "),
        chapter: "Adventuring",
        section: "Adventuring Topics",
        summary: `Adventuring rule placeholder for ${topic.replace(/_/g, " ")}.`,
        tags: ["adventuring-topic"],
      }),
    ),
    ...spellcastingTopics.map((topic) =>
      makeEntity({
        id: `spellcasting-${topic}`,
        entity_type: "rule",
        name: topic.replace(/_/g, " "),
        chapter: "Spellcasting",
        section: "Spellcasting Topics",
        summary: `Spellcasting rule placeholder for ${topic.replace(/_/g, " ")}.`,
        tags: ["spellcasting-topic"],
      }),
    ),
  ];

  return [
    ...coreConcepts,
    ...speciesEntities,
    ...subraces,
    ...classEntities,
    ...subclasses,
    ...backgrounds,
    ...feats,
    ...equipmentEntities,
    ...conditionEntities,
    ...topicEntities,
    ...spellPlaceholders,
  ];
};
