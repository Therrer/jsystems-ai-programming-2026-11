import "server-only";

import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import type { ErrorResponse } from "@/lib/shared/schemas/api";
import type { CaseFormField } from "@/lib/shared/schemas/case-form";
import type { ApiErrorCode, FieldErrorCode } from "@/lib/shared/schemas/enums";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";
import { ImageError } from "@/server/image";

// Domain errors and their HTTP mapping (ADR-002 §5.6, ADR-001 §5). Messages here are for logs and
// developers only; responses carry the Polish text from API_ERROR_MESSAGES, never err.message.
type FieldErrors = Partial<Record<CaseFormField | "image", FieldErrorCode>>;

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;
  override readonly cause?: unknown;

  constructor(code: ApiErrorCode, status: number, message: string, fieldErrors?: FieldErrors, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.cause = cause;
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: FieldErrors) {
    super("VALIDATION_ERROR", 400, "Validation failed", fieldErrors);
  }
}

export class CaseNotFoundError extends AppError {
  constructor() {
    super("CASE_NOT_FOUND", 404, "Case not found");
  }
}

export class CaseBusyError extends AppError {
  constructor() {
    super("CASE_BUSY", 409, "Case is busy");
  }
}

export class CaseNotReadyError extends AppError {
  constructor() {
    super("CASE_NOT_READY", 409, "Case decision not ready");
  }
}

export class ChatLimitError extends AppError {
  constructor() {
    super("CHAT_LIMIT", 409, "Chat message limit reached");
  }
}

export class DuplicateMessageError extends AppError {
  constructor() {
    super("DUPLICATE_MESSAGE", 409, "Duplicate message");
  }
}

export class AttachmentsNotAllowedError extends AppError {
  constructor() {
    super("ATTACHMENTS_NOT_ALLOWED", 400, "Attachments are not allowed");
  }
}

export class MessageLengthError extends AppError {
  constructor() {
    super("MESSAGE_LENGTH", 400, "Message length out of range");
  }
}

export class AiUnavailableError extends AppError {
  readonly reason?: "OPENROUTER_CREDITS";

  constructor(cause?: unknown, reason?: "OPENROUTER_CREDITS") {
    super("AI_UNAVAILABLE", 502, "AI provider unavailable", undefined, cause);
    this.reason = reason;
  }
}

export class AiConfigError extends AppError {
  constructor(cause?: unknown) {
    super("AI_UNAVAILABLE", 502, "AI provider rejected the configuration", undefined, cause);
  }
}

export class AiOutputError extends AppError {
  constructor(cause?: unknown) {
    super("AI_UNAVAILABLE", 502, "AI provider returned unusable output", undefined, cause);
  }
}

export class AiTimeoutError extends AppError {
  constructor(cause?: unknown) {
    super("AI_TIMEOUT", 504, "AI provider timed out", undefined, cause);
  }
}

const IMAGE_STATUS: Record<ImageError["code"], number> = {
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 415,
  IMAGE_UNREADABLE: 422,
};

function bodyFor(code: ApiErrorCode, fieldErrors?: FieldErrors): ErrorResponse {
  return {
    error: {
      code,
      messagePl: API_ERROR_MESSAGES[code],
      ...(fieldErrors ? { fieldErrors: fieldErrors as Record<string, FieldErrorCode> } : {}),
    },
  };
}

export function toErrorResponse(err: unknown): { status: number; body: ErrorResponse } {
  if (err instanceof AppError) {
    return { status: err.status, body: bodyFor(err.code, err.fieldErrors) };
  }
  if (err instanceof ImageError) {
    return {
      status: IMAGE_STATUS[err.code],
      body: bodyFor(err.code, { image: err.code }),
    };
  }
  return { status: 500, body: bodyFor("INTERNAL") };
}

// Classifies one error; undefined means "no specific rule matched".
function classify(err: unknown): AppError | undefined {
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    if (status === 408) return new AiTimeoutError(err);
    if (status === 402) return new AiUnavailableError(err, "OPENROUTER_CREDITS");
    if (status === 429 || status === 502 || status === 503) return new AiUnavailableError(err);
    if (status === 400 || status === 401) return new AiConfigError(err);
    return undefined;
  }
  if (NoObjectGeneratedError.isInstance(err)) return new AiOutputError(err);
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new AiTimeoutError(err);
  }
  return undefined;
}

// ADR-001 §5: unwrap RetryError.lastError, follow .cause once, otherwise treat as unavailable.
export function mapProviderError(err: unknown): AiTimeoutError | AiUnavailableError | AiConfigError | AiOutputError {
  const unwrapped = RetryError.isInstance(err) ? err.lastError : err;
  const direct = classify(unwrapped);
  if (direct) return direct;

  const cause = unwrapped instanceof Error ? unwrapped.cause : undefined;
  const nested = cause === undefined ? undefined : classify(cause);
  if (nested) return nested;

  // Covers the network failure (TypeError "fetch failed") and every unlisted error.
  return new AiUnavailableError(unwrapped);
}
