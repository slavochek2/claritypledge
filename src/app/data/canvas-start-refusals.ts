/**
 * @file canvas-start-refusals.ts
 * @description P1529 (founder 2026-11-13): a canvas run is made by the database and STARTED by a second request to `canvas-draft`. When that
 * request is refused (terms not accepted, a 4xx or 5xx, a dropped network) the run stays queued for its 3-minute lease and the page said
 * "Updating…" the whole time. This remembers, per run id, the refusal the start came back with, so the thread stops reading the run as going
 * and says what happened. In memory only: a reload starts the run again (the stranded-run restart), which clears it.
 * `BUSY` and `NOT_READY` are not remembered: they are waiting states (another run is active; a transcript is pending), so waiting is the truth.
 */
import { useSyncExternalStore } from 'react';

const refused = new Map<string, string>();
/** Runs whose refusal a mounted thread is showing (queued, start refused): only these turn the Publish spot's words into "Not updated". */
const shown = new Set<string>();
/** Runs whose start request is going now (from any caller): the stranded-run restart leaves them alone. */
const going = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function recordStartRefusal(runId: string, code: string): void {
  if (code === 'BUSY' || code === 'NOT_READY' || refused.get(runId) === code) return;
  refused.set(runId, code);
  emit();
}

export const markStartGoing = (runId: string): void => { going.add(runId); };
export const markStartDone = (runId: string): void => { going.delete(runId); };
export const startInFlight = (runId: string): boolean => going.has(runId);

export function clearStartRefusal(runId: string): void {
  if (refused.delete(runId)) emit();
}

export function startRefusalOf(runId: string | null | undefined): string | null {
  return (runId && refused.get(runId)) || null;
}

/** A mounted thread shows this run's refusal; returns the cleanup. */
export function showStartRefusal(runId: string): () => void {
  shown.add(runId);
  emit();
  return () => { if (shown.delete(runId)) emit(); };
}

/** True while a mounted thread shows a refused start: the Publish spot says "Not updated" instead of "Updating…" (the draft stays busy). */
export function useAnyStartRefusal(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => shown.size > 0,
    () => false,
  );
}

/** The refusal the last start of this run came back with (null: none, or no run). */
export function useStartRefusal(runId: string | null | undefined): string | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => startRefusalOf(runId),
    () => null,
  );
}
