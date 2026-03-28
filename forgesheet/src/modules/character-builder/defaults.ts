import type { CharacterDraft } from "@/modules/rules-engine/types";

const draftSeed = {
  name: "New Hero",
  level: 1,
  alignment: "Neutral Good",
  experience: 0,
  notes: "",
  mode: "guided",
  creationMethod: "standard-array",
  speciesId: "human",
  classId: "fighter",
  subclassId: "champion",
  backgroundId: "soldier",
  equippedArmorId: "chain-mail",
  equippedWeaponId: "longsword",
  selectedSkills: ["athletics", "perception"],
  selectedLanguages: ["Elvish"],
  selectedFeatIds: [],
  selectedSpells: [],
  inventoryIds: ["chain-mail", "longsword", "explorers-pack"],
  abilityScores: {
    strength: 15,
    dexterity: 13,
    constitution: 14,
    intelligence: 10,
    wisdom: 12,
    charisma: 8,
  },
  optionalRules: [],
} satisfies Omit<CharacterDraft, "id">;

const cloneSeed = (id: string): CharacterDraft => ({
  id,
  ...draftSeed,
  selectedSkills: [...draftSeed.selectedSkills],
  selectedLanguages: [...draftSeed.selectedLanguages],
  selectedFeatIds: [...draftSeed.selectedFeatIds],
  selectedSpells: [...draftSeed.selectedSpells],
  inventoryIds: [...draftSeed.inventoryIds],
  optionalRules: [...draftSeed.optionalRules],
  abilityScores: { ...draftSeed.abilityScores },
});

const normalizedFallback = cloneSeed("draft-fallback");

export const defaultDraft = (): CharacterDraft => cloneSeed(crypto.randomUUID());

export const normalizeDraft = (draft: Partial<CharacterDraft> | undefined): CharacterDraft => {
  const fallback = normalizedFallback;
  if (!draft) {
    return cloneSeed(fallback.id);
  }

  return {
    ...fallback,
    ...draft,
    id: draft.id ?? fallback.id,
    abilityScores: {
      ...fallback.abilityScores,
      ...(draft.abilityScores ?? {}),
    },
    selectedSkills: [...(draft.selectedSkills ?? fallback.selectedSkills)],
    selectedLanguages: [...(draft.selectedLanguages ?? fallback.selectedLanguages)],
    selectedFeatIds: draft.selectedFeatIds ?? [],
    selectedSpells: [...(draft.selectedSpells ?? fallback.selectedSpells)],
    inventoryIds: [...(draft.inventoryIds ?? fallback.inventoryIds)],
    optionalRules: [...(draft.optionalRules ?? fallback.optionalRules)],
  };
};
