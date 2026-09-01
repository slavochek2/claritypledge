/**
 * @file useSpeechToText.restart.test.ts
 * @description P1196 — the autoRestart loop must survive a throwing start().
 *
 * The defect: onend called start() inline and swallowed the throw, on the stated
 * belief that "the next onend retries". It cannot — a throw means no session began,
 * so onend never fires again and live text is dead with no visible state. That is
 * the normal path on phones (iOS: no user gesture; Android: InvalidStateError),
 * which is why /transcribe showed no words on mobile while desktop stayed green.
 *
 * Every test here fails against the pre-P1196 hook.
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
/** How many more start() calls should throw before one is allowed to succeed. */
let throwsRemaining = 0;
let startCalls = 0;
/**
 * P1213: the Android S22 shape. start() SUCCEEDS — onstart fires, the session is
 * real — and then the session ends at once having produced no result. Nothing
 * throws, so none of the throw-based machinery above sees anything wrong.
 */
let endsImmediately = false;
/**
 * Adversarial review (P1213): the permission-denied shape. start() does NOT throw,
 * onstart NEVER fires, and the browser goes straight to onerror + onend.
 */
let deniesWithoutStarting = false;
/** Adversarial review (P1213): the session emits an INTERIM result, then dies. */
let emitsInterimThenDies = false;

function MockCtor(): MockRecognition {
  const instance: MockRecognition = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    onstart: null,
    start: vi.fn(() => {
      startCalls++;
      if (throwsRemaining > 0) {
        throwsRemaining--;
        // The real shapes: iOS Safari without a gesture, Android on immediate restart.
        const err = new Error('start() blocked');
        err.name = 'InvalidStateError';
        throw err;
      }
      if (deniesWithoutStarting) {
        instance.onerror?.({ error: 'not-allowed' });
        instance.onend?.();
        return;
      }
      instance.onstart?.();
      if (emitsInterimThenDies) {
        instance.onresult?.({
          resultIndex: 0,
          results: [Object.assign([{ transcript: 'half a wo' }], { isFinal: false })],
        });
      }
      if (endsImmediately || emitsInterimThenDies) instance.onend?.();
    }),
    stop: vi.fn(() => instance.onend?.()),
    abort: vi.fn(),
  };
  lastInstance = instance;
  return instance;
}

beforeEach(() => {
  vi.useFakeTimers();
  throwsRemaining = 0;
  startCalls = 0;
  endsImmediately = false;
  deniesWithoutStarting = false;
  emitsInterimThenDies = false;
  vi.stubGlobal('SpeechRecognition', MockCtor);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('P1196: a throwing start() must not end the restart loop', () => {
  it('retries after start() throws, and recovers when a later attempt succeeds', () => {
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });
    expect(startCalls).toBe(1);
    expect(result.current.isListening).toBe(true);

    // The recognizer drops on its own (mobile timeout / end of utterance), and the
    // next two restart attempts throw the way a phone throws.
    throwsRemaining = 2;
    act(() => { lastInstance.onend?.(); });

    // Attempts are spaced by exponential backoff (250ms, 500ms, 1000ms), each one
    // scheduled by the throw of the one before it. Advance far enough for all three.
    act(() => { vi.advanceTimersByTime(250); });
    expect(startCalls).toBe(2);   // attempt 1 — throws. Pre-P1196 the loop ended here.
    act(() => { vi.advanceTimersByTime(500); });
    expect(startCalls).toBe(3);   // attempt 2 — throws
    act(() => { vi.advanceTimersByTime(1000); });
    expect(startCalls).toBe(4);   // attempt 3 — succeeds

    expect(result.current.isListening).toBe(true);
    expect(result.current.liveTextStopped).toBe(false);
  });

  it('bounds the retries and surfaces liveTextStopped instead of failing silent', () => {
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });

    throwsRemaining = Number.MAX_SAFE_INTEGER; // every restart attempt throws
    act(() => { lastInstance.onend?.(); });
    act(() => { vi.advanceTimersByTime(60_000); });

    expect(result.current.liveTextStopped).toBe(true);
    expect(result.current.isListening).toBe(false);
    // Bounded — it did not spin forever. 1 manual start + 5 bounded attempts.
    expect(startCalls).toBe(6);
    expect(result.current.lastRecognitionError).toBe('InvalidStateError');
  });

  it('a user gesture (startListening) resets the budget and clears the stopped state', () => {
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });
    throwsRemaining = Number.MAX_SAFE_INTEGER;
    act(() => { lastInstance.onend?.(); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.liveTextStopped).toBe(true);

    // This is the "Resume live text" tap — on iOS the only thing that can work.
    throwsRemaining = 0;
    act(() => { result.current.startListening(); });

    expect(result.current.liveTextStopped).toBe(false);
    expect(result.current.isListening).toBe(true);
  });

  it('a Resume tap that itself throws keeps the stopped state, not a silent dead end', () => {
    // Review finding (P1196): startListening() clears liveTextStopped optimistically.
    // If start() then throws — the normal iOS shape — nothing restores it, so the room
    // showed "Reconnecting..." forever and the Resume button, which only renders in the
    // stopped state, vanished. The user's only recovery was a page reload.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });
    throwsRemaining = Number.MAX_SAFE_INTEGER;
    act(() => { lastInstance.onend?.(); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.liveTextStopped).toBe(true);

    // The Resume tap — and it throws too.
    act(() => { result.current.startListening(); });

    expect(result.current.isListening).toBe(false);
    expect(result.current.liveTextStopped).toBe(true);   // button stays on screen
    expect(result.current.lastRecognitionError).toBe('InvalidStateError');
  });

  it('a throwing manual start leaves default callers untouched', () => {
    const { result } = renderHook(() => useSpeechToText());

    throwsRemaining = Number.MAX_SAFE_INTEGER;
    act(() => { result.current.startListening(); });

    expect(result.current.liveTextStopped).toBe(false);
    expect(result.current.lastRecognitionError).toBe(null);
  });

  it('an intentional stop cancels a pending restart', () => {
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });
    throwsRemaining = 1;
    act(() => { lastInstance.onend?.(); });

    act(() => { result.current.stopListening(); });
    const callsAtStop = startCalls;

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(startCalls).toBe(callsAtStop);
    expect(result.current.liveTextStopped).toBe(false);
  });

  it('default (no options) never schedules a restart — P1149 DW-8 unchanged', () => {
    const { result } = renderHook(() => useSpeechToText());

    act(() => { result.current.startListening(); });
    act(() => { lastInstance.onend?.(); });
    act(() => { vi.advanceTimersByTime(60_000); });

    expect(startCalls).toBe(1);
    expect(result.current.liveTextStopped).toBe(false);
  });
});

describe('P1213: a session that starts and dies at once must exhaust the budget too', () => {
  it('does not loop forever when every session ends immediately with no result', () => {
    // The prod symptom on a Galaxy S22 (2026-09-01): "Reconnecting microphone..."
    // cycling forever, and the "Live text stopped" banner — the only surface that
    // carries the raw recognition error — never appearing.
    //
    // Why P1196 did not cover this: onstart reset restartAttemptsRef to 0. A session
    // that STARTS and then dies resets the budget on every cycle, so
    // RESTART_MAX_ATTEMPTS is never reached. The bounded-retry guarantee only ever
    // bound a start() that THROWS; a start/end churn loop ran unbounded and the room
    // dead-ended in a state with no user recovery.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    endsImmediately = true;
    act(() => { result.current.startListening(); });
    act(() => { vi.advanceTimersByTime(60_000); });

    // 1 manual start + 5 bounded attempts. Pre-fix this spun without limit.
    expect(startCalls).toBe(6);
    expect(result.current.liveTextStopped).toBe(true);
    expect(result.current.isListening).toBe(false);
  });

  it('a session that produced a result resets the budget', () => {
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });

    // Four dead sessions in a row — one short of exhaustion.
    endsImmediately = true;
    act(() => { vi.advanceTimersByTime(60_000); });
    endsImmediately = false;

    // A real utterance lands, then that session ends normally. Live text is working,
    // so the next drop must get a full budget rather than the leftover of the last one.
    act(() => { result.current.startListening(); });
    act(() => {
      lastInstance.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'one two three' }], { isFinal: true })],
      });
    });
    act(() => { lastInstance.onend?.(); });
    act(() => { vi.advanceTimersByTime(60_000); });

    expect(result.current.transcript).toBe('one two three');
    expect(result.current.liveTextStopped).toBe(false);
    expect(result.current.isListening).toBe(true);
  });

  it('a session that stayed open long enough resets the budget even with no words', () => {
    // Somebody sat quiet for a while and the recognizer timed out. That is a healthy
    // session, not a failing one — it must not consume the budget reserved for churn.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });
    act(() => { vi.advanceTimersByTime(30_000); });
    act(() => { lastInstance.onend?.(); });
    act(() => { vi.advanceTimersByTime(250); });

    expect(result.current.isListening).toBe(true);
    expect(result.current.liveTextStopped).toBe(false);
  });
});

describe('P1213 adversarial review: the budget must not be resettable by a non-session', () => {
  it('a session that never started (permission denied) does not reset the budget', () => {
    // sessionStartedAtRef is written ONLY in onstart. On permission denial the browser
    // fires onerror + onend with no onstart at all, so the ref still held its initial 0
    // and `Date.now() - 0` was comfortably "productive" — the unbounded loop came
    // straight back, on the single most likely phone failure of all.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    deniesWithoutStarting = true;
    act(() => { result.current.startListening(); });
    act(() => { vi.advanceTimersByTime(60_000); });

    expect(startCalls).toBe(6);
    expect(result.current.liveTextStopped).toBe(true);
    expect(result.current.lastRecognitionError).toBe('not-allowed');
  });

  it('an interim-only session does not reset the budget', () => {
    // Only FINAL results are broadcast to the room (transcribe-room-page.tsx sends off
    // `transcript`, which grows on isFinal only). A recognizer emitting a stray interim
    // and dying produces nothing anyone can read, so counting it productive kept the
    // budget alive while the chat stayed empty — churn with no terminal state.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    emitsInterimThenDies = true;
    act(() => { result.current.startListening(); });
    act(() => { vi.advanceTimersByTime(60_000); });

    expect(startCalls).toBe(6);
    expect(result.current.liveTextStopped).toBe(true);
    expect(result.current.transcript).toBe('');
  });
});

describe('P1213 adversarial review: the stopped banner must name the churn failure', () => {
  it('exhausting on silent churn reports no-audio, not an empty banner', () => {
    // The churn path fires no onerror and throws nothing, so lastRecognitionError
    // stayed null and the banner rendered with no explanation — on exactly the failure
    // this fix exists to make diagnosable on-device.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    endsImmediately = true;
    act(() => { result.current.startListening(); });
    act(() => { vi.advanceTimersByTime(60_000); });

    expect(result.current.liveTextStopped).toBe(true);
    expect(result.current.lastRecognitionError).toMatch(/^no-audio /);
  });

  it('a new session clears the previous session error instead of misattributing it', () => {
    // A transient throw that self-heals used to stay on screen forever and become the
    // stated cause of a later, unrelated outage.
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });
    throwsRemaining = 1;
    act(() => { lastInstance.onend?.(); });
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.lastRecognitionError).toBe('InvalidStateError');

    // Attempt 2 succeeds — the hiccup healed. The stale error must not survive it.
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.isListening).toBe(true);
    expect(result.current.lastRecognitionError).toBe(null);
  });
});
