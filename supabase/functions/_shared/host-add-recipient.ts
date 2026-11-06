/**
 * P1529 D24: who may receive the rsvp confirmation when the caller names another person.
 *
 * The event's host adds a person from the waiting list; the confirmation then goes to that person. Returns the person's id, or
 * null when nothing may be sent:
 *  - the caller is not the event's host (anyone else naming another person sends nothing; the answer reveals nothing);
 *  - the person's registration is older than HOST_ADD_EMAIL_WINDOW_MS, so it is not one the host just made (a host cannot
 *    re-send confirmations to their attendees at will);
 *  - a confirmation is already logged for them since that registration (one confirmation per add; not atomic against
 *    concurrent calls, a known limit: the host's page makes one call per add);
 *  - any lookup failed (fail closed).
 * The caller still requires the person's RSVP (handleRsvpIfRegistered).
 */
type Result = PromiseLike<{ data: unknown; count?: number | null; error: unknown }>;
type Chain = {
  select(columns: string, opts?: { count: 'exact'; head: boolean }): Chain;
  eq(column: string, value: string): Chain;
  gte(column: string, value: string): Chain;
  single(): Result;
  maybeSingle(): Result;
} & Result;
type Db = { from(table: string): unknown };

/** How long after a host's add the confirmation may still be sent for that person. */
export const HOST_ADD_EMAIL_WINDOW_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export async function hostAddRecipient(db: Db, eventId: string, caller: string, target: string, now = Date.now()): Promise<string | null> {
  const ev = await (db.from('events') as Chain).select('host_id').eq('id', eventId).single();
  // Every lookup fails closed: an error sends nothing (review: a failed count read as zero would have sent again).
  if (ev.error || (ev.data as { host_id?: string } | null)?.host_id !== caller) {
    console.warn('[send-event-emails] rsvp for another person refused: caller is not the host');
    return null;
  }
  const rsvp = await (db.from('event_rsvps') as Chain).select('rsvped_at').eq('event_id', eventId).eq('profile_id', target).maybeSingle();
  const at = (rsvp.data as { rsvped_at?: string } | null)?.rsvped_at;
  const ageMs = at ? now - new Date(at).getTime() : NaN;
  // A minute of clock difference between the database and this function is allowed, so a fresh registration is never refused.
  if (rsvp.error || !(ageMs >= -CLOCK_SKEW_MS && ageMs <= HOST_ADD_EMAIL_WINDOW_MS)) {
    console.warn('[send-event-emails] rsvp for another person refused: not a fresh registration');
    return null;
  }
  const sent = await (db.from('email_send_log') as Chain).select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).eq('profile_id', target).eq('email_type', 'confirmation').eq('status', 'sent')
    .gte('created_at', at as string); // a failed send does not block a retry
  if (sent.error || sent.count !== 0) {
    console.warn('[send-event-emails] rsvp for another person refused: confirmation already sent');
    return null;
  }
  return target;
}
