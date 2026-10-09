/**
 * @file p1447-calendar-source-admin.test.ts
 * @description P1447: the founder-only half of "Suggest a source", run against the live TEST
 * project — the list and status RPCs as a signed-in non-admin (refused by assert_admin) and as an
 * admin (list, set added, set back to new, unknown id). Rows are seeded through the service role so
 * the hourly cap on anonymous submissions never decides the outcome.
 *
 * Borrows TEST's single admin slot the same way p1381-admin-list-users.test.ts does
 * (`unique_admin`, P878) and hands it back in afterAll.
 *
 *   npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

async function signedIn(user: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

describe('P1447: calendar source suggestions — founder-only list and review', () => {
  let plain: TestUser;
  let admin: TestUser;
  let originalAdminId: string | null = null;
  let rowId: string;
  const slug = `p1447-admin-${Date.now()}`;

  beforeAll(async () => {
    plain = await createTestUser({ name: 'P1447 Plain' });
    admin = await createTestUser({ name: 'P1447 Admin' });
    const { data } = await supabaseAdmin.from('profiles').select('id').eq('is_admin', true).maybeSingle();
    originalAdminId = data?.id ?? null;
    if (originalAdminId) await supabaseAdmin.from('profiles').update({ is_admin: false }).eq('id', originalAdminId);
    const { error: e1 } = await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', admin.user.id);
    if (e1) throw e1;

    const { data: row, error } = await supabaseAdmin
      .from('calendar_source_suggestions')
      .insert({ url: `https://sola.day/event/${slug}`, url_key: `sola.day/event/${slug}`, note: 'admin test' })
      .select('id')
      .single();
    if (error) throw error;
    rowId = row.id;
  });

  afterAll(async () => {
    await supabaseAdmin.from('calendar_source_suggestions').delete().eq('id', rowId);
    await supabaseAdmin.from('profiles').update({ is_admin: false }).eq('id', admin.user.id);
    if (originalAdminId) {
      const { error } = await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', originalAdminId);
      if (error) throw new Error(`P1447 test FAILED TO RESTORE the test-DB admin ${originalAdminId}: ${error.message}`);
    }
    await deleteTestUser(admin.user.id);
    await deleteTestUser(plain.user.id);
  });

  it('a signed-in non-admin is refused by assert_admin on both functions', async () => {
    const c = await signedIn(plain);
    const list = await c.rpc('admin_list_calendar_sources');
    expect(list.data).toBeNull();
    expect(list.error?.message).toBe('not found');
    const set = await c.rpc('admin_set_calendar_source_status', { p_id: rowId, p_status: 'added' });
    expect(set.error?.message).toBe('not found');
    const { data } = await supabaseAdmin.from('calendar_source_suggestions').select('status').eq('id', rowId).single();
    expect(data?.status).toBe('new');
  });

  it('an admin lists the suggestion and moves it to added and back to new', async () => {
    const c = await signedIn(admin);
    const list = await c.rpc('admin_list_calendar_sources');
    expect(list.error).toBeNull();
    const mine = (list.data as Array<{ id: string; url: string; note: string; status: string }>).find((r) => r.id === rowId);
    expect(mine).toMatchObject({ url: `https://sola.day/event/${slug}`, note: 'admin test', status: 'new' });

    expect((await c.rpc('admin_set_calendar_source_status', { p_id: rowId, p_status: 'added' })).error).toBeNull();
    let { data } = await supabaseAdmin.from('calendar_source_suggestions').select('status, reviewed_at').eq('id', rowId).single();
    expect(data?.status).toBe('added');
    expect(data?.reviewed_at).not.toBeNull();

    expect((await c.rpc('admin_set_calendar_source_status', { p_id: rowId, p_status: 'new' })).error).toBeNull();
    ({ data } = await supabaseAdmin.from('calendar_source_suggestions').select('status, reviewed_at').eq('id', rowId).single());
    expect(data).toMatchObject({ status: 'new', reviewed_at: null });
  });

  it('an admin gets clear refusals for an unknown status and an unknown id', async () => {
    const c = await signedIn(admin);
    expect((await c.rpc('admin_set_calendar_source_status', { p_id: rowId, p_status: 'maybe' })).error?.message).toBe('invalid status');
    expect(
      (await c.rpc('admin_set_calendar_source_status', { p_id: '00000000-0000-4000-8000-000000000000', p_status: 'added' })).error?.message,
    ).toBe('not found');
  });
});
