import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decisionSchema } from "@/lib/shared/schemas/ai";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { createChatAgent } from "@/server/ai/chat";
import { createAiProvider } from "@/server/ai/provider";
import { renderFirstMessage } from "@/server/ai/render-first-message";
import type { Case } from "@/server/cases/store";
import { parseEnv } from "@/server/env";
import { evaluateGates } from "@/server/guardrails";
import { loadPolicies } from "@/server/policies";

// Orchestrator fix at T21: the T21 capture showed reasoning-delta chunks (the model's internal English
// reasoning) streamed to the browser. The UI stream must carry only the answer (AC-43, PRD §11.3).
// Mocked response: the real OpenRouter SSE captured in T21 (final-chat-return-plain.json), which streams reasoning.
const RECORDED = path.resolve(import.meta.dirname, "../../fixtures/recorded");
const REPO = path.resolve(import.meta.dirname, "../../../..");
const recorded = (name: string) => JSON.parse(readFileSync(path.join(RECORDED, name), "utf8"));

describe("chat stream without model reasoning", () => {
  it("sends text to the client but no reasoning chunks", async () => {
    const rawText: string = recorded("final-chat-return-plain.json").exchanges[0].response.rawText;
    expect(rawText).toContain("reasoning");
    const fetchStub = (async () =>
      new Response(rawText, { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch;
    const env = parseEnv({ OPENROUTER_API_KEY: "test-key-not-real", LLM_MODEL: "openai/gpt-6-luna" }, "/repo/app");
    const policies = loadPolicies(path.join(REPO, "docs/policies"));
    const today = "2026-11-26";
    const form = { caseType: "return" as const, category: "laptop" as const, modelName: "Lenovo ThinkPad E14", purchaseDate: "2026-11-21", description: "" };
    const analysis = { imageUsable: true, unusableReason: null, deviceVisible: true, detectedCategory: "laptop" as const, categoryMatch: "match" as const, damageVisible: false, damage: [], likelyCause: null, signsOfUse: "none" as const, resellableAsNew: true, observationsPl: "Laptop.", lunaVerification: [] };
    const draft = JSON.parse(recorded("decision-structured-return.json").response.body.choices[0].message.content);
    const createdAt = "2026-11-26T10:00:00.000Z";
    const decision = decisionSchema.parse({ ...draft, nextStepsPl: [...draft.nextStepsPl, "Odeślij laptopa."], version: 1, source: "initial", appliedGuardrails: [], createdAt });
    const chatCase: Case = {
      caseId: "00000000-0000-4000-8000-000000000001", createdAt, lastActivityAt: createdAt, form, image: null,
      luna: { status: "unavailable", model: "m", latencyMs: 0, signals: [], derivedCategoryMatch: "unsure" },
      analysis, gates: evaluateGates({ caseType: "return", startDate: form.purchaseDate, today, analysis }),
      decisions: [decision], messages: [renderFirstMessage({ caseType: "return", modelName: form.modelName, decision, createdAt })],
      status: "decided", busySince: null, userMessageCount: 0,
    };
    const user: CaseUIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Ile mam dni na zwrot?" }], metadata: { createdAt } };

    const response = await createChatAgent({ model: createAiProvider(env, { fetch: fetchStub }).model("chat") }).stream({
      chatCase, newMessage: user, policy: policies.return, today, recordDecision: () => {}, onFinish: () => {}, onError: () => {},
    });
    const streamed = await response.text();

    expect(streamed).toContain('"type":"text-delta"');
    expect(streamed).not.toContain('"type":"reasoning');
  });
});
