/**
 * P1385 — public media goes to Google Cloud Storage by default, and the live site can load it.
 *
 * Production's CSP allows `media-src` from storage.googleapis.com only; the dev server sends no
 * CSP, so a media URL on any other host passes every local run and is blocked on claritypledge.com
 * (P1336, 2026-10-01: four clips on a new Supabase bucket, caught by hand). Two checks:
 *   1. the one helper that builds public media URLs points at an origin vercel.json allows;
 *   2. no file in src/ hand-builds a GCS or Supabase-Storage media URL — they go through the helper.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PUBLIC_MEDIA_ORIGIN, publicMediaUrl } from '@/lib/public-media';

const ROOT = process.cwd();

function cspSources(directive: string): string[] {
  const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;
  return (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${directive} `)) ?? '')
    .split(/\s+/)
    .slice(1);
}

function allowedBy(url: string, directive: string): boolean {
  return cspSources(directive).some((src) => {
    if (src.startsWith("'")) return false; // 'self', 'none' — never an absolute https URL
    const pattern = new RegExp(`^${src.replace(/[.]/g, '\\.').replace('*', '[^/.]+')}(/|$)`);
    return pattern.test(url);
  });
}

/**
 * Media-URL shapes that must only be built by src/lib/public-media.ts. Supabase public-object
 * paths are banned outright: media-src does not allow them on the live site.
 */
const MEDIA_URL_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /storage\.googleapis\.com/, what: 'a hand-built Google Cloud Storage URL' },
  { re: /storage\/v1\/object\/public/, what: 'a Supabase Storage public-object URL' },
  { re: /\.supabase\.co\/storage/, what: 'a Supabase Storage URL' },
];

/**
 * Files allowed to contain a pattern above, each with its reason. Keep this short: a new entry
 * is a decision, not a fix for a red test.
 */
const ALLOWLIST: Record<string, string> = {
  'src/lib/public-media.ts': 'the helper itself — the one place the origin and bucket are named',
  'src/lib/markdown.ts':
    'P1352 matches (does not build) user-uploaded event-banners image URLs; img-src allows *.supabase.co',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'tests' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('P1385: public media URLs', () => {
  it('the helper builds URLs on the public GCS media bucket', () => {
    expect(publicMediaUrl('founder/clip-v1.mp4')).toBe(
      'https://storage.googleapis.com/claritypledge-story-images/founder/clip-v1.mp4',
    );
    expect(publicMediaUrl('/founder/clip-v1.mp4')).toBe(publicMediaUrl('founder/clip-v1.mp4'));
  });

  it("the helper's origin is allowed by production's CSP media-src and img-src (vercel.json)", () => {
    const url = publicMediaUrl('any/file.mp4');
    expect(url.startsWith(`${PUBLIC_MEDIA_ORIGIN}/`)).toBe(true);
    expect(allowedBy(url, 'media-src'), `media-src must allow ${PUBLIC_MEDIA_ORIGIN}`).toBe(true);
    expect(allowedBy(url, 'img-src'), `img-src must allow ${PUBLIC_MEDIA_ORIGIN}`).toBe(true);
    // Control: a Supabase Storage media URL is NOT allowed — the matcher can return false.
    expect(allowedBy('https://abc.supabase.co/storage/v1/object/public/b/x.mp4', 'media-src')).toBe(false);
  });

  it('no file in src/ builds a GCS or Supabase Storage media URL outside the helper', () => {
    const files = sourceFiles(resolve(ROOT, 'src'));
    // Coverage control: the walk reaches the files that used to hand-build media URLs.
    const rel = files.map((f) => relative(ROOT, f));
    expect(rel).toContain('src/app/components/landing/founder-credibility.tsx');
    expect(rel).toContain('src/lib/public-media.ts');

    const offenders = rel.flatMap((file) => {
      if (ALLOWLIST[file]) return [];
      const text = readFileSync(resolve(ROOT, file), 'utf8');
      return MEDIA_URL_PATTERNS.filter(({ re }) => re.test(text)).map(({ what }) => `${file}: ${what}`);
    });
    expect(
      offenders,
      'Public media (video, posters, curated images) is built with publicMediaUrl() from ' +
        'src/lib/public-media.ts and lives in gs://claritypledge-story-images. Production CSP ' +
        "media-src allows storage.googleapis.com only, and the dev server sends no CSP, so a " +
        'wrong host passes locally and is blocked on the live site (P1385).',
    ).toEqual([]);
  });
});
