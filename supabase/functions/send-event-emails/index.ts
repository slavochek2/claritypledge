import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import {
  buildCancellation,
  buildConfirmation,
  buildUncancel,
  buildUpdate,
  cancelScheduledEmail,
  FEEDBACK_HOST_ID,
  logEmailSend,
  sendEmail,
  type SupabaseClient,
} from '../_shared/email-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleRsvp(supabase: SupabaseClient, eventId: string, userId: string) {
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, name')
    .eq('id', userId)
    .single();

  if (!profile?.email) throw new Error('Profile email not found');

  const email = profile.email;
  const profileName = profile.name as string | null;
  const eventDatetime = new Date(event.datetime);
  const now = new Date();
  const eventInPast = eventDatetime <= now;

  if (!eventInPast) {
    // 1. Confirmation — immediate (only for future events)
    const confirmation = buildConfirmation(event, profileName);
    const confirmationId = await sendEmail({ to: email, ...confirmation });
    await logEmailSend(supabase, {
      eventId,
      profileId: userId,
      emailType: 'confirmation',
      messageId: confirmationId,
      errorMessage: confirmationId ? undefined : 'Mailgun returned null message ID',
    });

    // 2. Reminder — store scheduled time; cron dispatches within 72h window
    const reminderScheduledAt = new Date(eventDatetime.getTime() - 24 * 60 * 60 * 1000);
    if (reminderScheduledAt > now) {
      await supabase
        .from('event_rsvps')
        .update({ reminder_scheduled_at: reminderScheduledAt.toISOString() })
        .eq('event_id', eventId)
        .eq('profile_id', userId);
    }
  }

  // 3. Feedback — store scheduled time for gated host only; cron dispatches
  if (event.host_id === FEEDBACK_HOST_ID) {
    const feedbackScheduledAt = new Date(
      eventDatetime.getTime() + (event.duration_minutes ?? 60) * 60 * 1000 + 2 * 60 * 60 * 1000,
    );
    if (feedbackScheduledAt > now) {
      await supabase
        .from('event_rsvps')
        .update({ feedback_scheduled_at: feedbackScheduledAt.toISOString() })
        .eq('event_id', eventId)
        .eq('profile_id', userId);
    }
  }
}

async function handleCancel(supabase: SupabaseClient, eventId: string) {
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('id, profile_id, mailgun_message_ids, profiles(email, name)')
    .eq('event_id', eventId);

  if (!rsvps) return;

  await Promise.all(rsvps.map(async (rsvp) => {
    const ids = rsvp.mailgun_message_ids as Record<string, string> | null;
    // Only cancel real Mailgun IDs — not PENDING (no Mailgun ID to cancel yet)
    if (ids?.reminder && ids.reminder !== 'PENDING') await cancelScheduledEmail(ids.reminder);
    if (ids?.feedback && ids.feedback !== 'PENDING') await cancelScheduledEmail(ids.feedback);

    const profileData = rsvp.profiles as unknown as { email: string; name: string | null } | null;
    const email = profileData?.email;
    if (email) {
      const cancellation = buildCancellation(event, profileData?.name);
      const cancellationId = await sendEmail({ to: email, ...cancellation });
      await logEmailSend(supabase, {
        eventId,
        profileId: rsvp.profile_id ?? null,
        emailType: 'cancellation',
        messageId: cancellationId,
        errorMessage: cancellationId ? undefined : 'Mailgun returned null message ID',
      });
    }
  }));
}

async function handleUncancel(supabase: SupabaseClient, eventId: string) {
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('id, profile_id, profiles(email, name)')
    .eq('event_id', eventId);

  if (!rsvps) return;

  await Promise.all(rsvps.map(async (rsvp) => {
    const profileData = rsvp.profiles as unknown as { email: string; name: string | null } | null;
    const email = profileData?.email;
    if (email) {
      const uncancel = buildUncancel(event, profileData?.name);
      const uncancelId = await sendEmail({ to: email, ...uncancel });
      await logEmailSend(supabase, {
        eventId,
        profileId: rsvp.profile_id ?? null,
        emailType: 'uncancel',
        messageId: uncancelId,
        errorMessage: uncancelId ? undefined : 'Mailgun returned null message ID',
      });
    }
  }));
}

async function handleUpdate(supabase: SupabaseClient, eventId: string) {
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('id, profile_id, mailgun_message_ids, profiles(email, name)')
    .eq('event_id', eventId);

  if (!rsvps) return;

  const eventDatetime = new Date(event.datetime);
  const now = new Date();

  // Recompute scheduled times for the new event datetime
  const reminderScheduledAt = new Date(eventDatetime.getTime() - 24 * 60 * 60 * 1000);
  const feedbackScheduledAt = event.host_id === FEEDBACK_HOST_ID
    ? new Date(eventDatetime.getTime() + (event.duration_minutes ?? 60) * 60 * 1000 + 2 * 60 * 60 * 1000)
    : null;

  await Promise.all(rsvps.map(async (rsvp) => {
    const ids = rsvp.mailgun_message_ids as Record<string, string> | null;

    // Cancel already-dispatched Mailgun IDs — skip PENDING (no real ID to cancel)
    if (ids?.reminder && ids.reminder !== 'PENDING') await cancelScheduledEmail(ids.reminder);
    if (ids?.feedback && ids.feedback !== 'PENDING') await cancelScheduledEmail(ids.feedback);

    const profileData = rsvp.profiles as unknown as { email: string; name: string | null } | null;
    const email = profileData?.email;
    if (!email) return;

    const profileName = profileData?.name;

    // Send update notice email
    const updateEmail = buildUpdate(event, profileName);
    const updateId = await sendEmail({ to: email, ...updateEmail });
    await logEmailSend(supabase, {
      eventId,
      profileId: rsvp.profile_id ?? null,
      emailType: 'update',
      messageId: updateId,
      errorMessage: updateId ? undefined : 'Mailgun returned null message ID',
    });

    if (eventDatetime <= now) return;

    // Null out mailgun_message_ids keys and reset attempted_at — cron re-dispatches with new times
    const updatePayload: Record<string, unknown> = {
      mailgun_message_ids: {},
      reminder_attempted_at: null,
      feedback_attempted_at: null,
    };

    if (reminderScheduledAt > now) {
      updatePayload.reminder_scheduled_at = reminderScheduledAt.toISOString();
    } else {
      updatePayload.reminder_scheduled_at = null;
    }

    if (feedbackScheduledAt && feedbackScheduledAt > now) {
      updatePayload.feedback_scheduled_at = feedbackScheduledAt.toISOString();
    } else {
      updatePayload.feedback_scheduled_at = null;
    }

    await supabase
      .from('event_rsvps')
      .update(updatePayload)
      .eq('id', rsvp.id);
  }));
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    if (!mailgunApiKey || !mailgunDomain) {
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const authenticatedUserId = user.id;
    const supabaseClient = createClient(SUPABASE_URL, serviceRoleKey);

    const { action, eventId } = await req.json() as {
      action: 'rsvp' | 'cancel' | 'uncancel' | 'update';
      eventId: string;
    };

    if (!action || !eventId) {
      return new Response(
        JSON.stringify({ error: 'Missing action or eventId' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (action === 'cancel' || action === 'uncancel' || action === 'update') {
      const { data: eventCheck } = await supabaseClient
        .from('events')
        .select('host_id')
        .eq('id', eventId)
        .single();
      if (!eventCheck || eventCheck.host_id !== authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }
    }

    switch (action) {
      case 'rsvp':
        await handleRsvp(supabaseClient, eventId, authenticatedUserId);
        break;
      case 'cancel':
        await handleCancel(supabaseClient, eventId);
        break;
      case 'uncancel':
        await handleUncancel(supabaseClient, eventId);
        break;
      case 'update':
        await handleUpdate(supabaseClient, eventId);
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('send-event-emails error:', err);
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
