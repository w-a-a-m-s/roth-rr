"use client";

import { useSession } from "@/lib/auth/client";

/** Fixed banner while a superAdmin is viewing the app as another user. */
export function ImpersonationBanner() {
  const { data: session } = useSession();
  const imp = session?.impersonation;
  if (!imp?.active) return null;

  const targetLabel =
    session?.user?.email || session?.user?.name || session?.user?.id || "user";

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 bg-[#3d3428] px-4 py-2 text-[12.5px] text-[#f5f0e8]">
      <p className="min-w-0 truncate">
        Viewing as <span className="font-semibold">{targetLabel}</span>
        {imp.realEmail ? (
          <span className="text-[#c4b8a4]">
            {" "}
            (signed in as {imp.realEmail})
          </span>
        ) : null}
        . Edits are live. Sign out to return to your own account.
      </p>
    </div>
  );
}
