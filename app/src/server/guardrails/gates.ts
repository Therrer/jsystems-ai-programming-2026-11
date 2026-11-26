import "server-only";
import { computeTiming } from "./timing";
import type { GateResult, ImageAnalysis } from "@/lib/shared/schemas/ai";
import type { CaseType, Outcome } from "@/lib/shared/schemas/enums";

// ADR-001 §3.5 rules 1-2: timing and image gates, in priority order. The first triggered gate
// sets forcedOutcome; every triggered gate contributes reason codes.
export function evaluateGates({
  caseType,
  startDate,
  today,
  analysis,
}: {
  caseType: CaseType;
  startDate: string;
  today: string;
  analysis: ImageAnalysis;
}): GateResult {
  const timing = computeTiming({ caseType, startDate, today });
  const triggered: Array<{ outcome: Outcome; codes: string[] }> = [];

  if (timing.status === "outside") triggered.push({ outcome: "REJECT", codes: ["TIMING_OUTSIDE"] });
  if (timing.status === "buffer") triggered.push({ outcome: "MANUAL_REVIEW", codes: ["TIMING_BUFFER"] });

  if (analysis.imageUsable === false || analysis.deviceVisible === false) {
    const codes = ["IMAGE_UNUSABLE"];
    if (analysis.unusableReason !== null) codes.push(`IMAGE_UNUSABLE:${analysis.unusableReason}`);
    triggered.push({ outcome: "MANUAL_REVIEW", codes });
  }

  if (analysis.categoryMatch === "mismatch") {
    triggered.push({ outcome: "MANUAL_REVIEW", codes: [`CATEGORY_MISMATCH:${analysis.detectedCategory}`] });
  }

  return {
    timing,
    forcedOutcome: triggered[0]?.outcome ?? null,
    requiredRuleIds: [timing.ruleId],
    reasonCodes: triggered.flatMap((gate) => gate.codes),
  };
}
