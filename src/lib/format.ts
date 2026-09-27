const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyFmtCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFmt = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number, cents = false): string {
  if (!Number.isFinite(value)) return "-";
  return (cents ? currencyFmtCents : currencyFmt).format(value);
}

/** Signed currency, e.g. "+$12,345" / "-$6,789". */
export function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

export function formatPercent(value: number): string {
  return percentFmt.format(value);
}

/** Short relative time, e.g. "just now", "3m ago". */
export function relativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function dayOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * Format an ISO UTC timestamp (or epoch ms) in the browser's local timezone,
 * e.g. "June 5th 4:34pm".
 */
export function formatLocalDateTime(isoOrMs: string | number): string {
  const d = new Date(isoOrMs);
  if (!Number.isFinite(d.getTime())) return "";
  const month = d.toLocaleString("en-US", { month: "long" });
  const day = dayOrdinal(d.getDate());
  const time = d
    .toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s?(AM|PM)/i, (_, mer) => String(mer).toLowerCase());
  return `${month} ${day} ${time}`;
}

/**
 * Compact local date + hour (no minutes), e.g. "July 20th, 8pm".
 */
export function formatLocalDateHour(isoOrMs: string | number): string {
  const d = new Date(isoOrMs);
  if (!Number.isFinite(d.getTime())) return "";
  const month = d.toLocaleString("en-US", { month: "long" });
  const day = dayOrdinal(d.getDate());
  const time = d
    .toLocaleString("en-US", {
      hour: "numeric",
      hour12: true,
    })
    .replace(/\s?(AM|PM)/i, (_, mer) => String(mer).toLowerCase());
  return `${month} ${day}, ${time}`;
}
