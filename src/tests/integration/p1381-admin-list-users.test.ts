/**
 * @file p1381-admin-list-users.test.ts
 * @description P1381: the admin gate on `admin_list_users`, run against the live TEST project.
 *
 * The repo is public, so nothing here relies on the client being honest. Each test
 * signs in as a real user over the anon key, exactly as an attacker who has read
 * the source would, and asserts what the DATABASE does:
 *   - anon and a signed-in non-admin get an error and zero rows;
 *   - an admin gets the list, including email + last login;
 *   - no client-callable write path lets a non-admin set `is_admin` on itself.
 *
 *   npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

function freshClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn(user: TestUser): Promise<SupabaseClient> {
  const c = freshClient();
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

async function readIsAdmin(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', id).single();
  if (error) throw error;
  return data.is_admin;
}

describe('P1381: admin_list_users is gated in the database', () => {
  let plain: TestUser;
  let admin: TestUser;
  // `unique_admin` (P878) allows ONE admin row. TEST already has one (the founder's test
  // account), so the admin-path test borrows the slot and afterAll hands it back.
  let originalAdminId: string | null = null;

  beforeAll(async () => {
    plain = await createTestUser({ name: 'P1381 Plain' });
    admin = await createTestUser({ name: 'P1381 Admin' });
    const { data } = await supabaseAdmin.from('profiles').select('id').eq('is_admin', true).maybeSingle();
    originalAdminId = data?.id ?? null;
  });

  afterAll(async () => {
    await supabaseAdmin.from('profiles').update({ is_admin: false }).eq('id', admin.user.id);
    if (originalAdminId) {
      const { error } = await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', originalAdminId);
      if (error) throw new Error(`P1381 test FAILED TO RESTORE the test-DB admin ${originalAdminId}: ${error.message}`);
    }
    await deleteTestUser(admin.user.id);
    await deleteTestUser(plain.user.id);
  });

  it('the database allows only one admin', async () => {
    if (!originalAdminId) return;
    const { error } = await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', admin.user.id);
    expect(error?.code).toBe('23505');
  });

  it('anon gets an error and no rows', async () => {
    const { data, error } = await freshClient().rpc('admin_list_users');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('a signed-in non-admin gets an error and no rows', async () => {
    const c = await signedIn(plain);
    const { data, error } = await c.rpc('admin_list_users');
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('assert_admin is not callable by clients at all', async () => {
    const c = await signedIn(admin);
    const { error } = await c.rpc('assert_admin');
    expect(error?.code).toBe('42501');
  });

  it('an admin gets every user with email and last login', async () => {
    // Service role only: no client path can do this (asserted below).
    if (originalAdminId) await supabaseAdmin.from('profiles').update({ is_admin: false }).eq('id', originalAdminId);
    const { error: grantError } = await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', admin.user.id);
    if (grantError) throw grantError;

    const c = await signedIn(admin);
    const { data, error } = await c.rpc('admin_list_users');
    expect(error).toBeNull();
    const row = (data as Array<Record<string, unknown>>).find((r) => r.id === plain.user.id);
    expect(row).toBeDefined();
    expect(row!.email).toBe(plain.email);
    expect(row).toHaveProperty('last_sign_in_at');
    expect(row).not.toHaveProperty('is_admin');
  });

  it('email comes from auth.users, so a spoofed profiles.email never shows', async () => {
    const p = await signedIn(plain);
    await p.rpc('upsert_my_profile', { p_data: { id: plain.user.id, name: plain.name, slug: plain.slug, email: 'spoofed-founder@example.com' } });
    const c = await signedIn(admin);
    const { data } = await c.rpc('admin_list_users');
    const rows = data as Array<{ id: string; email: string }>;
    expect(rows.find((r) => r.id === plain.user.id)!.email).toBe(plain.email);
    expect(rows.some((r) => r.email === 'spoofed-founder@example.com')).toBe(false);
  });

  it('paging past the 1000-row cap returns every user exactly once', async () => {
    const c = await signedIn(admin);
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await c.rpc('admin_list_users').range(from, from + 999);
      expect(error).toBeNull();
      const page = data as Array<{ id: string }>;
      ids.push(...page.map((r) => r.id));
      if (page.length < 1000) break;
    }
    // TEST holds far more than one page, so this exercises the boundary for real.
    expect(ids.length).toBeGreaterThan(1000);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no client write path lets a non-admin grant itself is_admin', async () => {
    const c = await signedIn(plain);
    const id = plain.user.id;

    // Every client-callable SECURITY DEFINER writer of profiles (enumerated from pg_proc on
    // test, 2026-10-01). Only upsert_my_profile takes a free-form payload; the rest are
    // called anyway so a future signature change that adds one is caught here.
    await c.rpc('upsert_my_profile', { p_data: { id, name: plain.name, slug: plain.slug, email: plain.email, is_admin: true } });
    await c.rpc('set_my_pledge', { p_pledged: true });
    await c.rpc('mark_self_verified');
    await c.rpc('update_profile_ears_count');
    // Direct table writes over PostgREST (guard_profile_trust_columns).
    await c.from('profiles').update({ is_admin: true }).eq('id', id);
    await c.from('profiles').upsert({ id, slug: plain.slug, is_admin: true });

    expect(await readIsAdmin(id)).toBe(false);
    const { error } = await c.rpc('admin_list_users');
    expect(error?.code).toBe('42501');
  });
});
