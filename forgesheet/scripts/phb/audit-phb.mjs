import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditIndex } from "../../modules/completeness-tracker/phb-audit.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const report = auditIndex(rootDir);

fs.writeFileSync(
  path.join(rootDir, "rules", "validation", "phb-audit-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(report, null, 2));
