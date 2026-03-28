import fs from "node:fs";
import path from "node:path";
import { phbIndexSchema } from "../rules-engine/phb-schema.mjs";

const entityTypesForCounts = {
  species: "race",
  subraces: "subrace",
  classes: "class",
  subclasses: "subclass",
  backgrounds: "background",
  feats: "feat",
  weapons: "weapon",
  armor: "armor",
  packs: "pack",
  tools: "tool",
  mounts: "mount",
  vehicles: "vehicle",
  conditions: "condition",
  spells: "spell",
};

export const auditIndex = (rootDir) => {
  const raw = fs.readFileSync(path.join(rootDir, "rules", "phb-index", "phb-index.json"), "utf8");
  const index = phbIndexSchema.parse(JSON.parse(raw));

  const report = Object.entries(index.metadata.expected_counts).map(([key, expected]) => {
    const type = entityTypesForCounts[key];
    const actual = type ? index.entities.filter((entity) => entity.entity_type === type).length : expected;
    const completedText = type
      ? index.entities.filter((entity) => entity.entity_type === type && entity.user_supplied_text.trim()).length
      : 0;
    return {
      key,
      expected,
      actual,
      missing_structure: Math.max(expected - actual, 0),
      user_text_complete: completedText,
      user_text_missing: Math.max(expected - completedText, 0),
    };
  });

  const missingNames = index.entities.filter(
    (entity) => entity.entity_type === "spell" && entity.name.startsWith("PHB Spell Slot"),
  ).length;

  return {
    generated_at: new Date().toISOString(),
    report,
    alerts: [
      ...(missingNames > 0
        ? [`${missingNames} spell placeholders still need user-supplied canonical names and mechanics.`]
        : []),
    ],
  };
};
