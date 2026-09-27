import { getSupportEmail, withMailDefaults } from "@/lib/common/email";
import { sendEmail } from "@/lib/common/server/email";
import {
  customerEmailTextFooter,
  wrapCustomerEmailHtml,
} from "@/lib/common/server/emailLayout";
import type { Theme } from "@auth/core/types";
import { userNeedsName } from "../shared/userName";

export type SendMailOptions = {
  to: string | string[];
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  roth: "Advanced Roth Calculator",
};

function toolDisplayName(toolId: string): string {
  return TOOL_DISPLAY_NAMES[toolId] ?? toolId;
}

/** Comma-separated `REGISTRATION_NOTIFY_EMAIL` list. Empty when unset. */
export function parseRegistrationNotifyTo(
  raw: string | undefined = process.env.REGISTRATION_NOTIFY_EMAIL,
): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function registrationNotifyTo(): string[] {
  return parseRegistrationNotifyTo();
}

/**
 * Internal alert when a new Auth.js user is created.
 * No-ops when `REGISTRATION_NOTIFY_EMAIL` is unset. In non-production,
 * `sendEmail` redirects delivery to `EMAIL_DEV_TO`.
 */
export async function notifyNewRegistration(params: {
  name?: string | null;
  email?: string | null;
  toolId: string;
}) {
  const to = registrationNotifyTo();
  if (to.length === 0) return;

  const email =
    typeof params.email === "string" && params.email.trim()
      ? params.email.trim()
      : "(none)";
  const rawName =
    typeof params.name === "string" ? params.name.trim() : "";
  const name = userNeedsName(params.name, params.email)
    ? "(none)"
    : rawName;
  const app = toolDisplayName(params.toolId);

  try {
    await sendMail({
      to,
      subject: `New registration: ${name === "(none)" ? email : name}`,
      text: [
        "A new account was created.",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `App: ${app}`,
        "",
      ].join("\n"),
    });
  } catch (err) {
    console.error("Failed to send new-registration notification:", err);
  }
}

/**
 * Internal alert when someone requests a magic-link signup and no Auth.js
 * user exists yet. Same inbox as {@link notifyNewRegistration}.
 */
export async function notifySignupAttempt(params: {
  email: string;
  toolId: string;
  entrySurface: string;
  invited: boolean;
  attemptCount: number;
}) {
  const to = registrationNotifyTo();
  if (to.length === 0) return;

  const app = toolDisplayName(params.toolId);
  try {
    await sendMail({
      to,
      subject: `Signup attempt: ${params.email}`,
      text: [
        "Someone requested a magic-link signup. They have not clicked the link yet.",
        "",
        `Email: ${params.email}`,
        `App: ${app}`,
        `Surface: ${params.entrySurface}`,
        `Invited: ${params.invited ? "yes" : "no"}`,
        `Attempt: ${params.attemptCount}`,
        "",
      ].join("\n"),
    });
  } catch (err) {
    console.error("Failed to send signup-attempt notification:", err);
  }
}

/**
 * Send mail to a user. Always sets Reply-To to the support inbox.
 * Delivery (including non-prod `to` rewrite) goes through `sendEmail`.
 */
export async function sendMail(options: SendMailOptions) {
  const mail = withMailDefaults(options as Record<string, unknown>) as SendMailOptions & {
    replyTo: string;
  };
  return sendEmail(mail);
}

/**
 * Forward help/feedback to the support inbox.
 * To: support@…; Reply-To: the signed-in user's email (so support can reply).
 */
export async function sendSupportMail(options: {
  replyTo: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const replyTo = options.replyTo.trim();
  if (!replyTo) {
    throw new Error("sendSupportMail requires replyTo (sender email)");
  }
  return sendEmail({
    to: getSupportEmail(),
    subject: options.subject,
    text: options.text,
    html: options.html,
    replyTo,
  });
}

/** Auth.js Nodemailer `sendVerificationRequest` with Roth RR mail defaults. */
export async function sendVerificationRequest(params: {
  identifier: string;
  url: string;
  expires: Date;
  provider: { from?: string };
  token: string;
  theme: Theme;
  request: Request;
}) {
  const { identifier, url, provider, theme } = params;
  const { host } = new URL(url);
  await sendMail({
    to: identifier,
    from: provider.from,
    subject: `Sign in to ${host}`,
    text: magicLinkText({ url, host }),
    html: magicLinkHtml({ url, host, theme }),
  });
}

/** Auth.js magic-link HTML with Roth RR logo + site footer. */
function magicLinkHtml(params: {
  url: string;
  host: string;
  theme: Theme;
}) {
  const { url, host, theme } = params;
  const escapedHost = host.replace(/\./g, "&#8203;.");
  const brandColor = theme.brandColor || "#346df1";
  const buttonText = theme.buttonText || "#fff";
  const color = {
    text: "#444",
    mainBackground: "#fff",
    buttonBackground: brandColor,
    buttonBorder: brandColor,
    buttonText,
  };
  const content = `
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: ${color.mainBackground}; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td align="center"
        style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        Sign in to <strong>${escapedHost}</strong>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="${color.buttonBackground}"><a href="${url}"
                target="_blank"
                style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${color.buttonText}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${color.buttonBorder}; display: inline-block; font-weight: bold;">Sign
                in</a></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center"
        style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        If you did not request this email you can safely ignore it.
      </td>
    </tr>
  </table>
`;
  return wrapCustomerEmailHtml(content);
}

function magicLinkText(params: { url: string; host: string }) {
  const { url, host } = params;
  return `Sign in to ${host}\n${url}\n${customerEmailTextFooter()}`;
}
