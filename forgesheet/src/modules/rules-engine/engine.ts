import { skillAbilityMap } from "@/modules/rules-engine/ability-map";
import { getBackgroundById, getClassById, getFeatById, getItemById, getSpeciesById, getSubclassById } from "@/modules/rules-engine/repository";
import { abilityModifier, proficiencyBonusByLevel } from "@/modules/rules-engine/math";
import { validateDraft } from "@/modules/rules-engine/validation";
import { abilities, skills } from "@/modules/rules-engine/types";
import type {
  Ability,
  CharacterComputation,
  CharacterDraft,
  DerivedBreakdown,
  ModifierExplanation,
  Skill,
} from "@/modules/rules-engine/types";

const breakdown = (
  final: number | string,
  formula: string,
  explanations: ModifierExplanation[],
): DerivedBreakdown => ({
  final,
  formula,
  explanations,
});

const hasProficiency = (draft: CharacterDraft, skill: Skill, backgroundSkills: Skill[]) =>
  draft.selectedSkills.includes(skill) || backgroundSkills.includes(skill);

export const computeCharacter = (draft: CharacterDraft): CharacterComputation => {
  const species = getSpeciesById(draft.speciesId);
  const characterClass = getClassById(draft.classId);
  const subclassCandidate = getSubclassById(draft.subclassId);
  const subclass = subclassCandidate?.classId === draft.classId ? subclassCandidate : undefined;
  const background = getBackgroundById(draft.backgroundId);
  const armor = getItemById(draft.equippedArmorId);
  const weapon = getItemById(draft.equippedWeaponId);
  const selectedFeats = draft.selectedFeatIds.map((id) => getFeatById(id)).filter(Boolean);

  const finalScores = abilities.reduce(
    (acc, ability) => {
      const speciesBonus = species?.abilityBonuses?.[ability] ?? 0;
      acc[ability] = draft.abilityScores[ability] + speciesBonus;
      return acc;
    },
    {} as Record<Ability, number>,
  );

  const modifiers = abilities.reduce(
    (acc, ability) => {
      acc[ability] = abilityModifier(finalScores[ability]);
      return acc;
    },
    {} as Record<Ability, number>,
  );

  const proficiency = proficiencyBonusByLevel(draft.level);
  const backgroundSkills = background?.skillProficiencies ?? [];
  const proficiencyBreakdown = breakdown(proficiency, `Level ${draft.level} => +${proficiency}`, [
    {
      label: "Character level band",
      value: `+${proficiency}`,
      source: "Core progression table",
      note: "5e proficiency bonus increases every four levels.",
    },
  ]);

  const dexContribution =
    armor?.armorDexCap === null || armor?.armorDexCap === undefined
      ? modifiers.dexterity
      : Math.min(modifiers.dexterity, armor.armorDexCap);

  const armorClassBase = armor?.armorClass ?? 10;
  const armorClass = breakdown(
    armorClassBase + dexContribution,
    armor ? `${armor.name} ${armor.armorClass} + Dex modifier` : "10 + Dex modifier",
    [
      {
        label: armor ? armor.name : "Unarmored base",
        value: armor ? armor.armorClass ?? 10 : 10,
        source: armor ? armor.source : "Core rule",
      },
      {
        label: "Dexterity contribution",
        value: dexContribution >= 0 ? `+${dexContribution}` : dexContribution,
        source: armor?.name ?? "Unarmored calculation",
        note: armor?.armorDexCap !== undefined ? `Armor dex cap: ${armor.armorDexCap}` : undefined,
      },
    ],
  );

  const hillDwarfBonus = species?.id === "hill-dwarf" ? draft.level : 0;
  const hitPointTotal = characterClass
    ? characterClass.hitDie + modifiers.constitution + (draft.level - 1) * (Math.floor(characterClass.hitDie / 2) + 1 + modifiers.constitution) + hillDwarfBonus
    : 0;
  const hitPoints = breakdown(
    hitPointTotal,
    characterClass
      ? `${characterClass.hitDie} + Con at level 1, then average hit die + Con each level`
      : "Choose a class to compute hit points",
    [
      {
        label: "Class hit die",
        value: characterClass ? characterClass.hitDie : 0,
        source: characterClass?.name ?? "Class pending",
      },
      {
        label: "Constitution modifier",
        value: modifiers.constitution,
        source: "Ability modifier",
      },
      {
        label: "Hill Dwarf bonus",
        value: hillDwarfBonus,
        source: species?.name ?? "Species",
        note: hillDwarfBonus ? "Dwarven Toughness modeled as +1 per level." : undefined,
      },
    ],
  );

  const initiative = breakdown(modifiers.dexterity, "Dexterity modifier", [
    {
      label: "Dexterity modifier",
      value: modifiers.dexterity,
      source: "Core rule",
    },
  ]);

  const speed = breakdown(species?.speed ?? 30, species ? `${species.name} walking speed` : "Default 30 ft.", [
    {
      label: "Species speed",
      value: `${species?.speed ?? 30} ft.`,
      source: species?.name ?? "Fallback baseline",
    },
  ]);

  const savingThrows = abilities.reduce(
    (acc, ability) => {
      const proficient = characterClass?.savingThrows.includes(ability) ?? false;
      const total = modifiers[ability] + (proficient ? proficiency : 0);
      acc[ability] = breakdown(
        total,
        `${ability} modifier${proficient ? " + proficiency bonus" : ""}`,
        [
          {
            label: `${ability} modifier`,
            value: modifiers[ability],
            source: "Ability score",
          },
          ...(proficient
            ? [
                {
                  label: "Saving throw proficiency",
                  value: `+${proficiency}`,
                  source: characterClass?.name ?? "Class",
                },
              ]
            : []),
        ],
      );
      return acc;
    },
    {} as CharacterComputation["savingThrows"],
  );

  const skillBreakdowns = skills.reduce(
    (acc, skill) => {
      const linkedAbility = skillAbilityMap[skill];
      const proficient = hasProficiency(draft, skill, backgroundSkills);
      const total = modifiers[linkedAbility] + (proficient ? proficiency : 0);
      acc[skill] = breakdown(
        total,
        `${linkedAbility} modifier${proficient ? " + proficiency bonus" : ""}`,
        [
          {
            label: `${linkedAbility} modifier`,
            value: modifiers[linkedAbility],
            source: "Ability score",
          },
          ...(proficient
            ? [
                {
                  label: "Skill proficiency",
                  value: `+${proficiency}`,
                  source: draft.selectedSkills.includes(skill)
                    ? characterClass?.name ?? "Class choice"
                    : background?.name ?? "Background",
                },
              ]
            : []),
        ],
      );
      return acc;
    },
    {} as CharacterComputation["skills"],
  );

  const passivePerception = breakdown(
    10 + Number(skillBreakdowns.perception.final),
    `10 + Perception modifier (${skillBreakdowns.perception.final})`,
    [
      {
        label: "Passive base",
        value: 10,
        source: "Core rule",
      },
      {
        label: "Perception modifier",
        value: skillBreakdowns.perception.final,
        source: "Perception skill",
      },
    ],
  );

  const spellAbility = characterClass?.spellcasting.ability;
  const spellSaveDc = spellAbility
    ? breakdown(
        8 + proficiency + modifiers[spellAbility],
        `8 + proficiency bonus + ${spellAbility} modifier`,
        [
          { label: "Base", value: 8, source: "Spellcasting rule" },
          { label: "Proficiency", value: `+${proficiency}`, source: "Character level" },
          {
            label: `${spellAbility} modifier`,
            value: modifiers[spellAbility],
            source: characterClass?.name ?? "Class",
          },
        ],
      )
    : null;

  const spellAttackBonus = spellAbility
    ? breakdown(
        proficiency + modifiers[spellAbility],
        `proficiency bonus + ${spellAbility} modifier`,
        [
          { label: "Proficiency", value: `+${proficiency}`, source: "Character level" },
          {
            label: `${spellAbility} modifier`,
            value: modifiers[spellAbility],
            source: characterClass?.name ?? "Class",
          },
        ],
      )
    : null;

  const attackAbility = weapon?.properties?.some((property) => property.toLowerCase().includes("finesse"))
    ? Math.max(modifiers.strength, modifiers.dexterity)
    : weapon?.name === "Longsword" || weapon?.name === "Mace" || weapon?.name === "Quarterstaff"
      ? modifiers.strength
      : modifiers.dexterity;

  const attacks =
    weapon && characterClass
      ? [
          {
            name: weapon.name,
            toHit: attackAbility + proficiency,
            damage: `${weapon.damage ?? "1"} ${attackAbility >= 0 ? `+ ${attackAbility}` : `- ${Math.abs(attackAbility)}`}`,
            source: `${weapon.name} + proficiency + attack ability`,
          },
        ]
      : [];

  const features = [
    ...(species?.traits.map((trait) => `${species.name}: ${trait.short}`) ?? []),
    ...(characterClass?.features
      .filter((feature) => feature.level <= draft.level)
      .map((feature) => `${feature.name}: ${feature.text.short}`) ?? []),
    ...(subclass?.features
      .filter((feature) => feature.level <= draft.level)
      .map((feature) => `${subclass.name}: ${feature.name} - ${feature.text.short}`) ?? []),
    ...(background ? [`${background.name}: ${background.trait.short}`] : []),
  ];

  const languages = Array.from(
    new Set([
      ...(species?.languages?.filter((language) => language !== "Choice") ?? []),
      ...(background?.languages?.filter((language) => language !== "Choice") ?? []),
      ...draft.selectedLanguages,
    ]),
  );

  return {
    draft,
    species,
    characterClass,
    subclass,
    background,
    armor,
    weapon,
    modifiers,
    proficiencyBonus: proficiencyBreakdown,
    armorClass,
    hitPoints,
    initiative,
    speed,
    spellSaveDc,
    spellAttackBonus,
    skills: skillBreakdowns,
    savingThrows,
    passivePerception,
    attacks,
    feats: selectedFeats.map((feat) => feat?.name ?? "").filter(Boolean),
    features,
    languages,
    validation: validateDraft(draft),
  };
};
