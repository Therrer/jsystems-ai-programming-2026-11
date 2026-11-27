// Case form validation shared by client and server (PRD AC-01 – AC-11, AC-14; ADR-002 §4.1).
// Use validateCaseForm(): it reports one error code per invalid field, for all fields at once.
import { z } from "zod";
import { isIsoDate, todayInWarsaw } from "../dates";
import { CASE_TYPES, CATEGORIES, type CaseType, type Category, type FieldErrorCode } from "./enums";

export const MODEL_NAME_MIN = 2;
export const MODEL_NAME_MAX = 100;
export const DESCRIPTION_MIN_COMPLAINT = 20;
export const DESCRIPTION_MAX = 2000;
export const MIN_PURCHASE_DATE = "2000-01-01";
export const MAX_IMAGE_BYTES = 10_485_760; // 10 MB (MiB), PRD AC-11
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Length in Unicode code points, the same on client and server (an emoji counts as 1). */
export const codePointLength = (value: string): number => [...value].length;

export type CaseFormField = "caseType" | "category" | "modelName" | "purchaseDate" | "description";
export type ImageField = "image";

export interface CaseFormInput {
  caseType: CaseType;
  category: Category;
  modelName: string;
  purchaseDate: string;
  description: string;
}

export type CaseFormValidation =
  | { ok: true; data: CaseFormInput }
  | { ok: false; fieldErrors: Partial<Record<CaseFormField, FieldErrorCode>> };

const trimmed = (code: FieldErrorCode) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string(code));

/** Field-level schema; `today` is injected so validation is testable and matches Europe/Warsaw. */
export function createCaseFormFieldsSchema(today: string) {
  return z.object({
    caseType: z.enum(CASE_TYPES, "REQUIRED"),
    category: z.enum(CATEGORIES, "REQUIRED"),
    modelName: trimmed("MODEL_NAME").refine((v) => {
      const len = codePointLength(v);
      return len >= MODEL_NAME_MIN && len <= MODEL_NAME_MAX;
    }, "MODEL_NAME"),
    purchaseDate: trimmed("PURCHASE_DATE").refine(
      (v) => isIsoDate(v) && v >= MIN_PURCHASE_DATE && v <= today,
      "PURCHASE_DATE",
    ),
    description: z.preprocess(
      (v) => (v === undefined || v === null ? "" : typeof v === "string" ? v.trim() : v),
      z.string("DESCRIPTION_MAX"),
    ).refine((v) => codePointLength(v) <= DESCRIPTION_MAX, "DESCRIPTION_MAX"),
  });
}

export function validateCaseForm(input: unknown, today: string = todayInWarsaw()): CaseFormValidation {
  const fieldErrors: Partial<Record<CaseFormField, FieldErrorCode>> = {};
  const result = createCaseFormFieldsSchema(today).safeParse(input ?? {});

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as CaseFormField | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message as FieldErrorCode;
    }
  }

  // The complaint minimum depends on caseType, so it is checked even when other fields fail (AC-14).
  const raw = (input ?? {}) as Record<string, unknown>;
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!fieldErrors.description && raw.caseType === "complaint" && codePointLength(description) < DESCRIPTION_MIN_COMPLAINT) {
    fieldErrors.description = "DESCRIPTION_MIN";
  }

  if (Object.keys(fieldErrors).length > 0 || !result.success) return { ok: false, fieldErrors };
  return { ok: true, data: result.data };
}

/** Client- and server-side checks on the declared file (the server also decodes it, ADR-002 §3.3). */
export function validateImageFile(file: { size: number; type: string } | null | undefined): FieldErrorCode | null {
  if (!file) return "IMAGE_REQUIRED";
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "UNSUPPORTED_IMAGE";
  if (file.size > MAX_IMAGE_BYTES) return "FILE_TOO_LARGE";
  return null;
}
