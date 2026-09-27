"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useUI } from "@/store/useUI";
import { useActiveConfig, useHousehold, useScenario } from "@/store/useScenario";
import { isPlanNameTaken } from "@/lib/planName";
import { canRenamePlan } from "@/lib/sharing";
import { PLAN_STEPS, STEP_INDEX } from "@/components/plan/steps";
import { PlanNavProvider } from "@/components/plan/PlanNavContext";
import { isConversionEmpty } from "@/lib/engine/conversionEmpty";

const STAGE_MOTION_MS = 300;

function StageTabs({
  current,
  tabEnabled,
  onSelect,
}: {
  current: number;
  tabEnabled: (i: number) => boolean;
  onSelect: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[current];
    if (!list || !tab) return;

    const sync = () => {
      setIndicator({
        left: tab.offsetLeft,
        top: tab.offsetTop,
        width: tab.offsetWidth,
        height: tab.offsetHeight,
        ready: true,
      });
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(list);
    ro.observe(tab);
    return () => ro.disconnect();
  }, [current]);

  return (
    <div ref={listRef} className="relative mb-0 flex flex-wrap gap-1">
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-lg border border-[#E4D6AE] bg-[#F5EFDD]"
        style={{
          left: indicator.left,
          top: indicator.top,
          width: indicator.width,
          height: indicator.height,
          opacity: indicator.ready ? 1 : 0,
          transition: indicator.ready
            ? `left ${STAGE_MOTION_MS}ms ease, top ${STAGE_MOTION_MS}ms ease, width ${STAGE_MOTION_MS}ms ease, height ${STAGE_MOTION_MS}ms ease, opacity 120ms ease`
            : undefined,
        }}
      />
      {PLAN_STEPS.map((s, i) => {
        const enabled = tabEnabled(i);
        const isActive = i === current;
        return (
          <button
            key={s.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onSelect(i)}
            className={`relative z-10 rounded-lg px-3 py-[7px] text-[12.5px] font-bold transition-colors ${
              isActive
                ? "text-[#8a6d1f]"
                : enabled
                  ? "text-muted-2 hover:bg-segment"
                  : "cursor-not-allowed text-muted-3/40"
            }`}
          >
            {i + 1}. {s.title}
          </button>
        );
      })}
    </div>
  );
}

function AnimatedHeight({
  children,
  dependency,
}: {
  children: ReactNode;
  dependency: unknown;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const sync = () => {
      setHeight(Math.ceil(el.getBoundingClientRect().height));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dependency]);

  useEffect(() => {
    if (height == null || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [height, animate]);

  return (
    <div
      style={{
        height: height == null ? undefined : height,
        overflow: "hidden",
        transition: animate
          ? `height ${STAGE_MOTION_MS}ms ease`
          : undefined,
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export function PlanModal() {
  const planModal = useUI((s) => s.planModal);
  if (!planModal.open) return null;
  return (
    <PlanModalBody mode={planModal.mode} initialStep={planModal.stepIndex} />
  );
}

function PlanModalBody({
  mode,
  initialStep,
}: {
  mode: "new" | "edit";
  initialStep: number;
}) {
  const finishPlanModal = useUI((s) => s.finishPlanModal);
  const cancelPlanModal = useUI((s) => s.cancelPlanModal);
  const draftId = useUI((s) => s.draftId);
  const renameConfig = useScenario((s) => s.renameConfig);
  const configs = useScenario((s) => s.configs);
  const authStatus = useScenario((s) => s.auth.status);
  const household = useHousehold();
  const active = useActiveConfig();
  const isNew = mode === "new";
  /** First-plan flow: no draft to discard, cannot dismiss until finished. */
  const forced = isNew && !draftId;
  const gated = authStatus !== "authenticated";

  const [current, setCurrent] = useState(initialStep);
  const [unlocked, setUnlocked] = useState(
    isNew ? initialStep : PLAN_STEPS.length - 1,
  );
  /** Bumped when leaving a step so returning remounts with edits closed. */
  const [visitKeys, setVisitKeys] = useState<Record<string, number>>({});
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(active.name);
  const [renameError, setRenameError] = useState<string | null>(null);

  const step = PLAN_STEPS[current];
  const StepComponent = step.Component;
  const isLast = current === PLAN_STEPS.length - 1;
  const stepComplete = step.isComplete(household);
  const nameMissing = isNew && active.name.trim().length === 0;
  const conversionEmpty = isConversionEmpty(household);
  // Edit mode ignores per-step isComplete except finishing: nothing to convert
  // means Create plan / Done (and Close) stay disabled.
  const canFinish = !conversionEmpty;
  const canAdvance =
    (!isNew || stepComplete) && !nameMissing && (!isLast || canFinish);
  const tabEnabled = (i: number) => (isNew ? i <= unlocked : true);
  const showStepBlurb = step.id === "conversion";
  const canRename =
    isNew ||
    active.id.startsWith("local-") ||
    canRenamePlan(active.role);

  const leaveStep = (index: number) => {
    const id = PLAN_STEPS[index]?.id;
    if (!id) return;
    setVisitKeys((keys) => ({ ...keys, [id]: (keys[id] ?? 0) + 1 }));
  };

  const goNext = () => {
    if (isLast) {
      if (!canFinish) return;
      void finishPlanModal();
      return;
    }
    const next = current + 1;
    leaveStep(current);
    setCurrent(next);
    setUnlocked((u) => Math.max(u, next));
  };

  const goToStep = (stepId: string) => {
    const i = STEP_INDEX[stepId];
    if (i == null) return;
    leaveStep(current);
    setCurrent(i);
    setUnlocked((u) => Math.max(u, i));
  };

  const goToIndex = (index: number) => {
    if (index === current) return;
    leaveStep(current);
    setCurrent(index);
    setUnlocked((u) => Math.max(u, index));
  };

  const commitRename = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setRenameError("Enter a plan name.");
      return;
    }
    if (isPlanNameTaken(configs, trimmed, active.id)) {
      setRenameError("You already have a plan with this name.");
      return;
    }
    renameConfig(active.id, trimmed);
    setRenameError(null);
    setRenaming(false);
  };

  const title = (
    <span className="flex min-w-0 items-center gap-2">
      {renaming ? (
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setRenameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setRenameError(null);
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-accent bg-white px-2.5 py-[7px] text-base outline-none md:text-[15px]"
            />
            <button
              type="button"
              onClick={commitRename}
              title="Save"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,#fff)] bg-[color-mix(in_srgb,var(--accent)_7%,#fff)] text-[color-mix(in_srgb,var(--accent)_60%,#000)]"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setRenameError(null);
              }}
              title="Cancel"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-2 bg-white text-muted-2"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </span>
          {renameError ? (
            <span className="text-[11px] font-medium text-danger" role="alert">
              {renameError}
            </span>
          ) : null}
        </span>
      ) : (
        <>
          <span className="truncate font-serif text-[19px] font-medium text-foreground">
            {active.name.trim() || "New plan"}
          </span>
          {canRename && (!gated || !isNew) ? (
            <button
              type="button"
              onClick={() => {
                setNameDraft(active.name);
                setRenameError(null);
                setRenaming(true);
              }}
              className="flex h-[26px] shrink-0 items-center gap-1 rounded-full border border-border-2 bg-white px-2.5 text-[11.5px] font-semibold text-muted-2"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" strokeLinecap="round" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
              </svg>
              Rename
            </button>
          ) : null}
        </>
      )}
    </span>
  );

  const footer = (
    <div className="flex flex-col gap-2">
      {!canAdvance ? (
        <span className="text-center text-xs text-muted-3">
          {nameMissing
            ? "Enter a plan name to continue"
            : isLast && conversionEmpty
              ? "Add a conversion window and taxable retirement balance before finishing"
              : step.id === "household"
                ? household.filingStatus === "mfj"
                  ? "Add both people with name, birth year, and retirement year"
                  : "Add at least one person with name, birth year, and retirement year"
                : step.id === "accounts"
                  ? "Add at least one account to continue"
                  : "Complete this step to continue"}
        </span>
      ) : null}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="justify-self-start">
          <Button
            variant="secondary"
            onClick={() => goToIndex(Math.max(0, current - 1))}
            disabled={current === 0}
          >
            Back
          </Button>
        </div>
        <div className="justify-self-center">
          {!isNew ? (
            <Button
              variant="secondary"
              onClick={finishPlanModal}
              disabled={!canFinish}
            >
              Close
            </Button>
          ) : !forced ? (
            <Button variant="secondary" onClick={cancelPlanModal}>
              Cancel
            </Button>
          ) : null}
        </div>
        <div className="justify-self-end">
          <Button
            variant={isNew ? "primary" : "secondary"}
            onClick={goNext}
            disabled={!canAdvance}
          >
            {isLast ? (isNew ? "Create plan" : "Done") : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={forced ? () => {} : cancelPlanModal}
      title={title}
      size="xl"
      align="top"
      fullHeight={!isNew}
      minHeight={isNew}
      footer={footer}
      closeOnBackdrop={!forced}
      showCloseButton={!forced}
    >
      {/* Stage indicator: warm gold for active, not purple (accent = actions only) */}
      <StageTabs
        current={current}
        tabEnabled={tabEnabled}
        onSelect={goToIndex}
      />
      <div className="mb-5 mt-2.5 h-px bg-border" />

      {isNew ? (
        <AnimatedHeight dependency={current}>
          {showStepBlurb ? (
            <p className="mb-4 text-[12.5px] text-muted-3">{step.description}</p>
          ) : null}
          <PlanNavProvider value={{ goToStep }}>
            <StepComponent key={`${step.id}-${visitKeys[step.id] ?? 0}`} />
          </PlanNavProvider>
        </AnimatedHeight>
      ) : (
        <div>
          {showStepBlurb ? (
            <p className="mb-4 text-[12.5px] text-muted-3">{step.description}</p>
          ) : null}
          <PlanNavProvider value={{ goToStep }}>
            <StepComponent key={`${step.id}-${visitKeys[step.id] ?? 0}`} />
          </PlanNavProvider>
        </div>
      )}
    </Modal>
  );
}
