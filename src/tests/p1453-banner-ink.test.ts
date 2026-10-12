/**
 * P1453: ink and darkness, measured on synthetic images whose corners are known.
 */
import { describe, it, expect } from 'vitest';
import {
  centralLuma,
  inkFor,
  isTooDark,
  signatureBox,
  slotSignatureBox,
  DISPLAY_SLOTS,
  DARK_FLOOR,
  type Pixels,
} from '../../supabase/functions/_shared/banner-ink.ts';

const W = 1584;
const H = 672;

/** A 21:9 image filled with `base`, with the region x ≥ fx*W, y ≥ fy*H set to `corner`. */
function image(base: number, corner: number, fx = 0, fy = 0): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fx > 0 && x >= fx * W && y >= fy * H ? corner : base;
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

describe('P1453 signature box (displayed crop)', () => {
  it('maps the wide 640x160 slot to the visible bottom-right of a 21:9 source', () => {
    const b = slotSignatureBox(W, H, DISPLAY_SLOTS.find((s) => s.h === 160)!);
    // Hand-derived: s = 640/1584, vertical crop offset ≈ 55.8 display px.
    expect(b.x0 / W).toBeCloseTo(0.775, 2);
    expect(b.x1 / W).toBeCloseTo(0.978, 2);
    expect(b.y0 / H).toBeCloseTo(0.64, 2);
    expect(b.y1 / H).toBeCloseTo(0.765, 2);
  });

  it('never samples the rows the cover crop removes on the wide slot, and stays inside the image', () => {
    const b = signatureBox(W, H);
    expect(b.x0).toBeGreaterThan(W * 0.4);
    expect(b.y0).toBeGreaterThan(H * 0.5);
    expect(b.x1).toBeLessThanOrEqual(W);
    expect(b.y1).toBeLessThanOrEqual(H);
  });
});

describe('P1453 ink', () => {
  it('uses sepia on a light corner and cream on a dark one', () => {
    expect(inkFor(image(30, 230, 0.45, 0.5))).toBe('sepia');
    expect(inkFor(image(230, 20, 0.45, 0.5))).toBe('cream');
  });

  it('reads the corner as displayed, not the uncropped bottom rows', () => {
    // Bright only in the bottom 8% — rows the 160px slot crops away and phones barely show.
    expect(inkFor(image(20, 255, 0.01, 0.92))).toBe('cream');
  });
});

describe('P1453 darkness floor', () => {
  it('flags a Caravaggio-dark image and passes deliberately dark but legible art', () => {
    expect(isTooDark(centralLuma(image(23, 23)))).toBe(true);
    expect(isTooDark(centralLuma(image(50, 50)))).toBe(false);
    expect(DARK_FLOOR).toBeGreaterThan(23);
    expect(DARK_FLOOR).toBeLessThan(50);
  });

  it('measures only the central band', () => {
    // Bright bottom quarter is cropped away; the band stays dark.
    expect(isTooDark(centralLuma(image(20, 255, 0.01, 0.76)))).toBe(true);
  });
});
