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

  // Atomic claim: set mailgun_message_ids->reminder = 'PENDING' only if currently NULL
  // PostgREST: .eq('mailgun_message_ids->>reminder', null) uses IS NULL semantics for JSONB extraction
  const currentIds = rsvp.mailgun_message_ids ?? {};
  const claimIds = { ...currentIds, reminder: 'PENDING' };

  const { data: claimed } = await supabase
    .from('event_rsvps')
    .update({
      mailgun_message_ids: claimIds,
      reminder_attempted_at: now.toISOString(),
    })
    .eq('id', rsvp.id)
    .is('mailgun_message_ids->>reminder' as string, null)
    .select('id')
    .maybeSingle();

  if (!claimed) {
    // Another cron run already claimed or dispatched this row
    return;
  }

  const deliverAt = new Date(rsvp.reminder_scheduled_at);
  const reminder = buildReminder(event, profileData?.name);
  const messageId = await sendEmail({ to: email, ...reminder, deliverAt });

  // Write real ID back — conditional on PENDING to handle handleUpdate race
  const finalIds = { ...claimIds, reminder: messageId ?? null };
  await supabase
    .from('event_rsvps')
    .update({ mailgun_message_ids: finalIds })
    .eq('id', rsvp.id)
    .eq('mailgun_message_ids->>reminder' as string, 'PENDING');

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
): Promise<void> {
  const { events: event, profile_id: profileId, profiles: profileData } = rsvp;
  const email = profileData?.email;
  if (!email || !rsvp.feedback_scheduled_at) return;

  // Gate: only dispatch feedback for gated host
  if (event.host_id !== FEEDBACK_HOST_ID) return;

  // Validate stored time
  const expectedFeedback = new Date(
    new Date(event.datetime).getTime() + (event.duration_minutes ?? 60) * 60 * 1000 + 2 * 60 * 60 * 1000,
  );
  if (!withinDrift(rsvp.feedback_scheduled_at, expectedFeedback)) {
    console.warn(`Skipping feedback for rsvp ${rsvp.id}: stored time drifts >30min from expected`);
    return;
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
    .is('mailgun_message_ids->>feedback' as string, null)
    .select('id')
    .maybeSingle();

  if (!claimed) return;

  // Fetch host name for feedbackFrom sender
  const { data: host } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', event.host_id)
    .single();

  const from = feedbackFrom(host?.name as string | null);
  const deliverAt = new Date(rsvp.feedback_scheduled_at);
  const feedback = buildFeedback(event, profileData?.name);
  const messageId = await sendEmail({ to: email, ...feedback, from, deliverAt });

  const finalIds = { ...claimIds, feedback: messageId ?? null };
  await supabase
    .from('event_rsvps')
    .update({ mailgun_message_ids: finalIds })
    .eq('id', rsvp.id)
    .eq('mailgun_message_ids->>feedback' as string, 'PENDING');

  await logEmailSend(supabase, {
    eventId: rsvp.event_id,
    profileId,
    emailType: 'feedback',
    messageId,
    errorMessage: messageId ? undefined : 'Mailgun returned null message ID',
  });
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
  // CRON_SECRET authorization — no user JWT
  const authHeader = req.headers.get('Authorization');
  const expectedAuth = `Bearer ${CRON_SECRET}`;
  if (!CRON_SECRET || authHeader !== expectedAuth) {
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

  try {
    const result = await runDispatch(supabase);
    console.log(`dispatch complete: ${result.dispatched} dispatched, ${result.errors} errors`);
    return new Response(JSON.stringify({ ok: true, ...result }), {
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
