import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducer } from "react";
import { PhotoField } from "@/components/case-form/photo-field";
import { caseFlowReducer, initialFlowState } from "@/lib/client/case-flow";
import { fieldErrorMessage } from "@/lib/shared/strings/common";
import { PHOTO_HINT_RETURN, PHOTO_PICK_BUTTON } from "@/lib/shared/strings/form";

// Real example photos only (assets/example-images). Oversized and mislabelled files are
// File objects derived from those bytes, never generated images.
const IMAGES = path.resolve(import.meta.dirname, "../../../../assets/example-images");
const TEN_MIB = 10 * 1024 * 1024;

function bytesOf(name: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(readFileSync(path.join(IMAGES, name)));
}

/** Real bytes followed by zero padding up to `size` bytes. */
function paddedFile(name: string, size: number, type: string, fileName = name): File {
  const padded = new Uint8Array(size);
  padded.set(bytesOf(name));
  return new File([padded], fileName, { type });
}

/** Holds the real reducer so PhotoField's dispatches change its props, like CaseForm does. */
function Harness({ onBlur = () => {} }: { onBlur?: () => void }) {
  const [state, dispatch] = useReducer(caseFlowReducer, initialFlowState);
  if (state.kind !== "editing") return null;
  return (
    <PhotoField
      id="photo"
      errorId="photo-error"
      file={state.file}
      previewUrl={state.previewUrl}
      fieldErrors={state.fieldErrors}
      error={state.fieldErrors.image ? fieldErrorMessage("image", state.fieldErrors.image) : undefined}
      hint={PHOTO_HINT_RETURN}
      disabled={false}
      dispatch={dispatch}
      onBlur={onBlur}
    />
  );
}

// jsdom has no object URLs: record the calls so the tests can check previews.
let urlCounter = 0;
beforeEach(() => {
  urlCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++urlCounter}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

describe("PhotoField: input contract", () => {
  it("is a labelled file input with the accepted types and no capture attribute (AC-13)", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Zdjęcie urządzenia") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");
    expect(input.hasAttribute("capture")).toBe(false);
    expect(screen.getByRole("button", { name: PHOTO_PICK_BUTTON })).toBeTruthy();
  });
});

describe("PhotoField: rejection of files", () => {
  it("rejects an 11 MiB file with the size message and shows no preview", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(
      screen.getByLabelText("Zdjęcie urządzenia"),
      paddedFile("laptop-2.webp", 11 * 1024 * 1024, "image/webp"),
    );

    expect(screen.getByText(fieldErrorMessage("image", "FILE_TOO_LARGE"))).toBeTruthy();
    expect(screen.queryByAltText("Podgląd zdjęcia")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects a HEIC-labelled JPEG with the format message", async () => {
    // applyAccept is off so the file reaches the component, which must reject it (not user-event).
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness />);

    const heic = new File([bytesOf("phone-1.jpg")], "photo.heic", { type: "image/heic" });
    await user.upload(screen.getByLabelText("Zdjęcie urządzenia"), heic);

    expect(screen.getByText(fieldErrorMessage("image", "UNSUPPORTED_IMAGE"))).toBeTruthy();
    expect(screen.queryByAltText("Podgląd zdjęcia")).toBeNull();
  });

  it("accepts a file of exactly 10 MB (10 485 760 bytes) and shows the preview", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(
      screen.getByLabelText("Zdjęcie urządzenia"),
      paddedFile("phone-1.jpg", TEN_MIB, "image/jpeg"),
    );

    expect(screen.queryByText(fieldErrorMessage("image", "FILE_TOO_LARGE"))).toBeNull();
    const preview = screen.getByAltText("Podgląd zdjęcia") as HTMLImageElement;
    expect(preview.getAttribute("src")).toBe("blob:preview-1");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe("PhotoField: replace and remove", () => {
  it("revokes the first preview URL when a second file is selected", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Zdjęcie urządzenia");

    await user.upload(input, new File([bytesOf("phone-1.jpg")], "phone-1.jpg", { type: "image/jpeg" }));
    await user.upload(input, new File([bytesOf("phone-2.jpeg")], "phone-2.jpeg", { type: "image/jpeg" }));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    const preview = screen.getByAltText("Podgląd zdjęcia") as HTMLImageElement;
    expect(preview.getAttribute("src")).toBe("blob:preview-2");
    expect(screen.getByText("phone-2.jpeg")).toBeTruthy();
  });

  it("removes the file: revokes its URL and shows the picker again", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(
      screen.getByLabelText("Zdjęcie urządzenia"),
      new File([bytesOf("phone-1.jpg")], "phone-1.jpg", { type: "image/jpeg" }),
    );
    await user.click(screen.getByRole("button", { name: "Usuń" }));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(screen.queryByAltText("Podgląd zdjęcia")).toBeNull();
    expect(screen.getByRole("button", { name: PHOTO_PICK_BUTTON })).toBeTruthy();
  });

  it("opens the file input from 'Zmień zdjęcie'", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Zdjęcie urządzenia") as HTMLInputElement;

    await user.upload(input, new File([bytesOf("phone-1.jpg")], "phone-1.jpg", { type: "image/jpeg" }));
    const clickSpy = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Zmień zdjęcie" }));

    expect(clickSpy).toHaveBeenCalled();
  });
});
