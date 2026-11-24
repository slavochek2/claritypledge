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
 * Both reads start together, once, on a visible tab (`whenVisible`); the answer belongs to the inputs it was read
 * for. A failed read (offline among them) is `error`, and the bar then draws no tick, unless this device alone shows the
 * learning done.
 */
import { useEffect, useState } from 'react';
import { getMyPreparation, getMyPrepParts } from '@/app/data/event-prep-service';
import type { EventWithHost } from '@/app/types';
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
  useEffect(() => {
    if (!key || !eventId || !viewerId) return;
    let cancelled = false;
    const cancelWait = whenVisible(() => {
      // Review round 10 (Codex): each read counts on its own, so one that fails never hides what the other proves.
      void Promise.allSettled([getMyPreparation(eventId, viewerId), getMyPrepParts(viewerId)]).then(([prep, parts]) => {
        // `isPartDone` reads the first row for a part, so a done row (account or local) goes first.
        const rows = [...(parts.status === 'fulfilled' ? parts.value : []), ...localPartRows(readLocalParts())];
        const done = rows.filter((row) => isPartDone([row], row.part));
        const learned = hasLearned([...done, ...rows], prep.status === 'fulfilled' ? prep.value?.completedAt : null);
        // Review round 9 (Gemini): offline, or a failed read, still shows the tick for learning proved by what did answer
        // (this device's parts included); anything less is unknown (error), and the bar draws no tick.
        const failed = prep.status === 'rejected' || parts.status === 'rejected';
        if (!cancelled) setAnswer({ key, error: failed && !learned, learned });
      });
    });
    return () => { cancelled = true; cancelWait(); };
    // eventId and viewerId are inside key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Not asked (no preparation offered, or no viewer): nothing to wait for and nothing learned to show.
  if (!key) return { loading: false, error: false, learned: false };
  if (answer?.key !== key) return { loading: true, error: false, learned: false };
  return { loading: false, error: answer.error, learned: answer.learned };
}
