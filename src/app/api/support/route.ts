import {
  auth,
  getUserContact,
  sendSupportMail,
} from "@/lib/auth/server";
import {
  feedbackMailSubject,
  parseSupportMessage,
} from "@/lib/supportMessage";

/**
 * Forward help/feedback to support@ with Reply-To set to the sender.
 * Signed-in: email from the user record. Signed-out: email from the request body.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseSupportMessage(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  let replyTo: string;
  let displayName: string | null;

  if (userId) {
    const contact = await getUserContact(userId);
    if (!contact) {
      return Response.json(
        { error: "No email on your account" },
        { status: 400 },
      );
    }
    replyTo = contact.email;
    displayName = contact.name;
  } else {
    if (!parsed.email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }
    if (!parsed.name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    replyTo = parsed.email;
    displayName = parsed.name;
  }

  const subject =
    parsed.kind === "feedback"
      ? feedbackMailSubject(displayName)
      : (parsed.subject as string);

  const text = userId
    ? parsed.message
    : [`Name: ${displayName}`, `Email: ${replyTo}`, "", parsed.message].join(
        "\n",
      );

  try {
    await sendSupportMail({
      replyTo,
      subject,
      text,
    });
  } catch (err) {
    console.error("support mail failed", err);
    return Response.json({ error: "Failed to send" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
