/**
 * @file useSpeechToText.regression.test.ts
 * @description P1149 DW-8 — existing /live and /chat speech behavior verified unchanged.
 *
 * P1149 added an opt-in `autoRestart` option to useSpeechToText (Non-Goal: "if
 * useSpeechToText needs the restart fix, add it behind an opt-in option so current
 * callers are unchanged"). This file locks the pre-P1149 default behavior: with no
 * options argument (as both existing call sites — transcription-input.tsx and
 * clarity-chat-page.tsx — invoke it), `onend` does exactly what it did before: sets
 * isListening false and clears interimTranscript, and never calls start() again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechToText } from '@/hooks/useSpeechToText';

interface MockSpeechRecognition {
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

let lastInstance: MockSpeechRecognition;

// A plain function (not an arrow function, not a class with `this` aliasing) so it
// remains usable as a constructor via `new` — the hook does `new SpeechRecognitionAPI()`.
// Explicitly returning an object from a constructor call makes `new` use THAT object
// instead of the implicit `this`-bound one, which is what lets `instance` below close
// over its own start/stop without ever aliasing `this`.
function MockSpeechRecognitionCtor(): MockSpeechRecognition {
  const instance: MockSpeechRecognition = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    onstart: null,
    start: vi.fn(() => instance.onstart?.()),
    stop: vi.fn(() => instance.onend?.()),
    abort: vi.fn(),
  };
  lastInstance = instance;
  return instance;
}

beforeEach(() => {
  vi.stubGlobal('SpeechRecognition', MockSpeechRecognitionCtor);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('P1149 DW-8: useSpeechToText default behavior (no options) is unchanged', () => {
  it('onend sets isListening false and does NOT call start() again', () => {
    const { result } = renderHook(() => useSpeechToText());

    act(() => { result.current.startListening(); });
    expect(result.current.isListening).toBe(true);
    expect(lastInstance.start).toHaveBeenCalledTimes(1);

    act(() => { lastInstance.onend?.(); });

    expect(result.current.isListening).toBe(false);
    expect(result.current.interimTranscript).toBe('');
    // No auto-restart by default — start() was only ever called by startListening().
    expect(lastInstance.start).toHaveBeenCalledTimes(1);
  });

  it('with lang positional arg only (the /chat call shape), onend still does not restart', () => {
    const { result } = renderHook(() => useSpeechToText('de-DE'));

    act(() => { result.current.startListening(); });
    act(() => { lastInstance.onend?.(); });

    expect(result.current.isListening).toBe(false);
    expect(lastInstance.start).toHaveBeenCalledTimes(1);
  });
});

describe('P1149 DW-8: autoRestart: true is opt-in and additive only', () => {
  it('onend calls start() again only when autoRestart is explicitly true', () => {
    // P1196 changed the MECHANISM, not the guarantee: the restart is now scheduled on
    // a timer rather than called inline from onend, because an inline call that throws
    // (the normal case on phones) ended the loop permanently with no further onend to
    // retry from. The assertion below therefore advances timers; what it asserts —
    // autoRestart: true restarts, and nothing else does — is unchanged.
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

      act(() => { result.current.startListening(); });
      expect(lastInstance.start).toHaveBeenCalledTimes(1);

      act(() => { lastInstance.onend?.(); });
      act(() => { vi.advanceTimersByTime(250); });

      // onend fired once, and the auto-restart branch called start() a second time.
      expect(lastInstance.start).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT restart after an intentional stopListening() call', () => {
    const { result } = renderHook(() => useSpeechToText('en-US', { autoRestart: true }));

    act(() => { result.current.startListening(); });
    act(() => { result.current.stopListening(); }); // this itself fires onend via the mock's stop()

    expect(lastInstance.start).toHaveBeenCalledTimes(1);
  });
});
