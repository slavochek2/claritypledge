/**
 * @file format-time.ts
 * @description Time formatting utilities.
 *
 * Extracted from prototypes/shared/utils.ts during P507.
 */

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a timestamp as a human date + time in the VISITOR's local timezone.
 *
 * Single source of truth for visitor-local date/time display (P937) — used by the
 * webinar date-line on the landing/offers surfaces and by the event detail page's
 * date rendering. Uses `toLocaleString` with no fixed `timeZone` by default, so the
 * browser's own timezone drives the output (no IP geolocation, no service call).
 *
 * @param input ISO string or Date. Invalid input returns ''.
 * @param opts.showYear append the year (e.g. ", 2026"). Default false.
 * @param opts.timeZone override the timezone (IANA name). Default: browser-local.
 *   Provided mainly so tests are deterministic across CI machines (which run in UTC).
 * @returns e.g. "Thursday, June 25 · 3:30 PM"
 */
function toDate(input: string | Date): Date | null {
  const date = typeof input === 'string' ? new Date(input) : input;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date part only, visitor-local: e.g. "Thursday, June 25" (or "…, 2026" with showYear). */
export function formatLocalDate(
  input: string | Date,
  opts: { showYear?: boolean; timeZone?: string } = {},
): string {
  const date = toDate(input);
  if (!date) return '';
  const { showYear = false, timeZone } = opts;
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' } : {}),
    ...(timeZone ? { timeZone } : {}),
  });
}

/** Time part only, visitor-local: e.g. "3:30 PM". */
export function formatLocalTime(
  input: string | Date,
  opts: { timeZone?: string } = {},
): string {
  const date = toDate(input);
  if (!date) return '';
  const { timeZone } = opts;
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });
}

/** Combined date + time, visitor-local: e.g. "Thursday, June 25 · 3:30 PM". */
export function formatLocalDateTime(
  input: string | Date,
  opts: { showYear?: boolean; timeZone?: string } = {},
): string {
  const date = toDate(input);
  if (!date) return '';
  return `${formatLocalDate(input, opts)} · ${formatLocalTime(input, opts)}`;
}
