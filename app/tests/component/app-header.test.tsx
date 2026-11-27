import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/app-header";
import { COMPANY_NAME, PRODUCT_NAME } from "@/lib/shared/strings/common";

afterEach(cleanup);

describe("AppHeader", () => {
  it("shows both wordmark lines", () => {
    render(<AppHeader />);

    expect(screen.getByText(PRODUCT_NAME)).not.toBeNull();
    expect(screen.getByText(COMPANY_NAME)).not.toBeNull();
  });

  it("contains no img element and no Eurocash text", () => {
    const { container } = render(<AppHeader onNewCase={() => undefined} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(/eurocash/i);
  });

  it("has no 'Nowa sprawa' button without onNewCase", () => {
    render(<AppHeader />);

    expect(screen.queryByRole("button", { name: "Nowa sprawa" })).toBeNull();
  });

  it("renders 'Nowa sprawa' and calls onNewCase once on click", async () => {
    const user = userEvent.setup();
    const onNewCase = vi.fn();
    render(<AppHeader onNewCase={onNewCase} />);

    const button = screen.getByRole("button", { name: "Nowa sprawa" });
    await user.click(button);

    expect(onNewCase).toHaveBeenCalledTimes(1);
  });
});
