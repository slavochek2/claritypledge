/**
 * @file event-registration.ts
 * @description P1529 D16: registering for a flow that asks questions before the seat. The server takes the answers
 * and the seat in one transaction (register_for_event), and refuses a seat without them on every other path.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { invokeEventEmails } from '@/lib/event-emails';
import { guardSeatWrite, isAnonymousRlsDenial, SessionMismatchError } from '@/lib/session-guard';
import { logDbError } from './db-error-logger';

export type { Participation, ObserverPrep, PhoneKind, RegistrationAnswers } from './registration-answer-model';
import type { RegistrationAnswers } from './registration-answer-model';

import { isRemovalRefusal } from './event-waitlist';

export type RegisterResult = 'ok' | 'already' | 'full' | 'cancelled' | 'not_found' | 'failed' | 'closed';

export async function registerForEvent(
  event: { id: string; slug: string },
  profileId: string,
  answers: RegistrationAnswers,
): Promise<RegisterResult> {
  if (!(await guardSeatWrite(profileId))) return 'failed';
  let result;
  try {
    result = await supabase.rpc('register_for_event', {
      p_slug: event.slug,
      p_participation: answers.participation,
      p_observer_prep: answers.observerPrep,
      p_phone: answers.phone,
      p_hope: answers.hope,
      p_recording_accepted: answers.recordingAccepted,
    });
  } finally {
    clearListReturnCache(); // admission to a canvas follows the RSVP row
  }
  const { data, error, status } = result;
  if (isAnonymousRlsDenial(error, status)) throw new SessionMismatchError(profileId);
  if (error) {
    if (isRemovalRefusal(error)) return 'closed'; // P1700: the page re-reads the removal status and shows its notice
    logDbError('registerForEvent', error);
    return 'failed';
  }
  if (data === 'ok') invokeEventEmails('rsvp', event.id, profileId);
  return data as RegisterResult;
}

/**
 * Whether the event of this link asks its questions before the seat, by the one flow resolver. The post-sign-up return uses it
 * to send a new person to the registration step instead of trying a seat the server would refuse. The two imports are lazy:
 * the sign-in page must not load the events' recipes until an event link is actually being returned to.
 */
export async function eventAsksBeforeSeat(slug: string): Promise<boolean> {
  const [{ eventsService }, { recipeForEvent }] = await Promise.all([
    import('./events-service'),
    import('@/app/prototypes/events/series-recipes'),
  ]);
  const event = await eventsService.getEventBySlug(slug, { attendees: false });
  return !!event && !!recipeForEvent(event).registrationQuestions;
}
