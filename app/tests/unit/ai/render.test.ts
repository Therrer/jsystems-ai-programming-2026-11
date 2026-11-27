import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decisionSchema, type Decision } from "@/lib/shared/schemas/ai";
import { DECISION_NOTICE } from "@/lib/shared/strings/common";
import { renderFirstMessage } from "@/server/ai/render-first-message";

const RECORDED_DIR = path.resolve(import.meta.dirname, "../../fixtures/recorded");
const CREATED_AT = "2026-11-26T10:30:00.000Z";

// The decision is the recording's content (no derived edit) plus the stored fields; decisionSchema
// validates the result. The renderer does not run guardrails, so one next step is fine here.
function recordedDecision(overrides: Partial<Decision> = {}): Decision {
  const recording = JSON.parse(
    fs.readFileSync(path.join(RECORDED_DIR, "decision-structured-return.json"), "utf8"),
  ) as { response: { body: { choices: Array<{ message: { content: string } }> } } };
  const content = JSON.parse(recording.response.body.choices[0]!.message.content) as Record<string, unknown>;
  return decisionSchema.parse({
    ...content,
    version: 1,
    source: "initial",
    appliedGuardrails: [],
    createdAt: CREATED_AT,
    ...overrides,
  });
}

function textParts(message: ReturnType<typeof renderFirstMessage>): string[] {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []));
}

describe("renderFirstMessage", () => {
  it("returns an assistant message with the text, data and text parts in order (ADR-001 §3.7)", () => {
    const message = renderFirstMessage({
      caseType: "return",
      modelName: "Lenovo ThinkPad E14.",
      decision: recordedDecision(),
      createdAt: CREATED_AT,
      id: "msg-1",
    });

    expect(message.id).toBe("msg-1");
    expect(message.role).toBe("assistant");
    expect(message.metadata).toEqual({ createdAt: CREATED_AT });
    expect(message.parts.map((part) => part.type)).toEqual(["text", "data-decision", "text"]);
  });

  it("generates an id when none is given", () => {
    const message = renderFirstMessage({
      caseType: "return",
      modelName: "Lenovo ThinkPad E14",
      decision: recordedDecision(),
      createdAt: CREATED_AT,
    });

    expect(message.id.length).toBeGreaterThan(0);
  });

  it("writes the greeting with the lower-cased case label and the model name", () => {
    const message = renderFirstMessage({
      caseType: "return",
      modelName: "Lenovo ThinkPad E14",
      decision: recordedDecision(),
      createdAt: CREATED_AT,
    });

    const [greeting] = textParts(message);
    expect(greeting).toBe(
      "Dzień dobry! Jestem asystentem Example Electronics Store. Przeanalizowałem Twoje zgłoszenie: zwrot – Lenovo ThinkPad E14.",
    );
  });

  it("replaces newlines in the model name with spaces", () => {
    const message = renderFirstMessage({
      caseType: "complaint",
      modelName: "Lenovo\nThinkPad\r\nE14",
      decision: recordedDecision({ outcome: "REJECT", remedy: null, citedRuleIds: ["C-2.5"] }),
      createdAt: CREATED_AT,
    });

    const [greeting] = textParts(message);
    expect(greeting).toContain("zgłoszenie: reklamacja – Lenovo ThinkPad E14.");
  });

  it("carries the decision in the data part with the same outcome", () => {
    const decision = recordedDecision();
    const message = renderFirstMessage({ caseType: "return", modelName: "Lenovo ThinkPad E14", decision, createdAt: CREATED_AT });

    const dataPart = message.parts[1];
    expect(dataPart?.type).toBe("data-decision");
    expect(dataPart && "data" in dataPart ? dataPart.data.outcome : undefined).toBe("ACCEPT");
    expect(dataPart && "data" in dataPart ? dataPart.data.remedy : undefined).toBe("FULL_REFUND");
  });

  it("writes the three headings in order with the policy basis line", () => {
    const message = renderFirstMessage({
      caseType: "return",
      modelName: "Lenovo ThinkPad E14",
      decision: recordedDecision(),
      createdAt: CREATED_AT,
    });

    const markdown = textParts(message)[1] ?? "";
    const first = markdown.indexOf("### Co widzimy na zdjęciu");
    const second = markdown.indexOf("### Uzasadnienie");
    const third = markdown.indexOf("### Kolejne kroki");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(markdown).toContain("Podstawa: R-2.1, R-3.2");
    expect(markdown).toContain("1. Przekaż laptop do obsługi zwrotu");
  });

  it("adds the clarifying questions section only for MANUAL_REVIEW", () => {
    const manual = renderFirstMessage({
      caseType: "return",
      modelName: "Lenovo ThinkPad E14",
      decision: recordedDecision({
        outcome: "MANUAL_REVIEW",
        remedy: null,
        clarifyingQuestionsPl: ["Opisz proszę dokładniej stan urządzenia."],
      }),
      createdAt: CREATED_AT,
    });
    const accepted = renderFirstMessage({
      caseType: "return",
      modelName: "Lenovo ThinkPad E14",
      decision: recordedDecision({ clarifyingQuestionsPl: ["Pytanie, którego nie pokazujemy."] }),
      createdAt: CREATED_AT,
    });

    const manualMarkdown = textParts(manual)[1] ?? "";
    expect(manualMarkdown).toContain("### Pytania do Ciebie");
    expect(manualMarkdown).toContain("- Opisz proszę dokładniej stan urządzenia.");
    expect(textParts(accepted).join("\n")).not.toContain("### Pytania do Ciebie");
  });

  it("does not include the AC-41 notice, which the UI appends", () => {
    const message = renderFirstMessage({
      caseType: "return",
      modelName: "Lenovo ThinkPad E14",
      decision: recordedDecision(),
      createdAt: CREATED_AT,
    });

    expect(textParts(message).some((text) => text.includes(DECISION_NOTICE))).toBe(false);
  });
});
