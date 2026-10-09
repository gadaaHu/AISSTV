/**
 * Parses an ISO-8601 timestamp string into a Date.
 * Naive datetimes (no timezone offset) are treated as UTC.
 * Returns null for null, undefined, empty, or invalid input.
 */
export function parseTimestamp(
  value: string | null | undefined,
): Date | null {
  if (!value || !value.trim()) return null;
  // Append 'Z' when there's no timezone info to force UTC parsing.
  const normalised = /[Zz]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalised);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Formats an ISO day string (YYYY-MM-DD) for display without timezone shifting.
 * Returns the raw input for unparseable values, and "—" for null/undefined.
 */
export function formatIsoDay(day: string | null | undefined): string {
  if (day == null) return "—";
  // Parse at UTC midnight so the displayed day matches the stored day.
  const date = new Date(`${day}T00:00:00Z`);
  if (isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "medium" });
}

/**
 * Returns today's date as an ISO day string (YYYY-MM-DD) in local time.
 */
export function todayIsoDay(): string {
  return toIsoDay(new Date());
}

/**
 * Converts a Date to an ISO day string (YYYY-MM-DD) in local time.
 */
export function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns a new ISO day string offset by `days` calendar days.
 */
export function addDaysToIsoDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the number of inclusive calendar days between two ISO day strings.
 * Returns 0 when `from` is after `to`.
 */
export function inclusiveDayCount(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Formats a timestamp as a human-readable relative string ("2 minutes ago").
 */
export function formatRelative(
  value: string | Date | null | undefined,
): string {
  const date = value instanceof Date ? value : parseTimestamp(value as string);
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000)    return "just now";
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m ago`;
  if (abs < 86_400_000)return `${Math.round(abs / 3_600_000)}h ago`;
  return `${Math.round(abs / 86_400_000)}d ago`;
}

/**
 * Formats a timestamp as date and time string.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  const date = value instanceof Date ? value : parseTimestamp(value as string);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Formats a timestamp as a time string.
 */
export function formatTime(
  value: string | Date | null | undefined,
): string {
  const date = value instanceof Date ? value : parseTimestamp(value as string);
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, {
    timeStyle: "short",
  });
}
