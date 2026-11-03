/**
 * P1603: registering for a HIDDEN event. A direct insert into event_rsvps is refused by the database for a hidden event
 * (an id the visitor happened to see must not be a way in); the only door is rsvp_to_event_by_slug, which takes the link
 * itself as proof and keeps every check the direct path has (signed in, not cancelled, capacity, removed people, the
 * server-stamped time). So this needs the slug the RSVP was offered on, and returns false without it.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { invokeEventEmails } from '@/lib/event-emails';
import { guardSeatWrite, isAnonymousRlsDenial, SessionMismatchError } from '@/lib/session-guard';
import { logDbError } from './db-error-logger';

/** Why the last link-door registration was refused, when the server said so ('full' or 'cancelled'). The service
 *  contract is a boolean, so the page asks for the reason once, right after a false, and shows the message it already
 *  has for that state. Read-and-clear: it never leaks into a later attempt. */
let lastRefusal: 'full' | 'cancelled' | null = null;
export function takeHiddenRsvpRefusal(): 'full' | 'cancelled' | null {
  const r = lastRefusal;
  lastRefusal = null;
  return r;
}

/** true: registered (now, or already). false: refused (full, cancelled, removed, unknown link) or could not be sent.
 *  Throws SessionMismatchError exactly where the direct path does. `sendEmails`: the manual path sends the confirmation. */
export async function rsvpToHiddenEvent(eventId: string, profileId: string, slug: string | undefined, sendEmails: boolean): Promise<boolean> {
  if (!slug) return false;
  if (!(await guardSeatWrite(profileId))) return false;
  let result;
  try {
    result = await supabase.rpc('rsvp_to_event_by_slug', { p_slug: slug });
  } finally {
    clearListReturnCache(); // admission to a canvas follows the RSVP row, as for a direct insert
  }
  lastRefusal = null;
  const { data, error, status } = result;
  if (isAnonymousRlsDenial(error, status)) throw new SessionMismatchError(profileId);
  if (error) {
    logDbError('rsvpToHiddenEvent', error);
    return false;
  }
  if (data === 'full' || data === 'cancelled') lastRefusal = data;
  if (data === 'ok' && sendEmails) invokeEventEmails('rsvp', eventId, profileId);
  return data === 'ok' || data === 'already';
}
