import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decisionDraftSchema, imageAnalysisSchema, type DecisionDraft, type ImageAnalysis, type LunaSignals } from "@/lib/shared/schemas/ai";
import { createCaseService } from "@/server/cases/service";
import { createCaseStore, type CaseStore } from "@/server/cases/store";
import type { DecisionAgent } from "@/server/ai/decision";
import { normalizeAnswers, type LunaClient } from "@/server/ai/luna";
import type { VisionAnalyst } from "@/server/ai/vision";
import { AiConfigError, CaseBusyError, CaseNotFoundError, ValidationError, mapProviderError } from "@/server/errors";
import { createEvalLogger, type EvalLogger } from "@/server/eval-log";
import { ImageError, processImage } from "@/server/image";
import { loadPolicies } from "@/server/policies";

// Collaborators are fakes whose answers are built from the real recordings (plan §4). Each derived
// copy has one documented edit; the photo and the policies are real.

const REPO_DIR = path.resolve(import.meta.dirname, "../../..");
const RECORDED_DIR = path.resolve(import.meta.dirname, "../fixtures/recorded");
const POLICIES_DIR = path.join(REPO_DIR, "docs", "policies");
const PHOTO_PATH = path.join(REPO_DIR, "assets", "example-images", "laptop-2.webp");
const PRD_PATH = path.join(REPO_DIR, "docs", "PRD.md");
const TODAY = "2026-11-26";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Capture {
  response: { status: number; body: unknown };
}

interface ChatBody {
  choices: Array<{ message: { content: string } }>;
}

function readRecorded<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, name), "utf8")) as T;
}

function firstContent(name: string): { [key: string]: unknown } {
  const body = readRecorded<Capture>(name).response.body as ChatBody;
  const choice = body.choices[0];
  if (!choice) throw new Error(`${name} has no choices`);
  return JSON.parse(choice.message.content) as { [key: string]: unknown };
}

// LunaSignals from the recorded Decisions answers, normalised with the default threshold (0.8).
function lunaFromRecording(): LunaSignals {
  const capture = readRecorded<{ response: { body: { model: string; answers: unknown } } }>(
    "luna-decisions-return-laptop.json",
  );
  const normalized = normalizeAnswers(capture.response.body.answers, "return", "laptop", 0.8);
  return {
    status: normalized.status,
    model: capture.response.body.model,
    latencyMs: 0,
    signals: normalized.signals,
    derivedCategoryMatch: normalized.derivedCategoryMatch,
  };
}

// Documented edit: the recorded damage type is free text; the schema needs an enum value.
function analysisFromRecording(): ImageAnalysis {
  const analysis = firstContent("vision-structured-return-laptop.json") as { damage: Array<{ type: string }> };
  const first = analysis.damage[0];
  if (!first) throw new Error("recording has no damage item");
  first.type = "cracked_glass";
  return imageAnalysisSchema.parse(analysis);
}

// Documented edit (as in T17): the recording has one next step and validateDecision needs 2 to 5.
function draftFromRecording(): DecisionDraft {
  const draft = firstContent("decision-structured-return.json") as { nextStepsPl: string[] };
  draft.nextStepsPl.push("Zachowaj potwierdzenie zakupu do czasu zakończenia sprawy.");
  return decisionDraftSchema.parse(draft);
}

// The recorded 401 body, passed through the provider error mapping (ADR-001 §5).
function mapped401() {
  const capture = readRecorded<Capture>("error-401-invalid-key.json");
  return mapProviderError(
    new APICallError({
      message: "Invalid API key",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: capture.response.status,
      responseBody: JSON.stringify(capture.response.body),
    }),
  );
}

function photo() {
  const bytes = fs.readFileSync(PHOTO_PATH);
  return { bytes, declaredType: "image/webp", size: bytes.length };
}

async function rejectionOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
}

type VisionOutcome = { analysis: ImageAnalysis } | { error: unknown };
type DecisionOutcome = { draft: DecisionDraft } | { error: unknown };

function fakeLuna() {
  const calls: Array<{ caseType: string; today: string }> = [];
  const signals = lunaFromRecording();
  const client: LunaClient = {
    async evaluate(input) {
      calls.push({ caseType: input.caseType, today: input.today });
      return signals;
    },
  };
  return { client, calls };
}

function fakeVision(outcome: VisionOutcome) {
  const calls: Array<{ caseType: string }> = [];
  const analyst: VisionAnalyst = {
    async analyze(input) {
      calls.push({ caseType: input.caseType });
      if ("error" in outcome) throw outcome.error;
      return outcome.analysis;
    },
  };
  return { analyst, calls };
}

function fakeDecision(outcome: DecisionOutcome) {
  const calls: Array<{ caseType: string }> = [];
  const agent: DecisionAgent = {
    async decide(input) {
      calls.push({ caseType: input.caseType });
      if ("error" in outcome) throw outcome.error;
      return { draft: outcome.draft, appliedGuardrails: [], attempts: 1 };
    },
  };
  return { agent, calls };
}

function setup(options: { vision?: VisionOutcome; decision?: DecisionOutcome; evalLog?: EvalLogger } = {}) {
  const store: CaseStore = createCaseStore({ ttlMinutes: 120 });
  const luna = fakeLuna();
  const vision = fakeVision(options.vision ?? { analysis: analysisFromRecording() });
  const decision = fakeDecision(options.decision ?? { draft: draftFromRecording() });
  const service = createCaseService({
    store,
    processImage,
    luna: luna.client,
    vision: vision.analyst,
    decisionAgent: decision.agent,
    policies: loadPolicies(POLICIES_DIR),
    evalLog: options.evalLog,
    models: { vision: "openai/gpt-6-luna", decision: "openai/gpt-6-luna", decisions: "openai/gpt-6-luna-decisions" },
    today: () => TODAY,
  });
  return { service, store, luna, vision, decision };
}

const returnForm = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-21",
  description: "",
};

describe("case service: create", () => {
  it("creates an analysed case from a valid form and a real photo (ADR-002 §3.1, §5.1)", async () => {
    const { service, store, luna, vision } = setup();

    const { caseId } = await service.create({ form: returnForm, file: photo() });

    expect(caseId).toMatch(UUID);
    const stored = store.get(caseId);
    expect(stored?.status).toBe("analysed");
    expect(stored?.luna?.status).toBe(lunaFromRecording().status);
    expect(stored?.analysis?.categoryMatch).toBe("match");
    expect(stored?.image?.mediaType).toBe("image/webp");
    expect(stored?.image?.width).toBeGreaterThan(0);
    expect(stored?.timings?.lunaMs).toBeTypeOf("number");
    expect(stored?.timings?.visionMs).toBeTypeOf("number");
    expect(luna.calls).toEqual([{ caseType: "return", today: TODAY }]);
    expect(vision.calls).toEqual([{ caseType: "return" }]);
  });

  it("rejects invalid fields with field codes and creates no case (ADR-002 §5.6)", async () => {
    const { service, store, luna, vision } = setup();

    const error = await rejectionOf(
      service.create({ form: { ...returnForm, modelName: "", purchaseDate: "2999-01-01" }, file: photo() }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    const fieldErrors = (error as ValidationError).fieldErrors;
    expect(fieldErrors?.modelName).toBe("MODEL_NAME");
    expect(fieldErrors?.purchaseDate).toBe("PURCHASE_DATE");
    expect(store.size()).toBe(0);
    expect(luna.calls).toHaveLength(0);
    expect(vision.calls).toHaveLength(0);
  });

  it("rejects a file whose bytes are not an image with UNSUPPORTED_IMAGE and creates no case", async () => {
    const { service, store, luna } = setup();
    const bytes = fs.readFileSync(PRD_PATH);

    const error = await rejectionOf(
      service.create({ form: returnForm, file: { bytes, declaredType: "image/jpeg", size: bytes.length } }),
    );

    expect(error).toBeInstanceOf(ImageError);
    expect((error as ImageError).code).toBe("UNSUPPORTED_IMAGE");
    expect(store.size()).toBe(0);
    expect(luna.calls).toHaveLength(0);
  });

  it("deletes the case and rethrows the mapped error when vision fails (ADR-002 §5.1)", async () => {
    const { service, store, luna } = setup({ vision: { error: mapped401() } });

    const error = await rejectionOf(service.create({ form: returnForm, file: photo() }));

    expect(error).toBeInstanceOf(AiConfigError);
    expect(store.size()).toBe(0);
    expect(luna.calls).toHaveLength(1);
  });
});

describe("case service: decide", () => {
  async function createCase(service: Awaited<ReturnType<typeof setup>>["service"]): Promise<string> {
    return (await service.create({ form: returnForm, file: photo() })).caseId;
  }

  it("returns the first message with decision, text and summary parts and drops the image (TAC-002-03)", async () => {
    const { service, store } = setup();
    const caseId = await createCase(service);

    const message = await service.decide({ caseId });

    expect(message.parts.map((part) => part.type)).toEqual(["text", "data-decision", "text"]);
    const stored = store.get(caseId);
    expect(stored?.status).toBe("decided");
    expect(stored?.decisions).toHaveLength(1);
    expect(stored?.decisions[0]?.version).toBe(1);
    expect(stored?.decisions[0]?.source).toBe("initial");
    expect(stored?.decisions[0]?.outcome).toBe("ACCEPT");
    expect(stored?.messages).toHaveLength(1);
    expect(stored?.messages[0]?.id).toBe(message.id);
    expect(stored?.gates).not.toBeNull();
    expect(stored?.image).toBeNull();
  });

  it("returns the same message on a second call without another agent call (idempotent)", async () => {
    const { service, decision } = setup();
    const caseId = await createCase(service);

    const first = await service.decide({ caseId });
    const second = await service.decide({ caseId });

    expect(second.id).toBe(first.id);
    expect(decision.calls).toHaveLength(1);
  });

  it("throws CaseBusyError while another request holds the case lock", async () => {
    const { service, store, decision } = setup();
    const caseId = await createCase(service);
    expect(store.tryLock(caseId)).toBe(true);

    const error = await rejectionOf(service.decide({ caseId }));

    expect(error).toBeInstanceOf(CaseBusyError);
    expect(decision.calls).toHaveLength(0);
  });

  it("throws CaseNotFoundError for an unknown case", async () => {
    const { service } = setup();

    const error = await rejectionOf(service.decide({ caseId: randomUUID() }));

    expect(error).toBeInstanceOf(CaseNotFoundError);
  });

  it("keeps the case analysed and unlocked when the decision agent fails (ADR-002 §5.1)", async () => {
    const { service, store } = setup({ decision: { error: mapped401() } });
    const caseId = await createCase(service);

    const error = await rejectionOf(service.decide({ caseId }));

    expect(error).toBeInstanceOf(AiConfigError);
    expect(store.get(caseId)?.status).toBe("analysed");
    expect(store.tryLock(caseId)).toBe(true);
  });
});

describe("case service: evaluation log failures (orchestrator fix at T19 acceptance)", () => {
  it("still returns the decision when appending the evaluation line throws", async () => {
    const failingLog = { append: () => { throw new Error("disk full"); } } as unknown as EvalLogger;
    const { service, store } = setup({ evalLog: failingLog });
    const { caseId } = await service.create({ form: returnForm, file: photo() });

    const message = await service.decide({ caseId });

    expect(message.parts.map((part) => part.type)).toEqual(["text", "data-decision", "text"]);
    expect(store.get(caseId)?.status).toBe("decided");
  });
});

describe("case service: evaluation log", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsdc-eval-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("appends one line per decided case without customer text, image data or observations (TAC-001-07)", async () => {
    const logPath = path.join(dir, "eval.jsonl");
    const { service } = setup({ evalLog: createEvalLogger(logPath) });
    const { caseId } = await service.create({ form: returnForm, file: photo() });

    await service.decide({ caseId });

    const lines = fs.readFileSync(logPath, "utf8").split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    const record = JSON.parse(line) as { agreement: Record<string, string>; outcome: string; latencyMs: { decision: number } };
    expect(record.agreement.category).toBe("agree");
    expect(record.outcome).toBe("ACCEPT");
    expect(record.latencyMs.decision).toBeTypeOf("number");
    for (const forbidden of ["description", "Lenovo ThinkPad E14", "data:image", "observationsPl"]) {
      expect(line).not.toContain(forbidden);
    }
  });
});
