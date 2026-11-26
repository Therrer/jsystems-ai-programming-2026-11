import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMessage } from "@/components/case-chat/chat-message";
import { decisionSchema, type Decision, type UpdateDecisionInput } from "@/lib/shared/schemas/ai";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { DECISION_NOTICE } from "@/lib/shared/strings/common";
import {
  FAILED_MESSAGE,
  RETRY_BUTTON,
  UPDATED_DECISION_HEADING,
  UPDATING_DECISION,
} from "@/lib/shared/strings/chat";

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

const UPDATE_INPUT: UpdateDecisionInput = {
  newFactPl: "Klient podaje, że laptop był używany tylko do sprawdzenia.",
  claimedDeliveryDate: null,
  outcome: "ACCEPT",
  remedy: "FULL_REFUND",
  citedRuleIds: ["R-2.1", "R-3.2"],
  justificationPl: "Zwrot mieści się w terminie i nie stwierdzono śladów użytkowania.",
  nextStepsPl: ["Przekaż laptop do obsługi zwrotu."],
};

const GREETING = "Cześć! Oto wstępna ocena Twojej sprawy.";
const FIRST_MARKDOWN = [
  "### Co widzimy na zdjęciu",
  "Laptop bez widocznych **śladów** użytkowania.",
  "",
  "### Uzasadnienie",
  "Zwrot mieści się w terminie określonym w R-2.1.",
  "",
  "### Kolejne kroki",
  "1. Przekaż laptop do obsługi zwrotu.",
  "2. Zachowaj dowód zakupu.",
].join("\n");

afterEach(cleanup);

function precedes(first: Node, second: Node): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("first assistant message (AC-29, AC-41)", () => {
  it("renders greeting, decision block, the three headings and the notice in that order", () => {
    const message: CaseUIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "text", text: GREETING },
        { type: "data-decision", data: recordedDecision() },
        { type: "text", text: FIRST_MARKDOWN },
      ],
    };
    render(<ChatMessage message={message} time="10:27" />);

    const wrapper = screen.getByTestId("chat-message");
    expect(wrapper.getAttribute("data-role")).toBe("assistant");

    const greeting = screen.getByText(GREETING);
    const block = screen.getByTestId("decision-block");
    const headings = [
      screen.getByRole("heading", { name: "Co widzimy na zdjęciu" }),
      screen.getByRole("heading", { name: "Uzasadnienie" }),
      screen.getByRole("heading", { name: "Kolejne kroki" }),
    ];
    const notice = screen.getByRole("note");

    expect(precedes(greeting, block)).toBe(true);
    expect(precedes(block, headings[0]!)).toBe(true);
    expect(precedes(headings[0]!, headings[1]!)).toBe(true);
    expect(precedes(headings[1]!, headings[2]!)).toBe(true);
    expect(precedes(headings[2]!, notice)).toBe(true);
    expect(notice.textContent).toBe(DECISION_NOTICE);
    expect(wrapper.textContent?.endsWith(DECISION_NOTICE)).toBe(true);
  });

  it("shows markdown as rendered elements, not as literal markup", () => {
    const message: CaseUIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: FIRST_MARKDOWN }],
    };
    render(<ChatMessage message={message} time="10:27" />);

    const text = screen.getByTestId("chat-message").textContent ?? "";
    expect(text).toContain("śladów");
    expect(text).not.toContain("**");
    expect(text).not.toContain("###");
    expect(screen.queryByTestId("decision-block")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows the manual review outcome and its clarifying-questions heading", () => {
    const message: CaseUIMessage = {
      id: "a2",
      role: "assistant",
      parts: [
        { type: "data-decision", data: recordedDecision({ outcome: "MANUAL_REVIEW", remedy: null, clarifyingQuestionsPl: ["Czy laptop był używany?"] }) },
        { type: "text", text: "### Pytania do Ciebie\n1. Czy laptop był używany?" },
      ],
    };
    render(<ChatMessage message={message} time="10:27" />);

    expect(screen.getByTestId("decision-block").getAttribute("data-outcome")).toBe("MANUAL_REVIEW");
    expect(screen.getByRole("heading", { name: "Pytania do Ciebie" })).toBeTruthy();
  });
});

describe("unsafe and plain text", () => {
  it("renders no script and no img from raw HTML in assistant text", () => {
    const message: CaseUIMessage = {
      id: "a3",
      role: "assistant",
      parts: [{ type: "text", text: 'Uwaga <script>alert(1)</script> <img src="x" alt="x"> koniec' }],
    };
    const { container } = render(<ChatMessage message={message} time="10:27" />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows user text as plain text that keeps both lines", () => {
    const message: CaseUIMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "linia 1\nlinia 2" }],
    };
    const { container } = render(<ChatMessage message={message} time="10:30" />);

    const paragraph = screen.getByText(/linia 1/);
    expect(paragraph.textContent).toBe("linia 1\nlinia 2");
    expect(container.querySelector("strong,em,ul,ol,h1,h2,h3,h4,h5,h6,code,a")).toBeNull();
    expect(screen.getByTestId("chat-message").getAttribute("data-role")).toBe("user");
  });
});

describe("updateDecision tool parts", () => {
  it("shows the updated decision and the notice when the update is accepted", () => {
    const message: CaseUIMessage = {
      id: "a4",
      role: "assistant",
      parts: [
        {
          type: "tool-updateDecision",
          toolCallId: "call-1",
          state: "output-available",
          input: UPDATE_INPUT,
          output: { accepted: true, decision: recordedDecision({ version: 2, source: "chat_update" }) },
        },
      ],
    };
    render(<ChatMessage message={message} time="10:31" />);

    expect(screen.getByText(UPDATED_DECISION_HEADING)).toBeTruthy();
    expect(screen.getByTestId("decision-block").getAttribute("data-outcome")).toBe("ACCEPT");
    expect(screen.getByRole("note").textContent).toBe(DECISION_NOTICE);
  });

  it("shows neither a block nor a notice when the update is rejected", () => {
    const message: CaseUIMessage = {
      id: "a5",
      role: "assistant",
      parts: [
        {
          type: "tool-updateDecision",
          toolCallId: "call-2",
          state: "output-available",
          input: UPDATE_INPUT,
          output: { accepted: false, reason: "Zmiana narusza politykę.", violations: ["R-2.1"] },
        },
      ],
    };
    render(<ChatMessage message={message} time="10:31" />);

    expect(screen.queryByTestId("decision-block")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(UPDATED_DECISION_HEADING)).toBeNull();
  });

  it("shows the updating indicator while the tool input is available", () => {
    const message: CaseUIMessage = {
      id: "a6",
      role: "assistant",
      parts: [{ type: "tool-updateDecision", toolCallId: "call-3", state: "input-available", input: UPDATE_INPUT }],
    };
    render(<ChatMessage message={message} time="10:31" />);

    expect(screen.getByText(UPDATING_DECISION)).toBeTruthy();
    expect(screen.queryByTestId("decision-block")).toBeNull();
  });
});

describe("failed user message", () => {
  it("shows the failure text and a retry button that calls onRetry once", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const message: CaseUIMessage = { id: "u2", role: "user", parts: [{ type: "text", text: "Wiadomość" }] };
    render(<ChatMessage message={message} time="10:32" failed onRetry={onRetry} />);

    expect(screen.getByText(FAILED_MESSAGE)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: RETRY_BUTTON }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows no failure actions for a message that was sent", () => {
    const message: CaseUIMessage = { id: "u3", role: "user", parts: [{ type: "text", text: "Dzień dobry" }] };
    render(<ChatMessage message={message} time="10:32" />);

    expect(screen.queryByText(FAILED_MESSAGE)).toBeNull();
    expect(screen.queryByRole("button", { name: RETRY_BUTTON })).toBeNull();
  });
});
