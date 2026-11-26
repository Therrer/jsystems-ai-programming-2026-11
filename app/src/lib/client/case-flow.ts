// Client-side state machine for the case form and the chat hand-off (ADR-003 §3.2, PRD AC-14, AC-15,
// AC-28, AC-37 – AC-40, §4.6). Pure: no React, no I/O. The caller validates before dispatching SUBMIT.
import type { CaseType, Category, FieldErrorCode, ApiErrorCode } from "@/lib/shared/schemas/enums";
import type { CaseFormField } from "@/lib/shared/schemas/case-form";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";

export interface FormValues {
  caseType: CaseType | null;
  category: Category | null;
  modelName: string;
  purchaseDate: string;
  description: string;
}
export type FieldErrors = Partial<Record<CaseFormField | "image", FieldErrorCode>>;
export interface FlowError {
  code: ApiErrorCode;
  messagePl: string;
}
interface FormPart {
  values: FormValues;
  file: File | null;
  previewUrl: string | null;
}
export type FlowState =
  | ({ kind: "editing"; fieldErrors: FieldErrors } & FormPart)
  | ({ kind: "processing"; step: 1 | 2; caseId: string | null } & FormPart)
  | ({ kind: "failed"; failedStep: 1 | 2; caseId: string | null; error: FlowError } & FormPart)
  | { kind: "chat"; caseId: string; values: FormValues; previewUrl: string | null; firstMessage: CaseUIMessage }
  | { kind: "expired"; caseId: string; values: FormValues; previewUrl: string | null; firstMessage: CaseUIMessage };
export type FlowAction =
  | { type: "SET_FIELD"; field: keyof FormValues; value: string | null }
  | { type: "SET_FILE"; file: File; previewUrl: string }
  | { type: "CLEAR_FILE" }
  | { type: "SET_FIELD_ERRORS"; fieldErrors: FieldErrors }
  | { type: "SUBMIT" }
  | { type: "CASE_CREATED"; caseId: string }
  | { type: "DECIDED"; message: CaseUIMessage }
  | { type: "FAILED"; step: 1 | 2; error: FlowError; fieldErrors?: FieldErrors }
  | { type: "RETRY" }
  | { type: "SESSION_EXPIRED" }
  | { type: "NEW_CASE" };

export const initialFlowState: FlowState = {
  kind: "editing",
  fieldErrors: {},
  values: { caseType: null, category: null, modelName: "", purchaseDate: "", description: "" },
  file: null,
  previewUrl: null,
};

/** Edits shared by `editing` and `failed`: they move to `editing` and clear the errors they touch. */
function applyEdit(part: FormPart, errors: FieldErrors, action: FlowAction): FlowState | null {
  switch (action.type) {
    case "SET_FIELD": {
      const fieldErrors: FieldErrors = { ...errors };
      delete fieldErrors[action.field];
      return {
        kind: "editing",
        values: { ...part.values, [action.field]: action.value } as FormValues,
        file: part.file,
        previewUrl: part.previewUrl,
        fieldErrors,
      };
    }
    case "SET_FILE": {
      const fieldErrors: FieldErrors = { ...errors };
      delete fieldErrors.image;
      return { kind: "editing", values: part.values, file: action.file, previewUrl: action.previewUrl, fieldErrors };
    }
    case "CLEAR_FILE": {
      const fieldErrors: FieldErrors = { ...errors };
      delete fieldErrors.image;
      return { kind: "editing", values: part.values, file: null, previewUrl: null, fieldErrors };
    }
    default:
      return null;
  }
}

export function caseFlowReducer(state: FlowState, action: FlowAction): FlowState {
  if (action.type === "NEW_CASE") return initialFlowState;

  switch (state.kind) {
    case "editing": {
      const edited = applyEdit(state, state.fieldErrors, action);
      if (edited) return edited;
      if (action.type === "SET_FIELD_ERRORS") return { ...state, fieldErrors: action.fieldErrors };
      if (action.type === "SUBMIT") {
        return { kind: "processing", step: 1, caseId: null, values: state.values, file: state.file, previewUrl: state.previewUrl };
      }
      return state;
    }

    case "processing": {
      const { values, file, previewUrl } = state;
      if (state.step === 1 && action.type === "CASE_CREATED") {
        return { kind: "processing", step: 2, caseId: action.caseId, values, file, previewUrl };
      }
      if (state.step === 2 && state.caseId !== null && action.type === "DECIDED") {
        return { kind: "chat", caseId: state.caseId, values, previewUrl, firstMessage: action.message };
      }
      if (action.type === "FAILED") {
        if (action.fieldErrors) {
          return { kind: "editing", fieldErrors: action.fieldErrors, values, file, previewUrl };
        }
        return { kind: "failed", failedStep: action.step, caseId: state.caseId, error: action.error, values, file, previewUrl };
      }
      return state;
    }

    case "failed": {
      const edited = applyEdit(state, {}, action);
      if (edited) return edited;
      const { values, file, previewUrl } = state;
      if (action.type === "RETRY") {
        if (state.failedStep === 2 && state.caseId !== null) {
          return { kind: "processing", step: 2, caseId: state.caseId, values, file, previewUrl };
        }
        return { kind: "processing", step: 1, caseId: null, values, file, previewUrl };
      }
      if (action.type === "SUBMIT") {
        return { kind: "processing", step: 1, caseId: null, values, file, previewUrl };
      }
      return state;
    }

    case "chat": {
      if (action.type === "SESSION_EXPIRED") {
        return {
          kind: "expired",
          caseId: state.caseId,
          values: state.values,
          previewUrl: state.previewUrl,
          firstMessage: state.firstMessage,
        };
      }
      return state;
    }

    case "expired":
      return state;
  }
}

/** True while a case exists and its chat or decision is still in progress (ADR-003 §3.2, PRD AC-38). */
export function isCaseOpen(state: FlowState): boolean {
  switch (state.kind) {
    case "processing":
    case "chat":
      return true;
    case "failed":
      return state.caseId !== null;
    default:
      return false;
  }
}
