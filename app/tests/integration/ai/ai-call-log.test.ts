import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { decisionSchema, type Decision, type ImageAnalysis, type LunaSignals } from "@/lib/shared/schemas/ai";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { createAiProvider, type DecisionsRequestBody } from "@/server/ai/provider";
import { createChatAgent } from "@/server/ai/chat";
import { createDecisionAgent } from "@/server/ai/decision";
import { createLunaClient } from "@/server/ai/luna";
import { renderFirstMessage } from "@/server/ai/render-first-message";
import { createVisionAnalyst } from "@/server/ai/vision";
import type { Case } from "@/server/cases/store";
import { parseEnv } from "@/server/env";
import { evaluateGates } from "@/server/guardrails";
import type { ProcessedImage } from "@/server/image";
import { loadPolicies } from "@/server/policies";

// One ai_call log line per HTTP call to OpenRouter (T24a). Every mocked response is a real recording
// from tests/fixtures/recorded (plan §4, capture policy). The logger writes through console.log.

const RECORDED_DIR = path.resolve(import.meta.dirname, "../../fixtures/recorded");
const POLICIES_DIR = path.resolve(import.meta.dirname, "../../../../docs/policies");
const TODAY = "2026-11-26";
const NOW_ISO = "2026-11-26T10:00:00.000Z";
const CASE_ID = "00000000-0000-4000-8000-000000000001";


interface Capture {
  exchanges: Array<{ request: { body: unknown }; response: { status: number; body: unknown; rawText?: string } }>;
}

function readCapture(name: string): Capture {
  return JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, name), "utf8")) as Capture;
}

// Returns the recorded responses in order, one per request, and fails loudly when the code asks for more.
function recordedFetch(exchanges: Capture["exchanges"]) {
  const queue = [...exchanges];
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    calls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const next = queue.shift();
    if (!next) throw new Error("test queue exhausted");
    if (next.response.rawText !== undefined) {
      return new Response(next.response.rawText, { status: next.response.status, headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify(next.response.body), {
      status: next.response.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const env = parseEnv({ OPENROUTER_API_KEY: "test-key-not-real", LLM_MODEL: "openai/gpt-6-luna" }, "/repo/app");
const VISION_MODEL = env.VISION_MODEL;
const DECISION_MODEL = env.DECISION_MODEL;
const LUNA_MODEL = env.DECISIONS_MODEL;
const policies = loadPolicies(POLICIES_DIR);

const laptopBytes = fs.readFileSync(path.join(RECORDED_DIR, "images/laptop-1.webp"));
const image: ProcessedImage = {
  mediaType: "image/webp",
  width: 1482,
  height: 1536,
  bytes: laptopBytes,
  dataUrl: `data:image/webp;base64,${laptopBytes.toString("base64")}`,
};

const returnForm: CaseFormInput = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-21",
  description: "",
};

const analysis: ImageAnalysis = {
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
  observationsPl: "Laptop bez widocznych śladów użytkowania.",
  lunaVerification: [],
};

const luna: LunaSignals = {
  status: "ok",
  model: LUNA_MODEL,
  latencyMs: 0,
  derivedCategoryMatch: "match",
  signals: [
    { key: "category", type: "choice", value: "laptop", probabilities: { laptop: 1 }, confidence: 1, certainty: 1, status: "answered" },
  ],
};

interface AiCallLine {
  event: string;
  ts?: string;
  level?: string;
  stage?: string;
  model?: string;
  durationMs?: number;
  costUsd?: number | null;
  step?: number;
}

let logSpy: MockInstance<typeof console.log>;

// Every JSON line the logger wrote, parsed; only ai_call lines are returned by aiCalls().
function aiCalls(): AiCallLine[] {
  return logSpy.mock.calls
    .map((args) => JSON.parse(String(args[0])) as AiCallLine)
    .filter((line) => line.event === "ai_call");
}

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("ai_call log line", () => {
  it("logs one vision line with the model, cost and step 1 for the recorded vision response", async () => {
    const { fetchFn } = recordedFetch(readCapture("final-vision-return-laptop2.json").exchanges);
    const analyst = createVisionAnalyst({ model: createAiProvider(env, { fetch: fetchFn }).model("vision") });

    await analyst.analyze({ caseType: "return", form: returnForm, image, luna });

    const lines = aiCalls();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ stage: "vision", model: VISION_MODEL, costUsd: 0.000551425, step: 1 });
    expect(typeof lines[0]!.durationMs).toBe("number");
  });

  it("logs one luna line with the model and cost for the recorded Luna response", async () => {
    const { fetchFn } = recordedFetch(readCapture("final-luna-return-laptop2.json").exchanges);
    const provider = createAiProvider(env, { fetch: fetchFn });
    // Same adapter as getLunaClient in production: the untyped Luna state is cast to the Decisions request type.
    const decisions = (body: { state: unknown; questions: Record<string, unknown> }, init?: { signal?: AbortSignal }) =>
      provider.decisions(body as DecisionsRequestBody, init);
    const client = createLunaClient({ decisions, enabled: true, threshold: 0.8, model: LUNA_MODEL });

    const result = await client.evaluate({ caseType: "return", form: returnForm, image, today: TODAY });

    expect(result.status).not.toBe("unavailable");
    const lines = aiCalls();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ stage: "luna", model: LUNA_MODEL, costUsd: 0.0001733, step: 1 });
  });

  it("logs at least one chat line with a numeric or null cost for the recorded chat stream", async () => {
    const capture = readCapture("final-chat-return-plain.json");
    const { fetchFn } = recordedFetch(capture.exchanges);
    const recordedDecision = JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, "decision-structured-return.json"), "utf8")) as {
      response: { body: { choices: Array<{ message: { content: string } }> } };
    };
    const draft = JSON.parse(recordedDecision.response.body.choices[0]!.message.content) as Record<string, unknown>;
    const decision: Decision = decisionSchema.parse({
      ...draft,
      nextStepsPl: [...(draft.nextStepsPl as string[]), "Odeślij laptopa."],
      version: 1,
      source: "initial",
      appliedGuardrails: [],
      createdAt: NOW_ISO,
    });
    const chatCase: Case = {
      caseId: CASE_ID,
      createdAt: NOW_ISO,
      lastActivityAt: NOW_ISO,
      form: returnForm,
      image: null,
      luna,
      analysis,
      gates: evaluateGates({ caseType: "return", startDate: returnForm.purchaseDate, today: TODAY, analysis }),
      decisions: [decision],
      messages: [renderFirstMessage({ caseType: "return", modelName: returnForm.modelName, decision, createdAt: NOW_ISO })],
      status: "decided",
      busySince: null,
      userMessageCount: 0,
    };
    const user: CaseUIMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "Ile mam dni na zwrot?" }],
      metadata: { createdAt: NOW_ISO },
    };

    const agent = createChatAgent({ model: createAiProvider(env, { fetch: fetchFn }).model("chat") });
    const response = await agent.stream({
      chatCase,
      newMessage: user,
      policy: policies.return,
      today: TODAY,
      recordDecision: () => {},
      onFinish: () => {},
      onError: () => {},
    });
    await response.text();

    const lines = aiCalls().filter((line) => line.stage === "chat");
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const line of lines) {
      expect(line.costUsd === null || typeof line.costUsd === "number").toBe(true);
      expect(typeof line.step).toBe("number");
    }
  });

  it("logs one decision line per recorded decision exchange", async () => {
    const capture = readCapture("final-decision-return-laptop2.json");
    const { fetchFn, calls } = recordedFetch(capture.exchanges);
    const agent = createDecisionAgent({ model: createAiProvider(env, { fetch: fetchFn }).model("decision") });

    await agent.decide({
      caseType: "return",
      form: returnForm,
      analysis,
      luna,
      gates: evaluateGates({ caseType: "return", startDate: returnForm.purchaseDate, today: TODAY, analysis }),
      policy: policies.return,
      today: TODAY,
    });

    const lines = aiCalls().filter((line) => line.stage === "decision");
    expect(lines).toHaveLength(capture.exchanges.length);
    expect(lines).toHaveLength(calls.length);
    expect(lines.every((line) => line.model === DECISION_MODEL)).toBe(true);
    expect(lines[0]).toMatchObject({ stage: "decision", step: 1, costUsd: 0.000490675 });
  });
});
