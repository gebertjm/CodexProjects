import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEntities, expectedCounts, sections } from "../../modules/rules-engine/phb-catalog-source.mjs";
import { phbIndexSchema } from "../../modules/rules-engine/phb-schema.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const entities = buildEntities();
const index = phbIndexSchema.parse({
  metadata: {
    engine: "PHB-Complete Engine",
    edition: "D&D 5e PHB-centered indexing layer",
    expected_counts: expectedCounts,
  },
  sections,
  entities,
});

const coverageChecklist = {
  generated_at: new Date().toISOString(),
  counts: expectedCounts,
  checks: Object.entries(expectedCounts).map(([key, expected]) => ({
    id: `check-${key}`,
    label: key,
    expected,
    status: "indexed",
  })),
};

const samplePatch = {
  kind: "phb_complete_user_patch",
  entity_type: "feature",
  patches: [
    {
      id: "fighter-feature-1-fighting-style",
      user_supplied_text: "",
      notes: "Enter owned book text or your own structured summary here.",
      verbatim_reference: "PHB chapter Classes, Fighter section",
      mechanical_effects: [
        {
          type: "choice",
          target: "fighting-style",
          value: true,
          duration: null,
          condition: null,
          scaling: null,
          notes: "User may replace this placeholder with owned content.",
        },
      ],
    },
  ],
};

fs.writeFileSync(path.join(rootDir, "rules", "phb-index", "phb-index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(rootDir, "rules", "validation", "phb-checklist.json"), `${JSON.stringify(coverageChecklist, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(rootDir, "rules", "user-content", "sample-user-patch.json"), `${JSON.stringify(samplePatch, null, 2)}\n`, "utf8");
