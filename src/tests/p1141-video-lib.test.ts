/**
 * @file p1141-video-lib.test.ts
 * @description DW-4 — an absent or unparseable video is treated exactly as
 * today, and the host allowlist is the enforcement point that nothing bypasses.
 *
 * The allowlist is asserted here AND enforced by a CHECK constraint on
 * stories.video_url, because the stories INSERT policy is row-scoped and
 * constrains no column's value: any authenticated, verified profile can set the
 * column to an arbitrary string through a raw REST insert. The UI not exposing
 * an input is not an enforcement boundary. This file tests the client half; the
 * database half is e2e/integration/p1141-video-schema.spec.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  parseVideoUrl,
  getEmbedUrl,
  getThumbnailUrl,
  getTimestampUrl,
  formatTimecode,
  normalizeVideoQuotes,
  EMPTY_VIDEO_QUOTES,
  YOUTUBE_PLAYER_ORIGIN,
} from '@/lib/video';

const ID = 'dQw4w9WgXcQ';

describe('p1141 parseVideoUrl — the allowlist is the enforcement point', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, 'canonical watch URL'],
    [`https://youtube.com/watch?v=${ID}`, 'no www'],
    [`https://m.youtube.com/watch?v=${ID}`, 'mobile host'],
    [`https://youtu.be/${ID}`, 'short host'],
    [`https://www.youtube.com/embed/${ID}`, 'embed path'],
    [`https://www.youtube.com/shorts/${ID}`, 'shorts path'],
    [`https://www.youtube.com/live/${ID}`, 'live path'],
  ])('accepts %s (%s)', (url) => {
    expect(parseVideoUrl(url)).toEqual({ provider: 'youtube', videoId: ID });
  });

  it('carries extra query parameters without breaking the id', () => {
    expect(parseVideoUrl(`https://www.youtube.com/watch?v=${ID}&t=42s&list=PLabc`)?.videoId).toBe(ID);
  });

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['', 'empty string'],
    ['not a url at all', 'free text'],
    [`javascript:alert(1)//youtube.com/watch?v=${ID}`, 'javascript scheme'],
    [`data:text/html,<script>//youtube.com/watch?v=${ID}`, 'data scheme'],
    [`https://evil.com/watch?v=${ID}`, 'off-allowlist host'],
    [`https://youtube.com.evil.com/watch?v=${ID}`, 'suffix-confusable host'],
    [`https://notyoutube.com/watch?v=${ID}`, 'prefix-confusable host'],
    ['https://www.youtube.com/watch?v=short', 'malformed id'],
    ['https://www.youtube.com/watch', 'no id at all'],
    ['https://www.youtube.com/', 'bare host'],
    [`https://www.youtube.com/watch?v=${ID}x`, 'over-long id'],
  ])('rejects %s (%s) — and rejection is indistinguishable from absence', (url) => {
    expect(parseVideoUrl(url as string | null)).toBeNull();
    // DW-4: every downstream derivation must agree, or a surface could render
    // half a video — the state that reads as a bug rather than as no video.
    expect(getEmbedUrl(url as string | null)).toBeNull();
    expect(getThumbnailUrl(url as string | null)).toBeNull();
    expect(getTimestampUrl(url as string | null, 30)).toBeNull();
  });

  it('an uppercase host is still on the allowlist', () => {
    expect(parseVideoUrl(`https://WWW.YOUTUBE.COM/watch?v=${ID}`)?.videoId).toBe(ID);
  });
});

describe('p1141 derivations — everything comes from the one stored field', () => {
  const url = `https://www.youtube.com/watch?v=${ID}`;

  it('the embed URL is on the player origin and enables the JS API', () => {
    const embed = getEmbedUrl(url) as string;
    expect(embed.startsWith(`${YOUTUBE_PLAYER_ORIGIN}/embed/${ID}`)).toBe(true);
    expect(embed).toContain('enablejsapi=1');
  });

  it('the thumbnail is derived from the same id, so it cannot drift from the video', () => {
    expect(getThumbnailUrl(url)).toContain(`/vi/${ID}/`);
    expect(getThumbnailUrl(`https://youtu.be/${ID}`)).toBe(getThumbnailUrl(url));
  });

  it('the timestamp URL opens the source at the right second', () => {
    expect(getTimestampUrl(url, 125)).toBe(`https://www.youtube.com/watch?v=${ID}&t=125s`);
  });

  it('a non-finite or negative second clamps to 0 rather than emitting a broken link', () => {
    expect(getTimestampUrl(url, -5)).toContain('t=0s');
    expect(getTimestampUrl(url, Number.NaN)).toContain('t=0s');
  });

  it('a fractional second floors — a timecode is a whole second', () => {
    expect(getTimestampUrl(url, 90.7)).toContain('t=90s');
  });
});

describe('p1141 formatTimecode — the UI Contract format', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [65, '1:05'],
    [600, '10:00'],
    [3661, '61:01'],
  ])('%i → %s', (seconds, expected) => {
    expect(formatTimecode(seconds)).toBe(expected);
  });

  it('never emits NaN for a broken input', () => {
    expect(formatTimecode(Number.NaN)).toBe('0:00');
    expect(formatTimecode(-30)).toBe('0:00');
  });
});

describe('p1141 normalizeVideoQuotes — a missing key reads as no video', () => {
  it('null, undefined and junk all become the empty shape', () => {
    expect(normalizeVideoQuotes(null)).toEqual(EMPTY_VIDEO_QUOTES);
    expect(normalizeVideoQuotes(undefined)).toEqual(EMPTY_VIDEO_QUOTES);
    expect(normalizeVideoQuotes('nonsense')).toEqual(EMPTY_VIDEO_QUOTES);
    expect(normalizeVideoQuotes({})).toEqual(EMPTY_VIDEO_QUOTES);
  });

  it('drops malformed quote entries rather than rendering a timecode of NaN', () => {
    const result = normalizeVideoQuotes({
      quotes: [
        { text: 'good', seconds: 12 },
        { text: 'no seconds' },
        { seconds: 5 },
        null,
        { text: 'bad seconds', seconds: 'x' },
      ],
      durationSeconds: 300,
    });
    expect(result.quotes).toEqual([{ text: 'good', seconds: 12 }]);
    expect(result.durationSeconds).toBe(300);
  });

  it('a non-numeric duration becomes null, not a rendered garbage badge', () => {
    expect(normalizeVideoQuotes({ quotes: [], durationSeconds: 'ten' }).durationSeconds).toBeNull();
  });
});
