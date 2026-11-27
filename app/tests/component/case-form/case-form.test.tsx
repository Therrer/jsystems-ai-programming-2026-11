import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducer } from "react";
import { CaseForm } from "@/components/case-form/case-form";
import { caseFlowReducer, initialFlowState, type FlowState } from "@/lib/client/case-flow";
import { AI_FORM_NOTICE, fieldErrorMessage } from "@/lib/shared/strings/common";
import {
  DESCRIPTION_HINT_COMPLAINT,
  DESCRIPTION_HINT_RETURN,
  DESCRIPTION_LABEL,
  DESCRIPTION_LABEL_OPTIONAL,
  PHOTO_HINT_COMPLAINT,
  PHOTO_HINT_RETURN,
} from "@/lib/shared/strings/form";

// Real example photos only (assets/example-images); no generated images.
const IMAGES = path.resolve(import.meta.dirname, "../../../../assets/example-images");
const TODAY = "2026-11-26";
const VALID_DESCRIPTION = "Ekran nie włącza się od wczoraj po upadku.";

function photo(name: string, type: string): File {
  return new File([Uint8Array.from(readFileSync(path.join(IMAGES, name)))], name, { type });
}

/** Holds the real reducer so dispatches change the rendered state. */
function Harness({ initial, onSubmitValid }: { initial: FlowState; onSubmitValid: () => void }) {
  const [state, dispatch] = useReducer(caseFlowReducer, initial);
  if (state.kind === "chat" || state.kind === "expired") return <p>chat</p>;
  return (
    <CaseForm
      state={state}
      dispatch={dispatch}
      onSubmitValid={onSubmitValid}
      onRetry={() => {}}
      today={TODAY}
    />
  );
}

const CATEGORY_OPTIONS = [
  "Smartfon",
  "Laptop",
  "Tablet",
  "Telewizor",
  "Słuchawki / audio",
  "Smartwatch / urządzenie ubieralne",
  "Aparat fotograficzny",
  "Małe AGD",
];

async function pickCategory(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("combobox", { name: "Kategoria sprzętu" }));
  await user.click(await screen.findByRole("option", { name: label }));
}

async function fillValidComplaint(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Reklamacja" }));
  await pickCategory(user, "Laptop");
  await user.type(screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" }), "Lenovo ThinkPad E14");
  await user.type(screen.getByLabelText("Data zakupu"), "2026-01-15");
  await user.type(screen.getByRole("textbox", { name: DESCRIPTION_LABEL }), VALID_DESCRIPTION);
  await user.upload(screen.getByLabelText("Zdjęcie urządzenia"), photo("phone-1.jpg", "image/jpeg"));
}

beforeAll(() => {
  // Radix Select needs these DOM APIs, which jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  // Radix Select measures its trigger with ResizeObserver, which jsdom lacks (no-op stub).
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

let urlCounter = 0;
beforeEach(() => {
  urlCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++urlCounter}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => cleanup());

describe("CaseForm: fields and defaults", () => {
  it("renders the six labelled controls in AC-01 order with nothing preselected", () => {
    render(<Harness initial={initialFlowState} onSubmitValid={vi.fn()} />);

    const controls = [
      screen.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" }),
      screen.getByRole("combobox", { name: "Kategoria sprzętu" }),
      screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" }),
      screen.getByLabelText("Data zakupu"),
      screen.getByRole("textbox", { name: DESCRIPTION_LABEL_OPTIONAL }),
      screen.getByLabelText("Zdjęcie urządzenia"),
    ];
    controls.reduce((earlier, later) => {
      expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      return later;
    });

    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(screen.getByRole("combobox", { name: "Kategoria sprzętu" }).textContent).toContain("Wybierz kategorię");
  });

  it("opens the category list with exactly the eight labels in AC-03 order", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initialFlowState} onSubmitValid={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Kategoria sprzętu" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(CATEGORY_OPTIONS);
  });
});

describe("CaseForm: conditional description and hints", () => {
  it("switches the description label and hints by case type and keeps the typed text", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initialFlowState} onSubmitValid={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "Zwrot" }));
    expect(screen.getByRole("textbox", { name: DESCRIPTION_LABEL_OPTIONAL })).toBeTruthy();
    expect(screen.getByText(DESCRIPTION_HINT_RETURN)).toBeTruthy();
    expect(screen.getByText(PHOTO_HINT_RETURN)).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: DESCRIPTION_LABEL_OPTIONAL }), "abc");

    await user.click(screen.getByRole("radio", { name: "Reklamacja" }));
    const description = screen.getByRole("textbox", { name: DESCRIPTION_LABEL }) as HTMLTextAreaElement;
    expect(description.value).toBe("abc");
    expect(screen.getByText(DESCRIPTION_HINT_COMPLAINT)).toBeTruthy();
    expect(screen.getByText(PHOTO_HINT_COMPLAINT)).toBeTruthy();
    expect(screen.queryByText(DESCRIPTION_HINT_RETURN)).toBeNull();
    expect(screen.queryByText(PHOTO_HINT_RETURN)).toBeNull();
  });
});

describe("CaseForm: description counter", () => {
  it("counts code points, so an emoji is one character", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initialFlowState} onSubmitValid={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: DESCRIPTION_LABEL_OPTIONAL }), "Ekran😡");
    expect(screen.getByText("6 / 2000")).toBeTruthy();
  });
});

describe("CaseForm: submit validation", () => {
  it("shows the five required-field errors on an empty submit and focuses the first radio", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    render(<Harness initial={initialFlowState} onSubmitValid={onSubmitValid} />);

    await user.click(screen.getByRole("button", { name: "Wyślij" }));

    expect(onSubmitValid).not.toHaveBeenCalled();
    const messages = [
      fieldErrorMessage("caseType", "REQUIRED"),
      fieldErrorMessage("category", "REQUIRED"),
      fieldErrorMessage("modelName", "MODEL_NAME"),
      fieldErrorMessage("purchaseDate", "PURCHASE_DATE"),
      fieldErrorMessage("image", "IMAGE_REQUIRED"),
    ];
    for (const message of messages) {
      expect(screen.getByText(message)).toBeTruthy();
    }

    const invalidControls = [
      screen.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" }),
      screen.getByRole("combobox", { name: "Kategoria sprzętu" }),
      screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" }),
      screen.getByLabelText("Data zakupu"),
      screen.getByLabelText("Zdjęcie urządzenia"),
    ];
    for (const control of invalidControls) {
      expect(control.getAttribute("aria-invalid")).toBe("true");
      const errorId = control.getAttribute("aria-describedby");
      expect(errorId).toBeTruthy();
      expect(document.getElementById(errorId as string)?.textContent).toBeTruthy();
    }

    expect(document.activeElement).toBe(screen.getAllByRole("radio")[0]);
  });

  it("focuses the photo input when only the photo is missing", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    render(<Harness initial={initialFlowState} onSubmitValid={onSubmitValid} />);
    await user.click(screen.getByRole("radio", { name: "Zwrot" }));
    await pickCategory(user, "Laptop");
    await user.type(screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" }), "Lenovo ThinkPad E14");
    await user.type(screen.getByLabelText("Data zakupu"), "2026-01-15");

    await user.click(screen.getByRole("button", { name: "Wyślij" }));

    expect(onSubmitValid).not.toHaveBeenCalled();
    expect(screen.getByText(fieldErrorMessage("image", "IMAGE_REQUIRED"))).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Zdjęcie urządzenia"));
  });

  it("calls onSubmitValid once when every field and the real photo are valid", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    render(<Harness initial={initialFlowState} onSubmitValid={onSubmitValid} />);
    await fillValidComplaint(user);

    await user.click(screen.getByRole("button", { name: "Wyślij" }));

    expect(onSubmitValid).toHaveBeenCalledTimes(1);
  });

  it("validates a field on blur and marks it invalid", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initialFlowState} onSubmitValid={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" }), "A");
    await user.tab();

    const model = screen.getByRole("textbox", { name: "Nazwa lub model urządzenia" });
    expect(model.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(fieldErrorMessage("modelName", "MODEL_NAME"))).toBeTruthy();
  });

  it("shows the AI notice (AC-42)", () => {
    render(<Harness initial={initialFlowState} onSubmitValid={vi.fn()} />);
    expect(screen.getByText(AI_FORM_NOTICE)).toBeTruthy();
  });
});
