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
  silent: 'No sound is reaching the recording — check the mic',
  micLost: 'Microphone disconnected — nothing is being recorded',
  micSwitched: 'Microphone changed — still recording',
  stopping: 'Stopped — saving the last few seconds…',
} as const;

export function useCaptureStatus(): { text: string; warn: boolean } {
  const { phase, manualPaused, inputSilent, micLost, micSwitched, stopping } = useRoomCapture();
  if (stopping) return { text: STATUS.stopping, warn: false };
  if (micLost) return { text: STATUS.micLost, warn: true };
  if (phase === 'paused' && manualPaused) return { text: STATUS.paused, warn: false };
  if (micSwitched) return { text: STATUS.micSwitched, warn: false };
  if (inputSilent) return { text: STATUS.silent, warn: true };
  if (phase === 'stalled') return { text: STATUS.stalled, warn: true };
  return { text: STATUS.running, warn: false };
}

