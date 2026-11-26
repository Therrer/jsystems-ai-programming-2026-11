import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Plan §4 "No mocks outside unit and integration tests": production code in src/
// must never import test doubles, recorded fixtures or read a mock/fake switch.
const SRC = path.resolve(import.meta.dirname, "../../src");

const FORBIDDEN: Array<[string, RegExp]> = [
  ["imports ai/test", /from\s+["']ai\/test["']/],
  ["uses a mock language model", /\bMock[A-Za-z]*Model[A-Za-z0-9]*\b/],
  ["imports a test library", /from\s+["'](vitest|msw|nock|@testing-library\/[a-z-]+)["']/],
  ["references test fixtures", /tests\/fixtures|fixtures\/recorded/],
  ["reads a mock/fake env switch", /process\.env\.[A-Z0-9_]*(MOCK|FAKE)[A-Z0-9_]*/],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [full] : [];
  });
}

describe("no-mock guard", () => {
  it("finds no mocks, test doubles or fixtures in production code", () => {
    const violations = sourceFiles(SRC).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return FORBIDDEN.filter(([, re]) => re.test(text)).map(
        ([rule]) => `${path.relative(SRC, file)}: ${rule}`,
      );
    });
    expect(violations).toEqual([]);
  });
});
