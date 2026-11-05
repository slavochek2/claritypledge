/**
 * @file use-room-event.ts
 * @description P1592: whether the /transcribe room named by the URL belongs to an event, read
 * BEFORE the person agrees, so the consent wording can say where their words will be posted.
 *
 * Four answers, never a silent default to the narrower wording:
 *   'loading'  the lookup is in flight (the consent control stays disabled)
 *   'event'    the room belongs to an event
 *   'chat'     the room belongs to a chat (P1604): the text is posted to that chat as a thread
 *   'room'     an ad-hoc room (no code in the URL, or the room has no event)
 *   'unknown'  the lookup failed or found no room. Callers show the BROADER (event) wording: the
 *              audience that can read the words is only ever wider in an event room, so
 *              over-disclosing is the safe error, and the join repeats the same lookup anyway.
 * One request per code is shared by every component that asks (a small module cache), and a
 * failed one is dropped so a retry can succeed.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getRoomByCode } from '@/app/data/transcribe-service';
import { recipeForEvent } from '@/app/prototypes/events/series-recipes';

export type RoomEventState = 'loading' | 'event' | 'chat' | 'room' | 'unknown';

const lookups = new Map<string, ReturnType<typeof getRoomByCode>>();

/** One request per code, shared by everything that asks; a failed or empty one is dropped so a retry can succeed. */
function roomOf(code: string): ReturnType<typeof getRoomByCode> {
  let p = lookups.get(code);
  if (!p) {
    p = getRoomByCode(code);
    lookups.set(code, p);
    void p.then((room) => { if (!room) lookups.delete(code); }, () => { lookups.delete(code); });
  }
  return p;
}

function lookup(code: string): Promise<RoomEventState> {
  return roomOf(code).then(
    (room): RoomEventState => (!room ? 'unknown' : room.eventId ? 'event' : room.inChat ? 'chat' : 'room'),
    (): RoomEventState => 'unknown',
  );
}

export function useRoomEventState(code: string | undefined): RoomEventState {
  const [state, setState] = useState<{ code: string | undefined; value: RoomEventState }>({ code, value: 'loading' });
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void lookup(code).then((value) => { if (!cancelled) setState({ code, value }); });
    return () => { cancelled = true; };
  }, [code]);
  if (!code) return 'room';
  return state.code === code ? state.value : 'loading';
}

/**
 * P1529 D13: does this room's event run the Sales Mastermind? null while unknown, so the consent stays closed until the
 * wording is settled. A failed lookup answers true: over-disclosing is the safe error, as above.
 */
export function useRoomIsMastermind(code: string | undefined): boolean | null {
  const [answer, setAnswer] = useState<{ code: string | undefined; value: boolean } | null>(null);
  useEffect(() => {
    if (!code) return;
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
  }, [code]);
  if (!code) return false;
  return answer?.code === code ? answer.value : null;
}
