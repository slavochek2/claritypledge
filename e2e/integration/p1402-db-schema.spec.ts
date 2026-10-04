/**
 * @file p1402-db-schema.spec.ts
 * @description P1402 widened stories.video_url's CHECK constraint so a story video can be an mp4
 * in our public media bucket. Driven through a raw insert (the path any verified profile has):
 * exactly our bucket's mp4s pass, every neighbour of that shape is refused, YouTube still passes.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

const BUCKET = 'https://storage.googleapis.com/claritypledge-story-images';
const created: string[] = [];

async function seedStory(videoUrl: string) {
  const { data: author } = await supabaseAdmin.from('profiles').select('id').limit(1).single();
  const result = await supabaseAdmin
    .from('stories')
    .insert({ author_id: author?.id, content: 'P1402 schema probe', visibility: 'private', video_url: videoUrl })
    .select('id, video_url')
    .single();
  if (result.data?.id) created.push(result.data.id as string);
  return result;
}

test.afterAll(async () => {
  if (created.length) await supabaseAdmin.from('stories').delete().in('id', created);
});

test.describe('P1402 — stories.video_url accepts our bucket mp4 and nothing near it', () => {
  const ACCEPTED: Array<[string, string]> = [
    ['an mp4 in the media bucket', `${BUCKET}/event-prep/cognitive-understanding-v1.mp4`],
    ['a YouTube URL (P1141 unchanged)', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ];
  for (const [label, value] of ACCEPTED) {
    test(`accepts ${label}`, async () => {
      const { data, error } = await seedStory(value);
      expect(error).toBeNull();
      expect(data?.video_url).toBe(value);
    });
  }

  const REJECTED: Array<[string, string]> = [
    ['a path that climbs out of the bucket', `${BUCKET}/../other-bucket/x.mp4`],
    ['a percent-encoded climb', `${BUCKET}/a/%2e%2e/x.mp4`],
    ['another bucket on the same origin', 'https://storage.googleapis.com/other-bucket/x.mp4'],
    ['another host', 'https://evil.example.com/claritypledge-story-images/x.mp4'],
    ['a query string', `${BUCKET}/x.mp4?y=1`],
    ['a non-video object in the bucket', `${BUCKET}/event-prep/cognitive-understanding-v1-poster.jpg`],
    ['plain http', `http://storage.googleapis.com/claritypledge-story-images/x.mp4`],
  ];
  for (const [label, value] of REJECTED) {
    test(`rejects ${label}`, async () => {
      const { error } = await seedStory(value);
      expect(error, `${label} was ACCEPTED — the constraint is the boundary, not the client`).not.toBeNull();
      expect(error?.code).toBe('23514');
    });
  }
});
