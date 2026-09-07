/**
 * Cron dispatcher for reminder and feedback emails.
 *
 * Scheduled every 6h via supabase.toml. Queries event_rsvps for rows whose
 * *_scheduled_at is within the next 72h (Mailgun EU limit) and dispatches them
 * with atomic claims to prevent double-send from concurrent invocations.
 *
 * Auth: CRON_SECRET bearer token — no user JWT.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildFeedback,
  buildReminder,
  cancelScheduledEmail as _cancelScheduledEmail,
  FEEDBACK_HOST_ID,
  feedbackFrom,
  logEmailSend,
  sendEmail,
  type EventRow,
  type SupabaseClient,
} from '../_shared/email-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

// Tolerated delta between stored *_scheduled_at and expected time (spec security review).
const MAX_TIME_DRIFT_MS = 30 * 60 * 1000; // 30 minutes

// A PENDING row older than this is treated as stuck and retried.
/** P1256: the backfill target is interpolated into a PostgREST filter — pin its shape. */
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
 * That mattered specifically for this feature's whole purpose: a one-shot send to 8 real
 * people, where "did it work?" has to be answerable from the response.
 */
type FeedbackOutcome =
  | 'sent'
  | 'failed:mailgun'
  | 'skipped:no-email'
  | 'skipped:not-scheduled'
  | 'skipped:host-not-gated'
  | 'skipped:time-drift'
  | 'skipped:already-claimed';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STUCK_PENDING_THRESHOLD_MS = 7 * 60 * 60 * 1000; // 7 hours

interface RsvpRow {
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

function isStuckPending(attemptedAt: string | null): boolean {
  if (!attemptedAt) return false;
  return Date.now() - new Date(attemptedAt).getTime() > STUCK_PENDING_THRESHOLD_MS;
}

function withinDrift(stored: string, expected: Date): boolean {
  return Math.abs(new Date(stored).getTime() - expected.getTime()) <= MAX_TIME_DRIFT_MS;
}

async function dispatchReminder(
  supabase: SupabaseClient,
  rsvp: RsvpRow,
  now: Date,
): Promise<void> {
  const { events: event, profile_id: profileId, profiles: profileData } = rsvp;
  const email = profileData?.email;
  if (!email || !rsvp.reminder_scheduled_at) return;

  // Validate stored time matches expected (security: guard against crafted RSVPs)
  const expectedReminder = new Date(new Date(event.datetime).getTime() - 24 * 60 * 60 * 1000);
  if (!withinDrift(rsvp.reminder_scheduled_at, expectedReminder)) {
    console.warn(`Skipping reminder for rsvp ${rsvp.id}: stored time drifts >30min from expected`);
    return;
  }

  // Atomic claim: set mailgun_message_ids->reminder = 'PENDING' only if currently NULL.
  //
  // P1256: the old note here said ".is() only works on real columns, not JSONB
  // extractions" — that is FALSE, and it is why this file carries three spellings of one
  // condition. Checked against the client rather than repeated: PostgrestFilterBuilder
  // emits `<column>=is.null` for `.is(col, null)` and `<column>=<op>.<value>` for
  // `.filter(col, 'is', 'null')`, so these two and the `.or()` string below produce
  // byte-identical request parameters. Either form is correct on a JSONB extraction.
  // Keeping .filter() here only because it is what shipped; do not read a meaning into
  // the difference.
  const currentIds = rsvp.mailgun_message_ids ?? {};
  const claimIds = { ...currentIds, reminder: 'PENDING' };

  const { data: claimed } = await supabase
    .from('event_rsvps')
    .update({
      mailgun_message_ids: claimIds,
      reminder_attempted_at: now.toISOString(),
    })
    .eq('id', rsvp.id)
    .filter('mailgun_message_ids->>reminder', 'is', 'null')
    .select('id')
    .maybeSingle();

  if (!claimed) {
    // Another cron run already claimed or dispatched this row
    return;
  }

  const deliverAt = new Date(rsvp.reminder_scheduled_at);
  const reminder = buildReminder(event, profileData?.name);
  const messageId = await sendEmail({ to: email, ...reminder, deliverAt });

  // Write real ID back — conditional on PENDING to handle handleUpdate race.
  // If handleUpdate nulled the key between claim and write-back, this update matches
  // zero rows and the ID is not stored. The old Mailgun send fires at the old time
  // (accepted race; spec arch decision 5). The new time re-queues on next cron run.
  const finalIds = { ...claimIds, reminder: messageId ?? null };
  await supabase
    .from('event_rsvps')
    .update({ mailgun_message_ids: finalIds })
    .eq('id', rsvp.id)
    .filter('mailgun_message_ids->>reminder', 'eq', 'PENDING');

  await logEmailSend(supabase, {
    eventId: rsvp.event_id,
    profileId,
    emailType: 'reminder',
    messageId,
    errorMessage: messageId ? undefined : 'Mailgun returned null message ID',
  });
}

async function dispatchFeedback(
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
): Promise<FeedbackOutcome> {
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

  const currentIds = rsvp.mailgun_message_ids ?? {};
  const claimIds = { ...currentIds, feedback: 'PENDING' };

  const { data: claimed } = await supabase
    .from('event_rsvps')
    .update({
      mailgun_message_ids: claimIds,
      feedback_attempted_at: now.toISOString(),
    })
    .eq('id', rsvp.id)
    .filter('mailgun_message_ids->>feedback', 'is', 'null')
    .select('id')
    .maybeSingle();

  if (!claimed) return 'skipped:already-claimed';

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

  const finalIds = { ...claimIds, feedback: messageId ?? null };
  await supabase
    .from('event_rsvps')
    .update({ mailgun_message_ids: finalIds })
    .eq('id', rsvp.id)
    .filter('mailgun_message_ids->>feedback', 'eq', 'PENDING');

  await logEmailSend(supabase, {
    eventId: rsvp.event_id,
    profileId,
    emailType: 'feedback',
    messageId,
    errorMessage: messageId ? undefined : 'Mailgun returned null message ID',
  });

  return messageId ? 'sent' : 'failed:mailgun';
}

/**
 * P1256: send the feedback email for an event whose feedback time has ALREADY PASSED.
 *
 * WHY THIS EXISTS. `runDispatch` selects on `feedback_scheduled_at > now()` — it
 * hands Mailgun a future delivery time, so it only ever looks FORWARD. That makes
 * the past an absorbing state: once a row's scheduled moment slips by unsent, no
 * number of subsequent cron runs will ever see it again. Between P947 (2026-06-10)
 * and P1256 nothing invoked the dispatcher at all, so every reminder and every
 * feedback email in that window fell into exactly this hole — 8 of them for the
 * 2026-09-06 hike alone, all with a correct `feedback_scheduled_at` and an empty
 * `mailgun_message_ids`.
 *
 * It is deliberately NOT wired into the cron tick. A scheduled job that
 * retroactively mails everyone it finds behind it is how a backlog turns into a
 * mass send; this runs only when a human names one event id.
 *
 * What it does NOT relax:
 *   - the CRON_SECRET check (shared with the cron path, in the handler)
 *   - the FEEDBACK_HOST_ID host gate, inside dispatchFeedback
 *   - the drift check — `feedback_scheduled_at` must still be within 30min of
 *     `datetime + duration + 2h`. A row whose schedule was never computed, or was
 *     computed under different event details, is skipped rather than guessed at.
 *   - the atomic PENDING claim on `mailgun_message_ids->>feedback`, which is what
 *     makes a double invocation safe: the second one claims nothing and sends
 *     nothing.
 *   - `logEmailSend`
 *
 * So the honest description is: it is `runDispatch`'s feedback branch with the
 * forward-looking time filter replaced by an explicit event id, and rows that
 * already have a message id still excluded.
 */
async function runFeedbackBackfill(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
  outcomes: Record<string, number>;
}> {
  const now = new Date();

  const { data: rows, error } = await supabase
    .from('event_rsvps')
    .select(`
      id, event_id, profile_id,
      reminder_scheduled_at, feedback_scheduled_at,
      reminder_attempted_at, feedback_attempted_at,
      mailgun_message_ids,
      profiles(email, name),
      events!inner(id, title, datetime, duration_minutes, timezone, location, description, slug, host_id, status)
    `)
    .eq('event_id', eventId)
    .neq('events.status', 'cancelled')
    .not('feedback_scheduled_at', 'is', null)
    // Past only. A future-scheduled row is the cron's job, not this one — mailing
    // it now would send a "how was it?" before the event has happened.
    .lt('feedback_scheduled_at', now.toISOString())
    .is('mailgun_message_ids->>feedback', null);

  if (error) {
    console.error('backfill query error:', error.message);
    return { eligible: 0, sent: 0, skipped: 0, errors: 1, outcomes: { 'error:query': 1 } };
  }
  if (!rows || rows.length === 0) {
    console.log(`backfill: no eligible rows for event ${eventId}`);
    return { eligible: 0, sent: 0, skipped: 0, errors: 0, outcomes: {} };
  }

  console.log(`backfill: ${rows.length} eligible row(s) for event ${eventId}`);

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const outcomes: Record<string, number> = {};

  // Sequential, not Promise.all: this is a human-triggered send to real people and
  // the row count is small. Serial keeps the log readable and cannot burst Mailgun.
  for (const rsvp of rows as unknown as RsvpRow[]) {
    try {
      const outcome = await dispatchFeedback(supabase, rsvp, now, true);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      if (outcome === 'sent') sent++;
      else if (outcome === 'failed:mailgun') errors++;
      else skipped++;
      console.log(`backfill rsvp ${rsvp.id}: ${outcome}`);
    } catch (err) {
      console.error(`backfill error for rsvp ${rsvp.id}:`, err);
      outcomes['error:threw'] = (outcomes['error:threw'] ?? 0) + 1;
      errors++;
    }
  }

  // `sent` counts emails Mailgun accepted — NOT rows handed to dispatchFeedback.
  // `outcomes` names every skip reason so a run that mailed nobody says WHY, in the
  // response, rather than reading identically to a run that mailed everyone.
  return { eligible: rows.length, sent, skipped, errors, outcomes };
}

async function runDispatch(supabase: SupabaseClient): Promise<{ dispatched: number; errors: number }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const stuckThreshold = new Date(now.getTime() - STUCK_PENDING_THRESHOLD_MS);

  // Query rows eligible for reminder or feedback dispatch
  // Includes stuck PENDING rows (attempted_at older than threshold)
  const { data: rows, error } = await supabase
    .from('event_rsvps')
    .select(`
      id, event_id, profile_id,
      reminder_scheduled_at, feedback_scheduled_at,
      reminder_attempted_at, feedback_attempted_at,
      mailgun_message_ids,
      profiles(email, name),
      events!inner(id, title, datetime, duration_minutes, timezone, location, description, slug, host_id, status)
    `)
    .neq('events.status', 'cancelled')
    .or(
      `and(reminder_scheduled_at.lte.${windowEnd.toISOString()},reminder_scheduled_at.gt.${now.toISOString()},mailgun_message_ids->>reminder.is.null),` +
      `and(reminder_scheduled_at.lte.${windowEnd.toISOString()},reminder_scheduled_at.gt.${now.toISOString()},mailgun_message_ids->>reminder.eq.PENDING,reminder_attempted_at.lt.${stuckThreshold.toISOString()}),` +
      `and(feedback_scheduled_at.lte.${windowEnd.toISOString()},feedback_scheduled_at.gt.${now.toISOString()},mailgun_message_ids->>feedback.is.null),` +
      `and(feedback_scheduled_at.lte.${windowEnd.toISOString()},feedback_scheduled_at.gt.${now.toISOString()},mailgun_message_ids->>feedback.eq.PENDING,feedback_attempted_at.lt.${stuckThreshold.toISOString()})`
    );

  if (error) {
    console.error('dispatch query error:', error.message);
    return { dispatched: 0, errors: 1 };
  }

  if (!rows || rows.length === 0) {
    console.log('dispatch: no eligible rows');
    return { dispatched: 0, errors: 0 };
  }

  console.log(`dispatch: ${rows.length} eligible rows`);

  let dispatched = 0;
  let errors = 0;

  await Promise.all((rows as unknown as RsvpRow[]).map(async (rsvp) => {
    try {
      const ids = rsvp.mailgun_message_ids ?? {};
      const needsReminder = rsvp.reminder_scheduled_at &&
        (ids.reminder == null || (ids.reminder === 'PENDING' && isStuckPending(rsvp.reminder_attempted_at)));
      const needsFeedback = rsvp.feedback_scheduled_at &&
        (ids.feedback == null || (ids.feedback === 'PENDING' && isStuckPending(rsvp.feedback_attempted_at)));

      if (needsReminder) {
        await dispatchReminder(supabase, rsvp, now);
        dispatched++;
      }
      if (needsFeedback) {
        await dispatchFeedback(supabase, rsvp, now);
        dispatched++;
      }
    } catch (err) {
      console.error(`dispatch error for rsvp ${rsvp.id}:`, err);
      errors++;
    }
  }));

  return { dispatched, errors };
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CRON_SECRET authorization — no USER jwt, but see the header note below.
  //
  // P1256: the secret may arrive in EITHER of two headers, and the second one is not a
  // convenience — it is the only one that can work from pg_cron.
  //
  // This function is deployed WITH gateway JWT verification (deploy-functions.sh gives
  // --no-verify-jwt to create-and-sign alone). So Supabase's gateway parses
  // `Authorization` and rejects anything that is not a well-formed JWT *before* this
  // handler ever runs. CRON_SECRET is a 64-char hex string, not a JWT — so the original
  // design, `Authorization: Bearer <CRON_SECRET>`, could never have reached this code
  // from anywhere. It answers 401 UNAUTHORIZED_INVALID_JWT_FORMAT at the gateway.
  //
  // That is a SECOND defect behind the quoting bug that broke the cron job for three
  // months: fixing the quotes alone would have turned 328 Postgres errors into 328
  // gateway 401s, and the emails still would not have sent. Measured, not reasoned —
  // the first repaired tick returned exactly that.
  //
  // So the caller now sends the anon key (a real JWT, public by design) in
  // `Authorization` to satisfy the gateway, and the actual secret in `x-cron-secret`.
  // The `Authorization` form is still accepted so the existing authz regression test and
  // any manual `curl` keep working unchanged.
  const authHeader = req.headers.get('Authorization');
  const cronHeader = req.headers.get('x-cron-secret');
  const authorized = !!CRON_SECRET &&
    (authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET);
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // P1256: opt-in backfill. The cron tick posts `{}` and takes the normal path;
  // only an explicit `backfill_event_id` reaches runFeedbackBackfill. Parsed
  // defensively — a body that is absent, empty or not JSON is the cron's shape.
  let backfillEventId: string | null = null;
  try {
    const raw = await req.text();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { backfill_event_id?: unknown };
      if (typeof parsed.backfill_event_id === 'string') backfillEventId = parsed.backfill_event_id.trim();
    }
  } catch {
    // Not JSON — treat as the cron's empty body rather than failing the tick.
  }

  if (backfillEventId !== null && !UUID_RE.test(backfillEventId)) {
    return new Response(JSON.stringify({ error: 'backfill_event_id must be a uuid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (backfillEventId) {
      const result = await runFeedbackBackfill(supabase, backfillEventId);
      console.log(
        `backfill complete for ${backfillEventId}: ${result.sent} SENT of ${result.eligible} eligible, ` +
        `${result.skipped} skipped, ${result.errors} errors — ${JSON.stringify(result.outcomes)}`,
      );
      return new Response(JSON.stringify({ ok: true, mode: 'backfill', event_id: backfillEventId, ...result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await runDispatch(supabase);
    console.log(`dispatch complete: ${result.dispatched} dispatched, ${result.errors} errors`);
    return new Response(JSON.stringify({ ok: true, mode: 'cron', ...result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('dispatch-event-emails fatal error:', err);
    return new Response(JSON.stringify({ error: 'Dispatch failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
