/**
 * INTEGRATION TEST: P1264 — events.trail_url
 *
 * The migration is additive and nullable, so there is no default to assert and
 * no RLS change to probe: `trail_url` sits on `events`, whose read policy this
 * spec does not touch. What IS worth catching is the P160 class of bug — code
 * referencing a column the schema cache does not have — plus the one property
 * the column's own comment promises: that it is nullable, so every pre-existing
 * event reads as "no route link" rather than erroring or backfilling a value.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

const TABLE = 'events';
const COLUMN = 'trail_url';

test.describe('Migration: P1264 — events.trail_url', () => {
  test('column exists in the events schema', async () => {
    const { error } = await supabaseAdmin.from(TABLE).select(COLUMN).limit(1);

    expect(
      error,
      `Migration not applied: "${COLUMN}" missing from "${TABLE}". Run: ./scripts/migrate.sh`,
    ).toBeNull();
  });

  test('the column is nullable — pre-existing events read as having no route link', async () => {
    // Anything written before P1264 must come back null, not an error and not a
    // backfilled string. The migration adds no DEFAULT precisely so this holds.
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

  test('the column round-trips an https url', async () => {
    // Proves the column is writable and typed as text, not that the value is
    // safe — the http(s) guard lives at the render boundary (safeLinkHref),
    // deliberately, so a bad value renders nothing rather than being rejected
    // here. See the spec's Risks table.
    const { data: rows } = await supabaseAdmin.from(TABLE).select('id').limit(1);
    test.skip(!rows || rows.length === 0, 'no events in this environment to probe');

    const id = rows![0].id;
    const { data: before } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .eq('id', id)
      .single();

    const probe = 'https://www.alltrails.com/trail/p1264-round-trip-probe';
    const { error: writeError } = await supabaseAdmin
      .from(TABLE)
      .update({ [COLUMN]: probe })
      .eq('id', id);
    expect(writeError).toBeNull();

    const { data: after } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .eq('id', id)
      .single();
    expect(after?.[COLUMN]).toBe(probe);

    // Restore whatever was there, so the probe leaves no trace on a shared DB.
    await supabaseAdmin
      .from(TABLE)
      .update({ [COLUMN]: before?.[COLUMN] ?? null })
      .eq('id', id);
  });
});
