import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ImageAnalysis, LunaSignals } from "@/lib/shared/schemas/ai";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import { createAiProvider } from "@/server/ai/provider";
import { createDecisionAgent, type DecisionAgent } from "@/server/ai/decision";
import { evaluateGates } from "@/server/guardrails";
import { parseEnv } from "@/server/env";
import { AiConfigError } from "@/server/errors";
import { loadPolicies } from "@/server/policies";

// Every mocked HTTP response is the body of a real recording (plan §4, capture policy) or a derived
// copy in which only choices[0].message.content changes. Each derived edit is documented next to it.

const RECORDED_DIR = path.resolve(import.meta.dirname, "../../fixtures/recorded");
const POLICIES_DIR = path.resolve(import.meta.dirname, "../../../../docs/policies");
const CHAT_URL_SUFFIX = "/chat/completions";
const TODAY = "2026-11-26";

interface RecordedCapture {
  response: { status: number; body: unknown };
}

interface WireContentPart {
  type: string;
  text?: string;
}

interface WireMessage {
  role: string;
  content: string | WireContentPart[];
}

interface WireBody {
  model: string;
  messages: WireMessage[];
  response_format: { type: string };
  provider: { data_collection: string; zdr: boolean; require_parameters: boolean };
  usage: { include: boolean };
}

interface ChatCompletionBody {
  choices: Array<{ message: { content: string } }>;
}

interface WireCall {
  url: string;
  body: WireBody;
}

interface DraftFields {
  outcome: string;
  remedy: string | null;
  nextStepsPl: string[];
  [key: string]: unknown;
}

function readRecorded<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, name), "utf8")) as T;
}

function firstChoice(body: ChatCompletionBody): ChatCompletionBody["choices"][number] {
  const choice = body.choices[0];
  if (!choice) throw new Error("recording has no choices");
  return choice;
}

const RECORDED_CHAT = readRecorded<RecordedCapture>("decision-structured-return.json").response.body as ChatCompletionBody;

// Base of every decision response. Only choices[0].message.content changes.
// Documented edit (all decision copies): the recording has one next step, but validateDecision
// requires 2 to 5 (NEXT_STEPS_COUNT). One second step is appended; nothing else is changed.
function decisionBody(edit?: (draft: DraftFields) => void): ChatCompletionBody {
  const body = structuredClone(RECORDED_CHAT);
  const choice = firstChoice(body);
  const draft = JSON.parse(choice.message.content) as DraftFields;
  draft.nextStepsPl.push("Zachowaj potwierdzenie zakupu do czasu zakończenia sprawy.");
  edit?.(draft);
  choice.message.content = JSON.stringify(draft);
  return body;
}

// Derived violation: REJECT with the recorded FULL_REFUND remedy, which is not allowed for REJECT.
function rejectWithFullRefund(): ChatCompletionBody {
  return decisionBody((draft) => {
    draft.outcome = "REJECT";
  });
}

// Derived violation: ACCEPT where the timing gate forces REJECT (FORCED_OUTCOME_MISMATCH).
function acceptWhenForced(): ChatCompletionBody {
  return decisionBody((draft) => {
    draft.outcome = "ACCEPT";
  });
}

// Derived output error: choices[0].message.content is replaced with non-JSON text.
function notJsonBody(): ChatCompletionBody {
  const body = structuredClone(RECORDED_CHAT);
  firstChoice(body).message.content = "not json";
  return body;
}

const env = parseEnv({ OPENROUTER_API_KEY: "test-key-not-real", LLM_MODEL: "openai/gpt-6-luna" }, "/repo/app");
const policies = loadPolicies(POLICIES_DIR);

const returnForm: CaseFormInput = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-21",
  description: "Laptop działa dobrze & bez rys <test>.",
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
  model: "openai/gpt-6-luna-decisions",
  latencyMs: 0,
  derivedCategoryMatch: "match",
  signals: [
    { key: "category", type: "choice", value: "laptop", probabilities: { laptop: 1 }, confidence: 1, certainty: 1, status: "answered" },
    {
      key: "description_supported",
      type: "noul",
      value: true,
      probabilities: { true: 0.9 },
      confidence: 0.9,
      certainty: 0.9,
      status: "answered",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Answers requests from a queue, one response per request, and records each request body.
// onRequest runs before each answer (used to move the injected clock).
function harness(
  responses: Response[],
  options: { now?: () => number; onRequest?: () => void } = {},
): { agent: DecisionAgent; calls: WireCall[] } {
  const queue = [...responses];
  const calls: WireCall[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, body: JSON.parse(String(init?.body)) as WireBody });
    options.onRequest?.();
    const next = queue.shift();
    if (!next) throw new Error("test queue exhausted");
    return next;
  }) as typeof fetch;
  const model = createAiProvider(env, { fetch: fetchFn }).model("decision");
  return { agent: createDecisionAgent({ model, now: options.now ?? Date.now }), calls };
}

function messageText(message: WireMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) => part.text ?? "").join("\n");
}

function lastUserText(body: WireBody): string {
  const users = body.messages.filter((message) => message.role === "user");
  return messageText(users[users.length - 1]);
}

function firstUserText(body: WireBody): string {
  return messageText(body.messages.find((message) => message.role === "user"));
}

function decideInput(form: CaseFormInput = returnForm) {
  return {
    caseType: form.caseType,
    form,
    analysis,
    luna,
    gates: evaluateGates({ caseType: form.caseType, startDate: form.purchaseDate, today: TODAY, analysis }),
    policy: policies[form.caseType],
    today: TODAY,
  };
}

describe("decision agent", () => {
  it("accepts a valid recorded decision on the first attempt (TAC-001-01, TAC-001-08)", async () => {
    const { agent, calls } = harness([jsonResponse(decisionBody())]);

    const result = await agent.decide(decideInput());

    expect(result.draft.outcome).toBe("ACCEPT");
    expect(result.draft.remedy).toBe("FULL_REFUND");
    expect(result.draft.citedRuleIds).toContain("R-2.1");
    expect(result.attempts).toBe(1);
    expect(result.appliedGuardrails).toEqual([]);

    expect(calls).toHaveLength(1);
    const body = calls[0]!.body;
    expect(calls[0]!.url.endsWith(CHAT_URL_SUFFIX)).toBe(true);
    expect(body.model).toBe("openai/gpt-6-luna");
    expect(body.provider.data_collection).toBe("deny");
    expect(body.provider.zdr).toBe(true);
    expect(body.provider.require_parameters).toBe(true);
    expect(body.response_format.type).toBe("json_schema");
    expect("temperature" in (body as unknown as Record<string, unknown>)).toBe(false);

    const user = firstUserText(body);
    expect(user).toContain("<policy>");
    expect(user).toContain("**R-2.1**");
    expect(user).toContain(
      "<customer_description>Laptop działa dobrze &amp; bez rys &lt;test&gt;.</customer_description>",
    );
    expect(user).toContain("description_supported");
  });

  it("repairs a rule violation with one corrective request (TAC-001-01)", async () => {
    const { agent, calls } = harness([jsonResponse(rejectWithFullRefund()), jsonResponse(decisionBody())]);

    const result = await agent.decide(decideInput());

    expect(result.attempts).toBe(2);
    expect(result.appliedGuardrails).toEqual(["CORRECTIVE_RETRY"]);
    expect(result.draft.outcome).toBe("ACCEPT");
    expect(result.draft.remedy).toBe("FULL_REFUND");
    expect(calls).toHaveLength(2);
    expect(lastUserText(calls[1]!.body)).toContain("REMEDY_NOT_ALLOWED");
  });

  it("falls back to the template after two violations (TAC-001-01)", async () => {
    const { agent, calls } = harness([jsonResponse(rejectWithFullRefund()), jsonResponse(rejectWithFullRefund())]);

    const result = await agent.decide(decideInput());

    expect(calls).toHaveLength(2);
    expect(result.attempts).toBe(2);
    expect(result.appliedGuardrails).toContain("FALLBACK_TEMPLATE");
    expect(result.appliedGuardrails).toContain("REMEDY_NOT_ALLOWED");
    expect(result.draft.outcome).toBe("MANUAL_REVIEW");
    expect(result.draft.remedy).toBeNull();
    expect(result.draft.clarifyingQuestionsPl).toHaveLength(1);
    expect(result.draft.citedRuleIds).toEqual(["R-2.1"]);
  });

  it("keeps a forced REJECT through the fallback and fixes the outcome in the prompt (AC-24, TAC-001-01)", async () => {
    const outside: CaseFormInput = { ...returnForm, purchaseDate: "2026-10-27" };
    const { agent, calls } = harness([jsonResponse(acceptWhenForced()), jsonResponse(acceptWhenForced())]);

    const result = await agent.decide(decideInput(outside));

    expect(calls).toHaveLength(2);
    expect(firstUserText(calls[0]!.body)).toContain("The outcome is fixed to REJECT");
    expect(result.appliedGuardrails).toContain("FALLBACK_TEMPLATE");
    expect(result.draft.outcome).toBe("REJECT");
    expect(result.draft.citedRuleIds).toEqual(["R-2.4"]);
  });

  it("falls back after two schema failures", async () => {
    const { agent, calls } = harness([jsonResponse(notJsonBody()), jsonResponse(notJsonBody())]);

    const result = await agent.decide(decideInput());

    expect(calls).toHaveLength(2);
    expect(result.attempts).toBe(2);
    expect(result.appliedGuardrails).toContain("FALLBACK_TEMPLATE");
    expect(result.draft.outcome).toBe("MANUAL_REVIEW");
  });

  it("skips the corrective request when less than minRetryMs of the budget remains", async () => {
    let clock = 0;
    const { agent, calls } = harness([jsonResponse(rejectWithFullRefund()), jsonResponse(decisionBody())], {
      now: () => clock,
      onRequest: () => {
        clock = 30_000;
      },
    });

    const result = await agent.decide(decideInput());

    expect(calls).toHaveLength(1);
    expect(result.attempts).toBe(1);
    expect(result.appliedGuardrails).toContain("FALLBACK_TEMPLATE");
    expect(result.draft.outcome).toBe("MANUAL_REVIEW");
  });

  it("maps a recorded 401 to AiConfigError instead of a guardrail fallback", async () => {
    const recorded = readRecorded<RecordedCapture>("error-401-invalid-key.json");
    const { agent } = harness([jsonResponse(recorded.response.body, recorded.response.status)]);

    await expect(agent.decide(decideInput())).rejects.toBeInstanceOf(AiConfigError);
  });
});
