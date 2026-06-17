import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Environment (callers pass these in via module-level constants) ─────────────
// Callers must set these before calling any helper that uses Mailgun.
// This shared module reads them lazily from Deno.env.

function mailgunBase(): string {
  const region = Deno.env.get('MAILGUN_REGION') ?? 'us';
  return region === 'eu'
    ? 'https://api.eu.mailgun.net/v3'
    : 'https://api.mailgun.net/v3';
}

function mailgunDomain(): string {
  return Deno.env.get('MAILGUN_DOMAIN') ?? '';
}

function mailgunApiKey(): string {
  return Deno.env.get('MAILGUN_API_KEY') ?? '';
}

const TALLY_FORM_ID = Deno.env.get('TALLY_FORM_ID') ?? 'QKDN91';

export const FROM = `Clarity Pledge Events <events@${Deno.env.get('MAILGUN_DOMAIN') ?? ''}>`;

// Only send feedback emails for events hosted by this profile.
export const FEEDBACK_HOST_ID = 'a99042ef-e740-446a-8734-389c8589cc17';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EventRow {
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

export interface LogEmailSendOpts {
  eventId: string;
  profileId: string | null;
  emailType: 'confirmation' | 'reminder' | 'feedback' | 'cancellation' | 'update' | 'uncancel';
  messageId: string | null;
  errorMessage?: string;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClient = ReturnType<typeof createClient<any>>;

// ── Security utilities ────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Feedback emails send from the host's name for Gmail Primary tab placement.
export function feedbackFrom(hostName: string | null | undefined): string {
  const domain = mailgunDomain();
  const from = `Clarity Pledge Events <events@${domain}>`;
  const name = hostName?.trim();
  if (!name) return from;
  const safe = name.replace(/[\\"\r\n]/g, '');
  return `"${safe}" <events@${domain}>`;
}

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

function formatLocation(location: string | null): string {
  if (!location) return '';
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(location);
  } catch {
    // not a URL — treat as plain text address
  }
  if (parsedUrl !== null) {
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return `📍 ${escapeHtml(location)}`;
    }
    return `🔗 <a href="${escapeHtml(location)}" style="color:#2563eb;">Join online</a>`;
  }
  return `📍 ${escapeHtml(location)}`;
}

export function formatDate(datetime: string, timezone: string | null): string {
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

// ── Email builders ────────────────────────────────────────────────────────────

export function buildConfirmation(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
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

export function buildReminder(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
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

export function buildFeedback(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
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

export function buildCancellation(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
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

export function buildUncancel(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
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

export function buildUpdate(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
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

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  deliverAt?: Date;
  from?: string;
}): Promise<string | null> {
  const domain = mailgunDomain();
  const apiKey = mailgunApiKey();
  const base = mailgunBase();
  const defaultFrom = `Clarity Pledge Events <events@${domain}>`;

  const body = new FormData();
  body.append('from', opts.from ?? defaultFrom);
  body.append('to', opts.to);
  body.append('subject', opts.subject);
  body.append('html', opts.html);
  body.append('text', opts.text);
  if (opts.deliverAt) {
    body.append('o:deliverytime', opts.deliverAt.toUTCString());
  }

  const res = await fetch(`${base}/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
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

export async function cancelScheduledEmail(messageId: string): Promise<void> {
  const id = messageId.replace(/^<|>$/g, '');
  const domain = mailgunDomain();
  const apiKey = mailgunApiKey();
  const base = mailgunBase();
  const res = await fetch(`${base}/${domain}/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
    },
  });
  if (!res.ok) {
    console.warn('Mailgun cancel failed:', res.status, await res.text());
  }
}

// ── Email send logging ────────────────────────────────────────────────────────

/**
 * Persists an email send attempt to email_send_log.
 * Never throws — logging failures must not break the email flow.
 */
export async function logEmailSend(
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
