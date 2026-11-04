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
import { getRoomByCode } from '@/app/data/transcribe-service';

export type RoomEventState = 'loading' | 'event' | 'chat' | 'room' | 'unknown';

const lookups = new Map<string, Promise<RoomEventState>>();

function lookup(code: string): Promise<RoomEventState> {
  let p = lookups.get(code);
  if (!p) {
    p = getRoomByCode(code).then(
      (room): RoomEventState => (!room ? 'unknown' : room.eventId ? 'event' : room.inChat ? 'chat' : 'room'),
      (): RoomEventState => 'unknown',
    );
    lookups.set(code, p);
    void p.then((state) => { if (state === 'unknown') lookups.delete(code); });
  }
  return p;
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
