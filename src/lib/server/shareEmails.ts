import "server-only";

import { sendMail } from "@/lib/auth/server";
import { getCalculatorUrl } from "@/lib/common/site";
import {
  customerEmailTextFooter,
  wrapCustomerEmailHtml,
} from "@/lib/common/server/emailLayout";
import { ROLE_LABELS, type PlanRole } from "@/lib/sharing";

function planUrl(publicId: string, inviteCode?: string | null): string {
  const base = `${getCalculatorUrl()}/${encodeURIComponent(publicId)}`;
  const code = inviteCode?.trim();
  return code ? `${base}?invite=${encodeURIComponent(code)}` : base;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sharerLabel(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return email;
}

/** Email when someone is added to a plan (existing account or pending invite). */
export async function sendPlanShareEmail(params: {
  to: string;
  publicId: string;
  planName: string;
  role: PlanRole;
  sharerName: string | null | undefined;
  sharerEmail: string;
  /** True when the recipient does not have an account yet. */
  isInvite: boolean;
  /** Invite code to carry on the calculator URL (pending invites only). */
  inviteCode?: string | null;
}): Promise<void> {
  const url = planUrl(params.publicId, params.isInvite ? params.inviteCode : null);
  const who = sharerLabel(params.sharerName, params.sharerEmail);
  const roleLabel = ROLE_LABELS[params.role];
  const subject = params.isInvite
    ? `${who} invited you to a Roth plan`
    : `${who} shared a Roth plan with you`;

  const intro = params.isInvite
    ? `${escapeHtml(who)} invited you to collaborate on <strong>${escapeHtml(params.planName)}</strong> as ${escapeHtml(roleLabel)}.`
    : `${escapeHtml(who)} shared <strong>${escapeHtml(params.planName)}</strong> with you as ${escapeHtml(roleLabel)}.`;

  const cta = params.isInvite ? "Accept invitation" : "Open plan";
  const toolBlurbHtml =
    "Our <b>Advanced Roth Calculator</b> helps you compare Roth conversion strategies and see the impact on taxes, Medicare, and long-term wealth.";
  const toolBlurbText =
    "Our Advanced Roth Calculator helps you compare Roth conversion strategies and see the impact on taxes, Medicare, and long-term wealth.";
  const followUp = params.isInvite
    ? "Sign in or create an account with this email to open the plan."
    : "Sign in with this email to open the plan.";

  const html = wrapCustomerEmailHtml(`
  <table width="100%" border="0" cellspacing="0" cellpadding="0"
    style="background: #ffffff; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td style="padding: 28px 28px 8px 28px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: #222;">
        ${params.isInvite ? "You're invited" : "A plan was shared with you"}
      </td>
    </tr>
    <tr>
      <td style="padding: 8px 28px 20px 28px; font-size: 16px; line-height: 24px; font-family: Helvetica, Arial, sans-serif; color: #444;">
        ${intro}
        <br /><br />
        ${toolBlurbHtml}
        <br /><br />
        ${escapeHtml(followUp)}
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 8px 28px 28px 28px;">
        <a href="${url}" target="_blank"
          style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #fff; text-decoration: none; border-radius: 6px; padding: 12px 22px; background: #1f6feb; display: inline-block; font-weight: bold;">
          ${cta}
        </a>
      </td>
    </tr>
  </table>
`);

  const text = [
    params.isInvite ? "You're invited" : "A plan was shared with you",
    "",
    params.isInvite
      ? `${who} invited you to collaborate on "${params.planName}" as ${roleLabel}.`
      : `${who} shared "${params.planName}" with you as ${roleLabel}.`,
    "",
    toolBlurbText,
    "",
    followUp,
    "",
    `${cta}: ${url}`,
    customerEmailTextFooter(),
  ].join("\n");

  try {
    await sendMail({ to: params.to, subject, text, html });
  } catch (err) {
    console.error("Failed to send plan share email:", err);
  }
}

/** Email the inviter when a pending invitee creates an account and joins. */
export async function sendInviteAcceptedEmail(params: {
  to: string;
  publicId: string;
  planName: string;
  joinerName: string | null | undefined;
  joinerEmail: string;
}): Promise<void> {
  const url = planUrl(params.publicId);
  const joiner = sharerLabel(params.joinerName, params.joinerEmail);
  const subject = `${joiner} joined your shared plan`;

  const html = wrapCustomerEmailHtml(`
  <table width="100%" border="0" cellspacing="0" cellpadding="0"
    style="background: #ffffff; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td style="padding: 28px 28px 8px 28px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: #222;">
        Invitation accepted
      </td>
    </tr>
    <tr>
      <td style="padding: 8px 28px 20px 28px; font-size: 16px; line-height: 24px; font-family: Helvetica, Arial, sans-serif; color: #444;">
        <strong>${escapeHtml(joiner)}</strong> (${escapeHtml(params.joinerEmail)})
        created an account and joined
        <strong>${escapeHtml(params.planName)}</strong>.
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 8px 28px 28px 28px;">
        <a href="${url}" target="_blank"
          style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #fff; text-decoration: none; border-radius: 6px; padding: 12px 22px; background: #1f6feb; display: inline-block; font-weight: bold;">
          Open plan
        </a>
      </td>
    </tr>
  </table>
`);

  const text = [
    "Invitation accepted",
    "",
    `${joiner} (${params.joinerEmail}) created an account and joined "${params.planName}".`,
    "",
    `Open plan: ${url}`,
    customerEmailTextFooter(),
  ].join("\n");

  try {
    await sendMail({ to: params.to, subject, text, html });
  } catch (err) {
    console.error("Failed to send invite-accepted email:", err);
  }
}
