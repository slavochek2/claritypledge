/**
 * @file e2e-namespace.ts
 * @description Which project and which users the e2e cleanup may touch. One home for both, read by
 * the helpers (e2e/helpers/test-user.ts), the sweeper (scripts/sweep-e2e-test-users.ts) and, as SQL,
 * by the e2e_* SQL functions (supabase/migrations/*_p1532_*.sql, *_p1557_*.sql), which carry their own
 * copies of both values because a migration cannot import this file: `grep -l ayibkeoyukulbsjpxgaw
 * supabase/migrations/*p1532*` and `grep -l 'e2e-test-\[0-9\]' supabase/migrations/*p1532*` find
 * them. Change every copy together, in a new migration.
 */

// The TEST-target decision lives in scripts/lib/test-target.mjs (P1557): one exact allowlist of
// origins (hosted TEST projects plus SELFHOSTED_TEST_ORIGIN), shared with the .mjs scripts.
export {
  TEST_PROJECT_REF,
  TEST_PROJECT_REFS,
  SELFHOSTED_TEST_REF,
  isTestProjectUrl,
  isHostedTestUrl,
  testRefForUrl,
  testTargetConfigError,
} from '../../scripts/lib/test-target.mjs';
import { isHostedTestUrl as hostedTestUrl } from '../../scripts/lib/test-target.mjs'; // local use; re-exported above

/**
 * P1557: raw SQL goes through the hosted Management API, which the self-hosted server does not have
 * (and must not grow: a public SQL endpoint was reviewed and rejected). A spec that needs it skips
 * on any other target, by name, and runs on hosted TEST via `npm run test:e2e:hosted-sql`.
 */
export const HOSTED_SQL_ONLY = 'raw SQL runs only on hosted TEST (Management API): npm run test:e2e:hosted-sql';
export function notHostedSqlTarget(): boolean {
  return !hostedTestUrl(process.env.VITE_SUPABASE_URL);
}

/** Mirrors generateTestEmail() in e2e/helpers/test-user.ts. */
export const E2E_EMAIL = /^e2e-test-\d+-\d+@gmail\.com$/;

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
