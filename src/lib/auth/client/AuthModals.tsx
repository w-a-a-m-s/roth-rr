"use client";

import {
  LabsLoading,
  modalBackdropClass,
  modalDialogClass,
  useCloseTransition,
} from "@/lib/common/client";
import { type EntrySurface } from "@/lib/common/analytics";
import { signIn } from "./session";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AUTH_ENTRY_COOKIE, AUTH_TOOL_COOKIE } from "../shared/constants";
import { currentCallbackUrl } from "./urls";

const AuthOverlayCloseContext = createContext<(() => void) | null>(null);

/**
 * Auth modal screens:
 * - login: simple sign-in
 * - register: open signup (Google / magic link)
 * - createAccount: Google / magic link after a plan-share invite
 * - thanks: post-registration welcome (optional)
 */
export type AuthModalKind =
  | "login"
  | "register"
  | "createAccount"
  | "thanks"
  | "signIn" // legacy alias → login
  | null;

export type AuthModalsProps = {
  modal: AuthModalKind;
  onClose: () => void;
  toolId?: string;
  callbackUrl?: string;
  /**
   * Where register (new account) should land after Google / magic-link.
   * Login keeps `callbackUrl` (usually the current page).
   */
  registerCallbackUrl?: string;
  logoSrc?: string;
  logoAlt?: string;
  onContinue?: () => void;
  onOpenLegal?: (doc: "terms" | "privacy" | "disclaimer") => void;
  busyIndicator?: ReactNode;
  accessCheckUrl?: string;
  /** Prefill when opening createAccount / register. */
  seedEmail?: string | null;
  /** Where this modal was opened. Defaults to website_home. */
  entrySurface?: EntrySurface;
  /** Notify parent when internal screen changes (for URL/state sync). */
  onKindChange?: (kind: Exclude<AuthModalKind, null>, email?: string) => void;
};

type Lookup = {
  userExists: boolean;
  invited: boolean;
};

function setToolCookie(toolId: string) {
  const maxAge = 60 * 10;
  document.cookie = `${AUTH_TOOL_COOKIE}=${encodeURIComponent(
    toolId
  )}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function setEntryCookie(surface: EntrySurface) {
  const maxAge = 60 * 60 * 24 * 7;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${AUTH_ENTRY_COOKIE}=${encodeURIComponent(
    surface
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function resolveCallbackUrl(explicit?: string): string {
  if (explicit) return explicit;
  return currentCallbackUrl("/");
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.48a5.54 5.54 0 0 1-2.4 3.63v3h3.89c2.28-2.1 3.55-5.2 3.55-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.89-3a7.15 7.15 0 0 1-10.62-3.76H1.44v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.44 14.32a7.2 7.2 0 0 1 0-4.64V6.59H1.44a12 12 0 0 0 0 10.82l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.44 6.59l4 3.09A7.16 7.16 0 0 1 12 4.75z"
      />
    </svg>
  );
}

function Overlay({
  children,
  onClose,
  labelledBy,
  closeDisabled = false,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  closeDisabled?: boolean;
}) {
  const { phase, requestClose, exiting } = useCloseTransition(onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (exiting || closeDisabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, exiting, closeDisabled]);

  return (
    <AuthOverlayCloseContext.Provider value={requestClose}>
      <div
        className={`${modalBackdropClass(
          phase
        )} fixed inset-0 z-100 flex items-center justify-center bg-[rgba(26,25,21,0.22)] p-6 backdrop-blur-sm${
          exiting ? " pointer-events-none" : ""
        }`}
        role="presentation"
        onMouseDown={(event) => {
          if (exiting || closeDisabled) return;
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className={`${modalDialogClass(
            phase
          )} relative w-full max-w-[400px] overflow-hidden rounded-[20px] bg-white text-foreground shadow-[0_30px_70px_rgba(26,25,21,0.3)]`}
        >
          {children}
        </div>
      </div>
    </AuthOverlayCloseContext.Provider>
  );
}

function CloseButton() {
  const requestClose = useContext(AuthOverlayCloseContext);
  return (
    <button
      type="button"
      onClick={() => requestClose?.()}
      aria-label="Close"
      className="absolute top-[18px] right-[18px] z-20 flex h-[30px] w-[30px] items-center justify-center rounded-lg border-0 bg-[#F2F0EA] text-muted"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function LegalCheckbox({
  checked,
  onChange,
  id,
  onOpenLegal,
  attention = false,
}: {
  checked: boolean;
  onChange: () => void;
  id: string;
  onOpenLegal?: (doc: "terms" | "privacy" | "disclaimer") => void;
  attention?: boolean;
}) {
  const link = (label: string, doc: "terms" | "privacy" | "disclaimer") => (
    <button
      type="button"
      className="border-0 bg-transparent p-0 font-inherit text-accent hover:text-accent-hover"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenLegal?.(doc);
      }}
    >
      {label}
    </button>
  );

  return (
    <label
      htmlFor={id}
      className={`-mx-1 flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 transition-colors ${
        attention ? "bg-[#FDECEC]" : ""
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
          attention ? "border-[#C45C5C] accent-[#C45C5C]" : "border-border-2"
        }`}
      />
      <span
        className={`text-xs leading-[1.5] ${
          attention ? "font-medium text-[#8B2E2E]" : "text-muted"
        }`}
      >
        I agree to the {link("Terms of Use", "terms")},{" "}
        {link("Privacy Policy", "privacy")}, and{" "}
        {link("Disclaimer", "disclaimer")}
      </span>
    </label>
  );
}

function Header({
  logoSrc,
  logoAlt,
  titleId,
  title,
  subtitle,
}: {
  logoSrc: string;
  logoAlt: string;
  titleId: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="px-[30px] pt-[30px] pb-2 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt={logoAlt}
        width={184}
        height={32}
        className="mx-auto mb-4 h-8 w-auto"
      />
      <h2 id={titleId} className="mb-1 font-serif text-2xl font-medium">
        {title}
      </h2>
      {subtitle ? <p className="text-[13px] text-muted-3">{subtitle}</p> : null}
    </div>
  );
}

function normalizeKind(
  kind: AuthModalKind
): Exclude<AuthModalKind, null> | null {
  if (kind == null) return null;
  if (kind === "signIn") return "login";
  return kind;
}

export function AuthModals({
  modal,
  onClose,
  toolId = "roth",
  callbackUrl,
  registerCallbackUrl,
  logoSrc = "/logo.png",
  logoAlt = "Roth RR",
  onContinue,
  onOpenLegal,
  busyIndicator,
  accessCheckUrl = "/api/access-check",
  seedEmail = null,
  entrySurface = "website_home",
  onKindChange,
}: AuthModalsProps) {
  const titleId = useId();
  const thanksTitleId = useId();
  const tosId = useId();
  const emailId = useId();

  const [kind, setKind] = useState<Exclude<AuthModalKind, null> | null>(
    normalizeKind(modal)
  );
  const [email, setEmail] = useState(seedEmail?.trim() ?? "");
  const [tos, setTos] = useState(false);
  const [emailStep, setEmailStep] = useState(false);
  // Lock the register email when it was confirmed against a plan-share invite.
  const [emailLocked, setEmailLocked] = useState(Boolean(seedEmail?.trim()));
  const [magicSent, setMagicSent] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tosAttention, setTosAttention] = useState(false);
  const busy = oauthBusy || sending || checking;
  const surface: EntrySurface =
    kind === "createAccount" ? "plan_share" : entrySurface;
  const startedKind = useRef<typeof kind>(null);

  useEffect(() => {
    if (kind == null || kind === "thanks") {
      startedKind.current = kind;
      return;
    }
    if (startedKind.current === kind) return;
    startedKind.current = kind;
    setEntryCookie(surface);
  }, [kind, surface]);

  const prevModalRef = useRef<AuthModalKind>(modal);

  const go = (
    next: Exclude<AuthModalKind, null>,
    nextEmail?: string,
    opts?: { emailStep?: boolean }
  ) => {
    const resolvedEmail =
      nextEmail != null ? nextEmail.trim() : email.trim() || undefined;
    setKind(next);
    if (nextEmail != null) setEmail(nextEmail.trim());
    if (next === "createAccount") setEmailLocked(Boolean(resolvedEmail));
    setError(null);
    setMagicSent(false);
    setEmailStep(opts?.emailStep ?? false);
    onKindChange?.(next, resolvedEmail);
  };

  useEffect(() => {
    const next = normalizeKind(modal);
    const prev = normalizeKind(prevModalRef.current);
    prevModalRef.current = modal;

    setKind(next);
    if (next == null) {
      setMagicSent(false);
      setSentOnce(false);
      setEmailStep(false);
      setError(null);
      setSending(false);
      setChecking(false);
      setOauthBusy(false);
      setTosAttention(false);
      return;
    }

    // Fresh open from closed: start at Google / email. Do not reset when the
    // parent echoes a kind/email change from `go()` mid-flow, or a send that
    // just succeeded gets wiped back to the choice step.
    if (prev == null) {
      setEmailStep(false);
      setMagicSent(false);
      setSentOnce(false);
    }

    if (seedEmail?.trim()) {
      setEmail(seedEmail.trim());
      if (next === "createAccount") setEmailLocked(true);
    }
  }, [modal, seedEmail]);

  const requireTos = (): boolean => {
    if (tos) {
      setTosAttention(false);
      return true;
    }
    setTosAttention(true);
    setError("Please read and make sure you agree to our Terms first.");
    return false;
  };

  const lookup = async (address: string): Promise<Lookup | null> => {
    const res = await fetch(
      `${accessCheckUrl}?email=${encodeURIComponent(address.trim())}`
    );
    if (!res.ok) return null;
    return (await res.json()) as Lookup;
  };

  const signInCallback = (forKind = kind) => {
    if (forKind === "register" && registerCallbackUrl) {
      return registerCallbackUrl;
    }
    return resolveCallbackUrl(callbackUrl);
  };

  const sendMagicLink = async (
    address: string,
    forKind: Exclude<AuthModalKind, null> | null = kind
  ) => {
    const sendSurface: EntrySurface =
      forKind === "createAccount" ? "plan_share" : entrySurface;
    setToolCookie(toolId);
    setEntryCookie(sendSurface);
    const cb = signInCallback(forKind);
    setSending(true);
    try {
      const res = await signIn("nodemailer", {
        email: address,
        redirect: false,
        callbackUrl: cb,
      });
      if (res?.error) {
        setError(
          "Hmm, we couldn't send that link. Double-check the address and try again?"
        );
        return;
      }
      setSentOnce(true);
      setMagicSent(true);
    } catch {
      setError("Oops, something went sideways. Mind trying again?");
    } finally {
      setSending(false);
    }
  };

  const startGoogle = async () => {
    setError(null);
    if (!requireTos()) return;
    setToolCookie(toolId);
    setEntryCookie(surface);
    const cb = signInCallback();
    setOauthBusy(true);
    try {
      await signIn("google", { callbackUrl: cb });
    } catch {
      setOauthBusy(false);
      setError("Oops, something went sideways. Mind trying again?");
    }
  };

  const enterEmailStep = () => {
    setError(null);
    if (!requireTos()) return;
    setEmailStep(true);
  };

  /** Login email step: existing account → magic link; else register. */
  const onLoginMagicLink = async (address: string) => {
    setError(null);
    const trimmed = address.trim();
    if (trimmed.length < 3 || !trimmed.includes("@")) {
      setError("That email doesn't look quite right.");
      return;
    }
    setChecking(true);
    try {
      const data = await lookup(trimmed);
      if (!data) {
        setError("We couldn't check that email just now. Try again in a sec?");
        return;
      }
      if (data.userExists) {
        await sendMagicLink(trimmed);
        return;
      }
      if (data.invited) {
        go("createAccount", trimmed, { emailStep: true });
        await sendMagicLink(trimmed, "createAccount");
        return;
      }
      go("register", trimmed, { emailStep: true });
      await sendMagicLink(trimmed, "register");
    } catch {
      setError("Oops, something went sideways. Mind trying again?");
    } finally {
      setChecking(false);
    }
  };

  /** Register / create-account magic link. Existing users go to login. */
  const onRegisterMagicLink = async () => {
    setError(null);
    const trimmed = email.trim();
    if (trimmed.length < 3 || !trimmed.includes("@")) {
      setError("That email doesn't look quite right.");
      return;
    }
    setChecking(true);
    try {
      const data = await lookup(trimmed);
      if (data?.userExists) {
        go("login", trimmed, { emailStep: true });
        setError("Looks like you already have an account. Log in instead?");
        return;
      }
      await sendMagicLink(trimmed);
    } finally {
      setChecking(false);
    }
  };

  if (kind == null) return null;

  if (kind === "thanks") {
    return (
      <div
        className="fixed inset-0 z-100 flex items-center justify-center bg-[rgba(26,25,21,0.22)] p-6 backdrop-blur-sm"
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={thanksTitleId}
          className="w-full max-w-[420px] rounded-[20px] bg-white px-8 py-[34px] text-center text-foreground shadow-[0_30px_70px_rgba(26,25,21,0.3)]"
        >
          <h2
            id={thanksTitleId}
            className="mb-2.5 font-serif text-[23px] font-medium"
          >
            You&apos;re in. Welcome!
          </h2>
          <p className="mb-6 text-[14.5px] leading-[1.6] text-muted">
            We&apos;d genuinely love to hear from you as you use it: the good,
            the confusing, the missing. Look for the feedback button any time.
          </p>
          <button
            type="button"
            onClick={onContinue}
            className="h-12 cursor-pointer rounded-[10px] border-0 bg-accent px-[26px] text-[14.5px] font-bold text-white hover:bg-accent-hover"
          >
            Let&apos;s continue
          </button>
        </div>
      </div>
    );
  }

  const resendMagicLink = () => {
    if (kind === "login") void onLoginMagicLink(email);
    else void onRegisterMagicLink();
  };

  const magicSentBlock = (
    <div className="flex flex-col items-center gap-3.5 px-1 py-3.5 text-center">
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#EAF3EC] text-[#1C8A5B]">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <p className="text-[13px] text-muted-2">
          Link on its way to <strong>{email}</strong>. Pop into your inbox and
          you&apos;re set.
        </p>
      </div>
      <div className="flex w-full items-center gap-2.5">
        {checking || sending ? <LabsLoading size="sm" /> : null}
        <button
          type="button"
          disabled={busy}
          onClick={resendMagicLink}
          className="h-12 flex-1 cursor-pointer rounded-[10px] border border-border-2 bg-white text-sm font-bold text-foreground hover:bg-[#f7f6f3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking || sending ? "Sending..." : "Send the link again"}
        </button>
      </div>
      {error ? <p className="px-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );

  const choiceStep = (
    <div className="flex flex-col gap-3.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void startGoogle()}
        className="flex h-12 cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-border-2 bg-white text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={enterEmailStep}
        className="h-12 cursor-pointer rounded-[10px] border-0 bg-accent text-sm font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue with email
      </button>
      <div className="border-t border-[#EDEAE2] pt-3.5">
        <LegalCheckbox
          id={tosId}
          checked={tos}
          attention={tosAttention && !tos}
          onChange={() => {
            setTos((v) => !v);
            setTosAttention(false);
            setError(null);
          }}
          onOpenLegal={onOpenLegal}
        />
        {error ? (
          <p className="mt-1.5 px-1 text-xs text-red-600">{error}</p>
        ) : null}
      </div>
    </div>
  );

  const emailMagicStep = (mode: "login" | "register") => (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (mode === "login") void onLoginMagicLink(email);
        else void onRegisterMagicLink();
      }}
    >
      <p className="text-[15px] leading-[1.55] text-muted-2">
        {sentOnce
          ? "Didn't get it? We can send another link to this address."
          : "We'll email you a link. Click it, and you're in. That's the whole thing."}
      </p>
      <label htmlFor={emailId} className="sr-only">
        Email
      </label>
      <input
        id={emailId}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        autoFocus={mode === "login" || (mode === "register" && !emailLocked)}
        readOnly={mode === "register" && emailLocked}
        className="h-[46px] rounded-[10px] border border-border-2 bg-[#FDFCFA] px-3.5 text-sm outline-none focus:border-accent read-only:bg-[#F3EEE4]"
      />
      <div className="flex items-center gap-2.5">
        {checking || sending ? <LabsLoading size="sm" /> : null}
        <button
          type="submit"
          disabled={busy}
          className="h-12 flex-1 cursor-pointer rounded-[10px] border-0 bg-accent text-sm font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking || sending
            ? "Sending..."
            : sentOnce
            ? "Send the link again"
            : mode === "register"
            ? "Send me a magic registration link"
            : "Send me a magic login link"}
        </button>
      </div>
      {error ? <p className="px-1 text-xs text-red-600">{error}</p> : null}
    </form>
  );

  const loginBody = () => {
    if (magicSent) return magicSentBlock;
    if (emailStep) return emailMagicStep("login");
    return choiceStep;
  };

  const registerBody = () => {
    if (magicSent) return magicSentBlock;
    if (emailStep) return emailMagicStep("register");
    return choiceStep;
  };

  const createAccountBody = () => {
    if (magicSent) return magicSentBlock;
    if (emailStep) return emailMagicStep("register");
    return (
      <>
        <p className="rounded-lg bg-[#F3EEE4] px-3 py-2.5 text-[12.5px] text-[#5c564c]">
          {email ? (
            <>
              You&apos;ve been invited: <strong>{email}</strong>
            </>
          ) : (
            "You've been invited to a plan. Let's get your account set up."
          )}
        </p>
        {choiceStep}
      </>
    );
  };

  return (
    <Overlay onClose={onClose} labelledBy={titleId} closeDisabled={busy}>
      {busy ? null : <CloseButton />}
      {busy && busyIndicator ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
          {busyIndicator}
        </div>
      ) : null}

      {kind === "login" ? (
        <>
          <Header
            logoSrc={logoSrc}
            logoAlt={logoAlt}
            titleId={titleId}
            title="Log in"
            subtitle="Good to see you again."
          />
          <div className="flex flex-col gap-3.5 px-[30px] pt-5 pb-[30px]">
            {loginBody()}
          </div>
        </>
      ) : null}

      {kind === "register" ? (
        <>
          <Header
            logoSrc={logoSrc}
            logoAlt={logoAlt}
            titleId={titleId}
            title="Create an account"
            subtitle="Takes a minute."
          />
          <div className="flex flex-col gap-3.5 px-[30px] pt-5 pb-[30px]">
            {registerBody()}
          </div>
        </>
      ) : null}

      {kind === "createAccount" ? (
        <>
          <Header
            logoSrc={logoSrc}
            logoAlt={logoAlt}
            titleId={titleId}
            title="You're invited"
            subtitle="Let's get your account set up."
          />
          <div className="flex flex-col gap-3.5 px-[30px] pt-5 pb-[30px]">
            {createAccountBody()}
          </div>
        </>
      ) : null}
    </Overlay>
  );
}
