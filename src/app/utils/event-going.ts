/**
 * @file event-going.ts
 * @description The number of people an event SHOWS as going / attended.
 *
 * FOUNDER DECISION 2026-09-29: a hosted event never reads "0 going" — the host is going. This is
 * DISPLAY ONLY. It deliberately diverges from two other counts, which it must never feed:
 *   - room statistics exclude the host's account (decisions.md 2026-09-21 [product]);
 *   - capacity — `isEventFull`, spots left, `maxAttendees` — counts RSVPs only, because the host
 *     does not take an attendee seat. Those read `attendeeCount` directly.
 * Neither this helper nor its callers change any query, metric or analytics event.
 */
import type { EventWithHost } from '@/app/types';

/**
 * RSVPs, plus the host when the event has a host user who is not already among the RSVPs.
 *
 * Where the attendee rows are loaded (detail page, next-event), membership is checked directly.
 * List surfaces load only the count; there the host is taken as NOT among the RSVPs, because the
 * RSVP control is hidden from an event's host (P844). An event with no host user is unchanged.
 */
export function displayGoingCount(
  event: Pick<EventWithHost, 'hostId' | 'attendeeCount' | 'attendees'>,
): number {
  const rsvps = event.attendeeCount ?? event.attendees?.length ?? 0;
  if (!event.hostId) return rsvps;
  const hostAmongRsvps = event.attendees?.some((a) => a.profileId === event.hostId) ?? false;
  return hostAmongRsvps ? rsvps : rsvps + 1;
}
