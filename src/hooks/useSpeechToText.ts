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
      setIsListening(true);
      setError(null);
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
      console.error('Speech recognition error:', event.error);

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

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');

      if (autoRestart && !intentionalStopRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started, or restarted too quickly — the next onend retries.
          console.warn('Speech recognition auto-restart failed to start');
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      intentionalStopRef.current = true;
      recognition.abort();
    };
  }, [isSupported, lang, autoRestart]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    intentionalStopRef.current = false;
    setError(null);
    setInterimTranscript('');

    try {
      recognitionRef.current.start();
    } catch {
      // Already started - ignore
      console.warn('Speech recognition already started');
    }
  }, []);

  const stopListening = useCallback(() => {
    intentionalStopRef.current = true;
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

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
  };
}
