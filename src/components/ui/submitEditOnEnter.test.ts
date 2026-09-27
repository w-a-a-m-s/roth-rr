// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  isEditFormEnter,
  submitEditOnEnter,
} from "./submitEditOnEnter";

function eventFor(
  target: EventTarget,
  overrides: Partial<{
    key: string;
    repeat: boolean;
    defaultPrevented: boolean;
    isComposing: boolean;
  }> = {},
) {
  return {
    key: overrides.key ?? "Enter",
    repeat: overrides.repeat ?? false,
    defaultPrevented: overrides.defaultPrevented ?? false,
    nativeEvent: { isComposing: overrides.isComposing ?? false },
    target,
  };
}

describe("isEditFormEnter", () => {
  it("is true for Enter in a text or number field", () => {
    const text = document.createElement("input");
    text.type = "text";
    const number = document.createElement("input");
    number.type = "number";
    expect(isEditFormEnter(eventFor(text))).toBe(true);
    expect(isEditFormEnter(eventFor(number))).toBe(true);
  });

  it("is false for selects, buttons, and other keys", () => {
    const select = document.createElement("select");
    const button = document.createElement("button");
    const submit = document.createElement("input");
    submit.type = "button";
    const text = document.createElement("input");
    text.type = "text";
    expect(isEditFormEnter(eventFor(select))).toBe(false);
    expect(isEditFormEnter(eventFor(button))).toBe(false);
    expect(isEditFormEnter(eventFor(submit))).toBe(false);
    expect(isEditFormEnter(eventFor(text, { key: "Escape" }))).toBe(false);
  });

  it("is false when composing, repeating, or already handled", () => {
    const text = document.createElement("input");
    text.type = "text";
    expect(isEditFormEnter(eventFor(text, { isComposing: true }))).toBe(false);
    expect(isEditFormEnter(eventFor(text, { repeat: true }))).toBe(false);
    expect(isEditFormEnter(eventFor(text, { defaultPrevented: true }))).toBe(
      false,
    );
  });
});

describe("submitEditOnEnter", () => {
  it("calls Done and stops bubbling so a nested deposit does not close the account", () => {
    const text = document.createElement("input");
    text.type = "text";
    const onDone = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    submitEditOnEnter(
      { ...eventFor(text), preventDefault, stopPropagation },
      onDone,
    );
    expect(onDone).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("does nothing without onDone", () => {
    const text = document.createElement("input");
    text.type = "text";
    const preventDefault = vi.fn();
    submitEditOnEnter(
      { ...eventFor(text), preventDefault, stopPropagation: vi.fn() },
      undefined,
    );
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
