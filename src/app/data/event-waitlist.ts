/**
 * @file event-waitlist.ts
 * @description P1529 D24: the small waiting list of a full sales-mastermind event. Joining is not a seat. The database writes
 * (join_event_waitlist, leave_event_waitlist); a person reads their own row. The host reads the list with the host state
 * (get_mastermind_host_state, see event-mastermind-service.ts).
 */
import { supabase } from '@/lib/supabase';
import { guardSeatWrite, isAnonymousRlsDenial, SessionMismatchError } from '@/lib/session-guard';
import { logDbError, throwDbError } from './db-error-logger';
import type { RegistrationAnswers } from './registration-answer-model';

/** 'not_full': a place is free, so the person should register instead. 'registered': they already have a place. */
export type WaitlistResult = 'ok' | 'already' | 'registered' | 'not_full' | 'cancelled' | 'not_found' | 'failed';

export async function joinWaitlist(slug: string, profileId: string, answers: RegistrationAnswers): Promise<WaitlistResult> {
  if (!(await guardSeatWrite(profileId))) return 'failed';
  const { data, error, status } = await supabase.rpc('join_event_waitlist', {
    p_slug: slug,
    p_participation: answers.participation,
    p_observer_prep: answers.observerPrep,
    p_phone: answers.phone,
    p_hope: answers.hope,
    p_recording_accepted: answers.recordingAccepted,
  });
  if (isAnonymousRlsDenial(error, status)) throw new SessionMismatchError(profileId);
  if (error) {
    logDbError('joinWaitlist', error);
    return 'failed';
  }
  return data as WaitlistResult;
}

export async function leaveWaitlist(slug: string): Promise<void> {
  const { error } = await supabase.rpc('leave_event_waitlist', { p_slug: slug });
  if (error) throwDbError('leaveWaitlist', error, 'Could not leave the waiting list');
}

/**
 * This person's own waiting-list entry as the answers they gave, or null when they are not on it (the table's policy shows
 * them nobody else's). The answers prefill the form when a place has opened and they register.
 */
export async function getMyWaitlistEntry(eventId: string, profileId: string): Promise<RegistrationAnswers | null> {
  const { data, error } = await supabase.from('event_waitlist').select('participation, observer_prep, phone, hope')
    .eq('event_id', eventId).eq('profile_id', profileId).maybeSingle();
  if (error) throwDbError('getMyWaitlistEntry', error, 'Could not read the waiting list');
  if (!data) return null;
  return {
    participation: data.participation as RegistrationAnswers['participation'],
    observerPrep: (data.observer_prep as RegistrationAnswers['observerPrep']) ?? null,
    phone: data.phone as RegistrationAnswers['phone'],
    hope: (data.hope as string | null) ?? '',
    recordingAccepted: true, // a row exists only after the acceptance
  };
}
