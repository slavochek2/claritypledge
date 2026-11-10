/**
 * P1631: starting the model run of a Clarify draft, once per draft per tab, and telling the open thread when a run ended so it
 * reads the drafts again. The run itself is the `clarify-draft` edge function; what it ended in is read back from the database.
 */
import { invokeClarifyDraft, type InvokeResult } from '@/app/data/clarify-service';

const started = new Set<string>();
const threads = new Set<string>();

/** A Clarify press holds the generic reply for its copy at most this long, whatever the press does. */
export const CLARIFY_START_HOLD_MAX_MS = 15_000;
let startsInFlight = 0;
let startWaiters: Array<() => void> = [];

/**
 * Runs a Clarify press. The copy it creates reaches this tab by realtime, possibly before the press has its answer, so the mirror
 * provider holds its decision about a Clarify copy while a press is in flight (`clarifyStartsSettled`). `threadKnown` registers
 * the new root the moment the server has named it.
 */
export async function trackClarifyStart<R>(press: (threadKnown: (rootId: string) => void) => Promise<R>): Promise<R> {
  startsInFlight += 1;
  const hold: { on: boolean; timer?: ReturnType<typeof setTimeout> } = { on: true };
  const release = () => {
    if (!hold.on) return;
    hold.on = false;
    clearTimeout(hold.timer);
    startsInFlight = Math.max(0, startsInFlight - 1);
    if (startsInFlight === 0) {
      const now = startWaiters;
      startWaiters = [];
      now.forEach((go) => go());
    }
  };
  hold.timer = setTimeout(release, CLARIFY_START_HOLD_MAX_MS);
  try {
    return await press((rootId) => {
      registerClarifyThread(rootId);
      release();
    });
  } finally {
    release();
  }
}

/** A promise that settles when no Clarify press is in flight; null when none is. */
export function clarifyStartsSettled(): Promise<void> | null {
  return startsInFlight === 0 ? null : new Promise<void>((go) => startWaiters.push(go));
}

/** Remembers that this root is a Clarify draft thread, so the generic mirror reply stays silent in it (as for canvas threads). */
export function registerClarifyThread(rootId: string): void {
  threads.add(rootId);
}
export function isClarifyThread(rootId: string | null | undefined): boolean {
  return !!rootId && threads.has(rootId);
}
const listeners = new Set<(draftId: string) => void>();

/** Called when a run this tab started has ended (whatever it ended in). */
export function onClarifyRunEnded(listener: (draftId: string) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Starts the run unless this tab already did. Never throws: the draft row holds the outcome. */
export async function runClarifyDraft(draftId: string): Promise<InvokeResult | null> {
  if (started.has(draftId)) return null;
  started.add(draftId);
  const result = await invokeClarifyDraft(draftId);
  listeners.forEach((l) => l(draftId));
  return result;
}

/** A retry is a new run of the same draft: allow it to start again. */
export function forgetClarifyRun(draftId: string): void {
  started.delete(draftId);
}

/** Tests only. */
export function resetClarifyRuns(): void {
  started.clear();
  threads.clear();
  startsInFlight = 0;
  startWaiters = [];
  listeners.clear();
}
