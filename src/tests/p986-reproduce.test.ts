/**
 * @file p986-reproduce.test.ts
 * Canary for P986: generateSlug() in events-service-real.ts drops non-ASCII
 * (e.g. Chinese) titles entirely, producing a title-less slug.
 */

import { describe, it, expect } from 'vitest';
import { generateSlug } from '../app/data/events-service-real';

describe('P986: generateSlug non-ASCII title', () => {
  it('produces a readable, romanized title portion for a fully non-Latin title', async () => {
    const slug = await generateSlug('这是一个活动');
    const titlePortion = slug.split(/-\d{4}-\d{2}-\d{2}-/)[0];
    expect(titlePortion).not.toBe('');
    expect(titlePortion).toBe('zhe-shi-yi-ge-huo-dong');
    expect(slug.startsWith('-')).toBe(false);
  });

  it('leaves ASCII titles unchanged (no regression)', async () => {
    const slug = await generateSlug('Community Meetup');
    expect(slug.startsWith('community-meetup-')).toBe(true);
  });
});
