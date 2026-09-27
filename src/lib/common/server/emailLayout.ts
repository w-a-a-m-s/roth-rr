import { CANONICAL_SITE_URL, siteOgImage } from "../site";

const LOGO_URL = siteOgImage("/logo.png");
const SITE_LABEL = "roth-rr.vercel.app";

/**
 * Wrap customer-facing HTML in Roth RR branding: logo header and a
 * footer link to the main site. Pass the inner content only (no `<body>`).
 */
export function wrapCustomerEmailHtml(contentHtml: string): string {
  return `
<body style="background: #f9f9f9; margin: 0; padding: 0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0"
    style="background: #f9f9f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0"
          style="max-width: 600px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding: 0 0 20px 0;">
              <a href="${CANONICAL_SITE_URL}" target="_blank" rel="noopener noreferrer"
                style="text-decoration: none;">
                <img src="${LOGO_URL}" width="200" height="35" alt="Roth RR"
                  style="display: block; width: 200px; height: auto; border: 0;" />
              </a>
            </td>
          </tr>
          <tr>
            <td>
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td align="center"
              style="padding: 24px 8px 8px 8px; font-size: 14px; line-height: 20px; font-family: Helvetica, Arial, sans-serif; color: #666666;">
              <a href="${CANONICAL_SITE_URL}" target="_blank" rel="noopener noreferrer"
                style="color: #000000; text-decoration: underline;">${SITE_LABEL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
`;
}

/** Plain-text footer pointing at the main Roth RR site. */
export function customerEmailTextFooter(): string {
  return `\nRoth RR\n${CANONICAL_SITE_URL}\n`;
}
