/**
 * @file mic-lifecycle.ts
 * @description P1576: the parts of a microphone start/stop that dictation (use-dictation) and voice notes
 * (use-voice-note) share, so the two cannot drift apart.
 */
import { useEffect, type MutableRefObject } from 'react';

interface MicRecorder {
  startRecording(): Promise<boolean>;
  stopRecording(): Promise<unknown>;
}

/**
 * Opens the microphone for a start that can be cancelled while the permission prompt is open. Marks the start
 * pending and the phase 'starting', then returns true when recording began and this start is still the current
 * one. A superseded start stops the recorder it opened; a refused start clears the origin, flags the microphone
 * as failed and returns to 'idle'.
 */
export async function openMic(
  recorder: MicRecorder,
  pending: MutableRefObject<boolean>,
  generation: MutableRefObject<number>,
  mine: number,
  origin: MutableRefObject<unknown>,
  setMicFailed: (failed: boolean) => void,
  setPhase: (phase: 'starting' | 'idle') => void,
): Promise<boolean> {
  const o = { recorder, pending, generation, mine, origin, setMicFailed, setPhase };
  o.pending.current = true;
  o.setPhase('starting');
  let started: boolean;
  try {
    started = await o.recorder.startRecording();
  } finally {
    o.pending.current = false;
  }
  if (o.generation.current !== o.mine) {
    if (started) await o.recorder.stopRecording(); // cancelled (or the chat changed) while the prompt was open
    return false;
  }
  if (!started) {
    o.origin.current = null;
    o.setMicFailed(true);
    o.setPhase('idle');
    return false;
  }
  return true;
}

/** The tab going to the background (an incoming call, another app) ends a recording in progress. */
export function useCancelWhenHidden(phaseRef: { readonly current: string }, cancel: () => unknown): void {
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (phaseRef.current === 'starting' || phaseRef.current === 'recording') void cancel();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phaseRef, cancel]);
}
