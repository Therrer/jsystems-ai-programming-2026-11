import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { decisionDraftSchema, type Decision, type DecisionDraft } from "@/lib/shared/schemas/ai";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";
import type { CaseService } from "@/server/cases/service";
import { createCaseStore } from "@/server/cases/store";
import { AiTimeoutError, AppError, CaseBusyError, CaseNotFoundError, ValidationError, mapProviderError } from "@/server/errors";
import { ImageError } from "@/server/image";
import { renderFirstMessage } from "@/server/ai/render-first-message";
import { createCasesHandlers } from "@/server/http/cases";

// Route-level tests for the case endpoints (ADR-002 §5.1, §5.2, §5.6). The service is a fake whose
// results and errors have the real shapes; the case store is the real one. Recorded fixtures give
// the decision draft (plan §4).

const REPO_DIR = path.resolve(import.meta.dirname, "../../../..");
const RECORDED_DIR = path.resolve(import.meta.dirname, "../../fixtures/recorded");
const PHOTO_PATH = path.join(REPO_DIR, "assets", "example-images", "laptop-2.webp");
const CASE_ID = "5b0c6f3e-2a7d-4c1e-9f8b-1d2e3f4a5b6c";
const CREATED_AT = "2026-11-26T09:00:00.000Z";

interface Capture {
  response: { status: number; body: unknown };
}

interface ChatBody {
  choices: Array<{ message: { content: string } }>;
}

// Documented edit (as in T17): the recording has one next step and validateDecision needs 2 to 5.
function draftFromRecording(): DecisionDraft {
  const capture = JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, "decision-structured-return.json"), "utf8")) as Capture;
  const content = (capture.response.body as ChatBody).choices[0]?.message.content;
  if (content === undefined) throw new Error("decision recording has no choices");
  const draft = JSON.parse(content) as { nextStepsPl: string[] };
  draft.nextStepsPl.push("Zachowaj potwierdzenie zakupu do czasu zakończenia sprawy.");
  return decisionDraftSchema.parse(draft);
}

// The message the real service returns from decide(): renderFirstMessage with an appended decision.
function firstMessage(): CaseUIMessage {
  const decision: Decision = {
    ...draftFromRecording(),
    version: 1,
    source: "initial",
    appliedGuardrails: [],
    createdAt: CREATED_AT,
  };
  return renderFirstMessage({ caseType: "return", modelName: "Laptop Pro 14", decision, createdAt: CREATED_AT, id: "first-msg" });
}

interface CreateCall {
  form: unknown;
  file: { bytes: Buffer; declaredType: string; size: number } | null;
  signal: AbortSignal | undefined;
}

function fakeService(behaviour: { createError?: unknown; decideError?: unknown } = {}) {
  const createCalls: CreateCall[] = [];
  const decideCalls: Array<{ caseId: string }> = [];
  const service: CaseService = {
    async create(input) {
      createCalls.push({ form: input.form, file: input.file, signal: input.signal });
      if (behaviour.createError !== undefined) throw behaviour.createError;
      return { caseId: CASE_ID };
    },
    async decide(input) {
      decideCalls.push({ caseId: input.caseId });
      if (behaviour.decideError !== undefined) throw behaviour.decideError;
      return firstMessage();
    },
  };
  return { service, createCalls, decideCalls };
}

function formWithPhoto(): FormData {
  const form = new FormData();
  form.set("caseType", "return");
  form.set("category", "laptop");
  form.set("modelName", "Laptop Pro 14");
  form.set("purchaseDate", "2026-11-01");
  form.set("description", "Ekran pęka bez upadku.");
  form.set("image", new File([fs.readFileSync(PHOTO_PATH)], "laptop-2.webp", { type: "image/webp" }));
  return form;
}

function createRequest(form: FormData, init: { headers?: Record<string, string>; signal?: AbortSignal } = {}): Request {
  return new Request("http://localhost/api/cases", { method: "POST", body: form, ...init });
}

interface ErrorBody {
  error?: { code: string; messagePl: string; fieldErrors?: Record<string, string> };
}

async function readJson(res: Response): Promise<ErrorBody & Record<string, unknown>> {
  return (await res.json()) as ErrorBody & Record<string, unknown>;
}

const context = (caseId: string) => ({ params: Promise.resolve({ caseId }) });

describe("POST /api/cases", () => {
  it("returns 201 with the caseId and passes the fields and the photo to the service", async () => {
    const { service, createCalls } = fakeService();
    const { create } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });
    const controller = new AbortController();

    const res = await create(createRequest(formWithPhoto(), { signal: controller.signal }));

    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ caseId: CASE_ID });
    expect(createCalls).toHaveLength(1);
    const call = createCalls[0];
    expect(call?.form).toEqual({
      caseType: "return",
      category: "laptop",
      modelName: "Laptop Pro 14",
      purchaseDate: "2026-11-01",
      description: "Ekran pęka bez upadku.",
    });
    expect(call?.file?.declaredType).toBe("image/webp");
    expect(call?.file?.size).toBe(fs.statSync(PHOTO_PATH).size);
    expect(call?.file?.bytes.length).toBe(fs.statSync(PHOTO_PATH).size);
    expect(call?.signal?.aborted).toBe(false);
    controller.abort();
    expect(call?.signal?.aborted).toBe(true);
  });

  it("answers 413 FILE_TOO_LARGE from the content-length header without calling the service", async () => {
    const { service, createCalls } = fakeService();
    const { create } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });

    const res = await create(createRequest(formWithPhoto(), { headers: { "content-length": "12000000" } }));

    expect(res.status).toBe(413);
    expect((await readJson(res)).error?.code).toBe("FILE_TOO_LARGE");
    expect(createCalls).toHaveLength(0);
  });

  it("answers 400 VALIDATION_ERROR for a body that is not multipart", async () => {
    const { service, createCalls } = fakeService();
    const { create } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });

    const res = await create(new Request("http://localhost/api/cases", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));

    expect(res.status).toBe(400);
    expect((await readJson(res)).error?.code).toBe("VALIDATION_ERROR");
    expect(createCalls).toHaveLength(0);
  });

  const rows: Array<[string, () => unknown, number, string]> = [
    ["ValidationError", () => new ValidationError({ modelName: "MODEL_NAME" }), 400, "VALIDATION_ERROR"],
    ["ImageError FILE_TOO_LARGE", () => new ImageError("FILE_TOO_LARGE"), 413, "FILE_TOO_LARGE"],
    ["ImageError UNSUPPORTED_IMAGE", () => new ImageError("UNSUPPORTED_IMAGE"), 415, "UNSUPPORTED_IMAGE"],
    ["ImageError IMAGE_UNREADABLE", () => new ImageError("IMAGE_UNREADABLE"), 422, "IMAGE_UNREADABLE"],
    ["CaseNotFoundError", () => new CaseNotFoundError(), 404, "CASE_NOT_FOUND"],
    ["CaseBusyError", () => new CaseBusyError(), 409, "CASE_BUSY"],
    [
      "mapped 401 (AiConfigError)",
      () =>
        mapProviderError(
          new APICallError({
            message: "Invalid API key",
            url: "https://openrouter.ai/api/v1/chat/completions",
            requestBodyValues: {},
            statusCode: 401,
            responseBody: "{}",
          }),
        ),
      502,
      "AI_UNAVAILABLE",
    ],
    ["AiTimeoutError", () => new AiTimeoutError(), 504, "AI_TIMEOUT"],
    ["unknown error", () => new Error("secret"), 500, "INTERNAL"],
  ];

  it.each(rows)("maps %s to its status, code and the Polish text", async (_label, makeError, status, code) => {
    const { service } = fakeService({ createError: makeError() });
    const { create } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });

    const res = await create(createRequest(formWithPhoto()));
    const text = await res.text();
    const body = JSON.parse(text) as { error: { code: string; messagePl: string; fieldErrors?: Record<string, string> } };

    expect(res.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(body.error.messagePl).toBe(API_ERROR_MESSAGES[code as keyof typeof API_ERROR_MESSAGES]);
    expect(text).not.toContain("secret");
  });

  it("returns the field errors of a ValidationError", async () => {
    const { service } = fakeService({ createError: new ValidationError({ modelName: "MODEL_NAME" }) });
    const { create } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });

    const res = await create(createRequest(formWithPhoto()));

    expect(res.status).toBe(400);
    expect((await readJson(res)).error?.fieldErrors).toEqual({ modelName: "MODEL_NAME" });
  });

  it("does not expose the message of an AppError", async () => {
    const { service } = fakeService({ createError: new AppError("INTERNAL", 500, "internal detail") });
    const { create } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });

    const res = await create(createRequest(formWithPhoto()));

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("internal detail");
  });
});

describe("POST /api/cases/{caseId}/decision", () => {
  it("returns 200 with the first message", async () => {
    const { service, decideCalls } = fakeService();
    const { decide } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });

    const res = await decide(new Request(`http://localhost/api/cases/${CASE_ID}/decision`, { method: "POST" }), context(CASE_ID));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: CaseUIMessage };
    expect(body.message.parts.map((part) => part.type)).toEqual(["text", "data-decision", "text"]);
    expect(decideCalls).toEqual([{ caseId: CASE_ID }]);
  });

  it("returns 404 CASE_NOT_FOUND for a malformed id without calling the service", async () => {
    const { service, decideCalls } = fakeService();
    const { decide } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });

    const res = await decide(new Request("http://localhost/api/cases/not-a-uuid/decision", { method: "POST" }), context("not-a-uuid"));

    expect(res.status).toBe(404);
    expect((await readJson(res)).error?.code).toBe("CASE_NOT_FOUND");
    expect(decideCalls).toHaveLength(0);
  });
});

describe("DELETE /api/cases/{caseId}", () => {
  it("returns 204 for a real case and removes it from the store", async () => {
    const store = createCaseStore({ ttlMinutes: 120 });
    const stored = store.create({ form: { caseType: "return", category: "laptop", modelName: "Laptop Pro 14", purchaseDate: "2026-11-01", description: "" }, image: null });
    const { service } = fakeService();
    const { remove } = createCasesHandlers({ service, store });
    expect(store.size()).toBe(1);

    const res = await remove(new Request(`http://localhost/api/cases/${stored.caseId}`, { method: "DELETE" }), context(stored.caseId));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(store.size()).toBe(0);
  });

  it("returns 204 for an unknown id", async () => {
    const { service } = fakeService();
    const { remove } = createCasesHandlers({ service, store: createCaseStore({ ttlMinutes: 120 }) });
    const unknown = randomUUID();

    const res = await remove(new Request(`http://localhost/api/cases/${unknown}`, { method: "DELETE" }), context(unknown));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});
