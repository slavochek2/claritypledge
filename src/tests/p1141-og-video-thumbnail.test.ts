/**
 * @file p1141-og-video-thumbnail.test.ts
 * @description DW-5 — the crawler card derives the thumbnail from the video and
 * falls back to banner_url when absent.
 *
 * api/og.ts never rasterizes: it points a meta tag at an existing URL. So the
 * derivation must use the same pure parser the app uses, or a crawler card can
 * show a still that has drifted from the video the story actually carries.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getThumbnailUrl } from '@/lib/video';

const OG = readFileSync(join(__dirname, '..', '..', 'api', 'og.ts'), 'utf8');

describe('p1141 DW-5 — the crawler card', () => {
  it('STORY_COLUMNS selects video_url, or the derivation has nothing to read', () => {
    const columns = /const STORY_COLUMNS = \[[^\]]*\]/.exec(OG)?.[0] ?? '';
    expect(columns).toContain("'video_url'");
  });

  it('ogForStory derives the image from the video before falling back to banner_url', () => {
    expect(OG).toContain(
      "image: getThumbnailUrl(row.video_url as string | null) || (row.banner_url as string) || DEFAULT_IMAGE,"
    );
  });

  it('uses the app\'s own parser rather than a second, drift-prone copy', () => {
    // The MODULE is what this asserts — that og.ts reads the app's own parser and
    // does not carry a second copy. The specifier's file EXTENSION is not part of
    // that claim, and pinning it here is what made P1201 unfixable without editing
    // this line: Vercel emits api/*.ts specifiers verbatim into an ESM function, so
    // the extensionless form 500s the deployed handler at module load. The
    // extension is now owned by src/tests/p1201-api-esm-imports.test.ts.
    expect(OG).toMatch(/import \{ getThumbnailUrl \} from '\.\.\/src\/lib\/video(\.js)?';/);
    // A hand-rolled id regex inside og.ts would be exactly the second place that
    // could disagree with the first.
    expect(OG).not.toMatch(/i\.ytimg\.com/);
  });

  it('the other card types keep their banner_url behaviour, untouched', () => {
    const plain = OG.match(/image: \(row\.banner_url as string\) \|\| DEFAULT_IMAGE,/g) ?? [];
    expect(plain.length).toBeGreaterThanOrEqual(2); // event + point
  });

  it('the derivation itself resolves a real thumbnail for a real watch URL', () => {
    expect(getThumbnailUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    );
  });

  it('falls back rather than emitting a broken image URL for an off-allowlist value', () => {
    expect(getThumbnailUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('no image is composited server-side — og.ts only ever points at a URL', () => {
    // A play overlay on the raw OG image would need rasterization. There is
    // none, and that is an industry-wide limit of static meta-tag cards
    // (Slack/Twitter/Discord unfurls never show one), not a deviation from the
    // UI Contract, which describes surfaces this app renders directly.
    expect(OG).not.toMatch(/@vercel\/og|ImageResponse|createCanvas|satori/);
  });
});
