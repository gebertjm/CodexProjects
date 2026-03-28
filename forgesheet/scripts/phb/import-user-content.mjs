import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBaseIndex, loadPatchFile, mergePatches, writeMergedIndex } from "../../modules/ingestion/phb-ingestion.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/phb/import-user-content.mjs <path-to-json-or-csv>");
  process.exit(1);
}

const baseIndex = loadBaseIndex(rootDir);
const patchFile = loadPatchFile(path.resolve(process.cwd(), inputPath));
const merged = mergePatches(baseIndex, patchFile);
const outputPath = writeMergedIndex(rootDir, merged);

console.log(`Merged PHB user content written to ${outputPath}`);
