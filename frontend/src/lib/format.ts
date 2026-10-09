export const EMPTY = "—";

/**
 * Formats a duration in seconds as a human-readable string.
 * Returns "—" for zero, null, or undefined.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return EMPTY;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0)           return `${h}h`;
  if (m > 0)           return `${m}m`;
  return `${s}s`;
}

/**
 * Formats a number with locale separators.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return EMPTY;
  return value.toLocaleString();
}

/**
 * Formats a 0–1 fraction as a percentage string ("92%").
 * Returns "—" for null or undefined.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return EMPTY;
  return `${Math.round(value * 100)}%`;
}

/**
 * Formats a plain text value, returning "—" for null or empty.
 */
export function formatText(value: string | null | undefined): string {
  return value?.trim() || EMPTY;
}

/**
 * Converts snake_case or kebab-case to "Title case".
 */
export function humanise(value: string | null | undefined): string {
  if (!value) return EMPTY;
  return value
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Builds up to two initials from a name string.
 * Returns "?" for empty/null input.
 */
export function initialsFrom(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

/**
 * Removes embedded credentials (user:pass@) from a URL string.
 * Falls back to a placeholder if the URL cannot be parsed.
 */
export function redactUrlCredentials(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.username && !parsed.password) return url;
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    // URL.parse failed — if there's an @, assume credentials are present.
    return url.includes("@") ? "•••• (credentials hidden)" : url;
  }
}

/**
 * Returns true if the URL contains embedded credentials.
 */
export function hasUrlCredentials(url: string): boolean {
  try {
    const parsed = new URL(url);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return false;
  }
}
