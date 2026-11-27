import "server-only";

import { tool } from "ai";
import type { Decision, DecisionDraft, ImageAnalysis, UpdateDecisionInput, UpdateDecisionOutput } from "@/lib/shared/schemas/ai";
import { updateDecisionInputSchema } from "@/lib/shared/schemas/ai";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import type { CaseType } from "@/lib/shared/schemas/enums";
import { FALLBACK_TEXTS } from "@/server/ai/prompts/decision";
import { evaluateGates, validateDecision } from "@/server/guardrails";
import { log } from "@/server/log";

// Chat tool updateDecision (ADR-001 §3.8, TD-104). The model proposes a new draft; the same
// deterministic guardrails as the decision agent check it before a new version is stored.

export interface UpdateDecisionContext {
  caseType: CaseType;
  form: CaseFormInput;
  analysis: ImageAnalysis;
  today: string;
  policyRuleIds: ReadonlySet<string>;
  currentDecision: Decision;
  nextVersion: number;
  recordDecision(decision: Decision): void;
  now?: () => Date;
}

const DESCRIPTION =
  "Issue an updated preliminary decision ONLY when the customer states a new fact that changes how a policy rule applies " +
  "(for example a later delivery date or details of a malfunction the photo cannot show). " +
  "Never call it because the customer insists or repeats a request.";

export async function executeUpdateDecision(
  input: UpdateDecisionInput,
  ctx: UpdateDecisionContext,
): Promise<UpdateDecisionOutput> {
  const claimed = input.claimedDeliveryDate;
  // ISO dates compare correctly as strings.
  if (claimed !== null && (claimed < ctx.form.purchaseDate || claimed > ctx.today)) {
    return { accepted: false, reason: "INVALID_DELIVERY_DATE", violations: [] };
  }

  const gates = evaluateGates({
    caseType: ctx.caseType,
    startDate: claimed ?? ctx.form.purchaseDate,
    today: ctx.today,
    analysis: ctx.analysis,
  });

  const currentQuestions = ctx.currentDecision.clarifyingQuestionsPl;
  const draft: DecisionDraft = {
    outcome: input.outcome,
    remedy: input.remedy,
    citedRuleIds: input.citedRuleIds,
    justificationPl: input.justificationPl,
    nextStepsPl: input.nextStepsPl,
    photoSummaryPl: ctx.currentDecision.photoSummaryPl,
    clarifyingQuestionsPl:
      input.outcome === "MANUAL_REVIEW"
        ? currentQuestions.length > 0
          ? currentQuestions
          : [FALLBACK_TEXTS.clarifyingQuestionPl]
        : [],
  };

  const checked = validateDecision({
    caseType: ctx.caseType,
    draft,
    gates,
    policyRuleIds: ctx.policyRuleIds,
    analysis: ctx.analysis,
  });
  if (!checked.ok) return { accepted: false, reason: "VIOLATIONS", violations: checked.violations };

  const now = ctx.now ?? (() => new Date());
  const decision: Decision = {
    ...checked.draft,
    version: ctx.nextVersion,
    source: "chat_update",
    appliedGuardrails: [],
    createdAt: now().toISOString(),
  };
  ctx.recordDecision(decision);
  log.info("decision_updated", { version: decision.version, outcome: decision.outcome });
  return { accepted: true, decision };
}

export function createUpdateDecisionTool(ctx: UpdateDecisionContext) {
  return tool({
    description: DESCRIPTION,
    inputSchema: updateDecisionInputSchema,
    execute: (input: UpdateDecisionInput) => executeUpdateDecision(input, ctx),
  });
}
