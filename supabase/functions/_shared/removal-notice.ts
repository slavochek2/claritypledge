/**
 * P1700: the email to a person the event's host removed, sent at most once per removal.
 *
 * Order, and why:
 *  1. The caller must be the event's host (the endpoint also checks; this fails closed on its own).
 *  2. Claim the removal row atomically: notified_at is set only where it is still NULL and the removal actually deleted a
 *     registration (had_registration). No claimed row = nothing to send: someone never registered, already notified, or a
 *     forged call. Repeat and concurrent calls therefore send nothing more.
 *  3. Cancel the registration's already-scheduled emails (reminder, feedback, starting_soon), whose ids
 *     remove_event_attendee copied onto the removal row before deleting the registration. Each cancel is best effort: a
 *     cancel that throws never stops the removal email (cancelScheduledEmail already retries once and, by the repo's P1425
 *     policy, returns normally after a second failure). The ids are then forgotten.
 *  4. Send. If the send fails, returns null or throws, or anything after the claim throws, release the claim
 *     (notified_at back to NULL, only if it is still ours) so a later call can still send.
 * Every lookup fails closed.
 */
type Result = PromiseLike<{ data: unknown; error: unknown }>;
type Chain = {
  select(columns: string): Chain;
  update(values: Record<string, unknown>): Chain;
  eq(column: string, value: unknown): Chain;
  is(column: string, value: null): Chain;
  single(): Result;
  maybeSingle(): Result;
} & Result;
type Db = { from(table: string): unknown };

export type RemovalDeps = {
  /** Cancels one scheduled message; ignores values that are not real ids (PENDING, SENT_NO_ID). */
  cancel: (id: string) => Promise<void>;
  /** Sends the email; returns the provider's message id, or null on failure. May throw on a network error. */
  send: (to: string, email: { subject: string; html: string; text: string }) => Promise<string | null>;
  build: (event: Record<string, unknown>, name: string | null) => { subject: string; html: string; text: string };
  log: (opts: { eventId: string; profileId: string; messageId: string | null; errorMessage?: string }) => Promise<void>;
  now?: () => string;
};

export type RemovalOutcome = 'forbidden' | 'nothing' | 'sent' | 'failed';

export const EVENT_SELECT = 'id, title, datetime, duration_minutes, timezone, location, description, slug, host_id';
const SCHEDULED_KINDS = ['reminder', 'feedback', 'starting_soon'] as const;

/** Each cancel is best effort: one that throws never stops the removal email. */
async function cancelScheduled(deps: RemovalDeps, ids: Record<string, string | null> | null): Promise<void> {
  if (!ids) return;
  for (const kind of SCHEDULED_KINDS) {
    const id = ids[kind];
    if (!id) continue;
    try {
      await deps.cancel(id);
    } catch (err) {
      console.warn(`[send-event-emails] removal: ${kind} cancel threw; the removal email still goes`, err);
    }
  }
}

/** The email is out: log it and forget the cancelled ids. A failure here never un-sends, and never releases the claim. */
async function afterSend(db: Db, deps: RemovalDeps, eventId: string, target: string, messageId: string, hadIds: boolean): Promise<void> {
  // Two independent steps: a failed log never keeps the cancelled ids, and a failed clear never loses the log line.
  if (hadIds) {
    try {
      const res = await (db.from('event_removals') as Chain).update({ scheduled_message_ids: null }).eq('event_id', eventId).eq('user_id', target);
      if (res.error) console.error('[send-event-emails] removal email sent; clearing the cancelled ids failed:', res.error);
    } catch (err) {
      console.error('[send-event-emails] removal email sent; clearing the cancelled ids failed:', err);
    }
  }
  try {
    await deps.log({ eventId, profileId: target, messageId });
  } catch (err) {
    console.error('[send-event-emails] removal email sent; its log line failed:', err);
  }
}

export async function notifyRemoval(db: Db, deps: RemovalDeps, eventId: string, caller: string, target: string): Promise<RemovalOutcome> {
  const ev = await (db.from('events') as Chain).select(EVENT_SELECT).eq('id', eventId).single();
  const event = ev.data as Record<string, unknown> | null;
  if (ev.error || !event || event.host_id !== caller) return 'forbidden';

  const claimedAt = deps.now ? deps.now() : new Date().toISOString();
  const claim = await (db.from('event_removals') as Chain)
    .update({ notified_at: claimedAt })
    .eq('event_id', eventId).eq('user_id', target).eq('had_registration', true).is('notified_at', null)
    .select('scheduled_message_ids')
    .maybeSingle();
  // A database error is a failure the caller sees (502), never "nothing to send" (/finish round 2).
  if (claim.error) return 'failed';
  if (!claim.data) return 'nothing';

  // Supabase reports a failed update as { error }, not a throw: check it. One attempt, no retry (metered-services rule 4:
  // a retry needs backoff and jitter, which a single release does not justify); a release that fails is logged and the
  // claim stays set (spec, Known limitations).
  const release = async () => {
    try {
      const res = await (db.from('event_removals') as Chain).update({ notified_at: null })
        .eq('event_id', eventId).eq('user_id', target).eq('notified_at', claimedAt);
      if (res.error) console.error('[send-event-emails] removal claim not released:', res.error);
    } catch (err) {
      console.error('[send-event-emails] removal claim not released:', err);
    }
  };

  // Once the email is out, the claim is never released again: a release after a successful send (say, the log insert
  // threw) would let a retry send a second email (/finish round 2).
  let sent = false;
  try {
    // Cancels run on every attempt that holds the claim; the ids are forgotten only after a successful send, so a retry
    // after a failed send still cancels them (a second cancel of the same id is a harmless 404).
    const ids = (claim.data as { scheduled_message_ids?: Record<string, string | null> | null }).scheduled_message_ids ?? null;
    await cancelScheduled(deps, ids);

    const person = await (db.from('profiles') as Chain).select('email, name').eq('id', target).maybeSingle();
    const profile = person.data as { email?: string | null; name?: string | null } | null;
    if (person.error || !profile?.email) {
      await deps.log({ eventId, profileId: target, messageId: null, errorMessage: 'no email address for the removed person' });
      await release();
      return 'failed';
    }

    const messageId = await deps.send(profile.email, deps.build(event, profile.name ?? null));
    sent = !!messageId;
    if (!messageId) {
      await deps.log({ eventId, profileId: target, messageId: null, errorMessage: 'Mailgun returned null message ID' });
      await release();
      return 'failed';
    }
    await afterSend(db, deps, eventId, target, messageId, !!ids);
    return 'sent';
  } catch (err) {
    console.error('[send-event-emails] removal email failed:', err);
    if (!sent) await release();
    return sent ? 'sent' : 'failed';
  }
}
