/**
 * @file use-registration-return.ts
 * @description P1529 D24: what the event page does when a person arrives signed in with `?action=rsvp` (just signed up or
 * signed in from its Register button). In a flow that asks, answers saved in this browser before sign-up register them (or
 * join the waiting list they asked for) without asking again; with none (another device) the form opens as before. A place
 * that went while they signed in is "This event just filled up.", with the answers kept. Every other flow keeps its toast and
 * its one-tap button. The saved answers are for this event only (one key per event), and are cleared when used.
 */
import { useEffect } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { eventsService } from '@/app/data/events-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { readHikeDraft, readRegistrationDraft } from '@/app/data/registration-draft';
import { recipeForEvent } from '../series-recipes';
import type { EventWithHost } from '@/app/types';
import type { useRegistrationStep } from './use-registration-step';

type Registration = ReturnType<typeof useRegistrationStep>;

export function useRegistrationReturn(a: {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  isLoggedIn: boolean;
  event: EventWithHost | null | undefined;
  loading: boolean;
  asksBeforeSeat: boolean;
  isRsvpd: boolean;
  isHostOfEvent: boolean;
  registration: Registration;
}) {
  const { searchParams, setSearchParams, isLoggedIn, event, loading, asksBeforeSeat, isRsvpd, isHostOfEvent, registration } = a;
  // It waits for the event, so the flow is known, and for the registration read, so someone already registered is not asked again.
  useEffect(() => {
    if (searchParams.get('action') !== 'rsvp' || !isLoggedIn || !event || loading) return;
    searchParams.delete('action');
    setSearchParams(searchParams, { replace: true });
    const open = asksBeforeSeat && !isRsvpd && !isHostOfEvent && event.status !== 'cancelled' && Date.now() < new Date(event.datetime).getTime() + EVENT_GRACE_HOURS * 60 * 60 * 1000;
    if (asksBeforeSeat && isRsvpd) return; // already registered: nothing to ask, nothing to announce
    if (!open) { toast.success('Account created! Click "Reserve a seat" to confirm your spot.'); return; }
    if (recipeForEvent(event).registration === 'hike') {
      // P1675: a hike has no waiting list. Saved answers register without asking again (a retry reopens the form with them).
      const saved = readHikeDraft(event.slug);
      if (!saved) { registration.askHike(); return; }
      registration.keepHikeAnswers(saved);
      void registration.submitHike(saved).then(sent => { if (!sent) registration.askHike(saved); });
      return;
    }
    const full = eventsService.isEventFull(event);
    const draft = readRegistrationDraft(event.slug);
    if (!draft) { registration.ask(); return; }
    registration.keepAnswers(draft.answers);
    // The form is closed while the saved answers are sent, so a failed send reopens it with them: that is the retry.
    const send = () => void registration.submit(draft.answers).then(sent => { if (!sent) registration.ask(draft.answers); });
    if (draft.intent === 'register') {
      if (full) registration.markFilled();
      else send();
    } else if (full) send();
    else registration.ask(draft.answers);
    // `registration` is a fresh object each render and its members only set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, isLoggedIn, event, loading, asksBeforeSeat, isRsvpd, isHostOfEvent]);
}
