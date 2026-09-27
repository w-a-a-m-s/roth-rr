import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/store/useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToast.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a toast and auto-dismisses it", () => {
    useToast.getState().show("Saved", "success");
    expect(useToast.getState().toasts).toEqual([
      expect.objectContaining({ message: "Saved", tone: "success" }),
    ]);

    vi.advanceTimersByTime(2200);
    expect(useToast.getState().toasts).toEqual([]);
  });

  it("replaces an existing toast with the same message", () => {
    useToast.getState().show("Saved", "success");
    const firstId = useToast.getState().toasts[0]?.id;
    useToast.getState().show("Saved", "success");
    const toasts = useToast.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.id).not.toBe(firstId);
  });
});
