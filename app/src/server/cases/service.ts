import "server-only";

import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import type { Decision } from "@/lib/shared/schemas/ai";
import { validateCaseForm, validateImageFile, type CaseFormInput } from "@/lib/shared/schemas/case-form";
import { todayInWarsaw } from "@/lib/shared/dates";
import type { LunaClient } from "@/server/ai/luna";
import { getLunaClient } from "@/server/ai/luna";
import type { VisionAnalyst } from "@/server/ai/vision";
import { getVisionAnalyst } from "@/server/ai/vision";
import type { DecisionAgent } from "@/server/ai/decision";
import { getDecisionAgent } from "@/server/ai/decision";
import { renderFirstMessage } from "@/server/ai/render-first-message";
import { CaseBusyError, CaseNotFoundError, CaseNotReadyError, ValidationError } from "@/server/errors";
import { createEvalLogger, buildEvalRecord, type EvalLogger } from "@/server/eval-log";
import { evaluateGates } from "@/server/guardrails";
import { getEnv } from "@/server/env";
import { log } from "@/server/log";
import { processImage } from "@/server/image";
import type { Policy } from "@/server/policies";
import { getPolicies } from "@/server/policies";
import { getCaseStore, type CaseStore } from "@/server/cases/store";

// Case flow (ADR-002 §3.1, §3.5, §5.1 – 5.2; ADR-000 TD-06): create runs intake, Luna and vision;
// decide runs the gates, the decision agent and the first message.
export interface CaseService {
  create(input: {
    form: unknown;
    file: { bytes: Buffer; declaredType: string; size: number } | null;
    signal?: AbortSignal;
  }): Promise<{ caseId: string }>;
  decide(input: { caseId: string; signal?: AbortSignal }): Promise<CaseUIMessage>;
}

export function createCaseService(deps: {
  store: CaseStore;
  processImage: typeof processImage;
  luna: LunaClient;
  vision: VisionAnalyst;
  decisionAgent: DecisionAgent;
  policies: { return: Policy; complaint: Policy };
  evalLog?: EvalLogger;
  models: { vision: string; decision: string; decisions: string };
  today?: () => string;
  now?: () => number;
}): CaseService {
  const today = deps.today ?? (() => todayInWarsaw());
  const now = deps.now ?? Date.now;

  return {
    async create(input) {
      const file = input.file;
      const form = validateCaseForm(input.form, today());
      const imageError = validateImageFile(file ? { size: file.size, type: file.declaredType } : null);
      const fieldErrors = {
        ...(form.ok ? {} : form.fieldErrors),
        ...(imageError ? { image: imageError } : {}),
      };
      if (!form.ok || imageError !== null || file === null) throw new ValidationError(fieldErrors);
      const data: CaseFormInput = form.data;

      const image = await deps.processImage({ bytes: file.bytes, declaredType: file.declaredType });
      const c = deps.store.create({ form: data, image });

      let lunaMs: number;
      let visionMs: number;
      let luna: Awaited<ReturnType<LunaClient["evaluate"]>>;
      let analysis: Awaited<ReturnType<VisionAnalyst["analyze"]>>;
      try {
        const lunaStarted = now();
        luna = await deps.luna.evaluate({ caseType: data.caseType, form: data, image, today: today(), signal: input.signal });
        lunaMs = now() - lunaStarted;

        const visionStarted = now();
        analysis = await deps.vision.analyze({ caseType: data.caseType, form: data, image, luna, signal: input.signal });
        visionMs = now() - visionStarted;
      } catch (error) {
        // ADR-002 §5.1: a failed analysis leaves no half-built case behind.
        deps.store.delete(c.caseId);
        throw error;
      }

      const updated = deps.store.update(c.caseId, (stored) => {
        stored.luna = luna;
        stored.analysis = analysis;
        stored.timings = { lunaMs, visionMs };
      });
      if (!updated) throw new CaseNotFoundError();

      log.info("case_analysed", { caseId: c.caseId, lunaStatus: luna.status, lunaMs, visionMs });
      return { caseId: c.caseId };
    },

    async decide(input) {
      const c = deps.store.get(input.caseId);
      if (!c) throw new CaseNotFoundError();

      // Idempotent: a decided case returns its stored first message without an agent call.
      const existing = c.messages[0];
      if (c.status === "decided" && existing !== undefined) return existing;

      if (!deps.store.tryLock(input.caseId)) throw new CaseBusyError();
      try {
        if (c.luna === null || c.analysis === null) throw new CaseNotReadyError();
        const { caseType, purchaseDate, category, modelName } = c.form;
        const analysis = c.analysis;
        const luna = c.luna;

        const gates = evaluateGates({ caseType, startDate: purchaseDate, today: today(), analysis });

        const decisionStarted = now();
        const result = await deps.decisionAgent.decide({
          caseType,
          form: c.form,
          analysis,
          luna,
          gates,
          policy: deps.policies[caseType],
          today: today(),
          signal: input.signal,
        });
        const decisionMs = now() - decisionStarted;

        const createdAt = new Date(now()).toISOString();
        const decision: Decision = {
          ...result.draft,
          version: 1,
          source: "initial",
          appliedGuardrails: result.appliedGuardrails,
          createdAt,
        };
        const message = renderFirstMessage({ caseType, modelName, decision, createdAt });

        const { lunaMs, visionMs } = c.timings ?? {};
        deps.store.update(input.caseId, (stored) => {
          stored.gates = gates;
          stored.decisions = [decision];
          stored.messages = [message];
          stored.status = "decided";
          stored.image = null; // TAC-002-03: the photo is dropped after the decision
        });

        // The evaluation log is measurement only: a write failure must not fail the customer's request.
        try {
          deps.evalLog?.append(
            buildEvalRecord({
              caseId: input.caseId,
              caseType,
              category,
              luna,
              analysis,
              decision,
              latencyMs: { luna: lunaMs, vision: visionMs, decision: decisionMs },
              models: deps.models,
              ts: createdAt,
            }),
          );
        } catch (error) {
          log.warn("eval_log_failed", { caseId: input.caseId, error: error instanceof Error ? error.name : "unknown" });
        }

        log.info("case_decided", {
          caseId: input.caseId,
          outcome: decision.outcome,
          guardrails: result.appliedGuardrails.join(","),
          decisionMs,
        });
        return message;
      } finally {
        deps.store.unlock(input.caseId);
      }
    },
  };
}

let cached: CaseService | undefined;

/** Production service wired to the cached singletons; created once. */
export function getCaseService(): CaseService {
  if (cached === undefined) {
    const env = getEnv();
    cached = createCaseService({
      store: getCaseStore(),
      processImage,
      luna: getLunaClient(),
      vision: getVisionAnalyst(),
      decisionAgent: getDecisionAgent(),
      policies: getPolicies(),
      evalLog: createEvalLogger(env.EVAL_LOG_PATH),
      models: { vision: env.VISION_MODEL, decision: env.DECISION_MODEL, decisions: env.DECISIONS_MODEL },
    });
  }
  return cached;
}
