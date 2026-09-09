/**
 * @file p1288-duplicate-final-results.test.ts
 * @description P1288 — a finalized result must be appended to `transcript` exactly once.
 *
 * THE DEFECT, measured on prod 2026-09-09. The first two real /transcribe sessions after
 * P1275 restored room creation wrote 134 rows for 66 distinct utterances, and 196 rows for
 * 109 distinct utterances. Bucketed into 10-second slices the ratio sat at ~1.8 from the
 * first slice to the last — FLAT, not climbing. A runaway accumulator would climb as the
 * session lengthened; a flat ratio means each utterance is written about twice, once, and
 * then never again. The founder also confirmed the recognizer was NOT cycling during those
 * runs (the "Reconnecting microphone…" indicator only appeared after speech stopped), so
 * session restarts are not involved.
 *
 * That leaves a duplicate emission. `onresult` walks `event.resultIndex → results.length`
 * and appends every `isFinal` entry. `event.results` is cumulative for the life of a
 * session, so this is correct ONLY while `resultIndex` advances past what was already
 * consumed. When it does not — which is the documented Android Chrome shape — the same
 * final result is appended a second time, the page diffs the grown string, and the delta
 * is written as a new row.
 *
 * WHAT THIS FILE DOES AND DOES NOT PROVE. It proves the hook is idempotent per final
 * result: a re-delivered result changes nothing, a new one still appends, and a genuine
 * repeat in a NEW session still appends. It does NOT prove Android is what re-delivers —
 * that needs the instrumented phone run in the spec. The fix is written to be correct
 * whichever layer re-delivers, because idempotence per result index is right either way.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechToText } from '@/hooks/useSpeechToText';

interface MockRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

let lastInstance: MockRecognition;

function MockCtor(): MockRecognition {
  const instance: MockRecognition = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    onstart: null,
    start: vi.fn(() => { instance.onstart?.(); }),
    stop: vi.fn(() => instance.onend?.()),
    abort: vi.fn(),
  };
  lastInstance = instance;
  return instance;
}

/** One SpeechRecognitionResult: an array-like whose [0] is the alternative. */
const res = (text: string, isFinal: boolean) =>
  Object.assign([{ transcript: text }], { isFinal });

/** Fire onresult the way the browser does: the CUMULATIVE results list for the session. */
const fire = (resultIndex: number, results: ReturnType<typeof res>[]) =>
  act(() => { lastInstance.onresult?.({ resultIndex, results }); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('SpeechRecognition', MockCtor);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('P1288: each finalized result is appended exactly once', () => {
  it('ignores a re-delivered final result whose resultIndex did not advance', () => {
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: false }));
    act(() => { result.current.startListening(); });

    const first = res('hello world', true);
    fire(0, [first]);
    expect(result.current.transcript).toBe('hello world');

    // The Android shape: onresult fires AGAIN for a result already delivered as final.
    // Same cumulative list, same index. Pre-fix this appended a second copy, and the
    // page's delta-diff then wrote it as a new row.
    fire(0, [first]);
    expect(result.current.transcript,
      'a re-delivered final result must not be appended twice').toBe('hello world');

    // And a third time, because the prod ratio implies it can happen more than once.
    fire(0, [first]);
    expect(result.current.transcript).toBe('hello world');
  });

  it('still appends a genuinely new result that arrives in the same session', () => {
    // CONTROL. Without this, a fix that simply ignored every repeat index would pass the
    // test above by dropping real speech — the failure mode that matters more than the bug.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: false }));
    act(() => { result.current.startListening(); });

    const a = res('hello world', true);
    fire(0, [a]);
    fire(0, [a]);                       // duplicate, ignored
    const b = res(' and goodbye', true);
    fire(1, [a, b]);                    // new result at a new index — must append

    expect(result.current.transcript).toBe('hello world and goodbye');
  });

  it('appends the SAME words again when they are spoken again in a new session', () => {
    // The edge that makes naive text-deduplication wrong. People repeat themselves, and a
    // new recognition session restarts its results list at index 0. Deduplicating on text,
    // or failing to reset the consumed-index on session start, silently eats real speech.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: false }));
    act(() => { result.current.startListening(); });

    fire(0, [res('yes', true)]);
    expect(result.current.transcript).toBe('yes');

    act(() => { lastInstance.onend?.(); });          // session ends
    act(() => { result.current.startListening(); }); // a new session begins

    fire(0, [res(' yes', true)]);                    // genuinely said again
    expect(result.current.transcript,
      'a repeat in a new session is real speech, not a duplicate').toBe('yes yes');
  });

  it('interim results still never enter the transcript', () => {
    // DW-4 is load-bearing and predates this fix: interim text must never leave the
    // browser. Asserted here so the dedupe change cannot quietly weaken it.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: false }));
    act(() => { result.current.startListening(); });

    fire(0, [res('partial thou', false)]);
    expect(result.current.transcript).toBe('');
    expect(result.current.interimTranscript).toBe('partial thou');

    fire(0, [res('partial thought', true)]);
    expect(result.current.transcript).toBe('partial thought');
  });
});
