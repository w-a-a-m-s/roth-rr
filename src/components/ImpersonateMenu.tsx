"use client";

import { useSession } from "@/lib/auth/client";
import { useEffect, useMemo, useState } from "react";
import {
  fetchImpersonationUsers,
  startImpersonation,
  type ImpersonationUser,
} from "@/lib/impersonate";
import { Modal } from "@/components/ui/Modal";
import { LabsLoading } from "@/lib/common/client";

/** Account-menu entry (only when the real user is a superAdmin). */
export function ImpersonateMenuButton({ onClick }: { onClick: () => void }) {
  const { data: session } = useSession();
  const canImpersonate =
    Boolean(session?.user?.superAdmin) && !session?.impersonation?.active;
  if (!canImpersonate) return null;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] font-semibold text-foreground"
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="8" cy="8.5" r="3" />
        <path d="M3 18c0-2.4 2.2-4 5-4s5 1.6 5 4" />
        <circle cx="16.5" cy="9" r="2.3" />
        <path d="M21 18c0-2-1.7-3.4-4-3.8" />
      </svg>
      View as user…
    </button>
  );
}

/** Picker modal: keep mounted outside the account dropdown. */
export function ImpersonatePicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const canImpersonate =
    Boolean(session?.user?.superAdmin) && !session?.impersonation?.active;
  if (!canImpersonate) return null;

  return (
    <Modal open={open} onClose={onClose} title="View as user" size="md">
      {/* Remount per open so list/query/error state starts fresh. */}
      {open ? <PickerBody onClose={onClose} /> : null}
    </Modal>
  );
}

function PickerBody({ onClose }: { onClose: () => void }) {
  const { update } = useSession();
  const [users, setUsers] = useState<ImpersonationUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loading = users === null && !error;

  useEffect(() => {
    let cancelled = false;
    void fetchImpersonationUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load users");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!users) return [];
    if (!q) return users;
    return users.filter((u) => {
      const email = (u.email ?? "").toLowerCase();
      const name = (u.name ?? "").toLowerCase();
      return email.includes(q) || name.includes(q);
    });
  }, [users, query]);

  const pick = async (userId: string) => {
    if (busyId) return;
    setBusyId(userId);
    setError(null);
    try {
      await startImpersonation(userId);
      await update();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to impersonate");
      setBusyId(null);
    }
  };

  return (
    <>
      <p className="mb-3 text-[13px] text-muted-2">
        Act as that user, with full edit access to their plans. Sign out to
        return to your own account.
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by name or email"
        className="mb-3 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent"
        autoFocus
      />
      {error ? (
        <p className="mb-2 text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <li className="flex justify-center px-3 py-6">
            <LabsLoading size="sm" />
          </li>
        ) : filtered.length === 0 ? (
          <li className="px-3 py-4 text-[13px] text-muted-3">No users found</li>
        ) : (
          filtered.map((u) => (
            <li key={u.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void pick(u.id)}
                className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-card disabled:opacity-50"
              >
                <span className="text-[13px] font-semibold text-foreground">
                  {u.name || u.email || u.id}
                </span>
                {u.email && u.name ? (
                  <span className="text-[11.5px] text-muted-3">{u.email}</span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
