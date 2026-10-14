/**
 * @file p1453-banner-credit-guard.test.ts
 * @description P1453: `profiles.banner_credit` is written only by the edge functions (service
 * role). Run against the live TEST project, signed in as a real user over the anon key — the
 * repo is public, so nothing here relies on the client being honest.
 *
 *   npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

const FORGED = {
  url: 'https://example.com/forged.png', artist: 'Forger', sig: 'Forger', movement: 'x', ink: 'cream', fidelity: 'pass',
};

function freshClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn(user: TestUser): Promise<SupabaseClient> {
  const c = freshClient();
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

async function readCredit(id: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin.from('profiles').select('banner_credit').eq('id', id).single();
  if (error) throw error;
  return data.banner_credit;
}

describe('P1453: banner_credit is server-written only', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser({ name: 'P1453 Credit' });
  });

  afterAll(async () => {
    await deleteTestUser(user.user.id);
  });

  it('a signed-in user cannot set their own banner_credit by UPDATE', async () => {
    const c = await signedIn(user);
    const { error } = await c.from('profiles').update({ banner_credit: FORGED, role: 'still writes' }).eq('id', user.user.id);
    expect(error).toBeNull(); // the row update goes through …
    expect(await readCredit(user.user.id)).toBeNull(); // … with the credit pinned
    const { data } = await supabaseAdmin.from('profiles').select('role').eq('id', user.user.id).single();
    expect(data!.role).toBe('still writes');
  });

  it('a client UPDATE cannot overwrite or clear a credit the server wrote', async () => {
    const real = { ...FORGED, artist: 'Katsushika Hokusai', sig: 'Hokusai' };
    const { error: e1 } = await supabaseAdmin.from('profiles').update({ banner_credit: real }).eq('id', user.user.id);
    expect(e1).toBeNull();
    const c = await signedIn(user);
    await c.from('profiles').update({ banner_credit: null }).eq('id', user.user.id);
    await c.from('profiles').update({ banner_credit: FORGED }).eq('id', user.user.id);
    expect(await readCredit(user.user.id)).toEqual(real);
  });

  it('delete-own-profile then INSERT cannot carry a credit in', async () => {
    const c = await signedIn(user);
    const { data: before } = await supabaseAdmin.from('profiles').select('*').eq('id', user.user.id).single();
    // P1137: client-role DELETE on profiles is revoked, so the client half of this path is refused;
    // the INSERT guard is still exercised from a service-role-cleared row.
    const { error: delErr } = await c.from('profiles').delete().eq('id', user.user.id);
    expect(delErr?.code).toBe('42501');
    const { error: adminDelErr } = await supabaseAdmin.from('profiles').delete().eq('id', user.user.id);
    expect(adminDelErr).toBeNull();
    const row = { ...before, banner_credit: FORGED };
    const { error: insErr } = await c.from('profiles').insert(row);
    expect(insErr).toBeNull();
    expect(await readCredit(user.user.id)).toBeNull();
  });

  it('the service role writes it, the CHECK rejects a bad ink, and anon reads it via get_profile_by_id', async () => {
    const credit = { ...FORGED, artist: 'Gustav Klimt', sig: 'Klimt', ink: 'sepia' };
    const { error: bad } = await supabaseAdmin.from('profiles')
      .update({ banner_credit: { ...credit, ink: 'red; background:url(x)' } }).eq('id', user.user.id);
    expect(bad?.code).toBe('23514');

    const { error } = await supabaseAdmin.from('profiles').update({ banner_credit: credit }).eq('id', user.user.id);
    expect(error).toBeNull();
    const { data, error: rpcErr } = await freshClient().rpc('get_profile_by_id', { p_id: user.user.id });
    expect(rpcErr).toBeNull();
    expect((data as { banner_credit: unknown }).banner_credit).toEqual(credit);

    const { data: col, error: colErr } = await freshClient().from('profiles').select('banner_credit').eq('id', user.user.id).single();
    expect(colErr).toBeNull();
    expect(col!.banner_credit).toEqual(credit);
  });
});
