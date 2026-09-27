import { getSupportEmail } from "../email";

export type SendEmailOptions = {
  to: string | string[];
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  /** Defaults to {@link getSupportEmail}. */
  replyTo?: string;
};

/**
 * Send mail via the Mailgun HTTP API (`api` + API key).
 *
 * Outside production (`NODE_ENV !== "production"`), every `to` address is
 * rewritten to `EMAIL_DEV_TO` so real users never get mail from local/preview
 * runs. The original recipient is noted in the subject.
 *
 * Prefer this (or auth wrappers that call it) over calling Mailgun directly.
 */
export async function sendEmail(options: SendEmailOptions) {
  const intended = normalizeRecipients(options.to);
  const { to, subject } = resolveDeliveryTarget(intended, options.subject);
  const from = options.from || process.env.EMAIL_FROM;
  const replyTo = options.replyTo?.trim() || getSupportEmail();
  const domain = getMailgunDomain();
  const apiKey = process.env.EMAIL_SERVER_PASSWORD;
  const user = process.env.EMAIL_SERVER_USER || "api";

  if (!domain) {
    throw new Error(
      "Mailgun domain missing: set MAILGUN_DOMAIN or EMAIL_FROM with @mg.…",
    );
  }
  if (!apiKey) {
    throw new Error("EMAIL_SERVER_PASSWORD (Mailgun API key) is not set");
  }
  if (!from) {
    throw new Error("EMAIL_FROM is not set");
  }

  const body = new FormData();
  body.append("from", from);
  for (const recipient of to) {
    body.append("to", recipient);
  }
  body.append("subject", subject);
  if (options.text) body.append("text", options.text);
  if (options.html) body.append("html", options.html);
  body.append("h:Reply-To", replyTo);

  const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Mailgun send failed (${res.status}): ${detail || res.statusText}`,
    );
  }

  return res.json() as Promise<{ id?: string; message?: string }>;
}

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to])
    .map((r) => r.trim())
    .filter(Boolean);
  if (list.length === 0) {
    throw new Error("sendEmail requires at least one recipient");
  }
  return list;
}

function resolveDeliveryTarget(
  intended: string[],
  subject: string,
): { to: string[]; subject: string } {
  if (process.env.NODE_ENV === "production") {
    return { to: intended, subject };
  }

  const devTo = process.env.EMAIL_DEV_TO?.trim();
  if (!devTo) {
    throw new Error(
      "EMAIL_DEV_TO is required when NODE_ENV is not production (mail is redirected away from real recipients)",
    );
  }

  return {
    to: [devTo],
    subject: `[dev → ${intended.join(", ")}] ${subject}`,
  };
}

function getMailgunDomain(): string {
  if (process.env.MAILGUN_DOMAIN?.trim()) {
    return process.env.MAILGUN_DOMAIN.trim();
  }
  const from = process.env.EMAIL_FROM ?? "";
  const match = from.match(/@([^>\s]+)/);
  return match?.[1]?.trim() ?? "";
}
