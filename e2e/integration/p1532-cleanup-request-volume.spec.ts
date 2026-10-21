/**
 * P1532 — deleting a test user must cost O(1) Supabase requests and provoke no errors.
 *
 * A request-volume assertion, not a behaviour one (decisions.md 2026-10-01 [process]): the old
 * cleanup deleted the user correctly, it just did it in 6 + 2k requests (k = FK blockers) and
 * learned each blocker by sending a delete it expected to fail. Each such delete returns 409
 * (SQLSTATE 23503) and writes a Postgres ERROR plus a gateway error line, which is the "many logs
 * for each deletion" the founder saw.
 *
 * The blocker here is a doc the user owns: clarity_docs.owner_id is ON DELETE NO ACTION and is not
 * in deleteTestUser's hand-kept pre-cleans, so only the catalog (or a provoked error) can find it.
 *
 * supabase-js resolves `fetch` late (`(...args) => fetch(...args)`), so wrapping the global counts
 * every request the helpers make, including the auth admin calls.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from '../helpers/test-user';
import { supabaseAdmin } from '../helpers/supabase-admin';

type Call = { method: string; path: string; status: number };

function recordRequests(): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await real(input, init);
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    calls.push({ method, path: new URL(href).pathname, status: res.status });
    return res;
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test.describe('P1532 cleanup request volume', () => {
  // This pins the DELETE path. Inside a Playwright run deleteTestUser would otherwise release the
  // user to the worker pool (one request too, but the auth user stays); e2e/integration/
  // p1532-user-pool.spec.ts pins that path.
  let previous: string | undefined;
  test.beforeAll(() => { previous = process.env.P1532_POOL; process.env.P1532_POOL = 'off'; });
  test.afterAll(() => {
    if (previous === undefined) delete process.env.P1532_POOL;
    else process.env.P1532_POOL = previous;
  });

  test('deleting one user with an FK blocker costs one request and no error responses', async () => {
    const user = await createTestUser({ name: 'P1532 Volume' });
    const { error: docError } = await supabaseAdmin.from('clarity_docs').insert({ owner_id: user.user.id });
    expect(docError, 'seeding the blocking doc').toBeNull();

    const rec = recordRequests();
    try {
      await deleteTestUser(user.user.id);
    } finally {
      rec.restore();
    }

    const errors = rec.calls.filter((c) => c.status >= 400);
    console.log(`[P1532] deleteTestUser: ${rec.calls.length} requests, ${errors.length} error responses`);
    for (const c of rec.calls) console.log(`[P1532]   ${c.status} ${c.method} ${c.path}`);

    // The user and the doc are really gone: a cheap delete that strands the user is no fix.
    const { data: still } = await supabaseAdmin.auth.admin.getUserById(user.user.id);
    expect(still?.user ?? null, 'auth user deleted').toBeNull();
    const { count } = await supabaseAdmin.from('clarity_docs').select('id', { count: 'exact', head: true }).eq('owner_id', user.user.id);
    expect(count, 'blocking doc deleted').toBe(0);

    expect(errors, 'no provoked 4xx/5xx on the normal cleanup path').toEqual([]);
    expect(rec.calls.length, 'requests to delete one user').toBeLessThanOrEqual(1);
  });
});
