/**
 * @file p985-reproduce.test.ts
 *
 * P985 canary: a non-ASCII (e.g. Chinese) name must not produce an empty slug, and the
 * persisted profile slug must be a clean, romanized, non-empty ASCII slug.
 *
 * Bug (fixed): generateSlug() stripped characters via ASCII-only `.replace(/[^\w\s-]/g,'')`.
 * In JS `\w` is ASCII-only ([A-Za-z0-9_]) — the `u` flag does not extend it — so a
 * pure-non-ASCII name lost every character → "". AuthCallbackPage then persisted slug=""
 * (it inlined slug logic without an empty-guard). Profile links `/p/${slug}` became `/p/`,
 * which does not match the `/p/:id` route → the profile was unreachable.
 *
 * Fix (two layers):
 *   1. slugifyName() — persistence-grade romanizer (lazy-imports `transliteration`):
 *      李明 → "li-ming", José García → "jose-garcia", Анна → "anna". AuthCallback uses it,
 *      falling back to `user-<ts>` when a name has no romanizable characters (all-emoji).
 *   2. generateSlug() (sync, dependency-free) — Unicode-aware fallback for display paths;
 *      never returns "" for a name with letters/numbers in any script.
 *
 * History: filed with the bug-demonstrating cases under `it.fails` (green while the bug
 * was open); the fix flipped them red, and `.fails` was removed to lock in behavior.
 */

import { describe, it, expect } from 'vitest';
import { generateSlug, slugifyName } from '@/app/data/api';

/**
 * Mirrors AuthCallbackPage's slug resolution for a NEW signup (no existing slug).
 * Update alongside the source — both must agree.
 */
async function resolvePersistedSlug(existingSlug: string | null, name: string): Promise<string> {
  if (existingSlug) return existingSlug;
  const romanizedBase = await slugifyName(name);
  return romanizedBase || `user-${Date.now()}`;
}

describe('p985: non-ASCII names produce a clean, non-empty profile slug', () => {
  it('ASCII names are unchanged (no regression)', async () => {
    expect(await slugifyName('John Doe')).toBe('john-doe');
    expect(await slugifyName('Jane Doe')).toBe('jane-doe');
  });

  it('a Chinese name romanizes to a non-empty ASCII slug', async () => {
    expect(await slugifyName('李明')).toBe('li-ming');
  });

  it('accented Latin folds to clean ASCII (not stripped mid-character)', async () => {
    expect(await slugifyName('José García')).toBe('jose-garcia');
  });

  it('the persisted slug for a non-ASCII-named signup is never empty', async () => {
    const persisted = await resolvePersistedSlug(null, '李明');
    expect(persisted).toBe('li-ming');
    expect(persisted.length).toBeGreaterThan(0);
  });

  it('a name with no romanizable characters falls back to a non-empty user slug', async () => {
    const persisted = await resolvePersistedSlug(null, '🎉🎉');
    expect(persisted).not.toBe('');
    expect(persisted.startsWith('user-')).toBe(true);
  });

  it('generateSlug (sync display fallback) never returns "" for a non-Latin name', () => {
    expect(generateSlug('李明').length).toBeGreaterThan(0);
    expect(generateSlug('Анна').length).toBeGreaterThan(0);
  });
});
