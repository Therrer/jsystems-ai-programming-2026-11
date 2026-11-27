import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseSummaryPanel } from "@/components/case-chat/case-summary-panel";
import { NewCaseDialog } from "@/components/case-chat/new-case-dialog";
import { SessionExpiredAlert } from "@/components/case-chat/session-expired-alert";
import type { FormValues } from "@/lib/client/case-flow";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";
import {
  CASE_SUMMARY_LABEL,
  NEW_CASE_BUTTON,
  NEW_CASE_QUESTION,
  CANCEL_BUTTON,
  PHOTO_PREVIEW_ALT,
  SHOW_LESS,
  SHOW_MORE,
  ZOOM_PHOTO_BUTTON,
} from "@/lib/shared/strings/chat";

afterEach(cleanup);

const VALUES: FormValues = {
  caseType: "return",
  category: "laptop",
  modelName: "Lenovo ThinkPad E14",
  purchaseDate: "2026-11-21",
  description: "Ekran nie włącza się po upadku.",
};

describe("CaseSummaryPanel", () => {
  it("shows the case type, category, model and purchase date inside the labelled region", () => {
    render(<CaseSummaryPanel values={VALUES} previewUrl={null} />);

    const region = screen.getByRole("region", { name: CASE_SUMMARY_LABEL });
    expect(within(region).getByText("Zwrot")).toBeTruthy();
    expect(within(region).getByText("Laptop")).toBeTruthy();
    expect(within(region).getByText("Lenovo ThinkPad E14")).toBeTruthy();
    expect(within(region).getByText("21.11.2026")).toBeTruthy();
  });

  it("truncates a 250-character description to 200 characters and toggles the full text", async () => {
    const user = userEvent.setup();
    const long = "a".repeat(250);
    render(<CaseSummaryPanel values={{ ...VALUES, description: long }} previewUrl={null} />);

    const region = screen.getByRole("region", { name: CASE_SUMMARY_LABEL });
    expect(within(region).getByText("a".repeat(200))).toBeTruthy();
    expect(within(region).queryByText(long)).toBeNull();

    await user.click(within(region).getByRole("button", { name: SHOW_MORE }));
    expect(within(region).getByText(long)).toBeTruthy();
    expect(within(region).getByRole("button", { name: SHOW_LESS })).toBeTruthy();

    await user.click(within(region).getByRole("button", { name: SHOW_LESS }));
    expect(within(region).getByText("a".repeat(200))).toBeTruthy();
  });

  it("omits the description row when the optional return description is empty", () => {
    render(<CaseSummaryPanel values={{ ...VALUES, description: "" }} previewUrl={null} />);

    const region = screen.getByRole("region", { name: CASE_SUMMARY_LABEL });
    expect(within(region).queryByText("Opis")).toBeNull();
  });

  it("shows no description toggle for a description of 200 characters or fewer", () => {
    render(<CaseSummaryPanel values={VALUES} previewUrl={null} />);

    const region = screen.getByRole("region", { name: CASE_SUMMARY_LABEL });
    expect(within(region).getByText(VALUES.description)).toBeTruthy();
    expect(within(region).queryByRole("button", { name: SHOW_MORE })).toBeNull();
  });

  it("opens a dialog with the larger photo from the thumbnail button", async () => {
    const user = userEvent.setup();
    render(<CaseSummaryPanel values={VALUES} previewUrl="blob:preview-1" />);

    await user.click(screen.getByRole("button", { name: ZOOM_PHOTO_BUTTON }));

    const dialog = await screen.findByRole("dialog");
    const preview = within(dialog).getByRole("img", { name: PHOTO_PREVIEW_ALT });
    expect(preview.getAttribute("src")).toBe("blob:preview-1");
  });

  it("keeps the mobile trigger collapsed by default and still mounts the summary content", async () => {
    const user = userEvent.setup();
    render(<CaseSummaryPanel values={VALUES} previewUrl={null} />);

    const trigger = screen.getByRole("button", { name: CASE_SUMMARY_LABEL });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(within(screen.getByRole("region", { name: CASE_SUMMARY_LABEL })).getByText("Lenovo ThinkPad E14")).toBeTruthy();

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("NewCaseDialog", () => {
  it("shows the confirmation question in an alertdialog when open", () => {
    render(<NewCaseDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(NEW_CASE_QUESTION)).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    render(<NewCaseDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("closes without confirming when Anuluj is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(<NewCaseDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: CANCEL_BUTTON }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when Nowa sprawa is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<NewCaseDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: NEW_CASE_BUTTON }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("SessionExpiredAlert", () => {
  it("shows the session-expired text in an alert", () => {
    render(<SessionExpiredAlert onNewCase={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(API_ERROR_MESSAGES.CASE_NOT_FOUND)).toBeTruthy();
  });

  it("calls onNewCase when Nowa sprawa is clicked", async () => {
    const user = userEvent.setup();
    const onNewCase = vi.fn();
    render(<SessionExpiredAlert onNewCase={onNewCase} />);

    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: NEW_CASE_BUTTON }));

    expect(onNewCase).toHaveBeenCalledTimes(1);
  });
});
