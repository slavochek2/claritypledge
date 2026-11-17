/**
 * @file hike-registration.ts
 * @description P1675: registering for a hike. The server takes the answers and the seat in one transaction
 * (register_for_hike) and refuses a seat without the answers on every other path. Mirrors registerForEvent.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { invokeEventEmails } from '@/lib/event-emails';
import { guardSeatWrite, isAnonymousRlsDenial, SessionMismatchError } from '@/lib/session-guard';
import { logDbError } from './db-error-logger';
import { normalizeHikeAnswers, type HikeAnswers } from './hike-answer-model';

export type HikeRegisterResult = 'ok' | 'already' | 'full' | 'cancelled' | 'not_found' | 'now_only' | 'failed';

const RESULTS: readonly string[] = ['ok', 'already', 'full', 'cancelled', 'not_found', 'now_only'];

export async function registerForHike(
  event: { id: string; slug: string },
  profileId: string,
  answers: HikeAnswers,
): Promise<HikeRegisterResult> {
  if (!(await guardSeatWrite(profileId))) return 'failed';
  const a = normalizeHikeAnswers(answers);
  let result;
  try {
    result = await supabase.rpc('register_for_hike', {
      p_slug: event.slug,
      p_when: a.when,
      p_transport: a.transport,
      p_free_seats: a.freeSeats,
      p_help: a.help,
      p_help_other: a.helpOther,
    });
  } finally {
    clearListReturnCache();
  }
  const { data, error, status } = result;
  if (isAnonymousRlsDenial(error, status)) throw new SessionMismatchError(profileId);
  if (error) {
    logDbError('registerForHike', error);
    return 'failed';
  }
  if (typeof data !== 'string' || !RESULTS.includes(data)) return 'failed';
  if (data === 'ok') invokeEventEmails('rsvp', event.id, profileId);
  return data as HikeRegisterResult;
}
