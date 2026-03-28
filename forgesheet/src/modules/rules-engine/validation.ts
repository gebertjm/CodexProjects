import { abilities } from "@/modules/rules-engine/types";
import type { CharacterDraft, ValidationIssue } from "@/modules/rules-engine/types";
import { getBackgroundById, getClassById, getItemById, getSpeciesById, getSubclassById } from "@/modules/rules-engine/repository";

export const validateDraft = (draft: CharacterDraft): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const species = getSpeciesById(draft.speciesId);
  const characterClass = getClassById(draft.classId);
  const subclass = draft.subclassId ? getSubclassById(draft.subclassId) : undefined;
  const background = getBackgroundById(draft.backgroundId);
  const armor = draft.equippedArmorId ? getItemById(draft.equippedArmorId) : undefined;
  const weapon = draft.equippedWeaponId ? getItemById(draft.equippedWeaponId) : undefined;

  if (!draft.name.trim()) {
    issues.push({
      severity: "warning",
      field: "name",
      message: "A character name helps distinguish drafts in the library.",
      source: "ForgeSheet UX"
    });
  }

  if (!species) {
    issues.push({
      severity: "error",
      field: "speciesId",
      message: "Choose a species before finalizing the build.",
      source: "Rules repository"
    });
  }

  if (!characterClass) {
    issues.push({
      severity: "error",
      field: "classId",
      message: "Choose a class before finalizing the build.",
      source: "Rules repository"
    });
  }

  if (characterClass && draft.level >= characterClass.subclassLevel && !subclass) {
    issues.push({
      severity: "warning",
      field: "subclassId",
      message: `${characterClass.name} usually selects a subclass by level ${characterClass.subclassLevel}.`,
      source: characterClass.name
    });
  }

  if (subclass && subclass.classId !== draft.classId) {
    issues.push({
      severity: "error",
      field: "subclassId",
      message: "Selected subclass does not belong to the chosen class.",
      source: "Subclass validation"
    });
  }

  if (!background) {
    issues.push({
      severity: "warning",
      field: "backgroundId",
      message: "A background supplies proficiency and story context.",
      source: "Rules repository"
    });
  }

  const totalAbilityScores = abilities.reduce((sum, ability) => sum + draft.abilityScores[ability], 0);
  if (draft.creationMethod === "standard-array" && totalAbilityScores !== 72) {
    issues.push({
      severity: "error",
      field: "abilityScores",
      message: "Standard array assignments must total 72 across all six abilities.",
      source: "Standard array rule"
    });
  }

  if (characterClass && draft.selectedSkills.length !== characterClass.skillChoices.choose) {
    issues.push({
      severity: "warning",
      field: "selectedSkills",
      message: `Pick ${characterClass.skillChoices.choose} class skills for ${characterClass.name}.`,
      source: characterClass.name
    });
  }

  if (characterClass?.spellcasting.progression !== "none" && draft.selectedSpells.length === 0) {
    issues.push({
      severity: "info",
      field: "selectedSpells",
      message: "This class can cast spells. Choose at least a starter loadout to see spell math in the sheet.",
      source: "Spellcasting"
    });
  }

  if (armor && armor.kind !== "armor") {
    issues.push({
      severity: "error",
      field: "equippedArmorId",
      message: "Equipped armor must come from an armor item.",
      source: "Inventory validation"
    });
  }

  if (weapon && weapon.kind !== "weapon") {
    issues.push({
      severity: "error",
      field: "equippedWeaponId",
      message: "Equipped weapon must come from a weapon item.",
      source: "Inventory validation"
    });
  }

  return issues;
};
