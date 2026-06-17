import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const TALLY_FORM_ID = Deno.env.get('TALLY_FORM_ID') ?? 'QKDN91';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

const FROM = `Clarity Pledge Events <events@${MAILGUN_DOMAIN}>`;

// Feedback emails are a personal 1:1 follow-up from the event's host, so they
// send from the host's name (not the brand) to land in Gmail's Primary tab.
// Falls back to the brand sender when the host has no name set.
function feedbackFrom(hostName: string | null | undefined): string {
  const name = hostName?.trim();
  if (!name) return FROM;
  // Quote the display name and strip chars that could break the From header.
  const safe = name.replace(/[\\"\r\n]/g, '');
  return `"${safe}" <events@${MAILGUN_DOMAIN}>`;
}

// ── Security utilities ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Only send feedback emails for events hosted by this profile.
// Other hosts manage their own feedback flow.
const FEEDBACK_HOST_ID = 'a99042ef-e740-446a-8734-389c8589cc17';

// ── HTML email base template ──────────────────────────────────────────────────

function htmlEmail(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
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

function eventCard(event: EventRow): string {
  const date = formatDate(event.datetime, event.timezone);
  const locationLine = formatLocation(event.location);
  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 12px;font-size:20px;font-weight:600;color:#111827;">${escapeHtml(event.title)}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#4b5563;">📅 ${escapeHtml(date)}</p>
      ${locationLine ? `<p style="margin:0;font-size:14px;color:#4b5563;">${locationLine}</p>` : ''}
    </div>`;
}

function formatLocation(location: string | null): string {
  if (!location) return '';
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(location);
  } catch {
    // not a URL — treat as plain text address
  }
  if (parsedUrl !== null) {
    // Only allow safe URL schemes — reject javascript:, data:, blob:, etc.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return `📍 ${escapeHtml(location)}`;
    }
    return `🔗 <a href="${escapeHtml(location)}" style="color:#2563eb;">Join online</a>`;
  }
  return `📍 ${escapeHtml(location)}`;
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
  host_id: string | null;
}

/** Extract first name from "First Last" or return null */
function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  return first || null;
}

function greeting(name: string | null | undefined): string {
  const first = firstName(name);
  return first ? `Hi ${escapeHtml(first)},` : 'Hi,';
}

function buildConfirmation(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
  const subject = `You're in: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${escapeHtml(eventPageUrl(event.slug))}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting(name)}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">You're confirmed! 🎉</h1>
    <p style="margin:0 0 4px;font-size:16px;color:#4b5563;">We're looking forward to seeing you.</p>
    ${eventCard(event)}
    ${eventLink}
    ${calendarLinks(event)}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      Questions? Reply to this email and we'll get back to you.
    </p>
  `);
  const first = firstName(name);
  const text = `${first ? `Hi ${first},\n\n` : ''}You're going to: ${event.title}\n\n${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}\n\nSee you there!\nClarity Pledge`;
  return { subject, html, text };
}

function buildReminder(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
  const subject = `Tomorrow: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${escapeHtml(eventPageUrl(event.slug))}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting(name)}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">See you tomorrow! 👋</h1>
    <p style="margin:0 0 4px;font-size:16px;color:#4b5563;">Just a reminder about tomorrow's event.</p>
    ${eventCard(event)}
    ${eventLink}
    ${calendarLinks(event)}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      Questions? Reply to this email.
    </p>
  `);
  const first = firstName(name);
  const text = `${first ? `Hi ${first},\n\n` : ''}Reminder: ${event.title} is tomorrow.\n\n${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}\n\nSee you there!\nClarity Pledge`;
  return { subject, html, text };
}

// Plain, person-to-person email (no branded table wrapper, no styled button,
// single bare link) so Gmail classifies it as Primary, not Promotions.
function buildFeedback(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
  const subject = `How was ${event.title}?`;
  const feedbackUrl = tallyUrl(event.id);
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
  <p>${greeting(name)}</p>
  <p>Thanks for joining the event: &ldquo;${escapeHtml(event.title)}&rdquo;. I'd love to hear how it went for you — it takes about a minute.</p>
  <p><a href="${escapeHtml(feedbackUrl)}">Share your feedback</a></p>
  <p>Thank you,<br>Slava<br><br>Vyacheslav Ladischenski<br>Founder of ClarityPledge</p>
</div>`;
  const first = firstName(name);
  const text = `${first ? `Hi ${first},\n\n` : ''}Thanks for joining the event: "${event.title}". I'd love to hear how it went for you — it takes about a minute:\n\n${feedbackUrl}\n\nThank you,\nSlava\n\nVyacheslav Ladischenski\nFounder of ClarityPledge`;
  return { subject, html, text };
}

function buildCancellation(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
  const subject = `Event cancelled: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${escapeHtml(eventPageUrl(event.slug))}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting(name)}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Event cancelled</h1>
    <p style="margin:0;font-size:16px;color:#4b5563;">
      Unfortunately, <strong>${escapeHtml(event.title)}</strong> has been cancelled.
    </p>
    ${eventCard(event)}
    ${eventLink}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      We're sorry this didn't work out. Questions? Reply to this email.
    </p>
  `);
  const text = `${event.title} has been cancelled.\n\nWe're sorry for the inconvenience.\nClarity Pledge`;
  return { subject, html, text };
}

function buildUncancel(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
  const subject = `It's back on: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${escapeHtml(eventPageUrl(event.slug))}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting(name)}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Good news — the event is back on! 🎉</h1>
    <p style="margin:0;font-size:16px;color:#4b5563;">
      <strong>${escapeHtml(event.title)}</strong> is back on — here are the details:
    </p>
    ${eventCard(event)}
    ${eventLink}
    ${calendarLinks(event)}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
      Questions? Reply to this email.
    </p>
  `);
  const text = `Good news — ${event.title} is back on!\n\n${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}\n\nSee you there!\nClarity Pledge`;
  return { subject, html, text };
}

function buildUpdate(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
  const subject = `Updated: ${event.title}`;
  const eventLink = event.slug ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${escapeHtml(eventPageUrl(event.slug))}" style="color:#2563eb;">View event page →</a></p>` : '';
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting(name)}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Event updated</h1>
    <p style="margin:0;font-size:16px;color:#4b5563;">
      The details for <strong>${escapeHtml(event.title)}</strong> have changed. Here's what changed:
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
  from?: string;
}): Promise<string | null> {
  const body = new FormData();
  body.append('from', opts.from ?? FROM);
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

// ── Email send logging ────────────────────────────────────────────────────────

interface LogEmailSendOpts {
  eventId: string;
  profileId: string | null;
  emailType: 'confirmation' | 'reminder' | 'feedback' | 'cancellation' | 'update' | 'uncancel';
  messageId: string | null;
  errorMessage?: string;
}

 
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

/**
 * Persists an email send attempt to email_send_log.
 * Never throws — logging failures must not break the email flow.
 */
async function logEmailSend(
  supabase: SupabaseClient,
  opts: LogEmailSendOpts,
): Promise<void> {
  try {
    const { error } = await supabase.from('email_send_log').insert({
      event_id: opts.eventId,
      profile_id: opts.profileId,
      email_type: opts.emailType,
      status: opts.messageId ? 'sent' : 'failed',
      mailgun_message_id: opts.messageId,
      error_message: opts.errorMessage ?? null,
    });
    if (error) {
      console.error('logEmailSend insert error:', error.message);
    }
  } catch (err) {
    console.error('logEmailSend unexpected error:', err);
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleRsvp(supabase: SupabaseClient, eventId: string, userId: string) {
  // Fetch event (include host_id to gate feedback emails)
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Fetch attendee email and name from profiles
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

  let reminderId: string | null = null;

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

    // 2. Reminder — 24h before event
    const reminderTime = new Date(eventDatetime.getTime() - 24 * 60 * 60 * 1000);
    if (reminderTime > now) {
      const reminder = buildReminder(event, profileName);
      reminderId = await sendEmail({ to: email, ...reminder, deliverAt: reminderTime });
      await logEmailSend(supabase, {
        eventId,
        profileId: userId,
        emailType: 'reminder',
        messageId: reminderId,
        errorMessage: reminderId ? undefined : 'Mailgun returned null message ID',
      });
    }
  }

  // 3. Feedback — 2h after event, only for events hosted by the configured host
  let feedbackId: string | null = null;
  if (event.host_id === FEEDBACK_HOST_ID) {
    const { data: host } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', event.host_id)
      .single();
    const from = feedbackFrom(host?.name as string | null);
    const feedbackTime = new Date(eventDatetime.getTime() + (event.duration_minutes ?? 60) * 60 * 1000 + 2 * 60 * 60 * 1000);
    const feedback = buildFeedback(event, profileName);
    feedbackId = feedbackTime > now
      ? await sendEmail({ to: email, ...feedback, from, deliverAt: feedbackTime })
      : await sendEmail({ to: email, ...feedback, from }); // past event — send immediately
    await logEmailSend(supabase, {
      eventId,
      profileId: userId,
      emailType: 'feedback',
      messageId: feedbackId,
      errorMessage: feedbackId ? undefined : 'Mailgun returned null message ID',
    });
  }

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

async function handleCancel(supabase: SupabaseClient, eventId: string) {
  // Fetch event (host_id included for consistency with other handlers)
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Fetch all RSVPs with stored message IDs and attendee emails
  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('id, profile_id, mailgun_message_ids, profiles(email, name)')
    .eq('event_id', eventId);

  if (!rsvps) return;

  await Promise.all(rsvps.map(async (rsvp) => {
    // Cancel scheduled emails
    const ids = rsvp.mailgun_message_ids as Record<string, string> | null;
    if (ids?.reminder) await cancelScheduledEmail(ids.reminder);
    if (ids?.feedback) await cancelScheduledEmail(ids.feedback);

    // Send cancellation notice
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
  // Fetch updated event (include host_id to gate feedback emails)
  const { data: event } = await supabase
    .from('events')
    .select('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Fetch all RSVPs
  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('id, profile_id, mailgun_message_ids, profiles(email, name)')
    .eq('event_id', eventId);

  if (!rsvps) return;

  const eventDatetime = new Date(event.datetime);
  const now = new Date();

  await Promise.all(rsvps.map(async (rsvp) => {
    // Cancel old scheduled emails
    const ids = rsvp.mailgun_message_ids as Record<string, string> | null;
    if (ids?.reminder) await cancelScheduledEmail(ids.reminder);
    if (ids?.feedback) await cancelScheduledEmail(ids.feedback);

    const profileData = rsvp.profiles as unknown as { email: string; name: string | null } | null;
    const email = profileData?.email;
    if (!email) return;

    const profileName = profileData?.name;

    // Send update notice
    const updateEmail = buildUpdate(event, profileName);
    const updateId = await sendEmail({ to: email, ...updateEmail });
    await logEmailSend(supabase, {
      eventId,
      profileId: rsvp.profile_id ?? null,
      emailType: 'update',
      messageId: updateId,
      errorMessage: updateId ? undefined : 'Mailgun returned null message ID',
    });

    // Reschedule emails if event is still in the future
    if (eventDatetime <= now) return;

    const reminderTime = new Date(eventDatetime.getTime() - 24 * 60 * 60 * 1000);
    let reminderId: string | null = null;
    if (reminderTime > now) {
      const reminder = buildReminder(event, profileName);
      reminderId = await sendEmail({ to: email, ...reminder, deliverAt: reminderTime });
      await logEmailSend(supabase, {
        eventId,
        profileId: rsvp.profile_id ?? null,
        emailType: 'reminder',
        messageId: reminderId,
        errorMessage: reminderId ? undefined : 'Mailgun returned null message ID',
      });
    }

    let feedbackId: string | null = null;
    if (event.host_id === FEEDBACK_HOST_ID) {
      const { data: host } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', event.host_id)
        .single();
      const from = feedbackFrom(host?.name as string | null);
      const feedbackTime = new Date(eventDatetime.getTime() + (event.duration_minutes ?? 60) * 60 * 1000 + 2 * 60 * 60 * 1000);
      const feedback = buildFeedback(event, profileName);
      feedbackId = feedbackTime > now
        ? await sendEmail({ to: email, ...feedback, from, deliverAt: feedbackTime })
        : await sendEmail({ to: email, ...feedback, from });
      await logEmailSend(supabase, {
        eventId,
        profileId: rsvp.profile_id ?? null,
        emailType: 'feedback',
        messageId: feedbackId,
        errorMessage: feedbackId ? undefined : 'Mailgun returned null message ID',
      });
    }

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
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Guard: required env vars
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
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

    // ── JWT validation — extract Bearer token and verify with Supabase ───────
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

    // userId comes from the verified JWT — never trusted from request body
    const authenticatedUserId = user.id;

    // Use service role for DB operations — bypasses RLS so we can read all
    // attendee emails and update mailgun_message_ids across all RSVPs.
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

    // Host-only actions require caller to be the event host
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
        // Use authenticatedUserId from JWT — not from request body
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
