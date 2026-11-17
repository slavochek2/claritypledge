/**
 * @file prng.ts
 * @description Seeded pseudo-random numbers for the P1702 model. mulberry32 is a small 32-bit generator,
 * good enough for Monte Carlo at this scale and fully reproducible from an integer seed. `seedFrom`
 * derives independent seeds from a label (FNV-1a), so every run in the runner is addressable by name.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a label, mixed with a base seed. Deterministic across platforms. */
export function seedFrom(base: number, label: string): number {
  let h = (0x811c9dc5 ^ base) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
