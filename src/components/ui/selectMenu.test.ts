import { describe, expect, it } from "vitest";
import {
  flattenSelectList,
  matchTypeahead,
  nextTypeaheadQuery,
  placeSelectMenu,
} from "./selectMenu";

describe("flattenSelectList", () => {
  it("maps a flat option list", () => {
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    expect(flattenSelectList(options)).toEqual({
      items: [
        { type: "option", value: "a", label: "Alpha", index: 0 },
        { type: "option", value: "b", label: "Beta", index: 1 },
      ],
      options,
    });
  });

  it("skips empty groups and flattens the rest", () => {
    const { items, options } = flattenSelectList(undefined, [
      { label: "Empty", options: [] },
      {
        label: "People",
        options: [{ value: "p1", label: "Pat" }],
      },
    ]);
    expect(items).toEqual([
      { type: "group", label: "People" },
      { type: "option", value: "p1", label: "Pat", index: 0 },
    ]);
    expect(options).toEqual([{ value: "p1", label: "Pat" }]);
  });
});

describe("matchTypeahead", () => {
  const years = ["1979", "1980", "1981", "1990"].map((y) => ({
    value: y,
    label: y,
  }));

  it("matches a prefix from the given index, wrapping around", () => {
    expect(matchTypeahead(years, "198", 0)).toBe(1);
    expect(matchTypeahead(years, "198", 2)).toBe(2);
    expect(matchTypeahead(years, "19", 3)).toBe(3);
    expect(matchTypeahead(years, "19", 4)).toBe(0);
  });

  it("keeps a matching prefix and restarts when the extra key misses", () => {
    expect(nextTypeaheadQuery("", "1", years)).toBe("1");
    expect(nextTypeaheadQuery("19", "8", years)).toBe("198");
    expect(nextTypeaheadQuery("1981", "1", years)).toBe("1");
    expect(nextTypeaheadQuery("1990", "x", years)).toBe("");
  });

  it("is case-insensitive and returns -1 when nothing matches", () => {
    const states = [{ value: "fl", label: "Florida" }];
    expect(matchTypeahead(states, "flo")).toBe(0);
    expect(matchTypeahead(states, "FLO")).toBe(0);
    expect(matchTypeahead(states, "xx")).toBe(-1);
    expect(matchTypeahead([], "a")).toBe(-1);
  });
});

describe("placeSelectMenu", () => {
  const viewport = { width: 390, height: 700 };

  it("opens below the trigger and is at least the trigger width", () => {
    const box = placeSelectMenu(
      { top: 120, left: 16, bottom: 156, width: 358 },
      viewport,
    );
    expect(box.top).toBe(160);
    expect(box.left).toBe(16);
    expect(box.width).toBe(358);
    expect(box.maxHeight).toBeGreaterThan(200);
  });

  it("opens above when there is no room below", () => {
    const box = placeSelectMenu(
      { top: 620, left: 16, bottom: 656, width: 200 },
      viewport,
      200,
    );
    expect(box.top).toBeLessThan(620);
    expect(box.maxHeight).toBeGreaterThan(0);
  });

  it("clamps a narrow field to a readable width and stays on screen", () => {
    const box = placeSelectMenu(
      { top: 80, left: 300, bottom: 110, width: 72 },
      viewport,
    );
    expect(box.width).toBe(140);
    expect(box.left + box.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(box.left).toBeGreaterThanOrEqual(8);
  });
});
