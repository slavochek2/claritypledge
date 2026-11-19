/**
 * @file my-hike-when.ts
 * @description P1675 R19: the person's own "when" answer for a hike (event_hike_answers, RLS: own row or the event's host).
 * Null when there is no answers row (an optional hike, or no registration). A failed read throws: it must not read as "no answer".
 * Concurrent reads for the same (event, viewer) share one request: the page's several surfaces ask at once. The entry is dropped
 * when the read settles, so a later call (a retry) reads afresh and a rejection is never reused.
 */
import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';
import { HIKE_WHEN, type HikeWhen } from './hike-answer-model';

const inFlight = new Map<string, Promise<HikeWhen | null>>();

async function readMyHikeWhen(eventId: string, profileId: string): Promise<HikeWhen | null> {
  const { data, error } = await supabase
    .from('event_hike_answers')
    .select('when_choice')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throwDbError('getMyHikeWhen', error, 'Failed to read the hike answer');
  const when = data?.when_choice as HikeWhen | undefined;
  return when && HIKE_WHEN.includes(when) ? when : null;
}

export function getMyHikeWhen(eventId: string, profileId: string): Promise<HikeWhen | null> {
  const key = `${eventId}:${profileId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = readMyHikeWhen(eventId, profileId);
  inFlight.set(key, p);
  const drop = () => { if (inFlight.get(key) === p) inFlight.delete(key); };
  p.then(drop, drop);
  return p;
}
