/**
 * @file p1417-banner-small-parity.test.ts
 * @description P1417 — the small-copy path rule exists twice (the app's src/lib/banner-small.ts
 * and the edge functions' supabase/functions/_shared/banner-small.ts, which Deno cannot share with
 * Vite), so this pins them together; and both banner-saving edge functions must make the copy when
 * they save a banner and remove it when they remove the old banner. Source-level, like p1392: the
 * helper's own behaviour is tested in Deno (supabase/functions/_shared/banner-small.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BANNER_SMALL_SUFFIX, BANNER_SMALL_WIDTH } from '@/lib/banner-small';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const shared = read('supabase/functions/_shared/banner-small.ts');

describe('P1417: one path rule for the app and the edge functions', () => {
  it('same width and suffix', () => {
    expect(shared).toMatch(new RegExp(`export const BANNER_SMALL_WIDTH = ${BANNER_SMALL_WIDTH};`));
    expect(shared).toMatch(/export const BANNER_SMALL_SUFFIX = `\.w\$\{BANNER_SMALL_WIDTH\}\.webp`;/);
    expect(BANNER_SMALL_SUFFIX).toBe('.w800.webp');
  });
});

describe.each([
  ['generate-banner', 'supabase/functions/generate-banner/index.ts'],
  ['generate-event-banner', 'supabase/functions/generate-event-banner/index.ts'],
])('P1417: %s saves and removes the small copy', (_name, file) => {
  const src = read(file);

  it('imports the shared helpers', () => {
    expect(src).toMatch(/import \{[^}]*scheduleSmallCopy[^}]*\} from '\.\.\/_shared\/banner-small\.ts'/);
    expect(src).toMatch(/import \{[^}]*removeBannerAndSmallCopy[^}]*\} from '\.\.\/_shared\/banner-small\.ts'/);
  });

  it('schedules the small copy after the banner upload, and never awaits it before responding', () => {
    const upload = src.indexOf('await uploadToStorage(');
    const schedule = src.indexOf('scheduleSmallCopy(');
    const respond = src.indexOf('JSON.stringify({ url: ');
    expect(upload).toBeGreaterThan(-1);
    expect(schedule).toBeGreaterThan(upload);
    expect(respond).toBeGreaterThan(schedule);
    expect(src).not.toMatch(/await\s+storeSmallCopy\(/);
    expect(src).not.toMatch(/await\s+scheduleSmallCopy\(/);
  });

  it('cleanup removes the old banner together with its small copy', () => {
    const cleanup = src.slice(src.indexOf('async function cleanupOldBanner'));
    expect(cleanup).toMatch(/removeBannerAndSmallCopy\(/);
    expect(cleanup).not.toMatch(/\.remove\(\[filePath\]\)/);
  });
});
