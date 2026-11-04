/**
 * @file use-learned-read.ts
 * @description P1549: "has this person learned?" without an event. Returns what hasLearned needs. Signed in, this
 * browser's parts move to the account first, and any that failed to move still count. A failed or timed-out read is
 * an error, never "no progress": the join gate must not send a learner back to the start because a read failed.
 */
import { useCallback, useEffect, useState } from 'react';
import { getMyLatestPrepCompletedAt, getMyPrepParts, type PrepPartRow } from '@/app/data/event-prep-service';
import { forgetInFlight } from '@/lib/share-in-flight';
import { withDeadline } from '@/lib/with-deadline';
import { localPartRows, readLocalParts, syncLocalPrepParts } from './prep-local-parts';

const READ_TIMEOUT_MS = 6000;

export type LearnedRead =
  | { status: 'pending'; retry: () => void }
  | { status: 'error'; retry: () => void }
  | { status: 'ok'; parts: PrepPartRow[]; completedAt: string | null; retry: () => void };

async function readSignedIn(viewerId: string): Promise<{ parts: PrepPartRow[]; completedAt: string | null }> {
  const rows = await getMyPrepParts(viewerId);
  const synced = await syncLocalPrepParts(viewerId, rows);
  const [fresh, completedAt] = await Promise.all([
    synced.length > 0 ? getMyPrepParts(viewerId) : Promise.resolve(rows),
    getMyLatestPrepCompletedAt(viewerId),
  ]);
  const onAccount = new Set(fresh.filter((r) => r.completedAt).map((r) => r.part));
  return { parts: [...fresh, ...localPartRows(readLocalParts()).filter((r) => !onAccount.has(r.part))], completedAt };
}

/** `viewerId` undefined = signed out. `enabled` false = no read (still loading auth, or a member). */
export function useLearnedRead(viewerId: string | undefined, enabled: boolean): LearnedRead {
  const [attempt, setAttempt] = useState(0);
  type Held = { key: string } & ({ status: 'pending' | 'error' } | { status: 'ok'; parts: PrepPartRow[]; completedAt: string | null });
  const [held, setHeld] = useState<Held>({ key: '', status: 'pending' });
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const key = `${viewerId ?? ''}:${attempt}`;

  useEffect(() => {
    if (!enabled) return;
    if (!viewerId) {
      setHeld({ key, status: 'ok', parts: localPartRows(readLocalParts()), completedAt: null });
      return;
    }
    let cancelled = false;
    setHeld({ key, status: 'pending' });
    // A retry must not rejoin a stalled shared read.
    withDeadline(readSignedIn(viewerId), READ_TIMEOUT_MS, 'learned read')
      .then((r) => { if (!cancelled) setHeld({ key, status: 'ok', ...r }); })
      .catch(() => { forgetInFlight(`prep-parts:${viewerId}`); if (!cancelled) setHeld({ key, status: 'error' }); });
    return () => { cancelled = true; };
  }, [enabled, viewerId, key]);

  // Another viewer's answer is never shown: until this viewer's read has answered, it is pending.
  if (held.key !== key) return { status: 'pending', retry };
  return { ...held, retry } as LearnedRead;
}
