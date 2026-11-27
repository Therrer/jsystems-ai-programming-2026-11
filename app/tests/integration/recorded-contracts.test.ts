import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decisionDraftSchema, imageAnalysisSchema } from "@/lib/shared/schemas/ai";
import { normalizeAnswers } from "@/server/ai/luna";
import { evaluateGates, validateDecision } from "@/server/guardrails";
import { loadPolicies } from "@/server/policies";

// T21 reconciliation: the real responses recorded with the final prompts and schemas (final-*.json,
// app-*.json) still match the contracts the code and the fixtures derived from older captures rely on.
const RECORDED = path.resolve(import.meta.dirname, "../fixtures/recorded");
const REPO = path.resolve(import.meta.dirname, "../../..");
const recorded = (name: string) => JSON.parse(readFileSync(path.join(RECORDED, name), "utf8"));
const lastBody = (name: string) => recorded(name).exchanges.at(-1).response.body;

describe("final recorded stage responses", () => {
  it("Luna answers normalize to a full signal set with a category match", () => {
    const { signals, status, derivedCategoryMatch } = normalizeAnswers(lastBody("final-luna-return-laptop2.json").answers, "return", "laptop", 0.8);
    expect(status).toBe("ok");
    expect(signals.length).toBeGreaterThan(0);
    expect(derivedCategoryMatch).toBe("match");
  });

  it("vision content parses with the image analysis schema and the decision draft passes the guardrails", () => {
    const analysis = imageAnalysisSchema.parse(JSON.parse(lastBody("final-vision-return-laptop2.json").choices[0].message.content));
    const draft = decisionDraftSchema.parse(JSON.parse(lastBody("final-decision-return-laptop2.json").choices[0].message.content));
    const today = "2026-11-26";
    const gates = evaluateGates({ caseType: "return", startDate: "2026-11-21", today, analysis });
    const policies = loadPolicies(path.join(REPO, "docs/policies"));
    const result = validateDecision({ caseType: "return", draft, gates, policyRuleIds: policies.return.ruleIds, analysis });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("recorded app responses", () => {
  it("error bodies follow the ADR-002 §5.6 shape", () => {
    for (const name of ["app-cases-400-validation.json", "app-cases-415-not-an-image.json", "app-decision-404-unknown.json", "app-chat-404-unknown.json", "app-cases-502-invalid-key.json"]) {
      const { error } = recorded(name).response.body;
      expect(typeof error.code, name).toBe("string");
      expect(typeof error.messagePl, name).toBe("string");
    }
  });

  it("the streamed chat answer carries text and no reasoning", () => {
    const raw: string = recorded("app-chat-200-stream.json").response.rawText;
    expect(raw).toContain('"type":"text-delta"');
    expect(raw).not.toContain('"type":"reasoning');
  });

  it("the evaluation log line holds no customer text or image data", () => {
    const text = JSON.stringify(recorded("app-eval-line.json").line);
    expect(text).not.toMatch(/Lenovo|data:image|observationsPl|description/);
  });
});
