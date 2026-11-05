/**
 * @file auto-rsvp-destination.ts
 * @description After sign-up with an RSVP link: where the person goes next, or null to fall through to the normal redirect
 * (the event was not found). P1529: an event that asks its questions before the seat cannot be seated here, because the
 * server refuses it, so the event page opens the registration step. A failed read of the flow is not a reason to stop.
 * Throws what the seat write throws: the caller handles a lost session.
 */
import { getEventBySlug } from "@/app/data/api";
import { eventAsksBeforeSeat } from "@/app/data/event-registration";
import { trackPostSignupRsvp } from "@/app/prototypes/events/rsvp-analytics";

export async function autoRsvpDestination(eventSlug: string, registrationSource: unknown, seat: (event: { id: string }) => Promise<boolean>): Promise<string | null> {
  const event = await getEventBySlug(eventSlug);
  if (!event) return null;
  if (await eventAsksBeforeSeat(eventSlug).catch(() => false)) return `/events/${eventSlug}?action=rsvp`;
  const seated = await seat(event);
  if (!seated) return `/events/${eventSlug}?action=rsvp`; // the page shows why (the event may be full)
  void trackPostSignupRsvp(event.id, eventSlug, registrationSource); // never holds the redirect (P1640)
  return `/events/${eventSlug}/confirm`;
}
