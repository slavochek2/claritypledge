/**
 * @file p1417-banner-small-encode.test.ts
 * @description P1417 — the small copy that scripts/event-banner-small.ts and event-photo-prep.sh
 * upload: WebP, 800px wide, never enlarged, aspect kept, far smaller than a wide PNG original.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { encodeSmallBanner } from '../../scripts/lib/banner-small-encode';
import { BANNER_SMALL_WIDTH } from '@/lib/banner-small';

// A noisy wide PNG, so the size comparison is not won by a flat image compressing to nothing.
async function widePng(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let x = 12345; // LCG noise: deterministic, and PNG cannot shortcut it
  for (let i = 0; i < raw.length; i++) raw[i] = (x = (x * 1103515245 + 12345) >>> 0) >>> 24;
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('P1417: encodeSmallBanner', () => {
  it('a 2400x1143 PNG becomes an 800px-wide WebP with the same aspect, much smaller', async () => {
    const input = await widePng(2400, 1143);
    const out = await encodeSmallBanner(input);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(BANNER_SMALL_WIDTH);
    expect(out.width).toBe(800);
    expect(out.height).toBe(381);
    expect(out.data.length).toBeLessThan(input.length / 4);
  });

  it('never enlarges a banner that is already narrower than 800px', async () => {
    const out = await encodeSmallBanner(await widePng(600, 300));
    expect(out.width).toBe(600);
    expect(out.height).toBe(300);
  });
});
