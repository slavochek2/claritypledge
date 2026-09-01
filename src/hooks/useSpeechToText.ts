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
/**
 * P1213: how long a session must survive to count as healthy when it produced no
 * words. Below this, a start/end pair is churn — the recognizer is being handed a
 * mic it cannot use — and must consume the restart budget like a throw does.
 * Above it, somebody was simply quiet and the recognizer timed out, which is a
 * normal drop that earns a full budget for the next one.
 */
const PRODUCTIVE_SESSION_MS = 1500;

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
  // P1213: whether the session that is ending did any real work. See onend.
  // Adversarial review (P1213): onstart is NOT guaranteed to fire. On permission
  // denial the browser goes straight to onerror + onend, leaving sessionStartedAtRef
  // at its initial 0 — and `Date.now() - 0` is a ~1.7e12ms "session" that read as
  // productive and reset the budget forever, restoring the very bug this fix closes.
  const sessionActiveRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const sessionGotResultRef = useRef(false);

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
      // P1213: a session BEGINNING is not evidence the loop is healthy, so the budget
      // is no longer reset here. On Android the failing shape is a session that starts
      // cleanly and dies at once with no audio; resetting on onstart made that loop
      // unbounded, liveTextStopped unreachable, and the room's only recovery control
      // — which renders solely in the stopped state — impossible to show. The reset
      // moved to onend, where the session's actual outcome is known.
      sessionActiveRef.current = true;
      sessionStartedAtRef.current = Date.now();
      sessionGotResultRef.current = false;
      setIsListening(true);
      setError(null);
      setLiveTextStopped(false);
      // Adversarial review (P1213): a new session invalidates the previous session's
      // error. Left uncleared, a transient throw that self-healed minutes ago stayed
      // on screen as the stated cause of a later, unrelated outage.
      setLastRecognitionError(null);
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
        // P1213, tightened by adversarial review: FINAL only. Interim text never
        // leaves the browser (DW-4) and never enters `transcript`, so a session that
        // emitted a stray interim and died put nothing on anyone's screen. Counting
        // it as productive kept the budget alive while the room stayed empty — the
        // churn this fix exists to end.
        sessionGotResultRef.current = true;
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

      // P1213: judge the session that just ended. A productive one (it heard words,
      // or it stayed open long enough to be a normal silence timeout) resets the
      // budget. An instant, wordless one is churn and leaves the budget alone, so
      // RESTART_MAX_ATTEMPTS is actually reachable and the failure surfaces.
      const started = sessionActiveRef.current;
      sessionActiveRef.current = false;
      const durationMs = started ? Date.now() - sessionStartedAtRef.current : 0;
      const productive =
        started && (sessionGotResultRef.current || durationMs >= PRODUCTIVE_SESSION_MS);
      if (productive) restartAttemptsRef.current = 0;

      // Adversarial review (P1213): the churn case fires NO onerror and throws
      // nothing, so nothing else ever names it. Without this the stopped-state banner
      // rendered with no error at all — on the one failure this whole fix exists to
      // make diagnosable on-device. Name it, and carry the evidence.
      if (started && !productive) {
        setLastRecognitionError(`no-audio (session ended after ${durationMs}ms with no words)`);
      }

      console.info(
        `[speech] recognition ended after ${durationMs}ms ` +
        `(started=${started}, heard=${sessionGotResultRef.current}, ` +
        `productive=${productive}, ` +
        `attempts=${restartAttemptsRef.current})`,
      );
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
