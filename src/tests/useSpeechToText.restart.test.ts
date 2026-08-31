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
      instance.onstart?.();
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
