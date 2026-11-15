/**
 * P1685 — the Listening Game: minute estimate, recipe switch, video address, unchanged step lists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicMediaUrl } from '@/lib/public-media';
import { CLIP_SECONDS, PLAYBACK_RATE, stepMinutes, stepSeconds, watchSeconds, ALL_STEPS, PART_VERSIONS } from '@/app/prototypes/events/prep/prep-plan';
import { CLARITY_NIGHT_RECIPE, SOCIAL_HIKE_RECIPE } from '@/app/prototypes/events/series-recipes';
import { listeningGamePosterUrl, listeningGameVideoUrl, LISTENING_GAME_COPY } from '@/app/prototypes/events/prep/listening-game';
import { STANDALONE_STEPS } from '@/app/prototypes/events/prep/PreparePage';

const cards = { cmp7: 0, stake: 0 };

describe('P1685 minute estimate', () => {
  it('the clip is 89.7 s at the playback rate', () => {
    expect(CLIP_SECONDS.listeningGame).toBe(89.7);
    expect(watchSeconds('listeningGame')).toBe(Math.round(89.7 / PLAYBACK_RATE));
  });
  it('the principle step counts the clip only with the flag AND the intro', () => {
    const base = stepSeconds('principle', cards, true);
    expect(stepSeconds('principle', cards, true, true)).toBe(base + watchSeconds('listeningGame'));
    expect(stepSeconds('principle', cards, false, true)).toBe(stepSeconds('principle', cards, false));
    expect(stepSeconds('principle', cards, true, false)).toBe(base);
  });
  it('existing call signatures keep working and other steps ignore the flag', () => {
    expect(stepMinutes('principle', cards, true)).toBe(Math.max(1, Math.round(stepSeconds('principle', cards, true) / 60)));
    expect(stepSeconds('story', cards, true, true)).toBe(stepSeconds('story', cards, true));
  });
  it('the clip adds exactly its watch time to the rounded minutes (2 min becomes 3)', () => {
    const base = stepSeconds('principle', cards, true);
    expect(stepMinutes('principle', cards, true)).toBe(Math.round(base / 60));
    expect(stepMinutes('principle', cards, true, true)).toBe(Math.round((base + watchSeconds('listeningGame')) / 60));
    expect(stepMinutes('principle', cards, true, true)).toBeGreaterThan(stepMinutes('principle', cards, true));
  });
});

describe('P1685 switch and non-goals', () => {
  it('both recipes default on', () => {
    expect(CLARITY_NIGHT_RECIPE.prepare.listeningGame).toBe(true);
    expect(SOCIAL_HIKE_RECIPE.prepare.listeningGame).toBe(true);
  });
  it('step lists and part versions are unchanged (no new part, no new step)', () => {
    expect([...ALL_STEPS]).toEqual(['welcome', 'story', 'principle', 'cmp7', 'stake', 'research']);
    expect([...STANDALONE_STEPS]).toEqual(['story', 'principle', 'cmp7', 'misunderstanding']);
    expect(Object.keys(PART_VERSIONS).sort()).toEqual(['cmp7', 'cognitive_video', 'intro_video', 'principle_intro']);
  });
  it('the copy is the draft: heading and four rules', () => {
    expect(LISTENING_GAME_COPY.heading).toBe('The Listening Game: how to use this in a real conversation');
    expect(LISTENING_GAME_COPY.rules).toHaveLength(4);
  });
  afterEach(() => vi.unstubAllEnvs());
  it('the production branch is the media bucket URL, never a local path', () => {
    vi.stubEnv('DEV', false);
    expect(listeningGameVideoUrl()).toBe(publicMediaUrl('event-prep/listening-game-v4.mp4'));
    expect(listeningGamePosterUrl()).toBe(publicMediaUrl('event-prep/listening-game-v4-poster.jpg'));
    expect(listeningGameVideoUrl()).not.toContain('local-media');
  });
  it('the video address: local in dev, the media bucket otherwise; the poster sits next to it', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(listeningGameVideoUrl()).toBe('/local-media/event-prep/listening-game-v4.mp4');
    expect(listeningGamePosterUrl()).toBe('/local-media/event-prep/listening-game-v4-poster.jpg');
  });
});
