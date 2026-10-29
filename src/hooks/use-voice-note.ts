/**
 * @file use-voice-note.ts
 * @description P1576 Part B: the voice-note recorder behind the chat composer's round mic.
 *
 *   idle -> starting (permission prompt) -> recording -> sending -> idle
 *                                              \-> ready (stopped at the limit, waiting for a tap)
 *           sending -> error (clip kept: Retry / Discard)
 *
 * Capture is `useAudioRecorder`; the blob becomes a 16 kHz mono WAV (`blobToWav16k`, cut to the
 * server's 2-minute cap) and goes to `send`, which the pane binds to `sendVoiceNote`. Nothing is
 * ever sent without a tap: reaching the limit stops the recording and holds the clip.
 *
 * Rules this hook owns (each pinned in src/tests/p1576-use-voice-note.test.tsx):
 * - A recording belongs to the chat it started in. A change of `draftKey`, or the tab going to the
 *   background mid-recording, discards it before anything is sent. A send already in flight is NOT
 *   cancelled, and it goes to the sender captured when ➤ was pressed, never to the chat on screen now.
 * - A double tap is one send: the phase flips synchronously, before any await.
 * - A failure keeps the clip for Retry unless the server would refuse it again.
 */
import { openMic, useCancelWhenHidden } from './mic-lifecycle';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { isDictationSupported } from '@/hooks/use-dictation';
import { VoiceNoteError, type VoiceUploadReceipt } from '@/app/data/chat-voice-service';
import { blobToWav16k } from '@/lib/audio/clip-wav';

/** Founder, 2026-10-26: a voice note is at most 2 minutes. The server enforces it by decoded length. */
export const VOICE_MAX_MS = 120_000;

const TICK_MS = 200;

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'ready' | 'sending' | 'error';
/** `resume`: the upload already stored by an earlier attempt, to be committed again rather than uploaded again. */
export interface VoiceAttempt {
  resume?: VoiceUploadReceipt;
}
export type VoiceSender = (wav: Blob, opts?: VoiceAttempt) => Promise<unknown>;
type Sender = VoiceSender;
type ToWav = (blob: Blob, maxMs?: number) => Promise<Uint8Array>;

/** A plain sentence for a failed send; never the server's own text. */
export function voiceErrorText(error: unknown): string {
  if (error instanceof VoiceNoteError) {
    if (error.reason === 'rate') return 'Too many voice messages. Wait a minute and try again.';
    if (error.reason === 'too_long') return 'That voice message is too long (2 minutes at most).';
    if (error.reason === 'forbidden') return "You can't send voice messages in this chat.";
    if (error.reason === 'unsupported') return "Voice messages aren't available in this chat.";
  }
  return "Couldn't send the voice message.";
}

/** Sending the same clip again can succeed: the network, a rate limit, a server hiccup. */
function worthRetrying(error: unknown): boolean {
  if (!(error instanceof VoiceNoteError)) return true;
  // A commit refused as bad audio (400) is final: the same stored object is refused again.
  return error.status !== 400 && (error.reason === 'rate' || error.reason === 'failed');
}

export interface VoiceNote {
  /** Voice notes are on for this composer and this browser can record. */
  enabled: boolean;
  phase: VoicePhase;
  /** Anything but idle: the composer's other mic stands down. */
  busy: boolean;
  /** The recorder bar replaces the row, in the chat the recording belongs to. */
  showBar: boolean;
  elapsedMs: number;
  stream: MediaStream | null;
  /** Microphone problem, for the idle composer. */
  notice: string | null;
  errorText: string | null;
  canRetry: boolean;
  start: () => Promise<void>;
  submit: () => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
  discard: () => void;
}

export function useVoiceNote(draftKey: string, send: Sender | undefined, toWav: ToWav = blobToWav16k): VoiceNote {
  const recorder = useAudioRecorder();
  const [phase, setPhaseState] = useState<VoicePhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micFailed, setMicFailed] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [originKey, setOriginKey] = useState<string | null>(null);

  const phaseRef = useRef<VoicePhase>('idle');
  const setPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
    if (next === 'idle') setOriginKey(null);
  }, []);

  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const sendRef = useRef(send);
  sendRef.current = send;
  const toWavRef = useRef(toWav);
  toWavRef.current = toWav;
  const keyRef = useRef(draftKey);
  keyRef.current = draftKey;

  const originRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const startPendingRef = useRef(false);
  // True while Send waits for the recorder to finish: a cancel in that window wins (nothing is encoded or sent after it).
  const stoppingRef = useRef(false);
  const blobRef = useRef<Blob | null>(null); // the recording, once stopped at the limit
  const clipRef = useRef<Blob | null>(null); // the WAV, kept for Retry
  const receiptRef = useRef<VoiceUploadReceipt | null>(null); // the stored upload of a failed commit, kept for Retry
  const senderRef = useRef<Sender | undefined>(undefined); // captured when ➤ was pressed
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (limitRef.current) clearTimeout(limitRef.current);
    tickRef.current = null;
    limitRef.current = null;
  };

  const fail = useCallback((error: unknown) => {
    setFailure(error);
    setPhase('error');
  }, [setPhase]);

  const attempt = useCallback(async () => {
    const sender = senderRef.current;
    const clip = clipRef.current;
    if (!sender || !clip) return;
    const tryOnce = async (resume: VoiceUploadReceipt | null): Promise<unknown> => {
      try {
        await (resume ? sender(clip, { resume }) : sender(clip));
        return null;
      } catch (error) {
        return error ?? new Error('send failed');
      }
    };
    let error = await tryOnce(receiptRef.current);
    // The stored object was gone when the commit was repeated (404): forget it and send the kept WAV afresh.
    if (error && receiptRef.current && error instanceof VoiceNoteError && error.status === 404) {
      receiptRef.current = null;
      error = await tryOnce(null);
    }
    if (error) {
      receiptRef.current = error instanceof VoiceNoteError ? error.receipt ?? null : null;
      fail(error);
      return;
    }
    clipRef.current = null;
    receiptRef.current = null;
    setFailure(null);
    setPhase('idle');
  }, [fail, setPhase]);

  /** The recording reached the limit: stop it and hold the clip until the person taps send or bin. */
  const holdAtLimit = useCallback(async (generation: number) => {
    clearTimers();
    const blob = await recorderRef.current.stopRecording();
    if (generationRef.current !== generation) return;
    if (!blob || blob.size === 0) {
      fail(new Error('The recording is empty'));
      return;
    }
    blobRef.current = blob;
    setElapsedMs(VOICE_MAX_MS);
    setPhase('ready');
  }, [fail, setPhase]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' || startPendingRef.current) return;
    setMicFailed(false);
    setFailure(null);
    receiptRef.current = null;
    const generation = ++generationRef.current;
    originRef.current = keyRef.current;
    setOriginKey(keyRef.current);
    if (!(await openMic(recorderRef.current, startPendingRef, generationRef, generation, originRef, setMicFailed, setPhase))) return;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setPhase('recording');
    tickRef.current = setInterval(() => setElapsedMs(Math.min(VOICE_MAX_MS, Date.now() - startedAtRef.current)), TICK_MS);
    limitRef.current = setTimeout(() => void holdAtLimit(generation), VOICE_MAX_MS);
  }, [holdAtLimit, setPhase]);

  /**
   * The kept recording to the WAV that is sent. The recording stays until this has worked: a browser that
   * cannot decode it right now (a transient failure) leaves it in place for Retry rather than losing it.
   */
  const encode = useCallback(async (): Promise<boolean> => {
    const blob = blobRef.current;
    try {
      if (!blob || blob.size === 0) {
        blobRef.current = null;
        throw new Error('The recording is empty');
      }
      const wav = await toWavRef.current(blob, VOICE_MAX_MS);
      clipRef.current = new Blob([wav as BlobPart], { type: 'audio/wav' });
      blobRef.current = null;
      return true;
    } catch (error) {
      clipRef.current = null;
      fail(error);
      return false;
    }
  }, [fail]);

  const submit = useCallback(async () => {
    const was = phaseRef.current;
    if (was !== 'recording' && was !== 'ready') return;
    setPhase('sending');
    clearTimers();
    senderRef.current = sendRef.current;
    if (was === 'recording') {
      const generation = generationRef.current;
      stoppingRef.current = true;
      const blob = await recorderRef.current.stopRecording();
      stoppingRef.current = false;
      if (generationRef.current !== generation) return;
      blobRef.current = blob;
    }
    if (!(await encode())) return;
    await attempt();
  }, [attempt, encode, setPhase]);

  const discard = useCallback(() => {
    if (phaseRef.current !== 'error') return;
    clipRef.current = null;
    blobRef.current = null;
    receiptRef.current = null;
    originRef.current = null;
    setFailure(null);
    setPhase('idle');
  }, [setPhase]);

  const cancel = useCallback(async () => {
    const was = phaseRef.current;
    if (was === 'error') {
      discard();
      return;
    }
    if (stoppingRef.current) {
      generationRef.current++;
      blobRef.current = null;
      originRef.current = null;
      setPhase('idle');
      return;
    }
    if (was !== 'starting' && was !== 'recording' && was !== 'ready') return;
    generationRef.current++;
    clearTimers();
    blobRef.current = null;
    originRef.current = null;
    setPhase('idle');
    if (was === 'recording') await recorderRef.current.stopRecording();
  }, [discard, setPhase]);

  const retry = useCallback(async () => {
    if (phaseRef.current !== 'error' || (!clipRef.current && !blobRef.current)) return;
    setPhase('sending');
    if (!clipRef.current && !(await encode())) return;
    await attempt();
  }, [attempt, encode, setPhase]);

  // A recording belongs to the chat it started in; so does a clip waiting on Retry.
  useEffect(() => {
    setMicFailed(false);
    if (originRef.current && originRef.current !== draftKey) void cancel();
  }, [draftKey, cancel]);

  useCancelWhenHidden(phaseRef, cancel);

  // Leaving the page mid-recording releases the microphone.
  useEffect(() => () => {
    clearTimers();
    // Nothing recorded is kept past the composer: no blob, clip or receipt outlives it.
    blobRef.current = null;
    clipRef.current = null;
    receiptRef.current = null;
    if (phaseRef.current === 'starting' || phaseRef.current === 'recording') {
      generationRef.current++;
      void recorderRef.current.stopRecording();
    }
  }, []);

  const inBar = phase === 'recording' || phase === 'ready' || phase === 'sending' || phase === 'error';
  return {
    enabled: !!send && isDictationSupported(),
    phase,
    busy: phase !== 'idle',
    showBar: inBar && originKey === draftKey,
    elapsedMs,
    stream: recorder.stream,
    notice: micFailed ? recorder.error ?? 'The microphone is not available.' : null,
    errorText: phase === 'error' ? voiceErrorText(failure) : null,
    canRetry: phase === 'error' && (clipRef.current !== null || blobRef.current !== null) && worthRetrying(failure),
    start,
    submit,
    cancel,
    retry,
    discard,
  };
}
