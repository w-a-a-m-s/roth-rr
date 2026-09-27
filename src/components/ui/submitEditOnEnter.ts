/**
 * Enter in a text/number field on an open edit card should close it, same as
 * Done. Ignore selects (native dropdowns use Enter) and buttons; honor
 * preventDefault so ComboInput can still pick a highlighted suggestion.
 */
export function isEditFormEnter(event: {
  key: string;
  repeat: boolean;
  defaultPrevented: boolean;
  nativeEvent?: { isComposing?: boolean };
  isComposing?: boolean;
  target: EventTarget | null;
}): boolean {
  if (event.key !== "Enter" || event.repeat || event.defaultPrevented) {
    return false;
  }
  if (event.nativeEvent?.isComposing || event.isComposing) return false;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return false;
  if (
    target.type === "button" ||
    target.type === "submit" ||
    target.type === "reset" ||
    target.type === "checkbox" ||
    target.type === "radio" ||
    target.type === "file"
  ) {
    return false;
  }
  return true;
}

export function submitEditOnEnter(
  event: {
    key: string;
    repeat: boolean;
    defaultPrevented: boolean;
    preventDefault: () => void;
    stopPropagation: () => void;
    nativeEvent?: { isComposing?: boolean };
    isComposing?: boolean;
    target: EventTarget | null;
  },
  onDone: (() => void) | undefined,
): void {
  if (!onDone || !isEditFormEnter(event)) return;
  event.preventDefault();
  event.stopPropagation();
  onDone();
}
