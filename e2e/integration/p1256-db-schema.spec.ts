/**
 * P1256 migration verification.
 *
 * Two migrations, and they need different kinds of proof:
 *
 *  - 20260907130000 replaced a `interval '5 hours'` literal duplicated across four
 *    room RPCs with one `public.event_grace_interval()`. The thing worth asserting is
 *    the VALUE, because that value is half of a cross-language pair —
 *    src/tests/p1114-grace-hours-sync.test.ts pins the TS half at 12, and nothing
 *    else pins this half. That is precisely the gap P1114 Decision 4 documented and
 *    could not close ("no test in this repo can read a migration file's PL/pgSQL body
 *    as data"); calling the function closes it, because the function IS now the SQL
 *    definition rather than a literal buried in four bodies.
 *
 *  - 20260907140000 added public.dispatch_event_emails_tick(). It is asserted only
 *    for EXISTENCE and INACCESSIBILITY, never invoked: calling it fires a real
 *    net.http_post at the dispatcher, which sends real email.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ANON = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
);

test.describe('P1256: event grace interval + dispatch cron', () => {
  test('event_grace_interval() exists and returns 12 hours', async () => {
    const { data, error } = await supabaseAdmin.rpc('event_grace_interval');
    expect(error).toBeNull();
    // Postgres renders an hours-only interval as HH:MM:SS over PostgREST.
    expect(data).toBe('12:00:00');
  });

  test('event_grace_interval() agrees with EVENT_GRACE_HOURS — the cross-language pair', async () => {
    // Read the constant out of the SOURCE TEXT, not by importing the module:
    // events-service-real.ts reaches for `import.meta.env` at module scope, which is
    // undefined under Playwright's runner. A regex over the file needs no bundler and
    // still fails loudly if the declaration is renamed or reshaped.
    const src = readFileSync(
      fileURLToPath(new URL('../../src/app/data/events-service-real.ts', import.meta.url)),
      'utf8',
    );
    const m = src.match(/^export const EVENT_GRACE_HOURS = (\d+);/m);
    expect(m, 'EVENT_GRACE_HOURS declaration not found — did it get renamed?').not.toBeNull();
    const tsHours = Number(m![1]);

    const { data } = await supabaseAdmin.rpc('event_grace_interval');
    expect(data).toBe(`${String(tsHours).padStart(2, '0')}:00:00`);
  });

  /**
   * DELIBERATELY NOT TESTED HERE: that the four room RPC bodies stopped carrying
   * their own `interval '5 hours'` literal. A first draft asserted it via an
   * `exec_sql_readonly` RPC, which does not exist on this project, so the test
   * SKIPPED on every run — coverage that reads as present and is not. It was
   * removed rather than left skipping.
   *
   * It was instead verified once, by hand, against pg_get_functiondef() through the
   * Management API on both projects — and that check earned its keep: it found a
   * stale `set_room_opt_in(uuid, boolean)` overload alive on test with the old 5h
   * boundary, which 20260907150000 now drops. Note that finding required comparing
   * full SIGNATURES; a name-level comparison showed the two environments as
   * identical.
   *
   * The value assertions above are the durable guard: event_grace_interval() is now
   * the single SQL definition, so pinning its value pins what those four bodies read.
   */
  test('dispatch_event_emails_tick() exists but is unreachable by anon', async () => {
    // NEVER invoke it with admin: a successful call posts to the dispatcher, which
    // sends real email to real RSVPs. Existence is checked through the failure MODE
    // of the anon call instead.
    //
    // 42501, not PGRST202. Measured, not assumed — the first draft of this test
    // asserted PGRST202 and failed. PostgREST still exposes the function in its
    // schema cache (so it is NOT "not found"); what stops the call is the REVOKE,
    // and Postgres answers insufficient_privilege. That distinction is the point:
    // 42501 proves BOTH halves at once — the function exists, and anon cannot run it.
    // A PGRST202 here would be ambiguous, since it is also what a missing function
    // returns, i.e. what an unapplied migration looks like.
    const { error } = await ANON.rpc('dispatch_event_emails_tick');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});
