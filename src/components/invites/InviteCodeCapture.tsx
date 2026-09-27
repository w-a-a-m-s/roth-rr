"use client";

import {
  AUTH_INVITE_COOKIE,
  INVITE_QUERY_KEY,
} from "@/lib/auth/client";
import { getSupportEmail } from "@/lib/common/email";
import { useEffect, useState } from "react";
import { beginInviteGuestSession } from "@/lib/inviteCookie";
import { withBasePath } from "@/lib/basePath";
import { Modal } from "@/components/ui/Modal";
import { useUI } from "@/store/useUI";
import { useScenario } from "@/store/useScenario";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;
const SUPPORT_EMAIL = getSupportEmail();

function setInviteCookie(code: string) {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${AUTH_INVITE_COOKIE}=${encodeURIComponent(
    code
  )}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

type InviteLookup = {
  usable: boolean;
  status: string;
  source: string;
  email: string | null;
};

/**
 * Capture `?invite=` (lookup status; guest plan only if usable).
 */
export function InviteCodeCapture() {
  const openCreateAccountModal = useUI((s) => s.openCreateAccountModal);
  const [invalidOpen, setInvalidOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get(INVITE_QUERY_KEY)?.trim();
    if (!code) return;

    url.searchParams.delete(INVITE_QUERY_KEY);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);

    void (async () => {
      try {
        const res = await fetch(
          `${withBasePath("/api/invite-lookup")}?code=${encodeURIComponent(
            code
          )}`
        );
        if (!res.ok) {
          setInvalidOpen(true);
          return;
        }
        const data = (await res.json()) as InviteLookup;
        if (data.usable) {
          setInviteCookie(code);
          // A plan-share invite points at an existing shared plan, not a new
          // one. Skip the guest first-run wizard and send them straight to
          // sign in / create an account so the share attaches to their account.
          if (data.source === "plan_share") {
            openCreateAccountModal(data.email);
            return;
          }
          beginInviteGuestSession();
          const { auth, setAuth } = useScenario.getState();
          if (auth.status === "anonymous" || auth.status === "loading") {
            setAuth("anonymous", null);
          }
          return;
        }
        setInvalidOpen(true);
      } catch {
        setInvalidOpen(true);
      }
    })();
  }, [openCreateAccountModal]);

  return (
    <Modal
      open={invalidOpen}
      onClose={() => {
        setInvalidOpen(false);
        window.location.replace("/");
      }}
      title="Invite not found"
      size="sm"
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-[#F3EEE4] px-3 py-2.5 text-[15px] leading-[1.55] text-[#5c564c]">
          That invite link doesn&apos;t look valid. Double-check the link. Or
          send us an email to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <button
          type="button"
          className="h-9 self-start rounded-lg bg-accent px-3.5 text-[12.5px] font-bold text-white hover:bg-accent-hover"
          onClick={() => {
            setInvalidOpen(false);
            window.location.replace("/");
          }}
        >
          Go to home
        </button>
      </div>
    </Modal>
  );
}
