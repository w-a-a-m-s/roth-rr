"use client";

import type { ReactNode } from "react";
import { LabsLoading } from "@/lib/common/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  busyLabel = "Working...",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Disables actions; confirm shows `busyLabel`, LabsLoading sits beside it. */
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      size="sm"
      closeOnBackdrop={!busy}
      showCloseButton={!busy}
      footer={
        <div className="flex items-center justify-end gap-3">
          {busy ? <LabsLoading size="sm" /> : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={busy}
              className={
                danger
                  ? "bg-danger text-white hover:bg-danger focus-visible:ring-danger/30"
                  : undefined
              }
            >
              {busy ? busyLabel : confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <p className="text-sm text-muted-2">{message}</p>
    </Modal>
  );
}
