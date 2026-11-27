import "server-only";

import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { decisionDraftSchema, type DecisionDraft, type GateResult, type ImageAnalysis, type LunaSignals } from "@/lib/shared/schemas/ai";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import type { CaseType } from "@/lib/shared/schemas/enums";
import { getAiProvider } from "@/server/ai/provider";
import { correctionPrompt, decisionSystemPrompt, decisionUserPrompt, FALLBACK_TEXTS } from "@/server/ai/prompts/decision";
import { mapProviderError } from "@/server/errors";
import { log } from "@/server/log";
import { costFromProviderMetadata } from "@/server/ai/usage";
import type { Policy } from "@/server/policies";
import { validateDecision } from "@/server/guardrails";

// Decision agent (ADR-001 §3.5, TD-07, TAC-001-01). Any failure of the model call is mapped to a
// domain error; guardrail violations and schema failures use one corrective attempt, then a template.

export interface DecisionResult {
  draft: DecisionDraft;
  appliedGuardrails: string[];
  attempts: number;
}

export interface DecisionAgent {
  decide(input: {
    caseType: CaseType;
    form: CaseFormInput;
    analysis: ImageAnalysis;
    luna: LunaSignals;
    gates: GateResult;
    policy: Policy;
    today: string;
    signal?: AbortSignal;
  }): Promise<DecisionResult>;
}

const TOTAL_MS = 35_000;
const FIRST_ATTEMPT_MS = 25_000;
const MIN_RETRY_MS = 10_000;
const SCHEMA_VIOLATION = "SCHEMA";

export function createDecisionAgent(deps: {
  model: LanguageModel;
  totalMs?: number;
  firstAttemptMs?: number;
  minRetryMs?: number;
  now?: () => number;
}): DecisionAgent {
  const totalMs = deps.totalMs ?? TOTAL_MS;
  const firstAttemptMs = deps.firstAttemptMs ?? FIRST_ATTEMPT_MS;
  const minRetryMs = deps.minRetryMs ?? MIN_RETRY_MS;
  const now = deps.now ?? Date.now;

  const model = typeof deps.model === "string" ? deps.model : deps.model.modelId;

  return {
    async decide(input) {
      const start = now();
      const remaining = () => totalMs - (now() - start);
      const system = decisionSystemPrompt(input.caseType);
      const userPrompt = decisionUserPrompt({
        caseType: input.caseType,
        form: input.form,
        analysis: input.analysis,
        luna: input.luna,
        gates: input.gates,
        policy: input.policy,
        today: input.today,
      });

      // One model call. Returns the parsed output, or a schema violation when no object was produced.
      type Attempt = { kind: "output"; text: string; draft: DecisionDraft } | { kind: "schema" };
      const attempt = async (messages: Array<{ role: "user" | "assistant"; content: string }>, timeoutMs: number): Promise<Attempt> => {
        try {
          const callStarted = now();
          const result = await generateText({
            model: deps.model,
            system,
            messages,
            output: Output.object({ schema: decisionDraftSchema }),
            maxRetries: 1,
            timeout: { totalMs: timeoutMs },
            abortSignal: input.signal,
            // One line per model step, also for attempts whose output fails the schema (T24a).
            onStepEnd: (step) => {
              log.info("ai_call", {
                stage: "decision",
                model,
                durationMs: now() - callStarted,
                costUsd: costFromProviderMetadata(step.providerMetadata),
                step: step.stepNumber + 1,
              });
            },
          });
          return { kind: "output", text: JSON.stringify(result.output), draft: result.output };
        } catch (error) {
          if (NoObjectGeneratedError.isInstance(error)) return { kind: "schema" };
          throw mapProviderError(error);
        }
      };

      const check = (draft: DecisionDraft) =>
        validateDecision({
          caseType: input.caseType,
          draft,
          gates: input.gates,
          policyRuleIds: input.policy.ruleIds,
          analysis: input.analysis,
        });

      // Attempt 1.
      const first = await attempt([{ role: "user", content: userPrompt }], Math.min(firstAttemptMs, remaining()));
      let previous = "invalid";
      let violations: string[];
      if (first.kind === "schema") {
        violations = [SCHEMA_VIOLATION];
      } else {
        const checked = check(first.draft);
        if (checked.ok) return { draft: checked.draft, appliedGuardrails: [], attempts: 1 };
        violations = checked.violations;
        previous = first.text;
      }

      // Corrective attempt, only when the budget allows it.
      if (remaining() < minRetryMs) {
        return fallback(input.caseType, input.gates, violations, 1);
      }
      const second = await attempt(
        [
          { role: "user", content: userPrompt },
          { role: "assistant", content: previous },
          { role: "user", content: correctionPrompt(violations) },
        ],
        remaining(),
      );
      if (second.kind === "schema") return fallback(input.caseType, input.gates, [SCHEMA_VIOLATION], 2);
      const corrected = check(second.draft);
      if (corrected.ok) return { draft: corrected.draft, appliedGuardrails: ["CORRECTIVE_RETRY"], attempts: 2 };
      return fallback(input.caseType, input.gates, corrected.violations, 2);
    },
  };
}

function fallback(caseType: CaseType, gates: GateResult, violations: string[], attempts: number): DecisionResult {
  log.warn("decision_fallback", { violations: violations.join(","), attempts });
  return {
    draft: buildFallbackDraft(caseType, gates),
    appliedGuardrails: ["FALLBACK_TEMPLATE", ...violations],
    attempts,
  };
}

// Template draft: a forced outcome survives (AC-24); otherwise the case goes to manual review.
export function buildFallbackDraft(caseType: CaseType, gates: GateResult): DecisionDraft {
  const outcome = gates.forcedOutcome ?? "MANUAL_REVIEW";
  return {
    outcome,
    remedy: null,
    citedRuleIds: gates.requiredRuleIds,
    photoSummaryPl: FALLBACK_TEXTS.photoSummaryPl,
    justificationPl: FALLBACK_TEXTS.justificationPl,
    nextStepsPl: FALLBACK_TEXTS.nextStepsPl[caseType],
    clarifyingQuestionsPl: outcome === "MANUAL_REVIEW" ? [FALLBACK_TEXTS.clarifyingQuestionPl] : [],
  };
}

let cached: DecisionAgent | undefined;

/** Production agent: the decision model from the cached OpenRouter provider. */
export function getDecisionAgent(): DecisionAgent {
  cached ??= createDecisionAgent({ model: getAiProvider().model("decision") });
  return cached;
}
