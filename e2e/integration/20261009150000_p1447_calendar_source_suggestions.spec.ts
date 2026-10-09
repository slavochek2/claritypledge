/**
 * @file 20261009150000_p1447_calendar_source_suggestions.spec.ts
 * @description P270 canary for 20261009150000_p1447_calendar_source_suggestions.sql.
 *
 * The migration opens one anonymous WRITE path ("Suggest a source" on /cm) and must open no read.
 * So the refusals below assert the GRANT refused (permission denied / function not found), never a
 * function-body message — a body refusal would mean the role can still reach the function
 * (the P1236 half-revoke trap, docs/technical/database.md §P1065).
 *
 * The submit test is skipped, with the reason recorded, when the shared test DB already holds the
 * hourly cap of new rows — the cap is global by design (P1347 reasoning: Postgres cannot see the
 * client IP), so a burst from another run in the last hour is indistinguishable from a real refusal.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const HOURLY_CAP = 30;

const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

// The exact PostgREST wording, never the bare code: assert_admin() also raises 42501 (message
// 'not found', P1381), so matching the code alone would pass against an anon-executable admin RPC.
const TABLE_REFUSAL = /permission denied for table calendar_source_suggestions/;
const FUNCTION_REFUSAL = /permission denied for function/;

test.describe('P1447: calendar source suggestions are write-only for anonymous callers', () => {
  test('anon cannot read the table through REST', async () => {
    const { data, error } = await anon().from('calendar_source_suggestions').select('*').limit(1);
    expect(data).toBeNull();
    expect(error?.message).toMatch(TABLE_REFUSAL);
  });

  test('anon cannot call the admin list or the status setter', async () => {
    for (const [fn, args] of [
      ['admin_list_calendar_sources', {}],
      ['admin_set_calendar_source_status', { p_id: '00000000-0000-4000-8000-000000000000', p_status: 'added' }],
    ] as const) {
      const { error } = await anon().rpc(fn, args);
      expect(error?.message, fn).toMatch(FUNCTION_REFUSAL);
      // assert_admin() raising 'not found' would mean the anon grant is still live.
      expect(error?.message, fn).not.toBe('not found');
    }
  });

  test('a non-link and a javascript: URL are refused and store nothing', async () => {
    for (const p_url of ['hello', 'javascript:alert(1)', 'ftp://example.org/x']) {
      const { error } = await anon().rpc('submit_calendar_source', { p_url });
      expect(error?.message, p_url).toBe('invalid link');
    }
    const { count } = await supabaseAdmin
      .from('calendar_source_suggestions')
      .select('id', { count: 'exact', head: true })
      .in('url', ['hello', 'javascript:alert(1)', 'ftp://example.org/x']);
    expect(count).toBe(0);
  });

  test('a link is stored once, and a www / trailing-slash repeat adds no row', async () => {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from('calendar_source_suggestions')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', since);
    test.skip((recent ?? 0) >= HOURLY_CAP - 1, `test DB already holds ${recent} rows this hour (cap ${HOURLY_CAP})`);

    const slug = `p1447-canary-${Date.now()}`;
    const first = await anon().rpc('submit_calendar_source', { p_url: `https://sola.day/event/${slug}`, p_note: 'canary' });
    expect(first.error).toBeNull();
    const repeat = await anon().rpc('submit_calendar_source', { p_url: `https://www.sola.day/event/${slug}/` });
    expect(repeat.error).toBeNull();

    const { data } = await supabaseAdmin
      .from('calendar_source_suggestions')
      .select('url, note, status, submitted_by')
      .ilike('url', `%${slug}%`);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ url: `https://sola.day/event/${slug}`, note: 'canary', status: 'new', submitted_by: null });
  });
});
