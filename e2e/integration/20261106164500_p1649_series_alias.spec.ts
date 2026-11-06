/**
 * @file 20261106164500_p1649_series_alias.spec.ts
 * @description P270 canary for 20261106164500_p1649_series_alias_resolution.sql.
 *
 * Through the real REST API with the PUBLIC key: an alias key reaches a hidden event's slug and nothing
 * else; the alias table is closed; non-keys return null; the P1603 boundary on `events` is unchanged.
 * Precedence, grace window and ties are covered in scripts/test-p1649-series-alias.sql (rolled back).
 * The fixture uses its own alias key and series value, so real test-DB events cannot interfere.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';

const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tag = `${Math.random().toString(36).slice(2, 10)}`;
const ALIAS = `zz-e2e-${tag}`;
const SERIES = `zz-e2e-series-${tag}`;
const SLUG = `zz-e2e-hidden-${tag}`;
let eventId: string | undefined;

test.describe('P1649 resolve_series_alias', () => {
  test.beforeAll(async () => {
    const a = await supabaseAdmin.from('series_aliases').insert({ key: ALIAS, series_slug: SERIES });
    expect(a.error).toBeNull();
    const e = await supabaseAdmin
      .from('events')
      .insert({
        slug: SLUG,
        title: `P1649 e2e hidden ${tag}`,
        description: 'p1649 fixture',
        location: 'test',
        datetime: new Date(Date.now() + 3 * 86400_000).toISOString(),
        status: 'upcoming',
        is_hidden: true,
        series_slug: SERIES,
      })
      .select('id')
      .single();
    expect(e.error).toBeNull();
    eventId = e.data!.id;
  });

  test.afterAll(async () => {
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId);
    await supabaseAdmin.from('series_aliases').delete().eq('key', ALIAS);
  });

  test('the public key reaches a hidden event by alias key, as a bare slug', async () => {
    const { data, error } = await anon.rpc('resolve_series_alias', { p_key: ALIAS });
    expect(error).toBeNull();
    expect(data).toBe(SLUG);
  });

  test('control: unknown, empty and wildcard keys return null', async () => {
    for (const k of [`${ALIAS}-nope`, '', '%', 'zz-e2e-%']) {
      const { data, error } = await anon.rpc('resolve_series_alias', { p_key: k });
      expect(error, k).toBeNull();
      expect(data, k).toBeNull();
    }
  });

  test('P1603 boundary unchanged: the hidden row is not selectable with the public key', async () => {
    const { data, error } = await anon.from('events').select('slug').eq('slug', SLUG);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('the alias table is closed to the public key', async () => {
    const read = await anon.from('series_aliases').select('*');
    expect(read.error?.code).toBe('42501');
    const write = await anon.from('series_aliases').insert({ key: `zz-e2e-evil-${tag}`, title_pattern: '%' });
    expect(write.error?.code).toBe('42501');
    const upd = await anon.from('series_aliases').update({ title_pattern: '%' }).eq('key', ALIAS);
    expect(upd.error?.code).toBe('42501');
    const del = await anon.from('series_aliases').delete().eq('key', ALIAS);
    expect(del.error?.code).toBe('42501');
  });
});
