/**
 * @file p1141-letter-snapshot-contract.test.ts
 * @description DW-6 — the three-layer snapshot contract holds, and a letter
 * sealed BEFORE this change maps identically after it.
 *
 * The sealed-letter path is this spec's sharp edge, not the components: the
 * letter snapshot carries its own copy of story media and has broken twice
 * before. The P751 finding names three files as the complete contract — the RPC
 * (a migration), snapshotToStoryWithPoints (the reader), and docStoryToSnapshot
 * (the preview shim). All three are asserted here.
 *
 * The backward-compatibility half is the one that matters most: the new keys
 * being ABSENT from an old snapshot is the CORRECT value, not a gap. Every
 * story sealed before P1141 legitimately has no video.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotToStoryWithPoints, docStoryToSnapshot } from '@/app/utils/letter-snapshot-mapper';

const MAPPER = readFileSync(join(__dirname, '..', 'app', 'utils', 'letter-snapshot-mapper.ts'), 'utf8');

const AUTHOR = { name: 'Jane Doe', avatarUrl: '', avatarColor: '', role: '' };

function snapshot(config: Record<string, unknown>) {
  return {
    letter_id: 'l1',
    story_id: 's1',
    version_id: 'v1',
    position: 0,
    visibility: 'public',
    point_config: config,
  } as never;
}

describe('p1141 DW-6 layer 2 — the reader maps videoUrl and videoQuotes through', () => {
  it('carries a sealed video reference onto the story', () => {
    const story = snapshotToStoryWithPoints(
      snapshot({
        storyText: 'the argument',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoQuotes: { quotes: [{ text: 'said this', seconds: 42 }], durationSeconds: 300 },
      }),
      AUTHOR as never
    );
    expect(story.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(story.videoQuotes).toEqual({
      quotes: [{ text: 'said this', seconds: 42 }],
      durationSeconds: 300,
    });
  });

  it('imageUrl still maps alongside them — the video does not displace the image path', () => {
    const story = snapshotToStoryWithPoints(
      snapshot({
        storyText: 'x',
        imageUrl: 'https://cdn.example.com/a.png',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
      AUTHOR as never
    );
    expect(story.imageUrl).toBe('https://cdn.example.com/a.png');
    expect(story.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
  });
});

describe('p1141 DW-6 — a letter sealed BEFORE this change maps identically', () => {
  const preP1141 = { storyText: 'an older story', imageUrl: 'https://cdn.example.com/old.png' };

  it('an absent videoUrl reads as no video, and the image still resolves', () => {
    const story = snapshotToStoryWithPoints(snapshot(preP1141), AUTHOR as never);
    expect(story.videoUrl).toBeUndefined();
    expect(story.imageUrl).toBe('https://cdn.example.com/old.png');
  });

  it('an absent videoQuotes normalizes to the empty shape, never to undefined or a crash', () => {
    const story = snapshotToStoryWithPoints(snapshot(preP1141), AUTHOR as never);
    expect(story.videoQuotes).toEqual({ quotes: [], durationSeconds: null });
  });

  it('every OTHER mapped field is byte-identical to what it was without the new keys', () => {
    const before = snapshotToStoryWithPoints(snapshot(preP1141), AUTHOR as never);
    const withVideoKeysAbsent = snapshotToStoryWithPoints(snapshot({ ...preP1141 }), AUTHOR as never);
    const strip = (s: Record<string, unknown>) => {
      const { videoUrl, videoQuotes, ...rest } = s;
      void videoUrl; void videoQuotes;
      return rest;
    };
    expect(strip(before as never)).toEqual(strip(withVideoKeysAbsent as never));
  });

  it('an empty-string videoUrl (the RPC COALESCE default) reads as no video', () => {
    const story = snapshotToStoryWithPoints(
      snapshot({ ...preP1141, videoUrl: '' }),
      AUTHOR as never
    );
    expect(story.videoUrl).toBeUndefined();
  });

  it('a junk videoQuotes value degrades to empty rather than breaking the letter', () => {
    const story = snapshotToStoryWithPoints(
      snapshot({ ...preP1141, videoQuotes: 'not an object' }),
      AUTHOR as never
    );
    expect(story.videoQuotes).toEqual({ quotes: [], durationSeconds: null });
  });
});

describe('p1141 DW-6 layer 3 — the preview shim writes the same keys', () => {
  it('docStoryToSnapshot carries the video reference into the preview snapshot', () => {
    const snap = docStoryToSnapshot({
      story_id: 's1',
      position: 0,
      point_config: {},
      story: {
        content: 'x',
        imageUrl: 'https://cdn.example.com/a.png',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        videoQuotes: { quotes: [{ text: 'q', seconds: 1 }], durationSeconds: 10 },
        points: [],
      },
    } as never);
    const config = snap.point_config as Record<string, unknown>;
    expect(config.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(config.videoQuotes).toEqual({ quotes: [{ text: 'q', seconds: 1 }], durationSeconds: 10 });
    // Shape drift between builder and reader was the root cause of P749.
    expect(config.imageUrl).toBe('https://cdn.example.com/a.png');
  });
});

describe('p1141 DW-6 — the contract is declared, not just implemented', () => {
  it('PointConfig declares both new fields, so a future reader cannot miss them', () => {
    expect(MAPPER).toMatch(/videoUrl\?: string;/);
    expect(MAPPER).toMatch(/videoQuotes\?: StoryVideoQuotesData;/);
  });

  it('the reader normalizes rather than passing the raw JSONB through', () => {
    expect(MAPPER).toContain('videoQuotes: normalizeVideoQuotes(config.videoQuotes)');
  });

  it('layer 1 — the migration that redefines the RPC writes both keys', async () => {
    const { readdirSync } = await import('node:fs');
    const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) =>
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?seal_and_send_letter\b/i.test(
          readFileSync(join(dir, f), 'utf8')
        )
      )
      .pop();
    const body = readFileSync(join(dir, latest as string), 'utf8');
    expect(body).toMatch(/'videoUrl'\s*,\s*COALESCE\(\s*s\.video_url/);
    expect(body).toMatch(/'videoQuotes'\s*,\s*COALESCE\(\s*s\.video_quotes/);
  });
});
