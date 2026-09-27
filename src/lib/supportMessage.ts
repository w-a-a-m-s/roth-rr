/** Kinds of messages forwarded to the support inbox. */
export type SupportKind = "help" | "feedback";

export type SupportMessageInput = {
  kind: SupportKind;
  subject?: string;
  message: string;
  /** Required when sending while signed out (Reply-To). */
  email?: string;
  name?: string;
};

export type ParsedSupportMessage = {
  kind: SupportKind;
  /** Set for help from the form; feedback subject is built server-side. */
  subject: string | null;
  message: string;
  /** Guest contact; null when the client did not send them. */
  email: string | null;
  name: string | null;
};

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 10_000;
const MAX_NAME = 120;
const MAX_EMAIL = 254;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Validate and normalize a help/feedback payload. */
export function parseSupportMessage(
  body: unknown,
): ParsedSupportMessage | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid JSON" };
  }
  const raw = body as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== "help" && kind !== "feedback") {
    return { error: "kind must be help or feedback" };
  }
  const message =
    typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) return { error: "Message is required" };
  if (message.length > MAX_MESSAGE) {
    return { error: "Message is too long" };
  }

  const nameRaw = typeof raw.name === "string" ? raw.name.trim() : "";
  if (nameRaw.length > MAX_NAME) return { error: "Name is too long" };
  const emailRaw = typeof raw.email === "string" ? raw.email.trim() : "";
  if (emailRaw.length > MAX_EMAIL) return { error: "Email is too long" };
  if (emailRaw && !isEmail(emailRaw)) {
    return { error: "Enter a valid email" };
  }

  const name = nameRaw || null;
  const email = emailRaw || null;

  if (kind === "feedback") {
    return { kind, subject: null, message, email, name };
  }

  const subjectRaw =
    typeof raw.subject === "string" ? raw.subject.trim() : "";
  if (subjectRaw.length > MAX_SUBJECT) {
    return { error: "Subject is too long" };
  }
  if (!subjectRaw) {
    return { error: "Subject is required" };
  }

  return { kind, subject: subjectRaw, message, email, name };
}

/** Subject line for product feedback mail. */
export function feedbackMailSubject(userName: string | null): string {
  const name = userName?.trim() || "a user";
  return `feedback from ${name}`;
}
