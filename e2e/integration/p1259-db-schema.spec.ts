/**
 * @file p1259-db-schema.spec.ts
 * @description P1259 change 3: migration integration test — the widened description, the
 * links column, and the two ways each of them can be present in the database and still be
 * invisible to the page.
 *
 * WHY THE SCHEMA CHECK ALONE IS NOT ENOUGH HERE, and why this file has four tests rather
 * than one. `profiles` is not a normal table: P877 dropped the table-level SELECT grant and
 * re-granted column by column, and the profile page does not read the table directly at all
 * — it goes through `get_profile_by_slug` -> `get_profile_by_id`, which builds its output
 * from an explicit key list. So a column can exist, hold the right value, and still be
 * unreachable in TWO independent ways:
 *
 *   1. absent from the column GRANT   → anon reads 42501
 *   2. absent from the accessor's key list → the page sees `undefined` no matter the grant
 *
 * P877's own migration says so in a maintenance note: "a NEW profiles column is NOT readable
 * by anon/authenticated until it is added to this GRANT." A template migration test asserts
 * (1) by accident (service role bypasses grants — so it would NOT have caught it) and never
 * asserts (2). Both are asserted below through the anon key, which is what the browser uses.
 *
 * The bio widening is checked by WRITING a string longer than the old 160-char cap. Reading
 * the constraint definition would prove the constraint text changed; writing proves the cap
 * that actually rejects data moved.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** 400 chars — comfortably past P414's old 160 cap, comfortably inside P1259's 2000. */
const LONG_BIO = 'P1259 integration: a description long enough to be a description. '.repeat(6);

const SUBJECT_LINKS = [
  { url: 'https://en.wikipedia.org/wiki/Example', label: 'Wikipedia' },
  { url: 'https://example.com' },
];

test.describe('Migration p1259: profiles.bio widened + profiles.links', () => {
  test.setTimeout(90000);

  let subject: TestUser;
  let anon: ReturnType<typeof createClient>;

  test.beforeAll(async () => {
    subject = await createTestUser({ name: 'P1259-Integration-Subject' });
    anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  test.afterAll(async () => {
    if (subject) await deleteTestUser(subject.user.id);
  });

  test('bio accepts a description longer than the old 160-char cap', async () => {
    expect(LONG_BIO.length, 'the fixture must actually exceed the old cap or this proves nothing').toBeGreaterThan(160);
    expect(LONG_BIO.length).toBeLessThanOrEqual(2000);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ bio: LONG_BIO })
      .eq('id', subject.user.id);

    expect(error, `profiles_bio_length_check still rejects ${LONG_BIO.length} chars — the widen did not apply`).toBeNull();
  });

  /**
   * The negative control for the test above. Without it, a migration that dropped the CHECK
   * entirely would pass — and an unbounded public text column on a page about a real person
   * is a different problem, not a fix.
   */
  test('bio still rejects a description past the new 2000-char cap', async () => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ bio: 'x'.repeat(2001) })
      .eq('id', subject.user.id);

    expect(error, 'the widen must move the cap, not remove it').not.toBeNull();
  });

  test('links exists, defaults to an empty array, and holds a written list', async () => {
    const { data: fresh } = await supabaseAdmin
      .from('profiles')
      .select('links')
      .eq('id', subject.user.id)
      .single();
    expect(fresh?.links, 'a row that never set links must read [] — not null').toEqual([]);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ links: SUBJECT_LINKS })
      .eq('id', subject.user.id);
    expect(error).toBeNull();

    const { data: written } = await supabaseAdmin
      .from('profiles')
      .select('links')
      .eq('id', subject.user.id)
      .single();
    expect(written?.links).toEqual(SUBJECT_LINKS);
  });

  test('the array CHECK rejects a non-array value', async () => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ links: { url: 'https://example.com' } })
      .eq('id', subject.user.id);

    expect(error, 'profiles_links_is_array must reject an object').not.toBeNull();
  });

  /**
   * FAILURE MODE 1 — the column GRANT. The service-role reads above bypass column grants
   * entirely, so every assertion so far would pass with `links` unreadable by the browser.
   */
  test('anon can select links directly (the P877 column grant includes it)', async () => {
    const { data, error } = await anon.from('profiles').select('id, links').limit(1);

    expect(error, 'links is missing from the P877 column GRANT — anon gets 42501 and the row never renders').toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  /**
   * FAILURE MODE 2 — the accessor's key list. This is the path the profile page actually
   * takes, and it is independent of the grant: `get_profile_by_id` is SECURITY DEFINER, so
   * it would happily return a correct grant-blocked column, and would just as happily omit a
   * granted one. Only an explicit key check catches that.
   */
  test('get_profile_by_slug returns bio and links to an anonymous reader', async () => {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('slug')
      .eq('id', subject.user.id)
      .single();
    expect(profile?.slug, 'the fixture user needs a slug to be looked up by one').toBeTruthy();

    const { data, error } = await anon.rpc('get_profile_by_slug', { p_slug: profile!.slug });
    expect(error).toBeNull();

    const row = data as Record<string, unknown> | null;
    expect(row, 'the accessor returned nothing for a slug that exists').not.toBeNull();
    expect(
      Object.keys(row!),
      'links is absent from get_profile_by_id\'s key list — the page reads undefined regardless of the grant',
    ).toContain('links');
    expect(row!.links).toEqual(SUBJECT_LINKS);
    expect(row!.bio).toBe(LONG_BIO);
  });

  /**
   * The P877 contract this migration re-applies by hand. `CREATE OR REPLACE FUNCTION` resets
   * a function's ACL to Supabase's default, so a migration that redefines an accessor and
   * forgets the REVOKE/GRANT pair silently changes who may call it. Asserted from the anon
   * key, which is the role that must still work.
   */
  test('anon still holds EXECUTE on the redefined accessor', async () => {
    const { error } = await anon.rpc('get_profile_by_id', { p_id: subject.user.id });
    expect(error, 'the CREATE OR REPLACE dropped anon EXECUTE — every profile page would 403').toBeNull();
  });
});
