"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { LabsLoading } from "@/lib/common/client";
import { useScenario } from "@/store/useScenario";
import { useUI } from "@/store/useUI";
import { formatLocalDateTime, relativeTime } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";

/**
 * Fixed green preview chrome while inspecting a historical revision.
 * Stack: modal blur (z-40) < this banner (z-45) < modal dialog (z-50).
 */
export function RevisionPreviewBanner() {
  const preview = useScenario((s) => s.revisionPreview);
  const exitRevisionPreview = useScenario((s) => s.exitRevisionPreview);
  const restoreRevisionPreview = useScenario((s) => s.restoreRevisionPreview);
  const cancelPlanModal = useUI((s) => s.cancelPlanModal);
  const planModalOpen = useUI((s) => s.planModal.open);
  const mounted = useMounted();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!preview || !mounted) return null;

  const when =
    relativeTime(preview.createdAt) || formatLocalDateTime(preview.createdAt);

  const startRestore = () => {
    if (planModalOpen) cancelPlanModal();
    setConfirmOpen(true);
  };

  return (
    <>
      {createPortal(
        <div className="fixed inset-x-0 top-0 z-[45] flex items-center justify-between gap-3 border-b border-[#244034] bg-[#2f4a3c] px-4 py-2.5 text-[12.5px] text-[#eef6f1] shadow-[0_8px_24px_rgba(26,25,21,0.18)]">
          <p className="min-w-0 truncate text-[15px] font-bold">
            Previewing version from {when}. Edits and autosave are paused.
          </p>
          <div className="flex shrink-0 items-center gap-3">
            {busy ? <LabsLoading size="sm" /> : null}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="border-transparent bg-white text-[#2f4a3c] hover:bg-[#eef6f1]"
                disabled={busy}
                onClick={exitRevisionPreview}
              >
                Exit preview
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-accent text-white hover:bg-accent-hover"
                disabled={busy}
                onClick={startRestore}
              >
                {busy ? "Restoring..." : "Restore"}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Restore this version?"
        message="The plan will be replaced with this version."
        confirmLabel="Restore"
        busyLabel="Restoring..."
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          if (busy) return;
          setBusy(true);
          void restoreRevisionPreview().finally(() => {
            setBusy(false);
            setConfirmOpen(false);
          });
        }}
      />
    </>
  );
}
