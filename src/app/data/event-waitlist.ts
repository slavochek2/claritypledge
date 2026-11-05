/**
 * @file event-waitlist.ts
 * @description P1529 D24: the small waiting list of a full sales-mastermind event. Joining is not a seat. The database writes
 * (join_event_waitlist, leave_event_waitlist); a person reads their own row and the host reads the ordered names.
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

/** Whether this person is on the event's waiting list (their own row; the table's policy shows them nobody else's). */
export async function isOnWaitlist(eventId: string, profileId: string): Promise<boolean> {
  const { data, error } = await supabase.from('event_waitlist').select('profile_id').eq('event_id', eventId).eq('profile_id', profileId).maybeSingle();
  if (error) throwDbError('isOnWaitlist', error, 'Could not read the waiting list');
  return !!data;
}

export interface WaitlistPerson {
  profileId: string;
  name: string;
  joinedAt: string;
}

/** The host's list, in the order people joined. */
export async function getEventWaitlist(eventId: string): Promise<WaitlistPerson[]> {
  const { data, error } = await supabase.rpc('get_event_waitlist', { p_event: eventId });
  if (error) throwDbError('getEventWaitlist', error, 'Could not read the waiting list');
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    profileId: r.profile_id as string,
    name: (r.name as string) ?? 'Someone',
    joinedAt: r.joined_at as string,
  }));
}
