"use client";

import { useState } from "react";
import {
  parseDisplayName,
  useSession,
  USER_NAME_MAX_LENGTH,
} from "@/lib/auth/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/inputs";
import { withBasePath } from "@/lib/basePath";

type ProfileNameModalProps = {
  /** Called after the name is saved so the parent can hide this gate. */
  onSaved: (name: string) => void;
};

/**
 * Forced prompt when the signed-in account has no real display name
 * (typical for magic-link signups).
 */
export function ProfileNameModal({ onSaved }: ProfileNameModalProps) {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user?.email ?? null;
  const local = parseDisplayName(name, email);
  const canSubmit = local.ok && !saving;

  const submit = async () => {
    const parsed = parseDisplayName(name, email);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.name }),
      });
      if (res.status === 401) {
        setError("Sign in to continue.");
        return;
      }
      if (!res.ok) {
        let detail = "Could not save your name. Try again.";
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data.error === "string" && data.error.trim()) {
            detail = data.error;
          }
        } catch {
          // keep default
        }
        setError(detail);
        return;
      }
      // Refetch session so TopBar sees the name.
      await update();
      onSaved(parsed.name);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {}}
      title="What's your name?"
      size="sm"
      closeOnBackdrop={false}
      showCloseButton={false}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="mb-4 text-sm text-muted-2">
          We&apos;ll use this on your account and when you share plans.
        </p>
        <Field label="Your name">
          <TextInput
            value={name}
            onChange={(value) => {
              setName(value.slice(0, USER_NAME_MAX_LENGTH));
              setError(null);
            }}
            placeholder="e.g. Alex Garcia"
            autoFocus
          />
        </Field>
        {error ? (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
