import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decisionSchema, updateDecisionInputSchema, type Decision, type ImageAnalysis, type UpdateDecisionInput } from "@/lib/shared/schemas/ai";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import { executeUpdateDecision, type UpdateDecisionContext } from "@/server/ai/update-decision-tool";
import { loadPolicies } from "@/server/policies";

// The tool arguments are the recorded updateDecision call (chat-stream-tool-call.json), unchanged
// unless a test says otherwise. Each test changes one field and names the change.

const RECORDED_DIR = path.resolve(import.meta.dirname, "../../fixtures/recorded");
const POLICIES_DIR = path.resolve(import.meta.dirname, "../../../../docs/policies");
const TODAY = "2026-11-26";
const NOW_ISO = "2026-11-26T10:00:00.000Z";

interface RecordedStream {
  response: { rawText: string };
}

interface StreamFrame {
  choices: Array<{ delta: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
}

// Joins the streamed fragments of the tool-call arguments (the recording is a SSE body).
function recordedToolArguments(): UpdateDecisionInput {
  const raw = JSON.parse(
    fs.readFileSync(path.join(RECORDED_DIR, "chat-stream-tool-call.json"), "utf8"),
  ) as RecordedStream;
  const fragments: string[] = [];
  for (const block of raw.response.rawText.split("\n\n")) {
    if (!block.startsWith("data: ") || block === "data: [DONE]") continue;
    const frame = JSON.parse(block.slice("data: ".length)) as StreamFrame;
    for (const choice of frame.choices) {
      for (const call of choice.delta.tool_calls ?? []) fragments.push(call.function.arguments);
    }
  }
  return updateDecisionInputSchema.parse(JSON.parse(fragments.join("")));
}

const analysis: ImageAnalysis = {
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
  observationsPl: "Laptop bez widocznych śladów użytkowania.",
  lunaVerification: [],
};

const form: CaseFormInput = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-08",
  description: "Laptop działa dobrze, ale kurier dostarczył go później.",
};

// Current decision v1: MANUAL_REVIEW with one clarifying question.
const currentDecision: Decision = decisionSchema.parse({
  outcome: "MANUAL_REVIEW",
  remedy: null,
  citedRuleIds: ["R-2.3"],
  photoSummaryPl: "Laptop bez widocznych śladów użytkowania.",
  justificationPl: "Zwrot wymaga sprawdzenia terminu.",
  nextStepsPl: ["Podaj datę dostawy.", "Zachowaj potwierdzenie zakupu."],
  clarifyingQuestionsPl: ["Kiedy otrzymałeś przesyłkę?"],
  version: 1,
  source: "initial",
  appliedGuardrails: [],
  createdAt: NOW_ISO,
});

const policyRuleIds = loadPolicies(POLICIES_DIR).return.ruleIds;

function contextWith(overrides: Partial<UpdateDecisionContext> = {}) {
  const recorded: Decision[] = [];
  const ctx: UpdateDecisionContext = {
    caseType: "return",
    form,
    analysis,
    today: TODAY,
    policyRuleIds,
    currentDecision,
    nextVersion: 2,
    recordDecision: (decision) => {
      recorded.push(decision);
    },
    now: () => new Date(NOW_ISO),
    ...overrides,
  };
  return { ctx, recorded };
}

describe("executeUpdateDecision", () => {
  it("accepts a valid later delivery date, keeps the clarifying question and records the decision", async () => {
    const { ctx, recorded } = contextWith();

    const result = await executeUpdateDecision({ ...recordedToolArguments(), claimedDeliveryDate: "2026-11-15" }, ctx);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.decision.version).toBe(2);
    expect(result.decision.source).toBe("chat_update");
    expect(result.decision.outcome).toBe("MANUAL_REVIEW");
    expect(result.decision.clarifyingQuestionsPl).toHaveLength(1);
    expect(result.decision.clarifyingQuestionsPl[0]).toBe("Kiedy otrzymałeś przesyłkę?");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.version).toBe(2);
  });

  it("rejects a delivery date before the purchase date with INVALID_DELIVERY_DATE", async () => {
    const { ctx, recorded } = contextWith();

    const result = await executeUpdateDecision({ ...recordedToolArguments(), claimedDeliveryDate: "2026-11-07" }, ctx);

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("INVALID_DELIVERY_DATE");
    expect(recorded).toHaveLength(0);
  });

  it("rejects a delivery date after today with INVALID_DELIVERY_DATE", async () => {
    const { ctx, recorded } = contextWith();

    const result = await executeUpdateDecision({ ...recordedToolArguments(), claimedDeliveryDate: "2026-11-27" }, ctx);

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("INVALID_DELIVERY_DATE");
    expect(recorded).toHaveLength(0);
  });

  it("reports REMEDY_NOT_ALLOWED for ACCEPT without a remedy (derived: outcome ACCEPT, remedy null)", async () => {
    const { ctx, recorded } = contextWith();

    const result = await executeUpdateDecision(
      { ...recordedToolArguments(), claimedDeliveryDate: "2026-11-15", outcome: "ACCEPT", remedy: null },
      ctx,
    );

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("VIOLATIONS");
    expect(result.violations).toContain("REMEDY_NOT_ALLOWED");
    expect(recorded).toHaveLength(0);
  });

  it("reports FORCED_OUTCOME_MISMATCH when the claimed date is null and the timing gate forces MANUAL_REVIEW (derived: claimedDeliveryDate null, outcome ACCEPT, remedy FULL_REFUND)", async () => {
    const { ctx, recorded } = contextWith();

    const result = await executeUpdateDecision(
      { ...recordedToolArguments(), claimedDeliveryDate: null, outcome: "ACCEPT", remedy: "FULL_REFUND" },
      ctx,
    );

    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("VIOLATIONS");
    expect(result.violations).toContain("FORCED_OUTCOME_MISMATCH");
    expect(recorded).toHaveLength(0);
  });
});
