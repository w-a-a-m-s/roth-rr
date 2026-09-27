export type SelectOption = { value: string; label: string };
export type SelectGroup = { label: string; options: SelectOption[] };

export type SelectListItem =
  | { type: "group"; label: string }
  | { type: "option"; value: string; label: string; index: number };

const MENU_GAP = 4;
const MENU_MARGIN = 8;
const MENU_MIN_WIDTH = 140;
export const MENU_MAX_HEIGHT = 360;

export function flattenSelectList(
  options?: SelectOption[],
  groups?: SelectGroup[],
): { items: SelectListItem[]; options: SelectOption[] } {
  if (groups) {
    const items: SelectListItem[] = [];
    const flat: SelectOption[] = [];
    for (const group of groups) {
      if (group.options.length === 0) continue;
      items.push({ type: "group", label: group.label });
      for (const option of group.options) {
        items.push({ type: "option", ...option, index: flat.length });
        flat.push(option);
      }
    }
    return { items, options: flat };
  }
  const list = options ?? [];
  return {
    items: list.map((option, index) => ({ type: "option", ...option, index })),
    options: list,
  };
}

/** Extend the typed prefix, or start a new one if the extra character misses. */
export function nextTypeaheadQuery(
  buffer: string,
  key: string,
  options: SelectOption[],
): string {
  const combined = buffer + key;
  if (matchTypeahead(options, combined) >= 0) return combined;
  if (matchTypeahead(options, key) >= 0) return key;
  return "";
}

export function matchTypeahead(
  options: SelectOption[],
  query: string,
  fromIndex = 0,
): number {
  const q = query.toLowerCase();
  if (!q || options.length === 0) return -1;
  const start = Math.max(0, fromIndex);
  for (let i = 0; i < options.length; i++) {
    const idx = (start + i) % options.length;
    if (options[idx]!.label.toLowerCase().startsWith(q)) return idx;
  }
  return -1;
}

export function placeSelectMenu(
  trigger: { top: number; left: number; bottom: number; width: number },
  viewport: { width: number; height: number },
  menuHeight = MENU_MAX_HEIGHT,
): { top: number; left: number; width: number; maxHeight: number } {
  const width = Math.min(
    Math.max(trigger.width, MENU_MIN_WIDTH),
    Math.max(0, viewport.width - MENU_MARGIN * 2),
  );
  let left = trigger.left;
  if (left + width > viewport.width - MENU_MARGIN) {
    left = viewport.width - MENU_MARGIN - width;
  }
  if (left < MENU_MARGIN) left = MENU_MARGIN;

  const spaceBelow = viewport.height - trigger.bottom - MENU_GAP - MENU_MARGIN;
  const spaceAbove = trigger.top - MENU_GAP - MENU_MARGIN;
  const openBelow =
    spaceBelow >= Math.min(menuHeight, 160) || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(
    0,
    Math.min(MENU_MAX_HEIGHT, openBelow ? spaceBelow : spaceAbove),
  );
  const usedHeight = Math.min(menuHeight, maxHeight);
  const top = openBelow
    ? trigger.bottom + MENU_GAP
    : trigger.top - MENU_GAP - usedHeight;

  return { top, left, width, maxHeight };
}
