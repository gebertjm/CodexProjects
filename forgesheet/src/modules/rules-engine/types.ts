export const abilities = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

export const skills = [
  "acrobatics",
  "animalHandling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleightOfHand",
  "stealth",
  "survival",
] as const;

export type Ability = (typeof abilities)[number];
export type Skill = (typeof skills)[number];

export type ModifierExplanation = {
  label: string;
  value: number | string;
  source: string;
  note?: string;
};

export type DerivedBreakdown = {
  final: number | string;
  formula: string;
  explanations: ModifierExplanation[];
};

export type AbilityScores = Record<Ability, number>;

export type AbilityAssignment = Record<Ability, number>;

export type RulesChoiceOption = {
  id: string;
  label: string;
  type: "skill" | "language" | "equipment" | "feat" | "spell";
};

export type RulesChoice = {
  id: string;
  label: string;
  choose: number;
  options: RulesChoiceOption[];
};

export type RulesTextBlock = {
  short: string;
  detail?: string;
  legalStatus: "open" | "user-supplied";
};

export type Species = {
  id: string;
  name: string;
  source: string;
  lineage: string;
  speed: number;
  size: "Small" | "Medium";
  languages: string[];
  traits: RulesTextBlock[];
  abilityBonuses?: Partial<Record<Ability, number>>;
  choices?: RulesChoice[];
  variantFlags?: string[];
};

export type ClassFeature = {
  level: number;
  name: string;
  text: RulesTextBlock;
};

export type Subclass = {
  id: string;
  classId: string;
  name: string;
  source: string;
  unlockLevel: number;
  features: ClassFeature[];
  text: RulesTextBlock;
};

export type SpellcastingProgression = "full" | "half" | "none";

export type CharacterClass = {
  id: string;
  name: string;
  source: string;
  hitDie: number;
  subclassLevel: number;
  primaryAbilities: Ability[];
  savingThrows: Ability[];
  skillChoices: RulesChoice;
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  equipmentOptions: string[];
  subclasses: string[];
  spellcasting: {
    progression: SpellcastingProgression;
    ability: Ability | null;
    preparesFromClassList: boolean;
  };
  features: ClassFeature[];
};

export type Background = {
  id: string;
  name: string;
  source: string;
  skillProficiencies: Skill[];
  toolProficiencies?: string[];
  languages: string[];
  equipment: string[];
  trait: RulesTextBlock;
};

export type Feat = {
  id: string;
  name: string;
  source: string;
  summary: RulesTextBlock;
  prerequisites?: string[];
  tags?: string[];
};

export type Spell = {
  id: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  source: string;
  text: RulesTextBlock;
};

export type Item = {
  id: string;
  name: string;
  kind: "armor" | "weapon" | "gear" | "pack";
  armorClass?: number;
  armorDexCap?: number | null;
  damage?: string;
  properties?: string[];
  weight?: number;
  source: string;
};

export type RulesRepository = {
  metadata: {
    gameSystem: string;
    version: string;
    legalNotice: string;
  };
  species: Species[];
  classes: CharacterClass[];
  subclasses: Subclass[];
  backgrounds: Background[];
  feats: Feat[];
  spells: Spell[];
  items: Item[];
  languages: string[];
  optionalRules: { id: string; label: string; description: string }[];
};

export type BuilderMode = "guided" | "expert";

export type CharacterDraft = {
  id: string;
  name: string;
  level: number;
  alignment: string;
  experience: number;
  notes: string;
  mode: BuilderMode;
  creationMethod: "standard-array" | "point-buy";
  speciesId: string;
  classId: string;
  subclassId: string;
  backgroundId: string;
  equippedArmorId: string;
  equippedWeaponId: string;
  selectedSkills: Skill[];
  selectedLanguages: string[];
  selectedFeatIds: string[];
  selectedSpells: string[];
  inventoryIds: string[];
  abilityScores: AbilityAssignment;
  optionalRules: string[];
};

export type ValidationIssue = {
  severity: "error" | "warning" | "info";
  field: string;
  message: string;
  source: string;
};

export type CharacterComputation = {
  draft: CharacterDraft;
  species?: Species;
  characterClass?: CharacterClass;
  subclass?: Subclass;
  background?: Background;
  armor?: Item;
  weapon?: Item;
  modifiers: Record<Ability, number>;
  proficiencyBonus: DerivedBreakdown;
  armorClass: DerivedBreakdown;
  hitPoints: DerivedBreakdown;
  initiative: DerivedBreakdown;
  speed: DerivedBreakdown;
  spellSaveDc: DerivedBreakdown | null;
  spellAttackBonus: DerivedBreakdown | null;
  skills: Record<Skill, DerivedBreakdown>;
  savingThrows: Record<Ability, DerivedBreakdown>;
  passivePerception: DerivedBreakdown;
  attacks: { name: string; toHit: number; damage: string; source: string }[];
  feats: string[];
  features: string[];
  languages: string[];
  validation: ValidationIssue[];
};
