/**
 * @file audio-level.ts
 * @description P1576: input level for the dictation waveform, from an AnalyserNode's time-domain
 * bytes (unsigned 8-bit, silence at 128).
 */

/** Speech sits well below full scale; this lifts it so the bars visibly move. */
const GAIN = 4;

/** RMS of one analyser frame, scaled for display and clamped to 0..1. */
export function levelFromTimeDomain(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (const byte of data) {
    const centred = (byte - 128) / 128;
    sum += centred * centred;
  }
  return Math.min(1, Math.sqrt(sum / data.length) * GAIN);
}
