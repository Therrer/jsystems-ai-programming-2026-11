import { describe, expect, it } from "vitest";
import type { ImageAnalysis, DecisionDraft, GateResult } from "@/lib/shared/schemas/ai";
import type { CaseType, Outcome, Remedy } from "@/lib/shared/schemas/enums";
import { validateDecision } from "@/server/guardrails/validate-decision";

const POLICY = new Set(["R-1.1", "R-2.1", "R-2.3", "R-2.4", "R-3.2", "R-3.3"]);
// Complaint-rule IDs are needed for the complaint-case citation tests; the brief's set holds only R-* IDs.
const POLICY_WITH_COMPLAINTS = new Set([...POLICY, "C-2.1", "C-2.4", "C-2.5", "C-3.2"]);

const BASE_DRAFT: DecisionDraft = {
  outcome: "ACCEPT",
  remedy: "FULL_REFUND",
  citedRuleIds: ["R-2.1", "R-3.2"],
  photoSummaryPl: "Laptop bez widocznych śladów użytkowania.",
  justificationPl: "Zwrot mieści się w terminie (R-2.1) i urządzenie nie nosi śladów użytkowania (R-3.2).",
  nextStepsPl: ["Wypełnij oświadczenie o zwrocie.", "Odeślij laptopa z akcesoriami."],
  clarifyingQuestionsPl: [],
};

function draft(overrides: Partial<DecisionDraft> = {}): DecisionDraft {
  return { ...BASE_DRAFT, citedRuleIds: [...BASE_DRAFT.citedRuleIds], ...overrides };
}

function gates(overrides: Partial<GateResult> = {}): GateResult {
  return {
    timing: {
      status: "within",
      startDate: "2026-11-20",
      today: "2026-11-26",
      daysSinceStart: 6,
      deadline: "2026-12-04",
      ruleId: "R-2.1",
    },
    forcedOutcome: null,
    requiredRuleIds: ["R-2.1"],
    reasonCodes: [],
    ...overrides,
  };
}

const ANALYSIS = {
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
  observationsPl: "Laptop.",
  lunaVerification: [],
} as ImageAnalysis;

function run(args: {
  caseType?: CaseType;
  draft?: Partial<DecisionDraft>;
  gates?: Partial<GateResult>;
  analysis?: Partial<ImageAnalysis>;
}) {
  return validateDecision({
    caseType: args.caseType ?? "return",
    draft: draft(args.draft),
    gates: gates(args.gates),
    policyRuleIds: POLICY_WITH_COMPLAINTS,
    analysis: { ...ANALYSIS, ...args.analysis } as ImageAnalysis,
  });
}

function complaintDraft(outcome: Outcome, remedy: Remedy | null, extra: Partial<DecisionDraft> = {}) {
  return { outcome, remedy, citedRuleIds: ["C-2.1"], ...extra };
}

describe("validateDecision: happy path and citations", () => {
  it("accepts a valid return ACCEPT/FULL_REFUND draft and keeps citations unchanged", () => {
    const result = run({});
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.draft.citedRuleIds).toEqual(["R-2.1", "R-3.2"]);
  });

  it("removes unknown rule IDs and appends the required rule without a violation", () => {
    const result = run({ draft: { citedRuleIds: ["R-9.9", "R-3.2"] } });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.draft.citedRuleIds).toEqual(["R-3.2", "R-2.1"]);
  });

  it("removes a complaint-prefixed ID from a return draft", () => {
    const result = run({ draft: { citedRuleIds: ["C-2.1", "R-3.2"] } });
    expect(result.ok).toBe(true);
    expect(result.draft.citedRuleIds).toEqual(["R-3.2", "R-2.1"]);
  });

  it("removes a return-prefixed ID from a complaint draft", () => {
    const result = run({
      caseType: "complaint",
      gates: { requiredRuleIds: ["C-2.1"] },
      draft: complaintDraft("ACCEPT", "REPAIR", { citedRuleIds: ["R-2.1", "C-3.2"] }),
    });
    expect(result.draft.citedRuleIds).toEqual(["C-3.2", "C-2.1"]);
    expect(result.ok).toBe(true);
  });

  it("does not duplicate a required ID that is already cited", () => {
    const result = run({ draft: { citedRuleIds: ["R-2.1", "R-2.1", "R-3.2"] } });
    expect(result.draft.citedRuleIds).toEqual(["R-2.1", "R-3.2"]);
  });
});

describe("validateDecision: FORCED_OUTCOME_MISMATCH (violation 1)", () => {
  it("flags a draft whose outcome differs from the forced outcome", () => {
    const result = run({
      gates: { forcedOutcome: "REJECT", reasonCodes: ["TIMING_OUTSIDE"] },
      draft: { outcome: "ACCEPT", remedy: "FULL_REFUND" },
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("FORCED_OUTCOME_MISMATCH");
  });

  it("does not flag when the outcome equals the forced outcome", () => {
    const result = run({
      gates: { forcedOutcome: "MANUAL_REVIEW", reasonCodes: ["TIMING_BUFFER"] },
      draft: { outcome: "MANUAL_REVIEW", remedy: null, clarifyingQuestionsPl: ["Kiedy otrzymałeś paczkę?"] },
    });
    expect(result.violations).not.toContain("FORCED_OUTCOME_MISMATCH");
  });
});

describe("validateDecision: REMEDY_NOT_ALLOWED (violation 2)", () => {
  const matrix: Array<{ caseType: CaseType; outcome: Outcome; allowed: Array<Remedy | null> }> = [
    { caseType: "return", outcome: "ACCEPT", allowed: ["FULL_REFUND", "REDUCED_REFUND"] },
    { caseType: "return", outcome: "REJECT", allowed: [null] },
    { caseType: "return", outcome: "MANUAL_REVIEW", allowed: [null] },
    { caseType: "complaint", outcome: "ACCEPT", allowed: ["REPAIR", "REPLACEMENT", "PRICE_REDUCTION_OR_REFUND"] },
    { caseType: "complaint", outcome: "REJECT", allowed: ["PAID_REPAIR", null] },
    { caseType: "complaint", outcome: "MANUAL_REVIEW", allowed: [null] },
  ];

  const remedies: Array<Remedy | null> = [
    null,
    "FULL_REFUND",
    "REDUCED_REFUND",
    "REPAIR",
    "REPLACEMENT",
    "PRICE_REDUCTION_OR_REFUND",
    "PAID_REPAIR",
  ];

  for (const row of matrix) {
    for (const remedy of remedies) {
      const isAllowed = row.allowed.includes(remedy);
      it(`${row.caseType} ${row.outcome} with remedy ${remedy ?? "null"} -> ${isAllowed ? "allowed" : "REMEDY_NOT_ALLOWED"}`, () => {
        const citedRuleIds = row.caseType === "return" ? ["R-2.1"] : ["C-2.1"];
        const result = run({
          caseType: row.caseType,
          gates: { requiredRuleIds: citedRuleIds },
          draft: {
            outcome: row.outcome,
            remedy,
            citedRuleIds,
            clarifyingQuestionsPl: row.outcome === "MANUAL_REVIEW" ? ["Pytanie?"] : [],
          },
          analysis: { likelyCause: row.caseType === "complaint" && row.outcome === "REJECT" ? "impact" : null },
        });
        if (isAllowed) {
          expect(result.violations).not.toContain("REMEDY_NOT_ALLOWED");
        } else {
          expect(result.violations).toContain("REMEDY_NOT_ALLOWED");
          expect(result.ok).toBe(false);
        }
      });
    }
  }
});

describe("validateDecision: REJECT_WITH_UNCLEAR_CAUSE (violation 3, AC-27)", () => {
  it("flags a complaint REJECT with unclear cause inside the window", () => {
    const result = run({
      caseType: "complaint",
      gates: { requiredRuleIds: ["C-2.1"] },
      draft: complaintDraft("REJECT", null, { citedRuleIds: ["C-2.1"] }),
      analysis: { likelyCause: "unclear" },
    });
    expect(result.violations).toContain("REJECT_WITH_UNCLEAR_CAUSE");
    expect(result.ok).toBe(false);
  });

  it("does not flag an unclear cause when the case is outside the window", () => {
    const result = run({
      caseType: "complaint",
      gates: {
        timing: { ...gates().timing, status: "outside", ruleId: "C-2.5" },
        forcedOutcome: "REJECT",
        requiredRuleIds: ["C-2.5"],
        reasonCodes: ["TIMING_OUTSIDE"],
      },
      draft: complaintDraft("REJECT", null, { citedRuleIds: ["C-2.5"] }),
      analysis: { likelyCause: "unclear" },
    });
    expect(result.violations).not.toContain("REJECT_WITH_UNCLEAR_CAUSE");
  });

  it("does not flag a complaint REJECT with a known cause", () => {
    const result = run({
      caseType: "complaint",
      gates: { requiredRuleIds: ["C-2.1"] },
      draft: complaintDraft("REJECT", null, { citedRuleIds: ["C-2.1"] }),
      analysis: { likelyCause: "normal_wear" },
    });
    expect(result.violations).not.toContain("REJECT_WITH_UNCLEAR_CAUSE");
  });
});

describe("validateDecision: length and count limits (violation 5)", () => {
  it("flags an empty photoSummaryPl", () => {
    const result = run({ draft: { photoSummaryPl: "" } });
    expect(result.violations).toContain("TEXT_LENGTH:photoSummaryPl");
  });

  it("flags a photoSummaryPl of 501 code points and accepts 500", () => {
    expect(run({ draft: { photoSummaryPl: "a".repeat(501) } }).violations).toContain("TEXT_LENGTH:photoSummaryPl");
    expect(run({ draft: { photoSummaryPl: "a".repeat(500) } }).violations).not.toContain("TEXT_LENGTH:photoSummaryPl");
  });

  it("counts code points, not UTF-16 units", () => {
    // 500 emoji = 1000 UTF-16 units but 500 code points: must pass.
    const emoji = "😀".repeat(500);
    expect(run({ draft: { photoSummaryPl: emoji } }).violations).not.toContain("TEXT_LENGTH:photoSummaryPl");
    expect(run({ draft: { photoSummaryPl: "😀".repeat(501) } }).violations).toContain("TEXT_LENGTH:photoSummaryPl");
  });

  it("flags an empty justificationPl and one of 1201 code points; accepts 1200", () => {
    expect(run({ draft: { justificationPl: "" } }).violations).toContain("TEXT_LENGTH:justificationPl");
    expect(run({ draft: { justificationPl: "b".repeat(1201) } }).violations).toContain("TEXT_LENGTH:justificationPl");
    expect(run({ draft: { justificationPl: "b".repeat(1200) } }).violations).not.toContain("TEXT_LENGTH:justificationPl");
  });

  it("flags nextStepsPl with fewer than 2 or more than 5 items", () => {
    expect(run({ draft: { nextStepsPl: ["Jeden krok."] } }).violations).toContain("NEXT_STEPS_COUNT");
    expect(run({ draft: { nextStepsPl: ["a", "b", "c", "d", "e", "f"] } }).violations).toContain("NEXT_STEPS_COUNT");
    expect(run({ draft: { nextStepsPl: ["a", "b", "c", "d", "e"] } }).violations).not.toContain("NEXT_STEPS_COUNT");
  });

  it("flags a nextStepsPl item that is empty or longer than 200 code points", () => {
    expect(run({ draft: { nextStepsPl: ["", "ok"] } }).violations).toContain("TEXT_LENGTH:nextStepsPl");
    expect(run({ draft: { nextStepsPl: ["c".repeat(201), "ok"] } }).violations).toContain("TEXT_LENGTH:nextStepsPl");
    expect(run({ draft: { nextStepsPl: ["c".repeat(200), "ok"] } }).violations).not.toContain("TEXT_LENGTH:nextStepsPl");
  });

  it("flags more than 3 clarifying questions", () => {
    const result = run({ draft: { clarifyingQuestionsPl: ["a?", "b?", "c?", "d?"] } });
    expect(result.violations).toContain("CLARIFYING_QUESTIONS");
  });

  it("flags a clarifying question longer than 200 code points", () => {
    const result = run({ draft: { clarifyingQuestionsPl: ["q".repeat(201)] } });
    expect(result.violations).toContain("CLARIFYING_QUESTIONS");
  });

  it("requires at least one clarifying question for MANUAL_REVIEW", () => {
    const result = run({
      gates: { forcedOutcome: "MANUAL_REVIEW", reasonCodes: ["TIMING_BUFFER"] },
      draft: { outcome: "MANUAL_REVIEW", remedy: null, clarifyingQuestionsPl: [] },
    });
    expect(result.violations).toContain("CLARIFYING_QUESTIONS");
  });

  it("accepts zero clarifying questions for ACCEPT", () => {
    expect(run({ draft: { clarifyingQuestionsPl: [] } }).violations).not.toContain("CLARIFYING_QUESTIONS");
  });
});

describe("validateDecision: MONEY_AMOUNT (violation 7)", () => {
  it.each([
    ["photoSummaryPl", { photoSummaryPl: "Zwrot 1299 zł." }],
    ["justificationPl", { justificationPl: "Kwota 50 PLN zostanie zwrócona (R-2.1)." }],
    ["nextStepsPl", { nextStepsPl: ["Oczekuj wpłaty 30€.", "Odeślij laptopa."] }],
    [
      "clarifyingQuestionsPl",
      {
        outcome: "MANUAL_REVIEW" as const,
        remedy: null,
        clarifyingQuestionsPl: ["Czy kwota 1 299,00 PLN jest poprawna?"],
      },
    ],
  ] as Array<[string, Partial<DecisionDraft>]>)("flags a money amount in %s", (_field, override) => {
    const result = run({
      draft: override,
      gates: override.outcome === "MANUAL_REVIEW" ? { forcedOutcome: "MANUAL_REVIEW", reasonCodes: ["TIMING_BUFFER"] } : {},
    });
    expect(result.violations).toContain("MONEY_AMOUNT");
    expect(result.ok).toBe(false);
  });

  it("does not flag day counts and rule IDs", () => {
    const result = run({
      draft: {
        photoSummaryPl: "Laptop, 14 dni od zakupu.",
        justificationPl: "Zgodnie z R-2.1 i C-2.4 i 7 dni.",
      },
    });
    expect(result.violations).not.toContain("MONEY_AMOUNT");
  });
});

describe("validateDecision: TAC-001-01 forced-outcome table", () => {
  type TimingCase = { status: "within" | "buffer" | "outside" };
  const timingCases: TimingCase[] = [{ status: "within" }, { status: "buffer" }, { status: "outside" }];
  const imageCases = [
    { name: "ok", analysis: {}, expectGate: null },
    { name: "unusable", analysis: { imageUsable: false, unusableReason: "blurry" as const }, expectGate: "MANUAL_REVIEW" as Outcome },
  ];
  const caseTypes: CaseType[] = ["return", "complaint"];
  const outcomes: Outcome[] = ["ACCEPT", "REJECT", "MANUAL_REVIEW"];

  for (const caseType of caseTypes) {
    for (const timing of timingCases) {
      for (const image of imageCases) {
        it(`${caseType} / ${timing.status} / image ${image.name}: a forced outcome rejects any other outcome`, () => {
          const ruleIds: Record<CaseType, Record<TimingCase["status"], string>> = {
            return: { within: "R-2.1", buffer: "R-2.3", outside: "R-2.4" },
            complaint: { within: "C-2.1", buffer: "C-2.4", outside: "C-2.5" },
          };
          const ruleId = ruleIds[caseType][timing.status];
          const forced: Outcome | null =
            timing.status === "outside" ? "REJECT" : timing.status === "buffer" ? "MANUAL_REVIEW" : image.expectGate;
          const reasonCodes: string[] = [];
          if (timing.status === "outside") reasonCodes.push("TIMING_OUTSIDE");
          if (timing.status === "buffer") reasonCodes.push("TIMING_BUFFER");
          if (image.expectGate) reasonCodes.push("IMAGE_UNUSABLE");
          if (forced === null) return;

          const gatesValue: Partial<GateResult> = {
            timing: { ...gates().timing, status: timing.status, ruleId },
            forcedOutcome: forced,
            requiredRuleIds: [ruleId],
            reasonCodes,
          };
          for (const outcome of outcomes) {
            const remedy: Remedy | null =
              outcome === "ACCEPT"
                ? caseType === "return"
                  ? "FULL_REFUND"
                  : "REPAIR"
                : outcome === "REJECT" && caseType === "complaint"
                  ? "PAID_REPAIR"
                  : null;
            const result = run({
              caseType,
              gates: gatesValue,
              analysis: { ...image.analysis },
              draft: {
                outcome,
                remedy,
                citedRuleIds: [ruleId],
                clarifyingQuestionsPl: outcome === "MANUAL_REVIEW" ? ["Pytanie?"] : [],
              },
            });
            if (outcome === forced) {
              expect(result.violations).not.toContain("FORCED_OUTCOME_MISMATCH");
            } else {
              expect(result.violations).toContain("FORCED_OUTCOME_MISMATCH");
              expect(result.ok).toBe(false);
            }
          }
        });
      }
    }
  }
});
