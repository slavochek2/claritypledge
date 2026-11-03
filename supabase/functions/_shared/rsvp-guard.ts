/**
 * P1603: the rsvp email is sent only to a caller who really holds an RSVP for the event.
 *
 * The function runs with the service role, so without this check any signed-in caller who knew an event id
 * received that event's title and link by email, hidden or not. The app calls it AFTER the insert (the direct path
 * and rsvp_to_event_by_slug both), so a real registrant always passes. A caller without a row gets the same plain
 * success a registrant gets, and nothing is sent: the answer says nothing about the event.
 */
type Chain = {
  select(columns: string): Chain;
  eq(column: string, value: string): Chain;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
};
type Db = { from(table: string): unknown };

export async function callerHasRsvp(db: Db, eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await (db.from('event_rsvps') as Chain)
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw new Error('rsvp lookup failed');
  return !!data;
}
