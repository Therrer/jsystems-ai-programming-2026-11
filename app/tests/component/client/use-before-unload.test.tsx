import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useBeforeUnload } from "@/lib/client/use-before-unload";

afterEach(() => cleanup());

/** Dispatches beforeunload on window and reports whether the listener cancelled it. */
function dispatchBeforeUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useBeforeUnload", () => {
  it("cancels beforeunload while active", () => {
    renderHook(() => useBeforeUnload(true));
    expect(dispatchBeforeUnload()).toBe(true);
  });

  it("does not cancel beforeunload while inactive", () => {
    renderHook(() => useBeforeUnload(false));
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("stops cancelling when active becomes false", () => {
    const { rerender } = renderHook(({ active }) => useBeforeUnload(active), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useBeforeUnload(true));
    unmount();
    expect(dispatchBeforeUnload()).toBe(false);
  });
});
