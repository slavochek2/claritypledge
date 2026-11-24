/**
 * @file use-seated-at-running-round.ts
 * @description P1718 R8: is this room member seated in the round running now? Ready never stands at a running table
 * (P1529: "the event room never stands between two people talking"), so /ready forwards to /meet when they are. One
 * read on arrival, no subscription. A failed read, or one that has not answered within ROUNDS_READ_MS, answers
 * `false`: Ready is a note, not a gate, so a stalled connection never holds the person on the loader. A seat the read
 * finds after that still forwards them (review round 12).
 *
 * Review round 7: one request (`isSeatedInRunningRound`), keyed on the event and the member, so it waits for the room
 * row; the answer belongs to that key. Review round 13 (Codex, metered rule 4): one read a visit. Going offline and
 * back neither drops the answer nor asks again (a reconnect re-read put the screen back on its loader, which remounted
 * the step bar and repeated its reads), as the arrival read is the only one: there is no subscription either.
 *
 * Metered-services rule 3 (a hidden tab makes no requests; review round 6): the read waits for the tab to be shown,
 * through `whenVisible` as `useMyCanvasShared` does, and the 4 s budget starts then. A hidden tab shows nothing, so
 * the loader it holds until then is never seen.
 */
import { useEffect, useRef, useState } from 'react';
import { isSeatedInRunningRound } from '@/app/data/event-rounds-service';
import { whenVisible } from '../when-visible';

/** How long /ready waits for the rounds read before it shows the question anyway. */
export const ROUNDS_READ_MS = 4000;

/** `null` while the read is pending (or not asked); then whether `memberId` holds a seat in the current round. */
export function useSeatedAtRunningRound(eventId: string | undefined, memberId: string | undefined, enabled: boolean): boolean | null {
  const [answer, setAnswer] = useState<{ key: string; seated: boolean } | null>(null);
  const key = enabled && eventId && memberId ? `${eventId}:${memberId}` : null;
  const started = useRef<string | null>(null); // the key this mount has read for
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    // Not asked (offline, hidden by the caller, no member), or already read for this key in this mount.
    if (!key || !eventId || !memberId || started.current === key) return;
    return whenVisible(() => {
      if (started.current === key) return;
      started.current = key;
      let late = false;
      const publish = (seated: boolean) => { if (mounted.current) setAnswer({ key, seated }); };
      // After ROUNDS_READ_MS the question shows; the read keeps going, and a seat it finds later still forwards (review
      // round 12, Codex). A late "not seated" or a failure changes nothing. Going offline does not stop it (round 13).
      const timer = setTimeout(() => { late = true; publish(false); }, ROUNDS_READ_MS);
      isSeatedInRunningRound(eventId, memberId)
        .then((seated) => { if (seated || !late) publish(seated); })
        .catch(() => { if (!late) publish(false); })
        .finally(() => clearTimeout(timer));
    });
    // eventId and memberId are inside key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key || answer?.key !== key) return null;
  return answer.seated;
}
