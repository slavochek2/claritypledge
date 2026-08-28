/**
 * Integration test: P1179 DW-5 — the events.links column.
 *
 * Three claims, each asserted against the LIVE test database rather than
 * against the migration file:
 *   1. the migration applied and the column exists;
 *   2. it defaults to an empty list on every pre-existing row (no NULLs anywhere);
 *   3. it holds the {tag, label?} shape and NOTHING else — a scalar, an object
 *      or a string is rejected at write time by the jsonb_typeof CHECK.
 *
 * Claim 3 is the one that matters and the one a file read cannot make: a
 * constraint that exists in the .sql and was never applied looks identical on
 * disk to one that is enforcing.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent } from '../helpers/test-event';

test.describe('P1179 DW-5 — events.links', () => {
  let hostId: string;
  let eventId: string;

  test.beforeAll(async () => {
    const { user } = await createTestUser({ email: generateTestEmail(), name: 'P1179 Host' });
    hostId = user.id;
    const event = await createTestEvent(hostId);
    eventId = event.id;
  });

  test.afterAll(async () => {
    if (eventId) await deleteTestEvent(eventId);
    if (hostId) await deleteTestUser(hostId);
  });

  test('the column exists and a freshly created row defaults to an empty list', async () => {
    const { data, error } = await supabaseAdmin
      .from('events').select('links').eq('id', eventId).single();
    expect(error).toBeNull();
    expect(data?.links).toEqual([]);
  });

  test('NO row in the table carries NULL — the default backfilled every pre-existing event', async () => {
    const { count, error } = await supabaseAdmin
      .from('events').select('id', { count: 'exact', head: true }).is('links', null);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  test('the column round-trips the {tag, label?} shape', async () => {
    const links = [{ tag: 'tonight', label: 'Tonight' }, { tag: 'cmp7' }];
    const { error: upErr } = await supabaseAdmin.from('events').update({ links }).eq('id', eventId);
    expect(upErr).toBeNull();

    const { data } = await supabaseAdmin.from('events').select('links').eq('id', eventId).single();
    expect(data?.links).toEqual(links);

    await supabaseAdmin.from('events').update({ links: [] }).eq('id', eventId);
  });

  test('a non-array value is REJECTED at write time — the CHECK is enforcing, not just declared', async () => {
    for (const bad of [{ tag: 'x' }, 'cmp7', 42, true]) {
      const { error } = await supabaseAdmin
        .from('events').update({ links: bad as never }).eq('id', eventId);
      expect(error, `expected ${JSON.stringify(bad)} to be rejected`).not.toBeNull();
    }
    const { data } = await supabaseAdmin.from('events').select('links').eq('id', eventId).single();
    expect(data?.links).toEqual([]);
  });

  test('the column is NOT NULL — an explicit null write is rejected', async () => {
    const { error } = await supabaseAdmin
      .from('events').update({ links: null as never }).eq('id', eventId);
    expect(error).not.toBeNull();
  });
});
