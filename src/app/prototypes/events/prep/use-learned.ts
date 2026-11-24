/**
 * @file use-learned.ts
 * @description P1718 review round 8: whether this person has done the learning, for the Learn tick on /ready's step
 * bar. The tick reads only `hasLearned(parts, completedAt)`, so this makes the two reads it needs (the event's
 * preparation row and the account's parts) and nothing else: no points feeds, no social proof, no arrival read, and no
 * write. `usePrepState` makes those for the preparation page's plan; on /ready they were 5 to 11 requests a visit, some
 * started by a response after the tab was hidden (metered-services rules 3 and 4; Codex round 8).
 *
 * Parts done signed-out and not yet moved to the account count here as they do after `/meet` moves them
 * (`syncLocalPrepParts`), so the tick matches /meet's without this screen writing anything.
 *
 * Learning done on this device needs no read. Otherwise both reads start together, once, on a visible tab
 * (`whenVisible`), and the tick shows as soon as either proves the learning; the answer belongs to the inputs it was
 * read for. A failed read (offline among them) leaves the answer unknown (`error`, no tick) unless what did answer
 * proves it, and an unknown answer is read again when the connection comes back.
 */
import { useEffect, useRef, useState } from 'react';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import { getMyPreparation, getMyPrepParts } from '@/app/data/event-prep-service';
import type { EventWithHost } from '@/app/types';
import type { PrepPartRow } from '@/app/data/event-prep-service';
import { hasLearned, isPartDone } from './prep-plan';
import { localPartRows, readLocalParts } from './prep-local-parts';
import { offersPreparation } from '../series-recipes';
import { whenVisible } from '../when-visible';

export interface LearnedState {
  loading: boolean;
  error: boolean;
  learned: boolean;
}

export function useLearned(event: EventWithHost | null, viewerId: string | undefined): LearnedState {
  const eventId = event?.id;
  const key = eventId && viewerId && offersPreparation(event) ? `${eventId}:${viewerId}` : null;
  const [answer, setAnswer] = useState<{ key: string; error: boolean; learned: boolean } | null>(null);
  // Review round 11 (Gemini): an answer left unknown by a failed read (offline) is read again once the connection is back.
  const { reconnectTick } = useConnectivity();
  const last = useRef(answer);
  last.current = answer;
  useEffect(() => {
    if (!key || !eventId || !viewerId) return;
    if (last.current?.key === key && !last.current.error) return; // answered for these inputs: nothing to re-read
    let cancelled = false;
    const publish = (next: { error: boolean; learned: boolean }) => { if (!cancelled) setAnswer({ key, ...next }); };
    // Review round 11 (Codex): learning done on this device needs no read at all.
    if (hasLearned(localPartRows(readLocalParts()), null)) {
      publish({ error: false, learned: true });
      return () => { cancelled = true; };
    }
    const cancelWait = whenVisible(() => {
      // Review rounds 10 and 11 (Codex): each read counts on its own, so one that fails or hangs never hides what the
      // other proves: a tick shows as soon as either read proves the learning.
      let prep: { completedAt?: string | null } | null | undefined; // undefined: not answered
      let parts: PrepPartRow[] | undefined;
      let failed = false;
      let settled = 0;
      const decide = () => {
        // `isPartDone` reads the first row for a part, so a done row (account or local) goes first.
        const rows = [...(parts ?? []), ...localPartRows(readLocalParts())];
        const done = rows.filter((row) => isPartDone([row], row.part));
        const learned = hasLearned([...done, ...rows], prep?.completedAt ?? null);
        // Review round 9 (Gemini): a failed read (offline among them) is unknown (error) unless what did answer proves it.
        if (learned) publish({ error: false, learned: true });
        else if (settled === 2) publish({ error: failed, learned: false });
      };
      const settle = <T,>(read: Promise<T>, keep: (value: T) => void) => read.then(keep, () => { failed = true; }).then(() => {
        settled += 1;
        decide();
      });
      void settle(getMyPreparation(eventId, viewerId), (value) => { prep = value; });
      void settle(getMyPrepParts(viewerId), (value) => { parts = value; });
    });
    return () => { cancelled = true; cancelWait(); };
    // eventId and viewerId are inside key; reconnectTick re-runs only an unknown answer (see `last` above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reconnectTick]);
  // Not asked (no preparation offered, or no viewer): nothing to wait for and nothing learned to show.
  if (!key) return { loading: false, error: false, learned: false };
  if (answer?.key !== key) return { loading: true, error: false, learned: false };
  return { loading: false, error: answer.error, learned: answer.learned };
}
