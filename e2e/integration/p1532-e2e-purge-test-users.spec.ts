/**
 * Integration test: 20261021120000_p1532_e2e_purge_test_users.sql (TEST project).
 *
 * What the migration must guarantee:
 *   1. A batch of e2e users, each with an FK blocker the old hand-kept pre-cleans never knew about,
 *      is deleted in ONE request with no error response (the old path learned blockers from 409s).
 *   2. It refuses anything outside the e2e namespace: such ids come back `refused`, untouched.
 *   3. It refuses on any project but test. The guard is `_e2e_purge_allowed(claims)`; both answers
 *      are exercised here because a prod-ref JWT cannot be minted from this machine (no JWT secret),
 *      and the entry point's own call proves the test-ref answer is the one that runs.
 *   4. The batch is bounded (more than 200 ids is rejected before anything is read).
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import { createTestUser, deleteTestUser, deleteTestUsers, generateTestEmail, type TestUser } from '../helpers/test-user';

// Module-local service client: specs that sign in on the shared supabaseAdmin swap its JWT.
const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type PurgeResult = {
  deleted: string[];
  refused: string[];
  missing: string[];
  failed: Array<{ id: string; sqlstate: string; message: string }>;
  deferred: string[];
  dependent_rows: number;
};

/** Read-only SQL on the test project (scripts/supabase-readonly-sql.py: a read-only token). */
function readOnlySql<T>(sql: string): T[] {
  return JSON.parse(execFileSync('python3', ['scripts/supabase-readonly-sql.py', '--env', 'test', sql], { encoding: 'utf8' })) as T[];
}

function recordRequests() {
  const calls: Array<{ path: string; status: number }> = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await real(input, init);
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ path: new URL(href).pathname, status: res.status });
    return res;
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

async function userExists(id: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(id);
  return !!data?.user;
}

test.describe('P1532 migration: e2e_purge_test_users', () => {
  test('the project guard allows only the test project ref', async () => {
    const ask = async (claims: unknown) => (await admin.rpc('_e2e_purge_allowed', { p_claims: claims })).data;
    expect(await ask({ ref: 'ayibkeoyukulbsjpxgaw', role: 'service_role' })).toBe(true);
    expect(await ask({ ref: 'gfjctyxqlwexxwsmkakq', role: 'service_role' })).toBe(true); // old test, until paused
    expect(await ask({ ref: 'besjtuodziykmjidubzw', role: 'service_role' })).toBe(false); // prod
    expect(await ask({ ref: 'ayibkeoyukulbsjpxgaw', role: 'anon' })).toBe(false); // the public anon key
    expect(await ask({ role: 'service_role' })).toBe(false);
    expect(await ask(null)).toBe(false);
  });

  test('every e2e entry function checks the guard before anything else (live catalog)', () => {
    // A prod-ref JWT cannot be minted here, so the refusal path of each entry function is pinned
    // structurally: its body must open with the guard. The control is _e2e_purge_dependents, which
    // has no guard by design: if the check cannot tell it apart, the check is blind.
    const rows = readOnlySql<{ proname: string; guarded: boolean }>(`
      SELECT p.proname,
             position('IF NOT public._e2e_purge_allowed(' IN p.prosrc) > 0
               AND position('IF NOT public._e2e_purge_allowed(' IN p.prosrc)
                   < coalesce(nullif(position('DELETE' IN p.prosrc), 0), 1000000)
               AND position('IF NOT public._e2e_purge_allowed(' IN p.prosrc)
                   < coalesce(nullif(position('UPDATE' IN p.prosrc), 0), 1000000) AS guarded
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND (p.proname LIKE 'e2e\\_%' OR p.proname = '_e2e_purge_dependents')
       ORDER BY 1`);
    const byName = Object.fromEntries(rows.map((r) => [r.proname, r.guarded]));
    expect(byName).toEqual({
      _e2e_purge_dependents: false, // control
      e2e_claim_test_user: true,
      e2e_purge_test_users: true,
      e2e_release_test_user: true,
      e2e_test_user_counts: true,
    });
  });

  test('a row that also belongs to a non-e2e user is never deleted; the rest of the batch still is', async () => {
    const outsider = await createTestUser({ name: 'P1532 Host', email: `p1532-host-${Date.now()}@claritypledge-test.com` });
    const joiner = await createTestUser({ name: 'P1532 Joiner' });
    const bystander = await createTestUser({ name: 'P1532 Bystander' });
    const code = `p1532${Date.now()}`;
    const { data: session, error: seedError } = await admin.from('clarity_sessions')
      .insert({ code, creator_name: 'P1532 Host', creator_profile_id: outsider.user.id, joiner_profile_id: joiner.user.id })
      .select('id').single();
    expect(seedError).toBeNull();
    try {
      const { data, error } = await admin.rpc('e2e_purge_test_users', { p_user_ids: [bystander.user.id, joiner.user.id] });
      expect(error).toBeNull();
      const r = data as PurgeResult;
      expect(r.deleted).toEqual([bystander.user.id]);
      expect(r.failed.map((f) => f.id)).toEqual([joiner.user.id]);
      expect(r.failed[0]?.message).toMatch(/outside the e2e namespace/);
      const { count } = await admin.from('clarity_sessions').select('id', { count: 'exact', head: true }).eq('id', session!.id);
      expect(count, "the non-e2e host's session survives").toBe(1);
    } finally {
      await admin.from('clarity_sessions').delete().eq('id', session!.id);
      await deleteTestUsers([joiner.user.id, outsider.user.id, bystander.user.id]);
    }
  });

  test('the sweep branch (p_older_than) runs and touches nobody newer than the cutoff', async () => {
    const { data, error } = await admin.rpc('e2e_purge_test_users', { p_older_than: '1000 years', p_limit: 5 });
    expect(error).toBeNull();
    expect(data as PurgeResult).toMatchObject({ deleted: [], failed: [], deferred: [] });
  });

  test('anon cannot call it', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.rpc('e2e_purge_test_users', { p_user_ids: [] });
    expect(error, 'anon is refused').not.toBeNull();
  });

  test('a batch of users with FK blockers is deleted in one request, with no error response', async () => {
    const users: TestUser[] = [];
    for (let i = 0; i < 3; i++) users.push(await createTestUser({ name: `P1532 Batch ${i}` }));
    const ids = users.map((u) => u.user.id);
    // clarity_docs.owner_id is ON DELETE NO ACTION: it blocks the profile delete.
    const { error: seedError } = await admin.from('clarity_docs').insert(ids.map((owner_id) => ({ owner_id })));
    expect(seedError).toBeNull();

    const rec = recordRequests();
    let result: PurgeResult;
    try {
      const { data, error } = await admin.rpc('e2e_purge_test_users', { p_user_ids: ids });
      expect(error).toBeNull();
      result = data as PurgeResult;
    } finally {
      rec.restore();
    }

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls.filter((c) => c.status >= 400)).toEqual([]);
    expect([...result.deleted].sort()).toEqual([...ids].sort());
    expect(result.failed).toEqual([]);
    expect(result.dependent_rows).toBeGreaterThanOrEqual(3); // the three docs, deleted first
    for (const id of ids) expect(await userExists(id), `auth user ${id} gone`).toBe(false);
    const { count } = await admin.from('clarity_docs').select('id', { count: 'exact', head: true }).in('owner_id', ids);
    expect(count).toBe(0);
    const { count: profiles } = await admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids);
    expect(profiles).toBe(0);
  });

  test('a user outside the e2e namespace is refused and left untouched', async () => {
    const outsider = await createTestUser({ name: 'P1532 Outsider', email: `p1532-outsider-${Date.now()}@claritypledge-test.com` });
    const inside = await createTestUser({ name: 'P1532 Inside', email: generateTestEmail() });
    try {
      const unknown = '00000000-0000-4000-8000-000000001532';
      const { data, error } = await admin.rpc('e2e_purge_test_users', { p_user_ids: [outsider.user.id, inside.user.id, unknown] });
      expect(error).toBeNull();
      const r = data as PurgeResult;
      expect(r.refused).toEqual([outsider.user.id]);
      expect(r.deleted).toEqual([inside.user.id]);
      expect(r.missing).toEqual([unknown]);
      expect(await userExists(outsider.user.id), 'refused user still exists').toBe(true);
    } finally {
      await deleteTestUser(outsider.user.id); // the per-user fallback path owns non-namespace users
    }
    expect(await userExists(outsider.user.id)).toBe(false);
  });

  test('more than 200 ids is rejected before anything is read', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const { error } = await admin.rpc('e2e_purge_test_users', { p_user_ids: ids });
    expect(error?.message ?? '').toMatch(/at most 200/);
  });

  test('a sweep call needs a bound: no ids and no age is rejected', async () => {
    const { error } = await admin.rpc('e2e_purge_test_users', {});
    expect(error?.message ?? '').toMatch(/p_user_ids or p_older_than/);
  });
});
