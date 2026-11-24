/**
 * @file use-seated-at-running-round.ts
 * @description P1718 R8: is this room member seated in the round running now? Ready never stands at a running table
 * (P1529: "the event room never stands between two people talking"), so /ready forwards to /meet when they are. One
 * read on arrival, no subscription. A failed read, or one that has not answered within ROUNDS_READ_MS, answers
 * `false`: Ready is a note, not a gate, so a stalled connection never holds the person on the loader. A seat the read
 * finds after that still forwards them (review round 12).
 *
 * Review round 7: one request (`isSeatedInRunningRound`), keyed on the event and the member, so it waits for the room
 * row; the answer belongs to that key and to the read that produced it, so a read started again (reconnecting after
 * offline) is pending until it answers rather than repeating the last answer.
 *
 * Metered-services rule 3 (a hidden tab makes no requests; review round 6): the read waits for the tab to be shown,
 * through `whenVisible` as `useMyCanvasShared` does, and the 4 s budget starts then. A hidden tab shows nothing, so
 * the loader it holds until then is never seen.
 */
import { useEffect, useState } from 'react';
import { isSeatedInRunningRound } from '@/app/data/event-rounds-service';
import { whenVisible } from '../when-visible';

/** How long /ready waits for the rounds read before it shows the question anyway. */
export const ROUNDS_READ_MS = 4000;

/** `null` while the read is pending (or not asked); then whether `memberId` holds a seat in the current round. */
export function useSeatedAtRunningRound(eventId: string | undefined, memberId: string | undefined, enabled: boolean): boolean | null {
  const [answer, setAnswer] = useState<{ key: string; seated: boolean } | null>(null);
  const key = enabled && eventId && memberId ? `${eventId}:${memberId}` : null;
  useEffect(() => {
    // Not asked (offline, hidden by the caller, no member): forget the last answer, so asking again starts pending.
    setAnswer(null);
    if (!key || !eventId || !memberId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelWait = whenVisible(() => {
      let late = false;
      // After ROUNDS_READ_MS the question shows; the read keeps going, and a seat it finds later still forwards (review
      // round 12, Codex). A late "not seated" or a failure changes nothing.
      timer = setTimeout(() => { late = true; if (!cancelled) setAnswer({ key, seated: false }); }, ROUNDS_READ_MS);
      isSeatedInRunningRound(eventId, memberId)
        .then((seated) => { if (!cancelled && (seated || !late)) setAnswer({ key, seated }); })
        .catch(() => { if (!cancelled && !late) setAnswer({ key, seated: false }); })
        .finally(() => clearTimeout(timer));
    });
    return () => { cancelled = true; cancelWait(); clearTimeout(timer); };
    // eventId and memberId are inside key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key || answer?.key !== key) return null;
  return answer.seated;
}
