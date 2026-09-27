"use client";

import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { MODAL_ENTER_MS } from "@/lib/common/client";
import {
  hasSeenStepTour,
  markStepTourSeen,
  subscribeStepTourSeen,
  type StepTourId,
} from "@/lib/onboarding/stepTourStorage";
import type { TourStepContent } from "@/lib/onboarding/tourTypes";
import { findPlanModalPrimaryAction } from "@/lib/onboarding/householdTour";
import { shouldRunStepTour } from "@/lib/onboarding/stepTourGate";
import { useLgUp } from "@/lib/useLgUp";
import {
  clipSpotToRect,
  overlayClipPath,
  tooltipStyleFor,
  unionSpot,
  TOUR_EDGE,
  TOUR_GAP,
  type Spot,
} from "@/lib/onboarding/stepTourGeometry";

export type { TourStepContent, TourPlacement } from "@/lib/onboarding/tourTypes";

/** Ref or live lookup for a tour spotlight target. */
export type TourTarget =
  | RefObject<HTMLElement | null>
  | (() => HTMLElement | null);

/** One target, or several highlighted together in a single tip. */
export type TourTargetSpec = TourTarget | TourTarget[];

const PAD = 8;
const Z_TOUR = 200;

function resolveTarget(target: TourTarget | undefined): HTMLElement | null {
  if (!target) return null;
  if (typeof target === "function") return target();
  return target.current;
}

function resolveTargets(spec: TourTargetSpec | undefined): HTMLElement[] {
  if (!spec) return [];
  const list = Array.isArray(spec) ? spec : [spec];
  const els: HTMLElement[] = [];
  for (const item of list) {
    const el = resolveTarget(item);
    if (el) els.push(el);
  }
  return els;
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function spotsFromElements(els: HTMLElement[]): Spot[] {
  return els.map((el) => {
    const er = el.getBoundingClientRect();
    return {
      top: er.top - PAD,
      left: er.left - PAD,
      width: er.width + PAD * 2,
      height: er.height + PAD * 2,
    };
  });
}

function viewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Mandatory first-time spotlight tour for a plan-wizard stage.
 * Desktop (`lg+`) only: `shouldRunStepTour` is the viewport gate for every
 * tour id. Blocks the UI until the user finishes every tip (no skip).
 * A tip may highlight one target or several at once.
 */
export function StepTour({
  tourId,
  steps,
  targets,
}: {
  tourId: StepTourId;
  steps: TourStepContent[];
  /** Map of step `id` → element ref/getter, or an array to highlight together. */
  targets: Record<string, TourTargetSpec>;
}) {
  const { lgUp } = useLgUp();
  const unseen = useSyncExternalStore(
    subscribeStepTourSeen,
    () => !hasSeenStepTour(tourId),
    () => false,
  );
  const showTour = shouldRunStepTour(unseen, lgUp);
  const [step, setStep] = useState(0);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [viewport, setViewport] = useState(viewportSize);
  const targetsRef = useRef(targets);
  const stepsRef = useRef(steps);

  useEffect(() => {
    targetsRef.current = targets;
    stepsRef.current = steps;
  }, [targets, steps]);

  useLayoutEffect(() => {
    if (!showTour) return;

    const measure = () => {
      setViewport(viewportSize());
      const meta = stepsRef.current[step];
      if (!meta) {
        setSpots([]);
        return;
      }
      const els = resolveTargets(targetsRef.current[meta.id]);
      if (els.length === 0) {
        setSpots([]);
        return;
      }

      const first = els[0];
      const scrollParent = findScrollParent(first);
      // Bring the top of a tall target into the modal body so the tip has room.
      if (scrollParent) {
        const er = first.getBoundingClientRect();
        const pr = scrollParent.getBoundingClientRect();
        if (er.top < pr.top + 8 || er.top > pr.bottom - 80) {
          scrollParent.scrollTop += er.top - pr.top - 12;
        }
      } else {
        first.scrollIntoView({ block: "nearest", inline: "nearest" });
      }

      let next = spotsFromElements(els);
      if (scrollParent) {
        const clip = scrollParent.getBoundingClientRect();
        next = next
          .map((s) => clipSpotToRect(s, clip))
          .filter((s): s is Spot => s != null);
      }
      // Keep tall cutouts above the plan footer, but never when the tip is
      // highlighting that footer button itself (Household / Conversion last tip).
      const footerBtn = findPlanModalPrimaryAction();
      const highlightingFooter =
        footerBtn != null &&
        els.some((el) => el === footerBtn || el.contains(footerBtn));
      if (footerBtn && !highlightingFooter) {
        const footerTop = footerBtn.getBoundingClientRect().top;
        const { width } = viewportSize();
        const limit = new DOMRect(0, 0, width, footerTop - TOUR_GAP);
        next = next
          .map((s) => clipSpotToRect(s, limit))
          .filter((s): s is Spot => s != null);
      }
      setSpots(next);
    };

    measure();
    // Modal enter uses transform: scale(...). getBoundingClientRect during that
    // animation is wrong for body-portaled fixed overlays; zooming later
    // remeasures and looks fine. Catch the settled layout after the animation.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      measure();
      raf2 = requestAnimationFrame(measure);
    });
    const settleTimer = window.setTimeout(measure, MODAL_ENTER_MS + 16);

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onResize);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    const meta = stepsRef.current[step];
    const els = meta ? resolveTargets(targetsRef.current[meta.id]) : [];
    for (const el of els) ro?.observe(el);
    const scrollParent = els[0] ? findScrollParent(els[0]) : null;
    if (scrollParent) ro?.observe(scrollParent);
    const dialog = els[0]?.closest<HTMLElement>('[role="dialog"]');
    const onAnimEnd = (e: Event) => {
      if (!(e instanceof AnimationEvent)) return;
      if (!e.animationName.includes("modal-dialog")) return;
      measure();
    };
    dialog?.addEventListener("animationend", onAnimEnd);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      dialog?.removeEventListener("animationend", onAnimEnd);
      ro?.disconnect();
    };
  }, [showTour, step]);

  useEffect(() => {
    if (!showTour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [showTour]);

  if (!showTour || typeof document === "undefined") return null;

  const meta = steps[step];
  if (!meta) return null;

  const finish = () => {
    markStepTourSeen(tourId);
  };

  const goNext = () => {
    if (step >= steps.length - 1) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  };

  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const bounds = unionSpot(spots);
  // Side placements use the (clipped) union; others anchor to the first spot.
  const anchor =
    meta.placement === "left-center" || meta.placement === "right-center"
      ? bounds
      : (spots[0] ?? bounds);

  let tooltipStyle: CSSProperties = { display: "none" };
  if (anchor) {
    const footerBtn = findPlanModalPrimaryAction();
    const highlightingFooter =
      footerBtn != null &&
      resolveTargets(targets[meta.id]).some(
        (el) => el === footerBtn || el.contains(footerBtn),
      );
    const maxBottomY =
      footerBtn && !highlightingFooter
        ? footerBtn.getBoundingClientRect().top - TOUR_GAP
        : viewport.height - 8;
    const dialog = footerBtn?.closest<HTMLElement>('[role="dialog"]');
    const dialogRect = dialog?.getBoundingClientRect();
    const clamp = dialogRect
      ? {
          minLeft: dialogRect.left + TOUR_EDGE,
          maxRight: dialogRect.right - TOUR_EDGE,
        }
      : undefined;
    tooltipStyle = {
      ...tooltipStyleFor(meta.placement, anchor, viewport, maxBottomY, clamp),
      zIndex: Z_TOUR + 1,
    };
  }

  // Single spot: box-shadow dimming stays in the same CSS fixed space as the
  // ring (reliable under browser zoom). Multiple spots need clip-path holes.
  const single = spots.length === 1 ? spots[0] : null;
  const multiDimStyle: CSSProperties | undefined =
    spots.length > 1
      ? {
          zIndex: Z_TOUR,
          background: "rgba(26, 25, 21, 0.55)",
          clipPath: overlayClipPath(spots, viewport.width, viewport.height),
        }
      : undefined;

  return createPortal(
    <>
      {/* Blocks interaction with the plan modal until the tour is finished. */}
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ zIndex: Z_TOUR - 1 }}
      />
      {single ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-[14px] border-2 border-foreground"
          style={{
            top: single.top,
            left: single.left,
            width: single.width,
            height: single.height,
            zIndex: Z_TOUR,
            boxShadow: "0 0 0 9999px rgba(26, 25, 21, 0.55)",
          }}
        />
      ) : null}
      {multiDimStyle ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={multiDimStyle}
        />
      ) : null}
      {spots.length > 1
        ? spots.map((s, i) => (
            <div
              key={i}
              aria-hidden
              className="pointer-events-none fixed rounded-[14px] border-2 border-foreground"
              style={{
                top: s.top,
                left: s.left,
                width: s.width,
                height: s.height,
                zIndex: Z_TOUR,
              }}
            />
          ))
        : null}
      <div
        role="status"
        aria-live="polite"
        aria-labelledby={`step-tour-title-${tourId}`}
        className="rounded-[14px] border-2 border-foreground bg-surface px-5 py-[18px] shadow-[0_20px_50px_rgba(26,25,21,0.28)]"
        style={tooltipStyle}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.06em] text-accent">
            Step {step + 1} of {steps.length}
          </span>
        </div>
        <div
          id={`step-tour-title-${tourId}`}
          className="mb-1.5 font-serif text-[19px] font-medium text-foreground"
        >
          {meta.title}
        </div>
        {meta.body ? (
          <p className="mb-4 text-[13.5px] leading-normal text-muted-2">
            {meta.body}
          </p>
        ) : (
          <div className="mb-4" />
        )}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === step ? "bg-accent" : "bg-border-2"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={goPrev}
                className="h-8 rounded-lg border border-border-2 bg-surface px-3.5 text-[13px] font-bold text-muted-2"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              className="h-8 rounded-lg bg-accent px-4 text-[13px] font-bold text-white hover:bg-accent-hover"
            >
              {step === steps.length - 1 ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
