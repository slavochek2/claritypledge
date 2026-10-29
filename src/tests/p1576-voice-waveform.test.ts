/**
 * @file p1576-voice-waveform.test.ts
 * @description P1576 Part B: the pure rules behind the voice bubble's bars.
 */
import { describe, expect, it } from 'vitest';
import { BAR_MAX_PX, BAR_MIN_PX, barHeightPx, barLevels, filledBars, keySeekMs, seekTimeMs, WAVEFORM_BARS } from '@/app/pages/chat/voice-waveform';

describe('barLevels', () => {
  it('returns exactly 50 values, clamped to 0..100', () => {
    const w = Array.from({ length: 50 }, (_, i) => (i === 0 ? -5 : i === 1 ? 250 : i));
    const out = barLevels(w);
    expect(out).toHaveLength(WAVEFORM_BARS);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(100);
    expect(out[7]).toBe(7);
  });
  it('NULL (a legacy note) and a malformed length both give 50 equal low bars', () => {
    for (const w of [null, undefined, [1, 2, 3], new Array(51).fill(50)]) {
      const out = barLevels(w);
      expect(out).toHaveLength(50);
      expect(new Set(out).size).toBe(1);
      expect(out[0]).toBeLessThanOrEqual(10);
    }
  });
});

describe('barHeightPx', () => {
  it('silence is still a dot-line, loud is the tallest, and it grows with the level', () => {
    expect(barHeightPx(0)).toBe(BAR_MIN_PX);
    expect(barHeightPx(100)).toBe(BAR_MAX_PX);
    expect(barHeightPx(50)).toBeGreaterThan(barHeightPx(20));
    expect(barHeightPx(-30)).toBe(BAR_MIN_PX);
    expect(barHeightPx(900)).toBe(BAR_MAX_PX);
  });
});

describe('filledBars (progress to filled count)', () => {
  it('maps position to bars before the playhead', () => {
    expect(filledBars(0, 10_000)).toBe(0);
    expect(filledBars(5_000, 10_000)).toBe(25);
    expect(filledBars(12_400, 65_000)).toBe(9);
    expect(filledBars(10_000, 10_000)).toBe(50);
  });
  it('never exceeds the bars when the element runs past the length, and never divides by zero', () => {
    expect(filledBars(14_000, 10_000)).toBe(50);
    expect(filledBars(3_000, 0)).toBe(0);
    expect(filledBars(-5, 10_000)).toBe(0);
    expect(filledBars(Number.NaN, 10_000)).toBe(0);
  });
});

describe('seekTimeMs (x to time)', () => {
  it('maps the pointer across the bar area to the clip', () => {
    expect(seekTimeMs(100, 100, 200, 10_000)).toBe(0);
    expect(seekTimeMs(200, 100, 200, 10_000)).toBe(5_000);
    expect(seekTimeMs(300, 100, 200, 10_000)).toBe(10_000);
  });
  it('clamps a pointer outside the area, and a zero-width area or unknown length is 0', () => {
    expect(seekTimeMs(20, 100, 200, 10_000)).toBe(0);
    expect(seekTimeMs(999, 100, 200, 10_000)).toBe(10_000);
    expect(seekTimeMs(150, 100, 0, 10_000)).toBe(0);
    expect(seekTimeMs(150, 100, 200, 0)).toBe(0);
  });
});

describe('keySeekMs', () => {
  it('moves 5 s either way and clamps to the clip', () => {
    expect(keySeekMs('ArrowRight', 1_000, 60_000)).toBe(6_000);
    expect(keySeekMs('ArrowLeft', 8_000, 60_000)).toBe(3_000);
    expect(keySeekMs('ArrowLeft', 2_000, 60_000)).toBe(0);
    expect(keySeekMs('ArrowRight', 58_000, 60_000)).toBe(60_000);
  });
  it('ignores every other key', () => {
    expect(keySeekMs('Enter', 1_000, 60_000)).toBeNull();
    expect(keySeekMs('ArrowUp', 1_000, 60_000)).toBeNull();
  });
});
