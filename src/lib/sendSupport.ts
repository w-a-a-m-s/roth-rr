import { withBasePath } from "@/lib/basePath";
import type { SupportKind } from "@/lib/supportMessage";

/** POST help/feedback to `/api/support`. Throws on non-OK responses. */
export async function sendSupport(params: {
  kind: SupportKind;
  subject?: string;
  message: string;
  /** Required when signed out. */
  email?: string;
  name?: string;
}): Promise<void> {
  const res = await fetch(withBasePath("/api/support"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    let detail = "Could not send. Try again.";
    try {
      const data = (await res.json()) as { error?: string };
      if (typeof data.error === "string" && data.error.trim()) {
        detail = data.error;
      }
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
}
