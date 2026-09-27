"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select, TextInput } from "@/components/ui/inputs";
import {
  PLAN_ROLES,
  ROLE_LABELS,
  type PlanMemberView,
  type PlanRole,
} from "@/lib/sharing";
import { withBasePath } from "@/lib/basePath";
import { LabsLoading } from "@/lib/common/client";

const roleOptions = PLAN_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** Identify a member/invite for PATCH/DELETE: by userId, or by email if pending. */
function targetOf(m: PlanMemberView): { userId?: string; email?: string } {
  return m.userId ? { userId: m.userId } : { email: m.email ?? "" };
}

function displayName(m: PlanMemberView): string {
  if (m.name && m.email) return `${m.name} (${m.email})`;
  return m.name ?? m.email ?? "Unknown user";
}

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes("@") && trimmed.includes(".");
}

function memberKey(m: PlanMemberView): string {
  return m.userId ?? `invite:${m.email ?? ""}`;
}

export function ShareDialog({
  planId,
  planName,
  open,
  onClose,
  onShareCountChange,
}: {
  planId: string;
  planName: string;
  open: boolean;
  onClose: () => void;
  onShareCountChange?: (shareCount: number) => void;
}) {
  const [members, setMembers] = useState<PlanMemberView[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PlanRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<"exists" | "invite" | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  // Keep the parent callback out of refresh deps so updating shareCount does
  // not remount-fetch and race optimistic member removals.
  const onShareCountChangeRef = useRef(onShareCountChange);
  useEffect(() => {
    onShareCountChangeRef.current = onShareCountChange;
  }, [onShareCountChange]);

  // The `await` is the first statement so the mount effect never triggers a
  // synchronous setState (cascading-render lint rule).
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        withBasePath(`/api/plans/${encodeURIComponent(planId)}/members`),
      );
      if (!res.ok) {
        setMembers([]);
        return;
      }
      const { members } = (await res.json()) as { members: PlanMemberView[] };
      setMembers(members);
      onShareCountChangeRef.current?.(members.length);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  // Mounted fresh each time the dialog opens, so we only need to load the
  // current members on mount. setState stays inside the async callback (never
  // synchronous in the effect body) per the cascading-render lint rule.
  useEffect(() => {
    let ignore = false;
    void (async () => {
      if (!ignore) await refresh();
    })();
    return () => {
      ignore = true;
    };
  }, [refresh]);

  useEffect(() => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) return;
    let ignore = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            withBasePath(
              `/api/plans/${encodeURIComponent(planId)}/members?lookup=${encodeURIComponent(trimmed)}`,
            ),
          );
          if (!res.ok || ignore) {
            if (!ignore) setEmailHint(null);
            return;
          }
          const data = (await res.json()) as { status?: "exists" | "invite" };
          if (ignore) return;
          if (data.status === "exists" || data.status === "invite") {
            setEmailHint(data.status);
          } else {
            setEmailHint(null);
          }
        } catch {
          if (!ignore) setEmailHint(null);
        }
      })();
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [email, planId]);

  const showEmailHint =
    isValidEmail(email) && emailHint != null ? emailHint : null;

  const addMember = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        withBasePath(`/api/plans/${encodeURIComponent(planId)}/members`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed, role }),
        },
      );
      if (res.status === 409) {
        setError("That person is already on this plan.");
        return;
      }
      if (res.status === 403) {
        setError("Only admins can share this plan.");
        return;
      }
      if (!res.ok) {
        setError("Enter a valid email address.");
        return;
      }
      setEmail("");
      setEmailHint(null);
      await refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m: PlanMemberView, next: PlanRole) => {
    setMembers((prev) =>
      prev.map((x) => (x === m ? { ...x, role: next } : x)),
    );
    await fetch(
      withBasePath(`/api/plans/${encodeURIComponent(planId)}/members`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...targetOf(m), role: next }),
      },
    ).catch(() => {});
  };

  const remove = async (m: PlanMemberView) => {
    const key = memberKey(m);
    const previous = members;
    const next = previous.filter((x) => memberKey(x) !== key);
    setMembers(next);
    setError(null);
    try {
      const res = await fetch(
        withBasePath(`/api/plans/${encodeURIComponent(planId)}/members`),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(targetOf(m)),
        },
      );
      if (!res.ok) {
        setMembers(previous);
        setError("Could not remove that person. Try again.");
        return;
      }
      onShareCountChangeRef.current?.(next.length);
    } catch {
      setMembers(previous);
      setError("Could not remove that person. Try again.");
    }
  };

  const resend = async (m: PlanMemberView) => {
    if (!m.email) return;
    setResending(m.email);
    setError(null);
    try {
      const res = await fetch(
        withBasePath(`/api/plans/${encodeURIComponent(planId)}/members`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: m.email, resend: true }),
        },
      );
      if (!res.ok) {
        setError("Could not resend the invitation. Try again.");
      }
    } catch {
      setError("Could not resend the invitation. Try again.");
    } finally {
      setResending(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Share "${planName}"`}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="relative">
        {busy ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/85">
            <LabsLoading size="md" />
          </div>
        ) : null}
      <p className="mb-3 text-sm text-slate-600">
        Share by email. Admins can manage access; editors can edit the plan;
        viewers can only view results.
      </p>

      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 flex items-baseline justify-between gap-2 text-xs font-medium text-slate-500">
            <span>Email</span>
            {showEmailHint === "exists" ? (
              <span className="font-normal text-emerald-700">
                Account found - they will get access immediately.
              </span>
            ) : null}
            {showEmailHint === "invite" ? (
              <span className="font-normal text-amber-700">
                No account yet - we will send an invitation email.
              </span>
            ) : null}
          </label>
          <TextInput
            value={email}
            onChange={(v) => {
              setEmail(v);
              setEmailHint(null);
            }}
            placeholder="name@example.com"
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Role
          </label>
          <Select value={role} onChange={setRole} options={roleOptions} />
        </div>
        <Button
          onClick={addMember}
          disabled={busy || !email.trim()}
          className="h-[34px] shrink-0 !py-0"
        >
          Share
        </Button>
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {loading && members.length === 0 ? (
          <div className="flex justify-center px-3 py-8">
            <LabsLoading size="md" />
          </div>
        ) : members.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-400">No one yet.</p>
        ) : (
          members.map((m) => (
            <div
              key={m.userId ?? `invite:${m.email}`}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800">
                  {displayName(m)}
                  {m.isSelf ? (
                    <span className="ml-1 text-xs text-slate-400">(you)</span>
                  ) : null}
                </p>
                {m.pending ? (
                  <p className="text-xs text-amber-600">
                    Invited - waiting for them to join
                  </p>
                ) : m.isOwner ? (
                  <p className="text-xs text-slate-400">Owner</p>
                ) : (
                  <p className="text-xs text-slate-400">Active</p>
                )}
              </div>
              {m.pending ? (
                <div className="flex shrink-0 items-center gap-2">
                  {resending === m.email ? <LabsLoading size="sm" /> : null}
                  <button
                    type="button"
                    onClick={() => void resend(m)}
                    disabled={resending === m.email}
                    className="rounded-md px-2 py-1.5 text-xs font-semibold text-accent hover:bg-slate-50 disabled:opacity-50"
                  >
                    {resending === m.email ? "Sending..." : "Resend"}
                  </button>
                </div>
              ) : null}
              <div className="w-32 shrink-0">
                <Select
                  value={m.role}
                  onChange={(next) => changeRole(m, next)}
                  options={roleOptions}
                  disabled={m.isOwner}
                />
              </div>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => void remove(m)}
                disabled={m.isOwner}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
      </div>
    </Modal>
  );
}
