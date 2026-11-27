import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DecisionBlock } from "@/components/case-chat/decision-block";
import { decisionSchema, type Decision } from "@/lib/shared/schemas/ai";
import { OUTCOME_LABELS, REMEDY_LABELS } from "@/lib/shared/strings/common";
import { UPDATED_DECISION_HEADING } from "@/lib/shared/strings/chat";

// The decision is built from the real T04 capture; only the code-set fields are added (ADR-001 §4).
const CAPTURE = path.resolve(import.meta.dirname, "../../fixtures/recorded/decision-structured-return.json");

function recordedDecision(overrides: Partial<Decision> = {}): Decision {
  const capture = JSON.parse(readFileSync(CAPTURE, "utf8")) as {
    response: { body: { choices: { message: { content: string } }[] } };
  };
  const content = capture.response.body.choices[0]?.message.content ?? "{}";
  return decisionSchema.parse({
    ...(JSON.parse(content) as object),
    version: 1,
    source: "initial",
    appliedGuardrails: [],
    createdAt: "2026-11-26T10:27:41.000Z",
    ...overrides,
  });
}

afterEach(cleanup);

describe("DecisionBlock per outcome", () => {
  it("ACCEPT with FULL_REFUND shows outcome, icon, basis and remedy", () => {
    render(<DecisionBlock decision={recordedDecision()} variant="initial" />);

    const block = screen.getByTestId("decision-block");
    expect(block.getAttribute("data-outcome")).toBe("ACCEPT");
    expect(within(block).getByText(OUTCOME_LABELS.ACCEPT)).toBeTruthy();
    expect(block.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(within(block).getByText("Podstawa: R-2.1, R-3.2")).toBeTruthy();
    expect(within(block).getByText(REMEDY_LABELS.FULL_REFUND)).toBeTruthy();
  });

  it("REJECT without remedy shows outcome, icon and basis but no remedy label", () => {
    render(<DecisionBlock decision={recordedDecision({ outcome: "REJECT", remedy: null })} variant="initial" />);

    const block = screen.getByTestId("decision-block");
    expect(block.getAttribute("data-outcome")).toBe("REJECT");
    expect(within(block).getByText(OUTCOME_LABELS.REJECT)).toBeTruthy();
    expect(block.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(within(block).getByText("Podstawa: R-2.1, R-3.2")).toBeTruthy();
    expect(Object.values(REMEDY_LABELS).some((label) => block.textContent?.includes(label))).toBe(false);
  });

  it("MANUAL_REVIEW without remedy shows outcome, icon and basis but no remedy label", () => {
    render(
      <DecisionBlock
        decision={recordedDecision({ outcome: "MANUAL_REVIEW", remedy: null, clarifyingQuestionsPl: ["Czy laptop był używany?"] })}
        variant="initial"
      />,
    );

    const block = screen.getByTestId("decision-block");
    expect(block.getAttribute("data-outcome")).toBe("MANUAL_REVIEW");
    expect(within(block).getByText(OUTCOME_LABELS.MANUAL_REVIEW)).toBeTruthy();
    expect(block.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(within(block).getByText("Podstawa: R-2.1, R-3.2")).toBeTruthy();
    expect(Object.values(REMEDY_LABELS).some((label) => block.textContent?.includes(label))).toBe(false);
  });
});

describe("DecisionBlock variants and styling", () => {
  it("shows the updated heading only for the updated variant", () => {
    const { unmount } = render(<DecisionBlock decision={recordedDecision()} variant="initial" />);
    expect(screen.queryByText(UPDATED_DECISION_HEADING)).toBeNull();
    unmount();

    render(<DecisionBlock decision={recordedDecision()} variant="updated" />);
    expect(screen.getByText(UPDATED_DECISION_HEADING)).toBeTruthy();
  });

  it("gives each outcome a different class (tint and left border), not color alone", () => {
    const classes = (["ACCEPT", "REJECT", "MANUAL_REVIEW"] as const).map((outcome) => {
      const { unmount } = render(
        <DecisionBlock decision={recordedDecision({ outcome, remedy: null })} variant="initial" />,
      );
      const className = screen.getByTestId("decision-block").className;
      unmount();
      return className;
    });

    expect(classes.every((className) => className.includes("border-l-4"))).toBe(true);
    expect(new Set(classes).size).toBe(3);
  });
});
