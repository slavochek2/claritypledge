/**
 * @file p1057-verify.spec.ts
 * @description /verify UAT scenarios for P1057 that no existing suite covers.
 *
 * P1057 revoked SELECT on `clarity_sessions.code` and moved every code-keyed read onto
 * SECURITY DEFINER RPCs. Most of the resulting user surface is already driven by existing
 * suites (p272 create+join, p666/p703 two-party, p745/p765 invite banner, p406 practice
 * rooms). Two paths are not, and they are exactly the two where behaviour MOVED rather than
 * stayed put:
 *
 *   UAT-3  An unknown code. Before P1057 this was a `.eq('code', …)` returning zero rows.
 *          Now it is `get_session_by_code` returning an empty set. If the RPC were missing,
 *          mis-granted, or the client mis-unwrapped its array return, the user would see a
 *          permission error or a hang instead of "Session not found or already full".
 *
 *   UAT-4  A stale room. The grace-period / ended-session filter used to run in JS inside
 *          `getActiveSessionByCode` (api.ts) and now runs as SQL inside
 *          `get_active_session_by_code`. Same rule, different executor — so it needs to be
 *          re-proven, not assumed to have survived the port.
 *
 * The console assertion in UAT-3 is the real point of it. A 42501 is what a MISSED `code`
 * projection looks like at runtime, and it does not necessarily change the rendered text —
 * a swallowed error leaves the same "not found" state as a legitimately absent room.
 * Asserting the message alone would pass on a broken build.
 *
 * NOTE on `?skipMicCheck=true`: the join handler gates on mic permission BEFORE it ever
 * calls joinClaritySession (clarity-live-page.tsx:2898). Without the flag the test would
 * assert against the mic dialog and never reach the read under test.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** Codes are 6 chars, uppercase — matches generateSessionCode(). */
function makeCode(prefix: string) {
  return (prefix + Math.random().toString(36).slice(2).toUpperCase()).slice(0, 6);
}

test.describe('P1057 /verify: code-keyed reads through the UI', () => {
  const createdIds: string[] = [];

  test.afterAll(async () => {
    if (createdIds.length) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdIds);
    }
  });

  test('UAT-3: an unknown room code is refused as not-found, not as a permission error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    // 'ZZZZZZ' is a well-formed code that no seeded room uses.
    await page.goto('/live/ZZZZZZ?skipMicCheck=true');

    // The join screen renders for ANY well-formed code — existence is only checked on submit.
    await expect(page.getByRole('heading', { name: 'Join Clarity Session' })).toBeVisible({ timeout: 15000 });

    await page.getByPlaceholder('Enter your name').fill('P1057 unknown-code canary');
    await page.getByRole('button', { name: 'Join as Guest' }).click();

    // The read happens here. It must come back EMPTY (not-found), never REFUSED (42501).
    await expect(page.getByText(/Session not found or already full/i)).toBeVisible({ timeout: 20000 });

    const denied = errors.filter((e) => /42501|permission denied/i.test(e));
    expect(
      denied,
      'An unknown code produced a permission error. That is the signature of a code ' +
        'projection P1057 missed — the read is being refused, not returning empty. ' +
        `Errors: ${denied.join(' | ')}`,
    ).toHaveLength(0);
  });

  test('UAT-4: the grace-period filter survived the port from JS to SQL', async ({ page }) => {
    // last_activity_at well outside the 120s grace window baked into
    // get_active_session_by_code. Null target so anon row visibility is not the variable
    // under test — the ONLY reason this room should be unreachable is staleness.
    const staleCode = makeCode('S');
    const { data: stale, error: staleErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: staleCode,
        creator_name: 'P1057 stale-room canary',
        target_listener_id: null,
        state: {},
        live_state: {},
        last_activity_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    expect(staleErr, 'seed must succeed').toBeNull();
    createdIds.push(stale!.id);

    // THE CONTROL. A fresh room seeded the identical way must be reachable. Without it,
    // "the stale room did not come back" proves nothing — a broken RPC, a missing grant, or
    // a typo in the code name would produce the same negative result and read as a pass.
    const freshCode = makeCode('F');
    const { data: fresh, error: freshErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: freshCode,
        creator_name: 'P1057 fresh-room control',
        target_listener_id: null,
        state: {},
        live_state: {},
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(freshErr, 'control seed must succeed').toBeNull();
    createdIds.push(fresh!.id);

    // Issue both calls from the PAGE, so they carry the anon key over a browser origin and
    // the column grants under test actually apply. URL/key are passed in as arguments —
    // reading import.meta inside an evaluated function is not serializable.
    const result = await page.evaluate(
      async ({ url, key, staleC, freshC }) => {
        async function call(code: string) {
          const r = await fetch(`${url}/rest/v1/rpc/get_active_session_by_code`, {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_code: code }),
          });
          return { status: r.status, body: await r.json() };
        }
        return { stale: await call(staleC), fresh: await call(freshC) };
      },
      { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, staleC: staleCode, freshC: freshCode },
    );

    // Control first — if this fails, the stale assertion below is meaningless.
    expect(result.fresh.status, 'control: a fresh room must be readable').toBe(200);
    expect(
      Array.isArray(result.fresh.body) ? result.fresh.body.length : 0,
      'control: a fresh room must come back from get_active_session_by_code — if it does ' +
        'not, this test cannot distinguish "filtered as stale" from "the RPC is broken"',
    ).toBe(1);

    // The actual assertion: the ported SQL filter still excludes the stale room.
    expect(result.stale.status, 'stale room must not error, just return empty').toBe(200);
    expect(
      Array.isArray(result.stale.body) ? result.stale.body.length : -1,
      'a room stale by an hour was returned by get_active_session_by_code — the grace-period ' +
        'filter did not survive the port from JS (api.ts) to SQL',
    ).toBe(0);

    // And the control row must not carry `code` — the RPC declares 21 columns without it.
    expect(
      Object.keys(result.fresh.body[0]),
      'get_active_session_by_code handed the room code back to an anon caller',
    ).not.toContain('code');
  });
});
