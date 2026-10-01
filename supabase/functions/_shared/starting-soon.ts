/**
 * P1380: the "Starting in 15 minutes" email — one send per RSVP, Preparation-on events only.
 *
 * Two callers, one path:
 *   - dispatch-event-emails (cron, every 30 min): events starting in (now, now+45m]. Mailgun
 *     `deliverytime` = start − 15 min; when that moment has already passed (missed tick, event
 *     starting within 15 min), the email goes immediately.
 *   - send-event-emails on RSVP: a registration made less than 45 min before start would
 *     otherwise wait up to 30 min for the next tick — it dispatches its own row right away.
 *
 * Double-send safety is the same atomic claim the reminder uses: write
 * mailgun_message_ids.starting_soon = 'PENDING' only while it is NULL. A claim left PENDING
 * longer than STUCK_MS (a crash between claim and write-back) is retried; minutes, not the
 * reminder's 7 hours, because this email is useless an hour late.
 */
import {
  buildStartingSoon,
  logEmailSend,
  sendEmail,
  type EventRow,
  type SupabaseClient,
} from './email-helpers.ts';
import { isOnlineLocation, mintEmailLink } from './event-links.ts';

export const STARTING_SOON_LEAD_MS = 15 * 60 * 1000;
/** Look-ahead: one 30-min cron interval past the 15-min lead, so every event is seen by a tick. */
export const STARTING_SOON_WINDOW_MS = 45 * 60 * 1000;
export const STARTING_SOON_STUCK_MS = 10 * 60 * 1000;

export interface StartingSoonRsvp {
  id: string;
  event_id: string;
  profile_id: string | null;
  starting_soon_attempted_at: string | null;
  mailgun_message_ids: Record<string, string> | null;
  profiles: { email: string; name: string | null } | null;
  events: EventRow & { status: string };
}

export type StartingSoonOutcome =
  | 'sent'
  | 'failed:mailgun'
  | 'skipped:no-email'
  | 'skipped:not-eligible'
  | 'skipped:already-claimed';

/** Whether this row's event is one the email is for, right now. Pure — unit-tested. */
export function startingSoonEligible(
  event: { datetime: string; status: string; preparation_enabled?: boolean | null },
  now: Date,
): boolean {
  if (!event.preparation_enabled) return false;
  if (event.status === 'cancelled') return false;
  const start = new Date(event.datetime).getTime();
  return start > now.getTime() && start - now.getTime() <= STARTING_SOON_WINDOW_MS;
}

/** start − 15 min, or undefined (send now) when that moment is not in the future. Pure. */
export function startingSoonDeliverAt(eventDatetime: string, now: Date): Date | undefined {
  const at = new Date(new Date(eventDatetime).getTime() - STARTING_SOON_LEAD_MS);
  return at.getTime() > now.getTime() ? at : undefined;
}

/** Unclaimed, or claimed so long ago the claimer must have died. Pure. */
export function startingSoonClaimable(
  ids: Record<string, string> | null,
  attemptedAt: string | null,
  now: Date,
): boolean {
  const v = ids?.starting_soon;
  if (v == null) return true;
  if (v !== 'PENDING') return false;
  return !attemptedAt || now.getTime() - new Date(attemptedAt).getTime() > STARTING_SOON_STUCK_MS;
}

export async function dispatchStartingSoon(
  supabase: SupabaseClient,
  rsvp: StartingSoonRsvp,
  now: Date,
): Promise<StartingSoonOutcome> {
  const { events: event, profiles: profileData } = rsvp;
  const email = profileData?.email;
  if (!email) return 'skipped:no-email';
  if (!startingSoonEligible(event, now)) return 'skipped:not-eligible';
  if (!startingSoonClaimable(rsvp.mailgun_message_ids, rsvp.starting_soon_attempted_at, now)) {
    return 'skipped:already-claimed';
  }

  const currentIds = rsvp.mailgun_message_ids ?? {};
  const claimIds = { ...currentIds, starting_soon: 'PENDING' };
  const wasStuck = currentIds.starting_soon === 'PENDING';

  // Atomic claim. A stuck PENDING is re-claimed only if it is STILL the same stuck claim
  // (attempted_at unchanged), so two ticks cannot both take over one stuck row.
  let claim = supabase
    .from('event_rsvps')
    .update({ mailgun_message_ids: claimIds, starting_soon_attempted_at: now.toISOString() })
    .eq('id', rsvp.id);
  claim = wasStuck
    ? claim.filter('mailgun_message_ids->>starting_soon', 'eq', 'PENDING')
        .eq('starting_soon_attempted_at', rsvp.starting_soon_attempted_at)
    : claim.filter('mailgun_message_ids->>starting_soon', 'is', 'null');
  const { data: claimed } = await claim.select('id').maybeSingle();
  if (!claimed) return 'skipped:already-claimed';

  // Links minted now, redeemed at click: a magic link minted here would be dead by then.
  const online = isOnlineLocation(event.location);
  const [arrivedUrl, notYetUrl, roomUrl] = online
    ? [null, null, await mintEmailLink(supabase, rsvp.id, 'room', event)]
    : [
      await mintEmailLink(supabase, rsvp.id, 'arrived', event),
      await mintEmailLink(supabase, rsvp.id, 'not_yet', event),
      null,
    ];

  const message = buildStartingSoon(event, profileData?.name, { arrivedUrl, notYetUrl, roomUrl });
  const messageId = await sendEmail({
    to: email,
    ...message,
    deliverAt: startingSoonDeliverAt(event.datetime, now),
  });

  // Write back only over our own PENDING. On a Mailgun failure the key goes back to NULL so
  // the next tick retries while the event is still ahead.
  await supabase
    .from('event_rsvps')
    .update({ mailgun_message_ids: { ...claimIds, starting_soon: messageId ?? null } })
    .eq('id', rsvp.id)
    .filter('mailgun_message_ids->>starting_soon', 'eq', 'PENDING');

  await logEmailSend(supabase, {
    eventId: rsvp.event_id,
    profileId: rsvp.profile_id,
    emailType: 'starting_soon',
    messageId,
    errorMessage: messageId ? undefined : 'Mailgun returned null message ID',
  });

  return messageId ? 'sent' : 'failed:mailgun';
}

export const STARTING_SOON_SELECT = `
  id, event_id, profile_id, starting_soon_attempted_at, mailgun_message_ids,
  profiles(email, name),
  events!inner(id, title, datetime, duration_minutes, timezone, location, description, slug, host_id, status, preparation_enabled)
`;
