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
} as const;

/** Short words for the short bar — each state named, never a vague "check mic" for a state
 *  that is not about the mic (adversarial review 2). */
export const SHORT = {
  running: '● Recording', observing: 'Recording in another tab', stopping: 'Stopping…', micLost: 'Mic lost',
  paused: 'Paused', autoPaused: 'Paused', micSwitched: 'Mic changed', silent: 'No sound', stalled: 'Live text stalled',
} as const;

export type CaptureStatusKind = keyof typeof SHORT;

export function useCaptureStatus(): { text: string; warn: boolean; kind: CaptureStatusKind } {
  const { phase, manualPaused, inputSilent, micLost, micSwitched, stopping } = useRoomCapture();
  if (stopping) return { text: STATUS.stopping, warn: false, kind: 'stopping' };
  if (micLost) return { text: STATUS.micLost, warn: true, kind: 'micLost' };
  if (phase === 'paused' && manualPaused) return { text: STATUS.paused, warn: false, kind: 'paused' };
  // Paused by the app (an explain-back, a /live session) — never claim to be transcribing.
  if (phase === 'paused') return { text: STATUS.autoPaused, warn: false, kind: 'autoPaused' };
  if (phase === 'observing') return { text: STATUS.running, warn: false, kind: 'observing' };
  if (micSwitched) return { text: STATUS.micSwitched, warn: false, kind: 'micSwitched' };
  if (inputSilent) return { text: STATUS.silent, warn: true, kind: 'silent' };
  if (phase === 'stalled') return { text: STATUS.stalled, warn: true, kind: 'stalled' };
  return { text: STATUS.running, warn: false, kind: 'running' };
}
