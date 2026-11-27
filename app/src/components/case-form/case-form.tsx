"use client";

import { useId, useRef, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CaseTypeField } from "@/components/case-form/case-type-field";
import { CategoryField } from "@/components/case-form/category-field";
import { CharCounter } from "@/components/case-form/char-counter";
import { ErrorBanner } from "@/components/case-form/error-banner";
import { PhotoField } from "@/components/case-form/photo-field";
import { ProcessingPanel } from "@/components/case-form/processing-panel";
import type { FieldErrors, FlowAction, FlowState } from "@/lib/client/case-flow";
import { todayInWarsaw } from "@/lib/shared/dates";
import {
  DESCRIPTION_MAX,
  MIN_PURCHASE_DATE,
  type CaseFormField,
  validateCaseForm,
  validateImageFile,
} from "@/lib/shared/schemas/case-form";
import type { FieldErrorCode } from "@/lib/shared/schemas/enums";
import { AI_FORM_NOTICE, fieldErrorMessage } from "@/lib/shared/strings/common";
import {
  DESCRIPTION_HINT_COMPLAINT,
  DESCRIPTION_HINT_RETURN,
  DESCRIPTION_LABEL,
  DESCRIPTION_LABEL_OPTIONAL,
  FORM_INTRO,
  FORM_TITLE,
  MODEL_NAME_LABEL,
  MODEL_NAME_PLACEHOLDER,
  PHOTO_HINT_COMPLAINT,
  PHOTO_HINT_RETURN,
  PURCHASE_DATE_LABEL,
  SUBMIT_BUTTON,
} from "@/lib/shared/strings/form";

export interface CaseFormProps {
  state: Extract<FlowState, { kind: "editing" | "processing" | "failed" }>;
  dispatch: (action: FlowAction) => void;
  onSubmitValid: () => void; // called only after client validation passes; CaseApp (T22) then dispatches SUBMIT and calls the API
  onRetry: () => void;
  today?: string; // default todayInWarsaw(); used for the date max and validation
}

type ErrorKey = CaseFormField | "image";

/** AC-01 order: the first invalid field in this list receives focus on submit (AC-14). */
const FIELD_ORDER: ErrorKey[] = ["caseType", "category", "modelName", "purchaseDate", "description", "image"];

function FieldError({ id, message }: { id: string; message?: string }): ReactNode {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function CaseForm({ state, dispatch, onSubmitValid, onRetry, today = todayInWarsaw() }: CaseFormProps) {
  const base = useId();
  const refs = useRef<Partial<Record<ErrorKey, HTMLElement | null>>>({});
  const { values, file, previewUrl } = state;
  // Errors exist only in the editing state; other states drop them (the reducer ignores SET_FIELD_ERRORS there).
  const fieldErrors: FieldErrors = state.kind === "editing" ? state.fieldErrors : {};
  const disabled = state.kind === "processing";
  const complaint = values.caseType === "complaint";

  const errorId = (field: ErrorKey) => `${base}-${field}-error`;
  const errorText = (field: ErrorKey): string | undefined => {
    const code = fieldErrors[field];
    return code ? fieldErrorMessage(field, code) : undefined;
  };

  function setError(field: ErrorKey, code: FieldErrorCode | null) {
    const next: FieldErrors = { ...fieldErrors };
    if (code) next[field] = code;
    else delete next[field];
    dispatch({ type: "SET_FIELD_ERRORS", fieldErrors: next });
  }

  /** TD-302: validate one field on blur with the current values. */
  function validateField(field: CaseFormField) {
    const result = validateCaseForm(values, today);
    setError(field, result.ok ? null : (result.fieldErrors[field] ?? null));
  }

  function validatePhoto() {
    setError("image", validateImageFile(file));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateCaseForm(values, today);
    const next: FieldErrors = result.ok ? {} : { ...result.fieldErrors };
    const imageCode = validateImageFile(file);
    if (imageCode) next.image = imageCode;

    if (Object.keys(next).length === 0) {
      onSubmitValid();
      return;
    }
    dispatch({ type: "SET_FIELD_ERRORS", fieldErrors: next });
    const first = FIELD_ORDER.find((field) => next[field]);
    if (first) {
      const element = refs.current[first];
      element?.focus();
      element?.scrollIntoView({ block: "center" });
    }
  }

  const modelId = `${base}-modelName`;
  const dateId = `${base}-purchaseDate`;
  const descriptionId = `${base}-description`;
  const descriptionHintId = `${base}-description-hint`;
  const counterId = `${base}-description-counter`;

  return (
    <form noValidate onSubmit={handleSubmit} className="mx-auto grid w-full max-w-xl gap-6">
      {state.kind === "failed" ? <ErrorBanner message={state.error.messagePl} onRetry={onRetry} /> : null}

      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{FORM_TITLE}</h1>
        <p className="text-sm text-muted-foreground">{FORM_INTRO}</p>
      </header>

      <CaseTypeField
        idBase={`${base}-caseType`}
        errorId={errorId("caseType")}
        error={errorText("caseType")}
        value={values.caseType}
        disabled={disabled}
        firstItemRef={(element) => {
          refs.current.caseType = element;
        }}
        onChange={(value) => dispatch({ type: "SET_FIELD", field: "caseType", value })}
        onBlur={() => validateField("caseType")}
      />

      <CategoryField
        id={`${base}-category`}
        errorId={errorId("category")}
        error={errorText("category")}
        value={values.category}
        disabled={disabled}
        triggerRef={(element) => {
          refs.current.category = element;
        }}
        onChange={(value) => dispatch({ type: "SET_FIELD", field: "category", value })}
        onBlur={() => validateField("category")}
      />

      <div className="grid gap-2">
        <Label htmlFor={modelId}>{MODEL_NAME_LABEL}</Label>
        <Input
          id={modelId}
          ref={(element) => {
            refs.current.modelName = element;
          }}
          value={values.modelName}
          placeholder={MODEL_NAME_PLACEHOLDER}
          disabled={disabled}
          aria-invalid={errorText("modelName") ? true : undefined}
          aria-describedby={errorText("modelName") ? errorId("modelName") : undefined}
          onChange={(event) => dispatch({ type: "SET_FIELD", field: "modelName", value: event.target.value })}
          onBlur={() => validateField("modelName")}
        />
        <FieldError id={errorId("modelName")} message={errorText("modelName")} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={dateId}>{PURCHASE_DATE_LABEL}</Label>
        <Input
          id={dateId}
          type="date"
          min={MIN_PURCHASE_DATE}
          max={today}
          ref={(element) => {
            refs.current.purchaseDate = element;
          }}
          value={values.purchaseDate}
          disabled={disabled}
          aria-invalid={errorText("purchaseDate") ? true : undefined}
          aria-describedby={errorText("purchaseDate") ? errorId("purchaseDate") : undefined}
          onChange={(event) => dispatch({ type: "SET_FIELD", field: "purchaseDate", value: event.target.value })}
          onBlur={() => validateField("purchaseDate")}
        />
        <FieldError id={errorId("purchaseDate")} message={errorText("purchaseDate")} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={descriptionId}>{complaint ? DESCRIPTION_LABEL : DESCRIPTION_LABEL_OPTIONAL}</Label>
        <Textarea
          id={descriptionId}
          ref={(element) => {
            refs.current.description = element;
          }}
          value={values.description}
          disabled={disabled}
          aria-invalid={errorText("description") ? true : undefined}
          aria-describedby={
            errorText("description") ? errorId("description") : `${descriptionHintId} ${counterId}`
          }
          onChange={(event) => dispatch({ type: "SET_FIELD", field: "description", value: event.target.value })}
          onBlur={() => validateField("description")}
        />
        <p id={descriptionHintId} className="text-sm text-muted-foreground">
          {complaint ? DESCRIPTION_HINT_COMPLAINT : DESCRIPTION_HINT_RETURN}
        </p>
        <CharCounter id={counterId} value={values.description} max={DESCRIPTION_MAX} />
        <FieldError id={errorId("description")} message={errorText("description")} />
      </div>

      <PhotoField
        id={`${base}-photo`}
        errorId={errorId("image")}
        file={file}
        previewUrl={previewUrl}
        fieldErrors={fieldErrors}
        error={errorText("image")}
        hint={complaint ? PHOTO_HINT_COMPLAINT : PHOTO_HINT_RETURN}
        disabled={disabled}
        inputRef={(element) => {
          refs.current.image = element;
        }}
        dispatch={dispatch}
        onBlur={validatePhoto}
      />

      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">{AI_FORM_NOTICE}</p>
        {state.kind === "processing" ? (
          <ProcessingPanel step={state.step} />
        ) : (
          <Button type="submit" className="w-full sm:w-auto">
            {SUBMIT_BUTTON}
          </Button>
        )}
      </div>
    </form>
  );
}
