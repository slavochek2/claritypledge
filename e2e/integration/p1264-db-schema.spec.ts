/**
 * INTEGRATION TEST: P1264 — organization.event_footer_note
 *
 * Additive and nullable, so there is no default to assert. What matters is the
 * P160 class of bug (code referencing a column the schema cache lacks) and the
 * property the column's comment promises: nullable, so an org without a note
 * reads as "no note" rather than erroring.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

const TABLE = 'organization';
const COLUMN = 'event_footer_note';

test.describe('Migration: P1264 — organization.event_footer_note', () => {
  test('column exists in the organization schema', async () => {
    const { error } = await supabaseAdmin.from(TABLE).select(COLUMN).limit(1);

    expect(
      error,
      `Migration not applied: "${COLUMN}" missing from "${TABLE}". Run: ./scripts/migrate.sh`,
    ).toBeNull();
  });

  test('the column is nullable — an org without a note reads as null', async () => {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select(`id, ${COLUMN}`)
      .is(COLUMN, null)
      .limit(1);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    if (data && data.length > 0) {
      expect(data[0][COLUMN]).toBeNull();
    }
  });

  test('the note is readable by an anonymous visitor', async () => {
    // The note renders on a public event page, so an unauthenticated read must
    // return it. If organization's RLS ever tightens, this fails here rather than
    // silently blanking the block for logged-out visitors.
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
    );

    // Pin to a PUBLIC org and assert a row actually comes back. Without both, this
    // proves only "the query did not error" — and RLS filters rather than errors,
    // so it would pass just as happily with the policy broken and zero rows
    // returned, or against a database holding no public org at all.
    const { data, error } = await anon
      .from(TABLE)
      .select(`id, visibility, ${COLUMN}`)
      .eq('visibility', 'public')
      .limit(1);

    expect(error, 'anonymous read of the org footer note must not error').toBeNull();
    expect(
      data?.length,
      'no public organization returned to an anonymous reader — either RLS regressed or the fixture has no public org, and this test cannot tell the difference without a row',
    ).toBeGreaterThan(0);
  });
});
