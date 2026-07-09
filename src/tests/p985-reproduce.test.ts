/**
 * @file p985-reproduce.test.ts
 *
 * P985 canary: a non-ASCII (e.g. Chinese) name must not produce an empty slug.
 *
 * Bug: generateSlug() (api.ts:630) strips characters via `.replace(/[^\w\s-]/g,'')`.
 * In JS `\w` is ASCII-only ([A-Za-z0-9_]) — the `u` flag does not extend it — so a
 * pure-non-ASCII name loses every character → "". AuthCallbackPage:233 then persists
 * slug="" (it inlines slug logic without the empty-guard that ensureUniqueSlug has).
 * Profile links `/p/${slug}` become `/p/`, which does not match the `/p/:id` route.
 *
 * These tests assert the DESIRED (post-fix) contract at the user-visible symptom level:
 *   - non-ASCII name → non-empty slug, no leading/trailing hyphen
 *   - ASCII behavior unchanged
 *   - the AuthCallback resolve path (mirrored) never yields an empty persisted slug
 *
 * The bug-demonstrating cases are guarded with `it.fails` so the suite stays GREEN
 * while the bug is open. When the fix lands, each `it.fails` flips RED (the body now
 * passes) — that is /fix's signal to remove `.fails` and lock in corrected behavior.
 *
 * Before fix: generateSlug("李明") === "" ; generateSlug("王小明 Wang") === "-wang".
 * After fix:  both yield a usable, non-empty, hyphen-clean slug.
 */

import { describe, it, expect } from 'vitest';
import { generateSlug } from '@/app/data/api';

/**
 * Mirrors AuthCallbackPage:231-234 (first-upsert slug resolution).
 * Update alongside the source fix — both must agree.
 */
function resolveProfileSlug(existingSlug: string | null, name: string): string {
  let slug: string | null = existingSlug || null;
  if (!slug) {
    slug = generateSlug(name);
  }
  return slug ?? '';
}

describe('p985: non-ASCII names must not produce an empty slug', () => {
  it('ASCII names still slugify as before (no regression)', () => {
    expect(generateSlug('John Doe')).toBe('john-doe');
    expect(generateSlug('Jane Doe')).toBe('jane-doe');
  });

  it.fails('a pure-Chinese name produces a non-empty slug', () => {
    const slug = generateSlug('李明');
    expect(slug.length).toBeGreaterThan(0);
  });

  it.fails('a mixed Chinese+Latin name has no leading or trailing hyphen', () => {
    const slug = generateSlug('王小明 Wang');
    expect(slug.length).toBeGreaterThan(0);
    expect(slug.startsWith('-')).toBe(false);
    expect(slug.endsWith('-')).toBe(false);
  });

  it.fails('the persisted slug for a non-ASCII-named signup is never empty', () => {
    // Google signup, no existing slug, full_name is entirely non-ASCII.
    const persisted = resolveProfileSlug(null, '李明');
    expect(persisted).not.toBe('');
    expect(persisted.length).toBeGreaterThan(0);
  });
});
