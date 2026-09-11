/**
 * P1236 — audio setup must not hang, or the room says "Listening" and stores nothing.
 *
 * Found by adversarial review of this branch, 2026-09-11, and it is the THIRD instance of
 * one defect in this feature: an await with no bottom (see `src/lib/with-deadline.ts`).
 *
 * `audioWorklet.addModule` is a same-origin fetch with no AbortSignal. `startCapture`
 * awaits it, and the room page calls `void startCapture(...)` AFTER switching the view to
 * the room — so if the load never settles, the participant sits in a room that claims to
 * be listening while nothing is captured and no error is raised.
 *
 * The stall counter cannot catch this: it increments from the serial sender's
 * onError/onDrop, and no slice is ever attempted. "No attempts" and "no failures" look
 * identical to it. That is why this needs its own bound rather than a louder symptom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withDeadline, RequestTimeoutError } from '@/lib/with-deadline';
import { AUDIO_SETUP_TIMEOUT_MS } from '@/lib/audio/slice-recorder';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const never = () => new Promise<never>(() => {});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('P1236 — the audio-setup deadline', () => {
  it('rejects a module load that never settles, rather than waiting forever', async () => {
    const captured = withDeadline(never(), AUDIO_SETUP_TIMEOUT_MS, 'loading the audio worklet')
      .then(() => ({ ok: true as const }), (e: Error) => ({ ok: false as const, e }));

    await vi.advanceTimersByTimeAsync(AUDIO_SETUP_TIMEOUT_MS + 1_000);
    const r = await captured;

    expect(r.ok).toBe(false);
    // The page branches on this exact type to tell the participant that live text failed
    // but recording did NOT — so the type is load-bearing, not decoration.
    expect(!r.ok && r.e).toBeInstanceOf(RequestTimeoutError);
    expect(!r.ok && r.e.message).toContain('loading the audio worklet');
  });

  it('the bound is finite and short enough to be worth telling someone about', () => {
    // A deadline of Infinity, or of ten minutes, is the bug wearing the fix's clothes.
    expect(Number.isFinite(AUDIO_SETUP_TIMEOUT_MS)).toBe(true);
    expect(AUDIO_SETUP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AUDIO_SETUP_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it('CONTROL — a load that resolves in time is passed through untouched', async () => {
    const captured = withDeadline(Promise.resolve('loaded'), AUDIO_SETUP_TIMEOUT_MS, 'loading');
    await vi.advanceTimersByTimeAsync(0);
    await expect(captured).resolves.toBe('loaded');
  });

  it('CONTROL — a load that REJECTS keeps its own error, not the timeout one', async () => {
    const boom = new Error('404 fetching /audio/pcm-tap-worklet.js');
    const captured = withDeadline(Promise.reject(boom), AUDIO_SETUP_TIMEOUT_MS, 'loading')
      .then(() => ({ ok: true as const }), (e: Error) => ({ ok: false as const, e }));
    await vi.advanceTimersByTimeAsync(0);
    const r = await captured;
    // A bad deploy must still say "bad deploy". Collapsing it into a timeout would hide
    // the one failure here that a person can actually fix.
    expect(!r.ok && r.e).toBe(boom);
    expect(!r.ok && r.e).not.toBeInstanceOf(RequestTimeoutError);
  });

  it('clears its timer on success, so a 4-second slice cadence does not leak timers', async () => {
    const before = vi.getTimerCount();
    await withDeadline(Promise.resolve(1), AUDIO_SETUP_TIMEOUT_MS, 'x');
    expect(vi.getTimerCount()).toBe(before);
  });
});

/**
 * WHAT THE TESTS ABOVE DO NOT PROVE, and why this block exists.
 *
 * They exercise `withDeadline` itself. They say nothing about whether `createSliceRecorder`
 * actually USES it — and that is the thing a future edit would remove. `createSliceRecorder`
 * cannot be called here: it needs AudioContext, audioWorklet and a live MediaStream, none of
 * which jsdom provides, and the module's own header says so and forbids reporting it as
 * verified (epistemic gate 7b: what a fixture structurally cannot reach is untested, however
 * green the run is).
 *
 * So the call site is asserted against the source. That is a weaker instrument than running
 * the code, and it is named as weaker rather than dressed up — but it is not nothing: it
 * fails the moment someone unwraps the await, which is the regression that would silently
 * restore a room that says "Listening" and stores nothing.
 */
describe('P1236 — the worklet load is actually wrapped at its call site', () => {
  // resolve from the repo root rather than import.meta.url — under vitest's environment
  // that URL is not a file: URL and fileURLToPath throws.
  const SOURCE = readFileSync(
    resolve(process.cwd(), 'src/lib/audio/slice-recorder.ts'), 'utf8');

  it('addModule is awaited through withDeadline, not bare', () => {
    // Match the CALL, not the prose: the file header names `audioWorklet.addModule` in a
    // sentence, and indexOf on the bare identifier finds that first — which made this very
    // assertion fail against correct code the first time it was written.
    const idx = SOURCE.indexOf("audioWorklet.addModule('");
    expect(idx).toBeGreaterThan(-1);
    // Look back over the enclosing call expression only — far enough to span the wrapper,
    // short enough that an unrelated withDeadline elsewhere cannot satisfy it.
    const preceding = SOURCE.slice(Math.max(0, idx - 160), idx);
    expect(preceding).toContain('withDeadline(');
    expect(SOURCE).not.toMatch(/await\s+context\.audioWorklet\.addModule\(/);
  });

  it('context.resume is awaited through withDeadline, not bare', () => {
    expect(SOURCE).toContain("withDeadline(context.resume()");
    expect(SOURCE).not.toMatch(/await\s+context\.resume\(\)\s*;/);
  });
});
