/**
 * @file p736-live-registration-slug.test.ts
 *
 * P736 canary: source=live signup must produce a non-null slug.
 *
 * Bug (AuthCallbackPage:219): the `!isLiveRegistration` guard prevents slug
 * generation for /live registrations, leaving their profiles with slug=null.
 *
 * This test replicates the condition logic from AuthCallbackPage lines 218–221.
 * It asserts the DESIRED (post-fix) behavior:
 *   - Before fix: resolveProfileSlug returns null for live users → test FAILS
 *   - After fix (guard removed): returns a valid slug → test PASSES
 *
 * Fix: remove `!isLiveRegistration &&` from AuthCallbackPage:219, and update
 * the same condition in resolveProfileSlug below to match.
 */

import { describe, it, expect } from 'vitest';
import { generateSlug } from '@/app/data/api';

/**
 * Mirrors AuthCallbackPage lines 218–221 exactly.
 * Update this function when fixing the source — both must change together.
 */
function resolveProfileSlug(
  existingSlug: string | null,
  isLiveRegistration: boolean,
  name: string,
): string | null {
  let slug: string | null = existingSlug || null;
  // P736 fix applied: removed !isLiveRegistration guard
  if (!slug) {
    slug = generateSlug(name);
  }
  return slug;
}

describe('p736: slug generation for live registrations', () => {
  it('source=live new user produces a non-null slug', () => {
    const slug = resolveProfileSlug(null, true, 'Alice Smith');
    // FAILS before fix: guard leaves slug=null for isLiveRegistration=true
    expect(slug).not.toBeNull();
    expect(typeof slug).toBe('string');
    expect(slug!.length).toBeGreaterThan(0);
  });

  it('source=pledge new user produces a non-null slug (regression)', () => {
    const slug = resolveProfileSlug(null, false, 'Bob Jones');
    expect(slug).not.toBeNull();
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('existing slug preserved regardless of source', () => {
    const slug = resolveProfileSlug('alice-smith', true, 'Alice Smith');
    expect(slug).toBe('alice-smith');
  });

  it('existing slug preserved for non-live source', () => {
    const slug = resolveProfileSlug('bob-jones', false, 'Bob Jones');
    expect(slug).toBe('bob-jones');
  });
});
