"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/inputs";
import { useUI } from "@/store/useUI";
import { useScenario } from "@/store/useScenario";
import { isPlanNameTaken } from "@/lib/planName";

type NameModalMode = "new" | "firstRun" | "duplicate";

/**
 * Name a plan before create / first-run wizard, or before duplicating.
 * In firstRun (no-plan) mode the modal cannot be dismissed.
 */
export function PlanNameModal() {
  const nameModal = useUI((s) => s.nameModal);
  if (!nameModal.open) return null;
  return <PlanNameModalBody mode={nameModal.mode} />;
}

function PlanNameModalBody({ mode }: { mode: NameModalMode }) {
  const confirmPlanName = useUI((s) => s.confirmPlanName);
  const cancelNameModal = useUI((s) => s.cancelNameModal);
  const configs = useScenario((s) => s.configs);
  const activeId = useScenario((s) => s.activeId);
  const forced = mode === "firstRun";
  const isDuplicate = mode === "duplicate";

  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // firstRun renames the existing blank plan; new/duplicate create a separate plan.
  const excludeId = mode === "firstRun" ? activeId : undefined;
  const trimmed = name.trim();
  const empty = trimmed.length === 0;
  const taken = isPlanNameTaken(configs, trimmed, excludeId);
  const canSubmit = !empty && !taken;

  const submit = () => {
    setSubmitted(true);
    if (!canSubmit) return;
    confirmPlanName(trimmed);
  };

  const title = forced
    ? "Create your first plan"
    : isDuplicate
      ? "Duplicate plan"
      : "Name your plan";
  const hint = isDuplicate
    ? "Enter a unique name for the copy."
    : forced
      ? undefined
      : "Give this plan a name to start.";
  const emptyError = isDuplicate
    ? "Enter a name for the copy."
    : "Enter a plan name to continue.";
  const submitLabel = isDuplicate ? "Duplicate" : "Continue";

  return (
    <Modal
      open
      onClose={forced ? () => {} : cancelNameModal}
      title={title}
      size="sm"
      closeOnBackdrop={!forced}
      showCloseButton={!forced}
      footer={
        <div className="flex justify-end gap-2">
          {forced ? null : (
            <Button variant="secondary" onClick={cancelNameModal}>
              Cancel
            </Button>
          )}
          <Button onClick={submit} disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {forced ? (
          <p className="mb-4 text-sm text-muted-2">
            Give this plan a name to get started.
          </p>
        ) : null}
        <Field label="Plan name" hint={hint}>
          <TextInput
            value={name}
            onChange={(value) => {
              setName(value);
              setSubmitted(false);
            }}
            placeholder="e.g. Garcia family"
            autoFocus
          />
        </Field>
        {taken ? (
          <p className="mt-2 text-xs text-danger" role="alert">
            You already have a plan with this name. Choose a different one.
          </p>
        ) : null}
        {submitted && empty ? (
          <p className="mt-2 text-xs text-danger" role="alert">
            {emptyError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
