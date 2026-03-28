import fs from "node:fs";
import path from "node:path";
import { phbIndexSchema, userPatchFileSchema, parseCsv } from "../rules-engine/phb-schema.mjs";

export const loadBaseIndex = (rootDir) => {
  const filePath = path.join(rootDir, "rules", "phb-index", "phb-index.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return phbIndexSchema.parse(JSON.parse(raw));
};

export const loadPatchFile = (inputPath) => {
  const raw = fs.readFileSync(inputPath, "utf8");
  if (inputPath.endsWith(".csv")) {
    const rows = parseCsv(raw);
    return userPatchFileSchema.parse({
      kind: "phb_complete_user_patch",
      entity_type: "csv-import",
      patches: rows.map((row) => ({
        id: row.id,
        user_supplied_text: row.user_supplied_text,
        notes: row.notes,
        verbatim_reference: row.verbatim_reference,
      })),
    });
  }

  return userPatchFileSchema.parse(JSON.parse(raw));
};

export const mergePatches = (index, patchFile) => {
  const patchMap = new Map(patchFile.patches.map((patch) => [patch.id, patch]));
  return {
    ...index,
    entities: index.entities.map((entity) => {
      const patch = patchMap.get(entity.id);
      return patch ? { ...entity, ...patch, status: "complete" } : entity;
    }),
  };
};

export const writeMergedIndex = (rootDir, mergedIndex) => {
  const filePath = path.join(rootDir, "rules", "user-content", "merged-phb-index.json");
  fs.writeFileSync(filePath, `${JSON.stringify(mergedIndex, null, 2)}\n`, "utf8");
  return filePath;
};
