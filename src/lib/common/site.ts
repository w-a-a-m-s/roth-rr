/** Public marketing / app origin used for Open Graph absolute URLs. */
export const CANONICAL_SITE_URL = "https://roth-rr.waams.com";

/**
 * Resolve the public site origin for metadataBase / og:url.
 *
 * Production always uses the custom domain. Auth may point at a
 * *.vercel.app hostname, but those hosts often 404 for crawlers, so
 * WhatsApp falls back to the favicon instead of the preview image.
 *
 * Override with NEXT_PUBLIC_SITE_URL when needed. In development, use
 * AUTH_URL, then localhost, so local previews still resolve.
 */
function publicOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.hostname.endsWith(".vercel.app")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getSiteUrl(): string {
  const override = publicOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (override) return override;

  // Prefer `=== "production"`: local/tooling often leaves NODE_ENV unset.
  if (process.env.NODE_ENV === "production") {
    return CANONICAL_SITE_URL;
  }

  return publicOrigin(process.env.AUTH_URL) ?? "http://localhost:3000";
}

/** Absolute OG image URL on the public custom domain (never *.vercel.app). */
export function siteOgImage(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_SITE_URL}${normalized}`;
}

/** Homepage OG image. Marketing pages that override `openGraph` must set this themselves. */
export function homeOgImage() {
  return {
    url: siteOgImage("/og/home.jpg"),
    width: 1200,
    height: 630,
    alt: "Roth RR · Professional-grade financial tools, built by CFPs and AI engineers",
  };
}

/** Homepage query that opens a legal modal: `/?legal=privacy` or `/?legal=terms`. */
export const LEGAL_QUERY_KEY = "legal";
export const PRIVACY_HREF = `/?${LEGAL_QUERY_KEY}=privacy`;
export const TERMS_HREF = `/?${LEGAL_QUERY_KEY}=terms`;

/** Public app origin for invite and share links (no trailing slash). */
export function getCalculatorUrl(): string {
  return getSiteUrl();
}
