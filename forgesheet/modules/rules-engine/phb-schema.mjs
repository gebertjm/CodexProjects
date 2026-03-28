import { z } from "zod";

export const sourceReferenceSchema = z.object({
  book: z.enum(["PHB", "DMG", "MM"]),
  chapter: z.string(),
  section: z.string(),
  page_hint: z.string().nullable().default(null),
});

export const mechanicalEffectSchema = z.object({
  type: z.string(),
  target: z.string().nullable().default(null),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable().default(null),
  duration: z.string().nullable().default(null),
  condition: z.string().nullable().default(null),
  scaling: z.string().nullable().default(null),
  notes: z.string().default(""),
});

export const entitySchema = z.object({
  id: z.string(),
  entity_type: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  status: z.enum(["indexed", "partial", "complete"]),
  source_reference: sourceReferenceSchema,
  summary: z.string(),
  prerequisites: z.array(z.string()).default([]),
  level_requirement: z.number().int().min(0).nullable().default(null),
  tags: z.array(z.string()).default([]),
  related_ids: z.array(z.string()).default([]),
  mechanical_effects: z.array(mechanicalEffectSchema).default([]),
  user_supplied_text: z.string().default(""),
  notes: z.string().default(""),
  verbatim_reference: z.string().default(""),
});

export const phbIndexSchema = z.object({
  metadata: z.object({
    engine: z.string(),
    edition: z.string(),
    expected_counts: z.record(z.string(), z.number()),
  }),
  sections: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      chapter: z.string(),
      coverage_goal: z.string(),
    }),
  ),
  entities: z.array(entitySchema),
});

export const userPatchSchema = z.object({
  id: z.string(),
  user_supplied_text: z.string().optional(),
  notes: z.string().optional(),
  verbatim_reference: z.string().optional(),
  mechanical_effects: z.array(mechanicalEffectSchema).optional(),
});

export const userPatchFileSchema = z.object({
  kind: z.literal("phb_complete_user_patch"),
  entity_type: z.string(),
  patches: z.array(userPatchSchema),
});

export const parseCsv = (raw) => {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
};
