/**
 * @file e2e-namespace.ts
 * @description Which project and which users the e2e cleanup may touch. One home for both, read by
 * the helpers (e2e/helpers/test-user.ts), the sweeper (scripts/sweep-e2e-test-users.ts) and, as SQL,
 * by the e2e_* SQL functions (supabase/migrations/*_p1532_*.sql), which carry their own copies of
 * both values because a migration cannot import this file: `grep -l ayibkeoyukulbsjpxgaw
 * supabase/migrations/*p1532*` and `grep -l 'e2e-test-\[0-9\]' supabase/migrations/*p1532*` find
 * them. Change every copy together, in a new migration.
 */

// P1530 moved TEST to a new project; the old ref stays allowed until that project is paused.
export const TEST_PROJECT_REF = 'ayibkeoyukulbsjpxgaw';
export const TEST_PROJECT_REFS: readonly string[] = [TEST_PROJECT_REF, 'gfjctyxqlwexxwsmkakq'];

/** Mirrors generateTestEmail() in e2e/helpers/test-user.ts. */
export const E2E_EMAIL = /^e2e-test-\d+-\d+@gmail\.com$/;

/** Exact host match, not a substring: a URL that merely contains the ref must not pass. */
export function isTestProjectUrl(url: string | undefined): boolean {
  try {
    const { hostname } = new URL(url ?? '');
    return TEST_PROJECT_REFS.some((ref) => hostname === `${ref}.supabase.co`);
  } catch {
    return false;
  }
}

/**
 * A Supabase running on this machine (`supabase start`, API on port 54321): disposable, never
 * production. The port is part of the test, so a local tunnel to a remote project does not pass.
 */
export function isLocalSupabaseUrl(url: string | undefined): boolean {
  try {
    const u = new URL(url ?? '');
    return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === '54321';
  } catch {
    return false;
  }
}
