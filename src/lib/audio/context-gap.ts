/**
 * @file context-gap.ts
 * @description P1596: keeps the capture AudioContext running and measures the time it was not.
 *
 * Safari can suspend or interrupt a context when its window goes to the background; the PCM tap then delivers
 * no samples, so the archive holds less audio than wall time. We call resume() on a state change to
 * suspended/interrupted and whenever the window is shown or focused again, and report any stretch longer than
 * CONTEXT_GAP_MIN_MS. Only the duration is reported: a counted, non-content value. Not filled with silence:
 * the room batch places each chunk by its own object time (see `chunk_end_times` in audio.py).
 */
import { analytics } from '@/lib/mixpanel';

export const CONTEXT_GAP_MIN_MS = 2_000;

interface Deps { now: () => number; doc: Document; win: Window }

export function watchContext(
  context: AudioContext,
  onGap: (ms: number) => void,
  deps: Deps = { now: Date.now, doc: document, win: window },
): () => void {
  const { now, doc, win } = deps;
  const running = () => (context.state as string) === 'running';
  let since: number | null = running() ? null : now();

  const resume = () => { void context.resume().catch(() => {}); };
  const settle = () => {
    if (since === null) return;
    const ms = now() - since;
    since = null;
    if (ms <= CONTEXT_GAP_MIN_MS) return;
    analytics.track('audio_context_gap', { gap_ms: ms });
    onGap(ms);
  };
  const onState = () => {
    const state = context.state as string;
    if (state === 'running') return settle();
    if (state === 'closed') return;
    since ??= now();
    if (state === 'suspended' || state === 'interrupted') resume();
  };
  const onBack = () => { if (!running() && doc.visibilityState === 'visible') resume(); };

  context.addEventListener('statechange', onState);
  doc.addEventListener('visibilitychange', onBack);
  win.addEventListener('focus', onBack);
  return () => {
    context.removeEventListener('statechange', onState);
    doc.removeEventListener('visibilitychange', onBack);
    win.removeEventListener('focus', onBack);
    settle();
  };
}
