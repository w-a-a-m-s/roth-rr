/**
 * Shared email defaults for Mailgun for Roth RR.
 *
 * Send via `sendEmail` from `@/lib/common/server/email` (or auth
 * wrappers that call it). Apply these defaults with `withMailDefaults` /
 * `sendMail` for mail *to users*.
 *
 * Help/feedback to the support inbox uses `sendSupportMail` instead: To is
 * {@link getSupportEmail}, Reply-To is the sender's account email.
 */

/** Production support inbox. */
export const CANONICAL_SUPPORT_EMAIL = "support@thewealthlab.ai";

/**
 * Public support inbox (Reply-To on user mail; To for support forwards).
 * Set `NEXT_PUBLIC_SUPPORT_EMAIL` or `SUPPORT_EMAIL`; falls back to production.
 */
export function getSupportEmail(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    process.env.SUPPORT_EMAIL?.trim();
  if (explicit) return explicit;
  return CANONICAL_SUPPORT_EMAIL;
}

/**
 * Merge Roth RR mail defaults into send options.
 * Forces `replyTo` to {@link getSupportEmail}.
 */
export function withMailDefaults<T extends Record<string, unknown>>(
  options: T,
): T & { replyTo: string } {
  return {
    ...options,
    replyTo: getSupportEmail(),
  };
}
