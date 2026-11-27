import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseForm, type CaseFormProps } from "@/components/case-form/case-form";
import type { FlowState } from "@/lib/client/case-flow";
import { PROCESSING_STEP_1, PROCESSING_STEP_2, RETRY_BUTTON } from "@/lib/shared/strings/form";

// Real example photo only (assets/example-images).
const IMAGES = path.resolve(import.meta.dirname, "../../../../assets/example-images");
const DESCRIPTION = "Ekran nie włącza się od wczoraj po upadku.";

const values = {
  caseType: "complaint" as const,
  category: "laptop" as const,
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-01-15",
  description: DESCRIPTION,
};
const photoFile = new File([readFileSync(path.join(IMAGES, "phone-1.jpg"))], "phone-1.jpg", {
  type: "image/jpeg",
});

function processingState(step: 1 | 2, withFile: boolean): FlowState {
  return {
    kind: "processing",
    step,
    caseId: step === 2 ? "case-1" : null,
    values,
    file: withFile ? photoFile : null,
    previewUrl: withFile ? "blob:preview-1" : null,
  };
}

function props(state: FlowState): CaseFormProps {
  return {
    state: state as CaseFormProps["state"],
    dispatch: vi.fn(),
    onSubmitValid: vi.fn(),
    onRetry: vi.fn(),
    today: "2026-11-26",
  };
}

beforeEach(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  // Radix Select measures its trigger with ResizeObserver, which jsdom lacks (no-op stub).
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  URL.createObjectURL = vi.fn(() => "blob:preview-1");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => cleanup());

describe("CaseForm: processing (AC-15)", () => {
  it("disables every control, hides submit and marks the first step as current", () => {
    render(<CaseForm {...props(processingState(1, true))} />);

    const disabled = [
      ...screen.getAllByRole("radio"),
      screen.getByRole("combobox", { name: "Kategoria sprzętu" }),
      screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" }),
      screen.getByLabelText("Data zakupu"),
      screen.getByRole("textbox", { name: "Opis" }),
      screen.getByLabelText("Zdjęcie urządzenia"),
      screen.getByRole("button", { name: "Zmień zdjęcie" }),
      screen.getByRole("button", { name: "Usuń" }),
    ];
    for (const control of disabled) {
      expect((control as HTMLButtonElement | HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.queryByRole("button", { name: "Wyślij" })).toBeNull();

    expect(screen.getByText(PROCESSING_STEP_1).getAttribute("aria-current")).toBe("step");
    expect(screen.getByText(PROCESSING_STEP_2).getAttribute("aria-current")).toBeNull();
    const live = screen.getByText(PROCESSING_STEP_1).closest("[aria-live]");
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });

  it("moves the current step to the second step and marks the first as done", () => {
    const { rerender } = render(<CaseForm {...props(processingState(1, false))} />);
    rerender(<CaseForm {...props(processingState(2, false))} />);

    expect(screen.getByText(PROCESSING_STEP_2).getAttribute("aria-current")).toBe("step");
    expect(screen.getByText(PROCESSING_STEP_1).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText(PROCESSING_STEP_1).closest("[data-status]")?.getAttribute("data-status")).toBe("done");
  });
});

describe("CaseForm: failed (AC-40)", () => {
  const messagePl = "Nie udało się przygotować decyzji. Spróbuj ponownie za chwilę.";
  const failed: FlowState = {
    kind: "failed",
    failedStep: 1,
    caseId: null,
    error: { code: "AI_TIMEOUT", messagePl },
    values,
    file: null,
    previewUrl: null,
  };

  it("shows the error banner with the message and a retry button", () => {
    render(<CaseForm {...props(failed)} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(messagePl);
    expect(screen.getByRole("button", { name: RETRY_BUTTON })).toBeTruthy();
  });

  it("calls onRetry from the banner button", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<CaseForm {...props(failed)} onRetry={retry} />);

    await user.click(screen.getByRole("button", { name: RETRY_BUTTON }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("re-enables the form, keeps the typed values and focuses the banner", () => {
    render(<CaseForm {...props(failed)} />);

    expect((screen.getByRole("combobox", { name: "Kategoria sprzętu" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("radio", { name: "Reklamacja" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" }) as HTMLInputElement).value).toBe(
      "Lenovo ThinkPad E14",
    );
    expect((screen.getByRole("textbox", { name: "Opis" }) as HTMLTextAreaElement).value).toBe(DESCRIPTION);
    expect(screen.getByRole("button", { name: "Wyślij" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });
});
