import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, formatReport, parseJsonl } from "../../scripts/eval-report.mjs";

// Real line captured by the T21 app run (EVAL_LOG_PATH output, synthetic laptop case).
const fixturePath = path.resolve(import.meta.dirname, "../fixtures/recorded/app-eval-line.json");
const realLine = JSON.parse(fs.readFileSync(fixturePath, "utf8")).line as Record<string, unknown>;

type Line = Record<string, unknown>;

type BucketStats = { n: number; agree: number; disagree: number; rate: number | null };
type Report = { cases: number; keys: Record<string, Record<string, BucketStats>> };

function keyBuckets(report: Report, key: string): Record<string, BucketStats> {
  const buckets = report.keys[key];
  if (!buckets) throw new Error(`no agreement key ${key} in report`);
  return buckets;
}

// Derived copy: edits of the real line only.
function withAgreement(line: Line, key: string, value: string): Line {
  // Edited field: agreement[key] (set to the given value).
  return { ...line, agreement: { ...(line.agreement as Record<string, string>), [key]: value } };
}

describe("buildReport", () => {
  it("buckets the real line by Luna certainty", () => {
    const report = buildReport([realLine]) as Report;

    expect(report.cases).toBe(1);
    expect(keyBuckets(report, "damage_visible")[">=0.9"]).toEqual({ n: 1, agree: 0, disagree: 1, rate: 0 });
    expect(keyBuckets(report, "condition")["<0.8"]).toMatchObject({ n: 1, agree: 1, disagree: 0, rate: 1 });
    expect(keyBuckets(report, "image_usable")["0.8-0.9"]).toMatchObject({ n: 1, agree: 1, rate: 1 });
    for (const bucket of ["<0.8", "0.8-0.9", ">=0.9"]) {
      expect(keyBuckets(report, "likely_cause")[bucket]).toMatchObject({ n: 0, agree: 0, disagree: 0, rate: null });
    }
  });

  it("accumulates agreement across two lines", () => {
    // Edited field: agreement.damage_visible changed from "disagree" to "agree".
    const derived = withAgreement(realLine, "damage_visible", "agree");
    const report = buildReport([realLine, derived]) as Report;

    expect(report.cases).toBe(2);
    expect(keyBuckets(report, "damage_visible")[">=0.9"]).toMatchObject({ n: 2, agree: 1, disagree: 1, rate: 0.5 });
  });

  it("skips a Luna entry with status not_answered and no certainty", () => {
    // Edited fields: luna[category].status set to "not_answered" and luna[category].certainty removed.
    const luna = (realLine.luna as Array<Record<string, unknown>>).map((signal) =>
      signal.key === "category" ? { key: "category", value: null, status: "not_answered" } : signal,
    );
    const derived = { ...realLine, luna };
    const report = buildReport([derived]) as Report;

    for (const bucket of ["<0.8", "0.8-0.9", ">=0.9"]) {
      expect(keyBuckets(report, "category")[bucket]).toMatchObject({ n: 0, agree: 0, disagree: 0, rate: null });
    }
  });
});

describe("parseJsonl", () => {
  it("ignores blank lines and counts invalid JSON as skipped", () => {
    const text = `${JSON.stringify(realLine)}\n\n{broken\n`;
    const { lines, skipped } = parseJsonl(text);

    expect(lines).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe("formatReport", () => {
  it("renders the case count, a key row and empty buckets as a dash", () => {
    const text = formatReport(buildReport([realLine]));
    const rows = text.split("\n");

    expect(text).toContain("Cases: 1");
    const damageRow = rows.find((row) => row.startsWith("| damage_visible |"));
    expect(damageRow).toBeDefined();
    expect(damageRow).toContain("0/1 (0 %)");
    expect(text).toContain("—");
  });
});
