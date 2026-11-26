import fs from "node:fs";
import path from "node:path";
import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";
import type { ApiErrorCode } from "@/lib/shared/schemas/enums";
import { ImageError } from "@/server/image";
import {
  AiConfigError,
  AiOutputError,
  AiTimeoutError,
  AiUnavailableError,
  AttachmentsNotAllowedError,
  CaseBusyError,
  CaseNotFoundError,
  CaseNotReadyError,
  ChatLimitError,
  DuplicateMessageError,
  MessageLengthError,
  ValidationError,
  mapProviderError,
  toErrorResponse,
} from "@/server/errors";

// tests/unit -> app/tests/fixtures/recorded (real OpenRouter captures, ADR-000 testing policy)
const RECORDED = path.resolve(import.meta.dirname, "../fixtures/recorded");
interface HttpCapture {
  request: { url: string; body: unknown };
  response: { status: number; body: unknown };
}

interface ErrorCapture {
  error: { name: string; message: string };
}

function readCapture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(RECORDED, name), "utf8")) as T;
}

const capture401 = readCapture<HttpCapture>("error-401-invalid-key.json");
const capture400 = readCapture<HttpCapture>("error-400-unknown-model.json");
const captureTimeout = readCapture<ErrorCapture>("error-timeout.json");
const captureRefused = readCapture<ErrorCapture>("error-connection-refused.json");
const OPENROUTER_URL = capture401.request.url;

/** APICallError built from a real capture, the way the provider client would surface it. */
function apiErrorFromCapture(capture: HttpCapture): APICallError {
  return new APICallError({
    message: "x",
    url: capture.request.url,
    requestBodyValues: capture.request.body,
    statusCode: capture.response.status,
    responseBody: JSON.stringify(capture.response.body),
  });
}

/** Status-only APICallError: no response body exists in the recordings for these codes. */
function apiErrorStatusOnly(statusCode: number): APICallError {
  return new APICallError({
    message: "status only",
    url: OPENROUTER_URL,
    requestBodyValues: undefined,
    statusCode,
  });
}

describe("toErrorResponse", () => {
  const rows: Array<[string, unknown, number, ApiErrorCode]> = [
    ["ValidationError", new ValidationError({ modelName: "MODEL_NAME" }), 400, "VALIDATION_ERROR"],
    ["ImageError FILE_TOO_LARGE", new ImageError("FILE_TOO_LARGE"), 413, "FILE_TOO_LARGE"],
    ["ImageError UNSUPPORTED_IMAGE", new ImageError("UNSUPPORTED_IMAGE"), 415, "UNSUPPORTED_IMAGE"],
    ["ImageError IMAGE_UNREADABLE", new ImageError("IMAGE_UNREADABLE"), 422, "IMAGE_UNREADABLE"],
    ["CaseNotFoundError", new CaseNotFoundError(), 404, "CASE_NOT_FOUND"],
    ["CaseBusyError", new CaseBusyError(), 409, "CASE_BUSY"],
    ["CaseNotReadyError", new CaseNotReadyError(), 409, "CASE_NOT_READY"],
    ["ChatLimitError", new ChatLimitError(), 409, "CHAT_LIMIT"],
    ["DuplicateMessageError", new DuplicateMessageError(), 409, "DUPLICATE_MESSAGE"],
    ["AttachmentsNotAllowedError", new AttachmentsNotAllowedError(), 400, "ATTACHMENTS_NOT_ALLOWED"],
    ["MessageLengthError", new MessageLengthError(), 400, "MESSAGE_LENGTH"],
    ["AiUnavailableError", new AiUnavailableError(), 502, "AI_UNAVAILABLE"],
    ["AiConfigError", new AiConfigError(), 502, "AI_UNAVAILABLE"],
    ["AiOutputError", new AiOutputError(), 502, "AI_UNAVAILABLE"],
    ["AiTimeoutError", new AiTimeoutError(), 504, "AI_TIMEOUT"],
  ];

  it.each(rows)("maps %s to HTTP %i and code %s with the Polish message", (_name, error, status, code) => {
    const response = toErrorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.messagePl).toBe(API_ERROR_MESSAGES[code]);
  });

  it("keeps fieldErrors on ValidationError", () => {
    const response = toErrorResponse(new ValidationError({ modelName: "MODEL_NAME", description: "DESCRIPTION_MIN" }));

    expect(response.body.error.fieldErrors?.modelName).toBe("MODEL_NAME");
    expect(response.body.error.fieldErrors?.description).toBe("DESCRIPTION_MIN");
  });

  it("returns image error codes as field errors on the image field", () => {
    const response = toErrorResponse(new ImageError("FILE_TOO_LARGE"));

    expect(response.body.error.fieldErrors?.image).toBe("FILE_TOO_LARGE");
  });

  it("maps an unknown error to 500 INTERNAL without leaking its message", () => {
    const response = toErrorResponse(new Error("secret detail"));

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL");
    expect(response.body.error.messagePl).toBe(API_ERROR_MESSAGES.INTERNAL);
    expect(JSON.stringify(response.body)).not.toContain("secret detail");
  });

  it("does not copy the cause message of an AI error into the body", () => {
    const response = toErrorResponse(new AiUnavailableError(new Error("secret upstream detail")));

    expect(response.body.error.code).toBe("AI_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("secret upstream detail");
  });
});

describe("mapProviderError with real recorded errors", () => {
  it("maps the recorded 401 invalid key to AiConfigError", () => {
    expect(mapProviderError(apiErrorFromCapture(capture401))).toBeInstanceOf(AiConfigError);
  });

  it("maps the recorded 400 unknown model to AiConfigError", () => {
    expect(mapProviderError(apiErrorFromCapture(capture400))).toBeInstanceOf(AiConfigError);
  });

  it("maps the recorded client timeout to AiTimeoutError", () => {
    const error = new Error(captureTimeout.error.message);
    error.name = captureTimeout.error.name;

    expect(mapProviderError(error)).toBeInstanceOf(AiTimeoutError);
  });

  it("maps the recorded connection refusal to AiUnavailableError", () => {
    const error = new TypeError(captureRefused.error.message);

    expect(mapProviderError(error)).toBeInstanceOf(AiUnavailableError);
  });

  it("unwraps a RetryError around the recorded 401 and maps it to AiConfigError", () => {
    const retry = new RetryError({
      message: "retry",
      reason: "maxRetriesExceeded",
      errors: [apiErrorFromCapture(capture401)],
    });

    expect(mapProviderError(retry)).toBeInstanceOf(AiConfigError);
  });
});

describe("mapProviderError by status code only (no recorded body exists)", () => {
  it.each([429, 502, 503])("maps status %i to AiUnavailableError", (status) => {
    expect(mapProviderError(apiErrorStatusOnly(status))).toBeInstanceOf(AiUnavailableError);
  });

  it("maps status 402 to AiUnavailableError with reason OPENROUTER_CREDITS", () => {
    const mapped = mapProviderError(apiErrorStatusOnly(402));

    expect(mapped).toBeInstanceOf(AiUnavailableError);
    expect((mapped as AiUnavailableError).reason).toBe("OPENROUTER_CREDITS");
  });

  it("maps status 408 to AiTimeoutError", () => {
    expect(mapProviderError(apiErrorStatusOnly(408))).toBeInstanceOf(AiTimeoutError);
  });
});

describe("mapProviderError other rules", () => {
  it("maps NoObjectGeneratedError to AiOutputError", () => {
    const error = new NoObjectGeneratedError({
      message: "no object",
      text: "not json",
      response: { id: "r1", timestamp: new Date(0), modelId: "m" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    } as ConstructorParameters<typeof NoObjectGeneratedError>[0]);

    expect(mapProviderError(error)).toBeInstanceOf(AiOutputError);
  });

  it("maps an AbortError by name to AiTimeoutError", () => {
    const error = new Error("aborted");
    error.name = "AbortError";

    expect(mapProviderError(error)).toBeInstanceOf(AiTimeoutError);
  });

  it("maps any other unknown failure to AiUnavailableError", () => {
    expect(mapProviderError(new Error("something else"))).toBeInstanceOf(AiUnavailableError);
    expect(mapProviderError("not an error")).toBeInstanceOf(AiUnavailableError);
  });
});
