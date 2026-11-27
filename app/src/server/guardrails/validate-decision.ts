import "server-only";
import { containsMoneyAmount } from "./money";
import type { DecisionDraft, GateResult, ImageAnalysis } from "@/lib/shared/schemas/ai";
import type { CaseType, Outcome, Remedy } from "@/lib/shared/schemas/enums";

// ADR-001 §3.5: deterministic checks on the model's draft. Violations block the draft;
// citation cleanup is a repair, not a violation.
const ALLOWED_REMEDIES: Record<CaseType, Record<Outcome, ReadonlyArray<Remedy | null>>> = {
  return: {
    ACCEPT: ["FULL_REFUND", "REDUCED_REFUND"],
    REJECT: [null],
    MANUAL_REVIEW: [null],
  },
  complaint: {
    ACCEPT: ["REPAIR", "REPLACEMENT", "PRICE_REDUCTION_OR_REFUND"],
    REJECT: ["PAID_REPAIR", null],
    MANUAL_REVIEW: [null],
  },
};

const codePoints = (text: string): number => [...text].length;
const textOk = (text: string, max: number): boolean => codePoints(text) >= 1 && codePoints(text) <= max;

export function validateDecision({
  caseType,
  draft,
  gates,
  policyRuleIds,
  analysis,
}: {
  caseType: CaseType;
  draft: DecisionDraft;
  gates: GateResult;
  policyRuleIds: ReadonlySet<string>;
  analysis: ImageAnalysis;
}): { ok: boolean; draft: DecisionDraft; violations: string[] } {
  const violations: string[] = [];
  const add = (code: string) => {
    if (!violations.includes(code)) violations.push(code);
  };

  // 1. Forced outcome from the image and timing gates.
  if (gates.forcedOutcome !== null && draft.outcome !== gates.forcedOutcome) add("FORCED_OUTCOME_MISMATCH");

  // 2. Remedy matrix.
  if (!ALLOWED_REMEDIES[caseType][draft.outcome].includes(draft.remedy)) add("REMEDY_NOT_ALLOWED");

  // 3. Complaint rejected for an unclear cause while still inside the window (AC-27).
  if (
    caseType === "complaint" &&
    analysis.likelyCause === "unclear" &&
    gates.timing.status === "within" &&
    draft.outcome === "REJECT"
  ) {
    add("REJECT_WITH_UNCLEAR_CAUSE");
  }

  // 4. Citations are repaired, not rejected: keep policy IDs with the right prefix, then add required IDs.
  const prefix = caseType === "return" ? "R-" : "C-";
  const citedRuleIds: string[] = [];
  for (const id of draft.citedRuleIds) {
    if (policyRuleIds.has(id) && id.startsWith(prefix) && !citedRuleIds.includes(id)) citedRuleIds.push(id);
  }
  for (const id of gates.requiredRuleIds) {
    if (!citedRuleIds.includes(id)) citedRuleIds.push(id);
  }

  // 5. Length and count limits, measured in code points.
  if (!textOk(draft.photoSummaryPl, 500)) add("TEXT_LENGTH:photoSummaryPl");
  if (!textOk(draft.justificationPl, 1200)) add("TEXT_LENGTH:justificationPl");

  if (draft.nextStepsPl.length < 2 || draft.nextStepsPl.length > 5) add("NEXT_STEPS_COUNT");
  if (draft.nextStepsPl.some((step) => !textOk(step, 200))) add("TEXT_LENGTH:nextStepsPl");

  if (draft.clarifyingQuestionsPl.length > 3) add("CLARIFYING_QUESTIONS");
  if (draft.clarifyingQuestionsPl.some((question) => !textOk(question, 200))) add("CLARIFYING_QUESTIONS");
  if (draft.outcome === "MANUAL_REVIEW" && draft.clarifyingQuestionsPl.length === 0) add("CLARIFYING_QUESTIONS");

  // 7. No money amounts in customer-facing text.
  const texts = [
    draft.photoSummaryPl,
    draft.justificationPl,
    ...draft.nextStepsPl,
    ...draft.clarifyingQuestionsPl,
  ];
  if (texts.some(containsMoneyAmount)) add("MONEY_AMOUNT");

  return {
    ok: violations.length === 0,
    draft: { ...draft, citedRuleIds },
    violations,
  };
}
