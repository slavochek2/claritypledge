/**
 * @file voice-waveform.ts
 * @description P1576 Part B: the pure decisions behind the voice bubble's bars: how tall each bar is, how many
 * are filled at a playback position, which time a tap or drag at some x means, and what the arrow keys do.
 */

export const WAVEFORM_BARS = 50;
/** Shortest and tallest bar, px. Silence still shows as a dot-line. */
export const BAR_MIN_PX = 3;
export const BAR_MAX_PX = 26;
/** What each arrow key press moves the playhead. */
export const KEY_SEEK_MS = 5000;
/** The bar level used when a note has no stored waveform (a legacy note). */
const FALLBACK_LEVEL = 6;

/** Exactly 50 values 0..100: the stored waveform clamped, or 50 equal low bars when there is none (or it is malformed). */
export function barLevels(waveform: number[] | null | undefined): number[] {
  if (!waveform || waveform.length !== WAVEFORM_BARS) return Array.from({ length: WAVEFORM_BARS }, () => FALLBACK_LEVEL);
  return waveform.map((v) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0));
}

/** Bar height in px for a level 0..100, never below the dot-line minimum. */
export function barHeightPx(level: number): number {
  return Math.round(BAR_MIN_PX + (Math.min(100, Math.max(0, level)) / 100) * (BAR_MAX_PX - BAR_MIN_PX));
}

/** How many bars (from the left) are filled at this position. 0 for an unknown length; all of them at the end. */
export function filledBars(positionMs: number, durationMs: number, bars: number = WAVEFORM_BARS): number {
  if (!(durationMs > 0) || !(positionMs > 0)) return 0;
  return Math.min(bars, Math.floor((positionMs / durationMs) * bars));
}

/** The time a pointer at `clientX` means on a bar area that starts at `left` and is `width` wide. Clamped to the clip. */
export function seekTimeMs(clientX: number, left: number, width: number, durationMs: number): number {
  if (!(width > 0) || !(durationMs > 0)) return 0;
  const fraction = Math.min(1, Math.max(0, (clientX - left) / width));
  return Math.round(fraction * durationMs);
}

/** The new position after an arrow key, or null for any other key. */
export function keySeekMs(key: string, positionMs: number, durationMs: number): number | null {
  const delta = key === 'ArrowRight' ? KEY_SEEK_MS : key === 'ArrowLeft' ? -KEY_SEEK_MS : 0;
  if (delta === 0) return null;
  return Math.min(Math.max(0, durationMs), Math.max(0, positionMs + delta));
}
