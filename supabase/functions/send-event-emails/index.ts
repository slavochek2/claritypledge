import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY')!;
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN')!;
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const TALLY_FORM_ID = Deno.env.get('TALLY_FORM_ID') ?? 'wa7RRq';

const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

const FROM = `Clarity Pledge Events <events@${MAILGUN_DOMAIN}>`;

// ── HTML email base template ──────────────────────────────────────────────────

function htmlEmail(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:24px 40px;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">Clarity Pledge</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 40px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Clarity Pledge · <a href="https://claritypledge.com" style="color:#9ca3af;">claritypledge.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;margin-top:20px;">${text}</a>`;
}

function eventCard(event: EventRow): string {
  const date = formatDate(event.datetime, event.timezone);
  const locationLine = formatLocation(event.location);
  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 12px;font-size:20px;font-weight:600;color:#111827;">${event.title}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#4b5563;">📅 ${date}</p>
      ${locationLine ? `<p style="margin:0;font-size:14px;color:#4b5563;">${locationLine}</p>` : ''}
    </div>`;
}

function formatLocation(location: string | null): string {
  if (!location) return '';
  const isUrl = location.startsWith('http://') || location.startsWith('https://');
  if (isUrl) {
    return `🔗 <a href="${location}" style="color:#2563eb;">Join online</a>`;
  }
  return `📍 ${location}`;
}

function formatDate(datetime: string, timezone: string | null): string {
  const tz = timezone ?? 'UTC';
  try {
    const d = new Date(datetime);
    return d.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return new Date(datetime).toUTCString();
  }
}

function tallyUrl(eventId: string): string {
  return `https://tally.so/r/${TALLY_FORM_ID}?event_id=${eventId}`;
}

function eventPageUrl(slug: string): string {
  return `https://claritypledge.com/events/${slug}`;
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function calendarLinks(event: EventRow): string {
  const start = new Date(event.datetime);
  const end = new Date(start.getTime() + (event.duration_minutes ?? 60) * 60 * 1000);
  const startStr = formatICSDate(start);
  const endStr = formatICSDate(end);
  const loc = event.location ?? '';

  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startStr}/${endStr}&location=${encodeURIComponent(loc)}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(event.title)}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&location=${encodeURIComponent(loc)}`;
  const office365 = `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(event.title)}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&location=${encodeURIComponent(loc)}`;

  return `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
    Add to calendar:
    <a href="${google}" style="color:#2563eb;">Google</a> ·
    <a href="${outlook}" style="color:#2563eb;">Outlook</a> ·
    <a href="${office365}" style="color:#2563eb;">Office 365</a>
  </p>`;
}

// ── Email builders ────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  timezone: string | null;
  location: string | null;
  description: string | null;
  slug: string | null;
}

function buildConfirmation(event: EventRow): { subject: string; html: string; text: string } {
  const subject = `You're going to: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${eventPageUrl(event.slug)}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">You're confirmed! 🎉</h1>
    <p style="margin:0 0 4px;font-size:16px;color:#4b5563;">We're looking forward to seeing you.</p>
    ${eventCard(event)}
    ${eventLink}
    ${calendarLinks(event)}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      Questions? Reply to this email and we'll get back to you.
    </p>
  `);
  const text = `You're going to: ${event.title}\n\n${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}\n\nSee you there!\nClarity Pledge`;
  return { subject, html, text };
}

function buildReminder(event: EventRow): { subject: string; html: string; text: string } {
  const subject = `Tomorrow: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${eventPageUrl(event.slug)}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">See you tomorrow! 👋</h1>
    <p style="margin:0 0 4px;font-size:16px;color:#4b5563;">Just a reminder about tomorrow's event.</p>
    ${eventCard(event)}
    ${eventLink}
    ${calendarLinks(event)}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      Questions? Reply to this email.
    </p>
  `);
  const text = `Reminder: ${event.title} is tomorrow.\n\n${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}\n\nSee you there!\nClarity Pledge`;
  return { subject, html, text };
}

function buildFeedback(event: EventRow): { subject: string; html: string; text: string } {
  const subject = `How was ${event.title}?`;
  const feedbackUrl = tallyUrl(event.id);
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${eventPageUrl(event.slug)}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Thanks for joining us!</h1>
    <p style="margin:0;font-size:16px;color:#4b5563;">
      We'd love to hear how <strong>${event.title}</strong> went for you.
      It takes about 1 minute.
    </p>
    ${button('Share your feedback', feedbackUrl)}
    ${eventLink}
    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
      Your feedback helps us make future events even better. Thank you!
    </p>
  `);
  const text = `Thanks for joining ${event.title}!\n\nShare your feedback (1 min): ${feedbackUrl}\n\nClarity Pledge`;
  return { subject, html, text };
}

function buildCancellation(event: EventRow): { subject: string; html: string; text: string } {
  const subject = `Event cancelled: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${eventPageUrl(event.slug)}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Event cancelled</h1>
    <p style="margin:0;font-size:16px;color:#4b5563;">
      Unfortunately, <strong>${event.title}</strong> has been cancelled.
    </p>
    ${eventCard(event)}
    ${eventLink}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      We're sorry for the inconvenience. Questions? Reply to this email.
    </p>
  `);
  const text = `${event.title} has been cancelled.\n\nWe're sorry for the inconvenience.\nClarity Pledge`;
  return { subject, html, text };
}

function buildUpdate(event: EventRow): { subject: string; html: string; text: string } {
  const subject = `Updated: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${eventPageUrl(event.slug)}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Event updated</h1>
    <p style="margin:0;font-size:16px;color:#4b5563;">
      The details for <strong>${event.title}</strong> have changed. Here's what you need to know:
    </p>
    ${eventCard(event)}
    ${eventLink}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      Questions? Reply to this email.
    </p>
  `);
  const text = `${event.title} has been updated.\n\n${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}\n\nClarity Pledge`;
  return { subject, html, text };
}

// ── Mailgun helpers ───────────────────────────────────────────────────────────

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  deliverAt?: Date;
}): Promise<string | null> {
  const body = new FormData();
  body.append('from', FROM);
  body.append('to', opts.to);
  body.append('subject', opts.subject);
  body.append('html', opts.html);
  body.append('text', opts.text);
  if (opts.deliverAt) {
    body.append('o:deliverytime', opts.deliverAt.toUTCString());
  }

  const res = await fetch(`${MAILGUN_BASE}/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Mailgun error:', res.status, err);
    return null;
  }

  const json = await res.json() as { id?: string };
  return json.id ?? null;
}

async function cancelScheduledEmail(messageId: string): Promise<void> {
  // Strip angle brackets if present: <abc@mg...> → abc@mg...
  const id = messageId.replace(/^<|>$/g, '');
  const res = await fetch(`${MAILGUN_BASE}/${MAILGUN_DOMAIN}/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
    },
  });
  if (!res.ok) {
    // Non-fatal: scheduled email may already have been sent
    console.warn('Mailgun cancel failed:', res.status, await res.text());
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleRsvp(supabase: ReturnType<typeof createClient>, eventId: string, userId: string) {
  // Fetch event
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Fetch attendee email from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single();

  if (!profile?.email) throw new Error('Profile email not found');

  const email = profile.email;
  const eventDatetime = new Date(event.datetime);
  const now = new Date();

  // Guard: don't schedule emails for past events
  if (eventDatetime <= now) {
    console.log('Event is in the past — skipping email scheduling');
    return;
  }

  // 1. Confirmation — immediate
  const confirmation = buildConfirmation(event);
  await sendEmail({ to: email, ...confirmation });

  // 2. Reminder — 24h before event
  const reminderTime = new Date(eventDatetime.getTime() - 24 * 60 * 60 * 1000);
  let reminderId: string | null = null;
  if (reminderTime > now) {
    const reminder = buildReminder(event);
    reminderId = await sendEmail({ to: email, ...reminder, deliverAt: reminderTime });
  }

  // 3. Feedback — 2h after event
  const feedbackTime = new Date(eventDatetime.getTime() + 2 * 60 * 60 * 1000);
  const feedback = buildFeedback(event);
  const feedbackId = await sendEmail({ to: email, ...feedback, deliverAt: feedbackTime });

  // Store Mailgun message IDs on RSVP row
  if (reminderId || feedbackId) {
    await supabase
      .from('event_rsvps')
      .update({
        mailgun_message_ids: {
          ...(reminderId ? { reminder: reminderId } : {}),
          ...(feedbackId ? { feedback: feedbackId } : {}),
        },
      })
      .eq('event_id', eventId)
      .eq('profile_id', userId);
  }
}

async function handleCancel(supabase: ReturnType<typeof createClient>, eventId: string) {
  // Fetch event
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Fetch all RSVPs with stored message IDs and attendee emails
  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('id, profile_id, mailgun_message_ids, profiles(email)')
    .eq('event_id', eventId);

  if (!rsvps) return;

  const cancellation = buildCancellation(event);

  await Promise.all(rsvps.map(async (rsvp) => {
    // Cancel scheduled emails
    const ids = rsvp.mailgun_message_ids as Record<string, string> | null;
    if (ids?.reminder) await cancelScheduledEmail(ids.reminder);
    if (ids?.feedback) await cancelScheduledEmail(ids.feedback);

    // Send cancellation notice
    const profileData = rsvp.profiles as { email: string } | null;
    const email = profileData?.email;
    if (email) {
      await sendEmail({ to: email, ...cancellation });
    }
  }));
}

async function handleUpdate(supabase: ReturnType<typeof createClient>, eventId: string) {
  // Fetch updated event
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Fetch all RSVPs
  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('id, profile_id, mailgun_message_ids, profiles(email)')
    .eq('event_id', eventId);

  if (!rsvps) return;

  const eventDatetime = new Date(event.datetime);
  const now = new Date();
  const updateEmail = buildUpdate(event);

  await Promise.all(rsvps.map(async (rsvp) => {
    // Cancel old scheduled emails
    const ids = rsvp.mailgun_message_ids as Record<string, string> | null;
    if (ids?.reminder) await cancelScheduledEmail(ids.reminder);
    if (ids?.feedback) await cancelScheduledEmail(ids.feedback);

    const profileData = rsvp.profiles as { email: string } | null;
    const email = profileData?.email;
    if (!email) return;

    // Send update notice
    await sendEmail({ to: email, ...updateEmail });

    // Reschedule emails if event is still in the future
    if (eventDatetime <= now) return;

    const reminderTime = new Date(eventDatetime.getTime() - 24 * 60 * 60 * 1000);
    let reminderId: string | null = null;
    if (reminderTime > now) {
      const reminder = buildReminder(event);
      reminderId = await sendEmail({ to: email, ...reminder, deliverAt: reminderTime });
    }

    const feedbackTime = new Date(eventDatetime.getTime() + 2 * 60 * 60 * 1000);
    const feedback = buildFeedback(event);
    const feedbackId = await sendEmail({ to: email, ...feedback, deliverAt: feedbackTime });

    await supabase
      .from('event_rsvps')
      .update({
        mailgun_message_ids: {
          ...(reminderId ? { reminder: reminderId } : {}),
          ...(feedbackId ? { feedback: feedbackId } : {}),
        },
      })
      .eq('id', rsvp.id);
  }));
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Use service role for DB operations — bypasses RLS so we can read all
    // attendee emails and update mailgun_message_ids across all RSVPs.
    // Auth header is still validated to ensure caller is authenticated.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { action, eventId, userId } = await req.json() as {
      action: 'rsvp' | 'cancel' | 'update';
      eventId: string;
      userId?: string;
    };

    if (!action || !eventId) {
      return new Response(JSON.stringify({ error: 'Missing action or eventId' }), { status: 400 });
    }

    switch (action) {
      case 'rsvp':
        if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 });
        await handleRsvp(supabaseClient, eventId, userId);
        break;
      case 'cancel':
        await handleCancel(supabaseClient, eventId);
        break;
      case 'update':
        await handleUpdate(supabaseClient, eventId);
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-event-emails error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
