/**
 * @file p1565-nonprod-image-guard.test.ts
 * @description P1565 — on any non-prod Supabase project no image path may call Gemini. The helper
 * is unit-tested here (it is dependency-free TypeScript, importable from Vite); each spend path is
 * pinned at source level: the guard must come before the first Gemini request in that function.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isProdProject,
  imageGenAllowed,
  PLACEHOLDER_IMAGE,
} from '../../supabase/functions/_shared/nonprod-image-guard';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const PROD = 'https://besjtuodziykmjidubzw.supabase.co';
const TEST = 'https://ayibkeoyukulbsjpxgaw.supabase.co';

describe('P1565: isProdProject', () => {
  it('true only for the prod host', () => {
    expect(isProdProject(PROD)).toBe(true);
    expect(isProdProject(`${PROD}/`)).toBe(true);
  });
  it('fails closed on test, empty, garbage and lookalikes', () => {
    for (const u of [TEST, '', 'garbage', 'http://127.0.0.1:54321', 'https://besjtuodziykmjidubzw.supabase.co.evil.com', 'https://evil.com/besjtuodziykmjidubzw.supabase.co', 'https://xbesjtuodziykmjidubzw.supabase.co']) {
      expect(isProdProject(u)).toBe(false);
    }
  });
});

describe('P1565: imageGenAllowed', () => {
  it('prod always allowed', () => expect(imageGenAllowed(PROD, {})).toBe(true));
  it('non-prod blocked by default', () => {
    expect(imageGenAllowed(TEST, {})).toBe(false);
    expect(imageGenAllowed(TEST, { ALLOW_NONPROD_IMAGE_GEN: '0' })).toBe(false);
    expect(imageGenAllowed('', { ALLOW_NONPROD_IMAGE_GEN: 'true' })).toBe(false);
  });
  it('explicit opt-in allows non-prod', () => expect(imageGenAllowed(TEST, { ALLOW_NONPROD_IMAGE_GEN: '1' })).toBe(true));
});

describe('P1565: placeholder is a real PNG', () => {
  it('has PNG magic bytes', () => {
    expect(PLACEHOLDER_IMAGE.mimeType).toBe('image/png');
    const head = Buffer.from(PLACEHOLDER_IMAGE.data, 'base64').subarray(0, 8);
    expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});

/** Index of the first match of `re` in `src` at/after `from`, or -1. */
const at = (src: string, re: RegExp, from = 0) => {
  const m = re.exec(src.slice(from));
  return m ? from + m.index : -1;
};

describe('P1565: every Gemini image path is guarded before its request', () => {
  it('geminiGenerateImage (shared) guards before fetch', () => {
    const src = read('supabase/functions/_shared/artist-banner-run.ts');
    const fn = at(src, /export async function geminiGenerateImage/);
    const guard = at(src, /nonProdImageBlocked\(/, fn);
    const fetchAt = at(src, /fetch\(geminiUrl/, fn);
    expect(guard).toBeGreaterThan(fn);
    expect(guard).toBeLessThan(fetchAt);
  });
  it('runArtistBanner (shared choke point) guards before the fidelity loop', () => {
    const src = read('supabase/functions/_shared/artist-banner-run.ts');
    const fn = at(src, /export async function runArtistBanner/);
    const guard = at(src, /nonProdImageBlocked\(/, fn);
    const loop = at(src, /generateArtistBanner\(entry/, fn);
    expect(guard).toBeGreaterThan(fn);
    expect(guard).toBeLessThan(loop);
  });
  it('generate-event-banner guards before its own Gemini fetch', () => {
    const src = read('supabase/functions/generate-event-banner/index.ts');
    const fn = at(src, /async function generateImage/);
    const guard = at(src, /nonProdImageBlocked\(/, fn);
    const fetchAt = at(src, /fetch\(geminiGenerateUrl/, fn);
    expect(guard).toBeGreaterThan(fn);
    expect(guard).toBeLessThan(fetchAt);
  });
  it.each([
    'supabase/functions/generate-banner/index.ts',
    'supabase/functions/mirror-portrait/index.ts',
    'supabase/functions/generate-agent-banner/index.ts',
  ])('%s reaches Gemini only through the guarded shared helpers', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/generativelanguage\.googleapis\.com/);
    expect(src).toMatch(/runArtistBanner|geminiGenerateImage/);
  });
});
