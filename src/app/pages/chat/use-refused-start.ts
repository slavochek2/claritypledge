/**
 * @file use-refused-start.ts
 * @description P1529: the thread's view of a run whose start request was refused: the refusal (null when none), shown to the Publish spot while the
 * thread is mounted, forgotten when the run is no longer the queued one, and ONE read at the lease's end (use-lease-expiry-read).
 */
import { useEffect, useRef } from 'react';
import type { CanvasDraftRun } from '@/app/data/canvas-draft-service';
import { clearStartRefusal, showStartRefusal, useStartRefusal } from '@/app/data/canvas-start-refusals';
import { useLeaseExpiryRead } from './use-lease-expiry-read';

/** `leaseLeftMs`: how long the queued run's lease has left (the thread's own rule, passed in so this module stays leaf). */
export function useRefusedStart(run: CanvasDraftRun | null, leaseLeftMs: number | null, visible: boolean, load: () => Promise<void>): string | null {
  const queuedRunId = run?.state === 'queued' ? run.id : null;
  const startRefusal = useStartRefusal(queuedRunId);
  useLeaseExpiryRead(startRefusal ? queuedRunId : null, startRefusal ? leaseLeftMs : null, visible, load);
  useEffect(() => (startRefusal && queuedRunId ? showStartRefusal(queuedRunId) : undefined), [startRefusal, queuedRunId]);
  // A refusal belongs to the run it answered:
  // Only a different queued run, or a loaded run confirmed not queued, ends it: a transient null (the read resets on retry or reload) must not, or the
  // stranded-run restart would see a run with no refusal and start it silently.
  const lastQueued = useRef<string | null>(null);
  const confirmedGone = run !== null && run.state !== 'queued';
  useEffect(() => {
    const last = lastQueued.current;
    if (last && last !== queuedRunId && (queuedRunId !== null || confirmedGone)) { clearStartRefusal(last); lastQueued.current = queuedRunId; return; }
    if (queuedRunId) lastQueued.current = queuedRunId;
  }, [queuedRunId, confirmedGone]);
  return startRefusal;
}
