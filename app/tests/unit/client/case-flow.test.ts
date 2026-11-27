import { describe, expect, it } from "vitest";
import { caseFlowReducer, initialFlowState, isCaseOpen } from "@/lib/client/case-flow";
import type { FieldErrors, FlowAction, FlowState, FormValues, FlowError } from "@/lib/client/case-flow";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";

// Synthetic data only. Assertions use scalar fields; File objects are compared by identity (toBe).
const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
const values: FormValues = {
  caseType: "complaint",
  category: "smartphone",
  modelName: "Pixel 8",
  purchaseDate: "2026-01-10",
  description: "Ekran pęka od dołu do góry",
};
const message = { id: "m1", role: "assistant", parts: [] } as unknown as CaseUIMessage;
const error: FlowError = { code: "AI_TIMEOUT", messagePl: "Przekroczono czas oczekiwania." };
const part = { values, file, previewUrl: "blob:a" };

const editing = (fieldErrors: FieldErrors = {}): FlowState => ({ kind: "editing", fieldErrors, ...part });
const processing1 = (): FlowState => ({ kind: "processing", step: 1, caseId: null, ...part });
const processing2 = (): FlowState => ({ kind: "processing", step: 2, caseId: "c1", ...part });
const failed1 = (): FlowState => ({ kind: "failed", failedStep: 1, caseId: null, error, ...part });
const failed2 = (): FlowState => ({ kind: "failed", failedStep: 2, caseId: "c1", error, ...part });
const chat = (): FlowState => ({ kind: "chat", caseId: "c1", values, previewUrl: "blob:a", firstMessage: message });
const expired = (): FlowState => ({ kind: "expired", caseId: "c1", values, previewUrl: "blob:a", firstMessage: message });

const reduce = caseFlowReducer;

/** Asserts the state kind and narrows the type for the following scalar assertions. */
function as<K extends FlowState["kind"]>(state: FlowState, kind: K): Extract<FlowState, { kind: K }> {
  expect(state.kind).toBe(kind);
  return state as Extract<FlowState, { kind: K }>;
}

describe("initialFlowState", () => {
  it("starts editing with empty values, no file and no errors", () => {
    const s = as(initialFlowState, "editing");
    expect(s.values.caseType).toBeNull();
    expect(s.values.category).toBeNull();
    expect(s.values.modelName).toBe("");
    expect(s.values.purchaseDate).toBe("");
    expect(s.values.description).toBe("");
    expect(s.file).toBeNull();
    expect(s.previewUrl).toBeNull();
    expect(Object.keys(s.fieldErrors)).toHaveLength(0);
  });
});

describe("editing", () => {
  it("SET_FIELD sets the value and removes only that field's error", () => {
    const next = as(
      reduce(editing({ modelName: "MODEL_NAME", caseType: "REQUIRED" }), {
        type: "SET_FIELD",
        field: "modelName",
        value: "Pixel 9",
      }),
      "editing",
    );
    expect(next.values.modelName).toBe("Pixel 9");
    expect(next.values.category).toBe("smartphone");
    expect(next.fieldErrors.modelName).toBeUndefined();
    expect(next.fieldErrors.caseType).toBe("REQUIRED");
  });

  it("SET_FIELD accepts null for an enum field", () => {
    const next = as(reduce(editing(), { type: "SET_FIELD", field: "caseType", value: null }), "editing");
    expect(next.values.caseType).toBeNull();
  });

  it("SET_FILE sets file and previewUrl and removes the image error", () => {
    const other = new File(["y"], "b.png", { type: "image/png" });
    const next = as(
      reduce(editing({ image: "IMAGE_REQUIRED" }), { type: "SET_FILE", file: other, previewUrl: "blob:b" }),
      "editing",
    );
    expect(next.file).toBe(other);
    expect(next.previewUrl).toBe("blob:b");
    expect(next.fieldErrors.image).toBeUndefined();
  });

  it("CLEAR_FILE nulls file and previewUrl and removes the image error", () => {
    const next = as(reduce(editing({ image: "UNSUPPORTED_IMAGE" }), { type: "CLEAR_FILE" }), "editing");
    expect(next.file).toBeNull();
    expect(next.previewUrl).toBeNull();
    expect(next.fieldErrors.image).toBeUndefined();
  });

  it("SET_FIELD_ERRORS replaces the errors with exactly the given ones", () => {
    const next = as(
      reduce(editing({ modelName: "MODEL_NAME" }), {
        type: "SET_FIELD_ERRORS",
        fieldErrors: { description: "DESCRIPTION_MIN" },
      }),
      "editing",
    );
    expect(next.fieldErrors).toEqual({ description: "DESCRIPTION_MIN" });
  });

  it("SUBMIT moves to processing step 1 without a caseId and keeps the values and file", () => {
    const next = as(reduce(editing(), { type: "SUBMIT" }), "processing");
    expect(next.step).toBe(1);
    expect(next.caseId).toBeNull();
    expect(next.values.modelName).toBe("Pixel 8");
    expect(next.file).toBe(file);
  });
});

describe("processing", () => {
  it("CASE_CREATED in step 1 moves to step 2 with the caseId", () => {
    const next = as(reduce(processing1(), { type: "CASE_CREATED", caseId: "c1" }), "processing");
    expect(next.step).toBe(2);
    expect(next.caseId).toBe("c1");
  });

  it("DECIDED in step 2 moves to chat, keeps the caseId, values and preview and drops the file", () => {
    const next = as(reduce(processing2(), { type: "DECIDED", message }), "chat");
    expect(next.caseId).toBe("c1");
    expect(next.values.modelName).toBe("Pixel 8");
    expect(next.previewUrl).toBe("blob:a");
    expect(next.firstMessage).toBe(message);
    expect("file" in next).toBe(false);
  });

  it("FAILED with fieldErrors returns to editing with those errors and keeps values, file and preview", () => {
    const next = as(
      reduce(processing1(), {
        type: "FAILED",
        step: 1,
        error,
        fieldErrors: { image: "FILE_TOO_LARGE" },
      }),
      "editing",
    );
    expect(next.fieldErrors).toEqual({ image: "FILE_TOO_LARGE" });
    expect(next.values.modelName).toBe("Pixel 8");
    expect(next.file).toBe(file);
    expect(next.previewUrl).toBe("blob:a");
  });

  it("FAILED without fieldErrors in step 1 moves to failed with failedStep 1 and no caseId", () => {
    const next = as(reduce(processing1(), { type: "FAILED", step: 1, error }), "failed");
    expect(next.failedStep).toBe(1);
    expect(next.caseId).toBeNull();
    expect(next.error.code).toBe("AI_TIMEOUT");
    expect(next.error.messagePl).toBe("Przekroczono czas oczekiwania.");
    expect(next.file).toBe(file);
  });

  it("FAILED without fieldErrors in step 2 keeps the caseId and failedStep 2", () => {
    const next = as(reduce(processing2(), { type: "FAILED", step: 2, error }), "failed");
    expect(next.failedStep).toBe(2);
    expect(next.caseId).toBe("c1");
  });
});

describe("failed", () => {
  it("SET_FIELD moves to editing, sets the value and clears the errors", () => {
    const next = as(reduce(failed1(), { type: "SET_FIELD", field: "modelName", value: "Pixel 9" }), "editing");
    expect(next.values.modelName).toBe("Pixel 9");
    expect(Object.keys(next.fieldErrors)).toHaveLength(0);
    expect(next.file).toBe(file);
  });

  it("SET_FILE moves to editing with the new file and preview", () => {
    const other = new File(["y"], "b.png", { type: "image/png" });
    const next = as(reduce(failed2(), { type: "SET_FILE", file: other, previewUrl: "blob:b" }), "editing");
    expect(next.file).toBe(other);
    expect(next.previewUrl).toBe("blob:b");
    expect(Object.keys(next.fieldErrors)).toHaveLength(0);
  });

  it("CLEAR_FILE moves to editing without a file", () => {
    const next = as(reduce(failed1(), { type: "CLEAR_FILE" }), "editing");
    expect(next.file).toBeNull();
    expect(next.previewUrl).toBeNull();
    expect(Object.keys(next.fieldErrors)).toHaveLength(0);
  });

  it("RETRY after a step 2 failure resumes step 2 and keeps the caseId", () => {
    const next = as(reduce(failed2(), { type: "RETRY" }), "processing");
    expect(next.step).toBe(2);
    expect(next.caseId).toBe("c1");
  });

  it("RETRY after a step 1 failure starts again from step 1 with no caseId", () => {
    const next = as(reduce(failed1(), { type: "RETRY" }), "processing");
    expect(next.step).toBe(1);
    expect(next.caseId).toBeNull();
  });

  it("SUBMIT moves to processing step 1 with no caseId", () => {
    const next = as(reduce(failed2(), { type: "SUBMIT" }), "processing");
    expect(next.step).toBe(1);
    expect(next.caseId).toBeNull();
  });

  it("FAILED step 2 with CASE_NOT_FOUND then RETRY resumes step 2 with the same caseId", () => {
    const failedNotFound = as(
      reduce(processing2(), {
        type: "FAILED",
        step: 2,
        error: { code: "CASE_NOT_FOUND", messagePl: "Nie znaleziono sprawy." },
      }),
      "failed",
    );
    expect(failedNotFound.error.code).toBe("CASE_NOT_FOUND");
    const retried = as(reduce(failedNotFound, { type: "RETRY" }), "processing");
    expect(retried.step).toBe(2);
    expect(retried.caseId).toBe("c1");
  });
});

describe("chat and expired", () => {
  it("SESSION_EXPIRED moves chat to expired with the same fields", () => {
    const next = as(reduce(chat(), { type: "SESSION_EXPIRED" }), "expired");
    expect(next.caseId).toBe("c1");
    expect(next.values.modelName).toBe("Pixel 8");
    expect(next.previewUrl).toBe("blob:a");
    expect(next.firstMessage).toBe(message);
  });
});

describe("NEW_CASE", () => {
  it.each([
    { name: "editing", state: () => editing() },
    { name: "processing", state: processing2 },
    { name: "failed", state: failed2 },
    { name: "chat", state: chat },
    { name: "expired", state: expired },
  ])("resets $name to a fresh initial state", ({ state }) => {
    const next = as(reduce(state(), { type: "NEW_CASE" }), "editing");
    expect(next.values.modelName).toBe("");
    expect(next.values.caseType).toBeNull();
    expect(next.file).toBeNull();
    expect(next.previewUrl).toBeNull();
    expect(Object.keys(next.fieldErrors)).toHaveLength(0);
  });
});

describe("ignored actions return the same state object", () => {
  it("a second SUBMIT while processing returns the identical object", () => {
    const state = processing1();
    expect(reduce(state, { type: "SUBMIT" })).toBe(state);
  });

  it.each([
    { name: "CASE_CREATED in step 2", state: processing2, action: { type: "CASE_CREATED", caseId: "c2" } },
    { name: "DECIDED in step 1", state: processing1, action: { type: "DECIDED", message } },
    { name: "SUBMIT in chat", state: chat, action: { type: "SUBMIT" } },
    { name: "RETRY in editing", state: () => editing(), action: { type: "RETRY" } },
    { name: "SESSION_EXPIRED in editing", state: () => editing(), action: { type: "SESSION_EXPIRED" } },
    { name: "SET_FILE in chat", state: chat, action: { type: "CLEAR_FILE" } },
    { name: "SESSION_EXPIRED in expired", state: expired, action: { type: "SESSION_EXPIRED" } },
  ] as Array<{ name: string; state: () => FlowState; action: FlowAction }>)(
    "$name",
    ({ state, action }) => {
      const before = state();
      expect(reduce(before, action)).toBe(before);
    },
  );
});

describe("isCaseOpen", () => {
  it.each([
    { name: "editing", state: () => editing(), open: false },
    { name: "processing step 1 without caseId", state: processing1, open: true },
    { name: "processing step 2", state: processing2, open: true },
    { name: "failed without caseId", state: failed1, open: false },
    { name: "failed with caseId", state: failed2, open: true },
    { name: "chat", state: chat, open: true },
    { name: "expired", state: expired, open: false },
    { name: "initial", state: () => initialFlowState, open: false },
  ])("is $open for $name", ({ state, open }) => {
    expect(isCaseOpen(state())).toBe(open);
  });
});

describe("failed state accepts field errors (orchestrator fix found in T12)", () => {
  it("SET_FIELD_ERRORS in failed moves to editing with exactly those errors and keeps the values", () => {
    const failed = caseFlowReducer(
      caseFlowReducer(caseFlowReducer(initialFlowState, { type: "SET_FIELD", field: "modelName", value: "Pixel 9" }), { type: "SUBMIT" }),
      { type: "FAILED", step: 1, error: { code: "AI_UNAVAILABLE", messagePl: "x" } },
    );
    expect(failed.kind).toBe("failed");
    const next = caseFlowReducer(failed, { type: "SET_FIELD_ERRORS", fieldErrors: { image: "FILE_TOO_LARGE" } });
    expect(next.kind).toBe("editing");
    if (next.kind === "editing") {
      expect(next.fieldErrors.image).toBe("FILE_TOO_LARGE");
      expect(next.values.modelName).toBe("Pixel 9");
    }
  });
});
