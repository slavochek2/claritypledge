/** @file use-room-is-mastermind.ts @description P1529 D13: whether a /transcribe room's event runs the Sales Mastermind, for its consent wording. */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { recipeForEvent } from '@/app/prototypes/events/series-recipes';
import { roomOf } from './room-lookup';

/**
 * Only an event room can be one. null while unknown, so the consent stays closed until the
 * wording is settled. A failed lookup answers true: over-disclosing is the safe error, as above.
 */
export function useRoomIsMastermind(code: string | undefined, eventRoom: boolean): boolean | null {
  const [answer, setAnswer] = useState<{ code: string | undefined; value: boolean } | null>(null);
  useEffect(() => {
    if (!code || !eventRoom) return;
    let cancelled = false;
    const read = async () => {
      const room = await roomOf(code);
      if (!room) return true;
      if (!room.eventId) return false;
      const { data, error } = await supabase.from('events').select('flow, series_slug').eq('id', room.eventId).maybeSingle();
      if (error || !data) return true;
      return !!recipeForEvent({ flow: data.flow, seriesSlug: data.series_slug }).mastermind;
    };
    void read().catch(() => true).then((value) => { if (!cancelled) setAnswer({ code, value }); });
    return () => { cancelled = true; };
  }, [code, eventRoom]);
  if (!code || !eventRoom) return false;
  return answer?.code === code ? answer.value : null;
}
