import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("PHB audit", () => {
  it("reports the generated spell placeholder total", () => {
    const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const reportPath = path.join(rootDir, "rules", "validation", "phb-audit-report.json");
    if (!fs.existsSync(reportPath)) {
      throw new Error("Run npm run phb:build and npm run phb:audit before the test suite.");
    }

    const result = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      report: Array<{ key: string; expected: number; actual: number }>;
    };
    const spellRow = result.report.find((row) => row.key === "spells");

    expect(spellRow?.expected).toBe(361);
    expect(spellRow?.actual).toBe(361);
  });
});
