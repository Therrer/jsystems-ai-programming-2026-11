import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decisionDraftSchema,
  decisionSchema,
  imageAnalysisSchema,
  lunaSignalsSchema,
  updateDecisionInputSchema,
} from "@/lib/shared/schemas/ai";

const RECORDED = path.resolve(import.meta.dirname, "../../fixtures/recorded");
const recorded = (name: string) => JSON.parse(readFileSync(path.join(RECORDED, `${name}.json`), "utf8"));

// The decision draft is validated against the real T04 capture (plan §4 capture policy).
describe("decisionDraftSchema", () => {
  it("parses the real Decision-shaped capture from T04", () => {
    const capture = recorded("decision-structured-return");
    const content = JSON.parse(capture.response.body.choices[0].message.content);
    const parsed = decisionDraftSchema.parse(content);
    expect(parsed.outcome).toBe("ACCEPT");
    expect(parsed.citedRuleIds).toContain("R-2.1");
  });

  it("rejects an unknown outcome, an unknown remedy and a malformed rule id", () => {
    const capture = recorded("decision-structured-return");
    const content = JSON.parse(capture.response.body.choices[0].message.content);
    expect(decisionDraftSchema.safeParse({ ...content, outcome: "MAYBE" }).success).toBe(false);
    expect(decisionDraftSchema.safeParse({ ...content, remedy: "VOUCHER" }).success).toBe(false);
    expect(decisionDraftSchema.safeParse({ ...content, citedRuleIds: ["2.1"] }).success).toBe(false);
    expect(decisionDraftSchema.safeParse({ ...content, citedRuleIds: [] }).success).toBe(false);
  });

  it("is extended by code-set fields in the stored decision", () => {
    const capture = recorded("decision-structured-return");
    const draft = JSON.parse(capture.response.body.choices[0].message.content);
    const stored = { ...draft, version: 1, source: "initial", appliedGuardrails: [], createdAt: "2026-11-26T10:00:00.000Z" };
    expect(decisionSchema.parse(stored).version).toBe(1);
    expect(decisionSchema.safeParse({ ...stored, version: 0 }).success).toBe(false);
  });
});

describe("imageAnalysisSchema", () => {
  it("accepts the ADR-001 §4 shape with enum damage types", () => {
    const analysis = {
      imageUsable: true,
      unusableReason: null,
      deviceVisible: true,
      detectedCategory: "laptop",
      categoryMatch: "match",
      damageVisible: true,
      damage: [{ type: "cracked_glass", location: "lewa dolna część ekranu", severity: "severe" }],
      likelyCause: "impact",
      signsOfUse: "clear",
      resellableAsNew: false,
      observationsPl: "Pęknięty ekran laptopa.",
      lunaVerification: [{ key: "category", agrees: "yes", notePl: "Widoczny laptop." }],
    };
    expect(imageAnalysisSchema.parse(analysis).categoryMatch).toBe("match");
  });

  it("rejects free-text damage types (the T04 draft capture used free text)", () => {
    const capture = recorded("vision-structured-return-laptop");
    const content = JSON.parse(capture.response.body.choices[0].message.content);
    expect(imageAnalysisSchema.safeParse(content).success).toBe(false);
  });
});

describe("lunaSignalsSchema", () => {
  it("accepts an unavailable pre-check with no signals", () => {
    expect(
      lunaSignalsSchema.parse({ status: "unavailable", model: "openai/gpt-6-luna-decisions", latencyMs: 0, signals: [], derivedCategoryMatch: "unsure" }).status,
    ).toBe("unavailable");
  });

  it("rejects a certainty outside 0–1", () => {
    expect(
      lunaSignalsSchema.safeParse({
        status: "ok",
        model: "m",
        latencyMs: 1,
        derivedCategoryMatch: "match",
        signals: [{ key: "device_visible", type: "noul", value: true, probabilities: { true: 1 }, confidence: null, certainty: 1.2, status: "answered" }],
      }).success,
    ).toBe(false);
  });
});

describe("updateDecisionInputSchema", () => {
  it("parses the real tool-call arguments captured in T04", () => {
    const capture = recorded("chat-stream-tool-call");
    const args = capture.response.rawText
      .split("\n")
      .filter((l: string) => l.startsWith("data: ") && !l.includes("[DONE]"))
      .map((l: string) => JSON.parse(l.slice(6)))
      .flatMap((e: { choices?: { delta?: { tool_calls?: { function?: { arguments?: string } }[] } }[] }) => e.choices ?? [])
      .flatMap((c: { delta?: { tool_calls?: { function?: { arguments?: string } }[] } }) => c.delta?.tool_calls ?? [])
      .map((t: { function?: { arguments?: string } }) => t.function?.arguments ?? "")
      .join("");
    const parsed = updateDecisionInputSchema.parse(JSON.parse(args));
    expect(parsed.claimedDeliveryDate).toBe("2026-11-15");
    expect(parsed.newFactPl.length).toBeGreaterThanOrEqual(10);
  });
});
