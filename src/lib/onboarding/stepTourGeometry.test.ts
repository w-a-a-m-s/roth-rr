// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  clipSpotToRect,
  overlayClipPath,
  roundedRectPath,
  tooltipStyleFor,
  unionSpot,
  TOUR_EDGE,
  TOUR_GAP,
  TOUR_TIP_HEIGHT_EST,
  TOUR_TOOLTIP_WIDTH,
} from "@/lib/onboarding/stepTourGeometry";

describe("roundedRectPath", () => {
  it("builds a closed rounded rect path", () => {
    const d = roundedRectPath(10, 20, 100, 40, 8);
    expect(d.startsWith("M18,20")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("A8,8");
  });

  it("returns empty for non-positive size", () => {
    expect(roundedRectPath(0, 0, 0, 10)).toBe("");
  });
});

describe("overlayClipPath", () => {
  it("includes the viewport outer path and each spot cutout", () => {
    const clip = overlayClipPath(
      [{ top: 40, left: 20, width: 80, height: 30 }],
      800,
      600,
    );
    expect(clip.startsWith('path(evenodd, "M0,0H800V600H0Z')).toBe(true);
    // Default radius 14 → start of top edge is left + 14.
    expect(clip).toContain("M34,40");
    expect(clip.endsWith('")')).toBe(true);
  });
});

describe("unionSpot", () => {
  it("returns null for no spots", () => {
    expect(unionSpot([])).toBeNull();
  });

  it("unions multiple spots", () => {
    expect(
      unionSpot([
        { top: 10, left: 10, width: 20, height: 20 },
        { top: 40, left: 50, width: 10, height: 10 },
      ]),
    ).toEqual({ top: 10, left: 10, width: 50, height: 40 });
  });
});

describe("clipSpotToRect", () => {
  it("clips to the intersection", () => {
    const clip = new DOMRect(0, 0, 100, 100);
    expect(
      clipSpotToRect({ top: -10, left: -10, width: 50, height: 50 }, clip),
    ).toEqual({ top: 2, left: 2, width: 38, height: 38 });
  });

  it("returns null when nearly empty", () => {
    const clip = new DOMRect(0, 0, 10, 10);
    expect(
      clipSpotToRect({ top: 20, left: 20, width: 50, height: 50 }, clip),
    ).toBeNull();
  });
});

describe("tooltipStyleFor", () => {
  const desktop = { width: 1280, height: 800 };
  const phone = { width: 390, height: 700 };

  it("places bottom-left under the spot when there is room", () => {
    const style = tooltipStyleFor(
      "bottom-left",
      { top: 80, left: 24, width: 200, height: 40 },
      desktop,
    );
    expect(style.top).toBe(80 + 40 + TOUR_GAP);
    expect(style.left).toBe(24);
    expect(style.width).toBe(TOUR_TOOLTIP_WIDTH);
    expect(style.transform).toBeUndefined();
  });

  it("flips bottom-left above a tall spot that sits on the footer", () => {
    // People card clipped to just above the plan footer, like a phone wizard.
    const footerTop = 640;
    const spot = { top: 280, left: 16, width: 358, height: footerTop - 280 };
    const style = tooltipStyleFor("bottom-left", spot, phone, footerTop - TOUR_GAP);
    expect(style.transform).toBe("translateY(-100%)");
    expect(style.top).toBe(spot.top - TOUR_GAP);
    expect(style.top).toBeGreaterThan(TOUR_EDGE);
    expect(style.top).toBeLessThan(footerTop);
  });

  it("keeps a flipped tip inside the viewport when space above is tight", () => {
    const footerTop = 640;
    const spot = { top: 120, left: 16, width: 358, height: footerTop - 120 };
    const style = tooltipStyleFor("bottom-left", spot, phone, footerTop - TOUR_GAP);
    expect(style.top).toBe(TOUR_EDGE);
    expect(style.maxHeight).toBeGreaterThan(0);
    expect((style.top ?? 0) + (style.maxHeight ?? 0)).toBeLessThanOrEqual(
      footerTop - TOUR_GAP,
    );
  });

  it("shrinks the tip to the phone width", () => {
    const style = tooltipStyleFor(
      "bottom-left",
      { top: 80, left: 8, width: 200, height: 40 },
      { width: 280, height: 600 },
    );
    expect(style.width).toBe(280 - TOUR_EDGE * 2);
    expect(style.left).toBe(TOUR_EDGE);
  });

  it("sits right-center under the spot on a narrow viewport", () => {
    const style = tooltipStyleFor(
      "right-center",
      { top: 80, left: 16, width: 358, height: 40 },
      phone,
    );
    expect(style.top).toBe(80 + 40 + TOUR_GAP);
    expect(style.transform).toBeUndefined();
    expect(style.left + style.width).toBeLessThanOrEqual(phone.width - TOUR_EDGE);
  });

  it("flips a w-fit year column tip instead of hanging off the dialog", () => {
    // Conversion "Change amounts if needed": ~240px year list, phone dialog.
    const dialog = { minLeft: 24, maxRight: 366 };
    const spot = { top: 320, left: 40, width: 240, height: 120 };
    const style = tooltipStyleFor(
      "right-center",
      spot,
      phone,
      640,
      dialog,
    );
    expect(style.left).toBeGreaterThanOrEqual(dialog.minLeft);
    expect(style.left + style.width).toBeLessThanOrEqual(dialog.maxRight);
    expect(style.transform === "translateY(-50%)").toBe(false);
  });

  it("clamps a side tip that would overflow a narrow dialog", () => {
    const dialog = { minLeft: 24, maxRight: 366 };
    const style = tooltipStyleFor(
      "right-center",
      { top: 80, left: 40, width: 80, height: 40 },
      { width: 800, height: 700 },
      640,
      dialog,
    );
    expect(style.left).toBeGreaterThanOrEqual(dialog.minLeft);
    expect(style.left + style.width).toBeLessThanOrEqual(dialog.maxRight);
  });

  it("keeps a right-center flip-under tip on screen when the spot is tall", () => {
    const footerTop = 640;
    const spot = { top: 280, left: 16, width: 358, height: footerTop - 280 };
    const style = tooltipStyleFor(
      "right-center",
      spot,
      phone,
      footerTop - TOUR_GAP,
    );
    expect(style.top).toBeGreaterThanOrEqual(TOUR_EDGE);
    const visualBottom =
      style.transform === "translateY(-100%)"
        ? style.top
        : style.top + (style.maxHeight ?? TOUR_TIP_HEIGHT_EST);
    expect(visualBottom).toBeLessThanOrEqual(footerTop - TOUR_GAP + 1);
  });
});
