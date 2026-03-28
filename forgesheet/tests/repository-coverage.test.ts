import { rulesRepository } from "@/modules/rules-engine/repository";

describe("starter repository coverage", () => {
  it("includes the full class, subclass, species, and background choice surface", () => {
    expect(rulesRepository.classes).toHaveLength(12);
    expect(rulesRepository.subclasses).toHaveLength(40);
    expect(rulesRepository.species.length).toBeGreaterThanOrEqual(15);
    expect(rulesRepository.backgrounds).toHaveLength(13);
    expect(rulesRepository.feats).toHaveLength(41);
  });
});
