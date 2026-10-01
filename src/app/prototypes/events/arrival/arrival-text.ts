/**
 * P1380: the arrival question's text rules. The emails apply the same rules server-side
 * (supabase/functions/_shared/event-links.ts) — both are pinned by their own tests to the same
 * examples, so a drift shows up as a failing test on one side.
 */

/** A location that is an http(s) URL is an online event: no arrival question. */
export function isOnlineLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  try {
    const u = new URL(location.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** "Zuzalu library, 4Seas Nimman, …" → "Zuzalu library"; null when that part is not a place name. */
export function venueName(location: string | null | undefined): string | null {
  if (!location || isOnlineLocation(location)) return null;
  const comma = location.indexOf(',');
  if (comma <= 0) return null;
  const first = location.slice(0, comma).trim();
  if (!first || /^\d/.test(first)) return null;
  return first;
}

export function arrivalQuestion(location: string | null | undefined): string {
  const venue = venueName(location);
  return venue ? `Have you arrived at ${venue}?` : 'Have you arrived?';
}

function formatTime(d: Date, tz: string | undefined): string {
  try {
    return d.toLocaleTimeString('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/** Founder-approved 2026-10-01: start sharp, doors 15 minutes before, late arrivals from round 2. */
export function onTimeLine(event: { datetime: string; timezone?: string }): string {
  const start = new Date(event.datetime);
  const doors = new Date(start.getTime() - 15 * 60 * 1000);
  const t = formatTime(start, event.timezone);
  return `We start at ${t} sharp (doors open ${formatTime(doors, event.timezone)}). Round 1 pairs whoever is in the room at ${t}; later arrivals join from round 2.`;
}

/** The room asks "Have you arrived?" from an hour before the start until the event ends. */
export const ARRIVAL_OPENS_BEFORE_MS = 60 * 60 * 1000;
export function arrivalWindowOpen(
  event: { datetime: string; durationMinutes?: number },
  now: Date = new Date(),
): boolean {
  const start = new Date(event.datetime).getTime();
  const end = start + (event.durationMinutes ?? 60) * 60 * 1000;
  return now.getTime() >= start - ARRIVAL_OPENS_BEFORE_MS && now.getTime() <= end;
}

export function mapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/** P1380: "Arrived 18:22" in the viewer's zone (the host's marks). */
export function arrivedLabel(arrivedAt: string, timeZone?: string): string {
  try {
    return `Arrived ${new Date(arrivedAt).toLocaleTimeString('en-GB', { ...(timeZone ? { timeZone } : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
  } catch {
    return 'Arrived';
  }
}
