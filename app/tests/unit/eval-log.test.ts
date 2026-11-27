import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Decision, ImageAnalysis, LunaSignal, LunaSignals } from "@/lib/shared/schemas/ai";
import type { LunaKey } from "@/lib/shared/schemas/enums";
import { buildEvalRecord, createEvalLogger } from "@/server/eval-log";

function answered(key: LunaKey, type: "noul" | "choice", value: boolean | string): LunaSignal {
  return {
    key,
    type,
    value,
    probabilities: type === "noul" ? { true: 0.9 } : { [String(value)]: 0.9 },
    confidence: 0.9,
    certainty: 0.9,
    status: "answered",
  };
}

function notAnswered(key: LunaKey, type: "noul" | "choice"): LunaSignal {
  return { key, type, value: null, probabilities: {}, confidence: null, certainty: 0, status: "not_answered" };
}

function lunaWith(signals: LunaSignal[]): LunaSignals {
  return { status: "ok", model: "openai/gpt-6-luna-decisions", latencyMs: 10, signals, derivedCategoryMatch: "match" };
}

function analysisWith(overrides: Partial<ImageAnalysis> = {}): ImageAnalysis {
  return {
    imageUsable: true,
    unusableReason: null,
    deviceVisible: true,
    detectedCategory: "laptop",
    categoryMatch: "match",
    damageVisible: false,
    damage: [],
    likelyCause: null,
    signsOfUse: "none",
    resellableAsNew: true,
    observationsPl: "Obserwacje.",
    lunaVerification: [],
    ...overrides,
  };
}

function decisionWith(): Decision {
  return {
    outcome: "ACCEPT",
    remedy: "FULL_REFUND",
    citedRuleIds: ["R-2.1"],
    photoSummaryPl: "Zdjęcie.",
    justificationPl: "Uzasadnienie.",
    nextStepsPl: ["Krok."],
    clarifyingQuestionsPl: [],
    version: 1,
    source: "initial",
    appliedGuardrails: [],
    createdAt: "2026-11-26T10:00:00.000Z",
  };
}

function buildWith(luna: LunaSignals, analysis: ImageAnalysis, caseId = "case-1") {
  return buildEvalRecord({
    caseId,
    caseType: "return",
    category: "laptop",
    luna,
    analysis,
    decision: decisionWith(),
    latencyMs: { luna: 10, vision: 20, decision: 30 },
    models: { vision: "openai/gpt-6-luna", decision: "openai/gpt-6-luna", decisions: "openai/gpt-6-luna-decisions" },
    ts: "2026-11-26T10:00:00.000Z",
  });
}

describe("buildEvalRecord agreement", () => {
  it("marks Luna answers that equal the analysis as agree", () => {
    const record = buildWith(
      lunaWith([answered("device_visible", "noul", true), answered("image_usable", "noul", true), answered("category", "choice", "laptop")]),
      analysisWith(),
    );

    expect(record.agreement.device_visible).toBe("agree");
    expect(record.agreement.image_usable).toBe("agree");
    expect(record.agreement.category).toBe("agree");
  });

  it("marks Luna answers that differ from the analysis as disagree", () => {
    const record = buildWith(
      lunaWith([answered("damage_visible", "noul", true), answered("category", "choice", "tv")]),
      analysisWith({ damageVisible: false, detectedCategory: "laptop" }),
    );

    expect(record.agreement.damage_visible).toBe("disagree");
    expect(record.agreement.category).toBe("disagree");
  });

  it("marks a question Luna did not answer, or that has no signal, as n/a", () => {
    const record = buildWith(
      lunaWith([notAnswered("damage_visible", "noul")]),
      analysisWith(),
    );

    expect(record.agreement.damage_visible).toBe("n/a");
    expect(record.agreement.resellable_as_new).toBe("n/a");
  });

  it("marks a null analysis field as n/a", () => {
    const record = buildWith(
      lunaWith([answered("resellable_as_new", "noul", true)]),
      analysisWith({ resellableAsNew: null }),
    );

    expect(record.agreement.resellable_as_new).toBe("n/a");
  });

  it.each([
    ["like_new", "none", "agree"],
    ["light_signs_of_use", "light", "agree"],
    ["clear_signs_of_use", "clear", "agree"],
    ["damaged", "heavy", "agree"],
    ["light_signs_of_use", "clear", "disagree"],
  ])("maps Luna condition %s onto signsOfUse %s as %s", (condition, signsOfUse, expected) => {
    const record = buildWith(
      lunaWith([answered("condition", "choice", condition)]),
      analysisWith({ signsOfUse: signsOfUse as ImageAnalysis["signsOfUse"] }),
    );

    expect(record.agreement.condition).toBe(expected);
  });

  it("does not map damage_type or description_supported", () => {
    const record = buildWith(
      lunaWith([answered("damage_type", "choice", "cracked_glass"), answered("description_supported", "noul", true)]),
      analysisWith(),
    );

    expect(Object.keys(record.agreement)).not.toContain("damage_type");
    expect(Object.keys(record.agreement)).not.toContain("description_supported");
  });
});

describe("createEvalLogger", () => {
  it("is undefined when no path is configured", () => {
    expect(createEvalLogger(undefined)).toBeUndefined();
  });

  describe("with a temporary directory", () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsdc-eval-"));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("creates a missing parent directory and appends one JSON line per call", () => {
      const logPath = path.join(dir, "nested", "eval.jsonl");
      const logger = createEvalLogger(logPath);

      logger?.append(buildWith(lunaWith([]), analysisWith(), "case-1"));
      logger?.append(buildWith(lunaWith([]), analysisWith(), "case-2"));

      const content = fs.readFileSync(logPath, "utf8");
      expect(content.endsWith("\n")).toBe(true);
      const lines = content.split("\n").filter((line) => line.length > 0);
      expect(lines).toHaveLength(2);
      expect((JSON.parse(lines[0]!) as { caseId: string }).caseId).toBe("case-1");
      expect((JSON.parse(lines[1]!) as { caseId: string }).caseId).toBe("case-2");
    });
  });
});
