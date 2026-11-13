/**
 * @file use-lease-expiry-read.ts
 * @description P1529: a run whose start was refused is not polled, but the database still counts it as busy until its lease ends, and only a state
 * read settles an expired run. Bounded: the first read at the lease's end plus a margin (the client clock can run ahead of the server's), then, while
 * the run is still queued or a read failed, up to MAX_READS in all per run id, spaced RETRY_MS plus jitter. Only while the tab is visible (hidden
 * pauses, visible resumes); it stops the moment `runId` goes null (the run left queued). Never a loop.
 */
import { useEffect, useRef } from 'react';

export const LEASE_MARGIN_MS = 15_000;
export const RETRY_MS = 30_000;
export const RETRY_JITTER_MS = 5_000;
export const MAX_READS = 3;

/** Reads made per run id, for the life of the page: a remount (or a second hook instance) cannot reset the cap. */
const readsMade = new Map<string, number>();

/** `runId`: the refused run while it is still queued (null: none, or it has settled). `remainingMs`: its lease left, read when a timer is armed. */
export function useLeaseExpiryRead(runId: string | null, remainingMs: number | null, visible: boolean, load: () => Promise<void>): void {
  const remaining = useRef(remainingMs);
  remaining.current = remainingMs;
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!runId || remaining.current === null || !visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const made = readsMade.get(runId) ?? 0;
      if (cancelled || made >= MAX_READS) return;
      const delay = made === 0 ? Math.max(0, remaining.current ?? 0) + LEASE_MARGIN_MS : RETRY_MS + Math.random() * RETRY_JITTER_MS;
      timer = setTimeout(() => {
        readsMade.set(runId, made + 1);
        void loadRef.current().catch(() => undefined).then(arm); // a failed read is retried within the cap; a settled run unmounts this effect
      }, delay);
    };
    arm();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [runId, visible]);
}
