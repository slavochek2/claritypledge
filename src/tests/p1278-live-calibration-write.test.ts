/**
 * @file p1278-live-calibration-write.test.ts
 * @description P1278 — the P1150 INSERT policy on `story_verifications` admitted only the
 * letter-screening shape, so every `/live` calibration write was refused by RLS. The client
 * dropped the result of `recordVerification` on the floor and emitted `live_story_verified`
 * anyway, which is why the refusal survived two days on prod with no one noticing.
 *
 * Two halves, because the defect has two:
 *
 *  1. **The client** must stop treating a null return as success. `writeVerification` lives
 *     inside a 4k-line page component with no render harness (same situation as
 *     `letter-reading-page.tsx` in the P1177 canary), so the assertion is source-anchored on
 *     the thing that must be gone — a bare `await calibrationService.recordVerification(`
 *     whose result is discarded — rather than on the helper that must be present, which
 *     would pass vacuously if the file were skipped.
 *
 *  2. **The policy** must widen without losing a P1150 conjunct. The migration carries its
 *     own DO block, but that only runs when the migration is applied; these assertions run on
 *     every `npm test` and fail the moment a later edit deletes a binding conjunct from the
 *     live branch. The behavioural proof — the live shape observed REFUSED under P1150 B and
 *     ADMITTED after this migration, with the P1150 gap cases still refused — is
 *     `e2e/integration/p1150-story-verification-counterparty.spec.ts`, which needs a database.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LIVE_PAGE = resolve(__dirname, '../app/pages/clarity-live-page.tsx');
const MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260909093000_p1278_admit_live_calibration_insert.sql'
);

describe('P1278: the /live client no longer reports a refused calibration write as a success', () => {
  const source = readFileSync(LIVE_PAGE, 'utf8');

  it('captures the result of recordVerification instead of discarding it', () => {
    // The exact shape that shipped the bug: awaited, result dropped. Counted rather
    // than negated, because the fixed line contains the broken line as a substring.
    const awaited = source.match(/await calibrationService\.recordVerification\(/g) ?? [];
    const bound = source.match(/const written = await calibrationService\.recordVerification\(/g) ?? [];
    expect(awaited).toHaveLength(1);
    expect(bound).toHaveLength(1);
  });

  it('routes the failure through the P1177 blip gate rather than a bare console.error', () => {
    expect(source).toContain("from '@/lib/report-unless-blip'");
    expect(source).not.toContain("console.error('[P413] writeVerification failed:'");

    // Exactly one: the catch. The null-return branch deliberately does NOT report —
    // recordVerification already routed the error through logDbError, and a second
    // capture would double-report every real failure and re-report the blips that
    // logDbError drops (Codex review finding 4 on this change).
    const calls = source.match(/reportUnlessBlip\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('emits live_story_verified only after the row is known to exist', () => {
    const guard = source.indexOf('if (!written) return;');
    const event = source.indexOf("analytics.track('live_story_verified'");
    expect(guard).toBeGreaterThan(-1);
    expect(event).toBeGreaterThan(-1);
    // The early return must precede the success event, otherwise the event still
    // fires for a row that was never written.
    expect(guard).toBeLessThan(event);
  });
});

describe('P1278: the widened policy keeps every conjunct P1150 relies on', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const policy = sql.slice(sql.indexOf('CREATE POLICY "story_verifications_insert"'));
  const withCheck = policy.slice(0, policy.indexOf('-- ====='));

  it('carries the letter branch forward unchanged', () => {
    for (const conjunct of [
      'listener_id = auth.uid()',
      'speaker_id IS DISTINCT FROM auth.uid()',
      "source = 'letter'",
      'verified = false',
      'session_id IS NULL',
      'speaker_rating = 0',
      'listener_rating IS NOT NULL',
      'delivery_id IS NOT NULL',
      'public.p1150_letter_rating_admissible(story_id, speaker_id, version_id, delivery_id)',
    ]) {
      expect(withCheck).toContain(conjunct);
    }
  });

  it('binds the live branch to a session rather than to a free actor column', () => {
    expect(withCheck).toContain("source = 'live'");
    expect(withCheck).toContain('session_id IS NOT NULL');
    // Keeps a live row outside P1067's partial unique index on (delivery_id, story_id).
    expect(withCheck).toContain('delivery_id IS NULL');
    expect(withCheck).toContain(
      'public.p1278_live_verification_admissible(\n            session_id, speaker_id, listener_id, story_id, version_id)'
    );
    // A live row must be authoritative; 'verified' false is the letter-screening shape.
    expect(withCheck).toContain('verified = true');
  });

  it('forces {speaker_id, listener_id} to be exactly the session pair', () => {
    const helper = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.p1278_live_verification_admissible'),
      sql.indexOf('REVOKE ALL ON FUNCTION public.p1278_live_verification_admissible')
    );
    expect(helper).toContain('p_speaker IS DISTINCT FROM p_listener');
    expect(helper).toContain('p_speaker  IN (s.creator_profile_id, s.joiner_profile_id)');
    expect(helper).toContain('p_listener IN (s.creator_profile_id, s.joiner_profile_id)');
    // The caller must be in the room too — otherwise any reader of a public session row
    // could write ratings into it.
    expect(helper).toContain('auth.uid() IN (s.creator_profile_id, s.joiner_profile_id)');
    expect(helper).toContain('auth.uid() IS NOT NULL');
    // A guest session leaves joiner_profile_id NULL; such a row must not be admissible.
    expect(helper).toContain('s.joiner_profile_id  IS NOT NULL');
    expect(helper).toContain('s.creator_profile_id IS NOT NULL');
    // Codex review finding 1: story_verifications has a SECOND counters trigger,
    // update_story_understood_count, which moves stories.understood_count for
    // NEW.story_id. Without this the actor binding still let two participants of a
    // real session move a stranger's story counter — the P1150 class through a
    // different column.
    expect(helper).toContain('st.author_id IN (s.creator_profile_id, s.joiner_profile_id)');
    expect(helper).toContain('v.story_id = p_story');
  });

  it('keeps the live helper off anon, so the anon branch cannot be reached by accident', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.p1278_live_verification_admissible\(uuid, uuid, uuid, uuid, uuid\) FROM anon, service_role;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.p1278_live_verification_admissible\(uuid, uuid, uuid, uuid, uuid\) TO authenticated;/
    );
  });

  it('re-asserts P1150’s "exactly one INSERT policy" invariant rather than deleting it', () => {
    expect(sql).toContain(
      "WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'INSERT'"
    );
    expect(sql).toContain('IF v_insert_policies <> 1 THEN');
  });
});
