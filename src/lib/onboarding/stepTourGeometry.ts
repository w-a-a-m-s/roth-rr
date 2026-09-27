/** Geometry helpers for the plan-wizard spotlight tour. */

import type { TourPlacement } from "@/lib/onboarding/tourTypes";

export type Spot = { top: number; left: number; width: number; height: number };

export const SPOT_RADIUS = 14;
export const TOUR_TOOLTIP_WIDTH = 300;
export const TOUR_GAP = 14;
export const TOUR_EDGE = 8;
/** Approximate tip height for flip / clamp math before paint. */
export const TOUR_TIP_HEIGHT_EST = 180;
const TOUR_TIP_MIN_HEIGHT = 120;

export type TourTooltipStyle = {
  position: "fixed";
  width: number;
  top: number;
  left: number;
  transform?: string;
  maxHeight?: number;
  overflowY?: "auto";
};

/** SVG/CSS path for a rounded rect (used with evenodd clip cutouts). */
export function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number = SPOT_RADIUS,
): string {
  if (w <= 0 || h <= 0) return "";
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + rr},${y}`,
    `H${x + w - rr}`,
    `A${rr},${rr} 0 0 1 ${x + w},${y + rr}`,
    `V${y + h - rr}`,
    `A${rr},${rr} 0 0 1 ${x + w - rr},${y + h}`,
    `H${x + rr}`,
    `A${rr},${rr} 0 0 1 ${x},${y + h - rr}`,
    `V${y + rr}`,
    `A${rr},${rr} 0 0 1 ${x + rr},${y}`,
    "Z",
  ].join("");
}

/**
 * CSS clip-path that dims the full viewport and punches holes for each spot.
 * Uses HTML/CSS coordinates (same space as getBoundingClientRect + fixed),
 * so browser zoom stays aligned (unlike an SVG mask).
 */
export function overlayClipPath(
  spots: Spot[],
  viewportWidth: number,
  viewportHeight: number,
): string {
  let d = `M0,0H${viewportWidth}V${viewportHeight}H0Z`;
  for (const s of spots) {
    d += roundedRectPath(s.left, s.top, s.width, s.height);
  }
  return `path(evenodd, "${d}")`;
}

export function unionSpot(spots: Spot[]): Spot | null {
  if (spots.length === 0) return null;
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const s of spots) {
    top = Math.min(top, s.top);
    left = Math.min(left, s.left);
    right = Math.max(right, s.left + s.width);
    bottom = Math.max(bottom, s.top + s.height);
  }
  return { top, left, width: right - left, height: bottom - top };
}

/** Keep the spotlight inside a visible rect (modal body / above footer). */
export function clipSpotToRect(spot: Spot, clip: DOMRect): Spot | null {
  const top = Math.max(spot.top, clip.top + 2);
  const left = Math.max(spot.left, clip.left + 2);
  const right = Math.min(spot.left + spot.width, clip.right - 2);
  const bottom = Math.min(spot.top + spot.height, clip.bottom - 2);
  if (right - left < 8 || bottom - top < 8) return null;
  return { top, left, width: right - left, height: bottom - top };
}

export type TourClamp = {
  minLeft: number;
  maxRight: number;
};

function clampFromViewport(viewportWidth: number): TourClamp {
  return { minLeft: TOUR_EDGE, maxRight: viewportWidth - TOUR_EDGE };
}

function tipWidth(clamp: TourClamp): number {
  return Math.min(TOUR_TOOLTIP_WIDTH, Math.max(0, clamp.maxRight - clamp.minLeft));
}

function clampLeft(preferred: number, clamp: TourClamp, width: number): number {
  return Math.min(clamp.maxRight - width, Math.max(clamp.minLeft, preferred));
}

function belowStyle(
  top: number,
  left: number,
  width: number,
  maxBottomY: number,
): TourTooltipStyle {
  const room = maxBottomY - top;
  if (room >= TOUR_TIP_HEIGHT_EST) {
    return { position: "fixed", width, top, left };
  }
  const clampedTop = Math.max(TOUR_EDGE, Math.min(top, maxBottomY - TOUR_TIP_MIN_HEIGHT));
  return {
    position: "fixed",
    width,
    top: clampedTop,
    left,
    maxHeight: Math.max(TOUR_TIP_MIN_HEIGHT, maxBottomY - clampedTop),
    overflowY: "auto",
  };
}

function aboveStyle(
  bottomEdge: number,
  left: number,
  width: number,
  maxBottomY: number,
): TourTooltipStyle {
  const available = Math.min(bottomEdge, maxBottomY) - TOUR_EDGE;
  if (available >= TOUR_TIP_HEIGHT_EST) {
    return {
      position: "fixed",
      width,
      top: Math.min(bottomEdge, maxBottomY),
      left,
      transform: "translateY(-100%)",
    };
  }
  return {
    position: "fixed",
    width,
    top: TOUR_EDGE,
    left,
    maxHeight: Math.max(TOUR_TIP_MIN_HEIGHT, available),
    overflowY: "auto",
  };
}

function aboveOrBelow(
  anchor: Spot,
  left: number,
  width: number,
  maxBottomY: number,
): TourTooltipStyle {
  const preferredTop = anchor.top + anchor.height + TOUR_GAP;
  const spaceBelow = maxBottomY - preferredTop;
  const spaceAbove = anchor.top - TOUR_GAP - TOUR_EDGE;
  if (spaceBelow < TOUR_TIP_HEIGHT_EST && spaceAbove > spaceBelow) {
    return aboveStyle(anchor.top - TOUR_GAP, left, width, maxBottomY);
  }
  return belowStyle(preferredTop, left, width, maxBottomY);
}

/**
 * Position a tour tip next to a spotlight. Side placements flip above/below
 * when they would overflow the clamp box (a narrow plan dialog).
 * `bottom-left` flips above when the clipped spot sits against the footer.
 */
export function tooltipStyleFor(
  placement: TourPlacement,
  anchor: Spot,
  viewport: { width: number; height: number },
  maxBottomY: number = viewport.height - TOUR_EDGE,
  clamp: TourClamp = clampFromViewport(viewport.width),
): TourTooltipStyle {
  const width = tipWidth(clamp);
  const leftFromAnchor = clampLeft(anchor.left, clamp, width);
  const leftFromRight = clampLeft(
    anchor.left + anchor.width - width,
    clamp,
    width,
  );

  if (placement === "top-right") {
    return aboveStyle(anchor.top - TOUR_GAP, leftFromRight, width, maxBottomY);
  }

  if (placement === "left-center" || placement === "right-center") {
    const preferredCenter = anchor.top + anchor.height / 2;
    const minCenter = TOUR_EDGE + TOUR_TIP_HEIGHT_EST / 2;
    const maxCenter = maxBottomY - TOUR_TIP_HEIGHT_EST / 2;
    const centerY = Math.min(
      Math.max(preferredCenter, minCenter),
      Math.max(minCenter, maxCenter),
    );
    const besideLeft =
      placement === "left-center"
        ? anchor.left - TOUR_GAP - width
        : anchor.left + anchor.width + TOUR_GAP;
    const fitsBeside =
      placement === "left-center"
        ? besideLeft >= clamp.minLeft
        : besideLeft + width <= clamp.maxRight;
    if (!fitsBeside) {
      return aboveOrBelow(anchor, leftFromAnchor, width, maxBottomY);
    }
    return {
      position: "fixed",
      width,
      top: centerY,
      left: clampLeft(besideLeft, clamp, width),
      maxHeight: Math.max(
        TOUR_TIP_MIN_HEIGHT,
        maxBottomY - (centerY - TOUR_TIP_HEIGHT_EST / 2),
      ),
      overflowY: "auto",
      transform: "translateY(-50%)",
    };
  }

  return aboveOrBelow(anchor, leftFromAnchor, width, maxBottomY);
}
