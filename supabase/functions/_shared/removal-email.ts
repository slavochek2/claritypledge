/**
 * P1700: the removal email (its copy, and the send-event-emails 'removed' action's wiring and HTTP answer).
 * Kept out of email-helpers.ts and the endpoint's serve() so neither grows (quality ratchet, P1566).
 *
 * HTTP answers: 400 without userId; 403 when the caller is not the event's host; 502 when the email did not go; 200 when it
 * was sent or there was nothing to send (no removal of a registered person, or already notified: that reveals nothing).
 * The claim, the cancels and the release live in removal-notice.ts.
 */
import {
  cancelScheduledEmail,
  type EventRow,
  escapeHtml,
  firstName,
  formatDate,
  greeting,
  htmlEmail,
  logEmailSend,
  sendEmail,
  SENT_NO_ID,
  type SupabaseClient,
} from './email-helpers.ts';
import { notifyRemoval } from './removal-notice.ts';

/** Copy approved by the founder 2026-11-17 (spec UI Contract). No "reply to the host" line: the events mailbox sets no
 *  Reply-To, so a reply would not reach the host. The greeting is the shared one ("Hi <first name>," or "Hi,"). */
export function buildRemoval(event: EventRow, name?: string | null): { subject: string; html: string; text: string } {
  const subject = `Your registration for ${event.title} was cancelled`;
  const when = formatDate(event.datetime, event.timezone);
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting(name)}</p>
    <p style="margin:0;font-size:16px;color:#4b5563;">
      The host of <strong>${escapeHtml(event.title)}</strong> (${escapeHtml(when)}) has cancelled your registration, so you are no
      longer on the guest list.
    </p>
  `);
  const first = firstName(name);
  const text = `${first ? `Hi ${first},` : 'Hi,'}\n\nThe host of ${event.title} (${when}) has cancelled your registration, so you are no longer on the guest list.\n\n— Clarity Pledge`;
  return { subject, html, text };
}

/** Only a real Mailgun id can be cancelled (not PENDING, not SENT_NO_ID): the same guard as the endpoint's cancelIfReal. */
async function cancelIfReal(id: string): Promise<void> {
  if (id && id !== 'PENDING' && id !== SENT_NO_ID) await cancelScheduledEmail(id);
}

export async function removedResponse(
  db: SupabaseClient, eventId: string, caller: string, target: string | undefined, headers: Record<string, string>,
): Promise<Response> {
  const answer = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  if (!target) return answer(400, { error: 'Missing userId' });
  const outcome = await notifyRemoval(db, {
    cancel: cancelIfReal,
    send: (to, email) => sendEmail({ to, ...email }),
    build: (event, name) => buildRemoval(event as unknown as EventRow, name),
    log: ({ eventId: e, profileId, messageId, errorMessage }) =>
      logEmailSend(db, { eventId: e, profileId, emailType: 'removal', messageId, errorMessage }),
  }, eventId, caller, target);
  if (outcome === 'forbidden') return answer(403, { error: 'Forbidden' });
  if (outcome === 'failed') return answer(502, { error: 'Email not sent' });
  return answer(200, { ok: true });
}
