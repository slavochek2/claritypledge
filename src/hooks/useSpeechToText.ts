/**
 * @file useSpeechToText.ts
 * @description Hook for browser-based speech-to-text using Web Speech API.
 * Falls back to text input on unsupported browsers (Firefox).
 */
import { useState, useCallback, useRef, useEffect } from 'react';

// Web Speech API types (not fully typed in TypeScript)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export interface UseSpeechToTextReturn {
  /** Current transcription text */
  transcript: string;
  /** Whether currently listening */
  isListening: boolean;
  /** Whether browser supports speech recognition */
  isSupported: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Interim (not yet final) transcript while speaking */
  interimTranscript: string;
  /** Start listening */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Reset transcript to empty */
  resetTranscript: () => void;
  /** Set transcript manually (for text input fallback) */
  setTranscript: (text: string) => void;
  /**
   * P1196: autoRestart only. True once the bounded restart attempts are exhausted —
   * live text is dead and will not come back without a user gesture. Always false
   * when autoRestart is not enabled, so default callers see no behavior change.
   */
  liveTextStopped: boolean;
  /**
   * P1196: the last recognition error string verbatim (`not-allowed`,
   * `audio-capture`, `network`, `InvalidStateError`, ...), for on-device diagnosis.
   * Null until something fails.
   */
  lastRecognitionError: string | null;
}

export interface UseSpeechToTextOptions {
  /**
   * P1149 Gate 0 / Risks: `onend` only sets isListening = false — there is no
   * auto-restart, so a mobile timeout / silence / network blip kills the live
   * transcript silently while the person keeps talking. Opt-in only: default
   * (undefined/false) is byte-for-byte the pre-P1149 behavior, so /chat and
   * TranscriptionInput are unaffected (spec Non-Goals — do not modify
   * useSpeechToText's default behavior).
   */
  autoRestart?: boolean;
}

/**
 * P1196: `onend` fires only at the end of a recognition SESSION. Calling start()
 * inline from onend and swallowing the throw ended the loop permanently — no session
 * began, so no further onend ever fired. On phones that throw is the normal case
 * (iOS demands a user gesture; Android throws InvalidStateError on immediate restart),
 * which is why live text died on mobile while desktop stayed green. Restarts are now
 * scheduled off a timer with backoff, bounded, and surfaced when exhausted.
 */
const RESTART_MAX_ATTEMPTS = 5;
const RESTART_BASE_DELAY_MS = 250;

export function useSpeechToText(lang: string = 'en-US', options?: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const autoRestart = options?.autoRestart ?? false;
  // Distinguishes "the caller called stopListening()" from "the browser ended
  // recognition on its own" — only the latter should trigger a restart.
  const intentionalStopRef = useRef(false);

  // P1196 restart machinery. Refs, not state: the recognition event handlers below are
  // created once per effect run and must read current values without re-subscribing.
  const [liveTextStopped, setLiveTextStopped] = useState(false);
  const [lastRecognitionError, setLastRecognitionError] = useState<string | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartAttemptsRef = useRef(0);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  // Check browser support
  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Initialize recognition on mount
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      // A session actually began — the restart budget resets for the next drop.
      restartAttemptsRef.current = 0;
      setIsListening(true);
      setError(null);
      setLiveTextStopped(false);
      console.info('[speech] recognition started');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[speech] recognition error:', event.error, event.message ?? '');
      setLastRecognitionError(event.error);

      // Don't treat "no-speech" as an error - user just didn't say anything
      if (event.error === 'no-speech') {
        return;
      }

      // Handle permission denied
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access and try again.');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }

      setIsListening(false);
    };

    // P1196: schedules ONE attempt, and re-schedules itself when start() throws. The
    // old code called start() inline and relied on "the next onend" to retry, which
    // cannot happen: a throw means no session started, so onend never fires again.
    const scheduleRestart = () => {
      if (!autoRestart || intentionalStopRef.current) return;

      if (restartAttemptsRef.current >= RESTART_MAX_ATTEMPTS) {
        console.warn(
          `[speech] auto-restart exhausted after ${RESTART_MAX_ATTEMPTS} attempts — live text stopped`,
        );
        setLiveTextStopped(true);
        return;
      }

      const attempt = restartAttemptsRef.current;
      restartAttemptsRef.current = attempt + 1;
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (intentionalStopRef.current) return;
        try {
          recognition.start();
        } catch (err) {
          // iOS: NotAllowedError (no user gesture). Android: InvalidStateError.
          // Either way onend will NOT fire, so this path owns the next attempt.
          const name = err instanceof Error ? err.name : String(err);
          console.warn(`[speech] auto-restart attempt ${attempt + 1} threw: ${name}`);
          setLastRecognitionError(name);
          scheduleRestart();
        }
      }, RESTART_BASE_DELAY_MS * 2 ** attempt);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      console.info('[speech] recognition ended');
      scheduleRestart();
    };

    recognitionRef.current = recognition;

    return () => {
      intentionalStopRef.current = true;
      clearRestartTimer();
      recognition.abort();
    };
  }, [isSupported, lang, autoRestart, clearRestartTimer]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    intentionalStopRef.current = false;
    clearRestartTimer();
    restartAttemptsRef.current = 0;
    setError(null);
    setInterimTranscript('');
    setLiveTextStopped(false);

    try {
      recognitionRef.current.start();
    } catch (err) {
      // P1196: this is the "Resume live text" path, and on iOS it is the ONLY path
      // that can work. A throw here used to be swallowed as "already started", which
      // left liveTextStopped false (cleared optimistically just above) with no session
      // running and no onend coming — so the room fell into "Reconnecting..." forever
      // and the Resume button, which only renders in the stopped state, disappeared.
      // Restore the stopped state instead, so the control the user needs stays on
      // screen. Guarded on autoRestart so default callers keep the old behavior.
      const name = err instanceof Error ? err.name : String(err);
      console.warn(`[speech] start() threw on manual start: ${name}`);
      if (autoRestart) {
        setLastRecognitionError(name);
        setLiveTextStopped(true);
      }
    }
  }, [clearRestartTimer, autoRestart]);

  const stopListening = useCallback(() => {
    intentionalStopRef.current = true;
    clearRestartTimer();
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening, clearRestartTimer]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript,
    liveTextStopped,
    lastRecognitionError,
  };
}
