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
 *   'unknown'  the lookup answered but found no room. Callers show the BROADER (event) wording: the
 *              audience that can read the words is only ever wider in an event room, so
 *              over-disclosing is the safe error, and the join repeats the same lookup anyway.
 *   'failed'   the lookup errored or hit its deadline (getRoomByCode is deadlined): nothing is known, so nothing is
 *              shown as a disclosure and Join stays closed until a retry succeeds.
 * One request per code is shared by every component that asks (a small module cache), and a
 * failed one is dropped so a retry can succeed.
 */
import { useEffect, useState } from 'react';
import { roomOf } from './room-lookup';

export type RoomEventState = 'loading' | 'event' | 'chat' | 'room' | 'unknown' | 'failed';

function lookup(code: string): Promise<RoomEventState> {
  return roomOf(code).then(
    (room): RoomEventState => (!room ? 'unknown' : room.eventId ? 'event' : room.inChat ? 'chat' : 'room'),
    (): RoomEventState => 'failed',
  );
}

/** `attempt` bumps to run the lookup again (a failed one is already dropped from the shared cache). */
export function useRoomEventState(code: string | undefined, attempt = 0): RoomEventState {
  const key = `${code}#${attempt}`;
  const [state, setState] = useState<{ key: string; value: RoomEventState }>({ key, value: 'loading' });
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void lookup(code).then((value) => { if (!cancelled) setState({ key, value }); });
    return () => { cancelled = true; };
  }, [code, key]);
  if (!code) return 'room';
  return state.key === key ? state.value : 'loading';
}
