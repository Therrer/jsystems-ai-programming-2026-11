// T21 — real captures of every AI stage with the FINAL prompts (plan §4 capture policy).
// Not part of `npm test`. Run: `npx vitest run --config vitest.capture.mts` from app/.
// The key is read from app/.env.local by Node; it is never printed or written (auth headers are not recorded).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decisionSchema, type Decision } from "@/lib/shared/schemas/ai";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { addDays, todayInWarsaw } from "@/lib/shared/dates";
import { createAiProvider, type DecisionsRequestBody } from "@/server/ai/provider";
import { createChatAgent } from "@/server/ai/chat";
import { createDecisionAgent } from "@/server/ai/decision";
import { createLunaClient } from "@/server/ai/luna";
import { renderFirstMessage } from "@/server/ai/render-first-message";
import { createVisionAnalyst } from "@/server/ai/vision";
import type { Case } from "@/server/cases/store";
import { parseEnv } from "@/server/env";
import { evaluateGates } from "@/server/guardrails";
import { processImage } from "@/server/image";
import { loadPolicies } from "@/server/policies";

const APP = path.resolve(import.meta.dirname, "../..");
const REPO = path.resolve(APP, "..");
const OUT = path.join(APP, "tests/fixtures/recorded");
if (existsSync(path.join(APP, ".env.local"))) process.loadEnvFile(path.join(APP, ".env.local"));
const env = parseEnv(process.env, APP);
const policies = loadPolicies(path.join(REPO, "docs/policies"));
const today = todayInWarsaw();

interface Exchange { url: string; method: string; requestBody: unknown; status: number; headers: Record<string, string>; body: unknown; rawText?: string }
const DATA_URL = /data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g;
const redact = (text: string) =>
  text.replace(DATA_URL, (m) => `<image sha256=${createHash("sha256").update(m).digest("hex").slice(0, 16)} chars=${m.length}>`);

function recorder() {
  const exchanges: Exchange[] = [];
  const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const res = await fetch(input, init);
    const text = await res.clone().text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (k !== "set-cookie") headers[k] = v; });
    let body: unknown = null;
    try { body = JSON.parse(redact(text)); } catch { /* streamed or non-JSON */ }
    exchanges.push({
      url, method: init?.method ?? "GET",
      requestBody: init?.body ? JSON.parse(redact(String(init.body))) : null,
      status: res.status, headers, body, rawText: body === null ? redact(text) : undefined,
    });
    return res;
  }) as typeof fetch;
  return { exchanges, recordingFetch };
}

function save(name: string, note: string, exchanges: Exchange[]) {
  mkdirSync(OUT, { recursive: true });
  const record = {
    meta: { name, capturedAt: new Date().toISOString(), note, task: "T21 final prompts", privacy: "data_collection deny, zdr true" },
    exchanges: exchanges.map((e) => ({ request: { method: e.method, url: e.url, headers: { Authorization: "Bearer <redacted>" }, body: e.requestBody }, response: { status: e.status, headers: e.headers, body: e.body, rawText: e.rawText } })),
  };
  // OpenRouter bodies may carry an account id; replace it (documented derived edit).
  const text = JSON.stringify(record, null, 2).replace(/user_[A-Za-z0-9]{20,}/g, "<redacted-account-id>");
  writeFileSync(path.join(OUT, `${name}.json`), text + "\n");
}

async function realImage(name: string, type: string) {
  const bytes = readFileSync(path.join(REPO, "assets/example-images", name));
  return processImage({ bytes, declaredType: type });
}

const returnForm = { caseType: "return" as const, category: "laptop" as const, modelName: "Lenovo ThinkPad E14", purchaseDate: addDays(today, -5), description: "" };

describe("T21 stage captures (real OpenRouter)", () => {
  it("captures Luna, vision and decision for a real return photo, and a chat turn", async () => {
    expect(env.OPENROUTER_API_KEY.length).toBeGreaterThan(10);
    const image = await realImage("laptop-2.webp", "image/webp");

    // Luna
    const lunaRec = recorder();
    const lunaProvider = createAiProvider(env, { fetch: lunaRec.recordingFetch });
    const luna = await createLunaClient({ decisions: (body, init) => lunaProvider.decisions(body as DecisionsRequestBody, init), enabled: true, threshold: env.DECISIONS_CONFIDENCE_THRESHOLD, model: env.DECISIONS_MODEL })
      .evaluate({ caseType: "return", form: returnForm, image, today });
    save("final-luna-return-laptop2", "Luna pre-check, return, laptop-2.webp, final question set", lunaRec.exchanges);
    expect(luna.status).not.toBe("unavailable");

    // Vision
    const visionRec = recorder();
    const analysis = await createVisionAnalyst({ model: createAiProvider(env, { fetch: visionRec.recordingFetch }).model("vision") })
      .analyze({ caseType: "return", form: returnForm, image, luna });
    save("final-vision-return-laptop2", "Vision stage, final prompt and ImageAnalysis schema", visionRec.exchanges);

    // Decision
    const gates = evaluateGates({ caseType: "return", startDate: returnForm.purchaseDate, today, analysis });
    const decisionRec = recorder();
    const result = await createDecisionAgent({ model: createAiProvider(env, { fetch: decisionRec.recordingFetch }).model("decision") })
      .decide({ caseType: "return", form: returnForm, analysis, luna, gates, policy: policies.return, today });
    save("final-decision-return-laptop2", `Decision stage, final prompt; attempts=${result.attempts}, guardrails=${result.appliedGuardrails.join(",") || "none"}`, decisionRec.exchanges);

    const createdAt = new Date().toISOString();
    const decision: Decision = decisionSchema.parse({ ...result.draft, version: 1, source: "initial", appliedGuardrails: result.appliedGuardrails, createdAt });
    const first = renderFirstMessage({ caseType: "return", modelName: returnForm.modelName, decision, createdAt });

    // Chat (plain question)
    const chatRec = recorder();
    const chatCase: Case = {
      caseId: "00000000-0000-4000-8000-000000000021", createdAt, lastActivityAt: createdAt, form: returnForm, image: null,
      luna, analysis, gates, decisions: [decision], messages: [first], status: "decided", busySince: null, userMessageCount: 0,
    };
    const user: CaseUIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Jaki model zgłosiłem i co mam zrobić dalej?" }], metadata: { createdAt } };
    const response = await createChatAgent({ model: createAiProvider(env, { fetch: chatRec.recordingFetch }).model("chat") }).stream({
      chatCase, newMessage: user, policy: policies.return, today, recordDecision: () => {}, onFinish: () => {}, onError: () => {},
    });
    const streamed = await response.text();
    save("final-chat-return-plain", "Chat stage, final system prompt, plain question", chatRec.exchanges);
    writeFileSync(path.join(OUT, "final-chat-return-plain.ui-stream.txt"), redact(streamed));
    expect(response.status).toBe(200);
  });
});
