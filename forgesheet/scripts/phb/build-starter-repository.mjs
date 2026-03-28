import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const skillOption = (id, label = id) => ({ id, label, type: "skill" });
const featOption = (id, label) => ({ id, label, type: "feat" });

const text = (short, detail = "") => ({
  short,
  ...(detail ? { detail } : {}),
  legalStatus: "open",
});

const species = [
  { id: "dragonborn", name: "Dragonborn", lineage: "Dragonborn", speed: 30, size: "Medium", languages: ["Common", "Draconic"], abilityBonuses: { strength: 2, charisma: 1 }, traits: [text("Breath weapon and draconic resistance are owner-completable placeholders.")], variantFlags: ["phb-draconic-ancestry-choice-pending"] },
  { id: "hill-dwarf", name: "Hill Dwarf", lineage: "Dwarf", speed: 25, size: "Medium", languages: ["Common", "Dwarvish"], abilityBonuses: { constitution: 2, wisdom: 1 }, traits: [text("Darkvision, Dwarven Resilience, and Dwarven Toughness.") ] },
  { id: "mountain-dwarf", name: "Mountain Dwarf", lineage: "Dwarf", speed: 25, size: "Medium", languages: ["Common", "Dwarvish"], abilityBonuses: { constitution: 2, strength: 2 }, traits: [text("Darkvision, Dwarven Resilience, and armor training.") ] },
  { id: "high-elf", name: "High Elf", lineage: "Elf", speed: 30, size: "Medium", languages: ["Common", "Elvish"], abilityBonuses: { dexterity: 2, intelligence: 1 }, traits: [text("Darkvision, Keen Senses, Fey Ancestry, Trance, and a cantrip choice.")], variantFlags: ["species_cantrip_choice_pending_full_spell_ingestion"] },
  { id: "wood-elf", name: "Wood Elf", lineage: "Elf", speed: 35, size: "Medium", languages: ["Common", "Elvish"], abilityBonuses: { dexterity: 2, wisdom: 1 }, traits: [text("Darkvision, Keen Senses, Fey Ancestry, Trance, and Mask of the Wild.") ] },
  { id: "dark-elf", name: "Dark Elf (Drow)", lineage: "Elf", speed: 30, size: "Medium", languages: ["Common", "Elvish"], abilityBonuses: { dexterity: 2, charisma: 1 }, traits: [text("Superior darkvision, sunlight sensitivity, and drow magic placeholders.") ], variantFlags: ["species_spell_choice_pending_full_spell_ingestion"] },
  { id: "forest-gnome", name: "Forest Gnome", lineage: "Gnome", speed: 25, size: "Small", languages: ["Common", "Gnomish"], abilityBonuses: { intelligence: 2, dexterity: 1 }, traits: [text("Darkvision, Gnome Cunning, and minor illusion or beast-speech placeholders.") ] },
  { id: "rock-gnome", name: "Rock Gnome", lineage: "Gnome", speed: 25, size: "Small", languages: ["Common", "Gnomish"], abilityBonuses: { intelligence: 2, constitution: 1 }, traits: [text("Darkvision, Gnome Cunning, and artificer-style lore hooks.") ] },
  { id: "half-elf", name: "Half-Elf", lineage: "Half-Elf", speed: 30, size: "Medium", languages: ["Common", "Elvish", "Choice"], abilityBonuses: { charisma: 2 }, traits: [text("Two floating +1 ability increases, Fey Ancestry, and Skill Versatility placeholders.")], choices: [{ id: "half-elf-flex", label: "Flexible ability bonuses", choose: 2, options: ["strength","dexterity","constitution","intelligence","wisdom","charisma"].map((ability) => ({ id: ability, label: ability[0].toUpperCase()+ability.slice(1), type: "equipment" })) }] },
  { id: "half-orc", name: "Half-Orc", lineage: "Half-Orc", speed: 30, size: "Medium", languages: ["Common", "Orc"], abilityBonuses: { strength: 2, constitution: 1 }, traits: [text("Darkvision, Relentless Endurance, and Savage Attacks.") ] },
  { id: "lightfoot-halfling", name: "Lightfoot Halfling", lineage: "Halfling", speed: 25, size: "Small", languages: ["Common", "Halfling"], abilityBonuses: { dexterity: 2, charisma: 1 }, traits: [text("Lucky, Brave, Halfling Nimbleness, and naturally stealthy play.") ] },
  { id: "stout-halfling", name: "Stout Halfling", lineage: "Halfling", speed: 25, size: "Small", languages: ["Common", "Halfling"], abilityBonuses: { dexterity: 2, constitution: 1 }, traits: [text("Lucky, Brave, Halfling Nimbleness, and stout resilience.") ] },
  { id: "human", name: "Human", lineage: "Human", speed: 30, size: "Medium", languages: ["Common", "Choice"], abilityBonuses: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 }, traits: [text("Baseline human versatility with one bonus language.") ] },
  { id: "variant-human", name: "Variant Human", lineage: "Human", speed: 30, size: "Medium", languages: ["Common", "Choice"], traits: [text("Flexible ability boosts, one feat, and one bonus skill placeholder.")], variantFlags: ["variant-human"], choices: [{ id: "variant-human-feat", label: "Bonus feat", choose: 1, options: [] }] },
  { id: "tiefling", name: "Tiefling", lineage: "Tiefling", speed: 30, size: "Medium", languages: ["Common", "Infernal"], abilityBonuses: { intelligence: 1, charisma: 2 }, traits: [text("Darkvision, fire resistance, and infernal legacy placeholders.")], variantFlags: ["species_spell_choice_pending_full_spell_ingestion"] },
];

const subclasses = [
  ["barbarian", 3, "Path of the Berserker"], ["barbarian", 3, "Path of the Totem Warrior"],
  ["bard", 3, "College of Lore"], ["bard", 3, "College of Valor"],
  ["cleric", 1, "Knowledge Domain"], ["cleric", 1, "Life Domain"], ["cleric", 1, "Light Domain"], ["cleric", 1, "Nature Domain"], ["cleric", 1, "Tempest Domain"], ["cleric", 1, "Trickery Domain"], ["cleric", 1, "War Domain"],
  ["druid", 2, "Circle of the Land"], ["druid", 2, "Circle of the Moon"],
  ["fighter", 3, "Champion"], ["fighter", 3, "Battle Master"], ["fighter", 3, "Eldritch Knight"],
  ["monk", 3, "Way of the Open Hand"], ["monk", 3, "Way of Shadow"], ["monk", 3, "Way of the Four Elements"],
  ["paladin", 3, "Oath of Devotion"], ["paladin", 3, "Oath of the Ancients"], ["paladin", 3, "Oath of Vengeance"],
  ["ranger", 3, "Hunter"], ["ranger", 3, "Beast Master"],
  ["rogue", 3, "Thief"], ["rogue", 3, "Assassin"], ["rogue", 3, "Arcane Trickster"],
  ["sorcerer", 1, "Draconic Bloodline"], ["sorcerer", 1, "Wild Magic"],
  ["warlock", 1, "The Archfey"], ["warlock", 1, "The Fiend"], ["warlock", 1, "The Great Old One"],
  ["wizard", 2, "School of Abjuration"], ["wizard", 2, "School of Conjuration"], ["wizard", 2, "School of Divination"], ["wizard", 2, "School of Enchantment"], ["wizard", 2, "School of Evocation"], ["wizard", 2, "School of Illusion"], ["wizard", 2, "School of Necromancy"], ["wizard", 2, "School of Transmutation"],
].map(([classId, unlockLevel, name]) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  classId,
  name,
  source: "PHB-compatible starter catalog",
  unlockLevel,
  text: text("Subclass shell with owner-completable feature text."),
  features: [{ level: unlockLevel, name: `${name} feature set`, text: text("Subclass feature placeholders unlock here.") }],
}));

const classes = [
  { id: "barbarian", name: "Barbarian", hitDie: 12, subclassLevel: 3, primaryAbilities: ["strength","constitution"], savingThrows: ["strength","constitution"], skillChoices: ["animalHandling","athletics","intimidation","nature","perception","survival"], armor: ["Light armor","Medium armor","Shields"], weapons: ["Simple weapons","Martial weapons"], tools: [], equipmentOptions: ["greataxe","handaxe","explorers-pack"], spellcasting: { progression: "none", ability: null, preparesFromClassList: false }, features: ["Rage","Unarmored Defense"] },
  { id: "bard", name: "Bard", hitDie: 8, subclassLevel: 3, primaryAbilities: ["charisma"], savingThrows: ["dexterity","charisma"], skillChoices: ["acrobatics","animalHandling","arcana","athletics","deception","history","insight","intimidation","investigation","medicine","nature","perception","performance","persuasion","religion","sleightOfHand","stealth","survival"], armor: ["Light armor"], weapons: ["Simple weapons","Hand crossbows","Longswords","Rapiers","Shortswords"], tools: ["Three musical instruments"], equipmentOptions: ["rapier","lute","diplomats-pack"], spellcasting: { progression: "full", ability: "charisma", preparesFromClassList: false }, features: ["Spellcasting","Bardic Inspiration"] },
  { id: "cleric", name: "Cleric", hitDie: 8, subclassLevel: 1, primaryAbilities: ["wisdom"], savingThrows: ["wisdom","charisma"], skillChoices: ["history","insight","medicine","persuasion","religion"], armor: ["Light armor","Medium armor","Shields"], weapons: ["Simple weapons"], tools: [], equipmentOptions: ["scale-mail","mace","priests-pack"], spellcasting: { progression: "full", ability: "wisdom", preparesFromClassList: true }, features: ["Spellcasting","Divine Domain"] },
  { id: "druid", name: "Druid", hitDie: 8, subclassLevel: 2, primaryAbilities: ["wisdom"], savingThrows: ["intelligence","wisdom"], skillChoices: ["arcana","animalHandling","insight","medicine","nature","perception","religion","survival"], armor: ["Light armor","Medium armor","Shields"], weapons: ["Clubs","Daggers","Darts","Javelins","Maces","Quarterstaffs","Scimitars","Sickles","Slings","Spears"], tools: ["Herbalism kit"], equipmentOptions: ["wooden-shield","scimitar","explorers-pack"], spellcasting: { progression: "full", ability: "wisdom", preparesFromClassList: true }, features: ["Druidic","Spellcasting"] },
  { id: "fighter", name: "Fighter", hitDie: 10, subclassLevel: 3, primaryAbilities: ["strength","dexterity"], savingThrows: ["strength","constitution"], skillChoices: ["acrobatics","animalHandling","athletics","history","insight","intimidation","perception","survival"], armor: ["Light armor","Medium armor","Heavy armor","Shields"], weapons: ["Simple weapons","Martial weapons"], tools: [], equipmentOptions: ["chain-mail","longsword","explorers-pack"], spellcasting: { progression: "none", ability: null, preparesFromClassList: false }, features: ["Fighting Style","Second Wind"] },
  { id: "monk", name: "Monk", hitDie: 8, subclassLevel: 3, primaryAbilities: ["dexterity","wisdom"], savingThrows: ["strength","dexterity"], skillChoices: ["acrobatics","athletics","history","insight","religion","stealth"], armor: [], weapons: ["Simple weapons","Shortswords"], tools: ["One artisan's tool or one musical instrument"], equipmentOptions: ["shortsword","dungeoneers-pack"], spellcasting: { progression: "none", ability: null, preparesFromClassList: false }, features: ["Unarmored Defense","Martial Arts"] },
  { id: "paladin", name: "Paladin", hitDie: 10, subclassLevel: 3, primaryAbilities: ["strength","charisma"], savingThrows: ["wisdom","charisma"], skillChoices: ["athletics","insight","intimidation","medicine","persuasion","religion"], armor: ["Light armor","Medium armor","Heavy armor","Shields"], weapons: ["Simple weapons","Martial weapons"], tools: [], equipmentOptions: ["chain-mail","shield","priests-pack"], spellcasting: { progression: "half", ability: "charisma", preparesFromClassList: true }, features: ["Divine Sense","Lay on Hands"] },
  { id: "ranger", name: "Ranger", hitDie: 10, subclassLevel: 3, primaryAbilities: ["dexterity","wisdom"], savingThrows: ["strength","dexterity"], skillChoices: ["animalHandling","athletics","insight","investigation","nature","perception","stealth","survival"], armor: ["Light armor","Medium armor","Shields"], weapons: ["Simple weapons","Martial weapons"], tools: [], equipmentOptions: ["scale-mail","longbow","explorers-pack"], spellcasting: { progression: "half", ability: "wisdom", preparesFromClassList: false }, features: ["Favored Enemy","Natural Explorer"] },
  { id: "rogue", name: "Rogue", hitDie: 8, subclassLevel: 3, primaryAbilities: ["dexterity"], savingThrows: ["dexterity","intelligence"], skillChoices: ["acrobatics","athletics","deception","insight","intimidation","investigation","perception","performance","persuasion","sleightOfHand","stealth"], armor: ["Light armor"], weapons: ["Simple weapons","Hand crossbows","Longswords","Rapiers","Shortswords"], tools: ["Thieves' tools"], equipmentOptions: ["rapier","shortbow","burglars-pack"], spellcasting: { progression: "none", ability: null, preparesFromClassList: false }, features: ["Expertise","Sneak Attack","Thieves' Cant"] },
  { id: "sorcerer", name: "Sorcerer", hitDie: 6, subclassLevel: 1, primaryAbilities: ["charisma"], savingThrows: ["constitution","charisma"], skillChoices: ["arcana","deception","insight","intimidation","persuasion","religion"], armor: [], weapons: ["Daggers","Darts","Slings","Quarterstaffs","Light crossbows"], tools: [], equipmentOptions: ["light-crossbow","component-pouch","dungeoneers-pack"], spellcasting: { progression: "full", ability: "charisma", preparesFromClassList: false }, features: ["Spellcasting","Sorcerous Origin"] },
  { id: "warlock", name: "Warlock", hitDie: 8, subclassLevel: 1, primaryAbilities: ["charisma"], savingThrows: ["wisdom","charisma"], skillChoices: ["arcana","deception","history","intimidation","investigation","nature","religion"], armor: ["Light armor"], weapons: ["Simple weapons"], tools: [], equipmentOptions: ["light-crossbow","component-pouch","scholars-pack"], spellcasting: { progression: "full", ability: "charisma", preparesFromClassList: false }, features: ["Otherworldly Patron","Pact Magic"] },
  { id: "wizard", name: "Wizard", hitDie: 6, subclassLevel: 2, primaryAbilities: ["intelligence"], savingThrows: ["intelligence","wisdom"], skillChoices: ["arcana","history","insight","investigation","medicine","religion"], armor: [], weapons: ["Daggers","Darts","Slings","Quarterstaffs","Light crossbows"], tools: [], equipmentOptions: ["quarterstaff","spellbook","scholars-pack"], spellcasting: { progression: "full", ability: "intelligence", preparesFromClassList: true }, features: ["Spellcasting","Arcane Recovery"] },
].map((klass) => ({
  id: klass.id,
  name: klass.name,
  source: "PHB-compatible starter catalog",
  hitDie: klass.hitDie,
  subclassLevel: klass.subclassLevel,
  primaryAbilities: klass.primaryAbilities,
  savingThrows: klass.savingThrows,
  skillChoices: { id: `${klass.id}-skills`, label: `${klass.name} skills`, choose: klass.id === "rogue" ? 4 : klass.id === "bard" ? 3 : 2, options: klass.skillChoices.map((skill) => skillOption(skill, skill.replace(/([A-Z])/g, " $1").replace(/^./, (match) => match.toUpperCase()))) },
  armorProficiencies: klass.armor,
  weaponProficiencies: klass.weapons,
  toolProficiencies: klass.tools,
  equipmentOptions: klass.equipmentOptions,
  subclasses: subclasses.filter((entry) => entry.classId === klass.id).map((entry) => entry.id),
  spellcasting: klass.spellcasting,
  features: klass.features.map((feature) => ({ level: 1, name: feature, text: text(`${feature} placeholder summary.`) })),
}));

const backgrounds = [
  ["acolyte", "Acolyte", ["insight","religion"], [], ["Choice","Choice"], ["holy-symbol","prayer-book"], "Faith-community shelter and temple ties."],
  ["charlatan", "Charlatan", ["deception","sleightOfHand"], ["Disguise kit","Forgery kit"], [], ["fine-clothes","disguise-kit"], "False identity and confidence-game support."],
  ["criminal", "Criminal", ["deception","stealth"], ["Gaming set","Thieves' tools"], [], ["crowbar","dark-clothes"], "Criminal contact network."],
  ["entertainer", "Entertainer", ["acrobatics","performance"], ["Disguise kit","Musical instrument"], [], ["costume","musical-instrument"], "By popular demand lifestyle access."],
  ["folk-hero", "Folk Hero", ["animalHandling","survival"], ["Artisan's tools","Vehicles (land)"], [], ["artisan-tools","shovel"], "Rustic hospitality and local goodwill."],
  ["guild-artisan", "Guild Artisan", ["insight","persuasion"], ["Artisan's tools"], ["Choice"], ["artisan-tools","letter-of-introduction"], "Guild membership and trade support."],
  ["hermit", "Hermit", ["medicine","religion"], ["Herbalism kit"], ["Choice"], ["scroll-case","winter-blanket"], "Discovery tied to isolation and study."],
  ["noble", "Noble", ["history","persuasion"], ["Gaming set"], ["Choice"], ["fine-clothes","signet-ring"], "Position of privilege."],
  ["outlander", "Outlander", ["athletics","survival"], ["Musical instrument"], ["Choice"], ["staff","hunting-trap"], "Wanderer memory for maps and terrain."],
  ["sage", "Sage", ["arcana","history"], [], ["Choice","Choice"], ["ink-bottle","quill"], "Researcher access to knowledge paths."],
  ["sailor", "Sailor", ["athletics","perception"], ["Navigator's tools","Vehicles (water)"], [], ["belaying-pin","silk-rope"], "Ship's passage and seafaring credibility."],
  ["soldier", "Soldier", ["athletics","intimidation"], ["Gaming set","Vehicles (land)"], [], ["insignia","dice-set"], "Military rank and command familiarity."],
  ["urchin", "Urchin", ["sleightOfHand","stealth"], ["Disguise kit","Thieves' tools"], [], ["small-knife","map-of-city"], "City secrets and movement through streets."],
].map(([id, name, skills, tools, languages, equipment, trait]) => ({
  id, name, source: "PHB-compatible starter catalog", skillProficiencies: skills, toolProficiencies: tools, languages, equipment, trait: text(trait),
}));

const feats = [
  "Actor","Alert","Athlete","Charger","Crossbow Expert","Defensive Duelist","Dual Wielder","Dungeon Delver","Durable","Elemental Adept","Great Weapon Master","Healer","Heavily Armored","Heavy Armor Master","Inspiring Leader","Keen Mind","Lightly Armored","Linguist","Lucky","Mage Slayer","Magic Initiate","Martial Adept","Medium Armor Master","Mobile","Moderately Armored","Mounted Combatant","Observant","Polearm Master","Resilient","Ritual Caster","Savage Attacker","Sentinel","Sharpshooter","Shield Master","Skilled","Skulker","Spell Sniper","Tavern Brawler","Tough","War Caster","Weapon Master",
].map((name) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  source: "PHB-compatible starter catalog",
  summary: text(`${name} feat placeholder with owner-supplied mechanics.`),
}));

const spells = [
  { id: "fire-bolt", name: "Fire Bolt", level: 0, school: "Evocation", classes: ["wizard","sorcerer"], text: text("Ranged fire cantrip placeholder.") },
  { id: "light", name: "Light", level: 0, school: "Evocation", classes: ["bard","cleric","wizard","sorcerer"], text: text("Creates bright light on an object.") },
  { id: "guidance", name: "Guidance", level: 0, school: "Divination", classes: ["cleric","druid"], text: text("Adds a small bonus to one ability check.") },
  { id: "cure-wounds", name: "Cure Wounds", level: 1, school: "Evocation", classes: ["bard","cleric","druid","paladin","ranger"], text: text("Restorative touch placeholder.") },
  { id: "bless", name: "Bless", level: 1, school: "Enchantment", classes: ["cleric","paladin"], text: text("Bolsters attacks and saving throws.") },
  { id: "magic-missile", name: "Magic Missile", level: 1, school: "Evocation", classes: ["wizard","sorcerer"], text: text("Creates force darts that hit automatically.") },
  { id: "mage-armor", name: "Mage Armor", level: 1, school: "Abjuration", classes: ["wizard","sorcerer"], text: text("Sets a protective AC formula.") },
  { id: "hex", name: "Hex", level: 1, school: "Enchantment", classes: ["warlock"], text: text("Marks a target for extra curse damage.") },
  { id: "eldritch-blast", name: "Eldritch Blast", level: 0, school: "Evocation", classes: ["warlock"], text: text("Signature force cantrip placeholder.") },
];

const weapons = [
  ["club","Club","1d4 bludgeoning",[]],["dagger","Dagger","1d4 piercing",["Finesse","Light","Thrown (20/60)"]],["greatclub","Greatclub","1d8 bludgeoning",["Two-Handed"]],["handaxe","Handaxe","1d6 slashing",["Light","Thrown (20/60)"]],["javelin","Javelin","1d6 piercing",["Thrown (30/120)"]],["light-hammer","Light Hammer","1d4 bludgeoning",["Light","Thrown (20/60)"]],["mace","Mace","1d6 bludgeoning",[]],["quarterstaff","Quarterstaff","1d6 bludgeoning",["Versatile (1d8)"]],["sickle","Sickle","1d4 slashing",["Light"]],["spear","Spear","1d6 piercing",["Thrown (20/60)","Versatile (1d8)"]],["light-crossbow","Light Crossbow","1d8 piercing",["Ammunition (80/320)","Loading","Two-Handed"]],["dart","Dart","1d4 piercing",["Finesse","Thrown (20/60)"]],["shortbow","Shortbow","1d6 piercing",["Ammunition (80/320)","Two-Handed"]],["sling","Sling","1d4 bludgeoning",["Ammunition (30/120)"]],["battleaxe","Battleaxe","1d8 slashing",["Versatile (1d10)"]],["flail","Flail","1d8 bludgeoning",[]],["glaive","Glaive","1d10 slashing",["Heavy","Reach","Two-Handed"]],["greataxe","Greataxe","1d12 slashing",["Heavy","Two-Handed"]],["greatsword","Greatsword","2d6 slashing",["Heavy","Two-Handed"]],["halberd","Halberd","1d10 slashing",["Heavy","Reach","Two-Handed"]],["lance","Lance","1d12 piercing",["Reach","Special"]],["longsword","Longsword","1d8 slashing",["Versatile (1d10)"]],["maul","Maul","2d6 bludgeoning",["Heavy","Two-Handed"]],["morningstar","Morningstar","1d8 piercing",[]],["pike","Pike","1d10 piercing",["Heavy","Reach","Two-Handed"]],["rapier","Rapier","1d8 piercing",["Finesse"]],["scimitar","Scimitar","1d6 slashing",["Finesse","Light"]],["shortsword","Shortsword","1d6 piercing",["Finesse","Light"]],["trident","Trident","1d6 piercing",["Thrown (20/60)","Versatile (1d8)"]],["war-pick","War Pick","1d8 piercing",[]],["warhammer","Warhammer","1d8 bludgeoning",["Versatile (1d10)"]],["whip","Whip","1d4 slashing",["Finesse","Reach"]],["blowgun","Blowgun","1 piercing",["Ammunition (25/100)","Loading"]],["hand-crossbow","Hand Crossbow","1d6 piercing",["Ammunition (30/120)","Light","Loading"]],["heavy-crossbow","Heavy Crossbow","1d10 piercing",["Ammunition (100/400)","Heavy","Loading","Two-Handed"]],["longbow","Longbow","1d8 piercing",["Ammunition (150/600)","Heavy","Two-Handed"]],["net","Net","0",["Special","Thrown (5/15)"]],
].map(([id,name,damage,properties]) => ({ id, name, kind: "weapon", damage, properties, source: "PHB-compatible starter catalog" }));

const armor = [
  ["padded","Padded",11,null],["leather","Leather",11,null],["studded-leather","Studded Leather",12,null],["hide","Hide",12,2],["chain-shirt","Chain Shirt",13,2],["scale-mail","Scale Mail",14,2],["breastplate","Breastplate",14,2],["half-plate","Half Plate",15,2],["ring-mail","Ring Mail",14,0],["chain-mail","Chain Mail",16,0],["splint","Splint",17,0],["plate","Plate",18,0],["shield","Shield",2,0],
].map(([id,name,armorClass,armorDexCap]) => ({ id, name, kind: "armor", armorClass, armorDexCap, source: "PHB-compatible starter catalog" }));

const packsAndGear = [
  "burglar's-pack","diplomat's-pack","dungeoneer's-pack","entertainer's-pack","explorer's-pack","priest's-pack","scholar's-pack","spellbook","holy-symbol","prayer-book","insignia","dice-set","ink-bottle","quill","fine-clothes","disguise-kit","crowbar","dark-clothes","musical-instrument","artisan-tools","shovel","letter-of-introduction","scroll-case","winter-blanket","signet-ring","staff","hunting-trap","belaying-pin","silk-rope","small-knife","map-of-city","component-pouch","wooden-shield",
].map((id) => ({
  id,
  name: id.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
  kind: id.includes("pack") ? "pack" : "gear",
  source: "PHB-compatible starter catalog",
}));

const repository = {
  metadata: {
    gameSystem: "D&D 5e-compatible character builder",
    version: "0.2.0",
    legalNotice: "Only legally safe names, summaries, and structured fields are bundled by default.",
  },
  species,
  classes,
  subclasses,
  backgrounds,
  feats,
  spells: spells.map((spell) => ({ ...spell, source: "PHB-compatible starter catalog" })),
  items: [...armor, ...weapons, ...packsAndGear],
  languages: ["Common","Dwarvish","Elvish","Giant","Gnomish","Goblin","Halfling","Orc","Draconic","Infernal","Celestial","Sylvan","Undercommon","Primordial"],
  optionalRules: [
    { id: "variant-human", label: "Variant human feat and skill", description: "Adds the variant human option with a feat placeholder and bonus skill hook." },
    { id: "feats", label: "Feat selection shell", description: "Exposes legal-safe feat choices without bundling proprietary feature prose." },
    { id: "multiclass-shell", label: "Multiclass architecture shell", description: "Repository and computation layers are ready for future multi-class composition." },
  ],
};

fs.writeFileSync(path.join(rootDir, "rules", "core", "repository.json"), `${JSON.stringify(repository, null, 2)}\n`, "utf8");
