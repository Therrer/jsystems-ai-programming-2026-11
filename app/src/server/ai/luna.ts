import "server-only";

import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import type { CaseType, LunaKey } from "@/lib/shared/schemas/enums";
import type { LunaSignal, LunaSignals } from "@/lib/shared/schemas/ai";
import { getEnv } from "@/server/env";
import { getAiProvider, type DecisionsRequestBody } from "@/server/ai/provider";
import { lunaQuestions, lunaState, type LunaQuestion } from "@/server/ai/prompts/luna-questions";
import { log } from "@/server/log";
import type { ProcessedImage } from "@/server/image";

// Luna pre-check client (ADR-001 §3.2, TD-105). evaluate() never throws: every failure becomes
// status "unavailable" with no signals, so the case flow continues without the pre-check.

export interface LunaClient {
  evaluate(input: {
    caseType: CaseType;
    form: CaseFormInput;
    image: ProcessedImage;
    today: string;
    signal?: AbortSignal;
  }): Promise<LunaSignals>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const round2 = (value: number): number => Math.round(value * 100) / 100;

function notAnswered(key: LunaKey, type: LunaQuestion["type"]): LunaSignal {
  return { key, type, value: null, probabilities: {}, confidence: null, certainty: 0, status: "not_answered" };
}

function normalizeOne(key: LunaKey, question: LunaQuestion, raw: unknown, threshold: number): LunaSignal {
  // An answer with a missing or unexpected type (for example "refusal" or "box") is not an answer.
  if (!isRecord(raw) || raw.type !== question.type) return notAnswered(key, question.type);

  let value: boolean | string;
  let probabilities: Record<string, number>;
  let topProbability: number;

  if (question.type === "noul") {
    const p = raw.noul;
    if (typeof p !== "number") return notAnswered(key, question.type);
    value = p >= 0.5;
    probabilities = { true: p };
    topProbability = Math.max(p, 1 - p);
  } else {
    const choice = raw.choice;
    if (typeof choice !== "string") return notAnswered(key, question.type);
    value = choice;
    probabilities = {};
    if (isRecord(raw.probabilities)) {
      for (const [option, probability] of Object.entries(raw.probabilities)) {
        if (typeof probability === "number") probabilities[option] = probability;
      }
    }
    const values = Object.values(probabilities);
    topProbability = values.length > 0 ? Math.max(...values) : 1;
  }

  const confidence = typeof raw.confidence === "number" ? raw.confidence : null;
  const certainty = round2(Math.min(confidence ?? 1, topProbability));
  return {
    key,
    type: question.type,
    value,
    probabilities,
    confidence,
    certainty,
    status: certainty < threshold ? "low_confidence" : "answered",
  };
}

/** Pure: maps the raw Decisions answers onto one signal per question of the case type (ADR-001 §3.2). */
export function normalizeAnswers(
  answers: unknown,
  caseType: CaseType,
  formCategory: string,
  threshold: number,
): { signals: LunaSignal[]; status: "ok" | "partial"; derivedCategoryMatch: "match" | "mismatch" | "unsure" } {
  const questions = lunaQuestions(caseType);
  const record = isRecord(answers) ? answers : {};
  const signals = (Object.keys(questions) as LunaKey[]).map((key) =>
    normalizeOne(key, questions[key], record[key], threshold),
  );

  const status = signals.some((signal) => signal.status === "not_answered") ? "partial" : "ok";
  const category = signals.find((signal) => signal.key === "category");
  let derivedCategoryMatch: "match" | "mismatch" | "unsure" = "unsure";
  if (category?.status === "answered") {
    derivedCategoryMatch = category.value === formCategory ? "match" : "mismatch";
  }
  return { signals, status, derivedCategoryMatch };
}

export function createLunaClient(deps: {
  decisions: (body: { state: unknown; questions: Record<string, unknown> }, init?: { signal?: AbortSignal }) => Promise<Response>;
  enabled: boolean;
  threshold: number;
  model: string;
  timeoutMs?: number;
  now?: () => number;
}): LunaClient {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? Date.now;

  return {
    async evaluate(input) {
      if (!deps.enabled) {
        return { status: "unavailable", model: deps.model, latencyMs: 0, signals: [], derivedCategoryMatch: "unsure" };
      }

      const started = now();
      // Logs the reason only: no body text, no prompt, no image data (ADR-002 TD-205).
      const unavailable = (reason: string, status?: number): LunaSignals => {
        log.warn("luna_unavailable", { status, reason });
        return {
          status: "unavailable",
          model: deps.model,
          latencyMs: now() - started,
          signals: [],
          derivedCategoryMatch: "unsure",
        };
      };

      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
        const response = await deps.decisions(
          { state: lunaState(input), questions: lunaQuestions(input.caseType) },
          { signal },
        );
        if (response.status !== 200) return unavailable("http_status", response.status);

        const body: unknown = await response.json();
        if (!isRecord(body) || !isRecord(body.answers)) return unavailable("invalid_body");

        const normalized = normalizeAnswers(body.answers, input.caseType, input.form.category, deps.threshold);
        return {
          status: normalized.status,
          model: deps.model,
          latencyMs: now() - started,
          signals: normalized.signals,
          derivedCategoryMatch: normalized.derivedCategoryMatch,
        };
      } catch (error) {
        return unavailable(error instanceof Error ? error.name : "unknown");
      }
    },
  };
}

let cached: LunaClient | undefined;

/** Production client: the OpenRouter provider and the validated environment, created once. */
export function getLunaClient(): LunaClient {
  if (cached === undefined) {
    const env = getEnv();
    const provider = getAiProvider();
    cached = createLunaClient({
      decisions: (body, init) => provider.decisions(body as DecisionsRequestBody, init),
      enabled: env.DECISIONS_ENABLED,
      threshold: env.DECISIONS_CONFIDENCE_THRESHOLD,
      model: env.DECISIONS_MODEL,
    });
  }
  return cached;
}
