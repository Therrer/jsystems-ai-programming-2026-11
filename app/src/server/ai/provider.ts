import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { getEnv, type AppEnv } from "../env";

// ADR-000 TD-10: no prompt or output may be stored or used for training.
export const OPENROUTER_PRIVACY = { data_collection: "deny", zdr: true } as const;

export type ModelRole = "vision" | "decision" | "chat";

export const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

/** Decisions API request fields set by the caller; model and provider are always set here. */
export interface DecisionsRequestBody {
  state: string | ReadonlyArray<string | { type: "image_url"; image_url: { url: string } }>;
  questions: Record<string, unknown>;
}

// Settings are fixed in code, not configurable by env (ADR-001 §2, TD-102).
export function createAiProvider(env: AppEnv, options?: { fetch?: typeof fetch }) {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY, fetch: options?.fetch });
  const modelIds = {
    vision: env.VISION_MODEL,
    decision: env.DECISION_MODEL,
    chat: env.CHAT_MODEL,
    decisions: env.DECISIONS_MODEL,
  };
  return {
    model(role: ModelRole): LanguageModel {
      return openrouter.chat(modelIds[role], {
        usage: { include: true },
        // Structured-output stages need require_parameters (TD-102); free chat does not.
        provider: { ...OPENROUTER_PRIVACY, require_parameters: role !== "chat" },
      });
    },
    // Luna pre-check (ADR-001 §3.2): direct POST to the Decisions API. The SDK's
    // evaluationModel() is not used: @openrouter/ai-sdk-provider 3.1.0 ships an older
    // evaluation-model contract than ai@7.0.183 expects (tsc error), and the Luna state
    // must carry image parts. Privacy settings (TD-10) are always applied last.
    decisions(body: DecisionsRequestBody, init?: { signal?: AbortSignal }): Promise<Response> {
      const doFetch = options?.fetch ?? globalThis.fetch;
      return doFetch(DECISIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ ...body, model: modelIds.decisions, provider: { ...OPENROUTER_PRIVACY } }),
        signal: init?.signal,
      });
    },
    modelIds,
  };
}

let cached: ReturnType<typeof createAiProvider> | undefined;

export function getAiProvider(): ReturnType<typeof createAiProvider> {
  cached ??= createAiProvider(getEnv());
  return cached;
}
