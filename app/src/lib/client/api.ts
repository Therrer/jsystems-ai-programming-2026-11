// Browser client for the case API (ADR-002 §4–5, ADR-003 §3.2). Client code: no server imports.
import type { FieldErrors, FormValues } from "@/lib/client/case-flow";
import {
  createCaseResponseSchema,
  errorResponseSchema,
  type CreateCaseResponse,
  type DecisionResponse,
} from "@/lib/shared/schemas/api";
import type { ApiErrorCode } from "@/lib/shared/schemas/enums";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly messagePl: string;
  readonly fieldErrors?: FieldErrors;

  constructor(init: { status: number; code: ApiErrorCode; messagePl: string; fieldErrors?: FieldErrors }) {
    super(init.messagePl);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.messagePl = init.messagePl;
    this.fieldErrors = init.fieldErrors;
  }
}

/**
 * Turns a non-2xx response into an ApiError. A JSON body is parsed with the shared error schema. A body
 * that is not JSON (for example a proxy 413) maps to FILE_TOO_LARGE for 413 and INTERNAL otherwise.
 */
export async function toApiError(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const parsed = errorResponseSchema.safeParse(json);
  if (parsed.success) {
    const { code, messagePl, fieldErrors } = parsed.data.error;
    return new ApiError({
      status: response.status,
      code,
      messagePl,
      fieldErrors: fieldErrors as FieldErrors | undefined,
    });
  }
  const code: ApiErrorCode = response.status === 413 ? "FILE_TOO_LARGE" : "INTERNAL";
  return new ApiError({ status: response.status, code, messagePl: API_ERROR_MESSAGES[code] });
}

async function requestJson<T>(url: string, init: RequestInit, parse: (data: unknown) => T): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await toApiError(response);
  try {
    return parse(await response.json());
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({ status: response.status, code: "INTERNAL", messagePl: API_ERROR_MESSAGES.INTERNAL });
  }
}

/** Step 1 (ADR-002 §4.1): multipart POST /api/cases with the six form fields. */
export function createCase(values: FormValues, file: File, signal?: AbortSignal): Promise<CreateCaseResponse> {
  const form = new FormData();
  form.set("caseType", values.caseType ?? "");
  form.set("category", values.category ?? "");
  form.set("modelName", values.modelName);
  form.set("purchaseDate", values.purchaseDate);
  form.set("description", values.description);
  form.set("image", file);
  return requestJson("/api/cases", { method: "POST", body: form, signal }, (data) =>
    createCaseResponseSchema.parse(data),
  );
}

/** Step 2 (ADR-002 §4.2): POST /api/cases/{caseId}/decision returns the first assistant message. */
export function requestDecision(caseId: string, signal?: AbortSignal): Promise<DecisionResponse> {
  return requestJson(
    `/api/cases/${encodeURIComponent(caseId)}/decision`,
    { method: "POST", signal },
    (data) => data as DecisionResponse,
  );
}

/** Fire-and-forget cleanup for "Nowa sprawa": keepalive lets it finish after navigation; errors are ignored. */
export async function deleteCase(caseId: string): Promise<void> {
  try {
    await fetch(`/api/cases/${encodeURIComponent(caseId)}`, { method: "DELETE", keepalive: true });
  } catch {
    // The case is discarded on the client either way.
  }
}
