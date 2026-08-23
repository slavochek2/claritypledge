/**
 * @file p1141-video-schema.spec.ts
 * @description The database half of P1141's enforcement, under a real database.
 *
 * The client-side allowlist in src/lib/video.ts is NOT a boundary: the stories
 * INSERT policy is row-scoped and constrains no column's VALUE, so any
 * authenticated, verified profile can set video_url to an arbitrary string
 * through a raw REST insert. The UI not exposing an input is not enforcement
 * either. This file drives that raw path and asserts the CHECK constraint
 * refuses it — which is why the constraint is required regardless of whether a
 * machine or a person sets the value.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

const ID = 'dQw4w9WgXcQ';
const GOOD = `https://www.youtube.com/watch?v=${ID}`;

const created: string[] = [];

async function seedStory(videoUrl: string | null, extra: Record<string, unknown> = {}) {
  const { data: author } = await supabaseAdmin.from('profiles').select('id').limit(1).single();

  const result = await supabaseAdmin
    .from('stories')
    .insert({
      author_id: author?.id,
      content: 'P1141 schema probe',
      visibility: 'private',
      video_url: videoUrl,
      ...extra,
    })
    .select('id, video_url, video_quotes, image_url')
    .single();

  if (result.data?.id) created.push(result.data.id as string);
  return result;
}

test.afterAll(async () => {
  if (created.length) {
    await supabaseAdmin.from('stories').delete().in('id', created);
  }
});

test.describe('P1141 — stories.video_url / video_quotes under a real database', () => {
  test('the columns exist and are reachable through the schema cache', async () => {
    const { error } = await supabaseAdmin.from('stories').select('video_url, video_quotes').limit(1);
    expect(
      error,
      'video_url / video_quotes not in the schema cache — the migration is not applied'
    ).toBeNull();
  });

  test('an allowlisted host is accepted through a raw insert', async () => {
    const { data, error } = await seedStory(GOOD);
    expect(error).toBeNull();
    expect(data?.video_url).toBe(GOOD);
  });

  test('video_quotes defaults to the empty shape, never to null', async () => {
    const { data, error } = await seedStory(GOOD);
    expect(error).toBeNull();
    // A null default would force every reader to guard against a third state.
    expect(data?.video_quotes).toEqual({ quotes: [], durationSeconds: null });
  });

  test('a NULL video_url is allowed — a story with no video is the ordinary case', async () => {
    const { data, error } = await seedStory(null);
    expect(error).toBeNull();
    expect(data?.video_url).toBeNull();
  });

  const REJECTED: Array<[string, string]> = [
    ['a non-allowlisted host', `https://evil.com/watch?v=${ID}`],
    ['a suffix-confusable host', `https://youtube.com.evil.com/watch?v=${ID}`],
    ['a javascript: scheme', 'javascript:alert(1)'],
    ['a plain http scheme', `http://www.youtube.com/watch?v=${ID}`],
    ['free text', 'just some words'],
    ['a channel URL', 'https://www.youtube.com/@somechannel'],
    ['a malformed video id', 'https://www.youtube.com/watch?v=short'],
  ];

  for (const [label, value] of REJECTED) {
    test(`the CHECK constraint rejects ${label} through a raw REST insert`, async () => {
      const { error } = await seedStory(value);
      expect(
        error,
        `${label} was ACCEPTED. The client allowlist is not a boundary — a raw REST insert ` +
          `bypasses it entirely, which is exactly what this constraint exists to stop.`
      ).not.toBeNull();
      expect(error?.message ?? '').toMatch(
        /stories_video_url_allowlisted_host|violates check constraint/i
      );
    });
  }

  test('image_url still writes alongside the video columns', async () => {
    const { data, error } = await seedStory(GOOD, { image_url: 'https://cdn.example.com/a.png' });
    expect(error).toBeNull();
    expect(data?.image_url).toBe('https://cdn.example.com/a.png');
    expect(data?.video_url).toBe(GOOD);
  });

  test('the applied seal RPC writes videoUrl, videoQuotes AND imageUrl together', async () => {
    // The migration text below is what migrate.sh actually applied above.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    const latest = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) =>
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?seal_and_send_letter\b/i.test(
          fs.readFileSync(path.join(dir, f), 'utf8')
        )
      )
      .pop() as string;
    const body = fs.readFileSync(path.join(dir, latest), 'utf8');
    expect(body).toMatch(/'videoUrl'\s*,\s*COALESCE\(\s*s\.video_url/);
    expect(body).toMatch(/'videoQuotes'\s*,\s*COALESCE\(\s*s\.video_quotes/);
    // Dropping imageUrl while adding the video keys is the P751/P819 regression
    // for a third time, not a new bug.
    expect(body).toMatch(/'imageUrl'\s*,\s*COALESCE\(\s*s\.image_url/);
  });
});
