import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createCase, deleteCase, requestDecision } from "@/lib/client/api";
import type { FormValues } from "@/lib/client/case-flow";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";

const RECORDED = path.resolve(import.meta.dirname, "../../fixtures/recorded");
type Fixture = {
  request: { method: string; url: string };
  response: { status: number; body: unknown; rawText?: string };
};
const fixture = (name: string): Fixture => JSON.parse(readFileSync(path.join(RECORDED, name), "utf8"));

/** Builds a Response from a real recording. Only the content-type is kept; the gzip header is not replayed. */
function respond(recorded: Fixture, status = recorded.response.status): Response {
  if (recorded.response.body === null) return new Response(null, { status });
  return new Response(JSON.stringify(recorded.response.body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VALUES: FormValues = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-21",
  description: "",
};
const FILE = new File([new Uint8Array([1, 2, 3])], "laptop-2.webp", { type: "image/webp" });
const CASE_ID = (fixture("app-cases-201.json").response.body as { caseId: string }).caseId;

function stubFetch(impl: (input: string, init: RequestInit) => Promise<Response> | Response) {
  const mock = vi.fn(async (input: string | URL, init?: RequestInit) => impl(String(input), init ?? {}));
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCase", () => {
  it("posts multipart with the six form fields to /api/cases and returns the caseId", async () => {
    const recorded = fixture("app-cases-201.json");
    const fetchMock = stubFetch(() => respond(recorded));

    const result = await createCase(VALUES, FILE);

    expect(result).toEqual({ caseId: CASE_ID });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/cases");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("caseType")).toBe("return");
    expect(form.get("category")).toBe("laptop");
    expect(form.get("modelName")).toBe("Lenovo ThinkPad E14");
    expect(form.get("purchaseDate")).toBe("2026-11-21");
    expect(form.has("description")).toBe(true);
    expect((form.get("image") as File).name).toBe("laptop-2.webp");
  });

  it("maps a 400 validation body to ApiError with the field error for modelName and purchaseDate", async () => {
    const recorded = fixture("app-cases-400-validation.json");
    stubFetch(() => respond(recorded));

    const error = await caught(createCase(VALUES, FILE));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).code).toBe("VALIDATION_ERROR");
    expect((error as ApiError).fieldErrors?.modelName).toBe("MODEL_NAME");
    expect((error as ApiError).fieldErrors?.purchaseDate).toBe("PURCHASE_DATE");
  });

  it("maps a 415 body to ApiError with fieldErrors.image", async () => {
    stubFetch(() => respond(fixture("app-cases-415-not-an-image.json")));

    const error = await caught(createCase(VALUES, FILE));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UNSUPPORTED_IMAGE");
    expect((error as ApiError).fieldErrors?.image).toBe("UNSUPPORTED_IMAGE");
  });

  it("maps a 502 body to ApiError with code AI_UNAVAILABLE and the Polish message", async () => {
    stubFetch(() => respond(fixture("app-cases-502-invalid-key.json")));

    const error = await caught(createCase(VALUES, FILE));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).code).toBe("AI_UNAVAILABLE");
    expect((error as ApiError).messagePl).toBe(API_ERROR_MESSAGES.AI_UNAVAILABLE);
  });

  it("maps a non-JSON 413 from a proxy to ApiError code FILE_TOO_LARGE", async () => {
    // No recording exists for a proxy 413. The empty body is the one edited field relative to the
    // real 415 recording (app-cases-415-not-an-image.json): the status is the only other change.
    stubFetch(() => new Response("", { status: 413 }));

    const error = await caught(createCase(VALUES, FILE));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(413);
    expect((error as ApiError).code).toBe("FILE_TOO_LARGE");
    expect((error as ApiError).messagePl).toBe(API_ERROR_MESSAGES.FILE_TOO_LARGE);
  });

  it("rethrows an aborted request as an AbortError instead of an ApiError", async () => {
    stubFetch((_url, init) => {
      const signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const controller = new AbortController();
    const pending = createCase(VALUES, FILE, controller.signal);
    controller.abort();

    const error = await caught(pending);

    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe("AbortError");
  });
});

describe("requestDecision", () => {
  it("posts to the decision route and returns the real first message", async () => {
    const recorded = fixture("app-decision-200.json");
    const fetchMock = stubFetch(() => respond(recorded));

    const result = await requestDecision(CASE_ID);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/cases/${CASE_ID}/decision`);
    expect(init.method).toBe("POST");
    expect(result.message.role).toBe("assistant");
    expect(result.message.parts.some((part) => part.type === "data-decision")).toBe(true);
  });

  it("maps a 404 decision body to ApiError with code CASE_NOT_FOUND", async () => {
    stubFetch(() => respond(fixture("app-decision-404-unknown.json")));

    const error = await caught(requestDecision(CASE_ID));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe("CASE_NOT_FOUND");
  });
});

describe("deleteCase", () => {
  it("sends DELETE with keepalive to the case route and resolves on 204", async () => {
    const fetchMock = stubFetch(() => respond(fixture("app-delete-204.json")));

    await expect(deleteCase(CASE_ID)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/cases/${CASE_ID}`);
    expect(init.method).toBe("DELETE");
    expect(init.keepalive).toBe(true);
  });

  it("does not throw when fetch rejects", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(deleteCase(CASE_ID)).resolves.toBeUndefined();
  });
});
