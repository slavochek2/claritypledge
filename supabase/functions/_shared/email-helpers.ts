import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isOnlineLocation, onTimeLine, venueName } from './event-links.ts';

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

/**
 * P1256: recorded in place of a Mailgun message id when Mailgun accepted the message
 * (2xx) but returned no id. It means SENT — it exists so that "sent" and "never
 * attempted" stop sharing the value `null`. Anything that decides whether to (re)send
 * must treat it as sent; anything that calls Mailgun back about the message (cancel,
 * reschedule) must skip it, since it is not an addressable id.
 */
export const SENT_NO_ID = 'SENT_NO_ID';

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
  /** P1336/P1380: preparation flow + room gate on. Absent on older selects = off. */
  preparation_enabled?: boolean | null;
}

export interface LogEmailSendOpts {
  eventId: string;
  profileId: string | null;
  emailType: 'confirmation' | 'reminder' | 'feedback' | 'cancellation' | 'update' | 'uncancel' | 'starting_soon';
  messageId: string | null;
  errorMessage?: string;
  /** P1425: the event_rsvps claim token this send was made under (scheduled kinds only). */
  claimToken?: string;
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

function htmlEmail(title: string, body: string, opts: { preheader?: string; footerNote?: string } = {}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>` : ''}
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
                ${opts.footerNote ? `${escapeHtml(opts.footerNote)}<br>` : ''}Clarity Pledge · <a href="https://claritypledge.com" style="color:#9ca3af;">claritypledge.com</a>
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
      hour: '2-digit',
      minute: '2-digit',
      // 24-hour in every email (founder, 2026-10-02), matching the app.
      hourCycle: 'h23',
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

/** P1380: the one call-to-action, centred. `secondary` is the outlined twin. */
function emailButton(label: string, href: string): string {
  // Full width like the app's primary button (LetterPrimaryCta): the one ask, unmissable on a phone.
  return `<a href="${escapeHtml(href)}" style="display:block;box-sizing:border-box;width:100%;max-width:420px;margin:0 auto;padding:15px 20px;border-radius:999px;color:#ffffff;background:#0044CC;font-size:17px;font-weight:700;text-align:center;text-decoration:none;">${escapeHtml(label)}</a>`;
}

/**
 * Two answers side by side, equal size: the first filled, the second outlined (founder,
 * 2026-10-02: "they see that they have a choice"). A table, because email clients ignore flex.
 */
function choiceButtons(primary: { label: string; href: string }, secondary: { label: string; href: string }): string {
  const base = 'display:block;padding:15px 10px;border:2px solid #0044CC;border-radius:999px;font-size:17px;font-weight:700;text-align:center;text-decoration:none;';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 auto;"><tr>
    <td width="50%" style="padding-right:6px;"><a href="${escapeHtml(primary.href)}" style="${base}color:#ffffff;background:#0044CC;">${escapeHtml(primary.label)}</a></td>
    <td width="50%" style="padding-left:6px;"><a href="${escapeHtml(secondary.href)}" style="${base}color:#0044CC;background:#ffffff;">${escapeHtml(secondary.label)}</a></td>
  </tr></table>`;
}

const BUTTON_NOTE = 'The buttons in this email sign you in, so please keep it to yourself.';

/** "Tuesday, 6 October · 18:00" — local event, no time-zone label. */
function shortDate(event: EventRow): string {
  try {
    const d = new Date(event.datetime);
    const tz = event.timezone ?? 'UTC';
    const day = d.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${day} · ${time}`;
  } catch {
    return formatDate(event.datetime, event.timezone);
  }
}
const startTime = (event: EventRow) => shortDate(event).split(' · ')[1] ?? '';

/** P1380: preparation state of one registrant, as the 24h reminder needs it. */
export type ReminderPrep = 'not_started' | 'started' | 'complete';

/** The app's own words for why we ask (src/app/prototypes/events/prep/PrepPieces.tsx PrepBlock). */
const PREP_WHY_TITLE = 'Our events are different';
const PREP_WHY_BODY = 'We use a special structure, and we ask every participant to prepare.';
const PREP_QUESTION = 'Do you have 10 minutes to prepare for the event?';
const PREP_PAYOFF = 'Your short preparation will make the event discussions more meaningful.';

/**
 * P1380: the layout every preparation-event email shares, mirroring the app's registration
 * screen: a small status line, the ONE question big, its button centred, and everything else
 * (date, place, start time, calendar) in one box underneath.
 */
function focusEmail(opts: {
  title: string;
  preheader: string;
  note?: string | null;
  greetingName: string | null | undefined;
  status: string;
  why?: { title: string; body: string } | null;
  question: string;
  payoff?: string | null;
  actions: string;
  event: EventRow;
  startLine: boolean;
}): string {
  const { event } = opts;
  const date = shortDate(event);
  const locationLine = formatLocation(event.location);
  const box = `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin:28px 0 0;text-align:left;">
      <p style="margin:0 0 10px;font-size:17px;font-weight:600;color:#111827;">${escapeHtml(event.title)}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#4b5563;">📅 ${escapeHtml(date)}</p>
      ${locationLine ? `<p style="margin:0 0 6px;font-size:14px;color:#4b5563;">${locationLine}</p>` : ''}
      ${opts.startLine ? `<p style="margin:10px 0 0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(onTimeLine(event))}</p>` : ''}
      ${event.slug ? `<p style="margin:12px 0 0;font-size:13px;"><a href="${escapeHtml(eventPageUrl(event.slug))}" style="color:#2563eb;">Event page →</a></p>` : ''}
      ${calendarLinks(event)}
    </div>`;
  return htmlEmail(opts.title, `
    <p style="margin:0 0 4px;font-size:15px;color:#111827;">${greeting(opts.greetingName)}</p>
    <p style="margin:0 0 22px;font-size:14px;color:#15803d;">${escapeHtml(opts.status)}</p>
    <div style="text-align:center;">
      ${opts.why ? `<p style="margin:0 0 2px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(opts.why.title)}</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.45;color:#374151;">${escapeHtml(opts.why.body)}</p>` : ''}
      <h1 style="margin:0 0 8px;font-size:24px;line-height:1.3;font-weight:700;color:#111827;">${escapeHtml(opts.question)}</h1>
      ${opts.payoff ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.45;color:#6b7280;">${escapeHtml(opts.payoff)}</p>` : '<div style="height:10px"></div>'}
      ${opts.actions}
      ${opts.note ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.45;color:#4b5563;">${escapeHtml(opts.note)}</p>` : ''}
    </div>
    ${box}
  `, { preheader: opts.preheader, footerNote: opts.actions ? BUTTON_NOTE : undefined });
}

const center = (html: string) => `<p style="margin:0;">${html}</p>`;

// ── Email builders ────────────────────────────────────────────────────────────

export function buildConfirmation(
  event: EventRow,
  name?: string | null,
  /** P1380: set only for a Preparation-on event; the button opens the preparation signed in. */
  prepareUrl?: string | null,
): { subject: string; html: string; text: string } {
  const first = firstName(name);
  const hi = first ? `Hi ${first},\n\n` : '';
  const details = `${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}`;
  if (event.preparation_enabled && prepareUrl) {
    // P1380 founder review 2026-10-02: "registered" is small; the question is the big thing.
    const subject = `10 minutes to prepare for ${event.title}?`;
    const html = focusEmail({
      title: subject,
      preheader: `You're registered. ${PREP_WHY_BODY}`,
      greetingName: name,
      status: `✓ You're registered for ${event.title}`,
      why: { title: PREP_WHY_TITLE, body: PREP_WHY_BODY },
      question: PREP_QUESTION,
      payoff: PREP_PAYOFF,
      actions: center(emailButton('Prepare now', prepareUrl)),
      event,
      startLine: true,
    });
    const text = `${hi}You're registered for ${event.title}.\n\n${PREP_WHY_TITLE}. ${PREP_WHY_BODY}\n${PREP_QUESTION}\nPrepare now: ${prepareUrl}\n\n${onTimeLine(event)}\n${details}\n\nSee you there!\nClarity Pledge`;
    return { subject, html, text };
  }
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
  const text = `${hi}You're going to: ${event.title}\n\n${details}\n\nSee you there!\nClarity Pledge`;
  return { subject, html, text };
}

/**
 * The 24h reminder. Preparation off (or unknown) → today's reminder, unchanged.
 * P1380, Preparation on — the same layout and question as the registration email:
 *   - not started → "Do you have 10 minutes to prepare for the event?" + Prepare now
 *   - started → "Finish your preparation" + Continue your preparation (the app's label)
 *   - prepared → "See you tomorrow", status "You're prepared ✓", no button
 * No button without a link: if the ticket could not be minted, it points at the event page.
 */
export function buildReminder(
  event: EventRow,
  name?: string | null,
  opts: { prep?: ReminderPrep | null; prepareUrl?: string | null } = {},
): { subject: string; html: string; text: string } {
  const prepOn = !!event.preparation_enabled && !!opts.prep;
  const first = firstName(name);
  const hi = first ? `Hi ${first},\n\n` : '';
  const details = `${formatDate(event.datetime, event.timezone)}\n${event.location ?? ''}`;
  if (prepOn) {
    const target = opts.prepareUrl ?? (event.slug ? eventPageUrl(event.slug) : null);
    const started = opts.prep === 'started';
    const done = opts.prep === 'complete';
    const at = startTime(event);
    const place = venueName(event.location) ?? event.title;
    const subject = done
      ? `See you tomorrow ${at} · ${place}`
      : started
        ? `Tomorrow ${at} · finish your preparation`
        : `Tomorrow ${at} · 10 minutes to prepare?`;
    const question = done ? 'See you tomorrow' : started ? 'Finish your preparation' : PREP_QUESTION;
    const label = started ? 'Continue your preparation' : 'Prepare now';
    const arriveNote = isOnlineLocation(event.location)
      ? null
      : "Tomorrow, tap \"I'm here\" when you walk in. We'll email you the button 15 minutes before the start.";
    const html = focusEmail({
      title: subject,
      preheader: done ? `You're prepared. ${onTimeLine(event)}` : `${event.title} is tomorrow. ${PREP_WHY_BODY}`,
      note: done ? arriveNote : null,
      greetingName: name,
      status: done ? `✓ You're prepared for ${event.title}` : `${event.title} is tomorrow at ${at}`,
      why: done ? null : { title: PREP_WHY_TITLE, body: PREP_WHY_BODY },
      question,
      payoff: done ? null : PREP_PAYOFF,
      actions: done || !target ? '' : center(emailButton(label, target)),
      event,
      startLine: true,
    });
    const text = done
      ? `${hi}${event.title} is tomorrow. You're prepared ✓\n\n${onTimeLine(event)}\n${details}\n\nSee you there!\nClarity Pledge`
      : `${hi}${event.title} is tomorrow.\n\n${PREP_WHY_TITLE}. ${PREP_WHY_BODY}\n${question}${target ? `\n${label}: ${target}` : ''}\n\n${onTimeLine(event)}\n${details}\n\nSee you there!\nClarity Pledge`;
    return { subject, html, text };
  }
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
  const text = `${hi}Reminder: ${event.title} is tomorrow.\n\n${details}\n\nSee you there!\nClarity Pledge`;
  return { subject, html, text };
}

/**
 * P1380: "Starting in 15 minutes", built for a glance at a phone while walking in (review
 * 2026-10-02): the arrival question, ONE big "I'm here", one line on what it does, then
 * "I'm here" (filled) and "Not yet" (outlined) side by side, then the address with directions.
 * No greeting, calendar or event box — nobody plans at this moment.
 * Online event: "Ready to join?" with Join now.
 */
export function buildStartingSoon(
  event: EventRow,
  _name: string | null | undefined,
  links: { arrivedUrl: string | null; notYetUrl: string | null; roomUrl: string | null },
): { subject: string; html: string; text: string } {
  const online = isOnlineLocation(event.location);
  const venue = venueName(event.location);
  const fallback = event.slug ? eventPageUrl(event.slug) : 'https://claritypledge.com/events';
  const kicker = `${event.title} starts in 15 minutes`;

  if (online) {
    const join = links.roomUrl ?? fallback;
    const subject = `Starting in 15 minutes: join ${event.title}`;
    const html = htmlEmail(subject, `
      <div style="text-align:center;">
        <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">${escapeHtml(kicker)}</p>
        <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;font-weight:700;color:#111827;">Ready to join?</h1>
        ${emailButton('Join now', join)}
      </div>
    `, { preheader: 'One tap opens the event.', footerNote: BUTTON_NOTE });
    return { subject, html, text: `${kicker}.\n\nJoin now: ${join}\n\nClarity Pledge` };
  }

  const ask = venue ? `Have you arrived at ${venue}?` : 'Have you arrived?';
  const subject = venue ? `At ${venue}? Tap "I'm here"` : `Arrived? Tap "I'm here"`;
  const here = links.arrivedUrl ?? fallback;
  const notYet = links.notYetUrl ?? fallback;
  const benefit = 'Tap when you walk in. The app then guides your evening: your partners, the rounds, your positions.';
  const address = event.location
    ? `<p style="margin:26px 0 0;font-size:14px;color:#4b5563;text-align:center;">📍 ${escapeHtml(event.location)}<br>
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}" style="color:#2563eb;">Directions</a></p>`
    : '';
  const html = htmlEmail(subject, `
    <div style="text-align:center;">
      <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">${escapeHtml(kicker)}</p>
      <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;font-weight:700;color:#111827;" data-p1380="arrival-question">${escapeHtml(ask)}</h1>
      ${choiceButtons({ label: "I'm here", href: here }, { label: 'Not yet', href: notYet })}
      <p style="margin:14px 0 0;font-size:14px;line-height:1.45;color:#4b5563;">${escapeHtml(benefit)}</p>
    </div>
    ${address}
  `, { preheader: 'Tap "I\'m here" when you walk in. One tap and the app guides your evening.', footerNote: BUTTON_NOTE });
  const text = `${kicker}.\n\n${ask}\nI'm here: ${here}\n${benefit}\nNot yet: ${notYet}\n\n${event.location ?? ''}\n\nClarity Pledge`;
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
  // P1256: 2xx WITHOUT an id is a SENT email, and must not be reported as `null` —
  // null is the caller's signal for "not sent", and a send recorded as not-sent gets
  // retried. That is harmless on the forward-looking cron path (the row falls out of
  // its `scheduled_at > now()` window anyway) but not on the backfill path, which is
  // explicitly re-runnable and selects on `mailgun_message_ids->>feedback IS NULL` —
  // there, a missing id means the attendee is mailed again on the next invocation.
  // Found by hostile review before deploy, not in production.
  return json.id ?? SENT_NO_ID;
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
      ...(opts.claimToken ? { claim_token: opts.claimToken } : {}),
    });
    if (error) {
      console.error('logEmailSend insert error:', error.message);
    }
  } catch (err) {
    console.error('logEmailSend unexpected error:', err);
  }
}
