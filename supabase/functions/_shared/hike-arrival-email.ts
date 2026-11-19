/**
 * @file hike-arrival-email.ts
 * @description P1675 R19: for a hiker whose stored answer is "at the meeting point" (`event`), the confirmation, the 24-hour
 * reminder and the update email carry the arrival (start minus 15 minutes, in the event's own zone): the subject, the headline,
 * the HTML and the text say "Please come at {time} to do the short introduction at the meeting point." in place of the
 * "before the hike" wording, the introduction link is labelled as optional, and the calendar links start at the arrival.
 * Everyone else, and any recipient whose answer could not be read, gets the email unchanged (same object).
 * [FOUNDER DECISION: wording, builder's] Lives here so email-helpers.ts (over its size limit) does not grow.
 */
import { escapeHtml, type EventRow } from './email-helpers.ts';
import { isHike } from './event-flow.ts';
import { formatICSDate } from './email-urls.ts';
import { HIKE_PREP_QUESTION, HIKE_PREP_REMINDER_QUESTION, prepReminderSubject } from './mastermind-prep-email.ts';

/** Same lead as the app's EARLY_LEAD_MINUTES. */
export const HIKE_EARLY_LEAD_MINUTES = 15;
/** The introduction link's label for a person who will do it at the meeting point (it is optional for them). */
export const HIKE_ARRIVAL_LINK_LABEL = 'Want to do it at home instead?';

/** HH:MM, 24 hour, in the event's timezone (the same form as the app's formatDoorsTime). */
export function hikeArrivalTime(datetime: string, timezone?: string | null): string {
  const at = new Date(new Date(datetime).getTime() - HIKE_EARLY_LEAD_MINUTES * 60_000);
  const fmt = (timeZone: string | undefined) => at.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  try {
    return fmt(timezone || undefined);
  } catch {
    return fmt('UTC'); // a malformed zone must not abort the send: the time is then shown in UTC
  }
}

const FOOTER_MARKER = '<!-- Footer -->';

/** An event's hike "when" answers by profile, in one read (service-role client). null on a failed read: every recipient then gets the unchanged email. */
export async function loadHikeWhenByProfile(
  // The service-role client, typed loosely as email-helpers.ts does. Deno's ignore must sit directly above the line.
  // deno-lint-ignore no-explicit-any
  supabase: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  eventId: string,
): Promise<Map<string, string | null> | null> {
  const { data, error } = await supabase.from('event_hike_answers').select('profile_id, when_choice').eq('event_id', eventId);
  if (error) {
    console.warn(`hike answers batch read failed for event ${eventId}: ${error.message}`);
    return null;
  }
  const map = new Map<string, string | null>();
  for (const row of (data ?? []) as Array<{ profile_id: string; when_choice: string | null }>) map.set(row.profile_id, row.when_choice ?? null);
  return map;
}

/** One recipient's answers from the batch: null (unchanged email) on a failed batch, a missing row or no profile. */
export const hikeWhenOf = (byProfile: Map<string, string | null> | null, profileId: string | null | undefined): { when_choice: string | null } | null =>
  byProfile && profileId && byProfile.has(profileId) ? { when_choice: byProfile.get(profileId) ?? null } : null;

export const hikeArrivalLine =(time: string): string => `Please come at ${time} to do the short introduction at the meeting point.`;

export type HikeEmailKind = 'confirmation' | 'reminder' | 'update';

/** Every occurrence of `from` in the HTML or text becomes `to` (HTML sees both escaped). */
const swapAll = (s: string, from: string, to: string, escaped: boolean): string =>
  s.split(escaped ? escapeHtml(from) : from).join(escaped ? escapeHtml(to) : to);

export function withHikeArrival<T extends { subject?: string; html: string; text: string }>(
  email: T,
  event: EventRow,
  answers: { when_choice?: string | null } | null,
  kind: HikeEmailKind = 'confirmation',
): T {
  if (!isHike(event) || answers?.when_choice !== 'event') return email;
  const time = hikeArrivalTime(event.datetime, event.timezone);
  const line = hikeArrivalLine(time);
  const startMs = new Date(event.datetime).getTime();
  const earlyMs = startMs - HIKE_EARLY_LEAD_MINUTES * 60_000;
  let html = email.html;
  let text = email.text;
  let subject = email.subject;
  /** Adds the line as a paragraph; with `onlyIfMissing`, each of html and text gets it only if the swaps did not already place it. */
  const addLine = (onlyIfMissing = false) => {
    if (!onlyIfMissing || !html.includes(escapeHtml(line))) {
      const p = `<p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(line)}</p>`;
      // Inside the card, in its own row before the footer (as withHikeBlock does); appended only when there is no marker.
      const at = html.indexOf(FOOTER_MARKER);
      html = at < 0 ? `${html}${p}` : `${html.slice(0, at)}<tr><td style="padding:0 40px 24px;">${p}</td></tr>${html.slice(at)}`;
    }
    if (!onlyIfMissing || !text.includes(line)) {
      text = text.includes('\n\nSee you there!') ? text.replace('\n\nSee you there!', `\n\n${line}\n\nSee you there!`) : `${text}\n\n${line}`;
    }
  };
  if (kind === 'update') {
    addLine();
  } else {
    for (const q of [HIKE_PREP_QUESTION, HIKE_PREP_REMINDER_QUESTION]) {
      html = swapAll(html, q, line, true);
      text = swapAll(text, q, line, false);
    }
    // The link is optional for this person.
    html = swapAll(html, 'Prepare now', HIKE_ARRIVAL_LINK_LABEL, true);
    text = swapAll(text, 'Prepare now', HIKE_ARRIVAL_LINK_LABEL, false);
    // Other headings ("Finish your preparation", "See you tomorrow") and a reminder with no prep offered have no stock question to swap.
    addLine(true);
    // A reminder's other states ("finish your preparation", "see you tomorrow", no preparation offered) keep their own subjects.
    const [subjectHead, subjectTail] = prepReminderSubject(event, '\u0000').split('\u0000');
    const notStartedReminder = !!email.subject && email.subject.startsWith(subjectHead) && email.subject.endsWith(subjectTail);
    if (kind === 'confirmation') subject = `Please come at ${time}: ${event.title}`;
    else if (notStartedReminder) subject = `Tomorrow: please come at ${time} · ${event.title}`;
    if (email.subject && subject !== undefined) html = swapAll(html, email.subject, subject, true); // the page <title> repeats the subject
  }
  // Calendar links (Google dates, Outlook startdt) start at the arrival; the end stays the event's end.
  if (Number.isFinite(startMs)) {
    html = html.split(`dates=${formatICSDate(new Date(startMs))}/`).join(`dates=${formatICSDate(new Date(earlyMs))}/`);
    html = html.split(`startdt=${new Date(startMs).toISOString()}`).join(`startdt=${new Date(earlyMs).toISOString()}`);
  }
  return { ...email, ...(subject !== undefined ? { subject } : {}), html, text };
}
