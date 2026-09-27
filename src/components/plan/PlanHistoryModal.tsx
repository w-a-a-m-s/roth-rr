"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  formatPlanChangeLabel,
  type PlanFieldChange,
} from "@/lib/planDiff";
import { formatLocalDateHour, relativeTime } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";
import { useScenario } from "@/store/useScenario";
import type { Household } from "@/lib/domain/types";
import { LabsLoading } from "@/lib/common/client";

interface RevisionSummary {
  id: string;
  planId: string;
  createdAt: number;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  changes: string[];
  details?: PlanFieldChange[];
}

interface RevisionDetail extends RevisionSummary {
  plan: { name: string; household: Household };
}

function actorLabel(r: RevisionSummary): string {
  return r.userName || r.userEmail || "Unknown user";
}

function changesLabel(changes: string[]): string {
  if (changes.length === 0) return "No field changes";
  return changes.map(formatPlanChangeLabel).join(", ");
}

function ValueCell({ value }: { value: string }) {
  return (
    <td
      className="max-w-[140px] truncate px-2 py-1 align-top text-muted-2"
      title={value}
    >
      {value}
    </td>
  );
}

function ChangesTable({ details }: { details: PlanFieldChange[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-border-subtle">
      <table className="w-full min-w-[420px] border-collapse text-left text-[11.5px]">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-muted text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-3">
            <th className="px-2 py-1.5 font-semibold">Section</th>
            <th className="px-2 py-1.5 font-semibold">Property</th>
            <th className="px-2 py-1.5 font-semibold">Before</th>
            <th className="px-2 py-1.5 font-semibold">After</th>
          </tr>
        </thead>
        <tbody>
          {details.map((row, i) => (
            <tr
              key={`${row.section}-${row.property}-${i}`}
              className="border-b border-border-subtle last:border-b-0"
            >
              <td className="px-2 py-1 align-top font-medium text-foreground">
                {row.section}
              </td>
              <td
                className="max-w-[160px] truncate px-2 py-1 align-top text-muted-2"
                title={row.property}
              >
                {row.property}
              </td>
              <ValueCell value={row.before} />
              <ValueCell value={row.after} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlanHistoryModal({
  open,
  planId,
  planName,
  onClose,
}: {
  open: boolean;
  planId: string | null;
  planName: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`History · ${planName}`}
      size="lg"
    >
      {/* Remount per open/plan so fetch state starts fresh without effect resets. */}
      {open && planId ? (
        <HistoryBody planId={planId} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function HistoryBody({
  planId,
  onClose,
}: {
  planId: string;
  onClose: () => void;
}) {
  const enterRevisionPreview = useScenario((s) => s.enterRevisionPreview);

  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      withBasePath(`/api/plans/${encodeURIComponent(planId)}/revisions`),
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load history");
        const data = (await res.json()) as { revisions: RevisionSummary[] };
        if (!cancelled) setRevisions(data.revisions);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const preview = async (revision: RevisionSummary) => {
    setBusyId(revision.id);
    try {
      const res = await fetch(
        withBasePath(
          `/api/plans/${encodeURIComponent(planId)}/revisions/${encodeURIComponent(revision.id)}`,
        ),
      );
      if (!res.ok) throw new Error("Failed to load revision");
      const data = (await res.json()) as { revision: RevisionDetail };
      enterRevisionPreview({
        planId,
        revisionId: data.revision.id,
        createdAt: data.revision.createdAt,
        name: data.revision.plan.name,
        household: data.revision.plan.household,
      });
      onClose();
    } catch {
      setError("Could not load that version for preview");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {error ? (
        <p className="px-1 py-2 text-sm text-danger">{error}</p>
      ) : null}
      {revisions === null && !error ? (
        <div className="flex justify-center px-1 py-8">
          <LabsLoading size="md" />
        </div>
      ) : null}
      {revisions && revisions.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-muted-3">
          No saved versions yet.
        </p>
      ) : null}
      {revisions && revisions.length > 0 ? (
        <ul className="divide-y divide-border">
          {revisions.map((r, index) => {
            const relative = relativeTime(r.createdAt);
            const absolute = formatLocalDateHour(r.createdAt);
            const when = relative
              ? `${relative} (${absolute})`
              : absolute;
            const busy = busyId === r.id;
            const isCurrent = index === 0;
            const details = r.details ?? [];
            return (
              <li
                key={r.id}
                className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-foreground">
                      {when}
                      {isCurrent ? (
                        <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-3">
                          Current
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted-3">
                      {actorLabel(r)}
                    </p>
                    {details.length === 0 ? (
                      <p className="mt-1 text-[12.5px] text-muted-2">
                        {changesLabel(r.changes)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {busy ? <LabsLoading size="sm" /> : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void preview(r)}
                    >
                      {busy ? "Loading..." : "Preview"}
                    </Button>
                  </div>
                </div>
                {details.length > 0 ? <ChangesTable details={details} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
