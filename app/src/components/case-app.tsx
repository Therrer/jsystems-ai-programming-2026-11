"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { CaseForm } from "@/components/case-form/case-form";
import { CaseChat } from "@/components/case-chat/case-chat";
import { NewCaseDialog } from "@/components/case-chat/new-case-dialog";
import { ApiError, createCase, deleteCase, requestDecision } from "@/lib/client/api";
import {
  caseFlowReducer,
  initialFlowState,
  isCaseOpen,
  type FieldErrors,
  type FlowAction,
  type FlowError,
  type FormValues,
} from "@/lib/client/case-flow";
import { useBeforeUnload } from "@/lib/client/use-before-unload";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";

/** One submit (both steps) gives up after this long (PRD AC-28). */
const REQUEST_TIMEOUT_MS = 90_000;
/** A decision that finds the case busy is retried once after this delay (ADR-002 §5.6). */
const BUSY_RETRY_MS = 1_000;
/** Status codes whose response maps back onto the form fields. */
const FIELD_ERROR_STATUSES = new Set([400, 413, 415, 422]);

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function decideWithBusyRetry(caseId: string, signal: AbortSignal) {
  try {
    return await requestDecision(caseId, signal);
  } catch (error) {
    if (error instanceof ApiError && error.code === "CASE_BUSY") {
      await delay(BUSY_RETRY_MS);
      return requestDecision(caseId, signal);
    }
    throw error;
  }
}

/** Maps a failed step onto the reducer's FAILED action (ADR-003 §3.2, AC-14, AC-28, AC-40). */
function failureAction(error: unknown, step: 1 | 2, timedOut: boolean): FlowAction {
  if (timedOut || (error instanceof Error && error.name === "AbortError")) {
    return { type: "FAILED", step, error: { code: "AI_TIMEOUT", messagePl: API_ERROR_MESSAGES.AI_TIMEOUT } };
  }
  if (!(error instanceof ApiError)) {
    return { type: "FAILED", step, error: { code: "INTERNAL", messagePl: API_ERROR_MESSAGES.INTERNAL } };
  }
  // A missing case on the decision step means the case must be created again: retry from step 1.
  if (step === 2 && error.code === "CASE_NOT_FOUND") {
    return { type: "FAILED", step: 1, error: { code: error.code, messagePl: error.messagePl } };
  }
  const flowError: FlowError = { code: error.code, messagePl: error.messagePl };
  if (step === 1 && FIELD_ERROR_STATUSES.has(error.status)) {
    const fieldErrors: FieldErrors | undefined =
      error.fieldErrors ?? (error.status === 413 ? { image: "FILE_TOO_LARGE" } : undefined);
    if (fieldErrors) return { type: "FAILED", step, error: flowError, fieldErrors };
  }
  return { type: "FAILED", step, error: flowError };
}

export function CaseApp() {
  const [state, dispatch] = useReducer(caseFlowReducer, initialFlowState);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const busyRef = useRef(false);
  const stopChatRef = useRef<(() => void) | null>(null);
  useBeforeUnload(isCaseOpen(state));

  const registerStop = useCallback((stop: (() => void) | null) => {
    stopChatRef.current = stop;
  }, []);

  /** Runs step 1 (create the case) and/or step 2 (request the decision) under one timeout. */
  async function run(startStep: 1 | 2, values: FormValues, file: File, caseId: string | null) {
    busyRef.current = true;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    let step: 1 | 2 = startStep;
    try {
      let id = caseId;
      if (startStep === 1) {
        const created = await createCase(values, file, controller.signal);
        id = created.caseId;
        dispatch({ type: "CASE_CREATED", caseId: id });
        step = 2;
      }
      if (id === null) throw new Error("case id missing before the decision step");
      const response = await decideWithBusyRetry(id, controller.signal);
      dispatch({ type: "DECIDED", message: response.message });
    } catch (error) {
      dispatch(failureAction(error, step, timedOut));
    } finally {
      clearTimeout(timer);
      busyRef.current = false;
    }
  }

  function onSubmitValid() {
    if (busyRef.current || (state.kind !== "editing" && state.kind !== "failed")) return;
    if (!state.file) return;
    const { values, file } = state;
    dispatch({ type: "SUBMIT" });
    void run(1, values, file, null);
  }

  function onRetry() {
    if (busyRef.current || state.kind !== "failed" || !state.file) return;
    const { failedStep, caseId, values, file } = state;
    const startStep: 1 | 2 = failedStep === 2 && caseId !== null ? 2 : 1;
    dispatch({ type: "RETRY" });
    void run(startStep, values, file, startStep === 2 ? caseId : null);
  }

  function confirmNewCase() {
    if (state.kind !== "chat" && state.kind !== "expired") return;
    stopChatRef.current?.();
    void deleteCase(state.caseId);
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setNewCaseOpen(false);
    dispatch({ type: "NEW_CASE" });
  }

  const isChat = state.kind === "chat" || state.kind === "expired";
  const openNewCase = () => setNewCaseOpen(true);
  const onSessionExpired = useCallback(() => dispatch({ type: "SESSION_EXPIRED" }), []);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader onNewCase={isChat ? openNewCase : undefined} />
      <main className="flex min-h-0 flex-1 flex-col px-4 py-6 lg:pr-8 lg:pl-[51px]">
        {state.kind === "chat" || state.kind === "expired" ? (
          <CaseChat
            caseId={state.caseId}
            values={state.values}
            previewUrl={state.previewUrl}
            firstMessage={state.firstMessage}
            expired={state.kind === "expired"}
            onSessionExpired={onSessionExpired}
            onNewCase={openNewCase}
            registerStop={registerStop}
          />
        ) : (
          <CaseForm state={state} dispatch={dispatch} onSubmitValid={onSubmitValid} onRetry={onRetry} />
        )}
      </main>
      <NewCaseDialog open={newCaseOpen} onOpenChange={setNewCaseOpen} onConfirm={confirmNewCase} />
    </div>
  );
}
