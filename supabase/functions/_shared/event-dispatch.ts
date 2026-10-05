/**
 * Reminder and feedback dispatch for one RSVP — the per-row half of dispatch-event-emails.
 *
 * P1425: moved out of dispatch-event-emails/index.ts so it can be exercised by a test (index.ts
 * calls serve() on import). Two changes ride with the move, both from the 2026-10-03 incident in
 * which one attendee received the same reminder 13 times:
 *
 *   1. Every claim and write-back goes through `setMessageIds` — a per-key compare-and-set in the
 *      database — instead of spreading the row's `mailgun_message_ids` as read at query time and
 *      writing the whole object back. The feedback claim used to be built from the PRE-reminder
 *      read, so it erased the reminder id the reminder dispatch had just stored, and the next tick
 *      sent the reminder again.
 *   2. `dueKinds` dispatches a kind only when ITS OWN scheduled time is inside the window. The
 *      query matches a row if ANY kind is due; the old per-row check then sent feedback whenever it
 *      was unsent, including > 72h ahead, where Mailgun rejects `o:deliverytime`. Each rejection
 *      went through the same erasing write, which is what turned one duplicate into thirteen.
 */
import {
  buildFeedback,
  buildReminder,
  FEEDBACK_HOST_ID,
  feedbackFrom,
  logEmailSend,
  sendEmail,
  type EventRow,
  type ReminderPrep,
  type SupabaseClient,
} from './email-helpers.ts';
import { mintEmailLink } from './event-links.ts';
import { claimMessage, writeBackMessage } from './rsvp-message-ids.ts';

// Tolerated delta between stored *_scheduled_at and expected time (spec security review).
const MAX_TIME_DRIFT_MS = 30 * 60 * 1000; // 30 minutes

// A PENDING claim older than this is treated as stuck and taken over (after the send-log check).
// P1425: was 7h (P947, when the cron ran every 6h). With a 30-min cron a claim made within 7h of
// its own deadline could never recover. A live claim lasts one function invocation — bounded by
// the edge runtime's wall-clock limit, minutes at most — so 20 min cannot take over a live one.
export const STUCK_PENDING_THRESHOLD_MS = 20 * 60 * 1000;

/** Mailgun EU rejects an `o:deliverytime` further ahead than this. */
export const DISPATCH_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface RsvpRow {
  id: string;
  event_id: string;
  profile_id: string | null;
  reminder_scheduled_at: string | null;
  feedback_scheduled_at: string | null;
  reminder_attempted_at: string | null;
  feedback_attempted_at: string | null;
  mailgun_message_ids: Record<string, string> | null;
  profiles: { email: string; name: string | null } | null;
  events: EventRow & { status: string; host_id: string | null };
}

/**
 * P1256: why dispatchFeedback reports an outcome instead of returning void.
 *
 * It has five silent bail-outs (no email, not scheduled, host not gated, time drift,
 * already claimed). While it returned void, the backfill could only count how many rows
 * it had HANDED to it — so a run in which all 8 were skipped on the drift check reported
 * `dispatched: 8, errors: 0`, identical to a run in which 8 emails went out. logEmailSend
 * is skipped on a bail too, so the send log was empty either way, and empty is exactly
 * what it looked like before the backfill ran. The operator's only signal agreed with
 * both worlds.
 *
 * P1425: dispatchReminder reports one too, so the cron's `dispatched` counts emails Mailgun
 * accepted rather than rows handed over.
 */
export type DispatchOutcome =
  | 'sent'
  | 'failed:mailgun'
  | 'skipped:no-email'
  | 'skipped:not-scheduled'
  | 'skipped:host-not-gated'
  | 'skipped:time-drift'
  | 'skipped:already-claimed'
  | 'skipped:already-sent' // a stuck claim whose send WAS recorded: id repaired, nothing re-sent
  | 'error:db' // the claim RPC or send-log read failed — counted as an error, never as a skip
  | 'error:writeback' // SENT, but the id could not be stored; the stuck path repairs it from the log
  | 'error:threw';

export function isStuckPending(attemptedAt: string | null, now: Date = new Date()): boolean {
  if (!attemptedAt) return false;
  return now.getTime() - new Date(attemptedAt).getTime() > STUCK_PENDING_THRESHOLD_MS;
}

function withinDrift(stored: string, expected: Date): boolean {
  return Math.abs(new Date(stored).getTime() - expected.getTime()) <= MAX_TIME_DRIFT_MS;
}

/**
 * P1425: which kinds THIS row should send on THIS tick. A kind is due only when its own scheduled
 * time is in (now, windowEnd] and it is unsent (or its claim is stuck). Pure.
 */
export function dueKinds(
  rsvp: Omit<RsvpRow, 'id' | 'event_id' | 'profile_id' | 'profiles' | 'events'>,
  now: Date,
  windowEnd: Date = new Date(now.getTime() + DISPATCH_WINDOW_MS),
): { reminder: boolean; feedback: boolean } {
  const ids = rsvp.mailgun_message_ids ?? {};
  const inWindow = (t: string | null) => {
    if (!t) return false;
    const ms = new Date(t).getTime();
    return ms > now.getTime() && ms <= windowEnd.getTime();
  };
  const unsent = (v: string | undefined, attemptedAt: string | null) =>
    v == null || (v === 'PENDING' && isStuckPending(attemptedAt, now));
  return {
    reminder: inWindow(rsvp.reminder_scheduled_at) && unsent(ids.reminder, rsvp.reminder_attempted_at),
    feedback: inWindow(rsvp.feedback_scheduled_at) && unsent(ids.feedback, rsvp.feedback_attempted_at),
  };
}

export async function dispatchReminder(
  supabase: SupabaseClient,
  rsvp: RsvpRow,
  now: Date,
): Promise<DispatchOutcome> {
  const { events: event, profile_id: profileId, profiles: profileData } = rsvp;
  const email = profileData?.email;
  if (!email) return 'skipped:no-email';
  if (!rsvp.reminder_scheduled_at) return 'skipped:not-scheduled';

  // Validate stored time matches expected (security: guard against crafted RSVPs)
  const expectedReminder = new Date(new Date(event.datetime).getTime() - 24 * 60 * 60 * 1000);
  if (!withinDrift(rsvp.reminder_scheduled_at, expectedReminder)) {
    console.warn(`Skipping reminder for rsvp ${rsvp.id}: stored time drifts >30min from expected`);
    return 'skipped:time-drift';
  }

  // Atomic claim (P1425: claim token in reminder_attempted_at; a stuck claim is taken over only
  // after the send log shows its send never went out — P947's claim never re-claimed at all).
  const claim = await claimMessage(
    supabase, rsvp, 'reminder', rsvp.mailgun_message_ids?.reminder, rsvp.reminder_attempted_at, now,
    STUCK_PENDING_THRESHOLD_MS,
  );
  if (claim.status !== 'claimed') return claimOutcome(claim.status);

  const deliverAt = new Date(rsvp.reminder_scheduled_at);
  // P1380: on a Preparation-on event the reminder is about the preparation if it is not done.
  // A failed read degrades to today's reminder rather than skipping the send.
  let prep: ReminderPrep | null = null;
  let prepareUrl: string | null = null;
  if (event.preparation_enabled && profileId) {
    const { data: prepRow, error: prepErr } = await supabase
      .from('event_preparations')
      .select('started_at, completed_at')
      .eq('event_id', rsvp.event_id)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (prepErr) {
      console.warn(`reminder prep read failed for rsvp ${rsvp.id}: ${prepErr.message}`);
    } else {
      prep = prepRow?.completed_at ? 'complete' : prepRow?.started_at ? 'started' : 'not_started';
      if (prep !== 'complete') prepareUrl = await mintEmailLink(supabase, rsvp.id, 'prepare', event);
    }
  }
  const reminder = buildReminder(event, profileData?.name, { prep, prepareUrl });
  const messageId = await sendEmail({ to: email, ...reminder, deliverAt });

  // Write the real id over OUR claim only (PENDING + our token). If handleUpdate reset the row
  // between claim and write-back, this matches nothing and the id is not stored: the old Mailgun
  // send fires at the old time (accepted race; P947 arch decision 5) and the new time re-queues on
  // the next tick. On a Mailgun failure the key is removed, so the next tick retries.
  const stored = await writeBackMessage(supabase, rsvp.id, 'reminder', claim.token, { reminder: messageId ?? null });

  await logEmailSend(supabase, {
    eventId: rsvp.event_id,
    profileId,
    emailType: 'reminder',
    messageId,
    errorMessage: messageId ? undefined : 'Mailgun returned null message ID',
  });

  if (!messageId) return 'failed:mailgun';
  return stored === 'error' ? 'error:writeback' : 'sent';
}

export async function dispatchFeedback(
  supabase: SupabaseClient,
  rsvp: RsvpRow,
  now: Date,
  /**
   * P1256 backfill: send NOW rather than handing Mailgun the stored
   * `feedback_scheduled_at` as `o:deliverytime`. On the normal path that stored
   * time is in the future and scheduling is the whole point; on the backfill path
   * it is in the PAST, and a past `o:deliverytime` is not a thing worth relying on
   * — this drops the header instead of betting on how Mailgun rounds it.
   * Every other guard (host gate, drift check, atomic claim, send log) is shared.
   */
  immediate = false,
): Promise<DispatchOutcome> {
  const { events: event, profile_id: profileId, profiles: profileData } = rsvp;
  const email = profileData?.email;
  if (!email) return 'skipped:no-email';
  if (!rsvp.feedback_scheduled_at) return 'skipped:not-scheduled';

  // Gate: only dispatch feedback for gated host
  if (event.host_id !== FEEDBACK_HOST_ID) return 'skipped:host-not-gated';

  // Validate stored time
  const expectedFeedback = new Date(
    new Date(event.datetime).getTime() + (event.duration_minutes ?? 60) * 60 * 1000 + 2 * 60 * 60 * 1000,
  );
  if (!withinDrift(rsvp.feedback_scheduled_at, expectedFeedback)) {
    console.warn(`Skipping feedback for rsvp ${rsvp.id}: stored time drifts >30min from expected`);
    return 'skipped:time-drift';
  }

  const claim = await claimMessage(
    supabase, rsvp, 'feedback', rsvp.mailgun_message_ids?.feedback, rsvp.feedback_attempted_at, now,
    STUCK_PENDING_THRESHOLD_MS,
  );
  if (claim.status !== 'claimed') return claimOutcome(claim.status);

  // Fetch host name for feedbackFrom sender
  const { data: host } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', event.host_id)
    .single();

  const from = feedbackFrom(host?.name as string | null);
  const deliverAt = immediate ? undefined : new Date(rsvp.feedback_scheduled_at);
  const feedback = buildFeedback(event, profileData?.name);
  const messageId = await sendEmail({ to: email, ...feedback, from, deliverAt });

  const stored = await writeBackMessage(supabase, rsvp.id, 'feedback', claim.token, { feedback: messageId ?? null });

  await logEmailSend(supabase, {
    eventId: rsvp.event_id,
    profileId,
    emailType: 'feedback',
    messageId,
    errorMessage: messageId ? undefined : 'Mailgun returned null message ID',
  });

  if (!messageId) return 'failed:mailgun';
  return stored === 'error' ? 'error:writeback' : 'sent';
}

function claimOutcome(status: 'held' | 'repaired' | 'error'): DispatchOutcome {
  return status === 'held' ? 'skipped:already-claimed' : status === 'repaired' ? 'skipped:already-sent' : 'error:db';
}

/** An outcome the cron counts as an error (P1425: a dead RPC must not read as a healthy skip). */
export function isErrorOutcome(o: DispatchOutcome): boolean {
  return o === 'failed:mailgun' || o === 'error:db' || o === 'error:writeback' || o === 'error:threw';
}

/**
 * One cron tick's work for one row: each kind that is due, reminder first. A throw in one kind is
 * recorded and does not hide the other kind's outcome from the cron's counts.
 */
export async function dispatchRsvp(
  supabase: SupabaseClient,
  rsvp: RsvpRow,
  now: Date,
  windowEnd: Date = new Date(now.getTime() + DISPATCH_WINDOW_MS),
): Promise<DispatchOutcome[]> {
  const due = dueKinds(rsvp, now, windowEnd);
  const outcomes: DispatchOutcome[] = [];
  const run = async (kind: string, fn: () => Promise<DispatchOutcome>) => {
    try {
      outcomes.push(await fn());
    } catch (err) {
      console.error(`dispatch ${kind} threw for rsvp ${rsvp.id}:`, err);
      outcomes.push('error:threw');
    }
  };
  if (due.reminder) await run('reminder', () => dispatchReminder(supabase, rsvp, now));
  if (due.feedback) await run('feedback', () => dispatchFeedback(supabase, rsvp, now));
  return outcomes;
}
