import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Plan §4 "No mocks outside unit and integration tests": production code in src/
// must never import test doubles, recorded fixtures or read a mock/fake switch.
const SRC = path.resolve(import.meta.dirname, "../../src");

// A module specifier in a static import, a dynamic import() or require().
const SPECIFIER = String.raw`(?:from|import\s*\(|require\s*\()\s*["']`;
const ENV_KEY = String.raw`[A-Z0-9_]*(?:MOCK|FAKE)[A-Z0-9_]*`;

const FORBIDDEN: Array<[string, RegExp]> = [
  ["imports ai/test", new RegExp(String.raw`${SPECIFIER}ai/test["']`)],
  ["uses a mock language model", /\bMock[A-Za-z]*Model[A-Za-z0-9]*\b/],
  ["uses the AI SDK stream simulator", /\bsimulateReadableStream\b/],
  [
    "imports a test library",
    new RegExp(String.raw`${SPECIFIER}(?:vitest|msw|nock|@vitest/[a-z-]+|@testing-library/[a-z-]+)(?:/[^"']*)?["']`),
  ],
  ["references test fixtures", /tests\/fixtures|fixtures\/recorded/],
  ["reads a mock/fake env switch", new RegExp(String.raw`process\.env\.${ENV_KEY}\b`)],
  ["reads a mock/fake env switch by index", new RegExp(String.raw`process\.env\[\s*["'\x60]${ENV_KEY}["'\x60]`)],
  ["destructures a mock/fake env switch", new RegExp(String.raw`\{[^}]*\b${ENV_KEY}\b[^}]*\}\s*=\s*process\.env`)],
  ["names a mock/fake env key", new RegExp(String.raw`["'\x60]${ENV_KEY}["'\x60]`)],
];

const SCANNED = /\.[cm]?[jt]sx?$/;

function violationsIn(text: string): string[] {
  return FORBIDDEN.filter(([, re]) => re.test(text)).map(([rule]) => rule);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return SCANNED.test(name) ? [full] : [];
  });
}

describe("no-mock guard", () => {
  it("finds no mocks, test doubles or fixtures in production code", () => {
    const violations = sourceFiles(SRC).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return violationsIn(text).map((rule) => `${path.relative(SRC, file)}: ${rule}`);
    });
    expect(violations).toEqual([]);
  });

  // The guard itself must catch every import and env form a mock could arrive in (T27 G1),
  // and stay quiet on ordinary production code.
  it.each([
    'import { MockLanguageModelV3 } from "ai/test";',
    'const t = await import("ai/test");',
    'const t = require("ai/test");',
    'import { http } from "msw/node";',
    'import { defineConfig } from "vitest/config";',
    'import { fn } from "@vitest/spy";',
    'const n = await import("nock");',
    'import { simulateReadableStream } from "ai";',
    'const on = process.env["USE_MOCK_AI"];',
    "const { FAKE_LLM } = process.env;",
    'const KEYS = ["OPENROUTER_API_KEY", "MOCK_RESPONSES"];',
  ])("flags %s", (snippet) => {
    expect(violationsIn(snippet)).not.toEqual([]);
  });

  it.each([
    'import { streamText, generateId } from "ai";',
    'import { createOpenRouter } from "@openrouter/ai-sdk-provider";',
    "const key = process.env.OPENROUTER_API_KEY;",
    'const KEYS = ["OPENROUTER_API_KEY", "DECISIONS_ENABLED"];',
  ])("does not flag %s", (snippet) => {
    expect(violationsIn(snippet)).toEqual([]);
  });

  it("scans every script extension, including .mts and .cts", () => {
    const names = ["a.ts", "a.tsx", "a.js", "a.jsx", "a.mjs", "a.mts", "a.cts", "a.cjs"];
    expect(names.filter((name) => SCANNED.test(name))).toEqual(names);
  });
});
