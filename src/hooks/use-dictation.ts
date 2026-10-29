/**
 * @file use-dictation.ts
 * @description P1576 Part A: the dictation state machine behind the chat composer's mic.
 *
 *   idle -> starting (permission prompt) -> recording -> transcribing -> idle
 *                                                     \-> error (clip kept: Retry / Discard)
 *
 * Capture is `useAudioRecorder` (MediaRecorder, single-file mode); the blob is re-encoded to
 * a 16 kHz mono WAV (`blobToWav16k`) and sent to transcribe-clip. Nothing here touches a draft:
 * the finished text goes to `onText` with the draft key and caret it was STARTED from, so the
 * caller can put it in the right place even if the chat on screen has changed since.
 *
 * Rules this hook owns (each pinned in src/tests/p1576-use-dictation.test.tsx):
 * - A recording belongs to the chat it started in. A change of `draftKey`, the tab being hidden
 *   (an incoming call, switching apps) or unmounting stops and discards it. A transcript that is
 *   already in flight is NOT cancelled; it resolves into the originating draft.
 * - A double tap is one request: the phase flips synchronously, before any await.
 * - A failure keeps the clip in memory (never stored) for Retry; Discard drops it.
 * - The recording stops itself under the server's length cap and sends what it has.
 */
import { openMic, useCancelWhenHidden } from './mic-lifecycle';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { transcribeClip, TranscribeClipError } from '@/app/data/transcribe-clip-service';
import { blobToWav16k, DICTATION_AUTO_STOP_MS } from '@/lib/audio/clip-wav';

export type DictationPhase = 'idle' | 'starting' | 'recording' | 'transcribing' | 'error';

/** Where dictated text belongs: the draft it was started in, at the caret it was started from. */
export interface DictationOrigin {
  draftKey: string;
  caret: number;
}

interface Options {
  /** The draft the composer is showing right now. */
  draftKey: string;
  /**
   * Put the words where they belong. The caller owns what happens when they do not fit (the composer
   * holds them per chat); by the time this returns, the hook has finished with them.
   */
  onText: (text: string, origin: DictationOrigin) => void;
  /** Test seams; the defaults are the real clip service and WAV encoder. */
  transcribe?: (wav: Uint8Array) => Promise<string>;
  toWav?: (blob: Blob) => Promise<Uint8Array>;
}

export interface Dictation {
  phase: DictationPhase;
  /** Any phase but idle: the composer shows the recorder, not the field. */
  active: boolean;
  /** The draft the current recording/transcription belongs to; null when idle. The composer shows its
   *  recorder only while this is the chat on screen. */
  originKey: string | null;
  /** The live microphone stream while recording (for the level meter). */
  stream: MediaStream | null;
  /** A one-line message for idle: microphone problem, or nothing heard. */
  notice: string | null;
  /** What went wrong in the error phase. */
  errorText: string | null;
  /** The kept clip can be sent again. */
  canRetry: boolean;
  start: (caret: number) => Promise<void>;
  done: () => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
  discard: () => void;
}

/** True where the browser can capture the microphone, record it and decode the result. */
export function isDictationSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const audioContext = (globalThis as { AudioContext?: unknown; webkitAudioContext?: unknown });
  return !!navigator.mediaDevices?.getUserMedia
    && typeof (globalThis as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined'
    && !!(audioContext.AudioContext ?? audioContext.webkitAudioContext);
}

function describeFailure(error: unknown): string {
  if (error instanceof TranscribeClipError) {
    if (error.status === 429) return "You're dictating too fast. Wait a minute and retry.";
    if (error.status === 413) return 'That recording is too long to transcribe.';
    if (error.status === 401) return 'Sign in again to dictate.';
    if (error.status === 0) return "Couldn't reach the server.";
  }
  return "Couldn't transcribe.";
}

export function useDictation({ draftKey, onText, transcribe = transcribeClip, toWav = blobToWav16k }: Options): Dictation {
  const recorder = useAudioRecorder();
  const [phase, setPhaseState] = useState<DictationPhase>('idle');
  const [micFailed, setMicFailed] = useState(false);
  const [heardNothing, setHeardNothing] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [originKey, setOriginKey] = useState<string | null>(null);

  // The phase is mirrored in a ref so a second tap in the same tick sees the first one's effect.
  const phaseRef = useRef<DictationPhase>('idle');
  const setPhase = useCallback((next: DictationPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
    if (next === 'idle') setOriginKey(null);
  }, []);

  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const transcribeRef = useRef(transcribe);
  transcribeRef.current = transcribe;
  const toWavRef = useRef(toWav);
  toWavRef.current = toWav;
  const keyRef = useRef(draftKey);
  keyRef.current = draftKey;

  const originRef = useRef<DictationOrigin | null>(null);
  const clipRef = useRef<Uint8Array | null>(null);
  // The recording itself, kept until its words are delivered: a decode that fails can be tried again.
  const blobRef = useRef<Blob | null>(null);
  // Bumped whenever a recording is abandoned, so an await that was already under way knows.
  const generationRef = useRef(0);
  // The permission prompt can outlive a cancel; a new start must wait until it has settled, or the
  // late grant would stop the NEW recording (the recorder is one shared MediaRecorder).
  const startPendingRef = useRef(false);
  // True while ✓ waits for the recorder to finish: a cancel in that window wins (nothing is decoded or sent after it).
  const stoppingRef = useRef(false);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef<() => Promise<void>>(async () => {});

  const clearAutoStop = () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
  };

  const send = useCallback(async (wav: Uint8Array, origin: DictationOrigin) => {
    let text: string;
    try {
      text = await transcribeRef.current(wav);
    } catch (error) {
      setFailure(error);
      setPhase('error');
      return;
    }
    clipRef.current = null;
    blobRef.current = null;
    originRef.current = null;
    if (!text.trim()) setHeardNothing(true);
    setFailure(null);
    setPhase('idle');
    if (text.trim()) onTextRef.current(text, origin);
  }, [setPhase]);

  /** The recording to a WAV, kept either way: a decode that fails leaves the recording for Retry. */
  const encodeAndSend = useCallback(async (blob: Blob, origin: DictationOrigin) => {
    let wav: Uint8Array;
    try {
      wav = await toWavRef.current(blob);
    } catch (error) {
      clipRef.current = null;
      setFailure(error);
      setPhase('error');
      return;
    }
    clipRef.current = wav;
    await send(wav, origin);
  }, [send, setPhase]);

  const start = useCallback(async (caret: number) => {
    if (phaseRef.current !== 'idle' || startPendingRef.current) return;
    setMicFailed(false);
    setHeardNothing(false);
    setFailure(null);
    const generation = ++generationRef.current;
    originRef.current = { draftKey: keyRef.current, caret };
    setOriginKey(keyRef.current);
    if (!(await openMic(recorderRef.current, startPendingRef, generationRef, generation, originRef, setMicFailed, setPhase))) return;
    setPhase('recording');
    autoStopRef.current = setTimeout(() => void doneRef.current(), DICTATION_AUTO_STOP_MS);
  }, [setPhase]);

  const done = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    setPhase('transcribing');
    clearAutoStop();
    const origin = originRef.current as DictationOrigin;
    const generation = generationRef.current;
    stoppingRef.current = true;
    const blob = await recorderRef.current.stopRecording();
    stoppingRef.current = false;
    if (generationRef.current !== generation) return;
    if (!blob || blob.size === 0) {
      setFailure(new Error('The recording is empty'));
      setPhase('error');
      return;
    }
    blobRef.current = blob;
    await encodeAndSend(blob, origin);
  }, [encodeAndSend, setPhase]);
  doneRef.current = done;

  const cancel = useCallback(async () => {
    const was = phaseRef.current;
    if (was === 'starting') {
      generationRef.current++;
      originRef.current = null;
      setPhase('idle');
    } else if (was === 'recording') {
      generationRef.current++;
      clearAutoStop();
      originRef.current = null;
      setPhase('idle');
      await recorderRef.current.stopRecording();
    } else if (stoppingRef.current) {
      generationRef.current++;
      originRef.current = null;
      setPhase('idle');
    }
  }, [setPhase]);

  const discard = useCallback(() => {
    if (phaseRef.current !== 'error') return;
    clipRef.current = null;
    blobRef.current = null;
    originRef.current = null;
    setFailure(null);
    setPhase('idle');
  }, [setPhase]);

  const retry = useCallback(async () => {
    const origin = originRef.current;
    if (phaseRef.current !== 'error' || !origin) return;
    const wav = clipRef.current;
    const blob = blobRef.current;
    if (!wav && !blob) return;
    setPhase('transcribing');
    if (wav) await send(wav, origin);
    else await encodeAndSend(blob as Blob, origin);
  }, [send, encodeAndSend, setPhase]);

  // A recording belongs to the chat it started in.
  useEffect(() => {
    // A message about the last chat's microphone is not about this one.
    setMicFailed(false);
    setHeardNothing(false);
    const origin = originRef.current;
    if (!origin || origin.draftKey === draftKey) return;
    if (phaseRef.current === 'starting' || phaseRef.current === 'recording') void cancel();
    else if (phaseRef.current === 'error') discard();
    // 'transcribing' is left running: its text is addressed to the origin draft.
  }, [draftKey, cancel, discard]);

  useCancelWhenHidden(phaseRef, cancel);

  // Leaving the page mid-recording releases the microphone.
  useEffect(() => () => {
    clearAutoStop();
    clipRef.current = null;
    blobRef.current = null;
    if (phaseRef.current === 'starting' || phaseRef.current === 'recording') {
      generationRef.current++;
      void recorderRef.current.stopRecording();
    }
  }, []);

  const notice = micFailed
    ? recorder.error ?? 'The microphone is not available.'
    : heardNothing
      ? "Didn't catch anything. Try again."
      : null;
  const canRetry = phase === 'error' && (clipRef.current !== null || blobRef.current !== null)
    && !(failure instanceof TranscribeClipError && !failure.retryable);

  return {
    phase,
    active: phase !== 'idle',
    originKey,
    stream: recorder.stream,
    notice,
    errorText: phase === 'error' ? describeFailure(failure) : null,
    canRetry,
    start,
    done,
    cancel,
    retry,
    discard,
  };
}
