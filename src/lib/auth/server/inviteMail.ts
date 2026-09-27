import { getCalculatorUrl } from "@/lib/common/site";

/** Public calculator URL that carries the invite code (environment-specific). */
export function inviteLinkUrl(code: string): string {
  return `${getCalculatorUrl()}?invite=${encodeURIComponent(code)}`;
}
