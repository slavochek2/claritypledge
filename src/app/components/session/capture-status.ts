/**
 * @file capture-status.ts
 * @description P1388: the recorder's status copy and the one rule that picks the line — kept
 * out of capture-controls.tsx so that file exports components only (fast refresh).
 */
import { useRoomCapture } from '@/app/contexts/room-capture-context';

export const STOP_TRANSCRIBING = 'Stop transcribing';

/** [FOUNDER DECISION: copy — PROPOSED] status lines. */
export const STATUS = {
  running: '● Transcribing for AI insights',
  stalled: '● Live text has stalled — your words are still being recorded.',
  paused: 'Paused — not recording',
  autoPaused: 'Paused while a live session or recording is on',
  silent: 'No sound is reaching the recording — check the mic',
  micLost: 'Microphone disconnected — nothing is being recorded',
  micSwitched: 'Microphone changed — still recording',
  stopping: 'Stopped — saving the last few seconds…',
  notRecording: 'Not recording — the recorder could not start. Tap Reconnect to try again',
  notReaching: "Your audio isn't reaching us — still trying",
} as const;

/** A failed upload of a few seconds is not a state a person can act on, so it is not shown (the context still tracks it).
 *  Uploads failing for longer (audioStuck, INBOX-338) are shown: the audio is not reaching us, and the queue keeps trying.
 *  [FOUNDER DECISION: copy, proposed] notReaching.
 *  Short words for the short bar — each state named, never a vague "check mic" for a state
 *  that is not about the mic (adversarial review 2). */
export const SHORT = {
  running: 'Transcribing', observing: 'Recording in another tab', stopping: 'Stopping…', micLost: 'Mic lost',
  paused: 'Paused', autoPaused: 'Paused', micSwitched: 'Mic changed', silent: 'No sound', stalled: 'Live text stalled',
  notRecording: 'Not recording', notReaching: 'Audio not reaching us',
} as const;

export type CaptureStatusKind = keyof typeof SHORT;

export function useCaptureStatus(): { text: string; warn: boolean; kind: CaptureStatusKind } {
  const { phase, manualPaused, inputSilent, micLost, micSwitched, stopping, tapDown, audioStuck } = useRoomCapture();
  if (stopping) return { text: STATUS.stopping, warn: false, kind: 'stopping' };
  if (micLost) return { text: STATUS.micLost, warn: true, kind: 'micLost' };
  if (tapDown) return { text: STATUS.notRecording, warn: true, kind: 'notRecording' };
  if (phase === 'paused' && manualPaused) return { text: STATUS.paused, warn: false, kind: 'paused' };
  // Paused by the app (an explain-back, a /live session) — never claim to be transcribing.
  if (phase === 'paused') return { text: STATUS.autoPaused, warn: false, kind: 'autoPaused' };
  if (phase === 'observing') return { text: STATUS.running, warn: false, kind: 'observing' };
  if (micSwitched) return { text: STATUS.micSwitched, warn: false, kind: 'micSwitched' };
  if (inputSilent) return { text: STATUS.silent, warn: true, kind: 'silent' };
  // after "No sound" (the person can act on that one) and ahead of a stalled live line (no audio reaches us, so that is why)
  if (audioStuck) return { text: STATUS.notReaching, warn: true, kind: 'notReaching' };
  if (phase === 'stalled') return { text: STATUS.stalled, warn: true, kind: 'stalled' };
  return { text: STATUS.running, warn: false, kind: 'running' };
}
