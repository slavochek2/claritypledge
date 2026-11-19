/**
 * @file auto-rsvp-destination.ts
 * @description After sign-up with an RSVP link: where the person goes next, or null to fall through to the normal redirect
 * (the event was not found). P1529: an event that asks its questions before the seat cannot be seated by the one-tap path,
 * because the server refuses it. If this browser holds the answers the person gave before signing up (D24), they register with
 * them, the saved copy is cleared, and they land on the confirm screen; if the event filled meanwhile, or the answers are for a
 * waiting-list request, or none are saved (another device), the event page opens, where it shows the form, the waiting list or
 * "This event just filled up." with the answers kept. A failed read of the flow is not a reason to stop.
 * Throws what the seat write throws: the caller handles a lost session.
 */
import { getEventBySlug, isUserRsvpd } from "@/app/data/api";
import { eventAsksBeforeSeat, type RegisterResult } from "@/app/data/event-registration";
import { clearRegistrationDraft, readRegistrationDraft } from "@/app/data/registration-draft";
import type { RegistrationAnswers } from "@/app/data/registration-answer-model";
import { keptLaterDropped } from "@/app/prototypes/events/kept-later";
import { trackPostSignupRsvp } from "@/app/prototypes/events/rsvp-analytics";

export async function autoRsvpDestination(
  eventSlug: string,
  registrationSource: unknown,
  seat: (event: { id: string }) => Promise<boolean>,
  /** Registers this person for the event with the answers they saved before signing up. */
  registerWith: (event: { id: string; slug: string }, answers: RegistrationAnswers) => Promise<RegisterResult>,
  userId?: string,
): Promise<string | null> {
  const event = await getEventBySlug(eventSlug);
  if (!event) return null;
  const toPage = `/events/${eventSlug}?action=rsvp`;
  if (await eventAsksBeforeSeat(eventSlug).catch(() => false)) {
    const draft = readRegistrationDraft(eventSlug);
    // A saved waiting-list request is for the page to act on, as it checks first whether a place has opened.
    if (draft?.intent !== 'register') {
      // The answers were already used (this page can run twice for one sign-in): someone registered is done, never asked again.
      const registered = !draft && !!userId && await (async () => isUserRsvpd(event.id, userId))().catch(() => false);
      return registered ? `/events/${eventSlug}/confirm` : toPage;
    }
    // R20: a kept "later" past the cutoff (or the legacy home choice that the form now shows as "later") is not registered:
    // the draft stays and the page's return hook asks again.
    if (keptLaterDropped(event, draft)) return toPage;
    const result = await registerWith(event, draft.answers); // the whole event, as the page's own registration passes it
    if (result !== 'ok' && result !== 'already') return toPage; // full, cancelled or failed: the answers stay, the page says why
    clearRegistrationDraft(eventSlug);
    // 'already' means registered before this sign-in: not a completed post-signup RSVP, so it is not counted.
    if (result === 'ok') void trackPostSignupRsvp(event.id, eventSlug, registrationSource).catch(() => {}); // never holds the redirect (P1640)
    // R20: a kept "now" goes straight to the preparation, as the page's own registration does.
    return draft.prep === 'now' ? `/events/${eventSlug}/prepare` : `/events/${eventSlug}/confirm`;
  }
  const seated = await seat(event);
  if (!seated) return toPage; // the page shows why (the event may be full)
  void trackPostSignupRsvp(event.id, eventSlug, registrationSource).catch(() => {}); // never holds the redirect (P1640)
  return `/events/${eventSlug}/confirm`;
}
