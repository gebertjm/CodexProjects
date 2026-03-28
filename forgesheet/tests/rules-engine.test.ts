import { computeCharacter } from "@/modules/rules-engine/engine";
import { defaultDraft } from "@/modules/character-builder/defaults";

describe("rules engine", () => {
  it("computes fighter armor class and proficiency", () => {
    const draft = defaultDraft();
    const result = computeCharacter(draft);

    expect(result.armorClass.final).toBe(16);
    expect(result.proficiencyBonus.final).toBe(2);
    expect(result.hitPoints.final).toBe(12);
    expect(result.attacks[0]?.toHit).toBe(5);
  });

  it("applies spellcasting math for wizard builds", () => {
    const draft = defaultDraft();
    draft.classId = "wizard";
    draft.speciesId = "high-elf";
    draft.backgroundId = "sage";
    draft.equippedArmorId = "";
    draft.equippedWeaponId = "quarterstaff";
    draft.selectedSkills = ["arcana", "investigation"];
    draft.selectedSpells = ["fire-bolt", "mage-armor"];
    draft.abilityScores.intelligence = 15;
    draft.abilityScores.dexterity = 14;

    const result = computeCharacter(draft);

    expect(result.spellSaveDc?.final).toBe(13);
    expect(result.spellAttackBonus?.final).toBe(5);
    expect(result.armorClass.final).toBe(13);
  });

  it("flags invalid standard array totals", () => {
    const draft = defaultDraft();
    draft.abilityScores.strength = 18;

    const result = computeCharacter(draft);

    expect(result.validation.some((issue) => issue.field === "abilityScores")).toBe(true);
  });
});
