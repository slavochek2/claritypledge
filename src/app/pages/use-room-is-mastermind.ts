/** @file use-room-is-mastermind.ts @description P1529 D13: whether a /transcribe room's event runs the Sales Mastermind, for its consent wording. */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withDeadline } from '@/lib/with-deadline';
import { ROOM_ENTRY_TIMEOUT_MS } from '@/app/data/transcribe-capture-status';
import { recipeForEvent } from '@/app/prototypes/events/series-recipes';
import { roomOf } from './room-lookup';

/**
 * Only an event room can be one. null while unknown, so the consent stays closed until the wording is settled. A lookup that ERRORS or
 * hits its deadline answers 'failed' (never a guess in either direction: the caller keeps Join closed and offers a retry); a room or
 * event that is simply not there answers true, since over-disclosing is the safe error. `attempt` bumps to run it again.
 */
export function useRoomIsMastermind(code: string | undefined, eventRoom: boolean, attempt = 0): boolean | null | 'failed' {
  const key = `${code}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; value: boolean | 'failed' } | null>(null);
  useEffect(() => {
    if (!code || !eventRoom) return;
    let cancelled = false;
    // One signal per run: the deadline, a retry (effect re-run) and unmount all abort the SELECT, so retries never stack in-flight requests.
    const controller = new AbortController();
    const read = async (): Promise<boolean> => {
      const room = await roomOf(code);
      if (!room) return true;
      if (!room.eventId) return false;
      let result;
      try {
        result = await withDeadline(
          Promise.resolve(supabase.from('events').select('flow, series_slug').eq('id', room.eventId).abortSignal(controller.signal).maybeSingle()),
          ROOM_ENTRY_TIMEOUT_MS,
          'looking up the event',
        );
      } catch (e) {
        controller.abort();
        throw e;
      }
      const { data, error } = result;
      if (error) throw new Error(error.message);
      if (!data) return true;
      return !!recipeForEvent({ flow: data.flow, seriesSlug: data.series_slug }).mastermind;
    };
    void read().catch((): 'failed' => 'failed').then((value) => { if (!cancelled) setAnswer({ key, value }); });
    return () => { cancelled = true; controller.abort(); };
  }, [code, eventRoom, key]);
  if (!code || !eventRoom) return false;
  return answer?.key === key ? answer.value : null;
}
