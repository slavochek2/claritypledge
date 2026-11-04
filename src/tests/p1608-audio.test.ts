/** P1608: the preflight's scoring can tell the right file from silence, noise and another person's file. */
import { describe, expect, it } from 'vitest';
import { envelopeDb, scorePreflight, bestCorrelation } from '../../e2e/helpers/p1608-audio';

const SR = 16000;
/** Speech-like: bursts of a tone at pseudo-random on/off times, seeded. */
function burstSignal(seed: number, seconds = 6): Float32Array {
  const out = new Float32Array(SR * seconds);
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let t = 0;
  while (t < seconds) {
    const on = 0.2 + rnd() * 0.8, off = 0.2 + rnd() * 0.8;
    const amp = 0.1 + rnd() * 0.4;
    for (let i = Math.floor(t * SR); i < Math.min(out.length, Math.floor((t + on) * SR)); i++) out[i] = amp * Math.sin(i / 7);
    t += on + off;
  }
  return out;
}
const env = (x: Float32Array) => envelopeDb(x, SR);
const refs = { A: env(burstSignal(1)), B: env(burstSignal(2)), C: env(burstSignal(3)) };

describe('P1608 preflight scoring', () => {
  it('passes when every browser played its own file (even delayed and with different gain)', () => {
    const shifted = (x: Float32Array, gain: number) => { const y = new Float32Array(x.length); y.set(x.subarray(0, x.length - 3200), 3200); return y.map((v) => v * gain); };
    const captured = { A: env(shifted(burstSignal(1), 0.3)), B: env(shifted(burstSignal(2), 4)), C: env(shifted(burstSignal(3), 1)) };
    expect(scorePreflight(captured, refs).every((s) => s.ok)).toBe(true);
  });
  it('fails a browser that recorded silence (fake-device flag missing)', () => {
    const captured = { A: env(burstSignal(1)), B: env(new Float32Array(SR * 6)), C: env(burstSignal(3)) };
    const r = scorePreflight(captured, refs);
    expect(r.find((s) => s.person === 'B')!.ok).toBe(false);
    expect(r.find((s) => s.person === 'A')!.ok).toBe(true);
  });
  it('fails a browser that recorded a different signal (real microphone)', () => {
    const captured = { A: env(burstSignal(1)), B: env(burstSignal(99)), C: env(burstSignal(3)) };
    expect(scorePreflight(captured, refs).find((s) => s.person === 'B')!.ok).toBe(false);
  });
  it('fails two browsers that were given the same file', () => {
    const captured = { A: env(burstSignal(1)), B: env(burstSignal(1)), C: env(burstSignal(3)) };
    const r = scorePreflight(captured, refs);
    expect(r.find((s) => s.person === 'B')!.ok).toBe(false);
  });
  it('correlation of identical envelopes is 1', () => {
    expect(bestCorrelation(refs.A, refs.A)).toBeCloseTo(1, 5);
  });
});
