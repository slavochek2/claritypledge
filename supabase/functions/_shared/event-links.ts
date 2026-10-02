/**
 * P1380: one-click sign-in tickets behind event email buttons, and the small text rules the
 * new emails share (venue name, online check, the "we start sharp" line).
 *
 * WHY A TICKET AND NOT A MAGIC LINK IN THE EMAIL. A magic link lives one hour (otp_expiry);
 * Mailgun holds scheduled email up to 72h, and people open a confirmation days later. So the
 * email carries an opaque ticket; `event-email-link` mints a fresh magic link at CLICK time.
 *
 * What a ticket can do, and nothing more: sign its RSVP's owner in and open ONE page of ONE
 * event (fixed by `purpose`, never by a URL in the link), until the event ends. Only
 * sha256(ticket) is stored; the plaintext exists in the email alone.
 */
import type { SupabaseClient } from './email-helpers.ts';

export type LinkPurpose = 'prepare' | 'room' | 'arrived' | 'not_yet';

/** The page each purpose opens. The only mapping from a ticket to a destination. */
export function purposePath(purpose: LinkPurpose, rawSlug: string): string {
  // Encoded: a slug carrying ?, # or / must not reshape the path the ticket opens.
  const slug = encodeURIComponent(rawSlug);
  switch (purpose) {
    case 'prepare': return `/events/${slug}/prepare`;
    case 'room': return `/events/${slug}/room`;
    case 'arrived': return `/events/${slug}/room?arrived=1`;
    case 'not_yet': return `/events/${slug}/arriving`;
  }
}

export function isLinkPurpose(v: unknown): v is LinkPurpose {
  return v === 'prepare' || v === 'room' || v === 'arrived' || v === 'not_yet';
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashTicket(ticket: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)));
}

/** 32 random bytes, base64url — unguessable, URL-safe. */
export function newTicket(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Tickets stop working 2 hours after the event's scheduled END (start + its own duration, so a
 * half-day event is already covered) — the grace absorbs a late start or an overrun (founder,
 * 2026-10-02).
 */
export const TICKET_GRACE_MS = 2 * 60 * 60 * 1000;
export function ticketExpiry(event: { datetime: string; duration_minutes: number | null }): Date {
  const end = new Date(event.datetime).getTime() + (event.duration_minutes ?? 60) * 60 * 1000;
  return new Date(end + TICKET_GRACE_MS);
}

/**
 * Buttons open the APP's "Continue" page, never the function directly: a scanner that fetches
 * the link gets a page, and only a human press redeems the ticket (event-email-link header).
 * APP_URL (the convention send-letter-emails uses) lets the test project point at a dev/preview site; prod defaults to claritypledge.com.
 */
function linkBase(): string {
  const site = (Deno.env.get('APP_URL') ?? 'https://claritypledge.com').replace(/\/+$/, '');
  return `${site}/auth/event-link`;
}

/**
 * Mint a ticket and return the button URL, or null if the ticket could not be stored — the
 * caller then falls back to the plain event-page link rather than sending a dead button.
 */
export async function mintEmailLink(
  supabase: SupabaseClient,
  rsvpId: string,
  purpose: LinkPurpose,
  event: { datetime: string; duration_minutes: number | null },
): Promise<string | null> {
  const ticket = newTicket();
  const { error } = await supabase.from('event_email_links').insert({
    token_hash: await hashTicket(ticket),
    rsvp_id: rsvpId,
    purpose,
    expires_at: ticketExpiry(event).toISOString(),
  });
  if (error) {
    console.error(`mintEmailLink(${purpose}) failed:`, error.message);
    return null;
  }
  return `${linkBase()}?ticket=${encodeURIComponent(ticket)}`;
}

// ── Text rules shared with the app (src/app/prototypes/events/arrival/arrival-text.ts) ──

/** A location that is a URL is an online event: no arrival question. */
export function isOnlineLocation(location: string | null): boolean {
  if (!location) return false;
  try {
    const u = new URL(location.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * "Zuzalu library, 4Seas Nimman, …" → "Zuzalu library". null when the first part is not a
 * place name: no comma, or it starts with a street number.
 */
export function venueName(location: string | null): string | null {
  if (!location || isOnlineLocation(location)) return null;
  const comma = location.indexOf(',');
  if (comma <= 0) return null;
  const first = location.slice(0, comma).trim();
  if (!first || /^\d/.test(first)) return null;
  return first;
}

function formatTime(d: Date, tz: string | null): string {
  try {
    return d.toLocaleTimeString('en-GB', { timeZone: tz ?? 'UTC', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/** Founder-approved 2026-10-01: start sharp, doors 15 minutes before, late arrivals from round 2. */
export function onTimeLine(event: { datetime: string; timezone: string | null }): string {
  const start = new Date(event.datetime);
  const doors = new Date(start.getTime() - 15 * 60 * 1000);
  const t = formatTime(start, event.timezone);
  return `We start at ${t} sharp (doors open ${formatTime(doors, event.timezone)}). Round 1 pairs whoever is in the room at ${t}; later arrivals join from round 2.`;
}
