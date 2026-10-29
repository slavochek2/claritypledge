/**
 * P1576 Part A: the level meter's math. The AnalyserNode that feeds it is not available in jsdom,
 * so only this pure half is covered; the drawn waveform needs a real browser.
 */
import { describe, it, expect } from 'vitest';
import { levelFromTimeDomain } from '@/lib/audio/audio-level';

const frame = (fill: (i: number) => number, n = 256) => Uint8Array.from({ length: n }, (_, i) => fill(i));

describe('levelFromTimeDomain', () => {
  it('silence (all samples at the 128 midpoint) is 0', () => {
    expect(levelFromTimeDomain(frame(() => 128))).toBe(0);
  });

  it('an empty frame is 0, not NaN', () => {
    expect(levelFromTimeDomain(new Uint8Array(0))).toBe(0);
  });

  it('a loud full-scale wave is 1 (clamped)', () => {
    expect(levelFromTimeDomain(frame((i) => (i % 2 ? 255 : 0)))).toBe(1);
  });

  it('speech-level input reads clearly above silence and below full scale', () => {
    const level = levelFromTimeDomain(frame((i) => 128 + (i % 2 ? 12 : -12)));
    expect(level).toBeGreaterThan(0.15);
    expect(level).toBeLessThan(1);
  });

  it('louder input never reads quieter', () => {
    const quiet = levelFromTimeDomain(frame((i) => 128 + (i % 2 ? 4 : -4)));
    const loud = levelFromTimeDomain(frame((i) => 128 + (i % 2 ? 20 : -20)));
    expect(loud).toBeGreaterThan(quiet);
  });
});
