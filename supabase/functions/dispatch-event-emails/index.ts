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
import { type SupabaseClient } from '../_shared/email-helpers.ts';
import {
  DISPATCH_WINDOW_MS,
  dispatchFeedback,
  dispatchRsvp,
  STUCK_PENDING_THRESHOLD_MS,
  type RsvpRow,
} from '../_shared/event-dispatch.ts';
import {
  dispatchStartingSoon,
  STARTING_SOON_SELECT,
  STARTING_SOON_STUCK_MS,
  STARTING_SOON_WINDOW_MS,
  type StartingSoonRsvp,
} from '../_shared/starting-soon.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

/** P1256: the backfill target is interpolated into a PostgREST filter — pin its shape. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      events!inner(id, title, datetime, duration_minutes, timezone, location, description, slug, host_id, status, preparation_enabled)
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
  const windowEnd = new Date(now.getTime() + DISPATCH_WINDOW_MS);
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
      events!inner(id, title, datetime, duration_minutes, timezone, location, description, slug, host_id, status, preparation_enabled)
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
      // P1425: the query returns a row when ANY kind is due; dispatchRsvp sends only the kinds
      // whose own time is inside [now, windowEnd]. Counts emails Mailgun accepted.
      for (const outcome of await dispatchRsvp(supabase, rsvp, now, windowEnd)) {
        if (outcome === 'sent') dispatched++;
        else if (outcome === 'failed:mailgun') errors++;
      }
    } catch (err) {
      console.error(`dispatch error for rsvp ${rsvp.id}:`, err);
      errors++;
    }
  }));

  return { dispatched, errors };
}

/**
 * P1380: the starting-soon pass. Run by the handler BESIDE runDispatch, never from inside it:
 * runDispatch returns early when no reminder/feedback row is due, which is the normal state
 * 45 minutes before an event (its reminder went out a day earlier) — nesting this pass inside
 * it meant the email almost never went (code review, 2026-10-01). Its own query, not a branch
 * of the one above: that query
 * selects on *_scheduled_at columns, and this email is keyed on the event's start instead —
 * nothing needs storing at RSVP time, so an event moved by the host is followed automatically.
 */
async function runStartingSoon(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ dispatched: number; errors: number }> {
  const windowEnd = new Date(now.getTime() + STARTING_SOON_WINDOW_MS);
  const stuckBefore = new Date(now.getTime() - STARTING_SOON_STUCK_MS);
  const { data: rows, error } = await supabase
    .from('event_rsvps')
    .select(STARTING_SOON_SELECT)
    .eq('events.preparation_enabled', true)
    .neq('events.status', 'cancelled')
    .gt('events.datetime', now.toISOString())
    .lte('events.datetime', windowEnd.toISOString())
    .or(
      `mailgun_message_ids->>starting_soon.is.null,` +
      `and(mailgun_message_ids->>starting_soon.eq.PENDING,starting_soon_attempted_at.lt.${stuckBefore.toISOString()})`,
    );

  if (error) {
    console.error('starting-soon query error:', error.message);
    return { dispatched: 0, errors: 1 };
  }
  let dispatched = 0;
  let errors = 0;
  for (const rsvp of (rows ?? []) as unknown as StartingSoonRsvp[]) {
    try {
      const outcome = await dispatchStartingSoon(supabase, rsvp, now);
      if (outcome === 'sent') dispatched++;
      else if (outcome === 'failed:mailgun') errors++;
      console.log(`starting-soon rsvp ${rsvp.id}: ${outcome}`);
    } catch (err) {
      console.error(`starting-soon error for rsvp ${rsvp.id}:`, err);
      errors++;
    }
  }
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

    // Two independent passes: a failure or an empty result in one never skips the other.
    const main = await runDispatch(supabase);
    const soon = await runStartingSoon(supabase, new Date());
    const result = { dispatched: main.dispatched + soon.dispatched, errors: main.errors + soon.errors };
    console.log(`dispatch complete: ${result.dispatched} dispatched, ${result.errors} errors (starting-soon: ${soon.dispatched}/${soon.errors})`);
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
