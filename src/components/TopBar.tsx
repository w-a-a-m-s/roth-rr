"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession, signOut } from "@/lib/auth/client";
import { LegalDocModal, type FooterModalId } from "@/lib/common/client";
import { PlanPicker } from "@/components/plan/PlanPicker";
import {
  ImpersonateMenuButton,
  ImpersonatePicker,
} from "@/components/ImpersonateMenu";
import { useMounted } from "@/lib/useMounted";
import { withBasePath } from "@/lib/basePath";
import { openFeedback } from "@/lib/openFeedback";
import { useScenario } from "@/store/useScenario";
import { useUI } from "@/store/useUI";

function MenuItem({
  onClick,
  children,
  className = "text-foreground",
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] font-semibold ${className}`}
    >
      {children}
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-1.5 my-1.5 h-px bg-border-subtle" />;
}

function UserSection({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    <div className="px-2.5 pb-2 pt-2.5">
      <div className="truncate text-[13.5px] font-bold text-foreground">
        {name || "Account"}
      </div>
      <div className="truncate text-[11.5px] text-muted-3">{email}</div>
    </div>
  );
}

function FeedbackMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <MenuItem onClick={onClick}>
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
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
      Feedback
    </MenuItem>
  );
}

function SignOutMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <MenuItem onClick={onClick} className="text-danger">
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
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      Sign out
    </MenuItem>
  );
}

function SignedInAccountMenu({
  name,
  email,
  onFeedback,
  onImpersonate,
  onSignOut,
}: {
  name?: string | null;
  email?: string | null;
  onFeedback: () => void;
  onImpersonate: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <UserSection name={name} email={email} />
      <MenuDivider />
      <FeedbackMenuItem onClick={onFeedback} />
      <MenuDivider />
      <ImpersonateMenuButton onClick={onImpersonate} />
      <SignOutMenuItem onClick={onSignOut} />
    </>
  );
}

export function TopBar() {
  const mounted = useMounted();

  const revisionPreview = useScenario((s) => s.revisionPreview);
  const openNewPlan = useUI((s) => s.openNewPlan);
  const openLoginModal = useUI((s) => s.openLoginModal);
  const openRegisterModal = useUI((s) => s.openRegisterModal);
  const { data: session, status } = useSession();

  const [pickerCloseNonce, setPickerCloseNonce] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [legalId, setLegalId] = useState<FooterModalId | null>(null);

  const accountRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen && !menuOpen) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (accountOpen && !accountRef.current?.contains(t)) setAccountOpen(false);
      if (menuOpen && !menuRef.current?.contains(t)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAccountOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen, menuOpen]);

  const logoSrc = withBasePath("/logo.png");
  const showDesktopControls = mounted && !revisionPreview;

  return (
    <header className="relative z-30 flex h-[54px] shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 lg:h-[58px] lg:gap-4 lg:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <a href={`/`} className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt="Roth RR"
            width={26}
            height={26}
            className="h-6 w-auto shrink-0 lg:h-[26px]"
          />
        </a>
        <span
          className="flex h-6 w-2 items-center justify-center lg:h-[26px]"
          aria-hidden
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-muted-3" />
        </span>
        <span className="whitespace-nowrap text-sm font-bold tracking-[-0.01em] text-foreground lg:text-[14.5px]">
          <span className="lg:hidden">Roth Calculator</span>
          <span className="hidden lg:inline">{"RR's Private Roth Calculator"}</span>
        </span>
      </div>

      {showDesktopControls ? (
        <div className="hidden items-center gap-2 lg:flex">
          {status === "authenticated" ? (
            <>
              <button
                type="button"
                onClick={openNewPlan}
                className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,#fff)] bg-[color-mix(in_srgb,var(--accent)_7%,#fff)] px-[11px] text-xs font-bold text-[color-mix(in_srgb,var(--accent)_60%,#000)]"
              >
                <span className="-mt-px text-sm leading-none">+</span> New plan
              </button>

              <PlanPicker
                closeNonce={pickerCloseNonce}
                onOpen={() => setAccountOpen(false)}
              />

              <span className="mx-0.5 hidden h-[22px] w-px bg-border sm:block" />
            </>
          ) : null}

          <div ref={accountRef} className="relative">
            {status === "loading" ? null : status === "authenticated" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen((v) => !v);
                    setPickerCloseNonce((n) => n + 1);
                  }}
                  className="flex h-11 items-center gap-2 rounded-[9px] border border-transparent py-0 pl-1 pr-2.5"
                >
                  <div className="flex max-w-[170px] flex-col items-end leading-[1.25]">
                    <span className="max-w-full truncate text-[13px] font-bold text-foreground">
                      {session?.user?.name || "Account"}
                    </span>
                    <span className="max-w-full truncate text-[11.5px] text-muted-3">
                      {session?.user?.email}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="#9b968c"
                    strokeWidth="2"
                    className="shrink-0"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {accountOpen ? (
                  <div className="absolute right-0 top-12 z-40 w-[240px] rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_30px_rgba(30,26,20,0.14)]">
                    <SignedInAccountMenu
                      name={session?.user?.name}
                      email={session?.user?.email}
                      onFeedback={() => {
                        setAccountOpen(false);
                        openFeedback();
                      }}
                      onImpersonate={() => {
                        setAccountOpen(false);
                        setImpersonateOpen(true);
                      }}
                      onSignOut={() => {
                        void signOut({ redirect: false }).then(() => {
                          window.location.replace("/");
                        });
                      }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openLoginModal()}
                  className="h-8 rounded-lg bg-accent px-3.5 text-[12.5px] font-bold text-white hover:bg-accent-hover"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => openRegisterModal()}
                  className="h-8 rounded-lg border border-border bg-white px-3.5 text-[12.5px] font-bold text-foreground hover:bg-card"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {mounted ? (
        <div ref={menuRef} className="relative lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            className="flex h-11 w-11 items-center justify-center rounded-[9px] border border-border-2 bg-white text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-[50px] z-40 w-[240px] rounded-[14px] border border-border bg-white p-2 shadow-[0_16px_36px_rgba(30,26,20,0.16)]">
              {status === "authenticated" ? (
                <SignedInAccountMenu
                  name={session?.user?.name}
                  email={session?.user?.email}
                  onFeedback={() => {
                    setMenuOpen(false);
                    openFeedback();
                  }}
                  onImpersonate={() => {
                    setMenuOpen(false);
                    setImpersonateOpen(true);
                  }}
                  onSignOut={() => {
                    void signOut({ redirect: false }).then(() => {
                      window.location.replace("/");
                    });
                  }}
                />
              ) : status === "unauthenticated" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openLoginModal();
                    }}
                    className="mb-1.5 h-10 w-full rounded-lg border-0 bg-accent text-[13.5px] font-bold text-white"
                  >
                    Sign in
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {legalId ? (
        <LegalDocModal id={legalId} onClose={() => setLegalId(null)} />
      ) : null}

      <ImpersonatePicker
        open={impersonateOpen}
        onClose={() => setImpersonateOpen(false)}
      />
    </header>
  );
}
